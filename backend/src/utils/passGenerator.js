const crypto = require('crypto');

function generateRegId(slug) {
  const code = String(slug || 'event').replace(/[^a-z0-9]/gi, '').slice(0, 6).toUpperCase() || 'EVENT';
  return `REG-${code}-${crypto.randomBytes(5).toString('hex').toUpperCase()}`;
}

function generatePassId(slug) {
  const code = String(slug || 'event').replace(/[^a-z0-9]/gi, '').slice(0, 6).toUpperCase() || 'EVENT';
  return `PASS-${code}-${crypto.randomBytes(6).toString('hex').toUpperCase()}`;
}

module.exports = { generateRegId, generatePassId };
