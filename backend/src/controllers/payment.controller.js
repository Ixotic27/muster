const { Payment, Registration, Event } = require('../models');
const { normalizeUtr, isValidObjectId } = require('../utils/helpers');
const { uploadPaymentScreenshot } = require('../services/upload.service');
const mongoose = require('mongoose');
const QRCode = require('qrcode');
const { fail } = require('../utils/operations');

function canCollectPayment(event, registration) {
  return event && ['published', 'closed'].includes(event.status) && new Date(event.eventDate).getTime() > Date.now()
    && (!event.paymentDeadline || new Date(event.paymentDeadline).getTime() > Date.now())
    && process.env.ENABLE_MANUAL_PAYMENTS === 'true';
}

async function paymentIntent(req, res) {
  const registration = await Registration.findOne({ _id: req.params.registrationId, leaderId: req.user._id }).populate('eventId').lean();
  if (!registration) return res.status(404).json({ success: false, message: 'Registration not found' });
  if (registration.status !== 'pending_payment') return res.status(409).json({ success: false, message: 'This registration is not awaiting a payment.' });
  if (!canCollectPayment(registration.eventId, registration)) throw fail(409, 'Payment collection is unavailable or its deadline has passed');
  const upiId = registration.eventId.paymentUpiId || process.env.PAYMENT_UPI_ID;
  if (!upiId) return res.status(503).json({ success: false, message: 'Payment collection is not configured yet.' });
  const params = new URLSearchParams({ pa: upiId, pn: process.env.PAYMENT_UPI_NAME || 'EventFlow', am: registration.feeSnapshotInr.toFixed(2), cu: 'INR', tn: registration.regId });
  const intentUrl = `upi://pay?${params}`;
  return res.json({ success: true, amountInr: registration.feeSnapshotInr, upiId, intentUrl, testMode: process.env.PAYMENT_TEST_MODE !== 'false', qrDataUrl: await QRCode.toDataURL(intentUrl, { width: 400, margin: 3, errorCorrectionLevel: 'M' }) });
}

async function submitPayment(req, res) {
  const { registrationId } = req.body;
  const utr = normalizeUtr(req.body.utr);
  if (!isValidObjectId(registrationId) || !utr || !req.file) return res.status(400).json({ success: false, message: 'registrationId, UTR, and screenshot are required' });
  if (!/^\d{8,22}$/.test(utr)) return res.status(400).json({ success: false, message: 'UTR must contain 8-22 digits' });

  const registration = await Registration.findOne({ _id: registrationId, leaderId: req.user._id }).populate('eventId');
  if (!registration) return res.status(404).json({ success: false, message: 'Registration not found' });
  if (registration.status !== 'pending_payment') return res.status(409).json({ success: false, message: 'A payment proof is already under review or this registration is no longer accepting proof.' });
  if (!canCollectPayment(registration.eventId, registration)) throw fail(409, 'Payment collection is unavailable or its deadline has passed');

  if (await require('../models/GatewayOrder').exists({registrationId:registration._id,status:{$in:['creating','created','paid']}})) throw fail(409,'A gateway checkout exists for this registration. Complete that checkout or contact staff.');
  const duplicate = await Payment.exists({ utr });
  if (duplicate) return res.status(409).json({ success: false, message: 'This UTR has already been submitted for the event' });

  req.file.ownerId = req.user._id;
  const uploaded = await uploadPaymentScreenshot(req.file);
  let payment;
  try {
    await mongoose.connection.transaction(async session => {
    const current = await Registration.findOneAndUpdate({ _id: registration._id, status: 'pending_payment' },{$inc:{__v:1}},{new:true,session});
    if (await require('../models/GatewayOrder').exists({registrationId:registration._id,status:{$in:['creating','created','paid']}}).session(session)) throw fail(409,'A gateway checkout exists for this registration.');
    if (!current) { const error = new Error('Payment proof is already under review.'); error.statusCode = 409; throw error; }
    const event = await Event.findOneAndUpdate({ _id: current.eventId, status: { $in: ['published', 'closed'] } }, { $inc: { __v: 1 } }, { new: true, session });
    if (!canCollectPayment(event, current)) throw fail(409, 'Payment collection is unavailable or its deadline has passed');
    [payment] = await Payment.create([{
      registrationId: registration._id,
      eventId: registration.eventId._id,
      payerId: req.user._id,
      utr,
      amountInr: registration.feeSnapshotInr,
      screenshotUrl: uploaded.url,
      storageKey: uploaded.storageKey,
      attempt: await Payment.countDocuments({ registrationId: registration._id }).session(session) + 1
    }], { session });
    current.paymentId = payment._id;
    current.status = 'payment_submitted';
    await current.save({ session });
    await require('../services/notification.service').createNotification({ userId: req.user._id, type: 'payment_submitted', title: 'Payment proof received: ' + registration.eventId.name, message: 'We received your proof for ' + registration.regId + '. An organizer will match it against the received bank transaction. Your entry pass is issued after approval.', link: '/registrations/' + registration._id, dedupeKey: 'payment-submitted:' + payment._id }, { session });
    });
    return res.status(201).json({ success: true, payment: { id: payment._id, status: payment.status, utr: payment.utr, amountInr: payment.amountInr } });
  } catch (error) {
    await uploaded.destroy?.().catch?.(() => {});
    if (error.code === 11000) return res.status(409).json({ success: false, message: 'This UTR has already been submitted for the event' });
    throw error;
  }
}

async function listMyPayments(req, res) {
  const registrationIds = await Registration.find({ leaderId: req.user._id }).distinct('_id');
  const payments = await Payment.find({ registrationId: { $in: registrationIds } }).select('-screenshotUrl -storageKey').sort({ createdAt: -1 }).lean();
  return res.json({ success: true, payments });
}

async function getPayment(req, res) {
  const payment = await Payment.findById(req.params.id).populate('eventId', 'name slug feeInr').populate('registrationId', 'regId status leaderId').lean();
  if (!payment) return res.status(404).json({ success: false, message: 'Payment not found' });
  const owns = String(payment.payerId) === String(req.user._id) || String(payment.registrationId?.leaderId) === String(req.user._id);
  if (!owns && !['admin', 'super_admin'].includes(req.user.role)) return res.status(403).json({ success: false, message: 'Not permitted' });
  delete payment.storageKey;
  if (!['admin', 'super_admin'].includes(req.user.role)) delete payment.screenshotUrl;
  return res.json({ success: true, payment });
}

async function getPaymentScreenshot(req, res) {
  const payment = await Payment.findById(req.params.id).lean();
  if (!payment) return res.status(404).json({ success: false, message: 'Payment not found' });
  const registration = await Registration.findOne({ _id: payment.registrationId, leaderId: req.user._id }).lean();
  if (!registration && !['admin', 'super_admin'].includes(req.user.role)) return res.status(403).json({ success: false, message: 'Not permitted' });
  return res.json({ success: true, screenshotUrl: payment.screenshotUrl });
}

module.exports = { paymentIntent, submitPayment, listMyPayments, getPayment, getPaymentScreenshot };
