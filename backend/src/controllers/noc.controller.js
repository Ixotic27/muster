const { Registration, Event, Team, AdminAction } = require('../models');
const { isValidObjectId } = require('../utils/helpers');
const { uploadNocDocument } = require('../services/upload.service');
const { createNotification } = require('../services/notification.service');
const { issuePasses } = require('../services/pass.service');
const { pagination, pageInfo, registrationFilter } = require('../utils/operations');

async function submitNoc(req, res) {
  const registrationId = req.params.registrationId;
  if (!isValidObjectId(registrationId) || !req.file) return res.status(400).json({ success: false, message: 'A registrationId and NOC document are required' });
  const registration = await Registration.findOne({ _id: registrationId, leaderId: req.user._id }).populate('eventId');
  if (!registration) return res.status(404).json({ success: false, message: 'Registration not found' });
  if (!registration.eventId || !['published', 'closed'].includes(registration.eventId.status)) return res.status(409).json({ success: false, message: 'NOC submissions are unavailable for this event' });
  if (!registration.eventId.requiresNOC) return res.status(409).json({ success: false, message: 'NOC is not required for this event' });
  if (registration.status !== 'pending_noc' || !['pending', 'rejected'].includes(registration.nocStatus)) return res.status(409).json({ success: false, message: 'Registration is not accepting an NOC document' });
  req.file.ownerId = req.user._id;
  const uploaded = await uploadNocDocument(req.file);
  try {
    const saved = await Registration.findOneAndUpdate({ _id: registration._id, status: 'pending_noc', nocStatus: registration.nocStatus, nocDocumentUrl: registration.nocDocumentUrl === undefined ? { $exists: false } : registration.nocDocumentUrl },
      { $set: { nocDocumentUrl: uploaded.url, nocStorageKey: uploaded.storageKey, nocSubmittedAt: new Date(), nocStatus: 'pending' }, $unset: { nocRejectionReason: 1 } }, { new: true });
    if (!saved) throw Object.assign(new Error('The NOC was reviewed or replaced while uploading. Refresh the registration.'), { statusCode: 409 });
    return res.status(201).json({ success: true, registration: { id: saved._id, status: saved.status, nocStatus: saved.nocStatus, nocDocumentUrl: saved.nocDocumentUrl } });
  } catch (error) {
    await uploaded.destroy?.().catch?.(() => {});
    throw error;
  }
}

async function getMyNoc(req, res) {
  const registration = await Registration.findOne({ _id: req.params.registrationId, leaderId: req.user._id }).select('status nocStatus nocDocumentUrl nocSubmittedAt nocRejectionReason').lean();
  if (!registration) return res.status(404).json({ success: false, message: 'Registration not found' });
  return res.json({ success: true, registration });
}

async function pendingNoc(req, res) {
  const filter = await registrationFilter({ ...req.query, status: 'pending_noc' }, { nocStatus: 'pending', nocDocumentUrl: { $exists: true, $ne: '' } });
  const paging = pagination(req.query);
  const [registrations, total] = await Promise.all([Registration.find(filter).populate('eventId', 'name slug eventDate').populate('leaderId', 'name email studentId').populate('teamId', 'teamName').sort({ nocSubmittedAt: 1, _id: 1 }).skip(paging.skip).limit(paging.limit).lean(), Registration.countDocuments(filter)]);
  return res.json({ success: true, registrations, pagination: pageInfo(total, paging) });
}

async function getNocDocument(req, res) {
  const registration = await Registration.findById(req.params.registrationId).select('nocDocumentUrl').lean();
  if (!registration?.nocDocumentUrl) return res.status(404).json({ success: false, message: 'NOC document not found' });
  return res.json({ success: true, documentUrl: registration.nocDocumentUrl });
}

async function verifyNocDocument(req, res) {
  let registration, passes;
  await require('mongoose').connection.transaction(async session => {
  registration = await Registration.findById(req.params.registrationId).session(session);
  const fail = (statusCode, message) => Object.assign(new Error(message), { statusCode });
  if (!registration) throw fail(404, 'Registration not found');
  const event = await Event.findById(registration.eventId).session(session);
  if (!event?.requiresNOC) throw fail(409, 'NOC is not required for this event');
  if (!registration.nocDocumentUrl) throw fail(409, 'Participant has not uploaded an NOC document');
  if (registration.status !== 'pending_noc' || registration.nocStatus !== 'pending') throw fail(409, 'This registration is not awaiting NOC review.');
  if (event.status === 'cancelled') throw fail(409, 'This event is cancelled');
  if (registration.feeSnapshotInr > 0 && !await require('../models').Payment.exists({ _id: registration.paymentId, status: 'verified' }).session(session)) throw fail(409, 'Payment must be verified before the NOC can be approved.');
  registration.nocStatus = 'verified';
  registration.status = 'confirmed';
  registration.nocRejectionReason = undefined;
  const approved = await Registration.updateOne({ _id: registration._id, status: 'pending_noc', nocStatus: 'pending', nocDocumentUrl: registration.nocDocumentUrl }, { $set: { nocStatus: 'verified', status: 'confirmed' }, $unset: { nocRejectionReason: 1 } }, { session });
  if (!approved.modifiedCount) throw fail(409, 'This NOC was already reviewed. Refresh the queue.');
  passes = await issuePasses(registration, event, null, { session });
  const currentForEscape = await Registration.findById(registration._id).session(session);
  await AdminAction.create([{ actorId: req.user._id, action: 'noc_verified', targetType: 'registration', targetId: registration._id, details: { passCount: passes.length }, requestId: req.id, ipAddress: req.ip }], { session });
  await createNotification({ userId: registration.leaderId, type: 'noc_verified', title: 'NOC verified', message: 'Your registration is confirmed and your entry pass is ready.', link: '/dashboard/passes', dedupeKey: 'noc-verified:' + registration._id }, { session });
  });
  return res.json({ success: true, registration, passes });
}

async function rejectNocDocument(req, res) {
  const reason = String(req.body.reason || '').trim();
  if (!reason) return res.status(400).json({ success: false, message: 'A rejection reason is required' });
  let registration;
  await require('mongoose').connection.transaction(async session => {
    registration = await Registration.findOneAndUpdate({ _id: req.params.registrationId, status: 'pending_noc', nocStatus: 'pending', nocDocumentUrl: { $exists: true, $ne: '' } },
      { $set: { nocStatus: 'rejected', nocRejectionReason: reason } }, { new: true, session });
    if (!registration) throw Object.assign(new Error('This NOC is missing or was already reviewed. Refresh the queue.'), { statusCode: 409 });
    await AdminAction.create([{ actorId: req.user._id, action: 'noc_rejected', targetType: 'registration', targetId: registration._id, details: { reason }, requestId: req.id, ipAddress: req.ip }], { session });
    // A rejection may be followed by a corrected upload and a second review.
    await createNotification({ userId: registration.leaderId, type: 'noc_rejected', title: 'NOC document needs attention', message: reason, link: '/registrations/' + registration._id }, { session });
  });
  return res.json({ success: true, registration: { id: registration._id, status: registration.status, nocStatus: registration.nocStatus, reason } });
}

module.exports = { submitNoc, getMyNoc, pendingNoc, getNocDocument, verifyNocDocument, rejectNocDocument };
