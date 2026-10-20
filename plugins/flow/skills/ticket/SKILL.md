---
name: ticket
description: Build one Flow ticket from GitHub Issues, start to merged — start its branch, build it on the ticket's model, check it, have a separate reviewer read it, accept it, and merge it into the epic branch (or open its pull request) — posting one comment per step on the issue. Use when the user runs /flow:ticket #<n>, or when a host (a local run of an epic, or the GitHub Action) runs it unattended.
---

# Ticket $ARGUMENTS

One ticket, from ready to merged. The issue is the record: every step below
posts one short comment on it (what happened, where to look), so anyone can
follow the work on GitHub without this session.

`FLOW` below means `node "${CLAUDE_PLUGIN_ROOT}/scripts/flow.mjs"`, run from
the repository root. `<n>` is the ticket number from `$ARGUMENTS`, without the
`#`. The other arguments a host may pass are in
[When a host runs the steps](#when-a-host-runs-the-steps); a person never
needs them.

## Attended or unattended

Run `echo "${FLOW_UNATTENDED:-}"` first. `$ARGUMENTS` containing
`--unattended` means the same as `1`; then write every `FLOW` command as
`FLOW_UNATTENDED=1 node "${CLAUDE_PLUGIN_ROOT}/scripts/flow.mjs" ...`, because
the commands read the variable and this host could not set it for you.

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
posted; unattended, exit nonzero. A ticket stops only when a decision is
needed that no agent may make, and these are all of them:

1. **A gate still fails after two rounds of fixes**: the acceptance checks,
   an Important review finding, or a pull request thread or check.
2. **The plan and the work disagree**: the ticket contradicts the code, a
   CHECK itself looks wrong, or the issue body changed after the work
   started.
3. **A merge conflict** with the epic branch.

**Under `Stops: none`** (the epic's `## Settings` says it) in an unattended
run, nothing stops: the same `FLOW needs-human` **parks** the ticket, with
the same label and no mention, because the person reads every parked
ticket once, in the run's report at the end. What each stop becomes there:

1. a gate still failing after two rounds: parked, since no agent may waive
   a gate, except the pull request loop's, which does not stop at all: the
   round's comment says what remains and a person owns the pull request
   anyway;
2. the ticket contradicting the code: a **departure**, the smallest change
   of plan that keeps the walkthrough true, built and recorded with
   `FLOW depart` (the worker's rules say how), because the reviewer and
   then the person can judge a decision on record; a CHECK that cannot
   pass as written: a **dispute**, recorded with `FLOW dispute`, never an
   edit of the criteria, which stay the person's gate; an issue body
   edited after the start stays a stop under any setting, because whoever
   edited it is present and acting on it, and the refusal mentions them;
3. a merge conflict: resolved once by a fresh worker
   (`--resolve-conflict`, below), whose merge commit is reviewed, accepted
   and merged by the usual gates; a second conflict parks the ticket.

Attended, `Stops: none` changes nothing: the person is in the chat, and a
question costs nothing.

Anything else (a flaky command, a slow review bot, a network error, a dirty
working tree on the host) is retried, mentioned in a comment, or worked
around; a stop on infrastructure is a false alarm that teaches people to
ignore stops.

## 1. Start

```bash
FLOW ticket <n>        # the ticket, parsed: scope, criteria, tier, epic, and the handoffs
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

**A ticket can be resumed.** When `ticket/<n>` already exists (an earlier
run died and `FLOW reset <n>` put the ticket back to planned), `start` checks
that branch out instead of cutting a new one, says "Resumed" in its comment,
and gives `resumedAt`, the commit it carries on from. Read
`git log --oneline <baseSha>..HEAD` and the diff before building anything:
the work so far is yours to finish, not to redo.

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
4. The handoffs `FLOW ticket <n>` prints under `handoffs:` (and carries as
   `handoffs` in its JSON): the latest one of every done ticket of the
   epic, blockers first. They are what earlier tickets decided that the
   plan did not say (a name, a shape, a route, where the plan was wrong),
   so read them before the code, which they explain.
5. The code the scope names.

Never read other tickets' comments or history beyond those handoffs: what
this ticket needs from earlier work is in the code, the epic and the
handoffs.

## 3. Build

**Attended:** spawn the worker with the Agent tool, `subagent_type:
"flow:ticket-worker"`, `model:` set to the `model` that `start` printed
(`sonnet` for `tier:easy`, `opus` otherwise), and a prompt that holds only
the ticket's facts: its number, the branch, the ticket body, the handoffs,
the epic's ground rules and design sources, the instruction files to read,
and what `FLOW` stands for. Note the `agentId` the Agent tool returns: step 8
needs it. Do not build anything yourself: you read the plan and the
conversation, and code written from that context drifts from the issue.

**Unattended:** you are the worker: read
`${CLAUDE_PLUGIN_ROOT}/agents/ticket-worker.md` and follow its rules
yourself.

The worker's rules, each with its reason, are in
`${CLAUDE_PLUGIN_ROOT}/agents/ticket-worker.md`, and only there.

## 4. Check

```bash
FLOW check <n>
```

Every CHECK must pass. A failing one means the work is not done: fix and
check again. A **skipped** run does not pass (the suite exited 0 but the
named tests never ran, often for a missing database or credential): give it
what it needs. If after a real effort a CHECK still fails and you believe the
CHECK itself is wrong, stop and ask a person with the command and its
output (under `Stops: none`, unattended: dispute it, by the worker's rules);
never edit the criteria in the issue, because they are the gate.

A `COMPARE:` criterion is never run by `FLOW check` (it needs a browser).
Serve the design file and the built page, open each at every width the line
names, run the extractor that
`node "${CLAUDE_PLUGIN_ROOT}/scripts/fidelity.mjs" extract` prints in each,
and compare the two reports against the epic's design map:

```bash
FLOW design-map <epic> --out <scratch dir>/design-map.json
node "${CLAUDE_PLUGIN_ROOT}/scripts/fidelity.mjs" diff design.json page.json \
  --map <scratch dir>/design-map.json --removed-from <scratch dir>/design-map.json \
  --source <the COMPARE line's path> [--landmarks <the LANDMARKS names>]
```

The map comes from the epic issue the person approved, never from a copy
you edited: what the plan says is not built is the plan's call.
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

- the ticket number `#<n>`, and `gh issue view <n> --comments` to read the
  comments it needs (a `**Compared:**` table) and nothing else;
- the commit range `<baseSha>..HEAD` and the repository path;
- the ticket body;
- the handoffs `FLOW ticket <n>` printed, which are claims about earlier
  tickets, not this worker's reasoning: the reviewer checks them against
  those tickets' merged code;
- the ticket's own departures and disputed checks, which `FLOW ticket <n>`
  prints under `departures` and `disputes` (the comments as posted, nothing
  else): claims that the plan could not be followed and that a check cannot
  pass as written, which the reviewer checks against the code and the
  design;
- the epic's ground rules and design sources, when there is an epic;
- the paths of the project's instruction files;
- whether the ticket has a `COMPARE:` criterion.

**Never the worker's transcript, messages or reasoning**, not even a summary:
the reviewer's value is that it did not watch the work being done, and an
explanation of why the code is right is what makes a reviewer agree with it.

Post its report on the issue as it is, as a numbered review round:
`FLOW post <n> --review --important <k> --head <sha> --file <report>`, where
`<k>` is the number of Important findings the report lists and `<sha>` is
the last commit of the range it read. `post` refuses, posting nothing, when
the report's Important section reads "None" and `<k>` is not 0, or the
reverse. `FLOW accept` reads these rounds: it refuses while the latest round
has an Important finding open, refuses while HEAD is not the commit the
latest round read (so every commit is reviewed before it is accepted), and
after two rounds with an Important finding still open it is a stop, so an
unattended run cannot loop. Rounds count from the latest start, so a
ticket reset and resumed gets two more.

**Important findings are fixed.** Attended: spawn a fresh
`flow:ticket-worker` on the same model with the findings and the branch (its
file carries the rules); unattended: fix them yourself, by the same file. Each fix is its own commit, `#<n>: <what> (review fix)`; that
suffix is how fixes are counted later. Then run `FLOW check <n>` again and
spawn the reviewer once more, **over the fix commits only**
(`<head before the fixes>..HEAD`), and post that report the same way (it
becomes round 2).

After that second round, an Important finding still open stops the ticket:
ask a person, quoting the finding. Two rounds is the limit because a third
rarely finds what two missed, and a person is cheaper than a loop.

Nits are listed in the report, not fixed, unless the fix is trivial and
inside the scope; such a fix is a commit after the review, so it needs a
review round over it before `accept` takes it. Usually, leave the nit.

## 7. Accept

```bash
FLOW accept <n>
```

It runs on `ticket/<n>`'s committed head and refuses when anything could
make the result describe something other than that commit, or skip a step:
uncommitted changes, untracked files (the checks would see them; commit,
remove or ignore them), no review round posted or one with an Important
finding open, a `COMPARE:` criterion with no `**Compared:**` comment, or an
issue body edited after the start comment (it posts that refusal, naming
who edited). Otherwise it runs the criteria from the issue and posts the
results with the commit they judged. Only that commit can be delivered. Under
`Stops: none`, unattended, it passes a ticket whose every failing check has
a dispute from this account posted after the latest start, and says
`passed, with N disputed check(s)`, listing each; a failing check with no
dispute still fails.

`start`, `accept`, `deliver`, `merge`, `reset` and `release-pr` read their
own earlier comments only from the account running them, so a comment anyone
else posts (or quotes) cannot move the line the edit check draws or name a
commit to merge. Run them all under one GitHub account: a ticket accepted
under another account is not merged (`merge --epic` lists it with that
reason), and `reset` on it proceeds, because this account sees no passing
acceptance to protect. On a host where GitHub will not say which account
`gh` is (a GitHub App token), set `FLOW_ACCOUNT` to it.

- **It fails on a check:** fix (a `(review fix)` commit), have the reviewer
  read the fix (`<head before the fix>..HEAD`, posted as the next round),
  and run `FLOW accept` again. Two failed rounds of fixes after the review stop the ticket: ask a
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

Unattended: skip this step. The host meters the run after the session ends,
because a session cannot read the end of its own run: the GitHub Action runs
`FLOW meter <n> --transcripts <its output file>`, and a local run of an epic
runs `FLOW meter <n> --workflow <its run directory>`.

## 9. Hand off, then deliver

First write the **handoff**: three to five lines for the tickets after this
one, which read it through `FLOW ticket` before their code:

- what changed that the plan did not say;
- decisions that bind later tickets: a name, a shape, a route;
- where the plan was wrong, and what was done instead: each departure in
  one line, since later tickets build on it.

Nothing a reader gets from the diff, and never why the code is right: a
handoff states decisions, and later reviewers read it too. When the plan
said it all, say so in one line, so a later reader knows nothing is missing.

```bash
FLOW handoff <n> --file <handoff file>
FLOW deliver <n>
```

`handoff` refuses a ticket that is not in review or done (there is nothing
to hand off before the work exists) and a text over 1,200 characters,
because the detail is in the commits. While the ticket is in review,
running it again replaces the handoff in what later tickets see (they read
only the latest); once the ticket is done its handoff is never replaced,
and a done ticket with none (a host that merged it after `--no-merge`) may
get its first one only.

- **Release delivery** (the epic's default): it merges the accepted commit,
  never the branch tip, into the epic branch with `--no-ff` and the subject
  `Merge #<n>: <title>`, pushes it, labels the ticket `flow:done` and closes
  it, so the board's progress bar counts it, ticks it off the epic's list
  and posts the merge commit. When someone else pushed to
  the epic branch meanwhile it fetches and merges again, twice; after that,
  or on a merge conflict, it asks a person itself (naming the conflicting
  files). Under `Stops: ask` a conflict is never resolved by an agent: the
  person decides which side's intent wins. Under `Stops: none`,
  unattended, a first conflict leaves the ticket in review with a comment
  naming the files and prints `"kind": "conflict"` (exit 1): end your reply
  with the line `CONFLICT` and stop, because the host has a fresh worker
  resolve it, which never saw this build.
- **Incremental delivery, or no epic:** it pushes the accepted commit to
  `ticket/<n>` and opens a pull request into the default branch that closes
  the ticket when merged. Then run the pull request loop below, and finish
  with `FLOW label <n> +flow:done -flow:in-review` and a comment with the
  pull request's URL.

No agent ever merges into the default branch: a person merges every pull
request there. After a person merges into the default branch, no code work
runs: what runs is the GitHub Action's `board` job, which closes
`flow:done` tickets left open and writes the project board (Status,
Release, figures), and the report page's rebuild, which only reads.

## The pull request loop

For a ticket's pull request (and, later, an epic's release pull request).
`<pr>` is its number.

1. `FLOW pr-review-request <pr>` asks Copilot to review and prints `copilot`;
   it prints `coderabbit` when the project has a `.coderabbit.yaml` (that bot
   reviews by itself) and `none` when no bot is available, including when
   GitHub accepts the request and adds nobody, which is how a repository
   without Copilot code review answers.
2. `FLOW pr-wait <pr> --bot <what it printed>` waits for that bot's review
   of the current head (default up to 30 minutes). A timeout is not a
   failure: say so in the round's comment and go on.
3. `FLOW pr-threads <pr>` lists the unresolved review threads. For each one,
   either fix it (a `(review fix)` commit) or decide it is wrong; then
   `FLOW pr-resolve <thread-id> --text "<what you changed, or why not>"`.
   Never resolve a thread without saying why.
4. Push, then `FLOW pr-checks <pr> --wait`. A failing check is fixed and
   pushed. It exits 0 when everything passed, 1 when something failed, 3
   when checks were still running at the timeout, and 4 when no check ever
   appeared (it waits 90 seconds for them first). On 4 the project has no CI
   for this pull request: say so in the round's comment and go on.
5. After a round that pushed fixes, ask for a review again
   (`FLOW pr-review-request <pr>`) and repeat from step 2.

Post one comment per round on the ticket, starting `**Pull request round
<k>:**`: threads fixed, threads answered, checks. After two rounds, a thread
or failing check that remains stops the ticket: ask a person, naming it.
Under `Stops: none`, unattended, it stops nothing: the second round's
comment says on its first line what remains, the run's report lists it
under the pull request, and the loop ends there, because a person owns the
pull request anyway.

## 10. End

Attended: tell the person the ticket is done, with the merge commit or the
pull request URL, and say in one line that this is a good point to run
`/compact` with a focus sentence you supply (for example "keep: #<n> is
merged as <sha>; next ready ticket is #<m>"), or to start a fresh session:
the build's detail is on the issue now, and carrying it costs every later
turn. Unattended: exit 0 (nonzero only after a stop).

## When a host runs the steps

A host that builds a whole epic may pass these after `#<n>`. Each one only
changes where the skill stops or starts; every step still posts its comment.

- `--unattended`: as if `FLOW_UNATTENDED=1` (see the top).
- `--until-review`: do steps 1 to 5, label the ticket `flow:in-review`, and
  stop. End your reply with the line `REVIEW <baseSha>..<head>` (full
  commits). The host hires the reviewer itself, because an agent it started
  cannot start another, and because the party under review never picks its
  judge.
- `--after-review <round>`: the ticket is in review and the host has put the
  reviewer's report for that round (1 or 2) into this prompt. Check out
  `ticket/<n>`, post the report as it is
  (`FLOW post <n> --review --important <k> --head <sha> --file <report>`,
  `<sha>` being the end of the range the host says the reviewer read),
  then go on from step 6's "Important findings are fixed". When you fixed
  something in round 1, end with `REVIEW <head before the fixes>..<head>`:
  the host has the fixes reviewed once more and calls you with
  `--after-review 2`. When round 2 still has an Important finding open,
  stop and ask a person, quoting it. Otherwise go on to step 7.
- `--no-merge`: under release delivery, stop after step 9's handoff instead
  of delivering, and end your reply with `ACCEPTED <sha>` (the commit
  `FLOW accept` judged). The host merges the tickets of a wave one at a time
  (`FLOW merge`), because two tickets merging into one branch at once race.
  Incremental delivery ignores it: each ticket's pull request is its own.
- `--pr-loop <pr> [--wait]`: run one round of
  [the pull request loop](#the-pull-request-loop) on that pull request, then
  end. The GitHub Action calls it when a review arrives or a check fails, so
  the round starts at step 3: answer the threads, fix what
  `FLOW pr-checks <pr>` (without `--wait`) reports failing, push, and when
  you pushed anything ask for a review again (step 5). Do not wait: the next
  review or check result starts the next round. With `--wait` (a host that
  gets no such events), ask for a review first when nobody has (step 1),
  then wait for it and for the checks (steps 2 and 4) before answering. Check
  out the pull request's head branch first. Post the round's comment on the
  ticket (head `ticket/<n>`) or, for a release pull request (head
  `epic/<name>`), on the epic its body names (`Epic: #<e>`). Count the
  earlier comments that start `**Pull request round`: after two rounds,
  stop and ask a person instead of running a third (under `Stops: none`,
  end without asking, the remains named in the round's comment).
- `--resolve-conflict`: under `Stops: none`, the ticket is in review and
  its latest merge comment from this account is a conflict (`FLOW ticket
  <n>` says `"resolveConflict": true` once a host asked). Do not run
  `FLOW start`: the branch exists. Run `FLOW label <n> -flow:start` (a host
  may have used it to ask), check out `ticket/<n>`, note its head, merge
  `origin/<epic branch>` into it, and resolve every conflict keeping both
  sides' intent: the epic branch's merged tickets are facts, and this
  ticket adapts to them. Commit `#<n>: merge <epic branch>, conflict
  resolved` and run `FLOW check <n>`. Then one of two endings:
  - with `--until-review` (a host that hires the reviewer itself, as
    `/flow:run` does, because an agent it started cannot start another):
    end with `REVIEW <head before>..<head>`; the host has that commit
    reviewed once and calls you with `--after-review 2 --no-merge`;
  - without it (the GitHub Action, which makes no second call): run step 6
    yourself, one review round over `<head before>..<head>` only, posted
    the same way; an Important finding parks the ticket, since this is its
    last round; otherwise run step 7 and end with `ACCEPTED <sha>`, as
    `--no-merge` does.

  Either way `FLOW accept` takes only the reviewed head and the host merges
  the accepted commit, so the one agent merge is still a ticket into its
  epic branch by the accepted commit.

A host that stops the skill early reads the result from GitHub, not from
your reply: `REVIEW`, `ACCEPTED` and `CONFLICT` tell it which step comes next, and it
checks the labels and comments before acting on them.
