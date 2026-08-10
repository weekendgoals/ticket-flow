# Why it works this way

**This document contains no rules.** The rules live where they are executed, in
the skills. Those are self-sufficient — an agent never needs to read this file
to do its job.

This is the reasoning behind them: what each piece defends against, and what
happened when it was absent. Read it before **changing** the workflow, so a
constraint that looks like ceremony is not removed without knowing what it cost.
If it ever contradicts a skill, the skill is right and this is stale.

## The core bet

**Conversation history is not the project's memory — documents are.** Everything
a future session needs lives in a document, so an agent can start with an empty
context window, read a few files, and know what the project is, what has been
done, what it must do now, and what it must not touch.

That is what makes context disposable, and disposable context is what makes
clearing between tickets free rather than lossy. Every other decision follows
from wanting that property.

If the methodology needs a name, it is **evidence-driven development under
disposable context**: durable knowledge lives in versioned documents, progress
is derived from evidence rather than reported, and no context window is ever
load-bearing.

The bet has a price, and the price is tokens: fresh contexts reread, separate
reviewers re-derive, documents grow. The methodology's own record made that
price visible — seven consecutive quick tickets averaged ~155k tokens each,
about 450k of it reviewer spend, for changes as small as a warning string —
and taught the second principle the first one now answers to: **the cost of a
guarantee must scale with the risk it retires.** Spend inference only where
judgment is needed; spend maximum inference only where consequence lives.
Several rules below exist in their current shape because their first shape
failed that test.

## Why Flow is opt-in

A methodology that auto-engages on every request becomes the tax on every
request. The skills' own trigger descriptions once invited that — "or asks
for a small change" — which meant an ordinary bugfix request could summon a
ticket document, a worker, and a reviewer nobody asked for. The contract is
now explicit: **plain request = direct development; `/flow:*` = managed
development.** Direct work is not a hole in the methodology — it is the
correctly-priced lane for work whose record is the pull request itself, and
the user can always say "directly, without Flow" and be obeyed. There is
deliberately no `/flow:direct` command: direct development is the agent's
natural behaviour, and a command implying otherwise would make the
methodology look load-bearing where it is not.

## Why an epic is a folder

Making the directory name **be** the epic name removes a whole class of problem.
There is no epic argument to pass, no search across ticket documents to
disambiguate, and no way to run a ticket against the wrong epic's documents by
mistake. If the project also uses one checkout per epic, the checkout's own name
answers "which epic am I in" with no lookup at all.

## Why state is derived

The first version of this had a hand-maintained status table in each ticket
document. It was wrong within a week: a ticket that had been implemented,
reviewed and fixed still read `Todo`. Nobody was careless — a mirror of a fact
simply drifts from the fact.

So `tickets.mjs` stores nothing and recomputes everything from sources that
cannot misreport themselves: ticket headings, status-log headings, git branches,
commit subjects on the default branch, `gh pr list`.

Two consequences that look arbitrary until you know this:

- **Prefixing commit subjects with the ticket ID is load-bearing.** It is how
  shipped state is detected. Reading it off the default branch also catches work
  merged under a branch name that predates the convention.
- **A multi-ticket pull request must merge with a merge commit, never squash.**
  Squashing collapses those subjects into one and makes every ticket but one
  read as unshipped. The rule originally banned squash outright; that was
  over-broad — a single-ticket pull request titled `<ID>: <title>` survives
  squash, because the squash commit inherits the title and the detection regex
  matches it. Only the integration release pull request genuinely cannot be
  squashed. Relaxing this removed a real adoption barrier: many organisations
  mandate squash and cannot turn it off per-repository.

## Why a human merges, and nothing runs after

When merging deploys, that click is the last gate there is. The further an agent
goes on its own, the more that one remaining checkpoint is worth — so the pull
request body carries everything needed to decide, and the agent stops there.

It also means an agent has no branch of its own once a ticket merges. Anything a
post-merge step wanted to record would have to be committed straight to the
default branch. Since shipped state is derived anyway, there is nothing to
record — hence no command after the merge, and nothing to clean up.

An earlier version ended the loop at review instead of at an open pull request.
Finished, reviewed work then sat unpushed for a day, invisible to everyone. The
loop now ends at a pull request for that reason.

## Why the human gate can move to the release pull request

Autonomous mode looks like a breach of the rule above; it is actually the
same rule with the gate relocated. The insight is that "a human merges" was
never about the merge click — it was about unverified work not reaching the
branch that deploys. In an integration epic the branch that deploys is only
ever touched by the release pull request, so a human reviewing *that* pull
request guards exactly what the per-ticket gate guarded, once, with the full
evidence trail in front of them. That is why unattended execution and
integration topology are one declaration, `Delivery: release`, rather than
two: in incremental delivery every ticket merge is a deploy-branch merge
with no downstream gate left to move to, and a single line that bundles the
two facts makes the unattended-merges-to-main contradiction impossible to
declare, not merely refused.

What the mode buys is the elimination of the human as a between-tickets
scheduler while keeping them as the judge. What it costs is that every
defence that used to be a human noticing — a stalled loop, a review skipped,
a wrong merge target — has to become either mechanical or a reason to stop.
Hence three design choices:

- **Stop conditions beat retries.** An attended session that hits a conflict
  can ask; an unattended one that improvises past a failed gate produces a
  release pull request whose evidence can no longer be trusted — and a
  corrupted evidence trail defeats the one gate remaining. Halting converts
  every unforeseen situation into the attended problem the flow already
  knows how to handle. The same logic makes a mid-run permission prompt a
  stop rather than a wait: nobody is there to answer, and a run wedged on a
  prompt is indistinguishable from a run making progress.
- **Each ticket runs in a fresh-context agent, and the driver never
  implements.** Partly the standing self-review argument — but mostly
  because it turns every unattended run into a live test of the core bet.
  If the documents are not sufficient, a fresh agent fails visibly, instead
  of the driver silently patching the gap from context that will not exist
  next time. The run log naming each worker is what makes the rule
  observable after the fact.
- **The environment is verified before ticket one, not discovered mid-run.**
  The permission surface must be pre-authorized, and the default branch must
  carry branch protection — pull requests required, force pushes blocked,
  human-only merge. Skills are soft enforcement: they constrain an agent
  that reads and obeys them. Protection is the hard floor that holds even
  against a misbehaving agent, which is why it is documented as environment
  setup rather than shipped as plugin code — the plugin cannot grant itself
  a guarantee that must bind it.

The first live run taught one more thing, now part of how outcomes are
written: **an evidence criterion is only as strong as its observer.** The
epic's outcome promised an external record "showing zero human
interventions" — but every actor, human or agent, acts under the same GitHub
identity, so no record could ever show that; the claim was unfalsifiable the
day it was written, and only the run's own review caught it. The epic skill
now asks the outcome's evidence line to name its observer and claim only
what that observer can distinguish — there: zero pull-request comments, zero
reviews, a default branch that never moved.

The mode's own reversal condition is written in its epic: if unattended runs
routinely stall, or produce release pull requests the human rejects, the mode
is removed and this section becomes the record of what it cost to learn.

## Why release delivery became the default

The gate-relocation argument above was proven live, and then usage decided
the rest. In practice the human's between-ticket interaction in attended
epics was mechanical — approve, merge, type `next` — while the record shows
serial discipline being overridden anyway (Q-10 through Q-17 shipped as
deliberately stacked branches, exceptions recorded in prose). A rule that
disciplined users repeatedly route around is not protecting anything; it is
measuring where the real gates are. The real gates are two: **approve the
plan** and **approve the release.** Everything between them — implement,
verify, review, fix, integrate — is what the flow already automates, per
ticket, with a fresh context and an independent reviewer.

So the epic template now asks one question, `Delivery: release |
incremental`, and recommends release for multi-ticket epics: unattended
execution into `epic/<name>`, one human release decision. Incremental
remains first-class for the cases where an epic branch is genuinely worse —
per-ticket production feedback, fast-moving main, staged migrations — and
release epics are bounded (roughly 3–6 tickets, days not weeks, a reviewable
release diff) because a long-lived epic branch accumulates integration risk
and delays feedback. Interactive per-ticket execution did not disappear; it
was demoted from a planned mode to what it always really was — the escape
hatch for resolving a halt or watching one consequential ticket closely.

## Why review cost is tiered

Review is the flow's single most expensive habit, and for a while it was
flat-priced at the maximum: every diff, the strongest model, whatever the
change. The record showed 56–77k reviewer tokens spent on tiny display and
docs changes, mostly returning nits — capability paying for consequence that
was not there. Independent review earns its keep everywhere; **maximum**
review earns its keep only where the failure would be expensive. So the
ticket lane prices review by what the diff can break — a fast model at low
effort for prose, a mid-tier model at high effort for ordinary behaviour, the
strongest at `xhigh` for the consequence list — and the quick lane goes one
step further: no separate reviewer at all for prose-only diffs, because a
pull request a human reads is already a review of prose. The line between
the cheap tiers is drawn at what is *read by a machine*, not what looks
harmless: configuration, user-facing strings, CLI output and skill Markdown
all execute somewhere, so they price as behaviour — only documentation and
comments qualify as prose. The consequence list stays coupled to quick's
entry gate (one list, two doors), so the cheap tiers structurally cannot
leak consequential work.

## Why a worker reads a brief, not the whole log

The ticket skill originally required each worker to read the entire status
log. Correct on day one; a compounding tax by ticket twenty — the standing
quick epic's log alone passed 1,500 lines, so every one-line fix began by
paying to reread the history of every previous one-line fix. Append-only is
for **preserving** knowledge, and preserving must not mean rereading:
`tickets.mjs brief` now compiles the worker's required reading — the epic
preamble with its ground rules, the owed items no `**Resolves owed:**` line
has closed (the debt ledger has explicit repayment syntax precisely so the
compiled list can shrink; an unmarked discharge is repaid by appending the
marker, not by rereading), the ticket's own section, the derived facts —
making required reading O(epic) while the log stays O(history) for the
retro and the archaeologist, the readers it was always really for. The same pressure shortened the status
entry itself: Built, Mode, Tokens, Verified, Decisions-that-deviate, Owed —
git already records the files and commits, and narration a future reader
must wade through is a cost, not a record.

## Why a nit is not automatically a ticket

Reviews reliably produce nits; for a stretch each nit became a ticket, and
each ticket bought the full loop, whose review produced nits. Q-11 through
Q-17 are the record of that feedback loop: a system spending ~150k tokens a
cycle polishing its own consistency — immaculate records, rising lead time,
little user value. The rule now: a nit is fixed in place when trivial and in
scope, otherwise recorded in the review addendum, where the retro — which
exists precisely to detect repetition — decides whether it recurs enough to
become work. A nit earns a ticket only by affecting users, carrying real
maintenance risk, recurring, or riding an already-planned change. The same
logic batches releases: version bumps group compatible refinements
deliberately instead of shipping one number per sentence changed.

## Why the reviewer is a separate agent

A session that has just spent hours justifying its own design decisions is the
worst possible reviewer of them. It will agree with itself.

This was originally enforced by making the human clear context and run a review
command by hand. That worked, and it also meant finished work waited on a human
remembering the second half. Spawning the reviewer as a subagent buys the same
property — empty context, sees only the diff and the documents — without the
handoff.

Two rules keep it from collapsing back into self-review. **The reviewer reports
and does not fix**, because an agent that can edit its own finding will edit it
into agreement. And **fixes are new commits, never amendments**, so the review
stays auditable against exactly what was reviewed.

Not every finding should be fixed — out of scope and owned by a later ticket, the
fix riskier than the bug, the premise verified wrong. Each is a disposition
**with a written reason in the status log**. The written reason is the point: it
stops the same finding being re-argued three tickets later.

## Why the plan is reviewed before sign-off

Every defence in this workflow used to start after the plan was signed off —
but the most expensive mistakes are made before that, in the decomposition. A
ticket built on a wrong split is not saved by a good code review; the review
approves a correct implementation of the wrong thing, and the cost is every
ticket stacked on it. The sign-off gate existed for exactly this, yet it left
the human to catch decomposition faults alone, reading a document written by a
session with every incentive to find its own plan convincing.

So the same trick used on code is used on the plan: a fresh-context agent with
no stake in the decomposition, reading it against the actual code, reporting
without rewriting. External evidence points the same way — Cloudflare reports
that pre-implementation design review by agents caught architectural problems
in roughly six hundred designs before any code existed. The human still signs
off; they just do it with adversarial findings and the reviewer's open
questions in hand, instead of with prose written to be agreed with.

## Why attended tickets get a supervisor

The autonomous epic's live run proved something that had nothing to do with
autonomy: three tickets executed by fresh-context agents, from documents
alone, produced work whose reviews came back clean or nearly so. The
fresh context was doing real work — and attended tickets, run in whatever
session the human happened to be planning in, never got it. The invoking
session has argued for its own decomposition, carries opinions about the
code, and — when it runs several tickets — carries the previous ticket too.

So the attended default became the same shape the driver already proved:
the session supervises, a fresh worker implements from the documents, and —
one step further than the autonomous lane — **the supervisor hires the
reviewer**, because a worker that picks its own judge recreates self-review
one level down. Interactive mode survives behind a flag for the real case
it serves (conversing with the implementing agent mid-ticket), but the
choice is once-per-session and enforced by a hook, not by memory: an
interactive run marks the session, and every later `--interactive` run in
it is refused — toward supervisor mode, which stays open because its
workers start empty, or toward `/clear`, which wipes the marker along with
the context it describes. A rule that survives only if
every future session remembers it is not a rule; the hook is deterministic,
which is the same lesson as doctor's — spend inference only where judgment
is needed. The marker records the mode chosen at invocation, in the OS temp
dir: session-scoped state given session-scoped lifetime, deliberately not
in the repository — it is a fact about a conversation, not about the
project.

## Why doctor is a script first, and judgment second

The board's one honest failure mode is a heading that *almost* parses: a status
line missing its date, a lowercase ticket ID, an outcome word the parser does
not know. Nothing errors — the ticket just silently reads as not done, and the
derived state that everything else trusts is wrong. Detection of that is
mechanical, so it lives in `tickets.mjs doctor` next to the parsing rules it
checks, not in a prompt. What a script cannot judge is whether the instruction
files are any good — whether the test command is really there, whether the
standards the reviewer judges against actually exist in writing. That half
stays with the model. The split follows a lesson learned elsewhere in this
workflow: spend inference only where judgment is needed, and make everything
routine deterministic.

## Why an epic ends with a retro

The status log is written so that lessons survive — but surviving in a diary is
not the same as operating. A constraint two sessions each rediscovered, a
defect class review flagged three times, an Owed line nothing inherited: all of
it is already written down, and none of it changes the next epic unless
something moves it from the record into the rules. That move is the retro: owed
work becomes tickets, repeated rediscoveries become instruction-file lines,
repeated review findings become invariants the next reviewer judges against.

Three constraints keep it honest. The mining runs in a fresh-context agent
(user request at the autonomous epic's retro, 2026-08-08): the invoking
session is usually the one that planned the epic or ran its tickets, and it
carries exactly the opinions the record is supposed to be examined against —
the same reason a ticket's implementer is a fresh worker rather than the
session that discussed the work. The retro proposes and stops — the human
approves what becomes a rule, at a gate held in their own session. And its
output ships through `/flow:quick`, not by committing to the default branch
directly: lessons are changes like any other, and they go through a reviewed
pull request. The status log itself is never edited — the retro appends a
final dated section and the epic is closed.

## Why the reviewer is told what *not* to flag

A reviewer prompted only to find problems will find them, sound work or not. The
first version of this produced vague suggestions, invented syntax errors, and
advice to add error handling to functions that already had it — and the reader
learned to skim past all of it, including the real findings.

So the skill carries an explicit exclusion list, a verification bar (a behaviour
claim needs a `file:line` citation, not an inference from a name), a cap on
nits, and re-review convergence that suppresses new nits after the first round.
Without the last one, a one-line fix reaches round seven on style.

## Why tests are reviewed as suspiciously as code

One session writes the implementation and the tests. If it misunderstands
something, it misunderstands it in both places: the test executes the code, never
checks it, and the suite goes green. Across a large sample of real
agent-authored pull requests, roughly four in five test patches turned out to
have weak or absent assertions.

Coverage cannot see this — a line can be fully covered by a test that asserts
nothing about it. That is why the reviewer is pointed at assertion quality
specifically, and why the ticket skill treats a surviving mutant in changed code
as an unfinished acceptance criterion rather than a separate concern.

## Why tickets go one at a time

Working an epic by stacking each ticket on the last is tempting: nothing waits.
In practice it produced a single pull request of forty commits and thirteen
thousand lines, which could not be reviewed and was closed unmerged. Shipping it
required hand-carving a smaller branch — and to make that small enough, the
epic's own ticket document, status log and context were **deleted**, twenty-five
hundred lines of the project's memory, surviving only on an abandoned branch.

Two constraints came out of that. Tickets never stack ad hoc — work
integrates one reviewed pull request at a time, whether those pull requests
target the default branch (incremental) or the epic branch (release). And
**the epic's documents are never deleted to make a diff smaller** — if a pull
request is too big to review, the epic was too big to plan that way.

The stacking temptation itself was later answered structurally rather than
prohibitively: a release epic gives "nothing waits" legitimately — tickets
integrate into `epic/<name>` without a human between them — while keeping
per-ticket pull requests, per-ticket review, and one human release gate.
That is why serial-to-main stopped being the universal default: the record
showed disciplined users stacking anyway (Q-10–Q-17), which was the rule
mismeasuring their throughput needs, not the users misbehaving.

## The admission test

Every artifact and gate in this workflow must do at least one of four things:
**reduce uncertainty, constrain blast radius, preserve necessary knowledge, or
provide decision evidence.** If it does none of them, it is ceremony — however
disciplined it looks.

The rule arrived in an external review of this workflow, and was adopted
partly because it worked on its source: about half of that review's own
proposals failed it at this project's scale (a standalone principles document,
a per-ticket risk matrix, a canary-and-kill-switch toolkit) and were rejected,
while the ones that passed are now in the skills. It cuts both ways by design:
it is the bar any proposed addition must clear, and the test for removing
pieces that no longer earn their keep. The workflow's failure mode is not
chaos — it is immaculate records with rising lead time, gates multiplying
faster than the risk they retire.

## Why an epic states its outcome

Acceptance criteria prove the implementation behaves as intended. For a long
time nothing in the flow asked whether the feature was worth building — the
loop could execute perfectly and still ship something nobody needed, and no
document would ever notice. That is the most expensive kind of success, and it
is invisible to a delivery engine.

So the epic template opens with an **Outcome** line: the problem and who has
it, the observable change expected, the evidence that would show it, and the
condition that would reverse the decision — written at planning time, when
disagreeing costs one conversation. The plan reviewer flags an outcome that
cannot fail, because an unfalsifiable outcome is a promise to never learn
anything. The retro closes the loop by checking the evidence.

This is the only part of the flow that looks past the merge, and it does so
without violating "nothing runs after the merge": the check belongs to the
next human-invoked retro, not to a post-merge hook. There is still no command
after the merge.

## Why risk, not just size, gates the quick path

The quick path's original gate was size alone: one concern, a few bullets of
criteria, a small diff. A two-line change to an authorization check passes
every one of those bullets and is still the most dangerous diff of the week —
line count measures neither blast radius nor reversibility.

The instinct already existed in one place: the ticket skill scales review
effort to consequence, forcing its highest tier for changes of exactly this
shape. But review effort is applied after the work is built; the entry gate is
where the decision is cheap. So the quick skill carries the triggers at the
door, routing such work to `/flow:epic` at any size — a single-ticket epic is
fine; what consequential work must not skip is the plan review and the human
sign-off.

The triggers themselves are deliberately not listed here — the two skills each
carry the one list where it is executed, bound by a same-commit inheritance
rule (in both skills, and in the repository's own instruction file), because
they measure the same thing at two doors. They diverged silently once: the
quick path learned payments and data rewrites at its birth, the review tier
did not, and reconciling them cost a ticket. An enumeration in this document
would be a third copy with no execution site, which is how the last drift
started.

## Why small work has a path

For a while the flow had no answer for a one-off bugfix. Everything went
through an epic folder, so sub-epic work faced a choice between ceremony it did
not earn and no flow at all — and in practice people choose "no flow at all",
which means no written scope, no fresh-eyes review, no log entry, no record.
The ambiguity itself was the defect: a methodology that is silent about small
work is implicitly telling people to skip it for small work, and "small" is
self-declared.

`/flow:quick` resolves it by keeping the parts that pay for themselves — scope
with a binding "Not in scope", verification with counts, the fresh-context
reviewer, an append-only log entry, a pull request — and dropping only the
planning conversation, the sign-off gate and the epic branch. The tickets live
in `epics/quick/`, a standing epic folder, so the board derives their state
with **no special case**: a quick ticket is just a ticket whose epic never
needed planning. The branch is cut straight from the default branch and carries
the ticket doc with it, which is why no epic branch is needed.

The size gate is the load-bearing part. Quick work must fit one concern, a
couple of acceptance bullets and a reviewable diff — and when it does not, the
instruction is to stop and plan an epic, not to proceed quickly anyway. Without
that gate, "quick" becomes the path around the methodology instead of a path
through it.

Quick's execution model reversed once, in each direction, and both reversals
are worth keeping on record. At the autonomous epic's retro (2026-08-08)
execution moved **out** of the invoking session — the fresh-context worker
and supervisor-hired reviewer, on the reasoning that quick's savings were
planning ceremony, never execution hygiene. The record then priced that
reasoning: the full execution loop cost ~150k tokens per ticket, on work
whose median instance was a one-line change, and the reviews mostly returned
nits. So quick moved back **in-session** (2026-08-11), this time deliberately
rather than by omission: the trade is named — the session that scoped the
work also implements it — and what holds the line instead is the pull
request, plus a fresh-context reviewer on a cost-efficient model whenever
behaviour changes, plus the risk gate that routes every consequential change
to an epic before this question can arise. The expensive guarantees did not
disappear; they live in `/flow:ticket` and `/flow:epic`, where the work is
large enough to repay them. The session guard's shape followed: every quick
run marks the session as carrying implementation context (so a later
`--interactive` ticket in it is refused — supervisor tickets, whose workers
start empty, stay open), and quick itself is never refused, because
in-session is now its design, not its leak.

## The failure modes this is designed against

- **Scope creep in a fresh session.** An agent doesn't know what it doesn't know,
  so anything not forbidden looks in scope. Hence "Not in scope" on every ticket,
  and "do not start the next one".
- **Silent adaptation.** When code contradicts a document, a helpful agent
  "fixes" the mismatch whichever way is easiest and the divergence vanishes
  unrecorded. Hence stop-and-report, even when one side is obviously right.
- **Self-review.** A session cannot review its own reasoning.
- **Findings quietly dropped.** Hence a required disposition with a reason, and a
  separate bucket for pre-existing defects so they are handed on rather than
  argued away.
- **Documents that flatter instead of inform.** "Everything works" is useless.
  The next session needs commands, counts, evidence, and an explicit list of what
  was *not* verified. The **Owed** line is required even when empty.
- **Hand-maintained mirrors of derivable facts.** They drift within days.
- **Memory stored where it cannot travel.** A gitignored document inside a
  disposable checkout is not memory. Neither is one deleted from a release.
- **Work that finishes but never ships.**
- **History edited into fiction.** Append-only is what lets ticket N+5 trust the
  log. Corrections are new dated addenda.
- **Assumed context.** Every status entry is read by someone who was not there.
  No unexplained codenames, no "as discussed".

## Things that were built and removed

Kept here so they are not rebuilt on the same reasoning that failed the first
time.

- **A post-merge command.** Its two halves were a pre-merge checklist (belongs in
  the pull request body, where it is actually read) and post-merge cleanup
  (unnecessary, since the next ticket re-cuts its branch anyway).
- **A parallel launcher** that started several tickets at once, each in its own
  checkout. Built and never used; an untested parallel launcher is worse than
  none. Practitioner accounts converge on three to five concurrent agents as the
  ceiling, and the constraint named every time is review bandwidth, not machines.
- **Deploy preconditions as a ticket field.** The risk is real — a fail-closed
  guard whose secret is missing takes the system down — but a dedicated field was
  more structure than it earned. It belongs in the pull request body.
- **A dependency graph with parsed `Depends on:` fields and automatic stacking.**
  It computed something the branch already knew, and its failure mode was silent:
  a dependency written in prose rather than as a bare ID read as a hard blocker
  and stalled the ticket.
