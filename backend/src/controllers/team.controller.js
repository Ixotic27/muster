const { Event, Team, TeamInvite, User } = require('../models');
const { randomToken } = require('../config/env');
const { isValidObjectId } = require('../utils/helpers');
const { registrationIsOpen } = require('../utils/eventAvailability');
const { fail } = require('../utils/operations');
const mongoose = require('mongoose');

function memberSnapshot(user) {
  return { userId: user._id, nameSnapshot: user.name, studentIdSnapshot: user.studentId, emailSnapshot: user.email, status: 'accepted' };
}

async function addMemberAtomically(teamId, userId, member, maxTeamSize, session) {
  if (!session) {
    return mongoose.connection.transaction(transaction => addMemberAtomically(teamId, userId, member, maxTeamSize, transaction));
  }
  await User.updateOne({ _id: userId }, { $inc: { teamMembershipVersion: 1 } }, { session });
  const team = await Team.findById(teamId).session(session);
  const observedEvent = team ? await Event.findById(team.eventId).session(session) : null;

  const event = team ? await Event.findOneAndUpdate({ _id: team.eventId, status: 'published' }, { $inc: { __v: 1 } }, { new: true, session }) : null;
  if (!registrationIsOpen(event)) return null;
  // The limit supplied by an earlier request read may be stale after a staff edit.
  maxTeamSize = event.maxTeamSize;
  if (!team || await Team.exists({ eventId: team.eventId, status: { $ne: 'cancelled' }, members: { $elemMatch: { userId, status: 'accepted' } } }).session(session)) return null;
  if (await require('../models').Registration.exists({ eventId: team.eventId, leaderId: userId, status: { $nin: ['cancelled', 'refunded'] } }).session(session)) return null;
  return Team.findOneAndUpdate(
    { _id: teamId, status: 'forming', members: { $not: { $elemMatch: { userId, status: 'accepted' } } }, $expr: { $lt: [{ $size: { $filter: { input: '$members', as: 'entry', cond: { $eq: ['$$entry.status', 'accepted'] } } } }, maxTeamSize] } },
    { $push: { members: member }, $inc: { rosterVersion: 1 } },
    { new: true, session }
  );
}

async function createTeam(req, res) {
  const { eventId, teamName } = req.body;
  if (!isValidObjectId(eventId) || !teamName?.trim()) return res.status(400).json({ success: false, message: 'eventId and teamName are required' });
  const observedEvent = await Event.findById(eventId);

  const joinCode = `TEAM-${randomToken(4).slice(0, 6).toUpperCase()}`;
  try {
    let team;
    await mongoose.connection.transaction(async session => {
      await User.updateOne({ _id: req.user._id }, { $inc: { teamMembershipVersion: 1 } }, { session });
      const event = await Event.findOneAndUpdate({ _id: eventId, status: 'published' }, { $inc: { __v: 1 } }, { new: true, session });
      if (!registrationIsOpen(event) || event.participationType === 'solo') throw fail(409, 'This event is not accepting teams');
      if (await Team.exists({ eventId, members: { $elemMatch: { userId: req.user._id, status: 'accepted' } }, status: { $ne: 'cancelled' } }).session(session)) throw fail(409, 'You already belong to a team for this event');
      if (await require('../models').Registration.exists({ eventId, leaderId: req.user._id, status: { $nin: ['cancelled', 'refunded'] } }).session(session)) throw fail(409, 'You already have a registration for this event');
      [team] = await Team.create([{ teamName: teamName.trim(), eventId, leaderId: req.user._id, joinCode, members: [memberSnapshot(req.user)] }], { session });
    });
    return res.status(201).json({ success: true, team });
  } catch (error) {
    if (error.code === 11000) return res.status(409).json({ success: false, message: 'A team with that name already exists for this event' });
    throw error;
  }
}

async function getTeam(req, res) {
  const team = await Team.findById(req.params.id).populate('eventId', 'name slug minTeamSize maxTeamSize').populate('leaderId', 'name email studentId').lean();
  if (!team) return res.status(404).json({ success: false, message: 'Team not found' });
  const isMember = team.members.some((member) => String(member.userId) === String(req.user._id) && member.status === 'accepted');
  const assigned = req.user.role === 'organizer' && (req.user.assignedEvents || []).some((id) => String(id) === String(team.eventId?._id || team.eventId));
  if (!isMember && !assigned && !['admin', 'super_admin'].includes(req.user.role)) return res.status(403).json({ success: false, message: 'You are not a member of this team' });
  return res.json({ success: true, team });
}

async function joinTeam(req, res) {
  const joinCode = String(req.body.joinCode || '').trim().toUpperCase();
  if (!joinCode) return res.status(400).json({ success: false, message: 'joinCode is required' });
  const team = await Team.findOne({ joinCode, status: 'forming' }).populate('eventId');
  if (!team) return res.status(404).json({ success: false, message: 'Team not found or no longer accepting members' });
  const event = team.eventId;
  if (!(registrationIsOpen(event))) return res.status(409).json({ success: false, message: 'Event team formation is closed' });
  if (req.body.eventId && String(event._id) !== String(req.body.eventId)) return res.status(409).json({ success: false, message: 'This team code belongs to a different event.' });
  if (team.members.some((member) => String(member.userId) === String(req.user._id) && member.status === 'accepted')) return res.status(409).json({ success: false, message: 'You are already in this team' });
  const existingMembership = await Team.findOne({ eventId: event._id, 'members': { $elemMatch: { userId: req.user._id, status: 'accepted' } }, status: { $ne: 'cancelled' } }).select('_id').lean();
  if (existingMembership) return res.status(409).json({ success: false, message: 'You already belong to a team for this event' });
  const member = memberSnapshot(req.user);
  let updated;
  await mongoose.connection.transaction(async session => {
    updated = await addMemberAtomically(team._id, req.user._id, member, event.maxTeamSize, session);
    if (!updated) throw fail(409, 'Team is full or was updated by another participant');
    await TeamInvite.updateMany({ teamId: updated._id, status: 'pending', $or: [{ invitedUser: req.user._id }, { invitedEmail: req.user.email }] }, { $set: { status: 'accepted', invitedUser: req.user._id, respondedAt: new Date() } }, { session });
  });
  return res.status(201).json({ success: true, team: updated });
}

async function listMyTeams(req, res) {
  const teams = await Team.find({ 'members': { $elemMatch: { userId: req.user._id, status: 'accepted' } }, status: { $ne: 'cancelled' } }).populate('eventId', 'name slug eventDate minTeamSize maxTeamSize registrationMode teamFormationDeadline paymentDeadline registrationDeadline').sort({ createdAt: -1 }).lean();
  return res.json({ success: true, teams });
}

async function leaveTeam(req, res) {
  const observedTeam = await Team.findById(req.params.id).populate('eventId');

  let team;
  await mongoose.connection.transaction(async session => {
  await User.updateOne({ _id: req.user._id }, { $inc: { teamMembershipVersion: 1 } }, { session });
  team = await Team.findOne({ _id: req.params.id, status: 'forming', 'members': { $elemMatch: { userId: req.user._id, status: 'accepted' } } }).session(session);
  if (!team) throw fail(404, 'Forming team membership not found');
  if (String(team.leaderId) === String(req.user._id)) {
    const nextLeader = team.members.find((member) => String(member.userId) !== String(req.user._id) && member.status === 'accepted');
    if (nextLeader) {
      team.leaderId = nextLeader.userId;
    } else {
      team.status = 'cancelled';
    }
  }
  const member = team.members.find((entry) => String(entry.userId) === String(req.user._id) && entry.status === 'accepted');
  if (member) member.status = 'removed';
  team.rosterVersion = (team.rosterVersion || 0) + 1;
  await team.save({ session });
  });
  return res.json({ success: true, team });
}

async function listInvites(req, res) {
  const invites = await TeamInvite.find({ invitedUser: req.user._id, status: 'pending', expiresAt: { $gt: new Date() } }).populate('teamId', 'teamName').populate('eventId', 'name slug').sort({ createdAt: -1 }).lean();
  return res.json({ success: true, invites });
}

async function deleteTeam(req, res) {
  let team;
  await mongoose.connection.transaction(async session => {
    await User.updateOne({ _id: req.user._id }, { $inc: { teamMembershipVersion: 1 } }, { session });
    team = await Team.findOne({ _id: req.params.id, leaderId: req.user._id, status: 'forming' }).session(session);
    if (!team) throw fail(404, 'Only the leader of a forming team can delete it');
    const event = await Event.findOneAndUpdate({ _id: team.eventId }, { $inc: { __v: 1 } }, { new: true, session });
    if (!event || new Date(event.eventDate) <= new Date()) throw fail(409, 'The event has started; team deletion is closed');
    const personal = false;
    if (await require('../models').Registration.exists({ teamId: team._id }).session(session)) throw fail(409, 'This team has a registration. Delete its unpaid registration or raise a refund request from the registration page.');
    team.closedRoster = team.members.map(member => member.toObject());
    team.status = 'cancelled'; team.acceptingJoinRequests = false; team.closureReason = 'leader_deleted'; team.deletedAt = new Date(); team.rosterVersion = (team.rosterVersion || 0) + 1;
    await team.save({ session });
    await require('../services/refund.service').closeTeamActions(team._id, session);
    await require('../services/registration-lifecycle.service').notifyDeletedTeam(team, event, session);
    await require('../models').AdminAction.create([{ actorId: req.user._id, action: 'team_deleted', targetType: 'team', targetId: team._id, details: { personalEnrollmentsPreserved: personal }, requestId: req.id, ipAddress: req.ip }], { session });
  });
  return res.json({ success: true, team, message: 'Team deleted.' });
}

module.exports = { createTeam, getTeam, joinTeam, listMyTeams, leaveTeam, listInvites, addMemberAtomically, deleteTeam };
