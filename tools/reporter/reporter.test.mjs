import { test, after } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, readdirSync, readFileSync, writeFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
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
const { DEFAULT_SETTINGS, normalizeSettings } = await load('settings')
const { emptyFields, normalizeDraft } = await load('draft')

const SETTINGS = { token: 't', repo: 'acme/site', branch: 'flow-findings', label: 'flow:found', epic: '' }

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
    body.buildIssueBody(SETTINGS, REPORT, '20261018-101500-abcd', UPLOADS),
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
  const text = body.buildIssueBody(SETTINGS, { ...REPORT, steps: ' ', expected: '', selection: '' }, 'id', UPLOADS)
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

test('settings default to the flow:found label, the flow-findings branch and no epic', () => {
  assert.deepEqual(DEFAULT_SETTINGS, { token: '', repo: '', branch: 'flow-findings', label: 'flow:found', epic: '' })
  assert.deepEqual(normalizeSettings({ repo: ' acme/site ', epic: ' 7 ', label: '' }), {
    token: '',
    repo: 'acme/site',
    branch: 'flow-findings',
    label: 'flow:found',
    epic: '7'
  })
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
  const result = await fileFinding({ ...SETTINGS, epic: '#5' }, REPORT, NOW, () => 0)
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
  const result = await fileFinding({ ...SETTINGS, epic: '5' }, REPORT, NOW, () => 0)
  assert.equal(result.number, 31)
  assert.match(result.epicProblem, /sub_issues failed with 422: Validation Failed/)
  assert.equal(calls.at(-1).path, '/repos/acme/site/issues/5/sub_issues')
  assert.equal(calls.filter((call) => call.method === 'DELETE' || call.method === 'PATCH').length, 0)
})

test('with no epic set, no sub-issue call is made', async () => {
  const answers = branchAndUploads({ status: 500, json: {} })
  answers[0] = { method: 'GET', path: /\/git\/ref\/heads\/flow-findings$/, reply: { json: { object: { sha: 'x' } } } }
  const calls = fakeGitHub(answers)
  const result = await fileFinding(SETTINGS, REPORT, NOW, () => 0)
  assert.equal(result.epic, null)
  assert.equal(calls.some((call) => call.path.endsWith('/sub_issues')), false)
  assert.equal(calls.some((call) => call.path.endsWith('/git/blobs')), false)
})

test('an epic that is not a number is refused before anything is uploaded', async () => {
  const calls = fakeGitHub([])
  await assert.rejects(fileFinding({ ...SETTINGS, epic: 'Bugs' }, REPORT, NOW), /Epic must be an issue number/)
  assert.equal(calls.length, 0)
})
