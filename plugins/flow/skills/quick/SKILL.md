---
name: quick
description: Run one small, low-risk piece of work in-session — a bugfix, a tweak, a chore — with a durable ticket record and a pull request, at a fraction of the epic lane's cost. Size- and risk-gated; auth, migrations, secrets and other consequential work is routed to /flow:epic at any size. Use only when the user explicitly runs /flow:quick <description> or asks for the Flow quick lane by name — an ordinary small request, without that, is implemented directly with no Flow ceremony.
---

# Quick ticket: $ARGUMENTS

The cheap lane: no planning session, no sign-off gate, no epic branch, no
supervisor, no fresh-context worker, no reviewer by default. What it keeps
is what pays for itself at this size — a written scope with a binding "Not
in scope", verification with counts, a short append-only record, and a pull
request a human reviews. Flow is opt-in: this skill runs because the user
invoked it. `$ARGUMENTS` is the request in prose; the conversation is also
input.

## 1. Check it is actually small — and actually low-risk

Quick work fits **all** of these:

- One area of the repository, one concern.
- Acceptance criteria stateable in one or two bullets.
- A reviewable diff — well under ~400 changed lines.
- No dependency on other unshipped work.

Size is not the only gate. **Some work is never quick, at any size:**

- an authentication or authorization boundary
- secrets, keys, or cryptography
- a schema or data migration, or anything that deletes or rewrites data
- new network exposure — a new public endpoint, a widened CORS rule, an
  opened port
- payment or billing behaviour
- anything that can fail open

Line count measures neither blast radius nor reversibility. This list is
coupled to the ticket skill's `xhigh` review tier — the same consequences at
two doors. **A trigger added to either list is added to the other in the
same commit.**

If a size bullet fails **or** a risk trigger matches, stop and say which:
this goes through `/flow:epic`, even as a single-ticket epic. Do not
"quickly" start it anyway.

## 2. Write the ticket into the standing quick epic

Quick tickets live in `epics/quick/tickets.md`, a normal epic folder the
board reads like any other. If it does not exist, create it:

```markdown
# Quick — one-off tickets

Source: standing epic for small work; each ticket carries its own context.

Delivery: incremental

Status log: `epics/quick/status.md`. Run a ticket with `/flow:quick` (the
in-session lane) or `/flow:ticket <ID>` (the supervised lane, for a quick
ticket someone wrote down to run later).

## Ground rules for every ticket in this epic

- Every ticket here is self-contained. Work that depends on another unshipped
  ticket does not belong in this epic.
```

Read the root agent instructions and the instruction file of the area you
are about to touch. Then append a section using the next free `Q-<n>` — the
highest of the existing headings **and** the preamble's `Q-IDs continue at
Q-<n>` ground rule when one exists (after an era rollover the archived
numbers are absent from this document, and a reused number would read as
already shipped off main's commit subjects):

```markdown
## Q-<n> — <short name>

**Scope.**
- <what to change, concretely>

**Not in scope.** <the tempting adjacent work>

**Acceptance criteria.**
- <test command + expected result>
```

All three parts are required — compact is fine, absent is not. **"Not in
scope" matters more here**: a small ticket is where the adjacent temptation
is nearest. Show the user the ticket in a few lines and continue — **no
sign-off gate**; the ticket text lands in the pull request, where a wrong
reading is caught cheaply.

## 3. Branch from the default branch

```bash
git fetch origin --prune
git checkout -b q-<n> origin/<default-branch>
```

No epic branch: the branch carries the `epics/quick/` changes itself, so the
documents ship with the code. Commit the ticket-doc addition first:
`Q-<n>: plan`. A previous quick ticket's open pull request is fine — quick
tickets are independent by ground rule and do not stack.

## 4. Implement — in this session

This lane implements in the session that wrote the ticket: the
fresh-context worker's independence is worth its cost on epic tickets, not
on a bounded low-risk diff. The session guard marks the session at
invocation, so a later `/flow:ticket --interactive` in it is refused;
supervisor-mode tickets and further quick tickets stay open.

The ticket skill's execution rules bind:

- **Stay inside the ticket's scope.** "Not in scope" is binding.
- **Prefix every commit subject with the ticket ID** — `Q-7: fix the warning
  text`. The board reads subjects off the default branch to decide what has
  shipped.
- **When the change repairs something an ALREADY-SHIPPED ticket got wrong,
  end the subject `(fixes <ID>)`** — `Q-7: stop the crash on an empty token (fixes AUTH-3)`. That
  is an escaped defect: the review, the acceptance checks and the release
  check all passed and the defect shipped anyway, and nothing else in the
  repository records one, because the repair is this ticket, with its own
  entry and its own green ledger. `tickets.mjs metrics` counts them per
  shipped ticket, and the count is the only measure there is of what the
  gates did not catch. It does not disturb shipped detection, which reads
  `^<ID>[:\s]` at the START of the subject: that subject ships Q-7 and only
  Q-7. Only for a ticket that has SHIPPED — `doctor` warns when the named ID
  is planned and unshipped, because there was no released defect to escape.
- **Stage only your own hunks.** Never `git add -A` or `git add .`.
- Update the agent instruction files in the same commit as any change they
  describe.

## 5. Verify, then log — briefly

Run the acceptance criteria plus the standing checks for what you touched,
reading the commands from the project's instruction files. Report **counts**
— "api 217/217 passed", never "tests pass". A *demonstrate:* criterion is
driven for real, the observed screen or output recorded as evidence. A
criterion with `CHECK:` / `EXPECT:` lines runs through
`node "${CLAUDE_PLUGIN_ROOT}/scripts/tickets.mjs" check Q-<n>`, its ledger
pasted as the counts. A check that cannot run here is said so and recorded
as owed; never imply it passed. A ledger line reading `↓ skipped` is one of
those: the command exited 0 and the work it names never ran, and **a skipped
check is not a passed one**.
A criterion carrying a `COMPARE:` line is run here too, and the board script
never runs one — it has no browser. Serve the design source and the built page
with the project's own tooling, open each at every width the line names,
evaluate `node "${CLAUDE_PLUGIN_ROOT}/scripts/fidelity.mjs" extract` in both,
and compare the two reports with `fidelity.mjs diff … --map
epics/<name>/design-map.json --removed-from <the signed-off map> --source
<the COMPARE line's path>` — read with
`git show origin/<default-branch>:epics/<name>/design-map.json`, because a
removal is a planning decision and the map in the tree is the one this ticket
edits. Exit 0 is nothing differing or only declared removals, exit 1 is a
difference, and **exit 2 is "nothing was compared" — no landmark matched, or the two
reports were taken at different viewport widths, or a scoped map was not
told its `--source` — never "no differences"**.
Paste the table into the entry's `**Compared:**` field and answer every row —
fixed, recorded as a `**Deviation:**`, or already a declared removal. With no
browser here, or a design nothing can render, the comparison is **owed**, said
so, and a hand-written table is labelled as one.
Then the **revert check**: set the source
change aside, keep the tests, run — and name on the Verified line the test
that **fails with the source change reverted** (`revert check: n/a,
prose-only` for step 6's no-behaviour-change diff — documentation prose and
code comments, only). Nothing failing means the tests pin nothing, and the
ticket is not done until one does. The ticket skill's step 5 carries the
full procedure — the revert mechanism and flipping each new guard in turn
— and it binds here, along with the reason: the session that wrote the
code wrote the tests.

Append the status entry to `epics/quick/status.md`. If the file does not
exist, open it with this exact preamble — the block the epic skill's
template and the ticket skill's step 6 carry; **one rule, three documents: a
change to any copy moves the others in the same commit**:

```markdown
# Quick epic — status log

Append-only record of finished tickets. Tickets: `epics/quick/tickets.md`.

**Rules.** Append only. Corrections are new dated addenda beneath the entry they
correct, never edits. Report counts, not adjectives. The **Owed** line is
required even when empty.
```

The **entry** heading is parsed — match it exactly — then keep the body to
the ticket skill's step 6 fields: **Built / Mode / Tokens / Verified /
Compared (optional, required for every `COMPARE:` criterion) / Decisions /
Deviation (optional, one per departure) / Owed**, with `Mode:` =
`quick — in-session (/flow:quick)` and Decisions recording judgment calls, not
narration:

```markdown
### Q-<n> — <name> — <YYYY-MM-DD> — DONE
```

**A departure gets its own `**Deviation:**` line**, one per departure, between
Decisions and Owed — optional, omitted when there is none. What counts:
anything the ticket's documents or its design showed that you did not build, or
built differently; a judgment call the documents left open is not one and stays
in Decisions. A deviation is **never owed work**: an owed item is work someone
will do, a deviation is a decision someone must see. Inside Decisions prose it
is read by no command, which is how a design's hero band once went unbuilt and
shipped anyway. Several departures are several lines, and `deviations Q-<n>`
numbers them `Q-<n>.1`, `Q-<n>.2` … in document order — that is how a human
closes them one at a time, so write each to be read alone.

```markdown
**Deviation:** <what the documents or the design showed> → <what was built
instead, and why>
```

**`**Deviations closed:**` records a human's decision, never yours.** A dated line
naming each deviation as **accepted** or as **fixed in `<sha>`**, with who
decided and when, closing by its leading reference list the departures the named
entries recorded above it in the file — the shape the ticket skill's step 6
carries. **A bare closing line** — `**Deviations closed:** Q-<n>` — closes an
entry's one departure; facing more than one open it closes **nothing** and says
so, because accepted and fixed are decisions per departure and one wrongly
closed is gone from every brief with nobody having decided it. Do not write
one on your own authority, even for a departure you fixed in this same ticket:
a closure the party that made the departure could have decided clears nothing.
With the human in the session, ask for the decision and not for a sentence:
an explicit answer to the departure you showed — "accept", "fix it" — is the
decision, and you record the line quoting it, ending `recorded by the session
from <name>'s answer`. A missed estimate and a change made in answer to a
review finding are not deviations — the ticket skill's step 6 says why.
`node "${CLAUDE_PLUGIN_ROOT}/scripts/tickets.mjs" deviations Q-<n>` reads every
one this ticket recorded, closed or not, and reports any closing line that
closed nothing.

If this ticket discharges an owed item an earlier entry recorded, add
`**Resolves owed:** <ID> — <how>` on its own line — that marker removes the
item from every future brief. Use the entry ID when that entry owed one
thing and `<ID>.<n>` when it owed several (`brief` numbers an entry's
bullets in document order): a bare entry ID facing more than one open item
retires **nothing**, because a marker naming one item once closed four.
Write this entry's own **Owed** with one obligation per bullet, for the same
reason. Commit the entry with the work.

**If the log now runs past roughly 25 entries (or ~1,000 lines), say so to
the user**: the quick epic is due an **era rollover**, which `/flow:retro
quick` performs (owed items become tickets, the era is archived whole, a
fresh quick epic continues the ID sequence). The log and ticket doc ride
every quick branch and pull-request diff, so their growth taxes every
future ticket. Never roll over here yourself — the rollover is safe only
after the retro has converted the open owed items.

## 6. Review — only when behaviour changed, and cheaply

- **No behaviour change** means the diff touches **nothing any runtime,
  parser, test, or agent reads** — documentation prose and code comments,
  only. Then **skip the reviewer**: the pull request is the review; say so
  in the PR body ("prose-only; no separate review").
- **Everything else is a behaviour change**, including what looks harmless:
  a user-facing string (tests match on strings), configuration, CLI output
  (someone's script parses it), skill or agent Markdown (in a plugin, the
  Markdown is the program). Spawn `flow:ticket-reviewer` with the Agent tool
  on a **cost-efficient model** (a mid-tier model, `effort: medium`), told
  to follow the `/flow:review` skill.

  **The packet is fixed, and it is all the reviewer gets** — this session
  implemented the diff, which makes it the biased narrator the fresh
  context exists to exclude:

  - the commit range: `origin/<default-branch>..HEAD`;
  - `node "${CLAUDE_PLUGIN_ROOT}/scripts/tickets.mjs" brief Q-<n>` — ground
    rules, Scope, **Not in scope** (work outside it is a finding),
    Acceptance criteria, open owed items;
  - this ticket's **own** status entry, sliced from the log:
    `awk '/^### /{f=/^### Q-<n> /} f' epics/quick/status.md`;
  - the instruction files for the touched areas;
  - **with a `COMPARE:` criterion**: the epic's declared design sources and the
    signed-off design map (`git show origin/<default-branch>:epics/quick/design-map.json`),
    never the working tree's copy — the entry's `**Compared:**` table is a
    claim, and a reviewer given no design can only check it against itself.

  **Nothing else rides along**: no summary of what you built, no reasoning,
  no conversation content. It reports; it does not fix.
- When unsure which side a diff falls on, it is a behaviour change.
- Risk-trigger work cannot reach this step — step 1 routed it to
  `/flow:epic`.

Fix Important findings as new commits (`Q-<n>: … (review fix)`), re-run the
affected checks, and add one dated addendum line to the entry with the
outcome and the reviewer's token figure **as the harness reported it when
the reviewer stopped**, in the phrase `Reviewer tokens: <n>` (`unknown` when
it exposed nothing; the reviewer is never asked — it cannot see its own
counter) — the phrase `tickets.mjs spend` parses. **A nit does not become a
ticket by default**: fix it here if trivial and in scope, otherwise note it
in the addendum for the retro. **A regression this change introduced is not a
nit**: A user-visible regression this change introduces is Important, even outside the ticket's scope: scope limits what the worker builds, not what the reviewer reports. Fix it before the pull request, or name it as unfixed
in the pull request body so the human merging sees it. **Nor is a revert
check that does not hold**: a named test that passes without the change,
or an `n/a` whose reason does not hold, is Important on the same terms —
fix the tests so one pins the change, or name it as unfixed in the body.

## 7. Push, open the pull request, stop

```bash
node "${CLAUDE_PLUGIN_ROOT}/scripts/tickets.mjs" deviations Q-<n>
node "${CLAUDE_PLUGIN_ROOT}/scripts/tickets.mjs" compared Q-<n>
git push -u origin q-<n>
gh pr create --base <default-branch> --title "Q-<n>: <title>" --body "<body>"
```

The body carries: what changed and why, the acceptance criteria with counts,
the review outcome (or "prose-only; no separate review"), and any deploy
precondition. **A ticket carrying a `COMPARE:` criterion whose entry records
no comparison is named in the body in those words**, with the `**Compared:**`
table when it has one: the comparison is the criterion no command runs, so
the table is its only evidence, and this lane has no agent merge to refuse —
the person reading the pull request is the gate. And **a deviation is named in the pull request body** — the same
words the ticket lane's step 9 uses, because it is one rule at both doors:
under its own `## Deviations` heading, every departure the command above
reported, closed or not, each by **the reference the command printed** — a
bare `Q-<n>` when the entry recorded one departure, `Q-<n>.<n>` when it
recorded several, never a number invented for a lone one, which a closing line
copying it could not close — with its text, a closed one **with its closing
line**, and any `note:` line verbatim. A closed one is shown because only a
human may write that line and no command can say who did; a note is shown
because it means a closing line closed nothing — someone having tried to close
a departure and failed, which a reader counting only the closed ones would
never learn. Write the heading even when there is nothing to name,
with "none recorded" under it: this lane has no agent merge to refuse, so the
body is the only door a departure passes through — the person reading the pull
request is the gate, and an absent heading reads to them as an omission rather
than an answer. Say what departed and leave it there —
whether it is acceptable is their call, and this skill never suggests an
answer. Print the URL and stop — a human merges, and nothing runs after the
merge.
