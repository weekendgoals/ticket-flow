# Changelog

The plugin is the methodology's distribution mechanism: a change to a skill is
a behaviour change in every project that installs it. This file is what makes
those changes deliberate and visible. Entries land in the same commit as the
change, under `## Unreleased` between releases; a release stamps the batch
with one version and date.

## 2.0.0 — 2026-08-11

The cost release: the flow's guarantees become adaptive and cheaper, per an
external token-economics review (the repo's own record showed ~155k tokens
per quick ticket, ~450k of reviewer spend across Q-11–Q-17, much of it on
one-line changes). The epic declaration syntax is replaced outright — the
plugin is new, so the old `Release mode:` / `Run mode:` lines are removed
rather than shimmed — hence the major version.

- **Flow is opt-in.** The skills' trigger descriptions no longer invite
  auto-engagement on ordinary requests ("or asks for a small change" is
  gone): plain request = direct development, `/flow:*` = managed
  development. README documents the three lanes (direct / quick / epic) and
  ships a `CLAUDE.md` policy snippet for installing projects. There is
  deliberately no `/flow:direct` command.
- **`/flow:quick` is now the cheap lane: in-session by default.** The
  supervisor/fresh-worker execution loop (1.15.0) is reversed for quick
  only: the session that writes the `Q-<n>` ticket implements it, verifies
  with counts, writes a short entry, and opens the PR. A fresh-context
  reviewer is spawned **only when behaviour changes**, on a cost-efficient
  model at `effort: medium`; prose-only diffs — documentation and comments,
  nothing a machine reads — get none, the pull request being the review.
  The size + risk gate is unchanged and still routes consequential work to
  `/flow:epic` at any size.
- **Session guard reshaped to match** (`hooks/ticket-session-guard.mjs`):
  every `/flow:quick` invocation marks the session as carrying
  implementation context (it is in-session by design, and is itself never
  refused, at any count); `--interactive` remains a `/flow:ticket`-only
  concern — refused in a marked session, toward supervisor mode or /clear.
  Refusal message updated; guard suite 13 → 14.
- **Ticket review is tiered by consequence, model and effort together**
  (ticket skill step 7): prose only (documentation and comments — nothing
  any runtime, parser, test, or agent reads) → fast mid-tier model at
  `low`; everything else below the risk list, config and strings and CLI
  output included → capable mid-tier model at `high`; the consequence list
  (unchanged, still coupled to quick's entry gate) → strongest model at
  `xhigh`. The epic's `Reviewer model:` line overrides the tiers. The flat
  "strongest model always" default is gone.
- **Workers read a compiled brief, not the whole status log** (ticket skill
  step 2): `tickets.mjs brief` now also carries the epic preamble (ground
  rules) and the log's owed items — every non-Nothing `**Owed:**`
  paragraph, attributed to its entry — as `preamble` and `owed` in `--json`
  and as sections in the plain rendering. Required reading becomes O(epic),
  not O(history); the full log is read only when something in the brief
  sends you there. The owed ledger has explicit repayment syntax: a
  `**Resolves owed:** <ID> …` line (entry or dated addendum) closes the
  item entry `<ID>` recorded, and only unclosed items appear in the brief —
  whose heading says honestly what the list is ("recorded, not marked
  resolved"), since an unmarked discharge is invisible to a parser; the
  ticket skill instructs writing the marker, and appending it when a stale
  item is found.
- **The prose/behaviour review boundary is drawn at what a machine reads,
  not what looks harmless**: only documentation and code comments qualify
  for the cheap lane (quick's no-reviewer case, the ticket skill's lowest
  tier). Configuration, user-facing strings, CLI output and skill/agent
  Markdown all execute somewhere and price as behaviour; when unsure, it is
  behaviour.
- **Status entries are short** (ticket skill step 6): Built (1–3
  sentences), Mode, Tokens, Verified, Decisions (deviations only, "none"
  allowed), Owed. The **Files touched** line is dropped — git records it.
- **`Delivery: release | incremental`** — one preamble line replaces the
  two-line `Release mode:` / `Run mode:` declaration, which is removed
  outright (no compatibility parse; this repo's own three epic docs are
  migrated in this commit). `release` — tickets integrate into
  `epic/<name>` unattended, one human-gated release pull request;
  `incremental` (the default when absent) — every ticket its own
  human-gated pull request to the default branch. One line, one decision:
  the serial+autonomous contradiction is no longer declarable, so its
  refusal machinery (`modeContradiction`, the `find` error, the doctor
  fail) is deleted. Exposed as `delivery` in `find --json` and
  `list --json` (`releaseMode`/`runMode` are gone from both payloads);
  doctor warns on unrecognised values and near-miss shapes, and flags the
  retired labels by name so a preamble written in the old syntax is never
  silently ignored. Tickets suite lands at 36.
- **Release delivery is the recommended default for multi-ticket epics**
  (epic skill): the human's two decisions are plan sign-off and the release
  pull request — a human approving every intermediate PR is a scheduler,
  not a judge (the Q-10–Q-17 stacking record is the evidence). Bounded:
  ~3–6 tickets, days not weeks, a reviewable release diff — else split or
  go incremental. Interactive per-ticket execution is demoted to an escape
  hatch. The environment probes, waiver handshake, stop conditions and
  every merge rule are unchanged; the release PR body now states the
  release's diff stat up front.
- **`Worker model: <model>`** — an optional preamble line, parsed like
  `Reviewer model:`, pinning the model the implementing workers run on.
  Absent, the skills pass no model and every worker inherits the session
  that spawns it (supervisor or run driver) — so the default is unchanged,
  and the line is how a plan written on one model is implemented by another
  (e.g. plan on a stronger model, implement on a cheaper one). Exposed as
  `workerModel` in `find --json` and `list --json`; passed at both worker
  spawn sites (ticket step 0, run step 4c); covered by doctor's near-miss
  scan. Deliberately not a settings file: model choice lives in the
  versioned epic document, visible at sign-off.
- **A nit is not automatically a ticket** (ticket skill step 8): fixed in
  place when trivial and in scope, otherwise recorded in the addendum for
  the retro; it earns a ticket only by affecting users, real maintenance
  risk, recurrence, or riding an already-planned change.
- **Releases are batched** (this repo's own rule): every behaviour change
  still gets its changelog entry in the same commit, but version bumps now
  stamp deliberate batches instead of one number per change.
- METHODOLOGY.md records the reasoning and both reversals (quick's
  execution model, the serial default) with the token evidence; README and
  CLAUDE.md restate the changed doctrine in the same commit.

## 1.26.0 — 2026-08-09

Q-17: ticketless epics now get the `← this folder` marker (pre-existing,
found by Q-15's review).

- **`scripts/tickets.mjs`**: the shared `ticketlessLine` rendered a
  ticketless epic without the `← this folder` marker every ticketed epic
  gets — in a checkout whose root directory is named after a ticketless
  epic (exactly a freshly-cut epic's state, the one-checkout-per-epic
  convention the script reads), the unfiltered board showed the marker on
  no epic at all, while `current` answered correctly. The marker is now
  rendered by one `hereMarker(name, current)` helper shared by the
  ticketed and ticketless lines, so the two renderings cannot drift apart,
  and both ticketless boards — all-empty (Q-8's branch) and mixed
  (Q-15's) — carry it through the one shared line. `ticketlessLine` takes
  its arguments in the same order for the same reason a shared helper
  exists: a transposed call fails silently (undefined compared to an
  object renders no marker and raises nothing). Adjacent, sanctioned by
  Q-17's ticket: the dead false branch on the "Nothing left to start."
  line (unreachable — the empty board returns earlier) is removed; no
  output change.
- Tests: two repos, one named after its ticketless epic and one named
  after its ticketed epic, pin the marker on both sides of the shared
  helper — the empty-state line carries it on the all-empty and mixed
  boards alike, the ticketed header carries it in its own checkout, and
  each test's neighbouring epic stays unmarked. All pinned as composed
  lines to end-of-line, so the unmarked assertions prove absence too.

## 1.25.0 — 2026-08-09

Q-16: doctor's no-status.md hint now names both creation doors
(pre-existing, found by Q-13's review).

- **`scripts/tickets.mjs`**: the warning for a missing status.md said
  "created at sign-off by /flow:epic" — but the quick lane never runs
  `/flow:epic`; its log is created by ticket step 6, so between quick
  step 3 (plan committed) and the worker reaching step 6 the hint
  advertised a recovery unreachable from the state that triggers it. The
  message now names both doors, each as a command the reader can run:
  sign-off by `/flow:epic`, or the first ticket's status entry (ticket
  step 6, reached with `/flow:ticket <ID>` — the quick lane's only door).
- Tests: the full warning text is pinned verbatim on an epic without
  status.md, so neither door can silently drop from the hint.

## 1.24.0 — 2026-08-09

Q-15: the mixed board no longer omits ticketless epics (pre-existing, found
by Q-8's review).

- **`scripts/tickets.mjs`**: when at least one epic had tickets,
  `printBoard`'s per-epic loop skipped any epic whose tickets.md has no
  `## <ID> — …` sections yet — that epic was absent from the unfiltered
  board entirely, existing work reported as nonexistent at larger blast
  radius than Q-8's all-empty case. The mixed board now names each
  ticketless epic with its empty state (`<epic> — no tickets yet`), the
  same line the all-empty board prints — factored into one place so the
  two renderings cannot drift apart.
- Tests: a repo with one ticketed and one ticketless epic → unfiltered
  `list` names both, the ticketless one as its composed empty-state line;
  the ticketed epic's header and ticket rows still render.

## 1.23.0 — 2026-08-09

Q-14: preamble values no longer scavenge across newlines (pre-existing,
found by Q-7's review).

- **`scripts/tickets.mjs`**: the shared preamble parse (`grab`) put `\s*`
  around the label's colon, and `\s` matches newlines — so a value-less
  label line adopted the first word of the next paragraph: a bare
  `Run mode:` above prose beginning "Autonomous is not wanted here." parsed
  as `runMode: 'autonomous'` (verified live by Q-7's review). All three
  labels — Release mode, Run mode, Reviewer model — share the one parse, so
  the fix lands once for the class: `[^\S\n]*` in place of `\s*` anchors
  the value to the label's own line, and a value-less line now reads as
  absent (serial default / null).
- **doctor**: the near-miss warning already fired on a value-less label
  line but misdescribed the failure ("will not parse, so it silently
  defaults" — it parsed, into unrelated prose). With the value anchored
  that sentence is now true, and the hint names the missing piece: value
  on the label's own line, beside the existing label-at-line-start and
  no-formatting requirements.
- Tests: a value-less line under each of the three labels, each followed
  by a paragraph opening with a word the old parse scavenged into a live
  value, must read as absent — and each line is doctor-flagged with the
  corrected hint. A label split from its colon across lines (the markdown
  definition-list shape) also reads as absent, pinning the pre-colon side
  of the anchor, which the value-less shapes cannot reach (review fix).
  Tickets suite 29 → 30.

## 1.22.0 — 2026-08-09

Q-13: the status-log preamble is defined where creation is instructed
(pre-existing, found by Q-6's review).

- **`skills/ticket`** step 6 told a worker to create a missing status log
  but defined none of its content, and **`skills/quick`** step 4's spawn
  prompt named "the standard append-only preamble" — text that lived only
  in the epic skill's template, a document a mid-ticket worker never loads,
  so it would have had to invent one. Skills are self-sufficient: step 6
  now carries the exact preamble (the heading through the **Rules** block),
  the quick skill's spawn prompt points at step 6 — the step its worker
  already executes — and the epic skill's template names the coupling on
  its side, so the two copies move in the same commit (the risk-list
  precedent). The preamble's content is unchanged.
- **`skills/run`** step 2's sign-off gate no longer claims `status.md` is
  created only after the human approves — with step 6 a documented second
  door, that was a one-rule drift; the gate's evidence stands as presence
  on the remote epic branch, which the mid-ticket door (ticket branches,
  after a run has begun) cannot fake (review fix). The ticket skill also
  names which heading step 6 parses — the `###` entry heading, not the
  carried preamble's `#` title (review fix).

## 1.21.0 — 2026-08-09

Q-12: the retro mines in fresh context (user request at the autonomous
retro, 2026-08-08).

- **`skills/retro`**: `/flow:retro` mined the record in the invoking
  session — often the same session that planned or ran the epic, carrying
  exactly the opinions the retro should examine. It now has the supervisor
  shape the ticket lane already has: the invoking session resolves the epic
  (step 1), then spawns a fresh-context **miner** (new step 2) — a general
  agent, empty context — that reads the whole record and drafts the report
  and proposals (steps 3–5); the approval gate at the end of step 5 and the
  shipping in step 6 stay with the human's session, which shows the miner's
  report unedited and asks. The miner edits no files, creates no tickets,
  and never holds the gate. The supervisor fetches the epic's absolute
  paths from `tickets.mjs epics --json` — step 1's `list` output carries
  none — and hands the miner `ticketsDoc`, `statusDoc`, `repoRoot` (step
  3's git commands anchor to it), `contextDir` when present, and the
  default branch (review fix: the paths had no named source and `repoRoot`
  was missing from the handed set). Step 2 opens with a reciprocal guard so
  a spawned miner, reading the skill "exactly as written", never spawns a
  miner of its own (review fix; the ticket skill's step 0 precedent).
- **`README.md`** retro row and **METHODOLOGY.md** § "Why an epic ends with
  a retro" state the same rule with its reasoning, in the same commit (one
  rule, every statement moves together).

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
- **`skills/quick`**: the supervisor lane's hand-back sentence carries the
  same three items — model, effort, token figure (review fix: the rule was
  updated in one of its two statements, the drift the one-rule invariant
  forbids).
- **`skills/run` steps 4c and 6**: the run record template gains a
  **Tokens** slot on the same terms — per ticket (worker and reviewer) and
  the run's total of the known figures. The worker's spawn prompt has it
  report its reviewer's harness-reported figure, and the driver records
  each worker's — figures flow from hirer to record, since only the hirer
  observes them (review fix: the slot originally asked the driver for a
  figure it had no channel to obtain). The slot names itself a
  **restatement** of the ticket entries' figures, so an epic sum never
  counts it (review fix: it double-counted every autonomous ticket).
- **`skills/retro` step 4**: the report sums the epic's spend from both
  places the status log carries a figure — each entry's **Tokens** line and
  its addendum's `Reviewer tokens` (review fix: summing the Tokens lines
  alone silently dropped every reviewer) — skips run-record restatements,
  and names `unknown` entries rather than counting them as zero.
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
