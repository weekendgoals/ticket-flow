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

## 4. Run the rest of the ticket loop

Follow the **`/flow:ticket`** skill from step 4 (Implement) to the end, with:

- `ticketsDoc` = `epics/quick/tickets.md`, `statusDoc` = `epics/quick/status.md`
  — create the status log with the standard append-only preamble on first use;
- branch `q-<n>`, base = the default branch — what the review diffs against and
  the pull request targets.

Everything there binds as usual: ID-prefixed commits, counts not adjectives,
the reviewer spawned fresh at the strongest available model, every finding
dispositioned in writing, and a full stop at the open pull request.
