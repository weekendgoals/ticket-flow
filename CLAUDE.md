# ticket-flow

A Claude Code plugin marketplace with one plugin, `flow` (`plugins/flow/`).
Flow 3.0 keeps epics and tickets in GitHub Issues: an epic is an issue
labelled `flow:epic`, its tickets are sub-issues, state is labels, progress
is one comment per step. `scripts/flow.mjs` is the command-line tool every
skill and host calls. `README.md` is the user manual; `METHODOLOGY.md` holds
the lessons behind the rules and no rules of its own — if it contradicts a
skill, the skill wins.

The four stages of the rewrite are done: planning, one ticket, a whole epic
on two hosts (`/flow:run` via `workflows/run-epic.mjs`, and the Action
`github/flow.yml`), and looking back (`flow stats`, `/flow:retro`).
`scripts/fidelity.mjs` with its test and fixtures stays as it is.

## Ticket Flow policy

Use Ticket Flow only when the user invokes `/flow:*` or asks for the Flow
methodology; ordinary requests run directly (implement, verify, report, no
epic). "Direct" or "without Flow" always overrides it.

## Layout

- `scripts/flow.mjs` — the CLI: planning (`init [--board]`, `doctor`,
  `board`, `next`, `ticket`, `check`, `post`, `label`, `create-epic`,
  `create-ticket`, `link`, `needs-human`), one ticket's steps (`start`,
  `accept`, `handoff`, `deliver`, `screenshots`, `meter`, `reset`), the pull-request
  loop (`pr-*`) and a whole epic (`dispatch`, `worktree`, `merge`,
  `check-epic`, `release-pr`, `design-map`), findings before they are
  tickets (`create-finding`, `found`, `promote`, `reject`), the project
  board (`board-sync`), and looking back (`stats`).
- `scripts/tracker/github.mjs` — every `gh` call, as plain functions (a Jira
  tracker can sit behind them); `tracker/fake-gh.mjs` is the tests' `gh`.
- `issue-body.mjs` (epic and ticket bodies, the design map), `checks.mjs`
  (the criteria grammar and runner), `epic-state.mjs` (labels, derived
  state, cycles, stuck), `ticket-steps.mjs` (the comments steps post and read
  back), `delivery.mjs` (every git call), `review-bots.mjs`, `meter.mjs`,
  `stats.mjs` (the figures `flow stats` reads back out of those comments),
  `worktree-setup.mjs` (`.flow.json` `copy`/`setup` in a fresh copy),
  `project-sync.mjs` (a linked GitHub Project's `Status` follows the state
  labels, best effort, never a source of state; `init --board` sets the
  board up and `board-sync` catches it up).
- `skills/triage/SKILL.md` — `/flow:triage`: approved findings become
  tickets (or are rejected, or sent to `/flow:epic`) after one table.
- `workflows/run-epic.mjs` — the `/flow:run` loop as a workflow script.
  `github/flow.yml` — the Action a project copies; it calls the same CLI.
- `tools/reporter/` — the reporter Chrome extension: plain browser modules,
  no build step; it files findings labelled `flow:found` with screenshots on
  `flow-findings`. `report-body.js` holds its pure parts (paths, the body,
  the fingerprint), `github.js` its REST calls.

## Commands

Every suite needs Node ≥ 20 and nothing else unless noted; pass each test
file path explicitly (`node --test <directory>` finds nothing here). Counts
as of 2026-10-18; the pass count grows, the fail line stays `# fail 0`.

- `node --test plugins/flow/scripts/flow.test.mjs` — `# pass 66`. The CLI
  end to end against the fake `gh`; one case needs `git` on PATH.
- `node --test plugins/flow/scripts/lifecycle.test.mjs` — `# pass 39`. The
  ticket steps in throwaway repositories with a bare remote; needs `git`, `sh`.
- `node --test plugins/flow/scripts/epic-run.test.mjs` — `# pass 32`. The
  whole-epic commands, the same way.
- `pull-request.test.mjs` `# pass 20`, `issue-body.test.mjs` `# pass 28`,
  `checks.test.mjs` `# pass 26` (real shell commands in a temp dir),
  `tracker/github.test.mjs` `# pass 33`, `fidelity.test.mjs` `# pass 54`,
  `stats.test.mjs` `# pass 13` (needs `git`), `project-sync.test.mjs`
  `# pass 24`, under `plugins/flow/scripts/`.
- `node --test plugins/flow/scripts/meter.test.mjs` — `# pass 16`. Builds
  its transcripts; no test reads a real one (they belong to whoever ran them).
- `node --test plugins/flow/scripts/worktree-setup.test.mjs` — `# pass 18`;
  needs `git`, POSIX `sh` and `sleep`.
- `node --test plugins/flow/workflows/run-epic.test.mjs` — `# pass 23`
  (stubbed `agent`, no git), `plugins/flow/github/flow.test.mjs` `# pass 13`.
- `node --test tools/reporter/reporter.test.mjs` — `# pass 18`. The
  extension's modules under a stubbed `fetch`. It is also their syntax
  check: plain `node --check` reads a `.js` file with no package.json as
  CommonJS, so the suite copies all seven modules to `.mjs` and checks each.
- **Syntax:** `node --check` on every `.mjs` under `plugins/flow/scripts/`.
  It does not work on `workflows/run-epic.mjs` (a module body with a
  top-level `return`); parse that one the way the workflow runtime does:
  `node -e 'const s=require("fs").readFileSync("plugins/flow/workflows/run-epic.mjs","utf8").replace(/^export const meta/m,"const meta");new (Object.getPrototypeOf(async function(){}).constructor)("agent","parallel","pipeline","log","phase","args","budget",s)'`
- **Doctor:** `node plugins/flow/scripts/flow.mjs doctor` prints `ok` on a
  repository set up for Flow; it needs a signed-in `gh`, so CI skips it.
- **Live plugin dev:** `/plugin marketplace add ~/projects/ticket-flow`.

CI (`.github/workflows/tests.yml`) runs every suite and check above.

## Invariants

- **Zero dependencies, nothing stored.** No npm package, no package.json, no
  cache or state file. Every fact is read from GitHub (through `gh`) and git
  each time; a stored copy drifts from the board it copies.
- **No code comments**, in the plugin's code or anything ported into it:
  names carry the meaning, and a comment is a second copy nobody tests.
- **Every `gh` call goes through `tracker/github.mjs`**, as `gh api` with
  JSON in and out; never scrape `gh`'s text, which changes between versions.
- **Tests never reach the network or real GitHub**: the fake `gh` fails an
  unexpected call instead of letting it fall through.
- **`Blocked by:` is strict.** `Blocked by: #12, #14` at the start of a line,
  issue numbers and commas only. A line that mentions blocking and does not
  parse is a named problem the board, `next` and `doctor` print, and the
  ticket waits. Never make the parse tolerant: a tolerant parse once stalled
  tickets on prose with nothing saying why.
- **A finding is not a ticket**: nothing reads `flow:found` as work;
  `promote` is the only way in and needs a person's `flow:approved` and
  parseable criteria, because evidence without a gate is not a ticket.
  The finding's own text rides along under `## Report`, and nothing below
  that heading is read as the ticket: a reporter must not be able to write
  criteria or blockers.
- **Ready is derived, never a label**: planned, epic `flow:approved`, every
  blocker `flow:done`, no problem. Approval is enforced there, in the one
  command a driver runs, so nothing can start without it.
- **`next` exits 1 when an epic is not approved, has no tickets, or is
  stuck**, because a driver reads exit 0 with nothing ready as "built".
- **A ticket with no criteria fails its check**: anyone with write access can
  edit the body, so a missing or empty ```` ```criteria ```` block is a
  problem, never an empty pass, and `create-ticket` refuses it.
- **The criteria grammar is one format** shared by `checks.mjs`, the epic
  skill's template and every step that runs criteria. A change to
  CHECK/EXPECT/COMPARE/LANDMARKS moves the parser, the skill and the tests in
  the same commit. A skipped run never passes; a COMPARE is manual and counts
  in neither total nor passed; a malformed line fails the check rather than
  silently never running.
- **A person merges into the default branch, and nothing runs after.** No
  agent merges or pushes toward it; both hosts end at the release pull
  request. `Branch:` must start with `epic/`, refused everywhere otherwise.
  The one agent merge is a ticket into its epic branch, by the accepted
  commit, never by a name that could move.
- **The reviewer never sees the builder's transcript or reasoning**, not even
  a summary: an explanation of why code is right makes a reviewer agree.
- **An instruction file holds only what cannot be derived.** A line that
  restates the code, a test or a command's own help, or narrates history,
  is a reviewer's finding (`agents/ticket-reviewer.md` states the rule;
  README quotes it word for word), and the retro proposes deletions beside
  additions: the file is read by every session, so it only grows otherwise.
- **A handoff states decisions, never reasoning.** `flow handoff` posts what
  a ticket decided that the plan did not say, and `flow ticket` hands the
  latest one of each done ticket to the next builder and its reviewer; a
  handoff that explained why code is right would be the builder's reasoning
  reaching a reviewer.
- **Criteria edited after a ticket starts refuse acceptance** (the latest
  start draws the line): whoever edited the gate may not have approved it.
  `accept` takes only the HEAD the latest review read; only the commit it
  accepted is merged. Markers count only from the running account
  (`FLOW_ACCOUNT`, else GitHub's answer, else refuse), at a comment's start:
  anyone can post or quote one. `stats` gates nothing in the plugin, so it reads all;
  the retro reads it to know the PR merged, which GitHub answers.
- **A ticket stops only when no agent may decide**: a gate failing after two
  rounds of fixes (acceptance, review, pull request; `accept` counts review
  rounds), plan and work disagreeing, or a merge conflict; an epic also for
  checks failing at its head after merging. Infrastructure halts are noise.
- **The run driver re-reads GitHub and trusts no agent's report.** Each
  round starts from `flow next`; an agent's answer only routes the next step,
  never names a commit to merge, and every gate is a command that reads the
  issue. A dead builder is reset once, then goes to a person (one dead
  before `start` is rebuilt once too: two rebuilds in all).
- **A parallel failure falls back to serial and never halts**, with a
  comment on the epic. Merges into an epic branch are one at a time, in the
  epic's order whichever ticket finished first, then `check-epic`.
- **A figure is observed or `unknown`, never estimated**: the meter writes
  `unknown` for what no transcript records, and `stats` for what no comment
  or commit carries; a partial sum says how many tickets it covers. A guess
  reads like a measurement, and the retro would learn from it.
- **Reviewers report and never fix; the researcher observes and never
  proposes.** Never give `plan-reviewer` or `ticket-reviewer` write
  instructions, and never hand `researcher` the request, the wanted solution
  or the ticket list: told the answer, it confirms it.
- **Reviewers, the researcher and the retro miner run on the strongest
  model.** Never a cheaper one: what they miss cannot be checked afterwards.
- **A gate lives in the command its actor runs**, and the recovery it
  advertises must work from the refused state.
- **Skills are self-sufficient**; each rule carries its reason in a clause.
- **Plain language** for a person who does not know Flow; the 2.x words
  (deviation, owed, ledger, lane, supervisor, disposition…) are retired.
- **A CHANGELOG.md entry for every behaviour change**, in the same commit:
  installed projects update live, so an unrecorded change is a silent one.
  Entries collect under the newest unreleased heading; the pull request that
  brings them to the default branch stamps the version and date and bumps
  `plugins/flow/.claude-plugin/plugin.json` in the same commit.
- **A rule stated in more than one document is one rule.** Before changing
  a sentence that states one, grep its key phrase across the skills, agents,
  README, METHODOLOGY and this file, and change every copy together.
