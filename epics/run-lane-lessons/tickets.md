# Run-lane lessons epic — tickets

Source: the retro of the first three live release epics run with this plugin
(weekendgoals: groundhopper-foundation, groundhopper-log, redesign-foundation;
2026-08-24 to 2026-09-14), mined 2026-09-14 by three fresh-context miners
from their status logs, the driver's workflow run files and the agents'
transcripts, then plan-reviewed in fresh context. The scorecard that carries
the figures: https://claude.ai/code/artifact/e1f28378-4a5b-41ae-91cd-346a30404404
(a rendering; the status logs under `weekendgoals/epics/*/status.md` are the
record).

Outcome: An unattended run halts roughly once per two tickets — 12 halt events
across 23 tickets — and most halts are not about the work: 5 were the plugin
or environment (two of them session limits no plugin change can touch), 4
were policy trips (three fix-bounds halts, of which the two that got a
re-review found 0 Important and the third was waived; one token budget after
the merge), 2 caught a plan defect and 1 caught a code defect. Every halt
costs a human a resume, the recovery after a mid-ticket halt is written
nowhere, and the retro cannot see any of this because it never asks about
halts. The observable change: on the next two release epics, halt events
per ticket **excluding session limits and other environment failures** fall
below 0.25, and no halt is classified "policy trip, later shown clean".
Evidence: the run records and the retro's new Halts section (observer: the
retro miner, which reads the records it did not write). Reversal: if the
automatic bounds re-review of RUN-1 lets an Important defect reach a release
pull request — found by the human at the release gate, the one observer left
— the halt is restored and this epic's record says what it cost.

Areas in scope: `plugins/flow` (root `CLAUDE.md` binds all of it — the
workflow driver `workflows/run-epic.mjs` and its suite, the skills under
`skills/`, the reviewer agents, `scripts/tickets.mjs` and its suite,
`scripts/check-invariants.mjs`, `METHODOLOGY.md`, `README.md`,
`CHANGELOG.md`).

Delivery: release — five tickets, one release pull request, the human
decides twice. Run **attended, in this session, never by `/flow:run`**: the
plugin is not installed in the planning session (no `flow:*` agents or
skills are registered here), and RUN-1 changes the driver itself, so an
unattended run would execute the old driver to ship the new one. Each
ticket goes through `/flow:ticket <ID>` in supervisor mode — a fresh worker
implements from the documents, the supervisor hires the reviewer, and the
supervisor-spawned worker performs step 10's gate and merge into
`epic/run-lane-lessons` by verified SHA — the escape hatch the run skill
names, used deliberately for every ticket.

Environment probes, 2026-09-14: branch protection on `main` — 403 on both
probes (`branches/main/protection`, `rules/branches/main`; free plan). This
epic never runs unattended, so the hard floor an unattended run needs is not
relied on; no waiver is written, and one would be Vadim's to write if an
unattended run were ever wanted here.

Decisions at sign-off, 2026-09-14 (Vadim: "implement the first batch, then
the second one, use the flow methodology"; the plan review's questions
resolved on the planner's recommendations, stated at the gate):
1. RUN-2's rule stands — a whole-suite CHECK is a standing check, not a
   criterion; a CHECK is red before and green after.
2. PR #42's `Fix bounds exclude:` line is re-landed in the second batch, not
   retired by RUN-1.
3. The Outcome's halt figure excludes environment halts (session limits).
4. The status log's two-writers-one-tail conflict goes to the second batch.
5. RUN-4 is doctrine only; the driver does not change.
6. RUN-1 proceeds as drafted. The redesign-foundation retro's FND-6 case
   (a test-motivated out-of-bounds fix that a bounded re-review cleared and
   a later commit corrected) is recorded in RUN-1's METHODOLOGY paragraph
   as the reversal condition's first data point, not as a reason to keep
   the halt.
Review tiers: RUN-1 is priced `consequence` (the merge gate can fail open;
`opus`/`xhigh`); the others `normal`.

Worker model: opus

Status log: `epics/run-lane-lessons/status.md`. Run a ticket with `/flow:ticket <ID>`.

## Ground rules for every ticket in this epic

- A behaviour change to a skill, agent or script gets a `CHANGELOG.md` entry
  under `## Unreleased` in the same commit — installed projects update live.
- The run driver's stop-condition strings in `workflows/run-epic.mjs` (`STOP`)
  are quoted word for word by `skills/run/SKILL.md` step 5. Today
  `scripts/check-invariants.mjs` holds only two of them (`a failed acceptance
  CHECK`, `toward the default branch`); a ticket that changes a stop
  condition adds its sentence to the checker's `PHRASES` in the same commit,
  so the coupling it relies on actually exists.
- Doctrine stated in more than one document is one rule: grep the key phrase
  across `skills/`, `README.md`, `METHODOLOGY.md`, `CLAUDE.md` **and the
  driver's own prose** (`meta.phases`, schema descriptions, prompt text in
  `run-epic.mjs`) and change every copy in the same commit. The
  below-consequence re-review doctrine alone lives in `run/SKILL.md` (four
  places), `README.md:18`, `run-epic.mjs` `meta.phases` and the schema
  comment near `RE_REVIEW_SCHEMA`.
- Every ticket's **Verified** line runs every suite named in root
  `CLAUDE.md` (all `# fail 0`, pass counts never shrink), the invariant
  checker, doctor, and the runtime-style parse of `run-epic.mjs` (`node
  --check` rejects a workflow script; the command is under Syntax check).
  These are standing checks, not acceptance criteria — a CHECK below names
  only what the ticket turns from red to green.
- Reviewers report and never fix; nothing runs after a merge; no agent merges
  toward the default branch. None of these tickets touches those rules.

## Order

RUN-0 first: it is already built (the retro session made the ledger read the
run records before this epic existed) and every later ticket's fixture edits
sit on top of it. RUN-1 next: it retires the largest observed cost (three halts, two hand
re-reviews and one waiver, all on clean fixes) and rests on the one
assumption this epic makes — that an automatic consequence-tier re-review
catches what the halt was protecting against. Its acceptance criteria prove
the gate still halts when that re-review finds an Important defect. RUN-2
next: it removes the halt class a plan can prevent. RUN-4 writes down the
recovery every mid-ticket halt needed and nobody had. RUN-3 last, so the
next retro reads the effect of the first three.

## RUN-0 — The spend ledger reads the run records that exist

Implemented in the retro session on 2026-09-14, before this epic was
planned; recorded here so the release carries its record, and run
`--interactive` because the implementation context is this session's.

**Scope.**
- `scripts/tickets.mjs`: `RUN_HEADING` accepts a parenthesised qualifier
  after the date (six of the first three epics' fourteen run headings carry
  one); `parseSpend` reads a labelled `<ID> worker=<n> …` group from any
  region and attributes it to the ticket it names, keeps bare pairs and
  `Worker tokens:` phrases for the enclosing entry, and closes a region at
  every h2/h3; `doctor` warns on a `### Run` heading that will not parse and
  on a run record whose Tokens line carries figures but no group, both
  naming the repair (a dated addendum in the group shape, never an edit).
- Tests in `tickets.test.mjs`: the sigma fixture gains a prose run record
  repaired by addendum, an unrepaired one, a malformed run heading, and a
  group appended under the wrong entry; a doctor test pins both warnings.
- `skills/run/SKILL.md` step 6, `skills/doctor/SKILL.md`,
  `skills/spend/SKILL.md`, README and CHANGELOG say the same; root
  `CLAUDE.md`'s suite counts are refreshed.

**Not in scope.** Writing the addenda into the weekendgoals logs (that
repository's own quick lane, after its retro gate). Any CHECK-shape check
(RUN-2).

**Acceptance criteria.**
- The doctor test and the widened spend test pass; on `origin/main` the same
  command reports the test absent.
  CHECK: node --test --test-name-pattern 'run record' plugins/flow/scripts/tickets.test.mjs
  EXPECT: # pass 2
- Doctor on this repository exits 0 and, run in weekendgoals, flags eight
  run records and no false positives (demonstrate: quote the eight lines).

## RUN-1 — A fix-bounds trip buys a re-review, not a halt

**Scope.**
- In `workflows/run-epic.mjs`, when the resolve step finds the review-fix
  diff outside its bounds (files the review never saw, or more than
  `FIX_LINE_BUDGET` lines), spawn one bounded re-review at the consequence
  tier — the re-review the consequence tier already gets (`hireReviewer`,
  `RE_REVIEW_SCHEMA`, `phase: 'Re-review'`, label `re-review:<ID>`) — over
  the fix commits, instead of halting. Record `fixBoundsGated: true`,
  `fixBoundsTripped: true` and the re-review's counts on the ticket record.
- If that re-review reports an Important finding, halt on
  `STOP.importantFinding` exactly as the consequence tier's re-review does —
  one event, one stop string, so the retro's classifier reads one class.
  `STOP.fixBounds` stays for the one case that remains its own: the resolve
  step could not produce usable fix-diff facts (an unmeasurable fix is never
  merged).
- Before the bounds are measured, **files the review's own findings name
  are inside the bounds**: the resolve step already receives the findings'
  `file` fields, so the driver adds them to `reviewedFiles` in code.
  GHL-10's trip was on the two files its findings said were missing
  (`weekendgoals-ui-next/CLAUDE.md`, `LogNewClient.tsx`) — for the finding
  class "the deliverable named in scope was not produced", the fix is
  outside the reviewed diff by construction, and the halt was guaranteed.
- Every copy of the below-consequence doctrine changes in the same commit:
  `skills/run/SKILL.md` step 4's tier paragraph, step 5's stop-condition
  sentence, the step 6 run-record template (the new shape: "fixes outside
  the reviewed bounds — re-reviewed at the consequence tier: `<n>`
  Important"), `README.md`'s `/flow:run` row, and in `run-epic.mjs` the
  `meta.phases` entry for Re-review and the comment above `RE_REVIEW_SCHEMA`.
  `STOP.fixBounds`'s sentence joins `check-invariants.mjs`'s `PHRASES`.
- `METHODOLOGY.md` § "Why the re-review became a code gate below the
  consequence tier" gains the evidence and the reversal condition: three
  trips — GHL-1 (66 lines, 18 of them a translation fan-out; merged by hand
  under a standing rule, no re-review), GHL-9 (119 lines; re-review 41,368
  tokens, 0 Important), GHL-10 (two files outside, the ones its findings
  named; re-review 40,465 tokens, 0 Important) — and the sentence that the
  halt returns if a bounds re-review ever lets an Important defect through
  to a release pull request. It also records that the `Fix bounds exclude:`
  line of PR #42 never reached main (its merge commit `8ac3bef` sits only
  on `origin/addendum-gate-date`): this ticket supersedes it for the halt,
  and whether the exclusion also lands is sign-off question 2.

**Not in scope.** Changing `FIX_LINE_BUDGET` (the budget stays 60; the
evidence says the halt was the wrong response, not that the line was wrong).
The consequence tier's own re-review, which is unchanged. The token-budget
halt after a merge (FND-1) — it is informational by design and stays.
Re-landing PR #42's exclusion line (sign-off question 2; its own pull
request if wanted).

**Acceptance criteria.**
- `run-epic.test.mjs` gains four cases, each named with the phrase
  "bounds trip": a bounds trip whose re-review returns 0 Important merges
  and the record carries `fixBoundsTripped: true` with the counts; a bounds
  trip whose re-review returns 1 Important halts on `STOP.importantFinding`
  with the finding quoted; a resolve step with no usable fix facts still
  halts on `STOP.fixBounds`; a fix touching only a file the findings named
  is inside the bounds and merges without a re-review. The existing
  fix-bounds cases are updated, not deleted.
  CHECK: node --test --test-name-pattern 'bounds trip' plugins/flow/workflows/run-epic.test.mjs
  EXPECT: # pass 4
- `check-invariants.mjs` holds `STOP.fixBounds`'s sentence, and its suite
  proves a drift in that sentence fails.
  CHECK: grep -c 'fix-diff facts' plugins/flow/scripts/check-invariants.mjs
  EXPECT: 1
- The CHANGELOG entry names the three trips and their outcomes (none, 0, 0
  Important) as the evidence, and names PR #42's fate.

## RUN-2 — A CHECK criterion is proven to fail before its ticket is built

**Scope.**
- `skills/epic/SKILL.md` step 3 ("Rules that matter", the machine-runnable
  form): every CHECK the planner writes is run once, on the tree as it is
  before the ticket exists, with `node "${CLAUDE_PLUGIN_ROOT}/scripts/tickets.mjs" check <ID>`,
  and must **fail** there — a CHECK that passes before the work exists proves
  nothing (FND-2's `MobileSidebar` CHECK passed vacuously and merged that
  way). The same rule retires the decorative shape: a whole-suite run with
  `EXPECT: Tests:` passes on the pre-ticket tree too (six of
  groundhopper-foundation's eight CHECKs were this), so it is not a
  criterion — the suite stays a standing check under **Verified**, and a
  CHECK names the one test, assertion or fact the ticket turns green. The
  planner records the ledger in the draft (which CHECKs were proven failing;
  which could not run here and why, e.g. an interactive runner or a
  minutes-long suite) and the sign-off (step 5) shows it.
- `agents/plan-reviewer.md`: the reviewer verifies the planner's ledger by
  re-running each CHECK it marks runnable, under a per-command timeout of
  60 seconds, and skips the ones the planner marked unrunnable, saying so. A
  CHECK that passes on the current tree is a finding, and a CHECK whose
  command errors (an unrecognised flag, a quoting fault) is a finding —
  FND-6's `\|` reached grep as a literal and its `grep -rc` printed
  `file:0`, a shape no comparison against `1` can ever match.
- `scripts/tickets.mjs` doctor: two new near-miss shapes under the existing
  CHECK scan, each flagged with the sentence that says why it can never
  pass. One: `\\|` (an escaped backslash before a pipe) inside a CHECK
  line's quoted `node -e` or `sh -c` string — the shell or node consumes
  the escape and grep receives a literal `|`; three redesign-foundation
  CHECKs had it (FND-2, FND-4's `£` check, FND-6), quoted into the test
  fixture from that document's history, since the live copies were since
  repaired. Two: `grep` invoked with `-r` and `-c` together (any spelling,
  `-rc`, `-cr`, `-r -c`) — recursive counting prints `path:count` per file,
  never a bare number, whatever the CHECK compares it against. A single-file
  `grep -c path` printing a bare count is sound and is not flagged
  (GHF-1's `grep -c "Me and the log" api-gateway/CLAUDE.md` / `EXPECT: 1`
  passed live).

**Not in scope.** Running CHECKs from doctor (a CHECK may have side effects;
doctor stays read-only — the running is the planner's and the plan
reviewer's step). Repairing the weekendgoals CHECKs themselves (that epic's
own retro owns them). The unattended driver's re-run of CHECKs, unchanged.
Whether whole-suite CHECKs stay merge gates as well (sign-off question 1).

**Acceptance criteria.**
- Doctor flags both shapes, each test named with the phrase "CHECK shape",
  and says nothing about the sound single-file `grep -c` in the same
  fixture.
  CHECK: node --test --test-name-pattern 'CHECK shape' plugins/flow/scripts/tickets.test.mjs
  EXPECT: # pass 2
- The epic skill states the red-before rule where CHECKs are taught.
  CHECK: grep -c 'must fail on the tree before the ticket exists' plugins/flow/skills/epic/SKILL.md
  EXPECT: 1
- demonstrate: the plan reviewer, given a draft whose CHECK passes on the
  current tree, reports it as a finding → the agent definition's finding
  list names the case and the ticket's status entry quotes one such run.

## RUN-4 — After a halt: finish the ticket by hand, then re-run — never resume

**Scope.**
- `skills/run/SKILL.md` gains a section, `## Resuming after a halt`, that
  the step 1 refusal ("any ticket is `in-progress`, `in-review` or `done`")
  points at by name. It says, with the reason for each: a halt **before** a
  ticket wrote its status entry (a refresh failure, a reviewer spawn
  failure, a blocked worker) is resumed by re-running `/flow:run <epic>` —
  the board hands out only `todo` tickets, and `integrated` ones are skipped;
  a halt **mid-ticket** (branch pushed, DONE entry and addendum committed,
  unmerged — the shape of ten of the first three epics' twelve halts) is
  finished by hand first, with `/flow:ticket <ID>` (a supervisor-spawned
  worker performs step 10's gate and merge by verified SHA), and only then
  re-run; and **never `resumeFromRunId`**, because the Workflow runtime's
  prefix cache replays every unchanged `agent()` result up to the first
  edited call — a resume after a plugin fix replayed the recorded failure
  (groundhopper-foundation, 2026-08-25: "first resume replayed the stale
  failed acceptance from cache (0 tokens) and halted again"), and a resume
  after a pushed fix would re-run review and disposition live on a branch
  that already carries an addendum.
- The step 1 refusal names the recovery in its own sentence, so the
  refusal's advertised recovery is reachable from the refused state.
- `METHODOLOGY.md` § "Why the run loop is code, not prose" gains one
  paragraph: the run pins its date for cache stability, and that same
  stability is why a halted run is never resumed by id.

**Not in scope.** Any change to `run-epic.mjs` — the plan review showed a
head SHA in the gate prompts would not have prevented the cited replay
(the branch was unchanged; the plugin was what changed) and would interact
badly with the prefix cache. Retrying a failed gate inside the run (a
failed gate halts, as before).

**Acceptance criteria.**
- The run skill carries the section.
  CHECK: grep -c '^## Resuming after a halt' plugins/flow/skills/run/SKILL.md
  EXPECT: 1
- The refusal names it.
  CHECK: grep -c 'Resuming after a halt' plugins/flow/skills/run/SKILL.md
  EXPECT: 2
- The phrase "never `resumeFromRunId`" joins `check-invariants.mjs`'s
  `PHRASES`, required in the run skill and METHODOLOGY.
  CHECK: grep -c 'resumeFromRunId' plugins/flow/scripts/check-invariants.mjs
  EXPECT: 1

## RUN-3 — The retro asks what every halt bought

**Scope.**
- `skills/retro/SKILL.md` step 4 gains a seventh question — **What did the
  run halt on, and what did each halt buy?** — for every `### Run —` record:
  the halt condensed, its cause classified as work (a defect in the
  implementation), plan (a defective, vacuous or decorative CHECK, a wrong
  assumption in `tickets.md`), plugin/environment (the driver, a spawn
  failure, a session limit, a buffer, a tooling fault) or policy (a budget
  or bounds trip), what the human did to resume, and whether the later
  record shows the stop retired a real risk or fired on a clean state. A
  policy trip whose later re-review found nothing is a proposal against the
  policy, and a plugin halt is a candidate ticket for the plugin's own
  repository — both flagged as transferable.
- Step 5's proposals gain the corresponding line; the README's `/flow:retro`
  row names the seventh question; METHODOLOGY § "Why an epic ends with a
  retro" records why halts were invisible until now (the first three live
  epics: twelve halt events, none examined by any retro because none asked).

**Not in scope.** Changing what the run record carries (the classification is
the retro's reading, not the driver's claim). Automating the classification
in `tickets.mjs`.

**Acceptance criteria.**
- Step 4's question list has seven bold questions, the seventh naming the
  four classes.
  CHECK: awk '/^## 4\./,/^## 5\./' plugins/flow/skills/retro/SKILL.md | grep -c '^- \*\*'
  EXPECT: 7
- demonstrate: a retro miner given a status log with one halted run record
  returns a Halts section that classifies it → quote the section in the
  status entry.
