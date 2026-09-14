# Run-lane hardening epic — run log

Append-only record of unattended runs. Tickets: `epics/run-lane-hardening/tickets.md`.
Ticket entries and their review addenda stay in `epics/run-lane-hardening/status.md`.

**Rules.** Append only. Corrections are new dated addenda beneath the entry they
correct, never edits. Report counts, not adjectives. The **Owed** line is
required even when empty.

### Run — 2026-09-14 — completed

**Driver:** attended — every ticket through `/flow:ticket` in supervisor mode in one session (fresh-context worker, supervisor-hired reviewer, step 10's merge into `epic/run-lane-hardening` by verified SHA), never `/flow:run`; see the preamble's Delivery paragraph for why. This is the first record in `runs.md`, written under HARD-4's own rule.
**Tickets this run:**
- HARD-1 — `worker:HARD-1 (opus)` — tier consequence, reviewed by opus at xhigh: 1 Important, 3 nits, all fixed (`2b153ef`, `7fc8b17`) — re-reviewed after fixes: 0 Important — acceptance: 2/2 CHECKs — integrated (`59b49ad`, merged as `40211c2`).
- HARD-2 — `worker:HARD-2 (opus)` — tier consequence, reviewed by opus at xhigh: 0 Important, 4 nits, all fixed (`6f23d01`) — fixes inside the reviewed files, no re-review (no Important) — acceptance: 3/3 CHECKs — integrated (`c1f878d`, merged as `e444c83`).
- HARD-3 — `worker:HARD-3 (opus)` — tier consequence, reviewed by opus at xhigh: 1 Important, 5 nits, all fixed (`7f8c5c9`, `fa0d83e`); re-reviewed after fixes: 1 Important (the unfetched tracking ref), fixed (`55c640a`); narrow re-review: 0 Important — acceptance: 2/2 CHECKs — integrated (`b28805d`, merged as `68a17d3`).
- HARD-4 — `worker:HARD-4 (opus)` — tier consequence, reviewed by opus at xhigh: 1 Important, 5 nits, 1 recorded, the rest fixed (`2f08507`) — re-reviewed after fixes: 0 Important — acceptance: 3/3 CHECKs — integrated (`1b1a581`, merged as `eeb9ab8`).
- HARD-5 — `worker:HARD-5 (opus)` — tier normal, reviewed by sonnet at high: 0 Important, 0 nits — acceptance: 2/2 CHECKs — integrated (`91449a2`, merged as `b0fe149`).
- HARD-6 — `worker:HARD-6 (opus)` — tier normal, reviewed by sonnet at high: 0 Important, 1 nit, fixed (`71f8190`) — acceptance: 2/2 CHECKs — integrated (`e147030`, merged as `ce15b49`).

**Tokens:** HARD-1 worker=181,146 reviewer=148,524 re-review=168,282 disposition=411,249 proxies=unknown; HARD-2 worker=170,716 reviewer=153,837 disposition=194,477 proxies=unknown; HARD-3 worker=130,536 reviewer=157,035 re-review=441,926 disposition=618,496 proxies=unknown; HARD-4 worker=175,004 reviewer=148,747 re-review=186,220 disposition=440,154 proxies=unknown; HARD-5 worker=119,882 reviewer=127,026 disposition=124,995 proxies=unknown; HARD-6 worker=120,147 reviewer=116,090 disposition=131,998 proxies=unknown; total=4,466,487 — harness totals per agent as the supervisor observed them at each agent's stop (worker = the implementation leg; disposition = the same worker's later legs, summed; re-review = every bounded re-review of that ticket, summed; no shell proxies ran in an attended run). Reviewer tiers: HARD-1 to HARD-4 opus/xhigh (consequence paths), HARD-5 and HARD-6 sonnet/high.

**Halted on:** ran to completion.

**Protection:** not present — 403 on both probes (free plan). Attended run; no waiver relied on.

**Release PR:** https://github.com/weekendgoals/ticket-flow/pull/46
