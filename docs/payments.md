# Payment flow and gateway setup

A participant first creates a registration. Its fee is saved as a snapshot so a
later event-price edit cannot silently change the amount they owe. For a team,
the registered leader pays the registration fee and each accepted teammate gets
an individual pass when payment and any required document approval are complete.

Manual proof review remains available when an operator explicitly configures a
payment destination. Razorpay adds hosted checkout and automatic server-side
verification. The template includes no real bank account, UPI ID, payment QR,
merchant key, or payment history.

## Collect these values before configuring the gateway

In your own Razorpay dashboard, collect **all three backend values**:

```dotenv
RAZORPAY_KEY_ID=
RAZORPAY_KEY_SECRET=
RAZORPAY_WEBHOOK_SECRET=
PAYMENT_TEST_MODE=true
```

Start with a Test Mode key (`rzp_test_…`). Use an independently generated webhook
secret; it is not the API key secret. Keep secrets server-side. The browser
receives only the public checkout key and the order created for its registration.
Configure automatic capture in your gateway dashboard.

Add an HTTPS webhook endpoint:

```text
https://api.example.com/api/v1/payments/gateway/webhook
```

Subscribe to `payment.captured` and/or `order.paid`. Use separate keys and
webhook configuration for test and live environments. Live mode requires
`PAYMENT_TEST_MODE=false` and your approved live merchant credentials. Do not
enable live mode until you have tested checkout, callbacks, webhook retries,
payment failure, document review, cancellation and refund reconciliation.

## What happens after checkout

1. The API checks the current user owns an eligible registration. It calculates
   the amount in paise from its stored fee and creates or reuses an order.
2. Hosted checkout collects payment; this application never collects card data.
3. The browser callback supplies the order, payment identifier and signature.
   The API validates the signature against its stored order, fetches the payment
   from Razorpay, and verifies capture status, amount, currency and order.
4. The signed webhook provides a second route to settlement if the browser
   closes. Its signature is checked against the exact raw request body before
   interpreting the JSON. Provider state is fetched again.
5. A database transaction records the receipt, updates the registration, creates
   the individual passes when eligible, and queues confirmation emails. Replayed
   callbacks do not generate a second receipt or pass.

This follows Razorpay's documented [standard integration verification](https://github.com/razorpay/markdown-docs/blob/master/payments/payment-gateway/web-integration/standard/integration-steps.md)
and [raw-body webhook validation](https://github.com/razorpay/markdown-docs/blob/master/webhooks/validate-test.md).

## Refunds and unusual payment timing

Participants request withdrawal/refund from their registration. Assigned staff
review it in their queue. A refund is marked completed only after the operator
has actually returned the money and recorded the reference. The current template
does **not** initiate gateway/bank refunds automatically.

If money is captured after a registration becomes unavailable, it is recorded
for organizer review instead of restoring entry. No pass or automatic refund is
issued. An API timeout during order creation also requires reconciliation rather
than blindly creating another payable order.

## API surface

| Endpoint | Purpose |
| --- | --- |
| `POST /api/v1/payments/gateway/orders` | Authenticated owner sends `registrationId`; server returns order, amount and public key. |
| `POST /api/v1/payments/gateway/verify` | Authenticated owner sends `registrationId`, `razorpay_order_id`, `razorpay_payment_id`, `razorpay_signature`. |
| `POST /api/v1/payments/gateway/webhook` | Gateway sends raw signed payload using `X-Razorpay-Signature`. No browser session required. |

Automated tests inject a fake provider and a disposable database. They exercise
the verification rules without charging money. They do not prove settlement
against a real merchant account, which requires your own test-mode credentials.
