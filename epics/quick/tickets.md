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

## Q-5 — ship the autonomous epic's retro

**Scope.**
- Append the `## Retro — 2026-08-08` section to `epics/autonomous/status.md`:
  outcome verdict, lessons, and where each one went.
- `CLAUDE.md`: two invariants distilled from the epic's five reviews — a rule
  stated in more than one document is one rule; a gate is verified at the
  door its actor walks through.
- `skills/epic`: the Run-mode template obligates probing environment
  prerequisites at plan time; the Outcome template asks the evidence line to
  name an observer that can distinguish the outcomes.
- `skills/ticket`: the status entry's **Owed** line requires a carrier that
  can structurally reach the deferred check.
- `METHODOLOGY.md` § "Why the human gate can move to the release pull
  request": the observer lesson from the first live run.
- Append the retro's owed-work queue as tickets Q-6–Q-12 below.
- Version 1.14.0 + CHANGELOG (skill templates change installed behaviour).

**Not in scope.** Executing Q-6–Q-12; the quick skill's lane change (Q-6);
retrofitting Outcome lines onto older epics.

**Acceptance criteria.**
- Standing checks green: both test suites all pass, `doctor` exit 0,
  `node --check plugins/flow/scripts/tickets.mjs` clean.
- `plugin.json` version equals the top CHANGELOG entry (1.14.0).
- `grep -c "## Retro — 2026-08-08" epics/autonomous/status.md` — exactly 1.

## Q-6 — /flow:quick routes through the ticket loop's lane fork

**Scope.**
- `skills/quick` step 4 enters the ticket skill at step 4, in-session — so a
  session marked by an earlier `--interactive` run can still implement with
  contaminated context, and quick's implementer still hires its own reviewer:
  the two holes AUTO-5's review handed to the retro. Route quick through the
  ticket skill's **step 0** instead: after writing the ticket and branching,
  the session becomes the supervisor — a fresh-context worker implements from
  the ticket text, the supervisor hires the reviewer; `--interactive` remains
  available and marks the session like any interactive ticket. The routed
  lane keeps quick's own steps 1–3 (gate, ticket written, `q-<n>` cut from
  the default branch, plan committed): the supervisor spawns the worker onto
  that existing branch with ticket steps 1–3 scoped out of its prompt —
  step 0 already lets a spawn prompt scope steps — so the worker executes
  implement-through-log (ticket steps 4–6) and the review loop follows as
  the ticket skill writes it. Retro decision, 2026-08-08: the user chose
  routing over a documented opt-out — quick's savings are planning ceremony,
  never execution hygiene.
- METHODOLOGY records that reasoning in the same commit.
- Version bump + CHANGELOG.

**Not in scope.** The guard's marker semantics; the ticket skill's step 0
itself.

**Acceptance criteria.**
- The quick skill instructs the supervisor lane (grep for "step 0") and no
  longer enters at step 4 in-session by default.
- Standing checks green (both suites, doctor exit 0).
- If no earlier queue ticket has recorded it yet: running this ticket via
  `/flow:ticket Q-6` performs AUTO-5's owed live check — the status entry's
  Mode line names a worker and the supervisor session makes no
  implementation edits — recorded as a dated addendum to AUTO-5's entry in
  `epics/autonomous/status.md`.

## Q-7 — configurable reviewer model

**Scope.**
- The reviewer model is fixed in skill text ("strongest available — `opus`
  at the time of writing"); redirecting it took a mid-run conversational
  directive (AUTO-4, 2026-08-08). Make it configuration: an optional
  `Reviewer model: <model>` line in an epic's tickets.md preamble, parsed by
  `tickets.mjs` alongside the mode lines (same tolerant parse) and exposed
  in `find --json` and `list --json`; the ticket and run skills read it when
  spawning reviewers and fall back to today's "strongest available" when
  absent. Tests for present, absent and prose-decorated lines. Version bump
  + CHANGELOG.

**Not in scope.** Changing the default; per-ticket overrides; the effort
tiers.

**Acceptance criteria.**
- Parser tests for the new line pass; both suites green, doctor exit 0.
- `find --json` on a fixture epic with the line returns its value; without
  the line, null.
- The ticket skill's step 7 names the config point (grep "Reviewer model").

## Q-8 — unfiltered list claims "no epics found" when epics exist

**Scope.**
- `tickets.mjs`: unfiltered `list` prints `no epics found` when epic folders
  exist but none has ticket sections yet (BOARD-2's review, pre-existing).
  Name the epics and their empty state instead. Test fixture. Version bump +
  CHANGELOG.

**Not in scope.** Any other change to list output.

**Acceptance criteria.**
- New test: an epic whose tickets.md has no ticket sections → unfiltered
  `list` names the epic and does not print "no epics found". Suite green,
  doctor exit 0.

## Q-9 — plain find prints "pr [object Object]"

**Scope.**
- `tickets.mjs`: the human-readable `find <ID>` output stringifies the PR
  object (BOARD-3's review, pre-existing). Render number, state and URL.
  A test pins the rendered line. Version bump + CHANGELOG.

**Not in scope.** `find --json` (already correct).

**Acceptance criteria.**
- New test pins the rendered PR line; suite green, doctor exit 0.

## Q-10 — the run skill's protection gate: document 403, honor a recorded waiver

**Scope.**
- `skills/run` step 3 documents success and the 404→rulesets fallthrough,
  but a private repo under a free-plan org returns **403** on both
  endpoints (AUTO-4's live run), and the probe's nonzero exit is itself a
  stop condition — an unattended run would halt with nobody present on an
  environment shape the skill never named. Document 403 as "protection
  unavailable on this plan — report, and proceed only on a recorded
  waiver", and define where the driver finds a pre-recorded human waiver:
  the epic's tickets.md, as AUTO-4's amended criterion did it. Version bump
  + CHANGELOG.

**Not in scope.** Making protection a doctor check (it is environment
setup, not plugin code); any script change.

**Acceptance criteria.**
- The run skill names 403 and where a waiver is found (grep "403",
  grep -i "waiver"). Doctor exit 0.

## Q-11 — token accounting: a Tokens line per ticket, a sum per epic

**Scope.** User request at the autonomous retro, 2026-08-08.
- `skills/ticket` step 6 template: a **Tokens** line — what the harness
  reports for the run, worker and reviewer separately where they are
  separate agents; `unknown` is tolerated and honest when the harness
  exposes nothing. The number is planning evidence, never a gate.
- `skills/run`: the run record carries per-ticket and total tokens on the
  same terms. `skills/retro`: the report sums what the status log carries
  per epic.
- Version bump + CHANGELOG.

**Not in scope.** Any storage outside the status documents — `tickets.mjs`
stores nothing and parses no cost data; enforcing accuracy the harness
cannot provide.

**Acceptance criteria.**
- The three skills carry the line (grep -l "Tokens" across ticket, run,
  retro skills).
- Standing checks green.

## Q-12 — the retro runs in fresh context

**Scope.** User request at the autonomous retro, 2026-08-08.
- `/flow:retro` mines the record in the invoking session — often the same
  session that planned or ran the epic, carrying exactly the opinions the
  retro should examine. Give it the supervisor shape the ticket lane already
  has: the invoking session spawns a fresh-context agent to read the whole
  record and produce the report and proposals; the approval gate and the
  shipping stay with the human's session. Version bump + CHANGELOG.

**Not in scope.** Changing the gate or what ships after approval.

**Acceptance criteria.**
- The retro skill instructs the fresh-context spawn and keeps the gate
  in-session (grep). Doctor exit 0.
