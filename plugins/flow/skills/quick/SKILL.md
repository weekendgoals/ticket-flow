---
name: quick
description: Run one small, low-risk piece of work in-session — a bugfix, a tweak, a chore — with a durable ticket record and a pull request, at a fraction of the epic lane's cost. Size- and risk-gated; auth, migrations, secrets and other consequential work is routed to /flow:epic at any size. Use only when the user explicitly runs /flow:quick <description> or asks for the Flow quick lane by name — an ordinary small request, without that, is implemented directly with no Flow ceremony.
---

# Quick ticket: $ARGUMENTS

The cheap lane. Small work skips the epic ceremony — the planning session, the
sign-off gate, the epic branch — **and** the execution ceremony: no supervisor,
no fresh-context worker, no reviewer by default. What it keeps is exactly what
pays for itself at this size: a written scope with a binding "Not in scope",
verification with counts, a short append-only record, and a pull request a
human reviews. The expensive guarantees live in `/flow:ticket` and
`/flow:epic`; sending a warning-string fix through them spends ~150k tokens
buying confidence the pull request already provides.

Flow is opt-in: this skill runs because the user invoked it. A request that
did not invoke it is ordinary direct work — implement, verify, report, no
ticket document.

`$ARGUMENTS` is the request in prose. The conversation so far is also input.

## 1. Check it is actually small — and actually low-risk

Quick work fits **all** of these:

- One area of the repository, one concern.
- Acceptance criteria stateable in one or two bullets.
- A reviewable diff — well under ~400 changed lines.
- No dependency on other unshipped work.

Size is not the only gate. **Some work is never quick, at any size:**

- an authentication or authorization boundary
- secrets, keys, or cryptography
- a schema or data migration, or anything that deletes or rewrites data
- new network exposure — a new public endpoint, a widened CORS rule, an
  opened port
- payment or billing behaviour
- anything that can fail open

A two-line change to an auth check is more dangerous than a 300-line internal
refactor; line count measures neither blast radius nor reversibility.

This list is coupled to the ticket skill's `xhigh` review tier — the same
consequences, measured at two doors. **A trigger added to either list is added
to the other in the same commit**; they diverged silently once and that cost a
ticket to reconcile.

If a size bullet fails **or** a risk trigger matches, stop and say which:
this goes through `/flow:epic` — the plan review and the sign-off gate are the
point for consequential work, not overhead — even if the epic holds a single
ticket. Do not "quickly" start it anyway.

## 2. Write the ticket into the standing quick epic

Quick tickets live in `epics/quick/tickets.md` — a normal epic folder that
accumulates one-off work, so the board derives its state like everything
else's. If it does not exist, create it:

```markdown
# Quick — one-off tickets

Source: standing epic for small work; each ticket carries its own context.

Delivery: incremental

Status log: `epics/quick/status.md`. Run a ticket with `/flow:quick` (the
in-session lane) or `/flow:ticket <ID>` (the supervised lane, for a quick
ticket someone wrote down to run later).

## Ground rules for every ticket in this epic

- Every ticket here is self-contained. Work that depends on another unshipped
  ticket does not belong in this epic.
```

Read the root agent instructions and the instruction file of the area you are
about to touch — quick does not mean unread. Then append a section, using the
next free `Q-<n>` (read the existing headings for the highest `n`):

```markdown
## Q-<n> — <short name>

**Scope.**
- <what to change, concretely>

**Not in scope.** <the tempting adjacent work>

**Acceptance criteria.**
- <test command + expected result>
```

All three parts are still required — compact is fine, absent is not. **"Not in
scope" matters more here, not less**: a small ticket is where the adjacent
temptation is nearest, and it is what stops a one-line fix becoming a refactor.

Show the user the ticket in a few lines and continue — **no sign-off gate**.
The ticket text lands in the pull request, so a wrong reading of the request is
caught there, cheaply.

## 3. Branch from the default branch

```bash
git fetch origin --prune
git checkout -b q-<n> origin/<default-branch>
```

No epic branch exists or is needed: the branch is cut from the default branch
and carries the `epics/quick/` changes itself, so the documents ship with the
code in the same pull request. Commit the ticket-doc addition first:
`Q-<n>: plan`.

If the previous quick ticket still has an open pull request, that is fine —
quick tickets are independent by ground rule and do not stack.

## 4. Implement — in this session

This lane implements in the session that wrote the ticket. That is a
deliberate trade: the fresh-context worker's independence is worth its cost
on epic tickets and not on a bounded low-risk diff — here the epistemic
boundary is the pull request, plus the reviewer of step 6 when behaviour
changes. (The session guard marks the session at invocation for the same
reason it marks an interactive ticket: this session now carries
implementation context, and a later `/flow:ticket --interactive` in it is
refused. Supervisor-mode tickets, and further quick tickets, stay open.)

The execution rules of the ticket skill still bind:

- **Stay inside the ticket's scope.** "Not in scope" is binding.
- **Prefix every commit subject with the ticket ID** — `Q-7: fix the warning
  text`. This is load-bearing: `tickets.mjs` reads subjects off the default
  branch to decide what has shipped.
- **Stage only your own hunks.** Never `git add -A` or `git add .`.
- Update the agent instruction files in the same commit as any change they
  describe.

## 5. Verify, then log — briefly

Run the ticket's acceptance criteria plus the standing checks for what you
touched, reading the commands from the project's instruction files. Report
**counts** — "api 217/217 passed", never "tests pass". A check that cannot
run here is said so and recorded as owed; never imply it passed.

Append the status entry to `epics/quick/status.md`. If the file does not
exist, open it with this exact preamble — the same block the epic skill's
template and the ticket skill's step 6 carry; **one rule, three documents: a
change to any copy moves the others in the same commit**:

```markdown
# Quick epic — status log

Append-only record of finished tickets. Tickets: `epics/quick/tickets.md`.

**Rules.** Append only. Corrections are new dated addenda beneath the entry they
correct, never edits. Report counts, not adjectives. The **Owed** line is
required even when empty.
```

The **entry** heading is parsed — match it exactly, then keep the body to a
few lines: **Built / Mode / Tokens / Verified / Decisions / Owed**, per the
ticket skill's step 6 template. `Mode:` is `quick — in-session
(/flow:quick)`; Decisions records only deviations and judgment calls, not
narration — git already records the files and commits.

```markdown
### Q-<n> — <name> — <YYYY-MM-DD> — DONE
```

If this ticket discharges an owed item an earlier entry recorded, add
`**Resolves owed:** <ID> — <how>` on its own line — that marker is what
removes the item from every future brief (ticket skill step 6 defines it).

Commit the entry with the work.

## 6. Review — only when behaviour changed, and cheaply

- **No behaviour change** means one thing: the diff touches **nothing any
  runtime, parser, test, or agent reads** — documentation prose and code
  comments, and only those. Then **skip the reviewer**: the pull request is
  the review; say so in the PR body ("prose-only; no separate review").
- **Everything else is a behaviour change**, including the shapes that look
  harmless: a user-facing string (code and tests match on strings),
  configuration (config *is* behaviour), CLI output (someone's script
  parses it), and skill or agent Markdown (in a plugin, the Markdown is the
  program). For these, spawn `flow:ticket-reviewer` with the Agent tool on
  a **cost-efficient model** (a mid-tier model, not the strongest;
  `effort: medium`), following the `/flow:review` skill, on the commit range
  `origin/<default-branch>..HEAD`. Give it the ticket section and the
  instruction files for the touched area. It reports; it does not fix.
- When unsure which side a diff falls on, it is a behaviour change — the
  cheap reviewer costs little; a skipped review of live behaviour can cost
  the ticket.
- Risk-trigger work cannot reach this step — step 1 already routed it to
  `/flow:epic`, where the full-price review tier lives.

Fix Important findings as new commits (`Q-<n>: … (review fix)`), re-run the
affected checks, and add one dated addendum line to the entry with the
outcome and the reviewer's token figure **as the harness reported it when
the reviewer stopped** — the session that spawned the reviewer observes its
spend; the reviewer itself is never asked, because an agent cannot see its
own counter (`unknown` when the harness exposed nothing). **A nit does not become a ticket by
default** — fix it here if it is trivial and in scope, otherwise note it in
the addendum for the retro; a nit earns a ticket only when it affects users,
creates real maintenance risk, or keeps recurring.

## 7. Push, open the pull request, stop

```bash
git push -u origin q-<n>
gh pr create --base <default-branch> --title "Q-<n>: <title>" --body "<body>"
```

The body carries: what changed and why, the acceptance criteria with counts,
the review outcome (or "prose-only; no separate review"), and any deploy
precondition. Print the URL and stop — a human merges, and nothing runs
after the merge.
