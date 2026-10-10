const express = require('express');
const Joi = require('joi');
const { asyncHandler } = require('../utils/helpers');
const { authenticate, authenticateTemporaryPassword } = require('../middleware/auth.middleware');
const { passport, configurePassport } = require('../config/passport');
const { getMe, devLogin, signup, login, forgotPassword, resetPassword, logout, updateProfile, googleCallback } = require('../controllers/auth.controller');
const { validate } = require('../middleware/validate.middleware');
const { authLimiter } = require('../middleware/rateLimiter.middleware');
const { profileSchema } = require('../validators/profile.validator');
const { beginOAuth, validateOAuthCallback } = require('../services/oauth-state.service');

const router = express.Router();
router.post('/dev-login', asyncHandler(devLogin));
const signupSchema = Joi.object({
  name: Joi.string().trim().min(2).max(120).required(),
  email: Joi.string().trim().email().max(254).required(),
  password: Joi.string().min(8).max(128).required(),
  studentId: Joi.string().trim().max(40).allow(''),
  college: Joi.string().trim().max(120).allow(''),
  course: Joi.string().trim().max(120).allow(''),
  specialization: Joi.string().trim().max(120).allow(''),
  section: Joi.string().trim().max(40).allow(''),
  year: Joi.number().integer().min(1).max(8).allow(null),
  phone: Joi.string().trim().max(20).allow('')
});
router.post(['/signup', '/sign-up', '/register'], authLimiter, validate(signupSchema), asyncHandler(signup));
router.post(['/login', '/sign-in'], authLimiter, validate(Joi.object({ email: Joi.string().email().required(), password: Joi.string().min(1).max(128).required() })), asyncHandler(login));
router.post('/forgot-password', authLimiter, validate(Joi.object({ email: Joi.string().email().required() })), asyncHandler(forgotPassword));
router.post('/reset-password', authLimiter, validate(Joi.object({ token: Joi.string().length(64).required(), newPassword: Joi.string().min(8).max(128).required() })), asyncHandler(resetPassword));
router.post('/logout', logout);
router.get('/google', authLimiter, (req, res, next) => {
  if (!configurePassport()) return res.status(503).json({ success: false, message: 'Google OAuth is not configured' });
  return passport.authenticate('google', { scope: ['profile', 'email'], session: false, state: beginOAuth(res) })(req, res, next);
});
router.get('/google/callback', (req, res, next) => {
  if (!configurePassport()) return res.status(503).json({ success: false, message: 'Google OAuth is not configured' });
  if (!validateOAuthCallback(req, res)) return res.status(400).json({ success: false, message: 'Sign-in request expired or does not belong to this browser. Start Google sign-in again.' });
  return passport.authenticate('google', { session: false, failureRedirect: `${process.env.FRONTEND_URL || 'http://localhost:3000'}/auth?error=oauth_failed` })(req, res, () => googleCallback(req, res));
});
router.get('/me', authenticate, asyncHandler(getMe));
router.patch('/profile', authenticate, validate(profileSchema), asyncHandler(updateProfile));

module.exports = router;
