# ticket-flow

A Claude Code plugin marketplace with one plugin, `flow` (`plugins/flow/`):
skills and agents that run work as epics and tickets, plus `tickets.mjs`, the
script that derives the board from git. `README.md` is the user-facing manual;
`METHODOLOGY.md` is reasoning only and contains no rules — if it contradicts a
skill, the skill wins.

This repository runs its own flow: one-off work goes through `/flow:quick`
into `epics/quick/`, and commit subjects carry the ticket ID (`Q-1: …`).

## Commands

- **Tests:** `node --test plugins/flow/scripts/tickets.test.mjs` — expect
  every test passing (`# pass 9`, `# fail 0` as of Q-1; the count grows, the
  fail line does not). The suite builds a throwaway git repo in a temp dir; it
  needs `git` on PATH and nothing else.
- **Smoke:** `node plugins/flow/scripts/tickets.mjs doctor` — must exit 0 on
  this repo. `… list` shows the board.
- **Syntax check:** `node --check plugins/flow/scripts/tickets.mjs`.
- **Live plugin dev:** `/plugin marketplace add ~/projects/ticket-flow`, then
  `/reload-plugins` to pick up skill edits mid-session.

There is no package.json, linter, or CI. Node ≥ 20 (built-in test runner);
`node --test <directory>` does not discover files here — pass the test file
path explicitly.

## Invariants

- **`tickets.mjs` has zero dependencies and stores nothing.** Every fact is
  recomputed from git, `gh`, and document headings. Never add a cache, a state
  file, or an npm dependency.
- **The heading regexes are load-bearing and shared.** `TICKET_HEADING` and
  `STATUS_HEADING` are used by both the parsers and `doctor`'s near-miss
  detection — that coupling is the point. If a heading format changes, the
  templates in `skills/epic/SKILL.md`, `skills/ticket/SKILL.md` and
  `skills/quick/SKILL.md` must change in the same commit, and a test must
  cover the new shape.
- **Ticket IDs match `[A-Z][A-Z0-9]*-\d+`**, branches are the lowercased ID,
  and shipped detection reads `^<ID>[:\s]` off commit subjects on the default
  branch. Changing any of these breaks every installed project's board.
- **Skills are self-sufficient.** An agent executing a skill never needs
  METHODOLOGY.md. New rules go in the skill that executes them; new reasoning
  goes in METHODOLOGY.md; both in the same commit when a constraint changes.
- **A behaviour change to any skill, agent or the script bumps
  `plugins/flow/.claude-plugin/plugin.json` and gets a CHANGELOG.md entry** in
  the same commit — installed projects update live, so an unversioned change
  is a silent one.
- **Reviewers report and never fix.** Do not give `ticket-reviewer` or
  `plan-reviewer` write instructions, and do not add post-merge steps to any
  skill — a human merges, nothing runs after.
- **The two risk lists are one list.** The quick skill's entry triggers and
  the ticket skill's `xhigh` review tier measure the same consequences at two
  doors — a trigger added to either is added to the other in the same commit.
- **New artifacts and gates must pass the admission test** (METHODOLOGY.md §
  "The admission test"): reduce uncertainty, constrain blast radius, preserve
  necessary knowledge, or provide decision evidence — at least one, or it is
  ceremony and does not land.
- **Docs style: every constraint carries its reason.** A bare rule ("never
  squash") without its mechanism (subjects are how shipped is detected) will
  be "simplified" away by a future session.
