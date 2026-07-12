# ClusterGG — Complete Setup Guide (no tech experience needed)

Follow this top to bottom. Every step says exactly where to click and what to paste.

---

## Part 1 — Connect your Neon database (pooled vs unpooled, explained)

Neon gives every database **two connection strings**:

- **Pooled** (has `-pooler` in the hostname) — built for serverless apps like this one on
  Vercel, where hundreds of tiny functions open short connections. **This is the one the
  app uses.** → goes in `DATABASE_URL`.
- **Unpooled / direct** (no `-pooler`) — for long-lived tools like migrations.
  → goes in `DATABASE_URL_UNPOOLED` (optional; only used if you ever run
  `npm run db:push` from a computer).

**Steps:**

1. Go to https://console.neon.tech → open your project.
2. Click **Dashboard → Connect** (or the "Connection string" box).
3. In the dropdown, make sure **"Pooled connection"** is checked. Copy the string —
   it looks like:
   `postgresql://user:password@ep-xxxx-pooler.us-east-2.aws.neon.tech/neondb?sslmode=require`
4. Open https://vercel.com → your **clustergg** project → **Settings → Environment
   Variables** and add (for **Production**, and Preview if you want):

   | Name | Value |
   |---|---|
   | `DATABASE_URL` | the pooled string you copied |
   | `AUTH_SECRET` | any long random text (50+ chars — mash the keyboard or use a password generator) |
   | `SETUP_TOKEN` | another random text — protects the one-time setup endpoint |
   | `CRON_SECRET` | another random text — protects the daily sync cron |
   | `SUPERADMIN_SEED_EMAIL` | `omarabdelgawad001@gmail.com` |
   | `SUPERADMIN_SEED_PASSWORD_HASH` | your bcrypt hash (starts with `$2a$12$...`) |

   > Your admin login is created from those last two values during setup — the password
   > is whatever you hashed. Keep the hash out of the repo; it lives only in Vercel.

5. **Redeploy**: Vercel → Deployments → ⋯ menu on the latest → **Redeploy** (env vars
   only apply to new deployments).
6. **Initialize the database** (one time). Open this URL tool: press `Cmd/Ctrl` and open
   a terminal? No need — just visit this in your browser using a tool like
   [reqbin.com](https://reqbin.com) set to **POST**, or paste in any terminal:

   ```
   curl -X POST "https://YOUR-DOMAIN/api/setup?token=YOUR_SETUP_TOKEN"
   ```

   Response `{"ok":true,"migrated":true,...}` = done. This creates all 35 tables and
   seeds: games catalog, badges, leaderboards, spaces, trophies, ad placements, and
   **your superadmin account** — and **zero demo users**. Everyone else who signs up is a
   real user.

7. Log in at `https://YOUR-DOMAIN/login` with `omarabdelgawad001@gmail.com` + your
   password → your avatar menu now shows **Mission Control** (the admin portal).

> If you ever see demo accounts (nova, orion…), you're still in in-memory demo mode —
> it means `DATABASE_URL` isn't set on the deployment. Check step 4-5.

---

## Part 2 — Make the site public + custom domain

1. Vercel → project → **Settings → Deployment Protection → Vercel Authentication → Disabled** → Save.
2. Vercel → **Settings → Domains** → add `clustergg.com` and `www.clustergg.com` → follow
   the DNS instructions shown (usually an A record `76.76.21.21` + CNAME for www at your
   domain registrar).
3. Set `NEXT_PUBLIC_APP_URL=https://clustergg.com` in env vars → redeploy.

---

## Part 3 — Game API keys (exactly where to get each one)

Add each as an environment variable in Vercel (Settings → Environment Variables), then
**redeploy**. The moment a key exists, that provider flips to **Live** everywhere —
check `/admin/settings` for a live status table.

**Already live with NO key:** Chess.com, Lichess, Dota 2 (OpenDota), Speedrun.com, Roblox.

### Riot Games — League of Legends + VALORANT (`RIOT_API_KEY`)
1. Go to https://developer.riotgames.com → sign in with a Riot account.
2. Dashboard shows a **Development API Key** instantly (expires every 24h — fine for testing).
3. For a permanent key: click **Register Product → Personal API Key** (approval usually
   days). For VALORANT ranked data + "Sign in with Riot" you need a **Production API
   Key / RSO** application — apply now, approval takes weeks. Describe Cluster as a
   gamer-profile/leaderboard site, non-commercial data use.
4. Vercel env var: `RIOT_API_KEY` = `RGAPI-xxxx-...`

### Steam (`STEAM_API_KEY`)
1. https://steamcommunity.com/dev/apikey → log in with Steam.
2. Domain: `clustergg.com` → Register. Copy the key → `STEAM_API_KEY`.

### Fortnite (`FORTNITE_API_KEY`)
1. https://dash.fortnite-api.com → sign in with Discord → **Create API key** (free).
2. → `FORTNITE_API_KEY`. (Players must enable "Show on career leaderboard" in Fortnite settings.)

### Hypixel / Minecraft (`HYPIXEL_API_KEY`)
1. https://developer.hypixel.net → log in → **Create API key** → `HYPIXEL_API_KEY`.

### PUBG (`PUBG_API_KEY`)
1. https://developer.pubg.com → register → **Create new app** → copy the JWT key → `PUBG_API_KEY`.

### CS2 via FACEIT (`FACEIT_API_KEY`)
1. https://developers.faceit.com → create account → **Create app** → App Studio →
   generate a **Server-side API key** → `FACEIT_API_KEY`.

### Supercell — Clash of Clans / Clash Royale / Brawl Stars
1. https://developer.clashofclans.com (and clashroyale / brawlstars equivalents) → create
   account → **Create key**. Important: Supercell keys are locked to IP addresses; Vercel
   IPs rotate, so choose "allow all" if offered or use a proxy service later. Env vars:
   `SUPERCELL_COC_TOKEN`, `SUPERCELL_CR_TOKEN`, `SUPERCELL_BRAWL_TOKEN`.

### Xbox (`OPENXBL_API_KEY`)
1. https://xbl.io → sign in with your Microsoft/Xbox account → profile → **API keys** →
   create → `OPENXBL_API_KEY`. (Community wrapper — free tier is fine to start.)

### osu! (`OSU_CLIENT_ID` + `OSU_CLIENT_SECRET`)
1. https://osu.ppy.sh/home/account/edit → scroll to **OAuth** → **New OAuth application**.
2. Name: Cluster; callback can be blank. Copy client ID + secret into both env vars.

### Apex Legends (`TRN_API_KEY`)
1. https://tracker.gg/developers → **Create app** → copy API key → `TRN_API_KEY`.

### Discord sign-in (optional; `DISCORD_CLIENT_ID` + `DISCORD_CLIENT_SECRET`)
1. https://discord.com/developers/applications → **New Application** → OAuth2 tab.
2. Add redirect: `https://clustergg.com/api/auth/discord/callback`.
3. Copy Client ID + Client Secret into the env vars.

### Epic / Battle.net (identity only)
- Epic: https://dev.epicgames.com/portal → create product → OAuth client → `EPIC_CLIENT_ID/SECRET`.
- Battle.net: https://develop.battle.net/access → create client → `BATTLENET_CLIENT_ID/SECRET`.

### Mobile Legends (`MLBB_API_BASE`)
Mobile Legends has no official API, so Cluster talks to the community wrapper via a
configurable base URL. **Important:** that wrapper is only a front door — it forwards to a
*private upstream* URL (`RONE_DEV_ACCESS_KEY`) that actually reaches Moonton, and the
maintainer keeps that private. A self-hosted fork with a blank `RONE_DEV_ACCESS_KEY` will
return a 500 on "send code". So there are two options:

**Option A — use the maintainer's hosted API (works immediately):**
Set `MLBB_API_BASE` = `https://openmlbb.fastapicloud.dev/api` (or `https://mlbb.rone.dev/api`)
in your clustergg Vercel env vars, then redeploy. Trade-off: verification codes/tokens pass
through the maintainer's server. Simplest path to a working integration.

**Option B — self-host (only if you can obtain the upstream key):**
1. Fork https://github.com/ridwaanhall/api-mobilelegends and deploy it on Vercel.
2. In that project's env vars, set `RONE_DEV_ACCESS_KEY` (and `_V2`) to the private upstream
   URL — you'd need to get this from the maintainer; it is not public.
3. Set clustergg's `MLBB_API_BASE` to your instance URL + `/api`.

Either way, Mobile Legends shows **live** at `/admin/settings` once `MLBB_API_BASE` is set.

**How players link it:** Settings → Connections → Mobile Legends → they enter their in-game
Player ID + Server, tap "Send code", read the code from their in-game mailbox, and confirm.
No password is ever typed. **Their stats are stored permanently** — if the session later
expires, their profile, leaderboard rank and challenge points all stay put; they just tap
re-link with a fresh code to resume live syncing. Test it by linking your own MLBB account first.

### PSN / Call of Duty
Not integrated on purpose — no official public APIs; unofficial ones risk player account
bans. Revisit only with legal sign-off (plan §15).

---

## Part 4 — Running the platform (admin cheat-sheet)

Everything below lives in **Mission Control** (your avatar → Mission Control):

| What | Where |
|---|---|
| Edit any homepage text/button/background | **Site content** |
| Game logos + cover images (zoom/crop framing) | **Games catalog** |
| "Trusted by" partner logos | **Partners** |
| Build & publish challenges (per-game trackable stats + recommended scoring, daily/weekly/monthly, hero image/video/stream, trophy) | **Challenges** |
| Watch a challenge live, disqualify cheaters | Challenges → Live tracker |
| Trophy art library | **Trophies** |
| Badges + award criteria | **Badges** |
| Leaderboard definitions | **Leaderboards** |
| Users: search, suspend, ban, **promote to staff** | **Users** |
| Staff role = moderation of spaces/challenges only | **Roles** |
| Ads: brands, creatives (review queue), placements, which ad shows where, engagement analytics | **Brands / Creatives / Placements / Ad schedule / Ad analytics** |
| Provider key status (green = live) | **Settings** |

**Staff accounts:** find the user in Users → "Make staff". They keep their gamer profile;
their account now also opens Mission Control with moderation-only powers.

**Stat syncs:** automatic — profiles refresh on view (15-min cooldown) + a daily cron.
Manual re-sync buttons exist on Linked accounts.

**Ads are sold offline:** nothing brand-related is public. The only public surface is the
"Trusted by" logo slider you control in Partners.
