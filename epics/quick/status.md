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
