---
name: review
description: Review committed changes (not the working diff) on the current branch and report what is wrong, without fixing it. Use after committing a ticket's work, in a fresh session or a fresh subagent. Accepts an optional commit range.
---

# Review committed changes

Reviews a **commit range**, not the working diff. The point is fresh eyes: the
session that wrote the code has spent hours justifying its own decisions and
will agree with itself.

`$ARGUMENTS` is an optional commit range (e.g. `e446800f..HEAD`, or a single
commit). If empty, default to everything on this branch:
`git merge-base origin/<base-branch>`..`HEAD`.

## 1. Establish the range and refuse the wrong ones

```bash
git log --oneline $(git merge-base origin/HEAD HEAD)..HEAD
git diff --stat $(git merge-base origin/HEAD HEAD)..HEAD
```

- **If the range is empty, stop.** Say so; do not fall back to reviewing the
  working diff.
- **Uncommitted changes are out of scope, always.** A repository may carry
  long-lived unrelated edits. Do not review them, do not commit them, do not
  mention them as findings.
- If the range mixes a substantive change with docs-only commits, review all of
  it but weight your effort toward the code.

## 2. Read the diff, then read the files

A diff shows what changed, not what is now true. For every changed file, read
enough of the surrounding code to know whether the change is correct **in
context** — the callers, the tests, the type it returns. Findings derived from
the diff alone are where false positives come from.

## 3. Review against the project's own standards

- The invariants in the root agent instructions and in each touched area's.
- The epic's ground rules, if this is ticket work.
- The ticket's own **Acceptance criteria** and **Not in scope** lines. Work that
  strayed outside scope is a finding.

Beyond correctness, look specifically for:

- **Tests that execute code without checking it.** A test that calls a function
  and asserts nothing meaningful, or asserts only that no exception was thrown,
  is not coverage. This is the most common defect in agent-written code: the
  session that wrote the implementation wrote the test, so both encode the same
  misunderstanding.
- Missing negative tests — the error path, the empty input, the boundary.
- Error paths that leak internals.
- A guard that fails open.
- A secret or permission widened to somewhere it is not needed.
- Behaviour changes that break existing callers.

## 4. What NOT to flag

Without this list you produce a firehose of speculative warnings, and the reader
learns to ignore all of it.

- **Style, formatting or import order** when a formatter or linter is configured.
- **Anything the project's own checks already enforce.** If CI runs it, it is not
  your finding.
- **"Consider adding error handling"** on a path that already handles errors, or
  where the failure mode is not stated.
- **Speculative performance** with no measurement and no plausible scale.
- **Preferences that contradict the project's established conventions.** Judge
  against the project's standards, not yours.
- **Test coverage as a number.** Flag a specific untested behaviour that could
  break, or say nothing.
- **Restating what the diff does.** A summary is not a finding.
- **Nits beyond five.** Report the five that matter and give a count for the
  rest.

## 5. The verification bar

Every finding must clear this before you report it:

- **A behaviour claim needs a `file:line` citation in the source.** Not an
  inference from a function's name, not "this probably". If you could not open
  the code and point at the line, you do not have a finding.
- **State the concrete failure.** Which input, which state, which wrong output or
  crash. "This could be fragile" is not a finding.
- Label each one **confirmed** (you traced it) or **plausible** (you could not
  fully verify, and say what would settle it).

An unverified finding wastes more time than a missed one.

## 6. Severity

| | |
|---|---|
| **Important** | Would break behaviour, lose data, or widen an exposure. Fix before merge. |
| **Nit** | Real but small. Capped at five. |
| **Pre-existing** | A genuine defect in the surrounding code that this change did **not** introduce. Report it separately, name the ticket or epic that should own it, and do not treat it as a reason to block this one. |

The bias is toward approval. A single nit in an otherwise clean range is not a
blocker; say so plainly rather than manufacturing balance.

## 7. Report — three sections, and nothing else

**Issues found.** Each with `file:line`, severity, and the concrete failure.

**Not applicable / deliberately clean.** One line. Say what you checked and found
sound, so the next reviewer does not re-tread it.

**Pre-existing.** Defects you found that this change did not cause, each with the
ticket that should inherit it. Say "none" explicitly if there are none.

**You report. You do not fix.** An agent that can edit its own finding will edit
it into agreement. The calling session applies fixes as **new commits**, never
amendments, so the review stays auditable against exactly what was reviewed.

## 8. If this is a re-review

After the first round, **suppress new nits entirely** and report only Important
findings and anything you previously raised that is still unaddressed. Otherwise
a one-line fix reaches round seven on style.
