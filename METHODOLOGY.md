# Why it works this way

**This document contains no rules.** The rules live where they are executed, in
the four skills. Those are self-sufficient — an agent never needs to read this
file to do its job.

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

Two constraints came out of that. Serial-to-main is the default, because merging
is usually fast and the latency saved by stacking is close to zero. And **the
epic's documents are never deleted to make a diff smaller** — if a pull request
is too big to review, the epic was too big to plan that way.

Integration mode exists for the real exception: tickets that cannot ship alone.
Even then each ticket keeps its own small pull request; only the release is
batched.

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
