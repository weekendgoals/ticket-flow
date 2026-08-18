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
// Zero dependencies, no configuration, stores nothing.

import { readFileSync, writeFileSync } from 'node:fs'
import { pathToFileURL } from 'node:url'

const esc = s =>
  String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]))

const list = (items, cls = '') =>
  `<ul${cls ? ` class="${cls}"` : ''}>\n${items.map(i => `<li>${esc(i)}</li>`).join('\n')}\n</ul>`

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
    ? `<section><h2>Outcome — falsifiable, or it is decoration</h2>
<div class="grid2">
<div class="cell"><h3>Problem</h3><p>${esc(plan.outcome.problem)}</p></div>
<div class="cell"><h3>Observable change</h3><p>${esc(plan.outcome.change)}</p></div>
<div class="cell"><h3>Evidence</h3><p>${esc(plan.outcome.evidence)}</p></div>
<div class="cell"><h3>Reversal condition</h3><p>${esc(plan.outcome.reversal)}</p></div>
</div></section>`
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

  const tickets = `<section><h2>The tickets, in order</h2>
${plan.firstWhy ? `<p class="why">First is first because: ${esc(plan.firstWhy)}</p>` : ''}
<ol class="tickets">
${plan.tickets.map(t => `<li><span class="tid">${esc(t.id)}</span><div><strong>${esc(t.name)}</strong><br><span class="tline">${esc(t.line)}</span></div></li>`).join('\n')}
</ol></section>`

  const alternative = plan.alternative
    ? `<section class="alt"><h2>Considered and rejected: ${esc(plan.alternative.label)}</h2>
${plan.alternative.tickets && plan.alternative.tickets.length ? list(plan.alternative.tickets) : ''}
${plan.alternative.whyRejected ? `<p class="why">Rejected because: ${esc(plan.alternative.whyRejected)}</p>` : ''}
</section>`
    : ''

  const pr = plan.planReview
  const planReview = pr
    ? `<section><h2>The plan review — fresh eyes, before you decide</h2>
${pr.flagged && pr.flagged.length ? `<h3>Flagged</h3>${list(pr.flagged)}` : ''}
${pr.changed && pr.changed.length ? `<h3>Changed in response</h3>${list(pr.changed)}` : ''}
${pr.rejected && pr.rejected.length ? `<h3>Rejected, with reasons</h3><ul>${pr.rejected.map(x => `<li>${esc(x.finding)} — <em>${esc(x.why)}</em></li>`).join('\n')}</ul>` : ''}
${pr.questions && pr.questions.length ? `<h3>Its open questions</h3>${list(pr.questions)}` : ''}
</section>`
    : ''

  const openQuestions = plan.openQuestions && plan.openQuestions.length
    ? `<section class="questions"><h2>Needs your answer</h2>${list(plan.openQuestions)}</section>`
    : ''

  const steer =
    stage === 'shape'
      ? `<section class="steer"><h2>How to steer</h2><p>Reply in chat, in plain words — the plan updates and this page re-renders at the same URL. For example:</p>
<ul>
<li>“merge ${esc(plan.tickets[0].id)} into ${esc(plan.tickets[plan.tickets.length - 1].id)}” · “split the migration out of ${esc(plan.tickets[0].id)}”</li>
<li>“swap the order of the first two” · “make it incremental — I want feedback per ticket”</li>
<li>“the outcome's evidence is wrong — measure X instead”</li>
<li>“the shape is right” — and only then is the full document written</li>
</ul></section>`
      : `<section class="steer"><h2>How to decide</h2><p>Reply in chat: approve, or say what to change — nothing is built until you do. Re-planning is cheap now and expensive after three tickets are stacked on a wrong split.</p></section>`

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
  .dim { color:var(--muted); }
  .meta { color:var(--muted); font-size:0.82rem; margin-top:3rem; }
</style>
<main>
<p class="eyebrow">epic plan · ${stage === 'shape' ? 'shape checkpoint' : 'sign-off'}</p>
<h1>${esc(plan.epic)}</h1>
<div class="banner">${banner}</div>
${outcome}
${meta}
${grounding}
${tickets}
${alternative}
${planReview}
${openQuestions}
${steer}
<p class="meta">Steering material, not record — \`tickets.md\` is the record${generatedAt ? ` · rendered ${esc(generatedAt)}` : ''}. This page re-renders as the plan changes; it is never committed.</p>
</main>
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

  const plan = JSON.parse(readFileSync(jsonFile, 'utf8'))
  const html = renderPlan(plan, { generatedAt: new Date().toISOString().slice(0, 16).replace('T', ' ') })
  if (outFile) writeFileSync(outFile, html)
  else process.stdout.write(html)
}
