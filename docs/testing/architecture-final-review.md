# Architecture final review

Review date: 2026-10-10. Scope: the reusable backend in this repository and its three architecture Markdown documents. No backend code, original-project files, credentials or deployment settings were changed.

## Corrections

- The NOC upload contract identifies the registration owner/team leader and the multipart `document` field, matching `submitNoc`; an accepted teammate has read access to their registration but cannot upload on the leader's behalf.
- Password recovery documents the configured-email requirement, HTTP 503 when unavailable and the 30-minute reset lifetime.
- Gateway reconciliation describes the actual repeat response: current registration status, existing receipt ID and zero newly issued passes. The initial `reviewRequired` flag is not repeated. Additional captures retain an existing selected payment and registration state; a capture without a selected receipt moves to refund review.
- The registration state diagram includes cancellation of a free entry awaiting NOC, and the payment sequence includes event/team ineligibility. Duplicate scanning commits its event serialization write without changing attendance.
- The payment component links the gateway controller as well as the manual-payment controller and gateway service. Data-model prose distinguishes optional selected-receipt pointers from unique one-to-one constraints.

## Implementation review

| Area | Evidence | Outcome |
|---|---|---|
| API paths and request ownership | `backend/src/routes/{auth,team,registration,gateway,payment,noc,scanner,event,jobs}.routes.js`, corresponding controllers, and `app.js` | Described paths, role/event scope, upload fields, raw webhook mount and worker authentication match source |
| Payment, refund and entry | `payment-gateway.service.js`, `refund.service.js`, `pass.service.js`, `qr.service.js`, `scanner.controller.js` | Server-authoritative captured payments, transaction boundaries, one personal pass per attendee, independent attendance and external manual refund transfers match source |
| Email durability | `notification.service.js`, `email-request-context.service.js`, `email-dispatch.service.js`, `email-worker.service.js`, `auth.controller.js`, `utils/helpers.js` | Transactional business outbox, bounded post-commit dispatch, leases/retries, at-least-once SMTP and the narrower reset-request atomicity guarantee match source |
| Document relationships | All backend model schemas | Embedded team members, receipt history versus selected receipt, optional pre-account invite recipient and application-managed references accurately described |

## Executed verification

1. `node .local/diagram-renderer/check-mermaid.cjs` — exit 0 before and after corrections. Output: three `sequence PASS` entries, one `stateDiagram PASS` entry, `Parsed 4 Mermaid blocks.` The reported earlier semicolon failure did not reproduce in the review's starting files; message text in the final Mermaid blocks contains no semicolons.
2. Loaded the current Mongoose schemas without connecting to a database and compared the exact documented enum lists — all nine lists passed: Event status, Team status, TeamInvite status, GatewayOrder status, Payment status, Registration NOC status, Pass status, Pass check-in status and EmailJob status.
3. Counted source `ref` declarations — 42 references across 11 model files, matching the complete data-model inventory. Reused embedded member declarations are counted once, as documented.
4. Resolved relative Markdown links in the three architecture files — all 43 local links exist.

These are documentation consistency and Mermaid parser checks. This review did not re-run backend integration suites, render SVGs or perform browser/mobile checks; no application behavior or deployed pages changed. Diagram layout and application workflow verification belong to the separately recorded implementation and UI checks.
