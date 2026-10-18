---
name: retro
description: Look back at a finished Flow epic — how long each step took, what it cost, what the reviews found, where people had to step in — and propose changes to the plugin or to the project's instruction files, filing only what the user says yes to. Use when the user runs /flow:retro #<epic> after the epic's release pull request is merged.
---

# Retro #$ARGUMENTS

A finished epic leaves its whole story on GitHub: every step's comment, the
cost comments, the reviews, the stops, the release pull request. A retro
reads that record and asks what should change so the next epic goes better.
It produces **answers with evidence and proposals**, then stops for the
user: nothing is filed or edited before they say yes.

`FLOW` below means `node "${CLAUDE_PLUGIN_ROOT}/scripts/flow.mjs"`, run from
the repository root. `<e>` is the epic number from `$ARGUMENTS`, without the
`#`.

## 1. Is the epic finished?

```bash
git fetch origin
FLOW stats <e> --json
```

Read `epics[0]`:

- **Release delivery** (`delivery` is `release`): `releasePullRequest` must
  be there with `merged: true`. Otherwise stop and say so: "the release pull
  request is not merged yet" (or "was never opened"). A retro reads the
  finished record, and the release pull request's review and checks are part
  of it; looking back early judges work that may still change.
- **Incremental delivery:** every ticket's `state` must be `done`.
  Otherwise stop and name the tickets that are not.

`stats` reads git as this clone has it, which is why it fetches first. When
it reports rework as unknown because the epic branch is gone, that is fine:
the default branch still carries every ticket's commits.

## 2. Hand the reading to a fresh agent

This session may have planned or watched the epic, and carries opinions
about it that the record should be checked against, not read through. So it
reads nothing itself: spawn `flow:retro-miner` with the Agent tool,
**without a `model` parameter** (it runs on the strongest model; what it
leaves out cannot be checked afterwards). Give it only:

- the epic number and the repository's absolute path;
- the default branch (`FLOW board`, with no epic number, prints it on its
  first line);
- `FLOW` written out as the full command, and `${CLAUDE_PLUGIN_ROOT}`;
- the release pull request's number, or "none";

and never your own view of how the epic went, the conversation, or what
you think should change: told the answer, it confirms it.

It returns its answers (questions 1 to 7, with 6b on what the instruction
files hold that nothing needs), each with links to the comments and commits
that show it, and numbered proposals (`P1`, `P2`, …).

## 3. Post it and ask

Show the user the miner's report **as it is**: if you disagree with an
answer, say so beside it, never by editing it, because the evidence is the
point. Then post it on the epic, so the lessons stay with the work:

```bash
FLOW post <e> --file <report file>
```

Start the comment with `**Retro.**`. It must read plainly to someone who
has never used Flow: no internal terms, short sentences. It lists every
proposal under its group, so a proposal nobody files is still on record:

- **Project follow-ups**: small ones become a finding under this project's
  open `Bugs` epic; a feature-sized one becomes one finding marked for
  `/flow:epic`.
- **Plugin proposals**: a finding in the plugin's repository,
  `weekendgoals/ticket-flow` (the repository the GitHub Action template
  installs the plugin from; ask if the user keeps their own fork), under its
  open epic titled `Retro`.
- **Instruction-file diffs**: additions and deletions.
- **Lessons**: sections offered for the plugin's `METHODOLOGY.md`.

Keep the comment's URL, which `post` prints: every finding filed below links
it, so whoever triages one can read the evidence.

Then show **one table** in chat, one row per proposal, with your
recommendation in each:

| Id | Group | Proposal (its first line) | Goes to | Recommend |
|---|---|---|---|---|

An instruction-file change that adds lines and one that deletes lines are
separate rows, even for the same file: a yes to an addition is not a yes to
a deletion, and the person weighs them differently. A one-word answer per
row is enough; you record it. **Nothing is filed before the answers**: the
person decides what the record means, not the miner and not you.

## 4. Act only on a yes

First find where findings go, because a finding filed under no plan is
triaged by guesswork:

```bash
FLOW board --json                                     # this project's epics: the open one titled Bugs
GH_REPO=weekendgoals/ticket-flow FLOW board --json    # the plugin's epics: the open one titled Retro
```

Every filed row gets a fingerprint built from the epic and the proposal's
first line, so a second retro of this epic finds what the first one filed
instead of filing it twice. Build it in this project, so it names this
project's repository even for a plugin finding:

```bash
FLOW retro-fingerprint <e> --text "<the proposal's first line>"
```

The finding's body is the miner's draft and, as its last line,
`From the retro of <owner>/<name>#<e>: <the retro comment's URL>`.

- **A small project follow-up:**

  ```bash
  FLOW create-finding --epic <Bugs> --title "<first line>" --file <draft> --fingerprint "<fingerprint>"
  ```

  With no open epic titled `Bugs`, file nothing for the row and say that
  `/flow:epic --standing "Bugs"` makes one: a person approves that epic like
  any other.
- **A feature-sized project follow-up:** the same command without `--epic`,
  its body opening with "Too big for one ticket: the next step is a plan,
  `/flow:epic`, with this finding as its source."
- **A plugin proposal:**

  ```bash
  FLOW create-finding --repo weekendgoals/ticket-flow --epic <Retro> --title "<first line>" --file <draft> --fingerprint "<fingerprint>"
  ```

  With no open epic titled `Retro` in the plugin's repository, file nothing
  for the row and print the command that makes one, run in a clone of the
  plugin's repository: `/flow:epic --standing "Retro"`. A plugin finding
  with no plan to triage it into would wait unseen. `--screenshots` is
  refused with `--repo`, because the images go to this repository's
  `flow-findings` branch. Never change the plugin from here: this
  repository is the user's project, and a fix belongs where the plugin is
  built and reviewed.
- **Exit 3 from `create-finding`** means the fingerprint is already filed
  (or a person rejected that finding, which it names): record the number it
  prints and file nothing, because the earlier decision stands.
- **An instruction-file change:** it goes to the default branch, so it goes
  through a pull request a person merges: run `/flow:quick "<the change>"`
  with the accepted diff as its scope. Never commit it to the default
  branch directly.
- **A lesson:** show the section as it would read in `METHODOLOGY.md`: a
  heading `## <the lesson>`, then what happened (dated, with the link) and
  what it teaches. The person adds it to the plugin's repository by hand,
  or you file it as a plugin proposal with the section as its body.
  `METHODOLOGY.md` holds the lessons behind the rules and no rules of its
  own, so a lesson goes there; one that changes a rule is a plugin proposal
  instead, because a rule stated in a skill changes in that skill, in the
  same commit as every other copy of it. Never write it into this project.

Then post one comment on the epic (`FLOW post <e> --text "..."`) with
every row's outcome: filed as `#<n>` (and where), already filed as `#<n>`,
or not filed and the reason the person gave. A rejected row stays in the
retro comment, and this says why, so the next retro can see what was tried.

Then say in one line that this is a good point to run `/compact` with a
focus sentence you supply (for example "keep: the filed proposals and their
issue numbers"), or to start a fresh session.
