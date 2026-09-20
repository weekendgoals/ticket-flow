#!/usr/bin/env node
// merge-append.mjs — a git merge driver for an append-only log.
//
//   git -c merge.flow-append.driver='node merge-append.mjs --driver %O %A %B' merge …
//   (with `<path> merge=flow-append` in .git/info/attributes)
//
// An epic's status log is appended to by every ticket, at the end. Two ticket
// branches cut from one epic head therefore conflict there on the second
// merge, every time — and a parallel run merges several such branches in a
// row with nobody present to resolve anything.
//
// Git's built-in `union` driver looks like the answer and is not. It is a
// LINE-level merge: a line both sides share is emitted once. Two status
// entries share most of their tail — `**Decisions:** none.`, `**Owed:**`,
// every blank line — so union reported a clean merge while the first entry
// lost its closing fields and its `**Owed:**` line came to rest under the
// second ticket's heading. An obligation changed owner, silently, and nothing
// downstream (`owed`, `brief`, `doctor`) could tell. That was caught in review
// with real git, before it shipped; this driver is what replaced it.
//
// The rule here is the file's own: BOTH sides only appended. So the merge is
// the base, then everything ours added, then everything theirs added — each
// side's new text kept WHOLE, in that order — which is document order, because
// the run merges a wave's tickets in document order. (A ticket branch that
// merged the epic branch into itself mid-ticket, which workers are told not
// to do, never reaches this driver for the log: git resolves it as theirs,
// nothing is lost, and only the entries' order follows the merges.) A side that did anything but
// append (an edited entry, a deleted line) is not something this can merge,
// and it says so by failing: git records a conflict, and the run halts on its
// merge-conflict stop condition with a human's attention, which is right.
//
// git calls it with `--driver` and three paths: %O the common ancestor, %A
// ours (also where the result is written), %B theirs. Exit 0 = merged,
// nonzero = conflict. Zero dependencies; reads three files and writes one.
//
// `--driver` is what makes this file act, and nothing else is. A merge driver
// that exits 0 having done nothing is the worst thing it can be: git takes
// ours as the result, theirs is discarded, and the merge reads as clean. The
// first cut decided "am I the program being run?" by comparing
// `import.meta.url` with `process.argv[1]` — one realpath-resolved, the other
// not — so under any symlinked plugin path the comparison failed, the body
// never ran, and a whole status entry vanished from a clean-looking merge.
// An explicit flag cannot be wrong about a path. And it fails CLOSED: run with
// the flag and anything but three readable files, it exits nonzero.

import { readFileSync, writeFileSync } from 'node:fs'

// base + oursAdded + theirsAdded, or null when either side is not an append.
export function mergeAppend(base, ours, theirs) {
  if (!ours.startsWith(base) || !theirs.startsWith(base)) return null
  const added = theirs.slice(base.length)
  // Ours always ends its last entry with a newline in practice; if it does
  // not, theirs' first line must not be glued to ours' last.
  const seam = ours.length && !ours.endsWith('\n') && added.length && !added.startsWith('\n') ? '\n' : ''
  return ours + seam + added
}

const flag = process.argv.indexOf('--driver')
if (flag !== -1) {
  const [base, ours, theirs] = process.argv.slice(flag + 1)
  if (!base || !ours || !theirs) {
    console.error('merge-append: usage: merge-append.mjs --driver %O %A %B — a git merge driver; see the header of this file')
    process.exit(2)
  }
  const merged = mergeAppend(readFileSync(base, 'utf8'), readFileSync(ours, 'utf8'), readFileSync(theirs, 'utf8'))
  if (merged === null) {
    console.error('merge-append: one side did more than append to the log (an edited or deleted line) — that is a real conflict, left for a human')
    process.exit(1)
  }
  writeFileSync(ours, merged)
}
