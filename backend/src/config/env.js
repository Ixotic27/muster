const crypto = require('crypto');

function required(name) {
  const value = process.env[name];
  if (!value && process.env.NODE_ENV === 'production') {
    throw new Error(`${name} is required in production`);
  }
  return value;
}

function loadConfig() {
  const jwtSecret = required('JWT_SECRET') || 'development-only-change-me';
  const qrSecret = required('QR_SIGN_SECRET') || 'development-only-qr-secret';

  if (process.env.NODE_ENV === 'production' && (jwtSecret.length < 32 || qrSecret.length < 32)) {
    throw new Error('JWT_SECRET and QR_SIGN_SECRET must each be at least 32 characters');
  }

  return {
    port: Number(process.env.PORT || 5000),
    nodeEnv: process.env.NODE_ENV || 'development',
    frontendOrigins: (process.env.FRONTEND_ORIGINS || process.env.FRONTEND_URL || 'http://localhost:3000')
      .split(',').map((origin) => origin.trim()).filter(Boolean),
    jwtSecret,
    jwtExpiresIn: process.env.JWT_EXPIRES_IN || '15m',
    jwtCookieMaxAgeMs: Number(process.env.JWT_COOKIE_MAX_AGE_MS || 24 * 60 * 60 * 1000),
    qrSecret,
    superAdminEmails: (process.env.SUPER_ADMIN_EMAILS || '')
      .split(',').map((email) => email.trim().toLowerCase()).filter(Boolean)
  };
}

function randomToken(bytes = 32) {
  return crypto.randomBytes(bytes).toString('hex');
}

module.exports = { loadConfig, randomToken };
