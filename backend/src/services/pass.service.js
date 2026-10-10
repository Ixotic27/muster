const mongoose = require('mongoose');
const { Registration, Event, Team, Pass, Payment } = require('../models');
const { createPassToken } = require('./qr.service');
const { generatePassId } = require('../utils/passGenerator');
const { createNotification } = require('./notification.service');
const { fail } = require('../utils/operations');

// Confirmation, every attendee's pass, and the durable email notifications commit
// together. The registration write also serializes recovery with cancellation.
async function issuePasses(registration, _event, _team, { session } = {}) {
  if (!session) return mongoose.connection.transaction(transaction => issuePasses(registration, null, null, { session: transaction }));
  const current = await Registration.findOneAndUpdate(
    { _id: registration._id, status: { $in: ['confirmed', 'checked_in'] } },
    { $set: { passesIssuedAt: new Date() } }, { new: true, session }
  );
  if (!current) throw fail(409, 'Registration is no longer eligible for an entry pass');
  const event = await Event.findById(current.eventId).session(session);
  if (!event || !['published', 'closed'].includes(event.status)) throw fail(409, 'Event is unavailable for entry passes');
  if (new Date(event.eventDate).getTime() + 86400000 <= Date.now()) throw fail(409, 'This event has expired');
  if (event.requiresNOC && current.nocStatus !== 'verified') throw fail(409, 'NOC must be verified before issuing entry passes');
  if (current.feeSnapshotInr > 0 && !await Payment.exists({ _id: current.paymentId, registrationId: current._id, status: 'verified', amountInr: current.feeSnapshotInr }).session(session)) throw fail(409, 'Payment must be verified before issuing entry passes');
  const team = current.teamId ? await Team.findById(current.teamId).session(session) : null;
  if (current.teamId && (!team || team.status !== 'locked')) throw fail(409, 'Registered team is unavailable');
  const attendeeIds = team ? team.members.filter(member => member.status === 'accepted').map(member => member.userId) : [current.leaderId];
  const minTeamSize = current.minTeamSizeSnapshot ?? event.minTeamSize;
  const maxTeamSize = current.maxTeamSizeSnapshot ?? event.maxTeamSize;
  if (team && (attendeeIds.length < minTeamSize || attendeeIds.length > maxTeamSize)) throw fail(409, 'Registered team does not meet the event size requirements');
  const passes = [];
  for (const userId of attendeeIds) {
    let pass = await Pass.findOne({ registrationId: current._id, userId }).select('+token +qrDataUrl').session(session);
    if (!pass) {
      const passId = generatePassId(event.slug);
      const expiresAt = new Date(new Date(event.eventDate).getTime() + 86400000);
      const tokenData = await createPassToken({ passId, registrationId: current._id, eventId: event._id, userId, expiresAt });
      [pass] = await Pass.create([{ passId, registrationId: current._id, eventId: event._id, userId, token: tokenData.token, qrDataUrl: tokenData.qrDataUrl, expiresAt }], { session });
    }
    // An administrator's deliberate revocation must survive recovery/retries.
    if (pass.status !== 'issued') continue;
    passes.push(pass.toObject());
    await createNotification({ userId, type: 'pass_generated', title: `Your ${event.name} pass is ready`, message: 'Your registration is confirmed. Your personal entry QR and event details are included below.', link: '/dashboard/passes', passId: pass._id, dedupeKey: 'pass:' + pass._id }, { session });
  }
  return passes;
}

module.exports = { issuePasses };
