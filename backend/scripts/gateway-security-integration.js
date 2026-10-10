// Isolated replica-set database + injected provider + fake SMTP sink. No
// credentials, payments or messages are sent to a real external service.
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
process.env.NODE_ENV = 'test';
process.env.JWT_SECRET = 'isolated-test-jwt-secret-at-least-32-characters';
process.env.QR_SIGN_SECRET = 'isolated-test-qr-secret-at-least-32-characters';
process.env.FRONTEND_URL = 'https://events.example.test';
process.env.EMAIL_PROVIDER = 'smtp';
process.env.SMTP_HOST = 'smtp.example.test';
process.env.SMTP_PORT = '587';
process.env.SMTP_USERNAME = 'isolated-test-user';
process.env.SMTP_PASSWORD = 'isolated-test-password';
process.env.EMAIL_FROM_ADDRESS = 'events@example.test';
process.env.EMAIL_REPLY_TO = 'support@example.test';
process.env.SMTP_SENDER_INTERVAL_SECONDS = '1';
process.env.PAYMENT_TEST_MODE = 'true';
process.env.RAZORPAY_KEY_ID = 'rzp_test_IsolatedFixture';
process.env.RAZORPAY_KEY_SECRET = 'isolated-gateway-test-secret';
process.env.RAZORPAY_WEBHOOK_SECRET = 'isolated-webhook-test-secret';
const mongoose = require('mongoose');
const { MongoMemoryReplSet } = require('mongodb-memory-server');
const { User, Event, Registration, Payment, Pass, Team } = require('../src/models');
const GatewayOrder = require('../src/models/GatewayOrder');
const EmailJob = require('../src/models/EmailJob');
const EmailSender = require('../src/models/EmailSender');
const { createGatewayService, amountPaise, digestMatches, configuration } = require('../src/services/payment-gateway.service');
const { processEmailQueue } = require('../src/services/email-worker.service');
const signature = (body, secret) => crypto.createHmac('sha256', secret).update(body).digest('hex');
let orderCounter = 0;
const remotePayments = new Map();
const service = createGatewayService({ providerFactory: () => ({
  createOrder: async input => ({ id: 'order_Test' + (++orderCounter), amount: input.amount, currency: input.currency, status: 'created' }),
  fetchPayment: async id => { if (!remotePayments.has(id)) throw Object.assign(new Error('Missing fake payment'), { statusCode: 404 }); return remotePayments.get(id); }
}) });
const results = [];
async function check(name, action) { await action(); results.push(name); console.log('PASS ' + name); }
async function main() {
  const replica = await MongoMemoryReplSet.create({ replSet: { count: 1 } });
  try {
    await mongoose.connect(replica.getUri(), { dbName: 'isolated_gateway_tests' });
    await Promise.all([User, Event, Registration, Payment, Pass, Team, GatewayOrder, EmailJob, EmailSender].map(model => model.init()));
    const [owner, other, manager] = await User.create([
      { email: 'attendee@example.test', name: 'Example Attendee', profileComplete: true },
      { email: 'other@example.test', name: 'Other Attendee', profileComplete: true },
      { email: 'manager@example.test', name: 'Example Manager', role: 'admin', profileComplete: true }
    ]);
    let fixtureCounter = 0;
    async function fixture(overrides = {}) {
      const event = await Event.create({ slug: 'example-event-' + (++fixtureCounter), name: 'Example Workshop', category: 'technical', participationType: 'solo', minTeamSize: 1, maxTeamSize: 1, feeInr: 75, eventDate: new Date(Date.now() + 7 * 86400000), venue: 'Example Hall', status: 'published', ...overrides });
      const registration = await Registration.create({ eventId: event._id, leaderId: owner._id, regId: 'REG-EXAMPLE-' + fixtureCounter, feeSnapshotInr: 75, status: 'pending_payment', nocStatus: event.requiresNOC ? 'pending' : 'not_required' });
      return { event, registration };
    }
    function paymentInput(registration, checkout, id, fields = {}) {
      remotePayments.set(id, { id, order_id: checkout.order.id, amount: checkout.order.amount, currency: 'INR', status: 'captured', captured: true, ...fields });
      return { registrationId: String(registration._id), razorpay_order_id: checkout.order.id, razorpay_payment_id: id, razorpay_signature: signature(checkout.order.id + '|' + id, process.env.RAZORPAY_KEY_SECRET) };
    }
    await check('fee conversion rejects fractional subunits and zero; HMAC comparison rejects malformed input', async () => {
      assert.equal(amountPaise(75.25), 7525); assert.throws(() => amountPaise(0), /at least/); assert.throws(() => amountPaise(1.001), /decimal/);
      assert.equal(digestMatches('body', 'short', 'secret'), false);
    });
    await check('unconfigured or mismatched live keys fail closed', async () => {
      const saved = process.env.RAZORPAY_KEY_ID; delete process.env.RAZORPAY_KEY_ID;
      assert.equal(configuration().enabled, false); await assert.rejects(service.createOrder(new mongoose.Types.ObjectId(), owner._id), error => error.statusCode === 503);
      process.env.RAZORPAY_KEY_ID = ['rzp', 'live', 'InvalidInTest'].join('_'); assert.equal(configuration().enabled, false); process.env.RAZORPAY_KEY_ID = saved;
    });
    const { event, registration } = await fixture();
    let checkout, input;
    await check('orders enforce ownership, server fee, and reuse a single provider order', async () => {
      await assert.rejects(service.createOrder(registration._id, other._id), error => error.statusCode === 404);
      checkout = await service.createOrder(registration._id, owner._id); assert.equal(checkout.order.amount, 7500);
      assert.equal((await service.createOrder(registration._id, owner._id)).order.id, checkout.order.id); assert.equal(orderCounter, 1);
    });
    await check('checkout rejects signature tampering and cross-account verification', async () => {
      input = paymentInput(registration, checkout, 'pay_ExampleCaptured');
      await assert.rejects(service.verify({ ...input, razorpay_signature: '0'.repeat(64) }, owner._id), error => error.statusCode === 400);
      await assert.rejects(service.verify(input, other._id), error => error.statusCode === 404);
      assert.equal(await Payment.countDocuments({}), 0);
    });
    await check('authorized, wrong amount, wrong currency and wrong order never issue passes', async () => {
      for (const fields of [{ status: 'authorized', captured: false }, { amount: 1 }, { currency: 'USD' }, { order_id: 'order_Another' }]) {
        const bad = paymentInput(registration, checkout, 'pay_ExampleCaptured', fields);
        await assert.rejects(service.verify(bad, owner._id), error => error.statusCode === 409);
      }
      assert.equal(await Pass.countDocuments({}), 0); input = paymentInput(registration, checkout, 'pay_ExampleCaptured');
    });
    await check('captured payment commits registration, individual pass, receipt and pass email jobs together', async () => {
      const result = await service.verify(input, owner._id); assert.equal(result.status, 'confirmed'); assert.equal(result.passCount, 1);
      assert.equal(await Payment.countDocuments({ provider: 'razorpay', status: 'verified' }), 1);
      assert.equal(await Pass.countDocuments({ registrationId: registration._id }), 1);
      assert.equal(await EmailJob.countDocuments({ kind: 'payment_verified' }), 1);
      assert.equal(await EmailJob.countDocuments({ kind: 'pass_generated' }), 1);
    });
    await check('callback and authenticated raw-body webhook replays are idempotent', async () => {
      await service.verify(input, owner._id);
      const payload = Buffer.from(JSON.stringify({ event: 'payment.captured', payload: { payment: { entity: remotePayments.get(input.razorpay_payment_id) } } }));
      await service.webhook(payload, signature(payload, process.env.RAZORPAY_WEBHOOK_SECRET), 'evt_Example');
      await service.webhook(payload, signature(payload, process.env.RAZORPAY_WEBHOOK_SECRET), 'evt_Example');
      assert.equal(await Payment.countDocuments({}), 1); assert.equal(await Pass.countDocuments({}), 1); assert.equal(await EmailJob.countDocuments({}), 2);
      await assert.rejects(service.webhook(Buffer.from(payload.toString() + ' '), signature(payload, process.env.RAZORPAY_WEBHOOK_SECRET), 'evt_Tampered'), error => error.statusCode === 400);
      await assert.rejects(service.webhook(JSON.parse(payload), signature(payload, process.env.RAZORPAY_WEBHOOK_SECRET), 'evt_NotRaw'), error => error.statusCode === 400);
    });
    await check('receipt and QR-pass emails reach a fake SMTP sink once despite retries', async () => {
      const messages = [];
      const fakeTransport = { sendMail: async mail => { messages.push(mail); return { accepted: [mail.to], rejected: [], messageId: 'fake-message' }; } };
      const outcome = await processEmailQueue({ prepare: false, transportFor: () => fakeTransport });
      if (messages.length !== 2) console.log('Fake SMTP diagnostic', outcome, await EmailJob.find().select('kind status lastError').lean());
      assert.equal(messages.length, 2); assert.ok(messages.every(mail => mail.html && mail.text));
      assert.ok(messages.find(mail => /Payment confirmed/.test(mail.subject))); assert.ok(messages.find(mail => /pass is ready/.test(mail.subject)));
      await EmailSender.updateMany({}, { $set: { nextAvailableAt: new Date(0) } });
      await processEmailQueue({ prepare: false, transportFor: () => fakeTransport }); assert.equal(messages.length, 2);
    });
    await check('pending required document blocks pass until separate approval', async () => {
      const item = await fixture({ requiresNOC: true }); const order = await service.createOrder(item.registration._id, owner._id);
      const result = await service.verify(paymentInput(item.registration, order, 'pay_DocumentPending'), owner._id);
      assert.equal(result.status, 'pending_noc'); assert.equal(result.passCount, 0); assert.equal(await Pass.countDocuments({ registrationId: item.registration._id }), 0);
    });
    await check('cancelled registration captures become manual refund requests and never revive entry', async () => {
      const item = await fixture(); const order = await service.createOrder(item.registration._id, owner._id);
      await Registration.updateOne({ _id: item.registration._id }, { $set: { status: 'cancelled' } });
      const result = await service.verify(paymentInput(item.registration, order, 'pay_LateCapture'), owner._id);
      assert.equal(result.reviewRequired, true); assert.equal(result.status, 'refund_requested'); assert.equal(result.passCount, 0);
      const current = await Registration.findById(item.registration._id); assert.equal(current.refundReviewStatus, 'pending'); assert.equal(current.refundCapacityReserved, false);
      assert.equal(await EmailJob.countDocuments({ registrationId: item.registration._id, kind: 'refund_review_requested' }), 1);
    });
    await check('unknown signed webhook order and signed amount mismatch are rejected', async () => {
      const payload = Buffer.from(JSON.stringify({ event: 'payment.captured', payload: { payment: { entity: { id: 'pay_Unknown', order_id: 'order_Unknown', amount: 7500, currency: 'INR' } } } }));
      await assert.rejects(service.webhook(payload, signature(payload, process.env.RAZORPAY_WEBHOOK_SECRET)), error => error.statusCode === 404);
      const mismatch = Buffer.from(JSON.stringify({ event: 'payment.captured', payload: { payment: { entity: { ...remotePayments.get(input.razorpay_payment_id), amount: 1 } } } }));
      await assert.rejects(service.webhook(mismatch, signature(mismatch, process.env.RAZORPAY_WEBHOOK_SECRET)), error => error.statusCode === 409);
    });
    await check('closed event stops new orders; existing order cannot settle a second different payment', async () => {
      const item = await fixture({ status: 'cancelled' }); await assert.rejects(service.createOrder(item.registration._id, owner._id), error => error.statusCode === 409);
      const second = paymentInput(registration, checkout, 'pay_UnexpectedSecond'); await assert.rejects(service.verify(second, owner._id), error => error.statusCode === 409);
    });
    await check('manual proof racing an existing gateway capture preserves the original receipt and records additional capture exactly once', async () => {
      const item = await fixture(); const order = await service.createOrder(item.registration._id, owner._id);
      const manual = await Payment.create({ provider: 'manual', registrationId: item.registration._id, eventId: item.event._id, payerId: owner._id, amountInr: 75, utr: 'fixture-manual-race', screenshotUrl: '/api/v1/files/example', status: 'submitted' });
      await Registration.updateOne({ _id: item.registration._id }, { $set: { status: 'payment_submitted', paymentId: manual._id } });
      const captured = paymentInput(item.registration, order, 'pay_ManualSubmissionRace');
      const result = await service.verify(captured, owner._id); assert.equal(result.reviewRequired, true); assert.equal(result.passCount, 0);
      await service.verify(captured, owner._id);
      const current = await Registration.findById(item.registration._id);
      assert.equal(String(current.paymentId), String(manual._id)); assert.equal(current.status, 'payment_submitted');
      assert.equal(await Payment.countDocuments({ registrationId: item.registration._id }), 2);
      assert.equal(await Pass.countDocuments({ registrationId: item.registration._id }), 0);
      assert.equal((await GatewayOrder.findOne({ registrationId: item.registration._id })).status, 'review_required');
      assert.equal(await EmailJob.countDocuments({ registrationId: item.registration._id, kind: 'payment_review_required' }), 1);
    });
    await check('rejected manual proof can switch to gateway; old receipt remains historical and cannot be approved again', async () => {
      const item = await fixture();
      const [manual] = await Payment.create([{ provider: 'manual', registrationId: item.registration._id, eventId: item.event._id, payerId: owner._id, amountInr: 75, utr: 'fixture-rejected-manual', screenshotUrl: '/api/v1/files/example', status: 'submitted' }]);
      await Registration.updateOne({ _id: item.registration._id }, { $set: { status: 'payment_submitted', paymentId: manual._id } });
      const { rejectPayment, verifyPayment } = require('../src/controllers/admin.controller');
      const request = { params: { id: String(manual._id) }, body: { reason: 'Unreadable example proof' }, user: manager, id: 'fixture-manual-reject', ip: '127.0.0.1' };
      let reply;
      await rejectPayment(request, { json: value => { reply = value; return value; } });
      assert.equal(reply.payment.status, 'rejected');
      const current = await Registration.findById(item.registration._id); assert.equal(current.status, 'pending_payment'); assert.equal(current.paymentId, undefined);
      assert.equal((await Payment.findById(manual._id)).status, 'rejected');
      const order = await service.createOrder(item.registration._id, owner._id);
      const captured = paymentInput(item.registration, order, 'pay_AfterManualRejection');
      const result = await service.verify(captured, owner._id); assert.equal(result.status, 'confirmed'); assert.equal(result.passCount, 1);
      await service.verify(captured, owner._id); assert.equal(await Pass.countDocuments({ registrationId: item.registration._id }), 1);
      let code = 200; await verifyPayment(request, { status: value => { code = value; return { json: value => value }; }, json: value => value });
      assert.equal(code, 409); assert.equal(await Payment.countDocuments({ registrationId: item.registration._id }), 2);
    });
    console.log(JSON.stringify({ suite: 'gateway-security-integration', passed: results.length, cases: results, isolation: 'memory MongoDB; fake gateway; fake SMTP; no real external services' }));
  } finally { await mongoose.disconnect(); await replica.stop(); }
}
main().catch(error => { console.error(error); process.exitCode = 1; });
