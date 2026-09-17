# Deviation routing epic — status log

Append-only record of finished tickets. Tickets: `epics/deviation-routing/tickets.md`.

**Rules.** Append only. Corrections are new dated addenda beneath the entry they
correct, never edits. Report counts, not adjectives. The **Owed** line is
required even when empty.

## Baseline — 2026-09-17

**What exists today.** A status entry's `**Decisions:**` field is where the
ticket skill tells a worker to record "judgment calls and deviations from
the documents, each with the why", and no command reads it: the string
`Decisions` appears nowhere in `scripts/tickets.mjs` or
`workflows/run-epic.mjs`. `parseOwed` (`tickets.mjs:426`) is the only parser
of an entry's body, and `brief` carries owed items and nothing else into
later tickets (`:1271`). The run driver has no stop condition for a
deviation; the ticket skill's steps 9 and 10 and the quick skill's step 7
do not mention one.

**What is verified, and how.** On `origin/main` at `b96da41` (after PR #50,
the revert check), 2026-09-17: `tickets.test.mjs` 68/68,
`ticket-session-guard.test.mjs` 14/14, `check-invariants.test.mjs` 17/17,
`board.test.mjs` 9/9, `plan-page.test.mjs` 8/8, `run-epic.test.mjs`
120/120, `codex.test.mjs` 21/21, `codex-review.test.mjs` 19/19;
`check-invariants.mjs` exit 0; `tickets.mjs doctor` exit 0. The plan's 13
CHECKs (DEV-1 5, DEV-2 3, DEV-3 5) were each run with `tickets.mjs check`
and each fails on this tree, re-run with the same result by the second plan
review.

**Known risks.** DEV-1's parser must refuse Decisions prose that merely
uses the word "deviation"; if it cannot, the epic stops at ticket one and
the line's shape is redesigned. The unattended gate honours no closing
line, so it halts on a deviation an agent has already fixed — a clean-state
halt by design, and the thing the Outcome's reversal clause measures.
Branch protection on `main` answers 404 "Branch not protected"; the epic
runs attended and relies on no waiver.

**What this epic starts from.** `context/findings.md` (the evidence) and
`context/plan-review-2026-09-17.md` (two fresh-context plan reviews, five
blocking findings between them, all accepted). Signed off by Vadim
2026-09-17 with both of the planner's recommendations: only a human writes
`**Deviations closed:**`, and the unattended gate honours none. Run attended
through `/flow:ticket <ID>` in supervisor mode — the plugin is not installed
in the planning session, and DEV-3 changes the driver. `epics/design-fidelity/`
waits on this epic reaching `main`.
