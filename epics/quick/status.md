# Quick epic — status log

Append-only record of finished tickets. Tickets: `epics/quick/tickets.md`.

**Rules.** Append only. Corrections are new dated addenda beneath the entry they
correct, never edits. Report counts, not adjectives. The **Owed** line is
required even when empty.

### Q-1 — root CLAUDE.md — 2026-08-07 — DONE

**Built:** `CLAUDE.md` at the repository root: what the repo is (a plugin
marketplace with the single `flow` plugin), the exact test / smoke / syntax
commands with expected output, and seven invariants — zero-dependency script,
shared heading regexes coupled to doctor's near-miss checks, the ticket-ID and
commit-subject conventions, skill self-sufficiency vs METHODOLOGY.md,
version+CHANGELOG discipline for behaviour changes, reviewers never fix, and
every documented constraint carrying its reason.

**Files touched:** `CLAUDE.md` (new), `epics/quick/tickets.md` (new, Q-1 plan),
`epics/quick/status.md` (new, this file). Branch `q-1`, cut from `origin/main`.

**Verified:** `node --test plugins/flow/scripts/tickets.test.mjs` — 9 tests,
9 pass, 0 fail. `node plugins/flow/scripts/tickets.mjs doctor` — exits 0,
reports `✓ root agent instructions: CLAUDE.md`; its one remaining warning was
this file not existing yet, resolved by this commit.

**Decisions:** Test expectation written as "every test passing, count grows"
rather than pinning 9, so the file does not go stale on the next test added.
No plugin version bump — a repo-level doc changes no installed behaviour,
per this ticket's Not in scope.

**Owed:** Nothing.

**Addendum — review — 2026-08-07 — fable/medium:** No Important findings, no
nits; approved as-is. Both acceptance criteria re-run by the reviewer: 9/9
tests, doctor exit 0 with CLAUDE.md ✓. Every factual claim in CLAUDE.md traced
to source (regexes, shipped detection, the three files carrying heading
templates, zero-dependency and no-CI claims, version 1.4.0 = CHANGELOG head).
One pre-existing finding: `METHODOLOGY.md:3` still says "the four skills" of
what are now seven — handed to **Q-2**, added to this epic's ticket doc.
Nothing deferred from this ticket. The plugin's own reviewer agent was not
loadable in the working session, so the reviewer ran as a general agent
instructed by `agents/ticket-reviewer.md` + the review skill — same fresh
context, same rules.

### Q-3 — adopt the external review's shortlist — 2026-08-08 — DONE

**Built:** Plugin v1.5.0, four changes from the 2026-08-07 external
methodology review. (1) `skills/quick`: six risk triggers (auth boundaries,
secrets/crypto, migrations/data rewrites, new network exposure, payments,
fail-open) route work to `/flow:epic` at any size. (2) `skills/epic`: the
tickets.md template opens with a falsifiable **Outcome** block — problem,
observable change, evidence, reversal condition — and the integration-mode
text challenges "cannot ship alone" with expand/contract and flags.
(3) `agents/plan-reviewer`: two new findings — an outcome that cannot fail,
and integration mode chosen to avoid shippability design. (4) `skills/retro`:
fifth mining question checks the Outcome evidence (achieved / not achieved /
not yet assessable). METHODOLOGY.md gained the philosophy's name
(evidence-driven development under disposable context), the admission test,
and reasoning sections for the risk gate and the outcome line. CHANGELOG and
README updated.

**Files touched:** `plugins/flow/skills/quick/SKILL.md`,
`plugins/flow/skills/epic/SKILL.md`, `plugins/flow/skills/retro/SKILL.md`,
`plugins/flow/agents/plan-reviewer.md`,
`plugins/flow/.claude-plugin/plugin.json`, `METHODOLOGY.md`, `CHANGELOG.md`,
`README.md`, `epics/quick/tickets.md` (Q-3 plan), this file. Branch `q-3`,
cut from `origin/main` at the PR #1 merge commit.

**Verified:** `node --test plugins/flow/scripts/tickets.test.mjs` — 9 tests,
9 pass, 0 fail. `node plugins/flow/scripts/tickets.mjs doctor` — exit 0, all
five checks ✓. `plugin.json` version 1.5.0 equals the top CHANGELOG entry.

**Decisions:** The review's other proposals (standalone principles document,
per-ticket risk matrix, canary/shadow/kill-switch toolkit, production
observation artifacts) were rejected under the admission test as ceremony at
this project's scale — reasoning recorded in METHODOLOGY.md's admission-test
section so it is not re-argued later. Outcome checking was placed in retro
rather than any post-merge step, preserving "no command after the merge".
Older epics without an Outcome line are explicitly not retrofitted.

**Owed:** Nothing.
