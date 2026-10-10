const mongoose = require('mongoose');

const teamInviteSchema = new mongoose.Schema({
  teamId: { type: mongoose.Schema.Types.ObjectId, ref: 'Team', required: true, index: true },
  eventId: { type: mongoose.Schema.Types.ObjectId, ref: 'Event', required: true, index: true },
  invitedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  invitedUser: { type: mongoose.Schema.Types.ObjectId, ref: 'User', index: true },
  invitedEmail: { type: String, lowercase: true, trim: true, index: true },
  tokenHash: { type: String, select: false },
  requiresToken: { type: Boolean, default: false },
  status: { type: String, enum: ['pending', 'accepted', 'rejected', 'expired'], default: 'pending', index: true },
  expiresAt: { type: Date, required: true, index: true },
  respondedAt: Date
}, { timestamps: true });

teamInviteSchema.index({ teamId: 1, invitedUser: 1, status: 1 });
teamInviteSchema.index({ teamId: 1, invitedEmail: 1 }, { unique: true, partialFilterExpression: { status: 'pending', invitedEmail: { $type: 'string' } } });

module.exports = mongoose.model('TeamInvite', teamInviteSchema);
