# ClusterGG — The Live Plan

**Updated 7 August 2026. All owner decisions are made. This is the whole
remaining build, in order, with the gates that stop it.**

`docs/EXECUTION_PLAN.md` (4,700 lines) is the *record* — every decision and
correction since the beginning. This file is the *plan*: what is left, why it is
in this order, and where we know we are weak.

---

## READ THIS FIRST — what we want from you

**You are being asked to attack this plan.**

If you are the reviewer who wrote `docs/DUE_DILIGENCE_REPORT.md` and the two
rounds of `docs/DD_RESPONSE_REVIEW.md`: every round has been right and every
round changed the build. Round 1 killed a business model. Round 2 found an
arithmetic error inside the very dispute where we claimed to understand round 1,
then found a bug our own fix had introduced. Keep that standard.

If you are new: read `docs/DUE_DILIGENCE_REPORT.md`, then `docs/DD_RESPONSE.md`,
then both rounds of `docs/DD_RESPONSE_REVIEW.md`. **Do not take a claim in this
file on trust** — several claims in our documents have been wrong, and every one
was caught by someone reading the source instead of the prose.

**What is most useful, in order:**

1. **Break something specific.** A `file:line` beats a paragraph of concern. If a
   step is out of order, unnecessary, or depends on something that does not
   exist, name it and name the dependency.
2. **Where we could do better, give 2 or 3 REAL PATHS — not one recommendation.**
   Name the trade-off on each, say which you would take, and say what would make
   you switch. One recommendation is easy to accept without thinking; three force
   a choice. We would rather have your second-best option written down than never
   know it existed.
3. **Tell us what we are not asking.** The expensive mistakes here were never
   wrong answers — they were questions nobody put on the list.
4. **Say plainly where we are still fooling ourselves.**

**Attack §3 (B81/B82) hardest.** It is the direct successor to the fabricated
ROAS you killed.

---

## 1. Where we are

### Shipped — and note WHERE, because we got this wrong

The reviewer caught this and was right: an earlier version of this table said
"merged to `main` and live" for commits that are **branch-only**. `main` is
`468f71e` and contains only `3a776c0` and `a6972d3`. Everything below marked
*branch* is green in branch CI and **not in production**.

| Commit | What |
|---|---|
| `3a776c0` | `AUTH_SECRET` fails closed. Self-serve creatives insert `pending_review`. `getCardCampaign.live` now checks creative approval — the portal shows **In review** instead of "You're live" while nothing serves. |
| `a6972d3` | **Money integrity.** `lib/db/tx.ts` opens a pooled connection — the only place a transaction is possible, since `neon-http` cannot open one. The CP ceiling, `buyTrophy` and `requestRedeem` run in a transaction behind `SELECT … FOR UPDATE` on the gamer's row. The bare `catch {}` is gone. First CI this repo has had. |
| `12c4730` | The three round-2 findings: real Postgres in CI so the lock is genuinely contended; `engines`/`.nvmrc`/`ws` fallback; and the client-bundle break adding `pg` caused. |
| `4773493` **(branch)** | **Card layout versioning** — see §1.1. |
| `3270baf` **(branch)** | **B72.1** — the fabricated ROAS deleted, and the headcount it was built on renamed across three surfaces. |

**The lock is proven, not asserted.** Remove `FOR UPDATE`, run against real
Postgres, and three assertions fail — including *four simultaneous claims on one
trophy all succeeding*, which is one trophy paid out three times in dollars.

*Honest limit:* the five-way `buyTrophy` race did **not** fail in that control
run, so it is not yet demonstrated to exercise contention. Recorded in the test.

### 1.1 A live defect we found ourselves, and it is instructive

The owner sent screenshots of a challenge card that went to **15 servers** with
its content crammed into the left 55%, the gradient bar back on, and the Cluster
watermark at 30% opacity in the corner. The redesign looked like it had never
happened.

**Read from production (read-only): all 12 stored card layouts predate the
redesign, and every one was overriding it.** `parseLayout`
(`lib/cards/layout.ts`) merged stored values over the new defaults field by
field. The challenge card's stored `content.w` was **59.5%** against a new
default of 92%; `bar` was `true`; `mark` was `{x:87, y:78, opacity:30}` against
`{x:50, y:63, opacity:7}`.

**The near miss that should have caught it:** `layout.ts` already carried a
comment explaining that stored layouts predate the redesign — written when
`bar` was defaulted off. The staleness was spotted for **one field** and the
obvious next question, *what about `content`, `mark`, `badge`, `plate`?*, was
never asked.

**Fixed by versioning, not by a database edit** (`4773493`): `LAYOUT_VERSION = 2`,
and a stored layout without it is discarded rather than merged. No production
write; it recovers by deploying. The old JSON stays in the row.

> **Why this matters beyond one card:** it is the same failure shape as the
> fabricated ROAS. Something looked deliberate and was stale. A reviewer should
> ask what else in this codebase is a merge of old state over new intent.

### Still live, still wrong

| Live defect | Where | Now unblocked by |
|---|---|---|
| Fabricated ROAS shown to a paying brand | `lib/brand-report.ts:105-115` | D1 |
| Ad beacon unauthenticated — CP mintable with `curl` | `app/api/ads/beacon/route.ts` | — |
| Trophy gifting (money-transmission trigger) | `lib/marketplace.ts:198-217` | D2 |
| No age gate at signup | `app/actions/auth.ts:11-53` | D3 |

---

## 2. The decisions, made

### ⚠️ SUPERSEDED BY `docs/COMMERCIAL_MODEL_V2.md`

**The model changed again after round 3, and this section is kept only as the
record of how we got here.** The reviewer's §I asked why we were pouring the
most engineering into the revenue model we had the least evidence for. The
answer was that we should not, and the owner's decision goes further than the
reviewer proposed:

| | |
|---|---|
| **One package** | 1–4 challenges/month per brand, any mix of games, **ads included free** |
| **Priced** | one price per challenge, split by percentage into four vaults |
| **Server owners** | paid from a weekly competitive pool, not a cut of each challenge |
| **Gamers** | the daily mission is funded by a CP vault — a budget, not a promise |
| **Views** | reported as proof of work, never sold |

**Read `docs/COMMERCIAL_MODEL_V2.md`. It is the model.** B75, B78, B81 and B82
are re-scoped around it, and most of B75 disappears — there is nothing to pace
or fill when the ads are included rather than metered.

### D1 + D4 — What an ad view IS *(historical)*

A campaign runs on **both** surfaces by default: the website and the Discord
cards. The unit is **a card the bot drew carrying that brand's creative**, plus
website placement views.

| Surface | Counts as |
|---|---|
| Bot card, private (ephemeral) | **1 view** |
| Bot card, public post | **1 view** |
| Website placement | as today |

**Every card is one view. There is no multiplier and no estimate anywhere on the
brand report.** An earlier draft counted a public post as 5% of server members;
that was dropped precisely because it is a modelled number, and a modelled number
labelled as delivery is the fabricated ROAS in better arithmetic.

**The brand is not told whether a card was public or private** — only which
server it came from. We store the distinction internally because we need to be
able to prove our own numbers; we do not report it.

The brand gets:

- **Discord:** by **card kind** and by **server**
- **Website:** by placement — count and traffic (largely exists)
- **Audience composition (new):** of the gamers who saw it, what do they play?
  *"62% League of Legends · 48% Fortnite · 30% Valorant."* Overlapping by design —
  one gamer holds several accounts — so percentages sum past 100% and the copy
  must say why, or it reads as broken.

> **The consequence, stated plainly:** counting a public post as 1 makes our
> sellable inventory *much* smaller than the earlier draft. A post seen by 5,000
> people counts once. That is the honest number and B78 restates the model on it.
> Understating is the safe side of this line to be on.

### D2 — Gifting is deleted

Not disabled — removed. The gift checkout, the search-for-a-gamer flow, every
Discord gift button, the `gift_sent`/`gift_received` actions, the gift
notification.

**A gamer can only buy a trophy for themselves. Nothing transfers between
accounts, ever.**

It closes the FinCEN money-transmission trigger, the 1099 aggregation hole and
the under-18 cash-out bypass together.

**Consequence nobody had spotted:** two of the four Daily Mission templates are
built on gifting (`lib/missions.ts:88,103`, 50 CP each). Rebuilding them is
inside the item, not after it.

### D3 — Age: a band, never a date of birth

**Bands:** **Under 13** · **13–17** · **18 or over**.
Thirteen, not fourteen — COPPA's line is 13, and this single choice is what the
whole age defence rests on. **The lawyer confirms the bands and the wording.**

| Band | What they get |
|---|---|
| **Under 13** | **Read-only.** Browse the site and the bot. No account linking, no challenges, no CP, no trophies, no redemption. Told plainly and kindly. |
| **13–17** | The full platform and CP earning. Redemption stays blocked by the existing 18+ eligibility check. |
| **18+** | Everything. |

**How it is asked:**

- **First thing on sign-in.** Three buttons. **The click IS the answer** — no
  "next", no "confirm" — and the rest of onboarding appears underneath.
- Navigate away without answering → **a popup on every gamer page**: profile,
  quests, balance, marketplace, challenges, anywhere an action happens.
- **The popup IS the onboarding page.** Click a band inside it and it becomes the
  rest of onboarding immediately.
- Click anywhere to close.
- **No age set → popup every page.** Deliberately annoying.
- **Age set, not unlocked → popup every 5 navigations**, plus on tapping the lock
  or the nav CTA. Not annoying.

**No CP accrues at all until a band is set**, and there is **no backfill** —
actions before that earn nothing. They are still **logged**, so nothing appears
to have vanished.

> **The limit we are not hiding:** a self-declared band is trivially lied about.
> It gives us a record of having asked and a reasonable basis to act, and it is
> what almost every platform does. It is not verification. **Ask the lawyer
> whether it is sufficient.**

---

## 3. THE BUILD

---

### ▸ B88 — The vaults actually run the economy · **BUILDING**

**The finding, from the owner and it is correct:** the daily CP ceiling is a
number a human types (500) with no connection to the money in the CP vault, and
the server pool is the whole server vault with no reserve. Both should be
**derived from an amount somebody deliberately allocated**, and both should
**move as the week is spent**.

Underneath it is a defect neither of us had named: **nothing debits the CP
vault.** `lib/vaults.ts` has `allocateInvoice` and `transfer` and no outflow for
a CP credit at all, so the vault only ever grows and "what is left this week"
cannot be asked. Every part of this item rests on fixing that first.

#### B88.1 — A CP credit is money leaving a vault

| Change | Why |
|---|---|
| `awardQuestAction` posts a `cp` outflow for every credit, at the live rate | The balance on `/admin/vaults` becomes a real remaining balance rather than a running total of sales |
| The outflow carries the gamer, the action and the CP | "Where did the vault go" is answerable without a second system |
| Zero-CP events write nothing | A gamer at their ceiling did not drain anything |

**Verification owed → `tests/db/cp-vault.mts` (new):** N credits reduce the CP
vault by exactly Σ(CP)÷rate; a credit of 0 CP writes no row; the balance equals
inflows minus outflows and never drifts.

#### B88.2 — The week is an ALLOCATION, not the whole vault

One new table: an allocation per week, per vault.

| Field | Meaning |
|---|---|
| `week` | The Monday it applies to |
| `vault` | `cp` or `server` |
| `amount` | What an admin released for that week |
| `lockedAt` | Set when the week starts; before that it is freely editable |

Rules, and they are the point:

1. **Admin sets it, never the software.** A percentage picker is a convenience
   over the top; the stored value is dollars.
2. **It can be raised mid-week, never lowered.** Gamers have already been shown
   a ceiling computed from it and servers have been shown a pool.
3. **What is not allocated is a RESERVE.** A week with no sales still pays,
   which is the whole reason to hold one back.
4. **Owners see the allocation, never the vault.** The reserve is ours to
   manage and showing it invites "why am I not paid out of that".

#### B88.3 — The daily ceiling, derived and recomputed

```
today's ceiling = remaining allocation ÷ eligible gamers ÷ days left in week
```

| Term | Definition | Why not the obvious thing |
|---|---|---|
| remaining allocation | allocated − credited so far this week | Unspent CP rolls forward automatically; no separate rollover to get wrong |
| eligible gamers | unlocked, not banned, active in 7 days, **plus** everyone who joined today | "All registered" drags in dormant accounts and makes the ceiling meaninglessly small |
| days left | including today | Spends the week evenly rather than emptying it on Monday |

Recomputed **once a day**, not per request: a ceiling that moves while a gamer
is mid-mission is a ceiling that takes something away mid-task.

**Bounded both ways.** Admin sets a floor and a cap. Without a floor a growth
spike makes a mission worth 4 CP, which reads as the product breaking; without a
cap a quiet week hands one gamer a fortune.

**The mission total IS the ceiling.** Already true in `lib/cp-dial.ts`; what
changes is that the number now comes from the vault instead of from a form.

**Verification owed → `tests/db/cp-ceiling.mts` (new):** more gamers, same
money → lower ceiling; unspent CP raises tomorrow's; the floor holds when the
maths says 3 CP; the cap holds when it says 90,000; a zero allocation stops
earning without deleting anything; the ceiling recomputed twice in one day is
the same number.

#### B88.4 — The server pool, simplified to one sentence

**Delete** slots, `1/(rank+1)`, repeat-winner decay, empty-slot redistribution,
and the 500-linked earn threshold.

**Replace with:** *your share of the pool is your share of the score.*

| Before | After |
|---|---|
| Top 20% place; #1 gets 2× #2 | Everyone who qualified is paid, in proportion to their score |
| Decay ×1/(1+0.25·wins) | Gone. Winning often is what we want |
| Empty slot redistributed | No slots, nothing to redistribute |
| Unlock at 500 linked | **0.** A server earns from its first week |
| Participation 20% flat | **Kept** — it is the floor that makes a small server's first cheque real |

Tiers stay as **labels** and never become rates. C3 deleted `ownerPct` for a
reason and this does not bring it back: a per-server rate on top of a pool pays
twice, and a published percentage is a promise we are held to.

**What counts, and it must be visible:** only **public sponsored challenges
live this week**. A private challenge a server runs for itself earns nothing —
it is not inventory a brand paid for, and counting it would pay owners for
talking to themselves.

**Verification owed → `tests/db/pool-share.mts` (new):** shares sum to the pool
exactly; a server with 12% of the score gets 12% of the competitive half; a
private challenge contributes nothing to any KPI; a server under 500 linked is
paid.

#### B88.5 — The week is the dashboard

`/admin/week` becomes the operating screen for both vaults.

| Shows | For |
|---|---|
| Allocated / spent / remaining, per vault | Whether this week is on track |
| Today's ceiling, its inputs, and yesterday's | Why a gamer's mission changed |
| The pool, the standings, every server's four KPIs | The number an owner will ring about |
| Next week's allocation, editable until it locks | The one decision this screen exists for |

**New challenges wait for the boundary.** A challenge sold mid-week is billed
and its money splits into the vaults immediately, but it **launches next
Monday** — an allocation that grew mid-week would mean a pool an owner had
already been shown going up, and a race to sell before Sunday.

#### B88.6 — The KPIs, said in the owner's words

The four terms are shown to owners as **KPIs with a target and a delta**, on the
portal and on a public board: what it counts, what it counted for you, what
moves it. A weight nobody can act on is a number that reads as arbitrary.

> **What we are NOT doing.** No per-server percentage rate. No paying for
> private challenges. No showing an owner the reserve. No lowering an allocation
> after a week has started.

---

### ▸ B89 — The full cycle, then the storefront that shows it · **PLANNED**

**Verified before planning.** What already exists, so nothing here rebuilds a
working surface:

| Exists | State |
|---|---|
| `/pay/[token]` — a brand's finance dept pays a hosted checkout | ✅ Works. No field on it could collect a card |
| `payout_accounts` — preference word + opaque provider handle | ✅ Works. No bank details stored anywhere |
| Server portal, Earnings tab | ⚠️ Exists, but **no wallet**: no balance, no history, no withdraw |
| `/servers/[slug]` public server page, 517 lines | ⚠️ Exists, thin |
| `/pricing`, 260 lines | ⚠️ Three-tier scaffolding around a one-package model (B78 follow-up) |
| Live pool page | ❌ Does not exist |
| Gamer segments for brands | ❌ Does not exist |
| Self-serve brand purchase | ❌ Staff must raise every invoice by hand |

**The stale thing verification found:** `lib/server-earnings.ts` still computes
`serverShare` per challenge and the portal prints "% of the field", which is the
per-challenge cut C3 deleted. Two models are live on one screen.

#### B89.1 — The server owner's wallet

An owner cannot see money they are owed, only challenges they ran.

| Build | Rule |
|---|---|
| Balance: earned − paid | Summed from payout rows, never stored |
| History: every week's pool share, every payout, every reference | An owner reconciling a number must not need to email us |
| Withdraw | Requests a payout. **Never** takes bank details — the provider's link does |
| The $25 floor, stated | Below it, it accrues. Said before they press, not after |
| The 30-day first-payout hold, stated with its date | B35. A hold discovered at withdrawal reads as a refusal |

**Delete `serverShare` and every surface printing "% of the field".** One model.

#### B89.2 — The brand's buying cycle, end to end

| Step | Today | After |
|---|---|---|
| Choose | `/pricing` calculator | Same, with a **Start** that creates a real enquiry |
| Agree | Email | Staff turn the enquiry into a campaign |
| Bill | Staff open an invoice | Unchanged — a human still prices a deal |
| Pay | `/pay/[token]` | Unchanged. It already works |
| Money splits | On PAID | Unchanged |
| Launch | Immediate | **Next Monday.** B88 — the week is the unit |
| Report | Brand portal | Unchanged |

**Not building self-serve checkout.** A brand that can buy without talking to
anybody is a brand nobody qualified, on a platform whose first question from
counsel is who our customers are.

#### B89.3 — The public pool page

`/pool` — the live weekly server pool, open to anybody.

| Shows | Why |
|---|---|
| This week's pool, in dollars | The number that makes an owner install the bot |
| Which challenges it counts | Public sponsored only. Private earns nothing, said plainly |
| The board: every competing server, its four KPIs, its share | An owner must see how to move up, not just where they are |
| The bracket split | Why a 200-member server is not competing with a 5,000-member one |
| Last week's result | A pool with no history reads as a promise |

**Honest when empty.** No challenge sold means "$0 — the pool opens with the
first sponsored challenge", never a placeholder.

#### B89.4 — The public server profile

`/servers/[slug]`, rebuilt, editable from the portal.

Top members · challenges they joined · trophies their members won · featured
gamers · who appears on which game leaderboard · the pool standing.

**Every one of those is already public** on `/u/[slug]` and the boards. This
page aggregates what a gamer has already chosen to show, and adds nothing.

#### B89.5 — Gamer segments for brands ⚠️ **NEEDS A DECISION**

"Show them as segments for brands" runs straight at B82's boundary: **aggregate
only, no identity, nothing under 25 viewers.**

| Build | Do not build |
|---|---|
| "18,000 gamers play Valorant, 40% also play Apex" | A list of who they are |
| Reach estimates per game, per region, per server size | Any row a person could be picked out of |
| The floor applies to every slice | An export |

Owner decision, written down before it is built.

#### B89.6 — The website, rewritten around real components

Home · `/pricing` (with server earnings on the same page) · `/brands` ·
`/servers` · `/discord-bot`.

**Sections render the real component, not a screenshot.** A live bot card, a
live pool board, a live trophy shelf. A screenshot is a claim; a component is
the product.

**Order: last.** Every page here is a storefront for a model whose numbers come
from B88 and B89.1–B89.4. Written first, it is fiction we then have to correct.

> **Gate 4 says this waits for one signed IO** and two of its three pages already
> shipped. Building the rest is a deliberate owner decision, and it is recorded
> here as one rather than quietly taken.

---

### ▸ B90 — The campaign is the product · **PLANNED**

**Read `docs/B73_RESEARCH.md` first.** It is now on this branch. The single most
important thing in it, for this item: **Discord Developer Policy §6 probably
prohibits a third-party brand's paid creative inside a bot message, and the
sponsored-CHALLENGE business survives that.** The owner's redesign — sell
campaigns of weekly challenges, not ad placements — moves us onto the surviving
side of that line. It was not designed for that reason and it does it anyway.

#### B90.0 — What the legal read changes, immediately

| Finding | Change | Where |
|---|---|---|
| §6: paid creatives in bot messages | Discord surfaces become **name-and-mention only** — the challenge's own title carries the sponsor ("The AstroFuel 24h Bullet Marathon"). Brand imagery lives on OUR domain, which the card links to. Web placements keep images | `lib/cards/`, `adPlacements` surface flag |
| §13: "do not fraudulently manipulate engagement" | The owner pool scored on raw activity is **a bounty on server messages**. Rescore on challenge OUTCOMES — entrants, completion — not on card opens | B88.4's KPIs |
| §17: no API data to ad networks | Already our rule. A brand never sees a per-server or per-user Discord datum | `lib/ad-delivery.ts` |
| 1099 threshold is **$2,000**, not $600 | Defect. `lib/eligibility.ts:55` over-reports | Fix now |
| Sanctions list wrong **both ways** | Syria's program was revoked; Crimea/Donetsk/Luhansk are missing | `lib/eligibility.ts:41` |
| Under-18 profiled ads barred in 9 regimes | Ad serving to under-18s must be **contextual, never profiled**. One change clears more jurisdictions than any other | Ad serving |
| 30% NRA withholding, **no de-minimis**, on non-US prize payouts | **Pre-launch blocker for the international population.** Unresolved in the research — the largest open question in it | Redemption |

#### B90.1 — Brand self-signup

Create a brand → automated email with a portal link and key → build a campaign.

**Admin approves before a brand appears anywhere public.** Self-signup with no
gate is a spam surface and a "who are our customers" problem on a platform whose
first counsel question is exactly that.

**A brand never sees another brand's numbers.** The owner asked for "numbers on
challenges by other brands"; that is a competitor's performance data. What ships
is **aggregate platform benchmarks** — median entrants per challenge, typical
reach — with no brand named and the 25-cohort floor applied.

#### B90.2 — The campaign builder

| Step | Rule |
|---|---|
| Pick 1–4 challenges | Each is **one week**. Four is a month, said in those words |
| Weeks are consecutive | Never two in one week. Start dates shown before payment, all fixed to a Monday |
| Prize pool | **Read-only.** It is 50% of the price and not a field |
| Creatives, cover, logo | Plus light-background and dark-background logo variants — we render three branded trophies from them |
| Estimated reach | Total gamers and total servers, labelled **estimate, not guaranteed** |
| Pay | The whole campaign, once. Nothing queues until it clears |

#### B90.3 — The status ladder

`draft` → `queued` → `announced` → `live` → `ended`

| Status | Means | Set by |
|---|---|---|
| **draft** | Built, **not paid**. Visible to admin as "a brand is buying and still thinking" | Brand |
| **queued** | Paid. Starts the following Monday | Payment |
| **announced** | Admin has set the three trophies, the rules and the game-API metric. The bot tells every server it opens next week. **Tracking starts here** | Admin |
| **live** | Running | Cron, Monday |
| **ended** | Scored, prizes awarded | Cron |

**Nothing queues before payment clears.** A challenge in `draft` is a lead.

#### B90.4 — Every challenge has somebody who paid for it

| Kind | Who pays | Split | Cut |
|---|---|---|---|
| Sponsored | A brand | Normal 50/20/15/15 | Yes |
| House | The Cluster house brand, billed to itself | Normal | Nominal — it is our own promo |
| **Private** | A server owner, from their wallet balance | ⚠️ **See below** | ⚠️ |

> **⚠️ PRIVATE CHALLENGES NEED COUNSEL BEFORE THEY ARE BUILT.**
>
> As described — the owner's balance funds a prize we pay to their members —
> ClusterGG receives value from person A and pays it to person B. **That is the
> money-transmitter trigger `B73_RESEARCH.md` Q3 flags**, and it re-opens
> precisely what deleting gifting closed (§28: the Dutch line is
> transferability).
>
> **The safer structure, and it is barely different to build:** the owner BUYS a
> challenge from us, at a price, like any other customer. We then owe the prize
> as **our own obligation out of our own revenue** — the "principal, not
> conduit" characterisation the research says is defensible. That means it runs
> through the normal split and takes a cut, however small. A pass-through with
> no cut is the version that looks like transmission.
>
> Not built until this is decided.

#### B90.5 — Admin sees every campaign, including the unpaid ones

One console: every brand, every campaign, every challenge, filterable by status.
A `draft` campaign is a **sales signal**, not clutter.

#### B90.6 — BETA

A `BETA` badge beside the wordmark, in the desktop nav and the mobile nav.

Not decoration: it is the honest label for a platform whose Gate 1 opinion is
not yet written, and it sets the expectation that things move.

> **What the owner should know, said once.** Billing your own company proves the
> software works. It does not prove anyone will pay — that is what Gate 4's
> signed insertion order was for. Running the full cycle against a friendly
> brand is a good test and a poor market signal, and the plan should not record
> it as the second thing.

---

### ▸ B86 — Start the clock on data we cannot backfill · **DO THIS WEEK**

**Ahead of everything, including B72.** Not because it is more urgent than a
live defect, but because it is the only item with a **deadline that has already
started running.** Every week without it is a week of history that cannot be
reconstructed, and the server competition cannot score its first week without
it.

| Add | Why |
|---|---|
| `challenge_participants.guildId` | Today one entrant counts for **every** server they belong to. Σ shares > 1. |
| Weekly guild snapshot — member count + qualified-linked count | There is **no history**, so "growth vs last week" cannot be computed at all. |
| Vault ledger table | Every inflow, outflow and transfer, from day one. |
| Exclusive-entrant weighting (1/k) | The dedup the scoring rests on. |

Purely additive. One migration, one nightly job, breaks nothing.

**Verification owed → `tests/db/attribution.mts` (new):** an entrant in three
participating servers contributes 1/3 to each; Σ across servers never exceeds
the true entrant count; a snapshot is written once per guild per week and is
idempotent on re-run.

---

### ▸ B87 — The model's blockers · **SHIPPED**

`docs/COMMERCIAL_MODEL_V2.md` §0 listed sixteen things the model described and
the code could not do. C4 and C5 were B86. All sixteen are closed.

| # | What it was | What was done |
|---|---|---|
| **C1** | No CP dial — a mission awards no CP of its own | `lib/cp-dial.ts`. Sets the ceiling and scales **mission-eligible weights only**, uniformly, so the 125-per-quest invariant holds. Never a completion bonus. |
| **C2** | `prizePool: 175` fixed, the % derived from it | `prizePct` is the source; the pool and the 4:2:1 podium derive from it. Price is a dial again. |
| **C3** | `ownerPctFor` in four places, incl. the public "25%" promise | Deleted, not zeroed. Owners are paid by the weekly pool. B47's gate moved to `week-close` with it. |
| **C6** | `Math.max(4, slots)` — 1–3 challenges inexpressible | 1–4, four the default. Explicit 0 clamps to 1, not back to 4. |
| **C7** | One game × 4 weeks; no mixed shape | The game lives on the slot. No backfill — a slot with none reads as the lead game. |
| **C8** | Prize funded twice | House funds only unsold challenges. The switch is gone, not re-defaulted. |
| **C9** | CP rate justified on ad revenue that is now $0 | Restated as cost of goods: 15% of every sale, 1,050 gamer-days per $350 challenge. |
| **C10** | 30-day hold vs "weekly pool" | `PAYOUT_HOLD_PHRASE` — one sentence, used on every surface. |
| **C11** | Three tier bases + paid add-on still priced /pricing | Retired to 0, zero-value lines omitted rather than printed. |
| **C12** | "Expected active gamers" undefined | `lib/active-gamers.ts`. Credited CP that day — narrow on purpose. Measured figure prints beside the calculator's slider. |
| **C13** | Prizes are 50% and had no vault | `allocateInvoice` on PAID, `commitPrizes` at award. Idempotent against the ledger; reverses, never deletes. |
| **C14** | "50% to gamers" is partly breakage | `lib/breakage.ts`. Measured and reported; **never banked**. No expiry invented. |
| **C15** | Nothing reconciled pool to podium | `reconcilePrizes`, written into the ledger row's reason. |
| **C16** | The model is weekly; no weekly cron | `lib/week-close.ts` on the daily job behind a day check. Payouts are drafts. |

**Owner actions still outstanding** (not code): branch protection on the Money
integrity checks; the Discord Developer Policy read; a FinCEN/state CVC opinion
that also covers the 16 line, whether we are "directed to children", and whether
an unredeemed trophy may ever expire.

### ▸ B72 — Stop the bleeding · **SHIPPED** *(all four)*

#### B72.1 — Kill the fabricated ROAS

`mediaValue` is computed from server headcount and labelled "Counted delivery".
Remove it from `lib/brand-report.ts:105-120`,
`components/BrandCampaignReports.tsx:115,288,369`, and the CSV at
`app/api/brands/report/route.ts:60-67`.

Until B82 lands the panel says **"Delivery measurement is being rebuilt."** A
blank honest box beats a confident wrong one. `benchmarkCpe` stays — it is B79's
CPA product and is not what was misrepresented.

**Verification → `tests/db/integrity.mts`:** no brand-report field derives from a
member count; "Return on spend" and "Media value" appear in no brand-facing
component.

#### B72.2 — Close the beacon

Three holes, not one:

1. The impression branch awards CP for any `ccId` anyone posts (`:37`).
2. The `duration` branch updates **any** impression id with no ownership check (`:41`).
3. `profile_views_25` is credited from an unauthenticated public page render
   (`app/u/[slug]/page.tsx:96-102`) — a second mint the beacon fix does not touch.

A browser-callable beacon cannot hold a secret, so "authenticate it" is not a
design. **Server-issued single-use nonce, minted at render, bound to session and
campaign-creative, redeemed once, short expiry.** Rate-limited, origin-checked.

**Verification:** unsigned → nothing; replayed nonce → nothing; another session's
nonce → nothing; duration refuses an impression the caller does not own.

#### B72.3 — Delete gifting *(D2)*

Twelve files plus the schema. Rules:

- `buyTrophy` loses `recipientSlug` and `message`.
- `marketplaceOrders.recipientId` **stays as a column** — historical orders
  reference it and dropping it destroys the ledger — but is always the buyer, and
  `kind` is always `"self"`.
- `gift_sent`/`gift_received` go to **weight 0**, kept not deleted, so a stored
  admin weight naming one reads zero instead of throwing. Same pattern B61 used.
- **Missions 2 and 4 rebuilt.** Orbit has the room: `share_card` 25×3,
  `profile_views_25` 25×3, `follower_gained` 25×2, `profile_vote_received` 25×2.
  Both blocks must still total exactly 125.
- `tests/db/missions.mts:90-92` asserts gifts exist and are symmetric. It goes red
  **on purpose** and is rewritten to assert the opposite.

**Verification → `tests/db/gifting.mts` (rewritten):** no path creates a
`userTrophies` row for anyone but the buyer; every mission variation still totals
500 and 125 per quest; no gift UI string survives.

#### B72.4 — The age band *(D3)*

`users.ageBand`: `unset | under16 | teen | adult`. **SHIPPED.** The line is 16,
not 13 — GDPR-K's default is 16 and a flat 13 processes the EU 13–15 cohort
without valid consent. `lib/age.ts` carries the reasoning and the caveat that a
self-declared band is a record of having asked, not verification.

- `lib/eligibility.ts` reads the band instead of computing from a birthday.
- **`birthDate` stops being collected**, and B80's purge deletes what is stored.
- The gate lives in ONE place — `mayEarn()` inside `awardQuestActionLocked` — not
  per emitter, because a gate repeated at twelve call sites is a gate missing
  from the thirteenth.
- **Editable, and counted.** The band is asked in one click with no confirm, so a
  mis-tap onto "Under 16" is inevitable and would lock somebody out of the whole
  product. `/settings/earning` corrects it, `MAX_BAND_CHANGES = 3` then locks —
  same shape and number as the payout preference.
- **Asked by the root layout**, not by `/onboarding`. Onboarding is skippable,
  and skipping it meant earning nothing forever without ever seeing the question.

**Verification → `tests/db/eligibility.mts`:** unset earns nothing and redeems
nothing; `under16` cannot link an account, join a challenge, or hold CP; `teen`
earns but cannot redeem; nothing anywhere asks for a date of birth.

**Gate 0: none of B72 may be deferred for a feature.**

---

### ▸ B73 — The two questions that decide whether the business exists

**Owner is doing this now.**

| Question | What we need back |
|---|---|
| **Does Discord permit this?** Third-party paid creatives in bot messages; cash-convertible points for engagement; verification at 100 servers forces a human review of exactly this. | A written read of the Developer Policy. If no: a partner conversation, or a product with no paid creatives inside bot messages. |
| **Is paying cash for engagement regulated?** FinCEN CVC status, state MTL, sanctions, 1099. | A status opinion. **B72.3 deletes gifting so this can come back "no."** Also confirm the D3 bands and copy. |

**Gate 1.** If Discord says no, the ad business inside Discord ends and the
company is the sponsored-challenge business only.

> **Accepted from the reviewer:** this gate cannot be enforced in code, which is
> exactly why it must be *evidentiary*. It is not satisfied by having asked. **It
> is satisfied when a dated written opinion is committed to this repository and
> named here.** Also accepted: our plan said B74–B79 wait for this answer, and
> B74 shipped first. Money integrity was worth doing regardless — but the first
> thing we built crossed our own most important gate, and that is worth naming
> rather than explaining away.

---

### ▸ B74 — Money integrity ✅ **DONE**

**Still owed:** a branch-protection rule requiring the check. **Owner is doing
this now.** Until then CI reports; it does not block.

---

### ▸ B81 — Ad view counting · **SHIPPED** *(D1/D4)*

**The revenue model rests on this, and it comes before anything that counts,
prices, paces or reports delivery.**

#### B81.1 — Write the definition down

`docs/AD_VIEW.md`, plain enough for a brand's agency:

- One card carrying a creative = one view. Public or private, the same.
- Why we do not multiply a public post by an audience estimate.
- That this is **not** an IAB viewable impression and we never claim it is.
- What we cannot see: whether anyone scrolled past, or for how long.

**If we cannot write it honestly, we cannot sell it.**

#### B81.2 — Log a render as a view

`ad_impressions` already has `guildId` (`schema.ts:556`). It gains:

| Column | Why |
|---|---|
| `surface` | `discord_private` / `discord_public` / `web` — **stored, never shown to a brand** |
| `cardKind` | profile, challenge, planet, game-stats, market — the brand's requested breakdown |

**No `views` column and no `estimated` flag.** One row is one view; a count is a
`count(*)`. There is nothing to weight, so there is nothing to get wrong.

#### B81.3 — No number the rows do not support

Enforced by a test, not by discipline: **no brand-facing figure is computed from
anything other than logged rows.**

**Verification → `tests/db/ad-views.mts` (new):** one card logs exactly one row;
a public post logs one, not many; a cached card re-served neither double-counts
nor skips; no exported report function multiplies a count by anything.

---

### ▸ B82 — What the brand sees · **SHIPPED** *(D1)*

Only after B81. A view over logged rows, with no arithmetic the rows do not
support.

- **Headline:** `Ad views delivered — 8,412`. One number. Counted.
- **Discord by card kind:** profile 3,201 · challenge 2,890 · planet 1,504 …
- **Discord by server:** name, member count *(context only — never multiplied by
  anything)*, views. Cards from DMs appear under **"Direct message."**
- **Website by placement:** count and traffic.
- **Audience composition:** percentages by linked game, with the copy explaining
  why they exceed 100%. Only for `userId`-attributed rows — an anonymous web view
  has no games and the denominator must say so rather than quietly shrinking.

**Privacy bound, non-negotiable:** aggregate only, minimum cohort **25 viewers**
before any percentage is shown, so no brand can re-identify anyone from a small
server. **No brand, no server owner and no staff department ever reaches a
gamer's identity through this report.**

**Do not repeat B80's finding:** the old report loads every impression row into
function heap. This one is aggregate queries.

**Verification → `tests/db/brand-report.mts` (new):** every number traces to
logged rows; a cohort under 25 shows a suppressed label, never a percentage;
composition may exceed 100% and the copy says why; **no brand-facing query can
return a user id, name, slug or handle**; no query loads unbounded rows.

**Registered in `lib/systems.ts`, assignable to a department (B29).**

---

### ▸ B83 — The gamer onboarding, properly · **SHIPPED** *(D3; B83.5 still deferred)*

B72.4 closes the legal hole plainly. **This is the version that is good.**

#### B83.1 — Two steps to unlock, not five

1. **Link a game account**
2. **Customize your profile** — **and setting a flag from Discord counts.**

Sharing the profile card is **removed** as a gate. `share_card` stays a paid
quest action; it is simply not a lock.

**Which means the whole path works without leaving Discord:** click a button →
become a user → pick an age band on a Discord card → link an account (to compete)
→ tap the flag button → unlocked. They discover what the flag does on their own.

#### B83.2 — The locked balance

- Accrues **only after the age band is set**. Caps at **5,000 CP**; earning stops
  there until they finish.
- Nav shows it **with a lock and a CTA**. Tapping it opens the onboarding page.
- **Locked CP cannot be spent or redeemed** — not on trophies either, because a
  trophy is cash with a picture on it.
- Trophies won before unlocking are held and locked with everything else.
- Actions past the cap are still **logged** with "unlock to keep earning", the
  same pattern as the daily ceiling.
- **Existing gamers are grandfathered.** They see the checklist and are asked
  their age band. **Nothing they already earned is ever locked.** Taking back
  access to a balance someone already had would be the worst thing we could do to
  our earliest users.

#### B83.3 — The unlock is an achievement

- **Discord card:** **UNLOCKED**, the balance rendered large, and **what they
  actually did** — "you linked *League of Legends*", "you customized your profile
  — image, colour, flag".
- **Web:** a congratulations moment with the same content.
- **CTA → today's mission**, which is itself full of CTAs, with challenges
  personalized to their game.

#### B83.4 — The onboarding page and popup

One component, two presentations. Hero section with real visuals: what CP is,
how you earn it, what unlocking gives you, and one bold **"Free to unlock"**
button. An expandable **Know more** section carrying the gamer guide (B84).

#### B83.5 — The profile editor shows the real card · **DEFERRED**

Genuinely expensive: every preview is a render against a 4,000/day cap
(`lib/cards/budget.ts:22`). Right feature, wrong quarter — it needs its own
budget line, which is B77.


The customization editor gains a **switch between the web profile and their
actual bot card**, driven by the same controls.

**A real Satori render, not an HTML lookalike.** Debounced — on pause and on
save, not on every keystroke — and cached. The reason is the same one this
project keeps relearning: a preview that differs from the real thing is a lie
that looks like a feature. The brand portal's HTML mock is the precedent we are
deliberately *not* following here.

And the backend must genuinely work: **what they save is what the next bot card
renders.**

> **Cost flag:** every preview is a render, and `lib/cards/budget.ts` already
> caps renders (B77). Editor previews need their own budget line, or one gamer
> fiddling with colours eats the network's daily allowance.

**Verification → `tests/db/onboarding.mts` (new):** unset band earns nothing;
`under13` is read-only; locked CP cannot be spent or redeemed; the cap holds at
5,000; a flag set from Discord satisfies the customization step; an existing
gamer with a balance is never locked; unlocking releases exactly what was
accrued.

---

### ▸ B84 — The gamer guide, visual only · **DEFERRED**

Guide the new economy **once, after it stops moving.** Writing a visual guide to
a CP number that is about to change is work we would throw away.


**Text exists only to name or define a visual.** Built from **real trophies and
real challenges we actually have**, not lorem.

- **On Discord:** a guide button under each main card. Trophy marketplace →
  *Trophy guide*. Wallet/CP ledger → its guide. Quests → its guide. One per
  aspect of the economy — not a card blizzard.
- **On web:** a collapsible *Know more* on the onboarding page and popup, the
  trophy marketplace, quests, and the mission/streak band.
- **The two most important are the onboarding cards:** the **age band** card and
  the **2-step unlock** card, each with its CTA. Neither shows again once done.
- The whole gamer-side economy guide is **rewritten** for the new missions,
  streak, balance, action weights and caps.

---

### ▸ B85 — Card parity · **B85.1/B85.2 SHIPPED** *(B85.3 deferred to the admin rewrite)*

#### B85.1 — The rule

**A bot card showing data shows it in the same visual language as the web
component that shows the same thing.** Satori's space limits are real; the design
language is not negotiable because of them.

#### B85.2 — The named bug: the planet card has no planet

`lib/cards/data.ts:203` selects `planetBgUrl` — the space background — and
**never `planetImageUrl`, the globe itself.** The card is not mis-positioning the
globe; the data layer never fetches it. `bgSources` even labels the option "The
globe/space art" (`layout.ts:399`) while only ever resolving the background.

Then an audit of every card kind against its web counterpart, starting with
planet vs planet-explore, which is the widest gap.

#### B85.3 — The admin layout editor, revamped · **DEFERRED**

§8 says do not build admin for an unvalidated model. This is admin.


`4773493` stopped stale layouts being applied. The editor itself is still built
for the old frame.

- **The new style is the default**, and the editor opens on it.
- Controls match the new frame: identity, the fixed ad slot, the pane grid, the
  stroke, the watermark, the data references (B58).
- Controls for things the redesign removed — the mascot, the badge, the gradient
  bar, the heavy plate — **go**, rather than sitting there doing nothing.
- Saving writes `v: LAYOUT_VERSION`.
- A visible **"this layout predates the current design and is not being
  applied"** state, so an admin is never confused about why their tuning does
  nothing.

---

### ▸ B75 — Deliver what was sold · **SHIPPED** *(items 4, 5, 6)*

**Ads are included free now, so there is nothing to pace, target, or make good
on.** Items 1, 2, 3 and 7 below are deleted. What survives is what keeps the
*reporting* honest — and it still matters, because we report ad views as proof
of work: if only `creatives[0]` ever serves, the report is wrong for every other
brand.

**Moved AHEAD of B82.** A brand report that can be padded ships before the
control that stops padding, otherwise.

~~1. Target and delivered per campaign.~~ **Deleted — nothing is sold by volume.**
~~2. Pacing across the flight.~~ **Deleted.**
~~3. Stop at target.~~ **Deleted.**

4. **Frequency cap** — and it is now an *anti-fraud* control, not a courtesy:
   every bot render logs an impression with no per-gamer cap, so anyone who can
   make the bot draw a card can inflate a brand's report.
5. **No silent cutoff (B65)**: `maxCreativesInRotation` drops paying brands, and
   the bot-post surface serves `creatives[0]` only. Both are money taken for
   delivery not made.
6. Cache/ad separation — a cached card must not re-serve one brand or skip a count.
7. Under-delivery gets a remedy **in the system** — make-good or credit.

**Verification → `tests/db/ad-delivery.mts` (new):** a campaign at target serves
nothing further; every active creative appears in rotation; the frequency cap
holds per gamer per day; under-delivery produces a credit row.

---

### ▸ B76 — Make the 15-screen guarantee real · **SHIPPED**

- **Four priced actions have no emitter** — `stat_levelup`, `play_session`,
  `challenge_progress`, `share_card`. They are in every mission variation and
  nothing fires them.
- **`lib/missions.ts` is imported by nothing but its own test.** Wire it to a
  surface.
- **The passive cap** — the active/passive flag and the 125 CP passive ceiling the
  model claims are not in `lib/quests.ts`. Implement, or delete the claim.
- **The 25-CP rule** — `win_challenge` at 100 and `best_profile_award` at 100
  break the bound the guarantee rests on. Enforce it, or restate the guarantee to
  exclude them and show the resulting floor.
- **Log over-cap actions** with "max CP for today reached".

**Verification → `tests/db/quests.mts`:** every priced action has an emitter,
asserted by scanning the **callers** of `awardQuestAction` rather than the
catalogue — *the exact mistake that let missions ship on actions that do not
fire*; no action exceeds 25; the passive subtotal cannot exceed 125 a day.

---

### ▸ B77 — The caps our own cost control set · **SHIPPED** *(configurable; the cost modelling is an owner decision)*

`lib/cards/budget.ts:22` caps rendering at 4,000/day — roughly 200 active gamers.
B46 set it without checking it against the growth the model assumes; two of our
own documents contradicted each other.

Raise or scale it **and model the render cost first**. Make it an
admin-visible configured number, not a constant. **B83.5's editor previews need
their own line in this budget.**

---

### ▸ B78 — The model, restated · **SHIPPED**

- `revenue = screens × CPM/1000 × fill`. **Fill was missing from our break-even —
  our error, not a dispute.**
- Every rung declares **registered vs daily-active**. That switch alone is worth
  ~30× and our table never said which.
- Cost and revenue use the **same** engagement assumption in the same paragraph.
- `COMMERCIAL_MODEL.md` gains a **CURRENT STATE vs TARGET STATE** header; every
  unbuilt mechanism marked **NOT BUILT**.
- **Restated on the D1 view definition** — one card, one view, no multiplier. The
  inventory number gets smaller and honest.

---

</details>

---

### ▸ B79 — Earn the right to sell

- **Instrument three numbers:** real counted views per daily-active gamer per day,
  real fill against a signed brand, real mission time-on-task.
- **Test the CPA product** — verified entrants, `benchmarkCpe = $3.50`, roughly
  70× the headroom of a display view.

**Gate 4 — one signed insertion order** before **B66** (admin sales console),
**B67** (brand portal rebuild), **B69** (public commercial site).

> **Two things we still cannot answer.**
>
> **A gate cannot block the past.** `app/brands/[slug]`, `app/pricing`,
> `app/brands`, `app/servers`, `app/discord-bot` are already live. To make Gate 4
> real, they go behind a flag that is off until an IO exists, or they come down.
> **Undecided. We want paths.**
>
> **Gate 4 is circular.** B79 measures fill against a signed brand, and the signed
> brand *is* Gate 4. The only escape we see is selling the first IO as an
> unmeasured pilot priced on outcomes — which contradicts `COMMERCIAL_MODEL.md`
> §7.2's promise of numbers "computed from the real platform right now".

---

### ▸ B80 — The debt, in full · **BOTH FATALS SHIPPED**

**This section was wrong before.** It said "the remainder … none fatal alone" and
listed five items. It was not the remainder, and it silently contained findings
the reviewer rated **fatal**.

> **PROMOTED OUT OF DEBT.** The weekly server pool is the **first mechanism on
> this platform that pays cash directly for member counts.** Sybil defence was
> tolerable as debt when nothing paid for growth. It is load-bearing now and
> becomes a build item ahead of the first payout.

**Abuse and identity**

- **Sybil cost per account is $0.00** — no email verification, captcha, phone or
  device check; the IP-velocity guard is dead code. *(fatal)*
- **No automated gamer-side abuse detection** — the only detector is guild-scoped,
  needs 50+ members, does not enforce. *(severe)*

> The **$547,500/yr minted-CP fraud figure comes from free account creation × a
> public mint.** B72.2 closes the mint. It does nothing about free account
> creation, and nothing about collusion rings farming follows, votes and profile
> views, which need no beacon at all. **The fraud economics survive our own
> Phase-0 fix.**

**Scale**

- Cold-start DDL replay: 219 raw statements, 108 `ALTER TABLE` (ACCESS
  EXCLUSIVE), 11 full-table `UPDATE`, on every cold boot against production. *(fatal)*
- Stat sync saturates at ~30 accounts — 60/hr sequential, no queue. *(fatal)*
- Per-award query cost: ~12 round-trips × 20 actions × 1M gamers = 240M
  queries/day; `quest_events` and `ad_impressions` unbounded, unpartitioned. *(fatal)*
- Brand report loads every impression row into function heap. *(severe)*

> **The tension we are not hiding:** these are deferrable only if our honest
> position is "pre-revenue, scale is years away". But then the 1,000,000-gamer
> ladder in `COMMERCIAL_MODEL.md` cannot also be the reference model B78
> restates. **One has to give and we want a view on which.**

**Access and privacy**

- `/api/setup` public when `SETUP_TOKEN` is unset; first account becomes superadmin.
- OAuth open redirect (`next` unvalidated); account-merge trusts an unverified
  provider email.
- Portal brute-force lockout per-portal, not per-IP — a DoS on every customer.
- Session JWT last-16-chars in an analytics table, plaintext, indefinitely.
- Open image proxy (`next.config.ts` proxies any HTTPS host).
- The 90-day purge the privacy policy promises and the product does not perform.
  **This job now also deletes stored `birthDate` values (D3).**
- Riot **development** key on a live product whose terms prohibit contests.
- Cookie consent decorative; deletion leaves PII; IP salt defaults.

---

### ▸ Carried over — behind the gates

| Item | What |
|---|---|
| **B62** (web half) | Trophy stacking and no-price-on-your-own-case on `components/TrophyCase.tsx`. |
| **B63** | The nav bands: today's mission and the streak. |
| **B59** | A gamer can see and control their own card on the website. *(Largely absorbed by B83.5.)* |
| **B56** (remainder) | Card kinds not yet on the new shared layout. |
| **B68** | The social purge — posts, comments, reactions leave the product. |
| **B66, B67, B69** | Admin sales console, brand portal rebuild, public site — **behind Gate 4**. |
| **B70** | Component screenshots — **deferred**, the surfaces are all about to change. |
| `tests/ui/cards.mjs` | Owed since B54. |

---

## 4. The gates, honestly scored

| Gate | Blocks | Enforced by | Real? |
|---|---|---|---|
| **0** | Everything, until the six Phase-0 defects are fixed | `tests/db/integrity.mts` in CI — 2 of 6, **and the two least severe** | **1/3** — the reviewer's score, and it is right |
| **1** | B75–B79, until Discord and FinCEN answer | Nothing yet. Needs a **committed, dated opinion** | **No — owner is doing it now** |
| **2** | Any CP feature | `tests/db/concurrency.mts`, two CI steps — PGlite *and* real Postgres; **fails when the lock is removed** | **Evidence yes. Blocking: not until branch protection — owner is doing it now** |
| **4** | B66, B67, B69, until one signed IO | Nothing, **and two of the three already shipped** | **No** |

---

## 5. What we are not doing

| Not doing | Why |
|---|---|
| Defending the $5 CPM | We cannot prove it. A signed deal proves it or kills it — and even then it proves one deal, revocable if a verification vendor classifies our traffic as incentivised. |
| Building the sales console, brand portal or admin rebuild now | They serve a revenue model that has not cleared Gate 1. |
| Pivoting to CPA on paper | The strongest constructive idea in the report. A pivot announced without a signed deal is the same error in a new coat. |
| Chasing the 1,234× number | Three disputed inputs compounded — conceded without reservation. Real numbers arrive within a month of B79. |

---

## 6. The questions we most want answered

1. **Does removing every estimate actually fix §2 D1?** One card, one view,
   nothing multiplied. **Try to break the count** — how does a gamer, a server
   owner, a bug or the cache inflate it? And is "one view" *meaningful* for a
   public post nobody may have looked at, or have we swapped overstating for a
   number that means nothing?
2. **Audience composition (B82):** aggregate only, cohort floor 25. Can a brand or
   server owner re-identify anyone? Is 25 the right floor?
3. **The age design (§2 D3, B72.4, B83):** bands at 13/17, under-13 read-only,
   no earning before answering, no backfill, self-declared. **Does that close the
   COPPA exposure, or is a self-declared band worth nothing?** 2–3 paths.
4. **B83's locked balance:** accrues only after the band is set, caps at 5,000 CP,
   cannot be spent or redeemed, existing gamers grandfathered. Where is the
   loophole?
5. **§1.1 — what else is stale?** Twelve stored card layouts silently overrode a
   redesign and shipped to 15 servers. Where else does this codebase merge old
   stored state over new intent?
6. **Gate 4 gates the past and is circular.** Paths, please.
7. **Scale vs the ladder.** Which gives?
8. **What is missing?** The pattern here is that the expensive things were never
   on the list.

---

*Everything here is checkable. If a claim in this file is not true in the code,
that is the most valuable thing you can tell us — and it has happened in every
round so far.*
