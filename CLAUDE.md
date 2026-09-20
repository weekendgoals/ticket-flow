# ticket-flow

A Claude Code plugin marketplace with one plugin, `flow` (`plugins/flow/`):
skills and agents that run work as epics and tickets, plus `tickets.mjs`, the
script that derives the board from git, `workflows/run-epic.mjs`, the
workflow script that holds `/flow:run`'s ticket loop, `scripts/merge-append.mjs`,
the git merge driver a parallel run merges the status log with, and one session hook
(the in-session-work guard, whose only state is a per-session marker in the
OS temp dir). `README.md` is the user-facing manual;
`METHODOLOGY.md` is reasoning only and contains no rules — if it contradicts a
skill, the skill wins.

## Ticket Flow policy

Use Ticket Flow only when the user explicitly invokes `/flow:*` or asks to
use the Flow methodology. Ordinary implementation requests run directly:
implement, verify, and report without creating epic or ticket documents.
"Direct" or "without Flow" always overrides the methodology. When work does
go through the flow, one-off work goes through `/flow:quick` into
`epics/quick/`, and commit subjects carry the ticket ID (`Q-1: …`).

## Commands

- **Tests:** `node --test plugins/flow/scripts/tickets.test.mjs` — expect
  every test passing (`# pass 189`, `# fail 0` as of 2026-09-20; the count
  grows, the fail line does not). The suite builds a throwaway git repo in a
  temp dir; it needs `git` on PATH and nothing else. The session-guard hook
  has its own suite:
  `node --test plugins/flow/hooks/ticket-session-guard.test.mjs` (`# pass 14`
  on the same terms). The invariant checker has
  `node --test plugins/flow/scripts/check-invariants.test.mjs` (`# pass 39`),
  The board renderer has
  `node --test plugins/flow/scripts/board.test.mjs` (`# pass 9`) and the
  plan-page renderer `node --test plugins/flow/scripts/plan-page.test.mjs`
  (`# pass 8`), and the release walkthrough
  `node --test plugins/flow/scripts/release-page.test.mjs` (`# pass 12`) —
  all three pure rendering tests over fixture JSON, no git
  needed. The fidelity differ has
  `node --test plugins/flow/scripts/fidelity.test.mjs` (`# pass 54`) — the
  diff driven through the CLI over the committed fixture reports under
  `scripts/fixtures/fidelity/` (what a real browser returned once, from
  `design.html` and `page.html`), and the page-side extractor evaluated with
  `new Function` against a stub `document`/`getComputedStyle`, which is how a
  closure reference fails here instead of inside somebody's page. It needs
  nothing but Node, and **no test may launch or drive a browser** — the plugin
  owns none, which is why it installs anywhere. The run meter has
  `node --test plugins/flow/scripts/meter.test.mjs` (`# pass 18`) — tokens
  and time metered off journal and transcript text built in the test, in the
  shapes a real run wrote; the two CLI cases write a throwaway run directory
  to the OS temp dir. Nothing but Node, and **no test reads a real
  transcript** — those live under `~/.claude` and belong to whoever ran
  them. The append merge driver has
  `node --test plugins/flow/scripts/merge-append.test.mjs` (`# pass 11`) —
  REAL git in throwaway repositories, the driver wired exactly as the run's
  merge step wires it, because the driver it replaced (git's own `union`) was
  also obviously right and corrupted every merge it touched; one test keeps
  that failure on record. Needs `git` and nothing else. The worktree setup has
  `node --test plugins/flow/scripts/worktree-setup.test.mjs` (`# pass 17`) —
  real git again, real linked worktrees in throwaway directories, because the
  refusal that matters asks git a question (`check-ignore`, where `.git` is a
  file). Needs `git`, POSIX `sh` and `sleep` (the budget case). And the run driver has
  `node --test plugins/flow/workflows/run-epic.test.mjs` (`# pass 180`) —
  which evaluates `run-epic.mjs`'s module body with stubbed agents and
  asserts the sequence, the gate branches and the halt mapping. It needs
  nothing but Node: no git, no network, no filesystem beyond the script.
  The Codex worker runner has
  `node --test plugins/flow/scripts/runners/codex.test.mjs` (`# pass 22`) —
  a stub `codex` binary that speaks the real CLI's JSONL protocol drives
  the runner through a throwaway git repo; it needs `git` plus POSIX `sh`,
  `ps` and `sleep` (the detachment, cancel, hung-pid and hung-transport
  cases kill process groups, read them, and stand in a live bystander or a
  remote that never answers) and nothing else, and never calls the real
  Codex. The Codex shadow-review runner has
  `node --test plugins/flow/scripts/runners/codex-review.test.mjs`
  (`# pass 20`) — the same kind of stub, including the schema-valid interim
  messages real Codex streams, drives every outcome through a throwaway git
  repo and checks the review worktree is gone after each; it also cuts the
  driver's packet body, reviewer rules and `REVIEW_SCHEMA` out of
  `run-epic.mjs` and holds the runner to them, so the two packets stay one.
  It needs `git` and nothing else, and never calls the real Codex.
- **Doctrine invariants:** `node plugins/flow/scripts/check-invariants.mjs` —
  must exit 0 on this repo; mechanically verifies the string-checkable
  cross-document couplings (the status-log preamble's three copies, the run
  log's copy of its **Rules** block, the two
  risk lists, skill heading templates against the parser regexes, the
  `COMPARE`/`LANDMARKS` template against theirs, the session
  guard's refusal message as the ticket skill quotes it, load-bearing doctrine
  phrases). Run it whenever a skill, agent, hook or doctrine document changes —
  it is presence and equality only, so contradictions in meaning still need
  review. Its suite: `node --test plugins/flow/scripts/check-invariants.test.mjs`
  (`# pass 39` on the same terms).
- **Smoke:** `node plugins/flow/scripts/tickets.mjs doctor` — must exit 0 on
  this repo. `… list` shows the board.
- **Syntax check:** `node --check plugins/flow/scripts/tickets.mjs`, and the
  same for `scripts/fidelity.mjs`, `scripts/meter.mjs`,
  `scripts/merge-append.mjs`, `scripts/worktree-setup.mjs` and
  `scripts/release-page.mjs`. This does
  **not** work on `plugins/flow/workflows/run-epic.mjs`: a workflow script is
  a module body with a top-level `return`, which the workflow runtime allows
  (`allowReturnOutsideFunction`) and `node --check` rejects. Parse it the way
  the runtime does instead:
  `node -e 'const s=require("fs").readFileSync("plugins/flow/workflows/run-epic.mjs","utf8").replace(/^export const meta/m,"const meta");new (Object.getPrototypeOf(async function(){}).constructor)("agent","parallel","pipeline","log","phase","args","budget",s)'`
  — it exits 0 on a parseable script and prints a SyntaxError otherwise.
- **Live plugin dev:** `/plugin marketplace add ~/projects/ticket-flow`, then
  `/reload-plugins` to pick up skill edits mid-session.

There is no package.json or linter. CI (`.github/workflows/tests.yml`) runs
every suite above, the invariant checker, doctor, and the syntax/parse
checks on pushes to main and on pull requests — the same commands as here,
so local runs and the PR gate cannot drift apart. Node ≥ 20 (built-in test
runner); `node --test <directory>` does not discover files here — pass the
test file path explicitly.

## Invariants

- **`tickets.mjs` has zero dependencies and stores nothing.** Every fact is
  recomputed from git, `gh`, and document headings. Never add a cache, a state
  file, or an npm dependency.
- **Tokens and time are one grammar in two ledgers, and the unit is the
  wall between them.** `spend` reads a `<ID> worker=<n>` group wherever it
  sits in a run record, so a duration written without its `s` is added to
  the token ledger silently. `scripts/meter.mjs` writes both lines,
  `tickets.mjs` parses both, the run skill's template teaches both — a
  change to either shape moves all three in the same commit, and
  `check-invariants.mjs` pins the Time template. `meter.mjs` shares the
  first invariant: zero dependencies, stores nothing, and a figure it cannot
  observe is `unknown`, never an estimate. A ticket's git commit span is
  never reported as its `wall` — commits begin when the work is nearly over.
- **A parallel run changes WHERE a pipeline runs and nothing it must pass.**
  `run-epic.mjs` splits at the one line that matters — `runTicket` touches
  only the ticket's branch and may run side by side, in its own worktree;
  `integrateTicket` touches the epic branch and is always one at a time, in
  document order, whichever pipeline finished first. Three things must stay
  true, and the driver's suite pins each: **`Parallel:` absent or `1` is the
  old run, prompt for prompt, through every ticket** — what follows the loop,
  the release check, is the same steps in both — (epics planned when document order was the
  only dependency mechanism must not go wide on a plugin update); **timing
  decides nothing** (records and merges in wave order — a test delays one
  pipeline); and **a halt is returned by a pipeline, never thrown**, because
  `parallel()` turns a throw into a bare `null`. New module-level mutable
  state written inside `runTicket` is a race: the only one there is,
  `ticketBudget`, is unreachable under `Parallel:` because the pair is
  refused. Hoisted function declarations may be called by the loop above
  them; a `const` they use may not live below it (that was a TDZ crash once).
- **A worktree's setup copies only what git ignores, and runs only what was
  pushed.** `scripts/worktree-setup.mjs` reads `epics/worktree.json` from the
  worktree — the epic branch as committed — never from the main checkout's
  working tree, and refuses to copy a file `git check-ignore` does not call
  ignored: the files worth copying are secrets, and a wave worker commits
  with `git add`. It asks again after the last copy and the last setup
  command (a later copy can un-ignore an earlier one) and removes what git
  would now stage; it never reads from or writes through a symbolic link.
  Do not move that refusal into a prompt, and do not make a
  partial setup exit 0 — the worker would verify against something nobody
  chose. No file means no change, and the step exists only under
  `Parallel:`, so a serial run's tickets stay the old run, prompt for prompt.
- **A merge driver that does nothing is a clean merge that loses data.**
  Git keeps ours and drops theirs when a driver exits 0 without writing, and
  reports no conflict. So `scripts/merge-append.mjs` acts on its `--driver`
  flag — never on a comparison of its own path, which a symlinked plugin
  directory once made false — and exits nonzero whenever it is told to act
  and cannot; and the wave's merge step greps the merged log for the
  ticket's entry heading **before it pushes**. Never replace it with git's
  `union` driver: union is line-level, emits a shared line once, and moved one
  ticket's `**Owed:**` line under another's heading in a merge git called
  clean. Any assumption about git's behaviour is tested against real git in a
  throwaway repository (`merge-append.test.mjs` does) before it is built on.
- **The heading regexes are load-bearing and shared.** `TICKET_HEADING` and
  `STATUS_HEADING` are used by both the parsers and `doctor`'s near-miss
  detection — that coupling is the point. If a heading format changes, the
  templates in `skills/epic/SKILL.md`, `skills/ticket/SKILL.md` and
  `skills/quick/SKILL.md` must change in the same commit, and a test must
  cover the new shape.
- **`**Blocked by:**` is strict, and an unreadable line is a named problem —
  never a guess.** `BLOCKED_BY_LINE` takes bare same-epic IDs and commas and
  nothing else; a line whose label opens it at the margin and does not parse
  (`BLOCKED_BY_NEAR` — keep that set small: a near line stalls a ticket, and
  the first cut stalled one on a wrapped sentence — and never silent either:
  a dependency stated off the margin is what `BLOCKED_BY_UNREAD` makes
  `doctor` say, because under `Parallel:` an unread line is a ticket
  "declared independent") leaves the ticket `waiting` with a sentence the board,
  `find`, `doctor` and `next` all print. Do not make the parse tolerant: the
  removed dependency graph was, and prose stalled tickets silently. And
  `next` must keep exiting nonzero when tickets wait and none can start — the
  run driver reads an empty list as "the epic is built, open the release".
  The epic skill's template moves with the regex in the same commit;
  `check-invariants.mjs` runs the template through the regex and fails if
  the parse goes tolerant. The removed `Depends on:` spelling stays inert:
  a live installed epic carries it on unstarted tickets.
- **Ticket IDs match `[A-Z][A-Z0-9]*-\d+`**, branches are the lowercased ID,
  and shipped detection reads `^<ID>[:\s]` off commit subjects on the default
  branch. Changing any of these breaks every installed project's board.
- **Skills are self-sufficient.** An agent executing a skill never needs
  METHODOLOGY.md. New rules go in the skill that executes them; new reasoning
  goes in METHODOLOGY.md; both in the same commit when a constraint changes.
- **A behaviour change to any skill, agent or the script gets a CHANGELOG.md
  entry in the same commit** — installed projects update live, so an
  unrecorded change is a silent one. Version bumps in
  `plugins/flow/.claude-plugin/plugin.json` are **batched**: compatible
  refinements accumulate under an `## Unreleased` changelog heading, and a
  release stamps the batch with one version and date — one deliberate
  release beats a version number per sentence changed. What is never batched
  away is the entry itself. **The stamp has a trigger: the pull request that
  brings work to the default branch** — a release epic's release pull
  request, or a direct feature's own — renames `## Unreleased` to
  `## <version> — <date>`, adds a fresh empty `## Unreleased` above it, and
  bumps `plugin.json`, all in one commit. The rule had no trigger once, and
  `2.0.0` then sat on 93 unreleased entries for five weeks while installed
  projects updated live under an unchanging number. Minor for additive
  batches; major only when a heading format, the ticket-ID shape or a
  command's contract breaks. `check-invariants.mjs` fails when `plugin.json`
  and the newest stamped heading disagree, and when `Unreleased` passes 30
  entries.
- **Reviewers report and never fix.** Do not give `ticket-reviewer` or
  `plan-reviewer` write instructions.
- **A human merges into main; nothing runs after that merge.** Absolute in
  every mode: no agent merges or pushes toward the default branch, and no
  skill gains a post-merge step. The one sanctioned agent merge is **a
  ticket branch into its epic branch** inside a release epic — declared
  `Delivery: release` (ticket skill step 10; in an unattended run, the run
  workflow's merge step after its coded gate), always by the branch's
  verified head SHA, never a name that could move. Release tickets open no
  pull request of their own — the release pull request is the epic's only
  one, the human gate moves there, and
  branch protection on main is the hard floor under the rule. Refreshing an
  epic branch **from** the default branch (ticket skill step 3, and the run
  loop's refresh in `workflows/run-epic.mjs`) is the safe direction — main is
  the source, never the target —
  and is not a merge toward main.
- **CHECK/EXPECT and COMPARE acceptance criteria are one format in five
  documents and one parser.** `tickets.mjs` parses and runs them (`check
  <ID>`, with doctor near-miss coverage), the epic skill's template teaches
  them, the ticket and quick skills run them, and the run driver re-runs them
  from the signed-off document (`--from origin/epic/<name>`) as a code merge
  gate — because the reviewed party must not edit its own gate — and once
  more for every landed ticket at the epic head before it reports
  `completed` (the release check; `check-epic` is the same check by hand):
  there the criteria are the head's own, so a mid-epic re-plan counts, and
  what differs from sign-off is shown to the human rather than gated on. A format
  change moves the parser, the skills and the driver in the same commit;
  `check-invariants.mjs` holds the coupling.

  **`COMPARE:` / `LANDMARKS:` are part of that one format and the part no
  code runs**: comparing an artboard with a rendered page needs a browser,
  and this plugin owns none — so `check` lists comparisons apart from the
  checks, marked manual, in **neither `total` nor `passed`** (the driver
  halts when `passed !== total`, so a compare counted there would halt every
  COMPARE ticket), and what the code gates is the **presence** of the
  `**Compared:**` table in the status entry. A malformed COMPARE is a ledger
  problem and fails the gate, exactly as a malformed CHECK does.

  The one sanctioned departure from "the parser, the skills and the driver
  move in the same commit": **a criterion format may land one ticket ahead of
  its gate within a single release epic**, on two conditions that were true
  when `COMPARE` did it (FID-3 and FID-4) — the format and its gate reach the
  default branch inside that epic's **one** release pull request, so no
  window exists on `main` where the format is readable and ungated; and the
  ungated criterion cannot green anything in the meantime, which here is the
  compare rows staying out of the ledger's `total`, pinned by a test.
- **The two risk lists are one list.** The quick skill's entry triggers and
  the ticket skill's `xhigh` review tier measure the same consequences at two
  doors — a trigger added to either is added to the other in the same commit.
- **New artifacts and gates must pass the admission test** (METHODOLOGY.md §
  "The admission test"): reduce uncertainty, constrain blast radius, preserve
  necessary knowledge, or provide decision evidence — at least one, or it is
  ceremony and does not land.
- **A rule stated in more than one document is one rule.** Before changing a
  sentence that states doctrine (merge rules, branch topology, mode
  behaviour), grep its key phrase across the skills, README, METHODOLOGY and
  this file and update every statement in the same commit — four of the
  autonomous epic's five reviews found drift between documents that each
  read correctly alone.
- **A gate is verified at the door its actor walks through.** A refusal or
  check must live in the command or step the guarded actor actually runs —
  a sibling command that also checks guards nothing — and the refusal's
  advertised recovery must work in the refused state. Both failure shapes
  shipped repeatedly in the autonomous epic before review caught them.
- **Docs style: every constraint carries its reason.** A bare rule ("never
  squash") without its mechanism (subjects are how shipped is detected) will
  be "simplified" away by a future session.
