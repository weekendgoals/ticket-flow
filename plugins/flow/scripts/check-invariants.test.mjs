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
  'plugins/flow/agents/plan-reviewer.md',
  'plugins/flow/scripts/tickets.mjs',
  'plugins/flow/.claude-plugin/plugin.json',
  'CHANGELOG.md',
  'plugins/flow/scripts/meter.mjs',
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

test('a run-record template that drops a ledger unit fails at every door that carries it', () => {
  // The units are the wall between the ledgers: `spend` reads a bare
  // `<ID> worker=<n>` group as tokens wherever it sits, so a template that
  // dropped the `s` or the `r` would pour durations, or a read count several
  // times a ticket's size, into the token ledger. One shape in four files.
  for (const [file, phrase] of [
    ['plugins/flow/skills/run/SKILL.md', 'worker=<n>r reviewer=<n>r'],
    ['README.md', 'worker=<n>r reviewer=<n>r'],
    ['plugins/flow/scripts/tickets.mjs', 'worker=<n>r reviewer=<n>r'],
    ['plugins/flow/scripts/meter.mjs', 'worker=<n>r reviewer=<n>r'],
  ]) {
    const root = copyRepo()
    mutate(root, file, phrase, 'worker=<n> reviewer=<n>')
    const r = run(root)
    assert.equal(r.status, 1, `${file}: ${r.out}`)
    assert.match(r.out, /doctrine phrase missing/)
  }
})

test('a run-record template that drifts the Models groups to prose fails', () => {
  // Nothing else in a record observes which model ran a role: the reviewer's
  // model left the Tokens line's prose when this line arrived, so a document
  // that drops the groups leaves the ledger with no model at all.
  for (const file of ['plugins/flow/skills/run/SKILL.md', 'README.md', 'plugins/flow/scripts/tickets.mjs', 'plugins/flow/scripts/meter.mjs']) {
    const root = copyRepo()
    mutate(root, file, 'worker=<name> reviewer=<name>', 'the model each role ran on')
    const r = run(root)
    assert.equal(r.status, 1, `${file}: ${r.out}`)
    assert.match(r.out, /doctrine phrase missing/)
  }
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

test('any of the three documents dropping "cleared by the repair it names" fails', () => {
  // The parser emits the notes, the ticket lane teaches the lines that earn
  // them, and README documents both ledgers. A document that keeps the old
  // story — that naming any item of the entry clears a faulty reference's note
  // — sends a human to a repair that leaves the warning standing, and an
  // append-only log cannot take the wrong line back.
  // Every occurrence in the mutated file goes: a document that keeps one copy
  // of the phrase still carries the rule, so dropping one sentence of several
  // is not the drift this entry is for.
  for (const file of ['plugins/flow/skills/ticket/SKILL.md', 'README.md', 'plugins/flow/scripts/tickets.mjs']) {
    const root = copyRepo()
    mutate(root, file, 'cleared by the repair it names', 'reported until someone reads it')
    const r = run(root)
    assert.equal(r.status, 1, `${file}: ${r.out}`)
    assert.match(r.out, /doctrine phrase missing/)
  }
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

test('either document dropping the acceptance condition\'s COMPARE clause fails', () => {
  // The sentence is pinned whole for the reason its siblings are: a copy that
  // kept only the CHECK clauses would describe a gate that lets a comparison
  // nobody performed through, and a retro reading the stop string would file
  // the halt as a failing test.
  for (const file of ['plugins/flow/workflows/run-epic.mjs', 'plugins/flow/skills/run/SKILL.md']) {
    const root = copyRepo()
    mutate(root, file, 'a COMPARE criterion whose pushed entry records no comparison, ', '')
    const r = run(root)
    assert.equal(r.status, 1, r.out)
    assert.match(r.out, /acceptance-check stop condition/s, file)
  }
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

test('the run skill losing the merge-conflict stop condition fails', () => {
  // Deleted once for real: an edit adding a bullet beside it replaced it
  // instead, while `STOP.mergeConflict` stayed live at three call sites — so
  // a halt quoted a string the skill's list no longer carried.
  const skill = copyRepo()
  mutate(skill, 'plugins/flow/skills/run/SKILL.md', '- on **a merge conflict — refreshing the epic branch, or anywhere else,\n  including a ticket branch that will not merge into the epic branch**;\n', '')
  const s = run(skill)
  assert.equal(s.status, 1, s.out)
  assert.match(s.out, /run\/SKILL\.md.*merge-conflict stop condition/s)
})

test('the workflow script losing the deviation stop condition fails', () => {
  const root = copyRepo()
  mutate(root, 'plugins/flow/workflows/run-epic.mjs', 'a recorded deviation — the ticket', 'a recorded departure — the ticket')
  const r = run(root)
  assert.equal(r.status, 1, r.out)
  assert.match(r.out, /run-epic\.mjs.*deviation stop condition/s)
})

test('the run skill drifting from the deviation stop condition fails, including its "closed or not" clause', () => {
  const root = copyRepo()
  mutate(root, 'plugins/flow/skills/run/SKILL.md', 'the run asks rather than records', 'the run records rather than asks')
  const r = run(root)
  assert.equal(r.status, 1, r.out)
  assert.match(r.out, /run\/SKILL\.md.*deviation stop condition/s)
  // Pinned whole: "closed or not" is the clause that makes this gate differ
  // from the attended one, and a copy that softened it would describe a gate
  // honouring a closing line this one ignores — the fail-open the halt exists
  // to prevent. The skill wraps the sentence, so the mutation target stops at
  // the wrap; the checker matches across it because it normalises whitespace.
  const clause = copyRepo()
  mutate(clause, 'plugins/flow/skills/run/SKILL.md', '`**Deviation:**` line, closed or not, because nobody present in an', '`**Deviation:**` line no human has closed, because nobody present in an')
  const c = run(clause)
  assert.equal(c.status, 1, c.out)
  assert.match(c.out, /run\/SKILL\.md.*deviation stop condition/s)
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

test('a reshaped COMPARE template fails against the parser regex', () => {
  // A template the parser rejects is worse than a missing one: the criterion
  // is written, never parsed, never listed in the ledger, and the comparison
  // it exists for is performed by nobody.
  const root = copyRepo()
  mutate(root, 'plugins/flow/skills/epic/SKILL.md', '  COMPARE: <design source path', '  Compare <design source path')
  const r = run(root)
  assert.equal(r.status, 1, r.out)
  assert.match(r.out, /COMPARE criterion template/)
})

test('a reshaped LANDMARKS template fails the same way', () => {
  const root = copyRepo()
  mutate(root, 'plugins/flow/skills/epic/SKILL.md', '  LANDMARKS: <name>[, <name>]', '  LANDMARKS <name>[, <name>]')
  const r = run(root)
  assert.equal(r.status, 1, r.out)
  assert.match(r.out, /LANDMARKS criterion template/)
})

test('an execution lane that teaches the comparison without --removed-from fails', () => {
  const root = copyRepo()
  mutate(root, 'plugins/flow/skills/quick/SKILL.md', '--removed-from', '--removed')
  const r = run(root)
  assert.equal(r.status, 1, r.out)
  assert.match(r.out, /quick\/SKILL\.md.*--removed-from/s)
})

test('an execution lane that teaches the comparison without --source fails', () => {
  // A scoped design map refuses a run that does not say which source it is of.
  const root = copyRepo()
  mutate(root, 'plugins/flow/skills/ticket/SKILL.md', '--source', '--src')
  const r = run(root)
  assert.equal(r.status, 1, r.out)
  assert.match(r.out, /ticket\/SKILL\.md.*--source/s)
})

test('a document dropping the COMPARE criterion fails the coupling', () => {
  const root = copyRepo()
  mutate(root, 'plugins/flow/skills/quick/SKILL.md', 'COMPARE', 'COMPARISON')
  const r = run(root)
  assert.equal(r.status, 1, r.out)
  assert.match(r.out, /quick\/SKILL\.md.*one format in four documents/s)
})

test('the plan reviewer gaining a write instruction fails the never-fix check', () => {
  // Until this entry covered it, the one rule CLAUDE.md states about both
  // reviewer definitions was verified in only one of them — and the file it
  // skipped is the one a design-fidelity ticket was about to edit.
  const root = copyRepo()
  mutate(root, 'plugins/flow/agents/plan-reviewer.md', 'You **report. You never rewrite the plan.**', 'You report and fix the plan.')
  const r = run(root)
  assert.equal(r.status, 1, r.out)
  assert.match(r.out, /plan-reviewer\.md.*report and never fix/s)
})

test('a reviewer document dropping either design lens fails', () => {
  // Both lenses are one rule in three documents — the reviewer definition, the
  // review skill and the driver's inlined rules (the Codex runner's copy is
  // pinned to the driver's by codex-review.test.mjs). A document that keeps
  // only some of them hands a reviewer a design and no question to ask of it.
  for (const [file, phrase] of [
    ['plugins/flow/agents/ticket-reviewer.md', 'paints something else'],
    ['plugins/flow/skills/review/SKILL.md', 'paints something else'],
    ['plugins/flow/workflows/run-epic.mjs', 'paints something else'],
    ['plugins/flow/agents/ticket-reviewer.md', "in the ticket's own diff"],
    ['plugins/flow/skills/review/SKILL.md', "in the ticket's own diff"],
    ['plugins/flow/workflows/run-epic.mjs', "in the ticket's own diff"],
  ]) {
    const root = copyRepo()
    mutate(root, file, phrase, 'somewhere else entirely')
    const r = run(root)
    assert.equal(r.status, 1, `${file} / ${phrase}: ${r.out}`)
    assert.match(r.out, /doctrine phrase missing/)
  }
})

test('retro lenses: a reviewer document dropping the fixture question fails', () => {
  // One question in three documents: what input would make this test fail,
  // and does the fixture contain it? Nine specs in one live epic passed with
  // the behaviour they named deleted.
  for (const file of ['plugins/flow/agents/ticket-reviewer.md', 'plugins/flow/skills/review/SKILL.md', 'plugins/flow/workflows/run-epic.mjs']) {
    const root = copyRepo()
    mutate(root, file, 'does the fixture contain it', 'is the fixture tidy')
    const r = run(root)
    assert.equal(r.status, 1, `${file}: ${r.out}`)
    assert.match(r.out, /fixture lens/)
  }
})

test('retro lenses: the render-and-read ticket planned by the epic skill and unchecked by the plan reviewer — or the reverse — fails', () => {
  for (const file of ['plugins/flow/skills/epic/SKILL.md', 'plugins/flow/agents/plan-reviewer.md']) {
    const root = copyRepo()
    const path = join(root, file)
    writeFileSync(path, readFileSync(path, 'utf8').replaceAll('render-and-read', 'look-over'))
    const r = run(root)
    assert.equal(r.status, 1, `${file}: ${r.out}`)
    assert.match(r.out, /render-and-read/)
  }
})

// ── releases: the version moves when the batch is stamped ────────────────────
// Nothing here names a version: the fixtures are built from whatever release
// the repository is at, so stamping the next one cannot break its own checker.
const CURRENT = JSON.parse(readFileSync(join(repoRoot, 'plugins/flow/.claude-plugin/plugin.json'), 'utf8')).version
const [MAJOR] = CURRENT.split('.').map(Number)
const NEXT = `${MAJOR + 1}.0.0`
const OLDER = `${MAJOR - 1}.0.0`
const CURRENT_HEADING = readFileSync(join(repoRoot, 'CHANGELOG.md'), 'utf8').match(new RegExp(`^## ${CURRENT.replace(/\./g, '\\.')} — \\d{4}-\\d{2}-\\d{2}$`, 'm'))[0]
const re = v => v.replace(/\./g, '\\.')

test('release: a version that is not the newest stamped heading fails, in either direction', () => {
  const bumped = copyRepo()
  mutate(bumped, 'plugins/flow/.claude-plugin/plugin.json', `"version": "${CURRENT}"`, `"version": "${NEXT}"`)
  const b = run(bumped)
  assert.equal(b.status, 1, b.out)
  assert.match(b.out, new RegExp(`says ${re(NEXT)} and the newest stamped release .* is ${re(CURRENT)}`))
  const stamped = copyRepo()
  mutate(stamped, 'CHANGELOG.md', CURRENT_HEADING, `## ${NEXT} — 2099-01-01\n\n${CURRENT_HEADING}`)
  assert.match(run(stamped).out, new RegExp(`says ${re(CURRENT)} and the newest stamped release .* is ${re(NEXT)}`))
})

test('release: a backlog past the ceiling fails and says how to stamp it; a malformed or misordered heading fails', () => {
  // Unreleased is rarely empty on a working branch, so the fixture tops it up
  // to the ceiling rather than assuming it starts at zero.
  const log = readFileSync(join(repoRoot, 'CHANGELOG.md'), 'utf8')
  const at = log.search(/^## Unreleased$/m)
  const have = (log.slice(at, log.indexOf('\n## ', at + 1)).match(/^- \*\*/gm) || []).length
  const entries = (n) => `\n## Unreleased\n\n${Array.from({ length: n - have }, (_, i) => `- **Entry ${i}** (x).`).join('\n')}\n`
  const backlog = copyRepo()
  mutate(backlog, 'CHANGELOG.md', '\n## Unreleased\n', entries(31))
  const r = run(backlog)
  assert.equal(r.status, 1, r.out)
  assert.match(r.out, /31 entries under "## Unreleased" \(ceiling 30\) — stamp the batch in this pull request/)
  const atCeiling = copyRepo()
  mutate(atCeiling, 'CHANGELOG.md', '\n## Unreleased\n', entries(30))
  assert.equal(run(atCeiling).status, 0, 'thirty is allowed')
  const malformed = copyRepo()
  mutate(malformed, 'CHANGELOG.md', CURRENT_HEADING, `## v${CURRENT} (2099-01-01)`)
  assert.match(run(malformed).out, /release heading that is not/)
  const misordered = copyRepo()
  mutate(misordered, 'CHANGELOG.md', CURRENT_HEADING, `## ${OLDER} — 2099-01-01`)
  assert.match(run(misordered).out, /not newest-first/)
})

// ── parallel tickets: the Blocked by line is strict, and the checker holds it ─
test('blocked by: a parser gone tolerant fails, and so does a template the parser rejects', () => {
  // The removed dependency graph's failure coming back: prose accepted after
  // the IDs. A string-presence check would pass this; the regex run does not.
  const tolerant = copyRepo()
  mutate(tolerant, 'plugins/flow/scripts/tickets.mjs', '${TICKET_ID})*)[^\\\\S\\\\n]*$`)', '${TICKET_ID})*)`)')
  const t = run(tolerant)
  assert.equal(t.status, 1, t.out)
  assert.match(t.out, /accepts prose after the IDs/)
  const drifted = copyRepo()
  mutate(drifted, 'plugins/flow/skills/epic/SKILL.md', '**Blocked by:** <ID>[, <ID>]\n\n**Scope.**', '**Blocked by:** <ID> and <ID>\n\n**Scope.**')
  const d = run(drifted)
  assert.equal(d.status, 1, d.out)
  assert.match(d.out, /Blocked by/)
})

test('parallel: the plan reviewer losing the independence lens fails — a planner told and a reviewer not is a wave nobody checked', () => {
  const root = copyRepo()
  mutate(root, 'plugins/flow/agents/plan-reviewer.md', 'declared independent', 'assumed unrelated')
  const r = run(root)
  assert.equal(r.status, 1, r.out)
  assert.match(r.out, /plan-reviewer\.md.*DECLARED INDEPENDENT/s)
})
