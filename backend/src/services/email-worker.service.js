const crypto = require('crypto');
const EmailJob = require('../models/EmailJob');
const EmailSender = require('../models/EmailSender');
const WorkerLease = require('../models/WorkerLease');
const { Notification, User, Registration, Event, Team, Pass } = require('../models');
const { getSenders, getEmailTransporter, getEmailProvider } = require('../config/email');
const { sendEmail, renderEmail, emailLifetimeFilter } = require('./email.service');
const { createNotification } = require('./notification.service');

const bounded = (value, fallback, min, max) => Number.isFinite(Number(value)) ? Math.max(min, Math.min(max, Number(value))) : fallback;
const settings=()=>({provider:'smtp',intervalMs:bounded(process.env.SMTP_SENDER_INTERVAL_SECONDS,1,1,3600)*1000,dailyLimit:bounded(process.env.SMTP_DAILY_LIMIT,100,1,100000),batchLimit:10});

async function prepareNotifications() {
  const rows = await Notification.find({ emailStatus: 'queued' }).sort({ createdAt: 1 }).limit(100).lean();
  for (const row of rows) {
    const user = await User.findOne({ _id: row.userId, isActive: true }).select('email').lean();
    if (user) await sendEmail({ dedupeKey: 'notification:' + row._id, to: user.email, subject: row.title,
      text: row.message, link: row.link || '/dashboard', kind: row.type, notificationId: row._id,
      registrationId: row.registrationId, eventId: row.eventId, teamId: row.teamId, audience: row.audience, recipientId: row.userId,
      passId: row.passId, expiresAt: new Date(row.createdAt.getTime() + 7 * 86400000) });
    await Notification.updateOne({ _id: row._id }, { $set: { emailStatus: user ? 'scheduled' : 'disabled' } });
  }
}

async function recoverPassesAndReminders() {
  // Recover approval requests interrupted after confirmation but before all passes were issued.
  const registrations = await Registration.find({ status: { $in: ['confirmed', 'checked_in'] }, passesIssuedAt: { $exists: false } }).sort({ passRecoveryAttemptedAt: 1, _id: 1 }).limit(10).maxTimeMS(5000);
  for (const registration of registrations) {
    // Rotate unsuccessful legacy records behind registrations not yet tried.
    // One malformed batch must not prevent another attendee's pass recovery.
    await Registration.updateOne({ _id: registration._id, status: { $in: ['confirmed', 'checked_in'] }, passesIssuedAt: { $exists: false } }, { $set: { passRecoveryAttemptedAt: new Date() } });
    const event = await Event.findById(registration.eventId);
    if (!event || event.status === 'cancelled' || new Date(event.eventDate).getTime() + 86400000 <= Date.now()) {
      await Registration.updateOne({ _id: registration._id }, { $set: { passesIssuedAt: new Date() } });
      continue;
    }
    const team = registration.teamId ? await Team.findById(registration.teamId).lean() : null;
    try {
      await require('./pass.service').issuePasses(registration, event, team);
    } catch (error) {
      // A participant may cancel after the recovery query. Other queued mail
      // must still be processed; the issuer already prevents invalid passes.
      if (error.statusCode !== 409) throw error;
    }
  }
  const events = await Event.find({ status: { $in: ['published', 'closed'] }, eventDate: { $gt: new Date(), $lte: new Date(Date.now() + 24 * 3600000) } }).limit(30).lean().maxTimeMS(5000);
  for (const event of events) {
    const passes = await Pass.find({ eventId: event._id, status: 'issued', checkInStatus: 'pending', reminderForDate: { $ne: event.eventDate } }).limit(50).lean().maxTimeMS(5000);
    for (const pass of passes) {
      await createNotification({ userId: pass.userId, type: 'event_reminder', title: 'Coming up: ' + event.name,
        message: 'Your event starts within 24 hours. Check the event details below and bring your entry QR and photo ID.',
        link: '/dashboard/passes', passId: pass._id, dedupeKey: 'reminder:' + pass._id + ':' + event.eventDate.toISOString() });
      await Pass.updateOne({ _id: pass._id }, { $set: { reminderForDate: event.eventDate } });
    }
  }
}

async function processEmailQueue({ transportFor = getEmailTransporter, prepare = true, targetDedupeKey, targetDedupeKeys } = {}) {
  const started = Date.now(), owner = crypto.randomUUID(), now = new Date();
  await WorkerLease.updateOne({ _id: 'email' }, { $setOnInsert: { until: new Date(0) } }, { upsert: true });
  const lease = await WorkerLease.findOneAndUpdate({ _id: 'email', until: { $lte: now } }, { $set: { owner, until: new Date(Date.now() + 180000), lastStartedAt: now } }, { new: true });
  if (!lease) return { state: 'busy', sent: 0 };
  let sent = 0, reason = 'QUEUE_EMPTY', result = { state: 'failed', sent: 0, reason: 'WORKER_ERROR' };
  const finish = value => { result = value; return value; };
  try {
    const accounts = getSenders();
    if (!accounts.length) return finish({ state: 'credentials_missing', sent,
      reason: getEmailProvider() === 'smtp' ? 'SMTP_CONFIGURATION_MISSING' : 'EMAIL_DISABLED' });
    for (const account of accounts) await EmailSender.updateOne({ _id: account.id }, { $setOnInsert: { _id: account.id } }, { upsert: true });
    if (await EmailSender.exists({ _id: { $in: accounts.map(account => account.id) }, paused: true })) return finish({ state: 'sender_paused', sent, reason: 'SENDER_AUTH_OR_POLICY' });
    const config = settings();
    // These targets originate only from server-side request context. The worker
    // HTTP endpoint never forwards client-supplied filters.
    const targetFilter = targetDedupeKey ? { dedupeKey: targetDedupeKey, kind: 'password_reset' }
      : Array.isArray(targetDedupeKeys) ? { dedupeKey: { $in: targetDedupeKeys.slice(0, 200) } } : {};
    await EmailJob.updateMany({ status: 'processing', leaseUntil: { $lte: new Date() } }, { $set: { status: 'queued', availableAt: new Date() } });
    await EmailJob.updateMany({ status: 'queued', expiresAt: { $lte: new Date() } }, { $set: { status: 'cancelled', lastError: 'EXPIRED' }, $unset: { text: 1, link: 1 } });
    for (let i = 0; i < (targetDedupeKey ? 1 : config.batchLimit) && Date.now() - started < 20000; i++) {
      if (!await EmailJob.exists({ status: 'queued', availableAt: { $lte: new Date() }, ...emailLifetimeFilter(), ...targetFilter })) break;
      const cutoff = new Date(Date.now() - 86400000);
      await EmailSender.updateMany({}, { $pull: { reservations: { $lte: cutoff } } });
      const sender = await EmailSender.findOneAndUpdate({ _id: { $in: accounts.map(a => a.id) }, paused: false,
        nextAvailableAt: { $lte: new Date() }, $expr: { $lt: [{ $size: '$reservations' }, config.dailyLimit] }
      }, { $set: { lastUsedAt: new Date(), nextAvailableAt: new Date(Date.now() + config.intervalMs) }, $push: { reservations: new Date() } }, { sort: { lastUsedAt: 1, _id: 1 }, new: true });
      if (!sender) {
        reason = 'SENDER_COOLDOWN_OR_LIMIT';
        // Briefly wait for normal one-second SMTP pacing. Exhausted
        // daily quotas stay queued instead of switching identities.
        if (config.provider === 'smtp') {
          const nextSender = await EmailSender.findOne({ _id: { $in: accounts.map(a => a.id) }, paused: false,
            $expr: { $lt: [{ $size: '$reservations' }, config.dailyLimit] } }).sort({ nextAvailableAt: 1 }).lean();
          const waitMs = nextSender ? Math.max(1, nextSender.nextAvailableAt.getTime() - Date.now()) : 0;
          if (waitMs > 0 && waitMs <= 1000 && Date.now() - started + waitMs < 20000) {
            await new Promise(resolve => setTimeout(resolve, waitMs));
            i--;
            continue;
          }
        }
        break;
      }
      const job = await EmailJob.findOneAndUpdate({ status: 'queued', availableAt: { $lte: new Date() }, ...emailLifetimeFilter(), ...targetFilter },
        { $set: { status: 'processing', leaseUntil: new Date(Date.now() + 180000), sender: sender._id }, $inc: { attempts: 1 } },
        { sort: { priority: -1, createdAt: 1 }, new: true }).select('+text +link');
      if (!job) break;
      try {
        const message = await renderEmail(job);
        if (!message || (job.kind === 'event_reminder' && job.passId && await Pass.exists({ _id: job.passId, checkInStatus: 'checked_in' }))) {
          await EmailJob.updateOne({ _id: job._id }, { $set: { status: 'cancelled', lastError: 'NO_LONGER_APPLICABLE' }, $unset: { text: 1, link: 1 } });
          if (job.notificationId) await Notification.updateOne({ _id: job.notificationId }, { $set: { emailStatus: 'disabled' } });
          continue;
        }
        const account = accounts.find(a => a.id === sender._id);
        const result = await transportFor(account).sendMail({ ...message, from: { name: process.env.BRAND_NAME || 'EventFlow', address: account.email },
          ...(account.replyTo ? { replyTo: account.replyTo } : {}), messageId: '<' + job._id + '@' + account.email.split('@')[1] + '>' });
        if (!result.accepted?.length) { const error = new Error('SMTP_REJECTED'); error.code = 'EENVELOPE'; throw error; }
        await EmailJob.updateOne({ _id: job._id }, { $set: { status: 'sent', sentAt: new Date(), lastError: null }, $unset: { text: 1, link: 1, leaseUntil: 1 } });
        if (job.notificationId) await Notification.updateOne({ _id: job.notificationId }, { $set: { emailStatus: 'sent', emailAttempts: job.attempts } });
        sent++;
        reason = 'DELIVERED';
      } catch (error) {
        // Do not work around provider policy/quota/auth blocks by switching identities.
        const blocked = error.code === 'EAUTH' || /5\.7\.|4\.7\.|quota|daily.*limit|rate.*limit/i.test(error.response || '');
        const permanent = Number(error.responseCode) >= 500 && !blocked;
        const lastError = blocked ? 'SENDER_AUTH_OR_POLICY' : permanent ? 'RECIPIENT_REJECTED' : 'SMTP_TRANSIENT';
        reason = lastError;
        if (blocked) await EmailSender.updateOne({ _id: sender._id }, { $set: { paused: true, lastError } });
        const failed = permanent || job.attempts >= 5;
        await EmailJob.updateOne({ _id: job._id }, { $set: { status: failed ? 'failed' : 'queued', lastError, availableAt: new Date(Date.now() + Math.min(3600000, 60000 * 2 ** job.attempts)) }, $unset: { leaseUntil: 1 } });
        if (job.notificationId) await Notification.updateOne({ _id: job.notificationId }, { $set: { emailStatus: failed ? 'failed' : 'scheduled', emailAttempts: job.attempts } });
        break;
      }
    }
    return finish({ state: 'processed', sent, reason });
  } finally {
    await WorkerLease.updateOne({ _id: 'email', owner }, { $set: { until: new Date(0), lastFinishedAt: new Date(), lastResult: result } });
  }
}
module.exports = { processEmailQueue, prepareNotifications, recoverPassesAndReminders, settings };
