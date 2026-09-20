// release-page.test.mjs — pure rendering over fixture JSON, in the shapes
// `tickets.mjs release --json` and `check-epic --json` print. No git, no
// browser, nothing but Node: what is held here is what a reader must never be
// misled about — an absent or stale ledger drawn as a green one — and the
// anchors a later comment layer attaches to.

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { renderRelease } from './release-page.mjs'

const SCRIPT = join(dirname(fileURLToPath(import.meta.url)), 'release-page.mjs')
const HEAD = 'a'.repeat(40)

const data = (over = {}) => ({
  epic: 'payments',
  delivery: 'release',
  defaultBranch: 'main',
  head: HEAD,
  branch: 'epic/payments',
  webUrl: 'https://github.com/acme/shop',
  diffstat: '12 files changed, 340 insertions(+), 20 deletions(-)',
  tickets: [
    {
      id: 'PAY-1',
      title: 'the <checkout> form',
      state: 'integrated',
      entries: [
        {
          heading: 'PAY-1 — the checkout form — 2026-09-10 — DONE',
          date: '2026-09-10',
          outcome: 'DONE',
          fields: [
            { label: 'Built', text: 'the form, in `src/checkout.tsx`\nand its <b>tests</b>' },
            { label: 'Tokens', text: 'worker=1200' },
            { label: 'Verified', text: '`npm test` — 14 passed' },
            { label: 'Owed', text: 'Nothing.' },
          ],
        },
      ],
      deviations: [{ entry: 'PAY-1', item: 'PAY-1', text: 'a modal, not a page', closed: false, closedBy: null }],
      commits: [{ sha: 'b'.repeat(40), subject: 'PAY-1: the form', ticket: 'PAY-1', stat: '3 files changed, 90 insertions(+)' }],
    },
    { id: 'PAY-2', title: 'refunds', state: 'todo', entries: [], deviations: [], commits: [] },
  ],
  otherCommits: [{ sha: 'c'.repeat(40), subject: 'payments run record — 2026-09-11', ticket: null, stat: '1 file changed' }],
  owed: [{ id: 'PAY-1', date: '2026-09-10', text: 'rotate the `STRIPE_KEY`' }],
  owedNotes: [],
  lastRun: { heading: 'Run — 2026-09-11 — completed', text: '**Tickets this run:** PAY-1' },
  ...over,
})

const check = (over = {}) => ({
  epic: 'payments',
  head: HEAD,
  headIsRemote: true,
  signoff: 'd'.repeat(40),
  shallow: false,
  total: 2,
  passed: 2,
  skipped: 0,
  problems: 0,
  allPassed: true,
  dirty: [],
  orphanIds: [],
  shared: false,
  tickets: [{ id: 'PAY-1', total: 2, passed: 2, skipped: 0, checks: [{ status: 'passed', check: 'true', evidence: 'exit 0' }, { status: 'passed', check: 'npm test', evidence: '14 passed' }], compares: [], problems: [], criteriaChanged: null }],
  notLanded: [{ id: 'PAY-2', state: 'todo' }],
  removedSinceSignoff: [],
  ...over,
})

test('the page opens with a <title>, the merge rule and the size, and names what has not landed', () => {
  const html = renderRelease(data(), { check: check() })
  assert.ok(html.startsWith('<title>payments — release walkthrough</title>'), 'the fragment shape the Artifact publisher expects')
  assert.match(html, /Merge with a merge commit — never squash/)
  assert.match(html, /12 files changed, 340 insertions\(\+\), 20 deletions\(-\)/)
  assert.match(html, /1 not landed: PAY-2 \(todo\)/)
})

test('every ticket and every fixed section carries a stable anchor — a comment layer attaches to them', () => {
  const html = renderRelease(data(), { check: check() })
  for (const id of ['t-PAY-1', 't-PAY-2', 'release-check', 'owed', 'other-commits', 'last-run', 'merge-rule', 'size']) assert.match(html, new RegExp(`id="${id}"`), id)
  assert.match(html, /<a href="#t-PAY-1">PAY-1<\/a>/)
})

test('an absent release check is said, in the place its ledger would be — never drawn as a pass', () => {
  const html = renderRelease(data())
  assert.match(html, /The release check was not supplied to this page/)
  assert.doesNotMatch(html, /class="verdict ok"/)
  assert.doesNotMatch(html, /checks \d+\/\d+ at head/)
})

test('a ledger taken at another commit is not a check of this release, whatever it says', () => {
  const html = renderRelease(data(), { check: check({ head: 'e'.repeat(40) }) })
  assert.match(html, /This ledger was taken at <code>eeeeeeeeeeee<\/code> and the page describes <code>aaaaaaaaaaaa<\/code>/)
  assert.doesNotMatch(html, /class="verdict ok"/, 'a green verdict about another commit is not shown green here')
})

test('the verdict is recomputed, never taken on the report\'s word — every way a ledger can fail to be about this release reads as no', () => {
  const notGreen = (c, why) => assert.doesNotMatch(renderRelease(data(), { check: c }), /class="verdict ok"/, why)
  notGreen(check({ passed: 0, total: 3 }), 'allPassed: true beside 0/3')
  notGreen(check({ headIsRemote: false }), 'the checkout was not at the remote head')
  notGreen(check({ head: null }), 'a ledger that does not say which commit it is about')
  notGreen(check({ epic: 'refunds' }), 'another epic\'s ledger')
  notGreen(check({ tickets: [] }), 'a ledger with no ticket in it')
  notGreen({ epic: 'payments', head: HEAD, allPassed: true, tickets: [{ id: 'PAY-1' }] }, 'a report with no counts in it — undefined === undefined is not a pass')
  notGreen(check({ tickets: [{ id: 'PAY-1', total: 2, passed: 2, skipped: 0, compares: [], problems: [], criteriaChanged: null, checks: [{ status: 'passed' }, { status: 'failed', check: 'x', evidence: 'exit 1' }] }] }), 'passing counters beside a failed row')
  notGreen(check({ dirty: [' M src/pay.ts'] }), 'uncommitted tracked changes when the check ran')
  const dirtyPage = renderRelease(data(), { check: check({ dirty: [' M src/pay.ts'] }) })
  assert.match(dirtyPage, /Tracked files were modified and uncommitted, so nothing was run.*src\/pay\.ts/)
  assert.match(dirtyPage, /badge s-bad">checks 2\/2 — not evidence about this release/, 'a badge is never greener than the verdict above it')
  notGreen(check({ delivery: 'release', fetched: false }), 'the fetch of the epic branch failed')
  assert.match(renderRelease(data(), { check: check({ orphanIds: ['PAY-9'] }) }), /a ticket ID no document knows.*PAY-9/)
  assert.match(renderRelease(data(), { check: check({ shared: true }) }), /Run with <code>--share<\/code>/)
  notGreen(check({ tickets: [{ id: 'PAY-1', total: 1, passed: 1, skipped: 0, checks: [], compares: [], problems: [{ line: 9, why: 'malformed', text: 'CHECK' }], criteriaChanged: null }] }), 'a malformed criterion')
  assert.doesNotMatch(renderRelease(data({ head: null }), { check: check() }), /class="verdict ok"/)
  // a landed ticket the ledger does not carry was checked by nobody — said, and badged on the ticket
  const two = data()
  two.tickets[1].state = 'integrated'
  const html = renderRelease(two, { check: check() })
  assert.match(html, /Landed and not in this ledger, so checked by nobody: PAY-2/)
  assert.match(html, /not in the release check/)
  assert.doesNotMatch(html, /class="verdict ok"/)
  // a malformed criterion is red on the ticket's badge too, not only in the table
  const malformed = renderRelease(data(), { check: check({ passed: 1, total: 1, problems: 1, allPassed: false, tickets: [{ id: 'PAY-1', total: 1, passed: 1, skipped: 0, checks: [], compares: [], problems: [{ line: 9, why: 'x', text: 'y' }], criteriaChanged: null }] }) })
  assert.match(malformed, /badge s-bad">checks 1\/1 at head/)
})

test('an epic with no CHECK criteria at all passes, and the page says that nothing was run', () => {
  const none = check({ total: 0, passed: 0, tickets: [{ id: 'PAY-1', total: 0, passed: 0, skipped: 0, checks: [], compares: [], problems: [], criteriaChanged: null }] })
  const html = renderRelease(data(), { check: none })
  assert.match(html, /class="verdict ok">Passed — 0\/0 checks/)
  assert.match(html, /so nothing was run: this "passed" says only that nothing failed to parse/)
  assert.doesNotMatch(renderRelease(data(), { check: check() }), /so nothing was run/)
})

test('a ledger from before the run-record commit still describes this head — and only then', () => {
  // The run record is committed AFTER the pull request opens, so it can name it.
  const moved = check({ head: 'e'.repeat(40) })
  const ok = renderRelease(data(), { check: moved, recordOnlySince: 1 })
  assert.match(ok, /class="verdict ok">Passed at eeeeeeeee, one commit before this head/)
  assert.match(ok, /before this epic's run record was committed — the only files changed since/)
  assert.match(ok, /checks 2\/2 at eeeeeeeee, one commit before this head/, 'the ledger is evidence about THAT commit, and the page says which')
  assert.doesNotMatch(ok, /checks 2\/2 at head/)
  assert.match(renderRelease(data(), { check: moved, recordOnlySince: 3 }), /Passed at eeeeeeeee, 3 commits before this head/, 'the distance is counted, not assumed')
  const stale = renderRelease(data(), { check: moved })
  assert.match(stale, /NOT A CHECK OF THIS RELEASE/)
  assert.match(stale, /badge s-bad">checks 2\/2 — not at this head/, 'a badge that says "at head" about another commit is the page lying')
})

test('the page says when it was rendered somewhere that is not the release, and shows an entry\'s lead text', () => {
  assert.match(renderRelease(data({ branch: 'main' }), { check: check() }), /Rendered on <code>main<\/code>, not on <code>epic\/payments<\/code>/)
  assert.match(renderRelease(data({ delivery: 'incremental', branch: 'main' }), { check: check() }), /there is no release to walk through/)
  const d = data()
  d.tickets[0].entries[0].lead = 'a note before any field, with `code`'
  assert.match(renderRelease(d, { check: check() }), /a note before any field, with <code>code<\/code>/)
  d.tickets[0].entries[0] = { heading: 'PAY-1 — x — 2026-09-10 — DONE', lead: '', fields: [] }
  assert.match(renderRelease(d, { check: check() }), /the entry has a heading and nothing under it that reads as a field/)
})

test('a failed check names the ticket, the command and its evidence', () => {
  const failed = check({
    allPassed: false,
    passed: 1,
    tickets: [{ id: 'PAY-1', total: 2, passed: 1, skipped: 0, compares: [], problems: [], criteriaChanged: null, checks: [{ status: 'passed', check: 'true', evidence: 'exit 0' }, { status: 'failed', check: 'npm test -- refunds', evidence: 'exit 1 — 2 failing' }] }],
  })
  const html = renderRelease(data(), { check: failed })
  assert.match(html, /class="verdict bad">FAILED — 1\/2 checks/)
  assert.match(html, /<code>npm test -- refunds<\/code><br><span class="dim">exit 1 — 2 failing<\/span>/)
  assert.match(html, /checks 1\/2 at head/)
})

test('criteria that differ from sign-off, and a section that is gone, are shown with a green ledger', () => {
  const html = renderRelease(data(), {
    check: check({
      total: 1,
      passed: 1,
      tickets: [{ id: 'PAY-1', total: 1, passed: 1, skipped: 0, checks: [{ status: 'passed', check: 'npm test', evidence: 'passed' }], compares: [{ compare: 'designs/pay.html @ 1440' }], problems: [], criteriaChanged: { was: ['CHECK: npm test — EXPECT: 14 passed'], now: ['CHECK: npm test — EXPECT: passed'] } }],
      removedSinceSignoff: [{ id: 'PAY-0', was: ['CHECK: npm run e2e'] }],
    }),
  })
  assert.match(html, /id="criteria-changed"/)
  assert.match(html, /was: CHECK: npm test — EXPECT: 14 passed/)
  assert.match(html, /now: CHECK: npm test — EXPECT: passed/)
  assert.match(html, /<b>PAY-0<\/b> — in the signed-off document, gone from this one; checked nowhere/)
  assert.match(html, /1 <code>COMPARE<\/code> criterion\(s\) were not re-verified at this commit/)
})

test('an entry is shown as written: escaped, line breaks kept, the deciding fields open and the rest folded', () => {
  const html = renderRelease(data(), { check: check() })
  assert.match(html, /and its &lt;b&gt;tests&lt;\/b&gt;/, 'status-log text is never trusted as markup')
  assert.match(html, /the &lt;checkout&gt; form/)
  assert.match(html, /the form, in <code>src\/checkout\.tsx<\/code>\nand its/)
  assert.match(html, /<details open><summary>Built<\/summary>/)
  assert.match(html, /<details><summary>Tokens<\/summary>/)
  assert.match(html, /1 deviation\(s\), 1 open/)
  assert.match(html, /<a href="https:\/\/github\.com\/acme\/shop\/commit\/b{40}"><code>b{9}<\/code><\/a> PAY-1: the form/)
  assert.match(html, /no status entry — nothing records what this ticket built/, 'PAY-2 has none, and the page says so')
})

test('owed items, unticketed commits and the last run record are there, and their absence is said', () => {
  const html = renderRelease(data(), { check: check() })
  assert.match(html, /rotate the <code>STRIPE_KEY<\/code>/)
  assert.match(html, /payments run record — 2026-09-11/)
  assert.match(html, /Run — 2026-09-11 — completed/)
  const bare = renderRelease(data({ owed: [], otherCommits: [], lastRun: null, webUrl: null }), { check: check() })
  assert.match(bare, /None outstanding\./)
  assert.match(bare, /no run record — this epic was not built by an unattended run/)
  assert.doesNotMatch(bare, /<a href="null/)
  assert.match(bare, /<code>b{9}<\/code> PAY-1: the form/, 'no web URL, no link — the sha is still shown')
})

test('the CLI refuses no epic, a --check it cannot read, and a ledger of another epic', () => {
  const cli = (...args) => spawnSync(process.execPath, [SCRIPT, ...args], { encoding: 'utf8' })
  assert.equal(cli().status, 2)
  assert.equal(cli('payments', '--check').status, 2)
  const unreadable = cli('payments', '--check', join(dirname(SCRIPT), 'no-such-file.json'))
  assert.notEqual(unreadable.status, 0)
})
