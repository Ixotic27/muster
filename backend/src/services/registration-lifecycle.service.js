const { User, Team } = require('../models');
const { createNotification } = require('./notification.service');
const id = value => String(value?._id || value);

async function registrationRecipients(registration, session) {
  const team = registration.teamId ? await Team.findById(registration.teamId?._id || registration.teamId).session(session || null).lean() : null;
  return [...new Set([id(registration.leaderId), ...(team?.members || []).filter(member => member.status === 'accepted').map(member => id(member.userId))])];
}

async function notifyRegistration({ registration, event, type, title, message, staff = false, initiationStaff = false, closureStaff = false, version = 0 }, { session } = {}) {
  const registrationId = registration._id, eventId = event?._id || registration.eventId?._id || registration.eventId;
  for (const userId of await registrationRecipients(registration, session)) {
    await createNotification({ userId, type, title, message, registrationId, eventId, audience: 'participant',
      link: '/registrations/' + registrationId, dedupeKey: type + ':' + registrationId + ':' + version + ':' + userId }, { session });
  }
  if (staff || initiationStaff || closureStaff) {
    const reviewers = await User.find({ isActive: true, $or: [{ role: { $in: ['admin', 'super_admin'] } }, { role: 'organizer', assignedEvents: eventId }] }).select('_id role').session(session || null).lean();
    const staffType = staff ? 'refund_review_requested' : initiationStaff ? 'registration_staff_notice' : 'registration_closed_staff_notice';
    for (const reviewer of reviewers) await createNotification({ userId: reviewer._id, type: staffType,
      title: (staff ? 'Refund review needed: ' : initiationStaff ? 'Team registration created: ' : 'Team registration closed: ') + event.name,
      message: staff ? 'A participant requested withdrawal for ' + registration.regId + '. The requested refund is ₹' + registration.refundAmountInr + '. Review the payment and request in your staff account. No refund has been sent automatically.' : 'Registration ' + registration.regId + ': ' + message,
      registrationId, eventId, audience: 'staff', link: reviewer.role === 'organizer' ? '/manager?event=' + eventId + (staff ? '&tab=refunds' : '') : staff ? '/admin/refunds' : '/admin/registrations?q=' + encodeURIComponent(registration.regId),
      dedupeKey: staffType + ':' + registrationId + ':' + version + ':' + reviewer._id }, { session });
  }
}

async function notifyDeletedTeam(team, event, session) {
  for (const member of team.members.filter(entry => entry.status === 'accepted')) await createNotification({ userId: member.userId,
    type: 'team_deleted', title: 'Team deleted: ' + team.teamName,
    message: 'The team leader deleted “' + team.teamName + '” for ' + event.name + '. ' + 'This team has no active event registration. You can form or join another team while enrollment is open.',
    eventId: event._id, teamId: team._id, audience: 'participant', link: '/dashboard/teams',
    dedupeKey: 'team-deleted:' + team._id + ':' + member.userId }, { session });
}

module.exports = { notifyRegistration, notifyDeletedTeam, registrationRecipients };
