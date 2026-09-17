# Deviation routing epic — status log

Append-only record of finished tickets. Tickets: `epics/deviation-routing/tickets.md`.

**Rules.** Append only. Corrections are new dated addenda beneath the entry they
correct, never edits. Report counts, not adjectives. The **Owed** line is
required even when empty.

## Baseline — 2026-09-17

**What exists today.** A status entry's `**Decisions:**` field is where the
ticket skill tells a worker to record "judgment calls and deviations from
the documents, each with the why", and no command reads it: the string
`Decisions` appears nowhere in `scripts/tickets.mjs` or
`workflows/run-epic.mjs`. `parseOwed` (`tickets.mjs:426`) is the only parser
of an entry's body, and `brief` carries owed items and nothing else into
later tickets (`:1271`). The run driver has no stop condition for a
deviation; the ticket skill's steps 9 and 10 and the quick skill's step 7
do not mention one.

**What is verified, and how.** On `origin/main` at `b96da41` (after PR #50,
the revert check), 2026-09-17: `tickets.test.mjs` 68/68,
`ticket-session-guard.test.mjs` 14/14, `check-invariants.test.mjs` 17/17,
`board.test.mjs` 9/9, `plan-page.test.mjs` 8/8, `run-epic.test.mjs`
120/120, `codex.test.mjs` 21/21, `codex-review.test.mjs` 19/19;
`check-invariants.mjs` exit 0; `tickets.mjs doctor` exit 0. The plan's 13
CHECKs (DEV-1 5, DEV-2 3, DEV-3 5) were each run with `tickets.mjs check`
and each fails on this tree, re-run with the same result by the second plan
review.

**Known risks.** DEV-1's parser must refuse Decisions prose that merely
uses the word "deviation"; if it cannot, the epic stops at ticket one and
the line's shape is redesigned. The unattended gate honours no closing
line, so it halts on a deviation an agent has already fixed — a clean-state
halt by design, and the thing the Outcome's reversal clause measures.
Branch protection on `main` answers 404 "Branch not protected"; the epic
runs attended and relies on no waiver.

**What this epic starts from.** `context/findings.md` (the evidence) and
`context/plan-review-2026-09-17.md` (two fresh-context plan reviews, five
blocking findings between them, all accepted). Signed off by Vadim
2026-09-17 with both of the planner's recommendations: only a human writes
`**Deviations closed:**`, and the unattended gate honours none. Run attended
through `/flow:ticket <ID>` in supervisor mode — the plugin is not installed
in the planning session, and DEV-3 changes the driver. `epics/design-fidelity/`
waits on this epic reaching `main`.

**Addendum — 2026-09-17 — delivery re-planned after sign-off.** The baseline
above says this epic runs attended. Vadim re-planned it the same day ("do
all unattended"): it runs by `/flow:run deviation-routing`. `main` is
unprotected (404 from the protection probe, `[]` from the rulesets probe;
the repository is public, so protection is available and not enabled), and
Vadim waived the hard floor in so many words — "i waive the protection".
`tickets.md` carries the decision on its `Delivery:` and probes paragraphs,
which is where the run skill's step 3 reads it.

### DEV-1 — A deviation is parsed and surfaced — 2026-09-17 — DONE

**Built:** a status entry's optional `**Deviation:**` line is now parsed,
carried and readable. `tickets.mjs` gained `parseDeviationsText`/
`parseDeviations` beside `parseOwed`, a `deviations <ID> [--log-from <ref>]
[--json]` subcommand that reports every deviation a ticket's own entries
recorded — closed or not, each with its closing line — a `deviations` section
and payload field on `brief` carrying the epic's open ones, and six `doctor`
near-misses for deviation lines that would silently not parse. The ticket and
quick skills teach the line and name `**Deviations closed:**` as the human's,
never an agent's; README accounts for both lines and the subcommand;
`check-invariants.mjs` holds the label across the two skills, the script and
README. Nothing stops yet.

**Mode:** autonomous — driver-spawned worker worker:DEV-1

**Tokens:** recorded in the run record

**Verified:** `tickets.mjs check DEV-1` 5/5 passed, exit 0 (all five CHECKs
failed on the baseline tree). Suites, all on this branch:
`tickets.test.mjs` 74/74 (was 68 — six new tests), `check-invariants.test.mjs`
18/18 (was 17 — one new), `ticket-session-guard.test.mjs` 14/14,
`board.test.mjs` 9/9, `plan-page.test.mjs` 8/8, `run-epic.test.mjs` 120/120,
`runners/codex.test.mjs` 21/21, `runners/codex-review.test.mjs` 19/19;
`check-invariants.mjs` exit 0; `tickets.mjs doctor` exit 0;
`node --check plugins/flow/scripts/tickets.mjs` exit 0; the run driver parsed
with CLAUDE.md's `node -e` command, exit 0 (unchanged by this ticket).
demonstrate, in a throwaway git repo with a `throwaway` epic, outputs read and
recorded: an entry with two `**Deviation:**` paragraphs → `brief TW-2` printed
both under "Deviations — recorded, not yet closed by a human" and
`deviations TW-1 --json` reported `count 2, open 2`, both `closed: false`;
appending a dated `**Deviations closed:** TW-1 — …` addendum → `brief` printed
"none outstanding" and the subcommand reported `count 2, open 0`, both
`closed: true` carrying the closing line's text verbatim in `closedBy`; a
third `**Deviation:**` under a second `### TW-1 — … — 2026-09-19 — DONE`
heading beneath that line → `count 3, open 1`, the 09-19 one alone open and
alone in the brief. `deviations TW-1 --log-from tw-1-pushed --json` read the
branch ref (`logPath` relative, `logFrom` set); `--log-from origin/nope`
printed `cannot read epics/throwaway/status.md from ref "origin/nope" … An
unreadable status log is not "no deviations"` and exited 1 with no payload.
revert check: reverted this ticket's two commits with `git revert --no-commit
$(git rev-list --no-merges a4a26fa..HEAD)`, kept both test files at HEAD, ran
— `tickets.test.mjs` went red 7/74, headline failure **"deviations reports
every one a ticket recorded, with its closure and the closing line"**, and
`check-invariants.test.mjs` red 1/18 on **"a lane that stops teaching the
deviation closing line fails"**; `git revert --abort` restored the tree to
HEAD exactly. Each new guard was then flipped in turn and the suite confirmed
red for each: closing only above the line in the file (red on 2 tests),
closing by the leading ID list only (2), the unreadable-ref exit (1), the
absent-log exit (1), `brief` filtering closed deviations (1), `deviations`
filtering to the ticket's own entries (2), `--log-from` reading the ref rather
than the checkout (1), and doctor's near-miss scan being entry-scoped (1).

**Decisions:** three judgment calls the documents left open. (1) The absent
working-tree status log is refused by the subcommand, not answered with an
empty list: the scope line's rule — "a ref or file that cannot be read is exit
nonzero with the reason, never an empty list" — is stated on the `--log-from`
bullet, and an absent file is a file that cannot be read, so the same refusal
covers both reads, and it names `--log-from` as the recovery. `brief` is
untouched and still reports no deviations for an epic with no log, exactly as
it reports no owed items. (2) `doctor`'s near-miss scan runs inside a parsed
entry only. The log's preamble and its baseline notes discuss these labels in
prose — this epic's own log does, on line 43 — and a warning that fired there
could never be cleared, which the ground rules forbid; the scope line already
says "inside an entry" for the unbolded case, and the same scoping covers all
six. (3) The invariant checker gained one PHRASES entry, not two: the ground
rule asks for a short entry per new cross-document coupling, and the closing
line's label is the coupling that matters — the shorter list is the one that
does not become its own drift surface.

**Owed:** Nothing.

**Addendum — review — 2026-09-17 — opus/default effort:** reviewed at
fd4ad39 (equal to `origin/dev-1`) by a fresh-context general agent standing in
for `flow:ticket-reviewer`, which is not registered in this session; it was
given the reviewer definition and the review skill, and the hiring tool
exposed no effort setting. It independently reproduced the revert check
(74 → 67 pass / 7 fail, and 18 → 17/1) and seven guard flips in a scratch
copy. Result: 0 Important, 3 nits, 0 withheld, plus one observation filed as
pre-existing.

Nit 1, fixed in `fe38f52`. METHODOLOGY.md's new section asserted as evidence
that "`tickets.mjs` does not contain the string `Decisions`"; this ticket made
that false — the file now carries two comments naming the field
(`tickets.mjs:472` and `:503`) — so a reader who greps to confirm finds two
hits and may correct the passage the wrong way. The real claim, that no code
path reads the field, is untouched and is now what the passage says, with a
sentence on why the wording matters. Prose only, no behaviour change, so no
CHANGELOG entry.

Nit 2, fixed in `1ffc4e3`. The PHRASES ledger in `check-invariants.mjs` held
the closing label across the two skills, the parser and README, but nothing
held the opener — the label the parser actually reads (`tickets.mjs:505`). The
reviewer renamed every opener in the quick skill to `**Departure:**` in a
scratch copy and every gate stayed green: `check-invariants.mjs` exit 0, its
suite 18/18, `tickets.test.mjs` 74/74, `check DEV-1` 5/5. A quick-lane worker
would then write a label that parses as nothing — the silent failure this epic
exists to end, and one `doctor` does not cover, since its near-miss scan flags
a deviation-shaped slip and not a rename to an unrelated word. My predecessor
weighed one ledger entry against two and chose the shorter list on the
checker's own "keep PHRASES short" rule (its Decisions note 3); the
demonstration turns that trade, because of the two labels the opener is the
load-bearing one. Revert check on the fix: with the new entry removed and the
test kept at HEAD, `check-invariants.test.mjs` goes red 18/19 on "a lane that
renames the deviation opener fails"; restored, 19/19. CLAUDE.md's two pass
counts moved 18 → 19 and the CHANGELOG entry now names both labels, in the
same commit.

Nit 3, corrected here rather than fixed: the log is append-only, so the entry
above stands as written. Its Decisions note 2 cites "this epic's own log does,
on line 43" as an instance of preamble prose that would trip `doctor`'s
near-miss scan. That instance is wrong — line 43's label is backtick-quoted,
so `DEVIATION_NEAR` (`tickets.mjs:507`) does not match it, and with the
entry-scoping guard removed in a scratch copy the reviewer saw `doctor` fire
zero near-miss rows on any log in this repository. The scoping decision itself
stands and is unchanged: the test fixture's preamble line does fire, and a
test pins the guard. Only the cited instance was false.

Pre-existing, recorded and not this range's to fix: acceptance criterion 3's
planned CHECK line in `epics/deviation-routing/tickets.md`
(`… --log-from no-such-ref --json 2>&1 | grep -c "no-such-ref"`) verifies only
that the message names the ref, not that the exit is nonzero. Coverage is not
the gap — this ticket's own test pins both the nonzero exit and the empty
stdout — the planned CHECK line is. Owner: the planner, at the next edit of
that document. `tickets.md` is deliberately untouched here, because the
reviewed party does not edit its own gate.

Re-run after both fixes, on `1ffc4e3`: `tickets.test.mjs` 74/74,
`check-invariants.test.mjs` 19/19, `check-invariants.mjs` exit 0,
`tickets.mjs doctor` exit 0, `tickets.mjs check DEV-1` 5/5, exit 0.

Nothing deferred. The ticket was implemented by a driver-spawned worker whose
run errored at the reviewer hire — the run record in `runs.md` on the epic
branch carries the diagnosis — and was finished, from disposition through this
addendum and the merge, by a supervisor-spawned worker on the pushed branch,
which rebuilt nothing.

Worker tokens (implementation leg): 228,721; Reviewer tokens: 121,853

**Addendum — 2026-09-17 — re-planned mid-epic: DEV-4 added, delivery attended.**
Three things happened after DEV-1's worker pushed. The unattended run errored
at DEV-1's review hire (`runs.md` has the record and the diagnosis), and
DEV-1 was finished attended. PR #51 landed on `main` from another session
and conflicted with this branch in five files; the refresh was resolved on a
side branch, reviewed in a fresh context with no findings (it verified by
line multiset that `tickets.mjs` carries both parents' contributions
exactly, and by test name that the suite is their exact union, 94), and
fast-forwarded here as `a5964da`. And that same PR retired the model this
epic's Decision 2 had copied — per-entry retirement of owed items, after a
marker naming one item of four retired all four — so `tickets.md` now
carries Decision 2a and a fourth ticket, DEV-4, ordered before DEV-2:
deviations close item by item on `main`'s grammar, a bare closing line
facing more than one open deviation closes nothing and says so, a deviation
paragraph ends at the next bolded field, and five sentences that defined
deviation rules by comparison with owed rules are rewritten. Vadim approved
DEV-4's text before any worker saw it. DEV-1's third CHECK was corrected to
test the exit code it was written for; it passes. The remaining tickets run
attended, through `/flow:ticket` in supervisor mode.

### DEV-4 — A deviation is closed item by item — 2026-09-17 — DONE

**Built:** An ID that recorded several departures now numbers them `<ID>.1`,
`<ID>.2` … in document order across every entry it heads, and a
`**Deviations closed:**` line closes what its leading reference list names —
on the owed ledger's own grammar (`OWED_REF`/`OWED_REF_END`), reused rather
than re-invented. A bare closing line still closes an entry's one departure
and, facing more than one open, closes nothing and says so; the same note
reaches `brief` (beside the open deviations, `deviationNotes` in `--json`),
`deviations <ID>` (`notes`, beside each deviation's `item`) and `doctor`, and
is cleared by exactly the repair it names. A reference naming no departure and
an ID a reference ends inside are reported the same way. A `**Deviation:**`
paragraph now ends at the next bolded field or heading as well as at a blank
line, and the five sentences that defined a deviation rule by what an owed
rule does state the rule in their own words, with their own reason, in the
ticket skill, `tickets.mjs`, METHODOLOGY and CHANGELOG.

**Mode:** supervisor — worker worker:DEV-4 (opus), reviewer hired by the
supervisor

**Tokens:** observed by the supervisor — see the review addendum

**Verified:** `node plugins/flow/scripts/tickets.mjs check DEV-4` 5/5 (0/5 on
the base tree at `9270f36`, every criterion failing as planned).
`node --test plugins/flow/scripts/tickets.test.mjs` 99/99 (94 before, five new
tests). Unchanged suites, all passing: `ticket-session-guard.test.mjs` 14/14,
`check-invariants.test.mjs` 19/19, `board.test.mjs` 9/9,
`plan-page.test.mjs` 8/8, `run-epic.test.mjs` 123/123,
`runners/codex.test.mjs` 21/21, `runners/codex-review.test.mjs` 19/19.
`node plugins/flow/scripts/check-invariants.mjs` exit 0,
`node plugins/flow/scripts/tickets.mjs doctor` exit 0,
`node --check plugins/flow/scripts/tickets.mjs` exit 0, and the run-epic
module-body parse exit 0. The *demonstrate* criterion was run in a throwaway
`zeta` epic: an entry with three `**Deviation:**` lines, the third written
directly above `**Owed:**`, plus `**Deviations closed:** Z-1` — observed
`deviations Z-1` printing `3 recorded, 3 not yet closed`, items `Z-1.1`,
`Z-1.2`, `Z-1.3`, the third's text ending at "built with one." with no owed
markup, one note; `brief Z-2` printing that note under the deviations
heading; `doctor` warning with the same sentence. Appending
`**Deviations closed:** Z-1.2 — accepted …` then observed `2 not yet closed`,
`Z-1.2` closed with its closing line, and zero doctor rows. Revert check,
`git revert --no-commit $(git rev-list --no-merges epic/deviation-routing..HEAD)`
with the test file checked back out of HEAD: **"a bare closing line closes a
lone deviation, and against several closes nothing" fails**, with six others
(99 → 92 pass, 7 fail); `git revert --abort` left the tree exactly HEAD. Then
each new guard flipped in turn, suite red for every one: the bare-line arity
(closing all open instead of one, 4 fail), the itemisation that supersedes a
bare line's note (1), the malformed-reference report (2), the unknown-item
note (6), the paragraph's new end at a bolded field (1), the item numbering
(6), the guard for an ID this log records no departure for (5), the position
guard on a dotted reference (4) and on a bare one (2), doctor's warning (1),
`brief`'s notes (1), the subcommand's notes (3). The new invariant phrase was
flipped at two of its four doors — removed from README, then from the quick
skill — and `check-invariants.mjs` exited 1 each time.

**Decisions:** DEV-1's `DELTA_STATUS` fixture keeps its shape but its closing
line becomes the item form (`D-1.1, D-1.2`), because under the new rule its
bare line would close nothing and the fixture would stop demonstrating what it
was written to demonstrate — a closure travelling with its line, and a later
departure not born closed. A malformed reference is reported only when the ID
it starts with heads deviations in this log, exactly as an unknown item is: a
note on a reference this log cannot judge would be permanent and unfixable
here. The `brief --json` payload carries the notes as `deviationNotes`, a new
field, rather than folding them into `notes`, which is the owed ledger's; the
subcommand's field is `notes` as the criterion requires, and it collides with
no `find` field, which its test still checks at any depth. CLAUDE.md's
`tickets.test.mjs` count moves 94 → 99 in this commit; the other recorded
counts were already current on this branch.

**Owed:** Nothing.
