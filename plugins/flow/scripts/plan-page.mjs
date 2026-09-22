#!/usr/bin/env node
// plan-page — render an epic plan as one self-contained HTML page, for the
// two human gates of /flow:epic: the shape checkpoint (before the document
// is written) and sign-off (after the plan review).
//
// The planning session composes a JSON file describing the plan and this
// script renders it — the skeleton ships here, tested, so no session ever
// rebuilds the page by hand and every plan reads the same way. The page is
// steering material, not record: it lives in the session scratchpad and is
// published (an artifact keeps one URL across both gates); `tickets.md` is
// the record, and neither the JSON nor the page is ever committed.
//
// Usage:
//
//   plan-page.mjs <plan.json>            render to stdout
//   plan-page.mjs <plan.json> --out <f>  write the page to a file
//
// The JSON schema — `epic` and a non-empty `tickets` are required, every
// other field renders only when present:
//
//   {
//     "stage": "shape" | "sign-off",          // default "shape"
//     "epic": "payments",
//     "outcome": { "problem": "...", "change": "...",
//                  "evidence": "...", "reversal": "..." },
//     "requirements": [ "when <condition> the system shall <result>" ],
//                                          // the WHAT, apart from the HOW;
//                                          // unnumbered — the page numbers them
//     "walkthrough": [ { "who": "a customer",
//                        "does": "asks for a refund from the order page",
//                        "sees": "the money back the same day, and an email",
//                        "today": "they write to support and wait two days",
//                        "tickets": ["PAY-1", "PAY-2"],
//                        "requirements": [1, 3] } ],
//                                          // OPTIONAL: three to seven scenes in
//                                          // the order a USER meets them, not
//                                          // ticket order. `today` and
//                                          // `requirements` are optional
//     "delivery": { "choice": "release" | "incremental", "why": "..." },
//     "areas": [ { "name": "api-gateway",
//                  "instructions": "api-gateway/CLAUDE.md" } ],
//     "grounding": [ "what grounding turned up, one line each" ],
//     "tickets": [ { "id": "PAY-1", "name": "walking skeleton",
//                    "line": "what it proves or builds" } ],
//     "firstWhy": "why the first ticket is first",
//     "alternative": { "label": "split by service", "tickets": [ "one line each" ],
//                      "whyRejected": "..." },
//     "planReview": { "flagged": [...], "changed": [...],
//                     "rejected": [ { "finding": "...", "why": "..." } ],
//                     "questions": [...] },
//     "openQuestions": [ "..." ]
//   }
//
// ── the walkthrough, and the guard against fiction ───────────────────────────
//
// The release page walks through what WAS built, after the fact; this section
// is its counterpart before it — what the epic will do, in the words of the
// person who asked for it. Which is exactly why it can be fiction: prose about
// a future nobody has to build. So the scenes are tied to the tickets
// MECHANICALLY, here, in a pure render that the two gates both run:
//
//   - a scene naming a ticket ID the plan does not carry FAILS the render,
//     naming the scene and the ID — the CLI then exits nonzero and no page is
//     published, because a scene resting on a ticket nobody will build is the
//     fiction this section is most likely to produce;
//   - a `requirements` citation outside the numbered list fails the same way;
//   - a ticket no scene names is LISTED under the walkthrough, as "not in any
//     scene" — never hidden. Infrastructure tickets legitimately land there and
//     the reader should see them; a user-visible one landing there is a scene
//     somebody forgot to write, and the plan reviewer is told to say so.
//
// What is a rule and not code: the prose names no ticket IDs and no file names
// (the reader is the person who asked for the feature, not the person who will
// build it) — the epic skill teaches it and the plan reviewer reads for it,
// because "a name that reads like an identifier" is not something a regex can
// separate from a product name.
//
// ── anchors, and the comment block ───────────────────────────────────────────
//
// Every section and every ticket carries a STABLE id, and the element that
// carries it also carries `data-anchor` — the attribute the page's comment
// script walks up to find. The set is part of this page's contract (a later
// multi-user comment layer points at the same ids), so it is listed here:
//
//   #outcome  #requirements  #walkthrough  #scene-1 … #scene-N  #tickets
//   #<ID> per ticket (#PAY-3)  #alternative  #plan-review  #open-questions
//
// A ticket's anchor is its bare ID — not `t-<ID>` as on the release page —
// because this page's anchors are pasted into a chat message, where `[PAY-3]`
// is the ticket the reader means and `[t-PAY-3]` is a thing to decode.
//
// Selecting text opens a small popover: type a comment, and the page copies
//
//   > [<anchor>] <the selected text, on one line>
//   <the comment>
//
// to the clipboard for the human to paste into the session. Nothing is stored,
// nothing is sent, there is no server and no database — chat is the channel,
// and a pasted block is read by the session, not by a parser in `tickets.mjs`.
// A selection spanning two anchors takes the FIRST; a selection under no anchor
// is `[page]`. With JavaScript off the page reads exactly as it does with it —
// the popover is additive, and the one sentence that advertises it is hidden
// until the script runs, so the page never offers what it cannot do.
//
// Zero dependencies, no configuration, stores nothing.

import { readFileSync, writeFileSync } from 'node:fs'
import { pathToFileURL } from 'node:url'

const esc = s =>
  String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]))

const list = (items, cls = '') =>
  `<ul${cls ? ` class="${cls}"` : ''}>\n${items.map(i => `<li>${esc(i)}</li>`).join('\n')}\n</ul>`

// How a scene is named in a refusal: its number, and enough of its own words
// that the planner finds it without counting list items.
const sceneLabel = (scene, i) => {
  const words = `${scene?.who ?? ''} ${scene?.does ?? ''}`.replace(/\s+/g, ' ').trim()
  return `scene ${i + 1}${words ? ` (${words.length > 60 ? `${words.slice(0, 57)}…` : words})` : ''}`
}

// The fiction guard. Pure, mechanical, and run at both gates — see the header.
// It throws rather than dropping a bad scene: a page that quietly rendered
// nine tickets' worth of scenes with the tenth silently gone would be exactly
// the flattering artifact this refuses to be.
function validateWalkthrough(scenes, ticketIds, requirementCount) {
  if (!Array.isArray(scenes)) throw new Error('plan-page: "walkthrough" must be an array of scenes')
  const known = new Set(ticketIds)
  scenes.forEach((scene, i) => {
    const where = sceneLabel(scene, i)
    if (!scene || typeof scene !== 'object') throw new Error(`plan-page: ${where} is not an object`)
    for (const field of ['who', 'does', 'sees']) {
      if (typeof scene[field] !== 'string' || !scene[field].trim())
        throw new Error(`plan-page: ${where} has no "${field}" — a scene says who acts, what they do, and what they see once this ships`)
    }
    if (!Array.isArray(scene.tickets) || !scene.tickets.length)
      throw new Error(`plan-page: ${where} names no tickets — a scene nothing in the plan builds is the fiction this section exists to prevent`)
    for (const id of scene.tickets) {
      if (!known.has(id))
        throw new Error(`plan-page: ${where} names ticket ${id}, which is not in this plan's tickets (${ticketIds.join(', ')})`)
    }
    if (scene.requirements !== undefined) {
      if (!Array.isArray(scene.requirements)) throw new Error(`plan-page: ${where} has a "requirements" that is not an array`)
      for (const n of scene.requirements) {
        if (!Number.isInteger(n) || n < 1 || n > requirementCount)
          throw new Error(
            `plan-page: ${where} cites requirement ${n}, and this plan has ${requirementCount === 0 ? 'no numbered requirements' : `${requirementCount} (1–${requirementCount})`}`,
          )
      }
    }
  })
}

// ── the comment popover ──────────────────────────────────────────────────────
// Inline, because the page is one self-contained file — an artifact, or a file
// somebody opens from disk. An external script would be a second thing to
// publish and a network request a plan page must never need.
//
// It is cut out of the RENDERED page between the two markers below and
// evaluated with `new Function` by plan-page.test.mjs — which sees no module
// scope, so a reference to anything outside the surface named here fails in the
// test instead of in somebody's browser, and no test needs a browser. The
// surface is exactly: `document.addEventListener` / `createElement` /
// `body.appendChild` / `documentElement.setAttribute`, `window.getSelection` /
// `innerWidth` / `innerHeight`,
// `navigator.clipboard`, and on an element `className`, `id`, `textContent`,
// `value`, `rows`, `type`, `placeholder`, `style`, `appendChild`,
// `addEventListener`, `focus`, `select`, `parentNode`, `getAttribute`.
//
// The IIFE returns its own functions so the test can call them; in a browser
// the returned value is simply discarded.
export const SCRIPT_OPEN = '/* flow:comment-script */'
export const SCRIPT_CLOSE = '/* /flow:comment-script */'

const COMMENT_SCRIPT = `(function () {
  var pop = null, quoteEl = null, input = null, statusEl = null, fallbackEl = null
  var facts = null
  // What the draft in the box was typed against, so a draft survives an
  // accidental click but can never be copied under a quote it was not about.
  var draftFor = null

  // The block is line-shaped — one quote line, then the comment — so a
  // multi-line SELECTION is folded onto one line rather than breaking the
  // shape the session reads. Nothing is truncated: the reader chose the text,
  // and a shortened quote can be ambiguous about which sentence it is about.
  function oneLine(s) { return String(s === null || s === undefined ? '' : s).replace(/\\s+/g, ' ').trim() }

  // The COMMENT is not folded: it is last, so nothing can be ambiguous about
  // where it ends, and a reader who wrote three paragraphs meant three.
  function asText(s) { return String(s === null || s === undefined ? '' : s).replace(/\\r\\n?/g, '\\n').trim() }

  // The nearest enclosing anchor, walking up. A selection spanning two anchors
  // starts inside the first, which is why the START container decides.
  function anchorOf(node) {
    for (var n = node; n; n = n.parentNode) {
      if (n.getAttribute && n.id && n.getAttribute('data-anchor') !== null) return n.id
    }
    return null
  }

  function block(anchor, quote, comment) {
    return '> [' + (anchor || 'page') + '] ' + oneLine(quote) + '\\n' + asText(comment)
  }

  function selectionFacts() {
    var sel = typeof window !== 'undefined' && window.getSelection ? window.getSelection() : null
    if (!sel || !sel.rangeCount) return null
    var text = oneLine(sel.toString())
    if (!text) return null
    var range = sel.getRangeAt(0)
    return {
      text: text,
      anchor: anchorOf(range.startContainer),
      rect: range.getBoundingClientRect ? range.getBoundingClientRect() : null
    }
  }

  function feedback(comment) {
    var f = facts || selectionFacts()
    if (!f) return null
    return block(f.anchor, f.text, comment)
  }

  function say(msg) { if (statusEl) statusEl.textContent = msg }

  // file:// in some browsers has no clipboard API, and a denied permission
  // rejects. Never fail silently: show the block, selected, to copy by hand.
  function manual(text) {
    if (fallbackEl) {
      fallbackEl.value = text
      fallbackEl.style.display = 'block'
      if (fallbackEl.focus) fallbackEl.focus()
      if (fallbackEl.select) fallbackEl.select()
    }
    say('This browser would not let the page write to the clipboard — the block is below, selected. Copy it by hand.')
  }

  function copy(text) {
    var nav = typeof navigator === 'undefined' ? null : navigator
    var clip = nav && nav.clipboard && nav.clipboard.writeText ? nav.clipboard : null
    if (!clip) { manual(text); return 'manual' }
    try {
      var p = clip.writeText(text)
      if (p && p.then) p.then(function () { say('Copied. Paste it into the chat.') }, function () { manual(text) })
      else say('Copied. Paste it into the chat.')
      return 'clipboard'
    } catch (e) {
      manual(text)
      return 'manual'
    }
  }

  // An empty comment copies nothing: a block whose second line is blank is a
  // quotation with no point, and pasting one costs the reader a second turn to
  // say what they meant. Refused out loud, never silently.
  function send() {
    var comment = asText(input ? input.value : '')
    if (!comment) {
      say('Type what you think about the selected text — the block is your comment, quoted against it.')
      if (input && input.focus) input.focus()
      return null
    }
    var text = feedback(comment)
    if (!text) return null
    copy(text)
    // The draft has become a block; the next selection starts clean.
    if (input) input.value = ''
    draftFor = null
    return text
  }

  function make(tag, cls) {
    var n = document.createElement(tag)
    if (cls) n.className = cls
    return n
  }

  function within(node, box) {
    for (var n = node; n; n = n.parentNode) if (n === box) return true
    return false
  }

  // Hiding KEEPS the draft: a click elsewhere is how a reader reaches for
  // something, not how they discard a sentence they just typed. Only an
  // explicit close, or a copy, throws it away.
  function hide() {
    facts = null
    if (!pop) return
    pop.style.display = 'none'
    if (fallbackEl) { fallbackEl.style.display = 'none'; fallbackEl.value = '' }
    say('')
  }

  function close() {
    hide()
    if (input) input.value = ''
    draftFor = null
  }

  function show(f) {
    // A draft belongs to the quote it was typed against. Same selection: it
    // comes back. Different one: it goes, because a comment silently
    // re-attached to another sentence is the one outcome worse than losing it.
    var key = (f.anchor || 'page') + '\\u0000' + f.text
    if (key !== draftFor) {
      if (input) input.value = ''
      draftFor = key
      say('')
    }
    facts = f
    // textContent, never innerHTML: the quote is page text, which is planner
    // text, which is data here exactly as it is everywhere else on this page.
    quoteEl.textContent = '[' + (f.anchor || 'page') + '] ' + f.text
    pop.style.display = 'block'
    if (f.rect) {
      // Fixed position, so the selection's own viewport rect is the frame.
      // Flipped above the selection when it would otherwise hang off the
      // bottom: a popover rendered below the fold is a popover the reader
      // never sees, which is the silent failure of the whole feature. POP_H
      // and POP_W are this page's own fixed layout, not a measurement.
      var vh = typeof window !== 'undefined' && window.innerHeight ? window.innerHeight : 0
      var vw = typeof window !== 'undefined' && window.innerWidth ? window.innerWidth : 0
      var POP_H = 200, POP_W = 352
      var top = f.rect.bottom + 10
      if (vh && top + POP_H > vh) top = Math.max(8, f.rect.top - POP_H)
      var left = f.rect.left
      if (vw && left + POP_W > vw) left = Math.max(8, vw - POP_W - 8)
      pop.style.left = Math.round(left) + 'px'
      pop.style.top = Math.round(top) + 'px'
    }
    if (input && input.focus) input.focus()
  }

  function onSelect(e) {
    if (pop && e && e.target && within(e.target, pop)) return
    var f = selectionFacts()
    if (f) show(f)
    else hide()
  }

  function onKey(e) {
    if (!e) return
    if (e.key === 'Escape') { close(); return }
    if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) send()
  }

  function onDown(e) {
    if (pop && e && e.target && within(e.target, pop)) return
    hide()
  }

  function mount() {
    pop = make('div', 'flow-pop')
    quoteEl = make('div', 'flow-quote')
    pop.appendChild(quoteEl)
    input = make('textarea', 'flow-input')
    input.rows = 3
    input.placeholder = 'What is wrong here, or what you want instead'
    pop.appendChild(input)
    var row = make('div', 'flow-row')
    var btn = make('button', 'flow-copy')
    btn.type = 'button'
    btn.textContent = 'Copy feedback'
    btn.addEventListener('click', function () { send() })
    row.appendChild(btn)
    var hint = make('span', 'flow-hint')
    hint.textContent = 'Cmd/Ctrl+Enter copies · Esc closes'
    row.appendChild(hint)
    pop.appendChild(row)
    statusEl = make('div', 'flow-status')
    pop.appendChild(statusEl)
    fallbackEl = make('textarea', 'flow-fallback')
    fallbackEl.rows = 4
    pop.appendChild(fallbackEl)
    document.body.appendChild(pop)
    hide()
    document.addEventListener('mouseup', onSelect)
    document.addEventListener('keyup', onSelect)
    document.addEventListener('keydown', onKey)
    document.addEventListener('mousedown', onDown)
    // Only now does the page admit the popover exists — see .jsonly.
    document.documentElement.setAttribute('data-comments', 'on')
  }

  if (typeof document !== 'undefined' && document.createElement && document.body) mount()

  return {
    anchorOf: anchorOf, block: block, selectionFacts: selectionFacts, feedback: feedback,
    copy: copy, send: send, show: show, hide: hide, close: close, mount: mount,
    popover: function () { return pop },
    input: function () { return input },
    quote: function () { return quoteEl },
    fallback: function () { return fallbackEl },
    status: function () { return statusEl }
  }
})()`

export function renderPlan(plan, { generatedAt = '' } = {}) {
  if (!plan || typeof plan !== 'object' || !plan.epic || typeof plan.epic !== 'string') {
    throw new Error('plan-page: the plan JSON needs an "epic" name')
  }
  if (!Array.isArray(plan.tickets) || !plan.tickets.length) {
    throw new Error('plan-page: the plan JSON needs a non-empty "tickets" array — a shape with no tickets is not a shape yet')
  }
  const stage = plan.stage === 'sign-off' ? 'sign-off' : 'shape'
  const delivery = plan.delivery || {}
  const release = delivery.choice === 'release'

  const banner =
    stage === 'shape'
      ? 'Nothing is written yet. Bend the shape now — a re-split costs a sentence here and a rewrite after the document exists.'
      : release
        ? 'The finished plan, with the plan review in hand. Approving a release epic approves unattended execution into its epic branch — your next decision point after this is the release pull request.'
        : 'The finished plan, with the plan review in hand. Each ticket will open its own pull request for you to merge.'

  const outcome = plan.outcome
    ? `<section id="outcome" data-anchor><h2>Outcome — what success looks like, and what would prove it failed</h2>
<div class="grid2">
<div class="cell"><h3>Problem</h3><p>${esc(plan.outcome.problem)}</p></div>
<div class="cell"><h3>What changes</h3><p>${esc(plan.outcome.change)}</p></div>
<div class="cell"><h3>How we will know it worked</h3><p>${esc(plan.outcome.evidence)}</p></div>
<div class="cell"><h3>What would make us undo it</h3><p>${esc(plan.outcome.reversal)}</p></div>
</div></section>`
    : ''

  const reqs = Array.isArray(plan.requirements) ? plan.requirements : []
  const requirements = reqs.length
    ? `<section id="requirements" data-anchor><h2>Requirements — what it must do, not how</h2>
<ol class="reqs">
${reqs.map(r => `<li>${esc(r)}</li>`).join('\n')}
</ol></section>`
    : ''

  // ── the walkthrough ────────────────────────────────────────────────────────
  // Validated before anything is rendered, so a refusal is about the plan and
  // never about half a page.
  const scenes = plan.walkthrough === undefined || plan.walkthrough === null ? [] : plan.walkthrough
  const ticketIds = plan.tickets.map(t => t && t.id)
  if (plan.walkthrough !== undefined && plan.walkthrough !== null) validateWalkthrough(scenes, ticketIds, reqs.length)
  const named = new Set(scenes.flatMap(s => s.tickets))
  const orphans = ticketIds.filter(id => !named.has(id))

  const walkthrough = scenes.length
    ? `<section id="walkthrough" data-anchor><h2>Walkthrough — what you will be able to do</h2>
<p class="why">In the order a person meets it, not the order it is built. Read it as the promise: if a scene is not what you want, the plan is wrong here, not later.</p>
<ol class="scenes">
${scenes
  .map(
    (s, i) => `<li id="scene-${i + 1}" data-anchor>
<p class="act"><b>${esc(s.who)}</b> ${esc(s.does)}</p>
<p class="sees"><span class="lbl">sees</span> ${esc(s.sees)}</p>
${s.today ? `<p class="today"><span class="lbl">today</span> ${esc(s.today)}</p>` : ''}
<p class="tags">${(s.tickets || []).map(id => `<a class="chip tag" href="#${esc(id)}">${esc(id)}</a>`).join('\n')}${(s.requirements || []).map(n => `<a class="chip req" href="#requirements">R${esc(n)}</a>`).join('\n')}</p>
</li>`,
  )
  .join('\n')}
</ol>
${
  orphans.length
    ? `<p class="orphans"><b>In no scene:</b> ${orphans.map(id => `<a class="chip tag" href="#${esc(id)}">${esc(id)}</a>`).join(' ')} — infrastructure a user never meets, or a scene nobody wrote. You decide which.</p>`
    : '<p class="why">Every ticket in this plan is named by a scene above.</p>'
}
</section>`
    : ''

  const meta = `<section><div class="chips">
${delivery.choice ? `<span class="chip strong">${esc(delivery.choice)}</span>` : ''}
${(plan.areas || []).map(a => `<span class="chip">${esc(a.name)}${a.instructions ? ` <span class="dim">· ${esc(a.instructions)}</span>` : ''}</span>`).join('\n')}
</div>
${delivery.why ? `<p class="why">${esc(delivery.why)}</p>` : ''}
</section>`

  const grounding = plan.grounding && plan.grounding.length
    ? `<section><h2>What grounding turned up</h2>${list(plan.grounding)}</section>`
    : ''

  const tickets = `<section id="tickets" data-anchor><h2>The tickets, in order</h2>
${plan.firstWhy ? `<p class="why">First is first because: ${esc(plan.firstWhy)}</p>` : ''}
<ol class="tickets">
${plan.tickets.map(t => `<li id="${esc(t.id)}" data-anchor><span class="tid">${esc(t.id)}</span><div><strong>${esc(t.name)}</strong><br><span class="tline">${esc(t.line)}</span></div></li>`).join('\n')}
</ol></section>`

  const alternative = plan.alternative
    ? `<section class="alt" id="alternative" data-anchor><h2>Considered and rejected: ${esc(plan.alternative.label)}</h2>
${plan.alternative.tickets && plan.alternative.tickets.length ? list(plan.alternative.tickets) : ''}
${plan.alternative.whyRejected ? `<p class="why">Rejected because: ${esc(plan.alternative.whyRejected)}</p>` : ''}
</section>`
    : ''

  const pr = plan.planReview
  const planReview = pr
    ? `<section id="plan-review" data-anchor><h2>The plan review — fresh eyes, before you decide</h2>
${pr.flagged && pr.flagged.length ? `<h3>Flagged</h3>${list(pr.flagged)}` : ''}
${pr.changed && pr.changed.length ? `<h3>Changed in response</h3>${list(pr.changed)}` : ''}
${pr.rejected && pr.rejected.length ? `<h3>Rejected, with reasons</h3><ul>${pr.rejected.map(x => `<li>${esc(x.finding)} — <em>${esc(x.why)}</em></li>`).join('\n')}</ul>` : ''}
${pr.questions && pr.questions.length ? `<h3>Its open questions</h3>${list(pr.questions)}` : ''}
</section>`
    : ''

  const openQuestions = plan.openQuestions && plan.openQuestions.length
    ? `<section class="questions" id="open-questions" data-anchor><h2>Needs your answer</h2>${list(plan.openQuestions)}</section>`
    : ''

  // Advertised only when the script runs: with JavaScript off the popover does
  // not exist, and a page that offered it anyway would be telling the reader to
  // do something that silently does nothing.
  const selectHint = `<p class="jsonly"><b>Or comment in place:</b> select any text on this page, type a note in the popover, and it copies a short block — the quoted text and your comment — for you to paste into the chat. Nothing is stored or sent; the chat is the channel.</p>`

  const steer =
    stage === 'shape'
      ? `<section class="steer"><h2>How to steer</h2><p>Reply in chat, in plain words — the plan updates and this page re-renders at the same URL. For example:</p>
<ul>
<li>“merge ${esc(plan.tickets[0].id)} into ${esc(plan.tickets[plan.tickets.length - 1].id)}” · “split the migration out of ${esc(plan.tickets[0].id)}”</li>
<li>“swap the order of the first two” · “make it incremental — I want feedback per ticket”</li>
<li>“the outcome's evidence is wrong — measure X instead”</li>
<li>“the shape is right” — and only then is the full document written</li>
</ul>
${selectHint}</section>`
      : `<section class="steer"><h2>How to decide</h2><p>Reply in chat: approve, or say what to change — nothing is built until you do. Re-planning is cheap now and expensive after three tickets are stacked on a wrong split.</p>
${selectHint}</section>`

  return `<title>${esc(plan.epic)} plan</title>
<style>
  :root { --ground:#FAF9F6; --surface:#F1EFE8; --ink:#22261F; --muted:#6C7266; --line:#DBD7CB;
          --accent:#3E7A5E; --accent-ink:#2E5C46; --warn:#A97A1F; --warn-soft:#F4E8CE; --chip:#E7E4DA; }
  @media (prefers-color-scheme: dark) { :root:not([data-theme="light"]) {
    --ground:#151815; --surface:#1C201C; --ink:#E3E6DF; --muted:#949B8F; --line:#2E332D;
    --accent:#72B591; --accent-ink:#8FCBAA; --warn:#D2A452; --warn-soft:#322A18; --chip:#262B26; } }
  :root[data-theme="dark"] {
    --ground:#151815; --surface:#1C201C; --ink:#E3E6DF; --muted:#949B8F; --line:#2E332D;
    --accent:#72B591; --accent-ink:#8FCBAA; --warn:#D2A452; --warn-soft:#322A18; --chip:#262B26; }
  body { background:var(--ground); color:var(--ink); margin:0; padding:2.5rem 1.25rem 4rem;
         font:16px/1.6 -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; }
  main { max-width:46rem; margin:0 auto; }
  .eyebrow { font-family:ui-monospace, Menlo, monospace; font-size:0.72rem; letter-spacing:0.13em;
             text-transform:uppercase; color:var(--accent-ink); margin:0 0 0.6rem; }
  h1 { font-family:"Iowan Old Style", Palatino, Georgia, serif; font-size:2.2rem; margin:0 0 0.75rem; line-height:1.15; }
  .banner { background:var(--surface); border:1px solid var(--line); border-left:3px solid var(--accent);
            border-radius:10px; padding:0.8rem 1.1rem; font-size:0.95rem; margin:0 0 1.5rem; }
  section { margin:2.25rem 0; }
  h2 { font-family:"Iowan Old Style", Palatino, Georgia, serif; font-size:1.3rem; margin:0 0 0.75rem; }
  h3 { font-size:0.78rem; letter-spacing:0.09em; text-transform:uppercase; color:var(--muted); margin:1rem 0 0.3rem; }
  .grid2 { display:grid; grid-template-columns:1fr 1fr; gap:1px; background:var(--line);
           border:1px solid var(--line); border-radius:10px; overflow:hidden; }
  @media (max-width:600px){ .grid2 { grid-template-columns:1fr; } }
  .cell { background:var(--surface); padding:0.75rem 1rem; } .cell p { margin:0.1rem 0 0; font-size:0.95rem; }
  .cell h3 { margin-top:0; }
  .chips { display:flex; flex-wrap:wrap; gap:0.5rem; }
  .chip { border:1px solid var(--line); background:var(--chip); border-radius:99px; padding:0.15rem 0.7rem; font-size:0.82rem; }
  .chip.strong { border-color:var(--accent); color:var(--accent-ink); background:transparent; font-weight:600; }
  .why { color:var(--muted); font-size:0.92rem; margin:0.6rem 0 0; }
  ol.tickets { list-style:none; padding:0; margin:0.75rem 0 0; counter-reset:t; display:flex; flex-direction:column; gap:0.5rem; }
  ol.tickets li { counter-increment:t; display:flex; gap:0.9rem; align-items:baseline;
                  background:var(--surface); border:1px solid var(--line); border-radius:10px; padding:0.7rem 1rem; }
  ol.tickets li::before { content:counter(t); font-family:ui-monospace, Menlo, monospace;
                          color:var(--accent-ink); font-size:1.1rem; min-width:1.2rem; text-align:right; }
  .tid { font-family:ui-monospace, Menlo, monospace; font-size:0.8rem; color:var(--muted); min-width:4.2rem; }
  .tline { color:var(--muted); font-size:0.9rem; }
  .alt { border:1px dashed var(--line); border-radius:10px; padding:0.4rem 1.1rem 0.9rem; }
  .questions { background:var(--warn-soft); border:1px solid var(--line); border-left:3px solid var(--warn);
               border-radius:10px; padding:0.4rem 1.1rem 0.9rem; }
  .steer { border-top:1px solid var(--line); padding-top:1.25rem; }
  .steer ul { padding-left:1.15rem; } .steer li { margin:0.35rem 0; font-size:0.92rem; }
  ul { margin:0.4rem 0; } li { margin:0.25rem 0; }
  ol.reqs { padding-left:1.5rem; margin:0.5rem 0 0; } ol.reqs li { margin:0.45rem 0; }
  ol.reqs li::marker { font-family:ui-monospace, Menlo, monospace; color:var(--accent-ink); }
  .dim { color:var(--muted); }
  .meta { color:var(--muted); font-size:0.82rem; margin-top:3rem; }
  ol.scenes { list-style:none; padding:0; margin:0.75rem 0 0; counter-reset:s; display:flex; flex-direction:column; gap:0.6rem; }
  ol.scenes li { counter-increment:s; position:relative; background:var(--surface); border:1px solid var(--line);
                 border-radius:10px; padding:0.75rem 1rem 0.6rem 2.6rem; }
  ol.scenes li::before { content:counter(s); position:absolute; left:1rem; top:0.75rem;
                         font-family:ui-monospace, Menlo, monospace; color:var(--accent-ink); font-size:1rem; }
  .act { margin:0 0 0.35rem; }
  .sees, .today { margin:0.15rem 0; font-size:0.93rem; }
  .today { color:var(--muted); }
  .lbl { font-family:ui-monospace, Menlo, monospace; font-size:0.68rem; letter-spacing:0.1em; text-transform:uppercase;
         color:var(--muted); margin-right:0.4rem; }
  .tags { margin:0.5rem 0 0; display:flex; flex-wrap:wrap; gap:0.35rem; }
  a.chip { text-decoration:none; color:inherit; }
  .chip.tag { font-family:ui-monospace, Menlo, monospace; font-size:0.72rem; }
  .chip.req { font-size:0.72rem; color:var(--accent-ink); border-color:var(--accent); background:transparent; }
  .orphans { font-size:0.9rem; margin:0.9rem 0 0; display:flex; flex-wrap:wrap; gap:0.35rem; align-items:center; }
  .jsonly { display:none; }
  :root[data-comments] .jsonly { display:block; }
  .flow-pop { position:fixed; z-index:99; display:none; width:min(22rem, calc(100vw - 2rem));
              background:var(--surface); border:1px solid var(--line); border-radius:10px;
              box-shadow:0 6px 24px rgba(0,0,0,0.18); padding:0.7rem 0.8rem; font-size:0.9rem; }
  .flow-quote { color:var(--muted); font-size:0.8rem; max-height:4.5rem; overflow:auto; margin-bottom:0.45rem;
                border-left:2px solid var(--accent); padding-left:0.5rem; }
  .flow-input, .flow-fallback { width:100%; box-sizing:border-box; background:var(--ground); color:var(--ink);
                                border:1px solid var(--line); border-radius:6px; padding:0.4rem 0.5rem;
                                font:inherit; font-size:0.88rem; resize:vertical; }
  .flow-fallback { display:none; margin-top:0.45rem; font-family:ui-monospace, Menlo, monospace; font-size:0.78rem; }
  .flow-row { display:flex; align-items:center; gap:0.6rem; margin-top:0.45rem; }
  .flow-copy { font:inherit; font-size:0.85rem; padding:0.25rem 0.8rem; border-radius:99px; cursor:pointer;
               border:1px solid var(--accent); background:transparent; color:var(--accent-ink); }
  .flow-hint { color:var(--muted); font-size:0.72rem; }
  .flow-status { color:var(--muted); font-size:0.78rem; margin-top:0.35rem; }
</style>
<main>
<p class="eyebrow">epic plan · ${stage === 'shape' ? 'shape checkpoint' : 'sign-off'}</p>
<h1>${esc(plan.epic)}</h1>
<div class="banner">${banner}</div>
${outcome}
${requirements}
${walkthrough}
${meta}
${grounding}
${tickets}
${alternative}
${planReview}
${openQuestions}
${steer}
<p class="meta">Steering material, not record — \`tickets.md\` is the record${generatedAt ? ` · rendered ${esc(generatedAt)}` : ''}. This page re-renders as the plan changes; it is never committed.</p>
</main>
<script>${SCRIPT_OPEN}${COMMENT_SCRIPT}${SCRIPT_CLOSE}</script>
`
}

// ── entry point ──────────────────────────────────────────────────────────────
// Guarded so the test suite can import renderPlan without running the CLI.

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const argv = process.argv.slice(2)
  const outIx = argv.indexOf('--out')
  const outFile = outIx !== -1 ? argv[outIx + 1] : null
  const jsonFile = argv.filter((a, i) => !a.startsWith('--') && i !== outIx + 1)[0]

  if (!jsonFile || (outIx !== -1 && !outFile)) {
    console.error('usage: plan-page.mjs <plan.json> [--out <file>]')
    process.exit(2)
  }

  // A refused plan is a refused PAGE: nothing is written and nothing is
  // published, because the whole point of the walkthrough's guard is that a
  // scene resting on a ticket nobody will build never reaches a human gate. The
  // message is the refusal alone — a stack trace here says nothing a planner
  // can act on.
  let html
  try {
    const plan = JSON.parse(readFileSync(jsonFile, 'utf8'))
    html = renderPlan(plan, { generatedAt: new Date().toISOString().slice(0, 16).replace('T', ' ') })
  } catch (e) {
    console.error(e.message.startsWith('plan-page:') ? e.message : `plan-page: ${e.message}`)
    process.exit(2)
  }
  if (outFile) writeFileSync(outFile, html)
  else process.stdout.write(html)
}
