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
  and race to merge them. The other way round is guarded in code: while
  this run's comments on the epic show it live, `flow dispatch` refuses.
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
   alone can break each other. One at a time: each ticket merges itself,
   and its checks run again at the epic head the same way.

It posts each wave and its end on the epic issue. When the separate
working copies cannot be set up, that wave runs one ticket at a time and
the epic gets a comment saying so; the run does not stop for it.

A ticket stops only for what `/flow:ticket` stops for (checks still failing
after two rounds of fixes, a contradiction between the ticket and the code,
a merge conflict), or when its checks fail at the epic head after merging;
then it is labelled `flow:needs-human`, its assignee (or the epic's author)
is mentioned, and the run carries on with the others. A builder that dies
without a result (a session limit, a crash) is reset and built again once,
from its branch; a second death goes to a person. A builder that died after
its ticket passed acceptance is not built again: the accepted commit is
merged. Every merge takes the commit the acceptance comment names, never one
an agent reported.

If the run itself is killed, its last comment on the epic is a wave, not an
end, and `flow dispatch` keeps refusing: post a comment on the epic that
starts with `<!-- flow:local-run-end -->` (`FLOW post <e> --text ...`) once
you know it is gone.

When nothing is ready and nothing is in progress, the script runs every
done ticket's checks at the epic head, opens the release pull request
(`FLOW release-pr`: outcome, walkthrough, each ticket's merge commit, the
cost), answers its review bot and CI for up to two rounds, and posts the
pull request on the epic.

## 3. Report

When the workflow returns:

1. Post what each ticket cost, from the run's own records. The run
   directory is the one the Workflow result names
   (`…/subagents/workflows/<run id>/`); once for every ticket number in its
   `tickets`: `FLOW meter <n> --workflow <run dir>`. A figure the records lack reads
   `unknown`; never estimate one.
2. Tell the person, in a few lines: built or stopped, the release pull
   request's URL, and every ticket that needs a person with the one-line
   reason from its issue (`FLOW board <e>`). Their next step is to review and
   merge the release pull request, or to answer those tickets and run
   `/flow:run #<e>` again: a ticket they fixed and labelled `flow:planned`
   is picked up where its branch left off.
3. Say in one line that this is a good point to compact the session.
