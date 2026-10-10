const mongoose = require('mongoose');

let connectionPromise = null;

async function connectDatabase() {
  const uri = process.env.MONGODB_URI;
  if (!uri) {
    if (process.env.NODE_ENV === 'production') {
      throw new Error('MONGODB_URI is required in production');
    }
    return null;
  }

  if (!connectionPromise) {
    connectionPromise = mongoose.connect(uri, {
      serverSelectionTimeoutMS: Number(process.env.MONGO_SERVER_SELECTION_TIMEOUT_MS || 10000),
      maxPoolSize: Number(process.env.MONGO_MAX_POOL_SIZE || 20)
    }).catch((error) => { connectionPromise = null; throw error; });
  }

  await connectionPromise;
  return mongoose.connection;
}

async function disconnectDatabase() {
  connectionPromise = null;
  if (mongoose.connection.readyState !== 0) {
    await mongoose.disconnect();
  }
}

module.exports = { connectDatabase, disconnectDatabase };
