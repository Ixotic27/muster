const { Registration, Team, Pass } = require('../models');
const { certificateRecipientFields } = require('../utils/academicProfile');
const { fail, pagination, pageInfo, searchRegex } = require('../utils/operations');
const { registrationAvailability } = require('../utils/eventAvailability');

const activeStatuses = { $nin: ['cancelled', 'refund_requested', 'refunded'] };
const recipientFields = certificateRecipientFields + ' phone';
const id = value => String(value?._id || value || '');
const eventFields = 'name slug participationType registrationMode status eventDate registrationDeadline maxSlots filledSlots';
const memberPopulation = { path: 'members.userId', select: recipientFields };

function eventSummary(event) {
  return { _id: event._id, name: event.name, slug: event.slug, availability: registrationAvailability(event) };
}
function rosterFilter(query) {
  const filter = query.filter || 'all';
  if (!['all', 'not_paid', 'paid', 'attended', 'payment_submitted'].includes(filter)) throw fail(400, 'Invalid participant filter');
  return filter;
}
function matchesFilter(member, filter) {
  return filter === 'all' || (filter === 'not_paid' && !member.paid) || (filter === 'paid' && member.paid)
    || (filter === 'attended' && member.attended) || (filter === 'payment_submitted' && member.paymentStatus === 'submitted');
}
function countGroups(groups) {
  const participants = { registered: 0, notPaid: 0, paid: 0, attended: 0, paymentSubmitted: 0 };
  const teams = { ...participants };
  for (const group of groups) {
    for (const member of group.members) {
      participants.registered++;
      participants[member.paid ? 'paid' : 'notPaid']++;
      if (member.attended) participants.attended++;
      if (member.paymentStatus === 'submitted') participants.paymentSubmitted++;
    }
    if (group.kind === 'team') {
      teams.registered++;
      // Team counts use any matching member, consistent with group filters.
      if (group.members.some(member => !member.paid)) teams.notPaid++;
      if (group.members.some(member => member.paid)) teams.paid++;
      if (group.members.some(member => member.attended)) teams.attended++;
      if (group.members.some(member => member.paymentStatus === 'submitted')) teams.paymentSubmitted++;
    }
  }
  return { participants, teams };
}

async function participantRoster(query, eventId, { exportAll = false } = {}) {
  const filter = rosterFilter(query);
  const paging = pagination(query);
  const registrations = await Registration.find({ status: activeStatuses, ...(eventId ? { eventId } : {}) })
    .select('regId eventId leaderId teamId billingMode feeSnapshotInr paymentId status nocStatus createdAt')
    .populate('eventId', eventFields).populate('leaderId', recipientFields)
    .populate({ path: 'teamId', select: 'teamName leaderId members status', populate: memberPopulation })
    .populate('paymentId', 'registrationId eventId payerId amountInr status')
    .sort({ createdAt: 1, _id: 1 }).lean();
  const passes = await Pass.find({ registrationId: { $in: registrations.map(row => row._id) }, status: 'issued' })
    .select('registrationId userId passId checkInStatus checkedInAt').lean();
  const passByMember = new Map(passes.map(pass => [id(pass.registrationId) + ':' + id(pass.userId), pass]));
  const grouped = new Map();
  for (const registration of registrations) {
    if (!registration.eventId) continue;
    const team = registration.teamId;
    const key = id(registration.eventId) + ':' + (team ? 'team:' + id(team) : 'solo:' + id(registration));
    if (!grouped.has(key)) grouped.set(key, { _id: key, kind: team ? 'team' : 'solo', teamId: team ? id(team) : null, teamName: team?.teamName || null, event: eventSummary(registration.eventId), status: team?.status || registration.status, registrations: [], members: [] });
    const group = grouped.get(key);
    group.registrations.push({ _id: registration._id, regId: registration.regId, status: registration.status, billingMode: registration.billingMode });
    const payment = registration.paymentId;
    const validPayment = payment && id(payment.registrationId) === id(registration) && id(payment.eventId) === id(registration.eventId) && id(payment.payerId) === id(registration.leaderId) && payment.amountInr === registration.feeSnapshotInr;
    const paymentStatus = registration.feeSnapshotInr === 0 ? 'not_required' : validPayment ? payment.status : 'not_paid';
    const paid = paymentStatus === 'verified' || paymentStatus === 'not_required';
    const members = team ? team.members.filter(member => member.status === 'accepted') : [];
    if (!members.length) members.push({ userId: registration.leaderId });
    for (const member of members) {
      const userId = id(member.userId);
      if (!userId || group.members.some(row => row.userId === userId)) continue;
      const participant = member.userId?.name ? member.userId : { _id: userId, name: member.nameSnapshot || '', email: member.emailSnapshot || '', studentId: member.studentIdSnapshot || '' };
      const pass = passByMember.get(id(registration) + ':' + userId);
      group.members.push({ userId, participant, leader: userId === id(team?.leaderId || registration.leaderId), registrationId: registration._id, regId: registration.regId,
        registrationStatus: registration.status, nocStatus: registration.nocStatus, paymentStatus, paid, attended: pass?.checkInStatus === 'checked_in', passId: pass?.passId || null, checkedInAt: pass?.checkedInAt || null });
    }
  }
  const allGroups = [...grouped.values()];
  const stats = countGroups(allGroups);
  const regex = searchRegex(query.q);
  const groups = allGroups.filter(group => {
    const groupMatch = regex && [group.teamName, group.event.name, group.event.slug].some(value => value && regex.test(value));
    for (const member of group.members) member.matchesFilter = matchesFilter(member, filter) && (!regex || groupMatch || [member.regId, ...Object.values(member.participant)].some(value => value != null && regex.test(String(value))));
    group.participantCount = group.members.length;
    group.paidCount = group.members.filter(member => member.paid).length;
    group.attendedCount = group.members.filter(member => member.attended).length;
    group.matchingParticipantCount = group.members.filter(member => member.matchesFilter).length;
    group.attendance = !group.attendedCount ? 'none' : group.attendedCount === group.participantCount ? 'all' : 'partial';
    return group.matchingParticipantCount > 0;
  }).sort((left, right) => left.event.name.localeCompare(right.event.name) || String(left.teamName || left.members[0]?.participant.name || '').localeCompare(String(right.teamName || right.members[0]?.participant.name || '')) || left._id.localeCompare(right._id));
  stats.filtered = { groups: groups.length, participants: groups.reduce((total, group) => total + group.matchingParticipantCount, 0), teams: groups.filter(group => group.kind === 'team').length };
  return { groups: exportAll ? groups : groups.slice(paging.skip, paging.skip + paging.limit), stats, pagination: pageInfo(groups.length, paging) };
}

function csvCell(value) {
  let text = value == null ? '' : String(value);
  if (/^[\s]*[=+@-]/.test(text) || /^[\t\r\n]/.test(text)) text = "'" + text;
  return '"' + text.replace(/"/g, '""') + '"';
}
function rosterCsv(groups) {
  const headers = ['Event', 'Team', 'Registration', 'Name', 'Student ID', 'Email', 'Phone', 'College', 'Course', 'Specialization', 'Section', 'Year', 'Leader', 'Registration status', 'Payment status', 'Paid', 'NOC status', 'Attended', 'Checked in at'];
  const rows = [headers];
  for (const group of groups) for (const member of group.members.filter(member => member.matchesFilter)) {
    const participant = member.participant;
    rows.push([group.event.name, group.teamName, member.regId, participant.name, participant.studentId, participant.email, participant.phone, participant.college, participant.course, participant.specialization, participant.section, participant.year,
      member.leader ? 'Yes' : 'No', member.registrationStatus, member.paymentStatus, member.paid ? 'Yes' : 'No', member.nocStatus, member.attended ? 'Yes' : 'No', member.checkedInAt ? new Date(member.checkedInAt).toISOString() : '']);
  }
  return '\uFEFF' + rows.map(row => row.map(csvCell).join(',')).join('\r\n') + '\r\n';
}
module.exports = { participantRoster, rosterCsv, rosterFilter, eventSummary };
