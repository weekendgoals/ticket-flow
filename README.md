# ticket-flow

A Claude Code plugin that plans work as **epics** and **tickets** and keeps
them in **GitHub Issues**. GitHub is the board; git is the proof.

This is **Flow 3.0, stage 1**: planning (`/flow:epic`) and the `flow`
command-line tool are rewritten. Building, reviewing and the unattended run
are still the 2.x versions and are being rewritten next (see
[What is not rewritten yet](#what-is-not-rewritten-yet)).

## Install

```
/plugin marketplace add ~/projects/ticket-flow
/plugin install flow@ticket-flow
```

You also need the GitHub CLI, signed in: `gh auth login`. Then, once per
repository:

```bash
node <plugin root>/scripts/flow.mjs init      # creates the labels
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
| `## Settings` | One `Key: value` per line: `Delivery: release` or `incremental` (default `release`), `Parallel: 1` to `3` (default `1`), `Branch: epic/<name>`, `Design sources: <paths>`, `Consequence paths: <globs>` |
| `## Walkthrough` | In plain language, what a person will be able to do, scene by scene. No ticket numbers, no file names |
| `## Ground rules` | What every ticket must respect |
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

## The `flow` command

`node <plugin root>/scripts/flow.mjs <command>`. It stores nothing locally:
every answer is read from GitHub (through `gh`) and git.

| Command | What it does |
|---|---|
| `init` | Creates the ten labels. Safe to run again |
| `doctor` | Checks `gh`, sign-in, that issues are on, the labels, the default branch, and every open epic's `Blocked by` lines (unreadable, outside the epic, cycles). Prints `ok` or one sentence per problem |
| `board [<epic>] [--json]` | The default branch, then open epics with approval, progress and branch; or one epic's tickets with tier, state and blockers |
| `next <epic>` | JSON: `approved`, `ready`, `waiting`, `inProgress`, `done`, `needsHuman`, `planned`, `problems`. Exits 1 when the epic is not approved, has no tickets, or is stuck (unfinished tickets, none ready, none in progress) |
| `ticket <n>` | One ticket parsed, as JSON, including who edited its body and when |
| `check <n> [--cwd <dir>]` | Runs the ticket's criteria from the repository root (or `--cwd`). JSON results on stdout, with every edit of the issue body (who, when); a readable table on stderr. Exits 1 unless every check passed, and when the ticket has no criteria |
| `check --file <md> [--epic-file <md>]` | The same for a draft that is not on GitHub yet |
| `post <n> --file <md>` or `--text "<md>"` | Adds a comment |
| `label <n> +<label> -<label> …` | Adds and removes labels; refuses to leave two state labels on one issue |
| `create-epic --file <md> --title "<t>"` | Creates the epic issue; prints its number |
| `create-ticket <epic> --file <md> --title "<t>" [--tier easy\|hard] [--blocked-by <n>,<n>]` | Creates the ticket, writes its `Epic:` and `Blocked by:` lines, links it as a sub-issue and adds it to the epic's task list; prints its number |
| `link <epic> <n>` | Finishes a `create-ticket` that created the issue but could not link it. Safe to repeat |
| `needs-human <n> --text "<why>"` | Marks the ticket `flow:needs-human` and asks a person, by mention |

## What is not rewritten yet

These still read the 2.x `epics/<name>/tickets.md` files, which 3.0 no longer
writes, so they do not work with an epic planned by 3.0:

| | Stage |
|---|---|
| `/flow:ticket`, `/flow:review` — build and review one ticket | stage 2, not yet rewritten |
| `/flow:run` — the unattended run | stage 3, not yet rewritten |
| A GitHub Action that runs the same steps in the target project | stage 3, not yet written |
| `/flow:retro`, `/flow:quick` | stage 4, not yet rewritten |

## Agents

- **researcher** — reads the code for the planner and reports facts with
  citations. It is never told the request or the wanted solution, and never
  proposes one.
- **plan-reviewer** — reads the draft plan with no stake in it and reports
  what will fail. It never edits the plan.
- **ticket-reviewer** — reviews one ticket's change (stage 2).

All three run on the strongest model available: what a reviewer or
researcher left out cannot be checked afterwards.

## Further reading

- [`METHODOLOGY.md`](METHODOLOGY.md) — the lessons behind the rules.
- [`CHANGELOG.md`](CHANGELOG.md) — what changed in each release.
