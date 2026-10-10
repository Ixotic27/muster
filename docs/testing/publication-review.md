# Publication review — 10 October 2026

An independent final review examined the candidate source, README, deployment,
payment/email/workflow guides, environment examples, license, CI configuration
and diagram assets. Local credentials, dependencies, scratch work and visual-test
artifacts were excluded from the publication candidate.

## Corrections made before publication

- The local Google callback example now uses the frontend's same-origin API
  proxy. The deployment guide explains why starting and completing OAuth must
  preserve the browser origin and its state cookie.
- The publication checker now scans JSX/TSX, module scripts and Python text as
  well as the original file types, while excluding ignored scratch/build files.
- The diagram guide links the supplied PNGs and distinguishes regeneration of
  editable/SVG files from exporting PNGs.

## Checks performed

- `npm run test:privacy` passed after expanding the checked file types.
- A temporary synthetic JSX fixture containing a non-example email caused the
  publication checker to fail as expected. The fixture was removed afterwards.
- A source/document scan found no original event/institution names, known
  personal addresses, original contact numbers or credential-bearing database
  and media URLs in the reviewed publication directories.
- Both diagrams have editable `.drawio`, rendered SVG and PNG files. The README
  uses the SVGs and the diagram guide links all supplied formats.
- Backend environment examples leave signing secrets, gateway keys, mail
  credentials, privileged email lists and payment destinations blank. Email is
  disabled and live payments/manual payments are disabled by default.
- Dependency lockfiles, test commands and CI configuration were checked for
  consistency with the documented frontend/backend setup. Detailed execution
  evidence belongs to the backend and frontend verification reports; this final
  pass did not rerun their full suites.

No additional security or privacy blocker was found in the reviewed candidate.
The README's linked aggregate test record is being completed by the release
owner and must be included in the publication commit.

This is a source/configuration review and a conservative credential scan. It is
not a proof that no sensitive string could exist or a production-service test.
Real merchant checkout, SMTP inbox delivery and Google account sign-in remain
the adopter's responsibility. Before pushing, check the exact Git staging list:
ignored local environments, databases, uploads and screenshots must stay out.
