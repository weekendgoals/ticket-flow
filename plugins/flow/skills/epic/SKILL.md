---
name: epic
description: Turn a feature request, investigation or conversation into an epic — a folder under epics/ with a ticket doc and its source context. Stops for sign-off before anything is built. Use only when the user explicitly runs /flow:epic <name> or asks to plan the work with the Flow methodology — an ordinary implementation request, without that, runs directly with no epic documents.
---

# Plan epic $ARGUMENTS

You are producing **a folder and a decision**, not code. Nothing is
implemented in this session. This file is the procedure; METHODOLOGY.md
carries the reasons.

## 1. Read the arguments, then get the input

`$ARGUMENTS` is **the epic name, optionally followed by sources**:

```
/flow:epic venue-identity
/flow:epic security ~/reports/audit-2026-07-30.md
/flow:epic leagues docs/census.md https://example.com/spec  epics/*/context/prior.csv
```

- The **first token is the epic name** → `epics/<name>/`; kebab-case, no
  slashes or dots. If it looks like a path or URL (contains `/`, has a file
  extension, starts with a scheme), no name was given: treat every token as
  a source and propose a name after reading them.
- **Everything after the name is a source**: a file path, a glob, or a URL.

Below, `<name>` is the parsed epic name, never the raw `$ARGUMENTS`.

**The conversation is always input; sources are added to it, never instead
of it.** Say in the sign-off which shaped what.

**Sources.** Read every source **in full** before proposing anything, and
copy each into `epics/<name>/context/`: a file or glob verbatim (the ticket
doc is your reading of it; a future session may need to disagree with your
reading); a URL fetched and saved with the URL and today's date at the top (a
link rots). Anything unreadable: **stop and say so** — never proceed on a
partial brief.

**No source at all** is legitimate — the brief is the conversation — but
**ask about anything you would otherwise guess at**, and write what you learn
into the ticket document, because this conversation is about to be thrown
away.

## 2. Ground yourself before decomposing

- The root agent instructions (`CLAUDE.md` or `AGENTS.md`) and the same file
  for every service, package or workspace in play. **If they are stale, fix
  them first** — every ticket will be written and executed against them.
  **Name the areas you expect to touch as you do it** — you are already
  opening one instruction file per area, so the list exists here, a step
  before `Areas in scope:` writes it down; the research trigger below is
  judged on it.
- The actual code and data the epic concerns. A decomposition written from
  the description alone invents tickets for problems that do not exist and
  misses the ones that do.
- `node "${CLAUDE_PLUGIN_ROOT}/scripts/tickets.mjs" list` — what other epics
  are open, and where they overlap this one.

### Research — facts from a context the brief never reached

**Run this when the brief NAMES a solution** — "add a cache", "use library
X", "move it to the worker" — **or when the epic spans more than one area.**
It is your judgement, and the trigger is stated so it is a judgement about
something: a brief that names a solution is the case where your own reading
is most anchored, because you read the code to confirm what you have already
been told and you cannot unsee it; more than one area is the case where what
you did not read is largest. A one-area epic whose brief names no solution
does not need it — the grounding above is enough, and a researcher there is
ceremony.

**Say in chat that you are running it, and list the questions you will ask,
before you spawn anything.** The user can say skip, and a skip is only a
choice where the step was shown: a gate is verified at the door its actor
walks through, and the actor here is the person paying for the step. The
questions in that message are also the cheapest review this step gets — the
user is the one reader who knows which of them the brief already answers.

Spawn `flow:researcher` with the **Agent** tool — omit the `model` parameter
so the agent definition's pinned strongest model applies, and `effort: high`.
It is not cheap and is not meant to be: a citation proves a present claim, so
the Facts are the one part of the report anybody can check, and **nothing
proves an absence** — the file nobody opened leaves no trace at all. The two
sections you will lean on hardest, **Could not establish** and **Open
questions**, are judgement about what was *not* found, and an omission there
is not caught by a reader; it is decomposed against, and paid for in tickets.
It reports what is true today and
**proposes nothing** — no design, no ordering, no decomposition: a researcher
who starts solving stops observing, and the report you want back is the one
nobody wrote toward an answer.

Give it: the **in-scope areas** as paths and the instruction file that binds
each; **the plugin's root path** (`${CLAUDE_PLUGIN_ROOT}`, resolved — it runs
`tickets.mjs list` and `doctor` for what other epics are open, and the script
is on no PATH); and **your list of questions**.

**Strip the brief, the proposed solution, the ticket list and the Outcome
line from what you hand it.** That is the mechanism, not an omission: a
researcher told the wanted answer confirms it — reads past the code that
disagrees and hands the brief back with citations attached — and you would
then decompose against your own reading returned in another agent's words.

**The questions are about the present, and a question about a future is
refused.** Ask "how does the checkout reach the payment provider today",
"what handles the empty-cart case", "which tests cover the retry path",
"where is the rate limit configured". Do not ask "would a cache here work",
"is approach A better than B", "should this move to the worker": the
researcher was not told what the work is, so an answer would be a guess
wearing a citation — it refuses those, quotes them back, and names the
present-tense question each would have to become. **Five to ten questions is
the budget**, and the researcher stops when they are answered rather than
when the area is exhausted: the questions are the only thing bounding what it
reads, so a long list is a survey of the repository, which costs more than
the planning session it is saving and returns facts nobody asked for.

**Read the Facts before you slice anything** — that is the whole point of the
step, and a fact that arrives after the decomposition is a fact that has to
argue with it. **Where a fact contradicts the solution the brief names, say
so at the shape stop below, as a question**: the brief's author is the one
person who can decide whether the fact changes the want.

**Its other two sections have owners too.** Every line under **Could not
establish** is either a question for the user in step 3's sweep or the thing
ticket one proves — the researcher searched for it and the repository did not
answer, which is an unproven assumption whichever way it resolves, and the
plan reviewer's lens on a probe buried at ticket four is waiting for it. The
**Open questions** go into the clarify sweep, first.

Where the facts live: the ones that shape the plan go in the plan page's
`grounding` lines (one per fact, with its citation) and in the shape message;
the ones a ticket needs go in **that ticket's body** in `tickets.md`. **No
research document is committed.** `tickets.md` is the record, a file nobody
re-reads preserves nothing the ticket body does not, and an artifact that
preserves no knowledge and constrains nothing fails the admission test.

## 3. Clarify, agree the shape, then write `epics/<name>/tickets.md`

**First, hunt what you would otherwise guess.** Sweep the brief and the
grounding for underspecified points — scope boundaries, data and its
lifecycle, error and edge behaviour, integration contracts, non-functional
expectations, any sentence two readers could read two ways. **Ask the user
the ones whose answer changes the shape of the work — batched, concrete,
each with the readings you are choosing between**; a handful of sharp
questions is the budget. **Step 2's researcher, where you ran one, hands you
its "Open questions" — start from those**: they are the ones the code cannot
settle, found by a reader who had no brief to resolve them against. Take its
**"Could not establish"** here too: an absence somebody searched for is
either a question the user can answer outright or an assumption ticket one
has to prove. Record
every answer in the ticket document. The rest ride to sign-off as open
questions.

**Then show the user the shape and let them bend it** — a finished
decomposition anchors, and a re-split costs a sentence now and a rewrite
later. Present, compactly: the draft **Outcome** line (and the numbered
**Requirements** when the epic carries them); the **areas in scope** and
anything grounding turned up; the **delivery choice** and its why, in one
line; the **ticket list as one line each** — `ID — name — what it proves or
builds` — in order, with a word on why the first is first.

**Write the walkthrough — the epic in the user's own words**, and present it
first, before the ticket list. Three to seven
**scenes**, in the order a person meets them and never in ticket order. Each
scene carries four fields: `who` acts, what they `does`, what they `sees` once
this ships, and `today` what happens instead; plus the `tickets` that build it,
as a structured list, and the numbered `requirements` it serves when the epic
has them. Sign-off is otherwise made on engineer-shaped material — tickets,
criteria, a delivery mode — and the person who asked for the feature has
nothing in front of them written in their own terms. The rules, each with its
reason:

- **The reader is the person who asked for the feature**, not the person who
  will build it, so the prose carries **no ticket IDs and no file names**. The
  IDs ride in the scene's `tickets` list, where the page renders them as tags;
  "PAY-2 adds the refunds endpoint" is a sentence written for the wrong reader,
  and a scene nobody outside the team can read is a scene that checks nothing
  at the gate it exists for.
- **A scene may name only tickets this plan carries, and that is checked at
  both doors.** `plan-page.mjs` refuses to render otherwise, naming the scene
  and the ID, and a requirement citation outside the numbered list is refused
  the same way; `/flow:doctor` then reads the `**Tickets:**` line of every
  scene in `tickets.md`'s `## Walkthrough` section and warns on an ID this
  epic does not have, or on a line too loose to parse. Both, because prose
  about a future nobody has to build is exactly the fiction this section
  produces when nothing ties it down — and the page is thrown away while the
  section is what every worker and the retro actually read. **Run
  `/flow:doctor` after writing the section**, the way you run it before
  sign-off for the dependency lines.
- **Tickets no scene names are printed under the walkthrough**, as "In no
  scene" — never hidden. Infrastructure a user never meets belongs there and
  the reader should see it; a user-visible ticket landing there is a scene
  nobody wrote.
- **`firstWhy` should point at scene 1**: the first ticket makes the first
  walkthrough scene work end to end, thin. A decomposition split by layer
  (schema, then API, then UI) makes the first user-visible slice arrive last
  and hides integration risk until the end, which is the one shape the
  walkthrough makes visible before it is built.

**Render the shape as a page.** Write it as JSON into your session's
**scratchpad** (never the repository — `tickets.md` is the record); the
schema is at the top of `scripts/plan-page.mjs` (`stage: "shape"`, outcome,
requirements, the `walkthrough` scenes, areas, the `grounding` lines — where
step 2's research facts go, one per line with its citation — delivery with its why, the
ticket lines, `firstWhy`).
Then:

```bash
node "${CLAUDE_PLUGIN_ROOT}/scripts/plan-page.mjs" <scratchpad>/plan-<name>.json --out <scratchpad>/plan-<name>.html
```

Publish it as an artifact and print the URL (no artifact surface: send the
file). Keep the ticket lines in chat too — the page is the reading view, the
chat lines are what the reply quotes. Say in one sentence that **they can
select any text on the page, type a note, and paste the copied block back into
this chat**. **Wait for the user to say the shape is
right** before writing the full sections; this is a steering stop, not the
sign-off gate. On a redirect, update the JSON, re-render, and **republish
the same file path** so the URL evolves with the plan.

**A pasted block is steering, and you answer it in the turn it arrives.** The
page copies, and the human pastes:

```
> [<anchor>] <the text they selected>
<what they said about it>
```

The anchor says where they are pointing — `outcome`, `requirements`,
`walkthrough`, `scene-<n>`, `tickets`, a bare ticket ID (`PAY-3`),
`alternative`, `plan-review`, `open-questions`, or `page` when the selection
sat under none of them. Read it as if they had typed the same words in chat
about that part of the plan: answer it, apply what you accept, say what you
reject and why, then update the JSON, re-render and republish **the same file
path**, so the page they are looking at becomes the answer. Nothing parses
these blocks and nothing stores them — chat is the channel, and a comment left
unanswered in the turn it arrives is one the human has to make twice.

Then write the document:

```markdown
# <Name> epic — tickets

Source: <where this came from, with date; point at context/ if there is material>

Outcome: <the problem and who has it, the observable change, the evidence
that would show it worked, and what would make us reverse it. Falsifiable,
or it is decoration — "improve UX" can never fail; "support requests about
X stop arriving" can be checked at the retro. Name the observer for each
piece of evidence and check it can distinguish success from failure — and
name what will **produce** it, because a clause nothing collects is as empty
as one that cannot fail: a check wired into two of nine page types, or an
event two controls both fire, reads as falsifiable and never is.>

Requirements: <OPTIONAL — the WHAT, apart from the HOW: a numbered list
(R1, R2, …) of user-visible behaviours, each *when <condition> the system
shall <observable result>*, written BEFORE any ticket is sliced and never
bent to fit the slicing — that is what lets the plan reviewer walk
requirement to criteria and ticket to requirement. Part of the preamble, so
`brief` hands it to every worker. Omit it when the Outcome line already
carries the whole WHAT.>

Areas in scope: <the services, packages or directories this touches, and
the instruction file that binds each — e.g. `api-gateway` (api-gateway/CLAUDE.md)>

Delivery: release | incremental
<one line, one decision. **release** — the default for a multi-ticket epic:
after sign-off, `/flow:run` implements, reviews and merges each ticket into
`epic/<name>` unattended, no per-ticket pull request; the human decides
twice, here and at the release pull request. Bound it: roughly 3–6 tickets,
days not weeks, a release diff a human can review — beyond that, split it
or go incremental. **incremental** — one human-gated pull request per
ticket against the default branch, merged before the next starts; for
per-ticket production feedback, a fast-moving main, or a staged migration.

Declaring `release` obligates the plan to probe branch protection and the
permission surface NOW (the run skill's step 3 has the commands) and record
the result as prose here or under the ground rules — never as its own
mode-shaped line. Missing or unavailable protection (a free-plan 403) is
the human's call at sign-off: fix it, or **waive it, written here as a
decision, never a bare finding** — "waived <date>: <who> chose to run
without the hard floor" — because the run proceeds only on recorded human
acceptance.>

Worker model: opus

<Every other configuration line is optional and lives here — label at line
start, value the first word after the colon, prose after it welcome;
`/flow:doctor` flags near-misses.

`Worker model:` and `Reviewer model:` — chosen **together as a pairing**:
**capable-implementer** (`Worker model: opus`, no Reviewer line; the
consequence tiers price review) for gnarly code and thin specs;
**strong-judge** (`Worker model: sonnet`, `Reviewer model: opus`) for
well-specified tickets out of a plan-reviewed epic — worker spend is the
largest line item, so this is the biggest cost knob. Decide from previous
run records (Important findings per ticket, observed spend); never cheapen
the plan side to match. Without a Worker line each worker inherits the
spawning session's model — a price nobody decided on.

`Planner model:` — pins this epic's plan reviewer (step 4); otherwise the
agent's pinned strongest model. Lower it only for genuinely low-stakes work.

`Worker runner: claude | codex` — who implements in an unattended run.
Absent or `claude`: a fresh Claude subagent. `codex`: OpenAI's Codex CLI
through the plugin's runner script, sandboxed with `.git` read-only and no
network — the runner branches, commits and pushes, so one commit per
ticket — with `Worker model:` then naming a Codex model. Every
gate downstream reads git, so the reviewer, the CHECK re-run and the SHA
merge are unchanged; declaring it obligates the plan to run `/flow:doctor`,
which probes that `codex` is installed and signed in, and to record the
result here like the protection probe.

`Shadow reviewer: codex` — a **trial**, optional: in an unattended run,
every consequence-tier ticket also gets one Codex review of the same packet
beside the Claude reviewer, read-only, blind both ways, recorded in
`epics/<name>/shadow-reviews.md` and compared by hand at the retro. It gates
nothing — a shadow failure is never a stop condition, and a missing or
signed-out `codex` just records one per ticket.

`Consequence paths: <glob>[, <glob>]` — e.g. `src/auth/**, migrations/**`:
paths the unattended driver always prices at the consequence review tier, a
code floor under the worker's self-reported tier. Globs only on this line;
`**` crosses directories, `*` stays within one.

`Fix bounds exclude: <glob>[, <glob>]` — e.g. `src/messages/*.json`: files
the unattended driver's fix-bounds gate leaves out of the review-fix diff,
the way it already leaves out `epics/`. For files a fix fans out into
mechanically — translation catalogs are the canonical case: one new key
touches every locale file, and the line count measures the catalog's width,
not the fix's blast radius, so without the line a clean fan-out buys a
re-review or a halt. Same glob syntax as `Consequence paths:` — globs only on
this line, `**` crossing directories and `*` staying within one — and
declared here rather than built into the driver because per-project path
policy belongs in the document a human signs off. An unusable glob refuses
the run: a line that cannot be applied is fixed here, never silently
approximated. Both glob lines split on commas, so a comma inside trailing
prose makes that prose an entry and the run refuses to start — keep prose on
these two lines comma-free, or leave it off.

`Design sources: <path>[, <path>]` — e.g. `designs/City Desktop.html,
designs/map.html`: the files that hold **what the design draws** — an
artboard exported to HTML, a rendered spec page, anything a browser can
render and `getComputedStyle` can read. Repository-relative, and they need
not live in this epic's `context/`: a design usually belongs to the project,
not to one epic, and copying it in would freeze a moving thing. This line is
what hands the design to everything downstream — the brief a worker reads,
the ticket reviewer's packet and the plan reviewer's — so an epic that has a
design and does not declare it is an epic whose reviewers are given
everything except the thing the page is judged against. Unlike every other
line here, **it carries no prose**: the whole text between commas is the
path, because designers name files with spaces in them (`City Desktop.html`)
and nothing could tell a trailing sentence from a filename. `/flow:doctor`
warns about a declared path that does not exist, by its full name.

`Parallel: <n>` — `2` or `3`: the most tickets an unattended run may have
in flight at once. Absent, or `1`, is the serial run. It is an opt-in because
it changes what the absence of a `**Blocked by:**` line means: in a parallel
epic a ticket without one is **declared independent** of every other
unstarted ticket — so before writing this line, check each pair that could
share a wave for files both would edit, and give the later one a
`**Blocked by:**`. The ceiling is 3 because the constraint is review
bandwidth, not machines. **Before writing it, look for `epics/worktree.json`
and write it if the project has none**: each ticket of a wave works in a
fresh git worktree with no installed dependencies and no local `.env`, and
that file — `{"copy": ["<git-ignored local files every worktree needs>"],
"setup": ["<the install command>", "…"]}`, project-level, shared by every
epic — is what the run applies to each one, inside an eight-minute budget
per worktree (the step is one shell call with a ten-minute ceiling), so
prefer the install that uses a warm cache. Without it every worker guesses
the install for itself. Commit it with the epic's documents so it is on
`epic/<name>` at sign-off; the run reads it from there. Parsed by the board today; the run driver applies
it, and refuses it together with `Ticket budget:` (a per-ticket ceiling
cannot be metered while tickets share the clock).

`Ticket budget: <n>` — e.g. `250k` or `1m`: a per-ticket output-token
ceiling for unattended runs; the driver halts after any ticket that exceeds
it (the ticket stays merged), so a runaway ticket is a signal, not a bill.
Unlike every other line here, this one is re-read during a run: each ticket's
resolve step fetches the epic branch and reads the signed-off document from
it before the merge, so a raise you commit and push to the epic branch
governs the ticket that is running.
It is read from that ref and never from the ticket's own branch, so a branch
cannot raise the ceiling that judges it. Removing the line mid-run does not
lift the ceiling: the run keeps the last value and logs that it did.>

Status log: `epics/<name>/status.md`. Run a ticket with `/flow:ticket <ID>`.

## Walkthrough

<the plan page's scenes, the same ones in the same words — the page is
thrown away and this is the copy that survives, so `brief` hands it to
every worker and the retro can ask "did scene 3 happen?". Three to seven,
in the order a person meets them. No ticket IDs and no file names in the
prose: the reader is the person who asked for the feature.>

1. **<who>** <does what>.
   **Sees:** <what they see once this ships>
   **Today:** <what happens instead>
   **Tickets:** <ID>[, <ID>]

<the **Tickets:** line is the one line here a script reads, and it is strict
the way `**Blocked by:**` is: the bold label, then bare ticket IDs of this
epic and commas, and nothing else on the line — no "and", no aside. Indented
under its scene is fine. `/flow:doctor` names a line it cannot read and an ID
this epic does not have, because a scene whose tickets are decoration is a
promise nothing is checked against.>

<and, when some ticket is in no scene, one line saying which and why —
infrastructure a user never meets, named here rather than left unexplained>

## Ground rules for every ticket in this epic

- <the invariants an agent with no context would otherwise violate — and
  where a rule needs someone to carry it out, name that actor and check the
  delivery mode above gives you one: an unattended release worker spawns no
  agents, holds no phone and drives no interactive tool, so a rule that
  needs any of them is a rule every ticket will record a deviation against>

## Order

<the intended order, and why the first one is first>
```

Then one section per ticket:

```markdown
## <ID> — <short name>

<OPTIONAL — delete the next line unless this ticket must not start before
another ticket of this epic is integrated; most tickets carry none>
**Blocked by:** <ID>[, <ID>]

**Scope.**
- <what to build, concretely — files, functions, behaviours>

**Not in scope.** <the tempting adjacent work, and which ticket owns it>

**Acceptance criteria.**
- <test command + expected result>
- <behaviour to demonstrate, and how>
- <a criterion a command can decide outright>
  CHECK: <command run from the repository root>
  EXPECT: <text its output must contain>
- <a criterion about what the design draws — name the landmarks it is about>
  COMPARE: <design source path, from the Design sources line> @ <width>[, <width>]
  LANDMARKS: <name>[, <name>]
```

Rules that matter:

- **Stable short IDs prefixed by epic** — `SEC-3`, `DATA-7`. They prefix
  every commit, name every branch, and are how shipped state is detected.
- **`**Blocked by:** <ID>[, <ID>]` is optional, and strict.** Write it only
  where a ticket must not start before another of **this epic's** tickets is
  integrated — it builds on that ticket's code, or the two edit the same
  files. The label opens the line, bold, at the margin; then bare ticket
  IDs, commas, and **nothing else on the line**: no "once its API settles",
  no "and". No bullet, no indent, no quote mark, and asterisks for the bold:
  `- **Blocked by:** DEP-1` changes nothing on the board, and `doctor` says
  the line is unread — which in a `Parallel:` epic means the ticket may be
  started beside the work it names. (`**Blocked by:** nothing` and the
  template's own unedited placeholder read as no line at all — neither
  states a dependency; an **empty** label is an interrupted edit, and
  waits.) (`Depends on:` is read by nothing — it
  is the removed graph's spelling, left inert so old documents read as they
  did; `doctor` mentions it only in an epic that declares `Parallel:`.) The strictness is the
  design — the dependency graph this plugin once had parsed tolerantly, and a
  dependency written as prose stalled its ticket with nothing saying why. A
  line that is about blocking and does not parse is a named problem: the
  ticket reads `waiting` on the board, `doctor` names the line, and `next`
  refuses rather than report the epic as built. Put the reason in the Scope
  bullets, where prose belongs. A blocked ticket reads `waiting` until every
  blocker is `integrated` or `shipped`, and `next` leaves it out — so no
  lane can overtake the plan. A wait on **another epic's** work is an Owed
  line's job, never this line's. Run `/flow:doctor` before sign-off: an
  unknown ID, a self-reference, a cycle and a blocker placed later in the
  document are all flagged there.
- **Document order is the intended order.** The board proposes the first
  unstarted ticket by position, so put the de-risking probe or the live
  regression first; if the plan rests on an unproven assumption, ticket one
  proves or kills it, and the doc says what happens on failure.
- **Sized for one session and a reviewable pull request** — a few hundred
  changed lines; defect discovery collapses past roughly 400. If the
  criteria will not fit a handful of bullets, split it. **Size it when you
  plan it, and never write the figure into the ticket as a condition the
  worker must stop on** ("two lines", "split past ~450"): an estimate is the
  planner's guess, a worker that misses it has departed from nothing that was
  designed, and both times one was written as binding it stopped a merge to
  ask a human a question the plan had invented. A size you expect belongs in
  the ticket as an expectation the reviewer weighs.
- **All three of Scope / Not in scope / Acceptance criteria.** "Not in
  scope" is what stops a fresh-context agent wandering.
- **Acceptance criteria must be checkable.** Prefer *when <condition> then
  the system shall <observable result>*. For behaviour no test command
  reaches (rendered UI, an interactive flow, a CLI's output) write a
  **runtime demonstration** — *demonstrate: <action> → <observable result>*
  — and the doer records what was observed, never "looks fine". Where a
  command can decide it outright, use the **machine-runnable form**: an
  indented `CHECK: <command>` with an optional `EXPECT: <text the output
  must contain>` (exit 0 alone decides when EXPECT is absent).
  `tickets.mjs check <ID>` runs them, and the unattended driver re-runs them
  from the signed-off document as a merge gate — a CHECK criterion is one no
  worker can satisfy by narration; keep the commands idempotent. **Write the
  EXPECT so a skip cannot satisfy it**: a suite that skips itself (no
  `DATABASE_URL`, no Docker) exits 0 and a verbose reporter still prints the
  test titles, so an EXPECT naming a title matches the line that says it
  skipped. Name a line that proves the run — a pass count (`Tests 12
  passed`), a computed value — because **a skipped check is not a passed
  one**. The ledger marks such a criterion `↓ skipped` and it does not green
  the gate, so an EXPECT a skip can match costs the run a halt. If
  verification needs something a session may not have (Docker, credentials,
  a browser), give the fallback: *"or flag it as owed to ticket X"*.
- **A criterion about the design carries `COMPARE`, and names its
  landmarks.** `COMPARE: <design source path> @ <width>[, <width>]`, indented
  under its criterion bullet like `CHECK:`, with an optional
  `LANDMARKS: <name>[, <name>]` line beneath it — absent means every landmark
  in the map, which is the whole page. The path is one the preamble's
  `Design sources:` line lists, and the widths are the ones the design draws
  at. "Renders as the design draws it" is **not** a criterion: it is prose a
  worker satisfies with the properties it already believes are right, which is
  how nine tickets passed six gates and shipped a page missing three drawn
  elements. Name the landmarks the ticket is about, and let the differ decide
  the properties.

  The landmarks themselves live in `epics/<name>/design-map.json` — a
  planning document like `tickets.md`, written here and signed off with the
  plan:

  ```json
  { "landmarks": [ { "name": "hero",
                     "design": "<selector in the design source>",
                     "page":   "<selector in the built page>",
                     "source": "<OPTIONAL: the Design sources path that draws it, or a list of them>",
                     "widths": ["<OPTIONAL: the widths it is drawn at, as numbers — [393]>"] } ],
    "removed":   [ { "name": "promo", "by": "<the deciding rule>",
                     "date": "YYYY-MM-DD" } ] }
  ```

  **`source` and `widths` say where the design draws a landmark, and they are
  what lets a missing one fail.** A landmark that matches on neither side is
  only a note when the map is silent — with several design sources, or an
  element drawn at one width alone, silence is sometimes correct and the
  differ cannot tell. Scoped, it is a failing row wherever the map says the
  landmark is drawn, and explained silence everywhere else. `widths` is
  optional (absent means every width); `source` is the `COMPARE` line's path,
  character for character, or a list of them for a landmark several sources
  draw (a shared header is one landmark, not one per page). **Scope one
  landmark by `source` and scope every design source's landmarks** — the
  differ refuses a `--source` the map names nowhere, because a misspelt one
  would read every landmark as drawn elsewhere, and a worker refused that way
  cannot repair a signed-off map: the comparison goes owed. Like `removed`,
  scope is read only from the signed-off ref: deleting a `source` line on a
  ticket branch changes nothing, and a scoped landmark renamed or dropped
  from the branch's map is refused rather than never looked for.

  A worker edits the `page` selectors — they are written before the page
  exists — so **the `removed` list is planning's and nobody else's**: it is
  read only from the signed-off ref, never from the copy riding the ticket
  branch, because a worker who could not build an element could otherwise
  declare it removed, get a clean diff and halt nothing. That is the founding
  failure routed through the new machinery.

  `tickets.mjs check` **never runs a COMPARE** — it has no browser. It lists
  comparisons apart from the checks, marked manual, in neither `total` nor
  `passed`; what runs the differ is the ticket's own verify step, and what the
  reviewer reads is the `**Compared:**` table in the status entry. So a
  COMPARE is not proven red the way a CHECK is (there is nothing to run); what
  sign-off checks is that its path is declared, its widths are the design's,
  and its landmarks are in the map. **Where the design cannot be rendered** —
  an image, a PDF — `COMPARE` degrades to a table written by hand and labelled
  as hand-written, and the ticket says so: a criterion the lane cannot perform
  is recorded as owed, never implied.
- **Every CHECK you write must fail on the tree before the ticket exists,
  and you prove it before sign-off.** Run each one now, on the tree as it is,
  with `node "${CLAUDE_PLUGIN_ROOT}/scripts/tickets.mjs" check <ID>`, and
  read the ledger. A CHECK that is already green proves nothing the ticket
  will do and merges green whatever the worker builds — FND-2's
  `MobileSidebar` CHECK passed vacuously and shipped that way. The same rule
  retires the decorative shape: a whole-suite run with `EXPECT: Tests:`
  passes on the pre-ticket tree too (six of one live epic's eight CHECKs
  were this), so it is **not a criterion** — the suite stays a standing
  check the doer reports under **Verified**, and a CHECK names the one test,
  assertion or fact this ticket turns green. **Naming one test has its own
  vacuous spelling**: `node --test --test-name-pattern '<p>' <file>` prints
  `# pass 1` when the pattern matches **nothing** — the file itself counts as
  a passing test — so `EXPECT: # pass 1` is green before the test exists and
  green whatever the worker names it. Expect two or more matching tests
  (`# pass 2`), or grep the TAP line of the test's own title; `doctor` and
  `check` flag the `# pass 1` shape as they flag a malformed CHECK. Other
  runners have their own version of this — which is what proving each CHECK
  red is for, and why the ledger is read rather than assumed. Record the ledger in the draft:
  which CHECKs were proven failing, and which could not run here and why (an
  interactive runner, a minutes-long suite). The plan reviewer re-runs the
  runnable ones, and step 5 shows the ledger at the gate.
- **An epic that declares `Design sources:` ends with one whole-page fidelity ticket**
  — a `COMPARE` with **no** `LANDMARKS:` line for each design source,
  at every width the design draws. Per-section comparisons distributed across
  tickets do not sum to a page that matches: what lies between two sections
  belongs to neither section's ticket, and in the epic this rule comes from,
  three drawn elements shipped missing with every ticket's own criteria green.
  It goes last among the tickets that build, because it can only compare a
  page every other ticket has finished building — only the human
  render-and-read ticket below follows it. Check its actor like any other rule here: where the
  declared delivery gives it a lane with no browser, it is a **human-owned
  ticket ordered before the release**, never a line owed to the release pull
  request — a criterion deferred to that pull request merges unperformed.
- **A page epic schedules a human render-and-read ticket.** The whole-page
  comparison is necessary and not sufficient: the differ decides computed
  style, and what it cannot decide is **composition and behaviour** — which
  items earn the six slots, whether a chip belongs where the design draws a
  button, whether a table survives its longest row, what the page does when
  it is used. In the epic this rule comes from, every difference a gate
  caught was a computed-style value and every difference a human caught was
  one of these — five of them, found by accident after the last ticket, in
  ten commits no document records. So an epic that declares `Design sources:`
  carries one **human-owned** ticket, after the whole-page fidelity ticket
  and before the release: its criteria are the questions to answer with the
  built page open beside the design (real data, every width, the
  interactions), its status entry records what was seen, and what it finds
  becomes tickets, not commits on the epic branch. It is human-owned in every
  delivery mode — an unattended worker holds no browser and no judgement
  about what a reader wants — so it is never a line owed to the release pull
  request, where it would merge unperformed. Budget it; do not discover it.
- **A plan that narrows what the design draws declares the removal.** When a
  ground rule or a scope line says an element the design draws will not be
  built, add it to `epics/<name>/design-map.json`'s `removed` list — the
  element's landmark name, the deciding rule, the date — in this same
  document's commit, so sign-off approves the list. Then a comparison prints
  "removed by <rule>, <date>" instead of nothing; one file holds everything
  the build deliberately does not draw; and the decision belongs to the plan,
  where it was made, rather than to the ticket under review, which is the one
  party that must not be able to declare its own missing element removed.
- **No status column.** State is derived by `tickets.mjs`; a hand-maintained
  table drifts within days.

## 4. Plan review — fresh eyes before the gate

The session that wrote the decomposition cannot review it, and a wrong
decomposition caught after sign-off costs every ticket built on it.

Spawn `flow:plan-reviewer` with the **Agent** tool — `model`: the draft's
own `Planner model:` line when it declares one, otherwise omit the parameter
so the agent definition's pinned model applies; `effort: high`. Give it
**the plugin's root path** (`${CLAUDE_PLUGIN_ROOT}`, resolved — the reviewer
runs `tickets.mjs check` and `doctor` and the script is on no PATH), the
draft `epics/<name>/tickets.md`, the `context/` directory, the root
instruction file and each in-scope area's, and one line on what was
requested. **When the draft declares `Design sources:`, give it those paths
and `epics/<name>/design-map.json` as well** — the design is an input like
the code, and a plan review that never sees the drawing cannot tell you that
the map misses something it draws, or that a ground rule quietly narrows it.
**The reviewer reads the document, never the plan page** — so the walkthrough
it checks is the `## Walkthrough` section of `tickets.md`, and scenes left in
the plan JSON alone are scenes nobody reviews.
It reports; it does not rewrite.

Then, before showing the user: **fix what is right** (re-split, reorder —
edit `tickets.md` now, while it is cheap); **keep what you reject, with a
reason** for the user; **carry its "Questions for sign-off" forward
unchanged** — they are the human's to answer.

## 5. Get sign-off — hard gate

Show the user: **the walkthrough first** — what they will be able to do,
scene by scene, which is the only part of this gate written in their terms —
then the ticket list with one line each, the order, what ticket
one proves, the delivery choice and why, anything grounding found that
changes the shape — plus **one alternative decomposition you considered and
rejected, with the reason**, so sign-off is a choice between shapes rather
than a ratification of the only one shown — and the plan review's outcome:
what it flagged, what you changed, what you rejected and why, its open
questions.

**Show the CHECK ledger here**: which CHECKs were proven red on the current
tree, and which could not run in this session and why. A criterion whose
CHECK nobody has seen fail is a criterion nobody has tested; the human
signing off is the last reader before a worker builds against it.

**If the epic declares a design, show what it will not build**: the design
map's `removed` list, entry by entry, each with the rule that decided it —
this is the one moment a human can say "no, that element stays" before a
comparison starts printing it as a decision already taken. Name any
UI-building ticket carrying no `COMPARE` criterion as **not ready**, say
which one closes the whole page, and **name the human render-and-read
ticket** — who owns it, and that the release waits on it.

**Name what the lane cannot do, and what nobody will collect**: which ground
rules and criteria need an actor the declared delivery mode does not provide
and which human-owned ticket now carries each ahead of the release, and which
Outcome evidence clause nothing will produce. A criterion parked as owed to
the release pull request merges unperformed, and an observer with nothing to
read reports nothing — the human is signing off on the lane as much as on the
decomposition.

**Bring the plan page to this gate too**: update step 3's JSON — `stage:
"sign-off"`, the `walkthrough` as the re-planning left it, the `alternative`
with its rejection reason, the `planReview`
outcome, any `openQuestions` — re-render, and republish the **same file
path**. Say again, in one sentence, that they can **select any text on the
page and paste the copied block back into this chat**, and answer what comes
back the way step 3 says: this is the last gate at which a sentence costs a
sentence.

**If the epic declares `Delivery: release`, say so in plain terms**: "after
your approval, tickets will implement, review and merge into `epic/<name>`
unattended; your next decision point is the release pull request."
Approval of a release epic is approval of that.

**Ask explicitly, and wait.** Do not write the status doc, do not touch the
root instruction file, do not start ticket one.

## 6. After sign-off

Create `epics/<name>/status.md`:

```markdown
# <Name> epic — status log

Append-only record of finished tickets. Tickets: `epics/<name>/tickets.md`.

**Rules.** Append only. Corrections are new dated addenda beneath the entry they
correct, never edits. Report counts, not adjectives. The **Owed** line is
required even when empty.

## Baseline — <YYYY-MM-DD>

<what exists today, what is verified and how, known risks, what this epic starts
from>
```

The preamble (heading through the **Rules** block; Baseline is planning's
own) is also carried by the ticket skill's step 6 and the quick skill's step
5 — one rule, three documents: a change to any copy moves the others in the
same commit.

**The status log is a diary, not a dashboard.** It never answers "which
tickets are done" — `/flow:tickets` derives that. No summary table.

If the root instruction file carries a short "current work" section, add one
line for this epic there.

## 7. Commit and push — no pull request

```bash
REPO=$(git rev-parse --show-toplevel)
git fetch origin --prune
git checkout -b epic/<name> origin/<default-branch>
git add "$REPO/epics/<name>"
git commit
git push -u origin epic/<name>
```

**Cut the epic branch from `origin/<default-branch>`, never from whatever is
checked out** — planning often runs from a stale branch, whose commits would
ride into every ticket. Anchor paths to `$REPO`; `git add epics/…` is
relative to the shell's cwd. **Push now**: in a release epic every ticket
merges into `epic/<name>`, and its presence on the remote is how
`/flow:run` verifies sign-off happened.

**No pull request for the plan.** Incremental: ticket one branches from here
and the docs land in its pull request. Release: they land with the release
pull request. **The epic's documents are never deleted to make a diff
smaller** — if a pull request is too large to review, the epic was too
large; split the work, not the record.

Commit on `epic/<name>`, not on the default branch.

## 8. Hand over

Release epic: say that `/flow:run <name>` starts the unattended run — that
is what the sign-off approved. Incremental: say which ticket is first and
that `/flow:ticket <first-ID>` runs next, from this working copy.

If the project uses one checkout per epic and you were **not** run from this
epic's own checkout, say so — a fresh checkout will not contain these
documents until ticket one's pull request merges.

Then stop.
