# Backend verification — 10 October 2026

The release gate was run with `cd backend && npm test` after the final payment and password-email changes. All ten suites passed. Tests use disposable loopback MongoDB replica sets, synthetic users, real local HTTP requests where applicable, and injected gateway/SMTP providers. They do not use project credentials or contact real payment or email services.

| Suite | What was verified |
| --- | --- |
| Template workflow | Fifteen workflow groups: signup/login, roles, assigned events, solo/team registration, invite acceptance/resend, private proof uploads, approval, required documents, personal passes, scanner denial/replay/concurrency, refunds, capacity races, pass recovery, and SMTP retries/policy pauses. |
| Gateway security | Fourteen cases: fee conversion, configuration, ownership, signatures, captured status, amount/currency/order matching, atomic receipt/pass/email creation, webhook/callback replay, required documents, late capture review, rejected manual proof switching to gateway, and manual/gateway capture races. |
| Participant roster | Team grouping, paid/unpaid/submitted/attended filters, academic fields, exact CSV export, formula escaping, scoped access, live attendance and registration closure/capacity/deadline controls. |
| Authorization smoke | Missing/invalid credentials, participant denial, event assignment boundaries, live role/inactive checks, session invalidation, server-owned prices and last-slot reservation races. |
| Private upload | Proof/documents remain private even with image-provider configuration; owner/admin access, unrelated-user denial, size/type validation and deletion behavior. |
| Socket authorization | Own notification/team rooms, restricted/invalid tokens, current-account rechecks, password-change invalidation and inactive-account removal. |
| OAuth security | Browser-bound signed state, expiry/tampering/purpose restrictions, verified Google email, disabled-account protection and role-update operator conflicts. |
| Email worker | Ten cases: disabled-mail behavior, secure SMTP configuration, reset freshness, signup success email, atomic outbox rollback, secret-free password-change alerts/session invalidation, lease recovery, expiry redaction, quota/backoff/policy pause and protected scheduled endpoint. |
| Manual payment policy | Payment deadline, event start, unavailable events and disabled manual payment. |
| Reconciliation email | Additional captured-payment notices reach only currently authorized event staff. |

Additional checks:

- `node --check` passed for all 103 backend JavaScript files.
- `npm audit` reported zero vulnerabilities across production and development dependencies. Development uses Node's built-in `--watch` instead of the vulnerable watcher dependency chain.
- An independent child-agent payment review reproduced the rejected-manual-proof issue; the fix clears only the current registration reference and preserves the rejected receipt. Its regression test is part of the gateway suite.
- The browser-fixture API binds to loopback only and disables actual email/payment delivery. Fixtures are synthetic and stored in a disposable database.

Razorpay integration was verified with a deterministic fake provider, and email transport with injected fake SMTP acceptance. Actual provider credentials, sandbox checkout, deliverability, DNS and inbox placement must be verified by each adopter before production use. No automatic bank refunds are issued by this template; organizers record/reconcile refund decisions.
