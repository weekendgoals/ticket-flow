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

**Addendum — review — 2026-08-08 — fable/high:** No findings; nothing fixed,
nothing deferred, no pre-existing defects flagged. The reviewer verified the
sweep independently (line 349 was the only bare command suggestion in
`plugins/flow` and `README.md`), traced the new test's fixture to confirm the
positive assertion passes for the right reason and the negative one catches a
revert, confirmed the driver-facing script contract (`list --json`,
`find --json`, `next`) is untouched by the diff, confirmed the write surface
holds (the quick-epic diff is precisely the Q-5 section), and re-ran the
acceptance criteria live: 16/16 tests pass 0 fail, doctor exit 0, Next up
namespaced with no bare suggestion, Q-5 grep negative. One remark below the
finding bar: the test's `(?<!flow:)` lookbehind is redundant (`/flow:ticket`
never contains the substring `/ticket `) but the check it implements — no
bare `/ticket ` anywhere — is exactly right; left as is.

### BOARD-2 — an unknown epic filter answers honestly — 2026-08-08 — DONE

**Built:** An epic filter that names no epic under `epics/` is now an error
everywhere: `tickets.mjs next <arg>` and `list <arg>`, plain and `--json`
alike, print `no epic "<arg>" under epics/` to stderr and exit 1, and the
`--json` forms emit no payload on that error. Implemented as one guard
(`requireKnownEpic`, called from both commands' entry-point cases right after
`board(...)`) so no per-command judgment remains. Before: `next` with an
unknown epic printed `nothing left to start` exit 0 — indistinguishable from
a finished epic; plain `list` had the right message but on stdout with exit
0; `list --json` silently emitted a valid empty payload. Consequential
cleanup inside `printBoard`: its filtered-empty branch is now unreachable for
unknown epics, so its message — which falsely claimed `no epic "<x>" under
epics/` for a real epic whose tickets.md has no ticket sections — now says
`epic "<name>" has no tickets yet`. Two new tests (one for `next`, one for
`list`) each cover the plain and `--json` forms, assert exit 1, the stderr
message naming the epic, empty stdout, and that a valid filter still returns
the same answer as before. Plugin version 1.11.0 with a CHANGELOG entry.

**Files touched:** `plugins/flow/scripts/tickets.mjs`,
`plugins/flow/scripts/tickets.test.mjs`,
`plugins/flow/.claude-plugin/plugin.json`, `CHANGELOG.md`,
`epics/board-ux/status.md`. Branch `board-2`, cut from `epic/board-ux`.

**Verified:** `node --check plugins/flow/scripts/tickets.mjs` — exit 0.
`node --test plugins/flow/scripts/tickets.test.mjs` — 18 tests, 18 pass,
0 fail (16 before, +2 new). Live: `next no-such-epic`, `next no-such-epic
--json`, `list no-such-epic`, `list no-such-epic --json` all exit 1 with
`no epic "no-such-epic" under epics/` on stderr and 0 bytes on stdout.
`next board-ux` exits 0 and lists BOARD-3 (the only todo while this branch
runs). `node plugins/flow/scripts/tickets.mjs doctor` — exit 0.

**Decisions:** The guard tests `!data.epics.length` after `board(filter)`
rather than searching `allEpics`, so "epics/ missing entirely plus a filter"
also errors with the same message — still true, and one code path. The
`printBoard` filtered-empty message was reworded (valid-but-ticketless epic)
because leaving the literal `no epic "<x>" under epics/` string reachable at
exit 0 on stdout would recreate the exact ambiguity this ticket removes; the
meaning of a valid filter (which epics it matches, exit 0, board output) is
unchanged, so the "Not in scope" line on valid filters holds. Each new test
also pins the valid-filter answer (`next alpha --json` → A-4, `list alpha
--json` → epics ["alpha"]) because the unattended driver reads these between
tickets and a broken guard must fail the suite, not the run.

**Owed:** Nothing.
