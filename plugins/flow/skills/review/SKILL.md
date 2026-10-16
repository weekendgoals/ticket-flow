---
name: review
description: Review a range of committed changes with fresh eyes and report what is wrong, without fixing anything — the same rules the ticket reviewer uses, run by hand. Use when the user runs /flow:review [range].
---

# Review: $ARGUMENTS

Reviews **committed** changes, never the uncommitted ones. The point is a
reader who did not write the code: the session that wrote it has spent hours
justifying it and will agree with itself. So run this in a fresh session, or
hand it to a subagent.

## 1. The range

`$ARGUMENTS` is an optional commit range (`abc123..HEAD`) or a single commit.
Without one, review the current branch against what it will merge into:

- the branch has a pull request: `gh pr view --json baseRefName`;
- it is `ticket/<n>` of a release epic (`node
  "${CLAUDE_PLUGIN_ROOT}/scripts/flow.mjs" ticket <n>`, then the epic's
  `Branch:` setting): the epic branch, because diffing against the default
  branch would drag every earlier ticket into this review;
- otherwise the default branch.

```bash
git fetch origin
git log --oneline $(git merge-base origin/<base> HEAD)..HEAD
```

If the range is empty, say so and stop. Uncommitted changes are out of
scope: do not review them, commit them, or mention them.

## 2. Context

When the branch is a Flow ticket (`ticket/<n>`), read the ticket with
`flow.mjs ticket <n>` and its epic's ground rules and design sources; the
ticket's scope, "Not in scope" and criteria are binding. Read the project's
instruction files (`CLAUDE.md`, `AGENTS.md`) at the root and in every
directory the range touches. Do not read the ticket's comments for the
builder's account of the work: you judge the result, not the story.

## 3. Review

Spawn `flow:ticket-reviewer` with the Agent tool, **without a `model`
parameter** (it runs on the strongest model), handing it the range, the
ticket body and epic rules when there are any, and the instruction file
paths. Or, if you are already a fresh session that did not write the code,
follow `${CLAUDE_PLUGIN_ROOT}/agents/ticket-reviewer.md` yourself: the same
lenses, the same bar (`file:line`, the concrete failure, confirmed or
plausible), the same three sections.

## 4. Report

Print the report. **Fix nothing**, post nothing, commit nothing: this is a
report for the person who asked. If they want it on the ticket, they say so
and you run `flow.mjs post <n> --file <report>`.
