# Response to the Adversarial Due-Diligence Report

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
> **The current truth, in this order:** the code, then `docs/SOURCE_OF_TRUTH.md`,
> then `docs/MODEL.md` and `docs/HANDOVER.md`. Where this file and the code
> disagree, the code is right and this file is history.

**Read `docs/DUE_DILIGENCE_REPORT.md` first.** This is our reply: what we accept
without argument, what we dispute and why, what we got wrong, and exactly what
we are doing about each finding, in order, with the gates that stop us
continuing if an answer comes back badly.

**We are not arguing with the verdict.** The report says the product sold does
not exist and the model as written does not close. Both are true. The parts we
dispute are narrow and none of them rescue the model.

---

## 1. Accepted without argument

These are correct, verified in our own code, and are being fixed.

| # | Finding | Our position |
|---|---|---|
| 1 | **Brand ROAS is computed from server headcount, not impressions** (`lib/brand-report.ts:105-115`) and labelled "Counted delivery" | **The most serious thing in the report.** It is live, a paying brand sees it, and it is a false statement to a customer. Off immediately. |
| 2 | **The ad beacon is unauthenticated and forgeable** (`app/api/ads/beacon/route.ts`) — they proved it live with a POST returning 200 | Accepted. CP is mintable with `curl`. Closed before anything else ships. |
| 3 | **No transactions anywhere**; `neon-http` cannot open one (`lib/db/index.ts:911`) | Accepted. Every ceiling, purchase and redemption is a read-then-write race. |
| 4 | **Trophy gifting creates a money-transmission trigger** | Accepted, and the cheapest fix in the report: deleting it removes the MTL trigger, the 1099 aggregation hole and the under-18 cash-out bypass at once. |
| 5 | **No age gate at signup**; DOB collected only at cash-out, which manufactures COPPA "actual knowledge" | Accepted. The 18+ gate exists and fails closed — it is in the wrong place. |
| 6 | **Missions are dead code** and four of their actions (`stat_levelup`, `play_session`, `challenge_progress`, `share_card`) **have no emitter** | Accepted. Ours. We built missions on actions nothing fires and checked only that they existed in the catalogue. |
| 7 | **Card rendering caps at ~200 daily gamers** (`lib/cards/budget.ts:23-27`) | Accepted. Our own B46 cost control throttles the inventory the model depends on. |
| 8 | **`AUTH_SECRET` has a hardcoded fallback** (`lib/auth.ts:7`) | Accepted. Must fail to boot instead. |
| 9 | **The privacy policy promises a 90-day purge that does not exist** | Accepted. Ship the job or change the policy — we ship the job. |
| 10 | **Riot: development key on a live product; terms prohibit contests** | Accepted. Production key with registration, or drop Riot. |
| 11 | **`maxCreativesInRotation` silently drops paying brands**; the bot-post surface serves `creatives[0]` only | Accepted — already filed as B65 before the report. |
| 12 | **Self-serve creative upload auto-launches with no approval** (`app/actions/brand-portal.ts:137`) | Accepted, and it contradicts our own written approval gate. |
| 13 | **Cookie consent is decorative; deletion leaves PII; IP salt defaults** | Accepted. |
| 14 | **No CI**; the one test guarding real money is vacuous (`tests/db/marketplace.mts:148` asserts a value that cannot be negative) | Accepted. |
| 15 | **Fill rate is missing from our break-even equation** | **Accepted — our error.** `revenue = screens × CPM/1000 × fill`. Everything we concluded without it was optimistic. |

---

## 2. Disputed, with reasoning

Four disputes. **None of them rescues the model** — we state them for accuracy,
not as a defence.

### 2.1 The $0.80 CPM applies a programmatic method to direct-sold inventory

Their build-up is: open-market CPM × supply-chain leakage × vertical index ×
long-tail × SIVT filtration. Every one of those multipliers is a property of
**programmatic exchange** buying. We sell **direct**, hand-sold sponsorships,
where there is no supply chain to leak, no exchange take rate and no long-tail
discount. Their own comparables table — which is in `COMMERCIAL_MODEL.md`
because we wrote it — puts community sponsorships at $5–15.

**Where they are nonetheless right:** the SIVT / MFA blocklist point is real and
it poisons direct sales too. Once a brand's verification vendor classifies our
traffic as incentivised, the classification travels between buyers and is close
to permanent. **That risk is a reason to stop paying for engagement in a way
that manufactures a 12% CTR — not a reason to accept $0.80.**

**Concession:** we cannot prove $5 either. Neither figure is evidence. The
honest position is that *nobody knows* until a real IO is signed, which is why
§4 makes a signed deal a gate rather than a milestone.

### 2.2 "Break-even is an identity, unreachable at any scale" is input-dependent

`CPM × fill ≥ $3.31` is arithmetic we accept. But it is only unreachable *given
their CPM*. Presented as an identity it reads as a law of nature; it is a
conclusion resting on a disputed input.

**Correction — the worked example we first wrote here was wrong, and wrong in
exactly the way finding #15 says we are.** We wrote "at $5 × 56% it clears".
$5 × 0.56 = **$2.80** against $3.31 of CP cost — a **loss of $0.51** per 1,000
screens. Break-even fill at $5 CPM is **66.2%**, above our own A5 assumption of
56%; put the other way, at 56% fill the required CPM is **$5.90**, above our sell
price and 48% above our $4 floor. We reproduced our own accepted error inside the
dispute meant to show we understood it. The reviewer caught it. **The dispute's
framing point stands — "unreachable" is a conclusion, not an identity — and the
only number we offered in support of it lands on their side, not ours.**

**The correct statement is that the model is extremely sensitive to
two numbers nobody has measured** — which is their §7D condition, and we accept
that condition entirely.

### 2.3 The 1,234× gap is not an independent finding

It is CPM 6.25× × screens 29.62× × fill 6.67×, multiplied. It reconciles because
it is the same three disputed inputs compounded, not three corroborating
observations. Presenting it as a headline overstates the independence of the
evidence.

### 2.4 Registered vs daily-active

Their 0.51 screens/gamer/day divides by **registered** accounts; our 15 was per
**daily-active** gamer. That single definitional switch is worth ~30× — the
largest term in their gap — and it is a modelling convention, not a fact about
the product.

**Their catch is fair**: our ladder table said "gamers" and did not declare which
denominator. That is our sloppiness and it is being fixed in the restated model.

---

## 3. Our own errors, stated plainly

Independent of the report's conclusions, these are things we got wrong and would
want on the record:

1. **Fill rate omitted from break-even.** The single most consequential error.
2. **Missions built on actions with no emitter.** We verified the catalogue
   contained them and never checked that anything fires them.
3. **`COMMERCIAL_MODEL.md` written in the present tense** for a backlog. A reader
   with no context reasonably concluded we were claiming shipped capability. Every
   unbuilt item now carries an explicit **NOT BUILT** marker.
4. **The ladder table did not declare its denominator.**
5. **B46's render cap was set as a cost control without checking it against the
   growth the commercial model assumes.** Two of our own documents contradicted
   each other and nobody noticed.

---

## 4. The remediation plan — five phases, with gates

**A gate means: if the answer is bad, we stop and re-plan rather than continue.**

### PHASE 0 — Stop the bleeding (immediate, days)

Nothing else proceeds until these are done. All are shipped defects with a live
customer or a live legal exposure.

| Item | Action |
|---|---|
| Fabricated ROAS | Remove media-value/ROAS from the brand report. Show delivered impressions, or say "not yet measured". Never a computed proxy presented as measurement. |
| Open beacon | Authenticate, sign, rate-limit, origin-check. No CP awarded from an unauthenticated call. |
| Trophy gifting | Delete. Removes the MTL trigger, the 1099 hole and the age-gate bypass. |
| Age gate | Move to registration. The check exists and fails closed; it fires too late. |
| `AUTH_SECRET` | Remove the fallback. Fail to boot without it. |
| Self-launching campaigns | Restore the approval gate the docs already promise. |

**Gate 0:** none of these may be deferred for a feature. They are the difference
between "early" and "misleading".

### PHASE 1 — The two existential questions (weeks, parallel, external)

Neither is an engineering task and neither is ours to answer alone.

| Question | What we need |
|---|---|
| **Does Discord permit this?** Third-party ads in a bot; paying cash-convertible points for engagement. Verification at 100 servers forces a human review. | A written read of the Developer Policy from counsel, and if the answer is no: a partner conversation with Discord, or a product that does not put paid creatives inside bot messages. |
| **Is paying cash for engagement regulated?** FinCEN CVC administrator status; state MTL; sanctions. | A FinCEN/state CVC status opinion. Gifting is deleted in Phase 0 specifically to make this opinion answerable "no". |

**Gate 1 — the real one.** If Discord's answer is no, the ad-placement business
inside Discord ends and the company is the sponsored-challenge business only.
**We do not build Phases 2–4 before this answer.** Everything downstream is
worthless if the landlord says no.

### PHASE 2 — Money integrity (only after Gate 1)

| Item | Action |
|---|---|
| Transactions | Move money paths to a pooled driver so a transaction is possible at all. |
| Ceiling race | Enforce the 500 cap inside a transaction with a row lock. |
| Double spend | `buyTrophy` and `requestRedeem` inside transactions. |
| Swallowed errors | No bare `catch {}` on a money path. A failure must be distinguishable from success. |
| Vacuous test | Replace the negative-balance assertion with a real concurrency test on the production driver. |
| CI | Type-check, lint and the suite on every push. |

**Gate 2:** a concurrency test proving the ceiling holds under parallel writes.
No CP feature ships before it passes.

### PHASE 3 — Measurement honesty, then delivery

Order matters: **we do not build delivery counting on a number we cannot trust.**

| Item | Action |
|---|---|
| What an impression IS | Define it, document it, and only count what meets the definition. Discord's count-on-post is not an IAB impression and must never be sold as one. |
| Delivery counting | Target + delivered per campaign, pacing, stop-at-target, frequency cap, no silent cutoff (B65). |
| Billing fields | `cpm` and `viewsTarget` on the campaign, so the $4 floor is enforceable. |
| Cache/ad separation | A cached card must not re-serve one brand or skip its count. |
| Invoicing and make-good | Under-delivery must have a remedy in the system, not in an email. |
| Reporting | Per placement, from logged rows only. |

### PHASE 4 — The model, restated and tested

| Item | Action |
|---|---|
| Restated economics | `revenue = screens × CPM/1000 × fill`, all three named. Every rung declares registered vs daily-active. Cost and revenue use the **same** engagement assumption. |
| Emitters | Build the four missing emitters before any mission ships. |
| The passive cap | Implement the active/passive flag and the 125 CP cap that `COMMERCIAL_MODEL.md` claims and the code does not have. |
| The 25-CP rule | Enforce it. `win_challenge` at 100 and `best_profile_award` at 100 break the guarantee today. |
| Render caps | Raise or scale B46's caps against the ladder. |
| **Instrument three numbers** | Real screens/gamer/day, real fill against a signed brand, real mission time-on-task. |
| **CPA test** | Price on verified entrants (`benchmarkCpe = $3.50` already exists — 70× the headroom of a display view). **One signed advertiser paying for measured actions.** |

**Gate 4:** one signed IO. Until an advertiser pays for something measured, the
CPM number is an opinion.

---

## 5. What we are not doing, and why

| Not doing | Why |
|---|---|
| Defending the $5 CPM | We cannot prove it. A signed deal proves it or kills it; nothing else does. |
| Building the sales console, brand portal or admin rebuild now | They serve a revenue model that has not cleared Gate 1. Building them first is the mistake the report is about. |
| Pivoting to CPA on paper | The CPA idea is their strongest constructive point, but a pivot announced without a signed deal is the same error in a new coat. |
| Chasing the 1,234× number | Disputed inputs compounded. We will have real numbers within a month of instrumenting. |

---

## 6. What changes in the documents

- `COMMERCIAL_MODEL.md` gains a **CURRENT STATE vs TARGET STATE** header, and
  every unbuilt mechanism is marked **NOT BUILT**. The report's §3.0 framing
  finding is fair and is our fault.
- The break-even equation is restated **with fill rate**.
- The ladder declares its denominator.
- `EXECUTION_PLAN.md` carries B72–B80 below, in the order above.

---

## 7. The honest summary

The report's verdict is that we built the wrong thing carefully. We think that
is right. The three findings we cannot argue with — Discord's policy, the
money-transmission trigger, and paying children — were all either flagged by us
as unassessed or missed entirely, and two of them can end the company
independently of any code we write.

**The order is: stop misleading anyone, then ask the two questions that decide
whether the business is legal and permitted, then fix the money, then measure,
then earn the right to sell.** Everything we filed before the report assumed we
were past that point. We were not.
