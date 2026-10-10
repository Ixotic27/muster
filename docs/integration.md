# Connect your own client to Muster

Muster's Express backend runs independently of the reference frontend. Its
JSON API is mounted at `/api/v1`; your UI presents the API results, collects
consent and provides the account/event screens you need.

## Authentication

`POST /api/v1/auth/signup` accepts `name`, `email` and `password`. Organization,
course, specialization, section, year, phone and participant ID are optional
profile fields. Signup grants the participant role, never a privileged role.

`POST /api/v1/auth/login` accepts `email` and `password`. Its successful response
includes `{ success, token, user, needsProfile }` and sets an HTTP-only session
cookie. Browser clients can use the cookie with `credentials: 'include'`;
non-browser clients can use `Authorization: Bearer <token>`. Protected requests
recheck the current account, role and password-change state.

```js
// Run in your client after collecting the user's credentials.
const api = '/api/v1'; // Same-origin reverse proxy to Muster.
const login = await fetch(`${api}/auth/login`, {
  method: 'POST',
  credentials: 'include',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ email, password }),
});
const result = await login.json();
if (!login.ok) throw new Error(result.message || 'Login failed');

const response = await fetch(`${api}/auth/me`, { credentials: 'include' });
if (!response.ok) throw new Error('Sign-in is required');
const { user } = await response.json();
```

Prefer HTTP-only browser sessions; signing secrets never belong in the browser.
Tokens expire (15 minutes by default); this starter has no refresh-token
service. Ask users to sign in again when a session expires. Logout clears the
cookie. A separately copied bearer token is not globally revoked by logout;
password changes and deactivation invalidate it on subsequent protected requests.

## Origins and links

Set `FRONTEND_ORIGINS` to exact allowed client origins and `FRONTEND_URL` to your
client URL. Prefer a same-origin `/api` reverse proxy for browser sessions.
Cookies use `SameSite=Lax`; an unrelated cross-site client needs an appropriate
reviewed session design. CORS alone does not make those cookies usable.

The current backend creates email links for `/dashboard`, `/invitations/:id`,
password reset and staff review screens. Implement these paths in your client,
or adapt the notification/auth link-building calls. `FRONTEND_URL` changes the
host, not those route contracts. Keep invitation/reset tokens and entry QR
payloads private.

For optional Google sign-in, begin and complete OAuth on the same browser
origin so the signed state cookie survives. The callback URL and successful
client redirect are configurable; see [deployment](deployment.md).

## Reuse the business workflows

- Read public events through `/events`; the server determines availability.
- Use team/invitation endpoints for explicit membership acceptance. A team code
  or an email alone must not silently add a person.
- Create registrations through the API. Fees, eligibility and capacity are
  server decisions; do not supply a client-controlled amount as authority.
- Use the API-created Razorpay order in hosted Checkout, then call server
  verification. Signed webhooks also settle captures if the browser closes.
- Display each person's own pass. Use the authorized scanner endpoint for
  attendance; local browser state is not a check-in record.
- Build staff views from scoped manager/admin endpoints and roster exports.
  An arbitrary event ID does not grant an organizer access.

The [low-level design](architecture/low-level-design.md) lists route groups and
critical sequences. The [reference API wrapper](../frontend/src/utils/api.jsx)
and workflow pages demonstrate those contracts; they are not backend requirements.

## What you configure and own

Provide your database, signing secrets, provider accounts, allowed origins and
client link destinations. Run the email worker independently and monitor failed
jobs. Configure events and staff after bootstrap. Use empty data or your own
migration, never another event's participant data or existing QR credentials.

This starter currently supports INR/Razorpay, optional manual proof review,
fixed registration-fee snapshots and manually processed refunds. Add other
currencies, providers or pricing rules with server validation and regression
tests; those adapters are not already implemented.
