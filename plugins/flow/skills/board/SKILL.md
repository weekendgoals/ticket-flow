---
name: board
description: Render the derived ticket board as a styled HTML page and publish it as an artifact the user can open and share. Use when the user runs /flow:board [epic] or asks to see the board as a page or UI.
---

# Board $ARGUMENTS

A **rendering of derived state, never a second store of it**. The page is
built fresh from `tickets.mjs list --json` on every run — the same facts the
terminal board prints, styled for a browser — and it goes to an artifact,
never into the repository: a committed board is exactly the hand-maintained
mirror this plugin exists to avoid.

## 1. Render

`$ARGUMENTS` is an optional epic name; with none, render all epics.

```bash
node "${CLAUDE_PLUGIN_ROOT}/scripts/board.mjs" $ARGUMENTS --out <scratchpad>/board.html
```

Write to your session's scratchpad directory, not into the repository. The
script exits nonzero with the board's own message for an unknown epic or a
folder outside a git repository — relay that message and stop; do not build a
page from guessed data.

## 2. Publish

Publish the file as an artifact (the page opens with its own `<title>`).
Re-publishing the same file path updates the same URL — do that on later
`/flow:board` runs in this session rather than minting a new page, so the
user's tab stays live.

Print the URL. Say in one line what the snapshot is: derived at this moment
from git, commit subjects and open pull requests, with a **Tokens** column
from the recorded spend ledger (`tickets.mjs spend`; `?` is an unknown
figure, `—` nothing recorded — never a zero, never an estimate) — the
terminal `list` remains the live view, and the page is regenerated, never
edited.

## 3. Never commit the page

Not to the repository, not to the epic's `context/`. If the user asks to
keep it, re-render on demand instead — the HTML is one command away, and a
stored copy starts lying the moment the next commit lands.
