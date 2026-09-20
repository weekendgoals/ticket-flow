#!/usr/bin/env node
// meter.mjs — what an unattended run cost, in tokens and in time, read off the
// run's own transcripts.
//
//   meter.mjs <workflow-run-dir> [--json]
//
// <workflow-run-dir> is the directory the Workflow runtime persists a run
// under — `<session-dir>/subagents/workflows/<run-id>/` — holding
// `journal.jsonl` and one `agent-<id>.jsonl` per `agent()` call.
//
// The run driver cannot meter itself: a workflow script has no clock
// (`Date.now()` throws there) and no agent can see its own counter. What both
// figures have in common is that the harness wrote them down anyway — every
// transcript line carries a `timestamp`, every assistant message its `usage` —
// so this reads them afterwards, the way the run skill's step 6 used to ask a
// session to do by hand. A model summing a few hundred JSONL lines is the one
// place the ledger's arithmetic was not mechanical.
//
// Output is the run record's two machine-shaped lines, ready to paste:
//
//   **Tokens:** <ID> worker=<n> reviewer=<n> … ; total=<n>
//   **Time:** <ID> worker=<n>s reviewer=<n>s … wall=<n>s; run=<n>s
//
// and beneath them one line per agent, for the prose the record adds.
//
// Zero dependencies, stores nothing, and never estimates: a transcript that
// is missing or carries no figure reads `unknown`, because `unknown` is the
// absence of an observation and a guess would be a number nobody observed.

import { readFileSync, existsSync } from 'node:fs'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'

// The ledger's roles, in the order the run record writes them — the same list
// as `SPEND_ROLES` in tickets.mjs, which parses what this prints.
export const ROLES = ['worker', 'reviewer', 'disposition', 're-review', 'proxies']
const TICKET_ID = '[A-Z][A-Z0-9]*-\\d+'
// `worker:FND-2`, `re-review:FND-2`, `refresh+select:4:retry`. The driver's
// release check is spelled `release-check:<epic>:<ID>` so that it does NOT
// match: it runs after the loop, for every landed ticket, and filed under a
// ticket it stretched that ticket's wall to the end of the run.
const TICKET_LABEL = new RegExp(`^([^:]+):(${TICKET_ID})(?::.*)?$`)
const SELECT_LABEL = /^refresh\+select:/
// Every step that is not one of the four named roles is a shell proxy — the
// cheap agents the driver spawns because it has no shell of its own
// (tier-facts, accept, resolve, merge, verify, fix-added, the shadow's proxy,
// and in a parallel run a ticket's worktree, worktree-remove and post-merge).
//
// A parallel run changes nothing here, and that is why its per-ticket figures
// come from this script and not from the driver's meter: usage and timestamps
// are per AGENT, so a ticket's tokens and seconds are its own whatever ran
// beside it. What a wave does change is how to read the lines: the `wall`s of
// one wave overlap (so they sum to more than `run=`), and a wave's
// `refresh+select` is counted with the first of its tickets to start, which
// is the wave's first in document order unless the runtime started them
// otherwise. `wave-setup:<epic>` names no ticket and is run overhead.
const STEP_ROLE = { worker: 'worker', review: 'reviewer', disposition: 'disposition', 're-review': 're-review' }

// One agent's transcript → { tokens, seconds, first, last, … }, each null when
// the transcript did not expose it.
//
// Tokens are input + output + cache-creation, cache reads left out — the sum
// every run record since deviation-routing has used, so figures stay
// comparable across the ledger. Usage is per assistant MESSAGE, and a message
// streamed as several content blocks is written as several lines carrying the
// same id and the same usage, so lines are deduplicated by message id first:
// summing lines instead roughly doubles a worker's figure.
export function readTranscript(text) {
  const usageById = new Map()
  let first = null
  let last = null
  let anonymous = 0
  for (const raw of text.split('\n')) {
    if (!raw.trim()) continue
    let line
    try {
      line = JSON.parse(raw)
    } catch {
      continue // a torn last line from a killed agent is not a reason to lose the rest
    }
    const t = Date.parse(line.timestamp)
    if (!Number.isNaN(t)) {
      if (first === null || t < first) first = t
      if (last === null || t > last) last = t
    }
    const usage = line.type === 'assistant' && line.message && line.message.usage
    // No message id: the request id is the same for every line of one
    // message. With neither there is nothing to deduplicate by, and each line
    // is counted — the over-count is the smaller error than dropping usage.
    if (usage) usageById.set(line.message.id ?? line.requestId ?? `anonymous-${anonymous++}`, usage)
  }
  let tokens = null
  const parts = { input: 0, output: 0, cacheCreation: 0, cacheRead: 0 }
  for (const u of usageById.values()) {
    parts.input += u.input_tokens || 0
    parts.output += u.output_tokens || 0
    parts.cacheCreation += u.cache_creation_input_tokens || 0
    parts.cacheRead += u.cache_read_input_tokens || 0
    tokens = parts.input + parts.output + parts.cacheCreation
  }
  return {
    tokens,
    parts: tokens === null ? null : parts,
    seconds: first === null ? null : Math.round((last - first) / 1000),
    first,
    last,
  }
}

// journal text + a transcript reader → the whole report. `readAgent(agentId)`
// returns the transcript text, or null when there is none; it is a parameter
// so the tests meter strings and only the CLI touches the filesystem.
export function meter(journalText, readAgent) {
  const agents = []
  const failed = new Set()
  for (const raw of journalText.split('\n')) {
    if (!raw.trim()) continue
    let e
    try {
      e = JSON.parse(raw)
    } catch {
      continue
    }
    if (e.type === 'started' && e.agentId) agents.push({ agentId: e.agentId, label: e.label || '' })
    else if (e.type === 'failed' && e.agentId) failed.add(e.agentId)
  }

  const tickets = new Map() // id → { id, agents: [] }, in the order the run reached them
  const ticket = (id) => tickets.get(id) || tickets.set(id, { id, agents: [] }).get(id)
  // A `refresh+select` step belongs to the ticket it selected — the next one
  // the journal starts — which is how the run records have always counted it
  // (`refresh+select:1` is one of DEV-1's two proxies). One that selected
  // nothing, because the board was empty or the step failed, is the run's own
  // overhead and is reported apart from every ticket.
  let pendingSelects = []
  const overhead = []
  for (const a of agents) {
    const text = readAgent(a.agentId)
    Object.assign(a, text == null ? { tokens: null, parts: null, seconds: null, first: null, last: null } : readTranscript(text), {
      failed: failed.has(a.agentId),
      transcript: text != null,
    })
    const m = a.label.match(TICKET_LABEL)
    if (m) {
      a.role = STEP_ROLE[m[1]] || 'proxies'
      const t = ticket(m[2])
      for (const s of pendingSelects) t.agents.push(s)
      pendingSelects = []
      t.agents.push(a)
    } else {
      a.role = 'proxies'
      if (SELECT_LABEL.test(a.label)) pendingSelects.push(a)
      else overhead.push(a)
    }
  }
  overhead.push(...pendingSelects)

  // A role's figure is the sum over its agents (a retried step ran twice and
  // cost twice). One agent with no figure makes the whole role `unknown`: a
  // partial sum would read as the role's spend and be silently low.
  const sum = (list, key) => (list.some((a) => a[key] === null) ? null : list.reduce((n, a) => n + a[key], 0))
  const span = (list) => {
    const seen = list.filter((a) => a.first !== null)
    if (!seen.length || seen.length !== list.length) return null
    return Math.round((Math.max(...seen.map((a) => a.last)) - Math.min(...seen.map((a) => a.first))) / 1000)
  }
  const out = []
  for (const t of tickets.values()) {
    const tokens = {}
    const seconds = {}
    for (const role of ROLES) {
      const mine = t.agents.filter((a) => a.role === role)
      if (!mine.length) continue // a role that never ran is absent, not unknown
      tokens[role] = sum(mine, 'tokens')
      seconds[role] = sum(mine, 'seconds')
    }
    // Wall is first agent start to last agent end — NOT the sum of the roles:
    // the difference is what the ticket spent between agents, waiting on the
    // driver, and that gap is part of what a human waited through.
    out.push({ id: t.id, tokens, seconds, wall: span(t.agents), agents: t.agents })
  }
  const known = (o) => Object.values(o).filter((v) => v !== null)
  return {
    tickets: out,
    overhead,
    totalTokens: out.reduce((n, t) => n + known(t.tokens).reduce((a, b) => a + b, 0), 0) + overhead.reduce((n, a) => n + (a.tokens || 0), 0),
    runSeconds: span(agents),
  }
}

const fmt = (n) => (n === null || n === undefined ? 'unknown' : n.toLocaleString('en-US'))
const secs = (n) => (n === null || n === undefined ? 'unknown' : `${n}s`)

export function tokensLine(report) {
  const groups = report.tickets.map((t) => `${t.id} ${Object.entries(t.tokens).map(([r, v]) => `${r}=${fmt(v)}`).join(' ')}`)
  return `**Tokens:** ${[...groups, `total=${fmt(report.totalTokens)}`].join('; ')}`
}

// Seconds carry their unit — `worker=1430s` — and that `s` is load-bearing:
// `tickets.mjs spend` reads a bare `worker=1430` as TOKENS wherever it sits in
// a record, so a time figure without its unit would be added to the token
// ledger. The unit is what keeps the two ledgers apart.
export function timeLine(report) {
  const groups = report.tickets.map(
    (t) => `${t.id} ${[...Object.entries(t.seconds).map(([r, v]) => `${r}=${secs(v)}`), `wall=${secs(t.wall)}`].join(' ')}`,
  )
  return `**Time:** ${[...groups, `run=${secs(report.runSeconds)}`].join('; ')}`
}

export function render(report) {
  const lines = [tokensLine(report), '', timeLine(report), '']
  const row = (a) =>
    `  ${a.label || a.agentId} — ${a.transcript ? `${fmt(a.tokens)} tokens` + (a.parts ? ` (output ${fmt(a.parts.output)}, input ${fmt(a.parts.input)}, cache creation ${fmt(a.parts.cacheCreation)}; cache reads ${fmt(a.parts.cacheRead)} left out)` : '') + `, ${secs(a.seconds)}` : 'no transcript'}${a.failed ? ' — failed' : ''}`
  for (const t of report.tickets) {
    lines.push(`${t.id} — wall ${secs(t.wall)}`)
    for (const a of t.agents) lines.push(row(a))
  }
  if (report.overhead.length) {
    lines.push('run overhead — steps that belong to no ticket, counted in total= and in no group')
    for (const a of report.overhead) lines.push(row(a))
  }
  return lines.join('\n')
}

if (import.meta.url === pathToFileURL(process.argv[1] || '').href) {
  const args = process.argv.slice(2)
  const json = args.includes('--json')
  const dir = args.find((a) => !a.startsWith('--'))
  if (!dir) {
    console.error(
      'meter: usage: meter.mjs <workflow-run-dir> [--json] — the directory holding journal.jsonl and the agent-<id>.jsonl transcripts, under <session-dir>/subagents/workflows/<run-id>/. An EMPTY path here usually means the `find` that was meant to supply it matched nothing: check the run ID (the `wf_…` the Workflow call returned) and that the run was launched from this machine and user. Until the directory is found every figure is unknown — write `unknown`, never an estimate.',
    )
    process.exit(2)
  }
  const journal = join(dir, 'journal.jsonl')
  if (!existsSync(journal)) {
    console.error(`meter: no journal.jsonl in ${JSON.stringify(dir)} — this is not a workflow run directory (a path with a line break in it is two \`find\` matches: pass one). Every figure is unknown; write the run record's Tokens and Time lines as \`unknown\` rather than estimating.`)
    process.exit(1)
  }
  const report = meter(readFileSync(journal, 'utf8'), (id) => {
    const p = join(dir, `agent-${id}.jsonl`)
    return existsSync(p) ? readFileSync(p, 'utf8') : null
  })
  if (json) {
    const slim = (a) => ({ agentId: a.agentId, label: a.label, role: a.role, tokens: a.tokens, parts: a.parts, seconds: a.seconds, failed: a.failed, transcript: a.transcript })
    console.log(
      JSON.stringify(
        {
          tickets: report.tickets.map((t) => ({ id: t.id, tokens: t.tokens, seconds: t.seconds, wall: t.wall, agents: t.agents.map(slim) })),
          overhead: report.overhead.map(slim),
          totalTokens: report.totalTokens,
          runSeconds: report.runSeconds,
          tokensLine: tokensLine(report),
          timeLine: timeLine(report),
        },
        null,
        2,
      ),
    )
  } else console.log(render(report))
}
