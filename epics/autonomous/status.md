# Autonomous epic — status log

Append-only record of finished tickets. Tickets: `epics/autonomous/tickets.md`.

**Rules.** Append only. Corrections are new dated addenda beneath the entry they
correct, never edits. Report counts, not adjectives. The **Owed** line is
required even when empty.

## Baseline — 2026-08-08

Plugin at v1.6.0 (Q-4 in review as PR #4 at time of writing). What exists:
seven skills, two reviewer agents, `tickets.mjs` with the `integrated` state
(derived from a merged PR whose base is the epic branch — built in v1.3.0 and
verified sound by Q-4's review), a 9-test fixture-repo suite, and `doctor`.
What does not exist: any parsing of `Release mode:`/`Run mode:` lines (they
are prose to the script today), any agent merge permission anywhere, any
driver that runs more than one ticket. Sign-off decisions binding this epic:
a permission prompt mid-run is a stop condition; the zero-interventions claim
must cite the external record (PR/commit timeline), never only the agent's
diary; a merge conflict while refreshing the epic branch stops the run
unconditionally. Known risk carried in: the reviewer agent type has failed to
load in a live session once (see epics/quick Q-1 addendum) — the sanctioned
fallback is in this epic's ground rules.

### AUTO-1 — the run mode is a parsed fact, not prose — 2026-08-08 — DONE

**Built:** Plugin v1.7.0. `tickets.mjs` gains `parseModes()`: `Release mode:`
and `Run mode:` are read from the epic preamble (first word after the colon,
case-insensitive, prose tolerated; absent → serial/attended). Exposed as
`releaseMode`/`runMode` in `find --json`, as a `modes` map in `list --json`,
and as labels on the board's epic headers. The serial+autonomous
contradiction is refused in `find` (exit 1) and failed by `doctor`;
unrecognised values are doctor warnings with the raw value exposed, never a
silent default.

**Files touched:** `plugins/flow/scripts/tickets.mjs`,
`plugins/flow/scripts/tickets.test.mjs` (+4 tests: tolerant parse & JSON
exposure, absent-line defaults, serial+autonomous refusal in find and doctor,
unrecognised-value warning), `plugins/flow/.claude-plugin/plugin.json`,
`CHANGELOG.md`, this file. Branch `auto-1`, cut from `epic/autonomous` (first
ticket; the epic docs travel with this PR).

**Verified:** 13 tests, 13 pass, 0 fail. `doctor` exit 0 live. `find AUTO-1
--json` live returns `releaseMode: serial`, `runMode: null` for this epic.

**Decisions:** Raw unrecognised values are exposed rather than coerced, so a
typo is visible at every layer, not just in doctor. Document contradiction
found and reported, not adapted: `skills/ticket` step 9 says the PR base is
"epic/<epic-name> for the first ticket of any epic whose documents have not
shipped yet", but README ("in serial mode the docs reach the default branch
for free: ticket one branches from here, so they land in that ticket's pull
request") and the epic skill's step 7 both require ticket one's PR to target
the default branch in serial mode. Followed the README semantics (this PR
targets main); the step 9 wording fix is owed.

**Owed:** The `skills/ticket` step 9 first-ticket base-branch wording fix —
inherit by the next quick ticket (proposed Q-6) or fold into AUTO-2, which
rewrites adjacent step 9 text anyway.

**Addendum — review — 2026-08-08 — fable/high:** No Important findings, four
nits, all fixed in the review-fix commit except where noted. (1) Fixed: mode
*label* near-misses (`**Release mode:**` bolded, doubled space) silently
parsed as absent with no doctor warning — doctor now flags any mode-shaped
preamble line the strict parse rejects, with a test (the failure direction
was already closed: a missed autonomous line yields attended, a missed
release line trips the contradiction fail). (2) Fixed: the doctor half of the
refusal test asserted only the exit code — `runFail` now returns stdout and
the test pins the exit to the contradiction row itself. (3) Correction to
this entry's Decisions paragraph, as an addendum since the log is
append-only: the quote "in serial mode the docs reach the default branch for
free…" is from the epic skill's step 7, not README; README's wording is
"travel to the default branch with it" (README §Serial or integration). The
contradiction itself was independently confirmed by the reviewer as real and
pre-existing, already owed to AUTO-2/Q-6. (4) Fixed: case-insensitive parsing
was specified but untested — fixture added. Suite now 15 tests, 15 pass.
Also at sign-off, two requirements were added to the epic doc with the
user's approval: each autonomous ticket runs in a fresh-context subagent
(AUTO-3), and branch protection on the default branch becomes documented
environment setup verified by AUTO-4 before the live run. Nothing deferred
beyond what was already owed.

### AUTO-2 — the gated self-merge path in the ticket loop — 2026-08-08 — DONE

**Built:** Plugin v1.8.0. `skills/ticket` step 10 forks on `runMode`:
attended epics unchanged (stop at the PR); autonomous epics verify the review
addendum exists (unreviewed is never merged — reviewer-spawn failure falls
back to an instructed general agent, and stops if that fails), verify the
PR's base is `epic/<name>` via `gh pr view`, merge with a merge commit only,
report, and continue to the next ticket. Step 9's merge doctrine rescoped:
"no agent ever merges toward the default branch, in any mode" with the one
sanctioned exception pointing at step 10. Step 1 documents the
`releaseMode`/`runMode` fields AUTO-1 added to `find --json`. `skills/epic`
template gains the optional `Run mode: autonomous` line with the sign-off
obligation to state the unattended consequence in plain terms;
`agents/plan-reviewer` accepts autonomy as a legitimate integration-mode
reason and flags a sign-off that hides the consequence. `CLAUDE.md` merge
invariant rescoped in the same commit. Inherited fix landed: step 9 no
longer tells a serial epic's first ticket to base its PR on the epic branch
(AUTO-1's owed contradiction — the docs would strand there; verified against
README §Serial or integration and epic skill step 7).

**Files touched:** `plugins/flow/skills/ticket/SKILL.md`,
`plugins/flow/skills/epic/SKILL.md`, `plugins/flow/agents/plan-reviewer.md`,
`CLAUDE.md`, `plugins/flow/.claude-plugin/plugin.json`, `CHANGELOG.md`, this
file. Branch `auto-2`, cut from `auto-1` — deliberate stack on user
instruction while AUTO-1's PR #5 is in review; its PR bases on `auto-1` and
retargets to main when #5 merges.

**Verified:** 15 tests, 15 pass, 0 fail (no script changes in this ticket;
standing checks). `doctor` exit 0. Guard citations per acceptance criteria:
step 10 "If `runMode` is not `autonomous` … If `runMode` is `autonomous`";
step 9 "No agent ever merges toward the default branch, in any mode".

**Decisions:** The base-branch verification (`gh pr view --json baseRefName`
before the sanctioned merge) was added beyond the epic's literal scope text —
it is the cheapest mechanical check that the one sanctioned merge is aimed at
the only sanctioned surface, and omitting it would leave the rule purely
behavioural. Squash explicitly forbidden for the self-merge: the release PR
needs per-ticket subjects.

**Owed:** Nothing.

**Addendum — review — 2026-08-08 — fable/xhigh:** Three Important, three
nits; all fixed in the review-fix commit. Important: (1) step 3's "what step
9 targets" sentence recreated the exact serial-first-ticket contradiction
this ticket claimed fixed — rewritten to separate the cut-from branch from
the PR base. (2) The merge gate required a review addendum to exist but not
that Important findings were resolved — the gate now also requires the
addendum committed and stops on any unfixed Important finding: in an
autonomous run that disposition is not the agent's to judge. (3) Step 10's
"continue to the next ticket" collided with the signed-off driver
architecture (a driver-spawned worker would race the driver's own loop) —
carve-out added: a driver-spawned agent stops after the merge; only a
driverless run continues itself. Nits fixed: the plan-reviewer's sign-off
check was dead text (it runs before sign-off exists — now checks the draft's
Run mode block, which the sign-off is written from; CHANGELOG reworded to
match); step 2 now names Run mode as load-bearing; the base check is pinned
to the `epic` field from `find --json` instead of convention. Correction to
this entry's Files-touched paragraph, as a dated addendum: "retargets to
main when #5 merges" holds only if the `auto-1` branch is deleted at merge —
GitHub does not retarget otherwise; nothing rides on it. Pre-existing,
handed on: the epic branch is never pushed to origin (epic skill commits
locally only) — load-bearing for unattended runs, added to AUTO-3's scope by
re-plan; step 8 never said to commit the review addendum — fixed here as
part of Important (2) since the merge gate reads it. Reviewer confirmed the
runMode gate fails closed, the doctrine texts agree across all five
documents, README/METHODOLOGY contradictions are AUTO-3's assigned scope,
and standing checks pass (15/15, doctor 0). AUTO-5 (attended supervisor
default, interactive by flag, static hook) added to the ticket doc by
re-plan on user proposal, sequenced after AUTO-4.

### AUTO-3 — the /flow:run driver — 2026-08-08 — DONE

**Built:** Plugin v1.9.0. New skill `plugins/flow/skills/run/SKILL.md` —
`/flow:run <epic>`: refuses any epic whose `runMode` is not `autonomous`
and any epic with tickets stuck in intermediate states (a dead previous run);
verifies sign-off mechanically (`tickets.md` **and** `status.md` present on
`origin/epic/<name>` — status.md exists only after the sign-off gate);
checks the environment before ticket one (pre-authorized permission surface
enumerated; branch protection on the default branch checked via `gh api`,
missing = report before starting); loops tickets in document order via
`tickets.mjs next`, refreshing `epic/<name>` from the default branch between
tickets (conflict → `git merge --abort` and halt); spawns each ticket's
worker as a fresh-context general agent whose prompt carries the load-bearing
"A driver spawned you" phrase (ticket skill step 10's stop-after-merge key),
records the worker's identity per ticket, and verifies the outcome by
`find --json` state `integrated` — never by the worker's own report; halts
on the epic's seven ground-rule stop conditions, reproduced verbatim, never
improvising past one; appends a `### Run — <date> — <completed|halted>`
record to the status log, committed and pushed on `epic/<name>`; ends by
opening the release PR (`Release: <epic>`, merge-commit-only warning at the
top of the body, full per-ticket evidence trail) and never merges, approves
or comments on it. `skills/epic` step 7 now pushes `epic/<name>` to origin at
creation (AUTO-2's review handed this on: PR bases must exist on the remote,
and an unattended run cannot stop to ask) and step 8's handover points
autonomous epics at `/flow:run`. README: eight skills, `/flow:run` table row,
new "Autonomous epics" section with the two environment prerequisites.
METHODOLOGY.md: new section "Why the human gate can move to the release pull
request" — the gate relocates rather than disappears, why autonomy requires
integration topology, why stop conditions beat retries, why the driver never
implements, why branch protection is environment setup rather than plugin
code.

**Files touched:** `plugins/flow/skills/run/SKILL.md` (new),
`plugins/flow/skills/epic/SKILL.md`, `README.md`, `METHODOLOGY.md`,
`plugins/flow/.claude-plugin/plugin.json`, `CHANGELOG.md`, this file.
Branch `auto-3`, cut from `main` (serial mode, epic docs already shipped,
no open epic PRs).

**Verified:** `node --test plugins/flow/scripts/tickets.test.mjs` — 15
tests, 15 pass, 0 fail (no script changes; standing checks). `node --check
plugins/flow/scripts/tickets.mjs` clean. `doctor` exit 0 live. Acceptance
criteria: the run skill's step 5 lists the seven stop conditions with the
ground rules' wording verbatim; step 3 documents the required
pre-authorizations and states that a permission prompt firing mid-run is a
stop condition (sign-off decision, 2026-08-08).

**Decisions:** (1) The run record heading (`### Run — …`) deliberately
matches neither parsed heading shape nor doctor's near-miss regexes — those
require an ID-like `X-\d+` token — verified against `tickets.mjs` lines
419-420, so the board ignores run records instead of misparsing them. (2)
Sign-off verification requires `status.md` on the remote epic branch, not
just `tickets.md`, because the epic skill creates status.md only after the
human approves — the cheapest mechanical trace of the gate. (3) The driver
verifies each ticket reached `integrated` via the board, not the worker's
report — the merged PR is evidence, a report is a claim. (4) Missing branch
protection reports-and-stops at run start (the invoking human is present
then and can waive); it is not a doctor check because it is environment
setup AUTO-4 verifies before the live run. (5) Step 8 of the epic skill
gained one handover sentence pointing autonomous epics at `/flow:run` —
adjacent to the scoped step 7 change; without it the driver is
undiscoverable from the flow that creates the epics it runs. (6) The release
PR title format `Release: <epic>` deliberately does not match `<ID>: <title>`
so it can never be mistaken for a squashable single-ticket PR.

**Owed:** Nothing.

**Addendum — review — 2026-08-08 — fable/xhigh:** Two Important, four nits;
five fixed in the review-fix commit, one kept with a reason. Important,
fixed: (1) the run skill's step 1 claimed the script refuses the
serial+autonomous contradiction "before you see it", but that refusal lives
in `find` and `doctor`, not in the `list` command step 1 actually runs — a
contradictory epic would have passed the door and mutated
`origin/epic/<name>` (step 4a merges and pushes) before a worker's `find`
halted the run. The driver now checks `releaseMode === "integration"`
itself, at the door, and the skill says why. (2) Re-invoking the driver
after a halt on BLOCKED silently resumed past the blocked ticket — `next`
hands out only `todo` tickets, so every successor would be built on the
blocked predecessor and the release PR would omit its work while reading
"completed". `blocked` now joins the refused states at step 1's door; the
human resolves or re-plans the blocked ticket before any resume. Nits fixed:
step 1 named board display labels ("in progress", "done, unpushed") while
directing the driver at `--json`, whose values are `in-progress`,
`in-review`, `done` — the JSON values are now the ones named; the
branch-protection probe read a 404 from the classic-protection endpoint as
"unprotected", missing rulesets — a 404 now falls through to
`rules/branches/<default-branch>`; CLAUDE.md's "one sanctioned agent merge"
undercounted the driver's refresh merge — reworded to "one sanctioned agent
merge of a pull request", with refresh-from-main named as the safe
direction. Not fixed, with reason: the epic skill's step 8 handover sentence
sits outside AUTO-3's literal scope bullets — kept, because the driver is
undiscoverable from the flow that creates autonomous epics without it;
already declared in Decisions (5), and the reviewer marked it
for-the-record, not blocking. Reviewer confirmed all three acceptance
criteria (standing checks live; stop conditions verbatim against the ground
rules; pre-authorizations documented with the mid-run-prompt stop
condition), and verified the run-record heading against all four parser
regexes empirically. Re-verified after fixes: 15 tests, 15 pass, 0 fail;
doctor exit 0. Nothing deferred.

### AUTO-4 — a real epic runs itself — 2026-08-08 — DONE

**Built:** The live proof. A guinea-pig epic `board-ux` (3 genuinely useful
tickets: the `/ticket`→`/flow:ticket` Next up fix superseding quick's Q-5;
unknown epic filters become errors everywhere; the `tickets.mjs brief`
subcommand) was planned per the epic skill, plan-reviewed (fable/high — one
Blocking finding fixed pre-sign-off: the epic's own write-surface rule
forbade BOARD-1's sanctioned cross-epic edit), signed off as `Run mode:
autonomous` with the unattended consequence stated, and executed end to end
by `/flow:run board-ux`. The run: started 2026-08-08T07:22:44Z; each ticket
in a named fresh-context general agent (worker:BOARD-1/2/3 — the driver
implemented nothing); epic branch refreshed from main before each ticket,
conflict-free; no stop condition fired; release PR #12 opened by the driver
to main at 2026-08-08T08:02:49Z. Wall time sign-off to release PR: ~40
minutes. Reviewers caught unattended: BOARD-2 opus/high 1 nit fixed + 1
pre-existing handed off; BOARD-3 opus/high 1 Important fixed (README
documented a path that fails in installed projects) + 2 nits fixed + 1
pre-existing handed off; BOARD-1 fable/high clean. Plugin 1.9.0 → 1.12.0
across the run.

**External record (the acceptance criterion's evidence):** every guinea-pig
ticket reads `integrated` on the board (PRs #9/#10/#11, merged
07:30:29Z/07:44:13Z/08:00:45Z, each with 0 comments and 0 reviews); `git
log origin/main` tip is 556e790 (AUTO-3's merge) — no commit from the run
reached main; the run record in `epics/board-ux/status.md` names the worker
agent per ticket. **Disclosed for honesty:** one human input arrived in
conversation mid-run (~07:30Z): reviewer agents should run on opus, not
fable, and the model should become configurable. It changed no code and
touched no PR — the external record shows zero interventions — but it did
redirect the reviewer model from BOARD-2 onward, and this entry does not
pretend otherwise. The configurability request is owed below.

**Files touched:** `epics/autonomous/tickets.md` (AUTO-4's
branch-protection criterion amended at sign-off: the repo is private under
a free-plan org where GitHub offers no protection; the user waived the hard
floor for this run rather than go public or upgrade — recorded re-plan),
this file. The guinea-pig epic's own files travel in release PR #12, not
here. Branch `auto-4`, cut from `main`.

**Verified:** Board: `list board-ux` shows 3/3 `integrated` with PR
numbers. Release PR #12 exists, base `main`, head `epic/board-ux`, opened
by the driver and merged by no agent. `git log origin/main -1` = 556e790.
Standing checks on this branch: tests 15/15 (the suite grew to 24/24 on the
epic branch — arrives with PR #12), doctor exit 0.

**Decisions:** (1) Branch protection waived rather than blocked-on: GitHub
returns 403 for protection on private free-plan repos; the user chose at
sign-off to run on soft enforcement alone, and AUTO-4's criterion was
amended to admit a recorded human waiver — a re-plan, not a silent
adaptation. (2) The mid-run reviewer-model directive was applied from the
next un-spawned worker onward instead of being refused for run purity or
halting the run — the human owns the experiment; the record discloses the
input rather than defending a fiction. (3) BOARD-1's fable review stands as
recorded; review addenda are append-only history.

**Owed:** Three post-run quick tickets: configurable reviewer model (user
request, 2026-08-08); unfiltered `list` prints the false `no epics found`
when all epics lack ticket sections (BOARD-2's review, pre-existing); plain
`find` prints `pr [object Object]` (BOARD-3's review, pre-existing). All
three also listed in release PR #12's body.

**Addendum — review — 2026-08-08 — opus/medium:** Two Important, two nits;
all four addressed. (1) Important, corrected here (the log is append-only,
so the correction is this addendum): the entry's sentence "the external
record shows zero interventions" overclaims — agents act under the human's
own GitHub identity, so the record cannot distinguish agent from human
action, and an auditor reading only the record sees a human account merging
PRs #9/#10/#11 and opening #12. What the record supports is exactly the
narrower parenthetical already in the entry: 0 PR comments, 0 PR reviews,
`origin/main` unmoved. (2) Important, fixed in the same commit as this
addendum: the run's breach of Scope's "no human between sign-off and the
release PR" clause had no recorded disposition, while the
environment-blocked criterion got a formal waiver — asymmetry closed by
annotating AUTO-4's external-record acceptance criterion in
`epics/autonomous/tickets.md` with the recorded deviation. Stated plainly:
the no-human clause was not literally achieved on this first run; the
mid-run reviewer-model directive was a human intervention, disclosed at the
time and now dispositioned. (3) Nit, corrected here: the Verified line's
board check (`list board-ux` → 3/3 `integrated`) reproduces on
`origin/epic/board-ux`, not on this branch's tree, whose `epics/` has no
board-ux — the branch qualification was missing. (4) Nit, fixed by
extending Owed here: a **fourth** owed quick ticket — the run skill's
environment gate documents only success and 404 from the protection
endpoints, but a private free-plan repo returns **403** on both, an
undocumented condition whose nonzero exit is itself a stop condition; and
the skill gives an unattended driver no way to learn of a pre-recorded
human waiver. Exposed by this run's waiver, shipped by AUTO-3, correctly
not fixed here per Not-in-scope. Reviewer confirmed acceptance criteria 1–3
satisfied outright (the waiver a genuine timestamped re-plan — committed
19 seconds before run start — not a retrofit), every cited number in the
entry exact against `gh`/`git`, and standing checks green on a throwaway
worktree of the reviewed tree (15 tests, 15 pass, 0 fail; doctor exit 0;
epic branch 24/24). Nothing else deferred.
