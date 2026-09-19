# Retro-lessons epic — tickets

Source: the fresh-context retro of weekendgoals' `redesign-city` epic (17
tickets, four halted runs, mined 2026-09-18), transcribed in
`context/redesign-city-retro.md`; and the planning conversation of
2026-09-19, which checked every plugin-side finding against `main` as it
stands after the `design-fidelity` release (#54) and dropped the ones already
answered. Planned 2026-09-19.

Outcome: In `redesign-city`, two of four halts were the plugin's own
defects — a disposition agent committed every untracked file in the working
tree (215 files, 1.9M lines; caught only because a binary made the fix diff
unmeasurable), and a disposition whose git work had landed was classified as
one that did nothing because its structured return failed. The spend ledger
read 12.7M tokens from a log that records about 16.2M, because one entry's
four review rounds read as three corrections. Ten commits of shipped work —
including the fix for a production crash loop — sit on the epic branch with
no status entry, so the board, the ledger and the retro see 17 tickets and
not the 18th unit of work. And the release pull request, opened by an
attended session after the halts, said "Nothing owed" against 31 owed items
and carried no addendum request, because only a completed run's step 7 knows
what that body holds. Observable change: a driver-spawned agent cannot sweep
the working tree into a ticket; a disposition that landed is read as landed;
`spend` sums review rounds; unticketed commits show on the board; and the
release body is built from the log at whichever door opens the pull request.
Evidence: the next release epic run in weekendgoals — its retro (observer: the
fresh-context retro miner, reading `runs.md`, `status.md`, `tickets.mjs spend`
and `doctor`) finds zero halts classed `plugin` from these two causes **and reports the
denominator that makes the zero mean something** (how many review fixes added
a file, how many dispositions returned no report — both are fields the run
record carries after RETRO-1 and RETRO-2), a ledger total equal to the log's
own per-round figures, a release pull request whose owed list equals what
`tickets.mjs owed <epic>` prints, and every commit on the epic branch outside
a ticket named in that body. All are produced by records the run and the
script already write. Reversal: if the unticketed-commit **warning** fires on
the epic's own bookkeeping (merges, refreshes, plan edits, log addenda) or on
commits subjected with the epic's name, it is noise and RETRO-3's warn comes
out;
if the new-file halt stops a run more than once on a fix that rightly added a
file, it goes back to buying a re-review.

Areas in scope: `plugins/flow` (root `CLAUDE.md` binds all of it — the
driver `workflows/run-epic.mjs` and its suite, `scripts/tickets.mjs` and its
suite, the two Codex runners under `scripts/runners/`,
`scripts/check-invariants.mjs`, the skills, the two reviewer agents, README,
METHODOLOGY, CHANGELOG).

Delivery: release — seven tickets, one over the rough bound because the plan
review split the last one along its only code seam (RETRO-6 is small); one
release pull request. Each is a bounded
change over code with its own suite, and the release diff is one a human can
read. RETRO-1 and RETRO-2 edit `run-epic.mjs` while a run is in flight:
harmless, because a workflow script is read once at launch, and it means this
run is not governed by the gates it builds.

Environment probes, 2026-09-19: branch protection on `main` —
`gh api repos/{owner}/{repo}/branches/main/protection` answers 404 "Branch
not protected" and `…/rules/branches/main` answers `[]`: unprotected, and
available (the repository is public). **Waived 2026-09-19: Vadim chose to run
without the hard floor** — "waive" at sign-off, having been told protection
could be switched on instead. Seven tickets, one over the rough bound, was
accepted at the same sign-off. The plugin is not installed in the
planning session's checkout, so an unattended run launched from this
repository pays one failed `flow:ticket-reviewer` hire per review and takes
the sanctioned fallback (run skill step 3) — a price, reported before ticket
one. `codex` is on PATH; this epic declares no Codex runner or shadow
reviewer.

Worker model: opus

Consequence paths: plugins/flow/workflows/**, plugins/flow/scripts/tickets.mjs

Decisions at planning, 2026-09-19:
1. **A review fix that adds a file halts only when the file lands outside
   the directories the ticket's own reviewed diff touched** (Vadim, shape
   review). A fix legitimately adds a test beside the code it fixes; a file
   in a directory the ticket never entered is the sweep's signature. Inside
   those directories a new file is still outside `reviewedFiles`, so it keeps
   today's consequence: the bounds trip buys the bounded re-review.
2. **Rounds are summed by an explicit label; an unlabelled repeat stays
   last-wins and doctor warns** (Vadim, shape review). "The last figure for a
   role wins" is how a dated correction overrides the entry it corrects, and
   inverting it would silently change the total of every log already written.
3. **Already answered on `main`, so not tickets here:** the worker that cannot
   spawn agents (HARD-6's plan-reviewer lens; `Fix bounds exclude:`), the
   write-only `Decisions` field (`deviation-routing`), a regression filed as a
   nit (the disposition prompt), criteria that measure the box and not the
   rendering (`design-fidelity`).
4. **Epic-level work subjected `<epic-name>: …` is listed, not warned about**
   (plan review, finding 1). This repository's own release-review fixes
   (`design-fidelity: review fixes — …`, three commits in #54) are work no
   ticket owns by construction. They are still the 18th unit of work — no
   entry, no spend line — so the board and the release body list them; but
   doctor warns only on a commit that names neither a ticket nor its epic,
   which is the shape nobody chose.
5. **A round is labelled once, where its figures are first recorded** (plan
   review, question 3): the run record in the unattended lane, the review
   addendum in the attended one; the other document points and never
   restates, as the addendum's "Tokens: recorded in the run record" already
   does. Two writers labelling one pass would double-count it under a sum.
6. **Project-side findings stay in weekendgoals.** The retro's I1–I9 and
   O1–O31 are that repository's; nothing here edits it.

Status log: `epics/retro-lessons/status.md`. Run a ticket with `/flow:ticket <ID>`.

## Ground rules for every ticket in this epic

- **CLAUDE.md's invariants bind every ticket** — read them first. In
  particular: `tickets.mjs` has zero dependencies and stores nothing, so
  RETRO-3 and RETRO-4 derive from git and the log and cache nothing; a
  behaviour change gets a CHANGELOG entry under `## Unreleased` in the same
  commit, with no version bump; every constraint written into a skill carries
  its reason.
- **A rule stated in more than one document is one rule.** Before changing a
  doctrine sentence, grep its key phrase across the skills, README,
  METHODOLOGY and CLAUDE.md and move every statement in the same commit. Then
  run `node plugins/flow/scripts/check-invariants.mjs` — it must exit 0 —
  and, where the ticket adds a coupling a string check can hold, add it there
  with a test.
- **A gate lives at the door its actor walks through**, and a refusal's
  advertised recovery must work in the refused state. RETRO-1's halt, RETRO-2's
  branch read and RETRO-4's body are each judged against that.
- **The driver's packets have copies.** The reviewer rules and packet body in
  `run-epic.mjs` are pinned equal to the Codex review runner's copy by
  `codex-review.test.mjs`; a prompt rule added to one writing prompt is added
  to every writing prompt, the Codex worker runner's included.
- **Every suite CLAUDE.md lists stays green**, and CLAUDE.md's pass counts
  move in the commit that moves them. No test launches a browser or calls the
  real Codex.
- **`EXPECT: # pass 1` is never a criterion.** Measured at planning on Node
  22: `node --test --test-name-pattern <p> <file>` prints `# pass 1` when the
  pattern matches **nothing** — the file itself counts — and also when it
  matches one test. Every name-pattern CHECK here expects two or more, and a
  ticket that adds one keeps to that.
- **No ticket needs an actor this lane lacks**: nothing here spawns agents
  from a worker, drives an interactive tool or reads a browser.

## Order

RETRO-1 and RETRO-2 first: they are the two defects that halted a live run,
and the unattended lane that runs the rest of this epic is the lane they fix
(from the next launch on). RETRO-3 before RETRO-4, because the release body
lists what RETRO-3 derives. RETRO-5 is independent and goes after the
git-facing work. RETRO-6 is a small `tickets.mjs` near-miss found while
planning this epic. RETRO-7 is prose and goes last, where it can cite the
rest.

CHECK ledger, 2026-09-19, on `main` at `0e4e714`: every CHECK below was run
with `tickets.mjs check RETRO-<n>` and **proven red** — by the planning
session and again by the plan reviewer; none was skipped and none errored on
quoting. Two first-draft CHECKs read green and were vacuous (`EXPECT: # pass
1` under `--test-name-pattern`, which a pattern matching nothing also
prints); they were rewritten, and RETRO-6 exists because of them.

## RETRO-1 — No agent sweeps the working tree

**Scope.**
- `workflows/run-epic.mjs`: one shared rule constant — stage only the paths
  you changed, by name; never `git add -A`, `git add .` or `git commit -a`,
  because untracked files in the tree are somebody else's and a sweep commits
  them as this ticket's — carried by **every prompt that writes**: the
  worker's, the disposition's, the re-review fix path where one exists, and
  the merge step if it commits. The ticket and quick skills already say this
  to an in-session doer; no driver prompt does.
- `scripts/runners/codex.mjs` is already safe and is not touched: the runner
  commits the whole tree by design, refuses a tree that is not clean before
  the run (`git status --porcelain`, which counts untracked files — its suite
  pins that with a stray untracked file), and its prompt says "anything you
  touch outside scope ships". Checked at planning, 2026-09-19.
- The added-files gate: whenever the disposition reports fix commits, **at
  every tier and before any re-review is hired**, one cheap read-only fact
  step reports the files the fix commits **added** (`--diff-filter=A` from the
  driver's reviewed head, the same pathspec exclusions as the bounds gate) and
  the files the review saw. Today those facts ride the resolve step only when
  `boundsGated` (`run-epic.mjs` ~1974), and a consequence-tier fix goes
  straight into `boundedReReview` before the resolve step exists — so a sweep
  there still buys the 1.9M-line review this ticket exists to refuse, and
  this epic's own tickets, all floored at the consequence tier, would never
  meet the gate. In code: an added file that is not **under the directory of
  any reviewed path or of any file a finding named** (the set the bounds gate
  already treats as inside, GHL-10) halts under a **new stop condition** — a
  review fix that adds files where the ticket never worked — naming the
  files. "Under" is a path-prefix test, not dirname equality: a fixture in a
  new subdirectory beside reviewed code is inside. An added file inside keeps
  today's behaviour (Decision 1). The record carries `fixAddedFiles` so the
  run record and the retro can count how often a fix added anything.
- The run skill's step 5 lists the new stop condition with its reason and its
  recovery (inspect the commits; if the sweep is real, revert it as a new
  commit on the ticket branch, then finish by hand per "Resuming after a
  halt"); README and METHODOLOGY § "Why the re-review became a code gate…"
  (or a new short section) carry the reasoning. `check-invariants.mjs` pins
  the stop-condition sentence between the driver and the run skill the way it
  pins `deviation`'s.

**Not in scope.** A clean-tree refusal for untracked files at run start —
projects legitimately keep untracked scratch files (this repository does), and
the rule above makes them harmless. The worker's **own** first commit is
reviewed as a diff by the reviewer; no new code gate on it here.

**Acceptance criteria.**
- When the driver builds any writing prompt, the prompt carries the staging
  rule; pinned by tests that read each prompt from the stubbed agent calls.
  CHECK: node --test --test-name-pattern 'staging rule' plugins/flow/workflows/run-epic.test.mjs
  EXPECT: # pass 3
- When a fix adds a file in a directory no reviewed path shares, the run
  halts under the new stop condition before any merge agent exists; when the
  added file sits beside a reviewed path, the existing bounds trip applies;
  when the resolve step reports no usable added-files fact, the run halts as
  an unmeasurable fix does today.
  The same at the consequence tier: the halt lands before any re-review is
  hired, asserted on the stubbed agent sequence. A new subdirectory beside a
  reviewed path, and a file a finding named, are inside.
  CHECK: node --test --test-name-pattern 'added files' plugins/flow/workflows/run-epic.test.mjs
  EXPECT: # pass 6
- The stop condition reads the same in the driver and the run skill.
  CHECK: node plugins/flow/scripts/check-invariants.mjs && test $(grep -c 'adds files where the ticket never worked' plugins/flow/skills/run/SKILL.md) -ge 1 && echo stop-condition-shared
  EXPECT: stop-condition-shared
- Every suite in CLAUDE.md passes; counts updated there. Revert check named in
  **Verified**.

## RETRO-2 — A disposition that landed is read as landed

**Scope.**
- `workflows/run-epic.mjs`, the branch at "the disposition agent returned no
  report" (and `outcome: "failed"` when the failure is the return, not the
  work): before halting, one cheap read-only fact step — the same shape as
  the resolve step's FACT 1 and FACT 2 — reports, from `origin/<branch>`
  after a fetch: the count of `Addendum — review —` lines in this ticket's
  entry, the head SHA, and the commits since the driver's reviewed head.
- In code: **no addendum on the pushed branch** → today's halt, unchanged.
  **An addendum is committed** → the disposition landed; the driver does not
  trust what it cannot read, so it proceeds **only** into the bounded
  re-review over the commits since the reviewed head, at the consequence
  tier, and from there down the normal path (acceptance, resolve, bounds,
  merge). With Important findings open and no fix commits since the reviewed
  head, it halts as `important-unfixed` does — nothing fixed them.
- On the recovered path the re-review is the **only** thing between an
  unfixed Important finding and the merge, so its packet carries the first
  review's findings block (today built for the disposition prompt alone,
  ~1564–1581, while the re-review's task line asks for "anything from the
  first review still unaddressed" and is never shown it). `boundedReReview`
  is declared after the halt this replaces (~1739 vs ~1638); hoisting it is
  part of the ticket.
- The record carries what happened (`dispositionRecovered: true`, the commits
  found) so the run record and the release body can say a ticket merged on a
  recovered disposition; the run skill's step 6/7 name the field.
- The run skill's step 5 and "Resuming after a halt" say what changed;
  METHODOLOGY § "Why the run loop is code, not prose" gains the reason: the
  git state is the fact, the structured return is a report of it, and a halt
  on a missing report when the fact is readable buys nothing (the retro's
  halt question).

**Not in scope.** Retrying the disposition agent — a second agent over a
branch that already carries an addendum dispositions the same review twice.
Any other agent's missing return (worker, reviewer, merge): each has its own
halt and its own reasons.

**Acceptance criteria.**
- When the disposition returns nothing and the pushed branch carries no
  addendum, the run halts exactly as today; when it carries one and fix
  commits, the bounded re-review runs over them and a clean re-review reaches
  the merge; when it carries one, Important findings were raised and no
  commit follows the reviewed head, the run halts on the Important finding;
  when the fact step itself returns nothing, the run halts as today.
  On the recovered path the re-review's prompt carries the first review's
  findings.
  CHECK: node --test --test-name-pattern 'recovered disposition' plugins/flow/workflows/run-epic.test.mjs
  EXPECT: # pass 5
- The recovered path never merges without the re-review having run — asserted
  on the stubbed agent sequence, not on a flag.
- The run skill names the field the record carries.
  CHECK: test $(grep -c 'dispositionRecovered' plugins/flow/skills/run/SKILL.md) -ge 1 && echo record-names-recovery
  EXPECT: record-names-recovery
- Every suite in CLAUDE.md passes; counts updated there. Revert check named in
  **Verified**.

## RETRO-3 — Unticketed commits show on the board

**Scope.**
- `scripts/tickets.mjs`: for each epic whose `origin/epic/<name>` (or local
  `epic/<name>`) exists, derive from git alone the non-merge commits in
  `<default-branch>..epic/<name>` that are **unticketed**: the subject does
  not begin with a ticket ID (`^<ID>[:\s]`, any ID of the shared shape — the
  same read `idsOnRef` does), **and** the commit touches at least one path
  outside `epics/` (plan edits, status entries, run records and addenda are
  the epic's own bookkeeping). Each carries `epicLevel: true` when its subject
  begins `<epic-name>:` — the convention this repository already uses for
  release-review fixes (Decision 4). Nothing is stored; an epic whose branch has
  merged reads as none, which is what "derived" means.
- `list`: one dim line under the epic — `<n> unticketed commit(s) on
  epic/<name>` — and the array in `--json` (sha, subject). `doctor`: a
  `warn` **for the commits that name neither a ticket nor the epic**, naming
  the count, the first few subjects, and the repair — record the
  work: a ticket added to `tickets.md` with a status entry, or
  `/flow:quick` for a one-off; never rewriting history to add an ID. A warn,
  never an error: the work may be right, what is missing is its record.
- The ticket skill (the step where an attended session in a release epic
  commits) and the run skill's "Resuming after a halt" say in one sentence
  each that work on an epic branch outside any ticket reaches no status
  entry, no spend line and no reviewer, and point at the two repairs. README's
  board section shows the line. METHODOLOGY § "Why state is derived" gains the
  reason (the 18th unit of work).

**Not in scope.** Refusing or gating on unticketed commits — RETRO-4 surfaces
them where the human decides. Finding them after the release has merged (the
retro reads `git log` itself).

**Acceptance criteria.**
- In the suite's throwaway repository: a non-merge commit on the epic branch
  touching `src/` with no ID in its subject is reported and doctor warns; one
  subjected `<epic-name>: …` is reported with `epicLevel` and draws no warn;
  one subjected `X-1: …`, a merge commit, and a commit touching only `epics/`
  are not reported; an epic with no epic branch reports none and does not
  fail.
  CHECK: node --test --test-name-pattern 'unticketed' plugins/flow/scripts/tickets.test.mjs
  EXPECT: # pass 5
- `list --json` carries the array; `doctor` warns and still exits 0 on this
  repository.
  CHECK: test $(node plugins/flow/scripts/tickets.mjs list retro-lessons --json | grep -c '"unticketed"') -ge 1 && node plugins/flow/scripts/tickets.mjs doctor > /dev/null && echo unticketed-derived
  EXPECT: unticketed-derived
- demonstrate: on this repository before the release merges, `tickets.mjs
  list retro-lessons` → the line is absent while every commit carries an ID;
  record the output.
- Every suite in CLAUDE.md passes; counts updated there. Revert check named in
  **Verified**.

## RETRO-4 — The release body is built from the log, at either door

**Scope.**
- `scripts/tickets.mjs owed <epic> [--json]`: every outstanding owed item in
  the epic's status log, each with the entry that owes it — the list `brief`
  already computes per ticket, for the whole epic. Read-only, derived.
- The run skill's step 7 body gains two sections, each written **even when
  empty** ("none outstanding" / "none"): `## Owed`, pasted from
  `tickets.mjs owed <epic>`, and `## Unticketed commits`, from RETRO-3's list
  — a body that says "nothing owed" must be one a command printed.
- **The second door.** Step 7 runs only on `outcome: "completed"`, and every
  run in `redesign-city` halted, so an attended session opened the pull
  request with a body of its own and no addendum request. Two routes, each
  stated where that actor is — the ticket skill's step 10 (release epic, the
  last ticket integrated) and the run skill's "Resuming after a halt":
  **(a) re-running `/flow:run <epic>`** when step 1 admits the board — the
  driver half is true today (an empty `next` ends the loop `completed` with
  only the refresh proxy hired, `run-epic.mjs` ~1031) and this ticket pins it
  with a test; **(b) opening it by hand, following step 7 section for
  section**, when step 1 refuses — and it refuses exactly the board
  `redesign-city` ended on: an ABANDONED ticket reads `blocked`
  (`tickets.mjs` ~1436) until a human re-plans the document. Step 7 is
  therefore written so an attended session can execute it without a run
  result: each body section names the command or log passage it is read from,
  and the addendum request is part of the body, not of the run. A recovery
  that only works on a clean board is not a recovery (ground rule 3).
- `owed <epic>` is small: `parseOwed` is already epic-wide and `brief` already
  calls it (~2059).
- The ticket skill's line "The release pull request is opened by the driver"
  is corrected in the same commit (the run skill's session opens it). README
  and CHANGELOG follow.

**Not in scope.** A script that writes the whole body — the per-ticket
narrative is the session's. Any post-merge step. Opening, approving or
merging the pull request by an agent other than the run skill's `gh pr
create`.

**Acceptance criteria.**
- `owed <epic>` prints outstanding items with their entries, honours
  `**Resolves owed:**`, prints "none outstanding" and exits 0 when empty, and
  refuses an unknown epic by listing the known ones.
  CHECK: node --test --test-name-pattern 'owed command' plugins/flow/scripts/tickets.test.mjs
  EXPECT: # pass 4
- A run over an epic whose tickets are all integrated completes with no
  worker, reviewer or merge agent hired.
  The same run's result tells the session to open the release pull request
  (two tests: the agent sequence, and the result).
  CHECK: node --test --test-name-pattern 'nothing left to start' plugins/flow/workflows/run-epic.test.mjs
  EXPECT: # pass 2
- Both doors name the route.
  CHECK: test $(grep -c 'tickets.mjs" owed' plugins/flow/skills/run/SKILL.md) -ge 1 && test $(grep -c 're-running `/flow:run' plugins/flow/skills/ticket/SKILL.md) -ge 1 && test $(grep -c 'opening it by hand' plugins/flow/skills/ticket/SKILL.md) -ge 1 && echo both-doors
  EXPECT: both-doors
- Every suite in CLAUDE.md passes; counts updated there. Revert check named in
  **Verified**.

## RETRO-5 — Spend sums review rounds

**Scope.**
- `scripts/tickets.mjs` `parseSpend`: a figure may carry a round label —
  `round=<n>` opening a group of role pairs in an entry or a run-record group
  (`CITY-14 round=2 worker=804432 reviewer=324269`). Labelled rounds for a
  ticket and role are **summed**; within one round the last figure still wins,
  so a correction to a round is written as that round again. Unlabelled
  figures keep today's rule exactly. A ticket mixing labelled and unlabelled
  figures for one role: the labelled sum wins and doctor says so.
  **`RUN_GROUP` is used in three places and all three move together**: the
  group read (~1216), the `flat.replace(RUN_GROUP, ' ')` that separates an
  entry's own bare pairs from labelled groups (~1222), and
  `runRecordNearMisses` (~1275), whose only test for a parseable run record
  is that regex — move one and doctor calls every record in the new shape
  unparseable while `spend` reads it fine.
- One writer per round (Decision 5): the templates say where a round is
  labelled in each lane, and that the other document points.
- `doctor`: a `warn` when one ticket entry carries two or more **unlabelled**
  known figures for the same role and no line between them marks a correction
  (`Addendum — correction`, the shape corrections already take) — naming the
  figures, what `spend` currently counts, and the repair: a dated addendum
  restating them with `round=` labels, never an edit.
- Teach the shape where figures are written: the ticket skill's step 8
  addendum template (supervisor-observed figures per review round), the run
  skill's step 6 **Tokens** group (one group per ticket **per pass** when a
  ticket was reviewed more than once in a run), and the spend skill's
  description of what it sums. METHODOLOGY § "Why token figures are observed,
  never asked" gains the reason and CITY-14's numbers.

**Not in scope.** Time metering (its own epic, next). Estimating or reading
transcripts from the script. Rewriting weekendgoals' log — its repair is a
dated addendum there, in that repository.

**Acceptance criteria.**
- Four labelled rounds for one ticket sum per role; a repeated label
  overrides within its round; unlabelled repeats read exactly as before;
  `unknown` inside a round never erases a known figure.
  A run record whose groups carry `round=` is not a doctor near-miss.
  CHECK: node --test --test-name-pattern 'spend rounds' plugins/flow/scripts/tickets.test.mjs
  EXPECT: # pass 5
- Doctor warns on CITY-14's shape (four unlabelled pairs, no correction
  marker) and stays silent on a genuine dated correction.
  CHECK: node --test --test-name-pattern 'repeated figure' plugins/flow/scripts/tickets.test.mjs
  EXPECT: # pass 2
- The three documents teach `round=`.
  CHECK: test $(grep -c 'round=' plugins/flow/skills/ticket/SKILL.md) -ge 1 && test $(grep -c 'round=' plugins/flow/skills/run/SKILL.md) -ge 1 && test $(grep -c 'round=' plugins/flow/skills/spend/SKILL.md) -ge 1 && echo rounds-taught
  EXPECT: rounds-taught
- `doctor` exits 0 on this repository. Every suite in CLAUDE.md passes; counts
  updated there. Revert check named in **Verified**.

## RETRO-6 — A name-pattern CHECK that expects `# pass 1` is vacuous

**Scope.**
- Found planning this epic (see the ground rule): `node --test
  --test-name-pattern <p> <file>` prints `# pass 1` when the pattern matches
  nothing, so such a CHECK is green before its ticket exists and merges green
  whatever the worker builds — FND-2's vacuous CHECK in a new spelling.
- `scripts/tickets.mjs`: `checkShapeProblems` flags a command carrying
  `--test-name-pattern` whose EXPECT is `# pass 1` exactly, so `check` fails
  its gate as it does a malformed CHECK and `doctor` reports the near-miss —
  with the repair in the message: expect two or more, or grep the test's own
  title from the TAP output.
- `skills/epic/SKILL.md`, in the rule that every CHECK must fail before the
  ticket exists: the mechanism and the repair, one paragraph. METHODOLOGY §
  "Why acceptance criteria can be machine-runnable" gains the reason.
  CHANGELOG.

**Not in scope.** Other runners' vacuous shapes (jest, vitest, pytest) — add
one when a live epic meets it. Proving CHECKs red automatically at sign-off.

**Acceptance criteria.**
- A `--test-name-pattern` CHECK expecting `# pass 1` is flagged by doctor and
  fails `check`'s gate; `# pass 2`, `# pass 12` and a `# pass 1` with no name
  pattern are not flagged.
  CHECK: node --test --test-name-pattern 'vacuous pass count' plugins/flow/scripts/tickets.test.mjs
  EXPECT: # pass 3
- The epic skill names the shape.
  CHECK: test $(grep -c 'test-name-pattern' plugins/flow/skills/epic/SKILL.md) -ge 1 && echo shape-taught
  EXPECT: shape-taught
- `doctor` exits 0 on this repository (no existing epic carries the shape —
  checked at planning). Every suite in CLAUDE.md passes; counts updated
  there. Revert check named in **Verified**.

## RETRO-7 — Three lenses from the retro

**Scope.** Prose, each rule in the document that executes it and its reason
in METHODOLOGY, same commit:
- **A fixture that cannot produce the case** (retro Class A, 9 occurrences).
  `agents/ticket-reviewer.md`, `skills/review/SKILL.md` and both
  `REVIEWER_RULES` copies (`run-epic.mjs`, and the Codex review runner's,
  which its suite pins equal): a test whose fixture cannot reach the branch it
  names — twelve points on one line for an overlap loop, a warm cache
  answering for the code — is the test that executes code without checking
  it, and is Important when it is the sole evidence for a criterion. The
  reviewer asks of each such test: *what input would make this fail, and does
  the fixture contain it?* Where the project's instruction file says how to
  run the suite, deleting the behaviour and re-running is the decisive check
  — the ticket skill's revert check, applied by the judge.
- **A page epic schedules a human render-and-read ticket** (retro Q6).
  `skills/epic/SKILL.md`, beside the whole-page fidelity rule: the differ
  decides computed style; what it cannot decide is composition and behaviour —
  which items earn the slots, whether a control belongs where it sits — and
  every such difference in `redesign-city` was found by a human, by accident,
  after the last ticket. So an epic declaring `Design sources:` carries a
  **human-owned** ticket, after the whole-page fidelity ticket and before the
  release, whose criteria are the questions to answer with the page open.
  `agents/plan-reviewer.md` gains the lens (no such ticket → not ready);
  sign-off names it. `check-invariants.mjs` pins the phrase in both.
- **An instruction that relaxes a rule needs provenance you can check**
  (retro Class E). The ticket skill and the driver's worker prompt: an
  instruction relayed mid-ticket that loosens a criterion, a ground rule or a
  scope line is acted on only when it is readable where the plan lives — the
  signed-off document on the epic branch, fetched — and is otherwise recorded
  as a contradiction and halted on. It is the rule the driver already applies
  to itself (`--from origin/epic/<name>`), stated for the worker.

**Not in scope.** A mutation-testing tool or gate — the plugin runs no
project's tests except through CHECK. Changing COMPARE or the differ.
Weekendgoals' own instruction files.

**Acceptance criteria.**
- The reviewer lens is in all four places and the two `REVIEWER_RULES` copies
  stay equal.
  CHECK: node --test plugins/flow/scripts/runners/codex-review.test.mjs 2>&1 | grep -c '^# fail 0' && test $(grep -c 'does the fixture contain it' plugins/flow/agents/ticket-reviewer.md) -ge 1 && test $(grep -c 'does the fixture contain it' plugins/flow/workflows/run-epic.mjs) -ge 1 && echo lens-everywhere
  EXPECT: lens-everywhere
- The epic skill and the plan reviewer both carry the render-and-read rule,
  and the invariant checker holds them together.
  CHECK: node plugins/flow/scripts/check-invariants.mjs && test $(grep -c 'render-and-read' plugins/flow/skills/epic/SKILL.md) -ge 1 && test $(grep -c 'render-and-read' plugins/flow/agents/plan-reviewer.md) -ge 1 && echo read-pass-planned
  EXPECT: read-pass-planned
- The provenance rule is at both of the worker's doors.
  CHECK: test $(grep -c 'provenance' plugins/flow/skills/ticket/SKILL.md) -ge 1 && test $(grep -c 'provenance' plugins/flow/workflows/run-epic.mjs) -ge 1 && echo provenance-stated
  EXPECT: provenance-stated
- METHODOLOGY carries a reason for each of the three; CHANGELOG one entry.
  Every suite in CLAUDE.md passes; counts updated there. `revert check: n/a,
  prose-only` does **not** apply to the invariant-checker addition — name its
  test.
