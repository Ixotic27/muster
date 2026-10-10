const mongoose = require('mongoose');

// One reusable order per registration prevents multiple checkout sessions from
// collecting the fee twice. Payment receipts remain separate immutable records.
const schema = new mongoose.Schema({
  registrationId: { type: mongoose.Schema.Types.ObjectId, ref: 'Registration', required: true, unique: true },
  eventId: { type: mongoose.Schema.Types.ObjectId, ref: 'Event', required: true },
  payerId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  provider: { type: String, enum: ['razorpay'], default: 'razorpay', immutable: true },
  providerOrderId: { type: String, trim: true },
  providerPaymentId: { type: String, trim: true },
  amountPaise: { type: Number, required: true, min: 100 },
  currency: { type: String, enum: ['INR'], default: 'INR' },
  keyId: { type: String, required: true },
  status: { type: String, enum: ['creating', 'created', 'paid', 'review_required', 'failed'], default: 'creating' },
  paymentId: { type: mongoose.Schema.Types.ObjectId, ref: 'Payment' },
  settledAt: Date,
  lastWebhookEventId: String
}, { timestamps: true });
schema.index({ providerOrderId: 1 }, { unique: true, partialFilterExpression: { providerOrderId: { $type: 'string' } } });
schema.index({ providerPaymentId: 1 }, { unique: true, partialFilterExpression: { providerPaymentId: { $type: 'string' } } });
module.exports = mongoose.model('GatewayOrder', schema);
