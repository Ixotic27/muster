// Isolated database only; no transport or external service is called.
const assert = require('node:assert/strict');
const { startDatabase } = require('./isolated-test-database');
const mongoose = require('mongoose');
const { User, Event, Registration } = require('../src/models');
const { renderEmail } = require('../src/services/email.service');
let replica;
async function main() {
  replica = await startDatabase();
  const [attendee, reviewer, other] = await User.create([
    { name: 'Fixture attendee', email: 'attendee@example.test' },
    { name: 'Fixture reviewer', email: 'reviewer@example.test', role: 'organizer' },
    { name: 'Other fixture reviewer', email: 'other@example.test', role: 'organizer' }
  ]);
  const event = await Event.create({ name: 'Example event', slug: 'example-review', category: 'technical', participationType: 'solo', minTeamSize: 1, maxTeamSize: 1, feeInr: 50, eventDate: new Date(Date.now() + 86400000), venue: 'Example hall', status: 'published' });
  const registration = await Registration.create({ regId: 'REG-EXAMPLE-REVIEW', leaderId: attendee._id, eventId: event._id, feeSnapshotInr: 50, status: 'pending_payment' });
  await User.updateOne({ _id: reviewer._id }, { assignedEvents: [event._id] });
  const job = { recipientId: reviewer._id, to: reviewer.email, kind: 'payment_review_required', audience: 'staff', eventId: event._id, registrationId: registration._id,
    subject: 'Additional captured payment needs review', text: 'An additional receipt was recorded. Reconcile the provider transaction.', link: '/manager' };
  assert.ok(await renderEmail(job), 'Assigned reviewer must receive payment reconciliation alert');
  assert.equal(await renderEmail({ ...job, recipientId: other._id, to: other.email }), null, 'Unassigned organizer cannot receive reconciliation details');
  assert.equal(await renderEmail({ ...job, recipientId: attendee._id, to: attendee.email }), null, 'Participant cannot receive staff reconciliation alert');
  await User.updateOne({ _id: reviewer._id }, { assignedEvents: [] });
  assert.equal(await renderEmail(job), null, 'Removed event assignment cancels queued staff email');
  console.log('PASS additional payment reconciliation email with current event-role authorization');
}
main().catch(error => { console.error(error.name + ': ' + error.message); process.exitCode = 1; }).finally(async () => { await mongoose.disconnect(); if (replica) await replica.stop(); });
