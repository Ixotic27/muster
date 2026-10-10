const { Payment, Registration, Event, Team, Pass, AdminAction, User } = require('../models');
const { issuePasses } = require('../services/pass.service');
const { createNotification } = require('../services/notification.service');
const { approveRefund, rejectRefund } = require('../services/refund.service');
const { fail, pagination, pageInfo, searchRegex, registrationFilter } = require('../utils/operations');
const { certificateRecipientFields, certificateTeamPopulation, certificateRegistration } = require('../utils/academicProfile');

async function paymentQueue(req, res) {
  const filter = { status: req.query.status || 'submitted' };
  if (!['submitted', 'verified', 'rejected', 'refunded'].includes(filter.status)) throw fail(400, 'Invalid payment status');
  const paging = pagination(req.query);
  if (req.query.eventId) filter.eventId = req.query.eventId;
  if (filter.status === 'submitted') {
    // Withdrawn/refund-review proofs remain in financial history, but cannot be
    // verified through the ordinary payment queue once their registration moves.
    filter.registrationId = { $in: await Registration.find({ status: 'payment_submitted', ...(req.query.eventId ? { eventId: req.query.eventId } : {}) }).distinct('_id') };
  }
  const regex = searchRegex(req.query.q);
  if (regex) {
    const regs = await Registration.find(await registrationFilter({ q: req.query.q })).select('_id').lean();
    filter.$or = [{ utr: regex }, { registrationId: { $in: regs.map(r => r._id) } }];
  }
  const [payments, total] = await Promise.all([Payment.find(filter).populate('registrationId', 'regId status teamId leaderId feeSnapshotInr').populate('eventId', 'name slug feeInr').populate('payerId', 'name email studentId').sort({ createdAt: 1, _id: 1 }).skip(paging.skip).limit(paging.limit).lean(), Payment.countDocuments(filter)]);
  return res.json({ success: true, payments, pagination: pageInfo(total, paging) });
}

async function verifyPayment(req, res) {
  const currentPayment = await Payment.findById(req.params.id).select('status').lean();
  if (!currentPayment) return res.status(404).json({ success: false, message: 'Payment not found' });
  if (currentPayment.status !== 'submitted') return res.status(409).json({ success: false, message: `Payment is already ${currentPayment.status}` });
  let payment, registration, event, passes = [];
  await require('mongoose').connection.transaction(async session => {
    payment = await Payment.findOneAndUpdate({ _id: req.params.id, status: 'submitted' },
      { $set: { status: 'verified', reviewedBy: req.user._id, reviewedAt: new Date() } }, { new: true, session });
    if (!payment) throw Object.assign(new Error('Payment is missing or already reviewed'), { statusCode: 409 });
    event = await Event.findOneAndUpdate({ _id: payment.eventId }, { $inc: { __v: 1 } }, { new: true, session });
    if (!event || event.status === 'cancelled') throw Object.assign(new Error('Event is unavailable'), { statusCode: 409 });
    registration = await Registration.findOneAndUpdate({ _id: payment.registrationId, paymentId: payment._id, status: 'payment_submitted' },
      { $set: { nocStatus: event.requiresNOC ? 'pending' : 'not_required', status: event.requiresNOC ? 'pending_noc' : 'confirmed' } }, { new: true, session });
    if (!registration) throw Object.assign(new Error('Registration is no longer eligible for verification'), { statusCode: 409 });
    if (payment.amountInr !== registration.feeSnapshotInr || String(payment.eventId) !== String(registration.eventId) || String(payment.payerId) !== String(registration.leaderId)) throw fail(409, 'Payment amount or ownership does not match this registration');
    await createNotification({ userId: registration.leaderId, type: 'payment_verified', title: 'Payment verified: ' + event.name,
      message: 'Your payment of ₹' + payment.amountInr + ' for ' + event.name + ' (' + registration.regId + ') is verified. ' + (event.requiresNOC ? 'Upload your NOC to receive your entry pass.' : 'Your personal entry pass will follow in a separate email.'),
      link: '/registrations/' + registration._id, dedupeKey: 'payment-verified:' + payment._id }, { session });
    await AdminAction.create([{ actorId: req.user._id, action: 'payment_verified', targetType: 'payment', targetId: payment._id, details: { registrationId: registration._id }, requestId: req.id, ipAddress: req.ip }], { session });
    if (!event.requiresNOC) passes = await issuePasses(registration, event, null, { session });
  });
  return res.json({ success: true, payment: { id: payment._id, status: payment.status }, registration, passes });
}

async function rejectPayment(req, res) {
  const reason = String(req.body.reason || '').trim();
  if (!reason) return res.status(400).json({ success: false, message: 'A rejection reason is required' });
  let payment;
  await require('mongoose').connection.transaction(async session => {
  payment = await Payment.findOneAndUpdate(
    { _id: req.params.id, status: 'submitted' },
    { $set: { status: 'rejected', rejectionReason: reason, reviewedBy: req.user._id, reviewedAt: new Date() } },
    { new: true, session }
  );
  if (!payment) throw fail(409, 'Submitted payment not found or already reviewed');
  const registration = await Registration.findOneAndUpdate({ _id: payment.registrationId, paymentId: payment._id, status: 'payment_submitted' },
    { $set: { status: 'pending_payment' }, $unset: { paymentId: 1 } }, { new: true, session });
  if (!registration) throw fail(409, 'Registration is no longer eligible for payment review');
  await AdminAction.create([{ actorId: req.user._id, action: 'payment_rejected', targetType: 'payment', targetId: payment._id, details: { reason }, requestId: req.id, ipAddress: req.ip }], { session });
  await createNotification({ userId: registration.leaderId, type: 'payment_rejected', title: 'Payment proof needs attention', message: reason, link: '/registrations/' + registration._id, dedupeKey: 'payment-rejected:' + payment._id }, { session });
  });
  return res.json({ success: true, payment: { id: payment._id, status: payment.status, rejectionReason: reason } });
}

async function verifyNoc(req, res) {
  return require('./noc.controller').verifyNocDocument(req, res);
}

async function dashboard(req, res) {
  const [users, events, pendingPayments, confirmed, checkedIn, pendingNoc, refundRequests] = await Promise.all([
    User.countDocuments(), Event.countDocuments({ status: 'published' }), Payment.countDocuments({ status: 'submitted' }), Registration.countDocuments({ status: 'confirmed' }),
    Registration.countDocuments({ status: 'checked_in' }), Registration.countDocuments({ status: 'pending_noc' }), Registration.countDocuments({ status: 'refund_requested' })
  ]);
  return res.json({ success: true, stats: { users, events, pendingPayments, confirmed, checkedIn, pendingNoc, refundRequests } });
}

async function refundQueue(req, res) {
  const status = req.query.status || 'pending';
  if (!['pending', 'completed', 'rejected', 'all'].includes(status)) throw fail(400, 'Invalid refund queue status');
  const eventId = req.params.id || req.query.eventId;
  const filter = await registrationFilter({ ...req.query, eventId, status: undefined });
  if (status === 'pending') filter.status = 'refund_requested';
  else if (status === 'completed') filter.status = 'refunded';
  else if (status === 'rejected') filter.refundReviewStatus = 'rejected';
  else filter.refundRequestedAt = { $exists: true };
  const paging = pagination(req.query);
  const [registrations, total] = await Promise.all([
    Registration.find(filter).populate('eventId', 'name slug eventDate').populate('leaderId', 'name email studentId').populate('teamId', 'teamName members status').populate('paymentId', 'status amountInr utr').sort({ refundRequestedAt: 1, _id: 1 }).skip(paging.skip).limit(paging.limit).lean(),
    Registration.countDocuments(filter)
  ]);
  return res.json({ success: true, registrations, pagination: pageInfo(total, paging) });
}

async function approveRefundRequest(req, res) {
  const result = await approveRefund({ registrationId: req.params.registrationId, eventId: req.params.id, adminId: req.user._id, confirmed: req.body.confirmed, reference: req.body.reference, paymentReceivedConfirmed: req.body.paymentReceivedConfirmed, requestId: req.id, ipAddress: req.ip });
  if (result.error) return res.status(result.error.status).json({ success: false, message: result.error.message });
  return res.json({ success: true, registration: result.registration });
}

async function rejectRefundRequest(req, res) {
  const reason = String(req.body.reason || '').trim();
  if (!reason) return res.status(400).json({ success: false, message: 'A rejection reason is required' });
  const result = await rejectRefund({ registrationId: req.params.registrationId, eventId: req.params.id, adminId: req.user._id, reason, requestId: req.id, ipAddress: req.ip });
  if (result.error) return res.status(result.error.status).json({ success: false, message: result.error.message });
  return res.json({ success: true, registration: result.registration });
}

async function listUsers(req, res) {
  const { page, limit } = pagination(req.query);
  const filter = {};
  if (req.query.role) filter.role = req.query.role;
  if (req.query.q) {
    const query = String(req.query.q).trim().replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const regex = new RegExp(query, 'i');
    filter.$or = [{ name: regex }, { email: regex }, { studentId: regex }];
  }
  const [users, total] = await Promise.all([
    User.find(filter).select('-passwordHash -__v').sort({ createdAt: -1 }).skip((page - 1) * limit).limit(limit).lean(),
    User.countDocuments(filter)
  ]);
  return res.json({ success: true, users, pagination: { page, limit, total, pages: Math.ceil(total / limit) } });
}

async function changeUserRole(req, res) {
  if (req.user.role !== 'super_admin') return res.status(403).json({ success: false, message: 'Only a super admin can change roles' });
  const role = String(req.body.role || '');
  if (!['student', 'organizer', 'admin', 'super_admin'].includes(role)) return res.status(400).json({ success: false, message: 'Invalid role' });
  if (String(req.params.userId) === String(req.user._id)) throw fail(409, 'You cannot change your own role');
  const before = await User.findById(req.params.userId).select('role isActive').lean();
  if (!before) throw fail(404, 'User not found');
  if (!before.isActive) throw fail(409, 'Inactive accounts cannot receive staff access');
  const user = await User.findOneAndUpdate({ _id: before._id, role: before.role, isActive: true }, { $set: { role, ...(role === 'student' ? { assignedEvents: [] } : {}) } }, { new: true, runValidators: true }).select('-passwordHash -__v').lean();
  if (!user) return res.status(404).json({ success: false, message: 'User not found' });
  await AdminAction.create({ actorId: req.user._id, action: 'role_changed', targetType: 'user', targetId: user._id, details: { previousRole: before.role, role }, requestId: req.id, ipAddress: req.ip });
  return res.json({ success: true, user });
}

async function auditLogs(req, res) {
  const limit = Math.min(Math.max(Number(req.query.limit || 50), 1), 100);
  const filter = {};
  if (req.query.action) filter.action = req.query.action;
  if (req.query.targetType) filter.targetType = req.query.targetType;
  const logs = await AdminAction.find(filter).populate('actorId', 'name email role').sort({ createdAt: -1 }).limit(limit).lean();
  return res.json({ success: true, logs });
}

async function registrationQueue(req, res) {
  const filter = await registrationFilter(req.query), paging = pagination(req.query);
  const [registrations, total] = await Promise.all([
    Registration.find(filter).populate('eventId', 'name slug eventDate').populate('leaderId', certificateRecipientFields + ' phone').populate(certificateTeamPopulation).populate('paymentId', 'utr amountInr status screenshotUrl rejectionReason').sort({ createdAt: -1, _id: -1 }).skip(paging.skip).limit(paging.limit).lean(),
    Registration.countDocuments(filter)
  ]);
  return res.json({ success: true, registrations: registrations.map(certificateRegistration), pagination: pageInfo(total, paging) });
}
async function registrationDetails(req, res) {
  const registration = await Registration.findById(req.params.id).populate('eventId', 'name slug eventDate venue').populate('leaderId', certificateRecipientFields + ' phone').populate(certificateTeamPopulation).populate('paymentId').lean();
  if (!registration) throw fail(404, 'Registration not found');
  const passes = await Pass.find({ registrationId: registration._id }).populate('userId', certificateRecipientFields).select('-token -qrDataUrl').lean();
  return res.json({ success: true, registration: certificateRegistration(registration), passes });
}
module.exports = { paymentQueue, verifyPayment, rejectPayment, verifyNoc, dashboard, issuePasses, refundQueue, approveRefundRequest, rejectRefundRequest, listUsers, changeUserRole, auditLogs, registrationQueue, registrationDetails };
