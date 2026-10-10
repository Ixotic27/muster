const jwt = require('jsonwebtoken');
const { User } = require('../models');
const { loadConfig } = require('../config/env');
const guards = new WeakMap();
const RECHECK_INTERVAL_MS = 30000;

async function socketUser(socket) {
  try {
    if (socket.connected === false) return null;
    const token = socket.handshake.auth?.token || socket.handshake.headers?.authorization?.replace(/^Bearer\s+/i, '');
    if (!token) return null;
    const decoded = jwt.verify(token, loadConfig().jwtSecret);
    if (decoded.purpose === 'temporary_password_change') return null;
    const user = await User.findOne({ _id: decoded.sub, isActive: true }).select('_id mustChangePassword passwordChangedAt').lean();
    if (!user || user.mustChangePassword) return null;
    const changedAt = user.passwordChangedAt ? new Date(user.passwordChangedAt).getTime() : 0;
    if ((Object.hasOwn(decoded, 'passwordChangedAt') && decoded.passwordChangedAt !== changedAt)
      || (!Object.hasOwn(decoded, 'passwordChangedAt') && changedAt && decoded.iat && decoded.iat * 1000 < changedAt)) return null;
    return user;
  } catch (_) { return null; }
}

async function recheckSocketAccess(socket) {
  const user = await socketUser(socket);
  if (!user) socket.disconnect(true);
  return user;
}

function startSocketAuthGuard(socket) {
  if (guards.has(socket)) return;
  let checking = false;
  // Existing sockets do not receive an unlimited session after password reset,
  // staff credential issuance, deactivation or JWT expiry.
  const timer = setInterval(async () => {
    if (checking) return;
    checking = true;
    try { await recheckSocketAccess(socket); } finally { checking = false; }
  }, RECHECK_INTERVAL_MS);
  timer.unref?.();
  guards.set(socket, timer);
  socket.on('disconnect', () => { clearInterval(timer); guards.delete(socket); });
}
module.exports = { socketUser, recheckSocketAccess, startSocketAuthGuard, RECHECK_INTERVAL_MS };
