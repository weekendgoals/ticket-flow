#!/usr/bin/env node
// tickets — derive epic/ticket state instead of maintaining it by hand.
//
// Hand-maintained status tables drift from the thing they describe, so nothing
// here is read from one. Every fact comes from a source that cannot misreport
// itself:
//
//   what the tickets are  ->  "## <ID> — <title>" headings in epics/<e>/tickets.md
//   what is implemented   ->  "### <ID> — … — DONE" headings in epics/<e>/status.md
//   what the runs spent   ->  "### Run — …" records in epics/<e>/runs.md
//   what is in flight     ->  local git branches named for the ticket
//   what has shipped      ->  commit subjects on main, and gh pr list
//
// Usage — run with node from anywhere inside the target repo. Shipped with the
// `flow` plugin, so skills invoke it as
// `node "${CLAUDE_PLUGIN_ROOT}/scripts/tickets.mjs" <command>`:
//
//   tickets.mjs list [epic] [--json]     status board, all epics or one
//   tickets.mjs find <ID> [--json] [--from <ref>]
//                                        resolve an ID to its epic's doc paths
//                                        and the epic's declarations; --from
//                                        reads those declarations from a git
//                                        ref (the signed-off document)
//                                        instead of the working tree
//   tickets.mjs brief [ID] [--json]      a ticket's full section + the epic
//                                        preamble (ground rules) + owed items
//                                        not yet marked resolved + derived
//                                        state; no ID briefs the first
//                                        startable ticket
//   tickets.mjs next [epic] [--json]     what to start next
//   tickets.mjs check <ID> [--json] [--from <ref>]
//                                        run the ticket's CHECK/EXPECT
//                                        acceptance criteria and report the
//                                        ledger; --from reads the criteria
//                                        from a git ref (the signed-off
//                                        document) instead of the working tree
//   tickets.mjs compared <ID> [--json] [--log-from <ref>]
//                                        how many `**Compared:**` fidelity
//                                        tables the ticket's own status
//                                        entries record; --log-from reads the
//                                        log off a pushed branch, and an
//                                        unreadable log exits nonzero rather
//                                        than counting 0
//   tickets.mjs owed <epic> [--json]     every owed item the epic's status log
//                                        records and nothing has resolved —
//                                        the release pull request's Owed
//                                        section, printed rather than recalled
//   tickets.mjs next [epic] --with-waiting
//                                        the run driver's form of `next`:
//                                        {ready, waiting} as JSON, always exit
//                                        0 — so "tickets wait and none can
//                                        start" reaches the driver as data it
//                                        refuses on in code, never only as an
//                                        exit code relayed by a shell proxy
//   tickets.mjs spend [epic] [--json]    the recorded token ledger per ticket
//                                        and per epic, derived from the
//                                        status log's Tokens lines, addendum
//                                        phrases and the run records in
//                                        epics/<e>/runs.md (and in status.md
//                                        for logs written before the split);
//                                        unknown stays unknown, never zero.
//                                        Beside it, recorded TIME: seconds per
//                                        role and each ticket's wall, from the
//                                        run records' Time lines (written by
//                                        scripts/meter.mjs), and where no wall
//                                        was recorded the ticket's commit span
//                                        from git — labelled, never as wall
//   tickets.mjs epics [--json]           list known epics
//   tickets.mjs current [--json]         the epic this folder belongs to
//   tickets.mjs doctor [--json]          check the flow's preconditions and
//                                        flag headings that silently misparse
//
// The repo is resolved from the current working directory, not from this file's
// location, so running it out of the plugin cache is correct.
//
// Zero dependencies, no configuration, stores nothing.

import { execFileSync, spawnSync } from 'node:child_process'
import { readFileSync, readdirSync, existsSync, statSync } from 'node:fs'
import { join, basename } from 'node:path'
import { homedir } from 'node:os'

const TICKET_ID = '[A-Z][A-Z0-9]*-\\d+'

// The two parsed heading shapes. Doctor checks near-misses against these exact
// patterns — a heading that almost matches silently reads as "not started" /
// "not done", which is the one way derived state can lie.
const TICKET_HEADING = new RegExp(`^##\\s+(${TICKET_ID})\\s*[—–-]\\s*(.+?)\\s*$`)
const STATUS_HEADING = new RegExp(
  `^###\\s+(${TICKET_ID})\\s*[—–-]\\s*(.+?)\\s*[—–-]\\s*(\\d{4}-\\d{2}-\\d{2})\\s*[—–-]\\s*([A-Z]+)\\s*$`,
)
const KNOWN_OUTCOMES = new Set(['DONE', 'BLOCKED', 'ABANDONED'])

// ── shell helpers ────────────────────────────────────────────────────────────

function git(args, { allowFail = false } = {}) {
  try {
    return execFileSync('git', args, { cwd: repoRoot, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim()
  } catch (e) {
    if (allowFail) return null
    throw new Error(`git ${args.join(' ')} failed: ${e.stderr || e.message}`)
  }
}

const repoRoot = (() => {
  try {
    return execFileSync('git', ['rev-parse', '--show-toplevel'], { encoding: 'utf8' }).trim()
  } catch {
    console.error('tickets: not inside a git repository')
    process.exit(1)
  }
})()

const defaultBranch =
  (git(['symbolic-ref', '--short', 'refs/remotes/origin/HEAD'], { allowFail: true }) || 'origin/main')
    .replace(/^origin\//, '')

// ── epic discovery ───────────────────────────────────────────────────────────

// Recognised delivery values. Anything else still parses (and is exposed
// as-is) but doctor flags it — an unrecognised value must never silently
// default.
const DELIVERIES = new Set(['release', 'incremental'])

// Tolerant parse of the epic preamble's declaration lines: the value is the
// first word after the colon, case-insensitive; anything after it is prose,
// so "Delivery: release — one human gate, at the release PR" parses as
// release. Only the preamble is read — text above the first "## " heading.
// The value is anchored to the label's own line ([^\S\n], never \s, around
// the colon): a value-less label must read as absent, not adopt the first
// word of the next paragraph — a bare label above prose once scavenged the
// prose's first word into a live value (Q-14).
//
// "Delivery" is the epic's one execution declaration. `release` — tickets
// integrate into epic/<name> unattended and one human-gated release pull
// request goes to the default branch; `incremental` (the default when the
// line is absent) — every ticket is its own human-gated pull request to the
// default branch, merged before the next starts. One line, one decision:
// there are no separate topology and run-mode declarations, so the
// unattended-merges-to-main contradiction cannot be declared at all.
//
// "Reviewer model", "Worker model" and "Planner model" ride the same
// parse: optional lines naming the model the skills pass when spawning the
// ticket reviewer, the implementing workers, and the plan reviewer
// respectively. Model identifiers carry digits and
// dots ("claude-opus-4.5"), so their value charset is wider than
// delivery's. Absent is null — for the reviewer the skills fall back to
// their consequence-tier default, for workers they pass no model at all
// and the worker inherits the invoking session's; this script never picks
// a model.
//
// "Consequence paths" is the fourth optional line: comma-separated path
// globs whose changes always price review at the consequence tier in an
// unattended run — the epic's mechanical projection of the risk list onto
// the repository's layout. Parsed as a list of the same tolerant shape:
// each comma-separated segment's first word is the glob, anything after it
// is prose. Case is preserved — paths are case-sensitive, unlike models
// and delivery. Absent is null; this script never judges the globs, the
// run driver validates and applies them.
// `parsePreamble` reads the working tree; `parsePreambleText` parses a document
// already in hand, which is how `find --from <ref>` reads the declarations as
// they stand at a git ref rather than on whatever branch is checked out. One
// parser either way — a second copy would drift the moment a line is added.
function parsePreamble(ticketsDoc) {
  return parsePreambleText(readFileSync(ticketsDoc, 'utf8'))
}
function parsePreambleText(doc) {
  const preamble = doc.split(/^##\s/m)[0]
  const grab = (label, charset = '[A-Za-z-]+') => {
    const m = preamble.match(new RegExp(`^${label}[^\\S\\n]*:[^\\S\\n]*(${charset})`, 'im'))
    return m ? m[1].toLowerCase() : null
  }
  const grabPathList = label => {
    const m = preamble.match(new RegExp(`^${label}[^\\S\\n]*:[^\\S\\n]*(\\S[^\\n]*)`, 'im'))
    if (!m) return null
    const globs = m[1].split(',').map(s => s.trim().split(/\s+/)[0]).filter(Boolean)
    return globs.length ? globs : null
  }
  // "Design sources" is the list of files that hold what the design draws —
  // whatever a browser can render and `getComputedStyle` can read. Its own
  // reader, deliberately NOT `grabPathList`: that one keeps a segment's first
  // WORD, which is right for a glob followed by prose and wrong for a file a
  // designer named ("designs/City Desktop.html" would parse as
  // "designs/City"). Here the whole segment between commas is the path,
  // trimmed — which is why the line carries no prose, and why the skills that
  // teach it say so: with spaces legal in a path, nothing could tell a
  // trailing sentence from a filename.
  const grabTextList = label => {
    const m = preamble.match(new RegExp(`^${label}[^\\S\\n]*:[^\\S\\n]*(\\S[^\\n]*)`, 'im'))
    if (!m) return null
    const items = m[1].split(',').map(s => s.trim()).filter(Boolean)
    return items.length ? items : null
  }
  // "Ticket budget" is the fifth optional line: a per-ticket output-token
  // ceiling for unattended runs — digits with an optional k/m suffix
  // (`250000`, `250k`, `1m`), because a budget is a number humans write. The
  // value must end at a word boundary: a bare `\d+` grab would read `250k`
  // as 250 and set a ceiling a thousand times too low, silently — the
  // lookahead makes an unrecognised suffix parse as absent, which the
  // doctor near-miss scan then flags. The run driver halts after any ticket
  // whose pass exceeds the ceiling; this script only parses it, so the
  // configuration lives in the versioned epic document like every other.
  const budget = (() => {
    const v = grab('Ticket budget', '\\d+[km]?(?=\\s|$)')
    if (!v) return null
    return parseInt(v, 10) * (v.endsWith('k') ? 1e3 : v.endsWith('m') ? 1e6 : 1)
  })()
  return {
    delivery: grab('Delivery') ?? 'incremental',
    reviewerModel: grab('Reviewer model', '[A-Za-z0-9._-]+'),
    workerModel: grab('Worker model', '[A-Za-z0-9._-]+'),
    // "Worker runner" names who implements in an unattended run: absent or
    // `claude` is a Claude subagent; `codex` is the plugin's Codex runner
    // script. Parsed here, validated by the run driver, which refuses an
    // unknown value rather than substituting an implementer.
    workerRunner: grab('Worker runner', '[A-Za-z-]+'),
    // "Shadow reviewer" is a trial: `codex` has the run driver hand
    // consequence-tier tickets to runners/codex-review.mjs beside the Claude
    // reviewer, recorded and gating nothing. Parsed here; the driver ignores
    // any other value (a trial refuses nothing).
    shadowReviewer: grab('Shadow reviewer', '[A-Za-z-]+'),
    plannerModel: grab('Planner model', '[A-Za-z0-9._-]+'),
    consequencePaths: grabPathList('Consequence paths'),
    // "Fix bounds exclude" is another optional line: comma-separated path
    // globs the run driver's fix-bounds gate leaves out of the review-fix
    // diff — the same way it already leaves out epics/. For files a fix
    // legitimately fans out into mechanically (the canonical case:
    // translation catalogs, where one new key touches every locale file),
    // whose line count says nothing about the fix's blast radius. Same
    // tolerant list parse as Consequence paths; this script only parses it,
    // the run driver validates and applies it.
    fixBoundsExclude: grabPathList('Fix bounds exclude'),
    // "Design sources" names what the design draws, so that everything
    // downstream can read it: the brief a worker gets, the ticket reviewer's
    // packet and the plan reviewer's. Absent is null — an epic with no design
    // declares none, and nothing here judges the paths; doctor warns about one
    // that does not exist, and this script never opens them.
    designSources: grabTextList('Design sources'),
    ticketBudget: budget,
    // "Parallel" is the epic's opt-in to running independent tickets side by
    // side in an unattended run: the most that may be in flight at once, 2 or
    // 3. Absent — and `1` — is the serial run every epic had before the line
    // existed, which is the point of making it a declaration: an epic written
    // when document order was the only dependency mechanism must not turn
    // parallel because the plugin updated. The ceiling is 3 because the
    // constraint practitioners name every time is review bandwidth, not
    // machines. A value outside 1–3 parses as absent and doctor flags the
    // line, like a budget with an unknown suffix. This script only parses it;
    // applying it is the run driver's job, and until the driver reads the
    // line a run is serial whatever it says.
    parallel: (() => {
      const v = grab('Parallel', '\\d+(?=\\s|$)')
      const n = v ? parseInt(v, 10) : null
      return n >= 1 && n <= 3 ? n : null
    })(),
  }
}

// An epic is a directory under epics/ containing tickets.md. Its status log, run
// log and context live beside it, so there is no index file to keep honest.
function discoverEpics() {
  const root = join(repoRoot, 'epics')
  if (!existsSync(root)) return []
  return readdirSync(root)
    .filter((name) => {
      const dir = join(root, name)
      return statSync(dir).isDirectory() && existsSync(join(dir, 'tickets.md'))
    })
    .map((name) => {
      const dir = join(root, name)
      const optional = (f) => (existsSync(join(dir, f)) ? join(dir, f) : null)
      const ticketsDoc = join(dir, 'tickets.md')
      return {
        epic: name,
        dir,
        ticketsDoc,
        statusDoc: optional('status.md'),
        // The run log is separate from the status log because two writers used
        // to share one file tail: a worker appends a ticket entry on its ticket
        // branch while the run session appends the run record on the epic
        // branch, and every mid-ticket halt then cost a hand merge. Absent
        // until the first run record after the split — every log written
        // before it keeps its records in status.md and is still read there.
        runsDoc: optional('runs.md'),
        // The design map is a planning document like tickets.md, at a fixed
        // name beside it — the differ reads it directly, so there is nothing
        // to declare and nothing to configure. Null until an epic writes one:
        // the path is derived, never parsed, so it cannot disagree with the
        // preamble.
        designMap: optional('design-map.json'),
        contextDir: optional('context'),
        ...parsePreamble(ticketsDoc),
      }
    })
    .sort((a, b) => a.epic.localeCompare(b.epic))
}

// The wg folder IS the epic — a folder named <name> works the epic in
// epics/<name>/. So the folder's own name is the answer whenever it names a real
// epic, and no search is needed. The main checkout is not an epic folder and
// returns null.
function currentEpic(epics) {
  const folder = basename(repoRoot)
  return epics.find((e) => e.epic === folder) || null
}

// ── ticket-doc parsing ───────────────────────────────────────────────────────

// Split a ticket doc into "## <ID> — <title>" sections. Anything above the first
// such heading is epic preamble (ground rules, ordering) and is not a ticket.
// The text form exists because `check --from` parses the document as a git ref
// shows it — same sections, no file on disk.
function parseTicketSections(text, epicName) {
  const tickets = []
  let current = null
  for (const line of text.split('\n')) {
    const m = line.match(TICKET_HEADING)
    if (m) {
      // Strip any status glyph a human hand-added to the heading — the state
      // comes from git, and a stale ✅ in a title is exactly the drift this
      // script exists to stop mattering.
      current = { id: m[1], title: m[2].replace(/[\s✅✓☑️❌⛔️🚧]+$/u, '').trim(), epic: epicName, body: [] }
      tickets.push(current)
    } else if (current) {
      current.body.push(line)
    }
  }
  // Blank lines are trimmed from the ends, never the first line's indent: a
  // whole-body `.trim()` made `  **Blocked by:** DEP-1` a real dependency when
  // it was the section's first line and nothing at all anywhere below it —
  // one spelling, read by position.
  for (const t of tickets) t.body = t.body.join('\n').replace(/^(?:[^\S\n]*\n)+/, '').replace(/\s+$/, '')
  return tickets
}

function parseTickets(epic) {
  return parseTicketSections(readFileSync(epic.ticketsDoc, 'utf8'), epic.epic)
}

// ── dependencies ─────────────────────────────────────────────────────────────
// A ticket that must not start before another is integrated says so on one
// line of its own section:
//
//   **Blocked by:** RUN-1, RUN-3
//
// Bare IDs and commas and NOTHING else — that strictness is the whole design.
// The first dependency graph this plugin had (removed; METHODOLOGY § "Things
// that were built and removed") parsed `Depends on:` tolerantly, and a
// dependency written as prose read as a hard blocker and stalled its ticket
// with nothing saying why. So here a line that is about blocking and does not
// parse is a PROBLEM with a name, never a guess in either direction: the
// ticket waits (starting it early is the unsafe direction), the board says it
// is waiting on a line that will not parse, doctor flags the line, and `next`
// refuses out loud when nothing else can start. Document order stays the
// intended order; this line only says which tickets may NOT overtake which.
const BLOCKED_BY_LINE = new RegExp(`^\\*\\*Blocked by:\\*\\*[^\\S\\n]*(${TICKET_ID}(?:[^\\S\\n]*,[^\\S\\n]*${TICKET_ID})*)[^\\S\\n]*$`)
// What a human writes when they mean that line — and ONLY that. The label
// must open the line at column 0, and be either bold (`**Blocked by…`) or
// followed by its colon (`Blocked by:`). The first cut took any line that
// merely began with the words, after any indent or bullet, and stalled a
// ticket for ever on a wrapped sentence — "…because it is / blocked by the
// vendor API" — and on a Not-in-scope bullet. Prose wraps; a label does not
// start mid-bullet. A near line is a problem, so the near set is kept as small
// as the mistake it exists to catch.
const BLOCKED_BY_NEAR = /^(?:\*\*Blocked[ -]by\b|Blocked[ -]by\s*:)/i
// Two near lines that are NOT problems, because neither states a dependency:
// "nothing" in the words a planner uses for it — the same words the `Depends
// on` check honours, since `**Blocked by:** nothing` stalling while
// `**Depends on:** nothing` did not was the same sentence read two ways — and
// the epic skill's own placeholder, left in by a planner who had no blocker
// to write. Both read as no line at all.
// An EMPTY label is not one of them: it is an interrupted edit, not a
// statement of independence, and under `Parallel:` the difference is whether
// a ticket may be started beside another — so it is a problem, and waits.
const BLOCKED_BY_NOTHING = /^(?:nothing|none|n\/a|[—–-])\s*\.?$/i
const BLOCKED_BY_PLACEHOLDER = /^<ID>(?:\[, <ID>\])?$/
// → { ids } for the strict line, { malformed } for a near line that states
// something unreadable, null for everything else.
function classifyBlockedBy(line) {
  const m = line.match(BLOCKED_BY_LINE)
  if (m) return { ids: m[1].split(',').map((x) => x.trim()) }
  if (!BLOCKED_BY_NEAR.test(line)) return null
  const rest = line.replace(/^\**Blocked[ -]by\**\s*:?\**/i, '').trim()
  if (BLOCKED_BY_NOTHING.test(rest) || BLOCKED_BY_PLACEHOLDER.test(rest)) return null
  return { malformed: line.trim() }
}
// The near set is small on purpose, and what it leaves out must not be left
// SILENT: `- **Blocked by:** DEP-1`, `> **Blocked by:** DEP-1`, `__Blocked
// by:__ DEP-1` are a planner stating a dependency, and nothing reads them —
// which in an epic that declares `Parallel:` means the ticket is "declared
// independent" and may start beside the work it depends on. That is the
// unsafe guess. So such a line changes no state (a bullet stalls nothing) and
// doctor says it is unread: the label, emphasised or with its colon, after an
// indent, a quote mark or a bullet — or with the wrong emphasis at the margin
// — followed somewhere by a ticket ID. No ticket ID, no warn: "- Blocked by:
// nothing, the vendor API is out of scope" is prose.
const BLOCKED_BY_UNREAD = new RegExp(`^[\\s>]*(?:(?:[-*+]|\\d+[.)])\\s+)?(?:[*_]{1,2}Blocked[ -]by\\b|Blocked[ -]by\\s*:).*\\b${TICKET_ID}\\b`, 'i')
function unreadBlockedBy(line) {
  return !classifyBlockedBy(line) && !BLOCKED_BY_NOTHING.test(line.replace(/^.*?Blocked[ -]by[*_]*\s*:?[*_]*/i, '').trim()) && BLOCKED_BY_UNREAD.test(line)
}
// A fenced block is a quotation: a ticket that DOCUMENTS this format (this
// repository's own will) must not be blocked by its example.
const FENCE = /^\s*(```|~~~)/
// `Depends on:` is NOT near, and changes no ticket's state. It is the removed
// dependency graph's spelling, and documents written under it are still in
// installed projects as prose — one live epic carries `**Depends on:**
// nothing` on four tickets, and reading that as a broken dependency left two
// unstarted tickets waiting for ever the moment the plugin updated. A format
// that arrives in every installed project overnight must read old documents
// as it found them. So the old spelling is inert, and doctor mentions it only
// where an unread dependency can hurt: an epic that declares `Parallel:`.
// Searched for anywhere in the line, not anchored: the live documents write it
// mid-line, as one field among several — `**Closes:** F2 · **Severity:** … ·
// **Depends on:** SEC-1 ✅` — and an anchored pattern was blind to the only
// shape the warn exists for. But it is a FIELD: at the start of the line or
// after a `·` separator, never mid-sentence ("…asked why this ticket
// **Depends on:** DEP-1 at all" is prose). The value runs to the next `·`.
const DEPENDS_ON_LINE = /(?:^|·\s*)(?:\*\*Depends[ -]on:?\*\*\s*:?|Depends[ -]on\s*:)\s*([^·]*)/i

function parseBlockedBy(body) {
  const ids = []
  const malformed = []
  let fenced = false
  for (const line of body.split('\n')) {
    if (FENCE.test(line)) fenced = !fenced
    if (fenced) continue
    const c = classifyBlockedBy(line)
    if (c?.ids) ids.push(...c.ids)
    else if (c?.malformed) malformed.push(c.malformed)
  }
  return { ids: [...new Set(ids)], malformed }
}

// Every ticket's blockers, checked against its own epic's tickets, in one
// pass: `problems[id]` is the sentence the board, doctor and `next` all print.
// Same-epic only — a wait on another epic's work is an Owed line's job, and
// `next <epic>` never loads another epic's board anyway.
function resolveDependencies(epicTickets) {
  const ids = new Set(epicTickets.map((t) => t.id))
  const order = new Map(epicTickets.map((t, i) => [t.id, i]))
  const deps = {}
  const problems = {}
  const notes = {}
  for (const t of epicTickets) {
    const { ids: blockers, malformed } = parseBlockedBy(t.body)
    deps[t.id] = blockers
    const unknown = blockers.filter((b) => !ids.has(b))
    if (malformed.length) problems[t.id] = `a Blocked by line that will not parse ("${malformed[0]}") — needs "**Blocked by:** <ID>[, <ID>]", bare ticket IDs and nothing else on the line`
    else if (blockers.includes(t.id)) problems[t.id] = `it is blocked by itself`
    else if (unknown.length) problems[t.id] = `${unknown.join(', ')} ${unknown.length === 1 ? 'is' : 'are'} not a ticket of this epic — a wait on another epic's work is carried by an Owed line, not a Blocked by`
    // Not a problem, and still worth a sentence: the board proposes tickets in
    // document order, so a blocker placed later reads as a plan whose order
    // and whose dependencies disagree.
    const later = blockers.filter((b) => ids.has(b) && order.get(b) > order.get(t.id))
    if (later.length) notes[t.id] = `blocked by ${later.join(', ')}, which ${later.length === 1 ? 'comes' : 'come'} later in the document — document order is the intended order, so either the order or the line is wrong`
  }
  // Cycles, over the edges that name real tickets. Every ticket on a cycle
  // gets the problem — each of them is the one a human may open first.
  const state = {}
  const stack = []
  const visit = (id) => {
    if (state[id] === 'done') return
    if (state[id] === 'open') {
      const cycle = stack.slice(stack.indexOf(id))
      for (const c of cycle) problems[c] ||= `a dependency cycle: ${[...cycle, id].join(' → ')}`
      return
    }
    state[id] = 'open'
    stack.push(id)
    for (const b of deps[id]) if (ids.has(b) && b !== id) visit(b)
    stack.pop()
    state[id] = 'done'
  }
  for (const t of epicTickets) visit(t.id)
  return { deps, problems, notes }
}

// ── acceptance checks ────────────────────────────────────────────────────────

// A criterion bullet may carry a machine-runnable form (adapted from unlazy's
// gate files, 2026-08-20): an indented `CHECK: <command>` line under the
// bullet, optionally followed by `EXPECT: <text>`. The criterion passes when
// the command exits 0 AND its output contains the EXPECT text (exit 0 alone
// decides when EXPECT is absent) AND that evidence is not a skip — see
// `runChecks` for the third verdict, because a command can satisfy both of
// the first two while the work it names never ran. These regexes are
// load-bearing the same way
// the heading regexes are: doctor's near-miss scan is built against them, and
// the skills' templates must match them — a CHECK that almost parses silently
// never runs, which is the one way a machine-checked criterion can lie.
const CHECK_LINE = /^\s*CHECK:\s*(\S.*)$/
const EXPECT_LINE = /^\s*EXPECT:\s*(\S.*)$/
// The fidelity form of the same idea, and part of the same one format: an
// indented `COMPARE: <design source path> @ <width>[,<width>]` under its
// criterion bullet, optionally followed by `LANDMARKS: <name>[, <name>]`
// (absent = every landmark in the map = the whole page). It is the one
// criterion this script never RUNS: comparing an artboard with a page needs a
// browser, and this script owns none — so `check` reports comparisons in
// their own list, marked manual, and the code gates the presence of the
// `**Compared:**` table instead of its content.
//
// The path is everything before the LAST `@`, because a design path may
// contain spaces and may contain an `@` (`assets/@2x/hero.html`), and the
// widths are what follows: the last `@` is the only unambiguous separator.
const COMPARE_LINE = /^\s*COMPARE:\s*(\S.*)$/
const LANDMARKS_LINE = /^\s*LANDMARKS:\s*(\S.*)$/
// Near-miss shapes doctor flags: a lowercase or spaced label, or the label
// written as a bullet of its own instead of indented under its criterion.
// CHECK and EXPECT are caught in any case. COMPARE and LANDMARKS are caught
// in capitals — and a "compare:" in any case when the line is
// comparison-shaped, an `@` followed by a width — because "Compare:" and
// "Landmarks:" are ordinary English at the head of an acceptance bullet:
// installed projects update live, and a case-blind scan turned a green ledger
// red over prose ("- Compare: the old output with the new one by hand") the
// day it was written. The shape test is in BOTH regexes and tolerates `@1440`:
// a bulleted line never reaches CHECK_NEAR, and a malformed comparison that
// goes unflagged is a ticket read as owing no comparison, which is the gate
// failing open. What still goes unflagged is a lowercase "compare: <path>"
// with its widths forgotten — indistinguishable from prose, and left so.
const LABEL_NEAR = '(?:[Cc][Hh][Ee][Cc][Kk]|[Ee][Xx][Pp][Ee][Cc][Tt]|COMPARE|LANDMARKS)\\s*:'
const COMPARE_SHAPED = '[Cc][Oo][Mm][Pp][Aa][Rr][Ee]\\s*:.*@\\s*\\d'
const CHECK_NEAR = new RegExp(`^\\s*(?:${LABEL_NEAR}|${COMPARE_SHAPED})`)
const CHECK_BULLET_NEAR = new RegExp(`^\\s*[-*]\\s+(?:${LABEL_NEAR}|${COMPARE_SHAPED})`)

// One layer in from a near-miss: shapes that parse, run, and still cannot
// decide anything. Both are quoted from redesign-foundation's history, where
// they merged and then cost the run a halt.
//
// One: `\\|` inside a CHECK's quoted `node -e` or `sh -c` string. The quoting
// layer consumes the escape, grep receives a literal `|`, and an alternation
// that is not an alternation matches nothing.
const CHECK_ESCAPED_PIPE = /\\\\\|/
const CHECK_QUOTED_SCRIPT = /\bnode\s+-e\b|\bsh\s+-c\b/
// Two: grep given both -r and -c. Recursive counting prints `path:count` per
// file, never a bare number, whatever the CHECK compares it against — so the
// comparison is decided by the path, not the count.
function grepCountsRecursively(command) {
  for (const m of command.matchAll(/(?:^|[\s;|&(`'"])grep((?:\s+-{1,2}[A-Za-z][A-Za-z-]*)*)/g)) {
    let recursive = false
    let counting = false
    for (const flag of m[1].trim().split(/\s+/).filter(Boolean)) {
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

// A single-file `grep -c path` prints a bare count and is sound — it is not
// flagged, and the fixture carries one to prove it (GHF-1's passed live).
function checkShapeProblems(command) {
  const why = []
  if (CHECK_ESCAPED_PIPE.test(command) && CHECK_QUOTED_SCRIPT.test(command))
    why.push('this CHECK parses and runs but can never pass: `\\\\|` inside a quoted `node -e` / `sh -c` string — the quoting layer consumes one backslash, so grep receives a literal "|" and the alternation never matches (use `grep -E` in a plain shell test)')
  if (grepCountsRecursively(command))
    why.push('this CHECK parses and runs but can never pass: grep given both -r and -c prints "path:count" per file, never a bare number, whatever the CHECK compares it against (count one named file, or pipe through `wc -l`)')
  return why
}

// One malformed COMPARE is a ledger problem, exactly as a malformed CHECK is:
// a criterion nobody can satisfy and a criterion nobody can read fail the gate
// the same way. `designSources` is the epic's declared list — a COMPARE naming
// a path the epic does not declare is unanchored, since the declaration is
// what hands the design to the reviewers, and a comparison against a file
// nobody was given is a comparison nobody can check.
function compareProblem(value, designSources) {
  const at = value.lastIndexOf('@')
  if (at === -1) return 'COMPARE with no "@ <width>" — a comparison needs the width the design draws at (needs "COMPARE: <design source path> @ <width>[, <width>]"), because a page compared at an unstated width is compared against nothing in particular'
  const source = value.slice(0, at).trim()
  const widthText = value.slice(at + 1).trim()
  if (!source) return 'COMPARE with no design source path before its "@" (needs "COMPARE: <design source path> @ <width>[, <width>]")'
  const widths = widthText.split(',').map((w) => w.trim())
  if (!widths.length || widths.some((w) => !/^\d+$/.test(w)))
    return `COMPARE whose width list is not widths: "${widthText}" (needs one or more plain numbers, "@ 1440,393") — a width nothing can parse is a comparison nobody can re-run`
  if (!designSources || !designSources.length)
    return `COMPARE names "${source}", but this epic declares no "Design sources:" line — the declaration is what hands the design to both reviewers, so a comparison against an undeclared file is one nobody else can open`
  if (!designSources.includes(source))
    return `COMPARE names "${source}", which this epic's "Design sources:" line does not list (it lists: ${designSources.join(', ')}) — the whole text between commas is a path there, so check for a typo rather than adding prose`
  return null
}

function parseCompare(value) {
  const at = value.lastIndexOf('@')
  return {
    source: value.slice(0, at).trim(),
    widths: value
      .slice(at + 1)
      .split(',')
      .map((w) => Number(w.trim())),
  }
}

function parseChecks(body, designSources = null) {
  const checks = []
  const compares = []
  const problems = []
  let bullet = null
  body.split('\n').forEach((line, i) => {
    const c = line.match(CHECK_LINE)
    const e = line.match(EXPECT_LINE)
    const cmp = line.match(COMPARE_LINE)
    const lm = line.match(LANDMARKS_LINE)
    const b = line.match(/^\s*[-*]\s+(.*)$/)
    if (c) {
      const command = c[1].trim()
      checks.push({ criterion: bullet, check: command, expect: null })
      for (const why of checkShapeProblems(command)) problems.push({ line: i + 1, text: line.trim(), why })
    } else if (e) {
      const last = checks[checks.length - 1]
      if (!last || last.expect !== null)
        problems.push({ line: i + 1, text: line.trim(), why: 'EXPECT with no CHECK line above it to attach to' })
      else {
        last.expect = e[1].trim()
        // `node --test --test-name-pattern <p> <file>` prints `# pass 1` when
        // the pattern matches NOTHING — the file itself counts as one passing
        // test — and when it matches one. So this EXPECT is green before the
        // ticket exists and green whatever the worker builds: the vacuous
        // CHECK, in the spelling this plugin's own plans use. Measured on Node
        // 22; two planning drafts shipped it before a ledger run caught them.
        if (/--test-name-pattern\b/.test(last.check) && /^#\s*pass\s+1$/.test(last.expect))
          problems.push({
            line: i + 1,
            text: line.trim(),
            why: 'this CHECK parses and runs but proves nothing: under `--test-name-pattern`, node prints "# pass 1" when the pattern matches NO test (the file itself counts), so it is green before the ticket exists — expect two or more matching tests ("# pass 2"), or grep the TAP line of the test\'s own title',
          })
      }
    } else if (cmp) {
      const value = cmp[1].trim()
      const why = compareProblem(value, designSources)
      if (why) problems.push({ line: i + 1, text: line.trim(), why })
      else compares.push({ criterion: bullet, compare: value, ...parseCompare(value), landmarks: null })
    } else if (lm) {
      // LANDMARKS attaches to the COMPARE above it the way EXPECT attaches to
      // its CHECK. With none above it, it narrows nothing and reads as if it
      // did — so it is a problem, not a silently ignored line.
      const last = compares[compares.length - 1]
      if (!last || last.landmarks !== null)
        problems.push({ line: i + 1, text: line.trim(), why: 'LANDMARKS with no COMPARE line above it to attach to — on its own it narrows nothing, while reading as though it narrowed the comparison' })
      else last.landmarks = lm[1].split(',').map((n) => n.trim()).filter(Boolean)
    } else if (CHECK_BULLET_NEAR.test(line)) {
      problems.push({ line: i + 1, text: line.trim(), why: 'CHECK/EXPECT/COMPARE/LANDMARKS written as its own bullet — indent it under the criterion bullet instead, or it never runs' })
    } else if (b) {
      bullet = b[1].trim()
    } else if (CHECK_NEAR.test(line)) {
      problems.push({ line: i + 1, text: line.trim(), why: 'looks like a CHECK/EXPECT/COMPARE/LANDMARKS line but will not parse, so it silently never runs (needs the uppercase label at line start after indentation, a colon, and a value)' })
    }
  })
  return { checks, compares, problems }
}

// One command may hang forever, and in an unattended run a hung gate is
// indistinguishable from a run making progress — the exact failure the stop
// conditions exist to prevent. Generous, fixed, and named: a check that needs
// longer than ten minutes is not an acceptance check any more.
const CHECK_TIMEOUT_MS = 600_000

// spawnSync holds the child's output in memory, and its default cap is 1 MB —
// which a real test suite's logging exceeds easily (the first live hit was a
// passing 68/68 jest run printing ~1.2 MB of Mongo logs: the child died on
// ENOBUFS, the ledger saw a dead command, and the run halted on a green
// ticket). Generous, fixed, and named, like the timeout: 64 MB clears any
// realistic suite, while never-Infinity keeps one pathological command from
// eating the machine's memory before the timeout fires.
const CHECK_MAX_BUFFER = 64 * 1024 * 1024

// A skipped check is not a passed one, and a gate that cannot tell a skip from
// a pass is worse than either verdict. Measured downstream before this existed:
// console-foundations CF-3 reported `4/4 checks passed` while every evidence
// line read `↓` — the Postgres-backed suites skipped themselves for want of
// `DATABASE_URL` (the house `describe.skipIf(...)` convention), vitest exited
// 0, and the verbose reporter still printed the titles the EXPECT strings
// matched. Every ticket in that epic then needed a human to eyeball the
// markers, which is the check the gate exists to perform.
//
// So the ledger carries a third verdict, `skipped`: not passed, because a run
// that did not happen proves nothing and must never green a merge gate; not
// failed, because the code is not what is wrong and a red verdict sends a
// reader to debug working code instead of supplying what the run needed.
//
// Detection is shape, not meaning, like everything else here: a runner's skip
// glyph at the start of a line (vitest's `↓`, jest's `○`), or a skip **count**
// (`12 skipped`, `skipped (12)`, TAP's `# SKIP`). The count is what keeps the
// bare word out: a criterion may legitimately assert that something was
// skipped ("the migration is skipped when the table exists"), and a marker
// that fired on the word would leave its author no way to write it.
//
// Coverage is bounded and known, not universal: vitest, jest, node --test and
// anything speaking TAP are matched; mocha's `N pending` and `go test`'s
// `--- SKIP:` are not. Widening it is cheap when a project needs it, but a
// detector that guesses at every runner's vocabulary would start failing
// correct runs, and a false red halts a run on working code. What backstops
// the gap is the same rule everywhere else: a criterion should point EXPECT
// at a line that proves the run, not at one a skipped run also prints.
const CHECK_SKIP_MARK = /^[\s│|>]*[↓○]|(?<![\w-])\d+\s+skipped\b|\bskipped\s*\(\s*\d+\s*\)|#\s*skip(ped)?\b/i
// Its counterpart: a line showing that something actually ran. `0 passed` is
// not evidence of a run, so the zero is excluded — vitest prints
// `Tests  0 passed | 12 skipped` for a suite that did nothing. TAP's own
// per-test line counts as well: a producer that prints `ok 1 - built` and no
// summary at all still ran that test, and without this one `# SKIP` beside
// it would read as a suite in which nothing happened — the opposite of what
// the output says. `not ok` never matches, because the prefix class holds
// whitespace and the decoration a reporter draws, never letters; and an
// `ok N` carrying `# SKIP` is the skip it says it is, not a run.
const CHECK_RAN_MARK =
  /\b(?!0+\b)\d+\s+(?:passed|passing|ok)\b|\bpass(?:ed)?[:\s]+(?!0+\b)\d+\b|^[\s│|>]*ok\s+\d+\b(?!.*#\s*skip)/i
// A line is skip evidence when it marks a skip and shows nothing having run.
const skipEvidence = (line) => CHECK_SKIP_MARK.test(line) && !CHECK_RAN_MARK.test(line)

function runChecks(checks) {
  return checks.map((c, idx) => {
    const r = spawnSync(c.check, { cwd: repoRoot, shell: true, encoding: 'utf8', timeout: CHECK_TIMEOUT_MS, maxBuffer: CHECK_MAX_BUFFER })
    const output = `${r.stdout || ''}${r.stderr || ''}`
    const lines = output.split('\n')
    const exitCode = r.status === null ? -1 : r.status
    const okExit = exitCode === 0 && !r.error
    const matching = c.expect === null ? [] : lines.filter((l) => l.includes(c.expect))
    const okExpect = c.expect === null || matching.length > 0
    // Among the lines carrying the EXPECT text, a skip decides unless another
    // of them shows something having run. Not "the first match that is not a
    // skip": a runner that echoes its argv (`npm test -- <file>`) prints the
    // EXPECT string on a line that is not skip evidence and proves nothing,
    // and that echo used to outvote the `↓` two lines below it — a suite in
    // which nothing ran, green. The opposite polarity is what a gate needs:
    // the run line has to be there for the pass, not merely the absence of a
    // skip. A line showing a run still wins, so one skipped file inside a
    // suite that ran does not turn the ledger red.
    const skipHit = matching.find(skipEvidence)
    const ranHit = matching.find((l) => CHECK_RAN_MARK.test(l))
    // The same question asked of the whole output, for the two cases where
    // the EXPECT cannot answer it. With no EXPECT, exit 0 is the only other
    // evidence there is. With an EXPECT whose own matches decide nothing
    // either way, it is the argv echo again in its second shape: the runner
    // repeats the file name while starting (`EXPECT: src/foo.test.js`) and
    // its skip summary does not (`Tests: 1 skipped`), so narrowing the
    // question to the matching lines greens a suite in which nothing ran —
    // the hole this polarity exists to close. The recovery works from the
    // refused state either way: point EXPECT at a line that proves the run.
    const wholeSkip = lines.find((l) => CHECK_SKIP_MARK.test(l))
    const wholeRan = lines.find((l) => CHECK_RAN_MARK.test(l))
    const skipped = okExit && okExpect && (skipHit || ranHit ? Boolean(skipHit) && !ranHit : Boolean(wholeSkip) && !wholeRan)
    // The evidence reported is always the line the verdict came from.
    const deciding = skipped ? (skipHit ?? wholeSkip) : (ranHit ?? matching.find((l) => !skipEvidence(l)) ?? matching[0])
    const passed = okExit && okExpect && !skipped
    const status = passed ? 'passed' : skipped ? 'skipped' : 'failed'
    // The evidence line is what the ledger records — the deciding output,
    // never a feeling of completion.
    let evidence
    if (r.error)
      evidence = `command could not run: ${
        r.error.code === 'ETIMEDOUT'
          ? `timed out after ${CHECK_TIMEOUT_MS / 1000}s`
          : r.error.code === 'ENOBUFS'
            ? `printed more than ${CHECK_MAX_BUFFER / 1024 / 1024} MB of output and was killed — quieten the command (e.g. drop debug logging, or pipe through tail) so the ledger can read its result`
            : r.error.message
      }`
    // A skipped verdict always has its line — the EXPECT's skip or, when the
    // question widened, the output's — so the evidence is never a bare exit.
    else if (skipped) evidence = deciding.trim().slice(0, 300)
    else if (passed) evidence = c.expect ? (deciding || c.expect).trim().slice(0, 300) : 'exit 0'
    else if (!okExit) evidence = `exit ${exitCode}${output.trim() ? ` — ${output.trim().split('\n').slice(-3).join(' / ').slice(0, 300)}` : ''}`
    else evidence = `exit 0, but the output does not contain ${JSON.stringify(c.expect)}`
    return { n: idx + 1, criterion: c.criterion, check: c.check, expect: c.expect, exitCode, passed, status, evidence }
  })
}

// ── status-log parsing ───────────────────────────────────────────────────────

// "### <ID> — <title> — <YYYY-MM-DD> — DONE|BLOCKED|ABANDONED"
function parseStatus(epic) {
  const byId = {}
  if (!epic.statusDoc) return byId
  for (const line of readFileSync(epic.statusDoc, 'utf8').split('\n')) {
    const m = line.match(STATUS_HEADING)
    // Append-only means an ID can appear more than once; the last one wins.
    if (m) byId[m[1]] = { id: m[1], date: m[3], outcome: m[4] }
  }
  return byId
}

// The **Owed:** blocks of a status log, split into the obligations they
// record, attributed to the parsed entry they sit under, minus the ones a
// later line has explicitly resolved. This is what lets `brief` hand a fresh
// worker the epic's outstanding obligations without the worker rereading the
// whole log — the log grows without bound, and "preserve everything" must not
// mean "reread everything before every edit".
//
// Resolution is explicit, never inferred: a `**Resolves owed:** <ID> …` line
// (in the discharging ticket's entry or a dated addendum) closes what <ID>
// recorded. An entry that owes one thing is addressed by its own ID; an entry
// that owes several — the Owed field invites exactly that, "anything
// deferred" — numbers them `<ID>.1`, `<ID>.2`, … in document order, and the
// marker names the item. Numbers only ever get appended, never reshuffled,
// because the log is append-only: an entry's bullets never move once written.
//
// A bare `<ID>` retires what the entry owed WHEN THE MARKER WAS WRITTEN — the
// items recorded above that line. Append-only makes a marker's position its
// time, and that is what keeps an old bare marker meaning what it meant: an
// entry that records again later would otherwise renumber a discharged item
// back into every brief, forever. Facing more than one open item, a bare
// marker retires NOTHING and says so rather than guessing. It used to retire
// the lot: downstream, four items recorded as one paragraph were closed by a
// marker naming one of them, and the item that had to survive was a
// production-database hazard, caught only because a worker had been warned to
// look. The asymmetry decides the direction — an item wrongly kept costs one
// reread, an item wrongly retired is gone from an append-only log with nothing
// left to report it — and the recovery is one appended line naming the items,
// which the brief spells out and which clears the note.
//
// Entries owing "Nothing" are dropped. What survives is labelled honestly:
// recorded and not marked resolved. A ticket may have discharged an item
// without writing the marker — this script derives, it does not investigate —
// so the reader checks the named carrier before re-doing work, and writes the
// marker the log was owed.
const OWED_REF = `${TICKET_ID}(?:\\.\\d+)?`
// An ID has to end where the reference ends. Anchoring at the start alone
// accepted a valid ID as the prefix of a malformed one — `F-2oops` yielded
// `F-2` and retired that item — which is the silent discharge this whole
// rule exists to prevent. A following letter, digit, hyphen or `.<digit>`
// means the writer wrote something else, and the line then retires nothing:
// unreadable and refused beats readable and wrong, because the item stays in
// every brief until someone writes the reference again correctly.
const OWED_REF_END = '(?![A-Za-z0-9-]|\\.\\d)'
const OWED_REF_BOUNDED = `${OWED_REF}${OWED_REF_END}`
const RESOLVES_LINE = /^\*\*Resolves owed:\*\*\s*(.*)$/
const OWED_LINE = /^\*\*Owed:\*\*\s*(.*)$/
const OWED_BULLET = /^(\s*)[-*]\s+(\S.*)$/

// The notes a marker earns when it retires nothing — written once each, so the
// brief a worker reads and the doctor row its author sees cannot drift into
// two different accounts of the same line. Each states the repair that clears
// it, and each is cleared by exactly that repair: a note whose only exit is
// naming items that are still open would push a writer toward the silent
// retirement this whole rule exists to prevent.
const owedBareMarkerNote = (id, count) =>
  `\`**Resolves owed:** ${id}\` names the entry, but ${id} had ${count} open items when that line was written, so it retires nothing. ` +
  `Name the ones it discharged — \`${id}.1\`, \`${id}.2\` … in the order the entry lists them — in a new dated addendum; the rest stay listed, and naming any of them that way clears this note.`

const owedUnknownItemNote = (ref, id, items) =>
  `\`**Resolves owed:** ${ref}\` names no item: ${id} records ${items.length}${
    items.length ? ` (\`${items.map((o) => o.id).join('`, `')}\`)` : ''
  } above that line, so nothing was retired. ` +
  `Write the reference again correctly in a new dated addendum — the log is append-only, so the wrong line stays and the right one goes underneath it, and a line below it naming one of ${id}'s items clears this note.`

// Every **Owed:** block in a status log, whether or not anything resolved it:
// { id, date, line, lead, items: [{ text, line }] } per block, in document
// order. The line numbers are what make a bare marker's position readable as
// its time — see parseOwed.
function owedBlocks(statusDoc) {
  const blocks = []
  let entry = null // the last parsed "### <ID> — … — <date> — <outcome>" heading
  let block = null
  let item = null // the open bullet, for wrapped continuation lines
  let leadOpen = false // the lead text can be continued until a bullet or a blank
  let blank = false
  let indent = null // the block's top level: the indentation of its first bullet
  readFileSync(statusDoc, 'utf8').split('\n').forEach((line, i) => {
    const lineNo = i + 1
    const h = line.match(STATUS_HEADING)
    if (h) {
      entry = { id: h[1], date: h[3] }
      block = null
      return
    }
    const m = line.match(OWED_LINE)
    if (m && entry) {
      block = { ...entry, line: lineNo, lead: m[1].trim(), items: [] }
      blocks.push(block)
      item = null
      leadOpen = true
      blank = false
      indent = null
      return
    }
    if (!block) return
    const b = line.match(OWED_BULLET)
    if (b) {
      // A bullet continues the block even across a blank line: a list set off
      // from its lead-in is the idiomatic markdown shape, and reading the
      // block as "ends at the first blank line" dropped every item silently.
      // The first bullet sets the block's top level; a deeper one is part of
      // the item above it, so the numbering counts what a reader counts.
      if (indent === null) indent = b[1].length
      if (b[1].length > indent && item) {
        item.text = `${item.text} ${line.trim()}`.trim()
        blank = false
        return
      }
      item = { text: b[2].trim(), line: lineNo }
      block.items.push(item)
      leadOpen = false
      blank = false
      return
    }
    if (/^#{1,6}\s/.test(line) || /^\*\*/.test(line)) {
      // The next field, addendum or heading — the block is over.
      block = null
      return
    }
    if (line.trim() === '') {
      item = null
      leadOpen = false
      blank = true
      return
    }
    if (blank) {
      // Prose after a blank line is the entry continuing, not the owed block.
      block = null
      return
    }
    if (item) item.text = `${item.text} ${line.trim()}`.trim()
    else if (leadOpen) block.lead = `${block.lead} ${line.trim()}`.trim()
  })
  return blocks
}

// The obligations one block records. A block with bullets records its bullets
// — the lead-in is context for all of them, kept because it is where the
// carrier is usually named. A block without bullets records one: the
// paragraph itself.
//
// "Nothing" only empties a block that has no bullets, because that is what
// the convention is for — an entry declaring the field empty. Applied to a
// bullet it drops a real obligation: console-foundations CF-1's first bullet
// opens "Nothing in this ticket has met Postgres", and when the whole block
// was read as one paragraph that phrase dropped all five items from every
// brief it should have appeared in.
function owedItems(block) {
  const bulleted = block.items.length > 0
  const raw = bulleted ? block.items : [{ text: block.lead, line: block.line }]
  return raw
    .map(({ text, line }) => ({
      entry: block.id,
      date: block.date,
      line,
      ...(bulleted && block.lead ? { lead: block.lead } : {}),
      text,
    }))
    .filter((o) => Boolean(o.text) && (bulleted || !/^nothing\b/i.test(o.text)))
}

// Identity, assigned per ENTRY rather than per block: an ID can head more than
// one block — a second entry under the same ticket, an addendum that records
// more — and two obligations sharing one ID is the collision this numbering
// exists to prevent. An entry owing one thing keeps its bare ID; an entry
// owing several numbers them in document order, stable because the log is
// append-only.
function owedByEntry(blocks) {
  const byEntry = new Map()
  for (const block of blocks)
    for (const item of owedItems(block)) {
      if (!byEntry.has(item.entry)) byEntry.set(item.entry, [])
      byEntry.get(item.entry).push(item)
    }
  for (const [id, items] of byEntry)
    items.forEach((item, i) => {
      item.id = items.length > 1 ? `${id}.${i + 1}` : id
    })
  return byEntry
}

// Every `**Resolves owed:**` line's targets, each with the line it was written
// on — position is time in an append-only log, and a bare marker is read
// against what the entry owed above it. Only the leading ID list resolves —
// "**Resolves owed:** A-1, A-2.3 — note". An ID mentioned later, inside the
// note's prose ("landed by A-3"), is a citation, not a target.
function owedResolutions(statusDoc) {
  const refs = []
  readFileSync(statusDoc, 'utf8')
    .split('\n')
    .forEach((line, i) => {
      const r = line.match(RESOLVES_LINE)
      if (!r) return
      const lead = r[1].toUpperCase().match(new RegExp(`^${OWED_REF_BOUNDED}(\\s*,\\s*${OWED_REF_BOUNDED})*`))
      if (lead) for (const ref of lead[0].match(new RegExp(OWED_REF_BOUNDED, 'g'))) refs.push({ ref, line: i + 1 })
    })
  return refs
}

function parseOwed(epic) {
  if (!epic.statusDoc) return { owed: [], notes: [] }
  const byEntry = owedByEntry(owedBlocks(epic.statusDoc))
  const refs = owedResolutions(epic.statusDoc)
  // A reference that names one of the entry's items, recorded ABOVE the line
  // the reference sits on. Position is time for a dotted reference too: an item
  // recorded BELOW it was not what its writer discharged. The bare ID of an
  // entry that recorded a single item is that item's identity, so it matches
  // here too — that is what gives a lone item's miscount an exit at all.
  // Membership is tested against the entry's own items rather than a scan of
  // every reference, so this stays linear as the append-only log grows.
  const namesItemAbove = (r) => (byEntry.get(r.ref.split('.')[0]) || []).some((o) => o.id === r.ref && o.line < r.line)
  // An entry someone has already addressed item by item: that writer has moved
  // to the form the note asks for, so it supersedes any bare line above it.
  // Only a reference that MATCHES an item counts: a mistyped `<ID>.7` retired
  // nothing, so letting it clear the note would trade one silent line for
  // another.
  const itemised = new Set(refs.filter((r) => r.ref.includes('.') && namesItemAbove(r)).map((r) => r.ref.split('.')[0]))
  // The last line on which a reference named one of an entry's items correctly.
  // Every note here is cleared by the repair it names, and this is the repair
  // the wrong-reference note names: write the reference again correctly,
  // underneath. BELOW the faulty line, because the log is append-only and
  // position is time — a correct reference written earlier is not a correction
  // of a later mistake, and clearing on one would take away the only feedback a
  // miscount gets while the item it meant is still open. The two rules differ on
  // purpose: a BARE marker is ambiguous about *which* items it discharged, so
  // any itemised line for that entry answers it wherever it sits (`itemised`
  // above), while a wrong reference is one specific mistake, so only a later
  // line can be its correction. An item already retired still counts — the
  // writer's correction may name the very one they meant.
  const correctedAt = new Map()
  for (const r of refs)
    if (namesItemAbove(r)) correctedAt.set(r.ref.split('.')[0], Math.max(correctedAt.get(r.ref.split('.')[0]) ?? 0, r.line))
  const corrected = (entry, line) => (correctedAt.get(entry) ?? 0) > line
  const resolved = new Set()
  const notes = []
  const noted = new Set()
  // Document order, because a marker is read against the state above it.
  for (const { ref, line } of refs) {
    const entry = ref.split('.')[0]
    const items = byEntry.get(entry)
    // A marker naming an entry this log does not record retires nothing and
    // says nothing: `**Resolves owed:**` never crosses epics — this reads one
    // status log — and a cross-epic marker is a legal thing to write, so
    // flagging it would put a permanent note on a correct line.
    if (!items) continue
    // Read against the items the entry had recorded above this line, for the
    // same reason the bare marker is: a reference that points into the future
    // named nothing when it was written, and retiring a later item on it is
    // the silent discharge in its subtlest shape.
    if (ref.includes('.')) {
      const above = items.filter((o) => o.line < line)
      if (above.some((o) => o.id === ref)) resolved.add(ref)
      else if (!noted.has(ref) && !corrected(entry, line)) {
        noted.add(ref)
        notes.push(owedUnknownItemNote(ref, entry, above))
      }
      continue
    }
    // What the entry still owed above this line. Items recorded after it were
    // not what its author discharged, and items already retired are not what
    // it could have meant.
    const open = items.filter((o) => o.line < line && !resolved.has(o.id))
    if (open.length === 1) resolved.add(open[0].id)
    else if (open.length > 1 && !itemised.has(entry) && !noted.has(entry)) {
      noted.add(entry)
      notes.push(owedBareMarkerNote(entry, open.length))
    }
  }
  const owed = [...byEntry.values()]
    .flat()
    .filter((o) => !resolved.has(o.id))
    .map(({ entry, line, ...o }) => o)
  return { owed, notes }
}

// ── deviations ───────────────────────────────────────────────────────────────

// The `**Deviation:**` paragraphs of a status log: what a ticket's documents or
// design showed that was not built, or was built differently. Attributed to the
// entry they sit under, each carrying whether a human has closed it.
//
// A deviation is not owed work, and that is why it is parsed and surfaced
// separately: an owed item is work someone will do, a deviation is a decision
// someone must see. Recorded inside an entry's **Decisions:** prose — where the
// field's own instructions used to send it — it reached no command and no
// later gate, and the thing that was not built shipped as though it had been.
//
// The line is optional, so no log written before it needs an edit to stay
// valid, and one entry may carry several — one per departure. Its paragraph
// ends at the first blank line **or at the next bolded field or heading**: a
// `**Deviation:**` written directly above `**Owed:**` with no blank line
// between them would otherwise swallow the next field's markup into the text a
// brief shows and a door gates on, and a worker who writes two fields without a
// blank line has done nothing wrong.
//
// A `**Deviations closed:** <ID>[, <ID>] — <each deviation named as accepted or
// as fixed in <sha>; who; when>` line, in any entry or addendum, closes the
// deviations its **leading** reference list names, and only ones recorded
// **above it in the file** — an ID cited later in the prose is a citation, not
// a target. Position is what a line can close: an ID can head more than one
// entry (a BLOCKED ticket redone), and a deviation recorded after a closing
// line must not be born closed.
//
// Identity is per entry ID, on the reference grammar the owed ledger already
// uses (OWED_REF): an ID that recorded one deviation is closed by its bare ID,
// an ID that recorded several numbers them `<ID>.1`, `<ID>.2` … in document
// order across every entry it heads, and the closing line names the items. **A
// bare closing line** facing more than one open deviation closes NOTHING and
// says so. The asymmetry decides the direction, as it did for owed items: a
// deviation wrongly left open costs a human one reread, while one wrongly
// closed is a departure nobody decided on, gone from every brief and every
// attended door. The owed ledger learned this downstream, where a marker naming
// one of an entry's four items retired all four — among them a
// production-database hazard.
//
// This parser reports closure; it never judges who wrote it. The closing line
// is a human's — no worker and no agent writes one — and the two readers
// differ deliberately: the attended doors honour it and show it, because a
// human is present to have written it, while an unattended gate counts every
// recorded deviation and ignores closure entirely.
// The two parsed line shapes, shared with doctor's near-miss scan the way the
// heading regexes are: the scan flags what looks like one of these and is not,
// so a slip is loud instead of silent, and one definition keeps the flag and
// the parser from drifting into disagreeing about what parses.
const DEVIATION_LINE = /^\*\*Deviation:\*\*\s*(.*)$/
const DEVIATIONS_CLOSED_LINE = /^\*\*Deviations closed:\*\*\s*(.*)$/
// Deviation-shaped labels a writer reaches for that this parser reads as
// nothing: the plural opener, the singular closer, an unbolded or bulleted
// line, "accepted" in place of "closed", and the source epic's own wording
// ("Not replicated"). Bare prose that merely uses the word is not in the set —
// a Decisions paragraph discussing a deviation must stay prose.
const DEVIATION_NEAR = /^\s*(?:[-*]\s+)?\*{0,2}\s*(?:deviations?(?:\s+(?:closed|accepted))?|not replicated)\s*:/i
// A `**Deviations closed:**` line closes by its LEADING ID list only, so one
// without an ID parses as a closure of nothing — near-miss, not a strict line.
const closesSomething = (line) => {
  const c = line.match(DEVIATIONS_CLOSED_LINE)
  return Boolean(c && new RegExp(`^${TICKET_ID}`).test(c[1].toUpperCase()))
}
const DEVIATION_STRICT = (line) => DEVIATION_LINE.test(line) || closesSomething(line)

// The notes a closing line earns when it closes nothing — written once each, so
// the brief a worker reads, the subcommand a door reads and the doctor row the
// line's own author sees cannot drift into three accounts of one line. Each
// states the repair that clears it, and each is cleared by exactly that repair:
// a note whose only exit was naming deviations that are still open would push a
// writer toward closing a departure nobody decided on.
// Each names the reference it read rather than quoting a line back: the line as
// written may have named several entries, so a reconstructed `**Deviations
// closed:** <id>` is text the reader will not find when they go looking. The
// reference is quoted exactly as the writer spelled it, for the same reason.
const deviationBareLineNote = (id, count) =>
  `A \`**Deviations closed:**\` line names \`${id}\` with no item number, but ${id} had ${count} open deviations when that line was written, so it closes nothing: ` +
  `a bare closing line closes an entry's deviation only when exactly one was open above it, because "accepted" or "fixed" is a decision per departure. ` +
  `Name the ones it decided — \`${id}.1\`, \`${id}.2\` … in the order the entries record them, each as accepted or as fixed in <sha> — in a new dated line; the rest stay open, and naming any of them that way clears this note.`

const deviationUnknownItemNote = (ref, id, items) =>
  `A \`**Deviations closed:**\` line whose reference \`${ref}\` names no deviation: ${id} records ${items.length}${
    items.length ? ` (\`${items.map((d) => d.item).join('`, `')}\`)` : ''
  } above that line, so nothing was closed. ` +
  `Write the reference again correctly in a new dated line — the log is append-only, so the wrong line stays and the right one goes underneath it, and a line below it naming one of ${id}'s deviations clears this note.`

const deviationBadRefNote = (ref, id) =>
  `A \`**Deviations closed:**\` line names \`${ref}\`, and an ID has to end where the reference ends: \`${id}\` and \`${ref}\` are different names, so it closes nothing. ` +
  `Reading the prefix instead would close a deviation nobody named — the same silent discharge the owed ledger's \`F-2oops\` taught. ` +
  `Write the reference again correctly in a new dated line; a line below it naming one of ${id}'s deviations clears this note.`

// The next bolded FIELD — `**Owed:**`, `**Decisions:**`, a dated
// `**Addendum — … :**` — which is where a deviation paragraph stops when no
// blank line separates them. A label, not merely bold: a wrapped sentence that
// happens to BEGIN in bold ("… because / **the asset pipeline** cannot resize
// it") is the paragraph continuing, and ending it there cut the record at
// "because" — or, when the label's text began on the next line, dropped the
// paragraph as empty and reported the departure as none at all. The record must
// never be the thing an ambiguity is resolved against: a deviation nobody can
// read is the failure this whole line exists to end.
const BOLD_FIELD = /^\*\*[^*]+:\*\*/

// A closing line's LEADING reference list, split into what closes and what only
// looks like it does. The list is walked token by token rather than matched
// whole so that a malformed reference is reported instead of silently ending
// the list: `**Deviations closed:** D-1oops` reads like a closure to everyone
// but the parser, which is the shape that must never be quiet.
// Matched case-insensitively against the payload as written: a reference that
// closes is normalised to upper case, and one that only looks like a reference
// is kept as the writer spelled it, because a note quoting `E-1OOPS` at someone
// who wrote `E-1oops` sends them looking for a line that is not there.
const DEVIATION_REF = new RegExp(`^${OWED_REF_BOUNDED}`, 'i')
const DEVIATION_REF_NEAR = new RegExp(`^${TICKET_ID}[A-Za-z0-9.-]*`, 'i')
function closingRefs(payload) {
  const ok = []
  const bad = []
  let rest = payload
  for (;;) {
    const m = rest.match(DEVIATION_REF)
    const n = m || rest.match(DEVIATION_REF_NEAR)
    if (!n) break
    ;(m ? ok : bad).push(m ? n[0].toUpperCase() : n[0])
    rest = rest.slice(n[0].length)
    const comma = rest.match(/^\s*,\s*/)
    if (!comma) break
    rest = rest.slice(comma[0].length)
  }
  return { ok, bad }
}

// { deviations, notes } — every deviation the text records, each with its item
// ID and whether a closing line closed it, plus what no closing line could
// close. The notes are attributed to the entry they are about, so the
// per-ticket subcommand can show a ticket its own.
function parseDeviationsText(text) {
  const found = [] // deviation paragraphs, document order
  const closings = [] // closing lines, document order
  let entry = null // the last parsed "### <ID> — … — <date> — <outcome>" heading
  let collecting = null
  text.split('\n').forEach((line, i) => {
    const lineNo = i + 1
    const h = line.match(STATUS_HEADING)
    if (h) {
      entry = { entry: h[1], recorded: h[3] }
      collecting = null
      return
    }
    const c = line.match(DEVIATIONS_CLOSED_LINE)
    if (c) {
      // The closing line is collected as a paragraph too: its shape names each
      // deviation, who decided and when, which wraps past one line in any
      // document written at 80 columns.
      collecting = { text: c[1].trim(), line: lineNo }
      closings.push(collecting)
      return
    }
    const m = line.match(DEVIATION_LINE)
    if (m) {
      // A deviation above the first parsed entry heading belongs to no entry
      // and is dropped, like an **Owed:** paragraph in the same position.
      collecting = entry ? { ...entry, text: m[1].trim(), line: lineNo } : null
      if (collecting) found.push(collecting)
      return
    }
    if (collecting) {
      // The paragraph ends at a blank line, at the next bolded FIELD, or at the
      // next heading — never by swallowing them, and never by cutting prose.
      if (line.trim() === '' || BOLD_FIELD.test(line) || /^#{1,6}\s/.test(line)) collecting = null
      else collecting.text = `${collecting.text} ${line.trim()}`.trim()
    }
  })

  // Identity per entry ID, across every entry that ID heads: an ID recording one
  // departure keeps its bare ID, one recording several numbers them in document
  // order, stable because the log is append-only.
  const kept = found.filter((d) => d.text)
  const byEntry = new Map()
  for (const d of kept) {
    if (!byEntry.has(d.entry)) byEntry.set(d.entry, [])
    byEntry.get(d.entry).push(d)
  }
  for (const [id, items] of byEntry) items.forEach((d, i) => (d.item = items.length > 1 ? `${id}.${i + 1}` : id))

  const refs = closings.flatMap((cl) => closingRefs(cl.text).ok.map((ref) => ({ ref, line: cl.line })))
  // A reference that names one of the entry's deviations, recorded ABOVE the
  // closing line it sits on. The bare ID of an entry that recorded a single
  // departure is that departure's identity, so it matches here too — which is
  // what gives a lone departure's miscount an exit at all: no dotted reference
  // can ever be valid for such an entry.
  const namesItemAbove = (r) => (byEntry.get(r.ref.split('.')[0]) || []).some((d) => d.item === r.ref && d.line < r.line)
  // An entry someone has already closed item by item: that writer has moved to
  // the form the note asks for, so it supersedes any bare line above it. Only a
  // reference that MATCHES a deviation recorded above it counts — a mistyped
  // `<ID>.7` closed nothing, and letting it clear the note would trade one
  // silent line for another.
  const itemised = new Set(refs.filter((r) => r.ref.includes('.') && namesItemAbove(r)).map((r) => r.ref.split('.')[0]))
  // The last line on which a reference named one of an entry's deviations
  // correctly — the same ledger `parseOwed` keeps, for the same reason. Every
  // note is cleared by the repair it names, and the repair the wrong-reference
  // and malformed-reference notes name is "write the reference again correctly,
  // underneath": BELOW the faulty line, because the log is append-only and
  // position is time, so a correct reference written earlier is not a correction
  // of a later mistake. The bare-line note's rule differs on purpose and is
  // unchanged: a bare line is ambiguous about *which* departures it decided, so
  // any itemised line for that entry answers it wherever it sits, while a wrong
  // reference is one specific mistake and only a later line can be its
  // correction. A deviation already closed still counts — the writer's
  // correction may name the very one they meant.
  const correctedAt = new Map()
  for (const r of refs)
    if (namesItemAbove(r)) correctedAt.set(r.ref.split('.')[0], Math.max(correctedAt.get(r.ref.split('.')[0]) ?? 0, r.line))
  const corrected = (entry, line) => (correctedAt.get(entry) ?? 0) > line
  const closed = new Map()
  const notes = []
  const noted = new Set()
  // Document order, because a closing line is read against the state above it.
  for (const cl of closings) {
    const { ok, bad } = closingRefs(cl.text)
    for (const ref of bad) {
      // Reported only when the ID it starts with heads deviations in this log,
      // for the reason a cross-epic reference is not flagged: a note on a line
      // this log cannot judge would be permanent and unfixable here.
      const id = ref.match(new RegExp(`^${TICKET_ID}`, 'i'))[0].toUpperCase()
      if (!byEntry.has(id) || noted.has(ref) || corrected(id, cl.line)) continue
      noted.add(ref)
      notes.push({ entry: id, note: deviationBadRefNote(ref, id) })
    }
    for (const ref of ok) {
      const id = ref.split('.')[0]
      const items = byEntry.get(id)
      // A line naming an entry that recorded no deviation closes nothing and
      // says nothing: a closing line may name several entries, and an ID with
      // no departure to close is a legal thing to write.
      if (!items) continue
      if (ref.includes('.')) {
        const above = items.filter((d) => d.line < cl.line)
        // The FIRST line that closed it is the decision: a later line naming the
        // same departure again — a human confirming, or a second entry's line
        // repeating the list — must not overwrite who decided and when.
        if (above.some((d) => d.item === ref)) {
          if (!closed.has(ref)) closed.set(ref, cl.text)
        }
        else if (!noted.has(ref) && !corrected(id, cl.line)) {
          noted.add(ref)
          notes.push({ entry: id, note: deviationUnknownItemNote(ref, id, above) })
        }
        continue
      }
      // What the entry still had open above this line. Deviations recorded
      // after it were not what its writer decided, and ones already closed are
      // not what it could have meant.
      const open = items.filter((d) => d.line < cl.line && !closed.has(d.item))
      if (open.length === 1) closed.set(open[0].item, cl.text)
      else if (open.length > 1 && !itemised.has(id) && !noted.has(id)) {
        noted.add(id)
        notes.push({ entry: id, note: deviationBareLineNote(id, open.length) })
      }
    }
  }
  return {
    deviations: kept.map((d) => ({
      entry: d.entry,
      recorded: d.recorded,
      item: d.item,
      text: d.text,
      closed: closed.has(d.item),
      closedBy: closed.has(d.item) ? closed.get(d.item) : null,
    })),
    notes,
  }
}

function parseDeviations(epic) {
  if (!epic.statusDoc) return { deviations: [], notes: [] }
  return parseDeviationsText(readFileSync(epic.statusDoc, 'utf8'))
}

// ── token spend ──────────────────────────────────────────────────────────────
// The status log records spend in three places, and this derives one ledger
// from all of them so nobody sums by hand: a ticket entry's **Tokens** line,
// its review addendum's `Worker tokens (implementation leg): <n>;
// Reviewer tokens: <n>` phrases, and a run record's `**Tokens:**` line, which carries
// `<ID> worker=<n> reviewer=<n> disposition=<n> re-review=<n> proxies=<n>`
// groups. Recorded figures only — harness-observed or `unknown`, exactly as
// the log says; this script never estimates and never reads a transcript.
// Within a region the last figure for a role wins, so a dated correction
// addendum overrides the entry it corrects, like every other correction.
const SPEND_ROLES = ['worker', 'reviewer', 're-review', 'disposition', 'proxies']
// A qualifier in parentheses after the date is allowed — same-day runs need
// telling apart ("(resumed 2026-08-25)", "(second run)"); the first live
// epics wrote six of fourteen records that way and the strict shape read
// none of them.
const RUN_HEADING = /^###\s+Run\s*[—–-]\s*(\d{4}-\d{2}-\d{2})(?:\s*\([^)]*\))?\s*[—–-]/
const ROLE_RE = SPEND_ROLES.join('|')
const ROLE_PHRASE = new RegExp(`\\b(${ROLE_RE})\\s+tokens\\b[^:]{0,40}:\\s*(\\d[\\d,]*|unknown)`, 'gi')
// A token figure ends where its digits end: `worker=1430s` is a TIME figure
// (seconds carry their unit) and `worker=228k` is not machine-shaped at all,
// and before this lookahead both were read as tokens — 1430 and 228. The
// comma is in the class because the digit run may hold commas: without it
// `worker=1,430s` backs off to `worker=1`, where the next character is a
// comma and the lookahead is satisfied — one token, overwriting the real
// figure. A figure followed by a comma is still read (`worker=1,234, then`):
// the run takes the trailing comma with it, and `toNum` drops it.
const NOT_A_UNIT = '(?![A-Za-z\\d,])'
const ROLE_PAIR = new RegExp(`\\b(${ROLE_RE})=(\\d[\\d,]*|unknown)${NOT_A_UNIT}`, 'gi')
const ROLE_UNKNOWN = new RegExp(`\\b(${ROLE_RE})\\s+unknown\\b`, 'gi')
const TOKENS_LINE = /\*\*Tokens:\*\*\s*([^\n]*)/gi
// A group may open with `round=<n>` — `CITY-14 round=2 worker=804432
// reviewer=324269` — and rounds for a ticket and role are SUMMED, where every
// other repeat is a correction and the last one wins. The label is what tells
// them apart: a ticket reviewed four times spent four passes' tokens, and one
// live entry recorded exactly that as four unlabelled pairs, of which the
// ledger counted the last (879k of 4.4M). This one regex is used three times —
// the group read, the strip that separates an entry's own bare pairs from
// labelled groups, and doctor's only test for a parseable run record — so the
// round label lives here, where all three move together.
const ROLE_PAIRS = `((?:\\s+(?:${ROLE_RE})=(?:\\d[\\d,]*|unknown)${NOT_A_UNIT})+)`
// …and a group is never followed by a role pair it could not read. Without
// the closing lookahead `CITY-15 worker=unknown reviewer=200s` — a TIME group,
// quoted in prose — reads as the token group `CITY-15 worker=unknown`:
// `unknown` is the one figure with no unit, so it is the hole in the wall
// between the ledgers, and the leak replaces the ticket's own
// `**Tokens:** unknown` marker with a role nobody wrote a token figure for.
// (`wall` is time's own key; it is here because it is what follows.)
//
// The follower must be TIME-SHAPED — seconds, or `unknown`. The first cut
// refused a group followed by any `<role>=` at all, and that threw away whole
// groups main had read correctly: `A-1 worker=100 reviewer=50 wall=9`,
// `… reviewer=228k`, `… reviewer=` — silently, wherever a sibling group in the
// record parsed. A follower that is merely unreadable costs only itself.
const RUN_GROUP = new RegExp(`\\b(${TICKET_ID})(?:\\s+round=(\\d+))?${ROLE_PAIRS}(?!\\s+(?:${ROLE_RE}|wall)=(?:\\d[\\d,]*s|unknown)\\b)`, 'g')
// The same label inside a ticket's own entry, where the ID is the heading's.
const ENTRY_ROUND = new RegExp(`\\bround=(\\d+)${ROLE_PAIRS}`, 'gi')
// What marks a repeated figure as a correction rather than a round: the dated
// addendum corrections already take ("**Addendum — correction — …").
const CORRECTION_MARK = /Addendum\b[^*]{0,80}\bcorrect/i
const toNum = (s) => Number(s.replace(/,|s$/g, ''))

// ── time ─────────────────────────────────────────────────────────────────────
// A run record's `**Time:**` line is the Tokens line's twin — the same groups,
// the same rounds, the same corrections, written by the same observer
// (`scripts/meter.mjs`, from the transcripts' own timestamps) — with two
// differences. Every figure carries its unit, `worker=1430s`, because a bare
// `worker=1430` anywhere in a record is a token figure; and a group ends with
// `wall=<n>s`, the ticket's first agent start to its last agent end, which is
// NOT the roles' sum: the gap is what the ticket spent between agents.
//
// Time is read ONLY inside a `**Time:**` paragraph, and that paragraph is
// taken out of the text before tokens are read. The unit alone does not keep
// the ledgers apart — `FND-3 worker=unknown reviewer=200s` opens like a token
// group — so the paragraph is the boundary, and a correction to a time figure
// is a dated addendum whose figures sit under their own `**Time:**` line.
const TIME_ROLES = [...SPEND_ROLES, 'wall']
const TIME_RE = TIME_ROLES.join('|')
const TIME_PAIR = new RegExp(`\\b(${TIME_RE})=(\\d+s|unknown)\\b`, 'gi')
const TIME_GROUP = new RegExp(`\\b(${TICKET_ID})(?:\\s+round=(\\d+))?((?:\\s+(?:${TIME_RE})=(?:\\d+s|unknown)\\b)+)`, 'g')
// A time-shaped figure, wherever it sits — doctor's test for one that landed
// outside a Time paragraph, where nothing reads it.
// Commas included: `worker=1,430s` is not machine-shaped, and it is still a
// duration somebody meant the ledger to have.
const TIME_FIGURE = new RegExp(`\\b(?:${TIME_RE})=\\d[\\d,]*s\\b`, 'i')
// The paragraph runs from a line that starts `**Time:**` to the next blank line
// or bold label — records wrap at the house width — and the split is by GROUP,
// not by line: every time group in the paragraph is lifted out for the time
// ledger, whatever prose stands beside it, and what is left goes back to the
// text tokens are read from. Both line-level cuts lost figures silently. The
// paragraph taken whole swallowed `CITY-15 worker=100 reviewer=50` written
// under a Time line, and it reached neither ledger; the paragraph narrowed to
// lines holding nothing but time dropped a whole ticket's time for one
// parenthesis on a wrapped line, and handed the rejected line's
// `worker=unknown` to the token ledger. Lifted groups are blanked in place,
// newlines kept, so `rest` has the record's own line numbers and doctor can
// name the line it means.
function splitTimeParagraphs(text) {
  const lines = text.split('\n')
  const time = []
  const paragraphs = []
  let start = -1
  const close = (end) => {
    if (start < 0) return
    const raw = lines.slice(start, end).join('\n')
    paragraphs.push(raw)
    const kept = raw.replace(TIME_GROUP, (m) => (time.push(m), m.replace(/[^\n]/g, ' ')))
    lines.splice(start, end - start, ...kept.split('\n'))
    start = -1
  }
  lines.forEach((line, i) => {
    if (/^\*\*Time:\*\*/i.test(line)) {
      close(i)
      start = i
    } else if (start >= 0 && (line.trim() === '' || /^\*\*/.test(line))) close(i)
  })
  close(lines.length)
  return { rest: lines.join('\n'), restLines: lines.map((l, i) => [i, l]), time: time.join('\n'), paragraphs: paragraphs.join('\n') }
}

function parseSpend(epic) {
  const byId = {}
  // Ticket entries are always in status.md; run records are in runs.md once an
  // epic has split them out, and in status.md for every log written before the
  // split. Both files are read — the split moved where a record is written,
  // never where an old one can be found.
  const docs = [epic.statusDoc, epic.runsDoc].filter(Boolean)
  if (!docs.length) return byId
  const rec = (id) =>
    byId[id] ||
    (byId[id] = { id, figures: {}, rounds: {}, repeats: [], unknown: new Set(), source: null, note: null, time: { figures: {}, rounds: {}, unknown: new Set(), source: null } })
  // Two files means two orders, so the ranking is stated rather than left to
  // whichever file is read last:
  //
  //   1. `unknown` never overwrites a known figure. `unknown` records the
  //      absence of an observation, not a correction — a halted run that could
  //      not read its meter must not erase the figure the finished ticket's
  //      own entry recorded. (The reverse still applies: a known figure
  //      replaces an earlier `unknown`.)
  //   2. Between two known figures for the same ticket and role, the last one
  //      read wins, and runs.md is read after status.md — so a run record's
  //      figure outranks a status entry's, and a correction to a run record's
  //      figures belongs in runs.md, beneath the record it corrects.
  const apply = (r, role, val, source) => {
    role = role.toLowerCase()
    if (/^unknown$/i.test(val)) {
      if (role in r.figures) return // rule 1 — and the known figure keeps its own source
      r.unknown.add(role)
    } else {
      r.figures[role] = toNum(val)
      r.unknown.delete(role)
    }
    r.source = source
  }
  // A labelled round: last figure wins WITHIN the round (a correction to a
  // round is that round written again), rounds are summed at the end, and
  // `unknown` never erases a round's known figure — rule 1, per round.
  const applyRound = (r, n, role, val, source) => {
    role = role.toLowerCase()
    const rounds = (r.rounds[role] ||= {})
    if (/^unknown$/i.test(val)) {
      if (n in rounds) return // an unknown that changed nothing keeps the known figure's source too
      rounds[n] = null
    } else rounds[n] = toNum(val)
    r.source = source
  }
  // Entries wrap at the house width, so phrases are matched over a region's
  // joined text, never line by line: "Worker tokens (implementation\nleg):".
  const flush = (region, text) => {
    if (!region) return
    const split = splitTimeParagraphs(text)
    // Time groups go to the ticket's time ledger under the token ledger's own
    // rules — `apply` and `applyRound` take either — so rounds sum, a repeat
    // corrects, and `unknown` never erases an observation, in both.
    for (const m of split.time.replace(/\s+/g, ' ').matchAll(TIME_GROUP)) {
      const t = rec(m[1]).time
      const where = region.run ? 'run-record' : 'log'
      for (const p of m[3].matchAll(TIME_PAIR)) m[2] ? applyRound(t, m[2], p[1], p[2], where) : apply(t, p[1], p[2], where)
    }
    const flat = split.rest.replace(/\s+/g, ' ')
    // A machine-shaped group names its own ticket, so it is read wherever it
    // sits — a correction addendum for a run record appended at the end of
    // a log lands in whatever entry is last, and must still reach the ticket
    // it names rather than the entry it landed in.
    for (const m of flat.matchAll(RUN_GROUP)) {
      const r = rec(m[1])
      for (const p of m[3].matchAll(ROLE_PAIR)) m[2] ? applyRound(r, m[2], p[1], p[2], 'run-record') : apply(r, p[1], p[2], 'run-record')
      r.unknown.delete('ticket')
    }
    if (region.id) {
      const r = rec(region.id)
      let own = flat.replace(RUN_GROUP, ' ') // bare pairs and phrases belong to this entry; labelled groups do not
      for (const m of own.matchAll(ENTRY_ROUND)) for (const p of m[2].matchAll(ROLE_PAIR)) applyRound(r, m[1], p[1], p[2], 'log')
      own = own.replace(ENTRY_ROUND, ' ')
      // Two unlabelled known figures for one role in one entry are either a
      // correction or two rounds, and only the first is what last-wins means.
      // Doctor asks which, unless a correction addendum sits between them.
      const seen = {}
      const entryRepeats = []
      const unlabelled = [...own.matchAll(ROLE_PHRASE), ...own.matchAll(ROLE_PAIR)]
        .filter((m) => !/^unknown$/i.test(m[2]))
        .sort((a, b) => a.index - b.index)
      for (const m of unlabelled) {
        const role = m[1].toLowerCase()
        const prev = seen[role]
        if (prev && !CORRECTION_MARK.test(own.slice(prev.index, m.index))) {
          // Per entry, not per ticket: a ticket with two entries (a BLOCKED one,
          // then a DONE one) must not have their figures read as one entry's.
          let hit = entryRepeats.find((x) => x.role === role)
          if (!hit) {
            entryRepeats.push((hit = { role, figures: [toNum(prev[2])] }))
            r.repeats.push(hit)
          }
          hit.figures.push(toNum(m[2]))
        }
        seen[role] = m
      }
      for (const m of own.matchAll(ROLE_PHRASE)) apply(r, m[1], m[2], 'log')
      for (const m of own.matchAll(ROLE_PAIR)) apply(r, m[1], m[2], 'log')
      for (const m of own.matchAll(ROLE_UNKNOWN)) apply(r, m[1], 'unknown', 'log')
      for (const m of flat.matchAll(TOKENS_LINE)) {
        const v = m[1].trim()
        if (/^unknown\b/i.test(v)) {
          r.unknown.add('ticket')
          r.source = r.source || 'log'
        } else if (/run record/i.test(v)) r.note = 'run-record'
        else if (/supervisor/i.test(v)) r.note = 'addendum'
      }
    }
  }
  // status.md first, so that a correction appended to runs.md wins the
  // last-figure-for-a-role rule over anything the older file recorded.
  for (const doc of docs) {
    let region = null // { id } for a ticket entry, { run: date } for a run record
    let text = ''
    for (const line of readFileSync(doc, 'utf8').split('\n')) {
      const h = line.match(STATUS_HEADING)
      const run = h ? null : line.match(RUN_HEADING)
      // Every h2/h3 closes the region — including a heading that parses as
      // neither shape. Otherwise the groups under a malformed run heading
      // would land in whatever region precedes it, and a ticket entry's region
      // would take them as its own figures; doctor flags the heading instead.
      if (h || run || /^#{2,3}\s/.test(line)) {
        flush(region, text)
        region = h ? { id: h[1] } : run ? { run: run[1] } : null
        text = ''
        continue
      }
      if (region) text += `${line}\n`
    }
    flush(region, text)
  }
  // Rounds are summed last, over everything both files said. A role that has
  // labelled rounds is their sum — the labelled reading wins over any
  // unlabelled figure for the same role, and `mixed` says so for doctor. A
  // round known only as `unknown` adds nothing and erases nothing.
  for (const r of Object.values(byId).flatMap((x) => [x, x.time])) {
    r.mixed = []
    for (const [role, rounds] of Object.entries(r.rounds)) {
      const known = Object.values(rounds).filter((v) => v !== null)
      if (!known.length) {
        if (!(role in r.figures)) r.unknown.add(role)
        continue
      }
      if (role in r.figures) r.mixed.push(role)
      r.figures[role] = known.reduce((a, b) => a + b, 0)
      r.unknown.delete(role)
    }
  }
  return byId
}

// A run record whose Tokens line carries figures but no machine-shaped group
// is the ledger's one silent failure: the figures exist, `spend` reads nothing,
// and the run lane's tickets report "no figure recorded" as if nobody had
// measured. Doctor flags it the way it flags a heading that almost parses. The
// repair is the log's own correction mechanism — a dated addendum beneath the
// record restating the figures as groups — and parseSpend already reads a
// region's addenda, so the advertised recovery works in the flagged state.
function runRecordNearMisses(doc, timed = new Set()) {
  const misses = []
  let region = null // { line } for a run record; null elsewhere
  let text = ''
  const flush = () => {
    if (!region || region.tokensLine === undefined) return
    const flat = splitTimeParagraphs(text).rest.replace(/\s+/g, ' ')
    const groups = [...flat.matchAll(RUN_GROUP)]
    // The figure must sit in the Tokens paragraph itself — the line and its
    // house-width continuation lines, up to the next blank line or bold
    // label — not anywhere later in the record: a Halted-on sentence that
    // mentions a token count is not a figure the ledger was meant to read.
    // A date (2026-08-24) is not a figure either.
    // Nor is `total=` on its own: a run that selected no ticket has a total
    // and no group to restate, and a warn no append can clear is a warn that
    // teaches its reader to ignore the rest.
    const hasFigure = /(?<![\d-])\d[\d,]+(?![\d-])/.test(region.tokensParagraph.replace(/\btotal=[\d,]+/gi, ''))
    if (!groups.length && hasFigure) misses.push({ line: region.tokensLine, heading: region.heading })
  }
  // The Time line's two near-misses, and both are written so that the repair
  // they advertise ends them — the log is append-only, so an addendum can add
  // a group and can never remove the prose that tripped a warn. (The first cut
  // of the stray-figure warn fired on the figure alone, and kept firing after
  // the repair had worked.)
  //
  //   time-shape  — the record has a Time line with figures and no Time group
  //                 parses anywhere in it. `run=` alone is the whole Time line
  //                 of a run that selected no ticket, and is no figure here.
  //   time-stray  — a time-shaped figure nothing read (`worker=1,430s`, or a
  //                 well-formed one in prose outside a Time paragraph), on a
  //                 line naming a ticket that has NO time anywhere in the
  //                 ledger. Per ticket, because per record hides the common
  //                 case: ticket A's group parses, ticket B's is malformed,
  //                 and B's time is silently absent. A record whose tickets
  //                 all have time may quote a duration in its Diagnosis. A
  //                 stray figure on a line naming no ticket falls back to the
  //                 record: it warns when no group parses in it.
  const flushTime = () => {
    if (!region) return
    const split = splitTimeParagraphs(text)
    const parses = split.time !== ''
    if (!parses && region.timeLine !== undefined && /\d/.test(split.paragraphs.replace(/\d{4}-\d{2}-\d{2}|\brun=\d+s\b/gi, '')))
      return misses.push({ kind: 'time-shape', line: region.timeLine, heading: region.heading })
    for (const [i, line] of split.restLines) {
      if (!TIME_FIGURE.test(line)) continue
      const ids = [...line.matchAll(new RegExp(`\\b${TICKET_ID}\\b`, 'g'))].map((m) => m[0])
      const untimed = ids.filter((id) => !timed.has(id))
      if (ids.length ? untimed.length : !parses) return misses.push({ kind: 'time-stray', line: region.line + 1 + i, heading: region.heading, ids: untimed })
    }
  }
  readFileSync(doc, 'utf8').split('\n').forEach((line, i) => {
    if (/^#{2,3}\s/.test(line)) {
      flush()
      flushTime()
      region = RUN_HEADING.test(line) ? { line: i + 1, heading: line.trim(), tokensParagraph: '' } : null
      text = ''
      return
    }
    if (!region) return
    if (region.timeLine === undefined && /^\*\*Time:\*\*/i.test(line)) region.timeLine = i + 1
    if (region.tokensLine === undefined && /^\*\*Tokens:\*\*/i.test(line)) {
      region.tokensLine = i + 1
      region.inTokens = true
      region.tokensParagraph = line.replace(/^\*\*Tokens:\*\*/i, '')
    } else if (region.inTokens) {
      if (line.trim() === '' || /^\*\*/.test(line)) region.inTokens = false
      else region.tokensParagraph += ` ${line}`
    }
    text += `${line}\n`
  })
  flush()
  flushTime()
  return misses
}

// Every parsing run-record heading in a log, in document order. Used by doctor
// to date-scope the wrong-file flag: an append-only log is written in date
// order, so the first record in runs.md is the moment that epic's records
// moved there.
function runRecordHeadings(doc) {
  const found = []
  readFileSync(doc, 'utf8')
    .split('\n')
    .forEach((line, i) => {
      const m = line.match(RUN_HEADING)
      if (m) found.push({ line: i + 1, date: m[1], heading: line.trim() })
    })
  return found
}

// The fallback for a ticket no run record timed: the span between the first
// and the last commit whose subject names it, off author dates (a rebase
// rewrites the committer date and keeps the author's). It is observed, which
// is why it is shown at all — and it is NOT the ticket's wall-clock, which is
// why it is never written into `time.wall`: the work before the first commit
// is most of an implementation and none of this span, and a squash-merged
// ticket's span ends at the merge, human wait included. One commit is a point,
// not a span, and reads as nothing.
function commitSpans() {
  const out = git(['log', '--all', '--no-merges', '--format=%at%x09%s', '-n', String(MAIN_SCAN_LIMIT)], { allowFail: true })
  const spans = {}
  const subject = new RegExp(`^(${TICKET_ID})[:\\s]`)
  const lines = out ? out.split('\n') : []
  // `--all` reaches a rebased or cherry-picked commit once per ref it sits on.
  // Same author date and same subject is the same piece of work, counted once.
  // And when the scan cap bites, a ticket's first commit may be past it — the
  // span would shrink with nothing saying so, so the report says so.
  Object.defineProperty(spans, 'capped', { value: lines.length >= MAIN_SCAN_LIMIT, enumerable: false })
  for (const line of new Set(lines)) {
    const tab = line.indexOf('\t')
    const m = line.slice(tab + 1).match(subject)
    const at = Number(line.slice(0, tab))
    if (!m || !at) continue
    const sp = spans[m[1]] || (spans[m[1]] = { first: at, last: at, commits: 0 })
    sp.first = Math.min(sp.first, at)
    sp.last = Math.max(sp.last, at)
    sp.commits++
  }
  return spans
}

function spendReport(epicFilter) {
  const data = board(epicFilter)
  requireKnownEpic(data, epicFilter)
  const spans = commitSpans()
  const epics = []
  for (const epic of data.epics) {
    const spend = parseSpend(epic)
    const tickets = data.tickets
      .filter((t) => t.epic === epic.epic)
      .map((t) => {
        const r = spend[t.id] || { figures: {}, rounds: {}, unknown: new Set(), source: null, note: null }
        const known = Object.values(r.figures)
        const time = r.time || { figures: {}, rounds: {}, unknown: new Set() }
        const span = spans[t.id]
        return {
          id: t.id,
          title: t.title,
          state: t.state,
          ...Object.fromEntries(SPEND_ROLES.map((role) => [role, r.figures[role] ?? null])),
          total: known.length ? known.reduce((a, b) => a + b, 0) : null,
          unknown: [...r.unknown].sort(),
          // How many labelled rounds each summed role's figure adds up — absent
          // roles were never labelled, so their figure is a single reading.
          rounds: Object.fromEntries(Object.entries(r.rounds || {}).map(([role, rs]) => [role, Object.keys(rs).length])),
          source: r.source,
          note: r.note,
          // Seconds, per role and `wall`, from the run records' Time lines;
          // null where nothing was recorded. `wall` is first agent start to
          // last agent end and is not the roles' sum.
          time: {
            ...Object.fromEntries(TIME_ROLES.map((role) => [role, time.figures[role] ?? null])),
            unknown: [...time.unknown].sort(),
            source: time.source ?? null,
            rounds: Object.fromEntries(Object.entries(time.rounds || {}).map(([role, rs]) => [role, Object.keys(rs).length])),
          },
          // Only where no wall was recorded — a recorded wall is the better
          // observation and the span would read as a second opinion on it.
          // One commit is a point, and so are several at one instant.
          commitSpan: time.figures.wall == null && span && span.last > span.first ? { seconds: span.last - span.first, commits: span.commits } : null,
        }
      })
    const totals = Object.fromEntries(SPEND_ROLES.map((role) => [role, tickets.reduce((a, t) => a + (t[role] || 0), 0)]))
    totals.total = tickets.reduce((a, t) => a + (t.total || 0), 0)
    const timeTotals = Object.fromEntries(TIME_ROLES.map((role) => [role, tickets.reduce((a, t) => a + (t.time[role] || 0), 0)]))
    epics.push({
      epic: epic.epic,
      tickets,
      totals,
      timeTotals,
      untimedTickets: tickets.filter((t) => t.time.wall === null).length,
      unknownTickets: tickets.filter((t) => t.total === null || t.unknown.length).length,
    })
  }
  return { epics, commitSpansCapped: spans.capped }
}

// ── git and GitHub state ─────────────────────────────────────────────────────

const branchNameFor = (id) => id.toLowerCase()

function localBranches() {
  const out = git(['for-each-ref', '--format=%(refname:short)', 'refs/heads'], { allowFail: true })
  return new Set(out ? out.split('\n').filter(Boolean) : [])
}

// One gh call for the whole board. Offline or unauthenticated is not fatal —
// the board degrades to git-only facts and says so.
function pullRequests() {
  try {
    const out = execFileSync(
      'gh',
      ['pr', 'list', '--state', 'all', '--limit', '200', '--json', 'number,headRefName,baseRefName,state,url,isDraft'],
      { cwd: repoRoot, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] },
    )
    const byBranch = {}
    for (const pr of JSON.parse(out)) if (!byBranch[pr.headRefName]) byBranch[pr.headRefName] = pr
    return { byBranch, available: true }
  } catch {
    return { byBranch: {}, available: false }
  }
}

// Ticket IDs that already have commits on a ref. On the default branch this
// is the authority on "shipped", rather than the PR head branch, because a
// branch name only matches when the author followed the convention — work
// merged under any other branch name would read as unshipped forever. On a
// release epic's branch the same scan is the authority on "integrated": a
// release ticket has no pull request of its own (the release pull request is
// the epic's only one), so its merge leaves exactly one trace — its
// ID-prefixed commit subjects reaching epic/<name>. One log call per ref,
// which is why CLAUDE.md requires the ID prefix.
const MAIN_SCAN_LIMIT = 4000

function idsOnRef(ref) {
  const out = git(['log', ref, '--format=%s', '-n', String(MAIN_SCAN_LIMIT)], { allowFail: true })
  const ids = new Set()
  if (!out) return { ids, capped: false }
  const subjects = out.split('\n')
  const re = new RegExp(`^(${TICKET_ID})[:\\s]`)
  for (const subject of subjects) {
    const m = subject.match(re)
    if (m) ids.add(m[1])
  }
  // A silent cap reads as "scanned everything" when it didn't — say so instead.
  return { ids, capped: subjects.length >= MAIN_SCAN_LIMIT }
}

const idsOnMain = () => idsOnRef(`origin/${defaultBranch}`)

// Work on an epic branch that belongs to no ticket. A commit there whose
// subject carries no ticket ID reaches no status entry, no spend line and no
// reviewer — weekendgoals' redesign-city shipped ten of them, the fix for a
// production crash loop among them, and its documents stop one day before the
// epic does. Derived like everything else: the non-merge commits between the
// default branch and the epic branch that touch anything outside `epics/`
// (plan edits, status entries, run records and addenda are the epic's own
// bookkeeping) and whose subject does not open with a ticket ID. `epicLevel`
// marks the ones subjected `<epic-name>: …` — the convention for work no
// ticket owns by construction, the release review's own fixes — which are
// listed and never warned about: somebody chose that name. An epic whose
// branch is gone or merged reads as none, which is what derived means.
function unticketedCommits(epicName) {
  const ref = [`origin/epic/${epicName}`, `epic/${epicName}`].find((r) => git(['rev-parse', '--verify', '--quiet', `${r}^{commit}`], { allowFail: true }))
  if (!ref) return []
  const out = git(
    ['log', '--no-merges', '--format=%h%x09%s', '-n', String(MAIN_SCAN_LIMIT), `origin/${defaultBranch}..${ref}`, '--', ':(top)', ':(top,exclude)epics'],
    { allowFail: true },
  )
  if (!out) return []
  const ticketed = new RegExp(`^(${TICKET_ID})[:\\s]`)
  return out
    .split('\n')
    .map((l) => {
      const tab = l.indexOf('\t')
      return { sha: l.slice(0, tab), subject: l.slice(tab + 1) }
    })
    .filter((c) => c.sha && !ticketed.test(c.subject))
    .map((c) => ({ ...c, epicLevel: c.subject.startsWith(`${epicName}:`) }))
}

function commitsAhead(branch) {
  const n = git(['rev-list', '--count', `origin/${defaultBranch}..${branch}`], { allowFail: true })
  return n === null ? 0 : Number(n)
}

// ── state resolution ─────────────────────────────────────────────────────────

// `waiting` is a `todo` ticket whose `**Blocked by:**` line names a ticket
// that is not integrated yet — or whose line cannot be read. It is not
// `blocked`, which is an OUTCOME a worker recorded; waiting is a plan's
// statement about order, and it ends by itself when the blocker lands.
const STATES = ['shipped', 'integrated', 'in-review', 'done', 'in-progress', 'blocked', 'waiting', 'todo']
const LANDED = new Set(['shipped', 'integrated'])

function resolveState(ticket, status, branches, prs, onMain, onEpicBranch) {
  const branch = branchNameFor(ticket.id)
  const pr = prs.byBranch[branch]
  const entry = status[ticket.id]

  if (onMain.has(ticket.id)) return { state: 'shipped', branch, pr }
  if (pr && pr.state === 'MERGED') {
    // A PR merged into an epic branch (integration mode) has not shipped — it is
    // waiting on the epic's release PR. Only a merge into the default branch is
    // "shipped". Kept alongside the subject scan below: epics run before
    // release tickets stopped opening per-ticket pull requests still derive.
    const state = !pr.baseRefName || pr.baseRefName === defaultBranch ? 'shipped' : 'integrated'
    return { state, branch, pr }
  }
  // A release ticket's merge into epic/<name> — its only integration trace,
  // since release tickets open no pull request of their own. Checked before
  // the OPEN branch so a stale pull request never outranks a landed merge.
  if (onEpicBranch.has(ticket.id)) return { state: 'integrated', branch, pr }
  if (pr && pr.state === 'OPEN') return { state: 'in-review', branch, pr }
  if (entry?.outcome === 'BLOCKED' || entry?.outcome === 'ABANDONED') return { state: 'blocked', branch, pr }
  if (entry?.outcome === 'DONE') return { state: 'done', branch, pr }
  if (branches.has(branch) && commitsAhead(branch) > 0) return { state: 'in-progress', branch, pr }
  return { state: 'todo', branch, pr }
}

const NO_IDS = new Set()

function board(epicFilter) {
  const allEpics = discoverEpics()
  const epics = allEpics.filter((e) => !epicFilter || e.epic === epicFilter)
  const branches = localBranches()
  const prs = pullRequests()
  const onMain = idsOnMain()

  const tickets = []
  const unticketed = {}
  for (const epic of epics) {
    const loose = unticketedCommits(epic.epic)
    if (loose.length) unticketed[epic.epic] = loose
    const status = parseStatus(epic)
    // Only release epics pay the extra log call, and only when their epic
    // branch exists on the remote — the remote, because integration is the
    // driver's push, and a local-only epic branch proves nothing.
    const onEpicBranch = epic.delivery === 'release' ? idsOnRef(`origin/epic/${epic.epic}`).ids : NO_IDS
    const parsed = parseTickets(epic)
    const { deps, problems, notes } = resolveDependencies(parsed)
    const resolved = parsed.map((t) => ({ ...t, ...resolveState(t, status, branches, prs, onMain.ids, onEpicBranch) }))
    const stateOf = Object.fromEntries(resolved.map((t) => [t.id, t.state]))
    for (const t of resolved) {
      t.blockedBy = deps[t.id]
      // What it still waits on: blockers that have not landed. A blocker that
      // is not a ticket here never lands, which is why it is a problem too.
      t.waitingOn = deps[t.id].filter((b) => !LANDED.has(stateOf[b]))
      t.dependencyProblem = problems[t.id] || null
      t.dependencyNote = notes[t.id] || null
      // Only a ticket nobody has started can wait: once there is work on it,
      // the board reports the work, and the plan's order is history.
      if (t.state === 'todo' && (t.waitingOn.length || t.dependencyProblem)) t.state = 'waiting'
      tickets.push(t)
    }
  }

  // An ID defined in two epics resolves to one of them arbitrarily — the exact
  // "ran against the wrong epic's documents" failure this layout exists to
  // prevent. Detected here, refused in `find`, flagged on the board.
  const byIdAll = {}
  for (const t of tickets) (byIdAll[t.id] ||= []).push(t.epic)
  const duplicates = Object.fromEntries(Object.entries(byIdAll).filter(([, es]) => es.length > 1))

  return {
    epics,
    tickets,
    byId: Object.fromEntries(tickets.map((t) => [t.id, t])),
    duplicates,
    unticketed,
    current: currentEpic(allEpics),
    prsAvailable: prs.available,
    onMainCapped: onMain.capped,
    defaultBranch,
  }
}

// Why a waiting ticket waits, in the words every surface prints: the board
// row, `find`, doctor, and `next` when it refuses.
function waitingReason(t, byId) {
  if (t.dependencyProblem) return `${t.id} cannot start: ${t.dependencyProblem}`
  return `${t.id} waits on ${t.waitingOn.map((b) => `${b} (${byId[b]?.state ?? 'unknown'})`).join(', ')}`
}

// ── output ───────────────────────────────────────────────────────────────────

const C = process.stdout.isTTY
  ? { dim: '\x1b[2m', red: '\x1b[31m', green: '\x1b[32m', yellow: '\x1b[33m', blue: '\x1b[34m', cyan: '\x1b[36m', bold: '\x1b[1m', off: '\x1b[0m' }
  : { dim: '', red: '', green: '', yellow: '', blue: '', cyan: '', bold: '', off: '' }

const BADGE = {
  shipped: `${C.green}shipped${C.off}`,
  integrated: `${C.cyan}integrated${C.off}`,
  'in-review': `${C.blue}in review${C.off}`,
  done: `${C.yellow}done, unpushed${C.off}`,
  'in-progress': `${C.yellow}in progress${C.off}`,
  blocked: `${C.red}blocked${C.off}`,
  waiting: `${C.dim}waiting${C.off}`,
  todo: `${C.dim}todo${C.off}`,
}

// The `← this folder` marker names the checkout's own epic — a root folder
// named <epic> works epics/<epic>/, the one-checkout-per-epic convention
// `currentEpic` reads. One helper renders it for ticketed and ticketless
// epics alike: a ticketless epic is exactly a freshly-cut epic's state, where
// the checkout most needs the marker (Q-15's review, Q-17). Argument order is
// (name, current) here and in `ticketlessLine` below — deliberately identical,
// because a swapped call fails silently: `current?.epic === name` with the two
// transposed compares undefined to an object, yielding no marker and no error.
const hereMarker = (name, current) => (current?.epic === name ? `${C.green}  ← this folder${C.off}` : '')

// One line for an epic whose ticket doc has no `## <ID> — …` sections yet.
// Shared by the all-empty board and the mixed board so the two renderings
// cannot drift apart: an epic that exists is named wherever the board prints,
// never silently skipped (Q-8, Q-15) — and marked as this folder when it is,
// like every ticketed epic (Q-17).
const ticketlessLine = (name, current) => `${C.bold}${name}${C.off} ${C.dim}— no tickets yet${C.off}${hereMarker(name, current)}`

function printBoard(data, epicFilter) {
  if (!data.tickets.length) {
    // An unknown filter never reaches here — the entry point rejects it with
    // exit 1 (BOARD-2). So a ticketless board is one of two facts, and they
    // must not share a message: no epics at all, or real epics whose ticket
    // docs have no sections yet — claiming "no epics found" for the latter
    // reports existing work as nonexistent (Q-8). Name each epic and its
    // empty state instead.
    if (epicFilter) console.log(`epic "${epicFilter}" has no tickets yet`)
    else if (!data.epics.length) console.log('no epics found under epics/')
    else for (const e of data.epics) console.log(ticketlessLine(e.epic, data.current))
    return
  }
  if (!data.prsAvailable) {
    console.log(`${C.dim}(gh unavailable — PR state omitted, "done" may already be merged)${C.off}\n`)
  }
  if (data.onMainCapped) {
    console.log(
      `${C.dim}(shipped detection scanned only the last ${MAIN_SCAN_LIMIT} commits on ${data.defaultBranch} — older tickets may read as unshipped)${C.off}\n`,
    )
  }
  for (const [id, epics] of Object.entries(data.duplicates)) {
    console.log(`${C.red}duplicate ID ${id} — defined in: ${epics.join(', ')}. Rename one; \`find\` refuses ambiguous IDs.${C.off}`)
  }
  if (Object.keys(data.duplicates).length) console.log()

  for (const epic of data.epics) {
    const ts = data.tickets.filter((t) => t.epic === epic.epic)
    if (!ts.length) {
      // At least one epic has tickets, but this one has no sections yet.
      // Skipping it omitted the epic from the mixed board entirely — existing
      // work reported as nonexistent, Q-8's defect class at larger blast
      // radius (Q-15). Name it with its empty state, same line as the
      // all-empty board above.
      console.log(ticketlessLine(epic.epic, data.current))
      console.log()
      continue
    }
    const counts = STATES.map((s) => [s, ts.filter((t) => t.state === s).length]).filter(([, n]) => n)
    const here = hereMarker(epic.epic, data.current)
    // Incremental is the default and stays unlabelled; anything else —
    // release, or an unrecognised value doctor will flag — is worth a glance
    // before starting a ticket in it.
    const modes = epic.delivery !== 'incremental' ? ` · ${C.off}${C.cyan}${epic.delivery}${C.off}${C.dim}` : ''
    console.log(
      `${C.bold}${epic.epic}${C.off} ${C.dim}— ${ts.length} tickets${modes} · ` +
        counts.map(([s, n]) => `${n} ${s}`).join(' · ') + `${C.off}${here}`,
    )
    for (const t of ts) {
      const title = t.title.length > 46 ? t.title.slice(0, 45) + '…' : t.title
      console.log(
        `  ${t.id.padEnd(8)} ${title.padEnd(46)} ${BADGE[t.state]}` +
          (t.state === 'waiting' ? `${C.dim} ${t.dependencyProblem ? '— its Blocked by line is a problem (doctor names it)' : `on ${t.waitingOn.join(', ')}`}${C.off}` : '') +
          (t.pr ? `  #${t.pr.number}` : ''),
      )
    }
    const loose = data.unticketed[epic.epic] || []
    if (loose.length) {
      const named = loose.filter((c) => c.epicLevel).length
      console.log(
        `  ${C.dim}${loose.length} unticketed commit${loose.length === 1 ? '' : 's'} on epic/${epic.epic}` +
          (named ? ` (${named} subjected "${epic.epic}: …")` : '') +
          ` — work no status entry records; \`list ${epic.epic} --json\` names them${C.off}`,
      )
    }
    console.log()
  }

  // Document order is the epic's intended order — the ticket docs deliberately
  // put the de-risking probe or the live regression first.
  const open = data.tickets.filter((t) => t.state === 'todo')
  if (!open.length) {
    // Unconditional: the empty board returned at the top of this function, so
    // there are always tickets here (dead false branch removed — Q-15's
    // review noted it, Q-17's pass touched this function).
    const waiting = data.tickets.filter((t) => t.state === 'waiting')
    if (!waiting.length) console.log('Nothing left to start.')
    else {
      // Not "nothing left": work remains and none of it may begin.
      console.log(`${C.bold}Nothing can start${C.off} — ${waiting.length} ticket${waiting.length === 1 ? '' : 's'} waiting:`)
      for (const t of waiting) console.log(`  ${waitingReason(t, data.byId)}`)
    }
    return
  }
  console.log(`${C.bold}Next up${C.off}`)
  for (const epic of data.epics) {
    const mine = open.filter((t) => t.epic === epic.epic)
    if (!mine.length) continue
    const rest = mine.length - 1
    console.log(
      `  ${C.green}/flow:ticket ${mine[0].id}${C.off}  ${mine[0].title}` +
        (rest ? `  ${C.dim}(+${rest} more in ${epic.epic})${C.off}` : ''),
    )
  }
  // Named as a subcommand of this script, not as a pasteable command line —
  // /flow:brief does not exist and tickets.mjs is not on any PATH, and the
  // board never suggests a command that does not survive being run (BOARD-1).
  console.log(`  ${C.dim}(this script's \`brief [ID]\` subcommand prints a ticket's full scope, criteria, epic ground rules, outstanding owed items and derived state)${C.off}`)
}

// ── doctor ───────────────────────────────────────────────────────────────────

// Everything here is a deterministic precondition or a silent-misreport risk.
// Judgment calls (are the instruction files any good?) belong to the skill that
// wraps this, not to code.
function doctor() {
  const rows = []
  const add = (level, msg) => rows.push({ level, msg })

  const origin = git(['remote', 'get-url', 'origin'], { allowFail: true })
  if (origin) add('ok', `remote origin: ${origin}`)
  else add('fail', 'no "origin" remote — the flow pushes branches and opens pull requests; add a remote first')

  const head = git(['symbolic-ref', '--short', 'refs/remotes/origin/HEAD'], { allowFail: true })
  if (head) add('ok', `default branch: ${defaultBranch} (from origin/HEAD)`)
  else add('warn', `origin/HEAD not set — assuming "${defaultBranch}"; fix with: git remote set-head origin -a`)

  if (origin && git(['rev-parse', '--verify', '--quiet', `origin/${defaultBranch}`], { allowFail: true }) === null) {
    add('fail', `no local ref for origin/${defaultBranch} — run git fetch origin; shipped detection reads it`)
  }

  const prs = pullRequests()
  if (prs.available) add('ok', 'gh reachable — pull request state available')
  else add('warn', 'gh unavailable or unauthenticated — the board degrades to git-only facts')

  if (prs.available) {
    try {
      const view = JSON.parse(
        execFileSync('gh', ['repo', 'view', '--json', 'mergeCommitAllowed'], {
          cwd: repoRoot, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'],
        }),
      )
      if (view.mergeCommitAllowed) add('ok', 'merge commits allowed')
      else
        add('warn',
          'merge commits are disabled on this repository — an integration release pull request cannot merge without collapsing its ticket subjects. Single-ticket PRs titled "<ID>: …" are still fine squashed.')
    } catch { /* repo view needs a resolvable GitHub remote; nothing to report without it */ }
  }

  const instructions = ['CLAUDE.md', 'AGENTS.md'].find((f) => existsSync(join(repoRoot, f)))
  if (instructions) add('ok', `root agent instructions: ${instructions}`)
  else add('warn', 'no CLAUDE.md or AGENTS.md at the repository root — skills read run and test commands from it instead of guessing')

  const epics = discoverEpics()
  if (!epics.length) add('ok', 'no epics yet — /flow:epic creates epics/<name>/')

  // A declaration line that ALMOST parses — bolded label, doubled space, a
  // bare label with no value on its line — reads as absent and silently
  // defaults. Same failure class as heading near-misses: flag anything
  // declaration-shaped in the preamble that the strict parse rejects. The
  // old two-line syntax ("Release mode:" / "Run mode:") is in the near set
  // deliberately: those labels parse as nothing at all now, and a preamble
  // written in them would silently run incremental.
  const declNear = /^[^A-Za-z]*\b(delivery|(reviewer|worker|planner)\s+model|worker\s+runner|shadow\s+reviewer|consequence\s+paths|fix\s+bounds\s+exclude|design\s+sources|ticket\s+budget|parallel(?=\s*:)|(release|run)\s+mode)\b/i
  const declStrict = /^Delivery\s*:\s*[A-Za-z-]+|^(Reviewer|Worker|Planner) model\s*:\s*[A-Za-z0-9._-]+|^Worker runner\s*:\s*[A-Za-z-]+|^Shadow reviewer\s*:\s*[A-Za-z-]+|^Consequence paths\s*:\s*\S+|^Fix bounds exclude\s*:\s*\S+|^Design sources\s*:\s*\S+|^Ticket budget\s*:\s*\d+[km]?(\s|$)|^Parallel\s*:\s*[1-3](\s|$)/i
  for (const epic of epics) {
    if (!DELIVERIES.has(epic.delivery))
      add('warn', `${epic.epic}: unrecognised delivery "${epic.delivery}" (known: release, incremental) — skills reading it will not know how this epic ships`)
    readFileSync(epic.ticketsDoc, 'utf8').split(/^##\s/m)[0].split('\n').forEach((line, i) => {
      if (declNear.test(line) && !declStrict.test(line))
        add('warn', `${epic.epic}/tickets.md:${i + 1} — looks like a declaration line but will not parse, so it silently defaults (needs "Delivery: release|incremental" / "Reviewer model: <value>" / "Worker model: <value>" / "Worker runner: claude|codex" / "Shadow reviewer: codex" / "Planner model: <value>" / "Consequence paths: <glob>[, <glob>]" / "Fix bounds exclude: <glob>[, <glob>]" / "Design sources: <path>[, <path>]" / "Ticket budget: <digits, optional k or m suffix>" / "Parallel: 1|2|3" — label at line start, no formatting, value on the label's own line; "Release mode:"/"Run mode:" are not read at all): ${line.trim()}`)
    })
    // Dependencies. A `**Blocked by:**` line that will not parse, names a
    // ticket this epic does not have, or closes a cycle leaves its ticket
    // `waiting` for ever — the safe direction, and a silent one unless it is
    // said here. `next` refuses at the driver's door; this is where a human
    // planning the epic hears about it, with the line number.
    {
      const parsed = parseTickets(epic)
      const { problems, notes } = resolveDependencies(parsed)
      const lines = readFileSync(epic.ticketsDoc, 'utf8').split('\n')
      // The line a problem is about: the malformed one when that is the
      // problem (a ticket may carry a good line AND a bad one, and pointing at
      // the good one sends the reader to the wrong place), else the first
      // line that parsed. Fenced blocks are skipped, as the parser skips them.
      const lineOf = (id) => {
        let inTicket = false
        let fenced = false
        let firstValid = null
        for (let i = 0; i < lines.length; i++) {
          const h = lines[i].match(TICKET_HEADING)
          if (h) {
            inTicket = h[1] === id
            fenced = false
            continue
          }
          if (!inTicket) continue
          if (FENCE.test(lines[i])) fenced = !fenced
          if (fenced) continue
          const c = classifyBlockedBy(lines[i])
          if (c?.malformed) return i + 1
          if (c?.ids && firstValid === null) firstValid = i + 1
        }
        return firstValid
      }
      const at = (id) => (lineOf(id) ? `:${lineOf(id)}` : '')
      for (const [id, problem] of Object.entries(problems)) add('warn', `${epic.epic}/tickets.md${at(id)} — ${id} will wait for ever: ${problem}`)
      for (const [id, note] of Object.entries(notes)) if (!problems[id]) add('warn', `${epic.epic}/tickets.md${at(id)} — ${id} is ${note}`)
      // The removed graph's `Depends on` spelling is inert everywhere (see
      // DEPENDS_ON_LINE). The one place it is worth a sentence is an epic that
      // declares `Parallel:`, on a ticket that has not landed: there an unread
      // dependency is a ticket that may be started beside what it depends on.
      // A landed ticket's line is history, and a warn on it is noise.
      // Which lines sit inside a fence, per ticket section. `toggled` is what
      // the parser sees (a fence opens and closes as it goes); `closed` counts
      // only a fence that actually closes before the section ends — an
      // unclosed one swallows every later line of its section for the parser,
      // and the unread-line warn below is how a real line lost that way gets
      // said.
      const owner = []
      const toggled = []
      const closed = []
      {
        let current = null
        let open = -1
        lines.forEach((line, i) => {
          const h = line.match(TICKET_HEADING)
          if (h) {
            current = h[1]
            open = -1
          }
          owner[i] = current
          if (!h && FENCE.test(line)) {
            if (open < 0) open = i
            else {
              for (let k = open; k <= i; k++) closed[k] = true
              open = -1
            }
            toggled[i] = true
          } else toggled[i] = open >= 0
        })
      }
      lines.forEach((line, i) => {
        // Inside a fence that never closes, even the strict line is unread.
        const swallowed = toggled[i] && !closed[i] && !FENCE.test(line) && classifyBlockedBy(line)
        if (!owner[i] || closed[i] || !(swallowed || unreadBlockedBy(line))) return
        add(
          'warn',
          `${epic.epic}/tickets.md:${i + 1} — ${owner[i]} has a line that looks like a Blocked by line, and nothing reads it${toggled[i] ? ' (it sits after a code fence that never closes)' : ''}: "${line.trim()}". The line is read only as "**Blocked by:** <ID>[, <ID>]" opening a line at the margin — no bullet, no indent, no quote mark, bold with asterisks.` +
            (epic.parallel > 1 ? ` This epic declares "Parallel: ${epic.parallel}", where a ticket with no such line is declared independent: ${owner[i]} may be started beside the work this line names.` : ''),
        )
      })
      if (epic.parallel > 1) {
        let landed = null
        lines.forEach((line, i) => {
          const current = owner[i]
          const m = current && !toggled[i] && line.match(DEPENDS_ON_LINE)
          if (!m) return
          // "nothing" / "none" / "—" is a statement of independence, which is
          // what the absence of a Blocked by line already says. Status glyphs
          // a human appended to the value (`SEC-1 ✅`) are not part of it.
          const value = (m[1] ?? '').replace(/[\s*✅✓☑️❌⛔️🚧]+$/u, '').trim()
          if (!value || BLOCKED_BY_NOTHING.test(value)) return
          landed ??= new Set(board(epic.epic).tickets.filter((t) => LANDED.has(t.state)).map((t) => t.id))
          if (landed.has(current)) return
          add('warn', `${epic.epic}/tickets.md:${i + 1} — ${current} carries a "Depends on" line (${value}), which nothing reads: this epic declares "Parallel: ${epic.parallel}", so a parallel run may start ${current} beside the work it depends on. If it is a dependency, write it as "**Blocked by:** <ID>[, <ID>]" on a line of its own`)
        })
      }
      // Stated as what the line is FOR, not as what a run does today: the
      // declaration is parsed here and applied by the run driver.
      if (epic.parallel > 1 && epic.delivery !== 'release')
        add('warn', `${epic.epic}: "Parallel: ${epic.parallel}" is declared on an incremental epic — the line is for an unattended release run, the only lane with more than one ticket in flight, so it does nothing here`)
    }
    // A declared design source that is not there is the whole declaration
    // failing quietly: the line parses, every reader is handed a path, and
    // whoever opens it finds nothing — so the comparison it exists for is
    // never run and nobody is told why. Named by its full path, because a
    // path with spaces is exactly where a truncating reader would go wrong.
    for (const src of epic.designSources || []) {
      const abs = src.startsWith('/') ? src : join(repoRoot, src)
      if (!existsSync(abs))
        add('warn', `${epic.epic}: declared design source "${src}" does not exist (looked for ${abs}) — every reader of this epic is handed a path to nothing; fix the path, or drop it from the "Design sources:" line`)
    }
  }

  // The worker runner's environment, when an epic names one. `codex` must
  // run and be signed in before ticket one — the runner cannot sign in, and
  // a run that discovers this at its first ticket halts with nobody there.
  // Probed here so planning sees it (declaring the runner obligates the plan
  // to run doctor), the way branch protection is probed at planning time.
  // Codex's own conventions locate the credential: $CODEX_HOME, else
  // ~/.codex, holding auth.json; or OPENAI_API_KEY in the environment.
  for (const runner of new Set(epics.map((e) => e.workerRunner).filter(Boolean))) {
    if (runner === 'claude') continue
    if (runner !== 'codex') {
      add('warn', `unrecognised Worker runner "${runner}" (known: claude, codex) — the run driver refuses to start rather than substitute an implementer`)
      continue
    }
    const v = spawnSync('codex', ['--version'], { encoding: 'utf8', timeout: 15_000 })
    if (v.error || v.status !== 0)
      add('fail', `Worker runner: codex is declared but \`codex --version\` ${v.error ? `could not run (${v.error.code})` : `exited ${v.status}`} — install it (npm install -g @openai/codex) before an unattended run; the runner halts the first ticket without it`)
    else add('ok', `codex runner available: ${(v.stdout || '').trim()}`)
    const codexHome = process.env.CODEX_HOME || join(homedir(), '.codex')
    if (existsSync(join(codexHome, 'auth.json'))) add('ok', `codex signed in (${join(codexHome, 'auth.json')} exists)`)
    else if (process.env.OPENAI_API_KEY) add('ok', 'codex credential: OPENAI_API_KEY is set in this environment')
    else
      add('fail', `Worker runner: codex is declared but codex is not signed in — no ${join(codexHome, 'auth.json')} and no OPENAI_API_KEY; run \`codex login\` (or pipe a key into \`codex login --with-api-key\`) before an unattended run`)
  }

  const nearTicket = new RegExp(`^##\\s+[A-Za-z][A-Za-z0-9]*-\\d+`)
  const nearStatus = new RegExp(`^###\\s+[A-Za-z][A-Za-z0-9]*-\\d+`)
  for (const epic of epics) {
    // Commits on the epic branch that name neither a ticket nor the epic: the
    // shape nobody chose. A warn, never a fail — the work may be right; what
    // is missing is its record, and the repair is to write one, never to
    // rewrite history to add an ID.
    const bare = unticketedCommits(epic.epic).filter((c) => !c.epicLevel)
    if (bare.length) {
      const shown = bare.slice(0, 3).map((c) => `${c.sha} "${c.subject}"`).join(', ')
      add(
        'warn',
        `${epic.epic}: ${bare.length} commit${bare.length === 1 ? '' : 's'} on epic/${epic.epic} name${bare.length === 1 ? 's' : ''} no ticket and touch${bare.length === 1 ? 'es' : ''} code outside epics/ — ${shown}${bare.length > 3 ? `, and ${bare.length - 3} more` : ''}. Work there reaches no status entry, no spend line and no reviewer. Record it: add a ticket to ${epic.epic}/tickets.md with a status entry for what was done, or run a one-off through /flow:quick; work that belongs to the epic as a whole (a release review's fixes) is subjected "${epic.epic}: …", which is listed on the board and not warned about. Never rewrite pushed history to add an ID`,
      )
    }
    readFileSync(epic.ticketsDoc, 'utf8').split('\n').forEach((line, i) => {
      if (nearTicket.test(line) && !TICKET_HEADING.test(line))
        add('warn', `${epic.epic}/tickets.md:${i + 1} — heading will not parse as a ticket (needs "## <ID> — <name>", ID uppercase): ${line.trim()}`)
    })
    // A CHECK that almost parses never runs, and the ticket then passes its
    // acceptance gate on silence — the same failure class as a heading
    // near-miss, flagged the same way. The same scan carries the shapes that
    // do parse and run yet can never pass, because a criterion that cannot
    // come out green lies in exactly the same direction.
    for (const t of parseTickets(epic))
      for (const p of parseChecks(t.body, epic.designSources).problems)
        add('warn', `${epic.epic}/tickets.md (${t.id}) — ${p.why}: ${p.text}`)
    if (!epic.statusDoc) {
      // Two doors create this file — /flow:epic at sign-off, or the first
      // ticket's status entry (ticket step 6 via /flow:ticket, or in-session
      // by /flow:quick, which never runs /flow:epic). Name both, and name
      // each as a command the reader can run — or the hint advertises a
      // recovery unreachable from the state that triggers it (Q-16).
      add('warn', `${epic.epic}: no status.md — created at sign-off by /flow:epic, or by the first ticket's status entry (/flow:ticket <ID>, or in-session by /flow:quick); without it DONE/BLOCKED are invisible`)
    } else {
      readFileSync(epic.statusDoc, 'utf8').split('\n').forEach((line, i) => {
        if (!nearStatus.test(line)) return
        const m = line.match(STATUS_HEADING)
        if (!m)
          add('warn', `${epic.epic}/status.md:${i + 1} — heading will not parse, so this ticket reads as not done (needs "### <ID> — <name> — YYYY-MM-DD — DONE|BLOCKED|ABANDONED"): ${line.trim()}`)
        else if (!KNOWN_OUTCOMES.has(m[4]))
          add('warn', `${epic.epic}/status.md:${i + 1} — unknown outcome "${m[4]}" is ignored by the board (known: DONE, BLOCKED, ABANDONED)`)
      })
      // A deviation line that almost parses reads as absent, and the departure
      // stays prose no command sees — which is the exact failure the field
      // exists to end, reintroduced one typo at a time. The singular opener
      // and the plural closer make `**Deviation closed:**` the likeliest slip,
      // and a closing line with no leading ID closes nothing while reading
      // like a closure. Scanned only inside a parsed entry: a log's preamble
      // and its baseline notes discuss these labels in prose, and a warning
      // that fires on prose about the field can never be cleared.
      let inEntry = false
      readFileSync(epic.statusDoc, 'utf8').split('\n').forEach((line, i) => {
        if (line.startsWith('#')) inEntry = STATUS_HEADING.test(line)
        if (!inEntry || !DEVIATION_NEAR.test(line) || DEVIATION_STRICT(line)) return
        add('warn', `${epic.epic}/status.md:${i + 1} — looks like a deviation line but will not parse, so the departure it records reaches no brief and no gate (needs "**Deviation:** <what the documents showed → what was built, and why>" at line start, or "**Deviations closed:** <ID>[, <ID>] — <each named as accepted or as fixed>" whose LEADING IDs name the entries it closes): ${line.trim()}`)
      })
      // A marker that retired nothing is silent at its author's door: the
      // brief that would say so is read by the next worker, not by the
      // session that wrote the line. Flagged here, where the writer looks.
      for (const n of parseOwed(epic).notes) add('warn', `${epic.epic}/status.md — ${n}`)
      // A role's figure written twice in one entry with no round label and no
      // correction between: spend keeps the last, which is right for a
      // correction and wrong for a second review round. Ask, never guess.
      const fmt = (n) => n.toLocaleString('en-US')
      for (const r of Object.values(parseSpend(epic))) {
        for (const rep of r.repeats)
          add(
            'warn',
            `${epic.epic}/status.md (${r.id}) — ${rep.figures.length} unlabelled ${rep.role} figures in one entry (${rep.figures.map(fmt).join(', ')}) and no correction addendum between them: spend counts only the last, ${fmt(rep.figures[rep.figures.length - 1])}, where review rounds would total ${fmt(rep.figures.reduce((x, y) => x + y, 0))}. If they are rounds, append a dated addendum restating them with labels — "round=1 ${rep.role}=<n> … round=2 ${rep.role}=<n> …" — which spend sums; if the later one corrects the earlier, say so in a dated "Addendum — correction" between them. Never edit the entry`,
          )
        if (r.mixed.length)
          add('warn', `${epic.epic} (${r.id}) — ${r.mixed.join(', ')} carr${r.mixed.length === 1 ? 'ies' : 'y'} both round-labelled and unlabelled figures; spend counts the labelled rounds' sum and ignores the unlabelled figure`)
      }
      // And a closing line that closed nothing, flagged at the same door for
      // the same reason: the brief that reports it is read by the next worker,
      // not by the human who wrote the line, and only that human can repair it.
      for (const n of parseDeviations(epic).notes) add('warn', `${epic.epic}/status.md — ${n.note}`)
    }
    // The run-record scans below run whether or not status.md exists — an epic
    // whose records are split out has a runs.md to check either way, and the
    // early `continue` that used to sit here skipped it silently.
    // Run records are read from runs.md and from status.md (where every log
    // written before the split keeps them), so both files get the run-record
    // scans — a record flagged in only one of them would be a gate at a door
    // its writer no longer walks through.
    // Which tickets have time anywhere in the ledger — an `unknown` counts, it
    // is an answer — so a stray time figure warns only while its ticket has
    // none, and the addendum that gives it some ends the warn.
    const timed = new Set(
      Object.values(parseSpend(epic))
        .filter((r) => Object.keys(r.time.figures).length || r.time.unknown.size)
        .map((r) => r.id),
    )
    for (const doc of [epic.statusDoc, epic.runsDoc].filter(Boolean)) {
      const name = basename(doc)
      // A run heading that almost parses — a missing date, a qualifier outside
      // its parentheses — starts no run region, so its Tokens groups land in
      // whatever region precedes it, and a ticket entry's region would take
      // them as its own figures.
      readFileSync(doc, 'utf8').split('\n').forEach((line, i) => {
        // A ticket entry whose ID starts with "RUN" (RUN-1 — …) is a status
        // heading, not a run heading that almost parses.
        if (/^###\s+Run\b/i.test(line) && !RUN_HEADING.test(line) && !STATUS_HEADING.test(line))
          add('warn', `${epic.epic}/${name}:${i + 1} — run heading will not parse, so spend reads no groups from this record (needs "### Run — YYYY-MM-DD — completed|halted", an optional "(qualifier)" after the date): ${line.trim()}`)
      })
      // A run record's Tokens line written as prose reads as nothing: every
      // ticket that points at the record then reports "no figure recorded",
      // which is indistinguishable from a run nobody measured.
      for (const miss of runRecordNearMisses(doc, timed))
        if (miss.kind === 'time-shape')
          add('warn', `${epic.epic}/${name}:${miss.line} — the run record's Time line carries figures but no machine-shaped group, so spend reads no time from it (needs "<ID> worker=<n>s reviewer=<n>s disposition=<n>s re-review=<n>s proxies=<n>s wall=<n>s" per ticket — seconds, each with its "s" — "unknown" for any missing figure; \`scripts/meter.mjs <workflow-run-dir>\` prints the line); repair by appending a dated addendum beneath the record with the groups under its own "**Time:**" line — never by editing the record: ${miss.heading}`)
        else if (miss.kind === 'time-stray')
          add('warn', `${epic.epic}/${name}:${miss.line} — a time figure here was read by nothing${miss.ids.length ? `, and ${miss.ids.join(', ')} ${miss.ids.length === 1 ? 'has' : 'have'} no time anywhere in the ledger` : ', and no Time group parses in this run record'}: time is read from "<ID> worker=<n>s … wall=<n>s" groups inside a paragraph that starts "**Time:**" (to the next blank line or bold label) — seconds with their "s" and no commas ("1,430s" is not machine-shaped). Repair by appending a dated addendum beneath the record with the groups under a "**Time:**" line of its own — never by editing the record: ${miss.heading}`)
        else add('warn', `${epic.epic}/${name}:${miss.line} — the run record's Tokens line carries figures but no machine-shaped group, so spend reads nothing from it (needs "<ID> worker=<n> reviewer=<n> disposition=<n> re-review=<n> proxies=<n>" per ticket, "unknown" for any missing figure); repair by appending a dated addendum beneath the record restating the figures as groups — never by editing the record: ${miss.heading}`)
    }
    // Once an epic has a runs.md, a run record appended to status.md puts the
    // two writers back on one file tail — the conflict the split ended. The
    // flag is date-scoped to records written after the split, because the
    // older ones are forbidden to move: an append-only log is never rewritten,
    // and a warning whose only recovery is forbidden is worse than none.
    if (epic.statusDoc && epic.runsDoc) {
      const runRecords = runRecordHeadings(epic.runsDoc)
      const split = runRecords[0]
      if (!split)
        // With no parseable record in runs.md there is no split date, so the
        // scan below silently checks nothing — and a record that reaches
        // status.md from here on is never flagged. Say so: the file exists, so
        // the epic has split, and the first record's own heading is what dates
        // the split.
        add(
          'warn',
          `${epic.epic}/runs.md carries no parseable run record, so nothing dates the split and a run record misfiled into status.md cannot be flagged (needs "### Run — YYYY-MM-DD — completed|halted", an optional "(qualifier)" after the date); if a record is in there with a heading that will not parse, repair it the way every other record is repaired — a dated addendum beneath it, never an edit`,
        )
      else {
        // A record whose heading is already in runs.md is a repaired one: the
        // advertised recovery is to append it there and leave the committed
        // status.md copy alone, so re-flagging it would be a warning that can
        // never be cleared.
        const repaired = new Set(runRecords.map((r) => r.heading))
        // Strictly after: a date carries no time, so a record written on the
        // split day itself may well predate the first record in runs.md, and a
        // warning whose repair is forbidden (the record may not move) must not
        // fire on a record that never misbehaved.
        for (const r of runRecordHeadings(epic.statusDoc).filter((r) => r.date > split.date && !repaired.has(r.heading)))
          add(
            'warn',
            `${epic.epic}/status.md:${r.line} — this run record (dated ${r.date}) sits in status.md, but this epic's run records live in runs.md from ${split.date} on, and appending them beside the ticket entries is the two-writers conflict the split ended; repair by appending the record to runs.md and, when the status.md copy is already committed, a dated addendum beneath it naming where the record now lives — never by deleting it, and records dated ${split.date} or earlier stay where they are and are read there: ${r.heading}`,
          )
      }
    }
  }

  const seen = {}
  for (const epic of epics) for (const t of parseTickets(epic)) (seen[t.id] ||= []).push(epic.epic)
  for (const [dupId, dupEpics] of Object.entries(seen).filter(([, es]) => es.length > 1))
    add('fail', `duplicate ticket ID ${dupId} — defined in: ${dupEpics.join(', ')}; find refuses ambiguous IDs`)

  return rows
}

// ── entry point ──────────────────────────────────────────────────────────────

const argv = process.argv.slice(2)
// `--from <ref>` takes a value, so its pair is extracted before the positional
// filter — otherwise the ref (which does not start with "--") would be read as
// the command's positional argument.
const fromIdx = argv.indexOf('--from')
const fromRef = fromIdx !== -1 ? argv[fromIdx + 1] ?? null : null
if (fromIdx !== -1) argv.splice(fromIdx, 2)
// `--log-from <ref>` is deliberately a different flag on a different command:
// `--from` reads the epic's DECLARATIONS as signed off, `--log-from` reads the
// STATUS LOG off a pushed ticket branch, and the two answer opposite questions
// about opposite refs. One flag serving both would hand a low-effort reader two
// payloads with the same field names — and swapped, either a deviation gate
// reads a document that records none, or a ticket branch sets the budget
// ceiling that judges it. Extracted after --from so the index is fresh.
// A following flag is not a ref: `--log-from --json` is a missing value, which
// the subcommand refuses with its usage, rather than a ref named "--json" whose
// unreadable-ref error would send the reader hunting for a branch.
const logFromIdx = argv.indexOf('--log-from')
const logFromNext = logFromIdx === -1 ? undefined : argv[logFromIdx + 1]
const logFromRef = logFromNext && !logFromNext.startsWith('--') ? logFromNext : null
if (logFromIdx !== -1) argv.splice(logFromIdx, logFromRef ? 2 : 1)
const json = argv.includes('--json')
const [cmd, arg] = argv.filter((a) => !a.startsWith('--'))
const emit = (o) => console.log(JSON.stringify(o, null, 2))

// An unknown epic filter is an error, everywhere: a typo'd name that prints
// "nothing left to start" (or an empty JSON payload) is indistinguishable from
// a finished epic. One rule, `next` and `list`, plain and --json alike — the
// --json forms emit no payload on this error (BOARD-2).
function requireKnownEpic(data, epicFilter) {
  if (epicFilter && !data.epics.length) {
    console.error(`no epic "${epicFilter}" under epics/`)
    process.exit(1)
  }
}

// The status log a per-ticket report reads: the working tree's, or the log as
// a git ref carries it under `--log-from` — the pushed ticket branch is where
// a worker writes its entry, and a reader on the checkout would read a log
// that has not moved. One reader for every such report, because the rule it
// enforces has to hold at every door: a log that cannot be read is a nonzero
// exit naming the reason, NEVER an empty answer. `what` is the empty answer
// this report would otherwise give ("no deviations", "no comparison"), quoted
// back so the refusal says what it is refusing to claim.
function readStatusLog(epic, rel, logFromRef, what) {
  if (logFromRef) {
    const shown = git(['show', `${logFromRef}:${rel}`], { allowFail: true })
    if (shown === null) {
      console.error(
        `tickets: cannot read ${rel} from ref "${logFromRef}" — fetch the ref, or check its name. ` +
          `An unreadable status log is not "${what}".`,
      )
      process.exit(1)
    }
    return shown
  }
  if (!epic.statusDoc) {
    console.error(
      `tickets: no status log at ${join(epic.dir, 'status.md')} — an absent log is not "${what}". ` +
        "It is created at sign-off by /flow:epic, or by the first ticket's status entry; " +
        'to read a log that exists only on a pushed branch, pass --log-from <ref>.',
    )
    process.exit(1)
  }
  return readFileSync(epic.statusDoc, 'utf8')
}

// The `**Compared:**` lines under one ticket's OWN entries — the fidelity
// table a COMPARE criterion obliges, counted rather than judged. The narrowing
// is the check: a status log is append-only and a ticket branch carries every
// earlier ticket's entries too, all of them able to carry the same field, so a
// count over the whole file would let a predecessor's table answer for this
// ticket. Every heading closes the region, which is what the driver's own
// `awk '/^### /{f=/^### <ID> /} f'` does, so an entry's addenda count and the
// next entry's do not.
function comparedIn(text, id) {
  const found = []
  let entry = null
  text.split('\n').forEach((line, i) => {
    if (/^#{1,6}\s/.test(line)) {
      const m = line.match(STATUS_HEADING)
      entry = m ? m[1] : null
      return
    }
    if (entry === id && /^\*\*Compared:\*\*/.test(line)) found.push({ line: i + 1, text: line.slice('**Compared:**'.length).trim() })
  })
  return found
}

// Resolve an ID against the board, with find's refusals: an ambiguous ID and
// an unknown ID both exit 1 with the message naming what is known. `brief`
// shares this path so its refusals stay verbatim find's — one behaviour, not
// two copies drifting apart.
function resolveTicket(data, id) {
  if (data.duplicates[id]) {
    console.error(
      `tickets: "${id}" is defined in more than one epic (${data.duplicates[id].join(', ')}). ` +
        'IDs must be unique across epics — rename one before running the ticket.',
    )
    process.exit(1)
  }
  const t = data.byId[id]
  if (!t) {
    console.error(`tickets: no ticket "${id}". Known IDs: ${data.tickets.map((x) => x.id).join(', ') || '(none)'}`)
    process.exit(1)
  }
  return t
}

// The derived facts for one resolved ticket — the exact payload `find --json`
// emits (the unattended driver reads it between tickets; its shape is
// contract).
function ticketFacts(data, t) {
  const epic = data.epics.find((e) => e.epic === t.epic)
  // Absolute paths, always. The caller may be anywhere in the tree — a skill
  // that has just run `cd api-gateway` still has to open these, and the Read
  // tool takes absolute paths anyway.
  return {
    id: t.id,
    title: t.title,
    epic: t.epic,
    state: t.state,
    branch: t.branch,
    delivery: epic.delivery,
    reviewerModel: epic.reviewerModel,
    workerModel: epic.workerModel,
    workerRunner: epic.workerRunner,
    shadowReviewer: epic.shadowReviewer,
    plannerModel: epic.plannerModel,
    consequencePaths: epic.consequencePaths,
    fixBoundsExclude: epic.fixBoundsExclude,
    designSources: epic.designSources,
    ticketBudget: epic.ticketBudget,
    parallel: epic.parallel,
    // The plan's statement about order: what this ticket is blocked by, what
    // of that has not landed yet, and the problem sentence when its line
    // cannot be read. `state` is "waiting" while either holds and the ticket
    // is unstarted — the door a lane checks before it branches.
    blockedBy: t.blockedBy,
    waitingOn: t.waitingOn,
    dependencyProblem: t.dependencyProblem,
    repoRoot,
    epicDir: epic.dir,
    ticketsDoc: epic.ticketsDoc,
    statusDoc: epic.statusDoc || join(epic.dir, 'status.md'),
    statusDocExists: Boolean(epic.statusDoc),
    // Where run records go. The path is always given — the run skill creates
    // the file with its preamble on the first record — and the flag says
    // whether it is there yet, so a caller never has to guess either.
    runsDoc: epic.runsDoc || join(epic.dir, 'runs.md'),
    runsDocExists: Boolean(epic.runsDoc),
    // The design map's absolute path when the epic has one, else null. A
    // working-tree fact like every other path here, and so untouched by
    // `--from`: the declarations come from the ref, the paths describe the
    // repository as it is now.
    designMap: epic.designMap,
    contextDir: epic.contextDir,
    isCurrentFolderEpic: data.current?.epic === t.epic,
    pr: t.pr || null,
  }
}

switch (cmd) {
  case 'epics': {
    const epics = discoverEpics()
    if (json) emit(epics.map((e) => ({ ...e, repoRoot, isCurrent: currentEpic(epics)?.epic === e.epic })))
    else if (!epics.length) console.log('no epics found under epics/')
    else for (const e of epics) console.log(`${e.epic.padEnd(20)} ${e.ticketsDoc}`)
    break
  }

  case 'current': {
    const epic = currentEpic(discoverEpics())
    if (json) emit(epic ? { ...epic, repoRoot } : null)
    else if (!epic) console.log(`this folder (${basename(repoRoot)}) is not an epic folder`)
    else console.log(epic.epic)
    break
  }

  case 'find': {
    if (!arg) {
      console.error('usage: tickets.mjs find <ID> [--json] [--from <ref>]')
      process.exit(2)
    }
    if (fromIdx !== -1 && !fromRef) {
      console.error('tickets: --from needs a git ref (e.g. --from origin/epic/<name>)')
      process.exit(2)
    }
    const data = board(null)
    const t = resolveTicket(data, arg.toUpperCase())
    const out = ticketFacts(data, t)
    if (fromRef) {
      // `--from <ref>` reads the epic's DECLARATIONS from that ref instead of
      // the working tree — the same move `check --from` makes on the criteria,
      // and for the same reason: the party under review must not be able to
      // edit the terms it is judged by. The run driver reads the ticket
      // budget this way, from `origin/epic/<name>`, so a ticket branch's own
      // copy of the preamble cannot raise the ceiling that judges it.
      // Everything else `find` reports — the branch, the board state, the
      // paths — describes the repository as it is now and is untouched.
      const rel = `epics/${t.epic}/tickets.md`
      const shown = git(['show', `${fromRef}:${rel}`], { allowFail: true })
      if (shown === null) {
        console.error(`tickets: cannot read ${rel} from ref "${fromRef}" — fetch the ref, or check its name`)
        process.exit(1)
      }
      // `from` appears only under `--from`: the default shape is what every
      // installed consumer of `find --json` reads, and a permanent "from null"
      // row in the human listing buys nothing.
      Object.assign(out, parsePreambleText(shown), { from: fromRef })
    }
    if (json) emit(out)
    else
      for (const [k, v] of Object.entries(out)) {
        // pr is the one non-scalar fact: raw interpolation printed
        // "pr [object Object]" (BOARD-3's review, Q-9). Render what a human
        // acts on — number, state, URL. --json is untouched.
        const shown = k === 'pr' && v ? `#${v.number} (${v.state}) ${v.url}` : v
        console.log(`${k.padEnd(22)} ${shown}`)
      }
    break
  }

  case 'brief': {
    // The next-ticket brief: everything a session needs to start a ticket —
    // the full section from the epic's tickets.md (Scope, Not in scope,
    // Acceptance criteria), the epic preamble (ground rules, ordering, the
    // delivery), the log's owed items not yet marked resolved, and the
    // derived facts `find` reports — without opening the ticket doc or
    // rereading the whole status log. The brief exists to make a worker's
    // required reading O(epic), not O(history). With no ID, brief the first
    // startable ticket in document order: the same one Next up proposes.
    const data = board(null)
    let t
    if (arg) {
      t = resolveTicket(data, arg.toUpperCase())
    } else {
      t = data.tickets.find((x) => x.state === 'todo')
      if (!t) {
        if (json) emit(null)
        else console.log('nothing left to start')
        break
      }
    }
    const epic = data.epics.find((e) => e.epic === t.epic)
    const { owed, notes } = parseOwed(epic)
    const dev = parseDeviations(epic)
    const out = {
      ...ticketFacts(data, t),
      preamble: readFileSync(epic.ticketsDoc, 'utf8').split(/^##\s/m)[0].trim(),
      owed,
      notes,
      // Open deviations only, epic-wide, beside the owed items: a departure no
      // human has closed is a decision still outstanding, and the next worker
      // is who would otherwise build on it unknowingly. A closed one is
      // settled and stops travelling — `deviations <ID>` is where every one of
      // a ticket's own, closed or not, is read. The notes ride beside them for
      // the same reason the owed notes ride beside the owed items: a closing
      // line that closed nothing leaves a departure open, and the worker
      // reading this brief is who would otherwise build on it unknowingly.
      deviations: dev.deviations.filter((d) => !d.closed),
      deviationNotes: dev.notes.map((n) => n.note),
      body: t.body,
    }
    if (json) emit(out)
    else {
      console.log(`${C.bold}${out.id} — ${out.title}${C.off}`)
      console.log(
        `${C.dim}epic ${out.epic} · state ${out.state} · branch ${out.branch} · delivery ${out.delivery}` +
          (out.pr ? ` · PR #${out.pr.number} (${out.pr.state})` : '') +
          C.off,
      )
      // Said before anything else a worker reads: a brief is what a lane opens
      // on its way to starting the ticket.
      if (out.blockedBy.length || out.dependencyProblem)
        console.log(
          out.state === 'waiting'
            ? `${C.yellow}${waitingReason(t, data.byId)} — do not start it${C.off}`
            : `${C.dim}blocked by ${out.blockedBy.join(', ')}${out.waitingOn.length ? ` — ${out.waitingOn.join(', ')} not landed` : ' — all landed'}${C.off}`,
        )
      console.log()
      console.log(`${C.bold}Epic preamble${C.off}`)
      console.log(out.preamble)
      console.log()
      console.log(`${C.bold}Owed items — recorded, not marked resolved${C.off}`)
      if (!out.owed.length) console.log(`${C.dim}none outstanding${C.off}`)
      else {
        let lead = null
        for (const o of out.owed) {
          // The lead-in prints once above the items it introduces — it is
          // usually where the entry named the carrier.
          if (o.lead && o.lead !== lead) console.log(`  ${C.dim}${o.lead}${C.off}`)
          lead = o.lead || null
          console.log(`  ${o.id} (${o.date}): ${o.text}`)
        }
      }
      for (const n of out.notes) console.log(`  ${C.yellow}note:${C.off} ${n}`)
      console.log()
      console.log(`${C.bold}Deviations — recorded, not yet closed by a human${C.off}`)
      // "none outstanding" means nothing is outstanding, so it is not printed
      // above a note saying a closing line closed nothing.
      if (!out.deviations.length && !out.deviationNotes.length) console.log(`${C.dim}none outstanding${C.off}`)
      else for (const d of out.deviations) console.log(`  ${d.item} (${d.recorded}): ${d.text}`)
      for (const n of out.deviationNotes) console.log(`  ${C.yellow}note:${C.off} ${n}`)
      console.log()
      console.log(`${C.bold}Ticket${C.off}`)
      console.log(out.body)
    }
    break
  }

  case 'owed': {
    // The epic-wide list `brief` already shows beside one ticket, on its own:
    // what a release pull request's `## Owed` section is pasted from. A body
    // that says "nothing owed" has to be one a command printed — one live
    // release said it against 31 open items, because the session that opened
    // it was recalling, not reading.
    const known = discoverEpics()
    const epic = known.find((e) => e.epic === arg)
    if (!epic) {
      console.error(
        arg
          ? `no epic "${arg}" under epics/ — known epics: ${known.map((e) => e.epic).join(', ') || '(none)'}`
          : `owed needs an epic: tickets.mjs owed <epic> — known epics: ${known.map((e) => e.epic).join(', ') || '(none)'}`,
      )
      process.exit(1)
    }
    const { owed, notes } = parseOwed(epic)
    if (json) emit({ epic: epic.epic, count: owed.length, owed, notes })
    else {
      console.log(`${C.bold}Owed — ${epic.epic}: recorded, not marked resolved${C.off}`)
      if (!owed.length) console.log('none outstanding')
      else {
        let lead = null
        for (const o of owed) {
          if (o.lead && o.lead !== lead) console.log(`  ${C.dim}${o.lead}${C.off}`)
          lead = o.lead || null
          console.log(`  ${o.id} (${o.date}): ${o.text}`)
        }
      }
      for (const n of notes) console.log(`  ${C.yellow}note:${C.off} ${n}`)
    }
    break
  }

  case 'deviations': {
    // Every deviation one ticket's own entries recorded — closed or not, each
    // with its closing line when it has one. Two readers, one read: an
    // unattended gate counts them all and ignores `closed`, because nobody
    // present in such a run could have written a closing line; an attended
    // door filters on `closed` and shows the rest with their line, so a
    // closure the party under review could have written is seen rather than
    // trusted.
    //
    // `--log-from <ref>` reads the status log from that ref instead of the
    // working tree — the pushed ticket branch is where a worker writes its
    // entry, and a driver reading the checkout would read a log that has not
    // moved. A log that cannot be read is a nonzero exit naming the reason,
    // never an empty list: an unreadable fact must not read as "no
    // deviations", which is the one direction this report can lie in.
    if (!arg) {
      console.error('usage: tickets.mjs deviations <ID> [--json] [--log-from <ref>]')
      process.exit(2)
    }
    if (logFromIdx !== -1 && !logFromRef) {
      console.error('tickets: --log-from needs a git ref (e.g. --log-from origin/<ticket-branch>)')
      process.exit(2)
    }
    const data = board(null)
    const t = resolveTicket(data, arg.toUpperCase())
    const epic = data.epics.find((e) => e.epic === t.epic)
    const rel = `epics/${t.epic}/status.md`
    const text = readStatusLog(epic, rel, logFromRef, 'no deviations')
    // This ticket's own entries only — an ID heads its entry, and a departure
    // another ticket recorded is that ticket's to answer for. The notes are
    // filtered the same way and for the same reason: a closing line that closed
    // nothing is this ticket's to repair.
    const parsed = parseDeviationsText(text)
    const found = parsed.deviations.filter((d) => d.entry === t.id)
    const deviationNotes = parsed.notes.filter((n) => n.entry === t.id).map((n) => n.note)
    const open = found.filter((d) => !d.closed)
    // No field name here is one `find --json` emits. The two payloads describe
    // different refs and different questions, and a reader that mistook one for
    // the other would report a gate's answer from the wrong document.
    if (json)
      emit({
        ticket: t.id,
        epicName: t.epic,
        logPath: logFromRef ? rel : epic.statusDoc,
        logFrom: logFromRef,
        count: found.length,
        open: open.length,
        deviations: found,
        notes: deviationNotes,
      })
    else {
      const where = logFromRef ? `${rel} at ${logFromRef}` : epic.statusDoc
      console.log(
        `${C.bold}${t.id}${C.off} ${C.dim}— ${t.epic} — ${where}${C.off}\n` +
          `${found.length} recorded, ${open.length} not yet closed by a human`,
      )
      for (const d of found) {
        console.log(`${d.closed ? `${C.green}closed${C.off}` : `${C.yellow}open  ${C.off}`}  ${d.item} (${d.recorded}): ${d.text}`)
        if (d.closed) console.log(`        ${C.dim}closed by: ${d.closedBy}${C.off}`)
      }
      for (const n of deviationNotes) console.log(`${C.yellow}note:${C.off} ${n}`)
    }
    break
  }

  case 'compared': {
    // How many `**Compared:**` fields one ticket's own entries record — the
    // fidelity table a `COMPARE:` criterion obliges. It lives here, in the
    // script, and not as a `grep` inside the driver's prompt: `run-epic.mjs`
    // stubs every agent in its suite, so a counting pipeline written into a
    // template literal is executed by no test, and a mis-escaped `\*\*` would
    // first show itself as a count of 0 on a live run — which reads exactly
    // like a ticket that recorded no comparison, and merges it.
    //
    // This counts; it never judges. Whether the table is right is the
    // reviewer's, who can re-run the differ; whether a missing one stops a
    // merge is the driver's gate and the attended doors'. And, like
    // `deviations`, a log it cannot read is a nonzero exit and never a count
    // of 0: "unreadable" and "none recorded" must not arrive as one number.
    if (!arg) {
      console.error('usage: tickets.mjs compared <ID> [--json] [--log-from <ref>]')
      process.exit(2)
    }
    if (logFromIdx !== -1 && !logFromRef) {
      console.error('tickets: --log-from needs a git ref (e.g. --log-from origin/<ticket-branch>)')
      process.exit(2)
    }
    const data = board(null)
    const t = resolveTicket(data, arg.toUpperCase())
    const epic = data.epics.find((e) => e.epic === t.epic)
    const rel = `epics/${t.epic}/status.md`
    const text = readStatusLog(epic, rel, logFromRef, 'no comparison')
    const found = comparedIn(text, t.id)
    if (json)
      emit({
        ticket: t.id,
        epicName: t.epic,
        logPath: logFromRef ? rel : epic.statusDoc,
        logFrom: logFromRef,
        compared: found.length,
        tables: found,
      })
    else {
      const where = logFromRef ? `${rel} at ${logFromRef}` : epic.statusDoc
      console.log(`${C.bold}${t.id}${C.off} ${C.dim}— ${t.epic} — ${where}${C.off}\n${found.length} \`**Compared:**\` field(s) recorded`)
      for (const f of found) console.log(`  line ${f.line}: ${f.text.slice(0, 200) || '(the table follows on the next lines)'}`)
    }
    break
  }

  case 'check': {
    // Run a ticket's machine-runnable acceptance criteria — the CHECK/EXPECT
    // lines — and report the ledger. Exit 0 only when every check passed and
    // the criteria parsed cleanly; a malformed CHECK is a failing gate, not a
    // skipped one, because a gate that silently skips is how a criterion gets
    // satisfied by narration. `--from <ref>` reads the criteria from that git
    // ref instead of the working tree: the unattended driver passes
    // `--from origin/epic/<name>` so the gate judges against the signed-off
    // document — the party under review cannot soften its own EXPECT by
    // editing the copy riding its branch.
    if (!arg) {
      console.error('usage: tickets.mjs check <ID> [--json] [--from <ref>]')
      process.exit(2)
    }
    if (fromIdx !== -1 && !fromRef) {
      console.error('tickets: --from needs a git ref (e.g. --from origin/epic/<name>)')
      process.exit(2)
    }
    const data = board(null)
    const t = resolveTicket(data, arg.toUpperCase())
    const epic = data.epics.find((e) => e.epic === t.epic)
    let body = t.body
    // A COMPARE is validated against the epic's declared design sources, so
    // under `--from` those come from the same ref as the criteria: the gate
    // judges one document, not a criterion from the signed-off copy against a
    // declaration the branch under review edited.
    let designSources = epic.designSources
    if (fromRef) {
      const rel = `epics/${t.epic}/tickets.md`
      const shown = git(['show', `${fromRef}:${rel}`], { allowFail: true })
      if (shown === null) {
        console.error(`tickets: cannot read ${rel} from ref "${fromRef}" — fetch the ref, or check its name`)
        process.exit(1)
      }
      const section = parseTicketSections(shown, t.epic).find((s) => s.id === t.id)
      if (!section) {
        console.error(`tickets: ticket ${t.id} has no section in ${rel} at "${fromRef}" — the document at that ref does not know this ticket`)
        process.exit(1)
      }
      body = section.body
      designSources = parsePreambleText(shown).designSources
    }
    const { checks, compares, problems } = parseChecks(body, designSources)
    const results = runChecks(checks)
    const passed = results.filter((r) => r.passed).length
    const skipped = results.filter((r) => r.status === 'skipped').length
    const allPassed = passed === results.length && !problems.length
    // Comparisons ride their own list and are counted in NEITHER `total` nor
    // `passed`. This script has no browser and never runs one — and the
    // unattended driver halts when `passed !== total`, so a compare counted
    // there would halt every COMPARE ticket. What gates them is the presence
    // of the `**Compared:**` table in the ticket's status entry, which is a
    // different door and a different ticket's gate.
    const comparisons = compares.map((c, i) => ({
      n: i + 1,
      criterion: c.criterion,
      compare: c.compare,
      source: c.source,
      widths: c.widths,
      landmarks: c.landmarks,
      status: 'manual',
      note: 'manual — run the differ, table required in the entry',
    }))
    if (json) {
      emit({ id: t.id, epic: t.epic, from: fromRef, total: results.length, passed, skipped, allPassed, checks: results, compares: comparisons, problems })
    } else {
      if (fromRef) console.log(`${C.dim}criteria read from ${fromRef}${C.off}`)
      if (!results.length && !problems.length && !comparisons.length) console.log(`no CHECK criteria in ${t.id} — nothing to run`)
      const MARK = { passed: `${C.green}✓${C.off}`, skipped: `${C.yellow}↓${C.off}`, failed: `${C.red}✗${C.off}` }
      for (const r of results) {
        console.log(`${MARK[r.status]} ${r.n}/${results.length} ${r.criterion || '(no criterion bullet above the CHECK line)'}`)
        console.log(`    $ ${r.check}`)
        console.log(`    ${r.evidence}`)
        // A skip is named where it is read, not left to a reader who knows the
        // runner's glyphs — and the line says which of the two repairs it is,
        // so nobody debugs working code.
        if (r.status === 'skipped')
          console.log(
            `    ${C.yellow}the evidence is a skip: the named work did not run, so this criterion is not passed. Give the command what the run needed (a database, a credential, a service), or point EXPECT at a line that proves it ran.${C.off}`,
          )
      }
      for (const c of comparisons) {
        console.log(`${C.cyan}⊙${C.off} ${c.n}/${comparisons.length} ${c.criterion || '(no criterion bullet above the COMPARE line)'}`)
        console.log(`    COMPARE: ${c.compare}${c.landmarks ? `\n    LANDMARKS: ${c.landmarks.join(', ')}` : '  (every landmark in the map — the whole page)'}`)
        console.log(`    ${C.cyan}${c.note}${C.off}`)
      }
      for (const p of problems) console.log(`${C.red}!${C.off} line ${p.line}: ${p.why}: ${p.text}`)
      if (results.length || problems.length || comparisons.length)
        console.log(
          `${passed}/${results.length} checks passed` +
            (skipped ? ` — ${skipped} skipped, which does not pass the gate` : '') +
            (comparisons.length
              ? ` — ${comparisons.length} comparison(s) this script never runs, counted in neither total nor passed; the differ is run by hand and its table belongs in the status entry`
              : '') +
            (problems.length ? ` — ${problems.length} malformed line(s), which fail the gate` : ''),
        )
    }
    process.exit(allPassed ? 0 : 1)
  }

  case 'next': {
    const data = board(arg || null)
    requireKnownEpic(data, arg)
    // Startable means unstarted AND not waiting: a ticket whose blockers have
    // not landed is left out, so a lane that takes the first of this list —
    // or, in a parallel run, the first few — can never overtake the plan.
    const open = data.tickets.filter((t) => t.state === 'todo')
    const waiting = data.tickets.filter((t) => t.state === 'waiting')
    // The refusal lives here because this is the command the run driver runs
    // between tickets: an empty list means "the epic is built, open the
    // release", and with tickets still waiting that would release an epic
    // with work unbuilt. So empty-with-waiting is an ERROR, with the reasons,
    // and the driver's nonzero-exit stop condition does the rest.
    // Stuck is a fact about ONE epic: it has tickets waiting and none ready.
    // Asked about one epic — the driver's call — that is the refusal. Asked
    // about the whole board, a stuck epic must neither be hidden behind another
    // epic's ready tickets nor fail a question nobody asked about it: it is
    // said on stderr, and the exit is nonzero only when nothing anywhere can
    // start.
    // `--with-waiting` is the run driver's form, and it changes HOW the fact
    // travels, not what it is: `{ready, waiting}` as data, exit 0, the wait
    // reasons included. The refusal below is an exit code, and the driver has
    // no shell — it learns an exit code from a shell proxy's report of one. An
    // empty `ready` with a non-empty `waiting` must halt a run even if that
    // proxy reports the exit wrongly, so the driver is handed both lists and
    // refuses in code. Humans and every other caller keep the refusal.
    if (argv.includes('--with-waiting')) {
      emit({
        ready: open.map((t) => ({ id: t.id, title: t.title, epic: t.epic })),
        waiting: waiting.map((t) => ({ id: t.id, title: t.title, epic: t.epic, on: t.waitingOn, problem: t.dependencyProblem, reason: waitingReason(t, data.byId) })),
      })
      break
    }
    const stuck = data.epics
      .map((e) => e.epic)
      .filter((name) => !open.some((t) => t.epic === name) && waiting.some((t) => t.epic === name))
    if (!arg && open.length && stuck.length)
      console.error(
        `tickets: ${stuck.join(', ')} ${stuck.length === 1 ? 'has' : 'have'} tickets waiting and none that can start:\n` +
          waiting.filter((t) => stuck.includes(t.epic)).map((t) => `  ${waitingReason(t, data.byId)}`).join('\n'),
      )
    if (!open.length && waiting.length) {
      console.error(
        `tickets: nothing can start, and ${waiting.length} ticket${waiting.length === 1 ? ' is' : 's are'} still waiting — this is not "nothing left to start":\n` +
          waiting.map((t) => `  ${waitingReason(t, data.byId)}`).join('\n') +
          `\nA blocker that is blocked, halted or unmerged holds everything behind it: finish or re-plan it. A Blocked by line that will not parse is fixed in tickets.md — \`doctor\` names the line.`,
      )
      process.exit(1)
    }
    if (json) emit(open.map((t) => ({ id: t.id, title: t.title, epic: t.epic })))
    else if (!open.length) console.log('nothing left to start')
    else for (const t of open) console.log(`${t.id.padEnd(8)} ${t.title}`)
    break
  }

  case 'spend': {
    // The recorded token ledger, per ticket and per epic — derived from the
    // status log's Tokens lines, addendum phrases and run records, so the
    // retro and the board never sum by hand. Unknown figures stay unknown;
    // a ticket with no recorded figure is reported as such, never as zero.
    const report = spendReport(arg || null)
    if (json) emit(report)
    else {
      const fmt = (n) => (n === null || n === undefined ? '?' : n.toLocaleString('en-US'))
      const dur = (n) => {
        if (n === null || n === undefined) return '?'
        const h = Math.floor(n / 3600)
        const m = Math.floor((n % 3600) / 60)
        return h ? `${h}h ${String(m).padStart(2, '0')}m` : m ? `${m}m ${String(n % 60).padStart(2, '0')}s` : `${n}s`
      }
      for (const e of report.epics) {
        console.log(
          `${C.bold}${e.epic}${C.off} — ${e.tickets.length} tickets · recorded ${fmt(e.totals.total)} tokens` +
            (e.unknownTickets ? ` · ${e.unknownTickets} with unknown or missing figures` : ''),
        )
        for (const t of e.tickets) {
          const parts = SPEND_ROLES.filter((r) => t[r] !== null || t.unknown.includes(r)).map((r) => `${r} ${fmt(t[r])}`)
          const detail = parts.length
            ? `${parts.join('  ')}  total ${fmt(t.total)}  ${C.dim}(${t.source})${C.off}`
            : `${C.dim}no figure recorded${t.note ? ` — points at the ${t.note}` : ''}${C.off}`
          console.log(`  ${t.id.padEnd(8)} ${detail}`)
          const timed = TIME_ROLES.filter((r) => t.time[r] !== null || t.time.unknown.includes(r)).map((r) => `${r} ${dur(t.time[r])}`)
          if (timed.length) console.log(`  ${''.padEnd(8)} ${C.dim}time${C.off}  ${timed.join('  ')}  ${C.dim}(${t.time.source})${C.off}`)
          else if (t.commitSpan)
            console.log(`  ${''.padEnd(8)} ${C.dim}time  not recorded — commit span ${dur(t.commitSpan.seconds)} over ${t.commitSpan.commits} commits (git)${C.off}`)
        }
        console.log(
          `  ${C.dim}${SPEND_ROLES.map((r) => `${r} ${fmt(e.totals[r])}`).join('  ')}${C.off}`,
        )
        if (e.tickets.some((t) => TIME_ROLES.some((r) => t.time[r] !== null)))
          console.log(
            `  ${C.dim}time  ${TIME_ROLES.map((r) => `${r} ${dur(e.timeTotals[r])}`).join('  ')}` +
              (e.untimedTickets ? ` · ${e.untimedTickets} ticket${e.untimedTickets === 1 ? '' : 's'} with no recorded wall` : '') +
              `${C.off}`,
          )
        console.log()
      }
      console.log(`${C.dim}Recorded figures only — harness-observed or unknown, as the log says; nothing here is estimated.${C.off}`)
      if (report.epics.some((e) => e.tickets.some((t) => t.commitSpan)))
        console.log(`${C.dim}A commit span is first to last commit naming the ticket — not its wall-clock: the work before the first commit is not in it, and a squash-merged ticket's span ends at the merge.${C.off}`)
      // Not nested under the line above: a ticket whose commits all lie past
      // the cap shows no span at all, and that is the case this note is for.
      if (report.commitSpansCapped && report.epics.some((e) => e.tickets.some((t) => t.time.wall === null)))
        console.log(`${C.dim}Commit spans scanned only the last ${MAIN_SCAN_LIMIT} commits — an older ticket's span may start late, or be missing.${C.off}`)
    }
    break
  }

  case 'list':
  case undefined: {
    const data = board(arg || null)
    requireKnownEpic(data, arg)
    if (json) {
      emit({
        defaultBranch: data.defaultBranch,
        prsAvailable: data.prsAvailable,
        onMainCapped: data.onMainCapped,
        current: data.current?.epic || null,
        epics: data.epics.map((e) => e.epic),
        modes: Object.fromEntries(
          data.epics.map((e) => [
            e.epic,
            { delivery: e.delivery, reviewerModel: e.reviewerModel, workerModel: e.workerModel, workerRunner: e.workerRunner, shadowReviewer: e.shadowReviewer, plannerModel: e.plannerModel, consequencePaths: e.consequencePaths, fixBoundsExclude: e.fixBoundsExclude, designSources: e.designSources, ticketBudget: e.ticketBudget, parallel: e.parallel },
          ]),
        ),
        duplicates: data.duplicates,
        unticketed: data.unticketed,
        tickets: data.tickets.map(({ body, ...t }) => t),
      })
    } else printBoard(data, arg)
    break
  }

  case 'doctor': {
    const rows = doctor()
    if (json) emit(rows)
    else {
      const MARK = { ok: `${C.green}✓${C.off}`, warn: `${C.yellow}!${C.off}`, fail: `${C.red}✗${C.off}` }
      for (const r of rows) console.log(`${MARK[r.level]} ${r.msg}`)
    }
    if (rows.some((r) => r.level === 'fail')) process.exit(1)
    break
  }

  default:
    console.error(`tickets: unknown command "${cmd}" (try: list, find, brief, next, check, compared, deviations, spend, epics, current, doctor)`)
    process.exit(2)
}
