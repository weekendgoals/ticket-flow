---
name: epic
description: Turn a feature request, investigation or conversation into an epic — a folder under epics/ with a ticket doc and its source context. Stops for sign-off before anything is built. Use when the user runs /flow:epic <name> or asks to plan new work.
---

# Plan epic $ARGUMENTS

You are producing **a folder and a decision**, not code. Nothing is implemented
in this session.

## 1. Read the arguments, then get the input

`$ARGUMENTS` is **the epic name, optionally followed by any number of sources**:

```
/flow:epic venue-identity
/flow:epic security ~/reports/audit-2026-07-30.md
/flow:epic leagues docs/census.md https://example.com/spec  epics/*/context/prior.csv
```

Parse it like this:

- The **first whitespace-delimited token is the epic name**, and it becomes the
  directory `epics/<name>/`. It must be kebab-case with no slashes or dots.
- **If that first token looks like a path or a URL** — it contains `/`, ends in a
  file extension, or starts with a scheme — then no name was given. Treat every
  token as a source, and propose a name once you have read them.
- **Everything after the name is a source**: a file path, a glob, or a URL.

Below, **`<name>`** means the epic name you parsed out — never the raw
`$ARGUMENTS` string, which now also holds the sources.

**The conversation is always input, and sources are added to it — never instead
of it.** If the user has been describing the problem for ten minutes and then
passes a file, both matter. If they passed sources and said nothing, the sources
are the whole brief. If they passed nothing, the conversation is.

Say in the sign-off which shaped what, so a disagreement lands in the right place.

### Handling sources

Read every source **in full** before proposing anything, and copy each into
`epics/<name>/context/`:

- A **file or glob** — copy it verbatim. Do not summarise it into the ticket doc
  and discard the original; the ticket doc is your reading of it, and a future
  session may need to disagree with your reading.
- A **URL** — fetch it and save what it said as a file, with the URL and today's
  date at the top. A link is not context. It rots, it moves, and it may need
  credentials a later session does not have.
- Anything **unreadable** — a path that does not exist, a URL that fails, a file
  you lack permission for — **stop and say so**. Do not proceed on a partial
  brief and do not guess at what it contained.

### If there is no source at all

The epic then rests on the conversation, an investigation you just ran, or the
user's description. That is legitimate — but **ask about anything you would
otherwise guess at**, and write what you learn into the ticket document, because
this conversation is the only place it currently exists and it is about to be
thrown away.

## 2. Ground yourself before decomposing

- The repository's root agent instructions (`CLAUDE.md`, or `AGENTS.md`), and the
  same file for every service, package or workspace in play. **If they are stale,
  fixing them is the first thing you do** — every ticket will be written and
  executed against them, so an inaccuracy here multiplies.
- The actual code and data the epic concerns. A decomposition written from the
  description alone invents tickets for problems that do not exist and misses
  the ones that do.
- `node "${CLAUDE_PLUGIN_ROOT}/scripts/tickets.mjs" list` — what other epics are
  open, and where they overlap this one.

## 3. Write `epics/<name>/tickets.md`

```markdown
# <Name> epic — tickets

Source: <where this came from, with date. Point at context/ if there is material>

Outcome: <the problem and who has it, the observable change that should result,
the evidence that would show it worked, and what would make us reverse or
remove it. Falsifiable, or it is decoration — "improve UX" can never fail;
"support requests about X stop arriving" can be checked at the retro.
Acceptance criteria prove the build behaves as intended; this line is what
proves it was worth building. Name the observer for each piece of evidence
and check it can distinguish success from failure: "the record shows zero X"
is evidence only if a record showing some X is possible — an epic once
promised a git record proving no human intervened, when every actor shared
the human's own identity.>

Areas in scope: <the services, packages or directories this epic touches, and
the instruction file that binds each — e.g. `api-gateway` (api-gateway/CLAUDE.md).
A ticket reads these before it starts; naming them here is what stops each
session rediscovering them.>

Release mode: serial | integration
<serial — each ticket opens a pull request against the default branch and is
merged before the next starts. This is the default; choose it unless a ticket
genuinely cannot ship alone.
integration — the epic's tickets are not independently deployable, so each
ticket's pull request targets `epic/<name>` and one release pull request goes to
the default branch. Say in one line WHY they cannot ship alone — and treat
"cannot ship alone" as a design choice to challenge first, not a fact:
expand/contract migrations and feature flags usually make a ticket shippable
on its own. An autonomous run mode is the other legitimate reason: it
requires integration topology, so unattended merges never target the default
branch.>

Run mode: autonomous
<OPTIONAL — omit the line entirely for attended epics, which is the default.
Only valid with integration topology; `tickets.mjs` refuses the combination
with serial. Declaring it means: after sign-off, each ticket implements,
reviews, fixes and merges its own pull request into `epic/<name>` unattended,
and the human's next decision point is the release pull request. Declaring it
also obligates the plan to probe the environment prerequisites NOW — branch
protection on the default branch (the run skill's step 3 has the probe
commands) and the pre-authorized permission surface (step 3 enumerates what
must be allowed; check that list against what the environment actually
pre-authorizes) — and record the result as prose on this Run mode line or
under the ground rules, never as its own mode-shaped preamble line, which
doctor's near-miss scan would flag. If the protection probe finds it missing
or unavailable (a free-plan 403 on both endpoints), the human decides at
sign-off: fix the environment, or **waive it — and the waiver is written
here too, as a decision, never a bare finding**: "waived <date>: <who> chose
to run without the hard floor", because the run skill's step 3 proceeds only
on recorded human acceptance and treats a probe result alone as no waiver.
A prerequisite first probed on run day is discovered at the worst moment:
the first live run hit an unprobed free-plan 403, and its waiver landed
seconds before run start.>

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
```

Rules that matter:

- **Stable short IDs prefixed by epic** — `SEC-3`, `DATA-7`. They prefix every
  commit, name every branch, and are how shipped state is detected.
- **Document order is the intended order.** `tickets.mjs` proposes the first
  unstarted ticket per epic by position, so put the de-risking probe or the live
  regression first. If the plan rests on an unproven assumption, ticket one
  proves or kills it, and the doc says what happens on failure.
- **Sized for one session, and for a reviewable pull request.** If you cannot
  state the acceptance criteria in a handful of bullets, split it. Aim for a few
  hundred changed lines; defect discovery collapses past roughly 400.
- **All three of Scope / Not in scope / Acceptance criteria.** "Not in scope" is
  what stops a fresh-context agent wandering.
- **Acceptance criteria must be checkable.** Name the command and what it must
  show. Prefer the form *when <condition> then the system shall <observable
  result>* — it forces a criterion something can actually test. If verification
  needs something a session may not have — Docker, cloud credentials, a browser —
  give the fallback: *"or flag it in the status doc as owed to ticket X"*.
- **No status column.** State is derived by `tickets.mjs`; a hand-maintained
  table drifts within days.

## 4. Plan review — fresh eyes before the gate

The session that wrote the decomposition cannot review it. It will agree with
itself — and a wrong decomposition caught after sign-off costs every ticket
built on it.

Spawn `flow:plan-reviewer` with the **Agent** tool — `model`: the strongest
available, `effort: high`. Give it: the draft `epics/<name>/tickets.md`, the
`context/` directory, the root instruction file and each in-scope area's, and
one line on what was requested. It reads the plan against the actual code and
reports; it does not rewrite anything.

Then, before showing the user:

- **Fix what is right.** This is the cheap moment to re-split a ticket or
  reorder — edit `tickets.md` now.
- **Keep what you reject, with a reason.** A finding you disagree with goes to
  the user, not into silence.
- **Carry its "Questions for sign-off" forward unchanged.** Those are the
  human's to answer, not yours.

## 5. Get sign-off — hard gate

Show the user: the ticket list with one line each, the order, what ticket one
proves, the release mode and why, anything you found while grounding that
changes the shape of the work — and the plan review's outcome: what it flagged,
what you changed, what you rejected and why, and its open questions.

**If the epic declares `Run mode: autonomous`, the sign-off must say so in
plain terms**: "after your approval, tickets will implement, review and merge
into `epic/<name>` unattended; your next decision point is the release pull
request." Approval of an autonomous epic is approval of that, and the user
must be able to see it.

**Ask explicitly, and wait.** Do not write the status doc, do not touch the root
instruction file, do not start ticket one. Re-planning is cheap now and expensive
after three tickets are built on a wrong decomposition.

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

This template's preamble — the heading through the **Rules** block; the
Baseline section is planning's own — is also carried by the ticket skill's
step 6, the door where a missing status log is created mid-ticket. One rule,
two documents: a change to either copy moves the other in the same commit.

**The status log is a diary, not a dashboard.** It records what happened, in
order, permanently. It never answers "which tickets are done" — `/flow:tickets`
derives that from git. Do not add a summary table to it.

If the repository's root instruction file carries a short "current work" section,
add one line for this epic there.

## 7. Commit and push — no pull request

```bash
REPO=$(git rev-parse --show-toplevel)
git fetch origin --prune
git checkout -b epic/<name> origin/<default-branch>
git add "$REPO/epics/<name>"
git commit
git push -u origin epic/<name>
```

**Cut the epic branch from `origin/<default-branch>`, never from whatever
happens to be checked out.** Planning often runs from a stale or unrelated
branch, and an epic branch cut from one silently carries that branch's commits
into every ticket.

Anchor the paths to `$REPO`. `git add epics/…` is interpreted relative to the
shell's cwd, which is not necessarily the repo root.

**Push the epic branch now**, not when someone first needs it: in integration
mode every ticket's pull request uses `epic/<name>` as its base, and a base
that exists only locally makes `gh pr create` fail — in an autonomous run,
with nobody there to answer. The push is also what lets `/flow:run` verify
sign-off happened before starting an unattended run.

**Do not open a pull request for the plan.** In serial mode the docs reach the
default branch for free: ticket one branches from here, so they land in that
ticket's pull request along with the code they describe. In integration mode
they land with the release pull request.

**The epic's documents are never deleted to make a diff smaller.** If a pull
request is too large to review, the epic was too large — split the work, not the
record.

Commit on `epic/<name>`, not on the default branch. Committing to a local
default branch leaves it diverged from the remote once ticket one merges.

## 8. Hand over

Say which ticket is first and that `/flow:ticket <first-ID>` runs next, from this
same working copy. If the epic declares `Run mode: autonomous`, say instead
that `/flow:run <name>` starts the unattended run — that is what the sign-off
approved.

If the project uses one checkout per epic and you were **not** run from this
epic's own checkout, say so — a fresh checkout resets to the remote default
branch, so it will not contain these documents until ticket one's pull request
merges. Planning inside the epic's own checkout avoids that entirely.

Then stop.
