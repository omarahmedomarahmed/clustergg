# Cluster — Engineering Handover

Everything a developer needs to own this codebase. Read this before changing code. It assumes you've skimmed the [README](../README.md).

---

## 1. Mental model

One Next.js 15 app (App Router) does everything. There is no separate backend. "API" means either:
- **Server Components** that read the DB directly (`getDb()`), rendered on demand (`export const dynamic = "force-dynamic"`), or
- **Server Actions** (`"use server"` functions in `app/actions/*`) that mutate and `revalidatePath`, or
- a handful of **route handlers** in `app/api/*` for things that need a real HTTP endpoint (OAuth callbacks, image upload, cron, ad impression/click beacons, first-run setup).

Client components (`"use client"`) are used only where interactivity demands it (editors, drag/zoom, dropdowns, live refresh). Keep the server/client boundary tight — see §9 gotchas.

---

## 2. Database: one schema, two drivers

`lib/db/schema.ts` is the single Drizzle schema. `lib/db/index.ts` exposes `getDb()` which returns one of two drivers behind the same `DB` type:

- **Production**: `DATABASE_URL` set → `@neondatabase/serverless` (neon-http) + `drizzle-orm/neon-http`.
- **Local/demo**: no `DATABASE_URL` → **PGlite** in-memory Postgres, seeded on boot. `isDemoMode = !process.env.DATABASE_URL`.

Because it's one type union, **write portable SQL**. Use `db.select().from()` / `db.insert()` / `db.update()` and `db.execute(sql\`…\`)`. Both drivers support parameterized `sql\`\``.

### 2.1 Self-healing migrations (important)

There is **no migration CLI in the deploy path**. Instead the schema keeps itself current on every boot:

- `COLUMN_MIGRATIONS` in `lib/db/index.ts` is a list of idempotent `ALTER TABLE … ADD COLUMN IF NOT EXISTS …` (and a few `CREATE TABLE IF NOT EXISTS`) statements. They run once per cold boot, in order, and are safe to re-run.
- **When you add a column to `schema.ts`, you must also add the matching `ALTER … IF NOT EXISTS` to `COLUMN_MIGRATIONS`** or production (which has an existing DB) won't get the column. PGlite starts empty so it gets the full schema via Drizzle's `CREATE TABLE`, which hides missing migrations locally — always test the migration mentally against an *existing* prod DB.

### 2.2 Boot maintenance (`lib/db/seed.ts`)

Beyond DDL, several **idempotent maintenance functions** run at boot (imported dynamically from `index.ts` in both the fresh-DB and existing-DB paths):

- `rehostImagesToBlob(db)` — re-hosts any inline `data:image` values and any external Higgsfield/CloudFront URLs onto our own Vercel Blob, across users (theme/avatar/banner), games, quests, quest tiers, ad creatives, trophies, challenges, brands, partners, and CMS content. **This is what keeps Neon lean** (see §4).
- `ensureBrandKeys(db)` — backfills a portal `slug` + `accessKey` for every brand.
- `ensurePlanetSkins(db)` — sets/upgrades planet globe art for catalog games without clobbering admin uploads.
- seed data for a fresh/demo DB (users, games, trophies, challenges, quests, placements, …).

If you add a new image-bearing column, extend `rehostImagesToBlob` so it's covered.

---

## 3. Auth, sessions, roles & RBAC

- **Sessions**: `lib/auth.ts`. A JWT (via `jose`) signed with `AUTH_SECRET` is stored in an httpOnly `cluster_session` cookie. `getSession()` verifies it; `getCurrentUser()` returns a light user row (omits the heavy `theme`/`bannerUrl`); `getCurrentUserFull()` returns the full row. **Use the light one unless you need the theme** — see §4.
- **Passwords**: bcryptjs (`hashPassword` / `verifyPassword`).
- **Roles**: `user` < `staff` < `admin` < `superadmin` (+ `brand`, reserved). Helpers: `isAdmin`, `isStaff`, `requireAdmin()`, `requireStaff()` (throw `FORBIDDEN`).
- **Delegated staff access (RBAC)**: `lib/permissions.ts` (+ client-safe `lib/areas.ts`). Admins can grant staff the sensitive **grantable areas** — `ads`, `storage`, `audit` — from `/admin/roles`. Grants are stored in the CMS key `staff.access` (comma-separated). `roles` and `settings` are **never** grantable.
  - Nav visibility: `app/admin/layout.tsx` filters sections/items through `areaAllowed(isAdmin, area, grants)`.
  - Enforcement: server actions for those areas call `requireArea("ads" | "storage" | "audit")` instead of `requireAdmin()`. **If you add an ads/storage action, guard it with `requireArea`, not `requireAdmin`,** or grants won't actually work.
  - `lib/areas.ts` exists purely so client components can import `GRANTABLE_AREAS` without pulling `next/headers` (server-only) into the browser bundle. Keep client imports pointed at `areas.ts`.

---

## 4. Media pipeline & the Neon data-transfer lesson

**Rule: Neon stores links, never image bytes.** Every image is uploaded to Vercel Blob and the DB holds only the short `https://<store>.public.blob.vercel-storage.com/…` URL.

- `components/ImageUpload.tsx` is the universal uploader (replaces every raw-URL field). Flow: browser **downscales** the file (`lib/downscale.ts`), the admin can zoom/drag to frame it, the frame is **baked into a canvas** (`lib/reframe.ts` `bakeFrame`) so the crop is real everywhere, then it's POSTed to `/api/upload` → Blob (`lib/blob.ts`). A hidden `<input>` carries the resulting URL into the form.
  - `bakeFrame` loads remote images by **fetching them as a same-origin blob first** (not via a plain `<img>`), so the canvas never taints and `toDataURL` works even for already-uploaded art. Don't "simplify" that back to `img.crossOrigin` — zoom on existing images will silently no-op again.
- `lib/blob.ts`: `uploadDataUrlToBlob`, `putBuffer`, `uploadUrlToBlob` (fetch external → Blob), `rehostDataUrlsInObject` (walks an object and re-hosts inline `data:image` values), `blobConfigured()`.
- **Save-path sanitization**: `saveProfileTheme` (in `app/actions/connections.ts`) runs `rehostDataUrlsInObject(theme, "theme")` before storing, so a pasted 2 MB background never lands in the DB.

### Why this matters

A single 2 MB base64 `theme.bgImage` on one user was being re-read on **every** profile/feed load, blowing up Neon's egress. The fix was (a) sanitize on save, (b) the boot `rehostImagesToBlob` migration, and (c) keeping `getCurrentUser()` free of the `theme` column. The **`/admin/storage`** page (`lib/storage-audit.ts`) is the live audit: it lists every stored image, classifies it (Blob ✓ / Higgsfield ⚠️ / inline ❌ / external), measures each file's real byte size (server-side HEAD on Vercel), flags anything ≥ 0.5 MB, and offers a one-click **re-host all → Blob** (`rehostAllImagesNow`, guarded by `requireArea("storage")`).

---

## 5. Theming engine

`lib/theme.ts` powers both public profiles and the feed (the feed is a "preview" of your own profile).

- Theme is stored per user in `users.theme` (JSONB). `resolveTheme()` merges it over `DEFAULT_THEME`; `themeToVars()` emits CSS variables; `bgLayerStyle()` / `coverStyle()` build the background + cover layers; `SECTIONS` drives which profile sections show and in what order.
- The profile builder (`/profile`) is a live editor: edit on the left, real preview on the right. All art fields use `ImageUpload`.

---

## 6. Ads engine (the revenue core)

Data model (`schema.ts`): `brands` → `adCampaigns` → `adCampaignCreatives` (join) ← `adCreatives`, served into `adPlacements`; events in `adImpressions` / `adClicks`; `brandMessages` is the shared brand↔admin inbox.

- `lib/ads.ts` — the rotation/serving engine (`AdSlot` picks creatives per placement, logs impressions/clicks).
- `lib/brands.ts` — `getCampaignReadiness` (launch gate: every placement must have a creative), `getCampaignAnalytics` (impressions/clicks sliced by placement/page/day/country), `getAdsMasterTotals`, `getBrandPortalData` (all-campaign aggregation + marketing intelligence for the portal), `newAccessKey`, `getBrandInbox`.
- **Admin** (`/admin/ads`, `/admin/brands`, `/admin/creatives`, `/admin/placements`, `/admin/ads/campaign/[id]`): brands with uploaded logo/cover, per-campaign cover/logo, collapsed creative slots, brand/status-filtered creatives, creative↔placement linking (from either page), editable rotation interval, and **ajax-only** analytics refresh (`/api/admin/campaign-analytics/[id]` + `CampaignAnalyticsLive`).
- **Brand portal** (`/brands/[slug]?key=…`): no login — gated by the brand's access key. Animated totals, sparkline trends, marketing-intelligence cards, campaign filter, and click-a-campaign → its own analytics + creative-upload drill-down (`/api/brands/upload` is key-gated).

To add a placement: insert a row in `adPlacements` (seed `placementDefs` in `seed.ts`), and it flows through readiness, the schedule, and the portal automatically.

---

## 7. Quests / CP & planets

- **Quests** (`lib/quests.ts`, `lib/quest-hero.ts`): a quest listens to weighted engine actions (`actionWeights`) and has ordered **tiers** (`questTiers`) each with a CP threshold, badge art, and an `mapX/mapY` position on the treasure-map hero. The hero (`components/QuestMapHero.tsx`) shows glorified milestones over the map; admins place them by **dragging** (`components/QuestMapPinEditor.tsx` → `saveTierPins`).
- **Planets** (`lib/planets.ts`, `lib/game-regions.ts`): each catalog game is a planet with an interactive globe. `computeRealRegions` maps linked accounts to macro-regions (with a game-specific fallback so PUBG/Fortnite etc. always show gamers); admins drag region pins (`components/PlanetPinEditor.tsx`). Planet order follows the game catalog `sortOrder`.

---

## 8. Conventions

- **Server actions** live in `app/actions/*`, start with a `requireAdmin/requireStaff/requireArea` guard, mutate, `audit(...)`, then `revalidatePath(...)`. Return `ActionState` (`{ok?,error?,message?}`) when the caller uses `useActionState`.
- **CMS** (`lib/cms.ts`): editable strings live in `platform_settings` (key→value). Every consumer supplies a default in `CONTENT_DEFAULTS`, so a missing key never breaks a page. `getContent(keys)` / `setContent(key,value)`.
- **Icons**: `components/Icon.tsx` is an inline SVG set keyed by exact name (e.g. `chevronDown`, not `chevron-down`). Unknown names fall back to `spark`.
- **Reference code** as `file:line`. Match surrounding style; keep comments at the density of the file you're editing.

---

## 9. Gotchas (things that have bitten us)

- **Missing `COLUMN_MIGRATIONS`** → column exists locally (PGlite) but is missing in prod. Always pair a `schema.ts` column with an `ALTER … IF NOT EXISTS`.
- **Importing a server-only module into a client component** (anything that transitively imports `next/headers` or the DB) breaks the build. That's why `lib/areas.ts` (client-safe) is split from `lib/permissions.ts` (server). When a client component needs a constant, put the constant in a server-free module.
- **`getCurrentUserFull()` in hot read paths** re-pulls the heavy `theme` column. Use `getCurrentUser()` unless you truly need the theme.
- **Canvas tainting** on image zoom — see §4; keep the fetch-as-blob path in `reframe.ts`.
- **Blob not configured** — `rehostImagesToBlob` and `rehostAllImagesNow` no-op safely when `BLOB_READ_WRITE_TOKEN` is absent; they never inline-store instead.

---

## 10. Local dev & verify

```bash
npm install
npm run dev            # PGlite demo DB if no DATABASE_URL
npx tsc --noEmit       # must be clean
npm run build          # must pass
```

Env vars: [`SETUP_GUIDE.md`](../SETUP_GUIDE.md). Deploy: [`DEPLOYMENT.md`](../DEPLOYMENT.md). Security & authz: [`SECURITY.md`](../SECURITY.md).
