# Architecture

Next.js 15 App Router, React 19, Drizzle on Postgres, deployed on Vercel.
No separate backend, no queue, no websocket server.

## The bot has no process

Discord is spoken to over **HTTP interactions**, not a gateway. One route —
`app/api/discord/interactions/route.ts` — verifies an Ed25519 signature, ACKs
within Discord's 3-second limit, then edits the message with the real answer.
Proactive posts (announcements, ads, reminders) are REST calls with the bot
token from server actions and cron.

This is the constraint everything else bends around: there is no long-running
process, so nothing can hold state between interactions. Navigation state lives
in the button's `custom_id` (`lib/discord/components.ts`), not on a server.

## Every reply is a PNG plus buttons

Discord cannot put a button on an image, and an embed cannot compose one. So a
reply is a **1200×630 PNG** rendered by `next/og` with buttons underneath it.

`lib/cards/` is that engine. `data.ts` builds a typed `CardData` from the
database, `render.tsx` draws it, `cache.ts` stores it in Blob keyed by a content
hash so the same card is drawn once. `/api/card/[kind]` serves them publicly —
which is also why every page's OpenGraph image is one (`lib/og.ts`): a shared
profile link previews that gamer's real card.

Satori has no float, no text measurement, and needs explicit sizes on absolutely
positioned elements. `layout.ts` and `layout-guide.ts` describe every card's
regions so an admin can drag them in the card studio.

## Scoring

A gamer links a game account. `lib/sync.ts` pulls that account's stats from the
provider's API on an hourly cron and writes `stat_current`.

Joining a challenge **snapshots** the account's current stats as a baseline;
only what happens after counts. One account can be in any number of challenges
on the same game at once, and one match moves all of them — the scoring pass
walks every participant row for that account, computes each one's delta against
its own baseline, and awards the challenge's own points.

Metrics discovered *after* joining are recorded into the baseline on first sight,
rather than being treated as a delta from zero. Without that, a gamer who joined
before their first sync scored permanently zero.

## Data

Drizzle schema in `lib/db/schema.ts`. Migrations are a **self-healing idempotent
DDL array** in `lib/db/index.ts`, applied on first connect — so a fresh database
and a five-year-old one converge. **Order matters: an `ALTER` before its `CREATE`
kills boot.**

Two drivers: `neon-http` in production, **PGlite in memory** when there is no
`DATABASE_URL`, which is what makes the demo work with no setup.

## Jobs

`lib/jobs.ts` is the registry. Each job is idempotent, has a **cadence**, and is
also a button in Mission Control so nothing waits for tomorrow.

| Cadence | Cron | Jobs |
|---|---|---|
| hourly | `/api/cron/sync` | Sync due accounts, recompute expert tiers, close finished challenges |
| daily | `/api/cron/daily` | Challenge reminders, Profile of the Week, Discord ads, bot-list stats, leaderboard feed |

The split is enforced in code: a faster cron cannot turn a once-a-day
announcement into an hourly one.

## Ads

`brands → ad_campaigns → ad_campaign_creatives → ad_placements`, with
`ad_impressions` and `ad_clicks` pointing at the **assignment** row.

That row is never deleted, only retired (`retiredAt`). Impressions cascade off
it, so deleting one to replace a creative erased everything the placement had
earned. Rotation, readiness and the portal's creative list filter to live rows;
analytics deliberately do not.

Discord impressions carry a `guildId` and flow through the same tables, so
Discord revenue appears in the brand dashboards rather than a parallel system.

## Access

- **Gamers** — session cookie, `requireUser()`.
- **Staff** — departments own *systems*, and a system owns a set of admin paths
  (`lib/systems.ts`). `pathAllowedFor` gates every page; `ADMIN_ONLY` paths are
  closed to all staff regardless of department.
- **Brands and server owners** — no account. A signed, httpOnly session cookie
  exchanged for an access key at `/api/portal/unlock`, throttled and timing-safe
  (`lib/portal-auth.ts`). A Server Component may not write cookies, which is why
  the exchange is a route handler.
