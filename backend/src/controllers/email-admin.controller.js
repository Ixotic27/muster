const EmailJob = require('../models/EmailJob');
const EmailSender = require('../models/EmailSender');
const { AdminAction, Notification } = require('../models');
const { getSenders, getEmailProvider } = require('../config/email');
const { settings } = require('../services/email-worker.service');
const { emailQueueMetadata } = require('../services/email-diagnostics.service');
async function status(req, res) {
  const [counts, jobs, states, scheduler] = await Promise.all([
    EmailJob.aggregate([{ $group: { _id: '$status', count: { $sum: 1 } } }]),
    EmailJob.find().select('to subject kind status attempts sender lastError createdAt sentAt availableAt expiresAt').sort({ createdAt: -1 }).limit(100).lean(),
    EmailSender.find().lean(),
    emailQueueMetadata()
  ]);
  const configured = getSenders();
  const accountLabels = getEmailProvider() === 'smtp' ? [{ id: 'smtp', email: process.env.EMAIL_FROM_ADDRESS?.trim() || 'Verified SMTP sender' }] : [];
  return res.json({ success: true, counts, jobs, settings: settings(), schedulerConfigured: Boolean(process.env.EMAIL_WORKER_SECRET), scheduler,
    senders: accountLabels.map(account => {
      const state = states.find(row => row._id === account.id);
      return { ...account, configured: configured.some(row => row.id === account.id), paused: state?.paused || false,
        lastError: state?.lastError, nextAvailableAt: state?.nextAvailableAt,
        usedLast24Hours: state?.reservations.filter(time => time > new Date(Date.now() - 86400000)).length || 0 };
    }) });
}
async function retry(req, res) {
  const job = await EmailJob.findOneAndUpdate({ _id: req.params.id, status: 'failed', expiresAt: { $gt: new Date() } },
    { $set: { status: 'queued', availableAt: new Date(), attempts: 0, lastError: null } }, { new: true });
  if (!job) return res.status(409).json({ success: false, message: 'Only unexpired failed emails can be retried' });
  if (job.notificationId) await Notification.updateOne({ _id: job.notificationId }, { $set: { emailStatus: 'scheduled' } });
  await AdminAction.create({ actorId: req.user._id, action: 'email_retry', targetType: 'email', targetId: job._id, requestId: req.id });
  require('../services/email-request-context.service').trackEmailJob(job.dedupeKey);
  return res.json({ success: true });
}
async function resume(req, res) {
  const allowed = getEmailProvider() === 'smtp' ? ['smtp'] : [];
  if (!allowed.includes(req.params.sender)) return res.status(400).json({ success: false, message: 'Invalid sender' });
  await EmailSender.updateOne({ _id: req.params.sender }, { $set: { paused: false, lastError: null } });
  await AdminAction.create({ actorId: req.user._id, action: 'email_sender_resumed', targetType: 'email_sender', targetId: req.user._id, details: { sender: req.params.sender }, requestId: req.id });
  return res.json({ success: true });
}
module.exports = { status, retry, resume };
