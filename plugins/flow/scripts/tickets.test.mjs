// Tests for tickets.mjs, run with:  node --test plugins/flow/scripts/
//
// Everything the board reports is derived from string parsing of headings,
// commit subjects and branch names — so these tests build a real throwaway git
// repository (with a local bare "remote") and assert the derived states, rather
// than unit-testing parsers against strings that may drift from real usage.

import { test, after } from 'node:test'
import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { mkdtempSync, mkdirSync, writeFileSync, rmSync, realpathSync } from 'node:fs'
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

git(tmp, 'init', '--bare', '--initial-branch=main', remote)
git(tmp, 'init', '--initial-branch=main', repo)
git(repo, 'config', 'user.email', 'test@example.com')
git(repo, 'config', 'user.name', 'Test')
git(repo, 'config', 'commit.gpgsign', 'false')

mkdirSync(join(repo, 'epics/alpha'), { recursive: true })
writeFileSync(
  join(repo, 'epics/alpha/tickets.md'),
  `# Alpha epic — tickets

Release mode: serial

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

### A-2 — persist the results — 2026-08-01 — DONE

**Built:** persistence.

### A-3 — handle the error path — DONE

Malformed on purpose: no date, so this heading must not parse.
`,
)

// gamma: integration + autonomous, with a prose-decorated Release mode line —
// the tolerant-parse case, and the fixture for run-mode exposure. Its
// Reviewer model line is prose-decorated too: the value is the first word
// after the colon, the rest is commentary.
mkdirSync(join(repo, 'epics/gamma'), { recursive: true })
writeFileSync(
  join(repo, 'epics/gamma/tickets.md'),
  `# Gamma epic — tickets

Release mode: integration — these tickets share a schema change and cannot ship alone.

Run mode: autonomous

Reviewer model: opus — review is where capability pays.

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
  // (BOARD-3). --json is the find payload plus a body field.
  const briefed = JSON.parse(run(repo, 'brief', 'a-2', '--json'))
  const found = JSON.parse(run(repo, 'find', 'a-2', '--json'))
  assert.deepEqual(briefed, { ...found, body: briefed.body }, 'the brief payload is the find payload plus body')
  assert.match(briefed.body, /\*\*Scope\.\*\* Persistence\./, 'the body carries the section content')

  const out = run(repo, 'brief', 'A-2')
  assert.match(out, /A-2 — persist the results/)
  assert.match(out, /state done/, 'the derived state is reported')
  assert.match(out, /\*\*Scope\.\*\* Persistence\./)
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

test('mode lines parse tolerantly and expose in find and list', () => {
  const g = JSON.parse(run(repo, 'find', 'G-1', '--json'))
  assert.equal(g.releaseMode, 'integration', 'prose after the value must not break the parse')
  assert.equal(g.runMode, 'autonomous')

  const a = JSON.parse(run(repo, 'find', 'A-2', '--json'))
  assert.equal(a.releaseMode, 'serial')
  assert.equal(a.runMode, null)

  const data = JSON.parse(run(repo, 'list', '--json'))
  assert.deepEqual(data.modes.gamma, { releaseMode: 'integration', runMode: 'autonomous', reviewerModel: 'opus' })
  assert.deepEqual(data.modes.alpha, { releaseMode: 'serial', runMode: null, reviewerModel: null })
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

test('an epic with no mode lines defaults to serial, attended', () => {
  mkdirSync(join(repo, 'epics/delta'), { recursive: true })
  writeFileSync(join(repo, 'epics/delta/tickets.md'), '# Delta\n\n## D-1 — bare epic\n\n**Scope.** Bare.\n')
  try {
    const data = JSON.parse(run(repo, 'list', '--json'))
    assert.deepEqual(data.modes.delta, { releaseMode: 'serial', runMode: null, reviewerModel: null })
  } finally {
    rmSync(join(repo, 'epics/delta'), { recursive: true, force: true })
  }
})

test('autonomous + serial is refused by find and failed by doctor', () => {
  mkdirSync(join(repo, 'epics/rogue'), { recursive: true })
  writeFileSync(
    join(repo, 'epics/rogue/tickets.md'),
    '# Rogue\n\nRelease mode: serial\n\nRun mode: autonomous\n\n## R-1 — unattended to main\n\n**Scope.** No.\n',
  )
  try {
    const find = runFail(repo, 'find', 'R-1')
    assert.equal(find.status, 1)
    assert.match(find.stderr, /autonomous/)
    assert.match(find.stderr, /integration topology/)

    const doc = runFail(repo, 'doctor', '--json')
    assert.equal(doc.status, 1, 'a mode contradiction is a doctor fail')
    const row = JSON.parse(doc.stdout).find((r) => r.level === 'fail' && /autonomous/.test(r.msg))
    assert.ok(row, 'the exit code must come from the contradiction row specifically')
    assert.match(row.msg, /rogue/)
  } finally {
    rmSync(join(repo, 'epics/rogue'), { recursive: true, force: true })
  }
})

test('mode lines parse case-insensitively', () => {
  mkdirSync(join(repo, 'epics/shout'), { recursive: true })
  writeFileSync(
    join(repo, 'epics/shout/tickets.md'),
    '# Shout\n\nRELEASE MODE: Integration\n\nrun mode: AUTONOMOUS\n\n## S-1 — loud modes\n\n**Scope.** S.\n',
  )
  try {
    const data = JSON.parse(run(repo, 'list', '--json'))
    assert.deepEqual(data.modes.shout, { releaseMode: 'integration', runMode: 'autonomous', reviewerModel: null })
  } finally {
    rmSync(join(repo, 'epics/shout'), { recursive: true, force: true })
  }
})

test('a mode line that almost parses is a doctor warning, not a silent default', () => {
  mkdirSync(join(repo, 'epics/fancy'), { recursive: true })
  writeFileSync(
    join(repo, 'epics/fancy/tickets.md'),
    '# Fancy\n\n**Release mode:** integration\n\nRun  mode: autonomous\n\n**Reviewer model:** haiku\n\n## F-1 — formatted modes\n\n**Scope.** F.\n',
  )
  try {
    const data = JSON.parse(run(repo, 'list', '--json'))
    assert.deepEqual(
      data.modes.fancy,
      { releaseMode: 'serial', runMode: null, reviewerModel: null },
      'all three lines must read as absent',
    )
    const rows = JSON.parse(run(repo, 'doctor', '--json'))
    const warns = rows.filter((r) => r.level === 'warn' && r.msg.includes('fancy/tickets.md'))
    assert.equal(warns.length, 3, 'all three near-miss lines must be flagged')
    for (const w of warns) assert.match(w.msg, /will not parse/)
  } finally {
    rmSync(join(repo, 'epics/fancy'), { recursive: true, force: true })
  }
})

test('a value-less label line reads as absent, never the next paragraph\'s first word', () => {
  // The class Q-7's review verified live: \s* around grab's colon matched
  // newlines, so a bare "Run mode:" adopted the first word of the following
  // paragraph — prose beginning "Autonomous is not wanted here." parsed as
  // runMode: 'autonomous'. Each paragraph below opens with a word the old
  // parse would have scavenged into a live (and here unwanted) value. The
  // last shape — label and colon split across lines, the markdown
  // definition-list look — pins the PRE-colon anchor, which the value-less
  // shapes cannot reach (Q-14's review: reverting that side alone left the
  // suite green).
  mkdirSync(join(repo, 'epics/bare'), { recursive: true })
  writeFileSync(
    join(repo, 'epics/bare/tickets.md'),
    '# Bare\n\nRelease mode:\n\nIntegration would be the wrong topology here.\n\nRun mode:\n\nAutonomous is not wanted here.\n\nReviewer model:\n\nOpus is not being pinned.\n\nRun mode\n: autonomous\n\n## B-1 — value-less labels\n\n**Scope.** B.\n',
  )
  try {
    const data = JSON.parse(run(repo, 'list', '--json'))
    assert.deepEqual(
      data.modes.bare,
      { releaseMode: 'serial', runMode: null, reviewerModel: null },
      'a value-less label must read as absent (serial default / null), never scavenge prose',
    )
    // And doctor's near-miss wording is now true of these lines: they will
    // not parse, they silently default, and the hint names what is missing.
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

test('well-formed mode and Reviewer model lines are doctor-silent', () => {
  // The ACCEPTING branch of doctor's strict preamble parse. gamma carries all
  // three labels well-formed (two prose-decorated) — none may warn. Mutation
  // found by Q-7's review: with the Reviewer model alternative deleted from
  // modeStrict, every correctly configured epic warned and no test noticed.
  const rows = JSON.parse(run(repo, 'doctor', '--json'))
  const gamma = rows.filter((r) => r.msg.includes('gamma/tickets.md'))
  assert.deepEqual(gamma, [], 'no doctor row may point at gamma/tickets.md')
})

test('an unrecognised mode value is a doctor warning, never a silent default', () => {
  mkdirSync(join(repo, 'epics/typo'), { recursive: true })
  writeFileSync(join(repo, 'epics/typo/tickets.md'), '# Typo\n\nRelease mode: sequential\n\n## T-1 — typo mode\n\n**Scope.** T.\n')
  try {
    const rows = JSON.parse(run(repo, 'doctor', '--json'))
    const warn = rows.find((r) => r.msg.includes('sequential'))
    assert.ok(warn, 'doctor must flag the unrecognised value')
    assert.equal(warn.level, 'warn')
    const data = JSON.parse(run(repo, 'list', '--json'))
    assert.equal(data.modes.typo.releaseMode, 'sequential', 'the raw value is exposed, not coerced')
  } finally {
    rmSync(join(repo, 'epics/typo'), { recursive: true, force: true })
  }
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
  // The quick lane never runs /flow:epic — its log is created by ticket
  // step 6 — so a hint naming only "/flow:epic" advertised a recovery
  // unreachable from the state that triggers it (Q-16, found by Q-13's
  // review). gamma has no status.md, so the warning fires on the shared
  // fixture; the full message is pinned so neither door can silently drop.
  const rows = JSON.parse(run(repo, 'doctor', '--json'))
  const warn = rows.find((r) => r.level === 'warn' && r.msg.startsWith('gamma: no status.md'))
  assert.ok(warn, 'gamma has no status.md, so the warning must fire')
  assert.equal(
    warn.msg,
    "gamma: no status.md — created at sign-off by /flow:epic, or by the first ticket's status entry (ticket step 6 — the quick lane's only door); without it DONE/BLOCKED are invisible",
  )
})

test('doctor fails hard when there is no origin remote', () => {
  const bare = join(tmp, 'no-remote')
  git(tmp, 'init', '--initial-branch=main', bare)
  const fail = runFail(bare, 'doctor')
  assert.equal(fail.status, 1)
})
