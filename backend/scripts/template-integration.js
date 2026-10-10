/* Real HTTP and MongoDB transaction tests on an ephemeral loopback replica set.
 * Does not read .env, connect to Atlas, upload externally, or start SMTP workers. */
process.env.EVENT_TIMEZONE = 'UTC';
const { startDatabase } = require('./isolated-test-database');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const mongoose = require('mongoose');
const { connectDatabase, disconnectDatabase } = require('../src/config/database');
const { User, Event, Team, Registration, Payment, Pass, Notification, AdminAction, TeamInvite } = require('../src/models');
const StoredFile = require('../src/models/StoredFile');
const EmailJob = require('../src/models/EmailJob');
const app = require('../src/app');
const runId = 'workflow-' + crypto.randomBytes(5).toString('hex');
const userIds = [], eventIds = [];
let server, replica;
async function run() {
  replica = await startDatabase();
  server = app.listen(0, '127.0.0.1');
  await new Promise(resolve => server.once('listening', resolve));
  const base = 'http://127.0.0.1:' + server.address().port + '/api/v1';
  async function request(path, method = 'GET', body, token) {
    const file = body instanceof FormData;
    const response = await fetch(base + path, { method, signal: AbortSignal.timeout(15000), headers: { ...(body && !file ? { 'Content-Type': 'application/json' } : {}), ...(token ? { Authorization: 'Bearer ' + token } : {}) }, ...(body ? { body: file ? body : JSON.stringify(body) } : {}) });
    const json = await response.json();
    return { status: response.status, ...json, cookie: response.headers.get('set-cookie') };
  }
  const makeUser = async tag => {
    const email = runId + '-' + tag + '@example.com';
    const r = await request('/auth/signup', 'POST', { name: 'Workflow Test ' + tag, email, password: 'SyntheticOnly!2834', studentId: runId + '-' + tag, college: 'Verification college', phone: '9000000000' });
    assert.equal(r.status, 201, JSON.stringify(r)); assert.equal(r.user.role, 'student'); assert.ok(r.cookie?.includes('HttpOnly'));
    userIds.push(r.user._id); return r;
  };
  const one = await makeUser('one'), two = await makeUser('two'), admin = await makeUser('admin'), staff = await makeUser('staff');
  await User.updateOne({ _id: admin.user._id }, { $set: { role: 'admin' } });
  await User.updateOne({ _id: staff.user._id }, { $set: { role: 'organizer' } });
  const login = await request('/auth/login', 'POST', { email: one.user.email, password: 'SyntheticOnly!2834' });
  assert.equal(login.status, 200); assert.equal(login.user.passwordHash, undefined);
  assert.equal((await request('/auth/me', 'GET', null, one.token)).user.role, 'student');
  assert.equal((await request('/admin/dashboard', 'GET', null, one.token)).status, 403);
  const forged = await request('/auth/signup', 'POST', { email: runId + '@example.com', name: 'Forged role', password: 'SyntheticOnly!2834', role: 'admin' });
  if (forged.user?._id) userIds.push(forged.user._id);
  assert.equal(forged.user?.role, 'student', 'A claimed admin role must never be granted by public signup.');
  console.log('PASS auth: signup/login cookies, student permissions, role escalation prevention');
  const makeEvent = async (suffix, extra = {}) => {
    const e = await Event.create({ name: 'Workflow verification ' + suffix, slug: runId + '-' + suffix, category: 'technical', participationType: 'solo', minTeamSize: 1, maxTeamSize: 1, feeInr: 10, eventDate: new Date(Date.now() + 7 * 86400000), venue: 'Test only', maxSlots: 10, status: 'published', ...extra }); eventIds.push(e._id); return e;
  };
  const assertTeamPassEmails = async (registrationId, attendeeIds, event, teamName) => {
    const { prepareNotifications } = require('../src/services/email-worker.service');
    const { renderEmail: renderPassEmail } = require('../src/services/email.service');
    const passes = await Pass.find({ registrationId }).select('+token +qrDataUrl').lean();
    assert.equal(passes.length, attendeeIds.length);
    assert.equal(new Set(passes.map(pass => pass.token)).size, attendeeIds.length, 'Every teammate needs a distinct signed pass.');
    const passIds = passes.map(pass => pass._id);
    await prepareNotifications();
    const emailJobs = await EmailJob.find({ passId: { $in: passIds } }).select('+text +link').lean();
    assert.equal(emailJobs.length, attendeeIds.length, 'Every accepted teammate needs their own durable email job.');
    for (const attendeeId of attendeeIds) {
      const user = await User.findById(attendeeId).lean();
      const ownPass = passes.find(pass => String(pass.userId) === String(attendeeId));
      assert.ok(ownPass);
      const ownJobs = emailJobs.filter(job => String(job.passId) === String(ownPass._id));
      assert.equal(ownJobs.length, 1);
      const emailJob = ownJobs[0];
      assert.equal(emailJob.to, user.email); assert.equal(emailJob.kind, 'pass_generated');
      const notification = await Notification.findById(emailJob.notificationId).lean();
      assert.equal(String(notification.userId), String(attendeeId));
      assert.equal(String(notification.passId), String(ownPass._id));
      const rendered = await renderPassEmail(emailJob);
      assert.ok(rendered); assert.equal(rendered.to, user.email);
      for (const detail of [user.name, event.name, event.venue, teamName, ownPass.passId]) {
        assert.ok(rendered.html.includes(detail), 'The personal pass email must include ' + detail);
        assert.ok(rendered.text.includes(detail), 'The plain-text alternative must include ' + detail);
      }
      assert.ok(rendered.html.includes('Date &amp; time'));
      assert.ok(rendered.text.includes('Date & time'));
      assert.equal(rendered.attachments.length, 1, 'Only this attendee’s QR may be attached.');
      const attachment = rendered.attachments[0];
      assert.equal(attachment.filename, ownPass.passId + '.png');
      assert.equal(attachment.contentType, 'image/png'); assert.equal(attachment.cid, 'entry-qr');
      assert.deepEqual(attachment.content, Buffer.from(ownPass.qrDataUrl.split(',')[1], 'base64'));
      for (const otherPass of passes.filter(pass => String(pass._id) !== String(ownPass._id))) {
        assert.ok(!attachment.content.equals(Buffer.from(otherPass.qrDataUrl.split(',')[1], 'base64')));
        assert.ok(!rendered.html.includes(otherPass.passId)); assert.ok(!rendered.text.includes(otherPass.passId));
        const otherUser = await User.findById(otherPass.userId).lean();
        assert.ok(!rendered.html.includes(otherUser.name)); assert.ok(!rendered.text.includes(otherUser.name));
      }
    }
    // Simulate a notification preparation retry after a response interruption.
    await require('../src/services/pass.service').issuePasses(await Registration.findById(registrationId));
    await Notification.updateMany({ passId: { $in: passIds } }, { $set: { emailStatus: 'queued' } });
    await prepareNotifications(); await prepareNotifications();
    assert.equal(await Pass.countDocuments({ registrationId }), attendeeIds.length);
    assert.equal(await Notification.countDocuments({ passId: { $in: passIds }, type: 'pass_generated' }), attendeeIds.length);
    assert.equal(await EmailJob.countDocuments({ passId: { $in: passIds } }), attendeeIds.length);
    const afterRetry = await Pass.find({ registrationId }).select('+token').lean();
    assert.deepEqual(afterRetry.map(pass => pass.token).sort(), passes.map(pass => pass.token).sort(), 'Retry must preserve every teammate’s original QR.');
  };
  const solo = await makeEvent('solo'), noc = await makeEvent('noc', { requiresNOC: true }), teamEvent = await makeEvent('team', { participationType: 'team', minTeamSize: 2, maxTeamSize: 2 });
  const reg1 = await request('/registrations', 'POST', { eventId: solo.id }, one.token);
  const reg2 = await request('/registrations', 'POST', { eventId: solo.id }, two.token);
  assert.equal(reg1.status, 201, JSON.stringify(reg1)); assert.equal(reg2.status, 201, 'Two different solo entrants must be allowed.');
  assert.equal((await request('/registrations', 'POST', { eventId: solo.id }, one.token)).status, 409);
  assert.equal((await request('/events/manage/all', 'GET', null, staff.token)).events.length, 0);
  assert.equal((await request('/events/manage/' + solo.id + '/registrations', 'GET', null, staff.token)).status, 403);
  await User.updateOne({ _id: staff.user._id }, { $set: { assignedEvents: [solo._id] } });
  const staffEvents = await request('/events/manage/all', 'GET', null, staff.token);
  assert.equal(staffEvents.events.length, 1);
  assert.equal((await request('/events/manage/' + solo.id + '/registrations', 'GET', null, staff.token)).status, 200);
  assert.equal((await request('/admin/payments?page=0', 'GET', null, admin.token)).status, 400);
  console.log('PASS manager: assigned-event scope, roster access, invalid pagination');
  const intent = await request('/payments/intent/' + reg1.registration._id + '?amount=1', 'GET', null, one.token);
  assert.equal(intent.amountInr, 10); assert.ok(intent.qrDataUrl.startsWith('data:image/png;base64,'));
  assert.equal((await request('/payments/intent/' + reg1.registration._id, 'GET', null, two.token)).status, 404);
  const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jK1cAAAAASUVORK5CYII=', 'base64');
  const utr = String(Date.now()) + String(crypto.randomInt(100, 999));
  const proof = (id, reference = utr) => { const f = new FormData(); f.append('registrationId', id); f.append('utr', reference); f.append('screenshot', new Blob([png], { type: 'image/png' }), 'synthetic-test.png'); return f; };
  const concurrent = await Promise.all([request('/payments', 'POST', proof(reg1.registration._id), one.token), request('/payments', 'POST', proof(reg1.registration._id, utr + '1'), one.token)]);
  assert.equal(concurrent.filter(r => r.status === 201).length, 1, JSON.stringify(concurrent));
  assert.equal(concurrent.filter(r => r.status === 409).length, 1, JSON.stringify(concurrent));
  const payment = concurrent.find(r => r.status === 201).payment;
  assert.equal((await request('/payments', 'POST', proof(reg2.registration._id, payment.utr), two.token)).status, 409);
  const row = await Payment.findById(payment.id).lean();
  const ownerFile = await fetch(base.replace('/api/v1', '') + row.screenshotUrl, { headers: { Authorization: 'Bearer ' + one.token } });
  assert.equal(ownerFile.status, 200); assert.equal(ownerFile.headers.get('content-type'), 'image/png');
  assert.equal((await fetch(base.replace('/api/v1', '') + row.screenshotUrl, { headers: { Authorization: 'Bearer ' + two.token } })).status, 404);
  assert.equal((await request('/admin/payments/' + payment.id + '/verify', 'POST', null, one.token)).status, 403);
  const verified = await request('/admin/payments/' + payment.id + '/verify', 'POST', null, admin.token);
  assert.equal(verified.status, 200, JSON.stringify(verified)); assert.equal(verified.registration.status, 'confirmed');
  assert.equal((await request('/admin/payments/' + payment.id + '/verify', 'POST', null, admin.token)).status, 409);
  assert.equal(await Pass.countDocuments({ registrationId: reg1.registration._id }), 1);
  console.log('PASS payments: amount ownership, concurrent proof, duplicate UTR, private upload, approval, one pass');
  const passList = await request('/passes/mine', 'GET', null, one.token);
  const pass = passList.passes.find(p => p.registrationId._id === reg1.registration._id);
  assert.ok(pass.qrDataUrl); assert.ok(pass.token.startsWith('v1.'));
  const scan = { eventId: solo.id, token: pass.token };
  assert.equal((await request('/scanner/verify', 'POST', scan)).status, 401);
  assert.equal((await request('/scanner/verify', 'POST', scan, one.token)).status, 403);
  assert.equal((await request('/scanner/verify', 'POST', { ...scan, eventId: noc.id }, staff.token)).status, 403);
  assert.equal((await request('/passes/' + pass._id, 'GET', null, staff.token)).status, 403);
  assert.equal((await request('/scanner/verify', 'POST', { ...scan, eventId: noc.id }, admin.token)).code, 'WRONG_EVENT');
  assert.equal((await request('/scanner/verify', 'POST', { ...scan, token: pass.token.slice(0, -3) + 'xxx' }, admin.token)).code, 'INVALID_SIGNATURE');
  const { signPayload, verifyToken } = require('../src/services/qr.service');
  assert.equal((await request('/scanner/verify', 'POST', { ...scan, token: signPayload({ ...verifyToken(pass.token), exp: new Date(Date.now() - 1000).toISOString() }) }, admin.token)).code, 'EXPIRED');
  await Pass.updateOne({ _id: pass._id }, { $set: { status: 'revoked' } });
  assert.equal((await request('/scanner/verify', 'POST', scan, staff.token)).code, 'NOT_FOUND');
  await Pass.updateOne({ _id: pass._id }, { $set: { status: 'issued' } });
  await User.updateOne({ _id: one.user._id }, { $set: { isActive: false } });
  assert.equal((await request('/scanner/verify', 'POST', scan, staff.token)).code, 'ACCOUNT_INACTIVE');
  await User.updateOne({ _id: one.user._id }, { $set: { isActive: true } });
  await Event.updateOne({ _id: solo._id }, { $set: { status: 'cancelled' } });
  assert.equal((await request('/scanner/verify', 'POST', scan, staff.token)).code, 'EVENT_UNAVAILABLE');
  await Event.updateOne({ _id: solo._id }, { $set: { status: 'published' } });
  const scans = await Promise.all(Array.from({ length: 8 }, (_, i) => request('/scanner/verify', 'POST', { ...scan, scanId: 'concurrent-' + i }, staff.token)));
  assert.equal(scans.filter(r => r.code === 'CHECKED_IN').length, 1, JSON.stringify(scans));
  assert.equal(scans.filter(r => r.code === 'ALREADY_CHECKED_IN').length, 7, JSON.stringify(scans));
  assert.equal(await AdminAction.countDocuments({ action: 'entry_checked_in', targetId: pass._id }), 1);
  assert.equal((await request('/scanner/verify', 'POST', scan, admin.token)).code, 'ALREADY_CHECKED_IN');
  const stats = await request('/scanner/stats/' + solo.id, 'GET', null, staff.token);
  assert.equal(stats.stats.checkedIn, 1); assert.equal(stats.stats.remaining, 0);
  console.log('PASS scanner: unauthenticated/student/unassigned denial, QR privacy, wrong event, tampering, expiry, revoked pass, inactive user, cancelled event, 8 concurrent scans with exactly one admission/audit, duplicate and statistics');
  const nr = await request('/registrations', 'POST', { eventId: noc.id }, one.token);
  const fakeNoc = new FormData(); fakeNoc.append('document', new Blob([png], { type: 'image/png' }), 'synthetic-noc.png');
  assert.equal((await request('/noc/' + nr.registration._id, 'POST', fakeNoc, one.token)).status, 409);
  const np = await request('/payments', 'POST', proof(nr.registration._id, utr + '2'), one.token);
  assert.equal(np.status, 201, JSON.stringify(np));
  const nv = await request('/admin/payments/' + np.payment.id + '/verify', 'POST', null, admin.token);
  assert.equal(nv.registration.status, 'pending_noc');
  const nocProof = new FormData(); nocProof.append('document', new Blob([png], { type: 'image/png' }), 'synthetic-noc.png');
  assert.equal((await request('/noc/' + nr.registration._id, 'POST', nocProof, one.token)).status, 201);
  const nocReviews = await Promise.all(Array.from({ length: 4 }, () => request('/noc/admin/' + nr.registration._id + '/verify', 'POST', null, admin.token)));
  assert.equal(nocReviews.filter(result => result.status === 200).length, 1, JSON.stringify(nocReviews));
  assert.equal(nocReviews.filter(result => result.status === 409).length, 3, JSON.stringify(nocReviews));
  assert.equal(nocReviews.find(result => result.status === 200).registration.status, 'confirmed');
  assert.equal(await Pass.countDocuments({ registrationId: nr.registration._id }), 1);
  assert.equal(await AdminAction.countDocuments({ action: 'noc_verified', targetId: nr.registration._id }), 1);
  const refund = await request('/registrations/' + nr.registration._id + '/refund-request', 'POST', { reason: 'Synthetic cancellation' }, one.token);
  assert.equal(refund.status, 200, JSON.stringify(refund)); assert.equal(refund.registration.status, 'refund_requested');
  assert.equal(await Pass.countDocuments({ registrationId: nr.registration._id, status: 'issued' }), 0);
  const deniedRefund = await request('/admin/refunds/' + nr.registration._id + '/reject', 'POST', { reason: 'Synthetic review rejection' }, admin.token);
  assert.equal(deniedRefund.status, 200, JSON.stringify(deniedRefund));
  assert.equal((await Registration.findById(nr.registration._id)).status, 'cancelled');
  console.log('PASS NOC/refund: payment prerequisite, four concurrent approvals create exactly one pass/audit, cancellation revokes pass, rejected refund keeps registration cancelled');
  const team = await request('/teams', 'POST', { eventId: teamEvent.id, teamName: runId }, one.token);
  assert.equal((await request('/registrations', 'POST', { eventId: teamEvent.id, teamId: team.team._id }, one.token)).status, 409);
  assert.equal((await request('/teams/join', 'POST', { joinCode: team.team.joinCode, eventId: solo.id }, two.token)).status, 409);
  assert.equal((await request('/teams/join', 'POST', { joinCode: team.team.joinCode, eventId: teamEvent.id }, two.token)).status, 201);
  const paidTeamRegistration = await request('/registrations', 'POST', { eventId: teamEvent.id, teamId: team.team._id }, one.token);
  assert.equal(paidTeamRegistration.status, 201);
  assert.equal((await request('/teams/' + team.team._id + '/leave', 'POST', null, two.token)).status, 404);
  assert.equal(await Pass.countDocuments({ registrationId: paidTeamRegistration.registration._id }), 0, 'Pending team payment must not issue entry passes.');
  // Independent scenarios share one loopback IP. Reset only the in-memory
  // test quota so this added approval case does not mask later state checks.
  require('../src/middleware/rateLimiter.middleware').paymentLimiter.resetKey('127.0.0.1');
  const teamPayment = await request('/payments', 'POST', proof(paidTeamRegistration.registration._id, utr + '3'), one.token);
  assert.equal(teamPayment.status, 201, JSON.stringify(teamPayment));
  const teamApproval = await request('/admin/payments/' + teamPayment.payment.id + '/verify', 'POST', null, admin.token);
  assert.equal(teamApproval.status, 200, JSON.stringify(teamApproval));
  await assertTeamPassEmails(paidTeamRegistration.registration._id, [one.user._id, two.user._id], teamEvent, runId);
  console.log('PASS paid team emails: payment approval queues one personal pass email per accepted member, correct recipient/name/team/event/date/time/venue, isolated QR attachments, idempotent retries');
  const invitationEvent = await makeEvent('invitation', { participationType: 'team', minTeamSize: 2, maxTeamSize: 2, feeInr: 0 });
  const invitationTeam = await request('/teams', 'POST', { eventId: invitationEvent.id, teamName: 'Invitation QA' }, one.token);
  const recipientEmail = runId + '-invitee@example.com';
  const invitation = await request('/teams/' + invitationTeam.team._id + '/invites', 'POST', { email: recipientEmail }, one.token);
  assert.equal(invitation.status, 201, JSON.stringify(invitation)); assert.equal(invitation.emailStatus, 'queued');
  const job = await EmailJob.findOne({ inviteId: invitation.invite._id }).select('+link').lean();
  assert.equal(job.status, 'queued'); assert.equal(new URL(job.link).origin, 'http://localhost:3000');
  const oldToken = new URLSearchParams(new URL(job.link).hash.slice(1)).get('token');
  const resend = await request('/teams/' + invitationTeam.team._id + '/invites', 'POST', { email: recipientEmail }, one.token);
  assert.equal(resend.status, 201); assert.match(resend.message, /re-sent/);
  const jobs = await EmailJob.find({ inviteId: invitation.invite._id }).select('+link').sort({ createdAt: -1 }).lean();
  assert.equal(jobs.length, 2);
  const token = new URLSearchParams(new URL(jobs[0].link).hash.slice(1)).get('token');
  const recipient = await makeUser('invitee');
  assert.equal((await request('/teams/invites/' + invitation.invite._id + '/preview', 'POST', { token: oldToken }, recipient.token)).status, 403);
  assert.equal((await request('/teams/invites/' + invitation.invite._id + '/preview', 'POST', { token }, two.token)).status, 403);
  assert.equal((await request('/teams/invites/' + invitation.invite._id + '/preview', 'POST', { token }, recipient.token)).status, 200);
  assert.equal((await request('/teams/invites/' + invitation.invite._id + '/accept', 'POST', { token }, recipient.token)).status, 200);
  assert.equal((await request('/teams/invites/' + invitation.invite._id + '/accept', 'POST', { token }, recipient.token)).status, 404);
  const free = await request('/registrations', 'POST', { eventId: invitationEvent.id, teamId: invitationTeam.team._id }, one.token);
  assert.equal(free.status, 201, JSON.stringify(free));
  assert.equal(await Pass.countDocuments({ registrationId: free.registration._id }), 2);
  await assertTeamPassEmails(free.registration._id, [one.user._id, recipient.user._id], invitationEvent, 'Invitation QA');
  console.log('PASS invitation team emails: newly signed-up invitee receives their own pass/email after acceptance and registration, no teammate name or QR leakage, durable job deduplication');
  assert.equal((await request('/registrations/' + free.registration._id + '/cancel', 'POST', { reason: 'Synthetic team cancellation' }, one.token)).status, 200);
  const historicalTeam = await Team.findById(invitationTeam.team._id);
  assert.equal(historicalTeam.status, 'cancelled');
  assert.equal(historicalTeam.members.filter(member => member.status === 'accepted').length, 2);
  assert.equal((await request('/teams/join', 'POST', { joinCode: invitationTeam.team.joinCode, eventId: invitationEvent.id }, two.token)).status, 404);
  assert.equal((await request('/teams/' + invitationTeam.team._id + '/invites', 'POST', { email: two.user.email }, one.token)).status, 404);
  assert.equal((await request('/registrations/' + free.registration._id, 'GET', null, recipient.token)).status, 200);
  assert.equal((await request('/registrations/' + free.registration._id, 'GET', null, two.token)).status, 404);
  assert.equal(await Pass.countDocuments({ registrationId: free.registration._id, status: 'issued' }), 0);
  console.log('PASS cancelled team history: immutable accepted roster, joins/invites denied, original attendee retains historical registration access, outsider denied, all team passes revoked');
  const directEvent = await makeEvent('direct-invite', { participationType: 'team', minTeamSize: 2, maxTeamSize: 2 });
  const directTeam = await request('/teams', 'POST', { eventId: directEvent.id, teamName: 'Direct invite join' }, one.token);
  const directInvite = await request('/teams/' + directTeam.team._id + '/invites', 'POST', { email: runId + '-direct@example.com' }, one.token);
  assert.equal(directInvite.status, 201, JSON.stringify(directInvite));
  const directRecipient = await makeUser('direct');
  assert.equal((await request('/teams/join', 'POST', { joinCode: directTeam.team.joinCode, eventId: directEvent.id }, directRecipient.token)).status, 201);
  assert.equal((await TeamInvite.findById(directInvite.invite._id)).status, 'accepted');
  assert.equal(await require('../src/services/email.service').renderEmail(await EmailJob.findOne({ inviteId: directInvite.invite._id }).select('+text +link')), null, 'The invitation email queued before direct joining must become inapplicable.');
  console.log('PASS teams/invitations: readiness, join event constraint, locked roster, unregistered recipient, durable queued mail, resend token replacement, intended email only, acceptance replay prevention, unique pass and queued email per member');
  const lastSlot = await makeEvent('last-slot', { maxSlots: 1, feeInr: 0 });
  const reservations = await Promise.all([one, two].map(user => request('/registrations', 'POST', { eventId: lastSlot.id }, user.token)));
  assert.equal(reservations.filter(result => result.status === 201).length, 1, JSON.stringify(reservations));
  assert.equal(reservations.filter(result => result.status === 409).length, 1, JSON.stringify(reservations));
  assert.equal((await Event.findById(lastSlot._id)).filledSlots, 1);
  assert.equal(await Registration.countDocuments({ eventId: lastSlot._id }), 1);
  assert.equal(await Pass.countDocuments({ eventId: lastSlot._id }), 1);
  const lastSeat = await makeEvent('last-team-seat', { participationType: 'team', minTeamSize: 2, maxTeamSize: 2 });
  const seatTeam = await request('/teams', 'POST', { eventId: lastSeat.id, teamName: 'Last seat' }, one.token);
  const joins = await Promise.all([two, recipient].map(user => request('/teams/join', 'POST', { joinCode: seatTeam.team.joinCode, eventId: lastSeat.id }, user.token)));
  assert.equal(joins.filter(result => result.status === 201).length, 1, JSON.stringify(joins));
  assert.equal(joins.filter(result => result.status === 409).length, 1, JSON.stringify(joins));
  assert.equal((await Team.findById(seatTeam.team._id)).members.filter(member => member.status === 'accepted').length, 2);
  const ruleRace = await makeEvent('rule-race', { maxSlots: null, feeInr: 0 });
  const [ruleRegistration, ruleUpdate] = await Promise.all([
    request('/registrations', 'POST', { eventId: ruleRace.id }, one.token),
    request('/events/' + ruleRace.id, 'PATCH', { requiresNOC: true }, admin.token)
  ]);
  assert.equal(ruleRegistration.status, 201, JSON.stringify(ruleRegistration));
  assert.ok([200, 409].includes(ruleUpdate.status), JSON.stringify(ruleUpdate));
  const finalRules = await Event.findById(ruleRace._id);
  const finalRegistration = await Registration.findById(ruleRegistration.registration._id);
  assert.equal(finalRegistration.status, finalRules.requiresNOC ? 'pending_noc' : 'confirmed');
  assert.equal(await Pass.countDocuments({ registrationId: finalRegistration._id }), finalRules.requiresNOC ? 0 : 1);
  assert.equal((await request('/events/' + ruleRace.id, 'PATCH', { requiresNOC: !finalRules.requiresNOC }, admin.token)).status, 409);
  const unlimited = await makeEvent('unlimited', { maxSlots: null, feeInr: 0 });
  for (const user of [one, two]) assert.equal((await request('/registrations', 'POST', { eventId: unlimited.id }, user.token)).status, 201);
  assert.equal((await Event.findById(unlimited._id)).filledSlots, 2);
  assert.equal((await request('/events/' + unlimited.id, 'PATCH', { maxSlots: 1 }, admin.token)).status, 409);
  assert.equal((await request('/events/' + unlimited.id, 'PATCH', { maxSlots: 2 }, admin.token)).status, 200);
  console.log('PASS capacity/rules: simultaneous registrations reserve the final slot once; simultaneous joins fill the final team seat once; unlimited first registration serializes with rule changes and later edits are rejected');

  const rollbackEvent = await makeEvent('rollback', { feeInr: 0, maxSlots: 1 });
  const realCreate = Pass.create;
  Pass.create = async () => { throw new Error('SYNTHETIC_PASS_STORAGE_FAILURE'); };
  let interrupted;
  try { interrupted = await request('/registrations', 'POST', { eventId: rollbackEvent.id }, one.token); }
  finally { Pass.create = realCreate; }
  assert.equal(interrupted.status, 500, JSON.stringify(interrupted));
  assert.equal(await Registration.countDocuments({ eventId: rollbackEvent._id }), 0);
  assert.equal(await Pass.countDocuments({ eventId: rollbackEvent._id }), 0);
  assert.equal((await Event.findById(rollbackEvent._id)).filledSlots, 0);
  const retry = await request('/registrations', 'POST', { eventId: rollbackEvent.id }, one.token);
  assert.equal(retry.status, 201, JSON.stringify(retry));
  const { issuePasses } = require('../src/services/pass.service');
  const recoveryRegistration = await Registration.findById(retry.registration._id);
  const retryPass = await Pass.findOne({ registrationId: recoveryRegistration._id });
  await Promise.all(Array.from({ length: 4 }, () => issuePasses(recoveryRegistration)));
  assert.equal(await Pass.countDocuments({ registrationId: recoveryRegistration._id }), 1);
  assert.equal(await Notification.countDocuments({ dedupeKey: 'pass:' + retryPass._id }), 1);
  await Pass.updateOne({ _id: retryPass._id }, { $set: { status: 'revoked' } });
  assert.equal((await issuePasses(recoveryRegistration)).length, 0);
  assert.equal((await Pass.findById(retryPass._id)).status, 'revoked');
  const cancelled = await request('/registrations/' + recoveryRegistration._id + '/cancel', 'POST', { reason: 'Synthetic recovery cancellation' }, one.token);
  assert.equal(cancelled.status, 200, JSON.stringify(cancelled));
  await assert.rejects(issuePasses(recoveryRegistration), error => error.statusCode === 409);
  assert.equal(await Pass.countDocuments({ registrationId: recoveryRegistration._id, status: 'issued' }), 0);
  console.log('PASS recovery: pass storage failure rolls back registration/slot; retry succeeds; four recovery attempts deduplicate pass/notification; revocation survives recovery; stale confirmed snapshot cannot recreate cancelled entry');

  const unpaid = await Registration.findById(reg2.registration._id);
  await Registration.updateOne({ _id: unpaid._id }, { $set: { status: 'confirmed' } });
  await assert.rejects(issuePasses(unpaid), error => error.statusCode === 409);
  assert.equal(await Pass.countDocuments({ registrationId: unpaid._id }), 0);
  const missingNocEvent = await makeEvent('missing-noc', { feeInr: 0, requiresNOC: true });
  const missingNoc = await request('/registrations', 'POST', { eventId: missingNocEvent.id }, one.token);
  await Registration.updateOne({ _id: missingNoc.registration._id }, { $set: { status: 'confirmed' } });
  await assert.rejects(issuePasses({ _id: missingNoc.registration._id }), error => error.statusCode === 409);
  assert.equal(await Pass.countDocuments({ registrationId: missingNoc.registration._id }), 0);
  const expiredEvent = await makeEvent('expired-recovery', { feeInr: 0 });
  const expired = await request('/registrations', 'POST', { eventId: expiredEvent.id }, one.token);
  await Event.updateOne({ _id: expiredEvent._id }, { $set: { eventDate: new Date(Date.now() - 2 * 86400000) } });
  await assert.rejects(issuePasses({ _id: expired.registration._id }), error => error.statusCode === 409);
  console.log('PASS recovery prerequisites: inconsistent confirmed registrations cannot issue unpaid/unapproved-NOC passes, and expired events cannot recover entry passes');

  const unavailablePayment = await makeEvent('payment-availability', { paymentUpiId: 'event-test-only@example' });
  const payable = await request('/registrations', 'POST', { eventId: unavailablePayment.id }, one.token);
  assert.equal(payable.status, 201, JSON.stringify(payable));
  const eventIntent = await request('/payments/intent/' + payable.registration._id, 'GET', null, one.token);
  assert.equal(eventIntent.status, 200); assert.equal(eventIntent.upiId, 'event-test-only@example');
  await Event.updateOne({ _id: unavailablePayment._id }, { $set: { status: 'cancelled' } });
  assert.equal((await request('/payments/intent/' + payable.registration._id, 'GET', null, one.token)).status, 409);
  assert.equal((await request('/payments', 'POST', proof(payable.registration._id, utr + '7'), one.token)).status, 409);
  assert.equal(await Payment.countDocuments({ registrationId: payable.registration._id }), 0);
  assert.equal((await Registration.findById(payable.registration._id)).status, 'pending_payment');
  console.log('PASS payment availability: event-specific UPI honored; cancelled event refuses intent/proof without creating a payment or moving registration');

  await Registration.updateMany({ status: 'confirmed', passesIssuedAt: { $exists: false } }, { $set: { passRecoveryAttemptedAt: new Date() } });
  const invalidRecoveryIds = [];
  for (let i = 0; i < 10; i++) {
    const brokenEvent = await makeEvent('recovery-blocker-' + i);
    const broken = await Registration.create({ regId: runId + '-broken-' + i, eventId: brokenEvent._id, leaderId: one.user._id, feeSnapshotInr: 10, status: 'confirmed' });
    invalidRecoveryIds.push(broken._id);
  }
  const fairEvent = await makeEvent('recovery-fair', { feeInr: 0 });
  const fairRegistration = await Registration.create({ regId: runId + '-fair', eventId: fairEvent._id, leaderId: one.user._id, feeSnapshotInr: 0, status: 'checked_in' });
  const { recoverPassesAndReminders } = require('../src/services/email-worker.service');
  await recoverPassesAndReminders();
  assert.equal(await Pass.countDocuments({ registrationId: fairRegistration._id }), 0, 'The valid row follows ten older invalid rows in the first bounded batch.');
  assert.equal(await Registration.countDocuments({ _id: { $in: invalidRecoveryIds }, passRecoveryAttemptedAt: { $exists: true } }), 10);
  await recoverPassesAndReminders();
  assert.equal(await Pass.countDocuments({ registrationId: fairRegistration._id, status: 'issued' }), 1, 'The next batch must recover an untried valid registration beyond the invalid first batch.');
  assert.equal(await Registration.countDocuments({ _id: { $in: invalidRecoveryIds }, passesIssuedAt: { $exists: true } }), 0);
  assert.equal(await Pass.countDocuments({ registrationId: { $in: invalidRecoveryIds } }), 0);
  console.log('PASS recovery fairness: ten invalid paid legacy rows rotate behind an untried valid checked_in free registration; next bounded batch recovers its missing pass without marking invalid rows issued');

  // Transport injection is mandatory here; no SMTP client or real credentials are used.
  const EmailSender = require('../src/models/EmailSender');
  const WorkerLease = require('../src/models/WorkerLease');
  const { sendEmail, renderEmail, absoluteLink } = require('../src/services/email.service');
  const { processEmailQueue } = require('../src/services/email-worker.service');
  await EmailJob.deleteMany({}); // The database is an isolated, disposable loopback replica.
  await EmailSender.deleteMany({});
  await WorkerLease.deleteMany({});
  Object.assign(process.env, { EMAIL_PROVIDER: 'smtp', SMTP_HOST: 'smtp.example.test', SMTP_PORT: '587', SMTP_USERNAME: 'fake-test-user', SMTP_PASSWORD: 'fake-test-only', EMAIL_FROM_ADDRESS: 'events@example.com', FRONTEND_URL: 'https://events.example.test', SMTP_SENDER_INTERVAL_SECONDS: '1' });
  assert.equal(absoluteLink('/invitations/test#token=example'), 'https://events.example.test/invitations/test#token=example');
  assert.throws(() => absoluteLink('http://localhost:3000/invitations/test#token=example'));
  assert.throws(() => absoluteLink('https://untrusted.example/invitations/test'));
  const mail = async tag => sendEmail({ dedupeKey: runId + '-mail-' + tag, to: one.user.email, subject: 'Synthetic worker ' + tag, text: 'Line one\\n\\nLine two', link: '/dashboard', kind: 'payment_verified' });
  const a = await mail('a'), b = await mail('b');
  const template = await renderEmail(await EmailJob.findById(a._id).select('+text +link'));
  assert.match(template.html, /Why are you receiving this email/);
  assert.doesNotMatch(template.html, /Line one\\n/);
  assert.match(template.html, /Line one/); assert.match(template.html, /Line two/);
  assert.match(template.html, /https:\/\/events\.example\.test\/dashboard/);
  const deliveries = [];
  const fakeTransport = account => ({ sendMail: async message => { deliveries.push({ sender: account.id, message }); return { accepted: [message.to] }; } });
  const delivered = await processEmailQueue({ transportFor: fakeTransport, prepare: false });
  assert.equal(delivered.sent, 2);
  assert.deepEqual(deliveries.map(item => item.sender).sort(), ['smtp', 'smtp']);
  assert.equal(await EmailJob.countDocuments({ _id: { $in: [a._id, b._id] }, status: 'sent' }), 2);
  assert.equal(await EmailJob.countDocuments({ _id: { $in: [a._id, b._id] }, text: { $exists: true } }), 0);
  process.env.SMTP_SENDER_INTERVAL_SECONDS = '60';
  await EmailSender.updateMany({}, { $set: { nextAvailableAt: new Date(Date.now() + 60000) } });
  const delayed = await mail('cooldown');
  assert.equal((await processEmailQueue({ transportFor: fakeTransport, prepare: false })).sent, 0);
  assert.equal((await EmailJob.findById(delayed._id)).status, 'queued');
  await EmailSender.updateMany({}, { $set: { nextAvailableAt: new Date(0) } });
  const failure = await processEmailQueue({ transportFor: () => ({ sendMail: async () => { throw Object.assign(new Error('Synthetic timeout'), { code: 'ETIMEDOUT' }); } }), prepare: false });
  assert.equal(failure.sent, 0);
  const deferred = await EmailJob.findById(delayed._id);
  assert.equal(deferred.status, 'queued'); assert.equal(deferred.lastError, 'SMTP_TRANSIENT'); assert.ok(deferred.availableAt > new Date());
  await EmailJob.updateOne({ _id: delayed._id }, { $set: { availableAt: new Date(0) } });
  await EmailSender.updateMany({}, { $set: { nextAvailableAt: new Date(0) } });
  assert.equal((await processEmailQueue({ transportFor: fakeTransport, prepare: false })).sent, 1);
  const blockedJob = await mail('blocked');
  await EmailSender.updateMany({}, { $set: { nextAvailableAt: new Date(0) } });
  await processEmailQueue({ transportFor: () => ({ sendMail: async () => { throw Object.assign(new Error('Synthetic policy denial'), { code: 'EAUTH' }); } }), prepare: false });
  assert.equal((await EmailJob.findById(blockedJob._id)).lastError, 'SENDER_AUTH_OR_POLICY');
  assert.equal(await EmailSender.countDocuments({ paused: true }), 1);
  const deliveryCount = deliveries.length;
  assert.equal((await processEmailQueue({ transportFor: fakeTransport, prepare: false })).state, 'sender_paused');
  assert.equal(deliveries.length, deliveryCount, 'A policy block must pause delivery rather than switch sender identities.');
  console.log('PASS fake SMTP: normalized professional template/live links, explicit SMTP sender paced, sender cooldown respected, successful content redacted, transient failure delayed then retried, auth/policy block pauses queue without sender switching; no real mail sent');
  console.log('PASS: signup/login, profile, role enforcement, multiple solo entrants, team readiness, payment amount, concurrent proof, duplicate UTR, private uploads, approval, NOC, entry QR, wrong-event and repeat scans.');
}
run().catch(e => { console.error(e); process.exitCode = 1; }).finally(async () => {
  if (mongoose.connection.readyState === 1) {
    // Every deletion is restricted to IDs created by this run.
    await Promise.all([
      Payment.deleteMany({ eventId: { $in: eventIds } }), Pass.deleteMany({ eventId: { $in: eventIds } }),
      Registration.deleteMany({ eventId: { $in: eventIds } }), Team.deleteMany({ eventId: { $in: eventIds } }),
      TeamInvite.deleteMany({ eventId: { $in: eventIds } }), StoredFile.deleteMany({ ownerId: { $in: userIds } }),
      EmailJob.deleteMany({ to: { $regex: '^' + runId } }),
      Notification.deleteMany({ userId: { $in: userIds } }), AdminAction.deleteMany({ actorId: { $in: userIds } })
    ]);
    await Event.deleteMany({ _id: { $in: eventIds } }); await User.deleteMany({ _id: { $in: userIds } });
  }
  if (server) await new Promise(resolve => server.close(resolve));
  await disconnectDatabase();
  if (replica) await replica.stop();
});
