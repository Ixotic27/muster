// Disposable browser-review API. Never reads .env and never sends mail or payments.
const { startDatabase } = require('./isolated-test-database');
process.env.FRONTEND_URL = 'http://127.0.0.1:4120';
process.env.FRONTEND_ORIGINS = 'http://127.0.0.1:4120,http://localhost:4120';
process.env.ENABLE_MANUAL_PAYMENTS = 'false';
process.env.ENABLE_DEV_LOGIN = 'false';
process.env.EVENT_TIMEZONE = 'UTC';
const { User, Event } = require('../src/models');
const { hashPassword } = require('../src/utils/password');
const app = require('../src/app');
let replica, server;
async function main() {
  replica = await startDatabase();
  const eventDate = new Date(Date.now() + 30 * 86400000);
  const events = await Event.create([
    { slug: 'design-sprint', name: 'Design Sprint', description: 'A collaborative design challenge for teams of two to four.', category: 'technical', participationType: 'team', minTeamSize: 2, maxTeamSize: 4, feeInr: 100, venue: 'Workshop Hall', maxSlots: 50, eventDate, status: 'published', rules: ['Bring your own laptop.', 'Teams must have between two and four participants.'] },
    { slug: 'community-workshop', name: 'Community Workshop', description: 'Learn, meet and build together in an open community workshop.', category: 'non_technical', participationType: 'solo', minTeamSize: 1, maxTeamSize: 1, feeInr: 0, venue: 'Main Hall', maxSlots: 100, eventDate, status: 'published', rules: ['Bring your curiosity.'] }
  ]);
  for (const role of ['student', 'organizer', 'super_admin']) {
    const tag = { student: 'attendee', organizer: 'manager', super_admin: 'admin' }[role];
    await User.create({ email: tag + '@example.com', name: 'Example ' + tag, role, profileComplete: true, passwordHash: hashPassword('LocalFixtureOnly!2834'), assignedEvents: role === 'organizer' ? [events[0]._id] : [] });
  }
  server = app.listen(4121, '127.0.0.1', () => console.log('Isolated fixture API listening on 127.0.0.1:4121; mail and payments disabled'));
}
async function stop() {
  if (server) await new Promise(resolve => server.close(resolve));
  await require('../src/config/database').disconnectDatabase();
  if (replica) await replica.stop();
  process.exit(0);
}
process.once('SIGTERM', stop);
process.once('SIGINT', stop);
main().catch(async error => { console.error(error.message); await stop(); });
