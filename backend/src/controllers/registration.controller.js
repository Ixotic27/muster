const { Event, Team, Registration } = require('../models');
const { generateRegId } = require('../utils/passGenerator');
const { isValidObjectId } = require('../utils/helpers');
const { Pass } = require('../models');
const { requestRefund, attachWithdrawal } = require('../services/refund.service');
const { notifyRegistration } = require('../services/registration-lifecycle.service');
const { registrationIsOpen } = require('../utils/eventAvailability');

async function createRegistration(req, res) {
  const { eventId, teamId } = req.body;
  const fail = message => Object.assign(new Error(message), { statusCode: 409 });
  if (!isValidObjectId(eventId) || (teamId && !isValidObjectId(teamId))) return res.status(400).json({ success: false, message: 'Valid event and team identifiers are required' });
  let registration, event, team;
  await require('mongoose').connection.transaction(async session => {
    await require('../models').User.updateOne({ _id: req.user._id }, { $inc: { teamMembershipVersion: 1 } }, { session });
    // Serialize a first registration with staff changes to event rules, even
    // when the event has no capacity limit.
    event = await Event.findOneAndUpdate({ _id: eventId, status: 'published' }, { $inc: { __v: 1 } }, { new: true, session });
    if (!registrationIsOpen(event)) throw fail('Event registration is closed');
    if (await Registration.exists({ eventId, $or: [{ leaderId: req.user._id }, ...(teamId ? [{ teamId }] : [])] }).session(session)) throw fail('A registration already exists for you or this team for this event, including cancelled registrations. Open your existing registration for details.');

    if (!teamId && await Team.exists({ eventId, members: { $elemMatch: { userId: req.user._id, status: 'accepted' } }, status: { $ne: 'cancelled' } }).session(session)) throw fail('You already belong to a team for this event');
    team = null;
    if (teamId) {
      if (event.participationType === 'solo') throw fail('This event only accepts solo registrations');
      team = await Team.findOneAndUpdate({ _id: teamId, eventId, leaderId: req.user._id, status: 'forming' }, { $set: { status: 'locked' } }, { new: true, session });
      if (!team) throw fail('Only the leader of a forming team can register');
      const members = team.members.filter(member => member.status === 'accepted');
      if (members.length < event.minTeamSize || members.length > event.maxTeamSize) throw fail('Team must contain ' + event.minTeamSize + '-' + event.maxTeamSize + ' members');
    } else if (event.participationType === 'team' || event.minTeamSize > 1) throw fail('A team is required for this event');
    const capacityFilter = { _id: event._id, status: 'published' };
    if (event.maxSlots) capacityFilter.$expr = { $lt: ['$filledSlots', '$maxSlots'] };
    const reserved = await Event.updateOne(capacityFilter, { $inc: { filledSlots: 1 } }, { session });
    if (!reserved.modifiedCount) throw fail('This event is full');
    [registration] = await Registration.create([{ regId: generateRegId(event.slug), eventId, leaderId: req.user._id, teamId: team?._id, feeSnapshotInr: event.feeInr, minTeamSizeSnapshot: event.minTeamSize, maxTeamSizeSnapshot: event.maxTeamSize,
      status: event.feeInr === 0 ? (event.requiresNOC ? 'pending_noc' : 'confirmed') : 'pending_payment', nocStatus: event.requiresNOC ? 'pending' : 'not_required' }], { session });
    await notifyRegistration({ registration, event, type: 'registration_created', title: 'Registration created: ' + event.name, initiationStaff: Boolean(team),
      message: 'Your registration reference is ' + registration.regId + '. ' + (event.feeInr ? 'Complete payment through the configured gateway, or submit proof when manual payment is enabled.' : event.requiresNOC ? 'Upload your NOC for approval.' : 'Your entry pass is being prepared.'),
      }, { session });
    if (registration.status === 'confirmed') await require('../services/pass.service').issuePasses(registration, event, team, { session });
  });
  return res.status(201).json({ success: true, registration });
}

async function listMyRegistrations(req, res) {
  const teamIds = await Team.find({ 'members': { $elemMatch: { userId: req.user._id, status: 'accepted' } } }).distinct('_id');
  const registrations = await Registration.find({ $or: [{ leaderId: req.user._id }, { teamId: { $in: teamIds } }] }).populate('eventId', 'slug name eventDate venue feeInr requiresNOC registrationMode teamFormationDeadline paymentDeadline registrationDeadline').populate('teamId', 'teamName members status').sort({ createdAt: -1 }).lean();
  for (const registration of registrations) {
    await attachWithdrawal(registration, req.user._id);
  }
  return res.json({ success: true, registrations });
}

async function getRegistration(req, res) {
  const teams = await Team.find({ 'members': { $elemMatch: { userId: req.user._id, status: 'accepted' } } }).distinct('_id');
  const registration = await Registration.findOne({ _id: req.params.id, $or: [{ leaderId: req.user._id }, { teamId: { $in: teams } }] }).populate('eventId').populate('teamId').lean();
  if (!registration) return res.status(404).json({ success: false, message: 'Registration not found' });
  await attachWithdrawal(registration, req.user._id);
  return res.json({ success: true, registration });
}

async function getRegistrationMembers(req, res) {
  const teams = await Team.find({ 'members': { $elemMatch: { userId: req.user._id, status: 'accepted' } } }).distinct('_id');
  const registration = await Registration.findOne({ _id: req.params.id, $or: [{ leaderId: req.user._id }, { teamId: { $in: teams } }] }).populate('teamId').lean();
  if (!registration) return res.status(404).json({ success: false, message: 'Registration not found' });
  const members = registration.teamId?.members || [{ userId: registration.leaderId }];
  return res.json({ success: true, members });
}

async function listMyPasses(req, res) {
  const passes = await Pass.find({ userId: req.user._id, status: 'issued' }).select('+token +qrDataUrl').populate('eventId', 'name slug eventDate venue').sort({ createdAt: -1 }).lean();
  return res.json({ success: true, passes: passes.map(({ token, ...pass }) => ({ ...pass, token, qrDataUrl: pass.qrDataUrl })) });
}

async function cancelRegistration(req, res) {
  const result = await requestRefund({ registrationId: req.params.id, userId: req.user._id, action: req.path.endsWith('/refund-request') ? 'request_refund' : 'cancel', reason: String(req.body.reason || 'Participant requested cancellation').trim(), requestId: req.id, ipAddress: req.ip });
  if (result.error) return res.status(result.error.status).json({ success: false, message: result.error.message });
  return res.json({ success: true, registration: result.registration, message: result.message });
}

module.exports = { createRegistration, listMyRegistrations, getRegistration, getRegistrationMembers, listMyPasses, cancelRegistration };
