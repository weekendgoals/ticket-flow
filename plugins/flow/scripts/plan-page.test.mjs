// plan-page.test.mjs — the plan page's rendering, as a pure function.
//
// renderPlan takes the JSON a planning session composes and returns HTML;
// these tests feed it fixtures and assert on the output — no filesystem, no
// git. What matters: required fields refuse loudly, optional sections render
// only when present, the two stages read differently, and nothing a planner
// writes can inject markup.

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { renderPlan } from './plan-page.mjs'

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
  assert.match(html, /Reversal condition/)
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
  assert.match(html, /Requirements — the WHAT, apart from the HOW/)
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
