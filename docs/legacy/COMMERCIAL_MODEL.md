# ClusterGG — The Commercial Model *(SUPERSEDED)*

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

> # ⚠ THIS DOCUMENT IS SUPERSEDED
>
> **`docs/COMMERCIAL_MODEL_V2.md` is the model. This one is kept as a record of
> what we used to believe, and of five specific errors — because a document that
> is quietly deleted teaches nobody anything, and the errors below are the exact
> shape of mistake this company is most likely to make again.**
>
> B78. Every figure in this file should be read as **HISTORICAL**.
>
> ## What was wrong with it
>
> | # | The error | What v2 does |
> |---|---|---|
> | 1 | **Fill was missing from break-even.** `revenue = screens × CPM/1000 × fill` — and the fill term was simply absent from our arithmetic. Ours, not a dispute. Every revenue figure below is therefore an upper bound that assumed we sold 100% of inventory. | v2 does not sell inventory by volume at all. |
> | 2 | **Registered vs daily-active was never declared.** Rungs quoted "1,000 gamers" without saying which, and the switch between the two readings is worth roughly **30×**. Every table in this file is ambiguous in the direction that flatters it. | `lib/active-gamers.ts` defines it — credited CP that day — and measures it. |
> | 3 | **Cost and revenue used different engagement assumptions**, in the same paragraph. Cost was modelled on a maximal gamer; revenue on an average one. | v2 states the worst case and the forecast as two numbers and never reports them as one. |
> | 4 | **Unbuilt mechanisms were described in the present tense.** A reader could not tell which parts existed. | v2 §0 lists all sixteen, each with the file and line that contradicted it. |
> | 5 | **The view definition was a multiplier.** A card in a 4,000-member server counted as 4,000 views. | `docs/AD_VIEW.md`: one card, one view, no multiplier. **The inventory number gets much smaller, and honest.** |
>
> ## What the numbers become on the honest definition
>
> The headline below reads "$500/month for 100,000 views" at a $5 CPM. Under
> one-card-one-view, 100,000 views is 100,000 delivered cards — not 25 public
> posts into 4,000-member servers. At 1,000 daily-active gamers opening 15
> screens a day that is ~450,000 cards a month, so the inventory claim survives
> the redefinition; **what does not survive is any figure that reached its total
> by multiplying a post by an audience.**
>
> That is the one thing worth carrying forward from this document: it was not
> wrong because the ambition was wrong. It was wrong because five assumptions
> each moved a number in the flattering direction, and nothing in the file made
> any of them visible.

---

**Status: the pivot.** Everything before this document treated the bot, the
quests and the ad slot as three features. This document treats them as one
machine: *gamers are paid to use Discord, brands pay for the attention that
creates, and the arithmetic between those two facts is the company.*

Nothing in here is a preference. Every number is either measured, derived from a
number that is measured, or explicitly marked as an assumption to be tested.

---

## 0. The one-paragraph version

A gamer who does 20 things on Cluster in a day earns 500 Cluster Points, worth
**5 cents**. Doing those 20 things requires opening at least 15 screens, and
every screen carries one brand's creative. A brand pays **$500/month for 100,000
views** — a $5 CPM, which is the market rate for a community-embedded gaming
placement. At 1,000 daily gamers that is 450,000 views a month: four brands,
$2,000 of revenue against $1,500 of points paid out. The business is the gap
between the cents paid to gamers and the cents collected from brands, and every
rule below exists to keep that gap positive at any scale.

---

## 1. The unit economics

### 1.1 Cost

| | |
|---|---|
| Exchange rate | **10,000 CP = $1** |
| Daily ceiling per gamer | **500 CP = $0.05** |
| Per gamer per month | **$1.50** |
| 1,000 daily gamers | **$1,500/month** |

The ceiling is **fixed at 500**. Lower is not worth a gamer's time; the product
stops being interesting. It is `quests.dailyCpCeiling` in settings and it is the
one number that must never be changed casually.

**CP is a liability, not a cash cost, until it is redeemed.** A $0 trophy costs
nothing to award. Worst case — 100% redemption at full value — is the number
above, and it is the number to plan against.

### 1.2 Revenue

| | |
|---|---|
| Package | **$500/month = 100,000 views** |
| Implied CPM | **$5.00** |
| Hard floor | **$4.00 CPM** — the admin must refuse to save below it |

**A "view" is one screen carrying one brand's creative** — a Discord card *or* a
web page, rail or banner. One campaign buys all surfaces; the brand sees one
total, broken down by placement.

### 1.3 The equation the whole company runs on

```
minimum views per gamer per day  =  50 ÷ CPM
```

Because the gamer costs 5 cents and each view earns CPM ÷ 1000.

| CPM | Views/gamer/day needed to break even |
|---|---|
| $10 | 5 |
| $6.67 | 7.5 |
| **$5** | **10** |
| $4 | 12.5 |
| $3 | 17 |
| $2 | 25 |

**We sell at $5, so we must deliver 10. We design for 15.** At 15 the margin is
50% and there is room to be wrong about behaviour.

### 1.4 Where the $5 comes from — it is NOT derived from our costs

CPM is a market price. Our costs set the **floor** we can accept; the market
sets the **ceiling** we can charge; the gap is the business.

| Comparable | Typical CPM |
|---|---|
| Generic web banners | $0.50 – $2 |
| Gaming-site display | $2 – $5 |
| **Discord / community sponsorships** | **$5 – $15** |
| Newsletter sponsorships | $20 – $50 |
| Influencer placements | $10 – $30 |

Our inventory is a full-width branded card inside a gaming community, shown to a
gamer with a *verified game account attached*. That belongs in the community
sponsorship band, and $5 is its floor.

**Three things hold us at the bottom of that band today, and all three are true:**
we cannot prove viewability inside Discord; we are new and have no case studies;
the format is unfamiliar to buyers. **Three things will lift us later:** results
from the first cohort, verified-audience targeting nobody else can offer, and
sponsored-challenge participation data that proves action rather than exposure.

---

## 2. THE GUARANTEE — why 15 screens is arithmetic, not hope

This is the mechanism the entire model rests on. It has three parts and all
three must hold.

**Part 1 — no action pays more than 25 CP.**
Therefore 500 CP is always **20 actions**. There is no shortcut, no single
high-value action that empties the day's allowance in one click.

**Part 2 — at most 125 CP a day may come from PASSIVE actions.**
Passive means it happens without the gamer opening anything: a follower arrives,
a gift lands, a stat rises because they played their game, someone views their
profile. 125 ÷ 25 = **5 passive actions maximum**.

**Part 3 — therefore at least 375 CP must come from ACTIVE actions.**
375 ÷ 25 = **15 actions that require opening a screen**.

```
500 CP earned  ⟹  ≥15 screens opened  ⟹  ≥15 brand impressions
```

**This closes the hole that would otherwise sink the model:** a gamer collecting
500 CP by winning one challenge and letting followers accumulate, having opened
five screens. At 5 screens the break-even CPM is $10 — above the market ceiling
— so that scenario is not a thin business, it is *no* business. The passive cap
makes it impossible.

### 2.1 Active vs passive — the classification

| Passive (no screen) | Active (needs a screen) |
|---|---|
| gain a follower | join a challenge |
| someone votes for your profile | move your score in a challenge |
| every 25 profile views | share a card |
| receive a gift | redeem a trophy |
| a tracked stat rises | send a gift |
| land a tracked match | vote on a bot list |
| | add the bot to a server |

Every action in `ACTION_CATALOG` carries this flag. The mission validator and
the CP ledger both read it.

### 2.2 What this forces on the missions

A mission must contain **at least 15 active tasks** out of its 20 actions. Two of
the four shipped templates fail this today and are rebuilt. The validator
refuses to launch a mission that breaks it, exactly as it already refuses one
that does not total 500.

---

## 3. Scaling — growth is SOLD, never gifted

The failure mode: 10× the gamers, same brands, same price. Their views 10×, our
cost 10×, our revenue flat. **Doubling a brand's views for free turns profit
into loss**, because our cost doubles with the gamers.

| At 2,000 gamers | Double their views | Sell the growth |
|---|---|---|
| Views available | 900,000 | 900,000 |
| Brands | 4 (200k each) | 8–9 |
| Revenue | **$2,000** | **$4,500** |
| Cost | $3,000 | $3,000 |
| **Result** | **−$1,000** | **+$1,500** |

### 3.1 The loyalty bonus — affordable, and admin-controlled

A **25% bonus** on a brand's package, grantable by admin **to any brand at any
time**, for any reason: loyalty, a make-good, a competitive save, a launch
sweetener. It is a per-campaign field, it shows in the brand's report as a
bonus, and it is bounded so it cannot be given away accidentally.

At 2,000 gamers: four existing brands at 125,000 views each (500,000 used),
400,000 remaining sells as four new brands. **Revenue $4,000, cost $3,000,
profit $1,000** — the warm gesture, still profitable.

### 3.2 One package, for as long as possible

**Stay on the single $500 / 100,000 package until BOTH are true:**

1. inventory has been **>80% sold for two consecutive months**, and
2. an existing brand has **asked for more**.

Until then one package is genuinely better: easier to sell, easier to service,
and every brand gets a comparable result you can point at.

**Tier 2, when it is time: $2,000 = 500,000 views ($4 CPM).** The upsell
conversation is *"you have had 100,000 a month for six months; here is five
times that for four times the price"* — they ask us.

**Tier 3, much later: $7,500 = 2,000,000 views ($3.75 CPM).**

### 3.3 The ladder

Brand count grows slowly; deal size grows fast. Nobody sells a million-user
platform in $500 chunks.

| Gamers | Views/month @15 | Inventory value @$5 | Realistic shape |
|---|---|---|---|
| 1,000 | 450,000 | $2,250 | 4 brands × $500 |
| 10,000 | 4,500,000 | $22,500 | 10 brands × $2,000 |
| 100,000 | 45,000,000 | $225,000 | 30 brands × $7,500 |
| 1,000,000 | 450,000,000 | $2,250,000 | ~100 brands + programmatic fill |

**Cost scales linearly with revenue** — the ratio is the same at every size. Scale
is not the risk. **Fill rate is.** Unsold inventory shows a house creative: zero
revenue, full CP cost.

---

## 4. The three products

**1. Sponsored challenges — the lead product.**
Flat fee plus prize pool. Measured in entrants and completions, which are real,
logged and undeniable. Highest ARPU, and the only thing here no other Discord
product can sell. A big server takes a revenue share.

**2. Ad placements — the floor.**
$500/month for 100,000 views across Discord cards and web surfaces. Covers the
CP liability and makes the daily mission possible.

**3. Programmatic / affiliate fill — the remainder.**
Unsold share, filled automatically at lower rates. Turns the default state
(house ad, zero revenue, full cost) into a margin.

---

## 5. What has to change in the product

### 5.1 The CP catalogue

- **`ad_click` drops to 0 CP.** Paying for clicks manufactures a ~10% click rate.
  Real display is 0.05–0.35%. A 10% CTR with no conversion is the signature of
  incentivised fraud: it gets us discounted to nothing by buyers and delisted by
  networks. **This is the single most reputation-damaging line in the old table.**
- **Passive actions capped at 125 CP/day**, enforced in `awardQuestAction`.
- **Every action flagged active or passive.**
- **Posts, comments and reactions retired** — already at weight 0.

### 5.2 The ceiling behaviour

Past 500 CP, an action is **still logged** with `cp: 0` and a stored reason of
`daily_cap_reached`. The quest ledger and the wallet page render it as
*"Clicked an ad — daily maximum reached, no points added"* with the reset time.
The row is what proves to a gamer that we saw what they did.

### 5.3 Ad serving — the biggest gap

Today: `index = hash(card) % brandCount`. Uniform assignment, no budget, no
pacing, no frequency cap, and `maxCreativesInRotation` silently drops paying
brands. **We cannot currently deliver a promised number of views to anybody.**

Required:

1. **Delivery counting.** Each campaign has a views target and a delivered
   counter. Serve whoever is furthest behind pace. Stop at target.
2. **Seed on gamer + card**, so one gamer cycles through every brand rather than
   hitting the same one by hash luck.
3. **Frequency cap** per gamer per brand per day — brands buy reach, and
   frequency without reach is worthless and looks fraudulent.
4. **No silent cutoff.** A brand past the rotation limit is queued and disclosed,
   never invisible.
5. **Cache/ad separation.** Cards are cached with the ad baked in, so a cache hit
   re-serves the same brand and may not log the impression. Either cache without
   the ad and composite at serve time, or key the cache by brand.
6. **Billable-impression cap per gamer** — display freely, bill up to N, so
   command-spamming cannot inflate a brand's delivered count.
7. **Category exclusivity** — a game brand must not appear beside its direct
   competitor.

### 5.4 The social purge

Posts, comments and reactions leave the product. Not just the quest actions —
the feature, its pages, its stored rows. **Following, messaging and gifting
stay.** This is a deliberate scope reduction: the platform is a competition and
earning layer, not a social network.

---

## 6. Admin — a full rebuild, around selling

The admin console was built to administer features. It now has to run a
commercial operation. **Everything that does not serve that is purged.**

### 6.1 The sales cockpit (new)

The screen a salesperson opens every morning:

| Panel | Answers |
|---|---|
| **Live inventory** | Views available this month, sold, unsold, % filled |
| **Headroom** | *"You can take N more brands"* — computed, never guessed |
| **The alert** | *"We crossed 100,000 spare views/month — sell one more package"* |
| **The brake** | *"We are oversold. Do NOT take another brand."* |
| **Per-brand delivery** | Bought / delivered / pace / days left / at risk |
| **Gamer health** | Daily actives, views per gamer per day, mission completion %, streak distribution |
| **Money** | CP paid out, revenue booked, margin, break-even CPM at today's behaviour |

**The alert is the point.** Sales must never be free to sell what we cannot
deliver. Every extra ~100,000 monthly views unlocks exactly one more $500
package, and the console says so.

### 6.2 Danger zones (new)

A permanent panel, red when true:

- Oversold — promised views exceed projected inventory
- Views per gamer below 10 (below break-even at $5)
- Fill below 50%
- CP payout growing faster than revenue
- Any campaign under the $4 CPM floor
- A brand more than 20% behind pace with under a week left
- Mission completion collapsing (gamers giving up)

### 6.3 Brand creation and onboarding (new)

1. Sales creates the brand in admin: name, contact, package, start date.
2. System generates the **brand key** and portal link.
3. **Automatic email** with the key, the link, and what to do next.
4. Brand self-serves from there.

### 6.4 Email (new)

Templates for: brand created, campaign approved, campaign live, invoice issued,
invoice overdue, campaign ending, monthly report ready. Plus **bulk send** to a
segment, and a **custom one-off** to a single brand. Every send logged against
the brand.

### 6.5 Everything else in admin

Rebuilt around: gamers, servers, challenges, trophies, CP economy, missions,
brands, campaigns, money. Purged: anything social, anything redundant, any page
that exists because a feature once existed.

---

## 7. The brand portal — full self-serve

### 7.1 Onboarding
Key from the email → set a password → they are in. No human step.

### 7.2 Campaign builder
- Name, dates, package, targeting
- **At least one creative required to launch**; more can be added later
- Live preview on a real card
- **Live expectations, computed from the real platform right now:**
  *"Cluster currently has 1,240 daily gamers averaging 16 screens each. Six
  brands are live. Your $500 buys 100,000 views; at today's volume that
  delivers in about 22 days."*
- Submit → **admin approval required** → live
- **Invoice generated at go-live**, emailed automatically

### 7.3 Reporting — per placement, not one lump

The data already exists: every impression is logged with
`pagePath: "discord:card:<kind>"`.

```
Discord — challenge cards      18,400
Discord — profile cards        12,900
Discord — leaderboard cards     9,100
Discord — marketplace cards     4,200
Website — sidebar rail         21,000
Website — header banner         9,400
                               ──────
                        Total  75,000  of 100,000 bought
                               Pace: on track · 9 days left
```

Plus: unique gamers reached, servers reached, and — for sponsored challenges —
entrants and completions.

---

## 8. The public website

**New pages:**
- **For brands** — the commercial offer, the packages, live platform numbers,
  case studies from seeded demo data
- **Live numbers** — daily gamers, cards delivered, servers, challenges run.
  Public, honest, updated. This is the credibility asset.
- **Sponsored challenges** — the lead product, explained
- **The daily mission** — what a gamer earns and how

**Edited pages:** every page that describes the platform as a social network;
every page that states old CP prices; pricing pages carrying the old model.

---

## 9. Screenshots — component-level, not full-page

The decision stands: **real platform screenshots, from seeded demo data,
because we show what we claim before anyone signs up.**

What changes: the capture must be able to shoot **one component**, not a whole
page — a brand campaign card, a server earnings panel, a mission band, a
rendered bot card. Full-page shots are unusable in a marketing layout and go
stale the moment anything above them moves.

Seeded demo data must cover the whole case study: a brand with a live campaign
and a report, a server with earnings and a payout, a gamer with a streak and a
trophy, a challenge with standings, a mission mid-completion.

---

## 10. Every assumption, marked

Because the numbers above are only as good as these, and a due-diligence reader
should attack them first.

| # | Assumption | Confidence | How it gets tested |
|---|---|---|---|
| A1 | 15 screens per gamer per day | **Guaranteed by §2** — if the passive cap holds | Measure from launch |
| A2 | $5 CPM is achievable | **Assumption** — market comparables, no signed deal | First three brands |
| A3 | Gamers want 5 cents/day enough to do 20 things | **Untested** | Mission completion rate |
| A4 | Redemption is below 100% | **Assumption**, conservative direction | Redemption ledger |
| A5 | Fill rate above 56% | **Assumption** — sales capability | Monthly |
| A6 | Cards get seen by more than the person who typed | **True but unmeasurable** — upside not counted | Never; excluded on purpose |
| A7 | Discord permits incentivised bot engagement at scale | **Platform risk** — unmitigated | Legal/ToS review |
| A8 | Paying gamers is not a regulated activity in target markets | **Legal risk** — unmitigated | Counsel |

**A7 and A8 are the two that can end the company and neither has been assessed.**

---

## 11. The rules, in five lines

1. **500 CP a day. Fixed.**
2. **At most 125 of it passive** → guarantees 15 screens.
3. **$500 = 100,000 views ($5 CPM). Never below $4.**
4. **Brands we can take = monthly views ÷ 100,000.** Computed, never guessed.
5. **Growth is sold, not gifted.** Bonus 25% max, admin-granted, per brand.
