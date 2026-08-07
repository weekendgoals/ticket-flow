---
name: retro
description: Close the loop on a finished epic — mine its status log, review addenda and shipped work for lessons, then propose updates to instruction files, planning rules, and leftover owed work. Use when the user runs /flow:retro [epic] or when an epic's tickets have all shipped.
---

# Retro: $ARGUMENTS

An epic that ships code and teaches nothing was only half harvested. The
lessons are already written down — in the status log, the review addenda, the
dispositions — because the flow forced them to be. A retro is where they stop
being diary entries and start being rules.

You produce **a report and proposals**, then stop at a gate. Nothing is edited
without approval, and what is approved ships through the normal path.

## 1. Resolve the epic and check it is over

```bash
node "${CLAUDE_PLUGIN_ROOT}/scripts/tickets.mjs" list $ARGUMENTS --json
```

`$ARGUMENTS` is an epic name; with none, and if the board shows exactly one
epic with nothing left to start, use that one — otherwise ask.

If tickets are still open, say which and stop, unless the user explicitly wants
a mid-epic retro — that is legitimate for a long epic, but it is their call.

## 2. Read the whole record

The full `status.md` including every addendum, `tickets.md` as it ended up,
anything in `context/`, and the shipped work itself:
`git log origin/<default> --oneline | grep <epic's IDs>`. The instruction files
for the areas the epic touched, as they are **now**.

## 3. Mine it — five questions

- **Did it work?** The epic's **Outcome** line named an observable change, its
  evidence, and a reversal condition — check them. Three honest answers:
  achieved (cite the evidence), not achieved (that is a planning finding, not
  a failure to hide — say what the reversal condition implies), or not yet
  assessable (say what evidence is still to arrive, and when to look again).
  An epic that shipped every ticket and changed nothing observable is the
  most expensive kind of success. Older epics without an Outcome line: say
  so and move on — do not retrofit one.
- **What is still owed?** Collect every **Owed** line and every review finding
  dispositioned as "pre-existing, handed to ticket X" or "out of scope, owned
  later". For each: did a shipped ticket actually inherit it? What survives is
  unfinished work that currently exists nowhere but the diary.
- **What was rediscovered more than once?** A command, a quirk, a constraint
  that two or more ticket entries each had to figure out. Anything learned
  twice was documented zero times — it belongs in the instruction file of the
  area that taught it.
- **What did review keep finding?** The same class of defect in more than one
  ticket is not a ticket problem; it is a missing invariant. Propose the one
  line in the instruction file (or the epic ground-rule template) that would
  have prevented the class — that is how the reviewer's "project's own
  standards" clause accumulates substance.
- **What did planning get wrong?** Tickets that blew past their size, criteria
  that turned out uncheckable, an order that backfired, scope lines that failed
  to stop a wander — compare `tickets.md`'s promises against the log's
  outcomes. Sort these into: fixes to how *this project* plans (ground rules),
  and lessons that transfer to *any* project — flag the transferable ones to
  the user as candidates for the methodology itself.

## 4. Propose — hard gate

Show: proposed instruction-file edits as concrete before/after lines, owed work
as draft ticket sections ready to append, planning lessons with the evidence
(quote the log), and anything transferable beyond this project. **Ask, and
wait.**

## 5. After approval, ship the lessons the normal way

- Append one final section to the status log — `## Retro — <YYYY-MM-DD>` — with
  the lessons and where each one went. Append-only as ever; h2 does not collide
  with the parsed ticket headings.
- **Instruction-file edits and the retro entry ship via `/flow:quick`** — they
  must reach the default branch through a reviewed pull request like any other
  change. Do not commit them to the default branch directly.
- Leftover owed work becomes tickets: appended to a live epic's `tickets.md`
  where one owns the area, or a new `/flow:epic` where none does. Never leave
  it as a memory of this conversation.

Then stop. An epic is closed when its lessons are in documents that travel —
not when someone remembers them.
