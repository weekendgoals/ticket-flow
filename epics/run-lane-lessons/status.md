# Run-lane lessons epic — status log

Append-only record of finished tickets. Tickets: `epics/run-lane-lessons/tickets.md`.

**Rules.** Append only. Corrections are new dated addenda beneath the entry they
correct, never edits. Report counts, not adjectives. The **Owed** line is
required even when empty.

## Baseline — 2026-09-14

Plugin at `a4f9e3b` (main). Suites: tickets 56/56, session guard 14/14,
check-invariants 11/11, board 9/9, plan-page 8/8, run-epic 91/91, codex
runner 8/8; `check-invariants.mjs` and `tickets.mjs doctor` exit 0. The run
driver halts on a fix-bounds trip (`FIX_LINE_BUDGET` 60, `STOP.fixBounds`),
the acceptance step re-runs CHECKs from the signed-off document with no rule
that a CHECK be red before its ticket, the run skill's step 1 refuses a
`done` ticket without naming a recovery, and the retro asks six questions,
none about halts. Evidence: the three weekendgoals release epics (23
tickets, 14 run records, 12 halt events: 5 plugin/environment, 4 policy, 2
plan, 1 code), their three fresh-context retro reports, and the scorecard at
https://claude.ai/code/artifact/e1f28378-4a5b-41ae-91cd-346a30404404. Known
risk: RUN-1 rests on three re-reviews that found nothing; the FND-6 case
cuts the other way and is the reversal's first data point.

### RUN-0 — The spend ledger reads the run records that exist — 2026-09-14 — DONE

**Built:** `tickets.mjs` reads a run heading with a parenthesised qualifier,
reads a labelled `<ID> worker=<n> …` group from any region of the log, closes
a parse region at every h2/h3, and `doctor` warns on a run heading that will
not parse and on a run record whose Tokens line carries figures but no group,
each warning naming the addendum repair. The run, doctor and spend skills,
README, CHANGELOG and root `CLAUDE.md`'s suite counts say the same.

**Mode:** interactive — in-session (the implementation predates the epic; see
the ticket's own note)

**Tokens:** unknown

**Verified:** `node --test` — tickets 56/56, session guard 14/14,
check-invariants 11/11, board 9/9, plan-page 8/8, run-epic 91/91, codex 8/8;
`check-invariants.mjs` exit 0; `tickets.mjs doctor` exit 0 on this repository;
the runtime-style parse of `run-epic.mjs` prints `parses`; `tickets.mjs check
RUN-0` 1/1 (`--test-name-pattern 'run record'` → `# pass 2`; with the
`origin/main` test file it prints `# pass 1`, so the CHECK is red before the
work). Doctor run in weekendgoals flags 14 run records (see Decisions) and
nothing else new; the drafted FND addendum, appended to a copy of that log,
made `spend redesign-foundation` report all six tickets, then the copy was
restored.

**Decisions:** the ticket's demonstrate criterion says doctor flags "eight"
run records in weekendgoals; it flags fourteen, because the relaxed heading
makes the six qualifier-bearing records parse and every one of the fourteen
carries prose figures — the number in the criterion predates the heading
change made in the same ticket, and there is no false positive (each flagged
line is a `**Tokens:**` line with figures and no group). Recorded rather than
edited: the ticket document is signed off.

**Owed:** Nothing.
