const crypto = require('crypto');

function normalizeEmail(value) {
  return String(value || '').trim().toLowerCase();
}

function normalizeUtr(value) {
  return String(value || '').trim().toUpperCase().replace(/\s+/g, '');
}

function isValidObjectId(value) {
  return /^[a-f\d]{24}$/i.test(String(value || ''));
}

function createRequestId() {
  return crypto.randomUUID();
}

function asyncHandler(handler) {
  return (req, res, next) => {
    if (process.env.NODE_ENV !== 'production') return Promise.resolve().then(() => handler(req, res, next)).catch(next);
    const context = require('../services/email-request-context.service');
    return context.runWithEmailRequest(async () => {
      const originalJson = res.json;
      let pendingResponse;
      let hasPendingResponse = false;
      let delegated = false;
      const forward = error => { delegated = true; res.json = originalJson; return next(error); };
      // Controllers send JSON only after their transactions and post-commit
      // work finish. Hold that response until this request's bounded delivery
      // attempt completes, instead of using background work Vercel can freeze.
      res.json = function captureJson(body) { hasPendingResponse = true; pendingResponse = body; return this; };
      try {
        await handler(req, res, forward);
        res.json = originalJson;
        if (delegated) return;
        if (hasPendingResponse && !res.headersSent && res.statusCode < 400) {
          await require('../services/email-dispatch.service').dispatchTransactionalEmails(context.queuedEmailKeys());
        }
        if (hasPendingResponse && !res.headersSent) return originalJson.call(res, pendingResponse);
      } catch (error) {
        res.json = originalJson;
        return next(error);
      } finally {
        res.json = originalJson;
      }
    });
  };
}

module.exports = { normalizeEmail, normalizeUtr, isValidObjectId, createRequestId, asyncHandler };
