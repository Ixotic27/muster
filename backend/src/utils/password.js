const crypto = require('crypto');

// Node's built-in scrypt keeps password handling self-contained and avoids
// shipping a native bcrypt dependency. The encoded format is deliberately
// versioned so the work factor can be increased later without a data migration.
const KEY_LENGTH = 64;
const COST = 16384;
const BLOCK_SIZE = 8;
const PARALLELIZATION = 1;

function hashPassword(password) {
  const salt = crypto.randomBytes(16);
  const digest = crypto.scryptSync(String(password), salt, KEY_LENGTH, {
    N: COST,
    r: BLOCK_SIZE,
    p: PARALLELIZATION,
    maxmem: 32 * 1024 * 1024
  });
  return `scrypt$v1$${COST}$${BLOCK_SIZE}$${PARALLELIZATION}$${salt.toString('base64url')}$${digest.toString('base64url')}`;
}

function verifyPassword(password, encoded) {
  if (typeof encoded !== 'string') return false;
  const parts = encoded.split('$');
  if (parts.length !== 7 || parts[0] !== 'scrypt' || parts[1] !== 'v1') return false;
  const [, , n, r, p, saltText, digestText] = parts;
  const salt = Buffer.from(saltText, 'base64url');
  const expected = Buffer.from(digestText, 'base64url');
  if (!salt.length || expected.length !== KEY_LENGTH) return false;
  try {
    const actual = crypto.scryptSync(String(password), salt, expected.length, {
      N: Number(n),
      r: Number(r),
      p: Number(p),
      maxmem: 32 * 1024 * 1024
    });
    return crypto.timingSafeEqual(actual, expected);
  } catch (_) {
    return false;
  }
}

function isStrongPassword(password) {
  return typeof password === 'string' && password.length >= 8 && password.length <= 128;
}

module.exports = { hashPassword, verifyPassword, isStrongPassword };
