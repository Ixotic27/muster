const mongoose = require('mongoose');
const { Pass, Event, Registration, AdminAction } = require('../models');
const { verifyToken, isExpired } = require('../services/qr.service');
const { isValidObjectId } = require('../utils/helpers');
const { fail } = require('../utils/operations');

async function verifyTicket(req, res) {
  const { token, eventId, scanId } = req.body;
  const payload = verifyToken(token);
  if (!payload || !isValidObjectId(payload.eventId) || !isValidObjectId(payload.registrationId) || !isValidObjectId(payload.sub)) return res.status(400).json({ success: false, code: 'INVALID_SIGNATURE', message: 'Invalid entry QR. Use the attendee’s EventFlow entry pass.' });
  if (!payload.exp || !Number.isFinite(Date.parse(payload.exp)) || isExpired(payload)) return res.status(400).json({ success: false, code: 'EXPIRED', message: 'This entry pass has expired' });
  if (String(eventId) !== String(payload.eventId)) return res.status(400).json({ success: false, code: 'WRONG_EVENT', message: 'This pass belongs to a different event. Select the matching checkpoint.' });
  if (typeof payload.passId !== 'string' || !/^PASS-[A-Z0-9-]{4,80}$/.test(payload.passId)) return res.status(400).json({ success: false, code: 'INVALID_PASS', message: 'Malformed entry pass' });
  let result;
  await mongoose.connection.transaction(async session => {
    const event = await Event.findOneAndUpdate({ _id: eventId }, { $inc: { __v: 1 } }, { new: true, session }).select('name slug eventDate venue status requiresNOC registrationMode teamFormationDeadline').lean();
    if (!event || !['published', 'closed'].includes(event.status)) throw Object.assign(fail(409, 'Entry is unavailable for this event'), { scanCode: 'EVENT_UNAVAILABLE' });
    const pass = await Pass.findOne({ passId: payload.passId, eventId, registrationId: payload.registrationId, userId: payload.sub, status: 'issued' }).select('+token').populate('userId', 'name studentId isActive').populate('scannedBy', 'name').session(session).lean();
    if (!pass || pass.token !== token) throw Object.assign(fail(404, 'Pass not found, replaced or revoked'), { scanCode: 'NOT_FOUND' });
    if (!pass.userId?.isActive) throw Object.assign(fail(409, 'This participant account is inactive'), { scanCode: 'ACCOUNT_INACTIVE' });
    if (pass.expiresAt && pass.expiresAt <= new Date()) throw Object.assign(fail(400, 'This entry pass has expired'), { scanCode: 'EXPIRED' });
    const registration = await Registration.findOne({ _id: pass.registrationId, status: { $in: ['confirmed', 'checked_in'] } }).session(session).lean();
    if (!registration) throw Object.assign(fail(409, 'Registration is cancelled or not confirmed'), { scanCode: 'REGISTRATION_INACTIVE' });

    const summary = { passId: pass.passId, event, attendee: { name: pass.userId.name, studentId: pass.userId.studentId }, checkedInAt: pass.checkedInAt };
    if (pass.checkInStatus === 'checked_in') {
      result = { success: false, code: 'ALREADY_CHECKED_IN', message: 'Entry was already recorded. Do not admit this pass again.', checkedInAt: pass.checkedInAt, scannedBy: pass.scannedBy, pass: summary }; return;
    }
    const when = new Date();
    const checkedIn = await Pass.updateOne({ _id: pass._id, status: 'issued', checkInStatus: 'pending' }, { $set: { checkInStatus: 'checked_in', checkedInAt: when, scannedBy: req.user._id, scanId } }, { session });
    if (!checkedIn.modifiedCount) throw Object.assign(fail(409, 'This pass cannot be checked in. Refresh and try again.'), { scanCode: 'PASS_UNAVAILABLE' });
    await Registration.updateOne({ _id: registration._id }, { $set: { status: 'checked_in' } }, { session });
    await AdminAction.create([{ actorId: req.user._id, action: 'entry_checked_in', targetType: 'pass', targetId: pass._id, details: { eventId }, requestId: req.id }], { session });
    result = { success: true, code: 'CHECKED_IN', message: 'Check the attendee’s identity document before admitting them.', pass: { ...summary, checkedInAt: when } };
  });
  return res.status(result.success ? 200 : 409).json(result);
}
async function stats(req, res) {
  const eventId = req.params.eventId;
  if (!isValidObjectId(eventId)) throw fail(400, 'Invalid event ID');
  if (!await Event.exists({ _id: eventId })) throw fail(404, 'Event not found');
  const [total, checkedIn, recent] = await Promise.all([
    Pass.countDocuments({ eventId, status: 'issued' }),
    Pass.countDocuments({ eventId, status: 'issued', checkInStatus: 'checked_in' }),
    Pass.find({ eventId, status: 'issued', checkInStatus: 'checked_in' }).select('passId checkedInAt userId scannedBy').populate('userId', 'name studentId').populate('scannedBy', 'name').sort({ checkedInAt: -1 }).limit(10).lean()
  ]);
  return res.json({ success: true, stats: { total, checkedIn, remaining: total - checkedIn }, recent });
}
module.exports = { verifyTicket, stats };
