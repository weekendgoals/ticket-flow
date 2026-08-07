# Changelog

The plugin is the methodology's distribution mechanism: a change to a skill is
a behaviour change in every project that installs it. This file is what makes
those changes deliberate and visible.

## 1.4.0 — 2026-08-07

- **New agent `flow:plan-reviewer`, wired into `/flow:epic`.** Before the
  sign-off gate, a fresh-context agent reads the draft decomposition against
  the actual code and reports — oversized tickets, ordering that doesn't
  de-risk, uncheckable criteria, dependencies hiding in prose — plus questions
  only the human can settle, carried into sign-off unchanged. It never rewrites
  the plan.
- **New skill `/flow:doctor`** — is this project ready for the flow? The
  deterministic half is `tickets.mjs doctor`: remote, `origin/HEAD`, `gh`,
  merge settings, instruction-file existence, duplicate IDs — and headings
  that *almost* parse, which otherwise silently read as "not done". The
  judgment half reads the instruction files for what the skills will actually
  ask of them (the exact test command above all).
- **New skill `/flow:retro`** — close a finished epic: collect Owed lines
  nothing inherited, constraints rediscovered by multiple tickets, defect
  classes review kept finding, and planning misses. Proposes at a hard gate;
  approved lessons ship via `/flow:quick`, owed work becomes tickets, and the
  status log gains one final appended `## Retro` section.

## 1.3.0 — 2026-08-07

## 1.3.0 — 2026-08-07

- **New skill `/flow:quick <description>`** — one small piece of work through
  the full loop (scope, verify, review, log, pull request) with no epic
  ceremony. Tickets accumulate as `Q-<n>` in the standing `epics/quick/` epic;
  the branch cuts from the default branch and carries the docs itself. Includes
  a hard size gate: work that doesn't fit is redirected to `/flow:epic`.
- **Board: new `integrated` state.** A pull request merged into an epic branch
  (integration mode) no longer reads as `shipped`; it is `integrated` until the
  release pull request lands on the default branch.
- **Board: duplicate ticket IDs are detected.** An ID defined in two epics is
  flagged on the board, and `find` refuses it instead of silently resolving to
  an arbitrary epic.
- **Board: the shipped-detection scan cap is no longer silent.** When only the
  last 4000 commits were scanned, the board says so.
- **Epic: the epic branch is cut from `origin/<default>`**, never from whatever
  branch planning happened to run on.
- **Review: the default range is computed against the branch's real base** —
  the pull request's base ref, or `epic/<name>` in integration mode — not
  blindly against `origin/HEAD`.
- **Squash guidance relaxed.** A single-ticket pull request titled
  `<ID>: <title>` survives squash (the squash commit inherits the title); only
  multi-ticket release pull requests must merge with a merge commit.
- **The reviewer model is no longer hardcoded.** The agent inherits, and
  `/flow:ticket` instructs passing the strongest model available rather than a
  literal model name.
- **Tests for `tickets.mjs`** — a fixture-repo suite:
  `node --test plugins/flow/scripts/tickets.test.mjs`.

## 1.2.0 and earlier

Pre-changelog: initial plugin (epic, ticket, tickets, review, the reviewer
agent, `tickets.mjs`), reviewer memory rules, epic sources and the
one-branch-per-epic model. See git history.
