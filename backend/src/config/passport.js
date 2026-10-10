const passport = require('passport');
const GoogleStrategy = require('passport-google-oauth20').Strategy;
const { User } = require('../models');
const { loadConfig } = require('./env');
let configured = false;

function configurePassport() {
  if (configured) return true;
  if (!process.env.GOOGLE_CLIENT_ID || !process.env.GOOGLE_CLIENT_SECRET) return false;
  const callbackURL = process.env.GOOGLE_CALLBACK_URL || 'http://localhost:5000/api/v1/auth/google/callback';
  if (process.env.NODE_ENV === 'production') {
    const callback = process.env.GOOGLE_CALLBACK_URL && new URL(process.env.GOOGLE_CALLBACK_URL);
    if (!callback || callback.protocol !== 'https:' || callback.username || callback.password || callback.hash || ['localhost', '127.0.0.1'].includes(callback.hostname)) {
      throw new Error('GOOGLE_CALLBACK_URL must be an HTTPS public callback URL in production');
    }
  }
  passport.use(new GoogleStrategy({ clientID: process.env.GOOGLE_CLIENT_ID, clientSecret: process.env.GOOGLE_CLIENT_SECRET, callbackURL }, async (accessToken, refreshToken, profile, done) => {
    try {
      const verifiedEmail = profile.emails?.find(item => item.verified === true || (profile._json?.email_verified === true && item.value === profile._json.email));
      const email = String(verifiedEmail?.value || '').toLowerCase().trim();
      if (!email) return done(new Error('Google account did not provide a verified email address'));
      const existing = await User.findOne({ email }).select('isActive').lean();
      if (existing && existing.isActive === false) return done(null, false);
      const config = loadConfig();
      const role = config.superAdminEmails.includes(email) ? 'super_admin' : undefined;
      const update = { googleSubject: profile.id, email, name: profile.displayName || email.split('@')[0], avatar: profile.photos?.[0]?.value, lastLoginAt: new Date() };
      if (role) update.role = role;
      // A concurrent staff deactivation must not be overwritten by OAuth.
      // The unique email index makes a blocked-account upsert fail closed.
      const mutation = { $set: update };
      if (!role) mutation.$setOnInsert = { role: 'student' };
      const user = await User.findOneAndUpdate({ email, isActive: { $ne: false } }, mutation, { upsert: true, new: true, setDefaultsOnInsert: true });
      return done(null, user);
    } catch (error) { return done(error); }
  }));
  configured = true;
  return true;
}

module.exports = { passport, configurePassport };
