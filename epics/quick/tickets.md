# Quick — one-off tickets

Source: standing epic for small work; each ticket carries its own context.

Release mode: serial

Status log: `epics/quick/status.md`. Run a ticket with `/flow:ticket <ID>`.

## Ground rules for every ticket in this epic

- Every ticket here is self-contained. Work that depends on another unshipped
  ticket does not belong in this epic.

## Q-1 — root CLAUDE.md

**Scope.**
- Write `CLAUDE.md` at the repository root: what this repository is, the exact
  test and smoke commands with their expected output, and the invariants that
  bind changes (the parser/doctor regex coupling, zero dependencies in
  `tickets.mjs`, skills self-sufficient with METHODOLOGY.md as reasoning only,
  version-and-changelog discipline for behaviour changes).

**Not in scope.** Rewriting README.md or METHODOLOGY.md; bumping the plugin
version (a repo-level doc changes no skill behaviour); per-skill documentation.

**Acceptance criteria.**
- `node --test plugins/flow/scripts/tickets.test.mjs` — 9 tests, 9 pass.
- `node plugins/flow/scripts/tickets.mjs doctor` — reports
  `root agent instructions: CLAUDE.md` as ✓ and exits 0.
