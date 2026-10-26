# Why Flow works the way it does

Flow 2.x ran for months on real projects. Most of its machinery is gone in
3.0, but some of what it learned still decides how 3.0 is built. This file
keeps only those lessons, each with the scar it came from. It holds no
rules: the skills and `CLAUDE.md` do. If this file and a skill disagree, the
skill wins.

Lessons learned since 3.0 are added at the end, usually from a retro, each
as a section with a dated first paragraph saying what happened, with the
link, and a second saying what it teaches.

## There is no shared file to merge any more

2.x kept every ticket's record in one append-only markdown file per epic.
Tickets built side by side each appended to it, and the branches had to be
merged. Git's built-in `union` merge driver looked made for this, and it
corrupted every merge it touched: it works line by line and writes a line
both sides share only once, so one ticket's closing line landed under
another ticket's heading — in a merge git reported as clean. The custom
driver that replaced it worked, but it was one more thing to install, test
and explain.

3.0 keeps progress as issue comments and state as labels. Each ticket
writes to its own issue, so two tickets never write to the same place and
nothing needs merging.

## The party that built a thing reviews it worst

A session that wrote the code, or the plan, reads what it meant rather than
what it wrote. Every review in Flow is a separate agent with a fresh
context that never sees the builder's conversation: the plan reviewer has
not seen the planning chat, and the ticket reviewer will not see the
worker's transcript. That is what lets a review find something.

## Reviewers report and never fix; the researcher observes and never proposes

A reviewer that fixes what it finds becomes a second author, and nobody
reviews its fixes. So reviewers report, and the session that owns the work
decides what to apply and says why it rejected the rest.

The researcher is the same rule one step earlier. A researcher told the
wanted answer reads past the code that disagrees and hands back the request
with citations attached; the planner then splits the work against its own
idea, returned in another voice. So it is given the areas and present-tense
questions, never the request, the proposed solution or the ticket list, and
it reports facts without proposing anything.

Both run on the strongest model available. A citation proves what was
found; nothing proves what was missed, and a cheaper reader misses more.

## Every CHECK is proven red before the plan is approved

A CHECK that already passes on today's code proves nothing the ticket will
do, and it passes whatever gets built. In 2.x one passed vacuously and
shipped that way; in one epic six of eight CHECKs were whole-suite runs
that were green before any work began. Variants keep turning up: a test
filter that matches nothing still prints `# pass 1`; a suite that skips
itself for want of a database exits 0 and still prints the test names an
EXPECT was looking for. Running every CHECK before approval, and reading
why it failed, is the only check that catches all of them.

## A number in a ticket manufactures a false departure

Twice a plan wrote an estimate into a ticket as a condition ("two lines",
"split past ~450 lines"). The builder missed the estimate, which was the
planner's guess, and the run stopped to ask a person a question the plan had
invented. A size the planner expects belongs in its head when it splits the
work, or in the ticket as an expectation the reviewer weighs, never as a
condition the builder must stop on.

## Halts that fire on infrastructure are false alarms

Of about seventeen unattended 2.x halts on record, six were real. The rest
were session limits, an agent that sent no report, a gate on the size of
review fixes that never once found a defect, and a cost limit that fired
after the merge it was meant to prevent. Every false halt costs a person a
context switch and teaches them to stop reading halts.

So 3.0 stops a ticket for three reasons only: a gate still fails after two
rounds of fixes (the acceptance checks, an Important review finding, a pull
request thread or check); the plan and the work disagree (the ticket
contradicts the code, a check looks wrong, the issue body changed after the
start); a merge conflict the agent cannot resolve. An epic also stops when
tickets' checks fail at its head after merging. Anything else retries,
becomes a comment, or falls back to building one ticket at a time.

## A driver that reads a retelling halts on the retelling

2026-10-19, epic #433. A workflow script has no shell, so the run driver
had a small agent run each command and report what it printed, and for
`flow next` it asked that agent to fill in a form from the JSON. Twice the
run halted on the agent's account instead of on GitHub's: "epic #433 is not
approved" while the label had been on the issue for hours, and "the release
pull request could not be opened" twelve seconds after the command had
opened it. The two false halts cost forty minutes of a person's attention.
A retelling is not the record: the driver now parses what the command
printed, asks once more when nothing readable came back, and halts over
what GitHub said only when two readings agree.

## A gate is verified at the door its actor walks through

A refusal only guards something if it lives in the command the guarded
actor actually runs. In 2.x a check lived in a sibling command the worker
never called, and a refusal advertised a recovery that did not work in the
refused state; both shipped repeatedly before review caught them. In 3.0
the commands that change GitHub refuse bad input themselves: `create-ticket`
refuses an unreadable `Blocked by` line or a malformed criterion before
anything is created, and `label` refuses to leave two state labels on one
issue.

## Strict lines, named problems

A dependency written as prose was once read tolerantly, and tickets stalled
with nothing saying why. `Blocked by:` takes issue numbers and commas and
nothing else. A line that mentions blocking and cannot be read is reported
by name and the ticket waits, because a guess about what a sentence meant
is worse than a question.

## A person merges to the default branch, and no code work runs after

Agents merge a ticket into its epic branch, by the exact commit that was
reviewed, never by a branch name that could move. The step into the
default branch is always a person's, through the epic's one pull request:
anything that built or merged after that merge would be work nobody
reviewed, landing where everyone builds from.

2026-10-18, Flow 3.3. The project board's `Release` field could only reach
`Released` if something ran after the merge, since nothing else sees the
epic close. The first draft said "nothing runs after", and a review found
the new job contradicting that sentence and every copy of it stating the
exception differently. What it teaches: the line worth holding is code
work, not any work, and an exception is stated once, where the rule is
(CLAUDE.md), so the copies cannot drift.

2026-10-26. Three tickets delivered by their own pull requests stayed in
review after a person merged them: done was the build's last step, after
a pull request loop that can wait half an hour a round, and nothing else
set it. A state that only a remembered last step sets is lost whenever
the run ends early; the fact it stands for (the pull request merged) was on
GitHub all along, so a second job after the merge now reads it.

## Replacing a field's options gives every option a new id

2026-10-18, Flow 3.1. `flow init --board` added the `Status` options a
linked project lacked by sending GitHub the field's whole option list, old
names and new ones, because GitHub's API cannot add one option to a
single-select field, only replace the list. The replacement gave every
option a new id, the unchanged ones included, and an item's status points
at an option by id, so every item on the board would have lost its status.
Review caught it before the release, and the fix
([803cc721](https://github.com/weekendgoals/ticket-flow/commit/803cc721))
reads each item's status by name first and sets it back afterwards.

A name that looks unchanged is not proof that what points at it still
holds: an API that replaces a list may rebuild every entry in it. Before
writing to a shared record, ask what refers to the thing being replaced,
and test the references, not the names.

## A stop costs a context switch, and the decision can wait for the pull request

2026-10-19, epic #433 in weekendgoals. One six-ticket unattended run
stopped seven times. Two were false (Flow 3.4 removed them); of the five
real ones, three were plan mistakes a plan reviewer now catches. Each stop
cost the person a context switch, about an hour of waiting in all, and
each ended the run short of its release pull request, so the work waited
for the person's next look.

What it teaches: the person reads the release pull request anyway, so most
decisions can wait there. Under `Stops: none` an agent decides what it may
and records it on the ticket, what it may not decide is parked without a
mention while the run builds everything else, and the person is told once,
at the end. A project that wants a person in the loop keeps `ask`, and an
attended session always asks, because a question in the chat costs
nothing.
