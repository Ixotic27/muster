const crypto = require('crypto');
const mongoose = require('mongoose');
const { Registration, Event, Team, Payment } = require('../models');
const GatewayOrder = require('../models/GatewayOrder');
const { fail } = require('../utils/operations');
const { issuePasses } = require('./pass.service');
const { notifyRegistration } = require('./registration-lifecycle.service');

function configuration() {
  const keyId = process.env.RAZORPAY_KEY_ID || '';
  const keySecret = process.env.RAZORPAY_KEY_SECRET || '';
  const testMode = process.env.PAYMENT_TEST_MODE !== 'false';
  const validMode = testMode ? keyId.startsWith('rzp_test_') : keyId.startsWith('rzp_live_');
  return { keyId, keySecret, testMode, enabled: Boolean(validMode && keySecret), webhookSecret: process.env.RAZORPAY_WEBHOOK_SECRET || '' };
}
function digestMatches(body, signature, secret) {
  if (typeof signature !== 'string' || !/^[a-f0-9]{64}$/i.test(signature) || !secret) return false;
  const expected = crypto.createHmac('sha256', secret).update(body).digest();
  return crypto.timingSafeEqual(expected, Buffer.from(signature, 'hex'));
}
function amountPaise(amount) {
  const value = Number(amount), scaled = value * 100, rounded = Math.round(scaled);
  if (!Number.isFinite(value) || value < 1 || !Number.isSafeInteger(rounded) || Math.abs(scaled - rounded) > 0.000001) throw fail(400, 'Gateway fees must be at least INR 1 and have at most two decimal places');
  return rounded;
}
function identifier(value, prefix) {
  if (typeof value !== 'string' || !new RegExp('^' + prefix + '_[a-zA-Z0-9]{1,100}$').test(value)) throw fail(400, 'Invalid gateway identifier');
  return value;
}
function configured() {
  const config = configuration();
  if (!config.enabled) throw fail(503, 'Payment gateway is not configured for this environment');
  return config;
}
function defaultProvider(config) {
  async function request(path, options = {}) {
    let response;
    try {
      response = await fetch('https://api.razorpay.com/v1/' + path, { ...options, headers: { Authorization: 'Basic ' + Buffer.from(config.keyId + ':' + config.keySecret).toString('base64'), 'Content-Type': 'application/json' }, signal: AbortSignal.timeout(10000) });
    } catch (_) { throw fail(503, 'Payment provider is temporarily unavailable; please try again'); }
    if (!response.ok) throw fail(502, 'Payment provider could not complete this request');
    return response.json();
  }
  return { createOrder: data => request('orders', { method: 'POST', body: JSON.stringify(data) }), fetchPayment: id => request('payments/' + encodeURIComponent(id)) };
}
function eligibleEvent(event) {
  return Boolean(event && ['published', 'closed'].includes(event.status) && new Date(event.eventDate).getTime() > Date.now() && (!event.paymentDeadline || new Date(event.paymentDeadline).getTime() > Date.now()));
}
async function assertTeam(registration, event, session) {
  if (!registration.teamId) return;
  const team = await Team.findById(registration.teamId).session(session || null).lean();
  const members = team?.members.filter(member => member.status === 'accepted') || [];
  if (!team || team.status !== 'locked' || String(team.eventId) !== String(event._id) || String(team.leaderId) !== String(registration.leaderId)
    || members.length < (registration.minTeamSizeSnapshot ?? event.minTeamSize) || members.length > (registration.maxTeamSizeSnapshot ?? event.maxTeamSize)) throw fail(409, 'Complete and register an eligible team before payment');
}

// The provider is injected only by server-side tests, never selected from an API
// request or environment URL. Production requests always use Razorpay's host.
function createGatewayService({ providerFactory = defaultProvider } = {}) {
  async function createOrder(registrationId, userId) {
    const config = configured();
    const registration = await Registration.findOne({ _id: registrationId, leaderId: userId }).lean();
    if (!registration) throw fail(404, 'Registration not found');
    if (registration.status !== 'pending_payment') throw fail(409, 'Registration is not awaiting payment');
    const event = await Event.findById(registration.eventId).lean();
    if (!eligibleEvent(event)) throw fail(409, 'Payment collection is closed');
    await assertTeam(registration, event);
    const amount = amountPaise(registration.feeSnapshotInr);
    const existing = await GatewayOrder.findOne({ registrationId }).lean();
    if (existing) {
      if (existing.status !== 'created' || existing.keyId !== config.keyId || existing.amountPaise !== amount) throw fail(409, 'A payment order is already processing; contact an organizer if it does not complete');
      return checkout(existing, config);
    }
    let order;
    try { order = await GatewayOrder.create({ registrationId, eventId: event._id, payerId: userId, amountPaise: amount, keyId: config.keyId }); }
    catch (error) { if (error.code === 11000) throw fail(409, 'A payment order is already being created; retry shortly'); throw error; }
    try {
      const remote = await providerFactory(config).createOrder({ amount, currency: 'INR', receipt: String(order._id), partial_payment: false, notes: { registrationId: String(registrationId) } });
      identifier(remote.id, 'order');
      if (remote.amount !== amount || remote.currency !== 'INR' || remote.status !== 'created') throw fail(502, 'Payment provider returned an unexpected order');
      order.providerOrderId = remote.id;
      order.status = 'created';
      await order.save();
      return checkout(order, config);
    } catch (error) {
      // A timeout can mean an order was created remotely. Keep the reservation:
      // an organizer must reconcile it rather than risk creating a second order.
      order.status = 'failed';
      await order.save();
      throw error;
    }
  }
  function checkout(order, config) {
    return { success: true, keyId: config.keyId, testMode: config.testMode, registrationId: String(order.registrationId), order: { id: order.providerOrderId, amount: order.amountPaise, currency: order.currency } };
  }
  async function settle(order, remote, webhookEventId) {
    if (remote.id !== identifier(remote.id, 'pay') || remote.order_id !== order.providerOrderId || remote.amount !== order.amountPaise || remote.currency !== order.currency || remote.status !== 'captured' || remote.captured !== true) throw fail(409, 'Payment is not captured or does not match this registration');
    let result;
    await mongoose.connection.transaction(async session => {
      const current = await GatewayOrder.findById(order._id).session(session);
      if (!current || current.providerOrderId !== remote.order_id || current.keyId !== order.keyId) throw fail(409, 'Payment order changed');
      const registration = await Registration.findById(current.registrationId).session(session);
      if (!registration || String(registration.leaderId) !== String(current.payerId) || amountPaise(registration.feeSnapshotInr) !== current.amountPaise) throw fail(409, 'Registration payment details changed');
      if (['paid', 'review_required'].includes(current.status)) {
        if (current.providerPaymentId !== remote.id) throw fail(409, 'This order already has a different captured payment');
        result = { success: true, message: 'Payment was already processed.', status: registration.status, registrationId: String(registration._id), paymentId: String(current.paymentId), passCount: 0 };
        return;
      }
      if (current.status !== 'created') throw fail(409, 'Payment order is unavailable');
      // Serialize settlement with staff closing/changing the event so a capture
      // cannot confirm against an event configuration that changed concurrently.
      const event = await Event.findOneAndUpdate({ _id: current.eventId }, { $inc: { __v: 1 } }, { new: true, session });
      if (!event) throw fail(409, 'Event record is missing; contact an organizer to reconcile this payment');
      let eligible = registration.status === 'pending_payment' && !registration.paymentId && eligibleEvent(event);
      if (eligible) {
        try { await assertTeam(registration, event, session); }
        catch (error) { if (error.statusCode !== 409) throw error; eligible = false; }
      }
      const [payment] = await Payment.create([{ provider: 'razorpay', gatewayOrderId: current._id, providerPaymentId: remote.id, registrationId: registration._id, eventId: event._id, payerId: current.payerId, amountInr: current.amountPaise / 100, currency: current.currency, status: 'verified', reviewedAt: new Date() }], { session });
      if (!eligible) {
        // Money can be captured while an attendee withdraws or the event closes.
        // Record it once, never revive entry, and notify human refund reviewers.
        // An existing payment reference must not be overwritten by an unexpected
        // second capture; the separate receipt preserves reconciliation evidence.
        if (!registration.paymentId) {
          registration.paymentId = payment._id;
          registration.refundPreviousStatus = registration.status;
          registration.refundCapacityReserved = !['cancelled', 'refunded'].includes(registration.status);
          registration.status = 'refund_requested';
          registration.refundReason = 'Gateway payment captured after registration stopped accepting payment. Manual organizer reconciliation required.';
          registration.refundAmountInr = payment.amountInr;
          registration.refundRequestedAt = new Date();
          registration.refundReviewStatus = 'pending';
          await registration.save({ session });
          await notifyRegistration({ registration, event, type: 'refund_requested', title: 'Payment received; organizer review required: ' + event.name, staff: true,
            message: 'Payment ' + remote.id + ' was captured after this registration became unavailable. No entry pass has been issued and no refund has been sent automatically. An organizer will reconcile the payment and record the refund decision.', version: String(payment._id) }, { session });
        } else {
          const { createNotification } = require('./notification.service');
          const { User } = require('../models');
          const reviewers = await User.find({ isActive: true, $or: [{ role: { $in: ['admin', 'super_admin'] } }, { role: 'organizer', assignedEvents: event._id }] }).session(session).select('_id role');
          for (const user of reviewers) await createNotification({ userId: user._id, type: 'payment_review_required', title: 'Additional captured payment needs review',
            message: 'Registration ' + registration.regId + ' already has another payment. Additional gateway receipt ' + remote.id + ' (INR ' + payment.amountInr.toFixed(2) + ') was recorded. Reconcile it with the provider and contact the participant. No automatic refund or additional pass was issued.',
            eventId: event._id, registrationId: registration._id, audience: 'staff', link: user.role === 'organizer' ? '/manager?event=' + event._id : '/admin/registrations?q=' + encodeURIComponent(registration.regId), dedupeKey: 'gateway-review:' + payment._id + ':' + user._id }, { session });
        }
        current.status = 'review_required'; current.providerPaymentId = remote.id; current.paymentId = payment._id; current.settledAt = new Date();
        if (webhookEventId) current.lastWebhookEventId = webhookEventId;
        await current.save({ session });
        result = { success: true, message: 'Payment received. An organizer must review your registration before entry or a refund can be approved.', status: registration.status, reviewRequired: true, registrationId: String(registration._id), paymentId: String(payment._id), passCount: 0 };
        return;
      }
      registration.paymentId = payment._id;
      registration.status = event.requiresNOC && registration.nocStatus !== 'verified' ? 'pending_noc' : 'confirmed';
      await registration.save({ session });
      current.status = 'paid';
      current.providerPaymentId = remote.id;
      current.paymentId = payment._id;
      current.settledAt = new Date();
      if (webhookEventId) current.lastWebhookEventId = webhookEventId;
      await current.save({ session });
      await notifyRegistration({ registration, event, type: 'payment_verified', title: 'Payment confirmed: ' + event.name,
        message: 'Your INR ' + payment.amountInr.toFixed(2) + ' payment for registration ' + registration.regId + ' is confirmed. Receipt: ' + remote.id + '. ' + (registration.status === 'pending_noc' ? 'Your entry pass will be issued after the required document is approved.' : 'Your personal event entry pass is ready.'), version: String(payment._id) }, { session });
      const passes = registration.status === 'confirmed' ? await issuePasses(registration, event, null, { session }) : [];
      result = { success: true, message: 'Payment confirmed successfully.', status: registration.status, registrationId: String(registration._id), paymentId: String(payment._id), passCount: passes.length };
    });
    return result;
  }
  async function verify(input, userId) {
    const config = configured();
    identifier(input.razorpay_order_id, 'order'); identifier(input.razorpay_payment_id, 'pay');
    const order = await GatewayOrder.findOne({ registrationId: input.registrationId, payerId: userId, providerOrderId: input.razorpay_order_id }).lean();
    if (!order) throw fail(404, 'Payment order not found');
    if (order.keyId !== config.keyId) throw fail(409, 'Payment order belongs to another gateway configuration');
    if (!digestMatches(order.providerOrderId + '|' + input.razorpay_payment_id, input.razorpay_signature, config.keySecret)) throw fail(400, 'Invalid payment signature');
    const remote = await providerFactory(config).fetchPayment(input.razorpay_payment_id);
    return settle(order, remote);
  }
  async function webhook(rawBody, signature, eventId) {
    const config = configured();
    if (!config.webhookSecret) throw fail(503, 'Payment webhook is not configured');
    if (!Buffer.isBuffer(rawBody) || !digestMatches(rawBody, signature, config.webhookSecret)) throw fail(400, 'Invalid webhook signature');
    let payload;
    try { payload = JSON.parse(rawBody.toString('utf8')); } catch (_) { throw fail(400, 'Invalid webhook payload'); }
    if (!['payment.captured', 'order.paid'].includes(payload.event)) return { success: true, ignored: true };
    const entity = payload.payload?.payment?.entity;
    if (!entity) throw fail(400, 'Missing payment in webhook');
    identifier(entity.id, 'pay'); identifier(entity.order_id, 'order');
    const order = await GatewayOrder.findOne({ providerOrderId: entity.order_id }).lean();
    if (!order || order.keyId !== config.keyId) throw fail(404, 'Payment order not found');
    // Fetch current payment state as well as authenticating the raw webhook.
    // A delayed/replayed "captured" event must not revive a refunded payment.
    const remote = await providerFactory(config).fetchPayment(entity.id);
    if (entity.amount !== remote.amount || entity.currency !== remote.currency || entity.order_id !== remote.order_id) throw fail(409, 'Webhook payment details do not match the provider');
    return settle(order, remote, typeof eventId === 'string' ? eventId.slice(0, 150) : undefined);
  }
  return { createOrder, verify, webhook };
}
module.exports = { createGatewayService, configuration, digestMatches, amountPaise };
