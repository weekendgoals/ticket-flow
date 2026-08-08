#!/usr/bin/env node
// UserPromptSubmit guard: one interactive ticket per session.
//
// An interactive /flow:ticket run leaves its context in the session, and a
// second ticket built on that context defeats the fresh-context rule the
// supervisor mode exists for. This hook makes the rule mechanical instead of
// remembered: invoking `/flow:ticket <ID> --interactive` drops a marker
// keyed to the session; ANY later /flow:ticket in the same session is then
// refused (exit 2 blocks the prompt; stderr carries the message). Supervisor
// runs set no marker — their workers start empty, so any number of tickets
// per session is legitimate.
//
// Zero dependencies, no state beyond one marker file per session in the OS
// temp dir — it dies with the machine's tmp cleanup, which is the correct
// lifetime for a fact about a session.
import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

const REFUSAL =
  "this session already carries a ticket's context — /clear first, or use the default supervisor mode."

let data
try {
  data = JSON.parse(readFileSync(0, 'utf8'))
} catch {
  process.exit(0) // no parseable input — never block on our own failure
}

const prompt = String(data.prompt ?? '')
const sessionId = String(data.session_id ?? '')
// Only /flow:ticket invocations concern this guard. Session id is the marker
// key; without one there is nothing coherent to guard.
if (!sessionId || !/^\s*\/flow:ticket\b/.test(prompt)) process.exit(0)

const marker = join(tmpdir(), `flow-interactive-${sessionId}`)

if (existsSync(marker)) {
  console.error(REFUSAL)
  process.exit(2)
}

if (/\s--interactive\b/.test(prompt)) {
  // Marked at invocation, not completion: the context contamination begins
  // the moment the ticket starts, not when it succeeds.
  try {
    writeFileSync(marker, `${prompt.trim()}\n`)
  } catch {
    // A marker that cannot be written must not block the run it guards.
  }
}

process.exit(0)
