# Quick epic — status log

Append-only record of finished tickets. Tickets: `epics/quick/tickets.md`.

**Rules.** Append only. Corrections are new dated addenda beneath the entry they
correct, never edits. Report counts, not adjectives. The **Owed** line is
required even when empty.

### Q-18 — check-invariants script for the cross-document doctrine — 2026-08-11 — DONE

**Built:** `plugins/flow/scripts/check-invariants.mjs` — a zero-dependency,
read-only checker that exits 1 when a string-checkable cross-document coupling
drifts: the status-log preamble's three copies, the quick-gate/`xhigh` risk
lists (canonical trigger set lives in the script), skill heading templates
against the parser regexes re-derived from `tickets.mjs` source, the session
guard's refusal message as quoted by the ticket skill, and six load-bearing
doctrine phrases. Plus its suite (`check-invariants.test.mjs`) proving each
drift class actually fails, and Commands/CHANGELOG entries.

**Mode:** quick — in-session (/flow:quick)

**Tokens:** unknown

**Verified:** `node plugins/flow/scripts/check-invariants.mjs` exits 0, 5/5
checks pass; `node --test plugins/flow/scripts/check-invariants.test.mjs`
7/7; existing suites unaffected — tickets 36/36, guard 14/14;
`tickets.mjs doctor` exits 0.

**Decisions:** `epics/` was absent from the working tree (removed by 65d2197),
so the standing quick epic was recreated; numbering continues at Q-18 from the
shipped record on main (Q-1–Q-17), since a reused number would read as already
shipped — recorded as a ground rule in the recreated tickets.md. Phrase checks
run on whitespace-normalised text: the checker's first run failed on the ticket
skill's line-wrapped "toward the default branch", a checker bug, not doctrine
drift. Accepted asymmetry, documented in the script header: a trigger added
only to the ticket skill's prose list is not caught; the quick-bullet side is.

**Owed:** Nothing.
