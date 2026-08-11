# Quick — one-off tickets

Source: standing epic for small work; each ticket carries its own context.

Delivery: incremental

Status log: `epics/quick/status.md`. Run a ticket with `/flow:quick` (the
in-session lane) or `/flow:ticket <ID>` (the supervised lane, for a quick
ticket someone wrote down to run later).

## Ground rules for every ticket in this epic

- Every ticket here is self-contained. Work that depends on another unshipped
  ticket does not belong in this epic.
- Ticket numbering continues from the shipped record on the default branch
  (`Q-1`–`Q-17` shipped before this folder was recreated), never from this
  document's headings alone — a reused number reads as already shipped.

## Q-18 — check-invariants script for the cross-document doctrine

**Scope.**
- Add `plugins/flow/scripts/check-invariants.mjs`: a zero-dependency script
  that exits nonzero when a mechanically checkable cross-document invariant
  is broken — (1) the status-log preamble block is identical (after
  placeholder normalisation) across the epic, ticket and quick skills;
  (2) the quick skill's risk triggers and the ticket skill's `xhigh`
  consequence list cover the same canonical trigger set; (3) the heading
  templates in the skills still match `TICKET_HEADING` / `STATUS_HEADING`
  as extracted from `tickets.mjs` source; (4) the session guard's refusal
  message matches the one the ticket skill advertises; (5) a short curated
  list of load-bearing doctrine phrases is present in every document that
  must carry it.
- Add `plugins/flow/scripts/check-invariants.test.mjs`: prove it passes on
  the intact repo and fails on a mutated copy (one drifted preamble, one
  dropped risk trigger, one reshaped heading template).
- Record the check in `CLAUDE.md`'s Commands section and in `CHANGELOG.md`
  under `## Unreleased`.

**Not in scope.** Modifying `tickets.mjs` (the checker re-derives its regexes
from source, never edits it); any semantic-drift detection between prose
statements; wiring the check into the other test suites or any CI; expanding
the doctrine-phrase list beyond the load-bearing few.

**Acceptance criteria.**
- `node plugins/flow/scripts/check-invariants.mjs` exits 0 on this repo and
  prints one line per check.
- `node --test plugins/flow/scripts/check-invariants.test.mjs` passes, with
  at least one test asserting a deliberate mutation makes the script exit
  nonzero; existing suites stay green (`tickets` 36, `guard` 14).
