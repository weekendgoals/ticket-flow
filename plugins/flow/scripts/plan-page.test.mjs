// plan-page.test.mjs — the plan page's rendering, as a pure function, and the
// page's comment script without a browser.
//
// renderPlan takes the JSON a planning session composes and returns HTML;
// these tests feed it fixtures and assert on the output — no filesystem, no
// git. What matters: required fields refuse loudly, optional sections render
// only when present, the two stages read differently, nothing a planner writes
// can inject markup, and the walkthrough's scenes cannot name tickets the plan
// does not carry.
//
// The comment script is proven the way the fidelity extractor is: cut out of
// the RENDERED page between its two markers and evaluated with `new Function`
// — which sees no module scope, so a reference outside the small DOM surface
// it documents fails here rather than inside somebody's browser. The plugin
// owns no browser and no test may need one. Two cases drive the real CLI over
// a temp JSON file, because "the render refuses" only matters if the command
// the skill runs exits nonzero and writes no page.

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { existsSync, mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { renderPlan, SCRIPT_OPEN, SCRIPT_CLOSE } from './plan-page.mjs'

const shape = {
  epic: 'payments',
  outcome: { problem: 'refunds are manual', change: 'refunds self-serve', evidence: 'support tickets about refunds stop', reversal: 'error rate above 1%' },
  delivery: { choice: 'release', why: 'two human gates: this sign-off and the release PR' },
  areas: [{ name: 'api-gateway', instructions: 'api-gateway/CLAUDE.md' }],
  tickets: [
    { id: 'PAY-1', name: 'walking skeleton', line: 'proves the provider sandbox works end to end' },
    { id: 'PAY-2', name: 'refund flow', line: 'builds the user-facing flow on the skeleton' },
  ],
  firstWhy: 'the provider sandbox is the unproven assumption',
}

test('the shape stage renders the checkpoint framing and the steering examples', () => {
  const html = renderPlan(shape)
  assert.ok(html.startsWith('<title>payments plan</title>'))
  assert.match(html, /shape checkpoint/)
  assert.match(html, /Nothing is written yet/)
  assert.match(html, /a re-split costs a sentence/)
  assert.match(html, /How to steer/)
  assert.match(html, /merge PAY-1 into PAY-2/, 'steering examples name the plan’s own tickets')
})

test('outcome, delivery, areas and the ordered ticket list all render', () => {
  const html = renderPlan(shape)
  assert.match(html, /What would make us undo it/)
  assert.match(html, /error rate above 1%/)
  assert.match(html, /class="chip strong">release</)
  assert.match(html, /api-gateway\/CLAUDE\.md/)
  assert.match(html, /class="tid">PAY-1</)
  assert.match(html, /proves the provider sandbox works end to end/)
  assert.match(html, /First is first because: the provider sandbox is the unproven assumption/)
})

test('sign-off stage renders the decision framing, the release warning, and the plan review', () => {
  const html = renderPlan({
    ...shape,
    stage: 'sign-off',
    alternative: { label: 'split by service', tickets: ['PAY-A — gateway first'], whyRejected: 'doubles the integration surface' },
    planReview: { flagged: ['PAY-2 criteria not checkable'], changed: ['criteria now name the command'], rejected: [{ finding: 'add a canary ticket', why: 'no traffic to canary against' }], questions: ['is the sandbox rate limit real?'] },
    openQuestions: ['who owns the provider credentials?'],
  })
  assert.match(html, /sign-off/)
  assert.match(html, /unattended execution into its epic branch/)
  assert.match(html, /Considered and rejected: split by service/)
  assert.match(html, /doubles the integration surface/)
  assert.match(html, /PAY-2 criteria not checkable/)
  assert.match(html, /no traffic to canary against/)
  assert.match(html, /Needs your answer/)
  assert.ok(!html.includes('Nothing is written yet'))
})

test('an incremental sign-off does not carry the release warning', () => {
  const html = renderPlan({ ...shape, stage: 'sign-off', delivery: { choice: 'incremental', why: 'per-ticket feedback' } })
  assert.ok(!html.includes('unattended execution'))
  assert.match(html, /its own pull request/)
})

test('a requirements list renders numbered, and only when present', () => {
  const html = renderPlan({
    ...shape,
    requirements: ['when a refund is requested the system shall complete it without support', 'when the error rate passes 1% the system shall gate the flow off'],
  })
  assert.match(html, /Requirements — what it must do, not how/)
  assert.match(html, /<ol class="reqs">/)
  assert.match(html, /gate the flow off/)
  assert.ok(!renderPlan(shape).includes('Requirements —'), 'no section without the data')
})

test('optional sections are absent when their data is', () => {
  const html = renderPlan({ epic: 'bare', tickets: [{ id: 'B-1', name: 'only ticket', line: 'does the thing' }] })
  assert.ok(!html.includes('Considered and rejected'))
  assert.ok(!html.includes('plan review'))
  assert.ok(!html.includes('Needs your answer'))
  assert.ok(!html.includes('Outcome —'))
})

test('planner-written text cannot inject markup', () => {
  const html = renderPlan({
    epic: 'x<script>alert(1)</script>',
    tickets: [{ id: 'X-1', name: '<img src=x onerror=alert(1)>', line: 'a & b' }],
  })
  assert.ok(!html.includes('<script>alert(1)'))
  assert.ok(!html.includes('<img src=x'))
  assert.match(html, /a &amp; b/)
})

test('a plan without an epic name or without tickets refuses loudly', () => {
  assert.throws(() => renderPlan({ tickets: [{ id: 'A-1', name: 'x', line: 'y' }] }), /needs an "epic" name/)
  assert.throws(() => renderPlan({ epic: 'e', tickets: [] }), /non-empty "tickets"/)
  assert.throws(() => renderPlan({ epic: 'e' }), /non-empty "tickets"/)
})

// ── the walkthrough ──────────────────────────────────────────────────────────

const walked = {
  ...shape,
  requirements: ['when a refund is requested the system shall complete it without support', 'when it fails the system shall say why'],
  walkthrough: [
    {
      who: 'a customer who ordered the wrong size',
      does: 'asks for their money back from the order page',
      sees: 'the refund confirmed, and an email within the hour',
      today: 'they write to support and wait two days',
      tickets: ['PAY-1'],
      requirements: [1],
    },
    { who: 'a customer whose card expired', does: 'asks for the same refund', sees: 'a sentence saying why it cannot go back to that card', tickets: ['PAY-2'], requirements: [2] },
  ],
}

test('the walkthrough renders its scenes in order, with the ticket tags and requirement citations', () => {
  const html = renderPlan(walked)
  assert.match(html, /Walkthrough — what you will be able to do/)
  assert.match(html, /In the order a person meets it, not the order it is built/)
  assert.match(html, /<li id="scene-1" data-anchor>/)
  assert.match(html, /<li id="scene-2" data-anchor>/)
  assert.match(html, /<b>a customer who ordered the wrong size<\/b> asks for their money back/)
  assert.match(html, /sees<\/span> the refund confirmed/)
  assert.match(html, /today<\/span> they write to support/)
  assert.match(html, /<a class="chip tag" href="#PAY-1">PAY-1<\/a>/)
  assert.match(html, /<a class="chip req" href="#requirements">R2<\/a>/)
  assert.ok(html.indexOf('scene-1') < html.indexOf('scene-2'), 'scenes keep the order the plan wrote them in')
  assert.ok(!renderPlan(shape).includes('Walkthrough —'), 'no section without the data')
})

test('a scene without `today` renders, and one without who/does/sees or without tickets refuses', () => {
  const [first] = walked.walkthrough
  const { today, ...noToday } = first
  const html = renderPlan({ ...walked, walkthrough: [noToday] })
  assert.ok(!html.includes('today</span>'), 'the line is absent, not empty')
  for (const field of ['who', 'does', 'sees']) {
    const bad = { ...first }
    delete bad[field]
    assert.throws(() => renderPlan({ ...walked, walkthrough: [bad] }), new RegExp(`scene 1 .*has no "${field}"`))
  }
  assert.throws(
    () => renderPlan({ ...walked, walkthrough: [{ ...first, tickets: [] }] }),
    /scene 1 .*names no tickets — a scene nothing in the plan builds is the fiction/,
  )
})

test('a scene naming a ticket the plan does not carry fails the render, naming the scene and the ID', () => {
  assert.throws(
    () => renderPlan({ ...walked, walkthrough: [{ ...walked.walkthrough[0], tickets: ['PAY-1', 'PAY-9'] }] }),
    // The scene's own words, cut at 60 characters — enough to find it, short
    // enough that the refusal stays one readable line.
    /scene 1 \(a customer who ordered the wrong size asks for their mone…\) names ticket PAY-9, which is not in this plan's tickets \(PAY-1, PAY-2\)/,
  )
  // The second scene is named as the second, and by its own words — a planner
  // reading the refusal must not have to count list items.
  assert.throws(
    () => renderPlan({ ...walked, walkthrough: [walked.walkthrough[0], { ...walked.walkthrough[1], tickets: ['PAY-7'] }] }),
    /scene 2 \(a customer whose card expired asks for the same refund\) names ticket PAY-7/,
  )
})

test('a requirement citation outside the numbered list fails the same way', () => {
  const cite = (requirements, plan = walked) => () => renderPlan({ ...plan, walkthrough: [{ ...walked.walkthrough[0], requirements }] })
  assert.throws(cite([3]), /cites requirement 3, and this plan has 2 \(1–2\)/)
  assert.throws(cite([0]), /cites requirement 0/)
  assert.throws(cite([1.5]), /cites requirement 1.5/)
  assert.throws(cite([1], { ...walked, requirements: [] }), /cites requirement 1, and this plan has no numbered requirements/)
  assert.doesNotThrow(cite([1, 2]))
})

test('tickets no scene names are listed under the walkthrough, never hidden', () => {
  const html = renderPlan({ ...walked, tickets: [...walked.tickets, { id: 'PAY-3', name: 'the runner', line: 'installs the queue' }] })
  assert.match(html, /<b>In no scene:<\/b> <a class="chip tag" href="#PAY-3">PAY-3<\/a> — infrastructure a user never meets, or a scene nobody wrote/)
  assert.match(renderPlan(walked), /Every ticket in this plan is named by a scene above/)
})

test('the documented anchor ids are on the page, each carrying data-anchor', () => {
  const html = renderPlan({ ...walked, stage: 'sign-off', alternative: { label: 'by layer', tickets: ['x'], whyRejected: 'late feedback' }, planReview: { flagged: ['f'] }, openQuestions: ['q'] })
  for (const id of ['outcome', 'requirements', 'walkthrough', 'scene-1', 'scene-2', 'tickets', 'PAY-1', 'PAY-2', 'alternative', 'plan-review', 'open-questions'])
    assert.match(html, new RegExp(`id="${id}" data-anchor`), `#${id} is part of this page's contract`)
})

// ── the CLI ──────────────────────────────────────────────────────────────────

const SCRIPT = fileURLToPath(new URL('./plan-page.mjs', import.meta.url))
const cli = (plan, ...args) => {
  const dir = mkdtempSync(join(tmpdir(), 'plan-page-'))
  const file = join(dir, 'plan.json')
  writeFileSync(file, JSON.stringify(plan))
  const out = join(dir, 'plan.html')
  const r = spawnSync(process.execPath, [SCRIPT, file, '--out', out, ...args], { encoding: 'utf8' })
  return { ...r, out, wrote: existsSync(out) }
}

test('the CLI writes the page, and a scene naming an unknown ticket refuses it: nonzero, no file', () => {
  const good = cli(walked)
  assert.equal(good.status, 0)
  assert.ok(good.wrote)

  const bad = cli({ ...walked, walkthrough: [{ ...walked.walkthrough[0], tickets: ['PAY-9'] }] })
  assert.notEqual(bad.status, 0, 'a refused plan is a refused page — nothing reaches a human gate')
  assert.equal(bad.wrote, false)
  assert.match(bad.stderr, /^plan-page: scene 1 .*names ticket PAY-9/)
  assert.doesNotMatch(bad.stderr, /at renderPlan|at Object/, 'the message is the refusal, not a stack trace')
})

// ── the comment script, evaluated against a stub page ────────────────────────

const scriptSource = (html) => {
  const start = html.indexOf(SCRIPT_OPEN)
  const end = html.indexOf(SCRIPT_CLOSE)
  assert.ok(start >= 0 && end > start, 'the rendered page carries the comment script between its markers')
  return html.slice(start + SCRIPT_OPEN.length, end)
}

// A stub page: nodes reachable by nothing but the surface the script documents.
// Anything else it reaches for is an undefined global here, which is the point.
function stub() {
  const saved = {
    document: globalThis.document,
    window: globalThis.window,
    navigator: Object.getOwnPropertyDescriptor(globalThis, 'navigator'),
  }
  const node = (tag) => {
    const n = {
      tag,
      id: '',
      className: '',
      textContent: '',
      value: '',
      style: {},
      attrs: {},
      children: [],
      parentNode: null,
      listeners: {},
      focused: 0,
      selected: 0,
      appendChild(c) {
        c.parentNode = n
        n.children.push(c)
        return c
      },
      addEventListener(t, fn) {
        ;(n.listeners[t] = n.listeners[t] || []).push(fn)
      },
      getAttribute(name) {
        return name in n.attrs ? n.attrs[name] : null
      },
      setAttribute(name, v) {
        n.attrs[name] = v
      },
      focus() {
        n.focused++
      },
      select() {
        n.selected++
      },
    }
    return n
  }
  const body = node('body')
  const documentElement = node('html')
  const on = {}
  const page = {
    body,
    documentElement,
    on,
    selection: null,
    wrote: [],
    node,
    // A page anchor, the way the render writes one.
    anchor(id) {
      const el = node('section')
      el.id = id
      el.attrs['data-anchor'] = ''
      body.appendChild(el)
      return el
    },
    // A text node: no getAttribute at all, like the real thing.
    text(parent) {
      const t = { parentNode: parent }
      parent.children.push(t)
      return t
    },
    select(startNode, text, rect = { left: 12, bottom: 40 }) {
      page.selection = {
        rangeCount: 1,
        toString: () => text,
        getRangeAt: () => ({ startContainer: startNode, getBoundingClientRect: () => rect }),
      }
    },
    clipboard(mode) {
      const value =
        mode === 'none'
          ? {}
          : mode === 'throws'
            ? { clipboard: { writeText: () => { throw new Error('denied') } } }
            : { clipboard: { writeText: (t) => { page.wrote.push(t); return Promise.resolve() } } }
      Object.defineProperty(globalThis, 'navigator', { value, configurable: true, writable: true })
    },
    restore() {
      globalThis.document = saved.document
      globalThis.window = saved.window
      if (saved.navigator) Object.defineProperty(globalThis, 'navigator', saved.navigator)
      else delete globalThis.navigator
    },
  }
  globalThis.document = {
    body,
    documentElement,
    createElement: (tag) => node(tag),
    addEventListener: (t, fn) => {
      ;(on[t] = on[t] || []).push(fn)
    },
  }
  globalThis.window = { getSelection: () => page.selection, innerWidth: 1280, innerHeight: 800 }
  page.clipboard('ok')
  return page
}

const load = (html) => {
  const page = stub()
  const api = new Function(`return (${scriptSource(html)})`)()
  return { page, api }
}

test('the comment script mounts on the stub surface alone, and only then does the page admit it exists', () => {
  const html = renderPlan(walked)
  assert.match(html, /class="jsonly"/)
  assert.match(html, /\.jsonly \{ display:none; \}/, 'with JavaScript off the page never advertises the popover')
  const { page, api } = load(html)
  try {
    assert.equal(page.documentElement.attrs['data-comments'], 'on')
    assert.ok(page.body.children.includes(api.popover()))
    assert.equal(api.popover().style.display, 'none')
    for (const event of ['mouseup', 'keyup', 'keydown', 'mousedown']) assert.ok(page.on[event], `${event} is wired`)
  } finally {
    page.restore()
  }
})

test('the block quotes the selection under the anchor it started in — ticket, scene, the first of two, or none', () => {
  const { page, api } = load(renderPlan(walked))
  try {
    const ticket = page.anchor('PAY-2')
    page.select(page.text(ticket), 'builds the user-facing flow on the skeleton')
    assert.equal(api.feedback('is this the same flow as the admin one?'), '> [PAY-2] builds the user-facing flow on the skeleton\nis this the same flow as the admin one?')

    const scene = page.anchor('scene-2')
    page.select(page.text(scene), 'a sentence saying why it cannot go back to that card')
    assert.equal(api.feedback('say which card'), '> [scene-2] a sentence saying why it cannot go back to that card\nsay which card')

    // Spanning two anchors: the start container's anchor, because that is the
    // one the reader began in.
    const second = page.anchor('scene-3')
    page.selection = {
      rangeCount: 1,
      toString: () => 'end of scene two   and the start\nof scene three',
      getRangeAt: () => ({ startContainer: page.text(scene), getBoundingClientRect: () => ({ left: 0, bottom: 0 }) }),
    }
    assert.equal(api.feedback('these two are one scene'), '> [scene-2] end of scene two and the start of scene three\nthese two are one scene')
    assert.ok(second)

    // Outside every anchor: `[page]`, never a guess and never silence.
    page.select(page.text(page.body), 'Steering material, not record')
    assert.equal(api.feedback('what does this mean?'), '> [page] Steering material, not record\nwhat does this mean?')

    page.selection = null
    assert.equal(api.feedback('nothing selected'), null)
  } finally {
    page.restore()
  }
})

test('the quoted selection is text, and a planner cannot inject markup through it', () => {
  const evil = renderPlan({
    ...walked,
    walkthrough: [{ ...walked.walkthrough[0], sees: '<img src=x onerror=alert(1)> & "quoted"' }],
  })
  assert.ok(!evil.includes('<img src=x'), 'the page escapes it, so this is what a browser hands the selection back as')
  const { page, api } = load(evil)
  try {
    const scene = page.anchor('scene-1')
    page.select(page.text(scene), '<img src=x onerror=alert(1)> & "quoted"')
    api.show(api.selectionFacts())
    assert.equal(api.quote().textContent, '[scene-1] <img src=x onerror=alert(1)> & "quoted"', 'textContent, never innerHTML')
    assert.equal(api.feedback('no'), '> [scene-1] <img src=x onerror=alert(1)> & "quoted"\nno')
  } finally {
    page.restore()
  }
})

test('copying uses the clipboard when there is one, and shows the block for manual copy when there is not', () => {
  const { page, api } = load(renderPlan(walked))
  try {
    const block = '> [PAY-1] proves the provider sandbox works end to end\nwhy first?'
    assert.equal(api.copy(block), 'clipboard')
    assert.deepEqual(page.wrote, [block])
    assert.equal(api.fallback().style.display, 'none')

    // file:// in some browsers: no clipboard object at all. Never silent.
    page.clipboard('none')
    assert.equal(api.copy(block), 'manual')
    assert.equal(api.fallback().value, block)
    assert.equal(api.fallback().style.display, 'block')
    assert.equal(api.fallback().selected, 1, 'the block is selected, ready to copy by hand')
    assert.match(api.status().textContent, /would not let the page write to the clipboard/)

    // And a clipboard that throws falls back the same way.
    page.clipboard('throws')
    assert.equal(api.copy(block), 'manual')
    assert.equal(api.fallback().value, block)
  } finally {
    page.restore()
  }
})

test('the popover opens on a selection, Escape and a click elsewhere close it, and a modified Enter copies', () => {
  const { page, api } = load(renderPlan(walked))
  try {
    const ticket = page.anchor('PAY-1')
    page.select(page.text(ticket), 'proves the provider sandbox works end to end', { left: 40, bottom: 100 })
    page.on.mouseup[0]({ target: page.body })
    assert.equal(api.popover().style.display, 'block')
    assert.equal(api.popover().style.top, '110px', 'it opens under the selection')
    assert.equal(api.popover().style.left, '40px')

    api.input().value = 'why is this first?'
    page.on.keydown[0]({ key: 'Enter', metaKey: true })
    assert.deepEqual(page.wrote, ['> [PAY-1] proves the provider sandbox works end to end\nwhy is this first?'])

    page.on.keydown[0]({ key: 'Escape' })
    assert.equal(api.popover().style.display, 'none')
    assert.equal(api.input().value, '', 'closing clears the draft rather than re-attaching it to the next selection')

    // A plain click elsewhere closes; a click inside the popover does not.
    api.show(api.selectionFacts())
    page.on.mousedown[0]({ target: api.input() })
    assert.equal(api.popover().style.display, 'block')
    page.on.mousedown[0]({ target: page.body })
    assert.equal(api.popover().style.display, 'none')

    // A selection near the bottom or the right edge flips rather than hanging
    // off the viewport — a popover below the fold is one the reader never sees,
    // which would be this feature failing silently.
    api.show({ text: 'x', anchor: 'PAY-1', rect: { left: 1200, top: 700, bottom: 740 } })
    assert.equal(api.popover().style.top, '500px')
    assert.equal(api.popover().style.left, '920px')
  } finally {
    page.restore()
  }
})

test('the comment keeps its own line breaks — only the quoted selection is folded', () => {
  const { page, api } = load(renderPlan(walked))
  try {
    const scene = page.anchor('scene-1')
    page.select(page.text(scene), 'the refund confirmed,\n  and an email   within the hour')
    assert.equal(
      api.feedback('two problems here:\n\n- the email is the part they care about\n- "within the hour" is a promise'),
      '> [scene-1] the refund confirmed, and an email within the hour\ntwo problems here:\n\n- the email is the part they care about\n- "within the hour" is a promise',
    )
  } finally {
    page.restore()
  }
})

test('an empty comment copies nothing, and says why', () => {
  const { page, api } = load(renderPlan(walked))
  try {
    page.select(page.text(page.anchor('PAY-1')), 'proves the provider sandbox works end to end')
    api.show(api.selectionFacts())
    api.input().value = '   \n  '
    assert.equal(api.send(), null, 'a quotation with a blank second line is a comment nobody made')
    assert.deepEqual(page.wrote, [])
    assert.match(api.status().textContent, /Type what you think/)
  } finally {
    page.restore()
  }
})

test('a typed draft survives a click elsewhere, and never re-attaches to a different selection', () => {
  const { page, api } = load(renderPlan(walked))
  try {
    const ticket = page.anchor('PAY-1')
    page.select(page.text(ticket), 'proves the provider sandbox works end to end')
    page.on.mouseup[0]({ target: page.body })
    api.input().value = 'half a thought about this'

    // Reaching for something else is not discarding what you typed.
    page.on.mousedown[0]({ target: page.body })
    assert.equal(api.popover().style.display, 'none')
    page.on.mouseup[0]({ target: page.body })
    assert.equal(api.input().value, 'half a thought about this', 'the same selection gets its draft back')

    // A different selection does not inherit it — a comment quoted against
    // text it was not about is worse than a comment lost.
    page.select(page.text(page.anchor('scene-1')), 'the refund confirmed, and an email within the hour')
    page.on.mouseup[0]({ target: page.body })
    assert.equal(api.input().value, '')

    // And an explicit close throws it away.
    api.input().value = 'something'
    page.on.keydown[0]({ key: 'Escape' })
    assert.equal(api.input().value, '')
  } finally {
    page.restore()
  }
})
