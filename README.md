# Muster

**A reusable backend for event registration, teams, payments and attendance.**

*Muster means to gather people.* The API handles accounts, team invitations,
registrations, verified payments, personal entry passes, staff access and email.

The backend is the product. The included React frontend is a **reference client
for demonstration and checking workflows**. Use it while learning the API,
replace it with your own website or app, or deploy just the backend. Your users
do not need this particular frontend.

This is a self-hosted application starter, rather than an npm SDK or hosted
service. No live participant records, personal photos, existing QR passes,
merchant credentials or private email accounts are included.

## What the backend handles

| Capability | Responsibility |
| --- | --- |
| Accounts and access | Email/password sessions, optional Google login, current account and role checks. |
| Events | Solo/team rules, fees, deadlines, capacity and registration closure. |
| Teams | Invitation acceptance, join codes and a roster tied to an event. |
| Registration | Eligibility, fee snapshots, required-document approval and withdrawals. |
| Payments | Razorpay orders, captured-payment verification, signed webhooks and optional manual proof review. |
| Entry passes | A separate signed QR for each accepted participant, with event-scoped check-in. |
| Staff operations | Assigned-event access, team-grouped participant lists, filters and CSV exports. |
| Notifications | Persistent HTML/plain-text email jobs, post-commit attempts and independent retries. |
| Refund review | Organizer review and recorded transfer evidence; bank refunds are processed manually. |

Payment receipts, confirmation, individual passes and notification jobs commit
transactionally. A browser checkout callback alone does not prove payment.
Repeated webhook/callback delivery cannot issue another receipt or pass.

## Start the backend

Use Node.js **22.12 or later**, npm and a MongoDB **replica set**. A standalone
MongoDB server cannot run the transactions used by this application.

```bash
git clone https://github.com/Ixotic27/muster.git
cd muster
npm ci --prefix backend
```

Copy `backend/.env.example` to `backend/.env`. Set your own database URL,
independent strong `JWT_SECRET` and `QR_SIGN_SECRET`, and your client origin.
Leave email and gateway credentials blank until configuring your own providers.

```bash
npm run dev:api
```

The default API base is `http://127.0.0.1:5000/api/v1`. You can use it from your
own client without installing or running `frontend/`. Read the
[client integration guide](docs/integration.md) for authentication, origins,
email-link destinations and a minimal request example.

There are no pre-created staff accounts or published passwords. Sign up using
an address you control, temporarily set `BOOTSTRAP_ADMIN_EMAIL` to that existing
account, then run:

```bash
npm run bootstrap:admin --prefix backend
```

Remove that variable afterwards. The command grants the initial super-admin
role without creating or sending a password. Staff can then be assigned to
specific events through the API or reference client.

Optional fictional sample events are created only when
`ALLOW_SAMPLE_SEED=true` in development:

```bash
npm run seed --prefix backend
```

## Use the reference client

The frontend demonstrates participant, administrator, event-manager and scanner
journeys. It is useful for checking API behavior and building your own UI;
its visual design is not a requirement for adopters.

```bash
npm ci --prefix frontend
# Copy frontend/.env.example to frontend/.env.
# Its development proxy must point to your API.
npm run dev:web
```

Open `http://127.0.0.1:4120`. The frontend never needs database credentials,
SMTP passwords or gateway secrets. [Workflow examples](docs/workflows.md)
explain the reference client's screens and permissions.

![Muster reference client](docs/showcase/home.png)

## Understand the design

The service is a **modular Express monolith**. MongoDB holds its business
records and durable email outbox. An independent Node worker retries mail using
the same delivery logic as the API. Razorpay and SMTP are external providers
configured by the adopter.

| View | Purpose |
| --- | --- |
| [High-level design](docs/architecture/high-level-design.md) | System context, deployable containers, boundaries and architectural choices. |
| [Low-level design](docs/architecture/low-level-design.md) | Modules, API contracts, sequences, states and failure handling. |
| [Data model](docs/architecture/data-model.md) | Collections, embedded data, reference cardinalities and actual indexes. |
| [Diagram index](docs/diagrams/README.md) | Crow's-foot ER and C4 views in editable draw.io, SVG and PNG. |

![Muster container architecture](docs/diagrams/system-design.svg)

## Configure your providers

| Setup | Guide |
| --- | --- |
| Razorpay test keys, capture settings and webhooks | [Payment setup](docs/payments.md) |
| SMTP sender, domain authentication and retry worker | [Email setup](docs/email-setup.md) |
| Responsive workflow messages | [HTML email previews](docs/email-previews/README.md) |
| API hosting, secrets, origins and operator checks | [Deployment](docs/deployment.md) |

Mail and payment collection remain disabled until configured. Test actual
checkout, webhook delivery and inbox arrival using your own test credentials
before accepting users. Specialized external-game integrations and another
institution's policies are outside this reusable backend.

## Check and contribute

```bash
npm test --prefix backend
npm test --prefix frontend -- --runInBand
npm run build
npm run test:privacy
npm run test:architecture
```

Tests use disposable databases and fake providers. The [test record](docs/testing/README.md)
states the checks and their limits. Read [SECURITY.md](SECURITY.md) before running
a public event. Contributions are welcome under the [ISC license](LICENSE).
