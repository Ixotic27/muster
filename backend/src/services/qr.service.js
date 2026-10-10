const crypto = require('crypto');
const QRCode = require('qrcode');
const { loadConfig } = require('../config/env');

function encode(value) {
  return Buffer.from(value).toString('base64url');
}

function signPayload(payload) {
  const body = encode(JSON.stringify(payload));
  const signature = crypto.createHmac('sha256', loadConfig().qrSecret).update(body).digest('base64url');
  return `v1.${body}.${signature}`;
}

function verifyToken(token) {
  if (typeof token !== 'string') return null;
  const parts = token.split('.');
  if (parts.length !== 3 || parts[0] !== 'v1') return null;
  const [, body, signature] = parts;
  const expected = crypto.createHmac('sha256', loadConfig().qrSecret).update(body).digest('base64url');
  const left = Buffer.from(signature);
  const right = Buffer.from(expected);
  if (left.length !== right.length || !crypto.timingSafeEqual(left, right)) return null;
  try {
    return JSON.parse(Buffer.from(body, 'base64url').toString('utf8'));
  } catch (error) {
    return null;
  }
}

async function createPassToken({ passId, registrationId, eventId, userId, expiresAt }) {
  const payload = {
    passId: String(passId),
    registrationId: String(registrationId),
    eventId: String(eventId),
    sub: String(userId),
    iat: new Date().toISOString(),
    exp: expiresAt ? new Date(expiresAt).toISOString() : undefined
  };
  const token = signPayload(payload);
  const qrDataUrl = await QRCode.toDataURL(token, { errorCorrectionLevel: 'M', margin: 2, width: 480 });
  return { token, qrDataUrl, payload };
}

function isExpired(payload) {
  return payload?.exp ? Date.parse(payload.exp) <= Date.now() : false;
}

module.exports = { signPayload, verifyToken, createPassToken, isExpired };
