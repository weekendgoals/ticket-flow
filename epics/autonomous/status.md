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
