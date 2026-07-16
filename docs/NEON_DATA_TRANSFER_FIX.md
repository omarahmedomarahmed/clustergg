# Neon data-transfer leak — diagnosis, fix, and what to do next

## TL;DR — what was draining your 5 GB

Uploaded images (avatars, banners, game logos/covers, **planet art**, quest art,
challenge covers, ad creatives) are stored as **base64 `data:` URLs inside
Postgres** whenever `BLOB_READ_WRITE_TOKEN` (Vercel Blob) is **not** configured —
and it is not set in your env. A single 1280px PNG logo is 0.5–2 MB of base64
sitting in a text column.

That alone is fine. What made it explode was **reading those heavy columns on
every request**:

1. **`getCurrentUser()`** ran `SELECT *` on `users` (pulling `avatar_url`,
   `banner_url`, and the `theme` JSONB) on **every page** — Nav, layout, all pages.
2. **`Nav`** (rendered on every request) ran `SELECT *` on `games`, pulling
   `logo_url`, `cover_url`, `planet_image_url`, `planet_bg_url`, `planet_pins`.
3. **Homepage / feed / planet / leaderboard** joined `SELECT * FROM users` for
   every post author, comment author, player and leaderboard row.
4. **`/api/ads/serve`** pulled every eligible creative's full `file_url` (SVG /
   image data URL) on every ad slot, on nearly every page, with no cache.
5. Every route is `export const dynamic = "force-dynamic"` → **no caching**, so
   each of the above hit Neon fresh on every request.

Net effect: each page view transferred **several MB from Neon**. Ordinary bot /
uptime-monitor / preview traffic reached **5 GB in ~12 hours**.

## What was fixed in code (branch `genspark_ai_developer`)

- `getCurrentUser()` now selects only light columns and omits `banner_url` +
  `theme`. A new `getCurrentUserFull()` is used only by the profile editor.
- `Nav` selects only `id, name, slug, logo_url` for nav games.
- Added `publicUserColumns` / `PublicUser` projection; applied to post authors,
  comment authors, planet players, and the leaderboard widget.
- Homepage/feed project games/badges/partners/challenges/users instead of `SELECT *`.
- `serveAds()` ranks/slices first, then fetches `file_url` only for the shown
  creatives; `/api/ads/serve` now has a 60 s in-memory + CDN cache.

**These changes cut the per-request Neon transfer from megabytes to kilobytes.**

## STEP 1 — Diagnose on your (current, dead) database before recreating it

Connect via `psql "$DATABASE_URL"` and run:

```sql
-- Which tables hold the most bytes (data URLs live here):
SELECT relname AS table, pg_size_pretty(pg_total_relation_size(relid)) AS size
FROM pg_catalog.pg_statio_user_tables ORDER BY pg_total_relation_size(relid) DESC LIMIT 15;

-- How much of it is inline base64 images (the actual leak fuel):
SELECT 'games'  AS t, count(*) FILTER (WHERE logo_url LIKE 'data:%' OR cover_url LIKE 'data:%'
        OR planet_image_url LIKE 'data:%' OR planet_bg_url LIKE 'data:%') AS data_url_rows,
        pg_size_pretty(sum(coalesce(length(logo_url),0)+coalesce(length(cover_url),0)
        +coalesce(length(planet_image_url),0)+coalesce(length(planet_bg_url),0))::bigint) AS inline_bytes
FROM games
UNION ALL SELECT 'users', count(*) FILTER (WHERE avatar_url LIKE 'data:%' OR banner_url LIKE 'data:%'),
        pg_size_pretty(sum(coalesce(length(avatar_url),0)+coalesce(length(banner_url),0))::bigint) FROM users
UNION ALL SELECT 'challenges', count(*) FILTER (WHERE cover_url LIKE 'data:%' OR hero_url LIKE 'data:%'),
        pg_size_pretty(sum(coalesce(length(cover_url),0)+coalesce(length(hero_url),0))::bigint) FROM challenges
UNION ALL SELECT 'ad_creatives', count(*) FILTER (WHERE file_url LIKE 'data:%'),
        pg_size_pretty(sum(coalesce(length(file_url),0))::bigint) FROM ad_creatives;

-- Top queries by rows returned (if pg_stat_statements is enabled):
CREATE EXTENSION IF NOT EXISTS pg_stat_statements;
SELECT query, calls, rows, rows/GREATEST(calls,1) AS avg_rows
FROM pg_stat_statements ORDER BY rows DESC LIMIT 10;
```

Track the running total any time (works on Free):
```bash
curl -s -H "Authorization: Bearer $NEON_API_KEY" \
  https://console.neon.tech/api/v2/projects/$PROJECT_ID | grep -o '"data_transfer_bytes":[0-9]*'
```

## STEP 2 — Export ALL your data from the old project (schema + rows)

```bash
# Full logical dump (one file, restorable). Do this ONCE — pg_dump itself
# counts against transfer, so run it a single time, not in a loop.
pg_dump "$OLD_DATABASE_URL" --no-owner --no-privileges -Fc -f cluster_backup.dump

# Restore into the NEW Neon project:
pg_restore --no-owner --no-privileges -d "$NEW_DATABASE_URL" cluster_backup.dump
```
(Or plain SQL: `pg_dump "$OLD_DATABASE_URL" --no-owner -f cluster_backup.sql`
then `psql "$NEW_DATABASE_URL" -f cluster_backup.sql`.)

If the old DB is fully suspended/over-limit and you only need the important
tables, export selectively:
```bash
pg_dump "$OLD_DATABASE_URL" --no-owner -t users -t linked_game_accounts \
  -t stat_current -t challenges -t challenge_participants -t games -t quests \
  -t quest_tiers -t user_quest_progress -f cluster_core.sql
```

## STEP 3 — Make sure it never happens again

1. **Set `BLOB_READ_WRITE_TOKEN`** (Vercel Blob) in the new project's env.
   New uploads then become short hosted URLs (~40 bytes) instead of MB of base64.
   Once set, the existing boot maintenance auto-migrates old inline images to Blob.
2. Update `DATABASE_URL` to the new Neon **pooled** connection string.
3. Redeploy from branch `genspark_ai_developer` (contains the query fixes above).
4. Optional but recommended: relax `force-dynamic` on public read-only pages
   (home, leaderboards, planets) to `export const revalidate = 60` so identical
   requests are served from cache instead of hitting Neon every time.
