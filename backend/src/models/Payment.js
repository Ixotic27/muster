const mongoose = require('mongoose');

const paymentSchema = new mongoose.Schema({
  registrationId: { type: mongoose.Schema.Types.ObjectId, ref: 'Registration', required: true, index: true },
  eventId: { type: mongoose.Schema.Types.ObjectId, ref: 'Event', required: true, index: true },
  payerId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
  provider: { type: String, enum: ['manual', 'razorpay'], default: 'manual', immutable: true },
  gatewayOrderId: { type: mongoose.Schema.Types.ObjectId, ref: 'GatewayOrder' },
  providerPaymentId: { type: String, trim: true },
  utr: { type: String, required: function () { return this.provider !== 'razorpay'; }, trim: true, uppercase: true },
  amountInr: { type: Number, required: true, min: 0 },
  currency: { type: String, enum: ['INR'], default: 'INR' },
  screenshotUrl: { type: String, required: function () { return this.provider !== 'razorpay'; } },
  storageKey: String,
  status: { type: String, enum: ['submitted', 'verified', 'rejected', 'refunded'], default: 'submitted', index: true },
  rejectionReason: String,
  reviewedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  reviewedAt: Date,
  attempt: { type: Number, default: 1, min: 1 }
}, { timestamps: true });

paymentSchema.index({ utr: 1 }, { unique: true, partialFilterExpression: { utr: { $type: 'string' } } });
paymentSchema.index({ providerPaymentId: 1 }, { unique: true, partialFilterExpression: { providerPaymentId: { $type: 'string' } } });
paymentSchema.index({ registrationId: 1, createdAt: -1 });

module.exports = mongoose.model('Payment', paymentSchema);
