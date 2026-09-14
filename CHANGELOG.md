# Changelog

The plugin is the methodology's distribution mechanism: a change to a skill is
a behaviour change in every project that installs it. This file is what makes
those changes deliberate and visible. Entries land in the same commit as the
change, under `## Unreleased` between releases; a release stamps the batch
with one version and date.

## Unreleased

- **A CHECK criterion must be red before its ticket is built**
  (`skills/epic/SKILL.md` "Rules that matter" and step 5,
  `agents/plan-reviewer.md`, `scripts/tickets.mjs` `parseChecks`, two new
  `CHECK shape` cases and the K-7 fixture in `tickets.test.mjs`, README,
  METHODOLOGY). A CHECK written at planning time and already green on the
  current tree proves nothing about the ticket and merges green whatever the
  worker builds. The planner now runs every CHECK it writes before sign-off,
  records the ledger in the draft (proven failing; could not run here and
  why), and shows it at the gate; the plan reviewer **re-runs** the runnable
  ones under a 60-second per-command bound, skips and names the rest, and
  reports as findings a CHECK that passes on the current tree, one whose
  command errors, and a ledger claim it cannot reproduce. The same rule
  retires the decorative whole-suite CHECK (`EXPECT: Tests:` passes on the
  pre-ticket tree too — six of groundhopper-foundation's eight CHECKs were
  this): the suite is a standing check reported under **Verified**, and a
  CHECK names the one test, assertion or fact the ticket turns green.
  `doctor` gains two shapes under its existing CHECK scan, each flagged with
  the sentence saying why it can never pass: `\\|` inside a quoted
  `node -e` / `sh -c` string (the quoting layer consumes one backslash, so
  grep receives a literal `|` — FND-2's `MobileSidebar` CHECK passed on every
  tree this way), and `grep` given both `-r` and `-c` in any spelling
  (recursive counting prints `path:count` per file, never a bare number —
  FND-6's printed `file:0` against an `EXPECT` of `1` and halted a live run
  on correct code). A sound single-file `grep -c` is not flagged, and the
  fixture carries GHF-1's to pin it. Both shapes ride the shared
  `parseChecks` problems list, so `check <ID>` fails the gate on them too.
  Doctor stays read-only: it never runs a CHECK.

- **A fix-bounds trip buys a re-review, not a halt** (`workflows/run-epic.mjs`
  resolve step and re-review, four new `bounds trip` cases plus the updated
  existing ones in `run-epic.test.mjs`, `scripts/check-invariants.mjs`
  `PHRASES` and one suite case, `skills/run/SKILL.md` steps 4, 5, 6 and 7,
  README, METHODOLOGY). Below the consequence tier the driver bounds-checked
  the review-fix diff in code and **halted** when it left those bounds. The
  first three live release epics tripped that gate three times, and all three
  were clean fixes: GHL-1 (66 lines, 18 of them a translation fan-out;
  merged by hand under a standing rule, no re-review), GHL-9 (119 lines;
  hand re-review, 41,368 tokens, **0 Important**) and GHL-10 (two files
  outside the reviewed diff — the two its own findings said were missing;
  hand re-review, 40,465 tokens, **0 Important**). Every one cost a human a
  resume, and twice the human's answer was to buy the pass the run could
  have bought itself. Now a trip spawns the same bounded re-review the
  consequence tier gets, priced at that tier, and merges on a clean one; an
  Important finding in it halts on **the Important-finding stop condition**,
  the same string the consequence tier's re-review uses, so the retro's
  classifier reads one class. Two narrower changes ride with it: files the
  review's own findings **name** now count as inside the bounds (GHL-10's
  trip was guaranteed — for the finding class "the deliverable named in
  scope was not produced" the fix is outside the reviewed diff by
  construction), and `STOP.fixBounds` now covers only the case that stays
  its own — a fix diff nothing could measure (no usable fix-diff facts, or a
  binary numstat), because re-reviewing an unmeasured diff proves nothing.
  The line budget is unchanged at 60. The record carries `fixBoundsTripped`
  beside `fixBoundsGated`, and the run record names the trip. Reversal, in
  METHODOLOGY: if a bounds re-review ever lets an Important defect reach a
  release pull request, the halt comes back — its first data point is
  redesign-foundation's FND-6, a test-motivated out-of-bounds fix a bounded
  re-review cleared and a later commit corrected. PR #42's `Fix bounds
  exclude:` line never reached the default branch (its merge commit
  `8ac3bef` sits only on `origin/addendum-gate-date`); this supersedes it
  for the halt, and whether the exclusion also lands is its own pull
  request.

- **Doctor flags the run records the spend ledger cannot read**
  (`scripts/tickets.mjs` doctor, `RUN_HEADING` and `parseSpend`, plus one
  test and a wider spend fixture; `skills/run/SKILL.md` step 6,
  `skills/doctor/SKILL.md`, `skills/spend/SKILL.md`, README). The first
  three live release epics wrote every run record's Tokens line as prose —
  the ledger's shape landed the evening those runs ended — and six of
  their fourteen run headings carried a qualifier after the date
  (`### Run — 2026-08-24 (resumed 2026-08-25) — halted`), which the strict
  heading did not read. `spend` therefore reported "no figure recorded"
  for every run ticket, indistinguishable from a run nobody measured. Now
  the heading accepts a parenthesised qualifier after the date (the shape
  real usage needed), `doctor` warns on a `### Run —` heading that still
  will not parse and on a run record whose Tokens line carries figures but
  no `<ID> worker=<n> …` group, and both warnings name the repair: a dated
  addendum beneath the record restating the figures as groups, never an
  edit. A labelled group names its own ticket, so the parser now reads it
  from any region — the repair can be appended at the end of the log,
  append-only, and still reaches the ticket it names rather than the entry
  it landed in (bare `worker=<n>` pairs and `Worker tokens:` phrases stay
  the enclosing entry's); the test proves the recovery works in the
  flagged state. And every h2/h3 heading now closes a parse region, so
  groups under a malformed heading are dropped rather than attributed to
  the entry above them.

- **Doctor probes the Codex runner's environment at planning time**
  (`scripts/tickets.mjs` doctor and four tests, `skills/doctor/SKILL.md`,
  `skills/run/SKILL.md` step 3, `skills/epic/SKILL.md` template). When any
  epic declares `Worker runner: codex`, doctor runs `codex --version` and
  looks for the credential where Codex itself keeps it — `auth.json` under
  `$CODEX_HOME` or `~/.codex`, or `OPENAI_API_KEY` — and fails with the fix
  (`npm install -g @openai/codex`; `codex login`, or a key piped into
  `codex login --with-api-key`) when either is missing, because a run that
  discovers this at ticket one halts with nobody there. An unrecognised
  runner value warns, naming the driver's refusal. Nothing is probed when no
  epic declares a runner. The plugin still handles no credential: it checks
  that Codex's own sign-in exists and nothing more. The shared test fixture
  gains a fake `codex` and a signed-in `CODEX_HOME` so the suite passes on
  machines and CI without Codex.

- **Spend is one command away, on the board, and live during a run**
  (new `skills/spend/SKILL.md`; `scripts/board.mjs` and its tests;
  `workflows/run-epic.mjs` and its tests; `skills/board/SKILL.md`; README).
  The ledger `tickets.mjs spend` derives had no door: a user had to know
  the node command. `/flow:spend [epic]` prints it, with commentary rules
  that forbid estimating or filling a figure the ledger lacks. The board
  page runs the same ledger beside `list --json` and gains a **Tokens**
  column — a figure with the per-role split as its tooltip, `?` for an
  unknown, `—` for nothing recorded, and the epic's recorded total with its
  unknown count in the counts line; an unreadable ledger drops the column
  rather than rendering a wrong one. And the driver now logs each
  integrated ticket's meter delta as it happens (`<ID>: spend — <n> output
  tokens by the runtime meter`, plus the Codex runner's own usage when a
  runner ran it), so an unattended run shows its cost while it runs instead
  of only in the record afterwards; with no meter it logs nothing, because
  unmetered is not zero.

- **A release epic can hand implementation to Codex** (`scripts/runners/
  codex.mjs` and its tests, `workflows/run-epic.mjs` worker step and
  `workerRunner` arg, `scripts/tickets.mjs` `Worker runner:` preamble line
  with doctor near-miss coverage, `skills/run/SKILL.md` steps 3–4,
  `skills/epic/SKILL.md` template, README). A new optional preamble line,
  `Worker runner: codex`, makes the unattended worker OpenAI's Codex CLI
  instead of a Claude subagent; the driver then spawns a fast-model shell
  proxy that runs the runner script and relays its JSON verbatim. The
  runner owns what the model must not — **git, entirely**: it fetches and
  creates the ticket branch before the run, launches `codex exec` in the
  workspace-write sandbox (where `.git` is read-only and there is **no
  network**), hands Codex the same scoped slice of the ticket skill a
  Claude worker gets (pointed at the skill file, since Codex cannot load a
  plugin skill by name), constrains the final message to the worker
  schema, commits everything Codex left in the working tree under an
  ID-prefixed subject (the tree must be clean at the start, or the runner
  refuses), and then reconciles the report with git — a claim of work that
  left no change is a document/code contradiction, a failed push is a
  halt, a BLOCKED branch is still pushed so its entry reaches the remote —
  before granting `branch-pushed` from the push it watched. The first live
  run on a real Codex session settled that split: Codex read the skill,
  reported in schema with its usage on record, and halted honestly at
  `git checkout -b` because the sandbox denied the `.git` write. Codex's own usage lands in the
  ticket record as `workerUsage`, observed by the runner, never reported by
  the model. An unknown runner value refuses the run rather than
  substituting an implementer the sign-off did not name. Every gate
  downstream reads git, so the reviewer, the CHECK re-run, the addendum
  check and the SHA merge are untouched. Eight runner tests drive it with
  a stub `codex` that speaks the real CLI's JSONL protocol and, like the
  real sandbox, never writes to `.git`; a live run on a
  signed-in account is the only test of the model's compliance, and the
  gates exist for the case where it does not comply.

- **Token spend is derived, like every other fact** (`scripts/tickets.mjs`
  new `spend [epic] [--json]` subcommand and tests, `skills/run/SKILL.md`
  step 6, `skills/quick/SKILL.md` step 6, `skills/retro/SKILL.md` step 5,
  README, `scripts/check-invariants.mjs` two new couplings). The log
  recorded figures in three shapes — an entry's `**Tokens:**` line, the
  addendum's `Worker tokens (implementation leg): <n>; Reviewer tokens:
  <n>` phrases, and a run record's prose — and the only reader was the
  retro, summing by hand, so spend was invisible until an epic closed and
  approximate when it was not. `spend` compiles one ledger per ticket and
  per role from all three, matching phrases over each entry's joined text
  (the house wrap splits `Worker tokens (implementation\nleg):`), with the
  last figure per role winning so a correction addendum overrides the
  entry it corrects. `unknown` stays unknown and a ticket with nothing
  recorded is reported as such, never as zero — the script derives, it
  never estimates, and it reads no transcript. The run record's Tokens
  line now has a machine shape, `<ID> worker=<n> reviewer=<n>
  disposition=<n> re-review=<n> proxies=<n>` per ticket, because that is
  the one place the run lane's figures exist; the quick skill names the
  `Reviewer tokens: <n>` phrase it already used; and the retro reads the
  ledger instead of the log. Two presence couplings hold the phrases to the
  parser.

- **The ticket skill is the procedure, not the argument for it**
  (`skills/ticket/SKILL.md`, roughly 4,600 words to 2,600). Every worker
  paid to load the whole essay before touching a file, and the imperatives
  sat inside their justifications — the "every constraint carries its
  reason" style, applied at paragraph length, was fighting the "skills are
  procedure, METHODOLOGY is reasoning" split. No step, gate, template,
  command or stop condition changed: steps 0–10 keep their numbers and
  contents (the driver's and supervisor's prompts key on them), the
  status-log preamble and entry heading are verbatim, the addendum prefix
  and the tier table's tier, model and effort values are intact,
  the consequence list and the hook's refusal message are quoted as before,
  and `check-invariants.mjs` passes unchanged. What went: the extended
  reasoning already carried by METHODOLOGY.md (review pricing, why release
  tickets open no pull request, why fixes are new commits), restated
  cross-references, and duplicated phrasing between steps 0 and 10. Each
  constraint keeps its reason as a clause. The other long skills (run,
  epic, quick, retro) are owed the same pass.
- **The run skill, same treatment** (`skills/run/SKILL.md`, roughly 6,300
  words to 3,300). Steps 1–7 keep their numbers and contents (the epic
  skill points at step 3's probes), the Workflow call block, the result
  shape, the run-record template and the release pull request body list
  are intact, and the ten stop-condition sentences in step 5 still match
  the driver's `STOP` strings word for word — verified by extracting them
  from `run-epic.mjs` and searching the skill. The largest cut is step 4's
  per-ticket walkthrough of the driver: the session launching the run never
  executes those bullets, the script does and its tests enforce them, so
  each now says what the step decides and what halts it, not how the script
  is built. Reasoning that METHODOLOGY.md already carries (why the loop is
  code, why release tickets open no pull request, why the re-review became
  a code gate) is no longer restated.
- **The epic, quick and retro skills, same treatment** (`skills/epic`
  roughly 3,900 words to 2,400; `skills/quick` 2,000 to 1,550;
  `skills/retro` 1,700 to 1,250). Step numbers are unchanged everywhere
  (quick's step 2 template and step 5 preamble, epic's step 3 page and
  step 4 review are referenced by other skills). Every template fence the
  invariant checker parses is intact: the `tickets.md` preamble with all
  six configuration lines and the printed `Worker model: opus` default, the
  `## <ID> — <short name>` and `## Q-<n> — <short name>` ticket headings,
  the `CHECK:`/`EXPECT:` lines, and the status-log preamble in all three
  copies. Quick's risk-trigger bullet list is verbatim, since the checker
  matches it against the ticket skill's consequence list. What went:
  restated reasoning (why the plan is reviewed, why quick moved
  in-session, why the era rollover exists — all in METHODOLOGY.md), the
  template's paragraph-length explanations of each configuration line,
  now one sentence each, and repeated cross-references. One correction
  rode along: the retro's mining heading said "five questions" while
  listing six; it now says six. The four short skills (review, doctor,
  tickets, board) were read and left as they are — each is already a
  procedure with no essay around it.

- **The merge gate matches a dated review addendum by shape, never by the
  run's pinned date** (`workflows/run-epic.mjs` resolve step,
  `skills/run/SKILL.md` steps 4-5). A live run halted a green ticket at
  midnight: the run pins `args.today` for cache stability, the disposition
  agent dated the addendum with the real day, and the resolve step's grep
  for the pinned value counted zero — "not reviewed on the record" for a
  ticket whose review was committed and pushed. The two dates diverge
  legitimately whenever a run crosses midnight, and the pinned-value match
  bought nothing: the awk narrowing to the ticket's own entries is the
  real check, since every earlier ticket's addendum carries the same dated
  shape under its own heading. The grep is now
  `grep -cE "Addendum — review — [0-9]{4}-[0-9]{2}-[0-9]{2}"` — the dated
  shape the ticket skill's step 8 requires, any value. Only the resolve
  prompt changed, deliberately: a halted run resumed with
  `resumeFromRunId` replays its cached prefix and re-runs live from the
  first edited call, so touching any earlier prompt (worker, review,
  disposition) would re-execute finished work on integrated tickets,
  while a re-run resolve is read-only and harmless.

- **The check runner survives noisy test output** (`scripts/tickets.mjs`
  `runChecks`). The first live run of the acceptance gate halted on a
  green ticket: a passing 68/68 jest run printed ~1.2 MB of Mongo logs,
  `spawnSync`'s default 1 MB `maxBuffer` killed the child with ENOBUFS,
  and the ledger saw a dead command — the fail-closed halt was correct,
  the capacity was not. The runner now carries a generous named cap
  (`CHECK_MAX_BUFFER`, 64 MB) alongside its timeout — never Infinity,
  so one pathological command cannot eat the machine's memory before the
  timeout fires — and an ENOBUFS that still occurs names itself in the
  evidence line with the fix (quieten the command) instead of a bare
  error message.
- **Acceptance criteria may be machine-runnable, and the run driver gates
  the merge on them in code** (`scripts/tickets.mjs` new `check`
  subcommand and doctor near-misses, `workflows/run-epic.mjs` new
  Acceptance step and stop condition, `skills/epic/SKILL.md` template and
  criteria rules, `skills/ticket/SKILL.md` step 5, `skills/quick/SKILL.md`
  step 5, `skills/run/SKILL.md` steps 4–5, `scripts/check-invariants.mjs`
  two new couplings). Adapted from unlazy's gate files after a comparative
  read. A criterion may carry an indented `CHECK: <command>` line with an
  optional `EXPECT: <text the output must contain>`; `tickets.mjs check
  <ID>` runs them from the repository root and reports a pass/fail ledger
  with the deciding output as evidence — a malformed CHECK fails the gate
  rather than silently never running, and doctor flags the near-miss
  shapes. Workers and quick tickets verify with the tool's ledger instead
  of their own reading of test output. In an unattended run the driver
  re-runs the checks against the pushed branch **after** the disposition
  (fix commits included) with `--from origin/epic/<name>` — the criteria
  as **signed off**, which no ticket branch can edit, closing the
  self-authored-gate hole the source idea carries — and code, not an
  agent, compares the counts; any failure is a new stop condition. This
  moves the last merge-relevant fact that was still taken on an agent's
  word (the worker's verification claim) to repository state. CHECK lines
  are optional: prose and *demonstrate:* criteria remain first-class, and
  a ticket without them passes the gate untouched.
- **Acceptance criteria may be runtime demonstrations, held to the
  evidence bar** (`skills/epic/SKILL.md` criteria rules,
  `skills/ticket/SKILL.md` step 5, `skills/quick/SKILL.md` step 5).
  Adapted from gstack's browser-QA step after a comparative read.
  Verification was command-and-counts only, which misses behaviour no
  test command reaches — rendered UI, interactive flows, a CLI's actual
  output. A criterion may now be written *demonstrate: <action> →
  <observable result>*; the implementing agent drives the real app (the
  project's run instructions, a real browser or simulator where the
  environment provides one) and records what it **observed** in the
  Verified line as evidence — the concrete screen or output seen, never
  "looks fine" — because tests prove what the code does, a demonstration
  proves what a user gets, and agent-built UI is where the two diverge.
  A demonstration the environment cannot perform is owed, like any other
  check. The rest of gstack was read and not adopted — its
  agent-side merge-and-deploy crosses the human-merge line, and its
  role-lens plan reviews cover ground the plan reviewer's checklist
  already walks.
- **Worker and reviewer models are chosen as a pairing, with two named
  profiles and a decision rule** (`skills/epic/SKILL.md` template, README,
  METHODOLOGY "Why review cost is tiered"). The template's Worker/Reviewer
  guidance now presents **capable-implementer** (`opus` worker, tiered
  review — gnarly code, thin specs) and **strong-judge** (`sonnet` worker,
  `opus` reviewer — the cheap implementer under a stronger judge, for
  well-specified tickets out of a clarified, plan-reviewed epic) as the
  two known-good pairings, decided from run-record evidence: Important
  findings per ticket and observed spend, which the driver records
  automatically. METHODOLOGY settles "the reviewer must be stronger than
  the implementer" as a profile, not a rule — review stays priced by
  consequence, the plan side is never cheapened, and the printed default
  (`opus` worker) moves only when a live ledger says so. No code change:
  both profiles were already expressible; the choice is now named,
  reasoned, and tied to its evidence.
- **The standing quick epic rolls over by era** (`skills/quick/SKILL.md`
  steps 2 and 5, `skills/retro/SKILL.md` steps 1 and 6, README,
  METHODOLOGY). Adapted from beads' compaction after a comparative read,
  reshaped to fit append-only: the quick epic never closes, so its log and
  ticket doc grow without bound and ride every quick branch and
  pull-request diff — `brief` fixed the read side, nothing fixed the carry
  side. The quick skill now signals when the log passes roughly 25 entries;
  `/flow:retro quick` performs the rollover behind the owed-conversion gate
  (an unconverted owed item would vanish from every future brief): the era
  is archived verbatim to `epics/_archive/quick-<date>` — nothing
  summarized, nothing rewritten — and a fresh quick epic continues the ID
  sequence with a `Q-IDs continue at Q-<n+1>` ground rule, because archived
  headings are no longer read and a reused number would read as already
  shipped off main's commit subjects. The rest of beads was read and not
  adopted; METHODOLOGY records the standing verdicts (stored-and-reported
  state vs derived; `bd prime` vs `brief`; the dependency graph stays
  removed, with the strict-parse shape noted for a future parallel lane).
- **Three Spec Kit-inspired planning refinements** (`skills/epic/SKILL.md`
  step 3 and template, `agents/plan-reviewer.md`, `skills/retro/SKILL.md`
  step 4, `scripts/plan-page.mjs` + test, METHODOLOGY). Adapted from
  GitHub's Spec Kit after a comparative read; each passed the admission
  test, and the rest of Spec Kit (constitution, analyze, in-session
  implement) was deliberately not adopted. One: a **clarify pass** before
  the shape checkpoint — the planner sweeps the brief for underspecified
  points by category and asks the user the questions whose answers change
  the shape, batched and bounded, recording every answer in the documents;
  questions that do not change the shape ride to sign-off as open
  questions. Two: an optional numbered **`Requirements:` preamble block**
  — the WHAT held apart from the HOW, written before slicing and never
  bent to it; the plan reviewer now walks it both ways (a requirement no
  ticket reaches, a ticket no requirement needs, requirements reworded
  toward the implementation), and the plan page renders it as its own
  numbered section. Deliberately part of the preamble, so `brief` hands
  every worker the WHAT its ticket serves. Three: a sixth retro mining
  question adapted from converge — the delta between the documents'
  promises and what git shipped, both ways, because a gap only the diff
  knows about is debt with no ledger entry.
- **All three roles' models configure in one place, and the configuration
  surface is documented as one table** (`scripts/tickets.mjs`,
  `skills/epic/SKILL.md` steps 3-4 and template, README). A new optional
  `Planner model:` preamble line pins the plan reviewer per epic (absent,
  the agent definition's pinned strongest model applies — the epic skill's
  step 4 now reads the line from the draft it just wrote, because
  configuration binds where it is read); it parses, is exposed in
  `find`/`list --json`, and is near-miss-scanned by doctor exactly like
  `Worker model:` and `Reviewer model:`. The epic template's configuration
  block now presents all six optional lines together — Delivery, the three
  model lines, Consequence paths, Ticket budget — and README carries the
  same six as a table: one place, one syntax, every near-miss flagged.
- **Release tickets no longer open pull requests — the merge is a verified
  SHA, and the release pull request is the epic's only one**
  (`workflows/run-epic.mjs`, `scripts/tickets.mjs`, the ticket skill's
  steps 0/9/10, the run skill, the epic skill's Delivery text, README,
  METHODOLOGY "Why release tickets stopped opening pull requests"). A
  per-ticket pull request in a release epic had no reader — the human's
  gate is the release pull request, and review reads the pushed branch —
  while adding three agent steps and a mutable indirection: a pull
  request's head and base can move between the driver's check and a merge
  by number (the external review's time-of-check finding). Now the worker
  stops at its pushed branch (`branch-pushed` replaces `pr-opened`), the
  resolve step reports `git rev-parse origin/<branch>` alongside the
  addendum count, and the merge agent runs a fixed sequence merging
  **exactly that SHA** into `epic/<name>` — a SHA cannot be retargeted, so
  the merged diff is provably the one the review and the fix-bounds check
  measured. The board's `integrated` state now derives from ID-prefixed
  commit subjects reaching `origin/epic/<name>` — the same mechanism as
  `shipped`, at the epic ref — with the old PR-merged detection kept for
  epics run before this change; the unattended path no longer needs `gh`
  for anything but the release pull request. Attended release tickets
  (ticket skill step 10) merge the same way, by the verified SHA. The
  trade is named in METHODOLOGY: per-ticket PR-triggered CI and a
  per-ticket discussion surface remain what incremental delivery offers.
- **CI runs the whole verification surface, and the run skill recommends a
  separate automation identity** (`.github/workflows/tests.yml`, CLAUDE.md
  Commands, `skills/run/SKILL.md` step 3). GitHub Actions now runs every
  suite, the invariant checker, doctor, and the syntax/parse checks — the
  same commands CLAUDE.md names, so local runs and the pull-request gate
  cannot drift apart. The run skill's environment checklist gains the
  shared-identity point an external review raised: when agents and humans
  authenticate as the same account, "human-only merge" binds accounts, not
  intentions — high-consequence repositories should run unattended epics
  under a machine identity with no permission to merge or push to the
  default branch. Environment setup like branch protection itself:
  recorded at sign-off, never enforced by the plugin.
- **A per-ticket token budget, enforced by the meter**
  (`workflows/run-epic.mjs`, `scripts/tickets.mjs`, the run skill's steps
  4-5). A new optional epic preamble line — `Ticket budget: 250000` (or
  `250k` / `1m`; an unrecognised suffix parses as absent and doctor flags
  it, because a bare digit grab would have read `250k` as a ceiling a
  thousand times too low) — rides `find`/`list --json` like the other
  configuration lines and reaches the driver as `args.ticketBudget`. The
  driver measures each ticket's pass against the workflow runtime's own
  `budget.spent()` meter — the one observer of spend no agent can
  misreport — records the delta in `ticketRecords[].outputTokensObserved`
  (with or without a ceiling: automatic per-ticket economics), and halts
  on a new stop condition, "a ticket's pass exceeding the epic's
  per-ticket token budget", **after** the merge is confirmed: nothing
  un-merges, so the overspending ticket stays integrated and the run
  stops before the next one. A budget the runtime cannot meter refuses
  the run at argument validation — a ceiling that silently cannot fire
  is worse than none.
- **The ticket reviewer is now blind and cannot edit; the plan reviewer
  cannot edit** (`agents/ticket-reviewer.md`, `agents/plan-reviewer.md`,
  METHODOLOGY "Why the reviewer is a separate agent"). From an external
  review of the workflow: `memory: user` is removed from the ticket
  reviewer — a cross-session casebook of defect patterns is a set of
  priors, and this judge's verdict opens a merge gate, so it now starts
  from nothing but its packet every time (the plan reviewer keeps its
  casebook: advisory input to a human gate, not a gate). Both reviewers'
  toolsets are restricted to `Read, Grep, Glob, Bash` — "you report, you
  never fix" was instruction alone while the agents held Edit and Write;
  now they structurally cannot edit a finding into agreement. Bash stays
  for `git show`/`git diff`, so this is narrower, not perfectly
  read-only, and the run lane's general-agent fallback reviewer is
  unaffected — one more reason the fallback is a fallback.
- **The plan's two human gates render as a styled page**
  (`scripts/plan-page.mjs` + `plan-page.test.mjs`, `skills/epic/SKILL.md`
  steps 3 and 5, README). The shape checkpoint and the sign-off previously
  arrived as chat text — the exact format in which a shape gets skimmed.
  The planning session now composes a JSON plan (schema documented in the
  script), renders it with a shipped, tested skeleton, and publishes the
  page as an artifact: outcome grid, delivery and areas, the ordered
  ticket list, the rejected alternative, the plan review's findings, open
  questions, and stage-appropriate steering guidance (shape: "bend it
  now", with examples quoting the plan's own tickets; sign-off: the
  release-mode warning that approval means unattended execution). One
  file path republished at both gates keeps one URL that evolves with the
  plan. Steering material, not record: the JSON and the page live in the
  session scratchpad and are never committed — `tickets.md` remains the
  record.
- **`/flow:board` renders the board as a published HTML page**
  (`skills/board/SKILL.md`, `scripts/board.mjs` + `board.test.mjs`,
  README). A zero-dependency renderer over `tickets.mjs list --json`:
  per-epic tables with state badges, delivery and this-folder tags,
  degraded-fact notes (gh unavailable, capped scan, duplicate IDs), and a
  Next-up list — published as an artifact and regenerated on every run.
  Deliberately a rendering of derived state, never a second store: the
  skill writes the page to the session scratchpad and forbids committing
  it, because a stored board is the hand-maintained mirror the plugin
  exists to avoid.
- **Epic planning stops at the shape before writing the document, and
  sign-off shows a rejected alternative** (`skills/epic/SKILL.md` steps 3
  and 5; METHODOLOGY "Why the plan is reviewed before sign-off"). The
  skill previously wrote the complete ticket document and then asked,
  which anchors: sign-off becomes yes/no on the only shape in the room,
  at the moment a re-split costs a rewrite. Step 3 now presents the shape
  first — the Outcome line, areas, delivery choice, and the ticket list as
  one line each — and waits for the user to bend it while a re-split still
  costs a sentence; step 5's sign-off additionally presents one
  considered-and-rejected decomposition with its reason, so approval is a
  choice between shapes rather than a ratification of the one shown.
- **The epic documents can stay out of the diff's way** (`.gitattributes`,
  README "The three documents", `skills/retro/SKILL.md` step 6). Two
  optional practices for keeping the default branch tidy without breaking
  what the documents are for: `epics/** linguist-generated=true` collapses
  them in pull-request diffs and language stats (collapsed is not hidden —
  the evidence trail still travels in the same pull request), and the retro
  gains an optional final step archiving a closed epic to
  `epics/_archive/<name>` — safe only after the retro has converted owed
  items to tickets and lessons to instruction files, because the board only
  discovers epics directly under `epics/` and archiving earlier would
  silently delete the debt ledger. Moving is not deleting: shipped
  detection reads commit subjects, never folders, and the standing quick
  epic is never archived.
- **The quick lane's reviewer gets a fixed, scoped packet — never the
  session's narrative** (`skills/quick/SKILL.md` step 6). The reviewer
  spawn previously said "give it the ticket section and the instruction
  files", which left the implementing session free to add its own summary
  of the work — and the session that implemented is exactly the biased
  narrator the fresh context exists to exclude. The packet is now fixed
  and mirrors the run driver's: the commit range, `tickets.mjs brief
  Q-<n>` (ground rules, scope, criteria, owed items), this ticket's own
  status entry sliced from the log by `awk` (never the whole quick log,
  which is long by design), and the touched areas' instruction files —
  with an explicit rule that no summary, reasoning or conversation content
  rides along: what the session believes about the diff travels only
  through what it committed, where the reviewer weighs it as the record,
  not as a voice.
- **The run driver floors the review tier in code — the reviewed party can
  no longer price its own judge down** (`workflows/run-epic.mjs`; the run
  skill's step 4; the ticket skill's step 7; `scripts/tickets.mjs`;
  `skills/epic/SKILL.md`; METHODOLOGY). The reviewer's model and effort
  were priced solely from the worker's self-reported tier: the driver
  guarded the malformed case (missing/unrecognised → consequence) but a
  well-formed wrong report — a code change called `prose` — bought the
  weakest review unchecked. The driver now runs a read-only fast-model
  step per ticket (`tier-facts:<ID>`, pinned like the other shell proxies)
  that lists the branch's changed files (merge-base diff against the epic
  branch, `epics/` excluded), and code computes a floor: docs-only files
  may keep `prose`, any other file floors at `normal`, and files matching
  the epic's new optional `Consequence paths: <glob>[, <glob>]` preamble
  line (parsed by `tickets.mjs` like the model lines, exposed in `find`/
  `list --json`, near-miss-scanned by doctor) floor at `consequence`. The
  review is priced at the higher of the worker's report and the floor —
  the report can raise the price, never lower it; whether machine-read
  markdown earns `normal` stays the worker's judgment, which only pushes
  up. An unusable file listing floors at `consequence` (missing facts
  raise scrutiny); a failed listing command halts like any other nonzero
  exit; an unsafe glob refuses the run at argument validation, because
  dropping it would silently lower scrutiny. `ticketRecords` gained
  `tierFloor`. Attended lanes are unchanged: there the tier is picked by
  the supervisor or session, which is not the party under review.
- **Reviewer models are named, never inherited** (`workflows/run-epic.mjs`
  `REVIEW_TIERS`; the ticket skill's step 7 table; the run skill's step 4;
  README). The `normal` tier now prices a named cost-efficient model
  (`sonnet`) at `high` instead of inheriting the session's model, and the
  `consequence` tier's prose names `opus` instead of "the strongest
  available" — a session launching a run is often the most expensive class
  there is, and routine review priced by that accident was the single
  largest avoidable cost in the lane. The epic's `Reviewer model:` line
  still overrides every tier. The plan reviewer moves the other way: its
  agent definition now pins the strongest model (`model: fable` in
  `agents/plan-reviewer.md`) — a wrong decomposition costs every downstream
  ticket, so that is where capability is spent.
- **The epic template defaults to `Worker model: opus`**
  (`skills/epic/SKILL.md`, README). Workers previously inherited the
  planning session's model; the template now pins a capable implementation
  model by default, so "plan on the strongest model, implement on a cheaper
  one" is the shipped shape rather than an option nobody declares. Deleting
  the line restores inheritance — as a decision, visible at sign-off.
- **The re-review runs only at the consequence tier; below it, fix commits
  are gated by code** (`workflows/run-epic.mjs`; the run skill's steps 4-7;
  README). Five live re-reviews at the normal tier all returned zero
  Important findings — reviewer-scale spend buying nothing — so the second
  model pass now runs only where failure is expensive. Below `consequence`,
  the reviewer reports the head it reviewed (`reviewedHead`, shape-verified
  in code), the read-only resolve step reads the fix diff anchored on it
  (`epics/` excluded, so the addendum commit never counts), and the script
  refuses to merge fixes that touch any file the review never saw or exceed
  a 60-line budget — a new stop condition, "a review-fix diff outside its
  bounds". A review that reports no usable head sends its fixes to the
  bounded re-review instead: doubt raises scrutiny, never lowers it.
  `ticketRecords` gained `reviewedHead`, `fixBoundsGated` and `fixLines`;
  the run record and release pull request body now state which of the two
  guards stood behind each ticket's fixes.
- **Fresh-context readers get scoped reads, not whole documents**
  (`workflows/run-epic.mjs` review packet and disposition prompt; the
  ticket skill's step 7). The reviewer is handed `tickets.mjs brief <ID>`
  and this ticket's own status entry sliced from the log (`git show … |
  awk`), never `tickets.md` and `status.md` whole; the disposition agent is
  told the entries above its ticket are not its reading. The status log
  grows without bound, so whole-document reads were the one per-ticket cost
  that compounded with epic length — the same O(epic)-not-O(history) fix
  the worker's brief already made, extended to the other two readers.
- **A clean disposition is priced clerical** (`workflows/run-epic.mjs`).
  When the review found no Important finding, the disposition agent — whose
  whole job is then writing the addendum, committing and pushing — is
  pinned to the fast model alongside the shell proxies, instead of
  inheriting the session's. Dispositions with findings to fix keep the
  inherited model at `high` effort.
- **The run record's Tokens line states phase subtotals**
  (`skills/run/SKILL.md` step 6). Alongside the per-ticket figures and the
  run total: workers, reviewers (re-reviews included), dispositions, and
  the shell proxies — the split every pricing decision about this lane
  actually reads, and the figure a bare total cannot provide.
- **Token figures are harness-observed, never self-reported**
  (`workflows/run-epic.mjs`; the ticket, quick, run and retro skills; new
  METHODOLOGY section "Why token figures are observed, never asked"). The
  schemas' `workerTokens`/`reviewerTokens` fields are gone, and no prompt
  asks any agent for a figure — an agent cannot see its own counter, so
  self-report produced `unknown` everywhere and, once, an invented number
  (flow-demo NOTE-1, corrected by addendum). Now: in supervisor mode the
  supervisor records the spend the harness reports when its worker and
  reviewer stop and hands both figures to the step 8 addendum; the quick
  lane reads the reviewer's figure the same way. In an unattended run,
  ticket entries and addenda read `Tokens: recorded in the run record`, and
  the session sums the run's own per-agent transcripts (`journal.jsonl` →
  `agent-<id>.jsonl`) into the run record's Tokens line — now the run
  lane's **only** token record, so the retro counts each ticket once, from
  wherever its lane recorded the figure, instead of skipping the run
  record as a restated view. `ticketRecords` entries lost `workerTokens`,
  `reviewerTokens` and `reReviewTokens`. The standing rule is unchanged
  and finally enforceable: harness-observed or `unknown`, never estimated.
- **New verification tool: `scripts/check-invariants.mjs`**, with its own
  suite (`check-invariants.test.mjs`, 9 tests — including proofs that each
  class of drift actually fails). The cross-document couplings the doctrine
  states but nothing enforced mechanically — the status-log preamble's three
  copies, the quick-gate/`xhigh` risk lists, the skills' heading templates
  against `tickets.mjs`'s parser regexes, the session guard's refusal message
  as the ticket skill quotes it, and a short list of load-bearing doctrine
  phrases — now have a script that exits 1 on any drift, re-deriving the
  parser regexes from `tickets.mjs` source so the two cannot diverge silently.
  Checks are presence and equality only; contradictions in meaning remain
  review's job. Dev-side only: no skill invokes it, and installed projects
  are unaffected.
- **`/flow:run`'s ticket loop is now a workflow script, not prose**
  (`plugins/flow/workflows/run-epic.mjs`, new; `skills/run` steps 4–7
  rewritten). The skill still owns the decisions: resolving the epic and
  refusing anything but `Delivery: release` (step 1), verifying the sign-off
  traces on `origin/epic/<name>` (step 2), the permission surface and the
  branch-protection probes with their 404/403 carve-out (step 3), and the
  ending — the run record and the release pull request, opened and never
  merged (steps 6–7). Step 4 now launches the script with the **Workflow
  tool**, passing the epic, default branch, repository root, plugin root and
  the date (a workflow script has no clock, no shell and no filesystem, so
  every mechanical fact rides in `args` or arrives through an agent it
  spawns). **The halt conditions are structural now**: each stop condition in
  step 5 is a code path that returns `{outcome: "halted", haltedOn}` and
  there is no code path that resumes past one, which is the whole point of
  the conversion — a prose loop can be re-read and reasoned past, a `return`
  cannot. The script refreshes `epic/<name>` between every ticket, spawns one
  fresh general-purpose worker per ticket with the load-bearing "A driver
  spawned you" prompt unchanged, and confirms `state === "integrated"` from
  `tickets.mjs find --json` rather than from any agent's report. It never
  reviews a diff itself, never opens or merges the release pull request, and
  never touches the default branch.
- **The driver hires the judge, and the merge gate is code.** The per-ticket
  sequence is refresh → next → worker → reviewer → disposition → merge →
  verify. The **worker** now runs a scoped slice of `flow:ticket` — steps 1–6
  plus step 9's push and pull-request open — and stops there; it never
  reviews or merges its own work, and it spawns nothing. The **script** hires
  `flow:ticket-reviewer` with a packet it assembles deterministically (the
  commit range computed from the ticket ID, since branches are the lowercased
  ID; the epic's `tickets.md` and `status.md`; the repository's instruction
  files) — never from the worker's narrative — and takes findings back as
  **structured data**: `important[]` with `file:line`, a confirmed/plausible
  label and the concrete failure, capped nits with an overflow count,
  pre-existing findings, and what was checked and found sound. Review price
  comes from the tier the worker reports for its own diff under the step 7
  table (`prose` → a fast model at `low`, `normal` → the session's class at
  `high`, `consequence` → the strongest at `xhigh`), with the epic's
  `Reviewer model:` line overriding the model; **a missing or unrecognised
  tier is priced as `consequence` — doubt goes up.** A separate cheap
  **disposition** agent fixes Important findings as new commits, re-runs the
  affected checks, and writes and commits the dated review addendum — it runs
  even on zero findings, because the committed addendum is a merge
  precondition. Then a cheap **merge** agent checks `baseRefName` is
  `epic/<name>` and merges with a merge commit, never a squash. **The gate is
  four code paths**: an unfixed Important finding halts, a failed disposition
  halts, an uncommitted addendum halts, and a wrong base halts as a
  contradiction — none of them reachable past.
- **This also dissolves the Agent-tool limitation** recorded earlier in this
  batch: nothing the script spawns needs to spawn anything, so the lane works
  on current Claude Code builds, which withhold the Agent tool from
  workflow-spawned agents. Reviewer-spawn failure now means the *script's*
  hiring failed — the `flow:ticket-reviewer` agent and then the sanctioned
  general-agent fallback both returned nothing — and the ticket's pull
  request stays open and unmerged.
- ~~Token figures are self-reported through schemas.~~ Superseded within
  this batch before any release carried it: the live campaign showed
  self-report produces only `unknown`s and guesses, so the fields are gone
  and figures are harness-observed — see the batch's first entry.
- **The ending no longer refreshes the epic branch a second time.** The loop
  refreshes before it asks what is left, so the pass that finds nothing left
  has already refreshed a branch carrying every ticket's merge; the result's
  `finalRefresh` reports it.
- **External-review hardening: the gate now reads repository state, not
  self-reports.** The lane's honest name is **code-controlled,
  agent-executed** — code decides, agents execute and report — so the checks
  that matter no longer take an agent's word for the thing being checked.
  (1) **The pull request is resolved mechanically**: the merge step runs
  `gh pr list --head <id lowercased> --base epic/<name> --state open`,
  requires exactly one match, verifies both refs from the response, and
  merges that number; zero, several, or a number the worker did not report
  halts as a contradiction — the worker's `prNumber` is now only a
  cross-check, and the script re-checks it after the fact too. (2) **Fix
  commits get one bounded re-review** before the merge, in the reviewer's
  re-review mode (no new nits, only Important findings and anything still
  unaddressed): the fixes are written after the review that approved
  everything else, so a merge without it merges an unreviewed diff. Any
  Important finding halts, and there is deliberately no second round.
  A clean review skips the step, so it costs nothing on the common path.
  (3) **The addendum is verified on the pushed branch** —
  `git show origin/<branch>:epics/<epic>/status.md | grep -c "Addendum — review — <date>"`
  — with the disposition's own flag kept as well, belt and braces.
  (4) **Pre-existing findings can no longer vanish**: they ride into the
  disposition prompt with the instruction to record each with a named owner
  (an existing ticket, or `retro` — the retro skill mines addenda), into
  `ticketRecords[].preExisting` and the result's top-level `preExisting`, and
  into the release pull request body the run skill's step 7 describes.
- **Second review pass, and what it caught** (fresh-context opus review of the
  branch; four Important findings, all confirmed, plus seven nits — all
  fixed). Two were behaviour, and both were gates that looked closed and were
  not: **the addendum check was vacuous for every ticket but the first** —
  release tickets branch from `epic/<name>`, whose append-only log already
  carries the previous ticket's addendum, so a date-only grep matched it and
  the check collapsed back to the disposition's self-report; it is now scoped
  by `awk` to *this ticket's own entries*, and re-checked in code after the
  merge reports success. And **the disposition's outcome is now cross-checked
  against the review it dispositioned**: "clean" against a review that raised
  Important findings, or "fixed" with no fix commits named (which would also
  skip the re-review), halt as contradictions — the driver holds the finding
  count, so it checks rather than reads. The rest: `gh pr list` no longer
  filters by base, so a pull request aimed at the wrong branch is *reported*
  instead of vanishing into a "no pull request" count; a reviewer return
  without a findings array is a failed hire rather than an approval (it was
  the one malformed-return path in the script that failed open); tier and
  stop-condition lookups use `Object.hasOwn`, so a reported tier of
  `toString` prices as `consequence` instead of `undefined`; every halt now
  quotes agent words inside the untrusted fence its contract already
  promised, with ids, refs, counts and enum values staying plain, and the run
  skill states that boundary exactly; the merge-conflict stop string is
  re-synced with the skill's bullet; and the ticket skill's step 10 now
  splits by spawn shape in so many words — a **driver**-spawned worker never
  reaches the merge, a **supervisor**-spawned one (the human escape hatch)
  performs the gate and the epic-branch merge — which step 0 had been
  pointing at while step 10 said only the first half. METHODOLOGY no longer
  claims the attended lane goes "one step further" on hiring the reviewer:
  both lanes share the shape now.
- **Third review pass: resolution is now checked before anything can merge.**
  The merge step resolved the pull request, checked the addendum and merged in
  one agent, so the code's cross-checks on its reported facts could only run
  *after* an irreversible merge — and two of them (the head and base refs)
  were never re-checked at all, which left a malformed report claiming
  `baseRefName: "main"` able to pass the coded gate. A merge toward the
  default branch is the plugin's one absolute prohibition and nothing
  un-merges it, so the step is split: a **read-only resolve agent** reports
  the addendum count and the pull-request listing, **the script judges every
  fact** — exactly one match, head equal to the ticket branch, base equal to
  `epic/<name>`, an addendum count of at least one, a number equal to the
  worker's — and only then is a **merge agent** spawned, with one command and
  a number it did not choose. A halt at resolution now means no agent capable
  of merging was ever created. The per-ticket spawn count goes 6 → 7 on a
  clean ticket (8 with a re-review); the post-merge belt-and-braces re-checks
  are gone, because pre-merge verification is strictly stronger.
- **The first live run caught an ordering contradiction the reviews did not**
  (flow-demo, five tickets, completed, 2026-08-11). The script's completed-run
  instruction told the session to write the run record *then* open the release
  pull request, while the run skill's step 7 and the record's own
  `Release PR:` field require the opposite — the field quotes the URL. The
  driver followed the string, wrote a **predicted** URL, and verified it
  afterwards; it guessed right, which is worse than guessing wrong, because
  nothing would have caught it. The string now says: open the pull request,
  then write the record quoting its real URL. On a halt, record-first stays
  correct — nothing was opened, and the field says so.
- **Re-review evidence survives the session.** The run record's Tickets line
  notes "re-reviewed after fixes: `<n>` Important" when one ran, its Tokens
  line carries `reReviewTokens` on the same harness-or-unknown terms, and the
  release pull request body states each ticket's re-review outcome — without
  which a human reads fix commits as unreviewed, which is exactly what the
  re-review exists to prevent.
- **A committed behavioural suite for the driver**
  (`workflows/run-epic.test.mjs`, 65 tests): it loads `run-epic.mjs`, strips
  the `export`, evaluates the module body the way the workflow runtime does,
  and drives it with stubbed agents — asserting the sequence, every gate
  branch and halt mapping, the review pricing, the fences, and the prompt
  text the gates depend on. No git, no network, no filesystem beyond reading
  the script. The harness that verified the two previous rewrites lived in a
  scratch directory; verification that is not in the repository is not
  verification.
- **Cheaper mechanics.** The refresh and the board read are one agent instead
  of two (the board is only worth reading on a just-refreshed branch), and
  the three shell-proxy agents — refresh+select, merge, verify — are pinned
  to a fast model: their whole job is running a fixed command sequence and
  echoing structured output, and every decision they could get wrong is
  re-checked in code. The worker, the reviewers and the disposition are not
  pinned: they reason, and they keep the tier table and the inherit rules.
- **Doctrine follows the restructure**, in the same commit: ticket skill step
  0 (a driver-spawned worker stops at its opened pull request; a
  human-invoked ticket of a release epic still ends per step 10 unchanged),
  step 7 (the driver hires the reviewer in an unattended run), step 9 (the
  sanctioned merge's surface is the epic branch — step 10, or the run
  driver's merge step), step 10 (a driver-spawned worker never reaches the
  merge); CLAUDE.md's merge invariant; README's `/flow:run` row and the
  reviewer section's new "the hirer is never the party under review"
  paragraph; METHODOLOGY's "Why the run loop is code, not prose".
- **`/flow:run` now requires the Workflow tool.** If it is unavailable the
  skill stops and reports; there is deliberately no prose fallback loop,
  because a fallback would restore the improvisation surface the conversion
  removed. One ticket at a time by hand with `/flow:ticket` remains the
  escape hatch.
- **`check-invariants.mjs` now watches the workflow script too**: the
  "A driver spawned you" handshake (ticket step 10 keys on it) is checked in
  `workflows/run-epic.mjs` alongside the two skills, and the script must
  carry the merge-direction phrase — load-bearing prose moved into code, so
  the drift checker follows it there. Both new invariants have negative
  tests (suite 7 → 9).
- **Review fixes** (fresh-context review, opus/high, 2026-08-11; one
  Important, five nits, all fixed): an **errored Workflow call is a recorded
  halt** — run skill step 4 now defines the third branch (no prose
  continuation, facts recovered from the board, error quoted as the stop
  condition), and the `/flow:ticket` escape hatch is scoped to
  nothing-launched only; worker-authored result fields (`built`,
  `verification`, `reviewOutcome`, a halt's `detail`) are **fenced as
  untrusted data on both paths** and the skill now says what the fences are
  and how to erase them deliberately; the script's `STOP` strings re-synced
  to the rewritten skill's step 5 wording; the worker `stopCondition` enum is
  derived from the `WORKER_STOP` map so the two cannot drift; the checker's
  workflow merge-direction guard anchors on the `NO_MAIN` prompt rule, not
  the meta description; README's permission surface names the Workflow
  launch and its inventory names the workflow script; METHODOLOGY gains
  "Why the run loop is code, not prose"; step 5 tells the session to clear
  an unaborted merge before committing a halt record.

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
