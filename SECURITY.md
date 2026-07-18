# Cluster — Security Audit, Hardening & Test Guide

_Last reviewed: 2026-07-17. Scope: the full Next.js 15 app (App Router), server
actions, API route handlers, auth/session, uploads, and data access._

This document records the security review of the platform, the fixes applied,
the production checklist, and how to re-run the checks so we stay production-grade.

---

## 1. Threat model (what we defend)

| Asset | Threat | Control |
|---|---|---|
| User accounts / sessions | Session theft, fixation, CSRF | JWT session cookie (`jose`, HTTP-only, `SameSite=Lax`, `Secure` in prod); bcrypt password hashes; Server Actions are same-origin POST only |
| Admin surface | Privilege escalation | Every admin action calls `requireStaff()`/`requireAdmin()`; admin routes gated in `app/admin/layout.tsx` |
| Other users' data | IDOR (editing/reading someone else's records) | Every user action filters by `userId = me.id` (unlink, resync, join challenge, messages, posts) |
| Uploads | Storage/memory DoS, stored-XSS, SSRF | Size cap + type allow-list on `/api/upload` (see §3.1); images rendered only as `img src` / `background-image` |
| Bootstrap / cron | Unauthenticated seeding or job triggering | `SETUP_TOKEN` + `CRON_SECRET` gates (see §3.4) |
| Database | SQL injection | Drizzle parameterized queries; generic dynamic SQL uses a hardcoded identifier allow-list, never user input |
| Secrets | Leakage | All secrets from env; none committed; blob token resolved from env at runtime |

---

## 2. Authorization model

Guards, enforced **server-side** in every mutating path:

- `requireUser()` — any signed-in gamer. Used by all self-service actions
  (profile, connections, posts, follows, messages, challenge joins).
- `requireStaff()` — staff/admin. Used by content, games, planets, challenges,
  quests, leaderboards, trophies, brand kit, backgrounds.
- `requireAdmin()` — admin only. Used by roles, user status, platform settings.
- `requireArea("ads" | "storage" | "audit")` — **delegated RBAC** (`lib/permissions.ts`).
  Admins always pass; staff pass only if an admin has granted that area on
  `/admin/roles`. Grants are stored in the CMS key `staff.access`. The ad-sales
  actions (brands/campaigns/creatives/placements) and the image-storage re-host
  use this guard, so a grant actually confers edit power — not just visibility.
  `roles` and `settings` are **never** grantable (hardcoded in `lib/areas.ts`).

**Audited result:** 100% of `app/actions/*` mutations begin with one of these
guards, and every user-scoped mutation additionally constrains by owner id
(no IDOR). Admin route segments are also gated at the layout level via
`areaAllowed(...)`, so even un-actioned admin pages are unreachable by users
lacking the area. Sessions are JWTs (`jose`) in an httpOnly `cluster_session`
cookie signed with `AUTH_SECRET`; passwords are bcrypt.

**Media/data-transfer hardening:** uploaded art is stored on Vercel Blob, never
inline in the DB. The theme save-path sanitizes any pasted `data:image` (moving
it to Blob) so a large base64 background can't land in a row and be re-read on
every profile/feed load. `/admin/storage` audits every stored image's source +
size for ongoing hygiene.

---

## 3. Findings & fixes

### 3.1 Upload endpoint hardening — FIXED
`app/api/upload/route.ts` previously (a) had no size limit and (b) echoed any
non-image string straight back to be stored and later rendered as an image
`src`. Fixes:
- **Size cap:** reject data URLs larger than ~8 MB (`413`). The client also
  downscales images in-canvas before upload, so this is a backstop.
- **Type allow-list:** accept only `data:image/*` payloads or a single
  `https://` link (the "paste a link" escape hatch). Any other string is
  rejected `400` — arbitrary values can no longer be persisted.
- Already present and retained: auth gate (`401` when signed out) and staff
  gate for admin scopes (`game`, `trophy`, `partner`, `creative`, `content`,
  `quest` → `403`).

### 3.2 IDOR — VERIFIED SAFE
`unlinkGameAccount`, `resyncGameAccount`, `joinChallenge`, `sendMessage`, and
post/reaction actions all resolve the target row constrained by `me.id`
(or conversation membership) before acting. No cross-user access path found.

### 3.3 SQL injection — VERIFIED SAFE
All queries go through Drizzle with bound parameters. The only raw/dynamic SQL
(the boot-time image→Blob sweep in `lib/db/seed.ts` and the `COLUMN_MIGRATIONS`
DDL in `lib/db/index.ts`) uses hardcoded literals only — never request input.

### 3.4 Bootstrap & cron gating — ACTION REQUIRED IN PROD
`/api/setup` and `/api/cron/*` gate on `SETUP_TOKEN` / `CRON_SECRET` **when
those env vars are set**. `/api/setup` additionally refuses to run once tables
exist (idempotent), and cron only performs syncs (non-destructive). Still:
**set both secrets in production** so neither can be triggered anonymously.

### 3.5 XSS — VERIFIED LOW RISK
User text is rendered through React (auto-escaped); there is no
`dangerouslySetInnerHTML` on user content. Uploaded/admin images are only used
as `img src` or CSS `background-image`, where SVG/script payloads do not
execute. Ad creatives render inside `img`/`video`, not inline SVG.

### 3.6 Secrets — VERIFIED SAFE
No secrets in the repo. Session signing key, DB URL, blob token, OAuth client
secrets, `SETUP_TOKEN`, `CRON_SECRET`, `AD_ANALYTICS_SALT` all come from env.
IPs are hashed with `AD_ANALYTICS_SALT` before storage (raw IPs never persisted).

### 3.7 Dependency advisories — TRACKED (build-time only)
`npm audit --production` reports 3 advisories (2 moderate, 1 high), all
**transitive through Next.js's bundled `postcss`** (a CSS-stringify XSS that
affects build tooling, not runtime handling of user input). The only "fix" npm
offers is a forced downgrade of Next to 9.x (a breaking change we will not take).
These are not runtime-exploitable for this app — we do not stringify untrusted
CSS. Action: upgrade Next.js when a patched 15.x/16.x releases; re-run `npm audit`
each release.

---

## 4. Production security checklist

Set these before going live (Vercel → Project → Settings → Environment Variables):

- [ ] `AUTH_SECRET` / session signing secret — long random value
- [ ] `DATABASE_URL` — Neon pooled connection string
- [ ] `SETUP_TOKEN` — required to call `/api/setup`
- [ ] `CRON_SECRET` — required to call `/api/cron/*` (set the same value in the Vercel Cron header)
- [ ] `AD_ANALYTICS_SALT` — random value for IP hashing
- [ ] `BLOB_READ_WRITE_TOKEN` (or connected Blob store) — **store must be PUBLIC**
- [ ] OAuth client id/secret for each live provider (Discord, Epic, Battle.net, Riot, …)
- [ ] Confirm cookies are `Secure` + `HttpOnly` (automatic in production)
- [ ] Rotate any credential that ever appeared in chat/logs

---

## 5. How to run the checks (production-grade gate)

```bash
# 1. Type safety — no `any`-holes, catches most contract bugs
npx tsc --noEmit

# 2. Production build must pass (fails on type + many runtime issues)
npm run build

# 3. Dependency vulnerabilities (see §3.7 for the known transitive advisories)
npm audit --production
```

CI should run these on every PR and block merge on failure. `tsc` and `build`
are green on `main`. (`next lint` is not configured in this repo; the build
performs Next's own checks.)

### Manual verification passes (per release)
- Hit `/api/upload` signed-out → expect `401`.
- Hit `/api/upload` as a normal user with `scope=game` → expect `403`.
- POST a >8 MB data URL → expect `413`.
- POST a non-image, non-https string → expect `400`.
- Attempt to unlink/join with another user's `accountId` → silently no-ops (row not found under `me.id`).
- Visit any `/admin/*` route as a non-staff user → redirected to `/feed`.

---

## 6. Follow-ups (nice-to-have, not blockers)

- Add Upstash rate-limiting to `/api/upload`, auth, and messaging.
- Add a Content-Security-Policy header (allow self + Blob CDN + provider avatars).
- Add automated integration tests (Playwright) for the authz matrix above.
- Consider virus/again content scanning for uploaded creatives at scale.
