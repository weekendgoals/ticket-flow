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
  retro: 'plugins/flow/skills/retro/SKILL.md',
  reviewer: 'plugins/flow/agents/ticket-reviewer.md',
  review: 'plugins/flow/skills/review/SKILL.md',
  script: 'plugins/flow/scripts/tickets.mjs',
  hook: 'plugins/flow/hooks/ticket-session-guard.mjs',
  workflow: 'plugins/flow/workflows/run-epic.mjs',
  readme: 'README.md',
  claudemd: 'CLAUDE.md',
  methodology: 'METHODOLOGY.md',
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

// ── 1b. The run log's Rules block is the status log's ────────────────────────
// `runs.md` carries the same **Rules** block as `status.md` — append only,
// corrections as dated addenda, counts not adjectives — so the run skill holds
// a fourth copy of it. A fourth copy is a fourth place to drift, so it is
// pinned to the same reference the three status-log copies are checked against.

const rulesBlock = (text) => {
  const m = text.match(/\*\*Rules\.\*\*[\s\S]*$/)
  return m ? norm(m[0]) : null
}

function runLogPreamble() {
  for (const block of fences(read('run'))) {
    const lines = block.split('\n')
    if (/^# .+ — run log\s*$/.test(lines[0])) return block
  }
  throw new Error(`no run-log preamble fence in ${FILES.run} — the run record's file has no template to create it from`)
}

function checkRunLogRules() {
  const reference = rulesBlock(statusPreamble('epic'))
  if (!reference) throw new Error(`no **Rules.** block in the status-log preamble in ${FILES.epic}`)
  const runRules = rulesBlock(runLogPreamble())
  if (runRules !== reference)
    throw new Error(
      `the run log's Rules block in ${FILES.run} differs from the status log's in ${FILES.epic} — they are one rule and move in the same commit`,
    )
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

// ── 3b. The COMPARE criterion's template matches its parser ──────────────────
// `COMPARE:` / `LANDMARKS:` are the fidelity half of the one machine-runnable
// criterion format, and they fail the way a CHECK near-miss does: a template
// the parser rejects produces criteria that silently never appear in the
// ledger, so the comparison the ticket was written for is performed by nobody
// and gated by nothing. The regex literals are re-derived from tickets.mjs
// source (importing it would run its CLI), and the planning skill's template
// is held to them — the same coupling checkTemplates holds for the headings.
//
// The two lanes that RUN the comparison are checked for one thing more:
// `--removed-from`. A removal is a planning decision, and a lane that teaches
// the differ without it teaches a worker to read removals from the map its own
// ticket edits — the founding failure routed through the new machinery.

function criterionRegex(name) {
  const src = read('script')
  const m = src.match(new RegExp(`const ${name} = (/.+/)\\n`))
  if (!m) throw new Error(`cannot extract ${name} from ${FILES.script} — source shape changed; update check-invariants.mjs`)
  return new Function(`return ${m[1]}`)()
}

function checkCompareTemplate() {
  const compare = criterionRegex('COMPARE_LINE')
  const landmarks = criterionRegex('LANDMARKS_LINE')
  const lines = fences(read('epic')).flatMap((b) => b.split('\n'))
  for (const [label, re, parser] of [
    ['COMPARE', /^\s*COMPARE\s*:/, compare],
    ['LANDMARKS', /^\s*LANDMARKS\s*:/, landmarks],
  ]) {
    const line = lines.find((l) => re.test(l))
    if (!line)
      throw new Error(
        `no ${label} criterion template in ${FILES.epic} — the planning skill is where the format is taught, and a format nobody teaches is a criterion nobody writes`,
      )
    if (!parser.test(line))
      throw new Error(`the ${label} template in ${FILES.epic} no longer matches ${label}_LINE in ${FILES.script}: "${line.trim()}"`)
  }
  for (const key of ['ticket', 'quick']) {
    if (!norm(read(key)).includes('--removed-from'))
      throw new Error(
        `${FILES[key]} teaches the COMPARE comparison without naming \`--removed-from\` — removals would then be read from the map the ticket under review edits, which is the failure the separate file exists to prevent`,
      )
  }
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
    why: 'the driver handshake phrase ticket step 0 keys on to let the spawn prompt scope the skill, and step 10 keys on to stop the worker short of the merge',
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
  {
    why: 'a regression the change introduced is Important, never a nit parked for the retro — the reviewer, the review skill, the lanes that disposition findings and the driver carry one rule',
    re: /scope limits what the worker builds, not what the reviewer reports/i,
    files: ['reviewer', 'review', 'ticket', 'quick', 'workflow'],
  },
  {
    why: 'the revert check is one rule at two doors — the lanes that write the Verified line name the test that fails with the source reverted, and the reviewer, the review skill and the driver open that test rather than take the claim',
    re: /fails with the source change reverted/i,
    files: ['ticket', 'quick', 'reviewer', 'review', 'workflow'],
  },
  {
    why: "the review addendum's token phrase is what `tickets.mjs spend` parses — the ticket and quick skills must keep writing it in that shape",
    re: /Reviewer tokens: /,
    files: ['ticket', 'quick', 'script', 'readme'],
  },
  {
    why: "the run record's per-ticket token groups are what `tickets.mjs spend` parses out of a run record — the run skill's template must keep the key=value shape",
    re: /worker=<n> reviewer=<n>/,
    files: ['run', 'readme'],
  },
  {
    why: "the acceptance-check stop condition is one sentence in the skill and the script — a halt the run record quotes verbatim. Pinned whole, like the fix-bounds sentence: the gate halts on a malformed CHECK, on a COMPARE criterion whose pushed entry records no comparison, and on a report it cannot read, as well as on a failing check — and a retro that reads only the first clause files those halts as something else",
    re: /a failed acceptance CHECK — a machine-runnable criterion whose command did not produce its expected result on the pushed branch, a criterion whose evidence is a skip, a CHECK line too malformed to run at all, a COMPARE criterion whose pushed entry records no comparison, or an acceptance report the gate could not read/,
    files: ['run', 'workflow'],
  },
  {
    why: 'the fix-bounds stop condition is one sentence in the skill and the script — since a bounds trip buys a re-review instead of a halt, the only fix that still halts is one nothing could measure, and both documents must say so in the same words. Pinned whole, not by its first clause: what it now excludes is as load-bearing as what it names',
    re: /no usable fix-diff facts from the resolve step, or a fix whose changed lines cannot be counted; an unmeasurable fix is never merged/,
    files: ['run', 'workflow'],
  },
  {
    why: "the merge-conflict stop condition is one sentence in the skill and the script — pinned because it was deleted from the skill's list by an edit that meant to add a bullet beside it (DEV-3's review), leaving `STOP.mergeConflict` live at three call sites and a human looking up a halt string the skill no longer carried. The general gap this one exposed — only some of the STOP sentences are pinned — is recorded for the retro; this entry holds the one that was actually lost",
    re: /a merge conflict — refreshing the epic branch, or anywhere else, including a ticket branch that will not merge into the epic branch/,
    files: ['run', 'workflow'],
  },
  {
    why: "the deviation stop condition is one sentence in the skill and the script — the halt a run record quotes verbatim. Pinned whole, like the acceptance-check and fix-bounds sentences: \"closed or not\" is what makes this gate different from the attended one, and a copy that kept only the opening would describe a gate that honours a closing line this one ignores — which is the fail-open the halt exists to prevent",
    re: /a recorded deviation — the ticket's pushed status entry carries a `\*\*Deviation:\*\*` line, closed or not, because nobody present in an unattended run could have closed it; the run asks rather than records/,
    files: ['run', 'workflow'],
  },
  {
    why: 'the never-resume-by-id rule — a halted run is re-run, not resumed, because the runtime replays the recorded failure from the prefix cache; the run skill states the rule where the halt is met and METHODOLOGY carries its reason, and a document that keeps only one of the two turns the rule back into folklore',
    re: /never `resumeFromRunId`/i,
    files: ['run', 'methodology'],
  },
  {
    why: "where a run record is written — runs.md, never the status.md the ticket entries share. The run skill writes it, the driver's `next` strings tell the session to, the retro's miner reads it, and README's document table names it; a document that keeps the old home sends one of those writers back onto the shared file tail",
    re: /runs\.md/,
    files: ['run', 'retro', 'workflow', 'readme', 'script'],
  },
  {
    why: "the deviation opener — `**Deviation:**` is the exact label the parser reads, so the two lanes that teach a worker to write one, the parser itself and README's account of the fields must spell it identically. A lane renamed to any other word teaches entries that parse as nothing, silently: doctor's near-miss scan catches a deviation-shaped slip like `**Deviations:**`, but a rename to an unrelated label looks like ordinary prose to it, and the departure goes back to reaching nobody",
    re: /\*\*Deviation:\*\*/,
    files: ['ticket', 'quick', 'script', 'readme'],
  },
  {
    why: "the deviation closing line is one label in both lanes that write a status entry, in the parser that reads it and in README's account of the fields — and each says it is a human's line. A lane that stops teaching it sends the next departure back into Decisions prose, where nothing reads it; a document that keeps the label but drops the owner lets the reviewed party close its own record",
    re: /\*\*Deviations closed:\*\*/,
    files: ['ticket', 'quick', 'script', 'readme'],
  },
  {
    why: "the attended merge's second refusal — an unclosed deviation holds a release integration, and the run skill's account of what a halted ticket meets at step 10 must name it beside the unfixed Important finding. That inventory is read by the session finishing a halted ticket by hand, and while it named one refusal it was an instruction to route around the other",
    re: /unclosed deviation/i,
    files: ['ticket', 'run'],
  },
  {
    why: "the attended doors — a deviation is named in the pull request body, in both lanes that open one: the ticket lane's step 9 and the quick lane's step 7. That body is where the human who merges actually reads, and in the quick lane it is a departure's only door, there being no agent merge to refuse. A lane that drops the sentence keeps the record and loses the reader — the departure sits parsed in a status log nobody opens while the pull request that decides it says nothing",
    re: /a deviation is named in the pull request body/i,
    files: ['ticket', 'quick'],
  },
  {
    why: "every note either ledger emits is cleared by the repair it names — the parser that emits them, the lane that teaches a worker to write the lines that earn them, and README's account of both ledgers. The rule is only worth anything if all three agree: a document that keeps the old story ('any item of that entry clears it') sends a human to a repair that leaves the warning standing, and an append-only log cannot take the wrong line back, so the next reader learns to skip warnings instead",
    re: /cleared by the repair it names/i,
    files: ['script', 'ticket', 'readme'],
  },
  {
    why: "the closing line's granularity — a bare closing line closes an entry's one departure and closes nothing against several, so both lanes that teach a human the line, the parser that reads it and README's account of it must carry the same rule. A document that keeps the whole-entry story teaches a human to write a line that silently closes departures nobody decided on — which is the loss the owed ledger already took, one indirection away",
    re: /bare closing line/i,
    files: ['script', 'ticket', 'quick', 'readme'],
  },
  {
    why: 'machine-runnable acceptance criteria — the CHECK/EXPECT format is parsed and executed by tickets.mjs, taught by the planning skill, and run by both execution lanes and the driver',
    // Absorbs the deliberate wording variants: a literal "CHECK: <command>"
    // template line, the prose "CHECK/EXPECT", and the backticked
    // "`CHECK:` / `EXPECT:`" — presence of the format, not one spelling.
    re: /CHECK: |CHECK.{0,8}EXPECT/,
    files: ['epic', 'ticket', 'quick', 'run', 'script', 'workflow'],
  },
  {
    why: "the COMPARE criterion is one format in four documents: the parser lists comparisons apart from the checks and never runs one, the planning skill teaches the line, and both execution lanes run the differ it names and paste its table. A document that drops it leaves a criterion somebody writes and nobody performs",
    re: /COMPARE/,
    files: ['epic', 'ticket', 'quick', 'script'],
  },
  {
    why: "the ledger's third verdict — a check whose evidence is a skip is not passed, so it cannot green a merge gate. The script decides it, the planning skill writes EXPECTs a skip cannot satisfy, both execution lanes read the ledger, the driver halts on it, and README documents it; a document that keeps only the two-verdict story teaches a worker to report a ↓ line as a pass",
    re: /skipped check is not a passed one/i,
    files: ['script', 'epic', 'ticket', 'quick', 'run', 'workflow', 'readme'],
  },
  {
    why: "the owed marker's granularity — an entry that owed several things is retired item by item, and a bare entry ID against it retires nothing. The script derives it, both lanes write the markers, and README documents the brief; a skill that keeps the old whole-entry story teaches a worker to write a line that silently retires items nobody discharged",
    re: /retires \*{0,2}nothing/i,
    files: ['script', 'ticket', 'quick', 'readme'],
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
  ["the run log's Rules block is the status log's, verbatim", checkRunLogRules],
  ['the two risk lists cover the same trigger set', checkRiskLists],
  ['skill heading templates match the parser regexes', checkTemplates],
  ["the COMPARE criterion's template matches its parser, and both lanes name --removed-from", checkCompareTemplate],
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
