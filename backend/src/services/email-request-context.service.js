const { AsyncLocalStorage } = require('node:async_hooks');

// Transaction callbacks may retry. Collect identifiers only; the dispatcher
// reads committed jobs afterwards, so rolled-back records can never be mailed.
const requests = new AsyncLocalStorage();
function runWithEmailRequest(work) {
  return requests.run({ keys: new Set() }, work);
}
function trackEmailJob(key) {
  const request = requests.getStore();
  if (request && typeof key === 'string' && key.length <= 512 && request.keys.size < 200) request.keys.add(key);
}
function queuedEmailKeys() {
  return [...(requests.getStore()?.keys || [])];
}
module.exports = { runWithEmailRequest, trackEmailJob, queuedEmailKeys };
