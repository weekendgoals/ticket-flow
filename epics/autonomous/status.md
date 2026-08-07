# Autonomous epic — status log

Append-only record of finished tickets. Tickets: `epics/autonomous/tickets.md`.

**Rules.** Append only. Corrections are new dated addenda beneath the entry they
correct, never edits. Report counts, not adjectives. The **Owed** line is
required even when empty.

## Baseline — 2026-08-08

Plugin at v1.6.0 (Q-4 in review as PR #4 at time of writing). What exists:
seven skills, two reviewer agents, `tickets.mjs` with the `integrated` state
(derived from a merged PR whose base is the epic branch — built in v1.3.0 and
verified sound by Q-4's review), a 9-test fixture-repo suite, and `doctor`.
What does not exist: any parsing of `Release mode:`/`Run mode:` lines (they
are prose to the script today), any agent merge permission anywhere, any
driver that runs more than one ticket. Sign-off decisions binding this epic:
a permission prompt mid-run is a stop condition; the zero-interventions claim
must cite the external record (PR/commit timeline), never only the agent's
diary; a merge conflict while refreshing the epic branch stops the run
unconditionally. Known risk carried in: the reviewer agent type has failed to
load in a live session once (see epics/quick Q-1 addendum) — the sanctioned
fallback is in this epic's ground rules.

### AUTO-1 — the run mode is a parsed fact, not prose — 2026-08-08 — DONE

**Built:** Plugin v1.7.0. `tickets.mjs` gains `parseModes()`: `Release mode:`
and `Run mode:` are read from the epic preamble (first word after the colon,
case-insensitive, prose tolerated; absent → serial/attended). Exposed as
`releaseMode`/`runMode` in `find --json`, as a `modes` map in `list --json`,
and as labels on the board's epic headers. The serial+autonomous
contradiction is refused in `find` (exit 1) and failed by `doctor`;
unrecognised values are doctor warnings with the raw value exposed, never a
silent default.

**Files touched:** `plugins/flow/scripts/tickets.mjs`,
`plugins/flow/scripts/tickets.test.mjs` (+4 tests: tolerant parse & JSON
exposure, absent-line defaults, serial+autonomous refusal in find and doctor,
unrecognised-value warning), `plugins/flow/.claude-plugin/plugin.json`,
`CHANGELOG.md`, this file. Branch `auto-1`, cut from `epic/autonomous` (first
ticket; the epic docs travel with this PR).

**Verified:** 13 tests, 13 pass, 0 fail. `doctor` exit 0 live. `find AUTO-1
--json` live returns `releaseMode: serial`, `runMode: null` for this epic.

**Decisions:** Raw unrecognised values are exposed rather than coerced, so a
typo is visible at every layer, not just in doctor. Document contradiction
found and reported, not adapted: `skills/ticket` step 9 says the PR base is
"epic/<epic-name> for the first ticket of any epic whose documents have not
shipped yet", but README ("in serial mode the docs reach the default branch
for free: ticket one branches from here, so they land in that ticket's pull
request") and the epic skill's step 7 both require ticket one's PR to target
the default branch in serial mode. Followed the README semantics (this PR
targets main); the step 9 wording fix is owed.

**Owed:** The `skills/ticket` step 9 first-ticket base-branch wording fix —
inherit by the next quick ticket (proposed Q-6) or fold into AUTO-2, which
rewrites adjacent step 9 text anyway.
