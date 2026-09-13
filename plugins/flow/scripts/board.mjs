#!/usr/bin/env node
// board — render the derived ticket board as one self-contained HTML page.
//
// A read-only view over `tickets.mjs list --json`, and deliberately nothing
// more: the JSON is the single source of truth, recomputed from git on every
// run, so this page is a rendering of derived state — never a second store of
// it. The output is meant to be published (an artifact, a pastebin, a browser
// tab) and regenerated on demand; committing it to the repository would create
// exactly the hand-maintained mirror this plugin exists to avoid.
//
// Usage — from anywhere inside the target repo:
//
//   board.mjs [epic]              render all epics, or one, to stdout
//   board.mjs [epic] --out <f>    write the page to a file instead
//
// The page is an HTML fragment opening with a <title> tag — the shape the
// Artifact publisher expects (it wraps the skeleton itself) — and browsers
// render the bare fragment fine when opened directly.
//
// Zero dependencies, no configuration, stores nothing.

import { execFileSync } from 'node:child_process'
import { writeFileSync } from 'node:fs'
import { join, dirname, basename } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

const esc = s =>
  String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]))

// The board's state vocabulary, ordered as tickets.mjs resolves it. `key` is
// a CSS class, so it carries no spaces; `label` is what a human reads.
const STATES = [
  ['shipped', 'shipped'],
  ['integrated', 'integrated'],
  ['in-review', 'in review'],
  ['done', 'done, unpushed'],
  ['in-progress', 'in progress'],
  ['blocked', 'blocked'],
  ['todo', 'todo'],
]
const LABEL = Object.fromEntries(STATES)

const fmtTokens = n => (typeof n === 'number' ? n.toLocaleString('en-US') : '')

// `spend` is the optional `tickets.mjs spend --json` report — recorded token
// figures, derived from the status logs the same way the board's states are
// derived from git. Absent, the page renders without the column: the board
// never invents a figure, and a missing ledger is not a zero.
export function renderBoard(data, { title = 'Ticket board', generatedAt = '', spend = null } = {}) {
  const tickets = Array.isArray(data.tickets) ? data.tickets : []
  const epics = Array.isArray(data.epics) ? data.epics : []
  const modes = data.modes || {}
  const duplicates = data.duplicates || {}
  const spendByEpic = Object.fromEntries(((spend && spend.epics) || []).map(e => [e.epic, e]))
  const spendByTicket = Object.fromEntries(((spend && spend.epics) || []).flatMap(e => e.tickets.map(t => [t.id, t])))
  const hasSpend = Boolean(spend && spend.epics)

  const notes = []
  if (data.prsAvailable === false) notes.push('gh unavailable — pull-request state omitted, "done" may already be merged')
  if (data.onMainCapped) notes.push(`shipped detection scanned a capped number of commits on ${esc(data.defaultBranch)} — older tickets may read as unshipped`)
  for (const [id, es] of Object.entries(duplicates)) notes.push(`duplicate ID ${esc(id)} — defined in: ${esc(es.join(', '))}`)

  const sections = epics.map(name => {
    const mine = tickets.filter(t => t.epic === name)
    const mode = modes[name] || {}
    const here = data.current === name ? '<span class="here">this folder</span>' : ''
    const delivery = mode.delivery && mode.delivery !== 'incremental' ? `<span class="delivery">${esc(mode.delivery)}</span>` : ''
    if (!mine.length) {
      return `<section class="epic"><h2>${esc(name)} ${delivery} ${here}</h2><p class="empty">no tickets yet</p></section>`
    }
    const counts = STATES.map(([key, label]) => [label, mine.filter(t => t.state === key).length])
      .filter(([, n]) => n)
      .map(([label, n]) => `${n} ${esc(label)}`)
      .join(' · ')
    const es = spendByEpic[name]
    const spendLine = hasSpend && es
      ? ` · <span class="tokens">${fmtTokens(es.totals.total) || '0'} tokens recorded${es.unknownTickets ? `, ${es.unknownTickets} unknown` : ''}</span>`
      : ''
    const rows = mine
      .map(t => {
        const pr = t.pr && t.pr.number
          ? t.pr.url
            ? `<a href="${esc(t.pr.url)}">#${esc(t.pr.number)}</a>`
            : `#${esc(t.pr.number)}`
          : ''
        const ts = spendByTicket[t.id]
        const tokens = !hasSpend
          ? ''
          : ts && typeof ts.total === 'number'
            ? `<td class="tokens" title="${esc(['worker', 'reviewer', 're-review', 'disposition', 'proxies'].filter(r => typeof ts[r] === 'number' || ts.unknown.includes(r)).map(r => `${r} ${typeof ts[r] === 'number' ? fmtTokens(ts[r]) : '?'}`).join(' · '))}">${fmtTokens(ts.total)}${ts.unknown.length ? '<span class="dim">+?</span>' : ''}</td>`
            : `<td class="tokens dim">${ts && ts.unknown.length ? '?' : '—'}</td>`
        return `<tr><td class="id">${esc(t.id)}</td><td>${esc(t.title)}</td><td><span class="badge s-${esc(t.state)}">${esc(LABEL[t.state] || t.state)}</span></td><td class="pr">${pr}</td>${tokens}</tr>`
      })
      .join('\n')
    return `<section class="epic">
<h2>${esc(name)} ${delivery} ${here}</h2>
<p class="counts">${mine.length} tickets · ${counts}${spendLine}</p>
<table><thead><tr><th>ID</th><th>Ticket</th><th>State</th><th>PR</th>${hasSpend ? '<th>Tokens</th>' : ''}</tr></thead><tbody>
${rows}
</tbody></table>
</section>`
  })

  const nextUp = epics
    .map(name => tickets.find(t => t.epic === name && t.state === 'todo'))
    .filter(Boolean)
    .map(t => `<li><code>/flow:ticket ${esc(t.id)}</code> — ${esc(t.title)} <span class="dim">(${esc(t.epic)})</span></li>`)

  const body = !tickets.length && !epics.length ? '<p class="empty">no epics found under <code>epics/</code></p>' : sections.join('\n')

  return `<title>${esc(title)}</title>
<style>
  :root { --ground:#FAF9F6; --surface:#F1EFE8; --ink:#22261F; --muted:#6C7266; --line:#DBD7CB; --accent:#3E7A5E;
          --ok:#2E6B4F; --warn:#A97A1F; --bad:#A03B2E; --info:#3A6B8A; --chip:#E7E4DA; }
  @media (prefers-color-scheme: dark) { :root:not([data-theme="light"]) {
    --ground:#151815; --surface:#1C201C; --ink:#E3E6DF; --muted:#949B8F; --line:#2E332D; --accent:#72B591;
    --ok:#79BD98; --warn:#D2A452; --bad:#D07A6C; --info:#7FAECB; --chip:#262B26; } }
  :root[data-theme="dark"] {
    --ground:#151815; --surface:#1C201C; --ink:#E3E6DF; --muted:#949B8F; --line:#2E332D; --accent:#72B591;
    --ok:#79BD98; --warn:#D2A452; --bad:#D07A6C; --info:#7FAECB; --chip:#262B26; }
  body { background:var(--ground); color:var(--ink); margin:0; padding:2.5rem 1.25rem 4rem;
         font:16px/1.6 -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; }
  main { max-width:52rem; margin:0 auto; }
  h1 { font-size:1.7rem; margin:0 0 0.25rem; }
  .meta { color:var(--muted); font-size:0.85rem; margin:0 0 1.5rem; }
  .note { background:var(--surface); border:1px solid var(--line); border-left:3px solid var(--warn);
          border-radius:8px; padding:0.5rem 0.9rem; font-size:0.88rem; margin:0.5rem 0; }
  .epic { margin:2rem 0; }
  h2 { font-size:1.15rem; margin:0 0 0.2rem; }
  .counts { color:var(--muted); font-size:0.85rem; margin:0 0 0.5rem; }
  .here { font-size:0.7rem; color:var(--accent); border:1px solid var(--accent); border-radius:99px; padding:0.05rem 0.5rem; vertical-align:middle; }
  .delivery { font-size:0.7rem; color:var(--info); border:1px solid var(--info); border-radius:99px; padding:0.05rem 0.5rem; vertical-align:middle; }
  .twrap, section { overflow-x:auto; }
  table { border-collapse:collapse; width:100%; font-size:0.9rem; }
  th { text-align:left; font-size:0.7rem; letter-spacing:0.08em; text-transform:uppercase; color:var(--muted);
       border-bottom:1.5px solid var(--ink); padding:0.35rem 0.75rem 0.35rem 0; }
  td { border-bottom:1px solid var(--line); padding:0.45rem 0.75rem 0.45rem 0; }
  .id, .pr, code { font-family:ui-monospace, "SF Mono", Menlo, Consolas, monospace; font-size:0.85em; }
  td.tokens { font-variant-numeric:tabular-nums; text-align:right; white-space:nowrap; }
  th:last-child { text-align:right; }
  .tokens .dim { margin-left:0.15rem; }
  .badge { font-size:0.72rem; border-radius:99px; padding:0.1rem 0.55rem; background:var(--chip); white-space:nowrap; }
  .s-shipped { color:var(--ok); } .s-integrated { color:var(--info); } .s-in-review { color:var(--info); }
  .s-done, .s-in-progress { color:var(--warn); } .s-blocked { color:var(--bad); } .s-todo { color:var(--muted); }
  .empty, .dim { color:var(--muted); }
  a { color:var(--accent); }
  ul.next { padding-left:1.2rem; } ul.next li { margin:0.3rem 0; }
</style>
<main>
<h1>${esc(title)}</h1>
<p class="meta">derived from git, commit subjects on ${esc(data.defaultBranch || 'the default branch')}, and open pull requests${hasSpend ? '; tokens as recorded in the status logs, never estimated (? marks an unknown, — nothing recorded)' : ''}${generatedAt ? ` · generated ${esc(generatedAt)}` : ''} — a snapshot, not a store; regenerate rather than edit</p>
${notes.map(n => `<div class="note">${n}</div>`).join('\n')}
${body}
${nextUp.length ? `<section class="epic"><h2>Next up</h2><ul class="next">\n${nextUp.join('\n')}\n</ul></section>` : ''}
</main>
`
}

// ── entry point ──────────────────────────────────────────────────────────────
// Guarded so the test suite can import renderBoard without running the CLI.

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const argv = process.argv.slice(2)
  const outIx = argv.indexOf('--out')
  const outFile = outIx !== -1 ? argv[outIx + 1] : null
  const positional = argv.filter((a, i) => !a.startsWith('--') && i !== outIx + 1)
  const epic = positional[0]

  if (outIx !== -1 && !outFile) {
    console.error('board: --out needs a file path')
    process.exit(2)
  }

  const ticketsScript = join(dirname(fileURLToPath(import.meta.url)), 'tickets.mjs')
  const raw = execFileSync(process.execPath, [ticketsScript, 'list', ...(epic ? [epic] : []), '--json'], {
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'inherit'], // tickets.mjs errors (unknown epic, not a repo) surface verbatim
  })
  const data = JSON.parse(raw)
  // The spend ledger rides along the same way — derived, never stored. Its
  // failure is not the board's: an unreadable ledger drops the column, and
  // the page says nothing about tokens rather than something wrong.
  let spend = null
  try {
    spend = JSON.parse(execFileSync(process.execPath, [ticketsScript, 'spend', ...(epic ? [epic] : []), '--json'], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }))
  } catch { /* no ledger — no column */ }

  let repoName = basename(process.cwd())
  try {
    repoName = basename(execFileSync('git', ['rev-parse', '--show-toplevel'], { encoding: 'utf8' }).trim())
  } catch { /* not fatal: the cwd basename is a fine fallback for a title */ }

  const html = renderBoard(data, {
    title: epic ? `${repoName} — ${epic} board` : `${repoName} board`,
    generatedAt: new Date().toISOString().slice(0, 16).replace('T', ' '),
    spend,
  })
  if (outFile) writeFileSync(outFile, html)
  else process.stdout.write(html)
}
