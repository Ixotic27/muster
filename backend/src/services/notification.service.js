const { Notification } = require('../models');
const { emitToUser } = require('../config/socket');
async function createNotification({ userId, type, title, message, link, passId, registrationId, eventId, teamId, audience, dedupeKey, email = true }, { session } = {}) {
  const data = { userId, type, title, message, link, passId, registrationId, eventId, teamId, audience, emailStatus: email ? 'queued' : 'disabled' };
  let notification;
  if (dedupeKey) notification = await Notification.findOneAndUpdate({ dedupeKey }, { $setOnInsert: { ...data, dedupeKey } }, { upsert: true, new: true, session });
  else [notification] = await Notification.create([data], { session });
  // Create the outbox alongside the notification, including within the same
  // transaction. A successful request can now dispatch without waiting for cron
  // to discover the notification. Older queued notifications remain recoverable.
  if (notification.emailStatus === 'queued') {
    const user = await require('../models').User.findOne({ _id: userId, isActive: true }).select('email').session(session || null).lean();
    if (user) await require('./email.service').sendEmail({
      dedupeKey: 'notification:' + notification._id, to: user.email, subject: notification.title,
      text: notification.message, link: notification.link || '/dashboard', kind: notification.type,
      notificationId: notification._id, registrationId: notification.registrationId,
      eventId: notification.eventId, teamId: notification.teamId, audience: notification.audience,
      recipientId: notification.userId, passId: notification.passId,
      expiresAt: new Date(notification.createdAt.getTime() + 7 * 86400000)
    }, { session });
    notification.emailStatus = user ? 'scheduled' : 'disabled';
    // Preserve a concurrent worker's sent/failed outcome for sessionless
    // callers rather than overwriting it with an older preparation state.
    await Notification.updateOne({ _id: notification._id, emailStatus: 'queued' },
      { $set: { emailStatus: notification.emailStatus } }, { session });
  } else if (notification.emailStatus === 'scheduled') {
    require('./email-request-context.service').trackEmailJob('notification:' + notification._id);
  }
  if (!session) emitToUser(userId, 'notification:new', notification.toObject());
  return notification;
}
module.exports = { createNotification };
