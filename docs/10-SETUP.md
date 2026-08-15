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
| `PORTAL_SECRET` | Signs the **brand** session and the brand invite exchange. Server owners sign in with Discord and have no key to sign | Any 64-character random string. **Must not be the same as any other secret here** |
| `SETUP_TOKEN` | One-time token that lets the first admin account be created | Any long random string. Remove it after the first admin exists |

**`PORTAL_SECRET` is the one that gets forgotten.** Without it, brand
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
| `DISCORD_CLIENT_ID` | Same app → OAuth2. **Sign-in for gamers and server owners** |
| `DISCORD_CLIENT_SECRET` | Same app → OAuth2 |

**Add `https://clustergg.com/api/auth/discord/callback` as a redirect URI** under
OAuth2, or every sign-in fails with a mismatch. Scopes: `identify` at sign-in,
`guilds` only when somebody adds the bot to a server.

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

Load-bearing: it delivers brand invite keys, brand password resets and
redemption verification codes.

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

**Do this last.** The whole build and test cycle runs against an in-process
database that needs nothing configured, so a real database is only required when
the platform is ready to deploy. Pointing an existing deployment at a new empty
database takes the site down for no gain.

| Step | Where | Do |
|---|---|---|
| 1 | `console.neon.tech` | **New Project** |
| 2 | Region | **Match the Vercel region.** Vercel defaults to Washington D.C. (`iad1`) → pick an AWS US East region |
| 3 | Connection Details | Turn **Pooled connection** ON |
| 4 | — | Copy the string — the host must contain **`-pooler`** |
| 5 | Vercel → Settings → Environment Variables | Add as `DATABASE_URL`, ticked for Production, Preview and Development |
| 6 | Vercel → Deployments → ⋯ | **Redeploy**, with **"Use existing Build Cache" unticked** |

| Trap | Why it matters |
|---|---|
| **The direct string instead of the pooled one** | The host without `-pooler` opens a connection per request and exhausts the pool — *"Too many database connection attempts are currently ongoing"*, on every request instead of once |
| **Not redeploying** | Environment variables are baked in at build time. Changing one does nothing to the deployment already running |
| **Leaving the build cache on** | A cached build can carry the old value forward |
| **Region mismatch** | Every page makes several queries. A cross-continent hop adds its latency to all of them |

The schema is created automatically on first boot. Nothing needs running by
hand, and no step here uses a terminal.

### The first admin

**This is a page with a form, not an API route.** Nobody should ever have to
hand-craft a URL or reach for a terminal to create the first account.

| Step | Where | Do |
|---|---|---|
| 1 | Vercel | Add `SETUP_TOKEN` — any long random string |
| 2 | Vercel | Redeploy, with the build cache **off** |
| 3 | Browser | Go to `https://clustergg.com/setup` |
| 4 | The page | Fill in: **setup token · email · password · confirm password** |
| 5 | — | Press **Create admin account**. It signs you straight in |
| 6 | Vercel | **Delete `SETUP_TOKEN`** |
| 7 | Vercel | Redeploy |

**What `/setup` must do — build it exactly like this:**

| Condition | Behaviour |
|---|---|
| No admin exists, `SETUP_TOKEN` set | Show the form |
| An admin already exists | *"Setup is already complete."* No form, no hint about the token |
| `SETUP_TOKEN` not set in the environment | *"Setup is not enabled."* No form |
| Wrong token submitted | *"That setup token is not right."* Nothing else — never confirm whether a token exists |
| Correct token, valid details | Create the admin, sign them in, redirect to the console |

| # | Rule |
|---|---|
| 1 | It refuses once an admin exists, so a forgotten token cannot mint a second one — **but remove it anyway** |
| 2 | The token is compared in constant time, like every other secret here |
| 3 | Failed attempts are rate-limited and written to the audit log |
| 4 | There is **no API-only path** to creating an admin. The page is the only way |

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

### Which events

| Event | Why |
|---|---|
| `checkout.session.completed` | **The one that matters.** Payment done → challenge moves to `scheduled` |
| `checkout.session.async_payment_succeeded` | Bank debits settle later. Without this, slow payment methods never complete |
| `checkout.session.async_payment_failed` | So a failed slow payment does not sit as pending forever |
| `charge.refunded` | Reverse the vault routing |

Do not subscribe to everything. Thousands of irrelevant deliveries bury the
useful ones.

### Testing it, without a terminal

Stripe's own dashboard fires test events — their command-line tool is not needed.

| Step | Where |
|---|---|
| 1 | Stripe → Webhooks → your endpoint → **Send test webhook** |
| 2 | Pick `checkout.session.completed`, send |
| 3 | Read the response on the same page. **200 = good.** 400 = signature mismatch. 500 = handler error |
| 4 | Then a real one: Stripe in **Test mode**, buy a challenge in the brand portal with card `4242 4242 4242 4242`, any future expiry, any CVC |
| 5 | Confirm the challenge reaches `scheduled` in admin |

### The four ways this breaks

**The webhook is the only thing that moves a challenge to `scheduled`.** When it
is wrong the buyer sees a receipt and a success page, and nothing happens on our
side. Nobody finds out until the brand asks why their challenge never ran.

| # | Trap | Symptom | Fix |
|---|---|---|---|
| 1 | **Test and live are separate worlds** | Works throughout testing, silently dead on launch day | Different keys **and** different endpoints **and** different signing secrets. Create the endpoint twice, once in each mode, and swap both variables when going live |
| 2 | **Signature needs the raw body** | Every delivery returns 400 on a perfectly valid request | The handler reads the raw request text. Anything that parses the JSON first breaks the signature check |
| 3 | **Deployment protection** | Stripe gets 401 and you see nothing | Check Vercel → Settings → Deployment Protection. If it is on, Stripe's POSTs are rejected before reaching the route |
| 4 | **Stripe retries for 3 days** | One payment becomes two challenges and two sets of vault entries | **The handler must be idempotent, keyed on the Stripe event ID.** A repeat is a no-op |

Trap 4 is the expensive one: it puts money into the vaults twice, which breaks
the prize-vault invariant the whole platform rests on.

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
| `PORTAL_SECRET` unset | Brand login fails **and the Discord bot dies**, because a decorative signature threw on a card path | Set it. Fence anything decorative |
| **WebP artwork on a card** | *"Unsupported image type: image/webp"*. The card renderer cannot decode WebP, so any game art uploaded as WebP fails — silently degrading the card, or killing it | **Convert on upload.** Accept WebP from the uploader and store PNG or JPEG. Never trust the source format |
| **Sync opening too many connections** | *"Too many database connection attempts are currently ongoing"* from the database on the hourly sync | Bound the batch and reuse one connection across it. A per-account connection will not survive a real account count |
| Riot key replaced | Every League account breaks at once | Keep the self-heal |
| Node downgraded below 22 | Every money path throws — loudly on a purchase, silently on a background job | Pin it in the project config |
| A per-guild loop inside a request | Announcements silently half-deliver | Everything fans out through the queue |
| An unknown field on a Discord component | The card never appears, with no error | Strip internal fields before sending |
