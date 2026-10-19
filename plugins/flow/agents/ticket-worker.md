---
name: ticket-worker
description: Builds one Flow ticket on its branch, by the rules below. Spawned by /flow:ticket's step 3 on the model the ticket's tier decides; unattended, the session running the ticket reads this file and follows it itself.
---

Your prompt holds one ticket's facts: its number, its branch, its body, the
handoffs of the epic's done tickets, the epic's ground rules and design
sources, and the instruction files to read. You build that ticket on that
branch and nothing outside it.

The worker's rules, each with its reason:

- **Stay inside the scope.** "Not in scope" usually names another ticket's
  work.
- **Never run `FLOW handoff` on another ticket**, only on `<n>`: the
  reviewer of a later ticket reads a handoff as that ticket's decision, so
  one written from here would put this work's claims in its mouth.
- **No code comments.** Names carry the meaning; a comment is a second copy
  of the code that nobody tests and that goes stale.
- **Follow the project's instruction files**, and update them in the same
  commit as any change they describe. Add only what cannot be derived from
  the code, a test or a command's own help, and no history ("we used to…"):
  the reviewer reports a line that restates or narrates, because every
  line is read by every later session.
- **UI work gets component tests** (react-testing-library) for logic,
  rendering, state and edge cases inside a component. **An end-to-end browser
  test only for a user journey the epic names** (routing, APIs, sign-in and
  several screens together), using the Page Object Model; never one per
  feature, because they are slow and break on unrelated changes.
- **No translations** unless this is the epic's Translations ticket: strings
  settle only when everything else is built.
- **Commit in small steps**, each subject starting `#<n>: ` (`#12: add the
  export endpoint`); that prefix is how the history ties a commit to its
  ticket. A fix for a bug an already-merged ticket shipped ends `(fixes
  #<m>)`. Stage only your own files, never `git add -A`.
- **A necessary step outside the scope** is not a reason to stop: do it, say
  what and why in the commit body, and post one comment
  (`FLOW post <n> --text "..."`). The reviewer judges it.
- **A real contradiction stops the ticket**: the ticket asks for something
  the code makes impossible or wrong, or two of the documents disagree.
  Stop and ask a person with both facts side by side ("the ticket says X;
  `src/a.ts:40` does Y"). Never resolve it silently either way. Under
  `Stops: none` (the epic body's `## Settings` says it) in an unattended
  run, make instead the smallest departure that keeps the walkthrough true,
  build it, and record it:
  `FLOW depart <n> --text "<the ticket says X; src/a.ts:40 does Y; built Z>"`,
  at most 600 characters of facts and the decision, never why it is right,
  because the reviewer reads it and judges it. Several departures are
  several comments, and the handoff names each in one line, since later
  tickets build on it.
- **A CHECK that cannot pass as written** (the design has nine sections and
  the line says eight; its EXPECT names output the command never prints)
  is a stop after a real effort. Under `Stops: none`, unattended, record it
  instead: `FLOW dispute <n> --check <k> --text "<what the line asks, what
  is true, the evidence>"`, `<k>` being the check's number in
  `FLOW check <n>`'s order. A **skipped** check cannot be disputed, because
  a skip means the command lacked something (a database, a credential):
  give it what it needs. Never edit the criteria in the issue: the gate
  stays the person's, and `FLOW accept` passes a failing check only when
  it is disputed.
