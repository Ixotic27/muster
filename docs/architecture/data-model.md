# Muster — data model and ER interpretation

This is the **implemented MongoDB document model** of the reusable backend. The [ER diagram](../diagrams/entity-relationship.svg) uses conventional Crow's Foot endpoint notation to explain relationships. It is not a claim that MongoDB enforces SQL foreign keys or that embedded arrays are separate collections.

## 1. Notation and storage semantics

| Notation / term | Interpretation |
|---|---|
| `_id` / PK | Document identity. ObjectId unless a model explicitly uses a String key |
| UQ | Unique index; a compound UQ applies to the whole tuple. This is sometimes called UK (unique key) |
| FK (logical reference) | Application-managed reference (`ref` or explicitly interpreted ID), also described as REF in prose. The ER label follows conventional FK notation, but MongoDB does not enforce a relational foreign key or automatic cascade |
| `1`, `0..1`, `0..*`, `1..*` | Exactly one, optional one, optional many, at least one related record |
| Embedded object/array | Nested within its parent document, not a separately persisted entity |
| Dashed association, where used | Non-identifying relation: child has its own `_id`; it does **not** mean asynchronous delivery |

Schema-required references constrain the local field's presence, not the existence of the target document. Controller/service checks provide ownership, event alignment and eligibility. The model retains historical registrations, receipts and withdrawn teams; deletion is generally state change/archival rather than a cascading physical delete.

Each normal Mongoose model has an implicit `_id`; most use timestamps `createdAt` and `updatedAt`. `WorkerLease` does not enable the timestamps option. Refer to [model source](../../backend/src/models) when extending persistence; the tables below select important fields rather than pretending to reproduce every attribute.

## 2. Core aggregate documents

| Document | Selected stored fields | Invariant / ownership |
|---|---|---|
| `User` | email, name, passwordHash, role, isActive, assignedEvents[], optional academic profile, password/reset metadata | Normalized email is unique; roles are `student/organizer/admin/super_admin`; profile fields are optional |
| `Event` | slug, category, participationType, min/maxTeamSize, feeInr, dates/deadlines, venue, status, maxSlots, filledSlots, requiresNOC | Catalog definition. Slots count registrations; fee is snapshotted at registration |
| `Team` | eventId, leaderId, teamName, joinCode, members[], status, rosterVersion, closedRoster[], mergedIntoTeamId? | Members are embedded snapshots plus a User reference; accepted roster is locked on registration |
| `TeamInvite` | teamId, eventId, invitedBy, invitedUser?, invitedEmail?, tokenHash, expiresAt, status | Can invite an email before a User exists; recipient must explicitly respond |
| `Registration` | regId, eventId, leaderId, teamId?, feeSnapshotInr, team-size snapshots, paymentId?, status, nocStatus, refund metadata | One owner for solo or team entry. Stores one selected current payment reference, not the entire receipt history |
| `GatewayOrder` | registrationId, eventId, payerId, providerOrderId?, amountPaise, keyId, status, paymentId? | One local reserved Razorpay order per registration; provider order ID stored after remote creation |
| `Payment` | registrationId, eventId, payerId, provider, gatewayOrderId?, providerPaymentId?, utr?, amountInr, status, review fields | Separate receipt history; manual proof fields are conditionally required |
| `Pass` | passId, registrationId, eventId, userId, token, qrDataUrl, status, checkInStatus, scannedBy?, timestamps | One personal pass per registration/user; individual attendance lives here |

`registrationMode` and `billingMode` accept only the current `legacy` value. They are compatibility fields, not support for multiple billing strategies. In this template the event's `feeInr` is charged **once per registration**, not automatically multiplied by team members.

### Embedded roster shape

```text
Team
 ├─ members[]       embedded member records; no member _id
 │   ├─ userId      FK (logical reference) to User; required
 │   ├─ nameSnapshot, studentIdSnapshot?, emailSnapshot?
 │   ├─ status      accepted | removed
 │   └─ joinedAt
 └─ closedRoster[]  optional embedded snapshot using the same shape
```

There is no `TeamMember` collection. An ER diagram may expand this embedded structure for clarity, but it must mark it as embedded. A user's `assignedEvents[]` is also an array of references, not a persisted `EventStaffAssignment` join collection. The application enforces team membership rules; the `(members.userId,eventId)` index is **not unique** and does not itself enforce one active team per event.

## 3. Relationship contracts and cardinality

Each row reads left to right. Optionality refers to the stored field/history, with any narrower service rule explained alongside it.

| Relationship | Cardinality | Notes |
|---|---|---|
| Event → Team | `1 → 0..*` | Team.eventId required |
| User → led Team | `1 → 0..*` | Team.leaderId required; leader is also an accepted roster member in normal application creation |
| Destination Team → predecessor Teams | `0..1 → 0..*` | A source Team.mergedIntoTeamId optionally references a destination Team; retained compatibility/history field, not an implemented generic team-merge API |
| User ↔ Event assignment | `0..* ↔ 0..*` | User.assignedEvents[]; assigned-event scope for organizers |
| Team → embedded member | `1 → 0..*` schema | Application creation includes leader; event-specific minimum applies at registration |
| User → embedded member reference | `1 → 0..*` | Multiple historical/member-array occurrences possible |
| Team / Event → TeamInvite | `1 → 0..*` | Each invite has both required refs; consistency is application-enforced |
| User → sent TeamInvite | `1 → 0..*` | invitedBy required |
| User → received TeamInvite | `0..1 → 0..*` | invitedUser is optional on each invite; unregistered email invitation has no User ref yet |
| Event / User owner → Registration | `1 → 0..*` | Required eventId/leaderId; unique pair prevents re-registration even after cancellation |
| User refund reviewer → Registration | `0..1 → 0..*` | Registration.refundReviewedBy optional until staff record a review |
| Team → Registration | `0..1` registration per team | Registration.teamId optional for solo; unique event/team pair plus event alignment provides application one-entry rule |
| Registration → Payment history | `1 → 0..*` | Every Payment.registrationId required; multiple manual attempts or reconciliation receipts may remain |
| Registration → selected Payment | `1 → 0..1` | Registration.paymentId is a distinct role-labeled association, not a claim that history is one-to-one |
| Registration → GatewayOrder | `1 → 0..1` | GatewayOrder.registrationId unique and required |
| GatewayOrder → related Payment receipt | `0..1 → 0..*` schema | Payment.gatewayOrderId optional; settlement service only accepts one captured ID for a settled order |
| GatewayOrder → selected Payment | `1 → 0..1` | GatewayOrder.paymentId records its settled receipt |
| Event / User payer → Payment | `1 → 0..*` | Required refs, preserved for ownership/history |
| User payment reviewer → Payment | `0..1 → 0..*` | Payment.reviewedBy optional; automated gateway verification need not assign a human reviewer |
| Registration → Pass | `1 → 0..*` | Passes await payment/NOC; confirmed team normally has one per accepted attendee |
| Event / User attendee → Pass | `1 → 0..*` | Required refs; unique registration/user pair |
| User scanner → Pass | `0..1 → 0..*` | scannedBy only set on entry; attendees and staff are different role-labeled User associations |

The unique team-registration index contains `(eventId,teamId)`, rather than `teamId` alone. The one-registration-per-team business rule depends on enforcing that a team belongs to the same event. An ER drawing shows the intended consistent application model; the compound index and validation details above explain its actual implementation.

The selected-receipt pointers `Registration.paymentId` and `GatewayOrder.paymentId` are optional scalar references without unique indexes on those fields. Each source selects at most one receipt, while correct ownership and agreement with the receipt's registration/order references are service invariants. The diagram's selected-payment role must not be read as a database-enforced one-to-one relationship or as a replacement for receipt history.

### Complete declared-reference inventory

The core and supporting drawings deliberately omit some contextual edges to remain legible. This inventory covers **all 42 `ref` declarations across 11 model files**, including fields not drawn as connecting lines. The embedded member schema is reused in both `members[]` and `closedRoster[]`; its one declaration therefore corresponds to two nested persisted paths. No Event/AppConfig/EmailSender/WorkerLease reference fields are omitted: those models have no declared `ref` fields.

| Model | Required reference fields | Optional reference fields / reference arrays |
|---|---|---|
| User | None | `assignedEvents[] → Event` |
| Team | `eventId → Event`; `leaderId → User`; embedded member `userId → User` | `mergedIntoTeamId → Team`; member schema is embedded in `members[]` and optional `closedRoster[]` |
| TeamInvite | `teamId → Team`; `eventId → Event`; `invitedBy → User` | `invitedUser → User` |
| Registration | `eventId → Event`; `leaderId → User` | `teamId → Team`; `paymentId → Payment`; `refundReviewedBy → User` |
| GatewayOrder | `registrationId → Registration`; `eventId → Event`; `payerId → User` | `paymentId → Payment` |
| Payment | `registrationId → Registration`; `eventId → Event`; `payerId → User` | `gatewayOrderId → GatewayOrder`; `reviewedBy → User` |
| Pass | `registrationId → Registration`; `eventId → Event`; `userId → User` | `scannedBy → User` |
| Notification | `userId → User` | `passId → Pass`; `registrationId → Registration`; `eventId → Event`; `teamId → Team` |
| EmailJob | None | `notificationId → Notification`; `inviteId → TeamInvite`; `passId → Pass`; `registrationId → Registration`; `eventId → Event`; `teamId → Team`; `recipientId → User`; `staffActivationUserId → User` |
| StoredFile | `ownerId → User` | None |
| AdminAction | `actorId → User` | No additional declared reference; `targetId` is polymorphic application data |

Each optional scalar reference has `0..1` target per source document; target-side cardinality is `0..*` unless a specific unique constraint narrows it. Required scalar references have exactly one target in the consistent application model. The `assignedEvents[]` array and reused embedded rosters are collection-valued associations, not scalar foreign keys. `staffActivationUserId` is retained schema compatibility metadata; it does not imply a separate activation subsystem is deployed.

## 4. Supporting documents

| Document | References and important fields | Storage meaning |
|---|---|---|
| `Notification` | required userId; optional passId, registrationId, eventId, teamId; audience, readAt, emailStatus, dedupeKey | In-app notification with delivery summary |
| `EmailJob` | optional notificationId, inviteId, passId, registrationId, eventId, teamId, recipientId, staffActivationUserId; to, subject, kind, dedupeKey, status, attempts, leaseUntil | Durable transactional outbox. Raw secret-bearing text/link excluded from default selects and cleared after send/cancel |
| `EmailSender` | String `_id`; nextAvailableAt, reservations[] (embedded dates), paused, lastError | Sender pacing/quota state. No User foreign key |
| `WorkerLease` | String `_id`; owner, until, lastStartedAt, lastFinishedAt, lastResult (embedded) | Global worker coordination; not a participant/job ownership relation |
| `StoredFile` | required ownerId; purpose `payment/noc`; contentType, size, data Buffer | Private uploaded proof/document bytes; no separate object-storage entity |
| `AdminAction` | required actorId; action, targetType, targetId, details (Mixed), requestId | actorId references User; targetId is polymorphic application data, **not** a schema `ref` |
| `AppConfig` | unique key, value (Mixed), description, isPublic | Application settings; no mandatory parent association |

`Payment.storageKey` and `Registration.nocStorageKey` are string storage references interpreted by the upload/file service. They are not declared ObjectId foreign-key fields. A diagram must not invent a strict database relationship or cascade for them.

An EmailJob can refer to a notification, invitation or pass, but the schema does **not** enforce an exclusive-one-of relationship; several references may coexist. Direct account/reset email jobs need not have a Notification. Notification → EmailJob is not a physical one-to-one constraint: the notification-reference field is not unique. The service convention creates a stable `notification:<id>` dedupe key for its delivery job.

## 5. Key and index inventory

| Collection | Unique keys | Other selected indexes |
|---|---|---|
| User | email; googleSubject (sparse); studentId (sparse) | role; text search name/studentId/email |
| Event | slug | category; status; `(status,eventDate)` |
| Team | joinCode; `(teamName,eventId)` | eventId; leaderId; status; `(members.userId,eventId)` |
| TeamInvite | `(teamId,invitedEmail)` **partial** for pending + string email | teamId; eventId; invitedUser/email; status; expiresAt; `(teamId,invitedUser,status)` |
| Registration | regId; `(eventId,leaderId)`; `(eventId,teamId)` **partial** for ObjectId teamId | eventId; leaderId; teamId; status; nocStatus |
| GatewayOrder | registrationId; providerOrderId **partial** string; providerPaymentId **partial** string | No additional custom secondary index |
| Payment | utr **partial** string; providerPaymentId **partial** string | registrationId; eventId; payerId; status; `(registrationId,createdAt descending)` |
| Pass | passId; token; `(registrationId,userId)` | registrationId; eventId; userId; status; checkInStatus |
| EmailJob | dedupeKey | `(status,priority descending,availableAt)` |
| Notification | No unique business index | dedupeKey sparse **nonunique**; `(userId,readAt,createdAt descending)`; `(emailStatus,createdAt)` |
| StoredFile | Default `_id` only | ownerId |
| AdminAction | Default `_id` only | actorId; targetId |
| AppConfig | key | key also marked indexed |
| EmailSender / WorkerLease | String `_id` | No additional explicit index |

Sparse/partial indexes permit absent optional fields under their defined conditions. A sparse unique index does not permit arbitrary repeated stored empty strings: profile normalization should omit empty optional unique fields. Unique invite email indexing applies to **pending** invitations, so a historical accepted/rejected invitation does not block a new pending record.

`expiresAt` fields on invites/jobs/passes are checked by the application; these schemas do not declare TTL indexes. Expiry therefore does not automatically delete the records. Expired invites can retain their history, and pending jobs are cancelled by the worker.

## 6. Changes and read-model interpretation

- Use shared transaction sessions when creating receipts, personal passes and required outbox jobs. Do not infer success from the browser checkout callback.
- Preserve fee and team-size snapshots for existing registrations when the catalog changes. Changing an event fee must not silently rewrite a participant's recorded payable amount.
- Preserve receipt and withdrawal history. Cancelled registrations still satisfy unique event/leader and event/team keys.
- Keep participant attendance on Pass. Registration `checked_in` is an aggregate signal and does not mean every teammate attended.
- Keep normalized unique identifiers and collection indexes aligned with schema changes. Mongoose `unique` describes index creation, not a synchronous field validator.
- Do not interpret `Notification.dedupeKey` as database-enforced uniqueness. Durable email deduplication relies on the separate unique EmailJob key.

The [low-level design](low-level-design.md) explains conditional writes, locking and late-capture handling. The [high-level design](high-level-design.md) locates these documents within the API and worker boundaries.
