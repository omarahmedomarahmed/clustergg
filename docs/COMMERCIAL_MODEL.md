# The commercial model

How Cluster makes money, what we charge, what it costs us, and where every one
of those numbers lives in the code.

This is the source of truth. The pitch deck and the partner profile both read
their prices from the same config this document describes, so if you change a
number here you change it everywhere — including in front of an investor.

---

## The one-paragraph version

Every gamer is on Discord. Discord has no ads manager. Brands that want gaming
audiences either sponsor an esports event, burn money on Meta and TikTok reaching
people on a phone break, or personally negotiate with a big server that charges
whatever it likes. We are the structured buy: placements across a network of
gaming communities, and — the actual product — a **sponsored weekly challenge**
per game, carrying the brand's name, entered by verified players of that game.

Two sides. Brands pay in; 70% of it is won by gamers, inside the servers that hosted the challenge.

---

## What we sell

| Tier | Monthly | What it is |
|---|---|---|
| **Reach** | `pricing.reachBase` (default $600) | Every placement, the self-serve brand portal, full analytics. |
| **Challenge** | `pricing.challengeBase` + per-game (default $500 + $1,000/game) | Everything in Reach at a reduced base, plus 4 sponsored challenges a month **per game** with naming rights. One game = $1,500. |
| **Ultimate** | `pricing.ultimateBase` + all games (default $400 + $6,000 = **$6,400**) | Every game, every challenge, premium placement, Discord placement, the Sunday shout-out, and 2 × 5-second video slots. |

The per-game rate is **derived, never stored**: `challengePrice × challengesPerGame`
= $250 × 4 = $1,000. A brand buys challenges, one a week; the monthly rate for a
game is simply how many of those that is. Storing it separately would create two
numbers meaning the same thing that eventually disagree, and the one on the
invoice would stop matching the one on the page.

**Add-on, any plan:** `pricing.streamAddon` (default $400/month) — presenting
sponsor of the Sunday Profile of the Week broadcast and every clip cut from it.

**Annual:** `pricing.yearlyDiscountPct` off (default 20%).

The tier is not chosen, it is *derived*: zero games is Reach, all games is
Ultimate, anything between is Challenge. That is why the slider on `/pricing`
can move a brand from $600 to $6,400 without them ever picking a plan name.

## The unit

Everything in the model reduces to one transaction: a sponsored weekly challenge.

| | |
|---|---|
| We charge the brand | `pricing.challengePrice` — **$250** |
| We pay out | `pricing.prizePool` — **$175** ($100 / $50 / $25) |
| We keep | **$75** gross margin |
| Share reaching players | **70%**, and it is arithmetic, not policy |

The prize is paid as **three trophies carrying the sponsor's brand**, redeemed by
the three gamers who placed. Nothing is withheld and nothing is shared with the
server — every cent of the $175 reaches a player.

Per game, per month: brand pays **$1,000**, players win **$700**, we keep **$300**.
Across all six games at the defaults: **24 challenges**, **$6,000** of challenge
revenue, **$4,200** paid to gamers.

Two things about the cost side matter commercially:

- **It is fixed, not per sponsor.** The same competition carries whoever is
  sponsoring it. A second brand does not add a second prize pool.
- **It is the only real cost of goods.** The bot runs inside the same Next.js
  application as the website — no gateway process, no always-on host — and cards
  are rendered once and served from a content-hashed URL that Discord's CDN
  caches. The marginal cost of another server is a database row.

## What a server gets

**Servers are not paid a revenue share.** Say this precisely, because the wrong
version of it is a promise we would have to break.

What a server gets is brand-sponsored challenges running inside it, and the
prize money on those challenges being won by *its own members*. A League server
that crosses the threshold has League sponsorship money flowing to its players —
up to **$700 a month per sponsored game**. The owner didn't earn a commission;
their community earned real money, through their server, because of their bot.

| Stage | Linked gamers | Unlocks |
|---|---|---|
| Sponsored | 500 | Brand-sponsored challenges land here, prize money won by members, owner portal |
| Broadcaster | 1,000 | Network-wide challenges carried here, priority in its top game |
| Flagship | 5,000 | Brands request the community by name, exclusive challenges, named on the broadcast |

**Linked, not members.** A 50,000-member server with no linked accounts earns
nothing, and the pages say so plainly. The threshold is how we prove to a brand
that an audience is real, and it is the same number for everyone. It lives in
`discord.unlock.threshold` and in `lib/server-portal.ts`.

---

## Where the numbers live

Everything is a CMS key with the running value as its default, editable at
**Admin → Site content → Pricing**. Nothing needs a deploy.

| Thing | Where |
|---|---|
| The model, pure and shared | `lib/pricing.ts` — types, defaults, `quote()`, `perGame()`, `marginPerChallenge()`, `prizeSharePct()`, the stage ladder |
| Live inventory + audience | `lib/pricing-live.ts` — placement count, per-game verified gamers, reach |
| The copy | `lib/cms.ts` → `CONTENT_DEFAULTS` (`brand.*` and `pricing.*`) |
| The rate card page | `app/pricing/page.tsx` + `components/PricingPlans.tsx` |
| The enquiry form | `app/brands/page.tsx` + `components/EnquiryForm.tsx` |
| The enquiry queue | `app/admin/brand-enquiries` |
| The server side | `components/ServerEarnCards.tsx`, `/servers`, `/discord-bot` |
| Deck + partner profile | `lib/dataroom/defaults.ts`, `pricing` section kind |

`lib/pricing.ts` is **pure** — no database, no server imports — because the
slider runs in the browser and the same functions render the page on the server.
If they were two implementations they would eventually disagree, and the number
a brand sees would stop being the number we charge.

### Changing a price

1. Admin → Site content → **Pricing — the numbers**.
2. Save. `/pricing`, the home section, `/brands`, `/servers`, `/discord-bot`,
   the pitch deck and the partner profile all move together.
3. Nothing to redeploy, and no page has a price written into it.

If a change makes the copy wrong as well (a tier gains a feature, say), the
feature lists are one bullet per line in **Pricing — the copy**.

---

## What we are allowed to claim

This matters more than it sounds, because the first brand to check a number
decides whether the rest of the page is true.

**Counted, safe to state as fact:**

- Ad placements — read from `ad_placements`.
- Gamers reachable — the combined membership of servers running the bot.
- Verified gamers per game — distinct linked accounts through that game's
  providers. (A gamer who linked two providers for one game can be counted
  twice, so it is a ceiling; never present it as unique reach.)
- Challenges, prize pools, and what a server's members have won.

**Modelled, must be labelled:**

- Projected monthly impressions. It is reachable audience ×
  `pricing.impressionsPerMember`, weighted by games sponsored, and the pricing
  page prints that formula next to the number. Do not put it in a contract.

When the network is empty the pages say "Growing" rather than "0 gamers
reachable" — but they never invent a number to fill the gap.

---

## Selling it

The funnel is deliberately short because "contact us for pricing" loses the
brand who only wanted to know whether we were a $600 or a $60,000 decision:

`/pricing` → move the slider → **Talk to us** → `/brands?games=3&addon=1` →
form → `Admin → Enquiries`

The enquiry arrives carrying the configuration they had on screen — tier, games,
add-on, billing, quoted monthly — so the first reply already knows the plan and
the budget. Work the queue from **New**; set **Contacted** when you reply so the
open-pipeline total stays honest.
