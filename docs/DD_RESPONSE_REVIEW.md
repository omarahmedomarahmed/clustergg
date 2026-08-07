# Review of ClusterGG's Due-Diligence Response

**Prepared for:** the investor
**Prepared by:** the same independent due-diligence lead who wrote `docs/DUE_DILIGENCE_REPORT.md`
**Date:** 7 August 2026
**Under review:** `docs/DD_RESPONSE.md` and `docs/EXECUTION_PLAN.md` items B71–B80, at commit `57cb956` on `claude/clustergg-platform-build-mfkzaa`.
**Posture:** unchanged. Not on the team, not here to be helpful, here to be right. Cite before asserting — their last round of self-description contained claims about their own code that were false, and this one contains at least one more.

---

## 0. The one fact that frames everything

Commit `57cb956` — "The due-diligence response, and the plan reordered behind its gates" — changes **two files, both markdown**: `docs/DD_RESPONSE.md` (+220) and `docs/EXECUTION_PLAN.md` (+169). **Zero lines of code** (`git show --stat 57cb956`: "2 files changed, 389 insertions(+)").

Every one of the six "immediate" Phase-0 defects the response says is being fixed "off immediately" is **still live in the code on this same commit**:

| "Off immediately" (DD_RESPONSE §1, §4) | State at `57cb956` | Evidence |
|---|---|---|
| Fabricated ROAS off | **Still live.** `mediaValue`/ROAS from headcount intact | `lib/brand-report.ts:52-53,105-115` |
| Beacon authenticated | **Still unauthenticated.** No signature, rate-limit or origin check | `app/api/ads/beacon/route.ts` (grep for signature/rateLimit/origin returns nothing) |
| Trophy gifting deleted | **Still present.** `giftedTo`, `recipientSlug`, `gift_sent` all live | `lib/marketplace.ts:198,209-210,274-275` |
| Age gate at signup | **Still absent.** Signup takes email/password/name only | `app/actions/auth.ts:11-53` |
| `AUTH_SECRET` fatal | **Still has the hardcoded fallback**, in two files | `lib/auth.ts:8`, `middleware.ts:22` |
| Approval gate restored | **Still auto-launches.** Campaign `status:"active"`, creative `status:"approved"` on upload | `app/actions/brand-portal.ts:133,141` |

This is the whole review in one paragraph: **the response is a well-written, intellectually honest plan, and it is only a plan.** It was committed within hours of the report, it is entirely prose, and the gates that are supposed to give it force are sentences in a markdown file. A plan is not a remediation, an accepted finding is not a closed one, and a gate you can walk around is not a gate. The rest of this document is the itemised version of that sentence.

**Nothing in the response changes the verdict. DO NOT INVEST stands.** What has changed is the *reason to keep watching*: the diagnosis is now shared, and the ordering is correct. That is worth something — but it is worth it only if it turns into diffs, and none of it has.

---

## A. The acceptances — closure vs. restatement, and the omissions

They accept 15 findings (§1). The acceptances are real: I re-checked each against the code and they are describing genuine defects in their own words, not strawmen. The problem is not the acceptances. It is (1) that several *filed items* close a narrower thing than the finding, and (2) what is quietly **not** on the list at all.

### A.1 Acceptances that fully close the finding — if built

- **#4 Trophy gifting (→ B72).** Deleting gifting genuinely closes three findings at once — the FinCEN money-transmission trigger (§5.1), the 1099 aggregation hole (§5.1), and the under-18 cash-out bypass (§5.2). This is the single cleanest, highest-leverage item in the whole plan and the analysis behind it is correct. It is still only filed (`lib/marketplace.ts:198-217,274-275` intact), but if shipped it closes what it claims.
- **#6 Missions dead code + no-emitter actions (→ B76).** B76 is actually *broader* than the acceptance: it also picks up two §3.1 findings that are **not** in the §1 accept table — the missing 125-CP passive cap and the broken "no action pays >25 CP" rule (`win_challenge`/`best_profile_award` at 100). Credit where due: the guarantee findings are addressed even though they were never listed as accepted.
- **#8 `AUTH_SECRET`, #14 CI + vacuous test (→ B72/B74).** Correctly scoped. B74 replaces `tests/db/marketplace.mts:148` with a real concurrency test and adds CI. Fine — if built.

### A.2 Acceptances where the filed item closes a **narrower restatement**

- **#1 Fabricated ROAS (→ B72).** B72 removes the `$8-CPM × headcount` formula — good. But its *interim replacement* is "Show delivered impressions from logged rows, or the words 'not yet measured'" (`EXECUTION_PLAN.md:3761`). On the Discord surface, "delivered impressions from logged rows" **is the count-on-post number** — one row per server at post time regardless of who saw it (`lib/discord/ads.ts:80-82`) — which B75 itself later concedes "is not an IAB impression and must never be sold as one" (`:3827`). So the interim fix risks swapping one misleading number for another. The honest interim for Discord is "not yet measured," full stop. The finding was "you show a fabricated reach figure"; the fix as filed closes "you multiply it by $8," not "the underlying count is fictional."
- **#2 Open beacon (→ B72).** Authenticating the beacon closes **one** CP-minting vector. The finding "CP is mintable" is broader: the ceiling **race** (§3.5) mints CP through any authenticated path under concurrency (deferred to B74), and `profile_views_25` is credited from an **unauthenticated public page render** (`app/u/[slug]/page.tsx:96-102`, my §3.5) — a second self-assert mint that B72's beacon signature does not touch and that appears in no filed item. Closing the beacon is necessary; it is not "CP is no longer mintable."
- **#7 Render cap (→ B77).** B77 raises the `~200-gamer` render ceiling (`lib/cards/budget.ts:23-27`). But that ceiling was B46's **cost** control. Raising it re-opens the cost it was capping (server-side PNG compositing is the infra cost driver, my §3.7/§4.4), and nothing in B77 or B78 re-models that cost. The filed item closes "the cap throttles growth" and silently opens "rendering now costs more," unquantified.
- **#11 `maxCreativesInRotation` / `creatives[0]` (→ "already filed as B65").** Half true. B65 (per the pivot amendment, `:3979`) named the **card-path** silent cutoff (`hash(card) % brandCount ... drops paying brands`). The **bot-post single-brand pin** (`lib/discord/ads.ts:52`, serves `creatives[0]` only) is a *different surface* and was a new finding in my report, not something B65 already carried. Minor, but it is the pattern to watch: "already filed" is doing work the original filing did not do.

### A.3 The omissions — the thing to hunt for

B80 is titled "Security and privacy debt" and opens: *"The remainder of the report's verified findings, none fatal alone, all real"* (`:3910-3911`). It then lists **five** items (90-day purge, Riot key, cookie consent, deletion PII, IP salt). It is **not** the remainder. The following findings from my report appear in **neither** `DD_RESPONSE.md` **nor** B72–B80 (confirmed by grepping the plan additions — every term below returns zero hits in B72–B80):

| Omitted finding | My report | Severity I gave it |
|---|---|---|
| **Sybil cost per account is $0.00** — no email verification, captcha, phone, or device check; the IP-velocity guard is dead code | §3.6 / §9 `:658` | **FATAL** |
| **No automated gamer-side abuse detection** (the only detector is guild-scoped, needs 50+ members, non-enforcing) | §3.6 / §9 `:684` | severe |
| **Cold-start DDL replay** — 219 raw statements, 108 `ALTER TABLE` (ACCESS EXCLUSIVE), 11 full-table `UPDATE`, on every cold boot against prod | §3.7 / §9 `:714` | **FATAL** |
| **Stat sync saturates at ~30 accounts** (60/hr sequential loop, no queue) | §3.7 / §9 `:709` | **FATAL** |
| **Per-award query cost** — ~12 round-trips × 20 actions × 1M gamers = 240M queries/day; `quest_events`/`ad_impressions` unbounded, no partitioning | §3.7 / §9 `:719` | **FATAL** |
| **Brand-report OOM** — loads every impression row into function heap | §3.7 / §9 `:748` | severe |
| **`/api/setup` public when `SETUP_TOKEN` unset**; first account becomes superadmin | §3.8 / §9 `:825` | material |
| **OAuth open redirect** (`next` param unvalidated) | §3.8 / §9 `:820` | material |
| **OAuth account-merge trusts an unverified provider email** | §3.8 / §9 `:830` | material |
| **Portal brute-force lockout bypassed; per-portal not per-IP** (DoS on every brand/server customer) | §3.8 / §9 `:815` | material |
| **Session JWT last-16-chars stored in analytics table, plaintext, indefinitely** | §3.8 / §9 | material |
| **Open image proxy** (`next.config.ts:34` proxies any HTTPS host) | §3.8 / §9 `:835` | minor |

Two of these matter beyond the tally:

1. **The anti-sybil omission has an economic consequence they claim to have handled.** The $547,500/yr minted-CP fraud figure (my §4.4) is generated by *free account creation × a public mint*. B72 closes the public mint (the beacon). It does **not** touch free account creation, and it does not touch the collusion-ring farming of follows/votes/gifts/profile-views that needs no beacon at all (§3.6). So the fraud economics **survive their fix**, and the plan does not acknowledge it. B80's "none fatal alone" is also wrong on its face: it silently contains three findings I rated **fatal** (cold-start DDL, stat-sync cap, per-award query cost) by simply not listing them.

2. **The entire §3.7 scale category is gone** except B77's render cap. The plan's own top rung is 1,000,000 gamers; the components that break long before then — the migration replay, the sync throttle, the per-award query fan-out, the unbounded ledger tables — are not on any list. This is defensible *if* the company's honest position is "we are pre-revenue and scale is years away" — but then the ladder in `COMMERCIAL_MODEL.md` that goes to 1M gamers should not be the reference model B78 is restating. They cannot drop the scale findings as premature while keeping the 1M-gamer ladder as the plan of record.

**Verdict on A:** the acceptances are honest but the closures are, in several cases, narrower than the findings, and the "remainder" catch-all drops ~12 real findings including four I rated fatal/severe and the one (sybil) that props up a headline fraud number they believe they have addressed.

---

## B. The four disputes

Short version: **dispute 3 is correct, dispute 2 is a fair framing point whose own worked example is arithmetically wrong, disputes 1 and 4 are half-fair and change nothing.** None moves the verdict by a notch, which the response itself states (`DD_RESPONSE.md:40`). Taking each:

### B.1 "$0.80 CPM applies a programmatic method to direct-sold inventory" — *partly fair, moot*

Correct that some multipliers in my build-up are exchange-specific: the supply-chain leakage (×0.71) and any exchange take rate do not apply to a hand-sold direct deal. Fair. But (a) my $0.80 was a **blend that already included a $1.00 direct-sponsorship courtesy figure** for the Discord surface, not a pure programmatic number (my §4.2, Appendix Table 2); (b) the two multipliers that survive channel — the gaming-vertical index and the SIVT/MFA filtration — are the ones they themselves concede "poison direct sales too" (`:52-56`); and (c) **they concede they cannot prove $5 either** (`:58`). Once both sides admit the number is unproven, the dispute is not about who is right, it is about what evidence would settle it — and that is a signed IO, which is my §7 condition and their Gate 4. So the dispute is technically half-fair and **changes nothing**: at any CPM I can defend and any they can defend-with-evidence (which is currently none), the model does not close.

**Is the "cannot prove $5" concession sufficient?** Sufficient to *retire the CPM dispute* honestly — yes. Insufficient to *move the verdict* — also yes, and for a reason they do not state: even a signed IO at $5 proves **one** deal, and the SIVT/incentivised-traffic classification they concede is "close to permanent and travels between buyers" (`:54-55`) means that deal can be clawed back the moment the brand's verification vendor runs. So "one signed IO" retires the argument but does not derisk the business; it converts an unknown into a single, revocable data point.

### B.2 "'Break-even is an identity, unreachable at any scale' is input-dependent" — *fair as framing; their example is wrong*

The framing point is correct and I concede it: `CPM × fill ≥ $3.31` is an identity (an accounting truth); "unreachable" is a *conclusion* contingent on the disputed inputs. I should have written "unreachable at any CPM the market will pay," not "at any scale." Granted.

But their worked example refutes their own dispute. They write: *"At $5 × 56% it clears; at $0.80 × 15% it does not"* (`:66-67`). **$5 × 56% = $2.80 per 1,000 screens, against $3.31 of CP cost — a loss of $0.51** (verified: break-even fill at $5 CPM is **66.2%**, not 56%). This is the **exact fill-omission error they accept as their own in finding #15** (`:34`), reproduced inside the dispute that is supposed to show sophistication about it. The correct statement is the one already in my report (Appendix Table 3): at their A5 fill of 56%, the required CPM is **$5.90** — above their $5 sell price and 48% above their $4 floor. So the dispute is right that unreachability depends on inputs, and wrong in the only number it offers; and the number, corrected, lands back on my conclusion.

### B.3 "The 1,234× gap is three disputed inputs compounded, not three independent observations" — *correct, concede it*

Fully fair, and I concede it without reservation. The 1,234× is `CPM 6.25× × screens 29.62× × fill 6.67×` — a product of three contested inputs, not three corroborating measurements. Presenting it as a single headline overstates the *independence* of the evidence, and a careful reader should discount it accordingly. It changes nothing about the verdict because **the least disputable of the three factors alone is disqualifying**: the ~30× screens-per-registered-gamer term is not a market opinion, it is the ratio between their revenue side (15 screens on *every registered account*) and their own shipped cost model (`lib/cp-economics.ts:51`, 35% DAU × 30% reach = 10.5%). Strip out the CPM and fill disputes entirely and the ladder still overstates deliverable inventory by roughly an order of magnitude, from their own two numbers.

### B.4 "Registered vs daily-active is a ~30× definitional switch, a convention not a fact" — *half-fair, and the substance is unchanged*

Fair that my table should have declared the denominator; they concede the same sloppiness on their side (`:85-86`), so this resolves in the restated model (B78) and is a wash. But "it is a modelling convention, not a fact about the product" is where it becomes special pleading. The **absolute inventory** — actual ad-screens rendered per month — is the same small number whichever denominator labels the axis; choosing "per daily-active gamer" makes the *per-gamer* figure look 30× larger without rendering a single additional screen. The 30× is not a convention anyone is free to choose; it *is* the product's retention (registered ÷ daily-active), and their own shipped model puts it at ~10.5%. So the denominator fight is real but self-cancelling: declare it honestly and apply one engagement number to both sides (which B78 promises), and the ladder's inventory column falls by ~10× regardless.

**Net on B:** three of the four disputes are technically fair (2-as-framing, 3, 4-as-nomenclature) and one is half-fair (1). The single place they are *factually wrong* is the "$5 × 56% clears" example, which reproduces their own accepted error. **No dispute moves the verdict**, exactly as they say, and their $5 concession is honest but only defers the central unknown to a signed-IO gate — it does not shrink it.

---

## C. The gates — the crux, and the place the response is weakest

**A gate is a control only if something prevents the gated work from proceeding when the gate is red. Nothing in this repository prevents anything.** All four gates are declarative sentences. I checked each against the code.

### Gate 0 — "no Phase-0 item may be deferred for a feature"
Enforced by: nothing. It is a promise about ordering. The proof it is not yet a control is §0 of this review: all six Phase-0 defects are still live at the very commit that declares Gate 0. **To make it enforceable:** the six fixes land as a diff with the promised `tests/db/integrity.mts` (`:3771-3775`) passing in CI. That file does not exist; CI does not exist (`.github/workflows/` absent). Until then Gate 0 is aspiration.

### Gate 1 — "B74–B79 do not start before the Discord + FinCEN answers"
Enforced by: nothing. This is the one gate that **cannot** be code-enforced (it turns on external legal answers), which makes it the most important one to make *evidentiary*. Today there is no artifact — no committed counsel memo, no board minute, no dated written opinion — that records the answer or its absence. **To make it enforceable:** the Discord Developer-Policy read and the FinCEN/state CVC status opinion exist as committed documents (redacted as needed) with a date and an author, and the plan references them by name. A gate whose state cannot be observed is not a gate; it is a hope that someone remembered to ask.

### Gate 2 — "a concurrency test proving the ceiling holds; no CP feature ships before it passes"
Enforced by: nothing, and it is the gate most *capable* of being real. `tests/db/concurrency.mts` (`:3814`) does not exist; there is no CI to run it; and there is no branch protection tying "a CP feature merges" to "that test is green." **To make it enforceable:** the test exists and passes on the **pooled** production driver (not the PGlite demo shim, which cannot reproduce the `neon-http` race — my §3.9), CI runs it on every push, and the money-path files (`lib/quests.ts`, `lib/marketplace.ts`, `app/actions/trophies.ts`) are under branch protection requiring that check. This is the only gate that could become a genuine, mechanical control this quarter, and it is the one I would watch first.

### Gate 4 — "one signed IO before B66 (admin console), B67 (brand portal), B69 (public site)"
Enforced by: nothing — **and two of the three things it gates are already built and live.** `app/brands/[slug]/page.tsx` (the self-serve brand portal, B67) and `app/pricing`, `app/brands`, `app/servers`, `app/discord-bot` (the public commercial site, B69) all exist in this repo and render on `clustergg.com` today. You cannot gate the *start* of work that has already shipped. Only B66's sales cockpit (headroom / oversold / fill — which I confirmed does **not** exist, consistent with my §3.3) is genuinely pre-build. So Gate 4 as written is retroactively violated by the live storefront. **To make it enforceable:** the already-built storefront is put behind a config/feature flag that is off until a `signed_io` flag is set, or the commercial surfaces are removed from production until the IO exists. A gate cannot block the past.

**Answer to C, plainly:** every one of B74–B79 could be built today with nothing in the repo stopping it, and B67/B69 already have been. The gates are the right *decisions*; not one of them is yet a *control*. The single thing that would most change my read of this response is not another paragraph — it is the first gate that becomes a red CI check that actually blocks a merge.

---

## D. Sequencing

**"Define what an impression is" before "count delivery" (B75.1 before B75.2) is the correct order** and is the single best structural decision in the plan — you cannot honestly build a delivery counter on a unit you have not defined, and it directly targets the fabricated-ROAS root cause. Credit it.

But two dependencies downstream still rest on unmeasured numbers:

1. **Gate 4 depends on a number that, by their own B79, cannot exist until after Gate 4 opens.** B79 says fill is measured "against a signed brand" (`:3897`) and the signed IO is Gate 4 (`:3902`). To *quote* the first brand a credible delivery expectation (which `COMMERCIAL_MODEL.md §7.2` promises as "computed from the real platform right now"), you need measured delivery and a fill estimate; to measure fill you need a signed brand. That is circular: **the measurement that is supposed to justify the first sale can only be taken after the first sale.** The escape is to sell the *first* IO explicitly as an unmeasured pilot priced on outcomes (the CPA path in B79), not on a delivery promise — but the plan does not say that, and `§7.2`'s "computed from the real platform" language points the other way.

2. **B79's "instrument real screens per daily-active gamer per day" depends on B77, which is unbuilt and ungated.** You cannot measure screens-per-gamer at any meaningful volume while `lib/cards/budget.ts` caps rendering at ~200 daily gamers. B77 sits before B79 in the list, so the order is not wrong — but B77 is the item that quietly re-opens the unmodeled render **cost** (§A.2), so the measurement in B79 is gated on a cost decision nobody has made. The number they most need (real screens/gamer/day) is blocked behind a cost trade-off the plan defers.

So: the headline ordering is right, and there is no impression counted on an undefined unit. But the gate that unlocks the storefront (Gate 4) is circular against B79's fill measurement, and B79's screen measurement is blocked behind B77's unmade cost decision. Neither is fatal to the ordering; both should be named before the plan is called sound.

---

## E. Nothing is built yet — what would change the verdict

**State of implementation: zero.** B72–B80 are a plan committed with no accompanying code (§0). So the honest position is that there is nothing here to re-underwrite — there is a diagnosis I agree with and a sequence I mostly endorse, attached to no diffs.

### E.1 What I would need to see **in code** before revising the verdict

Stated as observable facts, not intentions:

1. **Phase-0 is merged and asserted.** `lib/brand-report.ts` contains no headcount-derived field; `app/api/ads/beacon/route.ts` rejects an unsigned call and awards no CP for one; the gift code paths in `lib/marketplace.ts` are gone; `app/actions/auth.ts` refuses a registration with no date of birth; the app throws on boot with `AUTH_SECRET` unset; an uploaded creative is `pending` until approved — and `tests/db/integrity.mts` asserts all six and runs in CI.
2. **Money integrity is proven, not promised.** The money paths run on a pooled driver; `tests/db/concurrency.mts` shows N parallel awards settling at exactly the ceiling and two concurrent last-trophy purchases leaving one buyer and a non-negative balance, on that driver; CI is green on every push; branch protection requires it.
3. **The two external answers exist as artifacts.** A dated written Discord Developer-Policy read and a FinCEN/state CVC status opinion, committed to the repo. Absent these, Gate 1 is unresolved and the ad business is unappraisable regardless of code.
4. **The restated model (B78) is parametric and consistent** — fill in the equation, denominator declared, one engagement number on both sides — and it does not reintroduce a forecast built on an unmeasured input.
5. **A signed IO for a *measured* product** (Gate 4/B79). One real advertiser paying for entrants or a defined impression. This is the only thing that converts the CPM from opinion to evidence.

### E.2 The single item that would move the assessment most

**If they ship exactly one code item: B74 — transactional money integrity with a passing concurrency test in CI on the pooled driver.** It beats even the Phase-0 fixes for the investment question, and here is why over each rival:

- Over B72 (Phase-0): B72 is the more *urgent ethical* fix — it stops actively misleading a live customer and should ship first regardless. But shipping B72 proves they can do six hours of clearly-scoped work; shipping B74 proves something larger — that they can convert a **markdown gate into an enforced CI control**, which is the exact capability this entire response is asking to be trusted on. It is also the item that makes every economic number falsifiable at all: while the ledger is a mintable read-then-write race, no CP cost, redemption liability, or fraud figure can be trusted, so nothing else measured downstream means anything.
- Over Gate 1 (Discord/FinCEN): those answers move the *verdict* more (either can zero the company), but they are **not theirs to ship** — they are external, and the question asks what *they* would ship. B74 is fully within their control.

So: the item whose delivery would most tell me this response is remediation and not theatre is a green `tests/db/concurrency.mts` gating merges to the money paths. It is the first place a sentence in this plan could become a control, and it is the floor under every number in the model.

---

## F. Revised verdict

**DO NOT INVEST — unchanged.** The response is the most honest founder reply I have read to a kill verdict, and honesty about a hole is not a fix for it. Nothing in it is yet true in code.

I restate the conditions as **facts that are currently true or false**, not as intentions, so the investor can re-test them without reading prose:

| Condition | True / False at `57cb956` |
|---|---|
| The six Phase-0 defects are fixed in code | **FALSE** — all six live (`lib/brand-report.ts:105`, `app/api/ads/beacon/route.ts`, `lib/marketplace.ts:198`, `app/actions/auth.ts:11`, `lib/auth.ts:8`, `app/actions/brand-portal.ts:133`) |
| Any of the four gates is enforceable (a red state blocks the gated work) | **FALSE** — all are markdown; no CI, no branch protection, no feature flag; B67/B69 already shipped past Gate 4 |
| A concurrency test exists and passes on the production driver | **FALSE** — `tests/db/concurrency.mts` does not exist; no CI |
| The Discord policy answer exists as an artifact | **FALSE** — no committed opinion |
| The FinCEN/state CVC status opinion exists | **FALSE** — no committed opinion |
| Trophy gifting is deleted (the highest-leverage single fix) | **FALSE** — `lib/marketplace.ts:198-217,274-275` intact |
| A signed IO for a measured product exists | **FALSE** — conceded (`DD_RESPONSE.md:58`) |
| The restated model applies one engagement number to both sides | **FALSE** — B78 is filed, `COMMERCIAL_MODEL.md` unchanged in this commit |
| The report's diagnosis is accepted and the remediation is correctly ordered | **TRUE** — and it is the only thing that is |
| The plan's "remainder" catch-all (B80) actually covers the remaining findings | **FALSE** — ~12 findings omitted, including 4 I rated fatal/severe and the sybil finding that underpins the fraud number |

**Recommendation:** hold. Re-open the file the moment the table above flips — specifically when (1) B72 is a merged diff with `integrity.mts` green in CI, (2) `concurrency.mts` gates the money paths, and (3) the Discord and FinCEN opinions are committed artifacts. Those three are binary, observable, and cheap to verify. Until they are true, this is a company that has correctly written down what is wrong with it and changed none of it — which is a better place to be than denial, and is not a place you wire money into.

One closing note, in the spirit of the brief: the thing I was engaged to catch is a remediation plan that is a list of intentions. This is a remediation plan that is a list of intentions. It happens to be an unusually good list, authored by people who clearly understood the report — but the test is not the quality of the prose, it is whether the code moved, and the code did not move at all.

---

### Appendix — verifications performed for this review

- `git show --stat 57cb956` → 2 files, both `docs/`, 389 insertions, **0 code**.
- Phase-0 defects still live: `lib/brand-report.ts:52-53,105-115`; `app/api/ads/beacon/route.ts` (no signature/rate-limit/origin); `lib/marketplace.ts:198,209-210,274-275`; `app/actions/auth.ts:11-53`; `lib/auth.ts:8` + `middleware.ts:22`; `app/actions/brand-portal.ts:133,141`.
- Storefront already live: `app/brands/[slug]/page.tsx`, `app/pricing`, `app/brands`, `app/servers`, `app/discord-bot` all present; B66 cockpit (headroom/oversold/fill) absent from `app/admin` and `lib/`.
- No CI (`.github/workflows/` absent); owed test files `tests/db/concurrency.mts`, `tests/db/integrity.mts`, `tests/db/quests.mts` do not exist.
- Dispute-2.2 arithmetic: $5 × 0.56 = $2.80 < $3.31 → loss of $0.51/1,000 screens; break-even fill at $5 CPM = 66.2%.
- Omissions cross-checked: each finding in §A.3 present in `DUE_DILIGENCE_REPORT.md` (line refs above) and absent from B72–B80 (zero grep hits for sybil/captcha/email-verification/abuse-detection/cold-start/stat-sync/240/OOM/`/api/setup`/image-proxy/open-redirect/brute-force in the plan additions).

---

# Addendum — Round 2: the first shipped code

**Date:** 7 August 2026 · **Reviewing:** commits `d34af09`, `3a776c0`, `a6972d3` on `claude/clustergg-platform-build-mfkzaa`, all merged to `main` via PR #100 (`468f71e`) and therefore **live on clustergg.com**, plus the new `docs/PLAN.md`.

**The one-line update:** last round the response was 389 lines of markdown and zero code, and I called it an honest plan that was only a plan. This round, code shipped — and the part that shipped is real, competent, and independently verified green in CI three times. **The verdict does not move, because the things that shipped are not the things that were fatal.** But the honest answer to "real or theatre?" is now split: the *engineering-integrity* track is real; the *existential* and *live-customer* tracks have not moved at all.

## 1. What actually shipped, and is correct (verified against source, not the changelog)

- **Money integrity (B74) is a real, correct fix.** `lib/db/tx.ts` opens a pooled `neon-serverless` connection — the only driver on the platform that can hold a transaction, since `neon-http` genuinely cannot — and `awardQuestAction`, `buyTrophy` and `requestRedeem` now run inside `withTx` behind `lockGamer` (`SELECT … FOR UPDATE` on the gamer's own `users` row). I checked the ordering, which is the part that is easy to get wrong: in all three paths the lock is taken **first**, the balance/ceiling is re-read **on the transaction handle inside the lock**, and the write happens before commit (`lib/quests.ts:503-520` via `awardQuestActionLocked`, `lib/marketplace.ts:239-268`, `app/actions/trophies.ts:161-181`). Locking the user row rather than a "wallet row" is the correct call — the balance is a sum over `quest_events` and orders, and you cannot lock a sum. This is the item I named last round as the single highest-leverage thing they could ship, and they shipped it correctly.
- **The bare `catch {}` is gone** from the award path (`lib/quests.ts:533` removed; the outer catch now `console.error`s — narrow and loud, `lib/quests.ts:498`). This was half the finding and it is genuinely closed.
- **The vacuous test is replaced with a real one.** `tests/db/concurrency.mts` (25 assertions) asserts on the **unclamped** `earned − spent`, which is exactly the ledger property the old `marketplace.mts:148` could not see behind `Math.max(0, …)`. Its "five simultaneous `buyTrophy` calls leave exactly one buyer, one order, and `earned − spent = 0`" is the assertion that would actually have failed before B74.
- **CI exists and is green.** `.github/workflows/ci.yml` runs type-check → concurrency suite (named "Money integrity (Gate 2)") → integrity suite → full suite → build, on every push and PR. I confirmed via the Actions API that all three runs (`a6972d3` push, PR #100, and the `main` merge `468f71e`) concluded **success**. This is the first thing in the entire engagement that converts a gate from a sentence into a green check.
- **`AUTH_SECRET` fails closed (B72, partial).** `lib/secret.ts` throws when the variable is unset outside a demo/test runtime, rejects the old public placeholder by value, and rejects keys under 16 chars; called at module scope so it fails the first request, not the first login. The fallback is gone from both `lib/auth.ts:7` and `middleware.ts:19`. Correct.
- **Self-serve creative approval gate restored (B72, partial).** Both portal upload paths now insert `status: "pending_review"` instead of `"approved"` (`app/actions/brand-portal.ts:51,146`), `serveAds` already refuses non-approved, and `getCardCampaign.live` now requires `reviewStatus === "approved"` (`lib/brands.ts:132`) so the portal stops telling a brand "you're live" while nothing serves. Correct, and the `live`-flag fix is the kind of second-order honesty the last round was missing.

**`docs/PLAN.md` itself is a genuine response, not spin.** It adopts my review's criticisms by name, marks the gate table honestly (Gate 0 "Partly", Gate 1/4 "No", Gate 2 "Yes — pending branch protection"), restores the ~12 findings B80 had dropped — including the three I rated fatal and the sybil finding — and states plainly that "the fraud economics survive our own Phase-0 fix." It also concedes the two things I said it could not answer (Gate 4 gates already-shipped surfaces; Gate 4 is circular against the fill measurement) rather than papering over them. A team that writes down the tension it has not resolved is doing the opposite of theatre.

## 2. What is still live on `main` — including the two that matter most

`main` is byte-identical in code to `a6972d3` (verified: empty diff). Four of the six Phase-0 defects the response called "off immediately" are **still live in production**:

| Still live on `main` | Evidence | Blocked on (per PLAN.md) |
|---|---|---|
| **Fabricated ROAS** shown to the one paying brand | `lib/brand-report.ts:105-115` intact | Decision **D1** |
| **Open, forgeable ad beacon** (mints CP by `curl`) | `app/api/ads/beacon/route.ts` — no signature/nonce/rate-limit | "design below" (nonce), not built |
| **Trophy gifting** (the money-transmission trigger) | `lib/marketplace.ts:198-217,274-275` intact | Decision **D2** |
| **No age gate at signup** (paying children / COPPA) | `app/actions/auth.ts:11-53` — no DOB collected | Decision **D3** |

This is the crux of the round. The two Phase-0 items they *did* ship (AUTH_SECRET, approval gate) are real but are the **least severe** two on the list. The two most serious — **the false ROAS statement to a live customer, and paying children with no age gate** — are still live, now gated behind "open decisions" (D1–D3) that are, by their own framing, *product/legal choices they have not made*. So the single most reputationally and legally dangerous defects in the original report remain in production a full round later. Crediting the money-integrity work is fair; letting it distract from that fact is not. **Nothing fatal has been closed.** Discord policy (Gate 1) — unanswered. Money-transmission trigger — still live. Paying children — still live. Fabricated measurement to an advertiser — still live.

## 3. Where the shipped work is weaker than it reads

Three specific things, in the spirit PLAN.md asked for — a `file:line`, not a paragraph of concern:

1. **The concurrency test cannot reproduce the race it defends against, and this is load-bearing.** The suite runs on PGlite (`tests/db/concurrency.mts:25`), which is one in-process connection, so `Promise.all` of N transactions is serialized by the single connection regardless of whether the row lock works. The test therefore proves the *logic is correct under serialization* and — via its source-assertions at `:183-209` — that the code is *wired* to the pooled driver with a `FOR UPDATE`. It does **not** empirically prove that `FOR UPDATE` serializes concurrent transactions on real multi-connection Neon. The file says exactly this itself (`:9-21`), which is to their credit, but the consequence stands: **Gate 2 is green without ever having run the production failure mode.** The missing piece is a CI job that runs the same suite against a real Postgres (a Neon test branch or a `postgres` service container) with the pooled driver and ≥2 connections. Until that exists, "the ceiling holds under parallel writes" is asserted of PGlite, not of production.

2. **The money paths now silently depend on the production runtime being Node 22+, and nothing in the repo pins it.** `lib/db/tx.ts:57-62` throws if `globalThis.WebSocket` is undefined, which is the case on Node 20 (global `WebSocket` is unflagged only from Node 21 and stable in 22), and the code does not set `neonConfig.webSocketConstructor` as a fallback. There is **no `engines` field in `package.json`** and **no Node runtime pinned in `vercel.json`** — CI hard-codes Node 22, but the *deployment* version is a Vercel project setting the repo does not control. If that setting is (or becomes) Node 20, every money path throws: loud on `buyTrophy`/`requestRedeem` (the user sees an error), and **silent on `awardQuestAction`**, whose outer catch swallows-and-logs — so CP would quietly stop being awarded platform-wide. Fix is one line (`"engines": { "node": ">=22" }`) plus a `webSocketConstructor` fallback. This is a new finding, not in the report or the plan.

3. **Gate 2 reports; it does not yet block.** CI being green is necessary but not sufficient to be a "control": a control is a *required* status check under branch protection, and PLAN.md §5 concedes that rule is not applied ("**Yes** — pending branch protection"). PR #100 merged with CI green, so the gap didn't bite this time, but a red concurrency check could still be merged today. The gate is a green light on the dashboard, not a lock on the door, until the owner sets branch protection requiring the "Money integrity (Gate 2)" check. That is a repository setting, not a commit — so it is verifiable, and it is not done.

Minor: `npm test` (`tests/run-all.mjs`) does not include `concurrency.mts` or `integrity.mts` — they run only as separate CI steps — so a developer running the suite locally does not exercise the gate.

## 4. The gate table, re-scored against code

| Gate | Claim | Real? (my score) | Why |
|---|---|---|---|
| **0** | Six Phase-0 defects fixed before anything else | **1/3** | 2 of 6 shipped (AUTH_SECRET, approval gate); the 4 most serious are live on `main`, gated behind unmade decisions D1–D3 |
| **1** | Discord + FinCEN answers before B74–B79 | **No** | No committed opinion exists; and B74 shipped *ahead* of it, so the gate's own ordering was not followed |
| **2** | Ceiling holds under parallel writes | **Partly-real** | Test + CI + wiring assertions exist and are green; but proven only on PGlite, and not yet a required check (no branch protection) |
| **4** | One signed IO before the storefront | **No** | Storefront (`app/brands/[slug]`, `app/pricing`, …) already live; gate still cannot block the past; still circular against B79's fill measurement, which PLAN.md concedes |

Note on Gate 1: the plan says "B74 through B79 do not start before this answer," and B74 started and shipped. The team's defensible reading is that B74 is money-integrity hardening worth doing regardless of the Discord answer — which is true — but it means the *first* thing they built crossed their own most important gate, which is worth naming.

## 5. Revised verdict

**DO NOT INVEST — unchanged.** But the reason is now more precise, and one sentence of it is new and positive.

The positive, stated without hedging: **this is the first evidence the team can convert a finding into correct, tested, merged code under adversarial pressure** — the exact capability the whole response was asking to be trusted on. The money-integrity layer is the single most reassuring artifact in the engagement, and if I were pricing the *team*, it moves them up a notch.

But the investment question is not about the team's competence, which was never the issue — my own §6 said they build carefully. It is about whether the fatal risks have closed, and **none of them has.** Restated as true/false against `main`, today:

| Condition | T/F on `main` (7 Aug 2026) |
|---|---|
| The money ledger is transactional and the race is closed in code | **TRUE** (verified; empirical proof under real concurrency still owed) |
| CI exists and runs the money-integrity suite green | **TRUE** |
| `AUTH_SECRET` fails closed; self-serve uploads await review | **TRUE** |
| Fabricated ROAS is removed from the live brand report | **FALSE** — live, `lib/brand-report.ts:105` |
| The ad beacon is authenticated / CP is no longer `curl`-mintable | **FALSE** — live, unauth |
| Trophy gifting (money-transmission trigger) is deleted | **FALSE** — live, `lib/marketplace.ts:198` |
| An age gate exists at signup (children not paid/collected-from) | **FALSE** — live, none |
| A committed Discord policy opinion exists (Gate 1) | **FALSE** |
| A committed FinCEN/CVC opinion exists (Gate 1) | **FALSE** |
| Gate 2 is a *required* check that blocks a merge | **FALSE** — reports only, no branch protection |
| Node runtime is pinned so the money paths cannot break on deploy | **FALSE** — no `engines`, no `vercel.json` runtime |
| A signed IO for a measured product exists (Gate 4) | **FALSE** |

Eight of twelve still false, and the four that flipped to true are the engineering-hygiene tier, not the existential tier. **Re-open the file when the four Phase-0 items still live on `main` are fixed in code and the two legal opinions are committed artifacts.** Those are binary and cheap to check. Until then: a real and encouraging start on the one track that was always within their control, and no movement on the three findings that can each end the company.

The test I was engaged to apply is whether a remediation is a list of intentions. Last round it was entirely intentions. This round it is intentions **plus** a correctly-built money-integrity layer and a green CI — which is genuine progress, and is still not a reason to wire money, because the money-integrity layer was never the thing that made this a "do not invest."

### Addendum verifications
- Commits `d34af09`/`3a776c0`/`a6972d3` merged to `main` via PR #100 (`468f71e`); `main` code == `a6972d3` (empty diff).
- CI (Actions API): runs `31135578615`, `31158824551`, `31158857034` all `conclusion: success`.
- Money-path ordering read in `lib/db/tx.ts`, `lib/quests.ts:480-520`, `lib/marketplace.ts:239-268`, `app/actions/trophies.ts:161-181`.
- Still-live defects: `lib/brand-report.ts:105`, `app/api/ads/beacon/route.ts` (no auth), `lib/marketplace.ts:198`, `app/actions/auth.ts:11-53`.
- Node-version gap: no `engines` in `package.json`; `vercel.json` sets no runtime; `lib/db/tx.ts:57-62` throws without global `WebSocket`.
- Branch protection: not applied per `docs/PLAN.md` §5; PR #100 merged with CI green.
