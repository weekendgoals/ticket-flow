# Run-lane hardening epic — tickets

Source: the second batch from the retro of the first three live release
epics (weekendgoals, 2026-08-24 to 2026-09-14) and from the reviews inside
the first batch (`epics/run-lane-lessons/`). `context/` carries the three
fresh-context retro reports, the first batch's plan review and the scorecard
data verbatim; the status logs under `weekendgoals/epics/*/status.md` remain
the record. Planned 2026-09-14.

Outcome: The unattended lane's gates read what the script computes, and the
run's own bookkeeping stops halting the run. Today four defects sit in that
lane: the acceptance gate merges a malformed CHECK whose command exits 0
(found by RUN-2's reviewer); the fix-bounds exclusion line an epic can
declare never reached main (PR #42, merge `8ac3bef` on a stale base), so a
translation fan-out still trips the bounds and buys a re-review; the ticket
budget is read once at launch, so raising it mid-epic cannot reach the run
that tripped it (FND-1, 2026-09-13); and the run record and the ticket entry
both append to the same file tail, so every mid-ticket halt followed by a
hand merge conflicts on `status.md` (GHF-2, `a5d96449`). Three plan-side
gaps let the epics that hit them ship: a halted run record is not required
to carry a diagnosis, though both plugin fixes of August came from one; the
plan reviewer does not ask whether the declared delivery mode can execute a
ground rule (nine tickets rediscovered that it could not) or whether an
Outcome's evidence is collectable (two clauses of redesign-foundation's are
not); and METHODOLOGY says `--from` makes acceptance adversarially safe
when it secures the command string alone. Observable change: on the next
two release epics, zero halts or hand merges caused by a stale budget, a
log-tail conflict or a lost exclusion, and zero merges of a CHECK doctor
would have flagged; every halted run record carries a **Diagnosis**
paragraph. Evidence: the run records and the retro's Halts section
(observer: the retro miner). Reversal: if splitting run records into their
own file leaves the board, the ledger or the retro unable to read a run
that the single file could, HARD-4 is reverted and this epic's record says
so.

Areas in scope: `plugins/flow` (root `CLAUDE.md` binds all of it — the
driver `workflows/run-epic.mjs` and its suite, `scripts/tickets.mjs` and
its suite, `scripts/check-invariants.mjs`, the skills, the two reviewer
agents, README, METHODOLOGY, CHANGELOG).

Delivery: release — six tickets, one release pull request. Run **attended,
in this session, never by `/flow:run`**, for the reason the first batch
recorded: the plugin is not installed in the planning session, and four of
these tickets change the driver itself. Each ticket goes through
`/flow:ticket <ID>` in supervisor mode, merged into `epic/run-lane-hardening`
by verified SHA.

Environment probes, 2026-09-14: branch protection on `main` — 403 on both
probes (free plan), as recorded for the first batch; attended run, no
waiver relied on.

Consequence paths: plugins/flow/workflows/**, plugins/flow/scripts/tickets.mjs

Decisions at planning, 2026-09-14 (the plan review's questions, answered on
the planner's recommendation; sign-off may overturn any of them):
1. HARD-4 splits the files rather than configuring `merge=union` — the
   reason is in the ticket.
2. HARD-3 reads the budget at the verify step's `find --json`, the door the
   check walks through; a live re-read is wanted because a re-run after a
   halt is exactly the resume this epic exists to avoid.
3. A present→null budget mid-run keeps the last value and logs it; it
   never lifts the ceiling silently.
4. HARD-1 keeps the review anchor inside the fail-open fix.
5. HARD-4's wrong-file flag is date-scoped to records after the split.

Sign-off, 2026-09-14: Vadim: "Approve", after the plan review and with the
five planning decisions above standing. Release PR #45 (the first
batch) was still open, so `epic/run-lane-hardening` is cut from
`origin/epic/run-lane-lessons` — a deliberate stack, because HARD-1 and
HARD-2 build on RUN-1's driver; once #45 merges, the run loop's refresh
brings `origin/main` in and this epic's release pull request shows only
its own commits. Until then that pull request would carry the first
batch's commits too, and must not be merged before #45.

Worker model: opus

Status log: `epics/run-lane-hardening/status.md`. Run a ticket with `/flow:ticket <ID>`.

## Ground rules for every ticket in this epic

- A behaviour change to a skill, agent or script gets a `CHANGELOG.md` entry
  under `## Unreleased` in the same commit — installed projects update live.
- The driver's stop-condition strings (`STOP`) are quoted word for word by
  `skills/run/SKILL.md` step 5, and `scripts/check-invariants.mjs` `PHRASES`
  holds the ones it holds; a ticket that changes or adds one moves every
  copy in the same commit and adds its sentence to `PHRASES`.
- The driver cannot run a command or read a file itself: every fact it
  gates on arrives through an agent it spawns with a schema. A new fact
  means a schema field, a prompt sentence telling the proxy to report it
  verbatim, and a code check that refuses a missing or malformed value
  (doubt goes up, never down) — and a test that proves each branch.
- `node --check` rejects the workflow script; parse it the runtime's way
  (the command is in root `CLAUDE.md` under Syntax check).
- Doctrine stated in more than one document is one rule: grep the key
  phrase across `skills/`, `README.md`, `METHODOLOGY.md`, `CLAUDE.md` and
  the driver's own prose, and change every copy in the same commit.
- Every ticket's **Verified** line runs every suite named in root
  `CLAUDE.md` (all `# fail 0`, counts never shrink), the invariant checker,
  doctor, and the driver's parse. These are standing checks; a CHECK below
  names only what the ticket turns from red to green. A `# pass N`
  EXPECT on a `--test-name-pattern` is exact on purpose: the criterion
  names N cases, and extra coverage goes under another name. A count the
  planner could not predict uses `test $(grep -c …) -ge N && echo <word>`,
  which is red on a short count (exit 1, nothing printed) and green only
  when the word prints.

## Checks ledger at planning, 2026-09-14

Every CHECK below was run on the tree before any ticket existed
(`tickets.mjs check HARD-1` … `HARD-6`, epic branch of the first batch at
its release head): 0 of 14 passed, none malformed, none errored, none
skipped — each `grep -c` printed `0` and exited 1, each `--test-name-pattern`
printed `# pass 1` (the file wrapper; HARD-1's pattern also matches one
existing case), each `test … && echo` printed nothing. The fresh-context
plan reviewer re-ran all of them and confirmed the ledger.
- Reviewers report and never fix; nothing runs after a merge; no agent
  merges toward the default branch. None of these tickets touches those
  rules.

## Order

HARD-1 first: it is the one fail-open gate, and the review that found it
is fresh. HARD-2 re-lands a shipped-but-lost feature onto the driver HARD-1
just touched, so it goes before anything else moves the resolve step.
HARD-3 and HARD-4 are the two bookkeeping halts, cheapest to most invasive;
HARD-4 changes where a file lives and is last of the driver work so the
retro of this epic runs on the new shape. HARD-5 and HARD-6 are doctrine
and can follow in either order; HARD-6 last because its plan-reviewer
questions apply to the next epic, not this one.

## HARD-1 — The gates read what the script computes

**Scope.**
- Acceptance: `ACCEPT_SCHEMA` gains `allPassed` (boolean) and `problems`
  (integer count); the acceptance prompt tells the proxy to report the
  JSON's `allPassed` and the length of `problems` verbatim; the code gate
  at the merge (`passed !== total` today) becomes: halt on
  `STOP.acceptanceFailed` unless `allPassed === true`, and halt on it too
  when `problems > 0` even if every runnable check passed — a CHECK doctor
  would flag is a criterion nobody can satisfy, and the ledger's
  `allPassed` already says so. The prompt's sentence "exits 0 when every
  check passed and 1 when any failed" is corrected: exit 1 also means a
  malformed CHECK. The halt detail quotes the problem text the ledger
  carries.
- Review anchor: the driver reads the pushed branch's head in the same
  read-only proxy that lists the diff's files (tier-facts), before the
  reviewer is hired, and hands the reviewer a SHA range
  (`origin/<epic>...<sha>`) and the SHA as the anchor. `reviewedHead`
  becomes a driver fact recorded from that proxy; the reviewer's report of
  it is kept only as a cross-check, and the re-review packet no longer asks
  for a field `RE_REVIEW_SCHEMA` does not declare. This closes a gap no live
  run has hit yet (an unusable reviewer-reported head already routes to the
  consequence re-review); it lands here because it is the same review that
  must read the acceptance gate, and it is small. RUN-4's objection to a
  head SHA in gate prompts (the prefix cache) no longer applies: RUN-4
  forbade resuming by run id, so no prompt is ever replayed.
- The run skill's step 5 stop-condition prose and the run record template
  say the same; CHANGELOG entry.

**Not in scope.** Changing what `tickets.mjs check` computes (its
`allPassed` and `problems` already exist). The fix-bounds re-review (RUN-1).
The bounds exclusion (HARD-2).

**Acceptance criteria.**
- The driver suite gains cases named with the phrase "acceptance gate": a
  ticket whose ledger reports `passed === total` but `allPassed: false`
  halts; a ticket with `problems: 1` and every runnable check green halts
  with the problem quoted; a proxy report missing `allPassed` halts as a
  malformed report. And cases named "review anchor": the reviewer is
  spawned with a SHA range, and a reviewer report whose `reviewedHead`
  disagrees with the driver's anchor is logged as a cross-check mismatch
  and the driver's anchor wins.
  CHECK: node --test --test-name-pattern 'acceptance gate|review anchor' plugins/flow/workflows/run-epic.test.mjs
  EXPECT: # pass 6
  (one existing case already matches "acceptance gate"; five new cases make
  six — extra coverage goes under another name, so the count stays exact)
- The acceptance schema declares the field the gate reads.
  CHECK: test $(grep -c 'allPassed' plugins/flow/workflows/run-epic.mjs) -ge 3 && echo gate-reads-allPassed
  EXPECT: gate-reads-allPassed

## HARD-2 — The fix-bounds exclusion line reaches main

**Scope.**
- Re-land PR #42 (`ffc3a24`, "An epic may exempt mechanical fan-out files
  from the fix-bounds gate") onto the current driver: the `Fix bounds
  exclude: <glob>[, <glob>]` preamble line parsed by `tickets.mjs` (with
  doctor near-miss coverage, `list --json` and `find --json` exposure), the
  driver's `args.fixBoundsExclude` validated like `consequencePaths`, and
  the resolve step's two fix-diff commands excluding the globs the way they
  exclude `epics/`. Adapt to RUN-1: an excluded file never counts toward a
  trip, so a pure translation fan-out neither halts nor buys a re-review.
- The run skill's step 4 configuration table, the epic skill's preamble
  template, README's configuration table and CHANGELOG say so; the
  CHANGELOG entry records that the line first merged on 2026-08-27 into an
  already-merged base branch and never reached main.

**Not in scope.** A hardcoded exclusion for any project's i18n layout —
per-project path policy lives in the epic document, visible at sign-off,
like `Consequence paths:` (the decision PR #42 recorded). Changing
`FIX_LINE_BUDGET`.

**Acceptance criteria.**
- The parser and the driver both prove the line: tests named with the
  phrase "bounds exclude" — `tickets.test.mjs`: the line parses, a near-miss
  is flagged by doctor, `find --json` exposes it; `run-epic.test.mjs`: an
  excluded file's lines do not count toward a trip, and an unusable glob
  refuses the run.
  CHECK: node --test --test-name-pattern 'bounds exclude' plugins/flow/scripts/tickets.test.mjs
  EXPECT: # pass 2
  CHECK: node --test --test-name-pattern 'bounds exclude' plugins/flow/workflows/run-epic.test.mjs
  EXPECT: # pass 2
- Doctor names the line among the declarations it parses.
  CHECK: test $(grep -c 'Fix bounds exclude' plugins/flow/scripts/tickets.mjs) -ge 2 && echo line-parsed
  EXPECT: line-parsed

## HARD-3 — The ticket budget is re-read at every refresh

**Scope.**
- The budget is read at the door the check walks through: the verify step
  already runs `tickets.mjs find <ID> --json` after the merge's
  `git pull --ff-only`, and `find --json` already prints `ticketBudget`
  from the epic's document on the refreshed branch. `FIND_SCHEMA` gains
  that field, the verify prompt tells the proxy to report it verbatim, and
  the post-merge budget check reads the reported value for the ticket it
  just merged — which is the moment FND-1's raise (`3755c8df`, 17:55)
  would have governed its own check (merge 18:41, halt after it). The
  refresh step is the wrong door: it precedes the worker, so a raise
  during the ticket would still not reach the check.
- `args.ticketBudget` stays the launch-time value and is validated as
  today. A reported value that is present but not a positive integer halts
  as a malformed report. A reported `null` where a budget was in force
  **keeps the last value in force and logs it** — a line that stopped
  parsing (`**Ticket budget:** 600k` parses as null; the run never runs
  doctor) must not lift a ceiling silently. A budget that appears mid-run
  where no meter exists is refused the way launch refuses it: halt, naming
  the missing meter.
- The run skill's step 4 (the args block), the budget halt's detail text
  ("raise the epic's Ticket budget line" — now true within the same run,
  and stated as "re-read at every refresh" of the document, the merge's
  pull), the epic skill's `Ticket budget:` template line, README's
  configuration table and CHANGELOG say so.

**Not in scope.** Any other preamble line moving from args to refresh
(`Reviewer model:`, `Consequence paths:` stay launch-time; a plan reviewer
question if that should change). The meter itself.

**Acceptance criteria.**
- Driver cases named with the phrase "budget re-read": a budget raised on
  the epic branch during a ticket governs that ticket's own post-merge
  check; a verify report with a malformed budget halts; a reported `null`
  keeps the last value with a log line; a budget appearing with no meter
  halts naming the meter.
  CHECK: node --test --test-name-pattern 'budget re-read' plugins/flow/workflows/run-epic.test.mjs
  EXPECT: # pass 4
- The run skill states the new source of the ceiling.
  CHECK: test $(grep -c 're-read at every refresh' plugins/flow/skills/run/SKILL.md) -ge 1 && echo budget-live
  EXPECT: budget-live

## HARD-4 — Run records get their own file

**Scope.**
- Run records move from `epics/<name>/status.md` to `epics/<name>/runs.md`
  — a second append-only log, created by the first run record, with the
  same **Rules** block and its own preamble sentence naming what it holds.
  The ticket entries and their addenda stay in `status.md`, so the worker
  on a ticket branch and the session writing a run record on the epic
  branch never append to the same file tail again.
- `tickets.mjs`: `parseSpend` and `runRecordNearMisses` read run regions
  from `runs.md` when it exists and still from `status.md` (every existing
  log keeps its records where they are); `epics --json` and `find --json`
  expose `runsDoc`; doctor's run-heading and Tokens near-misses apply to
  both files; a `### Run —` heading found in `status.md` of an epic that
  also has `runs.md` is flagged as a record in the wrong file.
- The driver's own instruction moves with it: the two `next` strings in
  `run-epic.mjs` that tell the session where to append the run record
  (today "the epic's status.md") say `runs.md`; the run skill's step 6
  writes there; the retro skill's step 2 hands the miner `runsDoc` beside
  `statusDoc`, its step 3 reads both files and its seventh question names
  `runs.md`; the README's three-documents table gains the row (job: what
  the runs did; mutation rule: append-only); METHODOLOGY § "Why the run
  loop is code" carries the reason (two writers, one tail — GHF-2's
  reconcile merge `a5d96449`) and the alternative considered: a
  `merge=union` attribute on `epics/*/status.md` is one line, but it is
  per-project configuration a doctor probe can only nag about, and union
  also hides an overlapping edit (which append-only forbids) instead of
  surfacing it as a conflict.
- The wrong-file flag is date-scoped: a `### Run —` record in `status.md`
  dated on or after the first record in `runs.md` is flagged; records that
  predate the split (groundhopper-log carries six) are read where they are
  and never flagged, because migrating them is forbidden and a warning
  with no recovery is worse than none.

**Not in scope.** Migrating existing records out of `status.md` (append-only;
they stay and are still read). The board's derived states, which never read
run records.

**Acceptance criteria.**
- Parser and doctor tests named with the phrase "runs.md": spend reads a
  group from `runs.md`; a record left in `status.md` dated after the split
  is flagged and one dated before it is not; `find --json` exposes
  `runsDoc`.
  CHECK: node --test --test-name-pattern 'runs.md' plugins/flow/scripts/tickets.test.mjs
  EXPECT: # pass 3
- The driver tells the session the new place.
  CHECK: test $(grep -c 'runs.md' plugins/flow/workflows/run-epic.mjs) -ge 2 && echo driver-says-runs
  EXPECT: driver-says-runs
- The run skill writes there.
  CHECK: test $(grep -c 'runs.md' plugins/flow/skills/run/SKILL.md) -ge 2 && echo record-goes-to-runs
  EXPECT: record-goes-to-runs

## HARD-5 — A halted run explains itself, and the doctrine says what `--from` protects

**Scope.**
- The run skill's step 6 template requires, for a halted run, a
  **Diagnosis:** paragraph after **Halted on:** — what the driver's account
  says, what the human found on inspection, and whether the stop retired a
  real risk or fired on a green state — with the reason: the two plugin
  fixes of August (the addendum date lookup, the check runner's buffer)
  both came from a diagnosis the driver wrote voluntarily, and the retro's
  Halts question reads this paragraph first. The run record's field list
  and the retro skill's seventh question name it.
- METHODOLOGY § "Why acceptance criteria can be machine-runnable" states
  what `--from` secures — the CHECK's text — and what it does not: the
  script the command invokes (FND-5's worker created `test:it`), the spec
  file it runs, and the assertion inside it; naming HARD-1's gate and
  RUN-2's red-before rule as the two things that close part of that gap,
  and the human at the release gate as what closes the rest.
- METHODOLOGY § "Why the run loop is code, not prose" gains one sentence
  on the reviewer fallback: a general agent that shares the primary's
  failure mode (both hit the session limit in August) covers a crashed
  agent, not an exhausted environment, and halting there is correct
  because the one halt of that shape retired two Important findings.
- CHANGELOG entry.

**Not in scope.** Changing the driver's halt detail (its account is one
input to the diagnosis, not the diagnosis). Adding a `PHRASES` coupling for
prose that names no rule.

**Acceptance criteria.**
- The template carries the paragraph.
  CHECK: test $(grep -c '^\*\*Diagnosis:\*\*' plugins/flow/skills/run/SKILL.md) -ge 1 && echo diagnosis-required
  EXPECT: diagnosis-required
- METHODOLOGY states the limit.
  CHECK: test $(grep -c 'secures the command string' METHODOLOGY.md) -ge 1 && echo from-bounded
  EXPECT: from-bounded

## HARD-6 — The plan reviewer asks what the lane can do and what the evidence can show

**Scope.**
- `agents/plan-reviewer.md` gains two questions with their reasons. One:
  for every ground rule and every acceptance criterion, name the actor
  that will execute it in the declared delivery mode and confirm that
  actor can — an unattended worker spawns no agents, holds no phone, runs
  no interactive tool; a rule the lane cannot execute is a finding, and a
  criterion the lane cannot perform becomes its own ticket with a human
  owner, ordered before the release, never a line "owed to the release
  pull request" (groundhopper-log: nine tickets rediscovered the agent
  rule, ten deferred phone checks merged unperformed). Two: for every
  evidence clause in the Outcome, name what will produce it and check the
  observer can distinguish success from failure — an event two controls
  share, or a check wired into two of nine page types, is not collectable
  (redesign-foundation, both clauses).
- `skills/epic/SKILL.md` step 3's Outcome template and step 5's sign-off
  say the same in one clause each, and the epic skill's ground-rule bullet
  asks the planner to name the executing actor where a rule needs one.
- METHODOLOGY § "Why the plan is reviewed before sign-off" records the
  evidence; CHANGELOG entry.

**Not in scope.** Any change to the ticket reviewer. Automating either
question.

**Acceptance criteria.**
- The plan reviewer's definition carries both questions.
  CHECK: test $(grep -c 'collectable' plugins/flow/agents/plan-reviewer.md) -ge 1 && echo asks-collectable
  EXPECT: asks-collectable
  CHECK: test $(grep -c 'declared delivery mode' plugins/flow/agents/plan-reviewer.md) -ge 1 && echo asks-executable
  EXPECT: asks-executable
- demonstrate (actor: the supervisor-spawned worker, which may spawn one
  general agent for this — the ticket skill forbids it only a reviewer): a
  fresh plan reviewer given a draft whose ground rule mandates per-language
  agents under `Delivery: release` reports it as a finding → quote the
  finding in the status entry.
