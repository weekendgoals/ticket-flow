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
always merges into the default branch, and nothing runs after that merge.**

## The project board

A GitHub Project can show the same work as columns, one swimlane per epic. It
is optional, and it is only a view: the labels stay the only record of a
ticket's state, and Flow never takes a state from the project.

1. Run `flow init --board [<title>]` (locally, after
   `gh auth refresh -s project`). With no project linked to the repository,
   it creates one (titled `Flow` unless you give a title), sets its
   `Status` options to `Planned`, `In progress`, `In review`, `Done`,
   `Needs human` and `Epic`, and links it. With a linked project whose
   `Status` lacks some of them (the first one with a `Status` field, the
   one `flow doctor` names), it adds the missing ones and keeps every option
   already there, since issues may carry them (case does not matter). With one that has them all,
   it only names it.
2. Two steps the GitHub API cannot do, which `init --board` reminds you of
   when it creates the project: use the Board layout and set Swimlanes to
   "Parent issue", so every epic becomes one swimlane with its tickets in
   it; and optionally turn on the project's auto-add workflow with the
   filter `is:issue label:flow:ticket,flow:epic`, so issues made by hand
   show up too.
3. On a fresh board, or one that fell behind (it was linked late, or a token
   could not write to it for a while), run `flow board-sync [<epic>]`: it
   sets every open epic and its tickets, and every ticket with no epic, to
   the `Status` its labels say, adding any that are missing. It reads each
   item's current `Status` only to leave a right one alone.

From then on every command that changes a state label also moves the issue
to the matching `Status`, right after the label has changed: `label`,
`start`, `merge` and `deliver` when they mark a ticket done, `reset`,
`needs-human`, and every step that hands a ticket to a person. `create-epic`
and `create-ticket` add the new issue to the project (as `Epic` or
`Planned`). Flow uses the first linked project whose `Status` has all six
options; `flow doctor` names it.

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
   ticket list with tiers and what waits for what, what can run side by side,
   and a list of questions, each with a recommended answer.
4. Writes the epic and ticket bodies as drafts outside the repository, and
   runs every `CHECK` to prove it fails today: a check that already passes
   proves nothing.
5. A separate **plan reviewer** reads the drafts, re-runs the checks, and
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
2. **Build** on the ticket's model, `tier:easy` on Sonnet, otherwise Opus,
   with commits `#<n>: <what>`, no code comments, component tests for UI and
   an end-to-end test only for a journey the epic names.
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
7. **Deliver** (`flow deliver`): only the accepted commit. Release: merged
   into the epic branch with `--no-ff` and labelled `flow:done`; if the
   branch moved it tries again twice, and a conflict goes to a person.
   Incremental: a pull request into the default branch, then the pull
   request loop below.

A ticket stops for a person only when a decision is needed that no agent may
make: a gate still fails after two rounds of fixes (acceptance, an Important
review finding, a pull request thread or check); the plan and the work
disagree (the ticket contradicts the code, a check looks wrong, the issue
body changed after the start); or a merge conflict. Everything else is
retried or noted in a comment.

**A ticket whose run died can be resumed.** `flow reset <n>` puts a ticket
left in progress back to planned, with a comment, and keeps its branch;
the next `flow start` checks that branch out and carries on from its last
commit instead of starting over. Both hosts below do this by themselves,
once per ticket; a second death goes to a person. A local run also builds
once more a ticket whose builder died before `flow start` (there is nothing
to reset), so a death before the start and one after it make two rebuilds
before a person is asked.

### The pull request loop

`flow pr-review-request` asks Copilot to review (a project with
`.coderabbit.yaml` is reviewed by CodeRabbit instead, and a repository
without Copilot code review answers `none`); `flow pr-wait` waits
for that review; `flow pr-threads` lists the unresolved threads, and each is
fixed or answered, then closed with `flow pr-resolve` and a reply;
`flow pr-checks --wait` waits for CI, and a failure is fixed; a pull request
no check ever appears on is said to have no CI, never read as passing. Two
rounds, then a person. One comment per round on the ticket.

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

### The cost comment

`flow meter <n> --transcripts worker=<file> reviewer=<file> ...` reads
Claude Code transcripts (a file, a directory, or a headless run's
`stream-json` output, which it splits into worker, reviewer and fixes by
itself) and posts, per step and per model: input and output tokens, cache
writes and reads, the largest context any single request held, compactions,
and time from first to last message, plus the same figures as JSON for later
reading. Anything a transcript does not record reads `unknown`: nothing is
estimated. Attended, the transcripts are under
`~/.claude/projects/<project>/<session>/subagents/agent-<id>.jsonl`, where
`<id>` is the `agentId` the Agent tool returned.

A headless run's output (`claude -p --output-format stream-json --verbose`,
or the JSON file the GitHub Action leaves) ends with the run's own totals
per model; the comment shows those beside the per-step figures, and times
the run by them, since the messages alone miss the time before the first
answer. `--workflow <run dir>` reads one ticket's agents out of a
`/flow:run` workflow run, by their labels (`worker:#12`, `reviewer:#12`,
`fixes:#12`).

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
   time and the epic gets a comment saying so; the run never stops for it.
   One at a time, each ticket merges itself and is checked at the epic head
   the same way.

Every merge takes the commit the acceptance comment names, never one an
agent reported. A builder that died after its ticket passed acceptance is
not built again; its accepted commit is merged. A ticket that stops goes to
a person and the run carries on with the rest. While the run is going, its
comments on the epic mark it live and `flow dispatch` (the Action's
scheduler) refuses to start anything, whichever account posted them; the
rule holds only through that mark. A run that was killed leaves it, and a
comment starting `<!-- flow:local-run-end -->`, posted from any account,
clears it.
When nothing is ready and nothing is in progress, it checks every ticket at
the epic head, opens the release pull request (`flow release-pr`: the
outcome, the walkthrough, each ticket's merge commit, the cost), answers its
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
| `route` | the epic gets `flow:approved` (an issue that is not an epic, such as a finding, starts nothing), or a ticket `flow:start` | Reads the epic's number from the event alone, so every scheduler run of one epic waits for the last |
| `epic` | after `route`, and after every ticket | Withdraws a start request whose `ticket` job failed before it could, then `flow dispatch`: adds `flow:start` to up to `Parallel:` ready tickets. When everything is built: `flow check-epic`, then `flow release-pr` (which reuses an open one), and asks the review bot. Never runs Claude |
| `ticket` | a ticket gets `flow:start` (a finding does not run it), or by hand with a ticket number | Runs `/flow:ticket #<n> --unattended --no-merge` on the tier's model, posts the cost from the run's output, keeps the screenshots as an artifact, and resets a run that died |
| `merge` | after `ticket` | One at a time per epic: merges every accepted ticket into the epic branch in the epic's order (`flow merge --epic`), then checks them at the new head |
| `pr` | a review is submitted, or checks fail, on a `ticket/` or `epic/` pull request | Runs one round of the pull request loop (`/flow:ticket --pr-loop <pr>`). A ticket's pull request is left to its `ticket` job, which runs its own loop, until the ticket is done |

## `/flow:quick "<what>"`

For one small, low-risk change: it writes a ticket with no epic
(`flow create-ticket --no-epic`), proves its check fails, and runs
`/flow:ticket` on it, ending at a pull request. Anything touching sign-in,
payments, data migrations, deletion or shared infrastructure goes through
`/flow:epic`.

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
once. Only open findings and open tickets are searched, so a finding that was
rejected (closed) can be filed again by a later run; a person closes it
again, or files a ticket that fixes what keeps being found.

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
every answer is read from GitHub (through `gh`) and git.

| Command | What it does |
|---|---|
| `init [--board [<title>]]` | Creates the twelve labels. Safe to run again. `--board` also makes sure a matching project board is linked: creates and links one (titled `Flow` by default), or adds the `Status` options a linked one lacks; exits 1, with the `gh auth refresh -s project` hint, when GitHub refuses. See [The project board](#the-project-board) |
| `board-sync [<epic>] [--json]` | Sets the project board's `Status` of every open epic (`Epic`) and ticket from its labels, adding missing ones; findings and tickets with no readable state are skipped. One line per change, then `<n> set, <m> already right, <k> skipped`. Exits 1 when no matching board is linked, or when any issue could not be set (the rest are still set) |
| `doctor` | Checks `gh`, sign-in, that issues are on, the labels, the default branch, and every open epic's `Blocked by` lines (unreadable, outside the epic, cycles). Prints one sentence per problem, then one line naming the project board (see [The project board](#the-project-board)), then `ok` when there was no problem |
| `board [<epic>] [--json]` | The default branch, then open epics with approval, progress and branch; or one epic's tickets with tier, state and blockers. Either way, how many findings wait or are approved |
| `next <epic>` | JSON: `approved`, `ready`, `waiting`, `inProgress`, `done`, `needsHuman`, `planned`, `problems`. Exits 1 when the epic is not approved, has no tickets, or is stuck (unfinished tickets, none ready, none in progress) |
| `ticket <n>` | One ticket parsed, as JSON, including who edited its body and when |
| `check <n> [--cwd <dir>]` | Runs the ticket's criteria from the repository root (or `--cwd`). JSON results on stdout, with every edit of the issue body (who, when); a readable table on stderr. Exits 1 unless every check passed, and when the ticket has no criteria |
| `check --file <md> [--epic-file <md>]` | The same for a draft that is not on GitHub yet |
| `post <n> --file <md>` or `--text "<md>"` | Adds a comment |
| `post <n> --review --important <k> --head <sha> --file <md>` | Posts a reviewer's report as the next numbered review round over `<sha>`, with how many Important findings it leaves open; refuses a count the report's Important section contradicts |
| `label <n> +<label> -<label> …` | Adds and removes labels; refuses to leave two state labels on one issue |
| `create-epic --file <md> --title "<t>"` | Creates the epic issue; prints its number |
| `create-ticket <epic> --file <md> --title "<t>" [--tier easy\|hard] [--blocked-by <n>,<n>]` | Creates the ticket, writes its `Epic:` and `Blocked by:` lines, links it as a sub-issue and adds it to the epic's task list; prints its number |
| `link <epic> <n>` | Finishes a `create-ticket` that created the issue but could not link it. Safe to repeat |
| `create-ticket --no-epic --file <md> --title "<t>" [--tier easy\|hard] [--repo <owner>/<name>]` | Creates a ticket that belongs to no epic (counts as approved); `--repo` files it in another repository, such as the plugin's |
| `needs-human <n> --text "<why>"` | Marks the ticket `flow:needs-human` and asks a person, by mention |
| `create-finding --title "<t>" --file <md> [--epic <e>] [--screenshots <dir>] [--fingerprint "<text>"]` | Files a finding (`flow:found`), its images on the `flow-findings` branch; prints its number, or exits 3 with the existing one when the fingerprint was filed before |
| `found [<epic>] [--json]` | The open findings: epic, who filed them and when, approved or waiting, image count (with `--json`, the body and every image link too). Always exits 0 |
| `promote <n> --file <md> --tier easy\|hard --epic <e> [--blocked-by <n>,<n>]` | Turns an approved finding into a planned ticket of the epic, keeping its text under `## Report`; refuses with exit 2 otherwise |
| `reject <n> --text "<why>"` | Says why a finding is not a ticket and closes it as not planned |
| `start <n>` | Starts a ready ticket: branch, label, first comment. JSON out; refuses otherwise (unattended: and asks a person) |
| `accept <n>` | Runs the criteria on `ticket/<n>`'s committed head and posts the results with the commit; refuses an issue body edited after the start |
| `deliver <n>` | Merges the accepted commit into the epic branch (release) or opens its pull request (incremental) |
| `screenshots <n>` | Runs `.flow.json`'s `screenshots` command, commits and posts the images |
| `meter <n> --transcripts [<role>=]<path> ... [--print]` | Posts what the ticket cost, read from transcripts, a headless run's output or the GitHub Action's |
| `meter <n> --workflow <run dir> [--print]` | The same, for one ticket of a `/flow:run` workflow run |
| `pr-review-request <pr>` | Asks Copilot to review; prints `copilot`, `coderabbit` or `none` |
| `pr-wait <pr> [--bot …] [--timeout <s>] [--interval <s>]` | Waits for the bot's review of the current head |
| `pr-threads <pr> [--all]` | Unresolved review threads as JSON; `--all` adds the resolved ones |
| `pr-resolve <thread-id> --text "<reply>"` | Replies on a thread, then resolves it |
| `pr-checks <pr> [--wait] [--grace <s>]` | CI checks as JSON; exit 1 when one failed, 3 when some are still running, 4 when none appeared (under `--wait` it gives them 90 seconds first) |
| `reset <n> [--once]` | Puts a ticket whose run died back to planned; its branch keeps its commits. On a planned ticket whose `flow:start` request never started, takes the label off. Refuses a ticket that passed acceptance (it is waiting to be merged), answering in JSON either way. `--once`: if it was reset (or its request withdrawn) before, asks a person instead |
| `merge <n> [--sha <sha>]` | Merges the accepted commit into the epic branch; with `--sha`, refuses unless that is the accepted commit |
| `merge --epic <epic>` | Merges every accepted ticket of the epic, in the epic's order |
| `check-epic <epic> [--tickets <n>,<n>] [--mark]` | Runs the done tickets' checks (or the listed ones') at the epic branch's head, in a clean copy set up from `.flow.json`, and posts the result on the epic. `--mark` hands each failing ticket to a person; it stays merged |
| `worktree <n> [--remove]` | A separate working copy for one ticket, at `../.flow-worktrees/<repository>/ticket-<n>`, set up from `.flow.json` |
| `dispatch <epic>` | Adds `flow:start` to up to `Parallel:` ready tickets; says whether the epic is `running`, `built`, `stopped`, or `empty` (approved with no tickets yet, such as a standing epic before triage fills it). Refuses while a `/flow:run` is building the epic |
| `release-pr <epic>` | Opens the epic's pull request once every ticket is done, and posts it on the epic |
| `design-map <epic> [--out <file>]` | Writes the epic's design map for the design comparison |
| `stats [<epic>] [--since <date>] [--json] [--cwd <dir>]` | How the work went, per ticket, per epic and across epics; see [Looking back](#looking-back) |

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
- **review rounds** and their Important findings;
- **rework**: commits ending `(review fix)`; **escaped defects**: commits on
  the default branch ending `(fixes #n)`, counted against ticket `#n`;
- **stops for a person**, each with its reason and a link, runs that
  stopped, and tickets that were planned side by side but built one at a
  time, with the reason.

Without an epic it covers every epic (`--since 2026-10-01` leaves out those
created earlier) and ends with the pace: done tickets per day and the median
ticket from start to end. A figure no comment or commit carries reads
`unknown`; a sum that only some tickets carry says how many (`1,800 (1/2)`).
Nothing is estimated. Run it inside a clone (or with `--cwd`), fetched: rework
and escapes come from its `origin/` branches.

### `/flow:retro #<epic>`

After the release pull request is merged (or, when each ticket had its own
pull request, after every ticket is done), it hands the record to a separate
**retro miner**, which never saw the work being done, and gets back seven
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
7. what should change: in the plugin, in the project's instruction files,
   or nothing.

The answers are posted on the epic, and you are asked about each proposal.
Only a yes files anything: a plugin change becomes an issue in the plugin's
repository (`flow create-ticket --no-epic --repo <owner>/<name>`), and an
instruction-file change goes through `/flow:quick` to a pull request you
merge.

## The reporter extension

`tools/reporter/` is a Chrome extension for filing findings from the page
you are looking at: you capture or paste screenshots, say what happened,
the steps and what should have happened, and it files a GitHub issue
labelled `flow:found` under the epic you set in its options (usually the
open Bugs epic), with the screenshots committed to the `flow-findings`
branch and linked by commit. It has no build step: open
`chrome://extensions`, turn on Developer mode, choose Load unpacked and
select the folder. A person then approves the finding with `flow:approved`
or closes it, and `/flow:triage` turns approved findings into tickets. The
token it needs, its options and the exact issue it writes are in
[`tools/reporter/README.md`](tools/reporter/README.md).

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

All four run on the strongest model available: what a reviewer or
researcher left out cannot be checked afterwards.

## Further reading

- [`METHODOLOGY.md`](METHODOLOGY.md) — the lessons behind the rules.
- [`CHANGELOG.md`](CHANGELOG.md) — what changed in each release.
