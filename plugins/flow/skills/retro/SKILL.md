---
name: retro
description: Close the loop on a finished epic — mine its status log, review addenda and shipped work for lessons, then propose updates to instruction files, planning rules, and leftover owed work. Use when the user runs /flow:retro [epic] or when an epic's tickets have all shipped.
---

# Retro: $ARGUMENTS

An epic that ships code and teaches nothing was only half harvested. The
lessons are already in the status log, the review addenda and the
dispositions; a retro is where they stop being diary entries and start
being rules. It produces **a report and proposals**, then stops at a gate:
nothing is edited without approval, and what is approved ships through the
normal path. The mining runs in a **fresh-context agent** (step 2); the gate
and the shipping stay with the invoking session.

## 1. Resolve the epic and check it is over

```bash
node "${CLAUDE_PLUGIN_ROOT}/scripts/tickets.mjs" list $ARGUMENTS --json
```

`$ARGUMENTS` is an epic name; with none, and if the board shows exactly one
epic with nothing left to start, use that one — otherwise ask.

If tickets are still open, say which and stop, unless the user explicitly
wants a mid-epic retro. The standing quick epic is the permanent exception:
it never finishes, so `/flow:retro quick` is always mid-epic, and it is also
the **era rollover** door (step 6) — the only sanctioned way the quick
epic's documents get shorter.

## 2. Spawn the miner — fresh context

**If the prompt that launched you says a retro session spawned you, skip
this step — you are the miner:** execute steps 3 through 5's drafting
exactly as written, return the report and proposals, and spawn no miner.

The invoking session usually planned this epic or ran its tickets, and
carries exactly the opinions the record is to be examined against — so it
mines nothing itself. Fetch the epic's paths first (step 1's output carries
none, and constructing them by hand is the relative-path guessing the ticket
skill forbids):

```bash
node "${CLAUDE_PLUGIN_ROOT}/scripts/tickets.mjs" epics --json
```

Spawn a fresh-context **miner** with the Agent tool — a general agent, full
toolset, empty context — telling it: a retro session spawned it for this one
epic; execute steps 3 through 5's drafting of the `flow:retro` skill exactly
as written (give it this skill file's absolute path) and return the finished
report and proposals; it edits no files, creates no tickets, and asks the
user nothing. Hand it the epic name, the absolute `ticketsDoc`, `statusDoc`
and `runsDoc` (`epics --json` carries both; `runsDoc` may not exist yet —
epics that ran attended, and every log written before the run records were
split out of `status.md`, have no `runs.md`) and `repoRoot`, `contextDir`
when not null, and the default branch name — its cwd may move mid-task, and
relative paths break there.

## 3. Read the whole record

The full `status.md` including every addendum, the full `runs.md` when it
exists — the run records live there, and in `status.md` for epics that ran
before the split — `tickets.md` as it ended up,
anything in `context/`, and the shipped work itself:
`git -C <repoRoot> log origin/<default> --oneline | grep <epic's IDs>`. The
instruction files for the areas the epic touched, as they are **now**, read
from under `repoRoot`.

## 4. Mine it — seven questions

- **Did it work?** The **Outcome** line named an observable change, its
  evidence and a reversal condition — check them: achieved (cite the
  evidence), not achieved (a planning finding, not a failure to hide), or
  not yet assessable (say what evidence is still to arrive, and when to look
  again). Older epics without an Outcome line: say so and move on — do not retrofit
  one.
- **What is still owed?** Every **Owed** line and every review finding
  dispositioned as pre-existing or out of scope: did a shipped ticket
  actually inherit it? What survives is unfinished work that exists nowhere
  but the diary.
- **What was rediscovered more than once?** A command, a quirk, a constraint
  two or more entries each had to figure out. Anything learned twice was
  documented zero times — it belongs in the instruction file of the area
  that taught it.
- **What did review keep finding?** The same defect class in more than one
  ticket is a missing invariant. Propose the one instruction-file line (or
  ground-rule template line) that would have prevented the class.
- **What does the codebase owe the documents — and the documents the
  codebase?** Compare what shipped (the epic's ID-prefixed commits) against
  `tickets.md`'s promises, both ways: scope that quietly did not ship with
  no Owed line, behaviour that shipped beyond any ticket's scope,
  instruction files the work made stale. Each gap becomes a draft ticket or
  an instruction-file edit — only the diff knows about it.
- **What did planning get wrong?** Tickets that blew past their size,
  criteria that turned out uncheckable, an order that backfired, scope lines
  that failed to stop a wander. Sort into fixes to how *this project* plans
  (ground rules) and lessons that transfer to *any* project — flag the
  transferable ones as candidates for the methodology itself.
- **What did the run halt on, and what did each halt buy?** For every
  `### Run —` record in `runs.md` — and in `status.md`, where the epics that
  ran before the split keep theirs — its **Halted on:** line names the stop
  condition, the ticket and the stage: the halt condensed to a sentence, its
  cause classified as **work** (a defect in the implementation), **plan** (a
  defective, vacuous or decorative CHECK, a wrong assumption in
  `tickets.md`), **plugin/environment** (the driver, a spawn failure, a
  session limit, a buffer, a tooling fault) or **policy** (a budget or bounds
  trip), what the human did to resume, and whether the later record shows the
  stop retired a real risk or fired on a clean state. Every halt costs a human
  a resume, so a stop that keeps firing clean is paid for and buys nothing: a
  **policy** trip whose later re-review found nothing is a proposal against
  the policy, and a **plugin/environment** halt is a candidate ticket for the
  plugin's own repository — flag both as transferable, the way the question
  above flags transferable planning lessons. The classification is yours to
  make, not the record's to carry: the run that stopped could not judge its
  own stop, and you read the records you did not write. An epic run attended,
  with no `### Run —` records: say so and move on.

## 5. Propose — the miner drafts, the invoking session gates

Draft, ready to hand back unchanged: instruction-file edits as concrete
before/after lines, owed work as draft ticket sections ready to append,
planning lessons with the evidence (quote the log), a **Halts** section —
one line per halt event with its class, what the human did to resume, and
whether it retired a real risk or fired on a clean state, the transferable
ones named as such (a policy proposal, a plugin-repository ticket), and
"none: this epic ran attended" when there are no run records — because a
stop that fires clean charges a human for a resume and is invisible in every
other section — and the epic's token spend from
`node "${CLAUDE_PLUGIN_ROOT}/scripts/tickets.mjs" spend <epic>`
— the derived ledger, each ticket counted **once** from wherever its lane
recorded it (an attended ticket's entry and addendum, a driver-run ticket's
run record), with `unknown` figures named rather than counted as zero. Do
not sum the log by hand; if a figure the log carries is missing from the
ledger, that is a finding about the log's shape.

Back in the invoking session: show the miner's report to the user
**unedited** — disagreeing with a finding is a comment at the gate, never an
edit to the evidence. Then **ask, and wait.**

## 6. After approval, ship the lessons the normal way

- Append one final section to the status log — `## Retro — <YYYY-MM-DD>` —
  with the lessons and where each one went. Append-only; h2 does not collide
  with the parsed ticket headings.
- **Instruction-file edits and the retro entry ship via `/flow:quick`** —
  through a reviewed pull request, never committed to the default branch
  directly.
- Leftover owed work becomes tickets: appended to a live epic's `tickets.md`
  where one owns the area, or a new `/flow:epic` where none does. Never
  leave it as a memory of this conversation.
- **Optionally archive the closed epic**: `git mv epics/<name>
  epics/_archive/<name>`, in the same pull request. The board only discovers
  epics directly under `epics/`, so the archived epic drops off it — safe
  **only now**, after the two bullets above have moved its owed items into
  live tickets; archiving first silently deletes the debt ledger. Moving is
  not deleting: the log stays in git, and shipped detection reads commit
  subjects, not folders. The standing `epics/quick/` is never archived
  whole — it takes the era rollover instead.
- **For the standing quick epic, the archive step is an era rollover.** After
  the bullets above have converted its open owed items:

  ```bash
  git mv epics/quick epics/_archive/quick-<YYYY-MM-DD>
  ```

  Then recreate `epics/quick/` from the quick skill's step 2 template, with
  one extra ground rule naming the ID floor — `Q-IDs continue at Q-<n+1>`,
  where `Q-<n>` is the archived era's highest number — because the archived
  headings are no longer read and a reused number would read as already
  shipped off main's commit subjects. Ship the rollover in the same pull
  request as the retro entry. Nothing is summarized or rewritten: the era
  stays verbatim in the archive; the working copy just stops paying for it.

Then stop. An epic is closed when its lessons are in documents that travel —
not when someone remembers them.
