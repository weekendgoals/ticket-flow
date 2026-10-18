import { test } from 'node:test'
import assert from 'node:assert/strict'
import { renderReport, epicState, epicRelease, TICKET_COLUMNS } from './report.mjs'
import { ticketStats, summarize, overallStats } from './stats.mjs'

const at = (time) => `2026-10-${time}Z`
const comment = (body, createdAt) => ({ body, createdAt, author: 'flow-bot', url: null })
const meter = (input) =>
  comment(
    `<!-- flow:meter -->\n**Cost**\n\n\`\`\`json\n${JSON.stringify({ flowMeter: 1, ticket: 2, roles: { worker: { wallSeconds: 1800 }, reviewer: { wallSeconds: 600 } }, models: {}, total: { input, output: 300, cacheCreation: 50, cacheReads: 7000 } })}\n\`\`\``,
    at('14T12:00:00'),
  )

function epic({ number, title, state = 'open', tickets, releasePullRequest = null, delivery = 'release', branch = 'epic/trip-export' }) {
  return {
    number,
    title,
    url: `https://github.com/o/r/issues/${number}`,
    state,
    createdAt: at('10T09:00:00'),
    closedAt: state === 'closed' ? at('17T09:00:00') : null,
    delivery,
    parallel: 2,
    branch,
    releasePullRequest,
    instructionFiles: { before: { files: 1, lines: 120, bytes: 5400, sha: 'a'.repeat(40) }, after: null },
    serialWaves: [],
    runStops: [],
    gitProblem: null,
    tickets,
    totals: summarize(tickets),
  }
}

const ticket = (number, state, comments, extra = {}) => ({ ...ticketStats({ ticket: { number, title: `ticket ${number}`, state, tier: 'hard' }, comments }), ...extra })

function fixture() {
  const shipped = epic({
    number: 1,
    title: 'Trip export',
    state: 'closed',
    releasePullRequest: { number: 40, url: 'https://github.com/o/r/pull/40', merged: true, mergedAt: at('17T09:00:00') },
    tickets: [
      ticket(2, 'done', [comment('<!-- flow:started -->\n**Started**', at('14T10:00:00')), meter(1200), comment('<!-- flow:handoff -->\n**Handoff.**\n\n- x', at('14T13:00:00'))]),
      ticket(3, 'done', []),
    ],
  })
  const running = epic({ number: 9, title: 'Bugs </script><b>', tickets: [ticket(10, 'in-progress', []), ticket(11, 'needs-human', [comment('<!-- flow:needs-human -->\n**This ticket needs a person.** stuck', at('15T10:00:00'))])] })
  const incremental = epic({ number: 5, title: 'Small fixes', delivery: 'incremental', branch: null, tickets: [ticket(6, 'done', [])] })
  return overallStats([shipped, incremental, running])
}

const render = (stats = fixture()) => renderReport({ repository: 'o/r', generatedAt: '2026-10-18T08:00:00.000Z', version: '3.3.0', stats })

test('the page names the repository, the time and the version, and holds each epic newest first with its state and Release', () => {
  const html = render()
  assert.match(html, /^<!doctype html>/)
  assert.match(html, /<h1>Flow report: o\/r<\/h1>\n<p>Generated 2026-10-18T08:00:00\.000Z by Flow 3\.3\.0\./)
  const order = [...html.matchAll(/<section class="epic" id="epic-(\d+)">/g)].map((match) => Number(match[1]))
  assert.deepEqual(order, [9, 5, 1])
  assert.match(html, /<span class="pill">shipped<\/span> · <span class="pill">Release: Released<\/span> · release delivery · release pull request <a href="https:\/\/github\.com\/o\/r\/pull\/40">#40<\/a>, merged/)
  assert.match(html, /id="epic-5">[\s\S]*?<span class="pill">built<\/span> · incremental delivery · no release pull request/, 'an incremental epic has no Release word')
  assert.match(html, /id="epic-9">[\s\S]*?<span class="pill">running<\/span> · <span class="pill">Release: Building<\/span>/)
  assert.match(html, /Instruction files \(CLAUDE\.md, AGENTS\.md\): 120 lines, 5,400 bytes in 1 file\(s\) at the first start; unknown at the release merge\./)
})

test('epic states and Release words follow the tickets and the release pull request', () => {
  const base = { state: 'open', delivery: 'release', branch: 'epic/x', releasePullRequest: null }
  assert.equal(epicState({ ...base, tickets: [] }), 'empty')
  assert.equal(epicState({ ...base, tickets: [{ state: 'needs-human' }, { state: 'planned' }] }), 'stopped')
  assert.equal(epicState({ ...base, tickets: [{ state: 'planned' }] }), 'planned')
  assert.equal(epicRelease({ ...base, releasePullRequest: { number: 4, merged: false } }), 'Pull request open')
  assert.equal(epicRelease({ ...base, state: 'closed', releasePullRequest: { number: 4, merged: false } }), 'Building')
  assert.equal(epicRelease({ ...base, delivery: 'incremental', branch: null }), null)
})

test('a ticket row links the issue and prints every column, with unknown for a figure no comment carries, never blank or 0', () => {
  const html = render()
  const row = (number) => html.match(new RegExp(`<tr data-epic="\\d+" data-ticket="${number}">(.*?)</tr>`))[1].match(/<td>(.*?)<\/td>/g).map((cell) => cell.slice(4, -5))
  assert.deepEqual(TICKET_COLUMNS.map((column) => column.label), ['#', 'title', 'tier', 'state', 'build', 'review', 'fixes', 'accept', 'deliver', 'whole', 'tokens in', 'tokens out', 'cache', 'review rounds', 'important', 'acceptance runs', 'resets', 'escapes', 'handoff', 'stops'])
  assert.deepEqual(row(2), ['<a href="https://github.com/o/r/issues/2">#2</a>', 'ticket 2', 'hard', 'done', '30m', '10m', 'unknown', 'unknown', 'unknown', 'unknown', '1,200', '300', '7,050', '0', '0', '0', '0', 'unknown', 'yes', '0'])
  assert.deepEqual(row(3).slice(4, 13), Array(9).fill('unknown'), 'a ticket with no cost comment shows unknown time and tokens')
  assert.equal(row(3)[18], 'no')
  assert.equal(row(11)[19], '1')
  for (const cell of row(3)) assert.notEqual(cell, '')
})

test('totals across epics come from overallStats, partial sums say how many tickets they cover', () => {
  const html = render()
  assert.match(html, /<dt>Tickets<\/dt><dd>3 of 5 done<\/dd>/)
  assert.match(html, /<dt>Tokens in<\/dt><dd>1,200 \(1\/5\)<\/dd>/)
  assert.match(html, /<dt>Review rounds<\/dt><dd>0<\/dd>/)
  assert.match(html, /<dt>Stops for a person<\/dt><dd>1<\/dd>/)
  assert.match(html, /<dt>Tickets per day<\/dt><dd>unknown<\/dd>/)
})

test('the data is embedded once as JSON the page can sort by, and nothing in it can close the script or reach the network', () => {
  const stats = fixture()
  const html = render(stats)
  const blocks = [...html.matchAll(/<script type="application\/json" id="flow-data">([\s\S]*?)<\/script>/g)]
  assert.equal(blocks.length, 1)
  assert.deepEqual(JSON.parse(blocks[0][1]).stats, JSON.parse(JSON.stringify(stats)))
  assert.ok(!blocks[0][1].includes('</script>'), 'a title holding </script> is escaped in the data')
  assert.match(html, /<h2><a href="https:\/\/github\.com\/o\/r\/issues\/9">#9<\/a> Bugs &lt;\/script&gt;&lt;b&gt;<\/h2>/)
  assert.doesNotMatch(html, /<link |<script src=|<img |@import|url\(/, 'one file: no stylesheet, script or image is fetched')
  const inline = html.match(/<script>([\s\S]*?)<\/script>/)[1]
  assert.doesNotThrow(() => new Function(inline))
  assert.match(inline, /getElementById\('flow-data'\)/)
  for (const column of TICKET_COLUMNS) assert.ok(html.includes(`data-key="${column.key}"`), column.key)
})

test('the page is readable at phone width: a viewport, tables that scroll inside their box, and nothing else wider', () => {
  const html = render()
  assert.match(html, /<meta name="viewport" content="width=device-width, initial-scale=1">/)
  assert.match(html, /\.table-wrap\{overflow-x:auto/)
  assert.match(html, /main\{max-width:1100px;margin:0 auto;padding:24px 16px 48px\}/)
  assert.match(html, /@media \(prefers-color-scheme:dark\)/)
})

test('a repository with no epics gets a page that says so', () => {
  const html = render(overallStats([]))
  assert.match(html, /This repository has no Flow epics yet, so there is nothing to report\./)
  assert.doesNotMatch(html, /class="totals"/)
})

test('a click on a column header sorts the rows of that epic by the embedded data, unknown last, and a second click reverses', () => {
  const html = render()
  const data = html.match(/<script type="application\/json" id="flow-data">([\s\S]*?)<\/script>/)[1]
  const rows = [2, 3].map((number) => ({ dataset: { epic: '1', ticket: String(number) } }))
  const body = { rows: [...rows], appendChild(row) { this.rows.splice(this.rows.indexOf(row), 1); this.rows.push(row) } }
  const listeners = {}
  const buttons = TICKET_COLUMNS.map((column) => ({ getAttribute: () => column.key, addEventListener: (_, listener) => { listeners[column.key] = listener } }))
  const table = { tBodies: [body], querySelectorAll: () => buttons }
  const document = { getElementById: () => ({ textContent: data }), querySelectorAll: () => [table] }
  new Function('document', html.match(/<script>([\s\S]*?)<\/script>/)[1])(document)
  const order = () => body.rows.map((row) => Number(row.dataset.ticket))
  listeners['tokens.input']()
  assert.deepEqual(order(), [2, 3], 'the ticket whose tokens are unknown goes last')
  listeners.number()
  assert.deepEqual(order(), [2, 3])
  listeners.number()
  assert.deepEqual(order(), [3, 2])
})
