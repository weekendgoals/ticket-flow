# Changelog

The plugin is the methodology's distribution mechanism: a change to a skill is
a behaviour change in every project that installs it. This file is what makes
those changes deliberate and visible. Entries land in the same commit as the
change, under `## Unreleased` between releases; a release stamps the batch
with one version and date.

## Unreleased

- **Spend sums review rounds** (`scripts/tickets.mjs` and its suite,
  `skills/ticket/SKILL.md`, `skills/run/SKILL.md`, `skills/spend/SKILL.md`,
  METHODOLOGY § "Why a round has a label, and a correction does not"). A
  figure group may open with **`round=<n>`** — `round=2 worker=… reviewer=…`
  inside a ticket's entry, `<ID> round=2 worker=…` in a run record. Labelled
  rounds for a ticket and role are **summed**; within a round the last figure
  wins, `unknown` never erases a round's known figure, and a role carrying
  both labelled and unlabelled figures reads as the labelled sum (doctor says
  so). **Unlabelled figures read exactly as before** — the last one wins, so
  no existing ledger total moves. `spend --json` gains a per-ticket `rounds`
  map (passes per summed role). `doctor` **warns** when one entry carries two
  or more unlabelled known figures for a role with no `Addendum — correction`
  between them, naming what spend counts, what rounds would total, and the
  repair (a dated addendum restating them with labels, never an edit). The
  round label lives in `RUN_GROUP`, whose three uses — the group read, the
  strip of labelled groups from an entry's own text, and doctor's
  parseable-run-record test — therefore moved together. From weekendgoals'
  CITY-14: four unlabelled rounds read as 879k of 4.4M.

- **The release body is built from the log, at either door**
  (`scripts/tickets.mjs` and its suite, `workflows/run-epic.test.mjs`,
  `skills/run/SKILL.md`, `skills/ticket/SKILL.md`, README). New subcommand
  **`tickets.mjs owed <epic> [--json]`**: every owed item the epic's status
  log records and nothing has resolved, each with the entry that owes it —
  the list `brief` already computed beside one ticket, on its own; "none
  outstanding" and exit 0 when empty, and an unknown epic is refused by
  naming the known ones. The run skill's step 7 body gains **`## Owed`**
  (pasted from that command) and **`## Unticketed commits`** (from the
  board), each written even when empty. And step 7 now has **two doors**: it
  is written to be executed without a run result, every section naming the
  command or log passage it is read from, because a run that halts never
  reaches it — after the last ticket is finished by hand the route is
  re-running `/flow:run <epic>` (pinned by two driver tests: an epic with
  nothing left to start completes with only the refresh hired), and when step
  1 refuses the board — an ABANDONED ticket reads `blocked` — an attended
  session opens the pull request by hand, section for section. The ticket
  skill's step 10 names both routes and no longer says "the driver" opens the
  release pull request (the run skill's session does). From weekendgoals'
  redesign-city: a hand-opened release said "Nothing owed" against 31 open
  items and asked nobody for the addendum.

- **Unticketed commits show on the board** (`scripts/tickets.mjs` and its
  suite, `skills/ticket/SKILL.md`, `skills/run/SKILL.md`, README, METHODOLOGY
  § "Why state is derived"). For every epic whose `origin/epic/<name>` (or
  local `epic/<name>`) exists, the script derives from git alone the
  non-merge commits between the default branch and the epic branch that touch
  anything outside `epics/` and whose subject opens with no ticket ID — work
  that reaches no status entry, no spend line and no reviewer. `list` prints
  one dim line under the epic with the count; `list --json` gains a top-level
  `unticketed` map (`{ <epic>: [{ sha, subject, epicLevel }] }`, epics with
  none omitted); `doctor` **warns** — never fails — about the commits that name
  neither a ticket nor their epic. A subject opening `<epic-name>:` marks
  epic-level work (a release review's fixes): listed, `epicLevel: true`, not
  warned about. Nothing is stored, so a merged or deleted epic branch reads
  as none. **For installed projects:** one `git rev-parse` and one `git log`
  more per epic on every board read; an open epic with ID-less code commits
  starts drawing a doctor warning.

- **A disposition that landed is read as landed** (`workflows/run-epic.mjs`
  and its suite, `skills/run/SKILL.md`, METHODOLOGY § "A missing report is not
  a missing fact"). When the disposition agent returns **no report**, the
  driver no longer halts on the silence: a read-only `disposition-facts:<ID>`
  step counts the dated review-addendum lines in the ticket's pushed entry and
  lists the code commits since the reviewed head. With an addendum on the
  branch the run continues **on the branch** — code commits always take the
  bounded re-review at the consequence tier, whose packet now carries the
  first review's Important findings on this path (and only on this path);
  Important findings with no commit after the reviewed head halt on the
  Important-finding condition; a clean review with an addendum and no code
  change proceeds. No addendum, an unreadable answer, or no review anchor:
  the old halt, unchanged — as is a disposition that *reports* `failed`.
  Ticket records gain `dispositionRecovered`, and the release pull request
  body names any ticket that merged that way.

- **No agent the driver spawns sweeps the working tree into a ticket**
  (`workflows/run-epic.mjs` and its suite, `skills/run/SKILL.md`,
  `scripts/check-invariants.mjs`, README, METHODOLOGY § "The one trip that
  halts again"). weekendgoals' redesign-city run had a disposition agent
  commit every untracked file in the working tree — 215 files, 1.9M lines —
  as a "review fix"; it halted only because one file was binary. Two changes.
  The worker and disposition prompts now carry the **staging rule** the ticket
  and quick skills already state for an in-session doer: `git add <path>` by
  name, never `git add -A`, `git add .` or `git commit -a`, with the reason.
  And a new read-only step, `fix-added:<ID>`, runs **at every tier, right
  after the disposition and before any re-review is hired**, whenever the
  disposition reports fix commits: it lists the files those commits added
  (`--diff-filter=A` from the driver's review anchor, `epics/` and the `Fix
  bounds exclude:` globs left out), and the driver **halts under a new stop
  condition** — *a review fix that adds files where the ticket never worked*
  — when one sits outside every directory the reviewed diff touched or a
  finding named, or when the list cannot be read. A path prefix decides
  "under", except at the repository root, where a reviewed file admits only
  other root-level files. An added file beside reviewed code is unchanged: it
  is still outside `reviewedFiles`, so the bounds gate trips and buys the
  bounded re-review. Ticket records gain `fixAddedFiles`. **For installed
  projects:** a run now hires one more fast-model agent per ticket that had
  review fixes, and a run that used to buy a re-review of a swept tree halts
  instead; the Codex worker runner was already safe (it refuses a tree that
  is not clean, untracked files included) and is unchanged.

- **Review fixes to the design-fidelity range, before release**
  (`scripts/tickets.mjs`, `workflows/run-epic.mjs`, `scripts/fidelity.mjs`,
  `skills/run/SKILL.md`, `skills/ticket/SKILL.md`, `skills/epic/SKILL.md`,
  README). The near-miss scan for the new `COMPARE` and `LANDMARKS` labels was
  case-blind, so an acceptance bullet beginning "Compare:" in plain English
  failed its ticket's gate — a regression for every installed project; the two
  new labels are now caught in capitals, and a `compare:` in any case when
  the line is comparison-shaped — an `@` followed by a width, bulleted or not,
  `@1440` included. (The first cut of this fix let four malformed spellings
  through unflagged, which read a ticket owing a comparison as owing none —
  the missing-comparison gate failing open; a re-review caught it before
  release. A lowercase `compare: <path>` with its widths forgotten is still
  unflagged, being indistinguishable from prose.) The acceptance
  step's prompt now names `compares`, which the driver already refused a report
  without: the step runs on a small model that reports what it is asked for,
  and the omission would have halted every ticket of every epic. Two sentences
  that still said no agent may *write* the closing line now say no agent may
  *decide* it, matching the rule above. The differ's "nothing was compared"
  refusal names the `--removed-from` repair when removals sit only in `--map`,
  and the epic skill states `COMPARE`'s hand-written form like every other
  document that teaches it.

- **The ticket reviewer sees the design** (`agents/ticket-reviewer.md`,
  `skills/review/SKILL.md`, `skills/ticket/SKILL.md`, `skills/quick/SKILL.md`,
  `workflows/run-epic.mjs` and `scripts/runners/codex-review.mjs` with its
  suite, `scripts/check-invariants.mjs` and its suite, README, METHODOLOGY §
  "Why the reviewer is handed the design"). The reviewer's packet — in all
  four copies: ticket skill step 7, quick skill step 6, the driver's packet
  body and the Codex runner's copy pinned equal to it — carries the epic's
  design sources, the **signed-off** design map (`git show
  origin/<base>:epics/<name>/design-map.json`, never the working tree's copy)
  and the entry's `**Compared:**` table. The review skill's new § 3b tells the
  reviewer to **re-run the differ where the project's instruction file says how
  to serve and drive a page** — a table the re-run contradicts is Important —
  and otherwise to audit the table against the design source's markup and
  **say the page was not rendered**; the Codex shadow reviewer, sandboxed with
  no network, never renders, and its prompt now says so. Two new lenses in the
  reviewer agent, the review skill and both `REVIEWER_RULES` copies: a
  `removed` entry added or changed **in the ticket's own diff** is Important
  (the removal list is planning's, and a worker who could not build an element
  writes a deviation), and a style assertion that reads a property off an
  element **while the page paints something else** — the visual form of the
  test that executes code without checking it.

- **The plan side of a design: one ticket owns the whole page, and a narrowing
  declares its removal** (`skills/epic/SKILL.md`, `agents/plan-reviewer.md`,
  `scripts/check-invariants.mjs` and its suite, README, METHODOLOGY § "Why a
  design is a fourth artifact"). An epic that declares `Design sources:` now
  **ends with one whole-page fidelity ticket** — a `COMPARE` with no
  `LANDMARKS:` for each design source, at every width the design draws —
  because per-section comparisons do not sum to a page that matches and what
  lies between sections belongs to no section's ticket; where the declared lane
  has no browser it is a human-owned ticket ordered before the release, never a
  line owed to the release pull request. A ground rule or scope line that
  narrows what the design draws **declares the removal** in
  `epics/<name>/design-map.json`'s `removed` list, so the comparison prints
  "removed by <rule>" instead of nothing and sign-off approves the list. The
  plan reviewer's packet gains the design sources and the map, and the agent
  gains five lenses for them (a narrowing with no `removed` entry; a ground
  rule whose premise does not reach its conclusion; **an element the design
  draws that no landmark covers**; a UI-building ticket with no `COMPARE`; no
  whole-page ticket, or one that is not last). Sign-off shows the `removed`
  list and names any UI-building ticket with no `COMPARE` as not ready.
  `check-invariants.mjs` now covers `agents/plan-reviewer.md`: it joins `FILES`
  and the "reviewers report and never fix" phrase check, which until now
  verified that rule in only one of the two reviewer definitions CLAUDE.md
  names.

- **A missing comparison stops the merge, at every door** (`scripts/tickets.mjs`
  and its suite, `workflows/run-epic.mjs` and its suite,
  `skills/run/SKILL.md`, `skills/ticket/SKILL.md`, `skills/quick/SKILL.md`,
  `scripts/check-invariants.mjs` and its suite, README, METHODOLOGY § "Why a
  missing comparison stops the merge"). New subcommand: `tickets.mjs compared
  <ID> [--log-from <ref>] [--json]` — the count of `**Compared:**` fields under
  that ticket's **own** entries, addenda included, with `deviations`' rule that
  an unreadable log is a nonzero exit and never a count of 0 (both now read the
  log through one shared reader). It is a subcommand and not a `grep` in the
  driver's prompt because `run-epic.test.mjs` stubs every agent: a counting
  pipeline in a template literal is executed by no test, and a mis-escaped
  `\*\*` would first show as a count of 0 on a live run. The driver's
  acceptance report gains `compares` (how many `COMPARE` criteria the
  signed-off section carries) and its resolve step gains FACT 5, the pushed
  entry's comparison count; a ticket that owes a comparison and records none
  **halts**, on the acceptance-check stop condition, whose pinned sentence gains
  one clause in all five files that carry it. A `compares` or `compared` fact
  that is missing or the wrong type is refused and halts — read as 0 it would
  skip the gate. The attended doors move with it: the ticket skill's step 9
  names such a ticket in the summary and the pull request body, step 10 does not
  integrate it, and the quick skill's step 7 names it in the body. Recovery
  either way leaves a record: run the differ and append the field in a dated
  addendum, or `**Compared:** owed — <who accepted it, when, and why it could
  not run>` on the human's word.

- **A `COMPARE` acceptance criterion, and the differ's exit contract amended**
  (`scripts/tickets.mjs` and `scripts/fidelity.mjs` with both suites,
  `skills/epic/SKILL.md`, `skills/ticket/SKILL.md`, `skills/quick/SKILL.md`,
  `scripts/check-invariants.mjs` and its suite, CLAUDE.md, METHODOLOGY §
  "Why a fidelity criterion is the one the code never runs"). A criterion
  bullet may carry `COMPARE: <design source path> @ <width>[, <width>]` with
  an optional `LANDMARKS: <name>[, <name>]` beneath it (absent = the whole
  page). `check <ID>` reports comparisons in their own `compares` list,
  **marked manual and counted in neither `total` nor `passed`** — this script
  has no browser and never runs one, and the driver halts when `passed !==
  total`, so a compare counted there would halt every COMPARE ticket. A
  malformed one — no width, a path the epic's `Design sources:` line does not
  list, a `LANDMARKS:` with no `COMPARE:` above it — is a ledger problem that
  fails the gate, exactly as a malformed CHECK does, and doctor's near-miss
  scan now covers both labels. The ticket and quick lanes run the differ
  (`--removed-from` filled from the **signed-off** ref, because a removal is a
  planning decision and the working map is the file the ticket edits) and
  paste its table into the entry's new optional `**Compared:**` field.
  `fidelity.mjs`: a landmark the signed-off list declares removed and absent
  from **both** reports is now a row of its own (`removed-absent`) that counts
  as compared and exits 0, instead of "nothing was compared", exit 2 — the two
  sides agreeing with the plan is evidence, and the old refusal fired only
  when such landmarks were selected alone, giving one state two answers.
  Nothing gates the table's presence yet: that is the next ticket.

- **An epic can declare what its design draws: `Design sources: <path>[,
  <path>]`** (`scripts/tickets.mjs` and its suite, `skills/epic/SKILL.md`,
  README, METHODOLOGY § "Why an epic declares its design sources"). A tenth
  optional preamble line, exposed as `designSources` by `find`/`brief`/`list
  --json` and read from the signed-off ref under `find --from` like every
  other declaration, beside `designMap` — the absolute path of
  `epics/<name>/design-map.json` when the epic has one, else null. It has its
  **own list reader**: the whole text between commas is the path, trimmed,
  rather than the glob lines' first-word parse, because designers name files
  with spaces in them and `designs/City Desktop.html` must not reach every
  reader as `designs/City` — which is also why this line carries no prose.
  `doctor` flags a near-miss label like every other declaration, and warns
  about a declared path that does not exist, naming it in full. Nothing reads
  the declaration yet: the `COMPARE` criterion, the plan reviewer's packet and
  the ticket reviewer's are later tickets of this epic.

- **A deviation is narrowed to what it was for, and closing one takes a word,
  not a sentence** (`skills/ticket/SKILL.md` steps 6 and 10,
  `skills/quick/SKILL.md`, `skills/run/SKILL.md`'s after-a-halt procedure,
  `skills/epic/SKILL.md`, the worker's instructions in `workflows/run-epic.mjs`
  and `scripts/runners/codex.mjs`, README, METHODOLOGY). On its first day the
  gate stopped three merges and none was the case it exists for: two were
  missed estimates a planner had written into tickets as conditions, one was a
  change made in answer to a review finding. **Neither is a deviation now** — a
  missed estimate goes under `**Decisions:**` with its figure, a reviewed fix in
  the review addendum, with an `**Owed:**` item to any later ticket written
  against what it moved — and the epic skill tells planners not to write a
  size into a ticket as a stop condition. **The closing line still records a
  human's decision and no agent's, but the human no longer has to compose it:**
  in an attended session an explicit answer to the departure shown ("accept",
  "fix it") is the decision, and the session records the line, naming every
  reference, quoting the answer, and ending `recorded by the session from
  <name>'s answer`. Silence, a general instruction to carry on, or an answer
  about something else is not a decision. The session may now say which way it
  would decide, labelled as a recommendation. This supersedes the
  attended-door entry below where it says "both end in a line you do not
  compose" and that a "yes" is not the human's line. Unchanged: the parser, the
  attended gate (stops on `open` above zero), and the unattended gate, which
  honours no closing line because nobody is present to answer.

- **A fidelity differ, `scripts/fidelity.mjs`** (new script, new suite
  `scripts/fidelity.test.mjs`, fixtures under `scripts/fixtures/fidelity/`;
  METHODOLOGY § "Why the fidelity differ ships no browser", `tests.yml`,
  CLAUDE.md's command list). Two subcommands and no browser: `extract` prints
  the source of one self-contained function expression, `(landmarks, side) =>
  report`, which any browser the project already has can evaluate on a rendered
  page; `diff <design.json> <page.json> --map <design-map.json>` compares the
  two reports in pure Node and prints one row per difference — a missing
  landmark, a landmark built where the plan removed it, a different `order` or
  `childCount`, or any of a fixed set of computed properties. The plugin gains
  no dependency and launches nothing, because a differ that owned a browser
  would be one a project could not install. Removals are honoured **only** from
  `--removed-from`, the signed-off map: `--map` is the file the ticket under
  review edits, so a worker who could not build an element must write a
  deviation rather than declare its own element removed. Nothing reads the
  differ yet — the `COMPARE` criterion that calls it is the next ticket's.
  Comparison is normalised (lengths within 0.5px, colours as rgba,
  `font-family` by its first family) because two renderers print one value two
  ways. Exit 0 when nothing differs or the only rows are declared removals, 1
  when anything else differs, 2 on a usage error or unreadable input — a typo
  is never reported as a difference. Exit 2 also covers the two ways a run can
  produce no evidence at all, because "no differences" over nothing compared is
  a pass nobody earned: no landmark matching on either side, and a
  `--landmarks` value that names none (`""`, `" "`, `","` — omitting the flag
  is how you ask for everything). A flag given twice is refused rather than
  last-wins, and the honoured removals' source file is named in the table
  whenever any removal row is printed, so a table pasted into a status entry
  carries its own provenance.
- **Every note is cleared by the repair it names, in both ledgers**
  (`scripts/tickets.mjs` — `parseOwed` and `parseDeviationsText` —
  `skills/ticket/SKILL.md` steps 6, 9 and 10, `skills/quick/SKILL.md` step 7,
  README, METHODOLOGY; `check-invariants.mjs` pins the phrase across the ticket
  skill, README and the script). A reference that names no item (`<ID>.7`
  against two) and, on the deviation ledger, an ID a reference ends inside
  (`<ID>oops`) retire and close nothing and say so — and their notes now stop
  being reported once a line **below** the faulty one names an item of the same
  entry correctly. Below, because the log is append-only and position is time:
  a correct reference written before the mistake was not answering it, and
  clearing on one would take away the only feedback a miscount gets while the
  item it meant is still open. "Correctly" is the entry's own item identity, so
  an entry that recorded a single item — and therefore keeps its bare ID — is
  named by that bare ID; that shape had no exit at all before, since no dotted
  reference can ever be valid for it, and a lone departure closed by a bare line
  and then "confirmed" as `<ID>.1` was a `doctor` warning nobody could clear for
  the life of the epic. An item already retired or closed counts as a
  correction, because the writer is usually naming the one they meant. The bare
  marker's and bare line's notes keep the rule they had — any itemised line for
  that entry answers them, wherever it sits — and each parser now carries the
  reason the two rules differ: a bare line is ambiguous about *which* items, so
  any itemised line answers it, while a wrong reference is one specific mistake,
  so only a later line can be its correction. Both wrong-reference notes were
  reworded to state the repair that actually clears them. Numbering, closure and
  what `open`, `count` and the owed list report are unchanged, with a guard test
  over every existing fixture in the suite saying so. **This corrects three
  entries below, and they are left as written because a changelog is a dated
  record plus its correction rather than a document to edit.** The
  deviation-numbering entry ("A deviation is closed item by item") says a
  reference naming no departure and an ID a reference ends inside "are reported
  the same way; naming any item of that entry clears the note", and the owed
  ledger's numbering entry ("An entry that owes several things is retired item
  by item") says a reference matching no item "is reported the same way" —
  true of the bare marker's and bare line's notes only, which is the defect
  this entry fixes: those clear from an itemised line anywhere, a wrong
  reference's note only from a correct reference below it. And the attended-door
  entry ("A deviation reaches the human at every attended door") gives half a
  reason that no longer holds: the notes gate nothing still, but no longer
  because a note cannot be relied on to clear — it can, now — only because a
  closing line that closed nothing leaves whatever it failed to close still
  open, so `open` already stops every departure such a line leaves undecided,
  while a note standing with `open` at zero reports a line that decided nothing
  where nothing is left to decide. A gate on advice is still a gate on advice.

- **An unattended run halts on a recorded deviation, and honours no closing
  line** (`workflows/run-epic.mjs`, `skills/run/SKILL.md` step 5 and its
  after-a-halt procedure, `skills/retro/SKILL.md`, `scripts/runners/codex.mjs`,
  README, METHODOLOGY; `check-invariants.mjs` pins the stop sentence whole
  across the skill and the script). The driver's resolve step — read-only,
  after the review and before any agent that could merge exists — now reads a
  fourth fact (a fifth when the fix-bounds gate is armed):
  `tickets.mjs deviations <ID> --log-from origin/<branch> --json`
  on the branch it would merge. Its own subcommand and its own flag,
  deliberately: `find --from` means "the epic's declarations as signed off"
  and is already read beside it for the ticket budget, so one low-effort
  proxy holding two JSONs with shared field names is exactly how a deviation
  gate ends up reading a budget document as "no deviations". The gate counts
  `count` — **every `**Deviation:**` line the entry records, closed or not** —
  and never `open`: in an unattended run the only parties who could have
  written a closing line on that branch are the worker and the disposition
  agent, both the party under review, and "accepted" versus "fixed in `<sha>`"
  is prose no parser can police. So a departure an agent already fixed halts
  too, recorded as fixed in its addendum; the halt is the mechanism working,
  and its cost is what this epic's reversal clause measures. A deviations fact
  that is missing, the wrong type, negative or about another ticket halts on
  the contradiction condition like every other unreadable resolve fact, and a
  command that exited nonzero is never read as a count of 0 — an unreadable
  status log is not "no deviations", the one direction this report can lie in.
  The worker and disposition prompts (the driver's, and the Codex runner's own
  worker prompt) now say the closing line is not theirs to write, for any
  departure including one they fixed. The run skill carries the stop sentence
  word for word and the recovery that works in the refused state: read the
  departures off the pushed branch, decide each, finish the ticket by hand
  through `/flow:ticket <ID>` — whose step 10 refuses until `open` is 0 — with
  a dated `**Deviations closed:**` line **naming the items** by the references
  the command printed, then re-run `/flow:run <epic>`. The run record carries
  `deviationsRecorded` and `deviationsOpen` per ticket.
- **The retro asks what the release pull request caught that no gate did**
  (`skills/retro/SKILL.md`, now eight questions; `skills/run/SKILL.md` step
  7). The release pull request body asks the human to record what they found
  that nothing upstream had surfaced, as a dated addendum beneath the run's
  record in `runs.md`, **including when the answer is "none found"** — an
  absent record and a zero are the same silence, and this is the only
  measurement of what the gates missed. The halt question also files a
  deviation halt under **plan** when the ticket's documents could not be built
  as written and **work** otherwise, and records what the human decided.
- **A deviation reaches the human at every attended door, and an unclosed one
  stops a release integration** (`skills/ticket/SKILL.md` steps 9 and 10,
  `skills/quick/SKILL.md` step 7, README, METHODOLOGY;
  `check-invariants.mjs` pins the pull-request-body sentence across the two
  lanes). Both lanes now run `deviations <ID>` before they show the ticket,
  and the summary names **every** departure the ticket recorded — a closed one
  **with its closing line**, because only a human may write that line and no
  command can say who did, so showing it is how a self-closure is seen rather
  than trusted; a note reporting a closing line that closed nothing is shown
  for the same reason. **A deviation is named in the pull request body** in
  both lanes that open one, under its own heading — in the quick lane that
  body is a departure's only door, there being no agent merge to refuse. And
  the ticket lane's step 10 **does not integrate a ticket with an unclosed
  deviation** into its epic branch: it reads the departures off
  `origin/<branch>` with `--log-from`, because that is the SHA it merges and a
  closing line sitting only in the checkout would clear a gate on a commit
  that does not carry it; `open` above zero stops the step before the merge
  commands, and nothing else does. Notes are shown at every door and gate
  nothing, deliberately: a closing line that closed nothing leaves its
  departure open, so `open` already stops every case a note reports, while a
  note cannot be relied on to clear — some survive the repair they prescribe,
  in a log that is append-only — so a gate on one would be a refusal with no
  recovery. A read that fails is a stop too, never "none recorded". The run
  skill's account of what a halted ticket meets at step 10 now names both
  refusals, the unfixed Important finding and the unclosed deviation, and
  `check-invariants.mjs` pins that pair as well. The step spells out both recoveries — the human
  accepts it, or the worker fixes it on the branch as new commits with a dated
  addendum and the human then accepts it as fixed in a commit — and both end
  in the `**Deviations closed:**` line, which no agent composes: dictating the
  sentence for a worker to commit verbatim is the human writing it, inferring
  it from a "yes" is not. The step also tells the human why the `<ID>.<n>`
  references matter, because a bare closing line facing more than one open
  departure closes nothing and would leave the gate still refusing — a
  recovery that does not work in the refused state is not one. Why this door:
  it is the last point at which one ticket's departure is still one decision
  rather than a paragraph inside a whole epic's release diff.
- **A deviation is closed item by item: an entry's departures are numbered
  `<ID>.1`, `<ID>.2` …, and a bare `**Deviations closed:** <ID>` against more
  than one open departure closes nothing** (`scripts/tickets.mjs`:
  `parseDeviationsText` numbers an ID's departures across every entry it heads,
  closes by the same reference grammar the owed ledger uses, and reports what a
  closing line could not close — `brief` prints those notes beside the open
  deviations and carries them as `deviationNotes`, `deviations <ID> --json`
  carries them as `notes` beside each deviation's `item` ID, `doctor` warns at the
  writer's door; both lanes, README and METHODOLOGY carry the rule and its
  reason; `check-invariants.mjs` pins the phrase across the two lanes, the
  script and README). Closure was per entry for one day: a human accepting one
  departure of three closed all three — exactly the shape that had just been
  retired from `**Resolves owed:**` after a marker naming one of an entry's four
  owed items retired all four, including a production-database hazard. The
  asymmetry is the same and so is the direction: a deviation wrongly left open
  costs a human one reread, while one wrongly closed is a decision nobody made,
  gone from every brief and every attended door in a log that cannot be edited
  to say so. A bare line still closes an entry that recorded one departure, so
  no log written before this needs an edit. A reference naming no departure
  (`<ID>.7` against two) and an ID a reference ends inside (`<ID>oops`) close
  nothing and are reported the same way; naming any item of that entry clears
  the note. Also: a `**Deviation:**` paragraph now ends at the next **bolded
  field or heading** as well as at a blank line — written directly above
  `**Owed:**` it used to swallow the next field's markup into the text a brief
  shows and a door gates on — and five sentences that defined a deviation rule
  by what an owed rule does, untrue within hours of being written because the
  owed rule moved, now state the deviation rule in their own words with their
  own reason.
- **A deviation is parsed and surfaced: the `**Deviation:**` line**
  (`scripts/tickets.mjs` — a new `parseDeviations` beside `parseOwed`, a new
  `deviations <ID> [--log-from <ref>]` subcommand, `brief`'s new section and
  its `deviations` payload field, six new `doctor` near-misses;
  `skills/ticket/SKILL.md` step 6, `skills/quick/SKILL.md` step 5, README;
  `check-invariants.mjs` holds both labels — the `**Deviation:**` opener the
  parser reads and the `**Deviations closed:**` closer — across all four
  documents). A status
  entry may carry one optional `**Deviation:**` line per departure — what the
  ticket's documents or its design showed that was not built, or was built
  differently — beside the `**Decisions:**` field that keeps the judgment
  calls the documents left open. The line exists because Decisions prose is
  read by no command: a worker recorded there, honestly, that it had not built
  a design's hero band, the sentence reached no human and no later gate, and
  the page shipped without it. A deviation is never owed work — an owed item
  is work someone will do, a deviation is a decision someone must see — so it
  is parsed and surfaced separately: `brief` now carries every deviation no
  human has closed into every later ticket of the epic, under its own heading.
  A dated `**Deviations closed:** <ID>[, <ID>] — <each deviation named as
  accepted or as fixed in <sha>; who; when>` line closes every deviation the
  named entries recorded **above it in the file**, by its leading reference
  list only — an ID cited further along, inside the note's prose, is a
  citation, not a target. Position is what a line can close: an ID can head
  more than one entry, and a departure recorded after a closing line must not
  be born closed. Both skills say the closing line is **a human's, never a
  worker's or any agent's**, because a closure the reviewed party could have
  written clears nothing. `deviations <ID>` reports **every** deviation a
  ticket's own entries recorded, closed or not, each with its closing line —
  its `--log-from <ref>` reads the status log off a pushed ticket branch rather
  than the checkout, and a log it cannot read is a nonzero exit naming the
  reason, never an empty list, because an unreadable fact must not read as "no
  deviations". It is deliberately a separate command with a separate flag from
  `find --from`, and its payload shares no field name with `find`'s: the two
  answer opposite questions about opposite refs, and swapped they would read a
  gate's answer from the wrong document. Nothing stops yet — what the doors do
  with a deviation is the rest of the `deviation-routing` epic. The status
  log's shape is unchanged: both lines are optional, `**Owed:**` is still the
  one required line, and no existing log needs an edit.

- **A reviewer hire that throws is a failed hire, not the end of the run**
  (`workflows/run-epic.mjs` `hireReviewer` and the two reviewer-spawn halt
  details, `skills/run/SKILL.md` steps 3 and 4). The driver's sanctioned
  fallback — one retry with a general agent given the reviewer's rules —
  was reached only when the first hire *returned* nothing or returned
  something that is not a review. But for an agent type the launching
  session never registered, the Workflow runtime does not return: it throws
  `agent type 'flow:ticket-reviewer' not found`, and an uncaught throw in
  the script's module body ends the whole workflow — so the fallback was
  unreachable in exactly the situation it was written for. A live run died
  this way at its first review hire (Workflow run `wf_2e558dac-83d`,
  2026-09-17, the deviation-routing epic): it failed closed, nothing
  unreviewed merged, and the run was lost. A throwing hire is now caught and
  logged with the error's first line — so a run record can quote why rather
  than report an unexplained fallback — and takes the same one retry, for
  the review and the re-review alike. The catch wraps the whole call, so any
  other rejection lands there too and is reported the same way — the
  reviewer **could not be hired**, with the error quoted, rather than a
  spawn failure the driver has not diagnosed. A fallback that also throws
  returns no review exactly as one that returns nothing does, and the run
  halts on **reviewer-spawn failure after the sanctioned fallback also
  fails** with the branch pushed and unmerged: an unreviewed ticket is still
  never merged, anywhere. No other agent spawn in the script catches a
  throw, and a test pins that — an unhandled surprise must not look like a
  handled one. Step
  3 now names the cost of running without the plugin installed (a failed
  hire per review, and reviews by the fallback rather than by the reviewer
  agent with its Edit and Write removed), which is a price and not a
  refusal.

- **An entry that owes several things is retired item by item: `brief`
  numbers an `**Owed:**` block's bullets `<ID>.1`, `<ID>.2` …, and a bare
  `**Resolves owed:** <ID>` against a multi-item entry retires nothing**
  (`scripts/tickets.mjs`: `parseOwed` splits the block, numbers the items and
  reports what a bare marker could not retire, `brief` prints the note beside
  the items and `--json` carries it as `notes`, `doctor` warns at the writer's
  door; `skills/ticket/SKILL.md` step 6 asks for one obligation per bullet and
  teaches the item form of the marker, `skills/quick/SKILL.md` step 5 the
  same; README and METHODOLOGY § "Why a worker reads a brief, not the whole
  log" carry the rule and its reason; `check-invariants.mjs` pins the phrase).
  The entry ID was the item's identity, so an entry deferring four things
  could only be repaid whole: downstream, a marker naming one of them retired
  all four, including a production-database hazard that had to survive, caught
  only because a worker had been warned to check. Two other workers had
  already seen the trap and recorded the marker's **absence** as a deliberate
  decision, paying permanent noise in every future brief to avoid the silent
  loss — a format forcing a bad choice on the people it serves. An item
  wrongly kept costs one reread; an item wrongly retired is gone from an
  append-only log with nothing left to report that it existed, so a bare
  marker facing more than one open item retires nothing and `brief` names the
  form that works. A bare marker is read against **what the entry owed when
  the line was written** — the items recorded above it, since append-only
  makes position time — so a marker that correctly closed a one-item entry
  keeps working when that entry records again later, instead of renumbering a
  discharged item back into every brief forever. The note clears as soon as
  any item of that entry is named the itemised way, which is exactly the
  repair the note prescribes: a warning whose only exit was naming items that
  are still open would push writers toward the silent retirement this rule
  exists to prevent. A reference matching no item (`<ID>.7` against a
  two-item entry) is reported the same way — the skills now ask workers to
  hand-write these, so a miscount is the expected error, and it was the one
  error with no feedback anywhere; a mistyped reference does not clear the
  note either, since it retired nothing. A reference must also END where its
  ID ends — `<ID>oops` is not `<ID>`, and anchoring at the start alone let a
  typo's prefix silently discharge a one-item entry — and a dotted reference
  is read against the items recorded ABOVE it, the way a bare marker already
  is, so a number that pointed past the end of the entry when it was written
  cannot retire an item that entry records days later. A marker naming an entry the log
  does not record stays silent, because `**Resolves owed:**` does not cross
  epics and a cross-epic marker is a legal thing to write. **Existing bare
  markers against multi-item entries stop resolving** — those items reappear
  in the brief, which is the safe direction; repair by appending a dated
  addendum naming the items, never by editing the entry. Measured on the live
  downstream logs: nine items reappear across three epics, three of them
  genuinely open obligations a bare marker had silently retired. Same commit fixes three further losses
  in the same parser, each found by running it over live downstream logs:
  a bullet list separated from `**Owed:**` by a blank line — the idiomatic
  markdown shape — was dropped whole, because the block was read as ending at
  the first blank line (it now runs to the entry's next field, heading or
  prose paragraph, and a wrapped bullet still arrives joined, while a
  sub-bullet stays part of the item above it so the numbering counts what a
  reader counts); an ID heading more than one `**Owed:**` block, which an
  append-only log allows, gave two obligations one identity, so numbering is
  now per entry across its blocks; and "Nothing" empties only a block with no
  bullets — the convention is how an entry declares the field empty, and
  applied to a bullet it dropped all five items of an entry whose first
  bullet opened "Nothing in this ticket has met Postgres".

- **The acceptance ledger has a third verdict: a check whose evidence is a
  skip is `↓ skipped`, and a skipped check is not a passed one**
  (`scripts/tickets.mjs`: `runChecks` decides it and `check` prints and
  counts it, with a `skipped` count and a per-check `status` in `--json`;
  `workflows/run-epic.mjs` reads the count and names the skip in the halt;
  `skills/epic/SKILL.md` requires an EXPECT a skip cannot satisfy;
  `skills/ticket/SKILL.md` and `skills/quick/SKILL.md` say a `↓` line is not
  a count you may report as passed; README and METHODOLOGY § "Why acceptance
  criteria can be machine-runnable" carry the rule and its reason;
  `check-invariants.mjs` pins the phrase across the six documents). Measured
  downstream: console-foundations CF-3 reported `4/4 checks passed` while
  every evidence line read `↓` — its Postgres suites skipped themselves for
  want of `DATABASE_URL` (the house `describe.skipIf(...)` convention),
  vitest exited 0, and the verbose reporter still printed the titles the
  EXPECT strings matched. Every ticket in that epic then needed a human to
  eyeball the markers, which is the check the gate exists to perform.
  **Skipped is not passed**, because a run that did not happen proves
  nothing and must never green a merge gate; it is **not failed** either,
  because the code is not what is wrong and a red verdict sends a reader to
  debug working code instead of supplying what the run needed. With an
  EXPECT, a skip on **any** line carrying the EXPECT text decides unless
  another of them shows something having run — the criterion names one test,
  so its neighbours passing is not evidence for it, and a runner that echoes
  its argv (`npm test -- <file>`) prints the EXPECT string on a line that
  proves nothing. A line showing a run still wins, so one skipped file inside
  a suite that ran does not turn the ledger red. With no EXPECT, where exit 0
  is the whole evidence, the question widens to the whole output (some line
  reports a skip, no line reports anything having run) — and so it does when
  an EXPECT's own matching lines show neither, which is the argv echo's
  second shape: the runner names the file while starting and counts files
  when it reports the skip, so narrowing the question to the matching lines
  greened a suite in which nothing ran. TAP is read by its per-test lines as
  well as its summary — `ok N` is a run, while `not ok` and an `ok N`
  carrying `# SKIP` are not — because a TAP producer need print no summary at
  all, and without that one `# SKIP` beside a real pass read as a run in
  which nothing happened, halting a run on working code. Detection is shape,
  not meaning: a runner's skip glyph starting a line (`↓`, `○`) or a skip
  **count** (`12 skipped`, `skipped (12)`, TAP's `# SKIP`) — the count is
  what keeps the bare word out, so a criterion may still assert that
  something "is skipped". Coverage is bounded and named: vitest, jest,
  `node --test` and TAP are matched; mocha's `N pending` and `go test`'s
  `--- SKIP:` are not, because a detector guessing at every runner's
  vocabulary starts failing correct runs. The recovery works from the refused
  state either way: supply what the run needed, or point EXPECT at a line
  that proves it ran — which is also what `agents/plan-reviewer.md` now asks
  for, so a criterion red only because its suite skipped itself is a finding
  at the door where CHECKs are proven red. Exit codes are unchanged — a skip
  exits 1 like any ungreen gate, so the driver's acceptance step still
  reports it as "ran" — and the driver halts on the skip count as its own
  condition, the way it already re-derives `problems > 0` and
  `passed !== total`, so a self-contradictory report merges nothing. The skip
  count is refused like every other count rather than defaulted to 0 — the
  one figure that names skips cannot be the one figure a report is allowed to
  omit — and the ticket record carries `acceptanceChecksSkipped` whether or
  not acceptance was reached, so a halted record and a merged one have the
  same shape and the run summary prints the skips beside the counts. The
  acceptance stop condition names the skipped criterion as a fourth member in
  all four documents that state it, because a retro files halts by that
  string and a skip filed as "did not produce its expected result" is the
  conflation the third verdict exists to end.
- **The revert check: a ticket names the test that fails with its source
  change reverted, and the reviewer opens that test** (`skills/ticket/SKILL.md`
  step 5 and its Verified field, `skills/quick/SKILL.md` step 5,
  `agents/ticket-reviewer.md`, `skills/review/SKILL.md`, the driver's
  `REVIEWER_RULES` and the Codex shadow reviewer's copy;
  `check-invariants.mjs` holds the phrase in all five documents). Before a
  ticket is called done the worker commits, reverts the ticket's own
  commits (`git revert --no-commit $(git rev-list --no-merges
  <base>..HEAD)` — by SHA, because a merge commit in the range stops a
  plain range revert), checks the tests back out of HEAD and removes any
  the ticket had deleted, runs, restores with `git revert --abort`, and
  writes on the Verified line which test went red. Two diffs name none and
  say why, because the reason is what the reviewer checks: `revert check:
  n/a, prose-only` for a diff that is prose by the review tier table
  (documentation and code comments only; skill and agent Markdown is not
  prose), and `revert check: nothing to pin — <reason>` for behaviour no
  assertion can hold — a tests-only ticket, a *demonstrate:*-verified
  change, a project with no test runner (owed). Nothing going red otherwise
  means the tests pin nothing and the ticket is not done. Each new guard,
  branch and error path is flipped in turn on the same terms. The reviewer
  does not take the line: it opens the named test and confirms it depends
  on the change, and a test that would pass without the change, or an
  `n/a` whose reason does not hold, is **Important** — in the severity
  tables and in every disposition door (ticket step 8, quick step 6, the
  driver's disposition prompt) beside the regression as a nit that never
  is, so an unattended run halts on it rather than merging a ticket with
  no evidence behind it. This replaces
  the dormant "if mutation testing is configured" sentence with the
  one-mutant version that needs no tool; a configured mutation tester
  remains the same check at scale. Taken from adk-go's PR template and
  self-review skill.

- **A user-visible regression the change introduces is Important, never a
  nit parked for the retro** (`agents/ticket-reviewer.md`,
  `skills/review/SKILL.md`, the driver's `REVIEWER_RULES`, `REVIEW_SCHEMA`
  and disposition prompt, `skills/ticket/SKILL.md` step 8,
  `skills/quick/SKILL.md` step 6; `check-invariants.mjs` holds the rule's
  phrase in all five). Something that worked before and now visibly does not
  — a duplicated or missing control, a broken layout, a removed way to do
  something — is reported Important even outside the ticket's scope, and a
  disposition may not relabel it a nit and hand it to the retro. The retro
  runs after the release: weekendgoals' redesign-foundation shipped a double
  hamburger button and double logo that both reviews had seen and filed as
  "nit, owner retro". No new gate: an unfixed Important finding already
  halts an unattended run and blocks the attended merge; the incremental and
  quick lanes name it as unfixed in the pull request body. The Codex
  shadow-review runner (`scripts/runners/codex-review.mjs`) carries the same
  rule in its copy of the reviewer rules and schema, so both reviewers judge
  by one bar.

- **A halt never leaves a Codex run editing the session's tree unseen**
  (`workflows/run-epic.mjs` worker proxy prompt and its tests;
  `skills/run/SKILL.md` step 3's worker-runner bullet and step 5;
  README's `Worker runner:` row; `scripts/runners/codex.mjs` keys its state
  by the repository's real path). The runner's own guards (the entry
  below) are the floor; these are the doors in front of it. The worker
  proxy now follows a cancel rule: before reporting anything other than a
  report the wait command printed — its wait bound spent, a start or wait
  that printed no JSON, unexpected output, a permission prompt — it runs
  `codex.mjs … --cancel` (same arguments, 600000 ms shell timeout) and puts
  the output in `detail`, because the detached run outlives the proxy and a
  Codex left running keeps editing the tree the halted session goes on to
  use. Step 5 gains a precondition for `Worker runner: codex`: before
  checking out, editing or committing anything after a halt on a Codex
  ticket, run that ticket's `--cancel` (the command is spelled out) and read
  what it reports; uncommitted paths it names are the stopped run's
  unreviewed work, named in the Diagnosis and never swept into the
  run-record commit — committed with `git commit --only
  epics/<name>/runs.md`, because a run stopped between `git add -A` and its
  commit leaves its edits staged, a checkout carries a staged index across,
  and a plain `git commit` commits the whole index (the cancel report counts
  staged paths apart). Step 3's warning now covers
  the halt record as well as resuming. The state directory is keyed by the
  repository's real path, so a cancel typed through a symlinked spelling of
  the same repository still finds the run instead of reporting nothing to
  cancel.

- **A detached Codex run can be cancelled, and cannot commit anywhere but
  its ticket branch** (`scripts/runners/codex.mjs`; `codex.test.mjs` gains
  nine cases). A background run outlives the proxy that started it, so a
  proxy that returns early — the wait bound spent, a `--wait` killed at a
  forgotten 2-minute shell default, the agent dying — used to leave Codex
  editing the session's tree while the driver halted. The halted session
  then checks out `epic/<name>` to write the run record, and when Codex
  stopped the runner ran `git add -A` and `git commit` on whatever was
  checked out: an unreviewed `<ID>: …` commit on the epic branch, published
  by its next push past review, the CHECK re-run and the SHA merge. Now, in
  depth: (a) the runner commits and pushes only when HEAD is the ticket
  branch it checked out, and otherwise commits nothing and reports
  `halted` / `other` naming the branch it found and the uncommitted paths it
  left; (b) `codex.mjs … --cancel --json` (same arguments) stops the
  current attempt's whole process group — the background run leads it and
  Codex is a member, so an orphaned Codex is reached too — marks the
  attempt consumed first, and prints a halted `"state":"cancelled"` report
  naming what it stopped and what the working tree holds; it is idempotent,
  a no-op report when nothing was started, and a live pid is signalled only
  when `ps` shows it is this attempt's runner, so a reused pid is never
  hit; (c) `--wait` stops what a dead run left before reporting it failed,
  and `--start` does the same before opening a new attempt, so two Codex
  sessions never share a tree. **Attempts are keyed**: every launch is a
  numbered attempt with a random nonce, its record created with O_EXCL (two
  racing `--start`s launch one run) and its report written under its nonce,
  so a run presumed dead that writes late cannot answer a newer attempt's
  `--wait`; a background run that finds its attempt cancelled or superseded
  stands down before launching Codex and again before committing. An
  unread finished report is attached to only while it is at most one wait
  slice plus a minute old (600000 ms) — the longest a proxy following the
  start-then-wait contract takes to read its own run's report — so a later
  run is handed an earlier attempt's answer only if it starts within that
  window of the answer landing with the answer unread and uncancelled. And
  `git fetch` and `git push` are bounded by `--git-timeout` (default five
  minutes, with `GIT_TERMINAL_PROMPT=0`), mapping a hang to a `halted` /
  `other` report rather than a detached run hung forever. The launch-grace
  and hung-pid backstops are now tested on fabricated state.

- **A Codex worker ticket no longer dies at its proxy's shell ceiling**
  (`workflows/run-epic.mjs` worker step and its tests; `skills/run/SKILL.md`
  step 3's worker-runner bullet and step 4's worker description; README's
  `Worker runner:` row). The fast-model proxy used to run the runner as one
  blocking command, told to wait for it to finish; its shell tool kills any
  command after at most 10 minutes (600000 ms), and a full ticket routinely
  runs longer — so the command was killed mid-ticket, no JSON reached the
  driver, the run halted as BLOCKED ("the worker returned no report"), and
  the runner could die before its commit and push with Codex still editing
  the tree. The Codex lane could not complete a real ticket as shipped. The
  proxy now runs `codex.mjs … --start` exactly once, then `codex.mjs …
  --wait --max-wait 540000` with its shell timeout set to 600000 ms each
  time, until the output is not `"state":"pending"`, and relays that report
  verbatim as before. The loop is bounded by the runner's own timeout, now
  passed explicitly (`--timeout 3600000`) so bound and timeout cannot drift:
  at most ceil(3600000 / 540000) + 1 = 8 waits, after which the proxy
  reports `halted` / `other` with the last pending output in `detail`. The
  schema, the verbatim relay, the no-main rule and the halt mapping are
  unchanged. The skill now tells the operator that a session ending
  mid-ticket leaves the Codex run going to its own commit and push, and to
  let it finish before resuming.

- **The Codex runner can be started once and waited on in slices**
  (`scripts/runners/codex.mjs` gains `--start` and `--wait [--max-wait
  <ms>]`; `codex.test.mjs` gains four cases). `--start` launches the
  ordinary single-shot run as a detached background process — its own
  session and process group, stdio on a log file — and returns at once;
  the run writes its report atomically (temp name, then rename) to a state
  directory under the OS temp dir derived from the label, ticket,
  repository and epic, so `--start` and `--wait` with the same arguments
  find it without a path being passed. `--wait` blocks at most `--max-wait`
  ms (default and ceiling 540000) and prints the report verbatim, or
  `{"state":"pending"}`, or a halted worker report carrying
  `"state":"failed"` when no run was started or the background process died
  without a report (a dead pid, or no report ten minutes past the runner's
  timeout), so a crashed run never reads as pending. `--start` attaches to
  a run that is live, or finished with its report unread for at most
  600000 ms (see the next entry), instead of launching a second Codex on
  the same tree. The single shot is unchanged. Why:
  the run driver reaches the runner through an agent's shell tool, which
  kills any command after at most 600000 ms, and a ticket needs the
  runner's 60-minute timeout — shortening the ticket to fit the tool breaks
  the work, slicing the wait does not. The suite's evidence is empirical: a
  `--start` run from a shell in its own process group outlives the
  launching process and a SIGKILL of that whole group (with `detached`
  switched off the same test fails), then finishes, commits and pushes.

- **Trial: a Codex shadow review** (`scripts/runners/codex-review.mjs` and
  its stub suite, `workflows/run-epic.mjs`'s `shadow:<ID>` step and
  `shadowReviewer` arg, `Shadow reviewer:` parsed by `tickets.mjs`, the run
  and epic skills, README). An epic declaring `Shadow reviewer: codex` gets,
  on each consequence-tier ticket of an unattended run, one Codex review of
  the Claude reviewer's packet — read-only, no network, its own worktree at
  the reviewed head, answering in the reviewer's schema — right after the
  first review. It is blind both ways and gates nothing: a failure (Codex
  missing, signed out, over its 9-minute bound, no report) is recorded and
  the ticket proceeds; its spend is left out of the ticket budget. The run
  session writes the results to `epics/<name>/shadow-reviews.md`, a file no
  script reads, and the retro compares them by hand. **Removing the trial:**
  `git revert` the one commit that added it, or by hand delete the runner
  and its suite; the `shadow:<ID>` block, `SHADOW_*`, `shadowReviewer` and
  `shadowSpend` in the driver and its `shadow reviewer` tests; the
  `shadowReviewer` grab and keys in `tickets.mjs`, its `declNear`/
  `declStrict` alternatives and near-miss message, and in `tickets.test.mjs`
  the fixture line, the `Shadow reviewer` test and the key in every `modes`
  literal; the lines naming the trial in the run, epic and retro skills,
  README, CLAUDE.md and CI.

- **The plan reviewer asks what the lane can execute and what the evidence
  can show** (`agents/plan-reviewer.md` gains two questions; `skills/epic/SKILL.md`
  carries each as one clause — the step 3 Outcome template, the ground-rule
  bullet and the step 5 sign-off; METHODOLOGY § "Why the plan is reviewed
  before sign-off" records the evidence and § "Why an epic states its
  outcome" adds the matching clause). One: for every ground rule and every
  acceptance criterion, name the actor that executes it in the **declared
  delivery mode** and confirm that actor exists there — an unattended
  release worker spawns no agents, holds no phone and drives no interactive
  tool. Groundhopper-log required seventeen per-language agents in an epic
  run unattended, so nine consecutive tickets recorded the deviation and
  shipped anyway (92 damaged strings, three follow-up tickets), and ten
  "demonstrate on a phone" criteria deferred to the release pull request
  merged unperformed; a criterion the lane cannot perform is now its own
  ticket with a human owner, ordered before the release, never a line owed
  to a pull request. Two: for every Outcome evidence clause, name what will
  produce it and check the observer can tell success from failure —
  redesign-foundation promised `h6count = 0` on every page type with the
  check wired into two of nine, and a four-week reading of a GA4 event two
  controls share. Naming an observer was already required and is not enough:
  an observer with nothing to read reports nothing. Both questions are asked
  by a human or a fresh-context agent reading the draft; neither is
  automated, because the actor a rule needs and the source an evidence
  clause depends on are not in the text of the document.

- **A halted run record must carry a `**Diagnosis:**` paragraph, and the
  retro reads it first** (`skills/run/SKILL.md`: the step 6 record template
  gains the field, and step 5's halt path names it where the halted session
  is told what to append; `skills/retro/SKILL.md`'s seventh question reads
  the paragraph before the **Halted on:** line and says why the
  classification stays the miner's). The evidence is August's two plugin
  fixes: the check runner's `maxBuffer` (`4eb0f4b`) and the
  shape-matched addendum-date lookup (`9a859c7`) both exist because a driver
  wrote a diagnosis when nothing asked for one — a 68/68 suite dying on
  ENOBUFS, and a reviewed green ticket failing a date-string grep — while
  three fresh-context retros read straight past twelve halts that carried
  only a stop condition. The halt reason is the machine's account of where
  it stopped; the diagnosis is what inspection found, including the file and
  line and the command re-run by hand. It is **evidence, not a verdict**: the
  retro's miner still classifies the halt, because the run that stopped
  cannot judge its own stop. Records written before 2026-09-14 carry no
  diagnosis and are classified from the halt line, so nothing is retrofitted
  into an append-only log.

- **METHODOLOGY states what `--from` protects and what it does not**
  (§ "Why acceptance criteria can be machine-runnable", § "Why the run loop
  is code, not prose"). The doctrine said reading the criteria from the
  signed-off document meant the reviewed party "structurally cannot soften
  its own gate", which claims more than the mechanism delivers: `--from`
  secures the command string and nothing the string reaches — not the npm
  script it invokes (redesign-foundation's FND-5 created the `test:it` script
  its own criterion runs), not the spec file that script executes, not the
  assertion inside it. HARD-1's `allPassed` gate and RUN-2's red-before rule
  close part of that gap; the human at the release gate, reading one diff
  carrying both the criterion and the code it judges, closes the rest. The
  run-loop section gains the matching bound on the reviewer fallback: one
  general agent covers a crashed reviewer, not an exhausted environment,
  because it shares the primary's failure mode — both spawns hit the same
  session limit in groundhopper-foundation on 2026-08-24 — and halting there
  was correct, since the review the human resumed into found two Important
  findings. A gate believed to prove more than it proves is a gate nobody
  re-examines.

- **Run records move to `epics/<name>/runs.md`, so the run and its tickets
  stop writing to one file tail** (`scripts/tickets.mjs`: `runsDoc` in
  `discoverEpics`, `epics --json` and `find --json` — the latter with
  `runsDocExists` — `parseSpend` reading both logs, doctor's run-record scans
  covering both files and a new misfile warning; `workflows/run-epic.mjs`'s
  two `next` strings; `skills/run/SKILL.md` step 6 with the new file's
  preamble; `skills/retro/SKILL.md` steps 2, 3 and its halts question;
  `scripts/check-invariants.mjs` holding the run log's **Rules** block to the
  status log's and the file's name across the five documents that state it;
  README's document table and `spend` paragraph; METHODOLOGY § "Why the run
  loop is code"; three new script tests, two new invariant tests). A ticket
  worker appends its status entry on a ticket branch while the run session
  appends the run record on the epic branch, so every mid-ticket halt
  followed by a hand merge conflicted on `status.md` — the groundhopper
  run's reconcile merge `a5d96449` is the recorded case. Splitting the files
  removes the shared tail instead of teaching git to paper over it: the
  considered alternative, a `merge=union` attribute on `epics/*/status.md`,
  is one line but per-project configuration a doctor probe can only nag
  about, and union also hides an overlapping edit — which append-only
  forbids — instead of surfacing it as a conflict. **Nothing migrates.**
  Every log written before the split keeps its run records in `status.md`
  and `spend` still reads them there; `runs.md` is created, with the status
  log's **Rules** block verbatim, by the first record written after an epic
  splits. The one new warning is date-scoped for the same reason: once an
  epic has a `runs.md`, a `### Run —` record in `status.md` dated on or
  after the first record in `runs.md` is flagged as a misfile (repair by
  appending it to `runs.md`, never by deleting the committed copy), and
  records that predate the split are never flagged, because moving them is
  exactly what append-only forbids and a warning whose only recovery is
  forbidden is worse than none. Nor is a record whose heading already appears
  in `runs.md` — that is what the repair looks like — nor one dated on the
  split day itself, since a date carries no time to order it by; and a
  `runs.md` carrying no parseable record is itself flagged, because nothing
  then dates the split and the scan would silently check nothing. **Two logs
  need a stated ranking, and this is it:** where both carry a figure for the
  same ticket and role, `spend` takes the one in `runs.md` (so a correction to
  a run record's figures is appended there), and an `unknown` never overwrites
  a known figure in either direction — `unknown` is the absence of an
  observation, not a correction, so a halted run that read no meter no longer
  erases the figure the finished ticket's own entry recorded. The run skill's
  step 6, the spend skill and README's `spend` paragraph all state it.

- **The per-ticket token budget is re-read from the signed-off epic ref
  before every merge, so raising it mid-run reaches the run that tripped it**
  (`scripts/tickets.mjs` gains `find --from <ref>`; `workflows/run-epic.mjs`
  `RESOLVE_SCHEMA`, a new FACT 3 in the resolve prompt and a re-read block in
  the resolve gate; `skills/run/SKILL.md`'s args block, `Resolves` bullet and
  two stop conditions; `skills/epic/SKILL.md`'s `Ticket budget:` template
  line; README's configuration table and its `--from` paragraph; six new
  driver tests and two new script tests). A live run halted on a budget the
  human had already raised 24 minutes before the merge that tripped it:
  `args.ticketBudget` was read once at launch, so the halt's own advice —
  "raise the epic's Ticket budget line" — could not be taken without
  abandoning the run. The ceiling is now read per ticket at **the resolve
  step**, which fetches the epic branch and reads the signed-off document
  from it before the merge: `git fetch origin epic/<name>`, then
  `tickets.mjs find <ID> --json --from origin/epic/<name>`. Three things
  make that read mean something. *Before the merge*, because a halt over a
  ceiling the run cannot read must merge nothing. *`--from`*, because reading
  the budget after the merge, off the tree the merge produced, would let the
  ticket branch's own copy of the preamble set the ceiling that judges it;
  the acceptance gate reads `check --from origin/epic/<name>` for exactly
  that reason, and `find --from` is the same move for the epic's
  declarations. *The fetch*, because `--from` reads the local
  remote-tracking ref and nothing updates it between the ticket's start and
  the resolve step — the run's only full fetch is in refresh+select, before
  the worker, and the merge's `git pull --ff-only` comes after the read, so
  without it the ceiling would be the one that stood hours ago, reproducing
  FND-1's timeline exactly. With it, a human's raise committed and pushed to
  the epic branch while the ticket runs is on that ref before the resolve
  step reads it, which is the case the change exists for. A fetch writes
  refs and nothing else, so the resolve step is still read-only in the sense
  that matters. `args` stays the launch-time value
  and is validated as before; three code checks guard what arrives, because a
  fact with no check is a fact the report can invent: a value present but not
  a positive integer (and a report missing the field altogether) halts as a
  contradiction with the value fenced; a ceiling declared where the runtime
  has no meter is refused exactly as launch refuses it; and a reported `null`
  where a ceiling was in force **keeps that ceiling and logs it**, because
  `**Ticket budget:** 600k` parses as null and the run never runs doctor — a
  formatting slip must not lift a ceiling silently. Each of those halts
  records the ticket's meter delta first: a halt whose subject is the
  spending must not report `unknown` for what was spent. Only this line is
  re-read: `Reviewer model:`, `Consequence paths:` and `Fix bounds exclude:`
  stay launch-time, since changing who judges or what is scrutinised mid-run
  would rewrite the terms the sign-off set.

- **An eighth preamble line, `Fix bounds exclude:`, lets an epic exempt
  mechanical fan-out files from the run's fix-bounds gate**
  (`scripts/tickets.mjs` preamble parse, doctor near-misses and both JSON
  exposures; `workflows/run-epic.mjs` args validation and resolve step;
  `skills/run/SKILL.md`; `skills/epic/SKILL.md`'s preamble template;
  README's configuration table; two new tests in each suite). A live run
  halted a green ticket whose review fix added a translation key: the
  catalog fan-out — one key touching every locale file — blew the fix line
  budget, which was measuring the catalog's width, not the fix's blast
  radius. The epic may now declare comma-separated globs (e.g.
  `src/messages/*.json`) that both of the resolve step's fix-diff commands
  exclude the same way they already exclude `epics/`, so an excluded file
  cannot reach `fixFiles` or `fixLines` and a pure fan-out neither halts nor
  buys the bounded re-review a trip costs. Deliberately configuration, not a
  hardcoded path: baking one project's i18n layout into the shared driver
  would silently exempt translation-named paths in every installed project,
  and per-project path policy belongs in the epic document, visible at
  sign-off, like `Consequence paths:`. Validated on the same terms — an
  unusable glob refuses the run before the first agent is spawned, because a
  glob line that cannot be applied is fixed in the document, never silently
  approximated. The narrowing is visible afterwards: the ticket record carries
  `fixBoundsExclude` (`[]` when the gate measured the whole fix) and the run
  logs the applied globs, so a retro can tell a gate that measured everything
  from one a broad glob narrowed to nothing — legal by design, and the
  human's call at sign-off, which is why it is recorded rather than inferred. **This line shipped once before and never arrived:** PR #42
  merged on 2026-08-27 as `8ac3bef` into `addendum-gate-date`, a branch that
  had already been merged, so the commit reached no release and no epic
  could use the line it documented. Re-landed here against the current
  driver — RUN-1's bounded re-review and HARD-1's `anchorHead` moved the
  resolve step underneath it — rather than replayed as a cherry-pick.

- **The unattended acceptance gate reads the ledger's verdict, and the review
  anchor is the driver's own read** (`workflows/run-epic.mjs`
  `ACCEPT_SCHEMA`, the acceptance prompt and its code gate; `TIER_FACTS_SCHEMA`
  and the tier-facts prompt; the review packet and `REVIEW_SCHEMA`;
  `skills/run/SKILL.md`; six new driver tests). Two holes in the merge gate.
  **One:** the gate compared `passed !== total`, and a malformed CHECK line
  runs nothing — so `passed === total` is trivially true on a criterion
  nobody can satisfy, and the run merged it (RUN-2's reviewer found the
  shape). The proxy now reports the ledger's own `allPassed` verdict and the
  number of `problems` the script printed; the gate halts on
  `STOP.acceptanceCheck` unless `allPassed === true`, halts on any malformed
  line even when every runnable check passed, quotes the problem text, and
  halts as unreadable evidence when either field is missing — a gate that
  cannot read its own evidence merges nothing. The prompt's old sentence
  "exits 0 when every check passed and 1 when any failed" was wrong about
  exit 1 and is corrected. **Two:** `reviewedHead` — the anchor the
  fix-bounds gate measures from — came back inside the reviewer's own report,
  which is the party under review saying which commit was reviewed. The
  driver now reads it itself in the read-only tier-facts step before the
  reviewer is hired, hands the reviewer a SHA range
  (`origin/epic/<name>...<sha>`), and keeps the reviewer's number only as a
  cross-check: a disagreement is logged and the driver's anchor wins. The
  re-review packet no longer asks for a field `RE_REVIEW_SCHEMA` cannot
  carry, and gets its own range — `<reviewedHead>..origin/<branch>`, the fix
  commits themselves — because the anchored range the first review read
  predates them. No usable anchor still routes the fixes to the bounded
  re-review — doubt raises scrutiny, never lowers it. The
  `STOP.acceptanceCheck` sentence grows to name all three halts the gate now
  fires on (a failing check, a CHECK too malformed to run, a report the gate
  cannot read), with the run skill's step 5 copy and `check-invariants.mjs`
  moving in the same commit; `PHRASES` pins the sentence whole.

- **The retro asks what every halt bought** (`skills/retro/SKILL.md` step 4's
  question list and step 5's proposals, README, METHODOLOGY § "Why an epic
  ends with a retro"). Step 4 is seven questions now, not six: the seventh
  reads every `### Run —` record's **Halted on:** line and classifies the
  halt as **work** (a defect in the implementation), **plan** (a defective,
  vacuous or decorative CHECK, a wrong assumption in `tickets.md`),
  **plugin/environment** (the driver, a spawn failure, a session limit, a
  buffer, a tooling fault) or **policy** (a budget or bounds trip), with what
  the human did to resume and whether the later record shows the stop retired
  a real risk or fired on a clean state. Step 5's proposals gain the matching
  **Halts** section. The first three release epics run unattended halted
  twelve times across twenty-three tickets — 5 plugin/environment, 4 policy,
  2 plan, 1 code — and not one of those halts was ever examined, because none
  of the six questions asked and each halt cost a human a resume that
  appeared in no other section. Two classes are flagged **transferable**,
  because the epic that paid for the lesson is rarely the one that can act on
  it: a policy trip whose later re-review found nothing is a proposal against
  the policy, and a plugin/environment halt is a ticket for the plugin's own
  repository. The classification is the retro's reading, not the driver's
  claim — the run that stopped cannot judge its own stop — so the run record
  is unchanged and nothing in `tickets.mjs` automates it.

- **After a halt: finish the ticket by hand, then re-run — never resume**
  (`skills/run/SKILL.md` step 1 and a new `## Resuming after a halt` section,
  METHODOLOGY § "Why the run loop is code, not prose", a new
  `check-invariants.mjs` phrase over the run skill and METHODOLOGY, one new
  drift test). The recovery after a halted run was written nowhere, and the
  step 1 refusal on an `in-progress` / `in-review` / `done` ticket named no
  way out of the state it refused. It now does: finish that one ticket by
  hand with `/flow:ticket <ID>` — a supervisor-spawned worker performs step
  10's gate and merge by verified SHA — then re-run `/flow:run <epic>`, which
  the board makes safe because `next` hands out only `todo` tickets and
  `integrated` ones are skipped. A halt *before* the status entry exists
  needs only the re-run. **Never `resumeFromRunId`:** the Workflow runtime
  replays every unchanged `agent()` call from the prefix cache, and a run
  halts because something outside the script changed — groundhopper-
  foundation's 2026-08-25 resume "replayed the stale failed acceptance from
  cache (0 tokens) and halted again" after the plugin fix that would have
  cleared it, and a resume after a pushed fix would re-review a branch that
  already carries a committed addendum. The section sorts the halt by the one
  thing the board reads — the ticket's **status entry** — because the worker
  writes it and pushes its branch *before* the driver hires a reviewer, so a
  halt message usually names a stage the ticket had already passed: no entry
  (`todo`, or `in-progress` on a local branch) re-runs; a DONE entry on a
  pushed branch is finished by hand; a BLOCKED entry waits for a human to
  resolve or re-plan. `skills/ticket/SKILL.md` makes that recovery real
  rather than advertised: when step 1 reports the ticket `done` or
  `in-review` and `origin/<branch>` exists, the worker builds nothing — step
  3 checks the existing branch out instead of running `git checkout -b`,
  which fails on it — and the leg resumes at step 7, 8 or 10 depending on
  whether the branch's entry already carries a review addendum. Doctrine
  only: `run-epic.mjs` is unchanged.

- **A CHECK criterion must be red before its ticket is built**
  (`skills/epic/SKILL.md` "Rules that matter" and step 5,
  `agents/plan-reviewer.md`, `scripts/tickets.mjs` `parseChecks`, two new
  `CHECK shape` cases and the K-7 fixture in `tickets.test.mjs`, README,
  METHODOLOGY). A CHECK written at planning time and already green on the
  current tree proves nothing about the ticket and merges green whatever the
  worker builds. The planner now runs every CHECK it writes before sign-off,
  records the ledger in the draft (proven failing; could not run here and
  why), and shows it at the gate; the plan reviewer **re-runs** the runnable
  ones under a 60-second per-command bound, skips and names the rest, and
  reports as findings a CHECK that passes on the current tree, one whose
  command errors, and a ledger claim it cannot reproduce. The same rule
  retires the decorative whole-suite CHECK (`EXPECT: Tests:` passes on the
  pre-ticket tree too — six of groundhopper-foundation's eight CHECKs were
  this): the suite is a standing check reported under **Verified**, and a
  CHECK names the one test, assertion or fact the ticket turns green.
  `doctor` gains two shapes under its existing CHECK scan, each flagged with
  the sentence saying why it can never pass: `\\|` inside a quoted
  `node -e` / `sh -c` string (the quoting layer consumes one backslash, so
  grep receives a literal `|` — FND-2's `MobileSidebar` CHECK passed on every
  tree this way), and `grep` given both `-r` and `-c` in any spelling
  (recursive counting prints `path:count` per file, never a bare number —
  FND-6's printed `file:0` against an `EXPECT` of `1` and halted a live run
  on correct code). A sound single-file `grep -c` is not flagged, and the
  fixture carries GHF-1's to pin it. Both shapes ride the shared
  `parseChecks` problems list, so `check <ID>` fails the gate on them too.
  Doctor stays read-only: it never runs a CHECK.

- **A fix-bounds trip buys a re-review, not a halt** (`workflows/run-epic.mjs`
  resolve step and re-review, four new `bounds trip` cases plus the updated
  existing ones in `run-epic.test.mjs`, `scripts/check-invariants.mjs`
  `PHRASES` and one suite case, `skills/run/SKILL.md` steps 4, 5, 6 and 7,
  README, METHODOLOGY). Below the consequence tier the driver bounds-checked
  the review-fix diff in code and **halted** when it left those bounds. The
  first three live release epics tripped that gate three times, and all three
  were clean fixes: GHL-1 (66 lines, 18 of them a translation fan-out;
  merged by hand under a standing rule, no re-review), GHL-9 (119 lines;
  hand re-review, 41,368 tokens, **0 Important**) and GHL-10 (two files
  outside the reviewed diff — the two its own findings said were missing;
  hand re-review, 40,465 tokens, **0 Important**). Every one cost a human a
  resume, and twice the human's answer was to buy the pass the run could
  have bought itself. Now a trip spawns the same bounded re-review the
  consequence tier gets, priced at that tier, and merges on a clean one; an
  Important finding in it halts on **the Important-finding stop condition**,
  the same string the consequence tier's re-review uses, so the retro's
  classifier reads one class. Two narrower changes ride with it: files the
  review's own findings **name** now count as inside the bounds (GHL-10's
  trip was guaranteed — for the finding class "the deliverable named in
  scope was not produced" the fix is outside the reviewed diff by
  construction), and `STOP.fixBounds` now covers only the case that stays
  its own — a fix diff nothing could measure (no usable fix-diff facts, or a
  binary numstat), because re-reviewing an unmeasured diff proves nothing.
  The line budget is unchanged at 60. The record carries `fixBoundsTripped`
  beside `fixBoundsGated`, and the run record names the trip. Reversal, in
  METHODOLOGY: if a bounds re-review ever lets an Important defect reach a
  release pull request, the halt comes back — its first data point is
  redesign-foundation's FND-6, a test-motivated out-of-bounds fix a bounded
  re-review cleared and a later commit corrected. PR #42's `Fix bounds
  exclude:` line never reached the default branch (its merge commit
  `8ac3bef` sits only on `origin/addendum-gate-date`); this supersedes it
  for the halt, and whether the exclusion also lands is its own pull
  request.

- **Doctor flags the run records the spend ledger cannot read**
  (`scripts/tickets.mjs` doctor, `RUN_HEADING` and `parseSpend`, plus one
  test and a wider spend fixture; `skills/run/SKILL.md` step 6,
  `skills/doctor/SKILL.md`, `skills/spend/SKILL.md`, README). The first
  three live release epics wrote every run record's Tokens line as prose —
  the ledger's shape landed the evening those runs ended — and six of
  their fourteen run headings carried a qualifier after the date
  (`### Run — 2026-08-24 (resumed 2026-08-25) — halted`), which the strict
  heading did not read. `spend` therefore reported "no figure recorded"
  for every run ticket, indistinguishable from a run nobody measured. Now
  the heading accepts a parenthesised qualifier after the date (the shape
  real usage needed), `doctor` warns on a `### Run —` heading that still
  will not parse and on a run record whose Tokens line carries figures but
  no `<ID> worker=<n> …` group, and both warnings name the repair: a dated
  addendum beneath the record restating the figures as groups, never an
  edit. A labelled group names its own ticket, so the parser now reads it
  from any region — the repair can be appended at the end of the log,
  append-only, and still reaches the ticket it names rather than the entry
  it landed in (bare `worker=<n>` pairs and `Worker tokens:` phrases stay
  the enclosing entry's); the test proves the recovery works in the
  flagged state. And every h2/h3 heading now closes a parse region, so
  groups under a malformed heading are dropped rather than attributed to
  the entry above them.

- **Doctor probes the Codex runner's environment at planning time**
  (`scripts/tickets.mjs` doctor and four tests, `skills/doctor/SKILL.md`,
  `skills/run/SKILL.md` step 3, `skills/epic/SKILL.md` template). When any
  epic declares `Worker runner: codex`, doctor runs `codex --version` and
  looks for the credential where Codex itself keeps it — `auth.json` under
  `$CODEX_HOME` or `~/.codex`, or `OPENAI_API_KEY` — and fails with the fix
  (`npm install -g @openai/codex`; `codex login`, or a key piped into
  `codex login --with-api-key`) when either is missing, because a run that
  discovers this at ticket one halts with nobody there. An unrecognised
  runner value warns, naming the driver's refusal. Nothing is probed when no
  epic declares a runner. The plugin still handles no credential: it checks
  that Codex's own sign-in exists and nothing more. The shared test fixture
  gains a fake `codex` and a signed-in `CODEX_HOME` so the suite passes on
  machines and CI without Codex.

- **Spend is one command away, on the board, and live during a run**
  (new `skills/spend/SKILL.md`; `scripts/board.mjs` and its tests;
  `workflows/run-epic.mjs` and its tests; `skills/board/SKILL.md`; README).
  The ledger `tickets.mjs spend` derives had no door: a user had to know
  the node command. `/flow:spend [epic]` prints it, with commentary rules
  that forbid estimating or filling a figure the ledger lacks. The board
  page runs the same ledger beside `list --json` and gains a **Tokens**
  column — a figure with the per-role split as its tooltip, `?` for an
  unknown, `—` for nothing recorded, and the epic's recorded total with its
  unknown count in the counts line; an unreadable ledger drops the column
  rather than rendering a wrong one. And the driver now logs each
  integrated ticket's meter delta as it happens (`<ID>: spend — <n> output
  tokens by the runtime meter`, plus the Codex runner's own usage when a
  runner ran it), so an unattended run shows its cost while it runs instead
  of only in the record afterwards; with no meter it logs nothing, because
  unmetered is not zero.

- **A release epic can hand implementation to Codex** (`scripts/runners/
  codex.mjs` and its tests, `workflows/run-epic.mjs` worker step and
  `workerRunner` arg, `scripts/tickets.mjs` `Worker runner:` preamble line
  with doctor near-miss coverage, `skills/run/SKILL.md` steps 3–4,
  `skills/epic/SKILL.md` template, README). A new optional preamble line,
  `Worker runner: codex`, makes the unattended worker OpenAI's Codex CLI
  instead of a Claude subagent; the driver then spawns a fast-model shell
  proxy that runs the runner script and relays its JSON verbatim. The
  runner owns what the model must not — **git, entirely**: it fetches and
  creates the ticket branch before the run, launches `codex exec` in the
  workspace-write sandbox (where `.git` is read-only and there is **no
  network**), hands Codex the same scoped slice of the ticket skill a
  Claude worker gets (pointed at the skill file, since Codex cannot load a
  plugin skill by name), constrains the final message to the worker
  schema, commits everything Codex left in the working tree under an
  ID-prefixed subject (the tree must be clean at the start, or the runner
  refuses), and then reconciles the report with git — a claim of work that
  left no change is a document/code contradiction, a failed push is a
  halt, a BLOCKED branch is still pushed so its entry reaches the remote —
  before granting `branch-pushed` from the push it watched. The first live
  run on a real Codex session settled that split: Codex read the skill,
  reported in schema with its usage on record, and halted honestly at
  `git checkout -b` because the sandbox denied the `.git` write. Codex's own usage lands in the
  ticket record as `workerUsage`, observed by the runner, never reported by
  the model. An unknown runner value refuses the run rather than
  substituting an implementer the sign-off did not name. Every gate
  downstream reads git, so the reviewer, the CHECK re-run, the addendum
  check and the SHA merge are untouched. Eight runner tests drive it with
  a stub `codex` that speaks the real CLI's JSONL protocol and, like the
  real sandbox, never writes to `.git`; a live run on a
  signed-in account is the only test of the model's compliance, and the
  gates exist for the case where it does not comply.

- **Token spend is derived, like every other fact** (`scripts/tickets.mjs`
  new `spend [epic] [--json]` subcommand and tests, `skills/run/SKILL.md`
  step 6, `skills/quick/SKILL.md` step 6, `skills/retro/SKILL.md` step 5,
  README, `scripts/check-invariants.mjs` two new couplings). The log
  recorded figures in three shapes — an entry's `**Tokens:**` line, the
  addendum's `Worker tokens (implementation leg): <n>; Reviewer tokens:
  <n>` phrases, and a run record's prose — and the only reader was the
  retro, summing by hand, so spend was invisible until an epic closed and
  approximate when it was not. `spend` compiles one ledger per ticket and
  per role from all three, matching phrases over each entry's joined text
  (the house wrap splits `Worker tokens (implementation\nleg):`), with the
  last figure per role winning so a correction addendum overrides the
  entry it corrects. `unknown` stays unknown and a ticket with nothing
  recorded is reported as such, never as zero — the script derives, it
  never estimates, and it reads no transcript. The run record's Tokens
  line now has a machine shape, `<ID> worker=<n> reviewer=<n>
  disposition=<n> re-review=<n> proxies=<n>` per ticket, because that is
  the one place the run lane's figures exist; the quick skill names the
  `Reviewer tokens: <n>` phrase it already used; and the retro reads the
  ledger instead of the log. Two presence couplings hold the phrases to the
  parser.

- **The ticket skill is the procedure, not the argument for it**
  (`skills/ticket/SKILL.md`, roughly 4,600 words to 2,600). Every worker
  paid to load the whole essay before touching a file, and the imperatives
  sat inside their justifications — the "every constraint carries its
  reason" style, applied at paragraph length, was fighting the "skills are
  procedure, METHODOLOGY is reasoning" split. No step, gate, template,
  command or stop condition changed: steps 0–10 keep their numbers and
  contents (the driver's and supervisor's prompts key on them), the
  status-log preamble and entry heading are verbatim, the addendum prefix
  and the tier table's tier, model and effort values are intact,
  the consequence list and the hook's refusal message are quoted as before,
  and `check-invariants.mjs` passes unchanged. What went: the extended
  reasoning already carried by METHODOLOGY.md (review pricing, why release
  tickets open no pull request, why fixes are new commits), restated
  cross-references, and duplicated phrasing between steps 0 and 10. Each
  constraint keeps its reason as a clause. The other long skills (run,
  epic, quick, retro) are owed the same pass.
- **The run skill, same treatment** (`skills/run/SKILL.md`, roughly 6,300
  words to 3,300). Steps 1–7 keep their numbers and contents (the epic
  skill points at step 3's probes), the Workflow call block, the result
  shape, the run-record template and the release pull request body list
  are intact, and the ten stop-condition sentences in step 5 still match
  the driver's `STOP` strings word for word — verified by extracting them
  from `run-epic.mjs` and searching the skill. The largest cut is step 4's
  per-ticket walkthrough of the driver: the session launching the run never
  executes those bullets, the script does and its tests enforce them, so
  each now says what the step decides and what halts it, not how the script
  is built. Reasoning that METHODOLOGY.md already carries (why the loop is
  code, why release tickets open no pull request, why the re-review became
  a code gate) is no longer restated.
- **The epic, quick and retro skills, same treatment** (`skills/epic`
  roughly 3,900 words to 2,400; `skills/quick` 2,000 to 1,550;
  `skills/retro` 1,700 to 1,250). Step numbers are unchanged everywhere
  (quick's step 2 template and step 5 preamble, epic's step 3 page and
  step 4 review are referenced by other skills). Every template fence the
  invariant checker parses is intact: the `tickets.md` preamble with all
  six configuration lines and the printed `Worker model: opus` default, the
  `## <ID> — <short name>` and `## Q-<n> — <short name>` ticket headings,
  the `CHECK:`/`EXPECT:` lines, and the status-log preamble in all three
  copies. Quick's risk-trigger bullet list is verbatim, since the checker
  matches it against the ticket skill's consequence list. What went:
  restated reasoning (why the plan is reviewed, why quick moved
  in-session, why the era rollover exists — all in METHODOLOGY.md), the
  template's paragraph-length explanations of each configuration line,
  now one sentence each, and repeated cross-references. One correction
  rode along: the retro's mining heading said "five questions" while
  listing six; it now says six. The four short skills (review, doctor,
  tickets, board) were read and left as they are — each is already a
  procedure with no essay around it.

- **The merge gate matches a dated review addendum by shape, never by the
  run's pinned date** (`workflows/run-epic.mjs` resolve step,
  `skills/run/SKILL.md` steps 4-5). A live run halted a green ticket at
  midnight: the run pins `args.today` for cache stability, the disposition
  agent dated the addendum with the real day, and the resolve step's grep
  for the pinned value counted zero — "not reviewed on the record" for a
  ticket whose review was committed and pushed. The two dates diverge
  legitimately whenever a run crosses midnight, and the pinned-value match
  bought nothing: the awk narrowing to the ticket's own entries is the
  real check, since every earlier ticket's addendum carries the same dated
  shape under its own heading. The grep is now
  `grep -cE "Addendum — review — [0-9]{4}-[0-9]{2}-[0-9]{2}"` — the dated
  shape the ticket skill's step 8 requires, any value. Only the resolve
  prompt changed, deliberately: a halted run resumed with
  `resumeFromRunId` replays its cached prefix and re-runs live from the
  first edited call, so touching any earlier prompt (worker, review,
  disposition) would re-execute finished work on integrated tickets,
  while a re-run resolve is read-only and harmless.

- **The check runner survives noisy test output** (`scripts/tickets.mjs`
  `runChecks`). The first live run of the acceptance gate halted on a
  green ticket: a passing 68/68 jest run printed ~1.2 MB of Mongo logs,
  `spawnSync`'s default 1 MB `maxBuffer` killed the child with ENOBUFS,
  and the ledger saw a dead command — the fail-closed halt was correct,
  the capacity was not. The runner now carries a generous named cap
  (`CHECK_MAX_BUFFER`, 64 MB) alongside its timeout — never Infinity,
  so one pathological command cannot eat the machine's memory before the
  timeout fires — and an ENOBUFS that still occurs names itself in the
  evidence line with the fix (quieten the command) instead of a bare
  error message.
- **Acceptance criteria may be machine-runnable, and the run driver gates
  the merge on them in code** (`scripts/tickets.mjs` new `check`
  subcommand and doctor near-misses, `workflows/run-epic.mjs` new
  Acceptance step and stop condition, `skills/epic/SKILL.md` template and
  criteria rules, `skills/ticket/SKILL.md` step 5, `skills/quick/SKILL.md`
  step 5, `skills/run/SKILL.md` steps 4–5, `scripts/check-invariants.mjs`
  two new couplings). Adapted from unlazy's gate files after a comparative
  read. A criterion may carry an indented `CHECK: <command>` line with an
  optional `EXPECT: <text the output must contain>`; `tickets.mjs check
  <ID>` runs them from the repository root and reports a pass/fail ledger
  with the deciding output as evidence — a malformed CHECK fails the gate
  rather than silently never running, and doctor flags the near-miss
  shapes. Workers and quick tickets verify with the tool's ledger instead
  of their own reading of test output. In an unattended run the driver
  re-runs the checks against the pushed branch **after** the disposition
  (fix commits included) with `--from origin/epic/<name>` — the criteria
  as **signed off**, which no ticket branch can edit, closing the
  self-authored-gate hole the source idea carries — and code, not an
  agent, compares the counts; any failure is a new stop condition. This
  moves the last merge-relevant fact that was still taken on an agent's
  word (the worker's verification claim) to repository state. CHECK lines
  are optional: prose and *demonstrate:* criteria remain first-class, and
  a ticket without them passes the gate untouched.
- **Acceptance criteria may be runtime demonstrations, held to the
  evidence bar** (`skills/epic/SKILL.md` criteria rules,
  `skills/ticket/SKILL.md` step 5, `skills/quick/SKILL.md` step 5).
  Adapted from gstack's browser-QA step after a comparative read.
  Verification was command-and-counts only, which misses behaviour no
  test command reaches — rendered UI, interactive flows, a CLI's actual
  output. A criterion may now be written *demonstrate: <action> →
  <observable result>*; the implementing agent drives the real app (the
  project's run instructions, a real browser or simulator where the
  environment provides one) and records what it **observed** in the
  Verified line as evidence — the concrete screen or output seen, never
  "looks fine" — because tests prove what the code does, a demonstration
  proves what a user gets, and agent-built UI is where the two diverge.
  A demonstration the environment cannot perform is owed, like any other
  check. The rest of gstack was read and not adopted — its
  agent-side merge-and-deploy crosses the human-merge line, and its
  role-lens plan reviews cover ground the plan reviewer's checklist
  already walks.
- **Worker and reviewer models are chosen as a pairing, with two named
  profiles and a decision rule** (`skills/epic/SKILL.md` template, README,
  METHODOLOGY "Why review cost is tiered"). The template's Worker/Reviewer
  guidance now presents **capable-implementer** (`opus` worker, tiered
  review — gnarly code, thin specs) and **strong-judge** (`sonnet` worker,
  `opus` reviewer — the cheap implementer under a stronger judge, for
  well-specified tickets out of a clarified, plan-reviewed epic) as the
  two known-good pairings, decided from run-record evidence: Important
  findings per ticket and observed spend, which the driver records
  automatically. METHODOLOGY settles "the reviewer must be stronger than
  the implementer" as a profile, not a rule — review stays priced by
  consequence, the plan side is never cheapened, and the printed default
  (`opus` worker) moves only when a live ledger says so. No code change:
  both profiles were already expressible; the choice is now named,
  reasoned, and tied to its evidence.
- **The standing quick epic rolls over by era** (`skills/quick/SKILL.md`
  steps 2 and 5, `skills/retro/SKILL.md` steps 1 and 6, README,
  METHODOLOGY). Adapted from beads' compaction after a comparative read,
  reshaped to fit append-only: the quick epic never closes, so its log and
  ticket doc grow without bound and ride every quick branch and
  pull-request diff — `brief` fixed the read side, nothing fixed the carry
  side. The quick skill now signals when the log passes roughly 25 entries;
  `/flow:retro quick` performs the rollover behind the owed-conversion gate
  (an unconverted owed item would vanish from every future brief): the era
  is archived verbatim to `epics/_archive/quick-<date>` — nothing
  summarized, nothing rewritten — and a fresh quick epic continues the ID
  sequence with a `Q-IDs continue at Q-<n+1>` ground rule, because archived
  headings are no longer read and a reused number would read as already
  shipped off main's commit subjects. The rest of beads was read and not
  adopted; METHODOLOGY records the standing verdicts (stored-and-reported
  state vs derived; `bd prime` vs `brief`; the dependency graph stays
  removed, with the strict-parse shape noted for a future parallel lane).
- **Three Spec Kit-inspired planning refinements** (`skills/epic/SKILL.md`
  step 3 and template, `agents/plan-reviewer.md`, `skills/retro/SKILL.md`
  step 4, `scripts/plan-page.mjs` + test, METHODOLOGY). Adapted from
  GitHub's Spec Kit after a comparative read; each passed the admission
  test, and the rest of Spec Kit (constitution, analyze, in-session
  implement) was deliberately not adopted. One: a **clarify pass** before
  the shape checkpoint — the planner sweeps the brief for underspecified
  points by category and asks the user the questions whose answers change
  the shape, batched and bounded, recording every answer in the documents;
  questions that do not change the shape ride to sign-off as open
  questions. Two: an optional numbered **`Requirements:` preamble block**
  — the WHAT held apart from the HOW, written before slicing and never
  bent to it; the plan reviewer now walks it both ways (a requirement no
  ticket reaches, a ticket no requirement needs, requirements reworded
  toward the implementation), and the plan page renders it as its own
  numbered section. Deliberately part of the preamble, so `brief` hands
  every worker the WHAT its ticket serves. Three: a sixth retro mining
  question adapted from converge — the delta between the documents'
  promises and what git shipped, both ways, because a gap only the diff
  knows about is debt with no ledger entry.
- **All three roles' models configure in one place, and the configuration
  surface is documented as one table** (`scripts/tickets.mjs`,
  `skills/epic/SKILL.md` steps 3-4 and template, README). A new optional
  `Planner model:` preamble line pins the plan reviewer per epic (absent,
  the agent definition's pinned strongest model applies — the epic skill's
  step 4 now reads the line from the draft it just wrote, because
  configuration binds where it is read); it parses, is exposed in
  `find`/`list --json`, and is near-miss-scanned by doctor exactly like
  `Worker model:` and `Reviewer model:`. The epic template's configuration
  block now presents all six optional lines together — Delivery, the three
  model lines, Consequence paths, Ticket budget — and README carries the
  same six as a table: one place, one syntax, every near-miss flagged.
- **Release tickets no longer open pull requests — the merge is a verified
  SHA, and the release pull request is the epic's only one**
  (`workflows/run-epic.mjs`, `scripts/tickets.mjs`, the ticket skill's
  steps 0/9/10, the run skill, the epic skill's Delivery text, README,
  METHODOLOGY "Why release tickets stopped opening pull requests"). A
  per-ticket pull request in a release epic had no reader — the human's
  gate is the release pull request, and review reads the pushed branch —
  while adding three agent steps and a mutable indirection: a pull
  request's head and base can move between the driver's check and a merge
  by number (the external review's time-of-check finding). Now the worker
  stops at its pushed branch (`branch-pushed` replaces `pr-opened`), the
  resolve step reports `git rev-parse origin/<branch>` alongside the
  addendum count, and the merge agent runs a fixed sequence merging
  **exactly that SHA** into `epic/<name>` — a SHA cannot be retargeted, so
  the merged diff is provably the one the review and the fix-bounds check
  measured. The board's `integrated` state now derives from ID-prefixed
  commit subjects reaching `origin/epic/<name>` — the same mechanism as
  `shipped`, at the epic ref — with the old PR-merged detection kept for
  epics run before this change; the unattended path no longer needs `gh`
  for anything but the release pull request. Attended release tickets
  (ticket skill step 10) merge the same way, by the verified SHA. The
  trade is named in METHODOLOGY: per-ticket PR-triggered CI and a
  per-ticket discussion surface remain what incremental delivery offers.
- **CI runs the whole verification surface, and the run skill recommends a
  separate automation identity** (`.github/workflows/tests.yml`, CLAUDE.md
  Commands, `skills/run/SKILL.md` step 3). GitHub Actions now runs every
  suite, the invariant checker, doctor, and the syntax/parse checks — the
  same commands CLAUDE.md names, so local runs and the pull-request gate
  cannot drift apart. The run skill's environment checklist gains the
  shared-identity point an external review raised: when agents and humans
  authenticate as the same account, "human-only merge" binds accounts, not
  intentions — high-consequence repositories should run unattended epics
  under a machine identity with no permission to merge or push to the
  default branch. Environment setup like branch protection itself:
  recorded at sign-off, never enforced by the plugin.
- **A per-ticket token budget, enforced by the meter**
  (`workflows/run-epic.mjs`, `scripts/tickets.mjs`, the run skill's steps
  4-5). A new optional epic preamble line — `Ticket budget: 250000` (or
  `250k` / `1m`; an unrecognised suffix parses as absent and doctor flags
  it, because a bare digit grab would have read `250k` as a ceiling a
  thousand times too low) — rides `find`/`list --json` like the other
  configuration lines and reaches the driver as `args.ticketBudget`. The
  driver measures each ticket's pass against the workflow runtime's own
  `budget.spent()` meter — the one observer of spend no agent can
  misreport — records the delta in `ticketRecords[].outputTokensObserved`
  (with or without a ceiling: automatic per-ticket economics), and halts
  on a new stop condition, "a ticket's pass exceeding the epic's
  per-ticket token budget", **after** the merge is confirmed: nothing
  un-merges, so the overspending ticket stays integrated and the run
  stops before the next one. A budget the runtime cannot meter refuses
  the run at argument validation — a ceiling that silently cannot fire
  is worse than none.
- **The ticket reviewer is now blind and cannot edit; the plan reviewer
  cannot edit** (`agents/ticket-reviewer.md`, `agents/plan-reviewer.md`,
  METHODOLOGY "Why the reviewer is a separate agent"). From an external
  review of the workflow: `memory: user` is removed from the ticket
  reviewer — a cross-session casebook of defect patterns is a set of
  priors, and this judge's verdict opens a merge gate, so it now starts
  from nothing but its packet every time (the plan reviewer keeps its
  casebook: advisory input to a human gate, not a gate). Both reviewers'
  toolsets are restricted to `Read, Grep, Glob, Bash` — "you report, you
  never fix" was instruction alone while the agents held Edit and Write;
  now they structurally cannot edit a finding into agreement. Bash stays
  for `git show`/`git diff`, so this is narrower, not perfectly
  read-only, and the run lane's general-agent fallback reviewer is
  unaffected — one more reason the fallback is a fallback.
- **The plan's two human gates render as a styled page**
  (`scripts/plan-page.mjs` + `plan-page.test.mjs`, `skills/epic/SKILL.md`
  steps 3 and 5, README). The shape checkpoint and the sign-off previously
  arrived as chat text — the exact format in which a shape gets skimmed.
  The planning session now composes a JSON plan (schema documented in the
  script), renders it with a shipped, tested skeleton, and publishes the
  page as an artifact: outcome grid, delivery and areas, the ordered
  ticket list, the rejected alternative, the plan review's findings, open
  questions, and stage-appropriate steering guidance (shape: "bend it
  now", with examples quoting the plan's own tickets; sign-off: the
  release-mode warning that approval means unattended execution). One
  file path republished at both gates keeps one URL that evolves with the
  plan. Steering material, not record: the JSON and the page live in the
  session scratchpad and are never committed — `tickets.md` remains the
  record.
- **`/flow:board` renders the board as a published HTML page**
  (`skills/board/SKILL.md`, `scripts/board.mjs` + `board.test.mjs`,
  README). A zero-dependency renderer over `tickets.mjs list --json`:
  per-epic tables with state badges, delivery and this-folder tags,
  degraded-fact notes (gh unavailable, capped scan, duplicate IDs), and a
  Next-up list — published as an artifact and regenerated on every run.
  Deliberately a rendering of derived state, never a second store: the
  skill writes the page to the session scratchpad and forbids committing
  it, because a stored board is the hand-maintained mirror the plugin
  exists to avoid.
- **Epic planning stops at the shape before writing the document, and
  sign-off shows a rejected alternative** (`skills/epic/SKILL.md` steps 3
  and 5; METHODOLOGY "Why the plan is reviewed before sign-off"). The
  skill previously wrote the complete ticket document and then asked,
  which anchors: sign-off becomes yes/no on the only shape in the room,
  at the moment a re-split costs a rewrite. Step 3 now presents the shape
  first — the Outcome line, areas, delivery choice, and the ticket list as
  one line each — and waits for the user to bend it while a re-split still
  costs a sentence; step 5's sign-off additionally presents one
  considered-and-rejected decomposition with its reason, so approval is a
  choice between shapes rather than a ratification of the one shown.
- **The epic documents can stay out of the diff's way** (`.gitattributes`,
  README "The three documents", `skills/retro/SKILL.md` step 6). Two
  optional practices for keeping the default branch tidy without breaking
  what the documents are for: `epics/** linguist-generated=true` collapses
  them in pull-request diffs and language stats (collapsed is not hidden —
  the evidence trail still travels in the same pull request), and the retro
  gains an optional final step archiving a closed epic to
  `epics/_archive/<name>` — safe only after the retro has converted owed
  items to tickets and lessons to instruction files, because the board only
  discovers epics directly under `epics/` and archiving earlier would
  silently delete the debt ledger. Moving is not deleting: shipped
  detection reads commit subjects, never folders, and the standing quick
  epic is never archived.
- **The quick lane's reviewer gets a fixed, scoped packet — never the
  session's narrative** (`skills/quick/SKILL.md` step 6). The reviewer
  spawn previously said "give it the ticket section and the instruction
  files", which left the implementing session free to add its own summary
  of the work — and the session that implemented is exactly the biased
  narrator the fresh context exists to exclude. The packet is now fixed
  and mirrors the run driver's: the commit range, `tickets.mjs brief
  Q-<n>` (ground rules, scope, criteria, owed items), this ticket's own
  status entry sliced from the log by `awk` (never the whole quick log,
  which is long by design), and the touched areas' instruction files —
  with an explicit rule that no summary, reasoning or conversation content
  rides along: what the session believes about the diff travels only
  through what it committed, where the reviewer weighs it as the record,
  not as a voice.
- **The run driver floors the review tier in code — the reviewed party can
  no longer price its own judge down** (`workflows/run-epic.mjs`; the run
  skill's step 4; the ticket skill's step 7; `scripts/tickets.mjs`;
  `skills/epic/SKILL.md`; METHODOLOGY). The reviewer's model and effort
  were priced solely from the worker's self-reported tier: the driver
  guarded the malformed case (missing/unrecognised → consequence) but a
  well-formed wrong report — a code change called `prose` — bought the
  weakest review unchecked. The driver now runs a read-only fast-model
  step per ticket (`tier-facts:<ID>`, pinned like the other shell proxies)
  that lists the branch's changed files (merge-base diff against the epic
  branch, `epics/` excluded), and code computes a floor: docs-only files
  may keep `prose`, any other file floors at `normal`, and files matching
  the epic's new optional `Consequence paths: <glob>[, <glob>]` preamble
  line (parsed by `tickets.mjs` like the model lines, exposed in `find`/
  `list --json`, near-miss-scanned by doctor) floor at `consequence`. The
  review is priced at the higher of the worker's report and the floor —
  the report can raise the price, never lower it; whether machine-read
  markdown earns `normal` stays the worker's judgment, which only pushes
  up. An unusable file listing floors at `consequence` (missing facts
  raise scrutiny); a failed listing command halts like any other nonzero
  exit; an unsafe glob refuses the run at argument validation, because
  dropping it would silently lower scrutiny. `ticketRecords` gained
  `tierFloor`. Attended lanes are unchanged: there the tier is picked by
  the supervisor or session, which is not the party under review.
- **Reviewer models are named, never inherited** (`workflows/run-epic.mjs`
  `REVIEW_TIERS`; the ticket skill's step 7 table; the run skill's step 4;
  README). The `normal` tier now prices a named cost-efficient model
  (`sonnet`) at `high` instead of inheriting the session's model, and the
  `consequence` tier's prose names `opus` instead of "the strongest
  available" — a session launching a run is often the most expensive class
  there is, and routine review priced by that accident was the single
  largest avoidable cost in the lane. The epic's `Reviewer model:` line
  still overrides every tier. The plan reviewer moves the other way: its
  agent definition now pins the strongest model (`model: fable` in
  `agents/plan-reviewer.md`) — a wrong decomposition costs every downstream
  ticket, so that is where capability is spent.
- **The epic template defaults to `Worker model: opus`**
  (`skills/epic/SKILL.md`, README). Workers previously inherited the
  planning session's model; the template now pins a capable implementation
  model by default, so "plan on the strongest model, implement on a cheaper
  one" is the shipped shape rather than an option nobody declares. Deleting
  the line restores inheritance — as a decision, visible at sign-off.
- **The re-review runs only at the consequence tier; below it, fix commits
  are gated by code** (`workflows/run-epic.mjs`; the run skill's steps 4-7;
  README). Five live re-reviews at the normal tier all returned zero
  Important findings — reviewer-scale spend buying nothing — so the second
  model pass now runs only where failure is expensive. Below `consequence`,
  the reviewer reports the head it reviewed (`reviewedHead`, shape-verified
  in code), the read-only resolve step reads the fix diff anchored on it
  (`epics/` excluded, so the addendum commit never counts), and the script
  refuses to merge fixes that touch any file the review never saw or exceed
  a 60-line budget — a new stop condition, "a review-fix diff outside its
  bounds". A review that reports no usable head sends its fixes to the
  bounded re-review instead: doubt raises scrutiny, never lowers it.
  `ticketRecords` gained `reviewedHead`, `fixBoundsGated` and `fixLines`;
  the run record and release pull request body now state which of the two
  guards stood behind each ticket's fixes.
- **Fresh-context readers get scoped reads, not whole documents**
  (`workflows/run-epic.mjs` review packet and disposition prompt; the
  ticket skill's step 7). The reviewer is handed `tickets.mjs brief <ID>`
  and this ticket's own status entry sliced from the log (`git show … |
  awk`), never `tickets.md` and `status.md` whole; the disposition agent is
  told the entries above its ticket are not its reading. The status log
  grows without bound, so whole-document reads were the one per-ticket cost
  that compounded with epic length — the same O(epic)-not-O(history) fix
  the worker's brief already made, extended to the other two readers.
- **A clean disposition is priced clerical** (`workflows/run-epic.mjs`).
  When the review found no Important finding, the disposition agent — whose
  whole job is then writing the addendum, committing and pushing — is
  pinned to the fast model alongside the shell proxies, instead of
  inheriting the session's. Dispositions with findings to fix keep the
  inherited model at `high` effort.
- **The run record's Tokens line states phase subtotals**
  (`skills/run/SKILL.md` step 6). Alongside the per-ticket figures and the
  run total: workers, reviewers (re-reviews included), dispositions, and
  the shell proxies — the split every pricing decision about this lane
  actually reads, and the figure a bare total cannot provide.
- **Token figures are harness-observed, never self-reported**
  (`workflows/run-epic.mjs`; the ticket, quick, run and retro skills; new
  METHODOLOGY section "Why token figures are observed, never asked"). The
  schemas' `workerTokens`/`reviewerTokens` fields are gone, and no prompt
  asks any agent for a figure — an agent cannot see its own counter, so
  self-report produced `unknown` everywhere and, once, an invented number
  (flow-demo NOTE-1, corrected by addendum). Now: in supervisor mode the
  supervisor records the spend the harness reports when its worker and
  reviewer stop and hands both figures to the step 8 addendum; the quick
  lane reads the reviewer's figure the same way. In an unattended run,
  ticket entries and addenda read `Tokens: recorded in the run record`, and
  the session sums the run's own per-agent transcripts (`journal.jsonl` →
  `agent-<id>.jsonl`) into the run record's Tokens line — now the run
  lane's **only** token record, so the retro counts each ticket once, from
  wherever its lane recorded the figure, instead of skipping the run
  record as a restated view. `ticketRecords` entries lost `workerTokens`,
  `reviewerTokens` and `reReviewTokens`. The standing rule is unchanged
  and finally enforceable: harness-observed or `unknown`, never estimated.
- **New verification tool: `scripts/check-invariants.mjs`**, with its own
  suite (`check-invariants.test.mjs`, 9 tests — including proofs that each
  class of drift actually fails). The cross-document couplings the doctrine
  states but nothing enforced mechanically — the status-log preamble's three
  copies, the quick-gate/`xhigh` risk lists, the skills' heading templates
  against `tickets.mjs`'s parser regexes, the session guard's refusal message
  as the ticket skill quotes it, and a short list of load-bearing doctrine
  phrases — now have a script that exits 1 on any drift, re-deriving the
  parser regexes from `tickets.mjs` source so the two cannot diverge silently.
  Checks are presence and equality only; contradictions in meaning remain
  review's job. Dev-side only: no skill invokes it, and installed projects
  are unaffected.
- **`/flow:run`'s ticket loop is now a workflow script, not prose**
  (`plugins/flow/workflows/run-epic.mjs`, new; `skills/run` steps 4–7
  rewritten). The skill still owns the decisions: resolving the epic and
  refusing anything but `Delivery: release` (step 1), verifying the sign-off
  traces on `origin/epic/<name>` (step 2), the permission surface and the
  branch-protection probes with their 404/403 carve-out (step 3), and the
  ending — the run record and the release pull request, opened and never
  merged (steps 6–7). Step 4 now launches the script with the **Workflow
  tool**, passing the epic, default branch, repository root, plugin root and
  the date (a workflow script has no clock, no shell and no filesystem, so
  every mechanical fact rides in `args` or arrives through an agent it
  spawns). **The halt conditions are structural now**: each stop condition in
  step 5 is a code path that returns `{outcome: "halted", haltedOn}` and
  there is no code path that resumes past one, which is the whole point of
  the conversion — a prose loop can be re-read and reasoned past, a `return`
  cannot. The script refreshes `epic/<name>` between every ticket, spawns one
  fresh general-purpose worker per ticket with the load-bearing "A driver
  spawned you" prompt unchanged, and confirms `state === "integrated"` from
  `tickets.mjs find --json` rather than from any agent's report. It never
  reviews a diff itself, never opens or merges the release pull request, and
  never touches the default branch.
- **The driver hires the judge, and the merge gate is code.** The per-ticket
  sequence is refresh → next → worker → reviewer → disposition → merge →
  verify. The **worker** now runs a scoped slice of `flow:ticket` — steps 1–6
  plus step 9's push and pull-request open — and stops there; it never
  reviews or merges its own work, and it spawns nothing. The **script** hires
  `flow:ticket-reviewer` with a packet it assembles deterministically (the
  commit range computed from the ticket ID, since branches are the lowercased
  ID; the epic's `tickets.md` and `status.md`; the repository's instruction
  files) — never from the worker's narrative — and takes findings back as
  **structured data**: `important[]` with `file:line`, a confirmed/plausible
  label and the concrete failure, capped nits with an overflow count,
  pre-existing findings, and what was checked and found sound. Review price
  comes from the tier the worker reports for its own diff under the step 7
  table (`prose` → a fast model at `low`, `normal` → the session's class at
  `high`, `consequence` → the strongest at `xhigh`), with the epic's
  `Reviewer model:` line overriding the model; **a missing or unrecognised
  tier is priced as `consequence` — doubt goes up.** A separate cheap
  **disposition** agent fixes Important findings as new commits, re-runs the
  affected checks, and writes and commits the dated review addendum — it runs
  even on zero findings, because the committed addendum is a merge
  precondition. Then a cheap **merge** agent checks `baseRefName` is
  `epic/<name>` and merges with a merge commit, never a squash. **The gate is
  four code paths**: an unfixed Important finding halts, a failed disposition
  halts, an uncommitted addendum halts, and a wrong base halts as a
  contradiction — none of them reachable past.
- **This also dissolves the Agent-tool limitation** recorded earlier in this
  batch: nothing the script spawns needs to spawn anything, so the lane works
  on current Claude Code builds, which withhold the Agent tool from
  workflow-spawned agents. Reviewer-spawn failure now means the *script's*
  hiring failed — the `flow:ticket-reviewer` agent and then the sanctioned
  general-agent fallback both returned nothing — and the ticket's pull
  request stays open and unmerged.
- ~~Token figures are self-reported through schemas.~~ Superseded within
  this batch before any release carried it: the live campaign showed
  self-report produces only `unknown`s and guesses, so the fields are gone
  and figures are harness-observed — see the batch's first entry.
- **The ending no longer refreshes the epic branch a second time.** The loop
  refreshes before it asks what is left, so the pass that finds nothing left
  has already refreshed a branch carrying every ticket's merge; the result's
  `finalRefresh` reports it.
- **External-review hardening: the gate now reads repository state, not
  self-reports.** The lane's honest name is **code-controlled,
  agent-executed** — code decides, agents execute and report — so the checks
  that matter no longer take an agent's word for the thing being checked.
  (1) **The pull request is resolved mechanically**: the merge step runs
  `gh pr list --head <id lowercased> --base epic/<name> --state open`,
  requires exactly one match, verifies both refs from the response, and
  merges that number; zero, several, or a number the worker did not report
  halts as a contradiction — the worker's `prNumber` is now only a
  cross-check, and the script re-checks it after the fact too. (2) **Fix
  commits get one bounded re-review** before the merge, in the reviewer's
  re-review mode (no new nits, only Important findings and anything still
  unaddressed): the fixes are written after the review that approved
  everything else, so a merge without it merges an unreviewed diff. Any
  Important finding halts, and there is deliberately no second round.
  A clean review skips the step, so it costs nothing on the common path.
  (3) **The addendum is verified on the pushed branch** —
  `git show origin/<branch>:epics/<epic>/status.md | grep -c "Addendum — review — <date>"`
  — with the disposition's own flag kept as well, belt and braces.
  (4) **Pre-existing findings can no longer vanish**: they ride into the
  disposition prompt with the instruction to record each with a named owner
  (an existing ticket, or `retro` — the retro skill mines addenda), into
  `ticketRecords[].preExisting` and the result's top-level `preExisting`, and
  into the release pull request body the run skill's step 7 describes.
- **Second review pass, and what it caught** (fresh-context opus review of the
  branch; four Important findings, all confirmed, plus seven nits — all
  fixed). Two were behaviour, and both were gates that looked closed and were
  not: **the addendum check was vacuous for every ticket but the first** —
  release tickets branch from `epic/<name>`, whose append-only log already
  carries the previous ticket's addendum, so a date-only grep matched it and
  the check collapsed back to the disposition's self-report; it is now scoped
  by `awk` to *this ticket's own entries*, and re-checked in code after the
  merge reports success. And **the disposition's outcome is now cross-checked
  against the review it dispositioned**: "clean" against a review that raised
  Important findings, or "fixed" with no fix commits named (which would also
  skip the re-review), halt as contradictions — the driver holds the finding
  count, so it checks rather than reads. The rest: `gh pr list` no longer
  filters by base, so a pull request aimed at the wrong branch is *reported*
  instead of vanishing into a "no pull request" count; a reviewer return
  without a findings array is a failed hire rather than an approval (it was
  the one malformed-return path in the script that failed open); tier and
  stop-condition lookups use `Object.hasOwn`, so a reported tier of
  `toString` prices as `consequence` instead of `undefined`; every halt now
  quotes agent words inside the untrusted fence its contract already
  promised, with ids, refs, counts and enum values staying plain, and the run
  skill states that boundary exactly; the merge-conflict stop string is
  re-synced with the skill's bullet; and the ticket skill's step 10 now
  splits by spawn shape in so many words — a **driver**-spawned worker never
  reaches the merge, a **supervisor**-spawned one (the human escape hatch)
  performs the gate and the epic-branch merge — which step 0 had been
  pointing at while step 10 said only the first half. METHODOLOGY no longer
  claims the attended lane goes "one step further" on hiring the reviewer:
  both lanes share the shape now.
- **Third review pass: resolution is now checked before anything can merge.**
  The merge step resolved the pull request, checked the addendum and merged in
  one agent, so the code's cross-checks on its reported facts could only run
  *after* an irreversible merge — and two of them (the head and base refs)
  were never re-checked at all, which left a malformed report claiming
  `baseRefName: "main"` able to pass the coded gate. A merge toward the
  default branch is the plugin's one absolute prohibition and nothing
  un-merges it, so the step is split: a **read-only resolve agent** reports
  the addendum count and the pull-request listing, **the script judges every
  fact** — exactly one match, head equal to the ticket branch, base equal to
  `epic/<name>`, an addendum count of at least one, a number equal to the
  worker's — and only then is a **merge agent** spawned, with one command and
  a number it did not choose. A halt at resolution now means no agent capable
  of merging was ever created. The per-ticket spawn count goes 6 → 7 on a
  clean ticket (8 with a re-review); the post-merge belt-and-braces re-checks
  are gone, because pre-merge verification is strictly stronger.
- **The first live run caught an ordering contradiction the reviews did not**
  (flow-demo, five tickets, completed, 2026-08-11). The script's completed-run
  instruction told the session to write the run record *then* open the release
  pull request, while the run skill's step 7 and the record's own
  `Release PR:` field require the opposite — the field quotes the URL. The
  driver followed the string, wrote a **predicted** URL, and verified it
  afterwards; it guessed right, which is worse than guessing wrong, because
  nothing would have caught it. The string now says: open the pull request,
  then write the record quoting its real URL. On a halt, record-first stays
  correct — nothing was opened, and the field says so.
- **Re-review evidence survives the session.** The run record's Tickets line
  notes "re-reviewed after fixes: `<n>` Important" when one ran, its Tokens
  line carries `reReviewTokens` on the same harness-or-unknown terms, and the
  release pull request body states each ticket's re-review outcome — without
  which a human reads fix commits as unreviewed, which is exactly what the
  re-review exists to prevent.
- **A committed behavioural suite for the driver**
  (`workflows/run-epic.test.mjs`, 65 tests): it loads `run-epic.mjs`, strips
  the `export`, evaluates the module body the way the workflow runtime does,
  and drives it with stubbed agents — asserting the sequence, every gate
  branch and halt mapping, the review pricing, the fences, and the prompt
  text the gates depend on. No git, no network, no filesystem beyond reading
  the script. The harness that verified the two previous rewrites lived in a
  scratch directory; verification that is not in the repository is not
  verification.
- **Cheaper mechanics.** The refresh and the board read are one agent instead
  of two (the board is only worth reading on a just-refreshed branch), and
  the three shell-proxy agents — refresh+select, merge, verify — are pinned
  to a fast model: their whole job is running a fixed command sequence and
  echoing structured output, and every decision they could get wrong is
  re-checked in code. The worker, the reviewers and the disposition are not
  pinned: they reason, and they keep the tier table and the inherit rules.
- **Doctrine follows the restructure**, in the same commit: ticket skill step
  0 (a driver-spawned worker stops at its opened pull request; a
  human-invoked ticket of a release epic still ends per step 10 unchanged),
  step 7 (the driver hires the reviewer in an unattended run), step 9 (the
  sanctioned merge's surface is the epic branch — step 10, or the run
  driver's merge step), step 10 (a driver-spawned worker never reaches the
  merge); CLAUDE.md's merge invariant; README's `/flow:run` row and the
  reviewer section's new "the hirer is never the party under review"
  paragraph; METHODOLOGY's "Why the run loop is code, not prose".
- **`/flow:run` now requires the Workflow tool.** If it is unavailable the
  skill stops and reports; there is deliberately no prose fallback loop,
  because a fallback would restore the improvisation surface the conversion
  removed. One ticket at a time by hand with `/flow:ticket` remains the
  escape hatch.
- **`check-invariants.mjs` now watches the workflow script too**: the
  "A driver spawned you" handshake (ticket step 10 keys on it) is checked in
  `workflows/run-epic.mjs` alongside the two skills, and the script must
  carry the merge-direction phrase — load-bearing prose moved into code, so
  the drift checker follows it there. Both new invariants have negative
  tests (suite 7 → 9).
- **Review fixes** (fresh-context review, opus/high, 2026-08-11; one
  Important, five nits, all fixed): an **errored Workflow call is a recorded
  halt** — run skill step 4 now defines the third branch (no prose
  continuation, facts recovered from the board, error quoted as the stop
  condition), and the `/flow:ticket` escape hatch is scoped to
  nothing-launched only; worker-authored result fields (`built`,
  `verification`, `reviewOutcome`, a halt's `detail`) are **fenced as
  untrusted data on both paths** and the skill now says what the fences are
  and how to erase them deliberately; the script's `STOP` strings re-synced
  to the rewritten skill's step 5 wording; the worker `stopCondition` enum is
  derived from the `WORKER_STOP` map so the two cannot drift; the checker's
  workflow merge-direction guard anchors on the `NO_MAIN` prompt rule, not
  the meta description; README's permission surface names the Workflow
  launch and its inventory names the workflow script; METHODOLOGY gains
  "Why the run loop is code, not prose"; step 5 tells the session to clear
  an unaborted merge before committing a halt record.

## 2.0.0 — 2026-08-11

The cost release: the flow's guarantees become adaptive and cheaper, per an
external token-economics review (the repo's own record showed ~155k tokens
per quick ticket, ~450k of reviewer spend across Q-11–Q-17, much of it on
one-line changes). The epic declaration syntax is replaced outright — the
plugin is new, so the old `Release mode:` / `Run mode:` lines are removed
rather than shimmed — hence the major version.

- **Flow is opt-in.** The skills' trigger descriptions no longer invite
  auto-engagement on ordinary requests ("or asks for a small change" is
  gone): plain request = direct development, `/flow:*` = managed
  development. README documents the three lanes (direct / quick / epic) and
  ships a `CLAUDE.md` policy snippet for installing projects. There is
  deliberately no `/flow:direct` command.
- **`/flow:quick` is now the cheap lane: in-session by default.** The
  supervisor/fresh-worker execution loop (1.15.0) is reversed for quick
  only: the session that writes the `Q-<n>` ticket implements it, verifies
  with counts, writes a short entry, and opens the PR. A fresh-context
  reviewer is spawned **only when behaviour changes**, on a cost-efficient
  model at `effort: medium`; prose-only diffs — documentation and comments,
  nothing a machine reads — get none, the pull request being the review.
  The size + risk gate is unchanged and still routes consequential work to
  `/flow:epic` at any size.
- **Session guard reshaped to match** (`hooks/ticket-session-guard.mjs`):
  every `/flow:quick` invocation marks the session as carrying
  implementation context (it is in-session by design, and is itself never
  refused, at any count); `--interactive` remains a `/flow:ticket`-only
  concern — refused in a marked session, toward supervisor mode or /clear.
  Refusal message updated; guard suite 13 → 14.
- **Ticket review is tiered by consequence, model and effort together**
  (ticket skill step 7): prose only (documentation and comments — nothing
  any runtime, parser, test, or agent reads) → fast mid-tier model at
  `low`; everything else below the risk list, config and strings and CLI
  output included → capable mid-tier model at `high`; the consequence list
  (unchanged, still coupled to quick's entry gate) → strongest model at
  `xhigh`. The epic's `Reviewer model:` line overrides the tiers. The flat
  "strongest model always" default is gone.
- **Workers read a compiled brief, not the whole status log** (ticket skill
  step 2): `tickets.mjs brief` now also carries the epic preamble (ground
  rules) and the log's owed items — every non-Nothing `**Owed:**`
  paragraph, attributed to its entry — as `preamble` and `owed` in `--json`
  and as sections in the plain rendering. Required reading becomes O(epic),
  not O(history); the full log is read only when something in the brief
  sends you there. The owed ledger has explicit repayment syntax: a
  `**Resolves owed:** <ID> …` line (entry or dated addendum) closes the
  item entry `<ID>` recorded, and only unclosed items appear in the brief —
  whose heading says honestly what the list is ("recorded, not marked
  resolved"), since an unmarked discharge is invisible to a parser; the
  ticket skill instructs writing the marker, and appending it when a stale
  item is found.
- **The prose/behaviour review boundary is drawn at what a machine reads,
  not what looks harmless**: only documentation and code comments qualify
  for the cheap lane (quick's no-reviewer case, the ticket skill's lowest
  tier). Configuration, user-facing strings, CLI output and skill/agent
  Markdown all execute somewhere and price as behaviour; when unsure, it is
  behaviour.
- **Status entries are short** (ticket skill step 6): Built (1–3
  sentences), Mode, Tokens, Verified, Decisions (deviations only, "none"
  allowed), Owed. The **Files touched** line is dropped — git records it.
- **`Delivery: release | incremental`** — one preamble line replaces the
  two-line `Release mode:` / `Run mode:` declaration, which is removed
  outright (no compatibility parse; this repo's own three epic docs are
  migrated in this commit). `release` — tickets integrate into
  `epic/<name>` unattended, one human-gated release pull request;
  `incremental` (the default when absent) — every ticket its own
  human-gated pull request to the default branch. One line, one decision:
  the serial+autonomous contradiction is no longer declarable, so its
  refusal machinery (`modeContradiction`, the `find` error, the doctor
  fail) is deleted. Exposed as `delivery` in `find --json` and
  `list --json` (`releaseMode`/`runMode` are gone from both payloads);
  doctor warns on unrecognised values and near-miss shapes, and flags the
  retired labels by name so a preamble written in the old syntax is never
  silently ignored. Tickets suite lands at 36.
- **Release delivery is the recommended default for multi-ticket epics**
  (epic skill): the human's two decisions are plan sign-off and the release
  pull request — a human approving every intermediate PR is a scheduler,
  not a judge (the Q-10–Q-17 stacking record is the evidence). Bounded:
  ~3–6 tickets, days not weeks, a reviewable release diff — else split or
  go incremental. Interactive per-ticket execution is demoted to an escape
  hatch. The environment probes, waiver handshake, stop conditions and
  every merge rule are unchanged; the release PR body now states the
  release's diff stat up front.
- **`Worker model: <model>`** — an optional preamble line, parsed like
  `Reviewer model:`, pinning the model the implementing workers run on.
  Absent, the skills pass no model and every worker inherits the session
  that spawns it (supervisor or run driver) — so the default is unchanged,
  and the line is how a plan written on one model is implemented by another
  (e.g. plan on a stronger model, implement on a cheaper one). Exposed as
  `workerModel` in `find --json` and `list --json`; passed at both worker
  spawn sites (ticket step 0, run step 4c); covered by doctor's near-miss
  scan. Deliberately not a settings file: model choice lives in the
  versioned epic document, visible at sign-off.
- **A nit is not automatically a ticket** (ticket skill step 8): fixed in
  place when trivial and in scope, otherwise recorded in the addendum for
  the retro; it earns a ticket only by affecting users, real maintenance
  risk, recurrence, or riding an already-planned change.
- **Releases are batched** (this repo's own rule): every behaviour change
  still gets its changelog entry in the same commit, but version bumps now
  stamp deliberate batches instead of one number per change.
- METHODOLOGY.md records the reasoning and both reversals (quick's
  execution model, the serial default) with the token evidence; README and
  CLAUDE.md restate the changed doctrine in the same commit.

## 1.26.0 — 2026-08-09

Q-17: ticketless epics now get the `← this folder` marker (pre-existing,
found by Q-15's review).

- **`scripts/tickets.mjs`**: the shared `ticketlessLine` rendered a
  ticketless epic without the `← this folder` marker every ticketed epic
  gets — in a checkout whose root directory is named after a ticketless
  epic (exactly a freshly-cut epic's state, the one-checkout-per-epic
  convention the script reads), the unfiltered board showed the marker on
  no epic at all, while `current` answered correctly. The marker is now
  rendered by one `hereMarker(name, current)` helper shared by the
  ticketed and ticketless lines, so the two renderings cannot drift apart,
  and both ticketless boards — all-empty (Q-8's branch) and mixed
  (Q-15's) — carry it through the one shared line. `ticketlessLine` takes
  its arguments in the same order for the same reason a shared helper
  exists: a transposed call fails silently (undefined compared to an
  object renders no marker and raises nothing). Adjacent, sanctioned by
  Q-17's ticket: the dead false branch on the "Nothing left to start."
  line (unreachable — the empty board returns earlier) is removed; no
  output change.
- Tests: two repos, one named after its ticketless epic and one named
  after its ticketed epic, pin the marker on both sides of the shared
  helper — the empty-state line carries it on the all-empty and mixed
  boards alike, the ticketed header carries it in its own checkout, and
  each test's neighbouring epic stays unmarked. All pinned as composed
  lines to end-of-line, so the unmarked assertions prove absence too.

## 1.25.0 — 2026-08-09

Q-16: doctor's no-status.md hint now names both creation doors
(pre-existing, found by Q-13's review).

- **`scripts/tickets.mjs`**: the warning for a missing status.md said
  "created at sign-off by /flow:epic" — but the quick lane never runs
  `/flow:epic`; its log is created by ticket step 6, so between quick
  step 3 (plan committed) and the worker reaching step 6 the hint
  advertised a recovery unreachable from the state that triggers it. The
  message now names both doors, each as a command the reader can run:
  sign-off by `/flow:epic`, or the first ticket's status entry (ticket
  step 6, reached with `/flow:ticket <ID>` — the quick lane's only door).
- Tests: the full warning text is pinned verbatim on an epic without
  status.md, so neither door can silently drop from the hint.

## 1.24.0 — 2026-08-09

Q-15: the mixed board no longer omits ticketless epics (pre-existing, found
by Q-8's review).

- **`scripts/tickets.mjs`**: when at least one epic had tickets,
  `printBoard`'s per-epic loop skipped any epic whose tickets.md has no
  `## <ID> — …` sections yet — that epic was absent from the unfiltered
  board entirely, existing work reported as nonexistent at larger blast
  radius than Q-8's all-empty case. The mixed board now names each
  ticketless epic with its empty state (`<epic> — no tickets yet`), the
  same line the all-empty board prints — factored into one place so the
  two renderings cannot drift apart.
- Tests: a repo with one ticketed and one ticketless epic → unfiltered
  `list` names both, the ticketless one as its composed empty-state line;
  the ticketed epic's header and ticket rows still render.

## 1.23.0 — 2026-08-09

Q-14: preamble values no longer scavenge across newlines (pre-existing,
found by Q-7's review).

- **`scripts/tickets.mjs`**: the shared preamble parse (`grab`) put `\s*`
  around the label's colon, and `\s` matches newlines — so a value-less
  label line adopted the first word of the next paragraph: a bare
  `Run mode:` above prose beginning "Autonomous is not wanted here." parsed
  as `runMode: 'autonomous'` (verified live by Q-7's review). All three
  labels — Release mode, Run mode, Reviewer model — share the one parse, so
  the fix lands once for the class: `[^\S\n]*` in place of `\s*` anchors
  the value to the label's own line, and a value-less line now reads as
  absent (serial default / null).
- **doctor**: the near-miss warning already fired on a value-less label
  line but misdescribed the failure ("will not parse, so it silently
  defaults" — it parsed, into unrelated prose). With the value anchored
  that sentence is now true, and the hint names the missing piece: value
  on the label's own line, beside the existing label-at-line-start and
  no-formatting requirements.
- Tests: a value-less line under each of the three labels, each followed
  by a paragraph opening with a word the old parse scavenged into a live
  value, must read as absent — and each line is doctor-flagged with the
  corrected hint. A label split from its colon across lines (the markdown
  definition-list shape) also reads as absent, pinning the pre-colon side
  of the anchor, which the value-less shapes cannot reach (review fix).
  Tickets suite 29 → 30.

## 1.22.0 — 2026-08-09

Q-13: the status-log preamble is defined where creation is instructed
(pre-existing, found by Q-6's review).

- **`skills/ticket`** step 6 told a worker to create a missing status log
  but defined none of its content, and **`skills/quick`** step 4's spawn
  prompt named "the standard append-only preamble" — text that lived only
  in the epic skill's template, a document a mid-ticket worker never loads,
  so it would have had to invent one. Skills are self-sufficient: step 6
  now carries the exact preamble (the heading through the **Rules** block),
  the quick skill's spawn prompt points at step 6 — the step its worker
  already executes — and the epic skill's template names the coupling on
  its side, so the two copies move in the same commit (the risk-list
  precedent). The preamble's content is unchanged.
- **`skills/run`** step 2's sign-off gate no longer claims `status.md` is
  created only after the human approves — with step 6 a documented second
  door, that was a one-rule drift; the gate's evidence stands as presence
  on the remote epic branch, which the mid-ticket door (ticket branches,
  after a run has begun) cannot fake (review fix). The ticket skill also
  names which heading step 6 parses — the `###` entry heading, not the
  carried preamble's `#` title (review fix).

## 1.21.0 — 2026-08-09

Q-12: the retro mines in fresh context (user request at the autonomous
retro, 2026-08-08).

- **`skills/retro`**: `/flow:retro` mined the record in the invoking
  session — often the same session that planned or ran the epic, carrying
  exactly the opinions the retro should examine. It now has the supervisor
  shape the ticket lane already has: the invoking session resolves the epic
  (step 1), then spawns a fresh-context **miner** (new step 2) — a general
  agent, empty context — that reads the whole record and drafts the report
  and proposals (steps 3–5); the approval gate at the end of step 5 and the
  shipping in step 6 stay with the human's session, which shows the miner's
  report unedited and asks. The miner edits no files, creates no tickets,
  and never holds the gate. The supervisor fetches the epic's absolute
  paths from `tickets.mjs epics --json` — step 1's `list` output carries
  none — and hands the miner `ticketsDoc`, `statusDoc`, `repoRoot` (step
  3's git commands anchor to it), `contextDir` when present, and the
  default branch (review fix: the paths had no named source and `repoRoot`
  was missing from the handed set). Step 2 opens with a reciprocal guard so
  a spawned miner, reading the skill "exactly as written", never spawns a
  miner of its own (review fix; the ticket skill's step 0 precedent).
- **`README.md`** retro row and **METHODOLOGY.md** § "Why an epic ends with
  a retro" state the same rule with its reasoning, in the same commit (one
  rule, every statement moves together).

## 1.20.0 — 2026-08-09

Q-11: token accounting — a **Tokens** line per ticket, a sum per epic (user
request at the autonomous retro, 2026-08-08).

- **`skills/ticket` step 6 template**: the status entry gains a **Tokens**
  line — what the harness reports for the ticket's work, per agent where the
  agents are separate. `unknown` is tolerated and honest when the harness
  exposes no figure; estimating one is not. The number is planning evidence
  for future sizing, never a gate — no step reads it to decide anything.
- **`skills/ticket` steps 0 and 8**: the entry is committed before the review
  runs, so the reviewer's figure cannot ride the step 6 line — it lands in
  the step 8 review addendum on the same terms, and the supervisor's step 0
  hand-back passes the reviewer's token figure alongside model and effort,
  because only the hirer knows it.
- **`skills/quick`**: the supervisor lane's hand-back sentence carries the
  same three items — model, effort, token figure (review fix: the rule was
  updated in one of its two statements, the drift the one-rule invariant
  forbids).
- **`skills/run` steps 4c and 6**: the run record template gains a
  **Tokens** slot on the same terms — per ticket (worker and reviewer) and
  the run's total of the known figures. The worker's spawn prompt has it
  report its reviewer's harness-reported figure, and the driver records
  each worker's — figures flow from hirer to record, since only the hirer
  observes them (review fix: the slot originally asked the driver for a
  figure it had no channel to obtain). The slot names itself a
  **restatement** of the ticket entries' figures, so an epic sum never
  counts it (review fix: it double-counted every autonomous ticket).
- **`skills/retro` step 4**: the report sums the epic's spend from both
  places the status log carries a figure — each entry's **Tokens** line and
  its addendum's `Reviewer tokens` (review fix: summing the Tokens lines
  alone silently dropped every reviewer) — skips run-record restatements,
  and names `unknown` entries rather than counting them as zero.
- Nothing is stored or parsed outside the status documents: `tickets.mjs` is
  untouched and reads no cost data.

## 1.19.0 — 2026-08-09

Q-10: the run skill's protection gate documents 403 and honors a recorded
waiver.

- **`skills/run` step 3**: the branch-protection check documented success and
  the 404→rulesets fallthrough, but a private repository under a free-plan
  org returns **403 on both endpoints** (hit live by the first unattended
  run), and step 5's blanket nonzero-exit rule made the probe's own failure a
  stop condition — an unattended run would halt on an environment shape the
  skill never named. The step now names 403 as "protection unavailable on
  this plan", marks the two probes as the skill's only tolerated nonzero
  exits (their statuses are the data the check reads), and defines where the
  driver finds a pre-recorded human waiver: the epic's `tickets.md`, on the
  Run mode line or under the ground rules. A waiver is a recorded
  **decision** ("waived <date>: <who> chose to run without the hard floor"),
  never a bare probe finding — a line that only records the 403 is no
  waiver (review fix: the two were previously indistinguishable). Waiver
  found: proceed, name it in the run record (new **Protection:** slot in
  step 6's template) and in the release PR body (step 7); none: report and
  stop before ticket one.
- **`skills/run` step 5**: "nothing is marked tolerated" became false with
  the change above; the clause now tolerates exactly a **404 or 403 from
  the two probes** — any other probe failure (auth, network, rate limit,
  5xx, wrong repository) still halts (review fix: the carve-out was
  originally granted to the commands, not the statuses).
- **`skills/epic` Run mode template**: the writer's side of the waiver
  handshake (review fix — the run skill defined a reader for an artifact no
  skill instructed anyone to write): when the plan-time probe finds
  protection missing or unavailable, the human decides at sign-off — fix
  the environment or waive it, the waiver written as a decision in the same
  tickets.md spots the probe result goes.
- **README**: the halt list now names the one tolerated exception, and
  "both must exist" admits the protection waiver — the same rule the run
  skill states (review fix; the old "both must exist" had never matched the
  skill's waivable protection).

## 1.18.0 — 2026-08-09

Q-9: plain `find` renders the pull request instead of `[object Object]`.

- **`tickets.mjs` `find <ID>`**: the human-readable output interpolated every
  fact raw, and pr is an object — a ticket with a pull request printed
  `pr [object Object]` (BOARD-3's review, pre-existing). The line now renders
  what a human acts on: `#<number> (<STATE>) <url>`. Without a PR it still
  prints `null`, and `find --json` is untouched (it was already correct). A
  test pins the rendered line via a stubbed `gh` (tickets suite 28 → 29).

## 1.17.0 — 2026-08-09

Q-8: the unfiltered board no longer claims "no epics found" when epics exist.

- **`tickets.mjs` `list`**: when epic folders exist but none has a
  `## <ID> — …` ticket section yet, the unfiltered board named nothing and
  printed `no epics found under epics/` — existing work reported as
  nonexistent, the same lie the filtered branch told before BOARD-2. It now
  names each epic with its empty state ("<epic> — no tickets yet"); a repo
  with genuinely no epics keeps the old honest answer. Test covers both
  branches (tickets suite 27 → 28).

## 1.16.0 — 2026-08-08

Q-7: configurable reviewer model.

- **`Reviewer model: <model>`** — an optional line in an epic's tickets.md
  preamble. `tickets.mjs` parses it alongside the mode lines (same tolerant
  parse: first word after the colon, case-insensitive label, prose after the
  value ignored; the value charset admits digits and dots for real model
  identifiers) and exposes it as `reviewerModel` in `find --json` and
  `list --json` — null when absent, never a default. The model was fixed in
  skill text before this; redirecting it took a mid-run conversational
  directive (AUTO-4, 2026-08-08). Now it is configuration.
- **`skills/ticket` step 7** passes the epic's `reviewerModel` when spawning
  the reviewer and keeps today's default when the line is absent: the
  strongest model available. **`skills/run`** states the same rule where the
  driver's workers spawn their reviewers. The default itself is unchanged.
  The line governs the **ticket reviewer only**: the plan reviewer is spawned
  on the draft the line lives in, before sign-off makes it configuration, and
  stays on the strongest model available (review fix — the first README
  wording implied both reviewers).
- **`doctor`** extends its preamble near-miss scan to the new line: a
  formatted `**Reviewer model:**` reads as absent and would silently fall
  back to the default model, the same failure class as a near-miss mode line.
- Tests: present, absent, prose-decorated, case/charset, and near-miss
  shapes (tickets suite 24 → 26).

## 1.15.0 — 2026-08-08

Q-6: `/flow:quick` routes through the ticket loop's lane fork.

- **`skills/quick` step 4**: after quick's own steps 1–3 — the gate, the
  written ticket, `q-<n>` cut with the plan committed, the parts that need
  the conversation — the session becomes the **supervisor** per the ticket
  skill's step 0: a fresh-context worker implements from the ticket text
  (ticket steps 4–6, with steps 1–3 scoped out of its prompt — the branch
  already exists), and the supervisor hires the reviewer. This closes the
  two holes AUTO-5's review handed to the retro: a session marked by an
  earlier `--interactive` run could still implement on contaminated context
  through quick, and quick's implementer hired its own reviewer. Retro
  decision, 2026-08-08: routing over a documented opt-out — quick's savings
  are planning ceremony, never execution hygiene (reasoning in
  METHODOLOGY.md § "Why small work has a path").
- **`/flow:quick <description> --interactive`** keeps the in-session lane at
  the same price as any interactive ticket: the session guard
  (`hooks/ticket-session-guard.mjs`) now watches both doors — a quick
  `--interactive` sets the same session marker, and a marked session is
  refused any later `--interactive` run of either command. Marker lifecycle
  (set at invocation, wiped on clear/startup, survives resume/compact)
  unchanged; plain invocations of both commands still pass in a marked
  session. Guard suite grows 10 → 13.
- Review fixes (opus/high): the routed worker's spawn prompt keeps ticket
  step 2 — the reading obligation and its stop-on-contradiction rule — and
  receives absolute document paths from the supervisor's own `find`; the
  guard's refusal message is door-agnostic ("rerun the command without
  --interactive" — the old text named a recovery not performable at the
  quick door), with the ticket skill's step 0 quote updated in the same
  commit under a dated re-plan note in Q-6's scope.

## 1.14.0 — 2026-08-08

Q-5: the autonomous epic's retro ships its lessons as rules.

- **`skills/epic`:** declaring `Run mode: autonomous` now obligates probing
  the environment prerequisites at plan time and recording the result — the
  first live run discovered a free-plan 403 on the branch-protection
  endpoints on run day, and its waiver landed seconds before start. The Outcome
  template asks the evidence line to name an observer that can distinguish
  success from failure ("zero interventions" was unfalsifiable under a
  shared GitHub identity).
- **`skills/ticket`:** the status entry's **Owed** line requires a carrier
  that can structurally reach the deferred check — an owed check was once
  handed to a lane whose entry point never touches the step it verifies.
- The repository's root instructions gain two invariants distilled from the
  epic's five reviews (cross-document doctrine drift; gates checked at the
  wrong door), METHODOLOGY.md records the observer lesson, and the retro's
  owed-work queue lands as quick tickets Q-6–Q-12.

## 1.13.0 — 2026-08-08

AUTO-5: attended tickets get the same fresh context the autonomous run just
proved — supervisor by default, interactive by flag.

- **`/flow:ticket <ID>` defaults to supervisor mode** (new step 0): the
  invoking session resolves the ticket and implements nothing; a
  fresh-context worker executes the skill from the documents alone, and
  **the supervisor hires the reviewer** — the party under review no longer
  picks its own judge. Multiple tickets per session become legitimate:
  every worker starts empty. The status entry gains a **Mode** line naming
  the worker, which is what makes the rule auditable after the fact.
- **`/flow:ticket <ID> --interactive` runs in-session as before**, for
  conversing with the implementing agent mid-ticket — once per session.
- **New static hook** (`hooks/hooks.json` + `hooks/ticket-session-guard.mjs`,
  UserPromptSubmit + SessionStart): an interactive invocation drops a
  session marker in the OS temp dir; a later `--interactive` run in that
  session is refused ("this session already ran a ticket interactively and
  carries its context — run /flow:ticket without --interactive (supervisor
  mode: a fresh worker implements), or /clear to reset the session").
  Supervisor invocations pass even in a marked session — their workers
  start empty, which is the property the rule protects — and set no marker.
  The marker is wiped on SessionStart clear/startup and survives
  resume/compact, so /clear works even where the session id does not
  rotate. Zero dependencies; the guard has its own test suite
  (`node --test plugins/flow/hooks/ticket-session-guard.test.mjs`).
- Autonomous epics are unchanged: the `/flow:run` driver already plays the
  supervisor's role, and its workers self-review per the ticket skill's
  step 10.

## 1.12.0 — 2026-08-08

BOARD-3: the next-ticket brief — a ticket's whole picture from one command.

- **New subcommand `tickets.mjs brief [ID]`**: prints the ticket's full
  section from its epic's `tickets.md` (Scope, Not in scope, Acceptance
  criteria) plus the derived facts `find` reports — state, branch, epic,
  modes, pull request — so a session can read what a ticket demands without
  opening the ticket doc. With no ID it briefs the first startable ticket in
  document order (the same one Next up proposes), naming its epic. An unknown
  ID gets `find`'s refusal verbatim (shared code path, not a copy). `--json`
  emits the `find` payload plus a `body` field carrying the section text.
- The board's Next up section gains a hint line that the brief exists — named
  as the script subcommand, since `/flow:brief` is not an installed command
  and the board never suggests a command that does not exist.

## 1.11.0 — 2026-08-08

BOARD-2: an unknown epic filter is an error, not an empty board.

- **`tickets.mjs next <epic>` and `list <epic>` refuse a filter that names no
  epic**: `no epic "<arg>" under epics/` on stderr, exit 1, in plain and
  `--json` forms alike (the `--json` forms emit no payload on that error).
  Before, `next` with a typo'd epic printed `nothing left to start` with exit
  0 — indistinguishable from a finished epic (found live, 2026-08-08) — and
  `list --json` silently emitted a valid empty payload. One rule, all
  commands, all forms; valid filters are unchanged. Plain `list` of a real
  epic whose tickets.md has no ticket sections now says
  `epic "<name>" has no tickets yet` instead of falsely claiming the epic
  does not exist.

## 1.10.0 — 2026-08-08

BOARD-1: the board's Next up suggestion is now a command that exists.

- **`tickets.mjs` Next up prints `/flow:ticket <ID>`**, not the bare
  `/ticket <ID>` — plugin commands are namespaced, and a user who ran the
  board's suggestion verbatim got "Unknown command" (found live, 2026-08-08).
  A sweep of the script found no other non-namespaced command suggestion; a
  test now pins the namespaced string and rejects any bare `/ticket `.

## 1.9.0 — 2026-08-08

AUTO-3: the `/flow:run` driver — an autonomous epic runs start to finish with
nobody present, and the human gate moves to the release pull request.

- **New skill `/flow:run <epic>`.** Refuses anything but a signed-off
  `Run mode: autonomous` epic (sign-off is verified mechanically: the epic's
  documents on `origin/epic/<name>`). Loops the tickets in document order,
  **each in a fresh-context agent** — the driver orchestrates, logs which
  agent ran each ticket, and never implements — refreshing `epic/<name>`
  from the default branch between tickets. Halts on the epic's ground-rule
  stop conditions (BLOCKED, an unfixable Important finding, a document/code
  contradiction, a merge conflict, reviewer-spawn failure past the fallback,
  a permission prompt firing mid-run, any failing command) with a run record
  in the status log saying why, and never improvises past one. Ends by
  **opening** the release pull request with the full evidence trail — and
  never merges it.
- **`/flow:epic` pushes `epic/<name>` to origin at creation** (gap found by
  AUTO-2's review): integration-mode pull requests need their base on the
  remote, and an unattended run cannot stop to ask — the push is also what
  lets `/flow:run` verify sign-off happened.
- **README + METHODOLOGY** carry the narrative: why the gate moves and never
  disappears, why main stays sacred, why stop conditions beat retries, and
  the two pieces of environment setup an unattended run needs first — a
  pre-authorized permission surface, and branch protection on the default
  branch as the hard floor under every soft rule.

## 1.8.0 — 2026-08-08

AUTO-2: the gated self-merge path — the one sanctioned agent merge, and only
into an epic branch.

- **`/flow:ticket` step 10 forks on `runMode`.** Attended epics: unchanged —
  stop at the pull request. Autonomous epics: after the review addendum
  exists (an unreviewed ticket is never merged, anywhere; reviewer-spawn
  failure falls back to an instructed general agent, and stops if that fails
  too), verify the PR's base is `epic/<name>`, merge it with a merge commit,
  and continue to the next ticket. Merging toward main remains forbidden to
  agents in every mode.
- **The epic template gains the optional `Run mode: autonomous` line**, and
  an autonomous sign-off must state the unattended consequence in plain
  terms; the plan reviewer flags a draft whose Run mode block omits that
  consequence.
- **Fixed (owed by AUTO-1):** step 9 no longer tells a serial epic's first
  ticket to base its PR on the epic branch — that stranded the epic docs;
  the PR targets the default branch, which is how the docs ship.
- CLAUDE.md merge doctrine rescoped in the same commit.

## 1.7.0 — 2026-08-08

First ticket of the autonomous epic (AUTO-1): the epic's modes become parsed
facts, ahead of any behaviour that reads them.

- **`tickets.mjs` parses `Release mode:` and `Run mode:`** from the epic
  preamble — tolerant (first word after the colon, prose ignored), defaulting
  to serial/attended when absent. Exposed as `releaseMode`/`runMode` in
  `find --json` and as a `modes` map in `list --json`; the board labels
  non-default epics.
- **`Run mode: autonomous` with serial topology is refused mechanically** —
  a `doctor` fail and a `find` error — because unattended merges may only
  ever target an epic branch, never the default branch.
- **Unrecognised mode values are doctor warnings**, exposed raw rather than
  silently coerced.
- Test suite grows 9 → 13.

## 1.6.0 — 2026-08-08

- **The ticket skill's `xhigh` review tier inherits payments and
  data-deleting/rewriting changes** (Q-4), aligning it with the quick path's
  entry triggers. The two lists measure the same thing — consequence — at two
  doors; when one learns a new trigger, the other inherits it in the same
  commit.

## 1.5.0 — 2026-08-08

Four items adopted from an external methodology review; its other proposals
(a standalone principles document, a per-ticket risk matrix, a deployment
toolkit) were rejected under the new admission test.

- **The quick path is risk-gated, not just size-gated.** Auth or authorization
  boundaries, secrets/crypto, migrations and data rewrites, new network
  exposure, payments, and anything that can fail open route to `/flow:epic`
  at any size — a single-ticket epic is fine; the plan review and sign-off
  are what consequential work must not skip.
- **Epics state a falsifiable Outcome** — problem, observable change,
  evidence, reversal condition. The plan reviewer flags outcomes that cannot
  fail; `/flow:retro` gains a fifth question checking the evidence. The only
  part of the flow that looks past the merge, and it stays human-invoked.
- **Integration mode is challenged as a design choice.** The epic template and
  the plan reviewer both push expand/contract and feature flags before
  accepting "cannot ship alone".
- **METHODOLOGY.md names the philosophy** (evidence-driven development under
  disposable context) and adopts **the admission test**: every artifact and
  gate must reduce uncertainty, constrain blast radius, preserve necessary
  knowledge, or provide decision evidence — or it is ceremony.

## 1.4.0 — 2026-08-07

- **New agent `flow:plan-reviewer`, wired into `/flow:epic`.** Before the
  sign-off gate, a fresh-context agent reads the draft decomposition against
  the actual code and reports — oversized tickets, ordering that doesn't
  de-risk, uncheckable criteria, dependencies hiding in prose — plus questions
  only the human can settle, carried into sign-off unchanged. It never rewrites
  the plan.
- **New skill `/flow:doctor`** — is this project ready for the flow? The
  deterministic half is `tickets.mjs doctor`: remote, `origin/HEAD`, `gh`,
  merge settings, instruction-file existence, duplicate IDs — and headings
  that *almost* parse, which otherwise silently read as "not done". The
  judgment half reads the instruction files for what the skills will actually
  ask of them (the exact test command above all).
- **New skill `/flow:retro`** — close a finished epic: collect Owed lines
  nothing inherited, constraints rediscovered by multiple tickets, defect
  classes review kept finding, and planning misses. Proposes at a hard gate;
  approved lessons ship via `/flow:quick`, owed work becomes tickets, and the
  status log gains one final appended `## Retro` section.

## 1.3.0 — 2026-08-07

## 1.3.0 — 2026-08-07

- **New skill `/flow:quick <description>`** — one small piece of work through
  the full loop (scope, verify, review, log, pull request) with no epic
  ceremony. Tickets accumulate as `Q-<n>` in the standing `epics/quick/` epic;
  the branch cuts from the default branch and carries the docs itself. Includes
  a hard size gate: work that doesn't fit is redirected to `/flow:epic`.
- **Board: new `integrated` state.** A pull request merged into an epic branch
  (integration mode) no longer reads as `shipped`; it is `integrated` until the
  release pull request lands on the default branch.
- **Board: duplicate ticket IDs are detected.** An ID defined in two epics is
  flagged on the board, and `find` refuses it instead of silently resolving to
  an arbitrary epic.
- **Board: the shipped-detection scan cap is no longer silent.** When only the
  last 4000 commits were scanned, the board says so.
- **Epic: the epic branch is cut from `origin/<default>`**, never from whatever
  branch planning happened to run on.
- **Review: the default range is computed against the branch's real base** —
  the pull request's base ref, or `epic/<name>` in integration mode — not
  blindly against `origin/HEAD`.
- **Squash guidance relaxed.** A single-ticket pull request titled
  `<ID>: <title>` survives squash (the squash commit inherits the title); only
  multi-ticket release pull requests must merge with a merge commit.
- **The reviewer model is no longer hardcoded.** The agent inherits, and
  `/flow:ticket` instructs passing the strongest model available rather than a
  literal model name.
- **Tests for `tickets.mjs`** — a fixture-repo suite:
  `node --test plugins/flow/scripts/tickets.test.mjs`.

## 1.2.0 and earlier

Pre-changelog: initial plugin (epic, ticket, tickets, review, the reviewer
agent, `tickets.mjs`), reviewer memory rules, epic sources and the
one-branch-per-epic model. See git history.
