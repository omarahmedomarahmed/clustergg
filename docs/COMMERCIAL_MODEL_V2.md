# The Commercial Model, v2 — one package, three vaults

**Decided 7 August 2026. This supersedes `docs/COMMERCIAL_MODEL.md` entirely.**

The old model sold views at a CPM we could not prove, against inventory that
shrank the moment we counted it honestly. This one sells a sponsorship priced on
things both sides can count, and funds every payout out of money that has
actually arrived.

---

## 1. What a brand buys

One product. No option to buy views alone or challenges alone.

| | |
|---|---|
| **Challenges per brand per month** | 1–4 |
| **Games** | brand's choice, any mix (2 of game A + 2 of game B) |
| **Ad placements** | **included free**, self-serve creative upload |
| **Price** | one price per challenge, no variants |
| **Reported** | entrants (counted) **and** cards delivered (counted) |
| **Charged on** | the package |

The ads are an argument for the price, not a line item we have to defend.

---

## 2. The split

Every challenge splits by **percentage**, never by fixed dollars — so raising
the price raises every downstream pool automatically.

| Line | % | At $350 |
|---|---|---|
| Prize pool → gamers | **50** | $175 |
| **Cluster revenue** | **20** | $70 |
| **Server pool** | **15** | $52.50 |
| **CP vault** | **15** | $52.50 |
| | **100** | $350 |

Round numbers on purpose. The old 21.4 / 14.3 / 14.3 was arithmetic left over
from fixed dollar amounts, and a number nobody can hold in their head is a
number nobody notices going wrong.

**The price is a dial.** `challengePrice` moves, every pool moves with it, and
nothing downstream needs editing.

### Who gets the 20

The prize pool is fixed at 50. The remaining 50 splits three ways, and **one of
the three holds 20 while the other two hold 15.** Admin switches which.

| Preset | Cluster | Servers | Gamers | Use when |
|---|---|---|---|---|
| **Default** | **20** | 15 | 15 | normal running |
| **Grow servers** | 15 | **20** | 15 | recruiting server owners |
| **Grow gamers** | 15 | 15 | **20** | the mission needs to pay more |

One switch, three positions. No arithmetic for whoever is operating it.

### Editing it

| | |
|---|---|
| Switching the preset | ordinary admin action |
| **Editing any percentage by hand** | **danger zone** — typed confirmation, audit row, reason required |
| The rule | **must total 100.** The editor refuses to save otherwise. |

This is a money invariant, not form validation: a split that does not total 100
either pays out money that never arrived or silently keeps money that was
promised to somebody.

**Separate from vault transfers.** These percentages decide how *new* challenge
money is allocated. Loading and unloading a vault is a different action, always
available, and does not touch the split.

---

## 3. The three vaults

Every payout comes out of a vault that money has actually arrived in. No pool
can pay what it has not received.

| Vault | Fills from | Pays out |
|---|---|---|
| **Server pool** | 15% of each challenge | 10 winning servers, weekly |
| **CP vault** | 15% of each challenge | tomorrow's daily mission |
| **Cluster revenue** | 20% of each challenge | us |

**Transfers are allowed, both ways, and logged.** Cluster revenue can top up the
server pool or the CP vault; a vault in surplus can return to revenue. Every
transfer is a ledger row with an admin, a reason and a timestamp — never a
silent adjustment.

### Each vault gets the same admin screen

| Element | |
|---|---|
| **The big number** | current balance, centre of the screen |
| Everything that made it | inflows by challenge, outflows by payout |
| **History** | every in and out, dated, attributed |
| **Transfer** | fund it, or draw from it, with a required reason |

---

## 4. The server pool — how owners get paid

**Tiers are size labels only.** They are no longer a percentage of any challenge
price. All owner money comes from the weekly pool.

> ⚠️ `lib/server-earnings.ts` currently pays `ownerPctFor(linked)` as a share of
> the challenge price. That path is **deleted**, or we pay owners twice.

### Default slots

| Tier | Pool share | Each winner | Slots |
|---|---|---|---|
| Small | 30% | 5% | **6** |
| Mid | 20% | 10% | **2** |
| Large | 50% | 25% | **2** |
| | **100%** | | **10/week** |

### Admin controls the slots

- Add or remove winners in any tier.
- **The total must equal 100%.** The editor refuses to save otherwise — this is
  a money invariant, not a form validation.
- **Presets**, because the right shape changes as the network grows:

| Preset | Shape | When |
|---|---|---|
| **Launch** | all 20 slots at 5%, small tier only | at the start, when no server is big |
| **Balanced** | 6 / 2 / 2 (the default above) | normal running |
| **Custom** | anything summing to 100% | admin's call |

### Winning is earned weekly, and scored *within tier*

A 200-member server never competes against a 20,000-member one.

| Input | Weight |
|---|---|
| Entrants from that server | **50%** |
| Bot engagement (card opens) | **25%** |
| Member growth % vs last week | **25%** |

Growth is a **percentage**, deliberately — it is the term a small server can win
on. No cooldown: the same server can win every week. Competition is the point.

### What owners see

| | |
|---|---|
| **This week's pool** | visible to **every** owner, including unlinked ones |
| **Live engagement dashboard** | their rank in their tier, and what moves it |
| Per challenge | how many of the entrants came from their server |

The pool is shown to owners who cannot yet win, on purpose: it is the reason to
grow.

---

## 5. The CP vault — the end of unfunded points

**Before:** every gamer was promised 500 CP a day, funded by nothing.
**Now:** the daily mission is whatever the vault can afford.

| Step | |
|---|---|
| Vault fills | 15% of every challenge |
| **Tomorrow's mission CP** | vault balance ÷ expected active gamers |
| Unclaimed CP | stays in the vault — tomorrow is richer |
| Spike guard | computed from **yesterday's** active count, plus headroom |
| Floor | **50 CP/day**, funded from Cluster revenue if the vault is short |
| Gamers see | the mission number. Never the vault. |

**What $52.50 per challenge buys:** 525,000 CP = 1,050 gamer-days at 500 CP.
Four challenges a month ≈ 140 gamers at the old full rate, or 700 at 100/day.

The number now moves with the business instead of being a promise we cannot
keep. **This is the answer to "do we switch gamer earning off": no — it stops
being a promise and becomes a budget.**

---

## 6. What this changes

**It is a pivot, and a bigger one than the last.** The last changed what we
measure. This changes what we sell, what we pay, and what we promise.

| | Before | Now |
|---|---|---|
| Price | $250/challenge | **$350**, one format, a dial |
| Packaging | 4 per game | **1–4 per brand**, any mix of games |
| Ads | sold separately | **included free**, self-serve |
| Server owners | % of each challenge | **weekly competitive pool** |
| Gamers | fixed 500 CP/day | **daily number from a funded vault** |
| Views | the product | **reported as proof of work** |

### Surfaces that must be rewritten

| Area | |
|---|---|
| Public | pricing, brands, servers, discord-bot, home |
| Gamer | quests, marketplace, wallet, every CP promise, onboarding |
| **Brand portal** | full rewrite — package builder, self-serve creatives, the new report |
| **Server portal** | full rewrite — pool, rank, live engagement, payout history |
| Bot | every card stating a CP number or a price |

---

## 7. Admin is legacy

**48 sections.** It grew with the product and now describes a product we are
leaving.

**Decision: do not patch it. Rewrite it from scratch — but AFTER the platform is
built and proven.** Building a console for a model we have not validated is the
mistake the due-diligence report was about.

Until then admin gets **only** what the new money needs: the three vault
screens, the server-pool slot editor, and the live engagement dashboard.

### The rewrite, when it comes

| Do | |
|---|---|
| Purge the UI pages and rebuild them | every one |
| Rewrite the actions and wiring | not a re-skin |
| Organise around **staff jobs**, not database tables | what does someone actually do each day |
| Every screen earns its place | a number, a decision, or a task |

**Purge candidates** — to be confirmed against real staff use before deletion,
not assumed:

`creative-studio` · `brand-kit` · `backgrounds` · `spaces` · `game-worlds` ·
`mobile` · `chrome` · `shots` · `translations` · `language` · `dataroom` ·
`cp-calculator` · `growth-review` · `partners`

**Never touched by this purge:** `/admin/users` and `/admin/linked-accounts`
stay admin-only. No staff department reaches the gamer directory or the
linked-account list, ever.

---

## 8. Everything is a dial

| Setting | Owner |
|---|---|
| Challenge price | admin |
| **Which pool holds the 20** | admin, one switch |
| **The four percentages by hand** | admin, **danger zone**, must total 100 |
| Slot shape per tier | admin, must total 100% |
| Engagement score weights | admin |
| Daily CP floor | admin |
| Vault transfers | admin, with a reason |

No number in this document is a constant in the code.
