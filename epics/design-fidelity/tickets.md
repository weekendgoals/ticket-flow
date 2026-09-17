# Design fidelity epic — tickets

Source: `context/findings.md` — mined 2026-09-17 from a page epic in an
installed project, both rounds, by the session that supervised it; its
"Ideas" sections are marked as guesses, and the decisions below are this
plan's. `context/plan-review-2026-09-17.md` records the two fresh-context
plan reviews: the first, of a combined six-ticket draft, whose sizing
findings led the planner and Vadim to split the work in two —
`epics/deviation-routing/` is the other half — and the second, of both
rewritten documents. Shaped in conversation with
Vadim the same day, who settled that the differ is a **permanent** plugin
script and that the plugin is developed **agnostically to the projects that
use it**. Planned 2026-09-17.

**This epic starts after `deviation-routing` has reached `main`**: FID-3's
verify step turns a difference nobody fixes into a `**Deviation:**` line,
and that line does nothing until the other epic's parser and doors exist;
FID-4's `compared` subcommand reads the log through the reader DEV-1 adds.
FID-1 and FID-2 do not depend on it.

Outcome: The methodology names three kinds of artifact — documents, a diff
and tests. A design is a fourth, and the plugin has no slot for it. In the
source epic nine tickets passed six gates and shipped a page missing three
drawn elements; two rounds later eight differences had been found, every one
a computed-style value, every one found with `getComputedStyle` and missed
by eye, every round found by the human opening the page beside the drawing.
No criterion referenced the design; neither reviewer was handed it; a visual
criterion scoped to one section left the gaps between sections owned by
nobody; two narrowings were written into the plan before any code existed,
and the plan review is never given the design. Observable change: an epic
can declare its design and everything downstream can read it — a `COMPARE`
criterion produces a property diff between artboard and page instead of an
opinion, one ticket owns the whole artboard, the plan reviewer and the
ticket reviewer are handed the design, and a sanctioned removal is declared
by the plan where the diff reads it, never by the ticket under review.
Evidence, on the next two page epics run with the plugin in an installed
project: (a) differences the human finds at the release pull request that
fall inside the differ's property set — zero. What produces it: the retro
asks what the release review found that no gate had surfaced — the question
`deviation-routing`'s DEV-3 adds — and the answer is written down even when
it is "none found", because an absent record is indistinguishable from
zero. (b) Every drawn element absent from the page appears
in a `**Compared:**` table as "removed by <decision>", never as silence —
for every element the design map covers, the plan reviewer having checked
the map against the artboard (FID-5). What produces it: the differ's tables
in status entries (FID-3), and the release review that already happens.
Reversal: if over those two epics the design map costs more to keep true
than the differences it finds — tables of noise, or a clean diff beside
differences the human still finds inside the property set —
`fidelity.mjs`, `COMPARE` and its gate are removed and the record says so.
The design in the two reviewers' packets stays either way: it is a missing
input, and rests on no tool.

Requirements:
1. When an epic declares design sources, the brief, the ticket reviewer and
   the plan reviewer shall each be able to read where they are.
2. When a ticket carries a `COMPARE` criterion, a property diff between the
   artboard and the built page shall be in its status entry before it
   merges, or the merge shall stop — at the unattended door and the attended
   ones.
3. When a drawn element is deliberately not built, a comparison shall show it
   as removed by a named planning decision, never as missing and never as
   nothing — and the ticket under review shall not be able to declare its
   own missing element removed.
4. When an epic declares design sources, one ticket shall own the entire
   artboard, so that what lies between the other tickets' sections is
   checked by somebody.
5. When a plan narrows what the design draws, or its design map leaves a
   drawn element out, the plan review shall be able to see it before
   sign-off.

Areas in scope: `plugins/flow` (root `CLAUDE.md` binds all of it — a new
`scripts/fidelity.mjs` and its suite, `scripts/tickets.mjs` and its suite,
the driver `workflows/run-epic.mjs` and its suite, the Codex review runner's
pinned packet copy, `scripts/check-invariants.mjs` and its suite, the epic,
ticket, quick, review and run skills, the two reviewer agents, README,
METHODOLOGY, CHANGELOG, `CLAUDE.md` itself, `.github/workflows/tests.yml`).

Delivery: release — six tickets, one release pull request. **Re-planned
2026-09-17, after sign-off, on Vadim's instruction ("do all unattended"):
FID-1 is run attended, then `/flow:run design-fidelity` takes FID-2 to
FID-6.** FID-1 stays attended for one reason: its smoke test needs a real
browser, an unattended worker holds none, and its stated fallback — owed to
FID-3 — would land on a worker that holds none either, which is a criterion
that merges unperformed. The launching session has a browser pane, a run
resumes cleanly after an integrated ticket, and so the one criterion the
unattended lane cannot perform is performed before that lane starts. From
FID-2 on nothing waits for a human between tickets: a fresh worker
implements each one, the driver hires its reviewer, and it merges into
`epic/design-fidelity` by verified SHA; the next human decision is the
release pull request. The two reasons the plan first gave for an attended
run still hold, and are accepted knowingly. The plugin is not installed in
the launching session (`flow:epic` was not registered on 2026-09-17 and was
executed from its source), so each reviewer hire fails once and takes the
driver's sanctioned fallback, a general agent given the reviewer's rules —
a cost in spend, not in safety. And FID-4 edits `run-epic.mjs` while a run
is in flight: harmless, because a workflow script is read once at launch,
and it means this run is not governed by the gate it builds.

Environment probes, 2026-09-17: branch protection on `main` —
`gh api repos/weekendgoals/ticket-flow/branches/main/protection` answers 404
"Branch not protected", and `…/rules/branches/main` answers `[]`:
unprotected. The two earlier epics recorded a 403 on a private repository
under the free plan; the repository is public now, so protection is
available and simply not enabled. **Waived 2026-09-17: Vadim chose to run
without the hard floor** — "i waive the protection" — having been told that
protection could be switched on instead. The probes are re-run when this
epic's run is launched, which is after `deviation-routing` has reached
`main`; a changed answer is reported before anything starts.

Worker model: opus

Consequence paths: plugins/flow/workflows/**, plugins/flow/scripts/tickets.mjs

Decisions at planning, 2026-09-17:
1. **The differ ships no browser.** `fidelity.mjs` prints a self-contained
   page-side extractor and diffs two JSON property maps in pure Node. The
   browser that runs the extractor is the project's own — its e2e runner, a
   browser pane — because `tickets.mjs` has zero dependencies, the plugin
   has no `package.json`, and that is why it installs anywhere.
2. **The design map is JSON, `epics/<name>/design-map.json`.** The differ
   consumes it directly; a Markdown table would need a second parser for a
   file only a script reads. It is a planning document like `tickets.md`.
3. **`removed` is planning's, and is read from the signed-off ref.** The
   plan review showed the first draft's hole: workers must edit the map
   (its `page` selectors are written before the page exists), and the same
   file held `removed`, so a worker who could not build an element could
   declare it removed, get a clean diff and halt nothing — the founding
   failure routed through the new machinery. So the differ honours removals
   only from a separate `--removed-from <file>`, which the verify step
   fills from the base ref the way `check --from` reads criteria; the
   reviewer treats a `removed` entry in the ticket's own diff as Important;
   and a worker who cannot build something writes a `**Deviation:**`.
4. **Per-ticket `COMPARE` stays, beside the whole-page ticket.** The source
   document would drop it. With a differ it costs one command on the section
   a ticket builds; the whole-page ticket is what closes the gaps between
   sections, and neither substitutes for the other.
5. **`tickets.mjs check` never runs a `COMPARE`.** It has no browser. Code
   gates the **presence** of the `**Compared:**` table; its content is the
   reviewer's, who can re-run the differ.
6. **The format (FID-3) and its gate (FID-4) are two tickets** (Vadim
   accepted the departure at sign-off review). CLAUDE.md asks that a
   criterion-format change move the parser, the skills and the driver in one
   commit. The plan review found no ungated window on two conditions, both
   held here: the format and its gate reach `main` in this epic's one
   release pull request, and compare rows stay out of the ledger's `total`
   — which FID-3 pins with a test. FID-3 amends the CLAUDE.md invariant to
   name `COMPARE` and to say so.
7. **A project-agnostic smoke test is allowed** (Vadim, sign-off review):
   the plugin's own two static HTML fixtures, opened once in a browser, the
   two reports committed as the suite's fixtures. "No proof run against any
   one project" stands; without this the extractor's first contact with a
   real `getComputedStyle` would be inside somebody's page epic.

CHECK ledger, 2026-09-17, on the tree at `b96da41` (`origin/main` after PR
#50): every CHECK below was run with `tickets.mjs check <ID>` and **failed**,
as it must before its ticket exists; none was unrunnable here. The first
draft had one already green — a `test $? -eq 1` that Node's own
module-not-found exit satisfied — and eight written as bare bullets that
never ran; the ledger and `doctor` caught both before the plan review. The
second plan review re-ran every CHECK, found the same, and caught two more
defects a run cannot see: FID-4's grep for a bolded field name that the
skill's backtick convention would make unmatchable, and FID-5's
METHODOLOGY phrase, which an earlier ticket's reasoning could have turned
green. Both are rewritten below. The figures are in the sign-off record.

Status log: `epics/design-fidelity/status.md`. Run a ticket with `/flow:ticket <ID>`.

## Ground rules for every ticket in this epic

- **Project-agnostic, everywhere a project will read it.** No skill, script,
  agent, test or fixture names a project, a framework, an e2e tool, a design
  tool, a file extension for artboards, or a selector convention. Examples
  are generic (`hero`, `main > section:first-child`). The installed project
  that produced the evidence is named only in METHODOLOGY and CHANGELOG,
  where reasoning cites its source.
- **Zero dependencies, no browser in the plugin.** Nothing here adds a
  `package.json`, an npm dependency, a cache or a state file;
  `fidelity.mjs` never launches or drives a browser; no **test** needs one —
  the extractor is tested against a stub `document` / `getComputedStyle`.
  The actor for FID-2 to FID-6 is an unattended, driver-spawned worker with
  a shell — it spawns no agents, holds no browser and drives no interactive
  tool — and every criterion of those five is executable by that actor. The
  one criterion that wants a browser is FID-1's smoke test, which is why
  FID-1 alone is run attended, in a session that has one.
- **A design source is whatever a browser can render and `getComputedStyle`
  can read.** Where a project's design is not renderable (an image, a PDF),
  `COMPARE` degrades to a table written by hand and labelled as one — every
  skill that teaches `COMPARE` states the degraded form, because a criterion
  the lane cannot perform is recorded as owed, never implied.
- **A design path may contain spaces.** Artboard files are named by
  designers; every parser, test and example here treats the text between
  commas as the path.
- **A behaviour change gets its CHANGELOG entry under `## Unreleased` and
  its reasoning in METHODOLOGY in the same commit**; a new or grown suite
  updates CLAUDE.md's command list and pass count and `tests.yml` in the
  same commit — installed projects update live, and CI runs what CLAUDE.md
  names. Each ticket's METHODOLOGY reasoning goes under a heading of its
  own; the section headed "Why a design is a fourth artifact" is FID-5's,
  and no earlier ticket writes that heading — FID-5's CHECK greps for it.
- **A rule stated in more than one document is one rule.** Grep a doctrine
  sentence's key phrase across the skills, agents, README, METHODOLOGY and
  CLAUDE.md before writing it; a new cross-document coupling gets a short
  `check-invariants.mjs` entry and a test that fails when one copy drops it.
  The driver's `REVIEWER_RULES` and packet body and the Codex runner's
  copies are pinned equal by `codex-review.test.mjs` — move them together.
- **A gate is verified at the door its actor walks through**, and its
  refusal names a recovery that works in the refused state.
- **Reviewers report and never fix.** Nothing here gives `ticket-reviewer` or
  `plan-reviewer` a write instruction; "re-run the differ" is a read.
- **Every constraint carries its reason** in the sentence that states it.
- **`run-epic.mjs` is parsed the way the runtime parses it** (CLAUDE.md's
  `node -e` command), never with `node --check`.

## Order

FID-1 first: three later tickets read the differ's output — the `COMPARE`
verify step (FID-3), the reviewer's re-run (FID-6), and the whole-page
ticket the epic skill will require (FID-5) — and its table and its
`--removed-from` contract are what they share. FID-2 second: the
declaration is all FID-5 and FID-6 need, and it is small. FID-3 before FID-4
because a gate cannot read a format that does not exist. FID-5 and FID-6
last: they hand the design to the two reviewers. If FID-1's extractor cannot
be made self-contained and testable without a browser, the epic does not
stop: FID-3 ships `COMPARE` with the hand-written table as its only form,
the reversal clause is recorded as already fired for the differ, and FID-4's
presence gate is unchanged.

## FID-1 — A zero-dependency fidelity differ

**Scope.**
- `plugins/flow/scripts/fidelity.mjs`, two subcommands, zero dependencies:
  - `extract` prints the source of one self-contained function expression,
    `(landmarks, side) => report` — no imports, no closure references, so
    any browser context can evaluate it. `landmarks` is the design map's
    list; `side` is `"design"` or `"page"` and picks which selector of each
    landmark to use. `report` is `{ side, viewportWidth, landmarks: {
    <name>: { found, order, childCount, props } } }`, with `props` a
    **fixed** set from `getComputedStyle` and `getBoundingClientRect`:
    `display`, `grid-template-columns`, `column-gap`, `row-gap`,
    `flex-direction`, `font-family`, `font-size`, `font-weight`,
    `letter-spacing`, `line-height`, `color`, `background-color`,
    `border-radius`, the four paddings, `width`, `height`. `order` is the
    landmark's position among the found landmarks in document order.
  - `diff <design.json> <page.json> --map <design-map.json>
    [--removed-from <design-map.json>] [--landmarks a,b] [--json]` prints
    one row per difference: landmark, property, design value, page value. A
    landmark found in the design and not on the page is `missing` — unless
    the **`--removed-from`** file's `removed` list names it, when the row
    reads `removed by <by>, <date>`. A `removed` list inside `--map` is
    never honoured, and the table says so when one is present, because that
    file is the one the ticket under review edits. A landmark declared
    removed that **is** on the page is its own row. Differing `order` and
    `childCount` are rows. Exit 0 when the only rows are declared removals,
    1 when anything else differs, 2 on a usage error or unreadable input.
  - Comparison is normalised, because two renderers print one value two
    ways: lengths within 0.5px are equal; colours compare as rgba;
    `font-family` compares its first family, unquoted, case-insensitive.
- The design map's shape, documented in the script's header:
  `{ "landmarks": [ { "name", "design": "<selector>", "page": "<selector>" } ],
  "removed": [ { "name", "by", "date" } ] }`. A malformed map is exit 2
  naming the entry.
- Fixtures under `plugins/flow/scripts/fixtures/fidelity/`: two small static
  pages, `design.html` and `page.html`, that differ in every row kind; their
  `design-map.json`; and `design.json` / `page.json`, the two reports.
- `plugins/flow/scripts/fidelity.test.mjs`: every row kind, each
  normalisation, `--removed-from` honoured and `--map`'s own `removed`
  ignored, the exit codes, and the extractor evaluated with `new Function`
  against a stub `document` to prove it is self-contained and returns the
  documented shape. `tests.yml` runs the suite and `node --check`s the
  script; CLAUDE.md's command list names it with its pass count.

**Not in scope.** Any criterion format, skill text or parser change — FID-3
teaches `COMPARE` and wires the differ into the verify step. Launching a
browser, screenshots, image comparison, any project's selectors.

**Size.** The second plan review put this ticket at 550–700 changed lines,
the largest in either epic, against 319–463 for earlier new scripts with
their suites here — one new file off the consequence paths, inflated by
generated fixtures, and not blocked on; Vadim accepted it as one ticket at
sign-off, 2026-09-17, on this condition. If the diff **without** the
fixtures passes ~450 lines, stop and split on the seam the review named:
`extract`, the HTML fixtures and the smoke test first; `diff` and the JSON
contract second.

**Acceptance criteria.**
- When two reports differ in a grid track list, the differ names the
  property and exits 1. (The exit code alone is not the criterion: with the
  script absent Node itself exits 1.)
  CHECK: out=$(node plugins/flow/scripts/fidelity.mjs diff plugins/flow/scripts/fixtures/fidelity/design.json plugins/flow/scripts/fixtures/fidelity/page.json --map plugins/flow/scripts/fixtures/fidelity/design-map.json 2>&1); code=$?; echo "$out" | grep "grid-template-columns" && test $code -eq 1
  EXPECT: grid-template-columns
- A removal is honoured only from the signed-off file.
  CHECK: node plugins/flow/scripts/fidelity.mjs diff plugins/flow/scripts/fixtures/fidelity/design.json plugins/flow/scripts/fixtures/fidelity/page.json --map plugins/flow/scripts/fixtures/fidelity/design-map.json --removed-from plugins/flow/scripts/fixtures/fidelity/design-map.json | grep "removed by"
  EXPECT: removed by
- The extractor is one self-contained expression.
  CHECK: node -e 'const s=require("child_process").execFileSync("node",["plugins/flow/scripts/fidelity.mjs","extract"],{encoding:"utf8"});const f=new Function("return ("+s+")")();if(typeof f!=="function")process.exit(1);console.log("extractor is a standalone function")'
  EXPECT: extractor is a standalone function
- CI runs the new suite.
  CHECK: grep -c "fidelity.test.mjs" .github/workflows/tests.yml
- demonstrate (the smoke test): open `design.html` and `page.html` in a real
  browser, evaluate the printed extractor on each with the fixture map, and
  commit the two reports it returns as `design.json` and `page.json` → the
  suite runs against values a real `getComputedStyle` produced; record the
  browser used and whether `width`/`height` within 0.5px read as signal or
  as noise. This ticket is run attended precisely so that a browser is there
  (see `Delivery:`). If the session turns out to have none, the ticket is
  **BLOCKED**, not owed: every later ticket is built by an unattended worker
  that holds no browser either, so an owed smoke test would merge
  unperformed.
- Standing checks, reported with counts under **Verified**: the new suite,
  every suite CLAUDE.md names, `check-invariants.mjs`, `doctor`, and the
  revert check's named test.

## FID-2 — The `Design sources:` declaration

**Scope.**
- `tickets.mjs`: a `Design sources: <path>[, <path>]` preamble line, parsed
  by its **own** list reader — split on commas, trim, the whole segment is
  the path — because `grabPathList` keeps only a segment's first word, which
  is right for a glob followed by prose and wrong for a file a designer
  named with a space. No prose on this line. Exposed as `designSources` by
  `find`/`brief` JSON (and so, like every declaration, read from the ref
  under `find --from`), with `designMap`: the absolute path of
  `epics/<name>/design-map.json` when it exists, else null.
- `doctor`: the label joins the declaration near-miss regex and its message,
  and a declared path that does not exist is a warning naming the path.
- Epic skill: the template's configuration block teaches the line — what a
  design source is, that it may live outside this epic's `context/`, that
  the line is what hands the design to both reviewers. README's
  configuration table gains the row.
- Tests: a path with a space, two paths, a missing path, the near-miss, and
  `find --from` reading the line from a ref.

**Not in scope.** `COMPARE`, the design map's use, the verify step — FID-3.
Who reads the declaration — FID-5 and FID-6. Any change to `grabPathList`
or to the two lines that use it.

**Acceptance criteria.**
- `find --json` exposes the declaration for any ticket.
  CHECK: node plugins/flow/scripts/tickets.mjs find HARD-1 --json | grep -o '"designSources"' | head -1
  EXPECT: "designSources"
- README documents the line.
  CHECK: grep -c "Design sources:" README.md
- The epic template teaches it.
  CHECK: grep -c "Design sources:" plugins/flow/skills/epic/SKILL.md
- demonstrate: a throwaway epic declaring `Design sources: designs/City
  Desktop.html, designs/map.html` with only the second file present →
  `find --json` prints both paths whole, and `doctor` warns about the first
  by its full name. Record both outputs.
- Standing checks with counts, as FID-1.

## FID-3 — The `COMPARE` criterion

**Scope.**
- `tickets.mjs`: a `COMPARE: <design source path> @ <width>[,<width>]`
  line, indented under its criterion like `CHECK:`, with an optional
  `LANDMARKS: <name>[, <name>]` line beneath it (absent = every landmark in
  the map = the whole page). `check <ID>` reports them in a **separate
  `compares` list**, marked *manual — run the differ, table required in the
  entry*: they never run, and they are in neither `total` nor `passed` — the
  driver halts when `passed !== total`, so a compare row counted there would
  halt every `COMPARE` ticket. A malformed one (no width; a path the epic's
  `Design sources:` does not list; `LANDMARKS:` with no `COMPARE:` above it)
  is a ledger **problem** and fails `allPassed`, exactly as a malformed
  `CHECK` does. A test pins the `check --json` shape. Doctor near-miss
  coverage on the `CHECK_NEAR` pattern.
- Epic skill: the template teaches `COMPARE`, `LANDMARKS`, the design map
  and that its `removed` list is **planning's**; the criteria rules say a
  fidelity criterion **names the landmarks it is about** — "renders as the
  design draws it" is prose a worker satisfies with the properties it
  already believes are right.
- Ticket skill step 5 and quick skill step 5, for each `COMPARE`: serve the
  design source and the built page with the project's own tooling; evaluate
  `fidelity.mjs extract` on both at each width; write the signed-off map to
  a scratch file with `git show origin/<base>:epics/<name>/design-map.json`
  and pass it as `--removed-from`, because a removal is a planning decision
  and the working tree's map is the one this ticket edits — and when the
  base ref has no map yet, which is the first ticket of an incremental epic
  (its documents land in that ticket's own pull request), read it from
  `origin/epic/<name>`, the branch sign-off pushed; run `fidelity.mjs
  diff`; paste the table into a `**Compared:**` field of the entry. Every
  row is then fixed, or recorded as a `**Deviation:**`, or already a
  declared removal. No browser in the session, or a design nothing can
  render: the comparison is **owed**, said so, and a hand-written table is
  labelled as one.
- Ticket skill step 6's entry template gains the optional `**Compared:**`
  field; `check-invariants.mjs` couples the `COMPARE` format across the
  epic, ticket and quick skills and the script, with a test.
- `CLAUDE.md`: the CHECK/EXPECT invariant is amended to name `COMPARE` as
  part of the one format, and to record that its gate may land in a
  following ticket of the same release — with the two conditions that make
  that safe.

**Not in scope.** Any driver change and any gate on the table — FID-4. Who
else reads the design — FID-5, FID-6. Changing how `CHECK`/`EXPECT` parse or
run. The `**Deviation:**` line itself, which `deviation-routing` owns.

**Acceptance criteria.**
- The ledger reports comparisons apart from checks.
  CHECK: node plugins/flow/scripts/tickets.mjs check FID-5 --json | grep -o '"compares"' | head -1
  EXPECT: "compares"
- The invariant checker holds the format's coupling.
  CHECK: grep -c "COMPARE" plugins/flow/scripts/check-invariants.mjs
- CLAUDE.md's invariant names it.
  CHECK: grep -c "COMPARE" CLAUDE.md
- Both lanes read removals from the base ref.
  CHECK: grep -c "removed-from" plugins/flow/skills/ticket/SKILL.md
- demonstrate: a throwaway epic declaring `Design sources:` with one ticket
  carrying `COMPARE: <path> @ 1440,393` and one carrying `COMPARE:` with no
  width → `check --json` prints the first under `compares` with `total` 0
  and `allPassed` true, prints the second as a problem with `allPassed`
  false; `doctor` flags a `Compare:` near-miss. Record the three outputs.
- Standing checks with counts, as FID-1.

## FID-4 — A missing comparison stops the merge, at every door

**Scope.**
- `tickets.mjs`: `compared <ID> [--log-from <ref>] [--json]` — the count of
  `**Compared:**` lines under the ticket's own entries, read through the
  log reader `deviation-routing`'s DEV-1 added, with the same rule that an
  unreadable ref is exit nonzero and never a count of 0. It lives in the
  script, not in a `grep` inside the driver's prompt, because
  `run-epic.test.mjs` stubs every agent: a counting pipeline written into a
  template literal is executed by no test, and a mis-escaped `\*\*` would
  first show as a count of 0 on a live run. Tested against fixture logs in
  `tickets.test.mjs`.
- Driver: `ACCEPT_SCHEMA` gains the acceptance report's `compares`; the
  resolve step runs `compared <ID> --log-from origin/<branch> --json` and
  reports it verbatim. A ticket whose **signed-off** section carries a
  `COMPARE` and whose pushed entry records none halts on the
  **acceptance-check** condition, whose pinned sentence gains one clause,
  **or a COMPARE criterion whose pushed entry records no comparison**, in
  all five files that carry it: the run skill, the script,
  `check-invariants.mjs`, and both suites. A `compares` or `compared` fact
  that is missing or the wrong type is **refused** and halts, as the file's
  own rule for every fact says — read as "no COMPARE" it would skip the
  gate.
- The attended doors, because a supervisor or a session merges there, not
  the driver: ticket skill step 9 names a `COMPARE` ticket whose entry
  records no comparison in the summary and the pull request body; step 10
  does not integrate it. Recovery, either way leaving a record: run the
  comparison and append the `**Compared:**` field in a dated addendum; or,
  where no browser exists, append `**Compared:** owed — <who accepted it,
  when, and why it could not run>` on the human's word — which the gate
  then reads as present, and a reader reads as not done. Quick skill step 7
  names it in the body.
- `run-epic.test.mjs`: the halt; a `COMPARE` ticket with the field passing;
  a `COMPARE`-free ticket unaffected; a missing, a wrong-typed and an
  unreadable fact each halting.

**Not in scope.** Judging a table's content — FID-6. Re-running a comparison
from the driver, which has no browser. Anything about deviations.

**Acceptance criteria.**
- The clause is in the script.
  CHECK: grep -c "records no comparison" plugins/flow/workflows/run-epic.mjs
- The same clause is in the run skill.
  CHECK: grep -c "records no comparison" plugins/flow/skills/run/SKILL.md
- `check-invariants.mjs` pins it.
  CHECK: grep -c "records no comparison" plugins/flow/scripts/check-invariants.mjs
- The attended release merge refuses too. (The phrase carries no Markdown:
  the first draft grepped for a bolded field name, which the skill's own
  backtick convention would have made unmatchable.)
  CHECK: grep -c "records no comparison" plugins/flow/skills/ticket/SKILL.md
- The count is a tested subcommand, not a pipeline in a prompt.
  CHECK: node plugins/flow/scripts/tickets.mjs compared HARD-1 --json
  EXPECT: "compared"
- `run-epic.test.mjs` covers each branch listed in scope — name the new
  tests and report the suite's count under **Verified**; the driver parses
  with CLAUDE.md's `node -e` command.
- Standing checks with counts, as FID-1.

## FID-5 — The plan side: one ticket owns the whole page

**Scope.**
- Epic skill, step 3: an epic that declares `Design sources:` **ends with
  one whole-page fidelity ticket** — a `COMPARE` with no `LANDMARKS:` for
  each design source, at every width the design draws — because per-section
  checks distributed across tickets do not sum to a page that matches, and
  what lies between sections belongs to no section's ticket. Its actor is
  checked like any other: where the declared lane has no browser, it is a
  human-owned ticket ordered before the release, never a line owed to the
  release pull request.
- Epic skill, step 3: a ground rule or a scope line that **narrows what the
  design draws declares the removal** in the design map's `removed` list,
  naming the element, the decision and the date — so a comparison prints
  "removed by" instead of nothing, one file lists everything the build
  deliberately does not draw, and that list is signed off with the plan.
- Epic skill, step 4: the plan reviewer's packet gains the design sources
  and the design map. Step 5: sign-off shows the `removed` list, and names
  any UI-building ticket with no `COMPARE` as not ready.
- Plan reviewer agent, given the design, five lenses: a ticket or ground
  rule that narrows what the design draws without a `removed` entry; a
  ground rule whose premise does not reach its conclusion when re-read
  against the element it removes; **the design draws something no landmark
  covers** — the map is the root every comparison rests on, and an element
  left out of it is silent by omission; a UI-building ticket with no
  `COMPARE`; no whole-page ticket, or one not last.
- `check-invariants.mjs`: `plan-reviewer.md` joins `FILES` and the
  "reviewers report and never fix" phrase check — today that check does not
  cover the file this ticket edits.
- METHODOLOGY: "Why a design is a fourth artifact" — why the checkable
  crowded out the important, why scope and not checkability alone was the
  cause, why removals are planning's. README: the epic row and the
  documents table gain the design map.

**Not in scope.** The ticket reviewer — FID-6. Any parser or driver change:
"not ready for sign-off" is the planner's and the plan reviewer's judgment,
because "a UI-building ticket" is not something code can detect.

**Acceptance criteria.**
- The epic skill requires the closing ticket.
  CHECK: grep -c "whole-page fidelity ticket" plugins/flow/skills/epic/SKILL.md
- The plan reviewer is asked the narrowing question.
  CHECK: grep -c "narrows what the design draws" plugins/flow/agents/plan-reviewer.md
- And the omission question.
  CHECK: grep -c "no landmark covers" plugins/flow/agents/plan-reviewer.md
- The never-fix check now covers the plan reviewer.
  CHECK: grep -c "plan-reviewer.md" plugins/flow/scripts/check-invariants.mjs
- METHODOLOGY carries the reasoning, under the heading reserved for it.
  CHECK: grep -c "^## Why a design is a fourth artifact" METHODOLOGY.md
- Standing checks with counts, as FID-1.

## FID-6 — The reviewer sees the design

**Scope.**
- The reviewer's packet, in all four copies, carries the epic's design
  sources, the signed-off design map and the entry's `**Compared:**` table:
  ticket skill step 7, quick skill step 6, the driver's packet body, and the
  Codex review runner's copy that `codex-review.test.mjs` pins to it.
- Review skill: for a ticket with a `COMPARE` criterion, **re-run the differ
  when the project's instruction file says how to serve and drive a page**,
  with removals from the base ref, and compare the result with the entry's
  table; otherwise audit the table against the design source's own markup
  and **say the page was not rendered**. A table the re-run contradicts is
  Important — the worker's table is a claim, and the reviewer is the only
  fresh context that can check it. A reviewer in a sandbox with no network
  (the Codex shadow) never renders, and its packet says so.
- Two new lenses, in the reviewer agent, the review skill and both
  `REVIEWER_RULES` copies. **A `removed` entry added or changed in the
  ticket's own diff is Important**: a removal is a planning decision, and a
  worker who cannot build an element writes a deviation. And **a style
  assertion that reads a property off an element while the page paints
  something else** — an inline style beating the rule under test, an
  assertion on a wrapper while a child paints, a property read at a width
  the test never set: the visual form of the test that executes code
  without checking it.

**Not in scope.** Giving a reviewer write access or a fix instruction. New
agent tools — a reviewer reaches a browser only through what the project's
instruction file already offers its `Bash`. Any parser or driver logic
beyond the packet text.

**Acceptance criteria.**
- The review skill tells the reviewer what to do with the design.
  CHECK: grep -c "Design sources" plugins/flow/skills/review/SKILL.md
- The reviewer agent carries the painted-versus-property lens.
  CHECK: grep -c "paints something else" plugins/flow/agents/ticket-reviewer.md
- The driver's `REVIEWER_RULES` carries it too.
  CHECK: grep -c "paints something else" plugins/flow/workflows/run-epic.mjs
- A self-declared removal is a finding.
  CHECK: grep -c "in the ticket's own diff" plugins/flow/agents/ticket-reviewer.md
- `codex-review.test.mjs` passes with the two packet bodies and the two
  `REVIEWER_RULES` copies equal — report its count under **Verified**; the
  driver parses with CLAUDE.md's `node -e` command.
- Standing checks with counts, as FID-1.
