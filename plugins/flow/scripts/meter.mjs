import { readFileSync, readdirSync, statSync, existsSync } from 'node:fs'
import { join } from 'node:path'
import { METER_MARKER } from './ticket-steps.mjs'

const ROLES = ['worker', 'reviewer', 'fixes']
export const METER_FORMAT_VERSION = 1
const SYNTHETIC_MODEL = '<synthetic>'
export const MODEL_NAME = /^[A-Za-z](?:[A-Za-z0-9._:\/-]*[A-Za-z0-9])?$/
export const EFFORT_NAME = /^[a-z][a-z0-9-]{0,31}$/
const AGENT_TOOLS = new Set(['Agent', 'Task'])
const REVIEWER_AGENT = /ticket-reviewer/
const USAGE_FIELDS = {
  input: 'input_tokens',
  output: 'output_tokens',
  cacheCreation: 'cache_creation_input_tokens',
  cacheReads: 'cache_read_input_tokens',
}
const FIGURES = Object.keys(USAGE_FIELDS)

function parseWholeArray(text) {
  if (!text.trimStart().startsWith('[')) return null
  try {
    const parsed = JSON.parse(text)
    return Array.isArray(parsed) ? parsed.filter((line) => line && typeof line === 'object') : null
  } catch {
    return null
  }
}

function parseLines(text) {
  const whole = parseWholeArray(text)
  if (whole) return whole
  const lines = []
  for (const raw of text.split('\n')) {
    if (!raw.trim()) continue
    try {
      const line = JSON.parse(raw)
      if (line && typeof line === 'object') lines.push(line)
    } catch {}
  }
  return lines
}

export function isStreamJson(lines) {
  return lines.some((line) => (line.type === 'system' && line.subtype === 'init' && 'session_id' in line) || 'parent_tool_use_id' in line || line.type === 'result')
}

function isCompactionBoundary(line) {
  return line.type === 'system' && line.subtype === 'compact_boundary'
}

function isCompactionSummary(line) {
  return line.type === 'user' && line.isCompactSummary === true
}

function agentLaunches(line) {
  const content = line.type === 'assistant' && line.message && Array.isArray(line.message.content) ? line.message.content : []
  return content.filter((block) => block && block.type === 'tool_use' && AGENT_TOOLS.has(block.name))
}

export function assignStreamRoles(lines) {
  const reviewerLaunches = new Set()
  const launchPhase = new Map()
  let reviewSeen = false
  return lines.map((line) => {
    const parent = line.parent_tool_use_id || null
    let role
    if (parent === null) role = reviewSeen ? 'fixes' : 'worker'
    else if (reviewerLaunches.has(parent)) role = 'reviewer'
    else role = launchPhase.get(parent) || (reviewSeen ? 'fixes' : 'worker')
    if (parent === null)
      for (const launch of agentLaunches(line)) {
        if (REVIEWER_AGENT.test(String((launch.input && launch.input.subagent_type) || ''))) {
          reviewerLaunches.add(launch.id)
          reviewSeen = true
        } else launchPhase.set(launch.id, role)
      }
    return { role, line }
  })
}

function emptyGroup() {
  return { usages: new Map(), anonymous: 0, models: [], efforts: new Set(), boundaries: 0, summaries: 0, first: null, last: null, durationMs: null, reported: null }
}

const REPORTED_FIELDS = { input: 'inputTokens', output: 'outputTokens', cacheCreation: 'cacheCreationInputTokens', cacheReads: 'cacheReadInputTokens' }

function reportedByRun(line) {
  if (!line.modelUsage || typeof line.modelUsage !== 'object') return null
  const models = {}
  for (const [model, figures] of Object.entries(line.modelUsage)) {
    if (!MODEL_NAME.test(model) || !figures || typeof figures !== 'object') continue
    models[model] = Object.fromEntries(Object.entries(REPORTED_FIELDS).map(([name, field]) => [name, typeof figures[field] === 'number' ? figures[field] : null]))
  }
  return { models, turns: typeof line.num_turns === 'number' ? line.num_turns : null, durationMs: typeof line.duration_ms === 'number' ? line.duration_ms : null }
}

function addLine(group, line) {
  const time = Date.parse(line.timestamp)
  if (!Number.isNaN(time)) {
    if (group.first === null || time < group.first) group.first = time
    if (group.last === null || time > group.last) group.last = time
  }
  if (isCompactionBoundary(line)) group.boundaries++
  if (isCompactionSummary(line)) group.summaries++
  if (line.type === 'result' && typeof line.duration_ms === 'number') group.durationMs = (group.durationMs || 0) + line.duration_ms
  if (line.type === 'result') {
    const reported = reportedByRun(line)
    if (reported) group.reported = [...(group.reported || []), reported]
  }
  if (line.type !== 'assistant' || !line.message) return
  if (typeof line.effort === 'string' && EFFORT_NAME.test(line.effort)) group.efforts.add(line.effort)
  const model = line.message.model
  const usage = line.message.usage
  if (usage && typeof usage === 'object') {
    const key = line.message.id ?? line.requestId ?? line.request_id ?? `anonymous-${group.anonymous++}`
    group.usages.set(key, { usage, model: typeof model === 'string' && model !== SYNTHETIC_MODEL && MODEL_NAME.test(model) ? model : null })
  }
  if (typeof model === 'string' && model !== SYNTHETIC_MODEL && MODEL_NAME.test(model) && !group.models.includes(model)) group.models.push(model)
}

function figuresOf(usages) {
  if (!usages.length) return Object.fromEntries([...FIGURES, 'peakContext'].map((name) => [name, null]))
  const figures = {}
  for (const name of FIGURES) {
    const field = USAGE_FIELDS[name]
    figures[name] = usages.every((usage) => typeof usage[field] === 'number') ? usages.reduce((sum, usage) => sum + usage[field], 0) : null
  }
  const windowFields = [USAGE_FIELDS.input, USAGE_FIELDS.cacheReads, USAGE_FIELDS.cacheCreation]
  figures.peakContext = usages.every((usage) => windowFields.every((field) => typeof usage[field] === 'number'))
    ? Math.max(...usages.map((usage) => windowFields.reduce((sum, field) => sum + usage[field], 0)))
    : null
  return figures
}

function summarizeGroup(group) {
  const entries = [...group.usages.values()]
  const byModel = {}
  for (const model of group.models) byModel[model] = figuresOf(entries.filter((entry) => entry.model === model).map((entry) => entry.usage))
  const unnamed = entries.filter((entry) => entry.model === null)
  if (unnamed.length) byModel.unknown = figuresOf(unnamed.map((entry) => entry.usage))
  return {
    ...figuresOf(entries.map((entry) => entry.usage)),
    compactions: Math.max(group.boundaries, group.summaries),
    wallSeconds: group.first !== null && group.last !== null ? Math.round((group.last - group.first) / 1000) : null,
    first: group.first,
    last: group.last,
    durationMs: group.durationMs,
    reported: group.reported,
    models: byModel,
    effort: group.efforts.size ? [...group.efforts].sort() : null,
  }
}

function combineReported(summaries) {
  const runs = summaries.flatMap((summary) => summary.reported || [])
  if (!runs.length) return null
  const models = {}
  for (const run of runs)
    for (const [model, figures] of Object.entries(run.models))
      models[model] = models[model] ? Object.fromEntries(Object.keys(figures).map((name) => [name, sumOrUnknown([models[model][name], figures[name]])])) : { ...figures }
  return { runs: runs.length, turns: sumOrUnknown(runs.map((run) => run.turns)), models }
}

function sumOrUnknown(values) {
  return values.some((value) => value === null) ? null : values.reduce((sum, value) => sum + value, 0)
}

function maxOrUnknown(values) {
  return values.some((value) => value === null) ? null : Math.max(...values)
}

function combine(parts) {
  const combined = {}
  for (const name of FIGURES) combined[name] = sumOrUnknown(parts.map((part) => part[name]))
  combined.peakContext = maxOrUnknown(parts.map((part) => part.peakContext))
  return combined
}

export function meterTranscripts(sources) {
  const groups = new Map()
  const groupFor = (role) => groups.get(role) || groups.set(role, emptyGroup()).get(role)
  for (const source of sources) {
    const lines = parseLines(source.text)
    const stream = isStreamJson(lines)
    const assigned = source.role ? lines.map((line) => ({ role: source.role, line })) : stream ? assignStreamRoles(lines) : lines.map((line) => ({ role: 'worker', line }))
    for (const { role, line } of assigned) addLine(groupFor(role), line)
  }
  const roleOrder = [...ROLES, ...[...groups.keys()].filter((role) => !ROLES.includes(role))]
  const roles = {}
  for (const role of roleOrder) if (groups.has(role)) roles[role] = summarizeGroup(groups.get(role))

  const models = {}
  for (const summary of Object.values(roles))
    for (const [model, figures] of Object.entries(summary.models)) models[model] = models[model] ? combine([models[model], figures]) : { ...figures }

  const summaries = Object.values(roles)
  const firsts = summaries.map((summary) => summary.first).filter((time) => time !== null)
  const lasts = summaries.map((summary) => summary.last).filter((time) => time !== null)
  const durations = summaries.map((summary) => summary.durationMs).filter((duration) => duration !== null)
  const everyRoleTimed = summaries.length > 0 && summaries.every((summary) => summary.first !== null)
  const spanSeconds = everyRoleTimed ? Math.round((Math.max(...lasts) - Math.min(...firsts)) / 1000) : null
  const runSeconds = durations.length ? Math.round(Math.max(...durations) / 1000) : null
  const total = {
    ...(summaries.length ? combine(summaries) : figuresOf([])),
    compactions: summaries.reduce((sum, summary) => sum + summary.compactions, 0),
    wallSeconds: spanSeconds === null ? runSeconds : runSeconds === null ? spanSeconds : Math.max(spanSeconds, runSeconds),
  }
  const reported = combineReported(summaries)
  for (const summary of summaries) {
    delete summary.first
    delete summary.last
    delete summary.durationMs
    delete summary.reported
  }
  return { roles, models, total, ...(reported ? { reported } : {}) }
}

export function transcriptFiles(path) {
  if (!existsSync(path)) throw new Error(`no transcript at ${path}`)
  if (!statSync(path).isDirectory()) return [path]
  return readdirSync(path, { recursive: true })
    .map((name) => join(path, String(name)))
    .filter((file) => file.endsWith('.jsonl') && statSync(file).isFile())
    .sort()
}

function roleFromAgentMeta(file) {
  const metaFile = file.replace(/\.jsonl$/, '.meta.json')
  if (!existsSync(metaFile)) return null
  try {
    return REVIEWER_AGENT.test(String(JSON.parse(readFileSync(metaFile, 'utf8')).agentType || '')) ? 'reviewer' : null
  } catch {
    return null
  }
}

export function parseTranscriptArgument(value) {
  const match = value.match(/^([a-z][a-z-]*)=(.+)$/)
  if (match && ROLES.includes(match[1])) return { role: match[1], path: match[2] }
  return { role: null, path: value }
}

const WORKFLOW_ROLE_LABEL = /^(worker|reviewer|fixes):#(\d+)(?::.*)?$/

export function workflowAgents(journalText, ticket) {
  const agents = []
  for (const raw of journalText.split('\n')) {
    if (!raw.trim()) continue
    let entry
    try {
      entry = JSON.parse(raw)
    } catch {
      continue
    }
    if (entry.type !== 'started' || !entry.agentId) continue
    const match = String(entry.label || '').match(WORKFLOW_ROLE_LABEL)
    if (match && Number(match[2]) === ticket) agents.push({ agentId: entry.agentId, role: match[1], label: entry.label })
  }
  return agents
}

export function workflowSources(directory, ticket) {
  const journal = join(directory, 'journal.jsonl')
  if (!existsSync(journal)) throw new Error(`no journal.jsonl in ${directory}; give the directory of one workflow run (…/subagents/workflows/<run id>/)`)
  const sources = []
  for (const agent of workflowAgents(readFileSync(journal, 'utf8'), ticket)) {
    const file = join(directory, `agent-${agent.agentId}.jsonl`)
    if (existsSync(file)) sources.push({ file, role: agent.role, text: readFileSync(file, 'utf8') })
  }
  return sources
}

export function loadSources(values) {
  const sources = []
  for (const value of values) {
    const { role, path } = parseTranscriptArgument(value)
    for (const file of transcriptFiles(path)) sources.push({ file, role: role || roleFromAgentMeta(file), text: readFileSync(file, 'utf8') })
  }
  return sources
}

function shown(value) {
  return value === null || value === undefined ? 'unknown' : value.toLocaleString('en-US')
}

export function effortText(effort) {
  return Array.isArray(effort) && effort.length ? effort.join(', ') : 'unknown'
}

function seconds(value) {
  return value === null ? 'unknown' : `${value}s`
}

export function meterComment({ ticket, sourceCount, meter }) {
  const lines = [METER_MARKER, `**Cost of #${ticket}**, read from ${sourceCount} transcript file(s). "unknown" means the transcript did not record that figure; nothing here is estimated.`, '']
  lines.push('| Step | Models | Effort | Input | Output | Cache writes | Cache reads | Largest context | Compactions | Time |', '|---|---|---|---|---|---|---|---|---|---|')
  for (const [role, figures] of Object.entries(meter.roles))
    lines.push(`| ${role} | ${Object.keys(figures.models).join(', ') || 'unknown'} | ${effortText(figures.effort)} | ${shown(figures.input)} | ${shown(figures.output)} | ${shown(figures.cacheCreation)} | ${shown(figures.cacheReads)} | ${shown(figures.peakContext)} | ${figures.compactions} | ${seconds(figures.wallSeconds)} |`)
  const total = meter.total
  lines.push(`| **total** | | | ${shown(total.input)} | ${shown(total.output)} | ${shown(total.cacheCreation)} | ${shown(total.cacheReads)} | ${shown(total.peakContext)} | ${total.compactions} | ${seconds(total.wallSeconds)} |`)
  if (Object.keys(meter.models).length) {
    lines.push('', '| Model | Input | Output | Cache writes | Cache reads | Largest context |', '|---|---|---|---|---|---|')
    for (const [model, figures] of Object.entries(meter.models))
      lines.push(`| ${model} | ${shown(figures.input)} | ${shown(figures.output)} | ${shown(figures.cacheCreation)} | ${shown(figures.cacheReads)} | ${shown(figures.peakContext)} |`)
  }
  if (meter.reported) {
    lines.push('', `As the headless run reported it at its end (${meter.reported.runs} run(s), ${shown(meter.reported.turns)} turn(s)), subagents included:`, '', '| Model | Input | Output | Cache writes | Cache reads |', '|---|---|---|---|---|')
    for (const [model, figures] of Object.entries(meter.reported.models))
      lines.push(`| ${model} | ${shown(figures.input)} | ${shown(figures.output)} | ${shown(figures.cacheCreation)} | ${shown(figures.cacheReads)} |`)
  }
  lines.push('', '```json', JSON.stringify({ flowMeter: METER_FORMAT_VERSION, ticket, ...meter }), '```')
  return lines.join('\n')
}

export function readMeterComment(body) {
  if (!body.startsWith(METER_MARKER)) return null
  const match = body.match(/```json\n(.+)\n```/)
  return match ? JSON.parse(match[1]) : null
}
