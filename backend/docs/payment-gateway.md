# Razorpay payment setup

The template supports Razorpay Standard Checkout and a separate optional manual-payment workflow. Checkout never trusts a price supplied by a browser: the API charges the fee saved when the attendee registered. INR is the supported currency.

## Configure everything in one step

Put these values in the backend's ignored `.env` or your deployment's secret settings. Do not put secret keys in frontend variables, a public repository, screenshots, or emails.

| Variable | What to provide |
| --- | --- |
| `PAYMENT_TEST_MODE` | `true` while testing; `false` only after completing your own live-payment review |
| `RAZORPAY_KEY_ID` | Your Razorpay test Key ID, beginning with `rzp_test_` |
| `RAZORPAY_KEY_SECRET` | The matching API Key Secret from the same account and mode |
| `RAZORPAY_WEBHOOK_SECRET` | A separate strong secret you choose when configuring the webhook |
| `FRONTEND_URL` | The public HTTPS address of your deployed frontend, for email links |
| `EMAIL_PROVIDER` | Your configured email provider, such as `smtp` |
| `SMTP_HOST`, `SMTP_PORT` | Your provider's hostname and TLS/STARTTLS port |
| `SMTP_USERNAME`, `SMTP_PASSWORD` | The SMTP credentials, not a personal mailbox password |
| `EMAIL_FROM_ADDRESS`, `EMAIL_REPLY_TO` | Your verified sender address and monitored reply mailbox |
| `JWT_SECRET`, `QR_SIGN_SECRET` | Two different randomly generated application secrets, each at least 32 characters |
| `MONGODB_URI` | A MongoDB replica-set connection string, required for transactional settlement |

1. Generate test API keys in your Razorpay dashboard. Enable **automatic capture**; an authorized payment alone does not grant entry.
2. Create a webhook targeting `https://YOUR-API-HOST/api/v1/payments/gateway/webhook`. Subscribe to `payment.captured` and `order.paid`. Set the same separate webhook secret in the dashboard and backend settings.
3. Restart the API. `GET /api/v1/payments/gateway/config` should report `enabled: true` and `testMode: true`. An absent key, an incorrect test/live prefix, or a missing secret keeps checkout disabled.
4. Create a fresh test registration, open its payment page, and complete a provider test payment. Confirm the receipt, entry pass, staff roster, and email outbox. If the event requires an organizer-approved document, payment succeeds but the pass waits for document approval.
5. Verify that the webhook is delivered successfully. The attendee's browser might close before its verification request; the webhook still completes settlement.
6. Before going live, complete Razorpay's account requirements, publish your event/refund/privacy policies, test failure and refund handling, and replace test keys with the account's `rzp_live_` keys. Use a live-mode webhook with its own secret and set `PAYMENT_TEST_MODE=false`.

Only the public Key ID is sent to Standard Checkout. The key secret and webhook secret remain on the server. Existing orders stay tied to the Key ID that created them; reconcile outstanding orders before rotating account keys or changing modes.

## What happens after success

The API checks the checkout signature against the order ID stored on the server, then fetches the payment from Razorpay. It requires a captured payment with the exact order, amount, and currency. Payment receipt, registration confirmation, each attendee's pass, and email jobs commit in one database transaction. Callback and webhook retries reuse the same receipt and passes.

Each participant receives a payment confirmation email and, once all entry requirements are satisfied, an individual QR-pass email. SMTP happens after the transaction commits; a temporary provider failure leaves a durable job for the worker to retry. Delivery time depends on your mail provider and its quotas.

If a payment is captured after registration cancellation, a deadline, or an event closure, the API records it for **manual refund review** and does not restore entry. If another payment already exists, the additional captured receipt is retained and reviewers receive a reconciliation notice. No refund transfer happens automatically: an organizer must reconcile the money in the provider dashboard and record the refund decision/reference in the application.

An order-creation timeout can leave an order created at the provider even though the response was lost. The local reservation intentionally prevents a second checkout order. An organizer must reconcile the provider receipt before clearing that reservation. Do not blindly delete order records or repeatedly create new payment orders.

## API contracts

Authenticated requests:

- `POST /api/v1/payments/gateway/orders` with `{ "registrationId": "..." }` returns `{ "success": true, "keyId": "...", "testMode": true, "registrationId": "...", "order": { "id": "order_...", "amount": 7500, "currency": "INR" } }`. Amounts are in paise.
- `POST /api/v1/payments/gateway/verify` with `registrationId`, `razorpay_order_id`, `razorpay_payment_id`, and `razorpay_signature` returns the confirmed registration status and `passCount`, or a pending-document/review result. Only the registration owner can create or verify its order.

The public webhook endpoint authenticates Razorpay's HMAC signature over the **original raw request bytes**, before the normal JSON parser. No attendee login or client-supplied success flag authenticates a webhook.

## Tests

Run `node scripts/gateway-security-integration.js` from the backend. Tests use a disposable replica-set database, a fake provider, and a fake SMTP sink. They do not send money or email through real accounts. The suite covers ownership, fee conversion, tampering, pending/captured states, amount and currency mismatch, callback/webhook replay, receipt/pass emails, required-document gating, late capture, and unknown orders. Real Razorpay sandbox checkout and actual mailbox delivery must still be verified by each operator after adding their own credentials.

This integration follows the provider's official [Standard Checkout integration steps](https://github.com/razorpay/markdown-docs/blob/master/payments/payment-gateway/web-integration/standard/integration-steps.md) and [webhook signature validation guidance](https://github.com/razorpay/markdown-docs/blob/master/webhooks/validate-test.md).
