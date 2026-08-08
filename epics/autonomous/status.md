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

### AUTO-5 — attended tickets get the same fresh context: supervisor by default, interactive by flag — 2026-08-08 — DONE

**Built:** Plugin v1.13.0. `skills/ticket` gains step 0, the lane fork:
attended `/flow:ticket <ID>` now defaults to **supervisor mode** — the
invoking session resolves the ticket and implements nothing; a
fresh-context worker executes steps 1–6 from the documents, the
**supervisor spawns the reviewer** (the party under review no longer hires
its own judge), findings go back to the same worker for step 8, the worker
pushes and opens the PR, the supervisor relays and stops. A driver- or
supervisor-spawned agent skips step 0 (it is the worker). `--interactive`
runs in-session as before, once per session. The step 6 template gains a
**Mode** line naming how the ticket ran and which worker ran it — the
audit trail for the fresh-context rule. New static hook:
`hooks/hooks.json` registers a UserPromptSubmit guard
(`hooks/ticket-session-guard.mjs`, zero dependencies): `--interactive`
drops a marker keyed to the session id in the OS temp dir at invocation;
any later `/flow:ticket` in that session exits 2 with "this session
already carries a ticket's context — /clear first, or use the default
supervisor mode." Supervisor runs set no marker. The guard has its own
6-test suite. METHODOLOGY gains "Why attended tickets get a supervisor"
(same commit as the constraint, per the root invariant); README's ticket
row and CLAUDE.md's test commands updated. Autonomous epics unchanged.

**Mode:** interactive — in-session, necessarily: this ticket ships the
supervisor default that did not exist when it started, and it ran under
the v1.12.0 skill in a session already carrying four tickets' context —
the exact condition it exists to prevent. The hook was not yet loaded, so
no marker guards this session.

**Files touched:** `plugins/flow/skills/ticket/SKILL.md`,
`plugins/flow/hooks/hooks.json` (new),
`plugins/flow/hooks/ticket-session-guard.mjs` (new),
`plugins/flow/hooks/ticket-session-guard.test.mjs` (new),
`METHODOLOGY.md`, `README.md`, `CLAUDE.md`,
`plugins/flow/.claude-plugin/plugin.json`, `CHANGELOG.md`, this file.
Branch `auto-5`, cut from `main`.

**Verified:** `node --test plugins/flow/scripts/tickets.test.mjs` — 24
pass, 0 fail. `node --test plugins/flow/hooks/ticket-session-guard.test.mjs`
— 6 pass, 0 fail (supervisor invocations set no marker; interactive sets
one; both follow-up forms refused with the documented message, exit 2;
cross-session isolation; garbage input never blocks). `node --check` on the
guard: clean. `doctor` exit 0. Acceptance criteria: (2) verified at the
script level — the exact two-invocation sequence is a test asserting exit 2
and the documented message; the **live** in-session check needs a fresh
session with the plugin's hooks loaded and is owed. (1) needs the first
real supervisor-mode run and is owed with it.

**Decisions:** (1) The hook marks the session at invocation, not at
completion — contamination begins when the interactive ticket starts, and
a failed interactive run still leaves its context behind. (2) The marker
lives in the OS temp dir keyed by session id, not in the repository: it is
a fact about a conversation, and repo state would outlive the session it
describes (and dirty the working tree mid-ticket). (3) The guard fails
open on its own errors (unparseable input, unwritable marker) — a broken
guard must degrade to today's behaviour, never block legitimate work.
(4) The refusal blocks ALL later `/flow:ticket` forms in a marked session,
including a second `--interactive`, per the epic doc's rule as written.
(5) In supervisor mode the reviewer-hiring moved to the supervisor, one
step beyond the autonomous lane, per this ticket's scope; the autonomous
lane was left untouched per Not in scope.

**Owed:** Two live checks to the first post-merge session: a real
supervisor-mode ticket (status entry naming the worker, supervisor
transcript free of implementation edits — acceptance criterion 1), and the
interactive-twice refusal with hooks actually loaded (criterion 2, verified
here only at script level). Natural carrier: the first of the four owed
quick tickets, run supervisor-mode after this merges.

**Addendum — review — 2026-08-08 — opus/high:** Two Important, five nits
(two more withheld as below-bar), one pre-existing; both Importants and all
five nits fixed in the review-fix commit. Important (1): the guard blocked
every later `/flow:ticket` while its own refusal message advertised
supervisor mode as the recovery — the rule blocked its own advice — and
"/clear first" relied on session-id rotation that /clear does not
guarantee, risking a permanent lockout. Redesigned with the epic doc
re-planned in the same commit (dated note in AUTO-5's scope): only a
second `--interactive` is refused; supervisor invocations pass in a marked
session (their workers start empty — the property the rule protects); the
marker is wiped by a new SessionStart registration on clear/startup and
survives resume/compact, keying the reset to the event, never to id
rotation. New message names both working recoveries. Important (2): the
owed carrier for acceptance criterion 1 was structurally wrong —
`/flow:quick` enters the ticket loop at step 4 and never reaches step 0's
lane fork, so a quick ticket cannot demonstrate supervisor mode.
**Corrected owed hand-off:** criterion 1's live check rides the next epic
ticket invoked via `/flow:ticket` (first candidate: the retro's first
output ticket), not a quick run; criterion 2's live check is a throwaway
`--interactive` invocation in a fresh session after this merges. Nits
fixed: three mutation-survivable test gaps closed (the `/flow:tickets`
boundary now tested against a *marked* session, the refusal message
asserted verbatim, a flagless "interactive" word asserted non-marking) and
the suite grew 6 → 10 with leak-proof cleanup; the supervisor ending now
routes an autonomous epic's directly-invoked ticket through step 10's gate
(the worker merges and stops) instead of contradicting it; the supervisor
now hands the reviewer's model/effort to the worker for the addendum
header; README's inventory line and CLAUDE.md's opening now name the hook
and its one marker instead of denying state exists; the Mode enumeration
gained `quick — in-session (/flow:quick)`. Pre-existing, handed to the
epic's retro: a marked session can still implement in-session through
`/flow:quick` — whether quick deliberately opts out of the fresh-context
doctrine or routes through a worker is a retro decision, and its answer
belongs in the quick skill's text with its reason. Re-verified after
fixes: guard suite 10 pass 0 fail; tickets suite 24 pass 0 fail; doctor
exit 0. Nothing else deferred.

**Addendum — 2026-08-08 — acceptance criterion 1's live check, from Q-6's
run:** Q-6 — the first of the retro's queue — ran via `/flow:ticket Q-6` in
supervisor mode, as this entry's Owed line (as corrected by the retro)
required. Evidence, from the worker's side of the arrangement: the Q-6
status entry's Mode line in `epics/quick/status.md` names the worker
(`supervisor — worker worker:Q-6, reviewer hired by the supervisor`); the
supervisor's spawn prompt scoped the supervisor to resolve-and-spawn and
forbade it any branch or file edits; every commit in Q-6's range on branch
`q-6` was authored inside the worker's fresh context. The
supervisor-transcript half of the check (no implementation edits by the
invoking session) is attested by that structure and is confirmable by the
human reading the supervisor's transcript. Criterion 2 — the
interactive-twice refusal with hooks actually loaded — remains open on its
recorded human action, per the retro's addendum.

## Retro — 2026-08-08

**Outcome: achieved, one recorded deviation.** The guinea-pig epic
`board-ux` ran sign-off → release PR in ~40 minutes: 3/3 tickets
`integrated` (PRs #9/#10/#11, each 0 comments, 0 reviews), `origin/main`
unmoved during the run, release PR #12 opened by the driver and merged by
the human (`9da46a4`). Reviewers caught one Important finding and several
nits unattended. The mid-run reviewer-model directive is dispositioned in
this epic's tickets.md (AUTO-4's amended criterion). The reversal condition
— routine stalls, or release pull requests the human rejects — did not
fire; one run is one data point, to be reassessed at the next autonomous
epic's retro.

**Lessons shipped as rules (all via Q-5, this section's carrier):**

- Cross-document doctrine drift appeared in four of five reviews (AUTO-1's
  step 9 contradiction, AUTO-2's step 3 recreating it, AUTO-3's CLAUDE.md
  merge undercount, AUTO-5's README/CLAUDE.md denying the hook's state) →
  CLAUDE.md invariant: a rule stated in more than one document is one rule.
- Gates at the wrong door appeared in three tickets (AUTO-1's silent
  mode-label near-misses, AUTO-3's refusal living in `find`/`doctor` while
  the driver ran `list` plus the BLOCKED-resume hole, AUTO-5's guard
  blocking its own advertised recovery) → CLAUDE.md invariant: a gate is
  verified at the door its actor walks through, with a recovery that works.
- The run-day 403 waiver (branch protection assumed at planning, found
  unavailable on the free plan minutes before run start) → epic skill: an
  autonomous plan probes its environment prerequisites at plan time.
- AUTO-5's owed check handed to a lane that never reaches the step it
  verifies → ticket skill: an Owed line names a carrier that can
  structurally reach the check.
- "The external record shows zero interventions" was unfalsifiable from the
  day it was written — every actor acts under the human's GitHub identity →
  epic skill Outcome template + METHODOLOGY: evidence names an observer
  that can distinguish the outcomes.

**Owed work dispositioned — all ticketed, none declined.** The four items
from AUTO-4: configurable reviewer model → Q-7; unfiltered `list`'s false
"no epics found" → Q-8; plain `find`'s `pr [object Object]` → Q-9; the run
skill's undocumented 403 and the waiver path → Q-10. Retro-gate decisions:
`/flow:quick` routes through the ticket loop's lane fork (user decision;
closes the marked-session hole AUTO-5's review handed here) → Q-6. New
user requests at the gate: per-ticket token accounting → Q-11;
fresh-context retro → Q-12. AUTO-5's two owed live checks: criterion 1
rides the first of Q-6–Q-12 run via `/flow:ticket` in supervisor mode;
criterion 2 is a throwaway `--interactive` invocation in a fresh
post-merge session — both results land as dated addenda to AUTO-5's entry.

**Rediscovered twice, now documented once.** The GitHub protection
endpoints' behaviour (404→rulesets in AUTO-3's review, free-plan 403 in
AUTO-4's run) goes to the run skill with Q-10; the serial-first-ticket
PR-base rule's second discovery (AUTO-1 found it, AUTO-2 recreated it) is
the doctrine-drift invariant's founding case.

**What planning got right is recorded too:** both mid-epic re-plans (fresh
subagents and branch protection at AUTO-1's sign-off; AUTO-5 added after
AUTO-2) were dated, recorded amendments — the gates worked as designed and
nothing here changes them.

**Addendum — 2026-08-08 (from Q-5's review, opus/high):** Two corrections to
the section above, as an addendum since the log is append-only. (1) "All
ticketed, none declined" overclaimed: AUTO-5's criterion-2 live check — the
interactive-twice refusal with hooks actually loaded — is not a ticket and
can never be one: the guard fires on UserPromptSubmit, which no spawned
agent triggers, so only a human typing in a fresh session can perform it.
Correct claim: six owed items ticketed (Q-6–Q-12 minus none — Q-6 through
Q-12 all stand), one check riding a recorded human action; it stays open
until its result lands as a dated addendum to AUTO-5's entry. (2) The owed
sweep missed AUTO-1's Owed line, whose "proposed Q-6" pointer now
dangerously resolves to an unrelated ticket: AUTO-1's owed wording fix was
in fact inherited and landed by AUTO-2 (its Built paragraph records the
step 9 fix), and the "Q-6" it proposed was never created — today's Q-6 in
epics/quick reuses the number by coincidence. Closed here.
