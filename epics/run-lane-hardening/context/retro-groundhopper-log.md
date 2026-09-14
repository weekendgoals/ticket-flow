I've read the skill, both epic documents in full, the shipped record, and the instruction files. Here is the report.

---

# Retro (mid-epic) — `groundhopper-log`

Mined 2026-09-14 by a fresh-context agent, per `flow:retro` steps 3–5. Sources: `epics/groundhopper-log/tickets.md` (1,176 lines), `epics/groundhopper-log/status.md` (2,478 lines, every `### Run —` record and every addendum), `context/design/` (17 documents + `README.md`), `git log origin/main` (102 ID-prefixed commits), `weekendgoals-ui-next/CLAUDE.md` (2,307 lines), `CLAUDE.md` (531 lines), `weekendgoals-ui-next/.claude/rules/translations.md`, and the shipped code as it stands on `origin/main`.

**One ticket is open by the user's own choice: GHL-14, `todo`.** That fact turns out to govern the Outcome answer, so it is not a footnote.

---

## 1. Outcome

The epic carries a real Outcome line (`tickets.md:20-39`) with an observable change, three named evidence sources, and a reversal condition. Judging it:

**The observable change shipped.** 15 of 16 tickets are `shipped` off commit subjects on `main`; release PR #310 (`epic/groundhopper-log` → `main`) merged 2026-08-28T11:24Z as `a112fe29`. Every surface the Outcome names exists in the tree: `/log` behind a gate, the four-stat career header and per-year chart, the seven-slot ledger, the tick from match page / planned row / picker / date, Coverage with set detail, Planned with the door and the 30-day rule, entry edit and delete-with-arithmetic, manual backfill.

**The evidence is not yet assessable, and — more seriously — it currently cannot accrue.**

- The line says "read 28 days after the release deploys." Merged 2026-08-28; today is 2026-09-14, day 17. The read falls due ≈2026-09-25. Reversal ("after 8 weeks fewer than 30 production users hold an entry") falls due ≈2026-10-23.
- But `/log` is invite-only as of the release, `requireFeature()` fails closed with a 404 (`status.md:2119-2125`), and **no production account holds the feature**: "Production holds 12 user rows and **no account holds any feature**" (`status.md:2215-2217`). Only `info@weekendgoals.com` is invited, and an invite is collected at first sign-in.
- GHL-14 is the ticket that fixes this. It is labelled "**Blocking, and time-critical** … The window between the merge and this running is a window in which the feature is invisible to its own author" (`tickets.md:880-890`). It is still `todo` 17 days after the merge, and it has **no `status.md` entry at all** — which its own acceptance criterion requires ("Recorded in `status.md`: which addresses were granted, and when", `tickets.md:916`).
- The counts the Outcome will be read against, measured 2026-08-28 (`status.md:2238-2240`): `LogEntries` 2, `Plans` 3, `Users` 14, **`Sets` 0, `SetMembers` 0, `SetCompletions` 0**. Coverage can produce no evidence whatsoever until the launch sets are seeded, which is an owed step of a *different* epic (`status.md:1888`, `status.md:2240-2242`).

**Verdict: not yet assessable, and the clock is running on a metric that is structurally pinned near zero.** If the reversal condition is evaluated on schedule it will trip on a closed gate rather than on the product. Look again after GHL-14 lands and 28 days have passed from *that* date, not from the merge.

**One promise in the Outcome line is no longer true.** `tickets.md:28` promises "`/log` itself loads offline after a first visit." The offline shell was **removed on 2026-09-02** — `4f194f8d`, "Remove the /log offline shell, and leave a worker that removes itself (#337)", five days after the release. `weekendgoals-ui-next/CLAUDE.md:2050-2076` records the reasoning honestly ("Removed on a product call … the airplane-mode walk-through it existed for was never actually performed"), and correctly notes GHL-2's store and queue are untouched, so a tick with no signal still survives and syncs. What is gone is the *document* load. Neither `tickets.md` nor `status.md` says a word about it — see §5.

---

## 2. Still owed

Every **Owed** line and every finding dispositioned to `retro` or to a later ticket, checked against what actually shipped.

### 2a. Discharged (good news, recorded so nobody re-opens it)

| Owed item | Discharged by |
|---|---|
| GHL-2's `_id ?? ""` pending-row link gap (three call sites) | GHL-5, `entryRoute()`/`findEntryByIdOrClientId()` — `status.md:919-923` |
| GHL-3's `plan-confirm` queue-kind coverage | GHL-6 — `status.md:1082-1086` |
| `readLedger()` never overlaying a pending `plan-confirm` | GHL-11 — `status.md:1744-1749` |
| `weekendgoals-ui-next/CLAUDE.md:10` stale test count (reported by GHL-5 *and* GHL-10) | `cb00b580`, then `b4df1f8c`. Verified accurate today: 35 spec files under `test/unit` + `src`, and line 11 reads "35 suites / 445 tests pass" |
| GHL-5's "crests / club colours where present" not rendered | `537a82d4` (2026-08-27) — `TeamCrests` now at `Entry.tsx:712` |
| `StatFragment` hard-coding the space between numeral and label | `status.md:2144-2149`, `log.header.stat` in 18 files |
| The pt/ru/uk/pl register damage (92 strings) | GHL-13 |
| GHL-11's `RegisterSw` under `npm run dev` nit | Moot — the worker is gone (`4f194f8d`) |

### 2b. Still owed, with no ticket and no owner

**Translation debt — the register review that GHL-1 opened and nine tickets extended is only two-thirds paid.**

1. **The other 13 locales' `log.*` block has never been register-reviewed.** GHL-13 scoped them out explicitly: "The other 13 locales are untouched and remain unreviewed, as scoped" (`status.md:2382`). GHL-16 measured only the `picker-title` pair in those 13 and found it clean (`status.md:2447-2452`) — that is one string, not the block.
2. **Fourteen more reader-facing strings in ru/uk/pt are in the formal register just corrected** (`status.md:2454-2472`) — `common.share-location-description`, `common.explore-map-nearby`, `common.map-card-explore-world`, `tickets.compare-title`, `filters.matches-around-me-description` in ru and uk; four in pt. The log entry names them as "**Owed, and NOT done here**." No ticket exists.
3. **`he` and `ar` address the reader with a masculine imperative** (`בחר`, `اختر`) in both picker strings — "the same 'commits to a male reader' problem pl was just fixed for. Neither locale was in scope and neither was touched." (`status.md:2474-2478`)
4. **pl's `Wybierz mecz, który pamiętasz` weakens *attended* to *remembered*** — the log flags it itself as "the one string here a reviewer should push back on if the weakening is not wanted. Swapping to `Wybierz mecz obejrzany przez Ciebie` is a one-line change." (`status.md:2430-2436`)

**Retro-owned review nits — roughly thirty were dispositioned to "retro" and not one became a ticket.** I verified four of the load-bearing ones are still live in shipped code:

5. **`queue.ts:313-321` drops 401/403/429 with the other 4xx.** GHL-2's addendum: "a 401 after the 30-day expiry drops an unsynced tick a re-sign-in would have landed. Owner: **retro** — it wants a decision on which 4xx keep the row, not a quiet widening here" (`status.md:342-346`). Confirmed unchanged: `isRetryable` returns `error.response.status >= 500`, and the caller `console.warn`s and `db.delete("pending", …)` at `queue.ts:282-289`.
6. **`TickSheet.tsx:381-386`'s note textarea has no `maxLength`.** Found while fixing GHL-5's third Important: "a 501-character note at the tick is refused by the gateway on sync and dropped silently after the receipt — the same class as the third finding, in GHL-3's surface; owner: retro" (`status.md:980-983`). Confirmed: `maxLength` appears nowhere in the file.
7. **`local-store.ts:89` opens at `DB_VERSION = 2` with only an `upgrade` handler — no `blocked`/`blocking`.** GHL-7's nit 5: "a second tab opened post-deploy with `openDB(..., 2)` sits in `blocked` until the first tab closes, so every read in the new tab hangs and `/log` renders nothing" (`status.md:1220`). Confirmed; the only `onblocked` in the file is at line 130, inside `resetLogDbForTests`.
8. **`saved-matches.cy.ts:7` is still `describe.skip`**, and GHL-8 reversed the behaviour it asserts: "un-skipping it now fails for a reason unrelated to whatever prompted the skip; it wants deleting or rewriting as a guest spec" (`status.md:1319`).

Others still open and unfixed, briefly: GHL-1's vacuous RTL assertion and hard-coded `aria-label="new-ground"` (`status.md:148-159`); GHL-4's four nits — venue-chip label lost after a pan, card-body tap in picker mode losing `return_to`, UTC-vs-local date bounds, `DATE_ONLY_RE` accepting `2026-13-45` (`status.md:832-838`); GHL-5's four (`delete-note` rendering at 0 grounds, the live `GET /me/log/entries/:id` path untested with a late-resolving `hydrate(live)` overwriting a touched field, the raw ISO date in the locked block, `/venues/<id>` vs `/venues/<slug>/<id>`) (`status.md:957-970`); GHL-6's two (`status.md:1126-1135`); GHL-7's remaining four (`status.md:1220`); GHL-8's five (`status.md:1315-1319`); GHL-10's four (`status.md:1662-1670`).

**Physical-device work.**

9. **GHL-12 is PARTIAL.** Checks 1–4 and 7–9 "reported 'all ok'" with no observations captured — "that detail was not captured, so this entry does not claim more than it has" (`status.md:2232-2235`), which is short of the ticket's own criterion ("each naming the check, the device, the build, and what was observed — not 'passed'", `tickets.md:964-965`). Checks 5 and 6 were done **on 390×844 Chromium driven by Playwright against a local build**, not a phone against the deployed build (`status.md:2245-2253`), and are "**Still owed**: checks 5 and 6 against the **deployed** build on a **phone**, which needs the production launch sets seeded first" (`status.md:2285-2288`).

**Infrastructure and process.**

10. **Production launch sets unseeded** — blocks Coverage evidence and GHL-12 checks 5/6. Owed to `epics/groundhopper-foundation/` (`status.md:1888`, `2240-2242`). The three files in `scripts/data/log-sets/` are placeholders with invented externalIds 900001–900010.
11. **`next lint` fails on 41 files in `weekendgoals-ui-next`**, all pre-existing (`status.md:2188-2189`). Assigned "owner: retro — UI lint hygiene, outside this epic" at GHL-1 (`status.md:161-165`) and never picked up.
12. **`build.sh:12` passes `--build-arg IS_CI=true` the Dockerfile never declares — a no-op.** "Owner: infra housekeeping" (`status.md:1881-1884`).
13. **`test/it/write-auth.it.ts` is flaky locally** — duplicate-key collisions on the `john@smith.com` fixture (`status.md:2031-2034`).
14. **"CI has never run on any of the nine"** (`status.md:2104-2106`) — the 2026-08-27 commits. #310 was reopened and merged, so CI presumably ran on the merge, but **no record says so**. Unclosed on paper.

---

## 3. Rediscovered more than once

### 3a. The unattended lane cannot spawn agents; the area's translation rule requires seventeen of them. Nine tickets each rediscovered this and each wrote its own paragraph.

- GHL-1: "written directly rather than through `.claude/skills/translation-review/SKILL.md`'s per-language-expert review mode: **this run's spawn prompt forbids spawning any agent**" (`status.md:112-118`)
- GHL-2: "the same deviation GHL-1 recorded under the same constraint (this run's spawn prompt forbids spawning any agent) … folded into the same register/naturalness debt GHL-1 already opened, not a new item" (`status.md:289-295`)
- GHL-3: "translated directly into all 17 locales … — this run spawns no agents — the same path GHL-1/GHL-2 took" (`status.md:432-435`)
- GHL-4: "matching GHL-1/2/3's precedent" (`status.md:784-786`)
- GHL-6: "the same path every prior ticket in this epic took" (`status.md:1078-1080`)
- GHL-7 (`status.md:1204-1206`), GHL-8 (`status.md:1297-1299`), GHL-9 (`status.md:1378-1380`), GHL-10 (reuse to avoid new keys, `status.md:1628-1630`).

Anything learned nine times was decided zero times. The bill arrived at `status.md:2151-2170`: **92 strings across four locales** repaired against the briefs, then GHL-13 (four agents), GHL-15's 17-locale fan-out, and GHL-16 (four agents) to finish. **The lesson has now landed** — `weekendgoals-ui-next/.claude/rules/translations.md` (`6253448f`, 2026-08-27) and `weekendgoals-ui-next/CLAUDE.md:246-270` — but it landed *after* the epic paid for it, and the rule still does not say what to do when the lane forbids the agents it mandates. That gap is Proposal 4.

### 3b. The e2e harness's own quirks — rediscovered three times each, and mostly still undocumented.

- **`cypress-mochawesome-reporter` has to be copied from the root `node_modules` "as CI does"** — GHL-1 (`status.md:74-79`) and GHL-2 (`status.md:252-255`). Grepping `weekendgoals-ui-next/CLAUDE.md` for `mochawesome`: **no hits.** Learned twice, documented zero times.
- **A stale `next-server` on port 4100 makes Cypress test the previous build.** GHL-9 wrote its own "Note for the next worker" (`status.md:1436-1438`); GHL-10 then hit the downstream form of it — `log-saved.cy.ts` reads `localStorage` keyed on a hardcoded `http://localhost:4100` origin, so running on 4111 to dodge a held port fails one test (`status.md:1609-1615`); GHL-11 hit the identical failure and had to re-diagnose it (`status.md:1768-1773`). Three entries. No instruction-file line, and the hardcoded origin is still in the spec.
- **Cypress fixtures import as `undefined` under a static `import`; use `cy.fixture()`.** GHL-1 found it and *did* document it — `weekendgoals-ui-next/CLAUDE.md:1187-1190`. This is the counter-example that shows the pattern works when someone bothers.

### 3c. `export const dynamic = "force-dynamic"` for a `searchParams` read under `[locale]`'s `generateStaticParams` — found three times.

- GHL-4, found while verifying: "`/de/log/new` answered 500 (bare, `?date=`, `?match=`) … the `[locale]` layout's `generateStaticParams` makes the page a static candidate and its `searchParams` read throws `DYNAMIC_SERVER_USAGE`; `/log/new` alone survived because the default locale is rewritten. **Root cause predates GHL-4** (GHL-3's `?match=` return leg 500s the same way on every non-English locale)" (`status.md:819-828`).
- GHL-6 re-applied it by hand: "the `dynamic="force-dynamic"` fix `/log/new` needed for the same `searchParams`/`generateStaticParams` interaction, applied here too" (`status.md:1030-1033`).
- The invite gate hit the third variant (a `cookies()` read, same mechanism): `weekendgoals-ui-next/CLAUDE.md:991-996`.

It is documented in three places (`CLAUDE.md:844`, `:991`, `:1686`) but never as a rule near "Server vs Client Components" (`CLAUDE.md:25`), which is where someone building the next route looks.

### 3d. `Promise.all` over independent `/me` reads takes the whole page down.

Flagged as a *nit* on GHL-1 — "`LogHome.tsx` `Promise.all` has no rejection path — a 401/500 on any `/me` read leaves `loaded` false forever with no message" (`status.md:151-152`) — dispositioned to the retro, shipped. Then found for real by GHL-6 before it landed: "`Promise.all` rejects as soon as any one promise does, so an unintercepted (or genuinely slow …) plans fetch silently zeroed stats/entries too, swallowed by the caller's own `.catch(() => undefined)`" — `log-home.cy.ts` lost its ledger entirely and `log-entry.cy.ts` failed 12/13 (`status.md:1043-1055`). Now documented at `CLAUDE.md:1587-1594`, but only inside the Planned section.

---

## 4. What review kept finding

Three defect classes, each spanning multiple tickets. Each is a missing invariant.

### Class A — read-then-act ordering against IndexedDB and in-flight writes. Nine Important findings, four tickets, five review rounds, plus the only real defect CI caught.

| Where | The finding |
|---|---|
| GHL-2 Important #2 | "a write enqueued while a flush was in flight was stranded until the next trigger" (`status.md:329-332`) |
| GHL-3 Important | "un-toggling 'Going' while the plan's POST was still pending dismissed nothing" (`status.md:455-458`) |
| GHL-3 re-review R1 | "the receipt's Undo silently kept the entry when tapped while the create POST was in flight … the first addendum's 'dequeue finds nothing' and the Decisions' 'the fallback recovers from it' were both wrong about the mechanism" (`status.md:492-498`) |
| GHL-3 re-review R2 | "three Going taps in the first POST's window deleted the plan the last tap owns … `Plans` is unique on `userId`+`matchId`" (`status.md:503-510`) |
| GHL-3 re-review round 2 | "Tick → Undo → tick again inside the first create's window deleted the entry the re-tick owns" (`status.md:531-533`) |
| GHL-6 Important #2 | "the `?match=` landing's enqueue raced its own param strip" (`status.md:1114-1118`) |
| CI on #310 | "a **real defect CI found**: the mount-time store read in `LogControls` landing between two taps un-pressed Going and the second tap became a second Going" (`status.md:1906-1909`) |
| Review of that fix | "a re-targeted control kept the old match's intent … `MatchesPopupList.tsx` keyed popup cards by `index`" (`status.md:603-614`) |
| GHL-8 (inherited) | `SavedMatchIcon` was "a copy of `LogControls`' race guards" and had to be fixed identically (`status.md:1315`, `1788`) |

Every one has the same shape: **a component reads the local store, or awaits a write, and something the user did in the interval is lost or reversed by the answer.** The eventual solution — `functional/log/read-sequence.ts`'s `begin()`/`supersede()` counter plus per-match intent maps (`planIntents`/`tickIntents`) — is documented at `weekendgoals-ui-next/CLAUDE.md:1319-1340`, but only as narrative about `LogControls`. There is no rule telling the *next* component built on this store that it must do the same. Proposal 1.

### Class B — the client accepts what the server refuses, and the refusal is invisible by design.

- GHL-5 Important #3: "Save accepted a note > 500 chars and non-integer/negative scores (gateway 400, dropped silently by the queue)" (`status.md:949-951`).
- Found while fixing the same: `TickSheet`'s note has no `maxLength` either — **still live** (§2b.6).
- GHL-6 nit: "`?match=<id>` for a past kickoff is enqueued with no client-side check; the server's 422 `kickoff_passed` refuses it and the card sits disabled until that flush settles" (`status.md:1131-1135`).
- GHL-15 documents the same in the shipped picker: ticking a fixture from the zero state "is refused with 422 `kickoff_not_passed`" (`tickets.md:1055-1060`).

The mechanism that makes this a *class* and not three nits: `queue.ts:282-289` drops any non-409 4xx with a `console.warn` and no user-visible trace, deliberately, because §09 refuses error UI in the logging flow. **Client-side validation is not politeness here — it is the only error channel the design permits.** Proposal 2.

### Class C — a scope line read narrower than the design it cites.

- GHL-1: "`LogHeader.tsx` rendered three stats and dropped the fetched `LogStats.competitions`, against the ticket's own scope line, `13 Handoff Spec` §07 and `17 Slice One` check 2" (`status.md:136-140`).
- GHL-9: "the Scope line 'the code grid is drawn only when the set has ≥ 40 members, otherwise rows' was read as *instead of*; Requirement 8 and the design settle it as *above*" — for The 92, "no filter chips, no next-fixture date, no 'Find a match here' crossing" (`status.md:1402-1410`).
- GHL-10: two Importants, both "the deliverable named in scope was not produced" — the CLAUDE.md section, and "'I can't find it' on `/log/new` never reached the manual form … a pre-catalog match was steered into a Rule 52 question that never resolves" (`status.md:1642-1654`).
- GHL-5: "the scope's 'crests / club colours where present' are not rendered — a scope line left undelivered with no decision here" (`status.md:965-966`).

Four tickets, four scope lines quietly under-delivered, all caught by review rather than by a CHECK. The epic already has the right doctrine for this — "**The rules outrank the drawings**" (`tickets.md:126-128`) — it just has no converse rule for when a *scope* line and a *design rule* disagree. Proposal 3.

---

## 5. What the codebase owes the documents, and the documents the codebase

Compared 102 ID-prefixed commits on `origin/main` against `tickets.md`'s promises, both directions.

### 5a. GHL-15 shipped and the status log says nothing about it.

Four commits on `main`, all 2026-08-28: `adf13354` ("the picker says 'you were at' when the intent is a match to come"), `31fa37a0` (`search.picker-title-plan` in all 18 locales), `4e48b943` ("the picker is told which crossing it is, and opens on the right dates"), `af33daa1` ("the e2e specs follow the picker's new intent parameter"). `tickets.md:1019-1092` carries a full ticket section.

`status.md`'s `###` headings are: GHL-1, GHL-2, GHL-3, GHL-4, GHL-5, GHL-6, GHL-7, GHL-8, GHL-9, GHL-10, GHL-11, GHL-12, GHL-13, GHL-16, and six `Run —` records. **There is no `### GHL-15` entry, and no addendum mentions it.** GHL-16's ticket section closes with a "**Resolved 2026-08-28**" block; GHL-15's does not. The board reads GHL-15 as `shipped` purely off commit subjects, and the epic's own record of work already done has a hole in it. Only the diff knows this happened.

### 5b. GHL-11's entire deliverable was reverted, and only a third document records it.

`4f194f8d` (2026-09-02, PR #337) removed the offline shell and left a self-unregistering tombstone worker. `weekendgoals-ui-next/CLAUDE.md:2050-2076` documents it thoroughly and well — including why deleting the route would have been wrong ("a registered worker keeps controlling its scope and serving its cache forever"), and the real cost that motivated it ("its `/_next/static/` rule is cache-first with no revalidation. Those are the whole app's assets, not the log's … which is how a rebuilt `/map` went on serving a week-old search").

But **`epics/groundhopper-log/tickets.md` and `status.md` are silent.** `tickets.md:798-861` still reads as a shipped offline shell, `tickets.md:28` still promises "`/log` itself loads offline after a first visit", and `tickets.md:933-934`'s phone check 1 ("In airplane mode, the tick completes…") is still owed against a shell that no longer exists. `NEXT_PUBLIC_BUILD_ID` and its `BUILD_ID` plumbing through `build.sh`/`Dockerfile` — the subject of GHL-11's one Important review finding and its fix `ac021299` — are gone too.

### 5c. `api-gateway` entered the release, against the epic's own Areas-in-scope line, which was never amended.

`tickets.md:89-93`: "Areas in scope: `weekendgoals-ui-next` …; `weekendgoals-common` for the API client only. **The API is consumed, not changed**: if a ticket needs a route or a field the foundation did not ship, it stops and reports." That rule worked exactly as designed once — it is what halted GHL-10 (§7, halt 4).

Then three api-gateway changes shipped in this release anyway, all through attended passes:
- `privateNoStore` on `/me` plus `test/it/me-cache.it.ts`, because "`/me` was served `cache-control: public, max-age=1800` … a brand-new local user was shown the previous user's log … **This puts api-gateway into the release** — ui-next and api-gateway now both deploy when the release PR merges. Vadim's call, taken during the pass." (`status.md:2017-2029`)
- The whole invite gate: `requireFeature()`, `User.features`, `FeatureInvites`, `grant-feature.ts`, `test/it/me-feature.it.ts` — and it gates `/internal` too, a section this epic never named (`status.md:2108-2142`).
- `GET /venues/search` — "This is the real ground picker GHL-10 was re-planned away from" (`status.md:2064-2070`).

The Areas line is still unchanged. An agent reading `tickets.md` today would still stop-and-report on an api-gateway need, in an epic that shipped three api-gateway changes.

### 5d. Behaviour that shipped beyond any ticket's scope, with no ticket to name it.

From Vadim's two local passes (`status.md:1917-2229`), all on the epic branch and all in the release: the guest-stranded-on-a-black-screen gate fix and `loginDialogDismissals`; the picker's bottom-sheet `peek` fix; `CATALOG_START_DATE`; the manual entry's "not at their home ground" checkbox; the career chart's `years`/`months`/`empty` modes; ICU plurals on the four stat labels; "comp" → "competition" across fr/it/ca; `CatalogPicker`; `RatingStars`/`ScoreField`/`TeamCrests`; `LogPageShell`'s 480px desktop column; the app-wide `routeHistory` back-button fix; `PlanReceipt` and the sidebar Planned badge; the ledger's trailing-slot widths; `.claude/rules/translations.md`. Each is well recorded as prose in `status.md`; none is a ticket, none has acceptance criteria, and none went through CI before merge (#310 was closed for six days precisely so they would not, `status.md:1917-1921` and `2060-2062`).

### 5e. A requirement that never shipped and that no Owed line names.

**Requirement 2** (`tickets.md:45-48`) requires the tick receipt to "show a receipt naming what changed (ground number or visit number, **any set that moved**)." `TickReceipt.tsx:196-244` renders that set line. `LogControls.tsx:494-502` is its only caller and **passes no `setProgress`** — verified in the tree today. GHL-3 built it unwired and mis-attributed the owner ("the ticket's own scope names GHL-8 … but the epic's own ticket numbering makes GHL-9 the actual owner; left as a discrepancy", `status.md:428-431`); GHL-9 declined it ("it stays owed, not silently dropped", `status.md:1381-1384`). Nothing since. Half of a numbered requirement is dead code, and the epic's Owed lines route it to nobody.

### 5f. Instruction-file staleness the work created.

`CLAUDE.md:184-190` (root): "**The Flow plugin is used only where Vadim opens an epic for it.** Two are open as of 2026-08-24 … `epics/groundhopper-foundation/` (the log's API) and, after its release merges, `epics/groundhopper-log/` (the `/log` UI)." Both have released (#306 and #310). The sentence describes a state three weeks gone, in the section that tells an agent how work is organised here.

---

## 6. What planning got wrong

Sorted into fixes to how *this project* plans, and lessons that transfer.

### Transferable — candidates for the methodology itself

**T1. An epic's ground rules must be executable by the lane that will run them, and the plan review must check that.** The single most expensive error in this epic. `tickets.md:184-187` mandates "every string in `src/messages/*.json` for all 18 locales **via the per-language agents** (`weekendgoals-ui-next/.claude/agents/<code>-language-expert.md`, rule `.claude/rules/translations.md`)". The delivery mode is `Delivery: release`, run unattended, where the worker's spawn prompt forbids spawning any agent. The rule was therefore unsatisfiable from the moment it was written, and nine consecutive tickets recorded the deviation and shipped anyway (§3a). Cost: 92 damaged strings, three follow-up tickets (GHL-13, GHL-15, GHL-16), and a fan-out the rule's own figures put at ~76k tokens × 17 agents. A plan review that asks "can the actor that will run this actually do this?" catches it in one line. This is precisely the ticket-flow invariant "**A gate is verified at the door its actor walks through**" applied to *ground rules* rather than to gates — the same failure shape, one level up.

**T2. An acceptance criterion no actor in the lane can execute is not a criterion.** "Demonstrate (owed to the release PR)" appears in GHL-1, GHL-4, GHL-6, GHL-9, GHL-10, GHL-11 and is implied in the rest; the epic knew at planning time that "no unattended ticket can hold a phone — every 'demonstrate on a phone' line below is owed to that PR" (`tickets.md:33-35`). The release PR then merged **without any of them performed** (`status.md:2106`: "The nine acceptance checks of `17 Slice One` §04 are still unperformed"). GHL-12 was invented afterwards to catch them and is still PARTIAL. Deferring a criterion to a document is not the same as assigning it to an actor: it should have been a ticket in the plan, with a human owner, ordered before the release PR.

**T3. Eleven tickets in one release, chosen over an offered split, and the split-seam mitigation was never used.** `tickets.md:98-102` names the risk honestly and offers the mitigation: "the document stays ordered so that cut remains mechanical if the run is halted mid-way." The run halted **four times**, and the cut was never taken. The actual cost: six run records, five attended merges (`status.md:1912`), a release PR whose CI failed four times (`status.md:1900-1915`), then a PR *closed for six days* across two local passes so nine commits could go out uninspected by CI. The seam was correctly identified (after GHL-5) and correctly declined at sign-off — but a mitigation that is never exercised across four opportunities was not a mitigation, it was a reassurance. **A stated fallback should carry the condition that triggers it** ("if two runs halt, take the cut"), or it will not be taken.

**T4. A CHECK decided by an assertion that cannot fail is worse than no CHECK.** GHL-1's RTL criterion asserted `insetInlineStart !== ""` and `textAlign === "start"`; the reviewer: "`insetInlineStart !== ""` cannot fail and `textAlign === "start"` echoes the `sx` value; a `getBoundingClientRect()` assertion against the viewport edge would test the side" (`status.md:148-151`). Dispositioned to retro; still unfixed. The epic's ground rules already carry the neighbouring rule — "A criterion's CHECK is decided by exit code — never by grepping for a word Jest prints on failure too" (`tickets.md:200-201`) — which is the right instinct pointed at the wrong half of the problem. The generalisation: **a criterion must be written so that a plausible wrong implementation fails it**, and the plan review is where to ask "what would make this red?"

**T5. Plan against the route's shape, not its name.** GHL-10 was planned around `GET /venues/search/name?name=` as a partial-match autocomplete; it is "the scraper's ingest lookup — whole-name equality or a whole-name alias, one `{ venue, matchedBy }` or 404, never a candidate list" (`status.md:1529-1539`). The driver owned it: "the planning error was the driver's, at `/flow:epic` time" (`status.md:1552`). The halt worked, but it cost a whole run (164,008 output tokens) and a re-plan that was itself a workaround — Vadim later built the real `GET /venues/search` by hand (`status.md:2064-2070`). **An epic that consumes an API should cite the DAO or handler file and the response shape, not the route path.** This epic's other API citations do exactly that (`tickets.md:435-440` cites `MatchesMongoDao.buildQuery` and `ChooseDate.tsx:128` with line numbers) and none of those went wrong.

**T6. The tier that predicted risk and the gate that fired were inversely correlated.** Every `consequence`-tier ticket (GHL-2, 3, 4, 5, 6, 7, 8, 11) got an automatic re-review, and exactly one of those re-reviews found anything (GHL-3, and it found two real defects). All three `normal`-tier tickets that produced review fixes (GHL-1, GHL-9, GHL-10) halted at the fix-bounds gate instead, and all three resolved to "grant the re-review the consequence tier gets for free." Meanwhile GHL-1's `normal` tier was floored for "UI code, i18n, docs" (`status.md:175-176`) and its review found an Important that broke a Handoff Spec rule. See §7 for the full evidence and the recommendation.

### Project-level (ground-rule fixes for this repo)

**P1.** The `Areas in scope` line needs a stated procedure for the case that actually happened: an attended pass finds a defect in a *consumed* service that blocks the release. Right now the rule says "stop and report", and reality said "Vadim's call, taken during the pass" — three times.

**P2.** The epic's ground rules named a translation *skill* (`.claude/skills/translation-review/SKILL.md`) that GHL-1..GHL-8 cite, while the authoritative rule that now exists (`.claude/rules/translations.md`) was written *during* the epic, on 2026-08-27, by the work itself. Ground rules that point at a document being written by the same epic will drift.

**P3.** Two ticket documents' claims were later contradicted by their own status entries — GHL-15's first draft "said `log.` and over-stated the blast radius" (`tickets.md:1026-1027`), and GHL-16's "Measured across every string in all four files' was not accurate — the measurement covered the `log.*`/`search.*` neighbourhood" (`tickets.md:1165-1168`). Both were caught and corrected in the document, which is the system working. Worth keeping: **a ticket that states a measurement should name the command that produced it.**

---

## 7. Halts

Six `### Run —` records. Five halted; one completed.

### Halt 1 — Run 2026-08-25 (`wf_09d707e7-c0e`), GHL-1 — **PLUGIN/ENVIRONMENT**

> "`a review-fix diff outside its bounds — touching files the review never saw, or exceeding the fix line budget` — ticket GHL-1 … Detail: 'the fix commits changed 66 lines against a budget of 60 — past that size the fixes deserve a review, and deciding to grant one is not the run's call. Nothing merged.'" — `status.md:195-199`

The driver's own reading classifies it: "the overrun is the i18n fan-out the epic's own ground rule requires (every string in 18 locales): one key, 18 files, **18 of the 66 lines**. Every fixed file was in the reviewed diff." (`status.md:201-204`)

**Human resumed by:** merging GHL-1 by hand at `593cb865` "with Vadim's permission … and Vadim's standing rule since is that translation keys never need a second review" (`status.md:644-647`). No re-review was hired.

**Verdict: false alarm.** Nothing was ever found; a standing rule was created to stop it recurring. And it is structural, not marginal — the epic's own ground rule guarantees 18 files and ≥18 lines for *any* copy fix, so any string-touching fix starts a third of the way through a 60-line budget.

### Halt 2 — Run 2026-08-25 second (`wf_fb7acb09-284`), GHL-3 — **WORK**

> "`an Important review finding it cannot fix` — ticket GHL-3, where: the re-review of GHL-3's fix commits. Detail: '2 Important finding(s) in the fixes themselves … There is deliberately no second fix round: a human decides.'" — `status.md:688-691`

Both were real. (1) "The receipt's Undo, tapped while the create POST is in flight … dequeues the pending row and returns as if undone, but the POST then lands and the entry persists; the first review had raised it and the disposition sent it to 'retro' on a recovery path … that is never taken." (2) "Introduced by `06ad3e14`: `withdrawPlan`'s 'looked up by its own clientId' guarantee does not hold against the server — `Plans` is unique on `(userId, matchId)`" (`status.md:668-677`).

**Human resumed by:** "Vadim chose one attended fix round. A fresh fixer (fable) on `ghl-3` fixed both re-review findings in `864a0a7d` … a fresh re-review (fable) confirmed both fixed and raised one narrower plausible Important … The same fixer applied the same last-intent guard to `undoTick` in `58a624ec` … **GHL-3 merged by hand** at `090b51e0`" (`status.md:707-719`).

**Verdict: retired a real risk — and under-caught.** Two more defects of the same class escaped anyway: CI on #310 found one on the release branch (`status.md:1906-1909`) and its own review found a fifth (`57bc1d7b`, `status.md:603-614`). This is the one halt in the epic that was cheap at the price.

### Halt 3 — Run 2026-08-25 third, resumed 2026-08-26 (`wf_e3f2c231-9ee`), GHL-9 — **PLUGIN/ENVIRONMENT**

> "'the fix commits changed 119 lines against a budget of 60 — past that size the fixes deserve a review, and deciding to grant one is not the run's call. Nothing merged.' Driver's reading: not a translation fan-out (Vadim's standing rule does not apply)" — `status.md:1491-1497`

**Human/driver resumed by:** "The driver hired a fresh fable re-review of the fix range `464febd1..ecf0c2e8`: the Important is fixed correctly … the Cypress spec fails on the pre-fix code, no new Important, diff confined to the reviewed files. **GHL-9 merged by hand** at `ecf0c2e8`" (`status.md:1513-1522`). Re-review cost 41,368 output tokens.

**Verdict: false alarm.** The granted re-review found nothing.

**A second, unlabelled halt inside the same run — also PLUGIN/ENVIRONMENT.** "Halted once by the Claude session limit while hiring GHL-6's reviewer (2026-08-25 23:53) and **resumed from cache after the reset (2026-08-26, `today` kept at 2026-08-25 so cached steps matched)**" (`status.md:1443-1446`). Resumption required a human to hand-pin a date so a date-keyed cache would match — an environment failure whose recovery depends on knowing an undocumented trick. It also corrupted the accounting: "GHL-4/5 read 0 on the cached replay" (`status.md:1488`).

### Halt 4 — Run 2026-08-26 (`wf_940d4ebe-b30`), GHL-10 — **PLAN**

> "`a document/code contradiction — reported by a worker, or met by the script's own checks` — ticket GHL-10 … 'worker reported blocked: Stopped during step 2/4 (reading the API this epic consumes, before writing UI code) on discovering that `GET /venues/search/name`'s real behavior (single exact/alias whole-name match, ingest tool) contradicts the ticket document's assumption of a partial-match, multi-result autocomplete endpoint.'" — `status.md:1544-1550`

The worker stopped on the epic's own rule and wrote nothing: "The worker stopped on the epic's own rule ('the API is consumed, not changed …') and logged a BLOCKED entry on branch `ghl-10` (`a3b0fa7e`). **Nothing built, nothing reviewed**" (`status.md:1537-1539`). `tickets.md:764-766` agrees: "the worker stopped on that contradiction, correctly."

**Human/driver resumed by:** re-planning GHL-10's scope in `tickets.md` in the same commit as the record — the ground picked through its club via the existing `GET /teams?teamName=` search — and deleting the blocked branch "so the re-planned ticket starts clean" (`status.md:1552-1563`).

**Verdict: retired a real risk.** This is the halt that justifies the whole stop-condition family. Note the epilogue, though: the re-plan was a detour, not a fix — Vadim built the real `GET /venues/search` by hand on 2026-08-27 (`status.md:2064-2070`), and the ground-through-club binding produced its own product defect ("A neutral final, a groundshare or a temporary stadium silently recorded the wrong ground — and a wrong ground counts toward a Coverage set", `status.md:1964-1970`).

### Halt 5 — Run 2026-08-26 second (`wf_0d0554a4-30c`), GHL-10 — **PLUGIN/ENVIRONMENT**

> "'2 fix-commit file(s) fall outside the diff the review saw — a fix that grows the surface is new work, not a fix: weekendgoals-ui-next/CLAUDE.md, weekendgoals-ui-next/src/components/log/LogNewClient.tsx. Nothing merged.'" — `status.md:1701-1706`

The driver names the flaw in the gate's own predicate: "the gate fired because **the findings themselves named files the worker had not touched** … 'Halted at the fix-bounds gate: 2 fixed files outside the diff the review saw (`weekendgoals-ui-next/CLAUDE.md`, `LogNewClient.tsx`) — **the very files the findings said were missing**'" (`status.md:1694-1709`).

**Human/driver resumed by:** "A fresh fable re-review of `dfebc16f..724d4f17`: both findings fixed correctly, the Cypress case discriminates, GHL-7's Rule-52 flow and spec untouched, the locale key resolves in all 18 files, diff confined to the four files the findings required. **GHL-10 merged by hand** at `724d4f17`" (`status.md:1710-1714`). 40,465 output tokens.

**Verdict: false alarm, and guaranteed to be one.** The gate's rule is "a fix must stay inside the files the review saw." For the finding class "the deliverable named in your scope is missing", the fix is *necessarily* outside those files. This is not a threshold that was set too low; it is a predicate that is false for a whole class of correct fixes.

### Halt 6 — Run 2026-08-26 final (`wf_9d7bd8de-357`) — no halt

> "**Halted on:** ran to completion." — `status.md:1875`

GHL-11 integrated at `fea40a9e`; release PR #310 opened.

### Summary

| # | Run | Ticket | Cause | Real risk or false alarm |
|---|---|---|---|---|
| 1 | `wf_09d707e7-c0e` | GHL-1 | PLUGIN/ENV (line budget) | False alarm — waived by standing rule, no re-review |
| — | `wf_e3f2c231-9ee` (mid-run) | GHL-6 hire | PLUGIN/ENV (session limit + date-keyed cache) | Environment; recovery needed a hand-pinned date |
| 2 | `wf_fb7acb09-284` | GHL-3 | **WORK** | **Real** — 2 confirmed defects, 3 more of the class found after |
| 3 | `wf_e3f2c231-9ee` | GHL-9 | PLUGIN/ENV (line budget) | False alarm — granted re-review found 0 |
| 4 | `wf_940d4ebe-b30` | GHL-10 | **PLAN** | **Real** — wrong API assumption, caught before any code |
| 5 | `wf_0d0554a4-30c` | GHL-10 | PLUGIN/ENV (file-set) | False alarm — structurally guaranteed for this finding class |
| 6 | `wf_9d7bd8de-357` | GHL-11 | — | Completed |

**Three of five halts were the driver's own fix-bounds gate; none of the three found a defect. The two that found defects were different gates entirely.**

### The fix-bounds question, answered

**What the eventual re-review found, in each of the three:**

- **GHL-1 (66/60):** no re-review was hired. Waived on the spot and converted into a standing rule — "translation keys never need a second review" (`status.md:646-647`). Nothing has come back on it since.
- **GHL-9 (119/60):** "the Important is fixed correctly (grid above rows at ≥ 40 members, chips/next-fixture/crossing always present, ≤ 39 and complete sets unchanged), the Cypress spec fails on the pre-fix code, **no new Important**, diff confined to the reviewed files" (`status.md:1516-1519`).
- **GHL-10 (2 files outside):** "both findings fixed correctly, the Cypress case discriminates, GHL-7's Rule-52 flow and spec untouched, the locale key resolves in all 18 files, diff confined to the four files the findings required" (`status.md:1710-1713`).

**Zero Important findings, two for two, plus one waiver that never bit.**

**Recommendation: replace the fix-bounds halt with the automatic consequence-tier re-review. Do not raise the budget.** The evidence, in order of weight:

1. **A higher budget fixes neither halt 1 nor halt 5.** Halt 5 was a file-set violation with no number attached, and its finding class — "the file named in your scope is missing" — can only ever be fixed outside the reviewed diff. Halt 1 was six lines over, but the epic's ground rule (`tickets.md:184-187`) makes 18 locale files the floor for any copy fix, so a threshold that admits a one-key fan-out plus a real code change has to be so high it stops gating anything.
2. **The re-review is the remedy a human chose every single time the gate fired, and it is cheap.** 41,368 + 40,465 = **81,833 output tokens, 2.4 % of the epic's ≈3.45 M**. Against that: three unattended-run halts, each costing a human interruption plus a restarted run — runs 4 and 5 alone were 164,008 + 584,117 = 748,125 output tokens, nine times the re-review cost, much of it re-doing setup.
3. **The gate's own rationale has been overtaken.** `plugins/flow/workflows/run-epic.mjs:346-355` says the re-review "runs only at the consequence tier: five live re-reviews at the normal tier all returned zero Important findings, so below the risk list the fix commits are gated mechanically instead." This epic adds two more zero-finding normal-tier re-reviews and a waiver — **seven for seven**. But the inference drawn from "the re-review keeps finding nothing" was "stop running it," and the mechanism that replaced it does not skip the re-review; it moves the decision to grant one from the driver to a human, at 3 a.m., three times out of three. The gate saved 82k tokens of model work by spending three human interventions.
4. **The gate that earned its keep is the other one.** GHL-3's *consequence-tier* re-review found two confirmed defects that the fix commits introduced (halt 2), and that class kept producing findings for three more rounds. Keeping the re-review everywhere is what caught the only defects any of these gates ever caught.

**Concretely (ticket-flow change, `plugins/flow/workflows/run-epic.mjs`):** run the bounded re-review at every tier that produced fix commits, and demote the mechanical bounds check from a `stop()` to a fact reported into the re-review's prompt ("these files fall outside the reviewed diff; say whether that is the fix the findings required or new work"). If a mechanical gate is kept as a backstop, it needs two exclusions this epic proves are necessary: **files the review's own findings name**, and **locale message files** (the standing rule already exists as a human policy — `status.md:646-647` — and my memory of this project records the same remedy as a "Fix bounds exclude" line).

---

## 8. Proposals

Drafted, ready to hand back unchanged. Nothing here is edited; the gate is the invoking session's.

### 8a. Instruction-file edits

**Proposal 1 — the read-then-act invariant (Class A, nine Important findings).**
File: `weekendgoals-ui-next/CLAUDE.md`, into the "The log's local-first store (GHL-2)" section (currently `:1193-1305`), because that is where a future log component is sent to learn the store's contract. The mechanism is documented today only as narrative about `LogControls` (`:1319-1340`).

*Before* — no such rule exists in that section.

*After* — append:

> **Every component that reads this store and acts on the answer must order its reads against the user's taps.** IndexedDB answers in its own time and a queued write is not cancellable once `sendOne` has it, so any of three things can land between "read" and "act": a newer tap, that tap's own write settling, or a newer read. Nine Important review findings in GHL-2/3/6/8 and the one real defect CI caught on the release branch were all this, in different disguises — a mount-time read un-pressing "Going" between two taps, an Undo that dequeued a row the POST then landed anyway, a dismiss keyed to a `clientId` the server had already collapsed into another row. Two things are required, and `LogControls.tsx` is the reference implementation: route every store read through `createReadSequence()` (`functional/log/read-sequence.ts`), which drops a result that began before anything the user did; and keep **the last tap's intent per `matchId`** (`planIntents`/`tickIntents`), so the settle step acts only if the reader has not changed their mind. Per match, never per component instance — `SavedMatchIcon` instances outlive their match. Test it the way `log-controls.spec.tsx` does: deferred promises the test resolves by hand, in the wrong order. A Cypress test cannot force these orders and will pass on a broken implementation until CI's slow runner finds it.

**Proposal 2 — the client/server validation mirror (Class B).**
Same file, same section.

*Before* — nothing states this; `queue.ts`'s drop behaviour is described but not its consequence for callers.

*After* — append:

> **A write the gateway will refuse must be refused in the form, because the queue's refusal is silent by design.** `queue.ts` keeps a pending row on a network error or 5xx, merges a 409 `duplicate_match`, and **drops any other 4xx with a `console.warn` and nothing else** (`queue.ts:282-289`) — deliberately, since §09 forbids error UI anywhere in the logging flow. That makes client-side validation the only error channel this design has: a 501-character note or a non-integer score reaches the receipt, looks saved, and is gone at the next flush. Mirror the gateway's own limits at the input (`Entry.tsx` does; `TickSheet.tsx:381-386` still does not), and refuse a write the snapshot already proves invalid — a plan for a kickoff that has passed is a 422 the client can see coming.

**Proposal 3 — the scope-line converse of "the rules outrank the drawings" (Class C).**
File: `epics/groundhopper-log/tickets.md`, ground rules block (`:126-128`), and the same sentence for the next epic's template.

*Before*:
> **The rules outrank the drawings.** `13 Handoff Spec` §10 is the citable index; where a screen and a rule disagree, the rule wins.

*After*:
> **The rules outrank the drawings, and the rules outrank this document's paraphrase of them.** `13 Handoff Spec` §10 is the citable index; where a screen and a rule disagree, the rule wins — and where a **Scope** line here reads narrower than the rule or requirement it cites, the rule wins too, and the narrowing is a finding rather than a licence. Four tickets under-delivered on exactly this (GHL-1 rendered three of four stats; GHL-9 read "the grid is drawn when ≥ 40 members, otherwise rows" as *instead of* where Requirement 8 means *above*; GHL-10 skipped a named deliverable; GHL-5 dropped "crests / club colours where present"). If a scope line and the rule it cites can be read two ways, quote the rule.

**Proposal 4 — close the gap the translation rule still leaves.**
File: `weekendgoals-ui-next/.claude/rules/translations.md`.

*Before* (the file's closing paragraph):
> From the repository root the `<code>-language-expert` types do not resolve — they are scoped to `weekendgoals-ui-next/`. Either run from that directory or spawn `general-purpose` agents whose prompt names the persona file to read; the persona is the same either way.

*After* — append:

> **If the lane you are in cannot spawn agents, you cannot ship the translation.** An unattended Flow worker's prompt forbids spawning any agent, which makes this rule unsatisfiable from inside one — and translating inline anyway is what nine consecutive tickets of `groundhopper-log` did, producing 92 strings of register damage across four locales and three follow-up tickets to repair it. The English key ships; the fan-out is recorded as an **Owed** line on the ticket and performed attended, before the release PR, not after it. Do not translate inline and call it debt: `messages-complete.spec.ts` passes on inline text, so nothing downstream will ever tell you.

**Proposal 5 — promote the `force-dynamic` rule out of the gate bullet (§3c).**
File: `weekendgoals-ui-next/CLAUDE.md`, "Server vs Client Components" (`:25`).

*After* — append:

> **A route under `[locale]` that reads `searchParams` or `cookies()` needs `export const dynamic = "force-dynamic"`.** `generateStaticParams` makes the page a static candidate for the 17 prefixed locales, and either read throws `DYNAMIC_SERVER_USAGE` during that prerender. The default locale is rewritten and renders dynamically anyway, so **the fault is invisible on `/whatever` and 500s on all 17 `/<locale>/whatever`** — three separate routes hit this (`/log/new` in GHL-4, `/log/planned` in GHL-6, both gated layouts in the invite gate). Smoke a prefixed locale, not just the bare path.

**Proposal 6 — the undocumented e2e harness quirks (§3b).**
File: `weekendgoals-ui-next/CLAUDE.md`, "Testing" section (`:2282`).

*After* — append under the Cypress bullets:

> **Three harness facts that have each cost a session:** `cypress-mochawesome-reporter` lives in the root `node_modules`, not this workspace's, and has to be copied across the way CI does before a standalone `cypress run`. A `next-server` left listening on 4100 by a previous run means Cypress silently tests the **stale build** — kill it first. And `log-saved.cy.ts` reads `localStorage` keyed on a hardcoded `http://localhost:4100` origin, so it fails on any other port; if you moved the app to dodge a held port, that failure is the port, not a regression.

**Proposal 7 — root instruction-file staleness (§5f).**
File: `CLAUDE.md:184-190`.

*Before*:
> **The Flow plugin is used only where Vadim opens an epic for it.** Two are open as of 2026-08-24, both `Delivery: release` … `epics/groundhopper-foundation/` (the log's API) and, after its release merges, `epics/groundhopper-log/` (the `/log` UI).

*After*:
> **The Flow plugin is used only where Vadim opens an epic for it.** Both `Delivery: release` epics have shipped: `epics/groundhopper-foundation/` (the log's API, #306, merged 2026-08-26) and `epics/groundhopper-log/` (the `/log` UI, #310, merged 2026-08-28). `groundhopper-log` **stays open and unarchived** for GHL-14, the production feature grant — until it lands, `/log` 404s for every production account, and archiving the epic would drop its owed items off the board.

**Proposal 8 — record what the epic's own documents do not know (§5a, §5b, §5c).**
Three appends to `epics/groundhopper-log/`, all append-only per the log's rules:

- a `### GHL-15 — the picker is told which crossing it is — 2026-08-28 — DONE` entry in `status.md`, from the four commits and the ticket's own resolved criteria;
- an addendum recording that GHL-11's offline shell was **removed on 2026-09-02 (`4f194f8d`, PR #337)**, that Requirement 13's document-load half no longer holds, that `tickets.md:28`'s Outcome promise is superseded, and that phone check 1 now measures the store, not a worker;
- an addendum amending the `Areas in scope` line: api-gateway entered this release by three attended decisions (`privateNoStore` on `/me`, the invite gate, `GET /venues/search`), so "the API is consumed, not changed" describes the unattended lane only.

### 8b. Owed work — draft ticket sections, ready to append

> **Note on IDs.** GHL-14 is unshipped, so the next free number is GHL-17. Shipped detection reads `^<ID>[:\s]` off commit subjects on `main`, so a reused number would read as already shipped.

---

**## GHL-17 — The `log.*` register review the other 13 locales never had**

GHL-13 reviewed pt/ru/uk/pl (92 strings) and scoped the rest out: "The other 13 locales are untouched and remain unreviewed, as scoped" (`status.md:2382`). GHL-16 measured only `search.picker-title`/`-plan` in those 13 and found the pair consistent (`status.md:2447-2452`) — one string, not the block. The whole `log.*` namespace in ar, ca, da, de, es, fr, he, it, ja, ko, no, sv, zh was written inline by the unattended run and has never been read by its language expert.

**Scope.** Thirteen agents, `.claude/rules/translations.md` Mode 2: sonnet, each reading exactly its persona and its brief, the `log.*` block and its neighbouring strings inline, answering JSON and writing nothing. Run from `weekendgoals-ui-next/` so the `<code>-language-expert` types resolve. One caller merges, key order unchanged.

**Also in scope, because it is the same class and the same agents:** he and ar address the reader with a masculine imperative (`בחר`, `اختر`) in both picker strings — "the same 'commits to a male reader' problem pl was just fixed for. Neither locale was in scope and neither was touched" (`status.md:2474-2478`). Ask each for a gender-free construction, the way ru/uk/pl were asked in GHL-16.

**Not in scope.** New English copy. The `seo.*` strings (deliberately formal, `status.md:2470-2472`). The 14 `common.*`/`tickets.*`/`filters.*` strings — GHL-18.

**Acceptance criteria.**
- Each of the 13 reports either "no change" or a specific replacement naming the register, variety or agreement problem.
- he and ar each answer on the masculine imperative — a replacement, or a reasoned "no gender-free form exists here", recorded either way.
- Accepted replacements land in one commit, key order identical to `en.json` in all 13 files.
  CHECK: cd weekendgoals-ui-next && npm run test:unit
- The outcome is recorded in `status.md`, including any finding **not** taken and why.

---

**## GHL-18 — Fourteen reader-facing strings still in the formal register**

GHL-16's own entry names them: "**Owed, and NOT done here — the ticket's own measurement was incomplete.** … A scan of the whole of each file for formal pronouns and plural/reflexive imperatives finds **fourteen more reader-facing strings** in the register just corrected, none of them touched" (`status.md:2454-2465`). Vadim's `common.*` answer was already **convert** (`status.md:2391`), so the decision is made; this is the sweep.

**The fourteen** (`status.md:2462-2465`): ru — `common.share-location-description`, `common.explore-map-nearby`, `common.map-card-explore-world`, `tickets.compare-title`, `filters.matches-around-me-description`. uk — the same five keys. pt — `common.explore-map-nearby`, `menu.discover-matches`, `tickets.compare-title`, `filters.matches-around-me-description`. pl — none.

The sharpest pair, and the argument for doing it: "uk `explore-map-nearby` and pt `explore-map-nearby` are the sharpest: each sits directly beside `map-card-explore` (`Досліджуй їх на мапі`, `Explora-os no mapa`), informal, same idea, adjacent lines" (`status.md:2467-2470`).

**Scope.** Three agents (ru, uk, pt), Mode 2. No English changes.

**Not in scope.** The twelve `seo.*` description strings — "Google result text addressing a stranger, which is the one place the 'signed-out formality' argument actually holds, and changing them is an SEO decision rather than a copy one" (`status.md:2470-2472`). The other 13 locales — GHL-17 measures them.

**Acceptance criteria.**
- All fourteen match their own file's established address form; no string outside the fourteen changes.
- Key order identical to `en.json` in all three files.
  CHECK: cd weekendgoals-ui-next && npm run test:unit
- Recorded in `status.md`.

---

**## GHL-19 — Four live defects the reviews dispositioned to "retro" and nobody inherited**

Roughly thirty review nits were sent to the retro across eleven tickets and none became a ticket. These four are the ones still live in shipped code and capable of losing a user's data or hanging a page. Each is quoted from the review that found it, and each was verified against `origin/main` on 2026-09-14.

**Scope.**

1. **`queue.ts:313-321` — decide which 4xx keep the pending row.** `isRetryable` returns only `status >= 500`, so `queue.ts:282-289` `console.warn`s and deletes on 401/403/429. GHL-2's addendum: "Ticket-compliant ('Not in scope: retrying 4xx'), and the nit is right that the rationale does not cover them: **a 401 after the 30-day expiry drops an unsynced tick a re-sign-in would have landed.** Owner: **retro** — it wants a decision on which 4xx keep the row, not a quiet widening here" (`status.md:342-346`). This ticket takes the decision: 401 and 403 keep the row (the token is the transient thing, not the write); 429 keeps it and defers to the next trigger; everything else drops as now. Unit-test each branch.
2. **`TickSheet.tsx:381-386` — the note textarea has no `maxLength`.** "a 501-character note at the tick is refused by the gateway on sync and dropped silently after the receipt — the same class as the third finding, in GHL-3's surface; owner: retro" (`status.md:980-983`). `Entry.tsx` already got `maxLength` 500 and a `handleSave` refusal in `f477c743`; mirror it.
3. **`local-store.ts:89` — `openDB` at `DB_VERSION = 2` with no `blocked`/`blocking` handler.** "a tab running the pre-deploy build holds a v1 connection with no versionchange handler; a second tab opened post-deploy with `openDB(..., 2)` sits in `blocked` until the first tab closes, so every read in the new tab hangs and `/log` renders nothing" (`status.md:1220`). Add `blocking` (close this connection so the other tab can upgrade) and `blocked` (a rendered state, not a hang — and **not** a retry control, §09).
4. **`saved-matches.cy.ts:7` — `describe.skip` asserting behaviour GHL-8 reversed.** "The pre-existing `describe.skip` spec signs in with a token cookie and expects the heart to write `userSavedMatches` — the exact behaviour this ticket reversed for signed-in users; un-skipping it now fails for a reason unrelated to whatever prompted the skip; it wants deleting or rewriting as a guest spec" (`status.md:1319`). Rewrite as a guest spec, or delete it and say so.

**Not in scope.** The remaining ~26 retro nits (test hygiene, copy, date formatting) — file them as a single low-priority follow-up rather than folding them in.

**Acceptance criteria.**
- A 401 on flush leaves the pending row in the store and the row re-sends after a re-sign-in; a 400 still drops it. Unit-tested both ways.
- A 501-character note in `TickSheet` is refused at the input; the enqueued body carries at most 500 characters.
- With a v1 connection held open, a v2 `getLogDb()` renders a stated state rather than hanging, and no control in it reads as retry.
- `saved-matches.cy.ts` either passes un-skipped as a guest spec or is gone.
  CHECK: cd weekendgoals-ui-next && npm run test:unit
- GHL-1's `log.*` refusal-word CHECK still exits 0.

---

**## GHL-20 — Requirement 2's set line on the tick receipt**

`tickets.md:45-48` requires the receipt to "show a receipt naming what changed (ground number or visit number, **any set that moved**)." `TickReceipt.tsx:196-244` renders that line; `LogControls.tsx:494-502` is its only caller and passes no `setProgress`. Half of a numbered requirement is dead code, and the epic's Owed lines route it to nobody.

The ownership went round twice and stopped. GHL-3: "The receipt's `setProgress` line is wired but fed by nothing (no coverage store exists yet) — the ticket's own scope names GHL-8 for this line but the epic's own ticket numbering makes GHL-9 (Coverage) the actual owner; left as a discrepancy" (`status.md:428-431`). GHL-9: "Left `TickReceipt`'s `setProgress` prop unpopulated — GHL-3 built it and left it deliberately unwired for this ticket, and nothing in this ticket's own Scope names that wiring; it stays owed, not silently dropped" (`status.md:1381-1384`).

**Scope.** Cache coverage in the local store on `refresh()` the way plans are (`local-store.ts`), as an isolated fetch with its own `.catch()` — never inside a `Promise.all` with stats and entries (GHL-6, `status.md:1043-1055`). Compute the moved set from the store before the tick and pass it to `TickReceipt`. `13 Handoff Spec` §05's rule holds: the line is fill **and** glyph, never colour alone.

**Not in scope.** Re-fetching coverage at the tick (Rule 32 — the receipt renders from what the store holds). A set line when no set moved.

**Acceptance criteria.**
- When the ticked venue closes or advances a set the store holds, the receipt shows one set line with the fraction and the ✦; when no set moves, no line renders.
- Coverage's fetch failing leaves stats, entries and the receipt itself intact.
  CHECK: cd weekendgoals-ui-next && npm run test:unit
- Cypress `log-tick.cy.ts` gains one case with a coverage intercept.

---

**## GHL-21 — Seed the production launch sets, then finish GHL-12's checks 5 and 6**

Blocks the Outcome's Coverage evidence and the last two phone checks. Production holds **`Sets` 0, `SetMembers` 0, `SetCompletions` 0** (measured 2026-08-28, `status.md:2238-2240`); "Seeding the launch sets is `epics/groundhopper-foundation/`'s owed step and needs a chosen launch list; the three files in `scripts/data/log-sets/` are placeholders carrying invented externalIds (900001–900010)" (`status.md:2240-2243`). GHL-12's own owed line: "checks 5 and 6 against the **deployed** build on a **phone**, which needs the production launch sets seeded first" (`status.md:2285-2288`).

**Ordered after GHL-14** — the account has to hold the feature before anything can be seen.

**Scope.** Choose the launch list (a product decision, not this ticket's to make alone); replace the placeholder externalIds; run `scripts/seed-log-sets.ts` against production; then perform checks 5 and 6 on a 393px phone against the deployed build, recording what was observed rather than "passed", per `tickets.md:964-965`.

**Not in scope.** Re-doing checks 1–4 and 7–9. Any change to the set schema or Rule 44.

**Acceptance criteria.**
- Production answers a non-empty `GET /me/log/coverage` for an account holding `log`.
- Two lines in `status.md`, each naming the check, the device, the build and what was observed.
- Any failure is a new ticket, not a fix folded into this one.

---

### 8c. Planning lessons — the transferable ones, flagged

**Candidates for `METHODOLOGY.md` and the `epic`/`plan-reviewer` skills** (T1, T2, T4, T6 above are the strongest; each passes the admission test by constraining blast radius or providing decision evidence):

- **T1 — ground rules must be executable by the lane.** *"this run's spawn prompt forbids spawning any agent"* (`status.md:112-118`), recorded verbatim nine times against a ground rule requiring seventeen agents. This is the existing ticket-flow invariant "**A gate is verified at the door its actor walks through**" applied to ground rules. Proposed plan-review question: *for each ground rule, name the actor who will execute it and confirm that actor's lane permits it.*
- **T2 — a criterion no actor in the lane can execute is not a criterion.** Ten tickets deferred "demonstrate on a phone" to a document; the document merged without them (`status.md:2106`). Proposed rule: *a criterion the lane cannot perform becomes its own ticket with a human owner, ordered before the release, not a line owed to a pull request.*
- **T4 — a criterion must be falsifiable by a plausible wrong implementation.** *"`insetInlineStart !== ""` cannot fail and `textAlign === "start"` echoes the `sx` value"* (`status.md:148-151`). The epic already has the neighbouring rule for CHECK exit codes (`tickets.md:200-201`); this extends it to prose criteria.
- **T6 / the fix-bounds finding** — the full argument is in §7; it is a change to `plugins/flow/workflows/run-epic.mjs` and a CHANGELOG entry, not a document edit.
- **T3 — a stated fallback needs its trigger condition.** *"the document stays ordered so that cut remains mechanical if the run is halted mid-way"* (`tickets.md:100-101`) — four halts, cut never taken.
- **T5 — cite the handler and the response shape, not the route path.** The one API citation that was a bare route name is the one that halted a run (`status.md:1529-1550`); every citation that named a file and a line (`tickets.md:435-440`) held.

---

## 9. Spend

### The ledger, and the finding about it

```
$ node .../tickets.mjs spend groundhopper-log     # cwd /Users/vadim/projects/weekendgoals
groundhopper-log — 16 tickets · recorded 0 tokens · 16 with unknown or missing figures
  GHL-1 … GHL-11   no figure recorded — points at the run-record
  GHL-14, GHL-12, GHL-13, GHL-15, GHL-16   no figure recorded
  worker 0  reviewer 0  re-review 0  disposition 0  proxies 0
```

**The derived ledger returns nothing for all 16 tickets.** Every ticket entry says "Tokens: recorded in the run record" and every run record carries its figures as **prose**, written before the ledger's machine-readable shape existed. Per the skill, that is a finding about the log's shape, not a hand-sum. Two further shape problems the ledger exposes:

- **Six ticket entries say "recorded in the run record" for work that happened outside any run.** The GHL-3 release-branch settle-race fixes (`status.md:601`, `status.md:639-640`) were done after the final run completed; there is no run record to point at.
- **The run records themselves do not split per ticket where it matters most.** Run 3's `1,270,306` covers **six tickets and 57 agents** in one number, and run 5's `584,117` covers one ticket in a run total. Only GHL-1, GHL-2, GHL-3 and GHL-11 have an isolable worker figure. Even a machine-readable ledger could not have derived per-ticket cost for GHL-4 through GHL-10 from what was written.

### Transcribed from the run records' own `**Tokens:**` prose

All figures **output tokens, harness-observed**, read from the record as the skill asks — not estimated, not re-derived.

| Run | Record | Agents | Breakdown | Run total |
|---|---|---|---|---|
| 1 · `wf_09d707e7-c0e` | `status.md:190-193` | 7 | worker GHL-1 (sonnet) 139,922 · reviewer fable/high 22,717 · disposition fable 11,519 · proxies haiku 8,046 | **182,204** |
| 2 · `wf_fb7acb09-284` | `status.md:681-686` | 16 | workers GHL-2 125,515 + GHL-3 172,068 = 297,583 · reviewers incl. re-reviews GHL-2 25,886+37,947, GHL-3 25,965+29,845 = 119,643 · dispositions GHL-2 44,664 + GHL-3 34,244 = 78,908 · proxies 11,678 | **507,812** |
| 3 · `wf_e3f2c231-9ee` | `status.md:1482-1489` | 57 | workers (sonnet) 790,408 · reviewers + re-reviews (fable) 409,561 · proxies + haiku dispositions 55,556 · errored reviewer attempt 14,781 | **1,270,306** |
| 4 · `wf_940d4ebe-b30` | `status.md:1541-1542` | 2 | refresh+select (haiku) + worker (sonnet) | **164,008** |
| 5 · `wf_0d0554a4-30c` | `status.md:1698-1699` | 7 | worker sonnet; review + disposition fable; proxies haiku | **584,117** |
| 6 · `wf_9d7bd8de-357` | `status.md:1867-1869` | 11 | worker GHL-11 (sonnet) 132,325 · reviewer + re-review (fable) 64,357 · proxies + disposition (haiku) 9,535 | **206,217** |
| — | Attended GHL-3 rounds, `status.md:719-721` | 4 | fixer 136,020 + 146,168 = 282,188 · reviewer 83,698 + 88,838 = 172,536 | **454,724** |
| — | GHL-9 fix-bounds re-review, `status.md:1522` | 1 | | **41,368** |
| — | GHL-10 fix-bounds re-review, `status.md:1714` | 1 | | **40,465** |

**Per-ticket, where the record isolates it** (worker output tokens): GHL-1 **139,922** · GHL-2 **125,515** · GHL-3 **172,068** (+ attended fixer 282,188) · GHL-11 **132,325**. GHL-4 … GHL-10 are not separable from the log.

**Runtime meter figures, also as recorded** (a different meter, not additive with the above): GHL-2 244,314 · GHL-6 80,012 · GHL-7 179,296 · GHL-8 157,752 · GHL-11 212,446. GHL-4 and GHL-5 "read 0 on the cached replay; their first-pass meters were 291,660 and 267,317" (`status.md:1487-1489`) — an artefact of the session-limit resume, not a real zero.

### Two discrepancies worth reporting

1. **The log's own total does not match its own components.** `status.md:1870-1873` states: "**Epic total across the seven runs and the attended rounds ≈ 3.9 M output tokens**" and then lists six run totals plus the attended and re-review figures. Those components sum to **3,451,221** (2,914,664 in run totals + 454,724 attended + 81,833 re-reviews) — about 450k short of the stated ≈3.9 M. There are also **six** `### Run —` records, not seven.
2. **Everything after the final run is uncounted.** No figure exists for: the five CI rounds on #310 (`df3e33b1`, `1fcbcddd`, `2066bd76`, `57bc1d7b`, `acd1a092`, including a Fable review and re-review of `ghl-3-settle-race`); Vadim's two local passes (2026-08-26 and 2026-08-27, nine commits plus the api-gateway work); GHL-12; GHL-13 (four agents); GHL-15's 17-locale fan-out; GHL-16 (four agents). The translation rule's own figure — "~76k tokens per agent" (`weekendgoals-ui-next/CLAUDE.md:258-260`) — puts GHL-15's fan-out alone in the region of 1.3 M, which would be the second-largest single line item in the epic and does not appear anywhere.

**For the proportion argument in §7:** the two fix-bounds re-reviews cost **81,833 output tokens, 2.4 %** of the ≈3.45 M the log's components account for. The two runs that were spent partly re-doing work after halts (runs 4 and 5) cost **748,125** — nine times as much.