# Muster release verification

Date: 10 October 2026. Scope: API-first positioning, neutral Muster branding,
reference-client copy, integration guidance and conventional architecture views.
The original Aarambh repository and its deployments were not modified.

Muster means to gather people. Adopters can run `backend/` independently and
connect their own frontend. This remains a self-hosted application starter.

| Check | Result |
| --- | --- |
| Backend regression | All 10 suites passed using disposable MongoDB and fake providers. Covers registration, gateway signatures/retries, staff scopes, private uploads, OAuth/password security, mail leases/recovery and manual-payment policy. |
| Frontend regression | All 85 tests across 13 suites passed. |
| Frontend production build | Vite build passed. |
| Publication privacy | Reserved fixture addresses only; no detected credential URLs or keys. |
| Architecture files | Five draw.io/SVG/PNG sets present; 72 connectors have valid references; all 81 checked local links resolve. Crow's-foot relationships have conventional endpoints. |
| Markdown diagrams | All four Mermaid blocks parsed: three sequence diagrams and one state diagram. |
| Source consistency | Independent review checked nine lifecycle enums and 42 model references across 11 models. See the separate architecture review records. |
| Diagram visual review | All five rendered PNGs inspected for shape notation, labels, connectors and layout. |
| Desktop reference client | Homepage and signup checked at a 1280 × 900 viewport; neutral brand and demo badge visible. |
| Mobile reference client | Homepage and signup checked with a 375 × 812 viewport override; document width equals scroll width, without horizontal overflow. |
| Email preview | Rebranded payment-success HTML visually inspected and published screenshot refreshed. |

Brand changes include the session and OAuth cookie prefixes. Existing sessions
from an earlier template version need a fresh login. Provider credentials remain
adopter supplied; these checks do not establish real SMTP inbox delivery or a
real merchant transaction. The broader workflow checks and their limits are in
[the test record](README.md). Architecture review evidence is in
[the final review](architecture-final-review.md) and
[the ER review](architecture-review-er.md).
