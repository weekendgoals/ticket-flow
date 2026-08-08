// Tests for the one-interactive-ticket-per-session guard. Each case pipes a
// UserPromptSubmit-shaped JSON payload into the script and asserts on exit
// code, stderr, and the marker file — the same three surfaces Claude Code
// sees. Session ids are unique per test so cases cannot contaminate each
// other or a real session.
import { strict as assert } from 'node:assert'
import { spawnSync } from 'node:child_process'
import { existsSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import test from 'node:test'

const SCRIPT = join(dirname(fileURLToPath(import.meta.url)), 'ticket-session-guard.mjs')
const REFUSAL = "this session already carries a ticket's context"

const run = (payload) =>
  spawnSync(process.execPath, [SCRIPT], { input: JSON.stringify(payload), encoding: 'utf8' })

const sid = (name) => `guard-test-${name}-${process.pid}`
const markerOf = (sessionId) => join(tmpdir(), `flow-interactive-${sessionId}`)
const cleanup = (sessionId) => rmSync(markerOf(sessionId), { force: true })

test('non-ticket prompts pass through untouched', () => {
  const s = sid('other')
  cleanup(s)
  const r = run({ session_id: s, prompt: '/flow:tickets' })
  assert.equal(r.status, 0)
  assert.equal(existsSync(markerOf(s)), false)
  cleanup(s)
})

test('a supervisor-mode invocation passes and sets no marker', () => {
  const s = sid('supervisor')
  cleanup(s)
  const r = run({ session_id: s, prompt: '/flow:ticket SEC-3' })
  assert.equal(r.status, 0)
  assert.equal(existsSync(markerOf(s)), false)
  const again = run({ session_id: s, prompt: '/flow:ticket SEC-4' })
  assert.equal(again.status, 0, 'any number of supervisor runs per session')
  cleanup(s)
})

test('an interactive invocation passes and drops the session marker', () => {
  const s = sid('interactive')
  cleanup(s)
  const r = run({ session_id: s, prompt: '/flow:ticket SEC-3 --interactive' })
  assert.equal(r.status, 0, 'the first interactive run is allowed')
  assert.equal(existsSync(markerOf(s)), true, 'marker recorded at invocation')
  cleanup(s)
})

test('any /flow:ticket after an interactive run is refused with the documented message', () => {
  const s = sid('refusal')
  cleanup(s)
  run({ session_id: s, prompt: '/flow:ticket SEC-3 --interactive' })
  for (const prompt of ['/flow:ticket SEC-4', '/flow:ticket SEC-4 --interactive']) {
    const r = run({ session_id: s, prompt })
    assert.equal(r.status, 2, `${prompt} must be blocked`)
    assert.ok(r.stderr.includes(REFUSAL), 'stderr carries the documented refusal')
  }
  cleanup(s)
})

test('a different session is unaffected by another session marker', () => {
  const marked = sid('marked')
  const clean = sid('clean')
  cleanup(marked)
  cleanup(clean)
  run({ session_id: marked, prompt: '/flow:ticket SEC-3 --interactive' })
  const r = run({ session_id: clean, prompt: '/flow:ticket SEC-4' })
  assert.equal(r.status, 0)
  cleanup(marked)
  cleanup(clean)
})

test('garbage or missing input never blocks', () => {
  const noJson = spawnSync(process.execPath, [SCRIPT], { input: 'not json', encoding: 'utf8' })
  assert.equal(noJson.status, 0)
  const noSession = run({ prompt: '/flow:ticket SEC-3 --interactive' })
  assert.equal(noSession.status, 0)
})
