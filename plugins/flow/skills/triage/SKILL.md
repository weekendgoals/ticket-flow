---
name: triage
description: Turn approved Flow findings (issues labelled flow:found and flow:approved — bugs and ideas filed with evidence but no acceptance criteria) into tickets, after the user agrees one table in chat. Each becomes a ticket with criteria, a "not a ticket" with one sentence, or "too big: needs an epic". Use only when the user runs /flow:triage [<epic>] or asks to triage Flow findings.
---

# Triage findings: $ARGUMENTS

A finding is a bug or an idea someone filed with evidence (what happened,
where, screenshots) and no acceptance criteria. A person approved it by
adding `flow:approved`; nothing can start from it until it is a ticket. This
session reads each approved finding, decides what it is, shows the user one
table, and only then turns the agreed ones into tickets. It stops once, for
that table.

`FLOW` below means `node "${CLAUDE_PLUGIN_ROOT}/scripts/flow.mjs"`, run from
the repository root. Run `FLOW doctor` first and stop if `gh` is missing or
signed out, because nothing here works without it. `$ARGUMENTS` may name an
epic (`#12` or `12`); then only that epic's findings are triaged.

**Write for a person, not for Flow**: the table, every comment and every
ticket body in plain language. The reporter is often not a developer.

## 1. Collect the approved findings

```bash
FLOW found [<epic>] --json
```

Keep the entries whose `status` is `approved`. Waiting ones are not yours to
judge: a person has not said yes to them yet. If none is approved, say how
many are waiting (a person approves one by adding `flow:approved`, or rejects
it by closing it) and stop.

Each entry carries its `epic` (or `null`), its `body` and its `images`. The
epic a ticket goes to is, in order: the epic named in `$ARGUMENTS`; the
finding's own epic; the open epic titled `Bugs` when exactly one exists
(`FLOW board --json`); otherwise ask in the table, because a guessed epic
puts the work under a plan nobody agreed for it.

## 2. Read each finding and its evidence

- **The words**: the `body`, in full. It is a person's description, not a
  specification; read it for what they saw, where, and what they expected.
  A fix the reporter suggests is a claim about the cause, not the scope:
  they did not read the code, so the scope comes from what you find there.
- **Every screenshot.** For an image with a `ref` and `path` in this
  repository, fetch and save it, then open it with the Read tool:

  ```bash
  git fetch --quiet origin <ref>
  git show FETCH_HEAD:<path> > <scratch-dir>/<n>-<k>.<extension>
  ```

  `<ref>` is a commit or a branch (`flow-findings`, or the reporter
  extension's `tickets`); either way it is fetched without touching your
  checkout. An image uploaded to GitHub directly (`repository` is `null`)
  downloads with `curl -sL <url> -o <scratch-dir>/<n>-<k>`. Use your
  scratchpad directory if the session has one, otherwise `mktemp -d`, never
  the repository. If an image cannot be fetched, say so in the table instead
  of guessing what it shows: the screenshot is often the whole report.
- **The project's instruction files** (`CLAUDE.md`, `AGENTS.md`) at the root
  and in the area the finding points at, and **the code it points at**.

No researcher and no plan reviewer: a finding is a bug or a small idea, and
a person already approved working on it. When it turns out to need either,
it is too big for triage (see below).

## 3. Decide what each one is

One verdict per finding:

- **A ticket.** Write its body to `<scratch-dir>/<n>.md`:

  ~~~markdown
  ## Scope

  - <what to change, concretely: files, functions, behaviour>

  ## Not in scope

  - <the tempting nearby work>

  ## Acceptance criteria

  ```criteria
  - <what will be true when it is fixed>
    CHECK: <command run from the repository root>
    EXPECT: <text its output must contain>
  ```

  ## Notes

  <what you found in the code; the finding's own words travel with the
  ticket under "## Report", so do not copy them>
  ~~~

  Do not write `Epic:`, `Blocked by:` or a `## Report` section:
  `FLOW promote` writes all three, the last from the finding word for word.

  At least one CHECK must fail on the code as it is now, proven:

  ```bash
  gh issue view <epic> --json body --jq .body > <scratch-dir>/epic.md
  FLOW check --file <scratch-dir>/<n>.md --epic-file <scratch-dir>/epic.md
  ```

  A CHECK that already passes proves nothing about the fix, and a CHECK that
  fails for the wrong reason (a typo, a missing tool, a skip) has not been
  proven either: read its evidence line. Write the EXPECT so a skipped test
  run cannot satisfy it (a pass count, not just "passed"), and never a
  whole-suite run: it is green before the fix exists. When the finding is
  visual and the epic has `Design sources:`, add a `COMPARE:` line too, since
  a picture of the bug is a claim about what the design draws.

  Tier: `easy` (built by the faster model) for a well-understood change in
  familiar code, `hard` for anything subtle, cross-cutting or thinly
  specified. When unsure, `hard`.

  It may wait for another ticket of the same epic (`Blocked by`); a wait on
  anything else cannot be tracked, so say it in the table instead.
- **Not a ticket**, with one sentence the reporter can read: it does not
  happen (say what you tried), it is already fixed (name the commit or
  ticket), it duplicates `#<m>`, or it is a question for the reporter.
- **Too big: needs an epic**, with one sentence: the fix spans several
  tickets, needs research, or changes how something works rather than
  repairing it.

## 4. One table — the stop

Show, in chat:

| Finding | Verdict | Tier | Epic | First CHECK |
|---|---|---|---|---|
| #<n> <title> | ticket / not a ticket: <sentence> / too big: <sentence> | easy or hard | #<e> | `<command>` |

Under it, any question (an epic you could not choose, a wait on outside
work, an image you could not open), each with your recommended answer, so
the user can reply in a word.

**Wait for the user to edit it or say go.** Nothing is promoted, commented
or closed before that: the person approved the finding, not your reading of
it.

## 5. Act on the agreed table

- **A ticket**:

  ```bash
  FLOW promote <n> --file <scratch-dir>/<n>.md --tier easy|hard --epic <e> [--blocked-by <m>,<m>]
  ```

  It refuses (exit 2, one sentence) a finding nobody approved, a body whose
  criteria cannot decide it, an epic that is not one, or a `Blocked by` it
  cannot read; fix the draft and run it again. Until it has changed the
  labels it is safe to repeat. If it exits 1 saying the issue **is a ticket
  now** but could not be listed under the epic, run the `FLOW link <e> <n>`
  it names, which is safe to repeat.
- **Not a ticket**: `FLOW reject <n> --text "<the sentence>"`. It posts the
  sentence and closes the finding as not planned.
- **Too big**: `FLOW post <n> --text "<the sentence> The next step is a plan:
  /flow:epic, with this finding as its source."` Leave it open and approved,
  so it stays on the list until someone plans it.

## 6. Hand over

Say which tickets exist now, by number and epic, and that each starts when
the person runs `/flow:ticket #<n>`, `/flow:run #<epic>` for the whole epic,
or (with Flow's GitHub Action) adds `flow:start` to it; a ticket is ready as
soon as its epic is approved and its blockers are done, like any other. Name
what was rejected and what needs an epic. Then say in one line that this is a
good point to start a fresh session or to run `/compact`, because this one
is full of screenshots and code, and stop.
