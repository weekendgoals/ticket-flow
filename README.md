# ticket-flow

A Claude Code plugin that runs work as **epics** and **tickets**, from a request
through to a reviewed pull request — and derives the board from git instead of
asking anyone to maintain one.

Five skills, one reviewer agent, one script. No database, no config file, no
state stored anywhere.

| | |
|---|---|
| `/flow:epic <name> [source...]` | Turn a request, report or conversation into `epics/<name>/`. Sources are files, globs or URLs, saved into `context/`; with none, the conversation is the brief. **Stops for sign-off**, then commits — no pull request |
| `/flow:ticket <ID>` | One ticket end to end: branch, implement, verify, log, commit, review, fix, push, pull request |
| `/flow:quick <description>` | One **small** piece of work through the same loop — scope, review, log, pull request — with no epic ceremony. Writes a `Q-<n>` ticket into the standing `epics/quick/` epic and runs it |
| `/flow:tickets [epic]` | The board — shipped, in flight, blocked, todo |
| `/flow:review [range]` | Review a commit range and report. Used by `/flow:ticket`; runnable on its own |

You review the pull request and merge it. **There is no command after the merge.**

## Install

```
/plugin marketplace add ~/projects/ticket-flow
/plugin install flow@ticket-flow
```

Local edits are picked up live; run `/reload-plugins` to pick them up mid-session.

## What it expects from a project

Almost nothing, and nothing you have to create up front.

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

## Why the reviewer is a separate agent

A session that has just spent hours justifying its own design decisions is the
worst possible reviewer of them. `flow:ticket-reviewer` starts empty, sees only
the diff and the documents, and **reports without fixing** — because an agent
that can edit its own finding will edit it into agreement. Fixes land as new
commits, never amendments, so the review stays auditable against exactly what was
reviewed.

It ships under its own name rather than a generic one, because project and user
`.claude/agents/` definitions override same-named plugin agents. If you already
have a `code-review-expert`, the two do not collide.

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
