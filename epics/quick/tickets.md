# Quick — one-off tickets

Source: standing epic for small work; each ticket carries its own context.

Release mode: serial

Status log: `epics/quick/status.md`. Run a ticket with `/flow:ticket <ID>`.

## Ground rules for every ticket in this epic

- Every ticket here is self-contained. Work that depends on another unshipped
  ticket does not belong in this epic.

## Q-1 — root CLAUDE.md

**Scope.**
- Write `CLAUDE.md` at the repository root: what this repository is, the exact
  test and smoke commands with their expected output, and the invariants that
  bind changes (the parser/doctor regex coupling, zero dependencies in
  `tickets.mjs`, skills self-sufficient with METHODOLOGY.md as reasoning only,
  version-and-changelog discipline for behaviour changes).

**Not in scope.** Rewriting README.md or METHODOLOGY.md; bumping the plugin
version (a repo-level doc changes no skill behaviour); per-skill documentation.

**Acceptance criteria.**
- `node --test plugins/flow/scripts/tickets.test.mjs` — 9 tests, 9 pass.
- `node plugins/flow/scripts/tickets.mjs doctor` — reports
  `root agent instructions: CLAUDE.md` as ✓ and exits 0.

## Q-2 — METHODOLOGY.md says "four skills"; there are seven

**Scope.**
- `METHODOLOGY.md:3` — "the rules live where they are executed, in the four
  skills" predates quick, doctor and retro. Fix the count (or drop the number
  so it cannot go stale again). Found by Q-1's review as pre-existing.

**Not in scope.** Any other METHODOLOGY.md editing.

**Acceptance criteria.**
- `grep -n "four skills" METHODOLOGY.md` — no matches.

## Q-3 — adopt the external review's shortlist: risk gate, outcomes, admission test, deployability nudge

**Scope.** The four accepted items from the 2026-08-07 external methodology
review (the rest was rejected as ceremony at this project's scale):
- `skills/quick`: risk triggers that route work to `/flow:epic` at any size
  (auth, secrets/crypto, migrations/data loss, new network exposure,
  payments, fail-open).
- `skills/epic`: an **Outcome** block in the tickets.md template — problem,
  observable change, evidence, reversal condition; plus one line steering
  integration mode toward expand/contract and flags first.
- `agents/plan-reviewer`: flag unfalsifiable outcomes and avoidable
  integration mode.
- `skills/retro`: a fifth mining question — was the outcome achieved?
- `METHODOLOGY.md`: name the philosophy, add the admission test, and record
  the reasoning for the risk gate and the outcome block.
- Version 1.5.0 + CHANGELOG entry (behaviour changes).

**Not in scope.** The review's rejected proposals: a standalone principles
document, a per-ticket risk matrix, a deployment toolkit (canary/shadow/kill
switches), production observation artifacts. Q-2 owns the "four skills" line.

**Acceptance criteria.**
- `node --test plugins/flow/scripts/tickets.test.mjs` — all tests pass, 0 fail.
- `node plugins/flow/scripts/tickets.mjs doctor` — exit 0.
- `plugins/flow/.claude-plugin/plugin.json` version equals the top
  CHANGELOG.md entry (1.5.0).

## Q-4 — decide whether the ticket skill's xhigh tier inherits payments and data rewrites

**Scope.**
- Q-3 made the quick skill's risk triggers a superset of the ticket skill's
  xhigh review-effort list (`skills/ticket` step 7): payments and
  data-deleting/rewriting changes route to an epic but then review at `high`,
  not `xhigh`. Found by Q-3's review. Decide deliberately — either add both
  triggers to the ticket skill's xhigh list, or record in METHODOLOGY.md why
  entry gating and review effort intentionally differ. Version bump if the
  skill changes.

**Not in scope.** Any other change to the effort scale or the quick triggers.

**Acceptance criteria.**
- The two lists either match or the difference is explained in METHODOLOGY.md
  with a reason; `grep -n "payment" plugins/flow/skills/ticket/SKILL.md
  METHODOLOGY.md` shows whichever was chosen.

## Q-5 — the board tells users to run a command that does not exist

**Scope.**
- `tickets.mjs` prints `/ticket <ID>` in its "Next up" section and the
  `tickets` skill's frontmatter/template references match — but the installed
  command is `/flow:ticket <ID>` (plugin commands are namespaced). A user
  followed the board's suggestion verbatim and got "Unknown command"
  (found live, 2026-08-08). Fix the printed string, sweep the plugin's other
  user-facing strings for the same mistake, and cover the output shape in the
  test suite.

**Not in scope.** Renaming skills or changing how the marketplace namespaces
them.

**Acceptance criteria.**
- `node plugins/flow/scripts/tickets.mjs list` output contains
  `/flow:ticket` and never bare `/ticket ` in Next up.
- A test asserts the Next up line's command string; full suite passes.
