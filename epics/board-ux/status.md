# Board-ux epic — status log

Append-only record of finished tickets. Tickets: `epics/board-ux/tickets.md`.

**Rules.** Append only. Corrections are new dated addenda beneath the entry they
correct, never edits. Report counts, not adjectives. The **Owed** line is
required even when empty.

## Baseline — 2026-08-08

Plugin at v1.9.0. What exists: `tickets.mjs` with mode parsing
(`releaseMode`/`runMode` in `find --json` and `list --json`), the
`integrated` state, a 15-test fixture-repo suite, `doctor`, and the
`/flow:run` driver (shipped by AUTO-3, untested live — this epic is its
first unattended run, by design of AUTO-4). Two defects verified live on
2026-08-08: the board's Next up prints `/ticket <ID>` where the installed
command is `/flow:ticket <ID>` (tickets.mjs line 349), and
`next <unknown-epic>` prints `nothing left to start` with exit 0. No brief
command exists. Sign-off decisions binding this epic: autonomous run mode
approved with the unattended consequence stated; branch protection on the
default branch waived (repository private under a free-plan org — recorded
as a re-plan of AUTO-4's acceptance criterion in
`epics/autonomous/tickets.md`); Q-5 of the quick epic is superseded by
BOARD-1 in-run; unknown-epic strictness is one rule, all commands, all
forms. Plan reviewed 2026-08-08 (fable/high): one Blocking finding (write
surface vs BOARD-1's cross-epic edit) fixed before sign-off, four nits
fixed, driver-facing script contract pinned as a ground rule.
