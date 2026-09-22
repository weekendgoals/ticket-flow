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

A third consequence arrived later (2026-09): what is derived includes **what
no document mentions**. weekendgoals' redesign-city epic closed its last
ticket, and the session then committed ten more changes to the epic branch —
a production crash-loop fix, a changed endpoint contract, a moved site-wide
component — none with a ticket, a status entry or a spend figure. All of it
was defensible work; the retro, the release reader and the ledger saw 17
tickets and not the 18th unit of work. A rule ("always open a ticket") was
already in force and did not hold, so the board now derives the gap the same
way it derives everything: commits on the epic branch, not on the default
branch, not merges, touching something outside `epics/`, whose subject opens
with no ticket ID. It warns and gates nothing — the work may be right, and
what is missing is a record, which only a person can decide to write. Commits
subjected with the epic's own name are listed without a warning: this
repository's release-review fixes are work no ticket owns by construction,
and a report that flagged a convention somebody chose would be noise by its
second epic.

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

The tier is **floored by code in the unattended lane** — a gap closed after
an external read of the workflow named it: the worker reported its own
diff's tier, and the driver priced the reviewer from that report alone,
which meant the party under review priced its own judge. The driver guarded
the malformed case (a missing or unrecognised tier prices as consequence)
but not the wrong-but-well-formed one — a worker calling a code change
`prose` bought itself the weakest review, and nothing checked. So the
driver now reads the branch's changed file list through a read-only
fast-model step and computes a floor in code: docs-only files may keep the
prose price, anything else floors at normal, and the epic's optional
`Consequence paths:` globs — the risk list projected onto the repository's
layout — floor at consequence. The report can raise the price, never lower
it. The split respects what code can actually know: "which files changed"
is mechanical, "is this markdown read by a machine" is not, so the
prose-vs-normal judgment on a docs-only diff stays with the worker — able
only to push the tier up. This is the same rule as "a gate is verified at
the door its actor walks through": the attended lanes need no floor,
because there the tier is picked by the supervisor or session, which is
not the party under review.

The tiers' models are **named, never inherited** — a later lesson from the
same ledger. The normal tier originally read "the class this session runs
on", which sounded neutral and priced review by accident: sessions that
launch runs tend to run the most expensive class available, so every routine
review silently billed at the ceiling. The same reasoning fixed the other
two roles in opposite directions. Workers now default to a pinned capable
model (`Worker model: opus` in the epic template) rather than inheriting the
planning session's — implementation is the largest line item per ticket, and
plan-on-strong, implement-on-capable is where most of the lane's cost lives.
The plan reviewer is pinned to the strongest model outright: a wrong
decomposition is the one defect that costs every ticket built on it, so that
is the single place capability spend has no cheaper substitute.

Whether the reviewer must be *stronger than the implementer* was examined
(2026-08-19) and settled as a pairing, not a rule. As a rule it fails at
the edges the ledger already paid for: review is priced by what the diff
can break, because a maximum review of a docs diff buys nothing — and
where the stakes are highest the guarantee already holds, since the
consequence tier and the plan reviewer sit at or above every implementer.
But the intuition survives as a profile: a cheap implementer under a
stronger judge (`Worker model: sonnet`, `Reviewer model: opus`) is
coherent and likely cheaper in total than a strong implementer under
tiered review, because worker spend dominates the per-ticket bill and one
strong pass over a diff costs less than a strong generation of the whole
implementation. The epic template now names both pairings —
capable-implementer and strong-judge — with the decision rule beside
them; the run records' per-ticket findings and meter deltas are the
evidence that picks between them, epic by epic, and the printed default
moves when a live ledger says so, not before.

## Why the re-review became a code gate below the consequence tier

The re-review existed so a merged diff is always a reviewed diff: fix
commits land after the review that approved everything before them. The
principle held; the price did not. Across the first two live runs, all five
re-reviews at the normal tier returned zero Important findings —
reviewer-scale spend, per fixed ticket, buying nothing — while an
independent audit later showed a normal-tier re-review approving a fix
commit whose new regression assertion was tautological. A pass that costs
like a review and demonstrably catches neither category is ceremony under
the admission test.

What replaced it constrains blast radius instead of re-judging: the reviewer
reports the head it reviewed, the read-only resolve step diffs the fix
commits against it, and code — not a model — measures whether the fixes
stayed inside the files the review saw (plus the files its own findings
name) and under a small line budget. Inside those bounds a fix is
re-verified by the disposition's re-run counts and re-read by the human on
the release pull request. The consequence tier keeps the full re-review —
capability spend belongs where failure is expensive — and a review that
cannot name the head it reviewed sends its fixes there too: doubt raises
scrutiny, never lowers it.

Leaving the bounds first halted the run, on the reasoning that new work
deserves a review and granting one is a human's decision. Three live trips
say the second half of that was wrong. GHL-1: 66 lines, 18 of them a
translation fan-out, merged by hand under a standing rule with no re-review.
GHL-9: 119 lines; re-reviewed by hand, 41,368 tokens, 0 Important. GHL-10:
two files outside — the two its own findings said were missing; re-reviewed
by hand, 40,465 tokens, 0 Important. Every trip was a clean fix, every halt
cost a human a resume, and in two of the three the human's answer was to buy
exactly the pass the run could have bought itself. So a trip now buys the
bounded re-review at the consequence tier instead of halting, an Important
finding in it halts on the same stop condition the consequence tier's own
re-review uses — one event, one stop string, one class for the retro to read
— and only a fix diff nothing could measure still halts, because a
re-review of an unmeasured diff proves nothing. GHL-10's shape also moved
into the bounds themselves: for the finding class "the deliverable named in
scope was not produced" the fix lands outside the reviewed diff **by
construction**, so the files the findings name count as inside.

The reversal condition, and its first data point. If a bounds re-review ever
lets an Important defect through to a release pull request — found by the
human at the release gate, the one observer left after this change — the
halt is restored and the epic's record says what the automation cost. The
first data point already exists and is not yet that failure:
redesign-foundation's FND-6 made a test-motivated out-of-bounds fix that a
bounded re-review cleared and a later commit corrected. A bounded pass
clearing a fix that needed a second look is the failure mode to watch, not a
reason to keep a halt that fired three times on clean work. Separately, PR
#42 proposed a `Fix bounds exclude:` line — a planner-declared exclusion for
fan-out files like GHL-1's translations — and never reached the default
branch: its merge commit `8ac3bef` sits only on `origin/addendum-gate-date`.
This section supersedes it for the halt; whether the exclusion also lands is
a separate decision and a separate pull request.

### The one trip that halts again: a fix that adds files elsewhere

Trading the bounds halt for a re-review assumed that what trips the gate is a
fix — somebody's deliberate edit, a little wider than the review saw.
weekendgoals' redesign-city run (2026-09) met the other thing that trips it:
a disposition agent ran `git add -A` and committed **every untracked file in
the working tree — 215 files, 1,927,382 lines**, production-data exports
among them — as a "review fix". It halted only by accident: one of the files
was binary, so the diff was unmeasurable. Without that file the trip would
have *bought a re-review of the sweep*, and at the consequence tier the fixes
go to a re-review without meeting the bounds gate at all.

Two layers answer it, because either alone is the soft half. Every prompt
whose agent commits now carries the staging rule the ticket and quick skills
already gave an in-session doer — stage by name, never `-A` — with its
reason; and the driver reads what the fix commits **added**, at every tier,
before any re-review is hired. The rule is about *where*, since a fix rightly
adds a test beside the code it fixes: an added file must sit under a
directory the reviewed diff touched or a finding named. It halts rather than
buying scrutiny because no reviewer's reading of a swept tree is evidence of
anything, and the recovery — revert the sweep as a new commit — is a human's
to confirm. The repository root is matched by equality, not prefix: nearly
every ticket touches a changelog, and a prefix rule there would admit the
whole tree and leave the gate decorative. What would reverse it: the halt
firing more than once on a fix that rightly added a file — then the rule
is mismeasuring fixes, and it goes back to buying the re-review.

## Why acceptance criteria can be machine-runnable

Adopted from a comparative read of unlazy (2026-08-20), whose gate files —
acceptance criteria written as runnable CHECK commands with expected output —
passed the admission test on decision evidence: a criterion a command decides
is one no agent can satisfy by narration. The gap it closes here was the last
of its kind: after the merge gates moved into code, the one merge-relevant
fact still taken on an agent's word was the worker's own verification claim —
"12/12 passed" in a schema field, honest by instruction only. A `CHECK:` line
under a criterion moves that claim to repository state: `tickets.mjs check`
runs the command, compares the output against `EXPECT`, and reports a ledger
whose evidence is the deciding output line, and the unattended driver gates
the merge on those counts in code.

The source idea needed one correction to survive here. unlazy's gates are
written by the same agent that then satisfies them — self-certification moved
up a level, not removed. In this flow the criteria are written at planning
time, challenged by the plan reviewer, and signed off by a human — and the
driver reads them from the **signed-off document on the epic branch**
(`--from origin/epic/<name>`), never from the copy riding the ticket branch,
so the party under review structurally cannot soften its own gate. The same
fail-closed rule applies as everywhere else in the run lane: a CHECK that
almost parses fails the gate rather than silently never running (doctor
flags the near-miss shapes), and a check step whose counts the code cannot
read halts — doubt goes up, never down.

That sentence needs its bound stated, or it will be read as more than it is.
`--from` secures the command string and nothing the string reaches. The text
of the CHECK comes from the signed-off document; everything the command runs
through is still the reviewed party's to write — the npm script it invokes
(redesign-foundation's FND-5 found no `test:it` script existed and created
the one its own criterion runs), the spec file that script executes, and the
assertion inside that spec. A criterion that greps a file for a string is
secured end to end, because the command *is* the assertion. A criterion that
shells out to the repository's own test tooling is secured only as far as
the tooling's name, and the same worker owns the rest. Two mechanisms close
part of the gap. HARD-1's `allPassed` gate reads the ledger's own verdict
and halts on a malformed CHECK rather than letting a criterion that never
ran exit 0 into a green count — the shape a worker's edit would most cheaply
produce. RUN-2's red-before rule requires the criterion to have been *seen
failing* on the tree before the work existed, so a gate quietly hollowed out
later has to explain how it was ever red. What closes the rest is not a
mechanism but the human at the release gate, reading one diff that contains
both the criterion and the code it judges. Naming the limit is the point: a
gate believed to prove more than it proves is a gate nobody re-examines.

The first three live release epics found the second correction: a CHECK is
only evidence if it was ever **red**. Six of groundhopper-foundation's eight
CHECKs were a whole-suite run with `EXPECT: Tests:`, which passes on the tree
before the ticket exists and therefore measures nothing the ticket does; a
suite is a standing check the doer reports, not a criterion. Worse, FND-2's
`MobileSidebar` CHECK passed vacuously — its `\|` reached grep as a literal
through the quoting layer — and merged green having tested nothing, while
FND-6's `grep -rc` printed `file:0` against an `EXPECT` of `1`, a comparison
no correct code could satisfy, and halted the run. So the rule is
red-before-green, proven at the door the criterion is written at: the planner
runs each CHECK on the current tree, records which were red and which could
not run here, and the plan reviewer — who has no stake in the plan — re-runs
the runnable ones under a per-command bound. A CHECK green before the work is
a finding; a CHECK that errors is a finding. Doctor carries the two shapes
that can never pass, so the cheapest of these is caught without an agent at
all. It carries one shape that can never *fail*, too, found by that same
red-before-green run while planning the `retro-lessons` epic: `node --test
--test-name-pattern <p> <file>` prints `# pass 1` when the pattern matches no
test at all, because the file itself counts — so a CHECK written to name the
one test a ticket adds, expecting `# pass 1`, is green on the tree before the
test exists. Two of that plan's own draft CHECKs read green this way, in the
repository that wrote the rule; the ledger run is what caught them, which is
the argument for running it rather than reasoning about it. The admission test: this reduces uncertainty (a criterion nobody has
seen fail is a criterion nobody has tested) and provides decision evidence at
the sign-off gate, where the ledger is shown.

The third correction came from console-foundations, and it is about what
"green" means. A criterion's command can exit 0 while the work it names never
ran: the house convention for a Postgres suite is to skip itself without
`DATABASE_URL`, and a verbose reporter still prints the test titles an EXPECT
matches — on the line that says they skipped. CF-3 measured it: `4/4 checks
passed` with every evidence line reading `↓`, and every ticket in that epic
needed a human to eyeball the markers, which is precisely the check the gate
exists to perform. So the ledger has three verdicts rather than two. A skip is
not a pass, because a run that did not happen is not evidence; and it is not a
failure either, because calling it one sends a reader to debug code that is
not wrong, and a gate whose red means two unrelated things is a gate people
learn to argue with. Naming the third state is what makes the repair
legible — supply the prerequisite, or point the EXPECT at a line that proves
the run — and it keeps the gate's own contract: only checks the ledger counts
as passed green a merge.

Two deliberate limits. CHECK is optional, because most criteria are not
mechanizable and forcing them into commands is ceremony — prose criteria and
runtime demonstrations remain first-class, verified by the worker and held by
the review. And the driver runs the checks once, after the disposition, not
before the review: fix commits change the code, so the only run that proves
the merged state is the one against the final pushed branch — the worker's
own step 5 run already caught the cheap failures before the reviewer was
ever hired.

## Why the fidelity differ ships no browser

A design is checked the way a page is looked at: by eye, and by whoever
happens to open it. In the page epic that produced this epic's evidence, nine
tickets passed six gates and shipped a page missing three drawn elements; two
review rounds later eight differences had been found, every one of them a
computed-style value, every one found with `getComputedStyle`, none found by
eye. "Renders as the design draws it" is not a criterion, because the worker
satisfies it with the properties it already believes are right.

So `scripts/fidelity.mjs` makes the comparison mechanical, and the shape it
takes is decided by one constraint that is not about designs at all: this
plugin installs into a project by being copied, with no `package.json`, no
dependency and no state — which is why `tickets.mjs` derives every fact from
git rather than storing one. A differ that drove a browser would need a
browser driver, and the first project whose toolchain disagreed with that
driver could not install the plugin at all. The differ therefore does the two
halves a browser is not needed for, and hands the middle back: `extract`
prints the source of one self-contained function expression, whatever browser
the project already owns evaluates it on a rendered page, and `diff` compares
the two JSON reports in pure Node. The cost is a manual step in the loop; what
it buys is that the page is measured by the same engine that paints it,
instead of by a second renderer the plugin would have to agree with.

Three consequences are worth stating because each one is a rule somebody will
otherwise simplify away. The property set is **fixed**: a per-project property
list would make two epics' tables incomparable, and the set is the one every
found difference fell into. Comparison is **normalised** — lengths within
0.5px, colours as rgba, `font-family` by its first family — because two
renderers print one value two ways, and a table of noise is a table that stops
being read. And `removed`, the list of drawn elements deliberately not built,
is honoured **only** from a file named by `--removed-from`, never from the map
the run passes as `--map`: workers must edit the map, since its `page`
selectors are written before the page exists, so a single file holding both
would let a worker who could not build an element declare it removed, get a
clean diff, and halt nothing. That is the founding failure re-routed through
the new machinery, which is the failure a new gate is most likely to have.

## Why an epic declares its design sources

A differ is no use to a reader who cannot find the design. In the page epic
this work came from, no acceptance criterion referenced the drawing, neither
reviewer was handed it, and the only person who ever put the page beside the
artboard was the human at the pull request — twice, finding eight differences
both times. Nothing was hidden: the design existed, in a file, in the
repository. It was simply not written down anywhere a fresh context would
look, and a fresh context is what every worker and both reviewers are.

So the epic's preamble carries one line, `Design sources:`, and every reader
downstream gets it from the same place it gets the delivery and the models:
`brief` for a worker, the packet for the ticket reviewer, the plan review's
inputs for the plan reviewer. Declaring it is what makes "the reviewer was not
given the design" a fixable omission rather than an invisible one.

Two shapes of that line are decided rather than left open. It is **read from
the signed-off ref** like every other declaration, because a ticket branch
that could add a design source to its own copy of the preamble could hand its
reviewer a drawing nobody approved. And it is the **one declaration that
carries no prose**: every other line keeps its first word and lets commentary
follow, which is right for a glob and wrong for a file a designer named `City
Desktop.html` — that parse would hand every reader `designs/City`, a path to
nothing, and nothing downstream would say why the comparison never ran. The
whole text between commas is the path; doctor names a declared path that does
not exist, in full, for the same reason.

## Why a fidelity criterion is the one the code never runs

Every other machine-runnable criterion is a command the board script executes:
that is what makes a CHECK something no worker can satisfy by narration. A
`COMPARE` cannot be, and the reason is the same one that shapes the differ —
the plugin owns no browser, because a differ that shipped one would be a
plugin some project could not install. So the comparison is performed by the
lane that has a browser (the ticket's own verify step, in the project's own
tooling) and the code gates something else: the **presence** of the
`**Compared:**` table in the status entry, which is FID-4's gate, at a door
the code can actually stand in.

Three consequences follow, and each is a rule rather than a detail. Compare
rows are counted in **neither `total` nor `passed`**, because the unattended
driver halts when `passed !== total` — a comparison counted there would halt
every ticket that carried one, which is a gate that fires on its own
correctness. A malformed COMPARE is nonetheless a **ledger problem** that
fails the gate, for the reason a malformed CHECK is: a criterion nobody can
read is a criterion nobody performs, and it must not be quiet. And the
criterion **names its landmarks**, because "renders as the design draws it"
is prose a worker satisfies with the properties it already believes are
right — which is how nine tickets passed six gates and shipped a page missing
three drawn elements.

The removals are the part most likely to be simplified away. `removed` lives
in the design map, and the differ honours it **only** from `--removed-from`,
a file the verify step fills from the signed-off ref — never from the `--map`
the ticket passes, which is the copy that ticket edits. Both files are
usually the same path at different refs, and that is exactly the point: a
worker must edit the map (its `page` selectors are written before the page
exists), so a single reading would let a worker who could not build an
element declare it removed, get a clean diff, and halt nothing. That is the
founding failure re-routed through the new machinery, which is the failure a
new gate is most likely to have.

One state had two answers and now has one. A landmark the signed-off list
declares removed, absent from the design and the page alike — the designer
dropped it too — used to count as "nothing compared" and be refused as
unreadable input when it was selected alone, while the same pair over the
whole map passed with a note. Two answers to one state is the shape a gate
gets routed around, so the agreement is now a row of its own: the plan, the
design and the page concur, which is evidence, not the absence of it.

The opposite silence — a landmark on neither side that nobody declared removed
— stayed a note for a release, and the first attempt to fail it repeated the
mistake above: it failed under `--landmarks` and passed over the whole map,
so the recovery from exit 1 was to drop the flag. The note was not laziness.
A map may span several design sources and an element may be drawn at one
width only, so the differ could not tell a missing element from one that was
never meant to be there. What was missing was planning's word on where each
landmark is drawn, so the map carries it (`source`, `widths`), optional and
read from the signed-off ref like removals: where the map says a landmark is
drawn, silence fails, with the flag or without; where it says nothing, the
differ keeps saying what it knows, which is a note.

## Why a missing comparison stops the merge

A criterion nobody performs is worse than no criterion: it is a gate that
reports itself green. The page epic that produced this evidence had a visual
criterion on one section; it was satisfied by a worker's reading of its own
work, and the gaps between sections belonged to nobody. The `COMPARE`
criterion replaces the reading with a differ, but the differ runs in a lane
the code cannot see into — the project's own browser — so something has to
hold the door.

What the code can hold is the **presence** of the evidence, and that is what
it holds: the `**Compared:**` table in the pushed status entry. The content
is left to the reviewer, who can re-run the differ and whose fresh context is
the only thing that can check a worker's table at all. This is the same split
as everywhere else in the flow — code gates what code can decide, judgment
gates what it cannot — and it is why the gate reads a **count** and not a
table.

Three shapes of that gate are decided rather than incidental. It lives where
both facts meet: how many `COMPARE` criteria the **signed-off** section
carries comes from the acceptance step's ledger, how many tables the **pushed**
entry records comes from the resolve step, and the judgment happens before any
agent that could merge exists. It is a **subcommand**, `tickets.mjs compared`,
rather than a `grep` inside the driver's prompt: the driver's suite stubs
every agent, so a counting pipeline written into a template literal is
executed by no test, and a mis-escaped `\*\*` would first show itself as a
count of 0 on a live run — which reads exactly like a ticket that recorded
nothing, and merges it. And an unreadable count is **refused**, never read as
zero, because zero is precisely the value that would skip the gate.

The recovery works in the refused state, which is the property a refusal is
worth having. Where a browser exists, run the differ and append the table in
a dated addendum. Where none does — an image, a PDF, a lane with no renderer
— a human writes `**Compared:** owed`, with who accepted it and why. That
line satisfies the gate and satisfies nobody reading it, which is the correct
asymmetry: the record says a comparison was owed and not performed, and the
merge is a decision somebody made rather than one a missing file made for
them.

## Why a design is a fourth artifact

The methodology names three kinds of artifact: documents, a diff, and tests.
A design is a fourth, and for a long time the plugin had no slot for it. The
consequence was not that anyone ignored the drawing — it was that nothing
carried it. In the page epic this epic was mined from, nine tickets passed six
gates and shipped a page missing three drawn elements. No acceptance criterion
referenced the design; neither reviewer was handed it; the only reader who ever
put the page beside the artboard was the human at the pull request, twice, and
each time found differences the gates had not.

The tempting diagnosis is that the criteria were not checkable enough, and it
is the wrong one. A visual criterion *was* written — scoped to one section —
and the gaps between sections then belonged to no ticket at all. **Scope, not
checkability, was the cause**, and the two fixes it implies are different: a
differ makes a criterion mechanical, while a **whole-page ticket** makes the
page somebody's. An epic that declares a design therefore ends with one, and
it goes last among the tickets that build, because it can only compare a page
the other tickets have finished building — only the human render-and-read
ticket follows it ("Why a page epic also schedules a human", below).

The other half is what a plan is allowed to narrow. A design draws more than
any release builds, and that is normal — what is not normal is the narrowing
living only in a ground rule's prose, where a comparison meets it as an
element that is simply absent. So a plan that narrows what the design draws
**declares the removal** in the design map, with the element, the deciding
rule and the date, and sign-off approves that list. Then the diff prints
"removed by <rule>" instead of nothing, one file holds everything the build
deliberately does not draw, and the decision stays with the party that made
it. The ticket under review is the one party that must never be able to
declare its own missing element removed: that is the founding failure, and
routing it through new machinery is the most likely way to rebuild it.

Both halves rest on the design map being complete, which no code can check —
a map that matches itself always passes. That is why the **plan reviewer** is
handed the design and asked to walk the drawing rather than the map: an
element no landmark covers is silent by omission, invisible to the differ, to
the table and to everyone reading the table. It is the one reading nobody
downstream can perform, because nobody downstream holds both the drawing and
the plan.

### Why a page epic also schedules a human

The whole-page ticket was the previous retro's headline proposal, and
redesign-city then tested it: CITY-16 *was* that ticket, and one further
ticket plus ten post-ticket commits still found five differences — two
anchors to one URL, a chip sitting where the artboards draw a button, a table
breaking on its longest row, a map fit squeezing a card to 60px, a weekend
grid spending its six slots on unticketed fixtures. The pattern in who found
what was exact: **every difference a gate or an agent caught was a
computed-style value; every difference a human caught was a judgement about
composition or behaviour.** The first class is mechanisable and the differ
mechanises it. The second is not — nothing computes whether a fixture
deserves a slot — and leaving it unscheduled does not remove it, it moves it
to after the last ticket, where it arrived as ten commits no document
records.

So a page epic budgets a human render-and-read ticket, after the whole-page
comparison and before the release: criteria that are questions, answered with
the built page open on real data, findings that become tickets. It is
human-owned in every delivery mode, for the reason every lane rule here asks
— name the actor and check the mode provides one — and it passes the
admission test on decision evidence: it is the only place the release reader
learns that somebody looked.

## Why the reviewer is handed the design

Everything else in this epic makes the comparison possible; this is what makes
it checked. The worker's `**Compared:**` table is produced by the party under
review, from a map that party may edit, in a browser nobody else watched. Read
as evidence it is exactly the shape the methodology distrusts everywhere else —
a claim by the author that the author's work is right.

So the reviewer is given the design sources, the **signed-off** map and the
table, in all four copies of the packet, and told what to do with them. Where
the project's own instruction file says how to serve and drive a page, it
re-runs the differ: the reviewer is the only fresh context that can, and a
table the re-run contradicts is Important. Where nothing can render — a sandbox
with no network, a design that is a PDF — it audits the table against the
design source's markup and **says the page was not rendered**. That sentence is
load-bearing: an audit silent about not having rendered reads as a
confirmation, and the epic this work came from shipped on exactly that kind of
silence.

Two lenses ride with it, both instances of defects the flow already names, in
their visual form. A **`removed` entry added or changed in the ticket's own
diff** is the reviewed party declaring its own missing element removed — a
clean comparison bought by editing the gate, which is why removals are honoured
only from the signed-off ref and why this is Important however reasonable the
entry reads. And **a style assertion that reads a property off an element while
the page paints something else** — an inline style beating the rule under test,
an assertion on a wrapper while a child paints, a property read at a width the
test never set — is the visual form of the test that executes code without
checking it: the assertion passes, the page is wrong, and the suite reports the
opposite.

## Why token figures are observed, never asked

The Tokens lines exist as planning evidence — they are what priced the
review tiers and moved quick back in-session. For a while the figures were
self-reported: each agent's schema demanded "your harness-reported token
figure, never an estimate". The first live campaign showed what that was
worth: an agent cannot see its own counter, so nearly every figure came
back `unknown` — and the one that did not was invented and had to be
corrected by addendum (flow-demo, NOTE-1). A mandatory field an agent can
only fill with `unknown` or a guess is ceremony at best; at worst it
teaches the record to carry numbers nobody measured.

So the figures now come from the one place they exist: the harness, read
by whoever watched an agent stop. The supervisor records the spend the
harness reports when its worker and reviewer finish and hands the figures
to the addendum; the unattended lane's session sums the run's own
per-agent transcripts into the run record after the run, because the
driver script observes no counter either — inside the run, entries and
addenda just point there. In-session work stays `unknown`: a session
cannot observe itself, and `unknown` is an honest answer where a guess is
not. The old rule survives, finally enforceable because no field invites
an estimate: harness-observed or unknown, never estimated.

### Why time is metered the same way, and why it has a unit

Tokens said what a ticket cost and nothing said where the afternoon went. A
three-ticket run's first ticket (weekendgoals, FND-2) held the lane for 39
minutes with nothing else able to start, and its record could not say
whether that was the worker, the review, or the driver waiting between them
— metered afterwards it reads `worker=1430s … wall=2353s`, the roles summing
to 2351: the agents, not the driver. The obvious instrument — the
driver timing its own steps — does not exist: a workflow script has no clock,
`Date.now()` throws there. Asking each agent how long it took would repeat
the mistake above with a different number. But the harness had been writing
the answer down all along: every transcript line carries a timestamp. So
`scripts/meter.mjs` reads a finished run's journal and transcripts and
prints the `**Time:**` line, and — since it is reading the same files — the
`**Tokens:**` line too, which retires the last place the ledger's arithmetic
was done by a model reading JSONL. A message streamed as several lines
carries its usage on each; summing lines instead of messages roughly doubles
a worker, and nothing in a hand-summed record says which was done.

`wall` is recorded separately from the roles because their difference is the
finding. A ticket whose roles sum to its wall was slow because its agents
were; one whose wall is far above the sum was waiting on something that is
not an agent, and only the second is a driver problem.

The unit is there because the ledgers share a grammar — two of them when
this was written, four since. `spend` reads a
`<ID> worker=<n>` group wherever it sits in a record — that is what lets a
correction addendum land anywhere — so a bare duration would be added to the
token ledger silently. Seconds carry an `s`, a figure with a unit is never a
token figure, and time is read only inside a `**Time:**` paragraph, since
`worker=unknown` looks the same in both. The first review of this found the
wall one character thin — `worker=1,430s` backed off to `worker=1`, one
token, over a real 462,249 — and found the paragraph too wide: taken whole,
it swallowed a token group written on the line beneath the Time line, and
those figures reached neither ledger. The repair for that was a line-level
cut — the paragraph is the lines that hold nothing but time — and the second
review found it worse than what it replaced: one parenthesis on a wrapped
line dropped a whole ticket's time, silently, and handed that line's
`worker=unknown` to the token ledger, `unknown` being the one figure with no
unit to stop it. A line is the wrong thing to accept or reject, because
people put words on lines. The split is by group: every time group in the
paragraph is lifted out whatever stands beside it, and the rest goes back to
the token text.

### The follower rule, and the three cuts that lost figures

The other half of that wall — what a token group may be followed by — is a
refusal, and **cut A**, the first one ever written, refused a group followed
by any `<role>=` pair at all. It threw away whole groups the parser had been
reading correctly: `A-1 worker=100 reviewer=50 wall=9`, `… reviewer=228k`,
`… reviewer=` — the figures before the unreadable pair went with it,
silently, wherever a sibling group in the record parsed. What replaced it is
the refusal the parser has shipped ever since: a follower that is TIME-SHAPED,
or the unitless `unknown`.

Adding the cache-reads and models ledgers cut at that refusal three more
times, and each cut lost a figure somebody had observed. **Cut 1** refused
any letter-initial follower, on the reasoning that every model name is one —
and took `disposition=none`, `re-review=n/a`, `reviewer=skipped` with it,
which is what a record writes for a role that did not run, along with the
`proxies=5000` standing before them. **Cut 2** narrowed that to letter-initial
values *carrying a digit*, which lost the same groups one class smaller:
`re-review=round2`, `disposition=v2`, `reviewer=GPT5`. **Cut 3** left the
words alone and widened the unit instead, by a single letter — `s` to `[sr]`,
so that a cache figure could close a group as a duration does — and `C-1
worker=462249 reviewer=185339 proxies=12r` lost the reviewer's 185,339 while
the record's own Cache reads paragraph made the ticket look answered. That
one needed no widening at all: a token figure already ends where its digits
end, so `12r` was never a token pair and the group had always ended before it.

Three cuts, one mistake: asking what the NEXT pair looks like. The right
question is about the group. A token group can only be another ledger's group
in disguise when every pair it swallowed is `unknown` — the single value
every ledger shares, and the reason the paragraph wall exists at all. So the
rule that shipped **leaves the refusal exactly as it was** — time-shaped or
`unknown`, the spelling every existing record was read with — and adds one
test after the match: an all-`unknown` group is dropped when what follows
belongs to a ledger. That one loses no figure at all; the only thing it drops
is an `unknown` mark for a role nobody wrote a figure for. And a dropped
group is taken out of the text as a read one is, because it belongs to
neither ticket: left behind, its `worker=unknown` was absorbed by the
enclosing status entry, which is the same leak one ticket to the left.

The table in `tickets.test.mjs` holds a reading per line, taken from the
parser as it was before any of this, so the next cut fails a test rather than
an epic's ledger.

What the table pins is a statement about the whole parser, and it is worth
saying exactly: **outside a paragraph labelled with a ledger main never had,
nothing reads differently from main.** Inside one, two things do, and both are
the wall working. The all-`unknown` drop above is the first. The second is
that a paragraph is lifted whole: under `**Cache reads:** A-1 worker=unknown
reviewer=50`, main read `reviewer=50` into the TOKEN ledger — a cache figure
somebody forgot the `r` on, credited to a ticket's token spend — and here it
reads as nothing, with `doctor` naming the orphan and the repair recovering it
as `50r`. That is not a figure lost; it is a figure that was never a token
figure, taken out of the ledger it was leaking into. A record written before
these labels existed has no such paragraph, so nothing in it can read
differently at all.

The doctor warns for time are written so the repair they advertise ends
them, because the log is append-only: an addendum can add a group and can
never remove the prose that tripped a warn. The first cut fired on the stray
figure alone and stayed red after the repair had worked; a check that does
that teaches its reader to ignore it. The second cut asked only whether *any*
group parsed in the record, which hid the commonest loss — one ticket's group
parses, another's is malformed. So the stray-figure warn is per ticket: it
fires while the ticket named on that line has no time anywhere in the ledger,
and the addendum that gives it some is what clears it.

The commit span `spend` falls back to is the one figure here that is observed
and still not what it seems, so it is never called `wall`: commits begin when
the work is nearly over. It is shown because a labelled weak observation
beats `unknown` for a human, and named for what it is because a metric built
on it later would inherit the error invisibly.

### Where a new unit letter goes, and where it does not

Peak context added a fifth metered line and a fourth unit, `c`, and the
question the three cuts above make sharp is which of the two regexes it
belongs in. It belongs in `LEDGER_FOLLOWER`, the after-the-match test, and
not in `RUN_GROUP`'s lookahead — and the difference is what each one can
cost. Widening the lookahead decides which groups are READ, so a wrong
widening loses a figure, which is exactly what Cut 3 did by adding one letter
to it. Widening `LEDGER_FOLLOWER` can only drop an **all-`unknown`** group,
which by construction holds no figure: the worst it can do is fail to record
that nobody recorded something. The two are one letter apart in the source
and a whole class apart in consequence, which is why the comment on each says
so.

The letter itself was chosen, not inherited. Any letter keeps a figure out of
the token ledger — `NOT_A_UNIT` refuses a digit run followed by a letter — so
what a new unit has to earn is distinctness from the units already in use.
`c` is neither `s` nor `r`, so a peak figure that lands in a Time or a Cache
reads paragraph is read by **no** ledger rather than wrongly by one; had it
reused either letter, the paragraph wall would have been the only thing
between a 1.2M-token context window and a ticket's duration, and one wall is
one fewer than this ledger has needed at every other point.

A findings count carries no unit at all, and that is the same reasoning
reaching the opposite answer: `important`, `nits` and `unfixed` are not role
keys, so no other ledger's pair regex can read them and a unit would protect
nothing. What they keep is the paragraph, because the rule is "one grammar"
and a ledger that opted out of the wall would be the exception a later reader
generalises from.

### Why a peak is a max at every level, and carries no total

Every other counting ledger sums: two agents of a role spent two agents'
tokens, two rounds took two rounds' seconds. A context window does not work
that way — two agents held two windows one after the other, and a ticket's
second review pass held its own rather than stacking it on the first's. So
the peak is a max over an agent's messages, over a role's agents, over a
ticket's rounds and over an epic's tickets, and the line carries no `total=`
at all: a peak summed across tickets names a window no agent ever held, and a
figure headed `total=` beside four lines whose totals are sums would be read
as one. The epic's max is computed by `spend` from the groups, where it
cannot disagree with them — which is the same reason the Tokens line's
`total=` is a liability the newer lines did not repeat.

A Codex worker's peak is `unknown` for a reason that separates a peak from
every figure beside it. That agent is the runner's shell proxy: its tokens and
its cache reads are real cost, paid by this run whoever wrote the ticket, so
they are reported. Its context window is not a cost at all — it is a claim
about one model, and the window the transcript exposes is a few relayed JSON
blobs wide. Printed under `codex:<model>` it would say a Codex agent came that
close to its limit, which is the one thing nobody here observed. So the peak
takes the same gate the model does, in the same place and on the same
condition: two fields that must agree cannot be left to drift apart in two
different `if`s.

The `unknown` rule inverts too, and deliberately. A role with an unobserved
agent makes its SUM unknown, because a partial sum reads as the role's spend
and is silently low. A max over the same role could also only read low — and
low is the direction that matters for a peak, since the question it answers
is "did anything come near the limit?" — so it is `unknown` as well. Models
are the one ledger where a hole does not make the role unknown, because a
model is a label and an agent nobody observed cannot make an observed label
wrong.

### Findings, halts, and the two suffixes: measuring what the gates missed

The metered ledgers say what work cost. None of them says whether it was
any good. Three additions close that, and each is written at the one door
that can observe it.

**Findings** (`<ID> important=<n> nits=<n> unfixed=<n>`) are the driver's own
result rendered in code, never a session's reading of the review prose, for
the reason the token figures are metered rather than asked: an agent
summarising its own run is the one observer with a stake. The derivation lives
in the driver rather than in the skill's prose for a second reason, learned
here: taught as arithmetic, `unfixed` was `notFixed.length`, and `notFixed` is
only ever set on the disposition path — so a run that halted on a NEW Important
raised by the re-review, with no second fix round to resolve it, recorded
`unfixed=0`. A count assembled by a reader from three fields is a count that
is wrong the first time a fourth field matters. It lives under
`findingCounts`, not `findings`: the second is the reviewer's own list of
Important findings with their cites, which the run record's prose and the
release pull request are written from, and the first version of this
derivation assigned the counts straight over it — emptying every ticket's
findings while every test still passed, because none had asked one record for
both. `important=0` is written
because an absent line and a clean review are the same silence otherwise, and
telling them apart is the whole measurement.

**Halts** (`<kind> <ID>`) carry the driver's `STOP` key, resolved inside
`run-epic.mjs`. The alternative — a session mapping the halt SENTENCE back to
a key — fails the first time a sentence is reworded, and the sentences are
reworded deliberately, every time a halt reads wrongly to a human. The kind
comes first and the ticket is optional because an epic-level halt (the
release check) names no ticket, and every shape that put something in ID
position was worse: the epic's name reads like prose, a placeholder `-` is a
token nobody would think to write, and `epic` is a word that could one day be
a ticket prefix. A kind is lower-case-initial and a ticket ID is
upper-case-initial, so the two never collide and nothing has to stand between
them.

**`(fixes <ID>)`** is the only record an escaped defect leaves anywhere. A
defect that passed the review, the acceptance checks and the release check
and shipped anyway is repaired by a LATER ticket — which has its own entry,
its own review and its own green ledger, so the repository's own documents
record the repair as a success and the miss as nothing at all. One suffix on
one subject is what makes the most expensive class of failure countable, and
a subject is where it goes for the reason shipped detection reads subjects:
it is the one part of a commit that survives a rebase, a cherry-pick and a
squash. An escape is ORDERED, not merely matched: the fix has to REACH the default
branch after the named ticket did, because a repair that arrived while the
ticket was still on an epic branch repaired work no user had seen, and
"reached users" is the whole content of the word. Where a commit reached the
branch is neither where it was written nor when: a release epic commits its
tickets on `epic/<name>` weeks before the merge that brings them over, so a
hotfix written later can arrive first, and an author date is rewritten by
every rebase besides. So every commit is placed at the index, along the
branch's first-parent chain, of the commit that brought it in — one `git log`
for the whole branch, because a `git` call per commit is how a board command
becomes one nobody runs. Strictly later, so a fix and its ticket arriving in
one release merge is a defect CAUGHT, not escaped; it shares the `predates`
reason rather than earning one of its own, because nothing reads the
difference today and a reason nobody reads is a field that drifts. A suffix that fails that test, or one the strict form cannot read
at all, is reported under `unmatchedFixes` with its reason rather than
dropped: this count is exactly the kind that reads fine while being quietly
low, and a lenient parse would have to guess which of several spellings meant
what. `(review fix)`, already the shape three lanes commit fixes under, is
the same measurement one stage earlier — rework is what the review caught,
escapes are what it did not, and the two are one question read from both
ends.

The doctor warn on `(fixes <ID>)` is scoped narrowly for a rule this
repository already had: a refusal's advertised recovery must work in the
refused state. A commit subject on the default branch can never be rewritten,
so a warn about a suffix naming an ID no epic plans would be permanent, and a
permanent warn teaches its reader to skip the rest of `doctor`. What the warn
does fire on is a suffix naming a ticket this repository has PLANNED and not
yet shipped — where the recovery is real and ordinary, because the ticket
ships and the warn ends by itself. The unclearable case is reported by
`metrics --json`, as information, which is what it is.

### Why cache reads and the model are their own lines

Two questions the ledger could not answer were sitting in the same
transcripts. What a ticket cost depends on which model ran it — a tier
priced on opus and a tier priced on haiku are different numbers wearing the
same name — and the record carried the reviewer's model as prose, written by
the session from memory, or not at all. And the `worker=<n>` figure had
always been input + output + cache creation with cache reads left out, which
is a defensible sum and hides the largest number in the run: a long worker
reads its cached context back on every turn, and those reads are most of
what the run actually moved.

The obvious repair — fold cache reads into `worker=<n>` — is the one that
cannot be made. Every figure in every existing record means the old sum, and
a redefinition makes the ledger incomparable with its own history while
saying nothing about which records were written before it. So cache reads
got a line of their own, and the headline figure did not move.

Their unit is the same wall the seconds use, and it has a second edge here:
a read count is several times a ticket's token figure, so a `4812330` that
leaked into the token ledger would not look wrong — it would look like an
expensive ticket. The models line has no unit to give, being names, and that
is what settled the shape of all three: the paragraph is the wall, one
mechanism for `**Time:**`, `**Cache reads:**` and `**Models:**`, because
`worker=unknown` and `worker=claude-opus-5` open a token group exactly as a
duration does.

A model name is also the one figure here that is not a number, and it forced
two rules a count never needed. An agent that fell back mid-step used two
models, and reporting the dominant one would be an estimate of something the
transcript states exactly — so both are reported, joined by `+`. And a role
whose agents include one nobody observed is *not* unknown, where a role with
an unobserved figure is: a missing number makes a sum silently low, while an
unobserved agent cannot make an observed name wrong. A Codex worker is the
case that proves the observation is worth making at all — its agent is a
shell proxy running on haiku, so the transcript's own model is not the model
that wrote the ticket; the runner prints its model in the JSON the proxy
relays, and the meter reads it from the proxy's tool results rather than
from the proxy's account of them.

### Why a round has a label, and a correction does not

The ledger's one ordering rule is "the last figure for a role wins", because
the log is append-only and that is what lets a dated correction override the
entry it corrects. weekendgoals' CITY-14 showed what the rule costs when the
repeats are not corrections: the ticket went through four review rounds, its
entry recorded a worker/reviewer pair for each — 911,511 / 302,889, 804,432 /
324,269, 909,377 / 259,927, 581,236 / 297,991 — and the ledger read the last
pair. The ticket appeared to cost 879k where the log records 4.4M, the epic
12.7M where it records about 16.2M, and the most expensive ticket of the epic
read as a mid-sized one — the opposite of what a spend ledger is for.

Inverting the rule (every repeat is a round unless marked a correction) would
have read CITY-14 right and silently changed the total of every log already
written. So the rule stays and the round is what gets marked: `round=<n>`
opening a group, summed per ticket and role, last-wins within a round. Doctor
asks about the ambiguous shape — two unlabelled figures for one role with no
correction between — rather than guessing, and the repair is an addendum.
One writer labels a round in each lane (the run record unattended, the
supervisor's addendum attended; the other document points), because under a
sum, two documents restating one pass is a double count where under last-wins
it was harmless.

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
entry itself: Built, Mode, Tokens, Verified, Decisions, Deviation, Owed —
git already records the files and commits, and narration a future reader
must wade through is a cost, not a record. The brief compiles the deviations
for the same reason it compiles the owed items, and with the same honesty about
what it is reporting: not what is true, but what someone wrote down.

A debt ledger with repayment syntax needs its repayments to be as granular as
its debts, and for a while this one was not. The entry ID was the item's
identity, so an entry that deferred four things could only be repaid whole:
downstream, a marker naming one of them retired all four, and the item that
had to survive was a production-database hazard. Two console-foundations
workers had already seen the trap and written the marker's absence into their
entries as a deliberate decision — paying permanent noise in every future
brief to avoid a silent loss — which is the shape of a format forcing a bad
choice on the people it serves. So an entry that owes several things numbers
them and a marker names the item; a bare entry ID is read against what the
entry owed when that line was written, and facing more than one open item it
retires nothing and says what to write instead. The direction is decided by
the asymmetry, not by taste: an item wrongly kept costs one reread, while an
item wrongly retired is gone from an append-only log with nothing left to
report that it ever existed. The admission test: it preserves necessary
knowledge, and it constrains the blast radius of one line of markup.

## Why a deviation has its own line

A worker that builds something other than what its documents show was told to
record it under `**Decisions:**` — "judgment calls and deviations from the
documents, each with the why". In a page epic in an installed project a worker
did exactly that, honestly and in the right field: it wrote that it had not
built the design's hero band. Nothing read the field. No parser in
`tickets.mjs` touches `**Decisions:**` — the only mentions of the field in that
file are comments explaining why it needed none; no brief carried the sentence
to the next ticket, no gate saw it, and the page shipped without the band. The
claim is about code paths, not about the string: stated as "the file does not
contain the word", it is refuted by a grep and invites a reader to correct the
passage in the wrong direction. The record was
perfect and the mechanism was absent — which is the failure mode this whole
methodology is built to make impossible, arriving through the one field that
had no reader.

Three properties of the fix are load-bearing, and each was argued for.

**It is a line, not a marker in prose.** The real Decisions field that held
that deviation was a sixty-line paragraph of six numbered items with the
departure third. A marker inside prose like that is not reliably parseable,
and surfacing the whole field buries the departure again in the noise it was
already buried in. `**Deviation:**` is an optional line whose paragraph ends at
the first blank line, or at the next bolded field or heading — so a worker who
writes one directly above `**Owed:**` records a departure, not a departure with
the next field's markup glued to it — and it changes no existing log:
`**Owed:**` remains the one required line, so the status log's shape — the
preamble's three pinned copies, the entry heading — is untouched.

**It is not owed work.** The debt ledger already existed and the temptation was
to reuse it. But an owed item is *work someone will do*, and the ledger's whole
grammar is about who inherits it; a deviation is *a decision someone must
see*, and the only question it raises is accept or fix. Filing one as the
other either converts a decision into a task nobody has agreed to, or lets a
departure be discharged by whoever inherits it — the party under review
closing its own record, one indirection away.

**Only a human closes it.** The closing line names each deviation as *accepted*
or as *fixed in a commit*, because a fixed deviation's paragraph still parses
in an append-only log: a line that could only mean "accepted" would either
leave a fix unable to clear a gate or record a fix as an acceptance. It closes
by its leading reference list and only above itself in the file, because an ID
can head more than one entry and a departure recorded later must not be born
closed. No worker and no agent writes one, even for a departure it fixed
itself — a closure the reviewed party could have written clears nothing.

**And it closes them one at a time.** Closure was first designed per entry, on
the argument that the entry ID is the only identity a paragraph has and that
numbering would add a second identity scheme for a rare case. It was modelled on
`**Resolves owed:**` as that marker then worked — and that model was retired
days later, on a real loss: a marker naming one of an entry's four owed items
retired all four, among them a production-database hazard. Both arguments died
with it. The identity scheme exists, because the owed ledger now numbers an
entry's items; and the rare case has an incident behind it. So an entry that
records several departures numbers them, a closing line names the items, and a
bare closing line facing more than one open departure closes nothing and says
what to write instead. The direction is the same asymmetry, measured on the same
two costs: a deviation wrongly left open costs a human one reread, while one
wrongly closed is a decision nobody made, gone from every brief and every
attended door in a log that cannot be edited to say so. The lesson generalises
past both ledgers — **a rule defined as "like that other rule" drifts the moment
the other one moves.** Five sentences written in this epic defined deviation
behaviour by comparison with owed behaviour, and were untrue within hours of
being written, in documents that each read correctly alone.

That last property is why the parser *reports* closure instead of filtering on
it. Which readers honour a closing line, and which count every recorded
deviation regardless, is a judgment about who was in the room when the line was
written; a parser that had already dropped the closed ones would have made that
judgment for every reader at once, in the direction that trusts.

**A record with no door is the same failure again.** The hero band was written
down perfectly; what was missing was a reader. So the line is read wherever the
next human decision happens — every later brief, the summary the lane prints,
the pull request body, and, in a release epic, the integration merge — and each
of those doors shows *every* departure the ticket recorded, not only the open
ones. A closed one is shown with its closing line because the parser cannot say
who wrote it: displaying the line is what turns "trusted" into "seen". The
integration merge is the one door that refuses rather than reports, and the
reason is position. It is the last moment at which one ticket's departure is
still one decision; after it, the departure is a paragraph inside an epic-wide
diff, and the evidence that the release pull request gets a paragraph-level
reading is exactly the evidence this epic does not have. The cost of refusing is
one pause on something an agent may already have fixed; the cost of not
refusing is the shipped page with no hero band, which is what this section is
about.

**A gate that asks too often, or asks for too much, is a gate nobody keeps.**
The deviation gate's first day in use stopped three merges, and none of the
three was the case it was built for. Two were missed estimates — "two lines",
"split past ~450 changed lines" — that a planner had written into tickets as
conditions, so a worker that did the right thing had formally departed from a
guess; the third was a change a reviewer had asked for and then judged sound.
And each time the human answered "accept", the step refused the answer and
asked for a dictated sentence naming item references. The human's verdict was
that the feature was unusable, and he was right on both counts. So the
definition is narrowed to what the gate is for — something the documents or
the design showed that was not built, or was built differently — with missed
estimates sent to Decisions and reviewed fixes to the review addendum; and the
closing procedure separates the two things the first version had welded
together. What must be the human's is the **decision**; who types the line
never mattered. An explicit answer to a departure shown in plain words is a
decision, and the session records it, quoting the answer and saying it was
recorded rather than dictated. What stays forbidden is an agent deciding:
closing on silence, on a general instruction to carry on, or on an answer to
a different question — and in an unattended run, where nobody is there to
answer, a worker still never writes the line and the driver still honours
none.

**A refusal that cannot be cleared teaches people to route around it.** Both
recoveries are therefore written into the step itself — accept it, or fix it on
the branch and have the fix accepted — and both end in a human's decision, because
a gate the guarded party can clear is not a gate. Which makes one detail
load-bearing rather than pedantic: the closing line must name the departures it
decides, since a bare line facing several closes nothing. A step that told a
human to "write the closing line" would be advertising a recovery that leaves
the gate refusing, and a worker watching that happen twice learns that the gate
is noise. The rule generalises: a refusal's advertised recovery has to work in
the refused state, which is only knowable by reading the refusal from inside
it.

**The unattended run does not read the closing line at all.** The attended
doors honour it; the driver's gate counts every `**Deviation:**` line the
pushed entry carries and ignores closure entirely. That is not two rules, it
is one rule applied to two rooms. A closing line is a human's, and the
question a gate can actually answer is *could a human have written this one?*
At an attended door the answer is yes by construction — a human is in the
room. In an unattended run the only parties with commit access to that branch
between the worker's first commit and the merge are the worker and the
disposition agent, both of them the party under review; a gate that honoured
their line would let the reviewed party clear its own gate, and "accepted"
versus "fixed in `<sha>`" is prose no parser can police. The driver also only
ever gates a ticket it started in the same pass — it refuses an epic holding
an in-progress ticket, and a halted ticket is finished by hand and never
re-gated — so there is no case where a legitimately human line is sitting on
that branch at resolve time and being ignored.

The price is exact and worth naming: a run halts on a departure an agent has
already fixed. That is the reversal clause's subject rather than a defect —
if every such halt is closed as "accepted" with nothing changed, the halt
bought nothing and goes. What the halt is not allowed to be is quiet: a
deviations fact the gate cannot read halts on the contradiction condition,
like every other unreadable fact at that step, because the one direction this
report can lie in is "none recorded", and a gate that read a failed command as
zero would merge precisely the ticket it exists to hold.

Its position follows from the recovery rather than from the risk. The halt
fires at the resolve step — after the review, after the disposition's
addendum, before any agent that could merge exists — because recovery from
any halt runs through the ticket skill's step 10, which needs the review on
the record; halting before the reviewer was hired would leave a human hiring
one by hand. The cost of waiting is one review the human may end up
discarding; the cost of halting early is a recovery that does not work.

The same test decides **what a gate may read**. The parser reports both the
departures and the notes a closing line earns when it closes nothing, and the
attended doors show both — a note is how a human learns that someone tried to
close a departure and failed. But the gate stops on the open departures alone,
because a line that closed nothing leaves whatever it failed to close still
open, so `open` already stops every departure such a line leaves undecided —
and a note that stands while `open` is zero reports a line that decided nothing
where nothing is left to decide. Either way the notes add no case: a note is
advice about how a line was written, not a statement that a decision is
outstanding, and a gate on advice refuses over wording. When that rule was written the notes were also unclearable — some
survived the exact repair they named — and a gate on one would have refused
forever on a mistyped digit. That half has since been fixed at the parser
rather than at the gate (below); the gate did not move, because the reason
that still holds was always the load-bearing one. Show what informs, stop on
what clears — a condition nobody can discharge is not a gate, it is a wall,
and the first person who meets one learns to go around gates in general.

### A warning nobody can clear is worse than no warning

Both ledgers warn when a line retires or closes nothing: a bare marker or bare
closing line facing several open items, and a reference naming an item that
does not exist. The deviation ledger warns about a third shape, an ID a
reference ends inside (`<ID>oops`) — the owed ledger does not, because there
its reference grammar refuses to parse such a line at all, so no reference and
no note comes out of it. The warnings are worth having: each reports a human
who believed they had discharged something and had not. But the wrong-reference
warnings — one kind on the owed ledger, two on the deviation ledger — used to
have no exit. The log is append-only, so the wrong line cannot be taken back,
and the note's own instruction ("correct the number") produced a second line
that the parser did not read as a correction of the first. In an installed
project one mistyped digit was a `doctor` row for the life of the epic, and the
skills and README both told its author otherwise.

That is worse than not warning at all, and not only because it is noise. A
warning is a claim that doing something specific will make it go away; one that
survives its own cure teaches the reader that these warnings are weather, and
the next one they skip is the one that mattered. So the rule is that **every
note is cleared by the repair it names** — it is the same admission test a gate
has to pass, applied to advice: a refusal whose advertised recovery does not
work in the refused state is not a safeguard, it is a wall.

The correction has to sit **below** the mistake, and that is not a parsing
convenience. Position is time in an append-only log: a line written earlier
could not have been answering a mistake made later, and clearing on one would
take away the only feedback a miscount gets while the item it meant is still
open — the entry would read as addressed by a line that addressed something
else. The same reason gives the two note kinds two rules. A bare marker is
*ambiguous* about which items it decided, so any itemised line for that entry
answers it, wherever it sits: the writer has moved to the form that names
things. A wrong reference is *one specific mistake*, and only a later line can
be its correction. And a correction may name an item already retired — the
whole point of correcting a reference is often that the writer meant the one
that is already closed.

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

Two hardenings arrived from an external review of this workflow (2026-08-18),
both closing gaps between what the reviewer's prose promised and what its
harness enforced. The ticket reviewer's **persistent memory was removed**: it
carried a cross-session casebook of defect patterns — genuinely useful, and
disciplined by prose to never store project state — but a judge with a
casebook is a judge with priors, and this judge's verdict opens a merge gate.
The plan reviewer keeps its casebook, because its output is advisory input
to a human gate, not a gate itself — the same consequence-scaling rule that
prices review tiers. And both reviewers' **toolsets dropped Edit and Write**:
"you report, you never fix" had been instruction alone, and an agent that
can edit its own finding edits it into agreement — now it structurally
cannot. The shell stays (a reviewer needs `git show` and `git diff`), so
this is narrower, not perfectly read-only; the run lane's sanctioned
fallback reviewer is a general agent and keeps its full toolset, which is
one more reason the fallback is a fallback.

## Why the plan is reviewed before sign-off

Every defence in this workflow used to start after the plan was signed off —
but the most expensive mistakes are made before that, in the decomposition. A
ticket built on a wrong split is not saved by a good code review; the review
approves a correct implementation of the wrong thing, and the cost is every
ticket stacked on it. The sign-off gate existed for exactly this, yet it left
the human to catch decomposition faults alone, reading a document written by a
session with every incentive to find its own plan convincing.

The human's own leverage was moved earlier for the same reason. The epic
skill originally produced a complete document and then asked — which turns
sign-off into yes/no on the only shape in the room, because a finished
decomposition anchors both parties and a re-split now costs a rewrite. The
skill now stops at the shape first — outcome, areas, delivery, the ticket
list as one line each — where a re-split costs a sentence, and the sign-off
itself presents one considered-and-rejected alternative so approval is a
choice between shapes rather than a ratification of the one shown.

Two refinements arrived from reading GitHub's Spec Kit against this flow
(2026-08-19) — its planning front end is more developed than this one was,
and two of its ideas passed the admission test. A **clarify pass** now
precedes the shape: the planner sweeps the brief for underspecified points
— scope boundaries, data lifecycle, error behaviour, integrations,
non-functional expectations — and asks the user the ones whose answers
change the shape, recording every answer in the documents, because the
costliest planning defects are questions nobody asked, resolved silently by
whichever reading was easiest to build. And an optional numbered
**Requirements block** holds the WHAT apart from the HOW, written before
any ticket is sliced and never bent to fit the slicing — which gives the
plan reviewer a mechanical walk nothing else provided: every requirement
reachable through some ticket's criteria, every ticket serving some
requirement. What was deliberately not adopted: Spec Kit's constitution (a
separate principles document — the instruction files and epic ground rules
already are one), its analyze step (check-invariants plus the fresh-context
plan reviewer are the stronger pair), and its in-session implement lane
(the biased execution this flow's workers exist to replace).

So the same trick used on code is used on the plan: a fresh-context agent with
no stake in the decomposition, reading it against the actual code, reporting
without rewriting. External evidence points the same way — Cloudflare reports
that pre-implementation design review by agents caught architectural problems
in roughly six hundred designs before any code existed. The human still signs
off; they just do it with adversarial findings and the reviewer's open
questions in hand, instead of with prose written to be agreed with.

Two of the reviewer's questions come from epics that shipped past everyone
(2026-09-14, the retros of the first three live release epics). The first
asks, for every ground rule and every acceptance criterion, **who executes
it in the delivery mode the draft declares** — because groundhopper-log
required its translated strings to pass through seventeen per-language
agents in an epic run unattended, where the worker's spawn prompt forbids
spawning any agent. The rule was unsatisfiable the moment it was written;
nine consecutive tickets recorded the deviation and shipped anyway, at the
cost of 92 damaged strings and three follow-up tickets. The same epic
deferred ten "demonstrate on a phone" criteria to its release pull request,
which merged with none of them performed — so a criterion the lane cannot
perform is now its own ticket with a human owner, ordered before the
release, rather than a line owed to a document. This is the invariant "a
gate is verified at the door its actor walks through", applied one level up:
the rules and criteria need a door their actor can walk through too.

The second asks whether the Outcome's evidence is **collectable**: what will
produce each clause, and whether the named observer could tell success from
failure with it. Redesign-foundation's Outcome promised `h6count = 0` on
every page type with the check wired into two of nine, and a four-week
analytics reading of an event the new control and a pre-existing picker both
fire. Both clauses were falsifiable in form and unanswerable in practice,
and both were knowable at plan time. Naming an observer was already
required; it is not enough, because an observer with nothing to read reports
nothing — and the retro that finds this out is months downstream of the
one-line fix.

## Why attended tickets get a supervisor

The autonomous epic's live run proved something that had nothing to do with
autonomy: three tickets executed by fresh-context agents, from documents
alone, produced work whose reviews came back clean or nearly so. The
fresh context was doing real work — and attended tickets, run in whatever
session the human happened to be planning in, never got it. The invoking
session has argued for its own decomposition, carries opinions about the
code, and — when it runs several tickets — carries the previous ticket too.

So the attended default became the same shape the driver already proved:
the session supervises, a fresh worker implements from the documents, and
**the supervisor hires the reviewer**, because a worker that picks its own
judge recreates self-review one level down. The attended lane reached that
last part first; the unattended one adopted it when its loop became a script
whose driver could hire the judge itself. Both lanes now share the shape, and
the rule underneath it is one rule: the party under review never picks its
judge, in any lane. Interactive mode survives behind a flag for the real case
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
The converge question closes the loop the ledger cannot see (adapted from
Spec Kit's converge step, 2026-08-19): the delta between the documents'
promises and what git says actually shipped — unshipped scope no Owed line
recorded, shipped behaviour no ticket owns, instruction files the work made
stale. The record is honest about what was written down; only the diff
knows what was not.

The seventh question does the same for the run lane's halts (2026-09-14).
The first three release epics run unattended halted twelve times across
twenty-three tickets: five on the plugin or the environment, four on a
policy trip, two on a plan defect, one on a code defect. Every one of them
was written down — the run records carry a **Halted on:** line quoting the
stop condition verbatim — and every one of them cost a human a resume. None
was ever examined: three fresh-context retros mined those epics and read
straight past the halts, because none of the six questions asked. That is
the diary failure one level up, and the same move fixes it. Classification
is what makes the cheap halts visible, and it has to be the retro's reading
rather than the driver's claim: the run that stopped could not judge its own
stop, and the miner reads the records it did not write. A **policy** trip
whose later re-review found nothing did not retire a risk — it charged a
human for a resume, and three such trips in a row are an argument against
the policy, not evidence for it. A **plugin/environment** halt is not this
project's defect at all; it is a ticket for the plugin's own repository.
Both are flagged transferable for the same reason the transferable planning
lessons are: the epic that paid for the lesson is rarely the one that can
act on it.

The eighth question asks the only thing no gate can observe: what the human
found at the release pull request that nothing upstream had surfaced. Every
other question mines a record some agent wrote; this one has a single
observer, and they see it at the one moment the whole epic is in front of
them. So the run skill's pull request body asks for the answer as a dated
addendum beneath the run's record, and the question insists it be written
down **even when it is "none found"** — because an absent record and a zero
are the same silence, and a measure that cannot distinguish them measures
nothing. This is how the deviation routing's own Outcome is read: departures
found at that pull request which were written anywhere but a `**Deviation:**`
line are the number the epic said it would move, and nobody but the human at
that gate can count them.

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

## Why a regression the change introduced is never a nit

A nit is parked: fixed if trivial and in scope, otherwise recorded for the
retro. That is right for small real defects and wrong for one class — a
change that visibly breaks what worked. weekendgoals' redesign-foundation
shipped a second hamburger button and a second logo on its entity pages
though both of its reviews saw them: FND-1's addendum filed "two headers on
entity pages" as a nit outside the ticket's scope, owner `retro`, and FND-2
recorded the phone counterpart the same way. The retro runs after the
release merges, so "owner: retro" for a regression the ticket itself
caused means "ship it, discuss it later".

So a user-visible regression the change introduces is Important however
small the diff, and ticket scope does not excuse it: scope bounds what the
worker may build, not what the reviewer may report. The rule needs no new
gate — an unfixed Important finding already halts an unattended run and
blocks the attended merge, so the regression is either fixed or put in
front of a human before the release. Pre-existing defects keep their
`retro` destination: those are not this change's to answer for.

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

Mutation testing needs a tool, and almost no project has one configured, so
for a long time that sentence was dormant. The revert check (2026-09-16,
taken from adk-go's PR template and self-review skill) is the one-mutant
version that needs nothing: revert the source, keep the tests, run, and
name the test that went red. It costs one test run and answers the exact
question coverage cannot — would this suite notice if the change were
missing? It is required at two doors rather than one because the worker's
account of the check is the thing being checked: the lanes name the test,
and the reviewer opens it and confirms it depends on the change. The
per-guard refinement — flip each new branch on its own — exists because a
whole-change revert stays red on the headline fix while a half of a
compound condition, or a fixture sized from the constant under test, is
never exercised.

### The fixture is part of the assertion

The redesign-city retro (2026-09) put a number on the defect above: nine
specs across one epic passed with the behaviour they named deleted. None was
a missing assertion. Three shapes recurred — the spec read a *declared
property* rather than the rendered result (answered in "Why the reviewer is
handed the design"); the *environment answered instead of the code* (a request
counter reading 0 against a warm server's cached 404); and **the fixture could
not produce the case**: twelve venues on one line merged into a single map
pin, so a pairwise-overlap loop ran over zero pairs and passed. An assertion
is only as strong as the inputs that reach it, and a reviewer reading
assertions alone will pass all three.

One ticket in that epic wrote the class into its own acceptance criteria, and
the next ticket produced four more: prose in one ticket does not bind the
next, which is why this is a reviewer's lens and not a planner's sentence.
The question is small enough to carry — *what input would make this fail,
and does the fixture contain it?* — and the decisive technique was the one
the method already owned: the revert check, applied by the judge. A bounded
re-review deleted the behaviour, re-ran three specs an earlier round had
"repaired", and one still passed. No mutation tool ships here — the plugin
runs no project's tests except through CHECK — but a reviewer told how to run
the suite can delete a behaviour and watch.

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
per-ticket branches, per-ticket review, and one human release gate on the
epic's only pull request.
That is why serial-to-main stopped being the universal default: the record
showed disciplined users stacking anyway (Q-10–Q-17), which was the rule
mismeasuring their throughput needs, not the users misbehaving.

## Why the run ends by checking what it is about to release

Every gate the run had judged a ticket on its way in. A ticket's checks ran
on its branch before its merge, and in a wave once more after each merge of
that wave — and then never again. Nothing re-ran them after a later ticket
merged, and nothing after the last refresh merged the default branch into the
epic. So the release pull request's claim that every ticket was green was a
claim about a dozen different commits, none of them the one the human was
asked to merge. A second agent reviewing this plugin against HumanLayer's
said so, and running the first cut of `check-epic` on this repository's own
shipped `run-lane-hardening` epic found a check that no longer passed.

The release check makes the claim once, about the right commit. It is
deliberately small: the criteria already exist, the parser and the ledger
already exist, and "run them again at the head" adds no document for anyone
to keep true. The larger proposal — a requirement-to-evidence matrix, judged
by an agent — was not taken: it is a second planning document, and an agent
filling a table with prose is the narration the CHECK format exists to
replace.

A check is only evidence about the thing it ran against, and the first cut
was loose about that in three ways a second model found. It compared branch
names, and a remote-tracking ref can be stale, so "at the remote head" could
be true of a commit nobody was releasing: the check now fetches, pins the
remote's commit, and every step reports the commit it ran at. It read the
working tree, so an uncommitted fix certified the pushed commit: a dirty tree
is refused. And it ran in the main checkout, which after a parallel run has
none of the dependencies the tickets installed in their worktrees — every
successful wave run that added one would have halted here, and halted again
on the re-run; a wave run now checks in a worktree of its own, set up the way
each ticket's was, and the session's own check runs in the same one. The
confirming pass then found the fixes patched rather than closed — a dirty
tree asked about after the checks (which cannot tell a pre-existing edit from
a file a check regenerated), a fetch the skill asked for and the command did
not perform, sharing of command runs that could disagree with the per-ticket
gate — and those were answered by moving each question to the one place it
can be asked: before anything runs, inside the command, and by default.

Two decisions carry reasons worth keeping. **Criteria come from the epic
head, not from a pin at sign-off**: a human who re-plans a ticket mid-epic
has changed the contract on purpose, and a pin would check the release
against a document nobody holds any more. What the pin protected against — a
later ticket loosening an earlier one's `EXPECT` — is *shown* instead, was
and now, in the release body, because the script cannot tell a re-plan from
a dodge and the person deciding the release can. And **the halt needs no
addendum to clear**, unlike the post-merge halt: there, tickets read
`integrated` while the epic is broken and a re-run could open the release;
here the re-run *is* the check, so the state cannot be walked past.

## Why the release pull request gets a page as well as a body

A release epic moves the human gate to one pull request, which makes it the
largest diff in the methodology and the only thing a human approves. Its body
was already complete — every ticket, every review outcome, what is owed — and
completeness was the problem: it is prose a session wrote at the end of a
long run, in the order the run happened, and a reader deciding a merge wants
a different order: is it safe to merge at all, does it still pass, then
ticket by ticket. HumanLayer ships a walkthrough page with any large pull
request for the same reason.

The page is a **view**, and everything about it follows from that. Its data
comes from one command (`tickets.mjs release`) that reads git, the status
log and the run record, so nobody composes it and nothing in it can disagree
with the record. It is never committed, because a committed view is a mirror
someone must keep true — the failure this plugin exists to avoid. It does not
replace the body, because GitHub is where the merge is decided and a link can
rot. And it must never flatter: a release check that was not supplied, or was
taken at another commit, is said in the place the ledger would be, because a
page that drew an absent ledger as a green one would be worse than no page.

Status entries are shown as written, not re-rendered: parsing their Markdown
would be a second reading of the record, and the first is the one that was
reviewed. What the page adds is order and folding — the fields a merge
decision turns on are open, the rest are one click away — and stable anchors
per ticket, which is where a comment layer can attach later without the page
changing shape.

## Why the plan page walks through what will be built

The release page walks through what *was* built. The plan page's walkthrough
is its counterpart on the other side of the work, and it exists because the
two planning gates ask a human to approve something written in a language
that is not theirs. An Outcome line, a numbered requirement, four tickets with
acceptance criteria, a delivery mode: every one of those is engineer-shaped,
and a person who asked for a feature can read all of it and still not know
what they will be able to do when it ships. They approve anyway — the shape
looks competent, the reviewer found things, the plan is plainly the work of
someone who thought about it — and the first moment the feature is described
in their terms is the moment it exists, which is the most expensive moment
available. So the plan says it first, in scenes: who acts, what they see, and
what happens today instead. In the order a person meets them, because ticket
order is a build order and reading it as a story is what makes a missing
scene obvious.

Everything else about the walkthrough follows from one hazard: **it is the
only part of the plan that can be pure fiction.** The rest is tied to
something — criteria to commands, tickets to branches, requirements to
criteria — while a scene is prose about a future nobody has to build, written
by the party that benefits from it reading well. So the scenes are tied down
mechanically and in the one place both gates pass through: a scene names its
tickets structurally, the renderer refuses a scene naming a ticket the plan
does not carry, and every ticket no scene names is printed rather than
quietly dropped. That last one is not a gate and is the most useful of the
three: infrastructure legitimately appears there, and so does the
user-visible ticket whose scene somebody forgot to write, and only the human
reading can tell which. What stays a rule rather than a check — no ticket IDs,
no file names in the prose — stays one because "a name that reads like an
identifier" is not something a regex can separate from a product name; the
skill teaches it and the plan reviewer reads for it.

The walkthrough also makes one decomposition failure visible before it is
built. A plan split by layer — schema, then API, then UI — has a walkthrough
in which nothing a person can see happens until the last ticket, and that is
legible on the page in a way it never is in a ticket list. Hence the rule the
skill and the reviewer share: the first ticket makes the first scene work end
to end, thin.

## Why comments on the page are a clipboard and not a database

The page needed something worth commenting on before comments were worth
building: a reader who cannot find the sentence they disagree with does not
lack a comment box, they lack a sentence. With the walkthrough there, the
missing piece is the mechanics of pointing at one — "the third paragraph
under requirements" costs a sentence to write and another to resolve.

What it is *not* is the decision worth recording. A comment layer implies
storage, and storage implies a server, an identity, a lifecycle and a mirror
of the conversation that someone must keep true — for a page that is
deliberately thrown away, whose whole contract is that `tickets.md` is the
record. So the page holds no state at all: select text, type, and it copies a
block naming the anchor the selection started in. The human pastes it into
the chat, where the steering already happens, and the session answers it in
the same turn. Nothing is stored because there is nothing to store; nothing
is parsed because chat is the channel and a parser would be a second, worse
reading of what the person said.

The anchors are the part with a future. They are stable, documented ids —
`#outcome`, `#scene-2`, `#PAY-3` — which is exactly what a multi-user comment
layer would attach to if one is ever built, the same way the release page's
`#t-<ID>` anchors were written before anything pointed at them. Until then
they cost one attribute per section. And the popover is additive on purpose:
with JavaScript off the page reads identically, and the sentence advertising
the popover is hidden, because a page that offers what it cannot do is worse
than one that offers nothing.

## Why a run goes wide in waves

The pain was measured, not imagined: a three-ticket run held its lane for 39
minutes on its first ticket with nothing else able to start, though the other
two touched different parts of the code. The serial loop was never a claim
that tickets depend on each other — it was the consequence of every step
checking branches out in one working tree. Give each pipeline a worktree and
the constraint is gone; what is left to decide is how much of the run may
overlap, and the answer is "everything that touches only the ticket's own
branch, and nothing that touches the epic's". So the loop body was split
along exactly that line — `runTicket`, `integrateTicket` — in a commit that
changed no behaviour, and a wave runs the first side by side and the second
one at a time.

**Waves, not a rolling scheduler.** A rolling scheduler — start a new ticket
the moment a slot frees — wastes less wall-clock: in a wave a fast ticket
waits for the slowest. It was not built, because a wave is a *barrier*, and a
barrier is what makes the run deterministic: the same board gives the same
waves, the merges happen in document order whichever pipeline finished first
(a test delays one to prove timing decides nothing), and every refresh and
every board read happens with nothing in flight. A rolling scheduler merges
in completion order, refreshes the epic branch under running pipelines, and
turns "which tickets ran against which base" into a question only the
timestamps can answer. The time ledger now measures each ticket's wall, so
whether the barrier's wait matters is something a retro can read instead of
guess; if it does, that is the evidence a rolling scheduler would need.

**Opt-in, and a cap of three.** `Parallel:` is a declaration because it
changes what the absence of a `**Blocked by:**` line means — every epic
planned before it existed relied on document order, and must not go wide on
a plugin update; a test holds `Parallel: 1` and no line at all to the same
prompts, byte for byte. Three, because the number that limits a release epic
was never machines: it is the one human reading the release pull request.

**What nobody judged.** Each ticket of a wave is reviewed and accepted
against the epic branch as it stood when the wave began. The second merge
lands on a branch the first has changed, and that combination has been seen
by no reviewer and run by no check. The plan declared the two independent;
the run's net under that declaration is to re-run the later ticket's own
signed-off CHECKs on the merged branch. It is a thin net — it catches a
combination that breaks a criterion somebody wrote, and nothing else — which
is why the real gate is upstream, in the plan reviewer's lens, and why the
post-merge halt tells the human to give the later ticket a `**Blocked by:**`
line: the run has just disproved something the plan said. It un-merges
nothing, like the budget halt, because nothing un-merges.

**The net, widened once.** A reviewer from a different model found the hole
in the first cut of that gate that nine rounds of same-model review had not:
it re-ran only the *newcomer's* criteria, and the commoner break runs the
other way — the later ticket is fine and the earlier one no longer is. So
after each merge onto a moved base the run re-runs every ticket of the wave
that is on the epic branch. The same review found the gate reading its
criteria from the epic branch *after* the merge, where a merged ticket may
have edited them: "0/0, all passed" is what a deleted criterion looks like,
so the count must be the one the ticket was accepted with. And it found that
the halt, which un-merges nothing, left a board with nothing wrong on it — a
re-run could walk straight to the release pull request — so the run's own
record is now read at the door. The general point is the one the plugin
already makes about tickets: the party that built a thing reviews it worst,
and that is as true of a model family as of a session.

**A halt does not un-pass a sibling.** Tickets in one wave are independent by
declaration and each cleared every gate a serial run has, so a sibling's halt
is no evidence against them: they integrate, and then the run stops. The
alternative — hold everything when anything halts — leaves passed work
unmerged for no reason a human could give, and makes every recovery longer.
What a halt does stop is anything *new*. An integration halt leads the
report when there is one, because it is the halt that touched the shared
branch and the one whose detail may say a merge was left unaborted.

**What the wave costs, said plainly.** A fresh worktree has what git tracks
and nothing else, so the project is installed again for every ticket — by
`epics/worktree.json` where the project wrote one (§ "Why a worktree is set
up by a file and not by the worker"), by each worker's guess where it did not
— and a project whose verification needs state neither a copied file nor a
setup command can reproduce should not declare `Parallel:` at all. The per-ticket token
ceiling cannot be declared beside it either: it is a delta on one meter, and
in a wave the delta is the wave's — a ceiling that silently cannot fire is
worse than none, the rule the missing-meter refusal already stated.

### What the release could not verify, and who is asked to

Parallel runs shipped tested against stubbed agents and against real git,
and against no real model, no real runtime and no real project. Five things
were named as unverified at the release: whether the runtime's `parallel()`
runs pipelines concurrently or queues them; whether a cheap shell proxy
relays the board's `waiting` list faithfully (the counts cross-check is the
guard if it does not); what a fresh worktree costs a project with real
dependencies, and how often it blocks a ticket outright; whether the Codex
runner works inside a linked worktree, where `.git` is a file; and the merge
guard's grep under a grep that is not BSD's. None of them can be settled from
inside this repository — so the plugin asks the first people who can see them.
A run that went wide writes a **Waves:** field into its run record while the
evidence still exists, the retro has a question that reads it and ends in a
verdict on the next epic's `Parallel:` line, and `doctor` flags the one shape
every bad log merge has taken so far: an entry whose `**Owed:**` line is
missing or doubled. An unverified claim with a collection plan is a
hypothesis; without one it is a hope.


## Why a worktree is set up by a file and not by the worker

Waves shipped with a known weakness, written into the run skill as a warning:
a fresh worktree has what git tracks and nothing else, so each worker was told
to install what the project's instructions say. That is a guess, made once per
ticket, by the party whose verification depends on the answer — and the two
things a worktree most often lacks are the two a worker is worst placed to
supply: a dependency install it has to infer, and a local `.env` it was
(rightly) told never to copy from another checkout.

So the project says it once, in `epics/worktree.json`, and a script applies
it at the step that makes the worktree — before any worker exists, so a
failed install halts a ticket that has spent nothing. It is a project-level
file because what a checkout needs is a fact about the repository, not about
an epic: in every epic's preamble it would be repeated, and the one that
forgot it would get bare worktrees without anyone deciding so. It is read as
committed on the epic branch, because commands that run unattended should be
commands somebody pushed and a reviewer can read. And the copy refuses a file
git does not ignore, in code: the files worth copying are secrets, a wave
worker commits with `git add`, and "be careful" in a prompt is not a gate.
The idea is borrowed — HumanLayer's workspace config lists setup commands and
files to copy for the same reason — and cut down to what passes the admission
test here: it constrains blast radius (a copied secret is kept from a commit
by accident — not from a hostile `setup` line, which can do anything and is
what reviewing a pushed file is for) and
reduces uncertainty (every worktree of a wave is set up the same way).

## Why a dependency is a strict line, and a wait is a state

Document order was the only dependency mechanism while every lane was serial,
and it was enough: the board proposes the first unstarted ticket, so nothing
overtakes anything. A lane that starts tickets side by side needs the one fact
order cannot carry — which tickets may **not** run beside which — and that is
what earns `**Blocked by:**` its place under the admission test: it constrains
blast radius. It failed that test for as long as nothing could overtake — and
taken alone it still would: the format was built one stage ahead of the lane
that needs it, and the two reach the default branch in one pull request, which
is the same departure, on the same condition, that a criterion format is
allowed inside one release epic. A `Blocked by:` with no lane to obey it
never exists on `main`.

The line is strict because the first version was tolerant and the tolerance
was its failure: a dependency written as prose read as a hard blocker, the
ticket stalled, and nothing said so. A parser has two wrong guesses available
for a line it cannot read — "no blockers", which starts a ticket beside the
work it depends on, and "blocked", which stalls silently. So it makes neither:
an unreadable line is a **named problem** — and because a problem stalls a
ticket, the set of lines that count as "about blocking" is kept as small as
the mistake it exists to catch: the label, bold or with its colon, opening a
line at the margin. The first cut took any line that began with the words,
and a wrapped sentence — "…because it is / blocked by the vendor API" —
stalled its ticket for ever. Prose wraps; a label does not start mid-bullet.
But a small near set has its own failure, which the second review found: a
dependency stated on a bullet, in a quote or with underscore bold fell out of
both patterns and was read as no line — and in a `Parallel:` epic no line
means "declared independent", so the parser was making the unsafe guess it
exists not to make. Such a line still changes no state (a bullet must stall
nothing), and it is never silent: `doctor` says it is unread, and what that
means for the run. The body's first line also keeps its indent, because
trimming the section whole made one spelling a dependency at the top of a
section and nothing below it.

`nothing`, the template's unedited placeholder, anything inside a fence (a
line swallowed by one that never closes draws the unread warn) and
the removed `Depends on:` spelling all read as no line at all, the last
because a format that arrives in every installed project overnight must read
old documents as it found them. The ticket waits, because that is
the safe direction; the board row, `find` and `doctor` all carry the sentence,
because a safe stall nobody hears about is the old bug; and `next` exits
nonzero when tickets wait and none can start, because the run driver reads an
empty `next` as "the epic is built — open the release", and the worst outcome
available here is a release pull request for an epic with work unbuilt. That
refusal is at `next` and not only in `doctor` for the usual reason: `next` is
the command the guarded actor runs.

`waiting` is a state and not a flavour of `blocked` because they are
different kinds of fact. `blocked` is an outcome a worker recorded — something
went wrong and a human must look. `waiting` is the plan's own statement about
order; it ends by itself when the blocker lands, and it applies only to a
ticket nobody has started — once there is work on a branch, the board reports
the work, because the plan's order is by then history.

## Why a wave merges its log by appending, and not by union

Every ticket appends its status entry to the end of one file. Serially that
never conflicts: each ticket branches from an epic head that already carries
the entry before it. A wave cuts several branches from ONE head, so every
merge after the first conflicts at the log's tail, every time, with nobody
present to resolve it.

Git ships a driver that looks made for this — `merge=union`, "keep both
sides' lines" — and the first cut of the wave used it. It was the design's
riskiest assumption, named as such, and built on anyway without being run; a
reviewer ran it. Union is a LINE-level merge: a line both sides share is
emitted once. Two status entries share most of their tail — `**Decisions:**
none.`, `**Owed:**`, every blank line — so git reported a clean merge in
which the first entry had lost its closing fields and its `**Owed:**` line
sat under the second ticket's heading. An obligation changed owner. `owed`,
`brief` and `doctor` all read the result without complaint, because a
truncated entry is still a well-formed one. That is the worst shape a
failure can have here: silent, plausible, and in the one document the
release pull request's Owed section is built from.

So the driver is the plugin's own, and its rule is the file's own: both sides
only appended, therefore the merge is the base, then what ours added, then
what theirs added, **each kept whole**. A side that did anything else has
broken the log's rule, and the driver says so by failing — a conflict, a
halt, a human. It is defined on the merge command (`git -c …`) and only named
in the repository's local `info/attributes`, so nothing persists that a
later hand merge would trip over.

Its second review found the same failure shape one layer down. The file
decided whether it was being *run* by comparing two spellings of its own
path, one symlink-resolved and one not; under a symlinked plugin directory
they differed, the body never executed, the process exited 0 — and git,
handed a driver that did nothing, kept ours, discarded theirs and called the
merge clean. A whole entry gone instead of half of one. Two rules came out
of that. **A merge driver acts on an explicit flag and fails closed**: told
to act and unable to, it exits nonzero. And **the wave checks its own
merge**: after merging, before pushing, the ticket's entry heading must be in
the merged log — because "the driver silently did nothing" must not reach the
remote *whatever* causes it next time. That guard had its own review, and its
first cut was a delay, not a barrier: it stopped the push and left the bad
merge on the local branch, where the next run's refresh would fast-forward
nothing and push it. So the same line undoes the merge; and it matches a
heading as loosely as the board's parser does, because a guard stricter than
what it defends is a false halt waiting for a worker who typed two spaces. The general lesson is older than this
repository: an assumption about what git does is tested against git, in a
throwaway repository, before anything is built on it.

## Why the run loop is code, not prose

The unattended lane's guarantees were originally sentences a driver session
read and obeyed: loop in document order, verify each merge from the board,
halt on any stop condition, improvise past none of them. Sentences hold only
as well as the reader — the same failure class as every other soft rule in
this repository, but here with nobody watching and merges happening. Every
review of the autonomous epic found some document drift, and a drifting
driver is a driver whose release pull request cannot be trusted.

So the loop moved into a workflow script (`workflows/run-epic.mjs`), where
"never resume past a halt" is not an instruction but an absence: there is no
code path that continues after a stop condition, the way there is no square
root of a negative number. The skill keeps the judgment ends — whether the
run may start, and recording how it ended — because those are decisions, and
scripts do not make decisions. There is deliberately no prose fallback when
the Workflow tool is missing: a fallback loop would quietly restore the
improvisation surface the script exists to remove, and the attended lane
(`/flow:ticket`, one ticket at a time) already covers the emergency.

That determinism has a second edge, and it points at the human holding the
halt. A run pins its own date (`args.today`) so that a re-invocation's
prompts are byte-identical and the runtime's prefix cache can replay them —
cache stability is bought deliberately, because it makes a run's steps
reproducible. But a run halts precisely because something outside the script
changed, and a cache cannot tell a stale recorded failure from a current one.
So a halted run is picked up by re-running `/flow:run` — never
`resumeFromRunId`. The first live run to try it replayed its own recorded
failure from cache and halted again on a defect the plugin had already fixed.
The same property that makes each step reproducible makes resuming a run a
statement about the past: the board, not the cache, is where a re-run learns
what is left to do.

The run's own bookkeeping got a file of its own for a related reason. A run
record used to be appended to the epic's `status.md`, where the ticket
entries live — but the two are written by different agents on different
branches: a worker appends its entry on its ticket branch, the run session
appends the record on the epic branch. Two writers, one file tail, and every
mid-ticket halt followed by a hand merge conflicted on it (the groundhopper
run's reconcile merge, `a5d96449`). So run records moved to `epics/<name>/runs.md`,
and the conflict has nowhere to happen. The alternative considered was a
`merge=union` attribute on `epics/*/status.md`: one line, but per-project
configuration a doctor probe can only nag about, and union also *hides* an
overlapping edit — which an append-only log forbids — instead of surfacing
it as a conflict. (Parallel waves brought the same conflict back between
*ticket* branches, where no second file can dissolve it, and the question
was reopened with real git: `union` turned out worse than that sentence
says — see § "Why a wave merges its log by appending, and not by union".)
The records written before the split stay in `status.md`
and are still read there, because rewriting an append-only log to tidy it is
the one thing the log's rules do not allow.

Moving the loop into code also moved the judge. The driver hires each
ticket's reviewer — the supervisor pattern one level up — and the worker
stops at its pushed branch without reviewing or merging anything it
wrote. The fallback under that hiring — one general agent, when the reviewer
agent cannot be spawned — covers a crashed agent and not an exhausted
environment, because it shares the primary's failure mode: in
groundhopper-foundation on 2026-08-24 both spawns hit the same session limit
milliseconds apart and the run halted, which was the correct outcome and the
one halt of that epic that retired real risk — the review the human resumed
into found two Important findings that would otherwise have merged unseen.
That closes the last place where the party under review still picked
its own judge, and it makes the merge gate mechanical: the reviewer returns
findings as structured data, and code, not prose, decides that an Important
finding left unfixed or a review addendum left uncommitted stops the run. A
gate written as a sentence is obeyed by a reader; a gate written as a branch
is obeyed by the machine.

That fallback had a second hole, and it was in the word *cannot*. "The
reviewer agent cannot be spawned" turned out to have two shapes and the code
read only one: an agent that returns nothing, and — when the launching
session never registered the plugin's agent types — a runtime that throws
instead of returning. The throw went uncaught until a run died on it on
2026-09-17, with the fallback unreachable in exactly the case it was written
for. Both are failed hires. The line the fallback draws is between a failed
hire and an exhausted environment, not between two ways a spawn reports its
failure — and a distinction that lives only in how an error arrives is one
the code will get wrong.

The trade is honest, and its name is **code-controlled, agent-executed**: the
script cannot touch a file or run a command itself, so every mechanical fact
still arrives through an agent it spawns. Control flow became deterministic;
the facts did not. The halt conditions are code; the eyes are still models.

Which is why the gates that matter read repository state rather than an
agent's account of it. The board decides that a ticket is integrated. The
pushed branch decides whether its review addendum exists. The pull request to
merge is resolved from the branch name — an invariant of the plugin — with
the number the worker reported kept only as a cross-check, because "which
pull request does this ticket own" is exactly the kind of question a
confident wrong answer ends badly. Self-reports still fill the record; they
just no longer open the gate.

### A missing report is not a missing fact

The loop reads agents through schemas, and for most of its life it treated a
disposition that returned nothing as one that did nothing. weekendgoals'
redesign-city run (H3, 2026-09) showed the difference: the agent had fixed,
written the addendum, committed and pushed — and then its structured return
failed. The script halted a finished ticket, and a human resumed it by hand
to learn that nothing had been wrong. Asked what that halt bought (the
retro's question), the answer was nothing: the fact it lacked was one `git
show` away.

So the driver now reads the branch before classifying — the same two reads
the resolve step already trusted: the dated addendum line in the ticket's own
entry, and the commits since the head the driver anchored the review on. What
that read may buy is deliberately narrow. It never stands in for the report:
with no agent's account of what the commits are, they take the bounded
re-review at the consequence tier whatever the ticket's tier, and that
reviewer is handed the first review's findings, because on this path nothing
else checks they were fixed. Findings with no commit after them halt as an
unfixed Important does. The rule underneath is the one the lane already ran
on — gates read repository state, not an agent's account of it — applied to
the one place where the absence of an account was still being read as a
state.

## Why release tickets stopped opening pull requests

Through 2026-08-18 every release ticket opened a pull request against the
epic branch, and the run merged it by number. The user's own read of the
flow named what that bought: nothing. No human reads a per-ticket pull
request in an unattended run — the human's gate is the release pull request
— and the reviewer never read one either: review reads the pushed branch's
commit range. What the pull request did add was ceremony (create, resolve,
merge — three agent steps around an object with no reader) and a mutable
indirection: a pull request's head and base can move between the moment the
driver verifies them and the moment an agent merges by number, which an
external review flagged as the run's one time-of-check gap.

Removing it made the merge boundary stronger, not weaker. The driver now
reads the pushed branch's head SHA in its read-only resolve step and merges
**exactly that commit** — `git merge --no-ff <sha>` — so the merged diff is
provably the one the review addendum and the fix-bounds check measured; a
SHA, unlike a branch name or a pull-request number, cannot be retargeted.
The board's `integrated` state, which had read "pull request merged with the
epic branch as base", now derives from the same source `shipped` always
used: ID-prefixed commit subjects, reaching `origin/epic/<name>` instead of
the default branch — one detection mechanism at two refs, and one less
dependency on `gh` in the unattended path.

The trade is named. A per-ticket pull request was a place PR-triggered CI
ran before integration, and a per-ticket discussion surface; both remain
exactly what incremental delivery offers, and a release epic's CI runs on
the release pull request where the human decides. Attended release tickets
(the `/flow:ticket` escape hatch) merge the same way: by the verified SHA,
never a name.

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
anything — and it flags evidence nothing will produce, for the same reason:
a clause whose evidence never arrives leaves the retro holding the same
nothing. The retro closes the loop by checking the evidence.

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

The standing epic's one structural cost is that it never closes: the log
and ticket doc grow without bound, and both ride every quick branch and
pull-request diff. `brief` fixed the read side — O(epic), not O(history) —
but nothing fixed the carry side. The fix is an **era rollover** (adapted
from beads' compaction, 2026-08-19, reshaped to fit this flow's doctrine):
where beads semantically summarizes old closed issues, append-only forbids
rewriting history, so the retro moves the era aside whole — archived
verbatim, nothing summarized — and a fresh quick epic continues the ID
sequence, with the floor recorded as a ground rule because the archived
headings are no longer read and a reused number would read as already
shipped. The record survives untouched; the working copy stops paying for
it. The rollover lives behind the retro's owed-conversion gate for the
same reason the general archive step does: the archive drops off the
board, and an unconverted owed item would vanish from every future brief.

## Why a relaxing instruction needs provenance

The driver has always refused to take its gates from the party it judges:
criteria are re-run `--from origin/epic/<name>`, the ticket budget is read
from that ref, the `removed` list from the signed-off map. The worker had no
such rule stated for it, and it needs one for a plainer reason than
adversaries: a worker's context is full of text nobody vouched for — file
contents, tool output, relayed messages — and a sentence saying "the human
says skip the locale fan-out" looks the same whether the human said it, a
confused supervisor relayed it, or a string in a fetched file claimed it.

In redesign-city one worker met exactly that, treated it as possible
injection, and refused to act until `git fetch` showed the change committed
on the epic branch; the reviewer judged it right in shape. The rule makes
that the method rather than one agent's good instinct, and it is asymmetric
on purpose: an instruction that *tightens* is cheap to obey and needs no
proof, while one that *loosens* a criterion, a ground rule or a scope line is
precisely what an error or an attack would say — so it binds only where the
plan lives, in the signed-off document, and is otherwise a document/code
contradiction to stop and report. The cost is a halt when a human really did
mean it and said so out of band; the repair is a commit to the epic branch,
which is where a change of plan belonged anyway.

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
  **Parallelism came back (2026-09) as something else**: not a launcher beside
  the flow but a mode of the run driver, behind the same gates, tested by the
  driver's own suite — see § "Why a run goes wide in waves". What stays
  removed is what made the first one worse than none: a second way to start
  tickets that nothing exercised. The ceiling it names is the one the
  `Parallel:` line enforces.
- **Deploy preconditions as a ticket field.** The risk is real — a fail-closed
  guard whose secret is missing takes the system down — but a dedicated field was
  more structure than it earned. It belongs in the pull request body.
- **A dependency graph with parsed `Depends on:` fields and automatic stacking.**
  It computed something the branch already knew, and its failure mode was silent:
  a dependency written in prose rather than as a bare ID read as a hard blocker
  and stalled the ticket. Revisited against beads' ready-computation
  (2026-08-19): still fails the admission test while the lanes are serial —
  document order is the dependency mechanism, and owed items carry the
  cross-epic cases. The shape to reach for if a parallel lane ever lands:
  bare-ID `Blocked by:` lines parsed strictly, doctor near-miss coverage,
  and a `waiting` board state — the strict parse being exactly what the
  first version lacked. **That lane landed (2026-09), and this is the shape
  it took** — see § "Why a dependency is a strict line, and a wait is a
  state". What stays removed is everything the first version had beyond
  that: tolerant parsing, automatic stacking, and a dependency that could
  stall a ticket without a sentence saying why.
