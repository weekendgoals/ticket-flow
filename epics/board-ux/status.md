# Board-ux epic — status log

Append-only record of finished tickets. Tickets: `epics/board-ux/tickets.md`.

**Rules.** Append only. Corrections are new dated addenda beneath the entry they
correct, never edits. Report counts, not adjectives. The **Owed** line is
required even when empty.

## Baseline — 2026-08-08

Plugin at v1.9.0. What exists: `tickets.mjs` with mode parsing
(`releaseMode`/`runMode` in `find --json` and `list --json`), the
`integrated` state, a 15-test fixture-repo suite, `doctor`, and the
`/flow:run` driver (shipped by AUTO-3, untested live — this epic is its
first unattended run, by design of AUTO-4). Two defects verified live on
2026-08-08: the board's Next up prints `/ticket <ID>` where the installed
command is `/flow:ticket <ID>` (tickets.mjs line 349), and
`next <unknown-epic>` prints `nothing left to start` with exit 0. No brief
command exists. Sign-off decisions binding this epic: autonomous run mode
approved with the unattended consequence stated; branch protection on the
default branch waived (repository private under a free-plan org — recorded
as a re-plan of AUTO-4's acceptance criterion in
`epics/autonomous/tickets.md`); Q-5 of the quick epic is superseded by
BOARD-1 in-run; unknown-epic strictness is one rule, all commands, all
forms. Plan reviewed 2026-08-08 (fable/high): one Blocking finding (write
surface vs BOARD-1's cross-epic edit) fixed before sign-off, four nits
fixed, driver-facing script contract pinned as a ground rule.

### BOARD-1 — the board suggests a command that does not exist — 2026-08-08 — DONE

**Built:** The board's "Next up" section now prints `/flow:ticket <ID>` — the
installed, namespaced command — instead of the bare `/ticket <ID>` that got a
user "Unknown command" when run verbatim. A sweep of `tickets.mjs` for other
non-namespaced command suggestions found none (the only other slash-command
strings are the already-namespaced `/flow:epic` mentions; the `/tickets.md`
matches are file paths, not commands). A new test pins the output: Next up
must contain `/flow:ticket <ID>` and the whole `list` output must contain no
`/ticket ` not preceded by `flow:`. Q-5 of the quick epic — the same defect,
planned there before this epic superseded it — is removed from
`epics/quick/tickets.md` (a re-plan edit, per sign-off), so the board no
longer carries the todo twice. Plugin version 1.10.0 with a CHANGELOG entry.

**Files touched:** `plugins/flow/scripts/tickets.mjs`,
`plugins/flow/scripts/tickets.test.mjs`, `epics/quick/tickets.md`,
`plugins/flow/.claude-plugin/plugin.json`, `CHANGELOG.md`,
`epics/board-ux/status.md`. Branch `board-1`, cut from `epic/board-ux`.

**Verified:** `node --check plugins/flow/scripts/tickets.mjs` — exit 0.
`node --test plugins/flow/scripts/tickets.test.mjs` — 16 tests, 16 pass,
0 fail (15 before, +1 new). `node plugins/flow/scripts/tickets.mjs list` —
Next up prints `/flow:ticket AUTO-5` and `/flow:ticket BOARD-2`;
`grep -cE "(^|[^:])/ticket "` over the full output finds 0 bare suggestions.
`! grep -q "Q-5" epics/quick/tickets.md` — exit 0. `node
plugins/flow/scripts/tickets.mjs doctor` — exit 0.

**Decisions:** The new test asserts with a negative lookbehind
(`(?<!flow:)\/ticket `) over the entire plain `list` output rather than only
the Next up line, so any future bare suggestion anywhere in the board output
fails the suite, not just a regression of this exact line. Q-5's whole
section was removed rather than annotated: the ticket doc is edited to
re-plan, never to record progress (skill rule the epic plan cites), and the
supersession is recorded here and in the quick epic's board disappearance,
not as a tombstone there.

**Owed:** Nothing.
