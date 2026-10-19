import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const scriptPath = join(dirname(fileURLToPath(import.meta.url)), 'run-epic.mjs')
const source = readFileSync(scriptPath, 'utf8').replace(/^export const meta/m, 'const meta')
const AsyncFunction = Object.getPrototypeOf(async function () {}).constructor
const body = new AsyncFunction('agent', 'parallel', 'pipeline', 'log', 'phase', 'args', 'budget', source)
const ARGS = { epic: 1, repoRoot: '/repo', pluginRoot: '/plugins/flow' }

async function drive(reply, args = ARGS) {
  const calls = []
  const logs = []
  const agent = async (prompt, options) => {
    calls.push({ prompt, ...options })
    const answer = await reply(options.label, prompt, options)
    if (answer === undefined) throw new Error(`unplanned agent: ${options.label}`)
    return answer
  }
  const parallel = (thunks) => Promise.all(thunks.map((thunk) => Promise.resolve().then(thunk).catch(() => null)))
  try {
    const out = await body(agent, parallel, null, (message) => logs.push(String(message)), () => {}, args, null)
    return { out, calls, logs, labels: calls.map((call) => call.label) }
  } catch (error) {
    return { out: { threw: error.message }, calls, logs, labels: calls.map((call) => call.label) }
  }
}

function board({ ready = [], inProgress = [], done = [], needsHuman = [], waiting = [], planned = [], parallel = 1, delivery = 'release', approved = true, tickets = null, exitCode = 0 } = {}) {
  const all = tickets || [
    ...ready.map((n) => ({ n, model: n % 2 ? 'opus' : 'sonnet', state: 'ready' })),
    ...inProgress.map((n) => ({ n, model: 'opus', state: 'in-progress' })),
    ...done.map((n) => ({ n, model: 'opus', state: 'done' })),
    ...needsHuman.map((n) => ({ n, model: 'opus', state: 'needs-human' })),
    ...waiting.map((n) => ({ n, model: 'opus', state: 'waiting' })),
  ]
  const next = { epic: 1, approved, ready, waiting: waiting.map((n) => ({ n, blockedBy: [] })), inProgress, done, needsHuman, planned, problems: [], delivery, parallel, branch: 'epic/x', tickets: all.map((entry) => ({ ...entry, title: `ticket ${entry.n}`, tier: entry.model === 'sonnet' ? 'easy' : 'hard', startRequested: false })) }
  return { exitCode, output: JSON.stringify(next, null, 2) }
}

const ok = (output = '{}') => ({ exitCode: 0, output })
const boards = (...sequence) => {
  let index = 0
  return () => sequence[Math.min(index++, sequence.length - 1)]
}

function happyTicket(label) {
  if (/^worker:/.test(label)) return { result: 'review', range: 'aaa111..bbb222', summary: 'the worker says the code is obviously right' }
  if (/^reviewer:/.test(label)) return '## Important\n\nNone.\n\n## Nits\n\nNone.\n\n## Checked and sound\n\nAll of it.'
  if (/^fixes:/.test(label)) return { result: 'delivered', summary: 'merged' }
  return undefined
}

function releaseSteps(label) {
  if (/^check-epic:#1:/.test(label)) return ok('{"allPassed":true}')
  if (/^needs-human:/.test(label)) return ok('')
  if (/^release-pr:/.test(label)) return ok('{"epic":1,"pullRequest":40,"url":"https://github.com/o/r/pull/40"}')
  if (/^pr-loop:/.test(label)) return { result: 'clean', summary: 'nothing open' }
  if (/^post:/.test(label)) return ok('https://github.com/o/r/issues/1#c')
  return undefined
}

test('a serial run builds the ready tickets one per round, each by the skill on its own model, then opens the release pull request', async () => {
  const next = boards(board({ ready: [2] }), board({ ready: [3], done: [2] }), board({ done: [2, 3] }), board({ done: [2, 3] }))
  const run = await drive((label) => (label.startsWith('next:') ? next() : happyTicket(label) ?? releaseSteps(label)))
  assert.equal(run.out.outcome, 'built', JSON.stringify(run.out))
  assert.deepEqual(run.out.releasePullRequest, { number: 40, url: 'https://github.com/o/r/pull/40' })
  assert.deepEqual(run.labels, [
    'next:#1:1',
    'post:#1:wave:1',
    'worker:#2',
    'reviewer:#2',
    'fixes:#2',
    'check-epic:#1:1',
    'next:#1:2',
    'post:#1:wave:2',
    'worker:#3',
    'reviewer:#3',
    'fixes:#3',
    'check-epic:#1:2',
    'next:#1:3',
    'next:#1:final',
    'check-epic:#1:release',
    'release-pr:#1',
    'pr-loop:#1:1',
    'post:#1:end',
  ])
  const worker = run.calls.find((call) => call.label === 'worker:#2')
  assert.equal(worker.model, 'sonnet')
  assert.match(worker.prompt, /skill "flow:ticket" and args "#2 --unattended --until-review"/)
  assert.doesNotMatch(worker.prompt, /--no-merge/)
  assert.equal(run.calls.find((call) => call.label === 'worker:#3').model, 'opus')
  assert.match(run.calls.find((call) => call.label === 'check-epic:#1:1').prompt, /check-epic 1 --tickets 2 --mark/, 'a ticket that merged itself is checked at the epic head too')
  assert.match(run.calls.find((call) => call.label === 'post:#1:wave:1').prompt, /<!-- flow:local-run -->\n\*\*Wave 1:\*\*/)
  const end = run.calls.find((call) => call.label === 'post:#1:end')
  assert.match(end.prompt, /\*\*Run finished: built\.\*\* Release pull request: https:\/\/github\.com\/o\/r\/pull\/40/)
})

test('the driver hires the reviewer: the ticket reviewer agent, on its own model, never told what the worker said', async () => {
  const next = boards(board({ ready: [2] }), board({ done: [2] }))
  const run = await drive((label) => (label.startsWith('next:') ? next() : happyTicket(label) ?? releaseSteps(label)))
  const reviewer = run.calls.find((call) => call.label === 'reviewer:#2')
  assert.equal(reviewer.agentType, 'flow:ticket-reviewer')
  assert.equal(reviewer.model, undefined, 'the agent definition decides the reviewer\'s model')
  assert.match(reviewer.prompt, /Commit range: aaa111\.\.bbb222/)
  assert.doesNotMatch(reviewer.prompt, /obviously right/)
  const fixes = run.calls.find((call) => call.label === 'fixes:#2')
  assert.match(fixes.prompt, /args "#2 --unattended --after-review 1"/)
  assert.match(fixes.prompt, /<review-report>\n## Important\n\nNone\./)
  assert.match(fixes.prompt, /The reviewer read the range aaa111\.\.bbb222; post its report with `--head bbb222`\./)
  assert.equal(fixes.model, 'sonnet')
})

test('fixes after the first review are reviewed once more, over the fix range only, and the second round ends it', async () => {
  const next = boards(board({ ready: [2] }), board({ done: [2] }))
  const run = await drive((label) => {
    if (label.startsWith('next:')) return next()
    if (label === 'fixes:#2') return { result: 'review', range: 'bbb222..ccc333', summary: 'fixed one' }
    if (label === 'fixes:#2:2') return { result: 'delivered', summary: 'merged' }
    return happyTicket(label) ?? releaseSteps(label)
  })
  assert.deepEqual(run.labels.slice(2, 7), ['worker:#2', 'reviewer:#2', 'fixes:#2', 'reviewer:#2:2', 'fixes:#2:2'])
  assert.match(run.calls.find((call) => call.label === 'reviewer:#2:2').prompt, /the fixes made after the first review only[\s\S]*Commit range: bbb222\.\.ccc333/)
  assert.match(run.calls.find((call) => call.label === 'fixes:#2:2').prompt, /--after-review 2/)
  assert.equal(run.out.outcome, 'built')
})

test('Parallel: 2 builds two tickets side by side in their own working copies, and merges them in the order the epic lists them, whichever finished first', async () => {
  const next = boards(board({ ready: [2, 3, 4], parallel: 2 }), board({ done: [2, 3, 4], parallel: 2 }))
  let releaseTwo
  const twoMayFinish = new Promise((resolve) => (releaseTwo = resolve))
  const merges = []
  const run = await drive(async (label) => {
    if (label.startsWith('next:')) return next()
    if (label.startsWith('worktree:#')) return ok(JSON.stringify({ ticket: Number(label.slice(10)), path: `/wt/ticket-${label.slice(10)}`, failure: null }))
    if (label.startsWith('worktree-remove:')) return ok('{}')
    if (label === 'fixes:#2') {
      await twoMayFinish
      return { result: 'accepted', sha: 'a'.repeat(40), summary: 'accepted' }
    }
    if (label === 'fixes:#3') {
      releaseTwo()
      return { result: 'accepted', sha: 'b'.repeat(40), summary: 'accepted' }
    }
    if (label.startsWith('merge:')) {
      merges.push(label)
      return ok('{}')
    }
    if (label === 'check-epic:#1:1') return ok('{"allPassed":true}')
    return happyTicket(label) ?? releaseSteps(label)
  })
  assert.deepEqual(merges, ['merge:#2', 'merge:#3'])
  const worker = run.calls.find((call) => call.label === 'worker:#3')
  assert.match(worker.prompt, /Work only in \/wt\/ticket-3/)
  assert.match(worker.prompt, /args "#3 --unattended --until-review --no-merge"/)
  assert.match(run.calls.find((call) => call.label === 'merge:#2').prompt, /FLOW_UNATTENDED=1 FLOW_JSON=compact node "\/plugins\/flow\/scripts\/flow\.mjs" merge 2\n/, 'the acceptance comment names the commit, never an agent')
  assert.match(run.calls.find((call) => call.label === 'check-epic:#1:1').prompt, /check-epic 1 --tickets 2,3 --mark/)
  assert.ok(run.labels.indexOf('worktree-remove:#2') < run.labels.indexOf('merge:#2'), 'the working copies are gone before the merges, so no ticket branch is still checked out in one')
  assert.ok(!run.labels.includes('worker:#4'), 'Parallel: 2 takes two of the three ready tickets')
  assert.match(run.calls.find((call) => call.label === 'reviewer:#3').prompt, /Repository: \/wt\/ticket-3\./)
})

test('a wave whose working copies cannot be set up falls back to one ticket at a time, says so on the epic, and never stops for it', async () => {
  const next = boards(board({ ready: [2, 3], parallel: 2 }), board({ done: [2, 3], parallel: 2 }))
  const run = await drive((label) => {
    if (label.startsWith('next:')) return next()
    if (label === 'worktree:#2') return ok(JSON.stringify({ path: '/wt/ticket-2', failure: null }))
    if (label === 'worktree:#3') return { exitCode: 1, output: JSON.stringify({ path: '/wt/ticket-3', failure: { step: 'setup: npm ci', detail: 'exited 1\nregistry down' } }) }
    if (label.startsWith('worktree-remove:')) return ok('{}')
    return happyTicket(label) ?? releaseSteps(label)
  })
  assert.equal(run.out.outcome, 'built')
  assert.ok(run.labels.includes('worktree-remove:#2'), 'the copy that was made is removed')
  const fallback = run.calls.find((call) => call.label === 'post:#1:fallback:1')
  assert.match(fallback.prompt, /\*\*Wave 1 runs one ticket at a time\.\*\* .*#3: setup: npm ci — exited 1/)
  assert.match(fallback.prompt, /<!-- flow:local-run -->\n<!-- flow:serial wave=1 tickets=2,3 -->\n\*\*Wave 1/)
  for (const ticket of [2, 3]) {
    const worker = run.calls.find((call) => call.label === `worker:#${ticket}`)
    assert.match(worker.prompt, /The repository is \/repo: run every command there\./)
    assert.doesNotMatch(worker.prompt, /--no-merge/)
  }
  assert.ok(run.labels.indexOf('fixes:#2') < run.labels.indexOf('worker:#3'), 'one at a time')
})

test('a worker that stops without a result is reset once and built again; a second death asks a person, and the run goes on with the rest', async () => {
  const next = boards(
    board({ ready: [2] }),
    board({ ready: [2] }),
    board({ ready: [3], needsHuman: [2] }),
    board({ done: [3], needsHuman: [2] }),
    board({ done: [3], needsHuman: [2] }),
  )
  let resets = 0
  const run = await drive((label) => {
    if (label.startsWith('next:')) return next()
    if (label === 'worker:#2') return null
    if (label === 'reset:#2') return ok(JSON.stringify({ ticket: 2, action: ++resets === 1 ? 'reset' : 'needs-human' }))
    return happyTicket(label) ?? releaseSteps(label)
  })
  assert.equal(run.labels.filter((label) => label === 'worker:#2').length, 2)
  assert.match(run.calls.find((call) => call.label === 'reset:#2').prompt, /reset 2 --once/)
  assert.ok(run.labels.includes('worker:#3'))
  assert.equal(run.out.outcome, 'stopped')
  assert.deepEqual(run.out.needsHuman, [2])
  assert.ok(!run.labels.includes('release-pr:#1'))
  assert.match(run.calls.find((call) => call.label === 'post:#1:end').prompt, /\*\*Run stopped\.\*\* .*These tickets need a person: #2\. Not done: #2\./)
})

test('a ticket the skill stopped is left to its person, and the run carries on', async () => {
  const next = boards(board({ ready: [2, 3] }), board({ ready: [3], needsHuman: [2] }), board({ done: [3], needsHuman: [2] }))
  const run = await drive((label) => {
    if (label.startsWith('next:')) return next()
    if (label === 'worker:#2') return { result: 'stopped', summary: 'the ticket contradicts the code' }
    return happyTicket(label) ?? releaseSteps(label)
  })
  assert.ok(!run.labels.includes('reviewer:#2'))
  assert.ok(!run.labels.includes('reset:#2'))
  assert.ok(run.labels.includes('fixes:#3'))
  assert.equal(run.out.outcome, 'stopped')
})

test('a worker that dies after its ticket passed acceptance gets its ticket merged, from the acceptance comment, not reset', async () => {
  const next = boards(board({ ready: [2] }), board({ done: [2] }))
  const run = await drive((label) => {
    if (label.startsWith('next:')) return next()
    if (label === 'fixes:#2') return null
    if (label === 'reset:#2') return { exitCode: 1, output: JSON.stringify({ ticket: 2, action: 'refused', reason: '#2 passed acceptance at cccccccccccc and is waiting to be merged, not abandoned', accepted: 'c'.repeat(40) }) }
    if (label === 'merge:#2') return ok('{"ticket":2}')
    return happyTicket(label) ?? releaseSteps(label)
  })
  assert.deepEqual(run.labels.slice(2, 8), ['worker:#2', 'reviewer:#2', 'fixes:#2', 'reset:#2', 'merge:#2', 'check-epic:#1:1'])
  assert.match(run.calls.find((call) => call.label === 'merge:#2').prompt, /merge 2\n/)
  assert.equal(run.labels.filter((label) => label === 'reset:#2').length, 1)
  assert.equal(run.out.outcome, 'built')
})

test('an accepted ticket the driver cannot merge goes to a person after one recovery, instead of looping', async () => {
  let reads = 0
  const run = await drive((label) => {
    if (label.startsWith('next:')) return ++reads === 1 ? board({ ready: [2] }) : reads <= 3 ? board({ inProgress: [2] }) : board({ needsHuman: [2] })
    if (label === 'fixes:#2') return { result: 'accepted', sha: 'f'.repeat(40), summary: 'accepted in a serial run' }
    if (label.startsWith('merge:#2')) return { exitCode: 1, output: '' }
    if (label === 'reset:#2') return { exitCode: 1, output: JSON.stringify({ ticket: 2, action: 'refused', reason: 'waiting to be merged', accepted: 'f'.repeat(40) }) }
    return happyTicket(label) ?? releaseSteps(label)
  })
  assert.equal(run.labels.filter((label) => label === 'reset:#2').length, 1)
  assert.equal(run.labels.filter((label) => label === 'needs-human:#2').length, 1)
  assert.ok(run.out.rounds < 6, `ended after ${run.out.rounds} rounds`)
  assert.equal(run.out.outcome, 'stopped')
})

test('a reset that refuses for any other reason hands the ticket to a person with that reason', async () => {
  const next = boards(board({ ready: [2] }), board({ needsHuman: [2] }))
  const run = await drive((label) => {
    if (label.startsWith('next:')) return next()
    if (label === 'worker:#2') return null
    if (label === 'reset:#2') return { exitCode: 1, output: JSON.stringify({ ticket: 2, action: 'refused', reason: '#2 is done; only a ticket left in progress or in review can be reset', accepted: null }) }
    return releaseSteps(label)
  })
  assert.match(run.calls.find((call) => call.label === 'needs-human:#2').prompt, /could not be put back to planned: #2 is done/)
  assert.ok(!run.labels.includes('merge:#2'))
})

test('a ticket started twice by this run with no reset between goes to a person instead of a third worker', async () => {
  const next = boards(board({ ready: [2] }), board({ ready: [2] }), board({ needsHuman: [2] }))
  const run = await drive((label) => {
    if (label.startsWith('next:')) return next()
    if (label === 'worker:#2') return { result: 'stopped', summary: 'start crashed before it could refuse' }
    return releaseSteps(label)
  })
  assert.equal(run.labels.filter((label) => label === 'worker:#2').length, 1)
  assert.match(run.calls.find((call) => call.label === 'needs-human:#2').prompt, /started this ticket before, it is still planned/)
})

test('rounds that change nothing end the run; a long serial epic does not', async () => {
  const serial = Array.from({ length: 45 }, (_, index) => board({ ready: [index + 2], done: [] }))
  let reads = 0
  const long = await drive((label) => {
    if (label.startsWith('next:')) return reads < 45 ? serial[reads++] : board({ done: [2] })
    return happyTicket(label) ?? releaseSteps(label)
  })
  assert.equal(long.out.outcome, 'built', long.out.stopReason)
  assert.equal(long.labels.filter((label) => label.startsWith('worker:')).length, 45)
})

test('a ticket in progress that this run did not start is never touched; with nothing else ready the run stops and says why', async () => {
  const run = await drive((label) => (label.startsWith('next:') ? board({ inProgress: [5], done: [2] }) : releaseSteps(label)))
  assert.ok(!run.labels.some((label) => label.startsWith('reset:') || label.startsWith('worker:')))
  assert.equal(run.out.outcome, 'stopped')
  assert.match(run.out.stopReason, /#5 is in progress outside this run/)
})

test('an epic that is not approved builds nothing', async () => {
  const run = await drive((label) => (label.startsWith('next:') ? board({ approved: false, ready: [], exitCode: 1 }) : releaseSteps(label)))
  assert.ok(!run.labels.some((label) => label.startsWith('worker:')))
  assert.equal(run.out.outcome, 'stopped')
  assert.match(run.out.stopReason, /not approved/)
})

test('a release check that fails at the end opens no release pull request', async () => {
  const run = await drive((label) => {
    if (label.startsWith('next:')) return board({ done: [2, 3] })
    if (label === 'check-epic:#1:release') return { exitCode: 1, output: '{"allPassed":false}' }
    return releaseSteps(label)
  })
  assert.ok(!run.labels.includes('release-pr:#1'))
  assert.equal(run.out.outcome, 'stopped')
  assert.match(run.out.stopReason, /checks at the epic head failed/)
})

test('an incremental epic ends built with no release pull request: each ticket had its own', async () => {
  const run = await drive((label) => (label.startsWith('next:') ? board({ done: [2], delivery: 'incremental' }) : releaseSteps(label)))
  assert.equal(run.out.outcome, 'built')
  assert.ok(!run.labels.some((label) => /^(check-epic|release-pr|pr-loop):/.test(label)))
  assert.match(run.calls.find((call) => call.label === 'post:#1:end').prompt, /Every ticket was delivered by its own pull request/)
})

test('the release pull request loop runs a second round only after a round that pushed fixes', async () => {
  let rounds = 0
  const run = await drive((label) => {
    if (label.startsWith('next:')) return board({ done: [2] })
    if (label.startsWith('pr-loop:')) return { result: ++rounds === 1 ? 'pushed' : 'clean', summary: 'fixed a thread' }
    return releaseSteps(label)
  })
  assert.deepEqual(run.labels.filter((label) => label.startsWith('pr-loop:')), ['pr-loop:#1:1', 'pr-loop:#1:2'])
  const clean = await drive((label) => {
    if (label.startsWith('next:')) return board({ done: [2] })
    if (label.startsWith('pr-loop:')) return { result: 'clean', summary: 'nothing open' }
    return releaseSteps(label)
  })
  assert.deepEqual(clean.labels.filter((label) => label.startsWith('pr-loop:')), ['pr-loop:#1:1'])
  assert.match(run.calls.find((call) => call.label === 'pr-loop:#1:1').prompt, /args "--pr-loop 40 --wait --unattended"/)
})

test('the driver refuses arguments it cannot put in a command safely', async () => {
  for (const bad of [{}, { epic: 'payments', repoRoot: '/r', pluginRoot: '/p' }, { epic: 1, repoRoot: 'relative', pluginRoot: '/p' }, { epic: 1, repoRoot: '/r"; rm -rf /', pluginRoot: '/p' }]) {
    const run = await drive(() => undefined, bad)
    assert.match(run.out.threw, /needs args \{epic/)
    assert.deepEqual(run.calls, [])
  }
  const asText = await drive((label) => (label.startsWith('next:') ? board({ approved: false }) : releaseSteps(label)), JSON.stringify({ epic: '#1', repoRoot: '/repo', pluginRoot: '/p' }))
  assert.equal(asText.out.epic, 1)
})

test('the proxy steps run on the faster model at low effort, and the board is read from GitHub every round', async () => {
  const next = boards(board({ ready: [2] }), board({ done: [2] }))
  const run = await drive((label) => (label.startsWith('next:') ? next() : happyTicket(label) ?? releaseSteps(label)))
  for (const call of run.calls.filter((entry) => /^(next|post|check-epic|release-pr):/.test(entry.label))) assert.deepEqual([call.model, call.effort], ['sonnet', 'low'], call.label)
  assert.match(run.calls[0].prompt, /FLOW_UNATTENDED=1 FLOW_JSON=compact node "\/plugins\/flow\/scripts\/flow\.mjs" next 1/)
  assert.match(run.calls[0].prompt, /It prints one JSON object on its standard output: return that object whole, exactly as printed, however long it is, and leave out anything printed before it\./)
  assert.doesNotMatch(run.calls[0].prompt, /last 4000 characters/)
  assert.match(run.calls.find((call) => call.label === 'post:#1:wave:1').prompt, /the last 4000 characters when it is longer/)
  assert.ok(!run.calls.some((call) => call.model === 'haiku'))
})

test('a board read that returns nothing is tried once more before the run gives up', async () => {
  let reads = 0
  const run = await drive((label) => {
    if (label.startsWith('next:')) return ++reads === 1 ? null : board({ done: [2] })
    return releaseSteps(label)
  })
  assert.deepEqual(run.labels.slice(0, 2), ['next:#1:1', 'next:#1:1:retry'])
  assert.equal(run.out.outcome, 'built')
  const never = await drive((label) => (label.startsWith('next:') ? null : releaseSteps(label)))
  assert.equal(never.out.outcome, 'stopped')
  assert.match(never.out.stopReason, /nobody could read the board/)
})

test('a hand-off to a person that fails counts as a round that changed nothing, and is tried twice at most, so the run ends', async () => {
  let reads = 0
  const run = await drive((label) => {
    if (label.startsWith('next:')) return ++reads === 1 ? board({ ready: [2] }) : board({ inProgress: [2] })
    if (label === 'worker:#2') return null
    if (label.startsWith('reset:#2')) return { exitCode: 1, output: 'gh: HTTP 502' }
    if (label === 'needs-human:#2') return { exitCode: 1, output: 'gh: HTTP 502' }
    return releaseSteps(label)
  })
  assert.equal(run.labels.filter((label) => label === 'needs-human:#2').length, 2)
  assert.ok(reads <= 5, `${reads} board reads`)
  assert.equal(run.out.outcome, 'stopped')
  assert.match(run.out.stopReason, /^#2 stopped in this run and could not be handed to a person \(asking failed twice\); nothing else is ready$/)
})

test('a builder that died before its ticket started has nothing to undo: it is built once more, and a second death goes to a person', async () => {
  const next = boards(board({ ready: [2] }), board({ ready: [2] }), board({ needsHuman: [2] }))
  const run = await drive((label) => {
    if (label.startsWith('next:')) return next()
    if (label === 'worker:#2') return null
    if (label === 'reset:#2') return { exitCode: 1, output: JSON.stringify({ ticket: 2, action: 'refused', state: 'planned', reason: '#2 is planned; only a ticket left in progress or in review can be reset', accepted: null }) }
    return releaseSteps(label)
  })
  assert.equal(run.labels.filter((label) => label === 'worker:#2').length, 2)
  assert.equal(run.labels.filter((label) => label === 'needs-human:#2').length, 1)
  assert.match(run.calls.find((call) => call.label === 'needs-human:#2').prompt, /could not be put back to planned: #2 is planned/)
})

test('three rounds in a row that change nothing end the run, and a ticket already handed to a person is not asked about again', async () => {
  let reads = 0
  const run = await drive((label) => {
    if (label.startsWith('next:')) {
      reads++
      return board({ ready: [2] })
    }
    if (label === 'worker:#2') return { result: 'stopped', summary: 'start crashed before it could refuse' }
    return releaseSteps(label)
  })
  assert.equal(run.labels.filter((label) => label === 'worker:#2').length, 1)
  assert.equal(run.labels.filter((label) => label === 'needs-human:#2').length, 1)
  assert.equal(run.out.outcome, 'stopped')
  assert.equal(run.out.stopReason, '3 rounds in a row changed nothing')
  assert.ok(reads <= 7, `${reads} board reads: five rounds, and two final readings before it says not built`)
})

test('the board is parsed from what flow next printed, never from what the proxy says beside it', async () => {
  const next = boards(board({ ready: [2] }), board({ done: [2] }))
  const run = await drive((label) => {
    if (label.startsWith('next:')) {
      const printed = next()
      return { ...printed, output: `Here is what it printed:\n${printed.output}\nAll done.`, approved: false, ready: [9], tickets: [] }
    }
    return happyTicket(label) ?? releaseSteps(label)
  })
  assert.equal(run.out.outcome, 'built', JSON.stringify(run.out))
  assert.ok(run.labels.includes('worker:#2'))
  assert.ok(!run.labels.includes('worker:#9'))
  assert.ok(!run.labels.some((label) => /:again$/.test(label)), 'one reading that says approved is enough')
})

test('an answer with no board in it is read once more, then the run stops quoting the exit code and the last line', async () => {
  const run = await drive((label) => (label.startsWith('next:') ? { exitCode: 1, output: 'Looking at it now.\ngh: HTTP 502 Bad Gateway' } : releaseSteps(label)))
  assert.deepEqual(run.labels.slice(0, 2), ['next:#1:1', 'next:#1:1:retry'])
  assert.equal(run.out.outcome, 'stopped')
  assert.equal(run.out.stopReason, 'nobody could read the board from GitHub: `flow next` answered twice with no board in its output (exit 1): gh: HTTP 502 Bad Gateway')
  const wrongShape = await drive((label) => (label.startsWith('next:') ? ok(JSON.stringify({ epic: 1, approved: 'yes', ready: ['2'] })) : releaseSteps(label)))
  assert.match(wrongShape.out.stopReason, /^nobody could read the board/, 'JSON of another shape is no board')
  const otherEpic = await drive((label) => (label.startsWith('next:') ? { ...board({ ready: [2] }), output: board({ ready: [2] }).output.replace('"epic": 1', '"epic": 7') } : releaseSteps(label)))
  assert.match(otherEpic.out.stopReason, /^nobody could read the board/, 'another epic\'s board is not this one\'s')
})

test('one reading that says not approved is checked by a second; a second that says approved carries on', async () => {
  const next = boards(board({ approved: false, exitCode: 1 }), board({ ready: [2] }), board({ done: [2] }))
  const run = await drive((label) => (label.startsWith('next:') ? next() : happyTicket(label) ?? releaseSteps(label)))
  assert.deepEqual(run.labels.slice(0, 3), ['next:#1:1', 'next:#1:1:again', 'post:#1:wave:1'])
  assert.equal(run.out.outcome, 'built', JSON.stringify(run.out))
})

test('two readings that agree the epic is not approved stop the run, and the reason says both agreed', async () => {
  const run = await drive((label) => (label.startsWith('next:') ? board({ approved: false, exitCode: 1 }) : releaseSteps(label)))
  assert.deepEqual(run.labels.slice(0, 2), ['next:#1:1', 'next:#1:1:again'])
  assert.equal(run.out.stopReason, 'epic #1 is not approved: two readings of the board from GitHub agreed')
  assert.match(run.calls.find((call) => call.label === 'post:#1:end').prompt, /\*\*Run stopped\.\*\* Epic #1 is not approved: two readings of the board from GitHub agreed\./)
})

test('a final reading that says not built is checked by a second before the run gives up on the release', async () => {
  let reads = 0
  const run = await drive((label) => {
    if (label.startsWith('next:')) {
      reads++
      return reads === 2 ? board({ inProgress: [2] }) : board({ done: [2] })
    }
    return releaseSteps(label)
  })
  assert.deepEqual(run.labels.slice(0, 3), ['next:#1:1', 'next:#1:final', 'next:#1:final:again'])
  assert.equal(run.out.outcome, 'built')
})

test('a release pull request with no answer the first time is asked for once more, and the second answer counts', async () => {
  let asked = 0
  const run = await drive((label) => {
    if (label.startsWith('next:')) return board({ done: [2] })
    if (label.startsWith('release-pr:')) return ++asked === 1 ? ok('the command is still running') : ok('{"epic":1,"pullRequest":40,"url":"https://github.com/o/r/pull/40","existing":true}')
    return releaseSteps(label)
  })
  assert.deepEqual(run.labels.filter((label) => /^(release-pr|pr-loop):/.test(label)), ['release-pr:#1', 'release-pr:#1:again', 'pr-loop:#1:1'])
  assert.equal(run.out.outcome, 'built')
  const never = await drive((label) => {
    if (label.startsWith('next:')) return board({ done: [2] })
    if (label.startsWith('release-pr:')) return { exitCode: 1, output: 'not every ticket is done' }
    return releaseSteps(label)
  })
  assert.equal(never.out.outcome, 'stopped')
  assert.equal(never.out.stopReason, 'the release pull request could not be opened: `flow release-pr` was asked twice and neither answer named one (exit 1): not every ticket is done')
})

test('a wave that falls back says why for each copy, with its time against the budget or the answer nobody could read, and removes every chosen copy', async () => {
  const next = boards(board({ ready: [2, 3, 4], parallel: 3 }), board({ done: [2, 3, 4], parallel: 3 }))
  const run = await drive((label) => {
    if (label.startsWith('next:')) return next()
    if (label === 'worktree:#2') return ok(JSON.stringify({ ticket: 2, path: '/wt/ticket-2', failure: null, elapsedSeconds: 30 }))
    if (label === 'worktree:#3')
      return { exitCode: 1, output: JSON.stringify({ ticket: 3, path: '/wt/ticket-3', failure: { step: 'setup: npm ci', detail: "the setup's 480-second budget ran out\nnpm WARN" }, elapsedSeconds: 481, budgetSeconds: 480 }) }
    if (label.startsWith('worktree:#4')) return { exitCode: -1, output: 'The shell call was killed after two minutes.' }
    if (label.startsWith('worktree-remove:')) return ok('{}')
    return happyTicket(label) ?? releaseSteps(label)
  })
  assert.ok(!run.labels.some((label) => label.endsWith(':retry')), 'a long command is never asked twice: a second copy would run beside the first')
  const fallback = run.calls.find((call) => call.label === 'post:#1:fallback:1').prompt
  assert.match(fallback, /#3: setup: npm ci — the setup's 480-second budget ran out \(after 481s of a 480s budget\)/)
  assert.match(fallback, /#4: no readable answer from `flow worktree` \(exit -1\): The shell call was killed after two minutes\./)
  assert.match(run.logs.find((line) => line.startsWith('wave 1: separate working copies failed')), /#3: setup: npm ci .*after 481s of a 480s budget.*#4: no readable answer/)
  assert.deepEqual(run.labels.filter((label) => label.startsWith('worktree-remove:')).sort(), ['worktree-remove:#2', 'worktree-remove:#3', 'worktree-remove:#4'])
  const prompt = run.calls.find((call) => call.label === 'worktree:#2').prompt
  assert.match(prompt, /Run it once, in the background so no shell timeout cuts it, with its output sent to a file; wait until it has exited, looking every minute or so; then read the file\./)
  assert.match(prompt, /Never run it a second time, because a second copy would run beside the first\./)
  assert.doesNotMatch(prompt, /timeout of/)
  assert.doesNotMatch(run.calls.find((call) => call.label === 'post:#1:wave:1').prompt, /Never run it a second time/)
  assert.equal(run.out.outcome, 'built')
})

test('a board of forty tickets with long titles, printed compact, is read whole; the same board pretty-printed and cut to its last 4,000 characters stops the run, saying so', async () => {
  const tickets = Array.from({ length: 40 }, (_, index) => ({ n: index + 2, title: `A long ticket title that says exactly what this ticket builds, number ${index + 2}`, tier: 'hard', model: 'opus', state: 'done', startRequested: false }))
  const next = { epic: 1, approved: true, ready: [], waiting: [], inProgress: [], done: tickets.map((entry) => entry.n), needsHuman: [], planned: [], problems: [], delivery: 'release', parallel: 1, branch: 'epic/x', tickets }
  const compact = JSON.stringify(next)
  assert.ok(compact.length > 4000, `${compact.length} characters`)
  const whole = await drive((label) => (label.startsWith('next:') ? ok(compact) : releaseSteps(label)))
  assert.equal(whole.out.outcome, 'built', whole.out.stopReason)
  const cut = JSON.stringify(next, null, 2).slice(-4000)
  const truncated = await drive((label) => (label.startsWith('next:') ? ok(cut) : releaseSteps(label)))
  assert.equal(truncated.out.outcome, 'stopped')
  assert.match(truncated.out.stopReason, /^nobody could read the board from GitHub: `flow next` answered twice with no board in its output \(exit 0\): /)
})

test('JSON of the wrong shape is named in the stop reason, not quoted by its last line', async () => {
  const otherEpic = await drive((label) => (label.startsWith('next:') ? ok(board({ ready: [2] }).output.replace('"epic": 1', '"epic": 7')) : releaseSteps(label)))
  assert.match(otherEpic.out.stopReason, /\(exit 0\): its JSON is the board of epic 7, not of #1$/)
  const badList = await drive((label) => (label.startsWith('next:') ? ok(JSON.stringify({ epic: 1, approved: true, ready: ['2'] })) : releaseSteps(label)))
  assert.match(badList.out.stopReason, /its JSON's "ready" is not a list of ticket numbers$/)
})

test('an unreadable release check does not stop the run: release-pr reads the check from GitHub, and its refusal is the stop reason', async () => {
  const unreadable = (label) => (label === 'check-epic:#1:release' ? { exitCode: -1, output: 'The shell call was killed.' } : undefined)
  const opened = await drive((label) => (label.startsWith('next:') ? board({ done: [2] }) : unreadable(label) ?? releaseSteps(label)))
  assert.deepEqual(opened.labels.filter((label) => /^(check-epic|release-pr|pr-loop):/.test(label)), ['check-epic:#1:release', 'release-pr:#1', 'pr-loop:#1:1'])
  assert.equal(opened.out.outcome, 'built')
  assert.ok(opened.logs.some((line) => /release: the epic check's answer could not be read \(no readable answer from `flow check-epic` \(exit -1\): The shell call was killed\.\)/.test(line)))
  const refusal = 'the latest epic check is of `aaaaaaaaaaaa`, not of the head of origin/epic/x (`bbbbbbbbbbbb`); run `flow check-epic 1` first'
  const refused = await drive((label) => {
    if (label.startsWith('next:')) return board({ done: [2] })
    if (label.startsWith('release-pr:')) return { exitCode: 1, output: refusal }
    return unreadable(label) ?? releaseSteps(label)
  })
  assert.deepEqual(refused.labels.filter((label) => /^(check-epic|release-pr):/.test(label)), ['check-epic:#1:release', 'release-pr:#1', 'release-pr:#1:again'])
  assert.equal(refused.out.outcome, 'stopped')
  assert.ok(refused.out.stopReason.endsWith(`(exit 1): ${refusal}`), refused.out.stopReason)
  assert.ok(!refused.labels.some((label) => label.endsWith(':retry')))
  const failed = await drive((label) => (label.startsWith('next:') ? board({ done: [2] }) : label === 'check-epic:#1:release' ? { exitCode: 1, output: '{"allPassed":false}' } : releaseSteps(label)))
  assert.ok(!failed.labels.includes('release-pr:#1'), 'a readable failed check still stops before the release')
})

test('a wave check-epic with no readable answer is logged, never asked twice', async () => {
  const next = boards(board({ ready: [2] }), board({ done: [2] }))
  const run = await drive((label) => {
    if (label.startsWith('next:')) return next()
    if (label === 'check-epic:#1:1') return { exitCode: -1, output: '' }
    return happyTicket(label) ?? releaseSteps(label)
  })
  assert.ok(!run.labels.some((label) => /^(check-epic|worktree):.*:retry$/.test(label)))
  assert.ok(run.logs.some((line) => line === "wave 1: the epic check's answer could not be read (no readable answer from `flow check-epic` (exit -1): (no output))"))
})

test('a copy whose git step failed is timed without a budget, since no setup started', async () => {
  const next = boards(board({ ready: [2, 3], parallel: 2 }), board({ done: [2, 3], parallel: 2 }))
  const run = await drive((label) => {
    if (label.startsWith('next:')) return next()
    if (label === 'worktree:#2') return ok(JSON.stringify({ ticket: 2, path: '/wt/ticket-2', failure: null, elapsedSeconds: 3 }))
    if (label === 'worktree:#3') return { exitCode: 1, output: JSON.stringify({ ticket: 3, path: '/wt/ticket-3', failure: { step: 'git worktree add', detail: 'git worktree add failed: fatal: invalid reference' }, elapsedSeconds: 1 }) }
    if (label.startsWith('worktree-remove:')) return ok('{}')
    return happyTicket(label) ?? releaseSteps(label)
  })
  assert.match(run.calls.find((call) => call.label === 'post:#1:fallback:1').prompt, /#3: git worktree add — git worktree add failed: fatal: invalid reference \(after 1s\)/)
})
