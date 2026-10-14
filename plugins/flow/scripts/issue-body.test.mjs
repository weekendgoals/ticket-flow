import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  splitSections,
  parseBlockedBy,
  parseEpicLine,
  parseTaskList,
  parseSettings,
  parseEpicBody,
  parseDesignMap,
  parseTicketBody,
  parseCriteriaSection,
  withEpicLine,
  withBlockedBy,
  withTicketListed,
  withTicketChecked,
} from './issue-body.mjs'

const EPIC_BODY = `## Outcome

People can export their trips as a calendar file.

## Sources

- the conversation of 2026-10-14

## Settings

Delivery: incremental
Parallel: 2
Design sources: designs/City Desktop.html, designs/map.html
Consequence paths: src/auth/**, migrations/**
Branch: epic/trip-export
Reviewer note: anything else is kept, not refused

## Walkthrough

A traveller opens a trip and downloads it.

## Ground rules

- no new dependencies

## Tickets

- [x] #12 — the export endpoint
- [ ] #13 — the download button
- [ ] #14 the settings page
`

const TICKET_BODY = `Epic: #11
Blocked by: #12, #13

## Scope

- add the button

## Not in scope

- styling the calendar

## Acceptance criteria

- the button downloads a file

\`\`\`criteria
- the export test passes
  CHECK: npm test -- export
  EXPECT: 3 passed
- the page matches the design
  COMPARE: designs/map.html @ 1440, 393
  LANDMARKS: header
\`\`\`

## Notes

The old exporter lives in legacy/.
`

test('sections are read by their level-two headings, and a heading inside a code fence is not one', () => {
  const { preamble, section, names } = splitSections('intro line\n\n## One\n\nfirst\n```\n## not a heading\n```\n## Two\nsecond\n')
  assert.equal(preamble, 'intro line')
  assert.deepEqual(names, ['one', 'two'])
  assert.match(section('one').text, /## not a heading/)
  assert.equal(section('two').text, 'second')
  assert.equal(section('three'), null)
})

test('an epic body yields its outcome, settings and ordered ticket list', () => {
  const epic = parseEpicBody(EPIC_BODY)
  assert.match(epic.outcome, /calendar file/)
  assert.match(epic.walkthrough, /downloads it/)
  assert.match(epic.groundRules, /no new dependencies/)
  assert.deepEqual(epic.settings.designSources, ['designs/City Desktop.html', 'designs/map.html'])
  assert.deepEqual(epic.settings.consequencePaths, ['src/auth/**', 'migrations/**'])
  assert.equal(epic.settings.delivery, 'incremental')
  assert.equal(epic.settings.parallel, 2)
  assert.equal(epic.settings.branch, 'epic/trip-export')
  assert.deepEqual(epic.settings.other, { 'Reviewer note': 'anything else is kept, not refused' })
  assert.deepEqual(
    epic.tickets.map((task) => [task.number, task.checked, task.title]),
    [
      [12, true, 'the export endpoint'],
      [13, false, 'the download button'],
      [14, false, 'the settings page'],
    ],
  )
  assert.deepEqual(epic.problems, [])
})

test('settings default to a serial release, and a value that cannot be read is a problem, never a default', () => {
  assert.deepEqual(parseSettings('').settings, { delivery: 'release', parallel: 1, designSources: null, consequencePaths: [], branch: null, rejectedBranch: null, other: {} })
  const bad = parseSettings('Delivery: incremetal\nParallel: 4\nthis line is prose')
  assert.equal(bad.settings.delivery, null)
  assert.equal(bad.settings.parallel, null)
  assert.equal(bad.problems.length, 3)
  assert.match(bad.problems[0], /neither release nor incremental/)
  assert.match(bad.problems[1], /from 1 to 3/)
  assert.match(bad.problems[2], /not "Key: value"/)
  assert.equal(parseSettings('- Delivery: Incremental').settings.delivery, 'incremental')
})

test('a ticket body yields its epic, blockers, sections and parsed criteria', () => {
  const ticket = parseTicketBody(TICKET_BODY, ['designs/map.html'])
  assert.equal(ticket.epic, 11)
  assert.deepEqual(ticket.blockedBy, [12, 13])
  assert.equal(ticket.blockedByProblem, null)
  assert.equal(ticket.scope, '- add the button')
  assert.equal(ticket.notInScope, '- styling the calendar')
  assert.match(ticket.notes, /legacy/)
  assert.equal(ticket.criteria.checks.length, 1)
  assert.deepEqual(ticket.criteria.checks[0], { criterion: 'the export test passes', check: 'npm test -- export', expect: '3 passed' })
  assert.equal(ticket.criteria.compares.length, 1)
  assert.deepEqual(ticket.criteria.compares[0].widths, [1440, 393])
  assert.deepEqual(ticket.criteria.compares[0].landmarks, ['header'])
  assert.deepEqual(ticket.criteria.problems, [])
})

test('Windows line endings in an issue body read the same as Unix ones', () => {
  const ticket = parseTicketBody(TICKET_BODY.replace(/\n/g, '\r\n'), ['designs/map.html'])
  assert.deepEqual(ticket.blockedBy, [12, 13])
  assert.equal(ticket.criteria.checks[0].check, 'npm test -- export')
  assert.deepEqual(ticket.criteria.problems, [])
})

test('Blocked by: absent means independent, and the strict line takes issue numbers and commas only', () => {
  assert.deepEqual(parseBlockedBy('Epic: #1\n\n## Scope\n- x'), { blockedBy: [], problem: null })
  assert.deepEqual(parseBlockedBy('Blocked by: #4'), { blockedBy: [4], problem: null })
  assert.deepEqual(parseBlockedBy('Blocked by: #4,#5 ,  #4  '), { blockedBy: [4, 5], problem: null })
})

test('Blocked by: a line about blocking that does not parse is a named problem, never a guess', () => {
  for (const line of [
    'Blocked by: #4 and #5',
    'Blocked by: 4',
    'Blocked by: #4 once its API settles',
    'Blocked by:',
    'Blocked by: none',
    '**Blocked by:** #4',
    '- Blocked by: #4',
    '  Blocked by: #4',
    'blocked by: #4',
    'Blocked-by: #4',
    '> Blocked by: #4',
  ]) {
    const parsed = parseBlockedBy(`Epic: #1\n${line}\n`)
    assert.deepEqual(parsed.blockedBy, [], line)
    assert.match(parsed.problem, /cannot be read/, line)
    assert.ok(parsed.problem.includes(line.trim()), `the problem quotes the line: ${line}`)
  }
})

test('Blocked by: prose that merely mentions blocking, or a line inside a code fence, is not read', () => {
  assert.deepEqual(parseBlockedBy('## Scope\nThis work was blocked by the old API for months.\n'), { blockedBy: [], problem: null })
  assert.deepEqual(parseBlockedBy('```\nBlocked by: #4 and #5\n```\n'), { blockedBy: [], problem: null })
})

test('Blocked by: two lines are a problem, so nobody has to guess which one counts', () => {
  const parsed = parseBlockedBy('Blocked by: #4\n\nBlocked by: #5\n')
  assert.deepEqual(parsed.blockedBy, [])
  assert.match(parsed.problem, /2 "Blocked by" lines \(lines 1, 3\)/)
})

test('the Epic line names the parent by number', () => {
  assert.equal(parseEpicLine('Epic: #42\n'), 42)
  assert.equal(parseEpicLine('Epic: 42\n'), null)
  assert.equal(parseEpicLine('no epic here'), null)
})

test('the task list reads checked and unchecked items, with or without a dash before the title', () => {
  assert.deepEqual(parseTaskList('- [ ] #3 — a\n* [X] #4 - b\n- [ ] #5\n- not a task #6\n'), [
    { number: 3, checked: false, title: 'a' },
    { number: 4, checked: true, title: 'b' },
    { number: 5, checked: false, title: '' },
  ])
})

test('criteria: a ticket with no criteria block is a problem, because deleting the block must not turn a ticket green', () => {
  const prose = parseTicketBody('Epic: #1\n\n## Acceptance criteria\n\n- prose, checked by hand\n')
  assert.deepEqual(prose.criteria.checks, [])
  assert.equal(prose.criteria.problems.length, 1)
  assert.match(prose.criteria.problems[0].why, /no ```criteria block/)
  assert.equal(prose.criteria.problems[0].line, 3)
  const noSection = parseTicketBody('Epic: #1\n\n## Scope\n\n- x\n')
  assert.match(noSection.criteria.problems[0].why, /no ```criteria block/)
  assert.equal(noSection.criteria.problems[0].line, null)
})

test('criteria: an empty block is a problem, and a block holding only a COMPARE is not', () => {
  const empty = parseTicketBody('## Acceptance criteria\n\n```criteria\n- prose\n```\n')
  assert.match(empty.criteria.problems[0].why, /no CHECK or COMPARE line/)
  const compareOnly = parseTicketBody('## Acceptance criteria\n\n```criteria\n- page\n  COMPARE: d.html @ 1440\n```\n', ['d.html'])
  assert.deepEqual(compareOnly.criteria.problems, [])
})

test('criteria: a CHECK outside the criteria block never runs, so it is a problem', () => {
  const ticket = parseTicketBody('Epic: #1\n\n## Acceptance criteria\n\n- it runs\n  CHECK: true\n')
  assert.equal(ticket.criteria.checks.length, 0)
  const outside = ticket.criteria.problems.filter((problem) => /outside the ```criteria block never runs/.test(problem.why))
  assert.equal(outside.length, 1)
  assert.equal(outside[0].line, 6, 'the line number is the line in the issue body')
})

test('criteria: lines in a fence not marked criteria, two criteria blocks, and a block that never closes are problems', () => {
  const unmarked = parseTicketBody('## Acceptance criteria\n\n```\n- it runs\n  CHECK: true\n```\n')
  assert.ok(unmarked.criteria.problems.some((problem) => /not marked ```criteria/.test(problem.why)))
  const two = parseTicketBody('## Acceptance criteria\n\n```criteria\n- a\n  CHECK: true\n```\n\n```criteria\n- b\n  CHECK: false\n```\n')
  assert.equal(two.criteria.checks.length, 1)
  assert.match(two.criteria.problems[0].why, /2 criteria blocks/)
  const open = parseTicketBody('## Acceptance criteria\n\n```criteria\n- a\n  CHECK: true\n')
  assert.equal(open.criteria.checks.length, 1)
  assert.match(open.criteria.problems[0].why, /never closes/)
})

test('criteria: a malformed line inside the block carries its line number in the issue body', () => {
  const ticket = parseTicketBody('Epic: #1\n\n## Acceptance criteria\n\n```criteria\n- a\n  check: true\n```\n')
  assert.equal(ticket.criteria.problems.length, 1)
  assert.equal(ticket.criteria.problems[0].line, 7)
  assert.match(ticket.criteria.problems[0].why, /will not parse/)
})

test('criteria: a COMPARE is checked against the epic design sources handed in', () => {
  const body = '## Acceptance criteria\n\n```criteria\n- matches\n  COMPARE: designs/other.html @ 1440\n```\n'
  assert.match(parseTicketBody(body, ['designs/map.html']).criteria.problems[0].why, /does not list/)
  assert.match(parseTicketBody(body, null).criteria.problems[0].why, /declare no "Design sources:"/)
})

test('parseCriteriaSection reports where the block starts so the runner can number lines', () => {
  const block = parseCriteriaSection('\n```criteria\n- a\n  CHECK: true\n```\n', 10)
  assert.equal(block.firstLine, 12)
  assert.equal(block.text, '- a\n  CHECK: true')
})

test('withEpicLine adds the Epic line once, and refuses a body that names another epic', () => {
  assert.equal(withEpicLine('\n## Scope\n', 7), 'Epic: #7\n## Scope\n')
  assert.equal(withEpicLine('Epic: #7\n## Scope\n', 7), 'Epic: #7\n## Scope\n')
  assert.throws(() => withEpicLine('Epic: #8\n', 7), /already says "Epic: #8"/)
})

test('withBlockedBy writes the strict line under the Epic line, and refuses a second one', () => {
  const body = withBlockedBy('Epic: #7\n\n## Scope\n', [3, 4])
  assert.equal(body, 'Epic: #7\nBlocked by: #3, #4\n\n## Scope\n')
  assert.deepEqual(parseBlockedBy(body), { blockedBy: [3, 4], problem: null })
  assert.equal(withBlockedBy('Epic: #7\n', []), 'Epic: #7\n')
  assert.throws(() => withBlockedBy('Epic: #7\n- Blocked by: #3\n', [4]), /already has a "Blocked by" line/)
})

test('withTicketListed appends to the Tickets task list in order, once, and creates the section when missing', () => {
  const first = withTicketListed('## Outcome\n\nx\n\n## Tickets\n\n## Notes\n\ny\n', 5, 'first')
  assert.deepEqual(parseTaskList(splitSections(first).section('tickets').text), [{ number: 5, checked: false, title: 'first' }])
  const second = withTicketListed(first, 6, 'second')
  assert.deepEqual(
    parseEpicBody(second).tickets.map((task) => task.number),
    [5, 6],
  )
  assert.match(splitSections(second).section('notes').text, /^y$/)
  assert.equal(withTicketListed(second, 6, 'second'), second)
  const created = withTicketListed('## Outcome\n\nx\n', 9, 'only')
  assert.deepEqual(parseEpicBody(created).tickets, [{ number: 9, checked: false, title: 'only' }])
})

test('withTicketListed finds a "## Tickets ##" heading the section parser accepts, instead of adding a second section', () => {
  const body = '## Outcome\n\nx\n\n## Tickets ##\n\n- [ ] #2 — first\n'
  const listed = withTicketListed(body, 3, 'second')
  assert.equal(listed, '## Outcome\n\nx\n\n## Tickets ##\n\n- [ ] #2 — first\n- [ ] #3 — second\n')
  assert.deepEqual(parseEpicBody(listed).tickets.map((task) => task.number), [2, 3])
})

test('withTicketChecked ticks one ticket off the list and leaves the rest', () => {
  const body = '## Tickets\n\n- [ ] #2 — first\n- [ ] #3 — second\n\n```\n- [ ] #2 — in a fence\n```\n'
  assert.equal(withTicketChecked(body, 2), '## Tickets\n\n- [x] #2 — first\n- [ ] #3 — second\n\n```\n- [ ] #2 — in a fence\n```\n')
})

test('the design map is one ```design-map block of JSON in the epic body, read whole and checked the way the comparison reads it', () => {
  const map = { landmarks: [{ name: 'hero', design: '.hero', page: '[data-hero]' }] }
  const body = `## Outcome\n\nx\n\n## Design map\n\n\`\`\`design-map\n${JSON.stringify(map)}\n\`\`\`\n`
  assert.deepEqual(parseDesignMap(body), { map, problem: null })
  assert.deepEqual(parseEpicBody(body).designMap, map)
  assert.deepEqual(parseDesignMap('## Outcome\n\nno map\n'), { map: null, problem: null })
  assert.match(parseDesignMap('```design-map\n{ nope\n```').problem, /block is not valid JSON/)
  assert.match(parseDesignMap('```design-map\n{"landmarks":[{"name":"a"}]}\n```').problem, /cannot read the design map: .*has no "design"/)
  assert.match(parseDesignMap(`\`\`\`design-map\n${JSON.stringify(map)}\n\`\`\`\n\n\`\`\`design-map\n${JSON.stringify(map)}\n\`\`\``).problem, /there are 2 ```design-map blocks \(lines 1, 5\)/)
  assert.ok(parseEpicBody('## Settings\n\nDelivery: release\n\n```design-map\n[]\n```').problems.some((problem) => /design map/.test(problem)), 'a broken map is a problem with the plan, so create-epic refuses it')
})

test('Branch: must name a branch under epic/, because tickets are merged into it and the default branch is never a target', () => {
  assert.equal(parseSettings('Branch: epic/trip-export').settings.branch, 'epic/trip-export')
  assert.equal(parseSettings('Branch: epic/q4/export').settings.branch, 'epic/q4/export')
  for (const value of ['main', 'feature/x', 'epic/', 'epic/../main', 'epic/a.lock', 'refs/heads/epic/x', 'epic/a b']) {
    const parsed = parseSettings(`Branch: ${value}`)
    assert.equal(parsed.settings.branch, null, value)
    assert.equal(parsed.settings.rejectedBranch, value)
    assert.match(parsed.problems[0], /is not an epic branch: it must start with epic\//, value)
  }
  assert.ok(parseEpicBody('## Settings\n\nBranch: main\n').problems.length, 'so create-epic refuses it')
})
