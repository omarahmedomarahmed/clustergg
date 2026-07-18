# Cluster — Deployment & Operations Guide

Live app: the Vercel project `clustergg` builds from this repo (`main` = production).

> Companion docs: [`README`](./README.md) (overview), [`SETUP_GUIDE`](./SETUP_GUIDE.md)
> (every env var + provider key, click-by-click), [`docs/ENGINEERING_HANDOVER`](./docs/ENGINEERING_HANDOVER.md)
> (architecture), [`SECURITY`](./SECURITY.md) (authz + production checklist).

## How it runs

- **Zero-config demo mode (default):** with no `DATABASE_URL`, the app boots an in-memory
  Postgres (PGlite) inside the serverless function, migrates the full schema, and seeds a
  demo universe (users, spaces, posts, challenges, brands, ads). Everything works — sign-up,
  posting, ads, admin — but state resets whenever the lambda cold-starts.
- **Production mode (Neon):** set `DATABASE_URL` to a Neon pooled connection string and the
  same code runs fully persistent.

## Go persistent with Neon (5 minutes)

1. Create a database at https://neon.tech (free tier is fine) — or in Vercel:
   **Storage → Create Database → Neon**, which injects `DATABASE_URL` automatically.
2. In Vercel → Project → Settings → Environment Variables, set:
   - `DATABASE_URL` — Neon pooled connection string
   - `AUTH_SECRET` — long random string (`openssl rand -base64 32`)
   - `BLOB_READ_WRITE_TOKEN` — a **Vercel Blob** public store token (Storage → Create → Blob). **Required for real image uploads** — all art is stored here so Neon only holds short links. Without it, uploads fall back to inline data URLs, which is fine for demo but must not be used in production (it bloats Neon egress — see the handover doc §4).
   - `AD_ANALYTICS_SALT` — random string used to hash IPs in ad analytics
   - `SETUP_TOKEN` — random string protecting the setup endpoint
   - `CRON_SECRET` — random string (Vercel Cron sends it automatically)
3. Redeploy, then initialize the schema once:
   ```
   curl -X POST "https://<your-domain>/api/setup?token=<SETUP_TOKEN>"        # defaults only
   curl -X POST "https://<your-domain>/api/setup?token=<SETUP_TOKEN>&demo=1" # + demo universe
   ```
4. **The first user to sign up becomes superadmin** (on a defaults-only database).
   In demo seeding, the admin login is `admin@clustergg.com` / `cluster-admin` — change it.

## Make the site public

New Vercel projects have **Deployment Protection** enabled — anonymous visitors get 403.
Turn it off: Vercel → Project → Settings → Deployment Protection → Vercel Authentication → **Disabled**.
Then point `clustergg.com` at the project under Settings → Domains.

## Game provider keys (each unlocks instantly, no code changes)

| Provider | Env var(s) | Where to get |
|---|---|---|
| Chess.com, Lichess, OpenDota (Dota 2), Speedrun.com, Roblox | — | **Live out of the box, no key** |
| Steam | `STEAM_API_KEY` | steamcommunity.com/dev |
| League of Legends / VALORANT | `RIOT_API_KEY` | developer.riotgames.com (apply for production/RSO early — longest lead time) |
| Fortnite | `FORTNITE_API_KEY` | fortnite-api.com (free) |
| Hypixel (Minecraft) | `HYPIXEL_API_KEY` | developer.hypixel.net |
| PUBG | `PUBG_API_KEY` | developer.pubg.com |
| CS2 (FACEIT) | `FACEIT_API_KEY` | developers.faceit.com |
| Clash of Clans / Clash Royale / Brawl Stars | `SUPERCELL_COC_TOKEN` / `SUPERCELL_CR_TOKEN` / `SUPERCELL_BRAWL_TOKEN` | developer.clashofclans.com etc. |
| Xbox Live | `OPENXBL_API_KEY` | xbl.io (community wrapper — review ToS) |
| osu! | `OSU_CLIENT_ID` + `OSU_CLIENT_SECRET` | osu.ppy.sh OAuth |
| Apex Legends | `TRN_API_KEY` | tracker.gg/developers |
| Battle.net / Epic / Discord | client id + secret pairs | identity OAuth (see `.env.example`) |
| PSN / Call of Duty | — | **Intentionally not built** — no official APIs; legal sign-off required (plan §15) |

Provider status is visible at **/admin/settings** (green = live) and on the landing page grid.

## Operations

- **Stat syncs:** on-demand with a 15-min cooldown when a profile is viewed, plus a daily
  Vercel Cron (`/api/cron/sync`, 06:00 UTC) that also finalizes ended challenges and
  recomputes Space expert tiers. Hobby plan allows daily; on Pro you can raise the cadence
  in `vercel.json`.
- **Admin:** `/admin` — site content, page & card backgrounds, logos/brand-kit/favicon,
  games catalog, connect providers, planets, challenge builder, quests + tiers, leaderboards,
  trophies, users, roles & staff-access delegation, linked accounts, brands/campaigns/creatives/
  placements/ad-schedule/analytics, **image storage audit**, settings, audit log. Access is
  role-gated; admins can delegate ads/storage/audit to staff (see `SECURITY.md`).
- **Ads:** creatives go through review; video is hard-capped at 5s (upload + playback);
  impressions store hashed IPs only. Brands self-serve via `/brands/<slug>?key=…` (no login).
- **Media:** all uploaded art lives on Vercel Blob; Neon stores only links. The
  **/admin/storage** page audits every image (source + size) and can re-host stray external/
  inline art to Blob in one click.

## Brand assets

Cosmic identity (hero, logo, badge sprites, ambient, OG image) was generated with
Higgsfield. Uploaded/admin-set art is stored on Vercel Blob; a boot migration re-hosts any
stray external CDN or inline images to Blob automatically. To self-host the static defaults,
place files in `public/assets/` with the same filenames — local files take precedence.
