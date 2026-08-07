---
name: ticket
description: Take one ticket from reading it to an open pull request — branch, implement, log, commit, review, fix, push, PR. Use when the user runs /flow:ticket <ID> (e.g. /flow:ticket SEC-3).
---

# Ticket $ARGUMENTS

One command, one ticket, ending at a pull request the user reviews and merges.

You are working from documents, not conversation history. Assume you know
nothing about this epic that is not written down.

## 1. Resolve it

```bash
node "${CLAUDE_PLUGIN_ROOT}/scripts/tickets.mjs" find $ARGUMENTS --json
```

This returns the epic's `ticketsDoc`, `statusDoc`, `contextDir`, `repoRoot` and
the `branch` to create, as **absolute paths**. Never hardcode a path, and never
turn them back into relative ones.

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
2. `statusDoc` — the whole thing. This is what previous tickets did and left owed.
3. The preamble of `ticketsDoc` — ground rules bind every ticket in the epic, and
   the **Release mode** line decides step 3 and step 9.
4. The section for **$ARGUMENTS** — Scope, Not in scope, Acceptance criteria.
5. Anything in `contextDir` the ticket points at.

Where two documents disagree, or the code contradicts a document, **stop and
report it. Do not adapt silently.**

## 3. Branch — from the right base

```bash
git fetch origin --prune
```

There is one epic branch, `epic/<epic-name>`. `/flow:epic` created it and
committed the epic's documents there. Which base you use depends on the release
mode and on whether those documents have reached the default branch yet.

**First, have the epic's documents shipped?**

```bash
git ls-tree origin/<default-branch> "epics/<epic-name>/tickets.md"
```

Empty output means they have not. **Then this ticket must branch from
`epic/<epic-name>`**, whatever the release mode — otherwise the epic's ticket
doc, status log and context never reach the default branch, and the board goes
blind to the whole epic. This is normally ticket one.

**Serial mode (the default), documents already shipped.** Start from the merged
default branch, but check the previous ticket actually landed:

```bash
gh pr list --state open --json number,title,headRefName
```

- No open pull request from this epic: `git checkout <default-branch> && git pull
  && git checkout -b <branch>`.
- The **previous ticket in this epic** still has an open pull request: **stop and
  say so.** Do not silently branch off unmerged work — that is how an unplanned
  stack forms. The user either merges it or tells you to stack deliberately.

**Integration mode.** Every ticket branches from the epic branch and returns to
it:

```bash
git checkout epic/<epic-name>
git pull --ff-only 2>/dev/null || true
git checkout -b <branch>
```

Keep `epic/<epic-name>` current with the default branch as the epic runs, or the
release merge becomes its own big-bang.

**Whatever the mode, the base branch you used is what step 7 diffs against and
step 9 targets.** Note it now.

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
file if it does not exist.

The heading is parsed, so match it exactly:

```markdown
### <ID> — <name> — <YYYY-MM-DD> — DONE
```

`DONE`, or `BLOCKED` / `ABANDONED` if you stopped — a ticket that died still
gets an entry saying why.

```markdown
**Built:** <what exists now that didn't, in enough detail that the next session
needs no archaeology>

**Files touched:** <list>. Branch `<branch>`, cut from `<base>`.

**Verified:** <exact commands and counts; manual checks with evidence>

**Decisions:** <every judgment call, with the why>

**Owed:** <anything deferred and which ticket inherits it — "Nothing" if
genuinely nothing, never omit the line>
```

Write for someone who was not there: no codenames, no "as discussed", no
reference to this conversation.

Commit it with the rest. **Commit before the review runs** — the reviewer reads a
commit range, and that is what keeps the review auditable against exactly what
was reviewed.

## 7. Review — empty context, strongest model, the review skill

The session that wrote the code cannot review it. It will agree with itself.

Spawn the reviewer with the **Agent** tool:

- `subagent_type: "flow:ticket-reviewer"`, and `model`: the **strongest model
  available**, regardless of what this session is running — review is where
  capability pays. Pass it explicitly (`opus` at the time of writing; if that is
  not available, the strongest that is).
- `effort`: scale it to the diff. `medium` for docs or config with no behavioural
  change; `high` for any normal implementation ticket; `xhigh` for authentication
  or authorization boundaries, secrets, crypto, network exposure, migrations,
  anything that deletes or rewrites data, payments or billing, or anything that
  can fail open. This is the same list that gates entry to `/flow:quick` —
  consequence is measured once, at both doors. Pick it yourself and say which;
  do not ask.

Tell it to follow **the `/flow:review` skill** and give it:

- the commit range — `git merge-base origin/<base-branch> HEAD`..`HEAD`, using
  the base branch you noted in step 3,
- `ticketsDoc` (the epic ground rules **and** this ticket's Acceptance criteria
  and Not in scope — straying outside scope is a finding),
- `statusDoc`,
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

Append the outcome to `statusDoc` as a dated addendum — never edit the original
entry:

```markdown
**Addendum — review — <YYYY-MM-DD> — <model>/<effort>:** <findings. What was
fixed, in which commit, with counts. What was not fixed, each with its reason.
Say "nothing deferred" explicitly if that is true.>
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

`<base-branch>` is the base you noted in step 3 — the default branch, or
`epic/<epic-name>` in integration mode, or `epic/<epic-name>` for the first
ticket of any epic whose documents have not shipped yet.

The pull request body is the only thing read before this ships, so it carries:
what changed and why, the acceptance criteria with evidence and counts, the
review summary, and any precondition that must exist before deploy (a new
environment variable, a migration, a script that runs after).

Do not add Claude as a co-author. **Do not merge it, ever** — no `gh pr merge`,
no `git merge`, no pushing to the default branch. A human merges in the GitHub
UI. A single-ticket pull request titled `<ID>: <title>` may be squashed — the
squash commit inherits the title, so `tickets.mjs` still sees the ID. What must
**never** be squashed is an integration release pull request: it carries many
tickets, and squashing collapses their subjects into one, making every ticket
but one read as unshipped.

## 10. Stop

Print the pull request URL and
`node "${CLAUDE_PLUGIN_ROOT}/scripts/tickets.mjs" next`.

Then stop. Do not start the next ticket. There is nothing to run after the merge.
