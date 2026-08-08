#!/usr/bin/env node
// One interactive ticket per session — the guard behind /flow:ticket's lanes.
//
// An interactive /flow:ticket run leaves its context in the session, and a
// second ticket implemented on that context defeats the fresh-context rule
// the supervisor mode exists for. This hook makes the rule mechanical
// instead of remembered: `/flow:ticket <ID> --interactive` drops a marker
// keyed to the session; a later `--interactive` invocation in the same
// session is refused (exit 2 blocks the prompt; stderr carries the message).
// Supervisor-mode invocations pass even in a marked session — their workers
// start empty, which is the property this rule protects, so blocking them
// would refuse the very recovery the refusal recommends.
//
// The marker's lifetime follows the context it describes: SessionStart with
// source "clear" or "startup" wipes it (the context is gone), while
// "resume"/"compact" keep it (the context survives). Session ids are not
// guaranteed to rotate on /clear, so the reset is keyed to the event, never
// to id rotation.
//
// Zero dependencies, no state beyond one marker file per session in the OS
// temp dir — it dies with the machine's tmp cleanup, the correct lifetime
// for a fact about a conversation.
import { existsSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

const REFUSAL =
  'this session already ran a ticket interactively and carries its context — run /flow:ticket without --interactive (supervisor mode: a fresh worker implements), or /clear to reset the session.'

let data
try {
  data = JSON.parse(readFileSync(0, 'utf8'))
} catch {
  process.exit(0) // no parseable input — never block on our own failure
}

const sessionId = String(data.session_id ?? '')
if (!sessionId) process.exit(0) // the marker is keyed by session; nothing coherent to guard

const marker = join(tmpdir(), `flow-interactive-${sessionId}`)

if (String(data.hook_event_name ?? '') === 'SessionStart') {
  const source = String(data.source ?? '')
  // "clear"/"startup" mean the conversational context is gone; the marker
  // describing it must go too. "resume" and "compact" carry the context on.
  if (source === 'clear' || source === 'startup') {
    try {
      rmSync(marker, { force: true })
    } catch {}
  }
  process.exit(0)
}

const prompt = String(data.prompt ?? '')
if (!/^\s*\/flow:ticket\b/.test(prompt)) process.exit(0)

const interactive = /\s--interactive\b/.test(prompt)

if (existsSync(marker)) {
  if (interactive) {
    console.error(REFUSAL)
    process.exit(2)
  }
  process.exit(0) // supervisor lane: the worker starts empty; the mark is irrelevant to it
}

if (interactive) {
  // Marked at invocation, not completion: the context contamination begins
  // the moment the ticket starts, not when it succeeds.
  try {
    writeFileSync(marker, `${prompt.trim()}\n`)
  } catch {
    // A marker that cannot be written must not block the run it guards.
  }
}

process.exit(0)
