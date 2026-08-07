# ClusterGG — The Live Plan

**This is the working plan, as of 7 August 2026.** It supersedes nothing: the
full build history, every decision and every correction stays in
`docs/EXECUTION_PLAN.md`, which is 4,700 lines and is a record rather than a
plan. This document is only **what is left**, why it is in that order, and where
we know we are weak.

It exists because a reader should not have to reconstruct the current state from
an archive.

---

## READ THIS FIRST — what we want from you

**You are being asked to attack this plan.**

If you are the independent reviewer who wrote `docs/DUE_DILIGENCE_REPORT.md` and
`docs/DD_RESPONSE_REVIEW.md`: both were right, both changed what we are doing,
and the second one caught an arithmetic error inside the very dispute where we
claimed to understand the first. That is the standard. Keep it.

If you are new: read `docs/DUE_DILIGENCE_REPORT.md` (the kill verdict),
`docs/DD_RESPONSE.md` (our reply), and `docs/DD_RESPONSE_REVIEW.md` (the review
of the reply) before you read the rest of this. Do not take a claim in this file
on trust — several claims in our documents have been wrong, and every one of
them was found by someone reading the source instead.

**What is most useful to us, in order:**

1. **Break something specific.** A finding with a `file:line` beats a paragraph
   of concern. If a step below is out of order, unnecessary, or quietly depends
   on something that does not exist, say which one and what it depends on.
2. **Where you see something we could do better, give us 2 or 3 REAL PATHS,
   not one recommendation.** Name the trade-off on each, say which you would
   take and why, and say what would make you switch. A single recommendation
   is easy to accept without thinking; three make us choose, and the choosing
   is where we find out what we actually believe. We would rather have your
   second-best option written down than not know it existed.
3. **Tell us what we are not asking.** The most expensive mistakes in this
   project so far were not wrong answers. They were questions nobody put on the
   list — Discord's policy, money transmission, a fill rate missing from an
   equation — and in each case the plan looked complete right up until someone
   read it who had not written it.
4. **Say plainly where we are still fooling ourselves.** We would rather hear it
   here than from a brand, a regulator, or Discord.

You do not need to be balanced. If a section is wrong, say it is wrong.

---

## 1. Where we actually are

**The honest one-line summary: the diagnosis is shared, the sequence is agreed,
and until this week nothing had moved in code.**

### Shipped since the report

| Commit | What |
|---|---|
| `3a776c0` | `AUTH_SECRET` fails closed outside a demo runtime — the public fallback in `lib/auth.ts` and `middleware.ts` is gone, and a deploy that pastes the old placeholder is refused too. Self-serve creative uploads insert `pending_review` instead of `approved`, so both portal paths now go through the review queue `app/actions/admin.ts:826` already used. `getCardCampaign`'s `live` flag now checks creative approval, which it claimed to and did not; the portal shows **In review** rather than telling a brand "You're live" while nothing serves. New: `tests/db/integrity.mts`. |
| `a6972d3` | **B74, money integrity.** `lib/db/tx.ts` opens a pooled `neon-serverless` connection — the only place on the platform where a transaction is possible, because `neon-http` cannot open one. The CP ceiling, `buyTrophy` and `requestRedeem` now run inside a transaction behind `SELECT … FOR UPDATE` on the gamer's row. The bare `catch {}` around the award path is gone. New: `tests/db/concurrency.mts` (25 assertions) and `.github/workflows/ci.yml` — **the first gate on this project that is a control and not a sentence.** |

### Round 2 — what the reviewer found in the shipped code

The addendum in `docs/DD_RESPONSE_REVIEW.md` verified B74 as correct (it read the
lock ordering in all three paths, which is the part that is easy to get wrong)
and then found three things. **All three were right. All three are now fixed.**

| Finding | Our check | Fix |
|---|---|---|
| **The concurrency suite could not reproduce the race it defends against.** PGlite is one in-process connection, so `Promise.all` is serialised for free — Gate 2 was green without ever running the production failure mode. | Confirmed. | `lib/db/index.ts` and `lib/db/tx.ts` now select **node-postgres** for any non-Neon `DATABASE_URL`, so the whole app runs against an ordinary Postgres. CI stands one up as a service and runs the suite **twice** — once on PGlite for the logic, once against real pooled connections where the lock is genuinely contended. |
| **The money paths depend on a global `WebSocket` with nothing pinning the runtime.** On Node 20 every money path throws — loudly on a purchase, into the logs only on a CP award, which is a silent platform-wide stop to earning. **A defect our own fix introduced.** | Confirmed: no `engines`, no `.nvmrc`, no runtime in `vercel.json`. | `engines.node >= 22`, `.nvmrc`, **and** a `ws` fallback that sets `neonConfig.webSocketConstructor` — because a pin is a project setting somebody can override. Asserted in `tests/db/integrity.mts`. |
| **Gate 2 reports but does not block** — no branch protection. | Confirmed, and we had already conceded it. | **Still open. It is a repository setting, not a commit.** |

**We proved the first fix rather than asserting it.** With `FOR UPDATE` removed
from `lockGamer` and the suite run against real Postgres:

```
FAIL 100 parallel awards stay within the per-action cap — earned 31
FAIL four simultaneous claims on one trophy produce one — got 3, want 1
FAIL …and one payout row exists — got 3, want 1
```

Three simultaneous claims on one trophy all succeeding is **one trophy paid out
three times, in dollars.** That is the failure mode the reviewer said had never
been run. It runs now, and it fails when the lock is gone.

**One honest limit:** the five-way `buyTrophy` race did *not* fail in that
control run, so the purchase assertion is not yet demonstrated to exercise real
contention. Recorded in the test file rather than counted as proven.

**A finding of our own, from fixing theirs.** Adding node-postgres broke the
production build in the way `tsc` never catches — §0's oldest trap. Next traces
the module graph across the client boundary **even for a dynamic
`await import()`**, so `pg` (and with it `fs`, `net`, `dns`, `tls`) started being
resolved for the *browser* bundle through three separate legitimate chains:
`CpCalculator` → `cp-economics` → `marketplace` → `tx` → `pg`, `VerifyAccount` →
`account-ownership` → `db/index` → `pg`, and `CpCalculator` → `cp-economics` →
`quests` → `tx` → `pg`. Type-checking stayed green throughout; only the build
said anything.

Two fixes, and the order matters. First the real one: `DEFAULT_CP_PER_DOLLAR`
now lives in `lib/cp-rate.ts`, which imports nothing — **a calculator needed one
number and could only reach it through the database layer.** Then the
configuration one: `pg` is aliased out of the client bundle in `next.config.ts`.
Worth writing down that `resolve.fallback` did **not** work and cost a build to
learn — it only fires for a request webpack cannot resolve, and `pg` resolves
perfectly well. `resolve.alias` is what actually replaces it.

**The smell we did not chase:** `lib/cp-economics.ts` still imports
`lib/quests.ts`, so a client calculator still pulls the whole quest engine to
read `ACTION_CATALOG`. The alias makes it harmless; it is still the wrong shape,
and the honest reason we left it is that it is a 15-importer refactor and the
build was red.

**One correction to the addendum, minor:** it says `npm test` excludes
`concurrency.mts` and `integrity.mts`. `tests/run-all.mjs` globs `tests/db/*.mts`,
so both are included — `integrity.mts` appears by name in the run output. A
developer running the suite locally does exercise the gate.

### Corrected, not shipped

`docs/DD_RESPONSE.md` §2.2 claimed "$5 × 56% clears". It does not: $2.80 against
$3.31 of cost is a **loss of $0.51** per 1,000 screens, break-even fill at $5 CPM
is **66.2%**, and at our own 56% assumption the required CPM is **$5.90** — above
our sell price. We reproduced our own accepted error inside the dispute meant to
show we understood it.

### Still true, and still bad

Four of the six Phase-0 defects are live right now: **the fabricated ROAS, the
open beacon, trophy gifting, and the missing age gate.** Each is blocked on a
decision named in §2 rather than on effort.

---

## 2. Open decisions — these block work, and they are not ours alone

| # | Decision | Why it is blocking | The options as we see them |
|---|---|---|---|
| **D1** | **What replaces ROAS on a live brand's report?** | `mediaValue` is not one place: `lib/brand-report.ts:105-120`, plus `components/BrandCampaignReports.tsx:115,288,369` and the CSV at `app/api/brands/report/route.ts:60-67`. The review's catch is that "show delivered impressions instead" is *also* misleading on Discord, because that number is count-on-post. | (a) Blank the boxes with "not yet measured" and keep the panel; (b) remove the panel until B75 defines an impression; (c) show raw delivered *website* impressions, which are real, and say Discord is not yet counted. |
| **D2** | **Is trophy gifting deleted?** | It is the highest-leverage single fix in the whole report — it closes the money-transmission trigger, the 1099 aggregation hole and the under-18 cash-out bypass at once. But it touches 12 files, the `marketplaceOrders.recipientId` column, and **two of the four mission templates** (`lib/missions.ts:88,103` are built on `gift_sent`/`gift_received` at 50 CP each). Deleting it reopens the orbit quest's 125-CP arithmetic. The owner previously said "keep following and messaging and gifting, not now." | (a) Delete gifting entirely and rebuild both mission blocks from `share_card`/`profile_views_25`/`follower_gained`/`profile_vote_received`, which have the room; (b) keep gifting but make gifted trophies **non-redeemable**, which removes the cash-out path without removing the feature; (c) keep it and accept the regulatory finding — we do not recommend this and would want it written down as a decision if taken. |
| **D3** | **What happens to existing accounts with no date of birth?** | Moving the 18+ check to registration (`app/actions/auth.ts:11-53`) is easy. Production already holds accounts that never answered. | (a) Prompt at next login, earning continues meanwhile; (b) prompt at next login, earning paused until answered; (c) backfill only at the existing cash-out gate and accept that COPPA "actual knowledge" argument stays open for the back catalogue. |
| **D4** | **What is an impression?** | Everything in B75–B79 rests on it. Discord's count-on-post is not an IAB viewable impression, and selling it as one is the fabricated-ROAS finding in a new coat. | (a) Count on post, disclose the definition on every report and never call it viewable; (b) count only web placements, where a beacon can measure, and sell Discord as reach rather than impressions; (c) do not sell impressions at all — sell verified entrants (the CPA path), where `benchmarkCpe = $3.50` gives ~70× the headroom of a display view. |
| **D5** | **Do we raise B46's render cap, and what does it cost?** | `DAILY_RENDER_CEILING = 4000` (`lib/cards/budget.ts:22`) was a cost control. Raising it re-opens the render cost nobody has modelled, and B79's "measure real screens per gamer" cannot happen underneath it. | (a) Raise it and model the cost first; (b) raise it only for instrumented cohorts, so the measurement happens without the network-wide bill; (c) leave it and accept that the screens number stays unmeasured. |

**We would particularly like the reviewer's 2–3 paths on D2 and D4.** They are the
two where we suspect our instinct is wrong.

---

## 3. The remaining work, in order

Numbering is permanent — an item keeps its number wherever it sits in the queue.

### Phase 0 — stop the bleeding · **B72**

Live defects with a live customer or a live legal exposure on them. Nothing else
proceeds around these.

| Item | State | Blocked on |
|---|---|---|
| `AUTH_SECRET` fails closed | ✅ shipped `3a776c0` | — |
| Self-serve creative approval gate | ✅ shipped `3a776c0` | — |
| Fabricated ROAS removed | ❌ live | **D1** |
| Ad beacon authenticated | ❌ live | — *(design below)* |
| Trophy gifting deleted | ❌ live | **D2** |
| Age gate at registration | ❌ live | **D3** |

**The beacon is under-scoped as previously filed, and this is the corrected
scope.** Reading `app/api/ads/beacon/route.ts` end to end there are three
self-assert holes, not one:

1. The impression branch awards CP for any `ccId` posted by anyone (`:37`).
2. The `duration` branch updates **any** impression id with no ownership check
   (`:41`).
3. Separately, `profile_views_25` is credited from an unauthenticated public page
   render (`app/u/[slug]/page.tsx:96-102`) — a second mint the beacon fix does
   not touch.

A browser-callable beacon cannot hold a shared secret, so "authenticate it" is
not a design. The design is a **server-issued, single-use nonce minted when the
ad is rendered**, bound to the session and the campaign-creative, redeemed once.

### Phase 1 — the two questions that decide whether the business exists · **B73**

Neither is an engineering task and neither is ours to answer.

- **Does Discord permit this?** Third-party paid creatives inside bot messages;
  cash-convertible points paid for engagement; verification at 100 servers forces
  a human review of exactly this.
- **Is paying cash for engagement regulated?** FinCEN CVC administrator status,
  state money-transmitter licensing, sanctions screening, 1099 thresholds.

**Not started. Nothing here has moved, and it is the whole ballgame.** The
reviewer's fair shot: our own plan said "B74 through B79 do not start before this
answer", and B74 started and shipped. Our defensible reading is that money
integrity is worth doing whatever Discord says — but the first thing we built
crossed our own most important gate, and that is worth naming rather than
explaining away.

**Gate 1.** If Discord says no, the ad business inside Discord ends and the
company is the sponsored-challenge business only. Everything downstream is
worthless if the landlord says no.

> **The review's fair criticism, accepted:** this gate cannot be enforced in
> code, which makes it the most important one to make *evidentiary*. It is not
> satisfied by having asked. It is satisfied when a **dated written opinion is
> committed to this repository** and referenced by name here. Until then its
> state is unobservable, and an unobservable gate is a hope.

### Phase 2 — money integrity · **B74** ✅ *shipped, this change*

Transactions, the ceiling under a row lock, `buyTrophy` and `requestRedeem`
transactional, no bare `catch {}` on a money path, the vacuous assertion
replaced, and CI.

**Gate 2 is now real:** `.github/workflows/ci.yml` runs
`tests/db/concurrency.mts` as its own named step on every push.

> **Still owed to close it properly:** a branch-protection rule requiring that
> check, so the gate blocks a merge rather than merely reporting one. That is a
> repository setting, not a commit, and it is the owner's to apply.
>
> **What the test can and cannot prove**, stated so nobody overclaims it: the
> demo database is PGlite, one in-process instance, so the suite proves the
> *logic* is correct under interleaving. It cannot prove production is safe by
> itself — what makes production safe is that the money paths run on the pooled
> driver, and that is asserted separately from the source in the same file.

### Phase 3 — measurement honesty, then delivery · **B75**

**Order matters and it is the opposite of the order we were building in.**

1. Define what an impression is (**D4**), write it down, count only what meets
   the definition.
2. Delivery counting: target and delivered per campaign, pacing, stop-at-target,
   frequency cap, no silent cutoff (**B65**: `maxCreativesInRotation` drops
   paying brands, and the bot-post surface serves `creatives[0]` only).
3. Billing fields on the campaign (`cpm`, `viewsTarget`) so a floor price is
   enforceable by the system rather than by an email.
4. Cache/ad separation: a cached card must not re-serve one brand or skip a count.
5. Under-delivery gets a remedy in the system — make-good or credit.
6. Reporting per placement, from logged rows only, attributed by card kind.

### Phase 4 — the guarantee, made real · **B76**

`COMMERCIAL_MODEL.md` §2 claims a 15-screen floor. The code does not implement
it. Every item here is a gap between a document and the source.

- **Four priced actions have no emitter**: `stat_levelup`, `play_session`,
  `challenge_progress`, `share_card`. They are in every mission variation and
  nothing fires them.
- **`lib/missions.ts` is imported by nothing but its own test.** A model with no
  caller is a document, not a feature.
- **The passive cap** — the active/passive flag and the 125 CP passive ceiling
  the model claims are not in `lib/quests.ts`. Implement it or delete the claim.
- **The 25-CP rule** — `win_challenge` at 100 and `best_profile_award` at 100
  break the bound the guarantee rests on. Enforce it or restate the guarantee to
  exclude them and show the resulting floor.
- **Log over-cap actions** with "max CP for today reached" — decided, still owed.

### Phase 5 — scale, model, proof · **B77**, **B78**, **B79**

- **B77** — render caps against the ladder (**D5**), and the ceiling becomes a
  configured number an admin can see, not a constant.
- **B78** — the model restated: `revenue = screens × CPM/1000 × fill`, every rung
  declaring registered vs daily-active, cost and revenue on the **same**
  engagement assumption, and a **CURRENT STATE vs TARGET STATE** header on
  `COMMERCIAL_MODEL.md` with every unbuilt mechanism marked **NOT BUILT**.
- **B79** — instrument three numbers (real screens per daily-active gamer, real
  fill against a signed brand, real mission time-on-task), and test the CPA
  product.

**Gate 4 — one signed insertion order** before **B66** (admin sales console),
**B67** (brand portal rebuild) and **B69** (public commercial site).

> **The review's catch, accepted and unresolved: a gate cannot block the past.**
> `app/brands/[slug]`, `app/pricing`, `app/brands`, `app/servers` and
> `app/discord-bot` are already built and live. Gating the *start* of work that
> shipped months ago is meaningless. To make Gate 4 real, the already-live
> commercial surfaces go behind a flag that is off until an IO exists, or they
> come down. **We have not decided this and would like the reviewer's paths.**
>
> **The review also found Gate 4 is circular**, and we do not have an answer:
> B79 measures fill "against a signed brand", and the signed brand *is* Gate 4.
> The measurement meant to justify the first sale can only be taken after it.
> The only escape we can see is selling the first IO explicitly as an unmeasured
> pilot priced on outcomes — which contradicts `COMMERCIAL_MODEL.md` §7.2's
> promise of numbers "computed from the real platform right now".

### Phase 6 — the debt · **B80**

**This section was wrong and is being restated.** B80 previously said "the
remainder of the report's verified findings, none fatal alone" and listed five
items. It was not the remainder, and it silently contained findings the reviewer
rated **fatal**. The full list:

**Abuse and identity — the omission that matters most**

- **Sybil cost per account is $0.00.** No email verification, no captcha, no
  phone, no device check; the IP-velocity guard is dead code. *(rated fatal)*
- **No automated gamer-side abuse detection** — the only detector is
  guild-scoped, needs 50+ members, and does not enforce. *(severe)*

> Why this one is worse than it looks: the **$547,500/yr minted-CP fraud figure
> comes from free account creation × a public mint.** Closing the beacon closes
> the mint. It does nothing about free account creation, and nothing about
> collusion rings farming follows, votes and profile views, which need no beacon
> at all. **The fraud economics survive our own Phase-0 fix**, and our plan did
> not say so.

**Scale — the category that went missing**

- Cold-start DDL replay: 219 raw statements, 108 `ALTER TABLE` (ACCESS
  EXCLUSIVE), 11 full-table `UPDATE`, on every cold boot against production.
  *(fatal)*
- Stat sync saturates at ~30 accounts (60/hr sequential loop, no queue). *(fatal)*
- Per-award query cost: ~12 round-trips × 20 actions × 1M gamers = 240M
  queries/day; `quest_events` and `ad_impressions` unbounded and unpartitioned.
  *(fatal)*
- Brand report loads every impression row into function heap. *(severe)*

> **The tension we have not resolved, stated rather than hidden:** these are
> only deferrable if our honest position is "pre-revenue, scale is years away".
> But then the ladder in `COMMERCIAL_MODEL.md` that runs to 1,000,000 gamers
> cannot also be the reference model B78 restates. **We cannot drop the scale
> findings as premature while keeping the 1M-gamer ladder as the plan of record.**
> One of the two has to give and we would like a view on which.

**Access and privacy**

- `/api/setup` is public when `SETUP_TOKEN` is unset; the first account becomes
  superadmin.
- OAuth open redirect (`next` unvalidated), and account-merge trusts an
  unverified provider email.
- Portal brute-force lockout is per-portal, not per-IP — a denial-of-service on
  every brand and server customer.
- Session JWT last-16-chars stored in an analytics table in plaintext,
  indefinitely.
- Open image proxy (`next.config.ts:34` proxies any HTTPS host).
- The privacy policy promises a 90-day purge the product does not perform.
- Riot **development** key on a live product whose terms prohibit contests.
- Cookie consent is decorative; deletion leaves PII; the IP salt defaults.

---

## 4. Carried over from the old plan, not started

These predate the report and are not blocked by it. They are listed so nothing
is quietly lost, **not** as an argument that they should happen soon — every one
of them sits behind the gates above.

| Item | What |
|---|---|
| **B62** (web half) | Trophy stacking and the no-price-on-your-own-case rule on `components/TrophyCase.tsx`. The card half shipped. |
| **B63** | The nav bands: today's mission and the streak; both bands on the nav's background art; the week band's profiles become their cards. |
| **B59** | A gamer can see and control their own card, on the website. |
| **B56** (remainder) | The card kinds not yet moved onto the new shared layout. |
| **B65** | Ad serving: deliver what was sold. Folded into B75 above. |
| **B66, B67, B69** | Admin sales console, brand portal rebuild, public commercial site — **behind Gate 4**. |
| **B68** | The social purge: posts, comments and reactions leave the product. The quest actions are already retired to weight 0. |
| **B70** | Component screenshots from seeded demo data. |
| `tests/ui/cards.mjs` | Owed since B54 and still owed. |

---

## 5. The gates, and whether each is real

The review's central criticism was that our gates were prose. This table is the
honest state, and we intend to keep it in this form so the answer is always
observable rather than asserted.

| Gate | What it blocks | Enforced by | Real? |
|---|---|---|---|
| **0** | Everything, until the six Phase-0 defects are fixed | `tests/db/integrity.mts` in CI — covers 2 of 6 today, **and the two least severe** | **1/3** — the reviewer's score, and it is the right one |
| **1** | All of B74–B79, until Discord and FinCEN answer | Nothing. Needs a committed, dated written opinion | **No** |
| **2** | Any CP feature, until the ceiling holds under parallel writes | `tests/db/concurrency.mts`, two named CI steps — PGlite **and** a real Postgres service with pooled connections | **Yes on evidence** — the lock is now empirically contended and the suite fails without it. **Still not a blocking check:** branch protection is unapplied. |
| **4** | B66, B67, B69, until one signed IO | Nothing, **and two of the three already shipped** | **No** |

---

## 6. What we are not doing, and why

| Not doing | Why |
|---|---|
| Defending the $5 CPM | We cannot prove it. A signed deal proves it or kills it; nothing else does. And even then it proves one deal — the incentivised-traffic classification the reviewer raised can revoke it later. |
| Building the sales console, brand portal or admin rebuild now | They serve a revenue model that has not cleared Gate 1. Building them first is the mistake the report is about. |
| Pivoting to CPA on paper | It is the strongest constructive idea in the report. A pivot announced without a signed deal is the same error in a new coat. |
| Chasing the 1,234× number | Three disputed inputs compounded — the reviewer conceded this without reservation. We will have real numbers within a month of instrumenting. |

---

## 7. The questions we would most like answered

Ranked by how much the answer would change what we do next.

1. **D2 and D4** — gifting, and what an impression is. Two or three paths each.
2. **Is the beacon design right?** Server-issued single-use nonce bound to
   session and campaign-creative. What breaks it?
3. **Gate 4 is circular and we cannot see past it.** How does a platform with no
   measured delivery sell its first insertion order honestly?
4. **Scale vs the ladder.** Which gives: the 1M-gamer model, or the deferral of
   the fatal scale findings?
5. **What is missing from this document?** The pattern in this project is that
   the expensive things were never on the list.

---

*Everything here is checkable. If a claim in this file is not true in the code,
that is the most valuable thing you can tell us, and it has happened before.*
