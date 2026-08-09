---
name: run
description: Run an autonomous epic end to end with no human present — verify sign-off, loop its tickets in document order through fresh-context agents, halt on any stop condition, and end by opening the release pull request. Never merges toward the default branch. Use when the user runs /flow:run <epic>.
---

# Run epic $ARGUMENTS unattended

You are the **driver**. You orchestrate, verify and log; **you never implement,
review, or edit a ticket's files yourself** — each ticket runs in a
fresh-context subagent that starts empty and works from documents alone. That
split is not hygiene: it makes every unattended run a live test that the
documents are sufficient, which is the property the whole methodology bets on.
If a ticket cannot be done from the documents, that is a finding, not a reason
for you to fill the gap from your own context.

The human approved this run at sign-off. Their next decision point is the
release pull request this skill ends by opening. **Nothing here ever merges,
pushes, or retargets toward the default branch** — the run's entire merge
surface is `epic/<name>`.

## 1. Resolve the epic and refuse the wrong ones

```bash
node "${CLAUDE_PLUGIN_ROOT}/scripts/tickets.mjs" list <epic> --json
```

Read `defaultBranch`, and the epic's entry in `modes`. **Stop and report
unless `runMode` is `"autonomous"` and `releaseMode` is `"integration"`** —
both, checked here. An attended epic is run one ticket at a time by
`/flow:ticket`, and driving it unattended would exceed what its sign-off
approved. And the script's serial+autonomous refusal lives in `find` and
`doctor`, **not** in the `list` command this step runs — without your own
`releaseMode` check, a contradictory epic would pass this door and mutate
`origin/epic/<name>` (step 4a merges and pushes) before a worker's `find`
finally refused it.

Stop and report too if:

- the epic does not resolve — list the epics the script knows;
- the working tree has uncommitted changes you did not make;
- any of this epic's tickets is in state `in-progress`, `in-review`, or
  `done` (those are the JSON values; the board renders the last as "done,
  unpushed") — a previous run died mid-ticket, and skipping past or redoing
  half-finished work destroys the evidence trail;
- any ticket is `blocked` — a previous run halted on it, and `next` only
  hands out `todo` tickets, so starting now would silently build every
  successor on the blocked one and open a release pull request missing its
  work. The human resolves or re-plans the blocked ticket first; resuming
  past it is not yours to decide.

A ticket that is already `integrated` or `shipped` is fine: re-running the
driver resumes after it.

## 2. Verify sign-off actually happened

Sign-off leaves mechanical traces; check them rather than trusting the
invocation:

```bash
git fetch origin --prune
git ls-tree origin/epic/<name> "epics/<name>/tickets.md"
git ls-tree origin/epic/<name> "epics/<name>/status.md"
```

Both must return output. The epic skill commits the documents to
`epic/<name>` and pushes it only as part of its post-sign-off step, and
`status.md` is created only after the human approves — so their presence on
the remote is the evidence the gate was passed. Either missing: **stop** and
say `/flow:epic <name>` has not completed its sign-off; do not create the
branch or the documents yourself.

## 3. Check the environment the run depends on

An unattended run cannot ask for anything, so everything it needs must exist
before ticket one. Report what is missing and stop; do not start a run that
will die at its first prompt.

- **The pre-authorized permission surface.** The session's permissions must
  already allow, without prompting: `git` (fetch, checkout, branch, merge,
  commit, push — to `epic/<name>` and ticket branches only), `gh` (`pr
  create`, `pr view`, `pr list`, `pr merge` — the merge only ever aimed at
  `epic/<name>`), `node` (this plugin's script, and the project's own test
  and build commands as named in its instruction files), file edits inside
  the repository, and spawning agents. **A permission prompt firing mid-run
  is a stop condition** (an unattended run that needs to ask was not
  pre-authorized, and waiting blocked is worse than stopping — sign-off
  decision, 2026-08-08): the prompt will not be answered, and a run wedged on
  a prompt looks exactly like a run making progress.
- **Branch protection on the default branch** — require pull requests, no
  force pushes, human-only merge. Verify it is present: `gh api
  "repos/{owner}/{repo}/branches/<default-branch>/protection"` succeeding
  signals classic branch protection; on a 404 **or a 403**, check `gh api
  "repos/{owner}/{repo}/rules/branches/<default-branch>"` — rulesets are the
  newer mechanism, invisible to the first endpoint. An empty rule list from
  both means unprotected. A **403 from both endpoints** means **protection
  is unavailable on this plan** — a private repository under an organization
  on GitHub's free plan returns exactly this (the first live run hit it,
  2026-08-08) — the same fact as unprotected, stated by the platform instead
  of by an unset setting. **Only a 404 or 403 from these two probes is a
  tolerated nonzero exit** (step 5 names the carve-out): those two statuses
  are the answer this check exists to read. Any other probe failure — an
  unauthenticated or expired `gh`, no network, rate limiting, a 5xx, a
  mistyped repository — answers nothing about protection and keeps step 5's
  rule: stop and report it, because the same broken `gh` would kill the run
  later at its first `pr create`. This is environment setup, not plugin
  code: every rule in this skill is soft enforcement obeyed by a cooperating
  agent, and protection is the hard floor that holds even against a
  misbehaving one. Missing or unavailable protection is reported before
  starting, and only a human can waive it — proceeding means the run's
  "main is untouchable" guarantee rests on skill text alone. An unattended
  run cannot ask, so the waiver must already exist, and a waiver is a
  **recorded decision, never a recorded finding**: prose in **the epic's
  `tickets.md`** — the document sign-off gates and step 2 verifies on the
  remote, written on the `Run mode:` line or under the ground rules, where
  the epic skill has the planner record it — saying a human **chose to
  accept** running without the hard floor, in the shape of the first live
  run's record: "waived 2026-08-08: … the user chose to run without the
  hard floor". A line that only records what the probes returned ("403 on
  both endpoints, protection unavailable") is the probe's finding, not a
  waiver — detection is the planner's obligation, acceptance is the
  human's, and text that shows no human decision is **no waiver**. Waiver
  found: proceed, and carry it into the run record (step 6) and the release
  pull request body (step 7). No recorded waiver: report what the probes
  returned and stop before ticket one.

## 4. The loop — one ticket at a time, in document order

Repeat until `node "${CLAUDE_PLUGIN_ROOT}/scripts/tickets.mjs" next <epic>`
returns nothing:

**a. Refresh `epic/<name>` from the default branch.** Do this between every
ticket, or the release merge becomes its own big-bang:

```bash
git fetch origin --prune
git checkout epic/<name>
git pull --ff-only
git merge --no-edit origin/<default-branch>
git push origin epic/<name>
```

A conflict from that merge is a **stop condition, unconditionally** (sign-off
decision, 2026-08-08): run `git merge --abort`, then halt as in step 5.
Someone changed the default branch under the epic in a way the epic
contradicts, and reconciling them is judgment the human did not delegate. A
failed `--ff-only` pull is equally a halt — the local and remote epic
branches have diverged, which no step of this skill can cause.

**b. Take the first ticket** from `next <epic>` — that is document order, and
document order is the plan's de-risking order.

**c. Spawn the worker** with the Agent tool: a fresh general-purpose agent,
full toolset, empty context. Its prompt must say, in substance:

> A driver spawned you for this one ticket. Run the `flow:ticket` skill for
> `<ID>`, exactly as written — you are working from documents, not from any
> conversation. Stop after your merge into the epic branch and report; the
> driver owns the loop.

"A driver spawned you" is load-bearing: it is the phrase the ticket skill's
step 10 keys on to stop after the merge instead of continuing to the next
ticket — without it, the worker and this loop would both start the next
ticket. The worker does everything else itself, including spawning its own
reviewer and fixing findings; you do not review its diff, because a driver
that re-reviews every ticket becomes the context-laden judge the fresh
reviewer exists to replace. The reviewer's model follows the ticket skill's
step 7: the epic's optional `Reviewer model:` preamble line when present —
step 1's `list --json` carries it in `modes` as `reviewerModel`, and the
worker's own `find --json` re-reads it — the strongest model available when
absent.

**Record the worker's identity** (the agent name/ID the Agent tool returns)
against the ticket ID — the run record in step 6 names the agent that ran
each ticket, and that log line is the observable half of the
"the driver never implements" rule.

**d. Verify the outcome mechanically.** When the worker returns:

```bash
node "${CLAUDE_PLUGIN_ROOT}/scripts/tickets.mjs" find <ID> --json
```

`state` must now be `integrated` — the merged pull request into the epic
branch is the only evidence that counts, not the worker's own report. Any
other state, or a worker report of BLOCKED or ABANDONED, or a worker that
died without reporting: halt as in step 5. Never re-run the ticket, never
finish it yourself.

## 5. The stop conditions — halt, log, and do not improvise

These are the autonomous epic's ground rules, and they are operational, not
advisory. The run halts:

- on **BLOCKED** — a worker wrote a BLOCKED (or ABANDONED) status entry, or
  ended in any state but `integrated`;
- on **an Important review finding it cannot fix** — the worker's merge gate
  already refuses this; a worker stopped by it stops the run;
- on **a document/code contradiction** — reported by a worker, or met by this
  skill's own checks;
- on **a merge conflict** — refreshing the epic branch, or anywhere else;
- on **reviewer-spawn failure after the sanctioned fallback also fails** —
  the fallback being a general agent instructed by the reviewer definition
  plus the review skill;
- on **a permission prompt firing mid-run** — an unattended run that needs to
  ask was not pre-authorized, and waiting blocked is worse than stopping;
- on **a nonzero exit from any command the skill itself issues as a step,
  except those the skill explicitly marks tolerated** — in this skill the
  one tolerated shape is a **404 or 403 from step 3's two protection
  probes**, the statuses that check exists to interpret; any other failure
  from those same probes (auth, network, rate limit, 5xx, wrong repository)
  halts like every other command's nonzero exit, and every other command
  above is load-bearing.

**It never improvises past one.** Halting on a stop condition is the
mechanism working, not a failure — a run that pushes through is a run whose
release pull request can no longer be trusted, which defeats the only human
gate left. On halt: append the run record (step 6) with the stop condition
named verbatim and the ticket it fired on, commit and push it on
`epic/<name>`, report to whatever invoked you, and stop. Merge nothing more.
If the halt came from a worker's BLOCKED entry, that entry already says why;
your record points at it rather than restating it.

## 6. The run record

Append to the epic's `status.md` — append-only, like every entry there. The
heading deliberately matches neither parsed heading shape (it names no ticket
ID), so the board ignores it and `doctor` will not flag it:

```markdown
### Run — <YYYY-MM-DD> — <completed | halted>

**Driver:** /flow:run, unattended. **Tickets this run:** <one line per
ticket, in order: ID — the worker agent that ran it — integrated | halted>.

**Tokens:** <per ticket, what the harness reports for its worker and its
reviewer — `unknown` where it exposes nothing, never an estimate — and the
run's total of the known figures. Planning evidence, never a gate: nothing
in this skill reads it to decide anything.>

**Halted on:** <the stop condition, verbatim from step 5, and where it fired
— or "ran to completion".>

**Protection:** <"present" — or, when step 3 proceeded on a waiver, quote
the recorded waiver and where it lives in the epic's `tickets.md`. A run
without the hard floor under main must say so here; it is the single most
consequential fact about the run.>

**Release PR:** <URL — or "not opened: run halted".>
```

Commit it on `epic/<name>` (subject: `<epic> run record — <YYYY-MM-DD>`; no
ticket ID — this commit belongs to the run, not to a ticket) and push. An
unpushed record is invisible to exactly the human the run is reporting to.

## 7. End: open the release pull request — never merge it

When `next <epic>` is empty, refresh the epic branch from the default branch
once more (step 4a — its conflict rule still applies), then:

```bash
gh pr create --base <default-branch> --head epic/<name> \
  --title "Release: <epic>" --body "<body>"
```

The title deliberately does not look like `<ID>: <title>` — this pull request
is not a ticket, and must never be mistaken for one that could be squashed.
**It carries every ticket's commits, and squashing would collapse their
subjects into one, making every ticket but one read as unshipped** — say so
in the body, above everything else: *merge with a merge commit, never
squash.*

The body is the human's entire evidence base for the only decision they make
in this mode, so it carries: every ticket with what it built, its
verification counts, and its review outcome (findings found / fixed / not
fixed with reasons — lifted from the status log, which travels in this same
pull request); the run record summary, including which agent ran each ticket;
every deploy precondition any ticket's work created (a new environment
variable, a migration, a script that runs after), collected from the status
log — a fail-closed guard whose secret is missing takes the system down;
and, when step 3 proceeded on a recorded protection waiver, that fact —
stated right under the never-squash line, because the human is approving a
run that had no hard floor under main.

Then append the run record (step 6), print the pull request URL, and stop.
**You do not merge it, approve it, or comment on it. No agent does.** The
human gate did not disappear in this mode — it moved here, and everything
this run did was structured to keep this one click trustworthy.
