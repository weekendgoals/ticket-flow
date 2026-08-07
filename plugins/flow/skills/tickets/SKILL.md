---
name: tickets
description: Show the derived status board for every epic — what is shipped, in flight, blocked, and startable. Use when the user runs /flow:tickets, asks what to work on next, or asks where an epic stands.
---

# Ticket board

```bash
node "${CLAUDE_PLUGIN_ROOT}/scripts/tickets.mjs" list $ARGUMENTS
```

`$ARGUMENTS` is an optional epic name. Omit it for every epic.
`node "${CLAUDE_PLUGIN_ROOT}/scripts/tickets.mjs" epics` lists the names.

Print the output. **Do not re-derive, re-order or summarise away the states** —
the script reads git and GitHub directly, and a hand-written summary of it is
exactly the drift it exists to remove.

## Reading the states

| State | Means |
|---|---|
| `shipped` | Commits with this ID are on the default branch, or its pull request merged into it |
| `integrated` | Pull request merged into the epic branch (integration mode) — not shipped until the release pull request lands |
| `in review` | Pull request open |
| `done, unpushed` | Status log says DONE but nothing reached the default branch — **the loop stalled here**, `/flow:ticket` should have pushed |
| `in progress` | A local branch exists with commits, no pull request yet |
| `blocked` | Status log records BLOCKED or ABANDONED |
| `todo` | Not started |

Two things the board cannot see, worth knowing before you trust it:

- It reads **this checkout's** view of the remote default branch. If the local
  ref is stale the board under-reports; `git fetch origin --prune` first when the
  answer matters.
- `shipped` means *some* commit carrying that ID reached the default branch. A
  partially merged ticket, or a docs-only commit carrying the ID, reads as
  shipped.

## When to add commentary

Only where the board shows something a human should act on, and say it in one
line each:

- **`done, unpushed`** — work exists that no one else can see. Name the checkout
  it is sitting in if you can find it.
- **Every ticket in an epic `integrated`, none `todo`** — the epic is done
  integrating and is waiting on its release pull request. Say so; nothing else
  will.
- **`blocked` with nothing startable in that epic** — the epic is stalled.
- **A duplicate-ID warning** — two epics define the same ticket ID, and
  `/flow:ticket` will refuse it. Relay the warning; do not pick an epic yourself.
- **An epic with a large `todo` tail and no recent activity** — say so plainly.
  Epics are started faster than they are finished, and nothing else notices.
- **gh unavailable** — the board is git-only, so `done` may already be merged.

Otherwise just show the board. Then stop — do not start a ticket.
