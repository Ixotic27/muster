const jwt = require('jsonwebtoken');
const { User } = require('../models');
const { loadConfig } = require('../config/env');

function temporaryIdentity(user) {
  return { _id: user._id, email: user.email, name: user.name, mustChangePassword: true };
}
async function readAuthentication(req) {
  const header = req.get('authorization') || '';
  const bearer = header.startsWith('Bearer ') ? header.slice(7).trim() : null;
  const token = bearer || req.cookies?.muster_access_token;

  if (!token) return { error: 'Authentication required' };
  const decoded = jwt.verify(token, loadConfig().jwtSecret);
  const user = await User.findOne({ _id: decoded.sub, isActive: true }).select('-__v +staffTemporaryPasswordVersion +staffTemporaryPasswordConsumedAt').lean();
  if (!user) return { error: 'Account is inactive or missing' };
  const passwordChangedAt = user.passwordChangedAt ? new Date(user.passwordChangedAt).getTime() : 0;
  // New tokens carry the exact change stamp; JWT iat has only second precision.
  // Retain the previous timestamp check for tokens issued before this claim existed.
  if ((Object.hasOwn(decoded, 'passwordChangedAt') && decoded.passwordChangedAt !== passwordChangedAt)
    || (!Object.hasOwn(decoded, 'passwordChangedAt') && passwordChangedAt && decoded.iat && decoded.iat * 1000 < passwordChangedAt)) {
    return { error: 'Authentication token was invalidated; please sign in again' };
  }
  return { user, decoded };
}
function isTemporarySession(user, decoded) {
  return decoded.purpose === 'temporary_password_change' && user.mustChangePassword === true
    && ['organizer', 'admin', 'super_admin'].includes(user.role)
    && Boolean(user.staffTemporaryPasswordConsumedAt) && Boolean(user.staffTemporaryPasswordVersion)
    && decoded.temporaryPasswordVersion === user.staffTemporaryPasswordVersion;
}
async function authenticate(req, res, next) {
  try {
    const { user, decoded, error } = await readAuthentication(req);
    if (error) return res.status(401).json({ success: false, message: error });
    if (user.mustChangePassword || decoded.purpose === 'temporary_password_change') {
      if (!isTemporarySession(user, decoded)) return res.status(401).json({ success: false, message: 'Please sign in using your staff password or recover your account' });
      return res.status(403).json({ success: false, requiresPasswordChange: true, user: temporaryIdentity(user), message: 'Choose a new password before using your account' });
    }
    delete user.staffTemporaryPasswordVersion;
    delete user.staffTemporaryPasswordConsumedAt;
    req.user = user;
    req.auth = decoded;
    return next();
  } catch (error) {
    return res.status(401).json({ success: false, message: 'Invalid or expired authentication token' });
  }
}
async function authenticateTemporaryPassword(req, res, next) {
  try {
    const { user, decoded, error } = await readAuthentication(req);
    if (error || !isTemporarySession(user, decoded)) return res.status(401).json({ success: false, message: 'Password-change session is invalid or expired. Sign in or use Forgot Password.' });
    req.user = temporaryIdentity(user);
    req.auth = decoded;
    return next();
  } catch (error) {
    return res.status(401).json({ success: false, message: 'Password-change session is invalid or expired. Sign in or use Forgot Password.' });
  }
}
module.exports = { authenticate, protect: authenticate, authenticateTemporaryPassword, temporaryIdentity };
