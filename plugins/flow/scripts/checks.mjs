import { spawnSync } from 'node:child_process'

export const CHECK_LINE = /^\s*CHECK:\s*(\S.*)$/
export const EXPECT_LINE = /^\s*EXPECT:\s*(\S.*)$/
export const COMPARE_LINE = /^\s*COMPARE:\s*(\S.*)$/
export const LANDMARKS_LINE = /^\s*LANDMARKS:\s*(\S.*)$/

const LABEL_NEAR = '(?:[Cc][Hh][Ee][Cc][Kk]|[Ee][Xx][Pp][Ee][Cc][Tt]|COMPARE|LANDMARKS)\\s*:'
const COMPARE_SHAPED = '[Cc][Oo][Mm][Pp][Aa][Rr][Ee]\\s*:.*@\\s*\\d'
export const CHECK_NEAR = new RegExp(`^\\s*(?:${LABEL_NEAR}|${COMPARE_SHAPED})`)
const CHECK_BULLET_NEAR = new RegExp(`^\\s*[-*]\\s+(?:${LABEL_NEAR}|${COMPARE_SHAPED})`)
const CRITERION_BULLET = /^\s*[-*]\s+(.*)$/

const CHECK_ESCAPED_PIPE = /\\\\\|/
const CHECK_QUOTED_SCRIPT = /\bnode\s+-e\b|\bsh\s+-c\b/

export const CHECK_TIMEOUT_MS = 600_000
export const CHECK_MAX_BUFFER = 64 * 1024 * 1024

export const CHECK_SKIP_MARK = /^[\s│|>]*[↓○]|(?<![\w-])\d+\s+skipped\b|\bskipped\s*\(\s*\d+\s*\)|#\s*skip(ped)?\b/i
export const CHECK_RAN_MARK =
  /\b(?!0+\b)\d+\s+(?:passed|passing|ok)\b|\bpass(?:ed)?[:\s]+(?!0+\b)\d+\b|^[\s│|>]*ok\s+\d+\b(?!.*#\s*skip)/i
const isSkipEvidence = (line) => CHECK_SKIP_MARK.test(line) && !CHECK_RAN_MARK.test(line)

function grepCountsRecursively(command) {
  for (const match of command.matchAll(/(?:^|[\s;|&(`'"])grep((?:\s+-{1,2}[A-Za-z][A-Za-z-]*)*)/g)) {
    let recursive = false
    let counting = false
    for (const flag of match[1].trim().split(/\s+/).filter(Boolean)) {
      if (flag.startsWith('--')) {
        if (flag === '--recursive' || flag === '--dereference-recursive') recursive = true
        if (flag === '--count') counting = true
      } else {
        const letters = flag.slice(1)
        if (/[rR]/.test(letters)) recursive = true
        if (letters.includes('c')) counting = true
      }
    }
    if (recursive && counting) return true
  }
  return false
}

function checkShapeProblems(command) {
  const reasons = []
  if (CHECK_ESCAPED_PIPE.test(command) && CHECK_QUOTED_SCRIPT.test(command))
    reasons.push('this CHECK runs but can never pass: `\\\\|` inside a quoted `node -e` / `sh -c` string loses one backslash to the quoting, so grep receives a literal "|" and the alternation never matches (use `grep -E` in a plain shell command)')
  if (grepCountsRecursively(command))
    reasons.push('this CHECK runs but can never pass: grep given both -r and -c prints "path:count" per file, never a bare number (count one named file, or pipe through `wc -l`)')
  return reasons
}

function compareProblem(value, designSources) {
  const at = value.lastIndexOf('@')
  if (at === -1) return 'COMPARE with no "@ <width>" (needs "COMPARE: <design source path> @ <width>[, <width>]"), because a page compared at no stated width is compared against nothing in particular'
  const source = value.slice(0, at).trim()
  const widthText = value.slice(at + 1).trim()
  if (!source) return 'COMPARE with no design source path before its "@" (needs "COMPARE: <design source path> @ <width>[, <width>]")'
  const widths = widthText.split(',').map((width) => width.trim())
  if (!widths.length || widths.some((width) => !/^\d+$/.test(width)))
    return `COMPARE whose width list is not widths: "${widthText}" (needs plain numbers, "@ 1440,393"), because a width nothing can parse is a comparison nobody can repeat`
  if (!designSources || !designSources.length)
    return `COMPARE names "${source}", but the epic's settings declare no "Design sources:", so nobody else is handed the file it compares against`
  if (!designSources.includes(source))
    return `COMPARE names "${source}", which the epic's "Design sources:" setting does not list (it lists: ${designSources.join(', ')}); the whole text between commas is a path there, so check for a typo`
  return null
}

function parseCompare(value) {
  const at = value.lastIndexOf('@')
  return {
    source: value.slice(0, at).trim(),
    widths: value
      .slice(at + 1)
      .split(',')
      .map((width) => Number(width.trim())),
  }
}

export function parseChecks(text, designSources = null, { firstLine = 1 } = {}) {
  const checks = []
  const compares = []
  const problems = []
  let criterion = null
  text.split('\n').forEach((line, index) => {
    const lineNumber = firstLine + index
    const problem = (why) => problems.push({ line: lineNumber, text: line.trim(), why })
    const check = line.match(CHECK_LINE)
    const expect = line.match(EXPECT_LINE)
    const compare = line.match(COMPARE_LINE)
    const landmarks = line.match(LANDMARKS_LINE)
    const bullet = line.match(CRITERION_BULLET)
    if (check) {
      const command = check[1].trim()
      checks.push({ criterion, check: command, expect: null })
      for (const why of checkShapeProblems(command)) problem(why)
    } else if (expect) {
      const last = checks[checks.length - 1]
      if (!last || last.expect !== null) problem('EXPECT with no CHECK line above it to attach to')
      else {
        last.expect = expect[1].trim()
        if (/--test-name-pattern\b/.test(last.check) && /^#\s*pass\s+1$/.test(last.expect))
          problem('this CHECK runs but proves nothing: under `--test-name-pattern`, node prints "# pass 1" when the pattern matches NO test (the file itself counts), so it is green before the work exists; expect two or more matching tests ("# pass 2"), or grep the TAP line of the test\'s own title')
      }
    } else if (compare) {
      const value = compare[1].trim()
      const why = compareProblem(value, designSources)
      if (why) problem(why)
      else compares.push({ criterion, compare: value, ...parseCompare(value), landmarks: null })
    } else if (landmarks) {
      const last = compares[compares.length - 1]
      if (!last || last.landmarks !== null)
        problem('LANDMARKS with no COMPARE line above it to attach to; on its own it narrows nothing, while reading as though it did')
      else last.landmarks = landmarks[1].split(',').map((name) => name.trim()).filter(Boolean)
    } else if (CHECK_BULLET_NEAR.test(line)) {
      problem('CHECK/EXPECT/COMPARE/LANDMARKS written as its own bullet; indent it under the criterion bullet instead, or it never runs')
    } else if (bullet) {
      criterion = bullet[1].trim()
    } else if (CHECK_NEAR.test(line)) {
      problem('looks like a CHECK/EXPECT/COMPARE/LANDMARKS line but will not parse, so it would never run (needs the uppercase label at line start after indentation, a colon, and a value)')
    }
  })
  return { checks, compares, problems }
}

function describeRunError(error, timeoutMs) {
  if (error.code === 'ETIMEDOUT') return `timed out after ${timeoutMs / 1000}s`
  if (error.code === 'ENOBUFS')
    return `printed more than ${CHECK_MAX_BUFFER / 1024 / 1024} MB of output and was killed; quieten the command (drop debug logging, or pipe through tail) so its result can be read`
  return error.message
}

export function runCheck(check, { cwd, ran = null, timeoutMs = CHECK_TIMEOUT_MS } = {}) {
  const result =
    (ran && ran.get(check.check)) ||
    spawnSync(check.check, { cwd, shell: true, encoding: 'utf8', timeout: timeoutMs, maxBuffer: CHECK_MAX_BUFFER })
  if (ran) ran.set(check.check, result)
  const output = `${result.stdout || ''}${result.stderr || ''}`
  const lines = output.split('\n')
  const exitCode = result.status === null ? -1 : result.status
  const exitedCleanly = exitCode === 0 && !result.error
  const matching = check.expect === null ? [] : lines.filter((line) => line.includes(check.expect))
  const expectFound = check.expect === null || matching.length > 0
  const skipLine = matching.find(isSkipEvidence)
  const ranLine = matching.find((line) => CHECK_RAN_MARK.test(line))
  const anySkipLine = lines.find((line) => CHECK_SKIP_MARK.test(line))
  const anyRanLine = lines.find((line) => CHECK_RAN_MARK.test(line))
  const matchingLinesDecide = Boolean(skipLine || ranLine)
  const skipped =
    exitedCleanly && expectFound && (matchingLinesDecide ? Boolean(skipLine) && !ranLine : Boolean(anySkipLine) && !anyRanLine)
  const decidingLine = skipped
    ? (skipLine ?? anySkipLine)
    : (ranLine ?? matching.find((line) => !isSkipEvidence(line)) ?? matching[0])
  const passed = exitedCleanly && expectFound && !skipped
  const status = passed ? 'passed' : skipped ? 'skipped' : 'failed'
  let evidence
  if (result.error) evidence = `command could not run: ${describeRunError(result.error, timeoutMs)}`
  else if (skipped) evidence = decidingLine.trim().slice(0, 300)
  else if (passed) evidence = check.expect ? (decidingLine || check.expect).trim().slice(0, 300) : 'exit 0'
  else if (!exitedCleanly)
    evidence = `exit ${exitCode}${output.trim() ? ` — ${output.trim().split('\n').slice(-3).join(' / ').slice(0, 300)}` : ''}`
  else evidence = `exit 0, but the output does not contain ${JSON.stringify(check.expect)}`
  return { criterion: check.criterion, check: check.check, expect: check.expect, exitCode, passed, status, evidence }
}

export function runChecks(checks, options = {}) {
  return checks.map((check, index) => ({ n: index + 1, ...runCheck(check, options) }))
}

export function runCriteria({ ticket, checks, compares, problems }, options = {}) {
  const results = runChecks(checks, options)
  const passed = results.filter((result) => result.passed).length
  const skipped = results.filter((result) => result.status === 'skipped').length
  const comparisons = compares.map((compare, index) => ({
    n: index + 1,
    criterion: compare.criterion,
    compare: compare.compare,
    source: compare.source,
    widths: compare.widths,
    landmarks: compare.landmarks,
    status: 'manual',
    note: 'manual: run the design differ by hand and post its table',
  }))
  return {
    ticket,
    total: results.length,
    passed,
    skipped,
    allPassed: passed === results.length && problems.length === 0,
    checks: results,
    compares: comparisons,
    problems,
  }
}

const STATUS_MARK = { passed: '✓', skipped: '↓', failed: '✗' }

export function formatCheckReport(report) {
  const out = []
  const { checks, compares, problems } = report
  for (const result of checks) {
    out.push(`${STATUS_MARK[result.status]} ${result.n}/${checks.length} ${result.criterion || '(no criterion bullet above the CHECK line)'}`)
    out.push(`    $ ${result.check}`)
    out.push(`    ${result.evidence}`)
    if (result.status === 'skipped')
      out.push('    the evidence is a skip: the named work did not run, so this criterion has not passed. Give the command what it needed (a database, a credential, a service), or point EXPECT at a line that proves it ran.')
  }
  for (const compare of compares) {
    out.push(`⊙ ${compare.n}/${compares.length} ${compare.criterion || '(no criterion bullet above the COMPARE line)'}`)
    out.push(`    COMPARE: ${compare.compare}${compare.landmarks ? `\n    LANDMARKS: ${compare.landmarks.join(', ')}` : '  (every landmark: the whole page)'}`)
    out.push(`    ${compare.note}`)
  }
  for (const problem of problems) out.push(`! line ${problem.line}: ${problem.why}: ${problem.text}`)
  out.push(
    `${report.passed}/${report.total} checks passed` +
      (report.skipped ? `, ${report.skipped} skipped, which does not pass` : '') +
      (compares.length ? `; ${compares.length} comparison(s) are manual and counted in neither total nor passed` : '') +
      (problems.length ? `; ${problems.length} malformed line(s), which fail the check` : ''),
  )
  return out.join('\n')
}
