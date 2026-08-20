---
name: retro
description: Close the loop on a finished epic — mine its status log, review addenda and shipped work for lessons, then propose updates to instruction files, planning rules, and leftover owed work. Use when the user runs /flow:retro [epic] or when an epic's tickets have all shipped.
---

# Retro: $ARGUMENTS

An epic that ships code and teaches nothing was only half harvested. The
lessons are already written down — in the status log, the review addenda, the
dispositions — because the flow forced them to be. A retro is where they stop
being diary entries and start being rules.

The retro produces **a report and proposals**, then stops at a gate. Nothing
is edited without approval, and what is approved ships through the normal
path. The mining runs in a **fresh-context agent** (step 2); the approval
gate and the shipping stay with the invoking session.

## 1. Resolve the epic and check it is over

```bash
node "${CLAUDE_PLUGIN_ROOT}/scripts/tickets.mjs" list $ARGUMENTS --json
```

`$ARGUMENTS` is an epic name; with none, and if the board shows exactly one
epic with nothing left to start, use that one — otherwise ask.

If tickets are still open, say which and stop, unless the user explicitly wants
a mid-epic retro — that is legitimate for a long epic, but it is their call.
The standing quick epic is the permanent exception: it never finishes, so
`/flow:retro quick` is always a mid-epic retro, and it is also the **era
rollover** door (step 6) — the only sanctioned way the quick epic's
documents get shorter.

## 2. Spawn the miner — fresh context

**If the prompt that launched you says a retro session spawned you, skip
this step — you are the miner:** execute steps 3 through 5's drafting
exactly as written, return the report and proposals, and spawn no miner of
your own.

The invoking session is rarely neutral about this epic: it is often the same
session that planned it or ran its tickets, and it carries exactly the
opinions the record is supposed to be examined against — the reason a
ticket's implementer is a fresh-context worker (the ticket skill's step 0),
applied to mining instead of implementing. So the invoking session mines
nothing itself.

First fetch the epic's paths — step 1's `list` output carries none, and
constructing `epics/<name>/…` by hand is the relative-path guessing the
ticket skill forbids:

```bash
node "${CLAUDE_PLUGIN_ROOT}/scripts/tickets.mjs" epics --json
```

This epic's entry carries `ticketsDoc`, `statusDoc`, `contextDir` and
`repoRoot` as absolute paths; `contextDir` is `null` when the epic has no
`context/` directory.

Spawn a fresh-context **miner** with the Agent tool — a general agent, full
toolset, empty context — telling it: a retro session spawned it for this one
epic; execute steps 3 through 5's drafting of the `flow:retro` skill exactly
as written (give it this skill file's absolute path) and return the finished
report and proposals as its report; it edits no files, creates no tickets,
and asks the user nothing — the approval gate at the end of step 5 and the
shipping in step 6 belong to the invoking session, never to the miner. Hand
it the epic name, the absolute `ticketsDoc`, `statusDoc` and `repoRoot`,
`contextDir` when it is not null, and the default branch name from step 1's
output — its cwd may move mid-task, and relative paths break there.

## 3. Read the whole record

The full `status.md` including every addendum, `tickets.md` as it ended up,
anything in `context/`, and the shipped work itself:
`git -C <repoRoot> log origin/<default> --oneline | grep <epic's IDs>` —
anchor git to `repoRoot`, since your cwd may sit outside the checkout. The
instruction files for the areas the epic touched, as they are **now**, read
from under `repoRoot`.

## 4. Mine it — five questions

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
- **What does the codebase owe the documents — and the documents the
  codebase?** The questions around this one mine the record; this one mines
  the delta the record never wrote down. Compare what actually shipped (the
  epic's ID-prefixed commits, read from git) against `tickets.md`'s
  promises, both ways: scope that quietly did not ship with no Owed line
  recording the debt, behaviour that shipped beyond any ticket's scope, and
  instruction files the shipped work made stale. Each gap becomes a draft
  ticket or an instruction-file edit in the proposals — a gap only the diff
  knows about is debt with no ledger entry, and this question is the only
  door it enters through.
- **What did planning get wrong?** Tickets that blew past their size, criteria
  that turned out uncheckable, an order that backfired, scope lines that failed
  to stop a wander — compare `tickets.md`'s promises against the log's
  outcomes. Sort these into: fixes to how *this project* plans (ground rules),
  and lessons that transfer to *any* project — flag the transferable ones to
  the user as candidates for the methodology itself.

## 5. Propose — the miner drafts, the invoking session gates

Draft, ready to hand back unchanged: proposed instruction-file edits as
concrete before/after lines, owed work as draft ticket sections ready to
append, planning lessons with the evidence
(quote the log), the epic's token spend — each ticket counted **once**,
from wherever its lane recorded the figure. An attended ticket carries it
in its entry's **Tokens** line and its review addendum (the addendum rides
after the entry because the entry is committed before any review runs — a
sum of the Tokens lines alone silently drops every reviewer). A driver-run
ticket's entry and addendum deliberately read `recorded in the run
record`: the **run record's Tokens line** is that ticket's figure — the
run lane's only token record, summed by the session from the run's own
transcripts, because no agent can see its own counter. Never sum a ticket
from both places. Name any `unknown` figures rather than counting them as
zero (planning evidence for future sizing, never a gate) — and anything
transferable beyond this project.

Back in the invoking session: show the miner's report to the user
**unedited** — disagreeing with a finding is a comment to raise at the gate,
never an edit to the evidence. Then **ask, and wait.** The gate is the
human's, held in their own session; the miner never holds it.

## 6. After approval, ship the lessons the normal way

- Append one final section to the status log — `## Retro — <YYYY-MM-DD>` — with
  the lessons and where each one went. Append-only as ever; h2 does not collide
  with the parsed ticket headings.
- **Instruction-file edits and the retro entry ship via `/flow:quick`** — they
  must reach the default branch through a reviewed pull request like any other
  change. Do not commit them to the default branch directly.
- Leftover owed work becomes tickets: appended to a live epic's `tickets.md`
  where one owns the area, or a new `/flow:epic` where none does. Never leave
  it as a memory of this conversation.
- **Optionally, archive the closed epic**: `git mv epics/<name>
  epics/_archive/<name>`, shipped through the same reviewed pull request as
  the retro entry. The board only discovers epics directly under `epics/`, so
  the archived epic drops off it — safe **only now**, because the two bullets
  above have just moved its owed items into live tickets and its lessons into
  instruction files; archiving before that silently deletes the debt ledger.
  Moving is not deleting (the log stays in git, and shipped detection reads
  commit subjects, not folders). The standing `epics/quick/` is never
  archived whole — it takes the era rollover below instead.
- **For the standing quick epic, the archive step is an era rollover.** The
  quick epic never finishes, so its log and ticket doc grow without bound,
  and both ride every quick branch and pull-request diff — `brief` fixed
  what a worker must *read*; nothing fixed what every branch must *carry*.
  After the bullets above have converted its open owed items into tickets
  and its lessons into instruction files — the gate, because the archive
  drops off the board and an unconverted owed item would vanish from every
  future brief:

  ```bash
  git mv epics/quick epics/_archive/quick-<YYYY-MM-DD>
  ```

  Then recreate `epics/quick/` from the quick skill's step 2 template, with
  one extra ground rule naming the ID floor — `Q-IDs continue at Q-<n+1>`,
  where `Q-<n>` is the archived era's highest number — because the archived
  headings are no longer read and a reused number would read as already
  shipped the moment the board checks main's commit subjects (the same rule
  Q-18's entry recorded when the folder was once recreated by hand). Ship
  the rollover through the same reviewed pull request as the retro entry.
  Nothing is summarized and nothing rewritten: the era stays verbatim in
  the archive; the working copy just stops paying for it.

Then stop. An epic is closed when its lessons are in documents that travel —
not when someone remembers them.
