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
