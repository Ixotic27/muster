const mongoose = require('mongoose');
const { Registration, Pass, AdminAction, Payment, Event, Team, TeamInvite, User } = require('../models');
const { fail } = require('../utils/operations');
const { notifyRegistration } = require('./registration-lifecycle.service');
const id = value => String(value?._id || value);

function withdrawalPolicy(registration, event, payment, checkedIn = false) {
  const action = payment && ['submitted', 'verified'].includes(payment.status) ? 'request_refund' : 'cancel';
  const hours = Number(process.env.REFUND_CUTOFF_HOURS || 48);
  const cutoff = event?.eventDate ? new Date(new Date(event.eventDate).getTime() - (action === 'request_refund' ? (Number.isFinite(hours) && hours >= 0 ? hours : 48) * 3600000 : 0)) : null;
  let reason = '';
  if (!event || !cutoff || !Number.isFinite(cutoff.getTime())) reason = 'The event is unavailable.';
  else if (['cancelled', 'refund_requested', 'refunded', 'checked_in'].includes(registration.status) || checkedIn) reason = 'This registration has been withdrawn, is under review, or has already been used for entry.';
  else if (Date.now() >= cutoff.getTime()) reason = action === 'request_refund' ? 'The refund request window has closed.' : 'The event has started; online withdrawal is closed.';
  return { allowed: !reason, action, cutoff: cutoff && Number.isFinite(cutoff.getTime()) ? cutoff.toISOString() : null, reason };
}
async function attachWithdrawal(registration, userId) {
  const event = registration.eventId?._id ? registration.eventId : await Event.findById(registration.eventId).lean();
  const [payment, checkedIn] = await Promise.all([Payment.findOne({ registrationId: registration._id, status: { $in: ['submitted', 'verified'] } }).lean(), Pass.exists({ registrationId: registration._id, checkInStatus: 'checked_in' })]);
  const policy = withdrawalPolicy(registration, event, payment, Boolean(checkedIn));
  if (id(registration.leaderId) !== id(userId)) { policy.allowed = false; policy.reason = 'Only the registration owner or team leader can withdraw this registration.'; }
  registration.withdrawal = policy;
  return registration;
}
async function closeTeamActions(teamId, session) {
  const invites = await TeamInvite.find({ teamId, status: 'pending' }).select('_id').session(session).lean();
  await TeamInvite.updateMany({ teamId, status: 'pending' }, { $set: { status: 'expired', respondedAt: new Date() } }, { session });
  if (invites.length) await require('../models/EmailJob').updateMany({ inviteId: { $in: invites.map(entry => entry._id) }, status: { $in: ['queued', 'failed'] } }, { $set: { status: 'cancelled', lastError: 'TEAM_WITHDRAWN' }, $unset: { text: 1, link: 1 } }, { session });
}
async function releaseWithdrawal(registration, event, session) {
  if (registration.withdrawalCapacityReleasedAt) return;
  // Old refund requests released their reservation at request time.
  const legacyReleased = registration.refundRequestedAt && registration.refundCapacityReserved !== true;
  if (!legacyReleased) {
    const field = 'filledSlots';
    await Event.updateOne({ _id: event._id, [field]: { $gt: 0 } }, { $inc: { [field]: -1, __v: 1 } }, { session });
  }
  if (registration.teamId) {
    await Team.updateOne({ _id: registration.teamId, status: { $ne: 'cancelled' } }, { $set: { status: 'cancelled', closureReason: 'registration_withdrawn', deletedAt: new Date(), acceptingJoinRequests: false }, $inc: { rosterVersion: 1 } }, { session });
    await closeTeamActions(registration.teamId, session);
  }
  registration.withdrawalCapacityReleasedAt = new Date();
  registration.refundCapacityReserved = false;
}
async function requestRefund({ registrationId, userId, reason, action = 'request_refund', requestId, ipAddress }) {
  let result;
  await mongoose.connection.transaction(async session => {
    await User.updateOne({ _id: userId }, { $inc: { teamMembershipVersion: 1 } }, { session });
    const registration = await Registration.findOne({ _id: registrationId, leaderId: userId }).session(session);
    if (!registration) throw fail(404, 'Registration not found');
    const event = await Event.findOneAndUpdate({ _id: registration.eventId }, { $inc: { __v: 1 } }, { new: true, session });
    const payment = await Payment.findOne({ registrationId: registration._id, status: { $in: ['submitted', 'verified'] } }).session(session);
    const checkedIn = await Pass.exists({ registrationId: registration._id, checkInStatus: 'checked_in' }).session(session);
    const policy = withdrawalPolicy(registration, event, payment, Boolean(checkedIn));
    if (!policy.allowed) throw fail(409, policy.reason);
    if (action !== policy.action) throw fail(409, policy.action === 'request_refund' ? 'A payment has been submitted or verified. Raise a refund request instead of deleting this registration.' : 'This registration has no payment awaiting review or refund. Delete the unpaid registration instead.');
    if (payment && (id(payment._id) !== id(registration.paymentId) || id(payment.eventId) !== id(event._id) || id(payment.payerId) !== id(registration.leaderId) || payment.amountInr !== registration.feeSnapshotInr)) throw fail(409, 'Payment ownership or amount does not match this registration. Contact an administrator.');
    registration.refundPreviousStatus = registration.status;
    registration.cancellationReason = reason;
    registration.refundReason = reason;
    registration.status = action === 'request_refund' ? 'refund_requested' : 'cancelled';
    registration.cancelledAt = action === 'cancel' ? new Date() : undefined;
    if (action === 'request_refund') {
      registration.refundAmountInr = payment.amountInr;
      registration.refundRequestedAt = new Date();
      registration.refundReviewStatus = 'pending';
      registration.refundCapacityReserved = true;
      registration.refundReviewVersion = (registration.refundReviewVersion || 0) + 1;
    } else await releaseWithdrawal(registration, event, session);
    await registration.save({ session });
    await Pass.updateMany({ registrationId: registration._id, status: 'issued' }, { $set: { status: 'revoked' } }, { session });
    await AdminAction.create([{ actorId: userId, action: action === 'request_refund' ? 'refund_requested' : 'registration_cancelled', targetType: 'registration', targetId: registration._id, details: { reason, amountInr: action === 'request_refund' ? payment.amountInr : 0 }, requestId, ipAddress }], { session });
    await notifyRegistration({ registration, event, type: action === 'request_refund' ? 'refund_requested' : 'registration_cancelled', title: (action === 'request_refund' ? 'Refund request received: ' : 'Registration deleted: ') + event.name,
      message: action === 'request_refund' ? 'Withdrawal and refund review for ' + registration.regId + ' has been requested. No refund has been transferred yet. Entry passes and game access are disabled while staff review the payment. The team will be archived when the review is completed.' : 'Registration ' + registration.regId + ' has been withdrawn. Its team has been archived if applicable, and its entry passes and game access are no longer valid.',
      staff: action === 'request_refund', closureStaff: action === 'cancel' && Boolean(registration.teamId), version: registration.refundReviewVersion }, { session });
    result = { registration, refundRequested: action === 'request_refund', message: action === 'request_refund' ? 'Your refund request was sent to the event organizers and administrators. Entry passes are disabled until the review is completed.' : 'Your registration has been deleted. Its history is retained for your records.' };
  });
  return result;
}
async function reviewRefund({ registrationId, eventId, adminId, reason, confirmed, reference, paymentReceivedConfirmed, requestId, ipAddress }, approve) {
  let registration;
  await mongoose.connection.transaction(async session => {
    registration = await Registration.findOne({ _id: registrationId, ...(eventId ? { eventId } : {}), status: 'refund_requested' }).session(session);
    if (!registration) throw fail(409, 'Refund request is missing, outside this event, or already reviewed');
    const reviewer = await User.findOneAndUpdate({ _id: adminId, isActive: true, mustChangePassword: { $ne: true }, $or: [{ role: { $in: ['admin', 'super_admin'] } }, { role: 'organizer', assignedEvents: registration.eventId }] }, { $inc: { teamMembershipVersion: 1 } }, { new: true, session });
    if (!reviewer) throw fail(403, 'Active administrator or assigned event organizer access is required');
    const event = await Event.findOneAndUpdate({ _id: registration.eventId }, { $inc: { __v: 1 } }, { new: true, session });
    if (!event) throw fail(409, 'The event is unavailable');
    if (approve) {
      if (confirmed !== true || typeof reference !== 'string' || reference.trim().length < 3 || reference.trim().length > 120) throw fail(400, 'Confirm that the refund has actually been transferred and provide its reference (3–120 characters).');
      const payment = await Payment.findById(registration.paymentId).session(session);
      if (!payment || !['verified', 'submitted'].includes(payment.status) || id(payment.registrationId) !== id(registration._id) || id(payment.eventId) !== id(event._id) || id(payment.payerId) !== id(registration.leaderId) || payment.amountInr !== registration.refundAmountInr || payment.amountInr !== registration.feeSnapshotInr) throw fail(409, 'The payment cannot be matched to this refund request');
      if (payment.status === 'submitted' && paymentReceivedConfirmed !== true) throw fail(409, 'Confirm that the original payment was received in the bank before marking its refund completed.');
      payment.status = 'refunded'; payment.reviewedBy = reviewer._id; payment.reviewedAt = new Date(); await payment.save({ session });
      registration.status = 'refunded'; registration.refundedAt = new Date(); registration.refundReference = reference.trim(); registration.refundReviewStatus = 'completed';
    } else {
      if (typeof reason !== 'string' || reason.trim().length < 3 || reason.trim().length > 500) throw fail(400, 'A refund rejection reason (3–500 characters) is required');
      registration.status = 'cancelled'; registration.refundRejectionReason = reason.trim(); registration.refundReviewStatus = 'rejected';
    }
    registration.cancelledAt = new Date(); registration.refundReviewedAt = new Date(); registration.refundReviewedBy = reviewer._id;
    await releaseWithdrawal(registration, event, session);
    await registration.save({ session });
    await Pass.updateMany({ registrationId: registration._id, status: 'issued' }, { $set: { status: 'revoked' } }, { session });
    await AdminAction.create([{ actorId: reviewer._id, action: approve ? 'refund_approved' : 'refund_rejected', targetType: 'registration', targetId: registration._id, details: { reason, amountInr: registration.refundAmountInr, ...(approve ? { reference: registration.refundReference, originalReceiptConfirmed: paymentReceivedConfirmed === true } : {}) }, requestId, ipAddress }], { session });
    await notifyRegistration({ registration, event, type: approve ? 'refund_approved' : 'refund_rejected', title: (approve ? 'Refund completed: ' : 'Refund request declined: ') + event.name,
      message: approve ? 'The organizers recorded a completed refund of ₹' + registration.refundAmountInr + ' for ' + registration.regId + '. Transfer reference: ' + registration.refundReference + '. The registration and its team (if applicable) are now archived. Entry passes and game access are no longer valid. Check your bank account for the refund.' : 'Your refund request for ' + registration.regId + ' was declined: ' + registration.refundRejectionReason + '. No refund is recorded. Your voluntary withdrawal is complete and its team (if applicable) has been archived; entry passes and game access remain disabled.',
      closureStaff: Boolean(registration.teamId), version: registration.refundReviewVersion }, { session });
  });
  return { registration };
}
const approveRefund = args => reviewRefund(args, true);
const rejectRefund = args => reviewRefund(args, false);
module.exports = { requestRefund, approveRefund, rejectRefund, withdrawalPolicy, attachWithdrawal, closeTeamActions };
