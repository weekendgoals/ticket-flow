import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { parseYaml } from './workflow-yaml.mjs'

const templatePath = join(dirname(fileURLToPath(import.meta.url)), 'report.yml')
const text = readFileSync(templatePath, 'utf8')
const workflow = parseYaml(text)
const job = workflow.jobs.report
const steps = job.steps
const usesStep = (name) => steps.find((entry) => String(entry.uses || '').startsWith(`${name}@`))

test('the page is rebuilt every day, by hand, and when an issue closes, and only an epic closing runs the job', () => {
  assert.deepEqual(Object.keys(workflow.on), ['schedule', 'workflow_dispatch', 'issues'])
  assert.match(workflow.on.schedule[0].cron, /^\d+ \d+ \* \* \*$/, 'once a day')
  assert.deepEqual(workflow.on.issues.types, ['closed'])
  assert.equal(job.if, "github.event_name != 'issues' || contains(github.event.issue.labels.*.name, 'flow:epic')", 'a closed ticket or finding publishes nothing')
})

test('the permissions are the Pages deployment and reading, no more', () => {
  assert.deepEqual(workflow.permissions, { contents: 'read', issues: 'read', 'pull-requests': 'read', pages: 'write', 'id-token': 'write' }, 'pull requests are read for whether the release merged')
  assert.equal(job.env.GH_TOKEN, '${{ secrets.FLOW_TOKEN || github.token }}')
  assert.equal(job.environment.name, 'github-pages')
})

test('it checks out with full history, gets the CLI from the marketplace as flow.yml does, and writes the page into site', () => {
  const [project, plugin] = steps.filter((entry) => String(entry.uses || '').startsWith('actions/checkout@'))
  assert.equal(project.with['fetch-depth'], 0, 'stats reads git: rework and escapes need every commit')
  const flowYml = parseYaml(readFileSync(join(dirname(templatePath), 'flow.yml'), 'utf8'))
  assert.equal(workflow.env.FLOW, flowYml.env.FLOW)
  assert.equal(workflow.env.FLOW_PLUGIN_REPOSITORY, flowYml.env.FLOW_PLUGIN_REPOSITORY)
  assert.deepEqual(plugin.with, { repository: '${{ env.FLOW_PLUGIN_REPOSITORY }}', ref: '${{ env.FLOW_PLUGIN_REF }}', path: '.flow-plugin' })
  assert.equal(steps.find((entry) => /report page/.test(entry.name || '')).run, '$FLOW report --out site')
})

test('it publishes with GitHub\'s own three Pages actions, each pinned by major version, in order', () => {
  const pages = ['actions/configure-pages', 'actions/upload-pages-artifact', 'actions/deploy-pages'].map(usesStep)
  for (const step of pages) assert.match(step.uses, /^actions\/[a-z-]+@v\d+$/)
  assert.ok(steps.indexOf(pages[0]) < steps.indexOf(pages[1]) && steps.indexOf(pages[1]) < steps.indexOf(pages[2]))
  assert.equal(pages[1].with.path, 'site')
  assert.ok(!steps.some((entry) => entry.uses && !String(entry.uses).startsWith('actions/')), 'no action from outside GitHub')
})

test('the header says what to copy and the one manual step, and nothing in it builds, labels or pushes', () => {
  assert.match(text, /^# Copy this file to \.github\/workflows\/flow-report\.yml in your project\. One manual step: Settings, Pages, Source: GitHub Actions\./m)
  assert.doesNotMatch(text, /anthropics\/|git push|flow:approved|gh pr|\$FLOW (label|merge|start|post)/)
})
