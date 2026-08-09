# The business

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

Cluster sells one thing: **access to gamers inside Discord communities, bought
like advertising and reported like advertising.**

## The unit

A brand pays **$250** for one sponsored weekly challenge on one game.

| | |
|---|---|
| Prize pool | **$175** — reaches a gamer. We never touch it. |
| Platform fee | **$75** — the only line the business lives on. |

Everything else — the always-on creative slot on every card the bot draws, the
reporting, the portal — is bought alongside it or included.

Server owners take a share of the platform fee, rising with the number of their
members who have linked a game. That is the whole growth engine: an owner who
recruits gamers is paid for it.

## What each side gets

**Brands.** Weekly competitions with their name on the prize, running inside
gaming servers no ad network reaches. Their creative on every card the bot
draws. Reach, entrants, clicks, cost-per-entrant and eCPM per week, with the
servers it landed in named.

**Server owners.** A funded competition their members enter with one tap, with
no sponsorship operations and no prize money of their own. A share of every
sponsored challenge that runs there. A dashboard that shows what Cluster sent
them and what they earned.

**Gamers.** One profile across every game they play. Entry to as many challenges
as they like on one game account — a single win moves every board they're on.
Real prize money, and trophies that stay on their profile.

## The numbers, live

The financial model is a page, not a spreadsheet: **/dataroom/financial-model**.
Assumptions are sliders, every figure is computed from them, and the downside
scenarios are there too. It is the same arithmetic the pitch deck quotes, which
is why there is only one of them.

Pricing is data, not copy — `lib/pricing.ts`, editable in Admin, and every page
that quotes a price reads it from there.

## Two founding offers

- **A server's first challenge is $25.** For the first thousand servers.
- **A brand's first month is on us** — four challenges, $1,000 in credit.

Both apply retroactively to servers and brands that joined before the offers
existed. Staff apply them from Admin → Discord → Offers.
