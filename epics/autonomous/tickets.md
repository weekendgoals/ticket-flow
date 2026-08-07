# Autonomous epic — tickets

Source: user request in-session, 2026-08-08 — "run a whole epic workflow from
the beginning to the end without my presence… merging should be done into the
epic branch, not main, and the work should be against the epic branch (i
cannot give unverified work get merged to main without my approval)." Plan
reviewed 2026-08-08 (fable/high): four Blocking findings applied — AUTO-2
split at its natural seam, stop conditions made operational, reviewer-spawn
failure covered, CLAUDE.md ownership added.

Outcome: An epic can run start-to-finish with no human present between plan
sign-off and the release pull request — tickets implement, review, fix and
integrate into the epic branch unattended, while nothing reaches the default
branch without a human merge. Evidence: one real epic in this repository runs
autonomously to completion — every ticket `integrated` on the board, a release
PR open to main, and the **external record** (PR and commit timeline, absence
of human pushes or comments in the window) showing zero human interventions
between sign-off and release review, with `git log origin/main` containing no
commit from the run. Reversal: if unattended runs routinely stall, or produce
release PRs the human rejects, the mode is removed and its lessons go to
METHODOLOGY.md.

Areas in scope: `plugins/flow` — skills, agents, script (bound by the root
`CLAUDE.md`).

Release mode: serial

Status log: `epics/autonomous/status.md`. Run a ticket with `/flow:ticket <ID>`.

## Ground rules for every ticket in this epic

- **The default branch is untouchable by agents in every mode, including the
  new one**: no direct pushes, no merging any pull request whose base is main.
  The autonomous merge surface is `epic/<name>` only.
- Autonomous run mode requires integration topology (ticket PRs target the
  epic branch). A serial epic cannot be autonomous; the combination is refused
  mechanically, not by convention.
- The stop conditions are load-bearing and operational: an autonomous run
  halts on BLOCKED; on an Important review finding it cannot fix; on a
  document/code contradiction; on a merge conflict; on reviewer-spawn failure
  after the sanctioned fallback also fails; on **a permission prompt firing
  mid-run** (an unattended run that needs to ask was not pre-authorized, and
  waiting blocked is worse than stopping — sign-off decision, 2026-08-08);
  and on **a nonzero exit from any command the skill itself issues as a step,
  except those the skill explicitly marks tolerated**. It never improvises
  past one.
- **An unreviewed ticket is never merged, anywhere.** If the reviewer agent
  cannot be spawned, the sanctioned fallback is a general agent instructed by
  `agents/ticket-reviewer.md` plus the review skill; if that also fails, the
  run stops.

## Order

AUTO-1 makes the mode a parsed fact and proves the state model before any
behaviour exists; AUTO-2 changes the ticket loop behind a guard AUTO-1 makes
checkable; AUTO-3 builds the driver on top of both; AUTO-4 is the live proof
the Outcome demands. Each is useless without its predecessor.

## AUTO-1 — the run mode is a parsed fact, not prose

**Scope.**
- `tickets.mjs`: parse `Release mode:` and a new optional `Run mode:
  autonomous` line from the epic preamble. Tolerant parse: the value is the
  first word after the colon, case-insensitive; anything after it is prose.
  Absent `Release mode:` defaults to `serial`; an unrecognised value is a
  `doctor` near-miss warning, not a silent default.
- Expose `releaseMode` and `runMode` in `find --json` and `list --json`;
  label autonomous epics on the board.
- Refuse the contradiction at the source: `Run mode: autonomous` with
  `Release mode: serial` (explicit or defaulted) is a `doctor` fail and a
  `find` error.
- Tests: fixture epics covering both modes, the prose-decorated line, the
  absent line, the unrecognised value, and the serial+autonomous refusal.
- Version 1.7.0 + CHANGELOG.

**Not in scope.** Any skill behaviour change; running anything autonomously.

**Acceptance criteria.**
- `node --test plugins/flow/scripts/tickets.test.mjs` — all pass, including
  the new fixtures above.
- `tickets.mjs find <ID> --json` on a fixture autonomous epic returns
  `runMode: "autonomous"` and `releaseMode: "integration"`; on the quick epic
  it returns `releaseMode: "serial"`, `runMode: null`.

## AUTO-2 — the gated self-merge path in the ticket loop

**Scope.**
- `skills/epic`: the template gains the optional `Run mode: autonomous` line
  (integration topology required), and the sign-off message must state
  explicitly what will run unattended after approval. The template's
  integration-mode "WHY they cannot ship alone" guidance and
  `agents/plan-reviewer.md`'s integration-mode challenge both learn the new
  legitimate reason: autonomous runs require integration topology.
- `skills/ticket`: when the resolved `runMode` is `autonomous`, after the
  review addendum the session merges its own ticket PR into `epic/<name>`
  with a merge commit (never squash, never any PR whose base is main),
  reports, and proceeds to the next ticket instead of stopping. The
  reviewer-spawn fallback and the "unreviewed is never merged" rule from this
  epic's ground rules are written into the skill. For serial and plain
  integration epics, behaviour is unchanged from v1.7.0.
- `CLAUDE.md`: rescope the "a human merges, nothing runs after" invariant —
  it remains absolute for main in all modes; the epic branch is the sanctioned
  autonomous merge surface. Same commit as the skill change it describes.
- Version 1.8.0 + CHANGELOG.

**Not in scope.** The `/flow:run` driver (AUTO-3); README/METHODOLOGY
narrative (AUTO-3); parallel execution; anything touching main.

**Acceptance criteria.**
- Standing checks green (tests, doctor).
- The autonomous path is reachable only when `find --json` reports
  `runMode: "autonomous"` — cite the guard sentence in the skill.
- The skill text forbids merging any PR based on main in all modes — cite the
  sentence.

## AUTO-3 — the /flow:run driver

**Scope.**
- New `skills/run`: `/flow:run <epic>` — verifies sign-off happened (epic
  docs committed on the epic branch), refreshes `epic/<name>` from main
  between tickets (a merge conflict is a stop condition), loops tickets in
  document order through the ticket skill, halts on the ground-rule stop
  conditions with a status-log entry saying why, and ends by opening the
  release PR from `epic/<name>` to main carrying the full evidence trail. It
  never merges the release PR.
- README + METHODOLOGY.md: why the human gate moves to the release PR, why
  main stays sacred, why stop conditions beat retries, and what the
  permission surface must allow before an unattended run (documented as
  environment setup, not plugin code).
- Version 1.9.0 + CHANGELOG.

**Not in scope.** Auto-merging anything into main; retro changes;
notification/scheduling infrastructure; AUTO-2's skill edits.

**Acceptance criteria.**
- Standing checks green.
- `/flow:run`'s documented stop conditions match this epic's ground rules
  verbatim.
- The skill documents the required pre-authorizations and states that a
  permission prompt firing mid-run is a stop condition (sign-off decision,
  2026-08-08).

## AUTO-4 — a real epic runs itself

**Scope.**
- Plan a small guinea-pig epic of 2–3 genuinely useful tickets (candidate:
  board UX — the next-ticket brief the user asked for on 2026-08-08, plus
  board-output fixes adjacent to Q-5), declare it `Run mode: autonomous` at
  its sign-off, and run `/flow:run` on it end to end with no human between
  sign-off and the release PR.
- Record the run in THIS epic's status log, citing the **external record**:
  PR and commit timestamps, absence of human pushes/comments in the window —
  not only the agent's own diary. Also record stalls with stop reasons, wall
  time, and findings the reviewers caught unattended.

**Not in scope.** Merging the resulting release PR (human's); silently fixing
AUTO-2/AUTO-3 bugs the run exposes — a failed run stops, is logged, and fixes
are new tickets.

**Acceptance criteria.**
- Every guinea-pig ticket reaches `integrated` on the board; a release PR to
  main exists; `git log origin/main` contains no commit from the run.
- The status-log entry cites the external record showing zero human
  interventions between sign-off and release PR — or the run's stop reason,
  verbatim.
