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
  // (BOARD-3). --json is the find payload plus preamble, owed and body —
  // the whole required reading for a fresh worker, O(epic) not O(history).
  const briefed = JSON.parse(run(repo, 'brief', 'a-2', '--json'))
  const found = JSON.parse(run(repo, 'find', 'a-2', '--json'))
  assert.deepEqual(
    briefed,
    { ...found, preamble: briefed.preamble, owed: briefed.owed, deviations: briefed.deviations, body: briefed.body },
    'the brief payload is the find payload plus preamble, owed, deviations and body',
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
// under one entry; a Decisions paragraph that talks about a deviation in prose
// and must stay prose; a closing line whose LEADING ID list is what closes,
// with another ID cited in its note; and a deviation recorded BELOW that line
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

**Deviations closed:** D-1 — accepted; D-2's paging is a separate decision and
is untouched here; the sticky nav fixed in 9f3a21c; Vadim; 2026-09-03.

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
    d1.deviations.map((d) => [d.entry, d.recorded, d.closed]),
    [
      ['D-1', '2026-09-01', true],
      ['D-1', '2026-09-01', true],
      ['D-1', '2026-09-04', false],
    ],
    'both 09-01 departures are closed by the line beneath them; the 09-04 one, recorded below that line, is not born closed',
  )
  assert.match(d1.deviations[0].text, /hero band above the fold → built without it, because the asset pipeline/,
    'the paragraph runs to the first blank line, wrapped lines joined')
  assert.match(d1.deviations[0].closedBy, /D-1 — accepted;.*9f3a21c; Vadim; 2026-09-03/,
    'the closing line travels with what it closed, wrapped lines joined')
  assert.equal(d1.deviations[2].closedBy, null)
  assert.ok(
    !d1.deviations.some((d) => /subtitle/.test(d.text)),
    'a Decisions paragraph that discusses a deviation in prose is prose, and parses as nothing',
  )

  const d2 = JSON.parse(run(dir, 'deviations', 'D-2', '--json'))
  assert.equal(d2.count, 1)
  assert.equal(d2.open, 1, "only the closing line's LEADING ID list closes — D-2 cited in its note is a citation")
  assert.deepEqual(JSON.parse(run(dir, 'deviations', 'D-3', '--json')).deviations, [],
    'a ticket that recorded none answers with an empty list, exit 0')

  const plain = run(dir, 'deviations', 'D-1')
  assert.match(plain, /3 recorded, 1 not yet closed by a human/)
  assert.match(plain, /closed  D-1 \(2026-09-01\)/)
  assert.match(plain, /open\s+D-1 \(2026-09-04\)/)
  assert.match(plain, /closed by: D-1 — accepted;/)
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
  assert.deepEqual(data.modes.gamma, { delivery: 'release', reviewerModel: 'opus', workerModel: 'sonnet', workerRunner: 'codex', shadowReviewer: 'codex', plannerModel: 'fable', consequencePaths: ['src/auth/**', 'migrations/**'], fixBoundsExclude: ['src/messages/*.json'], ticketBudget: 250000 })
  assert.deepEqual(data.modes.alpha, { delivery: 'incremental', reviewerModel: null, workerModel: null, workerRunner: null, shadowReviewer: null, plannerModel: null, consequencePaths: null, fixBoundsExclude: null, ticketBudget: null })
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
      { delivery: 'incremental', reviewerModel: null, workerModel: null, workerRunner: null, shadowReviewer: null, plannerModel: null, consequencePaths: null, fixBoundsExclude: null, ticketBudget: null },
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
      { delivery: 'incremental', reviewerModel: null, workerModel: null, workerRunner: null, shadowReviewer: null, plannerModel: null, consequencePaths: null, fixBoundsExclude: null, ticketBudget: null },
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
    assert.deepEqual(data.modes.delta, { delivery: 'incremental', reviewerModel: null, workerModel: null, workerRunner: null, shadowReviewer: null, plannerModel: null, consequencePaths: null, fixBoundsExclude: null, ticketBudget: null })
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
    assert.deepEqual(data.modes.shout, { delivery: 'release', reviewerModel: null, workerModel: null, workerRunner: null, shadowReviewer: null, plannerModel: null, consequencePaths: null, fixBoundsExclude: null, ticketBudget: null })
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
      { delivery: 'incremental', reviewerModel: null, workerModel: null, workerRunner: null, shadowReviewer: null, plannerModel: null, consequencePaths: null, fixBoundsExclude: null, ticketBudget: null },
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

test('find --from a ref that cannot be read refuses instead of falling back to the working tree', () => {
  const fail = runFail(crepo, 'find', 'K-1', '--json', '--from', 'refs/no/such/ref')
  assert.equal(fail.status, 1)
  assert.match(fail.stderr, /cannot read epics\/checks\/tickets\.md from ref/)
  const bare = runFail(crepo, 'find', 'K-1', '--from')
  assert.equal(bare.status, 2)
  assert.match(bare.stderr, /--from needs a git ref/)
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
