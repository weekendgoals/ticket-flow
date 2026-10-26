---
name: epic
description: Turn a request (a conversation, files, a design, a web page, a claude.ai artifact or a Jira issue) into an epic on GitHub Issues — a plan issue plus one sub-issue per ticket, each with acceptance criteria. Stops twice for the user, and creates nothing on GitHub until the user says yes. With --standing "<title>" it makes an empty standing epic (such as Bugs) that triaged findings fill over time. Use only when the user runs /flow:epic or asks to plan work with Flow; an ordinary implementation request runs directly, with no epic.
---

# Plan an epic: $ARGUMENTS

You produce **a plan and a decision**, not code. Nothing is built in this
session. The plan ends up on GitHub: one issue labelled `flow:epic` that holds
the plan, and one sub-issue per ticket. Until the user says yes at the end,
everything lives in draft files outside the repository.

`FLOW` below means `node "${CLAUDE_PLUGIN_ROOT}/scripts/flow.mjs"`, run from
the repository root. It needs `gh` signed in; run `FLOW doctor` once at the
start and stop if it reports that `gh` is missing or signed out, because the
plan cannot be created without it. Missing labels are fine for now: step 6
creates them.

If `$ARGUMENTS` starts with `--standing`, skip steps 1 to 7 and follow
[A standing epic for findings](#a-standing-epic-for-findings) at the end:
that epic has no tickets to plan yet.

**Write for a person, not for Flow.** Everything you show the user and
everything you post is plain language: short sentences, no internal terms, no
abbreviations they would have to ask about. The person approving the plan is
often not the person who will read the code.

## 1. Read every source

`$ARGUMENTS` may name sources after an optional short name for the epic. The
conversation is always a source; anything named is added to it, never instead
of it.

- **Files and globs:** read each in full.
- **Web pages:** fetch with WebFetch.
- **`claude.ai/artifact/...` links:** read with the Artifact tool's `read`
  action, never with WebFetch.
- **A Jira issue:** if the `jira` command is installed, `jira issue view <KEY>
  --plain`; otherwise fetch its URL; if neither works, ask the user to paste
  it.

If a source cannot be read, **stop and say which one**: a plan built on part
of the brief is wrong in ways nobody can see.

If no source names something you would otherwise have to guess, ask now. The
conversation is about to be thrown away, so every answer you get goes into the
plan.

## 2. Ground the plan in the code

A plan written from the request alone invents work that is not needed and
misses work that is.

- Read the project's instruction files (`CLAUDE.md`, `AGENTS.md`) at the root
  and in every package or service you expect to touch. **Name those areas as
  you go**: the research decision below depends on the list.
- Read the code and data the work concerns.
- Run `FLOW board` to see which other epics are open and where they overlap.

### Research: facts from a reader who was not told the answer

**Spawn `flow:researcher` when the request names a solution** ("add a cache",
"use library X") **or touches more than one area.** A named solution anchors
your own reading; several areas mean more you have not read. A one-area
request with no named solution does not need it.

Before spawning, **tell the user you are running it and list your
questions**, so they can say skip or point out a question the request already
answers.

Spawn it with the Agent tool, `effort: high`, **without a `model` parameter**
(the agent pins the strongest model; nothing checks what a researcher left
out, so it is never run cheaper). Give it the areas as paths, the instruction
file for each, the plugin root (`${CLAUDE_PLUGIN_ROOT}`, resolved), and five
to ten questions.

- **Do not give it the request, the proposed solution or your ticket
  ideas.** A researcher told the wanted answer finds evidence for it.
- **Ask about the present only**: "how does checkout reach the payment
  provider today", never "would a cache help here". It refuses questions
  about the future and says what present-tense question to ask instead.

Read its facts before you split anything into tickets. Where a fact
contradicts the solution the request names, raise it as a question in step 3.
Every line under "Could not establish" becomes either a question for the user
or the thing the first ticket proves. Its "Open questions" go to the user
first. No research file is saved: what matters goes into the epic and ticket
bodies.

## 3. Agree the shape in chat — first stop

A finished plan anchors; changing the shape now costs a sentence. Show, in
chat, compactly:

1. **Outcome**: who has the problem, what will visibly change, how anyone
   will know it worked, and what would make you undo it. It must be able to
   fail: "improve the UX" never fails; "support requests about X stop" can be
   checked later.
2. **Walkthrough**: three to seven short scenes, in the order a person meets
   them, of what someone will be able to do once this ships and what happens
   today instead. **No ticket numbers and no file names**: the reader is the
   person who asked for the work.
3. **Shape of the change**, for whoever approves the plan: what the code
   will look like. A small file tree of what is added (`+`), changed (`~`)
   and removed (`-`), grouped under shared directories, and, for each data
   shape, table, route or contract that changes, a `diff` block of it before
   and after. Show only what helps a decision: a reader approves the
   structure faster from its picture than from ticket prose, and spots a
   wrong one sooner. It is the one part of the plan that names files.
4. **Tickets**, one line each, in order: title — what it builds or proves —
   tier (`easy` or `hard`, see step 4) — which earlier tickets it must wait
   for, if any. Say why the first ticket is first: it should make the first
   scene work end to end, thinly, rather than build one layer (database, then
   API, then screen) that nobody can see until the last ticket.
5. **What runs side by side**: which tickets can be built at the same time,
   and the `Parallel:` setting you propose (1, 2 or 3). Two tickets can run
   together only if neither waits for the other and they do not edit the same
   files. In the same breath, ask which `Stops:` they want for a run
   with nobody watching: `ask` (a ticket that needs a decision stops and
   mentions them) or `none` (nothing stops: an agent decides where it may
   and records it, the rest is parked, and the release pull request is
   where they read what was decided).
6. **Delivery**: `release` (the default: every ticket merges into one epic
   branch, and one pull request goes to the default branch at the end) or
   `incremental` (each ticket opens its own pull request to the default
   branch). One line on why.
7. **Questions**, as one plain list, **each with your recommended answer**, so
   the user can reply in a word per question.

**Wait for the user to agree the shape** before writing tickets. This is a
steering stop, not the approval.

## 4. Write the drafts and prove every CHECK is red

Make a draft directory **outside the repository** (your scratchpad directory
if the session has one, otherwise `mktemp -d`). Write `epic.md` there and one
file per ticket, numbered in order (`01-<short-name>.md`, …). Keep a list in
chat of each ticket's title, tier and which earlier tickets it waits for, by
position: issue numbers do not exist yet.

### The epic body (`epic.md`)

```markdown
## Outcome

<the outcome from step 3, falsifiable, naming who or what will show it worked>

## Sources

- <each source, with today's date; what the conversation decided>

## Settings

Delivery: release
Parallel: 1
Stops: ask
Branch: epic/<short-name>
Design sources: <repository paths of design files, comma-separated; omit the line when there is no design>
Consequence paths: <globs where a mistake is expensive, e.g. src/auth/**, migrations/**; omit when none>

## Walkthrough

<the scenes from step 3, in plain language, no ticket numbers or file names>

## Shape of the change

<the file tree and the before-and-after diff blocks from step 3>

## Ground rules

- <what every ticket must respect that a builder with no context would get
  wrong; a fact about the project belongs in its instruction file instead>

## Design map

<only when Design sources is set; the block below>

## Tickets
```

The design map, under `## Design map`, is one fenced block marked
`design-map` holding JSON:

````markdown
```design-map
{
  "landmarks": [
    { "name": "hero", "design": "<selector in the design file>", "page": "<selector in the built page>",
      "source": "<the Design sources path that draws it>", "widths": [1440, 393] }
  ],
  "removed": [
    { "name": "promo", "by": "<the ground rule that drops it>", "date": "<YYYY-MM-DD>" }
  ]
}
```
````

Each landmark is one thing the design draws that a `COMPARE` line can name.
`page` is your best guess at the built page's selector; the builder may
correct it. `source` and `widths` say where the design draws it, so a
landmark missing from the built page fails there instead of being ignored.
`removed` lists what the plan deliberately does not build, with the rule
that decided it: only the plan may say an element is not built, never the
ticket that failed to build it. The comparison reads the map with
`FLOW design-map <epic> --out <file>`, and `FLOW create-epic` refuses a map
it cannot read.

`Stops:` is what an unattended run does with a decision no agent may make:
`ask` stops the ticket and mentions a person; `none` stops nothing, parks
what no agent may decide and reports everything once at the end. Write the
one the user chose in step 3.

Leave `## Tickets` empty: `create-ticket` adds each ticket there as it is
created. One `Key: value` per settings line; `FLOW create-epic` refuses
settings it cannot read, because a guessed setting is a wrong one.

### A ticket body (`NN-<short-name>.md`)

~~~markdown
## Scope

- <what to build, concretely: files, functions, behaviour>

## Not in scope

- <the tempting nearby work, and which ticket owns it>

## Acceptance criteria

- <a criterion a person can verify, and how>

```criteria
- <a criterion a command can decide>
  CHECK: <command run from the repository root>
  EXPECT: <text its output must contain>
- <a criterion about what the design draws>
  COMPARE: <a path from Design sources> @ <width>[, <width>]
  LANDMARKS: <name>[, <name>]
```

## Notes

<optional: facts from research or the code that the builder needs>
~~~

Do **not** write the `Epic:` or `Blocked by:` lines: `FLOW create-ticket`
writes both from real issue numbers in step 6.

Rules for tickets, each with its reason:

- **Waiting is explicit and only on earlier tickets of this epic.** A ticket
  that must not start before another is finished waits for it; everything
  else is independent and may run beside it. A wait on work outside this epic
  cannot be tracked here: say it in the epic's ground rules and ask the user.
- **One session, one reviewable change**: a few hundred changed lines. If the
  criteria do not fit a handful of bullets, split the ticket. **Never write a
  size or count as a condition the builder must stop on** ("stop past 400
  lines"): it is your estimate, and a builder who misses it has broken
  nothing that was designed.
- **Scope, Not in scope and Acceptance criteria are all required.** "Not in
  scope" is what keeps a builder with no context from wandering.
- **Every criterion is checkable.** Prefer "when <condition>, <observable
  result>". Where a command can decide it, put it in the one ```` ```criteria
  ```` block as a `CHECK:` line indented under its bullet, with an optional
  `EXPECT:` (exit code 0 alone decides when there is no EXPECT). A CHECK
  outside that block never runs and `FLOW` refuses it. **Every ticket has the
  block, with at least one CHECK or COMPARE**: a ticket with none fails its
  check, so nobody can turn a ticket green by deleting the block.
- **Write the EXPECT so a skipped run cannot satisfy it.** A suite that skips
  itself (no database, no credentials) exits 0 and still prints test titles.
  Point EXPECT at a line that proves the run, such as a pass count
  (`12 passed`). Under `node --test --test-name-pattern`, `# pass 1` is
  printed even when nothing matches, so expect two matching tests.
- **An EXPECT is text you have seen the command print.** Run the CHECK once
  and copy the line, because a wording recalled from memory (a linter's
  "0 errors", a phrase the generated report does not use) fails on correct
  code; when no printed line proves the result, add `&& echo <marker>`
  after the command. Never expect a test's title, which a later rename or a
  merge of the default branch changes.
- **A CHECK never picks a file by modification time** (`ls -t`), because a
  fresh checkout scrambles it; pick by git history instead.
- **A whole-suite run is not a criterion.** `npm test` with `EXPECT: passed`
  is green before the ticket exists. Name the one test or fact this ticket
  turns green.
- **Tier**: `easy` for a well-specified change in familiar code (built by the
  faster model), `hard` for anything subtle, cross-cutting or thinly
  specified (built by the strongest model). When unsure, `hard`.
- **The first ticket proves what the plan assumes.** If the plan rests on
  something unproven, the first ticket proves or kills it, and its Notes say
  what happens if it fails. An outside name the plan calls by (a model id,
  an endpoint, a region, an account or a credential) counts as unproven:
  probe it now with the smallest call that answers and write the call and
  its answer into the plan, or give it to the first ticket, because a
  wrong one stops the run halfway with the person away. A criterion that
  needs a credential or a live service the run will not have is a person's
  step in the plan, never a CHECK: the run cannot pass it, so it stops.
- **A ticket that waits for a person's approval carries the work that
  follows it.** `check-epic` runs every done ticket's checks at each new
  epic head, so work left red until a later ticket (an English-only text
  waiting for its translations) fails every ticket merged in between and
  reopens tickets that changed nothing. Stop for the approval inside the
  ticket, then finish it there.
- **A design gets compared.** When the epic has `Design sources:`, every
  ticket that builds something the design draws carries a `COMPARE:` line
  naming its landmarks, and the last building ticket compares each whole page
  (a `COMPARE` with no `LANDMARKS` line) at every width the design draws:
  section-by-section checks do not add up to a page that matches. A COMPARE
  is never run by `FLOW check` (it needs a browser); it is listed as manual,
  and the builder posts the comparison table.
- **UI tickets carry testing ground rules.** Write these into the epic's
  ground rules when any ticket builds UI:
  - Component tests with react-testing-library are the default: fast
    feedback on logic, rendering, state changes and edge cases inside one
    component.
  - A browser end-to-end test only where the epic's outcome depends on a real
    user journey across routing, APIs, sign-in, browser behaviour and several
    screens — never one per feature. Name the journey in the ticket that adds
    it. End-to-end tests that do exist use the Page Object Model.
  - When `.flow.json` at the repository root has a `screenshots` command:
    the builder posts screenshots of the built UI on the ticket
    (`FLOW screenshots` runs it). When it has none, write no screenshots
    rule, because a rule nobody can carry out is broken on every ticket, and
    put the missing command in the questions for the user.
- **Translations come last.** If the project has translation catalogs, the
  final ticket is "Translations", waiting for every other ticket: strings
  settle only when the rest is built, and translating earlier means
  translating twice.

### Prove every CHECK red

For each ticket, run:

```bash
FLOW check --file <draft-dir>/NN-<name>.md --epic-file <draft-dir>/epic.md
```

Every CHECK must **fail** on the code as it is now. A CHECK that already
passes proves nothing the ticket will do, and would pass whatever gets built.
A CHECK that fails for the wrong reason (a typo, a missing tool, a skip) has
not been proven either: read the evidence line. A malformed line is reported
as a problem; fix it. Keep a short record for step 6: which CHECKs you saw
fail, and which you could not run here and why (a minutes-long suite, a
service this machine does not have).

## 5. Plan review

You wrote the plan, so you are the worst reader of it. Spawn
`flow:plan-reviewer` with the Agent tool, `effort: high`, **without a `model`
parameter**. Hand it, as text: the epic body, every ticket body with its
title, tier and what it waits for, your record of which CHECKs you saw fail,
the draft directory path, the plugin root (`${CLAUDE_PLUGIN_ROOT}`,
resolved), the instruction files for the areas in scope, one line on what was
asked for, and the design files when there are any. It reports; it does not
edit.

Then **fix what it got right** in the drafts, **keep a reason for what you
reject**, and **carry its questions for the user forward unchanged**.

## 6. Approval — second stop, then create

Show the user, in this order:

1. The walkthrough.
2. The shape of the change.
3. The tickets, one line each, in order, with tier and waits, and what runs
   side by side.
4. One other way you considered splitting the work, and why you did not.
5. Which CHECKs you saw fail, and which could not run here and why.
6. What the plan review found, what you changed, what you rejected and why,
   and its questions.
7. With `Delivery: release`, say plainly: "after your approval, the tickets
   are built, reviewed and merged into the epic branch without asking you;
   your next decision is the pull request at the end." With `Stops: none`,
   add: "nothing stops for you while it runs; what an agent decided and
   what it parked is in the run's report and on the release pull
   request."

**Ask: "Create this on GitHub?" and wait.** Nothing is created before a yes.
If the user wants a teammate to approve on GitHub instead, create everything
below but leave out the approval label at the end, and say that adding
`flow:approved` to the epic is the teammate's approval: until then no ticket
can start, because tickets become ready only on an approved epic.

On yes, first make sure the branch name is free, before anything is created:

```bash
FLOW doctor                     # if it reports missing labels: FLOW init
FLOW board                      # its first line names the default branch
git ls-remote origin refs/heads/epic/<short-name>
```

If `ls-remote` prints a line, the branch already exists, possibly left over
from older work: **stop**, tell the user, and ask for another short name (then
change `Branch:` in `epic.md`) or for them to delete the old branch by hand.
Never force-push over it: its commits would ride into, or vanish from,
somebody's work.

Then create the epic:

```bash
FLOW create-epic --file <draft-dir>/epic.md --title "<epic title>"
```

It prints the epic number `E`. Then, **in order**, for each ticket:

```bash
FLOW create-ticket E --file <draft-dir>/NN-<name>.md --title "<title>" --tier easy|hard [--blocked-by <n>,<n>]
```

`--blocked-by` takes the issue numbers printed for the earlier tickets this
one waits for. Each call prints the new ticket's number; keep the mapping.
`create-ticket` refuses a ticket with no criteria block, an unreadable
blocker or a malformed criterion before creating anything: fix the draft and
run it again.

If it says it **created the ticket but could not link it**, never run
`create-ticket` again (that makes a duplicate): run the `FLOW link E <n>` it
names, which is safe to repeat, until it succeeds. For any other failure,
stop and tell the user which tickets exist, because a half-created epic must
not be mistaken for a whole one.

Cut and push the epic branch from the default branch on the remote, never
from whatever is checked out (a stale local branch would ride into every
ticket):

```bash
git fetch origin
git push origin origin/<default-branch>:refs/heads/epic/<short-name>
```

If the push is rejected, stop and show the user git's message; do not retry
with `--force`.

Then approve the epic (skip this when a teammate approves on GitHub):

```bash
FLOW label E +flow:approved
```

Tickets keep `flow:planned` until they start; Flow works out which are ready
from the approval and their blockers. Run `FLOW board E` and check every
ticket is there, in order, with the right tier and waits. Print the epic's
URL.

## 7. Hand over

Say that the epic is ready to build (once approved, when a teammate
approves it on GitHub), and in one line that this is a good point to start
a fresh session, or to run `/compact` with a focus sentence you supply (for
example "keep: epic #E, branch epic/<name>, first ready ticket #<n>"),
because this one is full of
planning. Then the three ways to build it:
`/flow:ticket #<n>` builds its first ready ticket with them watching;
`/flow:run #E` builds the whole epic on this machine with nobody watching;
and when the project has Flow's GitHub Action (`.github/workflows/flow.yml`),
the approval has already started it on GitHub, so it must not also run here:
two hosts would build the same tickets. Then stop.

## A standing epic for findings

`/flow:epic --standing "<title>"` (usually `"Bugs"`) makes an epic that
holds no plan of its own: findings (issues labelled `flow:found`) are filed
under it, and `/flow:triage` turns the approved ones into its tickets over
time. There is nothing to research, split or review, so there is one stop.

1. Read the project's instruction files (`CLAUDE.md`, `AGENTS.md`) for its
   testing rules and whether it has translation catalogs.
2. Write `epic.md` in a draft directory outside the repository:

   ```markdown
   ## Outcome

   The site stays correct: what people report gets fixed, one small pull
   request at a time, and a fix that breaks something else is reported the
   same way.

   ## Settings

   Delivery: incremental
   Parallel: 1
   Stops: ask

   ## Ground rules

   - <the project's testing rules, from its instruction files>
   - Translations last: a ticket that changes text updates every catalog in
     the same pull request, after the change itself works.
   - Every ticket is its own pull request into the default branch.

   ## Tickets
   ```

   `Stops: ask`, because each fix is its own small pull request, so a stop
   holds back nothing else. `Delivery: incremental` and **no `Branch:` line**: each ticket is built
   from the default branch and opens its own pull request, because bug fixes
   arrive one at a time and must not wait for each other in one release.
   `## Tickets` stays empty; `promote` lists each ticket there.
3. Show the body and ask **"Create this on GitHub?"**, then wait. On yes,
   `FLOW doctor` (and `FLOW init` if it reports missing labels), then
   `FLOW create-epic --file <draft-dir>/epic.md --title "<title>"`. It prints
   the epic number `E`.
4. Approve it like any epic: `FLOW label E +flow:approved`, or leave that to
   a teammate on GitHub. Until triage promotes a finding into it,
   `FLOW next E` exits 1 saying it has no tickets, and that is correct:
   nothing is built and nothing can start.
5. Say that findings go under it (`FLOW create-finding --epic E`, the
   reporter extension, or an issue on GitHub labelled `flow:found` and added
   to its sub-issues), that a person approves each with `flow:approved`, and
   that `/flow:triage #E` turns the approved ones into tickets. Then stop.
