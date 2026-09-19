# ticket-flow

A Claude Code plugin marketplace with one plugin, `flow` (`plugins/flow/`):
skills and agents that run work as epics and tickets, plus `tickets.mjs`, the
script that derives the board from git, `workflows/run-epic.mjs`, the
workflow script that holds `/flow:run`'s ticket loop, and one session hook
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
  every test passing (`# pass 128`, `# fail 0` as of 2026-09-19; the count
  grows, the fail line does not). The suite builds a throwaway git repo in a
  temp dir; it needs `git` on PATH and nothing else. The session-guard hook
  has its own suite:
  `node --test plugins/flow/hooks/ticket-session-guard.test.mjs` (`# pass 14`
  on the same terms). The invariant checker has
  `node --test plugins/flow/scripts/check-invariants.test.mjs` (`# pass 32`),
  The board renderer has
  `node --test plugins/flow/scripts/board.test.mjs` (`# pass 9`) and the
  plan-page renderer `node --test plugins/flow/scripts/plan-page.test.mjs`
  (`# pass 8`) — both pure rendering tests over fixture JSON, no git
  needed. The fidelity differ has
  `node --test plugins/flow/scripts/fidelity.test.mjs` (`# pass 43`) — the
  diff driven through the CLI over the committed fixture reports under
  `scripts/fixtures/fidelity/` (what a real browser returned once, from
  `design.html` and `page.html`), and the page-side extractor evaluated with
  `new Function` against a stub `document`/`getComputedStyle`, which is how a
  closure reference fails here instead of inside somebody's page. It needs
  nothing but Node, and **no test may launch or drive a browser** — the plugin
  owns none, which is why it installs anywhere. And the run driver has
  `node --test plugins/flow/workflows/run-epic.test.mjs` (`# pass 158`) —
  which evaluates `run-epic.mjs`'s module body with stubbed agents and
  asserts the sequence, the gate branches and the halt mapping. It needs
  nothing but Node: no git, no network, no filesystem beyond the script.
  The Codex worker runner has
  `node --test plugins/flow/scripts/runners/codex.test.mjs` (`# pass 21`) —
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
  (`# pass 32` on the same terms).
- **Smoke:** `node plugins/flow/scripts/tickets.mjs doctor` — must exit 0 on
  this repo. `… list` shows the board.
- **Syntax check:** `node --check plugins/flow/scripts/tickets.mjs`, and the
  same for `scripts/fidelity.mjs`. This does
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
- **The heading regexes are load-bearing and shared.** `TICKET_HEADING` and
  `STATUS_HEADING` are used by both the parsers and `doctor`'s near-miss
  detection — that coupling is the point. If a heading format changes, the
  templates in `skills/epic/SKILL.md`, `skills/ticket/SKILL.md` and
  `skills/quick/SKILL.md` must change in the same commit, and a test must
  cover the new shape.
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
  away is the entry itself.
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
  gate — because the reviewed party must not edit its own gate. A format
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
