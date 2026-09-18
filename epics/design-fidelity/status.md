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
