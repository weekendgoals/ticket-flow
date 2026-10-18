import { readFileSync, appendFileSync, writeFileSync, existsSync, chmodSync, mkdirSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'

const FLAGS_WITH_VALUES = new Set(['-X', '--method', '--input', '-f', '-F', '--field', '--raw-field', '-H', '--header', '--jq', '-q', '--template', '-t', '--hostname', '--cache'])
const FIELD_FLAGS = new Set(['-f', '-F', '--field', '--raw-field'])

export function fixtureKey(args, stdin = null) {
  if (args[0] !== 'api') return args.join(' ')
  let method = null
  let path = null
  const fields = []
  let hasInput = false
  for (let index = 1; index < args.length; index++) {
    const arg = args[index]
    if (FLAGS_WITH_VALUES.has(arg)) {
      const value = args[++index]
      if (arg === '-X' || arg === '--method') method = value.toUpperCase()
      if (arg === '--input') hasInput = true
      if (FIELD_FLAGS.has(arg)) fields.push(value)
    } else if (!arg.startsWith('-') && path === null) path = arg
  }
  if (path === 'graphql' && hasInput && stdin !== null) {
    const sent = JSON.parse(stdin).variables || {}
    const scalars = Object.entries(sent).filter(([, value]) => value !== null && typeof value !== 'object')
    return ['graphql', ...scalars.map(([name, value]) => `${name}=${value}`).sort()].join(' ')
  }
  if (path === 'graphql') {
    const variables = fields.filter((field) => !field.startsWith('query=')).sort()
    return ['graphql', ...variables].join(' ')
  }
  return `${method || (hasInput || fields.length ? 'POST' : 'GET')} ${path}`
}

export function installFakeGh(directory, { fixtures = {}, logFile = join(directory, 'gh-calls.jsonl') } = {}) {
  mkdirSync(directory, { recursive: true })
  const fixtureFile = join(directory, 'gh-fixtures.json')
  writeFileSync(fixtureFile, JSON.stringify(fixtures))
  const executable = join(directory, 'gh')
  const script = fileURLToPath(import.meta.url)
  writeFileSync(executable, `#!/bin/sh\nexec "${process.execPath}" "${script}" "$@"\n`)
  chmodSync(executable, 0o755)
  return {
    env: {
      PATH: `${directory}:${process.env.PATH}`,
      FAKE_GH_FIXTURES: fixtureFile,
      FAKE_GH_LOG: logFile,
    },
    setFixtures(next) {
      writeFileSync(fixtureFile, JSON.stringify(next))
    },
    calls() {
      if (!existsSync(logFile)) return []
      return readFileSync(logFile, 'utf8')
        .split('\n')
        .filter(Boolean)
        .map((line) => JSON.parse(line))
    },
    clearCalls() {
      writeFileSync(logFile, '')
    },
  }
}

function sequenceStep(response, key) {
  const isSequence = response !== null && typeof response === 'object' && !Array.isArray(response) && Array.isArray(response.$sequence)
  if (!isSequence) return response
  const earlier = readFileSync(process.env.FAKE_GH_LOG, 'utf8')
    .split('\n')
    .filter(Boolean)
    .filter((line) => JSON.parse(line).key === key).length
  return response.$sequence[Math.min(earlier - 1, response.$sequence.length - 1)]
}

function serve(args) {
  const usesStdin = args.includes('--input') && args[args.indexOf('--input') + 1] === '-'
  const stdin = usesStdin ? readFileSync(0, 'utf8') : null
  const key = fixtureKey(args, stdin)
  appendFileSync(process.env.FAKE_GH_LOG, `${JSON.stringify({ key, args, stdin, repo: process.env.GH_REPO || null })}\n`)
  const fixtures = JSON.parse(readFileSync(process.env.FAKE_GH_FIXTURES, 'utf8'))
  if (!(key in fixtures)) {
    process.stderr.write(`fake gh: no fixture for "${key}"\n`)
    process.exit(1)
  }
  const response = sequenceStep(fixtures[key], key)
  const isScripted = response !== null && typeof response === 'object' && !Array.isArray(response) && '$exit' in response
  const exitCode = isScripted ? response.$exit : 0
  const payload = isScripted ? response.$stdout : response
  if (isScripted && response.$stderr) process.stderr.write(`${response.$stderr}\n`)
  if (isScripted && typeof response.$raw === 'string') process.stdout.write(response.$raw)
  else if (payload !== undefined && payload !== null) {
    const slurped = args.includes('--slurp') ? [payload] : payload
    process.stdout.write(typeof slurped === 'string' ? slurped : JSON.stringify(slurped))
  }
  process.exit(exitCode)
}

if (process.argv[1] === fileURLToPath(import.meta.url)) serve(process.argv.slice(2))
