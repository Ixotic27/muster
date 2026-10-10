const crypto = require('crypto');
const mongoose = require('mongoose');
const { Event, Team, TeamInvite, User } = require('../models');
const { sendEmail } = require('../services/email.service');
const { createNotification } = require('../services/notification.service');
const { registrationIsOpen } = require('../utils/eventAvailability');
const fail = (statusCode, message) => Object.assign(new Error(message), { statusCode });
const hash = token => crypto.createHash('sha256').update(String(token)).digest('hex');

async function inviteMember(req, res) {
  let invite;
  let resent = false;
  await mongoose.connection.transaction(async session => {
    // Lock this team while checking rate limits and creating its invitation.
    const team = await Team.findOneAndUpdate({ _id: req.params.id, leaderId: req.user._id, status: 'forming' }, { $set: { updatedAt: new Date() } }, { new: true, session });
    if (!team) throw fail(404, 'Forming team not found');
    const event = await Event.findById(team.eventId).session(session);
    if (!registrationIsOpen(event)) throw fail(409, 'Event registration is closed');
    if (team.members.filter(m => m.status === 'accepted').length >= event.maxTeamSize) throw fail(409, 'Team is full');
    const email = String(req.body.email || '').trim().toLowerCase();
    const target = await User.findOne(email ? { email } : { studentId: String(req.body.studentId || '').trim().toUpperCase() }).session(session);

    if ((!email && !target) || (target && !target.isActive)) throw fail(400, 'Use the teammate’s email address to invite them');
    const invitedEmail = email || target.email;
    if (team.members.some(m => m.status === 'accepted' && m.emailSnapshot === invitedEmail)) throw fail(409, 'This participant is already in the team');
    const teamInviteIds = await TeamInvite.find({ teamId: team._id }).distinct('_id').session(session);
    if (await require('../models/EmailJob').countDocuments({ inviteId: { $in: teamInviteIds }, createdAt: { $gte: new Date(Date.now() - 86400000) } }).session(session) >= 20) throw fail(429, 'This team has reached its invitation limit for 24 hours');
    await TeamInvite.updateMany({ teamId: team._id, status: 'pending', expiresAt: { $lte: new Date() } }, { $set: { status: 'expired' } }, { session });
    const token = crypto.randomBytes(32).toString('hex');
    const expiresAt = new Date(Math.min(Date.now() + 48 * 3600000, (event.registrationDeadline || event.eventDate).getTime(), event.eventDate.getTime()));
    invite = await TeamInvite.findOne({ teamId: team._id, invitedEmail, status: 'pending' }).select('+tokenHash').session(session);
    if (invite) {
      // Resending replaces the old token so the newest email is the only
      // valid link and creates a new durable email job.
      invite.invitedBy = req.user._id;
      invite.invitedUser = target?._id;
      invite.tokenHash = hash(token);
      invite.requiresToken = true;
      invite.expiresAt = expiresAt;
      await invite.save({ session });
      await require('../models/EmailJob').updateMany({ inviteId: invite._id, status: { $in: ['queued', 'failed'] } },
        { $set: { status: 'cancelled', lastError: 'INVITATION_REPLACED' }, $unset: { text: 1, link: 1 } }, { session });
      resent = true;
    } else {
      [invite] = await TeamInvite.create([{ teamId: team._id, eventId: event._id, invitedBy: req.user._id,
        invitedUser: target?._id, invitedEmail, tokenHash: hash(token), requiresToken: true, expiresAt }], { session });
    }
    await sendEmail({ dedupeKey: 'invite:' + invite._id + ':' + invite.tokenHash, to: invitedEmail, kind: 'team_invite', inviteId: invite._id,
      subject: 'You’re invited to join ' + team.teamName + ' · ' + (process.env.BRAND_NAME || 'EventFlow'),
      text: req.user.name + ' invited you to join “' + team.teamName + '” for ' + event.name + '.\n\nCreate an account, or sign in using this email address, then accept or decline the invitation. ' + 'Joining a team does not complete event registration or payment.' + '\n\nThis invitation expires at ' + require('../services/email.service').formatDate(expiresAt) + '. If you were not expecting it, you can ignore this email.',
      link: '/invitations/' + invite._id + '#token=' + token, expiresAt, priority: 10 }, { session });
    if (target) await createNotification({ userId: target._id, type: 'team_invite', title: 'Invitation to ' + team.teamName,
      message: req.user.name + ' invited you to their ' + event.name + ' team. Open the invitation link in your email to respond.', link: '/dashboard', email: false }, { session });
  });
  return res.status(201).json({ success: true, invite: { _id: invite._id, expiresAt: invite.expiresAt, status: invite.status }, emailStatus: 'queued', message: resent ? 'Invitation re-sent and queued. The previous link has been replaced.' : 'Invitation created and email queued. The recipient can sign up or log in using the emailed link.' });
}

async function findInvite(req, session) {
  const invite = await TeamInvite.findById(req.params.inviteId).select('+tokenHash').session(session || null);
  if (!invite || invite.status !== 'pending' || invite.expiresAt <= new Date()) throw fail(404, 'Invitation is missing, already answered, or expired');
  if (invite.requiresToken) {
    const supplied = String(req.body.token || '');
    if (!/^[a-f0-9]{64}$/.test(supplied) || hash(supplied) !== invite.tokenHash || invite.invitedEmail !== req.user.email) throw fail(403, 'Use the emailed invitation link and sign in with the email address that received it');
  } else if (String(invite.invitedUser) !== String(req.user._id)) throw fail(403, 'This invitation belongs to another account');
  return invite;
}

async function previewInvite(req, res) {
  const invite = await findInvite(req);
  const team = await Team.findById(invite.teamId).select('teamName status').lean();
  const event = await Event.findById(invite.eventId).select('name slug venue eventDate registrationDeadline registrationMode teamFormationDeadline paymentDeadline').lean();
  return res.json({ success: true, invite: { _id: invite._id, expiresAt: invite.expiresAt, team, event } });
}

async function respondInvite(req, res) {
  const reject = req.params.action === 'reject';
  let updated;
  let invalidated = false;
  await mongoose.connection.transaction(async session => {
    // Serialize all membership additions for the same user, including join-by-code.
    await User.updateOne({ _id: req.user._id }, { $inc: { teamMembershipVersion: 1 } }, { session });
    const invite = await findInvite(req, session);
    const team = await Team.findOne({ _id: invite.teamId, status: 'forming' }).session(session);
    const event = await Event.findById(invite.eventId).session(session);
    if (!reject) {

      if (!team || !(registrationIsOpen(event))) throw fail(409, 'Team or event is no longer accepting members');
      updated = await require('./team.controller').addMemberAtomically(team._id, req.user._id,
        { userId: req.user._id, nameSnapshot: req.user.name, studentIdSnapshot: req.user.studentId, emailSnapshot: req.user.email, status: 'accepted' }, event.maxTeamSize, session);
      if (!updated) throw fail(409, 'Team is full or you already belong to a team for this event');
      if (invite.requiresToken) await User.updateOne({ _id: req.user._id }, { $set: { emailVerifiedAt: new Date() } }, { session });
    }
    invite.status = reject ? 'rejected' : 'accepted'; invite.invitedUser = req.user._id; invite.respondedAt = new Date();
    await invite.save({ session });
    await createNotification({ userId: invite.invitedBy, type: reject ? 'team_invite_rejected' : 'team_invite_accepted',
      title: reject ? 'Team invitation declined' : 'Your teammate has joined', message: req.user.name + (reject ? ' declined the invitation.' : ' accepted the invitation to ' + team.teamName + '.'),
      link: '/dashboard', dedupeKey: 'invite-response:' + invite._id }, { session });
  });
  if (invalidated) return res.status(409).json({ success: false, message: 'The team leader changed. Ask the current leader for a new invitation.' });
  return res.json({ success: true, ...(updated ? { team: updated } : {}), message: reject ? 'Invitation declined' : 'You have joined the team' });
}
module.exports = { inviteMember, previewInvite, respondInvite };
