# Run-lane lessons epic — status log

Append-only record of finished tickets. Tickets: `epics/run-lane-lessons/tickets.md`.

**Rules.** Append only. Corrections are new dated addenda beneath the entry they
correct, never edits. Report counts, not adjectives. The **Owed** line is
required even when empty.

## Baseline — 2026-09-14

Plugin at `a4f9e3b` (main). Suites: tickets 56/56, session guard 14/14,
check-invariants 11/11, board 9/9, plan-page 8/8, run-epic 91/91, codex
runner 8/8; `check-invariants.mjs` and `tickets.mjs doctor` exit 0. The run
driver halts on a fix-bounds trip (`FIX_LINE_BUDGET` 60, `STOP.fixBounds`),
the acceptance step re-runs CHECKs from the signed-off document with no rule
that a CHECK be red before its ticket, the run skill's step 1 refuses a
`done` ticket without naming a recovery, and the retro asks six questions,
none about halts. Evidence: the three weekendgoals release epics (23
tickets, 14 run records, 12 halt events: 5 plugin/environment, 4 policy, 2
plan, 1 code), their three fresh-context retro reports, and the scorecard at
https://claude.ai/code/artifact/e1f28378-4a5b-41ae-91cd-346a30404404. Known
risk: RUN-1 rests on three re-reviews that found nothing; the FND-6 case
cuts the other way and is the reversal's first data point.

### RUN-0 — The spend ledger reads the run records that exist — 2026-09-14 — DONE

**Built:** `tickets.mjs` reads a run heading with a parenthesised qualifier,
reads a labelled `<ID> worker=<n> …` group from any region of the log, closes
a parse region at every h2/h3, and `doctor` warns on a run heading that will
not parse and on a run record whose Tokens line carries figures but no group,
each warning naming the addendum repair. The run, doctor and spend skills,
README, CHANGELOG and root `CLAUDE.md`'s suite counts say the same.

**Mode:** interactive — in-session (the implementation predates the epic; see
the ticket's own note)

**Tokens:** unknown

**Verified:** `node --test` — tickets 56/56, session guard 14/14,
check-invariants 11/11, board 9/9, plan-page 8/8, run-epic 91/91, codex 8/8;
`check-invariants.mjs` exit 0; `tickets.mjs doctor` exit 0 on this repository;
the runtime-style parse of `run-epic.mjs` prints `parses`; `tickets.mjs check
RUN-0` 1/1 (`--test-name-pattern 'run record'` → `# pass 2`; with the
`origin/main` test file it prints `# pass 1`, so the CHECK is red before the
work). Doctor run in weekendgoals flags 14 run records (see Decisions) and
nothing else new; the drafted FND addendum, appended to a copy of that log,
made `spend redesign-foundation` report all six tickets, then the copy was
restored.

**Decisions:** the ticket's demonstrate criterion says doctor flags "eight"
run records in weekendgoals; it flags fourteen, because the relaxed heading
makes the six qualifier-bearing records parse and every one of the fourteen
carries prose figures — the number in the criterion predates the heading
change made in the same ticket, and there is no false positive (each flagged
line is a `**Tokens:**` line with figures and no group). Recorded rather than
edited: the ticket document is signed off.

**Owed:** Nothing.

**Addendum — review — 2026-09-14 — sonnet/high:** Two Important findings,
both fixed in `9910b42`: (1) doctor's new run-heading near-miss flagged any
ticket entry whose ID starts with "Run" — this epic's own `### RUN-0` heading
— because the check tested `RUN_HEADING` without first excluding
`STATUS_HEADING`; (2) `hasFigure` scanned the whole run record after
`**Tokens:**`, so a record whose Tokens paragraph said `unknown` was flagged
when a later sentence mentioned a token count; it now reads only the Tokens
paragraph (the line and its continuation lines up to a blank line or the
next bold label) and ignores digits inside a date. One nit, taken with the
second fix: the figure regex now accepts two-digit figures. Fixture and
doctor test extended for both cases; tickets 56/56; doctor prints no
warning for this repository and still flags exactly the 14 prose run
records in weekendgoals. Bounded re-review of the fix commit: 0 Important,
nothing from the first review unaddressed, reviewed head `9910b42`. Nothing
deferred. Worker tokens (implementation leg): unknown; Reviewer tokens:
252,343 (harness totals: first review 119,684, re-review 132,659).

### RUN-1 — A fix-bounds trip buys a re-review, not a halt — 2026-09-14 — DONE

**Built:** In `workflows/run-epic.mjs` the fix-bounds gate no longer halts the
run: a fix diff that leaves its bounds now buys the bounded re-review the
consequence tier already gets (same `hireReviewer`, `RE_REVIEW_SCHEMA`,
`re-review:<ID>` label, priced at the consequence tier), merges on a clean
one, and halts on `STOP.importantFinding` — one stop string for both doors —
while `STOP.fixBounds` narrows to the fix nothing could measure. Files the
review's own findings name are added to `reviewedFiles` in code before the
bounds are measured, and the record carries `fixBoundsTripped`. Every copy of
the below-consequence doctrine moved with it (`skills/run/SKILL.md` steps 4,
5, 6 and 7, `README.md`, the driver's `meta.phases` and `RE_REVIEW_SCHEMA`
comment), `check-invariants.mjs` now holds the fix-bounds sentence, and
METHODOLOGY records the three trips, the reversal condition and PR #42's
fate.

**Mode:** autonomous — supervisor-spawned worker worker:RUN-1 (opus)

**Tokens:** observed by the supervisor — see the review addendum

**Verified:** `node --test` — tickets 56/56, session guard 14/14,
check-invariants 12/12, board 9/9, plan-page 8/8, run-epic 92/92, codex 8/8,
every suite `# fail 0`; `check-invariants.mjs` exit 0; `tickets.mjs doctor`
exit 0 on this repository; `node --check plugins/flow/scripts/tickets.mjs`
clean and the runtime-style parse of `run-epic.mjs` exits 0; `tickets.mjs
check RUN-1` 2/2 (`--test-name-pattern 'bounds trip'` → `# pass 4`; `grep -c
'fix-diff facts' check-invariants.mjs` → 1). Both CHECKs are red before the
work: in a worktree at the base commit `8e1f17d`, `tickets.mjs check RUN-1`
reports 0/2 — no test name matched `bounds trip` (the runner printed only the
file wrapper, `# pass 1`) and the grep printed 0. run-epic went 91 → 92 (three fix-bounds cases consolidated into four
`bounds trip` cases), check-invariants 11 → 12; root `CLAUDE.md`'s counts are
refreshed to match.

**Decisions:** (1) A numstat that prints `-` (a binary file, `fixLines: -1`)
stays a `STOP.fixBounds` halt rather than becoming a trip — the scope keeps
that condition for the unmeasurable fix, and a bounded re-review of a diff
nothing measured proves nothing. Over-budget and outside-files trips are the
two shapes that now buy the pass. (2) The three existing fix-bounds test
cases were consolidated into the four `bounds trip` cases rather than left
beside them: `--test-name-pattern 'bounds trip'` must print exactly `# pass
4`, and a fifth matching name would break the criterion. Every assertion they
carried survives inside the new cases (the outside file quoted and fenced,
`61 lines against a budget of 60`, `no usable fix-diff facts`,
`unmeasurable`, nothing merged). (3) The trip's re-review is priced with
`priceReview('consequence', 'consequence')`, so an epic's `Reviewer model:`
line still overrides the model exactly as it does for every other review.
(4) PR #42's `Fix bounds exclude:` line is recorded in METHODOLOGY as
unlanded and superseded for the halt, not re-landed here — sign-off decision
2 gives it to the second batch.

**Owed:** Nothing.

**Addendum — review — 2026-09-14 — opus/xhigh:** 0 Important, 4 nits, no
pre-existing findings owned by this ticket; reviewed head `baf3d70`. Three
nits fixed in `4af5cd8`. (1) The trip case asserted only that the log line
carried the agent-reported path, so deleting the `fence(` call left the
suite green — it now asserts the `<<<UNTRUSTED … UNTRUSTED>>>` markers
around the path, and removing `fence(` fails that case (checked by
deleting it, running, and restoring). (2) `meta.phases` and the run skill's
step 4 listed Re-review before Acceptance and Resolve, while the pass a
trip buys runs after the resolve step's bounds check and just before the
merge; both now say so, so a record halted in `Re-review` with
`fixBoundsTripped` is not read as one whose acceptance checks never ran.
(3) The `PHRASES` entry pinned only the stop condition's first clause; it
now pins the sentence whole, and the suite case mutates the tail clause
("an unmeasurable fix is never merged") as well as the opening. Nit 4 — one
120-character line in this entry's Verified paragraph — is recorded, not
fixed: the log is append-only and rewrapping it would edit an entry. Two
pre-existing defects in the driver, neither this ticket's and both for
`retro`: the re-review packet asks for `reviewedHead` though
`RE_REVIEW_SCHEMA` declares no such property, and the reviewer's commit
range is a branch-name range while the merge is pinned to `resolvedHead`.
Re-ran after the fixes: check-invariants 12/12, run-epic 92/92, tickets
56/56, session guard 14/14, board 9/9, plan-page 8/8, codex 8/8, all `# fail
0`; `check-invariants.mjs` exit 0, `doctor` exit 0, the runtime-style parse
of `run-epic.mjs` exit 0, `tickets.mjs check RUN-1` 2/2. Nothing deferred.
Worker tokens (implementation leg): 220,318; Reviewer tokens: 165,091.
