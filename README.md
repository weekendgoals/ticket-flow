# ticket-flow

A Claude Code plugin that runs work as **epics** and **tickets**, from a request
through to a reviewed pull request — and derives the board from git instead of
asking anyone to maintain one.

Eight skills, two reviewer agents, one board script, one workflow script
(`/flow:run`'s ticket loop), one session hook. No database,
no config file, no state stored anywhere — except one per-session marker in
the OS temp dir (the in-session-work guard's memory of the current
conversation; it dies with the session's context and never touches the
repository).

| | |
|---|---|
| `/flow:epic <name> [source...]` | Turn a request, report or conversation into `epics/<name>/`. Sources are files, globs or URLs, saved into `context/`; with none, the conversation is the brief. A fresh-context **plan reviewer** challenges the decomposition, then it **stops for sign-off** and commits — no pull request |
| `/flow:ticket <ID>` | One ticket end to end: branch, implement, verify, log, commit, review, fix, push, pull request. Runs **supervisor-mode by default** — a fresh-context worker implements from the documents and the supervisor hires the reviewer; `--interactive` runs in-session, once per session (a hook refuses a second interactive run; supervisor runs stay open) |
| `/flow:run <epic>` | Run a `Delivery: release` epic end to end with nobody present: verifies sign-off happened, then hands the loop to a shipped **workflow script** that takes the tickets in document order — a **fresh-context worker** implements each one and stops at its pull request, then the **driver hires the reviewer**, gates in code on its structured findings, and merges into `epic/<name>` — and halts on any stop condition, because each one is a code path rather than a judgment call. The session ends by **opening** the release pull request. Requires the Workflow tool; never merges toward the default branch |
| `/flow:quick <description>` | The **cheap lane**: one small, low-risk piece of work, implemented **in-session** with a written scope, verification with counts, a short log entry and a pull request — and a fresh-context reviewer **only when behaviour changes** (prose-only diffs — documentation and comments, nothing a machine reads — get none; the PR is the review). Size- **and risk-gated**: auth, secrets, migrations and other consequential work is routed to `/flow:epic` at any size |
| `/flow:tickets [epic]` | The board — shipped, in flight, blocked, todo |
| `/flow:review [range]` | Review a commit range and report. Used by `/flow:ticket`; runnable on its own |
| `/flow:doctor` | Is this project ready for the flow? Preconditions, merge settings, instruction-file quality, and headings that would silently misparse |
| `/flow:retro [epic]` | Close a finished epic: a **fresh-context miner** reads the status log and review addenda and drafts the lessons and owed work — the invoking session often planned or ran the epic, so it mines nothing itself — then the approval gate and the shipping stay in-session, into instruction files and tickets |

You review the pull request and merge it. **There is no command after the
merge.** In a release epic the pull request you review is the release one —
the gate moves, it never disappears.

## Flow is opt-in

Flow is invoked, never inferred. A plain implementation request is direct
development — implement, verify, report, no epic or ticket documents. The
methodology engages only when you type a `/flow:*` command or ask for it by
name. That gives every request three lanes, priced by what they buy:

- **Direct** — "fix the typo". No ticket, no log, no separate reviewer. The
  agent's normal behaviour; Flow stays out of the way.
- **Quick** — `/flow:quick <request>`. A small isolated change that deserves
  a durable record and a pull request.
- **Epic** — `/flow:epic <name>`. Risky, uncertain, or multi-ticket work
  that deserves planning, adversarial review, and a sign-off gate.

To make the contract explicit in a project that installs the plugin, add
this to its `CLAUDE.md`:

```markdown
## Ticket Flow policy

Use Ticket Flow only when the user explicitly invokes `/flow:*` or asks to
use the Flow methodology. Ordinary implementation requests run directly:
implement, verify, and report without creating epic or ticket documents.
"Direct" or "without Flow" always overrides the methodology.
```

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
  commit inherits the title — so orgs that mandate squash can use incremental
  delivery as-is. A **release** pull request carries many tickets and must
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

## Release or incremental

Every epic declares one **Delivery** line in its ticket document. Either way
the epic has exactly one branch, `epic/<name>`, created by `/flow:epic` to
hold its documents.

**release** (the default for a multi-ticket epic) — after sign-off,
`/flow:run <epic>` executes the tickets unattended: each in a fresh-context
agent that implements, is reviewed, fixes findings and merges its own pull
request into `epic/<name>`; the run ends by **opening** the release pull
request. The loop itself is a workflow script the plugin ships
(`workflows/run-epic.mjs`), so every stop condition is code that returns
rather than prose an agent could reason past. The human makes two decisions — approve the plan, approve the
release — instead of clicking merge between every ticket. **The human gate
moves to the release pull request; it does not disappear.** Main never sees
an agent merge in any mode — an unreviewed ticket is never merged anywhere.
Release epics are bounded: roughly 3–6 tickets, days not weeks, a release
diff a human can actually review — beyond that, split the epic or go
incremental, because a long-lived epic branch accumulates integration risk
and delays real feedback.

**incremental** — each ticket opens its own human-gated pull request against
the default branch and is merged before the next starts. Choose it when
per-ticket production feedback matters, when main moves fast in the same
area, or when a migration needs staged deployment. `/flow:ticket` checks
that the previous ticket's pull request actually landed, and stops rather
than silently branching off unmerged work.

One line, one decision — there are no separate topology and run-mode
declarations, so "unattended merges toward main" is not even declarable: a
release epic's unattended merges target `epic/<name>` by construction, and
an absent line means incremental. Running one ticket of a release epic by
hand with `/flow:ticket` remains available as the escape hatch for
resolving a halt or watching one consequential ticket closely — it is
recovery, not a planned mode.

In both deliveries the epic's **first** ticket branches from `epic/<name>`, so
the ticket document, status log and context travel to the default branch with
it. A ticket that skipped that step would leave the board blind to its own
epic.

What is never allowed is one pull request carrying a whole epic that nobody
planned as a release. Past roughly 400 changed lines, review stops finding
defects — and an epic-sized diff is the situation where documentation gets
deleted to make the diff smaller, which destroys the only memory the next
session has.

## Unattended runs

A run **halts** rather than improvises: on a blocked ticket, an Important
review finding it cannot fix, a document/code contradiction, a merge
conflict, reviewer-spawn failure after its fallback, a permission prompt
firing mid-run, or any failing command — with one tolerated exception: a
404 or 403 from the two branch-protection probes is the answer that check
exists to read, not a failure. Halting is the mechanism working —
a run that pushes through is a run whose release pull request can no longer
be trusted.

Two things are **environment setup, not plugin code**. Both must exist
before the first unattended run — protection alone may instead be waived by
the human at sign-off, the waiver recorded as a decision in the epic's
`tickets.md` — and both are probed while the epic is
planned, not discovered on run day: declaring `Delivery: release`
obligates the plan to run the probes and record the result (the first live
run hit an unprobed free-plan 403, and its waiver landed seconds before
start):

- **A pre-authorized permission surface.** The session must already be
  allowed to run git, `gh`, the project's test commands, file edits, agent
  spawns, and the Workflow launch that runs the ticket loop, all without
  prompting — a prompt mid-run stops the run, because nobody is there to
  answer it, and the workflow-launch prompt would fire before any loop code
  exists to catch it.
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

**The hirer is never the party under review.** In `/flow:ticket`'s default
lane the supervisor hires the reviewer, not the worker that wrote the code;
in `/flow:run` the driver script does the same one level up — the worker
stops at its opened pull request, the script hires the reviewer, and a code
gate on the reviewer's structured findings decides whether anything merges.
A worker that picked its own judge would recreate self-review one level down.

They ship under their own names rather than generic ones, because project and
user `.claude/agents/` definitions override same-named plugin agents. If you
already have a `code-review-expert`, they do not collide.

Review effort is **tiered by consequence, not fixed at maximum** —
independent review always runs, maximum-capability review only where it can
pay. The plan reviewer runs once per epic on the strongest model available:
a wrong decomposition is the most expensive defect in the system. The ticket
reviewer scales — a fast model at low effort for prose-only diffs
(documentation and comments), a capable mid-tier model at high effort for
everything else below the risk list (including the shapes that look like
prose but are not: configuration, user-facing strings, CLI output,
skill/agent Markdown), and the strongest model at `xhigh` for the
consequence list (auth, secrets, migrations, data rewrites, network
exposure, payments, fail-open) — and the quick lane skips the reviewer
entirely for prose-only diffs, because there the pull request is the
review. An epic can pin the **ticket
reviewer's** model with an optional `Reviewer model: <model>` line in its
tickets.md preamble, parsed like the Delivery line (first word after the
colon; prose after it is ignored) — it overrides the tiers, so redirecting
review is an edit to the epic's documents, not a mid-run conversational
directive. The line does not govern the plan reviewer: it lives in the very
draft the plan reviewer is judging, and configuration binds only after
sign-off approves it.

The **implementing workers'** model is configurable the same way: absent
any declaration, every worker inherits the model of the session that spawns
it (so planning and implementation run on whatever your session runs), and
an optional `Worker model: <model>` preamble line pins the workers instead —
which is how you plan an epic on a stronger model and implement it on a
cheaper one. Neither line is a settings file: model choice lives in the
versioned epic document, visible at sign-off, like every other
configuration this plugin has.

## Reading the board

| State | Means |
|---|---|
| `shipped` | Commits with this ID are on the default branch, or its pull request merged into it |
| `integrated` | Pull request merged into the epic branch (release delivery) — awaiting the release pull request |
| `in review` | Pull request open |
| `done, unpushed` | Status log says DONE but nothing shipped — the loop stalled |
| `in progress` | Local branch with commits, no pull request |
| `blocked` | Status log records BLOCKED or ABANDONED |
| `todo` | Not started |

Before starting a ticket, the board script's `brief [ID]` subcommand prints
everything in one place: the ticket's full section from its epic's
`tickets.md` — Scope, Not in scope, Acceptance criteria — plus the **epic
preamble** (ground rules, ordering, delivery), the status log's **owed items
not yet marked resolved** (every non-Nothing `**Owed:**` paragraph,
attributed to its entry, until a later `**Resolves owed:** <ID>` line closes
it — recorded state, so an item may already be discharged unmarked; the
brief says so in its heading), and the derived facts the board knows (state,
branch, epic, modes, pull request). This is a worker's whole required reading — O(epic), not
O(history): the status log grows without bound, and the brief is what keeps
each new ticket from paying to reread all of it. With no ID it briefs the
first startable ticket, naming the epic it came from; `--json` returns the
`find` payload with `preamble`, `owed` and the section text as a `body`
field. The script ships inside the plugin, so it runs the same way every
skill runs it: `node "${CLAUDE_PLUGIN_ROOT}/scripts/tickets.mjs" brief [ID]`
— there is no `/flow:brief` slash command.

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
