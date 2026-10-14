import { parseChecks, CHECK_LINE, EXPECT_LINE, COMPARE_LINE, LANDMARKS_LINE, CHECK_NEAR } from './checks.mjs'

export const BLOCKED_BY_LINE = /^Blocked by:[ \t]*(#\d+(?:[ \t]*,[ \t]*#\d+)*)[ \t]*$/
export const BLOCKED_BY_NEAR = /^[\s>*_+-]*(?:\d+[.)]\s+)?[*_]*blocked[ -]?by[*_]*\s*:/i
export const EPIC_LINE = /^Epic:[ \t]*#(\d+)[ \t]*$/
const SECTION_HEADING = /^##[ \t]+(.+?)[ \t]*#*[ \t]*$/
const FENCE_OPEN = /^[ \t]*(`{3,}|~{3,})[ \t]*([^`\s]*)/
const TASK_LINE = /^[ \t]*[-*][ \t]+\[([ xX])\][ \t]+#(\d+)\b[ \t]*(?:[—–-][ \t]*)?(.*)$/
const SETTING_LINE = /^[ \t]*(?:[-*][ \t]+)?([A-Za-z][A-Za-z ]*?)[ \t]*:[ \t]*(.*?)[ \t]*$/

export const DELIVERY_MODES = ['release', 'incremental']
export const MAX_PARALLEL = 3

export function normalizeNewlines(text) {
  return (text || '').replace(/\r\n?/g, '\n')
}

function fenceCloses(line, fence) {
  const trimmed = line.trim()
  return trimmed.length >= fence.length && trimmed === fence[0].repeat(trimmed.length)
}

export function scanLines(text) {
  const lines = normalizeNewlines(text).split('\n')
  let fence = null
  return lines.map((line, index) => {
    if (fence) {
      if (fenceCloses(line, fence.marker)) {
        const closing = { line, number: index + 1, fence: fence.info, fenceEdge: 'close' }
        fence = null
        return closing
      }
      return { line, number: index + 1, fence: fence.info, fenceEdge: null }
    }
    const open = line.match(FENCE_OPEN)
    if (open) {
      fence = { marker: open[1], info: open[2] }
      return { line, number: index + 1, fence: open[2], fenceEdge: 'open' }
    }
    return { line, number: index + 1, fence: null, fenceEdge: null }
  })
}

export function splitSections(text) {
  const preamble = []
  const sections = new Map()
  let current = null
  for (const entry of scanLines(text)) {
    const heading = entry.fence === null ? entry.line.match(SECTION_HEADING) : null
    if (heading) {
      current = { title: heading[1], lines: [], firstLine: entry.number + 1 }
      sections.set(heading[1].trim().toLowerCase(), current)
      continue
    }
    if (current) current.lines.push(entry.line)
    else preamble.push(entry.line)
  }
  const section = (name) => {
    const found = sections.get(name)
    return found ? { text: found.lines.join('\n').trim(), raw: found.lines.join('\n'), firstLine: found.firstLine } : null
  }
  return { preamble: preamble.join('\n').trim(), section, names: [...sections.keys()] }
}

export function parseBlockedBy(text) {
  const found = scanLines(text).filter(
    (entry) => entry.fence === null && (BLOCKED_BY_LINE.test(entry.line) || BLOCKED_BY_NEAR.test(entry.line)),
  )
  if (!found.length) return { blockedBy: [], problem: null }
  if (found.length > 1)
    return {
      blockedBy: [],
      problem: `has ${found.length} "Blocked by" lines (lines ${found.map((entry) => entry.number).join(', ')}); write one, so nobody has to guess which one counts`,
    }
  const [entry] = found
  const strict = entry.line.match(BLOCKED_BY_LINE)
  if (!strict)
    return {
      blockedBy: [],
      problem: `has a "Blocked by" line that cannot be read: "${entry.line.trim()}" (it must be exactly "Blocked by: #12, #14" at the start of a line: issue numbers and commas, nothing else)`,
    }
  const numbers = [...new Set(strict[1].split(',').map((part) => Number(part.trim().slice(1))))]
  return { blockedBy: numbers, problem: null }
}

export function parseEpicLine(text) {
  for (const entry of scanLines(text)) {
    if (entry.fence !== null) continue
    const match = entry.line.match(EPIC_LINE)
    if (match) return Number(match[1])
  }
  return null
}

export function parseTaskList(text) {
  const tasks = []
  for (const entry of scanLines(text)) {
    if (entry.fence !== null) continue
    const match = entry.line.match(TASK_LINE)
    if (match) tasks.push({ number: Number(match[2]), checked: match[1] !== ' ', title: match[3].trim() })
  }
  return tasks
}

function splitList(value) {
  return value
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean)
}

export function parseSettings(text) {
  const settings = { delivery: 'release', parallel: 1, designSources: null, consequencePaths: [], branch: null, other: {} }
  const problems = []
  for (const entry of scanLines(text || '')) {
    if (entry.fence !== null || !entry.line.trim()) continue
    const match = entry.line.match(SETTING_LINE)
    if (!match) {
      problems.push(`settings line ${entry.number} is not "Key: value": "${entry.line.trim()}"`)
      continue
    }
    const key = match[1].trim().toLowerCase()
    const value = match[2]
    if (key === 'delivery') {
      const mode = value.toLowerCase()
      if (DELIVERY_MODES.includes(mode)) settings.delivery = mode
      else {
        settings.delivery = null
        problems.push(`"Delivery: ${value}" is neither release nor incremental`)
      }
    } else if (key === 'parallel') {
      const count = /^\d+$/.test(value) ? Number(value) : NaN
      if (count >= 1 && count <= MAX_PARALLEL) settings.parallel = count
      else {
        settings.parallel = null
        problems.push(`"Parallel: ${value}" is not a number from 1 to ${MAX_PARALLEL}`)
      }
    } else if (key === 'design sources') {
      settings.designSources = splitList(value)
    } else if (key === 'consequence paths') {
      settings.consequencePaths = splitList(value)
    } else if (key === 'branch') {
      settings.branch = value || null
    } else {
      settings.other[match[1].trim()] = value
    }
  }
  return { settings, problems }
}

export function parseEpicBody(body) {
  const { section } = splitSections(body)
  const text = (name) => (section(name) ? section(name).text : null)
  const { settings, problems } = parseSettings(text('settings'))
  return {
    outcome: text('outcome'),
    sources: text('sources'),
    settings,
    walkthrough: text('walkthrough'),
    groundRules: text('ground rules'),
    tickets: parseTaskList(text('tickets') || ''),
    problems,
  }
}

const MACHINE_LINE = (line) =>
  CHECK_LINE.test(line) || EXPECT_LINE.test(line) || COMPARE_LINE.test(line) || LANDMARKS_LINE.test(line) || CHECK_NEAR.test(line)

export function parseCriteriaSection(sectionText, firstLine = 1) {
  const problems = []
  const blocks = []
  let open = null
  for (const entry of scanLines(sectionText || '')) {
    const bodyLine = firstLine + entry.number - 1
    if (entry.fenceEdge === 'open') {
      open = { info: entry.fence, lines: [], firstLine: bodyLine + 1, closed: false }
      blocks.push(open)
      continue
    }
    if (entry.fenceEdge === 'close') {
      open.closed = true
      open = null
      continue
    }
    if (open) {
      open.lines.push(entry.line)
      continue
    }
    if (MACHINE_LINE(entry.line))
      problems.push({ line: bodyLine, text: entry.line.trim(), why: 'a CHECK/EXPECT/COMPARE/LANDMARKS line outside the ```criteria block never runs; move it inside the block' })
  }
  const criteriaBlocks = blocks.filter((block) => block.info === 'criteria')
  for (const block of blocks)
    if (block.info !== 'criteria' && block.lines.some(MACHINE_LINE))
      problems.push({ line: block.firstLine - 1, text: '```' + block.info, why: 'criteria lines sit in a code block not marked ```criteria, so they never run' })
  if (criteriaBlocks.length > 1)
    problems.push({ line: criteriaBlocks[1].firstLine - 1, text: '```criteria', why: `${criteriaBlocks.length} criteria blocks; write one, so nobody has to guess which one counts` })
  const block = criteriaBlocks[0] || null
  if (block && !block.closed)
    problems.push({ line: block.firstLine - 1, text: '```criteria', why: 'the criteria block never closes' })
  return { text: block ? block.lines.join('\n') : null, firstLine: block ? block.firstLine : null, problems }
}

export const MISSING_CRITERIA_BLOCK =
  'no ```criteria block under "## Acceptance criteria", so nothing decides this ticket; anyone who can edit the issue could otherwise turn a red ticket green by deleting the block'
export const EMPTY_CRITERIA_BLOCK = 'the ```criteria block has no CHECK or COMPARE line, so nothing decides this ticket'

export function parseTicketBody(body, designSources = null) {
  const normalized = normalizeNewlines(body)
  const { section } = splitSections(normalized)
  const text = (name) => (section(name) ? section(name).text : null)
  const { blockedBy, problem } = parseBlockedBy(normalized)
  const criteriaSection = section('acceptance criteria')
  const block = criteriaSection ? parseCriteriaSection(criteriaSection.raw, criteriaSection.firstLine) : { text: null, firstLine: null, problems: [] }
  const parsed = block.text === null ? { checks: [], compares: [], problems: [] } : parseChecks(block.text, designSources, { firstLine: block.firstLine })
  const missing = []
  if (block.text === null)
    missing.push({ line: criteriaSection ? criteriaSection.firstLine - 1 : null, text: '## Acceptance criteria', why: MISSING_CRITERIA_BLOCK })
  else if (!parsed.checks.length && !parsed.compares.length && !parsed.problems.length)
    missing.push({ line: block.firstLine - 1, text: '```criteria', why: EMPTY_CRITERIA_BLOCK })
  return {
    epic: parseEpicLine(normalized),
    blockedBy,
    blockedByProblem: problem,
    scope: text('scope'),
    notInScope: text('not in scope'),
    acceptanceCriteria: text('acceptance criteria'),
    notes: text('notes'),
    criteria: { checks: parsed.checks, compares: parsed.compares, problems: [...missing, ...block.problems, ...parsed.problems] },
  }
}

export function withEpicLine(body, epicNumber) {
  const normalized = normalizeNewlines(body)
  const existing = parseEpicLine(normalized)
  if (existing === epicNumber) return normalized
  if (existing !== null) throw new Error(`the ticket body already says "Epic: #${existing}", not #${epicNumber}`)
  return `Epic: #${epicNumber}\n${normalized.replace(/^\n+/, '')}`
}

export function withBlockedBy(body, numbers) {
  const normalized = normalizeNewlines(body)
  if (!numbers.length) return normalized
  const present = scanLines(normalized).some(
    (entry) => entry.fence === null && (BLOCKED_BY_LINE.test(entry.line) || BLOCKED_BY_NEAR.test(entry.line)),
  )
  if (present) throw new Error('the ticket body already has a "Blocked by" line; give the blockers once')
  const line = `Blocked by: ${numbers.map((number) => `#${number}`).join(', ')}`
  const lines = normalized.split('\n')
  const epicIndex = lines.findIndex((text) => EPIC_LINE.test(text))
  lines.splice(epicIndex === -1 ? 0 : epicIndex + 1, 0, line)
  return lines.join('\n')
}

export function withTicketListed(epicBody, number, title) {
  const normalized = normalizeNewlines(epicBody)
  const entry = `- [ ] #${number} — ${title}`
  const scanned = scanLines(normalized)
  const headingIndex = scanned.findIndex((line) => line.fence === null && /^##[ \t]+tickets[ \t]*$/i.test(line.line))
  const lines = normalized.split('\n')
  if (headingIndex === -1) return `${normalized.replace(/\n+$/, '')}\n\n## Tickets\n\n${entry}\n`
  let end = headingIndex + 1
  while (end < scanned.length && !(scanned[end].fence === null && SECTION_HEADING.test(scanned[end].line))) end++
  const inSection = scanned.slice(headingIndex + 1, end)
  if (inSection.some((line) => line.fence === null && (line.line.match(TASK_LINE) || [])[2] === String(number))) return normalized
  let lastTask = -1
  inSection.forEach((line, offset) => {
    if (line.fence === null && TASK_LINE.test(line.line)) lastTask = headingIndex + 1 + offset
  })
  if (lastTask !== -1) lines.splice(lastTask + 1, 0, entry)
  else lines.splice(headingIndex + 1, 0, '', entry)
  return lines.join('\n')
}

export function withTicketChecked(epicBody, number) {
  const normalized = normalizeNewlines(epicBody)
  const scanned = scanLines(normalized)
  const lines = normalized.split('\n')
  scanned.forEach((entry, index) => {
    if (entry.fence !== null) return
    const match = entry.line.match(TASK_LINE)
    if (match && match[2] === String(number) && match[1] === ' ') lines[index] = entry.line.replace('[ ]', '[x]')
  })
  return lines.join('\n')
}
