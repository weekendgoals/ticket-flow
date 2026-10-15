import { existsSync } from 'node:fs'
import { join } from 'node:path'

export const COPILOT_REVIEWER_LOGIN = 'copilot-pull-request-reviewer[bot]'
export const CODERABBIT_LOGIN = 'coderabbitai[bot]'
export const CODERABBIT_CONFIG_FILES = ['.coderabbit.yaml', '.coderabbit.yml']
export const BOTS = {
  copilot: { login: COPILOT_REVIEWER_LOGIN },
  coderabbit: { login: CODERABBIT_LOGIN },
}

export function configuredBot(repositoryRoot) {
  return CODERABBIT_CONFIG_FILES.some((file) => existsSync(join(repositoryRoot, file))) ? 'coderabbit' : 'copilot'
}

export function copilotUnavailable(error) {
  return error.httpStatus === 422 || error.httpStatus === 404 || /copilot/i.test(error.stderr || '')
}

export function sameLogin(a, b) {
  const plain = (login) => String(login || '').toLowerCase().replace(/\[bot\]$/, '')
  return plain(a) === plain(b)
}

export function botReview(reviews, bot, headSha = null) {
  const login = BOTS[bot].login
  const mine = reviews.filter((review) => sameLogin(review.author, login) && review.state !== 'PENDING')
  const current = headSha ? mine.filter((review) => review.commit === headSha) : mine
  return current.length ? current[current.length - 1] : null
}

export function summarizeChecks(checks) {
  const by = (...buckets) => checks.filter((check) => buckets.includes(check.bucket))
  return {
    pending: by('pending').length,
    failing: by('fail', 'cancel'),
    passing: by('pass').length,
    skipped: by('skipping').length,
    checks,
  }
}

export function sleepSeconds(seconds) {
  if (seconds > 0) Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, seconds * 1000)
}
