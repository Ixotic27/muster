# Website workflow

## Discover, register, pay, attend

The public pages explain the event, schedule, venue, fee and participation
rules. An attendee signs up with their normal email address; university-domain
email is not required. Organization and academic fields are optional profile
information rather than an institution-specific barrier to entry.

For a solo event, the attendee creates a registration directly. For a team
event, the leader creates a team and invites members. An email invitation can
reach someone who has not signed up yet. They sign up using the invited address
and explicitly accept the invitation. Team codes are another way to join;
server rules prevent invalid membership and enforce the event's team limits.

Creating a registration reserves a place according to the event's capacity
policy. It does not imply payment or permission to enter. The leader sees the
stored fee and completes the configured payment method. Razorpay payments are
confirmed only after the server verifies the captured transaction. Manual proof
waits for staff review. If the event requires a document, that review also needs
to complete before issuing passes.

## Codes and personal passes

Team join codes are randomly generated and checked for uniqueness. Invitation
links use random tokens; only a token hash is stored for validation. They must
be redeemed by the appropriate recipient before expiry, while the invitation
and team remain eligible. A code or link is not a payment receipt.

A registration has a human-readable registration reference. Each accepted
teammate receives a separate pass with a unique pass identifier and a signed
QR token. The QR is generated from that pass, rather than from the participant's
public profile or bank details. The scanner checks the token signature and the
current database record, including event scope and revocation, before recording
entry atomically. A duplicate scan reports the previous check-in.

## Email at each important step

Messages explain why the recipient is receiving them, identify the relevant
event/team/registration, and give a clear next step. They include a plain-text
alternative. Individual pass emails contain that person's event details and
private QR; one shared team QR is not mailed to everyone.

Account creation, password changes/reset, invitations and responses,
registration creation, payment updates, document decisions, pass issuance,
withdrawals/refund decisions and upcoming-event reminders use the same durable
delivery system. Business updates and their email jobs commit together. Sending
occurs afterwards; retries use deduplication keys and recheck access before
delivery. Provider outages do not erase a successful registration.

## Staff permissions

| Role | Typical access |
| --- | --- |
| Participant (`student` internally) | Own profile, team actions, registrations, passes and withdrawal requests. |
| Event manager (`organizer`) | Assigned-event participant lists, operational reviews and scanner access. |
| Administrator | Cross-event operations, event management, participant review and permitted staff assignments. |
| Super administrator | Administrator capabilities plus privileged role management. |

UI visibility follows the role, but server authorization remains decisive.
Selecting another event identifier must never grant an event manager access to
unassigned participants, files or passes.

Staff lists support team expansion and registered/unpaid, paid and attended
views. Attendance is read from personal pass check-in records, so scanning one
teammate does not silently mark the whole team attended. CSV export respects the
same permissions and current filters as the visible list.

## Closing registration and withdrawing

Event status, registration deadline and remaining capacity determine whether
new registrations are accepted. Staff can close registration early; attendees
see the closure reason instead of a misleading registration action.

An unpaid forming team or eligible registration can be withdrawn. Paid
registrations use a refund request so the organizers can account for money
already received. The request appears in the appropriate staff queue and sends
notifications. Completing a refund requires recorded evidence of the actual
transfer; the template performs no automatic bank transfer. Passes and closed
teams cannot continue granting entry after withdrawal.
