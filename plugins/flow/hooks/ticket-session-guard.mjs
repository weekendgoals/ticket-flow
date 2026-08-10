#!/usr/bin/env node
// The guard behind the ticket loop's interactive lane. What it enforces,
// exactly: at most one /flow:ticket --interactive per session, and none
// after a /flow:quick has run in it. Nothing more — this is a mechanical
// backstop on the flow's own two doors, not a proof of a fresh session:
// direct development (work done outside any /flow:* command) contaminates
// a session invisibly to a prompt hook, and quick runs are unlimited by
// design. The property the flow actually relies on is enforced elsewhere
// and unconditionally — supervisor-mode workers start empty no matter what
// this session has seen. This hook only stops the one contamination path
// its two watched doors can see, mechanically instead of by memory.
//
// The two doors are treated differently because they are priced
// differently:
//
//   /flow:ticket --interactive — the escape hatch on the epic lane. The
//     first such run in a session is allowed and drops a marker keyed to
//     the session; a later --interactive run in the same session is
//     refused (exit 2 blocks the prompt; stderr carries the message).
//     Supervisor-mode invocations (no flag) pass even in a marked session —
//     their workers start empty, which is the property this rule protects,
//     so blocking them would refuse the very recovery the refusal
//     recommends.
//
//   /flow:quick — in-session by design (that is what makes it cheap), so it
//     is never refused, at any count; its epistemic boundary is the
//     fresh-context reviewer and the pull request, not a fresh implementer.
//     But it does contaminate the session, so every quick invocation drops
//     the same marker — after a quick, an --interactive ticket in the same
//     session is refused like after any other in-session run.
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
  'this session already carries in-session implementation context (an interactive ticket or a quick ticket ran here) — rerun the command without --interactive (supervisor mode: a fresh worker implements), or /clear to reset the session.'

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
const m = prompt.match(/^\s*\/flow:(ticket|quick)\b/)
if (!m) process.exit(0)

// The flag is recognized anywhere in the invocation — deliberate, pinned by
// Q-6's review: the skill reading the same prompt faces the same ambiguity,
// and the guard errs toward marking — a false positive costs one slot
// recoverable by /clear, a false negative silently defeats the rule.
const interactive = /\s--interactive\b/.test(prompt)

// Quick implements in-session by design: never refused, always marks.
const contaminates = m[1] === 'quick' || interactive

if (m[1] === 'ticket' && interactive && existsSync(marker)) {
  console.error(REFUSAL)
  process.exit(2)
}

if (contaminates && !existsSync(marker)) {
  // Marked at invocation, not completion: the context contamination begins
  // the moment the work starts, not when it succeeds.
  try {
    writeFileSync(marker, `${prompt.trim()}\n`)
  } catch {
    // A marker that cannot be written must not block the run it guards.
  }
}

process.exit(0)
