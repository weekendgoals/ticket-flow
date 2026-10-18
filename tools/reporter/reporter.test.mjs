import { test, after } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, readdirSync, readFileSync, writeFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { spawnSync } from 'node:child_process'
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

const MODULES = ['background', 'draft', 'github', 'options', 'popup', 'report-body', 'settings']

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
  type: 'bug',
  priority: 'high',
  description: '  The   score\noverlaps the crest on narrow screens  ',
  steps: '1. Open the match page\n2. Narrow the window',
  expected: 'The score sits beside the crest',
  selection: 'Arsenal 2\n1 Chelsea',
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
      'Type: bug; priority: high; finding id: 20261018-101500-abcd',
      '',
      '## Steps',
      '',
      '1. Open the match page\n2. Narrow the window',
      '',
      '## Expected',
      '',
      'The score sits beside the crest',
      '',
      '## Selected text',
      '',
      '> Arsenal 2\n> 1 Chelsea',
      '',
      '## Screenshots',
      '',
      '1. [findings/20261018-101500-abcd/screenshot-1.png](https://github.com/acme/site/blob/c1/findings/20261018-101500-abcd/screenshot-1.png?raw=true) — the crest',
      '2. [findings/20261018-101500-abcd/screenshot-2.jpg](https://github.com/acme/site/blob/c2/findings/20261018-101500-abcd/screenshot-2.jpg?raw=true)'
    ].join('\n')
  )
})

test('empty Steps and Expected say none, and no selection leaves its section out', () => {
  const text = body.buildIssueBody(TARGET, { ...REPORT, steps: ' ', expected: '', selection: '' }, 'id', UPLOADS)
  assert.match(text, /## Steps\n\n_none_\n\n## Expected\n\n_none_\n\n## Screenshots\n/)
  assert.doesNotMatch(text, /## Selected text/)
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

function fakeStorage(initial) {
  const store = { ...initial }
  globalThis.chrome = {
    storage: {
      local: {
        get: async (key) => (key in store ? { [key]: structuredClone(store[key]) } : {}),
        set: async (items) => Object.assign(store, structuredClone(items))
      }
    }
  }
  return store
}

test('loading old settings stores them migrated, once', async () => {
  const store = fakeStorage({ settings: { token: 'tok', repo: 'acme/site', branch: '', label: '', epic: '7' } })
  const loaded = await settingsModule.loadSettings()
  assert.deepEqual(store.settings, loaded)
  assert.deepEqual(loaded.targets, [{ id: 'target-1', name: 'acme/site', repo: 'acme/site', epic: '7', branch: 'flow-findings' }])
  assert.equal('repo' in store.settings, false)
})

test('the chosen target is remembered per origin', async () => {
  const store = fakeStorage({})
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
  const draft = createDraft({ url: 'https://acme.example/' }, 't2', 5)
  assert.equal(draft.targetId, 't2')
  assert.equal(normalizeDraft(JSON.parse(JSON.stringify(draft))).targetId, 't2')
  assert.equal(normalizeDraft({ screenshots: [] }).targetId, '')
})

test('the body and paths are the same for any target with the same repository', () => {
  const renamed = { ...TARGET, id: 'other', name: 'Renamed', epic: '3', branch: 'elsewhere' }
  assert.equal(body.buildIssueBody(renamed, REPORT, 'id', UPLOADS), body.buildIssueBody(TARGET, REPORT, 'id', UPLOADS))
  assert.match(body.buildIssueBody(DOCS, REPORT, 'id', UPLOADS), /https:\/\/github\.com\/acme\/docs\/blob\/c1\//)
  assert.doesNotMatch(body.buildIssueBody(DOCS, REPORT, 'id', UPLOADS), /acme\/site\/blob/)
})

test('a draft keeps Steps and Expected, and an older draft gets them empty', () => {
  assert.deepEqual(Object.keys(emptyFields()), ['title', 'type', 'priority', 'description', 'steps', 'expected', 'selection'])
  const restored = normalizeDraft({ screenshots: [], fields: { title: 'x', steps: '1. go' } })
  assert.equal(restored.fields.steps, '1. go')
  assert.equal(restored.fields.expected, '')
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
