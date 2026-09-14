I have everything I need. Here is the finished report.

---

# Retro (miner report) — `redesign-foundation`

Read: `epics/redesign-foundation/tickets.md` (552 lines, identical on `origin/epic/redesign-foundation`), `epics/redesign-foundation/status.md` (650 lines, all six entries, all seven addenda, all four `### Run —` records), `epics/redesign/plan.md`, the release PR #357 body, and the shipped work via `git show`/`git log` against `origin/epic/redesign-foundation`. Instruction files read as they are now: root `CLAUDE.md`, `weekendgoals-ui-next/CLAUDE.md`, `weekendgoals-ui-next/test/cypress/CLAUDE.md`, `api-gateway/CLAUDE.md`, `weekendgoals-common/CLAUDE.md`. No branch was switched, nothing was edited.

---

## 1. Outcome

The Outcome line is `epics/redesign-foundation/tickets.md:23-40`. It names five observable changes, an evidence list read "in the release pull request and two weeks after the deploy", and a reversal condition. **PR #357 is OPEN**, so the deploy-side half of the evidence does not exist yet. Verdict per clause:

| Clause (tickets.md:23-36) | Verdict | Evidence |
|---|---|---|
| "every page renders inside a sticky top bar and a footer instead of the desktop sidebar" | **Achieved on the branch** | `AppShell.tsx`/`TopBar.tsx`/`AppFooter.tsx`/`MobileBar.tsx` shipped (`38eafcd9`, `430309dd`); `DesktopSidebar`, `SidebarToggle`, `MobileSidebar` deleted; `grep -rEn 'MobileSidebar\|mobile-sidebar' src test` is empty (re-verified). Full e2e green at `1f84c1c6` — 358 tests, 279 passing, 0 failing (PR #357 body; **not recorded in status.md**). |
| "`h6count` = 0 with the H1 first on every page type, measured on the **rendered** DOM" | **Not achieved as stated** | Asserted for **two of nine** page types only. `status.md:561-567`: "Only two page types are wired into the new spec… League/team/country/venue pages already carry `describe.skip`'d specs". The evidence the Outcome names cannot be produced for seven page types. |
| "a currency chosen in that bar changes every price on every page" | **Partially achieved** | `PriceCta` (`match-card/parts.tsx`), the hero chip and `TicketComparison` all convert. Map pins do not: `src/components/map/markers/MatchMarker.tsx:100` still calls `formatTicketPrice(match)` — verified at head. Disclosed as owed at `status.md:322-326`. |
| "`MatchCard` carries the slots the redesign needs without a fourth card family appearing" | **Achieved** | `59ea6855` adds `logControl`/`hideVenue`/`opponentBody` to `MatchCard.tsx`; no new card component exists; 22 unit cases (`status.md:163-181`). No caller yet, by design. |
| "every public page still answers a cacheable `Cache-Control` on both path shapes with the new chrome on it" | **Achieved in the harness; production evidence still owed** | `app-shell.cy.ts` asserts it for `/`, `/matches/<id>`, `/de/matches/<id>` (`status.md:33`); `page-cacheability.cy.ts` asserts both shapes plus the `/about-us` negative. `curl -sI` for `x-cache: Hit from cloudfront` is explicitly deferred to post-deploy (`tickets.md:476-478`). |
| "a page's cacheability and server-render gateway request count are asserted by the Cypress suite" | **Achieved, at a different number** | `page-budget.cy.ts` pins **6**, not the plan's 4-or-5. `status.md:477`, `73067c51`. |
| "the budget harness failing a deliberately added request" | **Achieved by construction** | The spec asserts `gatewayRequestCount().should("eq", 6)` — an equality, so a 7th fails it. Read at `test/cypress/e2e/page-budget.cy.ts`. |
| "GA4 engagement on the currency control — if nobody changes currency in four weeks, FND-4 was speculative work" | **Not yet assessable — and not cleanly measurable as designed** | The event exists (`DisplayCurrencyProvider.tsx:62`, `reportEvent("changeDisplayCurrency", "tickets", next, …, {display_currency, previous_currency})`) but it **pre-dates the epic** (`git log -S changeDisplayCurrency` → `66d66907`, the match-page redesign) and carries no surface dimension. `TicketComparison.tsx`, `TopBar.tsx`, `MobileBar.tsx` and `CurrencyDialog.tsx` all write through the same `useDisplayCurrency()` setter, so the four-week reading **cannot distinguish the new shell control from the pre-existing match-page picker**. The reversal test as written will not answer the question it was written to answer. |

**Reversal condition** (`tickets.md:37-40`) holds: the shell is one component tree behind `ContentPageContainer`, and reverting is restoring the sidebar mount. Nothing in the epic broke that property.

**Still to arrive, and when to look again:** merge #357; then at T+2 weeks `curl -sI` the three paths for `x-cache: Hit from cloudfront` on the second request; at T+4 weeks read GA4 `changeDisplayCurrency` — but add a surface dimension first (proposal P7), or the reading is uninterpretable.

---

## 2. Still owed

The pre-release full `npm run e2e` — the epic's single largest owed item, named in seven places in the log — **has been discharged**: PR #357's checklist records "358 tests, 279 passing, 0 failing, 79 pending, run 2026-09-14 at `1f84c1c6`", and `3d7f57af` + `1f84c1c6` are the fixes it produced. **Nothing in `status.md` says so.** Every ticket's Owed line (`status.md:129`, `:220`, `:326-328`, `:466-468`, `:572-573`) still reads "owed to the pre-release `npm run e2e`". The discharge lives only in a pull-request description — the one artefact that disappears from the working tree the moment the PR merges.

Everything below was verified against the tree at `origin/epic/redesign-foundation`, not just read from the log.

**Confirmed still open, with no ticket anywhere:**

| Item | Source | Verified at head |
|---|---|---|
| Map pins price in the seller's currency, not the chosen one | `status.md:322-326` | `MatchMarker.tsx:100` — `formatTicketPrice(match)`, confirmed |
| `TopBar` renders `AttachMoneyIcon` (a `$`) before the code, so "EUR" reads "$ EUR" | `status.md:339` | `TopBar.tsx:304` — `<AttachMoneyIcon …/>{currency}`, confirmed. **This is a user-visible defect shipping in the release.** |
| `SidebarContent.tsx` / `SidebarMenuItem.tsx` dead, plus `test/unit/sidebar-menu-item.spec.tsx` testing them | `status.md:122`, `:131`; recorded at `weekendgoals-ui-next/CLAUDE.md:132` | Only consumer of `SidebarContent` is itself; `SidebarMenuItem` is used only by `SidebarContent` and its own spec. Confirmed |
| `@types/gtag.js` named in `test/cypress/tsconfig.json:8` but installed nowhere | `status.md:578-582` | Confirmed: not in `node_modules/@types`, not in any `package.json` |
| `api-gateway` lint cannot run — eslint 9 vs pre-v9 `.eslintrc.js` | `status.md:469-471` | `api-gateway/.eslintrc.js` exists, no `eslint.config.*`; `"lint": "eslint . --ext .js,.ts"` |
| `DisplayCurrencyProvider.tsx:66` `localStorage.setItem` unguarded | `status.md:343` | Confirmed at `:49` and `:66` |
| `src/app/utils.ts:237` `teamsForMatches.push(...teams)` mutates a `cache()`d result → home clubs doubled | `status.md:480` | Confirmed |
| `src/app/utils.ts:244-251` tickets fetched twice per cold render (the 6th gateway request) | `status.md:481` | Confirmed |
| `Map.tsx` root `position: fixed; inset 0`; `MapSideList` still pads 72px for a sidebar that no longer exists | `status.md:58`, `:50` | Owner named as `redesign-map`, an epic **that does not exist** — `epics/` has no `redesign-map` |
| Two headers on entity pages ≥1200px; homepage sticky `MobileHeader` collision | `status.md:57`, `:123`; recorded at `weekendgoals-ui-next/CLAUDE.md:113-127` | Owner named as "the page epics", **none of which are open** |
| `tickets.currency-explainer`'s 17 translations hand-written, native-speaker register pass owed | `status.md:329-332` | 18 locale files touched by `22b27b51` |
| FND-2's ☰ toggle and its `nav` share `menu.top-bar-navigation`; a dedicated key needs approval + fan-out | `status.md:139` | Confirmed |
| FND-2's Hebrew mobile test asserts only inherited `direction`, not inline-start | `status.md:137` | — |
| FND-3's `logControl` test asserts existence anywhere, not position (`match-card.spec.tsx:152-154`); no positive control (`:158-181`); `opponentBody` `flexBasis` clipping (`MatchCard.tsx:301-317`) | `status.md:226-229` | — |
| FND-4's `currency.spec.ts:267-272` computes its expected value with the helper under test | `status.md:340` | — |
| FND-4's `PriceCta` — the only newly-converted price surface — is asserted by no test (`match-card.spec.tsx:31-38` mocks it away) | `status.md:337` | — |
| Nothing checks `robots.txt` and `llms.txt` agree; FND-6's own criterion `tickets.md:552` carries no CHECK | `status.md:598-600` | — |
| `seo-audit.ts`'s `/logo$/i` is an English literal; a localised crest label would fail the audit | `status.md:601-604` | Confirmed at `test/cypress/utils/seo-audit.ts` |
| FND-5's "the teams and leagues those fixtures name" ambiguity — no Leagues join shipped | `status.md:446-456` | — |
| 21 commits on the branch carry `Co-Authored-By: Claude …`, against root `CLAUDE.md:501` | `status.md:228` (owner `run`) | Counted: 13 Opus, 8 Sonnet. Never fixed. Ships in the release. |

**Recorded as a Decision but never as Owed** — so it would have escaped this list entirely:

- FND-6's Scope (`tickets.md:530-532`) requires "H2 sections only, no heading before the H1". Only the H1 rule was built. `status.md:551-560` explains why in Decisions and **puts nothing in Owed**. The heading-hierarchy half of the SEO baseline the shell owns does not exist and is on no list.
- `weekendgoals-common/CLAUDE.md` documents neither `ApiClient.getVenuePageData` nor the new `weekendgoals-types/src/pages/` module (`60d040e8`, +20 lines). The epic's doc ground rule (`tickets.md:173-174`) names only ui-next and api-gateway, though "Areas in scope" (`tickets.md:59-62`) includes `weekendgoals-common`.

---

## 3. Rediscovered — learned twice, documented zero times

**(a) `npm run lint` is red on this tree, and every ticket re-derived that from scratch — six times.**
`status.md:39` (FND-1: "no new errors in any file this ticket touched (pre-existing errors elsewhere, e.g. `state/search.ts`'s `buildSearchState` rules-of-hooks false positives)"), `:115` (FND-2: "same ones FND-1 recorded"), `:182-185` (FND-3), `:261-266` (FND-4: "exits nonzero (45 pre-existing errors, 612 pre-existing warnings…); every file this ticket touched checked individually with `next lint --file <path>`"), `:413-417` (FND-5), `:515-518` (FND-6: "reproduced identically via `git stash` on the unmodified branch tip"). Six workers each spent tokens establishing the same fact and inventing the same workaround. `weekendgoals-ui-next/CLAUDE.md`'s Commands block (lines 7-14) says nothing about it.

**(b) How to typecheck a Cypress spec — four tickets, four incantations, two contradictory verdicts.**
`status.md:116` (FND-2 needs `npx tsc --noEmit -p test/cypress/tsconfig.json --types cypress,node`, "the CLI override skips a pre-existing, undeclared-anywhere `@types/gtag.js` reference the plain `-p` invocation cannot resolve"); `status.md:269-270` (FND-4: `cd weekendgoals-ui-next/test/cypress && npx tsc --noEmit -p tsconfig.json` — "compiles clean"); `status.md:410-411` (FND-5, same, clean); `status.md:526-532` (FND-6: "The real `tsconfig.json` itself cannot run here"). **I reproduced the discriminator, which nobody found:** it is the working directory.

```
cd weekendgoals-ui-next/test/cypress && npx tsc --noEmit -p tsconfig.json   → exit 0
cd weekendgoals-ui-next && npx tsc --noEmit -p test/cypress/tsconfig.json   → error TS2688: Cannot find type definition file for '@types/gtag.js'
```

Four tickets, and the tree still carries an unresolvable `types` entry.

**(c) The `\|`-inside-`node -e` grep escaping — found three times, misdiagnosed twice.**
FND-2's reviewer found it (`status.md:140`: "`tickets.md:308`'s CHECK for 'no spec references its hook' cannot fail (`\\|` reaches `grep` as a literal `|` in BRE)"). FND-6's worker hit the identical bug and **blamed the wrong cause** (`status.md:520-525`: "BSD grep does not treat `\|` as alternation… a portability gap"). The halt analysis found it a third time and got it right (`status.md:624`: "The `\\|` inside the node string reaches grep as a literal `|`… The FND-2 reviewer had found the same `\\|` defect"). FND-4's `/[£$€]/` is the same disease one layer over — a CHECK whose result depends on shell quoting rather than on the code.

**(d) "This unattended run cannot spawn the language-expert agents" — three tickets, three different answers, one of them silent.**
The ground rule (`tickets.md:131-138`) requires every ticket to fan out its own strings "through the per-language agents". FND-2 sidestepped by reusing an existing key (`status.md:121`: "This run is explicitly forbidden from spawning any agent, including the per-language `-language-expert` agents `.claude/rules/translations.md` mandates for exactly this kind of fan-out"). FND-3 sidestepped by keeping every new slot caller-owned so no key was needed (`status.md:196-208`). FND-4 hand-translated and disclosed it (`status.md:305-312`). FND-1 shipped a 4-key, 17-locale fan-out (`status.md:25-26`) and **says nothing about how** — its run record (`status.md:73-79`) lists no language agents, so it was hand-written too, undisclosed. A ground rule that is unexecutable in the mode the epic declared, rediscovered by four tickets independently.

**(e) `npm run e2e` needs the stub started outside Cypress.** `status.md:45` records FND-1 finding it only because "a leftover stub instance from an earlier session happened to mask the gap". `status.md:477` records FND-5's reviewer finding the *same* class of defect again — the request counter read 0 "because `npm run e2e` starts the stub as its own process, the in-process start loses the port". Two tickets, one root cause: the stub's process identity is not what `cypress.config.ts` assumes. Now documented at `test/cypress/CLAUDE.md:52-70` and `weekendgoals-ui-next/CLAUDE.md:2215+` — this one *was* captured, and is the model for (a)-(d).

---

## 4. What review kept finding

**One class dominates: an assertion that cannot fail. It appears in five of the six tickets, and again in three of the eleven CHECK lines.**

- FND-1, **Important**: "**Fixed — vacuous Hebrew/RTL assertion**: `979e3a89` checks computed `direction`… With `direction: ltr` forced on the bar, the Hebrew case fails" (`status.md:55`). The fix was to add a negative control.
- FND-2, nit: "the Hebrew mobile test asserts only inherited `direction: rtl`, not an inline-start layout like the desktop describe's `assertInlineStart`" (`status.md:137`) — the same defect, one ticket later, in a test written *after* FND-1's fix taught the lesson.
- FND-3, two nits: "`test/unit/match-card.spec.tsx:152-154` asserts the node exists anywhere in the document, not that it is in the documented position" and "`:158-181` … shows the mock fires when click is stopped, but does not show it fires when unstopped" (`status.md:226-227`) — again, a missing negative control.
- FND-4, nit: "`test/unit/currency.spec.ts:267-272` computes its expected value with `formatMoney(64, "XYZ", "en")` — the same module's helper that `formatDisplayPrice` calls — so the assertion cannot catch a regression shared by both" (`status.md:340`).
- FND-5, **Important**: the budget spec's counter "read **0**… the `cy.task`s read a module-level counter no request reached" (`status.md:477`). The spec asserted a number against a counter that was structurally always zero. **This one only surfaced because the reviewer's Important finding forced the spec to be run for the first time** — under the epic's own "written but not run" policy (`tickets.md:90-100`) it would have shipped as a permanently-vacuous harness that all nine page epics were meant to build on.

The second, smaller class: **the scope list omitted a consequence of what the ticket removes.** FND-2 found "`MobileSidebar`'s `cookie-settings-menu-item` was… the only remaining way to reopen cookie preferences anywhere in the app… a real, GDPR-relevant regression this ticket's own documents never flagged" (`status.md:120`). FND-1 found `/map` covered by the new bar, from a scope line that said `Map.tsx` was untouched (`status.md:37`, `:54`). Both are the same shape: a removal list written from the design's item list, not from what the removed component was load-bearing for.

The one instruction-file line that would have prevented the dominant class is in **Proposal P1**.

---

## 5. Codebase vs documents

**What shipped beyond any ticket's scope, with no status-log record at all** — three commits on the epic branch carry no ticket ID and no entry:

- `f8be0c96` "Enable the Flow plugin for this project" — `.claude/settings.json`, +3 lines. Commit body: "the line sat uncommitted through the whole run." Every claim in the log about how the run was configured rests on a file that was untracked while it ran.
- `3d7f57af` "Point the main-page search tests at the hero, and let sign-out reload before the menu reopens" — `main-page.cy.ts` +29/−? and `menu.cy.ts` +5. Commit body: "The full e2e run owed before the redesign-foundation release failed 9 tests across these two specs." This is the discharge of FND-1's and FND-2's owed item, recorded nowhere in `status.md`.
- `1f84c1c6` "Audit crests by data-crest, not by role=img" — `Logo.tsx`, `MatchHero.tsx`, `seo-audit.ts`, `weekendgoals-ui-next/CLAUDE.md`. Commit body: "`seo-audit.cy.ts` failed on the match page: MUI's `CardMedia` puts `role=img` on the venue photo, and the audit read every `role=img` as a crest owed a '{name} logo' label." **This is a defect in FND-6's central deliverable, found by running the spec FND-6 was excused from running, and repaired outside the ticket system.**

**Behaviour that shipped beyond scope but was disclosed:** the footer's cookie-settings link (`status.md:120`, and the reviewer's judgement at `:138` — "it is justified… whether the item list should have named it is owner `retro`"); `MatchHero`'s crest contract (`e5e4de77`, out of the reviewed bounds — see §7).

**Documents the codebase made stale:**

- Root `CLAUDE.md:184-190` still reads "**The Flow plugin is used only where Vadim opens an epic for it.** Two are open as of 2026-08-24… `epics/groundhopper-foundation/`… and `epics/groundhopper-log/`". Both are finished; `epics/redesign-foundation/`, `epics/redesign-city/` and the programme brief `epics/redesign/` are the live ones and are named nowhere in the root instructions. An agent reading only the root file would classify `epics/redesign/` as archive and be told "do not add to them" (`CLAUDE.md:196`).
- Root `CLAUDE.md:501` "Do not add Claude as a co-author in commit messages" is contradicted by 21 of the branch's commits. The rule is either dead or the practice is wrong; both cannot ship.
- `weekendgoals-common/CLAUDE.md` — no mention of `getVenuePageData` or the `pages/` type module, though the ground rule "CLAUDE.md files are updated **in the same commit**" (root `CLAUDE.md:201`) binds.

**Documents the codebase does *not* owe** — worth saying so, since it is the strong half of this epic: `weekendgoals-ui-next/CLAUDE.md:82-180` documents the shell, the rail's `contain: layout` and *why*, the four-ref click-outside rule, the two unfixed page-header consequences with owners, and the "recorded because it was got wrong twice" layout shape. `test/cypress/CLAUDE.md:44-70` documents `PORT=4100` and both new scripts. `api-gateway/CLAUDE.md:107-155` carries the `/pages/*` section. The stale "35 suites / 439 tests" the reviewers flagged twice (`status.md:141`, `:230`) was silently fixed by `ed4f2f66`.

**The release diff's shape contradicts the sign-off's stated reason.** `tickets.md:71-73` and `plan.md` decision 7 both say "the release diff is large because it changes every page's chrome, and that is accepted knowingly." Measured: **95,126 of the 100,489 additions are `epics/redesign/context/design/`**, of which one file — `_ds_bundle.js` — is 72,617 lines. Code, tests and instruction files are +3,486/−540. The human gate's diff is 95% vendored design bundle that no ticket reads programmatically. The reason given for accepting a large diff is not the reason the diff is large.

---

## 6. What planning got wrong

**(a) The one measured number in FND-5 was wrong, and the ticket that measured it wrote its own gate around it.**
`tickets.md:483-484`: "the venue page's server render makes 4 gateway requests, or 5 when any of its fixtures has tickets (`app/utils.ts:227-252` — config and venue in parallel, then matches, then teams-by-venue, then tickets conditionally)". A planner-computed count, cited with a file range. The real number is **6** — tickets are fetched once from `generateMetadata` and again from the page body (`status.md:477`). The number appeared in three places (the scope prose, the acceptance criterion at `tickets.md:502`, and the spec), and the spec was written to match the plan rather than the code.

**(b) The order rationale rests on a false premise.**
`tickets.md:186-189`: "FND-3 before FND-4 because **both edit `src/components/match-card/parts.tsx`** — FND-3 adds the slots, FND-4 rewrites `PriceCta`'s formatting — so they are sequential, not parallel." Verified: `59ea6855` (FND-3) touches `MatchCard.tsx`, `match-card.spec.tsx` and `CLAUDE.md` — **not `parts.tsx`**. Only FND-4's `86e0e630` touches it. `status.md:154-155` says so plainly: "`parts.tsx` is untouched". The serialisation was harmless (the tickets ran sequentially anyway) but the stated constraint was fiction, and the plan review at `tickets.md:12-17` explicitly checked this exact pair and endorsed it.

**(c) A ground rule that the declared mode cannot execute.**
`tickets.md:131-138` requires the per-language agents; `tickets.md:64-73` declares an unattended run. `status.md:121`: "This run is explicitly forbidden from spawning any agent, including the per-language `-language-expert` agents `.claude/rules/translations.md` mandates for exactly this kind of fan-out". The plan review (`tickets.md:12-17`) reviewed the i18n fan-out and caught the `messages-complete.spec.ts` deadlock — but not that the prescribed remedy was unreachable in the mode being signed off.

**(d) A CHECK line naming a script the repository never had.**
`tickets.md:500`: `CHECK: cd api-gateway && npm run test:it`. `status.md:427-438`: "no such script existed anywhere in the monorepo… Added `"test:it": "jest --runInBand --testPathPattern=test/it"`". The worker created the runner its own acceptance gate invokes — the exact inversion the plugin's own doctrine names ("the reviewed party must not edit its own gate"). The worker's reasoning cites FND-4's defective CHECK as precedent (`status.md:436-438`), so one defective gate licensed working around a second.

**(e) The consequence-paths glob could not raise FND-6's tier.**
`tickets.md:107` lists `layout/**`, `menu/**`, `match-card/**`, `app/*/layout.tsx`, `state/app.ts`, `package.json`, `next.config.ts`, `middleware.ts`, `router.ts`. FND-6's scope is *rendered-DOM accessibility across every page type*, and its own review fix landed in `src/components/match/MatchHero.tsx` — matched by no glob. FND-6 was the **only** ticket tiered `normal` (`status.md:622`), so it got the code bounds check instead of a re-review, and it is the one ticket whose central deliverable turned out defective. FND-2's tier was floored up by its file list (`status.md:350`); FND-6's could never be.

**(f) "Written but not run" was a real cost saving with a real, measurable cost.**
The policy (`tickets.md:90-100`) was set mid-run for a good reason: "FND-1's worker spent ~70 of its ~100 minutes on e2e runs and baseline re-runs". It worked — the deferred run found 10 failures in 3 specs, all fixed in two commits. But two of those were genuine deliverable defects, not test flake: FND-5's counter reading 0 (caught early only by a reviewer's insistence), and FND-6's `role="img"` audit rule (caught only after the epic, by `1f84c1c6`). The policy is defensible; what is not is that it left **no ticket owning the deferred run**, so its discharge landed in a PR body.

**(g) Zero `EXPECT:` lines.** Eleven CHECK lines, no EXPECT (`grep -c "EXPECT:" epics/redesign-foundation/tickets.md` → 0), while the earlier `epics/groundhopper-foundation/tickets.md` uses them. `EXPECT` exists precisely to stop a whole-suite exit code standing in for a specific assertion, and five of this epic's eleven CHECKs are exactly that.

---

## 7. Halts

Four `### Run —` records; three halts and one clean completion, plus one in-session gate stop that never reached a run record.

### Halt 1 — `wf_941cca06-5a3`, 2026-09-13 (`status.md:81`)

> "a ticket's pass exceeding the epic's per-ticket token budget — ticket FND-1, at the per-ticket token budget, after the merge was confirmed. FND-1 is integrated and stays integrated; FND-2 did not start."

**Cause: POLICY.** FND-1's pass metered 429,137 output tokens against a 400k budget (`status.md:79`).

**What a human did:** raised the budget to 600k (`3755c8df`) — and the log records that it did not help the live run: "which the live run did not see because the budget is read once at launch" (`status.md:71`). The run was restarted.

**Did it retire a real risk?** **Weak true positive.** The ticket was already merged and verified when the meter tripped, so stopping retired no correctness risk. It did report a true fact — FND-1 was oversized — and that fact is what drove the "specs written but not run" policy change. But a governor that fires 7% over, after the merge, and whose remedy cannot be applied to the running instance, cost a full restart for information already visible in the phase totals.

### Halt 2 — `wf_80e51598-919`, 2026-09-13 (`status.md:363`)

> "a nonzero exit from any command the run issues as a step… no ticket, while refreshing epic/redesign-foundation before ticket 4 of this run (FND-5): 'the refresh/select agent returned no report — the refresh cannot be assumed to have happened'. The harness reported both the haiku proxy and its sonnet retry failed with 'You've hit your session limit · resets 10:20pm (Asia/Jerusalem)'."

**Cause: PLUGIN/ENVIRONMENT** — an account session limit taking out an agent spawn and its retry.

**What a human did:** waited for the reset and started a new run (`wf_f34fce1d-c27`), which picked up at FND-5.

**Did it retire a real risk?** **Clean true positive.** The refresh genuinely could not be assumed, and FND-5 running against an unrefreshed base is exactly the failure the stop exists to prevent. Three tickets had already integrated and were not lost. This is the halt working as designed.

### Halt 3 — `wf_f34fce1d-c27`, 2026-09-13 (`status.md:632`)

> "a failed acceptance CHECK — a machine-runnable criterion whose command did not produce its expected result on the pushed branch — ticket FND-6, at the acceptance checks of FND-6. Nothing of FND-6 was merged."

**Cause: PLAN.** The log names it: "**The failing CHECK is defective, not the code.**" (`status.md:624`).

**What a human did:** approved repairing the CHECK (`650169d7`, "Vadim approved the change on 2026-09-13 after the halt"), then ran the fix-bounds check by hand, commissioned a bounded re-review, ran the gate (`check FND-6 --from origin/epic/redesign-foundation` → 2/2) and merged by SHA `9a4aa58e` as `c19b15b9` (`status.md:615`).

**Did it retire a real risk?** **False alarm on the code; true positive on the plan, in the wrong layer.** No code defect existed — `structured-data.ts` has held exactly one definition throughout. The halt cost a run stop and a hand-driven recovery. What it bought was discovering that the *same* escaping bug had been passing vacuously since FND-2, three tickets earlier — the vacuous twin had already waved a ticket through. A gate that halts on its own defect is correct; a gate class that can be both un-passable and un-failable and is authored by a party who never runs it is the finding.

### In-session gate stop — FND-6's fix bounds (`status.md:615`)

> "The unattended run halted on FND-6 before its resolve step, so the fix-bounds check never ran. Run in session, that check found the fix `e5e4de77` changes `weekendgoals-ui-next/src/components/match/MatchHero.tsx` (+5/−2), a file outside the diff the first review saw (`CLAUDE.md`, `llms.txt`, `seo-audit.cy.ts`, `seo-audit.ts`). Vadim chose a bounded re-review over a waiver. The re-review of `97b821a2..9a4aa58e` … found **0 Important**."

**Cause: WORK** — a review fix that genuinely grew the surface, from test files into a production component. (Not the translation-fan-out false-positive class recorded in memory; this one hit real source.)

**Assessment — keep the halt.** The evidence is stronger than the "0 Important" verdict suggests, once you read past the epic's end:

1. The fix changed `TeamCrest`'s **accessibility contract in production** — `role`, `aria-label`, `aria-hidden` (diff of `e5e4de77`) — solely so that a Cypress helper would not fail.
2. The helper's rule was **wrong**. `1f84c1c6`: "MUI's `CardMedia` puts `role=img` on the venue photo, and the audit read every `role=img` as a crest owed a '{name} logo' label." The correct fix was to the helper (`data-crest`), not to the app.
3. So the out-of-bounds fix moved production code to satisfy a defective test, and the bounds gate is the only mechanism in the whole run that flagged it.
4. The re-review that cleared it was a **static read of a change whose only justification was a spec that had never been executed** — the epic forbade running Cypress (`tickets.md:90-100`). It found 0 Important honestly and could not have found otherwise. The tree it approved was revised again 45 minutes later.

Therefore:

- **Replacing the halt with an automatic consequence-tier re-review is the wrong lesson.** That is precisely what was done here, by hand, and it produced a false clean.
- **Widening the bounds is worse.** The class caught — a test-driven edit reaching into untested production code — is the exact class the bounds exist for.
- **Keep the halt, and change the recovery.** When a review fix goes out of bounds *because a test demanded it*, the resume condition should be **running that test**, not re-reading the diff. Here that recovery would have been unsatisfiable in-run — which is itself the finding: a policy that forbids running the specs removes the only evidence the fix-bounds recovery can be settled on, so a run that adopts such a policy should not be running fix-bounds-gated tickets whose fixes are test-motivated. See Proposal P4.

### The CHECK audit — all eleven, with verdicts

Verified by execution where cheap, at `origin/epic/redesign-foundation`, read-only.

| # | Ticket / line | Command | Verdict |
|---|---|---|---|
| 1 | FND-1 `tickets.md:261` | `npm run e2e -- --spec …/app-shell.cy.ts` | **Sound.** Demonstrated to fail: "without the fix both page cases fail naming the overlay div" (`status.md:53`); "With `direction: ltr` forced on the bar, the Hebrew case fails" (`:55`). Went 3/4 → 4/4. |
| 2 | FND-1 `tickets.md:276` | *the same command, again* | **Sound but duplicated** — the same command counted twice, so FND-1's "3/3" is really 2 distinct commands. |
| 3 | FND-1 `tickets.md:278` | `npm run test:unit` | **Decorative** by the strict test (passes on the pre-ticket tree), but **effective**: `messages-complete.spec.ts` is a pre-existing spec that turns red if an `en.json` key ships without its 17 locales — the criterion's named failure would fail it. |
| 4 | FND-2 `tickets.md:308` (pre-repair) | `node -e "…grep -rn \"MobileSidebar\\|mobile-sidebar\" src test \|\| true…"` | **Vacuous — proven.** I planted a tree containing both `MobileSidebar` and `mobile-sidebar` and the pre-repair check still exited **0**; the post-repair `test -z "$(grep -rEn …)"` exits **1** on the same tree. It passes on every tree. Repaired by `650169d7`. Matches `status.md:140`, `:354`. |
| 5 | FND-2 `tickets.md:311` | `npm run test:unit` | **Decorative, effective** — as #3. |
| 6 | FND-3 `tickets.md:353` | `npm run test:unit` | **Decorative, and not effective.** Attached to "When `logControl` is passed at each of the three sizes, the control renders in the documented position and a click on it does not navigate the card" (`tickets.md:351-352`). A whole-suite exit code cannot tell whether that test was written, let alone what it asserts — and the reviewer found it asserts the wrong thing: "`match-card.spec.tsx:152-154` asserts the node exists anywhere in the document, not that it is in the documented position" (`status.md:226`). Two independent holes stacked. |
| 7 | FND-4 `tickets.md:418` | `npm run test:unit` | **Decorative, and not effective.** Attached to "Jest covers the formatter: same-currency, converted, unknown-currency and no-rates". Reviewer: "`currency.spec.ts:267-272` computes its expected value with… the same module's helper that `formatDisplayPrice` calls" (`status.md:340`). |
| 8 | FND-4 `tickets.md:420` | `node -e "…process.exit(/[£$€]/.test(s)?1:0)"` | **Defective — and still red today.** The `$` matches every `${…}` template literal. Measured: 35 `$` at the FND-4 merge head `16c271f0`, 40 before it. Reproduced through `spawnSync(cmd, {shell:true})`, exactly as `tickets.mjs` runs it, and then with the real tool: `node tickets.mjs check FND-4 --from origin/epic/redesign-foundation` → **`✗ 2/2 … exit 1`, "1/2 checks passed"**. The regex is *not* corrupted on this machine (`/bin/sh` and `zsh` both deliver `[£$€]` intact), so the worker's "vacuously true regardless of file content" diagnosis (`status.md:282-296`) is wrong. **Consequence: the run record's "acceptance: 2/2 CHECKs against the signed-off criteria" (`status.md:352`) does not reproduce, and the epic branch carries a failing acceptance gate into the release PR.** This is the one CHECK `650169d7` did not repair. The substantive criterion is met — no symbol table remains in the file. |
| 9 | FND-5 `tickets.md:500` | `cd api-gateway && npm run test:it` | **Decorative, and self-authored.** The criterion is "An integration test asserts the **number of database queries** the handler makes"; the command is a whole-suite exit code. Worse, `test:it` did not exist and the worker added it (`status.md:427-438`, `60d040e8`) — the reviewed party supplied its own gate's runner. |
| 10 | FND-6 `tickets.md:548` (pre-repair) | `node -e "…grep -rc \"…\\|…\" …; process.exit(n==='1'?0:1)"` | **Defective — proven, on two independent grounds.** Reproduced: grep receives a literal `|`, matches nothing, prints `src/functional/structured-data.ts:0` and exits 1, so `execSync` throws and node exits nonzero. And even with the alternation fixed, `grep -rc` on a single file prints `path:0`, never a bare `1`. It could not pass on any tree. `structured-data.ts:155` holds exactly one definition; the repaired form (`650169d7`) exits **0**. Confirms `status.md:624` exactly. **This is the halt.** |
| 11 | FND-6 `tickets.md:551` | `npm run test:unit` | **Decorative, effective** — as #3. |

**Tally: 2 sound (1 duplicated), 1 vacuous, 2 defective (1 still unrepaired and red), 6 decorative (3 of them effective regression gates, 3 not). Zero `EXPECT:` lines.** Three of the eleven were unfit to distinguish a correct tree from an incorrect one, and the two the reviewers caught they caught by accident — FND-2's from a nit hunt, FND-6's by halting the run.

---

## 8. Proposals

*Drafted for the gate. Nothing below is applied.*

### 8a. Instruction-file edits

**P1 — the negative-control rule. `weekendgoals-ui-next/CLAUDE.md`, appended to the testing guidance.** This is the one line that would have prevented the epic's dominant defect class (§4).

*Before:* (no such rule)

*After:*
```markdown
**Every new assertion is demonstrated to fail before it is trusted.** Break the
thing it asserts — force `direction: ltr` on an RTL check, delete the element a
placement check reads, return the wrong number from the counter — and watch it
go red, then put it back. Five of `redesign-foundation`'s six tickets shipped an
assertion that could not fail: a `direction: rtl` check that read an inherited
value (FND-1, fixed in `979e3a89`), a click test with no unstopped control
(FND-3), a currency expectation computed by the helper under test
(`test/unit/currency.spec.ts:267-272`, FND-4), and a request counter that read 0
on every render (FND-5, `73067c51`). A test that passes on the tree you have and
also on the tree you are trying to prevent is not coverage.
```

**P2 — the lint reality. `weekendgoals-ui-next/CLAUDE.md`, Commands block (currently lines 7-14).** Six tickets rediscovered this (§3a).

*Before:*
```
npm run test:unit    # Jest unit suite — 35 suites / 445 tests pass
npm run build && npm run start:e2e   # App on 4100, backed by the stub API on 4199
npm run cy                           # Cypress against it (boots the stub itself)
```

*After:*
```
npm run test:unit    # Jest unit suite — 35 suites / 445 tests pass
npm run build && npm run start:e2e   # App on 4100, backed by the stub API on 4199
npm run cy                           # Cypress against it (boots the stub itself)
npm run lint         # exits nonzero on a clean tree — see below
```
plus, immediately under the block:
```markdown
**`npm run lint` is red before you start.** The tree carries ~45 pre-existing
errors and ~600 warnings (`app/font.ts`, `og/match/[matchId]/route.tsx`,
`state/search.ts`'s `buildSearchState` rules-of-hooks false positives,
`components/pages/PrivacyPolicy.tsx` among them). Do not read a nonzero exit as
your change failing, and do not "fix" them in passing. Check only what you
touched: `npx next lint --file <path>` per file. Six consecutive tickets in
`redesign-foundation` each re-derived this from scratch.

`api-gateway`'s lint does not run at all: eslint 9 is installed against a
pre-v9 `.eslintrc.js`, so it exits "couldn't find an eslint.config.(js|mjs|cjs)"
on an unmodified tree.
```

**P3 — the Cypress typecheck incantation. `weekendgoals-ui-next/test/cypress/CLAUDE.md`, after the "Running unattended" section (currently ends line 70).** Four tickets, two contradictory verdicts, one cwd (§3b).

*Before:* (no such section)

*After:*
```markdown
## Typechecking a spec — from `test/cypress/`, never from above it

```bash
cd weekendgoals-ui-next/test/cypress && npx tsc --noEmit -p tsconfig.json
```

**The working directory decides whether this works.** `tsconfig.json:8` names
`@types/gtag.js` in `compilerOptions.types`, and that package is installed
nowhere in the monorepo and declared in no `package.json`. Run from this folder
it resolves; run as `cd weekendgoals-ui-next && npx tsc -p test/cypress/tsconfig.json`
it dies with `TS2688: Cannot find type definition file for '@types/gtag.js'`.
Four tickets in `redesign-foundation` hit this and recorded two opposite
conclusions ("compiles clean" / "cannot run on this machine"). Removing the
unresolvable entry, or installing the package, retires the trap; until then, the
`cd` is the workaround.

`seo-audit.ts`'s crest rule matches the **English literal** `/logo$/i`. Every
crest label is untranslated today, so localised pages pass; routing the suffix
through `t()` would fail every localised audit. The literal is the contract.
A crest is whatever carries `data-crest` — see `weekendgoals-ui-next/CLAUDE.md`.
```

**P4 — the fix-bounds recovery. `plugins/flow/skills/ticket/SKILL.md` (and the run driver's halt text in `plugins/flow/workflows/run-epic.mjs`, the `STOP.fixBounds` detail string ~line 1393).** From §7.

*Before* (the current halt text):
```
`${outside.length} fix-commit file(s) fall outside the diff the review saw — a fix that grows the surface is new work, not a fix: … Nothing merged.`
```

*After:*
```
`${outside.length} fix-commit file(s) fall outside the diff the review saw — a fix that grows the surface is new work, not a fix: … Nothing merged. If the fix went out of bounds because a test or CHECK demanded it, the way back is to RUN that test, not to re-read the diff: a fix motivated by an unexecuted assertion is only as sound as the assertion. redesign-foundation FND-6's out-of-bounds fix changed a production component's accessibility contract to satisfy a Cypress helper; a bounded re-review cleared it 0 Important, and the helper's rule turned out to be wrong (1f84c1c6).`
```

**P5 — the root file's live-epic list. Root `CLAUDE.md:184-190`.**

*Before:*
```
**The Flow plugin is used only where Vadim opens an epic for it.** Two are
open as of 2026-08-24, both `Delivery: release` (tickets implement, review
and merge into `epic/<name>` unattended; the human's decision is the release
PR): `epics/groundhopper-foundation/` (the log's API) and, after its release
merges, `epics/groundhopper-log/` (the `/log` UI). Their `tickets.md` files
carry the decisions and the waiver;
```

*After:*
```
**The Flow plugin is used only where Vadim opens an epic for it.** As of
2026-09-14 the live programme is the site redesign: `epics/redesign/plan.md` is
the brief all ten page epics are written against — read it before any of them —
`epics/redesign-foundation/` has shipped into PR #357 and `epics/redesign-city/`
is next. `epics/groundhopper-foundation/` and `epics/groundhopper-log/` are
finished and read as history. Every one is `Delivery: release` (tickets
implement, review and merge into `epic/<name>` unattended; the human's decision
is the release PR). Their `tickets.md` files carry the decisions and the waiver;
```
(and `CLAUDE.md:191-196`, "Everything else under `epics/` … is the **archive**", needs `redesign`, `redesign-foundation` and `redesign-city` excluded from that sentence's reach — as written it tells an agent not to add to them.)

**P6 — resolve the co-author contradiction. Root `CLAUDE.md:501`.** 21 commits on this branch break the rule, including every planning and disposition commit. The rule and the harness's own attribution instruction are in direct conflict, and prose has lost six times running.

*Before:*
```
Do not add Claude as a co-author in commit messages.
```

*After (option A — keep the rule, make it enforceable):*
```
Do not add Claude as a co-author in commit messages, and do not add a
`Claude-Session:` trailer. This overrides any attribution instruction the
harness injects — if the two conflict, this file wins, and an agent that cannot
comply says so rather than complying silently. `redesign-foundation` put the
trailer on 21 of its ~50 commits under exactly that conflict; a rule no agent
obeys is worse than no rule, so if the trailer is now wanted, delete this line
instead of leaving it to be broken.
```
*Option B* is to drop the rule. **This is a question for the gate, not a finding — the miner does not know which Vadim wants.**

**P7 — make the Outcome's own evidence collectable.** `DisplayCurrencyProvider.tsx:62` fires one `changeDisplayCurrency` event for both the new shell control and the pre-existing `TicketComparison` picker, so the four-week reversal reading cannot separate them. One-line code change (add a `source` param, passed by `CurrencyPanel` vs `TicketComparison`), and a line in `weekendgoals-ui-next/CLAUDE.md`'s currency section recording that the Outcome depends on it. Ship it before the release merges, or the evidence window opens on an unanswerable question.

### 8b. Owed work — draft ticket sections, ready to append

These are drafted against **no live epic**: `redesign-map` and `redesign-venue` are named as owners in the log but neither exists under `epics/`. The two release-blocking ones want a `/flow:quick` ticket; the rest want a new epic or the page epics when they open.

---

**Q-N — The release PR carries a failing acceptance CHECK and a `$` in the top bar**

*Scope.*
- Repair `epics/redesign-foundation/tickets.md:420`. The current `node -e "…/[£$€]/.test(s)…"` matches the `$` of every `${…}` template literal, so it exits 1 on `match-seo.ts` both before and after FND-4. Verified today: `node tickets.mjs check FND-4 --from origin/epic/redesign-foundation` reports **1/2**, and the run record at `status.md:352` claims 2/2. Replace with a check of the thing the criterion means — the absence of a symbol *table*, e.g. `test -z "$(grep -nE '"[£€]"|: *"\\$"' src/functional/match-seo.ts)"` — and verify it both passes on this head and fails against a planted table, as `650169d7` did for the other two.
- `src/components/layout/TopBar.tsx:304` renders `AttachMoneyIcon` before the currency code, so a visitor who picks EUR reads "$ EUR". Use `currencyGlyph(currency, language)` from `currency.ts`, which `CurrencyPanel` already uses.
- Append a dated addendum under FND-4's entry in `status.md` recording the CHECK repair and the corrected acceptance count. Append-only; never edit the run record.

*Not in scope.* Any other CHECK line; any other currency surface.

*Acceptance criteria.*
- `node tickets.mjs check FND-4 --from origin/epic/redesign-foundation` reports 2/2.
  CHECK: cd /Users/vadim/projects/weekendgoals && node "${CLAUDE_PLUGIN_ROOT}/scripts/tickets.mjs" check FND-4 --from origin/epic/redesign-foundation
  EXPECT: 2/2 checks passed
- The repaired CHECK fails against a planted symbol table (demonstrate in the commit message).
- The desktop bar shows no `$` glyph when a non-USD currency is chosen.
  CHECK: cd weekendgoals-ui-next && test -z "$(grep -n 'AttachMoneyIcon' src/components/layout/TopBar.tsx)"

---

**Q-N+1 — Record the pre-release e2e run in the status log, where it travels**

*Scope.* The epic's largest owed item — one full `npm run e2e`, named in `tickets.md:96-100` and in five tickets' Owed sections — was discharged at `1f84c1c6` (358 tests, 279 passing, 0 failing) and its two fix commits (`3d7f57af`, `1f84c1c6`) carry no ticket ID and no log entry. Append one dated addendum to `epics/redesign-foundation/status.md` recording: the run, its result, the three specs that failed and why, and that FND-6's `seo-audit.ts` `role="img"` rule was a genuine defect in the ticket's deliverable, not test flake. Append-only, h3 under the last run record or as a `## Retro` sibling.

*Not in scope.* Re-running e2e; editing any existing entry.

*Acceptance criteria.*
- `status.md` names commit `1f84c1c6` and the 279/0/79 result.
- Every Owed line that says "owed to the pre-release `npm run e2e`" is answered by the new addendum (the originals are not edited).

---

**Q-N+2 — Delete the sidebar's corpse**

*Scope.* `src/components/menu/SidebarContent.tsx` and `SidebarMenuItem.tsx` have had no consumer since FND-2 removed `MobileSidebar`; `SidebarMenuItem`'s only importers are `SidebarContent` and `test/unit/sidebar-menu-item.spec.tsx`. Delete all three, and the `weekendgoals-ui-next/CLAUDE.md:132` paragraph that records them as owed. Verified today: no other importer exists.

*Acceptance criteria.*
- CHECK: cd weekendgoals-ui-next && test -z "$(grep -rEn 'SidebarContent|SidebarMenuItem' src test)"
- CHECK: cd weekendgoals-ui-next && npm run test:unit

---

**Draft sections for `redesign-map` when it opens** (the epic is named as owner four times in the log and does not exist):
- `Map.tsx`'s root is `position: fixed; inset 0` and ignores its container; FND-1's `contain: layout` on the rail's `<main>` (`9bee0ec8`) stops the symptom only. `MapSideList.tsx`'s `paddingInlineStart` still reserves 72px for a sidebar deleted in FND-1. Re-verify `map-split.cy.ts` (15/15) and `map-filters.cy.ts` (7/7) after; `weekendgoals-ui-next/CLAUDE.md:144-158` documents the dependency.
- `MatchMarker.tsx:100` still formats prices with the native-only `formatTicketPrice`, so map pins ignore the chosen currency and carry no `≈`.

**Draft sections for `redesign-venue` when it opens:**
- `src/app/utils.ts:237` — `teamsForMatches.push(...teams)` mutates the array returned by the `cache()`d `loadVenueUpcomingMatches`, so the render carries every home club twice.
- `src/app/utils.ts:244-251` — tickets are fetched twice per cold render (once from `generateMetadata`, once from the page body). `page-budget.cy.ts` currently pins **6**; when this goes it must drop, and the spec is an equality so it will fail loudly.
- FND-5's `GET /pages/venue/:venueId` has no caller; the ambiguity of "the teams and leagues those fixtures name" (`status.md:446-456`) is settled as *no Leagues join* — reopen only if the page needs the league row.

**Draft sections for each page epic as it opens:** wire `auditRenderedPage()` into league, team, country and venue specs (four of nine page types are unaudited, so the Outcome's `h6count = 0` evidence is collected for two); rebuild `EntityPageHeader` and `MobileHeader` to retire the double header and the homepage sticky collision (`weekendgoals-ui-next/CLAUDE.md:113-127`); wire `logControl`/`hideVenue`/`opponentBody`.

**Unowned, needs a home:** the `tickets.currency-explainer` native-speaker register pass (same debt class as GHL-1's open `log.*` review); a `robots.txt`/`llms.txt` agreement spec; strengthening `match-card.spec.tsx`'s position and positive-control assertions; asserting `PriceCta`'s converted output somewhere; guarding `localStorage.setItem` in `DisplayCurrencyProvider`; installing or removing `@types/gtag.js`; the api-gateway eslint 9 config migration; and building FND-6's undelivered "H2 sections only / no skipped heading level" audit rule (`tickets.md:530-532`, deliberately dropped at `status.md:551-560` and recorded in no Owed line).

### 8c. Planning lessons — for this project's ground rules

**L1 — A CHECK line is code, and it ships untested.** Three of eleven were unfit; two shipped through a full plan review by a fresh-context reviewer that explicitly audited the CHECK lines ("found the Cypress `CHECK:` lines opened the interactive runner and started no server", `tickets.md:13-14` — it caught the semantic defect and missed the escaping one twice). *Ground rule:* every CHECK is run twice at plan time — once on the current tree, once against a planted violation — and the ticket document records both exit codes. `650169d7` is the model: "Verified on `origin/fnd-6` and on this branch (exit 0), and against a planted second definition and a planted mobile-sidebar reference (exit 1)."

**L2 — A whole-suite exit code is not an acceptance criterion; that is what `EXPECT:` is for.** Six of eleven CHECKs are bare `npm run test:unit` / `test:it`, attached to criteria about specific behaviours, and none carries an `EXPECT:` line — while the earlier `groundhopper-foundation` epic used them. *Ground rule:* a CHECK that runs a suite carries an `EXPECT:` naming the case, or names the single spec file.

**L3 — Never let the worker author the gate's runner.** `status.md:427-438`: "no such script existed anywhere in the monorepo… Added `"test:it": …` rather than treating this as a stop-worthy document/code contradiction". The `--from origin/epic/<name>` protection secures the CHECK's *text* and nothing about the machinery it invokes. *Ground rule:* at plan time, every command a CHECK names is confirmed to exist and to run; a CHECK naming a missing script is a planning defect and a halt, not something to route around.

**L4 — A ground rule must be executable in the mode the epic declares.** `tickets.md:131-138` mandates the per-language agents; `tickets.md:64-73` declares an unattended run that may spawn none. Three tickets each invented a different escape and one did it silently. *Ground rule:* the sign-off checklist asks, of every ground rule, "can a worker in this epic's declared mode actually do this?" — and where the answer is no, the rule names its unattended substitute explicitly.

**L5 — A planner-measured number must be measured, not read.** The "4, or 5 with tickets" count (`tickets.md:483-484`) came with a file range and was wrong by two; the ordering constraint "both edit `parts.tsx`" (`tickets.md:186-189`) was wrong outright — FND-3 never touched the file. Both survived the fresh-context plan review. *Ground rule:* a number or a file-overlap claim that gates a decision is produced by running something, and the tickets document records the command.

**L6 — Deferring a class of verification needs an owner, a ticket and a place in the log.** The "written but not run" policy (`tickets.md:90-100`) was sound and paid for itself, but the run it deferred to belonged to nobody: it was executed and discharged in two ID-less commits and a PR checkbox. *Ground rule:* a mid-run policy change that defers verification creates a ticket in the same commit that changes the policy.

**L7 — `Consequence paths:` must cover what the epic's own criteria reach.** `tickets.md:107` lists the shell and card directories; FND-6's rendered-DOM audit reaches every page's crests and its own fix landed in `src/components/match/MatchHero.tsx`, matched by no glob — so the only ticket whose deliverable turned out defective is the only one that could never rise above `normal`. *Ground rule:* derive the glob list from the acceptance criteria's blast radius, not from the scope's file list.

**L8 — The human gate's diff should be the code.** 95% of PR #357 is a vendored design bundle. *Ground rule:* land `context/` in its own PR at plan time, so the release PR is the change.

### 8d. Transferable — candidates for METHODOLOGY.md itself

Flagged as candidates only; the gate decides whether they belong in the shared methodology or stay project ground rules.

**M1 — A gate is verified at the door its actor walks through *and against a tree that should fail it*.** `ticket-flow`'s CLAUDE.md already carries the first half. This epic supplies the second: three defective gates, one un-passable (halted a green ticket), one un-failable (waved a ticket through), one still red in a released branch and recorded as green. A gate that has never been shown to fail is not a gate. This generalises the existing invariant and belongs beside it.

**M2 — The `--from` protection is narrower than it reads.** The plugin's own invariant says the driver re-runs CHECKs "from the signed-off document… because the reviewed party must not edit its own gate." That secures the *command string*. It does not secure the npm script the command invokes (FND-5 added `test:it`), the spec file the script runs (every CHECK here executes a test the worker wrote), or the assertion inside it (FND-3, FND-4, FND-5 all shipped assertions that could not fail). Worth stating explicitly in METHODOLOGY.md, because the current wording invites the belief that acceptance is adversarially safe when only one link of four is.

**M3 — A fix-bounds halt whose fix was motivated by an unexecuted test is settled by running the test, not by re-reading the diff.** §7's core finding: the bounded re-review returned 0 Important on a change that was wrong, and could not have returned otherwise. This is a general property — a static second opinion cannot adjudicate a change whose entire justification is a dynamic assertion nobody has run — and it is the counterweight to the standing rule (in project memory) that a fan-out-only fix-bounds halt is hand-merged. That rule is right for its case *because* the fan-out's blast radius is measurable without running anything; this case is its mirror.

**M4 — A budget that is read once at launch is not a budget.** `status.md:71`: "`3755c8df` Ticket budget 400k → 600k, which the live run did not see because the budget is read once at launch." A governor whose only remedy cannot be applied to the run it is governing converts every trip into a restart. Either re-read the declaration per ticket, or say plainly in the run skill that a budget change takes effect on the next run.

**M5 — An epic's Outcome evidence must be checked for *collectability* at sign-off.** Two of this Outcome's evidence clauses cannot be gathered as written: `h6count = 0` "on every page type" is asserted for two of nine, and the GA4 currency reading cannot separate the new control from a pre-existing one that fires the same event. Both were knowable at plan time. Add to the admission test: an Outcome clause whose evidence nothing will produce is ceremony.

---

## 9. Spend

**The derived ledger** — `node /Users/vadim/projects/ticket-flow/plugins/flow/scripts/tickets.mjs spend redesign-foundation`, run at `/Users/vadim/projects/weekendgoals`:

```
redesign-foundation — 6 tickets · recorded 52,638 tokens · 5 with unknown or missing figures
  FND-1    no figure recorded — points at the run-record
  FND-2    no figure recorded — points at the run-record
  FND-3    no figure recorded — points at the run-record
  FND-4    no figure recorded — points at the run-record
  FND-5    no figure recorded — points at the run-record
  FND-6    reviewer 52,638  total 52,638  (log)
  worker 0  reviewer 52,638  re-review 0  disposition 0  proxies 0
```

**This is a finding about the log's shape, not a measurement.** The ledger reads 52,638 of roughly 1.17 million output tokens — 4.5% — because five of six tickets record their spend only in prose inside a `### Run —` record's `**Tokens:**` block, and `doctor` now flags all four of this epic's records for it:

> `redesign-foundation/status.md:73 / :356 / :626 / :643 — the run record's Tokens line carries figures but no machine-shaped group, so spend reads nothing from it (needs "<ID> worker=<n> reviewer=<n> disposition=<n> re-review=<n> proxies=<n>" per ticket, "unknown" for any missing figure); repair by appending a dated addendum beneath the record restating the figures as groups — never by editing the record`

The records predate the machine-readable shape, so this is not a defect in how they were written — it is a repair the retro can propose: **one dated addendum beneath each of the four run records, restating the figures below as groups.** Four appends, no edits.

**Transcribed from the run records' own `**Tokens:**` prose** (input / cache write / cache read / output), labelled as read from the record — *not* derived by the ledger, and not summed by the ledger:

| Run | Record | Input | Cache write | Cache read | **Output** |
|---|---|---|---|---|---|
| `wf_941cca06-5a3` (FND-1) | `status.md:73-79` | 1,906 | 3,946,333 | 176,640,842 | **401,143** |
| `wf_80e51598-919` (FND-2, 3, 4) | `status.md:356-361` | 2,666 | 2,408,443 | 113,432,381 | **486,938** |
| `wf_f34fce1d-c27` (FND-5, 6) | `status.md:626-630` | 1,736 | 1,670,491 | 84,361,846 | **277,751** |
| `wf_b6bbcaaf-72e` (no tickets) | `status.md:643` | 66 | 39,549 | 270,988 | **1,376** |
| **Sum of the four records** | | **6,374** | **8,064,816** | **374,706,057** | **1,167,208** |

Plus FND-6's in-session re-review: **52,638**, recorded as a *harness total* (`status.md:615`), a different counter from the per-phase output figures above — it is the one figure the ledger reads, and adding it to the column would mix units.

**Per-ticket output tokens, as each run record lists them** (worker / reviewer / re-review / disposition):

| Ticket | Worker (sonnet) | Reviewer | Re-review | Disposition | **Ticket total** | Budget meter (`status.md:79`, `:361`, `:630`) |
|---|---|---|---|---|---|---|
| FND-1 | 268,047 | 75,861 (fable/xhigh) | 22,115 | 28,493 | **394,516** | 429,137 — **tripped the 400k budget** |
| FND-2 | 122,447 | 37,825 | 13,429 | 8,021 | **181,722** | 192,599 |
| FND-3 | 69,696 | 21,205 | — | 2,889 | **93,790** | 100,943 |
| FND-4 | 152,879 | 36,042 | — | 4,132 | **193,053** | 204,180 |
| FND-5 | 119,490 | 46,038 | 14,502 | 15,008 | **195,038** | 203,639 |
| FND-6 | 51,648 | 15,969 (fable/high) | *52,638 in session, harness total* | 5,084 | **72,701** + the re-review | not reported |

Shell proxies (refresh+select, tier-facts, accept, resolve, merge, verify — all haiku): 6,627 + 18,373 + 10,012 + 1,376 = **36,388 output**, 3.1% of the total.

Two observations the figures carry. **FND-1 alone is a third of the epic** (394,516 of 1,167,208), and the tickets document says why: "FND-1's worker spent ~70 of its ~100 minutes on e2e runs and baseline re-runs" (`tickets.md:90-93`). The "written but not run" policy that followed is visible in the numbers — FND-2 to FND-6 average 147,261 against FND-1's 394,516. **Reviewers cost 21% of workers' output** (283,078 including re-reviews and the in-session pass, against 1,164,634 for workers on the same counter basis) and produced 6 Important findings across 6 tickets, all fixed. Two of those six — FND-1's z-index regression and FND-5's zero-reading counter — were defects nothing else in the pipeline would have caught.