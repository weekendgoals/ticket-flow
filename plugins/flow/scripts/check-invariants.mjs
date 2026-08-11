#!/usr/bin/env node
// check-invariants — mechanically verify the cross-document doctrine couplings.
//
// The plugin's documents are its program: agents execute the skills, and
// several rules are deliberately stated in more than one file ("a rule stated
// in more than one document is one rule" — CLAUDE.md). Those couplings are the
// one surface with no mechanical verification: the board script and the hook
// have test suites, while the doctrine has relied on discipline and review —
// and four of the autonomous epic's five reviews found drift between documents
// that each read correctly alone. This script turns the string-checkable
// subset of that failure class from silent to loud, at edit time.
//
// It checks presence and equality, never meaning: two textually different,
// contradictory sentences still need a reviewer. Keep PHRASES short and
// load-bearing — a fifty-entry grep list becomes its own drift surface and
// fails the admission test it exists to serve.
//
// Known limit, accepted: a trigger added only to the ticket skill's prose
// consequence list (not to the quick skill's bullets or to TRIGGERS here) is
// not caught — prose has no bullet count to check. The quick side is covered:
// a new bullet matching no known trigger fails, which forces TRIGGERS to grow,
// which then fails until the ticket skill's list carries it too.
//
// Zero dependencies, read-only, exits 1 on any broken invariant.
// Usage: node check-invariants.mjs [repo-root]
// The root defaults to this file's ../../.. (the marketplace repo); the test
// suite passes a mutated temp copy instead.

import { readFileSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = process.argv[2] ?? join(dirname(fileURLToPath(import.meta.url)), '..', '..', '..')

const FILES = {
  epic: 'plugins/flow/skills/epic/SKILL.md',
  ticket: 'plugins/flow/skills/ticket/SKILL.md',
  quick: 'plugins/flow/skills/quick/SKILL.md',
  run: 'plugins/flow/skills/run/SKILL.md',
  reviewer: 'plugins/flow/agents/ticket-reviewer.md',
  script: 'plugins/flow/scripts/tickets.mjs',
  hook: 'plugins/flow/hooks/ticket-session-guard.mjs',
  workflow: 'plugins/flow/workflows/run-epic.mjs',
  readme: 'README.md',
  claudemd: 'CLAUDE.md',
}
const read = (key) => readFileSync(join(root, FILES[key]), 'utf8')
const norm = (s) => s.replace(/\s+/g, ' ').trim()

// Fenced code blocks of a Markdown document — the skills' templates live in
// them, and only in them, so template checks never match prose by accident.
function fences(text) {
  const out = []
  const re = /^```[^\n]*\n([\s\S]*?)\n```/gm
  for (let m; (m = re.exec(text)); ) out.push(m[1])
  return out
}

// ── 1. The status-log preamble — one rule, three documents ───────────────────
// The epic skill's template, the ticket skill's step 6 and the quick skill's
// step 5 each carry a copy, and each says a change to any copy moves the
// others in the same commit. Verify it: extract the fence opening with the
// "# … — status log" heading (the epic's copy truncated before its Baseline
// section, which belongs to planning), normalise quick's concrete epic name
// back to the placeholder, and require the three blocks identical.

function statusPreamble(key) {
  for (const block of fences(read(key))) {
    const lines = block.split('\n')
    if (!/^# .+ — status log\s*$/.test(lines[0])) continue
    const cut = lines.findIndex((l) => l.startsWith('## Baseline'))
    return (cut === -1 ? lines : lines.slice(0, cut))
      .join('\n')
      .trim()
      .replace(/Quick/g, '<Name>')
      .replace(/quick/g, '<name>')
  }
  throw new Error(`no status-log preamble fence in ${FILES[key]}`)
}

function checkPreambleCopies() {
  const copies = ['epic', 'ticket', 'quick'].map((k) => [k, statusPreamble(k)])
  const [, reference] = copies[0]
  for (const [key, text] of copies.slice(1)) {
    if (text !== reference)
      throw new Error(
        `status-log preamble drifted: ${FILES[key]} differs from ${FILES.epic} — the three copies are one rule and move in the same commit`,
      )
  }
}

// ── 2. The two risk lists are one list ───────────────────────────────────────
// The quick skill's entry triggers and the ticket skill's xhigh consequence
// list measure the same consequences at two doors. The canonical set lives
// here; every trigger must appear in both regions, and every quick bullet must
// match a known trigger (so a new bullet forces this list, and this list then
// forces the ticket skill's prose).

const TRIGGERS = [
  ['auth boundary', /authentication or authorization/i],
  ['secrets', /secrets/i],
  ['cryptography', /crypto/i],
  ['migration', /migration/i],
  ['deletes or rewrites data', /deletes or rewrites data/i],
  ['network exposure', /network exposure/i],
  ['payments or billing', /payments? or billing/i],
  ['fail open', /fail open/i],
]

// The bullet list after "never quick, at any size": bullets and their wrapped
// continuation lines, ending at the first flush-left prose paragraph.
function quickRiskRegion() {
  const lines = read('quick').split('\n')
  const start = lines.findIndex((l) => l.includes('never quick, at any size'))
  if (start === -1) throw new Error(`marker "never quick, at any size" not found in ${FILES.quick}`)
  const region = []
  for (let i = start + 1; i < lines.length; i++) {
    const l = lines[i]
    if (l.trim() === '' || l.startsWith('- ') || /^\s+\S/.test(l)) region.push(l)
    else break
  }
  return region
}

function ticketRiskRegion() {
  const lines = read('ticket').split('\n')
  const start = lines.findIndex((l) => l.startsWith('The consequence list:'))
  if (start === -1) throw new Error(`marker "The consequence list:" not found in ${FILES.ticket}`)
  const region = []
  for (let i = start; i < lines.length && lines[i].trim() !== ''; i++) region.push(lines[i])
  return region.join('\n')
}

function checkRiskLists() {
  const quickRegion = quickRiskRegion()
  const quickText = norm(quickRegion.join(' '))
  const ticketText = norm(ticketRiskRegion())
  for (const [name, re] of TRIGGERS) {
    if (!re.test(quickText))
      throw new Error(`risk trigger "${name}" missing from the quick skill's entry gate — the two risk lists are one list`)
    if (!re.test(ticketText))
      throw new Error(`risk trigger "${name}" missing from the ticket skill's consequence list — the two risk lists are one list`)
  }
  const bullets = []
  for (const l of quickRegion) {
    if (l.startsWith('- ')) bullets.push(l.slice(2))
    else if (/^\s+\S/.test(l) && bullets.length) bullets[bullets.length - 1] += ` ${l.trim()}`
  }
  if (!bullets.length) throw new Error(`no risk bullets found under the quick skill's entry gate`)
  for (const b of bullets) {
    if (!TRIGGERS.some(([, re]) => re.test(b)))
      throw new Error(
        `quick-skill risk bullet matches no known trigger — add it to TRIGGERS and to the ticket skill's consequence list in this same commit: "${b}"`,
      )
  }
}

// ── 3. Skill templates match the parser regexes ──────────────────────────────
// TICKET_HEADING and STATUS_HEADING are load-bearing and shared: a template
// reshaped without them (or vice versa) makes every ticket written from it
// silently parse as "not started"/"not done". The regexes are re-derived from
// tickets.mjs *source* — importing it would run its CLI — so a refactor of
// those constants fails loudly here instead of passing vacuously.

function parserRegexes() {
  const src = read('script')
  const grab = (re, what) => {
    const m = src.match(re)
    if (!m) throw new Error(`cannot extract ${what} from ${FILES.script} — source shape changed; update check-invariants.mjs`)
    return m[1]
  }
  const unescape = (s) => s.replace(/\\\\/g, '\\')
  const ticketId = unescape(grab(/const TICKET_ID = '([^']+)'/, 'TICKET_ID'))
  const build = (raw) => new RegExp(unescape(raw).replaceAll('${TICKET_ID}', ticketId))
  return {
    ticketHeading: build(grab(/const TICKET_HEADING = new RegExp\(`([^`]+)`\)/, 'TICKET_HEADING')),
    statusHeading: build(grab(/const STATUS_HEADING = new RegExp\(\s*`([^`]+)`,?\s*\)/, 'STATUS_HEADING')),
    outcomes: grab(/const KNOWN_OUTCOMES = new Set\(\[([^\]]+)\]\)/, 'KNOWN_OUTCOMES')
      .split(',')
      .map((s) => s.trim().replace(/'/g, '')),
  }
}

const instantiate = (line) =>
  line
    .replace(/<ID>/g, 'SEC-3')
    .replace(/Q-<n>/g, 'Q-18')
    .replace(/<short name>/g, 'Sample name')
    .replace(/<name>/g, 'Sample name')
    .replace(/<YYYY-MM-DD>/g, '2026-08-11')

function templateHeadings(key) {
  const out = { ticket: [], status: [] }
  for (const block of fences(read(key)))
    for (const line of block.split('\n')) {
      if (/^##\s+(?:<ID>|Q-<n>)\s/.test(line)) out.ticket.push(line)
      if (/^###\s+(?:<ID>|Q-<n>)\s/.test(line)) out.status.push(line)
    }
  return out
}

function checkTemplates() {
  const { ticketHeading, statusHeading, outcomes } = parserRegexes()
  const want = { epic: ['ticket'], ticket: ['status'], quick: ['ticket', 'status'] }
  for (const [key, kinds] of Object.entries(want)) {
    const found = templateHeadings(key)
    for (const kind of kinds) {
      if (!found[kind].length)
        throw new Error(`no ${kind}-heading template found in ${FILES[key]} — placeholder shape changed, or the template was dropped`)
      for (const raw of found[kind]) {
        const line = instantiate(raw)
        const re = kind === 'ticket' ? ticketHeading : statusHeading
        const m = line.match(re)
        if (!m) throw new Error(`template in ${FILES[key]} no longer matches ${kind === 'ticket' ? 'TICKET_HEADING' : 'STATUS_HEADING'}: "${raw}"`)
        if (kind === 'status' && !outcomes.includes(m[4]))
          throw new Error(`template outcome "${m[4]}" in ${FILES[key]} is not in KNOWN_OUTCOMES (${outcomes.join(', ')})`)
      }
    }
  }
  for (const outcome of outcomes) {
    if (!read('ticket').includes(outcome))
      throw new Error(`outcome ${outcome} is parsed by tickets.mjs but never named in ${FILES.ticket}`)
  }
  // The run record's heading deliberately matches neither parsed shape — the
  // run skill says so; hold it to that.
  const runLine = fences(read('run'))
    .flatMap((b) => b.split('\n'))
    .find((l) => l.startsWith('### Run — '))
  if (!runLine) throw new Error(`run-record heading template not found in ${FILES.run}`)
  const runInstance = instantiate(runLine).replace(/<completed \| halted>/g, 'completed')
  if (statusHeading.test(runInstance))
    throw new Error(`the run-record heading now matches STATUS_HEADING — it must stay invisible to the board: "${runLine}"`)
}

// ── 4. The guard's refusal message is the one the ticket skill advertises ────
// The refusal's advertised recovery must work in the refused state (CLAUDE.md:
// a gate is verified at the door its actor walks through) — which starts with
// the skill quoting the hook verbatim, not paraphrasing it.

function checkRefusalMessage() {
  const m = read('hook').match(/const REFUSAL =\s*'([^']+)'/)
  if (!m) throw new Error(`cannot extract REFUSAL from ${FILES.hook} — source shape changed; update check-invariants.mjs`)
  if (!norm(read('ticket')).includes(norm(m[1])))
    throw new Error(`the hook's refusal message is not quoted verbatim in ${FILES.ticket} — the skill advertises a different message than the guard emits`)
}

// ── 5. Load-bearing doctrine phrases ─────────────────────────────────────────
// The presence half of "one rule in many documents": each entry names why the
// phrase is load-bearing and every file that must carry it. Alternations
// absorb deliberate wording differences; this is a presence check, not prose
// equality.

const PHRASES = [
  {
    why: 'merge-direction doctrine — no agent merges toward the default branch; in the workflow script the NO_MAIN prompt rule must carry it, not just the meta description',
    re: /toward the default branch/,
    files: ['run', 'ticket', 'readme', 'claudemd', 'workflow'],
  },
  {
    why: 'the driver handshake phrase ticket step 10 keys on to stop after the merge',
    re: /a driver spawned you/i,
    files: ['run', 'ticket', 'workflow'],
  },
  {
    why: 'never-squash for multi-ticket pull requests — subjects are how shipped is detected',
    re: /never[*\s]+(be )?squash/i,
    files: ['run', 'ticket', 'readme'],
  },
  {
    why: 'the two risk lists move together in the same commit',
    re: /added to the other[^.]*same commit/i,
    files: ['quick', 'ticket', 'claudemd'],
  },
  {
    why: 'the status-log preamble is one rule in three documents',
    re: /one rule,? (in )?three documents/i,
    files: ['epic', 'ticket', 'quick'],
  },
  {
    why: 'reviewers report and never fix',
    re: /(reports?; it does not fix|report and never fix|report\. You never fix|reports without fixing)/i,
    files: ['ticket', 'quick', 'reviewer', 'readme', 'claudemd'],
  },
]

function checkPhrases() {
  // Markdown wraps prose at ~80 columns, so a phrase can span a line break;
  // match against whitespace-normalised text, never the raw file.
  for (const { why, re, files } of PHRASES)
    for (const key of files) {
      if (!re.test(norm(read(key))))
        throw new Error(`doctrine phrase missing from ${FILES[key]} (${why}) — expected to match ${re}`)
    }
}

// ── entry point ──────────────────────────────────────────────────────────────

const CHECKS = [
  ['status-log preamble identical across its three copies', checkPreambleCopies],
  ['the two risk lists cover the same trigger set', checkRiskLists],
  ['skill heading templates match the parser regexes', checkTemplates],
  ['hook refusal message quoted verbatim by the ticket skill', checkRefusalMessage],
  ['load-bearing doctrine phrases present everywhere required', checkPhrases],
]

let failed = 0
for (const [name, fn] of CHECKS) {
  try {
    fn()
    console.log(`✓ ${name}`)
  } catch (e) {
    failed++
    console.log(`✗ ${name}\n  ${e.message}`)
  }
}
if (failed) {
  console.error(`\n${failed} invariant check${failed > 1 ? 's' : ''} failed`)
  process.exit(1)
}
