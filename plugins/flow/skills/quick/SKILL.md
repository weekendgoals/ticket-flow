---
name: quick
description: Run one small, low-risk piece of work in-session — a bugfix, a tweak, a chore — with a durable ticket record and a pull request, at a fraction of the epic lane's cost. Size- and risk-gated; auth, migrations, secrets and other consequential work is routed to /flow:epic at any size. Use only when the user explicitly runs /flow:quick <description> or asks for the Flow quick lane by name — an ordinary small request, without that, is implemented directly with no Flow ceremony.
---

# Quick ticket: $ARGUMENTS

The cheap lane: no planning session, no sign-off gate, no epic branch, no
supervisor, no fresh-context worker, no reviewer by default. What it keeps
is what pays for itself at this size — a written scope with a binding "Not
in scope", verification with counts, a short append-only record, and a pull
request a human reviews. Flow is opt-in: this skill runs because the user
invoked it. `$ARGUMENTS` is the request in prose; the conversation is also
input.

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

Line count measures neither blast radius nor reversibility. This list is
coupled to the ticket skill's `xhigh` review tier — the same consequences at
two doors. **A trigger added to either list is added to the other in the
same commit.**

If a size bullet fails **or** a risk trigger matches, stop and say which:
this goes through `/flow:epic`, even as a single-ticket epic. Do not
"quickly" start it anyway.

## 2. Write the ticket into the standing quick epic

Quick tickets live in `epics/quick/tickets.md`, a normal epic folder the
board reads like any other. If it does not exist, create it:

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

Read the root agent instructions and the instruction file of the area you
are about to touch. Then append a section using the next free `Q-<n>` — the
highest of the existing headings **and** the preamble's `Q-IDs continue at
Q-<n>` ground rule when one exists (after an era rollover the archived
numbers are absent from this document, and a reused number would read as
already shipped off main's commit subjects):

```markdown
## Q-<n> — <short name>

**Scope.**
- <what to change, concretely>

**Not in scope.** <the tempting adjacent work>

**Acceptance criteria.**
- <test command + expected result>
```

All three parts are required — compact is fine, absent is not. **"Not in
scope" matters more here**: a small ticket is where the adjacent temptation
is nearest. Show the user the ticket in a few lines and continue — **no
sign-off gate**; the ticket text lands in the pull request, where a wrong
reading is caught cheaply.

## 3. Branch from the default branch

```bash
git fetch origin --prune
git checkout -b q-<n> origin/<default-branch>
```

No epic branch: the branch carries the `epics/quick/` changes itself, so the
documents ship with the code. Commit the ticket-doc addition first:
`Q-<n>: plan`. A previous quick ticket's open pull request is fine — quick
tickets are independent by ground rule and do not stack.

## 4. Implement — in this session

This lane implements in the session that wrote the ticket: the
fresh-context worker's independence is worth its cost on epic tickets, not
on a bounded low-risk diff. The session guard marks the session at
invocation, so a later `/flow:ticket --interactive` in it is refused;
supervisor-mode tickets and further quick tickets stay open.

The ticket skill's execution rules bind:

- **Stay inside the ticket's scope.** "Not in scope" is binding.
- **Prefix every commit subject with the ticket ID** — `Q-7: fix the warning
  text`. The board reads subjects off the default branch to decide what has
  shipped.
- **Stage only your own hunks.** Never `git add -A` or `git add .`.
- Update the agent instruction files in the same commit as any change they
  describe.

## 5. Verify, then log — briefly

Run the acceptance criteria plus the standing checks for what you touched,
reading the commands from the project's instruction files. Report **counts**
— "api 217/217 passed", never "tests pass". A *demonstrate:* criterion is
driven for real, the observed screen or output recorded as evidence. A
criterion with `CHECK:` / `EXPECT:` lines runs through
`node "${CLAUDE_PLUGIN_ROOT}/scripts/tickets.mjs" check Q-<n>`, its ledger
pasted as the counts. A check that cannot run here is said so and recorded
as owed; never imply it passed.

Append the status entry to `epics/quick/status.md`. If the file does not
exist, open it with this exact preamble — the block the epic skill's
template and the ticket skill's step 6 carry; **one rule, three documents: a
change to any copy moves the others in the same commit**:

```markdown
# Quick epic — status log

Append-only record of finished tickets. Tickets: `epics/quick/tickets.md`.

**Rules.** Append only. Corrections are new dated addenda beneath the entry they
correct, never edits. Report counts, not adjectives. The **Owed** line is
required even when empty.
```

The **entry** heading is parsed — match it exactly — then keep the body to
the ticket skill's step 6 fields: **Built / Mode / Tokens / Verified /
Decisions / Owed**, with `Mode:` = `quick — in-session (/flow:quick)` and
Decisions recording only deviations, not narration:

```markdown
### Q-<n> — <name> — <YYYY-MM-DD> — DONE
```

If this ticket discharges an owed item an earlier entry recorded, add
`**Resolves owed:** <ID> — <how>` on its own line — that marker removes the
item from every future brief. Commit the entry with the work.

**If the log now runs past roughly 25 entries (or ~1,000 lines), say so to
the user**: the quick epic is due an **era rollover**, which `/flow:retro
quick` performs (owed items become tickets, the era is archived whole, a
fresh quick epic continues the ID sequence). The log and ticket doc ride
every quick branch and pull-request diff, so their growth taxes every
future ticket. Never roll over here yourself — the rollover is safe only
after the retro has converted the open owed items.

## 6. Review — only when behaviour changed, and cheaply

- **No behaviour change** means the diff touches **nothing any runtime,
  parser, test, or agent reads** — documentation prose and code comments,
  only. Then **skip the reviewer**: the pull request is the review; say so
  in the PR body ("prose-only; no separate review").
- **Everything else is a behaviour change**, including what looks harmless:
  a user-facing string (tests match on strings), configuration, CLI output
  (someone's script parses it), skill or agent Markdown (in a plugin, the
  Markdown is the program). Spawn `flow:ticket-reviewer` with the Agent tool
  on a **cost-efficient model** (a mid-tier model, `effort: medium`), told
  to follow the `/flow:review` skill.

  **The packet is fixed, and it is all the reviewer gets** — this session
  implemented the diff, which makes it the biased narrator the fresh
  context exists to exclude:

  - the commit range: `origin/<default-branch>..HEAD`;
  - `node "${CLAUDE_PLUGIN_ROOT}/scripts/tickets.mjs" brief Q-<n>` — ground
    rules, Scope, **Not in scope** (work outside it is a finding),
    Acceptance criteria, open owed items;
  - this ticket's **own** status entry, sliced from the log:
    `awk '/^### /{f=/^### Q-<n> /} f' epics/quick/status.md`;
  - the instruction files for the touched areas.

  **Nothing else rides along**: no summary of what you built, no reasoning,
  no conversation content. It reports; it does not fix.
- When unsure which side a diff falls on, it is a behaviour change.
- Risk-trigger work cannot reach this step — step 1 routed it to
  `/flow:epic`.

Fix Important findings as new commits (`Q-<n>: … (review fix)`), re-run the
affected checks, and add one dated addendum line to the entry with the
outcome and the reviewer's token figure **as the harness reported it when
the reviewer stopped** (`unknown` when it exposed nothing; the reviewer is
never asked — it cannot see its own counter). **A nit does not become a
ticket by default**: fix it here if trivial and in scope, otherwise note it
in the addendum for the retro.

## 7. Push, open the pull request, stop

```bash
git push -u origin q-<n>
gh pr create --base <default-branch> --title "Q-<n>: <title>" --body "<body>"
```

The body carries: what changed and why, the acceptance criteria with counts,
the review outcome (or "prose-only; no separate review"), and any deploy
precondition. Print the URL and stop — a human merges, and nothing runs
after the merge.
