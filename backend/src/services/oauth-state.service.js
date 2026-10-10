const crypto = require('crypto');
const jwt = require('jsonwebtoken');
const { loadConfig } = require('../config/env');
const COOKIE = 'muster_oauth_state';
const options = () => ({ httpOnly: true, secure: process.env.NODE_ENV === 'production', sameSite: 'lax', path: '/api/v1/auth/google' });

function beginOAuth(res) {
  const state = crypto.randomBytes(32).toString('hex');
  const signed = jwt.sign({ purpose: 'oauth_state', state }, loadConfig().jwtSecret, { algorithm: 'HS256', expiresIn: '5m' });
  res.cookie(COOKIE, signed, { ...options(), maxAge: 300000 });
  return state;
}

function validateOAuthCallback(req, res) {
  // Consume the browser binding on every callback, including rejected ones.
  res.clearCookie(COOKIE, options());
  try {
    const state = req.query.state;
    if (typeof state !== 'string' || !/^[a-f0-9]{64}$/.test(state)) return false;
    const decoded = jwt.verify(req.cookies?.[COOKIE], loadConfig().jwtSecret, { algorithms: ['HS256'] });
    return decoded.purpose === 'oauth_state' && typeof decoded.state === 'string' && decoded.state.length === state.length
      && crypto.timingSafeEqual(Buffer.from(decoded.state), Buffer.from(state));
  } catch (_) { return false; }
}
module.exports = { beginOAuth, validateOAuthCallback, COOKIE };
