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
