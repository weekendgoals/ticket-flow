---
name: spend
description: Show the recorded token spend and wall-clock time per ticket, per role and per epic, derived from the status logs. Use when the user runs /flow:spend [epic], asks what an epic or ticket cost, how long it took, or asks where the tokens or the time went.
---

# Token spend $ARGUMENTS

```bash
node "${CLAUDE_PLUGIN_ROOT}/scripts/tickets.mjs" spend $ARGUMENTS
```

`$ARGUMENTS` is an optional epic name. Omit it for every epic.

Print the output. **Do not re-derive, estimate, or fill in a figure the
ledger does not carry** — the script reads the status logs' Tokens lines,
addendum phrases and the run records in `runs.md`, and a number it does not
show is a number nobody observed. `unknown` and `no figure recorded` are honest answers.

## Reading it

- **Per ticket:** `worker`, `reviewer`, `re-review`, `disposition` and
  `proxies` figures, a `total` of the known ones, and the source — `(log)`
  for an entry or addendum, `(run-record)` for a driver run.
- **Two logs, one ledger:** ticket entries and their addenda are in
  `status.md`, run records in `runs.md` (and in `status.md` for logs written
  before the split). Where both carry a figure for the same ticket and role,
  the one in `runs.md` wins, which is why a correction to a run record's
  figures is appended there. An `unknown` never overwrites a known figure in
  either direction: `unknown` is the absence of an observation, not a
  correction.
- **Rounds are summed; every other repeat is a correction.** A figure
  labelled `round=<n>` — in a ticket's own entry (`round=2 worker=… reviewer=…`)
  or a run-record group (`<ID> round=2 worker=…`) — is one review pass, and a
  ticket's figure for a role is the sum of its rounds; the JSON's `rounds`
  field says how many passes each summed figure adds up. Within a round, and
  for every unlabelled figure, the last one read wins. When the ledger looks
  low for a ticket that was reviewed several times, run `/flow:doctor`: it
  warns when an entry carries two unlabelled figures for one role with no
  correction addendum between them, naming what is counted and what rounds
  would total. The repair is a dated addendum restating them with labels,
  never an edit.
- **Per epic:** the sum of known figures and the count of tickets with
  unknown or missing figures — the second number is what makes the first
  one honest.
- **Time:** the dim `time` row under a ticket is the run record's
  `**Time:**` line — seconds per role from the transcripts' own timestamps,
  and `wall`, the ticket's first agent start to its last agent end. `wall` is
  not the roles' sum: the difference is what the ticket spent between agents.
  Rounds, `unknown` and corrections follow the token rules above. The row
  ends with where it was read: `(run-record)` for a driver run, whose line
  `scripts/meter.mjs` prints from the workflow run's directory, or `(log)`
  for a `**Time:**` paragraph in a ticket's own entry — which only a
  supervisor that watched the agents stop can honestly write.
- **`commit span … (git)`** appears only where no wall was recorded: the
  first to the last commit naming the ticket, by author date — so a ticket
  with one commit, or several at one instant, shows nothing: a point is not
  a span. It is observed,
  and it is **not the ticket's wall-clock** — the work before the first
  commit is most of an implementation and none of the span, and a
  squash-merged ticket's span ends at the merge, the human's wait included.
  Never quote it as how long a ticket took; say what it is.
- **In-session lanes** (`/flow:quick`, `--interactive`) always read
  `unknown`: a session cannot see its own counter. Claude Code's own `/cost`
  is the only view of those.

## When to add commentary

One line each, only where the ledger shows something a human should act on:

- **A ticket far above its epic's typical spend** — say which, and that the
  retro decides whether its class or its plan is the cause.
- **Most tickets unknown** — the lane that ran them cannot observe spend;
  say which lane, and that supervisor or driver runs would record it.
- **A driver-run ticket with no run-record group** — the run record's
  Tokens line was written without the per-ticket shape the run skill's step
  6 asks for; say so, that `/flow:doctor` flags the record, and that a dated
  addendum beneath it restating the figures as groups repairs it.

- **A ticket whose `wall` is far above its roles' sum** — say which, and
  that the gap is time between agents (driver overhead, a retried step, a
  rate limit), which the run's journal and the record's Diagnosis explain
  and a slow worker does not.

Otherwise just show the ledger. Then stop.
