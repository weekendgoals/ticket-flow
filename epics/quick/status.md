# Quick epic — status log

Append-only record of finished tickets. Tickets: `epics/quick/tickets.md`.

**Rules.** Append only. Corrections are new dated addenda beneath the entry they
correct, never edits. Report counts, not adjectives. The **Owed** line is
required even when empty.

### Q-1 — root CLAUDE.md — 2026-08-07 — DONE

**Built:** `CLAUDE.md` at the repository root: what the repo is (a plugin
marketplace with the single `flow` plugin), the exact test / smoke / syntax
commands with expected output, and seven invariants — zero-dependency script,
shared heading regexes coupled to doctor's near-miss checks, the ticket-ID and
commit-subject conventions, skill self-sufficiency vs METHODOLOGY.md,
version+CHANGELOG discipline for behaviour changes, reviewers never fix, and
every documented constraint carrying its reason.

**Files touched:** `CLAUDE.md` (new), `epics/quick/tickets.md` (new, Q-1 plan),
`epics/quick/status.md` (new, this file). Branch `q-1`, cut from `origin/main`.

**Verified:** `node --test plugins/flow/scripts/tickets.test.mjs` — 9 tests,
9 pass, 0 fail. `node plugins/flow/scripts/tickets.mjs doctor` — exits 0,
reports `✓ root agent instructions: CLAUDE.md`; its one remaining warning was
this file not existing yet, resolved by this commit.

**Decisions:** Test expectation written as "every test passing, count grows"
rather than pinning 9, so the file does not go stale on the next test added.
No plugin version bump — a repo-level doc changes no installed behaviour,
per this ticket's Not in scope.

**Owed:** Nothing.

**Addendum — review — 2026-08-07 — fable/medium:** No Important findings, no
nits; approved as-is. Both acceptance criteria re-run by the reviewer: 9/9
tests, doctor exit 0 with CLAUDE.md ✓. Every factual claim in CLAUDE.md traced
to source (regexes, shipped detection, the three files carrying heading
templates, zero-dependency and no-CI claims, version 1.4.0 = CHANGELOG head).
One pre-existing finding: `METHODOLOGY.md:3` still says "the four skills" of
what are now seven — handed to **Q-2**, added to this epic's ticket doc.
Nothing deferred from this ticket. The plugin's own reviewer agent was not
loadable in the working session, so the reviewer ran as a general agent
instructed by `agents/ticket-reviewer.md` + the review skill — same fresh
context, same rules.

### Q-3 — adopt the external review's shortlist — 2026-08-08 — DONE

**Built:** Plugin v1.5.0, four changes from the 2026-08-07 external
methodology review. (1) `skills/quick`: six risk triggers (auth boundaries,
secrets/crypto, migrations/data rewrites, new network exposure, payments,
fail-open) route work to `/flow:epic` at any size. (2) `skills/epic`: the
tickets.md template opens with a falsifiable **Outcome** block — problem,
observable change, evidence, reversal condition — and the integration-mode
text challenges "cannot ship alone" with expand/contract and flags.
(3) `agents/plan-reviewer`: two new findings — an outcome that cannot fail,
and integration mode chosen to avoid shippability design. (4) `skills/retro`:
fifth mining question checks the Outcome evidence (achieved / not achieved /
not yet assessable). METHODOLOGY.md gained the philosophy's name
(evidence-driven development under disposable context), the admission test,
and reasoning sections for the risk gate and the outcome line. CHANGELOG and
README updated.

**Files touched:** `plugins/flow/skills/quick/SKILL.md`,
`plugins/flow/skills/epic/SKILL.md`, `plugins/flow/skills/retro/SKILL.md`,
`plugins/flow/agents/plan-reviewer.md`,
`plugins/flow/.claude-plugin/plugin.json`, `METHODOLOGY.md`, `CHANGELOG.md`,
`README.md`, `epics/quick/tickets.md` (Q-3 plan), this file. Branch `q-3`,
cut from `origin/main` at the PR #1 merge commit.

**Verified:** `node --test plugins/flow/scripts/tickets.test.mjs` — 9 tests,
9 pass, 0 fail. `node plugins/flow/scripts/tickets.mjs doctor` — exit 0, all
five checks ✓. `plugin.json` version 1.5.0 equals the top CHANGELOG entry.

**Decisions:** The review's other proposals (standalone principles document,
per-ticket risk matrix, canary/shadow/kill-switch toolkit, production
observation artifacts) were rejected under the admission test as ceremony at
this project's scale — reasoning recorded in METHODOLOGY.md's admission-test
section so it is not re-argued later. Outcome checking was placed in retro
rather than any post-merge step, preserving "no command after the merge".
Older epics without an Outcome line are explicitly not retrofitted.

**Owed:** Nothing.

**Addendum — review — 2026-08-08 — fable/high:** Two nits, no Important
findings; approvable as-is. Both fixed in a review-fix commit. (1) Confirmed:
METHODOLOGY's new risk-gate section misquoted the ticket skill's xhigh list
(omitted network exposure) and falsely called the quick triggers "the same
list" — reworded to "a superset", and the substantive question (should the
ticket skill's xhigh tier inherit payments and data rewrites?) handed to
**Q-4**, added to the ticket doc. (2) Plausible, accepted: the admission test
was a binding rule living only in the reasoning-only document, unreachable by
the future sessions it gates — a pointer invariant added to CLAUDE.md.
Reviewer independently re-ran all three acceptance criteria (9/9, doctor 0,
1.5.0 = CHANGELOG head) and confirmed scope discipline incl. Q-2's line
untouched. Nothing deferred beyond Q-4.

### Q-2 — METHODOLOGY.md says "four skills"; there are seven — 2026-08-08 — DONE

**Built:** `METHODOLOGY.md` header now says the rules live "in the skills",
with no count — the number was dropped rather than corrected to seven, so the
line cannot go stale when the next skill is added. One line changed; nothing
else in the document touched, per Not in scope.

**Files touched:** `METHODOLOGY.md` (one line), this file. Branch `q-2`, cut
from `origin/main` after PR #2 merged.

**Verified:** `grep -n "four skills" METHODOLOGY.md` — no matches (exit 1).
Standing checks: `node --test plugins/flow/scripts/tickets.test.mjs` — 9 pass,
0 fail; `node plugins/flow/scripts/tickets.mjs doctor` — exit 0. No plugin
version bump: docs-only, no behaviour change.

**Decisions:** Chose "drop the number" over "fix the count" — the ticket
offered both; a count is a hand-maintained mirror of the skills directory and
would drift again (it already had, from four to seven, unnoticed until Q-1's
review).

**Owed:** Nothing.

**Addendum — review — 2026-08-08 — fable/medium:** No findings; approved
as-is. Reviewer independently re-ran the acceptance criterion (grep exit 1)
and standing checks (9/9 tests, doctor 0), confirmed the range touches only
the header sentence and this log, and that no version bump is correct for a
docs-only change. It also swept for other stale counts: `README.md:7`
("Seven skills, two reviewer agents") is accurate today but is the same
hand-maintained-mirror shape — noted here as an observation, not a defect;
whoever next changes the skill roster should prefer dropping that count too.
Nothing fixed, nothing deferred.

### Q-4 — ticket skill's xhigh tier inherits payments and data rewrites — 2026-08-08 — DONE

**Built:** Plugin v1.6.0. The decision the ticket asked for, made and
recorded: the two risk lists are now aligned. `skills/ticket` step 7's
`xhigh` tier adds "anything that deletes or rewrites data" and "payments or
billing", with a sentence naming the coupling to the quick path's entry
triggers. METHODOLOGY.md's risk-gate section replaces "deliberately not
mirrored, Q-4's question" with the resolved rule: the two skills each carry
the list where it is executed, and when one learns a trigger the other
inherits it in the same commit. Also planned **Q-5** into the ticket doc: the
board prints `/ticket <ID>` but the installed command is `/flow:ticket <ID>`
— found live by the user following the board's own suggestion.

**Files touched:** `plugins/flow/skills/ticket/SKILL.md`, `METHODOLOGY.md`,
`plugins/flow/.claude-plugin/plugin.json`, `CHANGELOG.md`,
`epics/quick/tickets.md` (Q-5 plan), this file. Branch `q-4`, cut from
`origin/main` after PR #3 merged.

**Verified:** `grep -n "payment" plugins/flow/skills/ticket/SKILL.md
METHODOLOGY.md` — both hits present (SKILL.md:172, METHODOLOGY.md:237), lists
match. Standing checks: 9/9 tests, 0 fail; doctor exit 0; plugin.json 1.6.0
equals top CHANGELOG entry.

**Decisions:** Chose "align" over "explain the difference" — both lists
measure consequence, one at the entry gate and one at review; a payment
change routed to an epic for being consequential but reviewed at `high` was
incoherent. The alternative (documented divergence) would have preserved a
distinction with no reason behind it. Coupling rule written into both the
skill and METHODOLOGY so the lists cannot silently diverge again.

**Owed:** Nothing.

**Addendum — review — 2026-08-08 — fable/high:** One Important (confirmed),
one nit (confirmed); both fixed in the review-fix commit. Important: the
same-commit inheritance rule lived only in METHODOLOGY.md — the document
CLAUDE.md declares rules-free — and the quick skill, the door where the last
divergence actually started, carried no cue at all. Fixed by putting the rule
where it executes: in the quick skill beside its triggers, in the ticket
skill beside its tier, and as a CLAUDE.md invariant (the heading-regex
coupling precedent). Correction to this entry's Decisions line: as originally
committed, the mechanism was one-directional and "cannot silently diverge
again" overstated it; true only as of the review fix. Nit: METHODOLOGY's
risk-gate paragraph still enumerated the tier list, a stale third copy —
fixed by removing the enumeration entirely and saying why it is absent. The
reviewer confirmed the two lists match item for item (the Q-3 error class was
not repeated), acceptance criterion and standing checks re-run and green,
scope clean, Q-5 addition is plan-only. Nothing deferred.

### Q-5 — ship the autonomous epic's retro — 2026-08-08 — DONE

**Built:** Plugin v1.14.0 — the autonomous epic's retro, shipped as
documents. `epics/autonomous/status.md` gains its `## Retro — 2026-08-08`
section: outcome achieved with one recorded deviation, five lessons with
their destinations, all owed work dispositioned. Root `CLAUDE.md` gains two
invariants distilled from the epic's five reviews: a rule stated in more
than one document is one rule (drift appeared in four of five reviews), and
a gate is verified at the door its actor walks through (three tickets
shipped checks a sibling command ran, or recoveries the rule itself
blocked). `skills/epic`: declaring `Run mode: autonomous` obligates probing
environment prerequisites at plan time (the first live run hit an unprobed
free-plan 403 minutes before start), and the Outcome template requires the
evidence line to name an observer that can distinguish the outcomes.
`skills/ticket`: the Owed line requires a structurally capable carrier.
METHODOLOGY.md § "Why the human gate can move to the release pull request"
records the observer lesson. The retro's owed-work queue lands as Q-6–Q-12
in `epics/quick/tickets.md`: quick routes through the lane fork (Q-6, retro
gate decision), configurable reviewer model (Q-7), list's false "no epics
found" (Q-8), find's `pr [object Object]` (Q-9), the run skill's 403 +
waiver path (Q-10), token accounting (Q-11, user request), fresh-context
retro (Q-12, user request).

**Mode:** quick — in-session (/flow:quick).

**Files touched:** `epics/autonomous/status.md`, `epics/quick/tickets.md`
(Q-5 plan + Q-6–Q-12 queue), `CLAUDE.md`,
`plugins/flow/skills/epic/SKILL.md`, `plugins/flow/skills/ticket/SKILL.md`,
`METHODOLOGY.md`, `plugins/flow/.claude-plugin/plugin.json`,
`CHANGELOG.md`, this file. Branch `q-5`, cut from `origin/main`.

**Verified:** `node --test plugins/flow/scripts/tickets.test.mjs` — 24
tests, 24 pass, 0 fail. `node --test
plugins/flow/hooks/ticket-session-guard.test.mjs` — 10 tests, 10 pass, 0
fail. `node --check plugins/flow/scripts/tickets.mjs` clean. `doctor` exit
0, all five checks ✓. `plugin.json` 1.14.0 equals top CHANGELOG entry.
`grep -c "## Retro — 2026-08-08" epics/autonomous/status.md` — 1.

**Decisions:** (1) The retro's status-log section is `## Retro` (h2), per
the retro skill — it collides with no parsed heading (those need an
ID-shaped token). (2) All seven owed items became tickets; none declined —
the user chose "ticket all three" for the review-found defects at the retro
gate. (3) The quick-lane question was decided at the gate for routing
through the ticket loop's step 0 (Q-6), over guard-only or a documented
opt-out: quick's savings are planning ceremony, not execution hygiene. (4)
The observer rule was written into the epic skill's Outcome template, not
just METHODOLOGY — skills are self-sufficient, and the template is where an
outcome is written. (5) Q-5 itself ran in-session through /flow:quick, the
sanctioned lane as of v1.13.0; Q-6 is what changes that lane, and running
it here would have been scope creep.

**Owed:** AUTO-5's two live checks, unchanged owners: criterion 1 rides the
first of Q-6–Q-12 run via `/flow:ticket` in supervisor mode; criterion 2 is
a throwaway `--interactive` in a fresh post-merge session. Both land as
addenda to AUTO-5's entry in `epics/autonomous/status.md`, not here.

**Addendum — review — 2026-08-08 — opus/high:** One Important, five nits,
two more withheld as below-bar; the Important and all five nits fixed in
the review-fix commit. Important: the retro section's "all ticketed, none
declined" contradicted its own last sentence — AUTO-5's criterion-2 live
check is a human action (the guard fires on UserPromptSubmit, which no
spawned agent triggers) and exists on no board; corrected by a dated
addendum beneath the retro section, since that log is append-only: six
items ticketed, one check open on a recorded human action. Nits fixed:
(1) Q-6's scope now states which steps the routed quick lane keeps (quick's
own 1–3) and what the worker executes (ticket steps 4–6 via a scoped spawn
prompt), resolving the who-branches ambiguity; (2) README's
autonomous-epics section now says the prerequisites are probed at plan
time — this range's own one-rule invariant, applied to this range's own
change; (3) the epic skill now names where the probe result is recorded
(prose on the Run mode line or under the ground rules, never a mode-shaped
preamble line, which doctor's near-miss scan would flag — the reviewer
verified both parse outcomes against the regexes empirically); (4) AUTO-1's
stale "proposed Q-6" Owed pointer — which now resolved to an unrelated
ticket coincidentally reusing the number — dispositioned in the same
status-log addendum: inherited and landed by AUTO-2; (5) the epic skill no
longer claims probe commands exist for the permission surface — the run
skill enumerates that list; only branch protection has probe commands. Also
adopted from the withheld pair: "minutes before start" corrected to seconds
in the epic skill, README and CHANGELOG (the waiver commit landed 19
seconds before run start — the record's number, not a softer one). The
"both mid-epic re-plans" phrasing stands: it counts plan-content re-plans,
and AUTO-4's waiver is separately recorded as a criterion amendment.
Reviewer re-ran all three acceptance criteria and verified every retro
number against `gh` and `git` externally (PR bases, comment and review
counts, timestamps, the ~40-minute wall time, the drift and wrong-door
tallies), confirmed Q-6's carrier structurally reaches supervisor mode, and
confirmed all twelve quick tickets parse (`list`: 12 tickets, Q-6–Q-12
todo). Re-verified after fixes: tickets suite 24 pass 0 fail; guard suite
10 pass 0 fail; doctor exit 0; `node --check` clean. Nothing deferred
beyond the two live checks already in this entry's Owed line.

### Q-6 — /flow:quick routes through the ticket loop's lane fork — 2026-08-08 — DONE

**Built:** Plugin v1.15.0. `skills/quick` step 4 no longer enters the ticket
skill at step 4 in-session: after quick's own steps 1–3 (gate, ticket
written, `q-<n>` cut from the default branch, plan committed — the parts
that need the conversation), the session becomes the **supervisor** per the
ticket skill's step 0 — a fresh-context worker executes ticket steps 4–6 on
the existing branch, with steps 1–3 scoped out of its spawn prompt, and the
supervisor hires the reviewer. `--interactive` keeps the in-session lane at
the interactive ticket's price: the session guard
(`hooks/ticket-session-guard.mjs`) now matches `/flow:quick` as well as
`/flow:ticket` — a quick `--interactive` sets the same session marker, a
marked session is refused any later `--interactive` of either command, and
plain invocations of both still pass; the marker's lifecycle is untouched.
Guard suite grew 10 → 12 (quick `--interactive` marks / flagless quick does
not; cross-door refusals carry the verbatim message; plain quick passes in
a marked session). METHODOLOGY § "Why small work has a path" records the
retro decision — routing over a documented opt-out; quick's savings are
planning ceremony, never execution hygiene. README's quick row updated.
AUTO-5's owed live check (acceptance criterion 1) recorded as a dated
addendum beneath AUTO-5's entry in `epics/autonomous/status.md`.

**Mode:** supervisor — worker worker:Q-6, reviewer hired by the supervisor.

**Files touched:** `plugins/flow/skills/quick/SKILL.md`,
`plugins/flow/hooks/ticket-session-guard.mjs`,
`plugins/flow/hooks/ticket-session-guard.test.mjs`, `METHODOLOGY.md`,
`README.md`, `plugins/flow/.claude-plugin/plugin.json`, `CHANGELOG.md`,
`epics/autonomous/status.md`, this file. Branch `q-6`, cut from
`origin/main` (9e1dbd2, PR #15's merge commit).

**Verified:** `node --test plugins/flow/scripts/tickets.test.mjs` — 24
pass, 0 fail. `node --test plugins/flow/hooks/ticket-session-guard.test.mjs`
— 12 pass, 0 fail. `node --check` clean on both `tickets.mjs` and the hook.
`doctor` exit 0, all five checks ✓. Acceptance: `grep -n "step 0"
plugins/flow/skills/quick/SKILL.md` — 3 hits; `grep -n "from step 4"` on the
same file — no matches (exit 1), so the in-session default is gone.
`plugin.json` 1.15.0 equals the top CHANGELOG entry.

**Decisions:** (1) The scope's "`--interactive` … marks the session like
any interactive ticket" is a behavioural claim only the hook can make true —
it is the sole marking mechanism, and it matched `/flow:ticket` only — so
the guard's prompt match was extended to `/flow:quick`. Read against Not in
scope: "the guard's marker semantics" protects the marker's lifecycle (set
at invocation, wiped on clear/startup, survives resume/compact, keyed by
session id), which is untouched; this change is trigger surface only.
(2) The refusal message is unchanged even though it names `/flow:ticket
without --interactive` as the recovery: the ticket skill's step 0 quotes
that message verbatim and step 0 is out of scope, and both named recoveries
(supervisor mode, `/clear`) work from the quick door too — the quick skill's
own text says dropping the flag is the supervisor lane. (3) The ticket
skill's step 6 Mode enumeration keeps `quick — in-session (/flow:quick)`
unchanged: after this change the only in-session quick run is an
`--interactive` one, so the label still names exactly one lane. (4) The
implementation commit was amended pre-review to drop an auto-added Claude
co-author trailer, per the ticket skill's rule; step 8's no-amendment rule
binds after a review has run, and none had.

**Owed:** Nothing. (AUTO-5's criterion-2 live check stays open on its
recorded human action in `epics/autonomous/status.md` — a human typing
`--interactive` twice in a fresh session; per Q-5's review it structurally
cannot ride any ticket, so it is not carried here.)

**Addendum — review — 2026-08-08 — opus/high:** Two Important, four nits,
one pre-existing; both Importants and all four nits fixed in the review-fix
commit (3a5c50a). Important (1): the routed worker's spawn prompt scoped
ticket steps 1–3 out wholesale, deleting step 2's reading obligation and
its stop-on-contradiction rule — the only lane that handed an empty worker
an implement instruction with the reading removed. Fixed in-range: the
quick skill now scopes out steps 1 and 3 only and says step 2 stays in the
worker's prompt; the ticket text's "steps 1–3 scoped out" shorthand was
read against its own stated rationale (ticket written, branch exists),
which never covered step 2. Important (2): the guard now fires at the
quick door, where the refusal's named recovery ("run /flow:ticket without
--interactive") is not performable — no ticket ID exists yet — and the
ticket skill's step 0 quotes the message verbatim, outside Q-6's scope.
Disposition: fixed under a dated re-plan note appended to Q-6's section in
tickets.md (AUTO-5 precedent) — chosen over a hook-only fix, which would
leave the two documents disagreeing against the one-rule invariant, and
over a hand-off ticket, which would knowingly ship a broken advertised
recovery at a live door. The message is now door-agnostic ("rerun the
command without --interactive"), changed in the hook, the test's verbatim
assertion, and step 0's quote in one commit; step 0's rule sentence now
names both doors. Nits fixed: (1) two mutation-survivable regex gaps
closed with discriminating payloads — `/flow:tickets --interactive` in a
marked session pins the `\b` boundary, a mid-sentence mention pins the
`^\s*` anchor; guard suite 12 → 13. (2) The mid-prose flag match
(`/flow:quick add a --interactive flag …` marks the session) pinned as
deliberate, with a test and a comment in the hook: quick's arguments are
free prose, the skill reads the same ambiguous prompt, and the guard errs
toward marking — a false positive costs one slot recoverable by `/clear`,
a false negative silently defeats the fresh-context rule. (3) The
"refused … toward supervisor mode or /clear" sentence reworded so the
recoveries cannot parse as among the refused. (4) The spawn prompt now
hands the worker absolute `ticketsDoc`/`statusDoc`/`repoRoot` from the
supervisor's own step-1 `find` — the worker's cwd moves during
verification and relative paths break there. Pre-existing, handed to
**Q-13** (added to this epic's ticket doc): "the standard append-only
preamble" is referenced by the quick and ticket skills but defined only in
the epic skill's template. Reviewer confirmed clean: all three acceptance
criteria re-run (12/12 guard pre-fix, 24/24 tickets, doctor 0, greps as
specified), the AUTO-5 criterion-1 addendum correctly hedged, the
trigger-surface-not-marker-semantics scope reading, fail-open behaviour
preserved, version/CHANGELOG discipline, no step-0 leakage in the range.
Re-verified after fixes: guard suite 13 pass 0 fail; tickets suite 24 pass
0 fail; `node --check` clean on the hook; doctor exit 0; `list` parses all
13 quick tickets including Q-13. Nothing deferred beyond Q-13.

### Q-7 — configurable reviewer model — 2026-08-08 — DONE

**Built:** Plugin v1.16.0. The reviewer's model is now configuration instead
of fixed skill text. An epic may carry an optional `Reviewer model: <model>`
line in its tickets.md preamble; `tickets.mjs` parses it in `parseModes`
alongside the mode lines — same tolerant parse: label case-insensitive at
line start, value is the first token after the colon, prose after it ignored
— and exposes it as `reviewerModel` in `find --json` and `list --json`
(inside each epic's `modes` entry), null when the line is absent. The value
charset admits digits, dots, hyphens and underscores so a real model
identifier (`claude-opus-4.5`) survives whole; the value is lowercased like
the modes. `doctor`'s preamble near-miss scan now also flags a
reviewer-model-shaped line the strict parse rejects (e.g. bolded
`**Reviewer model:**`), which would otherwise silently read as absent and
fall back to the default model. The ticket skill's step 7 passes the epic's
`reviewerModel` when spawning the reviewer and keeps the unchanged default
when null: the strongest model available (`opus` at the time of writing).
The run skill states the same rule in step 4c, where its workers spawn their
reviewers. README documents the line under "Why the reviewers are separate
agents". Tests cover present-with-prose (gamma fixture), absent (alpha ->
null), plain + case-insensitive label + dotted value (staffed fixture), and
the near-miss doctor warning (fancy fixture): tickets suite 24 -> 26.

**Mode:** supervisor — worker worker-q7-fresh, reviewer hired by the supervisor.

**Files touched:** `plugins/flow/scripts/tickets.mjs`,
`plugins/flow/scripts/tickets.test.mjs`,
`plugins/flow/skills/ticket/SKILL.md`, `plugins/flow/skills/run/SKILL.md`,
`README.md`, `plugins/flow/.claude-plugin/plugin.json`, `CHANGELOG.md`, this
file. Branch `q-7`, cut from `origin/main` (a0b0236, PR #16's merge commit).

**Verified:** `node --test plugins/flow/scripts/tickets.test.mjs` — 26 pass,
0 fail. `node --test plugins/flow/hooks/ticket-session-guard.test.mjs` — 13
pass, 0 fail. `node --check plugins/flow/scripts/tickets.mjs` clean.
`node plugins/flow/scripts/tickets.mjs doctor` — exit 0, all five checks ✓.
Acceptance: parser tests for present / absent / prose-decorated lines pass
inside the suite (fixtures above); live `find Q-7 --json` returns
`"reviewerModel": null` (this epic has no line) and `list --json` carries
`reviewerModel` in every `modes` entry; `grep -n "Reviewer model"
plugins/flow/skills/ticket/SKILL.md` — hit at step 7 (line 245).
`plugin.json` 1.16.0 equals the top CHANGELOG entry.

**Decisions:** (1) "Same tolerant parse" was read as the parse's tolerance
properties — case-insensitive label at line start, first token wins, trailing
prose ignored, preamble only — not the modes' exact `[A-Za-z-]+` value
charset, which would truncate `claude-opus-4.5` at the digit; the wider
charset is scoped to this one label. (2) The value is lowercased like the
mode values for uniformity; known model identifiers are lowercase. (3)
doctor's near-miss scan was extended to the new line even though the scope
did not name doctor: the scan exists precisely so a formatted preamble
config line cannot silently read as absent, and shipping a third parsed line
invisible to it would recreate the failure class the scan guards. (4) The
script exposes null when the line is absent rather than any default — the
"strongest available" fallback stays in the skills, per Not in scope
(default unchanged) and the script's stores-nothing/decides-nothing shape.
(5) The run skill's statement lives in step 4c beside "spawning its own
reviewer" — the door where a run's reviewers are actually hired is ticket
step 7 executed by the worker, so the run skill defers to it by name rather
than restating the mechanics (one rule, two documents kept in agreement in
one commit). (6) The epic skill's preamble template was left untouched: the
scope names the parser, the exposure, and the two spawning skills; the line
is optional configuration documented in README, not planning ceremony the
template should prompt for.

**Owed:** Nothing.

**Addendum — review — 2026-08-08 — opus/high:** Two Important, two nits, one
pre-existing; both Importants and one nit fixed in the review-fix commit
(e1f8823), one nit handed with the pre-existing class to a new ticket.
Important (1): README's new paragraph sat in a section covering both
reviewer agents and said an epic "can pin a different one", but the epic
skill spawns the plan reviewer on the strongest model unconditionally — a
one-rule violation between README and the skills. Fixed by narrowing the
claim, the direction Q-7's scope supports (it names the ticket and run
skills only): the line governs the ticket reviewer; the plan reviewer is
judging the very draft the line lives in, and configuration binds only
after sign-off — reason now stated in README and the CHANGELOG entry. No
skill behaviour changed by the fix, so 1.16.0 stands. Important (2):
doctor's strict-parse extension had zero test pressure on its accepting
branch — the reviewer mutation-verified that deleting the Reviewer model
alternative from modeStrict left the suite green while every well-formed
line warned. Fixed with a doctor-silence test over gamma's three
well-formed preamble lines; the mutation was re-applied to confirm the
test kills it (26 pass 1 fail under the mutant), suite 26 -> 27. Nit
fixed: ticket skill step 1 now names `reviewerModel` among `find --json`'s
returns, which step 7 already referenced. Nit not fixed here, with the
pre-existing finding: the shared preamble parse's `\s*` matches newlines,
so a value-less label line scavenges the first word of the next paragraph
(reviewer verified a bare `Run mode:` reading `autonomous` out of prose
that rejects it), and doctor's warning misdescribes that failure. The mode
lines predate this ticket; Q-7 added a third label to the one shared
`grab` rather than forking it into two parse behaviours mid-ticket, so
the whole class — all three labels, the doctor wording, value-less-line
tests — is handed to **Q-14**, opened in this epic's ticket doc in the
same commit (Q-6/Q-13 precedent). Also confirmed sound by the reviewer:
scope holds (default unchanged, no per-ticket override, effort tiers
untouched; the doctor extension judged defended, not creep), the widened
charset genuinely tested, run skill step 4c accurate, 1.16.0 = CHANGELOG
head, and quick has no third reviewer door. Re-verified after fixes:
tickets suite 27 pass 0 fail; guard suite 13 pass 0 fail; `node --check`
clean; doctor exit 0; `list` parses all 14 quick tickets including Q-14.
Nothing deferred beyond Q-14.

### Q-8 — unfiltered list claims "no epics found" when epics exist — 2026-08-09 — DONE

**Built:** Plugin v1.17.0. The unfiltered board no longer reports existing
work as nonexistent. `printBoard`'s empty-board branch in `tickets.mjs` used
one message for two different facts: with no epic filter, epic folders that
exist but have no `## <ID> — …` ticket sections yet printed `no epics found
under epics/` — even though the comment directly above that line already
acknowledged the "real, existing epics with no ticket sections yet" case
(BOARD-2's review, pre-existing). The branch now distinguishes three cases:
a filtered empty epic keeps `epic "<name>" has no tickets yet` (unchanged);
genuinely no epics keeps `no epics found under epics/`; and existing
ticketless epics are each named on their own line with their empty state
(`<epic> — no tickets yet`, styled like the board's epic header). New test
builds a dedicated throwaway repo — the shared fixture always has tickets —
asserting the epic is named, its empty state is named, "no epics found"
does not appear, and a repo with no `epics/` at all keeps the old honest
answer. Tickets suite 27 → 28. CHANGELOG entry for 1.17.0.

**Mode:** supervisor — worker worker-q8, reviewer hired by the supervisor.

**Files touched:** `plugins/flow/scripts/tickets.mjs`,
`plugins/flow/scripts/tickets.test.mjs`,
`plugins/flow/.claude-plugin/plugin.json`, `CHANGELOG.md`, this file.
Branch `q-8`, cut from `origin/main` (7fa8a3e, PR #17's merge commit).

**Verified:** `node --test plugins/flow/scripts/tickets.test.mjs` — 28
tests, 28 pass, 0 fail (the new test among them). `node --test
plugins/flow/hooks/ticket-session-guard.test.mjs` — 13 pass, 0 fail.
`node --check plugins/flow/scripts/tickets.mjs` clean.
`node plugins/flow/scripts/tickets.mjs doctor` — exit 0, all five checks ✓.
Live smoke: unfiltered `list` on this repo still renders the board.
`plugin.json` 1.17.0 equals the top CHANGELOG entry.

**Decisions:** (1) The mixed board — some epics with tickets, some without —
is untouched: the ticket scopes the all-empty unfiltered case, and "any
other change to list output" is Not in scope, so `printBoard`'s per-epic
loop still skips ticketless epics when any tickets exist. (2) The `epics`
subcommand's own `no epics found under epics/` line is untouched — there it
is only printed when no epics exist, which is true. (3) Version bumped
minor (1.17.0) matching every prior entry's convention; script output is
installed behaviour, so the bump and CHANGELOG entry ride the same commit.
(4) The implementation commit was amended pre-review to drop an auto-added
Claude co-author trailer, per the ticket skill's rule and Q-6's precedent;
step 8's no-amendment rule binds only after a review has run.

**Owed:** Nothing.

**Addendum — review — 2026-08-09 — opus/high:** One nit (confirmed), one
pre-existing; no Important findings. Nit fixed in the review-fix commit
(3464ab9): the new test matched `/hollow/` and `/no tickets yet/` as two
independent patterns instead of pinning the composed line — the filtered
branch's message (`epic "hollow" has no tickets yet`) contains both
fragments, so a future change emitting that wrong message from the
unfiltered branch would have passed all three assertions. Now pinned as
`/^hollow — no tickets yet$/m`, the file's convention (the sibling BOARD-2
test pins its exact string); the reviewer had verified by mutation that the
original test did catch the actual regression, so the exposure was narrow.
Re-run after the fix: tickets suite 28 pass, 0 fail; doctor exit 0.
Pre-existing, not fixed here, handed to **Q-15** (opened in this epic's
ticket doc in the same review-fix commit, Q-13/Q-14 precedent): the mixed
board still omits ticketless epics entirely — when at least one epic has
tickets, `printBoard`'s per-epic loop `continue`s past an epic with no
sections, so it never appears on the unfiltered board; same defect class as
Q-8 at larger blast radius, verified live by the reviewer with a
one-ticketed-plus-one-ticketless fixture, and out of this ticket's scope
("any other change to list output" is Not in scope). Also confirmed sound
by the reviewer: mutation check on the new test passed, both new branches
exercised live, scope respected, 1.17.0 = CHANGELOG head, suite 28/28,
doctor exit 0. Nothing deferred beyond Q-15.

### Q-9 — plain find prints "pr [object Object]" — 2026-08-09 — DONE

**Built:** Plugin v1.18.0. Plain `find <ID>` no longer stringifies the PR
object. The human-readable branch of `tickets.mjs`'s `find` interpolated
every fact raw — `pr` is the one non-scalar among them, so any ticket with a
pull request printed `pr [object Object]` (BOARD-3's review, pre-existing).
The line now renders what a human acts on: `#<number> (<STATE>) <url>`,
e.g. `pr  #18 (MERGED) https://github.com/weekendgoals/ticket-flow/pull/18`.
A ticket without a PR keeps printing `null`, and `find --json` is untouched
(it was already correct, per Not in scope). New test pins the composed
rendered line — `/^pr {21}#7 \(OPEN\) https:\/\/example\.invalid\/pull\/7$/m`
— by stubbing `gh` with a fake executable on PATH for that one run, because
the fixture's origin is a local bare repo where real `gh` always fails and
every ticket reads `pr: null`; the same test asserts `[object Object]`
appears nowhere and that the no-PR line still reads `null`. Tickets suite
28 → 29. CHANGELOG entry for 1.18.0.

**Mode:** supervisor — worker worker-q9, reviewer hired by the supervisor.

**Files touched:** `plugins/flow/scripts/tickets.mjs`,
`plugins/flow/scripts/tickets.test.mjs`,
`plugins/flow/.claude-plugin/plugin.json`, `CHANGELOG.md`, this file.
Branch `q-9`, cut from `origin/main` (76cfe3d, PR #18's merge commit).

**Verified:** `node --test plugins/flow/scripts/tickets.test.mjs` — 29
tests, 29 pass, 0 fail (the new test among them). `node --test
plugins/flow/hooks/ticket-session-guard.test.mjs` — 13 pass, 0 fail.
`node --check plugins/flow/scripts/tickets.mjs` clean.
`node plugins/flow/scripts/tickets.mjs doctor` — exit 0, all five checks ✓.
Live smoke on this repo: `find Q-8` prints `pr  #18 (MERGED) <url>`;
`find Q-9` prints `pr  null`. `plugin.json` 1.18.0 equals the top CHANGELOG
entry.

**Decisions:** (1) Only the `pr` value gets a renderer — every other fact is
already a scalar, and the null case keeps printing `null` like `contextDir`
and `runMode` do; inventing a friendlier absent-marker for one line would be
a wider output change than the ticket scopes ("Not in scope: any other
change"... the scope names only the PR rendering). (2) The rendered shape
follows `brief`'s existing `#<number> (<state>)` style and adds the URL the
ticket asks for; `isDraft` and `baseRefName` stay unrendered — number, state
and URL are what the scope names. (3) The test stubs `gh` on PATH rather
than exporting the formatter for unit testing — the suite's stated approach
is real throwaway repos over unit-tested internals, and the stub exercises
the full CLI path including `pullRequests()`. (4) The test pins the composed
line with its exact padding rather than fragments, per Q-8's review lesson.
(5) Version bumped minor (1.18.0): script output is installed behaviour.
(6) The implementation commit was amended pre-review to drop an auto-added
Claude co-author trailer, per the ticket skill's rule and Q-6/Q-8 precedent;
step 8's no-amendment rule binds only after a review has run.

**Owed:** Nothing.

**Addendum — review — 2026-08-09 — opus/high:** No findings — no Important
findings, no nits, no pre-existing defects. Nothing fixed, nothing deferred.
The reviewer confirmed the fix is correctly scoped to the one non-scalar
fact (`pr`), `find --json` untouched, and no caller reads plain `find`
output. Both mutation checks passed: reverting the render broke only the
new test, and dropping the PATH override (making the `gh` stub unreachable)
also broke only the new test — the stub is load-bearing. Acceptance
criteria re-verified independently by the reviewer: tickets suite 29 pass,
0 fail; doctor exit 0; guard suite 13 pass, 0 fail.

### Q-10 — the run skill's protection gate: document 403, honor a recorded waiver — 2026-08-09 — DONE

**Built:** Plugin v1.19.0. The run skill's branch-protection check (step 3)
no longer halts an unattended run on an environment shape it never named.
Previously it documented only success and the 404→rulesets fallthrough, but
a private repository under an organization on GitHub's free plan returns
**403 on both endpoints** (hit live by the first unattended run,
2026-08-08), and step 5's blanket rule — a nonzero exit from any command
the skill issues is a stop condition, nothing marked tolerated — made the
probe's own failure a halt with nobody present. Step 3 now: (1) names 403
from both endpoints as "protection is unavailable on this plan", the same
fact as unprotected stated by the platform; (2) marks the two `gh api`
probes as the skill's only tolerated nonzero exits — their failure statuses
are the data the check reads (404 routes to the rulesets endpoint, 403
names the plan), never themselves a stop condition; (3) defines where the
driver finds a pre-recorded human waiver, since an unattended run cannot
ask: the epic's `tickets.md` — prose on the `Run mode:` line or under the
ground rules (where the epic skill's plan-time probe records its result),
or an amended acceptance criterion, which is how AUTO-4's free-plan waiver
was recorded. Waiver found: proceed and name it in the run record; none:
report what the probes returned and stop before ticket one. Step 5's
"in this skill nothing is marked tolerated" became false with the step 3
change, so the clause now names the probe pair as the one tolerated
exception — one rule, both statements moved in the same commit. CHANGELOG
entry for 1.19.0.

**Mode:** supervisor — worker worker-q10, reviewer hired by the supervisor.

**Files touched:** `plugins/flow/skills/run/SKILL.md`,
`plugins/flow/.claude-plugin/plugin.json`, `CHANGELOG.md`, this file.
Branch `q-10`, cut from `origin/main` (b0f9b7b, PR #19's merge commit).

**Verified:** Acceptance: `grep -n "403"
plugins/flow/skills/run/SKILL.md` — 3 hits (steps 3 and 5); `grep -in
"waiver" plugins/flow/skills/run/SKILL.md` — 3 hits; `node
plugins/flow/scripts/tickets.mjs doctor` — exit 0, all five checks ✓.
Standing checks: `node --test plugins/flow/scripts/tickets.test.mjs` — 29
pass, 0 fail; `node --test
plugins/flow/hooks/ticket-session-guard.test.mjs` — 13 pass, 0 fail;
`node --check plugins/flow/scripts/tickets.mjs` clean. `plugin.json`
1.19.0 equals the top CHANGELOG entry.

**Decisions:** (1) Marking the probes tolerated required touching step 5,
which the scope did not name: the ticket's own motivation ("the probe's
nonzero exit is itself a stop condition") cannot be fixed by step 3 text
alone while step 5 still declares nothing tolerated — leaving it would
ship the exact two-documents-disagree drift the one-rule invariant exists
to stop, so both statements moved in one commit. (2) The waiver location
is stated to cover both shapes of absence — unprotected (empty rule lists)
and unavailable (403) — because the existing text already made missing
protection "the human's to waive" without saying where; defining the
location for only the 403 case would have left the older sentence
dangling. (3) The run-skill text names both places inside `tickets.md`
where a waiver legitimately lives — the epic skill's plan-time recording
spots (Run mode line / ground rules, per Q-5's template obligation) and an
amended acceptance criterion (AUTO-4's actual precedent, which predates
that obligation) — rather than inventing a single canonical spot the
existing record does not match. (4) No doctor check and no script change,
per Not in scope: protection is environment setup, and the waiver is prose
the driver reads, not a parsed line. (5) Version bumped minor (1.19.0):
skill text is installed behaviour.

**Owed:** Nothing.

**Addendum — review — 2026-08-09 — opus/xhigh:** Four Important, two nits,
one pre-existing; all four Importants and both nits fixed in the review-fix
commit (43755ab). Important (1): the waiver's location was defined as
exactly where the epic skill records the probe's *result*, so a recorded
finding ("403 on both endpoints") satisfied the waiver test word for word
with no human ever accepting the risk — and no skill instructed anyone to
write a waiver at all (the gate invariant inverted: a reader's side of a
handshake with no writer). Fixed on both sides: the run skill now defines a
waiver as a **recorded decision, never a recorded finding** — text showing
no human acceptance is no waiver, with AUTO-4's discriminating shape quoted
("waived <date>: … chose to run without the hard floor") — and the epic
skill's Run mode template gains the writer's side: probe finds protection
missing/unavailable → the human decides at sign-off, fix or waive, the
waiver written as a decision in the same tickets.md spots. Touching the
epic skill is justified by the "gate verified at the door its actor walks
through" invariant — the waiver's author is the planner at sign-off, so the
instruction lives in the planning skill; behaviour change already covered
by this ticket's 1.19.0 bump, entry text extended. Important (2): the cited
precedent was not at the location the rule named — the first live run
(board-ux) recorded its waiver in `epics/board-ux/status.md` and in
AUTO-4's criterion in a *different epic's* tickets.md, so the "amended
acceptance criterion, as the first live run did it" clause was false and
the rule as written would refuse the very run it cited. Fixed by dropping
the miscitation; the location rule stands as the epic's **own**
`tickets.md` — sign-off-gated and verified on the remote by step 2, the
fail-closed direction, where `status.md` is agent-appended unattended.
Accepted consequence, recorded deliberately: resuming `/flow:run board-ux`
today would stop at step 3 until a human copies the recorded waiver into
`epics/board-ux/tickets.md` — a one-line human action, and the correct
failure direction for a gate. Important (3): the tolerated-exit carve-out
was granted to the two *commands*, swallowing every other way `gh api`
fails (401, no network, 429, 5xx, wrong repo) — an unauthenticated `gh`
plus a waiver line would have started a run that dies at its first
`pr create`. Fixed: steps 3 and 5 now tolerate exactly a **404 or 403 from
the two probes**; any other probe failure halts as before. Important (4):
README's halt list still said "or any failing command" and its "Both must
exist" had never matched the skill's waivable protection (the pre-existing
finding, same paragraph pair) — the commit claimed a two-statement sweep
that was really three documents. Fixed: README names the one tolerated
exception and admits the protection waiver with its location. The
pre-existing half was fixed in-range rather than handed to a ticket, with
reason: it states the exact rule Q-10 changes, in the paragraph finding 4
already required editing — shipping a known-false sentence this commit's
own sweep touches would be the one-rule drift the invariant forbids, and
the reviewer recommended it ride finding 4's disposition. Nits fixed:
(1) the rulesets endpoint is now probed "on a 404 or a 403" — previously a
403 from the first endpoint gave no instruction to reach the second, so
the "403 from both endpoints" conclusion was unreachable as written;
(2) step 6's run-record template gains a **Protection:** slot and step 7's
release-PR body enumeration carries the waiver right under the never-squash
line — a run without the hard floor must say so at the only human gate
left. Re-verified after fixes: tickets suite 29 pass, 0 fail; guard suite
13 pass, 0 fail; `node --check plugins/flow/scripts/tickets.mjs` clean;
doctor exit 0, all five checks ✓; acceptance greps — "403" 5 hits,
"waiver" (case-insensitive) 7 hits in the run skill; plugin.json 1.19.0
equals the top CHANGELOG entry (entry text updated for the grown shape; no
second bump — same release, same behaviour-change family). Nothing
deferred.

### Q-11 — token accounting: a Tokens line per ticket, a sum per epic — 2026-08-09 — DONE

**Built:** Plugin v1.20.0. The status documents now carry token accounting,
on honest terms (user request at the autonomous retro, 2026-08-08).
`skills/ticket` step 6's entry template gains a **Tokens** line — what the
harness reports for the ticket's work, per agent where the agents are
separate; `unknown` is tolerated and honest when the harness exposes no
figure, estimating one is not; the number is planning evidence for future
sizing, never a gate — no step reads it to decide anything. Because the
entry is committed before the review runs (step 6's own rule), the
reviewer's figure cannot ride that line: step 8's addendum template now ends
with the reviewer's token figure on the same terms, and step 0's hand-back
passes the reviewer's token figure alongside model and effort — only the
hirer knows it. `skills/run` step 6's run-record template gains a **Tokens**
slot: per ticket, worker and reviewer, plus the run's total of the known
figures. `skills/retro` step 4's report sums the status log's **Tokens**
lines per epic, naming `unknown` entries rather than counting them as zero.
CHANGELOG entry for 1.20.0. Nothing is stored or parsed outside the status
documents — `tickets.mjs` untouched.

**Mode:** supervisor — worker worker-q11, reviewer hired by the supervisor.

**Tokens:** worker unknown — the harness exposes no usage figure to the
worker agent; the reviewer's figure follows in the review addendum, per the
template this ticket adds.

**Files touched:** `plugins/flow/skills/ticket/SKILL.md`,
`plugins/flow/skills/run/SKILL.md`, `plugins/flow/skills/retro/SKILL.md`,
`plugins/flow/.claude-plugin/plugin.json`, `CHANGELOG.md`, this file.
Branch `q-11`, cut from `origin/q-10` (462e076, Q-10's review-addendum
commit) — a deliberate stack, user-directed: Q-10's PR #20 was open and the
user chose to run the remaining tickets back to back, merging the pull
requests in sequence, rather than waiting on each merge.

**Verified:** Acceptance: `grep -l "Tokens"` across
`plugins/flow/skills/{ticket,run,retro}/SKILL.md` — all three files named,
exit 0. Standing checks: `node --test plugins/flow/scripts/tickets.test.mjs`
— 29 pass, 0 fail; `node --test
plugins/flow/hooks/ticket-session-guard.test.mjs` — 13 pass, 0 fail;
`node --check plugins/flow/scripts/tickets.mjs` clean;
`node plugins/flow/scripts/tickets.mjs doctor` — exit 0, all five checks ✓.
`plugin.json` 1.20.0 equals the top CHANGELOG entry.

**Decisions:** (1) The scope names the step 6 template, but that entry is
committed before any review runs, so a step 6 line demanding the reviewer's
figure would be unfillable at the only moment it is written — the reviewer's
figure was routed to the step 8 addendum instead, and step 0's hand-back
extended (model, effort, token figure), because the supervisor who hired
the reviewer is the only party that can know it; the gate-at-the-door
invariant puts each instruction where its actor acts. (2) "Unknown is
tolerated and honest, never estimate" is spelled out in all three skills —
an invented number is worse than none as planning evidence. (3) "Never a
gate" is stated inside each template, not only in the plan, so no future
session promotes the figure into a threshold. (4) The retro sums only what
the log carries and names `unknown` entries rather than zero-counting them —
a total silently absorbing unknowns would present false precision. (5)
`tickets.mjs` untouched per Not in scope: no parsing, no storage, no cost
data. (6) The branch was cut from `origin/q-10` on the user's explicit
direction (deliberate stack), overriding the skill's stop-on-open-PR rule
for this run; recorded here so the base needs no archaeology.

**Owed:** Nothing.

**Addendum — review — 2026-08-09 — opus/high:** Three Important, one nit;
all four fixed in the review-fix commit (f9bb5d3). Important (1): the
retro's epic sum read only the status log's **Tokens** lines while this
same commit deliberately routed every reviewer's figure off that line into
the step 8 addendum — a systematic, silent undercount (a reviewer is hired
for every ticket), with this very entry as the live proof. Fixed: the
retro sums both places the log carries a figure — the entry's **Tokens**
line and the addendum's `Reviewer tokens` — and says why the split exists.
Important (2): in an autonomous epic the run record's **Tokens** line
restates every ticket's figures plus a total into the same status.md the
entries live in, so the retro's sum counted each figure twice and the
total a third time — masking finding 1 in the opposite direction. Fixed
on both sides of the one rule in one commit: the run record's slot names
itself a restatement that an epic sum never reads, and the retro's
instruction skips run-record Tokens lines. Important (3): the hand-back
rule ("model, effort and token figure") was updated in the ticket skill
but not in its only other statement, the quick skill's supervisor lane —
the exact one-rule drift the CLAUDE.md invariant forbids, and the failure
lands in this repo first, where quick supervisors run daily. Fixed: the
quick lane's sentence now carries the same three items. Nit (4): the run
record demanded a reviewer figure the driver has no channel to obtain —
the worker hires the reviewer in an autonomous run, so only the worker
observes that spend. Fixed with the ticket lane's own pattern: the step
4c spawn prompt has the worker report its reviewer's harness-reported
figure, and the driver records each worker's figure as its hirer —
figures flow hirer-to-record. The 1.20.0 CHANGELOG entry text was updated
for the grown shape in the fix commit; no second bump — same release,
same behaviour-change family. Correction to this entry's **Tokens** line,
now that the hirer has passed the figure down: the worker's spend through
step 6 was harness-reported as 77,349 tokens, not `unknown` — the entry
was written before the supervisor's hand-back existed to carry it, which
is itself the mechanism this ticket builds. Re-verified after fixes:
tickets suite 29 pass, 0 fail; guard suite 13 pass, 0 fail; `node --check
plugins/flow/scripts/tickets.mjs` clean; doctor exit 0, all five checks ✓;
acceptance `grep -l "Tokens"` still names all three skills. Nothing
deferred. Reviewer tokens: 62,280.

### Q-12 — the retro runs in fresh context — 2026-08-09 — DONE

**Built:** Plugin v1.21.0. `/flow:retro` no longer mines the record in the
invoking session — often the same session that planned or ran the epic,
carrying exactly the opinions the retro should examine (user request at the
autonomous retro, 2026-08-08). The retro skill now has the supervisor shape
the ticket lane already has: the invoking session resolves the epic (step 1),
then spawns a fresh-context **miner** (new step 2) — a general agent, full
toolset, empty context, handed the epic name, the absolute paths to
`status.md`, `tickets.md` and `context/`, and the default branch, because
its cwd may move — which executes the read/mine/draft steps (3–5) exactly as
written and returns the finished report and proposals. The miner edits no
files, creates no tickets, and asks the user nothing. The approval gate at
the end of step 5 and the shipping in step 6 stay with the human's session,
which shows the miner's report **unedited** ("disagreeing with a finding is
a comment to raise at the gate, never an edit to the evidence") and then
asks and waits, per the ticket's Not in scope (gate and post-approval
shipping unchanged). README's retro row and METHODOLOGY's "Why an epic ends
with a retro" section (two constraints → three) state the same rule with
its reasoning. CHANGELOG entry for 1.21.0.

**Mode:** supervisor — worker worker-q12, reviewer hired by the supervisor.

**Tokens:** worker unknown — the harness exposes no usage figure to the
worker agent; the reviewer's figure follows in the review addendum, per the
template Q-11 added.

**Files touched:** `plugins/flow/skills/retro/SKILL.md`, `README.md`,
`METHODOLOGY.md`, `plugins/flow/.claude-plugin/plugin.json`,
`CHANGELOG.md`, this file. Branch `q-12`, cut from `origin/q-11` (8a65429,
Q-11's review-addendum commit) — a deliberate stack, user-directed: Q-10's
PR #20 and Q-11's PR #21 were open and the user chose to run the remaining
tickets back to back, merging the pull requests in sequence, rather than
waiting on each merge.

**Verified:** Acceptance: `grep -n "fresh-context"
plugins/flow/skills/retro/SKILL.md` — 3 hits (intro, step 2's rationale,
step 2's spawn instruction); `grep -n "invoking session"` on the same file —
6 hits including step 5's "the miner drafts, the invoking session gates" and
"ask, and wait … held in their own session"; `node
plugins/flow/scripts/tickets.mjs doctor` — exit 0, all five checks ✓.
Standing checks: `node --test plugins/flow/scripts/tickets.test.mjs` — 29
pass, 0 fail; `node --test
plugins/flow/hooks/ticket-session-guard.test.mjs` — 13 pass, 0 fail;
`node --check plugins/flow/scripts/tickets.mjs` clean. `plugin.json` 1.21.0
equals the top CHANGELOG entry.

**Decisions:** (1) The skill was renumbered (2→3, 3→4, 4→5, 5→6) with the
spawn as new step 2, rather than bolting a spawn note onto step 2's reading
instructions — the miner executes steps 3–5's drafting as written, so the
steps had to read cleanly as the miner's script with the gate text
addressed back to the invoking session. (2) Step 5 splits along the
gate-at-the-door line: drafting belongs to the miner, the "ask, and wait"
sentence names the invoking session explicitly so the gate's actor is
unambiguous. (3) README and METHODOLOGY moved in the same commit under the
one-rule invariant — the README command table states each command's
fresh-context shape (epic, ticket, run, quick all carry theirs), so leaving
the retro row silent would have been the drift class four of five
autonomous-epic reviews found; METHODOLOGY's "two constraints" list became
three because the fresh-context miner is a constraint on the retro's
honesty, not a mechanical detail. (4) The miner is handed absolute paths
and the skill file's absolute path, per Q-6's review lesson — a spawned
agent's cwd moves and relative paths break. (5) Version bumped minor
(1.21.0): skill text is installed behaviour. (6) The implementation commit
was amended pre-review to drop an auto-added Claude co-author trailer, per
the ticket skill's rule and Q-6/Q-8/Q-9 precedent; step 8's no-amendment
rule binds only after a review has run.

**Owed:** Nothing.

**Addendum — review — 2026-08-09 — opus/high:** One Important, two nits;
all three fixed in the review-fix commit (2c0e00f). Important: step 2
ordered the supervisor to hand the miner absolute paths that no command in
the skill produces — step 1's `list --json` carries no paths, so the only
way to comply was constructing `epics/<name>/…` by hand, which the ticket
skill explicitly forbids — and `repoRoot` was missing from the handed set
entirely, though step 3's `git log origin/<default>` and instruction-file
reads need a repo anchor once the miner's cwd moves (the exact hazard the
step's own rationale names); secondarily, `contextDir` was handed
unconditionally though it is `null` for epics without `context/`,
including this one. Fixed: step 2 now fetches the paths from
`tickets.mjs epics --json` — the command that already returns `ticketsDoc`,
`statusDoc`, `contextDir` and `repoRoot` per epic — hands `repoRoot`
always and `contextDir` only when not null, and step 3 anchors its git
command (`git -C <repoRoot>`) and instruction-file reads to `repoRoot`.
Nit (1): the miner is told to execute the skill "exactly as written", and
the document gave a spawned miner no way to know it should skip step 2 —
nested miners on a literal reading. Fixed with the ticket skill's step 0
pattern: step 2 opens with a reciprocal guard ("you are the miner …
spawn no miner of your own"). Nit (2): three edited paragraphs left
short unreflowed lines (retro skill steps 2 and 5, METHODOLOGY's retro
section) — rewrapped to the house width. CHANGELOG's 1.21.0 entry text
updated for the grown shape in the fix commit; no second bump — same
release, same behaviour-change family. Reviewer confirmed sound: range
coherent after the pre-review amend, the human gate intact across all
three statements, no cross-document drift (skill, README row,
METHODOLOGY agree), version/CHANGELOG discipline, miner self-sufficiency
otherwise holds. No pre-existing findings; nothing deferred. Re-verified
after fixes: tickets suite 29 pass, 0 fail; guard suite 13 pass, 0 fail;
`node --check plugins/flow/scripts/tickets.mjs` clean; doctor exit 0,
all five checks ✓; `grep -c "fresh-context"` on the retro skill — 3;
`grep -n "epics --json"` and `"repoRoot"` hit in steps 2 and 3;
plugin.json 1.21.0 equals the top CHANGELOG entry; no line in the fix
diff exceeds the house wrap. Correction to this entry's **Tokens** line,
per the Q-11 mechanism (the hirer passes the figure down): the worker's
spend through step 6 was harness-reported as 79,496 tokens, not
`unknown`. Reviewer tokens: 77,435.

### Q-13 — the "standard append-only preamble" is referenced where it is not defined — 2026-08-09 — DONE

**Built:** Plugin v1.22.0. The status-log preamble is now defined at the
door where creation happens. The ticket skill's step 6 said "Create the
file if it does not exist" and defined none of its content, and the quick
skill's step 4 spawn prompt told the worker to "create the status log with
the standard append-only preamble" — text that lived only in the epic
skill's status-log template, a document a mid-ticket worker never loads, so
it would have had to invent one (pre-existing, found by Q-6's review).
Skills are self-sufficient: ticket step 6 now carries the exact preamble —
the `# <Name> epic — status log` heading, the "Append-only record" line and
the **Rules** block, verbatim from the epic skill's template — and says why
it lives there; the quick skill's spawn prompt now points at ticket step 6
as the preamble's single named source (the worker executes that step, so
the text is in its hands); and the epic skill's template gains one sentence
naming the coupling on its side — one rule, two documents, either copy
moves the other in the same commit (the Q-4 risk-list precedent). The
preamble's content is unchanged, per Not in scope. CHANGELOG entry for
1.22.0.

**Mode:** supervisor — worker worker-q13, reviewer hired by the supervisor.

**Tokens:** worker unknown — the harness exposes no usage figure to the
worker agent; the reviewer's figure follows in the review addendum, per the
template Q-11 added.

**Files touched:** `plugins/flow/skills/ticket/SKILL.md`,
`plugins/flow/skills/quick/SKILL.md`, `plugins/flow/skills/epic/SKILL.md`,
`plugins/flow/.claude-plugin/plugin.json`, `CHANGELOG.md`, this file.
Branch `q-13`, cut from `origin/q-12` (82931bf, Q-12's review-addendum
commit) — a deliberate stack, user-directed: Q-10's PR #20, Q-11's PR #21
and Q-12's PR #22 were open and the user chose to run the remaining tickets
back to back, merging the pull requests in sequence, rather than waiting on
each merge.

**Verified:** Acceptance: `grep -in "append.only"
plugins/flow/skills/quick/SKILL.md plugins/flow/skills/ticket/SKILL.md` —
4 hits (quick step 4's pointer; ticket step 6's rule line plus the carried
preamble's two lines), exit 0; `node plugins/flow/scripts/tickets.mjs
doctor` — exit 0, all five checks ✓. Standing checks: `node --test
plugins/flow/scripts/tickets.test.mjs` — 29 tests, 29 pass, 0 fail;
`node --test plugins/flow/hooks/ticket-session-guard.test.mjs` — 13 tests,
13 pass, 0 fail; `node --check plugins/flow/scripts/tickets.mjs` clean.
`plugin.json` 1.22.0 equals the top CHANGELOG entry.

**Decisions:** (1) The ticket's premise is imprecise on one point, recorded
rather than halted on: only the quick skill carries the literal phrase
"standard append-only preamble"; ticket step 6 referenced no preamble at
all — it instructed creation with the content entirely undefined, which is
the same defect class (creation instructed, content unreachable), and the
scope's operative instruction — carry the text or a single named source in
the skills that instruct creation — applies to both doors unchanged, so
this did not rise to step 2's stop condition. (2) The exact text went into
ticket step 6 and a pointer into the quick skill, not text in both: step 6
is the door where the file is actually created (quick's worker executes
ticket steps 4–6, so step 6 is already in its hands), and a third verbatim
copy would widen the sync surface the one-rule invariant has to police.
(3) The epic skill was touched — one coupling sentence after its template —
though the scope names only the skills that instruct creation: without the
producing side naming the coupling, a future edit to the template diverges
from step 6's copy silently, the exact failure the Q-4 review found on the
risk lists; the sentence changes no preamble content. (4) The carried
preamble excludes the epic template's Baseline section, and both documents
say so — Baseline is planning's own record; a mid-ticket worker creating a
missing log has no baseline to write. (5) Version bumped minor (1.22.0):
skill text is installed behaviour (Q-10 precedent), even though this
ticket's scope, unlike Q-14/Q-15's, does not spell the bump out — the
CLAUDE.md invariant binds regardless. (6) The branch was cut from
`origin/q-12` on the user's explicit direction (deliberate stack),
overriding the skill's stop-on-open-PR rule for this run; recorded here so
the base needs no archaeology.

**Owed:** Nothing.

**Addendum — review — 2026-08-09 — opus/high:** Two nits, one pre-existing;
no Important findings. Both nits fixed in the review-fix commit (a051610).
Nit (1), confirmed: the run skill's sign-off gate asserted sole authorship
of the artifact it checks — "`status.md` is created only after the human
approves" — which this ticket's own change made false as a general
statement by documenting ticket step 6 as a second creation door; the
one-rule invariant required that sentence to move in the same commit, and
the entry's Decisions record no grep for it. Fixed: the gate's evidence now
stands on presence on the remote epic branch, with a parenthetical naming
the second door and why it cannot fake the pre-run trace (it runs on ticket
branches, after a run has begun). No reachable gate bypass existed —
tickets.md and status.md reach the remote in the same push — so a nit, not
Important. Nit (2), plausible: step 6's "The heading is parsed, so match it
exactly" now sat directly after a block whose first line is itself a
heading (the carried preamble's `#` title, which nothing parses — parser
and doctor both match only `###`); reworded to name the **entry** heading
and say the preamble's title is not parsed. Pre-existing, not fixed here,
handed to **Q-16** (opened in this epic's ticket doc in the review-fix
commit, Q-14/Q-15 precedent): doctor's no-status.md warning advertises
"created at sign-off by /flow:epic" — a command the quick lane routes away
from; between quick step 3 and the worker reaching step 6, the user is told
to run a command that will never produce the file (the advertised-recovery
class). Not introduced by this range; scoped to the one-line message fix
plus version bump. CHANGELOG 1.22.0 entry text updated for the grown shape
in the fix commit; no second bump — same release, same behaviour-change
family. Also confirmed sound by the reviewer: the two preamble copies are
byte-identical; the embedded preamble is inert to the load-bearing regexes;
the quick skill's pointer resolves for the worker who reads it; omitting
Baseline is safe; no third creation door exists; the epic-skill touch is
not scope creep; and the entry's no-halt call on the imprecise premise was
judged defensible since the discrepancy was recorded verbatim. Nothing
deferred beyond Q-16. Re-verified after fixes: tickets suite 29 pass, 0
fail; guard suite 13 pass, 0 fail; `node --check
plugins/flow/scripts/tickets.mjs` clean; doctor exit 0, all five checks ✓;
acceptance grep still 4 hits across the quick and ticket skills; `list`
parses all 16 quick tickets including Q-16; plugin.json 1.22.0 equals the
top CHANGELOG entry. Correction to this entry's **Tokens** line, per the
Q-11 mechanism (the hirer passes the figure down): the worker's spend
through step 6 was harness-reported as 82,216 tokens, not `unknown`.
Reviewer tokens: 63,455.

### Q-14 — preamble values must not scavenge across newlines — 2026-08-09 — DONE

**Built:** Plugin v1.23.0. A value-less preamble label line now reads as
absent instead of adopting the first word of the next paragraph. The shared
preamble parse in `tickets.mjs` (`grab`, used by all three labels — Release
mode, Run mode, Reviewer model) put `\s*` around the label's colon, and `\s`
matches newlines — so a bare `Run mode:` followed by a paragraph beginning
"Autonomous is not wanted here." parsed as `runMode: 'autonomous'` (verified
live by Q-7's review, which found the class pre-existing on the mode lines
and handed it here whole). The fix is the review's suggested shape:
`[^\S\n]*` in place of `\s*` on both sides of the colon, anchoring the value
to the label's own line — one change fixing the class for all three labels,
since they share the one parse. Doctor's near-miss warning already fired on
a value-less label line but misdescribed the failure ("will not parse, so it
silently defaults" — it parsed, into unrelated prose); with the value
anchored, that sentence is now true, and the hint's parenthetical names the
piece a bare label is missing: "value on the label's own line", beside the
existing label-at-line-start and no-formatting requirements. Comments above
`parseModes` and the doctor scan record the anchor and why. New test: a
value-less line under each of the three labels, each followed by a paragraph
opening with a word the old parse would have scavenged into a live value
(Integration / Autonomous / Opus), must parse as absent (serial default /
null / null) — and each line is doctor-flagged with the corrected hint.
Tickets suite 29 → 30. CHANGELOG entry for 1.23.0.

**Mode:** supervisor — worker worker-q14, reviewer hired by the supervisor.

**Tokens:** worker unknown — the harness exposes no usage figure to the
worker agent; the reviewer's figure follows in the review addendum, per the
template Q-11 added.

**Files touched:** `plugins/flow/scripts/tickets.mjs`,
`plugins/flow/scripts/tickets.test.mjs`,
`plugins/flow/.claude-plugin/plugin.json`, `CHANGELOG.md`, this file.
Branch `q-14`, cut from `origin/q-13` (1581d0d, Q-13's review-addendum
commit) — a deliberate stack, user-directed: Q-10's PR #20, Q-11's PR #21,
Q-12's PR #22 and Q-13's PR #23 were open and the user chose to run the
remaining tickets back to back, merging the pull requests in sequence,
rather than waiting on each merge.

**Verified:** Acceptance: the new test — value-less `Run mode:` and
`Reviewer model:` (and `Release mode:`) each followed by a prose paragraph
parse as absent, never the paragraph's first word — passes inside the suite:
`node --test plugins/flow/scripts/tickets.test.mjs` — 30 tests, 30 pass,
0 fail. Mutation check: reverting `[^\S\n]*` back to `\s*` fails exactly the
new test (29 pass, 1 fail), so the test pins the anchor. `node
plugins/flow/scripts/tickets.mjs doctor` — exit 0, all five checks ✓.
Standing checks: `node --test
plugins/flow/hooks/ticket-session-guard.test.mjs` — 13 tests, 13 pass,
0 fail; `node --check plugins/flow/scripts/tickets.mjs` clean. Live smoke:
unfiltered `list` on this repo still renders the board. `plugin.json`
1.23.0 equals the top CHANGELOG entry.

**Decisions:** (1) Both `\s*` in `grab` were replaced, not only the one
after the colon: `label\s*:` could also cross a newline ("Run mode" at a
line's end, the colon on the next), the same scavenging class through the
other gap. (2) Doctor's own strict per-line regex (`modeStrict`) keeps its
`\s*`: it tests one `split('\n')` line at a time, where `\s` cannot cross a
newline, so it is behaviourally identical — changing it would be churn
inside a Not-in-scope area (the tolerant parse's other properties stay as
they are). (3) The doctor wording change is the hint's parenthetical only:
after the anchor fix, "will not parse, so it silently defaults" is accurate
for every near-miss shape including the value-less line, so the sentence
stands; what misdescribed the value-less case going forward was the recovery
hint, which named only label-at-line-start and no-formatting — requirements
a bare label already meets. (4) The new test also pins the corrected hint
text (`value on the label's own line`) so the message cannot silently revert
— the file's convention of pinning messages verbatim. (5) Label
case-insensitivity, prose after the value, and preamble-only reading are
untouched, per Not in scope. (6) Version bumped minor (1.23.0): script
parse behaviour is installed behaviour. (7) The branch was cut from
`origin/q-13` on the user's explicit direction (deliberate stack),
overriding the skill's stop-on-open-PR rule for this run; recorded here so
the base needs no archaeology. (8) The implementation commit was amended
pre-review to drop a Claude co-author trailer, per the ticket skill's rule
and Q-6/Q-8/Q-9/Q-12 precedent; step 8's no-amendment rule binds only after
a review has run.

**Owed:** Nothing.

**Addendum — review — 2026-08-09 — opus/high:** One nit, no Important
findings, no pre-existing defects; the nit fixed in the review-fix commit
(a5fbc79). Nit, confirmed: half the fix was unpinned — the commit anchored
both sides of the label's colon (this entry's Decision 1), but the new
test's value-less shapes only exercise the post-colon side; the reviewer
reverted the pre-colon anchor alone (`^${label}\s*:[^\S\n]*`) and the suite
stayed green (30 pass, 0 fail), while the post-colon anchor and the doctor
hint wording were each already pinned (29/1 under either revert). The
untested behaviour: a label and colon split across lines — the markdown
definition-list shape, `Run mode` newline `: autonomous` — parsed as
`autonomous` under the reverted regex; a future "simplify back to `\s*`" on
that side would restore the scavenge with a green suite. Fixed with one
fixture paragraph in the existing test carrying exactly that shape, asserted
absent; the test's doctor warn count grows 3 → 4 because the colon-less
label line is itself a near-miss the scan flags. Mutation re-run after the
fix: the pre-colon revert now fails exactly the new test — 29 pass, 1 fail —
so all three halves (both anchors, the hint wording) are pinned. CHANGELOG
1.23.0 entry text extended for the grown test shape in the fix commit; no
second bump — same release, same behaviour-change family. Nothing deferred.
Also confirmed sound by the reviewer, with depth: the regex probed across
value shapes including CRLF in both directions (CR-only unreachable — the
file is split on `\n` upstream); the decision to leave doctor's per-line
`modeStrict` at `\s*` verified formally and empirically as the right scope
call; the step-5 checkout incident left no half-reapplied edits — all five
files mutually consistent, every CHANGELOG claim checked out; old and new
`grab` agree on all three of this repo's epics, doctor still all five
checks ✓ with no warnings; the new test is the only one failing under the
anchor mutation and its fixture paragraphs are load-bearing; no template or
README needed a same-commit change ("first word after the colon" remains
true). Re-verified after the fix: tickets suite 30 pass, 0 fail; guard
suite 13 pass, 0 fail; `node --check plugins/flow/scripts/tickets.mjs`
clean; doctor exit 0, all five checks ✓; plugin.json 1.23.0 equals the top
CHANGELOG entry. Correction to this entry's **Tokens** line, per the Q-11
mechanism (the hirer passes the figure down): the worker's spend through
step 6 was harness-reported as 99,941 tokens, not `unknown`. Reviewer
tokens: 67,888.

### Q-15 — mixed board omits ticketless epics entirely — 2026-08-09 — DONE

**Built:** Plugin v1.24.0. The mixed board no longer omits ticketless
epics. Q-8 fixed the all-empty unfiltered board, but when at least one
epic had tickets, `printBoard`'s per-epic loop in `tickets.mjs` still
skipped any epic whose tickets.md has no `## <ID> — …` sections
(`if (!ts.length) continue`) — that epic was absent from the unfiltered
board entirely, existing work reported as nonexistent at larger blast
radius than Q-8's case (Q-8's review, pre-existing; verified live by that
reviewer against a one-ticketed-plus-one-ticketless fixture). The loop now
prints the ticketless epic's empty state instead of skipping it — the same
composed line the all-empty branch renders (`<epic> — no tickets yet`,
bold name, dim state), factored into one `ticketlessLine` helper both
branches call, so the two renderings cannot drift apart. A blank line
follows it, keeping the board's per-epic block rhythm. New test builds a
dedicated throwaway repo with one ticketed epic (`peopled`, one `## P-1`
section) and one ticketless epic (`hollow`) — the shared fixture's epics
all have tickets and Q-8's barren repo has none — asserting the ticketless
epic renders its composed empty-state line, the ticketed epic's header and
ticket rows still render, all pinned as composed lines per Q-8's review
lesson. Tickets suite 30 → 31. CHANGELOG entry for 1.24.0.

**Mode:** supervisor — worker worker-q15, reviewer hired by the supervisor.

**Tokens:** worker unknown — the harness exposes no usage figure to the
worker agent; the reviewer's figure follows in the review addendum, per the
template Q-11 added.

**Files touched:** `plugins/flow/scripts/tickets.mjs`,
`plugins/flow/scripts/tickets.test.mjs`,
`plugins/flow/.claude-plugin/plugin.json`, `CHANGELOG.md`, this file.
Branch `q-15`, cut from `origin/q-14` (5184c2d, Q-14's review-addendum
commit) — a deliberate stack, user-directed: Q-10's PR #20, Q-11's PR #21,
Q-12's PR #22, Q-13's PR #23 and Q-14's PR #24 were open and the user chose
to run the remaining tickets back to back, merging the pull requests in
sequence, rather than waiting on each merge.

**Verified:** Acceptance: the new test — a repo with one ticketed and one
ticketless epic → unfiltered `list` names both, the ticketless one with its
empty state — passes inside the suite: `node --test
plugins/flow/scripts/tickets.test.mjs` — 31 tests, 31 pass, 0 fail.
Mutation check: reverting the loop fix back to `if (!ts.length) continue`
fails exactly the new test (30 pass, 1 fail), so the test pins the
behaviour. `node plugins/flow/scripts/tickets.mjs doctor` — exit 0, all
five checks ✓. Standing checks: `node --test
plugins/flow/hooks/ticket-session-guard.test.mjs` — 13 tests, 13 pass,
0 fail; `node --check plugins/flow/scripts/tickets.mjs` clean. Live smoke:
unfiltered `list` on this repo still renders the board (every epic here has
tickets, so the new branch is exercised only by the test fixture).
`plugin.json` 1.24.0 equals the top CHANGELOG entry.

**Decisions:** (1) The empty-state line was factored into a shared
`ticketlessLine` helper rather than copied into the loop — two verbatim
renderings of one fact is the drift surface the one-rule invariant polices
in documents, applied here to code. (2) The ticketless epic's line is
followed by a blank line inside the loop, matching every ticketed epic's
block, so the board's separation rhythm survives whichever epics are
empty. (3) The new test builds its own throwaway repo rather than mutating
the shared fixture: the mixed case needs a ticketed and a ticketless epic
side by side, and the shared fixture's epics all carry tickets. (4) All
three assertions pin composed lines (`/^hollow — no tickets yet$/m`,
`/^peopled — 1 tickets/m`, `/^  P-1 /m`), per Q-8's review lesson that
fragments cannot tell branches apart. (5) Version bumped minor (1.24.0):
script output is installed behaviour (Q-8/Q-9 precedent). (6) The branch
was cut from `origin/q-14` on the user's explicit direction (deliberate
stack), overriding the skill's stop-on-open-PR rule for this run; recorded
here so the base needs no archaeology. (7) The implementation commit was
amended pre-review to restore the executable bit on `tickets.mjs`, dropped
by the mutation-check's file rewrite during verification; step 8's
no-amendment rule binds only after a review has run (Q-6/Q-8/Q-9/Q-12/Q-14
precedent).

**Owed:** Nothing.

**Addendum — review — 2026-08-09 — opus/high:** One nit, one pre-existing;
nothing fixed in this range, on the reviewer's own recommendation. Nit,
confirmed, not fixed here — handed to **Q-17** (opened in this epic's
ticket doc in this commit, Q-13/Q-14/Q-15 precedent): the new ticketless
branch prints only the empty-state line and drops the `← this folder`
marker every ticketed epic gets — in a checkout whose root directory is
named after a ticketless epic (exactly a freshly-cut epic's state, the
convention the script documents), an unfiltered mixed board shows the
marker on no epic at all, while `tickets.mjs current` answers correctly
(verified live by the reviewer: root `hollow/` with ticketless
`epics/hollow/` plus ticketed `epics/peopled/` prints `hollow — no
tickets yet` bare; renaming the root to `peopled` restores the marker).
Reason not fixed in-range: this ticket's Not in scope is "any other
change to list output", and the shape originates in Q-8's all-empty
branch, which omits the marker the same way — both renderings share
`ticketlessLine`, so Q-17 covers both branches in one fix and one test.
Pre-existing, recorded with its reason rather than ticketed: the "Nothing
left to start." line in `tickets.mjs` carries a dead false branch
(`data.tickets.length ? … : ''` — the early return above makes the length
always truthy there); harmless, not introduced by this range, and too low
value for its own ticket — fold into a future tidy ticket only if one
opens for other reasons; Q-17's section names it as adjacent-if-touching,
not an obligation. Also confirmed sound by the reviewer, with depth: the
new test mutation-checked in both directions — reverting the loop fix
fails exactly the mixed-board test, and mutating `ticketlessLine`'s text
fails both the all-empty and mixed tests, so the no-drift claim is pinned
on both sides; `list --json` never had the omission (its epics array
includes ticketless epics, verified live), so the scope rightly excluded
it; filtered list and BOARD-2 behaviour preserved; no amend residue —
`tickets.mjs` is 100755 at base and HEAD, the diff additive-only, nothing
from Q-14 lost; Next up correctly never shows ticketless epics; no
document drift ("no tickets yet" appears in no README, METHODOLOGY or
skill text, and the tickets skill passes the board through without
parsing). Suite 31 pass, 0 fail; doctor exit 0, all five checks ✓.
Nothing deferred beyond Q-17. Correction to this entry's **Tokens** line,
per the Q-11 mechanism (the hirer passes the figure down): the worker's
spend through step 6 was harness-reported as 97,709 tokens, not
`unknown`. Reviewer tokens: 65,184.

### Q-16 — doctor's no-status.md hint names a command the quick lane never runs — 2026-08-09 — DONE

**Built:** Plugin v1.25.0. Doctor's warning for a missing status.md no
longer advertises a recovery unreachable from the state that triggers it.
The message said "created at sign-off by /flow:epic" — but the quick epic
never runs `/flow:epic`; its log is created by ticket step 6, the door
Q-13 documented, so between quick step 3 (plan committed) and the worker
reaching step 6 the user was told to run a command that will never produce
the file (pre-existing, found by Q-13's review). The one message in
`tickets.mjs` now names both creation doors — "created at sign-off by
/flow:epic, or by the first ticket's status entry (ticket step 6 — the
quick lane's only door)" — with a comment above it recording why both are
named. New test pins the full warning text verbatim on an epic without
status.md (gamma, the shared fixture's epic that has none), so neither
door can silently drop from the hint. Tickets suite 31 → 32. CHANGELOG
entry for 1.25.0.

**Mode:** supervisor — worker worker-q16, reviewer hired by the supervisor.

**Tokens:** worker unknown — the harness exposes no usage figure to the
worker agent; the reviewer's figure follows in the review addendum, per the
template Q-11 added.

**Files touched:** `plugins/flow/scripts/tickets.mjs`,
`plugins/flow/scripts/tickets.test.mjs`,
`plugins/flow/.claude-plugin/plugin.json`, `CHANGELOG.md`, this file.
Branch `q-16`, cut from `origin/q-15` (00c5622, Q-15's review-addendum
commit) — a deliberate stack, user-directed: Q-10 through Q-15's PRs
#20–#25 were open and the user chose to run the remaining tickets back to
back, merging the pull requests in sequence, rather than waiting on each
merge.

**Verified:** Acceptance: `grep -n "no status.md"
plugins/flow/scripts/tickets.mjs plugins/flow/scripts/tickets.test.mjs` —
message in the script names both doors, test pins the full text.
`node --test plugins/flow/scripts/tickets.test.mjs` — 32 tests, 32 pass,
0 fail (the new test among them). Mutation check: reverting the message to
the old single-door text fails exactly the new test (31 pass, 1 fail), so
the test pins the wording. `node plugins/flow/scripts/tickets.mjs doctor` —
exit 0, all five checks ✓. Standing checks: `node --test
plugins/flow/hooks/ticket-session-guard.test.mjs` — 13 tests, 13 pass,
0 fail; `node --check plugins/flow/scripts/tickets.mjs` clean.
`plugin.json` 1.25.0 equals the top CHANGELOG entry.

**Decisions:** (1) A test was added even though the acceptance criterion
made it conditional ("its test if one pins the text" — none did): the
file's convention pins doctor messages verbatim (Q-8's and Q-14's review
lessons), and a reworded hint with no test pressure could silently revert
to the single-door text. (2) The second door is named as "the first
ticket's status entry (ticket step 6)" rather than `/flow:quick`: quick
routes through the ticket loop, so ticket step 6 is the actual creation
door for every lane that is not `/flow:epic` — naming the step names the
door for quick, serial and integration first-tickets alike. (3) One-rule
sweep before editing: grep for "created at sign-off" and "no status.md"
across README, METHODOLOGY, CLAUDE.md and the skills found no other
statement of this message (the run skill's sign-off gate was already
corrected by Q-13's review), so the change is contained to the script,
its test, the version and the CHANGELOG. (4) Version bumped minor
(1.25.0): doctor output is installed behaviour (Q-8/Q-9 precedent).
(5) During verification, the mutation-check cleanup (`git checkout --` on
`tickets.mjs`) restored the file to HEAD and silently discarded the
uncommitted Q-16 edit — caught by the post-restore suite run failing the
new test, re-applied and re-verified before anything was committed; the
executable bit confirmed intact (100755), the hazard Q-15's amend note
records. (6) The branch was cut from `origin/q-15` on the user's explicit
direction (deliberate stack), overriding the skill's stop-on-open-PR rule
for this run; recorded here so the base needs no archaeology.

**Owed:** Nothing.

**Addendum — review — 2026-08-09 — opus/high:** One nit, no Important
findings, no pre-existing defects worth a ticket; the nit fixed in the
review-fix commit (099105f). Nit, confirmed: the message's two doors were
named at different altitudes — the first a command the reader can type
(`/flow:epic`), the second an internal procedure step ("ticket step 6"),
which a user in exactly the state this ticket was opened for (quick lane,
plan committed, worker not yet at step 6) still could not act on; doctor's
own convention elsewhere names the runnable fix. Fixed with the reviewer's
suggested shape, one parenthetical: the second door now reads "ticket
step 6, reached with /flow:ticket <ID> — the quick lane's only door". The
pinning test asserts the full string verbatim, so it changed with the
message; the 1.25.0 CHANGELOG text was updated for the grown shape in the
fix commit — no second bump, same release, same behaviour-change family.
Also noted by the reviewer, recorded here rather than ticketed: the
"created at sign-off" colloquialism predates this range and is not worth
a ticket. Confirmed sound by the reviewer, with depth: message accuracy
traced through all three skills for both lanes ("the quick lane's only
door" stays correct on a normal epic); the pinning test discriminates
(mutation-checked: the old text fails exactly the new test, 31 pass,
1 fail) and is not order-fragile (gamma stays status-less; temp epics are
removed in finally blocks); the rendered row verified in a scratch repo —
a single warn row, shorter than the existing mode-line warning; the
one-rule sweep found the only other two-door statement (run/SKILL.md:68)
already correct from Q-13; no checkout-incident residue (mode 100755 in
index and on disk, the 6-line hunk, the 5 expected files); scope
respected; 1.25.0 equals the CHANGELOG head. Re-verified after the fix:
tickets suite 32 pass, 0 fail; guard suite 13 pass, 0 fail; `node --check
plugins/flow/scripts/tickets.mjs` clean; doctor exit 0, all five
checks ✓. Nothing deferred. Correction to this entry's **Tokens** line,
per the Q-11 mechanism (the hirer passes the figure down): the worker's
spend through step 6 was harness-reported as 95,616 tokens, not
`unknown`. Reviewer tokens: 56,452.
