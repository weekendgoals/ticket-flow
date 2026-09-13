// board.test.mjs — the HTML rendering of the derived board.
//
// renderBoard is a pure function over `tickets.mjs list --json` output, so
// these tests feed it fixture payloads and assert on the emitted HTML — no
// git, no network, no filesystem. The CLI half (running tickets.mjs, titling
// from the repo) is a thin shell over execFileSync and is exercised live by
// the doctor/list suites' fixtures; the rendering is what can silently lie.

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { renderBoard } from './board.mjs'

const base = {
  defaultBranch: 'main',
  prsAvailable: true,
  onMainCapped: false,
  current: null,
  epics: ['alpha'],
  modes: { alpha: { delivery: 'incremental', reviewerModel: null, workerModel: null, consequencePaths: null } },
  duplicates: {},
  tickets: [
    { id: 'A-1', title: 'ship the skeleton', epic: 'alpha', state: 'shipped', branch: 'a-1', pr: null },
    { id: 'A-2', title: 'persist results', epic: 'alpha', state: 'in-review', branch: 'a-2', pr: { number: 7, url: 'https://example.invalid/pull/7' } },
    { id: 'A-3', title: 'handle errors', epic: 'alpha', state: 'todo', branch: 'a-3', pr: null },
  ],
}

test('renders every ticket with its state label, and the PR as a link', () => {
  const html = renderBoard(base)
  assert.match(html, /A-1/)
  assert.match(html, /ship the skeleton/)
  assert.match(html, /class="badge s-shipped">shipped</)
  assert.match(html, /class="badge s-in-review">in review</, 'state keys render as human labels')
  assert.match(html, /<a href="https:\/\/example\.invalid\/pull\/7">#7<\/a>/)
})

test('titles are escaped — a heading cannot inject markup into the page', () => {
  const html = renderBoard({
    ...base,
    tickets: [{ id: 'A-1', title: '<script>alert(1)</script> & fix', epic: 'alpha', state: 'todo', branch: 'a-1', pr: null }],
  })
  assert.ok(!html.includes('<script>alert(1)</script>'))
  assert.match(html, /&lt;script&gt;alert\(1\)&lt;\/script&gt; &amp; fix/)
})

test('release delivery and the current-folder marker render as tags; incremental stays unlabelled', () => {
  const html = renderBoard({
    ...base,
    current: 'alpha',
    modes: { alpha: { delivery: 'release', reviewerModel: null, workerModel: null, consequencePaths: null } },
  })
  assert.match(html, /class="delivery">release</)
  assert.match(html, /class="here">this folder</)
  assert.ok(!renderBoard(base).includes('class="delivery"'), 'incremental — the default — is not tagged')
})

test('degraded facts surface as notes instead of silently rendering a confident board', () => {
  const html = renderBoard({ ...base, prsAvailable: false, onMainCapped: true, duplicates: { 'A-1': ['alpha', 'beta'] } })
  assert.match(html, /gh unavailable/)
  assert.match(html, /capped number of commits/)
  assert.match(html, /duplicate ID A-1 — defined in: alpha, beta/)
})

test('next up lists the first todo per epic, in document order', () => {
  const html = renderBoard({
    ...base,
    epics: ['alpha', 'beta'],
    modes: { ...base.modes, beta: { delivery: 'incremental', reviewerModel: null, workerModel: null, consequencePaths: null } },
    tickets: [
      ...base.tickets,
      { id: 'B-1', title: 'first beta step', epic: 'beta', state: 'todo', branch: 'b-1', pr: null },
      { id: 'B-2', title: 'second beta step', epic: 'beta', state: 'todo', branch: 'b-2', pr: null },
    ],
  })
  assert.match(html, /\/flow:ticket A-3/)
  assert.match(html, /\/flow:ticket B-1/)
  assert.ok(!html.includes('/flow:ticket B-2'), 'only the first startable ticket per epic is proposed')
})

test('an epic with no tickets and a board with no epics each say so plainly', () => {
  const emptyEpic = renderBoard({ ...base, tickets: [] })
  assert.match(emptyEpic, /no tickets yet/)
  const noEpics = renderBoard({ ...base, epics: [], tickets: [] })
  assert.match(noEpics, /no epics found under/)
})

test('the page names itself and opens with a <title> for the artifact publisher', () => {
  const html = renderBoard(base, { title: 'myrepo board', generatedAt: '2026-08-18 12:00' })
  assert.ok(html.startsWith('<title>myrepo board</title>'), 'the title tag must lead the fragment')
  assert.match(html, /generated 2026-08-18 12:00/)
  assert.match(html, /a snapshot, not a store; regenerate rather than edit/)
})

// ---- the tokens column --------------------------------------------------------

const spend = {
  epics: [
    {
      epic: 'alpha',
      totals: { worker: 12000, reviewer: 65729, 're-review': 0, disposition: 0, proxies: 0, total: 77729 },
      unknownTickets: 2,
      tickets: [
        { id: 'A-1', worker: 12000, reviewer: 65729, 're-review': null, disposition: null, proxies: null, total: 77729, unknown: [], source: 'log' },
        { id: 'A-2', worker: null, reviewer: null, 're-review': null, disposition: null, proxies: null, total: null, unknown: ['ticket'], source: 'log' },
        { id: 'A-3', worker: null, reviewer: null, 're-review': null, disposition: null, proxies: null, total: null, unknown: [], source: null },
      ],
    },
  ],
}

test('with a spend ledger the board gains a Tokens column: a figure, ? for unknown, — for nothing recorded', () => {
  const html = renderBoard(base, { spend })
  assert.match(html, /<th>Tokens<\/th>/)
  assert.match(html, /<td class="tokens" title="worker 12,000 · reviewer 65,729">77,729<\/td>/)
  assert.match(html, /A-2<\/td>.*<td class="tokens dim">\?<\/td>/)
  assert.match(html, /A-3<\/td>.*<td class="tokens dim">—<\/td>/)
  assert.match(html, /77,729 tokens recorded, 2 unknown/)
  assert.match(html, /never estimated/)
})

test('without a ledger the board renders exactly as before — no column, no zeros', () => {
  const html = renderBoard(base)
  assert.doesNotMatch(html, /Tokens/)
  assert.doesNotMatch(html, /class="tokens/)
})
