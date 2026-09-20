#!/usr/bin/env node
// release-page — render a release epic's walkthrough as one self-contained
// HTML page, for the one human gate of a release epic: the release pull
// request.
//
// That pull request is the largest diff in the methodology and the only thing
// a human approves, and its body is prose a session wrote at the end of a long
// run. This page is the same evidence laid out to be READ: what is being
// merged and how big it is, whether every ticket's checks still pass at the
// head, then one section per ticket in the order they were built — what it
// built, how it was verified, what its review found, what it departed from,
// its commits — and what is still owed. It replaces nothing: GitHub is where
// the merge is decided and the body stays what it was. It is steering material,
// not record — published (an artifact keeps one URL), linked from the body,
// regenerated on demand, never committed.
//
// A read-only view over two JSON documents, both derived:
//
//   tickets.mjs release <epic> --json      entries, commits, owed, last run
//   tickets.mjs check-epic <epic> --json   the release check (minutes of test
//                                          suites — so it is handed in as a
//                                          file, never run a second time here)
//
// Usage — from the repository, on `epic/<name>`:
//
//   release-page.mjs <epic> [--check <check-epic.json>] [--out <file>]
//
// A ledger taken at an earlier commit is drawn as NOT a check of this release
// — unless git says the only files changed since are this epic's `runs.md` and
// `shadow-reviews.md`: the run record is committed after the pull request
// opens, no CHECK reads those files, and the page is rendered again then.
//
// Without `--check` the page says the release check was not supplied, in the
// place its ledger would be — an absent ledger is never drawn as a green one.
//
// Every ticket section carries a stable anchor (`id="t-<ID>"`), and so do the
// fixed sections: a later comment layer attaches to those, so they are part of
// this page's contract and a test holds them.
//
// The page is an HTML fragment opening with a <title> tag — the shape the
// Artifact publisher expects — and browsers render the bare fragment fine.
//
// Zero dependencies, no configuration, stores nothing.

import { execFileSync } from 'node:child_process'
import { readFileSync, writeFileSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c])

// Status-entry text is Markdown nobody here parses: shown as written, with
// its line breaks, because a rendering that guessed at structure would be a
// second reading of the record. Inline `code` is the one thing marked up —
// the entries are full of commands and paths.
const prose = (s) => esc(s).replace(/`([^`\n]+)`/g, '<code>$1</code>')

const LANDED = new Set(['shipped', 'integrated'])
// The fields a reader decides on come first and open; the rest are there,
// folded, because an entry is long and the order it was written in is not the
// order it is read in at a release.
const LEAD_FIELDS = ['Built', 'Verified', 'Compared', 'Deviation', 'Deviations closed', 'Owed']

// `recordOnlySince`: the ledger was taken at an earlier commit, and the CLI
// established that the only files changed since are this epic's run record
// (and its shadow-review file). That is the normal order — the run record is
// committed after the pull request is opened, so it can name it — and no CHECK
// reads those two files, so the ledger still describes this head. Anything
// else changed, and it does not.
export function renderRelease(data, { check = null, generatedAt = '', recordOnlySince = false } = {}) {
  const tickets = Array.isArray(data.tickets) ? data.tickets : []
  const landed = tickets.filter((t) => LANDED.has(t.state))
  const notLanded = tickets.filter((t) => !LANDED.has(t.state))
  const checkById = Object.fromEntries(((check && check.tickets) || []).map((t) => [t.id, t]))
  // The verdict is recomputed here, never taken on the report's word: this
  // page is what a human reads before the one merge they decide, and every
  // way a ledger can fail to be about this release has to read as "no".
  const moved = Boolean(check) && (!check.head || !data.head || check.head !== data.head)
  const stale = moved && !recordOnlySince
  const unchecked = check ? landed.filter((t) => !checkById[t.id]).map((t) => t.id) : []
  const wrongEpic = Boolean(check) && check.epic !== data.epic
  // Counts must be THERE to agree: `undefined === undefined` is how a report
  // with no numbers in it read as green once. And the rows decide with the
  // counters — a passing counter beside a failed row is a failed row.
  const int = (v) => Number.isInteger(v) && v >= 0
  const rowGreen = (t) => int(t.total) && t.passed === t.total && !(t.problems || []).length && !t.skipped && Array.isArray(t.checks) && t.checks.length === t.total && t.checks.every((c) => c.status === 'passed')
  const green =
    Boolean(check) && !stale && !wrongEpic && !unchecked.length && check.allPassed === true && check.headIsRemote !== false && !(check.dirty || []).length &&
    int(check.total) && check.passed === check.total && check.problems === 0 && check.skipped === 0 && (check.tickets || []).length > 0 && (check.tickets || []).every(rowGreen) &&
    (check.tickets || []).reduce((a, t) => a + t.total, 0) === check.total
  // What the ledger is a fact about. One commit back, with only the run record
  // changed since, it is still the evidence — but it is evidence about THAT
  // commit, and the page says so rather than "at head": a CHECK may read git
  // history or the epic's own records, and nothing here can rule that out.
  const at = moved && !stale ? `at ${String(check.head).slice(0, 9)}, one commit before this head` : 'at head'
  const commitLink = (c) => (data.webUrl ? `<a href="${esc(data.webUrl)}/commit/${esc(c.sha)}"><code>${esc(c.sha.slice(0, 9))}</code></a>` : `<code>${esc(c.sha.slice(0, 9))}</code>`)

  // ── the release check ──────────────────────────────────────────────────────
  // Three states, and the page must never draw one as another: supplied and
  // green, supplied and not, and not supplied at all.
  let checkSection
  if (!check) {
    checkSection = `<div class="note bad">The release check was not supplied to this page (<code>--check</code>). Run <code>tickets.mjs check-epic ${esc(data.epic)} --json</code> on the release head and render again — nothing here says the assembled epic still passes its tickets' checks.</div>`
  } else {
    const changed = (check.tickets || []).filter((t) => t.criteriaChanged)
    const removed = check.removedSinceSignoff || []
    const compares = (check.tickets || []).reduce((n, t) => n + (t.compares || []).length, 0)
    checkSection = `
<p class="verdict ${green ? 'ok' : 'bad'}">${green ? (moved ? `Passed ${esc(at)}` : 'Passed') : stale || wrongEpic ? 'NOT A CHECK OF THIS RELEASE' : 'FAILED'} — ${esc(check.passed ?? '?')}/${esc(check.total ?? '?')} checks across ${esc((check.tickets || []).length)} ticket(s), at <code>${esc(String(check.head || '').slice(0, 12))}</code>${check.skipped ? ` · ${esc(check.skipped)} skipped, which does not pass` : ''}${check.problems ? ` · ${esc(check.problems)} malformed` : ''}</p>
${wrongEpic ? `<div class="note bad">This ledger is the release check of <code>${esc(check.epic)}</code>, not of <code>${esc(data.epic)}</code>.</div>` : ''}
${stale ? `<div class="note bad">This ledger was taken at <code>${esc(String(check.head || '(no commit)').slice(0, 12))}</code> and the page describes <code>${esc(String(data.head || '(no commit)').slice(0, 12))}</code> — it is not a check of what is being released. Run it again on this head.</div>` : ''}
${moved && !stale ? `<div class="note">The ledger was taken at <code>${esc(check.head.slice(0, 12))}</code>, before this epic's run record was committed — the only files changed since. A check that reads git history or the epic's own records could answer differently now; run <code>check-epic</code> again on this head if any does.</div>` : ''}
${(check.dirty || []).length ? `<div class="note bad">Tracked files were modified and uncommitted when this check ran, so what was checked is not the commit being released: ${esc(check.dirty.map((l) => l.trim()).join(', '))}.</div>` : ''}
${(check.orphanIds || []).length ? `<div class="note bad">Commits in this release carry a ticket ID no document knows — a ticket whose section was deleted is checked by nobody: ${esc(check.orphanIds.join(', '))}.</div>` : ''}
${check.shared ? '<div class="note">A command several tickets share was run once and judged against each ticket\'s own <code>EXPECT</code>. If any <code>CHECK</code> in this epic writes state, that is not the same as running each ticket alone — <code>check-epic --each</code> is.</div>' : ''}
${unchecked.length ? `<div class="note bad">Landed and not in this ledger, so checked by nobody: ${esc(unchecked.join(', '))}.</div>` : ''}
${check.headIsRemote === false ? `<div class="note bad">The check ran on a checkout that was ${esc(check.headRelation || 'not at')} the remote epic branch's head — the pull request carries the remote's.</div>` : ''}
${check.shallow ? '<div class="note">Shallow clone: the sign-off commit may be the clone\'s boundary, so "criteria changed since sign-off" can be silently empty.</div>' : ''}
<div class="twrap"><table><thead><tr><th>Ticket</th><th>Checks</th><th>What did not pass</th></tr></thead><tbody>
${(check.tickets || [])
  .map((t) => {
    const bad = (t.checks || []).filter((c) => c.status !== 'passed')
    return `<tr><td class="id"><a href="#t-${esc(t.id)}">${esc(t.id)}</a></td><td class="${rowGreen(t) ? 's-ok' : 's-bad'}">${esc(t.passed)}/${esc(t.total)}${t.skipped ? ` · ${esc(t.skipped)} skipped` : ''}${(t.problems || []).length ? ` · ${esc(t.problems.length)} malformed` : ''}</td><td>${bad.map((c) => `<div><code>${esc(c.check)}</code><br><span class="dim">${esc(c.evidence)}</span></div>`).join('') || (t.problems || []).map((p) => `<div class="dim">line ${esc(p.line)}: ${esc(p.why)}</div>`).join('') || '<span class="dim">—</span>'}</td></tr>`
  })
  .join('\n')}
</tbody></table></div>
${
  changed.length || removed.length
    ? `<h3 id="criteria-changed">Criteria that differ from sign-off <span class="dim">(<code>${esc(String(check.signoff || '').slice(0, 12))}</code>)</span></h3>
<p class="dim">Green either way — shown because a script cannot tell a re-plan from a gate somebody loosened, and you can.</p>
${changed.map((t) => `<div class="diff"><b>${esc(t.id)}</b><div class="was">was: ${t.criteriaChanged.was ? esc(t.criteriaChanged.was.join(' | ') || '(none)') : '(not in the signed-off document)'}</div><div class="now">now: ${esc(t.criteriaChanged.now.join(' | ') || '(none)')}</div></div>`).join('\n')}
${removed.map((t) => `<div class="diff"><b>${esc(t.id)}</b> — in the signed-off document, gone from this one; checked nowhere<div class="was">was: ${esc(t.was.join(' | ') || '(no criteria)')}</div></div>`).join('\n')}`
    : ''
}
${compares ? `<p class="dim">${esc(compares)} <code>COMPARE</code> criterion(s) were not re-verified at this commit — there is no browser here; each ticket's <b>Compared</b> table below is from its own run.</p>` : ''}`
  }

  // ── one section per ticket ─────────────────────────────────────────────────
  const field = (f, open) => `<details${open ? ' open' : ''}><summary>${esc(f.label)}</summary><div class="ftext">${prose(f.text) || '<span class="dim">(empty)</span>'}</div></details>`
  const ticketSection = (t) => {
    const c = checkById[t.id]
    const entries = (t.entries || []).map((e) => {
      const lead = e.fields.filter((f) => LEAD_FIELDS.includes(f.label))
      const rest = e.fields.filter((f) => !LEAD_FIELDS.includes(f.label))
      return `<div class="entry"><p class="ehead">${esc(e.heading)}</p>${e.lead ? `<div class="ftext">${prose(e.lead)}</div>` : ''}${!e.fields.length && !e.lead ? '<p class="dim">(the entry has a heading and nothing under it that reads as a field)</p>' : ''}${lead.map((f) => field(f, true)).join('')}${rest.map((f) => field(f, false)).join('')}</div>`
    })
    const open = (t.deviations || []).filter((d) => !d.closed)
    return `<section class="ticket" id="t-${esc(t.id)}">
<h2><span class="id">${esc(t.id)}</span> ${esc(t.title)} <span class="badge s-${esc(t.state)}">${esc(t.state)}</span>${c ? ` <span class="badge ${rowGreen(c) && !stale && !wrongEpic ? 's-ok' : 's-bad'}">checks ${esc(c.passed ?? '?')}/${esc(c.total ?? '?')}${stale || wrongEpic ? ' — not at this head' : ` ${esc(at)}`}</span>` : check && LANDED.has(t.state) ? ' <span class="badge s-bad">not in the release check</span>' : ''}${(t.deviations || []).length ? ` <span class="badge ${open.length ? 's-bad' : ''}">${esc(t.deviations.length)} deviation(s)${open.length ? `, ${esc(open.length)} open` : ''}</span>` : ''}</h2>
${entries.join('\n') || '<p class="empty">no status entry — nothing records what this ticket built</p>'}
${
  (t.commits || []).length
    ? `<details><summary>${esc(t.commits.length)} commit(s)</summary><ul class="commits">${t.commits.map((k) => `<li>${commitLink(k)} ${esc(k.subject)} <span class="dim">${esc(k.stat)}</span></li>`).join('')}</ul></details>`
    : '<p class="dim">no commit in this release carries this ticket\'s ID</p>'
}
</section>`
  }

  const owed = data.owed || []
  return `<title>${esc(data.epic)} — release walkthrough</title>
<style>
  :root { --ground:#FAF9F6; --surface:#F1EFE8; --ink:#22261F; --muted:#6C7266; --line:#DBD7CB; --accent:#3E7A5E;
          --ok:#2E6B4F; --warn:#A97A1F; --bad:#A03B2E; --info:#3A6B8A; --chip:#E7E4DA; }
  @media (prefers-color-scheme: dark) { :root:not([data-theme="light"]) {
    --ground:#151815; --surface:#1C201C; --ink:#E3E6DF; --muted:#949B8F; --line:#2E332D; --accent:#72B591;
    --ok:#79BD98; --warn:#D2A452; --bad:#D07A6C; --info:#7FAECB; --chip:#262B26; } }
  :root[data-theme="dark"] {
    --ground:#151815; --surface:#1C201C; --ink:#E3E6DF; --muted:#949B8F; --line:#2E332D; --accent:#72B591;
    --ok:#79BD98; --warn:#D2A452; --bad:#D07A6C; --info:#7FAECB; --chip:#262B26; }
  body { background:var(--ground); color:var(--ink); margin:0; padding:2.5rem 1rem 4rem;
         font:16px/1.6 -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; }
  main { max-width:54rem; margin:0 auto; }
  h1 { font-size:1.7rem; margin:0 0 0.25rem; }
  h2 { font-size:1.15rem; margin:0 0 0.5rem; line-height:1.4; }
  h3 { font-size:0.95rem; margin:1.25rem 0 0.25rem; }
  section { margin:2.25rem 0; overflow-x:auto; }
  .meta, .dim, .empty { color:var(--muted); }
  .meta { font-size:0.85rem; margin:0 0 1.5rem; }
  .rule { background:var(--surface); border:1px solid var(--line); border-left:3px solid var(--info); border-radius:8px; padding:0.6rem 0.9rem; font-size:0.92rem; }
  .note { background:var(--surface); border:1px solid var(--line); border-left:3px solid var(--warn); border-radius:8px; padding:0.5rem 0.9rem; font-size:0.88rem; margin:0.5rem 0; }
  .note.bad { border-left-color:var(--bad); }
  .verdict { font-weight:600; } .verdict.ok { color:var(--ok); } .verdict.bad { color:var(--bad); }
  nav { font-size:0.88rem; line-height:2; } nav a { margin-right:0.75rem; white-space:nowrap; }
  table { border-collapse:collapse; width:100%; font-size:0.9rem; }
  th { text-align:left; font-size:0.7rem; letter-spacing:0.08em; text-transform:uppercase; color:var(--muted); border-bottom:1.5px solid var(--ink); padding:0.35rem 0.75rem 0.35rem 0; }
  td { border-bottom:1px solid var(--line); padding:0.45rem 0.75rem 0.45rem 0; vertical-align:top; }
  .id, code { font-family:ui-monospace, "SF Mono", Menlo, Consolas, monospace; font-size:0.85em; }
  code { overflow-wrap:anywhere; }
  .badge { font-size:0.72rem; font-weight:400; border-radius:99px; padding:0.1rem 0.55rem; background:var(--chip); white-space:nowrap; vertical-align:middle; }
  .s-ok, .s-shipped { color:var(--ok); } .s-integrated { color:var(--info); } .s-bad, .s-blocked { color:var(--bad); }
  .s-in-progress, .s-done, .s-in-review { color:var(--warn); } .s-todo, .s-waiting { color:var(--muted); }
  .ticket { border-top:1px solid var(--line); padding-top:1.5rem; }
  .ehead { font-size:0.8rem; color:var(--muted); margin:0.75rem 0 0.25rem; }
  details { margin:0.3rem 0; } summary { cursor:pointer; font-weight:600; font-size:0.9rem; }
  .ftext { white-space:pre-wrap; font-size:0.9rem; margin:0.25rem 0 0.75rem; padding-left:0.9rem; border-left:2px solid var(--line); overflow-wrap:anywhere; }
  .diff { font-size:0.88rem; margin:0.5rem 0; } .was { color:var(--bad); } .now { color:var(--ok); } .was, .now { font-family:ui-monospace, Menlo, monospace; font-size:0.8rem; overflow-wrap:anywhere; }
  ul.commits, ul.plain { padding-left:1.1rem; font-size:0.88rem; } ul.commits li, ul.plain li { margin:0.25rem 0; }
  pre { white-space:pre-wrap; font-size:0.82rem; background:var(--surface); border:1px solid var(--line); border-radius:8px; padding:0.75rem; overflow-wrap:anywhere; }
  a { color:var(--accent); }
</style>
<main>
<h1>${esc(data.epic)} — release walkthrough</h1>
<p class="meta">derived from git, the status log and the run record at <code>${esc(String(data.head || '').slice(0, 12))}</code> on <code>${esc(data.branch || '')}</code>${generatedAt ? ` · generated ${esc(generatedAt)}` : ''} · a view, not a record: regenerate it rather than trusting an old copy</p>
<div class="rule" id="merge-rule"><b>Merge with a merge commit — never squash.</b> This pull request carries every ticket's commits, and their subjects are how the board knows a ticket shipped: squashed, every ticket but one reads as unshipped.</div>
<p id="size"><b>Size:</b> ${esc(data.diffstat || 'no diff against the default branch')} against <code>${esc(data.defaultBranch || '')}</code> · ${esc(landed.length)} ticket(s) landed${notLanded.length ? ` · <span class="s-bad">${esc(notLanded.length)} not landed: ${esc(notLanded.map((t) => `${t.id} (${t.state})`).join(', '))}</span>` : ''}</p>
${data.delivery === 'release' && data.branch !== `epic/${data.epic}` ? `<div class="note bad">Rendered on <code>${esc(data.branch || '(detached)')}</code>, not on <code>epic/${esc(data.epic)}</code>: commits and size are measured from this checkout, so they do not describe the release. Check out the epic branch and render again.</div>` : ''}
${data.delivery && data.delivery !== 'release' ? `<div class="note">This is a <code>Delivery: ${esc(data.delivery)}</code> epic: its tickets ship through pull requests of their own, so there is no release to walk through — commits and size below mean little here.</div>` : ''}
<nav>${tickets.map((t) => `<a href="#t-${esc(t.id)}">${esc(t.id)}</a>`).join('')}<a href="#owed">Owed</a><a href="#other-commits">Other commits</a><a href="#last-run">Last run</a></nav>

<section id="release-check">
<h2>Release check</h2>
${checkSection}
</section>

${tickets.map(ticketSection).join('\n\n')}

<section id="owed">
<h2>Owed <span class="dim">— recorded in the status log, not marked resolved</span></h2>
${owed.length ? `<ul class="plain">${owed.map((o) => `<li><a href="#t-${esc(o.id)}" class="id">${esc(o.id)}</a> <span class="dim">(${esc(o.date)})</span> ${prose(o.text)}</li>`).join('')}</ul>` : '<p>None outstanding.</p>'}
${(data.owedNotes || []).map((n) => `<div class="note">${esc(n)}</div>`).join('')}
</section>

<section id="other-commits">
<h2>Commits with no ticket of this epic</h2>
${(data.otherCommits || []).length ? `<p class="dim">Run records, plan edits, and anything a refresh from <code>${esc(data.defaultBranch || '')}</code> did not already carry. Read the ones that are not obviously one of those.</p><ul class="commits">${data.otherCommits.map((k) => `<li>${commitLink(k)} ${esc(k.subject)} <span class="dim">${esc(k.stat)}</span></li>`).join('')}</ul>` : '<p>None.</p>'}
</section>

<section id="last-run">
<h2>The last run record</h2>
${data.lastRun ? `<p class="ehead">${esc(data.lastRun.heading)}</p><pre>${esc(data.lastRun.text)}</pre>` : '<p class="empty">no run record — this epic was not built by an unattended run, or its record was never written</p>'}
</section>
</main>
`
}

// ── entry point ──────────────────────────────────────────────────────────────
// Guarded so the test suite can import renderRelease without running the CLI.

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const argv = process.argv.slice(2)
  const valueOf = (flag) => {
    const i = argv.indexOf(flag)
    if (i === -1) return null
    if (!argv[i + 1] || argv[i + 1].startsWith('--')) {
      console.error(`release-page: ${flag} needs a file path`)
      process.exit(2)
    }
    return argv[i + 1]
  }
  const outFile = valueOf('--out')
  const checkFile = valueOf('--check')
  const epic = argv.filter((a, i) => !a.startsWith('--') && !['--out', '--check'].includes(argv[i - 1]))[0]
  if (!epic) {
    console.error('usage: release-page.mjs <epic> [--check <check-epic.json>] [--out <file>]')
    process.exit(2)
  }
  const ticketsScript = join(dirname(fileURLToPath(import.meta.url)), 'tickets.mjs')
  const data = JSON.parse(execFileSync(process.execPath, [ticketsScript, 'release', epic, '--json'], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'inherit'], maxBuffer: 64 * 1024 * 1024 }))
  let check = null
  if (checkFile) {
    try {
      check = JSON.parse(readFileSync(checkFile, 'utf8'))
    } catch (e) {
      // Refused, not dropped: a page rendered without the ledger it was asked
      // to carry would say "not supplied", which is not what happened.
      console.error(`release-page: cannot read ${checkFile} as check-epic's JSON (${e.message})`)
      process.exit(2)
    }
    if (check.epic !== epic) {
      console.error(`release-page: ${checkFile} is the release check of "${check.epic}", not of "${epic}"`)
      process.exit(2)
    }
  }
  // A ledger from an earlier commit still describes this head when the only
  // files changed since are this epic's run record — the record is committed
  // after the pull request opens, so that is the normal order. Asked of git,
  // by exact path: `tickets.md` lives beside them and IS read by the checks.
  let recordOnlySince = false
  if (check && check.head && data.head && check.head !== data.head) {
    try {
      const changed = execFileSync('git', ['diff', '--name-only', `${check.head}..${data.head}`], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).split('\n').filter(Boolean)
      const record = new Set([`epics/${epic}/runs.md`, `epics/${epic}/shadow-reviews.md`])
      recordOnlySince = changed.length > 0 && changed.every((f) => record.has(f))
    } catch { /* an unknown commit is a stale ledger, which is the default */ }
  }
  const html = renderRelease(data, { check, recordOnlySince, generatedAt: new Date().toISOString().slice(0, 16).replace('T', ' ') })
  if (outFile) writeFileSync(outFile, html)
  else process.stdout.write(html)
}
