import { test, after } from 'node:test'
import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { mkdtempSync, rmSync, writeFileSync, realpathSync, mkdirSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { tmpdir } from 'node:os'
import { fileURLToPath } from 'node:url'
import { meterTranscripts, meterComment, readMeterComment, loadSources, assignStreamRoles, workflowSources, workflowAgents } from './meter.mjs'
import { installFakeGh } from './tracker/fake-gh.mjs'

const FLOW = join(dirname(fileURLToPath(import.meta.url)), 'flow.mjs')
const directory = realpathSync(mkdtempSync(join(tmpdir(), 'flow-meter-')))
after(() => rmSync(directory, { recursive: true, force: true }))

const usage = (input, output, cacheCreation = 0, cacheRead = 0) => ({
  input_tokens: input,
  output_tokens: output,
  cache_creation_input_tokens: cacheCreation,
  cache_read_input_tokens: cacheRead,
})

const assistant = (id, model, figures, timestamp, content = [{ type: 'text', text: 'ok' }]) => ({
  type: 'assistant',
  timestamp,
  requestId: `req-${id}`,
  message: { id, model, role: 'assistant', content, usage: figures },
})

const user = (text, timestamp, extra = {}) => ({ type: 'user', timestamp, message: { role: 'user', content: text }, ...extra })
const toolResult = (text, timestamp) => ({ type: 'user', timestamp, message: { role: 'user', content: [{ type: 'tool_result', tool_use_id: 't', content: text }] } })
const boundary = (timestamp) => ({ type: 'system', subtype: 'compact_boundary', content: 'Conversation compacted', timestamp, compactMetadata: { trigger: 'auto', preTokens: 1000 } })
const jsonl = (lines) => lines.map((line) => JSON.stringify(line)).join('\n')

test('a message written as several lines is counted once, by its id, with its last usage', () => {
  const text = jsonl([
    assistant('m1', 'claude-opus-5', usage(10, 1, 100, 0), '2026-10-14T10:00:00Z'),
    assistant('m1', 'claude-opus-5', usage(10, 1, 100, 0), '2026-10-14T10:00:01Z'),
    assistant('m1', 'claude-opus-5', usage(10, 40, 100, 0), '2026-10-14T10:00:02Z'),
    assistant('m2', 'claude-opus-5', usage(5, 20, 0, 110), '2026-10-14T10:01:00Z'),
  ])
  const { roles } = meterTranscripts([{ role: 'worker', text }])
  assert.deepEqual(
    { input: roles.worker.input, output: roles.worker.output, cacheCreation: roles.worker.cacheCreation, cacheReads: roles.worker.cacheReads },
    { input: 15, output: 60, cacheCreation: 100, cacheReads: 110 },
  )
})

test('the largest context is the biggest single request (input, cache reads and cache writes), never a sum, and leaves output out', () => {
  const text = jsonl([
    assistant('m1', 'claude-opus-5', usage(10, 9000, 5000, 0), '2026-10-14T10:00:00Z'),
    assistant('m2', 'claude-opus-5', usage(20, 5, 300, 5000), '2026-10-14T10:00:10Z'),
    assistant('m3', 'claude-opus-5', usage(1, 5, 0, 4000), '2026-10-14T10:00:20Z'),
  ])
  assert.equal(meterTranscripts([{ role: 'worker', text }]).roles.worker.peakContext, 5320)
})

test('figures are split by role and by model, and the totals add them up', () => {
  const sources = [
    { role: 'worker', text: jsonl([assistant('w1', 'claude-sonnet-5', usage(100, 10, 0, 0), '2026-10-14T10:00:00Z'), assistant('w2', 'claude-sonnet-5', usage(50, 5, 0, 0), '2026-10-14T10:10:00Z')]) },
    { role: 'reviewer', text: jsonl([assistant('r1', 'claude-fable-5', usage(300, 30, 0, 0), '2026-10-14T10:11:00Z'), assistant('r2', 'claude-fable-5', usage(1, 1, 0, 0), '2026-10-14T10:12:30Z')]) },
    { role: 'fixes', text: jsonl([assistant('f1', 'claude-sonnet-5', usage(7, 3, 0, 0), '2026-10-14T10:13:00Z')]) },
  ]
  const { roles, models, total } = meterTranscripts(sources)
  assert.deepEqual(Object.keys(roles), ['worker', 'reviewer', 'fixes'])
  assert.equal(roles.worker.wallSeconds, 600)
  assert.equal(roles.reviewer.wallSeconds, 90)
  assert.equal(roles.fixes.wallSeconds, 0)
  assert.deepEqual(Object.keys(roles.worker.models), ['claude-sonnet-5'])
  assert.deepEqual([models['claude-sonnet-5'].input, models['claude-sonnet-5'].output], [157, 18])
  assert.deepEqual([models['claude-fable-5'].input, models['claude-fable-5'].peakContext], [301, 300])
  assert.deepEqual([total.input, total.output, total.peakContext, total.wallSeconds], [458, 49, 300, 780])
})

test('one role that used two models reports each', () => {
  const text = jsonl([
    assistant('a', 'claude-opus-5', usage(10, 1), '2026-10-14T10:00:00Z'),
    assistant('b', 'claude-sonnet-5', usage(20, 2), '2026-10-14T10:00:05Z'),
    assistant('c', '<synthetic>', usage(0, 0), '2026-10-14T10:00:06Z'),
  ])
  const { roles } = meterTranscripts([{ role: 'worker', text }])
  assert.deepEqual(Object.keys(roles.worker.models), ['claude-opus-5', 'claude-sonnet-5', 'unknown'])
  assert.equal(roles.worker.models['claude-sonnet-5'].input, 20)
})

test('compactions count the compaction marker lines, and a summary beside its marker is the same compaction', () => {
  const text = jsonl([
    assistant('a', 'claude-opus-5', usage(10, 1), '2026-10-14T10:00:00Z'),
    boundary('2026-10-14T10:30:00Z'),
    user('This session is being continued from a previous conversation.', '2026-10-14T10:30:01Z', { isCompactSummary: true, isVisibleInTranscriptOnly: true }),
    assistant('b', 'claude-opus-5', usage(10, 1), '2026-10-14T10:31:00Z'),
    boundary('2026-10-14T11:00:00Z'),
    user('Continued again.', '2026-10-14T11:00:01Z', { isCompactSummary: true }),
  ])
  assert.equal(meterTranscripts([{ role: 'worker', text }]).roles.worker.compactions, 2)
  const summariesOnly = jsonl([user('continued', '2026-10-14T10:30:01Z', { isCompactSummary: true })])
  assert.equal(meterTranscripts([{ role: 'worker', text: summariesOnly }]).roles.worker.compactions, 1)
})

test('text a tool printed is not a model that ran and not a compaction', () => {
  const quoted = JSON.stringify({ type: 'system', subtype: 'compact_boundary', message: { model: 'claude-haiku-4-5', usage: usage(999, 999) } })
  const text = jsonl([
    assistant('a', 'claude-opus-5', usage(10, 1), '2026-10-14T10:00:00Z', [{ type: 'tool_use', id: 't', name: 'Bash', input: { command: 'cat old.jsonl' } }]),
    toolResult(`${quoted}\n"model":"claude-haiku-4-5"`, '2026-10-14T10:00:01Z'),
  ])
  const { roles } = meterTranscripts([{ role: 'worker', text }])
  assert.deepEqual(Object.keys(roles.worker.models), ['claude-opus-5'])
  assert.equal(roles.worker.compactions, 0)
  assert.equal(roles.worker.input, 10)
})

test('a figure the transcript does not record is unknown, never zero and never a guess', () => {
  const noUsage = jsonl([user('hello', '2026-10-14T10:00:00Z')])
  const worker = meterTranscripts([{ role: 'worker', text: noUsage }]).roles.worker
  assert.deepEqual([worker.input, worker.output, worker.cacheReads, worker.peakContext], [null, null, null, null])
  const partial = jsonl([
    assistant('a', 'claude-opus-5', { input_tokens: 10, output_tokens: 2 }, '2026-10-14T10:00:00Z'),
    assistant('b', 'claude-opus-5', usage(5, 1, 0, 50), '2026-10-14T10:00:01Z'),
  ])
  const mixed = meterTranscripts([{ role: 'worker', text: partial }]).roles.worker
  assert.deepEqual([mixed.input, mixed.output, mixed.cacheReads, mixed.peakContext], [15, 3, null, null])
  const untimed = meterTranscripts([{ role: 'worker', text: jsonl([{ type: 'assistant', message: { id: 'x', model: 'claude-opus-5', usage: usage(1, 1) } }]) }])
  assert.equal(untimed.roles.worker.wallSeconds, null)
  assert.equal(untimed.total.wallSeconds, null)
  assert.match(meterComment({ ticket: 4, sourceCount: 1, meter: untimed }), /\| worker \| claude-opus-5 \| 1 \| 1 \| 0 \| 0 \| 1 \| 0 \| unknown \|/)
})

test('a torn or foreign line is skipped without losing the rest', () => {
  const text = `${jsonl([assistant('a', 'claude-opus-5', usage(10, 1), '2026-10-14T10:00:00Z')])}\nnot json\n{"type":"assistant","message":{"id":"b","usa`
  assert.equal(meterTranscripts([{ role: 'worker', text }]).roles.worker.input, 10)
})

const streamLine = (line, parent = null) => ({ ...line, parent_tool_use_id: parent, session_id: 's1' })
const launch = (id, subagent) => ({ type: 'tool_use', id, name: 'Agent', input: { subagent_type: subagent, description: 'x', prompt: 'y' } })

function headlessStream() {
  return jsonl([
    { type: 'system', subtype: 'init', session_id: 's1', model: 'claude-opus-5', tools: [] },
    streamLine({ type: 'assistant', message: { id: 'w1', model: 'claude-opus-5', usage: usage(100, 10), content: [launch('explore-1', 'Explore')] } }),
    streamLine({ type: 'assistant', message: { id: 'e1', model: 'claude-sonnet-5', usage: usage(40, 4), content: [] } }, 'explore-1'),
    streamLine({ type: 'assistant', message: { id: 'w2', model: 'claude-opus-5', usage: usage(200, 20), content: [launch('review-1', 'flow:ticket-reviewer')] } }),
    streamLine({ type: 'assistant', message: { id: 'r1', model: 'claude-fable-5', usage: usage(300, 30), content: [] } }, 'review-1'),
    streamLine({ type: 'assistant', message: { id: 'r1', model: 'claude-fable-5', usage: usage(300, 31), content: [] } }, 'review-1'),
    streamLine({ type: 'system', subtype: 'compact_boundary', compact_metadata: { trigger: 'auto', pre_tokens: 150000 } }),
    streamLine({ type: 'assistant', message: { id: 'f1', model: 'claude-opus-5', usage: usage(50, 5), content: [] } }),
    { type: 'result', subtype: 'success', duration_ms: 754000, num_turns: 9, session_id: 's1', usage: usage(1, 1) },
  ])
}

test('a headless run\'s stream is split into worker, reviewer and fixes by who launched what', () => {
  const { roles, total } = meterTranscripts([{ role: null, text: headlessStream() }])
  assert.deepEqual(Object.keys(roles), ['worker', 'reviewer', 'fixes'])
  assert.deepEqual([roles.worker.input, Object.keys(roles.worker.models)], [340, ['claude-opus-5', 'claude-sonnet-5']])
  assert.deepEqual([roles.reviewer.input, roles.reviewer.output, Object.keys(roles.reviewer.models)], [300, 31, ['claude-fable-5']])
  assert.deepEqual([roles.fixes.input, roles.fixes.compactions], [50, 1])
  assert.equal(roles.worker.wallSeconds, null, 'the stream carries no timestamps')
  assert.equal(total.wallSeconds, 754, 'the run as a whole is timed by its result line')
})

test('stream roles: a subagent launched after review belongs to the fixes', () => {
  const lines = [
    streamLine({ type: 'assistant', message: { id: 'a', content: [launch('rev', 'ticket-reviewer')] } }),
    streamLine({ type: 'assistant', message: { id: 'b', content: [launch('helper', 'general-purpose')] } }),
    streamLine({ type: 'assistant', message: { id: 'c', content: [] } }, 'helper'),
  ]
  assert.deepEqual(assignStreamRoles(lines).map((entry) => entry.role), ['worker', 'fixes', 'fixes'])
})

test('a directory is read whole, and a subagent whose record says ticket-reviewer is metered as the reviewer', () => {
  const session = join(directory, 'session', 'subagents')
  mkdirSync(session, { recursive: true })
  writeFileSync(join(session, 'agent-a1.jsonl'), jsonl([assistant('x', 'claude-opus-5', usage(10, 1), '2026-10-14T10:00:00Z')]))
  writeFileSync(join(session, 'agent-a2.jsonl'), jsonl([assistant('y', 'claude-fable-5', usage(20, 2), '2026-10-14T10:05:00Z')]))
  writeFileSync(join(session, 'agent-a2.meta.json'), JSON.stringify({ agentType: 'flow:ticket-reviewer', description: 'review #4' }))
  const sources = loadSources([join(directory, 'session')])
  assert.deepEqual(sources.map((source) => source.role), [null, 'reviewer'])
  const { roles } = meterTranscripts(sources)
  assert.deepEqual([roles.worker.input, roles.reviewer.input], [10, 20])
  assert.deepEqual(loadSources([`fixes=${join(session, 'agent-a1.jsonl')}`]).map((source) => source.role), ['fixes'])
})

test('the comment carries readable tables and the same figures as JSON for later reading', () => {
  const meter = meterTranscripts([{ role: null, text: headlessStream() }])
  const body = meterComment({ ticket: 12, sourceCount: 1, meter })
  assert.match(body, /^<!-- flow:meter -->\n\*\*Cost of #12\*\*/)
  assert.match(body, /\| reviewer \| claude-fable-5 \| 300 \| 31 \| 0 \| 0 \| 300 \| 0 \| unknown \|/)
  assert.match(body, /\| \*\*total\*\* \| \| 690 \|/)
  assert.match(body, /\| claude-sonnet-5 \| 40 \| 4 \|/)
  const parsed = readMeterComment(body)
  assert.equal(parsed.flowMeter, 1)
  assert.equal(parsed.ticket, 12)
  assert.equal(parsed.roles.fixes.compactions, 1)
  assert.equal(parsed.total.wallSeconds, 754)
  assert.equal(readMeterComment('**Cost of #12**'), null)
})

test('flow meter prints with --print and posts the comment otherwise', () => {
  const fake = installFakeGh(join(directory, 'bin'))
  const stream = join(directory, 'run.jsonl')
  writeFileSync(stream, headlessStream())
  const run = (...args) => spawnSync(process.execPath, [FLOW, 'meter', ...args], { cwd: directory, encoding: 'utf8', env: { ...process.env, ...fake.env } })
  fake.setFixtures({})
  const printed = run('12', '--transcripts', stream, '--print')
  assert.equal(printed.status, 0, printed.stderr)
  assert.match(printed.stdout, /^<!-- flow:meter -->/)
  assert.deepEqual(fake.calls(), [])
  fake.setFixtures({ 'POST repos/{owner}/{repo}/issues/12/comments': { id: 3, html_url: 'https://github.com/o/r/issues/12#issuecomment-3' } })
  const posted = run('12', '--transcripts', `worker=${stream}`, `reviewer=${stream}`)
  assert.equal(posted.status, 0, posted.stderr)
  assert.match(JSON.parse(fake.calls()[0].stdin).body, /2 transcript file\(s\)/)
  const missing = run('12', '--transcripts', join(directory, 'nope.jsonl'))
  assert.equal(missing.status, 1)
  assert.match(missing.stderr, /no transcript at/)
})

function realShapeStream() {
  const sessionId = 's-real'
  const realUsage = (input, output, cacheCreation, cacheRead) => ({
    input_tokens: input,
    cache_creation_input_tokens: cacheCreation,
    cache_read_input_tokens: cacheRead,
    cache_creation: { ephemeral_5m_input_tokens: 0, ephemeral_1h_input_tokens: cacheCreation },
    output_tokens: output,
    service_tier: 'standard',
    inference_geo: 'global',
  })
  const assistantLine = (id, model, figures, timestamp, parent = null, content = [{ type: 'text', text: 'x' }]) => ({
    type: 'assistant',
    message: { model, id, type: 'message', role: 'assistant', content, container: null, stop_reason: null, stop_sequence: null, stop_details: null, usage: figures, input_transformations: [], diagnostics: null, context_management: null },
    parent_tool_use_id: parent,
    session_id: sessionId,
    uuid: `u-${id}`,
    timestamp,
    request_id: `req-${id}`,
  })
  return jsonl([
    { type: 'system', subtype: 'hook_started', hook_id: 'h', hook_name: 'SessionStart', hook_event: 'SessionStart', uuid: 'u0', session_id: sessionId },
    { type: 'system', subtype: 'init', cwd: '/w', session_id: sessionId, tools: ['Bash'], mcp_servers: [], model: 'claude-opus-5', permissionMode: 'default', slash_commands: [], apiKeySource: 'none', claude_code_version: '2', agents: [], skills: [], plugins: [], uuid: 'u1' },
    assistantLine('m1', 'claude-opus-5', realUsage(2, 4, 14282, 10976), '2026-10-15T08:00:00.000Z', null, [
      { type: 'tool_use', id: 'toolu_rev', name: 'Agent', input: { subagent_type: 'flow:ticket-reviewer', prompt: 'p' } },
    ]),
    assistantLine('m2', 'claude-fable-5', realUsage(5, 50, 2000, 0), '2026-10-15T08:00:20.000Z', 'toolu_rev'),
    assistantLine('m3', 'claude-opus-5', realUsage(3, 6, 10, 25258), '2026-10-15T08:00:30.000Z'),
    { type: 'rate_limit_event', rate_limit_info: { status: 'allowed', resetsAt: 1, rateLimitType: 'five_hour' }, uuid: 'u9', session_id: sessionId },
    {
      type: 'result',
      subtype: 'success',
      is_error: false,
      duration_ms: 42274,
      duration_api_ms: 30052,
      num_turns: 3,
      result: 'ok',
      session_id: sessionId,
      total_cost_usd: 0.5,
      usage: { input_tokens: 10, cache_creation_input_tokens: 16292, cache_read_input_tokens: 36234, output_tokens: 60, server_tool_use: { web_search_requests: 0 }, service_tier: 'standard', iterations: [] },
      modelUsage: {
        'claude-opus-5': { inputTokens: 5, outputTokens: 10, cacheReadInputTokens: 36234, cacheCreationInputTokens: 14292, webSearchRequests: 0, costUSD: 0.4, contextWindow: 1000000, maxOutputTokens: 64000 },
        'claude-fable-5': { inputTokens: 5, outputTokens: 50, cacheReadInputTokens: 0, cacheCreationInputTokens: 2000, webSearchRequests: 0, costUSD: 0.1, contextWindow: 1000000, maxOutputTokens: 64000 },
      },
      permission_denials: [],
      uuid: 'u10',
    },
  ])
}

test('the stream shape a real headless run writes: usage per message, the reviewer by parent_tool_use_id, the run timed by its result line', () => {
  const meter = meterTranscripts([{ role: null, text: realShapeStream() }])
  assert.deepEqual(Object.keys(meter.roles), ['worker', 'reviewer', 'fixes'])
  assert.deepEqual([meter.roles.worker.input, meter.roles.worker.cacheCreation, meter.roles.worker.peakContext], [2, 14282, 25260])
  assert.deepEqual([meter.roles.reviewer.output, Object.keys(meter.roles.reviewer.models)], [50, ['claude-fable-5']])
  assert.equal(meter.roles.fixes.cacheReads, 25258)
  assert.equal(meter.total.wallSeconds, 42, 'the result line spans the whole run, longer than the first to last message')
  assert.deepEqual(meter.reported.models['claude-fable-5'], { input: 5, output: 50, cacheCreation: 2000, cacheReads: 0 })
  assert.equal(meter.reported.turns, 3)
  const body = meterComment({ ticket: 4, sourceCount: 1, meter })
  assert.match(body, /As the headless run reported it at its end \(1 run\(s\), 3 turn\(s\)\)/)
  assert.match(body, /\| claude-opus-5 \| 5 \| 10 \| 14,292 \| 36,234 \|/)
})

test('the GitHub Action writes the same messages as one JSON array, and that reads the same', () => {
  const asArray = `[${realShapeStream().split('\n').join(',\n')}]`
  const fromLines = meterTranscripts([{ role: null, text: realShapeStream() }])
  const fromArray = meterTranscripts([{ role: null, text: asArray }])
  assert.deepEqual(fromArray, fromLines)
})

test('a workflow run is metered per ticket from its journal: worker, reviewer and fixes by the agent labels', () => {
  const run = join(directory, 'wf_run')
  mkdirSync(run, { recursive: true })
  writeFileSync(
    join(run, 'journal.jsonl'),
    jsonl([
      { type: 'launched' },
      { type: 'started', agentId: 'a1', key: 'k1', label: 'next:#7', phase: 'Wave 1' },
      { type: 'started', agentId: 'a2', key: 'k2', label: 'worker:#8', phase: 'Wave 1' },
      { type: 'started', agentId: 'a3', key: 'k3', label: 'reviewer:#8', phase: 'Wave 1' },
      { type: 'started', agentId: 'a4', key: 'k4', label: 'fixes:#8', phase: 'Wave 1' },
      { type: 'started', agentId: 'a5', key: 'k5', label: 'reviewer:#8:2', phase: 'Wave 1' },
      { type: 'started', agentId: 'a6', key: 'k6', label: 'worker:#80', phase: 'Wave 1' },
      { type: 'result', agentId: 'a2', key: 'k2', result: 'x' },
    ]),
  )
  for (const [id, model, input] of [['a1', 'claude-sonnet-5', 1], ['a2', 'claude-opus-5', 100], ['a3', 'claude-fable-5', 200], ['a4', 'claude-opus-5', 30], ['a6', 'claude-opus-5', 9999]])
    writeFileSync(join(run, `agent-${id}.jsonl`), jsonl([assistant(`m-${id}`, model, usage(input, 1), '2026-10-15T09:00:00Z')]))
  const sources = workflowSources(run, 8)
  assert.deepEqual(sources.map((source) => source.role), ['worker', 'reviewer', 'fixes'], 'a missing transcript is left out, and #80 is not #8')
  const { roles } = meterTranscripts(sources)
  assert.deepEqual([roles.worker.input, roles.reviewer.input, roles.fixes.input], [100, 200, 30])
  assert.deepEqual(workflowAgents('{"type":"started","agentId":"z","label":"check-epic:#8"}', 8), [])
  assert.throws(() => workflowSources(directory, 8), /no journal\.jsonl/)
})
