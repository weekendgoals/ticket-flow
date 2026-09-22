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
//   tickets.mjs check-epic <epic> [--json] [--share] [--list] [--render <report.json>]
//                                        the release check: every landed ticket's
//                                        CHECK criteria on this checkout, clean
//                                        and at the fetched remote head; criteria
//                                        that differ from sign-off shown; --share
//                                        runs a command tickets share once; --list runs
//                                        nothing and prints the landed IDs;
//                                        --render prints a saved --json report
//   tickets.mjs release <epic> [--json]  what the release walkthrough shows that
//                                        this script can derive — entries by
//                                        field, commits by ticket, owed,
//                                        deviations, the last run record;
//                                        rendered by release-page.mjs
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
//                                        from git — labelled, never as wall —
//                                        plus the CACHE READS, the PEAK
//                                        CONTEXT each role reached (a max, not
//                                        a sum) and the MODEL it ran on, and
//                                        what each review FOUND
//   tickets.mjs metrics [epic] [--json]  what the ledgers say once crossed
//                                        with each other and with the commit
//                                        subjects: pace per worker model,
//                                        rework ((review fix) commits), review
//                                        effectiveness (the Findings lines),
//                                        halts by kind (the Halt lines) and
//                                        escaped defects ((fixes <ID>) commits
//                                        naming a shipped ticket). Duration is
//                                        the recorded wall only — never a
//                                        commit span — and nothing is
//                                        estimated: unmeasured reads `?`
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

// Node's default `maxBuffer` is 1 MiB, and every scan here passes
// `allowFail: true` — so a log that outgrows it does not fail loudly, it
// returns `null` and reads as an EMPTY branch: 623 commits at 1.18 MB turned
// the whole board to `todo` and reported zero escapes with
// `mainScanCapped: false`, as if observed. A commit log is text; 256 MiB is
// far past any repository this walks and still a bound rather than none.
const GIT_MAX_BUFFER = 256 * 1024 * 1024
// …and even bounded, a scan can fail for reasons that are not "this ref is
// empty" — a missing ref, a corrupt object, a buffer that is somehow still
// too small. `allowFail` callers get `null` for both today, which is right
// for a ref that may not exist and wrong for a scan whose emptiness will be
// reported as a figure. Those callers pass `report`, an array the failure is
// pushed onto, and print it instead of printing zeros.
// The failures a scan is ALLOWED to have: the ref does not exist yet. A fresh
// repository with no `origin`, an epic whose branch was never pushed, a
// repository with no commits — each is a legitimate "nothing here", and the
// callers below are written to read it as one. Anything else — ENOBUFS, a
// corrupt object, a git that is not on PATH — is a scan that should have
// worked, and its empty result must not be read as a fact.
const MISSING_REF = /unknown revision|bad revision|ambiguous argument|does not have any commits yet|not a valid object name|no such ref|not a git repository/i
function git(args, { allowFail = false, report = null } = {}) {
  try {
    return execFileSync('git', args, { cwd: repoRoot, encoding: 'utf8', maxBuffer: GIT_MAX_BUFFER, stdio: ['ignore', 'pipe', 'pipe'] }).trim()
  } catch (e) {
    const why = String(e.stderr || '').trim() || String(e.code || e.message)
    if (report && !MISSING_REF.test(why)) report.push(`\`git ${args.slice(0, 3).join(' ')}…\` failed: ${why.replace(/\s+/g, ' ').slice(0, 160)}`)
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

// The epic preamble a worker is handed by `brief`: everything above the first
// TICKET heading — which is what the preamble IS (parseTicketSections splits on
// the same line), and what `brief`'s own description has always claimed it
// hands over. It used to cut at the first `## ` of any kind, so the ground
// rules, the order and the walkthrough — every `## ` section planning writes
// beneath the declaration lines — reached no worker at all, silently. The
// declaration parse (`parsePreamble`) deliberately still stops at the first
// `## `: a label read out of a prose section would be a declaration nobody
// wrote.
//
// A near-miss FIRST ticket heading widens this: `## pay-1 — …` is no ticket to
// either parser, so that section becomes preamble and every worker reads it as
// ground rules. That is bounded rather than guarded — `doctor` names the
// heading and says what it is doing meanwhile — because a second, looser
// notion of "where the tickets start" is exactly the tolerance the dependency
// graph died of.
function epicPreamble(text) {
  const lines = text.split('\n')
  const first = lines.findIndex((l) => TICKET_HEADING.test(l))
  return (first === -1 ? lines : lines.slice(0, first)).join('\n').trim()
}

// ── the walkthrough section ──────────────────────────────────────────────────
// `plan-page.mjs` refuses to render a scene naming a ticket the plan does not
// carry — but it reads the plan JSON, which is the copy that is thrown away.
// The copy that survives is the `## Walkthrough` section of `tickets.md`: it
// is what `brief` hands every worker and what the retro reads, and there the
// scenes are prose. So the same guard stands at this door too, over the one
// machine-readable line a scene carries.
//
// Strict for the reason `**Blocked by:**` is strict: a scene's tickets are
// checked or they are decoration, and a tolerant parse would report a
// hand-waved line as a checked one. Indentation IS allowed, unlike there,
// because the template writes these lines inside a numbered list item, and a
// near set that would be too wide over a whole document is safe over the five
// lines of one section — which is why the scan is scoped to the section, from
// the `## Walkthrough` heading to the next `## ` of any kind.
const WALKTHROUGH_HEADING = /^##\s+Walkthrough\s*$/i
const SCENE_TICKETS_LINE = new RegExp(`^[^\\S\\n]*\\*\\*Tickets:\\*\\*[^\\S\\n]*(${TICKET_ID}(?:[^\\S\\n]*,[^\\S\\n]*${TICKET_ID})*)[^\\S\\n]*$`)
const SCENE_TICKETS_NEAR = /^[^\S\n]*(?:[-*][^\S\n]+)?\*{0,2}\s*Tickets\s*\*{0,2}[^\S\n]*:/i

// → { scenes: [{ scene, line, ids }], problems: [{ scene, line, text }] }.
// A scene is numbered by the order of its `**Tickets:**` line in the section,
// which is the order the page numbers its scenes in. A scene carrying no such
// line at all is not reported: telling one from a paragraph break needs a
// parse of the prose, and a guess there would name scenes nobody wrote. The
// price: a scene is the nth `**Tickets:**` line, so one written without the
// line shifts every later scene's number down — which is why each warn also
// carries the line number, the figure recovery is done from.
function parseWalkthrough(text) {
  const scenes = []
  const problems = []
  let inSection = false
  text.split('\n').forEach((line, i) => {
    if (/^##\s/.test(line)) {
      inSection = WALKTHROUGH_HEADING.test(line)
      return
    }
    if (!inSection || !SCENE_TICKETS_NEAR.test(line)) return
    const scene = scenes.length + problems.length + 1
    const m = line.match(SCENE_TICKETS_LINE)
    if (m) scenes.push({ scene, line: i + 1, ids: m[1].split(',').map((x) => x.trim()) })
    else problems.push({ scene, line: i + 1, text: line.trim() })
  })
  return { scenes, problems }
}

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

// `ran`, when given, is a Map of command → what it printed: `check-epic` runs
// every integrated ticket's criteria in one pass, and five tickets that each
// say `CHECK: npm test` are one run of the suite judged five times, not five
// runs. The EXPECT is still each criterion's own — only the process is shared.
function runChecks(checks, ran = null) {
  return checks.map((c, idx) => {
    const r = (ran && ran.get(c.check)) || spawnSync(c.check, { cwd: repoRoot, shell: true, encoding: 'utf8', timeout: CHECK_TIMEOUT_MS, maxBuffer: CHECK_MAX_BUFFER })
    if (ran) ran.set(c.check, r)
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
// …and a group is never followed by a TIME-shaped pair, or by `unknown`.
// Without that `CITY-15 worker=unknown reviewer=200s` — a TIME group, quoted
// in prose — reads as the token group `CITY-15 worker=unknown`: `unknown` is
// the one figure with no unit, so it is the hole in the wall between the
// ledgers, and the leak replaces the ticket's own `**Tokens:** unknown`
// marker with a role nobody wrote a token figure for. (`wall` is time's own
// key; it is here because it is what follows.)
//
// **This lookahead is unchanged, and changing it is how figures get lost.**
// Cut A, the first one ever written, refused a group followed by any
// `<role>=` at all, and threw away whole groups the parser had been reading
// correctly: `A-1 worker=100 reviewer=50 wall=9`, `… reviewer=228k`,
// `… reviewer=`; this shape is what replaced it. Adding the newer ledgers cut
// at it three more times, each losing a figure. Cut 1 refused any
// letter-initial follower and took `disposition=none`, `re-review=n/a` and
// the `proxies=5000` before them. Cut 2 narrowed that to letter-initial
// values carrying a digit, and took `re-review=round2`, `disposition=v2`.
// Cut 3 widened the unit by one letter, `s` to `[sr]`, so that a cache figure
// could close a group too — and `C-1 worker=462249 reviewer=185339
// proxies=12r` lost the reviewer's 185,339, silently, while the record's own
// Cache reads paragraph made the ticket look answered. A cache figure needs
// nothing here: `NOT_A_UNIT` already refuses `12r` as a token pair, so the
// group ends before it and reads exactly as it always did.
const RUN_GROUP = new RegExp(`\\b(${TICKET_ID})(?:\\s+round=(\\d+))?${ROLE_PAIRS}(?!\\s+(?:${ROLE_RE}|wall)=(?:\\d[\\d,]*s|unknown)\\b)`, 'g')
// The one addition, and it is decided after the match rather than by the
// follower's spelling: a token group can only be another ledger's group in
// disguise when every pair it swallowed is `unknown`, the single value the
// every ledger shares. Such a group — and only such a group — is dropped when
// what follows it belongs to a ledger: unit-carrying, or letter-initial,
// which is every model name and `unknown` itself. Nothing observed is at
// stake in the drop; the only thing lost is an `unknown` mark for a role
// nobody wrote a figure for.
const ALL_UNKNOWN = new RegExp(`^(?:\\s+(?:${ROLE_RE})=unknown${NOT_A_UNIT})+$`, 'i')
// The unit letters a ledger figure may carry — `s` seconds, `r` cache reads,
// `c` peak context. Only ever WIDENED here, never in `RUN_GROUP`'s lookahead:
// this decides which all-`unknown` groups are dropped, and an all-`unknown`
// group holds no figure to lose, while the lookahead decides which groups are
// read at all and has cost a figure at every cut (Cut 3 above).
const LEDGER_UNITS = 'src'
const LEDGER_FOLLOWER = new RegExp(`^\\s+(?:${ROLE_RE}|wall)=(?:\\d[\\d,]*[${LEDGER_UNITS}]\\b|[A-Za-z])`, 'i')
// Every run group the ledger reads out of a flattened text, and the same text
// with EVERY matched group blanked, dropped ones included. The pair is one
// function because an entry's own bare pairs are what is left when the
// labelled groups are taken out — and a dropped group belongs to neither
// ticket: left in the text, its `worker=unknown` was read as the enclosing
// entry's own figure, which is the same leak one ticket to the left. (A group
// the lookahead above refuses never matched at all, and stays where it is,
// exactly as it does on main.)
function runGroups(flat) {
  const groups = []
  let rest = ''
  let at = 0
  for (const m of flat.matchAll(RUN_GROUP)) {
    if (!(ALL_UNKNOWN.test(m[3]) && LEDGER_FOLLOWER.test(flat.slice(m.index + m[0].length)))) groups.push(m)
    rest += `${flat.slice(at, m.index)} `
    at = m.index + m[0].length
  }
  return { groups, rest: rest + flat.slice(at) }
}
// The same label inside a ticket's own entry, where the ID is the heading's.
const ENTRY_ROUND = new RegExp(`\\bround=(\\d+)${ROLE_PAIRS}`, 'gi')
// What marks a repeated figure as a correction rather than a round: the dated
// addendum corrections already take ("**Addendum — correction — …").
const CORRECTION_MARK = /Addendum\b[^*]{0,80}\bcorrect/i
// The unit comes off here, so one `apply` serves every counting ledger: a
// token figure never ends in a letter (`NOT_A_UNIT` sees to that), so only a
// duration's `s`, a cache read's `r` and a peak context's `c` can be stripped.
const toNum = (s) => Number(s.replace(new RegExp(`,|[${LEDGER_UNITS}]$`, 'g'), ''))

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
// ── cache reads and models ───────────────────────────────────────────────────
// Two more lines from the same observer, read under the same rules. Cache
// reads are a count like tokens — rounds sum, a repeat corrects, `unknown`
// erases nothing — and carry `r` on every figure for the reason seconds carry
// `s`: `spend` reads a bare `worker=4812330` as TOKENS wherever it sits, and
// the last figure read for a role wins, so a unitless read figure does not
// inflate the ticket's cost — it REPLACES it, with a count several times its
// size and no sign that anything was overwritten.
// Models are names, not counts: a role's value is what ran, several joined by
// `+`, and a later round's models are unioned rather than summed.
//
// Neither unit is enough on its own. `worker=unknown` has no unit at all and
// `worker=claude-opus-5` is not a figure, yet both open exactly like a token
// group — so, as with time, the PARAGRAPH is the wall: each line's groups are
// lifted out of the text before the token ledger reads what is left.
const CACHE_PAIR = new RegExp(`\\b(${ROLE_RE})=(\\d+r|unknown)\\b`, 'gi')
const CACHE_GROUP = new RegExp(`\\b(${TICKET_ID})(?:\\s+round=(\\d+))?((?:\\s+(?:${ROLE_RE})=(?:\\d+r|unknown)\\b)+)`, 'g')
// A cache-shaped figure wherever it sits, for doctor: commas included, since
// `worker=4,812,330r` is not machine-shaped and is still a count somebody
// meant the ledger to have.
// Case-sensitive, so that the line test and `FIGURE_OWNER`'s scan of the same
// line agree about what a figure is.
const CACHE_FIGURE = new RegExp(`\\b(?:${ROLE_RE})=\\d[\\d,]*r\\b`)
// A model value is one or more names joined by `+`. A NAME is the charset
// `meter.mjs` prints and nothing else — a letter first, a letter or digit
// last — and it is the same rule at the writer's door, because a name that
// could be read as a figure is the one shape that crosses into the token
// ledger, and a name that swallows its neighbouring punctuation
// (`claude-opus-5.`) is a name nobody ran. `claude-fable-5.1` keeps its dot:
// the rule is about the end, not the middle.
const MODEL_NAME = `[A-Za-z](?:[A-Za-z0-9._:/-]*[A-Za-z0-9])?`
// …and the value has to END the pair: at `;`, at the end of the text, or at
// whitespace that is followed by another pair or the next group. A value
// merely cut at the first character outside the charset is the failure this
// closes — `worker=a=b` read as `a`, `reviewer=claude opus` read as
// `claude` — a wrong name reported as an observed one. Unread here means the
// group ends there, and `doctor`'s per-paragraph warn says which ticket lost
// its model and how to restate it. What that costs the writer is one rule,
// and the skill and the warn both carry it: **a Models paragraph holds
// groups and nothing else** — the reviewer's tier, its effort and any note
// go in a sentence of their own outside the paragraph, because a word beside
// a name ends the group there. A line pasted as the meter printed it always
// parses.
const MODEL_END = `(?=\\s*(?:;|$)|\\s+(?:${ROLE_RE})=|\\s+${TICKET_ID}\\b)`
const MODEL_VALUE = `${MODEL_NAME}(?:\\+${MODEL_NAME})*${MODEL_END}`
const MODEL_PAIR = new RegExp(`\\b(${ROLE_RE})=(${MODEL_NAME}(?:\\+${MODEL_NAME})*)${MODEL_END}`, 'gi')
const MODEL_GROUP = new RegExp(`\\b(${TICKET_ID})(?:\\s+round=(\\d+))?((?:\\s+(?:${ROLE_RE})=${MODEL_VALUE})+)`, 'g')
const ROLE_ASSIGN = new RegExp(`\\b(?:${ROLE_RE})=`, 'i')
// ── peak context ─────────────────────────────────────────────────────────────
// A fourth counting ledger in the same grammar: the largest context window a
// role's agents ever held, `<ID> worker=<n>c reviewer=<n>c …`.
//
// The unit is `c`, and the letter was chosen rather than inherited. It cannot
// be `s` or `r` — those are other ledgers' figures, and the paragraph wall is
// the only thing that would keep them apart, which is one wall too few for a
// figure that is commonly larger than the ticket's whole token count. Any
// letter keeps it out of the TOKEN ledger (`NOT_A_UNIT` refuses a digit run
// followed by a letter), so what a new unit must earn is only distinctness
// from the units already in use and a shape `RUN_GROUP`'s follower refusal
// does not see: `c` is neither `s` nor `unknown`, so a peak pair closes a
// token group exactly the way a cache pair does — before it, by the digits
// ending — and nothing about how main reads a record changes.
//
// A peak is a MAX, not a sum, and that is the one place this ledger parts
// from the three beside it: rounds are UNITED by taking the larger, because
// two passes over a ticket did not stack their context windows, and a total
// across tickets would name a number no agent ever held. The line carries no
// `total=`; `metrics` reports the epic's max, computed from the groups where
// it cannot disagree with them.
const PEAK_PAIR = new RegExp(`\\b(${ROLE_RE})=(\\d+c|unknown)\\b`, 'gi')
const PEAK_GROUP = new RegExp(`\\b(${TICKET_ID})(?:\\s+round=(\\d+))?((?:\\s+(?:${ROLE_RE})=(?:\\d+c|unknown)\\b)+)`, 'g')
// A peak-shaped figure wherever it sits, for doctor — commas included, since
// `worker=1,204,331c` is not machine-shaped and is still a figure somebody
// meant the ledger to have. Case-sensitive, like `CACHE_FIGURE`, so the line
// test and the owner scan agree about what a figure is.
const PEAK_FIGURE = new RegExp(`\\b(?:${ROLE_RE})=\\d[\\d,]*c\\b`)
// ── findings ─────────────────────────────────────────────────────────────────
// What the review found and what became of it: `<ID> important=<n> nits=<n>
// unfixed=<n>`. The keys are the ledger's own — NOT role keys — because the
// counts are the ticket's, not any one agent's: one reviewer and one
// disposition produced them between them, and splitting them per role would
// invent an attribution nobody observed.
//
// That the keys differ is also why these figures carry no unit: `important=3`
// is unreadable to every other ledger's pair regex, so no unit could make it
// safer. The paragraph wall still applies, for the reason it applies to
// models — a Findings paragraph may carry a ticket ID beside prose, and the
// wall is what keeps one grammar rather than three exceptions.
const FINDING_KEYS = ['important', 'nits', 'unfixed']
const FINDING_RE = FINDING_KEYS.join('|')
// The value has to be the WHOLE count, not a prefix of one. `\b` is satisfied
// by the boundary before a comma, so `nits=1,234` read as `nits=1` — a
// four-figure count reported as one, with no warn, because the near-miss scan
// saw a pair it could read. `NOT_A_COUNT` refuses a value followed by
// anything that would have been part of it.
//
// Commas are REFUSED here where the token ledger accepts them (`\d[\d,]*`),
// and the two differ on purpose: a token figure is often six or seven digits
// and a human writing one by hand groups it, so the ledger has always taken
// `462,249`; a findings count is a handful and `1,234` is not a count anybody
// means, it is a typo or a second figure. Refused, it is a named warn with a
// repair, which is the answer this ledger can give and the token ledger —
// which has no door to complain at for a figure it already read — cannot.
const NOT_A_COUNT = '(?![\\d,A-Za-z])'
const FINDING_PAIR = new RegExp(`\\b(${FINDING_RE})=(\\d+|unknown)${NOT_A_COUNT}`, 'gi')
const FINDING_GROUP = new RegExp(`\\b(${TICKET_ID})(?:\\s+round=(\\d+))?((?:\\s+(?:${FINDING_RE})=(?:\\d+|unknown)${NOT_A_COUNT})+)`, 'g')
const FINDING_ASSIGN = new RegExp(`\\b(?:${FINDING_RE})=`, 'i')
// ── halts ────────────────────────────────────────────────────────────────────
// `**Halt:** <kind> <ID>` — the driver's OWN halt kind (the keys of `STOP` in
// `workflows/run-epic.mjs`), and the ticket it halted on when there was one.
//
// The kind comes first and the ID is optional, because an epic-level halt
// names no ticket: the release check halts on the epic, and the shapes that
// were rejected for it all put something in ID position — the epic's name
// (`redesign-city`, which is not a ticket ID but is one typo away from
// reading as prose), a placeholder `-`, the string `epic`. A kind is
// lower-case-initial and a ticket ID upper-case-initial, so `**Halt:**
// releaseCheck` and `**Halt:** blocked PAY-1` are told apart by the parser
// with no placeholder between them, and neither can be confused for the
// other. Several halts (a wave produces more than one) are separated by `;`.
//
// The kinds are not enumerated here: the driver owns that vocabulary, and a
// parser that carried a second copy would silently drop a kind the day the
// driver added one. `metrics` counts whatever kinds the records name, which
// is what makes a new kind visible rather than invisible.
// A kind is any lower-case-initial word, which is also every other word in
// the language — so a group is recognised by its POSITION, not by its
// spelling: directly after the `**Halt:**` label, or directly after a `;`,
// and ending at the next `;` or the end of its line. Without that anchor
// `**Halt:** blocked PAY-1 — the worker died` would record four halts, named
// "the", "worker" and "died". What it costs the writer is the rule the Models
// line already carries: **the paragraph holds groups and nothing else**, and
// the sentence about what happened goes under `**Diagnosis:**`, where it
// always did.
const HALT_KIND = `[a-z][A-Za-z]*`
// The LABEL is matched case-insensitively and the KIND is not, which is why
// it spells its own letters instead of taking an `i` flag. Every other
// ledger's label is case-insensitive (`LEDGER_PARAGRAPHS` tests them with
// `/i`, and the role keys are read with `gi`), so a `**HALT:**` line that
// opens a halt paragraph must yield its groups too — while the kind stays
// case-SENSITIVE, because lower-case-initial is the entire thing that tells
// a kind from a ticket ID. One flag cannot say both.
const HALT_LABEL = `\\*\\*[Hh][Aa][Ll][Tt]:\\*\\*`
// ONE definition of a halt, used by the parser and by `doctor`'s written-side
// scan, so the two cannot disagree about where a group ends. They did: with a
// multiline `$` the parser read `**Halt:** blocked A-1\n— the worker died` as
// one halt while doctor called the segment lost, and the repair doctor
// advertised then ADDED a second copy of a halt already counted. The boundary
// is the paragraph's, not the line's — a group runs to the next `;` or to the
// end of the paragraph, and nothing else may stand in it.
const HALT_BODY = `(${HALT_KIND})(?:\\s+(${TICKET_ID}))?`
const HALT_GROUP = new RegExp(`(?:^${HALT_LABEL}|;)\\s*${HALT_BODY}(?=\\s*(?:;|$))`, 'g')
// A `;`-separated segment that IS a group and nothing else — the written-side
// twin of `HALT_GROUP`, used by `doctor` to see what a paragraph meant to
// record against what the parser got out of it. Anchored whole, because the
// loss this catches is trailing text: `blocked CITY-14 — the worker died`
// reads as nothing while its sibling `releaseCheck` reads fine, and a
// question asked of the paragraph ("did anything parse?") answers yes.
const HALT_SEGMENT = new RegExp(`^\\s*${HALT_BODY}\\s*$`)

// The labelled ledgers, each read only inside its own paragraph. `read` turns
// a match into the record of what the paragraph WROTE there, which doctor
// compares with what the ledger got out of it.
const GROUP_READ = (m) => ({ id: m[1], round: m[2], pairs: m[3] })
const LEDGER_PARAGRAPHS = [
  { key: 'time', label: /^\*\*Time:\*\*/i, group: TIME_GROUP, read: GROUP_READ },
  { key: 'cache', label: /^\*\*Cache reads:\*\*/i, group: CACHE_GROUP, read: GROUP_READ },
  { key: 'models', label: /^\*\*Models:\*\*/i, group: MODEL_GROUP, read: GROUP_READ },
  { key: 'peak', label: /^\*\*Peak context:\*\*/i, group: PEAK_GROUP, read: GROUP_READ },
  { key: 'findings', label: /^\*\*Findings:\*\*/i, group: FINDING_GROUP, read: GROUP_READ },
  { key: 'halt', label: /^\*\*Halt:\*\*/i, group: HALT_GROUP, read: (m) => ({ kind: m[1], id: m[2] || null }) },
]
const LEDGER_KEYS = LEDGER_PARAGRAPHS.map((p) => p.key)

// A paragraph runs from a line that starts with one of those labels to the
// next blank line or bold label — records wrap at the house width — and the
// split is by GROUP, not by line: every group in the paragraph is lifted out
// for its own ledger, whatever prose stands beside it, and what is left goes
// back to the text tokens are read from. Both line-level cuts lost figures
// silently. The paragraph taken whole swallowed `CITY-15 worker=100
// reviewer=50` written under a Time line, and it reached neither ledger; the
// paragraph narrowed to lines holding nothing but time dropped a whole
// ticket's time for one parenthesis on a wrapped line, and handed the
// rejected line's `worker=unknown` to the token ledger. Lifted groups are
// blanked in place, newlines kept, so `rest` has the record's own line
// numbers and doctor can name the line it means.
//
// One function for every label rather than a copy each: they are one
// mechanism, and a ledger that forgot to lift its paragraph would pour its
// figures into the token ledger.
function splitLedgerParagraphs(text) {
  const lines = text.split('\n')
  const lifted = Object.fromEntries(LEDGER_KEYS.map((k) => [k, []]))
  // One entry per paragraph, in document order: its raw text, where it sat
  // (so doctor can name the line a lost figure is on, not the record's first
  // label — a record repaired by an addendum has several paragraphs of the
  // same kind, and the one that failed is rarely the first), and the groups
  // lifted OUT OF IT, which is what makes "this paragraph gave the ledger
  // nothing for this ticket" a question about one paragraph.
  const paragraphs = Object.fromEntries(LEDGER_KEYS.map((k) => [k, []]))
  let start = -1
  let kind = null
  const close = (end) => {
    if (start < 0) return
    const raw = lines.slice(start, end).join('\n')
    const mine = []
    // `(...a)` rather than named parameters: the ledgers no longer share one
    // capture arity — a Halt group is `<kind> <ID?>` where the others are
    // `<ID> <round?> <pairs>` — and each states its own `read`. The last two
    // arguments a replacer receives are the offset and the whole string; no
    // pattern here uses named groups, which would add a third.
    const kept = raw.replace(kind.group, (...a) => {
      const m = a.slice(0, a.length - 2)
      lifted[kind.key].push(m[0])
      mine.push(kind.read(m))
      return m[0].replace(/[^\n]/g, ' ')
    })
    paragraphs[kind.key].push({ text: raw, start, end, groups: mine })
    lines.splice(start, end - start, ...kept.split('\n'))
    start = -1
  }
  lines.forEach((line, i) => {
    const label = LEDGER_PARAGRAPHS.find((p) => p.label.test(line))
    if (label) {
      close(i)
      start = i
      kind = label
    } else if (start >= 0 && (line.trim() === '' || /^\*\*/.test(line))) close(i)
  })
  close(lines.length)
  const join = (o) => Object.fromEntries(Object.entries(o).map(([k, v]) => [k, v.join('\n')]))
  return { rest: lines.join('\n'), restLines: lines.map((l, i) => [i, l]), ...join(lifted), paragraphs }
}

function parseSpend(epic) {
  const byId = {}
  // Ticket entries are always in status.md; run records are in runs.md once an
  // epic has split them out, and in status.md for every log written before the
  // split. Both files are read — the split moved where a record is written,
  // never where an old one can be found.
  const docs = [epic.statusDoc, epic.runsDoc].filter(Boolean)
  if (!docs.length) return byId
  const ledger = () => ({ figures: {}, rounds: {}, unknown: new Set(), source: null })
  const rec = (id) =>
    byId[id] ||
    (byId[id] = { id, figures: {}, rounds: {}, repeats: [], unknown: new Set(), source: null, note: null, time: ledger(), cache: ledger(), models: ledger(), peak: ledger(), findings: ledger() })
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
  //
  // `read` turns the written value into what the ledger keeps: a number for
  // a counting ledger (the unit comes off), the name itself for the models
  // ledger. Everything else about the two rules above is the same in every
  // one of them, which is the point — one grammar.
  const apply = (r, role, val, source, read = toNum) => {
    role = role.toLowerCase()
    if (/^unknown$/i.test(val)) {
      if (role in r.figures) return // rule 1 — and the known figure keeps its own source
      r.unknown.add(role)
    } else {
      r.figures[role] = read(val)
      r.unknown.delete(role)
    }
    r.source = source
  }
  // A labelled round: last figure wins WITHIN the round (a correction to a
  // round is that round written again), rounds are summed at the end — united
  // for models, which have nothing to add — and `unknown` never erases a
  // round's known figure — rule 1, per round.
  const applyRound = (r, n, role, val, source, read = toNum) => {
    role = role.toLowerCase()
    const rounds = (r.rounds[role] ||= {})
    if (/^unknown$/i.test(val)) {
      if (n in rounds) return // an unknown that changed nothing keeps the known figure's source too
      rounds[n] = null
    } else rounds[n] = read(val)
    r.source = source
  }
  // Entries wrap at the house width, so phrases are matched over a region's
  // joined text, never line by line: "Worker tokens (implementation\nleg):".
  const flush = (region, text) => {
    if (!region) return
    const split = splitLedgerParagraphs(text)
    // The labelled ledgers go to the ticket under the token ledger's own
    // rules — `apply` and `applyRound` take any of them — so rounds sum, a
    // repeat corrects, and `unknown` never erases an observation, in each.
    const where = region.run ? 'run-record' : 'log'
    for (const [key, group, pair, read] of [
      ['time', TIME_GROUP, TIME_PAIR, toNum],
      ['cache', CACHE_GROUP, CACHE_PAIR, toNum],
      ['models', MODEL_GROUP, MODEL_PAIR, (v) => v],
      ['peak', PEAK_GROUP, PEAK_PAIR, toNum],
      ['findings', FINDING_GROUP, FINDING_PAIR, toNum],
    ]) {
      for (const m of split[key].replace(/\s+/g, ' ').matchAll(group)) {
        const t = rec(m[1])[key]
        for (const p of m[3].matchAll(pair)) (m[2] ? applyRound(t, m[2], p[1], p[2], where, read) : apply(t, p[1], p[2], where, read))
      }
    }
    const flat = split.rest.replace(/\s+/g, ' ')
    // A machine-shaped group names its own ticket, so it is read wherever it
    // sits — a correction addendum for a run record appended at the end of
    // a log lands in whatever entry is last, and must still reach the ticket
    // it names rather than the entry it landed in.
    const run = runGroups(flat)
    for (const m of run.groups) {
      const r = rec(m[1])
      for (const p of m[3].matchAll(ROLE_PAIR)) m[2] ? applyRound(r, m[2], p[1], p[2], 'run-record') : apply(r, p[1], p[2], 'run-record')
      r.unknown.delete('ticket')
    }
    if (region.id) {
      const r = rec(region.id)
      let own = run.rest // bare pairs and phrases belong to this entry; labelled groups do not
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
  for (const r of Object.values(byId).flatMap((x) => [x, x.time, x.cache, x.findings])) {
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
  // Peak context is the one counting ledger whose rounds are not summed: a
  // second pass over a ticket held its own context window, it did not stack
  // the first one's on top. The role's figure is the LARGEST reading, which
  // is what a peak means, and adding them would name a window no agent ever
  // held. No `mixed` list, for the models reason: doctor's mixed warn is
  // about a SUM that silently ignores an unlabelled figure, and a max
  // ignores nothing — an unlabelled reading would be one more candidate.
  for (const { peak } of Object.values(byId)) {
    for (const [role, rounds] of Object.entries(peak.rounds)) {
      const known = Object.values(rounds).filter((v) => v !== null)
      if (!known.length) {
        if (!(role in peak.figures)) peak.unknown.add(role)
        continue
      }
      peak.figures[role] = Math.max(...known, peak.figures[role] ?? -Infinity)
      peak.unknown.delete(role)
    }
  }
  // Models are united where the counts are summed: a second round ran
  // whatever it ran, and the role's value is every model seen, in first-seen
  // order. Adding them is what a shared fold would have done — `0 + 'opus'`.
  // No `mixed` list here, unlike the counting ledgers: doctor's mixed warn is
  // about a SUM that silently ignores an unlabelled figure, and a union
  // ignores nothing — the unlabelled name would be one more member if it
  // were read. A list nobody reads is a field that drifts.
  for (const { models } of Object.values(byId)) {
    for (const [role, rounds] of Object.entries(models.rounds)) {
      const known = Object.values(rounds).filter((v) => v !== null)
      if (!known.length) {
        if (!(role in models.figures)) models.unknown.add(role)
        continue
      }
      // The unlabelled reading is a member of the union, not something the
      // rounds replace: `A-1 worker=opus` then `A-1 round=2 worker=sonnet`
      // read as `sonnet` alone and dropped an observed model. Peak's fold
      // already folds its unlabelled figure in; this is the same rule, and
      // for the counting ledgers it deliberately is NOT — there a sum that
      // silently added an unlabelled figure to its rounds would double it,
      // which is what `mixed` warns about instead.
      const seen = []
      const add = (v) => {
        for (const name of String(v).split('+')) if (!seen.includes(name)) seen.push(name)
      }
      if (role in models.figures) add(models.figures[role])
      for (const v of known) add(v)
      models.figures[role] = seen.join('+')
      models.unknown.delete(role)
    }
  }
  return byId
}

// Every halt an epic's logs record, in document order: `{ kind, id }`, the
// `id` null for an epic-level halt (the release check names no ticket). Its
// own pass over the documents rather than a second return value from
// `parseSpend`, because a halt belongs to no ticket's ledger — it is a fact
// about a RUN, and half of them name no ticket at all.
//
// The groups are read from `splitLedgerParagraphs`, which is what keeps the
// reading identical to the one the token ledger is protected from: the same
// lift, the same paragraph boundary, the same blanking.
function parseHalts(epic) {
  const out = []
  // Keyed by the run record it sits under and the text of the line itself.
  // `doctor`'s own recovery for a misfiled run is to APPEND the record to
  // runs.md and leave the committed status.md copy alone — so the same record
  // is read twice, and this is the one ledger that would count it twice: the
  // counting ledgers overwrite a repeated reading for a ticket and role, and
  // halts have no key to overwrite on. Same heading and same line is the same
  // halt; two genuinely separate runs have different headings (the date, or
  // the qualifier a same-day run carries), and two identical lines under one
  // heading are indistinguishable from a copy by anything a reader could see
  // either.
  // Read per document first, so what is counted and what is collapsed can be
  // told apart by WHERE the copies are. Two identical records in ONE document
  // are two runs — a same-day re-run halting the same way is the ordinary
  // case, and collapsing it lost a halt. A record that appears once in
  // status.md AND once in runs.md is the relocation doctor's own recovery
  // produces: it says to append the record to runs.md and leave the committed
  // status.md copy alone.
  const perDoc = []
  for (const doc of [epic.statusDoc, epic.runsDoc].filter(Boolean)) {
    const here = new Map() // key -> [{groups}], in document order
    let heading = ''
    let text = ''
    const flush = () => {
      if (!text) return
      for (const p of splitLedgerParagraphs(text).paragraphs.halt) {
        const key = `${heading}\u0000${p.text.replace(/\s+/g, ' ').trim()}`
        if (!here.has(key)) here.set(key, [])
        here.get(key).push(p.groups)
      }
      text = ''
    }
    for (const line of readFileSync(doc, 'utf8').split('\n')) {
      if (/^#{2,3}\s/.test(line)) {
        flush()
        heading = RUN_HEADING.test(line) ? line.trim() : ''
        continue
      }
      text += `${line}\n`
    }
    flush()
    perDoc.push(here)
  }
  // Copies are paired ACROSS the two documents, one for one, and what is left
  // over is runs: a key seen n times in status.md and m times in runs.md is
  // `max(n, m)` records, because each status.md copy that has a twin in
  // runs.md is that copy relocated. So one in each is one record, two in one
  // document is two, and one relocated beside a genuine same-day re-run is
  // two. Within a document nothing is ever collapsed — a reader looking at
  // two records there sees two, and so does this.
  const [first = new Map(), second = new Map()] = perDoc
  for (const key of new Set([...first.keys(), ...second.keys()])) {
    const here = first.get(key) ?? []
    const there = second.get(key) ?? []
    const kept = here.length >= there.length ? here : there
    for (const groups of kept) out.push(...groups)
  }
  return out
}

// A run record whose Tokens line carries figures but no machine-shaped group
// is the ledger's one silent failure: the figures exist, `spend` reads nothing,
// and the run lane's tickets report "no figure recorded" as if nobody had
// measured. Doctor flags it the way it flags a heading that almost parses. The
// repair is the log's own correction mechanism — a dated addendum beneath the
// record restating the figures as groups — and parseSpend already reads a
// region's addenda, so the advertised recovery works in the flagged state.
function runRecordNearMisses(doc, { timed = new Set() } = {}) {
  const misses = []
  let region = null // { line } for a run record; null elsewhere
  let text = ''
  const flush = () => {
    if (!region || region.entry || region.tokensLine === undefined) return
    const flat = splitLedgerParagraphs(text).rest.replace(/\s+/g, ' ')
    const groups = runGroups(flat).groups
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
    if (!region || region.entry) return
    const split = splitLedgerParagraphs(text)
    const parses = split.time !== ''
    const timeText = split.paragraphs.time.map((p) => p.text).join('\n')
    if (!parses && region.timeLine !== undefined && /\d/.test(timeText.replace(/\d{4}-\d{2}-\d{2}|\brun=\d+s\b/gi, '')))
      return misses.push({ kind: 'time-shape', line: region.timeLine, heading: region.heading })
    for (const [i, line] of split.restLines) {
      if (!TIME_FIGURE.test(line)) continue
      const ids = [...line.matchAll(new RegExp(`\\b${TICKET_ID}\\b`, 'g'))].map((m) => m[0])
      const untimed = ids.filter((id) => !timed.has(id))
      if (ids.length ? untimed.length : !parses) return misses.push({ kind: 'time-stray', line: region.line + 1 + i, heading: region.heading, ids: untimed })
    }
  }
  // The Cache reads and Models lines get the same near-misses as Time, and the
  // ticket-level ones are asked PER WRITTEN GROUP — never "does this ticket
  // have a figure somewhere", at any width. Asked of the epic, an earlier
  // run's group answers for a later run's malformed one (the ledger reads 2r
  // while the record in front of the reader says 4,812,330r); asked of the
  // paragraph but summed per ticket, one parsing group answers for its own
  // ticket's malformed sibling (`C-1 round=1 worker=1000r; C-1 round=2
  // worker=4,812,330r`). So each group-position span — `<ID>`, an optional
  // `round=<n>`, its pairs, to the next `;`, the next such `<ID>`, or the
  // paragraph's end — is compared with what the parser reads out of THAT
  // span, and every span that came up short is reported, not the first.
  //
  //   <kind>-shape — the label is there, the paragraph carries values, and no
  //                  group parses anywhere in the record.
  //   <kind>-lost  — a written group the parser read fewer pairs for than were
  //                  written: none (the group is malformed) or some (one pair
  //                  inside it is, which a whole-group question never sees).
  //   cache-stray  — and for cache only, the same question one step wider: a
  //                  `<role>=<n>r` figure ANYWHERE in the record (in prose, or
  //                  with the commas that stop it parsing) whose own ticket no
  //                  paragraph of THIS record gave the cache ledger a group
  //                  for. A model value has no shape to scan for outside its
  //                  paragraph, which is why models has no stray half.
  //
  // Cleared, in every case, by the repair the message advertises: a LATER
  // paragraph of the same kind in this record — an addendum's, since the
  // region runs to the next heading — that parses the ticket's group. The log
  // is append-only, so nothing else could clear it.
  // A pair as WRITTEN, whatever its value: what the author put on the line,
  // against which what the parser read is compared. Deliberately loose — the
  // strictness lives in the real pair regexes, and this one only has to see
  // that something was meant to be read there.
  // Parameterised by the ledger's OWN keys: the findings line's keys are
  // `important|nits|unfixed`, not roles, and a written-pair test that looked
  // for a role there would see no pair written and report nothing lost.
  const WRITTEN_PAIR = (keys) => `\\s+(?:${keys})=[^\\s;]+`
  // A ticket ID where a GROUP may start. Two things make this stricter than
  // `\b<ID>\b`, and a warn nobody could clear is what taught both: the match
  // is CASE-SENSITIVE and must begin a token. Case-insensitively,
  // `claude-opus-5` ends in `opus-5`, and a Models line naming two model
  // versions warned about a ticket called "opus-5" — with a repair keyed on
  // that name, so no append could ever clear it. `\b` alone was not enough
  // either: it opens inside `claude-OPUS-5`.
  const ID_AT_START = new RegExp(`(?<=^|[\\s;(])(${TICKET_ID})`, 'g')
  // …and the rest of a group, tested from where that ID ends. Two regexes
  // rather than one because the ID is case-sensitive and the role keys are
  // not (the parsers that read them are `gi`), which one pattern cannot say.
  // A parenthesised qualifier between the two — `CITY-14 (resumed) worker=…`,
  // the shape a run heading already allows after its date — is still a group
  // somebody wrote: the parser will not read it, and saying so by name is the
  // whole point. Nothing else may stand there, or a sentence that happens to
  // mention a ticket becomes a group nobody can repair.
  const GROUP_TAIL = (keys) => new RegExp(`^(?:\\s*\\([^)\\n]*\\))?(?:\\s+round=\\d+)?(?:${WRITTEN_PAIR(keys)})+`, 'i')
  // "Carries values" differs by ledger, and for the three counting ones it is
  // NOT any digit: `**Cache reads:** total=5811654r (2 workers ran)` is the
  // complete line of a run that selected no ticket, and a warn it cannot
  // clear teaches its reader to ignore the rest.
  const CARRIES_FIGURE = (keys) => new RegExp(`\\b(?:${keys})=\\d`, 'i')
  // The GROUPS a paragraph writes, each with the span it owns: from its `<ID>`
  // to the next `;`, the next group-position `<ID>`, or the paragraph's end.
  // The span is the unit because the ticket is not: `C-1 round=1 worker=1000r;
  // C-1 round=2 worker=4,812,330r` writes two groups for one ticket, and a
  // count kept per ticket lets the first answer for the second.
  const writtenSpans = (paraText, keys) => {
    const starts = []
    const tail = GROUP_TAIL(keys)
    for (const m of paraText.matchAll(ID_AT_START)) {
      if (tail.test(paraText.slice(m.index + m[1].length))) starts.push({ id: m[1], at: m.index })
    }
    return starts.map((s, i) => {
      const nextGroup = i + 1 < starts.length ? starts[i + 1].at : paraText.length
      const semi = paraText.indexOf(';', s.at)
      const end = semi !== -1 && semi < nextGroup ? semi : nextGroup
      return { id: s.id, at: s.at, text: paraText.slice(s.at, end) }
    })
  }
  //
  // Every ledger of this shape goes through one loop, parameterised by its
  // keys rather than copied — Peak context and Findings are the same shape
  // under different keys, and a copy is where the newest ledger's warn would
  // have been forgotten.
  const LABELLED = [
    ['cache', CACHE_GROUP, CACHE_PAIR, ROLE_RE, CACHE_FIGURE],
    ['models', MODEL_GROUP, MODEL_PAIR, ROLE_RE, null],
    ['peak', PEAK_GROUP, PEAK_PAIR, ROLE_RE, PEAK_FIGURE],
    ['findings', FINDING_GROUP, FINDING_PAIR, FINDING_RE, null],
  ]
  const flushLabelled = () => {
    if (!region) return
    const split = splitLedgerParagraphs(text)
    for (const [kind, groupRe, pairRe, keys, figure] of region.entry ? LABELLED.filter(([k]) => k === 'findings') : LABELLED) {
      const paras = split.paragraphs[kind]
      const inRecord = paras.flatMap((p) => p.groups.map((g) => g.id))
      const label = region[`${kind}Line`]
      const all = paras.map((p) => p.text).join('\n')
      const spans = paras.map((p) => writtenSpans(p.text, keys))
      // A shape warn needs a VALUE somebody tried to record — a `<key>=` — in
      // every ledger. A ticket merely named in prose is not one: the meter's
      // own idle line, `**Models:** none — no ticket ran`, takes a note beside
      // it ("(P-2 was skipped)") like any other line, and the only thing that
      // would clear a warn about P-2 is a figure invented for it, which these
      // ledgers never carry. For the counting ones the value has to be a
      // DIGIT, for the reason `CARRIES_FIGURE` gives.
      const carries = kind === 'models' ? ROLE_ASSIGN.test(all) : CARRIES_FIGURE(keys).test(all)
      // The shape warn is for a paragraph with no group POSITION in it at all
      // — a line written as prose, which has no group to name. Where groups
      // were written, every one that came up short is named instead: the same
      // information, one ticket at a time, with the repair attached to it.
      if (!spans.some((s) => s.length) && label !== undefined && carries) misses.push({ kind: `${kind}-shape`, line: label, heading: region.heading })
      else
        paras.forEach((p, i) => {
          // A later paragraph of the same kind restating the ticket's group is
          // the repair the message advertises, and it clears this one.
          const later = new Set(paras.slice(i + 1).flatMap((q) => q.groups.map((g) => g.id)))
          const writtenPairs = new RegExp(WRITTEN_PAIR(keys), 'gi')
          for (const span of spans[i]) {
            if (later.has(span.id)) continue
            const written = [...span.text.matchAll(writtenPairs)].length
            let read = 0
            for (const m of span.text.matchAll(groupRe)) if (m[1] === span.id) read += [...m[3].matchAll(pairRe)].length
            if (read >= written) continue
            const line = region.line + 1 + p.start + p.text.slice(0, span.at).split('\n').length - 1
            misses.push({ kind: `${kind}-lost`, line, heading: region.heading, ids: [span.id], partial: read > 0 })
          }
        })
      // Every record's stray figures are looked at whatever the paragraphs
      // said: a lost group and a figure nothing read are two different losses.
      // Only the unit-carrying ledgers have a stray half: a model name and a
      // findings count have no shape to scan for outside their paragraph —
      // `important=3` in a sentence looks exactly like `important=3` in the
      // line, and a warn on every mention is a warn nobody reads.
      if (figure) strayFigure(kind, figure, split, inRecord, paras)
    }
    // The Halt line's near-miss, asked the way the counting ledgers' are: per
    // WRITTEN unit, never "did anything parse in this paragraph". The unit
    // here is the `;`-separated segment, because that is what the writer
    // separates halts with — and the loss the paragraph-wide question misses
    // is the common one: `**Halt:** blocked CITY-14 — the worker died;
    // releaseCheck` parses `releaseCheck`, so the paragraph answers "yes",
    // and the halt that actually stopped the run is gone.
    //
    // Cleared by the repair the message advertises: a LATER Halt paragraph in
    // this record — an addendum's — that parses. It restates **only the halts
    // the line lost**, because every Halt paragraph in a record is counted
    // and a full restatement would count the readable ones twice. That is the
    // one place this differs from the cache and models repairs, where a
    // restated group replaces the ticket's earlier reading rather than adding
    // to it.
    const haltParas = region.entry ? [] : split.paragraphs.halt
    haltParas.forEach((p, i) => {
      const later = haltParas.slice(i + 1)
      const body = p.text.replace(new RegExp(`^${HALT_LABEL}`), '')
      let at = 0
      for (const seg of body.split(';')) {
        const segAt = at
        at += seg.length + 1
        if (!seg.trim() || HALT_SEGMENT.test(seg)) continue
        // What clears it: a later Halt paragraph in this record restating the
        // halt this segment lost. Where the segment NAMES a ticket, only a
        // later group naming that same ticket counts — an addendum about some
        // other halt must not answer for this one, which is the same rule the
        // cache and models warns are keyed on. Where it names none, any later
        // paragraph clears it: an epic-level halt has no key, and nothing
        // better can be known about which halt an addendum meant.
        const named = [...seg.matchAll(ID_AT_START)].map((m) => m[1])
        if (named.length ? later.some((q) => q.groups.some((g) => named.includes(g.id))) : later.some((q) => q.groups.length)) continue
        misses.push({
          kind: 'halt-lost',
          line: region.line + 1 + p.start + body.slice(0, segAt).split('\n').length - 1,
          heading: region.heading,
          segment: seg.trim().replace(/\s+/g, ' ').slice(0, 120),
        })
      }
    })
  }
  // A cache figure on a line whose own ticket no Cache reads group of this
  // record answers for. Whose own: the ticket in group position directly
  // before the figure — never every ID on the line, which named tickets of
  // other epics quoted in the same sentence and could be cleared by nothing.
  // Case-sensitive, and starting a token, for the reason `ID_AT_START` is.
  const FIGURE_OWNER = (figure) => new RegExp(`(?<=^|[\\s;(])(${TICKET_ID})|${figure.source}`, 'g')
  const strayFigure = (kind, figure, split, inRecord, paras) => {
    const have = new Set(inRecord)
    const owner = FIGURE_OWNER(figure)
    // A stray is a figure OUTSIDE the ledger's own paragraph, by definition —
    // inside one it is a written group, and the group check has already named
    // it. Two warns with two different repairs for one comma is how a reader
    // learns to skip both.
    const inside = new Set(paras.flatMap((p) => Array.from({ length: p.end - p.start }, (_, k) => p.start + k)))
    for (const [i, l] of split.restLines) {
      if (inside.has(i) || !figure.test(l)) continue
      const owners = []
      let last = null
      for (const m of l.matchAll(owner)) {
        if (m[1]) last = m[1]
        else owners.push(last)
      }
      const named = owners.filter(Boolean)
      const missing = [...new Set(named.filter((id) => !have.has(id)))]
      if (named.length ? missing.length : !have.size) {
        misses.push({ kind: `${kind}-stray`, line: region.line + 1 + i, heading: region.heading, ids: missing })
        return
      }
    }
  }
  readFileSync(doc, 'utf8').split('\n').forEach((line, i) => {
    if (/^#{2,3}\s/.test(line)) {
      flush()
      flushTime()
      flushLabelled()
      // A ticket entry opens a region too, but only for the Findings check:
      // the ticket skill's review addendum is an advertised door for that
      // line, and a `nits=five` written there reached the ledger as nothing
      // with nobody to say so. Every other check stays where it was — a run
      // record's Tokens, Time, Cache reads, Models, Peak context and Halt
      // lines are the run lane's, and asking them of ticket entries would
      // raise warns on every log already written.
      region = RUN_HEADING.test(line)
        ? { line: i + 1, heading: line.trim(), tokensParagraph: '' }
        : STATUS_HEADING.test(line)
          ? { line: i + 1, heading: line.trim(), entry: true, tokensParagraph: '' }
          : null
      text = ''
      return
    }
    if (!region) return
    if (region.timeLine === undefined && /^\*\*Time:\*\*/i.test(line)) region.timeLine = i + 1
    if (region.cacheLine === undefined && /^\*\*Cache reads:\*\*/i.test(line)) region.cacheLine = i + 1
    if (region.modelsLine === undefined && /^\*\*Models:\*\*/i.test(line)) region.modelsLine = i + 1
    if (region.peakLine === undefined && /^\*\*Peak context:\*\*/i.test(line)) region.peakLine = i + 1
    if (region.findingsLine === undefined && /^\*\*Findings:\*\*/i.test(line)) region.findingsLine = i + 1
    if (region.haltLine === undefined && /^\*\*Halt:\*\*/i.test(line)) region.haltLine = i + 1
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
  flushLabelled()
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

// ── what the commit subjects record ──────────────────────────────────────────
// Two marks a subject may carry, both derived from the same scan and both
// costing the writer one suffix.
//
//   `(review fix)`  — the commit that fixed a review finding. The subject
//                     shape the ticket skill's step 8, the quick skill's
//                     review step and the run driver's disposition prompt all
//                     spell (`<ID>: <what changed> (review fix)`), so the
//                     count of them is REWORK: how much of a ticket was
//                     written twice because a reviewer read it.
//   `(fixes <ID>)`  — a later commit repairing an ALREADY-SHIPPED ticket.
//                     That is an escaped defect: the review, the acceptance
//                     checks and the release check all passed, and the defect
//                     shipped anyway. Nothing else in the repository records
//                     one — the fix is somebody else's ticket, with its own
//                     entry and its own green ledger — so without the suffix
//                     the most expensive class of miss is the one class the
//                     retro cannot see.
//
// Both are read off subjects for the reason shipped detection is: a subject
// is the one piece of a commit that survives a rebase, a cherry-pick and a
// squash. Neither disturbs shipped detection, which anchors at the START of
// the subject — `Q-7: fix the crash (fixes AUTH-3)` ships Q-7 and only Q-7.
const REVIEW_FIX = /\(review fix(?:es)?\)/i
// The word is read whatever its case; the ID is NOT, because shipped
// detection is case-sensitive and `(fixes unr-4)` would otherwise become a
// ticket ID no scan can ever match — a phantom that reads as a real reference
// to a ticket nobody planned. Read strictly, it is simply unreadable, which
// is both true and reported.
const FIXES_SUFFIX = new RegExp(`\\([Ff][Ii][Xx][Ee][Ss]\\s+(${TICKET_ID})\\)`, 'g')
// …and every `(fixes …)` the strict form did NOT read. One ID is the taught
// shape, so anything else is a writer's mistake — but a mistake that vanishes
// is worse than one that is wrong: `(fixes MET-1, MET-2)`, `(fixes met-1)`,
// `(fixes the crash)` all name an intention the strict regex drops in silence,
// and the count of escaped defects is exactly the kind of figure that reads
// fine while being quietly low. Reported rather than parsed leniently: a
// lenient read would have to guess which of several spellings meant what, and
// this ledger's whole rule is that a figure nobody wrote plainly is not an
// observation.
const FIXES_NEAR = /\(fixes\b([^)]*)\)/gi
// …and the filter on what is worth reporting: something ticket-ID-shaped,
// compared case-insensitively. Anything else in those parentheses is not this
// repository's convention — `(fixes #12)` is an issue tracker's and `(fixes
// the flaky test)` is a sentence — and a row about it would sit in
// `unmatchedFixes` for ever in every project that writes either.
const LOOSE_ID = new RegExp(`\\b${TICKET_ID}\\b`, 'i')

// Every ticket-subjected commit reachable from any ref, once per subject, with
// the two marks read off it. `--all` reaches a rebased or cherry-picked commit
// under each ref it sits on; same subject is the same piece of work.
function subjectMarks() {
  const failed = []
  // Author date beside the subject: a rebase or a cherry-pick rewrites the
  // COMMITTER date and keeps the author's, so the pair is one piece of work
  // reached under several refs, while two real fixes that happen to share a
  // subject ("address feedback (review fix)") are two rows and counted twice.
  // Deduplicating on the subject alone lost the second of those.
  //
  // The limit, stated rather than papered over: two fixes with the SAME
  // subject in the same second still read as one. Nothing cheap separates
  // them — the author and committer names are identical, the committer date
  // is what a rebase rewrites, and the patch is the only real discriminator
  // and costs a diff per commit on a scan of four thousand. A rework count
  // one low on a scripted burst is a better trade than a `git show` per
  // commit, and the spend skill says so where it explains the count.
  const out = git(['log', '--all', '--no-merges', '--format=%at%x09%s', '-n', String(MAIN_SCAN_LIMIT)], { allowFail: true, report: failed })
  const lines = out ? out.split('\n') : []
  // Before the dedup, never after: `capped` asks whether the SCAN reached its
  // limit, and a history of four thousand repeated subjects read as
  // uncapped once it had been collapsed to one.
  const capped = lines.length >= MAIN_SCAN_LIMIT
  const owner = new RegExp(`^(${TICKET_ID})[:\\s]`)
  const rework = {}
  for (const line of new Set(lines)) {
    const tab = line.indexOf('\t')
    const subject = tab === -1 ? line : line.slice(tab + 1)
    const m = subject.match(owner)
    if (!m || !REVIEW_FIX.test(subject)) continue
    rework[m[1]] = (rework[m[1]] || 0) + 1
  }
  return { rework, capped, failed }
}

// Escaped defects: `(fixes <ID>)` on a commit that reached the DEFAULT BRANCH.
// Only there — a fix still on a branch has not shipped, and counting it would
// say a released defect was repaired before it was. Keyed by the ID the
// suffix names; `by` is the ticket whose commit carries it, which is how a
// retro finds the repair from the miss.
// One pass, and it returns the SHIPPED set beside the suffixes deliberately:
// whether a `(fixes <ID>)` names a shipped ticket is the whole question, and
// answering it from a second scan with a second command is how the two
// answers drift. The command is `idsOnRef`'s, subject for subject, so
// "shipped" here means exactly what the board means by it.
// Where a commit REACHED the default branch, which is not where it was
// written. A release epic commits its tickets on `epic/<name>` and brings
// them over in one merge, so a ticket committed weeks ago can arrive after a
// hotfix committed yesterday — and the arrival is what a user saw. So the
// landing position of every commit is the index, along the default branch's
// FIRST-PARENT chain, of the commit that brought it in: everything reachable
// from F_i and not from F_(i-1) landed at i, and larger is later.
//
// One `git log` for the whole branch, never one call per commit: this runs on
// repositories with thousands of commits, and a per-commit `git` is how a
// board command becomes a command nobody runs.
function landingPositions(ref) {
  const failed = []
  const out = git(['log', ref, '--format=%H %P%x09%s', '-n', String(MAIN_SCAN_LIMIT)], { allowFail: true, report: failed })
  const lines = out ? out.split('\n') : []
  const parents = new Map()
  const subjects = new Map()
  const order = []
  for (const l of lines) {
    const tab = l.indexOf('\t')
    if (tab === -1) continue
    const [hash, ...ps] = l.slice(0, tab).split(' ').filter(Boolean)
    if (!hash) continue
    parents.set(hash, ps)
    subjects.set(hash, l.slice(tab + 1))
    order.push(hash)
  }
  // The first-parent chain, newest first, then reversed: positions have to be
  // handed out oldest first, or a merge's side branch would be assigned
  // before the chain commit that actually brought it in.
  const chain = []
  for (let h = order[0]; h && parents.has(h); h = parents.get(h)[0]) chain.push(h)
  chain.reverse()
  const at = new Map()
  chain.forEach((head, i) => {
    const stack = [head]
    while (stack.length) {
      const c = stack.pop()
      // A commit already assigned landed earlier, and so did everything
      // behind it — which is what makes this one pass over the graph rather
      // than one traversal per merge.
      if (!parents.has(c) || at.has(c)) continue
      at.set(c, i)
      stack.push(...parents.get(c))
    }
  })
  // A depth-limited clone's oldest commit has parents git does not have, so
  // a ticket that landed before the boundary is invisible here — and "no
  // landing position" would otherwise be reported as "never shipped".
  const shallow = (git(['rev-parse', '--is-shallow-repository'], { allowFail: true }) || '').trim() === 'true'
  return { at, subjects, order, capped: lines.length >= MAIN_SCAN_LIMIT, shallow, failed }
}

// One pass, and it returns the LANDED set beside the suffixes deliberately:
// whether a `(fixes <ID>)` names a ticket that had reached the default branch
// is the whole question, and answering it from a second scan with a second
// command is how the two answers drift. "Reached" is `idsOnRef`'s rule,
// subject for subject, so it means what the board means by shipped.
function escapedDefects() {
  const { at, subjects, order, capped, shallow, failed } = landingPositions(`origin/${defaultBranch}`)
  const owner = new RegExp(`^(${TICKET_ID})[:\\s]`)
  const shipped = new Map() // id -> the EARLIEST landing among its commits
  const seen = new Map() // subject -> its earliest landing: one subject is one piece of work
  for (const hash of order) {
    const subject = subjects.get(hash)
    const pos = at.get(hash)
    if (pos === undefined) continue
    if (!seen.has(subject) || pos < seen.get(subject)) seen.set(subject, pos)
  }
  const byId = {}
  const unreadable = []
  for (const [subject, pos] of seen) {
    const by = subject.match(owner)
    if (by && (!shipped.has(by[1]) || pos < shipped.get(by[1]))) shipped.set(by[1], pos)
    for (const m of subject.matchAll(FIXES_NEAR)) {
      const strict = [...`(fixes${m[1]})`.matchAll(FIXES_SUFFIX)]
      if (!strict.length) {
        // Only when something ID-SHAPED was written there. `(fixes the flaky
        // test)` and `(fixes #12)` are other people's conventions, or plain
        // English, and a permanent row about them in every repository that
        // uses either is noise nobody can act on. Compared case-insensitively
        // on purpose: `city-1` is ours, misspelt, and that is the case worth
        // reporting.
        if (LOOSE_ID.test(m[1])) unreadable.push({ subject, wrote: m[0] })
        continue
      }
      const id = strict[0][1]
      // A commit naming ITSELF is a subject that read oddly, not an escape:
      // a ticket cannot ship a defect and repair it in the same commit.
      if (by && by[1] === id) continue
      ;(byId[id] ||= []).push({ by: by ? by[1] : null, subject, at: pos })
    }
  }
  return { byId, shipped, unreadable, capped, shallow, failed }
}

// An escape is a repair that reached the default branch AFTER the ticket it
// names did. The suffix alone does not say that: read as set membership, a
// `(fixes X)` that arrived while X was still on an epic branch — a sibling
// ticket repairing work no user had seen — counts as a defect that escaped,
// which is the one thing the word means. Nor does the commit DATE say it: a
// release epic's tickets are committed weeks before the merge that brings
// them over, so a hotfix written later can land first.
//
// STRICTLY later, so a fix and the ticket it names arriving in the SAME
// release merge is not an escape either — that is a defect caught before the
// release, which is the gates working. It shares the `predates` reason rather
// than getting one of its own: nothing reads the difference today, and a
// reason nobody reads is a field that drifts.
const escapesOf = (escapes, id) => {
  const from = escapes.shipped.get(id)
  const all = escapes.byId[id] || []
  return from === undefined ? { after: [], before: all } : { after: all.filter((f) => f.at > from), before: all.filter((f) => f.at <= from) }
}

function spendReport(epicFilter, data = board(epicFilter)) {
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
        const empty = { figures: {}, rounds: {}, unknown: new Set() }
        const time = r.time || empty
        const cache = r.cache || empty
        const models = r.models || empty
        const peak = r.peak || empty
        const findings = r.findings || empty
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
          // Cache reads per role, and the model each role ran on, from the run
          // records' own lines. A record written before either line existed
          // has neither, and reads `null` — never zero, which would say the
          // ticket read no cache, and never backfilled from anywhere.
          cache: {
            ...Object.fromEntries(SPEND_ROLES.map((role) => [role, cache.figures[role] ?? null])),
            unknown: [...cache.unknown].sort(),
            source: cache.source ?? null,
            rounds: Object.fromEntries(Object.entries(cache.rounds || {}).map(([role, rs]) => [role, Object.keys(rs).length])),
          },
          models: {
            ...Object.fromEntries(SPEND_ROLES.map((role) => [role, models.figures[role] ?? null])),
            unknown: [...models.unknown].sort(),
            source: models.source ?? null,
          },
          // The largest context window each role's agents ever held — a MAX,
          // per role, and never a sum: `rounds` counts the passes the max was
          // taken over, not figures that were added.
          peak: {
            ...Object.fromEntries(SPEND_ROLES.map((role) => [role, peak.figures[role] ?? null])),
            unknown: [...peak.unknown].sort(),
            source: peak.source ?? null,
            rounds: Object.fromEntries(Object.entries(peak.rounds || {}).map(([role, rs]) => [role, Object.keys(rs).length])),
          },
          // What the review found and what became of it. The counts are the
          // ticket's, not a role's — one reviewer and one disposition
          // produced them between them.
          findings: {
            ...Object.fromEntries(FINDING_KEYS.map((key) => [key, findings.figures[key] ?? null])),
            unknown: [...findings.unknown].sort(),
            source: findings.source ?? null,
            rounds: Object.fromEntries(Object.entries(findings.rounds || {}).map(([key, rs]) => [key, Object.keys(rs).length])),
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
    const cacheTotals = Object.fromEntries(SPEND_ROLES.map((role) => [role, tickets.reduce((a, t) => a + (t.cache[role] || 0), 0)]))
    // A peak has no sum, so the epic's figure is the largest any ticket
    // recorded for that role — null where no ticket recorded one, never 0.
    const peakMax = Object.fromEntries(
      SPEND_ROLES.map((role) => {
        const seen = tickets.map((t) => t.peak[role]).filter((v) => v !== null)
        return [role, seen.length ? Math.max(...seen) : null]
      }),
    )
    const findingTotals = Object.fromEntries(FINDING_KEYS.map((key) => [key, tickets.reduce((a, t) => a + (t.findings[key] || 0), 0)]))
    epics.push({
      epic: epic.epic,
      tickets,
      totals,
      timeTotals,
      cacheTotals,
      peakMax,
      findingTotals,
      untimedTickets: tickets.filter((t) => t.time.wall === null).length,
      unknownTickets: tickets.filter((t) => t.total === null || t.unknown.length).length,
    })
  }
  return { epics, commitSpansCapped: spans.capped }
}

// ── derived metrics ──────────────────────────────────────────────────────────
// Five questions a retro asks that no single ledger answers, each derived from
// what is already recorded and nothing else:
//
//   pace     — what a worker model costs and how long it takes, per ticket
//   rework   — how many commits a ticket needed after its review
//   review   — what reviews found, and how much of it was left unfixed
//   halts    — what stopped the runs, by the driver's own halt kind
//   escaped  — defects that shipped and were repaired by a later ticket
//
// Everything here obeys the ledger's own rule: a figure nobody observed is
// `null`, never zero and never an estimate. So a sum is `null` when no ticket
// contributed one, and every figure carries how many tickets it was read from
// — "3 of 7" is the difference between a cheap epic and a mostly unmeasured
// one, and a bare total hides which it is.
//
// Duration is the run record's `wall` and ONLY that. A ticket's commit span is
// deliberately not a fallback here: commits begin when the work is nearly
// over, so a span would answer "how long did this take" with a number that is
// wrong in one direction, always, and mixing it with observed walls would make
// the pace table's rows incomparable with each other.
const observed = (list) => list.filter((v) => v !== null && v !== undefined)
const sumOf = (list) => (observed(list).length ? observed(list).reduce((a, b) => a + b, 0) : null)
const maxOf = (list) => (observed(list).length ? Math.max(...observed(list)) : null)

function metricsReport(epicFilter) {
  const data = board(epicFilter)
  requireKnownEpic(data, epicFilter)
  const spend = spendReport(epicFilter, data)
  const marks = subjectMarks()
  const escapes = escapedDefects()
  const byEpic = Object.fromEntries(data.epics.map((e) => [e.epic, e]))
  const epics = spend.epics.map((e) => {
    const tickets = e.tickets
    const sum = (pick) => {
      const vals = tickets.map(pick)
      return { value: sumOf(vals), from: observed(vals).length, of: tickets.length }
    }
    // 1. Pace, grouped by the model the WORKER ran on — the one role whose
    //    model choice the epic makes deliberately (`Worker model:`). A ticket
    //    whose record names none is grouped under `unknown` rather than
    //    dropped: how much of an epic went unmeasured is itself the finding.
    const groups = new Map()
    for (const t of tickets) {
      const model = t.models.worker ?? 'unknown'
      if (!groups.has(model)) groups.set(model, [])
      groups.get(model).push(t)
    }
    const pace = [...groups.entries()]
      .map(([model, list]) => {
        const f = (pick) => {
          const vals = list.map(pick)
          return { value: sumOf(vals), from: observed(vals).length, of: list.length }
        }
        const peaks = list.map((t) => t.peak.worker)
        return {
          model,
          tickets: list.length,
          ids: list.map((t) => t.id),
          // The worker ROLE's own figures — not the ticket's totals, which
          // carry the reviewer's spend and would price the worker model for
          // work another model did.
          tokens: f((t) => t.worker),
          cache: f((t) => t.cache.worker),
          // A peak is a max and stays one at every level.
          peak: { value: maxOf(peaks), from: observed(peaks).length, of: list.length },
          // …and `wall` is the TICKET's, first agent start to last agent end:
          // it is what a human waited through, and no role owns it.
          wall: f((t) => t.time.wall),
        }
      })
      .sort((a, b) => b.tickets - a.tickets || a.model.localeCompare(b.model))
    // 2. Rework — review-fix commits per ticket, off the subjects.
    const rework = tickets.map((t) => ({ id: t.id, state: t.state, fixes: marks.rework[t.id] || 0 })).filter((r) => r.fixes)
    // 3. Review effectiveness.
    const review = {
      important: sum((t) => t.findings.important),
      nits: sum((t) => t.findings.nits),
      unfixed: sum((t) => t.findings.unfixed),
      ticketsRecorded: tickets.filter((t) => t.findings.source !== null).length,
      ticketsWithImportant: tickets.filter((t) => (t.findings.important || 0) > 0).length,
    }
    // 4. Halts, by the driver's own kind. Counted from the logs, so a halt a
    //    human resolved by hand is still on the record — which is the point:
    //    what stopped runs is not what remains broken.
    const halts = []
    for (const h of parseHalts(byEpic[e.epic])) {
      let row = halts.find((x) => x.kind === h.kind)
      if (!row) halts.push((row = { kind: h.kind, count: 0, tickets: [] }))
      row.count++
      if (h.id && !row.tickets.includes(h.id)) row.tickets.push(h.id)
    }
    halts.sort((a, b) => b.count - a.count || a.kind.localeCompare(b.kind))
    // 5. Escaped defects — only for tickets that actually shipped: a
    //    `(fixes <ID>)` naming anything else is a mistake, and `doctor` says
    //    so rather than this counting it as an escape.
    const escaped = tickets
      .map((t) => ({ id: t.id, ...escapesOf(escapes, t.id) }))
      .filter((x) => x.after.length)
      .map((x) => ({ id: x.id, count: x.after.length, by: [...new Set(x.after.map((f) => f.by).filter(Boolean))] }))
    return {
      epic: e.epic,
      tickets: tickets.length,
      pace,
      rework,
      reworkCommits: rework.reduce((a, r) => a + r.fixes, 0),
      reworkTickets: rework.length,
      review,
      halts,
      haltCount: halts.reduce((a, h) => a + h.count, 0),
      escaped,
      escapedCommits: escaped.reduce((a, x) => a + x.count, 0),
      shippedTickets: tickets.filter((t) => t.state === 'shipped').length,
    }
  })
  return {
    epics,
    // Only when the caller asked for every epic: a "total" beside one epic's
    // own numbers would be the same numbers twice.
    totals: epicFilter
      ? null
      : {
          epics: epics.length,
          tickets: epics.reduce((a, e) => a + e.tickets, 0),
          reworkCommits: epics.reduce((a, e) => a + e.reworkCommits, 0),
          reworkTickets: epics.reduce((a, e) => a + e.reworkTickets, 0),
          haltCount: epics.reduce((a, e) => a + e.haltCount, 0),
          escapedCommits: epics.reduce((a, e) => a + e.escapedCommits, 0),
          important: sumOf(epics.map((e) => e.review.important.value)),
          nits: sumOf(epics.map((e) => e.review.nits.value)),
          unfixed: sumOf(epics.map((e) => e.review.unfixed.value)),
        },
    // `(fixes <ID>)` suffixes naming an ID that shipped nothing — a typo, or
    // a ticket of another repository. Reported rather than counted, and
    // reported HERE rather than by `doctor`: a commit subject on the default
    // branch cannot be rewritten, so a warn about one would be a warn nothing
    // could ever clear. Not scoped to the filtered epic — the ID belongs to
    // no epic, which is the point.
    // Every `(fixes …)` that counted as no escape, with the reason it did not
    // — reported HERE rather than by `doctor` wherever nothing could clear a
    // warn about it: a commit subject on the default branch cannot be
    // rewritten. Three reasons, each its own kind of writer error:
    //   not-shipped — names an ID nothing on the default branch shipped
    //   predates    — names a ticket that had not shipped yet when it landed,
    //                 so it repaired work no user had seen
    //   unreadable  — a `(fixes …)` the strict one-ID form could not read
    //                 (`(fixes A, B)`, a lower-case id, a sentence)
    // Not scoped to the filtered epic: two of the three name no epic's
    // ticket, which is the point.
    unmatchedFixes: [
      ...Object.entries(escapes.byId)
        .filter(([id]) => !escapes.shipped.has(id))
        .map(([id, fixes]) => ({ id, reason: 'not-shipped', count: fixes.length, subjects: fixes.map((f) => f.subject) })),
      ...Object.keys(escapes.byId)
        .filter((id) => escapes.shipped.has(id))
        .map((id) => ({ id, reason: 'predates', fixes: escapesOf(escapes, id).before }))
        .filter((x) => x.fixes.length)
        .map((x) => ({ id: x.id, reason: x.reason, count: x.fixes.length, subjects: x.fixes.map((f) => f.subject) })),
      ...escapes.unreadable.map((u) => ({ id: null, reason: 'unreadable', count: 1, subjects: [u.subject], wrote: u.wrote })),
    ],
    // Both scans are capped the way every other git scan here is, and a cap
    // read as "scanned everything" is how a count goes quietly low.
    commitScanCapped: marks.capped,
    mainScanCapped: escapes.capped,
    // A depth-limited clone has history git does not have, so a ticket that
    // landed before the boundary reads as never landed. Reported, not
    // guessed around: the same notice `check-epic` already carries.
    shallow: escapes.shallow,
    // …and a scan that FAILED, which is not an empty branch. Every figure
    // below that came from a failed scan is a zero nobody observed, and the
    // whole rule of this ledger is that such a figure is not reported as one.
    scanFailures: [...marks.failed, ...escapes.failed],
  }
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

function idsOnRef(ref, report = null) {
  const out = git(['log', ref, '--format=%s', '-n', String(MAIN_SCAN_LIMIT)], { allowFail: true, report })
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

const idsOnMain = (report) => idsOnRef(`origin/${defaultBranch}`, report)

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
  // Scans whose EMPTY result the board reads as a fact — "nothing shipped",
  // "nothing integrated". A failure here is not that fact, and the board,
  // `doctor` and `next` each say so rather than presenting `todo` as observed.
  const scanFailures = []
  const onMain = idsOnMain(scanFailures)

  const tickets = []
  const unticketed = {}
  for (const epic of epics) {
    const loose = unticketedCommits(epic.epic)
    if (loose.length) unticketed[epic.epic] = loose
    const status = parseStatus(epic)
    // Only release epics pay the extra log call, and only when their epic
    // branch exists on the remote — the remote, because integration is the
    // driver's push, and a local-only epic branch proves nothing.
    const onEpicBranch = epic.delivery === 'release' ? idsOnRef(`origin/epic/${epic.epic}`, scanFailures).ids : NO_IDS
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
    scanFailures: [...new Set(scanFailures)],
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
  // Loudest first: a scan that failed means the states below were not
  // derived, they were defaulted. `todo` on every ticket looks exactly like a
  // project nobody has started.
  if (data.scanFailures.length)
    console.log(
      `${C.red}a git scan failed, so the states below are NOT derived — a ticket that shipped reads as "todo": ${data.scanFailures.join('; ')}${C.off}\n`,
    )
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

  // A scan that should have worked and did not. `fail`, not `warn`: every
  // state on the board is derived from these scans, so a failure does not
  // make one row doubtful — it makes the whole board read as a project
  // nobody has started, and the run skill's preflight reads this exit code.
  // A ref that simply does not exist is not this (`MISSING_REF`): a fresh
  // repository with no `origin` and an epic whose branch was never pushed
  // both stay exactly as they were.
  for (const f of board(null).scanFailures)
    add('fail', `${f} — the board is not derived while this fails: every ticket reads "todo" whatever it actually is, and \`next\` refuses rather than telling a run the epic is built`)

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
      // In a parallel epic the status log is merged by a driver, several
      // times a run, with nobody present — and every way that has gone wrong
      // so far (git's `union`, a driver that silently did nothing) left
      // entries that still PARSE: a heading with its closing fields gone, or
      // moved under the next ticket's heading. The log's own rule is the
      // tripwire: "the **Owed** line is required even when empty". An entry
      // without one is a truncated entry until somebody shows otherwise, and
      // an **Owed:** line that is not the last field of its entry is one that
      // came from somewhere else. Scoped to epics that declare `Parallel:`,
      // because older logs in installed projects have entries that simply
      // predate the rule, and a plugin update must not start warning on them.
      if (epic.parallel > 1 && epic.statusDoc) {
        const log = readFileSync(epic.statusDoc, 'utf8').split('\n')
        let open = null // { id, line, owed }
        const close = () => {
          if (open && open.owed !== 1)
            add('warn', `${epic.epic}/status.md:${open.line} — ${open.id}'s entry has ${open.owed === 0 ? 'no' : open.owed} **Owed:** line${open.owed === 1 ? '' : 's'}; every entry carries exactly one, "Nothing." included. In an epic that declares "Parallel:" the log is merged by a driver between tickets, and a missing or doubled Owed line is what a bad merge of two entries looks like: compare this entry with the one on ${open.id}'s own branch (git show origin/${open.id.toLowerCase()}:epics/${epic.epic}/status.md) before trusting the log, the owed list or the release pull request's Owed section`)
        }
        log.forEach((line, i) => {
          const h = line.match(STATUS_HEADING)
          if (h || /^#{2,3}\s/.test(line)) {
            close()
            open = h ? { id: h[1], line: i + 1, owed: 0 } : null
          } else if (open && /^\*\*Owed:?\*\*/.test(line)) open.owed++
        })
        close()
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
        add(
          'warn',
          `${epic.epic}/tickets.md:${i + 1} — heading will not parse as a ticket (needs "## <ID> — <name>", ID uppercase): ${line.trim()}. Until it is fixed the ticket is on no board, and if it is the FIRST such heading its whole section is preamble — \`brief\` hands it to every worker of this epic as ground rules; otherwise it is the tail of the ticket above and reaches that worker as scope`,
        )
    })
    // The walkthrough's scenes name their tickets, and the names are checked
    // here because this copy — the one in the record — is the one no renderer
    // ever sees. Both doors, one rule.
    {
      const known = new Set(parseTickets(epic).map((t) => t.id))
      const { scenes, problems } = parseWalkthrough(readFileSync(epic.ticketsDoc, 'utf8'))
      for (const p of problems)
        add(
          'warn',
          `${epic.epic}/tickets.md:${p.line} — walkthrough scene ${p.scene} has a line about its tickets that will not parse, so nothing checks that the scene is built by anything (needs "**Tickets:** <ID>[, <ID>]" — bold label, bare ticket IDs of this epic, commas, nothing else on the line): ${p.text}`,
        )
      for (const s of scenes)
        for (const id of s.ids)
          if (!known.has(id))
            add(
              'warn',
              `${epic.epic}/tickets.md:${s.line} — walkthrough scene ${s.scene} names ${id}, which is not a ticket of this epic: the scene promises something nothing in the plan builds. Fix the scene or add the ticket by editing tickets.md — it is the plan, edited to re-plan; the status log is the append-only one`,
            )
    }
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
        // The cache ledger sums its rounds exactly as the token ledger does,
        // so it has the same hazard and the same warn. (The models ledger has
        // no `mixed` list: a union ignores nothing, so there is nothing to
        // report.)
        if (r.cache.mixed.length)
          add('warn', `${epic.epic} (${r.id}) — cache reads: ${r.cache.mixed.join(', ')} carr${r.cache.mixed.length === 1 ? 'ies' : 'y'} both round-labelled and unlabelled figures; spend counts the labelled rounds' sum and ignores the unlabelled figure`)
        // Findings sum their rounds too — two review passes found what they
        // each found — so the same hazard and the same warn. (Peak context
        // takes the larger reading rather than the sum, so it has no `mixed`
        // list either: a max ignores nothing.)
        if (r.findings.mixed.length)
          add('warn', `${epic.epic} (${r.id}) — findings: ${r.findings.mixed.join(', ')} carr${r.findings.mixed.length === 1 ? 'ies' : 'y'} both round-labelled and unlabelled counts; spend counts the labelled rounds' sum and ignores the unlabelled count`)
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
    // none, and the addendum that gives it some ends the warn. (The Cache
    // reads and Models checks ask this of the record in front of them, not of
    // the epic: see `runRecordNearMisses`.)
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
      for (const miss of runRecordNearMisses(doc, { timed }))
        if (miss.kind === 'time-shape')
          add('warn', `${epic.epic}/${name}:${miss.line} — the run record's Time line carries figures but no machine-shaped group, so spend reads no time from it (needs "<ID> worker=<n>s reviewer=<n>s disposition=<n>s re-review=<n>s proxies=<n>s wall=<n>s" per ticket — seconds, each with its "s" — "unknown" for any missing figure; \`scripts/meter.mjs <workflow-run-dir>\` prints the line); repair by appending a dated addendum beneath the record with the groups under its own "**Time:**" line — never by editing the record: ${miss.heading}`)
        else if (miss.kind === 'cache-shape')
          add('warn', `${epic.epic}/${name}:${miss.line} — the run record's Cache reads line carries figures but no machine-shaped group, so spend reads no cache reads from it (needs "<ID> worker=<n>r reviewer=<n>r disposition=<n>r re-review=<n>r proxies=<n>r" per ticket — each figure with its "r" and no commas, since "4,812,330r" is not machine-shaped — "unknown" for any missing figure; \`scripts/meter.mjs <workflow-run-dir>\` prints the line); repair by appending a dated addendum beneath the record with the groups under its own "**Cache reads:**" line — never by editing the record: ${miss.heading}`)
        else if (miss.kind === 'models-shape')
          add('warn', `${epic.epic}/${name}:${miss.line} — the run record's Models line records a value for a role but no machine-shaped group parses, so spend reads no model from it (needs "<ID> worker=<name> reviewer=<name> …" per ticket — one name per role from the meter's charset (a letter first, then letters, digits and ". _ : / -", ending in a letter or digit), two joined by "+" where an agent fell back, "unknown" where the transcript named none, groups separated by ";" — and **the paragraph carries groups and nothing else**: prose about the tier or the effort goes in a sentence of its own outside it, because a word beside a name ends the group there; \`scripts/meter.mjs <workflow-run-dir>\` prints the line); repair by appending a dated addendum beneath the record with the groups under its own "**Models:**" line — never by editing the record: ${miss.heading}`)
        else if (miss.kind === 'cache-stray')
          add('warn', `${epic.epic}/${name}:${miss.line} — a cache-read figure here was read by nothing${miss.ids.length ? `, and ${miss.ids.join(', ')} ${miss.ids.length === 1 ? 'has' : 'have'} no cache reads anywhere in this run record` : ', and no Cache reads group parses in this run record'}: cache reads are read ONLY inside a paragraph that starts "**Cache reads:**" (to the next blank line or bold label), so a figure quoted in the record's prose reaches no ledger — and one with commas ("4,812,330r") is not machine-shaped wherever it sits. Repair by appending a dated addendum beneath the record with the groups under a "**Cache reads:**" line of its own — "<ID> worker=<n>r reviewer=<n>r …", each figure with its "r", "unknown" for any missing one, as \`scripts/meter.mjs <workflow-run-dir>\` prints them — never by editing the record: ${miss.heading}`)
        else if (miss.kind === 'cache-lost')
          add('warn', `${epic.epic}/${name}:${miss.line} — this Cache reads paragraph gives the ledger ${miss.partial ? 'only part of what it writes for' : 'nothing for'} ${miss.ids.join(', ')}: a group, or one pair inside it, that will not parse is the same silence as no line at all, and a sibling group parsing beside it hides nothing. Cache reads are read from "<ID> worker=<n>r reviewer=<n>r … " groups inside a paragraph that starts "**Cache reads:**" (to the next blank line or bold label) — each figure with its "r" and no commas ("4,812,330r" is not machine-shaped), "unknown" for any missing figure; \`scripts/meter.mjs <workflow-run-dir>\` prints the line. Repair by appending a dated addendum beneath the record with the groups restated under a "**Cache reads:**" line of its own — never by editing the record: ${miss.heading}`)
        else if (miss.kind === 'models-lost')
          add('warn', `${epic.epic}/${name}:${miss.line} — this Models paragraph gives the ledger ${miss.partial ? 'only part of what it writes for' : 'nothing for'} ${miss.ids.join(', ')}: a pair that will not parse is the same silence as no line at all, and a sibling group parsing beside it hides nothing. Models are read from "<ID> worker=<name> reviewer=<name> …" groups inside a paragraph that starts "**Models:**" (to the next blank line or bold label), and **that paragraph carries groups and nothing else** — one name per role from the meter's own charset (a letter first, then letters, digits and ". _ : / -", ending in a letter or digit), two joined by "+" where an agent fell back, "unknown" where the transcript named none, groups separated by ";". Any prose about the run — the tier, the effort, a note — goes in a sentence of its own OUTSIDE the paragraph (after a blank line, or under another bold label), because a word beside a name ends the group there: "worker=claude-opus-5 as reported" reads as nothing rather than as a name nobody ran. \`scripts/meter.mjs <workflow-run-dir>\` prints the line. Repair by appending a dated addendum beneath the record with the groups restated under a "**Models:**" line of its own — never by editing the record: ${miss.heading}`)
        else if (miss.kind === 'peak-shape')
          add('warn', `${epic.epic}/${name}:${miss.line} — the run record's Peak context line carries figures but no machine-shaped group, so spend reads no peak from it (needs "<ID> worker=<n>c reviewer=<n>c disposition=<n>c re-review=<n>c proxies=<n>c" per ticket — each figure with its "c" and no commas, since "1,204,331c" is not machine-shaped — "unknown" for any missing figure, and no total, because a max has no sum; \`scripts/meter.mjs <workflow-run-dir>\` prints the line); repair by appending a dated addendum beneath the record with the groups under its own "**Peak context:**" line — never by editing the record: ${miss.heading}`)
        else if (miss.kind === 'peak-lost')
          add('warn', `${epic.epic}/${name}:${miss.line} — this Peak context paragraph gives the ledger ${miss.partial ? 'only part of what it writes for' : 'nothing for'} ${miss.ids.join(', ')}: a group, or one pair inside it, that will not parse is the same silence as no line at all, and a sibling group parsing beside it hides nothing. Peaks are read from "<ID> worker=<n>c reviewer=<n>c …" groups inside a paragraph that starts "**Peak context:**" (to the next blank line or bold label) — each figure with its "c" and no commas, "unknown" for any missing figure; \`scripts/meter.mjs <workflow-run-dir>\` prints the line. Repair by appending a dated addendum beneath the record with the groups restated under a "**Peak context:**" line of its own — never by editing the record: ${miss.heading}`)
        else if (miss.kind === 'peak-stray')
          add('warn', `${epic.epic}/${name}:${miss.line} — a peak-context figure here was read by nothing${miss.ids.length ? `, and ${miss.ids.join(', ')} ${miss.ids.length === 1 ? 'has' : 'have'} no peak anywhere in this run record` : ', and no Peak context group parses in this run record'}: peaks are read ONLY inside a paragraph that starts "**Peak context:**" (to the next blank line or bold label), so a figure quoted in the record's prose reaches no ledger — and one with commas ("1,204,331c") is not machine-shaped wherever it sits. Repair by appending a dated addendum beneath the record with the groups under a "**Peak context:**" line of its own — "<ID> worker=<n>c reviewer=<n>c …", each figure with its "c", "unknown" for any missing one, as \`scripts/meter.mjs <workflow-run-dir>\` prints them — never by editing the record: ${miss.heading}`)
        else if (miss.kind === 'findings-shape')
          add('warn', `${epic.epic}/${name}:${miss.line} — a Findings line here carries counts but no machine-shaped group, so spend reads no findings from it (needs "<ID> important=<n> nits=<n> unfixed=<n>" per ticket, groups separated by ";" — bare counts, no unit, "unknown" for any the run could not observe; the run driver's result carries them per ticket as a derived \`findings\` object, and the ticket skill's review addendum is the other door that writes this line); repair by appending a dated addendum beneath the record with the groups under its own "**Findings:**" line — never by editing the record: ${miss.heading}`)
        else if (miss.kind === 'findings-lost')
          add('warn', `${epic.epic}/${name}:${miss.line} — this Findings paragraph gives the ledger ${miss.partial ? 'only part of what it writes for' : 'nothing for'} ${miss.ids.join(', ')}: a group, or one pair inside it, that will not parse is the same silence as no line at all, and a sibling group parsing beside it hides nothing. Findings are read from "<ID> important=<n> nits=<n> unfixed=<n>" groups inside a paragraph that starts "**Findings:**" (to the next blank line or bold label) — those three keys and no others, bare counts, "unknown" for any the run could not observe. Repair by appending a dated addendum beneath the record with the groups restated under a "**Findings:**" line of its own — never by editing the record: ${miss.heading}`)
        else if (miss.kind === 'halt-lost')
          add('warn', `${epic.epic}/${name}:${miss.line} — this Halt paragraph writes something \`metrics\` counts as no halt at all: ${JSON.stringify(miss.segment)}. A halt is \`<kind> <ID>\` and nothing else — the driver's own kind (the \`STOP\` key its result carries as \`haltKinds\`, not the sentence under "**Halted on:**"), and the ticket when there was one; an epic-level halt like the release check is "<kind>" alone, with nothing in ID position. Several halts are separated by ";", and **the paragraph carries groups and nothing else**: a word standing beside a kind ends the group there, so "blocked PAY-1 — the worker died" reads as nothing while a sibling "releaseCheck" beside it reads fine and makes the line look answered. The sentence about what happened belongs under "**Halted on:**" and "**Diagnosis:**", where it always did. Repair by appending a dated addendum beneath the record with a "**Halt:**" line of its own carrying **only the halts this line lost** — every Halt paragraph in a record is counted, so restating the ones that already parse would count them twice — never by editing the record: ${miss.heading}`)
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

  // A `(fixes <ID>)` suffix on the default branch that names a ticket this
  // repository has PLANNED and not yet shipped. That is an escaped defect
  // claimed before there was anything to escape from — `metrics` counts it as
  // nothing, and the count is the whole reason the suffix exists.
  //
  // Warn, never fail: the suffix is bookkeeping and gates nothing. And warned
  // only for a planned ticket, because the recovery has to WORK in the
  // refused state and a commit subject on the default branch can never be
  // rewritten: a planned ticket ships, and the warn ends by itself the moment
  // it does. A suffix naming an ID no epic plans has no such end, so no warn
  // is raised for one that nothing could clear — `metrics` lists it under
  // `unmatchedFixes` instead, where it is information rather than an alarm.
  {
    const escapes = escapedDefects()
    for (const [id, fixes] of Object.entries(escapes.byId)) {
      if (escapes.shipped.has(id) || !seen[id]) continue
      add(
        'warn',
        `${seen[id][0]} (${id}) — ${fixes.length} commit${fixes.length === 1 ? '' : 's'} on ${defaultBranch} carr${fixes.length === 1 ? 'ies' : 'y'} "(fixes ${id})", but ${id} has not shipped, so there is no released defect for it to have escaped and \`metrics\` counts none: ${fixes.map((f) => JSON.stringify(f.subject)).join(', ')}. The suffix marks a later commit repairing an ALREADY-SHIPPED ticket. **This ends when ${id} ships, and nothing else ends it** — a commit subject on ${defaultBranch} is never rewritten, so if the suffix meant a different ticket there is no repair to make and no addendum that would clear this: read it as a note about the count, which \`metrics --json\` also carries under \`unmatchedFixes\``,
      )
    }
  }

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
// The text form of a `check-epic` report — from a run just made, or from a
// saved `--json` one (`--render`), which is why it reads the report and nothing
// else.
// Green is a fact about the counts, recomputed wherever a report is read —
// here for `--render`, and again in release-page.mjs — so that a report whose
// boolean disagrees with its rows, or that carries no usable counts at all,
// never reads as a pass.
function checkEpicGreen(r) {
  const int = (v) => Number.isInteger(v) && v >= 0
  const rows = Array.isArray(r.tickets) ? r.tickets : []
  return (
    r.allPassed === true && typeof r.head === 'string' && /^[0-9a-f]{40}$/.test(r.head) &&
    int(r.total) && int(r.passed) && r.passed === r.total && r.problems === 0 && r.skipped === 0 &&
    (r.delivery !== 'release' || (r.fetched === true && r.headIsRemote === true)) && r.headIsRemote !== false && !(r.dirty || []).length && rows.length > 0 &&
    rows.every((t) => int(t.total) && t.passed === t.total && !t.skipped && Array.isArray(t.checks) && t.checks.length === t.total && t.checks.every((c) => c.status === 'passed') && !(t.problems || []).length) &&
    rows.reduce((a, t) => a + t.total, 0) === r.total
  )
}

function printCheckEpic(r) {
  const remoteRef = `origin/epic/${r.epic}`
  console.log(`${C.bold}${r.epic}${C.off} ${C.dim}— release check at ${r.head ? r.head.slice(0, 12) : '(no HEAD)'} — sign-off ${r.signoff ? r.signoff.slice(0, 12) : 'not found in this history'}${C.off}`)
  if (r.headIsRemote === false) {
    const fix =
      r.headRelation === 'ahead'
        ? `this checkout is AHEAD of it — push what it carries (\`git push origin epic/${r.epic}\`) so the pull request carries what was checked`
        : r.headRelation === 'behind'
          ? `this checkout is BEHIND it — \`git checkout epic/${r.epic} && git pull --ff-only\``
          : `the two have diverged — reconcile them by hand before anything is released`
    console.log(`${C.red}this checkout is at ${r.head ? r.head.slice(0, 12) : '(no HEAD)'} and ${remoteRef} is at ${String(r.remoteHead).slice(0, 12)} — the release pull request carries the remote head, so this is not a check of it: ${fix}, then run it again.${C.off}`)
  }
  if (r.delivery === 'release' && r.fetched !== true)
    console.log(`${C.red}\`git fetch origin epic/${r.epic}\` failed, so nobody knows which commit the release pull request would carry — this is not a check of it. Fix the remote (or the network) and run it again.${C.off}`)
  else if (r.delivery === 'release' && r.headIsRemote !== true && r.headIsRemote !== false)
    console.log(`${C.red}there is no ${remoteRef}: a release epic's branch is pushed at sign-off, and without it there is nothing this checkout could be the head of.${C.off}`)
  if ((r.dirty || []).length)
    console.log(`${C.red}tracked files were modified and not committed BEFORE anything ran, so what would be checked is not the commit being released — nothing was run:${C.off}\n${r.dirty.map((l) => `  ${l}`).join('\n')}\n  commit or discard them, then run it again.`)
  if (r.shallow) console.log(`${C.yellow}this is a shallow clone: the sign-off commit found may only be the clone's boundary, so "criteria differ from sign-off" can be silently empty. \`git fetch --unshallow\` to trust it.${C.off}`)
  if (!r.tickets.length) console.log(`${C.red}no ticket of ${r.epic} is integrated or shipped — there is nothing to release${C.off}`)
  else if (r.total === 0) console.log(`${C.yellow}no landed ticket carries a CHECK criterion, so nothing was run — "passed" here says only that nothing failed to parse${C.off}`)
  const MARK = { passed: `${C.green}✓${C.off}`, skipped: `${C.yellow}↓${C.off}`, failed: `${C.red}✗${C.off}` }
  for (const t of r.tickets) {
    console.log(`\n${C.bold}${t.id}${C.off} ${C.dim}${t.passed}/${t.total}${t.compares.length ? ` — ${t.compares.length} COMPARE not re-verified here` : ''}${C.off}`)
    for (const c of t.checks) {
      console.log(`  ${MARK[c.status]} ${c.criterion || '(no criterion bullet above the CHECK line)'}`)
      if (c.status !== 'passed') console.log(`      $ ${c.check}\n      ${c.evidence}`)
    }
    for (const p of t.problems) console.log(`  ${C.red}!${C.off} line ${p.line}: ${p.why}: ${p.text}`)
    if (t.criteriaChanged)
      console.log(`  ${C.yellow}criteria differ from sign-off (${String(r.signoff).slice(0, 12)})${C.off}\n      was: ${t.criteriaChanged.was ? t.criteriaChanged.was.join(' | ') || '(none)' : '(ticket not in the signed-off document)'}\n      now: ${t.criteriaChanged.now.join(' | ') || '(none)'}`)
  }
  if (r.removedSinceSignoff.length)
    console.log(`\n${C.yellow}in the signed-off document and gone from this one — not checked, not listed anywhere else:${C.off}\n${r.removedSinceSignoff.map((x) => `  ${x.id}: ${x.was.join(' | ') || '(no criteria)'}`).join('\n')}`)
  if ((r.orphanIds || []).length)
    console.log(`\n${C.yellow}commits in this release carry a ticket ID no document knows — a ticket whose section was deleted is checked by nobody:${C.off} ${r.orphanIds.join(', ')}`)
  if (r.notLanded.length) console.log(`\n${C.yellow}not integrated, so not checked:${C.off} ${r.notLanded.map((t) => `${t.id} (${t.state})`).join(', ')}`)
  console.log(
    `\n${r.passed}/${r.total} checks passed across ${r.tickets.length} ticket(s), ${r.commandsRun} command run(s)${r.shared ? ' (--share: a command several tickets name ran once — right for test suites, wrong when any CHECK writes state)' : ''}` +
      (r.skipped ? ` — ${r.skipped} skipped, which does not pass` : '') +
      (r.problems ? ` — ${r.problems} malformed line(s), which fail` : ''),
  )
}

const ENTRY_FIELD = /^\*\*(?:(?:Built|Verified|Compared|Decisions|Deviation|Deviations closed|Owed|Resolves owed|Revert check|Mode|Tokens|Time|Cache reads|Models):\*\*|Addendum\b)/

function comparedIn(text, id) {
  const found = []
  let entry = null
  const lines = text.split('\n')
  lines.forEach((line, i) => {
    if (/^#{1,6}\s/.test(line)) {
      const m = line.match(STATUS_HEADING)
      entry = m ? m[1] : null
      return
    }
    if (entry !== id || !/^\*\*Compared:\*\*/.test(line)) return
    const rest = line.slice('**Compared:**'.length).trim()
    // A pasted table starts on the lines below the label, so an empty label
    // line is normal — but a label with nothing under it either, before the
    // next field, heading or end of file, is a field nobody filled in. That is
    // still counting and not judging: what the field SAYS is the reviewer's,
    // whether it says anything at all is this script's. It counted once, and a
    // bare label satisfied the driver's gate.
    //
    // Only a heading or one of the entry's OWN field labels closes the field.
    // "Any bold label" did once, in review: a two-width comparison recorded as
    // `**@ 1440:**` and `**@ 393:**` tables read as empty, and that is a ticket
    // that did the work halted by a gate saying it had not. An unknown label
    // is therefore body — the error this direction can make is counting a
    // field that says little, which the reviewer reads anyway.
    // A fence marker is a container, not content: an empty fenced block under
    // the label is still a field nobody filled in, and a table INSIDE a fence
    // counts on its first line — whatever that line looks like: `# hand-written
    // comparison @ 1440` inside a fence is a table's caption, not a heading, and
    // read as one it made a filled field empty. An unclosed fence still cannot
    // swallow the next field or the next ticket: those two close it regardless.
    let body = rest
    let fenced = false
    for (let j = i + 1; !body && j < lines.length; j++) {
      if (ENTRY_FIELD.test(lines[j]) || STATUS_HEADING.test(lines[j])) break
      if (/^\s*(```|~~~)/.test(lines[j])) {
        fenced = !fenced
        continue
      }
      if (!fenced && /^#{1,6}\s/.test(lines[j])) break
      body = lines[j].trim()
    }
    found.push({ line: i + 1, text: rest, empty: !body })
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
      preamble: epicPreamble(readFileSync(epic.ticketsDoc, 'utf8')),
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
    const all = comparedIn(text, t.id)
    const found = all.filter((f) => !f.empty)
    const empty = all.filter((f) => f.empty)
    if (json)
      emit({
        ticket: t.id,
        epicName: t.epic,
        logPath: logFromRef ? rel : epic.statusDoc,
        logFrom: logFromRef,
        compared: found.length,
        tables: found,
        empty,
      })
    else {
      const where = logFromRef ? `${rel} at ${logFromRef}` : epic.statusDoc
      console.log(`${C.bold}${t.id}${C.off} ${C.dim}— ${t.epic} — ${where}${C.off}\n${found.length} \`**Compared:**\` field(s) recorded`)
      for (const f of found) console.log(`  line ${f.line}: ${f.text.slice(0, 200) || '(the table follows on the next lines)'}`)
      for (const f of empty) console.log(`  line ${f.line}: an empty \`**Compared:**\` field — not counted: a label with no table, no \`owed —\` and no \`hand-written —\` under it records nothing`)
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

  case 'check-epic': {
    // The release check: every LANDED ticket's CHECK criteria, run on the
    // checkout as it stands — which is meant to be the epic branch's head after
    // its last refresh. A ticket's checks pass before ITS merge; nothing re-ran
    // them after the merges that came later, or after main was merged in, so
    // "every ticket was green" was never a claim about the thing being
    // released. This is that claim, made once, at the one commit it is about.
    //
    // Criteria are read from the checkout, not from a pinned ref: a human's
    // re-plan mid-epic is legitimate and a pin would ignore it. What a pin
    // protected against — a ticket quietly weakening an earlier ticket's gate —
    // is SHOWN instead: every ticket whose criteria differ from the commit that
    // first added the document (sign-off) is listed, was and now, for the human
    // who decides the release. Evidence, not a gate: the script cannot tell a
    // re-plan from a dodge, and a reader can.
    if (!arg) {
      console.error('usage: tickets.mjs check-epic <epic> [--json] [--share] [--list] [--render <report.json>]')
      process.exit(2)
    }
    // `--render <file>` runs nothing either: it prints a saved `--json` report
    // as the text ledger. The release body wants the text and the walkthrough
    // wants the JSON, and two invocations were two runs of every suite in the
    // epic — after the driver's own. One run, saved, read twice.
    const renderIdx = process.argv.indexOf('--render')
    if (renderIdx !== -1) {
      const file = process.argv[renderIdx + 1]
      let saved
      try {
        saved = JSON.parse(readFileSync(file, 'utf8'))
      } catch (e) {
        console.error(`tickets: cannot read ${file || '(no file given)'} as a check-epic --json report (${e.message})`)
        process.exit(2)
      }
      if (saved.epic !== arg) {
        console.error(`tickets: ${file} is the release check of "${saved.epic}", not of "${arg}"`)
        process.exit(2)
      }
      printCheckEpic(saved)
      // The exit code is recomputed from the report's own counts, never read
      // off one boolean: a saved file is a file anyone can edit, and the body
      // that quotes it must not be greener than the rows beside it.
      process.exit(checkEpicGreen(saved) ? 0 : 1)
    }
    const data = board(arg)
    requireKnownEpic(data, arg)
    const mine = data.tickets.filter((t) => t.epic === arg)
    const landed = mine.filter((t) => LANDED.has(t.state))
    const notLanded = mine.filter((t) => !LANDED.has(t.state)).map((t) => ({ id: t.id, state: t.state }))
    // `--list` runs nothing: it is how the unattended driver learns WHICH
    // tickets to check, one shell call each — a whole epic's suites in one
    // call can outlive the ten minutes a proxy's shell tool allows, and a
    // command killed there loses its answer. The count rides beside the list
    // for the reason `next --with-waiting` carries its own: the list reaches
    // the driver through a proxy's report, and an echo that dropped an ID
    // would be a ticket nobody checked.
    if (process.argv.includes('--list')) {
      emit({ epic: arg, landed: landed.map((t) => t.id), landedCount: landed.length, notLanded })
      process.exit(landed.length ? 0 : 1)
    }
    const epic = data.epics.find((e) => e.epic === arg)
    const rel = `epics/${arg}/tickets.md`
    const criteriaOf = (body, sources) => {
      const { checks, compares } = parseChecks(body, sources)
      return [...checks.map((c) => `CHECK: ${c.check}${c.expect === null ? '' : ` — EXPECT: ${c.expect}`}`), ...compares.map((c) => `COMPARE: ${c.compare}${c.landmarks ? ` — LANDMARKS: ${c.landmarks.join(', ')}` : ''}`)]
    }
    // Sign-off is the commit that first added the document to this history.
    const signoff = (git(['log', '--diff-filter=A', '--format=%H', '--reverse', '--', rel], { allowFail: true }) || '').split('\n').filter(Boolean)[0] || null
    const signedText = signoff ? git(['show', `${signoff}:${rel}`], { allowFail: true }) : null
    const signedSections = signedText ? parseTicketSections(signedText, arg) : []
    const signedSources = signedText ? parsePreambleText(signedText).designSources : null
    // Shared ACROSS tickets, never within one: a ticket that says `CHECK: mkdir
    // out` twice means two runs, and `check <ID>` — the gate the driver uses —
    // gives it two. So a ticket reads what earlier tickets ran, and adds its
    // own commands to the pool only when it is done. (A command that is not
    // idempotent across tickets still differs from running each ticket alone;
    // the driver's per-ticket steps are the gate, and this is the summary.)
    //
    // Sharing is OPT-IN (`--share`), because it assumes every CHECK is a
    // read-only probe: one that changes state — `sh migrate.sh`, then a probe
    // another ticket already ran — gets the earlier answer, and a failure
    // hides behind it. The default runs every line of every ticket, exactly as
    // `check <ID>` and the driver's per-ticket steps do, so this command and
    // the unattended gate cannot disagree. `--share` is the fast path for an
    // epic whose criteria are all test suites; `shared` in the report says
    // which kind of run it was, and the walkthrough repeats it.
    const each = !process.argv.includes('--share')
    // Both questions about WHAT is being checked are asked before anything
    // runs, and a wrong answer runs nothing.
    //
    // Tracked files modified and uncommitted: the criteria and the commands
    // read the working tree, so an uncommitted fix — or an uncommitted deletion
    // of a CHECK line — would be judged and the pushed commit certified. Asked
    // BEFORE the checks, because afterwards it cannot tell a pre-existing edit
    // from a file a CHECK regenerated (a build that rewrites a tracked
    // `dist/version.json` is not somebody's uncommitted work, and a check that
    // restores the file it read would hide one that was). Tracked files only:
    // what git ignores or has never seen is the project's own.
    const dirty = (git(['status', '--porcelain', '--untracked-files=no'], { allowFail: true }) || '').split('\n').filter(Boolean)
    // The remote head is FETCHED here, not trusted as last seen: another
    // session may have pushed, and "at the remote head" about a stale tracking
    // ref certifies a commit nobody is releasing. A fetch that fails leaves
    // the question unanswered, which is not a yes.
    const remoteRef = epic.delivery === 'release' ? `origin/epic/${arg}` : null
    const fetched = remoteRef ? git(['fetch', '--quiet', 'origin', `epic/${arg}`], { allowFail: true }) !== null : null
    const ran = new Map()
    let executions = 0
    const rows = landed.map((t) => {
      const { checks, compares, problems } = parseChecks(t.body, epic.designSources)
      const own = new Map()
      const used = new Set()
      // A dirty tree runs nothing: results about somebody's uncommitted edits
      // are not results about the release, and printing them invites reading
      // them as if they were.
      const results = dirty.length ? [] : checks.map((c, idx) => {
        // Only the FIRST use within this ticket may come from another ticket's
        // run (or seed the pool); every repeat runs, whoever ran it before.
        const first = !used.has(c.check)
        used.add(c.check)
        const pool = each || !first ? null : ran.has(c.check) ? ran : own
        if (!(pool && pool.has(c.check))) executions++
        return { ...runChecks([c], pool)[0], n: idx + 1 }
      })
      for (const [k, v] of own) if (!ran.has(k)) ran.set(k, v)
      const now = criteriaOf(t.body, epic.designSources)
      const was = signedSections.find((x) => x.id === t.id)
      const before = was ? criteriaOf(was.body, signedSources) : null
      return {
        id: t.id,
        state: t.state,
        total: checks.length,
        passed: results.filter((r) => r.passed).length,
        skipped: results.filter((r) => r.status === 'skipped').length,
        checks: results,
        compares: compares.map((c) => ({ compare: c.compare, landmarks: c.landmarks, status: 'not re-verified at the release commit — no browser here' })),
        problems,
        criteriaChanged: before === null ? (signoff ? { was: null, now } : null) : JSON.stringify(before) === JSON.stringify(now) ? null : { was: before, now },
      }
    })
    // A landed ticket's gate can be weakened more quietly than by editing it:
    // by deleting its section. It is then on no list at all — not landed, not
    // checked, not "changed" — so every ticket sign-off knew and the document
    // no longer does is named, with the criteria it took with it.
    const removedSinceSignoff = signedSections.filter((x) => !mine.some((t) => t.id === x.id)).map((x) => ({ id: x.id, was: criteriaOf(x.body, signedSources) }))
    // By hand this command IS the gate, and the pull request carries the
    // REMOTE head: a local branch one commit behind a breaking push is green
    // about a commit nobody is releasing.
    const remoteHead = remoteRef ? (git(['rev-parse', '--verify', '--quiet', remoteRef], { allowFail: true }) || '').trim() || null : null
    // Commits in this release whose subject carries a ticket ID that NO
    // document knows. A ticket added after sign-off and deleted again is in
    // neither the document nor the signed-off one, so `removedSinceSignoff`
    // cannot see it — but its commits are still here, under its ID.
    // Every epic's documents, not only this one's: a quick ticket cherry-picked
    // onto the epic is known to `epics/quick/`, and saying no document knows
    // it would be this command being wrong about the repository.
    const knownIds = new Set(board(null).tickets.map((t) => t.id))
    const orphanIds = [
      ...new Set(
        (git(['log', '--no-merges', '--format=%s', `origin/${defaultBranch}..HEAD`], { allowFail: true }) || '')
          .split('\n')
          .map((l) => (l.match(/^([A-Z][A-Z0-9]*-\d+)[:\s]/) || [])[1])
          .filter((id) => id && !knownIds.has(id) && !signedSections.some((x) => x.id === id)),
      ),
    ]
    const shallow = (git(['rev-parse', '--is-shallow-repository'], { allowFail: true }) || '').trim() === 'true'
    const sum = (k) => rows.reduce((a, r) => a + r[k], 0)
    const problems = rows.reduce((a, r) => a + r.problems.length, 0)
    const total = sum('total')
    const passed = sum('passed')
    const skipped = sum('skipped')
    // Nothing landed is not a release that passed its check.
    const head = (git(['rev-parse', 'HEAD'], { allowFail: true }) || '').trim() || null
    const headIsRemote = remoteHead === null ? null : head === remoteHead
    // Which way it differs decides the repair, and a recovery that names the
    // wrong one leaves the reader where they were.
    const isAncestor = (a, b) => spawnSync('git', ['merge-base', '--is-ancestor', a, b], { cwd: repoRoot }).status === 0
    const headRelation = headIsRemote !== false || !head ? null : isAncestor(remoteHead, head) ? 'ahead' : isAncestor(head, remoteHead) ? 'behind' : 'diverged'
    // For a release epic the remote head must be KNOWN and equal: a missing
    // `origin/epic/<name>`, or a fetch that failed, is a release nobody can
    // say this checkout describes.
    const atRemote = epic.delivery !== 'release' || (fetched === true && headIsRemote === true)
    const allPassed = landed.length > 0 && passed === total && problems === 0 && skipped === 0 && atRemote && dirty.length === 0
    const report = { epic: arg, delivery: epic.delivery, notRun: dirty.length > 0, head, remoteHead, fetched, headIsRemote, headRelation, dirty, signoff, shallow, shared: !each, total, passed, skipped, problems, allPassed, commandsRun: executions, tickets: rows, notLanded, removedSinceSignoff, orphanIds }
    if (json) emit(report)
    else printCheckEpic(report)
    process.exit(allPassed ? 0 : 1)
  }

  case 'release': {
    // Everything the release walkthrough shows that this script can derive —
    // one JSON object, for `release-page.mjs` to render. It lives here, not in
    // the renderer, for the reason `compared` does: entries are found by
    // STATUS_HEADING and fields by ENTRY_FIELD, and a second copy of either in
    // another file is a parser that drifts. Nothing is stored and nothing is
    // composed by hand: the page is a view of git, the status log and the run
    // record, regenerated on demand. It runs no CHECK — `check-epic --json` is
    // minutes of test suites, so its output is handed to the renderer as a
    // file rather than run twice.
    if (!arg) {
      console.error('usage: tickets.mjs release <epic> [--json]')
      process.exit(2)
    }
    const data = board(arg)
    requireKnownEpic(data, arg)
    const epic = data.epics.find((e) => e.epic === arg)
    const mine = data.tickets.filter((t) => t.epic === arg)
    const statusText = epic.statusDoc ? readFileSync(epic.statusDoc, 'utf8') : ''
    // A ticket's entries: every region under one of its headings (the entry
    // and any re-entry), split into fields at the entry's own labels. Text
    // before the first label of a region is kept as its `lead`.
    const entriesOf = (id) => {
      const out = []
      let cur = null
      let field = null
      let fenced = false
      let label = null // a field label still open: its closing `**` is on a later line
      for (const line of statusText.split(/\r?\n/)) {
        const h = line.match(STATUS_HEADING)
        // What closes an entry is what closes a field in `comparedIn`, for the
        // reason it says: inside a fence a `#` line is a pasted table's
        // caption, not a heading, and read as one it cut the entry there and
        // dropped every field after it — Owed and the review addendum included.
        // A ticket's own heading closes it whatever the fence says, so an
        // unclosed fence cannot swallow the next entry.
        if (h || (!fenced && /^#{1,3}\s/.test(line))) {
          cur = h && h[1] === id ? { heading: line.replace(/^#+\s*/, '').trim(), date: h[3], outcome: h[4], lead: '', fields: [] } : null
          if (cur) out.push(cur)
          field = null
          label = null
          fenced = false
          continue
        }
        if (!cur) continue
        if (/^\s*(```|~~~)/.test(line)) fenced = !fenced
        if (label !== null) {
          // A label wrapped over two lines (a long `**Addendum — … —` heading):
          // the label runs to the closing `**`, the field's text starts after it.
          const end = line.indexOf('**')
          if (end === -1) label += ` ${line.trim()}`
          else {
            field = { label: `${label} ${line.slice(0, end).trim()}`.replace(/:$/, '').trim(), text: line.slice(end + 2).trim() }
            cur.fields.push(field)
            label = null
          }
          continue
        }
        if (!fenced && ENTRY_FIELD.test(line)) {
          const f = line.match(/^\*\*([^*]+?)(?::\*\*|\*\*)\s?(.*)$/)
          if (f) {
            field = { label: f[1].replace(/:$/, '').trim(), text: f[2] }
            cur.fields.push(field)
          } else label = line.slice(2).trim()
        } else if (field) field.text += `\n${line}`
        else cur.lead += `${line}\n`
      }
      for (const e of out) {
        e.lead = e.lead.trim()
        for (const f of e.fields) f.text = f.text.trim()
      }
      return out
    }
    const range = `origin/${defaultBranch}..HEAD`
    const log = git(['log', '--no-merges', '--reverse', '--format=%H%x09%s', range], { allowFail: true }) || ''
    const commits = log.split('\n').filter(Boolean).map((l) => {
      const [sha, ...rest] = l.split('\t')
      const subject = rest.join('\t')
      const m = subject.match(/^([A-Z][A-Z0-9]*-\d+)[:\s]/)
      const stat = (git(['show', '--shortstat', '--format=', sha], { allowFail: true }) || '').trim()
      return { sha, subject, ticket: m ? m[1] : null, stat }
    })
    const remote = (git(['remote', 'get-url', 'origin'], { allowFail: true }) || '').trim()
    // Anchored to the host: `mygithub.com/o/r` is not github.com/o/r.
    const web = remote.match(/(?:^|[@/])github\.com[:/]([^/]+\/[^/]+?)(?:\.git)?$/)
    const { deviations } = parseDeviations(epic)
    const { owed, notes: owedNotes } = parseOwed(epic)
    // The latest run record, verbatim: what the run said about itself, halts
    // included. Quoted rather than parsed — its grammar belongs to `spend`.
    let lastRun = null
    if (epic.runsDoc && existsSync(epic.runsDoc)) {
      const lines = readFileSync(epic.runsDoc, 'utf8').split('\n')
      const starts = lines.map((l, i) => (RUN_HEADING.test(l) ? i : -1)).filter((i) => i !== -1)
      if (starts.length) lastRun = { heading: lines[starts[starts.length - 1]].replace(/^#+\s*/, '').trim(), text: lines.slice(starts[starts.length - 1] + 1).join('\n').trim() }
    }
    const out = {
      epic: arg,
      delivery: epic.delivery,
      defaultBranch,
      head: (git(['rev-parse', 'HEAD'], { allowFail: true }) || '').trim() || null,
      branch: (git(['rev-parse', '--abbrev-ref', 'HEAD'], { allowFail: true }) || '').trim() || null,
      webUrl: web ? `https://github.com/${web[1]}` : null,
      diffstat: (git(['diff', '--shortstat', `origin/${defaultBranch}...HEAD`], { allowFail: true }) || '').trim(),
      tickets: mine.map((t) => ({
        id: t.id,
        title: t.title,
        state: t.state,
        entries: entriesOf(t.id),
        deviations: deviations.filter((d) => d.entry === t.id),
        commits: commits.filter((c) => c.ticket === t.id),
      })),
      // Commits in the release that carry no ticket of this epic: run records,
      // plan edits, another epic's work that came in with a refresh.
      otherCommits: commits.filter((c) => !mine.some((t) => t.id === c.ticket)),
      owed,
      owedNotes,
      lastRun,
    }
    if (json) emit(out)
    else {
      console.log(`${C.bold}${arg}${C.off} ${C.dim}— release data at ${out.head ? out.head.slice(0, 12) : '(no HEAD)'}; render it with release-page.mjs${C.off}`)
      console.log(`${out.diffstat || 'no diff against the default branch'}`)
      for (const t of out.tickets) console.log(`  ${t.id} ${C.dim}${t.state}${C.off} — ${t.entries.length} entr${t.entries.length === 1 ? 'y' : 'ies'}, ${t.commits.length} commit(s), ${t.deviations.length} deviation(s)`)
      console.log(`  ${out.otherCommits.length} commit(s) with no ticket of this epic · ${owed.length} owed`)
    }
    break
  }

  case 'next': {
    const data = board(arg || null)
    requireKnownEpic(data, arg)
    // Before anything is counted. The run driver reads an empty list as "the
    // epic is built, open the release", and a failed scan produces exactly
    // that list — every ticket reads `todo`, so nothing is `integrated` and,
    // worse, a wholly built epic would look like one with everything still to
    // do. Nonzero, with the reason, and the driver's nonzero-exit stop
    // condition does the rest: a run halts where it would otherwise have
    // released an epic on a board nobody derived.
    if (data.scanFailures.length) {
      console.error(
        `tickets: a git scan failed, so the board was not derived and this list means nothing — every ticket reads "todo" whatever it actually is: ${data.scanFailures.join('; ')}`,
      )
      process.exit(1)
    }
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
        // The counts are a cross-check, not a convenience: the driver learns
        // these lists through a shell proxy's report, and a proxy that returns
        // `waiting: []` for a list that was not empty would switch the gate
        // off. The driver refuses a report whose counts and arrays disagree.
        readyCount: open.length,
        waitingCount: waiting.length,
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
          // One line for both of the newer ledgers, and only when the record
          // carries one of them: most records predate both, and a row of `?`
          // on every ticket would teach the reader to skip the block.
          // Each half ends with where it was read, as the time row does: the
          // two can come from different documents, and which document a
          // figure came from is half of what makes it checkable.
          const cached = SPEND_ROLES.filter((r) => t.cache[r] !== null || t.cache.unknown.includes(r)).map((r) => `${r} ${fmt(t.cache[r])}`)
          const ran = SPEND_ROLES.filter((r) => t.models[r] !== null || t.models.unknown.includes(r)).map((r) => `${r} ${t.models[r] ?? '?'}`)
          const peaked = SPEND_ROLES.filter((r) => t.peak[r] !== null || t.peak.unknown.includes(r)).map((r) => `${r} ${fmt(t.peak[r])}`)
          const found = FINDING_KEYS.filter((k) => t.findings[k] !== null || t.findings.unknown.includes(k)).map((k) => `${k} ${fmt(t.findings[k])}`)
          const bits = []
          if (cached.length) bits.push(`${C.dim}cache${C.off}  ${cached.join('  ')}  ${C.dim}(${t.cache.source})${C.off}`)
          // Peak sits beside the cache reads because the two answer one
          // question between them — what the context cost and how full it
          // got — and because a max reported next to a sum is read as a max.
          if (peaked.length) bits.push(`${C.dim}peak${C.off}  ${peaked.join('  ')}  ${C.dim}(${t.peak.source})${C.off}`)
          if (ran.length) bits.push(`${C.dim}models${C.off}  ${ran.join('  ')}  ${C.dim}(${t.models.source})${C.off}`)
          if (found.length) bits.push(`${C.dim}findings${C.off}  ${found.join('  ')}  ${C.dim}(${t.findings.source})${C.off}`)
          if (bits.length) console.log(`  ${''.padEnd(8)} ${bits.join(`  ${C.dim}·${C.off}  `)}`)
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
        if (e.tickets.some((t) => SPEND_ROLES.some((r) => t.cache[r] !== null)))
          console.log(`  ${C.dim}cache  ${SPEND_ROLES.map((r) => `${r} ${fmt(e.cacheTotals[r])}`).join('  ')}${C.off}`)
        // A max across the epic's tickets, and it says so: summing peaks
        // would name a context window no agent ever held.
        if (e.tickets.some((t) => SPEND_ROLES.some((r) => t.peak[r] !== null)))
          console.log(`  ${C.dim}peak (max)  ${SPEND_ROLES.map((r) => `${r} ${fmt(e.peakMax[r])}`).join('  ')}${C.off}`)
        if (e.tickets.some((t) => FINDING_KEYS.some((k) => t.findings[k] !== null)))
          console.log(`  ${C.dim}findings  ${FINDING_KEYS.map((k) => `${k} ${fmt(e.findingTotals[k])}`).join('  ')}${C.off}`)
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

  case 'metrics': {
    // What the ledgers say once they are crossed with each other and with the
    // commit subjects: pace per worker model, rework, what reviews found,
    // what halted the runs, and what shipped broken anyway. Derived, like
    // everything here — nothing is stored and nothing is estimated.
    const report = metricsReport(arg || null)
    if (json) emit(report)
    else {
      const fmt = (n) => (n === null || n === undefined ? '?' : n.toLocaleString('en-US'))
      const dur = (n) => {
        if (n === null || n === undefined) return '?'
        const h = Math.floor(n / 3600)
        const m = Math.floor((n % 3600) / 60)
        return h ? `${h}h ${String(m).padStart(2, '0')}m` : m ? `${m}m ${String(n % 60).padStart(2, '0')}s` : `${n}s`
      }
      // A figure and how many tickets it was read from — "(3/7)" only when
      // they differ, because a coverage note on a complete figure is noise
      // and its absence on a partial one is a lie.
      // No colour inside it: the columns are padded, and an escape sequence
      // inside a padded cell pads the wrong number of visible characters.
      const cov = (f, show = fmt) => `${show(f.value)}${f.from < f.of ? ` (${f.from}/${f.of})` : ''}`
      for (const e of report.epics) {
        console.log(`${C.bold}${e.epic}${C.off} — ${e.tickets} ticket${e.tickets === 1 ? '' : 's'}`)
        console.log(`  ${C.dim}pace by worker model${C.off}`)
        // Columns sized from what is in them, header included: a coverage
        // suffix ("4,812,330 (1/2)") is wider than any fixed width chosen for
        // the figure alone, and a cell that overflows its padding shifts
        // every column to its right — on exactly the rows a reader is most
        // likely to be squinting at.
        const cells = [
          ['model', (p) => p.model, 'left'],
          ['tkts', (p) => String(p.tickets), 'right'],
          ['worker tokens', (p) => cov(p.tokens), 'right'],
          ['worker cache', (p) => cov(p.cache), 'right'],
          ['peak (max)', (p) => cov(p.peak), 'right'],
          ['wall', (p) => cov(p.wall, dur), 'right'],
        ]
        const widths = cells.map(([head, pick]) => Math.max(head.length, ...e.pace.map((p) => pick(p).length), 0))
        const row = (pick) => cells.map(([, get, side], i) => (side === 'left' ? pick(get, i).padEnd(widths[i]) : pick(get, i).padStart(widths[i]))).join('  ').trimEnd()
        console.log(`  ${C.dim}${row((_, i) => cells[i][0])}${C.off}`)
        for (const p of e.pace) console.log(`  ${row((get) => get(p))}`)
        console.log(
          `  ${C.dim}rework${C.off}  ${e.reworkCommits} review-fix commit${e.reworkCommits === 1 ? '' : 's'} over ${e.reworkTickets} ticket${e.reworkTickets === 1 ? '' : 's'}` +
            (e.rework.length ? `${C.dim} — ${e.rework.map((r) => `${r.id} ${r.fixes}`).join(', ')}${C.off}` : ''),
        )
        console.log(
          `  ${C.dim}review${C.off}  important ${cov(e.review.important)}  nits ${cov(e.review.nits)}  unfixed ${cov(e.review.unfixed)}` +
            `${C.dim}  — recorded for ${e.review.ticketsRecorded}/${e.tickets}, ${e.review.ticketsWithImportant} with an Important finding${C.off}`,
        )
        console.log(
          `  ${C.dim}halts${C.off}   ${e.haltCount ? e.halts.map((h) => `${h.kind} ${h.count}${h.tickets.length ? ` (${h.tickets.join(', ')})` : ''}`).join('  ') : `${C.dim}none recorded${C.off}`}`,
        )
        console.log(
          `  ${C.dim}escaped${C.off} ${e.escapedCommits ? `${e.escapedCommits} later fix${e.escapedCommits === 1 ? '' : 'es'} of ${e.escaped.length} shipped ticket${e.escaped.length === 1 ? '' : 's'} — ${e.escaped.map((x) => `${x.id} ${x.count}${x.by.length ? ` (by ${x.by.join(', ')})` : ''}`).join(', ')}` : `${C.dim}none recorded of ${e.shippedTickets} shipped${C.off}`}`,
        )
        console.log()
      }
      if (report.totals)
        console.log(
          `${C.bold}all epics${C.off} — ${report.totals.tickets} tickets over ${report.totals.epics} epics · ` +
            `${report.totals.reworkCommits} review fixes · important ${fmt(report.totals.important)}, unfixed ${fmt(report.totals.unfixed)} · ` +
            `${report.totals.haltCount} halts · ${report.totals.escapedCommits} escaped-defect fixes\n`,
        )
      console.log(
        `${C.dim}Derived from the run records and commit subjects — nothing estimated. A "(n/m)" says how many of the row's tickets carried the figure; the rest recorded none, which is not zero. Duration is the run record's observed \`wall\` only: a commit span is never one, because commits begin when the work is nearly over.${C.off}`,
      )
      if (report.commitScanCapped || report.mainScanCapped)
        console.log(`${C.dim}Commit scans read only the last ${MAIN_SCAN_LIMIT} commits — an older ticket's review fixes or escaped-defect fixes may be missing.${C.off}`)
      if (report.shallow)
        console.log(`${C.yellow}this is a shallow clone: history before the clone's boundary is absent, so a ticket that reached ${defaultBranch} earlier reads as never landed and its later repairs read as no escape. \`git fetch --unshallow\` to trust these rows.${C.off}`)
      // Loudest of the three, and last so it is the line left on screen: a
      // failed scan is not an empty history, and every zero above it was
      // read from nothing.
      if (report.scanFailures.length)
        console.log(
          `${C.red}a git scan failed, so the rows above are not observations — rework, escapes and shipped state were read from nothing and print as zero: ${report.scanFailures.join('; ')}${C.off}`,
        )
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
        scanFailures: data.scanFailures,
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
    console.error(`tickets: unknown command "${cmd}" (try: list, find, brief, next, check, compared, deviations, spend, metrics, epics, current, doctor)`)
    process.exit(2)
}
