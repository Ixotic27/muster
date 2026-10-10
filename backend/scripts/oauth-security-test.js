// Offline security regression tests: no Google request, real account or database.
const assert = require('node:assert/strict');
const jwt = require('jsonwebtoken');
process.env.NODE_ENV = 'test';
process.env.JWT_SECRET = 'isolated-oauth-test-secret-at-least-32-characters';
process.env.GOOGLE_CLIENT_ID = 'offline-test-client';
process.env.GOOGLE_CLIENT_SECRET = 'offline-test-secret';
const { beginOAuth, validateOAuthCallback, COOKIE } = require('../src/services/oauth-state.service');
const { User } = require('../src/models');
const { passport, configurePassport } = require('../src/config/passport');
async function main() {
  let signed, cleared = 0;
  const response = { cookie(name, value, options) { assert.equal(name, COOKIE); assert.equal(options.httpOnly, true); assert.equal(options.sameSite, 'lax'); signed = value; }, clearCookie() { cleared++; } };
  const state = beginOAuth(response);
  const callback = (value, cookie = signed) => validateOAuthCallback({ query: { state: value }, cookies: { [COOKIE]: cookie } }, response);
  assert.equal(callback(state), true);
  assert.equal(callback('0'.repeat(64)), false);
  assert.equal(callback(state, null), false);
  assert.equal(callback(state, signed + 'tampered'), false);
  assert.equal(callback([state]), false);
  const expired = jwt.sign({ purpose: 'oauth_state', state }, process.env.JWT_SECRET, { expiresIn: -1 });
  assert.equal(callback(state, expired), false);
  assert.equal(callback(state, jwt.sign({ purpose: 'access', state }, process.env.JWT_SECRET)), false);
  assert.equal(cleared, 7);
  console.log('PASS OAuth browser binding, invalid/missing state, tampering, expiry and purpose restrictions');
  configurePassport();
  const originalFind = User.findOne, originalUpdate = User.findOneAndUpdate;
  let existing = null, writes = 0;
  User.findOne = () => ({ select: () => ({ lean: async () => existing }) });
  User.findOneAndUpdate = async (filter, update) => {
    writes++; assert.deepEqual(filter.isActive, { $ne: false });
    assert.equal(Object.hasOwn(update.$set, 'isActive'), false);
    assert.equal(Object.hasOwn(update.$set, 'role') && Object.hasOwn(update.$setOnInsert || {}, 'role'), false, 'MongoDB update must never write role in two operators');
    return { email: filter.email, role: 'student', isActive: true };
  };
  try {
    const authenticate = profile => new Promise(resolve => passport._strategy('google')._verify('unused', 'unused', profile, (error, user) => resolve({ error, user })));
    let result = await authenticate({ id: 'offline-subject', emails: [{ value: 'attendee@example.test' }] });
    assert.ok(result.error); assert.equal(writes, 0);
    const verified = { id: 'offline-subject', emails: [{ value: 'attendee@example.test' }], _json: { email: 'attendee@example.test', email_verified: true } };
    existing = { isActive: false };
    result = await authenticate(verified); assert.equal(result.user, false); assert.equal(writes, 0);
    existing = { isActive: true };
    result = await authenticate(verified); assert.equal(result.error, null); assert.equal(result.user.email, 'attendee@example.test'); assert.equal(writes, 1);
    process.env.SUPER_ADMIN_EMAILS = 'attendee@example.test';
    result = await authenticate(verified); assert.equal(result.error, null); assert.equal(writes, 2);
    delete process.env.SUPER_ADMIN_EMAILS;
    console.log('PASS Google verified-email requirement and disabled-account guard with guarded update');
  } finally { User.findOne = originalFind; User.findOneAndUpdate = originalUpdate; }
}
main().catch(error => { console.error(error.name + ': ' + error.message); process.exitCode = 1; });
