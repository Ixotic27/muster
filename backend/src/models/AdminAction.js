const mongoose = require('mongoose');

const adminActionSchema = new mongoose.Schema({
  actorId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
  action: { type: String, required: true, trim: true },
  targetType: { type: String, required: true, trim: true },
  targetId: { type: mongoose.Schema.Types.ObjectId, required: true, index: true },
  details: { type: mongoose.Schema.Types.Mixed, default: {} },
  requestId: String,
  ipAddress: String
}, { timestamps: true });

module.exports = mongoose.model('AdminAction', adminActionSchema);
