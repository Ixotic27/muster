# Independent ER architecture review

Reviewed on 10 October 2026 against the implemented Mongoose schemas. This is a documentation/diagram review; it does not rerun application tests.

## Evidence checked

- `scripts/generate-er-diagrams.py` and generated `entity-relationship.svg/.drawio`, `supporting-entities.svg/.drawio`.
- `User`, `Event`, `Team`, `TeamInvite`, `Registration`, `Payment`, `GatewayOrder`, `Pass`, `Notification`, and `EmailJob` schema definitions.
- `docs/architecture/data-model.md` for storage semantics and index interpretation.
- All three current ER SVGs, including `conceptual-er.svg`, were rendered directly with Resvg and visually inspected. This avoided mistaking older PNG exports for the revised diagrams.
- XML inspection found 106 cells / 12 edges in the core drawing and 95 cells / 12 edges in the supporting drawing, including four legend examples per drawing. Cell IDs are unique and each referenced source/target exists.

## Confirmed

The core registration/payment and supporting membership/delivery relationships are consistent with the schemas and explicitly described application invariants:

| Relationship | Verified interpretation |
|---|---|
| Event → Team / Registration | Required parent reference; zero or many children |
| User → Registration | Required leader reference; zero or many registrations |
| Team ↔ Registration | Optional team for solo registration; at most one consistent registration per team, provided event alignment is enforced alongside the compound unique index |
| Registration → Payment | Required registration on each receipt; zero or many historical receipts |
| Registration → GatewayOrder | Required, unique registration reference on each order; zero or one local order per registration |
| GatewayOrder ↔ Payment | Optional order reference on each payment; schema allows multiple historical receipts; selected receipt pointers remain separate fields |
| Registration → Pass | Required registration on each personal pass; zero or many passes, with unique registration/user pair |
| Team → members[] | Embedded values, no separate collection or member `_id`; default array permits zero values at schema level |
| User → TeamInvite | Required sender; optional registered recipient for invitations to unregistered email addresses |
| User → Notification | Required recipient; zero or many messages |
| Notification / User → EmailJob | Optional reference on each job; reference fields are not unique, so zero or many jobs are physically possible |

The views use square entity tables, explicit unique/reference annotations, undirected relationship lines, and conventional circles/bars/Crow's Foot endpoints. There are no workflow arrowheads in the ER relationships. Dashed non-identifying references and the custom solid embedded-ownership convention are explained in the legend; embedded values are explicitly labeled as such. The SVG endpoint shapes distinguish exact-one, optional-one, optional-many, and mandatory-many.

The editable files use `ERmandOne`, `ERzeroToOne`, `ERzeroToMany`, and `ERoneToMany` marker identifiers. Those names are implemented in [draw.io maintainer source](https://gist.github.com/davidjgraph/5969564). XML validation alone does not prove identical editor routing or font rendering; the SVG exports are the visually reviewed output.

## Findings reported to the diagram author

1. At the initial review, `data-model.md` used `UK` / `REF` in its notation table while the actual diagrams used `UQ` / `FK`. Keep these labels consistent, while retaining the warning that an ObjectId reference is not an SQL foreign-key constraint.
2. The core footer initially claimed the documentation cataloged every ObjectId relationship, but the relationship table did not list `Team.mergedIntoTeamId` or `Registration.refundReviewedBy`. Add those associations or qualify the completeness claim. Both are optional schema references; neither needs to clutter the focused core drawing.
3. The initial existing PNG exports and diagram README still described the previous publication. Re-render exports and update navigation/regeneration commands after all diagram revisions are complete. The current SVGs, rather than those older PNGs, were reviewed here.

No mismatched core cardinality or missing schema uniqueness was found in the reviewed Crow's Foot views. Grouped attribute rows are selected summaries, not claims of additional composite indexes; the footer explicitly lists actual compound keys. Receipt-history associations must remain distinct from `Registration.paymentId` and `GatewayOrder.paymentId` selection pointers.

### Follow-up resolution

The notation table now consistently defines UQ/FK, and the data-model document now includes the optional team self-reference and refund reviewer association plus a full ObjectId catalog. These two textual findings are resolved in the reviewed source. Export regeneration and navigation are performed by the parent publication task after the diagrams are final.

## Chen conceptual view

Reviewed `conceptual-er.svg/.drawio` and its generator after the Crow's Foot review. The six entity concepts are User, Event, Team, Registration, Payment, and Pass. Rectangles denote entities, diamonds denote relationships, ovals denote attributes, and each entity's `_id` is underlined as its chosen primary identifier. The conceptual view deliberately omits technical order/outbox details covered by the physical views.

The single/double participation lines agree with the minimum values printed at the **entity's own endpoint**. This is Chen min/max participation notation, distinct from reading a Crow's Foot endpoint on the opposite entity. In particular:

- A User participates in zero or many led registrations, and each Registration has exactly one leader.
- An Event participates in zero or many registrations/teams; each Registration and Team belongs to exactly one Event.
- Team/Registration participation is zero or one on both sides, preserving solo entries and teams not yet registered.
- A Registration has zero or many receipt records; each Payment has exactly one Registration. Free registration does not require a Payment.
- A Registration issues zero or many passes; each Pass has exactly one Registration.
- A User owns zero or many passes; each Pass belongs to exactly one User.

Required participation uses two parallel solid lines; optional participation uses a single solid line. There are no direction or workflow arrowheads. SVG inspection found no clipped identifiers, intersecting attribute ovals, or ambiguous relationship-diamond crossings. The right perimeter route connecting User and Pass is a relationship connector, not a system boundary; no surrounding boundary rectangle is drawn. XML identifiers and edge targets resolve, and every conceptual edge explicitly sets both arrowheads to `none`.

## Limits

The focused drawings do not draw every role-specific User association, self-reference, operational collection, audit target, or upload storage-key relation. This is deliberate scope and should remain explicit. MongoDB does not enforce target-document existence or cascading deletion for these application references. The service validation and transaction rules remain necessary.
