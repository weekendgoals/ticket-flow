---
name: quick
description: Turn one small, low-risk change (a bug fix, a tweak, a chore) into a single Flow ticket on GitHub with no epic, then build it with /flow:ticket through to its own pull request. Work that touches sign-in, payments, data migrations, deletion or shared infrastructure goes through /flow:epic instead. Use only when the user runs /flow:quick "<description>" or asks for the Flow quick path by name.
---

# Quick ticket: $ARGUMENTS

One small change, written down as a ticket and built like any other, without
an epic. `FLOW` below means `node "${CLAUDE_PLUGIN_ROOT}/scripts/flow.mjs"`,
run from the repository root.

## 1. Is it small, and is it safe?

It must be all of these: one area of the code, one concern; criteria that
fit in one or two bullets; a change a person can review in one sitting; no
dependency on other unfinished work.

**Never quick, at any size:** sign-in or permissions, payments or billing,
a data migration or anything that deletes or rewrites data, secrets or
cryptography, shared infrastructure (deployment, CI, a new public endpoint).
These go through `/flow:epic`, even as a one-ticket epic: a small diff in
those places can still do large, hard-to-undo damage, and the epic adds the
plan review and the human sign-off.

If either test fails, say which and stop.

## 2. Write the ticket

Read the project's instruction files and the code the change touches. Write
the body to a file outside the repository:

~~~markdown
## Scope

- <what to change, concretely>

## Not in scope

- <the tempting nearby work>

## Acceptance criteria

```criteria
- <what will be true when it is done>
  CHECK: <command run from the repository root>
  EXPECT: <text its output must contain>
```
~~~

Every ticket needs at least one CHECK: a ticket nothing can decide fails its
check. Write the EXPECT so a skipped test run cannot satisfy it (a pass count,
not just "passed"). Prove the CHECK fails today:

```bash
FLOW check --file <draft>
```

A CHECK that already passes proves nothing about the change.

Pick the tier: `easy` (built by the faster model) for a well-understood
change in familiar code, `hard` otherwise. Then create it:

```bash
FLOW create-ticket --no-epic --file <draft> --title "<short title>" --tier easy|hard
```

It prints the issue number `<n>`. A ticket with no epic counts as approved
and is delivered as its own pull request into the default branch.

## 3. Build it

Run `/flow:ticket #<n>` and follow it to the end: start, build, check,
review, accept, open the pull request and run its review loop. A person
merges the pull request.
