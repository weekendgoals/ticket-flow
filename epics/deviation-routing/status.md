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

**Addendum — review — 2026-09-17 — opus/default effort:** one Important, four
nits, one pre-existing. The reviewer was a general agent standing in for
`flow:ticket-reviewer`, which this session has not registered; the hiring tool
exposes no effort setting.

Important, fixed in `22bddc0`. The paragraph terminator this range added was
`/^\*\*/` — any line starting in bold — while the ticket, the comment beside
it, README and METHODOLOGY all say the next bolded **field**. Reproduced both
ways before the fix: a wrapped sentence whose second line began with a bold
phrase was cut at the break ("… built without it, because"), and a
`**Deviation:**` label whose text began on the next line in bold left the
paragraph empty, which the empty-text filter drops — `deviations P-1 --json`
reported `count: 0` where the same fixture against `9270f36` reported
`count: 1` with the full text. A departure reported as none is the failure the
line exists to end, so this was a regression of the record itself. The
terminator is now `BOLD_FIELD = /^\*\*[^*]+:\*\*/`; both fixtures report
`count: 1` with the text whole. The new test walks every label the entry
template puts under a departure — Owed, Decisions, the owed marker, the
closing line, a dated review addendum — plus a heading, each with no blank
line between, and both regressions. It fails with the fix reverted, and the
terminator flipped back to the broad regex turns it red on its own.

Nit, fixed in `5d7651e`. A departure closed twice kept the later line as
`closedBy`; the first stands now, because the decision a reader wants is the
one that was made.

Nit, fixed in `5d7651e`. The three notes reconstructed a closing line naming
one entry, even when the line as written named several, so the quoted text was
not what the reader would find in the log. Each note now names the reference it
read, quoted as the writer spelled it — the reference grammar matches
case-insensitively and only a reference that closes is normalised, so a
mistyped `E-1oops` is reported as `E-1oops`. The notes' wording therefore
differs from the outputs quoted in the entry above, which were recorded before
this fix.

Nit, fixed in `5d7651e`. `brief` no longer prints "none outstanding" above a
note reporting that a closing line closed nothing.

Nit, **not fixed, recorded for the retro.** A bare closing line standing above
the entry's only departure closes nothing and says nothing, while a numbered
reference in that position earns a note. The departure stays open, which is the
safe direction this whole ticket argues for — silence, not loss. It is not
fixed here because the note it would need cannot be cleared by the repair the
other three name: the same silent case covers a line re-naming an entry whose
departures are already closed, where a note would be permanent and unfixable,
and the behaviour is byte-identical to `parseOwed`, so changing one ledger and
not the other creates exactly the drift between two statements of one rule that
this epic exists to end. It belongs with the pre-existing item below, in one
hardening ticket against both parsers.

Pre-existing, not this range's, recorded with an owner. A closing line or an
owed marker written inside a fenced code block in a status log is parsed as a
real line and closes or retires; neither parser is fence-aware. The deviation
half arrived with DEV-1, the owed half with PR #51, and the ticket skill's own
template shows the line inside a fence, so a worker pasting it into an entry
would trip it. Owner: the retro, as one hardening ticket over both parsers,
together with the unfixed nit above.

Re-run after both fixes, on `5d7651e`: `tickets.test.mjs` 101/101 (99 before
the review, two new tests), `check-invariants.test.mjs` 19/19,
`run-epic.test.mjs` 123/123, `check-invariants.mjs` exit 0,
`tickets.mjs doctor` exit 0, `node --check tickets.mjs` exit 0,
`tickets.mjs check DEV-4` 5/5. CLAUDE.md's suite count moved 99 → 101 in
`5d7651e`. Revert check over the two fix commits, tests kept at HEAD: 97 pass,
4 fail, including "a bolded FIELD ends the paragraph; a sentence that merely
begins in bold does not". Each fix was also flipped on its own — the
terminator, the first-closure rule, the note wording, the reference's case, and
the brief's heading — and the suite went red for every one.

One finding deferred: the nit recorded for the retro above, with the
pre-existing item it belongs with. Nothing else deferred.

Worker tokens (implementation leg): 209,716; Reviewer tokens: 153,568

**Addendum — re-review — 2026-09-17 — opus/default effort:** bounded re-review
of the three fix commits by the same reviewer. **0 Important**, and nothing
raised in the first review left unaddressed.

It re-ran both original reproductions against the new head — each reports one
departure with its text whole, where `010548a` reported none — and re-ran the
mixed-list, two-entry, closed-twice and closing-line-above fixtures: a
departure closed twice now keeps the first line and stays closed. It confirmed
the three notes byte-identical across `deviations --json`, `brief --json` and
`doctor`, and that a quoted reference cannot carry harmful input, the echoed
token's character class being `[A-Za-z0-9.-]`. It hashed the owed region
identical at `9270f36` and at `1b238a6`. It reproduced the fix's revert check
in a clone — 97 pass, 4 fail, the named test among them — and flipped each fix
alone, with the suite red for every one.

It judged the deferral of the silent bare-line case sound on the facts, having
reproduced it: a note there would have no exit, because naming the item of a
lone-departure entry (`P-1.1`) earns the unknown-item note instead, which never
clears.

Two edges it recorded so they are not re-found, both for the same hardening
ticket the retro already owns — the one carrying the fenced-block item and the
deferred nit. First: `BOLD_FIELD` requires a colon, so a period-form bold label
— a dated addendum heading ending in a period, `**Nothing deferred.**`,
`**Rules.**` — written with no blank line above it is still absorbed into a
departure's text; 12 of 119 bold-start lines in this repository's status logs
are period-form. No record is lost and nothing closes wrongly, and `9270f36`
absorbed all of these, so this range is a strict improvement. **Correction to
the review addendum above:** its sentence that a dated review addendum heading
ends the paragraph is true of the colon form only, which is the only form the
new test loop exercises. Second: a bare label with no text at all, directly
above another field, reports no departure, with no note and no `doctor` row —
not a lost record, since there is no text to lose, and the empty-text filter
predates this ticket, but a silent drop all the same.

Re-review tokens: 191,972

### DEV-2 — A deviation stops an attended merge — 2026-09-17 — DONE

**Built:** the two attended doors now carry a departure to the human who
decides it. Ticket skill step 9 runs `deviations <ID>` before the summary and
shows **every** one the ticket recorded — a closed one with its closing line,
and the note a closing line that closed nothing earns — then names them in the
incremental pull request body under their own heading. Step 10 does not
integrate a ticket **with an unclosed deviation** into its epic branch: it
reads the departures off `origin/<branch>` with `--log-from`, because that is
the SHA it merges, stops before the merge commands on `open` above zero or on
any note, and spells out both recoveries — the human accepts it, or the worker
fixes it on the branch as new commits with a dated addendum and the human then
accepts it as fixed in a commit — each ending in a closing line no agent
composes and naming the `<ID>.<n>` references, because a bare line facing
several closes nothing and would leave the gate refusing. The quick skill's
step 7 names a deviation in its pull request body in the same words; with no
agent merge to refuse, that body is its only door. `check-invariants.mjs` pins
the pull-request-body sentence across the two lanes, with a test that flips it
at each door; README, METHODOLOGY and the CHANGELOG carry the doors and the
reason for them.

**Mode:** supervisor — worker worker:DEV-2 (opus), reviewer hired by the
supervisor

**Tokens:** observed by the supervisor — see the review addendum

**Verified:** `node plugins/flow/scripts/tickets.mjs check DEV-2` 3/3, exit 0
(0/3 on the base tree at `b5d02ce`, every criterion failing before the work).
`node --test plugins/flow/scripts/check-invariants.test.mjs` 20/20 (19 before;
one new test). Unchanged suites, all passing: `tickets.test.mjs` 101/101,
`ticket-session-guard.test.mjs` 14/14, `board.test.mjs` 9/9,
`plan-page.test.mjs` 8/8, `run-epic.test.mjs` 123/123,
`runners/codex.test.mjs` 21/21, `runners/codex-review.test.mjs` 19/19.
`node plugins/flow/scripts/check-invariants.mjs` exit 0,
`node plugins/flow/scripts/tickets.mjs doctor` exit 0,
`node --check plugins/flow/scripts/tickets.mjs` exit 0, and the run-epic
module-body parse exit 0 (both scripts untouched here). CLAUDE.md's two
invariant-suite counts move 19 → 20 in the same commit as the test.
demonstrate, read as a supervisor against real output from a throwaway
`throwaway` epic in a temp git repo, one entry recording a hero band that was
not built. **One open item** — `deviations TW-1` printed `1 recorded, 1 not
yet closed by a human`, `open TW-1: …`; `--json` `open: 1`, `notes: []`. The
sentence that decided it: step 10's "`open` above zero stops this step before
the merge commands below" — the reading stops at the refusal, never reaching
`git rev-parse origin/<branch>`. **Closed as fixed** — the fix committed on
branch `tw-1` and a dated `**Deviations closed:** TW-1 — fixed in <sha>;
Vadim; 2026-09-17.` beneath it, read the way the step reads it
(`deviations TW-1 --log-from tw-1 --json`): `open: 0`, `notes: []`, the
deviation `closed` with `closedBy` carrying the line. Decided by the same
bullet's other half, "`open: 0` with an empty `notes` is what resumes this
step, and nothing else is" — the reading reaches the merge. **Closed by a line
the supervisor did not write** — branch `tw-1-selfclosed` carrying
`**Deviations closed:** TW-1 — accepted; the implementing worker;
2026-09-17.`: `open: 0`, so the same sentence reaches the merge, and step 9's
"A closed one is shown **with its closing line**, because only a human may
write that line and no command can say who did" is what puts
`closed by: TW-1 — accepted; the implementing worker; 2026-09-17.` in front of
the human. The refusal's recovery was read from inside the refused state too:
on a two-departure entry a bare `**Deviations closed:** TW-1` left
`2 recorded, 2 not yet closed` plus the bare-line note, so the step still
refuses — which is why the step names the references — and appending
`**Deviations closed:** TW-1.1, TW-1.2 — …` then gave `open: 0`, zero notes,
both closed with that line. revert check: `git revert --no-commit $(git
rev-list --no-merges b5d02ce..HEAD)` with
`plugins/flow/scripts/check-invariants.test.mjs` checked back out of HEAD —
**"either lane that stops naming a deviation in the pull request body fails"
fails**, 19 pass / 1 fail; `git revert --abort` left the tree exactly HEAD
(`git diff HEAD` empty). The new invariant was then flipped at each of its two
doors in turn — the sentence replaced in the ticket skill, then in the quick
skill — and `check-invariants.mjs` exited 1 each time, naming the file and the
coupling.

**Decisions:** six judgment calls the documents left open. (1) Step 10's gate
reads `origin/<branch>` through `--log-from`, not the checkout: the step merges
a verified SHA, so a closing line present only in the working tree would clear
a gate on a commit that does not carry it — DEV-1 built the flag for exactly
this ref, and a gate is verified at the door its actor walks through. (2) Both
doors show the `notes` DEV-4 added, not only the deviations. A note is not a
departure, so nothing required it; but a bare closing line facing several
closes nothing, and a reader who counted only `closed` flags would see the
departure still open with no sign that anyone had tried to close it — the same
"seen rather than trusted" the epic's Decision 5 asks of a closing line. It is
also what makes the refusal's recovery legible, since the note states the
repair. (3) Who physically writes the closing line: the human, in every path.
Step 6, README and METHODOLOGY all say no agent writes one, and the ticket's
"written on the human's word, quoted" is rendered as a boundary rather than a
permission — dictating the sentence for the worker to commit verbatim is the
human writing it; inferring it from a "yes", or drafting it for them to
approve, is not. That keeps the recovery workable in a terminal session without
letting the party under review compose its own closure. (4) The refusal names
the `<ID>.<n>` references and says why, rather than telling anyone to "write
the closing line": observed above, a bare line against several departures
leaves the gate refusing, so the unqualified advice would have been a recovery
that does not work in the refused state. (5) One `PHRASES` entry, on the
pull-request-body sentence across both lanes — the checker's own rule is to
keep the list short, and the refusal sentence is single-document and already
pinned by this ticket's first CHECK. (6) Step 10's incremental half gained one
sentence saying there is no agent merge there to refuse and that the departure's
door was step 9's body; without it the asymmetry between the two deliveries
reads as an omission a later session would "fix".

**Owed:** Nothing.

**Addendum — review — 2026-09-17 — opus/default effort:** two Important, five
nits, one pre-existing, reviewed at `ed54638` by a fresh-context general agent
standing in for `flow:ticket-reviewer`, which this session has not registered;
the hiring tool exposes no effort setting. Every disposition landed in one
commit, `ff8cc7a`. The planner re-planned this ticket from the review
(`bfb7ba6` on the epic branch) with two corrections to scope, and both are
built here.

Important, fixed in `ff8cc7a`. Step 10 stopped on `open` above zero "and so
does any entry in `notes`", and resumed only on "`open: 0` with an empty
`notes`". Of the parser's three notes only the bare-line note ever clears
(`tickets.mjs:938, :980`); the unknown-item and malformed-reference notes have
no suppression path. Reproduced on a throwaway epic: two departures, a closing
line naming `TW-1.1, TW-1.3` — one digit wrong — gives `open: 1, notes: 1`;
doing exactly what that note prescribes, a new dated line naming `TW-1.2`,
gives `open: 0, notes: 1`, and the note is still there, because the log is
append-only. The gate as written would have refused that ticket forever. It now
stops on `open` above zero **and nothing else**; notes are shown at every door
— summary, both pull request bodies, and the stop itself — and gate nothing.
The step carries the reason: a closing line that closed nothing leaves its
departure open, so `open` already stops every case a note reports, while a note
cannot be relied on to clear, so a gate on one would be a refusal with no
recovery. That notes are unclearable at all is a defect of both parsers, which
this ticket does not touch — see the pre-existing item below. This corrects the
**Built** field above, which the append-only rule leaves standing as written.

Important, fixed in `ff8cc7a`. The run skill's § "Resuming after a halt" said
an unfixed Important finding "is the one case that does not end in a merge",
which this range made false, in the paragraph that routes a halted ticket
through `/flow:ticket <ID>` to step 10 — so a session reading the run skill as
authority would have met the deviation refusal as a bug to route around. That
one inventory sentence, the only part of the run skill in this ticket's scope,
now names both refusals and where each is recovered, and the sentence above it
names step 10's **two gates**. Judgment call in the fix: the pair is pinned by
a new `PHRASES` entry, `/unclosed deviation/i` across the ticket and run
skills, because one document correct alone and wrong beside its pair is exactly
what that ledger exists to catch, and the drift had already happened once
within this epic. DEV-3's territory — the unattended stop condition, its
recovery procedure and the driver — is untouched.

Nit, fixed in `ff8cc7a`. The re-run after a closing line said nothing about
fetching, while `--log-from origin/<branch>` reads a remote-tracking ref that a
human pushing from their own checkout leaves stale; the step now fetches first,
with the reason.

Nit, fixed in `ff8cc7a`. The step gave no instruction for a `deviations` read
that fails. A nonzero exit or an absent payload is now a stop, never "none
recorded", quoting the script's own refusal.

Nit, fixed in `ff8cc7a`. "no deviations recorded" was required in the printed
summary only. Both pull request bodies now write the heading even when there is
nothing to name — an absent heading reads as an omission, which is the
summary's own reasoning, and in the quick lane that body is the only door.

Nit, fixed in `ff8cc7a`. Both body sentences said "each by its `<ID>.<n>`
reference", which tells a reader to invent `Q-3.1` for an entry that recorded
one departure and keeps its bare ID (`tickets.mjs:928`) — a reference that,
copied into a closing line, earns the permanent unknown-item note. Both now say
to use the reference the command printed, and say why.

Nit, fixed in `ff8cc7a`. Step 6 read absolutely — the closing line is "never
yours, and never any agent's" — with no pointer to the one boundary step 10
draws at the attended door. It now carries the cross-reference: a sentence the
human dictates for verbatim commit is theirs, one inferred from a "yes" or
drafted for approval is not.

Pre-existing, not this range's, recorded with its owner. The ticket skill
(`:352-356`) and README (`:374-375`), both unchanged since `b5d02ce`, say a
reference naming no departure and a malformed one are reported "the same way"
and that naming any item of that entry clears the note; the parser clears only
the bare-line note, and the note strings themselves name repairs that do not
clear them. `main`'s owed ledger behaves identically, so it is one defect over
two parsers. Owner: the planner, who is putting a ticket over both parsers to
the human. Neither claim was edited here, and nothing written in this range
repeats it.

Re-run after the fixes, on `ff8cc7a`: `tickets.mjs check DEV-2` 3/3, exit 0;
`check-invariants.test.mjs` 21/21 (20 before the review fix, one new test);
`tickets.test.mjs` 101/101; `ticket-session-guard.test.mjs` 14/14;
`board.test.mjs` 9/9; `plan-page.test.mjs` 8/8; `run-epic.test.mjs` 123/123;
`runners/codex.test.mjs` 21/21; `runners/codex-review.test.mjs` 19/19;
`check-invariants.mjs` exit 0; `doctor` exit 0; `node --check tickets.mjs` exit
0. CLAUDE.md's two invariant-suite counts moved 20 → 21 in the same commit.
`git diff b5d02ce..HEAD` touches neither `tickets.mjs` nor `run-epic.mjs`.
Revert check over `ff8cc7a` with the test file kept at HEAD: **"either
document losing step 10's second refusal fails"** fails, 20 pass / 1 fail; the
new phrase was then flipped at each of its two doors and `check-invariants.mjs`
exited 1 each time, naming the file. The other fixes in that commit are
sentences an agent executes and no runtime reads — `nothing to pin — the gate's
wording has no parser, test or ledger entry that could assert it; what holds it
is the acceptance CHECK on the refusal's existence, still 3/3, and the
demonstrate readings, re-run below`. The five readings, on the same throwaway
epic: one open item `open: 1` → stops; closed as fixed `open: 0` → reaches the
merge; closed by a line the supervisor did not write `open: 0`, `closedBy`
shown → reaches the merge and shows the line; a bare line against two
departures `open: 2` with the bare-line note → stops, and the itemised repair
gives `open: 0`, zero notes; and `open: 0` with a lingering unknown-item note →
**reaches the merge and shows the note**, which is the fix.

Nothing deferred.

Worker tokens (implementation leg): 182,077; Reviewer tokens: 136,121
