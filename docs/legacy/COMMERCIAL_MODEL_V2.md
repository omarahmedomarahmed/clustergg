# The Commercial Model, v2 — one package, four vaults

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

**Decided 7 August 2026. Supersedes `docs/COMMERCIAL_MODEL.md` entirely.**
**Revised after an execution review that checked every claim against the code.**

The old model sold views at a CPM we could not prove, against inventory that
shrank the moment we counted it honestly. This one sells a sponsorship priced on
things both sides can count, and funds every payout out of money that has
actually arrived.

---

## 0. What does not exist yet — read this first

The review's most valuable finding: this document described four things the code
cannot do. **Nothing here is buildable until these land.**

| # | The model says | The code says | Fix |
|---|---|---|---|
| **C1** | tomorrow's mission CP comes from the vault | `lib/missions.ts:4-9` — **a mission awards no CP of its own.** It is a view over actions the gamer already does. There is no dial. | §5.1 |
| **C2** | the price is a dial, nothing downstream changes | `lib/pricing.ts:90-93` — `prizePool: 175` and `prize1/2/3` are **fixed dollars**. `prizeSharePct()` derives the % *from* them. $350 → 50% by coincidence; **$400 → 44% silently.** | §2 |
| **C4** | "entrants from that server" | `challenge_participants` has **no `guildId`**. Attribution is derived from guild membership, so **one entrant counts for every server they are in.** Σ shares > 1. | §4.1 |
| **C5** | "member growth % vs last week" | `discordGuilds.memberCount` is one current integer. **No history table exists.** There is no last week. | §4.2 |

**C4 and C5 are collecting data we can never go back and get.** Every week
without them is a week of history that cannot be reconstructed. They ship first.

### Found on a second sweep — four more, one of them structural

| # | Issue | Severity |
|---|---|---|
| **C13** | **There are four pools and three vaults.** Prizes are **50%** — the largest line — and have **no vault, no ledger, and no liability tracking.** A prize is awarded as a trophy (`lib/trophies.ts:102`) and becomes cash only when redeemed, months later or never. The one pool big enough to sink us is the one nothing watches. | **Structural** |
| **C14** | **"50% goes to gamers" is not true, and cannot be.** A trophy pays out only on redemption, and `MIN_REDEEM_AGE = 18` (`lib/eligibility.ts:27`). Under a global-16 floor, **16–17-year-olds can win $100 and never collect it.** Unredeemed prizes stay with us. There is a fourth, unmeasured line in the split — breakage — and we are currently calling it a payout. | **High** |
| **C15** | **Nothing reconciles the $175 prize pool to the trophies actually awarded.** The pool is a number in `pricing.ts`; the prizes are trophy IDs chosen per challenge (`challenges.prizes`). Nothing checks they add up. A challenge can promise $175 and award $40 of trophies, or $400. | **High** |
| **C16** | **The model is weekly and there is no weekly cron.** `vercel.json` has hourly, daily and 5-minute jobs only. The pool, the winners, the payouts and the announced CP number all have no scheduler. *(Cheap fix: run it on the daily cron behind a day-of-week check.)* | Medium |

**C13/C14/C15 together:** the prize half of every dollar is unvaulted,
unreconciled, and partly never paid. **Add a fourth vault — the prize vault —
with the same screen as the others**, holding awarded-but-unredeemed value as an
explicit liability, and reconcile trophy value against the pool at award time.

**One piece of good news from the sweep:** `dailyCpCeiling` is genuinely
settings-backed (`lib/quests.ts:435-443`), so C1's fix has a real hook and needs
no new plumbing.

### Also contradicted, less fatal

| # | Issue |
|---|---|
| **C3** | `ownerPctFor` lives in **four** places, not one: `server-earnings.ts:86,160`, plus `pricing.ts:361-413` `EARN_STAGES_DEFAULT` — the live `/servers` page promising "25% of every sponsored challenge". Delete one and the public page still promises it. |
| **C6** | `SLOTS_PER_CAMPAIGN = 4` with `Math.max(4, slots)`. **1–3 challenges is not expressible.** |
| **C7** | A campaign is one game × 4 sequential weeks. **Mixed-game packages have no row shape.** |
| **C8** | `finance.ts` `sponsorsUseHouseInventory: true` — "the prize was already funded". **The two models double-count $175 per challenge.** |
| **C9** | `lib/cp-rate.ts:38-40` justifies 10,000 CP/$1 on ad revenue covering CP 5×. **Free ads make that revenue $0 and void the stated basis.** |
| **C10** | `abuse.ts:34` `PAYOUT_HOLD_DAYS = 30`. A week-1 winner is paid in week 5. "Weekly pool" is false for every new owner. |
| **C11** | `reachBase`, `challengeBase`, `ultimateBase`, `yearlyDiscountPct`, `streamAddon` still price the live `/pricing` page. |
| **C12** | **"Expected active gamers" is undefined.** `cp-economics.ts:51 dailyActive = 0.35` is a calculator assumption, not a measurement. |

---

## 1. What a brand buys

One product. No option to buy views alone or challenges alone.

| | |
|---|---|
| **Challenges per brand per month** | 1–4 *(needs C6 fixed — the code floor is 4)* |
| **Games** | any mix *(needs C7 — no row shape for mixed games today)* |
| **Ad placements** | **included free**, self-serve upload |
| **Price** | one price per challenge, no variants |
| **Reported** | entrants (counted) **and** cards delivered (counted) |

### Pricing the range

1–4 is a 4× swing in revenue per brand, and every vault funds off it. So:

| | |
|---|---|
| 1 challenge | **trial**, self-serve card checkout only. A $350 deal cannot carry a salesperson. |
| 2–4 | **monthly commitment** |

**ARPA falls and the raise model has not been told.** `finance.ts` assumes
`revenuePerBrand: 1500`. Four at $350 is $1,400; a brand averaging two pays
$700. **25 brands: $37,500/mo → ~$17,500/mo.** Restate it.

### What a brand asks that we cannot answer

| Gap | |
|---|---|
| "How many will see it?" | Banning estimates on the *report* left nothing for the *quote*. **Sell a contractual floor** — "minimum N servers, M entrants, or we make good". A guarantee is a commitment, not an estimate. |
| Brand safety | Whose servers does my logo appear in? No standard, no exclusion list. |
| Category exclusivity | Can a competitor buy the same game the same week? No answer. |
| Creative SLA | `pending_review` exists with no stated turnaround. |
| Contract, VAT, W-8/W-9, PO | Skippable at $350 self-serve. Not at 4/month. |
| **Recap asset** | A brand needs something to take back to their team. The winners card already renders; add entrant counts and a one-page PDF. Near-free, and it is what gets renewed. |

---

## 2. The split

Every challenge splits by **percentage**, never fixed dollars.

| Line | % | At $350 |
|---|---|---|
| Prize pool → gamers | **50** | $175 |
| **Cluster revenue** | **20** | $70 |
| **Server pool** | **15** | $52.50 |
| **CP vault** | **15** | $52.50 |
| | **100** | $350 |

> ⚠️ **C2 must be fixed first.** `prizePool` is $175 hard-coded and the split is
> *derived* from it. Until prizes are a percentage, moving the price silently
> changes the prize share and every pool below it.

### Who gets the 20

Prizes fixed at 50. The other 50 splits three ways; one holds 20, two hold 15.

| Preset | Cluster | Servers | Gamers |
|---|---|---|---|
| **Default** | **20** | 15 | 15 |
| **Grow servers** | 15 | **20** | 15 |
| **Grow gamers** | 15 | 15 | **20** |

| Editing | |
|---|---|
| Switching preset | ordinary admin action |
| By hand | **danger zone** — typed confirmation, audit row, reason |
| Rule | **must total 100** or it will not save |

Separate from vault transfers: the split allocates *new* money; transfers move
what is already there.

---

## 3. The four vaults

No pool pays what it did not receive.

| Vault | Fills | Pays |
|---|---|---|
| **Prize vault** | **50%** | challenge winners, **on redemption** |
| **Server pool** | 15% | 10 winning servers, weekly |
| **CP vault** | 15% | the daily mission |
| **Cluster revenue** | 20% | us |

**Four vaults, not three.** The prize pool was left out of the original design
and it is the biggest line. It behaves differently from the others and that is
exactly why it needs watching: money enters when a challenge is sold, and leaves
only when a winner **redeems** — which may be months later, or never, because
under-18s cannot redeem at all. Its balance is a **liability**, not a surplus.

**Transfers both ways, always logged** — admin, reason, timestamp.

**Money enters a vault on challenge COMPLETION, not on payment.** A chargeback
after payout leaves a negative vault with no rule; the hold period is the fix.

### Every vault screen

| | |
|---|---|
| **The big number** | balance, centre |
| Inputs | inflows by challenge, outflows by payout |
| **History** | every in and out, dated, attributed |
| **Transfer** | fund or draw, reason required |

### Rules that keep vaults honest

| Rule | |
|---|---|
| **Sweep** | CP vault above **8 weeks' runway** returns to Cluster revenue, automatically, as a logged transfer. Without this the vault fills forever and never drains. |
| **Under-filled slots** | If fewer servers qualify than slots, **redistribute pro-rata among filled slots.** Never leave money with no destination. |
| **Payout floor** | **$25.** Below it, accrue and carry. A $7.88 payout costs more in fees than it delivers. |
| **Prize reconciliation** | At award time, the value of the trophies handed out must reconcile to the prize pool that funded them. Nothing checks this today. |
| **Breakage is named, not banked** | Unredeemed prize value is reported as its own line. It is **not** revenue until a stated expiry, and we do not build the model on it. |

### The growth law nobody had written down

**One brand at 4 challenges/month funds 140 gamers at 500 CP/day, or 1,400 at
the 50 CP floor.**

| Daily-active gamers | At 12 challenges/month |
|---|---|
| < 4,200 | vault funds the floor — solvent |
| 4,200 | vault exhausted; Cluster revenue subsidises |
| 9,800 | **Cluster's entire 20% consumed. Revenue $0.** |

**We need roughly one brand per 1,400 daily-active gamers just to hold the
floor.** That is the constraint the whole company runs on.

---

## 4. The server pool

**Tiers are size labels only.** All owner money comes from the weekly pool.

> ⚠️ Delete the `ownerPctFor` payout path in **all four places** (C3), including
> the public `/servers` ladder copy, or we pay twice and promise twice.

### 4.1 Scoring — qualified, exclusive, per-capita

The first version paid cash for member counts, which is the one thing that costs
$5 to fake. This version pays for things that cost real effort. **All four terms
percentile-ranked within tier**, so one outlier cannot own the pool.

| Term | Weight | Why |
|---|---|---|
| **Exclusive-weighted entrants** — each entrant counts **1/k**, k = participating servers they belong to | **40** | Fixes C4. Mass-inviting other servers' gamers yields ≈ 0. Kills the cheapest attack. |
| **Newly *qualified* linked members** — existing `QUALIFY_AFTER_DAYS` + verified game account | **25** | Cannot be bought, and `abuse.ts` already has the anomaly detector. **Replaces growth %.** |
| **Engaged card opens per active member** — max 1/gamer/day, only if followed by an action | **20** | Removes the render-spam mint. |
| **Entrant conversion rate** — entrants ÷ linked members | **15** | The genuinely size-neutral term. This is what a small server should win on. |

**Growth % is removed.** A 20-member server buying 20 members scored +100% and
topped its tier for $5.

### 4.2 Data that must exist before week 1

| Needed | Status |
|---|---|
| `challenge_participants.guildId` | **does not exist** (C4) |
| Weekly guild snapshot — member + qualified-linked counts | **does not exist** (C5) |
| Vault ledger table | does not exist |

**Unbackfillable. Ship before anything that scores.**

### 4.3 Slots, decay, and the tail

| | |
|---|---|
| Default | 6 small / 2 mid / 2 large, must total 100% |
| **Slots ∝ tier population** | pay the **top 20% of each tier**, so competitor count is normalised |
| **Decay, not cooldown** | score × `1/(1 + 0.25 × wins in last 8 weeks)`, floored at 0.5. A dominant server still wins, declining. No cliff to game. |
| **Participation floor** | **20% of the pool paid flat** to every server that carried ≥1 challenge that week. The other 80% is the competition. |

Why the flat 20%: showing a pool you cannot reach is a taunt. A pool **plus a
small cheque** is a ladder. The 90% who never win are the ones who decide
whether the bot stays installed.

> **Boundary problem, named:** a 499-member server competes with 20 peers for 6
> slots; a 501-member one competes with 3 for 2 bigger slots. Crossing a
> boundary beats any in-tier effort. Proportional slots is the fix.

> **C10:** `PAYOUT_HOLD_DAYS = 30` means a week-1 winner is paid in week 5. Say
> "earned weekly, paid after the 30-day hold" everywhere, or change the hold.

### 4.4 What owners see

| | |
|---|---|
| This week's pool | every owner, including those who cannot yet win |
| Live dashboard | rank in tier, and what moves it |
| Per challenge | entrants attributed to them |

---

## 5. The CP vault

**Before:** 500 CP/day promised, funded by nothing.
**Now:** a budget.

### 5.1 How the number is delivered — C1

A mission awards no CP. Three ways to make it pay; only one is safe.

| Mechanism | Verdict |
|---|---|
| Mission-completion bonus | **No.** `missions.ts:7-9` — the moment a mission pays, the ceiling stops being the ceiling and exposure doubles. |
| Scale every action weight | **No.** Breaks the 125-per-quest invariant and drags `win_challenge`/`connect_account` along. |
| **Set `dailyCpCeiling` (already admin-editable) and scale only mission-eligible weights under it** | **Yes.** The ceiling stays the hard bound. |

**Gamers are told "up to X today"** — it is a cap, not a payment. A gamer who
does 3 of 8 tasks earns less, and the copy must not pretend otherwise.

### 5.2 The number is weekly, announced, bounded

Recomputing daily was wrong: it swings 7×, oscillates activity, and lets a
server owner time a launch to dilute everyone.

| | |
|---|---|
| **v1** | **Fixed number.** The vault balance is the *signal*, not the formula. Below 8 weeks' runway, admin lowers it deliberately. |
| **At ~50 servers** | 7-day trailing inflow ÷ 28-day trailing actives, recomputed weekly, clamped ±20% week-over-week |
| **Non-negotiable** | announced a week ahead · never retroactive · never mid-streak |

### 5.3 The dilution problem, named

A big server joining triples actives and cuts everyone's earnings 3× overnight.
The existing cohort did nothing and is punished for growth. A weekly, announced,
clamped number is what stops our two constituencies' interests opposing each
other exactly when we grow.

### 5.4 CP minted outside the vault

`win_challenge` 100, `best_profile_award` 100, `connect_account` 50, `ad_click`
25×3, `ad_impression` 1×25 all fire regardless of vault balance.

**"The vault funds the mission" bounds nothing unless the vault sets the
CEILING, not the mission.** That is what 5.1 does.

### 5.5 What a gamer costs now — C9

Ads were the stated justification for the CP rate. **Ads are free now, so CP is
pure cost of goods against sponsorship revenue: exactly 15%.** That is a
defensible number. Say it out loud in `lib/cp-rate.ts` — today it is an
accident.

---

## 6. Unanswered until now

| Question | Answer |
|---|---|
| **Live owners promised 5/10/25% on a public page** | **Honour accrued earnings.** Announce before changing. An owner who reads "25% of every challenge" Monday and "you might win $7.88" Tuesday is gone. |
| **In-flight $250 4-slot campaigns** | **Run to completion.** Re-pricing a signed thing costs more than the revenue. |
| **Who funds free and trial challenges?** | Under "no pool pays what it did not receive," a free challenge has **no prize pool**. Cluster revenue funds it, as a logged transfer, or it does not run. |
| **Refunds and chargebacks** | Money enters the vault on **completion**, not payment. |
| **Ten weekly payees** | 1099 territory at the large tier ($2,048/yr). Ten payees × 52 weeks, MENA, withholding, currency. **Unscoped.** |
| **"Expected active gamers"** | Undefined (C12), and it is the denominator of everyone's pay. Define it before it decides anything. |
| **Does free-ads help Gate 1?** | **Yes, and nobody had said it.** If Discord bans paid third-party creatives, V2 loses a **free feature, not revenue.** Put that to the lawyer — the question may have got easier. |

---

## 7. What this changes

| | Before | Now |
|---|---|---|
| Price | $250 | **$350**, one format, a dial |
| Packaging | 4 per game | **1–4 per brand**, any mix |
| Ads | sold | **included free** |
| Server owners | % of each challenge | **weekly pool + 20% flat** |
| Gamers | fixed 500/day | **weekly announced number from a vault** |
| Views | the product | **proof of work** |

### Rewrites required

Public pricing/brands/servers/discord-bot/home · gamer quests/marketplace/wallet/onboarding · **brand portal** · **server portal** · every bot card stating a CP number or price.

---

## 8. Admin

**48 sections, built for a product we are leaving. Full rewrite — AFTER the
platform is proven.** Until then admin gets only: the three vault screens, the
slot editor, the engagement dashboard.

Purge candidates, to confirm against real staff use: `creative-studio`,
`brand-kit`, `backgrounds`, `spaces`, `game-worlds`, `mobile`, `chrome`,
`shots`, `translations`, `language`, `dataroom`, `cp-calculator`,
`growth-review`, `partners`.

`/admin/users` and `/admin/linked-accounts` stay admin-only. Always.

---

## 9. Everything is a dial

| Setting | |
|---|---|
| Challenge price | admin |
| Which pool holds the 20 | admin, one switch |
| The four percentages | admin, **danger zone**, must total 100 |
| Slot shape | admin, must total 100% |
| Score weights | admin |
| Daily CP number | admin, **announced a week ahead** |
| Sweep threshold, payout floor | admin |
| Prize breakage expiry | admin, **danger zone** |
| Vault transfers | admin, with a reason |

No number in this document is a constant in the code.
