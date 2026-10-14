# ticket-flow

A Claude Code plugin marketplace with one plugin, `flow` (`plugins/flow/`).
Flow 3.0 keeps epics and tickets in GitHub Issues: an epic is an issue
labelled `flow:epic`, its tickets are sub-issues, state is labels, progress
is one comment per step. `scripts/flow.mjs` is the command-line tool every
skill and host calls. `README.md` is the user manual; `METHODOLOGY.md` holds
the lessons behind the rules and no rules of its own — if it contradicts a
skill, the skill wins.

Stages 1 and 2 (this state) rewrote planning and building one ticket: the
CLI and its modules, skills `epic`, `ticket`, `review`, `quick`, and all
three agents. Still 2.x and due for rewrite: skills `run` and `retro`,
`workflows/`, `scripts/worktree-setup.mjs`; leave them alone until their
stage. `scripts/fidelity.mjs` with its test and fixtures stays as it is.

## Ticket Flow policy

Use Ticket Flow only when the user explicitly invokes `/flow:*` or asks to
use the Flow methodology. Ordinary implementation requests run directly:
implement, verify, report, no epic or tickets. "Direct" or "without Flow"
always overrides it.

## Layout

- `scripts/flow.mjs` — the CLI: planning (`init`, `doctor`, `board`, `next`,
  `ticket`, `check`, `post`, `label`, `create-epic`, `create-ticket`, `link`,
  `needs-human`), one ticket's steps (`start`, `accept`, `deliver`,
  `screenshots`, `meter`) and the pull-request loop (`pr-*`).
- `scripts/tracker/github.mjs` — every `gh` call, as plain functions, so a
  Jira tracker can sit behind the same surface later.
- `scripts/tracker/fake-gh.mjs` — the fake `gh` the tests put first on PATH:
  canned JSON keyed by method and path, every call recorded.
- `scripts/issue-body.mjs` — reads epic and ticket bodies: sections,
  settings, `Epic:`, `Blocked by:`, the task list, the criteria block.
- `scripts/checks.mjs` — the CHECK/EXPECT/COMPARE/LANDMARKS grammar and runner.
- `scripts/epic-state.mjs` — labels, derived state (`ready`, `waiting`),
  cycles, the stuck verdict.
- `ticket-steps.mjs` (when a ticket may start; the comments steps post and
  read back), `delivery.mjs` (every git call: branch, merge in a temporary
  worktree, retries), `review-bots.mjs` (Copilot or CodeRabbit), `meter.mjs`.

## Commands

Every suite needs Node ≥ 20 and nothing else unless noted; pass each test
file path explicitly (`node --test <directory>` finds nothing here). Counts
as of 2026-10-15; the pass count grows, the fail line stays `# fail 0`.

- `node --test plugins/flow/scripts/flow.test.mjs` — `# pass 46`. The CLI
  end to end against the fake `gh`; one case needs `git` on PATH.
- `node --test plugins/flow/scripts/lifecycle.test.mjs` — `# pass 22`. The
  ticket steps in throwaway repositories with a bare remote; needs `git`, `sh`.
- `node --test plugins/flow/scripts/pull-request.test.mjs` — `# pass 16`.
- `node --test plugins/flow/scripts/issue-body.test.mjs` — `# pass 23`.
- `node --test plugins/flow/scripts/checks.test.mjs` — `# pass 26`. Runs real
  shell commands in a temp dir.
- `node --test plugins/flow/scripts/tracker/github.test.mjs` — `# pass 18`.
- `node --test plugins/flow/scripts/fidelity.test.mjs` — `# pass 54`.
- `node --test plugins/flow/scripts/meter.test.mjs` — `# pass 13`. Builds
  its transcripts; no test reads a real one (they belong to whoever ran them).
- `node --test plugins/flow/scripts/worktree-setup.test.mjs` — `# pass 17`;
  needs `git`, POSIX `sh` and `sleep`.
- `node --test plugins/flow/workflows/run-epic.test.mjs` — `# pass 182`.
- **Syntax:** `node --check` on every `.mjs` under `plugins/flow/scripts/`.
  It does not work on `workflows/run-epic.mjs` (a module body with a
  top-level `return`); parse that one the way the workflow runtime does:
  `node -e 'const s=require("fs").readFileSync("plugins/flow/workflows/run-epic.mjs","utf8").replace(/^export const meta/m,"const meta");new (Object.getPrototypeOf(async function(){}).constructor)("agent","parallel","pipeline","log","phase","args","budget",s)'`
- **Doctor:** `node plugins/flow/scripts/flow.mjs doctor` — prints `ok` and
  exits 0 on a repository set up for Flow. It needs a signed-in `gh`, so CI
  does not run it.
- **Live plugin dev:** `/plugin marketplace add ~/projects/ticket-flow`, then
  `/reload-plugins`.

CI (`.github/workflows/tests.yml`) runs every suite and syntax check above,
so a local run and the pull-request gate cannot drift apart.

## Invariants

- **Zero dependencies, nothing stored.** No npm package, no package.json, no
  cache or state file. Every fact is read from GitHub (through `gh`) and git
  each time; a stored copy drifts from the board it copies.
- **No code comments.** Names carry the meaning; a comment is a second copy
  of the code that nobody tests. This applies to the plugin's own code and to
  anything ported into it.
- **Every `gh` call goes through `tracker/github.mjs`**, as `gh api` with
  JSON in and JSON out, writes sent on stdin. Never scrape `gh`'s text
  output: it changes between versions.
- **Tests never reach the network or real GitHub.** They put the fake `gh`
  first on PATH; an unexpected call fails the test instead of falling through.
- **`Blocked by:` is strict.** `Blocked by: #12, #14` at the start of a line,
  issue numbers and commas only. A line that mentions blocking and does not
  parse is a named problem the board, `next` and `doctor` print, and the
  ticket waits. Never make the parse tolerant: a tolerant parse once stalled
  tickets on prose with nothing saying why.
- **Ready is derived, never a label.** A `flow:planned` ticket is ready when
  its epic has `flow:approved`, every blocker is `flow:done` and it has no
  problem. Approval is enforced there, in the one command a driver runs, so
  a single label on GitHub approves an epic and nothing can start without it.
- **`next` exits 1 when an epic is not approved, has no tickets, or is stuck**
  (unfinished tickets, none ready, none in progress). A driver reads exit 0
  with nothing ready as "built"; none of these may read that way.
- **A ticket with no criteria fails its check.** The issue body is editable by
  anyone with write access, so a missing or empty ```` ```criteria ```` block
  is a problem, never an empty pass; `check` also returns the body's edit
  history so a later step can see who changed it. `create-ticket` refuses
  such a ticket at the door.
- **The criteria grammar is one format** shared by `checks.mjs`, the epic
  skill's template and every step that runs criteria. A change to
  CHECK/EXPECT/COMPARE/LANDMARKS moves the parser, the skill and the tests in
  the same commit. A skipped run never passes; a COMPARE is manual and counts
  in neither total nor passed; a malformed line fails the check rather than
  silently never running.
- **A person merges into the default branch, and nothing runs after.** No
  agent merges or pushes toward the default branch. The one sanctioned agent
  merge is a ticket branch into its epic branch, by the verified commit, never
  by a name that could move.
- **The reviewer never sees the builder's transcript or reasoning**, not even
  a summary: an explanation of why the code is right is what makes a
  reviewer agree with it.
- **Criteria edited after a ticket starts refuse acceptance.** `accept`
  compares the body's edit history with the start comment, because the
  criteria are the gate and whoever edited them may not be who approved them.
  `deliver` takes only the commit a passing acceptance named.
- **Two review rounds, then a person** (also for acceptance fixes and the
  pull-request loop). A ticket stops only for that, a contradiction between
  ticket and code, or a merge conflict; a halt on infrastructure is noise.
- **The meter never estimates**: a figure no transcript records is `unknown`.
- **Reviewers report and never fix; the researcher observes and never
  proposes.** Never give `plan-reviewer` or `ticket-reviewer` write
  instructions, and never hand `researcher` the request, the wanted solution
  or the ticket list: told the answer, it confirms it.
- **Reviewers and the researcher run on the strongest model.** Never pin a
  cheaper one to save cost: what they miss cannot be checked afterwards.
- **A gate lives in the command its actor runs.** A refusal in a sibling
  command guards nothing, and the recovery it advertises must work from the
  refused state.
- **Skills are self-sufficient.** An agent running a skill never needs
  another document; each rule carries its reason in one short clause.
- **Plain language.** Skills and what they post are written for a person who
  does not know Flow. The 2.x vocabulary (deviation, owed, addendum, ledger,
  preamble, lane, supervisor, consequence tier, disposition) is retired.
- **A CHANGELOG.md entry for every behaviour change**, in the same commit:
  installed projects update live, so an unrecorded change is a silent one.
  Entries collect under the newest unreleased heading; the pull request that
  brings them to the default branch stamps the version and date and bumps
  `plugins/flow/.claude-plugin/plugin.json` in the same commit.
- **A rule stated in more than one document is one rule.** Before changing
  a sentence that states one, grep its key phrase across the skills, agents,
  README, METHODOLOGY and this file, and change every copy together.
