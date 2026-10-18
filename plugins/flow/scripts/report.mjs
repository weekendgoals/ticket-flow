import { duration } from './stats.mjs'
import { releaseStage } from './epic-state.mjs'

const UNKNOWN = 'unknown'
const isNumber = (value) => typeof value === 'number' && Number.isFinite(value)
const STEP_COLUMNS = [
  ['worker', 'build'],
  ['review', 'review'],
  ['fixes', 'fixes'],
  ['acceptance', 'accept'],
  ['delivery', 'deliver'],
  ['whole', 'whole'],
]

export function escapeHtml(text) {
  return String(text).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;')
}

function count(value) {
  return isNumber(value) ? value.toLocaleString('en-US') : UNKNOWN
}

function time(seconds) {
  return isNumber(seconds) ? duration(seconds) : UNKNOWN
}

function sumKnown(a, b) {
  return isNumber(a) && isNumber(b) ? a + b : null
}

function partial(figure, show = count) {
  if (!figure || !figure.known) return UNKNOWN
  const shown = show(figure.value)
  return figure.known === figure.of ? shown : `${shown} (${figure.known}/${figure.of})`
}

export function cacheTokens(tokens) {
  return sumKnown(tokens.cacheCreation, tokens.cacheReads)
}

export function epicState(epic) {
  if (epic.state === 'closed') return 'shipped'
  if (!epic.tickets.length) return 'empty'
  if (epic.tickets.every((ticket) => ticket.state === 'done')) return 'built'
  if (epic.tickets.some((ticket) => ticket.state === 'in-progress' || ticket.state === 'in-review')) return 'running'
  if (epic.tickets.some((ticket) => ticket.state === 'needs-human')) return 'stopped'
  return 'planned'
}

export function epicRelease(epic) {
  const release = epic.releasePullRequest
  return releaseStage({
    settings: { delivery: epic.delivery, branch: epic.branch },
    closed: epic.state === 'closed',
    releasePullRequestNamed: Boolean(release),
    releaseMerged: Boolean(release && release.merged),
  })
}

export const TICKET_COLUMNS = [
  { key: 'number', label: '#', value: (ticket) => ticket.number },
  { key: 'title', label: 'title', value: (ticket) => ticket.title || '' },
  { key: 'tier', label: 'tier', value: (ticket) => ticket.tier || '' },
  { key: 'state', label: 'state', value: (ticket) => ticket.state || '' },
  ...STEP_COLUMNS.map(([step, label]) => ({ key: `steps.${step}`, label, value: (ticket) => ticket.steps[step], show: time })),
  { key: 'tokens.input', label: 'tokens in', value: (ticket) => ticket.tokens.input, show: count },
  { key: 'tokens.output', label: 'tokens out', value: (ticket) => ticket.tokens.output, show: count },
  { key: 'cache', label: 'cache', value: (ticket) => cacheTokens(ticket.tokens), show: count },
  { key: 'reviewRounds', label: 'review rounds', value: (ticket) => ticket.reviewRounds, show: count },
  { key: 'importantFindings', label: 'important', value: (ticket) => ticket.importantFindings, show: count },
  { key: 'acceptanceRuns', label: 'acceptance runs', value: (ticket) => ticket.acceptanceRuns, show: count },
  { key: 'resets', label: 'resets', value: (ticket) => ticket.resets, show: count },
  { key: 'escapes', label: 'escapes', value: (ticket) => ticket.escapes, show: count },
  { key: 'handoff', label: 'handoff', value: (ticket) => (ticket.handoff ? 'yes' : 'no') },
  { key: 'stops', label: 'stops', value: (ticket) => (Array.isArray(ticket.stops) ? ticket.stops.length : null), show: count },
]

function issueLink(repository, number) {
  return `https://github.com/${repository}/issues/${number}`
}

function ticketCell(column, ticket, repository) {
  if (column.key === 'number') return `<a href="${escapeHtml(issueLink(repository, ticket.number))}">#${ticket.number}</a>`
  const value = column.value(ticket)
  return escapeHtml(column.show ? column.show(value) : value)
}

function ticketTable(epic, repository) {
  if (!epic.tickets.length) return '<p class="quiet">No tickets.</p>'
  const head = TICKET_COLUMNS.map((column) => `<th scope="col"><button type="button" data-key="${column.key}">${escapeHtml(column.label)}</button></th>`).join('')
  const rows = epic.tickets
    .map((ticket) => `<tr data-epic="${epic.number}" data-ticket="${ticket.number}">${TICKET_COLUMNS.map((column) => `<td>${ticketCell(column, ticket, repository)}</td>`).join('')}</tr>`)
    .join('\n')
  return `<div class="table-wrap"><table data-epic="${epic.number}"><thead><tr>${head}</tr></thead><tbody>\n${rows}\n</tbody></table></div>`
}

function instructionFilesText(size, where) {
  if (!size) return `${UNKNOWN} ${where}`
  return `${count(size.lines)} lines, ${count(size.bytes)} bytes in ${count(size.files)} file(s) ${where}`
}

function releaseText(epic) {
  const release = epic.releasePullRequest
  if (!release) return 'no release pull request'
  const label = release.url ? `<a href="${escapeHtml(release.url)}">#${release.number}</a>` : `#${release.number}`
  const merged = release.merged === null || release.merged === undefined ? 'state unknown' : release.merged ? 'merged' : 'not merged'
  return `release pull request ${label}, ${merged}`
}

function epicSection(epic, repository) {
  const release = epicRelease(epic)
  const files = epic.instructionFiles || {}
  const facts = [
    `<span class="pill">${escapeHtml(epicState(epic))}</span>`,
    ...(release ? [`<span class="pill">Release: ${escapeHtml(release)}</span>`] : []),
    `${escapeHtml(epic.delivery || UNKNOWN)} delivery`,
    releaseText(epic),
  ]
  return `<section class="epic" id="epic-${epic.number}">
<h2><a href="${escapeHtml(epic.url || issueLink(repository, epic.number))}">#${epic.number}</a> ${escapeHtml(epic.title)}</h2>
<p class="facts">${facts.join(' · ')}</p>
<p class="quiet">Instruction files (CLAUDE.md, AGENTS.md): ${escapeHtml(instructionFilesText(files.before, 'at the first start'))}; ${escapeHtml(instructionFilesText(files.after, 'at the release merge'))}.</p>
${ticketTable(epic, repository)}
</section>`
}

function totalsSection(stats) {
  const totals = stats.totals
  const pace = stats.pace
  const cards = [
    ['Tickets', `${totals.done} of ${totals.tickets} done`],
    ['Time, start to end', partial(totals.steps.whole, time)],
    ['Build time', partial(totals.steps.worker, time)],
    ['Review time', partial(totals.steps.review, time)],
    ['Tokens in', partial(totals.tokens.input)],
    ['Tokens out', partial(totals.tokens.output)],
    ['Cache writes', partial(totals.tokens.cacheCreation)],
    ['Cache reads', partial(totals.tokens.cacheReads)],
    ['Review rounds', count(totals.reviewRounds)],
    ['Stops for a person', count(totals.stops)],
    ['Tickets per day', pace.ticketsPerDay === null ? UNKNOWN : String(pace.ticketsPerDay)],
    ['Median ticket', time(pace.medianTicketSeconds)],
  ]
  return `<section class="totals"><h2>All epics</h2><dl>${cards.map(([name, value]) => `<div><dt>${escapeHtml(name)}</dt><dd>${escapeHtml(value)}</dd></div>`).join('')}</dl></section>`
}

const STYLE = `:root{--bg:#fbfaf8;--fg:#1d1d1f;--quiet:#5f5f66;--line:#e2e0dc;--card:#fff;--accent:#2f5bd3}
@media (prefers-color-scheme:dark){:root{--bg:#141416;--fg:#ececef;--quiet:#a2a2ab;--line:#2c2c31;--card:#1c1c20;--accent:#8fb0ff}}
*{box-sizing:border-box}body{margin:0;background:var(--bg);color:var(--fg);font:15px/1.5 system-ui,-apple-system,"Segoe UI",sans-serif}
main{max-width:1100px;margin:0 auto;padding:24px 16px 48px}a{color:var(--accent)}h1{font-size:1.5rem;margin:0 0 4px}h2{font-size:1.15rem;margin:0 0 6px}
.quiet,header p{color:var(--quiet);margin:4px 0}.facts{margin:4px 0 8px}.pill{border:1px solid var(--line);border-radius:999px;padding:1px 8px;background:var(--card)}
section{margin-top:28px}dl{display:grid;grid-template-columns:repeat(auto-fill,minmax(160px,1fr));gap:8px;margin:8px 0 0}
dl div{background:var(--card);border:1px solid var(--line);border-radius:8px;padding:8px 10px}dt{color:var(--quiet);font-size:.8rem}dd{margin:2px 0 0;font-weight:600;font-variant-numeric:tabular-nums}
.table-wrap{overflow-x:auto;border:1px solid var(--line);border-radius:8px;background:var(--card)}table{border-collapse:collapse;width:100%;font-variant-numeric:tabular-nums}
th,td{padding:6px 8px;border-bottom:1px solid var(--line);text-align:left;white-space:nowrap}tbody tr:last-child td{border-bottom:0}
th button{all:unset;cursor:pointer;color:var(--quiet);font-size:.8rem}th button:focus-visible{outline:2px solid var(--accent)}`

const SCRIPT = `(function(){var data=JSON.parse(document.getElementById('flow-data').textContent);var tickets={};
data.stats.epics.forEach(function(epic){epic.tickets.forEach(function(ticket){tickets[epic.number+'/'+ticket.number]=ticket})});
function pick(ticket,key){if(key==='cache'){var t=ticket.tokens;return typeof t.cacheCreation==='number'&&typeof t.cacheReads==='number'?t.cacheCreation+t.cacheReads:null}
if(key==='stops')return ticket.stops?ticket.stops.length:null;if(key==='handoff')return ticket.handoff?1:0;
return key.split('.').reduce(function(value,part){return value==null?null:value[part]},ticket)}
document.querySelectorAll('table[data-epic]').forEach(function(table){var body=table.tBodies[0];var last=null;var up=true;
table.querySelectorAll('th button').forEach(function(button){button.addEventListener('click',function(){var key=button.getAttribute('data-key');up=last===key?!up:true;last=key;
var rows=Array.prototype.slice.call(body.rows);rows.sort(function(a,b){var x=pick(tickets[a.dataset.epic+'/'+a.dataset.ticket],key);var y=pick(tickets[b.dataset.epic+'/'+b.dataset.ticket],key);
if(x==null&&y==null)return 0;if(x==null)return 1;if(y==null)return -1;var order=typeof x==='number'&&typeof y==='number'?x-y:String(x).localeCompare(String(y));return up?order:-order});
rows.forEach(function(row){body.appendChild(row)})})})})})()`

function embedded(value) {
  return JSON.stringify(value).replace(/</g, '\\u003c')
}

export function renderReport({ repository, generatedAt, version, stats }) {
  const epics = [...stats.epics].sort((a, b) => b.number - a.number)
  const body = epics.length
    ? `${totalsSection(stats)}\n${epics.map((epic) => epicSection(epic, repository)).join('\n')}`
    : '<section><p>This repository has no Flow epics yet, so there is nothing to report.</p></section>'
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Flow report</title>
<style>${STYLE}</style>
</head>
<body>
<main>
<header>
<h1>Flow report: ${escapeHtml(repository)}</h1>
<p>Generated ${escapeHtml(generatedAt)} by Flow ${escapeHtml(version)}${stats.since ? `, epics created since ${escapeHtml(stats.since)}` : ''}. Read from the issues' comments and git each time; "${UNKNOWN}" means no comment or commit carries the figure, and "(3/5)" that only 3 of 5 tickets do. Nothing is estimated.</p>
</header>
${body}
</main>
<script type="application/json" id="flow-data">${embedded({ repository, generatedAt, version, stats })}</script>
<script>${SCRIPT}</script>
</body>
</html>
`
}
