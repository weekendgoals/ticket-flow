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
