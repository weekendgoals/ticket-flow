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
- The actual code and data the epic concerns. A decomposition written from
  the description alone invents tickets for problems that do not exist and
  misses the ones that do.
- `node "${CLAUDE_PLUGIN_ROOT}/scripts/tickets.mjs" list` — what other epics
  are open, and where they overlap this one.

## 3. Clarify, agree the shape, then write `epics/<name>/tickets.md`

**First, hunt what you would otherwise guess.** Sweep the brief and the
grounding for underspecified points — scope boundaries, data and its
lifecycle, error and edge behaviour, integration contracts, non-functional
expectations, any sentence two readers could read two ways. **Ask the user
the ones whose answer changes the shape of the work — batched, concrete,
each with the readings you are choosing between**; a handful of sharp
questions is the budget. Record every answer in the ticket document. The
rest ride to sign-off as open questions.

**Then show the user the shape and let them bend it** — a finished
decomposition anchors, and a re-split costs a sentence now and a rewrite
later. Present, compactly: the draft **Outcome** line (and the numbered
**Requirements** when the epic carries them); the **areas in scope** and
anything grounding turned up; the **delivery choice** and its why, in one
line; the **ticket list as one line each** — `ID — name — what it proves or
builds` — in order, with a word on why the first is first.

**Render the shape as a page.** Write it as JSON into your session's
**scratchpad** (never the repository — `tickets.md` is the record); the
schema is at the top of `scripts/plan-page.mjs` (`stage: "shape"`, outcome,
requirements, areas, delivery with its why, the ticket lines, `firstWhy`).
Then:

```bash
node "${CLAUDE_PLUGIN_ROOT}/scripts/plan-page.mjs" <scratchpad>/plan-<name>.json --out <scratchpad>/plan-<name>.html
```

Publish it as an artifact and print the URL (no artifact surface: send the
file). Keep the ticket lines in chat too — the page is the reading view, the
chat lines are what the reply quotes. **Wait for the user to say the shape is
right** before writing the full sections; this is a steering stop, not the
sign-off gate. On a redirect, update the JSON, re-render, and **republish
the same file path** so the URL evolves with the plan.

Then write the document:

```markdown
# <Name> epic — tickets

Source: <where this came from, with date; point at context/ if there is material>

Outcome: <the problem and who has it, the observable change, the evidence
that would show it worked, and what would make us reverse it. Falsifiable,
or it is decoration — "improve UX" can never fail; "support requests about
X stop arriving" can be checked at the retro. Name the observer for each
piece of evidence and check it can distinguish success from failure.>

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
through the plugin's runner script, sandboxed with no network — the runner
fetches and pushes — with `Worker model:` then naming a Codex model. Every
gate downstream reads git, so the reviewer, the CHECK re-run and the SHA
merge are unchanged; declaring it obligates the plan to confirm `codex` is
installed and signed in (the run skill's step 3).

`Consequence paths: <glob>[, <glob>]` — e.g. `src/auth/**, migrations/**`:
paths the unattended driver always prices at the consequence review tier, a
code floor under the worker's self-reported tier. Globs only on this line;
`**` crosses directories, `*` stays within one.

`Ticket budget: <n>` — e.g. `250k` or `1m`: a per-ticket output-token
ceiling for unattended runs; the driver halts after any ticket that exceeds
it (the ticket stays merged), so a runaway ticket is a signal, not a bill.>

Status log: `epics/<name>/status.md`. Run a ticket with `/flow:ticket <ID>`.

## Ground rules for every ticket in this epic

- <the invariants an agent with no context would otherwise violate>

## Order

<the intended order, and why the first one is first>
```

Then one section per ticket:

```markdown
## <ID> — <short name>

**Scope.**
- <what to build, concretely — files, functions, behaviours>

**Not in scope.** <the tempting adjacent work, and which ticket owns it>

**Acceptance criteria.**
- <test command + expected result>
- <behaviour to demonstrate, and how>
- <a criterion a command can decide outright>
  CHECK: <command run from the repository root>
  EXPECT: <text its output must contain>
```

Rules that matter:

- **Stable short IDs prefixed by epic** — `SEC-3`, `DATA-7`. They prefix
  every commit, name every branch, and are how shipped state is detected.
- **Document order is the intended order.** The board proposes the first
  unstarted ticket by position, so put the de-risking probe or the live
  regression first; if the plan rests on an unproven assumption, ticket one
  proves or kills it, and the doc says what happens on failure.
- **Sized for one session and a reviewable pull request** — a few hundred
  changed lines; defect discovery collapses past roughly 400. If the
  criteria will not fit a handful of bullets, split it.
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
  worker can satisfy by narration; keep the commands idempotent. If
  verification needs something a session may not have (Docker, credentials,
  a browser), give the fallback: *"or flag it as owed to ticket X"*.
- **No status column.** State is derived by `tickets.mjs`; a hand-maintained
  table drifts within days.

## 4. Plan review — fresh eyes before the gate

The session that wrote the decomposition cannot review it, and a wrong
decomposition caught after sign-off costs every ticket built on it.

Spawn `flow:plan-reviewer` with the **Agent** tool — `model`: the draft's
own `Planner model:` line when it declares one, otherwise omit the parameter
so the agent definition's pinned model applies; `effort: high`. Give it the
draft `epics/<name>/tickets.md`, the `context/` directory, the root
instruction file and each in-scope area's, and one line on what was
requested. It reports; it does not rewrite.

Then, before showing the user: **fix what is right** (re-split, reorder —
edit `tickets.md` now, while it is cheap); **keep what you reject, with a
reason** for the user; **carry its "Questions for sign-off" forward
unchanged** — they are the human's to answer.

## 5. Get sign-off — hard gate

Show the user: the ticket list with one line each, the order, what ticket
one proves, the delivery choice and why, anything grounding found that
changes the shape — plus **one alternative decomposition you considered and
rejected, with the reason**, so sign-off is a choice between shapes rather
than a ratification of the only one shown — and the plan review's outcome:
what it flagged, what you changed, what you rejected and why, its open
questions.

**Bring the plan page to this gate too**: update step 3's JSON — `stage:
"sign-off"`, the `alternative` with its rejection reason, the `planReview`
outcome, any `openQuestions` — re-render, and republish the **same file
path**.

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
