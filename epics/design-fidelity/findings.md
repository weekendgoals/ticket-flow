# Design fidelity — why a page epic shipped a page that did not look like its design

Mined 2026-09-17 from `weekendgoals`'s `redesign-city` epic, by the session
that supervised it. **Not an epic yet** — this is the evidence a planning
session should read before writing tickets against it, in the shape
`epics/run-lane-lessons/` was mined from the first three release epics.

Bias to declare: the author supervised the epic and hired every reviewer in
it. Every claim below cites the document or the code it rests on, so a fresh
context can check the reasoning rather than take the account.

## What happened

`redesign-city` ran 9 tickets to green: 12 integrated tickets, a full Cypress
suite at 315 passing, four other suites green, every ticket reviewed in fresh
context, three reviews finding real defects and fixing them. Then Vadim opened
the built page beside `City Desktop.dc.html` and said it does not look like
the design.

He was right. Three things the artboards draw never reached the page:

1. **The dark full-bleed hero band** — the artboard opens on a near-black
   band carrying breadcrumb, H1, the answer paragraph and the two stat tiles
   in a 1.4fr/1fr split. The built page renders the H1 as plain text over the
   app's own background photograph. (Also missing with it: the visible
   breadcrumb.)
2. **The interactive map card** — `city-map.html`, a Leaflet map with a
   priced pin per ground, named in the epic document's **first line** as one
   of three design sources. The page shipped a text link instead.
3. **The grounds table's bound** — the artboard shows 9 London clubs; the
   page rendered **93 rows**, every reserve, youth and non-league side in the
   catchment.

None of this was caught by: ticket authoring, a fresh-context plan review,
nine implementations, nine fresh-context ticket reviews, a release gate that
ran the whole e2e suite, or the supervisor. Six gates, one outcome.

## Why each gate missed it

**The acceptance criteria could all be true of a page that looks nothing like
the drawing.** CITY-5 is the desktop ticket. Its criteria, verbatim:

- no horizontal scroll at 1440/1200/1024px, and no match card's team names
  overlapping its kickoff time;
- every section present on mobile is present on desktop;
- FND-6's audit passes at desktop width.

All three were satisfied — and are satisfied by a page with no hero band at
all. The ticket names its artboard in prose ("`City Desktop.dc.html`. Same
data, same sections, one column and a rail") and then measures grid columns.
The worker did use a real browser, exactly as the methodology requires: it
measured `960px 340px` at 1440px. It measured what it was asked.

**The worker recorded the deviation, in the right place, and it went
nowhere.** CITY-5's worker wrote into `weekendgoals-ui-next/CLAUDE.md`:

> **Not replicated**: the design's dark full-bleed hero banner and its own
> 1.4fr/1fr headline/stat-tile split … touching the hero's markup/colours
> risked being exactly the "content difference from CITY-4" the ticket rules
> out.

That is honest, visible, and reasoned. It reached no human and no later gate.
This is the sharpest mechanical finding in this document: **`tickets.mjs`
parses `**Owed:**` and nothing else** (`parseOwed`, `scripts/tickets.mjs:426`;
`brief` carries owed items into every future ticket, `:1271`). A `**Decisions:**`
line — the field the entry template defines for "judgment calls and deviations
from the documents, each with the why" — is read by no command, surfaced in no
brief, and carried into no run record. A deviation is not owed work, so it
evaporates by construction.

**The reviewer is given the diff, never the artifact.** `/flow:ticket` step 7
hands the reviewer: the commit range, the `brief`, the ticket's own status
entry, and the instruction files for each area. It does not hand over the
design source the ticket was built from, and it never asks the reviewer to
render the thing. A reviewer with the artboard open beside the page would have
seen all three gaps in one screenshot. The review is a **code** review, in a
methodology that also produces designs.

**Two of the three gaps came from ground rules, which nothing re-examines.**
The epic preamble carries:

> **There is no static map anywhere in the app, and this page does not bring
> one back.** … Mapbox Static Images cost $146/month and earned 152 clicks …
> The design's "venue map" and its "Full map" affordance are therefore a
> **link into `/map`**.

The premise is true and the conclusion does not follow: Static Images returns
a *picture*, and the deleted module built an image URL. The app already ships
`mapbox-gl` and renders an interactive map at `/map`. A cost fact about one
product became a ban on a different one — and because ground rules are signed
off once and then carried into every `brief` as settled, no later gate ever
re-read it against the artboard it was overruling. The hero has the same
shape: CITY-5's "no content difference from CITY-4" was a rule against
*divergence between widths*, and the worker read it as a rule against
*touching the hero at all*.

**The human's first look at the product came after everything had merged.**
That is release delivery working as designed — the human's decision is the
release PR. But for a page epic it means the first eyes on the rendered page
arrive after 9 tickets are in, when unwinding is most expensive. The epic did
stop for a human once (CITY-8's English), and only because *text* needed
approving. Nothing made the *page* need approving.

## Root causes, ranked

1. **The checkable crowds out the important.** The plugin rewards criteria a
   script can run (`CHECK:`/`EXPECT:` are gated in code by the driver). "Looks
   like the artboard" is not scriptable, so it did not get written — not once,
   in nine tickets, in an epic whose entire purpose was to build a drawn
   design. The methodology has a `demonstrate:` form for exactly this and
   nothing steers a ticket author to it.
2. **Deviations are recorded but not routed.** `Decisions` is a write-only
   field. The one signal that would have caught this was produced, correctly,
   by the worker, and the machinery dropped it.
3. **Review has no access to intent.** The reviewer can only check the diff
   against documents that are themselves the thing that went wrong. Nothing in
   the packet is upstream of the tickets.
4. **A ground rule is immortal.** Signed off once, carried forever, never
   re-read against the artifact it constrains. Two of three gaps trace here.

## What the plugin should change

Each tied to a cause above. Ordered by expected value, not by effort.

- **A `COMPARE:` criterion kind** (cause 1). For a ticket that renders UI from
  a design source: `COMPARE: <artboard path> @ 1440,393`. The worker must
  render both and produce a section-by-section table of what matches and what
  differs; the table goes in the status entry. Not machine-gradable, and it
  does not need to be — its value is that it cannot be answered without
  looking.
- **The reviewer's packet carries the design source** (cause 3), and for a UI
  ticket the review skill instructs it to render the page and compare. The
  reviewer is already the only fresh context in the loop; it is the cheapest
  place to put an outside eye on the output rather than the diff.
- **`brief` propagates `Decisions` that say something was not built** (cause
  2). Minimum: parse `**Decisions:**` the way `parseOwed` parses owed, and
  surface any entry whose decision text records a deviation from the ticket's
  named source. Stronger: in an unattended run, a deviation of that kind is a
  **halt**, the way a contradiction is — the run asks rather than records.
- **A ground rule that removes something the design shows must name it**
  (cause 4). If a rule overrules an artboard element, it says which element,
  so the `COMPARE:` table can mark it "removed by ground rule <name>, <date>"
  instead of silently not appearing. That one line would have made both the
  map and the hero visible as absences rather than as nothing.
- **`/flow:epic` refuses sign-off on a page ticket with no visual criterion**
  when the epic carries a design context directory. The cheap structural
  version of the first bullet.

## What worked, so it does not get "fixed"

- The halt machinery. CITY-9 hit an acceptance criterion that was
  unsatisfiable (a 404 asserted to make no gateway request, while the shell's
  layout fetches in parallel) and **stopped for a human instead of loosening
  the assertion**. That is the mechanism working, and it is the same class of
  problem as this document's subject — caught, because a `CHECK:` failed.
- Fresh-context review found real defects every time it was pointed at
  something it could see: three factual errors in city text, a claim the cited
  source contradicted, an assertion that passed vacuously against a warm
  server.
- The worker's honesty. Every gap in this document was findable because the
  workers wrote down what they had not done.

## Caveat

One cause is not the plugin's. This epic was run by a supervisor (me) who
accepted each ticket's criteria as written and never opened the artboard until
the user did. A plugin change makes that failure less likely; it does not make
it impossible, and a document claiming otherwise would be the same kind of
error as the ground rule above.

---

# Round two — the fixes above were in force, and five more differences shipped

Appended 2026-09-17, the same day. This half matters more than the first,
because it is evidence about the *fixes*, not about the original failure.

## What happened

The epic gained the artboard-comparison ground rule. CITY-13 was written
under it, carried a visual criterion, and its reviewer was given a browser and
both artboards — the first two remedies in this document, applied. That
reviewer earned its keep: it measured `getComputedStyle(h1).fontSize === "24px"`
against the artboard's 38px and found an inline style beating a media query,
an Important finding no diff review would have produced.

Then Vadim looked at the page again and found **five more differences**, all
in sections CITY-13 had not been about:

| | artboard | built |
|---|---|---|
| two-track columns | `702px / 502px`, gap 32 | `960px / 340px`, gap 0 |
| weekend cards | 2 per row, 369.6px | **3** per row, 302.7px |
| "Clubs and grounds" | first section of the rail | full-width band below both tracks |
| "The one to be at" label | monospace 11px/600, tracking 0.88px | system sans 11px/700, tracking 0.7px |
| long lists | bounded, toggled | one-way disclosure (clubs), unbounded (transport) |

## Why the round-one fixes did not catch them

**1. A visual criterion scoped to the ticket's own section leaves the rest of
the page unchecked forever.** CITY-13's criterion was "at 1440px and 393px the
hero renders as the artboard draws it". The worker compared the hero. The
reviewer reviewed the hero. Both did it well. Nothing in the epic ever owned
"the whole page", so the grid proportions, the card count, the rail's contents
and a label's font face were checked by no ticket at any point — and never
would have been, because every ticket's scope is a section and the differences
live between them. **Per-section fidelity checks distributed across tickets do
not sum to a page that matches the design.**

**2. "Renders as the artboard draws it" is not a checkable criterion.** It was
satisfied by a page whose H1 was the mobile size. The new Cypress spec written
under it asserted `display: grid`, the column ratio and the stat tiles' left
edge — and was green with the defect present. A fidelity criterion has to name
the properties it is about, or a worker will assert the ones it happens to
think of, which are the ones it already believes are right.

**3. Every difference across both rounds is a computed-style value.** Grid
columns, font family, font size, weight, letter-spacing, padding, border
radius, section order. Both reviewers that found any of them found them with
`getComputedStyle`; every one that was missed was missed by eye. This is not a
judgment problem and it should not be given to judgment: it is a diff between
two property maps, and no tool in the plugin produces one.

**4. Two of the narrowings were introduced at planning time, by the ticket
author, and no gate looks there.** CITY-5's scope line says "The grounds table
gains its full-width layout" — a deliberate override of what the artboard
draws, written before any code existed. The static-map ground rule is the
same shape. `/flow:epic` runs a fresh-context plan review, and it checks
sizing, ordering, uncheckable criteria, hidden dependencies and contradictions
with the code. **It is never given the design.** The cheapest possible catch —
before a line is written — is the one gate that structurally cannot make it.

## The finding under all of it

The methodology knows about three kinds of artifact: documents (tickets,
status logs, instruction files), a diff, and tests. **A design is a fourth
kind, and the plugin has no slot for it.** Every failure in this document
follows from that absence: criteria cannot reference what the plugin cannot
name, reviewers are not handed it, the plan review cannot check against it,
and a ticket that overrides it has nowhere to record the override where a
later check would read it.

## What to change, revised

Superseding the first half's list where they differ.

- **An epic with a design source gets one whole-page fidelity ticket, run
  last, scoped to the entire artboard** — not a visual criterion per ticket.
  Per-ticket checks stay useful for the section being built; they are not a
  substitute, and this document is the evidence.
- **Ship a fidelity differ.** Given two URLs and a landmark selector list, it
  extracts a fixed property set (`grid-template-columns`, `gap`, font family /
  size / weight / letter-spacing, colours, radius, padding, heading order,
  child counts) from both and prints the differences. Every one of the eight
  differences found across both rounds is in that set. A `COMPARE:` criterion
  then has something to run, and the result is a table rather than an opinion.
- **The plan reviewer is given the design sources** when the epic has them,
  and is asked one question the current review never asks: *does any ticket
  narrow what the design draws, and does it say so?* Both planning-time
  narrowings would have been caught here, for the price of one extra input.
- **A sanctioned deviation is declared where the fidelity check reads it**,
  not in ticket prose — so the whole-page comparison can mark an element
  "removed by <decision>, <date>" instead of silently not appearing, and a
  reader can see the list of everything the build deliberately does not draw.
- Unchanged from the first half, and reinforced: **`brief` must propagate
  `Decisions` that record something not built**, and the reviewer's packet must
  carry the design source. The second is now positively evidenced — the one
  reviewer given a browser and an artboard produced the only Important finding
  of the two rounds.

## What this round says about the first round's diagnosis

One correction. The first half ranked "the checkable crowds out the important"
first. Round two shows that is incomplete: CITY-13 *had* a visual criterion
and still shipped five differences, because the criterion was **scoped to a
section** and **written as prose**. The cause is better stated as: *the plugin
has no artifact-level check, only ticket-level ones, and no way to express a
visual property as a check.* Scope and checkability, not checkability alone.
