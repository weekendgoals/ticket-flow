import { test, after, beforeEach } from 'node:test'
import assert from 'node:assert/strict'
import { spawnSync, execFileSync } from 'node:child_process'
import { mkdtempSync, rmSync, writeFileSync, realpathSync, mkdirSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { tmpdir } from 'node:os'
import { fileURLToPath } from 'node:url'
import { installFakeGh } from './tracker/fake-gh.mjs'
import { meterComment } from './meter.mjs'
import { combineMeters, ticketStats, readEpicComments, summarize, pace, overallStats, formatStats, duration } from './stats.mjs'

const FLOW = join(dirname(fileURLToPath(import.meta.url)), 'flow.mjs')
const R = 'repos/{owner}/{repo}'
const directory = realpathSync(mkdtempSync(join(tmpdir(), 'flow-stats-')))
after(() => rmSync(directory, { recursive: true, force: true }))
const fake = installFakeGh(join(directory, 'bin'))
beforeEach(() => fake.clearCalls())
const GIT_IDENTITY = {
  GIT_AUTHOR_NAME: 'Test',
  GIT_AUTHOR_EMAIL: 'test@example.com',
  GIT_COMMITTER_NAME: 'Test',
  GIT_COMMITTER_EMAIL: 'test@example.com',
  GIT_CONFIG_GLOBAL: '/dev/null',
  GIT_CONFIG_NOSYSTEM: '1',
}

function figures(input, output, extra = {}) {
  return { input, output, cacheCreation: 10, cacheReads: 100, peakContext: input + 110, compactions: 0, wallSeconds: 60, ...extra }
}

function meterOf({ workerSeconds = 600, reviewerSeconds = 120, fixesSeconds = null, model = 'claude-opus-5', input = 1000 } = {}) {
  const roles = { worker: { ...figures(input, 200, { wallSeconds: workerSeconds }), models: {} }, reviewer: { ...figures(500, 50, { wallSeconds: reviewerSeconds }), models: {} } }
  if (fixesSeconds !== null) roles.fixes = { ...figures(300, 30, { wallSeconds: fixesSeconds, compactions: 1 }), models: {} }
  const models = { [model]: figures(input, 200), 'claude-fable-5': figures(500, 50) }
  const total = { ...figures(input + 500 + (fixesSeconds === null ? 0 : 300), 250 + (fixesSeconds === null ? 0 : 30)), peakContext: Math.max(input, 500) + 110, compactions: fixesSeconds === null ? 0 : 1, wallSeconds: 900 }
  return { roles, models, total }
}

const comment = (body, createdAt, { author = 'flow-bot', id = 1 } = {}) => ({ id, author, body, createdAt, url: `https://github.com/o/r/issues/2#issuecomment-${id}` })
const rawComment = (body, created_at, { author = 'flow-bot', id = 1, number = 2 } = {}) => ({ id, user: { login: author }, body, created_at, html_url: `https://github.com/o/r/issues/${number}#issuecomment-${id}` })

const started = '<!-- flow:started -->\n**Started** in an unattended run · worker model opus'
const review = (round, important) => `<!-- flow:review round=${round} important=${important} -->\n**Review, round ${round}**\n\n**Important.** ${important ? 'one' : 'None'}`
const acceptance = (passed, seconds = null) => `<!-- flow:acceptance sha=${'a'.repeat(40)} passed=${passed}${seconds === null ? '' : ` seconds=${seconds}`} -->\n**Acceptance ${passed ? 'passed' : 'failed'}**`
const merged = `<!-- flow:merged sha=${'b'.repeat(40)} accepted=${'a'.repeat(40)} -->\n**Done.**`
const stop = (text) => `<!-- flow:needs-human -->\n**This ticket needs a person.** @ana @flow-bot ${text}`

test('combineMeters counts a cost comment posted twice once, and adds up separate runs, the largest context by maximum', () => {
  const first = meterOf({ input: 1000 })
  const second = meterOf({ input: 4000, workerSeconds: 300 })
  const combined = combineMeters([first, first, second])
  assert.equal(combined.runs, 2)
  assert.equal(combined.total.input, first.total.input + second.total.input)
  assert.equal(combined.total.peakContext, 4110)
  assert.equal(combined.roles.worker.wallSeconds, 900)
  assert.equal(combined.models['claude-opus-5'].input, 5000)
  assert.equal(combined.models['claude-opus-5'].peakContext, 4110)
  assert.equal(combineMeters([]), null)
})

test('combineMeters keeps a figure one run did not record unknown, rather than counting it as zero', () => {
  const blind = meterOf()
  blind.total.input = null
  assert.equal(combineMeters([meterOf(), blind]).total.input, null)
})

test('a ticket record: time per step from the cost comment and the step comments, rounds, findings and the reason it stopped', () => {
  const comments = [
    comment(started, '2026-10-14T10:00:00Z', { id: 1 }),
    comment(review(1, 2), '2026-10-14T10:20:00Z', { id: 2 }),
    comment(stop('Two rounds and the export still fails.'), '2026-10-14T10:30:00Z', { id: 3 }),
    comment('<!-- flow:reset -->\n**Reset**', '2026-10-14T10:40:00Z', { id: 4 }),
    comment(review(2, 0), '2026-10-14T11:00:00Z', { id: 5 }),
    comment(acceptance(false, 30), '2026-10-14T11:05:00Z', { id: 6 }),
    comment(acceptance(true, 45), '2026-10-14T11:10:00Z', { id: 7 }),
    comment(merged, '2026-10-14T11:40:00Z', { id: 8 }),
    comment(meterComment({ ticket: 2, sourceCount: 3, meter: meterOf({ fixesSeconds: 240 }) }), '2026-10-14T11:50:00Z', { id: 9 }),
    comment(`> ${review(3, 5)}`, '2026-10-14T11:55:00Z', { id: 10, author: 'someone' }),
  ]
  const record = ticketStats({ ticket: { number: 2, title: 'Export', state: 'done', tier: 'hard' }, comments, delivery: 'release' })
  assert.deepEqual(record.steps, { worker: 600, review: 120, fixes: 240, acceptance: 75, delivery: 1800, whole: 6000 })
  assert.equal(record.reviewRounds, 2)
  assert.equal(record.importantFindings, 2)
  assert.equal(record.acceptanceRuns, 2)
  assert.equal(record.failedAcceptances, 1)
  assert.equal(record.resets, 1)
  assert.equal(record.compactions, 1)
  assert.deepEqual(record.stops, [{ at: '2026-10-14T10:30:00Z', author: 'flow-bot', url: 'https://github.com/o/r/issues/2#issuecomment-3', reason: 'Two rounds and the export still fails.' }])
  assert.equal(record.rework, null, 'no git was read, so rework is unknown, not zero')
  assert.equal(record.escapes, null)
})

test('a ticket with no cost comment reads unknown for every figure only that comment carries', () => {
  const comments = [comment(started, '2026-10-14T10:00:00Z'), comment(review(1, 0), '2026-10-14T10:20:00Z'), comment(acceptance(true), '2026-10-14T10:25:00Z'), comment(merged, '2026-10-14T10:30:00Z')]
  const record = ticketStats({ ticket: { number: 3, title: 'File', state: 'done', tier: 'easy' }, comments, subjects: [], defaultSubjects: [] })
  assert.equal(record.metered, false)
  assert.deepEqual(record.steps, { worker: null, review: null, fixes: null, acceptance: null, delivery: 300, whole: 1800 })
  assert.deepEqual(record.tokens, { input: null, output: null, cacheCreation: null, cacheReads: null })
  assert.equal(record.peakContext, null)
  assert.equal(record.compactions, null)
  assert.equal(record.rework, 0)
  const text = formatStats(overallStats([{ number: 1, title: 'Trip export', delivery: 'release', parallel: 1, releasePullRequest: null, serialWaves: [], runStops: [], tickets: [record], totals: summarize([record]) }]))
  const row = text.split('\n').find((line) => line.startsWith('#3 '))
  assert.match(row, /^#3\s+done\s+unknown\s+unknown\s+unknown\s+unknown\s+5m\s+30m\s+unknown\s+unknown\s+unknown\s+unknown\s+unknown\s+unknown/)
  assert.match(text, /No ticket has a cost comment, so tokens per model are unknown\./)
  assert.deepEqual([record.roleModels, record.effort], [{ worker: null, reviewer: null, fixes: null }, { worker: null, reviewer: null, fixes: null }])
  assert.match(text, /^- #3 models: worker unknown, reviewer unknown$/m)
})

test('models and effort per role come from the cost comments, two comments for one ticket union their sets, and the line names each role', () => {
  const run = (workerEffort, reviewerEffort) => {
    const meter = meterOf()
    meter.roles.worker.models = { 'claude-opus-5-5': figures(1000, 200) }
    meter.roles.worker.effort = workerEffort
    meter.roles.reviewer.models = { 'claude-fable-5-1': figures(500, 50), unknown: figures(1, 1) }
    meter.roles.reviewer.effort = reviewerEffort
    return meter
  }
  const first = run(['high'], null)
  const second = run(['medium', 'nope | <b>'], null)
  second.roles.worker.models['claude-sonnet-5'] = figures(1, 1)
  const combined = combineMeters([first, second])
  assert.deepEqual(combined.roles.worker.effort, ['high', 'medium'], 'unioned, sorted, and a value that is not a plain word is dropped')
  assert.deepEqual(combined.roles.worker.modelNames, ['claude-opus-5-5', 'claude-sonnet-5'])
  assert.equal(combined.roles.reviewer.effort, null)
  const comments = [comment(meterComment({ ticket: 2, sourceCount: 2, meter: run(['high'], ['high']) }), '2026-10-14T11:50:00Z', { id: 9 })]
  const record = ticketStats({ ticket: { number: 2, title: 'Export', state: 'done', tier: 'hard' }, comments })
  assert.deepEqual(record.roleModels, { worker: ['claude-opus-5-5'], reviewer: ['claude-fable-5-1'], fixes: null }, 'usage with no model name is not a model')
  assert.deepEqual(record.effort, { worker: ['high'], reviewer: ['high'], fixes: null })
  assert.deepEqual(Object.keys(record.models), ['claude-opus-5', 'claude-fable-5'], 'the per-model figures stay as they were')
  const halfKnown = ticketStats({ ticket: { number: 4, title: 'Half', state: 'done', tier: 'easy' }, comments: [comment(meterComment({ ticket: 4, sourceCount: 1, meter: run(['low', 'high'], null) }), '2026-10-14T11:50:00Z')] })
  const epic = { number: 1, title: 'Trip export', delivery: 'release', parallel: 1, releasePullRequest: null, serialWaves: [], runStops: [], tickets: [record, halfKnown], totals: summarize([record, halfKnown]) }
  const text = formatStats(overallStats([epic]))
  assert.match(text, /^- #2 models: worker claude-opus-5-5 high, reviewer claude-fable-5-1 high$/m)
  assert.match(text, /^- #4 models: worker claude-opus-5-5 high\/low, reviewer claude-fable-5-1 effort unknown$/m)
})

test('incremental delivery ends at the last pull request comment, since a person merges the pull request', () => {
  const comments = [
    comment(started, '2026-10-14T10:00:00Z'),
    comment(acceptance(true, 5), '2026-10-14T10:30:00Z'),
    comment('**Pull request opened:** https://github.com/o/r/pull/9 (into `main`). A person merges it.', '2026-10-14T10:31:00Z'),
    comment('**Pull request round 1:** two threads fixed, checks pass.', '2026-10-14T11:30:00Z'),
  ]
  const record = ticketStats({ ticket: { number: 4, title: 'Quick', state: 'done', tier: 'easy' }, comments, delivery: 'incremental' })
  assert.equal(record.steps.delivery, 3600)
  assert.equal(record.steps.whole, 5400)
  assert.equal(record.pullRequestRounds, 1)
})

test('the epic\'s comments give the waves that ran one at a time, why, the stopped runs and the release pull request', () => {
  const epic = readEpicComments([
    comment('<!-- flow:local-run -->\n**Wave 1:** #2 on opus, #3 on sonnet, side by side.', '2026-10-14T09:00:00Z', { id: 1 }),
    comment('<!-- flow:local-run -->\n<!-- flow:serial wave=2 tickets=4,5 -->\n**Wave 2 runs one ticket at a time.** The separate working copies could not be set up (#5: setup: npm ci — exited 1).', '2026-10-14T10:00:00Z', { id: 2 }),
    comment('<!-- flow:local-run-end -->\n**Run stopped.** 3 rounds in a row changed nothing.', '2026-10-14T11:00:00Z', { id: 3 }),
    comment('<!-- flow:release-pr number=12 -->\n**Release pull request opened**', '2026-10-14T12:00:00Z', { id: 4 }),
  ])
  assert.deepEqual(epic.serialWaves.map((wave) => [wave.wave, wave.tickets]), [['2', [4, 5]]])
  assert.match(epic.serialWaves[0].reason, /^Wave 2 runs one ticket at a time\. .*npm ci — exited 1/)
  assert.deepEqual(epic.runStops.map((entry) => entry.reason), ['3 rounds in a row changed nothing.'])
  assert.equal(epic.releasePullRequest, 12)
  const record = ticketStats({ ticket: { number: 5, title: 'x', state: 'done', tier: 'hard' }, comments: [], serialWaves: epic.serialWaves })
  assert.equal(record.ranSerially.length, 1)
})

test('epic totals add what is known and say how many tickets it covers; the pace is done tickets per day and the median ticket', () => {
  const timed = (number, start, end, whole, input) => ({
    number,
    state: 'done',
    steps: { worker: whole, review: null, fixes: null, acceptance: null, delivery: null, whole },
    tokens: { input, output: null, cacheCreation: null, cacheReads: null },
    models: {},
    peakContext: input,
    compactions: null,
    reviewRounds: 1,
    importantFindings: number === 2 ? 1 : 0,
    rework: 1,
    escapes: 0,
    stops: [],
    ranSerially: [],
    metered: input !== null,
    startedAt: start,
    endedAt: end,
  })
  const tickets = [timed(2, '2026-10-10T00:00:00Z', '2026-10-10T06:00:00Z', 21600, 100), timed(3, '2026-10-11T00:00:00Z', '2026-10-12T00:00:00Z', 7200, null)]
  const totals = summarize(tickets)
  assert.deepEqual(totals.tokens.input, { value: 100, known: 1, of: 2 })
  assert.deepEqual(totals.steps.whole, { value: 28800, known: 2, of: 2 })
  assert.deepEqual(totals.peakContext, { value: 100, known: 1, of: 2 })
  assert.equal(totals.importantFindings, 1)
  const figures = pace(tickets)
  assert.equal(figures.ticketsPerDay, 1)
  assert.equal(figures.medianTicketSeconds, 14400)
  assert.equal(pace([]).ticketsPerDay, null)
  assert.equal(duration(14400), '4h00m')
  assert.equal(duration(null), 'unknown')
})

function git(cwd, ...args) {
  return execFileSync('git', args, { cwd, encoding: 'utf8', env: { ...process.env, ...GIT_IDENTITY } }).trim()
}

function commit(cwd, subject) {
  writeFileSync(join(cwd, 'log.txt'), `${subject}\n`, { flag: 'a' })
  git(cwd, 'add', 'log.txt')
  git(cwd, 'commit', '-q', '-m', subject)
}

function repository() {
  const root = join(directory, `repo-${Date.now()}-${Math.random().toString(16).slice(2)}`)
  const remote = join(root, 'origin.git')
  const work = join(root, 'work')
  mkdirSync(root)
  git(root, 'init', '-q', '--bare', '-b', 'main', remote)
  git(root, 'clone', '-q', remote, work)
  git(work, 'checkout', '-q', '-b', 'main')
  commit(work, 'start')
  git(work, 'checkout', '-q', '-b', 'epic/trip-export')
  commit(work, '#2: the export button')
  commit(work, '#2: name the button (review fix)')
  commit(work, '#2: test the empty trip (review fix)')
  commit(work, '#3: the export file')
  git(work, 'push', '-q', 'origin', 'epic/trip-export')
  git(work, 'checkout', '-q', 'main')
  git(work, 'merge', '-q', '--no-ff', '-m', 'Merge the release', 'epic/trip-export')
  commit(work, '#9: an empty trip exported nothing (fixes #2)')
  git(work, 'push', '-q', 'origin', 'main')
  return work
}

function issue(number, { title = `issue ${number}`, body = '', labels = [], state = 'open', createdAt = '2026-10-10T00:00:00Z' } = {}) {
  return { number, id: 5000 + number, title, body, state, labels: labels.map((name) => ({ name })), assignees: [], user: { login: 'vadim' }, html_url: `https://github.com/o/r/issues/${number}`, created_at: createdAt }
}

const epicBody = `## Outcome

Travellers can export a trip.

## Settings

Delivery: release
Parallel: 2
Branch: epic/trip-export

## Tickets

- [x] #2 — Export button
- [x] #3 — Export file
`

const ticketBody = '## Scope\n\n- x\n\n## Acceptance criteria\n\n```criteria\n- x\n  CHECK: true\n```\n'

function world({ epics = null, extra = {} } = {}) {
  const epic = issue(1, { title: 'Trip export', body: epicBody, labels: ['flow:epic', 'flow:approved'], state: 'closed' })
  const two = issue(2, { title: 'Export button', body: `Epic: #1\n${ticketBody}`, labels: ['flow:ticket', 'flow:done', 'tier:hard'], state: 'closed' })
  const three = issue(3, { title: 'Export file', body: `Epic: #1\n${ticketBody}`, labels: ['flow:ticket', 'flow:done', 'tier:easy'], state: 'closed' })
  const old = issue(20, { title: 'Old epic', body: epicBody.replace('Parallel: 2', 'Parallel: 1'), labels: ['flow:epic', 'flow:approved'], createdAt: '2026-01-01T00:00:00Z' })
  fake.setFixtures({
    [`GET ${R}`]: { full_name: 'o/r', default_branch: 'main', has_issues: true },
    [`GET ${R}/issues/1`]: epic,
    [`GET ${R}/issues?labels=flow%3Aepic&state=all&per_page=100`]: epics || [old, epic],
    [`GET ${R}/issues/1/sub_issues?per_page=100`]: [two, three],
    [`GET ${R}/issues/20/sub_issues?per_page=100`]: [],
    [`GET ${R}/issues/20/comments?per_page=100`]: [],
    [`GET ${R}/issues/1/comments?per_page=100`]: [
      rawComment('<!-- flow:local-run -->\n<!-- flow:serial wave=1 tickets=2,3 -->\n**Wave 1 runs one ticket at a time.** The separate working copies could not be set up (#3: setup: npm ci — exited 1).', '2026-10-14T09:00:00Z', { number: 1, id: 11 }),
      rawComment('<!-- flow:release-pr number=12 -->\n**Release pull request opened:** https://github.com/o/r/pull/12', '2026-10-14T13:00:00Z', { number: 1, id: 12 }),
    ],
    [`GET ${R}/pulls/12`]: { number: 12, html_url: 'https://github.com/o/r/pull/12', state: 'closed', head: { ref: 'epic/trip-export', sha: 'c' }, base: { ref: 'main' }, merged_at: '2026-10-15T08:00:00Z' },
    [`GET ${R}/issues/2/comments?per_page=100`]: [
      rawComment(started, '2026-10-14T10:00:00Z', { id: 21 }),
      rawComment(review(1, 1), '2026-10-14T10:30:00Z', { id: 22 }),
      rawComment(review(2, 0), '2026-10-14T10:50:00Z', { id: 23 }),
      rawComment(acceptance(true, 20), '2026-10-14T11:00:00Z', { id: 24 }),
      rawComment(merged, '2026-10-14T11:10:00Z', { id: 25 }),
      rawComment('<!-- flow:handoff -->\n**Handoff.**\n\n- the button is named Export trip', '2026-10-14T11:05:00Z', { id: 27 }),
      rawComment(meterComment({ ticket: 2, sourceCount: 2, meter: meterOf({ fixesSeconds: 180 }) }), '2026-10-14T11:20:00Z', { id: 26 }),
    ],
    [`GET ${R}/issues/3/comments?per_page=100`]: [
      rawComment(started, '2026-10-14T11:10:00Z', { id: 31, number: 3 }),
      rawComment(stop('The ticket says CSV; src/export.ts:40 writes JSON.'), '2026-10-14T11:20:00Z', { id: 32, number: 3 }),
      rawComment(review(1, 0), '2026-10-14T12:00:00Z', { id: 33, number: 3 }),
      rawComment(acceptance(true, 10), '2026-10-14T12:10:00Z', { id: 34, number: 3 }),
      rawComment(merged, '2026-10-14T12:20:00Z', { id: 35, number: 3 }),
    ],
    ...extra,
  })
}

function flow(cwd, ...args) {
  const result = spawnSync(process.execPath, [FLOW, ...args], { cwd, encoding: 'utf8', env: { ...process.env, ...GIT_IDENTITY, ...fake.env } })
  return { status: result.status, stdout: result.stdout, stderr: result.stderr }
}

test('stats <epic> --json reads the comments and git: steps, tokens, rounds, rework, escaped defects, stops, waves run one at a time', () => {
  const work = repository()
  world()
  const result = flow(work, 'stats', '1', '--json')
  assert.equal(result.status, 0, result.stderr)
  const stats = JSON.parse(result.stdout)
  assert.equal(stats.epics.length, 1)
  const [epic] = stats.epics
  assert.deepEqual(epic.releasePullRequest, { number: 12, url: 'https://github.com/o/r/pull/12', merged: true, mergedAt: '2026-10-15T08:00:00Z' })
  const [two, three] = epic.tickets
  assert.deepEqual(two.steps, { worker: 600, review: 120, fixes: 180, acceptance: 20, delivery: 600, whole: 4200 })
  assert.equal(two.rework, 2)
  assert.equal(two.escapes, 1)
  assert.deepEqual(two.escapeCommits.map((entry) => entry.subject), ['#9: an empty trip exported nothing (fixes #2)'])
  assert.equal(two.reviewRounds, 2)
  assert.equal(two.importantFindings, 1)
  assert.equal(three.rework, 0)
  assert.equal(three.escapes, 0)
  assert.equal(three.metered, false)
  assert.equal(three.tokens.input, null)
  assert.deepEqual(three.stops.map((entry) => entry.reason), ['The ticket says CSV; src/export.ts:40 writes JSON.'])
  assert.deepEqual(epic.totals.ranSerially, [2, 3])
  assert.deepEqual(epic.totals.tokens.input, { value: two.tokens.input, known: 1, of: 2 })
  assert.deepEqual(epic.totals.rework, { value: 2, known: 2, of: 2 })
  assert.deepEqual([two.handoff, three.handoff, epic.totals.handoffs], [true, false, 1])
  assert.ok(fake.calls().every((call) => call.args[0] === 'api' && !call.args.includes('-X')), 'stats only reads')
})

test('stats prints a readable table with unknown where no comment carries a figure, and names the stop and the serial wave', () => {
  const work = repository()
  world()
  const result = flow(work, 'stats', '1')
  assert.equal(result.status, 0, result.stderr)
  assert.match(result.stdout, /release pull request #12 merged/)
  assert.match(result.stdout, /^#3\s+done\s+unknown\s+unknown\s+unknown\s+10s\s+10m\s+1h10m\s+unknown/m)
  assert.match(result.stdout, /^total\s+2\/2 done\s+10m \(1\/2\)/m)
  assert.match(result.stdout, /- #3 2026-10-14T11:20:00Z: The ticket says CSV/)
  assert.match(result.stdout, /- wave 1: #2, #3: Wave 1 runs one ticket at a time/)
  assert.match(result.stdout, /^Handoffs: 1 of 2 ticket\(s\) left one for the tickets after them\.$/m)
  assert.match(result.stdout, /^Pace: /m)
})

test('stats reads the instruction files\' size from git at the epic\'s first start and at the release merge, and unknown where no commit says', () => {
  const work = repository()
  writeFileSync(join(work, 'CLAUDE.md'), '# Project\n\n- run the tests\n- no comments\n')
  mkdirSync(join(work, 'web'))
  writeFileSync(join(work, 'web', 'AGENTS.md'), '- web rules\n')
  writeFileSync(join(work, 'NOT-CLAUDE.md'), 'ignored\n')
  git(work, 'add', '.')
  git(work, 'commit', '-q', '-m', 'instruction files')
  const base = git(work, 'rev-parse', 'HEAD')
  writeFileSync(join(work, 'CLAUDE.md'), '# Project\n\n- run the tests\n')
  git(work, 'commit', '-q', '-am', 'leaner')
  const mergeCommit = git(work, 'rev-parse', 'HEAD')
  const start = (sha, createdAt, id) => rawComment(`${started}\n · branch \`ticket/2\` from \`epic/trip-export\` at \`${sha.slice(0, 12)}\``, createdAt, { id })
  world({
    extra: {
      [`GET ${R}/issues/2/comments?per_page=100`]: [start(mergeCommit, '2026-10-14T12:00:00Z', 41), start(base, '2026-10-14T10:00:00Z', 42)],
      [`GET ${R}/pulls/12`]: { number: 12, html_url: 'https://github.com/o/r/pull/12', state: 'closed', head: { ref: 'epic/trip-export', sha: 'c' }, base: { ref: 'main' }, merged_at: '2026-10-15T08:00:00Z', merge_commit_sha: mergeCommit },
    },
  })
  const result = flow(work, 'stats', '1', '--json')
  assert.equal(result.status, 0, result.stderr)
  assert.deepEqual(JSON.parse(result.stdout).epics[0].instructionFiles, {
    before: { sha: base, files: 2, lines: 5, bytes: 53 },
    after: { sha: mergeCommit, files: 2, lines: 4, bytes: 39 },
  })
  assert.match(flow(work, 'stats', '1').stdout, new RegExp(`^Instruction files \\(CLAUDE.md, AGENTS.md\\): 5 lines, 53 bytes in 2 file\\(s\\) at the first start \\(${base.slice(0, 12)}\\); 4 lines, 39 bytes in 2 file\\(s\\) at the release merge \\(${mergeCommit.slice(0, 12)}\\)\\.$`, 'm'))
  world({ extra: { [`GET ${R}/issues/2/comments?per_page=100`]: [start('f'.repeat(40), '2026-10-14T10:00:00Z', 43)] } })
  const unknown = flow(work, 'stats', '1', '--json')
  assert.deepEqual(JSON.parse(unknown.stdout).epics[0].instructionFiles, { before: null, after: null }, 'a commit this clone lacks, and a release merge GitHub names no commit for')
  assert.match(flow(work, 'stats', '1').stdout, /^Instruction files \(CLAUDE.md, AGENTS.md\): unknown at the first start; unknown at the release merge\.$/m)
})

test('stats across epics lists each epic and the pace; --since leaves out epics created before it', () => {
  const work = repository()
  world()
  const all = JSON.parse(flow(work, 'stats', '--json').stdout)
  assert.deepEqual(all.epics.map((epic) => epic.number), [1, 20])
  const recent = flow(work, 'stats', '--since', '2026-10-01')
  assert.equal(recent.status, 0, recent.stderr)
  assert.match(recent.stdout, /^#1 Trip export/m)
  assert.doesNotMatch(recent.stdout, /Old epic/)
  assert.match(recent.stdout, /Pace: [\d.]+ ticket\(s\) per day over 2h20m \(2 of 2 done ticket\(s\) timed\); median ticket 1h10m/)
  const bad = flow(work, 'stats', '--since', 'last week')
  assert.equal(bad.status, 2)
  assert.match(bad.stderr, /--since takes a date/)
})

test('outside a clone, rework and escaped defects are unknown and the output says why', () => {
  const outside = join(directory, 'not-a-clone')
  mkdirSync(outside, { recursive: true })
  world()
  const result = flow(outside, 'stats', '1')
  assert.equal(result.status, 0, result.stderr)
  assert.match(result.stdout, /Rework and escaped defects are unknown: this directory is not inside a clone/)
  const stats = JSON.parse(flow(outside, 'stats', '1', '--json').stdout)
  assert.equal(stats.epics[0].tickets[0].rework, null)
  assert.equal(stats.epics[0].tickets[0].escapes, null)
})

test('stats refuses an issue that is not an epic', () => {
  world()
  fake.setFixtures({ [`GET ${R}/issues/2`]: issue(2, { labels: ['flow:ticket'] }) })
  const result = flow(directory, 'stats', '2')
  assert.equal(result.status, 2)
  assert.match(result.stderr, /#2 is not an epic/)
})
