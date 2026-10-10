const { Notification } = require('../models');

async function listNotifications(req, res) {
  const limit = Math.min(Math.max(Number(req.query.limit || 50), 1), 100);
  const filter = { userId: req.user._id };
  if (req.query.unread === 'true') filter.readAt = null;
  const [notifications, unread] = await Promise.all([
    Notification.find(filter).sort({ createdAt: -1 }).limit(limit).lean(),
    Notification.countDocuments({ userId: req.user._id, readAt: null })
  ]);
  return res.json({ success: true, notifications, unread });
}

async function markNotificationRead(req, res) {
  const notification = await Notification.findOneAndUpdate(
    { _id: req.params.id, userId: req.user._id },
    { $set: { readAt: new Date() } },
    { new: true }
  ).lean();
  if (!notification) return res.status(404).json({ success: false, message: 'Notification not found' });
  return res.json({ success: true, notification });
}

async function markAllNotificationsRead(req, res) {
  const result = await Notification.updateMany({ userId: req.user._id, readAt: null }, { $set: { readAt: new Date() } });
  return res.json({ success: true, updated: result.modifiedCount || 0 });
}

module.exports = { listNotifications, markNotificationRead, markAllNotificationsRead };
