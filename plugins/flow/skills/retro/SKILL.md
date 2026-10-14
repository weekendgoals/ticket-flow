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
- the default branch (`FLOW board` prints it first);
- `FLOW` written out as the full command, and `${CLAUDE_PLUGIN_ROOT}`;
- the release pull request's number, or "none";

and never your own view of how the epic went, the conversation, or what
you think should change: told the answer, it confirms it.

It returns seven answers, each with links to the comments and commits that
show it, and numbered proposals (`P1`, `P2`, …).

## 3. Post it and ask

Show the user the miner's report **as it is**: if you disagree with an
answer, say so beside it, never by editing it, because the evidence is the
point. Then post it on the epic, so the lessons stay with the work:

```bash
FLOW post <e> --file <report file>
```

Start the comment with `**Retro.**`. It must read plainly to someone who
has never used Flow: no internal terms, short sentences.

Then ask, in chat, one line per proposal with your recommendation, which to
act on. A one-word answer per line is enough; you record it.

## 4. Act only on a yes

- **A plugin change:** file it as a ticket in the plugin's repository,
  `weekendgoals/ticket-flow` (the repository the GitHub Action template
  installs the plugin from; ask if the user keeps their own fork):

  ```bash
  FLOW check --file <draft>      # its CHECK must fail today
  FLOW create-ticket --no-epic --repo weekendgoals/ticket-flow --file <draft> --title "<title>"
  ```

  Never change the plugin from here: this repository is the user's project,
  and a fix belongs where the plugin is built and reviewed.
- **An instruction-file change:** it goes to the default branch, so it goes
  through a pull request a person merges: run `/flow:quick "<the change>"`
  with the accepted diff as its scope. Never commit it to the default
  branch directly.
- **A rejected proposal:** nothing. Add one line to the retro comment's
  thread saying which proposals were filed and which were not
  (`FLOW post <e> --text "..."`), so the next retro can see what was tried.

Then say in one line that this is a good point to run `/compact` with a
focus sentence you supply (for example "keep: the filed proposals and their
issue numbers"), or to start a fresh session.
