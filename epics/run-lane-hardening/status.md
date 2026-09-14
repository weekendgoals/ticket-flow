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

**Addendum — review — 2026-09-14 — opus/xhigh:** **0 Important**; verdict
sound, so no re-review. Four nits, all confirmed, all fixed in `6f23d01`.
(1) The pathspec comment in `run-epic.mjs` — and this entry's Decisions bullet
on the same point — had the mechanism inverted. `reviewedFiles` comes only
from the `--name-only` command and `fixFiles`/`fixLines` only from
`--numstat`, and the trip is `fixFiles` minus `reviewedFiles`: excluding on
the numstat side alone removes the file from `fixFiles`, so **no** trip
occurs — that side is what the feature turns on. The symmetry prevents the
mirror case instead: excluding on the `--name-only` side alone would shrink
`reviewedFiles` while the file still arrived in `fixFiles`, a guaranteed trip
on every fan-out fix. The comment now states that; the entry above is
corrected by this line rather than edited, per the log's Rules. The test
asserts the symmetry (both commands carry the globs), not the mechanism —
which is what a test over stubbed agents can prove. (2) Nothing in the record
or the log said the gate had run narrowed, so a retro could not distinguish a
gate that measured the whole fix from one a broad glob narrowed to nothing —
`**` is legal by design, the human's call at sign-off. The ticket record now
carries `fixBoundsExclude` (`[]` when nothing was excluded) and the run logs
the applied globs when the gate is armed with them; the run skill's record
field list and its run-record reading moved in the same commit, and the
assertions ride the existing named test so the criterion's `# pass 2` stays
exact. (3) The epic skill's new paragraph had dropped the "globs only on this
line" caution its `Consequence paths:` sibling carries, and said nothing
about the comma split; it now carries both, and the parser test's assertion
message no longer reads as "trailing prose is safe" — it is safe only while
comma-free. (4) One 89-character line in `skills/run/SKILL.md` rewrapped.
Counts after the fixes: tickets 60/60, run-epic 101/101, session guard 14/14,
check-invariants 13/13, board 9/9, plan-page 8/8, codex 8/8 (every suite
`# fail 0`); `check-invariants.mjs` exit 0; `doctor` exit 0; `node --check
plugins/flow/scripts/tickets.mjs` exit 0; the driver's runtime-style parse
exit 0; `tickets.mjs check HARD-2` 3/3 with both patterns still exactly
`# pass 2`. **Not nothing deferred:** two pre-existing defects are handed on,
owner **a follow-up run-lane ticket, or this epic's retro**. (a) A hyphenated
declaration label (`Fix-bounds exclude:`, `Ticket-budget:`, `Worker-model:`)
escapes doctor's `declNear`, which joins multi-word labels with `\s+`, so the
near-miss scan stays silent on a line that parses as nothing — for
`Ticket-budget:` that is a per-ticket ceiling silently absent from a run. (b)
`grabPathList` splits on commas, so trailing prose containing a comma becomes
a glob entry and the driver refuses the run; `Consequence paths:` has carried
that since it shipped and `Fix bounds exclude:` inherits it. Both are older
than this ticket and neither is in its scope; the skills now warn about (b)
in prose, which is a mitigation, not the fix. Nothing else was left unfixed.
Worker tokens (implementation leg): 170,716; Reviewer tokens: 153,837.

### HARD-3 — The ticket budget is re-read at every refresh — 2026-09-14 — DONE

**Built:** The unattended run's per-ticket token ceiling is no longer fixed at
launch. `FIND_SCHEMA` requires a `ticketBudget` field, the verify step's
prompt asks the proxy to report it verbatim off `tickets.mjs find <ID>
--json`, and a re-read block ahead of the post-merge budget check makes that
reported number the ceiling the check uses — so a `Ticket budget:` line
raised on `epic/<name>` while a ticket is running governs that ticket's own
check, which is the moment FND-1's raise would have governed its own. Three
code checks guard the reported value: missing or not a positive integer halts
as a contradiction, a ceiling with no runtime meter is refused as launch
refuses it, and a reported `null` keeps the last ceiling in force and logs
that it did. `skills/run/SKILL.md` (args block, `Verifies` bullet, the budget
and contradiction stop conditions), `skills/epic/SKILL.md`'s `Ticket budget:`
template line, README's configuration table and CHANGELOG say so.

**Mode:** autonomous — supervisor-spawned worker worker:HARD-3 (opus)

**Tokens:** observed by the supervisor — see the review addendum

**Verified:** On the base tree (`e444c83`) before any edit, `node
plugins/flow/scripts/tickets.mjs check HARD-3` was 0/2 red — the named-case
pattern printed no `# pass 4`, the skill grep exited 1. After the change, on
this branch: `node plugins/flow/scripts/tickets.mjs check HARD-3` 2/2 passed,
with `node --test --test-name-pattern 'budget re-read'
plugins/flow/workflows/run-epic.test.mjs` printing exactly `# pass 4` and the
skill grep printing `budget-live`. Suites: `node --test
plugins/flow/workflows/run-epic.test.mjs` 105/105 (101 before, four added);
tickets 60/60; session guard 14/14; check-invariants 13/13; board 9/9;
plan-page 8/8; codex 8/8 — every suite `# fail 0`. `node
plugins/flow/scripts/check-invariants.mjs` exit 0 (five checks); `node
plugins/flow/scripts/tickets.mjs doctor` exit 0; `node --check
plugins/flow/scripts/tickets.mjs` exit 0; the driver's runtime-style parse
(CLAUDE.md's `AsyncFunction` command, since `node --check` rejects the
top-level `return`) exit 0.

**Decisions:** (1) The two new halts — a malformed reported budget, and a
ceiling that appears where no meter exists — fire on `STOP.contradiction`
rather than a widened `STOP.ticketBudget`. Stop strings are what a retro
files halts by, and rewording the budget string would re-file every existing
budget halt; neither new case is an overspend anyway. (2) That choice
contradicted a sentence in the run skill: the contradiction stop condition
claimed its checks all run "before the merge command exists, so a halt here
merged nothing", which the re-read's position at the verify step falsifies.
Recorded here rather than silently left: the bullet now names the budget
re-read as the one exception, with the reason it must sit after the merge —
the refreshed document it reads exists only once the merge has pulled it —
and both halt details say the ticket stays merged. (3) `ticketBudget` is both
declared in `FIND_SCHEMA` (as `['integer','null']`, in `required`) and
checked in code, not one or the other: a schema is a request to an agent, and
the driver's standing rule is that every fact it acts on carries its own code
check. (4) The re-read block sits ahead of the `if (METER)` guard, because
the no-meter case is only reachable outside it. (5) The phrase "re-read at
every refresh" is stated with its mechanism named in the same sentence
everywhere it appears — the `git pull --ff-only` inside each ticket's merge,
read back by that ticket's verify step. "Refresh" there is the refresh of the
epic's documents, not the driver's Refresh phase, which the ticket names as
the wrong door and which the text says so about. (6) CLAUDE.md's Commands
section quotes suite counts below what the suites now print (`run-epic # pass
78` against 105, `tickets # pass 36` against 60, and others). Nothing edited:
that section states the counts grow and only the fail line is fixed. (7)
HARD-2's addendum handed on a pre-existing defect touching a `Ticket-budget:`
label — a hyphenated declaration label escapes doctor's near-miss scan. It is
about how the label parses, not about where the parsed value is read, so it
stays with its named owner (a follow-up run-lane ticket, or this epic's
retro) and was not touched here.

**Owed:** Nothing.

**Addendum — review — 2026-09-14 — opus/xhigh:** Two Important findings, both
fixed; five nits, all fixed; two re-reviews. **Important 1** (first review,
head `1477c70`): the re-read took `ticketBudget` from the verify step's
`find --json`, which parses the working tree *after* `git merge --no-ff`, so
the ticket branch's own copy of `tickets.md` set the ceiling that judged it —
a worker or disposition commit could raise its own ceiling, the exact property
the acceptance gate protects with `check --from origin/epic/<name>`. Fixed in
`7f8c5c9`: `tickets.mjs` gains `find --from <ref>` (the epic's declarations
parsed from `git show <ref>:epics/<epic>/tickets.md`; other facts unchanged;
an unreadable ref exits 1, a bare `--from` exits 2), the read moves to the
resolve step's new unconditional FACT 3 reading `origin/epic/<name>` before
the merge, `RESOLVE_SCHEMA` requires `ticketBudget`, `FIND_SCHEMA`'s field and
the verify prompt's budget sentence are removed, and the fix-bounds fact
renumbers to FACT 4. The finding has its own test — a ticket branch cannot
raise the ceiling that judges it — kept outside the graded phrase so the
criterion's `# pass 4` stays exact. **Nits**, all confirmed and fixed: (2) the
resolve proxy's budget instruction is pinned in its own test (`fa0d83e`), as
the suite pins the other gates' prompt text; (3) the budget halts recorded no
spend — `recordSpend()` now reads the meter once per ticket and every budget
halt records the delta before halting, because a halt whose subject is the
spending must not report `unknown`; (4) the run skill's contradiction bullet
no longer calls the budget re-read an exception to "merged nothing" (the
halts moved pre-merge) and names the ticket-count cap, which does fire after
merges; (5) the no-meter halt says "run on a build", not "resume", matching
the launch-time twin and the skill's ban on resuming a halted run; (6) the
malformed value is fenced like every other quoted agent report. (3), (5) and
(6) are pinned by assertions, including `doesNotMatch(/resume on a build/)`.
**Important 2** (re-review of `1477c70..fa0d83e`, confirmed by trace): the fix
read `origin/epic/<name>`, a *local* remote-tracking ref that nothing updated
mid-ticket — the run's only full fetch is in refresh+select before the worker,
the other three fetch the ticket branch, and the merge's `git pull --ff-only`
runs after the read — so a raise pushed during the ticket still reported the
stale value and FND-1's timeline reproduced exactly. Every test passed because
the resolve agent is stubbed. Fixed in `55c640a`: FACT 3 fetches
`origin <epicBranch>` immediately above the read, the test pins the fetch **by
position** (`indexOf(fetch) < indexOf(find)`) rather than by presence, and the
step's closing line now states the read-only contract precisely — the fetches
write remote-tracking refs, nothing else writes. **Verdicts:** re-review of
`1477c70..fa0d83e` — Important 1 fixed, five nits addressed, one new
Important; narrow re-review of `fa0d83e..55c640a`, head `55c640a` — 0
Important, nothing from either round open, the fetch confirmed ahead of the
read in both composed prompts. Counts after the fixes: tickets 62/62, run-epic
107/107, session guard 14/14, check-invariants 13/13, board 9/9, plan-page
8/8, codex 8/8 (every suite `# fail 0`); `check-invariants.mjs` exit 0;
`doctor` exit 0; `node --check plugins/flow/scripts/tickets.mjs` exit 0; the
driver's runtime-style parse exit 0; `tickets.mjs check HARD-3` 2/2 with the
pattern still exactly `# pass 4`. **Deviation from the signed-off document:**
its scope named the verify step's `find --json` as the door (planning decision
2); the review showed that door reads the tree the merge just produced, where
the reviewed party's own copy of the preamble is the document. The resolve
step on `origin/epic/<name>`, fetched first, is the door the invariant
requires — read-only, before the merge, on a ref no ticket branch can edit.
Recorded here rather than edited into the signed-off document; planning
decision 3 (a null keeps the last value and logs it) is unchanged and
implemented as written. **Not nothing deferred.** (a) A residual, accepted:
at the resolve step the working tree is on the ticket branch, so the ticket
branch decides *which path* is read from the ref (`epics/<epic>/tickets.md`);
a renamed epic directory makes `git show` fail, `find` exit 1, the proxy
report `command-failed` and the run halt before any merge — it fails closed,
the safe direction, so it is recorded, not fixed. (b) A wording nit the
reviewer declined to block on: the phrase `re-read at every refresh` names no
refresh that actually performs the read, and it survives only because it is
what the acceptance CHECK greps — owner **this epic's retro**, together with
moving the criterion off the phrase. (c) The pre-existing hyphenated-label gap
HARD-2 handed on (a `Ticket-budget:` style label escapes doctor's near-miss
scan) is untouched and keeps its owner, **a follow-up run-lane ticket, or this
epic's retro**: it is about how the label parses, not where the parsed value
is read. Worker tokens (implementation leg): 130,536; Reviewer tokens: 598,961
(first review 157,035; re-review 213,399; narrow re-review 228,527).

### HARD-4 — Run records get their own file — 2026-09-14 — DONE

**Built:** Run records have their own append-only log, `epics/<name>/runs.md`,
so the ticket entries on ticket branches and the run record on the epic branch
no longer share one file tail. `tickets.mjs` gains `runsDoc` (in
`discoverEpics`, so `epics --json` carries it; in `find --json` with
`runsDocExists`), reads run regions from both logs in `parseSpend`, runs
doctor's run-heading and Tokens near-miss scans over both files named by the
file they fired in, and flags a `### Run —` record left in `status.md` once
that epic has a `runs.md` — date-scoped to records dated on or after the first
one in `runs.md`. The driver's two `next` strings, the run skill's step 6 (with
the new file's preamble), the retro skill's miner hand-off, record read and
halts question, README's document table and `spend` paragraph, METHODOLOGY §
"Why the run loop is code" and `check-invariants.mjs` all state the new home;
nothing migrates.

**Mode:** autonomous — supervisor-spawned worker worker:HARD-4 (opus)

**Tokens:** observed by the supervisor — see the review addendum

**Verified:** Base-tree ledger first, at `68a17d3`: `tickets.mjs check HARD-4`
0/3 — criterion 1 exited 0 printing `# pass 1` (the file wrapper, no case
matching the pattern), criteria 2 and 3 exited 1 printing nothing, matching the
planning ledger. After the change `node plugins/flow/scripts/tickets.mjs check
HARD-4` is 3/3, criterion 1's output exactly `# pass 3` (three cases:
`spend reads a run record from runs.md, and still reads the records that
predate the split from status.md`; `doctor flags a run record appended to
status.md after the split to runs.md, and never one that predates it`;
`find --json exposes runsDoc, whether or not the epic has split its runs.md out
yet`). Every suite in root `CLAUDE.md`, each `# fail 0`:
`node --test plugins/flow/scripts/tickets.test.mjs` 65/65 (was 62),
`… hooks/ticket-session-guard.test.mjs` 14/14,
`… scripts/check-invariants.test.mjs` 15/15 (was 13),
`… scripts/board.test.mjs` 9/9, `… scripts/plan-page.test.mjs` 8/8,
`… workflows/run-epic.test.mjs` 107/107,
`… scripts/runners/codex.test.mjs` 8/8.
`node plugins/flow/scripts/check-invariants.mjs` exit 0 (six checks ✓, one of
them new); `node plugins/flow/scripts/tickets.mjs doctor` exit 0;
`node --check plugins/flow/scripts/tickets.mjs` exit 0; the driver's
runtime-style parse from root `CLAUDE.md` exit 0. The two existing run-record
fixtures (sigma's status.md records, and every fixture epic without a runs.md)
are unchanged and still pass, which is the "existing logs keep their records
where they are" half of the scope.

**Decisions:** (1) `find --json` exposes `runsDocExists` beside `runsDoc`,
which the scope did not name: `statusDoc`/`statusDocExists` is the existing
shape, and the run skill has to know whether to write the preamble before
appending — a path alone would make it guess. (2) The **Rules** block in
`runs.md`'s preamble is the status log's verbatim, as the scope requires,
including "The **Owed** line is required even when empty" — inert for a run
record, which has no Owed line, but a fourth copy that paraphrases is a fourth
place to drift; `check-invariants.mjs` now compares the two blocks, and a fifth
doctrine phrase entry requires the file's name in the run skill, the retro
skill, the driver, README and the script. (3) Doctor's run-record scans were
hoisted above the `no status.md` `continue`, so an epic that has `runs.md` and
no `status.md` is still scanned — the previous position would have skipped it
silently. (4) The misfile warning's advertised recovery is *append the record
to `runs.md`, and a dated addendum beneath the committed copy* — never delete
it: the flagged record sits in an append-only log, so a recovery that removes
it cannot be taken in the state that triggers the flag. The ledger reads the
same groups from either file, so nothing is lost while the misfile stands.
(5) README's table is under the heading "The three documents" and now has five
rows; the scope said the table gains the row, so the row was added and the
heading left alone rather than renaming a section this ticket does not own —
the table already carried `context/` as a fourth row before this change.
(6) Two driver tests were extended (not added) to pin both `next` strings to
`runs.md` and away from `status.md`, because the CHECK only counts greps in the
script and a count is not a branch.

**Owed:** Nothing.

**Addendum — review — 2026-09-14 — opus/xhigh:** Consequence tier, reviewed
head `12a494c`: 1 Important, 5 nits, 1 pre-existing; backward compatibility
verified byte-identical against `weekendgoals`. **Important, fixed in
`2f08507`:** cross-file precedence lost recorded figures — `parseSpend` read
all of `status.md` then all of `runs.md`, so a run record's `unknown` deleted a
figure the other file had recorded (executed case: a halted run's `X-1
worker=unknown reviewer=unknown` in `runs.md` erased the attended entry's
40,000 / 12,000, and the ledger reported the ticket unmeasured with total 0,
where the same content in one file yields 52,000). The fix states the ranking
instead of inheriting it from file order: **`unknown` never overwrites a known
figure in either direction** — it records the absence of an observation, not a
correction — and **between two known figures for one ticket and role the last
read wins, with `runs.md` read after `status.md`**, so a correction to a run
record's figures is appended in `runs.md`. The rule is stated in the run
skill's step 6, the spend skill's reading section and README's `spend`
paragraph, and pinned by a test named outside the graded pattern covering both
directions. **Nits fixed in the same commit** (the `tau` fixture serves the
Important case and three nits in one literal, so the fixes were not split into
separate commits): a `status.md` record whose heading already appears in
`runs.md` is a repaired one and is no longer re-flagged; the misfile flag is
strictly after the split date; a `runs.md` that exists with no parseable record
is now itself flagged, instead of silently disabling the misfile scan; the run
skill names `find --json` alone as carrying `runsDoc`/`runsDocExists`.
**Recorded, not fixed:** README's "The three documents" heading now stands over
five rows — the entry's decision 5 stands, the ticket owns the row and not the
section. **Three deviations, from the signed-off scope and from this entry's
own Decisions:** (1) the misfile flag is **strictly after** the split date, not
the scope's "on or after" — a date carries no time, so a record written on the
split day may well predate the first record in `runs.md`, and a record that
cannot be moved must not be flagged; (2) doctor's run-record scans sit **below**
the status-heading scan, with the `no status.md` branch's `continue` replaced
by an `else`, so the scans stay reachable for an epic that has `runs.md` and no
`status.md` while `doctor`'s row order stays byte-identical to before this
ticket; (3) the cross-file ranking rule above, which the scope did not name at
all. **Re-review:** bounded, `12a494c..2f08507`, head `2f08507`, opus/xhigh —
the Important and all four nits verified fixed against the reviewer's own
fixtures, `weekendgoals` `spend`, `spend --json`, `doctor`, `doctor --json` and
`list --json` byte-identical including row order; 0 Important open. **Counts
after the fixes:** tickets 67/67, run-epic 107/107, session guard 14/14,
check-invariants 15/15, board 9/9, plan-page 8/8, codex 8/8 (every suite
`# fail 0`); `check-invariants.mjs` exit 0; `doctor` exit 0;
`node --check plugins/flow/scripts/tickets.mjs` exit 0; the driver's
runtime-style parse exit 0; `tickets.mjs check HARD-4` 3/3 with the pattern
still exactly `# pass 3`. **Not nothing deferred.** (a) The pre-existing gap
the review found: the run-heading scans and `runRecordHeadings` do not skip
fenced code blocks, so a log quoting a `### Run —` example inside a fence reads
as a record — owner **this epic's retro**. (b) The repaired-record skip's one
blind spot, introduced by its own fix: two *distinct* records whose headings
are byte-identical (same date, no qualifier), one in each file, suppress the
misfile warning while the ledger still reads both — the record's first Tokens
line is a cheap second key if it ever matters; owner **this epic's retro**.
Worker tokens (implementation leg): 175,004; Reviewer tokens: 334,967 (first
review 148,747; re-review 186,220).

### HARD-5 — A halted run explains itself, and the doctrine says what `--from` protects — 2026-09-14 — DONE

**Built:** A halted run record must now carry a `**Diagnosis:**` paragraph —
the run skill's step 6 template declares the field and step 5's halt path
names it where the halted session is told what to append, and the retro
skill's seventh question reads that paragraph before the **Halted on:**
line, with the classification stated as still the miner's. METHODOLOGY §
"Why acceptance criteria can be machine-runnable" now bounds its
"structurally cannot soften its own gate" claim — `--from` secures the
command string and nothing the string reaches — and § "Why the run loop is
code, not prose" bounds the reviewer fallback to a crashed agent rather
than an exhausted environment. Two CHANGELOG entries under `## Unreleased`.

**Mode:** autonomous — supervisor-spawned worker worker:HARD-5 (opus)

**Tokens:** observed by the supervisor — see the review addendum

**Verified:** `tickets.mjs check HARD-5` — **red before** on the base tree
`eeb9ab8` (0/2: `diagnosis-required` exit 1, `from-bounded` exit 1), 2/2
passed on the committed branch, exit 0. `check-invariants.mjs` exit 0 (6/6
couplings). `tickets.mjs doctor` exit 0. Suites, all `# fail 0`: tickets
67/67, run-epic 107/107, session guard 14/14, check-invariants 15/15, board
9/9, plan-page 8/8, codex 8/8. `node --check
plugins/flow/scripts/tickets.mjs` exit 0; the driver's runtime-style parse
exit 0. No code changed, so no suite could have been expected to move — they
are the standing checks for the plugin the documents describe.

**Decisions:** (1) The two skills had to be reconciled, not just added to:
the new **Diagnosis** paragraph asks the halted session whether the stop
retired a real risk, while the retro's question already said "the
classification is yours to make, not the record's to carry". Both now state
one rule — the diagnosis is evidence gathered while the halt was fresh, the
classification stays the miner's — rather than two readings of who judges a
halt. (2) `run-epic.mjs`'s halted `next` string was left untouched. It
tells the session to quote the stop condition and the ticket, which reads
like a field list but is not one — the completed-path string likewise names
only the Release PR field while the template carries five — so it is
emphasis, not an enumeration that the new field makes stale, and the ticket
scopes this work to doctrine. (3) The supervisor's brief pointed at the
retro's "halts 1 and 2" for the diagnosis evidence; the file shows the two
shipped plugin fixes came from the diagnoses under halts **2** (ENOBUFS,
`4eb0f4b`) and **3** (the addendum date, `9a859c7`), with halt 1 being the
session-limit spawn failure that the METHODOLOGY fallback sentence cites.
Recorded rather than edited into anything: the documents cite the fixes by
commit and mechanism, so no numbering travels with them.

**Owed:** Nothing.

**Addendum — review — 2026-09-14 — sonnet/high:** No findings — 0 Important,
0 nits, nothing pre-existing — at the normal tier, reviewed head `212f600`.
Checked and found sound: both cited commits exist and say what the documents
claim (`4eb0f4b` the check runner's buffer, `9a859c7` the shape-matched
addendum-date lookup); the FND-5 `test:it` citation and the session-limit
fallback citation against the context reports; the `**Diagnosis:**` field's
placement after **Halted on:** in the step 6 template, with the
ran-to-completion record's shape untouched; `run-epic.mjs` and the scripts
untouched; both CHANGELOG entries under `## Unreleased`; and the
reconciliation between the run and retro skills reading as one rule — the
diagnosis is evidence, the classification stays the miner's. The entry's
discrepancy note was verified against the retro report and is correct: the
two shipped fixes came from the diagnoses under halts 2 and 3, not 1 and 2.
Nothing fixed, because nothing was found; **nothing deferred.** Worker
tokens (implementation leg): 119,882; Reviewer tokens: 127,026.
