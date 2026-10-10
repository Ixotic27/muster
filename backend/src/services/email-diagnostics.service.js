const EmailJob = require('../models/EmailJob');
const EmailSender = require('../models/EmailSender');
const WorkerLease = require('../models/WorkerLease');
const Notification = require('../models/Notification');
const { getSenders, getEmailProvider } = require('../config/email');
const { settings } = require('./email-worker.service');
const { emailLifetimeFilter } = require('./email.service');

// Operational metadata only: no recipient, body, subject, token, or credential.
async function emailQueueMetadata() {
  const now = new Date();
  const [counts, ready, backoff, expired, nextRetry, queuedNotifications, senders, heartbeat] = await Promise.all([
    EmailJob.aggregate([{ $group: { _id: '$status', count: { $sum: 1 }, oldest: { $min: '$createdAt' } } }]).option({ maxTimeMS: 5000 }),
    EmailJob.countDocuments({ status: 'queued', availableAt: { $lte: now }, ...emailLifetimeFilter(now) }).maxTimeMS(5000),
    EmailJob.countDocuments({ status: 'queued', availableAt: { $gt: now }, ...emailLifetimeFilter(now) }).maxTimeMS(5000),
    EmailJob.countDocuments({ status: 'queued', expiresAt: { $lte: now } }).maxTimeMS(5000),
    EmailJob.findOne({ status: 'queued', availableAt: { $gt: now }, ...emailLifetimeFilter(now) }).sort({ availableAt: 1 }).select('availableAt').lean().maxTimeMS(5000),
    Notification.countDocuments({ emailStatus: 'queued' }).maxTimeMS(5000),
    EmailSender.find().select('_id paused lastError lastUsedAt nextAvailableAt reservations').lean().maxTimeMS(5000),
    WorkerLease.findById('email').select('-owner').lean().maxTimeMS(5000)
  ]);
  const config = settings();
  const configuredSenders = getSenders().map(sender => sender.id);
  const senderMetadata = senders.map(({ reservations = [], ...sender }) => ({ ...sender,
    usedLast24Hours: reservations.filter(time => time > new Date(now.getTime() - 86400000)).length }));
  const configured = senderMetadata.filter(sender => configuredSenders.includes(sender._id));
  const busy = Boolean(heartbeat?.until > now);
  const eligible = configured.filter(sender => !sender.paused && sender.nextAvailableAt <= now && sender.usedLast24Hours < config.dailyLimit);
  let reason = 'QUEUE_EMPTY';
  if (!configuredSenders.length) reason = getEmailProvider() === 'smtp' ? 'SMTP_CONFIGURATION_MISSING' : 'EMAIL_DISABLED';
  else if (configured.some(sender => sender.paused)) reason = 'SENDER_AUTH_OR_POLICY';
  else if (busy) reason = 'WORKER_BUSY';
  else if (ready && configured.length && !eligible.length) reason = 'SENDER_COOLDOWN_OR_LIMIT';
  else if (ready || queuedNotifications) reason = 'WAITING_FOR_SCHEDULER';
  else if (backoff) reason = 'SMTP_RETRY_BACKOFF';
  else if (expired) reason = 'EXPIRED_JOBS_AWAITING_CLEANUP';
  const schedulerConfigured = Boolean(process.env.EMAIL_WORKER_SECRET);
  const lastRunAt = heartbeat?.lastFinishedAt || heartbeat?.lastStartedAt;
  // Scheduled triggers are best effort. Report stale workers without
  // promising an inbox delivery time.
  const health = !schedulerConfigured ? 'not_configured' : busy ? 'running' : !lastRunAt ? 'not_observed'
    : now.getTime() - new Date(lastRunAt).getTime() > 45 * 60000 ? 'stale' : 'recent';
  const cooldowns = configured.filter(sender => !sender.paused && sender.usedLast24Hours < config.dailyLimit && sender.nextAvailableAt > now).map(sender => sender.nextAvailableAt);
  // Eligibility describes cooldown/backoff only; the next scheduler trigger
  // is not predictable and this is never a promised delivery timestamp.
  const nextEligibleAt = reason === 'SMTP_RETRY_BACKOFF' ? nextRetry?.availableAt
    : reason === 'SENDER_COOLDOWN_OR_LIMIT' && cooldowns.length ? new Date(Math.min(...cooldowns.map(date => date.getTime()))) : null;
  return { checkedAt: now, configuredSenders, counts, ready, backoff, expired, queuedNotifications,
    senders: senderMetadata, heartbeat, schedulerConfigured, health, reason, nextEligibleAt: nextEligibleAt || null,
    cadence: { requestedMinutes: 5, staleAfterMinutes: 45, guarantee: 'best_effort' } };
}
module.exports = { emailQueueMetadata };
