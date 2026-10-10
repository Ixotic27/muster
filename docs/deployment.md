# Deploy your own event portal

Deploy this template as your own frontend and API, with your own MongoDB replica
set and provider accounts. Nothing is linked to the original event's hosting,
database, GitHub workflows, cloud assets or email accounts.

## Configuration checklist

Collect the following backend values before deploying. Use the host's encrypted
environment settings; never commit the resulting environment file.

| Area | Values |
| --- | --- |
| Database | `MONGODB_URI` for a replica set with a scoped application user. |
| Signing | Independent cryptographically random `JWT_SECRET` and `QR_SIGN_SECRET` of at least 32 characters. |
| Web origins | `FRONTEND_URL` and exact comma-separated `FRONTEND_ORIGINS`. |
| Branding | `BRAND_NAME`, sender display name and optional `EVENT_TIMEZONE`. |
| Gateway | Razorpay public key ID, backend API secret, separate webhook secret and explicit test/live mode. |
| Email | SMTP host, TLS port, user/password, verified From and monitored Reply-To. |
| Worker | Strong `EMAIL_WORKER_SECRET` if calling the HTTP worker endpoint. |
| Google, optional | Your own OAuth client ID/secret and backend callback URL. |
| Uploads, optional | Your own media storage credentials if you enable external storage. |

Google sign-in is optional. Create the OAuth application in your own project
and register the exact `GOOGLE_CALLBACK_URL`. Its browser origin must match the
origin used to start `/api/v1/auth/google`, because the callback validates a
short-lived HTTP-only state cookie before accepting the provider response.
For local development, use
`http://127.0.0.1:4120/api/v1/auth/google/callback`; the frontend development
server proxies that path to the API. For production with a same-origin `/api`
proxy, use `https://events.example.com/api/v1/auth/google/callback`. If using a
separate API origin, begin and complete OAuth on that API origin; do not switch
hosts between the two steps. Do not copy another application's OAuth identifiers.

## Frontend and API

Build the frontend with `npm run build` and publish its generated static output.
Configure single-page routing so paths such as `/dashboard` and
`/invitations/:id` serve the frontend entry page. The API runs separately using
`npm start --prefix backend`; route `/api` to it or configure the frontend's
public API URL during build.

Production requires HTTPS. Keep API and frontend behind the same site when
possible; cookie authentication, uploads and real-time updates must be tested
with the actual deployment origin. Allow only your exact frontend origins.

Configure `TRUST_PROXY_HOPS` to your actual reverse-proxy topology, rather than
blindly trusting user-supplied forwarded headers. Leave it at zero for direct
hosting. Webhook signature verification requires the raw request bytes; a proxy
must not rewrite the gateway payload before it reaches the API.

## Run the email worker independently

Keep the continuous CLI worker running alongside the API:

```bash
npm run worker --prefix backend
```

For a scheduler that starts a fresh process for each run, use
`npm run worker:once --prefix backend` instead. Or have a trusted scheduler call `POST /api/v1/jobs/email` using
`Authorization: Bearer <EMAIL_WORKER_SECRET>`. Do not place the worker secret
in browser code or an ordinary public cron URL. Choose an interval and worker
budget appropriate to your provider's permitted send rate. Overlapping runs use
a lease, and retries remain in the database.

## Before accepting participants

Create your own administrator, configure events and assigned staff, check
desktop/mobile screens, and run one complete test-mode registration. Verify
each teammate's email/pass, wrong-event scanner rejection, duplicate scans,
event closure, participant exports, withdrawal and refund review. Inspect your
mail provider's delivery logs and gateway webhook logs.

Private files and participant exports require an appropriate retention policy.
Back up the database, monitor failed jobs, and reconcile late or ambiguous
gateway captures. This repository is a starting point, not a managed payment
or email-delivery service.
