# ticket-flow

A Claude Code plugin that runs work as **epics** and **tickets**, from a request
through to a reviewed pull request — and derives the board from git instead of
asking anyone to maintain one.

Nine skills, two reviewer agents, one board script, one workflow script
(`/flow:run`'s ticket loop), one session hook. No database,
no config file, no state stored anywhere — except one per-session marker in
the OS temp dir (the in-session-work guard's memory of the current
conversation; it dies with the session's context and never touches the
repository).

| | |
|---|---|
| `/flow:epic <name> [source...]` | Turn a request, report or conversation into `epics/<name>/`. Sources are files, globs or URLs, saved into `context/`; with none, the conversation is the brief. The shape is agreed **before** the document is written, a fresh-context **plan reviewer** challenges the decomposition — holding the **design** too, where the epic declares one, so that an element the drawing has and the map does not is caught before sign-off — then it **stops for sign-off** and commits — no pull request. An epic that declares `Design sources:` writes `design-map.json` beside its tickets and **ends with a whole-page fidelity ticket**; what the plan deliberately does not build is declared in that map's `removed` list, where a comparison prints it as a decision instead of a hole. Both human gates render the plan as a **styled page** (`plan-page.mjs`, published as an artifact): one URL that evolves from shape checkpoint to sign-off, never committed |
| `/flow:ticket <ID>` | One ticket end to end: branch, implement, verify, log, commit, review, fix, push, pull request. Runs **supervisor-mode by default** — a fresh-context worker implements from the documents and the supervisor hires the reviewer; `--interactive` runs in-session, once per session (a hook refuses a second interactive run; supervisor runs stay open) |
| `/flow:run <epic>` | Run a `Delivery: release` epic end to end with nobody present: verifies sign-off happened, then hands the loop to a shipped **workflow script** — **code-controlled, agent-executed** — that takes the tickets in document order. Per ticket: refresh the epic branch and read the board, a **fresh-context worker** implements and stops at its pushed branch (**release tickets open no pull request of their own** — the release pull request at the end is the epic's only one), the **driver hires the reviewer** priced by a code-floored tier, a disposition agent fixes and records, fixes get one bounded re-review at the consequence tier — below it a code gate checks the fix diff stayed inside the files the review saw or its findings named and under a line budget, and a trip buys that same re-review at the consequence tier instead of halting (only a fix diff nothing could measure still halts) — the ticket's `CHECK`/`EXPECT` acceptance criteria are **re-run from the signed-off document** (`tickets.mjs check <ID> --from origin/epic/<name>`) and gated on in code, then the branch's review addendum, the departures its status entry records (**any `**Deviation:**` line halts the run — closed or not, because nobody present could have closed it**) and its exact head SHA are checked **in code before any agent that could merge exists**; only then does a merge agent merge that verified SHA — which cannot be retargeted — into the epic branch, and the board — not an agent — confirms the result. It halts on any stop condition, because each one is a code path rather than a judgment call. The session ends by **opening** the release pull request. Requires the Workflow tool; never merges toward the default branch |
| `/flow:quick <description>` | The **cheap lane**: one small, low-risk piece of work, implemented **in-session** with a written scope, verification with counts, a short log entry and a pull request — and a fresh-context reviewer **only when behaviour changes** (prose-only diffs — documentation and comments, nothing a machine reads — get none; the PR is the review). Size- **and risk-gated**: auth, secrets, migrations and other consequential work is routed to `/flow:epic` at any size |
| `/flow:tickets [epic]` | The board — shipped, in flight, blocked, todo |
| `/flow:board [epic]` | The same board as a **styled HTML page**, published as an artifact you can open and share, with a **Tokens** column from the recorded spend ledger. A rendering of derived state, rebuilt from git on every run — never committed, never a second store |
| `/flow:spend [epic]` | The **recorded token ledger** — per ticket, per role (worker, reviewer, re-review, disposition, proxies) and per epic, derived from the status logs' Tokens lines, addendum phrases and run records. `unknown` stays unknown, nothing is estimated |
| `/flow:review [range]` | Review a commit range and report. Used by `/flow:ticket`; runnable on its own |
| `/flow:doctor` | Is this project ready for the flow? Preconditions, merge settings, instruction-file quality, and headings that would silently misparse |
| `/flow:retro [epic]` | Close a finished epic: a **fresh-context miner** reads the status log and review addenda and drafts the lessons and owed work — the invoking session often planned or ran the epic, so it mines nothing itself — then the approval gate and the shipping stay in-session, into instruction files and tickets. Its **seventh question asks what the run halted on and what each halt bought**: every `### Run —` record's halt classified as **work**, **plan**, **plugin/environment** or **policy**, with what the human did to resume and whether the stop retired a real risk or fired on a clean state — a policy stop that keeps firing clean becomes a proposal against the policy, a plugin halt a ticket for the plugin's own repository |

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
| `epics/<e>/runs.md` | What the **runs** did | Append-only. Corrections are dated addenda |
| `epics/<e>/design-map.json` | What the design **draws**, and what the plan deliberately does not build | Written with the plan and signed off with it. Workers edit its `page` selectors; its **`removed` list is planning's**, and the differ honours removals only from the signed-off ref |
| `epics/<e>/context/` | What it was based on | Frozen. Add, never rewrite |

`runs.md` exists because two writers used to share one file tail: a ticket
worker appends its entry on a ticket branch while an unattended run appends
its record on the epic branch, and every mid-ticket halt then cost a hand
merge. It is created by the first run record written after an epic splits
them out; logs written before the split keep their records in `status.md`
and are still read there, because an append-only log is never rewritten.

The status log is a **diary, not a dashboard**. "Which tickets are done" is
answered by `/flow:tickets`, computed fresh from ticket headings, status-log
headings, git branches, commit subjects on the default branch, and `gh pr list`.
Never add a status column anywhere — a hand-maintained mirror of a derivable fact
drifts within days.

**Keeping the default branch tidy.** The documents ride the same branches and
pull requests as the code — that is what makes the record travel — but they
need not dominate the diff or the language stats. Two practices, both optional:

- Add to `.gitattributes`:

  ```
  epics/** linguist-generated=true
  ```

  GitHub then collapses the epic documents in pull-request diffs and keeps
  them out of language statistics. Collapsed is not hidden — a reviewer
  expands them with a click, and the release pull request's evidence trail is
  intact; the review effort just lands on the change instead of the record.
- **After a retro**, a closed epic's folder may move to `epics/_archive/<name>`
  (a plain `git mv`, in a reviewed pull request like any change). The board
  only discovers epics directly under `epics/`, so an archived epic drops off
  it — which is safe **only after** the retro has converted its owed items
  into live tickets and its lessons into instruction files; archiving first
  silently deletes the debt ledger. Moving is not deleting: the log stays in
  git, fully readable, and shipped detection never depended on the folder —
  it reads commit subjects. The standing `epics/quick/` is never archived
  whole — it **rolls over by era** instead: when its log grows long
  (roughly 25 entries), `/flow:retro quick` converts the open owed items to
  tickets, archives the era to `epics/_archive/quick-<date>` verbatim, and
  recreates a fresh quick epic whose preamble records the ID floor
  (`Q-IDs continue at Q-<n+1>`), so numbering never collides with shipped
  work.

## Release or incremental

Every epic declares one **Delivery** line in its ticket document. Either way
the epic has exactly one branch, `epic/<name>`, created by `/flow:epic` to
hold its documents.

**release** (the default for a multi-ticket epic) — after sign-off,
`/flow:run <epic>` executes the tickets unattended: each in a fresh-context
agent that implements, is reviewed on its pushed branch, fixes findings,
and has its verified head merged into `epic/<name>` — no per-ticket pull
request exists; the release pull request the run ends by **opening** is the
epic's only one, and it is where the whole evidence trail reaches the
human. The loop itself is a workflow script the plugin ships
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

**Both are given the design, where the epic declares one.** The plan reviewer
gets the design sources and the design map, because an element the drawing has
and the map does not is invisible to everything downstream. The ticket
reviewer gets them too, plus the entry's `**Compared:**` table — which is a
**claim**, not evidence: it re-runs the differ where the project's instruction
file says how to serve and drive a page, and otherwise audits the table
against the design source's markup and **says the page was not rendered** (the
Codex shadow reviewer, sandboxed with no network, never renders, and its
packet says so). A table the re-run contradicts is Important, as is a
`removed` entry the ticket's own diff added or changed — the design map's
removal list is planning's, and the party under review is the one that must
never declare its own missing element removed.

**The hirer is never the party under review.** In `/flow:ticket`'s default
lane the supervisor hires the reviewer, not the worker that wrote the code;
in `/flow:run` the driver script does the same one level up — the worker
stops at its pushed branch, the script hires the reviewer, and a code
gate on the reviewer's structured findings decides whether anything merges.
A worker that picked its own judge would recreate self-review one level down.

They ship under their own names rather than generic ones, because project and
user `.claude/agents/` definitions override same-named plugin agents. If you
already have a `code-review-expert`, they do not collide.

Review effort is **tiered by consequence, not fixed at maximum** —
independent review always runs, maximum-capability review only where it can
pay. The plan reviewer runs once per epic and is pinned to the strongest
model available: a wrong decomposition is the most expensive defect in the
system. The ticket
reviewer scales — a fast model at low effort for prose-only diffs
(documentation and comments), a named cost-efficient model at high effort
for everything else below the risk list (including the shapes that look
like prose but are not: configuration, user-facing strings, CLI output,
skill/agent Markdown — named deliberately, never inherited: the session
launching a run is often the most expensive class available, and routine
review must not be priced by that accident), and a strong model at `xhigh`
for the consequence list (auth, secrets, migrations, data rewrites, network
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

In an unattended run the tier is not taken on the worker's word: the worker
reports the tier its diff earns, but the driver lists the branch's changed
files itself (a read-only fast-model step) and **floors the tier in code**
— docs-only files may price `prose`, anything else at least `normal`, and
files matching the epic's optional `Consequence paths: <glob>[, <glob>]`
preamble line price `consequence`. The report can raise the price, never
lower it: the worker is the party under review, and the reviewed party does
not price its own judge.

The **implementing workers'** model is configurable the same way: a
`Worker model: <model>` preamble line pins the workers, and the epic
template now carries `Worker model: opus` by default — plan on the
strongest model, implement on a capable one at a fraction of the price.
Absent the line, every worker inherits the model of the session that
spawns it, which is a decision worth making deliberately rather than
inheriting by accident. None of these lines is a settings file: model
choice lives in the versioned epic document, visible at sign-off, like
every other configuration this plugin has.

Those two lines are chosen **together, as a pairing**, per epic. Two
profiles are known-good: **capable-implementer** (`Worker model: opus`,
tiered review — for gnarly code and thin specs) and **strong-judge**
(`Worker model: sonnet`, `Reviewer model: opus` — the cheap implementer
under a stronger judge, for well-specified tickets out of a clarified,
plan-reviewed epic; worker spend is the largest per-ticket line item, so
this is the biggest cost knob the flow has). Decide from the previous run
records' evidence — Important findings per ticket and observed spend —
and never cheapen the *plan* side to match: a weak plan produces tickets
that are confidently, reviewably wrong.

**The whole configuration surface is ten optional preamble lines** in the
epic's `tickets.md` — one place, one syntax (label at line start, value
first after the colon, prose after it ignored), every near-miss flagged by
`/flow:doctor`:

| Line | Example | Controls | Absent |
|---|---|---|---|
| `Delivery:` | `release` | how work reaches main: unattended into `epic/<name>` with one release PR, or one human-gated PR per ticket | `incremental` |
| `Worker model:` | `opus` | the implementing workers | workers inherit the spawning session's model |
| `Worker runner:` | `codex` | who implements in an unattended run: a Claude subagent, or OpenAI's Codex CLI through `scripts/runners/codex.mjs` — sandboxed with `.git` read-only and no network; the runner branches, commits, pushes, and reconciles the model's report with git. The run starts it detached (`--start`) and polls it (`--wait`) in slices under the agent shell tool's 10-minute limit, so a ticket keeps its 60-minute timeout; the proxy stops it (`--cancel`) before any report the runner did not give, the run skill does before touching the tree after a halt, and the runner commits only on its ticket branch | `claude` |
| `Shadow reviewer:` | `codex` | a trial: in an unattended run, consequence-tier tickets also get a read-only Codex review of the same packet through `scripts/runners/codex-review.mjs`, recorded in `epics/<name>/shadow-reviews.md` and compared at the retro — it gates nothing | none |
| `Reviewer model:` | `opus` | the ticket reviewer, overriding the tier table | the consequence tiers pick (haiku/sonnet/opus) |
| `Planner model:` | `fable` | the plan reviewer for this epic | the agent definition's pinned strongest |
| `Consequence paths:` | `src/auth/**, migrations/**` | globs that force the consequence review tier in a run — the code floor under the worker's self-reported tier | tier floor still applies (docs-only vs code), globs add nothing |
| `Fix bounds exclude:` | `src/messages/*.json` | globs the run's fix-bounds gate leaves out of the review-fix diff (as it already leaves out `epics/`) — for files a fix fans out into mechanically, translation catalogs being the canonical case | every fixed file counts toward the bounds |
| `Design sources:` | `designs/City Desktop.html, designs/map.html` | the files holding what the design draws — anything a browser can render and `getComputedStyle` can read; repository-relative, and free to live outside the epic's `context/`. This is what hands the design to the brief and to both reviewers. The one line that carries **no prose**: the whole text between commas is the path, because designers name files with spaces in them | no design is declared, and nothing downstream is handed one |
| `Ticket budget:` | `250k` | per-ticket output-token ceiling in a run (a shadow review's spend is left out); an over-budget ticket stays merged and the run halts before the next. The only line a run re-reads: each ticket's resolve step fetches the epic branch and reads the signed-off document from it before the merge, so raising it mid-run (committed and pushed) governs the running ticket, and a ticket branch cannot raise its own ceiling; removing the line keeps the last ceiling and logs that it did | no ceiling; per-ticket spend still recorded when the runtime meters it |

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
not yet marked resolved** (every non-Nothing obligation an `**Owed:**` block
records, attributed to its entry — an entry that owed one thing is addressed
by its own ID, one that owed several numbers its bullets `<ID>.1`, `<ID>.2` …
in document order — until a later `**Resolves owed:** <ID>` line closes it.
A bare entry ID is read against what the entry owed **when that line was
written** — the items recorded above it, since an append-only log makes
position time — so an old marker keeps closing what it closed even after the
entry records again. Facing more than one open item it retires **nothing**
and the brief says what to write instead: a marker naming one item once
closed four, including a production-database hazard, and an item wrongly
retired is gone from an append-only log with nothing left to report it.
Naming any item the itemised way clears that note, and a reference matching
no item is reported too — that one cleared in turn by a correct reference
written **below** it, since every note here is cleared by the repair it names.
Recorded state, so an
item may already be discharged unmarked; the brief says so in its heading),
the **deviations no human has closed** (with a note beside them for anything a
`**Deviations closed:**` line could not close), and the derived facts the board knows (state,
branch, epic, modes, pull request). This is a worker's whole required reading — O(epic), not
O(history): the status log grows without bound, and the brief is what keeps
each new ticket from paying to reread all of it. With no ID it briefs the
first startable ticket, naming the epic it came from; `--json` returns the
`find` payload with `preamble`, `owed`, `notes` (what a `**Resolves owed:**`
line could not retire), `deviations`, `deviationNotes` and the section text as
a `body` field.
The script ships inside the plugin, so it runs the same way every
skill runs it: `node "${CLAUDE_PLUGIN_ROOT}/scripts/tickets.mjs" brief [ID]`
— there is no `/flow:brief` slash command.

**The two deviation lines.** A status entry's optional `**Deviation:**` line —
one per departure — records what the ticket's documents or design showed that
was not built, or was built differently. It is not owed work and not a
judgment call the documents left open (that stays in `**Decisions:**`): an
owed item is work someone will do, a deviation is a decision someone must
see, and it has its own line because the Decisions prose it used to live in is
read by no command. An ID that recorded one departure is addressed by its own
ID; one that recorded several numbers them `<ID>.1`, `<ID>.2` … in document
order across every entry it heads. A dated `**Deviations closed:** <ID>[,
<ID>.<n>] — <each deviation named as accepted or as fixed in <sha>; who; when>`
line closes what its **leading** reference list names, and only departures
recorded **above it in the file** — and it records **a human's decision, made
by no agent**, because a closure the reviewed party could have decided clears
nothing. The human need not type it: in an attended session an explicit answer
to the departure shown ("accept", "fix it") is the decision, and the session
records the line quoting it. A missed estimate (a line count, a size) and a
change made in answer to a review finding are not deviations. **A bare closing line** closes an entry's one departure, and facing
more than one open it closes **nothing** and says so: accepted and fixed are
decisions per departure, and while a deviation wrongly left open costs a human
one reread, one wrongly closed is a decision nobody made, gone from every brief
and every attended door — the same asymmetry, and the same incident, behind the
owed ledger's item numbering. A reference naming no departure, and an ID a
reference ends inside (`<ID>oops`), close nothing and are reported too. Every
note either ledger emits is **cleared by the repair it names**, because an
append-only log cannot take a wrong line back and a warning nobody can clear is
one its readers learn to skip: a bare line's note ends once any of the entry's
departures is named the itemised way, wherever that line sits, while a faulty
reference's ends once a line **below** it names one of them correctly — the
bare ID, for an entry that recorded a single departure. Below, because position
is time in an append-only log: a correct reference written earlier is not a
correction of a later mistake. The script's
`deviations <ID>` subcommand reads every one a ticket's own entries recorded,
closed or not, each with its closing line, and `notes` for what a closing line
could not close; `--log-from <ref>` reads the status
log from a git ref — a pushed ticket branch, where the worker wrote its entry
— instead of the checkout, and a log it cannot read is a nonzero exit naming
the reason, never an empty list.

**Where a deviation is read.** Every later brief in the epic carries the ones
no human has closed. In an attended lane the ticket's own summary names
**every** one it recorded — a closed one with its closing line, because no
command can say who wrote that line — and **a deviation is named in the pull
request body**, under its own heading, in both lanes that open one
(`/flow:ticket`'s incremental pull request, `/flow:quick`'s). And a release
epic's integration merge **refuses a ticket with an unclosed deviation**: the
gate reads the departures off the pushed branch it is about to merge, stops
before the merge, and resumes only once a human has decided — accepted, or
fixed on the branch and then accepted as fixed — in the `**Deviations
closed:**` line that no agent may write. That merge is the last point at which
one ticket's departure is still one decision rather than a paragraph inside a
whole epic's diff. **An unattended run halts on any departure at all** — it
counts every `**Deviation:**` line the pushed entry carries and honours no
closing line, because the only parties who could have written one in such a
run are the worker and the disposition agent, both under review. So a
departure an agent already fixed halts too, recorded as fixed in its addendum;
the human then accepts it or has it fixed, and the ticket is finished by hand
through `/flow:ticket <ID>` before the run is started again.

A criterion can also be **machine-runnable**: an indented `CHECK: <command>`
line under the criterion bullet, with an optional `EXPECT: <text the output
must contain>` — exit 0 alone decides when EXPECT is absent. The script's
`check <ID>` subcommand runs them from the repository root and reports a
ledger whose evidence is the deciding output line, with three verdicts: `✓`
passed, `✗` failed, and `↓` **skipped** — the command exited 0 but the
deciding line is a test runner's skip (a suite that skips itself without
`DATABASE_URL` exits 0, and a verbose reporter still prints the titles an
EXPECT matches). **A skipped check is not a passed one**: it proves nothing,
so it never greens the gate, and it is not called failed either, because the
repair is the missing prerequisite rather than the code. A malformed
CHECK **fails** the gate rather than silently never running, and `doctor`
flags the near-miss shapes — including two that parse and run yet can never
pass: `\\|` inside a quoted `node -e` / `sh -c` string (the quoting layer
consumes one backslash, so grep matches a literal `|`) and `grep` given both
`-r` and `-c` (recursive counting prints `path:count` per file, never a bare
number). Every CHECK is also proven **red before the ticket exists**: the
planner runs it at planning time, records the ledger in the draft, and the
plan reviewer re-runs the runnable ones — a criterion already green proves
nothing, and a whole-suite run is a standing check rather than a criterion.
`--from <ref>` reads the criteria from a git ref
instead of the working tree — the unattended driver passes
`--from origin/epic/<name>` so the merge gate judges against the signed-off
document, which no ticket branch can edit. `tickets.mjs find <ID> --from
<ref>` is the same move for the epic's declarations — it is how the driver
reads the `Ticket budget:` line — for the same reason: the party under review
must not be able to edit the terms it is judged by. Prose and *demonstrate:* criteria
remain first-class; CHECK is for the criteria a command can decide outright.

**A fidelity criterion is the one the code never runs.** `COMPARE: <design
source path> @ <width>[, <width>]`, indented under its criterion bullet like
`CHECK:`, with an optional `LANDMARKS: <name>[, <name>]` beneath it (absent =
every landmark in the map = the whole page). Comparing an artboard with a
rendered page needs a browser and the plugin owns none, so `check <ID>` lists
comparisons in their own `compares` list, marked manual, **in neither `total`
nor `passed`** — and what the code gates instead is the **presence** of the
`**Compared:**` table in the ticket's status entry, counted by
`tickets.mjs compared <ID> [--log-from <ref>]`. A ticket whose signed-off
section carries a `COMPARE` and whose pushed entry records none halts an
unattended run on the acceptance-check condition and holds an attended
release merge; the recovery is to run the differ and append the table in a
dated addendum, or — where nothing can render the design — a human's written
`**Compared:** owed — <who accepted it, when, and why>`, which a gate reads
as present and a reader reads as not done. What the table *says* is the
reviewer's to check, who can re-run the differ; what a merge can hold is
whether it exists. A malformed `COMPARE` — no width, a path the epic's
`Design sources:` line does not list, a `LANDMARKS:` with no `COMPARE:` above
it — fails the gate like a malformed CHECK, and `doctor` flags the
near-misses.

**Spend is derived too.** `tickets.mjs spend [epic]` compiles the recorded
token ledger — per ticket, per role (worker, reviewer, re-review,
disposition, shell proxies) and per epic — from the three places the epic's
logs carry a figure: a ticket entry's `**Tokens:**` line in `status.md`, its
review addendum's `Worker tokens (implementation leg): <n>; Reviewer tokens:
<n>` phrases, and a run record's per-ticket `<ID> worker=<n> reviewer=<n> …`
groups in `runs.md` — or in `status.md`, for the logs written before the run
records were split out. Where both logs carry a figure for the same ticket and
role, the one in `runs.md` wins — so a correction to a run record's figures is
appended there — and an `unknown` never overwrites a known figure in either
direction, because `unknown` is the absence of an observation, not a
correction. Recorded figures only, exactly as the log says:
`unknown` stays
unknown, a ticket with nothing recorded is reported as such, and nothing is
estimated or read from a transcript. `--json` returns the same ledger for
the retro, which reads this instead of summing the log by hand. A run
record's heading may carry a qualifier in parentheses after its date (how
same-day runs are told apart); `doctor` flags a run heading that will not
parse and a run record whose Tokens line carries figures but no groups —
the ledger silently reads nothing from either, and the repair is a dated
addendum beneath the record, never an edit. It also flags a run record
appended to `status.md` once that epic has a `runs.md`, dated after the first
record in it: the ledger still reads the figures, but the two writers are
back on one file tail. Records dated on or before the split day are never
flagged — moving them is what append-only forbids — nor is one whose heading
already appears in `runs.md`, which is what the repair looks like.

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
