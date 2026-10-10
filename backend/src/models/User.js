const mongoose = require('mongoose');

const userSchema = new mongoose.Schema({
  googleSubject: { type: String, unique: true, sparse: true, trim: true },
  email: { type: String, required: true, unique: true, lowercase: true, trim: true, index: true },
  name: { type: String, required: true, trim: true, maxlength: 120 },
  // Passwords are optional because Google OAuth and development login accounts
  // do not have one. When present, this stores a salted scrypt digest only.
  passwordHash: { type: String, select: false },
  studentId: { type: String, uppercase: true, trim: true, sparse: true, unique: true, maxlength: 40 },
  college: { type: String, trim: true, maxlength: 120 },
  course: { type: String, trim: true, maxlength: 120 },
  specialization: { type: String, trim: true, maxlength: 120 },
  section: { type: String, trim: true, maxlength: 40 },
  year: { type: Number, min: 1, max: 8 },
  phone: { type: String, trim: true, maxlength: 20 },
  avatar: { type: String, trim: true },
  role: {
    type: String,
    enum: ['student', 'organizer', 'admin', 'super_admin'],
    default: 'student',
    index: true
  },
  assignedEvents: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Event' }],
  profileComplete: { type: Boolean, default: false },
  isActive: { type: Boolean, default: true },
  lastLoginAt: Date,
  emailVerifiedAt: Date,
  teamMembershipVersion: { type: Number, default: 0, select: false },
  passwordChangedAt: Date,
  mustChangePassword: { type: Boolean, default: false },
  staffTemporaryPasswordVersion: { type: String, select: false },
  staffTemporaryPasswordConsumedAt: { type: Date, select: false },
  passwordResetTokenHash: { type: String, select: false },
  passwordResetExpiresAt: Date,
  passwordResetRequestedAt: Date,
  staffActivationOtpHash: { type: String, select: false },
  staffActivationExpiresAt: { type: Date, select: false },
  staffActivationAttempts: { type: Number, select: false },
  staffActivationVersion: { type: String, select: false }
}, { timestamps: true });

userSchema.index({ name: 'text', studentId: 'text', email: 'text' });

module.exports = mongoose.model('User', userSchema);
