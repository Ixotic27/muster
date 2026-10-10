require('dotenv').config();
const http = require('http');
const app = require('./src/app');
const { Server } = require('socket.io');
const { loadConfig } = require('./src/config/env');
const { connectDatabase, disconnectDatabase } = require('./src/config/database');
const { setIO } = require('./src/config/socket');

const config = loadConfig();

const server = http.createServer(app);

// Socket.io initialization
const io = new Server(server, {
  cors: {
    origin: config.frontendOrigins,
    methods: ['GET', 'POST'],
    credentials: true
  }
});
setIO(io);

// Attach socket handlers
try {
  const registerTeamSocket = require('./src/sockets/teamSocket');
  if (typeof registerTeamSocket === 'function') {
    registerTeamSocket(io);
  }
} catch (err) {
  console.log('Socket handlers will be attached when fully implemented.');
}
try {
  const registerNotificationSocket = require('./src/sockets/notificationSocket');
  if (typeof registerNotificationSocket === 'function') registerNotificationSocket(io);
} catch (err) {
  console.log('Notification socket handlers are unavailable.');
}

async function start() {
  await connectDatabase();
  await new Promise((resolve) => server.listen(config.port, resolve));
  console.log(`Muster API listening on port ${config.port} (${config.nodeEnv})`);
  if (!process.env.MONGODB_URI) console.warn('MONGODB_URI is not configured; database routes will be unavailable');
  return server;
}

async function shutdown(signal) {
  console.log(`${signal} received; shutting down`);
  io.close();
  await new Promise((resolve) => server.close(resolve));
  await disconnectDatabase();
  process.exit(0);
}

if (require.main === module) {
  start().catch((error) => { console.error('Unable to start backend:', error.message); process.exit(1); });
  process.once('SIGTERM', () => shutdown('SIGTERM'));
  process.once('SIGINT', () => shutdown('SIGINT'));
}

module.exports = { app, server, io, start, shutdown };
