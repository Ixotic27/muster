const mongoose = require('mongoose');
const schema = new mongoose.Schema({
  _id: String,
  lastUsedAt: { type: Date, default: () => new Date(0) },
  nextAvailableAt: { type: Date, default: () => new Date(0) },
  reservations: { type: [Date], default: [] },
  paused: { type: Boolean, default: false },
  lastError: String
}, { timestamps: true });
module.exports = mongoose.model('EmailSender', schema);
