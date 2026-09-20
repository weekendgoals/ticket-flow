// meter.test.mjs — tokens and time read off a workflow run's transcripts.
//
// `meter` is a pure function over the journal's text and a transcript reader,
// so most tests here meter strings; the CLI tests write a throwaway run
// directory to the OS temp dir. Nothing but Node — no git, no network, and no
// real transcript: the shapes below are the ones a real run wrote
// (`journal.jsonl` without timestamps, one `timestamp` per transcript line,
// one `usage` per assistant message repeated on every line of that message).

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { execFileSync, spawnSync } from 'node:child_process'
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { meter, readTranscript, tokensLine, timeLine } from './meter.mjs'

const METER = join(dirname(fileURLToPath(import.meta.url)), 'meter.mjs')
const jsonl = (rows) => rows.map((r) => JSON.stringify(r)).join('\n') + '\n'
const at = (s) => new Date(Date.UTC(2026, 8, 13, 15, 0, 0) + s * 1000).toISOString()
const usage = (input, output, creation, read = 0) => ({ input_tokens: input, output_tokens: output, cache_creation_input_tokens: creation, cache_read_input_tokens: read })
// A transcript running from `start` to `end` seconds with one assistant message.
const transcript = (start, end, u, id = 'msg_1') =>
  jsonl([
    { type: 'user', timestamp: at(start) },
    { type: 'assistant', timestamp: at(end), message: { id, usage: u } },
  ])
const started = (label, agentId) => ({ type: 'started', key: `v2:${agentId}`, agentId, label, phase: 'Ticket' })

test('a message streamed as several lines is counted once', () => {
  const u = usage(10, 200, 3000, 900000)
  const t = readTranscript(
    jsonl([
      { type: 'assistant', timestamp: at(0), message: { id: 'msg_a', usage: u } },
      { type: 'assistant', timestamp: at(1), message: { id: 'msg_a', usage: u } },
      { type: 'assistant', timestamp: at(5), message: { id: 'msg_b', usage: usage(1, 2, 3) } },
    ]),
  )
  assert.equal(t.tokens, 3210 + 6)
  assert.equal(t.parts.cacheRead, 900000, 'cache reads are reported')
  assert.equal(t.seconds, 5)
})

test('a message with no id is deduplicated by its request id', () => {
  const u = usage(0, 100, 0)
  const line = (s) => ({ type: 'assistant', timestamp: at(s), requestId: 'req_1', message: { usage: u } })
  assert.equal(readTranscript(jsonl([line(0), line(1), line(2)])).tokens, 100)
})

test('a run that selected no ticket prints a total and a run time, and no group', () => {
  const r = meter(jsonl([started('refresh+select:1', 's')]), () => transcript(0, 28, usage(0, 991, 40_000)))
  assert.equal(tokensLine(r), '**Tokens:** total=40,991')
  assert.equal(timeLine(r), '**Time:** run=28s')
})

test('cache reads are left out of the token figure', () => {
  assert.equal(readTranscript(transcript(0, 1, usage(1, 1, 1, 5_000_000))).tokens, 3)
})

test('a transcript with no assistant message has time and no tokens', () => {
  const t = readTranscript(jsonl([{ type: 'user', timestamp: at(0) }, { type: 'user', timestamp: at(40) }]))
  assert.equal(t.tokens, null)
  assert.equal(t.seconds, 40)
})

test('a torn last line does not lose the lines before it', () => {
  const t = readTranscript(transcript(0, 30, usage(1, 2, 3)) + '{"type":"assistant","timest')
  assert.equal(t.tokens, 6)
  assert.equal(t.seconds, 30)
})

const RUN = {
  journal: jsonl([
    { type: 'launched' },
    started('refresh+select:1', 'sel1'),
    { type: 'result', agentId: 'sel1', result: {} },
    started('worker:FND-2', 'w2'),
    started('tier-facts:FND-2', 'tf2'),
    started('review:FND-2', 'r2'),
    started('disposition:FND-2', 'd2'),
    started('re-review:FND-2', 'rr2'),
    started('merge:FND-2', 'm2'),
    started('refresh+select:2', 'sel2'),
    started('worker:FND-3', 'w3'),
    started('review:FND-3', 'r3'),
    started('refresh+select:3', 'sel3'),
    { type: 'failed', agentId: 'sel3' },
  ]),
  transcripts: {
    sel1: transcript(0, 20, usage(0, 100, 900)),
    w2: transcript(30, 1030, usage(0, 50_000, 150_000)),
    tf2: transcript(1040, 1050, usage(0, 100, 400)),
    r2: transcript(1060, 1360, usage(0, 10_000, 90_000)),
    d2: transcript(1370, 1470, usage(0, 5_000, 45_000)),
    rr2: transcript(1480, 1580, usage(0, 2_000, 28_000)),
    m2: transcript(1590, 1600, usage(0, 100, 400)),
    sel2: transcript(1610, 1630, usage(0, 100, 900)),
    w3: transcript(1640, 2240, usage(0, 30_000, 70_000)),
    r3: transcript(2250, 2450, usage(0, 8_000, 42_000)),
    sel3: transcript(2460, 2470, usage(0, 50, 450)),
  },
}
const read = (run) => (id) => run.transcripts[id] ?? null

test('labels map to the ledger roles, and every other step is a proxy', () => {
  const [t2] = meter(RUN.journal, read(RUN)).tickets
  assert.deepEqual(t2.tokens, { worker: 200_000, reviewer: 100_000, disposition: 50_000, 're-review': 30_000, proxies: 2_000 })
  assert.deepEqual(t2.seconds, { worker: 1000, reviewer: 300, disposition: 100, 're-review': 100, proxies: 40 })
})

test('a refresh+select step belongs to the ticket it selected', () => {
  const r = meter(RUN.journal, read(RUN))
  assert.deepEqual(r.tickets.map((t) => t.id), ['FND-2', 'FND-3'])
  assert.equal(r.tickets[1].tokens.proxies, 1000, "refresh+select:2 is FND-3's proxy")
  assert.equal(r.tickets[1].agents[0].label, 'refresh+select:2')
})

test('a select that selected nothing is run overhead, in total= and in no group', () => {
  const r = meter(RUN.journal, read(RUN))
  assert.deepEqual(r.overhead.map((a) => a.label), ['refresh+select:3'])
  assert.equal(r.overhead[0].failed, true)
  assert.equal(r.totalTokens, 382_000 + 151_000 + 500)
})

test('wall runs from the first agent start to the last agent end, gaps included', () => {
  const r = meter(RUN.journal, read(RUN))
  const [t2, t3] = r.tickets
  assert.equal(t2.wall, 1600)
  assert.ok(t2.wall > Object.values(t2.seconds).reduce((a, b) => a + b, 0), 'the gaps between agents are part of the wall')
  assert.equal(t3.wall, 2450 - 1610)
  assert.equal(r.runSeconds, 2470)
})

test('a role that never ran is absent; a role whose transcript is missing is unknown', () => {
  const run = { ...RUN, transcripts: { ...RUN.transcripts, r3: undefined } }
  const t3 = meter(RUN.journal, read(run)).tickets[1]
  assert.equal('re-review' in t3.tokens, false)
  assert.equal(t3.tokens.reviewer, null)
  assert.equal(t3.seconds.reviewer, null)
  assert.equal(t3.wall, null, 'a wall with a hole in it is not a wall')
  assert.equal(t3.tokens.worker, 100_000, 'the roles that were observed keep their figures')
})

test('a retried step is summed; one unobserved attempt makes the role unknown', () => {
  const journal = jsonl([started('worker:A-1', 'w1'), started('worker:A-1:retry', 'w2')])
  const both = { w1: transcript(0, 10, usage(0, 1, 9)), w2: transcript(20, 50, usage(0, 2, 18)) }
  const t = meter(journal, (id) => both[id] ?? null).tickets[0]
  assert.equal(t.tokens.worker, 30)
  assert.equal(t.seconds.worker, 40)
  assert.equal(meter(journal, (id) => (id === 'w1' ? both.w1 : null)).tickets[0].tokens.worker, null)
})

test('the two lines are the shapes the run record carries', () => {
  const r = meter(RUN.journal, read(RUN))
  assert.equal(
    tokensLine(r),
    '**Tokens:** FND-2 worker=200,000 reviewer=100,000 disposition=50,000 re-review=30,000 proxies=2,000; FND-3 worker=100,000 reviewer=50,000 proxies=1,000; total=533,500',
  )
  assert.equal(
    timeLine(r),
    '**Time:** FND-2 worker=1000s reviewer=300s disposition=100s re-review=100s proxies=40s wall=1600s; FND-3 worker=600s reviewer=200s proxies=20s wall=840s; run=2470s',
  )
})

test('every time figure carries its unit, so none can be read as tokens', () => {
  const run = { ...RUN, transcripts: { ...RUN.transcripts, r3: undefined } }
  const line = timeLine(meter(RUN.journal, read(run)))
  for (const m of line.matchAll(/=(\S+?)(?=[;\s]|$)/g)) assert.match(m[1], /^(\d+s|unknown)$/, m[0])
})

function runDir(run) {
  const dir = mkdtempSync(join(tmpdir(), 'flow-meter-'))
  writeFileSync(join(dir, 'journal.jsonl'), run.journal)
  for (const [id, text] of Object.entries(run.transcripts)) if (text) writeFileSync(join(dir, `agent-${id}.jsonl`), text)
  return dir
}

test('CLI: prints both lines and one row per agent; --json carries the same lines', () => {
  const dir = runDir(RUN)
  try {
    const out = execFileSync('node', [METER, dir], { encoding: 'utf8' })
    assert.match(out, /^\*\*Tokens:\*\* FND-2 worker=200,000/m)
    assert.match(out, /^\*\*Time:\*\* FND-2 worker=1000s/m)
    assert.match(out, /worker:FND-2 — 200,000 tokens .*1000s/)
    assert.match(out, /run overhead/)
    const json = JSON.parse(execFileSync('node', [METER, dir, '--json'], { encoding: 'utf8' }))
    assert.equal(json.tickets[0].wall, 1600)
    assert.match(json.timeLine, /^\*\*Time:\*\* FND-2 worker=1000s .* wall=1600s; FND-3 .*; run=2470s$/)
    assert.deepEqual(json.overhead.map((a) => [a.label, a.role, a.failed]), [['refresh+select:3', 'proxies', true]])
    assert.deepEqual(Object.keys(json.tickets[0].agents[1]).sort(), ['agentId', 'failed', 'label', 'parts', 'role', 'seconds', 'tokens', 'transcript'])
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
})

test('CLI: a directory with no journal is refused, and told to write unknown', () => {
  const dir = mkdtempSync(join(tmpdir(), 'flow-meter-'))
  try {
    const r = spawnSync('node', [METER, dir], { encoding: 'utf8' })
    assert.equal(r.status, 1)
    assert.match(r.stderr, /no journal\.jsonl/)
    assert.match(r.stderr, /unknown/)
    assert.equal(spawnSync('node', [METER], { encoding: 'utf8' }).status, 2)
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
})

test('a wave: the plumbing steps are the ticket\'s proxies, the setup step is run overhead, and walls overlap', () => {
  const journal = jsonl([
    started('refresh+select:1', 's1'), started('wave-setup:payments', 'u'),
    started('worktree:PAY-1', 'wt1'), started('worktree:PAY-2', 'wt2'),
    started('worker:PAY-1', 'w1'), started('worker:PAY-2', 'w2'),
    started('merge:PAY-1', 'm1'), started('worktree-remove:PAY-1', 'wr1'),
    started('merge:PAY-2', 'm2'), started('post-merge:PAY-2', 'pm2'), started('worktree-remove:PAY-2', 'wr2'),
  ])
  const t = { s1: [0, 10], u: [10, 12], wt1: [12, 14], wt2: [12, 15], w1: [15, 1015], w2: [15, 615], m1: [1020, 1030], wr1: [1030, 1032], m2: [1032, 1042], pm2: [1042, 1062], wr2: [1062, 1064] }
  const r = meter(journal, id => transcript(t[id][0], t[id][1], usage(0, 10, 90)))
  assert.deepEqual(r.overhead.map(a => a.label), ['wave-setup:payments'])
  const [p1, p2] = r.tickets
  assert.deepEqual(p1.agents.map(a => a.label), ['refresh+select:1', 'worktree:PAY-1', 'worker:PAY-1', 'merge:PAY-1', 'worktree-remove:PAY-1'])
  assert.deepEqual([p2.tokens.proxies, p2.seconds.proxies], [400, 3 + 10 + 20 + 2], 'worktree, merge, post-merge and worktree-remove')
  assert.deepEqual([p1.wall, p2.wall, r.runSeconds], [1032, 1052, 1064])
  assert.ok(p1.wall + p2.wall > r.runSeconds, 'side by side: the walls overlap')
})
