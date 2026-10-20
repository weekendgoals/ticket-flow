import { test, after } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, readdirSync, readFileSync, writeFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { spawnSync } from 'node:child_process'
import vm from 'node:vm'
import { join, dirname } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

const here = dirname(fileURLToPath(import.meta.url))
const copies = mkdtempSync(join(tmpdir(), 'reporter-test-'))
after(() => rmSync(copies, { recursive: true, force: true }))

for (const name of readdirSync(here).filter((file) => file.endsWith('.js'))) {
  const source = readFileSync(join(here, name), 'utf8').replace(/from '\.\/([\w-]+)\.js'/g, "from './$1.mjs'")
  writeFileSync(join(copies, name.replace(/\.js$/, '.mjs')), source)
}

const load = (name) => import(pathToFileURL(join(copies, `${name}.mjs`)).href)
const body = await load('report-body')
const { fileFinding } = await load('github')
const settingsModule = await load('settings')
const { DEFAULT_SETTINGS, normalizeSettings, checkTargets, chooseTarget, originOf } = settingsModule
const { emptyFields, createDraft, normalizeDraft } = await load('draft')

const area = await load('capture-area')

const MODULES = ['background', 'capture-area', 'draft', 'github', 'options', 'popup', 'report-body', 'settings']

test('every module of the extension parses as an ES module', () => {
  assert.deepEqual(readdirSync(copies).sort(), MODULES.map((name) => `${name}.mjs`))
  for (const name of MODULES) {
    const run = spawnSync(process.execPath, ['--check', join(copies, `${name}.mjs`)], { encoding: 'utf8' })
    assert.equal(run.status, 0, `${name}.js does not parse:\n${run.stderr}`)
  }
})

const TOKEN = 'github_pat_reporter_test_token'
const SETTINGS = { token: TOKEN, label: 'flow:found' }
const TARGET = { id: 't1', name: 'Site', repo: 'acme/site', branch: 'flow-findings', epic: '' }
const DOCS = { id: 't2', name: 'Docs', repo: 'acme/docs', branch: 'docs-shots', epic: '9' }

const REPORT = {
  title: 'Score overlaps the crest',
  description: '  The   score\noverlaps the crest on narrow screens  ',
  url: 'https://acme.example/matches/42?tab=live#top',
  pageTitle: 'Arsenal v Chelsea',
  viewport: { w: 390, h: 844, dpr: 3 },
  userAgent: 'Mozilla/5.0 Test',
  screenshots: [
    { dataUrl: 'data:image/png;base64,AAAA', mime: 'image/png', caption: ' the crest ' },
    { dataUrl: 'data:image/jpeg;base64,BBBB', mime: 'image/jpeg', caption: '' }
  ]
}

const UPLOADS = [
  { path: 'findings/20261018-101500-abcd/screenshot-1.png', commitSha: 'c1' },
  { path: 'findings/20261018-101500-abcd/screenshot-2.jpg', commitSha: 'c2' }
]

test('a screenshot goes to findings/<id>/screenshot-<n>.<ext>', () => {
  assert.equal(body.screenshotPath('20261018-101500-abcd', 3, 'webp'), 'findings/20261018-101500-abcd/screenshot-3.webp')
})

test('screenshot paths count from 1 and take the extension from the mime type', () => {
  const shots = ['image/png', 'image/jpeg', 'image/webp', 'image/gif'].map((mime) => ({ mime }))
  assert.deepEqual(body.screenshotPaths('id', shots), [
    'findings/id/screenshot-1.png',
    'findings/id/screenshot-2.jpg',
    'findings/id/screenshot-3.webp',
    'findings/id/screenshot-4.gif'
  ])
})

test('an unsupported mime type and an empty screenshot list are refused', () => {
  assert.throws(() => body.extensionForMime('image/bmp'), /Unsupported screenshot type: image\/bmp/)
  assert.throws(() => body.extensionForMime(undefined), /Unsupported screenshot type: unknown/)
  assert.throws(() => body.screenshotPaths('id', []), /at least one screenshot/)
  assert.deepEqual(body.SCREENSHOT_MIMES, ['image/png', 'image/jpeg', 'image/webp', 'image/gif'])
})

test('the finding id is YYYYMMDD-HHMMSS-xxxx in UTC', () => {
  const id = body.generateFindingId(new Date(Date.UTC(2026, 9, 18, 7, 5, 9)), () => 0)
  assert.equal(id, '20261018-070509-aaaa')
})

test('the fingerprint is the URL path and the first 60 characters of the description, lowercased, spaces collapsed', () => {
  const description = 'The   Score\n\tOVERLAPS the crest on narrow screens and the MAINS menu covers the table'
  const expected = 'the score overlaps the crest on narrow screens and the mains'
  assert.equal(expected.length, 60)
  assert.equal(body.fingerprint('https://acme.example/matches/42?tab=live#top', description), `/matches/42|${expected}`)
  assert.equal(body.fingerprint('https://acme.example/', '  short  '), '/|short')
  assert.equal(
    body.fingerprint('https://acme.example/m', 'the score overlaps the crest on narrow screens and the main menu'),
    '/m|the score overlaps the crest on narrow screens and the main'
  )
})

test('the fingerprint line cannot end its own comment early', () => {
  const line = body.fingerprintLine('https://acme.example/a', 'arrow --> here')
  assert.equal(line, '<!-- flow:finding fingerprint=/a|arrow -> here -->')
  assert.equal(line.indexOf('-->'), line.length - 3)
})

test('the Where line names the page, the viewport and the user agent', () => {
  assert.equal(
    body.whereLine(REPORT),
    'https://acme.example/matches/42?tab=live#top — Arsenal v Chelsea, viewport 390×844, Mozilla/5.0 Test'
  )
  assert.equal(
    body.whereLine({ url: 'https://acme.example/', pageTitle: '', viewport: null, userAgent: '' }),
    'https://acme.example/, viewport unknown'
  )
})

test('screenshot links point at the commit that added them', () => {
  assert.equal(
    body.screenshotLink('acme/site', 'abc123', 'findings/id/home page.png'),
    'https://github.com/acme/site/blob/abc123/findings/id/home%20page.png?raw=true'
  )
})

test('the issue body has the finding shape, fingerprint first', () => {
  assert.equal(
    body.buildIssueBody(TARGET, REPORT, '20261018-101500-abcd', UPLOADS),
    [
      '<!-- flow:finding fingerprint=/matches/42|the score overlaps the crest on narrow screens -->',
      '',
      '## What happened',
      '',
      'The   score\noverlaps the crest on narrow screens',
      '',
      '## Where',
      '',
      'https://acme.example/matches/42?tab=live#top — Arsenal v Chelsea, viewport 390×844, Mozilla/5.0 Test',
      'finding id: 20261018-101500-abcd',
      '',
      '## Screenshots',
      '',
      '1. [findings/20261018-101500-abcd/screenshot-1.png](https://github.com/acme/site/blob/c1/findings/20261018-101500-abcd/screenshot-1.png?raw=true) — the crest',
      '2. [findings/20261018-101500-abcd/screenshot-2.jpg](https://github.com/acme/site/blob/c2/findings/20261018-101500-abcd/screenshot-2.jpg?raw=true)'
    ].join('\n')
  )
})

test('the body has no Steps, Expected or Selected text, and no type or priority', () => {
  const text = body.buildIssueBody(TARGET, { ...REPORT, type: 'bug', priority: 'high', steps: '1. go', expected: 'x', selection: 'y' }, 'id', UPLOADS)
  assert.deepEqual(text.match(/^## .*/gm), ['## What happened', '## Where', '## Screenshots'])
  assert.doesNotMatch(text, /Type:|priority/)
})

test('an empty title is the first line of what happened, clipped at a word boundary, else the page title', () => {
  const page = { title: 'Arsenal v Chelsea' }
  assert.equal(body.issueTitle({ title: '  Typed  ', description: 'ignored' }, page), 'Typed')
  assert.equal(body.issueTitle({ title: ' ', description: '\n  The score overlaps  \nsecond line' }, page), 'The score overlaps')
  const long = 'The score overlaps the crest on narrow screens and the main menu covers the league table below it'
  const clipped = body.issueTitle({ title: '', description: long }, page)
  assert.equal(clipped, 'The score overlaps the crest on narrow screens and the main menu covers the…')
  assert.ok(clipped.length <= body.TITLE_LENGTH)
  assert.equal(body.issueTitle({ title: '', description: 'x'.repeat(100) }, page), `${'x'.repeat(79)}…`)
  assert.equal(body.issueTitle({ title: '', description: 'y'.repeat(80) }, page), 'y'.repeat(80))
  assert.equal(body.issueTitle({ title: '', description: ' \n ' }, page), 'Arsenal v Chelsea')
  assert.equal(body.issueTitle({ title: '', description: '' }, { title: '' }), '')
})

test('the epic option takes an issue number, with or without #, or nothing', () => {
  assert.equal(body.parseEpic(''), null)
  assert.equal(body.parseEpic('  '), null)
  assert.equal(body.parseEpic('12'), 12)
  assert.equal(body.parseEpic('#12'), 12)
  assert.throws(() => body.parseEpic('Bugs'), /Epic must be an issue number/)
  assert.throws(() => body.parseEpic('0'), /Epic must be an issue number/)
})

test('settings default to the flow:found label and no targets, and a target to the flow-findings branch', () => {
  assert.deepEqual(DEFAULT_SETTINGS, { token: '', label: 'flow:found', targets: [] })
  assert.deepEqual(normalizeSettings(undefined), DEFAULT_SETTINGS)
  assert.deepEqual(normalizeSettings({ label: '', targets: [{ id: 'a', repo: ' acme/site ', epic: ' 7 ' }, { name: 'empty' }] }), {
    token: '',
    label: 'flow:found',
    targets: [{ id: 'a', name: 'acme/site', repo: 'acme/site', epic: '7', branch: 'flow-findings' }]
  })
})

test('old settings with one repository become one target named after it', () => {
  const old = { token: ' tok ', repo: ' acme/site ', branch: 'shots', label: 'found', epic: '#7' }
  assert.deepEqual(normalizeSettings(old), {
    token: 'tok',
    label: 'found',
    targets: [{ id: 'target-1', name: 'acme/site', repo: 'acme/site', epic: '#7', branch: 'shots' }]
  })
  assert.deepEqual(normalizeSettings({ token: 'tok', repo: '', branch: '', label: '', epic: '' }).targets, [])
  assert.deepEqual(normalizeSettings(normalizeSettings(old)), normalizeSettings(old))
})

function fakeStorage(initial, extra = {}, session = {}) {
  const store = { ...initial }
  const writes = []
  globalThis.chrome = {
    storage: {
      local: {
        get: async (key) => (key in store ? { [key]: structuredClone(store[key]) } : {}),
        set: async (items) => {
          writes.push(Object.keys(items))
          Object.assign(store, structuredClone(items))
        },
        remove: async (key) => {
          delete store[key]
        }
      },
      session: {
        get: async (key) => (key in session ? { [key]: structuredClone(session[key]) } : {}),
        set: async (items) => Object.assign(session, structuredClone(items)),
        remove: async (key) => {
          delete session[key]
        }
      }
    },
    ...extra
  }
  return { store, writes }
}

test('loading old settings stores them migrated, once', async () => {
  const { store, writes } = fakeStorage({ settings: { token: 'tok', repo: 'acme/site', branch: '', label: '', epic: '7' } })
  const loaded = await settingsModule.loadSettings()
  assert.deepEqual(store.settings, loaded)
  assert.deepEqual(loaded.targets, [{ id: 'target-1', name: 'acme/site', repo: 'acme/site', epic: '7', branch: 'flow-findings' }])
  assert.equal('repo' in store.settings, false)
  assert.deepEqual(await settingsModule.loadSettings(), loaded)
  assert.equal(writes.length, 1)
  const empty = fakeStorage({})
  assert.deepEqual(await settingsModule.loadSettings(), DEFAULT_SETTINGS)
  assert.equal(empty.writes.length, 0)
})

test('a migrated repository without a slash is refused on load, naming the target', async () => {
  fakeStorage({ settings: { token: 'tok', repo: 'acme' } })
  await assert.rejects(settingsModule.loadSettings(), /^Error: acme: Repository must look like owner\/name/)
  assert.equal((await settingsModule.loadStoredSettings()).targets[0].repo, 'acme')
})

test('the chosen target is remembered per origin', async () => {
  const { store } = fakeStorage({})
  await settingsModule.rememberTarget('https://acme.example', 't1')
  await settingsModule.rememberTarget('https://docs.acme.example', 't2')
  await settingsModule.rememberTarget('', 't2')
  await settingsModule.rememberTarget('https://acme.example', 't2')
  assert.deepEqual(store.chosenTargets, { 'https://acme.example': 't2', 'https://docs.acme.example': 't2' })
  assert.deepEqual(await settingsModule.loadChosenTargets(), store.chosenTargets)
})

test('a target with a bad repository or epic is refused by name', () => {
  assert.doesNotThrow(() => checkTargets([TARGET, DOCS]))
  assert.throws(() => checkTargets([TARGET, { ...DOCS, repo: 'docs' }]), /^Error: Docs: Repository must look like owner\/name/)
  assert.throws(() => checkTargets([{ ...TARGET, name: '', epic: 'Bugs' }]), /^Error: Target 1: Epic must be an issue number/)
  assert.throws(() => checkTargets([TARGET, { ...DOCS, name: 'Site' }]), /^Error: Two targets are named Site/)
})

test('the popup picks the draft target, else the one remembered for the origin, else the first', () => {
  const targets = [TARGET, DOCS]
  const chosen = { 'https://docs.acme.example': 't2', 'https://gone.example': 'removed' }
  assert.equal(originOf('https://docs.acme.example/guide?x=1#y'), 'https://docs.acme.example')
  assert.equal(originOf('not a url'), '')
  assert.equal(chooseTarget(targets, chosen, 'https://docs.acme.example'), DOCS)
  assert.equal(chooseTarget(targets, chosen, 'https://acme.example'), TARGET)
  assert.equal(chooseTarget(targets, chosen, 'https://gone.example'), TARGET)
  assert.equal(chooseTarget(targets, chosen, ''), TARGET)
  assert.equal(chooseTarget(targets, chosen, 'https://acme.example', 't2'), DOCS)
  assert.equal(chooseTarget(targets, chosen, 'https://docs.acme.example', 'removed'), DOCS)
  assert.equal(chooseTarget([], chosen, 'https://docs.acme.example'), null)
})

test('a draft keeps its target, and an older draft has none', () => {
  const draft = createDraft({ url: 'https://acme.example/' }, DOCS, 5)
  assert.equal(draft.targetId, 't2')
  assert.equal(draft.targetName, 'Docs')
  const restored = normalizeDraft(JSON.parse(JSON.stringify(draft)))
  assert.deepEqual([restored.targetId, restored.targetName], ['t2', 'Docs'])
  assert.deepEqual([normalizeDraft({ screenshots: [] }).targetId, normalizeDraft({ screenshots: [] }).targetName], ['', ''])
})

test('the body and paths are the same for any target with the same repository', () => {
  const renamed = { ...TARGET, id: 'other', name: 'Renamed', epic: '3', branch: 'elsewhere' }
  assert.equal(body.buildIssueBody(renamed, REPORT, 'id', UPLOADS), body.buildIssueBody(TARGET, REPORT, 'id', UPLOADS))
  assert.match(body.buildIssueBody(DOCS, REPORT, 'id', UPLOADS), /https:\/\/github\.com\/acme\/docs\/blob\/c1\//)
  assert.doesNotMatch(body.buildIssueBody(DOCS, REPORT, 'id', UPLOADS), /acme\/site\/blob/)
})

test('a draft holds a title and what happened, and a draft of the previous version loses its other fields', () => {
  assert.deepEqual(Object.keys(emptyFields()), ['title', 'description'])
  const old = { title: 'x', type: 'change', priority: 'high', description: 'It broke', steps: '1. go', expected: 'y', selection: 'z' }
  assert.deepEqual(normalizeDraft({ screenshots: [], fields: old }).fields, { title: 'x', description: 'It broke' })
  assert.deepEqual(normalizeDraft({ screenshots: [] }).fields, { title: '', description: '' })
})

function fakeGitHub(answers) {
  const calls = []
  globalThis.fetch = async (url, options) => {
    assert.ok(url.startsWith('https://api.github.com/'), `request left api.github.com: ${url}`)
    assert.equal(options.headers.Authorization, `Bearer ${TOKEN}`)
    const elsewhere = { url, body: options.body, headers: { ...options.headers, Authorization: undefined } }
    assert.equal(JSON.stringify(elsewhere).includes(TOKEN), false, 'the token travelled outside the Authorization header')
    const path = url.replace('https://api.github.com', '')
    const call = { method: options.method, path, body: options.body ? JSON.parse(options.body) : undefined }
    calls.push(call)
    const answer = answers.find((candidate) => candidate.method === call.method && candidate.path.test(path))
    if (!answer) throw new Error(`unexpected ${call.method} ${path}`)
    const { status = 200, json } = typeof answer.reply === 'function' ? answer.reply(call) : answer.reply
    return { ok: status < 400, status, json: async () => json }
  }
  return calls
}

function branchAndUploads(subIssueReply) {
  let upload = 0
  return [
    { method: 'GET', path: /\/git\/ref\/heads\/flow-findings$/, reply: { status: 404, json: { message: 'Not Found' } } },
    { method: 'POST', path: /\/git\/blobs$/, reply: { json: { sha: 'blob' } } },
    { method: 'POST', path: /\/git\/trees$/, reply: { json: { sha: 'tree' } } },
    { method: 'POST', path: /\/git\/commits$/, reply: { json: { sha: 'root' } } },
    { method: 'POST', path: /\/git\/refs$/, reply: { json: {} } },
    { method: 'PUT', path: /\/contents\//, reply: () => ({ json: { commit: { sha: `sha${(upload += 1)}` } } }) },
    { method: 'POST', path: /\/issues$/, reply: { status: 201, json: { id: 987654, number: 31, html_url: 'https://github.com/acme/site/issues/31' } } },
    { method: 'POST', path: /\/issues\/5\/sub_issues$/, reply: subIssueReply }
  ]
}

const NOW = new Date(Date.UTC(2026, 9, 18, 10, 15, 0))

test('filing a finding starts the orphan branch, uploads, files the issue and puts it under the epic by id', async () => {
  const calls = fakeGitHub(branchAndUploads({ status: 201, json: {} }))
  const result = await fileFinding(SETTINGS, { ...TARGET, epic: '#5' }, REPORT, NOW, () => 0)
  assert.deepEqual(calls.map((call) => `${call.method} ${call.path}`), [
    'GET /repos/acme/site/git/ref/heads/flow-findings',
    'POST /repos/acme/site/git/blobs',
    'POST /repos/acme/site/git/trees',
    'POST /repos/acme/site/git/commits',
    'POST /repos/acme/site/git/refs',
    'PUT /repos/acme/site/contents/findings/20261018-101500-aaaa/screenshot-1.png',
    'PUT /repos/acme/site/contents/findings/20261018-101500-aaaa/screenshot-2.jpg',
    'POST /repos/acme/site/issues',
    'POST /repos/acme/site/issues/5/sub_issues'
  ])
  assert.equal(calls[1].body.content, 'Screenshots for findings filed from the reporter extension and by Flow; never merged.\n')
  assert.deepEqual(calls[3].body.parents, [])
  assert.equal(calls[4].body.ref, 'refs/heads/flow-findings')
  assert.equal(calls[5].body.branch, 'flow-findings')
  assert.equal(calls[5].body.content, 'AAAA')
  const issue = calls[7].body
  assert.deepEqual(issue.labels, ['flow:found'])
  assert.match(issue.body, /^<!-- flow:finding fingerprint=\/matches\/42\|/)
  assert.match(issue.body, /blob\/sha1\/findings\/20261018-101500-aaaa\/screenshot-1\.png/)
  assert.match(issue.body, /blob\/sha2\/findings\/20261018-101500-aaaa\/screenshot-2\.jpg/)
  assert.deepEqual(calls[8].body, { sub_issue_id: 987654 })
  assert.equal(result.number, 31)
  assert.equal(result.epic, 5)
  assert.equal(result.epicProblem, null)
})

test('a failed sub-issue call is reported and leaves the issue filed', async () => {
  const calls = fakeGitHub(branchAndUploads({ status: 422, json: { message: 'Validation Failed' } }))
  const result = await fileFinding(SETTINGS, { ...TARGET, epic: '5' }, REPORT, NOW, () => 0)
  assert.equal(result.number, 31)
  assert.match(result.epicProblem, /sub_issues failed with 422: Validation Failed/)
  assert.equal(calls.at(-1).path, '/repos/acme/site/issues/5/sub_issues')
  assert.equal(calls.filter((call) => call.method === 'DELETE' || call.method === 'PATCH').length, 0)
})

test('with no epic set, no sub-issue call is made', async () => {
  const answers = branchAndUploads({ status: 500, json: {} })
  answers[0] = { method: 'GET', path: /\/git\/ref\/heads\/flow-findings$/, reply: { json: { object: { sha: 'x' } } } }
  const calls = fakeGitHub(answers)
  const result = await fileFinding(SETTINGS, TARGET, REPORT, NOW, () => 0)
  assert.equal(result.epic, null)
  assert.equal(calls.some((call) => call.path.endsWith('/sub_issues')), false)
  assert.equal(calls.some((call) => call.path.endsWith('/git/blobs')), false)
})

test('an epic that is not a number is refused before anything is uploaded', async () => {
  const calls = fakeGitHub([])
  await assert.rejects(fileFinding(SETTINGS, { ...TARGET, epic: 'Bugs' }, REPORT, NOW), /Epic must be an issue number/)
  assert.equal(calls.length, 0)
})

test('a finding goes to the chosen target\'s repository, branch and epic', async () => {
  let upload = 0
  const calls = fakeGitHub([
    { method: 'GET', path: /^\/repos\/acme\/docs\/git\/ref\/heads\/docs-shots$/, reply: { json: { object: { sha: 'x' } } } },
    { method: 'PUT', path: /^\/repos\/acme\/docs\/contents\//, reply: () => ({ json: { commit: { sha: `sha${(upload += 1)}` } } }) },
    { method: 'POST', path: /^\/repos\/acme\/docs\/issues$/, reply: { status: 201, json: { id: 55, number: 4, html_url: 'https://github.com/acme/docs/issues/4' } } },
    { method: 'POST', path: /^\/repos\/acme\/docs\/issues\/9\/sub_issues$/, reply: { status: 201, json: {} } }
  ])
  const result = await fileFinding(SETTINGS, DOCS, REPORT, NOW, () => 0)
  assert.equal(calls.length, 5)
  assert.equal(calls.every((call) => call.path.startsWith('/repos/acme/docs/')), true)
  assert.equal(calls[1].body.branch, 'docs-shots')
  assert.match(calls[3].body.body, /github\.com\/acme\/docs\/blob\/sha1\//)
  assert.equal(result.repo, 'acme/docs')
  assert.equal(result.epic, 9)
  assert.equal(result.epicProblem, null)
})

test('no target or a target with a bad repository is refused before any request', async () => {
  const calls = fakeGitHub([])
  await assert.rejects(fileFinding(SETTINGS, null, REPORT, NOW), /No target chosen/)
  await assert.rejects(fileFinding(SETTINGS, { ...TARGET, repo: 'site' }, REPORT, NOW), /owner\/name/)
  assert.equal(calls.length, 0)
})

function fakeElement(tag = 'div') {
  const listeners = {}
  return {
    tag,
    value: '',
    textContent: '',
    hidden: tag === 'section' || tag === 'form' || tag === 'p',
    disabled: false,
    children: [],
    listeners,
    files: [],
    classList: { toggle() {}, add() {} },
    style: {},
    setAttribute() {},
    removeAttribute() {},
    append(...children) { this.children.push(...children) },
    replaceChildren(...children) { this.children = children },
    addEventListener(type, handler) { (listeners[type] ||= []).push(handler) },
    click() {}
  }
}

function fakePopupPage() {
  const elements = new Map()
  if (typeof navigator === 'undefined') globalThis.navigator = { userAgent: 'UA' }
  globalThis.document = {
    getElementById(id) {
      if (!elements.has(id)) elements.set(id, fakeElement(['unconfigured'].includes(id) ? 'section' : id === 'report' ? 'form' : 'div'))
      return elements.get(id)
    },
    createElement: (tag) => fakeElement(tag),
    createTextNode: (text) => ({ textContent: text }),
    addEventListener() {}
  }
  return (id) => elements.get(id)
}

const settle = async () => {
  for (let round = 0; round < 50; round += 1) await new Promise((resolve) => setTimeout(resolve, 0))
}

let popupCase = 0
async function openPopup(draft, targets = [TARGET, DOCS], chosen = {}, { session = {}, tabs = [], messages = [] } = {}) {
  const element = fakePopupPage()
  const local = { settings: { token: TOKEN, label: 'flow:found', targets }, chosenTargets: chosen }
  if (draft) local.draft = draft
  const storage = fakeStorage(
    local,
    {
      runtime: {
        getURL: () => 'chrome-extension://reporter/',
        openOptionsPage() {},
        sendMessage: async (message) => {
          messages.push(message)
          return message.type === 'captureTab' ? { dataUrl: 'data:image/png;base64,CCCC' } : {}
        }
      },
      tabs: {
        query: async () => tabs,
        get: async (id) => {
          const tab = tabs.find((candidate) => candidate.id === id)
          if (!tab) throw new Error('no tab')
          return tab
        },
        create: async () => {}
      },
      scripting: { executeScript: async () => [{ result: { w: 800, h: 600, dpr: 2 } }] }
    },
    session
  )
  popupCase += 1
  await import(pathToFileURL(join(copies, 'popup.mjs')).href + `?case=${popupCase}`)
  await settle()
  return { element, session, messages, ...storage }
}

const DRAFT = {
  startedAt: 1,
  page: { url: 'https://docs.acme.example/guide', title: 'Guide', viewport: null, userAgent: 'UA', tabId: 3 },
  targetId: 't2',
  targetName: 'Docs',
  fields: { ...emptyFields(), title: 'Broken link', description: 'It 404s' },
  screenshots: [{ id: 's1', dataUrl: 'data:image/png;base64,AAAA', mime: 'image/png', caption: '', source: 'capture', addedAt: 1 }]
}

const fire = async (element, type) => {
  for (const handler of element.listeners[type] || []) await handler({ preventDefault() {} })
  await settle()
}

test('the popup restores a draft on its own target and remembers nothing until a finding is filed', async () => {
  const { element, store } = await openPopup(DRAFT)
  assert.equal(element('target').value, 't2')
  assert.deepEqual(element('target').children.map((option) => option.textContent), ['Site', 'Docs'])
  element('target').value = 't1'
  await fire(element('target'), 'change')
  assert.deepEqual(store.chosenTargets, {})
  assert.deepEqual([store.draft.targetId, store.draft.targetName], ['t1', 'Site'])
  let upload = 0
  fakeGitHub([
    { method: 'GET', path: /^\/repos\/acme\/site\/git\/ref\/heads\/flow-findings$/, reply: { json: {} } },
    { method: 'PUT', path: /^\/repos\/acme\/site\/contents\//, reply: () => ({ json: { commit: { sha: `s${(upload += 1)}` } } }) },
    { method: 'POST', path: /^\/repos\/acme\/site\/issues$/, reply: { status: 201, json: { id: 1, number: 8, html_url: 'https://github.com/acme/site/issues/8' } } }
  ])
  await fire(element('report'), 'submit')
  assert.deepEqual(store.chosenTargets, { 'https://docs.acme.example': 't1' })
  assert.equal('draft' in store, false)
  assert.equal(element('status').children[1].textContent, ' in acme/site, with no epic.')
})

test('a restored draft whose target was removed says so and keeps its target until the person acts', async () => {
  const { element, store, writes } = await openPopup({ ...DRAFT, targetId: 'gone', targetName: 'Old docs' }, [TARGET, DOCS], { 'https://docs.acme.example': 't2' })
  assert.equal(element('target').value, 't2')
  assert.equal(element('status').textContent, "This draft's target Old docs was removed; Docs is selected.")
  assert.equal(store.draft.targetId, 'gone')
  assert.equal(writes.some((keys) => keys.includes('draft')), false)
})

test('a submit whose target vanished is refused and reloads the targets', async () => {
  const { element, store } = await openPopup(DRAFT)
  store.settings = { token: TOKEN, label: 'flow:found', targets: [TARGET] }
  const calls = fakeGitHub([])
  await fire(element('report'), 'submit')
  assert.equal(calls.length, 0)
  assert.match(element('status').textContent, /no longer on the options page/)
  assert.deepEqual(element('target').children.map((option) => option.textContent), ['Site'])
  assert.equal(element('target').value, 't1')
  assert.deepEqual(store.chosenTargets, {})
})

test('a finding with nothing in What happened is refused before any request', async () => {
  const { element, store } = await openPopup({ ...DRAFT, fields: { title: 'Broken link', description: '' } })
  element('description').value = '  \n '
  const calls = fakeGitHub([])
  await fire(element('report'), 'submit')
  assert.equal(calls.length, 0)
  assert.equal(element('status').textContent, 'Say what happened.')
  assert.equal(typeof store.draft, 'object')
})

test('with no title the issue is titled by the first line of what happened, and the body carries only the lean sections', async () => {
  const { element } = await openPopup({ ...DRAFT, fields: { title: '', description: 'The link 404s\non every page' } })
  const calls = fakeGitHub([
    { method: 'GET', path: /\/git\/ref\/heads\/docs-shots$/, reply: { json: {} } },
    { method: 'PUT', path: /\/contents\//, reply: { json: { commit: { sha: 's1' } } } },
    { method: 'POST', path: /\/issues$/, reply: { status: 201, json: { id: 1, number: 8, html_url: 'https://github.com/acme/docs/issues/8' } } },
    { method: 'POST', path: /\/sub_issues$/, reply: { status: 201, json: {} } }
  ])
  await fire(element('report'), 'submit')
  const issue = calls.find((call) => call.path === '/repos/acme/docs/issues').body
  assert.equal(issue.title, 'The link 404s')
  assert.deepEqual(issue.body.match(/^## .*/gm), ['## What happened', '## Where', '## Screenshots'])
})

test('selected text from the right-click menu starts a new draft as a quote, and is appended to one in progress', async () => {
  const tab = { id: 7, windowId: 2, url: 'https://acme.example/matches/42', title: 'Match' }
  const fresh = await openPopup(undefined, [TARGET, DOCS], {}, { session: { pendingSelection: { text: 'Arsenal 2\n1 Chelsea', tabId: 7 } }, tabs: [tab] })
  assert.equal(fresh.element('description').value, '> Arsenal 2\n> 1 Chelsea\n\n')
  assert.equal(fresh.store.draft.fields.description, '> Arsenal 2\n> 1 Chelsea\n\n')
  assert.deepEqual(fresh.store.draft.page.viewport, { w: 800, h: 600, dpr: 2 })
  assert.equal('pendingSelection' in fresh.session, false)
  const going = await openPopup(DRAFT, [TARGET, DOCS], {}, { session: { pendingSelection: { text: 'Page not found', tabId: 3 } } })
  assert.equal(going.store.draft.fields.description, 'It 404s\n\n> Page not found')
})

test('a toolbar click on a new draft leaves What happened empty', async () => {
  const tab = { id: 7, windowId: 2, url: 'https://acme.example/', title: 'Home' }
  const { store } = await openPopup(undefined, [TARGET, DOCS], {}, { tabs: [tab] })
  assert.equal(store.draft.fields.description, '')
  assert.equal(store.draft.screenshots.length, 1)
})

const SELECTION = { x: 10.5, y: 20.25, width: 100, height: 50, devicePixelRatio: 2, innerWidth: 800, innerHeight: 600 }

test('an area is cropped in device pixels, clamped to the captured image', () => {
  assert.deepEqual(area.cropRect(SELECTION, { width: 1600, height: 1200 }), { x: 21, y: 40, width: 200, height: 101 })
  assert.deepEqual(area.cropRect({ ...SELECTION, x: 750, y: 580 }, { width: 1600, height: 1200 }), { x: 1500, y: 1160, width: 100, height: 40 })
  assert.deepEqual(area.cropRect({ ...SELECTION, x: -5, y: 0, width: 20, height: 10 }, { width: 1600, height: 1200 }), { x: 0, y: 0, width: 30, height: 20 })
  assert.deepEqual(area.cropRect({ ...SELECTION, innerWidth: undefined, innerHeight: undefined, x: 1, y: 1, width: 4, height: 4 }, { width: 1600, height: 1200 }), { x: 2, y: 2, width: 8, height: 8 })
})

test('an area smaller than 4 by 4 CSS pixels, or off the image, captures nothing', () => {
  const image = { width: 1600, height: 1200 }
  assert.equal(area.cropRect({ ...SELECTION, width: 3.9 }, image), null)
  assert.equal(area.cropRect({ ...SELECTION, height: 0 }, image), null)
  assert.equal(area.cropRect({ ...SELECTION, x: 900 }, image), null)
  assert.equal(area.cropRect(null, image), null)
  assert.equal(area.cropRect(SELECTION, { width: 0, height: 0 }), null)
})

test('bytes become base64, in chunks for a large image', () => {
  assert.equal(area.base64FromBytes(new Uint8Array([])), '')
  assert.equal(area.base64FromBytes(new Uint8Array([137, 80, 78, 71, 255])), Buffer.from([137, 80, 78, 71, 255]).toString('base64'))
  const large = new Uint8Array(3 * 1024 * 1024).map((_, index) => (index * 31) % 256)
  assert.equal(area.base64FromBytes(large), Buffer.from(large).toString('base64'))
})

test('an area screenshot is added to the stored draft, never past the limit', async () => {
  const { store } = fakeStorage({ draft: DRAFT })
  assert.equal(await area.storeAreaScreenshot('data:image/png;base64,DDDD', 9), null)
  assert.equal(store.draft.screenshots.length, 2)
  assert.deepEqual({ ...store.draft.screenshots[1], id: undefined }, { id: undefined, dataUrl: 'data:image/png;base64,DDDD', mime: 'image/png', caption: '', source: 'area', addedAt: 9 })
  assert.equal(normalizeDraft(store.draft).screenshots[1].source, 'area')
  const full = Array.from({ length: 10 }, (_, index) => ({ ...DRAFT.screenshots[0], id: `s${index}` }))
  const capped = fakeStorage({ draft: { ...DRAFT, screenshots: full } })
  assert.equal(await area.storeAreaScreenshot('data:image/png;base64,DDDD'), area.FULL_NOTICE)
  assert.equal(capped.store.draft.screenshots.length, 10)
  fakeStorage({})
  assert.equal(await area.storeAreaScreenshot('data:image/png;base64,DDDD'), area.NO_DRAFT_NOTICE)
})

test('Capture area saves the draft, asks the background for the tab and closes the popup', async () => {
  const closedWith = []
  let stored = null
  globalThis.window = { close: () => { closedWith.push(stored.draft.fields.title) } }
  const tab = { id: 3, windowId: 4, url: 'https://docs.acme.example/guide', title: 'Guide' }
  const messages = []
  const { element, store } = await openPopup(DRAFT, [TARGET, DOCS], {}, { tabs: [tab], messages })
  stored = store
  element('title').value = 'Changed before the drag'
  await fire(element('capture-area'), 'click')
  assert.deepEqual(messages, [{ type: 'captureArea', tabId: 3, windowId: 4 }])
  assert.deepEqual(closedWith, ['Changed before the drag'])
  delete globalThis.window
})

test('a reason the background left is shown once when the popup reopens', async () => {
  const { element, session } = await openPopup(DRAFT, [TARGET, DOCS], {}, { session: { areaNotice: area.refusedNotice('Cannot access contents of the page') } })
  assert.equal(element('status').textContent, 'This page does not allow area capture (Cannot access contents of the page); use Capture or paste an image.')
  assert.equal('areaNotice' in session, false)
  const again = await openPopup(DRAFT)
  assert.equal(again.element('status').textContent, '')
})

test('the refusal names the browser\'s reason when there is one', () => {
  assert.equal(area.refusedNotice(''), 'This page does not allow area capture; use Capture or paste an image.')
  assert.equal(area.refusedNotice('Frame with ID 0 was removed.'), 'This page does not allow area capture (Frame with ID 0 was removed.); use Capture or paste an image.')
})

function fakeNode(tag) {
  return {
    tag,
    id: '',
    style: {},
    children: [],
    parent: null,
    listeners: [],
    focused: false,
    append(child) { child.parent = this; this.children.push(child) },
    remove() {
      if (!this.parent) return
      this.parent.children = this.parent.children.filter((child) => child !== this)
      this.parent = null
    },
    addEventListener(type, handler, capture) { this.listeners.push({ type, handler, capture: Boolean(capture) }) },
    removeEventListener(type, handler, capture) {
      this.listeners = this.listeners.filter((entry) => !(entry.type === type && entry.handler === handler && entry.capture === Boolean(capture)))
    },
    dispatch(type, event = {}) {
      for (const entry of this.listeners.filter((candidate) => candidate.type === type)) {
        entry.handler({ button: 0, pointerId: 1, preventDefault() {}, stopPropagation() {}, ...event })
      }
    },
    setPointerCapture() {},
    focus() { this.focused = true }
  }
}

function areaPage() {
  const root = fakeNode('html')
  const win = fakeNode('window')
  Object.assign(win, { devicePixelRatio: 2, innerWidth: 800, innerHeight: 600 })
  const documentStub = {
    documentElement: root,
    createElement: (tag) => fakeNode(tag),
    getElementById: (id) => root.children.find((child) => child.id === id) || null
  }
  const context = vm.createContext({
    document: documentStub,
    window: win,
    requestAnimationFrame: (callback) => setTimeout(callback, 0)
  })
  const inject = () => vm.runInContext(`(${area.pickArea.toString()})()`, context)
  const layer = () => root.children.find((child) => child.id === 'flow-reporter-area')
  return { root, win, inject, layer }
}

const plain = (value) => JSON.parse(JSON.stringify(value))

function assertGone(page) {
  assert.equal(page.layer(), undefined)
  assert.equal(page.win.listeners.some((entry) => entry.type === 'keydown'), false)
}

test('the area overlay, run with nothing of the module, answers a drag in CSS pixels and removes itself', async () => {
  const page = areaPage()
  const answer = page.inject()
  const layer = page.layer()
  assert.equal(layer.focused, true)
  assert.equal(layer.tabIndex, -1)
  layer.dispatch('pointerdown', { clientX: 100, clientY: 50 })
  layer.dispatch('pointermove', { clientX: 40, clientY: 90 })
  layer.dispatch('pointerup')
  assert.deepEqual(plain(await answer), { x: 40, y: 50, width: 60, height: 40, devicePixelRatio: 2, innerWidth: 800, innerHeight: 600 })
  assertGone(page)
})

test('a click, a drag under 4 by 4, Escape on the window or the layer, and a second injection each cancel', async () => {
  const click = areaPage()
  const clicked = click.inject()
  click.layer().dispatch('pointerdown', { clientX: 5, clientY: 5 })
  click.layer().dispatch('pointerup')
  assert.equal(await clicked, null)
  assertGone(click)

  const thin = areaPage()
  const thinAnswer = thin.inject()
  thin.layer().dispatch('pointerdown', { clientX: 10, clientY: 10 })
  thin.layer().dispatch('pointermove', { clientX: 13, clientY: 20 })
  thin.layer().dispatch('pointerup')
  assert.equal(await thinAnswer, null)
  assertGone(thin)

  const escape = areaPage()
  const escaped = escape.inject()
  escape.win.dispatch('keydown', { key: 'Escape' })
  assert.equal(await escaped, null)
  assertGone(escape)

  const framed = areaPage()
  const framedAnswer = framed.inject()
  const framedLayer = framed.layer()
  framedLayer.dispatch('keydown', { key: 'a' })
  assert.ok(framed.layer())
  framedLayer.dispatch('keydown', { key: 'Escape' })
  assert.equal(await framedAnswer, null)
  assertGone(framed)
  assert.equal(framedLayer.listeners.some((entry) => entry.type === 'keydown'), false)

  const twice = areaPage()
  const first = twice.inject()
  const second = twice.inject()
  assert.equal(await first, null)
  assert.equal(twice.root.children.length, 1)
  twice.win.dispatch('keydown', { key: 'Escape' })
  assert.equal(await second, null)
  assertGone(twice)
})
