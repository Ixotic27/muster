# Architecture diagrams

The diagrams describe the template's main workflow, rather than every internal
field. Open the `.drawio` files in diagrams.net for editable shapes and arrows.
The `.svg` files are ready to view, embed, print, or share without an account.

- [Entity relationship diagram](entity-relationship.svg)
- [ER diagram PNG](entity-relationship.png)
- [Editable ER diagram](entity-relationship.drawio)
- [High-level system design](system-design.svg)
- [System design PNG](system-design.png)
- [Editable system design](system-design.drawio)

![Entity relationship diagram](entity-relationship.svg)

![High-level system design](system-design.svg)

MongoDB references are logical application relationships, not SQL foreign-key
constraints. Team members are embedded subdocuments. A registration has a
separate pass for each accepted teammate. Check-in is recorded per pass, not per
payment or team. Refund review data lives on the registration.

The email outbox is persisted in the same transaction as the business update.
Delivery happens after commit; independently scheduled worker runs retry queued
messages. SMTP acceptance does not establish inbox placement.

Regenerate the editable `.drawio` files and SVGs with
`python scripts/generate-diagrams.py` (Python 3.12+ recommended). The supplied
PNGs are rendered exports; regenerate them by exporting the diagram from
diagrams.net or rendering the SVG with a local SVG-to-PNG tool. No diagram
account, API key, or third-party upload is required.
