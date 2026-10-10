# Muster — high-level design

**Scope:** the reusable backend implemented in this repository. The Express API and its email worker are the primary product; the included React application is a reference client for integration checks and workflow demonstration. This describes the current system, not a proposed microservice platform. Read the [low-level design](low-level-design.md) for request sequences and failure handling, and the [data model](data-model.md) for storage constraints.

## 1. System purpose and actors

Muster manages the journey from an event announcement to an individual participant entering that event. Team registration is owned by the team leader; attendance is recorded separately for each person.

| Actor | Responsibility | Access boundary |
|---|---|---|
| Visitor | Browse published event information; create an account | Public API only |
| Participant (`student`) | Form or join teams, register, pay, upload required documents, view personal passes, request withdrawal | Own registrations and accepted team membership |
| Event manager (`organizer`) | Review event rosters, control registration availability, process event-scoped refund review, scan entry passes | Assigned events only |
| Administrator (`admin`) | Manage catalog, manual payment/document review, participants, refunds and email operations | Global staff routes; role changes have additional controller checks |
| Super administrator (`super_admin`) | Highest application administration role | Global staff access; protected elevated role management |
| Payment provider | Create checkout orders; report and expose captured payments | Signed webhook and server-to-server API |
| SMTP provider | Accept transactional HTML/plaintext messages | Server-side SMTP credentials |

The UI is a convenience layer. Authorization is enforced by the API using the current account record. Hiding a navigation item does not grant or deny access by itself.

## 2. Context and container views

The [system-context diagram](../diagrams/system-context.svg) shows people and external systems. The separate [container diagram](../diagrams/system-design.svg) shows deployable applications and data storage. These follow the scope distinction used by [C4 system context](https://c4model.com/diagrams/system-context) and [C4 container diagrams](https://c4model.com/diagrams/container).

| Container / external system | Technology | Responsibility | Communication |
|---|---|---|---|
| Reference browser client | React, React Router, Vite build | Demonstrate public pages, participant/staff workflows, checkout and QR decoding; replaceable by an adopter's frontend | HTTPS JSON API; authenticated Socket.IO where available |
| Backend API | Node.js, Express, Mongoose | Authentication, authorization, business rules, transactional writes and integrations | MongoDB; Razorpay HTTPS API; best-effort post-commit email dispatch |
| Email worker | Node.js, shared backend services | Drain durable email jobs, recover missing passes, prepare event reminders | Same MongoDB; SMTP |
| Database | MongoDB replica set / transaction-capable managed cluster | Application documents, uploaded proof bytes, audit records and durable outbox | Mongoose driver |
| Razorpay | External payment service | Checkout orders and authoritative payment state | Browser checkout; server API; signed webhook |
| SMTP delivery service | Configurable external provider | Deliver messages accepted from the worker | SMTP with configured authentication/TLS |
| Google identity | Optional external OAuth provider | Authenticate a verified email identity | Browser redirects; server OAuth exchange |

The API is a **modular monolith** and can be deployed independently of the reference client. Payment, registration, pass and notification services execute within one application and can share a MongoDB transaction. The worker is a separate execution process using the same code and database, not a separate ownership boundary or message broker. Redis, Kafka, Kubernetes and a separate attendance service are not required by the implementation.

Uploaded payment proofs and NOC documents use `StoredFile` records in MongoDB. The current implementation does not require an object-storage bucket. Browser assets are delivered with the frontend build; no application CDN account is required.

## 3. Backend component responsibilities

| Component | What it owns | Implementation anchor |
|---|---|---|
| Identity and access | Password sign-in/reset, optional OAuth, active-account checks, live role/event scope | [auth middleware](../../backend/src/middleware/auth.middleware.js), [role middleware](../../backend/src/middleware/role.middleware.js), [auth controller](../../backend/src/controllers/auth.controller.js) |
| Event catalog and availability | Catalog, fees, team bounds, deadlines, capacity and staff assignments | [event controller](../../backend/src/controllers/event.controller.js), [availability policy](../../backend/src/utils/eventAvailability.js) |
| Teams and invitations | Embedded roster, leader ownership, join code, email invitation consent | [team controller](../../backend/src/controllers/team.controller.js), [invitation controller](../../backend/src/controllers/invitation.controller.js) |
| Registration | Eligibility snapshot, capacity reservation and team lock | [registration controller](../../backend/src/controllers/registration.controller.js) |
| Payments | Manual proof workflow; Razorpay order, signature and captured-payment reconciliation | [payment controller](../../backend/src/controllers/payment.controller.js), [gateway controller](../../backend/src/controllers/gateway.controller.js), [gateway service](../../backend/src/services/payment-gateway.service.js) |
| Approval and passes | Required-document review; individual signed QR generation | [NOC controller](../../backend/src/controllers/noc.controller.js), [pass service](../../backend/src/services/pass.service.js) |
| Attendance | Checkpoint scope, QR authenticity and single-use entry recording | [scanner controller](../../backend/src/controllers/scanner.controller.js) |
| Withdrawal and refunds | Participant withdrawal, staff review, transfer-reference recording, archival | [refund service](../../backend/src/services/refund.service.js) |
| Participant reporting | Team-first roster, participant filters and CSV export | [roster service](../../backend/src/services/participant-roster.service.js) |
| Notifications and email | Durable messages, personalized HTML/plaintext, delivery eligibility, leases and retries | [notification service](../../backend/src/services/notification.service.js), [email worker](../../backend/src/services/email-worker.service.js) |

## 4. End-to-end behavior

1. A participant signs up with a normal email address. Academic details are optional template fields.
2. For a team event, the leader forms an eligible team and members accept invitations. An invitation can target an email address before that person registers.
3. Registering reserves **one event slot per registration**, locks the team, and snapshots the fee and team bounds. A team consumes one slot, not one slot per member.
4. A free event proceeds directly to confirmation or document review. A paid event waits for payment. Gateway checkout confirms only after server verification of a captured payment; manual proof requires staff approval.
5. Required documents can keep a paid registration in `pending_noc`. Each eligible attendee receives a separate pass after confirmation.
6. Core registration/payment/pass workflows commit email jobs alongside their state changes. Delivery attempts start after commit in production; a running worker handles deferred jobs and reminders. Account-recovery request preparation has a narrower atomicity guarantee, detailed in the low-level design.
7. Staff select the relevant checkpoint and scan a participant's QR. The API validates live eligibility and records that individual entry exactly once.
8. Withdrawal disables entry. Paid/submitted-payment registrations enter a human refund-review workflow. Marking a refund complete records a transfer already made by staff; it does not initiate a bank or gateway refund.

## 5. Connecting another frontend

An adopter's client consumes the same API contracts as the demo. Configure its API base URL, the backend's allowed origins and public `FRONTEND_URL`; use credentialed requests if retaining browser cookies. A bearer-token client must manage its own secure token handling and expiration. CORS and HttpOnly-cookie behavior must be tested for the actual frontend/backend domain arrangement rather than assumed universal.

Email links currently lead to application routes such as `/dashboard`, `/dashboard/passes`, invitation and password-reset pages. A replacement client must implement those routes or adapt the link-building contract. It must handle pending payment/document states, payment-review-required responses and QR rejection codes. The API does not return an arbitrary third-party client's navigation structure.

Razorpay checkout uses the server-returned public key and order; pass the checkout fields back to the verification endpoint and show the **API's** result. QR decoding can be replaced on the client, but the decoded token must still be sent to the scoped scanner API. The included frontend illustrates both adapters and is useful for local testing without being mandatory for a backend-only deployment.

## 6. Deployment, trust and operational boundaries

- Deploy the API and a continuously running worker against the same database. The included static reference frontend is optional: configure the public frontend URL and allowed origins for whichever client the adopter provides. An authenticated worker HTTP endpoint or `worker:once` can be used by a scheduler instead. A worker that is never invoked cannot drain queued jobs.
- MongoDB must support transactions. Production connection/configuration is supplied through environment variables. Development defaults and isolated in-memory test fixtures are not production data.
- Browser checkout is not proof of payment. The API owns the payable amount and verifies Razorpay signatures and provider state. Webhooks use the unmodified raw request body.
- Payment and SMTP secrets stay server-side. QR signatures use a dedicated secret; QR payloads contain identifiers rather than personal profile fields.
- HTTPS and an explicitly configured frontend origin are expected for production. The default proxy-trust setting is zero; it must match the actual deployment proxy chain.
- HTTP cookie authentication uses an HttpOnly, production-Secure, SameSite=Lax cookie. The system also accepts bearer tokens. There is no refresh-token service or dedicated CSRF-token protocol in the current template; deployments must keep the supported origin/cookie arrangement and review cross-origin requirements before changing it.
- Staff routes reload live account status/role; scanning and manager routes also check event assignment. Critical refund review rechecks reviewer scope inside its transaction.
- Socket.IO is an auxiliary update channel in the long-running Node server. Persisted API state is authoritative. Transactional notifications are not guaranteed to broadcast immediately, and multiple API replicas have no distributed Socket.IO adapter configured.

## 7. Reliability and explicit limits

MongoDB transactions bind registration, payment receipt, pass and outbox changes where those workflows require it. Unique indexes and conditional updates prevent duplicate business records; an HTTP retry does not create a second personal pass or attendance entry.

SMTP delivery is **at least once**, not exactly once. A crash after the provider accepts a message but before `sent` is saved can result in a retry. `sent` means SMTP acceptance, not confirmed inbox placement. Sender quotas, transient failures and recipient policies mean the template cannot promise inbox delivery within one minute.

A provider timeout during order creation can leave the remote result uncertain. The local reservation is retained for reconciliation, rather than automatically creating another payable order. A late capture after withdrawal is recorded for review without restoring entry rights.

Registration lists and statistics come from current database queries, not an analytics warehouse. `Registration.checked_in` means at least one pass on that registration was used; per-person attendance is the pass's `checkInStatus`.

Automated provider refunds, certificate issuance, multi-tenant organization isolation, distributed socket fan-out and broker-backed workers are **not implemented features**. They are possible extension points, not dependencies shown as deployed services.

## 8. Reading map

- [Low-level design](low-level-design.md): API contracts, sequence diagrams, state transitions and consistency rules.
- [Data model](data-model.md): document/reference semantics, key constraints and ER interpretation.
- [Deployment guide](../deployment.md), [payment setup](../payments.md), [email setup](../email-setup.md).
