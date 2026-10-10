// Synthetic fixtures only: isolated loopback Mongo replica, no .env or SMTP.
const { startDatabase } = require('./isolated-test-database');
const assert = require('node:assert/strict');
const { User, Event, Team, Registration, Payment, Pass, AdminAction } = require('../src/models');
const { issueAccessToken } = require('../src/controllers/auth.controller');
const { issuePasses } = require('../src/services/pass.service');
const { disconnectDatabase } = require('../src/config/database');
const app = require('../src/app');
let replica, server;
async function run() {
  replica = await startDatabase();
  server = app.listen(0, '127.0.0.1');
  await new Promise(resolve => server.once('listening', resolve));
  const base = 'http://127.0.0.1:' + server.address().port + '/api/v1';
  const request = async (path, token, method = 'GET', body) => {
    const response = await fetch(base + path, { method, signal: AbortSignal.timeout(15000), headers: { Authorization: 'Bearer ' + token, ...(body ? { 'Content-Type': 'application/json' } : {}) }, ...(body ? { body: JSON.stringify(body) } : {}) });
    const csv = response.headers.get('content-type')?.includes('text/csv');
    return { status: response.status, headers: response.headers, ...(csv ? { csv: await response.text() } : await response.json()) };
  };
  let seq = 0;
  const user = (name, extra = {}) => User.create({ name, email: 'roster-' + (++seq) + '@example.com', studentId: 'ROSTER-' + seq, college: 'Test College', course: 'B.Tech', specialization: 'Computer Science', section: 'A', year: 3, phone: '9000000000', ...extra });
  const admin = await user('Admin', { role: 'admin' }), staff = await user('Staff', { role: 'organizer' }), outsider = await user('Other staff', { role: 'organizer' }), student = await user('Student');
  const event = await Event.create({ name: 'Roster test', slug: 'roster-test', category: 'technical', participationType: 'both', minTeamSize: 1, maxTeamSize: 2, feeInr: 100, status: 'published', eventDate: new Date(Date.now() + 7 * 86400000), registrationDeadline: new Date(Date.now() + 6 * 86400000), venue: 'Loopback' });
  await User.updateOne({ _id: staff._id }, { $set: { assignedEvents: [event._id] } });
  const tokens = [admin, staff, outsider, student].map(issueAccessToken);
  const paidMembers = [await user('Paid leader'), await user('Paid teammate')];
  const removed = await user('Removed teammate');
  const unpaidMembers = [await user('=SUM(1,2)'), await user('Unpaid "quoted" teammate')];
  const team = async (name, members, extraMembers = []) => Team.create({ teamName: name, eventId: event._id, leaderId: members[0]._id, joinCode: 'ROSTER' + (++seq), status: 'locked', members: [...members.map(entry => ({ userId: entry._id, nameSnapshot: entry.name, emailSnapshot: entry.email, status: 'accepted' })), ...extraMembers] });
  const paidTeam = await team('Paid team', paidMembers, [{ userId: removed._id, nameSnapshot: removed.name, status: 'removed' }]);
  const unpaidTeam = await team('Unpaid team', unpaidMembers);
  const registration = (selectedEvent, leader, teamValue, status = 'pending_payment', fee = 100) => Registration.create({ regId: 'ROSTER-REG-' + (++seq), eventId: selectedEvent._id, leaderId: leader._id, ...(teamValue ? { teamId: teamValue._id } : {}), feeSnapshotInr: fee, status, nocStatus: 'not_required' });
  const paidReg = await registration(event, paidMembers[0], paidTeam, 'confirmed');
  const unpaidReg = await registration(event, unpaidMembers[0], unpaidTeam);
  const submittedReg = await registration(event, await user('Submitted payment'), null, 'payment_submitted');
  const rejectedReg = await registration(event, await user('Rejected payment'));
  await registration(event, await user('Cancelled'), null, 'cancelled');
  const payment = async (reg, status) => {
    const entry = await Payment.create({ registrationId: reg._id, eventId: reg.eventId, payerId: reg.leaderId, utr: 'ROSTER-UTR-' + (++seq), amountInr: reg.feeSnapshotInr, screenshotUrl: 'https://example.invalid/private-proof.png', status });
    await Registration.updateOne({ _id: reg._id }, { $set: { paymentId: entry._id } });
    return entry;
  };
  const paidPayment = await payment(paidReg, 'verified'); await payment(submittedReg, 'submitted'); await payment(rejectedReg, 'rejected');
  await issuePasses(paidReg, event, paidTeam);
  const rosterPath = '/events/manage/' + event._id + '/roster';
  const controlsPath = '/events/manage/' + event._id + '/registration-controls';
  for (const token of [tokens[2], tokens[3]]) {
    assert.equal((await request(rosterPath, token)).status, 403);
    assert.equal((await request(rosterPath + '/export', token)).status, 403);
    assert.equal((await request(controlsPath, token, 'PATCH', { status: 'closed' })).status, 403);
  }
  assert.equal((await request('/admin/roster', tokens[1])).status, 403);
  const all = await request(rosterPath, tokens[1]);
  assert.equal(all.status, 200, JSON.stringify(all));
  assert.equal(all.groups.length, 4);
  assert.deepEqual(all.stats.participants, { registered: 6, notPaid: 4, paid: 2, attended: 0, paymentSubmitted: 1 });
  assert.equal(all.stats.teams.registered, 2);
  assert.equal(all.groups.find(row => row.teamName === 'Paid team').members.length, 2);
  const serialized = JSON.stringify(all);
  for (const forbidden of ['passwordHash', 'private-proof', 'qrDataUrl', 'token', removed.name]) assert.ok(!serialized.includes(forbidden), forbidden);
  assert.equal(all.groups.find(row => row.teamName === 'Paid team').members[0].participant.course, 'B.Tech');
  for (const [filter, expected] of [['all', 6], ['not_paid', 4], ['paid', 2], ['attended', 0], ['payment_submitted', 1]]) {
    const result = await request(rosterPath + '?filter=' + filter + '&limit=1', tokens[1]);
    assert.equal(result.stats.filtered.participants, expected, filter);
    const csv = await request(rosterPath + '/export?filter=' + filter + '&limit=1&page=999', tokens[1]);
    assert.equal(csv.status, 200); assert.equal(csv.csv.trim().split('\r\n').length, expected + 1, filter);
    assert.ok(csv.headers.get('content-disposition').includes(filter));
  }
  const unpaidCsv = (await request(rosterPath + '/export?filter=not_paid', tokens[1])).csv;
  assert.ok(unpaidCsv.includes("'=SUM(1,2)")); assert.ok(unpaidCsv.includes('Unpaid ""quoted"" teammate'));
  const searched = await request(rosterPath + '?q=' + encodeURIComponent(paidMembers[1].studentId), tokens[1]);
  assert.equal(searched.groups.length, 1); assert.equal(searched.groups[0].members.length, 2); assert.equal(searched.groups[0].matchingParticipantCount, 1);
  assert.equal((await request(rosterPath + '?filter=nonsense', tokens[1])).status, 400);
  assert.equal((await request('/admin/roster?eventId=invalid', tokens[0])).status, 400);
  assert.equal((await request(rosterPath + '?q=' + encodeURIComponent('.*'), tokens[1])).groups.length, 0, 'Search must treat regex syntax literally');
  for (const changed of [{ amountInr: 1 }, { registrationId: unpaidReg._id }, { eventId: unpaidReg._id }, { payerId: student._id }]) {
    await Payment.updateOne({ _id: paidPayment._id }, { $set: changed });
    const mismatched = await request(rosterPath + '?filter=paid', tokens[1]);
    assert.equal(mismatched.stats.participants.paid, 0, 'A mismatched verified payment cannot mark attendees paid');
    await Payment.updateOne({ _id: paidPayment._id }, { $set: { amountInr: 100, registrationId: paidReg._id, eventId: event._id, payerId: paidReg.leaderId } });
  }
  console.log('PASS roster grouping, unpaginated counts, current members/academics, submitted vs verified, search, exact CSV, formula escaping, scoped authorization');

  const passes = await Pass.find({ registrationId: paidReg._id }).select('+token').lean();
  assert.equal((await request('/scanner/verify', tokens[1], 'POST', { eventId: String(event._id), token: passes[0].token })).status, 200);
  const partiallyAttended = await request(rosterPath + '?filter=attended', tokens[1]);
  assert.equal(partiallyAttended.stats.participants.attended, 1);
  assert.equal(partiallyAttended.groups[0].attendance, 'partial');
  assert.equal(partiallyAttended.groups[0].members.length, 2);
  assert.equal(partiallyAttended.groups[0].matchingParticipantCount, 1);
  assert.equal((await request(rosterPath + '/export?filter=attended', tokens[1])).csv.trim().split('\r\n').length, 2);
  assert.equal((await request('/scanner/verify', tokens[1], 'POST', { eventId: String(event._id), token: passes[0].token })).status, 409);
  assert.equal((await request(rosterPath, tokens[1])).stats.participants.attended, 1);
  assert.equal((await request(controlsPath, tokens[1], 'PATCH', { status: 'closed' })).event.availability.reason, 'manual_closed');
  assert.equal((await request('/events/' + event.slug, tokens[3])).status, 200);
  assert.ok((await request('/events', tokens[3])).events.some(row => String(row._id) === String(event._id)));
  assert.equal((await request('/registrations', tokens[3], 'POST', { eventId: String(event._id) })).status, 409);
  assert.equal((await request('/scanner/verify', tokens[1], 'POST', { eventId: String(event._id), token: passes[1].token })).status, 200);
  assert.equal((await request(rosterPath + '?filter=attended', tokens[1])).groups[0].attendance, 'all');
  assert.equal((await request(controlsPath, tokens[1], 'PATCH', { maxSlots: 3 })).status, 409);
  assert.equal((await request(controlsPath, tokens[1], 'PATCH', { registrationDeadline: new Date(Date.now() + 8 * 86400000).toISOString() })).status, 400);
  const full = await request(controlsPath, tokens[1], 'PATCH', { status: 'published', maxSlots: 4 });
  assert.equal(full.event.availability.reason, 'capacity_full'); assert.equal(full.event.availability.filled, 4);
  const past = await request(controlsPath, tokens[1], 'PATCH', { maxSlots: null, registrationDeadline: new Date(Date.now() - 1000).toISOString() });
  assert.equal(past.event.availability.reason, 'deadline_passed');
  assert.equal((await request('/events/' + event.slug + '/payment-intent', tokens[3])).status, 409);
  assert.equal((await request(controlsPath, tokens[1], 'PATCH', { registrationDeadline: null })).event.availability.open, true);
  assert.equal((await request(controlsPath, tokens[1], 'PATCH', { feeInr: 10 })).status, 400);
  assert.ok(await AdminAction.exists({ action: 'event_registration_controls_updated', actorId: staff._id, targetId: event._id }));
  console.log('PASS QR-derived partial/full attendance and duplicate counts; manual closure preserves issued scans; capacity/deadline controls, rollback, audit and public availability');

  const freeEvent = await Event.create({ name: 'Free roster', slug: 'free-roster', category: 'technical', participationType: 'solo', minTeamSize: 1, maxTeamSize: 1, feeInr: 0, eventDate: event.eventDate, venue: 'Loopback' });
  await registration(freeEvent, await user('Free attendee'), null, 'confirmed', 0);
  assert.equal((await request('/admin/roster?eventId=' + freeEvent._id + '&filter=paid', tokens[0])).groups[0].members[0].paymentStatus, 'not_required');
  const global = await request('/admin/roster', tokens[0]);
  assert.equal(global.stats.participants.registered, 7);
  assert.equal((await request('/admin/roster/export?filter=paid', tokens[0])).csv.trim().split('\r\n').length, 4);
  await Event.updateOne({ _id: freeEvent._id }, { $set: { status: 'draft' } });
  assert.equal((await request('/events/manage/' + freeEvent._id + '/registration-controls', tokens[0], 'PATCH', { status: 'published' })).status, 409);
  console.log('PASS free event eligibility, cross-event admin reports, draft publish prevention');
}
run().then(() => console.log('PASS participant roster integration complete')).catch(error => { console.error(error); process.exitCode = 1; }).finally(async () => { if (server) await new Promise(resolve => server.close(resolve)); await disconnectDatabase(); if (replica) await replica.stop(); });
