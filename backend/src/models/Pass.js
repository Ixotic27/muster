const mongoose = require('mongoose');

const passSchema = new mongoose.Schema({
  passId: { type: String, required: true, unique: true, index: true },
  registrationId: { type: mongoose.Schema.Types.ObjectId, ref: 'Registration', required: true, index: true },
  eventId: { type: mongoose.Schema.Types.ObjectId, ref: 'Event', required: true, index: true },
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
  token: { type: String, required: true, unique: true, select: false },
  qrDataUrl: { type: String, select: false },
  issuedAt: { type: Date, default: Date.now },
  reminderForDate: Date,
  expiresAt: Date,
  status: { type: String, enum: ['issued', 'revoked'], default: 'issued', index: true },
  checkInStatus: { type: String, enum: ['pending', 'checked_in'], default: 'pending', index: true },
  checkedInAt: Date,
  scannedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  scanId: String
}, { timestamps: true });

passSchema.index({ registrationId: 1, userId: 1 }, { unique: true });

module.exports = mongoose.model('Pass', passSchema);
