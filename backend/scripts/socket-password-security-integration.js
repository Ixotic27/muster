// Actual JWT/database authorization with synthetic sockets; no live server or data.
const { startDatabase } = require('./isolated-test-database');
const assert = require('node:assert/strict');
const jwt = require('jsonwebtoken');
const mongoose = require('mongoose');
const { User, Team } = require('../src/models');
const { issueAccessToken } = require('../src/controllers/auth.controller');
const { recheckSocketAccess, RECHECK_INTERVAL_MS } = require('../src/sockets/socketAuth');
const registerTeam = require('../src/sockets/teamSocket');
const registerNotifications = require('../src/sockets/notificationSocket');
let replica;
const sockets = [];
class SyntheticSocket {
  constructor(token, header = false) {
    this.connected = true; this.data = {}; this.rooms = new Set(); this.handlers = new Map();
    this.handshake = header ? { headers: { authorization: 'Bearer ' + token } } : { auth: { token } };
    sockets.push(this);
  }
  on(name, handler) { const handlers = this.handlers.get(name) || []; handlers.push(handler); this.handlers.set(name, handlers); }
  join(room) { if (this.connected) this.rooms.add(room); }
  disconnect() { if (!this.connected) return; this.connected = false; this.rooms.clear(); for (const handler of this.handlers.get('disconnect') || []) handler(); }
  async emit(name, value) { for (const handler of this.handlers.get(name) || []) await handler(value); }
}
const io = { handlers: [], on(name, handler) { if (name === 'connection') this.handlers.push(handler); } };
async function connect(token, header = false) {
  const socket = new SyntheticSocket(token, header);
  await Promise.all(io.handlers.map(handler => handler(socket)));
  return socket;
}
async function run() {
  replica = await startDatabase();
  registerTeam(io); registerNotifications(io);
  const user = await User.create({ name: 'Synthetic Staff', email: 'socket-staff@example.com', role: 'organizer' });
  const outsider = await User.create({ name: 'Synthetic Other', email: 'socket-other@example.com' });
  const eventId = new mongoose.Types.ObjectId();
  const team = await Team.create({ teamName: 'Synthetic member team', eventId, leaderId: user._id, joinCode: 'SOCKETABC', members: [{ userId: user._id, nameSnapshot: user.name }] });
  const otherTeam = await Team.create({ teamName: 'Synthetic other team', eventId, leaderId: outsider._id, joinCode: 'SOCKETXYZ', members: [{ userId: outsider._id, nameSnapshot: outsider.name }] });
  const token = issueAccessToken(user);
  const normal = await connect(token);
  assert.equal(normal.connected, true); assert.ok(normal.rooms.has('user:' + user._id));
  await normal.emit('team:join', team._id); assert.ok(normal.rooms.has('team:' + team._id));
  await normal.emit('team:join', otherTeam._id); assert.equal(normal.rooms.has('team:' + otherTeam._id), false);
  await normal.emit('team:join', 'invalid-id'); assert.equal(normal.connected, true);
  assert.equal((await connect(token, true)).connected, true);
  assert.equal(normal.handlers.get('disconnect').length, 1, 'Both registrars share one bounded authorization guard');
  assert.equal(RECHECK_INTERVAL_MS, 30000);
  console.log('PASS normal bearer/header sessions enter own notification/member rooms; another team denied, malformed team safe, one shared 30-second recheck guard');

  const restricted = jwt.sign({ sub: String(user._id), purpose: 'temporary_password_change', passwordChangedAt: 0, temporaryPasswordVersion: 'synthetic-version' }, process.env.JWT_SECRET, { expiresIn: '15m' });
  for (const candidate of [restricted, 'invalid-token', jwt.sign({ sub: String(user._id), passwordChangedAt: 0 }, 'wrong-signing-secret'), jwt.sign({ sub: String(user._id), passwordChangedAt: 0 }, process.env.JWT_SECRET, { expiresIn: -1 })]) {
    const socket = await connect(candidate); assert.equal(socket.connected, false); assert.equal(socket.rooms.size, 0);
  }
  await User.updateOne({ _id: user._id }, { $set: { mustChangePassword: true } });
  assert.equal((await connect(token)).connected, false);
  await normal.emit('team:join', team._id);
  assert.equal(normal.connected, false); assert.equal(normal.rooms.size, 0);
  console.log('PASS restricted/invalid/wrong-key/expired/pending-password sessions disconnected; already-connected user revalidated before team action');

  await User.updateOne({ _id: user._id }, { $set: { mustChangePassword: false, passwordChangedAt: new Date() } });
  assert.equal((await connect(token)).connected, false);
  const updated = await User.findById(user._id);
  const fresh = await connect(issueAccessToken(updated)); assert.equal(fresh.connected, true);
  await User.updateOne({ _id: user._id }, { $set: { passwordChangedAt: new Date(updated.passwordChangedAt.getTime() + 1) } });
  assert.equal(await recheckSocketAccess(fresh), null); assert.equal(fresh.connected, false); assert.equal(fresh.rooms.size, 0);
  const legacy = jwt.sign({ sub: String(user._id) }, process.env.JWT_SECRET, { expiresIn: '7d' });
  assert.equal((await connect(legacy)).connected, false);
  console.log('PASS exact password-change timestamp invalidates prior sessions and established rooms; fresh token allowed, older second-precision legacy token denied');

  const active = await User.findById(user._id);
  const beforeDeactivation = await connect(issueAccessToken(active)); assert.equal(beforeDeactivation.connected, true);
  await User.updateOne({ _id: user._id }, { $set: { isActive: false } });
  assert.equal(await recheckSocketAccess(beforeDeactivation), null); assert.equal(beforeDeactivation.connected, false);
  assert.equal((await connect(issueAccessToken(active))).connected, false);
  assert.equal((await connect(jwt.sign({ sub: String(new mongoose.Types.ObjectId()), passwordChangedAt: 0 }, process.env.JWT_SECRET))).connected, false);
  assert.equal((await connect(jwt.sign({ sub: 'not-an-object-id' }, process.env.JWT_SECRET))).connected, false);
  console.log('PASS inactive/missing/malformed account rejected without rooms and existing access removed at guard recheck');
}
run().catch(error => { console.error(error.name + ': ' + error.message); process.exitCode = 1; }).finally(async () => {
  for (const socket of sockets) socket.disconnect();
  await mongoose.disconnect(); if (replica) await replica.stop();
});
