import { spawn } from 'node:child_process'

const GRACE_MS = 1000
const PARENT_POLL_MS = 500

const command = process.argv[2]
const parent = process.ppid
const child = spawn(command, { shell: true, detached: true, stdio: ['ignore', 'inherit', 'inherit'] })

function signalGroup(signal) {
  try {
    process.kill(-child.pid, signal)
    return true
  } catch {
    return false
  }
}

function endGroup(exitCode) {
  clearInterval(watch)
  if (!signalGroup('SIGTERM')) process.exit(exitCode)
  setTimeout(() => {
    signalGroup('SIGKILL')
    process.exit(exitCode)
  }, GRACE_MS)
}

const watch = setInterval(() => {
  if (process.ppid !== parent) endGroup(1)
}, PARENT_POLL_MS)

for (const signal of ['SIGINT', 'SIGTERM', 'SIGHUP']) process.on(signal, () => endGroup(1))

child.on('error', (error) => {
  process.stderr.write(`${error.message}\n`)
  clearInterval(watch)
  process.exitCode = 127
})

child.on('exit', (code, signal) => {
  clearInterval(watch)
  signalGroup('SIGKILL')
  if (signal) {
    process.removeAllListeners(signal)
    process.kill(process.pid, signal)
  } else process.exitCode = code
})
