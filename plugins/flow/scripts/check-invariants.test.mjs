// check-invariants.test.mjs — the checker must pass on the intact repo and,
// just as important, actually fail on drift: a checker that cannot fail is
// ceremony. Each failure test copies the checked files into a temp dir,
// mutates exactly one invariant, and asserts exit 1 with a message naming
// the broken check.

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { cpSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const here = dirname(fileURLToPath(import.meta.url))
const script = join(here, 'check-invariants.mjs')
const repoRoot = join(here, '..', '..', '..')

const FILES = [
  'plugins/flow/skills/epic/SKILL.md',
  'plugins/flow/skills/ticket/SKILL.md',
  'plugins/flow/skills/quick/SKILL.md',
  'plugins/flow/skills/run/SKILL.md',
  'plugins/flow/skills/retro/SKILL.md',
  'plugins/flow/agents/ticket-reviewer.md',
  'plugins/flow/scripts/tickets.mjs',
  'plugins/flow/hooks/ticket-session-guard.mjs',
  'plugins/flow/workflows/run-epic.mjs',
  'plugins/flow/skills/review/SKILL.md',
  'README.md',
  'CLAUDE.md',
  'METHODOLOGY.md',
]

function copyRepo() {
  const root = mkdtempSync(join(tmpdir(), 'flow-invariants-'))
  for (const f of FILES) {
    mkdirSync(join(root, dirname(f)), { recursive: true })
    cpSync(join(repoRoot, f), join(root, f))
  }
  return root
}

function run(root) {
  try {
    return { status: 0, out: execFileSync('node', [script, root], { encoding: 'utf8' }) }
  } catch (e) {
    return { status: e.status, out: `${e.stdout ?? ''}${e.stderr ?? ''}` }
  }
}

function mutate(root, rel, replace, replacement) {
  const path = join(root, rel)
  const text = readFileSync(path, 'utf8')
  assert.ok(text.includes(replace), `mutation target not found in ${rel}: "${replace}"`)
  writeFileSync(path, text.replaceAll(replace, replacement))
}

test('the intact repo passes every check', () => {
  const r = run(copyRepo())
  assert.equal(r.status, 0, r.out)
})

test('a drifted status-log preamble copy fails', () => {
  const root = copyRepo()
  mutate(root, 'plugins/flow/skills/quick/SKILL.md', 'Report counts, not adjectives', 'Report vibes, not adjectives')
  const r = run(root)
  assert.equal(r.status, 1, r.out)
  assert.match(r.out, /preamble drifted/)
})

test("a drifted run-log Rules block fails against the status log's", () => {
  const root = copyRepo()
  mutate(root, 'plugins/flow/skills/run/SKILL.md', 'Report counts, not adjectives', 'Report vibes, not adjectives')
  const r = run(root)
  assert.equal(r.status, 1, r.out)
  assert.match(r.out, /run log's Rules block/)
})

test('a document that sends the run record back to status.md fails the coupling', () => {
  const root = copyRepo()
  mutate(root, 'plugins/flow/skills/retro/SKILL.md', 'runs.md', 'status.md')
  const r = run(root)
  assert.equal(r.status, 1, r.out)
  assert.match(r.out, /doctrine phrase missing/)
})

test('a risk trigger removed from one door fails', () => {
  const root = copyRepo()
  mutate(root, 'plugins/flow/skills/quick/SKILL.md', '- anything that can fail open\n', '')
  const r = run(root)
  assert.equal(r.status, 1, r.out)
  assert.match(r.out, /fail open/)
})

test('a new quick-lane risk bullet unknown to the canonical set fails', () => {
  const root = copyRepo()
  mutate(
    root,
    'plugins/flow/skills/quick/SKILL.md',
    '- anything that can fail open',
    '- anything that can fail open\n- telemetry sampling changes',
  )
  const r = run(root)
  assert.equal(r.status, 1, r.out)
  assert.match(r.out, /matches no known trigger/)
})

test('a reshaped status-entry template fails against the parser regex', () => {
  const root = copyRepo()
  mutate(
    root,
    'plugins/flow/skills/ticket/SKILL.md',
    '### <ID> — <name> — <YYYY-MM-DD> — DONE',
    '### <ID>: <name> (<YYYY-MM-DD>) DONE',
  )
  const r = run(root)
  assert.equal(r.status, 1, r.out)
  assert.match(r.out, /template/)
})

test('a changed hook refusal message fails', () => {
  const root = copyRepo()
  mutate(
    root,
    'plugins/flow/hooks/ticket-session-guard.mjs',
    '(an interactive ticket or a quick ticket ran here)',
    '(mutated)',
  )
  const r = run(root)
  assert.equal(r.status, 1, r.out)
  assert.match(r.out, /refusal/)
})

test('a dropped doctrine phrase fails', () => {
  const root = copyRepo()
  mutate(root, 'plugins/flow/skills/run/SKILL.md', 'A driver spawned you', 'You were spawned')
  const r = run(root)
  assert.equal(r.status, 1, r.out)
  assert.match(r.out, /doctrine phrase missing/)
})

test('a lane that renames the deviation opener fails', () => {
  // `**Deviation:**` is the exact label the parser reads. A lane that teaches
  // any other word produces entries that parse as nothing — and doctor's
  // near-miss scan covers a deviation-shaped slip like `**Deviations:**`, not
  // a rename to an unrelated label, so without this phrase nothing catches it:
  // every suite stays green while the epic's whole mechanism goes silent.
  const root = copyRepo()
  mutate(root, 'plugins/flow/skills/quick/SKILL.md', '**Deviation:**', '**Departure:**')
  const r = run(root)
  assert.equal(r.status, 1, r.out)
  assert.match(r.out, /doctrine phrase missing/)
})

test('a lane that stops teaching the deviation closing line fails', () => {
  // The label is one rule in four documents: both lanes that write a status
  // entry teach it, the script parses it, README accounts for it. A lane that
  // drops it sends the next departure back into Decisions prose, which no
  // command reads — the failure the field exists to end.
  const root = copyRepo()
  mutate(root, 'plugins/flow/skills/quick/SKILL.md', '**Deviations closed:**', '**Deviation settled:**')
  const r = run(root)
  assert.equal(r.status, 1, r.out)
  assert.match(r.out, /doctrine phrase missing/)
})

test("either document losing step 10's second refusal fails", () => {
  // The ticket skill refuses an unclosed deviation at the integration merge;
  // the run skill's "Resuming after a halt" tells the session finishing a
  // halted ticket what step 10 will refuse. While that inventory named only
  // the unfixed Important finding it read as permission to route around the
  // other refusal — a document that is correct alone and wrong beside its
  // pair, which is the drift this ledger exists to catch.
  const ticket = copyRepo()
  mutate(ticket, 'plugins/flow/skills/ticket/SKILL.md', 'unclosed deviation', 'open departure')
  const t = run(ticket)
  assert.equal(t.status, 1, t.out)
  assert.match(t.out, /ticket\/SKILL\.md.*second refusal/s)

  const runSkill = copyRepo()
  mutate(runSkill, 'plugins/flow/skills/run/SKILL.md', 'unclosed deviation', 'open departure')
  const r = run(runSkill)
  assert.equal(r.status, 1, r.out)
  assert.match(r.out, /run\/SKILL\.md.*second refusal/s)
})

test('either lane that stops naming a deviation in the pull request body fails', () => {
  // The attended doors are one rule in two lanes: the ticket lane's step 9
  // writes the body for an incremental pull request, the quick lane's step 7
  // for its own — and in the quick lane that body is a departure's only door,
  // since nothing there merges for an agent to refuse. A lane that drops the
  // sentence still parses and still logs; it just stops telling the person who
  // merges, which is the failure the whole line exists to end. Flipped at both
  // doors, because a phrase held at one of two is held nowhere.
  const quick = copyRepo()
  mutate(quick, 'plugins/flow/skills/quick/SKILL.md', 'a deviation is named in the pull request body', 'departures are listed somewhere')
  const q = run(quick)
  assert.equal(q.status, 1, q.out)
  assert.match(q.out, /quick\/SKILL\.md.*attended doors/s)

  const ticket = copyRepo()
  mutate(ticket, 'plugins/flow/skills/ticket/SKILL.md', 'a deviation is named in the pull request body', 'departures are listed somewhere')
  const t = run(ticket)
  assert.equal(t.status, 1, t.out)
  assert.match(t.out, /ticket\/SKILL\.md.*attended doors/s)
})

test('the workflow script losing the driver handshake fails', () => {
  const root = copyRepo()
  mutate(root, 'plugins/flow/workflows/run-epic.mjs', 'A driver spawned you', 'You were spawned')
  const r = run(root)
  assert.equal(r.status, 1, r.out)
  assert.match(r.out, /run-epic\.mjs.*driver handshake/s)
})

test('a reviewer document dropping the introduced-regression rule fails', () => {
  const root = copyRepo()
  mutate(root, 'plugins/flow/skills/review/SKILL.md', 'scope limits what the worker builds, not what the reviewer reports', 'scope limits the review')
  const r = run(root)
  assert.equal(r.status, 1, r.out)
  assert.match(r.out, /review\/SKILL\.md.*regression the change introduced/s)
})

test('a lane dropping the revert check fails', () => {
  const root = copyRepo()
  mutate(root, 'plugins/flow/skills/quick/SKILL.md', 'fails with the source change reverted', 'fails without the change')
  const r = run(root)
  assert.equal(r.status, 1, r.out)
  assert.match(r.out, /quick\/SKILL\.md.*revert check/s)
})

test('the workflow script losing the merge-direction rule fails', () => {
  const root = copyRepo()
  mutate(root, 'plugins/flow/workflows/run-epic.mjs', 'toward the default branch', 'toward main')
  const r = run(root)
  assert.equal(r.status, 1, r.out)
  assert.match(r.out, /run-epic\.mjs.*merge-direction/s)
})

test('the workflow script losing the acceptance-check stop condition fails', () => {
  const root = copyRepo()
  mutate(root, 'plugins/flow/workflows/run-epic.mjs', 'a failed acceptance CHECK', 'a failed acceptance TEST')
  const r = run(root)
  assert.equal(r.status, 1, r.out)
  assert.match(r.out, /run-epic\.mjs.*acceptance-check stop condition/s)
})

test('the run skill drifting from the fix-bounds stop condition fails', () => {
  const root = copyRepo()
  mutate(root, 'plugins/flow/skills/run/SKILL.md', 'no usable fix-diff facts', 'no usable fix-diff numbers')
  const r = run(root)
  assert.equal(r.status, 1, r.out)
  assert.match(r.out, /run\/SKILL\.md.*fix-bounds stop condition/s)
  // The sentence is pinned whole: its tail clause — what the condition no
  // longer covers now that a bounds trip buys a re-review — drifts as loudly
  // as its opening.
  const tail = copyRepo()
  // The skill wraps the sentence mid-clause, so the mutation target stops at
  // the wrap; the checker matches across it because it normalises whitespace.
  mutate(tail, 'plugins/flow/skills/run/SKILL.md', 'unmeasurable fix is never merged', 'unbounded fix is never merged')
  const t = run(tail)
  assert.equal(t.status, 1, t.out)
  assert.match(t.out, /run\/SKILL\.md.*fix-bounds stop condition/s)
})

test('either document dropping the never-resume-by-id rule fails', () => {
  // The rule lives at two doors: the run skill, where a human meets the halt,
  // and METHODOLOGY, which says why the cache makes a resume a lie. Losing
  // either half is drift.
  const skill = copyRepo()
  mutate(skill, 'plugins/flow/skills/run/SKILL.md', 'Never `resumeFromRunId`', 'Never resume by run id')
  const s = run(skill)
  assert.equal(s.status, 1, s.out)
  assert.match(s.out, /run\/SKILL\.md.*never-resume-by-id/s)

  const methodology = copyRepo()
  mutate(methodology, 'METHODOLOGY.md', 'never\n`resumeFromRunId`', 'never by run id')
  const m = run(methodology)
  assert.equal(m.status, 1, m.out)
  assert.match(m.out, /METHODOLOGY\.md.*never-resume-by-id/s)
})

test('a skill dropping the CHECK/EXPECT format fails the coupling', () => {
  const root = copyRepo()
  // mutate() replaces every occurrence, so the whole format vanishes from the
  // planning skill — template line and prose rule alike.
  mutate(root, 'plugins/flow/skills/epic/SKILL.md', 'CHECK: ', 'VERIFY: ')
  const r = run(root)
  assert.equal(r.status, 1, r.out)
  assert.match(r.out, /epic\/SKILL\.md.*machine-runnable acceptance criteria/s)
})
