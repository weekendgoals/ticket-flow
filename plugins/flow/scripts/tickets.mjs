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
//   tickets.mjs spend [epic] [--json]    the recorded token ledger per ticket
//                                        and per epic, derived from the
//                                        status log's Tokens lines, addendum
//                                        phrases and the run records in
//                                        epics/<e>/runs.md (and in status.md
//                                        for logs written before the split);
//                                        unknown stays unknown, never zero
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
    ticketBudget: budget,
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
  for (const t of tickets) t.body = t.body.join('\n').trim()
  return tickets
}

function parseTickets(epic) {
  return parseTicketSections(readFileSync(epic.ticketsDoc, 'utf8'), epic.epic)
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
// Near-miss shapes doctor flags: a lowercase or spaced label, or the label
// written as a bullet of its own instead of indented under its criterion.
const CHECK_NEAR = /^\s*(check|expect)\s*:/i
const CHECK_BULLET_NEAR = /^\s*[-*]\s+(CHECK|EXPECT)\s*:/i

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

function parseChecks(body) {
  const checks = []
  const problems = []
  let bullet = null
  body.split('\n').forEach((line, i) => {
    const c = line.match(CHECK_LINE)
    const e = line.match(EXPECT_LINE)
    const b = line.match(/^\s*[-*]\s+(.*)$/)
    if (c) {
      const command = c[1].trim()
      checks.push({ criterion: bullet, check: command, expect: null })
      for (const why of checkShapeProblems(command)) problems.push({ line: i + 1, text: line.trim(), why })
    } else if (e) {
      const last = checks[checks.length - 1]
      if (!last || last.expect !== null)
        problems.push({ line: i + 1, text: line.trim(), why: 'EXPECT with no CHECK line above it to attach to' })
      else last.expect = e[1].trim()
    } else if (CHECK_BULLET_NEAR.test(line)) {
      problems.push({ line: i + 1, text: line.trim(), why: 'CHECK/EXPECT written as its own bullet — indent it under the criterion bullet instead, or it never runs' })
    } else if (b) {
      bullet = b[1].trim()
    } else if (CHECK_NEAR.test(line)) {
      problems.push({ line: i + 1, text: line.trim(), why: 'looks like a CHECK/EXPECT line but will not parse, so it silently never runs (needs the uppercase label at line start after indentation, a colon, and a value)' })
    }
  })
  return { checks, problems }
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
// `Tests  0 passed | 12 skipped` for a suite that did nothing.
const CHECK_RAN_MARK = /\b(?!0+\b)\d+\s+(?:passed|passing|ok)\b|\bpass(?:ed)?[:\s]+(?!0+\b)\d+\b/i
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
    // With no EXPECT, exit 0 is the whole evidence, so the question widens to
    // the whole output: some line reports a skip and no line reports anything
    // having run. The recovery works from the refused state either way —
    // point EXPECT at a line that proves the run.
    const skipped =
      okExit &&
      okExpect &&
      (c.expect === null
        ? lines.some((l) => CHECK_SKIP_MARK.test(l)) && !lines.some((l) => CHECK_RAN_MARK.test(l))
        : Boolean(skipHit) && !ranHit)
    // The evidence reported is always the line the verdict came from.
    const deciding = skipped ? skipHit : (ranHit ?? matching.find((l) => !skipEvidence(l)) ?? matching[0])
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
    else if (skipped)
      evidence = c.expect
        ? deciding.trim().slice(0, 300)
        : (lines.find((l) => CHECK_SKIP_MARK.test(l)) || 'exit 0').trim().slice(0, 300)
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
  `\`**Resolves owed:** ${ref}\` names no item: ${id} records ${items.length} (\`${items.map((o) => o.id).join('`, `')}\`), so nothing was retired. ` +
  `Correct the number in a new dated addendum — the log is append-only, so the wrong line stays and the right one goes underneath it.`

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
      const lead = r[1].toUpperCase().match(new RegExp(`^${OWED_REF}(\\s*,\\s*${OWED_REF})*`))
      if (lead) for (const ref of lead[0].match(new RegExp(OWED_REF, 'g'))) refs.push({ ref, line: i + 1 })
    })
  return refs
}

function parseOwed(epic) {
  if (!epic.statusDoc) return { owed: [], notes: [] }
  const byEntry = owedByEntry(owedBlocks(epic.statusDoc))
  const refs = owedResolutions(epic.statusDoc)
  // An entry someone has already addressed item by item: that writer has moved
  // to the form the note asks for, so it supersedes any bare line above it.
  // This is what makes the note clearable by the repair it names — the only
  // other exit would be naming items that are still open, which is exactly the
  // silent retirement the bare-marker rule exists to prevent. Only a reference
  // that MATCHES an item counts: a mistyped `<ID>.7` retired nothing, so
  // letting it clear the note would trade one silent line for another.
  const itemised = new Set(
    refs
      .filter((r) => r.ref.includes('.'))
      .map((r) => r.ref.split('.')[0])
      .filter((entry) => (byEntry.get(entry) || []).some((o) => refs.some((r) => r.ref === o.id))),
  )
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
    if (ref.includes('.')) {
      if (items.some((o) => o.id === ref)) resolved.add(ref)
      else if (!noted.has(ref)) {
        noted.add(ref)
        notes.push(owedUnknownItemNote(ref, entry, items))
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
const ROLE_PAIR = new RegExp(`\\b(${ROLE_RE})=(\\d[\\d,]*|unknown)`, 'gi')
const ROLE_UNKNOWN = new RegExp(`\\b(${ROLE_RE})\\s+unknown\\b`, 'gi')
const TOKENS_LINE = /\*\*Tokens:\*\*\s*([^\n]*)/gi
const RUN_GROUP = new RegExp(`\\b(${TICKET_ID})((?:\\s+(?:${ROLE_RE})=(?:\\d[\\d,]*|unknown))+)`, 'g')
const toNum = (s) => Number(s.replace(/,/g, ''))

function parseSpend(epic) {
  const byId = {}
  // Ticket entries are always in status.md; run records are in runs.md once an
  // epic has split them out, and in status.md for every log written before the
  // split. Both files are read — the split moved where a record is written,
  // never where an old one can be found.
  const docs = [epic.statusDoc, epic.runsDoc].filter(Boolean)
  if (!docs.length) return byId
  const rec = (id) => byId[id] || (byId[id] = { id, figures: {}, unknown: new Set(), source: null, note: null })
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
  // Entries wrap at the house width, so phrases are matched over a region's
  // joined text, never line by line: "Worker tokens (implementation\nleg):".
  const flush = (region, text) => {
    if (!region) return
    const flat = text.replace(/\s+/g, ' ')
    // A machine-shaped group names its own ticket, so it is read wherever it
    // sits — a correction addendum for a run record appended at the end of
    // a log lands in whatever entry is last, and must still reach the ticket
    // it names rather than the entry it landed in.
    for (const m of flat.matchAll(RUN_GROUP)) {
      const r = rec(m[1])
      for (const p of m[2].matchAll(ROLE_PAIR)) apply(r, p[1], p[2], 'run-record')
      r.unknown.delete('ticket')
    }
    if (region.id) {
      const r = rec(region.id)
      const own = flat.replace(RUN_GROUP, ' ') // bare pairs and phrases belong to this entry; labelled groups do not
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
  return byId
}

// A run record whose Tokens line carries figures but no machine-shaped group
// is the ledger's one silent failure: the figures exist, `spend` reads nothing,
// and the run lane's tickets report "no figure recorded" as if nobody had
// measured. Doctor flags it the way it flags a heading that almost parses. The
// repair is the log's own correction mechanism — a dated addendum beneath the
// record restating the figures as groups — and parseSpend already reads a
// region's addenda, so the advertised recovery works in the flagged state.
function runRecordNearMisses(doc) {
  const misses = []
  let region = null // { line } for a run record; null elsewhere
  let text = ''
  const flush = () => {
    if (!region || region.tokensLine === undefined) return
    const flat = text.replace(/\s+/g, ' ')
    const groups = [...flat.matchAll(RUN_GROUP)]
    // The figure must sit in the Tokens paragraph itself — the line and its
    // house-width continuation lines, up to the next blank line or bold
    // label — not anywhere later in the record: a Halted-on sentence that
    // mentions a token count is not a figure the ledger was meant to read.
    // A date (2026-08-24) is not a figure either.
    const hasFigure = /(?<![\d-])\d[\d,]+(?![\d-])/.test(region.tokensParagraph)
    if (!groups.length && hasFigure) misses.push({ line: region.tokensLine, heading: region.heading })
  }
  readFileSync(doc, 'utf8').split('\n').forEach((line, i) => {
    if (/^#{2,3}\s/.test(line)) {
      flush()
      region = RUN_HEADING.test(line) ? { line: i + 1, heading: line.trim(), tokensParagraph: '' } : null
      text = ''
      return
    }
    if (!region) return
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

function spendReport(epicFilter) {
  const data = board(epicFilter)
  requireKnownEpic(data, epicFilter)
  const epics = []
  for (const epic of data.epics) {
    const spend = parseSpend(epic)
    const tickets = data.tickets
      .filter((t) => t.epic === epic.epic)
      .map((t) => {
        const r = spend[t.id] || { figures: {}, unknown: new Set(), source: null, note: null }
        const known = Object.values(r.figures)
        return {
          id: t.id,
          title: t.title,
          state: t.state,
          ...Object.fromEntries(SPEND_ROLES.map((role) => [role, r.figures[role] ?? null])),
          total: known.length ? known.reduce((a, b) => a + b, 0) : null,
          unknown: [...r.unknown].sort(),
          source: r.source,
          note: r.note,
        }
      })
    const totals = Object.fromEntries(SPEND_ROLES.map((role) => [role, tickets.reduce((a, t) => a + (t[role] || 0), 0)]))
    totals.total = tickets.reduce((a, t) => a + (t.total || 0), 0)
    epics.push({
      epic: epic.epic,
      tickets,
      totals,
      unknownTickets: tickets.filter((t) => t.total === null || t.unknown.length).length,
    })
  }
  return { epics }
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

function commitsAhead(branch) {
  const n = git(['rev-list', '--count', `origin/${defaultBranch}..${branch}`], { allowFail: true })
  return n === null ? 0 : Number(n)
}

// ── state resolution ─────────────────────────────────────────────────────────

const STATES = ['shipped', 'integrated', 'in-review', 'done', 'in-progress', 'blocked', 'todo']

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
  for (const epic of epics) {
    const status = parseStatus(epic)
    // Only release epics pay the extra log call, and only when their epic
    // branch exists on the remote — the remote, because integration is the
    // driver's push, and a local-only epic branch proves nothing.
    const onEpicBranch = epic.delivery === 'release' ? idsOnRef(`origin/epic/${epic.epic}`).ids : NO_IDS
    for (const t of parseTickets(epic)) {
      tickets.push({ ...t, ...resolveState(t, status, branches, prs, onMain.ids, onEpicBranch) })
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
    current: currentEpic(allEpics),
    prsAvailable: prs.available,
    onMainCapped: onMain.capped,
    defaultBranch,
  }
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
        `  ${t.id.padEnd(8)} ${title.padEnd(46)} ${BADGE[t.state]}` + (t.pr ? `  #${t.pr.number}` : ''),
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
    console.log('Nothing left to start.')
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
  const declNear = /^[^A-Za-z]*\b(delivery|(reviewer|worker|planner)\s+model|worker\s+runner|shadow\s+reviewer|consequence\s+paths|fix\s+bounds\s+exclude|ticket\s+budget|(release|run)\s+mode)\b/i
  const declStrict = /^Delivery\s*:\s*[A-Za-z-]+|^(Reviewer|Worker|Planner) model\s*:\s*[A-Za-z0-9._-]+|^Worker runner\s*:\s*[A-Za-z-]+|^Shadow reviewer\s*:\s*[A-Za-z-]+|^Consequence paths\s*:\s*\S+|^Fix bounds exclude\s*:\s*\S+|^Ticket budget\s*:\s*\d+[km]?(\s|$)/i
  for (const epic of epics) {
    if (!DELIVERIES.has(epic.delivery))
      add('warn', `${epic.epic}: unrecognised delivery "${epic.delivery}" (known: release, incremental) — skills reading it will not know how this epic ships`)
    readFileSync(epic.ticketsDoc, 'utf8').split(/^##\s/m)[0].split('\n').forEach((line, i) => {
      if (declNear.test(line) && !declStrict.test(line))
        add('warn', `${epic.epic}/tickets.md:${i + 1} — looks like a declaration line but will not parse, so it silently defaults (needs "Delivery: release|incremental" / "Reviewer model: <value>" / "Worker model: <value>" / "Worker runner: claude|codex" / "Shadow reviewer: codex" / "Planner model: <value>" / "Consequence paths: <glob>[, <glob>]" / "Fix bounds exclude: <glob>[, <glob>]" / "Ticket budget: <digits, optional k or m suffix>" — label at line start, no formatting, value on the label's own line; "Release mode:"/"Run mode:" are not read at all): ${line.trim()}`)
    })
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
      for (const p of parseChecks(t.body).problems)
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
      // A marker that retired nothing is silent at its author's door: the
      // brief that would say so is read by the next worker, not by the
      // session that wrote the line. Flagged here, where the writer looks.
      for (const n of parseOwed(epic).notes) add('warn', `${epic.epic}/status.md — ${n}`)
    }
    // The run-record scans below run whether or not status.md exists — an epic
    // whose records are split out has a runs.md to check either way, and the
    // early `continue` that used to sit here skipped it silently.
    // Run records are read from runs.md and from status.md (where every log
    // written before the split keeps them), so both files get the run-record
    // scans — a record flagged in only one of them would be a gate at a door
    // its writer no longer walks through.
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
      for (const miss of runRecordNearMisses(doc))
        add('warn', `${epic.epic}/${name}:${miss.line} — the run record's Tokens line carries figures but no machine-shaped group, so spend reads nothing from it (needs "<ID> worker=<n> reviewer=<n> disposition=<n> re-review=<n> proxies=<n>" per ticket, "unknown" for any missing figure); repair by appending a dated addendum beneath the record restating the figures as groups — never by editing the record: ${miss.heading}`)
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
    ticketBudget: epic.ticketBudget,
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
    const out = {
      ...ticketFacts(data, t),
      preamble: readFileSync(epic.ticketsDoc, 'utf8').split(/^##\s/m)[0].trim(),
      owed,
      notes,
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
      console.log(`${C.bold}Ticket${C.off}`)
      console.log(out.body)
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
    let body = t.body
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
    }
    const { checks, problems } = parseChecks(body)
    const results = runChecks(checks)
    const passed = results.filter((r) => r.passed).length
    const skipped = results.filter((r) => r.status === 'skipped').length
    const allPassed = passed === results.length && !problems.length
    if (json) {
      emit({ id: t.id, epic: t.epic, from: fromRef, total: results.length, passed, skipped, allPassed, checks: results, problems })
    } else {
      if (fromRef) console.log(`${C.dim}criteria read from ${fromRef}${C.off}`)
      if (!results.length && !problems.length) console.log(`no CHECK criteria in ${t.id} — nothing to run`)
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
      for (const p of problems) console.log(`${C.red}!${C.off} line ${p.line}: ${p.why}: ${p.text}`)
      if (results.length || problems.length)
        console.log(
          `${passed}/${results.length} checks passed` +
            (skipped ? ` — ${skipped} skipped, which does not pass the gate` : '') +
            (problems.length ? ` — ${problems.length} malformed line(s), which fail the gate` : ''),
        )
    }
    process.exit(allPassed ? 0 : 1)
  }

  case 'next': {
    const data = board(arg || null)
    requireKnownEpic(data, arg)
    const open = data.tickets.filter((t) => t.state === 'todo')
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
        }
        console.log(
          `  ${C.dim}${SPEND_ROLES.map((r) => `${r} ${fmt(e.totals[r])}`).join('  ')}${C.off}`,
        )
        console.log()
      }
      console.log(`${C.dim}Recorded figures only — harness-observed or unknown, as the log says; nothing here is estimated.${C.off}`)
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
            { delivery: e.delivery, reviewerModel: e.reviewerModel, workerModel: e.workerModel, workerRunner: e.workerRunner, shadowReviewer: e.shadowReviewer, plannerModel: e.plannerModel, consequencePaths: e.consequencePaths, fixBoundsExclude: e.fixBoundsExclude, ticketBudget: e.ticketBudget },
          ]),
        ),
        duplicates: data.duplicates,
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
    console.error(`tickets: unknown command "${cmd}" (try: list, find, brief, next, check, spend, epics, current, doctor)`)
    process.exit(2)
}
