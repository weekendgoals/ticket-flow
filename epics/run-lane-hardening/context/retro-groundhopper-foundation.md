# Retro — `groundhopper-foundation`

Mined from `/Users/vadim/projects/weekendgoals/epics/groundhopper-foundation/{tickets.md,status.md}` (608 + 872 lines, every `### Run —` record and every addendum), the epic's 38 ID-prefixed commits on `origin/main`, and the instruction files as they stand today. Release PR #306 merged as `05c1fc65`; all six tickets shipped.

Two reading notes. Instruction-file citations for root `CLAUDE.md`, `weekendgoals-common/CLAUDE.md` and `weekendgoals-types/CLAUDE.md` are identical in the working tree and on `origin/main`; `api-gateway/CLAUDE.md` differs (the checkout sits on `epic/redesign-foundation`), so every line number I give for that file is **`origin/main`'s**. Every code claim below was re-verified against `origin/main` today, not taken from the log.

---

## 1. Outcome

The Outcome line (`tickets.md:15-31`) named an observable change, two pieces of evidence and a reversal condition. **Achieved on the first evidence clause; the second was never recorded; the reversal condition watched the wrong direction and a different production defect got through it.**

**The change itself: achieved.** "A Google-signed-in user can, over HTTP, create and read their own log entries and plans, get their career stats, and see coverage over seeded sets." All of it is on `origin/main`: the `/me` mount (`api-gateway/src/handlers/router.ts`), five entry routes, five plan routes, `GET /me/log/stats`, and three coverage routes. Rule 32 holds at `api-gateway/src/services/log/index.ts` (`buildSnapshot`, never re-read); every write is idempotent on `clientId`; ownership is `(userId, _id)` with 404 on foreign ids.

**Evidence clause 1 — achieved, cited.** `cd api-gateway && npm test` with `test/it/me/*.it.ts` covering the named negatives. The log carries the counts at each step: 829 → 852 → 859 → 888 → 901 → 926 → 935 → 956 passed, 13 skipped throughout, 0 failed (`status.md:71`, `:123`, `:200`, `:475`, `:506`, `:648`, `:720`, `:774`). Every named negative is pinned: no token / guest / expired / non-existent-user (`test/it/me/auth.it.ts`), foreign id 404 (`log-entries.it.ts:491`), locked field 400 (`:437`), duplicate match 409 (`:134`), user token refused on `PUT /venues/:id` and an `/ingest` route (`write-auth.it.ts`).

**Evidence clause 2 — never recorded.** "After the release deploys, `GET /me` on production answers 200 for a Google session and 401 for a guest cookie, checked by hand." No entry in this status log, and none in `epics/groundhopper-log/status.md`, records that check. What exists instead is stronger indirect evidence, measured three days later in a downstream epic: `epics/groundhopper-log/status.md` (commit `2626ebe3`, 2026-08-28) records production holding `LogEntries` 2, `Plans` 3, `Users` 14 — the server side is live and real signed-in users are writing to it. The hand-check was simply skipped, and the closing run record (`status.md:848` "ran to completion") does not notice.

**Reversal condition — not triggered, and too narrowly drawn.** "If the release breaks the guest flow in production (a 401 anywhere outside `/me`)" — no such 401 was ever observed, correctly, because `writeAuthMiddleware()`'s exemption is path-scoped and the mount is `/me`-only. But the epic **did** ship a production defect, and it was inside `/me`, where the reversal condition was not looking:

> "This closed a real leak, found 2026-08-26 by signing in as a second local user and being shown the first user's log. A browser's HTTP cache keys on the URL and **not** on the `Authorization` header, so `GET /me/log/stats` for account B was served account A's response for up to half an hour" — `api-gateway/CLAUDE.md:303-321` (origin/main)

`app.ts:48` puts `expires()` on the whole of `/api/v1` (`public, max-age=1800`). GHF-1 mounted an authenticated subtree under it and exempted nothing. Neither the ticket, the plan, the `xhigh` review of GHF-1, nor the epic's own ground rule "Nothing is public" (`tickets.md:153-155`) caught it. It was fixed one day after the release, in a different epic, in `425db4f4`. This is the single most consequential finding of the retro: **the epic's one Important production defect was a cross-user data leak, and every gate the epic had was pointed away from it.**

---

## 2. Still owed

Every `Owed` line and every finding dispositioned pre-existing or out of scope, checked against `origin/main` today. **Twelve items were recorded; ten are still open; no shipped ticket inherited any of them.**

| # | Item | Recorded at | State on `origin/main` today |
|---|---|---|---|
| 1 | `secret-provider.ts` never calls `done` when a token's `iss` matches neither `arn:user:` nor `arn:guest:` — the request hangs until the socket times out. Reachable on `GET /me` since GHF-1 mounted it. | `status.md:91` (GHF-1 review), repeated `:148`, `:243`, `:322`, `:414`, `:526`, `:676`, `:806` — **eight times** | **OPEN.** `api-gateway/src/middleware/passport/secret-provider.ts:13-19`: `if (userId) … else if (guestId) …` with no final `else done(…)`. Owner named as "the security epic" five times; no security ticket exists that names it. |
| 2 | `VenuesMongoDao.get(venueId)` throws an unguarded `TypeError` instead of returning null when the id resolves to no document. | `status.md:152-157` | **OPEN.** `api-gateway/src/dao/venues/venues-mongo-dao.ts:16-20` returns `VenuesMongoDao.toVenue(null)`; `toVenue` (`:904`) destructures its argument. Owner "whoever next touches the file" — GHF-2's own review fix `a0d681c7` touched that exact file and did not. |
| 3 | `GET /me/plans` is unbounded, against the epic's own "Pagination is bounded" ground rule. | `status.md:389-392`, `:456-463` — "**retro** decides whether it becomes owed work" | **OPEN, and explicitly handed to this retro.** `api-gateway/src/dao/plans/plans-mongo-dao.ts:53-56`: `PlanModel.find({ userId }).sort({ kickoffAt: 1 })`, no limit. |
| 4 | `POST /me/plans/:id/confirm` retry after the plan is already deleted answers 404, not the idempotent 200. | `status.md:421-424` (GHF-3 owed), re-reported as pre-existing by GHF-6's review (`:811`) with "owner: **GHF-3**" — a shipped ticket | **OPEN.** No ticket can inherit it: GHF-3 shipped 2026-08-25. |
| 5 | `getEntry` compares ids case-sensitively after a case-insensitive validity check. | `status.md:532` nit (2) | **OPEN.** `OBJECT_ID_RE = /^[0-9a-f]{24}$/i` (`services/log/index.ts:47`) then `entry._id === id` (`:348`, `:449`). Unreachable in practice; genuinely low priority. |
| 6 | `seed-log-sets.ts` connects with a bare `mongoose.connect(DB_URL, …)`, no `user`/`pass`, while Terraform ships `DB_USER`/`DB_PASSWORD` separately — and it is the one script sanctioned to write production. | `status.md:702-708`, "Owner: retro" | **OPEN, handed to this retro.** `api-gateway/scripts/seed-log-sets.ts:208`. Note the mitigation is real: it fails loud and writes nothing. |
| 7 | `confirmPlan` copies `createEntry`'s insert + duplicate-key block instead of sharing one path — "it matters before GHF-6 hangs a completion stamp on entry creation — **retro**, to hand to that ticket." | `status.md:465-469` | **OPEN, and the window closed.** GHF-6 shipped without the extraction; both `createEntry` (`services/log/index.ts:296`) and `confirmPlan` (`:806`) now call `maybeStampCompletions` from their own copy of the block. |
| 8 | GHF-6's five nits: stamping never retried after a non-11000 fault; `nearestSetOf` answers `remaining: 0` for an unstamped fully-covered set; completion-order sort maps `null visitedOn` to `""` so a late member sorts first; a vacuous coverage test; a test title promising more than it asserts. | `status.md:811` | **ALL FIVE OPEN.** `coverage.ts:55-83` (no zero-remaining guard); `services/log/index.ts:596-597` (`(a.visitedOn ?? "").localeCompare(…)`); `test/it/me/coverage.it.ts` at the manual-entry test and the "foreign or unknown" test. |
| 9 | GHF-2's three retro nits: the list route untested; the index test checks key sets only; the manual `playedOn` future check uses the UTC date. | `status.md:179-186` | **ALL THREE OPEN.** There is no `GET /me/log/entries` list test at all on main — order, `total`, the 500 clamp and `limit=0`/`limit=abc` are asserted nowhere (`git grep` for `limit=` in `api-gateway/test/it/me` returns nothing). The index test (`log-entries.it.ts:575-587`) asserts three `JSON.stringify(i.key)` values and never touches `unique` or `partialFilterExpression` — the partial filter is the whole reason manual entries don't collide. |
| 10 | `error.ts` echoes a non-`HttpError`'s raw `err.message` to the client — `LogService.createEntry`'s unexplained-E11000 rethrow would surface Mongo's duplicate-key text (collection, index name, userId). Owner: **SEC-12**. | `status.md:186-191`, `:315-318` | **OPEN.** `api-gateway/src/handlers/middleware/error.ts:43`: `response.status(status).json({ message: err.message })`. |
| 11 | The scraper writes `localTimeKickoff` as the same instant as `kickoff` while `docs/database.md:62` documents it as "Local timezone kickoff". Owner: **retro** — "the data-integrity epic is archived and no live ticket owns the scraper's match writer." | `status.md:191-196`, `:318-320` | **OPEN, explicitly this retro's.** `weekendgoals-scraper/src/api-football/matches.ts:709`: `moment(fixture.date).tz(timezone).toDate()`. `docs/database.md:62` still says "Local timezone kickoff". |
| 12 | The launch set list, and seeding sets on production by hand. | `tickets.md:92-95`, `status.md:856-863` | **HALF DISCHARGED, HALF OPEN.** The list shipped outside this epic (`7cab2565`, 2026-08-28: `the-92`, `premier-league-2026-27`, `scottish-premiership-2026-27`, `bundesliga-2026-27`). **Production still holds zero `Sets`** — measured 2026-08-28 in `2626ebe3`: "`Sets` 0, `SetMembers` 0, `SetCompletions` 0". It has already cost the downstream epic two acceptance checks: `epics/groundhopper-log/tickets.md:957-961` — "on production it needs the launch sets seeded first (`scripts/seed-log-sets.ts`), **which is its own owed step from `epics/groundhopper-foundation/`**". |

Two items **were** discharged: the missing status-log record of GHF-2's manual merge (`status.md:416-418`), closed by the third run record's own line "GHF-3's entry also records, as owed, that the driver's conflict merge on `ghf-2` (`a5d96449`) has no status-log line of its own — this record is that line" (`status.md:604-607`); and the `nominatim:` exclusion in `derive-set-members.ts`, fixed in `ba81d010` (though the underlying limit — 686 venues can never be set members — stands, and `7cab2565` records that no launch club was actually dropped for it).

**The pattern.** Ten open items, and the owner field failed in every shape it can fail: named an epic that has no such ticket (#1), named a role rather than a person (#2), named a shipped ticket (#4, #7), named "the retro" and stopped (#3, #6, #11), or named nothing (#8, #9). `status.md:526-530`, `:675-682` and `:805-809` are three consecutive tickets each re-listing the same four items verbatim and each saying "none is in this ticket's scope" — an owed list can be re-copied forever without anyone owning it. **This is the retro's job to close, and it is the largest single deliverable here.**

---

## 3. Rediscovered — learned twice, documented zero times

**A. `npm run lint` cannot run — rediscovered six times, once per ticket, and the instruction file still says the opposite.**

Every entry: `status.md:74-77` (GHF-1), `:126-128` (GHF-2), `:367-370` (GHF-3), `:509-511` (GHF-4), `:650-652` (GHF-5), `:776-778` (GHF-6). Verbatim from GHF-3: "`npm run lint` still cannot run in any of the three — `eslint.config.js` is still missing (ESLint 9 flat config), the same pre-existing gap GHF-1 and GHF-2 recorded."

Six workers each spent a tool call learning it and a paragraph re-recording it, and it is documented in **no** instruction file. Root `CLAUDE.md:11-12` actively asserts the opposite: "`npm run lint` and `npm run lint:fix` work in any package directory." Verified: all four `package.json`s pin `eslint: ^9.19.0`; all three lint scripts are `eslint . --ext .js,.ts` (the `--ext` flag was removed in ESLint 9); the repo ships `.eslintrc.js` and no `eslint.config.js`. **The one line that would have saved six rediscoveries is a correction to a line that is already there and is wrong.**

**B. `Match.localTimeKickoff` is not a local time — rediscovered four times, in four different shapes.**

1. The **plan itself** encoded the misconception: `tickets.md:159-161` — "`playedOn` is a `YYYY-MM-DD` string — the local date at the ground (`localTimeKickoff` for catalog matches)."
2. GHF-2 shipped it, and review caught it as **Important #2**: "a Saturday 21:30 kickoff in São Paulo logged as Sunday" (`status.md:164-168`). Fixed in `550359f3`. The addendum reported the contradiction rather than adapting silently and left `tickets.md` unedited (`status.md:174-176`).
3. GHF-5 **rediscovered it anyway**, three tickets later, in a script that never touches a log entry: `status.md:663-668` justifies the season window with "to match how `Match.localTimeKickoff` stores the ground's local date as a UTC-rendered instant" — and its own review nit corrects it: "the UTC-window comment at `derive-set-members.ts:52-57` claimed `localTimeKickoff` is a rendered local date; it is the same instant as `kickoff` … this entry's Decisions paragraph carries the same wrong justification" (`status.md:692-698`).
4. The **source** is still wrong: `weekendgoals-scraper/src/api-football/matches.ts:709` and `docs/database.md:62` ("Local timezone kickoff").

The correction was written into `api-gateway/CLAUDE.md:570-577` — inside the section titled "Me and the log: entries (GHF-2)". GHF-5's worker was writing a seed script and had no reason to read that section. **A fact about the catalog was filed under the feature that discovered it, so the next reader of the catalog missed it.**

**C. The api-gateway test suite writes ~1.2 MB of console noise per `/me` run — rediscovered twice, documented nowhere.**

First by GHF-2's worker: "`tickets.mjs check GHF-2` itself hit `ENOBUFS` on the migration console noise the harness buffers, so the identical command was run directly" (`status.md:118-120`). Then by the driver's own gate two records later, where it halted the run: "writes 1,208,247 bytes to stdout/stderr (the suite's migration and Mongo console noise)" (`status.md:305-306`). The worker had already met it and said so; nothing read that. `grep -n "ENOBUFS\|maxBuffer\|console noise"` over `CLAUDE.md` and `api-gateway/CLAUDE.md` returns nothing; the Testing section (`api-gateway/CLAUDE.md:2932-2950`) does not mention it.

**D. Minor, twice each:** `VenuesMongoDao.get()`'s null crash (GHF-2's Decisions worked around it at `status.md:132-136`, GHF-2's review re-reported it as a projection habit at `:321-323`); and `Venue.externalId` is a `String` while `SetMembers.venueExternalId` is a `Number` (GHF-5 Decisions `status.md:660-663`, and GHF-5's Important finding, which is the same mismatch biting).

---

## 4. What review kept finding

Six `xhigh` reviews (all fable). **4 Important across the epic — GHF-2 ×2, GHF-3 ×1, GHF-5 ×1 — every one confirmed and fixed before merge.** GHF-1, GHF-4 and GHF-6 had zero. But the nits cluster hard into three classes, and each class is a missing invariant, not six independent slips.

**Class 1 — tests that execute code without checking it. Five instances, four tickets.** This is the exact defect the review skill names as the most common in agent-written code (`skills/review/SKILL.md:57-62`), and this epic produced it once per ticket that wrote tests.

- GHF-6, still on `origin/main`, `test/it/me/coverage.it.ts` ("a manual entry with no venueId never closes a set"): seeds a one-venue set and a manual entry naming no venue, then asserts `await SetCompletionModel.countDocuments({})` is `0` — which holds whether `maybeStampCompletions` ran or not. The reviewer's own words: "proving only that the path does not throw; the untested case is a manual entry WITH a member `venueId` closing a set" (`status.md:811`).
- GHF-2, still on main: the index test (`log-entries.it.ts:575-587`) asserts three key shapes and never `unique` or `partialFilterExpression` — so the acceptance criterion "The three indexes exist after `Model.init()`" passes even if the partial filter, the thing that keeps manual entries from colliding, were dropped.
- GHF-2, still on main: `GET /me/log/entries` has **no** test — the route is exercised only by the guest-401 case.
- GHF-3, fixed in `de664061`: the happy-path confirm asserted none of the reference ids it exists to write.
- GHF-5, fixed in `0baab18c`: the apply IT test counted rows instead of reading back `venueId`/`venueExternalId`/`label`; a second test's name promised a function it never called.

**Class 2 — negative coverage asserted on a sample of routes and titled as if it were all of them. Three tickets, two still on main.**

- `test/it/me/log-entries.it.ts:553`, still on main, is titled `"401s every route"` and tests exactly two: `GET` list and `POST`. `GET :id`, `PATCH` and `DELETE` are not covered. GHF-3's review flagged this explicitly and could not fix another ticket's file: "GHF-2's `log-entries.it.ts` still has the two-route pattern — **retro**" (`status.md:450-452`).
- `test/it/me/coverage.it.ts`, still on main, titled `"a foreign or unknown entry id 404s"` and sends only an unknown id (`new mongoose.Types.ObjectId()`); `coverage.it.ts` and `log-stats.it.ts` each carry one `"a guest token 401s"` test against one of their three (resp. one) routes.
- GHF-3 fixed its own instance in `de664061` (PATCH, `/confirm` and DELETE now 401 a guest).

To be fair to the epic: `write-auth.it.ts:156-176` **does** walk all seven `/me` mutating routes and assert the ingest-token-alone 401 generically, behind `MIN_ME_MUTATING_ROUTES`. That walker is the pattern that works and it caught nothing because nothing slipped past it. The per-suite negatives are where the gaps are — precisely because they are hand-enumerated. **The invariant is: a negative case for a `/me` subtree is walked, not listed.**

**Class 3 — one document contradicting another, four times.** GHF-4's review found `api-gateway/CLAUDE.md`'s GHF-2 section claiming the log list's Mongo query is bounded while the GHF-4 section says it is not (`status.md:532`, fixed `dcf10cf4`). GHF-2's addendum found `tickets.md`'s ground rule naming the wrong mechanism (`status.md:174-176`). GHF-3's entry found the status log's own run records contradicting the epic branch (`status.md:394-412`). GHF-5's re-review read a stale root `CLAUDE.md` and reported a paragraph that had already been amended in `4be3b3f4` — the driver had to check and dismiss it (`status.md:850-854`). Three of these four are drift **between** documents that each read correctly alone — the exact failure ticket-flow's own `CLAUDE.md` records from the autonomous epic.

---

## 5. Codebase vs documents

**The documents owe the codebase (instruction files the work made stale):**

1. **`weekendgoals-common/CLAUDE.md:20`** — "`src/models/` - Mongoose schemas and models (venues, leagues, tickets, users, cities, attractions)". This epic added **five** model folders there — `log-entries`, `plans`, and `sets` (holding `Sets`, `SetMembers`, `SetCompletions`) — and `weekendgoals-common/CLAUDE.md` appears in **no** GHF commit. The epic named `weekendgoals-common` in "Areas in scope" (`tickets.md:70-74`) but its ground rule only bound `api-gateway/CLAUDE.md` (`tickets.md:166-168`), so the area in scope whose instruction file was not named went unupdated.
2. **`weekendgoals-types/CLAUDE.md:36`** — "`log/` - `LogEntry`/`Plan` and their request shapes". GHF-5 added `src/log/sets.ts` and GHF-6 added `src/log/coverage.ts`; neither extended the line. Sharper still: this line exists **only** because GHF-3 shipped `6a105ba7` "list the log/ domain in weekendgoals-types CLAUDE.md (**gap GHF-2 left**)" — the same gap was left, noticed, fixed by the next ticket, and then re-opened by the two after it. One ticket paying another's documentation debt is not a mechanism.
3. **Root `CLAUDE.md:11-12`** — the false lint claim (§3A).
4. **`docs/database.md:62`** — "`localTimeKickoff` | Date | Local timezone kickoff", the misnomer at its source (§3B).

**The codebase owes the documents (scope that shipped beyond a ticket, or quietly did not):**

5. **A shared read path changed outside the declared consequence paths.** `Consequence paths` (`tickets.md:100`) lists `middleware/**`, `handlers/router.ts`, `handlers/me/**`, `handlers/middleware/error.ts`, `weekendgoals-common/src/models/**`. GHF-2's review-fix `a0d681c7` edited `api-gateway/src/dao/venues/venues-mongo-dao.ts`'s `toVenue` — the projection every venue read in the service goes through — adding `cityId` and `countryId` to **every** `GET /venues*` response. The change is additive and correct, and I am not calling it a defect. But the tier floor is computed from the diff's file list *before* review, so a review fix can land outside the paths the tier was floored on and nothing re-floors it. Nothing in the log notices.
6. **An acceptance criterion that was true for three days.** `tickets.md:541-543`: `CHECK: ls api-gateway/scripts/data/log-sets/*.json | wc -l` / `EXPECT: 3`. That directory now holds **seven** files. The test encoded the same assumption, and the consequence is on the record in `5bcaa8e6` (2026-08-28): *"adding the four derived launch candidates failed CI twice over: the count assertion read 7 where it expects 3, and the `--apply` test…"*. A criterion pinned to a count of files in a directory that the epic's own owed work was going to grow.
7. **What quietly did not ship, with no Owed line:** nothing. Every requirement in `tickets.md:33-66` has code behind it. Requirement 10 (delete consequences) and Requirement 9 (stamped completions) both shipped in GHF-6. The scope discipline in this epic was genuinely good.
8. **`api-gateway/CLAUDE.md` is accurate and unusually good.** `:258-357` (the mount), `:526-660` (entries), `:661-744` (plans), `:745-831` (sets), `:832-925` (coverage) — I checked each substantive claim against the code and found no drift, including the two the reviews corrected. The ground rule "api-gateway/CLAUDE.md is updated in the same commit as each ticket" worked exactly as designed. That is the strongest evidence in this epic for keeping that ground rule, and for extending it to the other in-scope areas' files.

---

## 6. What planning got wrong

**1. The plan encoded a false fact about the catalog and it took a review to catch it.** `tickets.md:159-161` named `localTimeKickoff` as the source of the local date. It is not. GHF-2 built exactly what the plan said and shipped a date bug; review caught it as Important #2. Because the log is append-only, `tickets.md` was correctly left unedited (`status.md:174-176`) — with the consequence that **the plan on disk still tells the wrong story**, and GHF-5 walked into it three tickets later. *Project-specific ground rule.*

**2. The plan contradicted its own ground rule, and the contradiction shipped.** `tickets.md:163-165`: "**Pagination is bounded** … list routes take `limit` (default 200, max 500) and `offset`." `tickets.md:389`: "`GET /me/plans` → `{ plans }`, soonest `kickoffAt` first" — no `limit`, no `offset`. The worker followed the route signature over the ground rule, invented a rationale for it ("self-limiting"), and the reviewer proved the rationale false: "`PlansMongoDao.list` filters on `userId` only, so a past-kickoff plan never confirmed or dismissed is returned forever (and must be, for the 'were you there?' ask)" (`status.md:456-459`). The fix that shipped was to the *documentation*, not the route (`7fe3a4da`), and the decision was deferred to this retro. **A ground rule that a later section of the same document violates is not a ground rule; the plan review should be checking the tickets against the ground rules, not only against the design.** *Transferable — candidate for the methodology.*

**3. The plan prescribed a construct that does not run.** `tickets.md:231-234` specified the walker assertions "written with a guard **and** a floor constant (`MIN_ME_MUTATING_ROUTES`, 0 here)". The worker: "Jest refuses an empty-array `.each` table outright; the floor constant alone does not prevent that crash" (`status.md:84-87`). Harmless — the worker handled it — but it is a plan specifying implementation detail at a level it cannot verify.

**4. Every CHECK's EXPECT string is decorative.** Five of the epic's eight CHECK criteria are `npx jest <paths>` with `EXPECT: Tests:`. `tickets.mjs`'s runner computes `passed = okExit && okExpect` — the exit code already carries the whole signal, and `Tests:` appears in jest's output on failure too. So the criteria whose prose promises something specific — "The three indexes exist after `Model.init()`" (`tickets.md:361`), "When two posts name the same `matchId` … the second answers 409" (`:341`) — are gated by a command that cannot distinguish those from any other test in the run. The one genuinely specific EXPECT in the epic (`grep -c "Me and the log" api-gateway/CLAUDE.md` / `EXPECT: 1`, `tickets.md:260-261`) is the shape the others should have taken. This is not a defect that bit — the suite was honest — but it means **the gate the run driver re-runs from the signed-off document was, for five of six tickets, "the suite is green", nothing more.** *Transferable.*

**5. GHF-2 was three tickets, and its size shows in every measure.** Its scope (`tickets.md:271-332`) is: extend the error path repo-wide; add a types module; add a Mongoose model with three indexes; add a DAO; add a service with two snapshot builders; add five HTTP routes with four distinct error codes; add typed api-client methods; raise a walker floor; extend CLAUDE.md. It cost 110,939 worker output tokens — 2.3× the epic's median (65,388) and more than GHF-5 and GHF-6 combined *minus* one. It drew both of the epic's `snapshot`-level Important findings, three of the four still-open test nits, and it is the only ticket whose review had to be run twice for reasons other than fix commits. Compare GHF-1 (48,379) and GHF-4 (44,146): each one idea, each zero Important. The epic's ordering rationale (`tickets.md:180-188`) is careful and correct about *sequence* and says nothing about *size*. **A natural split is visible in its own commit list**: `b8976503` (error path), `8924fdca` (types + model), `af5900a9` (DAO + service), `05d9d7b2` (routes) — the worker split it into four commits because it is four things. *Transferable — candidate for the methodology: if a ticket's scope bullets name more than one layer boundary, the reviewer of the plan should be asked why it is one ticket.*

**6. The plan's threat model was auth, and the defect was caching.** The whole epic — the ordering rationale ("GHF-1 … is the one security-sensitive change in the plan: it must be reviewed alone"), the halt condition ("if GHF-1 shows the guest flow cannot survive the `/me` mount"), the reversal condition, the walker, the four negative-token clients — is built around *who can reach `/me`*. Nobody asked *what happens to a `/me` response after it leaves*. The answer was in `app.ts:48` the entire time. `tickets.md:100`'s consequence paths include `middleware/**` — the very directory `expires()` lives in — and the tier machinery floored GHF-1 at `consequence` on exactly that basis (`status.md:209-211`), which got it an `xhigh` review that still missed it. **A tier is a budget, not a checklist**; what was missing was a question. *Transferable — candidate for the methodology: when a ticket introduces the first per-user response on a previously anonymous surface, the ground rules should require naming every middleware already mounted above it.*

---

## 7. Halts

Four `### Run —` records. Three halted, one completed. **Not one halt was caused by the ticket's implementation (WORK) or by the plan (PLAN). All three — and two further stalls inside the third record — were the machinery.** Meanwhile the reviews found four Important defects in the work and none of them ever caused a halt: the review gate absorbed them without stopping.

### Halt 1 — reviewer could not be hired

**Record:** `### Run — 2026-08-24 — halted` (`status.md:204`), run `wf_cf04a9fd-4f8`, ticket GHF-2.
**Halted on** (`status.md:236-240`): *"`reviewer-spawn failure after the sanctioned fallback also fails` — ticket GHF-2, where: hiring the reviewer for GHF-2. Detail … both the `flow:ticket-reviewer` agent and the sanctioned general-agent fallback returned no review; the branch `ghf-2` stays pushed and unmerged — an unreviewed ticket is never merged. Cause, from the harness: **'You've hit your session limit · resets 1:20am (Asia/Jerusalem)'** on both spawns — an environment failure, not a finding about the ticket."*

**Classification: PLUGIN/ENVIRONMENT** — an agent-spawn failure, and the log itself says so in those words. The fallback path worked as designed and failed for the same external reason as the primary, which is the one failure mode a single retry cannot cover.

**What a human did:** waited for the reset and resumed the same run — `status.md:261-263`: *"the same run `wf_cf04a9fd-4f8` resumed after the session limit reset."* Cost: 25,152 output tokens on the errored attempt (`status.md:227-228`), one calendar day, no rework.

**Did it retire a real risk? Yes — emphatically, and it is the only one of the three that did.** The stop condition is "an unreviewed ticket is never merged." When that review finally ran, it returned **2 Important findings, both confirmed** (`status.md:270-278`). Had the driver improvised past the failed hire and merged, `snapshot.venueCountryId` would have been null **forever under Rule 32** — the reviewer's own note: *"frozen forever under Rule 32; GHF-4's country count would have fallen to supplier text"* — and every São Paulo evening kickoff would have been logged a day late, in immutable rows. Not a false alarm: the stop condition caught the epic's two most expensive defects by refusing to move.

### Halt 2 — ENOBUFS on a passing CHECK

**Record:** `### Run — 2026-08-24 (resumed 2026-08-25) — halted` (`status.md:259`), same run, ticket GHF-2.
**Halted on** (`status.md:294-298`): *"`a failed acceptance CHECK — a machine-runnable criterion whose command did not produce its expected result on the pushed branch` — ticket GHF-2 … Detail: '1 of 1 CHECK criteria failed on the pushed branch, judged against the signed-off document on epic/groundhopper-foundation: The three indexes exist after `Model.init()`. — **command could not run: spawnSync /bin/sh ENOBUFS**'."*
**Driver diagnosis** (`status.md:300-311`): *"the CHECK command … run by hand on `origin/ghf-2` at `8ca4b15a` **passes — 4 suites, 68/68 tests** — but writes 1,208,247 bytes to stdout/stderr … and `tickets.mjs check` runs it through `spawnSync` with no `maxBuffer` (`scripts/tickets.mjs:273`; Node's default is 1 MiB), so the runner fails with ENOBUFS before reading the result. The worker had met the same failure and said so in its entry. **The criterion is satisfied; the gate could not see it.** … Nothing in the ticket's branch is wrong on this evidence."*

**Classification: PLUGIN/ENVIRONMENT** — a buffer limit in the plugin's check runner, named at a specific line.

**What a human did:** fixed the plugin — *"resumed twice more on 2026-08-25 after the plugin's check runner gained a `maxBuffer` (the ENOBUFS halt above)"* (`status.md:535-537`).

**Real risk or false alarm? A false alarm about the work, a true one about the instrument.** The ticket was green; the halt fired on a green ticket. But the driver was right not to record a pass it could not observe — a check runner that treats "the command died" as "the check passed" is the fail-open shape the doctrine forbids. **This lesson has already shipped.** `plugins/flow/scripts/tickets.mjs` now carries `CHECK_MAX_BUFFER = 64 * 1024 * 1024` with a comment naming this exact incident: *"the first live hit was a passing 68/68 jest run printing ~1.2 MB of Mongo logs: the child died on ENOBUFS, the ledger saw a dead command, and the run halted on a green ticket."* No proposal needed.

### Halt 2b — the cached replay of a fixed failure

**Recorded inside the third run record** (`status.md:537-540`): *"first resume replayed the stale failed acceptance from cache (0 tokens) and halted again; the driver removed that one cached entry and resumed."*

**Classification: PLUGIN/ENVIRONMENT** — the workflow runtime's step cache is keyed on step identity and the run's pinned date, not on whether the thing that made the step fail has been repaired. The plugin had just been fixed; the run replayed the memory of the pre-fix failure.

**What a human did:** deleted that one cached entry by hand and resumed. Note the compounding cause: *"The run's `today` stayed 2026-08-24 throughout so cached steps matched"* (`status.md:543-544`) — the same date-pinning that makes the cache usable is what made the stale entry match.

**Real risk or false alarm? Pure false alarm — zero risk retired.** It cost 0 tokens and one human intervention, which sounds cheap, but in an unattended run a halt is not cheap: it is the end of the run. This is the one halt in the epic where the stop condition fired on nothing at all — not on the work, not even on a live instrument fault, but on a recording of one.

### Halt 2c — the status log conflicting with itself

Also inside the third record (`status.md:540-543`): *"GHF-2's acceptance then passed live, its merge conflicted on this status log (the driver's own run records versus the ticket's entries — both appended to the end of the same file); the driver reconciled that on `ghf-2` keeping both (`a5d96449`) and resumed once more."*

**Classification: PLUGIN/ENVIRONMENT, shading into PLAN.** Not a `**Halted on:**` line, so not formally a halt, but a stall that consumed a resume. The structural cause is that `status.md` is append-only with **two** writers appending to the same tail — the worker writing its ticket entry, and the driver writing run records — so any run that produces both in one cycle conflicts by construction. The merge commit `a5d96449` is visible in the shipped history as `GHF-2: merge epic/groundhopper-foundation (keep both run records and the ticket's entries in the status log)`. Downstream, this is what produced Halt 3's precondition: GHF-3's worker then found the status log's run records contradicting the epic branch (`status.md:394-412`) and had to verify the merge was genuine before trusting it.

**Real risk or false alarm? Neither — a real, recurring mechanical cost with no risk behind it.** Two writers, one append point.

### Halt 3 — the addendum the gate could not see, because the date rolled over

**Record:** `### Run — 2026-08-24 (resumed 2026-08-25, second and third resumes) — halted` (`status.md:533`), ticket GHF-4.
**Halted on** (`status.md:577-583`): *"`BLOCKED — a worker wrote a BLOCKED (or ABANDONED) status entry, or ended in any state but integrated` — ticket GHF-4, where: resolving GHF-4's pushed branch before the merge. Detail: '**no `Addendum — review — 2026-08-24` line under GHF-4's own entries** in `epics/groundhopper-foundation/status.md` on `origin/ghf-4` (count 0) — the disposition said it committed the addendum, the branch says otherwise, and the branch is the evidence.'"*
**Driver diagnosis** (`status.md:585-598`): *"the addendum exists on `origin/ghf-4` (status.md line 532) and is complete — it is dated **2026-08-25**, the day it ran, while the script instructed the disposition to date it with the run's pinned `2026-08-24` (`run-epic.mjs:998`) and the resolve step greps for that pinned date (`:1289`). **The agent used its own clock; the gate used the run's.** GHF-4 is reviewed on the record under the wrong date string. Nothing in the branch is wrong on this evidence."*

**Classification: PLUGIN/ENVIRONMENT** — a date-keyed lookup that broke when the run crossed midnight, exactly as the prompt anticipated. And it did not fire alone: *"the auto-mode classifier refused both a dated correction note on `ghf-4` and an attended merge of the verified head"* (`status.md:592-594`) — a **second** environment failure (the permission surface) stacked on the first, converting a recoverable gate miss into a mandatory human step.

**What a human did:** merged `dcf10cf4` into `epic/groundhopper-foundation` by hand, then started a fresh run dated 2026-08-25 (`status.md:594-596`, and the fourth record's own opening: *"a fresh run dated 2026-08-25 started after GHF-4 was integrated by hand"*, `status.md:816-817`).

**Real risk or false alarm? False alarm — the log says so twice.** "Nothing in the branch is wrong on this evidence." GHF-4 was reviewed, at `xhigh`, 0 Important, 1/1 CHECKs — everything the gate exists to confirm was true, and the gate could not read it because of a string. The record even writes its own fix: *"Lesson for the plugin: pin the addendum date in code, not in the prompt — or grep for any `Addendum — review —` under the ticket's entries."* **This lesson has already shipped too**: `plugins/flow/workflows/run-epic.mjs:1332` now greps `Addendum — review — [0-9]{4}-[0-9]{2}-[0-9]{2}`, and the comment at `:1335` cites this incident by name — *"a gate grepping for the pinned value once halted a green ticket on exactly that."*

### Run 4 — no halt

`### Run — 2026-08-25 — completed` (`status.md:813`), run `wf_aca8af92-708`. GHF-5 (1 Important, fixed, re-reviewed clean, 2/2 CHECKs, merged) and GHF-6 (0 Important, 1/1 CHECKs, merged as `a0bda070`). *"**Halted on:** ran to completion"* (`status.md:848`). Release PR #306 opened (`status.md:870-872`), merged as `05c1fc65`.

### The tally

| Halt | Ticket | Cause | Human action | Risk retired? |
|---|---|---|---|---|
| Reviewer-spawn failure (session limit, both spawns) | GHF-2 | PLUGIN/ENV | waited for reset, resumed | **Yes** — the review then found 2 Important, both frozen-forever under Rule 32 |
| ENOBUFS on a 68/68-passing CHECK | GHF-2 | PLUGIN/ENV | gave the check runner a `maxBuffer`; **fixed in the plugin** | No on the ticket; yes on fail-open. False alarm about the work |
| Cached replay of the fixed ENOBUFS failure | GHF-2 | PLUGIN/ENV | deleted one cache entry by hand | **No** — pure false alarm, 0 tokens, one lost run |
| (status-log merge conflict, not a formal halt) | GHF-2 | PLUGIN/ENV + PLAN | reconciled on `ghf-2`, kept both (`a5d96449`) | n/a — structural, two writers one tail |
| Addendum date-keyed grep + auto-mode classifier refusal | GHF-4 | PLUGIN/ENV ×2 | merged `dcf10cf4` by hand, started a fresh dated run; **fixed in the plugin** | **No** — false alarm on a green, reviewed ticket |

**WORK: 0. PLAN: 0. PLUGIN/ENVIRONMENT: 5.** Three of the five were false alarms on green tickets; two of those three are already fixed upstream. The one halt that retired real risk did so not by detecting anything but by **refusing to proceed without a signal it did not have** — which is the shape worth keeping.

---

## 8. Proposals

Everything below is drafted ready to hand back unchanged. Nothing is edited, created or committed.

### 8a. Instruction-file edits — before/after

**P1 — root `CLAUDE.md:11-13`. The lint claim that six workers each disproved.**

*Before:*
```
`npm install` from the root installs every workspace. `npm run lint` and
`npm run lint:fix` work in any package directory; `npm run build` exists only
in the three deployables — the two shared libs are never built (below).
```
*After:*
```
`npm install` from the root installs every workspace. `npm run build` exists
only in the three deployables — the two shared libs are never built (below).

**`npm run lint` does not run anywhere, and has not since the ESLint 9 bump.**
Every package pins `eslint: ^9.19.0`, every lint script is
`eslint . --ext .js,.ts`, and ESLint 9 removed `--ext` and stopped reading
`.eslintrc.js` by default — the repo ships one and no `eslint.config.js`. So
the command exits non-zero on a configuration error, not on your code. Do not
report that as a finding, do not "fix" it inside a ticket, and do not treat a
green `tsc --noEmit` as covering for it: it is a repo-wide gap with its own
ticket (LINT-1), and six tickets of `groundhopper-foundation` each spent a
tool call rediscovering it because this paragraph used to say the opposite.
```
*Why:* `status.md:74-77`, `:126-128`, `:367-370`, `:509-511`, `:650-652`, `:776-778` — six rediscoveries. Verified: `api-gateway/package.json:11`, `weekendgoals-common/package.json:8`, `weekendgoals-types/package.json:8`.

**P2 — `weekendgoals-common/CLAUDE.md:20`. Five models added, the list never updated.**

*Before:*
```
- `src/models/` - Mongoose schemas and models (venues, leagues, tickets, users, cities, attractions)
```
*After:*
```
- `src/models/` - Mongoose schemas and models (venues, leagues, tickets, users,
  cities, attractions), plus the five the groundhopper log added behind `/me`:
  `log-entries` (`LogEntries`), `plans` (`Plans`) and `sets` (`Sets`,
  `SetMembers`, `SetCompletions`). Their behaviour — Rule 32's frozen
  snapshot, the `clientId` idempotency indexes, Rule 44's completion stamp —
  is documented once, in api-gateway/CLAUDE.md ("Me and the log"); this list
  only says the schemas live here.
```
*Why:* `weekendgoals-common/CLAUDE.md` appears in no GHF commit while `weekendgoals-common/src/models/{log-entries,plans,sets}/index.ts` all shipped in it.

**P3 — `weekendgoals-types/CLAUDE.md:36`. The gap GHF-3 closed and GHF-5/6 re-opened.**

*Before:*
```
- `log/` - `LogEntry`/`Plan` and their request shapes — the groundhopper log
  behind `/me`; see api-gateway/CLAUDE.md "Me and the log"
```
*After:*
```
- `log/` - the groundhopper log behind `/me`; see api-gateway/CLAUDE.md "Me and
  the log". Four modules: `log.ts` (`LogEntry`, `AnnotatedLogEntry`, `LogStats`
  and the create/update request shapes), `plans.ts` (`Plan` and its requests),
  `sets.ts` (`LogSet`, `SetMember`, `SetCompletion`) and `coverage.ts` (the
  five coverage/consequences response shapes). Adding a module here means
  adding it to this line in the same commit — GHF-3 had to ship `6a105ba7` to
  repair the omission GHF-2 left, and GHF-5 and GHF-6 then left it again.
```

**P4 — `api-gateway/CLAUDE.md`, Testing → Infrastructure (after `origin/main:2947`). The 1.2 MB of console noise, rediscovered twice.**

*Add:*
```
- **The suite prints far more than it asserts, and that has broken tooling
  twice.** One `npx jest test/it/me test/it/write-auth.it.ts` run writes
  ~1.2 MB to stdout/stderr — migrate-mongo's per-migration lines plus the
  Mongo driver's own chatter — for 68 passing tests. Anything that captures
  the suite's output into memory must size its buffer for megabytes: Node's
  `spawnSync` defaults to 1 MiB and dies with `ENOBUFS` on a *passing* run,
  which is exactly how a green ticket halted an unattended run
  (`epics/groundhopper-foundation/status.md:300-311`). Redirect to a file, or
  set `maxBuffer`, before you shell out to it.
```

**P5 — `api-gateway/CLAUDE.md`, "Me and the log" (after `origin/main:344`, the `write-auth.it.ts` walker paragraph). The missing invariant behind the epic's second-largest nit class.**

*Add:*
```
**A negative case for `/me` is WALKED, never listed.** There are three
router-walking suites over this subtree — `write-auth.it.ts` (the ingest token
alone is not how `/me` authenticates), `me-cache.it.ts` (no `/me` response may
carry a public cache header) and `me-feature.it.ts` (every gated route 404s an
account without the feature) — and each covers a route added later without
anyone remembering to. Per-route suites must not re-enumerate those cases by
hand. `groundhopper-foundation` produced three tests that did:
`log-entries.it.ts`'s "401s every route" asserts two of five,
`coverage.it.ts`'s "a foreign or unknown entry id 404s" sends only an unknown
one, and `log-stats.it.ts` guests one route of one. A test whose title says
"every" and whose body says "two" is worse than no test: the next reader
believes the title. If a new negative dimension needs covering across `/me`,
add a walker for it rather than a case per suite.
```

**P6 — `api-gateway/CLAUDE.md`, at the top of the match sections, and `docs/database.md:62`. Move the `localTimeKickoff` correction out from under the feature that found it.**

The correction currently lives only at `api-gateway/CLAUDE.md:570-577`, inside "Me and the log: entries (GHF-2)", which is why GHF-5 — writing a seed script that never reads a log entry — walked into it anyway (`status.md:663-668`, corrected at `:692-698`).

*`docs/database.md:62`, before:*
```
| `localTimeKickoff` | Date | Local timezone kickoff |
```
*After:*
```
| `localTimeKickoff` | Date | **Misnamed: the same instant as `kickoff`, not a local time.** The scraper writes `moment(date).tz(tz).toDate()` (`weekendgoals-scraper/src/api-football/matches.ts:709`) and `.toDate()` discards the display offset. Reading it as a local time yields the UTC date for every evening kickoff west of Greenwich. To get the date at the ground, render `kickoff` in the venue's IANA `timezone` — see `toLocalDateOnly` in `api-gateway/src/services/log/index.ts`. Renaming the field is SCR-N below. |
```
*And add to `api-gateway/CLAUDE.md` beside the first match-ranking section that reads the field (`origin/main:1257`):*
```
**`localTimeKickoff` is not a local time** — it is the same instant as
`kickoff`; see `docs/database.md`. Every consumer that wants a date at the
ground renders `kickoff` in the venue's timezone instead. This has been
rediscovered three times (the `groundhopper-foundation` plan encoded it,
GHF-2 shipped a day-shifted `playedOn` because of it, GHF-5 justified a
season window with it) — which is why the warning is here and not only in
the section that first hit it.
```

### 8b. Owed work as draft ticket sections

Ten open items (§2), plus what §5 and §6 turned up. I have grouped them into **four tickets** rather than ten, because eight of them are one-liners in three files and a ticket per line is the ceremony the admission test refuses. Each is drafted ready to append. **LOG-1 and SEC-13 are the two I would actually ship; LINT-1 is cheap and stops a recurring tax; SCR-N is the one with a real question in it.**

---

**## SEC-13 — Two auth-layer defects `/me` made reachable**

Both were reported by review during `groundhopper-foundation`, both were correctly refused as out of scope by every ticket that saw them, and both are still on `origin/main`. They are grouped because they are the same tier and the same file neighbourhood, and splitting them buys nothing.

**Scope.**
- `api-gateway/src/middleware/passport/secret-provider.ts:13-19` — the `if (userId) … else if (guestId) …` chain has no final `else`, so a token whose `iss` matches neither `arn:user:(.+)` nor `arn:guest:(.+)` (e.g. `iss: "x"`, or `iss: "arn:user:"`) never calls `done`. passport-jwt waits forever and the request hangs until the socket times out. Unreachable before GHF-1; reachable on `GET /me` with an unsigned JWT since. Add `else done(new UnauthorizedError("unauthorized"), false)`.
- `api-gateway/src/handlers/middleware/error.ts:43` — `response.status(500).json({ message: err.message })` echoes any non-`HttpError`'s raw message. `LogService.createEntry`'s unexplained-E11000 rethrow would surface Mongo's duplicate-key text (collection name, index name, the userId) to the caller. Replace the echoed message with a fixed string; keep the full error going to `console.error` and Sentry, which `:46-47` already does.

**Not in scope.** Re-keying JWTs off `passwordHash` (F17, still open from `tickets.md:243`). Rate limiting. Any `/me` route behaviour.

**Acceptance criteria.**
- When `GET /me` is called with a JWT whose `iss` is `"x"`, the response is 401 within the test's default timeout — not a hang.
- When `GET /me` is called with a JWT whose `iss` is `"arn:user:"` (the empty-capture case), the response is 401.
- When a handler throws a non-`HttpError` whose message contains `E11000 duplicate key`, the response body's `message` contains neither `E11000` nor any collection or index name, and `console.error` received the original.
  CHECK: cd api-gateway && npx jest test/it/me/auth.it.ts test/unit/errors
  EXPECT: 0 failed
- `cd api-gateway && npm test` passes.

*Evidence:* `status.md:91`, `:148-152`, `:243-248`, `:315-318`. Reported eight times across six tickets, owner named as "the security epic" throughout, and no security ticket names it.

---

**## LOG-7 — Close the eight nits `groundhopper-foundation` recorded for the retro**

Eight findings from the epic's six `xhigh` reviews, each dispositioned "recorded for the retro" and each verified still present on `origin/main`. One ticket, because seven are single-expression changes or test additions in files this ticket already opens.

**Scope.**
- **`GET /me/log/entries` has no test.** Add one to `test/it/me/log-entries.it.ts`: newest `playedOn` first, `total` correct across a page boundary, `limit=600` clamped to 500, `limit=0` and `limit=abc` → 400. (`status.md:180-181`)
- **The index test proves nothing about the partial filter.** `log-entries.it.ts` (the `describe("indexes")` block) asserts three `JSON.stringify(i.key)` values only. Assert `unique: true` on both, and `partialFilterExpression` on `{userId, matchId}` — then add the test that motivates it: two manual entries (both `matchId: null`) for one user must both insert. (`status.md:181-183`)
- **`log-entries.it.ts`'s "401s every route" tests two of five.** Extend to `GET :id`, `PATCH`, `DELETE`, asserting the row survives. (`status.md:450-452`)
- **`coverage.it.ts`'s "a manual entry with no venueId never closes a set" is vacuous** — it asserts `countDocuments({}) === 0`, which holds whether the stamping path ran or not. Replace with the case that discriminates: a manual entry carrying a member `venueId` **does** close a set. (`status.md:811` nit 4)
- **`coverage.it.ts`'s "a foreign or unknown entry id 404s" sends only an unknown id.** Add the foreign case. (`status.md:811` nit 5)
- **`nearestSetOf` answers `{ remaining: 0 }`** for a set whose live progress equals its denominator but carries no `SetCompletions` row — reachable when a set is seeded after the entries that already cover it, which is exactly what will happen the first time production is seeded. `api-gateway/src/services/log/coverage.ts:55-83`: skip a coverage whose `progress >= denominator`, not only one whose `completedAt` is set. (`status.md:811` nit 2)
- **Completion-order sort puts a late member first.** `api-gateway/src/services/log/index.ts:596-597` maps a `null visitedOn` to `""`, which sorts before every date, in a list documented as "in completion order". Sort unvisited members last. (`status.md:811` nit 3)
- **`getEntry` compares ids case-sensitively** after a case-insensitive `isValidId` (`services/log/index.ts:47` vs `:348`, `:449`) — an uppercase-hex id 404s on GET only. Lowercase the id once at the boundary. (`status.md:532` nit 2)

**Not in scope.** `GET /me/plans`' unbounded list (LOG-8). The `maybeStampCompletions` non-11000 retry gap (`status.md:811` nit 1) — that one is a design question about where a failed stamp is retried from, not a nit, and wants its own ticket if it wants one at all. The `confirmPlan` / `createEntry` duplicate-key block extraction (`status.md:465-469`) — the window the reviewer named (before GHF-6) has closed and the copy has now shipped twice; leave it.

**Acceptance criteria.**
- A manual entry naming a set member's `venueId` as its last uncovered ground stamps a `SetCompletions` row.
- Two manual entries for one user both insert (the partial filter, pinned).
- A set covered 3/3 with no completion row is not named by `nearest`.
- `GET /me/log/coverage/:slug` on a completed set lists an unvisited member last.
- `GET /me/log/entries/:id` with the id upper-cased answers the same as lower-cased.
  CHECK: cd api-gateway && npx jest test/it/me test/unit/log
  EXPECT: 0 failed
- `cd api-gateway && npm test` passes.

---

**## LOG-8 — Decide `GET /me/plans`' bound, and the seed script's production credentials**

The two items `groundhopper-foundation`'s reviews explicitly deferred to the retro as **decisions**, not fixes. Both need a call before code.

**The decision on `GET /me/plans`.** The route ships unbounded (`api-gateway/src/dao/plans/plans-mongo-dao.ts:53-56`), against the epic's own "Pagination is bounded" ground rule (`tickets.md:163-165`), because the plan's own route signature omitted `limit`/`offset` (`tickets.md:389`). The reviewer disproved the rationale that was written for it: *"`PlansMongoDao.list` filters on `userId` only, so a past-kickoff plan never confirmed or dismissed is returned forever (and must be, for the 'were you there?' ask)"* (`status.md:456-459`). So the list genuinely grows without bound and genuinely must return old plans. **Recommendation: bound it (default 200, max 500) with `limit`/`offset` matching the entries route, and keep the sort.** The UI reads the whole list today, so adding the bound is a contract change that needs the UI epic to page — which is why it is a decision. The alternative — leave it and document the ceiling — is defensible while `Plans` holds 3 rows in production, and indefensible at the first user with a thousand.

**The decision on `seed-log-sets.ts`.** `api-gateway/scripts/seed-log-sets.ts:208` connects with `mongoose.connect(DB_URL, { autoIndex: false })` and no `user`/`pass`, while Terraform ships `DB_USER`/`DB_PASSWORD` separately — and this is the **one** script sanctioned to write production (`api-gateway/CLAUDE.md:869-877`). Every other script in that directory makes the same bare call, which is why GHF-5's review did not change it (`status.md:702-708`). It fails loud and writes nothing, so this is a papercut on the one operation nobody wants a papercut on. **Recommendation: pass credentials the way `clone-prod-to-local.js` does, in this script only**, and note in `api-gateway/CLAUDE.md` that it is deliberately the exception.

**Acceptance criteria.** Whichever way each decision goes, the reason is written into `api-gateway/CLAUDE.md` in the same commit, and `epics/groundhopper-foundation/status.md`'s retro section records which way and why.

---

**## LINT-1 — Make `npm run lint` run, or delete it**

Six tickets of one epic each rediscovered that it cannot (`status.md:74-77`, `:126-128`, `:367-370`, `:509-511`, `:650-652`, `:776-778`). Root `CLAUDE.md:11-12` says it works.

**Scope.** Either (a) add `eslint.config.js` at the root, migrate `.eslintrc.js`, and drop `--ext` from the three lint scripts (`api-gateway/package.json:11-12`, `weekendgoals-common/package.json:8-9`, `weekendgoals-types/package.json:8-9`); or (b) remove the scripts and the eslint dependency outright. Either way, root `CLAUDE.md:11-12` tells the truth afterwards (P1 above is the interim edit; this ticket supersedes it).

**Acceptance criteria.**
  CHECK: cd api-gateway && npm run lint
  EXPECT: 0 problems
— or, if (b): the string `lint` appears in no `package.json` `scripts` block and in no CLAUDE.md as a runnable command.

---

**## SCR-N — Name `localTimeKickoff` for what it is (or make it what its name says)**

`weekendgoals-scraper/src/api-football/matches.ts:709` writes `moment(fixture.date).tz(timezone).toDate()`, which is the same instant as `kickoff` — `.toDate()` discards the display offset. `docs/database.md:62` documents the field as "Local timezone kickoff". The gap between the two produced a shipped date bug (GHF-2 Important #2, `status.md:164-172`) and a wrong justification three tickets later (`status.md:663-668`, corrected `:692-698`). The `groundhopper-foundation` review named the owner: *"the field's name or its derivation wants correcting at the writer — owner: **retro** (the data-integrity epic is archived and no live ticket owns the scraper's match writer)"* (`status.md:194-196`).

**The real question, which this ticket must answer before it writes code:** every existing consumer reads the field with UTC getters and gets correct results *because* it is a UTC instant — including `derive-set-members.ts`'s season window (`api-gateway/CLAUDE.md:843`) and the `leagueRank_1_localTimeKickoff_1` index (`api-gateway/CLAUDE.md:1257-1259`). So **changing the derivation is a data migration across 183,765 matches and an index rebuild; changing the name is a rename across every reader.** Doing neither, and documenting it loudly, is the third option and may be the right one — P6 above is that option, drafted.

**Not in scope.** Anything under `/me` — the log already derives `playedOn` correctly from `kickoff` + the venue timezone and must not change.

---

### 8c. Planning lessons — this project's ground rules

**GR-1. A ticket's ground rules are checked against its own ticket sections, by the plan reviewer, as a step.**
> "**Pagination is bounded** … list routes take `limit` (default 200, max 500) and `offset`" — `tickets.md:163-165`
> "`GET /me/plans` → `{ plans }`, soonest `kickoffAt` first." — `tickets.md:389`

The plan review of 2026-08-24 "split two tickets and corrected the error path, the id types and the reversal line" (`tickets.md:12-13`) — it reviewed the tickets against the design and did not review them against the ground rules three pages above. The worker resolved the conflict the way workers will: it followed the concrete signature and invented a justification for it, and the reviewer had to disprove the justification.

**GR-2. A fact about the catalog goes in the catalog's section, not the feature's.**
The `localTimeKickoff` correction was written into "Me and the log: entries (GHF-2)" and GHF-5 missed it while writing a script about seasons. §3B, P6.

**GR-3. `Areas in scope` binds every named area's instruction file, not just api-gateway's.**
> "**api-gateway/CLAUDE.md is updated in the same commit** as each ticket" — `tickets.md:166-168`
> "Areas in scope: `api-gateway` …, `weekendgoals-common` and `weekendgoals-types`" — `tickets.md:68-74`

Three areas named; one instruction file bound. `weekendgoals-common/CLAUDE.md` gained five models and zero lines. The rule should read: *every area named in "Areas in scope" has its CLAUDE.md updated in the same commit as the ticket that changes it.*

**GR-4. Never pin an acceptance criterion to a count of files in a directory the work will grow.**
> `CHECK: ls api-gateway/scripts/data/log-sets/*.json | wc -l` / `EXPECT: 3` — `tickets.md:542-543`
> "adding the four derived launch candidates failed CI twice over: the count assertion read 7 where it expects 3" — commit `5bcaa8e6`, three days later

The criterion's *intent* was "the placeholders exist". Pin that: `ls api-gateway/scripts/data/log-sets/example-*.json | wc -l` / `EXPECT: 3`.

**GR-5. An `Owed` line names a person or a ticket ID that exists, or it is not an owed line.**
Ten of twelve items still open, and the owner field failed in five distinct ways (§2). Three consecutive entries (`status.md:526-530`, `:675-682`, `:805-809`) re-copy the same four items and each says "none is in this ticket's scope." That is a correct statement and a broken mechanism.

### 8d. Transferable lessons — candidates for the methodology itself

**M-1. The plan reviewer should be asked, for each ticket, why it is one ticket.**
GHF-2 crossed six layer boundaries in one scope block (`tickets.md:271-332`), cost 2.3× the epic's median worker spend, drew both of the epic's frozen-forever Important findings and three of its four still-open test nits — and split itself into four commits on the way through (`b8976503`, `8924fdca`, `af5900a9`, `05d9d7b2`). Meanwhile GHF-1 (48,379) and GHF-4 (44,146) each did one thing and drew zero Important. The epic's ordering rationale (`tickets.md:180-188`) is careful about sequence and silent about size. **A candidate rule for the plan-review skill: if a ticket's Scope names more than one layer boundary, the review must either justify the coupling or split it.** It fits the admission test on "constrain blast radius" — GHF-2's blast radius was the error path of every route in the service plus a shared DAO projection.

**M-2. A ground rule the same document later contradicts is a finding, and cheap to check.**
This one is mechanically checkable in the way `check-invariants.mjs` already checks couplings: the ground rules that name a concrete shape ("list routes take `limit` and `offset`") can be grepped against the ticket sections' own route signatures. In this epic that grep would have found exactly one hit and it would have been right. (M-2 generalizes GR-1.)

**M-3. When a ticket puts the first per-user response on a previously anonymous surface, the ground rules must enumerate every middleware already mounted above it.**
The epic's entire threat model was *who can reach `/me`* — the halt condition, the reversal line, the four negative-token clients, the `consequence` tier floor on `middleware/**`, an `xhigh` review of GHF-1 alone. Not one of them asked *what happens to a `/me` response after it leaves*, and `app.ts:48` had been marking all of `/api/v1` `public, max-age=1800` the whole time. The result was a cross-user data leak in production, found by accident a day after the release (`api-gateway/CLAUDE.md:303-321`). **A tier is a budget; what was missing was a question.** This generalizes cleanly: the new-authenticated-surface case has a small, enumerable checklist (caching headers, logging, error bodies, rate limits, CORS) and none of it is discoverable from the diff, which is what makes it a ground-rule item rather than a review item.

**M-4. A halt that fires on a green ticket is a finding about the gate, and should be recorded as one.**
Three of this epic's five stalls were false alarms on verified-correct work: a buffer limit, a replayed cache entry, and a date string. Two are already fixed upstream — and both fixes exist *because* the driver wrote a **Diagnosis** paragraph into the run record rather than just the halt reason (`status.md:300-311`, `:585-598`). The GHF-4 record even drafts its own fix: *"Lesson for the plugin: pin the addendum date in code, not in the prompt."* That diagnosis paragraph is the highest-leverage thing in this entire log and it is not, as far as I can tell, a required part of a halted run record. **Candidate: make it one.** The admission test passes on "provide decision evidence" — it is what let a human fix the plugin instead of resuming blind.

**M-5. A cached run step should be invalidated by the fix that made it stale.**
`status.md:537-540`: the plugin was fixed, the run resumed, and it *replayed the recorded failure* — because the cache is keyed on step identity and the run's pinned date, and the pinning that makes the cache work is what made the stale entry match. The operator's recovery ("removed that one cached entry") is a manual, undocumented surgery on a workflow's internals. This is the only one of the five stalls with no upstream fix yet.

**M-6. A single retry against the same failing resource is not a fallback.**
`hireReviewer` (`run-epic.mjs:581-601`) tries the reviewer agent, then exactly one general-agent fallback. Both hit *"You've hit your session limit · resets 1:20am"* — the same wall, milliseconds apart (`status.md:236-240`). A fallback that shares the primary's failure mode covers the primary crashing, not the environment running out. Worth naming in the methodology even if the answer is "and that is correct — halt and let a human resume", because that *is* what happened, and it worked, and it was the one halt in the epic that retired real risk. **The lesson may be to keep it exactly as it is and say why.**

---

## 9. Spend

**The ledger, as `tickets.mjs spend` derives it (run in `/Users/vadim/projects/weekendgoals`):**

```
groundhopper-foundation — 6 tickets · recorded 0 tokens · 6 with unknown or missing figures
  GHF-1    no figure recorded — points at the run-record
  GHF-2    no figure recorded — points at the run-record
  …all six identical…
  worker 0  reviewer 0  re-review 0  disposition 0  proxies 0
```

**This is a finding about the log's shape, exactly as the skill says — and `doctor` already names it, on all four run records:**

```
! groundhopper-foundation/status.md:222 — the run record's Tokens line carries figures but no
  machine-shaped group, so spend reads nothing from it (needs "<ID> worker=<n> reviewer=<n>
  disposition=<n> re-review=<n> proxies=<n>" per ticket, "unknown" for any missing figure);
  repair by appending a dated addendum beneath the record restating the figures as groups —
  never by editing the record
```
…and identically at `:285`, `:566`, `:838`.

Each ticket entry's `**Tokens:**` line says `recorded in the run record` (`status.md:66`, `:114`, `:356`, `:497`, `:633`, `:753`), which `parseSpend` reads as the note `run-record` — correctly. The run records then carry every figure in prose. The figures exist, were carefully harness-observed, and are unreadable by the ledger. **The repair is the log's own correction mechanism and needs no edit to any existing line: four dated addenda, one beneath each run record, restating the figures as groups.** I have not written them.

**Transcribed from the run records' own `**Tokens:**` prose — read from the record, not derived, not estimated.**

Per ticket, **worker** output tokens (`status.md:566-570`, `:838-841`):

| Ticket | Worker | Reviewer (incl. re-review) | Disposition |
|---|---|---|---|
| GHF-1 | 48,379 | 21,785 | 3,214 (haiku) |
| GHF-2 | 110,939 | 25,152 (errored at the session limit) + 39,563 + 18,689 = 83,404 | 24,675 (fable) |
| GHF-3 | 84,962 | 26,024 + 10,090 = 36,114 | 23,008 (fable) |
| GHF-4 | 44,146 | 19,509 + 10,066 = 29,575 | 5,746 (haiku) |
| GHF-5 | 69,768 | 29,123 + 15,489 = 44,612 | 17,854 (fable) |
| GHF-6 | 65,388 | 17,551 | 3,736 (haiku) |
| **Total** | **423,582** | **233,041** | **78,233** |

Per run (three of the four records are cumulative views of the **same** run `wf_cf04a9fd-4f8`, resumed; only the third and fourth are additive):

| Record | Run total (output) |
|---|---|
| `status.md:204` — first pass, halted | 217,488 |
| `status.md:259` — first resume, halted | 301,637 |
| `status.md:533` — second/third resumes, halted | **539,359** (final state of `wf_cf04a9fd-4f8`) |
| `status.md:813` — fresh run `wf_aca8af92-708`, completed | **232,049** |
| **Epic total across both runs** | **771,408** |

Split: workers 423,582 · reviewers 233,041 · dispositions 78,233 · shell proxies 36,552. I checked the log's arithmetic and it is internally consistent (539,359 + 232,049 = 771,408; each role's two-run sum matches its stated total).

Three things the prose carries that a machine-shaped group would not:
- **The runtime meter disagrees with the transcript sum, and the log says so plainly** rather than picking one: *"the runtime's own meter read 80,165 output tokens for GHF-1's integrated pass — the meter and the transcript sum are different instruments; both recorded, neither a gate"* (`status.md:229-232`). Per-ticket meter figures: GHF-2 2,783 · GHF-3 156,350 · GHF-5 142,836 · GHF-6 121,305 · GHF-1 0 on the cached replay. The two instruments differ by more than an order of magnitude in both directions.
- **Cache-read input across the run: ~82.5M tokens, "almost all in the two sonnet workers"** (`status.md:232`). Nothing in the ledger's shape has a slot for this, and it is the largest number in the epic.
- **The errored reviewer attempt cost 25,152 output tokens for no result** (`status.md:227-228`) — and is honestly counted in the reviewer totals rather than dropped.

**Against budget:** `Ticket budget: 400k` (`tickets.md:101`). No ticket came near it; the largest worker leg was GHF-2 at 110,939 and the largest single-ticket all-in (worker + reviews + disposition) is GHF-2 at 219,018. The budget was never the binding constraint — the session limit was.