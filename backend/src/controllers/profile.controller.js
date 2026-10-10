const { User } = require('../models');
const { hashPassword, verifyPassword, isStrongPassword } = require('../utils/password');

async function getProfile(req, res) {
  const user = await User.findById(req.user._id).select('-passwordHash -__v').lean();
  if (!user) return res.status(404).json({ success: false, message: 'Profile not found' });
  return res.json({ success: true, user });
}

async function updateProfile(req, res) {
  const allowed = ['name', 'studentId', 'college', 'course', 'specialization', 'section', 'year', 'phone', 'avatar'];
  const updates = {};
  for (const key of allowed) if (req.body[key] !== undefined) updates[key] = req.body[key];
  if (updates.name !== undefined && !String(updates.name).trim()) return res.status(400).json({ success: false, message: 'Name cannot be empty' });
  const unset = {};
  if (updates.studentId !== undefined) {
    if (String(updates.studentId).trim()) updates.studentId = String(updates.studentId).trim().toUpperCase();
    else { delete updates.studentId; unset.studentId = 1; }
  }
  const current = await User.findById(req.user._id).select('name email studentId college phone').lean();
  if (!current) return res.status(404).json({ success: false, message: 'Profile not found' });
  const effective = { ...current, ...updates };
  if (unset.studentId) effective.studentId = '';
  const complete = ['name', 'email'].every(key => Boolean(effective[key]));
  updates.profileComplete = complete;
  try {
    const update = { $set: updates };
    if (Object.keys(unset).length) update.$unset = unset;
    const user = await User.findByIdAndUpdate(req.user._id, update, { new: true, runValidators: true }).select('-passwordHash -__v').lean();
    return res.json({ success: true, user });
  } catch (error) {
    if (error?.code === 11000) return res.status(409).json({ success: false, message: 'That student ID is already in use' });
    throw error;
  }
}

async function changePassword(req, res) {
  const nextPassword = String(req.body.newPassword || '');
  if (!isStrongPassword(nextPassword)) return res.status(400).json({ success: false, message: 'New password must be 8-128 characters' });
  const user = await User.findById(req.user._id).select('+passwordHash');
  if (!user) return res.status(404).json({ success: false, message: 'Profile not found' });
  if (user.passwordHash && !verifyPassword(String(req.body.currentPassword || ''), user.passwordHash)) return res.status(401).json({ success: false, message: 'Current password is incorrect' });
  let changed;
  await require('mongoose').connection.transaction(async session => {
    changed = await User.findOneAndUpdate({ _id: user._id, isActive: true, passwordHash: user.passwordHash || { $exists: false } },
      { $set: { passwordHash: hashPassword(nextPassword), passwordChangedAt: new Date(Math.max(Date.now(), new Date(user.passwordChangedAt || 0).getTime() + 1)) },
        $unset: { passwordResetTokenHash: 1, passwordResetExpiresAt: 1, passwordResetRequestedAt: 1 } }, { new: true, session });
    if (!changed) throw Object.assign(new Error('The account changed. Sign in again before updating your password.'), { statusCode: 409 });
    await require('../services/email.service').sendEmail({ dedupeKey: 'password-changed:' + changed._id + ':' + changed.passwordChangedAt.getTime(),
      to: changed.email, recipientId: changed._id, kind: 'password_changed', subject: 'Your password has changed',
      text: 'Your account password was successfully changed. If you did not make this change, contact support and recover your account immediately. This message never contains your password.', link: '/auth?mode=login' }, { session });
  });
  return res.json({ success: true, message: 'Password updated' });
}

async function searchStudents(req, res) {
  const query = String(req.query.q || '').trim();
  if (query.length < 2) return res.json({ success: true, users: [] });
  const regex = new RegExp(query.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i');
  const users = await User.find({ isActive: true, $or: [{ name: regex }, { email: regex }, { studentId: regex }] })
    .select('name email studentId college avatar').sort({ name: 1 }).limit(20).lean();
  return res.json({ success: true, users });
}

module.exports = { getProfile, updateProfile, changePassword, searchStudents };
