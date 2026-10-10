const mongoose = require('mongoose');

const memberSchema = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  nameSnapshot: { type: String, required: true },
  studentIdSnapshot: String,
  emailSnapshot: String,
  status: { type: String, enum: ['accepted', 'removed'], default: 'accepted' },
  joinedAt: { type: Date, default: Date.now }
}, { _id: false });

const teamSchema = new mongoose.Schema({
  teamName: { type: String, required: true, trim: true, maxlength: 80 },
  eventId: { type: mongoose.Schema.Types.ObjectId, ref: 'Event', required: true, index: true },
  leaderId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
  joinCode: { type: String, required: true, unique: true, uppercase: true, trim: true },
  members: { type: [memberSchema], default: [] },
  status: { type: String, enum: ['forming', 'locked', 'cancelled'], default: 'forming', index: true },
  acceptingJoinRequests: { type: Boolean, default: true },
  rosterVersion: { type: Number, default: 0 },
  closureReason: String,
  deletedAt: Date,
  mergedIntoTeamId: { type: mongoose.Schema.Types.ObjectId, ref: 'Team' },
  closedRoster: { type: [memberSchema], default: undefined }
}, { timestamps: true });

teamSchema.index({ teamName: 1, eventId: 1 }, { unique: true });
teamSchema.index({ 'members.userId': 1, eventId: 1 });

module.exports = mongoose.model('Team', teamSchema);
