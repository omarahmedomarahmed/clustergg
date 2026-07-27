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

Two sides. Brands pay in. Servers get paid out.

---

## What we sell

| Tier | Monthly | What it is |
|---|---|---|
| **Reach** | `pricing.reachBase` (default $600) | Every placement, the self-serve brand portal, full analytics. |
| **Challenge** | `pricing.challengeBase` + `pricing.perGame` × games (default $500 + $1,000/game) | Everything in Reach at a reduced base, plus 4 sponsored challenges a month **per game** with naming rights. One game = $1,500. |
| **Ultimate** | `pricing.ultimateBase` + all games (default $400 + $6,000 = **$6,400**) | Every game, every challenge, premium placement, Discord placement, the Sunday shout-out, and 2 × 5-second video slots. |

**Add-on, any plan:** `pricing.streamAddon` (default $400/month) — presenting
sponsor of the Sunday Profile of the Week broadcast and every clip cut from it.

**Annual:** `pricing.yearlyDiscountPct` off (default 20%).

The tier is not chosen, it is *derived*: zero games is Reach, all games is
Ultimate, anything between is Challenge. That is why the slider on `/pricing`
can move a brand from $600 to $6,400 without them ever picking a plan name.

## What it costs us

One weekly challenge per game. `pricing.games` × `pricing.challengesPerGame` = 24
a month at the defaults, each with a guaranteed minimum pool of
`pricing.prizePool` ($175 — $100 / $50 / $25). That is **$4,200 a month** of
prize money that Cluster funds and pays.

Two things about that number matter commercially:

- **It is fixed, not per sponsor.** The same competition carries whoever is
  sponsoring it. A second brand does not add a second prize pool.
- **It is the only real cost of goods.** The bot runs inside the same Next.js
  application as the website — no gateway process, no always-on host — and cards
  are rendered once and served from a content-hashed URL that Discord's CDN
  caches. The marginal cost of another server is a database row.

## What a server earns

Brands pay per game. The challenges run in the servers whose members play that
game, and the server keeps `pricing.serverSharePct` (default 70%) of the revenue
its community generates.

| Stage | Linked gamers | Unlocks |
|---|---|---|
| Monetized | 500 | Revenue share, sponsored challenges land automatically, owner portal |
| Broadcaster | 1,000 | Paid to carry other communities' challenges, priority in its top game |
| Sponsored | 5,000 | Direct brand sponsorship, keeps the whole fee, named on the broadcast |

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
| The model, pure and shared | `lib/pricing.ts` — types, defaults, `quote()`, `money()`, the earn stages |
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
- Challenges, prize pools, and what a server has earned.

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
