# Release verification — 10 October 2026

The template was checked in its own folder using synthetic accounts, disposable
MongoDB replica sets and fake email/payment providers. The original event's
database, deployment, photos and participant records were not used.

## Automated checks

- Backend: all ten suites passed, including fourteen gateway cases, ten
  email-worker cases and fifteen core workflow groups. See the
  [backend record](backend-verification.md) for coverage and commands.
- Frontend: 85 tests in thirteen suites passed, and the production Vite build
  succeeded. See [frontend verification](../../frontend/TESTING.md).
- Both dependency trees reported zero audit findings, including development
  dependencies, at the time of verification.
- Backend syntax checks passed for 103 JavaScript files.
- A separate reviewer checked authorization, payment reconciliation, OAuth,
  publication privacy and configuration. See [security review](security-review.md)
  and [publication review](publication-review.md).

GitHub's first Linux run passed every backend suite, the API dependency audit
and privacy scan. Its frontend clean install exposed missing optional peer
entries in a Windows-generated lockfile. The lockfile was rebuilt in a
standalone directory with npm 10: Linux-targeted clean-install validation and
an actual Windows clean install passed, followed by all 85 client tests, the
production build and a zero-finding full audit. No application code or existing
dependency versions changed in this portability correction. Latest hosted
results are available in [GitHub Actions](https://github.com/Ixotic27/event-management-template/actions/workflows/ci.yml).

## Browser checks

The local interface at port 4120 used an isolated API at port 4121. Desktop
review used 1280 × 900; mobile review used 375 × 812.

| Journey | Observed result |
| --- | --- |
| Public homepage, event cards and footer | Generic artwork and responsive layouts fit; FAQ starts closed. |
| Signup | A regular email, name and password work without institutional details; optional academic fields remain available. |
| Free registration | Consent and confirmation create a confirmed zero-fee registration without payment wording. |
| Personal pass | The participant receives a unique generated entry QR with event, attendee, venue and time. |
| Wrong-event scan | Uploading that QR at another checkpoint is rejected. |
| Correct-event scan | The real local API records one entry and updates attendance totals. |
| Duplicate scan | The same QR reports already checked in without a second attendance record. |
| Administration | Registration filters and an expanded participant record reflect the scanned attendance. |
| Event manager | The organizer sees its assigned event only; an unassigned event is unavailable. |
| Responsive staff screens | Scanner, manager, admin roster and signup fit mobile width without page overflow. |
| Payment-success email preview | Desktop/mobile HTML explains the purpose, current status and next step without horizontal overflow. |

Screenshots containing generated private test passes are kept only in the
ignored local screenshot folder. The published [homepage preview](../showcase/home.png)
contains no accounts or QR credentials.

CSV export content, filtering, authorization and formula escaping passed API
and frontend tests. The in-app browser's download-event capture timed out, so
a saved browser CSV file is not claimed as verified. A development hot-reload
transition briefly invalidated React context during source renaming; reloading
the frozen build restored the scanner, and persisted attendance was checked.

## Limits of these results

Image-based QR decoding was exercised; a physical camera was not. Razorpay was
tested against a deterministic fake provider, not an actual bank or sandbox
merchant. SMTP acceptance and retries used an injected transport, not a real
inbox. Adopters must configure their own keys, webhook, SMTP sender and DNS and
verify checkout, email arrival and camera permissions before accepting users.

The template records manually processed refunds; it does not automatically
transfer refund money. Test/audit success is evidence for these checks, not a
guarantee against future advisories or deployment mistakes.
