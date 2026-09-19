# Retro-lessons epic — status log

Append-only record of finished tickets. Tickets: `epics/retro-lessons/tickets.md`.

**Rules.** Append only. Corrections are new dated addenda beneath the entry they
correct, never edits. Report counts, not adjectives. The **Owed** line is
required even when empty.

## Baseline — 2026-09-19

**What exists today** (`main` at `0e4e714`, after the `design-fidelity`
release #54). No prompt in `workflows/run-epic.mjs` carries a staging rule —
zero occurrences of `git add` or `commit -a` in the file — while the ticket
and quick skills tell an in-session doer never to `git add -A`. The
fix-bounds facts ride the resolve step only when `boundsGated`
(`run-epic.mjs` ~1974), which is false at the consequence tier; a fix file
outside `reviewedFiles` trips the gate and buys a bounded re-review. A
disposition that returns no report halts at ~1638 without the branch being
read. `parseSpend` (`tickets.mjs` ~1174) keeps the last figure per role in an
entry; `RUN_GROUP` is used at three sites (~1216, ~1222, ~1275). Nothing
derives commits on an epic branch that name no ticket. There is no `owed`
subcommand — `brief` prints the epic-wide list `parseOwed` computes. The run
skill's step 7 runs only on `outcome: "completed"` and its body lists
pre-existing findings and deploy preconditions but not the Owed ledger; step
1 refuses a board with an ABANDONED ticket, which reads `blocked`.

**Verified, 2026-09-19.** `tickets.test.mjs` 123 pass / 0 fail;
`run-epic.test.mjs` 144 / 0; `check-invariants.test.mjs` 32 / 0;
`fidelity.test.mjs` 43 / 0; `codex.test.mjs` 21 / 0; `codex-review.test.mjs`
20 / 0; `ticket-session-guard.test.mjs` 14 / 0; `board.test.mjs` 9 / 0;
`plan-page.test.mjs` 8 / 0. `check-invariants.mjs` and `tickets.mjs doctor`
exit 0. All 18 CHECKs in `tickets.md` proven red with `tickets.mjs check
RETRO-<n>`, by the planning session and again by the plan reviewer.

**Known risks.** `main` is unprotected and the waiver is recorded in
`tickets.md`. The plugin is not installed in this repository's own checkout,
so an unattended run here pays one failed `flow:ticket-reviewer` hire per
review and takes the sanctioned fallback. RETRO-1 and RETRO-2 edit the driver
this epic's run is launched from; the script is read once at launch, so this
run is not governed by the gates it builds. Measured at planning: `node
--test --test-name-pattern` prints `# pass 1` for a pattern matching nothing
(Node 22.19), which is why no CHECK here expects fewer than two.

**Plan review, 2026-09-19** (fresh-context, opus, hired by the agent
definition): six blocking findings, all fixed in the draft before sign-off,
none rejected; five nits, all taken. Sign-off by Vadim the same day —
"waive, ok, approved": protection waived, seven tickets accepted, plan
approved.

## How this epic was run — 2026-09-19

Not by `/flow:run`. After sign-off Vadim chose "run direct, no flow, with
fresh reviewer": one session implemented all seven tickets in order, one
commit each on `epic/retro-lessons` (no ticket branches, no per-ticket worker,
reviewer or disposition), and **one fresh-context review** (opus, hired by the
reviewer definition and the review skill, report-only) then read the whole
range `origin/main...origin/epic/retro-lessons`. The entries below are written
after that review, by the implementing session — which is why each
**Verified** line's revert check cites the reviewer's own mutation run rather
than the doer's word. No entry carries a token figure: nothing metered an
in-session lane, and `unknown` is the honest reading.

### RETRO-1 — No agent sweeps the working tree — 2026-09-19 — DONE

**Built:** `STAGING_RULE` in the worker and disposition prompts; a read-only
`fix-added:<ID>` step at every tier, before any re-review, and
`STOP.fixAddedFiles`; the run skill's step 5 bullet with its recovery; the
invariant pin; README, METHODOLOGY § "The one trip that halts again".
Commit `fc61d0a`, amended by the review fixes below.

**Mode:** direct — in-session, no worker or reviewer agent (see above).

**Tokens:** unknown

**Verified:** `run-epic.test.mjs` 153 pass / 0 fail at the commit (163 after
the review fixes); `check RETRO-1` 3/3; `check-invariants.mjs` exit 0. Revert
check, run by the reviewer in a scratch copy: deleting the whole e2 block
fails 4 of the 6 `added files` tests; deleting the finding-files `concat`
fails 1; deleting `STAGING_RULE` from the disposition prompt fails 2 of 3
`staging rule` tests.

**Decisions:** the driver already holds the reviewed file list (`tier-facts`),
so the new step reads one fact only — what the fix commits added. The Codex
worker runner was checked and left alone (it refuses an unclean tree,
untracked files included).

**Owed:** Nothing.

### RETRO-2 — A disposition that landed is read as landed — 2026-09-19 — DONE

**Built:** a read-only `disposition-facts:<ID>` step when the disposition
returns no report; the recovered path (consequence-tier bounded re-review,
handed the first review's findings; Important findings with no code commit
halt); `dispositionRecovered` on the record; run skill steps 5 and 7;
METHODOLOGY § "A missing report is not a missing fact". Commit `15d44ad`.

**Mode:** direct — in-session, no worker or reviewer agent.

**Tokens:** unknown

**Verified:** `run-epic.test.mjs` 158 / 0 at the commit; `check RETRO-2` 2/2.
Revert check (reviewer's run): removing `|| recovered` from `needsReReview`
fails 3 of 5 `recovered disposition` tests; removing the findings block from
the recovered re-review prompt fails 1.

**Decisions:** `boundedReReview` was not hoisted — the recovery only sets a
flag the existing call site reads, so the closure stays where it was. A
disposition that *reports* `failed` still halts as before; only a missing
report is read from the branch. No anchor: the old halt.

**Owed:** Nothing.

### RETRO-3 — Unticketed commits show on the board — 2026-09-19 — DONE

**Built:** `unticketedCommits()` in `tickets.mjs`; the board line, the
`unticketed` map in `list --json`, the doctor warn for commits naming neither
ticket nor epic; ticket skill step 10, run skill "Resuming after a halt",
README, METHODOLOGY § "Why state is derived". Commit `1ca9701`.

**Mode:** direct — in-session, no worker or reviewer agent.

**Tokens:** unknown

**Verified:** `tickets.test.mjs` 128 / 0 at the commit; `check RETRO-3` 2/2;
`doctor` exit 0 with no warn on this repository. Revert check (reviewer's
run): dropping `--no-merges` fails 3 of 5 `unticketed` tests, dropping the
`epics` exclusion fails 3, dropping the epic-level filter in doctor fails 1.
Demonstrated on this repository, 2026-09-19, before the review fixes:
`tickets.mjs list retro-lessons` printed seven `integrated` rows and **no**
unticketed line — every commit carried an ID. After the review-fix commit
below (subjected `retro-lessons: …`) it prints `1 unticketed commit on
epic/retro-lessons (1 subjected "retro-lessons: …")` and doctor stays silent,
which is the epic-level case working as planned.

**Owed:** Nothing.

### RETRO-4 — The release body is built from the log, at either door — 2026-09-19 — DONE

**Built:** `tickets.mjs owed <epic> [--json]`; run skill step 7's `## Owed`
and `## Unticketed commits` sections and its second door (executable without
a run result); ticket skill step 10 and the resume section name both routes;
two driver tests pinning that an epic with nothing left to start completes
with only the refresh hired. Commit `57ec88a`.

**Mode:** direct — in-session, no worker or reviewer agent.

**Tokens:** unknown

**Verified:** `tickets.test.mjs` 132 / 0 and `run-epic.test.mjs` 160 / 0 at
the commit; `check RETRO-4` 3/3. Revert check, run in a scratch copy: with the `case
'owed'` block removed, 4 of 4 `owed command` tests fail; the two `nothing left to start` tests pin behaviour that
already existed and so have no source change to revert — `revert check: n/a`
for those two, by construction.

**Owed:** Nothing.

### RETRO-5 — Spend sums review rounds — 2026-09-19 — DONE

**Built:** `round=<n>` in `RUN_GROUP` (its three uses move together) and
`ENTRY_ROUND`; rounds summed at the end of `parseSpend`; the repeated-figure
and mixed-label doctor warns; `rounds` in `spend --json`; the ticket, run and
spend skills; METHODOLOGY § "Why a round has a label, and a correction does
not". Commit `0256f79`.

**Mode:** direct — in-session, no worker or reviewer agent.

**Tokens:** unknown

**Verified:** `tickets.test.mjs` 139 / 0 at the commit; `check RETRO-5` 3/3.
The reviewer diffed `spend` between `origin/main`'s script and the branch's
over every epic in this repository: identical text, and `--json` identical
once the new `rounds` field is stripped — no existing total moved. Revert
check (reviewer's run): removing `round=` from `RUN_GROUP` fails 1 of 5
`spend rounds` tests, removing the `ENTRY_ROUND` loop fails 3, summing →
last-wins fails 3; removing the repeat detector or blinding `CORRECTION_MARK`
each fail 1 of 2 `repeated figure` tests.

**Owed:** Nothing.

### RETRO-6 — A name-pattern CHECK that expects `# pass 1` is vacuous — 2026-09-19 — DONE

**Built:** the vacuous-shape problem in `parseChecks` (so doctor warns and
`check` fails its gate); the epic skill's paragraph; METHODOLOGY. Commit
`8cb1a29`.

**Mode:** direct — in-session, no worker or reviewer agent.

**Tokens:** unknown

**Verified:** `tickets.test.mjs` 142 / 0; `check RETRO-6` 2/2; `doctor` exit
0 — no epic here carries the shape. Revert check (reviewer's run): deleting
the check fails 2 of 3 `vacuous pass count` tests.

**Decisions:** the check sits where EXPECT attaches to its CHECK rather than
in `checkShapeProblems`, because the shape is a property of the pair, not of
the command.

**Owed:** Nothing.

### RETRO-7 — Three lenses from the retro — 2026-09-19 — DONE

**Built:** the fixture question in the reviewer agent, the review skill and
both `REVIEWER_RULES` copies; the human render-and-read ticket in the epic
skill and the plan reviewer (the whole-page ticket is now "last among the
tickets that build"); the provenance rule in the ticket skill and the worker
prompt; two invariant pins with tests; three METHODOLOGY sections. Commit
`0d6882d`.

**Mode:** direct — in-session, no worker or reviewer agent.

**Tokens:** unknown

**Verified:** `check-invariants.test.mjs` 34 / 0; `codex-review.test.mjs`
20 / 0 (the two rule copies stay equal); `run-epic.test.mjs` 162 / 0; `check
RETRO-7` 3/3. Revert check: the two `retro lenses` invariant tests mutate
each pinned document and require exit 1; with the paragraph removed from the
worker prompt in a scratch copy, 1 of the 2 `provenance` driver tests fails
(the other asserts no *other* prompt carries it, and rightly still passes).

**Owed:** Nothing.

**Addendum — review — 2026-09-19 — opus/fresh-context, whole epic:** one
review over `origin/main...origin/epic/retro-lessons` (seven work commits),
report-only; all nine suites, the invariant checker, doctor, the syntax and
parse checks and `check RETRO-1…7` re-run green by the reviewer; fourteen
behaviour deletions in a scratch copy, every one noticed by the named tests.
**Four Important findings, all fixed** in the `retro-lessons: review fixes`
commit: (1) RETRO-1's gate failed open on an empty string in the
reviewed-file list — its directory is the repository root, which then
admitted every root-level file, the sweep's own landing place; both lists
now drop empty entries, pinned by a new test using this repository's own
untracked filenames. (2) With no review anchor the gate never ran and the
fix commits went to the re-review, against the stop condition's own second
half; they now halt as unmeasured, the test that pinned the old behaviour
states the new one, and the run skill, the phase text and the log line moved
with it. (3) No ticket had written a status entry — these entries. (4) README
still said an epic with a design "ends with a whole-page fidelity ticket";
README and METHODOLOGY now say what the epic skill says. Nits taken: repeats
are collected per entry, not per ticket; an `unknown` round that changes
nothing no longer moves `source`; non-string `codeCommits` are dropped.
**Not fixed, recorded:** three spellings of the `epics` exclusion pathspec
across the driver and the script; `owed` re-prints a lead when an item with
no lead sits between two that share one; nothing pins that the merge and
refresh prompts never gain a `git add`; `unticketedCommits` runs once for the
board and again for doctor, and reports no `capped` flag at the scan limit —
owner `retro`. Counts after the fixes: `run-epic.test.mjs` 163 / 0,
`tickets.test.mjs` 142 / 0, the rest unchanged. Tokens: unknown.
