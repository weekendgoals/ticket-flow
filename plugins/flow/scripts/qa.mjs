import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'

export const QA_KEYS = ['routes', 'deny', 'widths', 'testMarker']
export const DEFAULT_WIDTHS = [1440, 393]
export const DEFAULT_ROUTE_CAP = 60
export const FINGERPRINT_LINE_LIMIT = 120

const NOT_PAGE_EXTENSIONS = new Set(['pdf', 'png', 'jpg', 'jpeg', 'gif', 'webp', 'avif', 'svg', 'ico', 'css', 'js', 'mjs', 'map', 'json', 'xml', 'txt', 'zip', 'gz', 'mp4', 'webm', 'mp3', 'woff', 'woff2', 'ttf', 'otf', 'csv', 'doc', 'docx', 'xls', 'xlsx'])
const XML_ENTITIES = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'" }

const quoted = (keys) => keys.map((key) => `"${key}"`).join(', ')
const isPlainObject = (value) => value !== null && typeof value === 'object' && !Array.isArray(value)
const isOneLine = (value) => typeof value === 'string' && value.trim() !== '' && !/[\r\n]/.test(value)
const isRoute = (value) => isOneLine(value) && (value.trim().startsWith('/') || /^https?:\/\//i.test(value.trim()))
const isWidth = (value) => Number.isInteger(value) && value > 0

export function siteAddress(text) {
  let url
  try {
    url = new URL(String(text ?? ''))
  } catch {
    return { url: null, problem: `"${text ?? ''}" is not an address: give the site's full address, starting http:// or https://` }
  }
  if (url.protocol !== 'http:' && url.protocol !== 'https:') return { url: null, problem: `${url.href} is not a web address: give one starting http:// or https://` }
  url.hash = ''
  return { url, problem: null }
}

function listProblems(value, { at, what, valid, describe }) {
  if (!Array.isArray(value)) return [`${at} must be a list of ${what}`]
  return value.flatMap((item, index) => (valid(item) ? [] : [`${at}[${index}] (${JSON.stringify(item)}) is not ${describe}`]))
}

export function parseQaSection(section, label = '.flow.json "qa"') {
  const config = { routes: [], deny: [], widths: [...DEFAULT_WIDTHS], testMarker: null }
  if (section === undefined) return { config, problems: [] }
  if (!isPlainObject(section)) return { config, problems: [`${label} must be an object with any of the keys ${quoted(QA_KEYS)}`] }
  const problems = []
  const unknown = Object.keys(section).filter((key) => !QA_KEYS.includes(key))
  if (unknown.length) problems.push(`${label}: unknown key${unknown.length === 1 ? '' : 's'} ${quoted(unknown)} — the keys are ${quoted(QA_KEYS)}`)
  if (section.routes !== undefined) {
    const found = listProblems(section.routes, { at: `${label} "routes"`, what: 'paths such as "/pricing", or full addresses on the site', valid: isRoute, describe: 'a path starting "/" or an address starting http:// or https://' })
    problems.push(...found)
    if (!found.length) config.routes = section.routes.map((route) => route.trim())
  }
  if (section.deny !== undefined) {
    const found = listProblems(section.deny, { at: `${label} "deny"`, what: 'words or paths never to click, submit or visit, such as "checkout" or "/account/delete"', valid: isOneLine, describe: 'one line of text' })
    problems.push(...found)
    if (!found.length) config.deny = section.deny.map((pattern) => pattern.trim())
  }
  if (section.widths !== undefined) {
    const found = Array.isArray(section.widths) && !section.widths.length ? [`${label} "widths" is empty: list at least one window width, or leave the key out for ${DEFAULT_WIDTHS.join(' and ')}`] : listProblems(section.widths, { at: `${label} "widths"`, what: 'window widths in CSS pixels, such as [1440, 393]', valid: isWidth, describe: 'a whole number of pixels above 0' })
    problems.push(...found)
    if (!found.length) config.widths = [...new Set(section.widths)]
  }
  if (section.testMarker !== undefined) {
    if (isOneLine(section.testMarker)) config.testMarker = section.testMarker.trim()
    else problems.push(`${label} "testMarker" must be one line of text: the marker your form gateway drops`)
  }
  return { config, problems }
}

export function readQaConfig(root) {
  const file = join(root, '.flow.json')
  if (!existsSync(file)) return { ...parseQaSection(undefined), file: null }
  let whole
  try {
    whole = JSON.parse(readFileSync(file, 'utf8'))
  } catch (error) {
    return { ...parseQaSection(undefined), problems: [`.flow.json is not valid JSON: ${error.message}`], file }
  }
  if (!isPlainObject(whole)) return { ...parseQaSection(undefined), problems: ['.flow.json must be a JSON object'], file }
  return { ...parseQaSection(whole.qa), file }
}

export function parseWidthsOption(text) {
  const parts = String(text ?? '').split(',').map((part) => part.trim())
  const bad = parts.filter((part) => !/^\d+$/.test(part) || Number(part) === 0)
  if (bad.length) return { widths: null, problem: `--widths takes whole numbers of pixels above 0, separated by commas (such as 1440,393), and "${bad[0]}" is not one` }
  return { widths: [...new Set(parts.map(Number))], problem: null }
}

function patternExpression(pattern) {
  const body = pattern
    .toLowerCase()
    .split('*')
    .map((part) => part.replace(/[.+?^${}()|[\]\\]/g, '\\$&'))
    .join('.*')
  return new RegExp(body, 'u')
}

export function deniedBy(patterns, candidate) {
  const text = String(candidate ?? '').toLowerCase()
  if (!text) return null
  return patterns.find((pattern) => patternExpression(pattern).test(text)) ?? null
}

export class QaInputError extends Error {}

const LARGEST_CODE_POINT = 0x10ffff

function decodeXml(text) {
  return text.replace(/&(#x[0-9a-f]+|#\d+|amp|lt|gt|quot|apos);/gi, (match, entity) => {
    const name = entity.toLowerCase()
    if (!name.startsWith('#')) return XML_ENTITIES[name]
    const codePoint = name.startsWith('#x') ? parseInt(name.slice(2), 16) : Number(name.slice(1))
    if (!(codePoint <= LARGEST_CODE_POINT)) throw new QaInputError(`"${match}" is not a character, so the addresses around it cannot be read`)
    return String.fromCodePoint(codePoint)
  })
}

export function readSitemap(xml) {
  const text = String(xml ?? '')
  const locations = [...text.matchAll(/<loc>\s*([\s\S]*?)\s*<\/loc>/gi)].map((match) => decodeXml(match[1].replace(/^<!\[CDATA\[([\s\S]*)\]\]>$/, '$1').trim()))
  return /<sitemapindex[\s>]/i.test(text) ? { pages: [], sitemaps: locations } : { pages: locations, sitemaps: [] }
}

export function readLinks(text) {
  const source = String(text ?? '')
  if (/<[a-z!][^>]*>/i.test(source))
    return [...source.matchAll(/<a\b[^>]*?\shref\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+))/gi)].map((match) => decodeXml(match[1] ?? match[2] ?? match[3]).trim())
  return source
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line && !line.startsWith('#'))
}

function routePath(url) {
  return url.pathname.length > 1 ? url.pathname.replace(/\/+$/, '') || '/' : url.pathname
}

export function routeKey(url) {
  return `${url.origin}${routePath(url)}${url.search}`
}

function isPage(url) {
  const last = url.pathname.split('/').pop()
  const dot = last.lastIndexOf('.')
  return dot <= 0 || !NOT_PAGE_EXTENSIONS.has(last.slice(dot + 1).toLowerCase())
}

function readablePath(url) {
  const text = `${url.pathname}${url.search}`
  try {
    return decodeURIComponent(text)
  } catch {
    return text
  }
}

export function buildRoutes({ start, candidates, deny = [], cap = DEFAULT_ROUTE_CAP }) {
  const routes = [routeKey(start)]
  const seen = new Set(routes)
  const skipped = { otherSite: 0, notAPage: 0, notAnAddress: 0, duplicates: 0, overCap: 0, denied: [] }
  for (const candidate of candidates) {
    let url
    try {
      url = new URL(candidate, start)
    } catch {
      skipped.notAnAddress++
      continue
    }
    if (url.protocol !== 'http:' && url.protocol !== 'https:') {
      skipped.notAnAddress++
      continue
    }
    if (url.origin !== start.origin) {
      skipped.otherSite++
      continue
    }
    url.hash = ''
    if (!isPage(url)) {
      skipped.notAPage++
      continue
    }
    const key = routeKey(url)
    if (seen.has(key)) {
      skipped.duplicates++
      continue
    }
    seen.add(key)
    const pattern = deniedBy(deny, readablePath(url))
    if (pattern !== null) skipped.denied.push({ route: key, pattern })
    else if (routes.length >= cap) skipped.overCap++
    else routes.push(key)
  }
  return { origin: start.origin, routes, skipped }
}

export function sameSiteSitemaps(start, addresses) {
  return addresses.filter((address) => {
    try {
      return new URL(address, start).origin === start.origin
    } catch {
      return false
    }
  })
}

export function normaliseFirstLine(line) {
  return String(line ?? '')
    .split(/\r?\n/)[0]
    .normalize('NFKC')
    .toLowerCase()
    .replace(/\p{N}+/gu, '#')
    .replace(/[^\p{L}#]+/gu, ' ')
    .trim()
    .slice(0, FINGERPRINT_LINE_LIMIT)
    .trim()
}

export function qaFingerprint(address, firstLine) {
  let url
  try {
    url = new URL(String(address ?? ''))
  } catch {
    return { fingerprint: null, problem: `"${address ?? ''}" is not an address: give the full address of the page the finding is on` }
  }
  const line = normaliseFirstLine(firstLine)
  if (!/\p{L}/u.test(line)) return { fingerprint: null, problem: "the first line has no words to fingerprint: give the finding's title or first sentence" }
  return { fingerprint: `qa ${routePath(url).toLowerCase()} ${line}`, problem: null }
}
