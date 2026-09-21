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
import { meter, readTranscript, tokensLine, timeLine, cacheReadsLine, modelsLine, peakLine } from './meter.mjs'

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
// An assistant line naming the model that wrote it, the way the harness does.
const says = (s, model, id = 'msg_1', u = usage(0, 1, 0)) => ({ type: 'assistant', timestamp: at(s), message: { id, model, usage: u } })
// A tool RESULT line — the shape a shell call's output reaches a transcript
// in. Built here, never read from a real transcript: those live under
// ~/.claude and belong to whoever ran them.
const toolResult = (s, text) => ({
  type: 'user',
  timestamp: at(s),
  message: { role: 'user', content: [{ type: 'tool_result', tool_use_id: 'toolu_1', content: [{ type: 'text', text }] }] },
})
// What `scripts/runners/codex.mjs --json` prints: the worker-shaped report
// with the runner's own record under `runner` (see its `out` object).
const codexReport = (model, extra = {}, ticket = 'CX-1') =>
  JSON.stringify(
    {
      state: 'finished',
      ticket,
      result: 'work-done',
      stopCondition: 'none',
      tier: 'normal',
      branch: 'cx-1',
      deployPreconditions: [],
      runner: { name: 'codex', model, exitCode: 0, usage: { input_tokens: 12 }, threadId: 'th_1', pushed: true, durationMs: 1000, events: 40, ...extra },
    },
    null,
    2,
  )

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

test('the release check is run overhead: it gives no ticket a group, and stretches no ticket\'s wall', () => {
  // The driver spells these `release-check:<epic>:<ID>`, the epic before the
  // id, because a `<role>:<ID>` label is filed under that ticket — and filed
  // there, a release check run at the END of the run stretched RC-2's wall to
  // the whole run and gave RC-1, which an earlier run built, a group in this
  // run's lines. A re-run with nothing to start must still print no group.
  const journal = jsonl([
    started('refresh+select:1', 'a'), started('worker:RC-2', 'b'), started('merge:RC-2', 'c'),
    started('refresh+select:2', 'd'), started('release-list:rc', 'e'), started('release-check:rc:RC-1', 'f'), started('release-check:rc:RC-2', 'g'),
  ])
  const spans = { a: [0, 10], b: [10, 1200], c: [1200, 1220], d: [1220, 1240], e: [1240, 1250], f: [1250, 3000], g: [3000, 5000] }
  const r = meter(journal, (id) => transcript(...spans[id], usage(0, 10, 100), `msg_${id}`))
  assert.match(timeLine(r), /RC-2 [^—]*wall=1220s/)
  assert.doesNotMatch(timeLine(r), /RC-1/)
  assert.doesNotMatch(tokensLine(r), /RC-1/)
  assert.match(timeLine(r), /run=5000s/)
  const idle = meter(jsonl([started('refresh+select:1', 'a'), started('release-list:rc', 'e'), started('release-check:rc:RC-1', 'f')]), (id) => transcript(...spans[id], usage(0, 10, 100), `msg_${id}`))
  assert.doesNotMatch(timeLine(idle), /RC-1|wall=/, 'a run that selected no ticket still prints no group')
})

test('cache reads are left out of the token figure, and reported beside it', () => {
  const t = readTranscript(transcript(0, 1, usage(1, 1, 1, 5_000_000)))
  assert.equal(t.tokens, 3)
  assert.equal(t.cacheReads, 5_000_000)
  // Zero reads is an observation, not a missing one — a first agent has no
  // cache to read from, and `unknown` there would read as a lost transcript.
  assert.equal(readTranscript(transcript(0, 1, usage(1, 1, 1))).cacheReads, 0)
  assert.equal(readTranscript(jsonl([{ type: 'user', timestamp: at(0) }])).cacheReads, null)
})

test('the Cache reads line carries its unit on every figure, and its total holds the run overhead', () => {
  const journal = jsonl([started('refresh+select:1', 's1'), started('worker:CR-1', 'w1'), started('review:CR-1', 'r1'), started('release-list:cr', 'o1')])
  const t = {
    s1: transcript(0, 5, usage(1, 1, 0, 700)),
    w1: transcript(10, 100, usage(0, 10, 90, 4_812_330)),
    r1: transcript(110, 150, usage(0, 5, 45, 911_204)),
    o1: transcript(160, 170, usage(0, 1, 9, 88_120)),
  }
  const r = meter(journal, (id) => t[id])
  assert.equal(cacheReadsLine(r), '**Cache reads:** CR-1 worker=4812330r reviewer=911204r proxies=700r; total=5812354r')
  assert.equal(r.totalCacheReads, 4_812_330 + 911_204 + 700 + 88_120, 'the release-list step belongs to no ticket and is still in the total')
  // The `r` is the wall: no figure on this line can be read as a token count.
  for (const m of cacheReadsLine(r).matchAll(/=(\S+?)(?=[;\s]|$)/g)) assert.match(m[1], /^(\d+r|unknown)$/, m[0])
  assert.doesNotMatch(cacheReadsLine(r), /,/, 'no thousands separators: `1,430s` is what `spend` once read as `1`')
})

test('models are the distinct names in order of first use, and <synthetic> is not one', () => {
  const text = jsonl([
    says(0, 'claude-opus-5'),
    says(1, 'claude-opus-5'), // the same message, streamed as a second line
    says(2, '<synthetic>', 'msg_2'), // injected by the harness; no model ran it
    says(3, 'claude-fable-5-1', 'msg_3'),
    says(4, 'claude-opus-5', 'msg_4'),
  ])
  assert.deepEqual(readTranscript(text).models, ['claude-opus-5', 'claude-fable-5-1'])
})

test('a model name outside the safe charset is no observation', () => {
  // A name with a space or a `;` would be read in the record as a second pair
  // or as the end of the group, so it is not printed at all — and one that
  // opens with a digit would be read there as a FIGURE, which is the one
  // wrong reading that changes a token count.
  assert.deepEqual(readTranscript(jsonl([says(0, 'claude opus 5')])).models, [])
  assert.deepEqual(readTranscript(jsonl([says(0, 'claude-opus-5;x')])).models, [])
  assert.deepEqual(readTranscript(jsonl([says(0, '5')])).models, [])
  assert.deepEqual(readTranscript(jsonl([says(0, '12r')])).models, [])
  // …and one that ends in punctuation would be read back with the
  // punctuation, which is a name nobody ran. A dot INSIDE a name is fine.
  assert.deepEqual(readTranscript(jsonl([says(0, 'claude-opus-5.')])).models, [])
  assert.deepEqual(readTranscript(jsonl([says(0, 'claude-fable-5.1')])).models, ['claude-fable-5.1'])
})

test("a role's models are its agents' union, in first-use order, joined by +", () => {
  const journal = jsonl([started('worker:M-1', 'w1'), started('worker:M-1:retry', 'w2'), started('review:M-1', 'r1')])
  const t = {
    w1: jsonl([says(0, 'claude-opus-5')]),
    w2: jsonl([says(10, 'claude-fable-5-1', 'msg_2'), says(11, 'claude-opus-5', 'msg_3')]),
    r1: jsonl([says(20, 'claude-fable-5-1', 'msg_4')]),
  }
  const r = meter(journal, (id) => t[id])
  assert.equal(modelsLine(r), '**Models:** M-1 worker=claude-opus-5+claude-fable-5-1 reviewer=claude-fable-5-1')
})

test('a role with no model observed anywhere reads unknown, and a run with no ticket names none', () => {
  const journal = jsonl([started('worker:M-2', 'w1'), started('review:M-2', 'r1')])
  const t = { w1: transcript(0, 10, usage(0, 1, 9)), r1: null }
  const r = meter(journal, (id) => t[id])
  assert.equal(modelsLine(r), '**Models:** M-2 worker=unknown reviewer=unknown')
  assert.equal(modelsLine(meter(jsonl([started('refresh+select:1', 's')]), () => transcript(0, 5, usage(0, 1, 9)))), '**Models:** none — no ticket ran')
})

// The runner is started by a tool USE, and that command is what says the
// runner ran here — `--wait` prints the report the model is read from. This
// is `run-epic.mjs`'s own `runnerBase`, copied, with its two quoted paths
// filled in: both are `${CLAUDE_PLUGIN_ROOT}` and the repository, and both
// are wherever the person keeps their files — a home directory with a space
// in it is ordinary, and a pattern that could not cross one read a real
// Codex worker as its proxy's haiku.
const runnerBase = (pluginRoot, root, id = 'CX-1') =>
  `node "${pluginRoot}/scripts/runners/codex.mjs" ${id} --epic cx --epic-branch epic/cx --default-branch main --repo "${root}" --plugin "${pluginRoot}" --label worker:${id} --wave --timeout 3600000 --json`
const PLAIN_ROOT = '/Users/x/.claude/plugins/ticket-flow/plugins/flow'
const SPACED_ROOT = '/Users/John Smith/.claude/plugins/ticket flow/plugins/flow'
const RUNNER_CMD = `${runnerBase(PLAIN_ROOT, '/Users/x/repo')} --start`
const toolUse = (s, command, model = 'claude-haiku-4-5') => ({
  type: 'assistant',
  timestamp: at(s),
  message: { id: `use_${s}`, model, usage: usage(0, 1, 0), content: [{ type: 'tool_use', id: 'toolu_1', name: 'Bash', input: { command } }] },
})
// A worker proxy's transcript: its own haiku lines, the runner's command, and
// what the command printed.
const proxy = (printed, command = RUNNER_CMD) => jsonl([says(0, 'claude-haiku-4-5'), toolUse(5, command), toolResult(10, printed), says(20, 'claude-haiku-4-5', 'msg_2')])
const asWorker = (text, ticket = 'CX-1') => readTranscript(text, { proxyTicket: ticket })

test("a Codex worker's model is the runner's, not its shell proxy's", () => {
  // The `worker:<ID>` agent here is a haiku proxy that starts the runner and
  // relays what it printed; the model that wrote the ticket is inside that
  // JSON, which reaches the transcript as the shell call's result.
  assert.deepEqual(asWorker(proxy(codexReport('gpt-5-codex'))).models, ['codex:gpt-5-codex'])
  // Surrounded by whatever else the shell wrote, and after a `--start` that
  // named no runner: still found, still the only model reported.
  const noisy = `$ node codex.mjs CX-1 --start\n{\n  "state": "started",\n  "attempt": 1\n}\n${codexReport('gpt-5-codex')}\ndone\n`
  assert.deepEqual(asWorker(proxy(noisy)).models, ['codex:gpt-5-codex'])
  // An odd `"` in the shell's own output used to desynchronise a scan that
  // ran from the top of the blob: every brace after it read as string
  // content, and the report went missing. Each candidate is scanned from
  // itself now.
  const desynced = `bash: unexpected " near token\n${codexReport('gpt-5-codex')}\n`
  assert.deepEqual(asWorker(proxy(desynced)).models, ['codex:gpt-5-codex'])
  // …and one level deeper than expected is still the runner's report.
  assert.deepEqual(asWorker(proxy(JSON.stringify({ stdout: JSON.parse(codexReport('gpt-5-codex')) }, null, 2))).models, ['codex:gpt-5-codex'])
})

test('a codex report is only a model substitution in the agent the runner ran in', () => {
  // A merge or verify step that reads the runner's log prints the same JSON,
  // and its own model is the one that did its work.
  const text = proxy(codexReport('gpt-5-codex'))
  assert.deepEqual(readTranscript(text).models, ['claude-haiku-4-5'], 'no proxy role: the agent keeps its own model')
  const journal = jsonl([started('worker:CX-1', 'w'), started('merge:CX-1', 'm')])
  const r = meter(journal, () => text)
  assert.deepEqual(r.tickets[0].models, { worker: 'codex:gpt-5-codex', proxies: 'claude-haiku-4-5' })
})

test('a codex run whose report says nothing usable is unknown, never the proxy\'s own model', () => {
  // The command proves the runner ran, so the proxy's haiku is the one model
  // that certainly did not write this ticket.
  assert.deepEqual(asWorker(proxy('{"ticket": "CX-1", "runner": {"name": "codex", "model": "gpt-5-cod')).models, [], 'truncated')
  assert.deepEqual(asWorker(proxy('killed after 600000 ms')).models, [], 'nothing printed at all')
  assert.deepEqual(asWorker(proxy(codexReport('gpt 5 codex'))).models, [], 'a name that cannot be written machine-shaped')
  assert.deepEqual(asWorker(proxy(codexReport('5'))).models, [], 'a name that would read as a figure')
  // `default` is the runner's placeholder for "whatever Codex is configured
  // to use" — a name nobody ran, so it is no observation either.
  assert.deepEqual(asWorker(proxy(codexReport('default'))).models, [])
  const journal = jsonl([started('worker:CX-1', 'w1')])
  assert.equal(modelsLine(meter(journal, () => proxy(codexReport('default')))), '**Models:** CX-1 worker=unknown')
})

test('reading the runner\'s file is not running it, and another ticket\'s report is not this one\'s', () => {
  // A Claude worker that greps or opens the plugin's own source must keep its
  // model: a substring test over every tool input reported `unknown` for a
  // ticket whose worker had merely read the repository.
  const report = codexReport('gpt-5-codex')
  for (const command of [
    'grep -n "runner" /p/plugins/flow/scripts/runners/codex.mjs',
    'cat /p/plugins/flow/scripts/runners/codex.mjs',
    'git log -1 -- plugins/flow/scripts/runners/codex.mjs',
    'ls plugins/flow/scripts/runners/',
    'grep node plugins/flow/scripts/runners/codex.mjs',
  ])
    assert.deepEqual(asWorker(jsonl([says(0, 'claude-opus-5'), toolUse(5, command, 'claude-opus-5'), toolResult(10, report)])).models, ['claude-opus-5'], command)
  // Node flags that take the script and do NOT run it: a syntax check is not
  // a run, and a worker that checked the plugin keeps its own model.
  for (const command of ['node --check /p/scripts/runners/codex.mjs', 'node -c /p/scripts/runners/codex.mjs', 'node --test /p/scripts/runners/codex.mjs'])
    assert.deepEqual(asWorker(jsonl([says(0, 'claude-opus-5'), toolUse(5, command, 'claude-opus-5'), toolResult(10, report)])).models, ['claude-opus-5'], command)
  // …while a flag that does not stop the script running is still a run.
  assert.deepEqual(asWorker(proxy(report, 'node --experimental-vm-modules /p/scripts/runners/codex.mjs CX-1 --json --wait')).models, ['codex:gpt-5-codex'])
  // The Read tool carries a path, not a command, so it cannot look like one.
  const readTool = { type: 'assistant', timestamp: at(5), message: { id: 'r1', model: 'claude-opus-5', usage: usage(0, 1, 0), content: [{ type: 'tool_use', id: 't', name: 'Read', input: { file_path: '/p/plugins/flow/scripts/runners/codex.mjs' } }] } }
  assert.deepEqual(asWorker(jsonl([says(0, 'claude-opus-5'), readTool, toolResult(10, report)])).models, ['claude-opus-5'])
  // A real invocation, in every shape the driver's proxy prompt produces —
  // including the two-step `--start` then `--wait`, since the report arrives
  // on whichever call prints it, and paths with spaces in them.
  const spaced = runnerBase(SPACED_ROOT, '/Users/John Smith/my repo')
  for (const command of [
    RUNNER_CMD,
    `${runnerBase(PLAIN_ROOT, '/Users/x/repo')} --wait --max-wait 540000`,
    `${spaced} --start`,
    `${spaced} --wait --max-wait 540000`,
    `${spaced} --cancel`,
    `${runnerBase(PLAIN_ROOT, '/Users/John Smith/my repo')} --wait --max-wait 540000`,
    "node '/Users/John Smith/plugins/flow/scripts/runners/codex.mjs' CX-1 --json --start",
    'cd /r && node /p/scripts/runners/codex.mjs CX-1 --cancel --json',
    '"/usr/local/bin/node" "/p/scripts/runners/codex.mjs" CX-1 --json --wait',
  ])
    assert.deepEqual(asWorker(proxy(report, command)).models, ['codex:gpt-5-codex'], command)
  // The two-step as the proxy actually runs it: the start prints a state
  // object with no runner, the wait prints the report.
  const twoStep = jsonl([
    says(0, 'claude-haiku-4-5'),
    toolUse(5, `${spaced} --start`),
    toolResult(10, JSON.stringify({ state: 'started', ticket: 'CX-1', attempt: 1 }, null, 2)),
    toolUse(15, `${spaced} --wait --max-wait 540000`),
    toolResult(600, JSON.stringify({ state: 'pending', ticket: 'CX-1' }, null, 2)),
    toolUse(610, `${spaced} --wait --max-wait 540000`),
    toolResult(1200, report),
  ])
  assert.deepEqual(asWorker(twoStep).models, ['codex:gpt-5-codex'])
  // And a report the proxy read in passing for ANOTHER ticket answers for
  // nothing here — the runner's state directory is per ticket.
  assert.deepEqual(asWorker(proxy(report), 'CX-2').models, [], "the runner ran, and its report is not this ticket's")
  assert.deepEqual(readTranscript(proxy(report)).models, ['claude-haiku-4-5'], 'and with no proxy role at all, the agent keeps its own model')
})

test('the brace scan is bounded, so a blob of braces cannot hang the meter', () => {
  // 2,000 lines of 60 open braces and a `"runner"` key each took 20 seconds
  // when the only bound was per occurrence. The budget is global now: the
  // report is simply not found, which for a proven runner run reads unknown.
  const nasty = Array.from({ length: 2000 }, () => `${'{'.repeat(60)} "runner": 1 `).join('\n')
  const started = Date.now()
  const t = asWorker(proxy(nasty))
  const ms = Date.now() - started
  assert.deepEqual(t.models, [], 'the runner ran and nothing readable came back')
  assert.ok(ms < 2000, `the bounded scan took ${ms}ms`)
})

test('anything short of a codex runner object leaves the proxy its own model', () => {
  // No runner command in this agent: whatever the JSON says, nothing here
  // substituted a model, and the transcript's own is what ran.
  const noRunner = (text) => jsonl([says(0, 'claude-haiku-4-5'), toolUse(5, 'git log -1'), toolResult(10, text)])
  assert.deepEqual(asWorker(noRunner('{"runner": broken')).models, ['claude-haiku-4-5'], 'unparseable')
  assert.deepEqual(asWorker(noRunner(JSON.stringify({ runner: { name: 'claude', model: 'x-1' } }))).models, ['claude-haiku-4-5'], 'another runner')
  assert.deepEqual(asWorker(noRunner(JSON.stringify({ runner: { name: 'codex', model: 5 } }))).models, ['claude-haiku-4-5'], 'no model string')
  assert.deepEqual(asWorker(noRunner('runner name codex model gpt-5-codex')).models, ['claude-haiku-4-5'], 'prose')
  // A codex report in the proxy's own MESSAGE is a model's account of the
  // runner's output; only the tool result is the runner's own.
  const relayed = jsonl([says(0, 'claude-haiku-4-5'), { type: 'assistant', timestamp: at(10), message: { id: 'msg_2', model: 'claude-haiku-4-5', usage: usage(0, 1, 0), content: [{ type: 'text', text: codexReport('gpt-5-codex') }] } }])
  assert.deepEqual(asWorker(relayed).models, ['claude-haiku-4-5'])
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

// The same run, with the two transcripts the CLI test reads for models and
// cache reads: a Codex worker (a haiku proxy whose tool result carries the
// runner's report) and a reviewer on its own model. The figures and the
// timestamps are RUN's, so every other assertion about this run still holds.
const MODELLED = {
  journal: RUN.journal,
  transcripts: {
    ...RUN.transcripts,
    w2: jsonl([
      { type: 'user', timestamp: at(30) },
      { type: 'assistant', timestamp: at(100), message: { id: 'use_1', model: 'claude-haiku-4-5', content: [{ type: 'tool_use', id: 'toolu_1', name: 'Bash', input: { command: 'node "/p/scripts/runners/codex.mjs" FND-2 --wait --json' } }] } },
      toolResult(500, codexReport('gpt-5-codex', {}, 'FND-2')),
      says(1030, 'claude-haiku-4-5', 'msg_1', usage(0, 50_000, 150_000, 900_000)),
    ]),
    r2: jsonl([{ type: 'user', timestamp: at(1060) }, says(1360, 'claude-fable-5-1', 'msg_1', usage(0, 10_000, 90_000, 400_000))]),
  },
}

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
  // Cache reads follow the same rule, for the same reason: a partial sum
  // would read as the role's and be silently low.
  assert.equal(t3.cacheReads.reviewer, null)
  assert.equal(t3.cacheReads.worker, 0)
  assert.match(cacheReadsLine(meter(RUN.journal, read(run))), /FND-3 worker=0r reviewer=unknown/)
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

test('CLI: prints all five lines and one row per agent; --json carries the same lines', () => {
  const dir = runDir(MODELLED)
  try {
    const out = execFileSync('node', [METER, dir], { encoding: 'utf8' })
    assert.match(out, /^\*\*Tokens:\*\* FND-2 worker=200,000/m)
    assert.match(out, /^\*\*Time:\*\* FND-2 worker=1000s/m)
    assert.match(out, /^\*\*Cache reads:\*\* FND-2 worker=900000r /m)
    assert.match(out, /^\*\*Models:\*\* FND-2 worker=codex:gpt-5-codex reviewer=claude-fable-5-1/m)
    assert.match(out, /worker:FND-2 — 200,000 tokens .*1000s — codex:gpt-5-codex/)
    assert.match(out, /cache reads 900,000, on the Cache reads line and not in this sum/)
    assert.match(out, /run overhead/)
    const json = JSON.parse(execFileSync('node', [METER, dir, '--json'], { encoding: 'utf8' }))
    assert.equal(json.tickets[0].wall, 1600)
    assert.match(json.timeLine, /^\*\*Time:\*\* FND-2 worker=1000s .* wall=1600s; FND-3 .*; run=2470s$/)
    assert.match(json.cacheReadsLine, /^\*\*Cache reads:\*\* FND-2 .*; total=\d+r$/)
    assert.match(json.modelsLine, /^\*\*Models:\*\* FND-2 worker=codex:gpt-5-codex /)
    assert.equal(json.tickets[0].models.worker, 'codex:gpt-5-codex')
    assert.equal(json.tickets[0].cacheReads.worker, 900_000)
    assert.deepEqual(json.overhead.map((a) => [a.label, a.role, a.failed]), [['refresh+select:3', 'proxies', true]])
    assert.deepEqual(json.tickets[0].agents[1].models, ['codex:gpt-5-codex'], 'the per-agent models are in --json for the record’s prose')
    // FND-2's worker is a Codex shell proxy: its model is `codex:…` and its
    // peak is therefore `unknown` — the window the transcript exposes is the
    // proxy's, and a peak names a model. The reviewer's figure beside it is a
    // real Claude agent's and is reported.
    assert.match(out, /^\*\*Peak context:\*\* FND-2 worker=unknown reviewer=\d+c/m)
    assert.match(json.peakLine, /^\*\*Peak context:\*\* FND-2 worker=unknown reviewer=\d+c/)
    assert.deepEqual(Object.keys(json.tickets[0].agents[1]).sort(), ['agentId', 'cacheReads', 'failed', 'label', 'models', 'parts', 'peak', 'role', 'seconds', 'tokens', 'transcript'])
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

// ── peak context ─────────────────────────────────────────────────────────────
// The fifth line, and the only counting ledger that is a MAX. Everything here
// is built in the test, like every shape above it: no real transcript.

test('peak: the largest window one agent ever held, not the sum of its messages', () => {
  // Three messages of one agent — the same conversation, seen three times.
  // The window is input + cache reads + cache creation; output is left out,
  // because it was not in what the model was given to read.
  const t = readTranscript(
    jsonl([
      { type: 'assistant', timestamp: at(0), message: { id: 'a', usage: usage(100, 500, 2_000, 10_000) } },
      { type: 'assistant', timestamp: at(1), message: { id: 'b', usage: usage(50, 900, 1_000, 180_000) } },
      { type: 'assistant', timestamp: at(2), message: { id: 'c', usage: usage(10, 40, 0, 90_000) } },
    ]),
  )
  assert.equal(t.peak, 50 + 1_000 + 180_000, 'the largest single window')
  assert.notEqual(t.peak, 12_100 + 181_050 + 90_010, 'and never their sum')
  assert.equal(t.tokens, 100 + 500 + 2_000 + 50 + 900 + 1_000 + 10 + 40, 'the token sum is untouched by this')
})

test('peak: a message streamed as several lines peaks once', () => {
  const u = usage(10, 200, 3_000, 900_000)
  const t = readTranscript(jsonl([{ type: 'assistant', timestamp: at(0), message: { id: 'm', usage: u } }, { type: 'assistant', timestamp: at(1), message: { id: 'm', usage: u } }]))
  assert.equal(t.peak, 903_010)
})

test('peak: a transcript that exposed no usage has none — unknown, never zero', () => {
  assert.equal(readTranscript(jsonl([{ type: 'assistant', timestamp: at(0), message: { id: 'x' } }])).peak, null)
  assert.equal(readTranscript('').peak, null)
})

test('peak: a role with two agents takes the larger, never the sum; one unseen makes it unknown', () => {
  const journal = jsonl([started('worker:PK-1', 'w1'), started('worker:PK-1', 'w2'), started('review:PK-1', 'r1'), started('review:PK-1', 'r2')])
  const texts = {
    w1: transcript(0, 10, usage(100, 10, 0, 40_000)),
    w2: transcript(10, 20, usage(100, 10, 0, 120_000)),
    r1: transcript(20, 30, usage(5, 5, 0, 7_000)),
    r2: null, // this one's transcript is gone
  }
  const r = meter(journal, (id) => texts[id])
  const t = r.tickets[0]
  assert.equal(t.peak.worker, 120_100, 'the larger of the two, not 160,200')
  assert.equal(t.peak.reviewer, null, 'a role with an unobserved agent could only read LOW, so it reads unknown')
  assert.equal(t.tokens.worker, 220, 'and the token sum still sums')
  assert.match(peakLine(r), /^\*\*Peak context:\*\* PK-1 worker=120100c reviewer=unknown$/)
})

test('peak: the line carries no total, and an idle run says so', () => {
  const r = meter(jsonl([started('refresh+select:1', 's1')]), () => transcript(0, 5, usage(1, 1, 1)))
  assert.equal(peakLine(r), '**Peak context:** none — no ticket ran')
  assert.doesNotMatch(peakLine(r), /total=/, 'a max has no sum, so the line never carries one')
})

test('peak: every figure carries its `c`, and no figure carries a comma', () => {
  const journal = jsonl([started('worker:PK-2', 'w1')])
  const r = meter(journal, () => transcript(0, 10, usage(1_204_331, 0, 0, 0)))
  const line = peakLine(r)
  assert.match(line, /worker=1204331c/, 'machine-shaped: `tickets.mjs` reads `\\d+c` and 1,204,331c parses as nothing')
  assert.doesNotMatch(line, /1,204,331/)
})

test('peak: a Codex worker has none — the window the proxy exposed is the proxy\'s, and a peak names a model', () => {
  // The repro exactly: a shell proxy whose own messages peak at 302,000, and
  // a real runner invocation in its tool calls. Its MODEL is the runner's; its
  // window is not, so reporting 302,000c under `codex:gpt-5-codex` would say
  // a Codex agent came that close to its limit, which nothing here observed.
  const proxy = jsonl([
    { type: 'assistant', timestamp: at(0), message: { id: 'u1', model: 'claude-haiku-4-5', content: [{ type: 'tool_use', id: 'toolu_1', name: 'Bash', input: { command: 'node "/p/scripts/runners/codex.mjs" CX-1 --wait --json' } }] } },
    toolResult(10, codexReport('gpt-5-codex', {}, 'CX-1')),
    says(20, 'claude-haiku-4-5', 'msg_1', usage(2_000, 500, 100_000, 200_000)),
  ])
  const t = readTranscript(proxy, { proxyTicket: 'CX-1' })
  assert.deepEqual(t.models, ['codex:gpt-5-codex'])
  assert.equal(t.peak, null, 'not 302,000 — unknown, the same answer an unreadable report gives')
  assert.equal(t.tokens, 2_000 + 500 + 100_000, 'tokens stay: they are the proxy\'s real cost, paid by this run')
  assert.equal(t.cacheReads, 200_000, 'and so are the cache reads')
  // The same transcript WITHOUT the invocation is an ordinary Claude agent,
  // and its window is its own: one condition gates both fields, in one place.
  const claude = readTranscript(jsonl([says(20, 'claude-opus-5', 'msg_1', usage(2_000, 500, 100_000, 200_000))]))
  assert.deepEqual([claude.models, claude.peak], [['claude-opus-5'], 302_000])
  const r = meter(jsonl([started('worker:CX-1', 'w1')]), () => proxy)
  assert.equal(peakLine(r), '**Peak context:** CX-1 worker=unknown')
  assert.match(modelsLine(r), /worker=codex:gpt-5-codex/)
})

test('peak/models: a runner path that is printed, backed up or grepped is not a runner that ran', () => {
  // Each of these costs a CLAUDE worker its model and its peak if the command
  // is read as an invocation — the proxy substitution replaces both.
  const claudeUsage = usage(2_000, 500, 100_000, 200_000)
  const ran = (command) => {
    const t = readTranscript(
      jsonl([
        { type: 'assistant', timestamp: at(0), message: { id: 'u1', model: 'claude-opus-5', content: [{ type: 'tool_use', id: 'toolu_1', name: 'Bash', input: { command } }] } },
        says(20, 'claude-opus-5', 'msg_1', claudeUsage),
      ]),
      { proxyTicket: 'CX-1' },
    )
    return { models: t.models, peak: t.peak }
  }
  const worked = { models: ['claude-opus-5'], peak: 302_000 }
  // A heredoc BODY is data the shell writes, not a command it runs — and the
  // pattern anchors at the start of any line, because a real command may be
  // continued across several.
  assert.deepEqual(ran('cat <<EOF\nnode "/p/scripts/runners/codex.mjs" CX-1 --json\nEOF'), worked)
  assert.deepEqual(ran('cat <<-\'END\'\nnode /p/scripts/runners/codex.mjs CX-1 --json\nEND\necho done'), worked)
  // A path that merely STARTS with the runner's is another file.
  assert.deepEqual(ran('node /p/scripts/runners/codex.mjs.backup CX-1 --json'), worked)
  // The cases that already behaved, kept.
  assert.deepEqual(ran('grep -n runner /p/scripts/runners/codex.mjs'), worked)
  assert.deepEqual(ran("echo 'node /p/scripts/runners/codex.mjs CX-1 --json'"), worked)
  assert.deepEqual(ran('node --check /p/scripts/runners/codex.mjs'), worked)
  // DELIBERATE, pinned so it is not "fixed" back into the bug above: a wrapped
  // `bash -c "…"` reads as not-an-invocation, because quoted text is not
  // executed text. The driver's proxy prompt spells the command unquoted, so
  // no lane here produces this shape; the alternative — treating quoted text
  // as executed — is exactly what erased a Claude worker's model for printing
  // the path.
  assert.deepEqual(ran('bash -c "node /p/scripts/runners/codex.mjs CX-1 --start --json"'), worked)
  // …and a real invocation still substitutes, quoted path with a space and all.
  const real = ran('node "/Users/a b/plugins/flow/scripts/runners/codex.mjs" CX-1 --wait --json')
  assert.deepEqual([real.models, real.peak], [[], null], 'the runner ran: no readable report, so no model — and no peak, which was the proxy\'s')
})
