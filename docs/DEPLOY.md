# Deploy

Vercel + Neon Postgres + Vercel Blob. Nothing else is required.

## Environment

**Required in production**

| Variable | What it is |
|---|---|
| `DATABASE_URL` | Neon connection string. Without it the app runs the in-memory demo. |
| `AUTH_SECRET` | Session signing key. `openssl rand -hex 32` |
| `NEXT_PUBLIC_APP_URL` | `https://clustergg.com` — used for absolute links and OAuth redirects |
| `BLOB_READ_WRITE_TOKEN` | Vercel Blob. Uploads and rendered cards live here. |
| `CRON_SECRET` | Vercel Cron sends it automatically; the routes reject anything else. |

**The bot** — with none of these set, the site behaves normally and the bot
endpoints report "not configured".

| Variable | Where from |
|---|---|
| `DISCORD_BOT_TOKEN` | Developer Portal → Bot → Reset Token |
| `DISCORD_PUBLIC_KEY` | General Information → Public Key |
| `DISCORD_APP_ID` | General Information → Application ID |
| `DISCORD_CLIENT_ID` / `DISCORD_CLIENT_SECRET` | OAuth2 → for "Sign in with Discord" |
| `BOT_API_SECRET` | You generate. Guards command registration. |

**Optional** — `PORTAL_SECRET` (portal sessions survive a redeploy),
`AD_ANALYTICS_SALT`, `SETUP_TOKEN`, `DISCORD_DEFAULT_CHANNEL_ID` (a single test
channel before any server has installed).

**Game providers** — each is optional; a provider with no key reports
`needs_key` and everything else keeps working: `RIOT_API_KEY`, `STEAM_API_KEY`,
`PUBG_API_KEY`, `FORTNITE_API_KEY`, `FACEIT_API_KEY`, `HYPIXEL_API_KEY`,
`OPENXBL_API_KEY`, `TRN_API_KEY`, `OSU_CLIENT_ID` + `OSU_CLIENT_SECRET`.

Env changes need a **redeploy** — they do not apply to an existing build.

## Discord app, once

1. **OAuth2 → Redirects**, both:
   `https://clustergg.com/api/auth/discord/callback` (sign-in) and
   `https://clustergg.com/api/discord/installed` (bot install — Discord returns
   `guild_id` here, which is what install-time onboarding needs).
2. **Bot tab** → create it, copy the token. **Public Bot ON** at launch.
   Leave **Message Content Intent OFF** — we never read message text, and asking
   triggers verification at 75 servers.
3. **Interactions Endpoint URL** → `https://clustergg.com/api/discord/interactions`.
   Set this **last**: saving it makes Discord send a signed PING, which fails if
   `DISCORD_PUBLIC_KEY` isn't deployed yet.
4. Register the commands, once per change to `lib/discord/commands.ts`:
   ```bash
   curl -X POST https://clustergg.com/api/discord/register \
        -H "Authorization: Bearer $BOT_API_SECRET"
   ```
   Global commands take up to an hour to appear. Add `?guild_id=<your server>`
   for instant registration while testing.

Sign-in requests `guilds.join`, so anyone signing in with Discord is added to
the Cluster HQ server — set its id and a permanent invite in
**Admin → Discord → HQ**. Gamers who signed in before that scope existed join
the next time they sign in.

## Email (B32)

Mail is **off until you set a key**, and off is a safe, complete state: every
send is recorded at `/admin/email` as `skipped` with the reason, nothing throws,
and no code path changes behaviour. So the order below is the order to do it in,
and you can stop after any step.

### 1. Send — Resend

| Variable | Required | What it is |
|---|---|---|
| `RESEND_API_KEY` | to send at all | From resend.com → API Keys. Without it the layer no-ops. |
| `EMAIL_FROM` | strongly | `Cluster <billing@yourdomain.com>`. Defaults to Resend's shared `onboarding@resend.dev`, which is fine for a first test and wrong for anything real. |
| `EMAIL_REPLY_TO` | optional | Where a human reply should land — usually the forwarding address from step 2. |
| `RESEND_WEBHOOK_SECRET` | for delivery status | Any long random string. Set the same value in Resend's webhook config. Without it the webhook endpoint returns 503 and refuses everything, which is deliberate. |

**Verify the domain in Resend before sending anything real.** It walks you
through SPF, DKIM and DMARC records. This is not optional polish: billing mail
that lands in spam is worse than no billing mail, because you believe it was
delivered.

Webhook URL to paste into Resend (events: `email.delivered`, `email.bounced`,
`email.complained`):

```
https://yourdomain.com/api/email/webhook?secret=<RESEND_WEBHOOK_SECRET>
```

### 2. Receive — Resend does not give you a mailbox

Resend sends. To *receive* at the domain you need one of:

| Option | Cost | When it is right |
|---|---|---|
| **Cloudflare Email Routing** | **free** | Forwards `hello@`, `support@`, `billing@` into a mailbox you already own. Needs the domain's DNS on Cloudflare. Pair it with Resend as a "send mail as" relay in Gmail and you can reply from the domain too. Correct answer for one or two people. |
| **Zoho Mail** | ~$1/user/mo | Real mailboxes when forwarding stops being enough. |
| **Google Workspace** | ~$7/user/mo | Once there is a team and shared inboxes. |

Start on Cloudflare. Moving later is a DNS change, not a migration — a cheap
decision to get wrong.

### 3. Check it

- `/admin/email` should say **Sending is live** and show the From address.
- Trigger something real (approve a redeem) and watch the row go
  `sent` → `delivered` as the webhook lands.
- A row stuck on `sent` means the webhook is not reaching you; a `bounced` row
  is the moment you learn a customer never heard from you, which is the whole
  reason that screen exists.

## Crons

Declared in `vercel.json`. Both are `GET` and authenticate with `CRON_SECRET`.

| Path | Schedule | Why |
|---|---|---|
| `/api/cron/sync` | hourly | Standings are the product. A board that updates tomorrow is a board nobody refreshes. |
| `/api/cron/daily` | 12:00 UTC | Everything that posts into someone else's server. |

## Checks after a deploy

- `/` renders and `/api/card/planets` returns a PNG.
- Discord's portal accepts the interactions URL (a real signed PING).
- `/cluster` in a test server answers in under three seconds.
- Admin → Command centre → run each job once; every one reports what it did.
