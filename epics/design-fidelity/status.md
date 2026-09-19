# Design fidelity epic — status log

Append-only record of finished tickets. Tickets: `epics/design-fidelity/tickets.md`.

**Rules.** Append only. Corrections are new dated addenda beneath the entry they
correct, never edits. Report counts, not adjectives. The **Owed** line is
required even when empty.

## Baseline — 2026-09-17

**What exists today.** The plugin has no way to name a design. An epic's
preamble has no line for one (`parsePreambleText`, `tickets.mjs:143`, reads
delivery, three model lines, the runner, the shadow reviewer, two glob
lists and the budget); the only machine-read criterion is `CHECK:`/`EXPECT:`
(`:279`); the reviewer's packet — ticket skill step 7, quick step 6, the
driver's packet body (`run-epic.mjs:1227`) and the Codex runner's pinned
copy — is the range, the brief, the ticket's own entry and the instruction
files; the plan reviewer is given `tickets.md`, `context/` and the
instruction files. No script compares anything rendered. The epic skill has
a `demonstrate:` form for behaviour no command reaches, and nothing steers a
UI ticket toward it.

**What is verified, and how.** On `origin/main` at `b96da41` (after PR #50,
the revert check), 2026-09-17: `tickets.test.mjs` 68/68,
`ticket-session-guard.test.mjs` 14/14, `check-invariants.test.mjs` 17/17,
`board.test.mjs` 9/9, `plan-page.test.mjs` 8/8, `run-epic.test.mjs`
120/120, `codex.test.mjs` 21/21, `codex-review.test.mjs` 19/19;
`check-invariants.mjs` exit 0; `tickets.mjs doctor` exit 0. The plan's 25
CHECKs (FID-1 4, FID-2 3, FID-3 4, FID-4 5, FID-5 5, FID-6 4) were each run
with `tickets.mjs check` and each fails on this tree, re-run with the same
result by the second plan review.

**Known risks.** Nothing has yet shown that a page-side extractor can be
made self-contained and useful without the plugin owning a browser; FID-1
is first for that reason, and the plan says what ships if it cannot. FID-1
is the largest ticket in either epic (550–700 lines by the reviewer's
estimate) and carries its own stop-and-split condition. The design map is
the root every comparison rests on: an element no landmark covers is silent
by omission, which FID-5's plan-review lens exists to catch. The extractor's
fixed property set may read as noise on a real page (`width`/`height`
within 0.5px especially); the smoke test records which. Branch protection
on `main` answers 404 "Branch not protected"; the epic runs attended and
relies on no waiver.

**What this epic starts from.** `context/findings.md` (the evidence, both
rounds) and `context/plan-review-2026-09-17.md` (two fresh-context plan
reviews, five blocking findings between them, all accepted). Signed off by
Vadim 2026-09-17. **It does not start until `epics/deviation-routing/` has
reached `main`**: FID-3 writes `**Deviation:**` lines and FID-4's `compared`
subcommand reads the log through the reader DEV-1 adds; FID-1 and FID-2 do
not depend on it. Run attended through `/flow:ticket <ID>` in supervisor
mode — the plugin is not installed in the planning session, and FID-4
changes the driver.

**Addendum — 2026-09-17 — delivery re-planned after sign-off.** The baseline
above says this epic runs attended. Vadim re-planned it the same day ("do
all unattended"): FID-1 runs attended, because its smoke test needs a
browser that no unattended worker holds, and `/flow:run design-fidelity`
takes FID-2 to FID-6. `main` is unprotected (404 from the protection probe,
`[]` from the rulesets probe; the repository is public, so protection is
available and not enabled), and Vadim waived the hard floor in so many
words — "i waive the protection". `tickets.md` carries the decision on its
`Delivery:` and probes paragraphs, which is where the run skill's step 3
reads it. Nothing here starts until `deviation-routing` has reached `main`.

**Addendum — 2026-09-18 — launch.** `deviation-routing` reached `main` in
PR #53 (`5eb2e3c`), with PR #52 before it; Vadim: "PR 53 merged, start
design-fidelity". This branch was refreshed from `main` — no conflict, since
it carried only its own documents. Re-run on the refreshed tree: `doctor`
clean; every CHECK still fails, as it must before its ticket exists — FID-1
0/4, FID-2 0/3, FID-3 0/4, FID-4 0/5, FID-5 0/5, FID-6 0/4, none malformed.
The protection probes answer as they did (404 "Branch not protected", `[]`),
so the waiver of 2026-09-17 stands unchanged. One sentence of `Delivery:` was
false when written and is true now: that an unregistered reviewer type
"fails once and takes the driver's sanctioned fallback". On 2026-09-17 the
hire threw and the fallback was unreachable, which halted
`deviation-routing`'s run (its `runs.md`); PR #52 made a throwing hire a
failed hire, and that fix is in this branch. What this epic now inherits from
the other: a worker that departs from its ticket records a `**Deviation:**`
line, an open one stops an attended merge, and any one halts the run. FID-1
starts attended.

### FID-1 — A zero-dependency fidelity differ — 2026-09-18 — DONE

**Built:** `plugins/flow/scripts/fidelity.mjs` — `extract` prints the source of
one self-contained function expression, `(landmarks, side) => report`, that any
browser the project already has can evaluate on a rendered page; `diff
<design.json> <page.json> --map <design-map.json> [--removed-from <file>]
[--landmarks a,b] [--json]` compares the two reports in pure Node and prints one
row per difference (`missing`, `removed by <by>, <date>`, a declared removal
that is on the page, `absent-in-design`, `order`, `childCount`, and any of the
fixed 19 properties), exiting 0 when nothing differs or only declared removals
do, 1 when anything else does, 2 on a usage error or unreadable input. The
plugin gains no dependency and launches nothing. Fixtures under
`plugins/flow/scripts/fixtures/fidelity/`: two self-contained static pages,
their `design-map.json`, and the two reports a real browser returned from them.
Suite `plugins/flow/scripts/fidelity.test.mjs`; CLAUDE.md, `tests.yml`,
CHANGELOG and METHODOLOGY moved in the same commits. Nothing reads the differ
yet — the `COMPARE` criterion that calls it is FID-3's.

**Mode:** supervisor — worker opus, reviewer hired by the supervisor

**Tokens:** observed by the supervisor — see the review addendum

**Verified:** `node --test plugins/flow/scripts/fidelity.test.mjs` 33/33.
`node plugins/flow/scripts/tickets.mjs check FID-1` **4/4** (grid track list
named and exit 1; a removal honoured only from the signed-off file; the
extractor a standalone function; CI runs the suite). Every suite CLAUDE.md
names, on this branch: `tickets.test.mjs` 110/110,
`ticket-session-guard.test.mjs` 14/14, `check-invariants.test.mjs` 25/25,
`board.test.mjs` 9/9, `plan-page.test.mjs` 8/8, `run-epic.test.mjs` 137/137,
`codex.test.mjs` 21/21, `codex-review.test.mjs` 19/19.
`check-invariants.mjs` exit 0; `tickets.mjs doctor` exit 0; `node --check` exit
0 on `fidelity.mjs` and `tickets.mjs`; `run-epic.mjs` parsed with CLAUDE.md's
`node -e` command, exit 0.
**Revert check:** with both commits reverted (`git revert --no-commit
$(git rev-list --no-merges d1554a1..HEAD)`) and the suite restored from HEAD,
`fidelity.test.mjs` cannot load at all — `not ok 1 -
plugins/flow/scripts/fidelity.test.mjs`, 0 passed — because the module it
imports is gone. That is the weak form for a new file, so each new guard,
branch and error path was flipped in turn and the suite re-run: **27 of 27
mutants killed**, e.g. `<= 0.5` → `=== 0` fails *lengths within 0.5px are equal,
and beyond it are not*; honouring `--map`'s own `removed` list fails *a removed
list inside --map is never honoured*; dropping the document-order sort fails
*order is the position among found landmarks in document order*. Two guards
survived the first pass and are a finding, not a pass: dropping the `--map`
requirement and dropping the unknown-option refusal each still exit 2 by
another path, so only their messages pin them — both refusals are now checked
by message as well as code (commit `029d71e`), and the re-run killed 27/27.
**demonstrate (the smoke test):** the two HTML fixtures were served over
`http://localhost` and opened in the Claude desktop app's built-in browser pane
— Chromium, `Chrome/152.0.7977.76`, macOS, viewport 1280×800, `innerWidth` 1280
on both, devicePixelRatio 2. In each page the printed extractor was evaluated
with `(0,eval)('(' + src + ')')` and called with the fixture map's `landmarks`
and the side; `JSON.stringify(report, null, 2)` was written to
`design.json` / `page.json` byte for byte, with no hand transcription. Observed:
the reports match the documented shape exactly, and the differ on the real pair
prints 19 differences and 1 declared removal, exit 1, including
`grid-template-columns  273.328px 273.336px 273.336px | 426px 426px`. Of the
values written by hand as provisional stand-ins, exactly two moved:
`nav.height` 41px → **40.5px** and the three equal `1fr` tracks
`273.328px 273.328px 273.328px` → **`273.328px 273.336px 273.336px`**. No code
and no expectation had to change against real values.
**Signal or noise, `width`/`height` within 0.5px:** measured, not guessed — no
property in the real pair differs as a string while being equal under the 0.5px
rule, so on one engine in one run the tolerance fires **zero** times and
absorbs no real difference. The sub-pixel arithmetic it exists for is
nonetheless visible inside a single value: a real engine splits three `1fr`
tracks unevenly by 0.008px, and an auto-height landmark reports 40.5px from
font metrics. Read as: the tolerance is **not** hiding signal here, and the
drift it would absorb (a second engine, another devicePixelRatio, another
zoom) is demonstrably the size these values move by. One engine was measured;
cross-engine drift stays unproven and is nobody's owed work — the differ is
run per project on the project's own browser.

**Decisions:** (1) `width`/`height` are read from `getBoundingClientRect` (the
border box a designer measures) and every other property from
`getComputedStyle` — the ticket names both sources without splitting them.
(2) A landmark the page has and the design does not draw is its own row kind,
`absent-in-design`: the ticket enumerates the reverse, and silence about a
`design` selector that matched nothing would be the same "missing by omission"
the epic exists to end. (3) Three things are **notes, not rows**, and so never
change the exit code: `--map` carrying a `removed` list, landmarks that matched
nothing on either side, and two reports taken at different viewport widths —
each says something about the comparison rather than about the page. (4) Giving
the page report in the design slot is refused with exit 2 rather than compared:
it is the likeliest mistake at this door, and read silently it prints every
difference backwards. (5) The table is plain text with no colour, because it is
pasted into a status entry and an escape sequence pasted into a document is
junk a reader cannot clean.

**Deviation:** The ticket's **Size** condition says that if the diff without the
fixtures passes ~450 changed lines, the ticket stops and splits on the seam the
plan review named — `extract`, the HTML fixtures and the smoke test first,
`diff` and the JSON contract second → it was built and committed as **one**
ticket at **837 changed lines without the fixtures** (1,424 with them), because
the named seam would leave the second half at roughly 525 lines, still over the
condition, and Vadim was shown both figures at the stop and answered "accept".

**Owed:** Nothing.

**Addendum — review — 2026-09-18 — opus/default effort:** reviewed by a
fresh-context general agent given `ticket-reviewer.md` and the review skill
(the plugin agent type is not registered in this session). It reproduced the
revert check, ran 15 mutants of its own (15 killed), attacked the `removed`
rule from four directions (a `Removed` key, a nested `removed`, case-different
names, `--removed-from` pointed at a report — all fail closed), checked the
reports' arithmetic (the three tracks sum to 820.0px at 1/64px granularity),
and found scope, project-agnosticism and the Deviation's figures sound.

Fixed, all in `67914c2` (`fidelity.test.mjs` 33 → 39, all passing; each fix
proven by flipping it back and watching the suite go red, 8 of 8): **Important
1** — `console.log(stdout); process.exit(code)` discarded whatever stdout had
not flushed, so a `--json` payload of 221,626 bytes came through a pipe cut at
exactly 65,536, mid-object, with the exit code intact; every sanctioned caller
pipes (the ticket's own criteria use `$(…)` and `| grep`). Now
`process.exitCode`, pinned by a test that diffs 600 landmarks — 1,800 rows,
over 64KiB in both output forms — through a pipe and parses the whole payload.
**Important 2** — `--landmarks ","`, `" "`, `",,"` filtered the comparison to
zero landmarks and printed "no differences", exit 0, which is the pass the
guard beneath them exists to prevent; a value naming no landmark is now
refused, `""` among them, because omitting the flag is how you ask for
everything. **nit 1** — every landmark unmatched on both sides was the same
exit 0 over no evidence; refused as unreadable input. **nit 3** —
`firstFamily` split on commas before quotes, so `"Helvetica, Neue", serif`
compared equal to `Helvetica`, a normalisation hiding a real difference; a
quoted family is now read to its closing quote first. **nit 4** — `a in flags`
walked `Object.prototype`, so a report file named `toString` was swallowed as a
flag; `hasOwnProperty` now. **nit 5** — the honoured removals' source file is
named whenever a removal row prints, not only when `--map` carries a list of
its own, since under the layout the doctrine prefers it never does and a
pasted table showed `removed by …` rows with no provenance. Also fixed, raised
but not reported: a repeated flag is refused instead of last-wins.

Not fixed — **nit 2**, `asRgba` has no CSS named-colour table, so `red` and
`rgb(255, 0, 0)` read as a difference. Declined on two grounds, not on cost
alone: the fixed property set is read from `getComputedStyle`, which returns
`rgb()`/`rgba()` and never a name, so the gap is reachable only from the
hand-written degraded table that FID-3 teaches; and the failure direction is
the safe one — it over-reports a difference that is not one, never hides one,
which is the opposite of nit 3. A partial table (the 16 names one remembers)
would be right for 16 and silently wrong for the other 132, which is the
shape of normalisation this file must not have. Recorded for the retro, and
FID-3 may want it when it writes the degraded form.

Re-verified after the fixes: `fidelity.test.mjs` 39/39; `tickets.mjs check
FID-1` 4/4; `tickets.test.mjs` 110/110, `ticket-session-guard.test.mjs` 14/14,
`check-invariants.test.mjs` 25/25, `board.test.mjs` 9/9, `plan-page.test.mjs`
8/8, `run-epic.test.mjs` 137/137, `codex.test.mjs` 21/21,
`codex-review.test.mjs` 19/19; `check-invariants.mjs` exit 0; `doctor` exit 0;
`node --check plugins/flow/scripts/fidelity.mjs` exit 0. Revert check over the
fix range (`029d71e..HEAD` reverted, tests kept at HEAD): 7 tests fail, one per
fix — *a diff far larger than the pipe buffer arrives whole*, *--landmarks that
names nothing is refused, in every spelling*, *a comparison that compared
nothing is refused, never reported as no differences*, *a flag given twice is
refused, not resolved last-wins*, *a report file named like an
Object.prototype key is a file, not a flag*, *font-family compares its first
family, unquoted and case-insensitively*, *a honoured removal names the file it
was read from, even when --map carries no list*. The 27 guard mutants of the
first pass were re-run on the fixed tree: 27/27 still killed. Worker tokens
(implementation leg): unknown — only the supervisor observes it, and it was not
handed over with the findings; Reviewer tokens: 143,151.

**Addendum — 2026-09-18 — the Size deviation's figures after the review fixes,
and a pre-existing defect handed on.** The Deviation above is unchanged and its
figures are superseded, not corrected: the fixes moved the diff from 837 to
**970 changed lines without the fixtures** (source, suite and documents only,
which is what the 837 counted), or **1,069** with this status log included, and
**1,656** with everything. The departure is the same one — built as one ticket
past the ~450 condition — and remains open for a human.

**Owed:** `plugins/flow/scripts/tickets.mjs` carries the same
`console.log(…)` + `process.exit(n)` pattern that Important 1 fixed here (for
example at its `deviations` and `doctor` exits), so its output is exposed to
the identical silent truncation above ~64KiB; today's boards and ledgers are
far under that. It is **not** for any ticket in this epic — FID-2 to FID-6 must
not fix it, since it is outside every one of their scopes and `tickets.mjs` is
on this epic's consequence paths — and **not** for `/flow:quick` either: a
truncated `check --json` is a payload the unattended driver's merge gate reads,
which is the fail-open shape on the risk list that bars work from the quick
path. It is for this epic's retro to convert into a ticket of its own, with the
measurement above as its evidence.

**Addendum — re-review — 2026-09-18 — opus/default effort:** the same reviewer,
resumed and bounded to the fix range `e294bd3..a787ff2`. **0 Important, 2
nits.** It re-ran every reproduction from the first pass and closed each:
221,626 bytes through a pipe and through `$( )`, the JSON parsing at 1,600
rows; all six empty `--landmarks` spellings exit 2; all-unfound exits 2; a
comma-inside-quotes family now compares unequal; `toString x` is refused; the
provenance note prints; a repeated flag is refused. The exit contract is
otherwise intact, the `--json` shape unchanged, error paths print in full and
leave no lingering handle, and `| head -1` on a 62KB table produces no EPIPE
noise now that `process.exit` is gone. Seven first-pass mutants re-run, all
killed. The nit 2 decline (no CSS named-colour table) was judged sound, and the
owed item reads correctly through `brief FID-3`. Tokens: reviewer 183,335
cumulative, so this leg is about 40,184; worker legs as the supervisor observed
them, cumulative — 168,622 after the build, 193,852 after the smoke test and
entry, 234,642 after the review disposition.

**Nit 1 — the disposition's "8 of 8" was wrong, and is corrected here.**
Reverting `process.exitCode = 2` to `process.exit(2)` in the **error** path
left the suite green: seven fixes were pinned, not eight, and the enumerated
list in the addendum above names seven. It is pinned now, in `28a252b`: a
`--landmarks` refusal naming 7,000 unknown landmarks writes about 76KiB to
stderr, and the test asserts the tail arrived rather than the first 64KiB —
red with `process.exit(2)` restored. `fidelity.test.mjs` 39 → **40**, CLAUDE.md
with it. So "8 of 8" is true at HEAD and was not true when it was written.

**Nit 2 — the first Deviation's figures are stale, and the line cannot be
edited.** It records 837 / 1,424; the fixes moved the diff twice since. At
`67914c2` the figures were 970 / 1,069 / 1,656 and at HEAD they are **980
changed lines** for source, suite and documents — the like-for-like successor
of the 837 — **1,163** with this status log included, and **1,750** with the
fixtures. The "1,738" reported after the disposition was the whole-diff figure
measured one commit later than the two figures quoted beside it; this paragraph
is the correction. Whoever closes the departure should read 980, not 837.

**Deviation:** The ticket's exit contract shows three outcomes — "Exit 0 when
the only rows are declared removals, 1 when anything else differs, 2 on a usage
error or unreadable input" — so a run whose two reports parse, whose map
validates, and whose selected landmarks are absent on **both** sides yields no
rows and exits 0 → `fidelity.mjs` exits **2** on that run instead, refusing it
as unreadable input with "nothing was compared", because "no differences" over
zero landmarks compared is a pass nobody earned, and a silent pass is the
failure this differ exists to end. It was built in answer to a review finding,
after the ticket's criteria were written, and it is right on the merits; it is
recorded as a departure because it is outside the letter of the contract that
FID-3's verify step and FID-6's re-run will be written against, and prose in an
addendum is invisible to `tickets.mjs deviations`.

**Owed:** FID-3 — carry the amended exit contract into the `COMPARE` verify
step, and decide the one case the refusal above gets wrong. A landmark that is
declared removed **and** absent from the artboard too (the designer dropped it
as well), selected alone through `--landmarks`, exits 2 with a recovery message
that does not fit, while the same pair over the whole map exits 0 with a note —
the two sides agree, and the differ calls it unreadable. The realistic shape is
`COMPARE … @ 1440,393` with a `LANDMARKS:` subset of breakpoint-specific
landmarks, run at the width where neither side draws them. Two ways out were
suggested by the reviewer and neither is chosen here: refuse only when nothing
matched **and** the unmatched set is the whole map; or give the
both-sides-agree case its own message and exit code. FID-3 owns the decision
because it is the ticket that teaches the contract, and changing it now would
be redesigning a gate after its review.

### FID-2 — The `Design sources:` declaration — 2026-09-18 — DONE

**Built:** `tickets.mjs` parses a `Design sources: <path>[, <path>]` preamble
line with its **own** list reader — the whole text between commas is the path, so
`designs/City Desktop.html` survives whole, where `grabPathList`'s first-word
parse would hand every reader `designs/City` — and exposes it as `designSources`
on `find`/`brief`/`list --json`, read from the ref under `find --from` like every
other declaration, beside `designMap` (the absolute path of
`epics/<name>/design-map.json` when it exists, else null). `doctor` gained the
label in its declaration near-miss scan and a warning naming a declared path that
does not exist, in full. The epic skill's configuration block and README's table
teach the line; METHODOLOGY § "Why an epic declares its design sources" carries
the reasoning; CHANGELOG under `## Unreleased`. Nothing reads the declaration yet
— `COMPARE` is FID-3's, the two reviewers' packets are FID-5's and FID-6's.

**Mode:** direct — built in-session on `epic/design-fidelity` at the repository
owner's instruction ("done directly, without the Ticket Flow ceremony"), with no
per-ticket review; one review of the whole FID-2…FID-6 range follows.

**Tokens:** unknown — in-session.

**Verified:** `tickets.mjs check FID-2` **3/3**. `tickets.test.mjs` 110 → **113**
(the declaration's whole-path parse and the two exposures; doctor's missing-path
warning and near-miss; `find --from` reading the line from a ref while the map
path stays a working-tree fact). Every other suite CLAUDE.md names, unchanged:
`ticket-session-guard.test.mjs` 14/14, `check-invariants.test.mjs` 25/25,
`board.test.mjs` 9/9, `plan-page.test.mjs` 8/8, `fidelity.test.mjs` 40/40,
`run-epic.test.mjs` 137/137, `codex.test.mjs` 21/21,
`codex-review.test.mjs` 19/19. `check-invariants.mjs` exit 0; `doctor` exit 0;
`node --check plugins/flow/scripts/tickets.mjs` exit 0.
**Revert check:** with `tickets.mjs` restored from HEAD and the suite kept, 9
tests fail — among them the three new ones (*a Design sources line keeps each
whole path, spaces and all*; *doctor warns about a declared design source that
does not exist*; *find --from reads Design sources from the ref*). Each new guard
was then flipped in turn: parsing the line with `grabPathList` kills 3 tests,
dropping the missing-path warning kills 1, dropping the label from `declNear`
kills 1.
**demonstrate:** a throwaway epic at `<scratch>/fid2-demo` declaring
`Design sources: designs/City Desktop.html, designs/map.html` with only
`designs/map.html` present → `find DM-1 --json` printed
`"designSources": ["designs/City Desktop.html", "designs/map.html"]`, both paths
whole; `doctor` printed `! demo: declared design source "designs/City
Desktop.html" does not exist (looked for …/designs/City Desktop.html) — every
reader of this epic is handed a path to nothing; fix the path, or drop it from
the "Design sources:" line`, and said nothing about `map.html`.

**Decisions:** (1) `designSources` joins `list --json`'s `modes` map as well as
`find`/`brief`, because that map is where the run skill reads an epic's
configuration and it would otherwise be the only declaration line missing from
it. (2) `designMap` is derived from the folder, not declared, and is left alone
by `--from`: the declarations come from the ref, the paths describe the
repository as it is now. (3) A declared path is resolved against the repository
root (an absolute path is taken as given), since the line lives in a versioned
document.

**Owed:** Nothing.

### FID-3 — The `COMPARE` criterion — 2026-09-18 — DONE

**Built:** `tickets.mjs` parses `COMPARE: <design source path> @ <width>[,<width>]`
indented under its criterion bullet, with an optional `LANDMARKS: <name>[, <name>]`
beneath it (absent = every landmark in the map = the whole page), and `check <ID>`
reports them in a separate `compares` list marked *manual — run the differ, table
required in the entry*, in **neither `total` nor `passed`**. A malformed one — no
width, a path the epic's `Design sources:` line does not list, a `LANDMARKS:` with
no `COMPARE:` above it — is a ledger problem that fails `allPassed`, exactly as a
malformed CHECK does; doctor's near-miss scan covers both new labels. The epic
skill teaches the format, the design map and that its `removed` list is
planning's; the ticket skill's step 5 and the quick skill's step 5 run the differ
with `--removed-from` filled from the signed-off ref, and step 6's entry template
gains the optional `**Compared:**` field. `check-invariants.mjs` gained a check
holding the epic template to the parser's `COMPARE_LINE`/`LANDMARKS_LINE` and both
lanes to `--removed-from`, plus a presence phrase across the four documents.
CLAUDE.md's criterion invariant now names `COMPARE` and records the one sanctioned
format-ahead-of-gate departure with the two conditions that make it safe.

**Mode:** direct — built in-session on `epic/design-fidelity` at the repository
owner's instruction, with no per-ticket review; one review of the whole
FID-2…FID-6 range follows.

**Tokens:** unknown — in-session.

**Verified:** `tickets.mjs check FID-3` **4/4**. `tickets.test.mjs` 113 → **118**
(the ledger's separate list and its shape; a COMPARE with no LANDMARKS; the three
malformed shapes; the doctor near-miss; `check --from` validating the path against
the same ref's declarations). `fidelity.test.mjs` 40 → **43**;
`check-invariants.test.mjs` 25 → **29**. Unchanged:
`ticket-session-guard.test.mjs` 14/14, `board.test.mjs` 9/9,
`plan-page.test.mjs` 8/8, `run-epic.test.mjs` 137/137, `codex.test.mjs` 21/21,
`codex-review.test.mjs` 19/19. `check-invariants.mjs` exit 0; `doctor` exit 0;
`node --check` exit 0 on `tickets.mjs`, `fidelity.mjs` and `check-invariants.mjs`.
**Revert check:** with the six changed source files restored from HEAD and every
suite kept, 5 tickets tests, 2 fidelity tests and 4 invariant tests fail — one per
new behaviour. Each new guard was then flipped in turn: counting comparisons in
`total` kills 2, accepting a malformed COMPARE kills 3, dropping the `--from`
re-read of the declarations kills 1, ignoring an orphan `LANDMARKS:` kills 6.
**demonstrate:** a throwaway epic at `<scratch>/fid3-demo` declaring
`Design sources: designs/City Desktop.html`. `check DC-1 --json` printed
`"total": 0`, `"allPassed": true` and one `compares` entry — source
`designs/City Desktop.html` (the space intact), `widths [1440, 393]`, `landmarks
["hero","nav"]`, `status "manual"`. `check DC-2 --json` (a `COMPARE:` with no
width) printed `"allPassed": false`, `compares: []` and one problem, *COMPARE with
no "@ <width>"*. `doctor` flagged both DC-2 and DC-3's `Compare:` line — *looks
like a CHECK/EXPECT/COMPARE/LANDMARKS line but will not parse, so it silently
never runs*.

**Resolves owed:** FID-1.2 — the amended exit contract is carried into the verify
step in both lanes (0 = nothing differs or only declared removals; 1 = a
difference; **2 = nothing was compared, never "no differences"**, with the repair
named), and the both-sides-agree case is decided in `fidelity.mjs`: a landmark the
**signed-off** list declares removed and absent from both reports is now a row of
its own kind, `removed-absent`, counted as compared and exiting 0.

**Decisions:** (1) Of the reviewer's two ways out, the second — *give the
both-sides-agree case its own message* — is taken, and its *own exit code* half is
rejected: the contract has three outcomes, FID-3's skills and FID-6's re-run are
written against them, and a fourth code would make every reader learn a code for
one case when exit 0 already means "the only rows are declared removals". The
first way out (refuse only when the unmatched set is the whole map) is rejected on
the merits: under `--landmarks` the unmatched set is never the whole map, so a
selection matching nothing would print "no differences — 0 landmarks compared",
which is the silent pass the guard exists to prevent. (2) The agreement is a
**row**, not a note: one rule — every declared removal in the selected set prints
`removed by <by>, <date>` — and the design column (`present` vs `absent`) says
which of the two states it is. (3) `COMPARE`'s path is everything before the
**last** `@`, because a design path may contain spaces and an `@`
(`assets/@2x/hero.html`). (4) A COMPARE naming a path the epic does not declare is
malformed, not merely odd: the declaration is what hands the design to both
reviewers, so a comparison against an undeclared file is one nobody else can open.
(5) Under `check --from`, the `Design sources:` line is read from that same ref, so
a branch cannot anchor a comparison the signed-off document does not declare.

**Owed:** Nothing.

### FID-4 — A missing comparison stops the merge, at every door — 2026-09-18 — DONE

**Built:** `tickets.mjs compared <ID> [--log-from <ref>] [--json]` counts the
`**Compared:**` fields under a ticket's **own** entries, addenda included, through
a status-log reader now shared with `deviations` — so the rule that an unreadable
log is a nonzero exit and never a count of 0 holds at both doors by construction.
The driver's `ACCEPT_SCHEMA` gained `compares` (how many `COMPARE` criteria the
signed-off section carries) and `RESOLVE_SCHEMA` gained `compared` as FACT 5 (the
fix-bounds facts move to FACT 6); the two meet in code at the resolve step, before
any agent that could merge exists, and a ticket that owes a comparison and records
none halts on the **acceptance-check** condition, whose pinned sentence gained one
clause in all five files that carry it. A `compares` or `compared` fact that is
missing, wrong-typed or about another ticket is refused and halts. The attended
doors move with it: ticket skill step 9 names such a ticket in the summary and the
pull request body, step 10 refuses to integrate it, and quick skill step 7 names
it in the body — with the same two recoveries, each leaving a record.

**Mode:** direct — built in-session on `epic/design-fidelity` at the repository
owner's instruction, with no per-ticket review; one review of the whole
FID-2…FID-6 range follows.

**Tokens:** unknown — in-session.

**Verified:** `tickets.mjs check FID-4` **5/5**. `tickets.test.mjs` 118 → **121**
(the count narrowed to the ticket's own entries; a table under another ticket
never counted; `--log-from` on a pushed branch, and the unreadable-log refusal).
`run-epic.test.mjs` 137 → **143** — the new tests are *a COMPARE criterion whose
pushed entry records no comparison halts before any merge agent exists*, *a
COMPARE ticket whose entry records the comparison merges like any other*, *a
ticket with no COMPARE criterion is untouched by the gate*, *an acceptance report
with no compares count is unreadable evidence and halts*, *a compared fact that is
missing, wrong-typed, about another ticket, or unreadable halts* (six cases), and
*the resolve prompt asks for the comparison count with its own command and flag*.
`check-invariants.test.mjs` 29 → **30** (both documents dropping the new clause).
Unchanged: `ticket-session-guard.test.mjs` 14/14, `board.test.mjs` 9/9,
`plan-page.test.mjs` 8/8, `fidelity.test.mjs` 43/43, `codex.test.mjs` 21/21,
`codex-review.test.mjs` 19/19. `check-invariants.mjs` exit 0; `doctor` exit 0;
`node --check` exit 0 on `tickets.mjs` and `check-invariants.mjs`; `run-epic.mjs`
parsed with CLAUDE.md's `node -e` command, exit 0.
**Revert check:** with the six changed source files restored from HEAD and the
suites kept, 3 tickets tests, 9 driver tests and 1 invariant test fail. Each new
guard was then flipped in turn: removing the gate branch kills the halt test;
reading an unreadable `compared` as 0 kills the refusal test; defaulting a missing
`compares` to 0 kills its test; dropping the narrowing to the ticket's own entries
kills all three `compared` tests.

**Decisions:** (1) The gate fires at the **resolve** step rather than the
acceptance step, because that is where both facts are in hand — the ledger's
`compares` is read at acceptance, the entry's `compared` at resolve — and it still
runs before any agent that could merge exists. It carries the acceptance-check
stop string all the same: one class, one string, so a retro reading the halt files
it correctly. (2) The count is not judged: one table answers any number of
`COMPARE` criteria, because whether a table is *right* is the reviewer's, who can
re-run the differ, and whether it exists is the only thing a merge can hold.
(3) `deviations` was refactored onto the shared log reader rather than having
`compared` grow a second copy — the rule about an unreadable log is the same rule.
(4) No doctor near-miss scan for a mis-spelled `**Compared:**` label: unlike a
deviation near-miss, this one fails **closed** — a label the parser misses counts
0 and halts the run — so the silent direction the near-miss scans exist for is not
reachable here. Worth a look from a reviewer.

**Owed:** Nothing.

### FID-5 — The plan side: one ticket owns the whole page — 2026-09-18 — DONE

**Built:** The epic skill's step 3 gained two rules — an epic that declares
`Design sources:` **ends with one whole-page fidelity ticket** (a `COMPARE` with
no `LANDMARKS:` per design source, at every width the design draws, and a
human-owned ticket before the release where the declared lane holds no browser),
and a ground rule or scope line that **narrows what the design draws declares the
removal** in `design-map.json`'s `removed` list with the element, the rule and the
date. Step 4 hands the plan reviewer the design sources and the map; step 5 shows
the `removed` list at sign-off and names any UI-building ticket with no `COMPARE`
as not ready. `plan-reviewer.md` gained the five lenses only a reviewer holding
the drawing can apply, the third of them the one nobody downstream can perform —
an element the design draws that **no landmark covers**. `check-invariants.mjs`
now reads `agents/plan-reviewer.md`: it joins `FILES` and the
"reviewers report and never fix" phrase check, whose alternation absorbs the one
deliberate wording difference (the ticket reviewer never fixes a diff, the plan
reviewer never rewrites a plan). METHODOLOGY § "Why a design is a fourth artifact"
and README's command and documents tables carry the reasoning and the map.

**Mode:** direct — built in-session on `epic/design-fidelity` at the repository
owner's instruction, with no per-ticket review; one review of the whole
FID-2…FID-6 range follows.

**Tokens:** unknown — in-session.

**Verified:** `tickets.mjs check FID-5` **5/5**. `check-invariants.test.mjs`
30 → **31** (*the plan reviewer gaining a write instruction fails the never-fix
check*). Every other suite unchanged: `tickets.test.mjs` 121/121,
`ticket-session-guard.test.mjs` 14/14, `board.test.mjs` 9/9,
`plan-page.test.mjs` 8/8, `fidelity.test.mjs` 43/43, `run-epic.test.mjs` 143/143,
`codex.test.mjs` 21/21, `codex-review.test.mjs` 19/19. `check-invariants.mjs`
exit 0; `doctor` exit 0; `node --check plugins/flow/scripts/check-invariants.mjs`
exit 0.
**Revert check:** with `check-invariants.mjs`, `plan-reviewer.md` and the epic
skill restored from HEAD and the suite kept, the new test fails. Both new guards
were flipped in turn: dropping `planReviewer` from the phrase's file list kills
it, and dropping the `report. You never rewrite` alternation turns the intact repo
red (14 tests) — which is the honest shape of a presence check whose regex is
shared.

**Decisions:** (1) The never-fix phrase gained an alternation rather than
`plan-reviewer.md` gaining the ticket reviewer's wording: the two definitions
forbid different writes — a diff and a plan — and rewording one to match the
other's regex would make the document worse to serve the check. (2) The
whole-page rule and the removal rule are **planning rules** in the epic skill, not
code: "a UI-building ticket" is not something a parser can detect, which is why
FID-5 adds no gate and the plan reviewer carries the judgment.

**Owed:** Nothing.

### FID-6 — The reviewer sees the design — 2026-09-18 — DONE

**Built:** The reviewer's packet carries the epic's design sources, the
**signed-off** design map (`git show origin/<base>:epics/<name>/design-map.json`,
never the working tree's copy) and the entry's `**Compared:**` table, in all four
copies — ticket skill step 7, quick skill step 6, the driver's `packetBody` and
the Codex runner's copy, which `codex-review.test.mjs` pins to it verbatim. The
review skill gained § 3b: re-run the differ when the project's instruction file
says how to serve and drive a page (a table the re-run contradicts is
**Important**), and otherwise audit the table against the design source's own
markup and **say the page was not rendered** — with the differ's re-run stated as
a read, since reviewers report and never fix. The Codex shadow reviewer's prompt
now says it cannot serve or render a page, so its audit says so too. Two lenses
joined the reviewer agent, the review skill and both `REVIEWER_RULES` copies: a
`removed` entry added or changed **in the ticket's own diff** is Important, and a
style assertion that reads a property off an element **while the page paints
something else**. `check-invariants.mjs` pins both across the three documents it
reads; the fourth is held by the runner suite.

**Mode:** direct — built in-session on `epic/design-fidelity` at the repository
owner's instruction, with no per-ticket review; one review of the whole
FID-2…FID-6 range follows.

**Tokens:** unknown — in-session.

**Verified:** `tickets.mjs check FID-6` **4/4**. `codex-review.test.mjs`
19 → **20** (*the prompt says the sandbox cannot render a page, so a fidelity
table is audited and said to be unrendered*), with its existing
packet-body/reviewer-rules equality test now covering the new text.
`check-invariants.test.mjs` 31 → **32** (*a reviewer document dropping either
design lens fails*, six cases). Unchanged: `tickets.test.mjs` 121/121,
`ticket-session-guard.test.mjs` 14/14, `board.test.mjs` 9/9,
`plan-page.test.mjs` 8/8, `fidelity.test.mjs` 43/43, `run-epic.test.mjs` 143/143,
`codex.test.mjs` 21/21. `check-invariants.mjs` exit 0; `doctor` exit 0;
`node --check` exit 0 on `tickets.mjs`, `fidelity.mjs`, `check-invariants.mjs` and
`runners/codex-review.mjs`; `run-epic.mjs` parsed with CLAUDE.md's `node -e`
command, exit 0.
**Revert check:** with the seven changed source files restored from HEAD and the
suites kept, both new tests fail. Each pinned copy was then flipped in turn:
dropping one lens from the runner's `REVIEWER_RULES`, and dropping the design
bullet from the runner's packet body, each turn the driver-equality test red —
which is the guard that keeps the two packets one.

**Decisions:** (1) The packet's new bullet names the design map by
`origin/epic/<name>` rather than a fetched ref, so the Codex runner's offline
sandbox can still read it — `git show` of a local remote-tracking ref needs no
network. (2) The design sources themselves are not re-listed in the packet: the
`brief` the packet already names prints the epic preamble, which carries the
`Design sources:` line, and a second copy is a second thing to drift.

**Owed:** Nothing.

**Addendum — 2026-09-19 — one review of the directly built range, and its fixes**

FID-2 to FID-6 were built directly at Vadim's instruction ("also the tickets in
the epic - build them directly"), with one fresh-context review of
`a4ef91b..c0d0b9d` and of `f25f270` in place of five (opus/default effort,
223,140 tokens; builder 490,232). **3 Important, 4 nits, 1 pre-existing; all
three Important and all four nits fixed in the commit that carries this
addendum.** Important 1: the accept prompt never named `compares` while the
driver refused a report without it — every ticket of every epic would have
halted on a proxy that reported what it was asked; the prompt names it, and a
new driver test holds the prompt to every field the gate requires. Important
2: the case-blind near-miss scan failed the gate of a ticket whose bullet
began "Compare:" in prose (exit 0 before the range, exit 1 after) — now
capitals, or a lowercase `compare:` carrying ` @ `; a new test, seen red with
the old regexes (121/1), pins the prose case. Important 3: `f25f270` had left
"that no agent may write" in the run skill and README beside its own rewrite —
both now say "decide". Nits: the epic skill's missing degraded form; the
differ's refusal dropping the `--removed-from` repair; a driver assertion that
accepted either fact count (now `report five facts`); one stale "the human's
line" in step 10. Pre-existing, left with the reversal record: `fidelity.mjs`
does not refuse `--removed-from` naming the same file as `--map`; mitigated by
the provenance note and FID-6's reviewer lens. The review found the FID-4
consequence path failing closed everywhere it pushed, `removed-absent` not
abusable into a silent pass, and the unattended deviation rule intact. After
the fixes: tickets 122, fidelity 43, check-invariants 32, run-epic 144, codex
21, codex-review 20, session-guard 14, board 9, plan-page 8, all `# fail 0`;
`check-invariants.mjs`, `doctor`, both syntax checks exit 0; `check` FID-1 to
FID-6 all pass. No re-review of these fixes was run — the release pull request
is where they are read.

**Addendum — 2026-09-19 — FID-1's deviations closed**

**Deviations closed:** FID-1.1, FID-1.2 — both accepted: "FID-1's two deviation lines are still open in the log - close the deviations"; Vadim; 2026-09-19 — recorded by the session from Vadim's answer

He had been shown both in plain words: FID-1.1, built as one ticket at 980
changed lines against a "split past ~450" condition ("accept", then "size
overrun is fine"); FID-1.2, exit 2 when nothing was compared where the ticket
said exit 0, with the re-review's verdict "right on the merits and outside the
letter of the ticket". FID-3 has since resolved the rough edge FID-1.2 left.

**Addendum — 2026-09-19 — re-review of the review fixes**

Vadim asked for it ("do quick re-review, use fable"): a fresh-context reviewer
on `7fa57d2`, 83,124 tokens. **1 Important, 4 nits, all fixed in the commit
that carries this addendum.** Important: the supervisor's narrowing of the
`COMPARE`/`LANDMARKS` near-miss scan failed open — `- Compare: a.html @ 1440`
as its own bullet (a bulleted line never reaches `CHECK_NEAR`, and
`CHECK_BULLET_NEAR` had no comparison-shaped alternative), `Compare: a.html
@1440` (the shape test demanded whitespace after `@`), and their lowercase
forms all read `compares: 0, problems: 0, allPassed: true`, so a ticket owing
a comparison owed none and FID-4's gate had nothing to fire on. Both regexes
now share one comparison-shaped alternative (`compare:` in any case with an
`@` followed by a digit); a new test drives six spellings through
`check --json` and was seen red against `7fa57d2`'s script (122/1). Left
unflagged, knowingly: a lowercase `compare: <path>` with no `@` at all, which
is indistinguishable from prose — the reviewer called it a judgment call and
this is the judgment. No CHECK/EXPECT near-miss regressed (nine shapes
compared before and after). Nits: the doctor test covered half its name (the
new test covers a `LANDMARKS` near-miss and the fail-open shapes); one more
stale "only a human may write that line" in ticket skill step 9, now
"decide"; the differ's `--removed-from` hint was keyed to a substring of a
note and had no test — now keyed to the facts (`removed` in `--map`, no
`--removed-from`) and tested, red against `c0d0b9d`'s script (42/1); the
accept prompt's exit-1 list now names COMPARE/LANDMARKS. The reviewer
confirmed the unattended rule untouched and the `compares` prompt clause
pinned (143/1 with it removed). After: tickets 123, fidelity 43,
check-invariants 32, run-epic 144, codex 21, codex-review 20, session-guard
14, board 9, plan-page 8; `check-invariants.mjs`, `doctor`, syntax checks
exit 0; `check` FID-1 to FID-6 pass.
