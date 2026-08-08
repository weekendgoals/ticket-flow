# ticket-flow

A Claude Code plugin that runs work as **epics** and **tickets**, from a request
through to a reviewed pull request — and derives the board from git instead of
asking anyone to maintain one.

Eight skills, two reviewer agents, one script, one session hook. No database,
no config file, no state stored anywhere — except one per-session marker in
the OS temp dir (the interactive-ticket guard's memory of the current
conversation; it dies with the session's context and never touches the
repository).

| | |
|---|---|
| `/flow:epic <name> [source...]` | Turn a request, report or conversation into `epics/<name>/`. Sources are files, globs or URLs, saved into `context/`; with none, the conversation is the brief. A fresh-context **plan reviewer** challenges the decomposition, then it **stops for sign-off** and commits — no pull request |
| `/flow:ticket <ID>` | One ticket end to end: branch, implement, verify, log, commit, review, fix, push, pull request. Runs **supervisor-mode by default** — a fresh-context worker implements from the documents and the supervisor hires the reviewer; `--interactive` runs in-session, once per session (a hook refuses a second interactive run; supervisor runs stay open) |
| `/flow:run <epic>` | Run a `Run mode: autonomous` epic end to end with nobody present: verifies sign-off happened, loops the tickets in document order — each in a **fresh-context agent** that implements, reviews, fixes and merges into `epic/<name>` — halts on any stop condition, and ends by **opening** the release pull request. Never merges toward the default branch |
| `/flow:quick <description>` | One **small, low-risk** piece of work through the same loop — scope, review, log, pull request — with no epic ceremony. Size- **and risk-gated**: auth, secrets, migrations and other consequential work is routed to `/flow:epic` at any size. Writes a `Q-<n>` ticket into the standing `epics/quick/` epic and runs it |
| `/flow:tickets [epic]` | The board — shipped, in flight, blocked, todo |
| `/flow:review [range]` | Review a commit range and report. Used by `/flow:ticket`; runnable on its own |
| `/flow:doctor` | Is this project ready for the flow? Preconditions, merge settings, instruction-file quality, and headings that would silently misparse |
| `/flow:retro [epic]` | Close a finished epic: mine the status log and review addenda for owed work and lessons, then ship them into instruction files and tickets |

You review the pull request and merge it. **There is no command after the
merge.** In an autonomous epic the pull request you review is the release one —
the gate moves, it never disappears.

## Install

```
/plugin marketplace add ~/projects/ticket-flow
/plugin install flow@ticket-flow
```

Local edits are picked up live; run `/reload-plugins` to pick them up mid-session.

## What it expects from a project

Almost nothing, and nothing you have to create up front — and `/flow:doctor`
checks all of it, so run that first in a new project.

- **A git repository with a remote**, and `gh` authenticated. Without `gh` the
  board degrades to git-only facts and says so.
- **`epics/` at the repository root.** `/flow:epic` creates it. An epic is any
  directory under it containing `tickets.md`; there is no index to keep honest.
- **Agent instructions** — `CLAUDE.md` or `AGENTS.md` at the root, and ideally
  one per service or workspace. The skills read run and test commands from them
  rather than guessing, so a project that documents its own commands needs no
  plugin configuration at all.
- **Never squash a multi-ticket pull request.** The board reads per-ticket
  commit subjects off the default branch to decide what has shipped. A
  single-ticket pull request titled `<ID>: <title>` survives squash — the squash
  commit inherits the title — so orgs that mandate squash can use serial mode
  as-is. An integration **release** pull request carries many tickets and must
  merge with a merge commit.

## The three documents

| Document | Job | Mutation rule |
|---|---|---|
| `CLAUDE.md` (root, and per area) | What the project **is** | Edited in place, **in the same commit** as the change it describes |
| `epics/<e>/tickets.md` | What the work **is** | Written up front. Edited to re-plan, never to record progress |
| `epics/<e>/status.md` | What **happened** | Append-only. Corrections are dated addenda |
| `epics/<e>/context/` | What it was based on | Frozen. Add, never rewrite |

The status log is a **diary, not a dashboard**. "Which tickets are done" is
answered by `/flow:tickets`, computed fresh from ticket headings, status-log
headings, git branches, commit subjects on the default branch, and `gh pr list`.
Never add a status column anywhere — a hand-maintained mirror of a derivable fact
drifts within days.

## Serial or integration

Every epic declares a **release mode** in its ticket document. Either way the
epic has exactly one branch, `epic/<name>`, created by `/flow:epic` to hold its
documents.

**serial** (the default) — each ticket opens a pull request against the default
branch and is merged before the next starts. `/flow:ticket` checks that the
previous ticket's pull request actually landed, and stops rather than silently
branching off unmerged work.

**integration** — for tickets that genuinely cannot ship alone (a schema change
split across tickets, a guard whose secret must exist first). Each ticket still
gets its own small pull request, targeting `epic/<name>`; one release pull
request goes to the default branch.

In both modes the epic's **first** ticket branches from `epic/<name>`, so the
ticket document, status log and context travel to the default branch with it. A
ticket that skipped that step would leave the board blind to its own epic.

What is never allowed is one pull request carrying a whole epic. Past roughly 400
changed lines, review stops finding defects — and an epic-sized diff is the
situation where documentation gets deleted to make the diff smaller, which
destroys the only memory the next session has.

## Autonomous epics

An integration epic can additionally declare `Run mode: autonomous` in its
preamble. Sign-off then approves an unattended run: `/flow:run <epic>` loops
the tickets in document order, each in a **fresh-context agent** that
implements, is reviewed, fixes findings and merges its own pull request into
`epic/<name>`, and the run ends by opening the release pull request. **The
human gate moves to that release pull request; it does not disappear.** Main
never sees an agent merge in any mode — an unreviewed ticket is never merged
anywhere, and the combination with serial mode is refused mechanically,
because unattended merges may only ever target an epic branch.

A run **halts** rather than improvises: on a blocked ticket, an Important
review finding it cannot fix, a document/code contradiction, a merge
conflict, reviewer-spawn failure after its fallback, a permission prompt
firing mid-run, or any failing command. Halting is the mechanism working —
a run that pushes through is a run whose release pull request can no longer
be trusted.

Two things are **environment setup, not plugin code**. Both must exist
before the first unattended run — and both are probed while the epic is
planned, not discovered on run day: declaring `Run mode: autonomous`
obligates the plan to run the probes and record the result (the first live
run hit an unprobed free-plan 403, and its waiver landed seconds before
start):

- **A pre-authorized permission surface.** The session must already be
  allowed to run git, `gh`, the project's test commands, file edits and agent
  spawns without prompting — a prompt mid-run stops the run, because nobody
  is there to answer it.
- **Branch protection on the default branch** — require pull requests, block
  force pushes, human-only merge. The skills are soft enforcement obeyed by a
  cooperating agent; protection is the hard floor that holds even against a
  misbehaving one.

## Why the reviewers are separate agents

A session that has just spent hours justifying its own decisions is the worst
possible reviewer of them — and that is as true of a plan as of a diff.
`flow:ticket-reviewer` starts empty, sees only the commit range and the
documents, and **reports without fixing** — because an agent that can edit its
own finding will edit it into agreement. Fixes land as new commits, never
amendments, so the review stays auditable against exactly what was reviewed.
`flow:plan-reviewer` does the same to a draft epic before sign-off, reading the
decomposition against the actual code — a wrong split caught there costs one
edit instead of every ticket built on it.

They ship under their own names rather than generic ones, because project and
user `.claude/agents/` definitions override same-named plugin agents. If you
already have a `code-review-expert`, they do not collide.

## Reading the board

| State | Means |
|---|---|
| `shipped` | Commits with this ID are on the default branch, or its pull request merged into it |
| `integrated` | Pull request merged into the epic branch (integration mode) — awaiting the release pull request |
| `in review` | Pull request open |
| `done, unpushed` | Status log says DONE but nothing shipped — the loop stalled |
| `in progress` | Local branch with commits, no pull request |
| `blocked` | Status log records BLOCKED or ABANDONED |
| `todo` | Not started |

Before starting a ticket, the board script's `brief [ID]` subcommand prints
everything in one place: the ticket's full section from its epic's
`tickets.md` — Scope, Not in scope, Acceptance criteria — plus the derived
facts the board knows (state, branch, epic, modes, pull request). With no ID
it briefs the first startable ticket, naming the epic it came from; `--json`
returns the `find` payload with the section text as a `body` field. The
script ships inside the plugin, so it runs the same way every skill runs it:
`node "${CLAUDE_PLUGIN_ROOT}/scripts/tickets.mjs" brief [ID]` — there is no
`/flow:brief` slash command.

Two blind spots worth knowing: the board reads *this checkout's* view of the
remote, so fetch first when the answer matters; and `shipped` means some commit
carrying that ID landed, which a partial merge or a docs-only commit also
satisfies. When the board's other limits bite, it says so itself — a duplicate
ticket ID across epics, or shipped-detection hitting its commit-scan cap.

See `METHODOLOGY.md` for why each constraint exists and what it cost to learn.

## Developing

The board script has a test suite that builds a throwaway git repository and
asserts the derived states:

```
node --test plugins/flow/scripts/tickets.test.mjs
```
