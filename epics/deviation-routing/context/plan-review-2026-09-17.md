# The two plan reviews — 2026-09-17

Recorded by the planning session from the fresh-context plan reviewer's two
reports (a general agent given `plugins/flow/agents/plan-reviewer.md` as its
definition, pinned to the strongest model, because `flow:plan-reviewer` was
not registered in the session). **Condensed, not verbatim**: the findings,
their evidence and the questions are kept; the reviewer's prose is not.

**Correction, made at the reviewer's own request.** An earlier version of
this record said the first review "split the work in two" and listed "two
epics or one of eight tickets?" as the reviewer's first question. It did
neither. The reviewer named ticket seams inside one epic and asked five
questions; the two-epic split was the planner's recommendation and Vadim's
decision, and that question was the planner's.

# First review — of the combined draft

The draft was one epic of six tickets, `FID-1`…`FID-6`. The planner verified
findings 1, 5 and 6 against the code before accepting them and had already
read the code behind 2, 3 and 4.

## Blocking

1. **`find --from` overloaded with two opposite trust directions** (confirmed).
   The draft had `find <ID> --json --from <ref>` read the status log, and the
   driver call it with the pushed ticket branch. But `find --from` is
   documented as reading declarations only (`scripts/tickets.mjs:1215-1222`),
   and the resolve step already runs it with `origin/<epicBranch>` to read
   `ticketBudget` from the signed-off document (`workflows/run-epic.mjs:1843`).
   One low-effort proxy would then hold two JSONs with identical field names:
   swap them and the deviation gate fails open (`[]` from the epic ref, where
   the entry is not yet), or the reviewed branch sets its own budget ceiling —
   exactly what that read exists to prevent. The ticket branch is the right
   place to read the entry; the flag is the collision.
2. **The advertised recovery "or has the deviation fixed" cannot clear the
   gate, and per-entry acceptance closes deviations nobody decided**
   (confirmed). The log is append-only, so a fixed deviation's paragraph
   still parses, and nothing but the accepting line closed it. With two
   deviations, accepting one closes the other unfixed; withholding the line
   until the fix lands records a fix as an acceptance.
3. **The design map is the root of two requirements and two evidence
   clauses, and nothing guarded who writes `removed` or whether the map is
   complete** (plausible). The map's `page` selectors are written before the
   page exists, so workers edit the file — which also holds `removed`. CHECK
   criteria are protected from the reviewed party by `--from`; the map had no
   equivalent. The source epic's worker, reading a ground rule in good faith
   as sanctioning a missing element, could add a `removed` entry: the diff
   prints "removed by", exits 0, no deviation line exists, nothing halts —
   the founding failure routed through the new machinery. No reviewer lens
   covered a `removed` entry in the ticket's own diff, and no plan-review lens
   covered "the design draws something no landmark covers".
4. **Sizing** (plausible). The draft's FID-3 (declaration + criterion) was
   plainly past ~400 changed lines by this repository's own history: the
   original CHECK/EXPECT commit `af74dfd` was 674 lines, about 440 outside the
   driver; one preamble line re-landed in `5ce0820` cost about 130. Seam: the
   declaration (all the plan side and the reviewer side need) versus the
   criterion. The draft's FID-4 was borderline by analogy with `5944ac6` (one
   resolve-step fact and gate, 216 lines). Seam: the driver's gates versus
   the attended doors, which depend only on the deviation parser.

## Nits, all confirmed

5. `grabPathList` keeps each comma segment's first whitespace-delimited word
   (`tickets.mjs:152`), so a design path with a space is truncated.
6. The draft said compare rows "never count toward `passed`" and was silent
   on `total`; the driver halts when `passed !== total`
   (`run-epic.mjs:1750`, `tickets.mjs:1333`), so every `COMPARE` ticket would
   halt.
7. PR #50 collided with far more than the four reviewer copies the draft
   named — the verify steps, the Verified template, step 8, the invariant
   phrases and CLAUDE.md's pass counts.
8. Evidence clause (b), "deviation lines recorded equals deviations
   surfaced", compares one parser's output with itself and cannot fail; the
   real miss is a deviation written somewhere else, as the source epic's was.
   Clause (a)'s datum had no named home.
9. FID-5's "reviewers report and never fix" check does not cover
   `plan-reviewer.md` (not in the checker's `FILES`); FID-4's fourth CHECK
   could be turned green by FID-2's own text. Smaller: a CHECK that grepped
   one skill for a criterion naming two; the acceptance-check sentence lives
   in five files, not three; the attended lanes had no door for a missing
   comparison.

## Checked and sound

All 19 CHECKs re-run and failing, as the ledger recorded; `doctor` exit 0;
the format/gate split sound against the gate at `run-epic.mjs:1741-1770` on
two conditions (both reach main in one release pull request; compare rows
stay out of `total`); the pushed ticket branch is where the entry lives at
the resolve step; halt recovery already passes through ticket step 10; every
criterion executable by a shell-only attended worker; all six requirements
reached.

## Questions for sign-off, and Vadim's answers (2026-09-17)

He accepted the planner's recommendation on every one. The first is the
planner's own question, put beside the reviewer's five because the
reviewer's sizing seams took the draft to eight tickets.

1. (planner's) Two epics or one of eight tickets? — **Two.**
2. Accept the departure from "a format change moves the parser, the skills
   and the driver in the same commit"? — **Yes**, on the reviewer's two
   conditions, with the invariant amended to name `COMPARE`.
3. Does "no proof run against any one project" rule out a project-agnostic
   smoke test on the plugin's own static fixtures? — **No; allow it.**
4. PR #50 before the first ticket? — **Merged** the same day (`b96da41`).
5. Closure per entry, or numbered deviations? — **Per entry**, one line
   naming each deviation as accepted or as fixed.
6. Is a halt at the resolve step, after the review is paid for, intended? —
   **Yes**: recovery passes through ticket step 10, which needs the review on
   the record.

# Second review — of the two rewritten documents

Same reviewer, resumed with its context, told to judge the current text on
its own terms. It was cut off once by a session rate limit before reporting
and resumed; the report below is the completed one. The planner checked the
run skill's refusal of an epic holding an in-progress ticket before
accepting finding 1.

## Blocking

1. **The closing line can be written by the gated party on the ref the gate
   reads, and in the unattended lane nobody else can have written it**
   (plausible). DEV-1 had `**Deviations closed:**` close an entry's
   deviations from any entry or addendum, and had the ticket skill's step 6
   — the worker's step — teach it; DEV-3 listed "a closed deviation passing"
   among its tests. But the driver only gates a ticket it started in the
   same pass: it takes `todo` tickets only and refuses an epic holding an
   in-progress, in-review or done ticket (`skills/run/SKILL.md:45-49`), and
   a halted ticket is finished by hand through step 10 and never re-gated
   (`:716-727`). So a closing line on `origin/<branch>` at resolve time was
   written by the worker or the disposition agent — the only case that test
   branch could be. "Accepted" and "fixed" are unparsed prose, so the gate
   could not tell a benign fix-closure from an agent accepting its own
   deviation; DEV-2's step 9 showed only **unclosed** deviations, so a
   self-closed one was shown to nobody; and neither Outcome clause would
   register it. `design-fidelity`'s Decision 3 had fixed this same shape for
   `removed`, and left it open here.

## Nits

2. CHECK-ledger defects a run cannot see. Confirmed: FID-4's fourth CHECK
   grepped `no \*\*Compared:\*\* field`, which matches only if the worker
   writes the field name without the backticks the skill's convention puts
   on it. Plausible: DEV-2's second and third CHECKs grepped "unclosed
   deviation", which DEV-1's own text ("that ticket's own unclosed
   deviations") could turn green; FID-5's fifth grepped "a fourth artifact"
   in METHODOLOGY, which FID-1 to FID-4's same-commit reasoning could write
   first.
3. `--removed-from` has a bootstrap hole on the first ticket of an
   **incremental** epic: its base is the default branch, and the epic's
   documents land in that ticket's own pull request, so `origin/<default>`
   has no map. It fails closed (every removal prints `missing`), but the
   verify step stated no fallback. In release delivery the map is on
   `origin/epic/<name>` before any ticket (`skills/epic/SKILL.md:366-373`).
4. FID-4's gate could be skipped on a missing fact: `ACCEPT_SCHEMA` has no
   `compares` field today (`run-epic.mjs:524-558`), and the test list did
   not cover a report whose `compares` is missing or mistyped — read as "no
   COMPARE", that skips the gate, against the file's own rule that a fact is
   refused when missing or the wrong type (`:1738-1740`). And
   `run-epic.test.mjs` stubs every agent, so no test would execute a `grep`
   written into the FACT 1 read; a mis-escaped `\*\*` would first show as a
   count of 0 on a live run.
5. Two things a human can write that the parser would read wrongly. Closure
   on `parseOwed`'s pattern is blind to order, and an ID can head more than
   one entry, so a deviation recorded after a closing line for its ID would
   be born closed. And doctor's near-miss list lacked the singular
   `**Deviation closed:**`, the likeliest slip.
6. Evidence clause (a) in both Outcomes reads zero when nobody records
   anything: no ticket put the prompt where the human will be, and the two
   epics are in an installed project that will not contain this plan.
   Smaller: FID-4's attended recovery, "accept it as owed in so many words",
   left no written record.

## Checked and sound

All 36 CHECKs re-run and failing, none malformed; `doctor` exit 0. The
`deviations` subcommand removes the proxy-swap risk by construction — its
JSON has no `ticketBudget`, `find` has no `deviations` key, and an
unreadable ref already routes to a halt through the resolve step's
`command-failed` outcome. First-review finding 3 is closed. DEV-1 and FID-3
sit at the ~400 line rather than past it; the other six are under. No DEV
text greens an FID CHECK. Every requirement is reached; every criterion is
executable by the declared actor.

## What the planner changed

Every finding was accepted. Decision 5 of `deviation-routing`: only a human
closes a deviation, the unattended gate counts deviations regardless of
closure, the attended doors honour the line and show closed deviations with
their closing line. Closure applies only to deviations above the line.
Doctor gains the singular near-miss. The three greenable CHECK phrases are
replaced and reserved to their tickets; FID-4's uses a phrase with no
Markdown in it. The verify step falls back to `origin/epic/<name>`. FID-4's
count becomes a tested `compared` subcommand, and a missing or mistyped
fact halts. DEV-3 adds the retro question and the release pull request
prompt that both Outcomes read, with "none found" written explicitly. The
owed recovery leaves a `**Compared:** owed — …` line.

## Questions for sign-off

1. **Who may write `**Deviations closed:**`, and does an unattended run
   honour one at all?** The planner's recommendation is Decision 5 above;
   it is the human's to confirm or overturn.
2. **FID-1's size** — 550 to 700 changed lines by the reviewer's estimate,
   the largest ticket in either epic, against 319 to 463 for earlier new
   scripts with their suites (`132ec81`, `f0f4fcb`, `4b243fe`). One new
   file, off the consequence paths, inflated by generated fixtures, not
   blocked on; the seam, if review balks, is `extract` with the HTML
   fixtures and the smoke test, then `diff` with the JSON contract. Accept
   it as one ticket?

**Vadim's answers at sign-off, 2026-09-17:** both of the planner's
recommendations accepted — only a human writes `**Deviations closed:**` and
the unattended gate honours none; FID-1 stays one ticket, told to stop and
split on the named seam if its diff without fixtures passes ~450 lines. Both
epics approved as written.
