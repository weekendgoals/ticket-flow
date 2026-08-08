---
name: quick
description: Run one small, low-risk piece of work — a bugfix, a tweak, a chore — through the full ticket loop without planning an epic. Size- and risk-gated; auth, migrations, secrets and other consequential work is routed to /flow:epic at any size. Use when the user runs /flow:quick <description>, or asks for a small change that still deserves review and a record.
---

# Quick ticket: $ARGUMENTS

Small work skips the epic ceremony — the planning session, the sign-off gate,
the epic branch. It does **not** skip the loop: a written scope, verification,
fresh-eyes review, a status entry, a pull request. Work that bypasses the flow
entirely gets none of those, and "bypass entirely" is what people choose when
the only alternative is ceremony. This command is the third option.

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

Release mode: serial

Status log: `epics/quick/status.md`. Run a ticket with `/flow:ticket <ID>`.

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

## 4. Become the supervisor — the ticket loop's lane fork

What quick skips is planning ceremony; execution hygiene it never skips. The
session that wrote the ticket has already argued for its own scoping — and
often carries earlier work besides — so it does not implement. Follow the
**`/flow:ticket`** skill's **step 0**, with quick's steps 1–3 standing in for
the parts already done: the ticket is written, and `q-<n>` exists with the
plan committed.

**Default — supervisor.** From this point the session makes no file edits.
Spawn the fresh-context worker as step 0 directs, scoping ticket steps 1–3
out of its prompt (step 0 lets a spawn prompt scope steps). Tell it: a
supervisor spawned it for this one ticket; `ticketsDoc` =
`epics/quick/tickets.md`, `statusDoc` = `epics/quick/status.md` — create the
status log with the standard append-only preamble on first use; the branch
`q-<n>` already exists with the plan committed — work on it, cut nothing;
the base for review and the pull request is the default branch. The worker
executes ticket steps 4–6 — implement, verify with counts, append and commit
the status entry — and stops with a report. The rest runs as the ticket
skill writes it: the supervisor hires the reviewer (step 7 — never the
worker; the party under review does not pick its own judge), hands the
findings and the reviewer's model and effort back to the same worker
(step 8), the worker pushes and opens the pull request (step 9), and
everything stops there (step 10, attended).

**`--interactive`** keeps the in-session lane: run ticket steps 4 to the end
yourself. It costs what any interactive ticket costs: the session guard
marks the session at invocation — same marker, same once-per-session rule —
and a marked session is refused every later `--interactive` run, quick or
ticket alike, toward supervisor mode or `/clear`. The guard watches both
doors because a gate is verified at the door its actor walks through.

Everything in the ticket skill binds as usual: ID-prefixed commits, counts
not adjectives, every finding dispositioned in writing, and a full stop at
the open pull request.
