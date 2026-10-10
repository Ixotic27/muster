# Frontend verification

The client uses React 18, Vite and the declarative React Router API. Browser tests run with Jest and jsdom. No payment credentials or mail accounts are needed for these tests.

```sh
npm ci
npm test
npm run build
npm audit
```

Verified on 10 October 2026 with Node 22.23.3:

- **85 tests across 13 suites passed.** Tests cover restricted staff sessions, password changes, participant roster downloads, refund consent, event deadlines, keyboard/touch year selection, scanner camera lifecycle, duplicate/wrong-event passes, and QR image decoding.
- Registration tests verify free registration, paid registration copy, minimum team size and server-enforced closure.
- Gateway tests verify server-created order amounts, server verification before success, duplicate callback protection, dismissal, disabled configuration and recovery after verification failure.
- The optimized production bundle builds successfully into `dist/`.
- `npm audit` and `npm audit --omit=dev` report **zero findings** for the installed lockfile at the time of verification.

The scoped `js-yaml` override removes an outdated development dependency used by Jest coverage configuration. A compatibility test exercises the actual coverage loader with YAML, an extended configuration and array fields.

Gateway tests use a mocked checkout SDK and API. They do not prove bank settlement, live Razorpay delivery or email arrival. Those require the deployment owner’s test credentials, webhook configuration and SMTP provider. Dependency audit results may change as new advisories are published.

For local visual review, run the backend separately and configure `REACT_APP_BACKEND_URL` in `.env.local` if it uses a different port. Start the frontend with `npm run dev`; it listens on `http://127.0.0.1:4120`. Review the site on both desktop and mobile and use synthetic accounts in an isolated database.
