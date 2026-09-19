// Tests for tickets.mjs, run with:  node --test plugins/flow/scripts/
//
// Everything the board reports is derived from string parsing of headings,
// commit subjects and branch names — so these tests build a real throwaway git
// repository (with a local bare "remote") and assert the derived states, rather
// than unit-testing parsers against strings that may drift from real usage.

import { test, after } from 'node:test'
import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { mkdtempSync, mkdirSync, writeFileSync, rmSync, realpathSync, readFileSync, chmodSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { tmpdir } from 'node:os'
import { fileURLToPath } from 'node:url'

const SCRIPT = join(dirname(fileURLToPath(import.meta.url)), 'tickets.mjs')

// Neutralise the developer's own git config (commit signing, hooks) so the
// fixture behaves identically everywhere.
const ENV = { ...process.env, GIT_CONFIG_GLOBAL: '/dev/null', GIT_CONFIG_SYSTEM: '/dev/null' }

const sh = (cwd, cmd, args) =>
  execFileSync(cmd, args, { cwd, encoding: 'utf8', env: ENV, stdio: ['ignore', 'pipe', 'pipe'] })
const git = (cwd, ...args) => sh(cwd, 'git', args)
const run = (cwd, ...args) => sh(cwd, process.execPath, [SCRIPT, ...args])
const runFail = (cwd, ...args) => {
  try {
    sh(cwd, process.execPath, [SCRIPT, ...args])
    return null
  } catch (e) {
    return { status: e.status, stderr: String(e.stderr), stdout: String(e.stdout) }
  }
}

// ── fixture ──────────────────────────────────────────────────────────────────
// alpha epic, four tickets:
//   A-1  commit subject on origin/main            -> shipped
//   A-2  valid DONE heading in status.md          -> done
//   A-3  local branch with commits; its status
//        heading is malformed (missing date) and
//        must NOT count as done                   -> in-progress
//   A-4  nothing anywhere; stale ✅ in title       -> todo, glyph stripped

const tmp = realpathSync(mkdtempSync(join(tmpdir(), 'tickets-test-')))
const remote = join(tmp, 'remote.git')
const repo = join(tmp, 'repo')
after(() => rmSync(tmp, { recursive: true, force: true }))

// gamma declares `Worker runner: codex`, so doctor probes codex on every run.
// A fake binary on PATH and a signed-in CODEX_HOME make the probe pass here
// and on CI without Codex; dedicated tests below take them away again.
const fakeBin = join(tmp, 'bin')
mkdirSync(fakeBin)
writeFileSync(join(fakeBin, 'codex'), '#!/bin/sh\necho fake-codex 0.0.0\n')
chmodSync(join(fakeBin, 'codex'), 0o755)
const codexHome = join(tmp, 'codex-home')
mkdirSync(codexHome)
writeFileSync(join(codexHome, 'auth.json'), '{}')
ENV.PATH = `${fakeBin}:${process.env.PATH}`
ENV.CODEX_HOME = codexHome
delete ENV.OPENAI_API_KEY

git(tmp, 'init', '--bare', '--initial-branch=main', remote)
git(tmp, 'init', '--initial-branch=main', repo)
git(repo, 'config', 'user.email', 'test@example.com')
git(repo, 'config', 'user.name', 'Test')
git(repo, 'config', 'commit.gpgsign', 'false')

mkdirSync(join(repo, 'epics/alpha'), { recursive: true })
writeFileSync(
  join(repo, 'epics/alpha/tickets.md'),
  `# Alpha epic — tickets

Delivery: incremental

## A-1 — ship the walking skeleton

**Scope.** The skeleton.

## A-2 — persist the results

**Scope.** Persistence.

## A-3 — handle the error path

**Scope.** Errors.

## A-4 — polish the output ✅

**Scope.** Polish.
`,
)
writeFileSync(
  join(repo, 'epics/alpha/status.md'),
  `# Alpha epic — status log

### A-1 — ship the walking skeleton — 2026-07-30 — DONE

**Built:** the skeleton.

**Owed:** Nothing.

### A-2 — persist the results — 2026-08-01 — DONE

**Built:** persistence.

**Owed:** the flaky persistence test is quarantined —
A-3 inherits re-enabling it.

### A-3 — handle the error path — DONE

Malformed on purpose: no date, so this heading must not parse.
`,
)

// gamma: a release epic with a prose-decorated Delivery line — the
// tolerant-parse case. Its Reviewer model and Worker model lines are
// prose-decorated too: the value is the first word after the colon, the
// rest is commentary.
mkdirSync(join(repo, 'epics/gamma'), { recursive: true })
writeFileSync(
  join(repo, 'epics/gamma/tickets.md'),
  `# Gamma epic — tickets

Delivery: release — one human gate, at the release pull request.

Reviewer model: opus — for the consequence tier.

Worker model: sonnet — implementation runs cheaper than planning.

Worker runner: codex — the Codex CLI implements, through the plugin runner.

Shadow reviewer: codex — a Codex review beside the Claude reviewer, gating nothing.

Planner model: fable — the plan reviewer runs on the strongest class.

Consequence paths: src/auth/**, migrations/** — the risk list as globs.

Fix bounds exclude: src/messages/*.json — translation fan-outs never count toward fix bounds.

Ticket budget: 250000 — the run halts after any ticket spending past this.

## G-1 — expand the schema

**Scope.** Expansion.
`,
)

git(repo, 'add', '.')
git(repo, 'commit', '-m', 'A-1: ship the walking skeleton')
git(repo, 'remote', 'add', 'origin', remote)
git(repo, 'push', '-u', 'origin', 'main')
git(repo, 'remote', 'set-head', 'origin', 'main')

git(repo, 'checkout', '-b', 'a-3')
writeFileSync(join(repo, 'errors.txt'), 'wip\n')
git(repo, 'add', 'errors.txt')
git(repo, 'commit', '-m', 'A-3: wip on the error path')
git(repo, 'checkout', 'main')

// ── tests ────────────────────────────────────────────────────────────────────

test('board derives each state from git, not from any stored status', () => {
  const data = JSON.parse(run(repo, 'list', '--json'))
  const state = Object.fromEntries(data.tickets.map((t) => [t.id, t.state]))

  assert.equal(state['A-1'], 'shipped', 'commit subject on origin/main means shipped')
  assert.equal(state['A-2'], 'done', 'valid DONE heading, nothing shipped')
  assert.equal(state['A-3'], 'in-progress', 'malformed DONE heading must not count; local branch with commits wins')
  assert.equal(state['A-4'], 'todo')

  assert.equal(data.defaultBranch, 'main')
  assert.equal(data.onMainCapped, false)
  assert.deepEqual(data.duplicates, {})
})

test('a stale status glyph in a ticket heading is stripped from the title', () => {
  const data = JSON.parse(run(repo, 'list', '--json'))
  const a4 = data.tickets.find((t) => t.id === 'A-4')
  assert.equal(a4.title, 'polish the output')
})

test('find resolves a lowercase ID to absolute paths', () => {
  const out = JSON.parse(run(repo, 'find', 'a-2', '--json'))
  assert.equal(out.id, 'A-2')
  assert.equal(out.epic, 'alpha')
  assert.equal(out.branch, 'a-2')
  assert.equal(out.repoRoot, repo)
  assert.equal(out.ticketsDoc, join(repo, 'epics/alpha/tickets.md'))
  assert.equal(out.statusDoc, join(repo, 'epics/alpha/status.md'))
  assert.equal(out.statusDocExists, true)
})

test('find refuses an unknown ID and lists what it knows', () => {
  const fail = runFail(repo, 'find', 'A-99')
  assert.equal(fail.status, 1)
  assert.match(fail.stderr, /no ticket "A-99"/)
  assert.match(fail.stderr, /A-1/)
})

test('plain find renders the PR as number, state and URL, never [object Object]', () => {
  // pr is the one object among find's facts, and raw interpolation printed
  // "pr [object Object]" (BOARD-3's review, pre-existing; Q-9). pullRequests()
  // shells out to gh, which always fails against this fixture's local bare
  // origin — so stub gh on PATH for this one run to put a PR on the board.
  const bin = join(tmp, 'fake-gh-bin')
  mkdirSync(bin, { recursive: true })
  writeFileSync(
    join(bin, 'gh'),
    '#!/bin/sh\necho \'[{"number":7,"headRefName":"a-4","baseRefName":"main","state":"OPEN","url":"https://example.invalid/pull/7","isDraft":false}]\'\n',
    { mode: 0o755 },
  )
  try {
    const out = execFileSync(process.execPath, [SCRIPT, 'find', 'A-4'], {
      cwd: repo,
      encoding: 'utf8',
      env: { ...ENV, PATH: `${bin}:${process.env.PATH}` },
      stdio: ['ignore', 'pipe', 'pipe'],
    })
    // Pin the composed line (the Q-8 lesson: fragments can't tell branches
    // apart). "pr".padEnd(22) plus the joining space is 21 spaces after "pr".
    assert.match(out, /^pr {21}#7 \(OPEN\) https:\/\/example\.invalid\/pull\/7$/m, 'the PR renders as number, state and URL')
    assert.ok(!out.includes('[object Object]'), 'no raw object stringification anywhere in the output')
  } finally {
    rmSync(bin, { recursive: true, force: true })
  }
  // Without a PR the line is untouched: null, never a phantom render.
  assert.match(run(repo, 'find', 'A-2'), /^pr {21}null$/m)
})

test('next proposes the first unstarted ticket in document order', () => {
  const open = JSON.parse(run(repo, 'next', '--json'))
  assert.deepEqual(open.map((t) => t.id), ['A-4', 'G-1'])
})

test('next refuses an unknown epic filter instead of reporting an empty board', () => {
  // "nothing left to start" from a typo'd epic name is indistinguishable from
  // a finished epic (BOARD-2). Plain and --json alike: stderr names the
  // missing epic, exit 1, and the --json form emits no payload.
  for (const args of [['next', 'no-such-epic'], ['next', 'no-such-epic', '--json']]) {
    const fail = runFail(repo, ...args)
    assert.ok(fail, `\`${args.join(' ')}\` must exit nonzero`)
    assert.equal(fail.status, 1)
    assert.match(fail.stderr, /no epic "no-such-epic" under epics\//)
    assert.equal(fail.stdout, '', 'no payload on the error')
  }
  // A valid filter is untouched — the driver contract reads this between tickets.
  const open = JSON.parse(run(repo, 'next', 'alpha', '--json'))
  assert.deepEqual(open.map((t) => t.id), ['A-4'])
})

test('list refuses an unknown epic filter instead of reporting an empty board', () => {
  for (const args of [['list', 'no-such-epic'], ['list', 'no-such-epic', '--json']]) {
    const fail = runFail(repo, ...args)
    assert.ok(fail, `\`${args.join(' ')}\` must exit nonzero`)
    assert.equal(fail.status, 1)
    assert.match(fail.stderr, /no epic "no-such-epic" under epics\//)
    assert.equal(fail.stdout, '', 'no payload on the error')
  }
  // A valid filter is untouched.
  const data = JSON.parse(run(repo, 'list', 'alpha', '--json'))
  assert.deepEqual(data.epics, ['alpha'])
})

test('a real epic with no ticket sections is reported as ticketless, not nonexistent', () => {
  // The filtered-empty branch of printBoard is only reachable for an epic
  // that exists but has no `## <ID> — …` sections — an unknown filter errors
  // at the entry point before it (BOARD-2). The old string here claimed
  // `no epic "<x>" under epics/` for a real epic, at exit 0, on stdout —
  // the same lie the guard removed. Pin the honest wording.
  mkdirSync(join(repo, 'epics/hollow'), { recursive: true })
  writeFileSync(join(repo, 'epics/hollow/tickets.md'), '# Hollow epic — tickets\n\nNo sections yet.\n')
  try {
    const out = run(repo, 'list', 'hollow')
    assert.match(out, /epic "hollow" has no tickets yet/)
    assert.ok(!/no epic "hollow" under epics\//.test(out), 'a real epic must never be reported as nonexistent')
  } finally {
    rmSync(join(repo, 'epics/hollow'), { recursive: true, force: true })
  }
})

test('unfiltered list names ticketless epics instead of claiming no epics exist', () => {
  // Epic folders exist but none has a `## <ID> — …` section yet. The
  // unfiltered board used to print "no epics found under epics/" — the same
  // existing-work-reported-as-nonexistent lie the filtered branch told
  // (BOARD-2's review, pre-existing; Q-8). Name each epic and its empty
  // state instead. Needs its own repo: the shared fixture always has tickets.
  const barren = join(tmp, 'barren')
  git(tmp, 'init', '--initial-branch=main', barren)
  mkdirSync(join(barren, 'epics/hollow'), { recursive: true })
  writeFileSync(join(barren, 'epics/hollow/tickets.md'), '# Hollow epic — tickets\n\nNo sections yet.\n')
  const out = run(barren, 'list')
  // Pin the composed line, not fragments — the filtered branch's message
  // (`epic "hollow" has no tickets yet`) also contains both fragments, so
  // independent matches could not tell the two branches apart (review fix;
  // the sibling BOARD-2 test above pins its exact string the same way).
  assert.match(out, /^hollow — no tickets yet$/m, 'the epic is named with its empty state, as one line')
  assert.ok(!/no epics found/.test(out), 'existing epics must not be reported as nonexistent')

  // A repo with no epics/ at all keeps the honest "no epics found" answer.
  const empty = join(tmp, 'no-epics-at-all')
  git(tmp, 'init', '--initial-branch=main', empty)
  assert.match(run(empty, 'list'), /no epics found under epics\//)
})

test('mixed board names ticketless epics beside ticketed ones', () => {
  // When at least one epic has tickets, printBoard's per-epic loop used to
  // `continue` past an epic with no `## <ID> — …` sections — that epic was
  // absent from the unfiltered board entirely: existing work reported as
  // nonexistent, Q-8's defect class at larger blast radius (Q-8's review,
  // pre-existing; Q-15). Needs its own repo: the shared fixture's epics all
  // have tickets, and the barren repo above has none.
  const mixed = join(tmp, 'mixed')
  git(tmp, 'init', '--initial-branch=main', mixed)
  mkdirSync(join(mixed, 'epics/peopled'), { recursive: true })
  writeFileSync(
    join(mixed, 'epics/peopled/tickets.md'),
    '# Peopled epic — tickets\n\n## P-1 — the one ticket\n\n**Scope.** One.\n',
  )
  mkdirSync(join(mixed, 'epics/hollow'), { recursive: true })
  writeFileSync(join(mixed, 'epics/hollow/tickets.md'), '# Hollow epic — tickets\n\nNo sections yet.\n')
  const out = run(mixed, 'list')
  // Pin composed lines, not fragments (the Q-8 lesson: the filtered branch's
  // message contains the same fragments, so pieces can't tell branches apart).
  assert.match(out, /^hollow — no tickets yet$/m, 'the ticketless epic is named with its empty state')
  assert.match(out, /^peopled — 1 tickets/m, 'the ticketed epic still renders its header')
  assert.match(out, /^  P-1 /m, 'the ticketed epic still lists its tickets')
})

test('a ticketless epic carries the ← this folder marker in its own checkout', () => {
  // A checkout whose root directory is named after an epic IS that epic's
  // folder — the one-checkout-per-epic convention `currentEpic` reads — and a
  // ticketless epic is exactly a freshly-cut epic's state. `ticketlessLine`
  // used to render the empty state without the marker every ticketed epic
  // gets, so the board showed the marker on no epic at all in the checkout
  // that most needs it, while `current` answered correctly (Q-15's review,
  // pre-existing; Q-17). Both renderings share the one line, so one repo
  // covers both branches: the all-empty board first, then the mixed board
  // once a ticketed epic appears beside it. Composed lines pinned to the
  // line's end, per Q-8's review lesson — a `$` after the marker is also
  // what proves the unmarked assertions below carry no marker.
  const hollow = join(tmp, 'hollow')
  git(tmp, 'init', '--initial-branch=main', hollow)
  mkdirSync(join(hollow, 'epics/hollow'), { recursive: true })
  writeFileSync(join(hollow, 'epics/hollow/tickets.md'), '# Hollow epic — tickets\n\nNo sections yet.\n')

  // All-empty board (Q-8's branch): the empty-state line carries the marker.
  assert.match(
    run(hollow, 'list'),
    /^hollow — no tickets yet {2}← this folder$/m,
    "the all-empty board marks the checkout's own ticketless epic",
  )

  // Mixed board (Q-15's branch): same line, same marker, beside a ticketed
  // epic that stays unmarked — the marker names exactly one folder.
  mkdirSync(join(hollow, 'epics/peopled'), { recursive: true })
  writeFileSync(
    join(hollow, 'epics/peopled/tickets.md'),
    '# Peopled epic — tickets\n\n## P-1 — the one ticket\n\n**Scope.** One.\n',
  )
  const out = run(hollow, 'list')
  assert.match(out, /^hollow — no tickets yet {2}← this folder$/m, "the mixed board marks the checkout's own ticketless epic")
  assert.match(out, /^peopled — 1 tickets · 1 todo$/m, 'the ticketed epic renders unmarked')
})

test('a ticketed epic carries the ← this folder marker in its own checkout', () => {
  // The other side of the shared `hereMarker` helper. The ticketed header's
  // marker was pinned by no test — before Q-17 it was an inline expression,
  // after it a call — so a future edit dropping it from the ticketed branch
  // would ship silently while the ticketless test above stayed green (Q-17's
  // review). It needs its own repo: the sibling test's root is named after
  // its *ticketless* epic, where the ticketed neighbour must stay unmarked to
  // be discriminating. Here the root names the ticketed epic, so the
  // expectations invert — which is what makes the pair cover both branches.
  const peopled = join(tmp, 'peopled')
  git(tmp, 'init', '--initial-branch=main', peopled)
  mkdirSync(join(peopled, 'epics/peopled'), { recursive: true })
  writeFileSync(
    join(peopled, 'epics/peopled/tickets.md'),
    '# Peopled epic — tickets\n\n## P-1 — the one ticket\n\n**Scope.** One.\n',
  )
  mkdirSync(join(peopled, 'epics/hollow'), { recursive: true })
  writeFileSync(join(peopled, 'epics/hollow/tickets.md'), '# Hollow epic — tickets\n\nNo sections yet.\n')
  const out = run(peopled, 'list')
  assert.match(out, /^peopled — 1 tickets · 1 todo {2}← this folder$/m, "the ticketed epic header marks the checkout's own epic")
  assert.match(out, /^hollow — no tickets yet$/m, 'the ticketless neighbour renders unmarked')
})

test('Next up suggests the installed, namespaced command', () => {
  // Plugin commands are namespaced: the installed command is /flow:ticket.
  // A bare /ticket suggestion is a live regression — a user ran it verbatim
  // and got "Unknown command" (BOARD-1).
  const out = run(repo, 'list')
  assert.match(out, /\/flow:ticket A-4/, 'Next up proposes the namespaced command')
  assert.ok(!/(?<!flow:)\/ticket /.test(out), `found a bare /ticket suggestion in:\n${out}`)
})

test('brief prints a ticket\'s full section plus the derived facts find reports', () => {
  // The brief exists so a session can read the next ticket's scope and
  // acceptance criteria from one command instead of opening the ticket doc
  // (BOARD-3). --json is the find payload plus preamble, owed, notes and
  // body — the whole required reading for a fresh worker, O(epic) not
  // O(history).
  const briefed = JSON.parse(run(repo, 'brief', 'a-2', '--json'))
  const found = JSON.parse(run(repo, 'find', 'a-2', '--json'))
  assert.deepEqual(
    briefed,
    {
      ...found,
      preamble: briefed.preamble,
      owed: briefed.owed,
      notes: briefed.notes,
      deviations: briefed.deviations,
      deviationNotes: briefed.deviationNotes,
      body: briefed.body,
    },
    'the brief payload is the find payload plus preamble, owed, notes, deviations, deviationNotes and body',
  )
  assert.match(briefed.body, /\*\*Scope\.\*\* Persistence\./, 'the body carries the section content')

  const out = run(repo, 'brief', 'A-2')
  assert.match(out, /A-2 — persist the results/)
  assert.match(out, /state done/, 'the derived state is reported')
  assert.match(out, /\*\*Scope\.\*\* Persistence\./)
})

test('brief carries the epic preamble and the recorded owed items, Nothing filtered out', () => {
  const briefed = JSON.parse(run(repo, 'brief', 'a-4', '--json'))
  assert.match(briefed.preamble, /Delivery: incremental/, 'the preamble is the text above the first ticket heading')
  assert.ok(!briefed.preamble.includes('## A-1'), 'the preamble stops at the first ticket section')
  // A-1 owed "Nothing." and must not appear; A-2's owed paragraph spans two
  // source lines and must arrive joined, attributed to its entry.
  assert.deepEqual(briefed.owed, [
    { id: 'A-2', date: '2026-08-01', text: 'the flaky persistence test is quarantined — A-3 inherits re-enabling it.' },
  ])

  const out = run(repo, 'brief', 'A-4')
  // The heading is honest about what the list is: recorded state, not
  // verified truth — an item may be discharged without its marker.
  assert.match(out, /Owed items — recorded, not marked resolved/)
  assert.match(out, /A-2 \(2026-08-01\): the flaky persistence test is quarantined/)
  assert.ok(!/Nothing\./.test(out.split('Owed items')[1].split('Ticket')[0]), 'a Nothing entry never renders as owed')

  // An epic with no status log yet has nothing owed — never an error.
  assert.deepEqual(JSON.parse(run(repo, 'brief', 'G-1', '--json')).owed, [])
})

test('a Resolves owed line closes a recorded owed item; unresolved ones survive', () => {
  // Resolution is explicit, never inferred: the entry ID that recorded the
  // debt is the item's identity (one Owed paragraph per entry), and a
  // later "**Resolves owed:** <ID> …" line — in the discharging ticket's
  // entry or a dated addendum — removes it from every future brief.
  const ledger = join(tmp, 'ledger')
  git(tmp, 'init', '--initial-branch=main', ledger)
  mkdirSync(join(ledger, 'epics/omega'), { recursive: true })
  writeFileSync(
    join(ledger, 'epics/omega/tickets.md'),
    '# Omega\n\n## O-1 — first\n\n**Scope.** One.\n\n## O-2 — second\n\n**Scope.** Two.\n\n## O-3 — third\n\n**Scope.** Three.\n\n## O-4 — next up\n\n**Scope.** Four.\n',
  )
  writeFileSync(
    join(ledger, 'epics/omega/status.md'),
    `# Omega epic — status log

### O-1 — first — 2026-08-01 — DONE

**Owed:** the migration backfill — O-2 inherits it.

### O-2 — second — 2026-08-02 — DONE

**Owed:** Nothing.

**Resolves owed:** O-1 — backfill ran, 312/312 rows verified; O-3's region
work is unrelated and unaffected.

### O-3 — third — 2026-08-03 — DONE

**Owed:** the load test still needs a second region.
`,
  )
  const briefed = JSON.parse(run(ledger, 'brief', 'O-4', '--json'))
  assert.deepEqual(
    briefed.owed,
    [{ id: 'O-3', date: '2026-08-03', text: 'the load test still needs a second region.' }],
    "O-1 is resolved and gone; O-3 survives — the note's mention of O-3 is a citation, not a target",
  )
  const out = run(ledger, 'brief', 'O-4')
  assert.ok(!out.includes('backfill'), 'a resolved item never renders')
  assert.match(out, /O-3 \(2026-08-03\): the load test still needs a second region\./)
})

// ── deviations ───────────────────────────────────────────────────────────────
// A deviation is what a ticket's documents or design showed and the ticket did
// not build, or built differently. Recorded inside the **Decisions:** prose it
// used to be sent to, it reached no command and no human; on its own line it is
// parsed, carried into every later brief until a human closes it, and readable
// per ticket — closed or not — through its own subcommand.

const DELTA_TICKETS =
  '# Delta epic — tickets\n\nDelivery: release\n\n' +
  '## D-1 — the landing page\n\n**Scope.** The page.\n\n' +
  '## D-2 — the results list\n\n**Scope.** The list.\n\n' +
  '## D-3 — next up\n\n**Scope.** Three.\n'

// One log exercising every branch of the parse at once: several deviations
// under one entry, closed item by item; a Decisions paragraph that talks about
// a deviation in prose and must stay prose; a closing line whose LEADING
// reference list is what closes, with another ID cited in its note; and a
// deviation recorded BELOW that line
// under a second entry with the same ID — a BLOCKED ticket redone — which must
// not be born closed.
const DELTA_STATUS = `# Delta epic — status log

Append-only record of finished tickets. Tickets: \`epics/delta/tickets.md\`.

### D-1 — the landing page — 2026-09-01 — DONE

**Built:** the page.

**Deviation:** the design showed a hero band above the fold → built without
it, because the asset pipeline cannot resize the source image yet.

**Deviation:** the design showed a sticky nav → built as a static header,
because sticky positioning fought the existing scroll container.

**Decisions:** the copy deck left the subtitle open and we picked the shorter
one; every deviation from the design is on its own line above, and this
paragraph's mention of one is prose.

**Owed:** Nothing.

### D-2 — the results list — 2026-09-02 — DONE

**Built:** the list.

**Deviation:** the spec showed server-side paging → built client-side,
because the endpoint has no cursor.

**Owed:** Nothing.

**Addendum — 2026-09-03 — deviations decided.**

**Deviations closed:** D-1.1, D-1.2 — the hero band accepted; D-2's paging is a
separate decision and is untouched here; the sticky nav fixed in 9f3a21c;
Vadim; 2026-09-03.

### D-1 — the landing page, redone — 2026-09-04 — DONE

**Built:** the redo.

**Deviation:** the design showed three footer links → built with one,
because two of the three have no destination yet.

**Owed:** Nothing.
`

function deltaRepo(name, status = DELTA_STATUS) {
  const dir = join(tmp, name)
  git(tmp, 'init', '--initial-branch=main', dir)
  mkdirSync(join(dir, 'epics/delta'), { recursive: true })
  writeFileSync(join(dir, 'epics/delta/tickets.md'), DELTA_TICKETS)
  writeFileSync(join(dir, 'epics/delta/status.md'), status)
  return dir
}

test('deviations reports every one a ticket recorded, with its closure and the closing line', () => {
  const dir = deltaRepo('deviations')
  const d1 = JSON.parse(run(dir, 'deviations', 'd-1', '--json'))
  assert.equal(d1.ticket, 'D-1')
  assert.equal(d1.count, 3, "D-1's two entries record three departures between them")
  assert.equal(d1.open, 1)
  assert.deepEqual(
    d1.deviations.map((d) => [d.item, d.recorded, d.closed]),
    [
      ['D-1.1', '2026-09-01', true],
      ['D-1.2', '2026-09-01', true],
      ['D-1.3', '2026-09-04', false],
    ],
    'both 09-01 departures are closed by the line beneath them, item by item; the 09-04 one, recorded below that line, is not born closed',
  )
  assert.deepEqual(d1.notes, [], 'a line that named its items closed them, so it earns no note')
  assert.match(d1.deviations[0].text, /hero band above the fold → built without it, because the asset pipeline/,
    'the paragraph runs to the first blank line, wrapped lines joined')
  assert.match(d1.deviations[0].closedBy, /D-1\.1, D-1\.2 — the hero band accepted;.*9f3a21c; Vadim; 2026-09-03/,
    'the closing line travels with what it closed, wrapped lines joined')
  assert.equal(d1.deviations[2].closedBy, null)
  assert.ok(
    !d1.deviations.some((d) => /subtitle/.test(d.text)),
    'a Decisions paragraph that discusses a deviation in prose is prose, and parses as nothing',
  )

  const d2 = JSON.parse(run(dir, 'deviations', 'D-2', '--json'))
  assert.equal(d2.count, 1)
  assert.equal(d2.open, 1, "only the closing line's LEADING reference list closes — D-2 cited in its note is a citation")
  assert.equal(d2.deviations[0].item, 'D-2', 'an ID that recorded one departure keeps its bare ID')
  assert.deepEqual(JSON.parse(run(dir, 'deviations', 'D-3', '--json')).deviations, [],
    'a ticket that recorded none answers with an empty list, exit 0')

  const plain = run(dir, 'deviations', 'D-1')
  assert.match(plain, /3 recorded, 1 not yet closed by a human/)
  assert.match(plain, /closed  D-1\.1 \(2026-09-01\)/)
  assert.match(plain, /open\s+D-1\.3 \(2026-09-04\)/)
  assert.match(plain, /closed by: D-1\.1, D-1\.2 — the hero band accepted;/)
})

// ── deviations, item by item ─────────────────────────────────────────────────
// An ID that recorded several departures numbers them across every entry it
// heads, and a closing line names the items. A BARE closing line facing more
// than one open deviation closes NOTHING: "accepted" and "fixed in <sha>" are
// decisions per departure, and the asymmetry is the same one the owed ledger
// learned downstream — a deviation wrongly left open costs a human one reread,
// while one wrongly closed is gone from every brief and every attended door
// with nobody having decided it.

const ECHO_TICKETS =
  '# Echo epic — tickets\n\nDelivery: release\n\n' +
  '## E-1 — the landing page\n\n**Scope.** The page.\n\n' +
  '## E-2 — the results list\n\n**Scope.** The list.\n\n' +
  '## E-3 — the footer\n\n**Scope.** The footer.\n\n' +
  '## E-4 — next up\n\n**Scope.** Four.\n'

// E-1 records two departures in its first entry — the second written directly
// above `**Owed:**` with no blank line between them, which must not swallow the
// next field's markup — and a third in a later entry, because an ID can head
// more than one. E-2 records one, so a bare line still closes it. The addendum
// then tries every way a closing line can name nothing: one line naming E-1 and
// E-2 together — bare against E-1's two, and the one form that still closes
// E-2's only departure — a number past the end, an ID a reference ends inside, an ID this
// log records no departure for, and two references — `E-1.3` and a bare `E-3`
// — that point at departures recorded BELOW them, which position is what
// refuses: a line closed what was written above it, never what came later.
const ECHO_STATUS = `# Echo epic — status log

Append-only record of finished tickets. Tickets: \`epics/echo/tickets.md\`.

### E-1 — the landing page — 2026-09-01 — DONE

**Built:** the page.

**Deviation:** the design showed a hero band above the fold → built without it,
because the asset pipeline cannot resize the source image yet.

**Deviation:** the design showed a sticky nav → built as a static header,
because sticky positioning fought the existing scroll container.
**Owed:** Nothing.

### E-2 — the results list — 2026-09-02 — DONE

**Built:** the list.

**Deviation:** the spec showed server-side paging → built client-side, because
the endpoint has no cursor.

**Owed:** Nothing.

**Addendum — 2026-09-03 — deviations decided.**

**Deviations closed:** E-1, E-2 — all of them, accepted; Vadim; 2026-09-03.

**Deviations closed:** E-1.7 — accepted; Vadim; 2026-09-03.

**Deviations closed:** E-1oops — accepted; Vadim; 2026-09-03.

**Deviations closed:** E-9 — accepted; Vadim; 2026-09-03.

**Deviations closed:** E-1.3 — accepted; Vadim; 2026-09-03.

**Deviations closed:** E-3 — accepted; Vadim; 2026-09-03.

### E-3 — the footer — 2026-09-04 — DONE

**Deviation:** the design showed three footer links → built with one, because
two of the three have no destination yet.

**Owed:** Nothing.

### E-1 — the landing page, redone — 2026-09-05 — DONE

**Deviation:** the design showed a search field in the header → built without
one, because there is nothing to search yet.

**Owed:** Nothing.
`

function echoRepo(name, extra = '') {
  const dir = join(tmp, name)
  git(tmp, 'init', '--initial-branch=main', dir)
  mkdirSync(join(dir, 'epics/echo'), { recursive: true })
  writeFileSync(join(dir, 'epics/echo/tickets.md'), ECHO_TICKETS)
  writeFileSync(join(dir, 'epics/echo/status.md'), ECHO_STATUS + extra)
  return dir
}

const noteOf = (payload, re) => payload.notes.filter((n) => re.test(n))

test('a bare closing line closes a lone deviation, and against several closes nothing', () => {
  const dir = echoRepo('deviations-bare')
  const e1 = JSON.parse(run(dir, 'deviations', 'E-1', '--json'))
  assert.deepEqual(
    e1.deviations.map((d) => [d.item, d.closed]),
    [['E-1.1', false], ['E-1.2', false], ['E-1.3', false]],
    'the bare line faced two open departures, so it closed neither — one wrongly closed is a decision nobody made; the third, recorded below every closing line, was never the line\'s to close',
  )
  assert.equal(e1.open, 3)
  assert.equal(noteOf(e1, /had 2 open deviations/).length, 1, 'the line that closed nothing says so, once')
  assert.match(e1.notes[0], /bare closing line closes an entry's deviation only when exactly one was open above it/)
  assert.match(e1.notes[0], /`E-1\.1`, `E-1\.2`/, 'the note names the repair in the form that works')

  const e2 = JSON.parse(run(dir, 'deviations', 'E-2', '--json'))
  assert.deepEqual(e2.deviations.map((d) => [d.item, d.closed]), [['E-2', true]],
    'an entry that recorded one departure is still closed by its bare ID — the form every log written before this used')
  assert.deepEqual(e2.notes, [], 'a bare line that closed its one departure earns no note')

  const e3 = JSON.parse(run(dir, 'deviations', 'E-3', '--json'))
  assert.deepEqual(e3.deviations.map((d) => [d.item, d.closed]), [['E-3', false]],
    'a bare line naming E-3 stood above E-3\'s only departure, so it closed nothing — a departure is never born closed')
  assert.deepEqual(e3.notes, [], 'and a line that named nothing open above it is silent, not noisy')

  assert.match(run(dir, 'deviations', 'E-1'), /note:.*had 2 open deviations/, 'the note reaches the plain reader too')
})

test('a reference naming no deviation, and an ID a reference ends inside, close nothing and say so', () => {
  const dir = echoRepo('deviations-badrefs')
  const e1 = JSON.parse(run(dir, 'deviations', 'E-1', '--json'))
  assert.equal(noteOf(e1, /reference `E-1\.7` names no deviation/).length, 1,
    'a number past the end of the entry is reported, not silently read as a closure')
  assert.ok(
    e1.notes.every((n) => !/\*\*Deviations closed:\*\* E-1\b/.test(n)),
    'no note quotes a closing line back: the line above named E-1 and E-2 together, so a reconstructed one-ID line is text the reader will not find',
  )
  assert.match(e1.notes.join('\n'), /E-1 records 2 \(`E-1\.1`, `E-1\.2`\) above that line/)
  assert.equal(noteOf(e1, /reference `E-1\.3` names no deviation/).length, 1,
    'a reference to a departure recorded BELOW it named nothing when it was written, and is reported as the mistyped number it cannot be told apart from')
  assert.equal(noteOf(e1, /names `E-1oops`, and an ID has to end where the reference ends/).length, 1,
    'an ID that does not end where the reference ends closes nothing — reading the prefix is the silent discharge — and the note quotes it as the writer spelled it')
  assert.equal(e1.open, 3, 'no malformed or premature line closed anything')
  assert.ok(!JSON.stringify(e1.notes).includes('E-9'),
    'an ID this log records no departure for is a legal thing to write, and earns no permanent note')
})

test('naming an item closes that one, leaves the rest open, and clears the note', () => {
  // The repair the note asks for is the only thing that clears it: a note whose
  // exit was naming deviations that are still open would push a writer toward
  // closing a departure nobody decided on.
  const dir = echoRepo(
    'deviations-itemised',
    '\n**Deviations closed:** E-1.2 — the sticky nav, fixed in 9f3a21c; Vadim; 2026-09-05.\n',
  )
  const e1 = JSON.parse(run(dir, 'deviations', 'E-1', '--json'))
  assert.deepEqual(
    e1.deviations.map((d) => [d.item, d.closed]),
    [['E-1.1', false], ['E-1.2', true], ['E-1.3', false]],
    'the item form closes the one it names and leaves the others open',
  )
  assert.match(e1.deviations[1].closedBy, /the sticky nav, fixed in 9f3a21c; Vadim; 2026-09-05/)
  assert.equal(e1.deviations[0].closedBy, null)
  assert.equal(noteOf(e1, /had 2 open deviations/).length, 0,
    'the bare line above it is superseded by the itemisation, so its note is cleared')
  assert.deepEqual(e1.notes, [],
    'and the wrong-reference notes above it clear too: `E-1.2` is written BELOW them and names a departure of the same entry correctly, which is the repair all three notes prescribe')

  // Closed twice: the decision a reader wants is the one that was made, not the
  // last line to mention it.
  const twice = echoRepo(
    'deviations-closed-twice',
    '\n**Deviations closed:** E-1.2 — the sticky nav, fixed in 9f3a21c; Vadim; 2026-09-05.\n' +
      '\n**Deviations closed:** E-1.2 — still fine; Vadim; 2026-09-06.\n',
  )
  const again = JSON.parse(run(twice, 'deviations', 'E-1', '--json'))
  assert.match(again.deviations[1].closedBy, /fixed in 9f3a21c; Vadim; 2026-09-05/,
    'the first closing line stands; a later one naming the same departure does not overwrite who decided and when')
})

test('brief never says none outstanding above a note about a line that closed nothing', () => {
  // Cosmetic, from the same review: the heading's "none outstanding" is a claim
  // about the epic, and a note underneath it contradicts the claim.
  // The last line is a fresh miscount with nothing below it, because the
  // itemised repairs above clear every note they sit under: a note only
  // survives while no correct reference follows it.
  const dir = echoRepo(
    'deviations-brief-none',
    '\n**Deviations closed:** E-1.1, E-1.2, E-1.3 — accepted; Vadim; 2026-09-06.\n' +
      '\n**Deviations closed:** E-3 — accepted; Vadim; 2026-09-06.\n' +
      '\n**Deviations closed:** E-1.9 — accepted; Vadim; 2026-09-07.\n',
  )
  const briefed = JSON.parse(run(dir, 'brief', 'E-4', '--json'))
  assert.deepEqual(briefed.deviations, [], 'every departure is closed')
  assert.equal(briefed.deviationNotes.length, 1, 'and the last closing line still closed nothing')
  const section = run(dir, 'brief', 'E-4').split('Deviations — recorded, not yet closed by a human')[1].split('\nTicket')[0]
  assert.ok(!section.includes('none outstanding'), 'the notes print without the claim that nothing is outstanding')
  assert.match(section, /note:.*reference `E-1\.9` names no deviation/)
})

test('a deviation paragraph ends at the next bolded field, blank line or not', () => {
  // Reproduced by the epic-branch refresh's reviewer: `**Deviation:**` written
  // directly above `**Owed:**` used to absorb the next field's markup into the
  // text a brief shows and a door gates on.
  const dir = echoRepo('deviations-extent')
  const e1 = JSON.parse(run(dir, 'deviations', 'E-1', '--json'))
  assert.match(e1.deviations[1].text, /static header, because sticky positioning fought the existing scroll container\.$/,
    'the wrapped paragraph joins its own lines and stops at the bolded field beneath it, with no blank line between')
  assert.ok(!/Owed|Nothing/.test(e1.deviations[1].text), 'the next field is never swallowed')
  const e2 = JSON.parse(run(dir, 'deviations', 'E-2', '--json'))
  assert.match(e2.deviations[0].text, /built client-side, because the endpoint has no cursor\.$/,
    'the blank-line case still ends where it always did')
})

test('a bolded FIELD ends the paragraph; a sentence that merely begins in bold does not', () => {
  // Review finding, DEV-4: ending the paragraph at any line starting with `**`
  // cut a wrapped sentence at the line break, and — when the label's text began
  // on the next line in bold — left the paragraph empty, which drops the
  // departure entirely and reports the ticket as having recorded none. A record
  // that reads as absent is the failure the line exists to end, so the
  // terminator is a bolded field label, not bold text.
  const dir = join(tmp, 'deviations-bold')
  git(tmp, 'init', '--initial-branch=main', dir)
  mkdirSync(join(dir, 'epics/echo'), { recursive: true })
  writeFileSync(join(dir, 'epics/echo/tickets.md'), ECHO_TICKETS)
  const status = (body) => {
    writeFileSync(join(dir, 'epics/echo/status.md'), `# Echo epic — status log\n\n### E-1 — the landing page — 2026-09-07 — DONE\n\n${body}`)
    return JSON.parse(run(dir, 'deviations', 'E-1', '--json'))
  }

  const wrapped = status(
    '**Deviation:** the design showed a hero band → built without it, because\n' +
      '**the asset pipeline** cannot resize the source image yet.\n' +
      '**Owed:** Nothing.\n',
  )
  assert.equal(wrapped.count, 1)
  assert.equal(
    wrapped.deviations[0].text,
    'the design showed a hero band → built without it, because **the asset pipeline** cannot resize the source image yet.',
    'the wrapped sentence survives whole — a departure cut at "because" is what a brief and every door would gate on',
  )

  const labelOnly = status('**Deviation:**\n**the spec\'s cursor API** was never built, so paging stayed client-side.\n\n**Owed:** Nothing.\n')
  assert.equal(labelOnly.count, 1, 'a departure whose text begins on the next line in bold is still a departure, not none')
  assert.match(labelOnly.deviations[0].text, /^\*\*the spec's cursor API\*\* was never built/)

  // Every label the entry template puts beneath a deviation, plus a heading:
  // each must still end the paragraph with no blank line between them.
  for (const terminator of [
    '**Owed:** Nothing.',
    '**Decisions:** none.',
    '**Resolves owed:** E-0 — the backfill ran.',
    '**Deviations closed:** E-1 — accepted; Vadim; 2026-09-07.',
    '**Addendum — review — 2026-09-07 — opus/xhigh:** one nit, fixed.',
    '### E-2 — the results list — 2026-09-07 — DONE',
  ]) {
    const out = status(`**Deviation:** the design showed three footer links → built with one.\n${terminator}\n`)
    assert.equal(out.count, 1, `${terminator} — the departure above it is still recorded`)
    assert.equal(
      out.deviations[0].text,
      'the design showed three footer links → built with one.',
      `${terminator} ends the paragraph rather than being swallowed into it`,
    )
  }
})

test('brief and doctor carry the deviation notes to the two readers who can act on them', () => {
  const dir = echoRepo('deviations-notes-doors')
  const briefed = JSON.parse(run(dir, 'brief', 'E-4', '--json'))
  assert.deepEqual(
    briefed.deviations.map((d) => d.item),
    ['E-1.1', 'E-1.2', 'E-3', 'E-1.3'],
    "every departure no human has closed travels epic-wide, in document order; E-2's, closed by a line that could close it, does not",
  )
  assert.equal(briefed.deviationNotes.length, 4, 'the brief carries what the four closing lines could not close')
  const out = run(dir, 'brief', 'E-4')
  assert.match(out, /E-1\.1 \(2026-09-01\): the design showed a hero band/, 'the brief prints the item ID a closing line would name')
  assert.match(out, /note:.*had 2 open deviations/, 'the note prints beside the open deviations')
  // This fixture has no origin remote, so doctor fails on that and exits 1; the
  // rows are on stdout either way.
  const failed = runFail(dir, 'doctor', '--json')
  const rows = JSON.parse(failed ? failed.stdout : run(dir, 'doctor', '--json'))
    .filter((r) => /Deviations closed:/.test(r.msg))
  assert.equal(rows.length, 4, "doctor warns at the writer's door, where the human who can repair the line is looking")
  assert.ok(rows.every((r) => r.level === 'warn'), 'a line that closed nothing is a warning — it never turns doctor itself red')
})

test('the deviations payload shares no field name with find\'s, at any depth', () => {
  // Two reads, two refs, two questions: `find --from` reports the epic's
  // declarations as signed off, `deviations --log-from` reports a pushed
  // branch's status log. A reader that mistook one payload for the other would
  // answer a gate from the wrong document, so they share no key to confuse.
  const dir = deltaRepo('deviations-fields')
  const found = JSON.parse(run(dir, 'find', 'D-1', '--json'))
  assert.ok(!('deviations' in found), 'find --json carries no deviations key')
  const keys = (o) =>
    new Set(Object.entries(o).flatMap(([k, v]) => [k, ...(Array.isArray(v) ? v.flatMap((x) => (x && typeof x === 'object' ? Object.keys(x) : [])) : [])]))
  const findKeys = keys(found)
  for (const k of keys(JSON.parse(run(dir, 'deviations', 'D-1', '--json'))))
    assert.ok(!findKeys.has(k), `"${k}" appears in both payloads — one field name, two meanings`)
})

test('brief carries the open deviations, epic-wide, and never a closed one', () => {
  const dir = deltaRepo('deviations-brief')
  const briefed = JSON.parse(run(dir, 'brief', 'D-3', '--json'))
  assert.deepEqual(
    briefed.deviations.map((d) => [d.entry, d.recorded]),
    [['D-2', '2026-09-02'], ['D-1', '2026-09-04']],
    'what no human has closed travels to the next worker; what one has closed is settled and stops travelling',
  )
  const out = run(dir, 'brief', 'D-3')
  assert.match(out, /Deviations — recorded, not yet closed by a human/)
  assert.match(out, /D-2 \(2026-09-02\): the spec showed server-side paging/)
  assert.ok(!out.includes('hero band'), 'a closed deviation never renders in a brief')
  // An epic with no status log yet has no deviations — never an error, exactly
  // as it has no owed items.
  assert.deepEqual(JSON.parse(run(repo, 'brief', 'G-1', '--json')).deviations, [])
  assert.match(run(repo, 'brief', 'G-1'), /Deviations — recorded, not yet closed by a human\nnone outstanding/)
})

test('deviations --log-from reads the pushed branch, not the checkout', () => {
  // The driver reads a ticket branch that was pushed, where the worker wrote
  // its entry; the checkout it runs in has not moved.
  const dir = deltaRepo('deviations-ref', '# Delta epic — status log\n')
  git(dir, 'config', 'user.email', 'test@example.com')
  git(dir, 'config', 'user.name', 'Test')
  git(dir, 'config', 'commit.gpgsign', 'false')
  git(dir, 'add', '.')
  git(dir, 'commit', '-m', 'D-1: start the epic')
  git(dir, 'checkout', '-b', 'd-1')
  writeFileSync(join(dir, 'epics/delta/status.md'), DELTA_STATUS)
  git(dir, 'add', '.')
  git(dir, 'commit', '-m', 'D-1: the landing page')
  git(dir, 'checkout', 'main')

  assert.equal(JSON.parse(run(dir, 'deviations', 'D-1', '--json')).count, 0, 'the checkout records none')
  const fromRef = JSON.parse(run(dir, 'deviations', 'D-1', '--log-from', 'd-1', '--json'))
  assert.equal(fromRef.count, 3, 'the pushed branch records three')
  assert.equal(fromRef.logFrom, 'd-1')
  assert.equal(fromRef.logPath, 'epics/delta/status.md', 'the path is the ref-relative one, not a checkout path')
  assert.match(run(dir, 'deviations', 'D-1', '--log-from', 'd-1'), /epics\/delta\/status\.md at d-1/)
})

test('an unreadable status log is a nonzero exit naming it, never an empty list', () => {
  // The one direction this report can lie in: "no deviations" from a log
  // nobody could read would clear a gate that exists to stop exactly that.
  const dir = deltaRepo('deviations-unreadable')
  const badRef = runFail(dir, 'deviations', 'D-1', '--log-from', 'no-such-ref', '--json')
  assert.equal(badRef.status, 1)
  assert.match(badRef.stderr, /no-such-ref/, 'the refusal names the ref so the reader can fetch or fix it')
  assert.match(badRef.stderr, /not "no deviations"/)
  assert.equal(badRef.stdout, '', 'no payload at all — an empty deviations list would read as a clean ticket')

  const noLog = runFail(repo, 'deviations', 'G-1', '--json')
  assert.equal(noLog.status, 1, 'an absent log is unread, not read-as-none')
  assert.match(noLog.stderr, /no status log at .*epics\/gamma\/status\.md/)
  assert.match(noLog.stderr, /--log-from <ref>/, 'the refusal names the flag that reads a log living only on a branch')

  const noValue = runFail(dir, 'deviations', 'D-1', '--log-from', '--json')
  assert.equal(noValue.status, 2)
  assert.match(noValue.stderr, /--log-from needs a git ref/, 'a following flag is a missing value, not a ref named --json')

  const noId = runFail(dir, 'deviations')
  assert.equal(noId.status, 2)
  assert.match(noId.stderr, /usage: tickets\.mjs deviations <ID>/)
})

// ── the compared subcommand ──────────────────────────────────────────────────
// The count of `**Compared:**` fidelity tables one ticket's own entries
// record. It lives in the script rather than in a grep inside the driver's
// prompt because the driver's suite stubs every agent: a counting pipeline in
// a template literal is executed by no test, and a mis-escaped `\*\*` would
// first show as a count of 0 on a live run — indistinguishable from a ticket
// that recorded nothing, and merged as such.

const VISION_STATUS = `# Vision epic — status log

Append-only record of finished tickets. Tickets: \`epics/vision/tickets.md\`.

### V-1 — the landing page — 2026-09-10 — DONE

**Built:** the page.

**Compared:** at 1440 and 393, against designs/City Desktop.html, removals from
origin/epic/vision:

landmark  property  design  page
hero      order     1       2

**Owed:** Nothing.

**Addendum — 2026-09-11 — the comparison re-run after the review fix.**

**Compared:** at 1440, no differences — 6 landmarks compared.

### V-2 — the results list — 2026-09-12 — DONE

**Built:** the list.

**Compared:** owed — no browser in this session; Vadim accepted it 2026-09-12.

**Owed:** Nothing.

### V-3 — the footer — 2026-09-13 — DONE

**Built:** the footer.

**Owed:** Nothing.
`

function visionRepo(name, status = VISION_STATUS) {
  const dir = join(tmp, name)
  git(tmp, 'init', '--initial-branch=main', dir)
  mkdirSync(join(dir, 'epics/vision'), { recursive: true })
  writeFileSync(
    join(dir, 'epics/vision/tickets.md'),
    '# Vision epic — tickets\n\nDelivery: release\n\n## V-1 — the landing page\n\n**Scope.** V1.\n\n## V-2 — the results list\n\n**Scope.** V2.\n\n## V-3 — the footer\n\n**Scope.** V3.\n',
  )
  writeFileSync(join(dir, 'epics/vision/status.md'), status)
  return dir
}

test('compared counts the tables a ticket\'s own entries record, addenda included', () => {
  const dir = visionRepo('compared')
  const v1 = JSON.parse(run(dir, 'compared', 'v-1', '--json'))
  assert.equal(v1.ticket, 'V-1')
  assert.equal(v1.compared, 2, "the entry's own table and the one its addendum added")
  assert.deepEqual(v1.tables.map((t) => t.line > 0), [true, true], 'each is reported with the line it sits on')
  assert.match(v1.tables[0].text, /against designs\/City Desktop\.html/)
  // An owed comparison is a recorded one: it says a human accepted that it
  // could not run, which a reader can see and a gate can count — the whole
  // point of writing the field rather than omitting it.
  assert.equal(JSON.parse(run(dir, 'compared', 'V-2', '--json')).compared, 1)
  assert.equal(JSON.parse(run(dir, 'compared', 'V-3', '--json')).compared, 0, 'a ticket that recorded none reads as none')
  assert.match(run(dir, 'compared', 'V-3'), /0 `\*\*Compared:\*\*` field\(s\) recorded/)
})

test('compared never counts another ticket\'s table', () => {
  // A status log is append-only and a ticket branch carries every earlier
  // ticket's entries, each able to carry this same field — so a count over the
  // whole file would let a predecessor's comparison answer for this ticket,
  // which is the gate passing on somebody else's evidence.
  const dir = visionRepo('compared-narrowing')
  assert.equal(JSON.parse(run(dir, 'compared', 'V-3', '--json')).compared, 0)
  const text = readFileSync(join(dir, 'epics/vision/status.md'), 'utf8')
  assert.match(text, /\*\*Compared:\*\*/, 'the log does carry tables — three of them, under other tickets')
})

test('compared --log-from reads the pushed branch, and an unreadable log is never a count of 0', () => {
  const dir = visionRepo('compared-ref', '# Vision epic — status log\n')
  git(dir, 'config', 'user.email', 'test@example.com')
  git(dir, 'config', 'user.name', 'Test')
  git(dir, 'config', 'commit.gpgsign', 'false')
  git(dir, 'add', '.')
  git(dir, 'commit', '-m', 'V-1: start the epic')
  git(dir, 'checkout', '-b', 'v-1')
  writeFileSync(join(dir, 'epics/vision/status.md'), VISION_STATUS)
  git(dir, 'add', '.')
  git(dir, 'commit', '-m', 'V-1: the landing page')
  git(dir, 'checkout', 'main')

  assert.equal(JSON.parse(run(dir, 'compared', 'V-1', '--json')).compared, 0, 'the checkout records none')
  const fromRef = JSON.parse(run(dir, 'compared', 'V-1', '--log-from', 'v-1', '--json'))
  assert.equal(fromRef.compared, 2, 'the pushed branch records two')
  assert.equal(fromRef.logFrom, 'v-1')
  assert.equal(fromRef.logPath, 'epics/vision/status.md', 'the ref-relative path, not a checkout path')

  const badRef = runFail(dir, 'compared', 'V-1', '--log-from', 'no-such-ref', '--json')
  assert.equal(badRef.status, 1)
  assert.match(badRef.stderr, /not "no comparison"/, 'the refusal says what it refuses to claim')
  assert.equal(badRef.stdout, '', 'no payload at all — a count of 0 would read as a ticket that skipped the comparison')

  const noValue = runFail(dir, 'compared', 'V-1', '--log-from', '--json')
  assert.equal(noValue.status, 2)
  assert.match(noValue.stderr, /--log-from needs a git ref/)
  const noId = runFail(dir, 'compared')
  assert.equal(noId.status, 2)
  assert.match(noId.stderr, /usage: tickets\.mjs compared <ID>/)
})

test('doctor flags a deviation line that will not parse, inside an entry only', () => {
  // A near-miss reads as absent, and the departure stays prose no command sees
  // — the exact failure the line exists to end, reintroduced one typo at a
  // time. The singular opener and plural closer make "**Deviation closed:**"
  // the likeliest slip.
  const dir = deltaRepo(
    'deviations-doctor',
    `# Delta epic — status log

**Deviations:** a preamble or a baseline note may discuss this field in prose,
outside any entry; a warning that fired there could never be cleared.

### D-1 — the landing page — 2026-09-01 — DONE

**Deviation:** the design showed a hero band → built without it.

**Deviations:** the nav was shown → built flat.

Deviation: the footer was shown → built empty.

**Not replicated:** the spec's empty state.

**Deviation accepted:** the hero band, by nobody.

**Deviation closed:** D-1 — the nav, accepted; Vadim; 2026-09-02.

**Deviations closed:** the nav, accepted; Vadim; 2026-09-02.

**Deviations closed:** D-1 — the hero band, accepted; Vadim; 2026-09-02.

**Owed:** Nothing.
`,
  )
  // This fixture has no origin remote, so doctor fails on that and exits 1;
  // the rows are on stdout either way, and what is under test is which lines
  // it flagged.
  const failed = runFail(dir, 'doctor', '--json')
  const rows = JSON.parse(failed ? failed.stdout : run(dir, 'doctor', '--json'))
    .filter((r) => /will not parse, so the departure/.test(r.msg))
  assert.deepEqual(
    rows.map((r) => r.msg.match(/status\.md:(\d+)/)[1]),
    ['10', '12', '14', '16', '18', '20'],
    'every near-miss inside the entry is flagged; the two strict lines, and the same label in the preamble outside any entry, are not',
  )
  assert.ok(rows.every((r) => r.level === 'warn'), 'a near-miss is a warning — it never turns doctor itself red')
  assert.match(rows[0].msg, /\*\*Deviation:\*\* <what the documents showed/, 'the warning names the shape that parses')
  assert.match(rows[5].msg, /LEADING IDs/, 'a closing line with no leading ID closes nothing while reading like a closure')
})

// An entry that owes several things, which is what the Owed field invites —
// "anything deferred". One marker used to retire the lot: downstream, four
// items recorded as one paragraph were closed by a marker naming one of them,
// and the item that had to survive was a production-database hazard.
const ledger2 = join(tmp, 'ledger2')
git(tmp, 'init', '--initial-branch=main', ledger2)
mkdirSync(join(ledger2, 'epics/delta'), { recursive: true })
writeFileSync(
  join(ledger2, 'epics/delta/tickets.md'),
  '# Delta\n\n## D-1 — first\n\n**Scope.** One.\n\n## D-2 — second\n\n**Scope.** Two.\n\n## D-3 — third\n\n**Scope.** Three.\n\n## D-4 — next up\n\n**Scope.** Four.\n',
)
writeFileSync(
  join(ledger2, 'epics/delta/status.md'),
  `# Delta epic — status log

### D-1 — first — 2026-08-01 — DONE

**Owed:** four items, D-2 inherits them:
- the seed script still points at the production database — D-3 must repoint
  it before anyone runs the seed
- the retry budget is unbounded
  - and the backoff is untested, which is part of the same item
- the docs still describe the old flag name
- the parity test for the copied helper is missing

### D-2 — second — 2026-08-02 — DONE

**Owed:**

- the browser demonstration is unperformed; no browser binary exists here

**Resolves owed:** D-1 — the retry budget is bounded now.

### D-3 — third — 2026-08-03 — DONE

**Owed:** Nothing.

**Resolves owed:** D-1.3 — the flag name is documented.
`,
)

test('an entry recording several owed items numbers them, and only the named item is retired', () => {
  const owed = JSON.parse(run(ledger2, 'brief', 'D-4', '--json')).owed
  assert.deepEqual(
    owed.map((o) => o.id),
    ['D-1.1', 'D-1.2', 'D-1.4', 'D-2'],
    'D-3 retired D-1.3 by name; the bare D-1 marker retired nothing, and D-1.1 — the production-database hazard — survives',
  )
  assert.match(owed[0].text, /production database — D-3 must repoint it before anyone runs the seed$/, 'a wrapped bullet arrives joined')
  // A sub-bullet belongs to the item above it: the numbering counts what a
  // reader counts, or a marker names the wrong thing.
  assert.match(owed[1].text, /the retry budget is unbounded - and the backoff is untested/)
  assert.equal(owed[0].lead, 'four items, D-2 inherits them:', 'the lead-in that names the carrier is kept, not dropped')
  assert.equal(owed[3].id, 'D-2', 'an entry recording one item keeps the entry ID as its identity')
})

test('a bullet list separated from **Owed:** by a blank line is still recorded', () => {
  // The idiomatic markdown shape. Read as "the paragraph ends at the blank
  // line", every bullet vanished from the brief — the items lost silently,
  // before any marker was written.
  const owed = JSON.parse(run(ledger2, 'brief', 'D-4', '--json')).owed
  const d2 = owed.find((o) => o.id === 'D-2')
  assert.ok(d2, 'D-2 owes something')
  assert.match(d2.text, /browser demonstration is unperformed/)
})

test('a bare Resolves owed on a multi-item entry retires nothing, and the partial repair the note names clears it', () => {
  // The safe direction: an item wrongly kept costs a reread, an item wrongly
  // retired is gone from an append-only log with nothing left to report it.
  // D-2's bare marker retires none of D-1's four items; D-3 then does what the
  // note instructs and names the ONE item it discharged. That is the repair,
  // and it has to clear the note — the only other way to silence it would be
  // to name items that are still open, which is the silent retirement this
  // whole rule exists to prevent.
  const briefed = JSON.parse(run(ledger2, 'brief', 'D-4', '--json'))
  assert.deepEqual(briefed.notes, [], 'a dotted resolution for D-1 supersedes the bare line')

  const out = run(ledger2, 'brief', 'D-4')
  assert.match(out, /D-1\.1 \(2026-08-01\): the seed script still points at the production database/)
  assert.match(out, /four items, D-2 inherits them:/)
  assert.ok(!out.includes('the docs still describe the old flag name'), 'the item named by D-1.3 is retired')
  assert.ok(!out.includes('retires nothing'), 'and the note is gone, not carried forever')
})

// Two shapes taken from live downstream logs: an ID that heads more than one
// Owed block (an append-only log lets a ticket record again), and a bullet
// that opens with the word "Nothing" while owing something real.
mkdirSync(join(ledger2, 'epics/epsilon'), { recursive: true })
writeFileSync(
  join(ledger2, 'epics/epsilon/tickets.md'),
  '# Epsilon\n\n## E-1 — first\n\n**Scope.** One.\n\n## E-2 — second\n\n**Scope.** Two.\n\n## E-3 — next up\n\n**Scope.** Three.\n',
)
writeFileSync(
  join(ledger2, 'epics/epsilon/status.md'),
  `# Epsilon epic — status log

### E-1 — first — 2026-08-01 — DONE

**Owed:**
- Nothing in this ticket has met Postgres; no integration suite has seen it
- the parity test for the copied helper is missing

### E-2 — second — 2026-08-02 — DONE

**Owed:** Nothing.

### E-1 — first, corrected — 2026-08-03 — DONE

**Owed:** the retry budget is still unbounded.
`,
)

test('an ID heading more than one Owed block numbers across them, so no two items share an identity', () => {
  // Two obligations answering to one ID is the collision the numbering exists
  // to prevent — one marker would retire both.
  const owed = JSON.parse(run(ledger2, 'brief', 'E-3', '--json')).owed
  assert.deepEqual(
    owed.map((o) => o.id),
    ['E-1.1', 'E-1.2', 'E-1.3'],
    "E-1's later entry continues its numbering; E-2 owed Nothing and is filtered",
  )
  assert.match(owed[2].text, /retry budget is still unbounded/)
})

test('"Nothing" empties a block that has no bullets, never a bullet that owes something real', () => {
  // Live downstream: a first bullet opening "Nothing in this ticket has met
  // Postgres" dropped all five of its entry's items, because the block was
  // read as one paragraph beginning with the word.
  const owed = JSON.parse(run(ledger2, 'brief', 'E-3', '--json')).owed
  assert.match(owed[0].text, /^Nothing in this ticket has met Postgres/)
  assert.ok(!owed.some((o) => /^E-2/.test(o.id)), 'an entry that owes Nothing records nothing')
})

// A bare marker with no itemised resolution anywhere — the state the note is
// actually for — plus the two shapes a hand-written item reference gets wrong.
mkdirSync(join(ledger2, 'epics/zeta'), { recursive: true })
writeFileSync(
  join(ledger2, 'epics/zeta/tickets.md'),
  '# Zeta\n\n## F-1 — first\n\n**Scope.** One.\n\n## F-2 — second\n\n**Scope.** Two.\n\n## F-3 — third\n\n**Scope.** Three.\n\n## F-4 — next up\n\n**Scope.** Four.\n',
)
writeFileSync(
  join(ledger2, 'epics/zeta/status.md'),
  `# Zeta epic — status log

### F-1 — first — 2026-08-01 — DONE

**Owed:** the seed still points at staging — F-2 inherits it.

### F-2 — second — 2026-08-02 — DONE

**Owed:**
- the docs are stale
- the flag is undocumented

**Resolves owed:** F-1 — the seed points at the local stack now.

### F-1 — first, continued — 2026-08-05 — DONE

**Owed:**
- the retry budget is still unbounded
- the parity test is still missing

### F-3 — third — 2026-08-06 — DONE

**Owed:** Nothing.

**Resolves owed:** F-2 — the docs are current.

**Resolves owed:** F-2.7 — and the flag is documented.
`,
)

test('a bare marker retires what the entry owed when it was written, and a later block never resurrects it', () => {
  // Append-only makes a marker's position its time. F-1 owed exactly one thing
  // when F-2 discharged it; F-1's later entry records two more. Without the
  // positional read the entry renumbers, the bare marker matches nothing, and
  // an item closed months ago returns to every brief forever.
  const briefed = JSON.parse(run(ledger2, 'brief', 'F-4', '--json'))
  const f1 = briefed.owed.filter((o) => o.id.startsWith('F-1'))
  assert.deepEqual(f1.map((o) => o.id), ['F-1.2', 'F-1.3'], 'the discharged first item stays discharged')
  assert.ok(!briefed.notes.some((n) => /\*\*Resolves owed:\*\* F-1\b/.test(n)), 'and a marker that did its job earns no note')
})

test('a bare marker facing several open items retires nothing and says so, with the form that works', () => {
  const briefed = JSON.parse(run(ledger2, 'brief', 'F-4', '--json'))
  const note = briefed.notes.find((n) => /\*\*Resolves owed:\*\* F-2`/.test(n))
  assert.ok(note, 'F-2 owed two things when F-3 named the entry')
  assert.match(note, /2 open items/)
  assert.match(note, /F-2\.1/, 'the note names the form that would work')
  assert.match(run(ledger2, 'brief', 'F-4'), /retires nothing/)
})

test('an item reference that matches no item is reported, not silently ignored', () => {
  // The skills now ask workers to hand-write these, so a miscount is the
  // expected error — and it was the one error with no feedback anywhere.
  const briefed = JSON.parse(run(ledger2, 'brief', 'F-4', '--json'))
  const note = briefed.notes.find((n) => /F-2\.7/.test(n))
  assert.ok(note, 'a dotted reference past the end of the entry is named')
  assert.match(note, /names no item/)
  assert.match(note, /F-2 records 2/)
})

test('the note clears once the entry\'s items are closed by name — a warning that can be cleared', () => {
  // The recovery the note advertises has to work from the state it is
  // reported in, and leave nothing behind: a warning nobody can clear is one
  // readers learn to skip past.
  const doc = join(ledger2, 'epics/delta/status.md')
  const original = readFileSync(doc, 'utf8')
  try {
    writeFileSync(doc, `${original}\n**2026-08-04 addendum.** Correcting D-2's marker.\n\n**Resolves owed:** D-1.1, D-1.2, D-1.4 — all three landed.\n`)
    const briefed = JSON.parse(run(ledger2, 'brief', 'D-4', '--json'))
    assert.deepEqual(briefed.owed.map((o) => o.id), ['D-2'])
    assert.deepEqual(briefed.notes, [])
  } finally {
    writeFileSync(doc, original)
  }
})

test('doctor flags a Resolves owed line that retires nothing, at the door its writer walks through', () => {
  // The reader's door is the brief; the writer's door is doctor. Without
  // both, a marker that discharged nothing is silent in one direction: the
  // author believes the item closed, and the brief they never run says
  // otherwise.
  const res = runFail(ledger2, 'doctor', '--json')
  const rows = JSON.parse(res ? res.stdout : run(ledger2, 'doctor', '--json'))
  const row = rows.find((r) => /Resolves owed/.test(r.msg) && /F-2`/.test(r.msg))
  assert.ok(row, 'doctor reports the marker that retired nothing')
  assert.equal(row.level, 'warn')
  assert.match(row.msg, /2 open items/)
  assert.ok(
    rows.some((r) => /F-2\.7/.test(r.msg)),
    'and the item reference that matched nothing, which is the error the skills now invite',
  )
})

// A ledger for the two ways a reference can name something it does not mean:
// one that points at an item the entry had not recorded yet, and one that
// starts with a valid ID and goes on. Both used to retire a real item.
const ledger3 = join(tmp, 'ledger3')
git(tmp, 'init', '--initial-branch=main', ledger3)
mkdirSync(join(ledger3, 'epics/eta'), { recursive: true })
writeFileSync(
  join(ledger3, 'epics/eta/tickets.md'),
  '# Eta\n\n## G-1 — first\n\n**Scope.** One.\n\n## G-2 — second\n\n**Scope.** Two.\n\n## G-3 — third\n\n**Scope.** Three.\n\n## G-4 — next up\n\n**Scope.** Four.\n',
)
writeFileSync(
  join(ledger3, 'epics/eta/status.md'),
  `# Eta epic — status log

### G-1 — first — 2026-08-01 — DONE

**Owed:**
- the retry budget is unbounded
- the parity test is missing

### G-2 — second — 2026-08-02 — DONE

**Owed:** the browser demonstration is unperformed; no browser binary exists here.

**Resolves owed:** G-1.3 — miscounted; G-1 had recorded two items when this was written.

### G-3 — third — 2026-08-03 — DONE

**Owed:** Nothing.

**Resolves owed:** G-2oops — the browser run is recorded.

### G-1 — first, continued — 2026-08-04 — DONE

**Owed:**
- the seed script still points at the production database
`,
)

test('a dotted reference pointing past what the entry had recorded retires nothing, then or later', () => {
  // Position is time for a dotted marker too. G-2's `G-1.3` named nothing on
  // the day it was written; two days later G-1 records a third item, and
  // resolving the marker against it retires the production-database hazard
  // nobody discharged — the silent retirement the bare-marker rule already
  // refuses, arriving through the numbered form instead.
  const briefed = JSON.parse(run(ledger3, 'brief', 'G-4', '--json'))
  assert.deepEqual(
    briefed.owed.map((o) => o.id),
    ['G-1.1', 'G-1.2', 'G-1.3', 'G-2'],
    'the later item survives the marker written above it',
  )
  const note = briefed.notes.find((n) => /G-1\.3/.test(n))
  assert.ok(note, 'and the marker that retired nothing says so')
  assert.match(note, /names no item/)
  assert.match(note, /G-1 records 2 .* above that line/, 'counted as of the marker, not as of today')
})

test('a reference that only starts with a valid ID is not read as that ID', () => {
  // `G-2oops` is not `G-2`. Anchoring at the start alone made the prefix win,
  // and G-2 owed exactly one item — so a typo silently discharged it, with
  // no note anywhere, which is the failure the whole owed gate exists to
  // prevent. Refusing to parse it keeps the item listed until someone writes
  // the reference again: unreadable and refused beats readable and wrong.
  const briefed = JSON.parse(run(ledger3, 'brief', 'G-4', '--json'))
  assert.ok(
    briefed.owed.some((o) => o.id === 'G-2'),
    'the item the typo appeared to discharge is still owed',
  )
})

// ── a note is cleared by the repair it names — both ledgers ──────────────────
// Every note either ledger emits states a repair, and doing literally what it
// says has to end it everywhere it is reported. A warning nobody can clear is
// worse than no warning: the log is append-only, so a mistyped digit cannot be
// taken back, and a `doctor` row that survives its own cure teaches its reader
// to skip past warnings in general. The two rules differ on purpose. A BARE
// line is ambiguous about *which* items it decided, so any itemised line for
// that entry answers it wherever it sits; a wrong reference is one specific
// mistake, so only a line BELOW it can be its correction — position is time in
// an append-only log, and clearing on a correct line written earlier would take
// the only feedback a miscount gets while the item it meant is still open.
//
// One fixture, both ledgers: T-1 records three departures and three owed items
// across two entries, T-2 records one departure — the lone-item shape whose
// only valid reference is its bare ID.
const THETA_TICKETS =
  '# Theta epic — tickets\n\nDelivery: release\n\n' +
  '## T-1 — the landing page\n\n**Scope.** The page.\n\n' +
  '## T-2 — the results list\n\n**Scope.** The list.\n\n' +
  '## T-3 — next up\n\n**Scope.** Three.\n'

const THETA_STATUS = `# Theta epic — status log

Append-only record of finished tickets. Tickets: \`epics/theta/tickets.md\`.

### T-1 — the landing page — 2026-09-01 — DONE

**Deviation:** the design showed a hero band above the fold → built without it,
because the asset pipeline cannot resize the source image yet.

**Deviation:** the design showed a sticky nav → built as a static header,
because sticky positioning fought the existing scroll container.

**Owed:**
- the hero band's art direction is unresolved — T-2 inherits it
- the focus order through the static header is untested

### T-2 — the results list — 2026-09-02 — DONE

**Deviation:** the spec showed server-side paging → built client-side, because
the endpoint has no cursor.

**Owed:** Nothing.

### T-1 — the landing page, redone — 2026-09-03 — DONE

**Deviation:** the design showed three footer links → built with one, because
two of the three have no destination yet.

**Owed:** the footer's two dead links need destinations.
`

let thetaSeq = 0
function thetaRepo(extra) {
  const dir = join(tmp, `theta-${thetaSeq++}`)
  git(tmp, 'init', '--initial-branch=main', dir)
  mkdirSync(join(dir, 'epics/theta'), { recursive: true })
  writeFileSync(join(dir, 'epics/theta/tickets.md'), THETA_TICKETS)
  writeFileSync(
    join(dir, 'epics/theta/status.md'),
    `${THETA_STATUS}\n**Addendum — 2026-09-04 — decisions and discharges.**\n${extra}`,
  )
  return dir
}

// These fixtures have no origin remote, so doctor exits 1 on that; its rows are
// on stdout either way, and they are the writer's own door onto the note.
const doctorRows = (dir, re) => {
  const failed = runFail(dir, 'doctor', '--json')
  return JSON.parse(failed ? failed.stdout : run(dir, 'doctor', '--json')).filter((r) => re.test(r.msg))
}
// A note has to be gone from all three readers at once, or it is still a
// warning someone meets: the brief a later worker reads, the subcommand every
// attended door reads, and the doctor row the line's own author sees.
const devNotes = (dir, id) => ({
  sub: JSON.parse(run(dir, 'deviations', id, '--json')).notes,
  brief: JSON.parse(run(dir, 'brief', 'T-3', '--json')).deviationNotes,
  doctor: doctorRows(dir, /Deviations closed:/).map((r) => r.msg),
})
const owedNotes = (dir) => ({
  brief: JSON.parse(run(dir, 'brief', 'T-3', '--json')).notes,
  doctor: doctorRows(dir, /Resolves owed:/).map((r) => r.msg),
})

test('the deviation bare-line note is cleared by the itemised line it names', () => {
  const bare = '\n**Deviations closed:** T-1 — all of them, accepted; Vadim; 2026-09-04.\n'
  const before = devNotes(thetaRepo(bare), 'T-1')
  assert.equal(before.sub.filter((n) => /had 3 open deviations/.test(n)).length, 1, 'the bare line faced three open, so it closed nothing and says so')
  assert.ok(before.brief.some((n) => /had 3 open deviations/.test(n)) && before.doctor.some((n) => /had 3 open deviations/.test(n)),
    'and says it at all three doors')

  const after = thetaRepo(`${bare}\n**Deviations closed:** T-1.1 — the hero band, accepted; Vadim; 2026-09-05.\n`)
  assert.deepEqual(devNotes(after, 'T-1'), { sub: [], brief: [], doctor: [] },
    'naming one item the itemised way is the repair the note states, and it clears the note everywhere it was reported')
  const dev = JSON.parse(run(after, 'deviations', 'T-1', '--json'))
  assert.deepEqual(dev.deviations.map((d) => [d.item, d.closed]), [['T-1.1', true], ['T-1.2', false], ['T-1.3', false]],
    'and clears it without closing anything the human did not name — the rest stay open')
  assert.equal(dev.open, 2)
})

test('the deviation unknown-item note is cleared by the correct reference written below it', () => {
  const wrong = '\n**Deviations closed:** T-1.7 — accepted; Vadim; 2026-09-04.\n'
  const before = devNotes(thetaRepo(wrong), 'T-1')
  assert.equal(before.sub.length, 1)
  assert.match(before.sub[0], /reference `T-1\.7` names no deviation: T-1 records 3/)
  assert.match(before.sub[0], /a line below it naming one of T-1's deviations clears this note/,
    'the note states the repair that clears it — the reviewer opens this text and follows it literally')
  assert.equal(before.brief.length, 1)
  assert.equal(before.doctor.length, 1)

  const after = thetaRepo(`${wrong}\n**Deviations closed:** T-1.2 — the sticky nav, fixed in 9f3a21c; Vadim; 2026-09-05.\n`)
  assert.deepEqual(devNotes(after, 'T-1'), { sub: [], brief: [], doctor: [] }, 'doing exactly what the note says ends it at all three doors')
  const dev = JSON.parse(run(after, 'deviations', 'T-1', '--json'))
  assert.deepEqual(dev.deviations.map((d) => [d.item, d.closed]), [['T-1.1', false], ['T-1.2', true], ['T-1.3', false]])
})

test('the deviation malformed-reference note is cleared by the reference written again correctly', () => {
  const malformed = '\n**Deviations closed:** T-1oops — accepted; Vadim; 2026-09-04.\n'
  const before = devNotes(thetaRepo(malformed), 'T-1')
  assert.match(before.sub[0], /names `T-1oops`, and an ID has to end where the reference ends/)
  assert.match(before.sub[0], /a line below it naming one of T-1's deviations clears this note/)
  assert.equal(before.brief.length, 1)
  assert.equal(before.doctor.length, 1)

  const after = thetaRepo(`${malformed}\n**Deviations closed:** T-1.1 — the hero band, accepted; Vadim; 2026-09-05.\n`)
  assert.deepEqual(devNotes(after, 'T-1'), { sub: [], brief: [], doctor: [] })
})

test("a lone departure's bare ID clears the note a dotted reference to it earned", () => {
  // The shape that was stuck forever: an entry recording ONE departure keeps
  // its bare ID, so no dotted reference can ever be valid for it — a human
  // "confirming" a bare closure as `T-2.1` earned a note whose only exit was a
  // reference the parser would never accept. The bare ID is that lone
  // departure's identity, so writing it again is the repair, and it clears.
  const wrong =
    '\n**Deviations closed:** T-2 — the paging, accepted; Vadim; 2026-09-04.\n' +
    '\n**Deviations closed:** T-2.1 — confirming the above; Vadim; 2026-09-04.\n'
  const before = devNotes(thetaRepo(wrong), 'T-2')
  assert.equal(before.sub.length, 1)
  assert.match(before.sub[0], /`T-2\.1` names no deviation: T-2 records 1 \(`T-2`\) above that line/,
    'the note names the only reference that entry has, which is the bare ID')

  const after = thetaRepo(`${wrong}\n**Deviations closed:** T-2 — the paging, accepted; Vadim; 2026-09-05.\n`)
  assert.deepEqual(devNotes(after, 'T-2'), { sub: [], brief: [], doctor: [] })
  const dev = JSON.parse(run(after, 'deviations', 'T-2', '--json'))
  assert.deepEqual(dev.deviations.map((d) => [d.item, d.closed]), [['T-2', true]], 'the departure was closed by the first line and stays closed')
  assert.match(dev.deviations[0].closedBy, /2026-09-04/, 'an already-closed item still answers a correction — the writer may be naming the very one they meant')
})

test('the owed bare-marker note is cleared by the itemised marker it names', () => {
  const bare = '\n**Resolves owed:** T-1 — done.\n'
  const before = owedNotes(thetaRepo(bare))
  assert.equal(before.brief.filter((n) => /3 open items/.test(n)).length, 1)
  assert.equal(before.doctor.length, 1, "and at the writer's own door")

  const after = thetaRepo(`${bare}\n**Resolves owed:** T-1.1 — the art direction is signed off.\n`)
  assert.deepEqual(owedNotes(after), { brief: [], doctor: [] }, 'the repair the note names clears it at both doors')
  assert.deepEqual(JSON.parse(run(after, 'brief', 'T-3', '--json')).owed.map((o) => o.id), ['T-1.2', 'T-1.3'],
    'and retires only the item that was named')
})

test('the owed unknown-item note is cleared by the correct reference written below it', () => {
  const wrong = '\n**Resolves owed:** T-1.7 — done.\n'
  const before = owedNotes(thetaRepo(wrong))
  assert.equal(before.brief.length, 1)
  assert.match(before.brief[0], /`\*\*Resolves owed:\*\* T-1\.7` names no item: T-1 records 3/)
  assert.match(before.brief[0], /a line below it naming one of T-1's items clears this note/)
  assert.equal(before.doctor.length, 1)

  const after = thetaRepo(`${wrong}\n**Resolves owed:** T-1.2 — the focus order has a test now.\n`)
  assert.deepEqual(owedNotes(after), { brief: [], doctor: [] })
  assert.deepEqual(JSON.parse(run(after, 'brief', 'T-3', '--json')).owed.map((o) => o.id), ['T-1.1', 'T-1.3'])
})

test('what does not clear a wrong reference: another wrong line, a correct line above, or a correct one for another entry', () => {
  // The negatives are the rule's teeth. Without them "clearable" would slide
  // into "any later line silences it", and a miscount would lose its only
  // feedback while the item it meant is still open.
  const wrong = '\n**Deviations closed:** T-1.7 — accepted; Vadim; 2026-09-04.\n'
  const second = devNotes(thetaRepo(`${wrong}\n**Deviations closed:** T-1.8 — accepted; Vadim; 2026-09-05.\n`), 'T-1')
  assert.equal(second.sub.length, 2, 'a second wrong reference is a second mistake, not a correction')
  assert.equal(second.doctor.length, 2)

  const above = devNotes(thetaRepo(`\n**Deviations closed:** T-1.1 — accepted; Vadim; 2026-09-03.\n${wrong}`), 'T-1')
  assert.equal(above.sub.length, 1, 'a correct line ABOVE the mistake was written before it and cannot be its correction — position is time')
  assert.match(above.sub[0], /T-1\.7/)

  const other = devNotes(thetaRepo(`${wrong}\n**Deviations closed:** T-2 — accepted; Vadim; 2026-09-05.\n`), 'T-1')
  assert.equal(other.sub.length, 1, "a correct reference to another entry answers nothing about T-1's miscount")

  // The asymmetry the comment in the parser explains: a BARE line's note is
  // answered by any itemised line for that entry, including one above it,
  // because a bare line is ambiguous about which items rather than wrong about
  // one.
  const bareAfterItem = devNotes(
    thetaRepo('\n**Deviations closed:** T-1.1 — accepted; Vadim; 2026-09-03.\n\n**Deviations closed:** T-1 — the rest; Vadim; 2026-09-05.\n'),
    'T-1',
  )
  assert.deepEqual(bareAfterItem.sub, [], 'the entry was already being addressed item by item, which is the form the bare-line note asks for')

  // Owed side, same three negatives — one rule over two ledgers.
  const owedWrong = '\n**Resolves owed:** T-1.7 — done.\n'
  assert.equal(owedNotes(thetaRepo(`${owedWrong}\n**Resolves owed:** T-1.8 — done.\n`)).brief.length, 2)
  assert.equal(owedNotes(thetaRepo(`\n**Resolves owed:** T-1.1 — done.\n${owedWrong}`)).brief.length, 1)
  assert.equal(owedNotes(thetaRepo(`${owedWrong}\n**Resolves owed:** T-2 — done.\n`)).brief.length, 1)
})

test('a note earned by a typo under another entry is attributed to the entry it names, and cleared there', () => {
  // The reference decides whose note it is, not the entry it was written
  // under: a human closing T-1's departures from inside T-2's addendum mistypes
  // one, and the note has to reach the ticket whose departure is still
  // undecided — and be cleared by that ticket's own correct reference.
  const typo = '\n**Deviations closed:** T-1.7 — accepted; Vadim; 2026-09-04.\n'
  const dir = thetaRepo(typo)
  assert.equal(JSON.parse(run(dir, 'deviations', 'T-1', '--json')).notes.length, 1, 'T-1 owns the note, though the line sits under T-2')
  assert.deepEqual(JSON.parse(run(dir, 'deviations', 'T-2', '--json')).notes, [], 'and T-2, which merely hosts the line, does not')

  const fixed = thetaRepo(`${typo}\n**Deviations closed:** T-1.3 — the footer links, accepted; Vadim; 2026-09-05.\n`)
  assert.deepEqual(devNotes(fixed, 'T-1'), { sub: [], brief: [], doctor: [] })
})

test('numbering, closure and what open, count and the owed list report are untouched by the clearing rule', () => {
  // The guard for this change: it moves notes and nothing else. Every fixture
  // above reads exactly as it did before, so a later edit that "simplifies" the
  // clearing rule into the closure rule fails here rather than in an installed
  // project's release gate.
  const echo = echoRepo('deviations-unchanged')
  assert.deepEqual(
    ['E-1', 'E-2', 'E-3'].map((id) => {
      const d = JSON.parse(run(echo, 'deviations', id, '--json'))
      return [id, d.count, d.open, d.deviations.map((x) => [x.item, x.closed])]
    }),
    [
      ['E-1', 3, 3, [['E-1.1', false], ['E-1.2', false], ['E-1.3', false]]],
      ['E-2', 1, 0, [['E-2', true]]],
      ['E-3', 1, 1, [['E-3', false]]],
    ],
  )
  const delta = deltaRepo('deviations-unchanged-delta')
  assert.deepEqual(
    ['D-1', 'D-2'].map((id) => {
      const d = JSON.parse(run(delta, 'deviations', id, '--json'))
      return [id, d.count, d.open, d.deviations.map((x) => [x.item, x.closed])]
    }),
    [
      ['D-1', 3, 1, [['D-1.1', true], ['D-1.2', true], ['D-1.3', false]]],
      ['D-2', 1, 1, [['D-2', false]]],
    ],
  )
  assert.deepEqual(JSON.parse(run(ledger2, 'brief', 'D-4', '--json')).owed.map((o) => o.id), ['D-1.1', 'D-1.2', 'D-1.4', 'D-2'])
  assert.deepEqual(JSON.parse(run(ledger2, 'brief', 'E-3', '--json')).owed.map((o) => o.id), ['E-1.1', 'E-1.2', 'E-1.3'])
  assert.deepEqual(JSON.parse(run(ledger2, 'brief', 'F-4', '--json')).owed.map((o) => o.id), ['F-1.2', 'F-1.3', 'F-2.1', 'F-2.2'])
  assert.deepEqual(JSON.parse(run(ledger3, 'brief', 'G-4', '--json')).owed.map((o) => o.id), ['G-1.1', 'G-1.2', 'G-1.3', 'G-2'])
})

test('brief with no argument briefs the first startable ticket and names its epic', () => {
  // The same ticket Next up proposes: first todo in document order.
  const out = run(repo, 'brief')
  assert.match(out, /A-4 — polish the output/)
  assert.match(out, /epic alpha/, 'the epic it came from is named')
  assert.match(out, /\*\*Scope\.\*\* Polish\./)
  assert.equal(JSON.parse(run(repo, 'brief', '--json')).id, 'A-4')
})

test('brief refuses an unknown ID with find\'s refusal, verbatim', () => {
  const brief = runFail(repo, 'brief', 'A-99')
  const find = runFail(repo, 'find', 'A-99')
  assert.equal(brief.status, 1)
  assert.equal(brief.stderr, find.stderr, 'one refusal, not two copies drifting apart')
  assert.match(brief.stderr, /no ticket "A-99"/)
})

test('Next up hints that the brief exists', () => {
  // Named as this script's subcommand — /flow:brief is not an installed
  // command and tickets.mjs is not on any PATH, and the board never suggests
  // a command that does not survive being run (BOARD-1).
  const out = run(repo, 'list')
  assert.match(out, /this script's `brief \[ID\]` subcommand/)
})

test('brief with nothing startable says so instead of erroring', () => {
  // In an autonomous run a bare nonzero exit is a stop condition — a board
  // with nothing left to start is a fact, not an error, so brief mirrors
  // next's honest empty answer: plain says so, --json emits null, exit 0.
  const allDone = join(tmp, 'all-done')
  git(tmp, 'init', '--initial-branch=main', allDone)
  mkdirSync(join(allDone, 'epics/omega'), { recursive: true })
  writeFileSync(join(allDone, 'epics/omega/tickets.md'), '# Omega\n\n## O-1 — finished work\n\n**Scope.** O.\n')
  writeFileSync(join(allDone, 'epics/omega/status.md'), '### O-1 — finished work — 2026-08-08 — DONE\n')
  const out = run(allDone, 'brief')
  assert.match(out, /nothing left to start/)
  assert.equal(run(allDone, 'brief', '--json').trim(), 'null')
})

test('a release ticket merged into its remote epic branch reads integrated, with no pull request anywhere', () => {
  // Release tickets open no pull request of their own — the merge into
  // epic/<name> leaves exactly one trace, the ID-prefixed subjects reaching
  // the REMOTE epic branch, and that is what the board reads. gh always
  // fails against this fixture, proving the state needs no PR. The remote is
  // the authority: a merge that exists only locally proves nothing, because
  // integration is the driver's push.
  const rel = join(tmp, 'release-int')
  const relRemote = join(tmp, 'release-int-remote.git')
  git(tmp, 'init', '--bare', '--initial-branch=main', relRemote)
  git(tmp, 'init', '--initial-branch=main', rel)
  git(rel, 'config', 'user.email', 'test@example.com')
  git(rel, 'config', 'user.name', 'Test')
  git(rel, 'config', 'commit.gpgsign', 'false')
  mkdirSync(join(rel, 'epics/rel'), { recursive: true })
  writeFileSync(
    join(rel, 'epics/rel/tickets.md'),
    '# Rel\n\nDelivery: release\n\n## R-1 — first slice\n\n**Scope.** R1.\n\n## R-2 — second slice\n\n**Scope.** R2.\n',
  )
  git(rel, 'add', '.')
  git(rel, 'commit', '-m', 'plan: rel epic')
  git(rel, 'remote', 'add', 'origin', relRemote)
  git(rel, 'push', '-u', 'origin', 'main')
  git(rel, 'remote', 'set-head', 'origin', 'main')
  git(rel, 'checkout', '-b', 'epic/rel')
  git(rel, 'push', '-u', 'origin', 'epic/rel')
  git(rel, 'checkout', '-b', 'r-1')
  writeFileSync(join(rel, 'r1.txt'), 'work\n')
  git(rel, 'add', 'r1.txt')
  git(rel, 'commit', '-m', 'R-1: do the first slice')
  git(rel, 'checkout', 'epic/rel')
  git(rel, 'merge', '--no-ff', 'r-1', '-m', 'Merge r-1 into epic/rel')

  const before = Object.fromEntries(JSON.parse(run(rel, 'list', '--json')).tickets.map((t) => [t.id, t.state]))
  assert.equal(before['R-1'], 'in-progress', 'a merge not yet pushed must not read as integrated')

  git(rel, 'push', 'origin', 'epic/rel')
  const after = Object.fromEntries(JSON.parse(run(rel, 'list', '--json')).tickets.map((t) => [t.id, t.state]))
  assert.equal(after['R-1'], 'integrated', 'ID-prefixed subjects on origin/epic/<name> are the trace')
  assert.equal(after['R-2'], 'todo', 'the sibling ticket is untouched')
})

test('the Delivery line parses tolerantly and exposes in find and list', () => {
  const g = JSON.parse(run(repo, 'find', 'G-1', '--json'))
  assert.equal(g.delivery, 'release', 'prose after the value must not break the parse')

  const a = JSON.parse(run(repo, 'find', 'A-2', '--json'))
  assert.equal(a.delivery, 'incremental')

  const data = JSON.parse(run(repo, 'list', '--json'))
  assert.deepEqual(data.modes.gamma, { delivery: 'release', reviewerModel: 'opus', workerModel: 'sonnet', workerRunner: 'codex', shadowReviewer: 'codex', plannerModel: 'fable', consequencePaths: ['src/auth/**', 'migrations/**'], fixBoundsExclude: ['src/messages/*.json'], designSources: null, ticketBudget: 250000 })
  assert.deepEqual(data.modes.alpha, { delivery: 'incremental', reviewerModel: null, workerModel: null, workerRunner: null, shadowReviewer: null, plannerModel: null, consequencePaths: null, fixBoundsExclude: null, designSources: null, ticketBudget: null })
})

test('a Worker model line pins the implementer; absent, workers inherit the session', () => {
  // The line exists so a plan written on one model can be implemented by
  // another — configuration in the versioned epic doc, like Reviewer model.
  const g = JSON.parse(run(repo, 'find', 'G-1', '--json'))
  assert.equal(g.workerModel, 'sonnet', 'prose after the value must not break the parse')
  // Absent is null, never a default — the skills pass no model at all and
  // the worker inherits the spawning session's.
  assert.equal(JSON.parse(run(repo, 'find', 'A-2', '--json')).workerModel, null)
})

test('an unrecognised or near-miss Delivery line warns instead of silently defaulting', () => {
  mkdirSync(join(repo, 'epics/misdeclared'), { recursive: true })
  writeFileSync(
    join(repo, 'epics/misdeclared/tickets.md'),
    '# Misdeclared\n\nDelivery: continuous\n\n## MD-1 — typo delivery\n\n**Scope.** M.\n',
  )
  mkdirSync(join(repo, 'epics/fancy-delivery'), { recursive: true })
  writeFileSync(
    join(repo, 'epics/fancy-delivery/tickets.md'),
    '# Fancy delivery\n\n**Delivery:** release\n\n## FD-1 — formatted delivery\n\n**Scope.** F.\n',
  )
  try {
    const data = JSON.parse(run(repo, 'list', '--json'))
    assert.equal(data.modes.misdeclared.delivery, 'continuous', 'the raw value is exposed, not coerced')
    assert.deepEqual(
      data.modes['fancy-delivery'],
      { delivery: 'incremental', reviewerModel: null, workerModel: null, workerRunner: null, shadowReviewer: null, plannerModel: null, consequencePaths: null, fixBoundsExclude: null, designSources: null, ticketBudget: null },
      'a formatted Delivery line reads as absent, so the default applies',
    )
    const rows = JSON.parse(run(repo, 'doctor', '--json'))
    assert.ok(rows.some((r) => r.level === 'warn' && /unrecognised delivery "continuous"/.test(r.msg)))
    assert.ok(
      rows.some((r) => r.level === 'warn' && r.msg.includes('fancy-delivery/tickets.md') && /will not parse/.test(r.msg)),
      'the near-miss scan covers the Delivery label',
    )
  } finally {
    for (const e of ['misdeclared', 'fancy-delivery']) rmSync(join(repo, `epics/${e}`), { recursive: true, force: true })
  }
})

test('the retired two-line syntax is flagged, not silently ignored', () => {
  // "Release mode:" / "Run mode:" are not read at all — an epic written in
  // them would silently run incremental. The near-miss scan names them so
  // the author learns the Delivery syntax instead of trusting a dead line.
  mkdirSync(join(repo, 'epics/oldstyle'), { recursive: true })
  writeFileSync(
    join(repo, 'epics/oldstyle/tickets.md'),
    '# Oldstyle\n\nRelease mode: integration\n\nRun mode: autonomous\n\n## OS-1 — pre-2.0 preamble\n\n**Scope.** O.\n',
  )
  try {
    const data = JSON.parse(run(repo, 'list', '--json'))
    assert.deepEqual(
      data.modes.oldstyle,
      { delivery: 'incremental', reviewerModel: null, workerModel: null, workerRunner: null, shadowReviewer: null, plannerModel: null, consequencePaths: null, fixBoundsExclude: null, designSources: null, ticketBudget: null },
      'the dead labels parse as nothing; the delivery default applies',
    )
    const rows = JSON.parse(run(repo, 'doctor', '--json'))
    const warns = rows.filter((r) => r.level === 'warn' && r.msg.includes('oldstyle/tickets.md'))
    assert.equal(warns.length, 2, 'both dead lines must be flagged')
    for (const w of warns) assert.match(w.msg, /"Release mode:"\/"Run mode:" are not read at all/)
  } finally {
    rmSync(join(repo, 'epics/oldstyle'), { recursive: true, force: true })
  }
})

test('a Reviewer model preamble line is optional and parses tolerantly', () => {
  // Present and prose-decorated (gamma): the value is the first word after
  // the colon, the prose is ignored — same tolerant parse as the mode lines.
  const g = JSON.parse(run(repo, 'find', 'G-1', '--json'))
  assert.equal(g.reviewerModel, 'opus', 'prose after the value must not break the parse')

  // Absent (alpha): null, never a silent default — the skills own the
  // "strongest available" fallback, not this script.
  const a = JSON.parse(run(repo, 'find', 'A-2', '--json'))
  assert.equal(a.reviewerModel, null)
})

test('a plain Reviewer model line parses case-insensitively, dotted model ids intact', () => {
  // No prose after the value, label in the wrong case, a value with digits
  // and a dot — a real model identifier must survive the parse whole.
  mkdirSync(join(repo, 'epics/staffed'), { recursive: true })
  writeFileSync(
    join(repo, 'epics/staffed/tickets.md'),
    '# Staffed\n\nreviewer MODEL: Claude-Opus-4.5\n\n## ST-1 — staffed epic\n\n**Scope.** S.\n',
  )
  try {
    assert.equal(JSON.parse(run(repo, 'find', 'ST-1', '--json')).reviewerModel, 'claude-opus-4.5')
    assert.equal(JSON.parse(run(repo, 'list', '--json')).modes.staffed.reviewerModel, 'claude-opus-4.5')
  } finally {
    rmSync(join(repo, 'epics/staffed'), { recursive: true, force: true })
  }
})

test('a Consequence paths line parses as a glob list, case preserved, prose ignored', () => {
  // Comma-separated segments, first word of each is the glob — the tolerant
  // parse extended to a list. Case is preserved: paths are case-sensitive,
  // unlike models and delivery. The run driver applies these as the review
  // tier's floor; this script only parses and exposes them.
  const g = JSON.parse(run(repo, 'find', 'G-1', '--json'))
  assert.deepEqual(g.consequencePaths, ['src/auth/**', 'migrations/**'], 'prose after the last glob must not break the parse')
  assert.equal(JSON.parse(run(repo, 'find', 'A-2', '--json')).consequencePaths, null, 'absent is null, never a default')

  mkdirSync(join(repo, 'epics/cased'), { recursive: true })
  writeFileSync(
    join(repo, 'epics/cased/tickets.md'),
    '# Cased\n\nConsequence paths: Src/Auth/**.ts\n\n**Consequence paths:** billing/**\n\n## C-1 — cased paths\n\n**Scope.** C.\n',
  )
  try {
    assert.deepEqual(
      JSON.parse(run(repo, 'list', '--json')).modes.cased.consequencePaths,
      ['Src/Auth/**.ts'],
      'case survives, and the bolded line is not parsed',
    )
    // The formatted line is declaration-shaped but will not parse — silently
    // losing a consequence glob lowers scrutiny, so doctor's near-miss scan
    // must name it.
    const rows = JSON.parse(run(repo, 'doctor', '--json'))
    assert.ok(
      rows.some((r) => r.level === 'warn' && r.msg.includes('cased/tickets.md') && /will not parse/.test(r.msg)),
      'the near-miss scan covers the Consequence paths label',
    )
  } finally {
    rmSync(join(repo, 'epics/cased'), { recursive: true, force: true })
  }
})

test('a Shadow reviewer line parses into find --json, and a formatted one is a near-miss', () => {
  // A trial line: the run driver runs a Codex review beside the Claude
  // reviewer when it reads `codex`. A typo would silently collect nothing, so
  // a formatted line must be named by doctor like every other declaration.
  assert.equal(JSON.parse(run(repo, 'find', 'G-1', '--json')).shadowReviewer, 'codex', 'prose after the value must not break the parse')
  assert.equal(JSON.parse(run(repo, 'find', 'A-2', '--json')).shadowReviewer, null, 'absent is null')

  mkdirSync(join(repo, 'epics/shady'), { recursive: true })
  writeFileSync(join(repo, 'epics/shady/tickets.md'), '# Shady\n\n**Shadow reviewer:** codex\n\n## S-1 — shady\n\n**Scope.** S.\n')
  try {
    assert.equal(JSON.parse(run(repo, 'list', '--json')).modes.shady.shadowReviewer, null, 'the bolded line is not parsed')
    const rows = JSON.parse(run(repo, 'doctor', '--json'))
    assert.ok(
      rows.some((r) => r.level === 'warn' && r.msg.includes('shady/tickets.md') && /will not parse/.test(r.msg)),
      'the near-miss scan covers the Shadow reviewer label',
    )
  } finally {
    rmSync(join(repo, 'epics/shady'), { recursive: true, force: true })
  }
})

test('a Fix bounds exclude line parses as a glob list and reaches find --json and list --json', () => {
  // The run driver's fix-bounds gate leaves these globs out of the review-fix
  // diff, the way it already leaves out epics/ — for files a fix fans out
  // into mechanically (translation catalogs: one new key touches every locale
  // file). Same tolerant list parse as Consequence paths, and this script
  // only parses and exposes it; the driver validates and applies it. Both
  // commands must carry it: `find` is the door a ticket walks through and
  // `list --json` is the one the run skill reads the epic's configuration
  // from, so a line exposed by only one of them reaches no run.
  const g = JSON.parse(run(repo, 'find', 'G-1', '--json'))
  // The fixture's trailing prose is comma-free on purpose: the list splits on
  // commas, so a comma in the prose would make the rest of the sentence an
  // entry and the driver would refuse the run. Only the first WORD of each
  // comma-separated segment is the glob — that is what this asserts.
  assert.deepEqual(g.fixBoundsExclude, ['src/messages/*.json'], 'comma-free prose after the last glob must not break the parse')
  assert.equal(JSON.parse(run(repo, 'find', 'A-2', '--json')).fixBoundsExclude, null, 'absent is null, never a default')
  assert.deepEqual(JSON.parse(run(repo, 'list', '--json')).modes.gamma.fixBoundsExclude, ['src/messages/*.json'])

  mkdirSync(join(repo, 'epics/fanout'), { recursive: true })
  writeFileSync(
    join(repo, 'epics/fanout/tickets.md'),
    '# Fanout\n\nFix bounds exclude: Src/Messages/*.json, locales/**\n\n## F-1 — fan-out\n\n**Scope.** F.\n',
  )
  try {
    assert.deepEqual(
      JSON.parse(run(repo, 'list', '--json')).modes.fanout.fixBoundsExclude,
      ['Src/Messages/*.json', 'locales/**'],
      'case survives — paths are case-sensitive — and every comma-separated glob is kept',
    )
  } finally {
    rmSync(join(repo, 'epics/fanout'), { recursive: true, force: true })
  }
})

test('a Fix bounds exclude near-miss is flagged by doctor, never silently dropped', () => {
  // A formatted line is declaration-shaped but parses as nothing, and the
  // default is "no exclusions" — which re-halts the exact fan-out the line
  // was written to wave through, silently. Same failure class as every other
  // near-miss, so the label belongs in doctor's near set, and the warning
  // must spell the syntax that would parse.
  mkdirSync(join(repo, 'epics/bolded'), { recursive: true })
  writeFileSync(
    join(repo, 'epics/bolded/tickets.md'),
    '# Bolded\n\n**Fix bounds exclude:** src/messages/*.json\n\n## B-9 — bolded line\n\n**Scope.** B.\n',
  )
  try {
    assert.equal(JSON.parse(run(repo, 'list', '--json')).modes.bolded.fixBoundsExclude, null, 'the bolded line is not parsed')
    const rows = JSON.parse(run(repo, 'doctor', '--json'))
    const row = rows.find((r) => r.level === 'warn' && r.msg.includes('bolded/tickets.md') && /will not parse/.test(r.msg))
    assert.ok(row, 'the near-miss scan covers the Fix bounds exclude label')
    assert.match(
      row.msg,
      /"Fix bounds exclude: <glob>\[, <glob>\]"/,
      'the warning enumerates the line among the declarations that do parse — a near-miss message that cannot name the right syntax teaches nothing',
    )
  } finally {
    rmSync(join(repo, 'epics/bolded'), { recursive: true, force: true })
  }
})

test('a Design sources line keeps each whole path, spaces and all, and reaches find and list', () => {
  // NOT the glob list's parse: that one keeps a segment's first word, which
  // would turn "designs/City Desktop.html" into "designs/City" — a path to
  // nothing, handed to every reader of the epic. The whole text between
  // commas is the path here, which is also why the line carries no prose.
  mkdirSync(join(repo, 'epics/designed'), { recursive: true })
  mkdirSync(join(repo, 'designs'), { recursive: true })
  writeFileSync(join(repo, 'designs/map.html'), '<!doctype html><title>map</title>')
  writeFileSync(
    join(repo, 'epics/designed/tickets.md'),
    '# Designed\n\nDesign sources: designs/City Desktop.html, designs/map.html\n\n## D-1 — the page\n\n**Scope.** D.\n',
  )
  try {
    const d = JSON.parse(run(repo, 'find', 'D-1', '--json'))
    assert.deepEqual(d.designSources, ['designs/City Desktop.html', 'designs/map.html'], 'both paths whole, the space kept')
    assert.equal(d.designMap, null, 'no design-map.json yet — null, never a path to a file that is not there')
    assert.deepEqual(
      JSON.parse(run(repo, 'list', '--json')).modes.designed.designSources,
      ['designs/City Desktop.html', 'designs/map.html'],
      'the run skill reads an epic’s configuration from list --json, so a line only find exposes reaches no run',
    )
    assert.equal(JSON.parse(run(repo, 'find', 'A-2', '--json')).designSources, null, 'absent is null, never a default')
    // The map is derived from the folder, never declared: writing one is all
    // it takes for every reader to be handed its absolute path.
    writeFileSync(join(repo, 'epics/designed/design-map.json'), '{"landmarks":[]}')
    assert.equal(
      JSON.parse(run(repo, 'find', 'D-1', '--json')).designMap,
      join(repo, 'epics/designed/design-map.json'),
      'the design map is exposed as an absolute path once it exists',
    )
  } finally {
    rmSync(join(repo, 'epics/designed'), { recursive: true, force: true })
    rmSync(join(repo, 'designs'), { recursive: true, force: true })
  }
})

test('doctor warns about a declared design source that does not exist, and about a line that will not parse', () => {
  // Two silent failures at one door. A path to nothing parses fine and hands
  // every reader — brief, ticket reviewer, plan reviewer — a file they cannot
  // open; a formatted label parses as nothing at all and the epic reads as
  // having no design. Both are named, and the missing one by its full path,
  // because a path with a space is where a truncating reader goes wrong.
  mkdirSync(join(repo, 'epics/designed'), { recursive: true })
  mkdirSync(join(repo, 'designs'), { recursive: true })
  writeFileSync(join(repo, 'designs/map.html'), '<!doctype html><title>map</title>')
  writeFileSync(
    join(repo, 'epics/designed/tickets.md'),
    '# Designed\n\nDesign sources: designs/City Desktop.html, designs/map.html\n\n**Design sources:** designs/other.html\n\n## D-1 — the page\n\n**Scope.** D.\n',
  )
  try {
    const rows = JSON.parse(run(repo, 'doctor', '--json'))
    const missing = rows.filter((r) => r.level === 'warn' && /does not exist/.test(r.msg))
    assert.equal(missing.length, 1, 'only the path that is really absent is named')
    assert.match(missing[0].msg, /designs\/City Desktop\.html/, 'named in full, the space included')
    assert.ok(!missing.some((r) => /map\.html/.test(r.msg)), 'the path that exists is not flagged')
    const near = rows.find((r) => r.level === 'warn' && r.msg.includes('designed/tickets.md') && /will not parse/.test(r.msg))
    assert.ok(near, 'the near-miss scan covers the Design sources label')
    assert.match(near.msg, /"Design sources: <path>\[, <path>\]"/, 'the warning names the syntax that would parse')
  } finally {
    rmSync(join(repo, 'epics/designed'), { recursive: true, force: true })
    rmSync(join(repo, 'designs'), { recursive: true, force: true })
  }
})

test('a Ticket budget line parses digits with k/m suffixes; an unrecognised suffix reads as absent and is flagged', () => {
  // The run driver enforces this as a per-ticket output-token ceiling; this
  // script only parses and exposes it. The suffix boundary is load-bearing:
  // a bare digit grab would read "250k" as 250 — a ceiling a thousand times
  // too low, silently — so the value must end at whitespace, and anything
  // else parses as absent for the doctor near-miss scan to flag.
  const g = JSON.parse(run(repo, 'find', 'G-1', '--json'))
  assert.equal(g.ticketBudget, 250000, 'prose after the number must not break the parse')
  assert.equal(JSON.parse(run(repo, 'find', 'A-2', '--json')).ticketBudget, null, 'absent is null, never a default')

  mkdirSync(join(repo, 'epics/kbudget'), { recursive: true })
  writeFileSync(
    join(repo, 'epics/kbudget/tickets.md'),
    '# Kbudget\n\nTicket budget: 250k\n\n## KB-1 — suffixed budget\n\n**Scope.** K.\n',
  )
  mkdirSync(join(repo, 'epics/xbudget'), { recursive: true })
  writeFileSync(
    join(repo, 'epics/xbudget/tickets.md'),
    '# Xbudget\n\nTicket budget: 250 tokens\n\nTicket budget as prose is fine.\n\n## XB-1 — spelled-out budget\n\n**Scope.** X.\n',
  )
  mkdirSync(join(repo, 'epics/badbudget'), { recursive: true })
  writeFileSync(
    join(repo, 'epics/badbudget/tickets.md'),
    '# Badbudget\n\nTicket budget: 250x\n\n## BB-1 — mistyped suffix\n\n**Scope.** B.\n',
  )
  try {
    const data = JSON.parse(run(repo, 'list', '--json'))
    assert.equal(data.modes.kbudget.ticketBudget, 250000, 'the k suffix multiplies')
    assert.equal(data.modes.xbudget.ticketBudget, 250, 'a bare number followed by prose parses as the number')
    assert.equal(data.modes.badbudget.ticketBudget, null, 'an unrecognised suffix must not parse as its digit prefix')
    const rows = JSON.parse(run(repo, 'doctor', '--json'))
    assert.ok(
      rows.some((r) => r.level === 'warn' && r.msg.includes('badbudget/tickets.md') && /will not parse/.test(r.msg)),
      'the near-miss scan flags the unparseable budget',
    )
    assert.ok(rows.every((r) => !(r.msg || '').includes('kbudget/tickets.md')), 'a suffixed budget is well-formed and doctor-silent')
  } finally {
    for (const e of ['kbudget', 'xbudget', 'badbudget']) rmSync(join(repo, `epics/${e}`), { recursive: true, force: true })
  }
})

test('an epic with no declaration lines defaults to incremental delivery', () => {
  mkdirSync(join(repo, 'epics/delta'), { recursive: true })
  writeFileSync(join(repo, 'epics/delta/tickets.md'), '# Delta\n\n## D-1 — bare epic\n\n**Scope.** Bare.\n')
  try {
    const data = JSON.parse(run(repo, 'list', '--json'))
    assert.deepEqual(data.modes.delta, { delivery: 'incremental', reviewerModel: null, workerModel: null, workerRunner: null, shadowReviewer: null, plannerModel: null, consequencePaths: null, fixBoundsExclude: null, designSources: null, ticketBudget: null })
  } finally {
    rmSync(join(repo, 'epics/delta'), { recursive: true, force: true })
  }
})

test('the Delivery line parses case-insensitively', () => {
  mkdirSync(join(repo, 'epics/shout'), { recursive: true })
  writeFileSync(
    join(repo, 'epics/shout/tickets.md'),
    '# Shout\n\nDELIVERY: Release\n\n## S-1 — loud delivery\n\n**Scope.** S.\n',
  )
  try {
    const data = JSON.parse(run(repo, 'list', '--json'))
    assert.deepEqual(data.modes.shout, { delivery: 'release', reviewerModel: null, workerModel: null, workerRunner: null, shadowReviewer: null, plannerModel: null, consequencePaths: null, fixBoundsExclude: null, designSources: null, ticketBudget: null })
  } finally {
    rmSync(join(repo, 'epics/shout'), { recursive: true, force: true })
  }
})

test('a value-less label line reads as absent, never the next paragraph\'s first word', () => {
  // The class Q-7's review verified live: \s* around grab's colon matched
  // newlines, so a bare label adopted the first word of the following
  // paragraph — prose beginning "Release …" would parse as
  // delivery: 'release'. Each paragraph below opens with a word the old
  // parse would have scavenged into a live (and here unwanted) value. The
  // last shape — label and colon split across lines, the markdown
  // definition-list look — pins the PRE-colon anchor, which the value-less
  // shapes cannot reach (Q-14's review: reverting that side alone left the
  // suite green).
  mkdirSync(join(repo, 'epics/bare'), { recursive: true })
  writeFileSync(
    join(repo, 'epics/bare/tickets.md'),
    '# Bare\n\nDelivery:\n\nRelease is not wanted here.\n\nReviewer model:\n\nOpus is not being pinned.\n\nWorker model:\n\nSonnet is not being pinned either.\n\nDelivery\n: release\n\n## B-1 — value-less labels\n\n**Scope.** B.\n',
  )
  try {
    const data = JSON.parse(run(repo, 'list', '--json'))
    assert.deepEqual(
      data.modes.bare,
      { delivery: 'incremental', reviewerModel: null, workerModel: null, workerRunner: null, shadowReviewer: null, plannerModel: null, consequencePaths: null, fixBoundsExclude: null, designSources: null, ticketBudget: null },
      'a value-less label must read as absent (incremental default / null), never scavenge prose',
    )
    // And doctor's near-miss wording is true of these lines: they will not
    // parse, they silently default, and the hint names what is missing.
    const rows = JSON.parse(run(repo, 'doctor', '--json'))
    const warns = rows.filter((r) => r.level === 'warn' && r.msg.includes('bare/tickets.md'))
    assert.equal(warns.length, 4, 'the three value-less lines and the colon-less split label must all be flagged')
    for (const w of warns) {
      assert.match(w.msg, /will not parse/)
      assert.match(w.msg, /value on the label's own line/)
    }
  } finally {
    rmSync(join(repo, 'epics/bare'), { recursive: true, force: true })
  }
})

test('well-formed Delivery and Reviewer model lines are doctor-silent', () => {
  // The ACCEPTING branch of doctor's strict preamble parse. gamma carries
  // both labels well-formed and prose-decorated — none may warn. Mutation
  // found by Q-7's review: with the Reviewer model alternative deleted from
  // the strict regex, every correctly configured epic warned and no test
  // noticed.
  const rows = JSON.parse(run(repo, 'doctor', '--json'))
  const gamma = rows.filter((r) => r.msg.includes('gamma/tickets.md'))
  assert.deepEqual(gamma, [], 'no doctor row may point at gamma/tickets.md')
})

test('a ticket ID defined in two epics is flagged on the board and refused by find', () => {
  mkdirSync(join(repo, 'epics/beta'), { recursive: true })
  writeFileSync(
    join(repo, 'epics/beta/tickets.md'),
    `# Beta epic — tickets

## A-1 — a colliding ID

**Scope.** Collision.
`,
  )
  try {
    const data = JSON.parse(run(repo, 'list', '--json'))
    assert.deepEqual(data.duplicates, { 'A-1': ['alpha', 'beta'] })

    const fail = runFail(repo, 'find', 'A-1')
    assert.equal(fail.status, 1)
    assert.match(fail.stderr, /more than one epic/)
    assert.match(fail.stderr, /alpha, beta/)

    // Unambiguous IDs still resolve while the collision exists.
    assert.equal(JSON.parse(run(repo, 'find', 'A-2', '--json')).epic, 'alpha')
  } finally {
    rmSync(join(repo, 'epics/beta'), { recursive: true, force: true })
  }
})

test('current is null in a checkout not named for an epic', () => {
  const out = run(repo, 'current')
  assert.match(out, /not an epic folder/)
})

test('doctor flags the near-miss status heading that the board silently ignores', () => {
  const rows = JSON.parse(run(repo, 'doctor', '--json'))
  const msgs = rows.map((r) => r.msg)

  const nearMiss = rows.find((r) => r.msg.includes('status.md') && r.msg.includes('A-3'))
  assert.ok(nearMiss, `expected a warning about the malformed A-3 heading, got:\n${msgs.join('\n')}`)
  assert.equal(nearMiss.level, 'warn')
  assert.match(nearMiss.msg, /reads as not done/)

  assert.ok(rows.some((r) => r.level === 'warn' && /CLAUDE\.md or AGENTS\.md/.test(r.msg)))
  assert.ok(rows.some((r) => r.level === 'ok' && /remote origin/.test(r.msg)))
  assert.ok(!rows.some((r) => r.level === 'fail'), 'fixture repo has all hard preconditions')
})

test("doctor's no-status.md hint names both creation doors", () => {
  // The quick lane never runs /flow:epic — its log is created by the first
  // ticket's status entry (in-session for quick) — so a hint naming only
  // "/flow:epic" advertised a recovery unreachable from the state that
  // triggers it (Q-16, found by Q-13's review). gamma has no status.md, so
  // the warning fires on the shared fixture; the full message is pinned so
  // neither door can silently drop.
  const rows = JSON.parse(run(repo, 'doctor', '--json'))
  const warn = rows.find((r) => r.level === 'warn' && r.msg.startsWith('gamma: no status.md'))
  assert.ok(warn, 'gamma has no status.md, so the warning must fire')
  assert.equal(
    warn.msg,
    "gamma: no status.md — created at sign-off by /flow:epic, or by the first ticket's status entry (/flow:ticket <ID>, or in-session by /flow:quick); without it DONE/BLOCKED are invisible",
  )
})

test('doctor fails hard when there is no origin remote', () => {
  const bare = join(tmp, 'no-remote')
  git(tmp, 'init', '--initial-branch=main', bare)
  const fail = runFail(bare, 'doctor')
  assert.equal(fail.status, 1)
})

// ── acceptance checks: the check subcommand ──────────────────────────────────
// Its own throwaway repository, so the shared fixture's board and doctor
// expectations stay untouched by check-specific epics. CHECK commands run
// through a shell with the repo root as cwd; `node -e` keeps them portable.

const ctmp = realpathSync(mkdtempSync(join(tmpdir(), 'tickets-check-')))
after(() => rmSync(ctmp, { recursive: true, force: true }))
const crepo = join(ctmp, 'repo')
git(ctmp, 'init', '--initial-branch=main', crepo)
git(crepo, 'config', 'user.email', 'test@example.com')
git(crepo, 'config', 'user.name', 'Test')
git(crepo, 'config', 'commit.gpgsign', 'false')
mkdirSync(join(crepo, 'epics/checks'), { recursive: true })
const checksDoc = join(crepo, 'epics/checks/tickets.md')
writeFileSync(
  checksDoc,
  `# Checks epic — tickets

Delivery: incremental

## K-1 — passing checks

**Scope.**
- the thing

**Acceptance criteria.**
- prints the count
  CHECK: node -e "console.log('ok 3/3 pass')"
  EXPECT: ok 3/3
- exits clean, no EXPECT needed
  CHECK: node -e "process.exit(0)"

## K-2 — a failing EXPECT

**Acceptance criteria.**
- claims yes but prints no
  CHECK: node -e "console.log('no')"
  EXPECT: yes

## K-3 — a nonzero exit

**Acceptance criteria.**
- exits 1
  CHECK: node -e "console.error('boom'); process.exit(1)"

## K-4 — no checks at all

**Acceptance criteria.**
- prose criterion, verified by hand

## K-5 — malformed lines

**Acceptance criteria.**
- lowercase label
  check: node -e "console.log('never runs')"
- orphan expect
  EXPECT: nothing above me
- CHECK: node -e "console.log('bullet form')"

## K-7 — CHECK shapes that parse and run but can never pass

The two defective lines are quoted verbatim from redesign-foundation's
history (weekendgoals 650169d7 repaired both): FND-2's, whose escaped pipe
made it pass on any tree, and FND-6's, which carries both shapes at once and
halted a live run on correct code.

**Acceptance criteria.**
- FND-2's MobileSidebar check — escaped pipe, no recursive count
  CHECK: cd weekendgoals-ui-next && node -e "const{execSync}=require('child_process');const o=execSync('grep -rn \\"MobileSidebar\\\\|mobile-sidebar\\" src test || true').toString();process.exit(o.trim()?1:0)"
- FND-6's breadcrumb check — escaped pipe and a recursive count together
  CHECK: cd weekendgoals-ui-next && node -e "const{execSync}=require('child_process');const n=execSync('grep -rc \\"export const generateBreadcrumbListSchema\\\\|export function generateBreadcrumbListSchema\\" src/functional/structured-data.ts').toString().trim();process.exit(n==='1'?0:1)"
  EXPECT: 1
- the same recursive count spelled -cr
  CHECK: sh -c "grep -cr generateBreadcrumbListSchema src"
  EXPECT: 1
- and spelled as two separate flags
  CHECK: grep -r -c generateBreadcrumbListSchema src
  EXPECT: 1
- GHF-1's single-file count is sound and passed live — it must not be flagged
  CHECK: grep -c "Me and the log" api-gateway/CLAUDE.md
  EXPECT: 1

## K-8 — a suite that skipped itself

The output is console-foundations CF-3's, measured: a Postgres-backed vitest
file under \`describe.skipIf(!DATABASE_URL)\` skips whole, vitest exits 0, and
the EXPECT string still appears — on the line that says it skipped.

**Acceptance criteria.**
- the tenant-scoping suite passes
  CHECK: node -e "console.log(' ↓ src/db/tenant.int.test.ts (12 tests | 12 skipped)'); console.log(' Test Files  1 skipped (1)'); console.log(' Tests  12 skipped (12)')"
  EXPECT: src/db/tenant.int.test.ts

## K-9 — the named test skipped while its neighbours passed

**Acceptance criteria.**
- the route refuses a foreign tenant
  CHECK: node -e "console.log(' ✓ contracts > digest round trip 3ms'); console.log(' ↓ routes > refuses a foreign tenant'); console.log(' Tests  1 passed | 1 skipped (2)')"
  EXPECT: refuses a foreign tenant

## K-10 — a skipped suite with no EXPECT to point at

**Acceptance criteria.**
- the integration suite runs
  CHECK: node -e "console.log(' Test Files  1 skipped (1)'); console.log(' Tests  12 skipped (12)')"

## K-11 — runs that did happen, which a skip rule must not touch

**Acceptance criteria.**
- the suite passes with a couple of tests skipped
  CHECK: node -e "console.log(' Tests  246 passed | 2 skipped (248)')"
  EXPECT: 246 passed
- the migration is skipped when the table already exists
  CHECK: node -e "console.log('the migration is skipped when the table already exists')"
  EXPECT: migration is skipped
- node --test counts its skips beside its passes
  CHECK: node -e "console.log('# pass 56'); console.log('# fail 0'); console.log('# skipped 2')"
  EXPECT: # fail 0

## K-12 — a runner that echoes its argv above the skip it reports

\`npm test -- <file>\` echoes the command before running it, so an EXPECT
naming a test FILE matches the echo as well as the line saying it skipped.
The echo is not evidence that anything ran.

**Acceptance criteria.**
- the tenant-scoping suite passes
  CHECK: node -e "console.log(''); console.log('> backend@1.0.0 test'); console.log('> vitest run src/db/tenant.int.test.ts'); console.log(''); console.log(' ↓ src/db/tenant.int.test.ts (12 tests | 12 skipped)'); console.log(' Tests  12 skipped (12)')"
  EXPECT: src/db/tenant.int.test.ts

## K-13 — one file skipped while the suite ran

**Acceptance criteria.**
- the database tests pass
  CHECK: node -e "console.log(' ↓ src/db/legacy.test.ts (2 tests | 2 skipped)'); console.log(' Tests  12 passed (12) in src/db')"
  EXPECT: src/db

## K-14 — the runner names the file while starting, and not when it reports the skip

The echo's other shape. K-12's skip line repeated the file name, so the EXPECT
still reached it; here the summary counts files instead, the EXPECT matches
only the line that announced the run, and nothing among the matching lines
says whether anything happened.

**Acceptance criteria.**
- the tenant-scoping suite passes
  CHECK: node -e "console.log('> vitest run src/db/tenant.int.test.ts'); console.log(''); console.log(' Test Files  1 skipped (1)'); console.log(' Tests  12 skipped (12)')"
  EXPECT: src/db/tenant.int.test.ts

## K-15 — TAP that ran one test and skipped another, with no summary line

**Acceptance criteria.**
- the digest round trip holds
  CHECK: node -e "console.log('TAP version 13'); console.log('1..2'); console.log('ok 1 - the digest round trips'); console.log('ok 2 - the integration case # SKIP no DATABASE_URL')"

## K-16 — TAP in which everything skipped

**Acceptance criteria.**
- the integration cases hold
  CHECK: node -e "console.log('TAP version 13'); console.log('1..2'); console.log('ok 1 - the integration case # SKIP no DATABASE_URL'); console.log('not ok 2 - the write fence # SKIP no DATABASE_URL')"
`,
)
// A second epic in the same repository for the COMPARE criterion: the
// fidelity form of the machine-runnable criterion, which this script never
// runs because it owns no browser. Its own epic because it needs a
// `Design sources:` line, and the checks epic's preamble is what the --from
// tests above assert the shape of.
mkdirSync(join(crepo, 'designs'), { recursive: true })
writeFileSync(join(crepo, 'designs/City Desktop.html'), '<!doctype html><title>city</title>')
writeFileSync(join(crepo, 'designs/map.html'), '<!doctype html><title>map</title>')
mkdirSync(join(crepo, 'epics/compares'), { recursive: true })
const comparesDoc = join(crepo, 'epics/compares/tickets.md')
writeFileSync(
  comparesDoc,
  `# Compares epic — tickets

Delivery: incremental
Design sources: designs/City Desktop.html, designs/map.html

## P-1 — a comparison of named landmarks

**Acceptance criteria.**
- the hero and the nav match the artboard at both widths
  COMPARE: designs/City Desktop.html @ 1440,393
  LANDMARKS: hero, nav
- the command answers
  CHECK: node -e "console.log('ok 1/1')"
  EXPECT: ok 1/1

## P-2 — the whole page, at one width

**Acceptance criteria.**
- the whole page matches the artboard
  COMPARE: designs/map.html @ 1440

## P-3 — a comparison with no width

**Acceptance criteria.**
- the page renders as drawn
  COMPARE: designs/map.html

## P-4 — LANDMARKS with no COMPARE above it

**Acceptance criteria.**
- the hero matches
  LANDMARKS: hero

## P-5 — a comparison naming a path the epic does not declare

**Acceptance criteria.**
- the page matches
  COMPARE: designs/other.html @ 1440

## P-6 — a comparison-shaped line that will not parse

**Acceptance criteria.**
- the page matches
  Compare: designs/map.html @ 1440
`,
)
git(crepo, 'add', '.')
git(crepo, 'commit', '-m', 'checks epic')

test('check runs CHECK commands and passes on exit 0 plus EXPECT match', () => {
  const out = JSON.parse(run(crepo, 'check', 'K-1', '--json'))
  assert.equal(out.total, 2)
  assert.equal(out.passed, 2)
  assert.equal(out.allPassed, true)
  assert.equal(out.from, null)
  assert.equal(out.checks[0].criterion, 'prints the count')
  // The evidence is the deciding output line, not a feeling of completion.
  assert.match(out.checks[0].evidence, /ok 3\/3/)
  assert.equal(out.checks[1].expect, null)
  assert.equal(out.checks[1].evidence, 'exit 0')
  const text = run(crepo, 'check', 'K-1')
  assert.match(text, /2\/2 checks passed/)
})

test('an EXPECT the output does not contain fails the gate', () => {
  const fail = runFail(crepo, 'check', 'K-2', '--json')
  assert.equal(fail.status, 1)
  const out = JSON.parse(fail.stdout)
  assert.equal(out.allPassed, false)
  assert.equal(out.passed, 0)
  assert.match(out.checks[0].evidence, /does not contain "yes"/)
})

test('a nonzero exit fails the gate with the exit code and output as evidence', () => {
  const fail = runFail(crepo, 'check', 'K-3', '--json')
  assert.equal(fail.status, 1)
  const out = JSON.parse(fail.stdout)
  assert.match(out.checks[0].evidence, /exit 1/)
  assert.match(out.checks[0].evidence, /boom/)
})

test('a ticket with no CHECK criteria exits 0 with an empty ledger — an answer, not a failure', () => {
  const text = run(crepo, 'check', 'K-4')
  assert.match(text, /no CHECK criteria in K-4/)
  const out = JSON.parse(run(crepo, 'check', 'K-4', '--json'))
  assert.equal(out.total, 0)
  assert.equal(out.allPassed, true)
})

test('malformed CHECK/EXPECT lines fail the gate rather than silently skipping', () => {
  const fail = runFail(crepo, 'check', 'K-5', '--json')
  assert.equal(fail.status, 1)
  const out = JSON.parse(fail.stdout)
  assert.equal(out.total, 0)
  assert.equal(out.allPassed, false)
  assert.equal(out.problems.length, 3)
  const whys = out.problems.map((p) => p.why).join('\n')
  assert.match(whys, /will not parse/)
  assert.match(whys, /no CHECK line above it/)
  assert.match(whys, /its own bullet/)
})

test('--from reads the criteria from the ref, never the working tree', () => {
  const original = readFileSync(checksDoc, 'utf8')
  try {
    // Soften the working-tree copy the way a worker branch could; the
    // committed document must still be the judge.
    writeFileSync(checksDoc, original.replace('EXPECT: ok 3/3', 'EXPECT: text the output never prints'))
    const tree = runFail(crepo, 'check', 'K-1', '--json')
    assert.equal(tree.status, 1, 'the working-tree copy fails')
    const out = JSON.parse(run(crepo, 'check', 'K-1', '--json', '--from', 'HEAD'))
    assert.equal(out.allPassed, true, 'the committed copy passes')
    assert.equal(out.from, 'HEAD')
  } finally {
    writeFileSync(checksDoc, original)
  }
})

test('--from a ref that cannot be read refuses instead of falling back to the working tree', () => {
  const fail = runFail(crepo, 'check', 'K-1', '--json', '--from', 'refs/no/such/ref')
  assert.equal(fail.status, 1)
  assert.match(fail.stderr, /cannot read epics\/checks\/tickets\.md from ref/)
  const bare = runFail(crepo, 'check', 'K-1', '--from')
  assert.equal(bare.status, 2)
  assert.match(bare.stderr, /--from needs a git ref/)
})

test('find --from reads the epic declarations from the ref, never the working tree', () => {
  const original = readFileSync(checksDoc, 'utf8')
  try {
    // Raise the ceiling in the working tree the way a ticket branch's own copy
    // of the preamble could. The run driver reads the budget through this
    // flag precisely so that edit cannot reach the gate that judges it.
    writeFileSync(checksDoc, original.replace('Delivery: incremental', 'Delivery: incremental\nTicket budget: 999k'))
    assert.equal(JSON.parse(run(crepo, 'find', 'K-1', '--json')).ticketBudget, 999000, 'the working tree sees the edit')
    const out = JSON.parse(run(crepo, 'find', 'K-1', '--json', '--from', 'HEAD'))
    assert.equal(out.ticketBudget, null, 'the committed document is the source')
    assert.equal(out.from, 'HEAD')
    // Every other preamble declaration comes from the ref too...
    assert.equal(out.delivery, 'incremental')
    // ...and the facts that describe the repository as it is now do not move.
    assert.equal(out.branch, 'k-1')
    assert.equal(out.ticketsDoc, checksDoc)
    // Without --from there is no `from` key at all: the default shape is what
    // every installed consumer of `find --json` reads.
    assert.ok(!('from' in JSON.parse(run(crepo, 'find', 'K-1', '--json'))))
  } finally {
    writeFileSync(checksDoc, original)
  }
})

test('find --from reads Design sources from the ref, while the design map stays a working-tree path', () => {
  // The declaration is read as signed off, like every other: a ticket branch
  // that adds a design source to its own copy of the preamble must not be
  // able to hand its reviewer a design nobody approved. The map's PATH is not
  // a declaration — it says where the file is now — so `--from` leaves it be.
  const original = readFileSync(checksDoc, 'utf8')
  try {
    writeFileSync(checksDoc, original.replace('Delivery: incremental', 'Delivery: incremental\nDesign sources: designs/City Desktop.html'))
    assert.deepEqual(JSON.parse(run(crepo, 'find', 'K-1', '--json')).designSources, ['designs/City Desktop.html'], 'the working tree sees the edit')
    const out = JSON.parse(run(crepo, 'find', 'K-1', '--json', '--from', 'HEAD'))
    assert.equal(out.designSources, null, 'the committed document is the source')
    writeFileSync(join(crepo, 'epics/checks/design-map.json'), '{"landmarks":[]}')
    assert.equal(
      JSON.parse(run(crepo, 'find', 'K-1', '--json', '--from', 'HEAD')).designMap,
      join(crepo, 'epics/checks/design-map.json'),
      'the map path describes the repository as it is now, uncommitted included',
    )
  } finally {
    writeFileSync(checksDoc, original)
    rmSync(join(crepo, 'epics/checks/design-map.json'), { force: true })
  }
})

test('find --from a ref that cannot be read refuses instead of falling back to the working tree', () => {
  const fail = runFail(crepo, 'find', 'K-1', '--json', '--from', 'refs/no/such/ref')
  assert.equal(fail.status, 1)
  assert.match(fail.stderr, /cannot read epics\/checks\/tickets\.md from ref/)
  const bare = runFail(crepo, 'find', 'K-1', '--from')
  assert.equal(bare.status, 2)
  assert.match(bare.stderr, /--from needs a git ref/)
})

// ── the COMPARE criterion ────────────────────────────────────────────────────
// Part of the one machine-runnable format, and the one part no code runs: the
// comparison needs a browser and this script owns none. So the ledger reports
// comparisons apart from checks, counts them in neither `total` nor `passed`
// — the unattended driver halts when `passed !== total`, so a compare counted
// there would halt every COMPARE ticket — and what gates them is the presence
// of the `**Compared:**` table in the status entry.

test('the ledger reports comparisons apart from checks, in neither total nor passed', () => {
  const out = JSON.parse(run(crepo, 'check', 'P-1', '--json'))
  assert.equal(out.total, 1, 'the CHECK beside it is the only thing counted')
  assert.equal(out.passed, 1)
  assert.equal(out.allPassed, true, 'a comparison this script never runs cannot fail the gate it is not in')
  assert.equal(out.compares.length, 1)
  const c = out.compares[0]
  assert.equal(c.criterion, 'the hero and the nav match the artboard at both widths')
  assert.equal(c.source, 'designs/City Desktop.html', 'the path keeps its space: everything before the last @ is the path')
  assert.deepEqual(c.widths, [1440, 393])
  assert.deepEqual(c.landmarks, ['hero', 'nav'])
  assert.equal(c.status, 'manual')
  assert.match(c.note, /run the differ, table required in the entry/)
  const text = run(crepo, 'check', 'P-1')
  assert.match(text, /1\/1 checks passed/)
  assert.match(text, /1 comparison\(s\) this script never runs/)
})

test('a COMPARE with no LANDMARKS line is the whole page, and is still not a check', () => {
  const out = JSON.parse(run(crepo, 'check', 'P-2', '--json'))
  assert.equal(out.total, 0, 'a ticket whose only criterion is a comparison has nothing to run')
  assert.equal(out.allPassed, true)
  assert.equal(out.compares[0].landmarks, null, 'absent means every landmark in the map — the whole page')
  assert.match(run(crepo, 'check', 'P-2'), /every landmark in the map — the whole page/)
})

test('a malformed COMPARE is a ledger problem and fails allPassed, exactly as a malformed CHECK does', () => {
  // Three shapes, each of which would otherwise be a criterion nobody can
  // re-run: no width, a LANDMARKS line narrowing nothing, and a path the
  // epic's Design sources line does not list — which is a comparison against
  // a file neither reviewer was handed.
  for (const [id, why] of [
    ['P-3', /no "@ <width>"/],
    ['P-4', /no COMPARE line above it/],
    ['P-5', /"Design sources:" line does not list/],
  ]) {
    const fail = runFail(crepo, 'check', id, '--json')
    assert.equal(fail.status, 1, `${id} must fail the gate`)
    const out = JSON.parse(fail.stdout)
    assert.equal(out.allPassed, false)
    assert.equal(out.compares.length, 0, 'a malformed comparison is a problem, never a silently listed one')
    assert.equal(out.problems.length, 1)
    assert.match(out.problems[0].why, why)
  }
})

test('prose that merely begins "Compare:" or "Landmarks:" is not a malformed criterion', () => {
  // Installed projects update live: before this pin, a case-blind near-miss
  // scan failed the gate of any ticket whose criteria used the English word.
  const dir = mkdtempSync(join(tmpdir(), 'tickets-prose-'))
  try {
    git(dir, 'init', '--initial-branch=main')
    git(dir, 'config', 'user.email', 'test@example.com')
    git(dir, 'config', 'user.name', 'Test')
    mkdirSync(join(dir, 'epics', 'prose'), { recursive: true })
    writeFileSync(
      join(dir, 'epics', 'prose', 'tickets.md'),
      `# Prose epic — tickets

## W-1 — words, not labels

**Acceptance criteria.**
- Compare: the old output with the new one by hand.
- Landmarks: every section keeps its heading.
  Compare: both by eye.
- it runs
  CHECK: true
`,
    )
    git(dir, 'add', '.')
    git(dir, 'commit', '-q', '-m', 'prose epic')
    // `run` throws on a nonzero exit, so reaching the asserts is the exit-0 half.
    const out = JSON.parse(run(dir, 'check', 'W-1', '--json'))
    assert.equal(out.problems.length, 0, JSON.stringify(out.problems))
    assert.equal(out.allPassed, true)
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
})

test('a comparison-shaped line that will not parse is a problem in every spelling, never a ticket owing nothing', () => {
  // Each of these read as `compares: 0, problems: 0` for one commit: the ticket
  // owed a comparison, the ledger said it owed none, and the gate that stops a
  // merge on a missing comparison had nothing to fire on.
  const shapes = [
    '- Compare: designs/a.html @ 1440',
    '- compare: designs/a.html @ 1440',
    '  Compare: designs/a.html @1440',
    '  compare: designs/a.html @ 1440,393',
    '- COMPARE: designs/a.html @ 1440',
    '  LANDMARKS : hero, nav',
  ]
  for (const shape of shapes) {
    const dir = mkdtempSync(join(tmpdir(), 'tickets-shape-'))
    try {
      git(dir, 'init', '--initial-branch=main')
      git(dir, 'config', 'user.email', 'test@example.com')
      git(dir, 'config', 'user.name', 'Test')
      mkdirSync(join(dir, 'epics', 'shape'), { recursive: true })
      writeFileSync(
        join(dir, 'epics', 'shape', 'tickets.md'),
        `# Shape epic — tickets\n\nDesign sources: designs/a.html\n\n## S-1 — one malformed comparison\n\n**Acceptance criteria.**\n- the page matches\n${shape}\n- it runs\n  CHECK: true\n`,
      )
      git(dir, 'add', '.')
      git(dir, 'commit', '-q', '-m', 'shape epic')
      const failed = runFail(dir, 'check', 'S-1', '--json')
      assert.ok(failed, `${JSON.stringify(shape)} passed the gate`)
      const out = JSON.parse(failed.stdout)
      assert.equal(out.problems.length, 1, `${JSON.stringify(shape)}: ${JSON.stringify(out.problems)}`)
      assert.equal(out.allPassed, false)
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  }
})

test('doctor flags a COMPARE/LANDMARKS near-miss, so a comparison never silently disappears', () => {
  const rows = JSON.parse(runFail(crepo, 'doctor', '--json').stdout)
  const p6 = rows.filter((r) => r.level === 'warn' && r.msg.includes('(P-6)'))
  assert.equal(p6.length, 1, rows.map((r) => r.msg).join('\n'))
  assert.match(p6[0].msg, /will not parse, so it silently never runs/)
  assert.match(p6[0].msg, /CHECK\/EXPECT\/COMPARE\/LANDMARKS/)
  // The malformed comparisons are flagged at the author's door too, not only
  // by the ledger a gate reads.
  assert.ok(rows.some((r) => r.msg.includes('(P-3)') && /no "@ <width>"/.test(r.msg)))
  assert.ok(rows.some((r) => r.msg.includes('(P-5)') && /Design sources/.test(r.msg)))
})

test('check --from validates a COMPARE against the design sources of the same ref', () => {
  // One document, one judgment: a branch that adds a design source to its own
  // copy of the preamble must not be able to anchor a comparison the
  // signed-off document does not declare.
  const original = readFileSync(comparesDoc, 'utf8')
  try {
    writeFileSync(comparesDoc, original.replace('designs/map.html\n', 'designs/map.html, designs/other.html\n'))
    assert.equal(JSON.parse(run(crepo, 'check', 'P-5', '--json')).allPassed, true, 'the working tree accepts its own addition')
    const out = JSON.parse(runFail(crepo, 'check', 'P-5', '--json', '--from', 'HEAD').stdout)
    assert.equal(out.allPassed, false, 'the signed-off document does not declare it')
    assert.match(out.problems[0].why, /"Design sources:" line does not list/)
  } finally {
    writeFileSync(comparesDoc, original)
  }
})

test('doctor flags CHECK/EXPECT near-misses as silently-never-runs', () => {
  // No origin remote in this fixture, so doctor exits 1 on that hard
  // precondition — the near-miss rows still print and are what this asserts.
  const fail = runFail(crepo, 'doctor', '--json')
  const rows = JSON.parse(fail.stdout)
  const k5 = rows.filter((r) => r.level === 'warn' && r.msg.includes('(K-5)'))
  assert.equal(k5.length, 3, rows.map((r) => r.msg).join('\n'))
  assert.ok(k5.some((r) => /will not parse, so it silently never runs/.test(r.msg)))
  assert.ok(k5.some((r) => /no CHECK line above it/.test(r.msg)))
  assert.ok(k5.some((r) => /its own bullet/.test(r.msg)))
})

// The two shapes below parse, run, and still decide nothing — the failure a
// near-miss scan exists to catch, one layer in. Both merged live before
// anything flagged them: FND-2's passed on every tree, FND-6's halted a run
// on correct code.

test('doctor flags a CHECK shape that runs but can never pass: an escaped pipe in a quoted script', () => {
  // No origin remote in this fixture, so doctor exits 1 on that hard
  // precondition — the shape rows still print and are what this asserts.
  const rows = JSON.parse(runFail(crepo, 'doctor', '--json').stdout)
  const k7 = rows.filter((r) => r.level === 'warn' && r.msg.includes('(K-7)'))
  const escaped = k7.filter((r) => /consumes one backslash/.test(r.msg))
  assert.equal(escaped.length, 2, k7.map((r) => r.msg).join('\n'))
  assert.ok(escaped.some((r) => r.msg.includes('MobileSidebar')))
  assert.ok(escaped.some((r) => r.msg.includes('generateBreadcrumbListSchema')))
  // The sentence must say why it can never pass, not merely that it is odd.
  assert.ok(escaped.every((r) => /can never pass/.test(r.msg)))
})

test('doctor flags a CHECK shape that runs but can never pass: grep -r with -c, and leaves a sound single-file count alone', () => {
  const rows = JSON.parse(runFail(crepo, 'doctor', '--json').stdout)
  const k7 = rows.filter((r) => r.level === 'warn' && r.msg.includes('(K-7)'))
  const recursive = k7.filter((r) => /never a bare number/.test(r.msg))
  // -rc, -cr and -r -c are the same mistake spelled three ways.
  assert.equal(recursive.length, 3, k7.map((r) => r.msg).join('\n'))
  assert.ok(recursive.every((r) => /can never pass/.test(r.msg)))
  // GHF-1's `grep -c "Me and the log" <file>` prints a bare count and passed
  // live: the scan must say nothing about it.
  assert.ok(!k7.some((r) => r.msg.includes('Me and the log')), k7.map((r) => r.msg).join('\n'))
})

test('a passing check is not killed by more than 1 MB of output noise', () => {
  // The first live run of the gate halted on a green ticket: a 68/68 jest run
  // printed ~1.2 MB of logs, spawnSync's default 1 MB maxBuffer killed the
  // child with ENOBUFS, and the ledger saw a dead command. The runner now
  // carries a generous named cap; this pins it.
  const original = readFileSync(checksDoc, 'utf8')
  try {
    writeFileSync(
      checksDoc,
      `${original}
## K-6 — noisy but green

**Acceptance criteria.**
- passes underneath two megabytes of logging
  CHECK: node -e "process.stdout.write('x'.repeat(2 * 1024 * 1024) + '\\n'); console.log('noisy-ok 68/68')"
  EXPECT: noisy-ok 68/68
`,
    )
    const out = JSON.parse(run(crepo, 'check', 'K-6', '--json'))
    assert.equal(out.allPassed, true)
    assert.match(out.checks[0].evidence, /noisy-ok 68\/68/)
  } finally {
    writeFileSync(checksDoc, original)
  }
})

test('a criterion whose evidence is a skip is recorded skipped, and a skip does not pass the gate', () => {
  // Measured downstream before it was fixed: console-foundations CF-3 reported
  // `4/4 checks passed` while every evidence line read `↓`. The suite skipped
  // itself for want of DATABASE_URL, vitest exited 0, and the EXPECT string
  // matched the line that said so. Skipped is its own verdict — not passed,
  // because it proves nothing; not failed, because the code is not what is
  // wrong — and it never greens the gate.
  const fail = runFail(crepo, 'check', 'K-8', '--json')
  assert.equal(fail.status, 1, 'a skip exits nonzero like any ungreen gate')
  const out = JSON.parse(fail.stdout)
  assert.equal(out.allPassed, false)
  assert.equal(out.passed, 0)
  assert.equal(out.skipped, 1)
  assert.equal(out.checks[0].status, 'skipped')
  assert.equal(out.checks[0].passed, false)
  assert.match(out.checks[0].evidence, /12 skipped/, 'the deciding line is still the evidence')

  const text = runFail(crepo, 'check', 'K-8').stdout
  assert.match(text, /↓ 1\/1 the tenant-scoping suite passes/, 'the ledger marks it ↓, not ✓ and not ✗')
  assert.match(text, /did not run/, 'and says what a skip means, so nobody debugs working code')
  assert.match(text, /0\/1 checks passed.*1 skipped/s)
})

test('a skip is judged on the deciding line, so a skipped test among passing ones is caught', () => {
  // The criterion names one test. Its neighbours passing is not evidence for
  // it, so the whole-output counts cannot be what decides — the line that
  // carried the EXPECT text is.
  const fail = runFail(crepo, 'check', 'K-9', '--json')
  assert.equal(fail.status, 1)
  const out = JSON.parse(fail.stdout)
  assert.equal(out.checks[0].status, 'skipped')
  assert.match(out.checks[0].evidence, /↓ routes > refuses a foreign tenant/)
})

test('with no EXPECT to point at, a run that reports only skips is skipped too', () => {
  // Exit 0 is the whole evidence here, and a run in which nothing ran is not
  // a run that passed. The recovery works from the refused state: an EXPECT
  // naming a line that proves the run moves the verdict back to the line.
  const fail = runFail(crepo, 'check', 'K-10', '--json')
  assert.equal(fail.status, 1)
  const out = JSON.parse(fail.stdout)
  assert.equal(out.checks[0].status, 'skipped')
  assert.equal(out.skipped, 1)
})

test('a command echo repeating the EXPECT string does not outvote the skip it sits above', () => {
  // The hole the deciding-line rule left: the echo `npm test -- <file>` prints
  // is not skip evidence, so it won the verdict and a suite in which nothing
  // ran greened the gate. A skip on ANY matching line decides now, unless
  // another matching line shows something having run.
  const fail = runFail(crepo, 'check', 'K-12', '--json')
  assert.equal(fail.status, 1)
  const out = JSON.parse(fail.stdout)
  assert.equal(out.checks[0].status, 'skipped')
  assert.match(out.checks[0].evidence, /12 skipped/, 'the skip is the evidence, not the echo')
})

test('a file skipped inside a suite that ran still passes — the run line outvotes the skip line', () => {
  // The other polarity: over-firing costs a halted run on correct code, so a
  // matching line showing a run is what the verdict follows.
  const out = JSON.parse(run(crepo, 'check', 'K-13', '--json'))
  assert.equal(out.allPassed, true)
  assert.equal(out.checks[0].status, 'passed')
  assert.match(out.checks[0].evidence, /12 passed/)
})

test('an EXPECT that matches only the line announcing the run does not green a suite that skipped', () => {
  // K-12 closed the echo's first shape, where the skip line happened to carry
  // the EXPECT text too. When it does not, narrowing the question to the
  // matching lines leaves a verdict with no evidence either way, and "no skip
  // among the matching lines" used to mean pass — the same suite in which
  // nothing ran, green again one step along. The question widens to the whole
  // output exactly when the matching lines decide nothing.
  const fail = runFail(crepo, 'check', 'K-14', '--json')
  assert.equal(fail.status, 1)
  const out = JSON.parse(fail.stdout)
  assert.equal(out.checks[0].status, 'skipped')
  assert.match(out.checks[0].evidence, /1 skipped/, 'the evidence is the skip the output does carry, not the announcement')
})

test('a TAP run is read by its own per-test lines, so a skip beside a pass is not "nothing ran"', () => {
  // TAP producers need print no summary at all, and `ok 1 - <name>` is the
  // only record that test ran. Without it one `# SKIP` decided the whole run,
  // which contradicts the documented TAP coverage and halts a run on working
  // code. `not ok` and an `ok` carrying `# SKIP` are not runs — over-firing
  // the other way would green a suite that did nothing.
  const mixed = JSON.parse(run(crepo, 'check', 'K-15', '--json'))
  assert.equal(mixed.allPassed, true)
  assert.equal(mixed.checks[0].status, 'passed')

  const fail = runFail(crepo, 'check', 'K-16', '--json')
  assert.equal(fail.status, 1)
  assert.equal(JSON.parse(fail.stdout).checks[0].status, 'skipped')
})

test('a run that did happen still passes — skipped neighbours, the word "skipped", node --test counts', () => {
  // The cost of a false skip is a halted run on correct code, so the marker
  // must fire on a runner's skip shape and nothing else.
  const out = JSON.parse(run(crepo, 'check', 'K-11', '--json'))
  assert.equal(out.allPassed, true)
  assert.equal(out.passed, 3)
  assert.equal(out.skipped, 0)
  assert.deepEqual(out.checks.map((c) => c.status), ['passed', 'passed', 'passed'])
})

// ── spend: the recorded token ledger ─────────────────────────────────────────
// A separate repo with one epic whose status log carries every shape the
// log has ever recorded a figure in: the ticket skill's addendum phrases
// (wrapped at the house width), a bare `**Tokens:** unknown`, an entry that
// points at the run record, and a run record with per-ticket key=value groups.

const stmp = realpathSync(mkdtempSync(join(tmpdir(), 'tickets-spend-')))
const sremote = join(stmp, 'remote.git')
const srepo = join(stmp, 'repo')
after(() => rmSync(stmp, { recursive: true, force: true }))
git(stmp, 'init', '--bare', '--initial-branch=main', sremote)
git(stmp, 'init', '--initial-branch=main', srepo)
git(srepo, 'config', 'user.email', 'test@example.com')
git(srepo, 'config', 'user.name', 'Test')
git(srepo, 'config', 'commit.gpgsign', 'false')
mkdirSync(join(srepo, 'epics/sigma'), { recursive: true })
writeFileSync(
  join(srepo, 'epics/sigma/tickets.md'),
  `# Sigma epic — tickets

Delivery: release

## S-1 — attended, figures in the addendum

**Scope.** One.

## S-2 — in-session, unknown

**Scope.** Two.

## S-3 — driver-run, figures in the run record

**Scope.** Three.

## S-4 — nothing recorded yet

**Scope.** Four.

## S-5 — driver-run, record written as prose, repaired by addendum

**Scope.** Five.

## RUN-1 — an ID that starts with the word Run

**Scope.** Six.
`,
)
writeFileSync(
  join(srepo, 'epics/sigma/status.md'),
  `# Sigma epic — status log

### S-1 — attended, figures in the addendum — 2026-08-09 — DONE

**Built:** one.

**Tokens:** observed by the supervisor — see the review addendum

**Owed:** Nothing.

**Addendum — review — 2026-08-09 — sonnet/high:** No findings. Worker tokens (implementation
leg): 12,000; Reviewer tokens: 65,729.

### S-2 — in-session, unknown — 2026-08-09 — DONE

**Built:** two.

**Tokens:** unknown

**Owed:** Nothing.

### S-3 — driver-run, figures in the run record — 2026-08-10 — DONE

**Built:** three.

**Tokens:** recorded in the run record

**Owed:** Nothing.

**Addendum — review — 2026-08-10 — sonnet/high:** Clean. Tokens: recorded in the run record.

### Run — 2026-08-10 — completed

**Driver:** /flow:run, unattended.
**Tokens:** S-3 worker=100,000 reviewer=20000
disposition=5000 re-review=unknown proxies=1500; total=126,500 — summed from the run's transcripts.

**Halted on:** ran to completion.

### S-5 — driver-run, record written as prose, repaired by addendum — 2026-08-12 — DONE

**Built:** five.

**Tokens:** recorded in the run record

**Owed:** Nothing.

**Addendum — tokens — 2026-08-14:** a group appended under the wrong entry
still reaches its own ticket: S-4 disposition=2,500 — and this entry's own
figure stays its own: Worker tokens (implementation leg): 900.

### Run — 2026-08-12 (second run) — halted

**Driver:** /flow:run, unattended.
**Tokens:** harness-observed from the run's own transcripts (output tokens).
Workers: S-4 48,379 · S-5 110,939 = 159,318. Reviewers: S-5 review (fable, xhigh) 21,785.

**Halted on:** something.

**Addendum — tokens — 2026-08-13:** the groups the ledger reads, restated
from the figures above: S-5 worker=110,939 reviewer=21,785 disposition=0
re-review=unknown proxies=800.

### Run — 2026-08-12 (third run) — halted

**Tokens:** harness-observed: worker (sonnet) 12,345 and reviewer (fable) 6,789 — no per-ticket groups, never repaired.

**Halted on:** something else.

### Run 2026-08-12 — halted

**Tokens:** S-4 worker=1 reviewer=1 — under a heading that does not parse.

### Run — 2026-08-15 — halted

**Tokens:** unknown — the meter exposed nothing on
2026-08-15, and this wrapped line is still the Tokens paragraph.

**Halted on:** the session limit, after roughly 128,000 tokens — a figure
outside the Tokens paragraph, which must not read as a recorded one.

### RUN-1 — an ID that starts with the word Run — 2026-08-15 — DONE

**Built:** six.

**Tokens:** unknown

**Owed:** Nothing.

## Retro — 2026-08-11

Tokens mentioned here must not count: worker tokens: 999999.
`,
)
// tau — an epic that has split its run records into runs.md (HARD-4). Its
// status.md carries one record from before the split (which stays there and is
// still read) and one appended after it (the misfile doctor flags), and runs.md
// carries the record written since. Sigma above is the other half of the pair:
// an epic with no runs.md at all, whose records are read from status.md exactly
// as before.
mkdirSync(join(srepo, 'epics/tau'), { recursive: true })
writeFileSync(
  join(srepo, 'epics/tau/tickets.md'),
  `# Tau epic — tickets

Delivery: incremental

## T-1 — recorded in runs.md

**Scope.** One.

## T-2 — recorded before the split, in status.md

**Scope.** Two.

## T-3 — recorded on the split day, in status.md

**Scope.** Three.

## T-4 — recorded after the split, in the wrong file

**Scope.** Four.

## T-5 — misfiled, then repaired into the run log

**Scope.** Five.

## T-6 — a halted run read no meter; the attended finish did

**Scope.** Six.

## T-7 — recorded in both logs, the run record later

**Scope.** Seven.
`,
)
writeFileSync(
  join(srepo, 'epics/tau/status.md'),
  `# Tau epic — status log

### Run — 2026-09-01 — completed

**Driver:** /flow:run, unattended.
**Tokens:** T-2 worker=1,000 reviewer=500 disposition=0 re-review=0 proxies=0; total=1,500.

**Halted on:** ran to completion.

### Run — 2026-09-10 — halted

**Driver:** /flow:run, unattended — written on the split day itself, which a
date cannot order against the first record in the run log.
**Tokens:** T-3 worker=10 reviewer=10 disposition=0 re-review=0 proxies=0; total=20.

**Halted on:** something.

### Run — 2026-09-12 — halted

**Driver:** /flow:run, unattended — appended to the wrong file after the split.
**Tokens:** T-4 worker=20 reviewer=20 disposition=0 re-review=0 proxies=0; total=40.

**Halted on:** something.

### Run — 2026-09-13 — halted

**Driver:** /flow:run, unattended — misfiled here, then appended to runs.md.
**Tokens:** T-5 worker=30 reviewer=30 disposition=0 re-review=0 proxies=0; total=60.

**Halted on:** something.

**Addendum — 2026-09-13:** this record was appended to the run log, where this
epic's run records live; the copy above stays because the log is append-only.

### T-6 — a halted run read no meter; the attended finish did — 2026-09-14 — DONE

**Built:** six.

**Tokens:** observed by the supervisor — see the review addendum

**Owed:** Nothing.

**Addendum — review — 2026-09-14 — sonnet/high:** No findings. Worker tokens
(implementation leg): 40,000; Reviewer tokens: 12,000.

### T-7 — recorded in both logs, the run record later — 2026-09-14 — DONE

**Built:** seven.

**Tokens:** observed by the supervisor — see the review addendum

**Owed:** Nothing.

**Addendum — review — 2026-09-14 — sonnet/high:** Worker tokens
(implementation leg): 5; Reviewer tokens: 5.
`,
)
writeFileSync(
  join(srepo, 'epics/tau/runs.md'),
  `# Tau epic — run log

Append-only record of unattended runs. Tickets: \`epics/tau/tickets.md\`.

### Run — 2026-09-10 — completed

**Driver:** /flow:run, unattended.
**Tokens:** T-1 worker=4,000 reviewer=2,000 disposition=0 re-review=unknown
proxies=100; total=6,100. The halted leg read no meter for T-6:
T-6 worker=unknown reviewer=unknown disposition=0 re-review=0 proxies=0.

**Halted on:** ran to completion.

### Run — 2026-09-13 — halted

**Driver:** /flow:run, unattended — the copy of the record misfiled into
status.md; identical heading, so the misfile is repaired, not re-flagged.
**Tokens:** T-5 worker=30 reviewer=30 disposition=0 re-review=0 proxies=0; total=60.

**Halted on:** something.

### Run — 2026-09-14 — completed

**Driver:** /flow:run, unattended.
**Tokens:** T-7 worker=99 reviewer=5 disposition=0 re-review=0 proxies=0; total=104.

**Halted on:** ran to completion.
`,
)
// upsilon — a runs.md that exists but carries no parseable record: the split
// has happened (the file is there), yet nothing dates it, so the misfile scan
// would silently check nothing.
mkdirSync(join(srepo, 'epics/upsilon'), { recursive: true })
writeFileSync(
  join(srepo, 'epics/upsilon/tickets.md'),
  `# Upsilon epic — tickets

Delivery: incremental

## U-1 — split, but nothing recorded yet

**Scope.** One.
`,
)
writeFileSync(join(srepo, 'epics/upsilon/status.md'), '# Upsilon epic — status log\n')
writeFileSync(
  join(srepo, 'epics/upsilon/runs.md'),
  `# Upsilon epic — run log

Append-only record of unattended runs. Tickets: \`epics/upsilon/tickets.md\`.
`,
)
git(srepo, 'add', '.')
git(srepo, 'commit', '-m', 'sigma epic')
git(srepo, 'remote', 'add', 'origin', sremote)
git(srepo, 'push', '-u', 'origin', 'main')
git(srepo, 'remote', 'set-head', 'origin', 'main')

test('spend derives one ledger from addendum phrases, Tokens lines and run records', () => {
  const out = JSON.parse(run(srepo, 'spend', 'sigma', '--json'))
  assert.equal(out.epics.length, 1)
  const [e] = out.epics
  const byId = Object.fromEntries(e.tickets.map((t) => [t.id, t]))

  // Wrapped addendum phrases, with thousands separators.
  assert.equal(byId['S-1'].worker, 12000)
  assert.equal(byId['S-1'].reviewer, 65729)
  assert.equal(byId['S-1'].total, 77729)
  assert.equal(byId['S-1'].source, 'log')
  assert.deepEqual(byId['S-1'].unknown, [])

  // A bare unknown is unknown, never zero.
  assert.equal(byId['S-2'].total, null)
  assert.deepEqual(byId['S-2'].unknown, ['ticket'])

  // The run record's per-ticket group fills a ticket whose entry only points there.
  assert.equal(byId['S-3'].worker, 100000)
  assert.equal(byId['S-3'].reviewer, 20000)
  assert.equal(byId['S-3'].disposition, 5000)
  assert.equal(byId['S-3'].proxies, 1500)
  assert.equal(byId['S-3']['re-review'], null)
  assert.deepEqual(byId['S-3'].unknown, ['re-review'])
  assert.equal(byId['S-3'].total, 126500)
  assert.equal(byId['S-3'].source, 'run-record')

  // Nothing recorded: reported as such, with the note absent. The prose run
  // record names S-4 with a figure, and the run record under the malformed
  // heading carries an S-4 group — neither is read: prose is not a group, and
  // a heading that does not parse starts no region.
  // …except the labelled group under S-5's entry, which names S-4 and so
  // reaches it wherever it sits; S-5's own bare phrase stays S-5's.
  assert.equal(byId['S-4'].disposition, 2500)
  assert.equal(byId['S-4'].total, 2500)
  assert.equal(byId['S-4'].source, 'run-record')
  assert.equal(byId['S-5'].worker, 110939)

  // The repair path: a record written as prose, restated as groups in a
  // dated addendum beneath it, under a heading with a same-day qualifier.
  assert.equal(byId['S-5'].worker, 110939)
  assert.equal(byId['S-5'].reviewer, 21785)
  assert.equal(byId['S-5'].disposition, 0)
  assert.equal(byId['S-5'].proxies, 800)
  assert.deepEqual(byId['S-5'].unknown, ['re-review'])
  assert.equal(byId['S-5'].source, 'run-record')

  // Epic totals sum only known figures; the retro section never counts.
  assert.equal(e.totals.worker, 222939)
  assert.equal(e.totals.total, 340253)
  assert.equal(e.unknownTickets, 4)
  assert.deepEqual(byId['RUN-1'].unknown, ['ticket'])
})

test('doctor flags a run record the ledger cannot read, and the run heading that almost parses', () => {
  // The first live epics wrote every run record's Tokens line as prose, and
  // spend reported "no figure recorded" for every run ticket — the same
  // silence as a run nobody measured. The flagged state must be repairable
  // by the advertised recovery (a dated addendum with groups), which the
  // S-5 record above proves: it is repaired, so it is not flagged.
  const rows = JSON.parse(run(srepo, 'doctor', '--json'))
  const tokens = rows.filter((r) => r.level === 'warn' && /Tokens line carries figures but no machine-shaped group/.test(r.msg))
  assert.equal(tokens.length, 1, rows.map((r) => r.msg).join('\n'))
  assert.match(tokens[0].msg, /^sigma\/status\.md:\d+ — /)
  assert.match(tokens[0].msg, /### Run — 2026-08-12 \(third run\) — halted$/)
  assert.match(tokens[0].msg, /dated addendum beneath the record/)
  const heading = rows.filter((r) => r.level === 'warn' && /run heading will not parse/.test(r.msg))
  assert.equal(heading.length, 1, rows.map((r) => r.msg).join('\n'))
  assert.match(heading[0].msg, /### Run 2026-08-12 — halted$/)
  // Review fixes: a ticket entry whose ID starts with "Run" is a status
  // heading, never a near-miss run heading; and a run record whose Tokens
  // paragraph says unknown is not flagged because a later sentence in the
  // same record mentions a number.
  assert.ok(!rows.some((r) => /RUN-1/.test(r.msg)), rows.map((r) => r.msg).join('\n'))
  assert.ok(!rows.some((r) => /2026-08-15 — halted/.test(r.msg)), rows.map((r) => r.msg).join('\n'))
})

test('spend reads a run record from runs.md, and still reads the records that predate the split from status.md', () => {
  const out = JSON.parse(run(srepo, 'spend', 'tau', '--json'))
  const byId = Object.fromEntries(out.epics[0].tickets.map((t) => [t.id, t]))

  // The record in runs.md is read like any other.
  assert.equal(byId['T-1'].worker, 4000)
  assert.equal(byId['T-1'].reviewer, 2000)
  assert.equal(byId['T-1'].proxies, 100)
  assert.deepEqual(byId['T-1'].unknown, ['re-review'])
  assert.equal(byId['T-1'].source, 'run-record')

  // Migrating the older records is forbidden (append-only), so the split moved
  // where a record is written, never where an old one can be found.
  assert.equal(byId['T-2'].worker, 1000)
  assert.equal(byId['T-2'].total, 1500)
  assert.equal(byId['T-2'].source, 'run-record')

  // Even the misfiled record's figures are read — the flag below is about the
  // conflicting file tail, not about a ledger that lost anything.
  assert.equal(byId['T-3'].worker, 10)
  assert.equal(byId['T-4'].worker, 20)
  assert.equal(out.epics[0].totals.total, 59824)
})

test('doctor flags a run record appended to status.md after the split to runs.md, and never one that predates it', () => {
  const rows = JSON.parse(run(srepo, 'doctor', '--json'))
  const misfiled = rows.filter((r) => r.level === 'warn' && /run records live in runs\.md/.test(r.msg))
  assert.equal(misfiled.length, 1, rows.map((r) => r.msg).join('\n'))
  assert.match(misfiled[0].msg, /^tau\/status\.md:\d+ — /)
  assert.match(misfiled[0].msg, /### Run — 2026-09-12 — halted$/)
  // The advertised recovery has to work in the flagged state: the record is
  // already committed in an append-only log, so the repair is appending, never
  // deleting.
  assert.match(misfiled[0].msg, /appending the record to runs\.md/)
  assert.match(misfiled[0].msg, /never by deleting it/)
  // Date-scoped, and strictly: the record from before the split is left alone
  // because moving it is exactly what append-only forbids, and the one written
  // on the split day itself may well predate the first record in the run log —
  // a date carries no time to order them by.
  assert.ok(!rows.some((r) => /2026-09-01/.test(r.msg)), rows.map((r) => r.msg).join('\n'))
  assert.ok(!rows.some((r) => /### Run — 2026-09-10 — halted/.test(r.msg)), rows.map((r) => r.msg).join('\n'))
  // A record already repaired — appended to the run log, its committed copy
  // left where it is — is not re-flagged, or the warning could never clear.
  assert.ok(!rows.some((r) => /### Run — 2026-09-13 — halted/.test(r.msg)), rows.map((r) => r.msg).join('\n'))
  // And an epic with no runs.md at all is not nagged about one.
  assert.ok(!rows.some((r) => /^sigma\/.*runs\.md/.test(r.msg)), rows.map((r) => r.msg).join('\n'))
})

test('an unknown in one log never erases a known figure in the other; between two known figures the run log wins', () => {
  // The executed case from HARD-4's review: a halted run recorded no meter
  // reading for T-6, the ticket was then finished attended and its own entry
  // carries the figures. Reading the two files in sequence used to let the
  // later file's `unknown` delete the earlier file's number, so the ledger
  // reported the ticket as unmeasured and its total as zero. `unknown` is the
  // absence of an observation, not a correction.
  const out = JSON.parse(run(srepo, 'spend', 'tau', '--json'))
  const byId = Object.fromEntries(out.epics[0].tickets.map((t) => [t.id, t]))
  assert.equal(byId['T-6'].worker, 40000)
  assert.equal(byId['T-6'].reviewer, 12000)
  assert.equal(byId['T-6'].total, 52000)
  assert.deepEqual(byId['T-6'].unknown, [])

  // Two known figures for one ticket and role: the run log is read last and
  // wins, which is why a correction to a run record's figures belongs there.
  assert.equal(byId['T-7'].worker, 99)
  assert.equal(byId['T-7'].source, 'run-record')
})

test('doctor says so when the run log exists but carries no parseable record, instead of checking nothing', () => {
  // With no record in it, nothing dates the split, so the misfile scan cannot
  // fire at all — a scan that silently checks nothing is the failure this
  // whole class of near-miss warnings exists to stop.
  const rows = JSON.parse(run(srepo, 'doctor', '--json'))
  const empty = rows.filter((r) => r.level === 'warn' && /carries no parseable run record/.test(r.msg))
  assert.equal(empty.length, 1, rows.map((r) => r.msg).join('\n'))
  assert.match(empty[0].msg, /^upsilon\/runs\.md /)
  assert.match(empty[0].msg, /### Run — YYYY-MM-DD — completed\|halted/)
  assert.match(empty[0].msg, /dated addendum beneath it, never an edit/)
})

test('find --json exposes runsDoc, whether or not the epic has split its runs.md out yet', () => {
  const split = JSON.parse(run(srepo, 'find', 'T-1', '--json'))
  assert.equal(split.runsDoc, join(srepo, 'epics/tau/runs.md'))
  assert.equal(split.runsDocExists, true)

  // Absent, the path is still absolute and still given — the run skill creates
  // the file with its preamble on the first record, and no caller has to build
  // a path by hand to find out.
  const notSplit = JSON.parse(run(srepo, 'find', 'S-1', '--json'))
  assert.equal(notSplit.runsDoc, join(srepo, 'epics/sigma/runs.md'))
  assert.equal(notSplit.runsDocExists, false)
})

test('spend text output names the source and never prints an unknown as a number', () => {
  const out = run(srepo, 'spend', 'sigma')
  assert.match(out, /S-1\s+worker 12,000\s+reviewer 65,729\s+total 77,729\s+\(log\)/)
  assert.match(out, /S-2\s+no figure recorded/)
  assert.match(out, /S-3 .*re-review \?/)
  assert.match(out, /S-4\s+disposition 2,500\s+total 2,500\s+\(run-record\)/)
  assert.match(out, /S-5 .*re-review \?/)
  assert.match(out, /recorded 340,253 tokens · 4 with unknown or missing figures/)
  assert.doesNotMatch(out, /999,?999/)
})

test('spend on an unknown epic refuses like the board does', () => {
  const r = runFail(srepo, 'spend', 'nope', '--json')
  assert.ok(r && r.status !== 0)
})

// ── doctor: the codex runner probe ─────────────────────────────────────────

// doctor exits 1 on any fail row, so read its JSON off either outcome.
const doctorWith = (env, cwd = repo) => {
  try {
    return JSON.parse(execFileSync(process.execPath, [SCRIPT, 'doctor', '--json'], { cwd, encoding: 'utf8', env: { ...ENV, ...env }, stdio: ['ignore', 'pipe', 'pipe'] }))
  } catch (e) {
    return JSON.parse(String(e.stdout))
  }
}
// A PATH with git and nothing else — no codex, real or fake — for the
// not-installed case; the developer's own PATH may well carry a real codex.
const gitOnlyBin = join(tmp, 'git-only-bin')
mkdirSync(gitOnlyBin)
writeFileSync(join(gitOnlyBin, 'git'), `#!/bin/sh\nexec "${execFileSync('which', ['git'], { encoding: 'utf8' }).trim()}" "$@"\n`)
chmodSync(join(gitOnlyBin, 'git'), 0o755)

test('doctor probes the codex runner when an epic declares it: the binary and the sign-in', () => {
  const rows = doctorWith({})
  assert.ok(rows.some((r) => r.level === 'ok' && r.msg === 'codex runner available: fake-codex 0.0.0'), rows.map((r) => r.msg).join('\n'))
  assert.ok(rows.some((r) => r.level === 'ok' && r.msg.startsWith('codex signed in (')))
})

test('doctor fails when the declared codex runner is not installed — a run would halt at ticket one', () => {
  const rows = doctorWith({ PATH: gitOnlyBin })
  const fail = rows.find((r) => r.level === 'fail' && /Worker runner: codex is declared but `codex --version` could not run \(ENOENT\)/.test(r.msg))
  assert.ok(fail, rows.map((r) => r.msg).join('\n'))
  assert.match(fail.msg, /npm install -g @openai\/codex/)
})

test('doctor fails when codex is installed but not signed in, and names both ways to sign in', () => {
  const rows = doctorWith({ CODEX_HOME: join(tmp, 'empty-home') })
  const fail = rows.find((r) => r.level === 'fail' && /codex is not signed in/.test(r.msg))
  assert.ok(fail, rows.map((r) => r.msg).join('\n'))
  assert.match(fail.msg, /codex login/)
  assert.match(fail.msg, /--with-api-key/)
  // An API key in the environment is the other accepted credential.
  const keyed = doctorWith({ CODEX_HOME: join(tmp, 'empty-home'), OPENAI_API_KEY: 'sk-test' })
  assert.ok(keyed.some((r) => r.level === 'ok' && /OPENAI_API_KEY is set/.test(r.msg)))
  assert.ok(!keyed.some((r) => /not signed in/.test(r.msg)))
})

test('doctor says nothing about codex when no epic declares the runner', () => {
  const rows = doctorWith({}, crepo)
  assert.ok(!rows.some((r) => /codex/.test(r.msg)), rows.map((r) => r.msg).join('\n'))
})

// ── RETRO-3: unticketed commits on an epic branch ────────────────────────────
// weekendgoals' redesign-city shipped ten commits no document mentions — the
// fix for a production crash loop among them. Derived from git alone: what is
// on the epic branch, not on the default branch, is not a merge, touches
// something outside epics/, and opens with no ticket ID.
const utmp = realpathSync(mkdtempSync(join(tmpdir(), 'tickets-unticketed-')))
const uremote = join(utmp, 'remote.git')
const urepo = join(utmp, 'repo')
after(() => rmSync(utmp, { recursive: true, force: true }))
git(utmp, 'init', '--bare', '--initial-branch=main', uremote)
git(utmp, 'init', '--initial-branch=main', urepo)
git(urepo, 'config', 'user.email', 'test@example.com')
git(urepo, 'config', 'user.name', 'Test')
git(urepo, 'config', 'commit.gpgsign', 'false')
const uwrite = (rel, text) => {
  mkdirSync(dirname(join(urepo, rel)), { recursive: true })
  writeFileSync(join(urepo, rel), text)
}
const ucommit = (subject, ...paths) => {
  git(urepo, 'add', ...paths)
  git(urepo, 'commit', '-q', '-m', subject)
}
for (const [name, id] of [['rho', 'R'], ['tau', 'T']]) {
  uwrite(`epics/${name}/tickets.md`, `# ${name} epic — tickets\n\nDelivery: release\n\n## ${id}-1 — the one ticket\n\n**Scope.** One.\n`)
  uwrite(`epics/${name}/status.md`, `# ${name} epic — status log\n`)
}
uwrite('src/app.js', 'export const a = 1\n')
ucommit('initial', 'epics', 'src/app.js')
git(urepo, 'remote', 'add', 'origin', uremote)
git(urepo, 'push', '-q', '-u', 'origin', 'main')
git(urepo, 'remote', 'set-head', 'origin', 'main')
// rho's epic branch: one ticketed commit, one epics-only commit with no ID,
// one bare code commit, one subjected with the epic's name, and a refresh
// merge from main that itself carries an ID-less commit made ON main.
git(urepo, 'checkout', '-q', '-b', 'epic/rho')
uwrite('src/r1.js', 'export const r1 = 1\n')
ucommit('R-1: the one ticket', 'src/r1.js')
uwrite('epics/rho/status.md', '# rho epic — status log\n\nA plan edit.\n')
ucommit('re-plan the order after the probe', 'epics/rho/status.md')
uwrite('src/env.js', 'import "dotenv/config"\n')
ucommit('move dotenv to dependencies — the prod image prunes dev deps', 'src/env.js')
uwrite('src/app.js', 'export const a = 2\n')
ucommit('rho: release review fixes — the guard no longer fails open', 'src/app.js')
git(urepo, 'checkout', '-q', 'main')
uwrite('src/main-only.js', 'export const m = 1\n')
ucommit('an unrelated change somebody merged to main', 'src/main-only.js')
git(urepo, 'push', '-q', 'origin', 'main')
git(urepo, 'checkout', '-q', 'epic/rho')
git(urepo, 'merge', '-q', '--no-ff', 'main', '-m', 'Merge main into epic/rho')
git(urepo, 'push', '-q', '-u', 'origin', 'epic/rho')
git(urepo, 'checkout', '-q', 'main')
const ulist = (...a) => JSON.parse(run(urepo, 'list', ...a, '--json'))

test('unticketed: a code commit on the epic branch with no ID in its subject is reported, by sha and subject', () => {
  const loose = ulist().unticketed.rho
  assert.ok(Array.isArray(loose), 'the board JSON carries an unticketed map keyed by epic')
  const bare = loose.find((c) => /dotenv/.test(c.subject))
  assert.ok(bare, JSON.stringify(loose))
  assert.match(bare.sha, /^[0-9a-f]{7,}$/)
  assert.equal(bare.epicLevel, false)
})

test('unticketed: a ticketed commit, a merge, a commit from main the refresh brought in, and an epics-only commit are not reported', () => {
  const subjects = ulist().unticketed.rho.map((c) => c.subject)
  assert.deepEqual(subjects.sort(), ['move dotenv to dependencies — the prod image prunes dev deps', 'rho: release review fixes — the guard no longer fails open'])
})

test('unticketed: a commit subjected with the epic name is listed as epic-level, and doctor warns only on the one that names neither', () => {
  const named = ulist().unticketed.rho.find((c) => c.subject.startsWith('rho:'))
  assert.equal(named.epicLevel, true)
  const rows = JSON.parse(run(urepo, 'doctor', '--json'))
  const warn = rows.filter((r) => r.level === 'warn' && /name[s]? no ticket/.test(r.msg))
  assert.equal(warn.length, 1, JSON.stringify(rows.map((r) => r.msg)))
  assert.match(warn[0].msg, /^rho: 1 commit on epic\/rho names no ticket/)
  assert.match(warn[0].msg, /dotenv/)
  assert.doesNotMatch(warn[0].msg, /release review fixes/)
  assert.match(warn[0].msg, /Never rewrite pushed history/)
  // A warn, never a fail: doctor still exits 0 (run() would have thrown).
})

test('unticketed: an epic with no epic branch reports none and breaks nothing', () => {
  const data = ulist()
  assert.equal(data.unticketed.tau, undefined)
  assert.ok(data.tickets.some((t) => t.id === 'T-1'))
})

test('unticketed: the board prints one line under the epic, with how many carry the epic name, and nothing under a clean epic', () => {
  const out = run(urepo, 'list')
  assert.match(out, /2 unticketed commits on epic\/rho \(1 subjected "rho: …"\)/)
  assert.doesNotMatch(out, /unticketed commit[s]? on epic\/tau/)
})

// ── RETRO-4: `owed <epic>` — the release body's Owed section, printed ────────
// One live release pull request said "Nothing owed" against 31 open items: the
// session that opened it was recalling the log, not reading it.
const owedRepo = join(tmp, 'owed-cmd')
git(tmp, 'init', '--initial-branch=main', owedRepo)
for (const [name, id] of [['psi', 'P'], ['chi', 'C']]) {
  mkdirSync(join(owedRepo, `epics/${name}`), { recursive: true })
  writeFileSync(join(owedRepo, `epics/${name}/tickets.md`), `# ${name}\n\nDelivery: release\n\n## ${id}-1 — first\n\n**Scope.** One.\n\n## ${id}-2 — second\n\n**Scope.** Two.\n`)
}
writeFileSync(
  join(owedRepo, 'epics/psi/status.md'),
  `# Psi epic — status log

### P-1 — first — 2026-09-01 — DONE

**Owed:** the full Cypress suite has not run green on the release head.

### P-2 — second — 2026-09-02 — DONE

**Owed:**
- the production cacheability check, deferred to release;
- lint is broken in four workspaces.

**Resolves owed:** P-2.2 — lint fixed in a quick ticket.
`,
)
writeFileSync(join(owedRepo, 'epics/chi/status.md'), '# Chi epic — status log\n\n### C-1 — first — 2026-09-01 — DONE\n\n**Owed:** Nothing.\n')

test('owed command: prints every outstanding item of the epic with the entry that owes it', () => {
  const out = run(owedRepo, 'owed', 'psi')
  assert.match(out, /P-1 \(2026-09-01\): the full Cypress suite has not run green on the release head\./)
  assert.match(out, /P-2\.1 \(2026-09-02\): the production cacheability check, deferred to release/)
  const j = JSON.parse(run(owedRepo, 'owed', 'psi', '--json'))
  assert.equal(j.epic, 'psi')
  assert.equal(j.count, 2)
  assert.deepEqual(j.owed.map((o) => o.id), ['P-1', 'P-2.1'])
})

test('owed command: honours Resolves owed — a discharged item never prints', () => {
  assert.doesNotMatch(run(owedRepo, 'owed', 'psi'), /lint is broken/)
})

test('owed command: an epic that owes nothing says "none outstanding" and exits 0 — a printed zero, not an absent section', () => {
  assert.match(run(owedRepo, 'owed', 'chi'), /none outstanding/)
  assert.deepEqual(JSON.parse(run(owedRepo, 'owed', 'chi', '--json')).owed, [])
})

test('owed command: an unknown or missing epic is refused by naming the known ones', () => {
  const unknown = runFail(owedRepo, 'owed', 'omega')
  assert.equal(unknown.status, 1)
  assert.match(unknown.stderr, /no epic "omega" under epics\/ — known epics: chi, psi|known epics: psi, chi/)
  const missing = runFail(owedRepo, 'owed')
  assert.equal(missing.status, 1)
  assert.match(missing.stderr, /owed needs an epic/)
})

// ── RETRO-5: spend sums review rounds ────────────────────────────────────────
// One live entry (CITY-14) recorded four worker/reviewer pairs, one per review
// round, none labelled — and last-wins, which is right for a correction, read
// 879k of the 4.4M it records. A `round=<n>` label is what tells a round from
// a correction: rounds are summed, and within a round the last figure wins.
const roundsRepo = (name, status, runs = null) => {
  const dir = join(tmp, `rounds-${name}`)
  git(tmp, 'init', '--initial-branch=main', dir)
  mkdirSync(join(dir, 'epics/city'), { recursive: true })
  writeFileSync(join(dir, 'epics/city/tickets.md'), '# City\n\nDelivery: release\n\n## CITY-14 — the map card\n\n**Scope.** One.\n\n## CITY-15 — derbies\n\n**Scope.** Two.\n')
  writeFileSync(join(dir, 'epics/city/status.md'), `# City epic — status log\n\n${status}`)
  if (runs) writeFileSync(join(dir, 'epics/city/runs.md'), `# City epic — run records\n\n${runs}`)
  return dir
}
const spendOf = (dir, id) => JSON.parse(run(dir, 'spend', 'city', '--json')).epics[0].tickets.find((t) => t.id === id)
// These fixtures have no remote, so doctor exits 1 on its own precondition
// rows; the rows it printed are what is read here, whatever the exit code.
const doctorWarns = (dir, re) => {
  const failed = runFail(dir, 'doctor', '--json')
  const rows = JSON.parse(failed ? failed.stdout : run(dir, 'doctor', '--json'))
  return rows.filter((r) => r.level === 'warn' && re.test(r.msg))
}
const CITY14 = '### CITY-14 — the map card — 2026-09-16 — DONE\n\n**Built:** the card.\n\n**Owed:** Nothing.\n\n'

test('spend rounds: four labelled rounds in one entry sum per role — CITY-14 reads 4.4M, not the last pair', () => {
  const dir = roundsRepo('sum', `${CITY14}**Addendum — review — 2026-09-16:** round=1 worker=911,511 reviewer=302,889\n\n**Addendum — review — 2026-09-17:** round=2 worker=804432 reviewer=324269\n\n**Addendum — review — 2026-09-17:** round=3 worker=909377\nreviewer=259927\n\n**Addendum — review — 2026-09-18:** round=4 worker=581236 reviewer=297991\n`)
  const t = spendOf(dir, 'CITY-14')
  assert.equal(t.worker, 911511 + 804432 + 909377 + 581236)
  assert.equal(t.reviewer, 302889 + 324269 + 259927 + 297991)
  assert.equal(t.total, 4391632)
  assert.deepEqual(t.rounds, { worker: 4, reviewer: 4 })
})

test('spend rounds: a round written again overrides that round only — a correction to a round is the round, restated', () => {
  const dir = roundsRepo('restate', `${CITY14}round=1 worker=100 reviewer=10\n\nround=2 worker=200 reviewer=20\n\n**Addendum — correction — 2026-09-19:** round=1 worker=150\n`)
  const t = spendOf(dir, 'CITY-14')
  assert.equal(t.worker, 350)
  assert.equal(t.reviewer, 30)
})

test('spend rounds: unlabelled repeats read exactly as before — the last figure for a role wins', () => {
  const dir = roundsRepo('lastwins', `${CITY14}**Addendum — review — 2026-09-16:** Worker tokens (implementation leg): 911,511; Reviewer tokens: 302,889\n\n**Addendum — correction — 2026-09-17:** Worker tokens (implementation leg): 900,000\n`)
  const t = spendOf(dir, 'CITY-14')
  assert.equal(t.worker, 900000)
  assert.equal(t.reviewer, 302889)
  assert.deepEqual(t.rounds, {})
})

test('spend rounds: unknown inside a round never erases a known figure, and an all-unknown role stays unknown', () => {
  const dir = roundsRepo('unknown', `${CITY14}round=1 worker=100 reviewer=unknown\n\nround=2 worker=unknown reviewer=unknown\n\nround=1 worker=unknown\n`)
  const t = spendOf(dir, 'CITY-14')
  assert.equal(t.worker, 100)
  assert.equal(t.reviewer, null)
  assert.ok(t.unknown.includes('reviewer'))
})

test('spend rounds: a run record whose groups carry round= is summed across records, and is not a doctor near-miss', () => {
  const dir = roundsRepo(
    'runs',
    `${CITY14}**Tokens:** recorded in the run record\n`,
    '### Run — 2026-09-16 — halted\n\n**Tokens:** CITY-14 round=1 worker=911511 reviewer=302889 disposition=50000\n\n### Run — 2026-09-17 (resumed) — halted\n\n**Tokens:** CITY-14 round=2 worker=804432 reviewer=324269 disposition=unknown\n',
  )
  const t = spendOf(dir, 'CITY-14')
  assert.equal(t.worker, 911511 + 804432)
  assert.equal(t.disposition, 50000)
  assert.equal(t.source, 'run-record')
  assert.deepEqual(doctorWarns(dir, /no machine-shaped group/), [])
})

test('repeated figure: four unlabelled pairs with no correction between them draw a doctor warn naming what spend counts and what rounds would total', () => {
  const dir = roundsRepo('warn', `${CITY14}**Addendum — review — 2026-09-16:** worker=911511 reviewer=302889\n\n**Addendum — review — 2026-09-17:** worker=804432 reviewer=324269\n\n**Addendum — review — 2026-09-17:** worker=909377 reviewer=259927\n\n**Addendum — review — 2026-09-18:** worker=581236 reviewer=297991\n`)
  const warns = doctorWarns(dir, /unlabelled (worker|reviewer) figures in one entry/)
  assert.equal(warns.length, 2, JSON.stringify(warns))
  const w = warns.find((r) => / worker figures/.test(r.msg)).msg
  assert.match(w, /\(CITY-14\) — 4 unlabelled worker figures/)
  assert.match(w, /spend counts only the last, 581,236/)
  assert.match(w, /would total 3,206,556/)
  assert.match(w, /round=1 worker=<n>/)
  // And the ledger still reads what it always read — the warn changes no total.
  assert.equal(spendOf(dir, 'CITY-14').worker, 581236)
})

test('repeated figure: a genuine dated correction is silent, and so are labelled rounds', () => {
  const corrected = roundsRepo('quiet', `${CITY14}**Addendum — review — 2026-09-16:** worker=911511\n\n**Addendum — correction — 2026-09-17:** the meter was misread; worker=900000\n`)
  assert.deepEqual(doctorWarns(corrected, /unlabelled \w[\w-]* figures/), [])
  const labelled = roundsRepo('quiet2', `${CITY14}round=1 worker=1 reviewer=1\n\nround=2 worker=2 reviewer=2\n`)
  assert.deepEqual(doctorWarns(labelled, /unlabelled \w[\w-]* figures|round-labelled and unlabelled/), [])
})

// ── RETRO-6: a name-pattern CHECK that expects `# pass 1` is vacuous ─────────
// `node --test --test-name-pattern <p> <file>` prints `# pass 1` when the
// pattern matches nothing: the file itself counts. Found planning the epic
// this ticket belongs to — two of its own draft CHECKs read green that way.
const vacuousRepo = (name, check, expect) => {
  const dir = join(tmp, `vacuous-${name}`)
  git(tmp, 'init', '--initial-branch=main', dir)
  mkdirSync(join(dir, 'epics/nu'), { recursive: true })
  writeFileSync(
    join(dir, 'epics/nu/tickets.md'),
    `# Nu\n\n## N-1 — first\n\n**Scope.** One.\n\n**Acceptance criteria.**\n- the behaviour is pinned by a test\n  CHECK: ${check}\n  EXPECT: ${expect}\n`,
  )
  writeFileSync(join(dir, 'epics/nu/status.md'), '# Nu epic — status log\n')
  return dir
}
const vacuousRows = (dir) => {
  const failed = runFail(dir, 'doctor', '--json')
  return JSON.parse(failed ? failed.stdout : run(dir, 'doctor', '--json')).filter((r) => /proves nothing/.test(r.msg))
}

test('vacuous pass count: a --test-name-pattern CHECK expecting "# pass 1" is a doctor near-miss, with the repair in the message', () => {
  const rows = vacuousRows(vacuousRepo('one', "node --test --test-name-pattern 'staging rule' suite.test.mjs", '# pass 1'))
  assert.equal(rows.length, 1)
  assert.equal(rows[0].level, 'warn')
  assert.match(rows[0].msg, /nu\/tickets\.md \(N-1\)/)
  assert.match(rows[0].msg, /matches NO test/)
  assert.match(rows[0].msg, /# pass 2/)
})

test('vacuous pass count: the same shape fails the check gate as a malformed CHECK does — problems counted, allPassed false', () => {
  const dir = vacuousRepo('gate', "node --test --test-name-pattern 'zz' suite.test.mjs || echo '# pass 1'", '# pass 1')
  const failed = runFail(dir, 'check', 'N-1', '--json')
  const ledger = JSON.parse(failed ? failed.stdout : run(dir, 'check', 'N-1', '--json'))
  assert.equal(ledger.allPassed, false)
  assert.ok(ledger.problems.length >= 1, JSON.stringify(ledger))
})

test('vacuous pass count: "# pass 2", "# pass 12", and a "# pass 1" with no name pattern are not flagged', () => {
  assert.deepEqual(vacuousRows(vacuousRepo('two', "node --test --test-name-pattern 'x' s.test.mjs", '# pass 2')), [])
  assert.deepEqual(vacuousRows(vacuousRepo('twelve', "node --test --test-name-pattern 'x' s.test.mjs", '# pass 12')), [])
  assert.deepEqual(vacuousRows(vacuousRepo('whole', 'node --test one-test-file.test.mjs', '# pass 1')), [])
})
