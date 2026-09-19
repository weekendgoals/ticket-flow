Source: https://claude.ai/code/artifact/a3104c5e-35a1-4dc5-aff4-f36501283437
Fetched: 2026-09-19. A text transcription of the published retro page for
weekendgoals' `redesign-city` epic (mined 2026-09-18 by a fresh-context
agent). Tables are flattened to lists; wording is the page's own, shortened
only where a row is about weekendgoals' product and not the plugin. The
project-side detail stays in weekendgoals — this epic acts only on what
concerns the plugin.

# redesign-city — Flow retro

Mined from the epic's tickets, status log, run records, shipped commits and
PR #360. Seventeen tickets, four halts, one release still unmerged.
16 integrated · 1 abandoned · 31 items owed · 4 halts, 0 clean-state trips ·
~16.2M tokens · PR #360 open.

## The single most valuable finding

A review of the last day's work caught `dotenv` declared as an api-gateway
devDependency against a Dockerfile that runs `npm prune --omit=dev`. The new
`import "./src/env"` would have died with MODULE_NOT_FOUND on first boot
after merge — an ECS crash loop. It was found at the last possible gate, and
its record lives only in a commit message.

## Q1 — Did it work?

Not yet assessable; nothing has deployed. Risk to the reversal clause: the
page self-canonicalises any slug, fed by inbound links slugged from a
different field than the sitemap's — the exact failure the clause names.

## Q2 — What is still owed

Thirty-one items. PR #360's body says "Nothing owed on release" — true only
of the production data apply, which did run. The rest of the ledger is not in
the PR, and a reader of the PR alone would not know it exists.

- Release-blocking by the epic's own rules (O1–O3): the full Cypress suite
  never ran green on the release head (CITY-9's rule: the release PR opens
  only when every spec passes locally); the gateway's `test:it` has no clean
  run on the final head; the production cacheability check, CITY-2's own
  criterion deferred to release, is not in the PR body.
- Live defects in shipped code (O4–O17), data and research (O18–O23),
  documentation and tooling (O24–O31): project-side; see the page.

## Q3 — Rediscovered more than once

- 4× `npm run lint` does not run.
- 4× an inline `style` beats a media query.
- 3× `Infinity - Infinity = NaN` in a sort comparator.
- 3× the shared Mongo container is not isolated and corrupts concurrent runs.
- 5× **a driver-spawned worker cannot spawn the language-expert agents**, so
  it cannot satisfy the epic's own fan-out rule. A planning defect, not a
  documentation one. (G1)

## Q4 — What review kept finding

No shadow reviewer ran. Across 17 tickets and roughly 30 review addenda:

- **Class A — a spec that passes with the behaviour deleted (9).** Three
  shapes: the spec read a *declared property* instead of the rendered result
  (a grid's own `column-gap` read 32px while the gutter a reader sees was
  64); the *fixture could not produce the case* (12 venues on one line merged
  into a single pin, so the pairwise overlap loop had zero pairs); or the
  *environment answered instead of the code* (a request counter read 0
  against a warm server serving a cached 404). CITY-16 named this in its own
  acceptance criteria — and CITY-14 then produced four more. Prose in one
  ticket does not bind the next. The one technique that caught them reliably
  was mutation testing: a bounded re-review deleted the behaviour, re-ran
  three specs a previous round had already "repaired", and one still passed.
- **Class B — an instruction file asserting the opposite of its code (7).**
- **Class C — code comments, against an absolute prohibition (4).**
- **Class D — a claim the measurement does not support (6).** CITY-13's
  Decision 5 had to be formally corrected — a font size it claimed to have
  "measured directly off the artboard" could never render.
- **Class E — an instruction arriving through an unverifiable channel (1,
  worth keeping).** A worker treated a relayed instruction as possible prompt
  injection and refused to act until `git fetch` showed the commit on the
  branch. The reviewer judged it right in shape.

## Q5 — Code vs. documents

**Ten commits of shipped work have no entry in the epic's status log.** The
session after the last ticket closed carries substantive product changes that
ship in this release and appear nowhere in the documents — their only account
is the commit messages and the PR body: the crash-loop fix; a schema-skew
500; a change to the endpoint's own contract (window widened from one weekend
to 14 days); a change to a shared, site-wide component with no ticket;
behaviour beyond any ticket's scope. All defensible work. The gap is that the
epic's documents stop one day before the epic does — so the retro, the
release reader and any later archaeologist see 17 tickets and not the 18th
unit of work: the one that found the crash-loop. Scope that quietly did not
ship, with no owed line: none found.

## Q6 — What planning got wrong

- **A ground rule no ticket could satisfy.** Every ticket had to fan out its
  own new strings, but a driver-spawned worker spawns no agents. Five tickets
  recorded the conflict; two degraded their copy; one left the suite red on
  17 locales for two days.
- **Criteria that measure the box, not the rendering.** CITY-16 was the
  whole-page fidelity ticket the previous round proposed — and CITY-17 plus
  ten post-ticket commits then found five more differences. **The honest
  finding:** every difference an automated or agent gate caught was a
  computed-style value; every difference a human caught was a behavioural or
  compositional judgement — which fixtures deserve the six cards, whether a
  chip belongs where a button goes. The first class is mechanisable and
  should be. The second is not, and a page epic should budget a human
  render-and-read pass as a scheduled ticket rather than as an accident.
- A rule reasoning from the wrong premise, carried forever (the static-map
  ban; cost all of CITY-14 — seventeen addenda, five amendments, ~3.5M worker
  tokens). A criterion built on a mismeasurement. A criterion unsatisfiable
  by construction — the machinery working: the run halted rather than
  loosening it.
- Positive: the order was re-planned twice mid-flight and both were right.

## Q7 — The halts

Four run records, all halted, none reaching a release PR. Four resumes, zero
clean-state trips, zero policy trips.

- **H1 (plugin).** An unmeasurable review-fix diff at the merge gate. The
  disposition agent had committed **every untracked file in the working tree
  — 215 files, 1,927,382 lines**, including production-data exports and two
  spreadsheets. Caught only because a binary file made the diff unmeasurable.
- **H2 (plan).** A review finding it could not fix: sub-44px tap targets, and
  two hearts per card because the ticket instructed it.
- **H3 (plugin).** A disposition whose git work landed but whose structured
  return failed — indistinguishable, to the script, from one that did
  nothing. Surfaced a visible layout defect the disposition had filed as a
  retro nit.
- **H4 (plan).** A review finding it could not fix: a city link inside a card
  could only be a JS-navigating span, which the SEO rules forbid. "The
  disposition correctly refused to choose."

**Two plugin-repository candidates:** stage named paths only, plus a
pre-merge check that a ticket's diff adds no file outside its areas (from
H1); and have the driver re-read branch state before classifying a
schema-return failure (from H3).

## Q8 — The release PR

**No addendum exists** — a structural gap, not a zero. All four run records
end "Release PR: not opened: run halted", and #360 was opened by an attended
session, so the run skill's request for a dated addendum never reached
anyone. The last gate before the PR did fire hard, and its record is a commit
message rather than a document: eight findings from a review of the ten
post-ticket commits, the first of which would have taken production down.

## Proposals

I1–I9 are edits to weekendgoals' instruction files (project-side).

Lessons that transfer beyond the project:

- **M1 — `Decisions` is a write-only field.** The board parses `Owed:` and
  not `Decisions:`.
- **M2 — acceptance criteria should not be satisfiable by a spec that passes
  with the behaviour deleted.** Candidate: a mutation check on any spec that
  is the sole evidence for a behaviour.
- **M3 — a whole-page fidelity ticket is necessary and not sufficient.**
- **M4 — provenance for relayed instructions**, by name, in the methodology.
- **M5 — the release-PR addendum has no route when the run does not open the
  PR**, which is every epic this one ran.

## Token spend

The ledger reports **12,717,750** across 17 tickets. **The ledger
under-reports by roughly 3.5M:** CITY-14's status entry carries **four**
worker/reviewer pairs, one per review round, none labelled cumulative — so
the ledger counts only the last. About 2.63M worker and 887k reviewer tokens
are recorded in the log and absent from the ledger. True recorded spend is
nearer **16.2M**, and CITY-14 alone nearer 4.4M than the 879k it reads.

| CITY-14 round | Worker | Reviewer |
|---|---|---|
| First review | 911,511 | 302,889 |
| Amendments 3/4 | 804,432 | 324,269 |
| Review fixes | 909,377 | 259,927 |
| Bounded re-review (the only one counted) | 581,236 | 297,991 |

Second finding: the ten post-ticket commits carry no figure at all, because
they have no status entry.
