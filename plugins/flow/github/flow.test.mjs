import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const templatePath = join(dirname(fileURLToPath(import.meta.url)), 'flow.yml')
const text = readFileSync(templatePath, 'utf8')

function scalar(raw) {
  const value = raw.trim()
  if (value.startsWith('[') && value.endsWith(']'))
    return value
      .slice(1, -1)
      .split(',')
      .map((item) => scalar(item))
      .filter((item) => item !== '')
  if ((value.startsWith("'") && value.endsWith("'")) || (value.startsWith('"') && value.endsWith('"'))) return value.slice(1, -1)
  if (value === 'true' || value === 'false') return value === 'true'
  if (/^\d+$/.test(value)) return Number(value)
  return value
}

function parseYaml(source) {
  const lines = source
    .split('\n')
    .map((line) => ({ indent: line.length - line.trimStart().length, text: line.trim() }))
    .filter((line) => line.text && !line.text.startsWith('#'))
  let index = 0
  const blockScalar = (parentIndent) => {
    const collected = []
    while (index < lines.length && lines[index].indent > parentIndent) collected.push(lines[index++].text)
    return collected.join('\n')
  }
  const value = (rest, indent) => {
    if (rest === '|' || rest === '>-' || rest === '>') return blockScalar(indent)
    if (rest === '') return index < lines.length && lines[index].indent > indent ? block(lines[index].indent) : null
    return scalar(rest)
  }
  const mappingEntry = (target, entryText, indent) => {
    const at = entryText.indexOf(':')
    const key = entryText.slice(0, at).trim()
    target[key] = value(entryText.slice(at + 1).trim(), indent)
  }
  const block = (indent) => {
    if (lines[index].text.startsWith('- ')) {
      const list = []
      while (index < lines.length && lines[index].indent === indent && lines[index].text.startsWith('- ')) {
        const itemText = lines[index].text.slice(2)
        index++
        if (/^[\w.-]+:(\s|$)/.test(itemText)) {
          const item = {}
          mappingEntry(item, itemText, indent + 2)
          while (index < lines.length && lines[index].indent === indent + 2) {
            const line = lines[index++]
            mappingEntry(item, line.text, indent + 2)
          }
          list.push(item)
        } else list.push(scalar(itemText))
      }
      return list
    }
    const mapping = {}
    while (index < lines.length && lines[index].indent === indent) {
      const line = lines[index++]
      mappingEntry(mapping, line.text, indent)
    }
    return mapping
  }
  return block(0)
}

const workflow = parseYaml(text)
const step = (job, predicate) => workflow.jobs[job].steps.find(predicate)
const claudeStep = (job) => step(job, (entry) => String(entry.uses || '').startsWith('anthropics/claude-code-action@'))

test('the template listens for the label that starts a ticket, approval, a manual start, reviews and finished checks', () => {
  assert.deepEqual(workflow.on.issues.types, ['labeled'])
  assert.equal(workflow.on.workflow_dispatch.inputs.ticket.required, true)
  assert.deepEqual(workflow.on.pull_request_review.types, ['submitted'])
  assert.deepEqual(workflow.on.check_suite.types, ['completed'])
  assert.deepEqual(workflow.on.workflow_run.types, ['completed'])
  assert.match(workflow.jobs.ticket.if, /github\.event\.label\.name == 'flow:start'/)
  assert.match(workflow.jobs.ticket.if, /workflow_dispatch/)
  assert.match(workflow.jobs.route.if, /github\.event\.label\.name == 'flow:approved'/)
  assert.match(workflow.jobs.route.if, /github\.event\.label\.name == 'flow:start'/)
  assert.equal(workflow.jobs.epic.if, "always() && needs.route.outputs.epic != ''")
})

test('the permissions are the ones the steps need, and no more is assumed', () => {
  assert.deepEqual(workflow.permissions, { contents: 'write', issues: 'write', 'pull-requests': 'write', 'id-token': 'write', actions: 'read' })
})

test('merges into an epic branch are one at a time per epic, and building is not', () => {
  assert.equal(workflow.jobs.merge.concurrency.group, 'epic-${{ needs.ticket.outputs.epic }}')
  assert.equal(workflow.jobs.merge.concurrency['cancel-in-progress'], false)
  assert.match(workflow.jobs.epic.concurrency.group, /^epic-\$\{\{/)
  assert.match(workflow.jobs.ticket.concurrency.group, /^ticket-/, 'only the same ticket waits for itself')
  assert.equal(workflow.jobs.merge.needs, 'ticket')
  assert.match(step('merge', (entry) => /merge the accepted/.test(entry.name || '')).run, /\$FLOW merge --epic "\$EPIC"[\s\S]*\$FLOW check-epic "\$EPIC" --tickets "\$merged" --mark/)
})

test('the ticket job installs the plugin from this marketplace and runs the ticket skill unattended on the tier\'s model', () => {
  const claude = claudeStep('ticket')
  assert.equal(claude.uses, 'anthropics/claude-code-action@v1')
  assert.equal(claude.with.plugin_marketplaces, 'https://github.com/weekendgoals/ticket-flow.git')
  assert.equal(claude.with.plugins, 'flow@ticket-flow')
  assert.equal(claude.with.prompt, '/flow:ticket #${{ env.TICKET }} --unattended --no-merge')
  assert.match(claude.with.claude_args, /^--model \$\{\{ steps\.read\.outputs\.model \}\} --allowedTools "[^"]*Bash[^"]*Skill[^"]*"/)
  assert.equal(claude.with.anthropic_api_key, '${{ secrets.ANTHROPIC_API_KEY }}')
  assert.equal(claude.env.FLOW_UNATTENDED, '1')
  assert.match(text, /# claude_code_oauth_token: \$\{\{ secrets\.CLAUDE_CODE_OAUTH_TOKEN \}\}/)
  assert.match(step('ticket', (entry) => entry.id === 'read').run, /jq -r '\.model'/)
})

test('the ticket job meters the run, keeps the screenshots, and resets a run that died', () => {
  assert.match(step('ticket', (entry) => /cost/.test(entry.name || '')).run, /\$FLOW meter "\$TICKET" --transcripts "\$\{\{ steps\.claude\.outputs\.execution_file \}\}"/)
  const upload = step('ticket', (entry) => String(entry.uses || '').startsWith('actions/upload-artifact@'))
  assert.equal(upload.with.path, '.flow/screenshots/')
  const recovery = step('ticket', (entry) => /reset/.test(entry.name || ''))
  assert.equal(recovery.if, 'always()')
  assert.match(recovery.run, /\$FLOW reset "\$TICKET" --once/)
})

test('the scheduler never runs Claude, labels with FLOW_TOKEN so the label starts the ticket job, and opens the release pull request when built', () => {
  assert.ok(!workflow.jobs.epic.steps.some((entry) => String(entry.uses || '').startsWith('anthropics/')))
  assert.equal(workflow.jobs.epic.env.GH_TOKEN, '${{ secrets.FLOW_TOKEN }}')
  assert.match(text, /^# Events made with the default GITHUB_TOKEN start no other workflow, so the scheduler labels tickets with FLOW_TOKEN/m)
  const run = step('epic', (entry) => entry.run && /dispatch/.test(entry.run)).run
  assert.match(run, /\$FLOW dispatch "\$EPIC"/)
  assert.match(run, /\$FLOW check-epic "\$EPIC" --mark \|\| exit 1\n\s*opened="\$\(\$FLOW release-pr "\$EPIC"\)" \|\| exit 1\n/, 'a failed check fails the step and opens nothing, whatever shell options a copy runs with')
  assert.doesNotMatch(run, /check-epic[^\n]*&&/, 'under bash -e a failed member of an && list does not fail the step')
  assert.match(run, /\$FLOW pr-review-request "\$pr"/)
})

test('the pull request job answers reviews and failed checks on ticket and epic branches through the ticket skill\'s loop', () => {
  assert.match(workflow.jobs.pr.if, /startsWith\(github\.event\.pull_request\.head\.ref, 'ticket\/'\)/)
  assert.match(workflow.jobs.pr.if, /startsWith\(github\.event\.check_suite\.head_branch, 'epic\/'\)/)
  assert.equal(claudeStep('pr').with.prompt, '/flow:ticket --pr-loop ${{ env.PR }} --unattended')
  assert.match(workflow.jobs.pr.concurrency.group, /^pr-/)
  const gate = step('pr', (entry) => entry.id === 'gate')
  assert.match(gate.run, /ticket\/\*\) state="\$\(\$FLOW ticket "\$\{HEAD#ticket\/\}" \| jq -r '\.state'\)"; \[ "\$state" = "done" \] \|\| echo "skip=true"/)
  assert.equal(claudeStep('pr').if, "steps.gate.outputs.skip != 'true'", 'the ticket job runs its own pull request loop; a second session on the same pull request would race it')
})

test('nothing in the template merges into the default branch', () => {
  assert.doesNotMatch(text, /gh pr merge|git push[^\n]*\b(main|master)\b|--base main/)
})

test('the epic comes from the event before any job runs, so one epic has one scheduler group whatever the ticket job did', () => {
  const find = workflow.jobs.route.steps.find((entry) => entry.id === 'find')
  assert.match(find.run, /if \[ "\$APPROVED" = "true" \]; then epic="\$ISSUE"/)
  assert.match(find.run, /jq -r '\.issue\.body \/\/ ""' "\$GITHUB_EVENT_PATH" \| tr -d '\\r' \| sed -n 's\/\^Epic: #/)
  assert.ok(!workflow.jobs.route.steps.some((entry) => entry.uses), 'it needs no checkout, so nothing it depends on can fail first')
  assert.deepEqual(workflow.jobs.epic.needs, ['route', 'ticket', 'merge'])
  assert.equal(workflow.jobs.epic.concurrency.group, 'epic-${{ needs.route.outputs.epic }}')
  assert.equal(workflow.jobs.merge.concurrency.group, 'epic-${{ needs.ticket.outputs.epic }}', 'the merge job shares the epic\'s group')
  assert.equal(workflow.jobs.epic.env.EPIC, '${{ needs.route.outputs.epic }}')
  assert.match(text, /# execution_file is the output anthropics\/claude-code-action@v1 documents/)
})

test('a ticket job that failed before its own recovery step has its start request withdrawn by the scheduler, and only then', () => {
  const recover = step('ticket', (entry) => entry.id === 'recover')
  assert.match(recover.run, /^\[ -f \.flow-plugin\/plugins\/flow\/scripts\/flow\.mjs \] \|\| exit 0\n\$FLOW reset "\$TICKET" --once \|\| true\necho "ran=true" >> "\$GITHUB_OUTPUT"$/)
  assert.equal(workflow.jobs.ticket.outputs.recovered, '${{ steps.recover.outputs.ran }}')
  const withdraw = step('epic', (entry) => /withdraw/.test(entry.name || ''))
  assert.equal(withdraw.if, "github.event.label.name == 'flow:start' && (needs.ticket.result == 'failure' || needs.ticket.result == 'cancelled') && needs.ticket.outputs.recovered != 'true'")
  assert.equal(withdraw.env.TICKET, '${{ github.event.issue.number }}')
  assert.equal(withdraw.run, '$FLOW reset "$TICKET" --once || true')
  const steps = workflow.jobs.epic.steps
  assert.ok(steps.indexOf(withdraw) < steps.findIndex((entry) => entry.run && /dispatch/.test(entry.run)), 'withdrawn before dispatch counts the busy tickets')
})

test('every job runs as one named account: github-actions[bot] without FLOW_TOKEN, otherwise the FLOW_ACCOUNT variable or what GitHub says', () => {
  assert.equal(workflow.env.FLOW_ACCOUNT, "${{ vars.FLOW_ACCOUNT || (secrets.FLOW_TOKEN == '' && 'github-actions[bot]' || '') }}")
  assert.ok(Object.values(workflow.jobs).every((job) => !job.env || !('FLOW_ACCOUNT' in job.env)), 'no job overrides it')
})
