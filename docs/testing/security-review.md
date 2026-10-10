# Security and workflow review

Reviewed on 10 October 2026. This review applies to the reusable template. All
fixtures use invented `example.test` accounts and disposable local databases.
No production account, existing event QR, payment credential, mail account or
participant record was used.

## Issues corrected during review

- Optional Google sign-in now requires a verified provider email. It refuses
  inactive accounts and cannot reactivate an account deactivated concurrently.
- Google authorization callbacks must match a signed, five-minute browser
  binding cookie. Invalid, expired, missing and tampered state are rejected.
  The cookie is HTTP-only, uses SameSite=Lax and is Secure in production.
- Manual payment collection respects the configured payment deadline and
  closes when the event starts, matching the gateway policy.
- An unexpected additional captured payment now produces an authorized staff
  reconciliation email. Assigned organizers receive a manager link; administrators
  receive an administration link. Removed event assignments suppress queued mail.

## Checks executed

| Test command (inside `backend`) | Result | Scope |
| --- | --- | --- |
| `node scripts/oauth-security-test.js` | Passed, two groups | Real state signing, tampering/expiry/purpose checks; offline verified/unverified Google profile fixtures; inactive-account and guarded-update checks |
| `node scripts/manual-payment-policy-test.js` | Passed | Real HTTP against an isolated replica set: available payment intent, passed deadline, started event and disabled manual payment |
| `node scripts/email-review-security-test.js` | Passed | Current event assignment and role checks when rendering an additional-payment reconciliation email |
| `node scripts/security-smoke-integration.js` | Passed, two groups | Authentication failures, participant/staff boundaries, event scope, live role changes, inactive accounts, password token invalidation, fee ownership, capacity race, deadlines and unverified-payment pass denial |
| `node scripts/gateway-security-integration.js` | Passed, 12 cases | Server-owned amounts, ownership, signatures, captured status, currency/order checks, replay idempotence, atomic pass/outbox issuance, fake SMTP receipt and pass delivery, required-document gating, withdrawn-registration capture reconciliation |

The gateway suite was run before the final reconciliation-notice routing change;
that change received its own scoped email regression above. The release test
runner should run the entire suite again against the final tree.

## Additional code review

- Scanner routes require an active staff account and enforce event assignment.
  HMAC-signed passes bind the attendee, registration and event. Verification
  also checks the stored current token, pass status and confirmed registration.
  Transactional check-in prevents admitting the same pass twice.
- Pass retrieval permits the owner or an administrator. A teammate cannot open
  another attendee's private entry QR.
- Gateway confirmation checks the server's order and retrieves current payment
  state from the provider. A client success callback alone is insufficient.
  Raw webhook signatures are checked before processing, and repeated settlement
  cannot create a second pass or payment receipt.
- A captured payment for a withdrawn/ineligible registration is preserved for
  human review instead of reviving entry. Refund completion records a real
  transfer reference and requires authorized staff confirmation; the application
  does not initiate automatic bank transfers.
- Notification and mail jobs created during registration/payment transactions
  share the transaction. Render-time authorization prevents obsolete invitations,
  revoked passes or removed staff access from exposing queued details.

## Practical limits and deployment responsibilities

These checks are focused regression tests and source review, not a penetration
test or a guarantee that all possible attacks are covered. Real Google OAuth,
Razorpay test/live accounts and SMTP inbox delivery have not been exercised;
each operator must configure and verify their own services before collecting
money or admitting attendees.

Treat an entry QR as a private bearer credential and check the attendee's
identity at the checkpoint. Before assigning staff roles, verify that the
intended person controls the account; a password signup alone does not prove
ownership of the entered email address.

SMTP acknowledgement does not guarantee inbox arrival. The durable outbox uses
retries, so a process failure after SMTP acceptance but before database recording
can produce a duplicate message. Monitoring, quotas, DNS authentication and
provider webhook/delivery feedback remain operational responsibilities.

Use separate random production JWT and QR-signing secrets, an HTTPS application
origin, restricted database access and a persistent worker. Configure reverse
proxy trust only for the actual infrastructure. Do not publish `.env` files,
uploads, database exports or personal test fixtures.
