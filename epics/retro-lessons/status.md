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
