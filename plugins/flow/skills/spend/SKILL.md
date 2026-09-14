---
name: spend
description: Show the recorded token spend per ticket, per role and per epic, derived from the status logs. Use when the user runs /flow:spend [epic], asks what an epic or ticket cost, or asks where the tokens went.
---

# Token spend $ARGUMENTS

```bash
node "${CLAUDE_PLUGIN_ROOT}/scripts/tickets.mjs" spend $ARGUMENTS
```

`$ARGUMENTS` is an optional epic name. Omit it for every epic.

Print the output. **Do not re-derive, estimate, or fill in a figure the
ledger does not carry** — the script reads the status logs' Tokens lines,
addendum phrases and run records, and a number it does not show is a number
nobody observed. `unknown` and `no figure recorded` are honest answers.

## Reading it

- **Per ticket:** `worker`, `reviewer`, `re-review`, `disposition` and
  `proxies` figures, a `total` of the known ones, and the source — `(log)`
  for an entry or addendum, `(run-record)` for a driver run.
- **Per epic:** the sum of known figures and the count of tickets with
  unknown or missing figures — the second number is what makes the first
  one honest.
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

Otherwise just show the ledger. Then stop.
