const { processEmailQueue } = require('./email-worker.service');

// Persisted outbox jobs remain the source of truth. This awaited best-effort
// attempt reduces reliance on delayed cron runs without bypassing the worker
// lease, sender cooldown, provider pause or daily delivery limits.
async function dispatchResetEmail(dedupeKey, { processQueue = processEmailQueue } = {}) {
  if (typeof dedupeKey !== 'string' || !/^reset:[a-f0-9]{64}$/.test(dedupeKey)) return { state: 'skipped', reason: 'INVALID_RESET_JOB' };
  try {
    return await processQueue({ prepare: false, targetDedupeKey: dedupeKey });
  } catch (_) {
    // Delivery failure cannot turn the generic account-recovery response into
    // an account existence probe. The durable job is retried by the worker.
    return { state: 'deferred', reason: 'WORKER_UNAVAILABLE' };
  }
}

async function dispatchTransactionalEmails(keys, { processQueue = processEmailQueue } = {}) {
  const targets = [...new Set((Array.isArray(keys) ? keys : []).filter(key => typeof key === 'string' && key.length > 0 && key.length <= 512))].slice(0, 200);
  if (!targets.length) return { state: 'skipped', reason: 'NO_REQUEST_EMAILS' };
  try {
    return await processQueue({ prepare: false, targetDedupeKeys: targets });
  } catch (_) {
    // A committed registration/payment must not become a false failure because
    // SMTP is down. The persisted outbox remains available to the next worker.
    return { state: 'deferred', reason: 'WORKER_UNAVAILABLE' };
  }
}

module.exports = { dispatchResetEmail, dispatchTransactionalEmails };
