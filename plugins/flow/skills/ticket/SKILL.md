---
name: ticket
description: Take one ticket from reading it to an open pull request — branch, implement, log, commit, review, fix, push, PR. Use when the user runs /flow:ticket <ID> (e.g. /flow:ticket SEC-3).
---

# Ticket $ARGUMENTS

One command, one ticket, ending at a pull request the user reviews and merges.
You work from documents, not conversation history: assume you know nothing
about this epic that is not written down. This file is the procedure;
METHODOLOGY.md carries the reasons.

## 0. Choose the lane: supervisor (default) or --interactive

**If the prompt that launched you says a driver or a supervisor spawned you,
skip this step — you are the worker.** Run from step 1 exactly as written,
honoring whatever your spawn prompt scopes or forbids.

**Default — supervisor mode.** The invoking session carries context that
biases what it would build, so it supervises and implements nothing:

1. Resolve the ticket (step 1), then stop: no branch, no file edits.
2. Spawn a fresh-context **worker** — general agent, full toolset, empty
   context, `model:` from step 1's `workerModel` when present. Tell it: a
   supervisor spawned it for this one ticket; run the `flow:ticket` skill for
   the ID exactly as written, steps 1–6, and stop with a report (built,
   verified with counts, branch, cut-from base, commit range); spawn no
   reviewer, push nothing, open no pull request; write the worker label into
   the step 6 **Mode** line.
3. Spawn the reviewer yourself (step 7). **The supervisor hires the judge,
   never the party under review.**
4. Hand the **same worker** the findings plus the reviewer's model, effort
   and harness-observed token figure, and the worker's own implementation-leg
   figure — only you observe those; no agent can see its own counter — to
   disposition, fix and append the addendum (step 8).
5. Have the worker push and open the pull request (step 9) and finish per
   step 10; relay its report.

Relay every stop-and-report verbatim — a worker halting on a contradiction is
the mechanism working. Several tickets per session are fine here, because
every worker starts empty.

**Recovering a ticket a halted run left behind.** When step 1's `find`
reports the ticket `done` or `in-review` and `origin/<branch>` already exists
— the state an unattended run leaves whenever it halts after its worker
pushed, which is most halts — **nothing is rebuilt**. The worker checks out
that pushed branch instead of creating one (step 3's exception), confirms the
ticket's status entry is committed on it, and reports where the run stopped.
You then continue the leg that did not finish: **step 7** when the entry
carries no `Addendum — review —` line, **step 8** when it does and findings
are still open, **step 10** when the addendum is committed and they are not.
Re-running steps 2–6 would rewrite an entry the run already committed and
re-do work already reviewed; that is why the recovery starts by reading the
branch, not by building. The run skill's § "Resuming after a halt" is the
other door onto this same rule, and names this command as the way through it.

**`--interactive` — run the steps yourself, in-session**, when the human
wants to converse with the implementing agent mid-ticket. The session hook
records the choice, once per session: a session already carrying in-session
implementation context (an earlier `--interactive` run, or any `/flow:quick`
run) is refused every later `--interactive` run with "this session already
carries in-session implementation context (an interactive ticket or a quick
ticket ran here) — rerun the command without --interactive (supervisor mode:
a fresh worker implements), or /clear to reset the session." Supervisor
invocations still pass and never set the marker; it dies with the session's
context (/clear, new session) and survives resume/compact.

**Driver-spawned workers** (`/flow:run`): the driver hires the reviewer,
gates in code and merges, so you run steps 1–6 and step 9's summary and push,
then **stop at your pushed branch** — no pull request, no step 7, 8 or 10.
When a **human** runs one release-epic ticket directly (the escape hatch for
a halt), a supervisor-spawned worker performs step 10's gate and merge, then
stops — and when the halt left a pushed branch whose status entry is already
committed, that worker builds nothing: it checks the branch out as the
recovery paragraph above says, and the ticket resumes at the leg the run
stopped in.

## 1. Resolve it

```bash
node "${CLAUDE_PLUGIN_ROOT}/scripts/tickets.mjs" find $ARGUMENTS --json
```

Returns `ticketsDoc`, `statusDoc`, `contextDir`, `repoRoot` and the `branch`
to create as **absolute paths** — use them as given, never turned back into
relative ones, and anchor anything else to `repoRoot`; your cwd moves during
verification — plus `delivery` (`release` or `incremental`, incremental when
absent; decides steps 3, 9 and 10), `reviewerModel` (step 7) and
`workerModel` (step 0).

**Stop and report if:** the ID does not resolve (it prints the IDs it knows;
do not guess); `isCurrentFolderEpic` is false and the project uses one
checkout per epic; or the working tree has uncommitted changes you did not
make.

## 2. Read, in this order

1. The root agent instructions (`CLAUDE.md` or `AGENTS.md`), then the same
   file for every area on the ticket doc's **Areas in scope** line.
2. The brief — required reading, O(epic) rather than O(history):

   ```bash
   node "${CLAUDE_PLUGIN_ROOT}/scripts/tickets.mjs" brief $ARGUMENTS
   ```

   It carries the epic preamble, the owed items no `**Resolves owed:**` line
   has closed, and this ticket's Scope, Not in scope and Acceptance criteria.
   Owed items are what is *recorded*, not what is *true*: check the named
   carrier before redoing one, and if it was discharged unmarked, append the
   marker as a dated addendum (step 6).
3. The **full `statusDoc`** only when something sends you there — an owed
   item or ground rule that builds on earlier work, a predecessor's decision
   the ticket names, a brief that leaves you unable to say what the last
   ticket left behind. Read the entries you need, not the diary.
4. Anything in `contextDir` the ticket points at.

Where two documents disagree, or the code contradicts a document, **stop and
report. Do not adapt silently.**

## 3. Branch — from the right base

```bash
git fetch origin --prune
```

**First: have the epic's documents shipped?**

```bash
git ls-tree origin/<default-branch> "epics/<epic-name>/tickets.md"
```

Empty output means not yet, and then **this ticket branches from
`epic/<epic-name>` whatever the delivery** — otherwise the documents never
reach the default branch and the board goes blind to the epic. This is
normally ticket one.

**Incremental delivery, documents shipped.** Check the previous ticket landed:

```bash
gh pr list --state open --json number,title,headRefName
```

No open pull request from this epic: `git checkout <default-branch> && git
pull && git checkout -b <branch>`. The **previous ticket's** pull request
still open: **stop and say so** — the user merges it or tells you to stack
deliberately.

**Release delivery.** Every ticket branches from the epic branch:

```bash
git checkout epic/<epic-name>
git pull --ff-only 2>/dev/null || true
git checkout -b <branch>
```

Keep `epic/<epic-name>` current with the default branch, or the release merge
becomes its own big-bang.

**Exception — a branch that already exists is checked out, never re-created.**
`git checkout -b <branch>` fails outright on an existing branch, and the
branch a halted run pushed already carries this ticket's commits and its
committed status entry: `git checkout -b <branch> origin/<branch>` after the
fetch, or `git checkout <branch>` when it is already local. This is step 0's
recovery, and the rest of the ticket resumes at the leg that did not finish —
you implement nothing on a branch whose entry is already written.

**Note the branch you cut from and the pull request base** — what step 7
diffs against and step 9 targets: the default branch in incremental delivery
(including the first ticket, which cuts from `epic/<epic-name>`), or
`epic/<epic-name>` in release delivery.

## 4. Implement

- Commit in reviewable increments, **every subject prefixed with the ticket
  ID** — `SEC-3: bound the venue list limit`. The board reads subjects off
  the default branch to decide what has shipped.
- **Stay inside the ticket's scope.** "Not in scope" is binding and usually
  names the next ticket. Do not start it.
- Update the agent instruction files in the same commit as any change they
  describe.
- **Stage only your own hunks.** Never `git add -A` or `git add .`.

## 5. Verify

Run the ticket's acceptance criteria plus the standing checks for what you
touched, using **the commands in the project's own instruction files** —
never an invented test command.

- A criterion written *demonstrate: <action> → <result>* is **run, not waved
  at**: drive the real app in a real browser or simulator where one exists,
  and record what you **observed** as evidence ("/login rejects an empty
  password with the inline error, screenshot checked"), never an adjective.
- A criterion carrying `CHECK:` / `EXPECT:` lines runs through the board
  script, and its ledger is your Verified line:

  ```bash
  node "${CLAUDE_PLUGIN_ROOT}/scripts/tickets.mjs" check $ARGUMENTS
  ```

  A failing check is a ticket that is not done. So is a skipped one: the
  ledger marks `↓ skipped` when a command exits 0 while the work it names
  never ran — the suite that skips itself without `DATABASE_URL` is the
  common shape — and **a skipped check is not a passed one**. Give the
  command what the run needed and re-run it, or record the criterion as owed
  with the reason; never report it among the counts as passed. In an
  unattended run the driver re-runs it with `--from origin/epic/<name>` —
  the criteria as signed off — and gates the merge in code.

Report **counts** — "api-gateway 217/217 passed", never "tests pass". A check
that cannot run here is recorded as owed; never imply it passed.

Then **the revert check**, before the ticket is called done. Commit
everything first — step 4 already has you committing in increments, and
the check relies on HEAD holding the work, so nothing it undoes can be
lost. Then revert the whole ticket and bring the tests back:

```bash
git revert --no-commit $(git rev-list --no-merges <base>..HEAD)  # the ticket's own commits; <base>: the branch step 3 cut from
git checkout HEAD -- <test paths at HEAD>   # the tests stay as the ticket wrote them
git rm -qf <test paths the ticket deleted>  # a deleted test comes back with the revert; it is not one you can name
<run the suite>
git revert --abort                          # the tree is exactly HEAD again
```

Name on the Verified line the test that **fails with the source change
reverted**. The commits are listed by SHA with merges excluded because a
merge commit in the range (a branch a human refreshed from its base) stops
a plain range revert. Not `git stash` and not a checkout from the base: a
stash of committed work is a no-op that leaves the change in place and
reads as "nothing fails", and a checkout from the base over uncommitted
work destroys it — while a revert handles new and deleted files that a
path-based revert leaves half-done. A revert that conflicts is aborted and
the check recorded as owed with that reason. If nothing fails,
the tests pass with or without the change and pin nothing, and the ticket
is not done until one does. Do the same to each new guard, branch and error
path in turn — delete or invert it, confirm the suite goes red, put it
back: a whole-change revert stays red on the headline fix while the `&& b`
you added is still unpinned, and a fixture sized from the constant under
test can never fire. The reason it is required rather than advised: the
same session wrote the code and the tests, so both can encode one
misunderstanding while the suite goes green, and this is the cheapest
moment to find that out — the reviewer opens the named test and checks it
depends on the change, so the claim is not the evidence. A configured
mutation tester is the same check at scale: run it scoped to the changed
files, and a surviving mutant in changed code is an unfinished acceptance
criterion. Two diffs have no test to name, and each says why on the
Verified line, because the reason is what the reviewer checks. A prose diff
by step 7's tier table — documentation and code comments only, nothing any
runtime, parser, test or agent reads — is `revert check: n/a, prose-only`;
skill and agent Markdown is not prose: in a plugin it is the program, and a
test can pin it. A diff with behaviour that no assertion can hold is
`revert check: nothing to pin — <reason>`: a tests-only ticket (the tests
are the change — run them and report counts), a change whose evidence is
the *demonstrate:* criterion the epic wrote for it (name it and record the
observation), or a project with no test runner (owed, like any check that
cannot run here). A reason that does not hold — the project has a suite,
and the change has behaviour a test could assert — is an Important finding
for the reviewer, not a wording choice.

## 6. Log what was done, then commit

Append to `statusDoc` — append-only, never edit an existing entry. If the
file does not exist, create it with this exact preamble:

```markdown
# <Name> epic — status log

Append-only record of finished tickets. Tickets: `epics/<name>/tickets.md`.

**Rules.** Append only. Corrections are new dated addenda beneath the entry they
correct, never edits. Report counts, not adjectives. The **Owed** line is
required even when empty.
```

The epic skill's template and the quick skill's step 5 carry the same block
— one rule, three documents; a change to any copy moves the others in the
same commit.

The **entry** heading is parsed, so match it exactly — `DONE`, or `BLOCKED` /
`ABANDONED` if you stopped (a ticket that died still gets an entry saying why):

```markdown
### <ID> — <name> — <YYYY-MM-DD> — DONE
```

```markdown
**Built:** <what exists now that did not — one to three sentences; git
records the files>

**Mode:** <`supervisor — worker <label>, reviewer hired by the supervisor`,
`interactive — in-session`, `autonomous — driver-spawned worker <label>`, or
`quick — in-session (/flow:quick)`>

**Tokens:** <harness-observed or `unknown`, never self-reported or estimated.
Supervisor mode: `observed by the supervisor — see the review addendum`.
Driver-spawned: `recorded in the run record`. In-session: `unknown`.>

**Verified:** <exact commands and counts; manual checks with evidence; the
test that fails with the source change reverted, or `revert check: n/a,
prose-only`>

**Decisions:** <judgment calls the documents left open, each with the why —
"none" when the ticket went as written. A departure from what the documents
show goes on its own **Deviation:** line below, never in here>

**Deviation:** <one line per departure: what the ticket's documents or its
design showed → what was built instead, and why. Optional; omitted when there
is none. Several departures are several lines>

**Owed:** <anything deferred and which ticket inherits it — "Nothing" if
genuinely nothing, never omitted. **One obligation per bullet** when there
is more than one: `brief` numbers an entry's bullets `<ID>.1`, `<ID>.2` … in
document order, and that is how a later ticket retires them one at a time.
`brief` hands every non-Nothing item to future workers until a
`**Resolves owed:**` line closes it, so write each to be read alone, and
check the named carrier can structurally reach the thing — an owed check was
once handed to a lane that never touches the step it was meant to verify>
```

**What counts as a deviation:** anything the ticket's documents or its design
showed that you did not build, or built differently. A judgment call the
documents left open is not one and stays in `**Decisions:**`. A deviation is
**never owed work**, and the two are not interchangeable: an owed item is work
someone will do, a deviation is a decision someone must see. It gets its own
line because the field that used to hold it — `**Decisions:**` prose — is read
by no command: a worker once recorded there, honestly, that it had not built a
design's hero band, and the page shipped without it because nothing carried the
sentence any further. On its own line it is parsed, and
`node "${CLAUDE_PLUGIN_ROOT}/scripts/tickets.mjs" brief <ID>` hands every one
no human has closed to every later ticket in this epic.

**`**Deviations closed:**` is the human's line — never yours, and never any
agent's.** A dated line, in an entry or an addendum, naming each deviation as
**accepted** or as **fixed in `<sha>`**, with who decided and when:

```markdown
**Deviations closed:** <ID>[, <ID>] — <each deviation named as accepted or as
fixed in <sha>; who; when>
```

It closes every deviation the named entries recorded **above it in the file**,
by the leading ID list only, exactly as `**Resolves owed:**` resolves. Do not
write one, even for a departure you fixed yourself in this same ticket: a
closing line the reviewed party could have written clears nothing, and "which
of the two happened" is what the human reading it needs to know. Record the fix
as a deviation like any other and leave the line to whoever decides.
`node "${CLAUDE_PLUGIN_ROOT}/scripts/tickets.mjs" deviations <ID>` reads all of
a ticket's own — closed or not, each with its closing line.

When this ticket discharges an owed item from an earlier entry, say so on its
own line in this entry, or in a dated addendum beneath it (the shape the
**Rules** block allows for anything added after the fact) — this is what
removes it from every future brief:

```markdown
**Resolves owed:** <the item's ID — the entry ID when that entry owed one
thing, `<ID>.<n>` when it owed several> — <how it was discharged>
```

**Name the item, not the entry, when the entry recorded several.** A bare
entry ID is read against what that entry owed when your line was written, so
it closes a one-item entry and retires **nothing** when it faces more than
one — it used to retire all of them, and a marker naming one item once closed
four, including a production-database hazard that had to survive. `brief` and
`doctor` both report a marker that retired nothing, name the form that works,
and stop reporting it once any item of that entry is named that way. A
number past the end of the entry (`<ID>.7` of two) is reported the same way:
check the count against the entry before you write it.

Keep the entry short and written for someone who was not there. **Commit
before the review runs** — the reviewer reads a commit range.

## 7. Review — empty context, priced by consequence

The session that wrote the code cannot review it. In supervisor mode this
step is the **supervisor's**; in an unattended run, the **driver's**. The
hirer is never the party under review.

| Tier | When | Model | Effort |
|---|---|---|---|
| prose | documentation and code comments only — nothing any runtime, parser, test or agent reads | `haiku` | `low` |
| normal | everything below the risk list — code, and what looks like prose but is not: configuration, user-facing strings, CLI output, agent/skill instructions | `sonnet` — named, never the session's own model | `high` |
| consequence | the risk list below | `opus` | `xhigh` |

The consequence list: authentication or authorization boundaries, secrets,
crypto, network exposure, migrations, anything that deletes or rewrites data,
payments or billing, or anything that can fail open. It is the same list that
gates entry to `/flow:quick` — a trigger added to either list is added to the
other in the same commit. Pick the tier yourself and say which; do not ask.
When in doubt, take the higher one. (The unattended driver floors the tier in code from the
diff's file list, because there the reviewed party reports it.)

Spawn the reviewer with the **Agent** tool: `subagent_type:
"flow:ticket-reviewer"`; `model`: step 1's `reviewerModel` when set (the
epic's `Reviewer model:` line overrides the table), else the table's;
`effort`: the table's. Tell it to follow **the `/flow:review` skill** and
give it:

- the commit range — `git merge-base origin/<base-branch> HEAD`..`HEAD`, with
  the base from step 3;
- `node "${CLAUDE_PLUGIN_ROOT}/scripts/tickets.mjs" brief <ID>` — ground
  rules, criteria, Not in scope (straying outside it is a finding), open owed
  items — not the whole `ticketsDoc`;
- this ticket's own entry from `statusDoc`, not the whole log;
- the instruction files for every area in scope.

**It reports; it does not fix.**

## 8. Fix, and commit the fixes separately

New commits on the same branch, never amendments, marked `SEC-3: reject
negative limit values (review fix)`. Re-run affected checks and report counts.

Legitimately **not fixed** = out of scope and owned by a later ticket, the fix
riskier than the bug, or the premise wrong. A **pre-existing** defect is
recorded and handed to a named ticket, never dropped. Every disposition needs
a written reason. **A nit does not become a ticket by default**: fix it here
if trivial and in scope, otherwise record it for the retro — a nit earns a
ticket only when it affects users, creates real maintenance risk, keeps
recurring, or rides an already-planned change. **A revert check that does
not hold is not a nit either**: a named test that passes without the
change, or an `n/a` whose reason does not hold, is Important — fix the
tests so one pins the change, or name it as unfixed in the pull request
body; a merge with no evidence behind it is not something the retro can
repair.

**A regression this change introduced is never recorded for the retro**,
even when the reviewer called it a nit or fixing it looks out of scope.
A user-visible regression this change introduces is Important, even outside the ticket's scope: scope limits what the worker builds, not what the reviewer reports. Something that worked before and now visibly does not is
Important: fix it here, or leave it unfixed with its reason — which, like
any unfixed Important finding, blocks step 10's merge (release) or is named
as unfixed in the pull request body (incremental) so a human decides. The
retro runs after the release; a regression parked there ships.

Append the outcome to `statusDoc` as a dated addendum and **commit it** — an
uncommitted addendum never reaches the pull request's evidence trail:

```markdown
**Addendum — review — <YYYY-MM-DD> — <model>/<effort>:** <what was fixed, in
which commit, with counts; what was not fixed, each with its reason;
"nothing deferred" explicitly when true. Findings and dispositions only. End
with the figures the supervisor observed: `Worker tokens (implementation
leg): <n>; Reviewer tokens: <n>`, `unknown` where the harness exposed
nothing — or, driver-spawned, `Tokens: recorded in the run record`.>
```

## 9. Show the user, then push and open the pull request

Print, concisely: **Built** (what exists, and the files), **Verified**
(commands, counts, anything that could not run), **Review** (effort, findings
found, fixed, not fixed with reasons). Then:

```bash
git push -u origin <branch>
```

**Incremental delivery** — open the pull request; it is the human gate:

```bash
gh pr create --base <default-branch> --title "<ID>: <title>" --body "<body>"
```

The first ticket cuts from `epic/<epic-name>` but still targets the default
branch — that is how the documents ship. The body carries what changed and
why, the acceptance criteria with counts, the review summary, and any deploy
precondition (an environment variable, a migration, a script that runs after).

**Release delivery — no pull request.** The human's gate is the release pull
request; the pushed branch and the committed entry with its addendum are the
ticket's record and travel inside it.

Do not add Claude as a co-author. **No agent ever merges toward the default
branch, in any mode** — a human merges in the GitHub UI. A single-ticket pull
request titled `<ID>: <title>` may be squashed (the squash commit inherits
the title). A release pull request must **never be squashed**: squashing
collapses its per-ticket subjects so every ticket but one reads as unshipped.
The one sanctioned agent merge is a ticket branch into its epic branch,
step 10.

## 10. Stop — or, in a release epic, integrate and continue

**Incremental:** print the pull request URL and
`node "${CLAUDE_PLUGIN_ROOT}/scripts/tickets.mjs" next`. Then stop; nothing
runs after the merge.

**Release:**

- **An unreviewed ticket is never merged, anywhere.** This step requires the
  step 8 addendum **committed** with **no Important finding left unfixed** —
  a not-fixed Important finding is not yours to accept: write a BLOCKED entry
  naming it, merge nothing. If the reviewer agent could not be spawned, the
  fallback is a general agent given the reviewer definition plus the review
  skill; if that fails too, BLOCKED entry, no merge.
- Merge **by verified SHA, with a merge commit** — the SHA is what makes the
  merged diff exactly the reviewed one; never squash, because the ID-prefixed
  subjects reaching `epic/<epic-name>` are how the board derives `integrated`:

  ```bash
  git rev-parse origin/<branch>        # the exact commit that was reviewed and fixed
  git checkout epic/<epic-name>
  git pull --ff-only
  git merge --no-ff <that SHA>
  git push origin epic/<epic-name>
  ```

- **Your spawn shape decides whether this step is yours.** A driver spawned
  you (the prompt says "a driver spawned you"): you never reach this step —
  report at step 9's pushed branch and stop. A supervisor spawned you, or you
  are the whole run: perform the gate and the merge, then stop — continue to
  the next ticket in document order **only when you are the whole run**. The
  epic's stop conditions bind either way; halting on one is the mechanism
  working.
- The release pull request is opened by the driver and merged by a human —
  never by you.
