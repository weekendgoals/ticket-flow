import { test, after } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, rmSync, writeFileSync, readFileSync, realpathSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { spawn } from 'node:child_process'
import { setTimeout as wait } from 'node:timers/promises'
import { parseChecks, runChecks, runCriteria, formatCheckReport } from './checks.mjs'

const workdir = realpathSync(mkdtempSync(join(tmpdir(), 'flow-checks-')))
after(() => rmSync(workdir, { recursive: true, force: true }))

const DESIGN_SOURCES = ['designs/City Desktop.html', 'designs/map.html']

function reportFor(text, designSources = DESIGN_SOURCES) {
  return runCriteria({ ticket: 1, ...parseChecks(text, designSources) }, { cwd: workdir })
}

const say = (...lines) => `node -e "${lines.map((line) => `console.log('${line}')`).join(';')}"`

test('CHECK commands pass on exit 0 plus an EXPECT match, and exit 0 alone decides when EXPECT is absent', () => {
  const report = reportFor(`- prints the count
  CHECK: ${say('ok 3/3 pass')}
  EXPECT: ok 3/3
- exits clean, no EXPECT needed
  CHECK: node -e "process.exit(0)"`)
  assert.equal(report.total, 2)
  assert.equal(report.passed, 2)
  assert.equal(report.allPassed, true)
  assert.equal(report.checks[0].criterion, 'prints the count')
  assert.match(report.checks[0].evidence, /ok 3\/3/)
  assert.equal(report.checks[1].expect, null)
  assert.equal(report.checks[1].evidence, 'exit 0')
  assert.match(formatCheckReport(report), /2\/2 checks passed/)
})

test('commands run in the directory they are given', () => {
  writeFileSync(join(workdir, 'marker.txt'), 'here\n')
  const report = reportFor('- the marker is here\n  CHECK: cat marker.txt\n  EXPECT: here')
  assert.equal(report.allPassed, true)
})

test('an EXPECT the output does not contain fails', () => {
  const report = reportFor(`- claims yes but prints no\n  CHECK: ${say('no')}\n  EXPECT: yes`)
  assert.equal(report.allPassed, false)
  assert.equal(report.passed, 0)
  assert.match(report.checks[0].evidence, /does not contain "yes"/)
})

test('a nonzero exit fails with the exit code and the output as evidence', () => {
  const report = reportFor(`- exits 1\n  CHECK: node -e "console.error('boom'); process.exit(1)"`)
  assert.equal(report.allPassed, false)
  assert.match(report.checks[0].evidence, /exit 1/)
  assert.match(report.checks[0].evidence, /boom/)
})

test('a failed check carries the end of its output: twenty lines at most, two thousand characters at most, and a passed one carries none', () => {
  const report = reportFor(`- fails loudly
  CHECK: node -e "for (let n = 1; n <= 30; n++) console.log('line ' + n); console.error('boom'); process.exit(2)"
- fails with long lines
  CHECK: node -e "for (let n = 1; n <= 5; n++) console.log(String(n).repeat(900)); process.exit(1)"
- fails an EXPECT
  CHECK: ${say('no')}
  EXPECT: yes
- passes
  CHECK: ${say('fine')}`)
  const [loud, long, expect, passed] = report.checks
  assert.equal(loud.tail.split('\n').length, 20)
  assert.match(loud.tail, /^line 12\n[\s\S]*line 30\nboom$/)
  assert.equal(long.tail.length, 2000)
  assert.ok(long.tail.endsWith('5'.repeat(900)))
  assert.equal(expect.tail, 'no')
  assert.equal(passed.tail, '')
  const printed = formatCheckReport(report)
  assert.match(printed, /✗ 1\/4 fails loudly\n {4}\$ node -e .*\n {4}exit 2 — line 29 \/ line 30 \/ boom\n {4}the end of its output:\n {6}line 12\n {6}line 13\n/)
  assert.match(printed, / {6}line 30\n {6}boom\n✗ 2\/4/)
  assert.doesNotMatch(printed, /✓ 4\/4 passes\n {4}\$ .*\n {4}.*\n {4}the end of its output/)
})

test('the runner alone passes an empty list; refusing a ticket with no criteria is the body parser\'s job', () => {
  const report = reportFor('- prose criterion, verified by hand')
  assert.equal(report.total, 0)
  assert.equal(report.allPassed, true)
  assert.match(formatCheckReport(report), /^0\/0 checks passed$/)
})

test('malformed CHECK/EXPECT lines fail rather than silently never running', () => {
  const report = reportFor(`- lowercase label
  check: node -e "console.log('never runs')"
- orphan expect
  EXPECT: nothing above me
- CHECK: node -e "console.log('bullet form')"`)
  assert.equal(report.total, 0)
  assert.equal(report.allPassed, false)
  assert.equal(report.problems.length, 3)
  const reasons = report.problems.map((problem) => problem.why).join('\n')
  assert.match(reasons, /will not parse/)
  assert.match(reasons, /no CHECK line above it/)
  assert.match(reasons, /its own bullet/)
})

test('a CHECK shape that runs but can never pass is a problem: an escaped pipe in a quoted script', () => {
  const { problems } = parseChecks(`- FND-2's MobileSidebar check
  CHECK: cd ui && node -e "const{execSync}=require('child_process');const o=execSync('grep -rn \\"MobileSidebar\\\\|mobile-sidebar\\" src test || true').toString();process.exit(o.trim()?1:0)"`)
  assert.equal(problems.length, 1)
  assert.match(problems[0].why, /can never pass/)
  assert.match(problems[0].why, /loses one backslash/)
})

test('grep -r with -c is a problem in every spelling, and a sound single-file count is not', () => {
  const { problems } = parseChecks(`- spelled -rc
  CHECK: grep -rc generateBreadcrumbListSchema src
  EXPECT: 1
- spelled -cr inside sh -c
  CHECK: sh -c "grep -cr generateBreadcrumbListSchema src"
  EXPECT: 1
- spelled as two flags
  CHECK: grep -r -c generateBreadcrumbListSchema src
  EXPECT: 1
- a single-file count prints a bare number and passed live
  CHECK: grep -c "Me and the log" api-gateway/CLAUDE.md
  EXPECT: 1`)
  assert.equal(problems.length, 3)
  assert.ok(problems.every((problem) => /never a bare number/.test(problem.why)))
  assert.ok(!problems.some((problem) => problem.text.includes('Me and the log')))
})

test('a --test-name-pattern CHECK expecting "# pass 1" proves nothing and is a problem; "# pass 2" and a whole file are not', () => {
  const vacuous = parseChecks("- pinned\n  CHECK: node --test --test-name-pattern 'staging rule' suite.test.mjs\n  EXPECT: # pass 1")
  assert.equal(vacuous.problems.length, 1)
  assert.match(vacuous.problems[0].why, /matches NO test/)
  assert.match(vacuous.problems[0].why, /# pass 2/)
  assert.deepEqual(parseChecks("- a\n  CHECK: node --test --test-name-pattern 'x' s.test.mjs\n  EXPECT: # pass 2").problems, [])
  assert.deepEqual(parseChecks("- a\n  CHECK: node --test --test-name-pattern 'x' s.test.mjs\n  EXPECT: # pass 12").problems, [])
  assert.deepEqual(parseChecks('- a\n  CHECK: node --test one-test-file.test.mjs\n  EXPECT: # pass 1').problems, [])
})

test('a command that outlives its timeout fails with the timeout as evidence', () => {
  const [result] = runChecks(parseChecks('- hangs\n  CHECK: node -e "setTimeout(() => {}, 5000)"').checks, { cwd: workdir, timeoutMs: 300 })
  assert.equal(result.status, 'failed')
  assert.equal(result.passed, false)
  assert.equal(result.evidence, 'command could not run: timed out after 0.3s')
})

function alive(pid) {
  try {
    process.kill(pid, 0)
    return true
  } catch {
    return false
  }
}

async function goneWithin(pid, ms) {
  for (const deadline = Date.now() + ms; Date.now() < deadline; await wait(50)) if (!alive(pid)) return true
  return !alive(pid)
}

async function fileWithin(path, ms) {
  for (const deadline = Date.now() + ms; Date.now() < deadline; await wait(50)) {
    const text = (() => {
      try {
        return readFileSync(path, 'utf8').trim()
      } catch {
        return ''
      }
    })()
    if (text) return text
  }
  throw new Error(`${path} never appeared`)
}

test('a check cut off by its timeout takes the processes it started with it', async () => {
  const pidFile = join(workdir, 'timeout-child.pid')
  const [result] = runChecks([{ criterion: 'hangs', check: `sleep 30 & echo $! > ${pidFile}; wait`, expect: null }], { cwd: workdir, timeoutMs: 500 })
  assert.equal(result.evidence, 'command could not run: timed out after 0.5s')
  assert.ok(await goneWithin(Number(readFileSync(pidFile, 'utf8')), 3000), 'the background sleep was killed')
})

test('a check leaves nothing running once it exits', async () => {
  const pidFile = join(workdir, 'leftover.pid')
  const started = Date.now()
  const [result] = runChecks([{ criterion: 'starts a server and returns', check: `sleep 30 & echo $! > ${pidFile}`, expect: null }], { cwd: workdir })
  assert.equal(result.passed, true)
  assert.ok(Date.now() - started < 10_000)
  assert.ok(await goneWithin(Number(readFileSync(pidFile, 'utf8')), 3000))
})

for (const signal of ['SIGTERM', 'SIGINT']) {
  test(`a check whose caller gets ${signal} is killed with everything it started`, async () => {
    const pidFile = join(workdir, `caller-${signal}.pid`)
    const checksModule = new URL('./checks.mjs', import.meta.url).href
    const check = JSON.stringify({ criterion: 'runs long', check: `sleep 30 & echo $! > ${pidFile}; wait`, expect: null })
    const caller = spawn(process.execPath, ['--input-type=module', '-e', `import { runChecks } from ${JSON.stringify(checksModule)}; runChecks([${check}], { cwd: ${JSON.stringify(workdir)} })`], { stdio: 'ignore' })
    const pid = Number(await fileWithin(pidFile, 5000))
    caller.kill(signal)
    assert.ok(await goneWithin(pid, 4000), 'the check outlived its caller')
  })
}

test('a passing check is not killed by more than 1 MB of output', () => {
  const report = reportFor(`- passes underneath two megabytes of logging
  CHECK: node -e "process.stdout.write('x'.repeat(2 * 1024 * 1024) + '\\n'); console.log('noisy-ok 68/68')"
  EXPECT: noisy-ok 68/68`)
  assert.equal(report.allPassed, true)
  assert.match(report.checks[0].evidence, /noisy-ok 68\/68/)
})

test('a criterion whose evidence is a skip is recorded skipped, and a skip does not pass', () => {
  const report = reportFor(`- the tenant-scoping suite passes
  CHECK: ${say(' ↓ src/db/tenant.int.test.ts (12 tests | 12 skipped)', ' Test Files  1 skipped (1)', ' Tests  12 skipped (12)')}
  EXPECT: src/db/tenant.int.test.ts`)
  assert.equal(report.allPassed, false)
  assert.equal(report.passed, 0)
  assert.equal(report.skipped, 1)
  assert.equal(report.checks[0].status, 'skipped')
  assert.equal(report.checks[0].passed, false)
  assert.match(report.checks[0].evidence, /12 skipped/)
  const text = formatCheckReport(report)
  assert.match(text, /↓ 1\/1 the tenant-scoping suite passes/)
  assert.match(text, /did not run/)
  assert.match(text, /0\/1 checks passed, 1 skipped/)
})

test('a skip is judged on the deciding line, so a skipped test among passing ones is caught', () => {
  const report = reportFor(`- the route refuses a foreign tenant
  CHECK: ${say(' ✓ contracts > digest round trip 3ms', ' ↓ routes > refuses a foreign tenant', ' Tests  1 passed | 1 skipped (2)')}
  EXPECT: refuses a foreign tenant`)
  assert.equal(report.checks[0].status, 'skipped')
  assert.match(report.checks[0].evidence, /↓ routes > refuses a foreign tenant/)
})

test('with no EXPECT to point at, a run that reports only skips is skipped too', () => {
  const report = reportFor(`- the integration suite runs\n  CHECK: ${say(' Test Files  1 skipped (1)', ' Tests  12 skipped (12)')}`)
  assert.equal(report.checks[0].status, 'skipped')
  assert.equal(report.skipped, 1)
})

test('a command echo repeating the EXPECT string does not outvote the skip below it', () => {
  const report = reportFor(`- the tenant-scoping suite passes
  CHECK: ${say('', '> backend@1.0.0 test', '> vitest run src/db/tenant.int.test.ts', '', ' ↓ src/db/tenant.int.test.ts (12 tests | 12 skipped)', ' Tests  12 skipped (12)')}
  EXPECT: src/db/tenant.int.test.ts`)
  assert.equal(report.checks[0].status, 'skipped')
  assert.match(report.checks[0].evidence, /12 skipped/)
})

test('a file skipped inside a suite that ran still passes: the run line outvotes the skip line', () => {
  const report = reportFor(`- the database tests pass
  CHECK: ${say(' ↓ src/db/legacy.test.ts (2 tests | 2 skipped)', ' Tests  12 passed (12) in src/db')}
  EXPECT: src/db`)
  assert.equal(report.allPassed, true)
  assert.match(report.checks[0].evidence, /12 passed/)
})

test('an EXPECT that matches only the line announcing the run does not pass a suite that skipped', () => {
  const report = reportFor(`- the tenant-scoping suite passes
  CHECK: ${say('> vitest run src/db/tenant.int.test.ts', '', ' Test Files  1 skipped (1)', ' Tests  12 skipped (12)')}
  EXPECT: src/db/tenant.int.test.ts`)
  assert.equal(report.checks[0].status, 'skipped')
  assert.match(report.checks[0].evidence, /1 skipped/)
})

test('a TAP run is read by its own per-test lines, so a skip beside a pass is not "nothing ran"', () => {
  const mixed = reportFor(`- the digest round trip holds
  CHECK: ${say('TAP version 13', '1..2', 'ok 1 - the digest round trips', 'ok 2 - the integration case # SKIP no DATABASE_URL')}`)
  assert.equal(mixed.checks[0].status, 'passed')
  const allSkipped = reportFor(`- the integration cases hold
  CHECK: ${say('TAP version 13', '1..2', 'ok 1 - the integration case # SKIP no DATABASE_URL', 'not ok 2 - the write fence # SKIP no DATABASE_URL')}`)
  assert.equal(allSkipped.checks[0].status, 'skipped')
})

test('runs that did happen still pass: skipped neighbours, the word "skipped", node --test counts', () => {
  const report = reportFor(`- the suite passes with a couple of tests skipped
  CHECK: ${say(' Tests  246 passed | 2 skipped (248)')}
  EXPECT: 246 passed
- the migration is skipped when the table already exists
  CHECK: ${say('the migration is skipped when the table already exists')}
  EXPECT: migration is skipped
- node --test counts its skips beside its passes
  CHECK: ${say('# pass 56', '# fail 0', '# skipped 2')}
  EXPECT: # fail 0`)
  assert.equal(report.allPassed, true)
  assert.deepEqual(report.checks.map((check) => check.status), ['passed', 'passed', 'passed'])
})

test('one command shared by several criteria runs once when a run cache is handed in', () => {
  const counter = join(workdir, 'count.txt')
  writeFileSync(counter, '')
  const command = `echo x >> ${counter} && echo done`
  const { checks } = parseChecks(`- a\n  CHECK: ${command}\n  EXPECT: done\n- b\n  CHECK: ${command}`)
  const results = runChecks(checks, { cwd: workdir, ran: new Map() })
  assert.deepEqual(results.map((result) => result.passed), [true, true])
  assert.equal(readFileSync(counter, 'utf8').split('\n').filter(Boolean).length, 1)
})

test('comparisons are listed apart from checks, manual, in neither total nor passed', () => {
  const report = reportFor(`- the hero and the nav match the artboard at both widths
  COMPARE: designs/City Desktop.html @ 1440,393
  LANDMARKS: hero, nav
- the command answers
  CHECK: ${say('ok 1/1')}
  EXPECT: ok 1/1`)
  assert.equal(report.total, 1)
  assert.equal(report.passed, 1)
  assert.equal(report.allPassed, true)
  assert.equal(report.compares.length, 1)
  const [compare] = report.compares
  assert.equal(compare.criterion, 'the hero and the nav match the artboard at both widths')
  assert.equal(compare.source, 'designs/City Desktop.html', 'everything before the last @ is the path, spaces included')
  assert.deepEqual(compare.widths, [1440, 393])
  assert.deepEqual(compare.landmarks, ['hero', 'nav'])
  assert.equal(compare.status, 'manual')
  assert.match(formatCheckReport(report), /1 comparison\(s\) are manual and counted in neither total nor passed/)
})

test('a COMPARE with no LANDMARKS line is the whole page, and is still not a check', () => {
  const report = reportFor('- the whole page matches the artboard\n  COMPARE: designs/map.html @ 1440')
  assert.equal(report.total, 0)
  assert.equal(report.allPassed, true)
  assert.equal(report.compares[0].landmarks, null)
  assert.match(formatCheckReport(report), /the whole page/)
})

test('a malformed COMPARE is a problem and fails, exactly as a malformed CHECK does', () => {
  for (const [text, reason] of [
    ['- the page renders as drawn\n  COMPARE: designs/map.html', /no "@ <width>"/],
    ['- the hero matches\n  LANDMARKS: hero', /no COMPARE line above it/],
    ['- the page matches\n  COMPARE: designs/other.html @ 1440', /"Design sources:" setting does not list/],
    ['- the page matches\n  COMPARE: designs/map.html @ wide', /not widths/],
    ['- the page matches\n  COMPARE: @ 1440', /no design source path/],
  ]) {
    const report = reportFor(text)
    assert.equal(report.allPassed, false, text)
    assert.equal(report.compares.length, 0, 'a malformed comparison is never silently listed')
    assert.equal(report.problems.length, 1, text)
    assert.match(report.problems[0].why, reason)
  }
  assert.match(reportFor('- x\n  COMPARE: designs/map.html @ 1440', null).problems[0].why, /declare no "Design sources:"/)
})

test('prose that merely begins "Compare:" or "Landmarks:" is not a malformed criterion', () => {
  const report = reportFor(`- Compare: the old output with the new one by hand.
- Landmarks: every section keeps its heading.
  Compare: both by eye.
- it runs
  CHECK: true`)
  assert.deepEqual(report.problems, [])
  assert.equal(report.allPassed, true)
})

test('a comparison-shaped line that will not parse is a problem in every spelling', () => {
  for (const shape of [
    '- Compare: designs/map.html @ 1440',
    '- compare: designs/map.html @ 1440',
    '  Compare: designs/map.html @1440',
    '  compare: designs/map.html @ 1440,393',
    '- COMPARE: designs/map.html @ 1440',
    '  LANDMARKS : hero, nav',
  ]) {
    const report = reportFor(`- the page matches\n${shape}\n- it runs\n  CHECK: true`)
    assert.equal(report.problems.length, 1, `${JSON.stringify(shape)}: ${JSON.stringify(report.problems)}`)
    assert.equal(report.allPassed, false)
  }
})

test('line numbers start where the criteria block starts in the issue body', () => {
  const { problems } = parseChecks('- a\n  check: true', null, { firstLine: 20 })
  assert.equal(problems[0].line, 21)
})
