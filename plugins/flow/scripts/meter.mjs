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
// Output is the run record's five machine-shaped lines, ready to paste:
//
//   **Tokens:** <ID> worker=<n> reviewer=<n> … ; total=<n>
//   **Time:** <ID> worker=<n>s reviewer=<n>s … wall=<n>s; run=<n>s
//   **Cache reads:** <ID> worker=<n>r reviewer=<n>r …; total=<n>r
//   **Models:** <ID> worker=<name> reviewer=<name> …
//   **Peak context:** <ID> worker=<n>c reviewer=<n>c …
//
// (The record's other two machine-shaped lines, `**Findings:**` and
// `**Halt:**`, come from the driver's own result and not from a transcript:
// nothing in a transcript says which findings were left unfixed.)
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

// The charset a model id uses — a letter first, then letters, digits and
// `. _ : / -`, ending in a letter or digit. It is the same rule
// `tickets.mjs`'s `MODEL_NAME` reads with, because a name this writes is a
// name that has to parse back: one carrying a space, a semicolon or an `=`
// would be read in the record as a second pair or end a group early, one that
// opens with a DIGIT (`5`, `12r`) opens like a figure and lands in the token
// ledger, and one that ends in punctuation (`claude-opus-5.`) is a name
// nobody ran. An unprintable name is therefore no observation, and the role
// reads `unknown`.
const MODEL_NAME = /^[A-Za-z](?:[A-Za-z0-9._:\/-]*[A-Za-z0-9])?$/
// The harness writes this model name on messages it injected itself; it names
// no model anyone ran, so it is not a model this reports.
const SYNTHETIC = '<synthetic>'
// What `scripts/runners/codex.mjs` writes when the epic named no model: the
// runner's placeholder for "whatever Codex is configured to use", which is a
// name nobody ran. Read as no observation, so the role prints
// `codex:unknown` rather than `codex:default`. The runner's own field is left
// alone — its report is a record of what it was told, and its suite asserts
// that shape.
const NO_MODEL = 'default'
// That the runner RAN here: a shell command that INVOKES it, which is what
// the driver's proxy prompt spells —
// `node "<plugin>/scripts/runners/codex.mjs" <ID> … --json`, with `--start`,
// `--wait` or `--cancel`. `node` has to be in command position (the start of
// a command, or after `;`, `&&`, `||`, `|`, or a `(`, with any environment
// assignments in front) and the runner has to be its script argument, so that
// a step which merely READS the file — `grep -n runner
// plugins/flow/scripts/runners/codex.mjs`, `cat`, `git log --
// …/codex.mjs`, the Read tool — is not mistaken for a step that ran it. That
// mistake costs a Claude worker its model: it would report `unknown` for
// having grepped the plugin.
//
// Both paths may be QUOTED AND CONTAIN SPACES — `${CLAUDE_PLUGIN_ROOT}` is
// wherever the person installed their plugins, and a home directory with a
// space in it is ordinary. A pattern that could not cross one read a real
// Codex worker as `claude-haiku-4-5`, the proxy's own model, which is the
// wrong answer rather than a missing one.
//
// The node flags that take the script and DON'T run it are excluded by name
// — `node --check …/codex.mjs` is a syntax check and `--test` is a test run,
// and either would otherwise say the runner ran here. What follows the script
// is not inspected: `node …/codex.mjs --help` prints usage and writes no
// report, so that agent reads `unknown` — the same answer a killed run gives,
// and a true one either way, since the proxy's own model did not write the
// ticket.
//
// The script path must END at `codex.mjs` — whitespace, a closing quote, a
// command terminator or the end of the line after it. Without that boundary
// `node /p/runners/codex.mjs.backup` read as a run, and the worker whose
// command it was lost its model to a file nobody executed.
const NOT_A_RUN = `(?!(?:--check|-c|--test)\\b)`
const QUOTED = (inner) => `(?:"[^"]*${inner}"|'[^']*${inner}'|[^\\s;&|"']*${inner})`
const ENDS_THERE = `(?=$|[\\s;&|)])`
const CODEX_INVOCATION = new RegExp(
  `(?:^|[;&|(]|&&|\\|\\|)[ \\t]*(?:[A-Za-z_]\\w*=\\S*[ \\t]+)*${QUOTED('\\bnode(?:\\.exe)?')}[ \\t]+(?:${NOT_A_RUN}-{1,2}[^\\s]*[ \\t]+)*${QUOTED('runners\\/codex\\.mjs')}${ENDS_THERE}`,
  'm',
)

// A heredoc's body is DATA the shell writes somewhere, not commands it runs —
// and because the pattern above anchors at the start of any line (a real
// command may be continued across several), a body line reading `node
// …/codex.mjs CX-1 --json` was matching as an invocation. That costs a Claude
// worker its model and its peak on a command that printed a file. So the
// bodies come out first: from a line opening `<<WORD` (or `<<-WORD`, or a
// quoted delimiter) to the line that is that word alone, terminators nested
// in the order they were opened. A here-STRING (`<<<word`) has no body and is
// left alone.
//
// The deliberate cost: `bash -c "node …/codex.mjs … --start"` reads as NOT an
// invocation, so a Codex worker driven that way would report its proxy's own
// model. The trade is one sentence — **quoted text is not executed text** —
// and it is the safe direction, because the alternative is the bug above: any
// command that merely PRINTS the path (a heredoc, an echo, a log line) erases
// a real Claude worker's model and its peak. The driver's proxy prompt spells
// the invocation unquoted, so no lane that ships produces the shape, and a
// test pins it so the next reader does not "fix" it back.
const HEREDOC_OPEN = /<<-?\s*(["']?)([A-Za-z_]\w*)\1/g
function withoutHeredocBodies(command) {
  if (!command.includes('<<')) return command
  const kept = []
  const pending = []
  for (const line of command.split('\n')) {
    if (pending.length) {
      if (line.trim() === pending[0]) pending.shift()
      continue
    }
    kept.push(line)
    for (const m of line.matchAll(HEREDOC_OPEN)) pending.push(m[2])
  }
  return kept.join('\n')
}

// The balanced `{…}` that begins at `start`, or -1 — strings and escapes
// respected. Each call scans from its own start rather than from the top of
// the blob, which is what keeps one unpaired `"` in a shell's output from
// desynchronising the scan for everything after it. `work` is the budget
// below, decremented by what this scan reads.
function balancedEnd(text, start, work) {
  let depth = 0
  let inStr = false
  let esc = false
  for (let i = start; i < text.length; i++) {
    if (work.left-- <= 0) return -1
    const c = text[i]
    if (inStr) {
      if (esc) esc = false
      else if (c === '\\') esc = true
      else if (c === '"') inStr = false
      continue
    }
    if (c === '"') inStr = true
    else if (c === '{') depth++
    else if (c === '}' && --depth === 0) return i
  }
  return -1
}

// Every object carrying a `"runner"` key in a blob of text — the Codex
// runner's printed report, found inside whatever else the shell wrote around
// it. Rather than one pass over the whole blob, each `"runner"` occurrence is
// approached from the `{`s before it, nearest first: a sibling object that
// already closed parses and has no `runner`, so the search walks outward
// until one does.
//
// Two bounds, because the search is quadratic and a shell's output is
// whatever the shell wrote: at most CANDIDATE_OPENERS starts per occurrence,
// and — the one that matters — a GLOBAL character budget for the whole blob,
// since the per-occurrence bound multiplies by the number of occurrences
// (2,000 lines of `{`×60 and a `"runner"` each took 20 seconds before this).
// Spent, the report is simply not found, which for a proven runner run reads
// `unknown`: a figure this cannot afford to observe is not an observation.
const CANDIDATE_OPENERS = 50
const SCAN_BUDGET = 2_000_000
function runnerObjectsIn(text) {
  const out = []
  const work = { left: SCAN_BUDGET }
  let from = 0
  for (;;) {
    const at = text.indexOf('"runner"', from)
    if (at === -1 || work.left <= 0) return out
    from = at + 1
    let tried = 0
    for (let i = at; i >= 0 && tried < CANDIDATE_OPENERS && work.left > 0; i--) {
      if (text[i] !== '{') continue
      tried++
      const end = balancedEnd(text, i, work)
      if (end < at) continue // an object that closed before the key is not the one
      let o
      try {
        o = JSON.parse(text.slice(i, end + 1))
      } catch {
        continue
      }
      if (o && typeof o === 'object' && o.runner) {
        out.push(o)
        break
      }
    }
  }
}

// The text of every tool RESULT on one transcript line, and the commands of
// every tool USE. A Codex worker's agent is a shell proxy: the model in its
// own `message.model` is the proxy's (haiku), and the model that wrote the
// ticket is inside the JSON `scripts/runners/codex.mjs` printed, which
// reaches the transcript as the result of the proxy's shell call. The proxy
// also relays that JSON in its final message, and this deliberately does not
// read that: a tool result is the runner's own output, a message is a model's
// account of it.
function toolText(line) {
  const content = line && line.message && line.message.content
  const results = []
  const commands = []
  if (!Array.isArray(content)) return { results, commands }
  for (const block of content) {
    if (!block) continue
    if (block.type === 'tool_use') {
      // A shell call, by the shape of its input rather than the tool's name:
      // `command` is the Bash tool's, and the tools that merely read a file
      // (Read, Grep, Glob) carry a path or a pattern instead, so they cannot
      // look like an invocation whatever they point at.
      const command = block.input && block.input.command
      if (typeof command === 'string') commands.push(command)
    } else if (block.type === 'tool_result') {
      if (typeof block.content === 'string') results.push(block.content)
      else if (Array.isArray(block.content)) for (const c of block.content) if (c && c.type === 'text' && typeof c.text === 'string') results.push(c.text)
    }
  }
  return { results, commands }
}

// One agent's transcript → { tokens, cacheReads, models, seconds, first, last,
// … }, each null (or empty) when the transcript did not expose it.
//
// Tokens are input + output + cache-creation, cache reads left out — the sum
// every run record since deviation-routing has used, so figures stay
// comparable across the ledger; the cache reads are reported beside it, on
// their own line, and are never folded into that sum. Usage is per assistant
// MESSAGE, and a message streamed as several content blocks is written as
// several lines carrying the same id and the same usage, so lines are
// deduplicated by message id first: summing lines instead roughly doubles a
// worker's figure.
//
// `proxyTicket` is the ticket this agent may be a runner's shell proxy for,
// and only an agent the journal labelled `worker:<ID>` is given one: a runner
// report is a model substitution, and any other agent that happened to print
// one — a merge step reading the runner's log, a verify step `cat`ing its
// state file — would otherwise have its own model replaced by it. The report
// must name that same ticket, too: the state directory is per ticket, and a
// report for another one is another ticket's answer.
export function readTranscript(text, { proxyTicket = null } = {}) {
  const usageById = new Map()
  let first = null
  let last = null
  let anonymous = 0
  const models = []
  const codexModels = []
  let codexRan = false
  const add = (list, v) => {
    if (!list.includes(v)) list.push(v)
  }
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
    // Models are collected per LINE and in order of first use: a message
    // streamed as several lines repeats its model, and an agent that fell
    // back to a second model used both — reporting the "dominant" one would
    // be an estimate of something the transcript states exactly.
    const model = line.type === 'assistant' && line.message && line.message.model
    if (typeof model === 'string' && model !== SYNTHETIC && MODEL_NAME.test(model)) add(models, model)
    if (!proxyTicket) continue
    const { results, commands } = toolText(line)
    // That the runner RAN is read from the command, not from its output: a
    // run whose report was truncated, nested a level deeper than expected or
    // never printed at all must read `unknown`, because the proxy's own model
    // is the one model that certainly did not write this ticket.
    if (commands.some((c) => CODEX_INVOCATION.test(withoutHeredocBodies(c)))) codexRan = true
    for (const result of results) {
      for (const o of runnerObjectsIn(result)) {
        const r = o.runner
        if (!r || typeof r !== 'object' || r.name !== 'codex' || typeof r.model !== 'string') continue
        if (o.ticket !== proxyTicket) continue // another ticket's report, read in passing
        if (r.model !== NO_MODEL && MODEL_NAME.test(r.model)) add(codexModels, r.model)
      }
    }
  }
  let tokens = null
  // The largest context window this agent ever held: per MESSAGE, input +
  // cache reads + cache creation — every token the model was given to read on
  // that request, which is what "context" means and what a limit is measured
  // against. Output is left out because it is not in the window that was
  // sent; the next request's input carries it, and counting it here would add
  // it twice at the one moment the figure is supposed to be exact.
  //
  // A MAX over messages, never a sum: the windows are the same conversation
  // seen again and again, so summing them multiplies one context by the
  // number of turns. That is also why deduplication by message id matters
  // more here than anywhere — but in the other direction: a repeated line
  // carries the same usage, and a max over duplicates is the same max.
  let peak = null
  const parts = { input: 0, output: 0, cacheCreation: 0, cacheRead: 0 }
  for (const u of usageById.values()) {
    parts.input += u.input_tokens || 0
    parts.output += u.output_tokens || 0
    parts.cacheCreation += u.cache_creation_input_tokens || 0
    parts.cacheRead += u.cache_read_input_tokens || 0
    tokens = parts.input + parts.output + parts.cacheCreation
    const window = (u.input_tokens || 0) + (u.cache_read_input_tokens || 0) + (u.cache_creation_input_tokens || 0)
    peak = peak === null ? window : Math.max(peak, window)
  }
  return {
    tokens,
    // Cache reads are an observation like any other: zero is a figure (a run
    // with no cache to read from), and only a transcript that exposed no
    // usage at all has none.
    cacheReads: tokens === null ? null : parts.cacheRead,
    parts: tokens === null ? null : parts,
    // Where the runner RAN, its report replaces the proxy's own model,
    // because the proxy wrote no ticket. That the runner ran is the command's
    // word, never the report's: a report found without an invocation was read
    // from somewhere — a log, a state file — by an agent doing its own work,
    // and substituting on it is how a Claude worker loses its model. Ran with
    // nothing printable to show for it — no report parsed, one for another
    // ticket, an unprintable name, the runner's `default` placeholder — and
    // the agent has no model at all: the proxy's would be a name nobody ran.
    models: codexRan ? codexModels.map((m) => `codex:${m}`) : models,
    // The SAME gate, on the same condition and beside it so the two cannot
    // drift — and for a stronger reason. Tokens and cache reads stay as they
    // are because they are the proxy's real cost, paid by this run whoever
    // wrote the ticket. A peak is not a cost: it is a claim about ONE model's
    // context window, and the only window this transcript exposes is the
    // shell proxy's, a few relayed JSON blobs wide. Reported under
    // `codex:<model>` it would say a Codex agent came that close to its
    // limit, which no observation here supports — so where the runner ran,
    // the peak is `unknown`, the same answer the model gets when the report
    // is unreadable.
    peak: codexRan ? null : peak,
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
    // Only a `worker:<ID>` step may be a runner's shell proxy — that is the
    // one step the driver spawns a runner from, and the label is the journal's
    // own word for it, not a guess from the transcript's contents.
    const m = a.label.match(TICKET_LABEL)
    const proxyTicket = m && m[1] === 'worker' ? m[2] : null
    Object.assign(a, text == null ? { tokens: null, peak: null, cacheReads: null, parts: null, models: [], seconds: null, first: null, last: null } : readTranscript(text, { proxyTicket }), {
      failed: failed.has(a.agentId),
      transcript: text != null,
    })
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
  // A role's models are the union of its agents', in order of first use —
  // NOT unknown when one agent of the role has none, which is where models
  // part company with the figures beside them. A missing figure makes a sum
  // silently low, so a role with a hole in it is `unknown`; a model is a
  // label, and an agent nobody observed cannot make an observed label wrong.
  // Empty is the only `unknown` here: nothing about the role was seen.
  const union = (list) => {
    const out = []
    for (const a of list) for (const m of a.models) if (!out.includes(m)) out.push(m)
    return out.length ? out.join('+') : null
  }
  // A role's peak is the LARGEST of its agents' peaks, never their sum: two
  // agents of one role held two separate context windows, one after the
  // other, and adding them names a window nobody ever held. The `unknown`
  // rule is the sum's, though, and for the sum's reason inverted: a max taken
  // over a role with an unobserved agent in it could only be too LOW, and a
  // peak that reads low is the one direction that matters — it is read to
  // answer "did anything come near the limit?".
  const largest = (list, key) => (list.some((a) => a[key] === null) ? null : Math.max(...list.map((a) => a[key])))
  const out = []
  for (const t of tickets.values()) {
    const tokens = {}
    const seconds = {}
    const cacheReads = {}
    const models = {}
    const peak = {}
    for (const role of ROLES) {
      const mine = t.agents.filter((a) => a.role === role)
      if (!mine.length) continue // a role that never ran is absent, not unknown
      tokens[role] = sum(mine, 'tokens')
      seconds[role] = sum(mine, 'seconds')
      cacheReads[role] = sum(mine, 'cacheReads')
      models[role] = union(mine)
      peak[role] = largest(mine, 'peak')
    }
    // Wall is first agent start to last agent end — NOT the sum of the roles:
    // the difference is what the ticket spent between agents, waiting on the
    // driver, and that gap is part of what a human waited through.
    out.push({ id: t.id, tokens, seconds, cacheReads, models, peak, wall: span(t.agents), agents: t.agents })
  }
  const known = (o) => Object.values(o).filter((v) => v !== null)
  const total = (key) => out.reduce((n, t) => n + known(t[key]).reduce((a, b) => a + b, 0), 0) + overhead.reduce((n, a) => n + (a[key] || 0), 0)
  return {
    tickets: out,
    overhead,
    totalTokens: total('tokens'),
    // Run overhead is in this total as it is in the token one: the reads a
    // select or a wave setup paid for are the run's, and belong to no ticket.
    totalCacheReads: total('cacheReads'),
    runSeconds: span(agents),
  }
}

const fmt = (n) => (n === null || n === undefined ? 'unknown' : n.toLocaleString('en-US'))
const secs = (n) => (n === null || n === undefined ? 'unknown' : `${n}s`)
// No thousands separators on a figure that carries a unit: the parser reads
// `\d+r` and `1,430s` is what a hand-written record looked like when `spend`
// read `worker=1` out of it.
const reads = (n) => (n === null || n === undefined ? 'unknown' : `${n}r`)
// …and the peak's own unit, for the same reason and one more: `c` is neither
// `s` nor `r`, so a peak figure that landed in a Time or Cache reads
// paragraph is read by neither ledger rather than read wrongly by one.
const ctx = (n) => (n === null || n === undefined ? 'unknown' : `${n}c`)

export function tokensLine(report) {
  const groups = report.tickets.map((t) => `${t.id} ${Object.entries(t.tokens).map(([r, v]) => `${r}=${fmt(v)}`).join(' ')}`)
  return `**Tokens:** ${[...groups, `total=${fmt(report.totalTokens)}`].join('; ')}`
}

// Seconds carry their unit — `worker=1430s` — and that `s` is load-bearing:
// `tickets.mjs spend` reads a bare `worker=1430` as TOKENS wherever it sits in
// a record, so a time figure without its unit would be added to the token
// ledger. The unit is the first half of what keeps the counting ledgers
// apart; the second is the paragraph each line is read inside, because
// `unknown` and a model name carry no unit at all.
export function timeLine(report) {
  const groups = report.tickets.map(
    (t) => `${t.id} ${[...Object.entries(t.seconds).map(([r, v]) => `${r}=${secs(v)}`), `wall=${secs(t.wall)}`].join(' ')}`,
  )
  return `**Time:** ${[...groups, `run=${secs(report.runSeconds)}`].join('; ')}`
}

// Cache reads carry an `r` for the reason seconds carry an `s`: `spend` reads
// a bare `worker=4812330` as TOKENS wherever it sits in a record, and the
// last figure read for a role wins — so a cache figure that reached the token
// ledger would not add to the ticket's cost, it would REPLACE it, with a
// count several times its size. The unit is also what keeps the headline
// figure comparable across the ledger — cache reads have their own line
// precisely so that `worker=<n>` on the Tokens line means today what it meant
// in every earlier record.
export function cacheReadsLine(report) {
  const groups = report.tickets.map((t) => `${t.id} ${Object.entries(t.cacheReads).map(([r, v]) => `${r}=${reads(v)}`).join(' ')}`)
  return `**Cache reads:** ${[...groups, `total=${reads(report.totalCacheReads)}`].join('; ')}`
}

// Models have no total and nothing to sum — they are what ran, per role, and
// a run that reached no ticket has none to name.
export function modelsLine(report) {
  const groups = report.tickets.map((t) => `${t.id} ${Object.entries(t.models).map(([r, v]) => `${r}=${v ?? 'unknown'}`).join(' ')}`)
  return `**Models:** ${groups.length ? groups.join('; ') : 'none — no ticket ran'}`
}

// The largest context window each role held, and NO total: a max across
// tickets is not a sum, and a figure headed `total=` beside four lines whose
// totals are sums would be read as one. `tickets.mjs spend` prints the epic's
// max under the groups, computed from them, where it cannot disagree.
// A Codex worker's role reads `unknown` here even though its proxy exposed a
// window: see `readTranscript`. The window was the proxy's, and a peak names
// a model.
export function peakLine(report) {
  const groups = report.tickets.map((t) => `${t.id} ${Object.entries(t.peak).map(([r, v]) => `${r}=${ctx(v)}`).join(' ')}`)
  return `**Peak context:** ${groups.length ? groups.join('; ') : 'none — no ticket ran'}`
}

export function render(report) {
  const lines = [tokensLine(report), '', timeLine(report), '', cacheReadsLine(report), '', modelsLine(report), '', peakLine(report), '']
  const row = (a) =>
    `  ${a.label || a.agentId} — ${a.transcript ? `${fmt(a.tokens)} tokens` + (a.parts ? ` (output ${fmt(a.parts.output)}, input ${fmt(a.parts.input)}, cache creation ${fmt(a.parts.cacheCreation)}; cache reads ${fmt(a.parts.cacheRead)}, on the Cache reads line and not in this sum; peak context ${fmt(a.peak)})` : '') + `, ${secs(a.seconds)}` + (a.models.length ? ` — ${a.models.join('+')}` : '') : 'no transcript'}${a.failed ? ' — failed' : ''}`
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
    console.error(`meter: no journal.jsonl in ${JSON.stringify(dir)} — this is not a workflow run directory (a path with a line break in it is two \`find\` matches: pass one). Every figure is unknown; write the run record's Tokens, Time, Cache reads, Models and Peak context lines as \`unknown\` rather than estimating.`)
    process.exit(1)
  }
  const report = meter(readFileSync(journal, 'utf8'), (id) => {
    const p = join(dir, `agent-${id}.jsonl`)
    return existsSync(p) ? readFileSync(p, 'utf8') : null
  })
  if (json) {
    const slim = (a) => ({ agentId: a.agentId, label: a.label, role: a.role, tokens: a.tokens, cacheReads: a.cacheReads, peak: a.peak, models: a.models, parts: a.parts, seconds: a.seconds, failed: a.failed, transcript: a.transcript })
    console.log(
      JSON.stringify(
        {
          tickets: report.tickets.map((t) => ({ id: t.id, tokens: t.tokens, seconds: t.seconds, cacheReads: t.cacheReads, models: t.models, peak: t.peak, wall: t.wall, agents: t.agents.map(slim) })),
          overhead: report.overhead.map(slim),
          totalTokens: report.totalTokens,
          totalCacheReads: report.totalCacheReads,
          runSeconds: report.runSeconds,
          tokensLine: tokensLine(report),
          timeLine: timeLine(report),
          cacheReadsLine: cacheReadsLine(report),
          modelsLine: modelsLine(report),
          peakLine: peakLine(report),
        },
        null,
        2,
      ),
    )
  } else console.log(render(report))
}
