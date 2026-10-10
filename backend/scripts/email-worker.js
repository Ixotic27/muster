require('dotenv').config();
const { connectDatabase, disconnectDatabase } = require('../src/config/database');
const { processEmailQueue, recoverPassesAndReminders } = require('../src/services/email-worker.service');
const once = process.argv.includes('--once');
const intervalMs = Math.max(5000, Math.min(60000, Number(process.env.EMAIL_WORKER_POLL_MS) || 15000));
let stopping = false;
process.once('SIGTERM', () => { stopping = true; });
process.once('SIGINT', () => { stopping = true; });
async function main() {
  await connectDatabase();
  do {
    const started = Date.now();
    try {
      await recoverPassesAndReminders();
      console.log(await processEmailQueue());
    } catch (_) {
      console.error('Email worker failed; queued messages remain durable.');
      if (once) process.exitCode = 1;
    }
    if (once || stopping) break;
    while (!stopping && Date.now() - started < intervalMs) {
      await new Promise(resolve => setTimeout(resolve, 250));
    }
  } while (!stopping);
}
main().catch(() => {
  console.error('Unable to connect email worker database.');
  process.exitCode = 1;
}).finally(disconnectDatabase);
