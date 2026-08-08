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
