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
stops.

## 1. Resolve it

```bash
node "${CLAUDE_PLUGIN_ROOT}/scripts/tickets.mjs" find $ARGUMENTS --json
```

Returns `ticketsDoc`, `statusDoc`, `contextDir`, `repoRoot` and the `branch`
to create as **absolute paths** — use them as given; your cwd moves during
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
   the ticket names. Read the entries you need, not the diary.
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

  A failing check is a ticket that is not done. In an unattended run the
  driver re-runs it with `--from origin/epic/<name>` — the criteria as signed
  off — and gates the merge in code.

Report **counts** — "api-gateway 217/217 passed", never "tests pass". A check
that cannot run here is recorded as owed; never imply it passed. If mutation
testing is configured, run it scoped to the changed files: a surviving mutant
in changed code is an unfinished acceptance criterion.

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

**Verified:** <exact commands and counts; manual checks with evidence>

**Decisions:** <judgment calls and deviations from the documents, each with
the why — "none" when the ticket went as written>

**Owed:** <anything deferred and which ticket inherits it — "Nothing" if
genuinely nothing, never omitted. `brief` hands every non-Nothing line to
future workers until a `**Resolves owed:**` line closes it, so write it to
be read alone, and check the named carrier can structurally reach the thing
— an owed check was once handed to a lane that never touches the step it
was meant to verify>
```

When this ticket discharges an owed item from an earlier entry, say so on its
own line — this is what removes it from every future brief:

```markdown
**Resolves owed:** <ID of the entry that recorded it> — <how it was discharged>
```

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
other in the same commit. Pick the tier yourself and say which; when in doubt,
take the higher one. (The unattended driver floors the tier in code from the
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
recurring, or rides an already-planned change.

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
