---
name: qa
description: Walk a live site in the session's browser (Playwright MCP, or Chrome DevTools MCP) with explorer agents that report console errors, failed requests, broken links, overflowing or clipped layout, a wrong document language, accessibility problems and design differences, and file each problem as a Flow finding (flow:found) with screenshots, once. Approves nothing. Use only when the user runs /flow:qa <url> [--epic <e>] [--routes <file>] [--widths 1440,393], or when a host (the nightly GitHub Action) runs it unattended.
---

# QA: $ARGUMENTS

A browser walks the site the way a visitor would, and every problem it sees
becomes a finding: an issue labelled `flow:found` with the evidence and no
acceptance criteria, which a person approves or closes and `/flow:triage`
turns into tickets. This session plans the walk, hires the explorers, files
what they report, skips what was filed before, and ends with one table.
**It approves nothing**: a finding a browser agent filed is a claim until a
person has looked at it.

`FLOW` below means `node "${CLAUDE_PLUGIN_ROOT}/scripts/flow.mjs"`, run from
the repository root. `$ARGUMENTS` is the site's address (`<url>`, the page
to start from), then any of:

- `--epic <e>`: file the findings under that epic, and compare its design
  sources where it has them. Without it, the findings go under the open
  epic titled `Bugs`.
- `--routes <file>`: the pages to visit, one path or address per line.
- `--widths 1440,393`: the window widths, overriding `.flow.json`.
- `--unattended`: as if `FLOW_UNATTENDED=1`.

Use your scratchpad directory for every file below if the session has one,
otherwise `mktemp -d`; never the repository, whose working tree the
screenshots must not land in. `<scratch>` below is that directory.

## Attended or unattended

Run `echo "${FLOW_UNATTENDED:-}"` first; `$ARGUMENTS` containing
`--unattended` means the same as `1`.

- **Attended** (empty): a person started this session and reads chat. A
  question (which of two `Bugs` epics, say) is asked there, with your
  recommended answer.
- **Unattended** (`1`): a host (the nightly GitHub Action) ran it. Nobody
  reads chat, so **nothing may wait for an answer**: where this skill says
  stop, print the one sentence and exit nonzero, so the run shows as failed
  and the sentence is in its log.

## 1. A browser, or nothing

The plugin owns no browser and installs none: the walk uses the browser
tool this session already has. Look for tools named `mcp__playwright__…`
(Playwright MCP, the one to use) or `mcp__chrome-devtools__…` (Chrome
DevTools MCP, which works too); when the session lists tools as deferred,
search for them first. With neither, **stop before anything else**, saying:

> `/flow:qa` needs a browser tool and this session has none. Add Playwright
> MCP with `claude mcp add playwright npx @playwright/mcp@latest`, then start
> a new session and run `/flow:qa` again.

A walk without a browser would be a guess from the page's source, and a
guess filed as a bug costs a person the time to disprove it.

## 2. Read the plan for the walk

```bash
FLOW doctor
FLOW qa-config [--widths <the --widths argument>]
```

Stop if `doctor` says `gh` is missing or signed out: nothing can be filed
without it. `qa-config` prints the `qa` section of `.flow.json`, checked:
`routes` (pages to visit), `deny` (patterns never to click, submit or
visit), `widths` (1440 and 393 when not set) and `testMarker` (the text the
project's form gateway drops). It exits 2 naming every problem, an unknown
key or a wrong type: stop and show them, because a `deny` list that cannot
be read would be a walk with no brakes.

Read the project's instruction files (`CLAUDE.md`, `AGENTS.md`) at the root
for what they say about the site: a staging address, a page that must not
be visited, a form that may be tested. They are context for the packet, not
a second `deny` list: a rule that matters goes in `.flow.json`, where the
route list applies it.

## 3. Where the findings go

- With `--epic <e>`: that epic (`FLOW board <e> --json` must show it).
  Then `FLOW design-map <e> --out <scratch>/design-map.json`; when it
  writes a map, the epic has design sources and the explorers compare them.
  When it says there is none, the walk goes on without a design check.
- Without it: the open epic titled `Bugs` in `FLOW board --json`, when
  there is exactly one. When there is none, stop, saying the person creates
  one with `/flow:epic --standing "Bugs"` and approves it like any epic.
  When there are several, ask which (attended) or stop naming them
  (unattended).

This comes before the walk because a walk with nowhere to file it is paid
for and thrown away.

## 4. The pages to visit

`FLOW qa-routes` builds the list: the start page first, then pages of the
same site only (same scheme, host and port), each once (`/about/` is
`/about`, and the part after `#` is dropped), files that are not pages (a
PDF, an image) left out, every page a `deny` pattern matches left out, at
most 60 in all (`--cap <n>` to change it). It prints JSON with `routes`
and, in `skipped`, how many it left out and why. In this order, the first
that gives more than the start page:

1. `--routes <file>`: `FLOW qa-routes <url> --routes <file>`.
2. `.flow.json` `routes`: `FLOW qa-routes <url>`.
3. The site's sitemap:

   ```bash
   curl -sL --max-time 20 -o <scratch>/sitemap.xml "<origin>/sitemap.xml"
   FLOW qa-routes <url> --sitemap <scratch>/sitemap.xml
   ```

   When the JSON lists `sitemaps` (the file was an index), fetch each of
   the site's own (at most ten) into `<scratch>` and run it again with all
   of them after `--sitemap`.
4. The start page's links:

   ```bash
   curl -sL --max-time 20 -o <scratch>/start.html "<url>"
   FLOW qa-routes <url> --links <scratch>/start.html
   ```

   A page drawn by script has no links in its source: open it in the
   browser, evaluate `[...document.querySelectorAll('a[href]')].map((a) => a.href).join('\n')`,
   save the result to `<scratch>/links.txt` and run
   `FLOW qa-routes <url> --links <scratch>/links.txt`.

A start page that does not load at all ends the run here: say so in the
table, file nothing, and exit nonzero when unattended, because a site that
is down is not a finding about a page.

## 5. Hire the explorers

Split the routes into batches of up to ten, in order. For each batch, one
after another, spawn `flow:qa-explorer` with the Agent tool, **without a
`model` parameter** (it runs on the strongest model: what an explorer did
not look at cannot be checked afterwards). One at a time, because the
explorers share this session's one browser, and a second one would navigate
the first one's page away. Give it:

- the site's origin and the batch of addresses;
- the widths, the `deny` patterns and the `testMarker` (or "none") from
  `qa-config`;
- a scratch directory of its own, `<scratch>/batch-<k>/`;
- the paths of the project's instruction files;
- when step 3 wrote a design map: its path, `${CLAUDE_PLUGIN_ROOT}/scripts/fidelity.mjs`,
  and an address the design sources are served at. Serve them yourself,
  read-only and on this machine only, for the length of the walk
  (`python3 -m http.server <port> --bind 127.0.0.1 --directory <repository root>`
  in the background); with no way to serve them, say in the table that the
  design was not compared.

**Never** the findings already filed, the epic's tickets, or what anybody
suspects is broken: told where the bugs are, an explorer finds them there
and stops looking. Duplicates are caught by fingerprint in step 7.

Its report ends with one `json` block: `routes` (each page, whether it
loaded, and why not) and `findings`. A report with no readable block is
asked for once more from a fresh explorer on the same batch; when that
fails too, its pages are "could not explore" in the table. That is a
failure of the run, not of the site, so it is never filed.

## 6. One finding per problem, across batches

Each explorer saw only its batch, so the same problem on every page (a
broken header, a failing script) arrives once per batch. Two findings whose
titles give the same text after the path in `FLOW qa-fingerprint` are one:
keep every address and width, and the evidence of the first. Its address is
the first of its pages' paths in alphabetical order, so the next run picks
the same one and recognises it.

## 7. File each finding once

For each finding, write `<scratch>/finding-<k>.md` from the report, in the
shape the README recommends:

~~~markdown
## What happened

<actual>

```
<log, when there is one>
```

## Where

<url>, in a window <widths> pixels wide<; also on: the other addresses>

## Steps

1. <each step>

## Expected

<expected>

Found by `/flow:qa` on <today's date> (<kind>).
~~~

Copy its screenshots, and nothing else, into `<scratch>/finding-<k>/`
(`create-finding` refuses a directory holding anything but PNG, JPEG or
WebP images). Then:

```bash
fingerprint="$(FLOW qa-fingerprint "<url>" "<title>")"
FLOW create-finding --title "<title>" --file <scratch>/finding-<k>.md \
  --epic <e> --screenshots <scratch>/finding-<k> --fingerprint "$fingerprint"
```

Leave out `--screenshots` for a finding with none. The fingerprint is the
page's path and the title, lowercased, numbers written `#` and punctuation
dropped, so "393px" and "390px" are the same problem found again.

- **Exit 0**: filed; it prints the new number.
- **Exit 3**: an open finding or ticket already carries this fingerprint;
  it prints that number and files nothing. A duplicate skipped.
- **Exit 1**: filed, but its screenshots or its place under the epic did
  not follow; it says which. Put that in the table and never run it again
  for that finding, because a second run files it twice.
- **Exit 2**: refused (a bad screenshot directory, an epic that is closed);
  fix what it names and run it again.

## 8. One table, then stop

| | |
|---|---|
| Routes visited | <n> of <m> (<k> left out by `deny`, <j> over the cap) |
| Findings filed | #<n> <title>, … or none |
| Duplicates skipped | #<n> (already filed), … or none |
| Routes it could not load | <address> (<why>), … or none |

Add a line when the design was not compared, or a batch could not be
explored. Then say that nothing is approved: a person reads each finding,
approves it with the label `flow:approved` or closes it, and `/flow:triage`
turns the approved ones into tickets. Never add `flow:approved`, promote or
close anything yourself: the explorer's judgement is checked only by that
person, and the rejection rate is what the retro reads to know whether it
can be trusted.

Attended: say in one line that this is a good point to start a fresh
session or run `/compact`, because this one is full of page snapshots.
Unattended: exit 0, or nonzero after a stop.
