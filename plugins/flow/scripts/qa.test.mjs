import { test, after, beforeEach } from 'node:test'
import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { mkdtempSync, rmSync, writeFileSync, readFileSync, realpathSync, mkdirSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { tmpdir } from 'node:os'
import { fileURLToPath } from 'node:url'
import { installFakeGh } from './tracker/fake-gh.mjs'
import { parseQaSection, readQaConfig, parseWidthsOption, deniedBy, readSitemap, readLinks, buildRoutes, sameSiteSitemaps, normaliseFirstLine, qaFingerprint, siteAddress, QaInputError, DEFAULT_WIDTHS, QA_KEYS } from './qa.mjs'

const here = dirname(fileURLToPath(import.meta.url))
const FLOW = join(here, 'flow.mjs')
const FIXTURES = join(here, 'fixtures', 'qa')
const fixture = (name) => readFileSync(join(FIXTURES, name), 'utf8')
const directory = realpathSync(mkdtempSync(join(tmpdir(), 'flow-qa-')))
after(() => rmSync(directory, { recursive: true, force: true }))
const fake = installFakeGh(join(directory, 'bin'))
beforeEach(() => fake.clearCalls())
const start = new URL('https://shop.example/')

function project(name, config) {
  const root = join(directory, name)
  mkdirSync(root, { recursive: true })
  spawnSync('git', ['init', '--quiet', root])
  if (config !== undefined) writeFileSync(join(root, '.flow.json'), typeof config === 'string' ? config : JSON.stringify(config))
  mkdirSync(join(root, 'web'), { recursive: true })
  return root
}

function flow(cwd, ...args) {
  const result = spawnSync(process.execPath, [FLOW, ...args], { cwd, encoding: 'utf8', env: { ...process.env, ...fake.env } })
  return { status: result.status, stdout: result.stdout, stderr: result.stderr }
}

test('a missing qa section is the defaults: no routes, no deny patterns, the two widths, no test marker', () => {
  assert.deepEqual(parseQaSection(undefined), { config: { routes: [], deny: [], widths: DEFAULT_WIDTHS, testMarker: null }, problems: [] })
  assert.deepEqual(DEFAULT_WIDTHS, [1440, 393])
  assert.deepEqual(QA_KEYS, ['routes', 'deny', 'widths', 'testMarker'])
})

test('a full qa section is read as written, trimmed, with repeated widths once', () => {
  const { config, problems } = parseQaSection({ routes: ['/', ' /pricing ', 'https://shop.example/about'], deny: ['checkout', '/account/*'], widths: [1280, 390, 1280], testMarker: ' [flow-qa-test] ' })
  assert.deepEqual(problems, [])
  assert.deepEqual(config, { routes: ['/', '/pricing', 'https://shop.example/about'], deny: ['checkout', '/account/*'], widths: [1280, 390], testMarker: '[flow-qa-test]' })
})

test('an unknown key or a wrong type is a named problem, never a guess', () => {
  const cases = [
    [[], /"qa" must be an object with any of the keys "routes", "deny", "widths", "testMarker"/],
    ['all', /must be an object/],
    [{ route: ['/'] }, /unknown key "route" — the keys are "routes", "deny", "widths", "testMarker"/],
    [{ routes: '/pricing' }, /"routes" must be a list of paths/],
    [{ routes: ['pricing'] }, /"routes"\[0\] \("pricing"\) is not a path starting "\/"/],
    [{ routes: ['/a', 7] }, /"routes"\[1\] \(7\) is not a path/],
    [{ routes: ['ftp://shop.example/'] }, /"routes"\[0\]/],
    [{ deny: 'checkout' }, /"deny" must be a list of words or paths/],
    [{ deny: [''] }, /"deny"\[0\] \(""\) is not one line of text/],
    [{ deny: ['a\nb'] }, /"deny"\[0\]/],
    [{ widths: 1440 }, /"widths" must be a list of window widths/],
    [{ widths: [] }, /"widths" is empty/],
    [{ widths: ['1440'] }, /"widths"\[0\] \("1440"\) is not a whole number of pixels above 0/],
    [{ widths: [393.5] }, /"widths"\[0\] \(393\.5\)/],
    [{ widths: [0] }, /"widths"\[0\] \(0\)/],
    [{ testMarker: 42 }, /"testMarker" must be one line of text/],
    [{ testMarker: '  ' }, /"testMarker"/],
  ]
  for (const [section, expected] of cases) {
    const { problems } = parseQaSection(section)
    assert.equal(problems.length, 1, `${JSON.stringify(section)}: ${problems.join(' | ')}`)
    assert.match(problems[0], expected)
  }
  const several = parseQaSection({ widths: 'wide', deny: [1], colour: 'red', size: 2 })
  assert.equal(several.problems.length, 3, 'every problem is named at once, so one edit fixes them all')
  assert.match(several.problems[0], /unknown keys "colour", "size"/)
  assert.deepEqual(several.config.widths, DEFAULT_WIDTHS)
  assert.deepEqual(several.config.deny, [], 'a broken list is not half used')
})

test('the section is read from .flow.json at the given root, and a file that is not JSON or not an object is a problem', () => {
  const root = project('read', { screenshots: 'npm run shots', qa: { widths: [800] } })
  assert.deepEqual(readQaConfig(root), { config: { routes: [], deny: [], widths: [800], testMarker: null }, problems: [], file: join(root, '.flow.json') })
  assert.equal(readQaConfig(project('read-none')).file, null)
  assert.deepEqual(readQaConfig(project('read-none')).problems, [])
  assert.match(readQaConfig(project('read-broken', '{ "qa": ')).problems[0], /^\.flow\.json is not valid JSON/)
  assert.deepEqual(readQaConfig(project('read-array', '[]')).problems, ['.flow.json must be a JSON object'])
})

test('--widths is whole numbers separated by commas, and anything else is named', () => {
  assert.deepEqual(parseWidthsOption('1440,393'), { widths: [1440, 393], problem: null })
  assert.deepEqual(parseWidthsOption(' 1024 , 1024 '), { widths: [1024], problem: null })
  assert.match(parseWidthsOption('1440,wide').problem, /"wide" is not one/)
  assert.match(parseWidthsOption('1440,').problem, /"" is not one/)
  assert.match(parseWidthsOption('0').problem, /"0" is not one/)
  assert.match(parseWidthsOption('39.5').problem, /"39\.5" is not one/)
})

test('a deny pattern matches anywhere in the text, ignoring case, and * stands for any run of characters', () => {
  assert.equal(deniedBy(['checkout'], '/Checkout/step-1'), 'checkout')
  assert.equal(deniedBy(['Delete'], 'Delete my account'), 'Delete')
  assert.equal(deniedBy(['/account/*/remove'], '/account/42/remove'), '/account/*/remove')
  assert.equal(deniedBy(['/account/*/remove'], '/account/42/edit'), null)
  assert.equal(deniedBy(['a.b'], 'axb'), null, 'a dot is a dot, not any character')
  assert.equal(deniedBy(['(beta)'], 'try (beta) now'), '(beta)')
  assert.equal(deniedBy(['pay', 'order'], 'place order and pay'), 'pay', 'the first pattern in the list that matches is named')
  assert.equal(deniedBy([], '/checkout'), null)
  assert.equal(deniedBy(['x'], ''), null)
})

test('a sitemap gives its pages, decoded; a sitemap index gives the sitemaps to read next', () => {
  const read = readSitemap(fixture('sitemap.xml'))
  assert.deepEqual(read.sitemaps, [])
  assert.equal(read.pages.length, 12)
  assert.equal(read.pages[4], 'https://shop.example/search?q=boots&page=2', 'an entity is decoded and the whitespace around a location dropped')
  assert.equal(read.pages[5], 'https://shop.example/about', 'a CDATA location is read too')
  assert.deepEqual(readSitemap(fixture('sitemap-index.xml')), { pages: [], sitemaps: ['https://shop.example/sitemap-pages.xml', 'https://shop.example/sitemap-products.xml'] })
  assert.deepEqual(readSitemap('<html>not a sitemap</html>'), { pages: [], sitemaps: [] })
  assert.deepEqual(readSitemap('<urlset><loc>https://shop.example/caf&#233;?a=&#x31;</loc></urlset>').pages, ['https://shop.example/café?a=1'])
  assert.throws(() => readSitemap('<urlset><loc>https://shop.example/&#9999999999;</loc></urlset>'), (error) => error instanceof QaInputError && /"&#9999999999;" is not a character/.test(error.message))
  assert.throws(() => readLinks('<a href="/&#x110000;">x</a>'), QaInputError)
})

test('only the site\'s own sitemaps are read next', () => {
  assert.deepEqual(sameSiteSitemaps(start, ['https://shop.example/a.xml', '/b.xml', 'https://cdn.example/c.xml', 'http://shop.example/d.xml', 'http://[bad']), ['https://shop.example/a.xml', '/b.xml'])
})

test('links come from the anchors of a saved page, or one per line from a list', () => {
  const links = readLinks(fixture('start-page.html'))
  assert.equal(links.length, 12, 'anchors only: the stylesheet link is not a page')
  assert.deepEqual(links.slice(0, 4), ['/', 'pricing', '/contact', '/about'], 'double, single and unquoted attributes')
  assert.ok(links.includes('/search?q=a&sort=new'))
  assert.deepEqual(readLinks('/pricing\n\n  https://shop.example/about  \n# a note\r\n/faq\n'), ['/pricing', 'https://shop.example/about', '/faq'])
})

test('the route list starts at the given page and keeps same-site pages once, in order, without deny matches, up to the cap', () => {
  const { pages } = readSitemap(fixture('sitemap.xml'))
  const built = buildRoutes({ start, candidates: pages, deny: ['checkout', '/account/*'] })
  assert.equal(built.origin, 'https://shop.example')
  assert.deepEqual(built.routes, ['https://shop.example/', 'https://shop.example/pricing', 'https://shop.example/search?q=boots&page=2', 'https://shop.example/about', 'https://shop.example/%D0%BE-%D0%BD%D0%B0%D1%81'])
  assert.deepEqual(built.skipped, {
    otherSite: 2,
    notAPage: 1,
    notAnAddress: 0,
    duplicates: 3,
    overCap: 0,
    denied: [
      { route: 'https://shop.example/checkout', pattern: 'checkout' },
      { route: 'https://shop.example/account/delete', pattern: '/account/*' },
    ],
  })
  assert.equal(buildRoutes({ start, candidates: pages, deny: ['о-нас'] }).skipped.denied[0].pattern, 'о-нас', 'a pattern is matched against the readable path, not the percent-encoded one')
})

test('links from a page are resolved against the start, and mail, phone, script and other sites are left out', () => {
  const built = buildRoutes({ start: new URL('https://shop.example/en/'), candidates: readLinks(fixture('start-page.html')), deny: ['checkout'] })
  assert.deepEqual(built.routes, ['https://shop.example/en', 'https://shop.example/', 'https://shop.example/en/pricing', 'https://shop.example/contact', 'https://shop.example/about', 'https://shop.example/search?q=a&sort=new'])
  assert.equal(built.skipped.notAnAddress, 3)
  assert.equal(built.skipped.otherSite, 1)
  assert.equal(built.skipped.duplicates, 2, '"/about/" is "/about", and "#top" is the start page')
  assert.deepEqual(built.skipped.denied, [{ route: 'https://shop.example/Checkout/Step-1', pattern: 'checkout' }])
})

test('the cap counts the start page and says how many were left over', () => {
  const candidates = Array.from({ length: 80 }, (unused, index) => `/item/${index}`)
  const capped = buildRoutes({ start, candidates })
  assert.equal(capped.routes.length, 60)
  assert.equal(capped.routes[59], 'https://shop.example/item/58')
  assert.equal(capped.skipped.overCap, 21)
  assert.equal(buildRoutes({ start, candidates, cap: 3 }).routes.length, 3)
})

test('the fingerprint is the page path and the first line lowercased, numbers as #, punctuation as spaces', () => {
  assert.equal(normaliseFirstLine('Console error: Failed to load resource (404) at /api/v2/items?id=31!\nsecond line'), 'console error failed to load resource # at api v# items id #')
  assert.equal(normaliseFirstLine('  Текст   обрезан  в карточке  '), 'текст обрезан в карточке')
  assert.equal(normaliseFirstLine('ＦＵＬＬ width'), 'full width')
  assert.equal(normaliseFirstLine('x'.repeat(300)).length, 120)
  assert.deepEqual(qaFingerprint('https://shop.example/pricing/?plan=pro#top', 'Pricing table overflows at 393px'), { fingerprint: 'qa /pricing pricing table overflows at #px', problem: null })
  assert.equal(qaFingerprint('https://shop.example/pricing', 'Pricing table overflows at 390px').fingerprint, qaFingerprint('https://shop.example/pricing/', 'pricing table  overflows at 393px.').fingerprint, 'the same problem found again files once')
  assert.notEqual(qaFingerprint('https://shop.example/a', 'Broken link').fingerprint, qaFingerprint('https://shop.example/b', 'Broken link').fingerprint)
  assert.equal(qaFingerprint('https://shop.example/', 'Hero image missing').fingerprint, 'qa / hero image missing')
  assert.equal(qaFingerprint('https://shop.example/Pricing', 'Broken link').fingerprint, qaFingerprint('https://shop.example/pricing', 'Broken link').fingerprint, 'a link written with capitals is the same page found again')
  assert.doesNotMatch(qaFingerprint('https://shop.example/a-->b', 'x --> y --!> z').fingerprint, /--!?>|[\r\n]/, 'nothing that would end the marker early')
  assert.match(qaFingerprint('/pricing', 'x').problem, /is not an address/)
  assert.match(qaFingerprint('https://shop.example/', '!!! 404 ...').problem, /no words/, 'a line of numbers and punctuation would match every other such line')
})

test('the site address must be a web address', () => {
  assert.equal(siteAddress('https://shop.example/en#x').url.href, 'https://shop.example/en')
  assert.match(siteAddress('shop.example').problem, /starting http:\/\/ or https:\/\//)
  assert.match(siteAddress('file:///etc/passwd').problem, /is not a web address/)
})

test('flow qa-config prints the checked section with --widths applied, and exits 2 naming every problem', () => {
  const root = project('cli-config', { qa: { deny: ['checkout'], testMarker: '[qa]' } })
  const shown = flow(join(root, 'web'), 'qa-config', '--widths', '1280,390')
  assert.equal(shown.status, 0, shown.stderr)
  assert.deepEqual(JSON.parse(shown.stdout), { file: join(root, '.flow.json'), routes: [], deny: ['checkout'], widths: [1280, 390], testMarker: '[qa]' })
  assert.deepEqual(JSON.parse(flow(project('cli-config-none'), 'qa-config').stdout).widths, [1440, 393])
  const broken = flow(project('cli-config-broken', { qa: { width: [1] } }), 'qa-config', '--widths', 'wide')
  assert.equal(broken.status, 2)
  assert.match(broken.stderr, /^flow: \.flow\.json "qa": unknown key "width" — the keys are/m)
  assert.match(broken.stderr, /^flow: --widths takes whole numbers/m)
  assert.equal(broken.stdout, '')
  assert.deepEqual(fake.calls(), [], 'no GitHub call')
})

test('flow qa-routes builds the list from a sitemap, links, a routes file or .flow.json, applying the deny patterns', () => {
  const root = project('cli-routes', { qa: { deny: ['/account/*'], routes: ['/', '/faq', '/account/close'] } })
  const sitemap = flow(root, 'qa-routes', 'https://shop.example/', '--sitemap', join(FIXTURES, 'sitemap.xml'), join(FIXTURES, 'sitemap-index.xml'), '--cap', '3')
  assert.equal(sitemap.status, 0, sitemap.stderr)
  const fromSitemap = JSON.parse(sitemap.stdout)
  assert.equal(fromSitemap.source, 'sitemap')
  assert.deepEqual(fromSitemap.routes, ['https://shop.example/', 'https://shop.example/pricing', 'https://shop.example/search?q=boots&page=2'])
  assert.deepEqual(fromSitemap.skipped.denied, [{ route: 'https://shop.example/account/delete', pattern: '/account/*' }])
  assert.equal(fromSitemap.skipped.overCap, 3)
  assert.deepEqual(fromSitemap.sitemaps, ['https://shop.example/sitemap-pages.xml', 'https://shop.example/sitemap-products.xml'])
  const links = JSON.parse(flow(root, 'qa-routes', 'https://shop.example/', '--links', join(FIXTURES, 'start-page.html')).stdout)
  assert.equal(links.source, 'links')
  assert.equal(links.routes.length, 6)
  const listFile = join(directory, 'routes.txt')
  writeFileSync(listFile, '/pricing\nhttps://elsewhere.example/\n')
  const given = JSON.parse(flow(root, 'qa-routes', 'https://shop.example/', '--routes', listFile).stdout)
  assert.deepEqual([given.source, given.routes, given.skipped.otherSite], ['routes', ['https://shop.example/', 'https://shop.example/pricing'], 1])
  const configured = JSON.parse(flow(root, 'qa-routes', 'https://shop.example').stdout)
  assert.deepEqual([configured.source, configured.routes], ['.flow.json', ['https://shop.example/', 'https://shop.example/faq']])
  assert.deepEqual(configured.skipped.denied, [{ route: 'https://shop.example/account/close', pattern: '/account/*' }])
  assert.deepEqual(fake.calls(), [], 'no GitHub call')
})

test('flow qa-routes refuses what it cannot build from, by name', () => {
  const root = project('cli-routes-refusals', {})
  const none = flow(root, 'qa-routes', 'https://shop.example/')
  assert.equal(none.status, 2)
  assert.match(none.stderr, /nothing to build the route list from: give --routes, --sitemap or --links/)
  assert.match(flow(root, 'qa-routes', 'shop.example', '--links', join(FIXTURES, 'start-page.html')).stderr, /is not an address/)
  assert.equal(flow(root, 'qa-routes', 'https://shop.example/', '--links', join(FIXTURES, 'start-page.html'), '--cap', '0').status, 2)
  assert.match(flow(root, 'qa-routes', 'https://shop.example/', '--links', join(FIXTURES, 'start-page.html'), '--cap', 'all').stderr, /--cap takes a whole number of pages above 0, and "all"/)
  const both = flow(root, 'qa-routes', 'https://shop.example/', '--links', join(FIXTURES, 'start-page.html'), '--routes', join(FIXTURES, 'start-page.html'))
  assert.equal(both.status, 2)
  assert.match(both.stderr, /give one of --routes, --sitemap and --links, not --routes and --links/)
  const broken = flow(project('cli-routes-broken', { qa: { deny: 'checkout' } }), 'qa-routes', 'https://shop.example/', '--links', join(FIXTURES, 'start-page.html'))
  assert.equal(broken.status, 2, 'a deny list it cannot read is never skipped: the explorer would visit what it names')
  assert.match(broken.stderr, /"deny" must be a list/)
  const missing = flow(root, 'qa-routes', 'https://shop.example/', '--sitemap', join(directory, 'missing.xml'))
  assert.equal(missing.status, 2)
  assert.match(missing.stderr, /^flow: --sitemap \S+missing\.xml cannot be read \(ENOENT\)$/m)
  assert.doesNotMatch(missing.stderr, /at \S+:\d+:\d+/, 'a named problem, not a stack trace')
  const badEntity = join(directory, 'bad-entity.xml')
  writeFileSync(badEntity, '<urlset><url><loc>https://shop.example/&#9999999999;</loc></url></urlset>')
  const unreadable = flow(root, 'qa-routes', 'https://shop.example/', '--sitemap', badEntity)
  assert.equal(unreadable.status, 2)
  assert.match(unreadable.stderr, /^flow: --sitemap \S+bad-entity\.xml: "&#9999999999;" is not a character/m)
  assert.equal(flow(root, 'qa-routes', 'https://shop.example/', '--links', join(directory, 'missing.html')).status, 2)
  const foreignIndex = join(directory, 'foreign-index.xml')
  writeFileSync(foreignIndex, '<sitemapindex><sitemap><loc>https://shop.example/pages.xml</loc></sitemap><sitemap><loc>https://cdn.example/pages.xml</loc></sitemap></sitemapindex>')
  const index = JSON.parse(flow(root, 'qa-routes', 'https://shop.example/', '--sitemap', foreignIndex).stdout)
  assert.deepEqual([index.sitemaps, index.skipped.otherSiteSitemaps], [['https://shop.example/pages.xml'], 1], 'a sitemap on another host is never fetched')
})

test('flow qa-fingerprint prints one line the finding is filed with, and refuses a path or an empty line', () => {
  const root = project('cli-fingerprint')
  const printed = flow(root, 'qa-fingerprint', 'https://shop.example/pricing/', 'Pricing table overflows at 393px')
  assert.equal(printed.status, 0, printed.stderr)
  assert.equal(printed.stdout, 'qa /pricing pricing table overflows at #px\n')
  assert.equal(flow(root, 'qa-fingerprint', '/pricing', 'x').status, 2)
  assert.equal(flow(root, 'qa-fingerprint', 'https://shop.example/', '...').status, 2)
  assert.equal(flow(root, 'qa-fingerprint', 'https://shop.example/').status, 2)
  assert.deepEqual(fake.calls(), [], 'no GitHub call')
})
