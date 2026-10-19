---
name: run
description: Build an approved Flow epic from GitHub Issues with nobody watching — every ready ticket through /flow:ticket on its own model, reviewed by a separate agent, merged into the epic branch one at a time, ending at the release pull request a person merges. Use when the user runs /flow:run #<epic>.
---

# Run epic $ARGUMENTS

You start the run and report how it ended. **You build nothing yourself**,
and you do not hold the loop: it is a workflow script this plugin ships,
`workflows/run-epic.mjs`, because a session following a written loop can
talk itself past a stop and a script cannot.

`FLOW` below means `node "${CLAUDE_PLUGIN_ROOT}/scripts/flow.mjs"`, run from
the repository root. `<e>` is the epic number from `$ARGUMENTS`, without the
`#`.

**Nothing here merges into the default branch.** The run's merges go into
the epic branch only; it ends by opening the release pull request, and a
person merges that.

## 1. Check before starting

Run each, and stop with what it printed when one fails:

```bash
FLOW doctor            # gh signed in, labels there, every epic readable
FLOW next <e>          # must exit 0: approved, has tickets, not stuck
git status --porcelain --untracked-files=no   # must print nothing
```

- `next` exiting 1 means the epic is not approved, has no tickets, or is
  stuck (unfinished tickets, none ready, none in progress). Say which; the
  person decides. Approving is their call, never yours.
- A dirty working tree would ride into the first ticket built here: ask the
  person to commit or stash it.
- **The epic is being built on GitHub**: a ticket in `next`'s `tickets` has
  `"startRequested": true` (the `flow:start` label), or the project runs
  Flow's GitHub Action (`grep -l 'flow:start' .github/workflows/*` finds a
  file). Stop and say so, because two hosts would build the same tickets
  and race to merge them. The other way round holds only through the run's
  comments on the epic: while the latest one that starts with
  `<!-- flow:local-run -->` or `<!-- flow:local-run-end -->` is not an end,
  whoever posted it, `flow dispatch` refuses. It is a sign, not a lock:
  anyone can post one.
- **A ticket already in progress or in review** (`inProgress` in the JSON)
  is either someone's live work or a run that died. Ask the person which.
  Dead: run `FLOW reset <n>` (it goes back to planned and its branch keeps
  its commits; the run resumes it). Live: do not start the run, because the
  run would build beside it and both would merge.
- **`Parallel:` 2 or 3** builds tickets side by side, each in its own
  working copy beside the repository (`../.flow-worktrees/`). A fresh copy
  has only what git tracks, so a project says what one needs in `.flow.json`
  on the epic branch: `"copy"` (ignored files to copy in, such as `.env`;
  a file git does not ignore is refused, because a copied secret is one
  `git add -A` from a commit) and `"setup"` (commands, such as `npm ci`).
  Check it reads:
  `git show origin/<branch>:.flow.json | node "${CLAUDE_PLUGIN_ROOT}/scripts/worktree-setup.mjs" --validate - --repo "$(git rev-parse --show-toplevel)"`
  (skip when the branch has no `.flow.json`). If it fails, say so; the run
  would build that epic one ticket at a time instead, which is slower but
  not wrong.

## 2. Start the workflow

```
Workflow({
  scriptPath: "${CLAUDE_PLUGIN_ROOT}/workflows/run-epic.mjs",
  args: { epic: <e>, repoRoot: "<the repository's absolute path>", pluginRoot: "${CLAUDE_PLUGIN_ROOT}" }
})
```

Tell the person it is running and that `/workflows` shows it live. Each
round the script:

1. reads what is ready from GitHub (`FLOW next`), never from what it
   remembers of the last round;
2. takes up to `Parallel:` ready tickets, in the order the epic lists them;
3. builds each with `/flow:ticket` on the ticket's model (`tier:easy` on
   Sonnet, otherwise Opus), unattended, so a question becomes
   `flow:needs-human` on the ticket instead of a wait;
4. has each one reviewed by the `ticket-reviewer` agent, which it starts
   itself and which never sees the builder's reasoning, then has the
   builder fix what the reviewer found (two review rounds at most);
5. side by side: merges the accepted commits into the epic branch one at a
   time, in document order, then runs those tickets' checks again at the
   new epic head (`FLOW check-epic --mark`), because two tickets that pass
   alone can break each other. A check that fails there runs a second time
   at the same head first, and one that passes then is reported as passed
   on the second run, so a flaky check is visible rather than a stop. One at a time: each ticket merges itself,
   and its checks run again at the epic head the same way.

It posts each wave and its end on the epic issue. When the separate
working copies cannot be set up, that wave runs one ticket at a time and
the epic gets a comment saying why for each copy (the step that failed and
how long it ran against the setup's budget, or that no readable answer came
back); the run does not stop for it.

The script has no shell: a small agent runs each command and returns its
exit code and output, and the script parses that output itself, because an
agent's summary of a command is not what GitHub said. Before it halts over
the board (the epic not approved, or not every ticket done at the end), it
reads the board once more and halts only when both readings agree; a stop
over a command that answered nothing readable quotes its exit code and last
line. `worktree` and `check-epic` are never asked for again over an
unreadable answer, because a second copy would run beside the first.

A ticket stops only for what `/flow:ticket` stops for (a gate still failing
after two rounds of fixes: the acceptance checks, an Important review
finding, a pull request thread or check; the plan and the work disagreeing;
a merge conflict), or when its checks fail at the epic head after merging;
then it is labelled `flow:needs-human`, its assignee (or the epic's author)
is mentioned, and the run carries on with the others. Under `Stops: none`
the ticket is parked instead (same label, no mention; the closing
`FLOW run-report` lists it and mentions the epic's people once), and what
each stop becomes there is the list at the top of the ticket skill, the one
copy of it. A builder that dies
without a result (a session limit, a crash) is reset and built again once,
from its branch; a second death goes to a person. A builder that died after
its ticket passed acceptance is not built again: the accepted commit is
merged. Every merge takes the commit the acceptance comment names, never one
an agent reported.

If the run itself is killed, its last comment on the epic is a wave, not an
end, and `flow dispatch` keeps refusing: post a comment on the epic that
starts with `<!-- flow:local-run-end -->` (`FLOW post <e> --text ...`, or
by hand on GitHub, from any account) once you know it is gone.

When nothing is ready and nothing is in progress, the script runs every
done ticket's checks at the epic head, opens the release pull request
(`FLOW release-pr`: outcome, walkthrough, each ticket's merge commit, the
cost; it refuses unless that check passed at the head the pull request
carries, so run `FLOW check-epic <e>` first when you open it by hand),
answers its review bot and CI for up to two rounds, and posts the
pull request on the epic. Under `Stops: none` it does the same when the run ends
with tickets parked, and opens the pull request as a draft
(`FLOW release-pr <e> --draft`): over the done tickets, with a `## Not built`
section and no line closing the epic. When a check at the epic head parks a
ticket there, the done ones are checked once more first. A later run that
builds the parked tickets marks the draft ready for review.

## 3. Report

When the workflow returns:

1. Post what each ticket cost, from the run's own records. The run
   directory is the one the Workflow result names
   (`…/subagents/workflows/<run id>/`); once for every ticket number in its
   `tickets`: `FLOW meter <n> --workflow <run dir>`. It reads every run of
   that workflows directory that built the ticket (a ticket that halted and
   resumed spans two) and skips a run a cost comment already covers, so
   running it again posts nothing twice. A figure the records lack reads
   `unknown`; never estimate one.
2. Tell the person, in a few lines: built or stopped, the release pull
   request's URL (and whether it is a draft), and every ticket that needs a
   person (or was parked) with
   the one-line reason from its issue (`FLOW run-report <e>` prints them). Their next step is to review and
   merge the release pull request, or to answer those tickets and run
   `/flow:run #<e>` again: a ticket they fixed and labelled `flow:planned`
   is picked up where its branch left off.
3. Say in one line that this is a good point to run `/compact` with a focus
   sentence you supply (for example "keep: epic #<e> built, release pull
   request <url>, #<n> waits for a person"), or to start a fresh session.
