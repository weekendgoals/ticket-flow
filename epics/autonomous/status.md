# Autonomous epic — status log

Append-only record of finished tickets. Tickets: `epics/autonomous/tickets.md`.

**Rules.** Append only. Corrections are new dated addenda beneath the entry they
correct, never edits. Report counts, not adjectives. The **Owed** line is
required even when empty.

## Baseline — 2026-08-08

Plugin at v1.6.0 (Q-4 in review as PR #4 at time of writing). What exists:
seven skills, two reviewer agents, `tickets.mjs` with the `integrated` state
(derived from a merged PR whose base is the epic branch — built in v1.3.0 and
verified sound by Q-4's review), a 9-test fixture-repo suite, and `doctor`.
What does not exist: any parsing of `Release mode:`/`Run mode:` lines (they
are prose to the script today), any agent merge permission anywhere, any
driver that runs more than one ticket. Sign-off decisions binding this epic:
a permission prompt mid-run is a stop condition; the zero-interventions claim
must cite the external record (PR/commit timeline), never only the agent's
diary; a merge conflict while refreshing the epic branch stops the run
unconditionally. Known risk carried in: the reviewer agent type has failed to
load in a live session once (see epics/quick Q-1 addendum) — the sanctioned
fallback is in this epic's ground rules.
