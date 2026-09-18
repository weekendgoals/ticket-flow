// fidelity.test.mjs — the differ, and the extractor without a browser.
//
// Two halves, tested two ways. The extractor is proven the only way a printed
// function can be: its printed source is evaluated with `new Function` — which
// sees no module scope, so a closure reference fails here rather than inside
// somebody's page — against a stub `document` / `getComputedStyle`. The plugin
// owns no browser and no test may need one, which is also why the committed
// `design.json` / `page.json` are what a real browser returned once (the
// ticket's smoke test), read back here as fixtures rather than re-rendered.
//
// The diff is driven through the real CLI on those fixtures for every row kind
// and exit code, and through the exported functions for the normalisation
// rules, where the interesting inputs are the ones no fixture can produce: two
// renderers printing one value two ways.

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { asRgba, diffReports, firstFamily, sameValue, validateMap } from './fidelity.mjs'

const SCRIPT = fileURLToPath(new URL('./fidelity.mjs', import.meta.url))
const FIX = (f) => fileURLToPath(new URL(`./fixtures/fidelity/${f}`, import.meta.url))
const DESIGN = FIX('design.json')
const PAGE = FIX('page.json')
const MAP = FIX('design-map.json')

const cli = (...args) => {
  const r = spawnSync(process.execPath, [SCRIPT, ...args], { encoding: 'utf8' })
  return { out: r.stdout, err: r.stderr, code: r.status }
}
const diff = (...args) => cli('diff', DESIGN, PAGE, '--map', MAP, ...args)
const rowsOf = (...args) => {
  const r = diff('--json', ...args)
  return { ...r, ...JSON.parse(r.out) }
}
const rowFor = (rows, landmark, property) => rows.find((x) => x.landmark === landmark && x.property === property)

const tmp = (name, value) => {
  const dir = mkdtempSync(join(tmpdir(), 'fidelity-'))
  const file = join(dir, name)
  writeFileSync(file, typeof value === 'string' ? value : JSON.stringify(value, null, 2))
  return file
}

// ── the extractor ────────────────────────────────────────────────────────────

const source = cli('extract').out.trim()
const extractor = () => new Function(`return (${source})`)()

// A stub page: elements in document order, reachable by selector. Nothing here
// is a DOM — it is exactly the surface the extractor is allowed to use, which
// is the point: anything else it reaches for fails as an undefined global.
function stub({ order = [], bySelector = {}, innerWidth = 1280 } = {}) {
  const saved = { document: globalThis.document, getComputedStyle: globalThis.getComputedStyle, window: globalThis.window }
  globalThis.document = {
    querySelector: (sel) => {
      if (sel === '!!bad') throw new Error('not a valid selector')
      return bySelector[sel] ?? null
    },
    querySelectorAll: () => order,
  }
  globalThis.getComputedStyle = (el) => ({ getPropertyValue: (p) => el.style[p] ?? '' })
  globalThis.window = { innerWidth }
  return () => Object.assign(globalThis, saved)
}
const el = (style = {}, childCount = 0, rect = { width: 0, height: 0 }) => ({
  style,
  children: { length: childCount },
  getBoundingClientRect: () => rect,
})

const PROPS = [
  'display', 'grid-template-columns', 'column-gap', 'row-gap', 'flex-direction',
  'font-family', 'font-size', 'font-weight', 'letter-spacing', 'line-height',
  'color', 'background-color', 'border-radius',
  'padding-top', 'padding-right', 'padding-bottom', 'padding-left', 'width', 'height',
]

test('extract prints one self-contained function expression of two arguments', () => {
  assert.equal(typeof extractor(), 'function')
  assert.equal(extractor().length, 2)
  assert.doesNotMatch(source, /\bimport\b|\brequire\(/, 'the printed text crosses into a page alone — an import would not survive')
})

test('the extractor returns the documented shape, with the fixed property set', () => {
  const hero = el({ display: 'block', 'font-size': '32px' }, 2, { width: 900, height: 136 })
  const restore = stub({ order: [hero], bySelector: { '#hero': hero }, innerWidth: 1440 })
  try {
    const report = extractor()([{ name: 'hero', design: '#hero', page: '.masthead' }], 'design')
    assert.deepEqual(Object.keys(report), ['side', 'viewportWidth', 'landmarks'])
    assert.equal(report.side, 'design')
    assert.equal(report.viewportWidth, 1440)
    assert.deepEqual(Object.keys(report.landmarks.hero), ['found', 'order', 'childCount', 'props'])
    assert.deepEqual(Object.keys(report.landmarks.hero.props), PROPS)
    assert.equal(report.landmarks.hero.childCount, 2)
    assert.equal(report.landmarks.hero.props['font-size'], '32px')
    assert.equal(report.landmarks.hero.props.display, 'block')
  } finally { restore() }
})

test('side picks which selector of each landmark is used', () => {
  const drawn = el({ display: 'grid' })
  const built = el({ display: 'flex' })
  const restore = stub({ order: [drawn, built], bySelector: { '#hero': drawn, '.masthead': built } })
  try {
    const map = [{ name: 'hero', design: '#hero', page: '.masthead' }]
    assert.equal(extractor()(map, 'design').landmarks.hero.props.display, 'grid')
    assert.equal(extractor()(map, 'page').landmarks.hero.props.display, 'flex')
  } finally { restore() }
})

test('width and height come from the border box, rounded to two decimals', () => {
  const box = el({}, 0, { width: 273.328125, height: 41.1953125 })
  const restore = stub({ order: [box], bySelector: { '#b': box } })
  try {
    const props = extractor()([{ name: 'b', design: '#b', page: '#b' }], 'design').landmarks.b.props
    assert.equal(props.width, '273.33px')
    assert.equal(props.height, '41.2px')
  } finally { restore() }
})

test('a landmark nothing matches is reported as not found, never as a default', () => {
  const restore = stub({ order: [], bySelector: {} })
  try {
    const row = extractor()([{ name: 'ghost', design: '#ghost', page: '#ghost' }], 'design').landmarks.ghost
    assert.deepEqual(row, { found: false, order: null, childCount: null, props: {} })
  } finally { restore() }
})

test('a selector the engine rejects is not found, and does not throw the whole run away', () => {
  const restore = stub({ order: [], bySelector: {} })
  try {
    const report = extractor()([{ name: 'bad', design: '!!bad', page: '!!bad' }], 'design')
    assert.equal(report.landmarks.bad.found, false)
  } finally { restore() }
})

test('order is the position among found landmarks in document order, not in map order', () => {
  const first = el()
  const second = el()
  const third = el()
  const restore = stub({ order: [first, second, third], bySelector: { '#a': first, '#b': second, '#c': third } })
  try {
    const report = extractor()(
      // declared c, a, b — the map's order must not decide the answer
      [{ name: 'c', design: '#c', page: '#c' }, { name: 'a', design: '#a', page: '#a' }, { name: 'missing', design: '#none', page: '#none' }, { name: 'b', design: '#b', page: '#b' }],
      'design',
    )
    assert.equal(report.landmarks.a.order, 1)
    assert.equal(report.landmarks.b.order, 2)
    assert.equal(report.landmarks.c.order, 3)
    assert.equal(report.landmarks.missing.order, null)
  } finally { restore() }
})

// ── the row kinds, over reports a real browser produced ──────────────────────

test('a differing grid track list is named by property, and the run exits 1', () => {
  const r = diff()
  assert.match(r.out, /grid-template-columns/)
  assert.equal(r.code, 1)
  const { rows } = rowsOf()
  const row = rowFor(rows, 'grid', 'grid-template-columns')
  assert.equal(row.design.trim().split(/\s+/).length, 3, 'the design draws three tracks')
  assert.equal(row.page.trim().split(/\s+/).length, 2, 'the page built two')
})

test('a landmark drawn and not built, declared nowhere, is missing', () => {
  const { rows } = rowsOf()
  assert.equal(rowFor(rows, 'banner', 'presence').page, 'missing')
  assert.equal(rowFor(rows, 'banner', 'presence').kind, 'missing')
})

test('a removal is honoured from --removed-from, and the row names the decision and the date', () => {
  const r = diff('--removed-from', MAP)
  assert.match(r.out, /removed by ground rule 2 — no promotional band in this release, 2026-09-18/)
  const { rows } = rowsOf('--removed-from', MAP)
  assert.equal(rowFor(rows, 'promo', 'presence').kind, 'removed')
})

test("a removed list inside --map is never honoured, and the table says so", () => {
  const { rows, notes } = rowsOf()
  assert.equal(rowFor(rows, 'promo', 'presence').page, 'missing', 'the map declares promo removed; unsigned, it is still missing')
  assert.ok(notes.some((n) => /never honoured/.test(n) && /--removed-from/.test(n)))
})

test('a landmark declared removed that is on the page is its own row', () => {
  const { rows } = rowsOf('--removed-from', MAP)
  const row = rowFor(rows, 'legacy', 'presence')
  assert.equal(row.kind, 'removal-contradicted')
  assert.match(row.page, /on the page — declared removed by ground rule 3/)
})

test('swapped landmarks differ in order', () => {
  const { rows } = rowsOf()
  assert.equal(rowFor(rows, 'aside', 'order').kind, 'order')
  assert.equal(rowFor(rows, 'footer', 'order').kind, 'order')
  assert.equal(rowFor(rows, 'aside', 'order').design, rowFor(rows, 'footer', 'order').page)
})

test('a landmark with one child fewer is a childCount row', () => {
  const { rows } = rowsOf()
  assert.equal(rowFor(rows, 'card', 'childCount').design, '3')
  assert.equal(rowFor(rows, 'card', 'childCount').page, '2')
})

test('a landmark built as drawn prints no row at all', () => {
  const { rows } = rowsOf()
  assert.deepEqual(rows.filter((r) => r.landmark === 'nav'), [])
})

test('a landmark on the page that the design does not draw is its own row', () => {
  const { rows } = rowsOf()
  assert.equal(rowFor(rows, 'extra', 'presence').kind, 'absent-in-design')
})

test('the real reports carry every property the extractor documents', () => {
  const { rows } = rowsOf()
  const hero = rows.filter((r) => r.landmark === 'hero').map((r) => r.property)
  for (const p of ['font-family', 'font-size', 'font-weight', 'color', 'background-color', 'border-radius', 'padding-top'])
    assert.ok(hero.includes(p), `the hero differs in ${p} and the differ must say so`)
  assert.ok(!hero.includes('line-height'), 'line-height is equal on both sides and must not be a row')
})

// ── exit codes ───────────────────────────────────────────────────────────────

test('exit 0 when the only rows are declared removals', () => {
  const r = diff('--removed-from', MAP, '--landmarks', 'promo')
  assert.equal(r.code, 0)
  assert.match(r.out, /removed by/)
})

test('exit 0 when nothing differs', () => {
  const r = diff('--landmarks', 'nav')
  assert.equal(r.code, 0)
  assert.match(r.out, /no differences — 1 landmark compared/)
})

test('exit 1 when anything else differs, including a declared removal beside it', () => {
  assert.equal(diff('--removed-from', MAP, '--landmarks', 'promo,banner').code, 1)
})

test('exit 2 on a usage error, never 1 — a typo is not a difference', () => {
  assert.equal(cli('diff', DESIGN, PAGE).code, 2, 'no --map')
  assert.equal(cli('diff', DESIGN, '--map', MAP).code, 2, 'one report')
  assert.equal(diff('--nope').code, 2)
  assert.equal(diff('--map').code, 2, '--map with no value')
  assert.equal(cli('extract', 'extra').code, 2)
  assert.equal(cli().code, 2)
  assert.equal(cli('compare').code, 2)
  assert.match(cli('compare').err, /unknown command "compare"/)
})

test('exit 2 on unreadable input, naming the file', () => {
  const r = cli('diff', '/no/such/design.json', PAGE, '--map', MAP)
  assert.equal(r.code, 2)
  assert.match(r.err, /design report: cannot read \/no\/such\/design\.json/)
  const junk = tmp('page.json', '{not json')
  const r2 = cli('diff', DESIGN, junk, '--map', MAP)
  assert.equal(r2.code, 2)
  assert.match(r2.err, /not valid JSON/)
})

test('a report given as the wrong side is refused, not compared backwards', () => {
  const r = cli('diff', PAGE, DESIGN, '--map', MAP)
  assert.equal(r.code, 2)
  assert.match(r.err, /look swapped/)
})

test('--landmarks naming something the map does not declare is refused, not compared as nothing', () => {
  const r = diff('--landmarks', 'hero,ghost')
  assert.equal(r.code, 2)
  assert.match(r.err, /ghost/)
})

// ── the design map ───────────────────────────────────────────────────────────

test('a malformed map exits 2 naming the entry', () => {
  const cases = [
    [{ landmarks: [{ name: 'a', design: '#a', page: '#a' }, { name: 'b', design: '#b' }] }, /landmarks\[1\] \("b"\) has no "page"/],
    [{ landmarks: 'hero' }, /"landmarks" must be an array/],
    [{ landmarks: [{ name: 'a', design: '#a', page: '#a' }], removed: { a: true } }, /"removed" must be an array/],
    [{ landmarks: [{ name: 'a', design: '#a', page: '#a' }], removed: [{ name: 'a', by: 'rule 1' }] }, /removed\[0\] \("a"\) has no "date"/],
    [{ landmarks: [{ name: 'a', design: '#a', page: '#a' }, { name: 'a', design: '#b', page: '#b' }] }, /"a" is declared twice/],
  ]
  for (const [map, expected] of cases) {
    const r = cli('diff', DESIGN, PAGE, '--map', tmp('design-map.json', map))
    assert.equal(r.code, 2)
    assert.match(r.err, expected)
  }
})

test('the fixture map is a valid map', () => {
  assert.equal(validateMap(JSON.parse(readFileSync(MAP, 'utf8')), 'fixture').landmarks.length, 10)
})

// ── normalisation ────────────────────────────────────────────────────────────

test('lengths within 0.5px are equal, and beyond it are not', () => {
  assert.ok(sameValue('width', '273.33px', '273.5px'))
  assert.ok(sameValue('height', '41px', '41.5px'))
  assert.ok(!sameValue('height', '41px', '41.6px'))
  assert.ok(!sameValue('width', '900px', '899px'))
})

test('a track list compares track by track, with the same tolerance', () => {
  assert.ok(sameValue('grid-template-columns', '273.33px 273.33px 273.34px', '273.5px 273.5px 273.5px'))
  assert.ok(!sameValue('grid-template-columns', '273px 273px 273px', '426px 426px'), 'a different track count is a different layout')
  assert.ok(!sameValue('grid-template-columns', '100px 200px', '200px 100px'))
})

test('colours compare as rgba, however they are printed', () => {
  assert.ok(sameValue('color', '#112233', 'rgb(17, 34, 51)'))
  assert.ok(sameValue('color', 'rgb(17, 34, 51)', 'rgba(17, 34, 51, 1)'))
  assert.ok(sameValue('background-color', 'transparent', 'rgba(0, 0, 0, 0)'))
  assert.ok(sameValue('color', '#abc', '#aabbcc'))
  assert.ok(!sameValue('color', 'rgb(17, 34, 51)', 'rgba(17, 34, 51, 0.5)'))
  assert.ok(!sameValue('color', '#112233', 'rgb(17, 34, 52)'))
  assert.equal(asRgba('rgb(1 2 3 / 0.5)'), '1,2,3,0.5')
  assert.equal(asRgba('not a colour'), null)
})

test('font-family compares its first family, unquoted and case-insensitively', () => {
  assert.ok(sameValue('font-family', '"Inter", system-ui, sans-serif', 'Inter, Helvetica'))
  assert.ok(sameValue('font-family', 'system-ui', 'System-UI, sans-serif'))
  assert.ok(!sameValue('font-family', 'system-ui, sans-serif', 'ui-monospace, monospace'))
  assert.equal(firstFamily("'SF Pro Text', system-ui"), 'sf pro text')
})

test('a value one report carries and the other does not is a row, not a silent match', () => {
  const landmarks = [{ name: 'a', design: '#a', page: '#a' }]
  const side = (props) => ({ landmarks: { a: { found: true, order: 1, childCount: 0, props } } })
  const { rows } = diffReports(side({ display: 'block', color: 'rgb(0, 0, 0)' }), side({ display: 'block' }), { landmarks })
  assert.equal(rows.length, 1)
  assert.equal(rows[0].page, '(not reported)')
})

// ── notes, which are not rows ────────────────────────────────────────────────

test('landmarks that matched nothing on either side are noted, and are not differences', () => {
  const landmarks = [{ name: 'a', design: '#a', page: '#a' }]
  const empty = { landmarks: { a: { found: false, order: null, childCount: null, props: {} } } }
  const result = diffReports(empty, empty, { landmarks })
  assert.deepEqual(result.rows, [])
  assert.equal(result.exit, 0)
  assert.equal(result.compared, 0)
  assert.ok(result.notes.some((n) => /matched nothing/.test(n)))
})

test('reports taken at different viewport widths are noted, because the comparison is not one page', () => {
  const landmarks = [{ name: 'a', design: '#a', page: '#a' }]
  const side = (viewportWidth) => ({ viewportWidth, landmarks: { a: { found: true, order: 1, childCount: 0, props: { width: '900px' } } } })
  const result = diffReports(side(1440), side(393), { landmarks })
  assert.deepEqual(result.rows, [])
  assert.ok(result.notes.some((n) => /different viewport widths \(design 1440, page 393\)/.test(n)))
})
