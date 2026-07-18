# Cluster — Technical Product Brief

**Brand:** Cluster · **Domain:** clustergg.com · **Tagline:** _Every game. One identity._

This brief is the source content for a product-overview slide deck: what Cluster
is, how it's built, the page/feature map, and where screenshots go.

---

## 1. One-liner

Cluster is a **cosmic, game-styled identity layer for gamers**: link every game
account you own into one shareable profile, then compete in challenges, climb
real API-verified leaderboards, and progress through galaxy-spanning **Quests**
that turn everything you do into **Cluster Points (CP)**.

## 2. The problem

A gamer's identity is fragmented across a dozen platforms (Riot, Steam, Chess.com,
Epic, Xbox, PlayStation, mobile). There's no single, credible, shareable place
that proves _"this is who I am across every game I play."_ Communities (Discord
servers) have the audience but no native way to surface stats, run cross-game
competitions, or monetize.

## 3. The product

- **One profile, every game** — `clustergg.com/u/{slug}` shows linked accounts,
  real ranks/stats, trophies, and quest progress. Fully customizable (themes,
  layouts, cover art, per-section art).
- **Planets** — every game is an interactive planet: a 3D-styled globe hero with
  region pins, its community feed, challenges, and leaderboards.
- **Challenges** — time-boxed competitions scored on **real provider API data**
  (wins, rating, KDA, PBs…), with live standings and a countdown.
- **Quests** — four cosmic quests (Conquest, Orbit, Ascension, Signal). Every
  action earns CP; a treasure-map hero tracks your climb Bronze → Platinum with
  a live "you are here" marker on real milestones.
- **Leaderboards** — per-game, API-verified rankings; a galaxy leaderboards page
  toggles games and shows every board side by side.
- **Ads** — house + brand banner/video placements across the app, with a full
  offline-sales admin (brands, campaigns, creatives, placements, analytics) and a
  glorified **brand portal** at `/brands/{slug}` that brands open with an access
  key (no account): animated totals, trend sparklines, marketing intelligence,
  per-campaign analytics, and self-serve creative upload.

## 4. Tech stack

| Layer | Choice |
|---|---|
| Framework | Next.js 15 (App Router, TypeScript, React 19) |
| Hosting | Vercel (serverless + Cron) |
| Database | Neon (serverless Postgres) with a PGlite in-memory fallback for demo |
| ORM | Drizzle (dual driver: neon-http / PGlite) |
| Auth | Custom JWT sessions (`jose`) + bcrypt; OAuth (Discord/Epic/Battle.net/Riot) |
| Media | Vercel Blob (public store), browser-side downscaling, 1-year immutable cache |
| Styling | Tailwind v4, custom cosmic design system |
| Art pipeline | Higgsfield (nano_banana) for planet/quest/emblem art, admin-replaceable |

Design principles: **server-rendered for SEO** (public profiles, planets),
**force-dynamic** app shell, **self-healing migrations** (schema + backfills run
idempotently every boot), and **everything is admin-editable via a CMS**
(content, backgrounds, card art, logos, favicon, per-page/per-planet look).

## 5. Data model (core tables)

`users`, `linked_game_accounts`, `stat_current` · `games`, `spaces` (planets) ·
`challenges`, `challenge_participants`, `challenge_events` · `leaderboards` ·
`quests`, `quest_tiers`, `user_quest_progress`, `user_quest_tiers`, `quest_events` ·
`posts`, `follows`, `conversations`, `messages`, `notifications` ·
`brands`, `ad_campaigns`, `ad_creatives`, `ad_placements`, `ad_impressions` ·
`platform_settings` (CMS key→value).

## 6. Integrations (launch partners)

**Live / API-integrated providers (adapters shipped):** Chess.com, Lichess,
Dota 2 (OpenDota), Speedrun.com, Roblox, Steam, League of Legends, VALORANT,
Fortnite, Hypixel (Minecraft), PUBG, CS2 (FACEIT), Clash of Clans, Clash Royale,
Brawl Stars, Xbox Live, osu!, Apex Legends (TRN), Battle.net, Epic Games,
Discord, Mobile Legends, PlayStation Network, Call of Duty.

Each provider has a typed adapter + capability list (what we can track), so
challenges and leaderboards are built on real, verifiable metrics.

## 7. Page / feature map (screenshot targets)

| Page | What to capture |
|---|---|
| Home `/` | Planet-globe hero with the planet⇄quest toggle; Game Galaxy; live challenges; Quests grid |
| Planet `/planets/{slug}` | Interactive globe hero + quest toggle; live challenge banner w/ countdown; side-by-side leaderboards; feed |
| Quest `/quests/{key}` | Treasure-map hero: how-to-play, milestones, "you are here" rocket, CP leaderboard |
| Quests `/quests` | Quest cards (clickable, milestone stories) |
| Leaderboards `/leaderboards` | Game toggle + all boards over the game's cover art |
| Profile `/u/{slug}` | Customized profile: connected accounts, challenge cards, planets, quests, stats |
| Feed `/feed` | Gamer dashboard: stats, explore planets+quests, live challenges, feed |
| Onboarding `/onboarding` | Connect any provider (API/OAuth), existing accounts, covers |
| Admin `/admin/*` | Mission Control: games, planets, challenges, quests, leaderboards, ads, brand kit, backgrounds, image-storage audit, roles & staff-access |
| Brand portal `/brands/{slug}` | Key-gated brand dashboard: animated totals, trends, marketing intelligence, per-campaign analytics, creative upload |

## 8. Status

MVP is **production-ready**: full gamer flows, admin CMS, ads back office + brand
portal, quests, challenges, leaderboards, delegated staff access (RBAC), a
Blob-backed media pipeline (Neon stores only links), and a security-audited
posture (see `SECURITY.md`). Pre-revenue on brand ads; early community; growing.

## 9. Companion docs

Engineering: [`ENGINEERING_HANDOVER.md`](./ENGINEERING_HANDOVER.md). Operations:
[`STAFF_OPERATIONS.md`](./STAFF_OPERATIONS.md). Security: [`../SECURITY.md`](../SECURITY.md).
Setup & deploy: [`../SETUP_GUIDE.md`](../SETUP_GUIDE.md), [`../DEPLOYMENT.md`](../DEPLOYMENT.md).
