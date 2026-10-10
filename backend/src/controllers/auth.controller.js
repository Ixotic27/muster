const jwt = require('jsonwebtoken');
const { User } = require('../models');
const { loadConfig } = require('../config/env');
const { normalizeEmail } = require('../utils/helpers');
const { hashPassword, verifyPassword, isStrongPassword } = require('../utils/password');
const { randomToken } = require('../config/env');
const { sendEmail } = require('../services/email.service');
const crypto = require('crypto');

function issueAccessToken(user) {
  return jwt.sign({ sub: String(user._id), role: user.role, passwordChangedAt: user.passwordChangedAt ? new Date(user.passwordChangedAt).getTime() : 0 }, loadConfig().jwtSecret, { expiresIn: loadConfig().jwtExpiresIn });
}

function setAuthCookie(res, token, maxAge = loadConfig().jwtCookieMaxAgeMs) {
  res.cookie('muster_access_token', token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    maxAge
  });
}

function publicUser(user) {
  const value = user?.toObject ? user.toObject() : { ...user };
  delete value.passwordHash;
  for (const key of ['staffActivationOtpHash', 'staffActivationVersion', 'staffActivationExpiresAt', 'staffActivationAttempts',
    'staffTemporaryPasswordVersion', 'staffTemporaryPasswordConsumedAt', 'passwordResetTokenHash']) delete value[key];
  delete value.__v;
  return value;
}

async function getMe(req, res) {
  return res.json({ success: true, user: req.user });
}

async function devLogin(req, res) {
  if (process.env.NODE_ENV === 'production' || process.env.ENABLE_DEV_LOGIN !== 'true') return res.status(404).json({ success: false, message: 'Not found' });
  const email = normalizeEmail(req.body.email);
  const name = String(req.body.name || email.split('@')[0] || 'Muster User').trim().slice(0, 120);
  if (!email || !email.includes('@')) return res.status(400).json({ success: false, message: 'A valid email is required' });
  const config = loadConfig();
  const existing = await User.findOne({ email }).select('mustChangePassword').lean();
  if (existing?.mustChangePassword) return res.status(403).json({ success: false, message: 'Use your staff password to sign in and choose a new password' });
  const role = config.superAdminEmails.includes(email) ? 'super_admin' : 'student';
  const user = await User.findOneAndUpdate(
    { email },
    { $set: { name, role, lastLoginAt: new Date(), isActive: true }, $setOnInsert: { email } },
    { new: true, upsert: true, setDefaultsOnInsert: true }
  );
  return res.json({ success: true, token: issueAccessToken(user), user });
}

async function signup(req, res) {
  const email = normalizeEmail(req.body.email);
  const name = String(req.body.name || '').trim();
  const password = String(req.body.password || '');
  if (!email || !email.includes('@') || !name || !isStrongPassword(password)) {
    return res.status(400).json({ success: false, message: 'Name, valid email, and a password of 8-128 characters are required' });
  }

  const existing = await User.findOne({ email }).select('_id').lean();
  if (existing) return res.status(409).json({ success: false, message: 'An account with this email already exists' });

  const config = loadConfig();
  const profile = {
    name,
    email,
    passwordHash: hashPassword(password),
    ...(req.body.studentId ? { studentId: String(req.body.studentId).trim().toUpperCase() } : {}),
    ...(req.body.college ? { college: String(req.body.college).trim() } : {}),
    ...(req.body.course ? { course: String(req.body.course).trim() } : {}),
    ...(req.body.specialization ? { specialization: req.body.specialization } : {}),
    ...(req.body.section ? { section: req.body.section } : {}),
    ...(req.body.year ? { year: req.body.year } : {}),
    ...(req.body.phone ? { phone: String(req.body.phone).trim() } : {}),
    // A claimed email address is not proof of ownership. Staff roles are granted separately.
    role: 'student',
    profileComplete: Boolean(name && email),
    lastLoginAt: new Date()
  };
  try {
    let user;
    await require('mongoose').connection.transaction(async session => {
      [user] = await User.create([profile], { session });
      await sendEmail({ dedupeKey:'account:'+user._id,to:user.email,recipientId:user._id,kind:'account_created',subject:'Your account is ready',text:'Welcome. Browse events and manage registrations from your account.',link:'/dashboard' }, { session });
    });
    const token = issueAccessToken(user);
    setAuthCookie(res, token);
    return res.status(201).json({ success: true, token, user: publicUser(user), needsProfile: !user.profileComplete });
  } catch (error) {
    if (error?.code === 11000) return res.status(409).json({ success: false, message: 'An account with this email or student ID already exists' });
    throw error;
  }
}

async function login(req, res) {
  const email = normalizeEmail(req.body.email);
  const password = String(req.body.password || '');
  if (!email || !password) return res.status(400).json({ success: false, message: 'Email and password are required' });
  const user = await User.findOne({ email, isActive: true }).select('+passwordHash +staffTemporaryPasswordVersion +staffTemporaryPasswordConsumedAt');
  if (!user || !verifyPassword(password, user.passwordHash)) {
    return res.status(401).json({ success: false, message: 'Invalid email or password' });
  }

  user.lastLoginAt = new Date();
  await user.save({ validateBeforeSave: false });
  const token = issueAccessToken(user);
  setAuthCookie(res, token);
  return res.json({ success: true, token, user: publicUser(user), needsProfile: !user.profileComplete });
}

async function forgotPassword(req, res) {
  if (!require('../config/email').getEmailTransporter()) return res.status(503).json({ success: false, message: 'Email recovery is not configured yet. Contact the Muster organizers for account recovery.' });
  const email = normalizeEmail(req.body.email);
  if (!email || !email.includes('@')) return res.status(400).json({ success: false, message: 'A valid email is required' });
  const user = await User.findOne({ email, isActive: true }).select('+passwordResetTokenHash');
  const response = { success: true, message: 'If an account exists for this email, reset instructions have been queued for delivery.' };
  if (!user) return res.json(response);
  const token = randomToken(32);
  user.passwordResetTokenHash = crypto.createHash('sha256').update(token).digest('hex');
  user.passwordResetExpiresAt = new Date(Date.now() + 30 * 60 * 1000);
  user.passwordResetRequestedAt = new Date();
  await user.save({ validateBeforeSave: false });
  const resetLink = '/reset-password#token=' + token;
  const dedupeKey = 'reset:' + user.passwordResetTokenHash;
  await sendEmail({ dedupeKey, to: email, recipientId: user._id, subject: 'Reset your Muster password', text: 'Use the button below within 30 minutes to reset your password. If you did not request this, ignore this email.', link: resetLink, kind: 'password_reset', priority: 200, expiresAt: user.passwordResetExpiresAt });
  if (process.env.NODE_ENV === 'production') await require('../services/email-dispatch.service').dispatchResetEmail(dedupeKey);
  if (process.env.NODE_ENV !== 'production') response.debugToken = token;
  return res.json(response);
}

async function resetPassword(req, res) {
  const token = String(req.body.token || '');
  const password = String(req.body.newPassword || '');
  if (!token || !isStrongPassword(password)) return res.status(400).json({ success: false, message: 'A reset token and a password of 8-128 characters are required' });
  const hash = crypto.createHash('sha256').update(token).digest('hex');
  const current = await User.findOne({ passwordResetTokenHash: hash, passwordResetExpiresAt: { $gt: new Date() }, isActive: true }).select('+passwordHash');
  if (!current) return res.status(400).json({ success: false, message: 'Reset token is invalid or expired' });
  if (current.mustChangePassword && verifyPassword(password, current.passwordHash)) return res.status(400).json({ success: false, message: 'Choose a new password different from the temporary password in your email' });
  let user;
  await require('mongoose').connection.transaction(async session => {
    user = await User.findOneAndUpdate({ _id: current._id, passwordHash: current.passwordHash || { $exists: false },
      passwordResetTokenHash: hash, passwordResetExpiresAt: { $gt: new Date() }, isActive: true },
      { $set: { passwordHash: hashPassword(password), passwordChangedAt: new Date(Math.max(Date.now(), new Date(current.passwordChangedAt || 0).getTime() + 1)), mustChangePassword: false },
        $unset: { passwordResetTokenHash: 1, passwordResetExpiresAt: 1, passwordResetRequestedAt: 1,
          staffActivationOtpHash: 1, staffActivationVersion: 1, staffActivationExpiresAt: 1, staffActivationAttempts: 1,
          staffTemporaryPasswordVersion: 1, staffTemporaryPasswordConsumedAt: 1 } }, { new: true, session });
    if (user) await sendEmail({ dedupeKey: 'password-changed:' + user._id + ':' + user.passwordChangedAt.getTime(), to: user.email, recipientId: user._id,
      kind: 'password_changed', subject: 'Your password has changed', text: 'Your account password was successfully reset. If you did not make this change, contact support and recover your account immediately. This message never contains your password.', link: '/auth?mode=login' }, { session });
  });
  if (!user) return res.status(400).json({ success: false, message: 'Reset token is invalid or expired' });
  return res.json({ success: true, message: 'Password reset successfully' });
}

function logout(req, res) {
  res.clearCookie('muster_access_token', { httpOnly: true, secure: process.env.NODE_ENV === 'production', sameSite: 'lax' });
  return res.json({ success: true, message: 'Logged out' });
}

async function updateProfile(req, res) {
  const updates = {};
  const unset = {};
  for (const key of ['name', 'studentId', 'college', 'course', 'specialization', 'section', 'year', 'phone', 'avatar']) {
    if (req.body[key] !== undefined) updates[key] = req.body[key];
  }
  if (updates.studentId !== undefined) {
    if (String(updates.studentId).trim()) updates.studentId = String(updates.studentId).trim().toUpperCase();
    else { delete updates.studentId; unset.studentId = 1; }
  }
  if (!updates.name && !req.user.name) return res.status(400).json({ success: false, message: 'Name is required' });
  const effective = { ...req.user, ...updates };
  if (unset.studentId) effective.studentId = '';
  updates.profileComplete = ['name','email'].every(key => Boolean(effective[key]));
  const update = { $set: updates };
  if (Object.keys(unset).length) update.$unset = unset;
  const user = await User.findByIdAndUpdate(req.user._id, update, { new: true, runValidators: true }).select('-__v');
  return res.json({ success: true, user });
}

function googleCallback(req, res) {
  if (req.user.mustChangePassword) {
    res.clearCookie('muster_access_token', { httpOnly: true, secure: process.env.NODE_ENV === 'production', sameSite: 'lax' });
    return res.redirect(`${process.env.FRONTEND_URL || 'http://localhost:3000'}/auth?mode=login&error=staff_password_required`);
  }
  const token = issueAccessToken(req.user);
  setAuthCookie(res, token);
  const redirect = process.env.FRONTEND_AUTH_SUCCESS_URL || `${process.env.FRONTEND_URL || 'http://localhost:3000'}/auth`;
  return res.redirect(redirect);
}

module.exports = { issueAccessToken, getMe, devLogin, signup, login, forgotPassword, resetPassword, logout, updateProfile, googleCallback, publicUser };
