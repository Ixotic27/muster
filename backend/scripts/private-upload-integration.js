// Isolated MongoDB and real protected HTTP file routes; never upload externally.
const { startDatabase } = require('./isolated-test-database');
const assert = require('node:assert/strict');
const jwt = require('jsonwebtoken');
const cloudinary = require('cloudinary').v2;
const { disconnectDatabase } = require('../src/config/database');
const { User } = require('../src/models');
const StoredFile = require('../src/models/StoredFile');
const app = require('../src/app');
const { uploadPaymentScreenshot, uploadNocDocument } = require('../src/services/upload.service');
let replica, server, externalCalls = 0;
const originalUpload = cloudinary.uploader.upload_stream;
const originalDestroy = cloudinary.uploader.destroy;
async function run() {
  replica = await startDatabase();
  // This would select the old public-CDN upload branch. Trap both APIs before use.
  Object.assign(process.env, {
    CLOUDINARY_CLOUD_NAME: 'synthetic-only', CLOUDINARY_API_KEY: 'synthetic-only', CLOUDINARY_API_SECRET: 'synthetic-only'
  });
  cloudinary.uploader.upload_stream = () => { externalCalls++; throw new Error('Private evidence must never reach public Cloudinary upload'); };
  cloudinary.uploader.destroy = () => { externalCalls++; throw new Error('Private evidence must never use public Cloudinary deletion'); };
  const createUser = async (tag, role) => {
    const user = await User.create({ name: 'Private Upload ' + tag, email: 'private-' + tag + '@example.test', role, isActive: true });
    return { user, token: jwt.sign({ sub: String(user._id), role }, process.env.JWT_SECRET, { expiresIn: '5m' }) };
  };
  const owner = await createUser('owner', 'student');
  const outsider = await createUser('outsider', 'student');
  const organizer = await createUser('organizer', 'organizer');
  const admin = await createUser('admin', 'admin');
  const superAdmin = await createUser('super', 'super_admin');
  const png = Buffer.from('89504e470d0a1a0a00000000', 'hex');
  const pdf = Buffer.from('%PDF-1.7\nSynthetic private NOC\n');
  const proof = await uploadPaymentScreenshot({ ownerId: owner.user._id, buffer: png, mimetype: 'image/png' });
  const noc = await uploadNocDocument({ ownerId: owner.user._id, buffer: pdf, mimetype: 'application/pdf' });
  for (const [uploaded, content, purpose] of [[proof, png, 'payment'], [noc, pdf, 'noc']]) {
    assert.match(uploaded.url, /^\/api\/v1\/files\/[a-f0-9]{24}$/);
    assert.equal(uploaded.storageKey, uploaded.url.split('/').pop());
    const stored = await StoredFile.findById(uploaded.storageKey).select('+data').lean();
    assert.equal(stored.purpose, purpose); assert.equal(String(stored.ownerId), String(owner.user._id));
    assert.deepEqual(Buffer.from(stored.data.buffer), content);
  }
  assert.equal(externalCalls, 0);
  assert.equal(await StoredFile.countDocuments(), 2);
  console.log('PASS configured Cloudinary credentials cannot select public storage: payment and NOC remain owner-bound StoredFiles with protected relative URLs');
  server = app.listen(0, '127.0.0.1');
  await new Promise(resolve => server.once('listening', resolve));
  const base = 'http://127.0.0.1:' + server.address().port;
  for (const [uploaded, content, type] of [[proof, png, 'image/png'], [noc, pdf, 'application/pdf']]) {
    for (const account of [owner, admin, superAdmin]) {
      const response = await fetch(base + uploaded.url, { headers: { Authorization: 'Bearer ' + account.token } });
      assert.equal(response.status, 200); assert.equal(response.headers.get('content-type'), type);
      assert.equal(response.headers.get('cache-control'), 'private, no-store');
      assert.equal(response.headers.get('x-content-type-options'), 'nosniff');
      assert.equal(response.headers.get('content-security-policy'), "sandbox; default-src 'none'");
      assert.deepEqual(Buffer.from(await response.arrayBuffer()), content);
    }
    for (const account of [outsider, organizer]) {
      const response = await fetch(base + uploaded.url, { headers: { Authorization: 'Bearer ' + account.token } });
      assert.equal(response.status, 404); assert.equal((await response.json()).message, 'File not found');
    }
    assert.equal((await fetch(base + uploaded.url)).status, 401);
    assert.equal((await fetch(base + uploaded.url, { headers: { Authorization: 'Bearer invalid-token' } })).status, 401);
  }
  console.log('PASS owner/admin/super-admin can view both files; unrelated student and organizer get non-disclosing 404; missing/invalid authentication gets 401; successful files are sandboxed/no-store/nosniff');
  await assert.rejects(async () => uploadPaymentScreenshot({ ownerId: owner.user._id, buffer: Buffer.from('not a png'), mimetype: 'image/png' }), { statusCode: 400 });
  await assert.rejects(async () => uploadNocDocument({ ownerId: owner.user._id, buffer: Buffer.concat([pdf, Buffer.alloc(3 * 1024 * 1024)]), mimetype: 'application/pdf' }), { statusCode: 400 });
  assert.equal(await StoredFile.countDocuments(), 2);
  await proof.destroy(); await noc.destroy();
  assert.equal(await StoredFile.countDocuments(), 0); assert.equal(externalCalls, 0);
  assert.equal((await fetch(base + proof.url, { headers: { Authorization: 'Bearer ' + owner.token } })).status, 404);
  console.log('PASS invalid/oversized private evidence creates no file; compensation deletes only protected StoredFiles, and deleted URL becomes inaccessible without external calls');
}
run().catch(error => { console.error(error); process.exitCode = 1; }).finally(async () => {
  cloudinary.uploader.upload_stream = originalUpload; cloudinary.uploader.destroy = originalDestroy;
  if (server) await new Promise(resolve => server.close(resolve));
  await disconnectDatabase(); if (replica) await replica.stop();
});
