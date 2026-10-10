const mongoose = require('mongoose');

const eventSchema = new mongoose.Schema({
  slug: { type: String, required: true, unique: true, lowercase: true, trim: true },
  name: { type: String, required: true, trim: true, maxlength: 120 },
  description: { type: String, default: '', maxlength: 5000 },
  category: { type: String, enum: ['technical', 'non_technical', 'esports'], required: true, index: true },
  participationType: { type: String, enum: ['solo', 'team', 'both'], required: true },
  minTeamSize: { type: Number, required: true, min: 1, max: 100 },
  maxTeamSize: { type: Number, required: true, min: 1, max: 100 },
  feeInr: { type: Number, required: true, min: 0 },
  registrationMode: { type: String, enum: ['legacy'], default: 'legacy' },
  teamFormationDeadline: Date,
  paymentDeadline: Date,
  prizePool: { type: String, default: '' },
  eventDate: { type: Date, required: true },
  registrationDeadline: Date,
  venue: { type: String, required: true, trim: true },
  maxSlots: { type: Number, min: 1 },
  filledSlots: { type: Number, min: 0, default: 0 },
  requiresNOC: { type: Boolean, default: false },
  nocDocumentUrl: String,
  paymentUpiId: String,
  paymentQrUrl: String,
  bannerImage: String,
  rules: [{ type: String, maxlength: 1000 }],
  status: { type: String, enum: ['draft', 'published', 'closed', 'cancelled'], default: 'published', index: true }
}, { timestamps: true });

eventSchema.index({ status: 1, eventDate: 1 });

module.exports = mongoose.model('Event', eventSchema);
