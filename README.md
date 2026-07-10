# Cluster — Full Technical Execution Plan

**Brand:** Cluster
**Domain:** clustergg.com
**Purpose of this doc:** Single source of truth for an autonomous coding session (e.g. Claude Code) to build this product end-to-end — architecture, data model, every page, every route, every integration, every env var, and build order. No application code included by design.

---

## 1. Product Summary

A platform where gamers connect multiple game accounts (PC/console/mobile) + Discord, get a public shareable profile (`clustergg.com/u/{slug}`) showing linked accounts, ranks, stats, history, and earned badges. Users follow/message each other, join game-specific community **Spaces**, compete in **Challenges** built on real API data, and climb per-game **Leaderboards**. Monetized via banner/video ad placements sold to brands, with a full admin/brand-management back office.

---

## 2. Tech Stack

| Layer | Choice | Notes |
|---|---|---|
| Hosting/Deploy | **Vercel** | Next.js App Router, Edge + Serverless functions, Vercel Cron for sync jobs |
| Framework | **Next.js 15 (App Router, TypeScript)** | SSR for public profiles (SEO), CSR for app shell |
| Database | **Neon (Postgres, serverless)** | Branching for staging, connection pooling via Neon Pooler / PgBouncer |
| ORM | **Drizzle ORM** or Prisma (Drizzle preferred for edge-compat + Neon serverless driver) | `@neondatabase/serverless` driver |
| Auth | **NextAuth.js (Auth.js v5)** | Custom OAuth providers for Riot, Epic, Discord; email/password fallback optional |
| File/Media storage | **Vercel Blob** or Cloudflare R2 | Ad creatives, avatars, banners, video ad files |
| Cache/Queue | **Upstash Redis** (serverless, Vercel-native) | Rate-limit counters, job queues, leaderboard caching |
| Background jobs | **Vercel Cron Jobs + QStash (Upstash)** | Scheduled per-provider stat syncs, respecting rate limits |
| Realtime (messages, live challenge leaderboard) | **Pusher** or **Ably**, or Neon + Postgres LISTEN/NOTIFY via a lightweight WS relay (Soketi) | Pusher simplest on Vercel |
| Search | Postgres full-text (pg_trgm) initially; Algolia/Meilisearch later | For gamer/space/post search |
| Analytics (ads) | Custom event pipeline → Neon (or Tinybird/ClickHouse later for scale) | Vercel Edge Middleware to capture geo/IP/UA cheaply |
| Video ads | Mux or Cloudflare Stream for transcoding/adaptive playback | 5s cap enforced client-side + server validated on upload |
| Email | Resend | Transactional (welcome, digest, moderation notices) |
| Design generation | Higgsfield connector (via Claude) | For landing/marketing visual assets, banners, badge art |
| Monitoring | Vercel Observability + Sentry | Error tracking, API failure alerts (esp. provider syncs) |

---

## 3. Environment Variables

```
# Core
DATABASE_URL=                     # Neon pooled connection string
DATABASE_URL_UNPOOLED=            # Neon direct connection (migrations)
NEXTAUTH_URL=
NEXTAUTH_SECRET=
NEXT_PUBLIC_APP_URL=https://clustergg.com

# OAuth / Game Providers
DISCORD_CLIENT_ID=
DISCORD_CLIENT_SECRET=
DISCORD_BOT_TOKEN=                # for guild/presence lookups if needed

RIOT_CLIENT_ID=                   # RSO (Riot Sign-On) — requires product approval
RIOT_CLIENT_SECRET=
RIOT_API_KEY=                     # personal/prod key from developer.riotgames.com

EPIC_CLIENT_ID=
EPIC_CLIENT_SECRET=

STEAM_API_KEY=                    # OpenID + Web API
XBOX_CLIENT_ID=                   # via Microsoft identity platform (Xbox Live API/OpenXBL)
XBOX_CLIENT_SECRET=
PSN_NPSSO_PROXY_KEY=              # PSN has no official public API — use community wrapper cautiously, flag legal risk
ACTIVISION_UNOFFICIAL_KEY=        # COD stats — unofficial, flag legal risk

# Storage / Media
BLOB_READ_WRITE_TOKEN=            # Vercel Blob
MUX_TOKEN_ID=
MUX_TOKEN_SECRET=

# Cache / Queue
UPSTASH_REDIS_REST_URL=
UPSTASH_REDIS_REST_TOKEN=
QSTASH_TOKEN=
QSTASH_CURRENT_SIGNING_KEY=
QSTASH_NEXT_SIGNING_KEY=

# Realtime
PUSHER_APP_ID=
PUSHER_KEY=
PUSHER_SECRET=
PUSHER_CLUSTER=

# Email
RESEND_API_KEY=

# Analytics / Ads
AD_ANALYTICS_SALT=                # hashing IPs before storage (privacy)
SENTRY_DSN=

# Admin
ADMIN_JWT_SECRET=
SUPERADMIN_SEED_EMAIL=
```

---

## 4. Data Model (Neon / Postgres — table-level spec)

> Design principle: one `linked_accounts` table generic across providers, with a `provider_data` JSONB payload per-provider, plus normalized `stat_snapshots` for leaderboard queries.

**users**
`id, email, phone, password_hash (nullable), display_name, slug (unique, indexed), avatar_url, banner_url, bio, country, created_at, last_login_at, status (active/suspended/banned), primary_signup_provider, is_verified, role (user/admin/superadmin/brand)`

**oauth_identities**
`id, user_id, provider (discord/riot/epic/steam/xbox/psn), provider_user_id, access_token (encrypted), refresh_token (encrypted), expires_at, scopes, connected_at`

**linked_game_accounts**
`id, user_id, provider, provider_account_id, in_game_name, region/shard, verified, sync_status (ok/rate_limited/error/revoked), last_synced_at, next_sync_at, provider_data JSONB`

**stat_snapshots**
`id, linked_account_id, game, metric_key (e.g. "rank_tier", "kd_ratio", "win_rate", "mmr"), metric_value, recorded_at` — append-only, indexed on (game, metric_key, metric_value) for leaderboards; also a `stat_current` materialized/denormalized table for fast reads.

**stat_current** (denormalized, one row per account per metric)
`linked_account_id, game, metric_key, metric_value, rank_label, updated_at`

**badges**
`id, code, name, description, icon_url, category (game/community/challenge/platform), criteria JSONB (threshold rules), is_active`

**user_badges**
`id, user_id, badge_id, context (space_id/game/null), awarded_at`

**follows**
`follower_id, following_id, created_at` (composite PK)

**conversations** / **conversation_participants** / **messages**
`messages: id, conversation_id, sender_id, body, attachments JSONB, created_at, read_by JSONB`

**leaderboards**
`id, game, metric_key, scope (global/region/space/challenge), title, refresh_interval`

**leaderboard_entries** (materialized/cached, rebuilt by cron)
`leaderboard_id, user_id, linked_account_id, rank_position, value, updated_at`

**spaces**
`id, slug, name, description, game (nullable for non-game spaces), cover_image, is_default, is_active, created_by (admin), member_count, post_count`

**space_members**
`space_id, user_id, joined_at, role (member/moderator)`

**space_join_requests / new_space_requests**
`id, requested_by, proposed_name, reason, status (pending/approved/rejected), reviewed_by, reviewed_at`

**posts**
`id, space_id, author_id, body, media JSONB (images/video/links), mentions JSONB(user_ids), created_at, edited_at, deleted_at (soft delete), is_pinned`

**post_reactions**
`post_id, user_id, reaction_type (like/dislike/meh), created_at` — one row per user per post (enforce unique, allow update/delete = "unlike")

**comments**
`id, post_id, parent_comment_id (nullable, for replies), author_id, body, created_at, deleted_at`

**comment_reactions**
`comment_id, user_id, reaction_type, created_at`

**space_expert_scores**
`space_id, user_id, points, tier (contributor/helper/expert), computed_at` — recalculated by scheduled job from posts+comments+reactions volume/recency

**challenges**
`id, space_id, game, title, description, format (top1/top3/threshold_race), rules JSONB (metric conditions, e.g. {matches:5, min_wins:3, metric:"win_loss"}), points_engine JSONB (points per event type), start_at, end_at, status (draft/active/completed/cancelled), prize_description, created_by (admin)`

**challenge_participants**
`id, challenge_id, user_id, linked_account_id, joined_at, current_points, status (active/completed/disqualified), proof_submission JSONB`

**challenge_events** (append-only ledger of every scored event)
`id, challenge_id, participant_id, source_event (match_id from provider), event_type (win/loss/stat_delta), points_awarded, raw_payload JSONB, created_at`

**challenge_leaderboard_entries** (live, updated per event)
`challenge_id, user_id, rank_position, points, updated_at`

**brands**
`id, name, logo_url, industry (hardware/retail/tech/f&b/other), contact_email, status (active/paused), created_at`

**ad_creatives**
`id, brand_id, name, type (image/video), file_url, dimensions (width, height), duration_seconds (video, max 5), placement_tags (array), status (pending_review/approved/rejected)`

**ad_placements** (defines a slot on the site)
`id, key (e.g. "profile_top_banner", "leaderboard_sidebar", "feed_inline"), page_scope, device (desktop/mobile/both), width, height, max_creatives_in_rotation, rotation_interval_seconds`

**ad_campaigns**
`id, brand_id, name, start_date, end_date, budget, target_geo, target_device, status`

**ad_campaign_creatives**
`campaign_id, creative_id, placement_id, weight, priority`

**ad_impressions**
`id, campaign_creative_id, user_id (nullable, if logged in), session_id, page_path, device_type, hashed_ip, geo_country, geo_city, user_agent, viewport, timestamp, duration_viewed_ms`

**ad_clicks**
`id, impression_id, timestamp`

**audit_log** (admin actions)
`id, admin_id, action, target_type, target_id, meta JSONB, created_at`

---

## 5. Authentication & Account Creation Flow

1. **Sign-up entry points:** "Continue with Discord", "Continue with Riot", "Continue with Epic", plus email/password.
2. First OAuth login creates `users` row + `oauth_identities` row; `slug` auto-generated from display name (`/settings/profile` lets them customize once).
3. Immediately after account creation → **onboarding wizard** (see Page 4 below) to link additional accounts.
4. On every successful OAuth link (whether at signup or later from Settings), enqueue an **initial full sync job** (QStash) for that provider/account.
5. Token refresh: a scheduled job (per provider) refreshes access tokens before expiry; failed refresh flips `sync_status = 'revoked'` and prompts the user to reconnect.
6. Session strategy: JWT session via NextAuth, httpOnly secure cookies; separate elevated session claim for `role=admin`.

**Riot specifics:** Requires Riot Sign-On (RSO) product registration — separate approval process from a normal Riot API key. Plan for approval lead time; use API key + regional routing (`na1`, `euw1`, etc.) for stats endpoints (Account-V1, League-V4, Match-V5). Respect Riot's app rate limits (typically 20 req/1s, 100 req/2min per key — confirm current limits at approval time).

**Epic specifics:** Epic Online Services (EOS) OAuth for identity; Fortnite stats via unofficial third-party aggregators only if no official public stats API exists at build time — flag as "verify availability," do not hard-commit.

**Discord specifics:** OAuth scopes `identify`, `guilds` (optional), `connections` (to also pull the user's *other* linked platforms shown on their Discord profile, if permitted).

**Steam/Xbox/PSN:** Steam has an official Web API (OpenID + `ISteamUser`, `IPlayerService`) — straightforward. Xbox requires Microsoft identity platform + Xbox Live Services API (or OpenXBL as a wrapper — flag ToS risk). PSN has **no official public API**; using unofficial ones carries real account-suspension/legal risk for end users — this must be a flagged product decision, not silently built.

---

## 6. Provider Sync Engine (core backend service)

- **Queue-based, per-account, per-provider jobs** via QStash, scheduled with jittered intervals (e.g. every 15–60 min depending on provider rate limits and plan tier).
- **Rate limiter:** Upstash Redis token-bucket per API key/provider (e.g. `riot:na1` bucket), shared across all sync jobs hitting that provider — never let two jobs race past the shared limit.
- **Sync job responsibilities:**
  1. Pull latest match/rank/profile data for the account.
  2. Diff against `stat_current`; write new `stat_snapshots` rows only on change.
  3. Evaluate badge criteria (see §7) against new data.
  4. Evaluate active `challenge_participants` tied to this account (see §9) — score new events.
  5. Update `next_sync_at`; on 429/error, apply exponential backoff and mark `sync_status`.
- **Dead-letter handling:** repeated failures (e.g. 5 consecutive) → mark account `error`, notify user via email/in-app to reconnect.
- **Backfill vs incremental:** initial link does a bounded historical pull (e.g. last 20 matches / current rank); subsequent syncs are incremental (new matches since last known match ID).

---

## 7. Badges Engine

- `badges.criteria` is a small rules JSON evaluated by a shared evaluator function, e.g.:
  - `{"type":"stat_threshold","metric":"rank_tier","game":"valorant","min":"diamond"}`
  - `{"type":"account_linked","provider":"riot"}` → "Verified Summoner" badge on first successful link
  - `{"type":"community_activity","space_scope":true,"posts_min":20,"reactions_received_min":50}` → space Expert badge (feeds from `space_expert_scores`)
  - `{"type":"challenge_result","placement":"top3"}` → Challenge Medal badge
- Evaluation triggers: after every sync job, after every post/comment/reaction write, after every challenge event, and a nightly full re-evaluation sweep for anything missed.
- Badges render on: profile page, next to username in Space posts/comments, on leaderboard rows, on challenge leaderboard rows.

---

## 8. Leaderboards

- One leaderboard per **(game, metric)** pair (e.g. Valorant/Rank, Valorant/K-D, League/Win Rate), plus per-Space and per-Challenge leaderboards.
- `leaderboard_entries` is a cache table rebuilt by scheduled job (every X minutes) from `stat_current`, not computed live on every page view.
- Global leaderboard page supports filters: game, region, time range (all-time/monthly/weekly), friends-only toggle (only people the viewer follows).
- Challenge leaderboards are the exception — updated **live**, incrementally, per `challenge_events` write (pushed to client via Pusher for real-time movement).

---

## 9. Challenges Engine

**Admin Challenge Builder** (see Admin pages, §12) lets an admin, per Space/game, configure:
1. **Metric source** — which fields the connected provider's API exposes (a per-game "capability schema" maintained by engineering as new providers are added, e.g. Riot exposes `match_id, win/loss, kills, deaths, assists, rank_delta`).
2. **Rule builder** — condition tree over those fields (e.g. "matches_played >= 5 AND wins >= 3" or "kills - deaths >= 10 in a single match").
3. **Points config** — points awarded per qualifying event (e.g. +10 per win, +2 per match played, -0 per loss).
4. **Format** — `top1_winner`, `top3_winners`, or `threshold_race` (first N to hit a target).
5. **Window** — start/end datetime, individual-only (no matchmaking — purely tracks each participant's own history).
6. **Proof requirement** — optional manual proof upload (screenshot/video) in addition to API-verified data, for games without full API coverage.

**Runtime flow:**
- User joins a challenge from a Space page → creates `challenge_participants` row, snapshots their current provider match-history cursor as the baseline (so only *new* activity after joining counts).
- Every sync job, after regular stat sync, checks: does this account have any **active** challenge participation? If yes, run the challenge's rule tree against new match events since last cursor → write `challenge_events`, increment `current_points`, upsert `challenge_leaderboard_entries`, push realtime update.
- On `end_at`, a cron job finalizes standings, marks challenge `completed`, awards placement badges, and notifies top 1 or top 3 (per format) for prize fulfillment (manual by admin/brand — no auto-payout in v1).

**Per-game "capability schema" library** (config, not code, but must be planned): a maintained JSON reference per provider listing exactly which fields/events are pullable, so admins building challenges only see valid options in the builder UI. This is the guardrail that keeps challenges technically feasible.

---

## 10. Spaces (Community)

- **Default seeded spaces at launch:** one per initially-integrated game (e.g. Valorant, League of Legends — both from Riot; Fortnite — Epic; plus 2-3 general spaces: "General Gaming", "Hardware & Setups", "LFG / Team Finder"). Total ~6 at launch as specified.
- Each space: members, posts (text/image/video/link, emoji, @mentions of followed users), comments (threaded one-level replies), reactions on posts and comments limited to exactly 3 states: `like / dislike / meh`, toggleable (re-clicking removes it).
- Next to a poster's name in a Space: badge for verified game account tied to that space's game, plus their space Expert tier if earned.
- **Space Expert scoring job** (nightly): tallies posts/comments/reactions-given & received in a rolling window, applies threshold tiers (`Contributor → Helper → Expert`) configured per space by admin.
- **New Space Requests:** any user can submit a request (proposed name + reason) → appears in Admin moderation queue → approve (auto-creates space, optionally auto-creates a matching leaderboard/challenge template if tied to a game) or reject with reason (emailed to requester).

---

## 11. Ads & Monetization System

**Placement inventory (define concrete slots, each an `ad_placements` row):**
| Placement key | Location | Desktop size | Mobile size | Type |
|---|---|---|---|---|
| `landing_hero_banner` | Landing page below hero | 970×250 | 320×100 | image/video |
| `profile_top_banner` | Top of every gamer profile | 728×90 | 320×50 | image/video |
| `profile_sidebar` | Profile page right rail | 300×250 | — (hidden on mobile) | image/video |
| `leaderboard_inline` | Every 10 rows in leaderboard tables | 728×90 | 300×50 | image |
| `feed_inline` | Every 6 posts in a Space feed | 728×90 | 320×100 | image/video |
| `challenge_sidebar` | Challenge detail page rail | 300×600 | — | image/video |
| `messages_footer` | Above message compose box | 320×50 | 320×50 | image |
| `interstitial_video` | Between page transitions (capped frequency) | 640×360 | 320×180 | video only, max 5s |

- **Video ad rule:** hard cap 5 seconds, enforced (a) at upload validation (reject longer files) and (b) at playback (auto-advance to next creative in rotation at 5s regardless of source length).
- **Rotation:** a placement can hold >1 active creative; client cycles every `rotation_interval_seconds` (admin-configurable per placement, default 5s to match video cap) with a subtle fade/slide transition; impression logged per creative shown, not per placement load.
- **Scheduling:** `ad_campaigns` has start/end date, target geo, target device; a placement resolves "what to show now" by querying active campaigns mapped to that placement, filtered by targeting, weighted by `weight`/`priority`.
- **Brand Management (Admin):**
  - Brand CRUD (name, logo, industry, contacts).
  - Per-brand Campaign CRUD.
  - Creative library: upload image/video, auto-detect dimensions, validate against the placement's required size (with a published **size guide page** for self-serve brand reference, desktop + mobile specs table exactly as above), approve/reject workflow before a creative goes live.
  - Assign creatives → placements → campaigns with scheduling calendar view.
- **Ad Analytics (Admin):**
  - Per-creative: impressions, clicks, CTR, avg. viewed duration, unique users reached.
  - Filters: date range, placement, device, geo (country/city), brand, campaign.
  - Underlying event capture: `ad_impressions` row per render with `hashed_ip` (never store raw IP — hash with `AD_ANALYTICS_SALT`, satisfies analytics need while reducing raw PII exposure), geo resolved server-side (via Vercel Edge geolocation headers — no third-party IP lookup call needed), device/UA, session id, timestamp, viewed duration (via IntersectionObserver beacon).
  - **Privacy/compliance note (flag, don't skip):** collecting IP/geo/device data on every visitor triggers GDPR/CCPA obligations — plan requires a cookie-consent banner, a published privacy policy, and a data-retention policy (e.g. raw impression rows aggregated + purged after 90 days) before this ships in any EU/CA-facing market.

---

## 12. Full Page & Route Map

### Public / Marketing
- `/` — Landing page (hero, "connect every game account" pitch, live ticker of recent challenge winners, challenge engine highlight section, badge showcase, testimonials, CTA to sign up, footer)
- `/pricing` (if brand self-serve later) or `/for-brands` — brand pitch page for ad sales
- `/leaderboards` — global leaderboard hub (game selector grid)
- `/leaderboards/[game]/[metric]` — specific leaderboard table
- `/spaces` — directory of all spaces
- `/spaces/[slug]` — space feed (posts, join button, members, pinned challenge banner)
- `/spaces/[slug]/challenges/[challengeId]` — challenge detail + live leaderboard + join button
- `/u/[slug]` — **public gamer profile** (this is the shareable link-in-bio page)
- `/login`, `/signup`
- `/legal/privacy`, `/legal/terms`, `/legal/cookies`

### Authenticated App Shell
- `/onboarding` — multi-step: choose display name/slug → connect game accounts (grid of provider buttons with connect status) → connect Discord → follow suggestions → done
- `/feed` (or `/home`) — aggregated feed from joined Spaces + followed users' activity
- `/profile` (own profile editor view, same layout as `/u/[slug]` but with edit affordances)
- `/settings/account` — email, password, delete account
- `/settings/connections` — manage linked game accounts (connect/reconnect/unlink), Discord connection
- `/settings/notifications`
- `/settings/privacy` — profile visibility, who can message me
- `/messages` — conversation list
- `/messages/[conversationId]` — thread view
- `/following` / `/followers` — lists
- `/spaces/[slug]/new-post`
- `/spaces/request-new` — new space request form
- `/notifications`
- `/search` — unified search (gamers, spaces, posts)

### Gamer Profile (`/u/[slug]`) — sections on one page
1. Header: avatar, banner, display name, slug + copy-link button, follow/message buttons, bio, country flag
2. Connected accounts row: provider icons with in-game name + rank badge, click → expands per-game stat card
3. Badges shelf (platform, game, community, challenge badges)
4. Per-game stat cards: rank, W/L, key metrics, mini match history list (last 5–10 matches)
5. Discord card: username, connected servers in common (if scope allows)
6. Leaderboard standings widget: "Top X% in [Game]" pulled from `leaderboard_entries`
7. Activity feed: recent posts/comments in Spaces
8. Challenge trophy case: past challenge placements
9. `profile_top_banner` + `profile_sidebar` ad slots

### Admin (`/admin/*`, role-gated)
- `/admin` — dashboard (DAU/MAU, new signups, sync job health, revenue snapshot)
- `/admin/users` — table with search/filter, view user detail, suspend/ban, force-unlink account, impersonate (support), full CRUD
- `/admin/users/[id]` — full profile incl. linked accounts, badge history, challenge history, moderation notes
- `/admin/linked-accounts` — global view of all linked accounts, sync status, manual re-sync trigger, provider error monitor
- `/admin/badges` — CRUD badge definitions + criteria rule builder
- `/admin/leaderboards` — CRUD leaderboard definitions, manual rebuild trigger
- `/admin/spaces` — CRUD spaces, moderation queue (delete post, remove member, edit pinned content)
- `/admin/spaces/requests` — approve/reject new space requests
- `/admin/spaces/[id]/experts` — configure Expert-tier thresholds
- `/admin/challenges` — Challenge Builder (rule tree UI, points config, format picker, schedule) + list of active/past challenges
- `/admin/challenges/[id]/live` — real-time participant tracker & manual override (disqualify, adjust points)
- `/admin/brands` — Brand CRUD
- `/admin/brands/[id]/campaigns` — Campaign CRUD
- `/admin/creatives` — Ad creative library, upload, review/approve queue, size-guide reference panel
- `/admin/placements` — Ad placement CRUD (sizes, rotation interval, max creatives)
- `/admin/ads/schedule` — calendar view mapping campaigns → placements → date ranges
- `/admin/ads/analytics` — impressions/clicks dashboards with filters described in §11
- `/admin/audit-log` — admin action history
- `/admin/settings` — platform-wide config (rate-limit tuning, feature flags)
- `/admin/roles` — manage admin/moderator/brand-user accounts and permissions

---

## 13. Game Provider Integration List (target order)

**Phase 1 (launch):**
1. Discord (identity + connections)
2. Riot Games (Valorant + League of Legends via Account-V1/League-V4/Match-V5) — requires RSO approval, start this application immediately, it's the longest lead time
3. Epic Games (Fortnite identity via EOS; stats coverage TBD/flagged)

**Phase 2:**
4. Steam (official Web API — profile, owned games, playtime, achievements)
5. Xbox Live (via Microsoft identity platform)
6. Battle.net / Blizzard (Overwatch, if public API access available)

**Phase 3 (flag legal review before building):**
7. PlayStation Network (no official public API — unofficial wrapper risk)
8. Activision/COD stats (unofficial API risk)
9. Mobile titles (case-by-case; most mobile games have no public stats API — likely manual/proof-based challenges only)

For every provider, engineering must produce a one-page "capability schema" (auth type, scopes, rate limits, exact stat fields available, historical match depth) before it's wired into the Challenge Builder or onboarding flow.

---

## 14. Build Phases (execution order for the coding agent)

**Phase 0 — Foundations**
- Repo scaffold (Next.js + TS + Tailwind), Vercel project, Neon DB provisioned, Drizzle schema from §4, CI (lint/typecheck/build on PR), Sentry wired.

**Phase 1 — Auth & Core Profile**
- NextAuth + Discord provider, users/oauth_identities tables, onboarding wizard, `/u/[slug]` basic profile (no stats yet), settings/connections page.

**Phase 2 — Riot + Epic Integration & Sync Engine**
- OAuth providers for Riot/Epic, `linked_game_accounts`, QStash sync jobs, Upstash rate limiter, `stat_current`/`stat_snapshots`, provider capability schema docs.

**Phase 3 — Badges & Leaderboards**
- Badge evaluator engine, badge CRUD (admin), leaderboard cache-rebuild cron, `/leaderboards` pages.

**Phase 4 — Spaces & Social**
- Spaces CRUD (admin seeds default 6), posts/comments/reactions, follow system, messages (Pusher realtime), Space expert scoring job.

**Phase 5 — Challenges Engine**
- Challenge Builder admin UI, rule evaluator, challenge_events ledger, live leaderboard via Pusher, challenge pages on public side.

**Phase 6 — Ads & Monetization**
- Placement/creative/campaign CRUD, ad-serving logic per placement, impression/click beacon capture, analytics dashboards, size-guide page, brand management.

**Phase 7 — Landing Page & Visual Polish**
- Marketing landing page, Higgsfield-generated hero/badge/illustration assets, mobile nav polish, full responsive pass, performance/SEO pass (Core Web Vitals, OpenGraph tags per profile for shareability).

**Phase 8 — Admin Hardening & Launch**
- Role-based access control across all `/admin/*`, audit log, cookie-consent + privacy policy, load-test sync engine against real rate limits, staged rollout (Riot RSO approval gating go-live date), production env var audit.

---

## 15. Open Items Requiring a Human Decision Before Build

1. **Riot RSO approval** — apply now; this is the critical-path bottleneck for the flagship integration.
2. **Epic Fortnite stats coverage** — confirm current official API surface before promising stat pulls beyond identity.
3. **PSN/Activision unofficial APIs** — legal/ToS risk sign-off required; recommend launching without these and adding manual proof-based challenges for those games instead.
4. **Ad privacy compliance** — cookie consent + privacy policy must ship in Phase 6, not after.
5. **Brand name / final domain** — needed for OAuth redirect URIs, which must be registered with Discord/Riot/Epic developer portals ahead of Phase 1–2.

---

*End of plan.*
