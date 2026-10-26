---
name: quick
description: Turn one small, low-risk change (a bug fix, a tweak, a chore) into a single Flow ticket on GitHub and build it with /flow:ticket. With no epic it ends at its own pull request; with an epic (/flow:quick #<epic> "<change>", for example a person's feedback on the epic's release pull request) it is built into that epic's branch and the release pull request is updated to include it. Work that touches sign-in, payments, data migrations, deletion or shared infrastructure goes through /flow:epic instead. Use only when the user runs /flow:quick or asks for the Flow quick path by name.
---

# Quick ticket: $ARGUMENTS

One small change, written down as a ticket and built like any other, without
planning an epic. `FLOW` below means `node "${CLAUDE_PLUGIN_ROOT}/scripts/flow.mjs"`,
run from the repository root.

`$ARGUMENTS` is `"<description>"`, or `#<epic> "<description>"` for a
change to the work of an epic that is built but not yet merged by a person,
such as what they asked for after reading its release pull request.

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

With an epic, run `FLOW board <epic>` too. Stop and say why when the epic
is not approved (its tickets cannot start), or while a run may be building
it: one of its tickets is in progress or in review, or the person says a
`/flow:run` or the Action is still going on it (nothing on the board shows
a run between tickets). A run picks the new ticket up as soon as it is
ready, so building it here too would be a second builder. A closed epic
(its release pull request was merged) is refused by `create-ticket`: the
change goes to the default branch, so run the quick path without the
epic.

## 2. Check the request against the code

Read the project's instruction files and the code the change touches. When
the request says something the code contradicts (a thing missing that
exists, a value or a behaviour the code does not have), show the person
what the code does, with `file:line`, and ask before writing anything: a
ticket written from a wrong premise gets a CHECK that tests the premise.

## 3. Write the ticket

Write the body to a file outside the repository:

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
not just "passed"), and copy it from the command's own output, never a
test's title or a wording from memory, because a rename or a guessed phrase
fails the fix once it is right. Prove the CHECK fails today; with a release epic, run
it with the epic branch checked out (`git fetch origin`, then `git switch
--detach origin/<Branch>`), since that is the code the ticket changes. An
incremental epic's tickets start from the default branch, so run it there:

```bash
FLOW check --file <draft>
```

A CHECK that already passes proves nothing about the change.

Pick the tier: `easy` (built by the faster model) for a well-understood
change in familiar code, `hard` otherwise. Then create it:

```bash
FLOW create-ticket --no-epic --file <draft> --title "<short title>" --tier easy|hard
FLOW create-ticket <epic> --file <draft> --title "<short title>" --tier easy|hard
```

It prints the issue number `<n>`. A ticket with no epic counts as approved
and is delivered as its own pull request into the default branch. A ticket
of an epic is ready at once, since the epic is approved, and is delivered as
the epic's other tickets are.

## 4. Build it

When the project has Flow's GitHub Action (`.github/workflows/flow.yml`) and
the ticket has an epic, run `FLOW label <n> +flow:start` and stop: the
Action builds and delivers it (for a release epic it then checks the epic
and updates the release pull request), and a build here as well would be a
second builder on the same ticket.

Otherwise run `/flow:ticket #<n>` and follow it to the end: start, build,
check, review, accept, then deliver. With no epic, or an incremental epic,
that ends at the ticket's own pull request, which a person merges.

With a release epic it ends merged into the epic branch. Then check the
epic at its new head and update the release pull request, which lists and
closes the new ticket once its body is rewritten:

```bash
FLOW check-epic <epic> --mark
FLOW release-pr <epic>
```

When `check-epic` hands a ticket to a person, say which and stop:
`release-pr` opens only at a head every check passed at. Under `Stops:
none` with tickets still parked, add `--draft` to `release-pr`. Then print
the release pull request's URL.
