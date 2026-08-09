# Changelog

The plugin is the methodology's distribution mechanism: a change to a skill is
a behaviour change in every project that installs it. This file is what makes
those changes deliberate and visible.

## 1.20.0 — 2026-08-09

Q-11: token accounting — a **Tokens** line per ticket, a sum per epic (user
request at the autonomous retro, 2026-08-08).

- **`skills/ticket` step 6 template**: the status entry gains a **Tokens**
  line — what the harness reports for the ticket's work, per agent where the
  agents are separate. `unknown` is tolerated and honest when the harness
  exposes no figure; estimating one is not. The number is planning evidence
  for future sizing, never a gate — no step reads it to decide anything.
- **`skills/ticket` steps 0 and 8**: the entry is committed before the review
  runs, so the reviewer's figure cannot ride the step 6 line — it lands in
  the step 8 review addendum on the same terms, and the supervisor's step 0
  hand-back passes the reviewer's token figure alongside model and effort,
  because only the hirer knows it.
- **`skills/run` step 6**: the run record template gains a **Tokens** slot on
  the same terms — per ticket (worker and reviewer) and the run's total of
  the known figures.
- **`skills/retro` step 4**: the report sums the status log's **Tokens**
  lines per epic, naming `unknown` entries rather than counting them as zero.
- Nothing is stored or parsed outside the status documents: `tickets.mjs` is
  untouched and reads no cost data.

## 1.19.0 — 2026-08-09

Q-10: the run skill's protection gate documents 403 and honors a recorded
waiver.

- **`skills/run` step 3**: the branch-protection check documented success and
  the 404→rulesets fallthrough, but a private repository under a free-plan
  org returns **403 on both endpoints** (hit live by the first unattended
  run), and step 5's blanket nonzero-exit rule made the probe's own failure a
  stop condition — an unattended run would halt on an environment shape the
  skill never named. The step now names 403 as "protection unavailable on
  this plan", marks the two probes as the skill's only tolerated nonzero
  exits (their statuses are the data the check reads), and defines where the
  driver finds a pre-recorded human waiver: the epic's `tickets.md`, on the
  Run mode line or under the ground rules. A waiver is a recorded
  **decision** ("waived <date>: <who> chose to run without the hard floor"),
  never a bare probe finding — a line that only records the 403 is no
  waiver (review fix: the two were previously indistinguishable). Waiver
  found: proceed, name it in the run record (new **Protection:** slot in
  step 6's template) and in the release PR body (step 7); none: report and
  stop before ticket one.
- **`skills/run` step 5**: "nothing is marked tolerated" became false with
  the change above; the clause now tolerates exactly a **404 or 403 from
  the two probes** — any other probe failure (auth, network, rate limit,
  5xx, wrong repository) still halts (review fix: the carve-out was
  originally granted to the commands, not the statuses).
- **`skills/epic` Run mode template**: the writer's side of the waiver
  handshake (review fix — the run skill defined a reader for an artifact no
  skill instructed anyone to write): when the plan-time probe finds
  protection missing or unavailable, the human decides at sign-off — fix
  the environment or waive it, the waiver written as a decision in the same
  tickets.md spots the probe result goes.
- **README**: the halt list now names the one tolerated exception, and
  "both must exist" admits the protection waiver — the same rule the run
  skill states (review fix; the old "both must exist" had never matched the
  skill's waivable protection).

## 1.18.0 — 2026-08-09

Q-9: plain `find` renders the pull request instead of `[object Object]`.

- **`tickets.mjs` `find <ID>`**: the human-readable output interpolated every
  fact raw, and pr is an object — a ticket with a pull request printed
  `pr [object Object]` (BOARD-3's review, pre-existing). The line now renders
  what a human acts on: `#<number> (<STATE>) <url>`. Without a PR it still
  prints `null`, and `find --json` is untouched (it was already correct). A
  test pins the rendered line via a stubbed `gh` (tickets suite 28 → 29).

## 1.17.0 — 2026-08-09

Q-8: the unfiltered board no longer claims "no epics found" when epics exist.

- **`tickets.mjs` `list`**: when epic folders exist but none has a
  `## <ID> — …` ticket section yet, the unfiltered board named nothing and
  printed `no epics found under epics/` — existing work reported as
  nonexistent, the same lie the filtered branch told before BOARD-2. It now
  names each epic with its empty state ("<epic> — no tickets yet"); a repo
  with genuinely no epics keeps the old honest answer. Test covers both
  branches (tickets suite 27 → 28).

## 1.16.0 — 2026-08-08

Q-7: configurable reviewer model.

- **`Reviewer model: <model>`** — an optional line in an epic's tickets.md
  preamble. `tickets.mjs` parses it alongside the mode lines (same tolerant
  parse: first word after the colon, case-insensitive label, prose after the
  value ignored; the value charset admits digits and dots for real model
  identifiers) and exposes it as `reviewerModel` in `find --json` and
  `list --json` — null when absent, never a default. The model was fixed in
  skill text before this; redirecting it took a mid-run conversational
  directive (AUTO-4, 2026-08-08). Now it is configuration.
- **`skills/ticket` step 7** passes the epic's `reviewerModel` when spawning
  the reviewer and keeps today's default when the line is absent: the
  strongest model available. **`skills/run`** states the same rule where the
  driver's workers spawn their reviewers. The default itself is unchanged.
  The line governs the **ticket reviewer only**: the plan reviewer is spawned
  on the draft the line lives in, before sign-off makes it configuration, and
  stays on the strongest model available (review fix — the first README
  wording implied both reviewers).
- **`doctor`** extends its preamble near-miss scan to the new line: a
  formatted `**Reviewer model:**` reads as absent and would silently fall
  back to the default model, the same failure class as a near-miss mode line.
- Tests: present, absent, prose-decorated, case/charset, and near-miss
  shapes (tickets suite 24 → 26).

## 1.15.0 — 2026-08-08

Q-6: `/flow:quick` routes through the ticket loop's lane fork.

- **`skills/quick` step 4**: after quick's own steps 1–3 — the gate, the
  written ticket, `q-<n>` cut with the plan committed, the parts that need
  the conversation — the session becomes the **supervisor** per the ticket
  skill's step 0: a fresh-context worker implements from the ticket text
  (ticket steps 4–6, with steps 1–3 scoped out of its prompt — the branch
  already exists), and the supervisor hires the reviewer. This closes the
  two holes AUTO-5's review handed to the retro: a session marked by an
  earlier `--interactive` run could still implement on contaminated context
  through quick, and quick's implementer hired its own reviewer. Retro
  decision, 2026-08-08: routing over a documented opt-out — quick's savings
  are planning ceremony, never execution hygiene (reasoning in
  METHODOLOGY.md § "Why small work has a path").
- **`/flow:quick <description> --interactive`** keeps the in-session lane at
  the same price as any interactive ticket: the session guard
  (`hooks/ticket-session-guard.mjs`) now watches both doors — a quick
  `--interactive` sets the same session marker, and a marked session is
  refused any later `--interactive` run of either command. Marker lifecycle
  (set at invocation, wiped on clear/startup, survives resume/compact)
  unchanged; plain invocations of both commands still pass in a marked
  session. Guard suite grows 10 → 13.
- Review fixes (opus/high): the routed worker's spawn prompt keeps ticket
  step 2 — the reading obligation and its stop-on-contradiction rule — and
  receives absolute document paths from the supervisor's own `find`; the
  guard's refusal message is door-agnostic ("rerun the command without
  --interactive" — the old text named a recovery not performable at the
  quick door), with the ticket skill's step 0 quote updated in the same
  commit under a dated re-plan note in Q-6's scope.

## 1.14.0 — 2026-08-08

Q-5: the autonomous epic's retro ships its lessons as rules.

- **`skills/epic`:** declaring `Run mode: autonomous` now obligates probing
  the environment prerequisites at plan time and recording the result — the
  first live run discovered a free-plan 403 on the branch-protection
  endpoints on run day, and its waiver landed seconds before start. The Outcome
  template asks the evidence line to name an observer that can distinguish
  success from failure ("zero interventions" was unfalsifiable under a
  shared GitHub identity).
- **`skills/ticket`:** the status entry's **Owed** line requires a carrier
  that can structurally reach the deferred check — an owed check was once
  handed to a lane whose entry point never touches the step it verifies.
- The repository's root instructions gain two invariants distilled from the
  epic's five reviews (cross-document doctrine drift; gates checked at the
  wrong door), METHODOLOGY.md records the observer lesson, and the retro's
  owed-work queue lands as quick tickets Q-6–Q-12.

## 1.13.0 — 2026-08-08

AUTO-5: attended tickets get the same fresh context the autonomous run just
proved — supervisor by default, interactive by flag.

- **`/flow:ticket <ID>` defaults to supervisor mode** (new step 0): the
  invoking session resolves the ticket and implements nothing; a
  fresh-context worker executes the skill from the documents alone, and
  **the supervisor hires the reviewer** — the party under review no longer
  picks its own judge. Multiple tickets per session become legitimate:
  every worker starts empty. The status entry gains a **Mode** line naming
  the worker, which is what makes the rule auditable after the fact.
- **`/flow:ticket <ID> --interactive` runs in-session as before**, for
  conversing with the implementing agent mid-ticket — once per session.
- **New static hook** (`hooks/hooks.json` + `hooks/ticket-session-guard.mjs`,
  UserPromptSubmit + SessionStart): an interactive invocation drops a
  session marker in the OS temp dir; a later `--interactive` run in that
  session is refused ("this session already ran a ticket interactively and
  carries its context — run /flow:ticket without --interactive (supervisor
  mode: a fresh worker implements), or /clear to reset the session").
  Supervisor invocations pass even in a marked session — their workers
  start empty, which is the property the rule protects — and set no marker.
  The marker is wiped on SessionStart clear/startup and survives
  resume/compact, so /clear works even where the session id does not
  rotate. Zero dependencies; the guard has its own test suite
  (`node --test plugins/flow/hooks/ticket-session-guard.test.mjs`).
- Autonomous epics are unchanged: the `/flow:run` driver already plays the
  supervisor's role, and its workers self-review per the ticket skill's
  step 10.

## 1.12.0 — 2026-08-08

BOARD-3: the next-ticket brief — a ticket's whole picture from one command.

- **New subcommand `tickets.mjs brief [ID]`**: prints the ticket's full
  section from its epic's `tickets.md` (Scope, Not in scope, Acceptance
  criteria) plus the derived facts `find` reports — state, branch, epic,
  modes, pull request — so a session can read what a ticket demands without
  opening the ticket doc. With no ID it briefs the first startable ticket in
  document order (the same one Next up proposes), naming its epic. An unknown
  ID gets `find`'s refusal verbatim (shared code path, not a copy). `--json`
  emits the `find` payload plus a `body` field carrying the section text.
- The board's Next up section gains a hint line that the brief exists — named
  as the script subcommand, since `/flow:brief` is not an installed command
  and the board never suggests a command that does not exist.

## 1.11.0 — 2026-08-08

BOARD-2: an unknown epic filter is an error, not an empty board.

- **`tickets.mjs next <epic>` and `list <epic>` refuse a filter that names no
  epic**: `no epic "<arg>" under epics/` on stderr, exit 1, in plain and
  `--json` forms alike (the `--json` forms emit no payload on that error).
  Before, `next` with a typo'd epic printed `nothing left to start` with exit
  0 — indistinguishable from a finished epic (found live, 2026-08-08) — and
  `list --json` silently emitted a valid empty payload. One rule, all
  commands, all forms; valid filters are unchanged. Plain `list` of a real
  epic whose tickets.md has no ticket sections now says
  `epic "<name>" has no tickets yet` instead of falsely claiming the epic
  does not exist.

## 1.10.0 — 2026-08-08

BOARD-1: the board's Next up suggestion is now a command that exists.

- **`tickets.mjs` Next up prints `/flow:ticket <ID>`**, not the bare
  `/ticket <ID>` — plugin commands are namespaced, and a user who ran the
  board's suggestion verbatim got "Unknown command" (found live, 2026-08-08).
  A sweep of the script found no other non-namespaced command suggestion; a
  test now pins the namespaced string and rejects any bare `/ticket `.

## 1.9.0 — 2026-08-08

AUTO-3: the `/flow:run` driver — an autonomous epic runs start to finish with
nobody present, and the human gate moves to the release pull request.

- **New skill `/flow:run <epic>`.** Refuses anything but a signed-off
  `Run mode: autonomous` epic (sign-off is verified mechanically: the epic's
  documents on `origin/epic/<name>`). Loops the tickets in document order,
  **each in a fresh-context agent** — the driver orchestrates, logs which
  agent ran each ticket, and never implements — refreshing `epic/<name>`
  from the default branch between tickets. Halts on the epic's ground-rule
  stop conditions (BLOCKED, an unfixable Important finding, a document/code
  contradiction, a merge conflict, reviewer-spawn failure past the fallback,
  a permission prompt firing mid-run, any failing command) with a run record
  in the status log saying why, and never improvises past one. Ends by
  **opening** the release pull request with the full evidence trail — and
  never merges it.
- **`/flow:epic` pushes `epic/<name>` to origin at creation** (gap found by
  AUTO-2's review): integration-mode pull requests need their base on the
  remote, and an unattended run cannot stop to ask — the push is also what
  lets `/flow:run` verify sign-off happened.
- **README + METHODOLOGY** carry the narrative: why the gate moves and never
  disappears, why main stays sacred, why stop conditions beat retries, and
  the two pieces of environment setup an unattended run needs first — a
  pre-authorized permission surface, and branch protection on the default
  branch as the hard floor under every soft rule.

## 1.8.0 — 2026-08-08

AUTO-2: the gated self-merge path — the one sanctioned agent merge, and only
into an epic branch.

- **`/flow:ticket` step 10 forks on `runMode`.** Attended epics: unchanged —
  stop at the pull request. Autonomous epics: after the review addendum
  exists (an unreviewed ticket is never merged, anywhere; reviewer-spawn
  failure falls back to an instructed general agent, and stops if that fails
  too), verify the PR's base is `epic/<name>`, merge it with a merge commit,
  and continue to the next ticket. Merging toward main remains forbidden to
  agents in every mode.
- **The epic template gains the optional `Run mode: autonomous` line**, and
  an autonomous sign-off must state the unattended consequence in plain
  terms; the plan reviewer flags a draft whose Run mode block omits that
  consequence.
- **Fixed (owed by AUTO-1):** step 9 no longer tells a serial epic's first
  ticket to base its PR on the epic branch — that stranded the epic docs;
  the PR targets the default branch, which is how the docs ship.
- CLAUDE.md merge doctrine rescoped in the same commit.

## 1.7.0 — 2026-08-08

First ticket of the autonomous epic (AUTO-1): the epic's modes become parsed
facts, ahead of any behaviour that reads them.

- **`tickets.mjs` parses `Release mode:` and `Run mode:`** from the epic
  preamble — tolerant (first word after the colon, prose ignored), defaulting
  to serial/attended when absent. Exposed as `releaseMode`/`runMode` in
  `find --json` and as a `modes` map in `list --json`; the board labels
  non-default epics.
- **`Run mode: autonomous` with serial topology is refused mechanically** —
  a `doctor` fail and a `find` error — because unattended merges may only
  ever target an epic branch, never the default branch.
- **Unrecognised mode values are doctor warnings**, exposed raw rather than
  silently coerced.
- Test suite grows 9 → 13.

## 1.6.0 — 2026-08-08

- **The ticket skill's `xhigh` review tier inherits payments and
  data-deleting/rewriting changes** (Q-4), aligning it with the quick path's
  entry triggers. The two lists measure the same thing — consequence — at two
  doors; when one learns a new trigger, the other inherits it in the same
  commit.

## 1.5.0 — 2026-08-08

Four items adopted from an external methodology review; its other proposals
(a standalone principles document, a per-ticket risk matrix, a deployment
toolkit) were rejected under the new admission test.

- **The quick path is risk-gated, not just size-gated.** Auth or authorization
  boundaries, secrets/crypto, migrations and data rewrites, new network
  exposure, payments, and anything that can fail open route to `/flow:epic`
  at any size — a single-ticket epic is fine; the plan review and sign-off
  are what consequential work must not skip.
- **Epics state a falsifiable Outcome** — problem, observable change,
  evidence, reversal condition. The plan reviewer flags outcomes that cannot
  fail; `/flow:retro` gains a fifth question checking the evidence. The only
  part of the flow that looks past the merge, and it stays human-invoked.
- **Integration mode is challenged as a design choice.** The epic template and
  the plan reviewer both push expand/contract and feature flags before
  accepting "cannot ship alone".
- **METHODOLOGY.md names the philosophy** (evidence-driven development under
  disposable context) and adopts **the admission test**: every artifact and
  gate must reduce uncertainty, constrain blast radius, preserve necessary
  knowledge, or provide decision evidence — or it is ceremony.

## 1.4.0 — 2026-08-07

- **New agent `flow:plan-reviewer`, wired into `/flow:epic`.** Before the
  sign-off gate, a fresh-context agent reads the draft decomposition against
  the actual code and reports — oversized tickets, ordering that doesn't
  de-risk, uncheckable criteria, dependencies hiding in prose — plus questions
  only the human can settle, carried into sign-off unchanged. It never rewrites
  the plan.
- **New skill `/flow:doctor`** — is this project ready for the flow? The
  deterministic half is `tickets.mjs doctor`: remote, `origin/HEAD`, `gh`,
  merge settings, instruction-file existence, duplicate IDs — and headings
  that *almost* parse, which otherwise silently read as "not done". The
  judgment half reads the instruction files for what the skills will actually
  ask of them (the exact test command above all).
- **New skill `/flow:retro`** — close a finished epic: collect Owed lines
  nothing inherited, constraints rediscovered by multiple tickets, defect
  classes review kept finding, and planning misses. Proposes at a hard gate;
  approved lessons ship via `/flow:quick`, owed work becomes tickets, and the
  status log gains one final appended `## Retro` section.

## 1.3.0 — 2026-08-07

## 1.3.0 — 2026-08-07

- **New skill `/flow:quick <description>`** — one small piece of work through
  the full loop (scope, verify, review, log, pull request) with no epic
  ceremony. Tickets accumulate as `Q-<n>` in the standing `epics/quick/` epic;
  the branch cuts from the default branch and carries the docs itself. Includes
  a hard size gate: work that doesn't fit is redirected to `/flow:epic`.
- **Board: new `integrated` state.** A pull request merged into an epic branch
  (integration mode) no longer reads as `shipped`; it is `integrated` until the
  release pull request lands on the default branch.
- **Board: duplicate ticket IDs are detected.** An ID defined in two epics is
  flagged on the board, and `find` refuses it instead of silently resolving to
  an arbitrary epic.
- **Board: the shipped-detection scan cap is no longer silent.** When only the
  last 4000 commits were scanned, the board says so.
- **Epic: the epic branch is cut from `origin/<default>`**, never from whatever
  branch planning happened to run on.
- **Review: the default range is computed against the branch's real base** —
  the pull request's base ref, or `epic/<name>` in integration mode — not
  blindly against `origin/HEAD`.
- **Squash guidance relaxed.** A single-ticket pull request titled
  `<ID>: <title>` survives squash (the squash commit inherits the title); only
  multi-ticket release pull requests must merge with a merge commit.
- **The reviewer model is no longer hardcoded.** The agent inherits, and
  `/flow:ticket` instructs passing the strongest model available rather than a
  literal model name.
- **Tests for `tickets.mjs`** — a fixture-repo suite:
  `node --test plugins/flow/scripts/tickets.test.mjs`.

## 1.2.0 and earlier

Pre-changelog: initial plugin (epic, ticket, tickets, review, the reviewer
agent, `tickets.mjs`), reviewer memory rules, epic sources and the
one-branch-per-epic model. See git history.
