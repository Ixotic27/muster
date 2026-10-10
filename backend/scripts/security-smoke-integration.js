// Synthetic API security fixtures only. No production credentials, mail or browser controls.
const { startDatabase } = require('./isolated-test-database');
const assert = require('node:assert/strict');
const mongoose = require('mongoose');
const { User, Event, Registration, Pass, AdminAction } = require('../src/models');
const { issueAccessToken } = require('../src/controllers/auth.controller');
const { issuePasses } = require('../src/services/pass.service');
const app = require('../src/app');
let replica, server;
async function run() {
  replica = await startDatabase();
  server = app.listen(0, '127.0.0.1');
  await new Promise(resolve => server.once('listening', resolve));
  const base = 'http://127.0.0.1:' + server.address().port + '/api/v1';
  const request = async (path, token, method = 'GET', body) => {
    const response = await fetch(base + path, { method, signal: AbortSignal.timeout(15000), headers: {
      ...(token ? { Authorization: 'Bearer ' + token } : {}), ...(body ? { 'Content-Type': 'application/json' } : {})
    }, ...(body ? { body: JSON.stringify(body) } : {}) });
    return { status: response.status, body: await response.json() };
  };
  let sequence = 0;
  const user = extra => User.create({ name: 'Security fixture ' + (++sequence), email: 'security-' + sequence + '@example.test', studentId: 'SEC-' + sequence,
    college: 'Example institution', phone: '9000000000', course: 'B.Tech', specialization: 'Computer Science', section: 'A', year: 3, ...extra });
  const makeEvent = (slug, extra) => Event.create({ name: 'Security ' + slug, slug, category: 'technical', participationType: 'solo', minTeamSize: 1, maxTeamSize: 1,
    feeInr: 50, status: 'published', eventDate: new Date(Date.now() + 7 * 86400000), registrationDeadline: new Date(Date.now() + 6 * 86400000), venue: 'Isolated lab', ...extra });
  const event = await makeEvent('security-target', { maxSlots: 1 });
  const other = await makeEvent('security-other', {});
  const manager = await user({ role: 'organizer', assignedEvents: [event._id] });
  const student = await user({ role: 'student' });
  const admin = await user({ role: 'admin' });
  const managerToken = issueAccessToken(manager), studentToken = issueAccessToken(student), adminToken = issueAccessToken(admin);
  const prefix = '/events/manage/' + event._id;
  const paths = [[prefix + '/roster', 'GET'], [prefix + '/roster/export', 'GET'], [prefix + '/registration-controls', 'PATCH'], ['/admin/roster', 'GET'], ['/scanner/stats/' + event._id, 'GET']];
  for (const [path, method] of paths) {
    const body = method === 'PATCH' ? { status: 'closed' } : undefined;
    assert.equal((await request(path, undefined, method, body)).status, 401);
    assert.equal((await request(path, 'not-a-valid-jwt', method, body)).status, 401);
    assert.equal((await request(path, studentToken, method, body)).status, 403);
  }
  assert.equal((await request('/events/manage/' + other._id + '/roster?eventId=' + event._id, managerToken)).status, 403, 'Query cannot override the URL assignment scope');
  assert.equal((await request('/admin/roster', managerToken)).status, 403);
  assert.equal((await request('/events/manage/all', managerToken)).body.events.length, 1);
  await User.updateOne({ _id: manager._id }, { $set: { isActive: false } });
  assert.equal((await request(prefix + '/roster', managerToken)).status, 401);
  await User.updateOne({ _id: manager._id }, { $set: { isActive: true, role: 'student' } });
  assert.equal((await request(prefix + '/roster', managerToken)).status, 403, 'Previously issued tokens must not preserve removed roles');
  await User.updateOne({ _id: manager._id }, { $set: { role: 'organizer' } });
  await User.updateOne({ _id: admin._id }, { $set: { passwordChangedAt: new Date(Date.now() + 1000) } });
  assert.equal((await request('/admin/roster', adminToken)).status, 401);
  console.log('PASS missing/invalid authentication denials, student denial, manager scope/URL precedence, live role/inactive checks and password-reset token invalidation');

  for (const body of [{ status: 'draft' }, { status: 'cancelled' }, { maxSlots: 0 }, { maxSlots: -1 }, { maxSlots: 1.5 }, { feeInr: 0 }, { assignedEvents: [other._id] }]) {
    assert.equal((await request(prefix + '/registration-controls', managerToken, 'PATCH', body)).status, 400);
  }
  assert.equal((await request(prefix + '/registration-controls', managerToken, 'PATCH', { registrationDeadline: new Date(Date.now() + 8 * 86400000).toISOString() })).status, 400);
  assert.equal((await Event.findById(event._id)).feeInr, 50);
  assert.equal((await Event.findById(event._id)).status, 'published');
  assert.equal(await AdminAction.countDocuments(), 0, 'Rejected requests must not create misleading audit entries');
  const stripped = await request(prefix + '/registration-controls', managerToken, 'PATCH', { status: 'published', feeInr: 0, minTeamSize: 9, filledSlots: 999 });
  assert.equal(stripped.status, 200);
  const persisted = await Event.findById(event._id);
  assert.equal(persisted.feeInr, 50); assert.equal(persisted.minTeamSize, 1); assert.equal(persisted.filledSlots, 0);
  const contenders = [await user({}), await user({})];
  const attempts = await Promise.all(contenders.map(value => request('/registrations', issueAccessToken(value), 'POST', { eventId: String(event._id), feeSnapshotInr: 0, minTeamSizeSnapshot: 8, maxTeamSizeSnapshot: 9, status: 'confirmed' })));
  assert.deepEqual(attempts.map(value => value.status).sort(), [201, 409], 'Exactly one participant can reserve the last capacity slot');
  const created = await Registration.findOne({ eventId: event._id });
  assert.equal(created.feeSnapshotInr, 50); assert.equal(created.minTeamSizeSnapshot, 1); assert.equal(created.maxTeamSizeSnapshot, 1); assert.equal(created.status, 'pending_payment');
  assert.equal(await Pass.countDocuments(), 0);
  assert.equal((await Event.findById(event._id)).filledSlots, 1);
  const reopenFull = await request(prefix + '/registration-controls', managerToken, 'PATCH', { status: 'published' });
  assert.equal(reopenFull.body.event.availability.open, false); assert.equal(reopenFull.body.event.availability.reason, 'capacity_full');
  await Registration.updateOne({ _id: created._id }, { $set: { status: 'confirmed' } });
  await assert.rejects(issuePasses(created), /Payment must be verified/);
  assert.equal(await Pass.countDocuments(), 0, 'A forged registration confirmation without verified payment must not issue a pass');
  await Registration.updateOne({ _id: created._id }, { $set: { status: 'pending_payment' } });
  const expired = await makeEvent('security-deadline', { registrationDeadline: new Date(Date.now() - 1000) });
  await User.updateOne({ _id: manager._id }, { $addToSet: { assignedEvents: expired._id } });
  const reopened = await request('/events/manage/' + expired._id + '/registration-controls', managerToken, 'PATCH', { status: 'published' });
  assert.equal(reopened.body.event.availability.open, false); assert.equal(reopened.body.event.availability.reason, 'deadline_passed');
  assert.equal((await request('/registrations', studentToken, 'POST', { eventId: String(expired._id) })).status, 409);
  assert.equal(await Registration.countDocuments({ eventId: expired._id }), 0);
  assert.equal((await request('/events/security-deadline')).body.event.availability.open, false);
  console.log('PASS controls field/status validation, server-owned fees/snapshots, last-slot concurrency, immutable reservations, deadline/capacity reopen enforcement and unverified-payment pass denial');
}
run().catch(error => { console.error(error.name + ': ' + error.message); process.exitCode = 1; }).finally(async () => {
  if (server) await new Promise(resolve => server.close(resolve));
  await mongoose.disconnect(); if (replica) await replica.stop();
});
