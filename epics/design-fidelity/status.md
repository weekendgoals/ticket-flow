# Design fidelity epic — status log

Append-only record of finished tickets. Tickets: `epics/design-fidelity/tickets.md`.

**Rules.** Append only. Corrections are new dated addenda beneath the entry they
correct, never edits. Report counts, not adjectives. The **Owed** line is
required even when empty.

## Baseline — 2026-09-17

**What exists today.** The plugin has no way to name a design. An epic's
preamble has no line for one (`parsePreambleText`, `tickets.mjs:143`, reads
delivery, three model lines, the runner, the shadow reviewer, two glob
lists and the budget); the only machine-read criterion is `CHECK:`/`EXPECT:`
(`:279`); the reviewer's packet — ticket skill step 7, quick step 6, the
driver's packet body (`run-epic.mjs:1227`) and the Codex runner's pinned
copy — is the range, the brief, the ticket's own entry and the instruction
files; the plan reviewer is given `tickets.md`, `context/` and the
instruction files. No script compares anything rendered. The epic skill has
a `demonstrate:` form for behaviour no command reaches, and nothing steers a
UI ticket toward it.

**What is verified, and how.** On `origin/main` at `b96da41` (after PR #50,
the revert check), 2026-09-17: `tickets.test.mjs` 68/68,
`ticket-session-guard.test.mjs` 14/14, `check-invariants.test.mjs` 17/17,
`board.test.mjs` 9/9, `plan-page.test.mjs` 8/8, `run-epic.test.mjs`
120/120, `codex.test.mjs` 21/21, `codex-review.test.mjs` 19/19;
`check-invariants.mjs` exit 0; `tickets.mjs doctor` exit 0. The plan's 25
CHECKs (FID-1 4, FID-2 3, FID-3 4, FID-4 5, FID-5 5, FID-6 4) were each run
with `tickets.mjs check` and each fails on this tree, re-run with the same
result by the second plan review.

**Known risks.** Nothing has yet shown that a page-side extractor can be
made self-contained and useful without the plugin owning a browser; FID-1
is first for that reason, and the plan says what ships if it cannot. FID-1
is the largest ticket in either epic (550–700 lines by the reviewer's
estimate) and carries its own stop-and-split condition. The design map is
the root every comparison rests on: an element no landmark covers is silent
by omission, which FID-5's plan-review lens exists to catch. The extractor's
fixed property set may read as noise on a real page (`width`/`height`
within 0.5px especially); the smoke test records which. Branch protection
on `main` answers 404 "Branch not protected"; the epic runs attended and
relies on no waiver.

**What this epic starts from.** `context/findings.md` (the evidence, both
rounds) and `context/plan-review-2026-09-17.md` (two fresh-context plan
reviews, five blocking findings between them, all accepted). Signed off by
Vadim 2026-09-17. **It does not start until `epics/deviation-routing/` has
reached `main`**: FID-3 writes `**Deviation:**` lines and FID-4's `compared`
subcommand reads the log through the reader DEV-1 adds; FID-1 and FID-2 do
not depend on it. Run attended through `/flow:ticket <ID>` in supervisor
mode — the plugin is not installed in the planning session, and FID-4
changes the driver.
