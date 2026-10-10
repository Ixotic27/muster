# Contributing

Fork the repository, create a focused branch, and follow the local setup in
README.md. Include a short explanation of the problem and the resulting flow.

Use fictional fixtures and isolated databases. Never test against an event's
live participant list or send test messages to real participants. Payment
changes need tests for incorrect signatures, wrong amounts, ownership,
duplicate callbacks, and provider failures. UI changes should include desktop
and mobile checks.

Run backend tests, frontend tests, the frontend build, and `npm run test:privacy`.
Report limitations honestly; a fake-provider integration test does not establish
live gateway settlement or inbox delivery.
