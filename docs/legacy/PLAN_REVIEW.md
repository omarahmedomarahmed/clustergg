# Review of `docs/PLAN.md` — Round 3

<!-- LEGACY-BANNER -->
> # ⚠ HISTORICAL — NOT THE PRODUCT
>
> **Nothing in this file describes ClusterGG as it is today.** It is kept
> because the reasoning is still useful and because a decision with no record
> gets made again.
>
> **Do not quote a sentence from this folder as a statement of fact about the
> product.** Two errors have already been caused by exactly that: a claim that
> brands are billed on impressions (they are billed a fixed price per
> challenge) and a claim that gifting is part of the product (it was deleted in
> B72.3, for money-transmission reasons).
>
> **The current truth, in this order:** the code, then `docs/PLAN.md`, then
> `docs/MODEL.md` and `docs/HANDOVER.md`. Where this file and the code
> disagree, the code is right and this file is history.

**Prepared for:** the investor / the team
**By:** the same independent reviewer (DD report + two rounds of `DD_RESPONSE_REVIEW.md`)
**Date:** 7 August 2026 · **Reviewing:** `docs/PLAN.md` at `4b15933`, plus the code shipped since round 2 (`12c4730`, `d0c3e2f`, `4773493`) on `claude/clustergg-platform-build-mfkzaa`.
**Brief taken literally:** *read the plan, judge the plan.* I am not re-scoring the live product; I am attacking the design, the sequencing, and the claims this document makes about its own code. Where it invites a search rather than an opinion (E, I), I ran the search.

**One-line result:** the best plan of the three rounds, and the round-2 fixes are real and correct — but the plan contains one false status claim, one Phase-0 item that walks straight back into a bug it schedules a later item to fix, an age line that is wrong for the EU, a measurement redesign that fixes Discord and leaves the web surface inflating, and — the expensive thing not on the list — an entire counting apparatus built for the CPM model it concedes "does not close" while the CPA product that could close is one line. Verdict is unchanged and the reason is unchanged: intentions are not remediation, and nothing fatal has closed.

---

## First, what is verifiably true (credit, because it was earned)

- **All three round-2 findings are fixed correctly.** CI now stands up a real `postgres:16` service and routes `getDb`/`withTx` through node-postgres for a non-Neon `DATABASE_URL`, so the concurrency suite runs **twice** — PGlite for logic, real pooled connections for the lock (`.github/workflows/ci.yml`, the "real Postgres, real lock" step). The runtime is pinned three ways: `engines: ">=22.0.0"`, `.nvmrc` = 22, and a `ws` fallback that sets `neonConfig.webSocketConstructor` (`lib/db/tx.ts:80-81`). CI is **green on every round-3 commit** including `12c4730` and `4b15933` (verified via the Actions API). My round-2 finding #1 — "the test can't reproduce the race" — is genuinely closed: the lock is now contended against real Postgres.
- **The honesty is real, not performative.** `tests/db/concurrency.mts:45-46` records that the five-way `buyTrophy` race "did NOT fail in that control run … not yet demonstrated that the purchase assertion exercises real contention." They disclosed the one place their own proof is weak. That is the opposite of theatre, and it means precisely: the *ceiling* and *redemption* races are proven closed against real Postgres; the *buyTrophy double-spend* is correct-by-construction but **not yet proven under contention**. State it that way in §1 rather than "the lock is proven" unqualified.
- **The §1.1 layout fix is correct.** `LAYOUT_VERSION = 2` and `Number(o.v) !== LAYOUT_VERSION → fresh()` (`lib/cards/layout.ts:559`) — discard-not-merge, no production write. Right fix.
- **B85.2 self-diagnosis is accurate.** `lib/cards/data.ts` selects `planetBgUrl` at :177/:203/:441/… and **never** `planetImageUrl`, though that column exists (`schema.ts:579`). The globe is stored and never fetched. Correct, and a good catch on themselves.

### The one false claim in the plan (they invited this)

**§1 "Merged to `main` and live" lists `12c4730` and `4773493`. Neither is on `main`.** `main` is `468f71e`, which contains only `3a776c0` and `a6972d3` (verified: `git merge-base --is-ancestor`). The real-Postgres CI and the layout fix are branch-only — green in branch CI, **not live**. So Gate 2's "evidence yes" exists on the branch, not in production, and §1's live table overstates two rows. Small, but it is exactly the class of self-description that has been wrong every round.

---

## A. The measurement design — attacked hardest (§2 D1, B81, B82)

Dropping the 5%-of-members estimate is the right move: a modelled number labelled "delivery" was the fabricated ROAS, and `count(*)` over honest rows cannot lie the same way. But it does not fully fix measurement, for four reasons.

**A1 — "one view" for a public nobody looked at: you swapped a defensible overstatement for a crude undercount, and both mislabel the unit.** A public post seen by 5,000 counted-as-1 is *safer* than 5%×members, and understating is the right side to err on — grant that. But calling a bot **render** a "view" still implies a human saw it, which for a public post is unproven and for a private (ephemeral) card is *also* unproven (ephemeral messages can go unread). The honest unit is **"cards delivered"** or **"creatives rendered,"** not "views." Rename it in `AD_VIEW.md` and B82's headline. "8,412 ad views delivered" reads as 8,412 humans; "8,412 cards delivered" is what the rows actually support. This is not pedantry — it is the exact gap (implying a human behind a machine count) that made the old ROAS a false statement.

**A2 — the redesign fixes Discord and leaves the website inflating.** B81/B82 are Discord-centric ("one card the bot drew = one view"); the website is "as today / largely exists" (§2 D1, B82). But the web surface over-counts by construction: `components/AdSlot.tsx:48-52` advances the creative every `rotationIntervalSeconds`, and the impression effect re-fires on each `idx` change (`AdSlot.tsx:58-73`, `impressionId` reset in cleanup) — **one logged impression per rotation tick.** One idle open tab logs a fresh "view" every few seconds (my round-1 finding, still live at `AdSlot.tsx`). So `count(*)` is honest arithmetic over **dishonest web rows**, and B81.3's "one card logs exactly one row" is asserted of the Discord path only. Fix: on the web, one impression per (session, creative, campaign) per viewability event, not per rotation tick — and put that in `tests/db/ad-views.mts`, which currently only tests the Discord card.

**A3 — break the count (gamer / server owner / bug / cache), with `file:line`:**
- **Server owner or gamer re-invoking a card command inflates it.** Every bot card render logs an impression (`lib/cards/ads.ts:200-216`), and there is **no per-gamer/per-command billable cap** — B75's frequency cap is scheduled *after* B81/B82 (§3 order). So B82 ships a brand report whose Discord counts are inflatable by anyone who can make the bot draw a card, until B75 lands. **A brand report you can pad ships before the control that stops padding.**
- **The cache/retry cuts the other way (under-counts, safe side).** `logCardAdImpression` is fire-and-forget and swallows errors (`lib/cards/ads.ts:200-216`), so under load it drops rows. B81.3 promises "a cached card re-served neither double-counts nor skips" — good intent, but note the current bias is *skip*, which is safe for the brand and bad for the brand's confidence.
- **The web beacon is still the open mint** (`app/api/ads/beacon/route.ts`) until B72.2's nonce lands, so until then the count is not just inflatable, it is forgeable with `curl`. B72.2 is Phase 0, ahead of B82 — good — but B82's honesty depends on B72.2 shipping first, which the plan should state as a hard dependency.

**A4 — audience composition, k = 25 (B82).** Two problems. **(a) At today's scale it never renders** — the network has ~5 verified gamers; a cohort floor of 25 means composition is blank on every report until the platform is ~5× its current linked base. That is honest (blank beats fabricated) but it means the headline feature of the new brand report is vaporware at signing time; do not demo it as if it exists. **(b) k = 25 on a single dimension is a reasonable floor for one report, but it does not defend the intersection attack.** A brand running campaigns across several overlapping small servers, or the same server over time, can *difference* aggregates to shrink effective k — classic k-anonymity failure under composition. Cohort floor 25 is necessary, not sufficient. Add: suppress when one server contributes >50% of a cohort, and threshold the *intersection* of any two reports the same buyer can see, not just each in isolation. Whether 25 is "right" also depends on the re-identification model you are defending; for a game-preference vector on a gaming platform the sensitivity is low, so 25 is defensible for v1 — but write down that it defends single-report, not cross-report, re-identification, so nobody over-trusts it.

**A5 — does B78 survive the smaller inventory?** It survives as *honesty* and fails as a *business*, which is the correct outcome and they half-say it. One card = one view, no multiplier, makes the inventory strictly smaller than my round-1 model already assumed (I counted screens, not audience-weighted posts). Restating B78 on it makes the smallness undeniable — good. But it does not rescue the model: at one-card-one-view, the break-even identity `CPM × fill ≥ $3.31` is *harder*, because the view count per gamer is now the raw action count with no post-amplification credit. So B78, restated honestly, **visibly does not close** — which is the honest answer, and which is exactly why leading with CPM view-counting (see I) is the strategic error.

---

## B. The age design (§2 D3, B72.4, B83)

**Does self-declared banding close COPPA?** It closes the *worst* version (collecting DOB, manufacturing "actual knowledge," then continuing) and adopts the right shape: under-13 read-only, no earning before a band is set, no backfill. But a self-declared band's legal sufficiency turns on **one determination the plan does not name**: is ClusterGG *"directed to children"* under the FTC's multi-factor test? If it is a **general-audience** service, a neutral self-declared age screen + no actual knowledge is the standard, defensible approach. If it is **"directed to children"** — and "Discord-native gaming product that pays cash," with the demographics that implies, pushes toward yes — then self-declaration is *insufficient* and verifiable parental consent is required for under-13s regardless of a read-only mode. The plan asks the lawyer "whether it is sufficient"; the sharper question to put is **"are we 'directed to children,' or a general-audience service with a child audience?"** — because only the second makes self-declaration work.

**Is 13 the right line for UK/EU/Gulf?** For the **US** (COPPA) and the **UK** (age of digital consent under UK GDPR is 13): yes. For the **EU**: **no, not as a flat line.** GDPR-K sets the digital-consent age at **16 by default**, lowered per member state to 13–15 (France 15, Netherlands/Germany 16, Ireland 16…). A single "13" band processes the EU 13–15 cohort without valid consent. For the **Gulf**: a different regime entirely (not GDPR; UAE/KSA data-protection + the cash-prize permit problem from the DD report). So "13 for everyone" is US/UK-correct and EU-wrong.

**2–3 paths (as requested):**
1. **Global floor at 16.** Simplest and safest: one line, kills the EU 13–15 problem and most COPPA exposure at once. Cost: you lose the 13–15 earning cohort, which on a young gaming platform may be a large slice of engagement. *I would take this for v1* — the legal surface it removes is worth more than the cohort at this stage, and you can lower it later per-country once you have counsel and geo logic. Switch if the lawyer says the child audience is small enough that "general audience + 13" holds.
2. **Country-conditional consent age** (a geo → consent-age map; 13 US/UK, 16/15 EU per state, block or parental-consent below). Correct and future-proof; more work, and it needs reliable geo (you have `geoCountry` on impressions but not necessarily at signup). Take this once you are actually selling in the EU.
3. **13 global + geo-block EU under-16 from *earning*** (not from browsing). Middle path: keeps the US/UK teen cohort, fences the EU problem. Weakest legally of the three because it still processes EU minors' data for the read-only experience, but cheap.

**One code note for B72.4:** it says "`birthDate` stops being collected, and B80's purge deletes what is stored." B80 is late and unbuilt, so stored `birthDate` values persist until then — the collection stops immediately but the *erasure* waits for an unbuilt item. Sequence the `birthDate` deletion into B72.4 itself, not B80, or you are holding children's DOBs during the exact window you are telling a regulator you stopped.

---

## C. The locked balance (B83.2) — where the loophole is

**The lock is a friction gate, not a value gate, and it does not bound the thing it looks like it bounds.** It releases on two free, trivial steps (link an account + customize a profile / set a flag — B83.1). A sybil farmer does those two steps once per account and the balance is unlocked; the 5,000-CP cap ($0.50) barely delays a real gamer. So the locked balance does **nothing** for the fraud economics the plan itself says survive Phase 0 (§B80) — it delays a farm by two clicks. Do not let it read as an anti-abuse control; it is an onboarding-completion nudge.

**The real hazard is a computed invariant, and this codebase has drifted on exactly this before.** "Locked CP" is a *portion* of a summed balance — there is no wallet row (that was B74's whole point). Computing "how much of this gamer's balance is locked vs unlocked, capped at 5,000, with pre-band earnings grandfathered" is multi-source arithmetic over `quest_events` with a date boundary and a per-gamer cap. That is the same shape as the round-1 finding where **two definitions of "total CP" disagreed by the multiplier the ledger split was meant to remove.** Unless "locked balance" is a *single* sourced definition (one SQL expression, like `CP_PAID_SQL`), used by the wallet, the buy path, the redeem path and the nav badge alike, it will drift — and a locked/unlocked split that drifts either lets locked CP be spent (loophole) or locks CP that was earned (the thing they say is the worst thing they could do to early users). And the check must run **inside** the B74 transaction and lock, or "is this CP locked?" is a fresh read-then-act race on the same balance B74 just fixed.

**The disclosure problem you have not named:** an unspendable, accruing, cash-labelled balance shown to a **13–17-year-old** who cannot redeem until 18 is a *multi-year deferred cash promise to a minor*. It is not a balance-sheet liability while locked (can't redeem = no obligation), so escheat/accrual do not bite yet — but "you have earned $X, you may have it in three years" shown to a child is a consumer-protection and advertising-to-minors optic, and it is the 100-day-trophy "near-theoretical cash" problem with a minor overlay. Name it in the plan and get the same lawyer who signed the bands to sign the *balance display copy* for the 13–17 band.

---

## D. Gifting deletion (§2 D2, B72.3)

**It closes two-and-a-half of three, not three.** The under-18 cash-out bypass: closed (no transfer). The 1099 aggregation hole: closed (no pooling into one payee). The FinCEN money-transmission **trigger**: the *clearest* trigger — value moving between two persons through your books — is closed. **But a money-transmission argument is still live**, because trophies still redeem for cash at all: your own round-1 legal research concluded that deleting gifting leaves a **"defensible"** position (redeeming your own liability to your own user is arguably not transmission), **not a closed one** — CVC-administrator/redemption exposure survives. So the precise statement is: *deleting gifting removes the strongest trigger and converts money-transmission from "clearly triggered" to "defensible, pending the B73 opinion."* The plan's "closes the FinCEN money-transmission trigger" is right about the trigger and overstates it as closing the exposure. The FinCEN opinion (B73), not the gifting deletion, is what actually closes it — say that.

**The mission rebuild is arithmetically possible but walks into a bug you scheduled B76 to fix.** B72.3 lists the orbit rebuild options, and the **first** is `share_card 25×3`. **`share_card` has zero emitters** (verified: no `awardQuestAction(…, "share_card")` anywhere in `app/` or `lib/`) — it is one of the four no-emitter actions B76 exists to fix (§B76). So rebuilding a Phase-0 mission on `share_card` recreates *the exact "missions built on actions that don't fire" defect* B76 addresses much later. And the escape is its own problem: the only orbit actions **with** emitters are `follower_gained`, `profile_views_25`, `profile_vote_received` — and all three are **passive** under `COMMERCIAL_MODEL.md` §2.1's own classification. So the rebuilt orbit block is either **uncompletable** (uses `share_card`) or **100% passive** (uses the emitter-having trio), and a 100%-passive block earns 125 CP with **zero screens**, which erodes the 15-screen guarantee B76 is supposed to *restore*. B72.3 and B76 are in direct tension and the plan does not note it. **Fix:** wire the `share_card` emitter *inside* B72.3 (it is small), so the rebuild can use an active action and B76's guarantee survives — or restate the guarantee's active/passive math for the gift-free orbit block explicitly.

---

## E. The stale-state failure — where else it lives (a search, as asked)

The layout bug's shape is: **stored state, field-by-field, spread over new defaults, with no version guard.** I searched for that shape. The pattern that is *structurally immune* is pricing/finance (`lib/pricing.ts:165`, `lib/finance.ts:114`): they iterate `Object.keys(DEFAULTS)` and read stored values *by key*, so a new default key **cannot** be clobbered by stale storage. Don't "fix" those. The vulnerable shape is a spread of stored-over-default. Hits:

- **`lib/theme.ts:172` — the direct hit, and it carries the same tell.** `resolveTheme` does `const merged = { ...DEFAULT_THEME, ...tmpl, ...t }` where `t` is the stored profile theme, then `sections: { ...DEFAULT_THEME.sections, ...(t.sections ?? {}) }` at :179. **No version field.** Every scalar (`coverHeight`, `coverOverlay`, `avatarSize`, `avatarShape`, colours) is `...t`-last, so a stored value overrides any redesigned default — *exactly the layout bug*, in the profile/card theme system that renders every gamer's profile and bot card. And it carries the identical near-miss tell: it special-cases `order` (appends newly-added sections, :175-176) and `sections` — someone **noticed the staleness for two fields and stopped**, the same way `layout.ts` noticed it for `bar` and stopped. When the profile theme is redesigned, saved themes silently override it, per-gamer, with no signal. This is the answer to your search: **the same unversioned merge-old-over-new is live in `lib/theme.ts:170-183` today.**
- **`lib/quests.ts:322,680` — the partial one.** Stored per-quest `actionWeights`/`dailyCaps` override the catalog; `repriceQuests` migrates a value only when it still equals the *pre-B34 default*, so a **new** catalog action or a **changed** default is **not** picked up by a quest that already has stored weights (your round-1 "repricing the catalog doesn't change stored quests"). Guarded by known-old-value, not by version — so a *second* reprice, or any admin who happened to set the old number, silently keeps stale economics. `missionsConfig`/`gameUi`/`mapGlbCfg` are read as-is if present (`:698,704`), unversioned.

**The generalisation to adopt** (this is the part worth more than the two hits): the fix is not "version every stored object." It is a rule — **when stored config overlays code defaults, either (a) iterate the defaults and pull stored values by key (pricing pattern, immune to new fields) or (b) version the blob and discard on mismatch (layout pattern). Never spread `{...DEFAULTS, ...stored}` for anything whose default shape can change** (theme pattern, the bug). Put that rule where `resolveTheme` and `parseLayout` both live so the next redesign cannot reintroduce it a third time.

---

## F. Sequencing

Define-before-count-before-restate (B81 → B75 → B78) is correct, and putting the honest view definition ahead of everything that prices or paces delivery is the single best structural decision in the document. But three things still rest on unbuilt or ungated pieces:

1. **B81/B82 sit ahead of Gate 1.** Gate 1 blocks "B75–B79" (§4 table) — **not B81/B82.** But B81/B82 exist *specifically to count the Discord bot-card ad product*, which Gate 1 decides whether Discord even permits. This is the identical "built downstream of an unresolved gate" pattern you flagged and accepted on B74 — repeated. Either move B81/B82's Discord-specific half behind Gate 1, or state explicitly that B81/B82 are worth building for the **website** ad product regardless of the Discord answer (which is true for the web half and false for the "Discord by server/card-kind" half that is most of B82).
2. **B82's counts are gameable until B75.** B82 ships a brand report; B75's frequency/billable cap lands later; between them the report is inflatable by anyone who can make the bot draw a card (A3). Ship B75's cap **before or with** B82, not after.
3. **B72.3 depends on B76** (the `share_card` emitter — D). Cross-phase.

**Is splitting the age work (B72.4 plain / B83 good) right, or shipping neither well?** Splitting is right *in principle* — the legal minimum (band + read-only + no-earn) is genuinely separable from the nice onboarding — **but only if B72.4 is legally sufficient on its own**, and B (the "directed to children" question, the EU-16 line) says it may not be. So the risk is not "ship neither well," it is "ship the *plain* one, call the legal hole closed, and discover the plain one was insufficient" — which is why B's determination must land **before** B72.4 is treated as closing Gate 0's age item, not after.

---

## G. The gate table (§4) — honest or generous?

**Honest, with one status overstatement.** Gate 0 at 1/3 (2 of 6, and the two least severe) — accurate. Gate 1 "No" — accurate. Gate 4 "No, and two of the three already shipped" — accurate and unflinching. **Gate 2 "Evidence yes, blocking no" is now *earned*** — the real-Postgres CI closes my round-2 doubt, so I would not argue it down. The one correction: the evidence lives **on the branch, green in branch CI — not on `main`** (the §1 error), so "Gate 2 evidence exists" is a true statement about the branch and not yet about the deployed product. And "blocking: no" remains right until branch protection is applied — which, per your note, the owner is doing now, so I score it against "not yet applied." Net: the table is the least generous self-scoring of the three rounds, which is the correct direction of travel.

---

## H. The two you cannot answer (B79) — paths, not sympathy

**Gate 4 gates the past.** Three paths:
1. **Feature-flag the live commercial surfaces off** (`app/brands/[slug]`, `/pricing`, `/brands`) behind a `commercialLive` flag that is false until a signed IO flips it. Cleanest, fully reversible, and it makes Gate 4 a real control (a config value, checkable) instead of a sentence. *I would take this.*
2. **Take them down to a "contact us" stub.** Strongest signal that you are not selling a model that hasn't cleared Gate 1; costs SEO and the demo surface.
3. **Re-scope Gate 4 to gate only *new* commercial build** (B66 sales console) and accept the existing surfaces are live. Honest relabel, weakest — it concedes the gate never applied to what already shipped.

**Gate 4 is circular** (fill is measured against a signed brand; the signed brand *is* the gate). Three paths:
1. **Sell the first IO as a fixed-fee sponsorship, no delivery promise** — which is how small community/Discord sponsorships actually transact anyway (flat $/placement, not CPM). No fill needed; the circle never forms. Then use that live campaign to *measure* fill for the *second* deal.
2. **Sell the first deal as a CPA pilot on entrants** (`benchmarkCpe = $3.50`, B79) — measured, no fill required, and it is the round-1 recommendation. Breaks the circle and tests the only model that closes.
3. **Run the first brand as a free "design partner"** whose campaign *is* the fill-measurement cohort, converting to paid once the numbers exist. Costs one free campaign; buys the number Gate 4 needs.
*I would take 1 + 3 together:* a fixed-fee first deal to book revenue with no measurement promise, and a free measurement-partner campaign to generate the fill number, converting to the real model once B79 has data. Both dissolve the circularity by refusing to *promise a measured delivery you cannot yet measure* — which is the same discipline as killing the fabricated ROAS.

---

## I. What is missing — the expensive thing not on the list

**The plan builds an elaborate counting apparatus (B81, B82, B75, B78) for a CPM view-model it says in the same breath "visibly does not close" — and the CPA product that round 1 showed is the *only* thing that closes is one line in B79.** Read §2 D1's own words ("makes our sellable inventory *much* smaller … understating is the safe side") next to §5 ("we cannot prove the $5 CPM"). If the honest view count makes the CPM inventory tiny and the CPM is unprovable and the identity doesn't close — **why is the whole measurement build about counting views, with CPA as an afterthought behind Gate 4?** The missing item is a **decision to lead with CPA** — price on verified entrants, instrument entrants first, sell the first IO on entrants (H) — and treat view-counting as the secondary, honesty-only artifact it deserves to be. If the answer is "we still believe in the view model," that belief needs to be written down and defended against your own restated B78, because right now the plan is pouring the most engineering into the model it has the least evidence for. **This is the pattern you named: the expensive thing — building the wrong revenue instrument well — is not on the list as a question.**

Three more, smaller, genuinely missing:
- **Sybil / anti-fraud has no build item.** It is in B80 as *debt*, rated fatal, and you concede the $547k/yr mint survives Phase 0 — yet nothing schedules a fix (email/phone/device signal, velocity, collusion detection). A fatal finding acknowledged and unscheduled is the round-1 pattern repeating.
- **The scale findings have no build item and no decision.** Cold-start DDL replay, per-award query fan-out, stat-sync cap — all in B80, all fatal, and the "scale vs the 1M-gamer ladder" tension is *posed* (§B80) and not *resolved*. Resolve it: either the ladder comes down to a realistic near-term number, or the scale items get build items. You cannot keep both.
- **The "if Discord says no" business has no honest-measurement plan.** Gate 1 = no collapses you to "sponsored-challenge business only" — but that business's *own* reporting (reach = server membership) was a DD finding too, and there is no B-item for what the challenge-only company's honest delivery report looks like. The fallback inherits an unfixed measurement problem.

---

## J. Verdict — conditions as facts, true or false today

**DO NOT INVEST — unchanged, and for the unchanged reason: nothing fatal has closed.** This round shipped, to `main`, **zero** new fatal-risk fixes: the two commits since round 2 that are branch-only (`12c4730` CI hardening, `4773493` a card-layout bug) are good work and neither is a Phase-0 defect. The four dangerous Phase-0 items are still live on `main`. The plan is excellent and the team keeps converting findings into correct, tested code — which moves my read of *the team* up again — but the investment question is about the risks, and the risks are where they were.

| Condition | T/F on `main` (7 Aug 2026) |
|---|---|
| Money ledger is transactional; ceiling + redemption races proven under **real** Postgres | **TRUE** (branch CI; buyTrophy double-spend correct-by-construction but not yet contended — `concurrency.mts:45`) |
| Runtime pinned so money paths cannot break on deploy | **TRUE** (`engines`, `.nvmrc`, `ws` fallback) — but **branch-only, not on `main`** |
| Fabricated ROAS removed from the live brand report | **FALSE** — live, `lib/brand-report.ts:105` |
| Beacon authenticated / CP not `curl`-mintable | **FALSE** — live, unauth |
| Trophy gifting deleted | **FALSE** — live, `lib/marketplace.ts:198` |
| Age gate at signup | **FALSE** — live, none (`app/actions/auth.ts:11-53`) |
| The four decisions (D1–D4) are *built*, not just *decided* | **FALSE** — all are plan; B72/B81/B82/B83 unbuilt |
| Discord policy opinion committed (Gate 1) | **FALSE** — owner pursuing |
| FinCEN/CVC opinion committed (Gate 1) | **FALSE** — owner pursuing |
| Gate 2 is a *blocking* required check | **FALSE** — evidence yes, branch protection not applied |
| A build item exists for sybil/fraud and for scale | **FALSE** — both are debt, unscheduled |
| A signed IO for a measured product (Gate 4) | **FALSE** |

Eleven of twelve false or branch-only; the one true row is branch-only too. **Nothing here moves the verdict** — the plan is the best of the three rounds and the money-integrity work is now genuinely proven, but a decided plan is still a plan, and the fatal risks (Discord, money transmission, paying children, fabricated measurement to a live brand) are untouched in production. Re-open the file when D1–D4 are **built and merged to `main`** and the two legal opinions are **committed artifacts** — those are binary and cheap to check.

The test I was engaged to apply: is a remediation a list of intentions? Round 1 was all intentions. Round 2 shipped a real, correct money-integrity layer. Round 3 decided every open question well, fixed the three things I found in round 2, and shipped one bug fix — and left the four things that make this "do not invest" exactly where they were. Good plan. Not yet a reason to wire money.

### Appendix — verifications for this review
- Round-2 fixes: `ci.yml` postgres:16 service + "real Postgres, real lock" step; `lib/db/tx.ts:80-81` ws fallback; `package.json` engines `>=22.0.0`; `.nvmrc` 22. Branch CI green on `12c4730`, `d0c3e2f`, `4773493`, `4b15933` (Actions API).
- Honesty disclosure: `tests/db/concurrency.mts:45-46`.
- §1 false claim: `git merge-base --is-ancestor` → `12c4730`, `4773493` **not** on `origin/main` (`468f71e`).
- A2 web over-count: `components/AdSlot.tsx:48-52,58-73`. A3 no billable cap: `lib/cards/ads.ts:200-216`. Schema has no `surface`/`cardKind` yet (`schema.ts` ad_impressions: pagePath/deviceType/guildId).
- D `share_card` no emitter: zero `awardQuestAction(…,"share_card")` in `app/`/`lib/`; emitter-having orbit actions are `follower_gained`/`profile_views_25`/`profile_vote_received`, all passive per `COMMERCIAL_MODEL.md` §2.1.
- E stale-state: `lib/theme.ts:172,179` (unversioned spread, same tell); `lib/quests.ts:322,680` (partial); `lib/pricing.ts:165`/`lib/finance.ts:114` immune (iterate defaults by key).
- B85.2: `lib/cards/data.ts` selects `planetBgUrl`, never `planetImageUrl` (`schema.ts:579` column exists). Layout fix: `lib/cards/layout.ts:559`.
