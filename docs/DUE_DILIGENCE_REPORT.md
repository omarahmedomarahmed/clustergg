# ClusterGG — Adversarial Due-Diligence Report

**Prepared for:** the investor considering a position in ClusterGG
**Prepared by:** independent technical & financial due-diligence lead
**Date:** 6 August 2026
**Scope:** the codebase at branch `claude/clustergg-due-diligence-hoz04u`, the live platform at `https://clustergg.com`, `docs/COMMERCIAL_MODEL.md`, `docs/EXECUTION_PLAN.md`, and primary legal/market sources cited in the appendix.
**Method:** every technical claim was read in the source and is cited `file:line`. Market, legal and regulatory claims are sourced to primary documents (Discord/Riot/Chess.com terms, FinCEN, FTC, MRC/IAB, ANA) listed in the appendix. Where a claim could not be sourced, it is marked as such.

---

## 1. Verdict

**Recommendation: DO NOT INVEST on the terms or the thesis presented. Pass, or re-engage only against a different company built on the CPA pivot described in §7, at seed terms, after the compliance remediation in §7 is complete and paid for.**

The one-line reason: **the product the document sells does not exist, and the product that exists cannot make money at any scale.**

Three findings, each independently sufficient to stop a wire:

1. **The revenue model is arithmetically negative at the company's own numbers, before any outside opinion is applied.** Their break-even equation omits fill rate. Put fill back in at their own stated 56% assumption and the business loses money on every gamer at every scale (§4). At a defensible market CPM it loses 20–27× revenue. There is no gamer count and no brand count that fixes it, because the break-even condition — CPM × fill ≥ $3.31 — contains neither term (§4, Appendix Table 7).

2. **Every dollar of the primary revenue line is sourced from an activity Discord prohibits in writing, on a platform that now sells the same product itself.** Discord's Developer Policy bans targeting users with third-party advertising and bans paying for engagement; ClusterGG's bot does both, in shipped code. Verification is forced at 100 servers, which is the moment a human at Discord reads the app. Enforcement is termination with no notice and mandatory deletion of all Discord-derived data (§6). There is no diversification away from Discord in the product.

3. **The commercial machine the investor is being shown is largely unbuilt, and the document describes its own backlog in the present tense.** The 500-CP daily ceiling's "15-screen guarantee" — the mechanism the entire model rests on — is not implemented; there is no passive/active flag anywhere in the code and no 125-CP passive cap (§3.1). The daily-mission engine is dead code, imported by nothing but its own test (§3.2). None of the seven ad-delivery requirements the document itself calls "the biggest gap" exist (§3.3). The `$500 = 100,000 views` product cannot even be represented in the database — there is no CPM field and no views-target field on a campaign (§3.3).

**What is actually live**, read from production on 6 Aug 2026: **15 Discord servers, 748 total members, 5 gamers with a verified game account, 1 real paying brand** (HERU). The company's own investor data room asks for **$100,000 at a $500,000 post-money valuation** (`lib/dataroom/defaults.ts:317-323`) — this is a pre-seed experiment, not the multi-million-dollar scaled business the model document projects, and it should be evaluated as one.

The team is not incompetent — several things are built correctly and honestly (§6 credits them, and the amendments log in `EXECUTION_PLAN.md` is an unusually candid engineering record). The problem is not execution quality. The problem is that the model is wrong in a way execution cannot fix, and the parts that would have caught it — a delivery counter, a fill-rate metric, an accrual ledger — are the parts that were never built.

---

## 2. Fatal risks (ranked)

Each of these can end the company on its own.

| # | Risk | Type | Where it lives |
|---|---|---|---|
| F1 | **Revenue is negative at their own assumptions and 20–27× underwater at a real CPM.** Break-even requires CPM × fill ≥ $3.31; the best defensible product is $2.00 × 40% = $0.80. | Broken (arithmetic) | §4, Appendix Tables 6–7 |
| F2 | **Discord prohibits the core activity and can terminate without notice.** ~95% probability already in breach; enforcement forced at the 100-server verification gate. | Risk (platform) | §6.1 |
| F3 | **The sold product is unbuilt and unrepresentable.** No CPM field, no views target, no delivery counter, no pacing, no frequency cap; the 15-screen guarantee, the passive cap and the daily mission do not exist in code. | Broken | §3.1–3.3 |
| F4 | **Impression counts are unauthenticated and forgeable; the brand ROAS report is fabricated from server headcount.** The measurement cannot survive any advertiser audit; billing against it is FTC §5 / commercial-fraud exposure. | Broken | §3.4, §5.3 |
| F5 | **The whole money ledger is non-transactional on a driver that cannot open a transaction.** Every ceiling, cap, purchase and redemption is a read-then-write race; CP is mintable through a public endpoint. | Broken | §3.5 |
| F6 | **Paying cash for engagement is very likely a regulated money-transmission activity, and trophy gifting is the trigger.** Nationwide MTL costs more per year than the entire redemption liability at 100k gamers. | Risk (legal) | §5.1 |
| F7 | **No age gate at signup + paying children to click ads = COPPA/GDPR-K/Children's-Code exposure**, with documented FTC gaming precedent ($10m–$275m) and a Feb 2026 ICO fine of a comparable for exactly this. | Risk (legal) | §5.2 |

---

## 3. Technical findings

Every claim below was read in the source. Legend: **[BROKEN]** = verified defect in code; **[UNPROVEN]** = an assumption the code does not support; **[RISK]** = outside their control.

### 3.0 The framing finding: the document is not the product

**[BROKEN]** `docs/COMMERCIAL_MODEL.md` describes a `$500 = 100,000 views` ad business at a $5 CPM, funded by a 500-CP daily mission that guarantees 15 ad-screens per gamer. **The live pricing engine sells a different business**: sponsored Discord *challenges* at $250 each ($175 prize) and tiered packages of $600–$6,400/month (`lib/pricing.ts:86-106`, confirmed live on `clustergg.com/pricing`). The two models do not share a price, a unit, or a measurement. The document the investor is told to evaluate (per the diligence brief) is therefore an aspirational rewrite whose load-bearing parts were never shipped, laid over a smaller challenge-sponsorship product that has one real customer. `COMMERCIAL_MODEL.md:8-9` states the backlog in the declarative present tense ("This document treats them as one machine"); `EXECUTION_PLAN.md` lists the identical items as work still owed.

### 3.1 The 15-screen guarantee is broken three ways (the brief's §5 challenge)

The brief asked me to try to break the guarantee that earning 500 CP forces ≥15 ad-screens. It is broken on all three of its own stated parts:

- **[BROKEN] Part 2 (the 125-CP passive cap) does not exist.** `COMMERCIAL_MODEL.md:104,131` claims "at most 125 CP a day may come from passive actions, enforced in `awardQuestAction`" and "Every action in `ACTION_CATALOG` carries this flag." Neither is true. `awardQuestAction` (`lib/quests.ts:479-534`) enforces only per-action caps and the global 500 ceiling. There is **no active/passive flag anywhere** in `ACTION_CATALOG` (`lib/quests.ts:46-136`) and the string "passive" appears in no logic in `lib/quests.ts`, `lib/missions.ts`, or `lib/cp-economics.ts`.
- **[BROKEN] Part 1 ("no action pays more than 25 CP") is false in the shipped catalogue.** `win_challenge` pays 100, `top3_challenge` and `best_profile_award` pay 50 and 100 (`lib/quests.ts:76,77,100`). A single cron write in `lib/sync.ts:204` awards `win_challenge` + `top3_challenge` = 150 CP (30% of the day) at once.
- **[BROKEN] The maximum passive CP is 400, not 125.** Summing the document's own "passive" actions at shipped weights × caps: `follower_gained` 50 + `profile_vote_received` 50 + `profile_views_25` 75 + `gift_received` 50 + `stat_levelup` 100 + `play_session` 75 = **400 CP** reachable with zero screens opened by the earner. That leaves 100 CP = **4 active actions** to reach 500. At 4 ad-screens/day the break-even CPM is $12.50 — which the document itself (§2) calls "not a thin business, it is *no* business."

**Consequence:** delivered ad-screens per gamer is a free variable between roughly 0 and 28, not a floor of 15. The revenue model's central premise fails.

### 3.2 The daily mission — the guarantee's delivery vehicle — is dead code

**[BROKEN]** `lib/missions.ts` (the four mission templates, the validator, the streak engine) is imported by **nothing except its own test** (`tests/db/missions.mts:34`). No page, server action, admin editor or schema column consumes it (verified by repo-wide grep). The feature the model document builds its guarantee on top of is not wired into the product.

Worse, the missions reference actions that never fire: **`stat_levelup`, `play_session`, `challenge_progress` and `share_card` have no emitter anywhere** (`lib/quests.ts:72,90,103` define them; no `awardQuestAction` call site emits them). All four are load-bearing in the templates, so the flagship "Show up" mission is at most ~45% completable, and the house creative's own promise — "Link a game account and **get paid to play**" (`lib/cards/ads.ts:177`) — awards **zero CP**, because playing your game (`stat_levelup`/`play_session`) emits nothing.

### 3.3 Ad delivery — the revenue promise — cannot be delivered or billed

The brief asked me to trace the path that counts and delivers a brand's 100,000 views. **There is no such path.**

- **[BROKEN] No delivery counting, target, pacing, frequency cap, or stop-at-target** exists in the schema or serving path. `adCampaigns` has `budget`, dates, `targetGeo`, `targetDevice`, `status` — and **no CPM field and no views-target field** (`lib/db/schema.ts:504-519`). `serveAds` (`lib/ads.ts:33-104`) sorts by priority and slices; it never counts what was delivered. Every "$500 for 100,000 views" sold today is contractually unbacked, and the `$4 CPM` floor the document says "the admin must refuse to save below" cannot be enforced because there is no price field to check.
- **[BROKEN] `maxCreativesInRotation` silently drops paying brands** (`lib/ads.ts:73-76`), and the Discord *bot-post* surface serves `creatives[0]` only (`lib/discord/ads.ts:50-52`) — the single highest-priority brand takes 100% of that inventory and every other paying brand gets zero.
- **[BROKEN] No frequency or billable-impression cap.** One gamer pressing one bot button repeatedly generates unlimited billable impressions for the same brand (`lib/cards/ads.ts:101-124`); a web browser tab logs a fresh impression on every 5-second rotation tick (`components/AdSlot.tsx:48-58`) — one idle tab can consume ~8.6% of a brand's $500 package per day.
- **[BROKEN] None of the seven §5.3 requirements are built** (delivery counting, seed-on-gamer, frequency cap, no-silent-cutoff, cache/ad separation, billable cap, category exclusivity). The document's own admission — "We cannot currently deliver a promised number of views to anybody" (`COMMERCIAL_MODEL.md:232`) — remains true.
- **[BROKEN] No invoicing, refund, credit or make-good tied to delivery.** The money path for placements does not exist (`lib/prepay.ts`, `lib/invoices.ts`), so an under-delivered brand has no contractual remedy in the system and an over-delivered brand is a free giveaway of inventory.
- **[BROKEN] Self-serve creative upload auto-approves and self-launches** a 90-day live campaign onto cards posted into third-party servers with no admin review and no payment (`app/actions/brand-portal.ts:137-145`) — contradicting §7.2's stated approval gate.

### 3.4 Impression counts would not survive an advertiser audit

- **[BROKEN] The impression beacon is unauthenticated, unsigned, unthrottled and un-origin-checked** (`app/api/ads/beacon/route.ts:12-59`). Anyone can `curl` unlimited `ad_impressions`/`ad_clicks` rows for any campaign. **I confirmed this live:** the public `GET /api/ads/serve?placement=discord_card` returns real campaign-creative IDs (HERU's included), and a `POST /api/ads/beacon` with an arbitrary `id` returned HTTP 200. A competitor can drive any brand's impressions and CTR arbitrarily in either direction; the `duration` ("view time") field is 100% attacker-controlled up to a forged 1 hour (`app/api/ads/beacon/route.ts:41-44`).
- **[BROKEN] The Discord "impression" is a server-side count-on-post, one row per server**, written before the message is delivered, whether the server has 3 members or 336 (`lib/discord/ads.ts:80-82`, `lib/cards/ads.ts:200-216`). This is the exact method the IAB/MRC standard rules out. The Discord surface stores no viewer identity at all — no `userId`, no session, no IP — so "unique gamers reached" and frequency capping are permanently impossible for the platform's primary inventory.
- **[BROKEN] The brand's ROAS report is fabricated from headcount.** "Media value" and ROAS are computed as `(server_members / 1000) × $8 CPM` (`lib/brand-report.ts:105-115`, `benchmarkCpm: 8` at `lib/pricing.ts:102`), where `server_members` is the full Discord membership at announce time — **not a single logged impression** — and is labelled to the brand as "Counted delivery" (`lib/challenge-delivery.ts:92-94`). Every ROAS the platform has ever shown a brand is computed from a headcount the brand never reached, at a CPM 60% above the price the brand paid, which guarantees ROAS > 1 by construction — the precise failure the code comment at `lib/brand-report.ts:100-104` says it is avoiding.
- **[BROKEN] No dedup, no viewability, no bot/IVT filtering.** `ad_impressions` has no unique constraint (`lib/db/schema.ts:542`); an impression fires even if the creative image never loads (`components/AdSlot.tsx:64-76`); there is no MRC/IAB path and none is architecturally possible inside a Discord PNG.

**Consequence:** the first brand to put IAS/DoubleVerify on its creative, or simply to read its own Google Analytics, sees a 100% discrepancy and a ~12% CTR that cannot occur naturally. The outcome is a clawback and a terminated IO, not a lower price.

### 3.5 The CP ledger and cash-out path are non-transactional and mintable

**Root cause (verified):** production runs on `drizzle-orm/neon-http` with the stateless `neon()` HTTP client (`lib/db/index.ts:911-913`). This driver **cannot open an interactive transaction.** The codebase contains **zero transactions and zero row locks** (repo-wide grep). Every money mutation is therefore a read-then-write race by construction:

- **[BROKEN] The 500-CP daily ceiling is advisory, not enforced.** `awardQuestAction` reads `cpEarnedToday` then writes (`lib/quests.ts:490-521`). N concurrent requests each read "already = 480", each compute room = 20, each pay. The beacon endpoint is a perfect public concurrency source. `cpEarnedToday` returns 0 on any error (`lib/quests.ts:451`), so a failed read opens the full ceiling.
- **[BROKEN] `buyTrophy` double-spends.** Balance is read, then two inserts fire with no transaction (`lib/marketplace.ts:222-247`); N concurrent purchases mint N trophies from one balance, and the resulting overdraft is hidden by `Math.max(0, …)` (`lib/marketplace.ts:140`). `requestRedeem` has the same race — one trophy can be locked into unlimited simultaneous redemption requests, each carrying full cash value (`app/actions/trophies.ts:139-154`).
- **[BROKEN] CP is mintable for things that did not happen.** The beacon awards `ad_impression` (1 CP ×25) and `ad_click` (25 CP ×3) on a self-asserted POST (`app/api/ads/beacon/route.ts:36,56`) — 100 CP/day per account with `curl` and zero page loads. `profile_views_25` is credited from an unauthenticated page render (`app/u/[slug]/page.tsx:96-102`).
- **[BROKEN] Errors are swallowed.** `awardQuestAction` wraps everything in a bare `catch {}` (`lib/quests.ts:482,533`); a dropped connection or constraint violation is indistinguishable from success.
- **[GENUINE MITIGANT] A unique dedup index does exist** on `(userId, questId, actionKey, refType, refId)` (`lib/db/schema.ts:864`, `lib/db/index.ts:102`), so exact replays with the same ref are idempotent. This is real and correctly done — but it does not bound the ceiling/cap races (different refs), and where callers pass distinct per-request IDs (the beacon) it does nothing.

**Cash-out path (brief §4):** trace is CP → `buyTrophy` → `userTrophies(status:held)` → `requestRedeem`(status:pending) → admin approves → gamer "confirms received." **There is no payout provider, no KYC, no identity verification, no sanctions screening in the code.** The only gate is a self-declared date of birth and country typed into the same form that requests the money (`app/actions/trophies.ts:85-106`). Redemption is a manual four-button admin queue with no funding pre-check (`app/admin/redeems/page.tsx`) — under a rush it will approve payouts it cannot fund and email the user a written promise that does not arrive. One staff account is an unaudited mint-to-cash pipeline: create a trophy of any value, buy it, approve it, send it, with no second approver and no audit row (`app/actions/admin.ts`, `app/actions/trophies.ts:217-236`).

### 3.6 Abuse surface

- **[BROKEN] Sybil cost per account is $0.00.** Signup collects only email/password/display-name (`app/actions/auth.ts:11-53`) — no email verification, no phone, no captcha, no device fingerprint; the IP-velocity check is never passed an IP. Revenue per fake account is $0.05/day, but the fake account's *value* to an operator is farming any brand's metrics and minting CP.
- **[BROKEN] The abuse model flatters reality.** `SELF_SERVE_SECONDS` (`lib/cp-economics.ts:153-164`) prices only 7 of 22 live actions and still lists retired zero-CP actions; it omits ~775 CP/day of the actually-farmable surface. `DEFAULT_ASSUMPTIONS.capReach = 0.30` (`lib/cp-economics.ts:51`) contradicts the mission's own 100% design target and understates `expectedDailyCost` by ~3.3×.
- **[BROKEN] There is no automated gamer-side abuse detection.** The only detector is guild-scoped, needs 50+ linked members to look, and is explicitly not enforcement (`lib/abuse.ts:220-243`).

### 3.7 Scale — what breaks first

Named component, in order of arrival:

1. **[BROKEN] Card rendering — breaks at ~200–270 daily gamers.** Hard caps of 4,000 renders/day and 3,000 stored cards globally (`lib/cards/budget.ts:23-27`). The ad inventory the whole model depends on stops at the first rung of the ladder.
2. **[BROKEN] Stat sync — saturates at ~30 linked accounts.** A sequential loop capped at 60 accounts/hour in one cron function with no queue (`app/api/cron/sync/route.ts`). Combined with the Riot **development key** (see §6.2) that expires every 24 hours, verified stats are structurally unreliable today.
3. **[BROKEN] Cold-start DDL replay.** Every serverless cold start replays 219 raw DDL statements including 108 `ALTER TABLE`s (ACCESS EXCLUSIVE locks) and 11 full-table `UPDATE`s against the live DB, with "already exists" errors swallowed (`lib/db/index.ts:26,85-102`). There is no real migration history (`drizzle/0000_*.sql` contains none of the money tables).
4. **[BROKEN] Per-award query cost.** One `awardQuestAction` is ~12 sequential HTTPS round-trips to Neon (`lib/quests.ts:479-531`); at the plan's own 1M-gamer × 20-action target that is 240M queries/day. `quest_events`/`ad_impressions` grow ~7bn/5bn rows a year with no partitioning, rollup or retention.
5. **[RISK] Discord's 50 req/s application-wide limit** caps total bot deliveries at ~130M messages/month against a claimed 450M views/month at the top rung — the Discord supply curve goes flat around the 100k-gamer rung while CP cost keeps scaling.

### 3.8 Data integrity, privacy, security

- **[BROKEN] Hardcoded JWT fallback secret.** `AUTH_SECRET` falls back to the literal string `"cluster-demo-secret-set-AUTH_SECRET-in-production"` (`lib/auth.ts:7-8`, `middleware.ts:21-23`). If the env var is ever unset in production, anyone can mint a superadmin session and decrypt every stored provider token.
- **[BROKEN] The privacy policy promises ad-impression rows are "purged after 90 days" (`app/legal/privacy/page.tsx:27`). No purge job exists** anywhere in the repo (verified — `lib/jobs.ts` has no such job). That is an FTC §5 deceptive-practice exposure independent of COPPA.
- **[BROKEN] Cookie consent is decorative.** The banner records a choice and nothing reads it; "Essential only" still fires IP-hash + geo + user-id tracking on the next render (`components/CookieConsent.tsx`, `components/AdSlot.tsx:58-77`).
- **[BROKEN] Account deletion leaves PII behind** — Discord snowflake, geo history, email and payout preference survive in multiple tables (`app/actions/connections.ts:254`).
- **[BROKEN] IP "anonymisation" uses a default salt** `"cluster-salt"` if the env var is unset (`lib/ads.ts:6-8`); a SHA-256 of an IPv4 with a known salt is trivially reversible.
- **[BROKEN] No age gate at signup** (`app/actions/auth.ts`); DOB is collected only at first cash-out and never verified. See §5.2 for the legal consequence.
- **[MINOR] `/api/setup` is public when `SETUP_TOKEN` is unset**, and the first account on a fresh DB becomes superadmin (`app/api/setup/route.ts:19-22`). `next.config.ts:34` configures the Next image optimiser to proxy any HTTPS host (open image proxy).
- **[GENUINE MITIGANT] Admin server actions self-guard** with `requireStaff`/`requireAdmin` (`app/actions/admin.ts:47-176`, `app/actions/quests-admin.ts`), and middleware pre-filters the admin surface (`middleware.ts`). Passwords use scrypt (`lib/password.ts:4-8`) — not the bcrypt `SECURITY.md:9` claims, but a legitimate KDF. The ad-redirect endpoint guards against open redirects (`app/api/ads/go/route.ts`). The redemption eligibility gate fails closed (`lib/eligibility.ts:118-123`).

### 3.9 Test coverage — what is dangerous and untested

- **[BROKEN] No concurrency test exists** in the 32-file suite, and it could not test the thing that matters: the demo suite runs on an in-memory PGlite shim (`DEMO_DB=1`), and production runs on `neon-http` which cannot open the transaction that would make the money paths safe. A passing test does not prove the production ledger is correct.
- **[BROKEN] The one test guarding real money is vacuous.** `tests/db/marketplace.mts:148` asserts "the balance never went negative" against a value (`Math.max(0, …)`) that is mathematically incapable of being negative.
- **[BROKEN] No CI.** No workflow, no type-check gate, no lint gate, no coverage (`package.json`, no `.github/workflows`). The suites run only when a human types `npm test`.
- **Untested and dangerous:** the entire ad-delivery/billing path, impression authenticity, the ceiling/cap races, `buyTrophy`/`requestRedeem` double-spend, and the payout/redemption state machine.

---

## 4. Financial findings — my own model, rebuilt from scratch

I did not check their arithmetic; I rebuilt it and then compared. The single methodological fix is this: **their model prices COST at low engagement (`lib/cp-economics.ts:51` ships 35% daily-active × 30% cap-reach = 10.5% of maximum) and REVENUE at 100% engagement (15 screens × every registered gamer). CP and screens are produced by the same actions, so they must move together.** Applied consistently, engagement determines *scale*, not *margin*; margin is set by three numbers — CP minted per screen, delivered CPM, and fill rate — which I derive independently below. Full workings and ten tables are in the Appendix.

### 4.1 Where I agree with them — the cost side

My four-cohort engagement distribution (grinders, mission-followers, casuals, browsers) lands at **33.06 CP per brand-carrying screen = $3.31 CPM of CP cost** (Appendix Table 1). Their own implied figure is 500 CP ÷ 15 screens = $3.33. **I am within 1% of their cost design point. The cost side is roughly right.** Everything that follows fails on the revenue side, from a cost number we agree on.

### 4.2 Where I differ — the revenue side

| Variable | Their number | My number | Why |
|---|---|---|---|
| Delivered CPM | $5.00 ($4 floor) | **$0.80** (range $0.25–$2.00) | Built up from ANA Q2-2025 open-market CPM $4.41 × 0.71 supply-chain leakage × 0.61 gaming-vertical index × 0.50 long-tail (no ads.txt — confirmed absent) × 0.50 incentivised-SIVT filtration = $0.48 web; $1.00 courtesy for the untaggable Discord PNG. **Three independent routes — my build-up, the market comparables, and the repo's own test at `tests/db/cp-economics.mts:68` (`FLOOR_CPM = 0.50`) — converge on ~$0.50. The engineering team does not believe the pitch's $5.** |
| Fill rate | 56% assumed | **15%** (range 5–40%) | 100% of fill must be hand-sold: Google AdSense/AdMob is closed by written policy (paid-to-click is a named account-closure violation), the Discord half cannot be trafficked by any ad server, there is no ads.txt, no delivery counting, and no signed advertiser. |
| Ad-screens per *registered* gamer/day | 15 | **0.51** | Their ladder charges 15 screens/day to every registered account forever while their own cost model applies 10.5%. This single inconsistency is worth 29.6× — more than the CPM and fill errors combined. |
| Gross margin | 50% (really 33%) | **−2,655%** | Their "50%" is a markup on break-even volume; on revenue it is 33% at their inputs, and inverts once fill is applied. |

**The identity that kills it:** gross break-even requires `CPM × fill ≥ $3.31`. Neither gamer count nor brand count appears. At their own A5 fill (56%) the required CPM is **$5.90** — above their $5 sell price and 48% above their $4 floor. My best defensible product ($2.00 × 40%) is $0.80 against $3.31 required — a **4.1× shortfall at the most generous end, 27.5× at base**. No amount of scale or sales effort moves it (Appendix Table 7).

### 4.3 The scaling ladder, corrected

| Registered gamers | Their claimed inventory value/mo | My ad revenue/mo | Gap |
|---|---|---|---|
| 1,000 | $2,250 | ~$2 | 1,234× |
| 10,000 | $22,500 | ~$18 | 1,234× |
| 100,000 | $225,000 | ~$182 | 1,234× |
| 1,000,000 | $2,250,000 | ~$1,823 | 1,234× |

The 1,234× gap decomposes exactly as CPM 6.25× × screens-per-registered-gamer 29.62× × fill 6.67× (Appendix, Model Step 6). It reconciles to the cent.

### 4.4 The costs their model omits entirely

Their P&L contains one cost line (CP). Mine adds eight, and the net result is a loss at **every** rung (Appendix Table 4): user acquisition (absent from their model — ~$324k/yr at 100k gamers to sustain the base, vs $2,188 of revenue = **148×**), engineering, support, infrastructure (server-side PNG compositing is the driver), sales headcount (which exceeds gross margin at every rung), a 25% advertiser clawback provision, a server-owner revenue share that **has no implementation in the repo at all**, and fraud: the open beacon accrues **~$547,500/yr of minted CP liability at 1M gamers assuming only 3% of accounts are farmed** — 91% of the entire legitimate CP liability.

### 4.5 The CP liability is mis-accounted

**[BROKEN]** "CP is a liability only when redeemed" is not defensible under ASC 606 / IFRS 15. ASC 606-10-55-48 forbids any breakage credit without 2–5 years of redemption history, which the company cannot have — a $5 trophy is **50,000 CP = 100 consecutive perfect days** (`lib/marketplace.ts:55,102`). So 100% of face value must be carried. At 100k gamers this moves reported gross margin from the "+45%" their cash policy would show to the real **−2,655%** at my inputs (Appendix Table 8). There is no outstanding-CP metric, no reserve, no escrow, and no float anywhere in the product; `lib/stuck-money.ts` even *forfeits* a departed user's cash-valued trophy after 90 days, which no US dormancy regime recognises and no term of service authorises.

### 4.6 Sensitivity and breakeven

- **Most damaging single variable (realistic ranges): delivered CPM**, because it is the only lever with no defence — it is set by a buyer applying a policy screen (Google IVT, MRC SIVT, shared MFA blocklists) the company cannot argue with. On a narrow ±20% band the CP exchange rate ranks first (Appendix Table 5); note that in that table **raising the daily-active rate makes the loss worse** — growth is value-destroying at these inputs.
- **Breakeven under the CPM model: never, at any number of gamers or brands.** It is an identity, not a forecast.
- **The only breakeven that exists is the CPA pivot** (§7): the repo already prices a challenge entrant at $3.50 (`lib/pricing.ts:102`) = 35,000 CP = 70 days of a gamer's full ceiling — 70× the headroom of a display CPM. That business closes at ~24–48 brands on mid-market UA budgets, needs a ~$4.0M raise, and reaches ~$2.4M cumulative burn over 30 months **without** reaching breakeven in the plan window (Appendix Tables 9–10).

---

## 5. Legal, regulatory and platform findings

### 5.1 Paying cash for engagement is very likely regulated (their A8, marked "unassessed")

- **[RISK — SEVERE] Money transmission.** Cluster Points are convertible virtual currency and ClusterGG is their "administrator" under FinCEN FIN-2013-G001 / FIN-2019-G001. Because trophies can be **gifted** between gamers and a gifted trophy is redeemable for cash (`lib/marketplace.ts:207-217,244-275`), the platform allows "transfers of value between persons" — the exact money-transmitter trigger. Operating unlicensed is 18 U.S.C. §1960 (personal, criminal — up to 5 years). The "closed-loop" and "prepaid access" exemptions are foreclosed by the text.
- **[RISK — FATAL to the CPM model's economics] Licensing costs more than the liability.** Nationwide MTL is $250k–$1M year-one and $225k–$280k/yr to maintain — larger than the entire worldwide redemption liability at the 10,000- and 100,000-gamer rungs. ClusterGG cannot afford to *be* a money transmitter at any scale it will reach in four years, so the only viable strategy is not to be one — which makes **deleting trophy gifting** (≈60 lines) existential, not tidy.
- **[FAVOURABLE] The gambling half of A8 is actually fine.** There is no chance element and no way to buy CP, so the model fails the prize/chance/consideration test on the chance limb everywhere I checked. This should be said plainly. It is one product decision (a loot box, a wheel, a paid CP top-up) away from landing inside California AB 831 / New York S5935A, so it warrants a board-level covenant, not a fix.
- **[FAVOURABLE] US 1099 reporting on gamer earnings is a non-issue** — the 500-CP ceiling caps a gamer at ~$18.25/yr, below the $2,000 threshold. (Server-owner revenue share is unbounded and correctly routed to Trolley per `docs/PAYMENTS.md`.) **But trophy gifting punches through this too**: a pooled payee is unbounded, and gifting also defeats the 18+ redemption gate (an under-18 earns and receives; a 19-year-old cashes out). Gifting is the single load-bearing defect in the legal position.
- **[RISK] No sanctions screening exists in the codebase**; the blocked-country list is a hand-maintained placeholder (`lib/eligibility.ts:40-43`). OFAC is strict-liability at $377,700/violation. The mitigant (routing payouts through Trolley) is a dependency, not a control.
- **Gulf (a named target market) is the *worst* market**, not the best: UAE cash-prize promotions generally require a per-promotion government permit — structurally incompatible with continuous daily missions.

### 5.2 Minors (their A7-adjacent risk, and the brief's §21)

- **[RISK — FATAL] The code acquires COPPA "actual knowledge" and does nothing.** There is no age gate at signup (`app/actions/auth.ts`); a child earns, holds trophies and clicks ads for months, and only at first cash-out is a DOB collected — and stored — which converts the best legal posture (no actual knowledge) into the worst (documented actual knowledge, continuing collection). Civil penalty is **$53,088 per violation** (FTC, 2025). At 100k users the plausible under-13 cohort is 2,000–5,000 and under-18 is 10,000–15,000; statutory COPPA ceiling $106M–$265M, realistic settlement band $10M–$30M — but the **injunction** (age assurance, delete all child data, stop incentivising minors) is what ends the business, because deleting under-13 accounts destroys CP balances and the linked-account graph.
- **[RISK — SEVERE] No age assurance = the Reddit/Imgur exposure.** In Feb 2026 the ICO fined Reddit £14.47M and Imgur was penalised for self-declaration alone; ClusterGG is worse-positioned (no age check **and** pays cash for engagement **and** has no DPIA). The privacy policy has no children's-privacy section at all — an independent COPPA notice violation provable from a screenshot.
- **[FTC gaming precedent is direct]:** Epic $275M (2022), Microsoft/Xbox $20M (2023), Cognosphere/Genshin $20M under-16 parental-consent (2025), Disney $10M for *enabling third-party* collection (2025). A platform that pays children to click brand creatives is not a hard case.
- **Correction to the brief:** the brief's premise that there is "no age gate anywhere" is not quite right — an 18+ **redemption** gate exists, is centralised and fails closed (`lib/eligibility.ts`). Credit is due. The defect is that it fires only at cash-out and is self-declared; the well-built check needs to move to registration.

### 5.3 Advertising standards and platform (their A7)

- **[RISK — FATAL] Discord prohibits the core activity.** The Developer Policy bans targeting users with advertising and bans content unrelated to the app's function; ClusterGG's bot renders paid third-party creatives into server messages. Paying cash-convertible points for ad clicks, impressions, bot-list votes and installs is squarely inside Discord's ban on manipulated engagement — and ClusterGG pays for all four in shipped code. **~95% probability already in breach.** Verification is forced at 100 servers (Stripe identity check of the owner), which is when a human reads the app; enforcement is termination with no notice (2025 precedent: an app with ~30M users terminated overnight) plus mandatory deletion of all Discord-derived data. **Discord now sells this product itself** (Quests + Orbs, 90M DAU) and deliberately made its currency non-cash — so ClusterGG competes with its landlord using the one choice the landlord rejected.
- **[RISK — FATAL] Riot's API Terms prohibit operating contests/promotions**, which is the challenge product — and the code runs a live commercial product on a Riot **development key** that expires every 24 hours (`lib/providers/riot-verify.ts:8,102,128`). A production key requires an audit that would surface the cash-out challenges. Three zero-cost Riot compliance items (disclaimer, registration, feature audit) are also unmet — the tell that the terms were never read.
- **[BROKEN — commercial] The ~12% incentivised CTR is a fraud signature.** MRC classifies incentivised activity as SIVT that accredited vendors must filter; ~96% of programmatic budget is screened this way, and the shared Jounce/DeepSee blocklists travel between buyers. Classification as MFA/incentivised is effectively permanent and removes the "programmatic fill" fallback the top rung depends on. The document itself (§5.1) says this "gets us discounted to nothing by buyers and delisted by networks" — and ships the opposite.
- **Correction to the brief:** the FTC Endorsement Guides / 2024 Reviews Rule are a weaker fit than the brief assumes. The real advertising-side exposure is plain **FTC §5 deception against advertisers** (billing for unverifiable, incentivised, partly-forged "views") and straightforward **commercial fraud** to the brands, who do not need the FTC to sue.

---

## 6. What they got right — and what I tried to break it with

The most valuable sentences in a DD report are the ones where the reviewer tried to break something and could not. Here they are.

1. **The unit exchange-rate derivation is sound.** I tried to show 10,000 CP = $1 was arbitrary; the comment at `lib/marketplace.ts:29-55` derives it honestly and the repricing test (`tests/db/cp-economics.mts:68`) caught `ad_impression` paying out the entire ad revenue at 5 CP and cut it to 1. The team can do this arithmetic when it looks. My finding is that the same discipline was never applied one level up (to the accrual, the reserve, the fill multiplier).
2. **The dedup unique index is correct.** I tried to find a double-award on replay; `qe_dedup_idx` on `(userId, questId, actionKey, refType, refId)` (`lib/db/schema.ts:864`) genuinely makes exact retries idempotent. It does not stop the *concurrency* races (different refs), but the idempotency itself holds.
3. **Admin authorization is defense-in-depth and real.** I tried to find an unguarded admin mutation by sampling `app/actions/admin.ts`, `quests-admin.ts`, `trophies.ts`; they self-guard with `requireStaff`/`requireAdmin`, and `middleware.ts` pre-filters rendering. The middleware comment even documents a past leak (`curl` of an admin URL returning real rows) and the fix.
4. **The 18+ cash-out gate exists and fails closed.** I tried to find a payout path that skipped it; `requestRedeem` calls `eligibilityFor` first, ahead of any write, and the DB-error path returns `ok:false` (`lib/eligibility.ts:118-123`). Good instinct, wrong placement (redemption, not registration).
5. **The gambling analysis clears.** I tried to construct a prize/chance/consideration case; there is no chance mechanic and no way to buy CP, so it fails on the chance limb in every jurisdiction checked. This is genuinely favourable and should be preserved with a board covenant.
6. **The ad server does no behavioural profiling.** Contextual-only serving keeps ClusterGG out of the worst COPPA/targeted-ad category — the single best thing standing between it and a Disney-style charge. Worth documenting as a deliberate commitment.
7. **The engineering record is candid.** The `EXECUTION_PLAN.md` amendments log openly records that three of four gift actions had no emitter (B15), that a cached install URL would have frozen an attribution token, and other self-caught defects. This is an unusually honest artifact and a positive signal about the team — even though it is also, read adversarially, a list of things that shipped broken.
8. **Passwords use scrypt, not plaintext** (`lib/password.ts`), and the ad-redirect endpoint blocks open redirects (`app/api/ads/go/route.ts`). Small, correct, real.

None of these, individually or together, offsets the fatal findings. But they are the difference between "a team that cannot build" (false) and "a team that built the wrong thing carefully" (true).

---

## 7. Conditions for investment

I would not invest in the business as pitched at any price, because the CPM model is arithmetically closed against it (§4.2). I *would* re-engage on the following, and only on all of them:

**A. Restated model.** Rewrite `COMMERCIAL_MODEL.md §1.3` as `revenue = screens × CPM/1000 × fill`, with all three terms named, every rung of the ladder restated with the denominator (registered vs daily-active) declared and the engagement multiplier applied to **both** cost and revenue. Then abandon the CPM model.

**B. Pivot to CPA, and prove one deal.** Price on verified entrants/completions (`benchmarkCpe = $3.50` already exists), treat impressions as a free value-add, and produce **one signed advertiser** paying for measured actions. Everything today is unsigned; A2 ($5 CPM) is not merely untested, it is competed against by Discord. No term sheet before one real IO exists.

**C. Compliance remediation, funded and completed before any further payout (~$250k):** delete trophy gifting (kills the money-transmission trigger, the 1099 aggregation hole and the age-gate bypass in one commit); move age assurance to registration; commission a DPIA (the main fine-mitigation lever in both ICO decisions); write a Terms of Service that actually mentions Cluster Points; ship the data-retention job the privacy policy already promises; obtain a FinCEN/state CVC status opinion and sanctions screening; and get a Riot production key with an approved registration.

**D. Instrument the three numbers the revenue line is denominated in and that are un-instrumented today:** actual ad-screens rendered per gamer per day, actual fill against a real signed brand, and actual time-on-task for the daily mission. Until these exist, the company has not measured the one quantity — views delivered — its entire revenue depends on.

**E. Engineering hardening as a gate, not a nicety:** move the money paths onto `neon-serverless`/`Pool` so a transaction is even possible; authenticate and rate-limit the beacon; add a billable-impression cap and a delivery counter; rotate `AUTH_SECRET` off the hardcoded fallback; add CI with a type-check and the test suite.

**F. Terms.** If any capital goes in, it funds a **CPA pivot test**, not the ladder in the deck — a ~$4.0M seed for a different company (competing with Freecash/Prodege, not gaming media), diligenced as one, with the founders' own dataroom ask of $100k/$500k-post treated as evidence that they, too, understand this is pre-seed.

**Recommendation, stated plainly: pass on the company as presented. Re-open only against condition B (a signed CPA deal) plus C (funded remediation), at seed terms, as a new investment thesis — not as validation of the model document, which is an arithmetic error an investor should not fund.**

---

## 8. Appendix — workings

### 8.1 Live platform ground truth (read from production, 6 Aug 2026)

- 15 Discord servers, **748 total members**, **5 gamers with a verified game account**, 6 games, **1 real paying brand** (HERU) — from `clustergg.com/servers`, `/` and the public `/api/ads/serve` endpoint.
- The public pricing page sells challenges at $250 ($175 prize) and packages $600–$6,400/mo — a *different* model from `COMMERCIAL_MODEL.md`.
- The investor dataroom ask: **$100,000, priced equity, $400k pre / $500k post, 20%, 6-month runway** (`lib/dataroom/defaults.ts:317-323`).
- The public "749 gamers reachable" figure is `SUM(server memberCount)` across all bot servers (`lib/network.ts`), i.e. total Discord headcount, not an audience the platform can actually address.

### 8.2 Independent unit-economics model

**Table 1 — Engagement distribution (one distribution applied to BOTH cost and revenue). Screens exclude ad-clicks (a 302 off-platform redirect, `app/api/ads/go/route.ts`).**

| Cohort (of daily-active gamers) | Share | CP/active-day | Screens/active-day | CP/screen |
|---|---|---|---|---|
| Grinder (passive + ad-click path the code allows) | 8% | 500 | 4 | 125.0 |
| Mission-follower (~half a shipped mission) | 22% | 250 | 5 | 50.0 |
| Casual | 40% | 100 | 4 | 25.0 |
| Browser | 30% | 15 | 4 | 3.8 |
| **Weighted average** | 100% | **139.5** | **4.22** | **33.06** |

CP cost per 1,000 screens = 33.06 / 10,000 × 1,000 = **$3.31** (their implied design point: 500/15 = $3.33 — agreement within 1%).

**Table 2 — Delivered-CPM build-up (web surface).**

| Step | × | Running CPM | Source |
|---|---|---|---|
| Open-market CPM (buy side) | — | $4.41 | ANA Q2-2025 Programmatic Transparency Benchmark |
| Share reaching the seller | 0.71 | $3.13 | ANA Dec-2023 supply-chain study ($710/$1,000) |
| Gaming vertical index | 0.61 | $1.91 | Playwire 2026 (gaming RPS index 61 vs tech 100) |
| Long-tail (no ads.txt — confirmed absent, no brand safety) | 0.50 | $0.95 | remnant reported < $1 |
| Incentivised-SIVT filtration | 0.50 | **$0.48** | MRC IVT Addendum (June 2020) |
| Discord surface (courtesy flat-sponsorship equiv) | — | $1.00 | no programmatic value; untaggable PNG |
| **Blend (59.5% Discord / 40.5% web)** | — | **$0.79 → $0.80** | mix from their own §7.3 report |

**Table 3 — Break-even: required CPM as a function of fill rate (CP cost = $3.31/1,000 screens).**

| Fill | Required CPM | vs my $0.80 base | Available in market? |
|---|---|---|---|
| 100% | $3.31 | 4.1× | No (zero house creative, ever) |
| 56% (their A5) | $5.90 | 7.4× | No (above their list price) |
| 40% (my optimistic) | $8.26 | 10.3× | No |
| 15% (my base) | $22.04 | 27.5× | No (approaches Discord's own 100%-viewable video rate) |

Neither gamer count nor brand count appears in this table. Scale does not fix it.

**Table 4 — Gross profit per 1,000 brand-carrying screens, by CPM × fill (only two positive cells in the whole grid; the company's own $5 × 56% lands at −$0.51).**

| CPM \ fill | 100% | 56% | 40% | 25% | 15% | 5% |
|---|---|---|---|---|---|---|
| $5.00 | **+1.69** | −0.51 | −1.31 | −2.06 | −2.56 | −3.06 |
| $4.00 | **+0.69** | −1.07 | −1.71 | −2.31 | −2.71 | −3.11 |
| $2.00 | −1.31 | −2.19 | −2.51 | −2.81 | −3.01 | −3.21 |
| $0.80 (base) | −2.51 | −2.86 | −2.99 | −3.11 | −3.19 | −3.27 |
| $0.50 (repo test floor) | −2.81 | −3.03 | −3.11 | −3.18 | −3.23 | −3.28 |

**Table 5 — Full annual P&L, my base case (negatives are costs). Loss at every rung.**

| Line | 1,000 | 10,000 | 100,000 | 1,000,000 |
|---|---|---|---|---|
| Ad revenue | 22 | 219 | 2,188 | 21,876 |
| (their claimed revenue) | 27,000 | 270,000 | 2,700,000 | 27,000,000 |
| CP liability accrued (ASC 606) | (603) | (6,026) | (60,264) | (602,640) |
| Fraud (open beacon, 3% farmed) | (548) | (5,475) | (54,750) | (547,500) |
| User acquisition | (3,240) | (32,400) | (324,000) | (3,240,000) |
| Infrastructure | (3,000) | (7,200) | (42,000) | (360,000) |
| Engineering | (330,000) | (440,000) | (1,200,000) | (3,250,000) |
| Sales headcount | 0 | (52,000) | (210,000) | (1,020,000) |
| Support | (4,500) | (18,000) | (180,000) | (1,800,000) |
| Compliance & legal | (80,000) | (150,000) | (400,000) | (1,200,000) |
| Other (clawback, payouts, server share) | (13) | (95) | (916) | (9,141) |
| **Net** | **(421,881)** | **(710,978)** | **(2,469,743)** | **(12,007,405)** |

**Table 6 — CP liability treatment at 100k gamers/month (my inputs).**

| Treatment | Revenue | CP cost charged | Reported margin | Authority |
|---|---|---|---|---|
| Their policy (cash only, ~2% redeemed) | $182 | $100 | +45% | Not audit-acceptable |
| **Accrual, ASC 606-10-55-48, no redemption history** | $182 | $5,022 | **−2,655%** | Correct for years 1–3 |

### 8.3 The CPA pivot (the only version that closes)

Entrant priced at $3.50 (`lib/pricing.ts:102`) = 35,000 CP = 70 days of full ceiling — 70× the headroom of a display CPM. Full breakeven at 100k registered needs ~4.79 paid entrants per active gamer per month (~24 brands at $100k/yr, or 48 at $50k, or 97 at $25k). A 30-month plan reaches ~$2.38M cumulative burn and **2.0** entrants/active-gamer/month — still short of the 4.79 needed; implied raise **~$4.0M** including the $250k remediation. This is a fundable *test of a different business*, not the ladder in the deck.

### 8.4 Sourcing notes and limits

- All `file:line` citations were read directly in the branch `claude/clustergg-due-diligence-hoz04u`.
- Primary legal/market sources (fetched, dated, and quoted where possible): Discord Developer Policy / Developer ToS / Monetization Policy / Ads Policy (support-dev.discord.com, discord.com/terms, discord.com/ads/quests, last updated Aug–Oct 2025); Riot API Terms; FinCEN FIN-2013-G001 & FIN-2019-G001; 31 CFR 1010.100; FTC COPPA FAQ, 2025 penalty notice ($53,088), and the Epic/Microsoft/Cognosphere/Disney settlements; MRC Impression, Viewable-Impression and IVT/SIVT guidelines; ANA Programmatic Transparency studies (2023, Q2-2025); Playwire 2026 publisher revenue; US DOL minimum wage; Prolific payment principles; Hornuf & Vrankar (2022) and Hara et al. (2018) on crowdwork wages; ASC 606-10-55-46..49 via RevenueHub/PwC/Deloitte; the Feb-2026 ICO Reddit fine and Imgur action.
- **Could not source (flagged honestly):** any published rate card for a brand image embedded in a Discord bot message (no such market is publicly priced); a published percentage discount for non-MRC/non-viewable inventory (the category is normally *excluded*, not repriced); primary Saudi legal text; GPT-platform cohort retention (no primary data published). Where a number rests on inference rather than a citation, it is labelled in the model above.
- One methodological caveat: an automated adversarial verification pass was run over the technical findings, but its verdicts did not map cleanly back to the findings, so the ~110 machine-generated items were **not** relied on as "refuted/confirmed." Every finding asserted in this report was re-verified by hand against the cited source before inclusion; machine-only items that I did not personally verify are excluded.
