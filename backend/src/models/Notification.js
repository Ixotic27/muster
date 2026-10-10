const mongoose = require('mongoose');

const notificationSchema = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
  type: { type: String, required: true, trim: true },
  title: { type: String, required: true, maxlength: 160 },
  message: { type: String, required: true, maxlength: 2000 },
  link: String,
  dedupeKey: { type: String, sparse: true, index: true },
  passId: { type: mongoose.Schema.Types.ObjectId, ref: 'Pass' },
  registrationId: { type: mongoose.Schema.Types.ObjectId, ref: 'Registration' },
  eventId: { type: mongoose.Schema.Types.ObjectId, ref: 'Event' },
  teamId: { type: mongoose.Schema.Types.ObjectId, ref: 'Team' },
  audience: { type: String, enum: ['participant', 'staff'] },
  readAt: Date,
  emailStatus: { type: String, enum: ['disabled', 'queued', 'scheduled', 'sent', 'failed'], default: 'disabled' },
  emailAttempts: { type: Number, default: 0 }
}, { timestamps: true });

notificationSchema.index({ userId: 1, readAt: 1, createdAt: -1 });
notificationSchema.index({ emailStatus: 1, createdAt: 1 });

module.exports = mongoose.model('Notification', notificationSchema);
