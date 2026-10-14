---
name: ticket
description: Build one Flow ticket from GitHub Issues, start to merged — start its branch, build it on the ticket's model, check it, have a separate reviewer read it, accept it, and merge it into the epic branch (or open its pull request) — posting one comment per step on the issue. Use when the user runs /flow:ticket #<n>, or when a host runs it unattended with FLOW_UNATTENDED=1.
---

# Ticket $ARGUMENTS

One ticket, from ready to merged. The issue is the record: every step below
posts one short comment on it (what happened, where to look), so anyone can
follow the work on GitHub without this session.

`FLOW` below means `node "${CLAUDE_PLUGIN_ROOT}/scripts/flow.mjs"`, run from
the repository root. `<n>` is the ticket number from `$ARGUMENTS`, without the
`#`.

## Attended or unattended

Run `echo "${FLOW_UNATTENDED:-}"` first.

- **Attended** (empty): a person started this session. You **supervise**: a
  worker you spawn builds the ticket, a reviewer you spawn judges it, and you
  run the `FLOW` commands. You may ask the person a question in chat.
- **Unattended** (`1`): a host ran `claude -p "/flow:ticket #<n>"`. Nobody is
  reading chat, so **nothing may wait for an answer**: every question becomes
  `FLOW needs-human <n> --text "<the question, with what you know>"`, and then
  you stop. You are the worker yourself: the host already picked your model.

`FLOW start` reads the same variable and says which it is in the ticket's
first comment.

**Stopping is one command.** When this skill says "stop and ask a person",
run `FLOW needs-human <n> --text "<why>"`: it labels the ticket
`flow:needs-human`, mentions whoever is assigned (or the epic's author), and
is the only way a ticket stops. Then end: attended, tell the person what you
posted; unattended, exit nonzero. There are three reasons to stop and no
others: the acceptance checks are still failing after two rounds of fixes; the
ticket and the code contradict each other; a merge conflict you cannot
resolve. Anything else (a flaky command, a slow review bot, a network error)
is retried, mentioned in a comment, or worked around.

## 1. Start

```bash
FLOW ticket <n>        # the ticket, parsed: scope, criteria, tier, epic
FLOW start <n>
```

`start` refuses unless the ticket is ready: its epic is approved (a ticket
with no epic counts as approved), every ticket it is blocked by is done, its
criteria can decide it, and the working tree has no uncommitted changes to
tracked files. Attended, it prints why and changes nothing; tell the person
and stop. Unattended, it has already asked a person on the issue; exit
nonzero.

On success it has cut `ticket/<n>` from the epic branch on origin (release
delivery) or from the default branch (incremental delivery, or a ticket with
no epic), labelled the ticket `flow:in-progress`, and posted the start
comment. Its JSON gives `branch`, `base`, `baseSha`, `delivery` and `model`.
**Keep `baseSha`**: the review range starts there.

The start comment's time is the line the acceptance step draws: if anyone
edits the issue body after it, acceptance refuses, because the criteria in
the body are the gate and the work was built against the old ones.

## 2. Read

Read, in this order, and nothing else unless something sends you there:

1. The project's instruction files (`CLAUDE.md`, `AGENTS.md`) at the root
   and in every directory the scope names.
2. The epic, when there is one: `gh issue view <epic> --json body` — its
   outcome, ground rules, settings and design sources.
3. The ticket body (from `FLOW ticket <n>`).
4. The code the scope names.

Never read other tickets' comments or history: what this ticket needs from
earlier work is in the code and in the epic.

## 3. Build

**Attended:** spawn a worker with the Agent tool, `model:` set to the
`model` that `start` printed (`sonnet` for `tier:easy`, `opus` otherwise),
and a prompt that holds the ticket number, the branch, the ticket body, the
epic's ground rules and design sources, the instruction files to read, and
the rules below. Note the `agentId` the Agent tool returns: step 8 needs it.
Do not build anything yourself: you read the plan and the conversation, and
code written from that context drifts from the issue.

**Unattended:** you are the worker; follow the rules below yourself.

The worker's rules, each with its reason:

- **Stay inside the scope.** "Not in scope" usually names another ticket's
  work.
- **No code comments.** Names carry the meaning; a comment is a second copy
  of the code that nobody tests and that goes stale.
- **Follow the project's instruction files**, and update them in the same
  commit as any change they describe.
- **UI work gets component tests** (react-testing-library) for logic,
  rendering, state and edge cases inside a component. **An end-to-end browser
  test only for a user journey the epic names** (routing, APIs, sign-in and
  several screens together), using the Page Object Model; never one per
  feature, because they are slow and break on unrelated changes.
- **No translations** unless this is the epic's Translations ticket: strings
  settle only when everything else is built.
- **Commit in small steps**, each subject starting `#<n>: ` (`#12: add the
  export endpoint`); that prefix is how the history ties a commit to its
  ticket. A fix for a bug an already-merged ticket shipped ends `(fixes
  #<m>)`. Stage only your own files, never `git add -A`.
- **A necessary step outside the scope** is not a reason to stop: do it, say
  what and why in the commit body, and post one comment
  (`FLOW post <n> --text "..."`). The reviewer judges it.
- **A real contradiction stops the ticket**: the ticket asks for something
  the code makes impossible or wrong, or two of the documents disagree.
  Stop and ask a person with both facts side by side ("the ticket says X;
  `src/a.ts:40` does Y"). Never resolve it silently either way.

## 4. Check

```bash
FLOW check <n>
```

Every CHECK must pass. A failing one means the work is not done: fix and
check again. A **skipped** run does not pass (the suite exited 0 but the
named tests never ran, often for a missing database or credential): give it
what it needs. If after a real effort a CHECK still fails and you believe the
CHECK itself is wrong, stop and ask a person with the command and its
output; never edit the criteria in the issue, because they are the gate.

A `COMPARE:` criterion is never run by `FLOW check` (it needs a browser).
Serve the design file and the built page, open each at every width the line
names, run the extractor that
`node "${CLAUDE_PLUGIN_ROOT}/scripts/fidelity.mjs" extract` prints in each,
and compare the two reports with
`node "${CLAUDE_PLUGIN_ROOT}/scripts/fidelity.mjs" diff design.json page.json --map <design map>`.
Post the table it prints as a comment that starts `**Compared:**`, and fix
or explain every row. With no browser here, post `**Compared:** not run —
<why>` instead: a comparison nobody ran must read as not run.

## 5. Screenshots

```bash
FLOW screenshots <n>
```

When `.flow.json` at the repository root has a `screenshots` command, this
runs it (with `FLOW_TICKET` and `FLOW_SCREENSHOTS_DIR` set), commits the
PNGs on the ticket branch, pushes the branch and posts them on the issue.
The command writes into the directory it prints last, or into
`screenshotsDir` from `.flow.json` (`{n}` becomes the ticket number; the
default is `.flow/screenshots/{n}`).
When it prints that there is no command and the ticket changed something a
person sees, post one line saying the project has no screenshots command, so
the gap is visible rather than silent.

## 6. Review

```bash
FLOW label <n> +flow:in-review -flow:in-progress
```

Spawn `flow:ticket-reviewer` with the Agent tool, **without a `model`
parameter** (the agent runs on the strongest model; what a reviewer misses
cannot be checked afterwards). Note its `agentId`. Give it:

- the commit range `<baseSha>..HEAD` and the repository path;
- the ticket body;
- the epic's ground rules and design sources, when there is an epic;
- the paths of the project's instruction files;
- whether the ticket has a `COMPARE:` criterion.

**Never the worker's transcript, messages or reasoning**, not even a summary:
the reviewer's value is that it did not watch the work being done, and an
explanation of why the code is right is what makes a reviewer agree with it.

Post its report on the issue as it is (`FLOW post <n> --file <report>`).

**Important findings are fixed.** Attended: spawn a fresh worker on the same
model with the findings, the branch and the worker rules; unattended: fix
them yourself. Each fix is its own commit, `#<n>: <what> (review fix)`; that
suffix is how fixes are counted later. Then run `FLOW check <n>` again and
spawn the reviewer once more, **over the fix commits only**
(`<head before the fixes>..HEAD`), and post that report too.

After that second round, an Important finding still open stops the ticket:
ask a person, quoting the finding. Two rounds is the limit because a third
rarely finds what two missed, and a person is cheaper than a loop.

Nits are listed in the report, not fixed, unless the fix is trivial and
inside the scope.

## 7. Accept

```bash
FLOW accept <n>
```

It runs on `ticket/<n>`'s committed head with no uncommitted changes to
tracked files, refuses (and posts why, naming who edited) if the issue body
was edited after the start comment, runs the criteria from the issue, and
posts the results with the commit they judged. Only that commit can be
delivered.

- **It fails on a check:** fix (a `(review fix)` commit), run `FLOW accept`
  again. Two failed rounds of fixes after the review stop the ticket: ask a
  person with the failing check and its output.
- **It refuses an edited body:** stop and ask a person to confirm the new
  criteria. Do not work around it: whoever edited the gate may not be the
  person who approved the plan.

## 8. Cost

Attended: find each subagent's transcript from its `agentId`:

```bash
ls ~/.claude/projects/*/*/subagents/agent-<agentId>.jsonl
FLOW meter <n> --transcripts worker=<path> reviewer=<path> [reviewer=<path>] [fixes=<path> ...]
```

It posts input, output, cache and largest-context figures per step and per
model, compactions, and time from first to last message. A figure a
transcript does not record is shown as `unknown`, never estimated.

Unattended: skip this step. The host captured the whole run's output and
runs `FLOW meter <n> --transcripts <stream file>` after the session ends,
because a session cannot read the end of its own run.

## 9. Deliver

```bash
FLOW deliver <n>
```

- **Release delivery** (the epic's default): it merges the accepted commit,
  never the branch tip, into the epic branch with `--no-ff` and the subject
  `Merge #<n>: <title>`, pushes it, labels the ticket `flow:done`, ticks it
  off the epic's list and posts the merge commit. When someone else pushed to
  the epic branch meanwhile it fetches and merges again, twice; after that,
  or on a merge conflict, it asks a person itself (naming the conflicting
  files). A conflict is never resolved by an agent here: the person decides
  which side's intent wins.
- **Incremental delivery, or no epic:** it pushes the accepted commit to
  `ticket/<n>` and opens a pull request into the default branch that closes
  the ticket when merged. Then run the pull request loop below, and finish
  with `FLOW label <n> +flow:done -flow:in-review` and a comment with the
  pull request's URL.

No agent ever merges into the default branch: a person merges every pull
request there, and nothing runs after that merge.

## The pull request loop

For a ticket's pull request (and, later, an epic's release pull request).
`<pr>` is its number.

1. `FLOW pr-review-request <pr>` asks Copilot to review and prints `copilot`;
   it prints `coderabbit` when the project has a `.coderabbit.yaml` (that bot
   reviews by itself) and `none` when no bot is available.
2. `FLOW pr-wait <pr> --bot <what it printed>` waits for that bot's review
   of the current head (default up to 30 minutes). A timeout is not a
   failure: say so in the round's comment and go on.
3. `FLOW pr-threads <pr>` lists the unresolved review threads. For each one,
   either fix it (a `(review fix)` commit) or decide it is wrong; then
   `FLOW pr-resolve <thread-id> --text "<what you changed, or why not>"`.
   Never resolve a thread without saying why.
4. Push, then `FLOW pr-checks <pr> --wait`. A failing check is fixed and
   pushed. It exits 0 when everything passed, 1 when something failed, and 3
   when checks were still running at the timeout.
5. After a round that pushed fixes, ask for a review again
   (`FLOW pr-review-request <pr>`) and repeat from step 2.

Post one comment per round on the ticket: threads fixed, threads answered,
checks. After two rounds, a thread or failing check that remains stops the
ticket: ask a person, naming it.

## 10. End

Attended: tell the person the ticket is done, with the merge commit or the
pull request URL, and say in one line that this is a good point to compact
the session or start a fresh one. Unattended: exit 0 (nonzero only after a
stop).
