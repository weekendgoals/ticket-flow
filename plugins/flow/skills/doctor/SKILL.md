---
name: doctor
description: Check whether a project is ready to run the flow — remote, gh, merge settings, instruction files, and headings that would silently misparse — and report what to fix. Use when the user runs /flow:doctor, before the first epic in a project, or when the board looks wrong.
---

# Doctor

Two halves. The deterministic preconditions are checked by the script — do not
re-derive them. Whether the instruction files are actually *usable* is a
judgment call — that half is yours.

## 1. Run the deterministic checks

```bash
node "${CLAUDE_PLUGIN_ROOT}/scripts/tickets.mjs" doctor
```

Print the output as-is. It checks: the `origin` remote, `origin/HEAD`, a
fetchable default branch, `gh`, repository merge settings, the existence of
root agent instructions, epic status logs, the worker runner's environment
when an epic declares `Worker runner: codex` (the `codex` binary runs and is
signed in — a run that discovers otherwise halts at ticket one with nobody
there) — and, most importantly, **headings that almost parse**: a status heading missing its date, an unknown outcome
word, a lowercase ticket ID. Those never error; they silently read as "not
done" or "not a ticket", which is the one way the derived board lies.

A `✗` is a blocker for the flow; a `!` degrades it. Explain each one the
script found in one line of consequence, not by restating it.

## 2. Judge the instruction files

The script can only check that `CLAUDE.md` / `AGENTS.md` exist. Read them —
the root one, and one per service or workspace if the project has areas — and
check they carry what the skills will actually ask of them:

- **The run and test commands, exactly.** `/flow:ticket` step 5 refuses to
  invent a test command; if the file does not name one, verification has
  nothing to execute. This is the single most important line in the file.
- **How to tell it worked** — what a passing run looks like, counts included.
- **The invariants a fresh session would otherwise violate** — the things the
  reviewer is told to judge against "the project's own standards". If there are
  no standards written down, that clause is empty.
- **Staleness.** Commands that no longer exist, services that were renamed,
  sections describing code that is gone. A stale instruction file is worse
  than a missing one — it is trusted.

Do not pad this into a full audit of the file's prose. Five focused findings
beat twenty observations.

## 3. Report

One short list: blockers first, then degradations, then instruction-file gaps —
each with the fix in the same line ("no test command in `api/CLAUDE.md` — add
the exact command and expected output"). If everything holds, say the project
is ready in one line and stop.

**Fix nothing.** Instruction files change through a reviewed pull request like
everything else — `/flow:quick` is the path if the user wants the gaps closed
now.
