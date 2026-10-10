const mongoose = require('mongoose');

const registrationSchema = new mongoose.Schema({
  regId: { type: String, required: true, unique: true, index: true },
  eventId: { type: mongoose.Schema.Types.ObjectId, ref: 'Event', required: true, index: true },
  leaderId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
  teamId: { type: mongoose.Schema.Types.ObjectId, ref: 'Team', index: true },
  billingMode: { type: String, enum: ['legacy'], default: 'legacy', immutable: true },
  feeSnapshotInr: { type: Number, required: true, min: 0 },
  // Optional for historical registrations; catalog migrations retain the
  // eligibility bounds agreed when an existing team registered.
  minTeamSizeSnapshot: { type: Number, min: 1, max: 100, immutable: true },
  maxTeamSizeSnapshot: { type: Number, min: 1, max: 100, immutable: true },
  paymentId: { type: mongoose.Schema.Types.ObjectId, ref: 'Payment' },
  status: {
    type: String,
    enum: ['pending_team', 'pending_payment', 'payment_submitted', 'pending_noc', 'confirmed', 'checked_in', 'cancelled', 'refund_requested', 'refunded'],
    default: 'pending_payment',
    index: true
  },
  nocStatus: { type: String, enum: ['not_required', 'pending', 'verified', 'rejected'], default: 'not_required', index: true },
  nocDocumentUrl: String,
  nocStorageKey: String,
  nocSubmittedAt: Date,
  passesIssuedAt: Date,
  passRecoveryAttemptedAt: Date,
  nocRejectionReason: String,
  cancellationReason: String,
  cancelledAt: Date,
  refundReason: String,
  refundRejectionReason: String,
  refundAmountInr: { type: Number, min: 0 },
  refundRequestedAt: Date,
  refundedAt: Date,
  refundPreviousStatus: String,
  refundReviewStatus: { type: String, enum: ['pending', 'completed', 'rejected'] },
  refundReviewVersion: { type: Number, default: 0 },
  refundCapacityReserved: { type: Boolean, default: false },
  refundReference: { type: String, maxlength: 120 },
  refundReviewedAt: Date,
  refundReviewedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  withdrawalCapacityReleasedAt: Date
}, { timestamps: true });

registrationSchema.index({ eventId: 1, leaderId: 1 }, { unique: true });
registrationSchema.index({ eventId: 1, teamId: 1 }, { unique: true, partialFilterExpression: { teamId: { $type: 'objectId' } } });

module.exports = mongoose.model('Registration', registrationSchema);
