import { test, after } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, rmSync, writeFileSync, readFileSync, realpathSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { parseChecks, runChecks, buildLedger, formatLedger } from './checks.mjs'

const workdir = realpathSync(mkdtempSync(join(tmpdir(), 'flow-checks-')))
after(() => rmSync(workdir, { recursive: true, force: true }))

const DESIGN_SOURCES = ['designs/City Desktop.html', 'designs/map.html']

function ledgerFor(text, designSources = DESIGN_SOURCES) {
  return buildLedger({ ticket: 1, ...parseChecks(text, designSources) }, { cwd: workdir })
}

const say = (...lines) => `node -e "${lines.map((line) => `console.log('${line}')`).join(';')}"`

test('CHECK commands pass on exit 0 plus an EXPECT match, and exit 0 alone decides when EXPECT is absent', () => {
  const ledger = ledgerFor(`- prints the count
  CHECK: ${say('ok 3/3 pass')}
  EXPECT: ok 3/3
- exits clean, no EXPECT needed
  CHECK: node -e "process.exit(0)"`)
  assert.equal(ledger.total, 2)
  assert.equal(ledger.passed, 2)
  assert.equal(ledger.allPassed, true)
  assert.equal(ledger.checks[0].criterion, 'prints the count')
  assert.match(ledger.checks[0].evidence, /ok 3\/3/)
  assert.equal(ledger.checks[1].expect, null)
  assert.equal(ledger.checks[1].evidence, 'exit 0')
  assert.match(formatLedger(ledger), /2\/2 checks passed/)
})

test('commands run in the directory they are given', () => {
  writeFileSync(join(workdir, 'marker.txt'), 'here\n')
  const ledger = ledgerFor('- the marker is here\n  CHECK: cat marker.txt\n  EXPECT: here')
  assert.equal(ledger.allPassed, true)
})

test('an EXPECT the output does not contain fails', () => {
  const ledger = ledgerFor(`- claims yes but prints no\n  CHECK: ${say('no')}\n  EXPECT: yes`)
  assert.equal(ledger.allPassed, false)
  assert.equal(ledger.passed, 0)
  assert.match(ledger.checks[0].evidence, /does not contain "yes"/)
})

test('a nonzero exit fails with the exit code and the output as evidence', () => {
  const ledger = ledgerFor(`- exits 1\n  CHECK: node -e "console.error('boom'); process.exit(1)"`)
  assert.equal(ledger.allPassed, false)
  assert.match(ledger.checks[0].evidence, /exit 1/)
  assert.match(ledger.checks[0].evidence, /boom/)
})

test('no CHECK criteria is an empty ledger that passes: an answer, not a failure', () => {
  const ledger = ledgerFor('- prose criterion, verified by hand')
  assert.equal(ledger.total, 0)
  assert.equal(ledger.allPassed, true)
  assert.match(formatLedger(ledger), /has no CHECK criteria/)
})

test('malformed CHECK/EXPECT lines fail rather than silently never running', () => {
  const ledger = ledgerFor(`- lowercase label
  check: node -e "console.log('never runs')"
- orphan expect
  EXPECT: nothing above me
- CHECK: node -e "console.log('bullet form')"`)
  assert.equal(ledger.total, 0)
  assert.equal(ledger.allPassed, false)
  assert.equal(ledger.problems.length, 3)
  const reasons = ledger.problems.map((problem) => problem.why).join('\n')
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

test('a passing check is not killed by more than 1 MB of output', () => {
  const ledger = ledgerFor(`- passes underneath two megabytes of logging
  CHECK: node -e "process.stdout.write('x'.repeat(2 * 1024 * 1024) + '\\n'); console.log('noisy-ok 68/68')"
  EXPECT: noisy-ok 68/68`)
  assert.equal(ledger.allPassed, true)
  assert.match(ledger.checks[0].evidence, /noisy-ok 68\/68/)
})

test('a criterion whose evidence is a skip is recorded skipped, and a skip does not pass', () => {
  const ledger = ledgerFor(`- the tenant-scoping suite passes
  CHECK: ${say(' ↓ src/db/tenant.int.test.ts (12 tests | 12 skipped)', ' Test Files  1 skipped (1)', ' Tests  12 skipped (12)')}
  EXPECT: src/db/tenant.int.test.ts`)
  assert.equal(ledger.allPassed, false)
  assert.equal(ledger.passed, 0)
  assert.equal(ledger.skipped, 1)
  assert.equal(ledger.checks[0].status, 'skipped')
  assert.equal(ledger.checks[0].passed, false)
  assert.match(ledger.checks[0].evidence, /12 skipped/)
  const text = formatLedger(ledger)
  assert.match(text, /↓ 1\/1 the tenant-scoping suite passes/)
  assert.match(text, /did not run/)
  assert.match(text, /0\/1 checks passed, 1 skipped/)
})

test('a skip is judged on the deciding line, so a skipped test among passing ones is caught', () => {
  const ledger = ledgerFor(`- the route refuses a foreign tenant
  CHECK: ${say(' ✓ contracts > digest round trip 3ms', ' ↓ routes > refuses a foreign tenant', ' Tests  1 passed | 1 skipped (2)')}
  EXPECT: refuses a foreign tenant`)
  assert.equal(ledger.checks[0].status, 'skipped')
  assert.match(ledger.checks[0].evidence, /↓ routes > refuses a foreign tenant/)
})

test('with no EXPECT to point at, a run that reports only skips is skipped too', () => {
  const ledger = ledgerFor(`- the integration suite runs\n  CHECK: ${say(' Test Files  1 skipped (1)', ' Tests  12 skipped (12)')}`)
  assert.equal(ledger.checks[0].status, 'skipped')
  assert.equal(ledger.skipped, 1)
})

test('a command echo repeating the EXPECT string does not outvote the skip below it', () => {
  const ledger = ledgerFor(`- the tenant-scoping suite passes
  CHECK: ${say('', '> backend@1.0.0 test', '> vitest run src/db/tenant.int.test.ts', '', ' ↓ src/db/tenant.int.test.ts (12 tests | 12 skipped)', ' Tests  12 skipped (12)')}
  EXPECT: src/db/tenant.int.test.ts`)
  assert.equal(ledger.checks[0].status, 'skipped')
  assert.match(ledger.checks[0].evidence, /12 skipped/)
})

test('a file skipped inside a suite that ran still passes: the run line outvotes the skip line', () => {
  const ledger = ledgerFor(`- the database tests pass
  CHECK: ${say(' ↓ src/db/legacy.test.ts (2 tests | 2 skipped)', ' Tests  12 passed (12) in src/db')}
  EXPECT: src/db`)
  assert.equal(ledger.allPassed, true)
  assert.match(ledger.checks[0].evidence, /12 passed/)
})

test('an EXPECT that matches only the line announcing the run does not pass a suite that skipped', () => {
  const ledger = ledgerFor(`- the tenant-scoping suite passes
  CHECK: ${say('> vitest run src/db/tenant.int.test.ts', '', ' Test Files  1 skipped (1)', ' Tests  12 skipped (12)')}
  EXPECT: src/db/tenant.int.test.ts`)
  assert.equal(ledger.checks[0].status, 'skipped')
  assert.match(ledger.checks[0].evidence, /1 skipped/)
})

test('a TAP run is read by its own per-test lines, so a skip beside a pass is not "nothing ran"', () => {
  const mixed = ledgerFor(`- the digest round trip holds
  CHECK: ${say('TAP version 13', '1..2', 'ok 1 - the digest round trips', 'ok 2 - the integration case # SKIP no DATABASE_URL')}`)
  assert.equal(mixed.checks[0].status, 'passed')
  const allSkipped = ledgerFor(`- the integration cases hold
  CHECK: ${say('TAP version 13', '1..2', 'ok 1 - the integration case # SKIP no DATABASE_URL', 'not ok 2 - the write fence # SKIP no DATABASE_URL')}`)
  assert.equal(allSkipped.checks[0].status, 'skipped')
})

test('runs that did happen still pass: skipped neighbours, the word "skipped", node --test counts', () => {
  const ledger = ledgerFor(`- the suite passes with a couple of tests skipped
  CHECK: ${say(' Tests  246 passed | 2 skipped (248)')}
  EXPECT: 246 passed
- the migration is skipped when the table already exists
  CHECK: ${say('the migration is skipped when the table already exists')}
  EXPECT: migration is skipped
- node --test counts its skips beside its passes
  CHECK: ${say('# pass 56', '# fail 0', '# skipped 2')}
  EXPECT: # fail 0`)
  assert.equal(ledger.allPassed, true)
  assert.deepEqual(ledger.checks.map((check) => check.status), ['passed', 'passed', 'passed'])
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
  const ledger = ledgerFor(`- the hero and the nav match the artboard at both widths
  COMPARE: designs/City Desktop.html @ 1440,393
  LANDMARKS: hero, nav
- the command answers
  CHECK: ${say('ok 1/1')}
  EXPECT: ok 1/1`)
  assert.equal(ledger.total, 1)
  assert.equal(ledger.passed, 1)
  assert.equal(ledger.allPassed, true)
  assert.equal(ledger.compares.length, 1)
  const [compare] = ledger.compares
  assert.equal(compare.criterion, 'the hero and the nav match the artboard at both widths')
  assert.equal(compare.source, 'designs/City Desktop.html', 'everything before the last @ is the path, spaces included')
  assert.deepEqual(compare.widths, [1440, 393])
  assert.deepEqual(compare.landmarks, ['hero', 'nav'])
  assert.equal(compare.status, 'manual')
  assert.match(formatLedger(ledger), /1 comparison\(s\) are manual and counted in neither total nor passed/)
})

test('a COMPARE with no LANDMARKS line is the whole page, and is still not a check', () => {
  const ledger = ledgerFor('- the whole page matches the artboard\n  COMPARE: designs/map.html @ 1440')
  assert.equal(ledger.total, 0)
  assert.equal(ledger.allPassed, true)
  assert.equal(ledger.compares[0].landmarks, null)
  assert.match(formatLedger(ledger), /the whole page/)
})

test('a malformed COMPARE is a problem and fails, exactly as a malformed CHECK does', () => {
  for (const [text, reason] of [
    ['- the page renders as drawn\n  COMPARE: designs/map.html', /no "@ <width>"/],
    ['- the hero matches\n  LANDMARKS: hero', /no COMPARE line above it/],
    ['- the page matches\n  COMPARE: designs/other.html @ 1440', /"Design sources:" setting does not list/],
    ['- the page matches\n  COMPARE: designs/map.html @ wide', /not widths/],
    ['- the page matches\n  COMPARE: @ 1440', /no design source path/],
  ]) {
    const ledger = ledgerFor(text)
    assert.equal(ledger.allPassed, false, text)
    assert.equal(ledger.compares.length, 0, 'a malformed comparison is never silently listed')
    assert.equal(ledger.problems.length, 1, text)
    assert.match(ledger.problems[0].why, reason)
  }
  assert.match(ledgerFor('- x\n  COMPARE: designs/map.html @ 1440', null).problems[0].why, /declare no "Design sources:"/)
})

test('prose that merely begins "Compare:" or "Landmarks:" is not a malformed criterion', () => {
  const ledger = ledgerFor(`- Compare: the old output with the new one by hand.
- Landmarks: every section keeps its heading.
  Compare: both by eye.
- it runs
  CHECK: true`)
  assert.deepEqual(ledger.problems, [])
  assert.equal(ledger.allPassed, true)
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
    const ledger = ledgerFor(`- the page matches\n${shape}\n- it runs\n  CHECK: true`)
    assert.equal(ledger.problems.length, 1, `${JSON.stringify(shape)}: ${JSON.stringify(ledger.problems)}`)
    assert.equal(ledger.allPassed, false)
  }
})

test('line numbers start where the criteria block starts in the issue body', () => {
  const { problems } = parseChecks('- a\n  check: true', null, { firstLine: 20 })
  assert.equal(problems[0].line, 21)
})
