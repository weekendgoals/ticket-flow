# Deviation routing epic — tickets

Source: `context/findings.md` — mined 2026-09-17 from a page epic in an
installed project, both rounds; its "Ideas" sections are marked as the
reporting session's guesses, and the decisions here are this plan's.
`context/plan-review-2026-09-17.md` records the two fresh-context plan
reviews: the first, of a combined six-ticket draft, whose sizing findings led
the planner and Vadim to split the work into this epic and
`epics/design-fidelity/` (which starts after this one reaches `main`); the
second, of both rewritten documents. Planned 2026-09-17.

Outcome: A worker that builds something other than what its documents show
is told to record it under `**Decisions:**` — "judgment calls and deviations
from the documents, each with the why" — and `tickets.mjs` reads that field
nowhere: not in `brief`, not in `find`, not in a run record. In the source
epic a worker wrote, honestly and in the right place, that it had not built
the design's hero band; it reached no human and no later gate, and the page
shipped without it. A deviation is not owed work, so it evaporates by
construction. Observable change: a deviation has its own line, and that line
reaches the next human decision at every door — every later brief, the pull
request body, an attended merge, and a halt in an unattended run — and is
closed only by a human, in a line that says whether it was accepted or
fixed. Evidence, on the next two release epics run with the plugin in an
installed project: (a) deviations the human finds at the release pull
request that were written anywhere but a `**Deviation:**` line — an
instruction file, Decisions prose, a commit message — zero. What produces
it: the retro asks the question (DEV-3) and the answer is written down even
when it is "none found", because an absent record is indistinguishable from
zero. (b) For every deviation halt in the run records, the retro's halt
question records what the human decided. Reversal: if over those two epics
every deviation halt was closed as "accepted" with nothing changed, the halt
bought nothing — DEV-3's stop condition is removed, the deviation stays in
`brief` and the run record, and this epic's record says what the automation
cost. Clause (a) failing the other way — deviations still written elsewhere
— means the line is not being taught where workers read, and is a ticket
against the skills, not a reversal.

Requirements:
1. When a worker builds something other than what its ticket's documents or
   design show, the entry shall carry one `**Deviation:**` line per
   departure.
2. When a later ticket is briefed, every deviation in the epic that no human
   has closed shall be in the brief.
3. When an attended session shows a ticket to the user, opens its pull
   request, or integrates it into an epic branch, every deviation the ticket
   recorded shall be shown — closed or not, with its closing line — and an
   unclosed one shall stop the integration until a human has decided.
4. When an unattended run reaches a ticket whose pushed entry records a
   deviation, the run shall halt before any merge — whatever closing line
   the branch carries, because nobody present in that run could have
   written one.
5. When a human has decided — accepted it, or had it fixed — one closing
   line shall clear every attended door and every later brief, and shall
   say which of the two happened.
6. The closing line is a human's decision: no worker and no disposition
   agent writes it, and no gate takes an agent's word that it was made.

Areas in scope: `plugins/flow` (root `CLAUDE.md` binds all of it —
`scripts/tickets.mjs` and its suite, the driver `workflows/run-epic.mjs` and
its suite, `scripts/check-invariants.mjs` and its suite, the ticket, quick,
run and retro skills, README, METHODOLOGY, CHANGELOG).

Delivery: release — three tickets, one release pull request. **Re-planned
2026-09-17, after sign-off, on Vadim's instruction ("do all unattended"):
run by `/flow:run deviation-routing`**, not attended as first signed off.
Nothing now waits for a human between tickets: a fresh worker implements
each one, the driver hires its reviewer, and it merges into
`epic/deviation-routing` by verified SHA; the next human decision is the
release pull request. The two reasons the plan first gave for an attended
run still hold, and are accepted knowingly. The plugin is not installed in
the launching session (`flow:epic` was not registered on 2026-09-17 and was
executed from its source), so each reviewer hire fails once and takes the
driver's sanctioned fallback, a general agent given the reviewer's rules —
a cost in spend, not in safety. And DEV-3 edits `run-epic.mjs` while a run
is in flight: harmless, because a workflow script is read once at launch,
and it means this run is not governed by the halt it builds.

Environment probes, 2026-09-17: branch protection on `main` —
`gh api repos/weekendgoals/ticket-flow/branches/main/protection` answers 404
"Branch not protected", and `…/rules/branches/main` answers `[]`:
unprotected. The two earlier epics recorded a 403 on a private repository
under the free plan; the repository is public now, so protection is
available and simply not enabled. **Waived 2026-09-17: Vadim chose to run
without the hard floor** — "i waive the protection" — having been told that
protection could be switched on instead. The permission surface: the
launching session runs in auto mode, where a classifier once refused a
force push this session; nothing in a run force-pushes, and a prompt
mid-run is a stop condition by design.

Worker model: opus

Consequence paths: plugins/flow/workflows/**, plugins/flow/scripts/tickets.mjs

Decisions at planning, 2026-09-17:
1. **A deviation is its own optional line, `**Deviation:**`** — not a marker
   inside `**Decisions:**`, not a new required field. The source epic's real
   Decisions field is one 60-line paragraph of six numbered items with the
   deviation third: a marker inside prose like that is not reliably
   parseable, and surfacing the whole field buries it again. A required
   field would change the status-log preamble's three pinned copies and the
   shape of every existing log. An optional line parses exactly like
   `**Owed:**` and changes neither.
2. **Closure is per entry, by one line that names each deviation as
   accepted or as fixed** (Vadim, sign-off review). The entry ID is the only
   identity a paragraph has; numbering deviations adds a second identity
   scheme for a rare case. The line is `**Deviations closed:**`, not
   "accepted", because the first plan review showed that a fixed deviation's
   paragraph still parses in an append-only log — a line that could only
   mean "accepted" left the fix recovery unable to clear the gate, or
   recorded a fix as an acceptance.
3. **Deviations are read through their own subcommand, never `find
   --from`.** `find --from` means "the epic's declarations as signed off",
   and the driver's resolve step already calls it with the epic ref to read
   the ticket budget. A status log read through the same flag would give one
   low-effort proxy two JSONs with the same field names; swapped, the
   deviation gate fails open or the reviewed branch sets its own budget
   ceiling. The new read is a different command with a different flag,
   `--log-from`, and its JSON shares no field with `find`'s.
4. **The halt fires at the resolve step, after the review** (Vadim, sign-off
   review). Recovery after any halt passes through the ticket skill's step
   10, which needs the review on the record; halting before the reviewer is
   hired would make the human hire one by hand.
5. **Only a human closes a deviation, and the unattended gate honours no
   closing line** (second plan review; Vadim confirmed it at sign-off,
   2026-09-17). The driver only ever gates a ticket it started in the same
   pass — it refuses an epic holding an in-progress ticket, and a halted
   ticket is finished by hand and never re-gated — so a closing line on the
   pushed branch at resolve time can only have been written by the worker or
   the disposition agent. A gate that honoured it would let the party under
   review clear its own gate, and "accepted" versus "fixed" is prose no
   parser can police. So the unattended gate counts `**Deviation:**` lines
   under the ticket's own entries and ignores closure; the attended doors
   honour the line, because there a human is present to have written it —
   and show closed deviations with their closing line, so a self-closure is
   seen rather than trusted. The cost is a halt on a deviation an agent has
   already fixed; the reversal clause is what measures whether that cost is
   worth paying.

CHECK ledger, 2026-09-17, on the tree at `b96da41` (`origin/main` after PR
#50): every CHECK below was run with `tickets.mjs check <ID>` and **failed**,
as it must before its ticket exists; none was unrunnable here. The second
plan review re-ran them and found the same, and named three whose phrase an
earlier ticket's text could have turned green; those phrases are now
reserved to their ticket under **Not in scope**. The figures are in the
sign-off record.

Status log: `epics/deviation-routing/status.md`. Run a ticket with `/flow:ticket <ID>`.

## Ground rules for every ticket in this epic

- **Project-agnostic, everywhere a project will read it.** No skill, script,
  test or fixture names a project, a framework or a tool a project might not
  have. The installed project that produced the evidence is named only in
  METHODOLOGY and CHANGELOG, where reasoning cites its source.
- **Zero dependencies, nothing stored.** No `package.json`, no npm
  dependency, no cache, no state file: a deviation is read from the status
  log every time, exactly as an owed item is. The actor for every ticket is
  an unattended, driver-spawned worker with a shell — it spawns no agents,
  holds no browser and drives no interactive tool — and every criterion
  below is executable by that actor.
- **The status log's shape does not change.** The preamble's three pinned
  copies, the entry heading, and the rule that `**Owed:**` is the one
  required line all stay as they are; `**Deviation:**` and `**Deviations
  closed:**` are optional lines, and no existing log needs an edit to stay
  valid — `doctor` must exit 0 on this repository's own logs afterwards.
- **No agent writes `**Deviations closed:**`.** Every skill and prompt that
  mentions the line says whose it is, because a closing line is only worth
  reading if the party it clears could not have written it.
- **A behaviour change gets its CHANGELOG entry under `## Unreleased` and
  its reasoning in METHODOLOGY in the same commit**; a grown suite updates
  CLAUDE.md's pass count in the same commit, because CI runs what CLAUDE.md
  names.
- **A rule stated in more than one document is one rule.** Grep a doctrine
  sentence's key phrase across the skills, agents, README, METHODOLOGY and
  CLAUDE.md before writing it; a new cross-document coupling gets a short
  `check-invariants.mjs` entry and a test that fails when one copy drops it.
- **A gate is verified at the door its actor walks through**, and its
  refusal names a recovery that works in the refused state: every new halt
  or refusal here says what the human does next, and a test or a
  demonstration shows that doing it clears the refusal — for **both**
  recoveries, accepting and fixing.
- **Every constraint carries its reason** in the sentence that states it.
- **`run-epic.mjs` is parsed the way the runtime parses it** (CLAUDE.md's
  `node -e` command), never with `node --check`.

## Order

DEV-1 first: both doors read what it parses, and its two contracts — the
line's shape and the `deviations` subcommand's JSON — are what DEV-2 and
DEV-3 are written against. DEV-2 before DEV-3 because an unattended halt's
recovery finishes the ticket by hand through the ticket skill's step 10, the
attended door; a halt that lands before that door knows about deviations
advertises a recovery that lets the deviation through. If DEV-1's parser
cannot tell a `**Deviation:**` line from Decisions prose that merely uses
the word — its fixture for exactly that must fail to parse as one — the
epic stops there and the line's shape is redesigned before any door is
built on it.

## DEV-1 — A deviation is parsed and surfaced

**Scope.**
- `tickets.mjs`: `parseDeviations`, beside `parseOwed`. A `**Deviation:**`
  paragraph under a parsed entry heading runs to the first blank line; an
  entry may carry several; each is reported with its entry's ID and date. A
  dated `**Deviations closed:** <ID>[, <ID>] — <each deviation named as
  accepted or as fixed in <sha>; who; when>` line, in any entry or
  addendum, closes every deviation recorded by entry `<ID>` **above it in
  the file** — the leading ID list only, as `**Resolves owed:**` does, so an
  ID cited later in the prose is a citation and not a target. Order matters
  here as it does not for owed items: an ID can head more than one entry (a
  BLOCKED ticket redone), and a deviation recorded after a closing line
  must not be born closed.
- `brief` prints a **Deviations — recorded, not yet closed by a human**
  section after the owed items; `brief --json` carries `deviations`.
- A new subcommand, `deviations <ID> [--log-from <ref>] [--json]`: **every**
  deviation that ticket's own entries record, each with `closed` and, when
  closed, the closing line's text — the unattended gate counts them all, the
  attended doors filter on `closed`. With `--log-from`, the status log is
  read with `git show <ref>:epics/<epic>/status.md` instead of from the
  working tree, because the driver reads the **pushed ticket branch**, where
  a worker writes its entry. A ref or file that cannot be read is exit
  nonzero with the reason, never an empty list: an unreadable fact must not
  read as "no deviations". The JSON shares no field with `find`'s; `find`
  and `find --from` are untouched, and a test pins that `find --json`
  carries no `deviations` key.
- `doctor` flags near-misses that would silently not parse:
  `**Deviations:**`, an unbolded `Deviation:` at line start inside an entry,
  `**Not replicated:**`, `**Deviation accepted:**`, the singular
  `**Deviation closed:**` — the likeliest slip, given a singular opener and
  a plural closer — and a `**Deviations closed:**` line with no leading ID.
- Ticket skill step 6 and quick skill step 5 teach the `**Deviation:**`
  line: what counts — anything the ticket's documents or its design show
  that was not built, or was built differently; a judgment call the
  documents left open stays in Decisions — its shape (`<what was shown> →
  <what was built, and why>`), that it is omitted when there is none, and
  that it is never owed work: an owed item is work someone will do, a
  deviation is a decision someone must see. They name `**Deviations
  closed:**` as **the human's line, never the worker's**, with the reason.
  README's account of the entry fields gains both lines.
- Tests for every branch above, including an entry whose Decisions paragraph
  discusses a deviation in prose and must **not** parse as one, and a
  deviation recorded below a closing line for its own ID staying open.

**Not in scope.** Stopping anything. What a session does with a deviation
when it shows a ticket, opens a pull request or merges — the rule and its
two phrases, "with an unclosed deviation" and "a deviation is named in the
pull request body", are DEV-2's and appear nowhere in this ticket's text;
the driver is DEV-3's. Any change to `find`, to the entry heading or to the
preamble.

**Acceptance criteria.**
- `brief --json` carries a `deviations` list for any ticket.
  CHECK: node plugins/flow/scripts/tickets.mjs brief HARD-1 --json | grep -o '"deviations"' | head -1
  EXPECT: "deviations"
- The subcommand exists and answers for a ticket with none.
  CHECK: node plugins/flow/scripts/tickets.mjs deviations HARD-1 --json
  EXPECT: "deviations"
- An unreadable ref is a failure, not an empty list.
  CHECK: node plugins/flow/scripts/tickets.mjs deviations HARD-1 --log-from no-such-ref --json 2>&1 | grep -c "no-such-ref"
- Both lanes teach the closing line and whose it is.
  CHECK: grep -c "Deviations closed" plugins/flow/skills/ticket/SKILL.md
- The quick lane points at it.
  CHECK: grep -c "Deviations closed" plugins/flow/skills/quick/SKILL.md
- demonstrate: in a throwaway epic, write an entry with two `**Deviation:**`
  paragraphs → `brief` prints both under the new heading and `deviations
  <ID> --json` lists both with `closed` false; append a `**Deviations
  closed:**` addendum naming the entry → `brief` prints neither and the
  subcommand lists both with `closed` true and the line's text; add a third
  deviation beneath it → it alone is open. `doctor` stays at exit 0 on this
  repository. Record the outputs.
- Standing checks, reported with counts under **Verified**: every suite
  CLAUDE.md names, `check-invariants.mjs`, `doctor`, and the revert check's
  named test.

## DEV-2 — A deviation stops an attended merge

**Scope.**
- Ticket skill step 9: before showing the user, run `deviations <ID>`.
  **Every** deviation the ticket recorded is shown in the step's summary —
  closed ones with their closing line, because a closing line nobody present
  wrote is exactly what the human needs to see — and **a deviation is named
  in the pull request body** under its own heading, so the human merging
  reads it where they already read.
- Ticket skill step 10: a supervisor or session **does not integrate a
  ticket with an unclosed deviation** into the epic branch. It stops, shows
  the deviation, and resumes only when the human has decided and the dated
  `**Deviations closed:**` line is on the ticket branch — naming each
  deviation as accepted or as fixed in a commit, written on the human's
  word, quoted. Both recoveries are spelled out, and the step says why it
  refuses: in a release epic this merge is the last point before the release
  pull request at which one ticket's departure is still one decision rather
  than part of a nine-ticket diff.
- Quick skill step 7: a deviation is named in the pull request body in the
  same words; a quick ticket has no agent merge to refuse, so the body is
  its door.
- `check-invariants.mjs` couples that phrase across the ticket and quick
  skills, with a test that fails when one drops it.

**Not in scope.** The unattended driver — DEV-3. Parsing — DEV-1. Judging
whether a deviation is acceptable: that is the human's, and the skill never
suggests an answer.

**Acceptance criteria.**
- The release integration refuses.
  CHECK: grep -c "with an unclosed deviation" plugins/flow/skills/ticket/SKILL.md
- The quick lane names it in the body.
  CHECK: grep -c "a deviation is named in the pull request body" plugins/flow/skills/quick/SKILL.md
- The invariant checker holds the two lanes together.
  CHECK: grep -c "a deviation is named in the pull request body" plugins/flow/scripts/check-invariants.mjs
- demonstrate: read steps 9 and 10 as a supervisor holding a ticket whose
  `deviations <ID>` output lists one open item; again with it closed as
  fixed; again with it closed by a line the supervisor did not write → the
  first stops before the merge command, the second reaches it, the third
  reaches it **and** the summary shows the closing line. Record which
  sentence decided each.
- Standing checks with counts, as DEV-1.

## DEV-3 — An unattended run halts on a deviation

**Scope.**
- Driver, resolve step: one more read-only fact,
  `tickets.mjs deviations <ID> --log-from origin/<branch> --json`, on the
  pushed ticket branch — after the fetch the step already does — reported
  verbatim under its own schema field, never merged into `find`'s report.
- Driver, the gate: one or more deviations under the ticket's own entries
  halts on a **new stop condition**, stated in one sentence that the run
  skill's step 5 and `run-epic.mjs` carry word for word,
  `check-invariants.mjs` pins whole, and both suites quote: **a recorded
  deviation — the ticket's pushed status entry carries a `**Deviation:**`
  line, closed or not, because nobody present in an unattended run could
  have closed it; the run asks rather than records.** It fires before any
  merge agent exists and merges nothing. A deviations fact that is missing,
  the wrong type or unreadable halts on the contradiction condition, as
  every other unreadable resolve fact does — never as "none".
- The worker and disposition prompts say the closing line is not theirs to
  write, and that a deviation they fix is recorded as fixed in the addendum
  and still halts — a halt is the mechanism working.
- Run skill: the stop condition in step 5; the recovery in the after-a-halt
  procedure — decide; have it fixed, or accept it; append the dated
  `**Deviations closed:**` line on the ticket branch; finish the ticket by
  hand through the ticket skill's step 10, which DEV-2 made refuse until
  that line exists; resume. README's `/flow:run` row names the condition.
- Retro skill, two lines. The halt-classification question files a deviation
  halt under **plan** when the ticket's documents could not be built as
  written and **work** otherwise, and records what the human decided. And a
  new question: **what did the human find at the release pull request that
  no gate had surfaced** — answered from the human, written down even when
  the answer is "none found". The run skill's release pull request body
  asks the human to record such findings as a dated addendum. Both are what
  this epic's Outcome, and `design-fidelity`'s, are read from.
- `run-epic.test.mjs`: the halt; a ticket with none passing untouched; **a
  closing line on the pushed branch not passing the gate**; the missing, the
  wrong-typed and the unreadable fact each halting on contradiction; the
  halt mapping's string.

**Not in scope.** The attended doors — DEV-2. Any change to what `find
--from` reads or to the budget read beside it. Classifying deviations by
severity, or honouring a closure an agent could have written: every recorded
one halts, because deciding which departures matter is the judgment the halt
exists to hand to a human.

**Acceptance criteria.**
- The stop sentence is in the script.
  CHECK: grep -c "the run asks rather than records" plugins/flow/workflows/run-epic.mjs
- The same sentence is in the run skill.
  CHECK: grep -c "the run asks rather than records" plugins/flow/skills/run/SKILL.md
- `check-invariants.mjs` pins it, so neither copy drifts alone.
  CHECK: grep -c "the run asks rather than records" plugins/flow/scripts/check-invariants.mjs
- The driver reads deviations through their own subcommand.
  CHECK: grep -c "log-from origin/" plugins/flow/workflows/run-epic.mjs
- The retro asks what the release review found.
  CHECK: grep -c "no gate had surfaced" plugins/flow/skills/retro/SKILL.md
- `run-epic.test.mjs` covers each branch listed in scope — name the new
  tests and report the suite's count under **Verified**; the driver parses
  with CLAUDE.md's `node -e` command.
- Standing checks with counts, as DEV-1.
