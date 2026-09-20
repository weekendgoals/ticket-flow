#!/usr/bin/env node
// fidelity — compare what a design draws with what a page renders, property by
// property, without owning a browser.
//
// An epic's design is an artifact like its documents, its diff and its tests,
// and "looks right" is not a check: every difference the source epic's two
// review rounds found was a computed-style value, found with getComputedStyle
// and missed by eye. So the comparison is mechanical, and it is two halves:
//
//   extract   prints the source of ONE self-contained function expression,
//             `(landmarks, side) => report`. Whatever browser the project
//             already has — its e2e runner, a browser pane, a console —
//             evaluates that text on a rendered page and keeps the JSON.
//   diff      compares two such reports in pure Node and prints one row per
//             difference.
//
// The split is why this installs anywhere: the plugin has no package.json, no
// dependency and no browser, because a differ that shipped one would be a
// differ a project could not install. The browser is always the project's own.
//
// Usage — run with node from anywhere; skills invoke it as
// `node "${CLAUDE_PLUGIN_ROOT}/scripts/fidelity.mjs" <command>`:
//
//   fidelity.mjs extract
//   fidelity.mjs diff <design.json> <page.json> --map <design-map.json>
//                     [--removed-from <design-map.json>] [--source <design source>]
//                     [--landmarks a,b] [--json]
//
// The design map is JSON — the differ reads it directly, and a Markdown table
// would need a second parser for a file only a script reads:
//
//   { "landmarks": [ { "name": "hero",
//                      "design": "<selector in the design source>",
//                      "page":   "<selector in the built page>",
//                      "source": "<optional: design source path, or a list>",
//                      "widths": [<optional: viewport widths it is drawn at>] } ],
//     "removed":   [ { "name": "promo", "by": "<the deciding rule>",
//                      "date": "YYYY-MM-DD" } ] }
//
// A malformed map exits 2 naming the entry, because a map the differ silently
// half-reads produces a clean table over landmarks nobody compared.
//
// `removed` is PLANNING's list, and `--map` is the file the ticket under
// review edits (its `page` selectors are written before the page exists). So a
// `removed` list inside `--map` is never honoured and the table says so: only
// `--removed-from <file>` declares removals, filled from the signed-off ref the
// way `tickets.mjs check --from` reads criteria. Without that separation a
// worker who could not build an element could declare it removed, get a clean
// diff and halt nothing — the exact failure this script exists to catch.
//
// Exit: 0 when nothing differs or the only rows are declared removals, 1 when
// anything else differs, 2 on a usage error or unreadable input — which
// includes a run where no landmark matched on either side, since a map that
// describes neither report is not evidence that a page matches its design,
// and a pair of reports taken at different viewport widths, since two widths
// are two pages and a clean table between them would be luck.
// A landmark on neither side is a failing `unmatched` row when the signed-off
// map scopes it (`source`, `widths`) to the source and width being compared,
// and a note when the map does not say. A scoped map adds refusals under exit
// 2: no `--source`, one the map names nowhere, `--source` without
// `--removed-from`, width scope against reports with no width, and a landmark
// it draws here that `--map` no longer declares.
// One case that looks like the last is not it: a landmark the signed-off
// `removed` list names, absent from the design and the page alike, is the two
// sides AGREEING with the plan. It prints a `removed by …` row with `absent`
// in the design column, counts as compared, and exits 0 — otherwise a
// `--landmarks` subset of nothing but such landmarks was refused as unreadable
// while the same pair over the whole map passed with a note.
//
// Zero dependencies, no configuration, stores nothing, and launches no browser.

import { readFileSync } from 'node:fs'
import { pathToFileURL } from 'node:url'

// ── the page-side extractor ──────────────────────────────────────────────────

// Printed verbatim and evaluated inside a page, so the printed text is all that
// crosses: no import, no require, no reference to anything in this module — the
// property list is inline for that reason alone. The set is FIXED because a
// differ whose properties vary per project produces tables no two epics can
// compare; it is the set the source epic's found differences fell into.
// width/height come from getBoundingClientRect (the border box a designer
// measures), everything else from getComputedStyle.
const EXTRACTOR = (landmarks, side) => {
  const props = [
    'display', 'grid-template-columns', 'column-gap', 'row-gap', 'flex-direction',
    'font-family', 'font-size', 'font-weight', 'letter-spacing', 'line-height',
    'color', 'background-color', 'border-radius',
    'padding-top', 'padding-right', 'padding-bottom', 'padding-left',
  ]
  const list = Array.isArray(landmarks) ? landmarks : []
  const report = { side: side, viewportWidth: null, landmarks: {} }
  try {
    report.viewportWidth = typeof window !== 'undefined' && typeof window.innerWidth === 'number' ? window.innerWidth : null
  } catch (e) { report.viewportWidth = null }
  // Document order comes from one querySelectorAll('*') — that is its
  // definition — rather than compareDocumentPosition, so the reading survives
  // any context that serves a flat element list. An element the sweep does not
  // contain sorts to its position in the map, which is the only order left.
  let all = []
  try { all = Array.prototype.slice.call(document.querySelectorAll('*')) } catch (e) { all = [] }
  const hits = []
  for (let i = 0; i < list.length; i++) {
    const entry = list[i] || {}
    const row = { found: false, order: null, childCount: null, props: {} }
    let el = null
    try { el = entry[side] ? document.querySelector(entry[side]) : null } catch (e) { el = null }
    if (el) {
      row.found = true
      row.childCount = el.children ? el.children.length : 0
      let cs = null
      try { cs = getComputedStyle(el) } catch (e) { cs = null }
      for (let p = 0; p < props.length; p++) {
        let v = ''
        try { v = cs ? cs.getPropertyValue(props[p]) : '' } catch (e) { v = '' }
        row.props[props[p]] = v === null || v === undefined ? '' : String(v).trim()
      }
      let rect = null
      try { rect = el.getBoundingClientRect() } catch (e) { rect = null }
      row.props.width = rect ? Math.round(rect.width * 100) / 100 + 'px' : ''
      row.props.height = rect ? Math.round(rect.height * 100) / 100 + 'px' : ''
      hits.push({ name: entry.name, at: all.indexOf(el) })
    }
    report.landmarks[entry.name] = row
  }
  hits.sort((a, b) => a.at - b.at)
  for (let i = 0; i < hits.length; i++) report.landmarks[hits[i].name].order = i + 1
  return report
}

// ── normalisation ────────────────────────────────────────────────────────────

// Two renderers print one value two ways, so a differ that compared strings
// would report a table of differences nobody can act on — and a table of noise
// is how a fidelity check stops being read.
const LENGTH = /^-?\d+(?:\.\d+)?px$/
const HEX = /^#([0-9a-f]{3,8})$/i

// Colours compare as rgba: getComputedStyle answers `rgb(…)`/`rgba(…)`, while a
// hand-written map or an older engine may answer a hex or `transparent`.
export function asRgba(value) {
  const v = String(value ?? '').trim().toLowerCase()
  if (v === 'transparent') return '0,0,0,0'
  const fn = v.match(/^rgba?\(([^)]+)\)$/)
  if (fn) {
    const parts = fn[1].split(/[\s,/]+/).filter(Boolean)
    if (parts.length < 3) return null
    const n = parts.slice(0, 3).map((p) => parseFloat(p))
    if (n.some((x) => Number.isNaN(x))) return null
    const a = parts.length > 3 ? parseFloat(parts[3]) : 1
    return `${n[0]},${n[1]},${n[2]},${Number.isNaN(a) ? 1 : a}`
  }
  const hex = v.match(HEX)
  if (!hex) return null
  let h = hex[1]
  if (h.length === 3 || h.length === 4) h = h.split('').map((c) => c + c).join('')
  if (h.length !== 6 && h.length !== 8) return null
  const byte = (i) => parseInt(h.slice(i * 2, i * 2 + 2), 16)
  return `${byte(0)},${byte(1)},${byte(2)},${h.length === 8 ? Math.round((byte(3) / 255) * 100) / 100 : 1}`
}

// The first family, unquoted and case-insensitive: a design source and a page
// rarely spell the same stack identically, and the family that actually paints
// is the first one both offer. A quoted family is read to its closing quote
// BEFORE any comma split, because a family name may contain one — splitting
// first turned `"Helvetica, Neue", serif` into `Helvetica` and made two
// different stacks compare equal, which is a normalisation hiding a real
// difference, the one failure this file must never have.
export const firstFamily = (value) => {
  const s = String(value ?? '').trim()
  const quote = s[0] === '"' || s[0] === "'" ? s[0] : null
  const close = quote ? s.indexOf(quote, 1) : -1
  const first = quote && close !== -1 ? s.slice(1, close) : s.split(',')[0].replace(/^['"]|['"]$/g, '')
  return first.trim().toLowerCase()
}

// Lengths within 0.5px are equal, token by token — which is what makes a grid
// track list (`284px 284px 284px`) comparable at all: same track count and each
// track within half a pixel is the same layout, a different count is not.
export function sameValue(prop, a, b) {
  const x = String(a ?? '').trim()
  const y = String(b ?? '').trim()
  if (x === y) return true
  if (prop === 'font-family') return firstFamily(x) === firstFamily(y)
  const ca = asRgba(x)
  const cb = asRgba(y)
  if (ca && cb) return ca === cb
  if (!x || !y) return false
  const tx = x.split(/\s+/)
  const ty = y.split(/\s+/)
  if (tx.length !== ty.length) return false
  return tx.every((t, i) => t === ty[i] || (LENGTH.test(t) && LENGTH.test(ty[i]) && Math.abs(parseFloat(t) - parseFloat(ty[i])) <= 0.5))
}

// ── reading the inputs ───────────────────────────────────────────────────────

// A usage error and an unreadable input are one exit code (2) and one shape,
// because the caller's recovery is the same in both: fix the command or the
// file. They are never exit 1, which means "the page differs from the design" —
// a runner that read a typo as a difference would send somebody editing CSS.
class UsageError extends Error {}

const readJson = (file, label) => {
  let text
  try {
    text = readFileSync(file, 'utf8')
  } catch (e) {
    throw new UsageError(`${label}: cannot read ${file} (${e.code || e.message})`)
  }
  try {
    return JSON.parse(text)
  } catch (e) {
    throw new UsageError(`${label}: ${file} is not valid JSON (${e.message})`)
  }
}

// Every refusal names the entry, because "malformed map" over a forty-landmark
// file tells the reader to re-read the file the script just read.
export function validateMap(map, label) {
  if (!map || typeof map !== 'object' || Array.isArray(map)) throw new UsageError(`${label}: the design map must be a JSON object`)
  if (!Array.isArray(map.landmarks)) throw new UsageError(`${label}: "landmarks" must be an array`)
  const seen = new Set()
  map.landmarks.forEach((l, i) => {
    const at = `${label}: landmarks[${i}]`
    if (!l || typeof l !== 'object' || Array.isArray(l)) throw new UsageError(`${at} is not an object`)
    for (const key of ['name', 'design', 'page']) {
      if (typeof l[key] !== 'string' || !l[key].trim()) throw new UsageError(`${at}${l.name ? ` ("${l.name}")` : ''} has no "${key}"`)
    }
    // Scope is optional and additive: a map written before it existed reads
    // exactly as it did. Checked here rather than where it is used, so a
    // misspelt width is refused by entry and not read as "drawn nowhere".
    // `source` is a path or a list of them: a header drawn on every page is
    // one landmark, and a single string forced it to belong to one page and be
    // "drawn elsewhere" on all the others.
    const srcs = Array.isArray(l.source) ? l.source : [l.source]
    if (l.source !== undefined && (!srcs.length || srcs.some((x) => typeof x !== 'string' || !x.trim()))) {
      throw new UsageError(`${at} ("${l.name}"): "source" must be a design source path, or a non-empty array of them`)
    }
    // Integers, because a report's width is one: 393.5 would never equal it,
    // and the landmark would read as drawn nowhere.
    if (l.widths !== undefined && (!Array.isArray(l.widths) || !l.widths.length || l.widths.some((w) => !Number.isInteger(w) || w <= 0))) {
      throw new UsageError(`${at} ("${l.name}"): "widths" must be a non-empty array of viewport widths in whole px`)
    }
    if (seen.has(l.name)) throw new UsageError(`${at}: "${l.name}" is declared twice`)
    seen.add(l.name)
  })
  const removed = map.removed ?? []
  if (!Array.isArray(removed)) throw new UsageError(`${label}: "removed" must be an array`)
  removed.forEach((r, i) => {
    const at = `${label}: removed[${i}]`
    if (!r || typeof r !== 'object' || Array.isArray(r)) throw new UsageError(`${at} is not an object`)
    for (const key of ['name', 'by', 'date']) {
      if (typeof r[key] !== 'string' || !r[key].trim()) throw new UsageError(`${at}${r.name ? ` ("${r.name}")` : ''} has no "${key}"`)
    }
  })
  return { landmarks: map.landmarks, removed }
}

// A report is checked for the shape `extract` documents, and for being the side
// it is passed as: handing the page report in the design slot is the likeliest
// mistake at this door, and read silently it would print every difference
// backwards.
export function validateReport(report, side, label) {
  if (!report || typeof report !== 'object' || Array.isArray(report)) throw new UsageError(`${label}: the report must be a JSON object`)
  if (!report.landmarks || typeof report.landmarks !== 'object' || Array.isArray(report.landmarks)) {
    throw new UsageError(`${label}: no "landmarks" object — is this a report from \`fidelity.mjs extract\`?`)
  }
  // A number or nothing: the width refusal compares the two, and a hand-built
  // "375" against 375 would be refused as a mismatch that prints as none.
  if (report.viewportWidth != null && typeof report.viewportWidth !== 'number') throw new UsageError(`${label}: "viewportWidth" must be a number or null, not ${JSON.stringify(report.viewportWidth)}`)
  if (report.side && report.side !== side) throw new UsageError(`${label}: this report says side "${report.side}" but was given as the ${side} — the two files look swapped`)
  return report
}

// ── the diff ─────────────────────────────────────────────────────────────────

const MISSING = '(not reported)'

// The two row kinds that report a removal planning declared and the page
// honoured. They never make a run fail — a declared removal is the plan being
// followed — so the exit rule and the table's summary read this one set rather
// than each naming its own list and drifting apart.
const DECLARED_REMOVAL = new Set(['removed', 'removed-absent'])

// One row per difference; notes are not rows, because they say something about
// the comparison rather than about the page, and only rows decide the exit code.
//
// `scope` is the signed-off map's word on WHERE a landmark is drawn: name →
// { source?, widths? }. It is what lets a landmark that matched on neither side
// fail — and fail the same way whatever `--landmarks` says. Without it that
// state is only a note, because a map may span several design sources and an
// element may exist at one width alone, so silence on both sides is sometimes
// the right answer; a rule that failed it under `--landmarks` and passed it
// over the whole map was tried, and is the two-answers shape a gate gets
// routed around. Scope comes from the signed-off map for the reason removals
// do: the map on the ticket branch is the file the reviewed party edits, and
// deleting a `source` line would otherwise be how a missing element passes.
// Whether the signed-off map draws a landmark in this source at this width.
// One predicate, because the differ asks it twice — of a landmark silent on
// both sides, and of one the branch's map no longer declares — and two copies
// would drift into two answers.
export const drawnHere = (sc, source, width) => (!sc.source || sc.source.includes(source)) && (!sc.widths || sc.widths.includes(width))

export function diffReports(design, page, { landmarks, removed = [], only = null, mapHasRemoved = false, removedFrom = null, scope = new Map(), source = null }) {
  const rows = []
  const notes = []
  const width = design.viewportWidth ?? page.viewportWidth ?? null
  const elsewhere = []
  let silent = 0
  const declared = new Map(removed.map((r) => [r.name, r]))
  const list = only ? landmarks.filter((l) => only.includes(l.name)) : landmarks
  const row = (landmark, property, d, p, kind) => rows.push({ landmark, property, design: d, page: p, kind })
  const unmatched = []

  for (const l of list) {
    const d = design.landmarks[l.name] || null
    const p = page.landmarks[l.name] || null
    const gone = declared.get(l.name)
    const dFound = Boolean(d && d.found)
    const pFound = Boolean(p && p.found)

    // A landmark planning declared removed that is on the page is its own row:
    // the decision and the build disagree, and that is a difference from the
    // plan even though the page matches the design.
    if (gone && pFound) row(l.name, 'presence', dFound ? 'present' : 'absent', `on the page — declared removed by ${gone.by}, ${gone.date}`, 'removal-contradicted')

    if (dFound && !pFound) {
      if (gone) row(l.name, 'presence', 'present', `removed by ${gone.by}, ${gone.date}`, 'removed')
      else row(l.name, 'presence', 'present', 'missing', 'missing')
      continue
    }
    if (!dFound && pFound) {
      row(l.name, 'presence', 'absent', 'present', 'absent-in-design')
      continue
    }
    if (!dFound && !pFound) {
      // Both sides agree, and the plan is why: the signed-off map declares
      // this landmark removed, the page does not build it, and the design no
      // longer draws it either. That is evidence — the removal was carried
      // out — so it is a row like any other honoured removal, it counts as
      // compared, and it never fails the run. Without this branch a
      // `--landmarks` subset naming only such landmarks compared nothing and
      // was refused as unreadable input, with a recovery message ("a map whose
      // selectors match neither report") naming the one thing that was not
      // wrong; the same pair over the whole map exited 0 with a note. Two
      // answers to one state is the shape a gate gets routed around.
      if (gone) {
        row(l.name, 'presence', 'absent', `removed by ${gone.by}, ${gone.date}`, 'removed-absent')
        continue
      }
      const sc = scope.get(l.name)
      if (sc) {
        if (drawnHere(sc, source, width)) {
          row(l.name, 'presence', 'absent', `absent — the signed-off map draws it ${[sc.source && `in ${sc.source.join(', ')}`, sc.widths && `at ${sc.widths.join(', ')}`].filter(Boolean).join(' ')}`, 'unmatched')
          silent++
        } else elsewhere.push(l.name)
        continue
      }
      unmatched.push(l.name)
      continue
    }

    if (d.order !== p.order) row(l.name, 'order', String(d.order), String(p.order), 'order')
    if (d.childCount !== p.childCount) row(l.name, 'childCount', String(d.childCount), String(p.childCount), 'childCount')
    const props = [...Object.keys(d.props || {}), ...Object.keys(p.props || {}).filter((k) => !(k in (d.props || {})))]
    for (const prop of props) {
      const dv = (d.props || {})[prop]
      const pv = (p.props || {})[prop]
      if (dv === undefined || pv === undefined) {
        row(l.name, prop, dv === undefined ? MISSING : dv, pv === undefined ? MISSING : pv, 'prop')
      } else if (!sameValue(prop, dv, pv)) {
        row(l.name, prop, String(dv), String(pv), 'prop')
      }
    }
  }

  // Provenance travels with the table, because the table is pasted into a
  // status entry and a `removed by …` row without its source is a removal the
  // reviewer cannot check. So the note fires whenever a removal was honoured at
  // all — not only when --map happens to carry a list of its own, which under
  // the layout the doctrine prefers (removals live only in the signed-off map)
  // is exactly never. With no --removed-from, the point is the other way round:
  // the removals in hand are being ignored, and the recovery is what to say.
  if (removedFrom && (mapHasRemoved || rows.some((r) => DECLARED_REMOVAL.has(r.kind) || r.kind === 'removal-contradicted'))) {
    notes.push(`removals were read from --removed-from (${removedFrom}); a "removed" list in --map is never honoured`)
  } else if (mapHasRemoved) {
    notes.push('the --map file carries a "removed" list; it is never honoured, because --map is the file the ticket under review edits — pass the signed-off map as --removed-from to read its removals')
  }
  if (unmatched.length) notes.push(`matched nothing on either side, so nothing was compared: ${unmatched.join(', ')}`)
  if (elsewhere.length) notes.push(`not drawn ${source ? `in ${source} ` : ''}${width != null ? `at ${width} ` : ''}by the signed-off map, and on neither side: ${elsewhere.join(', ')}`)
  const compared = list.length - unmatched.length - elsewhere.length - silent
  return { rows, notes, compared, elsewhere: elsewhere.length, unmatched: unmatched.length, exit: rows.length === 0 || rows.every((r) => DECLARED_REMOVAL.has(r.kind)) ? 0 : 1 }
}

// The table is plain text with no colour: it is pasted into a status entry's
// **Compared:** field, and an escape sequence pasted into a document is junk a
// reader cannot clean.
export function renderTable(result) {
  const head = { landmark: 'landmark', property: 'property', design: 'design', page: 'page' }
  const cols = ['landmark', 'property', 'design', 'page']
  const out = []
  if (result.rows.length) {
    const width = Object.fromEntries(cols.map((c) => [c, Math.max(...[head, ...result.rows].map((r) => String(r[c]).length))]))
    const line = (r) => cols.map((c, i) => (i === cols.length - 1 ? String(r[c]) : String(r[c]).padEnd(width[c]))).join('  ').trimEnd()
    out.push(line(head))
    out.push(cols.map((c, i) => (i === cols.length - 1 ? '-'.repeat(width[c]) : '-'.repeat(width[c]))).join('  ').trimEnd())
    for (const r of result.rows) out.push(line(r))
    out.push('')
  }
  const removals = result.rows.filter((r) => DECLARED_REMOVAL.has(r.kind)).length
  const others = result.rows.length - removals
  out.push(
    result.rows.length === 0
      ? `no differences — ${result.compared} landmark${result.compared === 1 ? '' : 's'} compared`
      : `${others} difference${others === 1 ? '' : 's'}${removals ? ` and ${removals} declared removal${removals === 1 ? '' : 's'}` : ''} — ${result.compared} landmark${result.compared === 1 ? '' : 's'} compared`,
  )
  for (const n of result.notes) out.push(`note: ${n}`)
  return out.join('\n')
}

// ── entry point ──────────────────────────────────────────────────────────────

const USAGE = `usage:
  fidelity.mjs extract
  fidelity.mjs diff <design.json> <page.json> --map <design-map.json>
                    [--removed-from <design-map.json>] [--source <design source>]
                    [--landmarks a,b] [--json]`

export function run(argv) {
  const cmd = argv[0]
  if (cmd === 'extract') {
    if (argv.length > 1) throw new UsageError(`extract takes no arguments\n${USAGE}`)
    return { stdout: EXTRACTOR.toString(), code: 0 }
  }
  if (cmd !== 'diff') throw new UsageError(`${cmd ? `unknown command "${cmd}"` : 'no command'}\n${USAGE}`)

  const flags = { '--map': null, '--removed-from': null, '--landmarks': null, '--source': null }
  const positional = []
  let json = false
  for (let i = 1; i < argv.length; i++) {
    const a = argv[i]
    if (a === '--json') json = true
    // hasOwnProperty, not `in`: `in` walks Object.prototype, so a report file
    // named `toString` would be read as a flag and swallow the argument after it.
    else if (Object.prototype.hasOwnProperty.call(flags, a)) {
      const v = argv[++i]
      if (v === undefined || v.startsWith('--')) throw new UsageError(`${a} needs a value\n${USAGE}`)
      // A repeated flag is refused rather than last-wins: two --removed-from
      // files is somebody asking two questions, and answering the second
      // silently is how the wrong removals get honoured.
      if (flags[a] !== null) throw new UsageError(`${a} given twice ("${flags[a]}" and "${v}")\n${USAGE}`)
      flags[a] = v
    } else if (a.startsWith('--')) throw new UsageError(`unknown option "${a}"\n${USAGE}`)
    else positional.push(a)
  }
  if (positional.length !== 2) throw new UsageError(`diff takes exactly two report files\n${USAGE}`)
  if (!flags['--map']) throw new UsageError(`diff needs --map <design-map.json>\n${USAGE}`)

  const design = validateReport(readJson(positional[0], 'design report'), 'design', 'design report')
  const page = validateReport(readJson(positional[1], 'page report'), 'page', 'page report')
  const map = validateMap(readJson(flags['--map'], '--map'), '--map')
  const signed = flags['--removed-from'] ? validateMap(readJson(flags['--removed-from'], '--removed-from'), '--removed-from') : null
  const removed = signed ? signed.removed : []
  const scope = new Map(
    (signed ? signed.landmarks : [])
      .filter((l) => l.source || l.widths)
      .map((l) => [l.name, { source: l.source ? [].concat(l.source) : null, widths: l.widths || null }]),
  )
  // Scope lives in the signed-off map, so `--source` without it is a question
  // nothing can answer — and answered silently it was the old pass with a new
  // flag on it.
  // The same silence the other way round: a --map that carries scope, run
  // with no signed-off map, would have every scoped landmark read as unscoped
  // — drop two flags and the missing element is a note again. --map's own
  // scope is never HONOURED, but it is evidence that a signed-off one exists.
  if (!signed && map.landmarks.some((l) => l.source || l.widths)) {
    throw new UsageError('the --map file scopes landmarks (source/widths) and no --removed-from was given — scope is read from the signed-off map only, so this run would ignore all of it. Pass --removed-from <the signed-off map> and --source.')
  }
  if (flags['--source'] && !signed) throw new UsageError('--source needs --removed-from <the signed-off map>: where a landmark is drawn is read from that file, never from --map')

  let only = null
  // `!== null`, not truthiness: `--landmarks ""` is a list of no names, not the
  // absence of the flag. Omitting the flag compares everything; giving it a
  // value that names nothing — "", " ", ",", ",," — is refused with every other
  // empty spelling, because each of them filtered the comparison to zero
  // landmarks and printed "no differences", which is the pass this tool exists
  // to stop anyone earning by accident.
  if (flags['--landmarks'] !== null) {
    only = flags['--landmarks'].split(',').map((s) => s.trim()).filter(Boolean)
    if (!only.length) throw new UsageError(`--landmarks "${flags['--landmarks']}" names no landmark — omit the flag to compare every landmark in the map`)
    const known = new Set(map.landmarks.map((l) => l.name))
    const unknown = only.filter((n) => !known.has(n))
    // An unknown name is refused rather than compared as nothing: a typo that
    // narrowed the comparison to zero landmarks would print "no differences".
    if (unknown.length) throw new UsageError(`--landmarks names ${unknown.length === 1 ? 'a landmark' : 'landmarks'} the map does not declare: ${unknown.join(', ')}`)
  }

  // Two widths are two pages: media queries answered differently on each
  // side, so every row would be a difference between viewports and a clean
  // table would be luck. This was a note under exit 0 once, and a 1440-against-
  // 375 pair read "no differences". Refused like every other comparison nobody
  // performed; a report without a width (hand-built, or an older extractor) is
  // not refused, because absence is not a mismatch.
  if (design.viewportWidth != null && page.viewportWidth != null && design.viewportWidth !== page.viewportWidth) {
    throw new UsageError(
      `the reports were taken at different viewport widths (design ${design.viewportWidth}, page ${page.viewportWidth}) — that is two pages, not one compared with its design. ` +
        'Open both at the width the COMPARE line names, extract again, and diff those reports.',
    )
  }

  // A scoped map asks two questions this run must be able to answer — which
  // source, which width — and guessing either would decide a landmark is
  // "drawn elsewhere", which is the silent pass scope exists to end.
  //
  // Both refusals read EVERY source the signed-off map names, never the
  // `--landmarks` selection: judged per selection, a header shared by two
  // pages was refused under `--landmarks header` and compared over the whole
  // map — two answers to one state, with "drop the flag" as the recovery.
  const sources = [...new Set([...scope.values()].flatMap((sc) => sc.source || []))]
  const source = flags['--source']
  if (sources.length && !source) {
    throw new UsageError(`the signed-off map scopes landmarks by design source (${sources.join(', ')}) — pass --source <the COMPARE line's path> so the differ knows which one these reports are of`)
  }
  if (source && sources.length && !sources.includes(source)) {
    throw new UsageError(
      `--source "${source}" is a source the signed-off map scopes no landmark to; it names: ${sources.join(', ')}. ` +
        "If the path is misspelt, correct it. If it is the COMPARE line's path character for character, the signed-off map left this design source unscoped — that is planning's to repair, not this branch's: record the comparison as owed and say so.",
    )
  }
  const width = design.viewportWidth ?? page.viewportWidth ?? null
  if ([...scope.values()].some((sc) => sc.widths) && width == null) {
    throw new UsageError('the signed-off map scopes landmarks by width and neither report carries a viewportWidth — extract them again with `fidelity.mjs extract`')
  }
  // The landmarks that get compared come from --map, which the ticket under
  // review edits — so a scoped landmark renamed or deleted there would simply
  // never be looked for. Everything the signed-off map draws here must still
  // be declared, WHATEVER --landmarks says: skipped under the flag, the
  // refusal was dodged by naming every landmark --map still had, which is the
  // same selection as no flag at all and got the other answer.
  const declaredNames = new Set(map.landmarks.map((l) => l.name))
  const goneFromMap = [...scope].filter(([name, sc]) => drawnHere(sc, source, width) && !declaredNames.has(name) && !removed.some((r) => r.name === name)).map(([name]) => name)
  if (goneFromMap.length) {
    throw new UsageError(`the signed-off map draws ${goneFromMap.join(', ')} here and --map does not declare ${goneFromMap.length === 1 ? 'it' : 'them'} — a landmark is renamed or dropped by planning, in the signed-off map, never on the branch whose page it measures`)
  }

  const result = diffReports(design, page, {
    landmarks: map.landmarks,
    removed,
    only,
    scope,
    source,
    mapHasRemoved: (map.removed || []).length > 0,
    removedFrom: flags['--removed-from'],
  })
  // Nothing compared is not a clean page: with no landmark matching on either
  // side there is no evidence at all, and exit 0 under "no differences" is the
  // silent pass this differ exists to prevent. It is refused as unreadable
  // input, because that is what a map whose selectors describe neither report is.
  // A scoped landmark silent on both sides is a row, and rows are evidence of
  // a failure — so that table prints, under exit 1, rather than this refusal.
  // Nor does it fire on silence the signed-off map explains: `LANDMARKS: menu`
  // on a `COMPARE … @ 393, 1440` line, with menu drawn at 393 only, is a 1440
  // run with nothing to compare and nothing wrong — refused here, it told the
  // worker to fix selectors that were fine, while the whole map passed. But
  // only when the map explains ALL of the silence: one not-drawn-here landmark
  // beside others that simply matched nothing is still a run with no evidence,
  // and letting it through printed "no differences — 0 landmarks compared"
  // under exit 0 for reports of the wrong page.
  if (result.compared === 0 && result.rows.length === 0 && !(result.elsewhere > 0 && result.unmatched === 0)) {
    throw new UsageError(
      `nothing was compared — no landmark ${only ? 'named by --landmarks ' : ''}matched on either side${map.landmarks.length ? '' : ' (the map declares no landmarks)'}. ` +
        'A map whose selectors match neither report is not a page that matches its design.' +
        // The one repair this refusal can name for certain: removals sitting in
        // --map are ignored, so a landmark declared removed there reads as
        // merely unmatched — and the fix is a flag, not a selector.
        ((map.removed || []).length > 0 && !flags['--removed-from']
          ? ' The --map file carries a "removed" list, which is never honoured — if these landmarks were removed on purpose, pass the signed-off map as --removed-from.'
          : ''),
    )
  }
  // A scoped run says what it was asked, in the text that gets pasted into
  // **Compared:** — the reports carry no source, so a `--source` copied from
  // the wrong COMPARE line reads every landmark of the right one as "drawn
  // elsewhere", and only the reader holding the ticket's lines can see it.
  // And a run with no signed-off map at all says so in the same place: the
  // ticket skill calls --removed-from "not optional", and a table produced
  // without it read no removals and no scope — which a reader can only know if
  // the table tells them.
  if (!signed) result.notes.unshift('no --removed-from was given: removals and landmark scope were read from nowhere — this table is not the comparison the ticket skill asks for')
  if (scope.size) {
    result.asked = { source: source || null, width, landmarks: only }
    result.notes.unshift(`compared as ${source ? `source ${source}` : 'no source'}${width != null ? ` at ${width}` : ''}, ${only ? `landmarks ${only.join(', ')}` : 'every landmark in the map'} — check it against the ticket's COMPARE and LANDMARKS lines`)
  }
  return { stdout: json ? JSON.stringify(result, null, 2) : renderTable(result), code: result.exit }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  // `process.exitCode`, never `process.exit()`: stdout is asynchronous on a
  // pipe, and process.exit() discards whatever has not flushed — measured, this
  // script's own `--json` came through a pipe cut at exactly 65,536 bytes, mid
  // object, with the exit code intact. Every sanctioned caller pipes: the
  // ticket's criteria use `$(…)` and `| grep`, and the skills paste the table.
  try {
    const { stdout, code } = run(process.argv.slice(2))
    console.log(stdout)
    process.exitCode = code
  } catch (e) {
    console.error(`fidelity: ${e instanceof UsageError ? e.message : e.stack}`)
    process.exitCode = 2
  }
}
