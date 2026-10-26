# ticket-flow

A Claude Code plugin that plans work as **epics** and **tickets** and keeps
them in **GitHub Issues**. GitHub is the board; git is the proof.

This is **Flow 3.0**: planning (`/flow:epic`), building one ticket
(`/flow:ticket`, `/flow:quick`, `/flow:review`), building a whole epic with
nobody watching (`/flow:run` here, or the GitHub Action in your project),
looking back at a finished epic (`flow stats`, `/flow:retro`), bugs and ideas
that arrive before they are tickets (findings and `/flow:triage`), and the
`flow` command-line tool.

## Install

```
/plugin marketplace add ~/projects/ticket-flow
/plugin install flow@ticket-flow
```

You also need the GitHub CLI, signed in: `gh auth login`. Then, once per
repository:

```bash
node <plugin root>/scripts/flow.mjs init      # creates the labels (--board: and a project board, see below)
node <plugin root>/scripts/flow.mjs doctor    # prints "ok" when everything is in place
```

## Flow is opt-in

A plain request ("fix the typo", "add this button") is ordinary
development: no epic, no tickets. Flow runs only when you type `/flow:epic`
or ask for Flow by name. To make that explicit in a project, add to its
`CLAUDE.md`:

```markdown
## Ticket Flow policy

Use Ticket Flow only when the user explicitly invokes `/flow:*` or asks to
use the Flow methodology. Ordinary implementation requests run directly.
```

## How work is kept on GitHub

**An epic** is an issue labelled `flow:epic`. Its body is the plan:

| Section | What it holds |
|---|---|
| `## Outcome` | What will visibly change, for whom, how anyone will know it worked, and what would make us undo it |
| `## Sources` | Where the request came from |
| `## Settings` | One `Key: value` per line: `Delivery: release` or `incremental` (default `release`), `Parallel: 1` to `3` (default `1`), `Branch: epic/<name>` (it must start with `epic/`: every ticket is merged into it, and a branch such as `main` is refused everywhere, so nothing can push to the default branch), `Design sources: <paths>`, `Consequence paths: <globs>` |
| `## Walkthrough` | In plain language, what a person will be able to do, scene by scene. No ticket numbers, no file names |
| `## Shape of the change` | For whoever approves: a small file tree of what is added, changed and removed, and a before-and-after `diff` block of each data shape, table, route or contract that changes |
| `## Ground rules` | What every ticket must respect |
| `## Design map` | Only with `Design sources:`: one fenced `design-map` block of JSON naming each thing the design draws (`landmarks`) and what the plan deliberately does not build (`removed`). The design comparison reads it with `flow design-map` |
| `## Tickets` | A task list, `- [ ] #12 — title`, in build order |

**A ticket** is a sub-issue of its epic, labelled `flow:ticket`. Its body:

```
Epic: #11
Blocked by: #12, #13

## Scope
## Not in scope
## Acceptance criteria
## Notes
```

- `Blocked by:` is optional and strict: issue numbers and commas, nothing
  else. Without it the ticket is independent. A line that mentions blocking
  but cannot be read is reported as a problem by `board`, `next` and
  `doctor`, and the ticket waits: Flow never guesses what a sentence meant.
- `## Acceptance criteria` holds one fenced block marked `criteria`, with at
  least one `CHECK` or `COMPARE`. A ticket without it fails `flow check`, so
  deleting the block cannot turn a ticket green. Its lines are the commands
  that decide the ticket:

  ````
  ```criteria
  - the export prints its count
    CHECK: npm test -- export.test.ts
    EXPECT: 3 passed
  - the page matches the design
    COMPARE: designs/trip.html @ 1440, 393
    LANDMARKS: header, export-button
  ```
  ````

  A `CHECK` passes when the command exits 0 and its output contains the
  `EXPECT` text, and the output does not show that the tests were skipped. A
  `COMPARE` needs a browser, so `flow check` lists it as manual and counts it
  in neither the total nor the passes.

**Labels** carry the state. One state label per ticket:

| Label | Meaning |
|---|---|
| `flow:planned` | Not started yet |
| `flow:in-progress` | Being built |
| `flow:in-review` | Built, being reviewed |
| `flow:done` | Merged into the epic branch |
| `flow:needs-human` | Stopped; a person has to decide something |

One more label is not a state: `flow:start` asks the GitHub Action to start
building a ticket now, and `flow start` takes it off. And `flow:found` marks
an issue that is not a ticket at all but a finding (see
[Findings](#findings-bugs-and-ideas-before-they-are-tickets)).

"Ready" and "waiting" are never labels; they are worked out each time. A
planned ticket is **ready** when its epic has `flow:approved` (the sign-off),
every ticket it is blocked by is `flow:done`, and nothing about it is
unreadable; otherwise it is **waiting**. Until the epic is approved, no
ticket is ready, so approving on GitHub is a single label.
`tier:easy` tickets are built by Sonnet, `tier:hard` (or no tier label) by
Opus.

**One comment per step.** Each step of a ticket posts one comment: started
(model and branch), the review result, the acceptance check results, the
merged commit, and what it cost. When a ticket stops, it gets
`flow:needs-human` and a comment that mentions whoever is assigned, or the
epic's author.

**Commits** start with the ticket number: `#12: add the export endpoint`.
Review fixes end `(review fix)`; a fix for a bug an earlier ticket shipped
ends `(fixes #9)`. Under `Delivery: release` every ticket is merged into
`epic/<name>` and the epic gets one pull request at the end; under
`Delivery: incremental` each ticket opens its own pull request. **A person
always merges into the default branch.**
After a person merges into the default branch, no code work runs: what runs
is the GitHub Action's `delivered` job, which marks done a ticket whose own
pull request a person merged, its `board` job, which closes `flow:done`
tickets left open and writes the project board (Status, Release, figures),
and the report page's rebuild, which only reads.

## The project board

A GitHub Project can show the same work as columns, one swimlane per epic. It
is optional, and it is only a view: the labels stay the only record of a
ticket's state, and Flow never takes a state from the project.

1. Run `flow init --board [<title>]` (locally, after
   `gh auth refresh -s project`). It works on the linked project with that
   title (`Flow` unless you give one; case does not matter), else on the
   only linked project with a `Status` field; with several such projects
   and none of that title it refuses (exit 2), lists them, and asks for the
   title of the one to use. It also refuses, changing nothing, when another
   linked project already carries all six options, since Flow would go on
   writing to that one. With no project linked, it creates one with the
   title, sets its `Status` options to `Planned`, `In progress`,
   `In review`, `Done`, `Needs human` and `Epic`, and links it. On an
   existing project whose `Status` lacks some of them, it adds the missing
   ones and **keeps every option and every item's status**: GitHub gives
   every option a new id when the list changes, so the command first reads
   each item's `Status`, then sets it back by name, and says how many it
   restored (an item GitHub refuses is named and the command exits 1;
   `flow board-sync` then restores every Flow issue from its labels, and a
   draft or pull request is set by hand). With all six already there, it
   only names the project. After a change it prints
   `Flow writes to: <title>`, the board every state change will use.
   Either way it then adds the `Release` field (below) when the board lacks
   it, or the options it lacks, keeping each epic's value the same way, and
   the seven number fields of [the cost on the board](#the-cost-on-the-board)
   that it lacks, naming what it created. A field of one of those names
   that is of another kind is left alone, named, and the command exits 1:
   renaming your field is not Flow's call.
2. Two steps the GitHub API cannot do, which `init --board` reminds you of
   when it creates the project: use the Board layout and set Swimlanes to
   "Parent issue", so every epic becomes one swimlane with its tickets in
   it; and optionally turn on the project's auto-add workflow with the
   filter `is:issue label:flow:ticket,flow:epic`, so issues made by hand
   show up too.
3. On a fresh board, or one that fell behind (it was linked late, or a token
   could not write to it for a while), run `flow board-sync [<epic>]`: it
   sets every open epic and its tickets, and every ticket with no epic, to
   the `Status` its labels say, adding any that are missing; gives each
   release epic its `Release` value; copies the figures of every ticket
   with a cost comment; and closes, as completed, every open
   `flow:done` ticket of a release epic (one with a `Branch:`), which is how
   tickets done before Flow 3.3 get counted. It reads each item's current
   value only to leave a right one alone. Without an epic number it also
   reads the board's items once and visits the closed epics on it whose
   `Release` is not `Released` yet, so a release merged while nothing was
   watching still reaches `Released`; `flow board-sync <epic>` is the way
   for a closed epic that is not on the board.

From then on every command that changes a state label also moves the issue
to the matching `Status`, right after the label has changed: `label`,
`start`, `merge` and `deliver` when they mark a ticket done, `reset`,
`needs-human`, and every step that hands a ticket to a person. `create-epic`
and `create-ticket` add the new issue to the project (as `Epic` or
`Planned`). Flow uses the first linked project whose `Status` has all six
options; `flow doctor` names it. With several boards linked, the one that
carries all six option names is the one Flow writes to, whatever title was
given to `init --board`.

Locally, `gh` needs the `project` scope: `gh auth refresh -s project`. On
GitHub, `FLOW_TOKEN` needs the Projects permission (read and write). When no
project is linked, or the token cannot read the repository's projects, the
commands say nothing: nobody asked for a board, and `flow doctor` is where
you see why none was found. When a linked project's `Status` lacks some of
the six options, or a board was found but the issue could not be added or
moved, the command prints one line starting `project board not updated:`.
Either way it carries on and exits exactly as it would have. `init --board`
and `board-sync` are the exception: they were asked to touch the board, so
a refusal there exits 1 with that hint.

**The progress bar.** A swimlane per epic shows closed sub-issues over all
of them. So that it counts what is built, `flow merge` closes a ticket (as
completed) when it marks it `flow:done`, while its code is still only on the
epic branch; the open release pull request, and the epic's `Release` field,
are the sign that the epic has not shipped. The epic itself stays open until
a person merges the release pull request, whose `Closes #<n>` lines also
close the tickets done before this version. When a done ticket goes back to
work (`check-epic --mark` hands it to a person, or someone relabels it
`flow:planned` to have it rebuilt), the issue is reopened with the label
change, since a closed ticket carries no work; `flow reset` refuses a done
ticket, as before. The next `check-epic` judges a ticket it handed over
again: once it passes, `--mark` puts it back to done and closes it. `flow label <n> +flow:done` closes nothing: a label is a
label. Under incremental delivery the ticket's own pull request closes it
when a person merges it.

**The `Release` field.** A single-select field for epics only, so the
board's columns and a `-status:Epic` filter stay as they are while the
epic's card and the table layout show where it stands:

| `Release` | Means |
|---|---|
| `Building` | its tickets are being built (set by `create-epic`), or its release pull request is a draft while tickets are parked (`Stops: none`) |
| `Pull request open` | every ticket is done and the release pull request waits for a person (set by `release-pr` once the pull request exists and is not a draft) |
| `Released` | the release pull request merged into the default branch, which closed the epic |

A release epic closed without its release pull request merging gets no
value: the field keeps what it had.

An incremental epic gets no value: each of its tickets ships alone. The
move to `Released` comes from the Action's `board` job, one of the two jobs
after a merge (see [How work is kept on GitHub](#how-work-is-kept-on-github)): the
epic closing (`issues: closed` on a `flow:epic` issue, nothing else) runs
`flow board-sync <epic>`, which reads the release pull request named in
the epic's comments, as `flow stats` does, sees it merged and sets
`Released`. Without the Action, run `flow board-sync <epic>` yourself after
the merge. `flow doctor` names the field or its absence on the board line.

**The cost on the board.** The board's Insights charts can only draw fields,
so each ticket's cost comment is copied into seven number fields:

| Field | Holds |
|---|---|
| `Input tokens` | input tokens, all steps |
| `Output tokens` | output tokens, all steps |
| `Cache tokens` | cache writes plus cache reads |
| `Build minutes` | the builder's time, in whole minutes |
| `Review minutes` | review plus fixes; empty when either is unknown, which is every ticket whose meter saw no fixes session |
| `Total minutes` | from the first start to the merge (or the last pull request comment) |
| `Review rounds` | how many review rounds were posted |

`flow meter` writes them right after it posts the cost comment, and
`flow board-sync` for every ticket that has one; nothing else does, since a
ticket's figures change only when a cost comment lands. A figure the
comments do not carry is not written, and its cell stays empty: an empty
cell means unknown, never 0, which would read as free. In Insights, make a
chart with Sum of a field (say `Input tokens`), grouped by any single-select
field (`Status`, or a size or area field of your own). The comment stays
the record; the fields are the board's copy, and `flow doctor`'s board line
says `figures: 7 fields` or names the missing ones. Models and effort are
not on the board (a text field cannot be charted, and the tier is already a
label); they are on the cost comment and the report page.

A finding is not on the board: `flow create-finding` adds nothing to the
project, and the issue joins it, as `Planned`, only when `flow promote` turns
it into a ticket.

## `/flow:epic`

`/flow:epic [name] [sources...]` turns a request into an epic. Sources can
be files, globs, web pages, `claude.ai` artifact links or a Jira issue; the
conversation is always one of them.

1. Reads every source, and stops if one cannot be read.
2. Reads the project's instruction files and the code. When the request
   names a solution or spans more than one area, a separate **researcher**
   reads the code first, without being told what anybody wants built, and
   reports facts with a `file:line` for each.
3. **Stops in chat** to agree the shape: the outcome, the walkthrough, the
   shape of the change (files and contracts, before and after), the
   ticket list with tiers and what waits for what, what can run side by side,
   and a list of questions, each with a recommended answer.
4. Writes the epic and ticket bodies as drafts outside the repository, and
   runs every `CHECK` to prove it fails today: a check that already passes
   proves nothing.
5. A separate **plan reviewer** reads the drafts, re-runs the checks,
   compares the shape of the change with the tickets and the code, and
   reports what will fail.
6. **Stops for your approval.** Nothing is created on GitHub before you say
   yes. Then it checks the branch name is free, creates the epic and its
   tickets, pushes `epic/<name>` from the default branch, adds
   `flow:approved` to the epic (or leaves that to a teammate on GitHub), and
   prints the epic's URL.

## `/flow:ticket #<n>`

Builds one ticket from ready to merged. A person can run it in a session
(**attended**: the session supervises, a worker it spawns builds, and it may
ask questions), or a host can run `claude -p "/flow:ticket #<n>"` with
`FLOW_UNATTENDED=1` (**unattended**: nothing waits for an answer; a question
becomes `flow:needs-human`). Each step posts one comment on the issue:

1. **Start** (`flow start`): refuses a ticket that is not ready or a working
   tree with uncommitted changes; cuts `ticket/<n>` from the epic branch
   (release) or the default branch (incremental, or no epic); labels it
   `flow:in-progress`; says who builds it, on which model.
2. **Build** on the ticket's model, `tier:easy` on Sonnet, otherwise Opus:
   the `ticket-worker` agent builds it by the rules in
   [`agents/ticket-worker.md`](plugins/flow/agents/ticket-worker.md) (scope,
   commits, comments, tests, when to stop), and unattended the session reads
   that file and builds by it itself.
3. **Check** (`flow check`), then **screenshots** (`flow screenshots`) when
   the project says how to take them.
4. **Review** (`flow:in-review`): a separate reviewer on the strongest model
   reads the commits, the ticket and the epic's ground rules, and never the
   builder's reasoning. Important findings are fixed in `(review fix)`
   commits and reviewed once more; one still open after that goes to a
   person.
5. **Accept** (`flow accept`): the criteria run on the committed head and
   the results are posted with that commit. It is refused while untracked
   files sit in the tree, before a review is posted or while one has an
   Important finding open, when a design comparison has no posted
   `**Compared:**` table, and when the issue body (which holds the criteria)
   was edited after the start, naming who edited it, and while HEAD is not
   the commit the latest review read (a fix after the review is reviewed
   too). Flow reads its own comments only from the account running it, so
   `start`, `accept`, `deliver`, `merge`, `reset` and `release-pr` run under
   one GitHub account: a ticket accepted under another account is not
   merged (`merge --epic` says so), and `reset` on it proceeds.
6. **Cost** (`flow meter`): what each step cost, posted as a table.
7. **Hand off** (`flow handoff`): three to five lines for the tickets after
   this one; see [Handoffs between tickets](#handoffs-between-tickets).
8. **Deliver** (`flow deliver`): only the accepted commit. Release: merged
   into the epic branch with `--no-ff` and labelled `flow:done`; if the
   branch moved it tries again twice, and a conflict goes to a person.
   Incremental: a pull request into the default branch, then the pull
   request loop below.

A ticket stops for a person only when a decision is needed that no agent may
make: a gate still fails after two rounds of fixes (acceptance, an Important
review finding, a pull request thread or check); the plan and the work
disagree (the ticket contradicts the code, a check looks wrong, the issue
body changed after the start); or a merge conflict. Everything else is
retried or noted in a comment. Under `Stops: none`, in an unattended run, an agent
decides where it may and records it (a departure from the plan, a disputed
check), parks the rest instead of stopping, and the run reports it all at
the end; see [A run with no stops](#a-run-with-no-stops).

**A ticket whose run died can be resumed.** `flow reset <n>` puts a ticket
left in progress back to planned, with a comment, and keeps its branch;
the next `flow start` checks that branch out and carries on from its last
commit instead of starting over. Both hosts below do this by themselves,
once per ticket; a second death goes to a person. A local run also builds
once more a ticket whose builder died before `flow start` (there is nothing
to reset), so a death before the start and one after it make two rebuilds
before a person is asked.

### What belongs in an instruction file

A project's `CLAUDE.md` and `AGENTS.md` are read by every session, so a line
in them costs every later ticket. Workers update them in the same commit as
the change they describe, and the ticket reviewer pushes the other way with
this rule, quoted from its instructions:

> An instruction-file line added by the ticket that restates what the code,
> a test or a command's own help already says, or that narrates history
> ("we used to…", "in ticket #n we…"), is a finding: the file holds only
> what cannot be derived, and each rule carries its reason in a clause. A
> rule the ticket broke that the file states is Important.

The retro asks the same question of the whole file (which rules nothing
needed, which are derivable), and `flow stats` shows whether the files grew.

### Handoffs between tickets

What one ticket learned that a later one needs would otherwise sit in
commits and review threads that nobody after it is told to read. So before
it is delivered, each ticket posts a **handoff** (`flow handoff <n> --text
"<lines>"` or `--file <md>`): three to five lines on what changed that the
plan did not say, the decisions that bind later tickets (a name, a shape, a
route), and where the plan was wrong and what was done instead; nothing a
reader gets from the diff. It is a comment starting `<!-- flow:handoff -->`
and `**Handoff.**`, so the epic's body stays as it was approved. It is
refused before the ticket is in review or done, since there is nothing to
hand off before the work exists, and over 1,200 characters, since the detail
is in the commits. While the ticket is in review, a second handoff replaces
the first in what later tickets see; once it is done its handoff is never
replaced (a done ticket with none may get its first), so a later ticket's
worker cannot rewrite what an earlier ticket decided. Only handoffs posted
by the account running Flow count, like every other step comment.

`flow ticket <m>` carries, after the ticket, the latest handoff of the done
tickets in the same epic: the ticket's own blockers first, then the rest in
the epic's order. It reads at most twenty of them, saying how many it did
not read, and when the account running it cannot be known it prints the
ticket with no handoffs and one line saying why. The next builder reads
them before the code, and its reviewer gets them too, as claims to check
against the earlier tickets' merged code. A handoff states decisions, never
why the code is right: the reviewer of a later ticket reads it, and an
explanation of why code is right makes a reviewer agree.

### The pull request loop

`flow pr-review-request` asks Copilot to review (a project with
`.coderabbit.yaml` is reviewed by CodeRabbit instead, and a repository
without Copilot code review answers `none`); `flow pr-wait` waits
for that review; `flow pr-threads` lists the unresolved threads, and each is
fixed or answered, then closed with `flow pr-resolve` and a reply;
`flow pr-checks --wait` waits for CI, and a failure is fixed; a pull request
no check ever appears on is said to have no CI, never read as passing. Two
rounds, then a person (under `Stops: none`, two rounds and the comment says
what remains). One comment per round on the ticket.

### `.flow.json`

Optional, at the repository root:

```json
{
  "screenshots": "npm run screenshots",
  "screenshotsDir": ".flow/screenshots/{n}",
  "copy": [".env"],
  "setup": ["npm ci"]
}
```

`screenshots` is a shell command that writes PNGs of the built screens. It
gets `FLOW_TICKET` and `FLOW_SCREENSHOTS_DIR`, and may print another
directory as its last line. The images are committed on the ticket branch
and posted on the issue.

`copy` and `setup` say what a fresh working copy needs before anything can
be built or checked in it: a copy has only what git tracks. `copy` lists
files copied in from your checkout (only files git ignores, such as `.env`:
a copied file git does not ignore is one `git add -A` from a commit, so it
is refused); `setup` lists commands run in the copy, in order, within eight
minutes in all. They are read from the branch as committed, never from your
working tree. They are used when tickets are built side by side and when
`flow check-epic` checks the epic branch, which happens after every merge:
an epic built one ticket at a time pays `setup` once per ticket.

A `qa` section says what `/flow:qa` may visit and touch; see
[`/flow:qa`](#flowqa-url-a-browser-walks-the-site).

### The cost comment

`flow meter <n> --transcripts worker=<file> reviewer=<file> ...` reads
Claude Code transcripts (a file, a directory, or a headless run's
`stream-json` output, which it splits into worker, reviewer and fixes by
itself) and posts, per step and per model: input and output tokens, cache
writes and reads, the largest context any single request held, compactions,
and time from first to last message, plus the same figures as JSON for later
reading. Each step also names its models and its **effort**: the distinct
`effort` values (such as `low`, `medium`, `high`, `xhigh`) on that step's
assistant lines, which a Claude Code session transcript records beside each
message, sorted and joined by `, ` when a run changed it. A source that does
not carry it (a headless run's `stream-json` or the Action's file may not)
reads `unknown` in the `Effort` column and `null` in the JSON. Anything a
transcript does not record reads `unknown`: nothing is estimated. Attended,
the transcripts are under
`~/.claude/projects/<project>/<session>/subagents/agent-<id>.jsonl`, where
`<id>` is the `agentId` the Agent tool returned.

A headless run's output (`claude -p --output-format stream-json --verbose`,
or the JSON file the GitHub Action leaves) ends with the run's own totals
per model; the comment shows those beside the per-step figures, and times
the run by them, since the messages alone miss the time before the first
answer. `--workflow <run dir>` reads one ticket's agents out of a
`/flow:run` workflow run, by their labels (`worker:#12`, `reviewer:#12`,
`fixes:#12`), and out of every other run in the same workflows directory
that built the ticket, in run-id order, because a ticket that halted and
was built again spans two runs. The comment says how many runs it read and
its JSON lists them (`runs`). A run some cost comment on the ticket already
lists is left out, so the sums over the comments count each run once; when
every run is covered it posts nothing. A cost comment from before runs were
listed cannot say which run it covered, so beside one only the run given is
read, and `meter` says so.

The comment is the record; on a linked project board, `meter` also copies
its figures into the [cost fields](#the-cost-on-the-board), the board's copy.

## Building a whole epic: two hosts

An approved epic can be built with nobody watching, on your machine or on
GitHub. Both run the same `/flow:ticket` and the same `flow` commands, read
what is ready from GitHub each time rather than trusting any agent's
account, and end at the epic's one pull request, which a person merges.

What a person does: **approve** the plan (the `flow:approved` label),
**answer** any ticket labelled `flow:needs-human` (the comment mentions you
and says why; relabel it `flow:planned` to have it built again from its
branch, and on GitHub add `flow:start` too, since a relabel alone starts
nothing there), and **review and merge** the release pull request. Use one
host per epic: two would build the same tickets.

### `/flow:run #<epic>`: on your machine

Checks first (`flow doctor`, the epic is approved and not stuck, a clean
working tree, nothing in progress that someone may still be working on),
then hands the loop to a workflow script you can watch with `/workflows`.
Each round it:

1. reads what is ready (`flow next`);
2. takes up to `Parallel:` ready tickets, in the epic's order;
3. builds each with `/flow:ticket` on its model, has the ticket reviewer
   (which it starts itself) review it, and has the builder fix what was
   found, two review rounds at most;
4. with `Parallel:` 2 or 3, builds them side by side, each in its own
   working copy beside the repository set up from `.flow.json`, then merges
   the accepted commits into the epic branch one at a time, in the epic's
   order, and runs those tickets' checks again at the new epic head
   (`flow check-epic`), because two tickets that pass alone can break each
   other. If the copies cannot be set up, that round runs one ticket at a
   time and the epic gets a comment saying why, for each copy: the step
   that failed and how long it ran against the setup's budget, or that no
   readable answer came back. The run never stops for it, and it removes
   every copy of that round. A copy left behind by an earlier attempt that
   was killed is replaced, never reused, since nothing in it was built yet.
   One at a time, each ticket merges itself and is checked at the epic head
   the same way.

A workflow script has no shell, so a small agent runs each `flow` command
for it and hands back the exit code and what the command printed. The
script parses that output itself and never takes the agent's summary of it,
because a retelling is not the record. A short command that prints JSON
and brought none back is run once more by a fresh agent; `flow worktree`
and `flow check-epic`, which can run for many minutes, are run once only,
because a second copy would run beside the first. A stop over an answer
nobody could read quotes the exit code and the last line that came back. Before it halts over
what GitHub said (the epic is not approved, or at the end not every ticket
is done), it reads the board a second time and halts only when both
readings agree.

Every merge takes the commit the acceptance comment names, never one an
agent reported. A builder that died after its ticket passed acceptance is
not built again; its accepted commit is merged. A ticket that stops goes to
a person and the run carries on with the rest. While the run is going, its
comments on the epic mark it live and `flow dispatch` (the Action's
scheduler) refuses to start anything, whichever account posted them; the
rule holds only through that mark. A run that was killed leaves it, and a
comment starting `<!-- flow:local-run-end -->`, posted from any account,
clears it.
When nothing is ready and nothing is in progress (under `Stops: none`,
also when tickets are parked: then the pull request is a draft), it checks
every ticket at the epic head, opens the release pull request (`flow release-pr`: the
outcome, the walkthrough, each ticket's merge commit, the cost; it opens
only at the head that check passed at, whatever the helper said of the
check, and an answer that names no pull request is asked for once more
before the run gives up, quoting the refusal), answers its
review and CI for up to two rounds, and posts the link on the epic. Then the
session posts each ticket's cost from the run's records
(`flow meter <n> --workflow <run dir>`).

### Run it on GitHub

Copy [`plugins/flow/github/flow.yml`](plugins/flow/github/flow.yml) into
your project's `.github/workflows/`, then add these repository secrets:

- `ANTHROPIC_API_KEY` (or switch the commented line to
  `CLAUDE_CODE_OAUTH_TOKEN`);
- `FLOW_TOKEN`: a fine-grained personal access token or a GitHub App token
  with read and write access to contents, issues and pull requests. Labels
  added with the default `GITHUB_TOKEN` start no other workflow, and the
  scheduler starts tickets by adding a label. To keep a
  [project board](#the-project-board) in step, give it the Projects
  permission (read and write) too.

Flow trusts its own comments only from the account it runs as, and asks
GitHub which that is. A GitHub App's installation token, and the default
`GITHUB_TOKEN`, may not be allowed to ask (`Resource not accessible by
integration`); then every command that reads those comments refuses, naming
`FLOW_ACCOUNT`. The template sets `FLOW_ACCOUNT` to `github-actions[bot]`
when there is no `FLOW_TOKEN`, and otherwise to the repository variable
`FLOW_ACCOUNT` when you set one: `<app-slug>[bot]` for an App token. A
personal access token can ask, so it needs none. Whether an App token can
ask is unverified; to check, run
`gh api graphql -f query='query{viewer{login}}'` in a job step with that
token: it either prints the login or fails.

A runner has no checkout with your ignored files, so a `.flow.json` `copy`
entry (such as `.env`) fails the epic check there: write those files in a
step before the jobs that need them (from secrets), or keep `copy` empty for
epics built on GitHub.

If your CI runs on GitHub Actions, put its workflow names under
`workflow_run` in the file: suites made by Actions send no `check_suite`
event.

The jobs:

| Job | Runs when | What it does |
|---|---|---|
| `board` | an issue labelled `flow:epic` is closed (a closed finding runs nothing) | `flow board-sync <epic>`: the epic's `Release` becomes `Released` once its release pull request merged. One of the two jobs after a merge (see [How work is kept on GitHub](#how-work-is-kept-on-github)); it builds, merges and pushes nothing. `Released` on the board needs a `FLOW_TOKEN` with the Projects permission: the Actions token cannot touch Projects, and the job then exits green having done nothing |
| `delivered` | a ticket labelled `flow:in-review` is closed as completed, which a person's merge of its pull request does through `Closes #<n>` | `flow delivered <n>`: marks it done when that pull request was merged from `ticket/<n>` into the default branch, so a run that ended before its last step leaves nothing in review. One of the two jobs after a merge; it builds, merges and pushes nothing, and fails, changing nothing, for a ticket closed with no merged pull request of its own |
| `route` | the epic gets `flow:approved` (an issue that is not an epic, such as a finding, starts nothing), or a ticket `flow:start` | Reads the epic's number from the event alone, so every scheduler run of one epic waits for the last |
| `epic` | after `route`, and after every ticket | Withdraws a start request whose `ticket` job failed before it could, then `flow dispatch`: adds `flow:start` to up to `Parallel:` ready tickets. When everything is built: `flow check-epic`, then `flow release-pr` (which reuses an open one, rewriting its body when it does not close every done ticket), and asks the review bot. When nothing is ready and nothing is in progress, posts `flow run-report`. Under `Stops: none`, once built or stopped: `flow check-epic` (once more when the first parked a ticket), `flow release-pr --draft` (a draft while tickets are parked, marked ready once all are done), then `flow run-report`. Never runs Claude |
| `ticket` | a ticket gets `flow:start` (a finding does not run it), or by hand with a ticket number | Runs `/flow:ticket #<n> --unattended --no-merge` on the tier's model (with `--resolve-conflict` when `flow ticket` says a conflict is to be resolved), posts the cost from the run's output, keeps the screenshots as an artifact, and resets a run that died |
| `merge` | after `ticket` | One at a time per epic: merges every accepted ticket into the epic branch in the epic's order (`flow merge --epic`), then checks them at the new head |
| `pr` | a review is submitted, or checks fail, on a `ticket/` or `epic/` pull request | Runs one round of the pull request loop (`/flow:ticket --pr-loop <pr>`). A ticket's pull request is left to its `ticket` job, which runs its own loop, until the ticket is done |

### A run with no stops

`Stops:` in the epic's `## Settings` says what an unattended run does when a
ticket reaches something no agent may decide:

- `Stops: ask` (the default): the ticket stops and asks a person by
  mention, and the run carries on with the others.
- `Stops: none`: nothing stops. An agent decides where it may and records
  the decision on the ticket; what it may not decide is **parked**, and the
  person reads every decision and every parked ticket once, at the end.

**Departures and disputes.** A departure (`flow depart <n> --text "<the
ticket says X; src/a.ts:40 does Y; built Z>"`) and a dispute
(`flow dispute <n> --check <k> --text "<what the line asks, what is true,
the evidence>"`) are comments on the ticket, starting `**Departure.**` and
`**Disputed check <k>.**`, at most 600 characters each: the facts and the
decision, never why it is right, because the reviewer reads them. `<k>` is
the check's number in `flow check`'s order. Both refuse a ticket that is
not in progress or in review, and refuse under `Stops: ask` or attended,
so the setting is enforced in the command. A dispute never edits the
criteria, which stay the person's gate: `flow accept` passes a ticket only
when every check that failed has a dispute from the running account posted
after the latest start, and its comment says `passed, with N disputed
check(s)` and lists each. The reviewer gets them as claims to check (a
departure the code did not require, or a dispute where the check is right
and the work is wrong, is Important), the handoff names each departure in
one line, and the release pull request lists them all under
`## Departures` and `## Disputed checks`.

It applies only to unattended runs (`FLOW_UNATTENDED=1`, which both hosts
set): attended, the person is in the chat and a question costs nothing, so
a stop asks as under `ask`. A standing epic for findings keeps `ask`.

A parked ticket carries the same `flow:needs-human` label as a stopped one,
so `flow next`, the board, `flow dispatch` and the project's `Status` read
it the same way, and the way back is the same: relabel it `flow:planned`.
Its comment starts `**This ticket is parked.**` with the reason and
mentions nobody, because the person is told once, at the end. The run
never ends for a parked ticket: it goes on with everything not blocked by
it, and a ticket that waits for one (a Translations ticket blocked by
every other) is left waiting, which the end report says.

| Stops under `ask` | Under `none` |
|---|---|
| The acceptance checks still fail after two rounds of fixes | Parked |
| An Important review finding is still open after two rounds | Parked |
| A pull request thread or check is still open after two rounds | No stop: the second round's comment says what remains, the run's report lists it under the pull request, and a person owns the pull request anyway |
| The ticket contradicts the code | A **departure**: the worker makes the smallest change of plan that keeps the walkthrough true, builds it and records it (`flow depart`) |
| A `CHECK` itself looks wrong | A **dispute**: after a real effort the worker records why the check cannot pass as written (`flow dispute`), and acceptance passes a ticket whose every failing check is disputed |
| The issue body was edited after the start | Still a stop: whoever edited a ticket mid-run is present and acting on it, and the refusal, which mentions them, answers their own action |
| A merge conflict with the epic branch | Resolved once by a fresh worker: it merges the epic branch into `ticket/<n>` keeping both sides' intent, that commit is reviewed (an Important finding parks the ticket), accepted and merged by the usual gates; a second conflict parks the ticket |
| A ticket's checks fail at the epic head after merging | Run a second time first (under either setting); still failing: parked, and it stays merged. No agent commits to the epic branch except by merging an accepted ticket |
| A builder died twice, or a start was refused | Parked |

**One report at the end.** `flow run-report <epic>` writes the closing
comment both hosts post, the local run's and the Action's alike, from the
epic and its tickets' comments. Under `none` it lists the built tickets,
each parked ticket with the first line of its reason, what was not built
and why, every departure and disputed check, and the release pull request, and mentions the epic's assignees
(or its author) once, there. Under `ask` it is the closing the run always
posted. `flow stats` counts a parked ticket as a stop, with its reason.

The person reads it all once, on the release pull request, which is where
they read the work anyway. When the run ends with tickets parked (nothing
ready, nothing in progress), it still opens that pull request, as a
**draft**: `flow check-epic` runs over the done tickets first, as always,
then `flow release-pr <epic> --draft`. Its `## Tickets` table lists the done
tickets, a `## Not built` section lists each parked or unstarted ticket with
its state and the first line of its reason, and it has `Closes` lines only
for the tickets in it and none for the epic, which is not finished. The
epic's `Release` stays `Building` while the pull request is a draft. Once
the person has decided the parked tickets (relabel each `flow:planned`) and
a run has built them, `release-pr` finds the open draft, rewrites its body
in full, marks it ready for review, sets `Release` to `Pull request open`,
and says on the epic that it was marked ready. Should a ticket stop being done afterwards, the next `release-pr --draft` converts it back to a draft and rewrites its body, since it is a draft while anything is not built.

## `/flow:quick [#<epic>] "<what>"`

For one small, low-risk change: it reads the code the request is about
first, and asks you before writing anything when the code says otherwise
than the request; then it writes a ticket with no epic
(`flow create-ticket --no-epic`), proves its check fails, and runs
`/flow:ticket` on it, ending at a pull request. Anything touching sign-in,
payments, data migrations, deletion or shared infrastructure goes through
`/flow:epic`.

With an epic, it is the light path for what you ask after reading an
epic's work, say on its release pull request: the ticket joins that
approved epic (not while a run is building it; `flow create-ticket`
refuses a closed epic), its check is proven red on the code it changes, and
it is built and delivered like the epic's other tickets; for a release epic,
`flow check-epic` and `flow release-pr` then add it to the open release pull
request. With the GitHub
Action, it adds `flow:start` instead and the Action does the rest.

## `/flow:review [range]`

The ticket reviewer's rules, run by hand on a range of commits. It reports
and fixes nothing.

## Findings: bugs and ideas before they are tickets

A ticket exists only when someone who read the code wrote its scope and its
criteria. Bugs and ideas arrive before that, with evidence and no criteria:
from a person on the site with the reporter browser extension (its label
option is `flow:found`), from anyone typing an issue on GitHub, or from an
agent with `flow create-finding`. Those are **findings**, and nothing can
start from one.

**A finding is an issue labelled `flow:found`.** It never carries
`flow:ticket`, and `next`, `board`'s ticket list, `dispatch`, `check-epic`,
`merge --epic` and `release-pr` read past it: it is not planned, not ready,
not built and not stuck, and a release pull request neither ships nor closes
it. It may be a sub-issue of an epic or have no parent. `flow board`
prints, per epic and for findings with no epic,
`findings: <n> waiting, <m> approved`.

**Its body is a person's words**, never refused for its shape, because the
reporter is not Flow's user. The recommended shape:

```
## What happened
## Where
<the URL, and the window width>
## Steps
## Expected
## Screenshots
1. ![what it shows](<image link>) <an optional caption>
```

Nothing reads a finding's body except to collect its image links. To give
people on GitHub that shape and the label, copy `github/finding.md` from the
plugin to `.github/ISSUE_TEMPLATE/finding.md` in your project.

**Filing one from a terminal or an agent**:

```bash
flow create-finding --title "<t>" --file <body> [--epic <e>] \
  [--screenshots <dir>] [--fingerprint "<text>"]
```

`--epic` makes it a sub-issue of that epic, which must be open.
`--screenshots` takes a directory of PNG, JPEG or WebP images: once the issue exists, they are committed to the
branch `flow-findings` under `findings/<issue number>/` (the branch is
created with only a `README.md` when it is missing, holds no code and is
never merged), pushed, and listed under `## Screenshots` in the issue, each
linked by its commit so the link never moves. `--fingerprint` files a bug
once: when an open finding, or a ticket promoted from one, already carries
the same `<!-- flow:finding fingerprint=<text> -->` line, nothing is filed
and the command exits 3 printing that issue's number; otherwise the line is
written at the top of the new body. An agent walking a site builds it from
the page's address and a short description, so a nightly run files each bug
once. The search covers open findings, open tickets, and findings closed
as not planned (what `flow reject` does, or "Close as not planned" on
GitHub): a rejected fingerprint exits 3 too, saying "#n was rejected on
<date>: reopen it to reconsider", so a nightly run does not file again what
a person turned down. It reads the 500 most recently updated closed
findings, and says so when there were more, since an older rejection would
not be found. A finding closed as completed does not count: what it
reported was dealt with, so the same fingerprint is a new bug.
`--repo <owner>/<name>` files the finding in another repository, such as the
plugin's: `--epic` and the fingerprint search are looked up there, and
`--screenshots` is refused, because the images go to this repository's
`flow-findings` branch.

**A person approves a finding** by adding `flow:approved` to it, and rejects
it by closing it. `flow found [<epic>] [--json]` lists the open ones: epic or
none, who filed it and when, approved or waiting, how many images. On
GitHub, the Action's scheduler ignores `flow:approved` on anything that is
not an epic, so approving a finding starts nothing.

**`/flow:triage [<epic>]`** turns the approved ones into tickets. It reads
each finding and every screenshot, and the code it points at, and decides: a
ticket (scope, what is out of scope, criteria with at least one CHECK it saw
fail, and a tier), not a ticket (one sentence: it does not happen, it is
already fixed, it duplicates another, or it is a question for the reporter),
or too big for one ticket (it needs `/flow:epic`). It shows one table and
waits for you to edit it or say go. Then it runs, per ticket,

```bash
flow promote <n> --file <ticket body> --tier easy|hard --epic <e> \
  [--blocked-by <n>,<n>]
```

the only way a finding becomes a ticket: it refuses (exit 2, one sentence) a
finding nobody approved, criteria that cannot decide it, an epic that is not
one or a `Blocked by` it cannot read; then it writes the ticket body with the
finding's original text kept word for word under a last section
`## Report` (nothing under it is read as the ticket, so a reporter cannot
write criteria into it), relabels it `flow:ticket`, `flow:planned` and the
tier, moves it under the epic, lists it there and puts it on the project
board as `Planned`. From then on it is ready exactly when any ticket is.
"Not a ticket" ends with `flow reject <n> --text "<why>"`, which says why and
closes the finding as not planned; "too big" leaves it open and approved, with
a comment naming `/flow:epic`.

**A standing epic** collects the tickets that findings become: `/flow:epic
--standing "Bugs"` writes one with `Delivery: incremental`, no `Branch:` and
an empty `## Tickets`, so each promoted ticket starts from the default branch
and opens its own pull request into it. You approve it like any epic, and
findings and triage fill it over time; until the first ticket arrives,
`flow next` exits 1 saying it has no tickets and the Action's scheduler does
nothing. Triage files a finding with no epic of its own under the open epic
titled `Bugs` when there is exactly one.

## The `flow` command

`node <plugin root>/scripts/flow.mjs <command>`. It stores nothing locally:
every answer is read from GitHub (through `gh`) and git. JSON is printed
indented for people; `FLOW_JSON=compact` prints it on one line, which is how
`/flow:run` reads it, since its helper agent hands back a long output whole
only when told to.

| Command | What it does |
|---|---|
| `init [--board [<title>]]` | Creates the twelve labels. Safe to run again. `--board` also makes sure a matching project board is linked: creates and links one (titled `Flow` by default), or adds the `Status` options a linked one lacks, keeping every option and every item's status, and adds the `Release` field or its missing options and the seven number fields it lacks; exits 1 on a field of one of those names of another kind, 2 when several linked projects could be meant, 1, with the `gh auth refresh -s project` hint, when GitHub refuses. See [The project board](#the-project-board) |
| `board-sync [<epic>] [--json]` | Sets the project board's `Status` of every open epic (`Epic`) and ticket from its labels, adding missing ones; findings and tickets with no readable state are skipped. Sets each release epic's `Release`, copies each metered ticket's figures, and closes the open `flow:done` tickets of release epics. One line per change, then `<n> set, <m> already right, <k> skipped` (and how many were closed, how many `Release` values set and how many tickets got figures; `--json` lists them as `closed`, `releases` and `figures`). Exits 1 when no matching board is linked, or when any issue could not be set (the rest are still set) |
| `doctor` | Checks `gh`, sign-in, that issues are on, the labels, the default branch, and every open epic's `Blocked by` lines (unreadable, outside the epic, cycles). Prints one sentence per problem, then one line naming the project board, its `Release` field and its cost fields (see [The project board](#the-project-board)), then `ok` when there was no problem |
| `board [<epic>] [--json]` | The default branch, then open epics with approval, progress and branch; or one epic's tickets with tier, state and blockers. Either way, how many findings wait or are approved |
| `next <epic>` | JSON: `approved`, `ready`, `waiting`, `inProgress`, `done`, `needsHuman`, `planned`, `problems`, and the settings `delivery`, `parallel`, `stops` and `branch`. Exits 1 when the epic is not approved, has no tickets, or is stuck (unfinished tickets, none ready, none in progress) |
| `ticket <n>` | One ticket parsed, as JSON, including who edited its body and when, and the latest handoff of each done ticket of its epic (`handoffs`, blockers first, read from at most twenty done tickets; `handoffsLeftOut` counts the ones not read), which it also prints on stderr under `handoffs:`. Under `Stops: none`, the ticket's own `departures` and its `disputes` since the latest start, from the running account |
| `check <n> [--cwd <dir>]` | Runs the ticket's criteria from the repository root (or `--cwd`). JSON results on stdout, with every edit of the issue body (who, when) and the last 20 lines of each failed check's output (`tail`); a readable table on stderr, the tail indented under each failed check. Exits 1 unless every check passed, and when the ticket has no criteria. Each CHECK runs in its own process group, which is killed when the command exits, times out, or `flow` is interrupted or dies, so nothing it started (a test runner, a server) outlives it |
| `check --file <md> [--epic-file <md>]` | The same for a draft that is not on GitHub yet |
| `post <n> --file <md>` or `--text "<md>"` | Adds a comment |
| `post <n> --review --important <k> --head <sha> --file <md>` | Posts a reviewer's report as the next numbered review round over `<sha>`, with how many Important findings it leaves open; refuses a count the report's Important section contradicts |
| `label <n> +<label> -<label> …` | Adds and removes labels; refuses to leave two state labels on one issue |
| `create-epic --file <md> --title "<t>"` | Creates the epic issue; prints its number |
| `create-ticket <epic> --file <md> --title "<t>" [--tier easy\|hard] [--blocked-by <n>,<n>]` | Creates the ticket, writes its `Epic:` and `Blocked by:` lines, links it as a sub-issue and adds it to the epic's task list; prints its number. Refuses a closed epic, since nothing would build the ticket |
| `link <epic> <n>` | Finishes a `create-ticket` that created the issue but could not link it. Safe to repeat |
| `create-ticket --no-epic --file <md> --title "<t>" [--tier easy\|hard] [--repo <owner>/<name>]` | Creates a ticket that belongs to no epic (counts as approved); `--repo` files it in another repository, such as the plugin's |
| `needs-human <n> --text "<why>"` | Marks the ticket `flow:needs-human` and asks a person, by mention; under `Stops: none` in an unattended run it parks the ticket instead, mentioning nobody |
| `depart <n> --text "<facts>"` or `--file <md>` | Under `Stops: none`, unattended: records a departure from the plan on a ticket in progress or in review (at most 600 characters); refuses otherwise, naming `flow needs-human` under `Stops: ask` |
| `dispute <n> --check <k> --text "<facts>"` or `--file <md>` | Under `Stops: none`, unattended: records that check `<k>` (in `flow check`'s order) cannot pass as written; refuses a `<k>` the ticket does not have, and as `depart` does |
| `handoff <n> --text "<lines>"` or `--file <md>` | Posts the ticket's handoff for the tickets after it; refuses one that is not in review or done, a done one that already has a handoff, and a text over 1,200 characters. The latest one counts |
| `create-finding --title "<t>" --file <md> [--epic <e>] [--screenshots <dir>] [--fingerprint "<text>"] [--repo <owner>/<name>]` | Files a finding (`flow:found`), its images on the `flow-findings` branch; prints its number, or exits 3 with the existing one when the fingerprint was filed before or rejected. `--repo` files it in another repository (no `--screenshots` there) |
| `retro-fingerprint <epic> --text "<line>"` | Prints the fingerprint a retro files a proposal with: this repository, the epic, and the line in lower case with only letters and digits |
| `found [<epic>] [--json]` | The open findings: epic, who filed them and when, approved or waiting, image count (with `--json`, the body and every image link too). Always exits 0 |
| `promote <n> --file <md> --tier easy\|hard --epic <e> [--blocked-by <n>,<n>]` | Turns an approved finding into a planned ticket of the epic, keeping its text under `## Report`; refuses with exit 2 otherwise |
| `reject <n> --text "<why>"` | Says why a finding is not a ticket and closes it as not planned |
| `start <n>` | Starts a ready ticket: branch, label, first comment. JSON out; refuses otherwise (unattended: and asks a person) |
| `accept <n>` | Runs the criteria on `ticket/<n>`'s committed head and posts the results with the commit; refuses an issue body edited after the start. Under `Stops: none`, unattended, passes when every failing check is disputed (`passed, with N disputed check(s)`; the marker carries `disputed=N`) |
| `deliver <n>` | Merges the accepted commit into the epic branch (release) or opens its pull request (incremental) |
| `delivered <n>` | Marks a ticket done (and closes it) once a person merged its own pull request from `ticket/<n>` into the default branch, read from GitHub, not from who posted the delivery comment; exit 1 changing nothing otherwise, exit 0 when it is already done |
| `screenshots <n>` | Runs `.flow.json`'s `screenshots` command, commits and posts the images |
| `meter <n> --transcripts [<role>=]<path> ... [--print]` | Posts what the ticket cost, read from transcripts, a headless run's output or the GitHub Action's, then copies the figures to the project board's cost fields |
| `meter <n> --workflow <run dir> [--print]` | The same, for one ticket, over every `/flow:run` workflow run beside `<run dir>` that built it; leaves out a run a cost comment already lists, and posts nothing when that is all of them |
| `pr-review-request <pr>` | Asks Copilot to review; prints `copilot`, `coderabbit` or `none` |
| `pr-wait <pr> [--bot …] [--timeout <s>] [--interval <s>]` | Waits for the bot's review of the current head |
| `pr-threads <pr> [--all]` | Unresolved review threads as JSON; `--all` adds the resolved ones |
| `pr-resolve <thread-id> --text "<reply>"` | Replies on a thread, then resolves it |
| `pr-checks <pr> [--wait] [--grace <s>]` | CI checks as JSON; exit 1 when one failed, 3 when some are still running, 4 when none appeared (under `--wait` it gives them 90 seconds first) |
| `reset <n> [--once]` | Puts a ticket whose run died back to planned; its branch keeps its commits. On a planned ticket whose `flow:start` request never started, takes the label off. Refuses a ticket that passed acceptance (it is waiting to be merged), answering in JSON either way. `--once`: if it was reset (or its request withdrawn) before, asks a person instead |
| `merge <n> [--sha <sha>]` | Merges the accepted commit into the epic branch; with `--sha`, refuses unless that is the accepted commit. Under `Stops: none`, unattended, a first conflict since the start posts a `<!-- flow:conflict -->` comment naming the files, leaves the ticket in review and prints `{ "kind": "conflict", "files": [...] }` (exit 1); a second one parks the ticket |
| `merge --epic <epic>` | Merges every accepted ticket of the epic, in the epic's order; leaves out, in `notMerged`, a ticket whose conflict a fresh worker is resolving (it carries `flow:start`, or its latest merge comment asks for a resolution and no acceptance came after), so the old commit is not merged under it |
| `check-epic <epic> [--tickets <n>,<n>] [--mark]` | Runs the done tickets' checks (or the listed ones') at the epic branch's head, in a clean copy set up from `.flow.json`, and posts the result on the epic, marked with the head, whether it passed and whether it judged every done ticket, which `release-pr` reads. A failing check is run a second time at the same head first; one that passes then reads `pass (check <k> passed on the second run)` and is listed in the JSON's `passedOnSecondRun`. Within one run each distinct command (its text, trimmed) runs once, and once more if it fails, however many tickets list it: every ticket is judged against that output by its own EXPECT, and a ticket that reused another's run reads `(check <k>: same run as #<n>)`, listed in the JSON's `sameRunAs`. A failed check reads `` `cmd` (exit N — <evidence>) ``. `--mark` hands each failing ticket to a person (under `Stops: none`, unattended, parks it), with the end of each failed check's output; it stays merged. A ticket an earlier epic check handed over is judged again: passing, `--mark` puts it back to done (listed in `backToDone`); still failing, it stays with the person and does not fail this check (`markedEarlier` in the JSON) |
| `worktree <n> [--remove]` | A separate working copy for one ticket, at `../.flow-worktrees/<repository>/ticket-<n>`, set up from `.flow.json`. A copy an earlier attempt left there is removed and made again (`replaced: true`). The JSON says how long it ran (`elapsedSeconds`) and, on a failure, the setup's budget (`budgetSeconds`) |
| `dispatch <epic>` | Adds `flow:start` to up to `Parallel:` ready tickets; prints the epic's `stops` setting; under `Stops: none` asks for each ticket in review whose latest merge comment is a conflict to be resolved (a `<!-- flow:resolve -->` comment and `flow:start`, listed in `resolving`); says whether the epic is `running`, `built`, `stopped`, or `empty` (approved with no tickets yet, such as a standing epic before triage fills it). Refuses while a `/flow:run` is building the epic |
| `release-pr <epic> [--draft] [--cwd <dir>]` | Opens the epic's pull request once every ticket is done, and posts it on the epic. `--draft`, under `Stops: none` only and while nothing is ready or in progress: opens it as a draft over the done tickets, with a `## Not built` section and no `Closes #<epic>`, keeping `Release` at `Building`; once every ticket is done, `release-pr` rewrites an open draft's body in full and marks it ready for review, and with `--draft` it converts a ready one back to a draft when a ticket is no longer done. An open, ready pull request whose body lacks a `Closes #<n>` line for some done ticket (one added after it opened, as `/flow:quick #<epic>` does) is rewritten in full and stays ready; one that closes them all is left as it is, with any note a person added. Run in the repository: it refuses, naming `flow check-epic <epic>`, unless the latest epic check from the running account judged every done ticket, passed, and is at the head of `origin/<epic branch>`, because the pull request carries that head and nothing else checked it. Reusing an open pull request goes through the same gate. By hand: `flow check-epic <epic>`, then `flow release-pr <epic>` |
| `release-pr <epic> --record <pr>` | Records a release pull request a person opened by hand (from another branch, such as one only that branch's CI runs on): posts the release marker on the epic, so `stats`, the retro and the board's `Release` field see it. Refuses unless every ticket is done, its base is the default branch, it was not closed unmerged, and the latest epic check from the running account passed, over every ticket, at its head; it opens and edits no pull request |
| `design-map <epic> [--out <file>]` | Writes the epic's design map for the design comparison |
| `run-report <epic> [--outcome built\|stopped] [--text "<why>" \| --file <md>] [--local] [--post]` | Prints the run's closing report, read from the epic and its tickets' comments; `--post` also posts it on the epic, `--local` as the end of a `/flow:run`. Under `Stops: none` it lists what was built, parked and not built, with the release pull request, and mentions the epic's people once; see [A run with no stops](#a-run-with-no-stops) |
| `stats [<epic>] [--since <date>] [--json] [--cwd <dir>]` | How the work went, per ticket, per epic and across epics; see [Looking back](#looking-back) |
| `report --out <dir> [--since <date>] [--cwd <dir>]` | Writes `<dir>/index.html`, the figures of every epic as one page for GitHub Pages; see [The report page](#the-report-page) |
| `qa-config [--widths <w>,<w>] [--cwd <dir>]` | The `qa` section of `.flow.json`, checked, with the defaults filled in, as JSON; exits 2 naming every unknown key or wrong type. Touches no GitHub |
| `qa-routes <url> [--routes <file> \| --sitemap <file> … \| --links <file>] [--cap 60]` | The pages `/flow:qa` visits, as JSON: the start page, then same-site pages from a list, a sitemap (an index lists the sitemaps to read next) or a saved page's links (else `.flow.json`'s `routes`), each once, without `deny` matches or files that are not pages, capped; `skipped` says how many were left out and why. Exits 2 when there is nothing to build from |
| `qa-fingerprint <url> "<first line>"` | The fingerprint a QA finding is filed with: the page's path and the normalised line |

## Looking back

### `flow stats [<epic>] [--since <date>] [--json]`

How the work went, read from the issues' comments and from git, and nothing
else. Per ticket, and summed per epic:

- **time per step**: building, review and fixes (from the cost comment),
  acceptance (how long its checks ran), delivery (from the passing
  acceptance to the merge, or to the last pull request comment when each
  ticket has its own pull request) and the whole ticket from its first
  start;
- **tokens** in, out, cache writes and cache reads, per model, the largest
  context any one request held, and compactions;
- **models and effort per role**, from the cost comments, one printed line
  per ticket (`- #12 models: worker claude-opus-5-5 high, reviewer
  claude-fable-5-1 high`; `worker unknown` where no comment carries it), and
  `roleModels` and `effort` (`{ worker, reviewer, fixes }`, each a list or
  `null`) in the JSON; two cost comments for one ticket union them, and the
  epic totals add nothing for effort, since a sum of efforts means nothing;
- **review rounds** and their Important findings;
- **rework**: commits ending `(review fix)`; **escaped defects**: commits on
  the default branch ending `(fixes #n)`, counted against ticket `#n`;
- **stops for a person**, each with its reason and a link (a parked ticket
  counts, marked `parked: true`), runs that
  stopped, and tickets that were planned side by side but built one at a
  time, with the reason;
- whether each ticket left a **handoff** (`handoff: true` or `false`), and
  how many did;
- **departures** and **disputed checks** per ticket (`departures`,
  `disputes`), the decisions an agent recorded under `Stops: none`;
- the **instruction files'** size (`CLAUDE.md` and `AGENTS.md` anywhere in
  the tree, lines and bytes), read from git at the commit the epic's first
  ticket started from and at the release pull request's merge commit, as
  `instructionFiles: { before, after }` and one printed line. Where no
  comment names the commit, the pull request is not merged, or this clone
  lacks the commit, the line says `unknown` and the JSON holds `null`.

Without an epic it covers every epic (`--since 2026-10-01` leaves out those
created earlier) and ends with the pace: done tickets per day and the median
ticket from start to end. A figure no comment or commit carries reads
`unknown`; a sum that only some tickets carry says how many (`1,800 (1/2)`).
Nothing is estimated. Run it inside a clone (or with `--cwd`), fetched: rework
and escapes come from its `origin/` branches.

### The report page

`flow report --out <dir> [--since <date>]` writes `<dir>/index.html`: the
same figures as `flow stats --json` over every epic, open and closed, as
one page with no build step, no library and nothing fetched. It has the
repository, when it was made and the plugin's version; the totals across
epics (tickets, time, tokens, review rounds, stops, the pace); then one
section per epic, newest first, with its state (`running`, `stopped`,
`built`, `shipped` once the epic is closed, or `closed without release`
when a release epic closed without its release pull request merging), its
`Release` word, its
release pull request, the instruction files' size, and a table of its
tickets (each linked to its issue: tier, models and effort per role
without the `claude-` prefix, as in `worker opus-5-5 · reviewer fable-5-1`,
state, time per step, tokens in
and out, cache, review rounds, Important findings, acceptance runs, resets,
escapes, handoff, stops, departures, disputes). A click on a column header sorts that table. A
figure nothing carries reads `unknown`, never blank or 0. Tables scroll
sideways at phone width; nothing else does. A repository with no epics gets
a page that says so. The page is made fresh each time and nothing reads it
back: the issues stay the record.

To publish it, copy [`plugins/flow/github/report.yml`](plugins/flow/github/report.yml)
to `.github/workflows/flow-report.yml` and set Settings, Pages, Source:
GitHub Actions. It runs daily, by hand, and when an epic closes (a release
shipped), with full history (stats reads git), and publishes with GitHub's
own Pages actions. It reads issues and pull requests and writes only the
Pages site; `FLOW_TOKEN` is used when set, as in `flow.yml`.

### `/flow:retro #<epic>`

After the release pull request is merged (or, when each ticket had its own
pull request, after every ticket is done), it hands the record to a separate
**retro miner**, which never saw the work being done, and gets back these
answers, each with links to the comments and commits behind it:

1. which stops needed a person, and whether the plugin could have answered
   the question itself;
2. which review findings were real defects and which were taste, and what
   the pull request bot found that the local reviewer did not, or the
   reverse;
3. where the time went;
4. which tickets were planned side by side and built one at a time, and why;
5. whether an acceptance check passed while the outcome was not met, or
   failed while the code was right;
6. which rule in the project's instruction files was broken or missing;
   and (6b) which rules this epic never exercised, and which the code or
   tests now say by themselves, with deletions proposed beside the
   additions;
7. what should change: in the plugin, in the project's instruction files,
   or nothing.

The answers are posted on the epic, with every proposal in one of four
groups, and you answer one table, a row per proposal. Only a yes files
anything:

- a **project follow-up** becomes a finding: a small one under the project's
  open `Bugs` epic, a feature-sized one with no epic, marked for
  `/flow:epic`;
- a **plugin proposal** becomes a finding in the plugin's repository under
  its open `Retro` epic (`flow create-finding --repo weekendgoals/ticket-flow
  --epic <Retro>`); with no such epic the row is not filed, and the retro
  prints `/flow:epic --standing "Retro"` to run in a clone of the plugin;
- an **instruction-file diff** (additions and deletions are separate rows)
  goes through `/flow:quick` to a pull request you merge;
- a **lesson** about how to work is offered as a dated section for the
  plugin's `METHODOLOGY.md`, which you add by hand or file as a plugin
  proposal.

Each filed finding links the retro comment and carries a fingerprint from
the epic and the proposal's first line (`flow retro-fingerprint <epic>
--text "<line>"`), so running the retro again files nothing twice. A last
comment on the epic says what was filed and why each rejected row was not.

## The reporter extension

`tools/reporter/` is a Chrome extension for filing findings from the page
you are looking at: you capture or paste screenshots, say what happened
and optionally give a title, and it files a GitHub issue
labelled `flow:found` under the epic you set in its options (usually the
open Bugs epic), with the screenshots committed to the `flow-findings`
branch and linked by commit. It has no build step: open
`chrome://extensions`, turn on Developer mode, choose Load unpacked and
select the folder. A person then approves the finding with `flow:approved`
or closes it, and `/flow:triage` turns approved findings into tickets. The
token it needs, its options and the exact issue it writes are in
[`tools/reporter/README.md`](tools/reporter/README.md). Its options hold
named targets (a repository, an epic and a screenshots branch each) under one
token, and the popup's File to list picks one, remembering the target you last filed
to on each site.

## `/flow:qa <url>`: a browser walks the site

`/flow:qa <url> [--epic <e>] [--routes <file>] [--widths 1440,393]` walks a
live site the way a visitor would and files every problem it sees as a
[finding](#findings-bugs-and-ideas-before-they-are-tickets), once. It
approves nothing: a person approves or closes each finding, and
`/flow:triage` turns the approved ones into tickets.

**It needs a browser tool in the session** and installs none. Playwright
MCP is the one to add (`claude mcp add playwright npx @playwright/mcp@latest`,
then a new session); Chrome DevTools MCP works too. Without either it stops
before anything else and says so.

What it does:

1. Reads `.flow.json`'s `qa` section (`flow qa-config`) and the project's
   instruction files.
2. Picks the epic to file under: `--epic <e>`, or the open epic titled
   `Bugs` (`/flow:epic --standing "Bugs"` makes one). With none it stops
   before the walk, because a walk with nowhere to file it is wasted.
3. Builds the page list with `flow qa-routes`: from `--routes`, else
   `.flow.json`'s `routes`, else the site's sitemap, else the start page's
   links. Same site only, each page once, files that are not pages left
   out, every `deny` match left out, at most 60.
4. Hires one `qa-explorer` agent per batch of up to ten pages, one at a
   time (they share the session's one browser). Each is handed only the
   site notes the session copied from your instruction files, never the
   files: they often list known bugs. At each page and width it
   records console errors and failed requests, checks the page's own links
   for 404s with HEAD requests only (never a link a `deny` pattern or the
   rules below name, and never a GET when HEAD is refused), looks for a page wider than the window and text cut off by its
   box, compares the document language with the text, reports the
   accessibility problems the browser shows and, with `--epic` on an epic
   with design sources, runs the design comparison. A screenshot only where
   something is wrong.
5. Files each finding with
   `flow create-finding --epic <e> --screenshots <dir> --fingerprint "$(flow qa-fingerprint <url> "<title>")"`:
   one finding per problem (the same broken header on every page is one),
   and none for a problem an open finding or ticket already carries.
6. Ends with one table: pages visited, findings filed, duplicates skipped,
   pages it could not load.

**The explorer's rules**, each because the site is live: it never submits
a form or sends a message, and never clicks a control that pays, orders,
signs up, deletes, cancels or unsubscribes (a contact form reaches a
person; an order charges a card). It never clicks, submits or visits what
a `deny` pattern matches, never signs in, and never leaves the site's
origin. With a `testMarker` it may fill a form's text fields with exactly
that text and submit it, because your gateway drops what carries it; a
field that will not take the marker leaves the form unsent.

```json
{
  "qa": {
    "routes": ["/", "/pricing", "/contact"],
    "deny": ["checkout", "/account/*"],
    "widths": [1440, 393],
    "testMarker": "[flow-qa-test]"
  }
}
```

`routes` are paths or addresses on the site; `deny` patterns match anywhere
in a control's text or label or a page's path, ignoring case, with `*` for
any run of characters; `widths` are window widths in pixels (1440 and 393
when not set); `testMarker` is one line. Every key is optional, and an
unknown key or a wrong type makes `flow qa-config` and `flow qa-routes`
exit 2 naming it:
a `deny` list read half-way would be a walk with no brakes.

**The fingerprint** is the page's path and the finding's title, lowercased,
numbers written `#` and punctuation dropped (`qa /pricing pricing table
wider than the window`), so the same problem found again next night is
recognised and skipped. The explorer's judgement cannot be tested here;
`/flow:retro` counts how many of its findings a person rejected instead.

**Nightly**: copy [`plugins/flow/github/qa.yml`](plugins/flow/github/qa.yml)
to `.github/workflows/flow-qa.yml`, set the repository variable `QA_URL`,
and give it the `ANTHROPIC_API_KEY` and `FLOW_TOKEN` secrets `flow.yml`
uses. It runs `/flow:qa <url> --unattended` on a schedule (or by hand with
another address) under claude-code-action, with the Playwright MCP server
configured in the file, driving the Chrome the runner already has, and
keeps the screenshots as an artifact. Your project installs nothing for it.

## Agents

- **researcher** — reads the code for the planner and reports facts with
  citations. It is never told the request or the wanted solution, and never
  proposes one.
- **plan-reviewer** — reads the draft plan with no stake in it and reports
  what will fail. It never edits the plan.
- **ticket-reviewer** — reviews one ticket's commits with no memory of
  writing them and never sees the builder's reasoning. It reports and never
  fixes.
- **retro-miner** — reads a finished epic's record for `/flow:retro` and
  answers its questions with evidence. It proposes changes and files none.
- **qa-explorer** — walks a batch of a live site's pages in the session's
  browser for `/flow:qa` and reports what is broken, with evidence. It is
  never told what anyone thinks is broken, clicks nothing that pays, signs
  up, deletes or sends, and files nothing.

These five run on the strongest model available: what a reviewer,
researcher or explorer left out cannot be checked afterwards.

- **ticket-worker** — builds one ticket on its branch for `/flow:ticket`,
  by the worker's rules its file holds, on the model the ticket's tier
  decides (Sonnet for `tier:easy`, otherwise Opus). It is handed the
  ticket's facts only, never the planning conversation.

## Further reading

- [`METHODOLOGY.md`](METHODOLOGY.md) — the lessons behind the rules.
- [`CHANGELOG.md`](CHANGELOG.md) — what changed in each release.
