# Cluster (ClusterGG.com)

**One cosmic identity for every game a person plays.**

Cluster is a gamer platform where players connect their game accounts (PC / console / mobile) and Discord, get a public, fully-customizable cosmic profile at `clustergg.com/u/<name>`, compete in live **Challenges** built on real game data, chart progress through **Quests** that pay out **Cluster Points (CP)**, and climb per-game **Leaderboards** on interactive **Planet** globes. It is monetized by banner/video ad **placements** sold to brands through a self-serve brand portal and an admin back office.

This repository is the entire product: a single Next.js app that serves the public site, the gamer app, the admin "Mission Control" CMS, the brand portal, and the JSON/OAuth/cron APIs.

---

## Docs index

| Doc | For | What's in it |
|---|---|---|
| **README.md** (this) | Everyone | What the product is, the stack, how to run it, the layout. |
| [`docs/ENGINEERING_HANDOVER.md`](./docs/ENGINEERING_HANDOVER.md) | Any developer taking over | Deep architecture: data model, auth, DB drivers, self-healing migrations, media/Blob pipeline, ads engine, theming, gotchas. Read this first if you're going to change code. |
| [`docs/STAFF_OPERATIONS.md`](./docs/STAFF_OPERATIONS.md) | Staff & admins (non-devs) | How to run the platform day-to-day from Mission Control — what every admin page edits and how, with no code. |
| [`SECURITY.md`](./SECURITY.md) | Devs / reviewers | Threat model, authorization model (incl. delegated staff access), findings & fixes, production checklist. |
| [`SETUP_GUIDE.md`](./SETUP_GUIDE.md) | Devs | First-run setup, every environment variable, seeding the superadmin. |
| [`DEPLOYMENT.md`](./DEPLOYMENT.md) | Devs / ops | Deploying to Vercel, Neon + Blob wiring, cron, promotion. |
| [`docs/PRODUCT_BRIEF.md`](./docs/PRODUCT_BRIEF.md) | Product / investors | Plain-language product overview. |
| [`docs/PITCH_DECK.md`](./docs/PITCH_DECK.md) | Investors | Slide-by-slide preseed narrative. |
| [`docs/GAMIFICATION_PLAN.md`](./docs/GAMIFICATION_PLAN.md) | Product / devs | Quests, tiers and CP design. |

---

## Tech stack (what's actually used)

| Layer | Choice |
|---|---|
| Framework | **Next.js 15** (App Router, React 19, TypeScript, `force-dynamic` server components + server actions) |
| Styling | **Tailwind CSS v4** |
| Database | **Neon** (serverless Postgres) in production via `@neondatabase/serverless` (neon-http driver). **PGlite** (in-memory Postgres) in local/demo mode |
| ORM | **Drizzle ORM** (one schema, dual driver) |
| Auth | Custom JWT session (**`jose`**) in an httpOnly `cluster_session` cookie. Passwords hashed with **bcryptjs**. OAuth for game/identity providers |
| Media | **Vercel Blob** (public store) — all uploaded art is downscaled in the browser and stored on Blob; the DB only ever holds short Blob links |
| Cron | **Vercel Cron** → `/api/cron/sync` (daily), gated by `CRON_SECRET` |
| Hosting | **Vercel** |

There is **no** NextAuth, Redis, Pusher, or external search dependency — those appeared in the original planning doc but the shipped app is deliberately lean (see the handover doc for why).

---

## Run locally

```bash
npm install
npm run dev          # http://localhost:3000
```

With **no `DATABASE_URL`**, the app boots a fully-seeded **in-memory PGlite** database (demo mode). Everything works — profiles, planets, challenges, quests, ads — but data resets on restart. This is the fastest way to explore.

For real, persistent data set `DATABASE_URL` (Neon) and `BLOB_READ_WRITE_TOKEN` (a Vercel Blob public store). See [`SETUP_GUIDE.md`](./SETUP_GUIDE.md) for every variable.

### Verify (the production gate)

```bash
npx tsc --noEmit     # type safety — must be clean
npm run build        # production build — must pass
```

Both must be green before pushing. `npm run build` runs Next's own checks too.

---

## Repository layout

```
app/
  (public)            landing, /u/[slug] profiles, /planets, /leaderboards, /quests, /games, legal
  feed/               the signed-in gamer dashboard (profile-style, customizable)
  admin/              "Mission Control" CMS — one folder per editable area
  brands/[slug]/      key-gated brand portal (no login) — campaign analytics + creative upload
  onboarding/         connect-your-accounts flow
  api/                auth (OAuth callbacks), upload, cron, ads impression/click, setup
  actions/            server actions (mutations) — admin.ts, connections.ts, quests-admin.ts, …
components/           all React components (server + client)
lib/
  db/                 schema.ts, index.ts (drivers + self-healing migrations), seed.ts (boot maintenance)
  auth.ts             sessions, roles, requireAdmin/requireStaff
  permissions.ts      delegated staff-access RBAC (server); areas.ts holds the client-safe constants
  blob.ts             Vercel Blob upload + re-host helpers
  theme.ts            profile/feed theming engine
  brands.ts           ads readiness, analytics, brand-portal aggregation
  planets.ts / game-regions.ts   planet globes + per-region gamer counts
  quests.ts / quest-hero.ts      quest engine + hero map
  storage-audit.ts    image inventory used by /admin/storage
  sync.ts / providers/           game-account stat sync
docs/                 the docs listed above
```

---

## The three surfaces

1. **Public + gamer app** — landing page, cosmic profiles, interactive planet globes with per-region gamer pins, live challenges with countdowns and trophies, quest treasure-maps with CP milestones, leaderboards, feed, messaging.
2. **Mission Control (`/admin`)** — a no-JSON CMS where staff/admins edit *everything*: site copy, page & card backgrounds, logos & favicon, the game catalog, planets, challenges, quests & tiers, leaderboards, trophies, users & roles, and the ads back office. Access is role-gated and admins can **delegate** sensitive areas to staff.
3. **Ads back office + brand portal** — brands → campaigns → creatives → placements, with impression/click analytics, a launch-gating readiness model, and a glorified `/brands/<slug>` portal brands reach with an access key (no account needed).

---

## Roles

- **superadmin** — everything, including granting the admin role. The first user registered on a fresh DB becomes superadmin.
- **admin** — all of Mission Control; can delegate areas to staff.
- **staff** — content moderation & editing (planets, games, challenges, quests, trophies, leaderboards, site content, backgrounds, partners) plus any areas an admin has delegated (ads, image storage, audit log).
- **brand** — reserved; brands normally use the key-gated portal instead of an account.
- **user** — a normal gamer.

See [`docs/STAFF_OPERATIONS.md`](./docs/STAFF_OPERATIONS.md) for what each area does and [`SECURITY.md`](./SECURITY.md) for how access is enforced.
