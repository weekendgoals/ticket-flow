// Tests for the in-session-implementation guard. Each case pipes a
// hook-shaped JSON payload into the script and asserts on exit code, stderr,
// and the marker file — the same three surfaces Claude Code sees. Session
// ids are unique per test so cases cannot contaminate each other or a real
// session, and every case registers cleanup up front so a failing assertion
// cannot leak markers into tmpdir.
import { strict as assert } from 'node:assert'
import { spawnSync } from 'node:child_process'
import { existsSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import test from 'node:test'

const SCRIPT = join(dirname(fileURLToPath(import.meta.url)), 'ticket-session-guard.mjs')
const REFUSAL =
  'this session already carries in-session implementation context (an interactive ticket or a quick ticket ran here) — rerun the command without --interactive (supervisor mode: a fresh worker implements), or /clear to reset the session.'

const run = (payload) =>
  spawnSync(process.execPath, [SCRIPT], { input: JSON.stringify(payload), encoding: 'utf8' })

const sid = (name) => `guard-test-${name}-${process.pid}`
const markerOf = (sessionId) => join(tmpdir(), `flow-interactive-${sessionId}`)
const mark = (sessionId) =>
  run({ session_id: sessionId, prompt: '/flow:ticket SEC-1 --interactive' })

test('guard behaviours', async (t) => {
  const used = new Set()
  const fresh = (name) => {
    const s = sid(name)
    used.add(s)
    rmSync(markerOf(s), { force: true })
    return s
  }
  t.after(() => {
    for (const s of used) rmSync(markerOf(s), { force: true })
  })

  await t.test('non-guarded prompts pass even in a marked session', () => {
    const s = fresh('other')
    mark(s)
    for (const prompt of ['/flow:tickets', '/flow:epic auth', 'plain prose']) {
      const r = run({ session_id: s, prompt })
      assert.equal(r.status, 0, `${prompt} must pass through`)
    }
  })

  await t.test('every quick invocation marks the session — quick implements in-session by design', () => {
    const s = fresh('quick-marks')
    const r = run({ session_id: s, prompt: '/flow:quick fix the typo' })
    assert.equal(r.status, 0, 'quick is never refused')
    assert.equal(existsSync(markerOf(s)), true, 'a quick run contaminates the session and must say so')
  })

  await t.test('quick is never refused, even in a marked session, at any count', () => {
    const s = fresh('quick-repeat')
    mark(s)
    for (const prompt of ['/flow:quick fix a typo', '/flow:quick another thing', '/flow:quick a third --interactive']) {
      const r = run({ session_id: s, prompt })
      assert.equal(r.status, 0, `${prompt} must pass — quick's boundary is the reviewer and the PR, not a fresh implementer`)
    }
  })

  await t.test('after a quick, an interactive ticket in the same session is refused', () => {
    const s = fresh('quick-then-interactive')
    run({ session_id: s, prompt: '/flow:quick fix the typo' })
    const ticketI = run({ session_id: s, prompt: '/flow:ticket SEC-4 --interactive' })
    assert.equal(ticketI.status, 2, 'a quick-contaminated session refuses an interactive ticket')
    assert.equal(ticketI.stderr.trim(), REFUSAL, 'the documented refusal, verbatim')
    const ticketPlain = run({ session_id: s, prompt: '/flow:ticket SEC-4' })
    assert.equal(ticketPlain.status, 0, 'supervisor mode stays open — its worker starts empty')
  })

  await t.test('lookalike prompts never trip a marked session: sibling command, mid-sentence mention', () => {
    const s = fresh('lookalike')
    mark(s)
    const sibling = run({ session_id: s, prompt: '/flow:tickets --interactive' })
    assert.equal(sibling.status, 0, '/flow:tickets is neither guarded command — the \\b boundary holds')
    const midSentence = run({ session_id: s, prompt: 'explain what /flow:ticket SEC-1 --interactive would do' })
    assert.equal(midSentence.status, 0, 'a mention mid-prompt is not an invocation — the ^ anchor holds')
  })

  await t.test('supervisor invocations pass and set no marker', () => {
    const s = fresh('supervisor')
    const r = run({ session_id: s, prompt: '/flow:ticket SEC-3' })
    assert.equal(r.status, 0)
    assert.equal(existsSync(markerOf(s)), false)
    const again = run({ session_id: s, prompt: '/flow:ticket SEC-4' })
    assert.equal(again.status, 0, 'any number of supervisor runs per session')
  })

  await t.test('an interactive invocation passes and drops the session marker', () => {
    const s = fresh('interactive')
    const r = mark(s)
    assert.equal(r.status, 0, 'the first interactive run is allowed')
    assert.equal(existsSync(markerOf(s)), true, 'marker recorded at invocation')
  })

  await t.test('the word interactive without the flag is not the flag', () => {
    const s = fresh('flagless')
    const r = run({ session_id: s, prompt: '/flow:ticket SEC-3 interactive approach please' })
    assert.equal(r.status, 0)
    assert.equal(existsSync(markerOf(s)), false, 'no marker without a literal --interactive flag')
  })

  await t.test('a second --interactive ticket in a marked session is refused, verbatim message', () => {
    const s = fresh('refusal')
    mark(s)
    const r = run({ session_id: s, prompt: '/flow:ticket SEC-4 --interactive' })
    assert.equal(r.status, 2, 'the contaminated lane is blocked')
    assert.equal(r.stderr.trim(), REFUSAL, 'stderr carries the full documented refusal')
    assert.equal(r.stdout, '', 'nothing leaks onto stdout')
  })

  await t.test('a supervisor invocation in a marked session passes — the refusal advice works', () => {
    const s = fresh('recovery')
    mark(s)
    const r = run({ session_id: s, prompt: '/flow:ticket SEC-4' })
    assert.equal(r.status, 0, 'supervisor mode is the sanctioned recovery, never blocked')
  })

  await t.test('SessionStart clear/startup wipes the marker; resume/compact keep it', () => {
    const s = fresh('lifecycle')
    for (const source of ['resume', 'compact']) {
      mark(s)
      run({ session_id: s, hook_event_name: 'SessionStart', source })
      assert.equal(existsSync(markerOf(s)), true, `${source} carries the context, marker stays`)
      rmSync(markerOf(s), { force: true })
    }
    for (const source of ['clear', 'startup']) {
      mark(s)
      run({ session_id: s, hook_event_name: 'SessionStart', source })
      assert.equal(existsSync(markerOf(s)), false, `${source} wipes the context, marker goes`)
    }
    mark(s)
    const blocked = run({ session_id: s, prompt: '/flow:ticket SEC-5 --interactive' })
    assert.equal(blocked.status, 2)
    run({ session_id: s, hook_event_name: 'SessionStart', source: 'clear' })
    const after = run({ session_id: s, prompt: '/flow:ticket SEC-5 --interactive' })
    assert.equal(after.status, 0, 'after /clear the same session id may go interactive again')
  })

  await t.test('a different session is unaffected by another session marker', () => {
    const marked = fresh('marked')
    const clean = fresh('clean')
    mark(marked)
    const r = run({ session_id: clean, prompt: '/flow:ticket SEC-4 --interactive' })
    assert.equal(r.status, 0)
  })

  await t.test('garbage or missing input never blocks', () => {
    const noJson = spawnSync(process.execPath, [SCRIPT], { input: 'not json', encoding: 'utf8' })
    assert.equal(noJson.status, 0)
    const noSession = run({ prompt: '/flow:ticket SEC-3 --interactive' })
    assert.equal(noSession.status, 0)
  })
})
