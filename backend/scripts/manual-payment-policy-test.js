// Real HTTP against isolated replica-set fixtures; no payment provider or mail.
const assert = require('node:assert/strict');
const { startDatabase } = require('./isolated-test-database');
const mongoose = require('mongoose');
const { User, Event, Registration } = require('../src/models');
const { issueAccessToken } = require('../src/controllers/auth.controller');
const app = require('../src/app');
let replica, server;
async function main() {
  replica = await startDatabase(); server = app.listen(0, '127.0.0.1');
  await new Promise(resolve => server.once('listening', resolve));
  const user = await User.create({ name: 'Example participant', email: 'participant@example.test' });
  const event = await Event.create({ name: 'Example payment event', slug: 'example-payment-policy', category: 'technical', participationType: 'solo', minTeamSize: 1, maxTeamSize: 1, feeInr: 50, eventDate: new Date(Date.now() + 86400000), venue: 'Example hall', status: 'published' });
  const registration = await Registration.create({ regId: 'REG-EXAMPLE-POLICY', leaderId: user._id, eventId: event._id, feeSnapshotInr: 50, status: 'pending_payment' });
  const intent = async () => (await fetch('http://127.0.0.1:' + server.address().port + '/api/v1/payments/intent/' + registration._id, { headers: { Authorization: 'Bearer ' + issueAccessToken(user) }, signal: AbortSignal.timeout(10000) })).status;
  assert.equal(await intent(), 200);
  await Event.updateOne({ _id: event._id }, { paymentDeadline: new Date(Date.now() - 1000) });
  assert.equal(await intent(), 409, 'Passed payment deadline closes manual collection');
  await Event.updateOne({ _id: event._id }, { $unset: { paymentDeadline: 1 }, $set: { eventDate: new Date(Date.now() - 1000) } });
  assert.equal(await intent(), 409, 'Started event closes manual collection');
  await Event.updateOne({ _id: event._id }, { eventDate: new Date(Date.now() + 86400000) });
  process.env.ENABLE_MANUAL_PAYMENTS = 'false';
  assert.equal(await intent(), 409, 'Disabled manual mode refuses collection');
  console.log('PASS manual payment availability, deadline, event-start and disabled-provider policy');
}
main().catch(error => { console.error(error.name + ': ' + error.message); process.exitCode = 1; }).finally(async () => { if (server) await new Promise(resolve => server.close(resolve)); await mongoose.disconnect(); if (replica) await replica.stop(); });
