// Never load .env here: this fixture must never connect to Atlas or send real mail.
const path = require('node:path');
for (const key of Object.keys(process.env)) {
  if (/^(MONGODB_URI|CLOUDINARY_|GMAIL_|SMTP_|GOOGLE_|SUPER_ADMIN_EMAILS|EMAIL_|RAZORPAY_)/.test(key)) delete process.env[key];
}
Object.assign(process.env, {
  NODE_ENV: 'test', JWT_SECRET: 'isolated-test-jwt-secret-do-not-use-in-production',
  QR_SIGN_SECRET: 'isolated-test-qr-secret-do-not-use-in-production',
  FRONTEND_URL: 'http://localhost:3000', FRONTEND_ORIGINS: 'http://localhost:3000', APP_URL: 'http://localhost:3000',
  PAYMENT_UPI_ID: 'test-only@example', PAYMENT_TEST_MODE: 'true', ENABLE_DEV_LOGIN:'true',ENABLE_MANUAL_PAYMENTS:'true', RATE_LIMIT_MAX: '10000',
  MONGOMS_DOWNLOAD_DIR: path.join(__dirname, '..', 'node_modules', '.cache', 'mongodb-binaries')
});

async function startDatabase() {
  const { MongoMemoryReplSet } = require('mongodb-memory-server');
  const replica = await MongoMemoryReplSet.create({ replSet: { count: 1, ip: '127.0.0.1', storageEngine: 'wiredTiger' }, binary: { version: '7.0.24' } });
  process.env.MONGODB_URI = replica.getUri('eventflow_isolated_tests');
  if (!process.env.MONGODB_URI.startsWith('mongodb://127.0.0.1:')) throw new Error('Refusing non-loopback test database');
  try {
    const { connectDatabase } = require('../src/config/database');
    await connectDatabase();
    const mongoose = require('mongoose');
    // Ensure collections and unique indexes exist before concurrent transactions.
    require('../src/models');
    require('../src/models/StoredFile');
    require('../src/models/EmailJob');
    await Promise.all(Object.values(mongoose.models).map(model => model.init()));
    return replica;
  } catch (error) {
    await require('../src/config/database').disconnectDatabase().catch(() => {});
    await replica.stop();
    throw error;
  }
}
module.exports = { startDatabase };
