# Setup and deployment

Everything here is done through a web dashboard. **No terminal is required for
any of it**, and no step below asks for one.

---

## 1 · Environment variables

Set these in the Vercel project, under **Settings → Environment Variables**, for
Production and Preview.

### Required — the app does not work without them

| Variable | What it is | Where it comes from |
|---|---|---|
| `DATABASE_URL` | The database connection string | Neon dashboard → your project → Connection string |
| `AUTH_SECRET` | Signs staff sessions | Any 32+ character random string |
| `PORTAL_SECRET` | Signs every brand and server portal session | Any 64-character random string. **Must not be the same as any other secret here** |
| `SETUP_TOKEN` | One-time token that lets the first admin account be created | Any long random string. Remove it after the first admin exists |

**`PORTAL_SECRET` is the one that gets forgotten.** Without it, brand and server
portals cannot be signed into at all — and because a card signature reaches for
it, a missing one once took the entire Discord bot down as well. It may not be
shared with any other secret: whoever holds it could otherwise mint a session for
any portal without ever seeing a key.

### Discord

| Variable | Where it comes from |
|---|---|
| `DISCORD_BOT_TOKEN` | Discord Developer Portal → your app → Bot |
| `DISCORD_PUBLIC_KEY` | Same app → General Information |
| `DISCORD_APPLICATION_ID` | Same app → General Information |

### Payments

| Variable | Where it comes from |
|---|---|
| `STRIPE_SECRET_KEY` | Stripe dashboard → Developers → API keys |
| `STRIPE_WEBHOOK_SECRET` | Stripe dashboard → Developers → Webhooks, after adding the endpoint |

Both are load-bearing: brands pay themselves, so a broken key means no sales.

### Email

| Variable | Where it comes from |
|---|---|
| `RESEND_API_KEY` | Resend dashboard → API Keys |

Load-bearing: it delivers brand portal keys and redemption verification codes.

### Game providers

| Variable | Notes |
|---|---|
| `RIOT_API_KEY` | The **personal** key. See §4 |
| Others | One per live provider — see `ported/providers/registry.ts` for which each needs |

A provider with no key is simply not offered. That is deliberate: the game
picker only shows games that can actually be played today.

### Site

| Variable | Value |
|---|---|
| `NEXT_PUBLIC_SITE_URL` | `https://clustergg.com` |
| `BLOB_READ_WRITE_TOKEN` | Vercel dashboard → Storage → Blob |

---

## 2 · A fresh database

| Step | Where |
|---|---|
| 1 | Create a new project in the **Neon dashboard** |
| 2 | Copy its connection string |
| 3 | Paste it into Vercel as `DATABASE_URL` |
| 4 | Redeploy from the Vercel dashboard |

The schema is created automatically on first boot. Nothing needs running by
hand.

### The first admin

| Step | |
|---|---|
| 1 | Set `SETUP_TOKEN` in Vercel |
| 2 | Visit `/api/setup` with that token |
| 3 | Create the admin account |
| 4 | **Remove `SETUP_TOKEN`** and redeploy |

The route refuses to do anything once an admin exists, so a forgotten token
cannot mint a second one — but remove it anyway.

---

## 3 · Discord

| Step | Where |
|---|---|
| 1 | Create an application | Discord Developer Portal |
| 2 | Add a Bot | Same app → Bot |
| 3 | Set the **Interactions Endpoint URL** to `https://clustergg.com/api/discord/interactions` | Same app → General Information |
| 4 | Discord immediately sends a verification ping. It must succeed, so deploy first | — |
| 5 | Under OAuth2, generate an install link with `bot` and `applications.commands` | Same app → OAuth2 |

**Discord will reject the endpoint if the app is not already deployed and
`DISCORD_PUBLIC_KEY` is not set.** Set the variables and deploy, then set the
endpoint.

---

## 4 · Riot

The key in use is a **personal key**, not a development key and not production.

| | |
|---|---|
| Methods available | **39** |
| Expiry | It does not expire |
| Recorded in | `ported/providers/riot-methods.ts` |

### What it can do

| Endpoint | Limit | Used for |
|---|---|---|
| `league-v4 entries by-puuid` | 20,000 / 10s | **Wins, losses, tier, division, LP — both queues, one call.** All of scoring and rank gating |
| `account-v1 by-riot-id` | 1,000 / min | Linking |
| `match-v5` | 2,000 / 10s | Available, not currently needed |
| `summoner-v4 by-puuid` | **1,600 / min** | Display names only. **70× tighter than everything else — keep it off hot paths** |

### What it cannot do

| Game | Status |
|---|---|
| **VALORANT** | **Every endpoint gone, including platform status.** Cannot be scored, gated or health-checked. Unsellable until Riot grants production access |
| TFT | Every endpoint gone |
| Legends of Runeterra | Every endpoint gone |

### One thing that will bite

**PUUIDs are scoped to the key.** If the Riot key is ever replaced, every stored
PUUID becomes invalid and every League account breaks at once with
`Exception decrypting <puuid>`. The self-heal in `ported/core/sync.ts` recovers
them automatically — it re-resolves each account and updates the identifier.
**Do not remove it**, and do not let it re-point an account whose ownership was
*proven*.

---

## 5 · Stripe

| Step | Where |
|---|---|
| 1 | Copy the secret key into Vercel | Stripe → Developers → API keys |
| 2 | Add a webhook endpoint at `https://clustergg.com/api/payments/webhook` | Stripe → Developers → Webhooks |
| 3 | Subscribe it to payment success events | Same screen |
| 4 | Copy the signing secret into Vercel as `STRIPE_WEBHOOK_SECRET` | Same screen |
| 5 | Redeploy | Vercel |

**The webhook is the only thing that moves a challenge to `scheduled`.** If it
is misconfigured, brands pay and nothing happens — and that failure is silent
from the buyer's side, so it must be checked before the first sale.

---

## 6 · Scheduled jobs

Defined in the project's Vercel configuration and picked up on deploy.

| Job | When | Does |
|---|---|---|
| Sync | Hourly | Pulls stats for every linked account |
| Announce drain | Every 5 minutes | Posts queued announcements |
| Daily | Once a day | Stamps baselines at the gun, closes the week, awards milestones |

A job never releases money. It computes; a human releases.

---

## 7 · Before the first real sale

| # | Check | Where |
|---|---|---|
| 1 | `PORTAL_SECRET` is set and unique | Vercel |
| 2 | A brand can sign up and receive a key | Try it |
| 3 | A test payment moves a challenge to `scheduled` | Stripe test mode |
| 4 | The bot responds in a real server | Try it |
| 5 | A gamer can link and prove an account | Try it |
| 6 | The prize-vault balance equals its trophies | Admin → Vaults |
| 7 | A redemption email is delivered | Try it |
| 8 | `SETUP_TOKEN` has been removed | Vercel |

---

## 8 · Things that have caused an outage before

| Cause | Symptom | Prevention |
|---|---|---|
| `PORTAL_SECRET` unset | Every portal login fails **and the Discord bot dies**, because a decorative signature threw on a card path | Set it. Fence anything decorative |
| **WebP artwork on a card** | *"Unsupported image type: image/webp"*. The card renderer cannot decode WebP, so any game art uploaded as WebP fails — silently degrading the card, or killing it | **Convert on upload.** Accept WebP from the uploader and store PNG or JPEG. Never trust the source format |
| **Sync opening too many connections** | *"Too many database connection attempts are currently ongoing"* from the database on the hourly sync | Bound the batch and reuse one connection across it. A per-account connection will not survive a real account count |
| Riot key replaced | Every League account breaks at once | Keep the self-heal |
| Node downgraded below 22 | Every money path throws — loudly on a purchase, silently on a background job | Pin it in the project config |
| A per-guild loop inside a request | Announcements silently half-deliver | Everything fans out through the queue |
| An unknown field on a Discord component | The card never appears, with no error | Strip internal fields before sending |
