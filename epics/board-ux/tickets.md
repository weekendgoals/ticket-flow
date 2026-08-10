# Board-ux epic — tickets

Source: AUTO-4 of the autonomous epic (`epics/autonomous/tickets.md`) — the
guinea-pig epic for the first unattended `/flow:run`; its candidates named
there: the next-ticket brief the user asked for on 2026-08-08, plus
board-output fixes adjacent to Q-5 (`epics/quick/tickets.md`). Grounded live
on 2026-08-08: `tickets.mjs` prints `/ticket <ID>` in Next up (line 349), and
`next <unknown-epic>` prints `nothing left to start` with exit 0.

Outcome: The board stops lying in its own output: a user who runs exactly
what the board prints gets a real command, a typo'd epic filter gets an
honest error instead of "nothing left to start", and a session can read the
next ticket's scope and acceptance criteria from one command instead of
opening the ticket doc. Evidence: the live output strings and the tests that
pin them; the retro checks whether the brief is actually used. Reversal: if
the brief goes unused or drifts from the document format it echoes, the
command and its Next up hint are removed.

Areas in scope: `plugins/flow` — the board script and its tests (bound by the
root `CLAUDE.md`).

Delivery: release
After sign-off, each ticket implements, reviews, fixes and merges its own
pull request into `epic/board-ux` unattended — unattended merges may only
ever target the epic branch, never the default branch — and the human's next
decision point is the release pull request. (Migrated 2026-08-11 from the
original two-line `Release mode: integration` + `Run mode: autonomous`
declaration, which said the same thing in the pre-2.0 syntax.)

Status log: `epics/board-ux/status.md`. Run a ticket with `/flow:ticket <ID>`
— or the whole epic, unattended, with `/flow:run board-ux`.

## Ground rules for every ticket in this epic

- Every behaviour change to `tickets.mjs` bumps
  `plugins/flow/.claude-plugin/plugin.json` and gets a CHANGELOG.md entry in
  the same commit (root CLAUDE.md invariant). Versions are pinned here so
  sequential unattended workers cannot collide: BOARD-1 → 1.10.0, BOARD-2 →
  1.11.0, BOARD-3 → 1.12.0.
- `tickets.mjs` stays zero-dependency and stateless, and the heading regexes
  are load-bearing and shared (root CLAUDE.md invariants).
- Standing checks after every ticket: `node --test
  plugins/flow/scripts/tickets.test.mjs` all pass 0 fail, and `node
  plugins/flow/scripts/tickets.mjs doctor` exit 0 on this repository.
- This epic runs unattended: the autonomous ground rules and stop conditions
  of `epics/autonomous/tickets.md` bind every ticket, and halting on a stop
  condition is the mechanism working, not a failure.
- The write surface of every ticket is this repository's `plugins/flow`,
  `CHANGELOG.md`, `README.md`, and this epic's own documents — plus, for
  BOARD-1 only, `epics/quick/tickets.md`, exactly the Q-5 supersession
  removal named in its scope. Nothing else.
- The driver-facing script contract is untouchable mid-run: what `list
  --json` reports in `modes` and `epics`, what `find --json` reports in
  `state`/`branch`/`epic`, and what `next <valid-epic>` returns must not
  change shape or meaning in this epic — the unattended driver executing this
  very epic reads them between tickets, off the freshly merged epic branch.
- The version pins above assume nothing outside this run bumps the plugin
  version on the default branch mid-run. If something does, the collision
  surfaces as a CHANGELOG merge conflict at the driver's epic-branch refresh
  and halts the run — that halt is accepted at sign-off, not a defect.

## Order

BOARD-1 is the live regression (a user followed the board's suggestion and
got "Unknown command") and the smallest possible diff — it proves the
unattended pipeline end to end at minimum stake. BOARD-2 removes the second
dishonest output. BOARD-3 is the new feature and the largest diff, last.

## BOARD-1 — the board suggests a command that does not exist

**Scope.**
- `tickets.mjs` "Next up" prints `/ticket <ID>`, but the installed command is
  `/flow:ticket <ID>` — plugin commands are namespaced, and a user who ran
  the suggestion verbatim got "Unknown command" (found live, 2026-08-08).
  Fix the printed string.
- Sweep `tickets.mjs` for any other user-facing string suggesting a
  non-namespaced command; fix what the sweep finds.
- Supersede Q-5: this is Q-5's defect, planned here instead. Remove the Q-5
  section from `epics/quick/tickets.md` in the same commit (a re-plan edit —
  the ticket doc is edited to re-plan, never to record progress), so the
  board does not carry the same todo twice. Q-5's wider clause (skill
  frontmatter/templates, a plugin-wide string sweep) was re-verified empty on
  2026-08-08: the only bare `/ticket` command string in `plugins/flow` and
  `README.md` is the one in `tickets.mjs` Next up — nothing real is narrowed
  by superseding it here.
- Test: the Next up line contains `/flow:ticket ` and never bare `/ticket `.
- Version 1.10.0 + CHANGELOG.

**Not in scope.** The unknown-epic-filter fix (BOARD-2); the brief (BOARD-3);
renaming skills or changing how the marketplace namespaces commands; any
other edit to the quick epic's documents.

**Acceptance criteria.**
- `node plugins/flow/scripts/tickets.mjs list` output contains
  `/flow:ticket ` in Next up and never bare `/ticket `; a test asserts the
  command string.
- `! grep -q "Q-5" epics/quick/tickets.md` — exits 0 (the section is gone;
  the negation matters: an autonomous run treats a bare nonzero exit as a
  stop condition).
- Full suite passes, 0 fail; doctor exit 0.

## BOARD-2 — an unknown epic filter answers honestly

**Scope.**
- `tickets.mjs next <epic>` with an epic that does not exist prints `nothing
  left to start` and exits 0 (verified live, 2026-08-08) — indistinguishable
  from a finished epic. The rule, everywhere: **an unknown epic filter is an
  error** — the message `no epic "<arg>" under epics/` goes to stderr and the
  exit code is 1, in `next` and `list`, plain and `--json` alike (`--json`
  forms emit no payload on that error). Plain `list` already has the message
  but exits 0; `list --json` today silently emits a valid empty payload —
  both change to match. One rule, no per-command judgment left to decide.
- Tests: `next` with an unknown filter, plain and `--json`; `list` with an
  unknown filter, plain and `--json`.
- Version 1.11.0 + CHANGELOG.

**Not in scope.** BOARD-1's string fix; BOARD-3; changing what a *valid*
filter means anywhere.

**Acceptance criteria.**
- `node plugins/flow/scripts/tickets.mjs next no-such-epic` exits nonzero and
  names the missing epic; a test asserts both.
- Full suite passes, 0 fail; doctor exit 0.

## BOARD-3 — the next-ticket brief

**Scope.**
- New subcommand `tickets.mjs brief [ID]`: with an ID, print that ticket's
  full section from its epic's `tickets.md` (Scope, Not in scope, Acceptance
  criteria — the parser already carries the section body) plus the derived
  facts `find` reports (state, branch, epic, modes, PR); with no ID, brief
  the first startable ticket in document order (the same ticket Next up
  proposes), saying which epic it came from. An unknown ID gets `find`'s
  refusal, verbatim behaviour.
- `--json`: the `find` payload plus a `body` field carrying the section text.
- The board's Next up section gains one hint line that the brief exists.
- README: one short paragraph documenting the command where the board is
  described.
- Tests: brief by ID, brief with no argument, unknown ID, and the Next up
  hint.
- Version 1.12.0 + CHANGELOG.

**Not in scope.** Editing any skill to consume the brief (a later quick
ticket if it earns one); changing which ticket Next up proposes.

**Acceptance criteria.**
- `node plugins/flow/scripts/tickets.mjs brief BOARD-1` prints BOARD-1's
  Scope, Not in scope and Acceptance criteria and its derived state; a test
  asserts the section content appears.
- `brief` with no argument prints the first startable ticket's brief and
  names its epic; a test asserts it.
- Full suite passes, 0 fail; doctor exit 0.
