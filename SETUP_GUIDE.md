# ClusterGG — Complete Setup Guide (no tech experience needed)

Follow this top to bottom. Every step says exactly where to click and what to paste.

> **New here?** Read the [README](./README.md) for what the product is, and once
> you're running, [`docs/STAFF_OPERATIONS.md`](./docs/STAFF_OPERATIONS.md) is the
> plain-language manual for running the platform. Developers: [`docs/ENGINEERING_HANDOVER.md`](./docs/ENGINEERING_HANDOVER.md).

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

### ClusterBot for Discord (`DISCORD_BOT_TOKEN` + `DISCORD_PUBLIC_KEY` + `BOT_API_SECRET`)

The bot runs inside this Next app — HTTP interactions, no gateway, no separate
process. Add it to the **same application** you created for Discord sign-in, so
one app holds both the OAuth credentials and the bot.

**1. Bot tab** → **Add Bot** → **Reset Token** → copy into `DISCORD_BOT_TOKEN`.
The token is shown once; if you lose it, reset again.
- **Public Bot: OFF** while testing, so only you can add it.
- **Message Content Intent: leave OFF.** Cluster never reads message text, and
  requesting that intent triggers Discord verification past 75 servers.

**2. General Information tab** → copy **Public Key** into `DISCORD_PUBLIC_KEY`
and **Application ID** into `DISCORD_APP_ID`. (The App ID is optional if
`DISCORD_CLIENT_ID` is already set — the code falls back to it.)

**3. OAuth2 → Redirects** → add **both**:
```
https://clustergg.com/api/auth/discord/callback   # sign-in
https://clustergg.com/api/discord/installed       # bot install — REQUIRED
```
The install URL is load-bearing: Discord returns `guild_id` to it, which is the
only thing install-time onboarding needs. Without it, installs fail with
`invalid_redirect_uri`.

**4. Generate `BOT_API_SECRET`** (`openssl rand -hex 32`). It guards command
registration and the screen-preview endpoint, mirroring `CRON_SECRET`.

**5. Deploy** the env vars (Production + Preview), then set
**General Information → Interactions Endpoint URL**:
```
https://clustergg.com/api/discord/interactions
```
Set this **last**. Clicking Save makes Discord send a signed PING; if the public
key isn't live yet the endpoint returns 401/503 and Discord refuses the URL.

**6. Register the slash command** (once, and after any change to
`lib/discord/commands.ts`):
```bash
curl -X POST https://clustergg.com/api/discord/register \
     -H "Authorization: Bearer $BOT_API_SECRET"
```
While testing, append `?guild_id=<your server id>` — guild-scoped commands
appear **immediately**, where global ones can take up to an hour.

**7. Install it.** Open `https://clustergg.com/discord-bot` and click
**Add ClusterBot**. On authorising, the bot creates `#clustergg`, posts and pins
a how-to guide PNG for every topic and every quest, and DMs the owner.

**Permissions.** The invite requests exactly what the bot uses: Manage Channels
(create the channel), Send Messages, **Manage Messages (pin the guides)**, Embed
Links, Attach Files, Read History, Mention Everyone (private-challenge
announcements), Add Reactions, Use Application Commands. If Manage Messages is
missing the guides post but silently fail to pin.

**Troubleshooting**

| Symptom | Cause |
|---|---|
| Portal won't save the interactions URL | `DISCORD_PUBLIC_KEY` wrong, or env not redeployed |
| `/cluster` doesn't appear | Registration not run, or global propagation — use `?guild_id=` |
| "The application did not respond" | A handler threw before the ACK — check runtime logs |
| Guides posted but not pinned | Missing Manage Messages — re-invite from `/discord-bot` |
| No `#clustergg` channel | Missing Manage Channels — the owner is DM'd with this exact reason |

To see what any bot screen will render without opening Discord:
```bash
curl -H "Authorization: Bearer $BOT_API_SECRET" \
  "https://clustergg.com/api/discord/preview?screen=home&discord_id=<snowflake>"
```

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

Everything below lives in **Mission Control** (your avatar → Mission Control). A full
walkthrough of every page is in [`docs/STAFF_OPERATIONS.md`](./docs/STAFF_OPERATIONS.md).

| What | Where |
|---|---|
| Edit any homepage/site text, buttons, loading-screen phrases | **Site content** |
| Per-page background art | **Page backgrounds** |
| Card background art (feed rails, etc.; dark overlay auto-applied) | **Card backgrounds** |
| Logo mark, wordmark, favicon (zoom), nav/footer bg, CP coin, quest orb & rocket | **Logos & brand kit** |
| "Trusted by" partner logos | **Partners** |
| Game logos, covers, planet globe art, colors, metrics, **sort order** | **Games catalog** |
| Which providers appear in onboarding | **Connect providers** |
| Per-planet layout, page bg, card art, theme, drag region pins | **Planets** |
| Build & publish challenges (per-game stats, weekday+hour+date, hero art, trophy) | **Challenges** |
| Quests, CP-per-action, tier badges, drag milestones on the map | **Quests** |
| Leaderboard definitions (metric filtered by game) | **Leaderboards** |
| Trophy art library | **Trophies** |
| Users: search, suspend, ban, reset password | **Users** |
| See roles; **admins delegate areas to staff** here | **Roles & staff access** |
| Ads: brands, creatives, placements, per-campaign analytics & launch | **Brands / Creatives / Placements / Ad schedule / Ad analytics** |
| Image health: source, size, re-host to Blob | **Image storage** |
| Provider key status (green = live) | **Settings** |

**Staff accounts:** find the user in Users → "Make staff" (superadmin promotes). They keep
their gamer profile; their account also opens Mission Control. By default staff can edit
content, planets, games, challenges, quests, trophies and leaderboards. An **admin** can
grant staff the sensitive areas (ads, image storage, audit log) under **Roles & staff
access** → *Staff role access*. Roles and Settings are never delegated.

**Stat syncs:** automatic — profiles refresh on view (cooldown) + a daily Vercel cron
(`/api/cron/sync`, protected by `CRON_SECRET`). Manual re-sync buttons exist on Linked accounts.

**Ads are sold offline:** nothing brand-related is public. Brands manage their own campaigns
via a key-gated portal at `/brands/<slug>` (no account needed). The only public surface is
the "Trusted by" logo slider you control in Partners.
