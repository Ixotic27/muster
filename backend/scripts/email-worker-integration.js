// Real HTTP requests + ephemeral replica set + injected fake SMTP. No network mail.
const { startDatabase } = require('./isolated-test-database');
const assert = require('node:assert/strict');
const { User } = require('../src/models');
const Job = require('../src/models/EmailJob');
const Sender = require('../src/models/EmailSender');
const Lease = require('../src/models/WorkerLease');
const { hashPassword } = require('../src/utils/password');
const { processEmailQueue } = require('../src/services/email-worker.service');
const { sendEmail, renderEmail } = require('../src/services/email.service');
const { getSenders } = require('../src/config/email');
const app = require('../src/app');
const cases = [];
let server, replica;
async function check(name, action) { await action(); cases.push(name); console.log('PASS ' + name); }
async function main() {
  replica = await startDatabase();
  server = app.listen(0, '127.0.0.1');
  await new Promise(resolve => server.once('listening', resolve));
  const base = 'http://127.0.0.1:' + server.address().port + '/api/v1';
  const request = async (path, body, authorization) => {
    const response = await fetch(base + path, { method: 'POST', headers: { 'Content-Type': 'application/json', ...(authorization ? { authorization } : {}) }, body: JSON.stringify(body), signal: AbortSignal.timeout(10000) });
    return { status: response.status, ...(await response.json()) };
  };
  const deliveries = [];
  const transportFor = () => ({ sendMail: async message => { deliveries.push(message); return { accepted: [message.to] }; } });
  const resetState = async () => { await Promise.all([Job.deleteMany({}), Sender.deleteMany({}), Lease.deleteMany({})]); };
  const notice = name => sendEmail({ dedupeKey: 'fixture:' + name, kind: 'notification', to: 'recipient@example.com', subject: name, text: 'Example message', link: '/dashboard' });
  await check('disabled mail retains durable jobs; recovery endpoint and missing-account response do not disclose accounts', async () => {
    await notice('disabled');
    const outcome = await processEmailQueue({ prepare: false, transportFor });
    assert.equal(outcome.reason, 'EMAIL_DISABLED'); assert.equal(deliveries.length, 0);
    assert.equal((await Job.findOne()).status, 'queued');
    assert.equal((await request('/auth/forgot-password', { email: 'unknown@example.com' })).status, 503);
    assert.equal((await request('/jobs/email', {})).status, 503);
  });
  Object.assign(process.env, { EMAIL_PROVIDER: 'smtp', SMTP_HOST: 'smtp.example.test', SMTP_PORT: '587', SMTP_USERNAME: 'fixture-user', SMTP_PASSWORD: 'fixture-password', EMAIL_FROM_ADDRESS: 'events@example.test', SMTP_SENDER_INTERVAL_SECONDS: '1', FRONTEND_URL: 'https://events.example.test' });
  await check('SMTP credentials and secure port validation fail closed for malformed sender/configuration', async () => {
    assert.equal(getSenders().length, 1);
    const port = process.env.SMTP_PORT; process.env.SMTP_PORT = '25'; assert.equal(getSenders().length, 0); process.env.SMTP_PORT = port;
    const address = process.env.EMAIL_FROM_ADDRESS; process.env.EMAIL_FROM_ADDRESS = 'events@example.test\r\nBcc: victim@example.test'; assert.equal(getSenders().length, 0); process.env.EMAIL_FROM_ADDRESS = address;
  });
  await resetState();
  const user = await User.create({ name: 'Example account', email: 'recipient@example.com', passwordHash: hashPassword('FixtureOnly!2834'), profileComplete: true });
  await check('password reset is queued without changing password; superseded reset message is cancelled; latest secure link delivers once', async () => {
    const before = (await User.findById(user._id).select('+passwordHash')).passwordHash;
    const first = await request('/auth/forgot-password', { email: user.email });
    const second = await request('/auth/forgot-password', { email: user.email });
    assert.equal(first.status, 200); assert.equal(second.status, 200); assert.notEqual(first.debugToken, second.debugToken);
    assert.equal((await User.findById(user._id).select('+passwordHash')).passwordHash, before);
    const result = await processEmailQueue({ prepare: false, transportFor });
    assert.equal(result.sent, 1); assert.equal(await Job.countDocuments({ status: 'cancelled' }), 1);
    const last = deliveries.at(-1); assert.ok(last.html.includes('https://events.example.test/reset-password#token='));
    assert.equal(await Job.countDocuments({ status: 'sent', text: { $exists: true } }), 0);
    assert.equal((await processEmailQueue({ prepare: false, transportFor })).sent, 0);
  });
  await resetState();
  await check('account creation queues a success email with HTML escaping, purpose, and plain-text alternative', async () => {
    const response = await request('/auth/signup', { name: 'Example <Attendee>', email: 'new-user@example.com', password: 'FixtureOnly!2834' });
    assert.equal(response.status, 201);
    const queued = await Job.findOne({ kind: 'account_created' }).select('+text +link');
    assert.ok(queued); const rendered = await renderEmail(queued);
    assert.match(rendered.html, /Why are you receiving this email/); assert.match(rendered.text, /signed up/);
    assert.equal((await processEmailQueue({ prepare: false, transportFor })).sent, 1);
    const injected = await notice('Special <script> & chars');
    assert.match((await renderEmail(await Job.findById(injected._id).select('+text +link'))).html, /Special &lt;script&gt; &amp; chars/);
  });
  await resetState();
  await check('failed signup outbox insertion rolls back the new account', async () => {
    const original = Job.findOneAndUpdate;
    Job.findOneAndUpdate = async () => { throw new Error('FIXTURE_OUTBOX_FAILURE'); };
    try {
      const result = await request('/auth/signup', { name: 'Rolled back account', email: 'rollback-user@example.com', password: 'FixtureOnly!2834' });
      assert.equal(result.status, 500);
      assert.equal(await User.countDocuments({ email: 'rollback-user@example.com' }), 0);
      assert.equal(await Job.countDocuments({ to: 'rollback-user@example.com' }), 0);
    } finally { Job.findOneAndUpdate = original; }
  });
  await check('successful reset and profile password change queue secret-free alerts and invalidate old sessions; outbox failure rolls back password change', async () => {
    const reset = await request('/auth/forgot-password', { email: user.email }); assert.equal(reset.status, 200);
    const result = await request('/auth/reset-password', { token: reset.debugToken, newPassword: 'ChangedFixtureOnly!2834' }); assert.equal(result.status, 200);
    assert.equal((await request('/auth/reset-password', { token: reset.debugToken, newPassword: 'ChangedFixtureOnly!2834' })).status, 400);
    const login = await request('/auth/login', { email: user.email, password: 'ChangedFixtureOnly!2834' }); assert.equal(login.status, 200);
    const changed = await request('/profile/password', { currentPassword: 'ChangedFixtureOnly!2834', newPassword: 'SecondFixtureOnly!2834' }, 'Bearer ' + login.token); assert.equal(changed.status, 200);
    assert.equal((await fetch(base + '/auth/me', { headers: { authorization: 'Bearer ' + login.token } })).status, 401);
    const alerts = await Job.find({ kind: 'password_changed' }).select('+text +link'); assert.equal(alerts.length, 2);
    for (const alert of alerts) {
      const rendered = await renderEmail(alert); assert.ok(rendered);
      assert.ok(!rendered.html.includes(reset.debugToken)); assert.ok(!rendered.text.includes('FixtureOnly!2834'));
    }
    assert.equal((await processEmailQueue({ prepare: false, transportFor })).sent, 2);
    const fresh = await request('/auth/login', { email: user.email, password: 'SecondFixtureOnly!2834' });
    const before = (await User.findById(user._id).select('+passwordHash')).passwordHash;
    const original = Job.findOneAndUpdate; Job.findOneAndUpdate = async () => { throw new Error('FIXTURE_OUTBOX_FAILURE'); };
    try {
      const rollback = await request('/profile/password', { currentPassword: 'SecondFixtureOnly!2834', newPassword: 'RollbackFixtureOnly!2834' }, 'Bearer ' + fresh.token);
      assert.equal(rollback.status, 500); assert.equal((await User.findById(user._id).select('+passwordHash')).passwordHash, before);
    } finally { Job.findOneAndUpdate = original; }
  });
  await resetState();
  await check('active worker lease prevents duplicate deliveries; expired processing lease recovers a job', async () => {
    const job = await notice('lease');
    await Lease.create({ _id: 'email', owner: 'other-worker', until: new Date(Date.now() + 30000) });
    assert.equal((await processEmailQueue({ prepare: false, transportFor })).state, 'busy');
    await Lease.updateOne({ _id: 'email' }, { $set: { until: new Date(0) } });
    await Job.updateOne({ _id: job._id }, { $set: { status: 'processing', leaseUntil: new Date(0) } });
    assert.equal((await processEmailQueue({ prepare: false, transportFor })).sent, 1);
  });
  await resetState();
  await check('expired sensitive jobs are cancelled and redacted without SMTP', async () => {
    const job = await notice('expired'); const count = deliveries.length;
    await Job.updateOne({ _id: job._id }, { $set: { expiresAt: new Date(0) } });
    assert.equal((await processEmailQueue({ prepare: false, transportFor })).sent, 0);
    assert.equal(deliveries.length, count); const current = await Job.findById(job._id).select('+text +link');
    assert.equal(current.status, 'cancelled'); assert.equal(current.text, undefined); assert.equal(current.link, undefined);
  });
  await resetState();
  await check('SMTP daily limits preserve overflow; policy errors pause sender; transient errors back off', async () => {
    process.env.SMTP_DAILY_LIMIT = '1'; await notice('limit-one'); await notice('limit-two');
    assert.equal((await processEmailQueue({ prepare: false, transportFor })).sent, 1); assert.equal(await Job.countDocuments({ status: 'queued' }), 1);
    process.env.SMTP_DAILY_LIMIT = '100'; await Sender.updateMany({}, { $set: { nextAvailableAt: new Date(0) } });
    await processEmailQueue({ prepare: false, transportFor: () => ({ sendMail: async () => { throw Object.assign(new Error('fixture timeout'), { code: 'ETIMEDOUT' }); } }) });
    const queued = await Job.findOne({ status: 'queued' }); assert.equal(queued.lastError, 'SMTP_TRANSIENT'); assert.ok(queued.availableAt > new Date());
    await Job.updateOne({ _id: queued._id }, { $set: { availableAt: new Date(0) } }); await Sender.updateMany({}, { $set: { nextAvailableAt: new Date(0) } });
    await processEmailQueue({ prepare: false, transportFor: () => ({ sendMail: async () => { throw Object.assign(new Error('fixture authentication block'), { code: 'EAUTH' }); } }) });
    assert.equal((await processEmailQueue({ prepare: false, transportFor })).state, 'sender_paused');
  });
  await check('scheduled endpoint requires exact secret and does not accept client queue scope', async () => {
    process.env.EMAIL_WORKER_SECRET = 'fixture-worker-secret';
    assert.equal((await request('/jobs/email', {}, 'Bearer wrong-secret')).status, 401);
    // Authentication is exercised without invoking a real configured transport.
    process.env.EMAIL_PROVIDER = 'disabled';
    const result = await request('/jobs/email', { targetDedupeKey: 'fixture:any' }, 'Bearer fixture-worker-secret');
    assert.equal(result.status, 200); assert.equal(result.reason, 'EMAIL_DISABLED');
  });
  console.log(JSON.stringify({ suite: 'email-worker-integration', passed: cases.length, cases, isolation: 'memory MongoDB; real HTTP; injected fake SMTP; no external delivery' }));
}
main().catch(error => { console.error(error); process.exitCode = 1; }).finally(async () => {
  if (server) await new Promise(resolve => server.close(resolve));
  await require('../src/config/database').disconnectDatabase();
  if (replica) await replica.stop();
});
