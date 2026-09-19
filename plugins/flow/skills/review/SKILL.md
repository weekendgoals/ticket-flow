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

## 1. Establish the base, then the range — and refuse the wrong ones

The base is **what this branch will merge into**, which is not always the
default branch:

- If the branch already has a pull request, `gh pr view --json baseRefName`
  is the answer.
- Else, if this is ticket work and the epic's ticket doc says
  `Delivery: release`, the base is `epic/<name>` — diffing against the
  default branch would drag every previously integrated ticket into this
  review.
- Otherwise it is the default branch (`origin/HEAD`).

```bash
git log --oneline $(git merge-base origin/<base> HEAD)..HEAD
git diff --stat $(git merge-base origin/<base> HEAD)..HEAD
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
- **A fixture that cannot produce the case.** Of every test that is the sole
  evidence for a criterion, ask: *what input would make this fail, and
  does the fixture contain it?* A fixture that cannot reach the branch the test
  names — twelve points on one line for an overlap loop, which then has no
  pairs; a warm cache answering where the code should have — passes with the
  behaviour deleted. One live epic's reviews found nine, and a criterion in
  one ticket naming the class did not stop the next ticket producing four
  more: prose does not bind the next ticket, a reviewer's lens does. Important
  when nothing else pins the behaviour. Where the project's instruction file
  says how to run the suite, delete the behaviour in a scratch copy of the
  range, re-run the named test, and report what it showed — the ticket
  skill's revert check, applied by the judge. You still fix nothing.
- **A revert check that does not hold.** The Verified line names the test
  that fails with the source change reverted; open it and confirm it depends
  on the change. A named test that would pass without the change, or an
  `n/a` whose reason does not hold — the diff is not prose (documentation
  and code comments only, nothing any runtime, parser, test or agent reads)
  and the project has a suite that could pin it — is Important: a suite
  that cannot tell whether the change is present leaves the merge with no
  evidence behind it.
- **A `removed` entry added or changed in the ticket's own diff.** The design
  map's `removed` list is **planning's**: it says what the plan deliberately
  does not build. A worker edits the map — its `page` selectors are written
  before the page exists — so a removal appearing in this diff is the party
  under review declaring its own missing element removed, which produces a
  clean comparison and stops nothing. That is **Important** whatever the
  entry says; a worker who could not build something writes a
  `**Deviation:**`.
- **A style assertion that reads a property off an element while the page
  paints something else.** The visual form of the test that executes code
  without checking it: an inline style beating the rule under test, an
  assertion on a wrapper while a child paints, a property read at a width the
  test never set. The assertion passes, the page is wrong, and the suite says
  the opposite.
- Missing negative tests — the error path, the empty input, the boundary.
- Error paths that leak internals.
- A guard that fails open.
- A secret or permission widened to somewhere it is not needed.
- Behaviour changes that break existing callers.

## 3b. When the ticket carries a `COMPARE` criterion

The epic's `Design sources:` line names what the design draws, and the entry
carries a `**Compared:**` table the worker produced. **That table is a claim,
and you are the only fresh context that can check it.**

- **Re-run the differ when the project's instruction file says how to serve
  and drive a page** — its dev server, its e2e runner, whatever `Bash` can
  already reach. Print the extractor with
  `node "${CLAUDE_PLUGIN_ROOT}/scripts/fidelity.mjs" extract`, evaluate it on
  the design source and on the built page at each width the criterion names,
  and run `fidelity.mjs diff … --map epics/<name>/design-map.json
  --removed-from <the signed-off map>` — removals from the base ref, never
  from the working tree's copy, which is the file this ticket edits. **A table
  the re-run contradicts is Important.**
- **Otherwise, audit the table against the design source's own markup and say
  the page was not rendered.** A reviewer in a sandbox with no network never
  renders anything, and its packet says so. An audit that is silent about not
  having rendered reads as a confirmation, which is worse than no audit.
- Re-running the differ is a **read**. You report what it printed; you fix
  nothing, and you do not edit the map.

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
| **Important** | Would break behaviour, lose data, or widen an exposure. Fix before merge. A user-visible regression this change introduces is Important, even outside the ticket's scope: scope limits what the worker builds, not what the reviewer reports. Something that worked before and now visibly does not (a duplicated or missing control, a broken layout, a removed way to do something) is a regression, not a nit — a nit is left for later, and later is after the release. A revert check that does not hold is Important on the same terms — a merge with no evidence behind it. |
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
