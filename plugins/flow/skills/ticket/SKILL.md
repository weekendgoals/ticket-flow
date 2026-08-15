---
name: ticket
description: Take one ticket from reading it to an open pull request — branch, implement, log, commit, review, fix, push, PR. Use when the user runs /flow:ticket <ID> (e.g. /flow:ticket SEC-3).
---

# Ticket $ARGUMENTS

One command, one ticket, ending at a pull request the user reviews and merges.

You are working from documents, not conversation history. Assume you know
nothing about this epic that is not written down.

## 0. Choose the lane: supervisor (default) or --interactive

This step exists only for the session a human typed `/flow:ticket` into.
**If the prompt that launched you says a driver or a supervisor spawned you,
skip this step — you are the worker**: execute the skill from step 1 exactly
as written, honoring whatever your spawn prompt scopes or forbids.

**Default — supervisor mode.** The invoking session almost never starts
empty: it has planned, discussed, or run earlier tickets, and that context
biases everything it would build. So the session becomes the **supervisor**
and implements nothing:

1. Resolve the ticket (step 1) and stop there — no branch, no file edits,
   at any point, for the rest of the ticket.
2. Spawn a fresh-context **worker** — a general agent, full toolset, empty
   context. Pass `model:` when step 1 reported a `workerModel` (the epic's
   optional `Worker model: <model>` preamble line — configuration, like the
   reviewer's, so that pinning the implementer's model is an edit to the
   epic's documents; it is how a plan written on one model is implemented
   by another); absent, pass no model and the worker inherits this
   session's. Tell it: a supervisor spawned it for this one ticket; run
   the `flow:ticket` skill for the ID from step 1 exactly as written;
   execute steps 1–6 (through the committed status entry) and stop with a
   report (built, verified with counts, branch, cut-from base, commit
   range); do not spawn a reviewer, do not push, do not open a pull
   request — those are owned elsewhere; and record the worker label you
   give it in the step 6 **Mode** line.
3. When the worker reports, spawn the reviewer yourself (step 7,
   unchanged). **The supervisor hires the judge, never the party under
   review** — a worker that picks its own reviewer recreates self-review
   one level down.
4. Hand back to the **same worker** the findings **and the reviewer's
   model, effort and harness-observed token figure** — the addendum needs
   them and only you observe them: the harness reports each subagent's
   spend when it stops, and no agent can see its own counter, so a figure
   an agent offers about itself is a guess by construction. Hand over the
   worker's own implementation-leg figure — what the harness reported at
   the worker's first stop, item 2 above — the same way, labelled as
   such — to disposition, fix and append the addendum
   (step 8); it has the branch context; new commits, never amendments.
5. Have the worker push and open the pull request (step 9); relay its
   report and finish per step 10 for the epic's mode — attended: print the
   URL and `next`, stop; autonomous (invoked directly by a human): the
   worker performs step 10's gate and merge and stops after it.

Relay every stop-and-report moment to the user verbatim — a worker halting
on a contradiction is the mechanism working, and the supervisor's job is to
surface it, not to smooth it over. Multiple tickets per session are
legitimate in this mode precisely because every worker starts empty.

**`--interactive` — run in-session, the steps below, yourself.** For when
the human wants to converse with the implementing agent mid-ticket. The
plugin's session hook records this choice at invocation, and it is
once-per-session: **a session that already carries in-session
implementation context — a previous `--interactive` run of this command, or
any `/flow:quick` run (quick implements in-session by design and sets the
same marker) — is refused every later `--interactive` run** with "this
session already carries in-session implementation context (an interactive
ticket or a quick ticket ran here) — rerun the command without
--interactive (supervisor mode: a fresh worker implements), or /clear to
reset the session." Supervisor invocations still pass in that session —
their workers start empty, which is the property the rule protects — and
never set the marker; the marker is wiped when the session's context is
wiped (/clear, new session) and survives resume/compact.

**Autonomous epics keep their own ending**: `/flow:run`'s driver plays the
supervisor's role one level up — **it** hires the reviewer, gates on the
findings in code, and merges — so a driver-spawned worker runs a scoped
slice of this skill and **stops at its opened pull request** (steps 1–6 and
step 9; no step 7, no step 8, no step 10). It never reviews or merges its
own work, for the same reason a supervisor's worker does not: the party
under review does not pick its judge. When a **human** invokes one
autonomous-epic ticket directly — the escape hatch for resolving a halt —
step 0's lanes still apply and the ticket ends per step 10's autonomous gate
unchanged: a **supervisor-spawned** worker performs that gate and the
epic-branch merge, then stops (it was spawned for one ticket). Step 10 states
the same split by spawn shape: driver-spawned workers stop at the opened pull
request, supervisor-spawned ones perform the gate and the merge.

## 1. Resolve it

```bash
node "${CLAUDE_PLUGIN_ROOT}/scripts/tickets.mjs" find $ARGUMENTS --json
```

This returns the epic's `ticketsDoc`, `statusDoc`, `contextDir`, `repoRoot`,
the `branch` to create — as **absolute paths**; never hardcode a path or turn
them back into relative ones — and the epic's `delivery` (`release` or
`incremental`, the parsed `Delivery:` line, incremental when absent),
`reviewerModel` and `workerModel`. `delivery` decides step 3, step 9 and
step 10; `reviewerModel` is read by step 7; `workerModel` by step 0's
worker spawn.

Both this command and every `git` command below work from anywhere in the tree —
but your shell's cwd persists between calls, and verification moves it into a
service directory. Use the absolute paths this returns, and anchor anything else
to `repoRoot`.

**Stop and report if:**

- the ID does not resolve — it prints the IDs it knows; do not guess;
- `isCurrentFolderEpic` is false **and** the project uses one checkout per epic —
  say which checkout this ticket belongs to;
- the working tree has uncommitted changes you did not make.

## 2. Read, in this order

1. The root agent instructions (`CLAUDE.md` or `AGENTS.md`), then the same file
   for every area named in the ticket doc's **Areas in scope** line.
2. The ticket's brief:

   ```bash
   node "${CLAUDE_PLUGIN_ROOT}/scripts/tickets.mjs" brief $ARGUMENTS
   ```

   One command, one payload: the epic preamble (ground rules, ordering, the
   Delivery line that decides steps 3, 9 and 10), the log's **owed items not
   yet marked resolved**, and the ticket's own section — Scope, Not in
   scope, Acceptance criteria. This is the required reading, and it is
   deliberately O(epic), not O(history): the status log grows without bound,
   and rereading all of it before every ticket is a tax that compounds. The
   owed list is what is *recorded*, not what is *true*: a ticket may have
   discharged an item without writing the `**Resolves owed:**` marker — check
   the carrier an item names before re-doing it, and if it was discharged,
   append the missing marker as a dated addendum (step 6 defines it) so the
   next worker is not sent here again.
3. The **full `statusDoc`** only when something sends you there: an owed item
   or ground rule references earlier work you must build on, the ticket names
   a predecessor's decision, or the brief leaves you unable to say what the
   last ticket left behind. Then read the entries you need, not the diary
   front to back.
4. Anything in `contextDir` the ticket points at.

Where two documents disagree, or the code contradicts a document, **stop and
report it. Do not adapt silently.**

## 3. Branch — from the right base

```bash
git fetch origin --prune
```

There is one epic branch, `epic/<epic-name>`. `/flow:epic` created it and
committed the epic's documents there. Which base you use depends on the
delivery and on whether those documents have reached the default branch yet.

**First, have the epic's documents shipped?**

```bash
git ls-tree origin/<default-branch> "epics/<epic-name>/tickets.md"
```

Empty output means they have not. **Then this ticket must branch from
`epic/<epic-name>`**, whatever the delivery — otherwise the epic's ticket
doc, status log and context never reach the default branch, and the board goes
blind to the whole epic. This is normally ticket one.

**Incremental delivery, documents already shipped.** Start from the merged
default branch, but check the previous ticket actually landed:

```bash
gh pr list --state open --json number,title,headRefName
```

- No open pull request from this epic: `git checkout <default-branch> && git pull
  && git checkout -b <branch>`.
- The **previous ticket in this epic** still has an open pull request: **stop and
  say so.** Do not silently branch off unmerged work — that is how an unplanned
  stack forms. The user either merges it or tells you to stack deliberately.

**Release delivery.** Every ticket branches from the epic branch and returns
to it:

```bash
git checkout epic/<epic-name>
git pull --ff-only 2>/dev/null || true
git checkout -b <branch>
```

Keep `epic/<epic-name>` current with the default branch as the epic runs, or the
release merge becomes its own big-bang.

**Whatever the delivery, note two things now: the branch you cut from, and
the pull request base.** The PR base is what step 7 diffs against and step 9
targets: the default branch in incremental delivery — including the first
ticket, which cuts from `epic/<epic-name>` but ships its pull request,
documents and all, to the default branch — or `epic/<epic-name>` in release
delivery. The cut-from branch and the PR base differ only in that
incremental first-ticket case.

## 4. Implement

- Commit in reviewable increments. **Prefix every commit subject with the ticket
  ID** — `SEC-3: bound the venue list limit`. This is load-bearing: `tickets.mjs`
  reads those subjects off the default branch to decide what has shipped.
- **Stay inside the ticket's scope.** "Not in scope" is binding, and usually
  names the next ticket. Do not start it.
- Update the agent instruction files in the same commit as any change they
  describe.
- **Stage only your own hunks.** Never `git add -A` or `git add .` — a repository
  with unrelated uncommitted work will have it swept into your commit.

## 5. Verify

Run the ticket's acceptance criteria plus the standing checks for what you
touched. **The commands live in the project's own instruction files** — the root
one, or each workspace's. Read them there rather than guessing; do not invent a
test command.

Report **counts** — "api-gateway 217/217 passed", never "tests pass". If a check
cannot run here, say so and record it as owed. Never imply it passed.

If the project has mutation testing configured, run it scoped to the files this
ticket changed. A surviving mutant in changed code means a test executes that
line without checking it — treat it as an unfinished acceptance criterion, not a
separate concern.

## 6. Log what was done, then commit

Append to `statusDoc`. Append-only — never edit an existing entry. Create the
file if it does not exist, opening it with this exact preamble — defined here
because this step is where creation happens, and a worker holding only this
skill must not have to invent it:

```markdown
# <Name> epic — status log

Append-only record of finished tickets. Tickets: `epics/<name>/tickets.md`.

**Rules.** Append only. Corrections are new dated addenda beneath the entry they
correct, never edits. Report counts, not adjectives. The **Owed** line is
required even when empty.
```

The epic skill's status-log template opens with the same preamble (its
Baseline section belongs to planning and is not part of it), and the quick
skill's step 5 carries a third copy for its in-session lane — one rule in
three documents: a change to any copy moves the others in the same commit.

The **entry** heading is parsed — the preamble's `#` title is not — so match
it exactly:

```markdown
### <ID> — <name> — <YYYY-MM-DD> — DONE
```

`DONE`, or `BLOCKED` / `ABANDONED` if you stopped — a ticket that died still
gets an entry saying why.

```markdown
**Built:** <what exists now that didn't — one to three sentences. Enough
that the next session needs no archaeology; not a narration of the work.
Git already records the files and commits, tests record the details.>

**Mode:** <how this ticket ran — `supervisor — worker <label>, reviewer
hired by the supervisor`, or `interactive — in-session`, or `autonomous —
driver-spawned worker <label>`, or `quick — in-session (/flow:quick)`.
This line is what makes the fresh-context rule auditable after the fact.>

**Tokens:** <harness-observed or `unknown` — never self-reported, never
estimated: an agent cannot see its own counter, so a figure is written
only by whoever watched the harness report it when an agent stopped.
Supervisor mode: write `observed by the supervisor — see the review
addendum`, where the figures land in step 8. Driver-spawned (unattended
run): write `recorded in the run record` — the session sums the run's
transcripts there. In-session lanes (interactive, quick): `unknown` — the
session cannot observe itself. Planning evidence, never a gate.>

**Verified:** <exact commands and counts; manual checks with evidence>

**Decisions:** <only judgment calls and deviations from the plan or the
documents, each with the why — "none" when the ticket went as written.
Routine actions are not decisions.>

**Owed:** <anything deferred and which ticket inherits it — "Nothing" if
genuinely nothing, never omit the line. `tickets.mjs brief` hands every
non-Nothing Owed line to future workers until a `**Resolves owed:**` line
closes it, so write it to be read on its own. Verify the named carrier can
structurally reach the thing being checked: an owed check was once handed to
a lane whose entry point never touches the step it was meant to verify, and
only review caught it>
```

**When this ticket discharges an owed item from an earlier entry**, say so
machine-readably on its own line in this entry (or in a dated addendum):

```markdown
**Resolves owed:** <ID> — <one line on how it was discharged>
```

`<ID>` is the entry that recorded the debt — one Owed paragraph per entry,
so the entry ID is the item's identity. This line is what removes the item
from every future brief; discharging silently leaves it advertised as
outstanding forever, and the next worker pays to re-investigate it.

**Keep the entry short.** The status log is read through `brief`'s owed
extraction and by humans doing archaeology; exhaustive narration of routine
actions makes both reads worse and every future ticket more expensive.
Write for someone who was not there — no codenames, no "as discussed", no
reference to this conversation — and stop when the six lines are true.

Commit it with the rest. **Commit before the review runs** — the reviewer reads a
commit range, and that is what keeps the review auditable against exactly what
was reviewed.

## 7. Review — empty context, a model and effort sized to the consequence

The session that wrote the code cannot review it. It will agree with itself.
In supervisor mode this step belongs to the **supervisor**, never the
worker (step 0); in an unattended run it belongs to the **driver script**,
which hires the reviewer once the worker's pull request is open, and gates
on its findings before merging (step 0). Either way the hirer is never the
party under review.

Independent review is always worth its price here; **maximum-capability
review is not** — the strongest model at the highest effort spends 50–80k
tokens per pass, which a prose diff cannot repay. Model and effort scale
together, by what the diff can break:

| Tier | When | Model | Effort |
|---|---|---|---|
| prose | documentation and code comments only — nothing any runtime, parser, test, or agent reads | a fast mid-tier model (`haiku`) | `low` |
| normal | everything below the risk list — code, and the shapes that look like prose but are not: configuration, user-facing strings, CLI output, agent/skill instructions | a named cost-efficient model (`sonnet`) — never the session's own model, which prices routine review by whoever happened to launch the session | `high` |
| consequence | the risk list below | the strongest reviewer-sanctioned model (`opus`) | `xhigh` |

The consequence list: authentication or authorization boundaries, secrets,
crypto, network exposure, migrations, anything that deletes or rewrites
data, payments or billing, or anything that can fail open. This is the same
list that gates entry to `/flow:quick` — a trigger added to either list is
added to the other **in the same commit**. Pick the tier yourself and say
which; do not ask. When in doubt between tiers, take the higher one — the
tiering exists to stop routine maximum spend, not to argue small diffs
downward.

Spawn the reviewer with the **Agent** tool:

- `subagent_type: "flow:ticket-reviewer"`, and `model`: the epic's **Reviewer
  model** when it declares one — an optional `Reviewer model: <model>` line in
  the tickets.md preamble, exposed by step 1's `find --json` as
  `reviewerModel`; it overrides the tier table, so redirecting the reviewer
  is an edit to the epic's documents, never a mid-run conversational
  directive. Absent (`reviewerModel: null`), use the tier table's model.
- `effort`: the tier table's.

Tell it to follow **the `/flow:review` skill** and give it:

- the commit range — `git merge-base origin/<base-branch> HEAD`..`HEAD`, using
  the base branch you noted in step 3,
- the ticket's required reading, scoped —
  `node "${CLAUDE_PLUGIN_ROOT}/scripts/tickets.mjs" brief <ID>` (the epic
  ground rules, this ticket's Acceptance criteria and Not in scope — straying
  outside scope is a finding — and the open owed items) rather than the whole
  `ticketsDoc`,
- this ticket's own entry from `statusDoc` — not the whole log, which grows
  with every ticket and is cost, not context, for a reviewer,
- the instruction files for every area in scope.

**It reports; it does not fix.**

## 8. Fix, and commit the fixes separately

New commits on the same branch, never amendments — the review has to stay
auditable against what was reviewed. Mark them: `SEC-3: reject negative limit
values (review fix)`. Re-run affected checks and report counts.

Not every finding gets fixed. Legitimately **not fixed** = out of scope and owned
by a later ticket, the fix is riskier than the bug, or the premise is wrong.
A **pre-existing** finding — a real defect this ticket did not introduce — is
recorded and handed to a named ticket, never silently dropped. Every disposition
needs a written reason.

**A nit does not become a ticket by default.** Fix it here if it is trivial
and in scope; otherwise record it in the addendum and let the retro decide —
a nit earns its own ticket only when it affects users, creates real
maintenance risk, keeps recurring, or can ride an already-planned change.
Auto-ticketing every nit feeds each one back into a full worker-and-reviewer
cycle, and the loop optimizes the process instead of the product.

Append the outcome to `statusDoc` as a dated addendum — never edit the original
entry — and **commit the addendum** (with the fix commits, or on its own when
nothing was fixed). An uncommitted addendum never reaches the remote or the
pull request's evidence trail:

```markdown
**Addendum — review — <YYYY-MM-DD> — <model>/<effort>:** <findings. What was
fixed, in which commit, with counts. What was not fixed, each with its reason.
Say "nothing deferred" explicitly if that is true. Keep it to the findings
and their dispositions — do not reproduce verification transcripts or
re-walk acceptance criteria the entry's Verified line already carries: the
log is read by every later reviewer and the retro, and narration there is a
cost every future ticket pays. End with the token
figures the supervisor observed and handed over — `Worker tokens
(implementation leg): <n>; Reviewer tokens: <n>`, `unknown` where the
harness exposed nothing — completing the entry's **Tokens** line on the
same terms: harness-observed or unknown, never asked of an agent, never
estimated. In an unattended run the driver's disposition prompt replaces
this ending with `Tokens: recorded in the run record`, because there the
figures exist only after the run, summed from its transcripts.>
```

## 9. Show the user, then push and open the pull request

Print, concisely:

1. **Built** — what now exists, and the files.
2. **Verified** — commands and counts, and anything that could not run here.
3. **Review** — effort used, findings found, fixed, and not fixed with reasons.

Then:

```bash
git push -u origin <branch>
gh pr create --base <base-branch> --title "<ID>: <title>" --body "<body>"
```

`<base-branch>` is the base you noted in step 3 — the default branch in
incremental delivery, or `epic/<epic-name>` in release delivery. The first
ticket of an incremental epic **branches from** `epic/<epic-name>` (step 3)
but its pull request still targets the default branch — that pull request is
how the epic's documents ship; basing it on the epic branch would strand
them there, since an incremental epic has no release pull request.

The pull request body is the only thing read before this ships, so it carries:
what changed and why, the acceptance criteria with evidence and counts, the
review summary, and any precondition that must exist before deploy (a new
environment variable, a migration, a script that runs after).

Do not add Claude as a co-author. **No agent ever merges toward the default
branch, in any mode** — no `gh pr merge` on a pull request based on main, no
`git merge`, no pushing to main. A human merges those in the GitHub UI. A
single-ticket pull request titled `<ID>: <title>` may be squashed — the squash
commit inherits the title, so `tickets.mjs` still sees the ID. What must
**never** be squashed is a release pull request: it carries many
tickets, and squashing collapses their subjects into one, making every ticket
but one read as unshipped.

The **one sanctioned agent merge** exists only in a release epic, and its
surface is the epic branch only — step 10 when you own the ending, or the run
driver's merge step, after its coded gate, in an unattended run.

## 10. Stop — or, in a release epic, integrate and continue

**If `delivery` is not `release`** (an incremental epic): print the pull
request URL and `node "${CLAUDE_PLUGIN_ROOT}/scripts/tickets.mjs" next`. Then
stop. Do not start the next ticket. There is nothing to run after the merge.

**If `delivery` is `release`:**

- **An unreviewed ticket is never merged, anywhere.** Reaching this step
  requires the review addendum from step 8 in the status log, **committed**,
  and with **no Important finding left unfixed** — in an autonomous run, a
  not-fixed disposition on an Important finding is not yours to judge,
  whatever the proposed reason: stop, write a BLOCKED entry naming the
  finding, merge nothing. If the reviewer agent could not be spawned, the
  sanctioned fallback is a general agent instructed by the reviewer
  definition plus the review skill; if that also fails, stop — BLOCKED entry,
  no merge.
- Verify the pull request's base equals `epic/` + the `epic` field from step
  1's `find --json` output — `gh pr view --json baseRefName`. Anything else:
  stop. Do not retarget, do not merge.
- Merge your own pull request into the epic branch with a merge commit:
  `gh pr merge <number> --merge`. Never squash — the release pull request
  needs the per-ticket subjects.
- **Which spawn shape you are decides whether this step is yours at all.**
  Read the prompt that launched you:
  - **A driver spawned you** (`/flow:run`'s workflow — the prompt says "a
    driver spawned you"): **you never reach this step.** Your ticket ends at
    step 9's opened pull request; the driver owns the review, the gate, the
    merge, the between-ticket refresh of the epic branch, and the fresh
    context of the next ticket's agent. Report as in step 9 and stop.
  - **A supervisor spawned you**, or you are the whole run (a human typed
    `/flow:ticket` — step 0's escape hatch for one ticket of a release epic):
    **this step is yours.** Perform the gate and the epic-branch merge above,
    then stop — you were spawned for one ticket. Continue to the next ticket
    in document order **only when you are the whole run** and no driver and
    no supervisor exist.

  Either way, the epic's ground-rule stop conditions bind everything; halting
  on one is the mechanism working, not a failure.
- The default branch remains untouchable. The release pull request at the end
  of the run is opened by the driver and merged by a human — never by you.
