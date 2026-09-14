# Run-lane hardening epic — status log

Append-only record of finished tickets. Tickets: `epics/run-lane-hardening/tickets.md`.

**Rules.** Append only. Corrections are new dated addenda beneath the entry they
correct, never edits. Report counts, not adjectives. The **Owed** line is
required even when empty.

## Baseline — 2026-09-14

Plugin at the head of `epic/run-lane-lessons` (release PR #45, open):
suites tickets 58/58, session guard 14/14, check-invariants 13/13, board
9/9, plan-page 8/8, run-epic 92/92, codex 8/8; `check-invariants.mjs` and
`doctor` exit 0. The acceptance gate is `passed !== total` with no
`allPassed` in `ACCEPT_SCHEMA`; `fixBoundsExclude` exists nowhere on main;
`ticketBudget` is validated once from args and read at the post-merge
check; run records and ticket entries share `status.md`'s tail; the run
record template has no Diagnosis paragraph; the plan reviewer asks neither
executability nor collectability; METHODOLOGY says `--from` makes the
acceptance gate adversarially safe. Evidence in `context/`. Every CHECK in
`tickets.md` observed red on this tree (0/14), by the planner and by the
plan reviewer.

### HARD-1 — The gates read what the script computes — 2026-09-14 — DONE

**Built:** The unattended acceptance gate now reads the ledger `tickets.mjs
check --json` prints — `allPassed` and the number of `problems` — instead of
comparing `passed` to `total`, so a malformed CHECK (which runs nothing, and
therefore leaves `passed === total` trivially true) halts on
`STOP.acceptanceCheck` with the problem text quoted, and a report missing
either field halts as unreadable evidence. The review anchor became a driver
fact: the read-only tier-facts proxy now also runs `git rev-parse
origin/<branch>`, the driver hands the reviewer a SHA range
(`origin/epic/<name>...<sha>`) and anchors the fix-bounds gate on it, and the
reviewer's `reviewedHead` is kept only as a logged cross-check the driver's
anchor outranks; the re-review packet no longer asks for a field
`RE_REVIEW_SCHEMA` cannot carry.

**Mode:** autonomous — supervisor-spawned worker worker:HARD-1 (opus)

**Tokens:** observed by the supervisor — see the review addendum

**Verified:** `node plugins/flow/scripts/tickets.mjs check HARD-1` — 2/2
checks passed (baseline on the branch point `a1c6109`: 0/2, both criteria
observed red before any edit). Its first criterion, run directly: `node
--test --test-name-pattern 'acceptance gate|review anchor'
plugins/flow/workflows/run-epic.test.mjs` — `# pass 6`, `# fail 0` (the one
pre-existing "acceptance gate" case plus the five this ticket adds; a
seventh new case — a reviewer head that abbreviates the driver's — is
deliberately named off the pattern so the count stays exact). Standing
checks, all on this branch: run-epic 98/98 (was 92/92 at the epic baseline,
`# fail 0`), tickets 58/58, session guard 14/14, check-invariants 13/13,
board 9/9, plan-page 8/8, codex 8/8 — every suite `# fail 0`. `node
plugins/flow/scripts/check-invariants.mjs` exit 0; `node
plugins/flow/scripts/tickets.mjs doctor` exit 0. The driver parses the
runtime's way (the `AsyncFunction` command in root `CLAUDE.md`) — exit 0, no
SyntaxError. No `git add -A`: only the five files this ticket changed were
staged, and the repository's unrelated untracked research files were left
alone.

**Decisions:**
- The ticket's Scope names `STOP.acceptanceFailed`; the driver's stop
  condition is `STOP.acceptanceCheck` ("a failed acceptance CHECK — …"), and
  no `acceptanceFailed` key exists. Recorded here rather than by editing the
  signed-off document: the gate halts on the existing condition, so no STOP
  string was added or reworded and the run skill's step 5 copy and
  `check-invariants.mjs` `PHRASES` needed no move. The epic's own stop-string
  ground rule is satisfied by not touching one.
- An unusable head from the tier-facts step does not halt: the review range
  falls back to the branch name and the fix-bounds gate loses its anchor,
  which routes the fixes to the bounded re-review — the behaviour the
  unusable reviewer-reported head already had, and the direction the lane's
  rule requires (doubt raises scrutiny, never lowers it). Halting instead
  would spend a human resume on a proxy that mistyped a SHA.
- The existing test named for the *reviewer's* unusable `reviewedHead` was
  rewritten around the tier-facts head, because after this change the
  reviewer's number can no longer send fixes anywhere. Renamed off the
  acceptance pattern so the `# pass 6` count stays exact.
- The reviewer/driver head comparison is by prefix in either direction: a
  reviewer printing a short SHA is spelling the same commit, not disagreeing.
- Root `CLAUDE.md`'s suite counts were already stale before this ticket
  (`run-epic … # pass 78` against 92 at the epic baseline, and similarly for
  check-invariants, board and plan-page). Left as they are: that file states
  the counts "as of 2026-08-11; the count grows, the fail line does not", so
  the staleness is by design and repairing another epic's drift here is not
  this ticket's scope. Observed, recorded, not adapted around.
- `README.md`'s one-line description of the run loop says the criteria are
  "re-run from the signed-off document … and gated on in code", which is
  still exactly true of the new gate, so it needed no change; the doctrine
  grep found no other copy of the acceptance-gate or anchor rules.

**Owed:** Nothing.

**Addendum — review — 2026-09-14 — opus/xhigh:** One Important, confirmed and
mine: the anchored SHA range froze the review packet at the pre-fix head, and
`boundedReReview` reused that packet verbatim — so at the consequence tier and
on every fix-bounds trip the pass that exists to judge the fix commits was
pointed at a range that cannot contain them, told to read the anchored commit
rather than the branch tip, and could return `important: []` having read none
of them. Fixed in `2b153ef`: the packet is a shared body plus a per-pass
header, the first review keeps the anchored range, and the re-review gets
`<anchorHead>..origin/<branch>` — the fix commits themselves, the first
review's range named as context — and is told to read the branch as pushed;
with no anchor it gets the whole branch, wider rather than narrower. One new
test, `re-review range covers the fix commits, and differs from the first
review range`, named off the criterion's pattern so `# pass 6` stays exact and
verified red on the unfixed driver (restored `HEAD:run-epic.mjs`: `# fail 1`;
restored the fix: `ok`). Three nits, all confirmed, all fixed in `7fc8b17`:
the range comment now says which spelling is right for `git diff` (merge-base)
and which for `git log` (symmetric difference) instead of claiming three dots
narrow both; the run skill now names the schema's `reviewedHead` and the
record's `reviewerReportedHead` separately from the driver's anchor; and
`STOP.acceptanceCheck` grew to name all three halts the gate fires on — a
failing check, a CHECK too malformed to run, a report the gate cannot read —
with the run skill's step 5 copy moved in the same commit and
`check-invariants.mjs` `PHRASES` pinning the sentence whole rather than by its
first clause. The historical quotes of the old string in `context/` are
evidence of past runs and stay as recorded. Bounded re-review of
`6ad7dac..7fc8b17` at opus/xhigh: **0 Important**, nothing from the first
review unaddressed, reviewed head `7fc8b17`. Counts after the fixes: run-epic
99/99, tickets 58/58, session guard 14/14, check-invariants 13/13, board 9/9,
plan-page 8/8, codex 8/8 (every suite `# fail 0`); `check-invariants.mjs`
exit 0; `doctor` exit 0; the driver's runtime-style parse exit 0;
`tickets.mjs check HARD-1` 2/2 with the pattern still printing `# pass 6`.
**Not nothing deferred:** one pre-existing defect is handed on — the driver
never compares `anchorHead` with the head it merges, so on a clean review
(`fixedCommits: []`) a commit pushed between the review and the resolve step
merges unreviewed and unmeasured; now that `anchorHead` is a driver fact, an
equality-or-ancestry check at the resolve step is cheap. Owner: the epic's
retro — a follow-up run-lane ticket. Nothing else was left unfixed.
Worker tokens (implementation leg): 181,146; Reviewer tokens: 316,806 (first
review 148,524; re-review 168,282).

### HARD-2 — The fix-bounds exclusion line reaches main — 2026-09-14 — DONE

**Built:** An epic may again exempt mechanical fan-out files from the
unattended run's fix-bounds gate. `Fix bounds exclude: <glob>[, <glob>]` parses
in `tickets.mjs` with the same tolerant list parse as `Consequence paths:`,
joins doctor's near-miss set and its warning's enumerated syntax, and rides
both `find --json` and `list --json`; the driver validates it exactly like
`consequencePaths` (an unusable glob throws before the first agent is spawned)
and joins it to `':(exclude)epics'` in **both** of the resolve step's fix-diff
pathspecs, so an excluded file can reach neither `reviewedFiles`/`fixFiles` nor
`fixLines` and a pure translation fan-out neither halts nor buys the bounded
re-review a trip costs. The run skill's step 4 args block and its two
fix-bounds paragraphs, the epic skill's preamble template, README's
configuration table (seven lines → eight) and CHANGELOG say so.

**Mode:** autonomous — supervisor-spawned worker worker:HARD-2 (opus)

**Tokens:** observed by the supervisor — see the review addendum

**Verified:** `node plugins/flow/scripts/tickets.mjs check HARD-2` — 3/3 checks
passed (baseline on the branch point `40211c2`, before any edit: 0/3, all three
criteria observed red — both patterns printed `# pass 1`, the file wrapper, and
the grep printed 0 and exited 1). The two criterion commands run directly:
`node --test --test-name-pattern 'bounds exclude'
plugins/flow/scripts/tickets.test.mjs` — `# pass 2`, `# fail 0`; the same
pattern on `plugins/flow/workflows/run-epic.test.mjs` — `# pass 2`, `# fail 0`
(exactly the two cases each criterion names; the extra coverage sits inside
those two tests rather than under new names, so the counts stay exact). All
four new tests were re-run against the **base** `tickets.mjs` and
`run-epic.mjs` restored from `HEAD` with the new tests in place: `# pass 0`,
`# fail 2` in each suite — the criteria measure this change, not the tree.
Standing checks on this branch: tickets 60/60 (58 at the branch point),
run-epic 101/101 (99), session guard 14/14, check-invariants 13/13, board 9/9,
plan-page 8/8, codex 8/8 — every suite `# fail 0`. `node
plugins/flow/scripts/check-invariants.mjs` exit 0 (all five checks printed ✓);
`node plugins/flow/scripts/tickets.mjs doctor` exit 0; `node --check
plugins/flow/scripts/tickets.mjs` exit 0; the driver parsed the runtime's way
(the `AsyncFunction` command in root `CLAUDE.md`) exit 0, no SyntaxError. No
`git add -A`: the eight files this ticket changed were staged by name and the
repository's unrelated untracked research files were left alone.

**Decisions:**
- Re-implemented against the current tree rather than cherry-picked, as the
  ticket's Scope directs: `ffc3a24` does not apply — RUN-1's bounded re-review
  and HARD-1's `anchorHead` rewrote the resolve step, the preamble parser gained
  `Worker runner:` and `Planner model:`, and doctor's near-miss message now
  enumerates every line. The original's decisions are kept whole: configuration
  rather than a hardcoded path, and an unusable glob refusing the run.
- The history claim in the CHANGELOG entry was verified, not copied:
  `8ac3bef` is "Merge pull request #42 from weekendgoals/fix-bounds-exclude",
  dated 2026-08-27, and `git merge-base --is-ancestor ffc3a24 origin/main` says
  the change is not on main; the branches containing it are
  `fix-bounds-exclude`, `model-fallback` and `origin/addendum-gate-date`.
- The code comment carries no ordinal ("another optional line"), though
  README's prose count moved seven → eight. The existing ordinals in
  `tickets.mjs` are already stale — `Consequence paths` is called "the fourth
  optional line" and `Ticket budget` "the fifth" with seven lines in the file,
  because `Worker runner:` and `Planner model:` were added without renumbering
  — so adding a ninth ordinal would add a number guaranteed to drift. The
  README count is prose a reader checks against the table below it, which is
  why that one was updated.
- Both fix-diff pathspecs carry the globs, not just the fix side. Excluding a
  file from the `--numstat` command alone would keep its lines out of
  `fixLines` but also drop it from `reviewedFiles`, so a fix that legitimately
  touched it would then read as outside the reviewed diff — the exact trip the
  line exists to prevent. The reason is in the driver's comment and asserted by
  the test.
- The refusal cases live only in the test named `an unusable Fix bounds exclude
  glob refuses the run before spending an agent`, and were **not** also added
  to the existing `the script refuses unusable arguments before spending an
  agent` table (where `ffc3a24` put them): the criterion's `# pass 2` is exact,
  and duplicating the cases would buy nothing the named test does not already
  prove.
- The run skill's two fix-bounds paragraphs gained the exclusion, but the
  `STOP.fixBounds` sentence `check-invariants.mjs` pins whole was not touched —
  the new clause sits after it, so no stop string changed, no `PHRASES` entry
  moved, and the epic's stop-string ground rule is satisfied by not touching
  one. The doctrine grep across `skills/`, `README.md`, `METHODOLOGY.md`,
  `CLAUDE.md` and the driver's prose found no other copy of the preamble
  configuration surface or the fix-bounds rule to move.
- Root `CLAUDE.md`'s suite counts remain stale (`tickets … # pass 56` against
  58 at the branch point, `run-epic … # pass 92` against 99) and were left
  alone, as HARD-1 recorded for the same file: that file states its counts "as
  of" a date and says the count grows while the fail line does not, so the
  staleness is by design and repairing it is not this ticket's scope. Observed
  and recorded, not adapted around.

**Owed:** Nothing.
