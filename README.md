# Cluster

**The media-buying and monetization layer for gaming communities.**

Discord holds the world's gaming audience and has no advertising market. Brands
can't buy it, server owners can't sell it, and gamers get nothing from either.
Cluster is the layer that makes all three possible with one bot.

- **Brands** buy sponsored weekly challenges and a creative slot on every card
  the bot draws — with reach, entrants, CTR and cost-per-entrant reported back.
- **Server owners** earn a share of every sponsored challenge that runs in their
  server, and climb tiers as more of their members link a game.
- **Gamers** link the games they already play, enter as many challenges as they
  like on one account, and compete for real prize money.

**$250 buys a sponsored challenge. $175 of it becomes the prize pool and reaches
a gamer. The $75 platform fee is the only line the business lives on.**

---

## Run it

```bash
npm install
npm run dev          # http://localhost:3000
```

With no `DATABASE_URL`, the app boots an **in-memory Postgres** (PGlite) seeded
with a demo universe — real games, real challenges, a brand portal with a month
of delivery behind it. Nothing external is required to see the whole product.

```bash
DEMO_DB=1 npm run build && DEMO_DB=1 npx next start   # the demo, built
npx tsc --noEmit                                      # typecheck
```

Demo logins: `nova@demo.gg` / `cluster-demo` · `admin@clustergg.com` / `cluster-admin`.

## Where things are

| Path | What lives there |
|---|---|
| `app/` | Routes. `admin/` is the console, `brands/[slug]` and `servers/[slug]` are the key-gated portals, `api/discord/` is the bot. |
| `lib/discord/` | The bot: interactions, screens, announcements, HQ. |
| `lib/cards/` | The PNG card engine — every image the bot posts, and every link preview. |
| `lib/providers/` | Game integrations. One adapter per API, one registry entry per provider. |
| `lib/db/` | Drizzle schema, self-healing DDL, and the demo seed. |
| `docs/` | [Architecture](docs/ARCHITECTURE.md) · [Operations](docs/OPERATIONS.md) · [Deploy](docs/DEPLOY.md) · [Business](docs/BUSINESS.md) · [Security](SECURITY.md) |

## The rules that keep it working

1. **Never delete a row that analytics point at.** Retire it. A brand's numbers
   belong to the placement, not to the file currently in it.
2. **Announcements about a person go to that person's servers.** Fanning them out
   to every server is how a bot gets muted, then removed.
3. **Anything that speaks into Discord runs once a day.** Anything that keeps
   data fresh runs hourly. They are different jobs with different answers.
4. **The demo has to demonstrate the product**, including its empty states.
