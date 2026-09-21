---
name: run
description: Run a release epic (Delivery: release) end to end with no human present — verify sign-off, loop its tickets in document order through fresh-context agents, halt on any stop condition, and end by opening the release pull request. Never merges toward the default branch. Use when the user runs /flow:run <epic>.
---

# Run epic $ARGUMENTS unattended

You are the **driver**. You decide whether the run may start (steps 1–3),
launch the loop (step 4), and record and report how it ended (steps 5–7).
**You never implement, review, or edit a ticket's files yourself**, and you
do not hold the loop: it is a workflow script this plugin ships,
`workflows/run-epic.mjs`, because an agent following a written loop can
improvise past a stop condition and a script has no code path that does.

The lane is **code-controlled, agent-executed**: the script decides what runs
next, what halts and what may merge; agents do the work and report through
schemas; and the gates that matter read repository state, not an agent's
account of it. The script hires each ticket's reviewer and never reviews a
diff itself — a driver that re-reviews every ticket becomes the context-laden
judge the fresh reviewer replaces.

The human approved this run at sign-off; their next decision is the release
pull request this skill ends by opening. **Nothing here ever merges, pushes,
or retargets toward the default branch** — the run's entire merge surface is
`epic/<name>`.

## 1. Resolve the epic and refuse the wrong ones

```bash
node "${CLAUDE_PLUGIN_ROOT}/scripts/tickets.mjs" list <epic> --json
```

Read `defaultBranch` and the epic's entry in `modes` — `delivery`, and the
declarations step 4 passes on (`workerModel`, `workerRunner`,
`reviewerModel`, `shadowReviewer`, `consequencePaths`, `fixBoundsExclude`,
`ticketBudget`, `parallel`). **Stop unless
`delivery` is `"release"`** — checked before anything mutates
`origin/epic/<name>`; an incremental epic is run by `/flow:ticket`, and an
unrecognised value is not a release declaration.

Stop and report too if:

- the epic does not resolve — list the epics the script knows;
- the working tree has uncommitted changes you did not make;
- any ticket is `in-progress`, `in-review` or `done` — a previous run died
  mid-ticket, and redoing or skipping half-finished work destroys the
  evidence trail. The recovery: finish that one ticket by hand with
  `/flow:ticket <ID>`, then re-run this command — § "Resuming after a halt"
  at the end of this skill carries the procedure and the reason;
- any ticket is `blocked` — a previous run halted on it, and `next` only
  hands out `todo` tickets, so starting now would build every successor on
  the blocked one. The human resolves or re-plans it first.

- **the plan's dependencies cannot be trusted** — run
  `node "${CLAUDE_PLUGIN_ROOT}/scripts/tickets.mjs" doctor --json` and refuse
  to start while it carries a row for this epic saying a ticket **"will wait
  for ever"** (a `**Blocked by:**` line that will not parse, an unknown ID, a
  self-reference, a cycle) or — **when the epic declares `Parallel:` 2 or 3**
  — that a line **"looks like a Blocked by line, and nothing reads it"** or
  that a ticket **carries a "Depends on" line** (the row goes on: "`(<what
  it names>)`, which nothing reads"). The
  first kind ends every run at the driver's `tickets still waiting` halt,
  after it has spent the run's tokens on the tickets that could start; the
  second is worse, because in a parallel epic a ticket with no readable line
  is *declared independent* and will be started beside the work it depends
  on. Both are fixed in `tickets.md`, committed and pushed to `epic/<name>`,
  before the run — the doctor row names the line. Refused here, in session,
  because the script has no way to run doctor;
- **the epic declares `Parallel:` 2 or 3 and the project's `epics/worktree.json`
  will not read, or would fail on this machine** — `git fetch origin
  epic/<name>` first (this check reads the pushed branch, and step 2's fetch
  has not run yet), then ask whether the branch carries the file, `git
  cat-file -e origin/epic/<name>:epics/worktree.json`, and only when it does
  (exit 0) run `git show origin/epic/<name>:epics/worktree.json | node
  "${CLAUDE_PLUGIN_ROOT}/scripts/worktree-setup.mjs" --validate - --repo
  "$(git rev-parse --show-toplevel)"`; refuse on a nonzero exit of that last
  command, with what it printed. It reads the file's shape and, against this
  checkout, the two failures shape cannot show: a `copy` file this machine
  does not have, and one git does not ignore. ("This checkout" is wherever
  the session sits, which is also the `repoRoot` the run copies from — in a
  linked worktree of your own, that worktree, not the repository's first
  checkout.) (Piped without
  the first check, an absent file reaches the validator as empty input and is
  refused as malformed JSON — a refusal of the one state that is fine.) Unchecked, the malformed file halts every ticket of the first wave
  at its worktree step, one launch too late. An absent file is not a refusal:
  the worktrees are bare and the workers are told so. Nor is `Parallel: 1`
  or no line at all — that run makes no worktree, never reads the file, and
  must not be refused over it;
- **a declaration line of this epic will not parse** — the same doctor run
  carries a row for `epics/<name>/tickets.md` saying a line "looks like a
  declaration line but will not parse, so it silently defaults". `Parallel:
  4` reads as *absent*, so `modes` hands you `parallel: null`, the script is
  never told, and the run goes serial where the plan asked for something it
  cannot have; a `Ticket budget: 250x` lifts a ceiling the same way. A run
  does what the signed-off document says or it does not start: fix the line
  on `epic/<name>` first;
- **the epic's last run record halted on "a failed acceptance CHECK after
  the merge"** and that halt has not been cleared. It un-merges nothing, so
  every ticket it names reads `integrated`, the board shows nothing wrong,
  and a plain re-run would find nothing left to start, call the epic built
  and open the release pull request for a combination the run itself proved
  broken. Read the last `### Run —` record in `runs.md`. If it halted on that
  condition, start **only when a dated line beneath that record says how it
  was cleared** — exactly one of these two shapes, which § "Resuming after a
  halt" shape 4 tells the human to write:

  `**Addendum — post-merge halt cleared — <YYYY-MM-DD>:** environment — <what the worktree lacked, and the check re-run by hand with its counts>`

  `**Addendum — post-merge halt cleared — <YYYY-MM-DD>:** fix ticket <ID> — <one line on what it repairs>`

  and, for the second, when `<ID>` is a ticket in `tickets.md` on
  `epic/<name>`. No such line: refuse, and say so with the record's heading.
  The line is the test, not your judgment of whether "something was done" —
  a refusal a session has to interpret is one it will interpret differently
  next time. Quote the line in the new run's record;
- `parallel` is 2 or 3 **and** `ticketBudget` is set — the script refuses the
  pair at launch (a per-ticket ceiling is a delta on one meter, and in a wave
  the delta is the wave's); say so now rather than let the Workflow call
  error. One of the two lines leaves the preamble.

`integrated` or `shipped` tickets are fine: re-running resumes after them.
`waiting` tickets are fine too — that is the plan working — as long as doctor
has nothing to say about why they wait.

## 2. Verify sign-off actually happened

```bash
git fetch origin --prune
git ls-tree origin/epic/<name> "epics/<name>/tickets.md"
git ls-tree origin/epic/<name> "epics/<name>/status.md"
```

Both must return output: the epic skill pushes the documents to
`epic/<name>` only after sign-off, so their presence there is the evidence.
Either missing: **stop**, say `/flow:epic <name>` has not completed its
sign-off, and do not create the branch or the documents yourself.

## 3. Check the environment the run depends on

An unattended run cannot ask, so everything it needs must exist before
ticket one. Report what is missing and stop.

- **The pre-authorized permission surface.** The session must already allow,
  without prompting: `git` (fetch, checkout, branch, merge, commit, push — to
  `epic/<name>` and ticket branches only), `gh` (`pr list`, and `pr create`
  for the release pull request only — no `gh pr merge` is ever run), `node`
  (this plugin's script and the project's own test and build commands),
  file edits inside the repository, spawning agents, and **launching the
  workflow in step 4**. A permission prompt firing mid-run is a stop
  condition: nobody is there to answer, and a run wedged on a prompt looks
  exactly like a run making progress. (The one exception is the shadow
  review's proxy, which records a prompt as a shadow failure — the trial
  gates nothing.)
- **The plugin's agent types — never a refusal.** The driver hires the
  reviewer by agent type (`flow:ticket-reviewer`), and only a session that
  has the plugin installed can spawn one. A session in which the plugin is
  **not installed** — the usual case being the plugin's own repository, with
  this skill executed from its source — has no such type, and the runtime
  answers every review hire by throwing `agent type 'flow:ticket-reviewer'
  not found`. The driver treats that as a failed hire and takes the sanctioned
  fallback (step 4), so the run continues; the cost is **one failed hire per
  review and per re-review**, and reviews done by a general agent given the
  reviewer's rules rather than by the reviewer agent, whose Edit and Write
  are structurally removed. That is a price, not a refusal: report it before
  ticket one so the run record can say whose reviews these were, and install
  the plugin first when you want the reviewer agent itself.
- **Branch protection on the default branch** — pull requests required, no
  force pushes, human-only merge. Probe it: `gh api
  "repos/{owner}/{repo}/branches/<default-branch>/protection"` succeeding
  signals classic protection; on a 404 **or 403**, check `gh api
  "repos/{owner}/{repo}/rules/branches/<default-branch>"` — rulesets are
  invisible to the first endpoint. Empty from both means unprotected. A
  **403 from both** means protection is unavailable on this plan (a private
  repository under a free-plan organization returns exactly this) — the
  same fact as unprotected. **Only a 404 or 403 from these two probes is a
  tolerated nonzero exit**; any other failure (expired `gh`, no network,
  rate limit, 5xx, wrong repository) answers nothing about protection and
  would kill the run later at `pr create`, so stop and report it.

  Protection is the hard floor that holds even against a misbehaving agent;
  the skills are soft enforcement. Missing or unavailable protection can be
  **waived only by a human, in advance**, as a **recorded decision, never a
  recorded finding**: prose in the epic's `tickets.md` (on the `Delivery:`
  line or under the ground rules — the document sign-off gates and step 2
  verifies) saying a human **chose to accept** running without the hard
  floor, e.g. "waived 2026-08-08: … the user chose to run without the hard
  floor". A line that only records what the probes returned is no waiver.
  Waiver found: proceed and carry it into the run record (step 6) and the
  release pull request body (step 7). None: report the probe results and
  stop.
- **The worker runner, when the epic names one.** `Worker runner: codex`
  hands implementation to the Codex CLI through the plugin's runner script
  (`scripts/runners/codex.mjs`). Before ticket one, `codex --version` must
  succeed and the account must already be signed in (`auth.json` under
  `$CODEX_HOME` or `~/.codex`, or `OPENAI_API_KEY` set) — the runner cannot
  sign in, and a missing binary halts the first ticket. `/flow:doctor`
  probes both whenever an epic declares the runner, so run it here and at
  planning time. Codex runs in its
  workspace-write sandbox, where `.git` is read-only and there is no
  network: the runner owns git entirely — it fetches and creates the
  ticket branch before, commits everything Codex left under an ID-prefixed
  subject and pushes after — so the model's write surface is the working
  tree, and `branch-pushed` is what the runner saw, never what the model
  claimed. The runner refuses to start over a dirty tree for the same
  reason: it commits everything it finds. The driver never runs a ticket as
  one blocking command: its proxy's shell tool kills any command after 10
  minutes, and a ticket gets the runner's 60-minute timeout. So the proxy
  runs `codex.mjs … --start` once, which launches the run detached from the
  shell (its own process group, its report written atomically to a state
  directory under the OS temp dir), then `codex.mjs … --wait` in slices of
  at most nine minutes until the report arrives, and at most eight times
  before it halts as `other`. The detached run outlives the proxy, so a
  proxy that stops without a delivered report first runs `codex.mjs …
  --cancel`, which stops the run's whole process group (runner and Codex)
  and reports what the working tree holds. A session or proxy that ends
  some other way can still leave that Codex run editing the repository's
  working tree — the one the session writes its halt record in (step 5) and
  resumes from — so **before touching the working tree after a halt on a
  Codex ticket, for the halt record or for resuming**, run that ticket's
  `--cancel` (the proxy's command with `--cancel` for its mode flag), or
  its `--wait` until it prints something other than `pending`. The runner
  refuses on its own to commit anywhere but its ticket branch, so a stray
  run cannot land a commit on `epic/<name>` — but its uncommitted edits
  would ride along into whatever the session commits next. A `--start` for
  a ticket whose run is still live, or finished with its report unread for
  at most ten minutes, attaches to it rather than launching a second Codex
  on the same tree, because two sessions would each commit the other's
  edits; anything older, delivered, cancelled or dead opens a new attempt.
- **The shadow reviewer, when the epic declares one — never a refusal.**
  `Shadow reviewer: codex` is a trial: it gates nothing, so nothing about it
  stops the run from starting. A `codex` that is absent or signed out is
  recorded per ticket as a shadow failure, and those tickets proceed exactly
  as they would without one.
- **The automation's identity — recommended, not required.** The run acts as
  whoever `git` and `gh` are authenticated as; when that is the human's own
  account, protection cannot tell agent from human. For high-consequence
  repositories, authenticate unattended runs as a separate machine identity
  with no permission to merge or push to the default branch. Environment
  setup, decided by a human, never enforced by the plugin.

## 4. Hand the loop to the driver script

Launch it with the **Workflow tool**; it runs the shipped script in its own
runtime while this session stays free:

```
Workflow({
  scriptPath: "${CLAUDE_PLUGIN_ROOT}/workflows/run-epic.mjs",
  args: {
    epic: "<name>",
    defaultBranch: "<step 1's defaultBranch>",
    repoRoot: "<the repository's absolute path>",
    pluginRoot: "${CLAUDE_PLUGIN_ROOT}",
    today: "<YYYY-MM-DD, from your own clock>",
    workerModel: "<modes[<name>].workerModel — omit the key when absent>",
    workerRunner: "<modes[<name>].workerRunner — omit the key when absent>",
    reviewerModel: "<modes[<name>].reviewerModel — omit the key when absent>",
    shadowReviewer: "<modes[<name>].shadowReviewer — omit the key when absent>",
    consequencePaths: <modes[<name>].consequencePaths — omit the key when null>,
    fixBoundsExclude: <modes[<name>].fixBoundsExclude — omit the key when null>,
    ticketBudget: <modes[<name>].ticketBudget — omit the key when null>,
    parallel: <modes[<name>].parallel — omit the key when null>
  }
})
```

Everything mechanical rides in `args` because a workflow script has **no
filesystem, no shell and no clock** — every fact it uses is fetched by an
agent it spawns. Pass the date and the two absolute paths, or the script
refuses to start.

**`parallel` is what makes a run go wide**, and absent (or `1`) the run is
the serial one it always was. With `2` or `3` the script works the board's
**ready set in waves**: it takes the first `parallel` tickets `next` hands out
— `next` has already left out every ticket whose `**Blocked by:**` blockers
have not landed, so two tickets in one wave are two the plan declared
independent — and runs their pipelines (worker through the resolve step's
gates) side by side, **each in its own git worktree** at
`<repoRoot>/../.flow-worktrees/<repo folder>/<epic>/<id>` (the id lowercased;
namespaced by the repository's folder because two projects under one parent
may both have an epic called `auth`), because every step of a pipeline
checks branches out and two cannot share a working tree. Then it integrates
them **one at a time, in document order**, whichever finished first: the merge
by verified SHA, the board's confirmation, and — for every merge after the
wave's first, which lands on an epic branch that has moved since the ticket
branched — **the ticket's own CHECK criteria re-run on the merged epic
branch**. Then it refreshes and asks the board again. Three things follow:

- **The worktree is fresh, and `epics/worktree.json` is how a project says
  what a fresh one needs.** A worktree has what git tracks and nothing else —
  no installed dependencies, no build output, no local `.env`. So the step
  that makes it (`worktree:<ID>`) then runs
  `scripts/worktree-setup.mjs`, which reads `epics/worktree.json` **as
  committed on the epic branch** — `{"copy": [".env"], "setup": ["npm ci"]}`
  — copies the `copy` files in from the main checkout and runs the `setup`
  commands inside the worktree. It refuses to copy a file git does not ignore
  (a copied secret would be one `git add -A` from a commit), and any failure
  halts that ticket before a worker is hired, with the worktree left in
  place and the recovery in the halt. **The whole setup has eight minutes**:
  the step is one shell call by a proxy whose tool kills a command at ten
  and loses its answer, so the script stops itself first and says so — a
  project whose install cannot finish in that time from a warm cache is not
  one to declare `Parallel:` on. A `Worker runner: codex` worker has no
  network at all, so for it this file — or packages vendored in the
  repository — is the only way a worktree gets
  dependencies. With no such file the worker is told
  the worktree is bare and installs what the project's instructions say — a
  guess made once per ticket, which is what the file replaces. What neither
  can reproduce (a running service) is still a criterion recorded as owed, or
  a BLOCKED ticket. Know this before declaring `Parallel:`.
- **The status log merges by appending, through the plugin's own driver.**
  Every ticket appends its entry to the end of `epics/<name>/status.md`, so
  two branches cut from one epic head conflict there on the second merge,
  every time. Before the first wave one setup step (`wave-setup:<epic>`)
  fetches the epic branch and makes `epics/<name>/status.md
  merge=flow-append` the rule git will actually use, in the repository's
  local `.git/info/attributes` — never committed, never pushed. It asks git
  (`git check-attr merge`) rather than grepping the file, appends the line
  whenever the answer is anything else, and **ends on that check**: in a
  gitattributes file the last matching line wins, so our line can be present
  and outranked by a broader rule below it or a stale `merge=union` — and a wave's merges name the driver on the
  command itself (`git -c merge.flow-append.driver='node
  …/scripts/merge-append.mjs --driver %O %A %B' merge …`), so nothing lands in the
  repository's config. The driver's rule is the file's own: both sides only
  appended, so the result is the base, then what the epic branch added, then
  what the ticket added, **each kept whole**; a side that edited a line
  instead is a real conflict and halts as one. **It is deliberately not git's
  built-in `union` driver**, which is line-level and emits a line both sides
  share once — two status entries share most of their tail, and under union a
  clean-looking merge moved one ticket's `**Owed:**` line under the next
  ticket's heading. The attribute line stays after the run and is inert: a
  merge that does not define the driver falls back to git's ordinary one.
- **A wave's merge checks its own result before it pushes**: between the
  merge and the push the sequence greps the merged `status.md` for the
  ticket's entry heading (as loosely as the board parses it), so a merged log
  that lost the entry — the shape every failure of a merge driver takes,
  since a driver that does nothing still exits 0 and git calls that clean —
  is never pushed. **The same line undoes the merge**
  (`git reset --hard ORIG_HEAD` — the branch as it stood before the merge,
  not `origin/epic/<name>`: a commit somebody made on the epic branch mid-run
  is on local and not on origin, and must survive): left on the local branch,
  the next run's refresh would find `pull --ff-only` "already up to date" and
  push it. The run halts on a nonzero exit whose detail says so; confirm with
  `git log --oneline -3` that the merge is gone, find out why
  `scripts/merge-append.mjs` did not run (`node` on the agent's PATH, the
  plugin path in the command), and re-run. It is **not** a merge conflict and
  there is nothing to `git merge --abort`.
- **After every merge onto a moved base, the criteria of EVERY ticket of the
  wave now on the epic branch are re-run** — the ones merged before it, then
  its own (`post-merge:<A>:after-<B>`, then `post-merge:<B>`). Re-running
  only the newcomer's would miss the commoner break: the later ticket passes
  its own checks and breaks an earlier one's. The halt names the ticket whose
  criteria broke and the merge that broke them. **The gate also refuses a
  changed criteria count**: it reads the criteria `--from` the epic branch
  *after* the merge, and a merged ticket may have edited `tickets.md` — so a
  ticket that had 2 CHECK criteria when it was accepted and has 0 (or 3) now
  is a halt, not "0/0, all passed". The reviewed party does not edit its
  gate, and a sibling does not edit it for them. **More than the count: the
  criteria themselves are read from a ref pinned when the wave began**
  (`refs/flow/wave-base/<id>`, written by the ticket's worktree step and
  dropped with the worktree) — never from `origin/epic/<name>`, which after
  the wave's first merge holds whatever merged tickets did to `tickets.md`. A
  count cannot see N criteria swapped for N weaker ones; the ref makes the
  swap irrelevant.
- **The post-merge check runs in the ticket's own worktree**, moved
  (detached) to the merged epic head — not in the main checkout, which never
  saw the dependencies the wave's workers installed. Its halt says to rule
  the environment out first: a sibling merged before it may have added a
  dependency that worktree does not have. **That worktree is the one a
  passed pipeline keeps**: it is where the failing check ran, it is detached
  (so it holds no branch and blocks no recovery), and the script logs its
  path with the command that removes it.
- **The meter is the wave's.** `outputTokensObserved` is `null` for a ticket
  that ran in a wave, and the script logs the wave's delta instead — which is
  why `parallel` and `ticketBudget` cannot be declared together. Step 6's
  per-ticket figures come from the transcripts, which are per agent whatever
  ran beside them.

**The run ends with the release check.** When the loop finds nothing left to
start and nothing waiting, the script does not return `completed` yet. A
ticket's `CHECK` criteria pass before *its* merge — and, in a wave, after
each merge of that wave — and then never again: not after a later wave's
merges, not after the last refresh merged the default branch in. So one
step (`release-list:<epic>`) fetches the epic branch, reports **the commit
the remote is at** — the one the pull request will carry, and another
session may have pushed since the last refresh — and the commit the main
checkout is at, which must be the same one (the list of landed tickets is
read from this checkout's document, so if the remote moved past it a ticket
another session landed would be released unchecked: the run halts and the
re-run's refresh brings it in); then it asks the board which
tickets have landed (`tickets.mjs check-epic <epic> --list`, the script's
own count beside the list, refused when they disagree). Then each landed
ticket's checks are re-run (`release-check:<epic>:<ID>` — the epic before
the ID, so the run meter reads these as overhead and not as that ticket's
work), one shell call per ticket, because a whole epic's suites in one call
can outlive the ten minutes a proxy's shell allows and a command killed
there loses its answer. Each reports the commit it ran at and whether the
tree was clean, and the script compares both in code: checks that passed at
another commit, or against uncommitted edits, are not evidence about this
release. **Where they run depends on where the tickets were built.** A
serial run built them in the main checkout, so its dependencies are there.
A parallel run built them in worktrees that are gone by now, and the main
checkout never saw what they installed — so a wave run makes one more
worktree, at the release commit (`release-worktree:<epic>`), sets it up
from `epics/worktree.json` exactly as each ticket's was, checks there, and
**leaves it in place** — its path rides in the result as
`releaseCheck.root` — because step 7's own `check-epic` needs the same
environment, and in the main checkout that mandatory second check failed
where this one had passed. Step 7 removes it. That covers tickets an earlier
run or a hand integrated too. Criteria are read from the checkout — the epic
head's own `tickets.md`, so a mid-epic re-plan counts; what differs from
sign-off is shown to the human in step 7's body, where someone who can tell
a re-plan from a dodge reads it. `COMPARE` criteria are not re-run (there is
no browser), and step 7 says so. The ledger rides in the result as
`releaseCheck` — `{head, root, tickets: [{id, total, passed, skipped}]}`,
`root` being the release worktree's path after a parallel run and `null`
after a serial one.

`ticketBudget` is the **launch-time** value, and the only one of these the
script does not keep: the ceiling is **re-read at every refresh** of the
epic's signed-off document. Concretely, each ticket's **resolve step** — the
read-only one, before the merge — **fetches the epic branch and reads the
signed-off document from it** (`git fetch origin epic/<name>`, then
`tickets.mjs find <ID> --json --from origin/epic/<name>`), reporting the
`Ticket budget:` line as it stands on that ref; the post-merge check compares
the ticket's spend against that number. So a raise a human commits and pushes
to `epic/<name>` while a ticket is running governs that ticket's own check.
Both halves are load-bearing. **The fetch**, because `--from` reads the local
remote-tracking ref and nothing else updates it between the ticket's start
and here — the run's only full fetch is in refresh+select, before the worker,
and the merge's `git pull --ff-only` comes after this read; without the fetch
the ceiling would be the one that stood hours ago. **`--from`**, because read
after the merge instead, the ceiling would come from the merged tree, where
the ticket branch's own copy of the preamble sets the number that judges it —
the same reason acceptance runs `check --from origin/epic/<name>`.
Everything else here (`reviewerModel`, `shadowReviewer`, `consequencePaths`,
`fixBoundsExclude`, the models) stays fixed at what you passed.

**What the script does**, per ticket, in document order (per *wave* under
`Parallel:` — above), until `tickets.mjs next <epic> --with-waiting` reports
nothing ready **and nothing waiting** — an empty ready list beside a waiting
ticket is a halt, not an ending:

- **Refreshes `epic/<name>` from the default branch and reads the board** in
  one agent. A conflict aborts the merge and halts — reconciling main with
  the epic is judgment the human did not delegate; a failed `--ff-only`
  halts too.
- **Spawns one worker**: a fresh general agent, empty context, on
  `workerModel` when set. Its prompt begins "A driver spawned you for this
  one ticket" — the phrase the ticket skill's steps 0 and 10 key on — and
  scopes it to steps 1–6 plus step 9's summary and push: no pull request, no
  review, no addendum, no merge, no agents of its own. The worker reports
  the **review tier** its diff earns (a missing or unrecognised tier prices
  as `consequence`) and writes its label (`worker:<ID>`) into the entry's
  **Mode** line. With `Worker runner: codex` the worker is the runner script
  instead, driven by a fast-model shell proxy that starts it once in the
  background and waits in slices inside its shell tool's 10-minute ceiling
  (step 3's worker-runner bullet says why), then relays its JSON verbatim;
  the runner reconciles the model's report with the repository (a claim of
  work over an empty branch is a contradiction, a failed push is a halt) and
  records Codex's own usage under `workerUsage`.
- **Floors that tier in code** from the branch's changed files, and reads
  the pushed head in the same step (one read-only fast-model listing,
  `epics/` excluded, plus `git rev-parse origin/<branch>`; that SHA is the
  review anchor, and an unusable one weakens nothing — a clean review needs
  none, and review fixes that cannot be measured from one halt): `Consequence paths:` matches floor
  at `consequence`, any non-documentation file at `normal`, docs-only may
  keep `prose`. The report can raise the price, never lower it — the
  reviewed party does not price its own judge down.
- **Hires the reviewer** — `flow:ticket-reviewer` on the `/flow:review`
  skill, with a packet the script assembles (the range
  `origin/epic/<name>...<reviewedHead>`, anchored on the SHA the tier-facts
  step read rather than on the worker's narrative or a branch name that can
  move; the `brief`; the ticket's own status entry; the instruction files),
  priced by the ticket skill's tier table with `Reviewer model:` overriding
  the model. It returns structured findings and its own reading of the head
  in the schema's `reviewedHead` (recorded as `reviewerReportedHead`, to keep
  it distinct from the driver's `reviewedHead` anchor) — a **cross-check**,
  logged when it disagrees, never the anchor itself: the party under review
  does not name the commit that was reviewed. A failed spawn gets one retry
  with the sanctioned fallback, then halts — and **a spawn that throws is a
  failed spawn too**: for an agent type the launching session never
  registered, the runtime does not return nothing, it throws `agent type
  'flow:ticket-reviewer' not found`, so a hire that throws is caught, logged
  with the error's first line, and takes the same one retry. The catch wraps
  the whole call, so any other rejection lands there too and is reported the
  same way — the reviewer **could not be hired**, with the error quoted,
  rather than a spawn failure the driver has not actually diagnosed. Nothing
  else in the script catches a throw from an agent spawn; an unhandled
  surprise must not look like a handled one.
- **Runs the shadow review, when the epic declares `Shadow reviewer: codex`
  and the ticket is priced at the consequence tier** (after the floor) — a
  trial that gates nothing. Right after the first review and before the
  disposition, a shell proxy runs `scripts/runners/codex-review.mjs` on the
  first review's own range and anchor, and its JSON lands in the ticket's
  `shadow` record (outcome, reason, Codex's review with its text fenced,
  model, effort, usage, duration). The runner gets `--timeout 540000`, a
  minute under the proxy's 10-minute shell ceiling, so a longer review
  records the failure `timeout` instead of dying without a report. Never at
  the normal or prose tier, never on a re-review, not without a verified
  anchor (`no-anchor`); a missing or malformed proxy report is
  `no-proxy-report`. It is blind both ways — nothing from it reaches any
  later prompt — and a shadow failure is never a stop condition. Its meter
  delta (`shadowSpend`) is left out of what the `Ticket budget` judges. An
  unknown `shadowReviewer` value is one log line and a run without a shadow.
- **Dispositions the findings** in another fresh agent: Important findings
  fixed as new commits (`<ID>: … (review fix)`), checks re-run with counts,
  pre-existing findings recorded with a named owner (`retro` when none
  fits), the dated review addendum appended per the ticket skill's step 8
  (ending `Tokens: recorded in the run record`), committed and pushed. **This
  runs even on a clean review**: the committed addendum is the merge
  precondition.
- **Re-reviews the fixes once, at the consequence tier** — Important findings
  only, any Important halts, no second round. Below `consequence` the fixes
  are gated in code instead: every fixed file must be in the diff the review
  saw **or named by one of its own findings** (a "the deliverable was not
  produced" finding is fixed outside the reviewed diff by construction), and
  the fix under a small line budget. Both fix-diff commands leave out
  `epics/` and the epic's optional `Fix bounds exclude:` globs, so a file a
  fix fans out into mechanically is invisible to the gate — translation
  catalogs are the canonical case: one new key touches every locale file, and
  the line count measures the catalog's width, not the fix's blast radius, so
  a pure fan-out neither halts nor buys a re-review. **A trip there buys the
  same bounded re-review at the consequence tier rather than halting** — all
  three live trips were clean fixes and each halt cost a human a resume — and
  an Important finding in that pass halts on the Important-finding condition
  like any other. That pass gets its own range, `<reviewedHead>..origin/<id
  lowercased>`: the fix commits were pushed after the anchor, so the first
  review's anchored range cannot contain them. That pass runs where the trip is detected: **after** the
  resolve step's bounds check and just before the merge, so a ticket that
  halts in `Re-review` with `fixBoundsTripped` had already passed its
  acceptance checks. **Fix commits with no usable anchor from the tier-facts
  step halt** on the added-files condition (step 5) before any re-review: the
  run cannot read what they added, and the pass they used to be sent to reads
  the whole branch — the one thing a swept tree is never handed to. Doubt
  still raises scrutiny; it just stops instead of hiring. A clean review
  skips all of this.
- **Re-runs the ticket's CHECK/EXPECT criteria from the signed-off
  document** — `tickets.mjs check <ID> --from origin/epic/<name> --json` on
  the pushed branch, after the disposition so fix commits are judged too —
  and gates in code on the ledger the script printed: its own `allPassed`
  verdict and its count of malformed CHECK lines, not the counts alone. A
  CHECK the parser rejects runs nothing, so `passed === total` is trivially
  true on it; reading the verdict is what keeps a criterion nobody can
  satisfy from merging. A ticket with no CHECK criteria passes untouched.
  The same ledger reports the ticket's **`COMPARE` criteria** in their own
  `compares` list — comparisons the script never runs, because it has no
  browser — and the driver carries that count to the resolve step, where it
  meets the other half.
- **Resolves the merge inputs read-only, and the code judges them before a
  merging agent exists**: the pushed log narrowed to **this ticket's own
  entries** must carry a dated `Addendum — review —` line (matched by shape,
  never by the run's pinned date, which diverges when a run crosses
  midnight), and `git rev-parse origin/<branch>` must yield a head SHA of
  the right shape. The same step **fetches the epic branch and reads the
  signed-off document from it** for the per-ticket ceiling
  (`git fetch origin epic/<name>`, then `tickets.mjs find <ID> --json --from
  origin/epic/<name>`) — that ref and not this branch's copy of the document,
  so the party under review cannot raise the ceiling it is judged by, and
  fetched first because the local ref is otherwise as old as the ticket. A
  fetch writes refs and nothing else, so the step stays read-only in the
  sense that matters: no merge, no checkout, no file changed. It also reads
  **the departures the pushed entry records** (`tickets.mjs deviations <ID>
  --log-from origin/<branch> --json`) — its own subcommand and its own flag,
  never `find --from`, so the one proxy reading both facts cannot answer
  either from the other's JSON; `--log-from` reads the log at the commit this
  run would merge, not the checkout, and **a count above zero halts**,
  whatever closure the entry claims. And it reads **how many `**Compared:**`
  tables that same entry records** (`tickets.mjs compared <ID> --log-from
  origin/<branch> --json`) — a third subcommand with a third field name, for
  the same reason: one proxy reading three facts must not answer any of them
  from another's JSON. A ticket whose signed-off section carries a `COMPARE`
  and whose pushed entry records no comparison halts on the acceptance-check
  condition; a `compares` or `compared` fact that is missing or the wrong
  type halts there too, because read as zero it would skip the gate exactly
  when the gate is needed. A reported ceiling that is not a positive
  integer, or missing altogether, halts on the contradiction condition; a
  reported `null` **keeps the last ceiling in force and logs it**, because a
  line that stopped parsing (`**Ticket budget:** 600k` parses as null, and
  the run never runs doctor) must not lift a ceiling silently; a ceiling
  declared where the runtime has no meter is refused exactly as launch
  refuses it. A failure here merged nothing.
- **Merges** by a fixed git sequence on that SHA: checkout `epic/<name>`,
  `pull --ff-only`, `git merge --no-ff <headSha>`, push. The SHA, so the
  merged commit is exactly the one verified; a merge commit, never a squash,
  because the release pull request needs every ticket's subjects. The one
  sanctioned agent merge, epic branch only.
- **Verifies** with `tickets.mjs find <ID> --json`: `state` must read
  `integrated`, derived from the subjects reaching `origin/epic/<name>`.
  Anything else halts.

**What it returns** — the run record's raw material, and the only thing that
enters your context from the loop:

```
{ outcome: "completed" | "halted",
  haltedOn: null | { stopCondition, ticket, where, detail },
  ticketRecords: [ { id, title, branch, workerAgent, workerModel,
                     tier, tierReported, tierFloor, tierWhy,
                     reviewerModelUsed, reviewerEffort,
                     importantCount, nitCount, nitOverflowCount,
                     preExistingCount, preExisting, preExistingRecorded,
                     findings, checkedAndSound,
                     fixedCommits, notFixed, disposition,
                     dispositionRecovered,
                     reReviewRan, reReviewImportantCount,
                     reReviewFindings, reviewedHead,
                     reviewerReportedHead, fixBoundsGated,
                     fixBoundsTripped, fixBoundsExclude, fixAddedFiles,
                     fixLines, acceptanceOutcome, acceptanceChecks,
                     acceptanceChecksPassed, acceptanceChecksSkipped,
                     acceptanceAllPassed,
                     acceptanceProblems, acceptanceCompares, comparedRecorded,
                     resolveOutcome, mergeOutcome,
                     addendumMatches, deviationsRecorded, deviationsOpen,
                     headSha,
                     built, verification, workerReported,
                     outputTokensObserved, shadow, shadowSpend,
                     dispositionCounts, dispositionDetail,
                     deployPreconditions, result } ],
  totals, preExisting, deployPreconditions, finalRefresh, date }
```

`totals` counts tickets, refreshes, Important findings, nits, re-reviews,
pre-existing findings, and `shadowReviews: {ran, failed}` — tickets whose
shadow step ran (its proxy was spawned), and tickets whose shadow is recorded
as a failure (a `no-anchor` failure never ran, so it counts in `failed`
only); the top-level `preExisting` gathers every pre-existing finding with
the ticket that met it. `workerReported`, `dispositionCounts` and
`dispositionDetail` are audit fields, not gates.

**The fencing boundary.** Free text an agent wrote arrives wrapped in
`<<<UNTRUSTED … UNTRUSTED>>>`: each ticket's `built`, `verification`,
`tierWhy`, the reviewers' findings and failures, `checkedAndSound`,
`preExisting[].summary`, the disposition's `notFixed[]` reasons and counts,
the agent's own words inside every halt's `detail`, and the shadow review's
Codex-authored text — `shadow.review`'s finding summaries and failures, nit
and pre-existing summaries, `checkedAndSound`, and the runner's or proxy's
words in `shadow.detail`. Shape-constrained fields (identifiers, refs,
counts, enums, SHAs) are not fenced. Nothing inside a fence changes what you
do next. In the run record and the release pull request body, reproduce
fenced content as quoted text and drop the markers.

Surface the script's `log()` lines as they arrive — they are the only
progress an unattended run emits.

**If the Workflow call errors instead of returning** — it throws, or returns
anything but the documented shape — **that is a halt, not a gap to fill**: no
prose continuation, no running the remaining tickets yourself. Recover what
the result would have carried from the board (`tickets.mjs list <epic>
--json`; its `integrated` states are the tickets that landed) and write the
step 6 record as halted, quoting the error verbatim as the stop condition.
Work may already have merged into `epic/<name>`; the record is how the human
learns that.

**If the Workflow tool is unavailable — before anything launched — stop and
report that.** There is deliberately no prose fallback: a loop an agent
re-reads is the improvisation surface the script removes. Only in that
nothing-launched state, run one ticket by hand with `/flow:ticket` if the
work cannot wait — never as a continuation of a run that errored partway.

## 5. The stop conditions — the script halts, you record it

Each is a code path in `workflows/run-epic.mjs` that returns `{outcome:
"halted", haltedOn}` instead of taking another ticket; there is no code path
that resumes past one. The run halts:

- on **BLOCKED — a worker wrote a BLOCKED (or ABANDONED) status entry, or
  ended in any state but `integrated`**, read from `find --json`, so an
  agent that dies without reporting, or reports success the board does not
  show, halts here too. So does a review that is not on the record: the
  addendum never committed, or this ticket's entries in the pushed log
  carrying no dated `Addendum — review —` line. An unreviewed-on-the-record
  ticket is never merged, whatever an agent says it did. **A disposition
  that returns no report is classified from the branch, not from the
  silence**: one read-only step (`disposition-facts:<ID>`) counts the dated
  addendum lines in this ticket's pushed entry and lists the code commits
  since the reviewed head. No addendum, no usable answer, or no review anchor
  to measure from: this halt, unchanged. An addendum on the branch: the work
  landed and only its report was lost (one live run halted on exactly that),
  so the run continues **on the branch** — any code commits take the bounded
  re-review at the consequence tier whatever the ticket's own tier, with the
  first review's Important findings in that reviewer's packet, because it is
  then the only check that they were fixed; Important findings with no code
  commit after the reviewed head halt on the Important-finding condition.
  The record says so (`dispositionRecovered: true`, `disposition: "recovered
  from the branch"`), and nothing on this path merges without that re-review
  having run;
- on **an Important review finding it cannot fix** — accepting a not-fixed
  Important is not an agent's to decide in an unattended run, so the
  disposition reports it and the run stops for a human. The same halt fires
  when the bounded re-review finds an Important in the fix commits — the
  consequence tier's own pass, or the one a fix-bounds trip buys; there is no
  second fix round, and one stop string keeps the two one class;
- on **a review-fix diff the run could not measure — no usable fix-diff facts
  from the resolve step, or a fix whose changed lines cannot be counted; an
  unmeasurable fix is never merged** — the one case the bounds gate still
  halts on, because a re-review of a diff nothing measured proves nothing.
  What it measures is the fix diff minus `epics/` and the epic's `Fix bounds
  exclude:` globs, which sign-off approved as mechanical fan-out;
- on **a review fix that adds files where the ticket never worked — a fix
  commit created a file outside every directory the reviewed diff touched or
  a finding named, or the run could not read which files the fix commits
  added; that is the signature of a swept working tree, and it is never
  handed to a reviewer to read**. "Could not read" includes the run that has
  **no review anchor** to measure the fix commits from: it halts here rather
  than sending them to the re-review as it once did. Read at every tier, right after the
  disposition and before any re-review is hired (`fix-added:<ID>`): one live
  run's disposition agent committed every untracked file in the working tree
  — 215 files, 1.9M lines — as a "review fix", and the only gate that met it
  would have *bought a re-review* of them. A fix rightly adds a test beside
  the code it fixes, so the rule is about where: "under" a reviewed directory
  is a path prefix, except at the repository root, where a reviewed file
  admits only other root-level files (nearly every ticket touches a
  changelog, and a prefix rule there would admit the whole tree). Inside
  those directories a new file keeps the bounds gate's consequence — a trip
  buys the re-review. **Recovery**: `git show --stat
  <reviewedHead>..origin/<branch>`; if the sweep is real, revert it as a
  **new** commit on the ticket branch (never a rewrite — the review must stay
  auditable against what was reviewed), then finish the ticket by hand per §
  "Resuming after a halt", case 2. The record's `fixAddedFiles` lists what the
  fixes added on every ticket, stray or not, so the retro can count how often
  a fix adds anything;
- on **a failed acceptance CHECK — a machine-runnable criterion whose
  command did not produce its expected result on the pushed branch, a
  criterion whose evidence is a skip, a CHECK line too malformed to run at
  all, a COMPARE criterion whose pushed entry records no comparison, or an
  acceptance report the gate could not read** — the gate reads the
  ledger's `allPassed` verdict, so a malformed CHECK line halts even when
  every runnable check passed (it never ran, and a criterion nobody can
  satisfy is a failed one), and a criterion the ledger marked `↓ skipped`
  halts for the neighbouring reason: its command exited 0 while the work it
  names never ran, and **a skipped check is not a passed one**. A `COMPARE`
  criterion halts on the same string for the same reason one door along: the
  script never runs a comparison (it owns no browser), so the
  `**Compared:**` table in the pushed entry **is** the evidence, and a
  criterion whose evidence nobody produced is a criterion nobody performed.
  An unreadable report — missing counts, missing verdict, missing problem
  count, a missing `compares` or `compared` fact — halts on
  the same string. All five are one class, so a retro reading the stop string
  alone files the halt correctly;
- on **a document/code contradiction — reported by a worker, or met by the
  script's own checks**: a ticket ID off the plugin's shape, a board that
  hands out the same ticket twice, a board reporting success without a
  ticket list, a disposition whose story does not match the review it
  dispositioned, a resolve step with no usable head SHA, or a ticket budget
  the resolve step reported as missing, unusable, or unmeterable. All of
  those are checked before the merge command exists, so the halt merged
  nothing. One member of this class is not: the **ticket-count cap** (40
  tickets in one epic, past any release epic's size) fires between tickets,
  after the ones before it have merged, and they stay merged — nothing
  un-merges, here or anywhere;
- on **a recorded deviation — the ticket's pushed status entry carries a
  `**Deviation:**` line, closed or not, because nobody present in an
  unattended run could have closed it; the run asks rather than records** —
  read at the resolve step, after the review and before any merge agent
  exists, with `tickets.mjs deviations <ID> --log-from origin/<branch>
  --json` on the branch the run would merge. The gate counts **every**
  departure the entry records and honours no closing line: only a human
  closes a deviation, and the only parties who could have written one on that
  branch are the worker and the disposition agent, both under review. So a
  departure an agent already fixed halts too, recorded as fixed in the
  addendum — the halt is what hands the accept-or-fix decision to the person
  who owns the outcome. A deviations fact that is missing, the wrong type,
  negative or about another ticket halts on the contradiction condition like
  every other unreadable resolve fact, and a command that exited nonzero is
  never read as a count of 0: an unreadable status log is not "no
  deviations". § "Resuming after a halt" carries the recovery;
- on **a merge conflict — refreshing the epic branch, or anywhere else,
  including a ticket branch that will not merge into the epic branch**;
- on **reviewer-spawn failure after the sanctioned fallback also fails** —
  the script's own hiring, for the review and the re-review alike; the
  ticket's branch stays pushed and unmerged;
- on **a permission prompt firing mid-run** — the script's agents report the
  prompt rather than wait on it (except the shadow review's proxy, whose
  prompt is a recorded shadow failure, never a stop);
- on **a ticket's pass exceeding the epic's per-ticket token budget** — only
  when the preamble declares `Ticket budget: <n>` (output tokens, metered by
  the runtime, less the shadow review's own step; the script refuses to
  start if no meter exists). Checked
  **after** the merge is confirmed, because nothing un-merges: the ticket
  stays integrated and the run stops before the next. The ceiling it uses is
  the one the resolve step fetched and read off `origin/epic/<name>` a moment before the
  merge, not the launch-time `args` value — so the halt's advice to raise the
  `Ticket budget:` line is advice that works inside the same run, provided
  the raise is committed and pushed to the epic branch. Each ticket's meter
  delta lands in `outputTokensObserved` either way, including on a halt whose
  subject is the spending;
- on **tickets still waiting and none that can start — every unstarted ticket is held by a `**Blocked by:**` line whose blocker has not landed, or by one that cannot be read; the epic is NOT built, and no release pull request is opened** —
  the script asks the board for both lists (`next <epic> --with-waiting`) and
  refuses in code, because to the loop an empty ready list otherwise means
  "open the release". The halt quotes each ticket's reason. A blocker that is
  `blocked` or unmerged is finished or re-planned; a line that cannot be read
  is fixed in `tickets.md` — step 1's doctor check exists so this halt is
  rare;
- on **a failed acceptance CHECK after the merge — a ticket merged onto an epic branch that had moved since it branched, and its signed-off criteria no longer pass on the combination; the ticket stays merged and nothing further starts** —
  waves only. The tickets of a wave were reviewed and accepted against the
  epic branch as it stood when the wave began, and the plan declared them
  independent; this is where that declaration is checked. Like the budget
  halt it un-merges nothing. The repair is forward: a ticket that fixes the
  combination on `epic/<name>`, and a `**Blocked by:**` line on the later of
  the two so the plan stops claiming what the run disproved;
- on **a failed release check — every ticket is merged, the epic branch carries the default branch, and a landed ticket's acceptance CHECK no longer passes at that head; nothing un-merges, and no release pull request is opened on evidence that went stale** —
  the run's last gate, and the only one that judges the thing being released
  rather than a ticket on its way in. It names the ticket whose check broke,
  which is rarely the ticket at fault: something that landed after it, or
  the default branch, changed what it built. The repair is forward, and
  "Resuming after a halt" shape 5 says where it goes — a ticket added to
  this epic's `tickets.md`, or a fix on the default branch first — and
  **re-running `/flow:run <epic>` is what clears it**: that run builds
  whatever was added and then makes this check again. No addendum
  is owed, unlike the post-merge halt, because nothing about the board is
  misleading in the meantime: no release pull request exists. After a
  parallel run the check ran in its own worktree
  (`../.flow-worktrees/<repo>/<epic>/release`), which a halt leaves in place:
  look there and not in the main checkout, and rule out the environment
  first — a project with no `epics/worktree.json` gets a bare worktree, and
  every check that needs a dependency fails there — and remove it
  (`git worktree remove --force <path>`) before the re-run, which makes its
  own and halts on a path that already exists;
- on **a nonzero exit from any command the run issues as a step, except
  those this skill explicitly marks tolerated** — the one tolerated shape is
  a 404 or 403 from step 3's protection probes, which run in session before
  the script starts.

**A halt inside a wave.** A pipeline that halts does not un-pass its
siblings: they cleared every gate a serial run has and are independent by the
plan's own declaration, so they are integrated, in document order — and
**then** the run halts, and nothing new starts. **`haltedOn` is an
integration halt when there is one** (a merge conflict, a failed post-merge
CHECK) — it is the halt that touched the shared branch — and otherwise the
first pipeline halt in document order; every other halt rides in
`alsoHalted`, and the run record quotes each. **Read `alsoHalted` as
carefully as `haltedOn`**: "a conflicted merge was not aborted" is an
instruction wherever it appears. If an integration fails, nothing merges
past it: a sibling that had passed is recorded `passed, not merged`, its
branch pushed and its status entry committed — § "Resuming after a halt"
finishes it like any ticket a run left behind.

**Worktrees after a halt.** A ticket whose pipeline *passed* has nothing in
its worktree that is not on its pushed branch, so the script removes it
whether or not the ticket integrated (the one exception is a failed
post-merge check, above) — left behind it would hold the ticket's
branch checked out, and git refuses `git checkout <branch>` anywhere else
while it does, which is the first command of the recovery. A ticket whose
pipeline *halted* may hold the only copy of what went wrong, so its worktree
stays and the script logs its path with the command that clears it
(`git worktree remove --force <path>`): look first, then remove it **before**
`/flow:ticket <ID>` or a re-run — a path left behind refuses the next run's
worktree of the same name. **With `Worker runner: codex`, the cancel below
must be spelled with that worktree's path as `--repo`**, not the
repository's: the runner finds a run's state by the path it was given, so a
cancel naming the main checkout reports "nothing to cancel" while Codex goes
on editing the worktree. The script's log line carries the exact command.

**Nothing improvises past one.** Halting is the mechanism working; a run that
pushes through is a run whose release pull request cannot be trusted. **With
`Worker runner: codex`, a precondition comes first:** when the halt fired on
a ticket the Codex runner was working, or the Workflow call errored while
one was, run that ticket's cancel before checking out, editing or committing
anything, and read what it reports about the working tree:

```bash
node "${CLAUDE_PLUGIN_ROOT}/scripts/runners/codex.mjs" <ID> --epic <name> \
  --epic-branch epic/<name> --default-branch <default> \
  --repo "<repoRoot — OR, for a ticket that ran in a wave, that ticket's worktree path>" \
  --plugin "${CLAUDE_PLUGIN_ROOT}" --label worker:<ID> --cancel --json
```

**`--repo` is the path the worker was GIVEN, and in a parallel run that is
the ticket's worktree** (`<repoRoot>/../.flow-worktrees/<repo folder>/<epic>/<id>`),
not the repository: the runner keys a run's state on it, so the command
spelled with `<repoRoot>` reports "nothing to cancel" while Codex goes on
editing the worktree. The script's halt log prints the exact command for
every worktree it kept — copy it from there.

These are the worker proxy's own arguments (the run's state is found by
label, ID, repository and epic, so no other flag matters to the cancel). The
runner is detached and outlives its proxy, so a halt can leave Codex still
editing this very tree; the `epic/<name>` checkout below would carry those
unreviewed edits into the run-record commit. A cancel on a run that already
finished or was already stopped is a harmless no-op report. If the cancel
names uncommitted paths, they are the stopped run's unreviewed work, and
not yours to discard or to commit: name them in the **Diagnosis:**
paragraph, and commit the run record by path alone — `git add
epics/<name>/runs.md && git commit --only epics/<name>/runs.md`, naming
`epics/<name>/shadow-reviews.md` in both too when the epic declares a
shadow reviewer (step 6) — never
`git add -A`, `git commit -a` or a plain `git commit`: a run stopped
mid-commit leaves its edits **staged** (the cancel report counts them), a
checkout carries a staged index across, and a plain `git commit` commits
the whole index onto the epic branch. If they block the checkout of
`epic/<name>`, stop and report that instead of forcing it. On a
`halted` result, or a Workflow call that errored: append the run record
(step 6) with `haltedOn.stopCondition` verbatim, the ticket it fired on, and
the **Diagnosis:** paragraph step 6 requires of every halted record — the
halt reason is the driver's account of where it stopped, the diagnosis is
what you find when you inspect what it stopped on, and the second is what a
human fixing the plugin reads — commit and push it on `epic/<name>`, report,
and stop. If the halt's detail —
`haltedOn`'s, or any entry of `alsoHalted` —
says a conflicted merge was **not** aborted, run `git merge --abort` on
`epic/<name>` first — recovery, not reconciliation. Merge nothing more and
open no release pull request. A halt from a worker's BLOCKED entry already
says why; point at it rather than restating it.

## 6. The run record

Append to the epic's **`runs.md`** on `epic/<name>`, in session, from the
step 4 result — fenced prose quoted, markers dropped. **Never `status.md`:**
that file's tail belongs to the ticket entries, written on ticket branches
while this record is written on the epic branch, and two writers on one tail
cost a hand merge on every mid-ticket halt. The heading names no ticket ID,
so the board ignores it; `spend` reads the record by it from either file, so
`doctor` flags one that will not parse — and, once `runs.md` exists, a `###
Run —` record appended to `status.md` after it. A qualifier in parentheses
after the date is allowed and is how same-day runs are told apart — `### Run
— 2026-08-25 (second run) — halted`.

`find --json` carries `runsDoc` (with `runsDocExists`) — the path whether or
not the file is there yet — so it is read, never built by hand. If `runs.md`
does not exist, create it
with this exact preamble — the **Rules** block is the status log's, verbatim,
because it is one rule and `check-invariants.mjs` holds the two copies
together:

```markdown
# <Name> epic — run log

Append-only record of unattended runs. Tickets: `epics/<name>/tickets.md`.
Ticket entries and their review addenda stay in `epics/<name>/status.md`.

**Rules.** Append only. Corrections are new dated addenda beneath the entry they
correct, never edits. Report counts, not adjectives. The **Owed** line is
required even when empty.
```

**A correction to a run record's figures goes in `runs.md`**, as a dated
addendum beneath the record it corrects — never in `status.md`. Where both
logs carry a figure for the same ticket and role, `spend` takes the one in
`runs.md`; and an `unknown` never overwrites a known figure in either
direction, because `unknown` records the absence of an observation, not a
correction — a halted run that read no meter must not erase the figure the
finished ticket's own entry recorded.

Then the record itself:

```markdown
### Run — <YYYY-MM-DD> — <completed | halted>

**Driver:** /flow:run, unattended, loop by `workflows/run-epic.mjs`<, and
when the run went wide: "`Parallel: <n>` — waves: <IDs of wave 1> | <IDs of
wave 2> | …", from each record's `wave` — the **Waves:** field below carries
the rest>.
**Tickets this run:** <one line per ticket, in order, from `ticketRecords`:
ID — worker agent — review tier and outcome (`importantCount` Important,
`nitCount` nits, fixed or not) — what stood between the fixes and the merge:
"fixes outside the reviewed bounds — re-reviewed at the consequence tier:
`<reReviewImportantCount>` Important" when `fixBoundsTripped`, "re-reviewed
after fixes: `<reReviewImportantCount>` Important" when `reReviewRan`
without a trip, or "fixes bounds-checked in code: `<fixLines>` lines inside
the reviewed diff" when `fixBoundsGated` and nothing tripped — "acceptance:
`<acceptanceChecksPassed>/<acceptanceChecks>` CHECKs" when any ran, plus
"`<acceptanceChecksSkipped>` skipped" and "`<acceptanceProblems>` malformed"
whenever either count is above zero, because a skipped check is not a passed
one and a malformed CHECK never ran at all — either is why an acceptance halt
can read as all-green, and `1/2` alone says which neither —
integrated | halted. A record that omits the fix gate reads as though the
fixes were never looked at.>

**Tokens:** <one group per ticket, in this exact machine-readable shape —
`<ID> worker=<n> reviewer=<n> disposition=<n> re-review=<n> proxies=<n>`,
groups separated by `;`, `unknown` in place of any figure the transcripts
did not expose, then `total=<n>` — because `tickets.mjs spend` parses these
groups into the epic's ledger and the retro reads that instead of summing by
hand. **A ticket that went through more than one pass — reviewed again in a
resumed run, or finished by hand after a halt — gets one group per pass,
labelled: `<ID> round=2 worker=<n> reviewer=<n> …`** (and the earlier
record's group is `round=1`; when that record was written without the label,
restate it as `round=1` in a dated addendum beneath it). `spend` sums
labelled rounds and keeps only the last of an unlabelled repeat, because
last-wins is how a correction overrides what it corrects — so two unlabelled
groups for one ticket read as a correction and the first pass's spend
vanishes. The run record is the only writer of a round in this lane: ticket
entries and addenda point here and never restate the figures. Figures are harness-observed from the run's own transcripts, never
from an agent's report: the Workflow run persists each `agent()` call's
transcript under this session's directory, and `journal.jsonl` maps the
labels (`worker:<ID>`, `review:<ID>`, `disposition:<ID>`, `re-review:<ID>`,
the shell proxies) to their `agent-<id>.jsonl` files. **Do not sum them by
hand — run the meter, and paste the line it prints:**

```bash
node "${CLAUDE_PLUGIN_ROOT}/scripts/meter.mjs" "$(find ~/.claude/projects -type d -path '*subagents/workflows/<run-id>')"
```

`<run-id>` is the `wf_…` ID the Workflow call returned. If the `find`
matches nothing the script receives an empty path and says so: check the ID
against the Workflow call's result, and list what runs exist with
`ls -dt $(find ~/.claude/projects -type d -path '*subagents/workflows/wf_*') | head -5`
— newest first, and the newest is usually the one. If the run's directory cannot be found, every line the meter would have
printed is written `unknown`, never from memory of what the run seemed to cost. The script sums each
agent's `usage` as input + output + cache-creation tokens, **cache reads left
out of this sum and reported on the `**Cache reads:**` line below** — so that
`worker=<n>` here means today what it meant in every earlier record, which is
what makes the ledger comparable at all — counting a message once
however many lines it was streamed as, which is the arithmetic a session
reading JSONL by hand got wrong in both directions. A `refresh+select` step
counts as a proxy of the ticket it selected; one that selected nothing is
printed apart as run overhead, in `total=` and in no group. A role whose
transcript is missing prints `unknown`, and a role that never ran is absent.
If the script finds no journal, every figure is `unknown` — never estimate
one. A resumed run has a run ID of its own: meter each, and label the
groups `round=<n>` as above. Add the reviewer's tier and effort as prose after the
groups — the model it ran on is on the `**Models:**` line, observed, and a
prose copy of it is a second place to drift. This is the run lane's only token record: ticket entries and
addenda point here. Planning evidence, never a gate. A record written
without the groups reads as nothing — `doctor` flags it — and is repaired
by a dated addendum beneath the record restating the figures as groups,
never by editing the record.>

**Time:** <the second line `meter.mjs` printed, pasted as printed — one group
per ticket, `<ID> worker=<n>s reviewer=<n>s disposition=<n>s re-review=<n>s
proxies=<n>s wall=<n>s`, groups separated by `;`, then `run=<n>s`. Seconds,
**each with its `s`**: a bare `worker=1430` anywhere in a record is a token
figure, so the unit is what keeps a duration out of the token ledger. A
role's figure is its agents' first transcript timestamp to their last;
`wall` is the ticket's first agent start to its last agent end and is **not
the roles' sum** — the gap is what the ticket spent between agents, and it
is part of what a human waited through. Observed the way tokens are and for
the same reason: the driver has no clock (`Date.now()` throws in a workflow
script) and no agent times itself honestly, but the harness stamped every
transcript line anyway. `round=<n>` labels, `unknown` and corrections work
exactly as on the Tokens line — with one difference: **time is read only
inside a paragraph that starts `**Time:**`** (to the next blank line or bold
label), where every time group is read whatever prose stands beside it and
anything else is left for the token ledger — so a correction addendum puts
its restated groups under a `**Time:**` line of its own. `tickets.mjs spend`
reads these into the ledger beside the tokens; `doctor` flags a Time line
with figures in a record where no Time group parses, and a time figure
nothing read (`worker=1,430s`, or one quoted outside a Time paragraph) on a
line naming a ticket that has no time anywhere in the ledger — both cleared
by that addendum. A
run that selected no ticket prints `**Time:** run=<n>s` and nothing else,
which is a complete line and not a near-miss. Planning evidence, never a gate — no ticket halts on a
duration.>

**Cache reads:** <the third line `meter.mjs` printed, pasted as printed — one
group per ticket, `<ID> worker=<n>r reviewer=<n>r disposition=<n>r
re-review=<n>r proxies=<n>r`, groups separated by `;`, then `total=<n>r`,
which holds the run's overhead as the Tokens line's total does. **Every
figure carries its `r`, and none carries a comma**: a bare `worker=4812330`
anywhere in a record is a token figure, so the unit is what keeps a read
count out of the token ledger — where, the last figure read for a role
winning, it would not add to the ticket's cost but REPLACE it, with a count
several times its size and nothing saying so. Read
**only inside a paragraph that starts `**Cache reads:**`** (to the next blank
line or bold label), for the reason time is: `worker=unknown` opens a token
group and a cache group identically, so the paragraph is the wall. `round=<n>`
labels, `unknown`, and corrections by dated addendum work exactly as on the
Tokens line, and the sum of the rounds is the figure. A record written before
this line existed has no cache reads at all, which `spend` reports as nothing
recorded — never as zero, and never backfilled. `doctor` flags a Cache reads
line with figures where no group parses, cleared by an addendum carrying the
groups under a `**Cache reads:**` line of its own. Planning evidence, never a
gate.>

**Models:** <the fourth line `meter.mjs` printed, pasted as printed — one
group per ticket, `<ID> worker=<name> reviewer=<name> …`, groups separated by
`;`, and no total, because names have nothing to sum. Each name is observed:
every assistant line of a transcript carries the model that wrote it. **An
agent that used two models prints both joined by `+`** (a fallback mid-step)
and a role's value is every model its agents used, in first-use order — never
a "dominant" one, which would be an estimate of something the transcript
states exactly. **With `Worker runner: codex` the worker reads
`codex:<model>`**: that agent is the runner's shell proxy, so its own model
is haiku, and the model that wrote the ticket is the one in the JSON the
runner printed, which `meter.mjs` reads out of the proxy's tool results — and
where the runner ran but printed nothing readable, the worker is `unknown`,
because the proxy's own model is the one model that certainly did not write
the ticket. Codex's token usage stays where it is — in the proxy's prose —
and reaches no ledger. `unknown` where the transcripts named no model, and a
name that cannot be written machine-shaped is `unknown` too, never guessed:
each name opens with a letter, carries only letters, digits and `. _ : / -`,
and ends in a letter or digit — a name that opened with a digit would be read
back as a FIGURE, one with a space in it as a second pair, and one ending in
punctuation as a name nobody ran. **This paragraph carries groups and nothing
else**: the reviewer's tier and effort, and any note about the run, go in a
sentence of their own outside it (after a blank line, or under another bold
label), because a word standing beside a name ends the group there —
`worker=claude-opus-5 as reported` is read as nothing, and `doctor` says
which ticket lost its model. Read **only inside a paragraph that starts `**Models:**`**, for the
reason cache reads are: `worker=claude-opus-5` opens like a token group.
Corrections by dated addendum work as everywhere else; a later round's models
are united with the earlier ones rather than replacing them. Old records have
no Models line, which reads as nothing recorded. Planning evidence — what a
tier cost on which model — never a gate.>

**Peak context:** <the fifth line `meter.mjs` printed, pasted as printed — one
group per ticket, `<ID> worker=<n>c reviewer=<n>c disposition=<n>c
re-review=<n>c proxies=<n>c`, groups separated by `;`, and **no total**,
because a max has no sum: a peak summed across tickets names a context window
no agent ever held, and `tickets.mjs spend` prints the epic's max under the
groups, computed from them, where it cannot disagree with them. A role's
figure is the LARGEST window any of its agents held — per message, input +
cache reads + cache creation, which is what the model was given to read — and
the role's value is the largest of its agents', never their sum. Output is
left out: it was not in the window that was sent, and the next request's input
carries it. **Every figure carries its `c`, and none carries a comma**, for
the reason the `r` and the `s` exist — a bare `worker=180000` anywhere in a
record is a token figure — and `c` is deliberately neither of them, so a peak
that landed in the wrong paragraph is read by no ledger rather than wrongly by
one. Read **only inside a paragraph that starts `**Peak context:**`** (to the
next blank line or bold label). **With `Worker runner: codex` the worker's
peak is `unknown`**, even though that agent exposed a window: it is the
runner's shell proxy, and the window it held is a few relayed JSON blobs
wide. Its tokens and cache reads are reported as they are — the proxy's real
cost, paid by this run whoever wrote the ticket — but a peak is not a cost,
it is a claim about ONE model's context window, and the proxy's reported
under `codex:<model>` would say a Codex agent came that close to its limit
when nothing here observed it. `round=<n>` labels and `unknown` work as
everywhere else, with one difference that follows from a max: **rounds take
the LARGER reading, not the sum** — a second pass held its own window, it did
not stack the first one's on top. A record written before this line existed
has no peak at all, which `spend` reports as nothing recorded, never as zero.
`doctor` flags a Peak context line with figures where no group parses, a group
or pair the ledger lost, and a `…c` figure quoted outside the paragraph — each
cleared by a dated addendum carrying the groups under a `**Peak context:**`
line of its own. Planning evidence — how close a role came to its limit —
never a gate.>

**Findings:** <what the reviews found and what became of them, one group per
ticket: `<ID> important=<n> nits=<n> unfixed=<n>`, groups separated by `;`.
**Not from the meter** — no transcript says which findings were left unfixed —
but from the driver's own result, in code, never from prose: for each
`ticketRecords` entry, `important` is `importantCount` (plus
`reReviewImportantCount` when `reReviewRan`), `nits` is `nitCount +
nitOverflowCount`, and `unfixed` is `notFixed.length`. Bare counts, **no
unit**: these three keys are the ledger's own and no other ledger's pair
regex can read them, so a unit would protect nothing. `unknown` for a count
the run could not observe — a ticket whose reviewer never reported, or one
finished by hand. **This paragraph carries groups and nothing else**, the
rule the Models and Halt lines carry and for their reason: a word standing
beside a pair ends the group there, so `important=2 (both in the parser)`
reads as one pair and loses the two beside it, and `doctor` then says which
ticket came up short. What the review found in words is the "Tickets this
run" line and the ticket's own addendum, where it already is. Zero is a figure and is written: `important=0` is a review
that found nothing, which is a normal and welcome result and not a review that
did not happen. Read **only inside a paragraph that starts `**Findings:**`**,
for the reason the others are. `round=<n>` labels, corrections by dated
addendum and the `unknown` rule work exactly as on the Tokens line, and rounds
**sum** — two passes found what they each found. `tickets.mjs metrics` reads
these into the epic's review-effectiveness figures beside the rework count
(`(review fix)` commits) and the escaped defects (`(fixes <ID>)` commits).
Planning evidence, never a gate — the gate on findings is the driver's, and it
already ran.>

**Halt:** <**required on a halted record, omitted when the run ran to
completion** — `none` is a lower-case word and would be counted as a halt kind
of its own. One group per halt, from the result's `haltKinds`, in the order it
gives them (`haltedOn` first, then each `alsoHalted`): `<kind> <ID>`, groups
separated by `;`. `<kind>` is the driver's OWN halt kind — the `STOP` key the
result resolved, `blocked`, `importantFinding`, `acceptanceCheck`,
`releaseCheck` and the rest — written verbatim and never translated from the
sentence, which is reworded whenever a halt reads wrongly to a human. **An
epic-level halt names no ticket** and is the kind alone (`**Halt:**
releaseCheck`): a kind is lower-case-initial and a ticket ID is
upper-case-initial, so nothing needs to stand in ID position and nothing may.
**The paragraph carries groups and nothing else** — the sentence about what
happened goes under `**Halted on:**` and `**Diagnosis:**`, where it always
did, because a word standing beside a kind ends the group there and
`**Halt:** blocked PAY-1 — the worker died` would otherwise record halts
named "the", "worker" and "died". `doctor` says so when no group parses.
`tickets.mjs metrics` counts halts by kind; this line is the only place a
retro can read what stopped runs without re-reading every record's prose.>

**Release check:** <from the result's `releaseCheck`: the commit it was made
at (`head`, shortened — kept when the check failed too) and each of its `tickets` as `<ID> <passed>/<total>`,
in the order checked — "at 3f2a9c1: PAY-1 2/2, PAY-2 3/3" — or
"not reached: the run halted" when it is `null`. When the run halted ON the
release check, the list stops at the ticket that failed. No `worker=` or
`wall=` group belongs on this line: `spend` reads those wherever they sit.>

**Waves:** <**required whenever the run went wide, omitted otherwise** —
the evidence a parallel run leaves nowhere else, gathered now, while the
run's directory and worktrees still exist, because the retro's ninth question
reads it and cannot gather it later. Six facts, each observed, never assumed:
(1) **which tickets ran beside which** — each record's `wave`; (2) **was it
actually concurrent** — from the Time line: within a wave, do the tickets'
`wall`s overlap (their sum well above the wave's span), or did the runtime
serialise them; (3) **what the board relayed** — for each
`refresh+select:<n>` in the run's `journal.jsonl`, its `waiting` array and
`waitingCount`, beside what `tickets.mjs next <epic> --with-waiting` prints
now for the tickets still unbuilt: a list that lost an entry on the way is a
plugin defect even when the counts check caught it; (4) **is the log whole**
— `node "${CLAUDE_PLUGIN_ROOT}/scripts/tickets.mjs" doctor` on
`epic/<name>`, quoting any row about an entry's `**Owed:**` line, and one
line confirming every integrated ticket has its entry; (5) **what the
post-merge gate did** — per ticket merged after its wave's first:
`postMergeChecksPassed`/`postMergeChecks`, or "no CHECK criteria"; (6)
**what the worktrees cost and left** — `git worktree list` (anything under
`.flow-worktrees` that the script did not say it was keeping is a defect),
whether any ticket went BLOCKED or recorded a criterion as owed **because its
worktree lacked something the usual checkout has**, and the Time line's
`worker=` seconds against this project's serial runs where a record exists to
compare. With `Worker runner: codex`, add whether the runner worked inside a
linked worktree at all. Counts and quotations; where a fact could not be
observed, say so — `unknown` is an answer here too.>

**Halted on:** <`haltedOn.stopCondition` verbatim, with `haltedOn.ticket`
and `haltedOn.where` — or "ran to completion". **When `alsoHalted` is not
empty** (a wave produced more than one halt), one further line per entry, in
the same shape — the run stopped on the first, and the others are work a
human still has to look at; a record that names only one reads as though the
rest of the wave was fine. Name any ticket recorded `passed, not merged`.>

**Diagnosis:** <**required on a halted record**, omitted only when the run
ran to completion. What the driver's halt detail says; what you found when
you went and looked — the command re-run by hand with its counts, the file
and line of the mechanism, the branch state as git reports it; and the
reading the record is written for: does the stop look like a real risk
retired, or like a fire on a green state? The driver's halt detail is one
input, not the diagnosis — it is the machine's account of where it stopped,
while this is what inspection found afterwards. Your reading is evidence for
the retro, not its verdict: the retro's miner classifies the halt itself,
because the run that stopped cannot be the judge of its own stop. Write it
especially when the answer is "the work is fine, the instrument is not":
both plugin fixes of August exist because a driver wrote this paragraph when
nothing required it — the check runner's `maxBuffer` (`4eb0f4b`, from a
diagnosis showing a 68/68 suite dying on ENOBUFS) and the addendum-date
lookup (`9a859c7`, from one showing a green ticket failing a date-string
grep). The retro's seventh question reads this paragraph first.>

**Protection:** <"present" — or the recorded waiver quoted, with where it
lives in `tickets.md`. A run without the hard floor must say so here.>

**Release PR:** <the URL `gh pr create` printed — step 7 opens the pull
request before this record is written, so the line is evidence, not a
prediction. Or "not opened: run halted".>

**Shadow reviews:** <only when the epic declares `Shadow reviewer:` —
`totals.shadowReviews`: "<ran> run, <failed> failed — see
`epics/<name>/shadow-reviews.md`".>
```

**When the epic declares a shadow reviewer**, also append each ticket's
`shadow` record to `epics/<name>/shadow-reviews.md` (create it with a
one-line `# <Name> epic — shadow reviews` heading): a `### <ID> — <date>`
section per ticket with the outcome and reason, the model, effort, usage and
duration, and Codex's findings as quoted text beside the Claude reviewer's
for the same ticket. It is its own file on purpose: findings quoted into
`status.md` or `runs.md` would be read by `tickets.mjs spend` and `doctor`,
and nothing reads this one. The comparison — which findings both reviewers
raised, which only one did, and whether Codex's were real — is done by hand
at the retro. The trial gates nothing and records nothing else.

Commit it on `epic/<name>` (subject: `<epic> run record — <YYYY-MM-DD>`, no
ticket ID — the commit belongs to the run), with `shadow-reviews.md` when
there is one, and push.

## 7. End: open the release pull request — never merge it

On `outcome: "completed"` — the loop's last refresh already brought
`epic/<name>` current (`finalRefresh`); do not refresh again — **or by hand,
by an attended session, when every ticket is integrated and no run can reach
this step.** That second door is not a courtesy. A run that halts never gets
here; after the halted ticket is finished by hand, re-running `/flow:run
<epic>` finds nothing left to start, hires the refresh and then the release
check (every landed ticket's checks at the epic head — it can halt there),
and lands here with the whole body — **use that route whenever step 1 admits
the board.** It does not always: an ABANDONED ticket reads `blocked` and step
1 refuses the run until a human re-plans the document, which is exactly the
board one live epic ended on (16 integrated, 1 abandoned) — its release pull
request was opened by a session with no route to this step, said "Nothing
owed" against 31 open items, and asked nobody for the addendum. So this step
is written to be executed **without a run result**: every section below names
the command or the log passage it is read from, and a session opening the
pull request by hand owes the same body, section for section. Refresh the
epic branch first in that case (ticket skill step 3 — main is the source,
never the target).

```bash
gh pr create --base <default-branch> --head epic/<name> \
  --title "Release: <epic>" --body "<body>"
```

The title deliberately does not look like `<ID>: <title>` — this pull
request is not a ticket and must never be mistaken for one that could be
squashed. **It carries every ticket's commits, and squashing would collapse
their subjects so every ticket but one reads as unshipped** — say so in the
body, above everything else: *merge with a merge commit, never squash.*

The body is the human's entire evidence base for the one decision they make
in this mode. It carries:

- every ticket (from `ticketRecords`; by hand, from each ticket's status entry
  and review addendum): what it built, its verification counts, its review outcome
  (found / fixed / not fixed with reasons), and **what stood between its fix
  commits and the merge** — the re-review (`reReviewRan`,
  `reReviewImportantCount`, `reReviewFindings`), the code bounds check
  (`fixBoundsGated`, `fixLines`, and `fixBoundsExclude` — what the gate was
  allowed not to look at, `[]` when it measured the whole fix), and whether
  that check tripped and bought the re-review (`fixBoundsTripped`);
- the release's size up front — `git diff --stat
  origin/<default-branch>...epic/<name>` — a release too large to review is
  a fact the human sees before approving;
- **`## Release check`, pasted from the command, from both doors — and the
  suites run once for it.** Run the check as JSON, save it, and print the
  text from the saved file:

  ```bash
  node "${CLAUDE_PLUGIN_ROOT}/scripts/tickets.mjs" check-epic <epic> --json > <scratchpad>/check-<epic>.json; echo "exit $?"
  node "${CLAUDE_PLUGIN_ROOT}/scripts/tickets.mjs" check-epic <epic> --render <scratchpad>/check-<epic>.json
  ```

  **Where: in the environment the tickets were built in.** After a serial
  run, or by hand on a serial epic, that is the main checkout on
  `epic/<name>`. After a parallel run it is the release worktree the script
  left for you — **`cd` to the result's `releaseCheck.root` first** — because
  the main checkout never saw what the tickets installed in their worktrees,
  and the check that passed there fails here for want of a dependency. By
  hand on an epic that declares `Parallel:` 2 or 3, make that worktree
  yourself: `git fetch origin epic/<name> && git worktree add --detach
  <path> origin/epic/<name>`, then `node
  "${CLAUDE_PLUGIN_ROOT}/scripts/worktree-setup.mjs" --repo <main checkout>
  --worktree <path>`. **Remove it when step 7 is done** (`git worktree remove
  --force <path>`): a leftover halts the next run at the same path.

  The command guards what it is evidence about, before it runs anything: it
  **fetches** `origin/epic/<name>` itself and refuses a checkout that is
  ahead of, behind or diverged from that head (saying which, because the
  repair differs) or whose fetch failed; and it refuses **uncommitted
  changes to tracked files**, running nothing — the checks read the working
  tree, so an uncommitted fix would certify the pushed commit. It runs every
  line of every ticket, exactly as the script's per-ticket steps did; add
  `--share` only when every `CHECK` in the epic is a read-only probe (a test
  suite several tickets name then runs once — and a probe that an
  intervening command changes the answer to gets the stale answer, which is
  why it is not the default). **Run it as a background command when the
  epic's suites are long**: it is one invocation for the whole epic, your
  shell tool kills a foreground command at ten minutes, and a killed run
  leaves a file that cannot be rendered — wait for it, then read the exit
  code it printed. The first command
  is the run (and its exit code is the gate — the `;` is deliberate, so a
  nonzero exit does not stop you reading it); the second runs nothing and
  prints the ledger the body carries. The walkthrough below reads the same
  file, so one run serves all three — after the script's own release check
  that is already twice, and a third was minutes of suites for nothing.
  After a completed run it repeats what the script's check passed, and adds
  what that check does not report: **every ticket whose criteria differ from
  sign-off, was and now** — a later ticket that loosened an earlier one's
  `EXPECT` is green in every ledger and visible only here — every `COMPARE`
  criterion, marked not re-verified at the release commit, and every ticket
  sign-off knew whose section is gone from the document, which is on no
  other list. **Open nothing on a nonzero exit, from either door** — render
  the walkthrough anyway and **send it to the human as a file, never
  published**: it shows what broke, and the output of a failed check is the
  one thing on that page that was never committed anywhere — a `CHECK` that
  prints an environment value when it fails has printed it there. By hand it is the gate itself — that door had no check of the
  assembled epic at all. After a completed run it is the backstop: the
  script's check reached you through shell proxies' reports, and this is
  the one run of it you watched;
- the run record summary, including which agent ran each ticket — and any
  ticket whose record carries `dispositionRecovered: true`, by name: it
  merged on what the branch showed and a re-review, not on a disposition's
  report, and the human reading this body should know which those were;
- every deploy precondition any ticket created (an environment variable, a
  migration, a script that runs after), collected from the status log;
- **`## Owed`, pasted from the command, written even when empty**:

  ```bash
  node "${CLAUDE_PLUGIN_ROOT}/scripts/tickets.mjs" owed <epic>
  ```

  Every owed item the status log records and nothing has resolved, each with
  the entry that owes it; "none outstanding" when that is what it prints. A
  body that says nothing is owed must be one a command printed, never one a
  session recalled — and an item the release itself discharges is discharged
  in the log (`**Resolves owed:**`) first, so the command stops printing it;
- **`## Unticketed commits`, written even when empty** — the epic's entry in
  `tickets.mjs list <epic> --json`'s `unticketed` map, each commit by sha and
  subject, "none" when the epic has no entry. These are the changes in this
  release that no ticket, status entry, reviewer or spend figure covers; the
  human reading the body is the first person to be told they exist;
- **every pre-existing finding** the reviewers reported (the result's
  `preExisting`, with the ticket that met it and the owner the addendum
  names; by hand, read them from the review addenda in `status.md`) — a defect neither fixed nor handed to someone is one the project
  has forgotten, and this is the last place a human sees it;
- when step 3 proceeded on a protection waiver, that fact, right under the
  never-squash line;
- **a closing request to the human, under its own heading**: *what did you
  find here that no gate had surfaced?* — and the ask to record the answer as
  a dated addendum beneath this run's record in `epics/<name>/runs.md`,
  **including when the answer is "none found"**. The retro reads that
  addendum; an absent one is indistinguishable from a zero, so the two have to
  be written differently. This is the only measurement of what the run's gates
  missed, and the human is the only observer of it. Say **where and when**:
  committed to `epic/<name>` **before they merge this pull request**, so the
  line rides in the release they are reading rather than becoming a commit
  toward the default branch afterwards — nothing runs after that merge, and no
  agent pushes toward the default branch in any mode. If they only think of it
  after merging, it is a change like any other and ships through
  `/flow:quick`, never as a direct commit. Either way the line is theirs to
  write; you do not draft it for them.

- **the walkthrough's link, right under the never-squash line** — the same
  evidence laid out to be read, one section per ticket in the order they
  were built. Render it on `epic/<name>` from the saved release check:

  ```bash
  node "${CLAUDE_PLUGIN_ROOT}/scripts/release-page.mjs" <epic> --check <scratchpad>/check-<epic>.json --out <scratchpad>/release-<epic>.html
  ```

  Publish it as an artifact and put the URL in the body (no artifact
  surface: send the file, and say in the body that a walkthrough was sent).
  **Render it twice, to the same file path, so the URL is one URL.** The
  first render is before the pull request exists, because the body needs the
  link. The second is **after step 6's run record is committed and pushed**:
  that commit moves the head the pull request carries, and until then the
  page's "last run record" is the previous run's — or says there was none.
  Re-run the same command with the same saved check and republish: the
  renderer asks git what changed since the check was taken, and when it is
  only this epic's `runs.md` and `shadow-reviews.md` it keeps the ledger and
  says exactly what it is — *passed at `<sha>`, one commit before this head* —
  never "at head": a `CHECK` that reads git history or the epic's own records
  could answer differently now, and if this epic has one, run the check
  again instead. If anything else changed, it draws the
  ledger as *not a check of this release*, and the honest repair is to run
  the check again. **The page adds to the body and replaces none of it**:
  GitHub is where the merge is decided, and a link can rot where the body
  cannot. Neither the JSON nor the page is ever committed — it is a view of
  git, the status log and the run record, and a committed view is a mirror
  somebody has to keep true. **Publish only a page whose release check is
  green.** A green page quotes what the pull request's readers can already
  read in the repository — status entries, the run record, commit subjects —
  and no check output at all; a failing one quotes failed checks' output
  verbatim, which is where a secret can be, and it goes to the human as a
  file (above). Read it before you publish it either way;

`ticketRecords` indexes those facts; the committed status log and its
addenda are what travel in this pull request, so where the two differ the
log wins and the difference is worth a line in the body.

Then append the run record (step 6), render and republish the walkthrough
once more (above — the head just moved), print the pull request URL and the
walkthrough's, and stop.
**You do not merge it, approve it, or comment on it. No agent does.** The
human gate moved here, and everything this run did was structured to keep
this one click trustworthy.

## Resuming after a halt

A halted run is picked up by **re-running `/flow:run <epic>`** — a new run,
reading the board — after whatever the halt left half-finished is finished by
hand. The board says which case you are in:

```bash
node "${CLAUDE_PLUGIN_ROOT}/scripts/tickets.mjs" list <epic>
```

**Finish the ticket, not the epic, by hand.** Work committed to `epic/<name>`
outside any ticket — no ID opening its subject — reaches no status entry, no
spend line and no reviewer; the board lists it as unticketed and `doctor`
warns. If picking up after a halt turns up more work than the halted ticket's,
it is a new ticket in `tickets.md` (or `/flow:quick`), not a commit on the epic
branch.

**When the last ticket is integrated, the release pull request is opened by
re-running `/flow:run <epic>`**: with nothing left to start the run hires the
refresh, makes the release check (it can halt there — shape 5), and then
goes to step 7 — body, owed list,
unticketed commits and the addendum request included. When step 1 refuses the
board (a `blocked` ticket, which is how an ABANDONED one reads), an attended
session opens it by hand, following step 7 section for section.

Five shapes are possible, and for the first three the halted ticket's **status entry** — the
thing the board reads — is what tells them apart. Read them off the board,
not off the halt's narrative: the worker writes its entry and pushes its
branch (steps 1–6 and step 9) *before* the driver hires a reviewer, so most
halt messages name a stage the ticket had already passed.

**1. No status entry** — the ticket reads `todo`, or `in-progress` when the
worker got as far as committing on its local branch. A refresh that failed, a
worker that returned nothing, a session limit before anything was committed:
redesign-foundation's second run of 2026-09-13 halted this way — "the
refresh/select agent returned no report — the refresh cannot be assumed to
have happened" — and recorded "FND-5 did not start". A `todo` ticket needs
nothing but a re-run of `/flow:run <epic>`: the loop asks `next` for each
ticket, `next` hands out only `todo` tickets, and `integrated` ones are
skipped, which is how re-running resumes after the work that landed instead
of redoing it. An `in-progress` ticket is step 1's refusal, because a local
branch with commits and no entry is work no record describes: a human either
finishes it by hand (shape 2's route) or discards the branch so the ticket
reads `todo` again. Nothing is lost by discarding — nothing was reviewed.

**2. A DONE entry on a pushed branch, with or without a review addendum** —
the ticket reads `done`. This is the common shape: ten of the twelve halts
across the first three live release epics. Everything from the reviewer
onward halts here, because the entry and the push happened first — a
reviewer that could not be spawned ("the branch `ghf-2` stays pushed and
unmerged", groundhopper-foundation, 2026-08-24), an Important finding the
disposition could not fix, a failed acceptance CHECK, a `COMPARE` criterion
whose pushed entry records no comparison, a fix diff nothing
could measure, a merge that would not go in. **Finish that one ticket by
hand first**: `/flow:ticket <ID>`, the escape hatch step 1's refusal names
(after a parallel run, remove the ticket's worktree first if the halt left
one — `git worktree list` shows it, and while it exists git will not check
the ticket's branch out anywhere else).
Its supervisor-spawned worker checks out the pushed branch and builds
nothing — the ticket skill's step 0 and step 3 carry that exception — and the
supervisor picks the leg up where the run dropped it: step 7's review when
the entry carries no `Addendum — review —` line, step 8 when it does and
findings are still open, step 10's **two gates** and the merge by verified SHA
when the addendum is committed. Rebuilding instead would throw away work the
run already paid for, and skipping the ticket would build its successors on
unreviewed work. **Two cases do not end in a merge, and step 10 refuses
both.** An Important finding nobody could fix: it is not the worker's to
accept, so the recovery is a BLOCKED entry naming it and a human deciding what
happens to the ticket. And **an unclosed deviation** — a departure the entry
recorded that no human has closed: the step shows it and holds the merge until
the human has accepted it, or had it fixed on the branch and accepted it as
fixed, in a dated `**Deviations closed:**` line on the pushed branch that no
agent may decide — your explicit answer is the decision, and the attended
session records it. That second refusal is why a halted ticket carrying a
departure comes back here at all: nobody in an unattended run could have
written that line. Once the board reads `integrated`, re-run
`/flow:run <epic>`.

**A halt on a recorded deviation** is that shape with the decision named up
front: the ticket is `done`, its branch is pushed with its entry and its
committed addendum, and the run stopped at the resolve step because the entry
records a departure. Read them off the branch the run would have merged —
the checkout is not the evidence, and the fetch is what makes the
remote-tracking ref current:

```bash
git fetch origin --prune
node "${CLAUDE_PLUGIN_ROOT}/scripts/tickets.mjs" deviations <ID> --log-from origin/<id lowercased>
```

It prints every departure the ticket's own entries record with its reference
(`<ID>` when that entry recorded one, `<ID>.1`, `<ID>.2` … when it recorded
several), each closed one with its closing line, and a `note:` for any
closing line that closed nothing. **Decide each one: accept it, or have it
fixed.** Then finish that one ticket by hand — `/flow:ticket <ID>`, exactly
as shape 2 says — and its step 10 is where both recoveries land: it shows
every departure and refuses the merge until `open` is 0, and a worker fixing
one builds it as new commits on the branch with a dated addendum saying what
it built and where. Either way it ends in a decision **you** make: a dated
`**Deviations closed:**` line in the status log on the ticket branch,
committed and pushed, **naming the items by the references that command
printed** and each as accepted or as fixed in `<sha>`. A bare
`**Deviations closed:** <ID>` facing more than one open departure closes
nothing, the command reports those departures open with a note saying so, and
step 10 still refuses — so a recovery that ends in a bare line is not a
recovery. No agent decides that line, not even for a departure it fixed
itself — but you need not type it: shown the departure in plain words, your
explicit answer ("accept", "fix it") is the decision, and the attended session
records the line quoting it and saying it was recorded from your answer.
Silence, or a general instruction to carry on, is not an answer. Once the line is pushed and the
board reads `integrated`, re-run `/flow:run <epic>`.

**3. A BLOCKED or ABANDONED entry** — the ticket reads `blocked`, which step
1 refuses for its own reason: `next` never hands out a blocked ticket, so a
re-run would build every successor on it while leaving it behind. The worker
already wrote why it stopped; a human resolves or re-plans the ticket — which
usually means editing the epic's documents the worker found wrong — and only
then re-runs.

**4. Everything reads `integrated`, and the run still halted** — a failed
post-merge CHECK (parallel runs only). That halt un-merges nothing, so the
board shows no trace of it: the tickets it names are on the epic branch,
`next` has nothing against them, and a plain re-run would carry on — and,
when they were the epic's last, call it built and open the release pull
request for a combination the run proved broken. **The record is the only
place this lives, which is why step 1 reads the last run record and refuses
until something has been done about it.** First rule out the environment, as
the halt says: the check ran in the named ticket's worktree (the script kept
it, detached at the merged head), whose installed dependencies are the ones
*its* branch needed — install what the sibling added and re-run
`tickets.mjs check <ID> --from refs/flow/wave-base/<id>` there by hand — the
ref the run pinned when the wave began, which is what the gate itself read;
`origin/epic/<name>` by now holds whatever the wave's merges did to the
criteria. **Either way, clear the halt with one dated line beneath the run
record in `runs.md`, in the shape step 1 reads** — it is what lets the next
run start, and without it step 1 refuses for ever:

- it **passes**: the halt was the instrument. Write
  `**Addendum — post-merge halt cleared — <date>:** environment — <what was
  missing; the counts of the re-run>`, commit and push it on `epic/<name>`,
  remove the worktree (`git worktree remove --force <path>`, then
  `git update-ref -d refs/flow/wave-base/<id>`), and re-run;
- it **fails**: the plan declared two tickets independent that are not. Add a
  ticket to `tickets.md` on `epic/<name>` that fixes the combination, give
  the later of the two a `**Blocked by:**` line so the plan stops claiming
  it, write `**Addendum — post-merge halt cleared — <date>:** fix ticket <ID>
  — <what it repairs>`, commit and push, remove the worktree and its ref, and
  re-run — the fix ticket is simply the next ticket.

**5. Everything reads `integrated`, and the run halted on the release check**
— *a failed release check*, serial and parallel runs alike. It looks like
shape 4 on the board and is not recovered like it: **no addendum is owed**,
because no release pull request exists and none can be opened past this
halt — the re-run makes the same check again before it reports `completed`.
The halt names the ticket whose check broke, which is rarely the ticket at
fault. **After a parallel run the check ran in the release worktree the halt
names, left in place: diagnose there, not in the main checkout, and remove
it (`git worktree remove --force <path>`) before the re-run**, which makes
its own and halts on a path that already exists. Find what broke it
(`tickets.mjs check <ID>` on `epic/<name>`, or in that worktree, then
`git log` since that ticket's merge) and repair forward, in the place it
broke: **something in this epic** — add a ticket that fixes it to
`epics/<name>/tickets.md` on `epic/<name>`, push, and re-run `/flow:run
<epic>`, which builds that ticket and then checks again; **the default
branch** — fix it there first, where it is broken too (`/flow:quick`, merged
by a human), and the re-run's refresh brings the fix in. A `/flow:quick`
ticket cannot repair the first kind: it branches from the default branch,
and the broken code is not there yet.

**Never `resumeFromRunId`, in any of the five.** The Workflow runtime replays
every unchanged `agent()` call from the run's prefix cache, live-running only
from the first edited call onward — and a run halts precisely because
something *outside* the script changed: the plugin, the environment, the
repository. The cache cannot see any of that. groundhopper-foundation's run
of 2026-08-24, resumed on 2026-08-25 after the plugin's check runner gained a
`maxBuffer`, recorded what that costs: "first resume replayed the stale
failed acceptance from cache (0 tokens) and halted again" — the fix was live
in the plugin, and the resumed run never reached it. A resume after a
*pushed* fix fails the other way: review and disposition would re-run live
against a branch that already carries a committed addendum, reviewing and
dispositioning the same work twice. A fresh `/flow:run` costs one cheap pass
over the board and starts from repository state, which is the only state that
is true.
