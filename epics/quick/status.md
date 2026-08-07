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
