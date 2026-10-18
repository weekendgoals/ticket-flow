import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { parseYaml } from './workflow-yaml.mjs'

const templatePath = join(dirname(fileURLToPath(import.meta.url)), 'qa.yml')
const text = readFileSync(templatePath, 'utf8')
const workflow = parseYaml(text)
const steps = workflow.jobs.qa.steps
const claude = steps.find((entry) => String(entry.uses || '').startsWith('anthropics/claude-code-action@'))
const argumentLines = claude.with.claude_args.split('\n')

test('the walk runs every night and by hand, from the address a person gives or the QA_URL variable', () => {
  assert.deepEqual(Object.keys(workflow.on), ['schedule', 'workflow_dispatch'], 'no issue, push or pull request event starts a walk of the live site')
  assert.equal(workflow.on.schedule.length, 1)
  assert.match(workflow.on.schedule[0].cron, /^\d+ \d+ \* \* \*$/, 'once a day')
  assert.equal(workflow.on.workflow_dispatch.inputs.url.required, false)
  assert.equal(workflow.jobs.qa.env.QA_URL, '${{ inputs.url || vars.QA_URL }}')
  const refusal = steps.find((entry) => /refuse without an address/.test(entry.name || ''))
  assert.match(refusal.run, /\[ -n "\$QA_URL" \] \|\| \{ echo "[^"]+"; exit 1; \}/)
  assert.ok(steps.indexOf(refusal) < steps.indexOf(claude), 'refused before any Claude run is paid for')
  assert.equal(workflow.jobs.qa.concurrency.group, 'flow-qa', 'one walk at a time: two would file the same finding twice')
})

test('it files with FLOW_TOKEN, falls back to the Actions token, and trusts comments from one named account as flow.yml does', () => {
  assert.equal(workflow.jobs.qa.env.GH_TOKEN, '${{ secrets.FLOW_TOKEN || github.token }}')
  assert.equal(claude.env.GH_TOKEN, '${{ secrets.FLOW_TOKEN || github.token }}')
  assert.equal(claude.with.github_token, '${{ secrets.FLOW_TOKEN || github.token }}')
  assert.equal(steps[0].with.token, '${{ secrets.FLOW_TOKEN || github.token }}', 'the checkout pushes the screenshots to flow-findings with the same token')
  assert.equal(claude.with.anthropic_api_key, '${{ secrets.ANTHROPIC_API_KEY }}')
  assert.match(text, /# claude_code_oauth_token: \$\{\{ secrets\.CLAUDE_CODE_OAUTH_TOKEN \}\}/)
  const flowYml = parseYaml(readFileSync(join(dirname(templatePath), 'flow.yml'), 'utf8'))
  assert.equal(workflow.env.FLOW_ACCOUNT, flowYml.env.FLOW_ACCOUNT)
  assert.equal(workflow.env.FLOW_UNATTENDED, '1')
  assert.deepEqual(workflow.permissions, { contents: 'write', issues: 'write', 'id-token': 'write' }, 'no pull request permission: the walk files issues and opens nothing')
})

test('it runs the QA skill unattended from this marketplace, with the Playwright MCP server configured and allowed', () => {
  assert.equal(claude.uses, 'anthropics/claude-code-action@v1')
  assert.equal(claude.with.plugin_marketplaces, 'https://github.com/weekendgoals/ticket-flow.git')
  assert.equal(claude.with.plugins, 'flow@ticket-flow')
  assert.equal(claude.with.prompt, '/flow:qa ${{ env.QA_URL }} --unattended')
  assert.equal(claude.env.FLOW_UNATTENDED, '1')
  const mcpLine = argumentLines.find((line) => line.startsWith('--mcp-config '))
  const mcp = JSON.parse(mcpLine.replace(/^--mcp-config '/, '').replace(/'$/, ''))
  assert.deepEqual(Object.keys(mcp.mcpServers), ['playwright'], 'the explorer is given the server mcp__playwright')
  assert.equal(mcp.mcpServers.playwright.command, 'npx')
  assert.ok(mcp.mcpServers.playwright.args.includes('--headless'), 'a runner has no screen')
  assert.equal(mcp.mcpServers.playwright.args[mcp.mcpServers.playwright.args.indexOf('--output-dir') + 1], '/tmp/flow-qa')
  assert.match(mcp.mcpServers.playwright.args.find((arg) => arg.startsWith('@playwright/mcp@')), /^@playwright\/mcp@\d+\.\d+\.\d+$/, 'an exact version: a new release of the server is not a change nobody saw')
  const allowed = argumentLines.find((line) => line.startsWith('--allowedTools ')).match(/"([^"]*)"/)[1].split(',')
  for (const tool of ['Bash', 'Read', 'Agent', 'Skill', 'mcp__playwright']) assert.ok(allowed.includes(tool), tool)
  assert.ok(!allowed.some((tool) => tool.includes('*')), 'a permission rule names a whole MCP server by its bare name, with no wildcard')
  const explorer = readFileSync(join(dirname(templatePath), '..', 'agents', 'qa-explorer.md'), 'utf8')
  assert.match(explorer, /^tools: [^\n]*\bmcp__playwright(,|$)/m, 'the explorer gets the same server the template configures')
  assert.ok(!allowed.includes('Edit'), 'the walk changes no file of the project')
})

test('the screenshots the browser wrote are kept, and the comment says what the project installs', () => {
  const upload = steps.find((entry) => String(entry.uses || '').startsWith('actions/upload-artifact@'))
  assert.equal(upload.if, 'always()')
  assert.equal(upload.with.path, '/tmp/flow-qa/')
  assert.match(text, /^# Copy this file to \.github\/workflows\/flow-qa\.yml in your project, and set the repository variable QA_URL/m)
  assert.match(text, /^# Your project installs nothing for the browser: the Playwright MCP server configured below runs with npx/m)
  assert.match(text, /^# Secrets: ANTHROPIC_API_KEY [^\n]*FLOW_TOKEN/m)
  assert.match(text, /\/flow:epic --standing "Bugs"/)
})

test('nothing in the template approves, merges or pushes toward the default branch', () => {
  assert.doesNotMatch(text, /flow:approved|gh pr merge|git push|--base main|promote/)
})
