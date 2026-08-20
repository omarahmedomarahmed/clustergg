# Deployment

Everything here is done from a dashboard. There are no terminal commands in
this document and there never will be — 10-SETUP's rule is that the owner has
no terminal, ever.

If you want to know whether the platform is healthy right now, do not read this
document. Open **`/admin/preflight`**. It shows every variable, every service,
the schema version and the three schedules, green or red, with the reason.

---

## 1 · What runs where

| Piece | Where | Notes |
|---|---|---|
| The app | Vercel project `clustergg-v3` | Deploys automatically on every push to the connected branch |
| The database | Neon project **ClusterGG v3**, Postgres 18, `us-east-2` | Use the **pooled** connection string |
| Card artwork | Vercel Blob | Installed at boot by `instrumentation.ts`; without a token, images live in memory and vanish on restart |
| The three jobs | Vercel Cron, from `vercel.json` | Sync hourly · post-queue every 5 minutes · daily jobs at midnight |
| Discord | An app in the Discord Developer Portal | HTTP interactions only — there is no gateway process to keep running |

### The schema arrives with the build

The build command is `npm run db:migrate && next build`. The migrator runs
**first**, so a deploy whose migrations fail stops at the migration instead of
going live against a database that cannot serve it.

This is worth stating plainly because the opposite once shipped: the build
command was `next build` alone, the migrator was never called, the database had
zero tables, and every page answered 500. `95-deploy` now fails the test band
if the build command stops calling the migrator.

---

## 2 · Environment variables

Set these in **Vercel → Settings → Environment Variables**, for Production and
Preview. After changing any of them, **redeploy** — a running deployment does
not pick up new values.

`/admin/preflight` lists every one of these by name and says whether it is set.
It never displays a value, and cannot: the page is only ever handed a yes or a
no.

### Required — the platform does not work without these

| Variable | What breaks without it |
|---|---|
| `DATABASE_URL` | Every page 500s. The app silently runs an in-process demo database instead of yours |
| `AUTH_SECRET` | Staff sessions cannot be signed, so nobody can sign in to `/admin` |
| `PORTAL_SECRET` | Brand portals cannot be signed into — **and a card signature reaches for it, so a missing one once took the whole Discord bot down**. It must not be shared with any other secret |
| `SETUP_TOKEN` | The first admin cannot be created. Remove it once one exists |
| `CRON_SECRET` | **All three jobs answer 401 and the weekly cycle silently never runs.** No gun, no sync, no close, and nothing on any page says so |

> **`CRON_SECRET` fails closed, and that is the right direction** — an unset
> secret makes the three jobs answer 401 rather than leaving the endpoint that
> closes the week open to anybody who can POST to it. The cost is that the
> symptom is *nothing at all*. It is now in 10-SETUP §1 and on
> `/admin/preflight`, and the band asserts **both** directions: every variable
> the document requires is on the preflight, and every variable the preflight
> requires is in the document.

> **`PORTAL_SECRET` is the one that gets forgotten**, and its failure does not
> look like its cause.

### Discord

| Variable | What breaks without it |
|---|---|
| `DISCORD_BOT_TOKEN` | The bot cannot post. Announcements queue and never drain |
| `DISCORD_PUBLIC_KEY` | Signature verification fails, so Discord rejects the endpoint and every button press 401s |
| `DISCORD_APPLICATION_ID` | Commands cannot be registered |
| `DISCORD_CLIENT_ID` | Gamers and server owners cannot sign in — that is both doors |
| `DISCORD_CLIENT_SECRET` | The OAuth exchange fails after the redirect, so sign-in dead-ends |

### Payments · Email · Providers · Site

| Variable | What breaks without it |
|---|---|
| `STRIPE_SECRET_KEY` | No brand can pay an invoice, so no challenge reaches `scheduled` |
| `STRIPE_WEBHOOK_SECRET` | Payments succeed at Stripe and the platform never hears. Invoices stay unpaid |
| `RESEND_API_KEY` | No invite keys, no password resets, no redemption codes — so nobody can cash out |
| `RIOT_API_KEY` | Riot games are not offered. The picker only shows games playable today |
| `NEXT_PUBLIC_SITE_URL` | Links in Discord posts and emails point at the wrong host |
| `BLOB_READ_WRITE_TOKEN` | Card artwork is held in the server process and disappears on the next restart |

---

## 3 · The first admin

There is exactly one way to create an administrator, and it is a page. There is
no API path — `96-setup` asserts that no route handler anywhere can reach it.

| # | Where | Do this |
|---|---|---|
| 1 | Vercel | Add `SETUP_TOKEN` — any long random string |
| 2 | Vercel | Redeploy |
| 3 | Browser | Go to `/setup` |
| 4 | The page | Setup token · email · password · confirm password |
| 5 | — | Press **Create admin account**. It signs you straight in |
| 6 | Vercel | **Delete `SETUP_TOKEN`** |
| 7 | Vercel | Redeploy |

The page refuses once any admin exists, so a forgotten token cannot mint a
second one — but remove it anyway. Five wrong tokens in fifteen minutes locks
the page, counted in the audit log rather than in memory so that retrying
against a different instance does not get around it.

---

## 4 · The scheduled jobs

Declared in `vercel.json` and visible in **Vercel → Settings → Cron Jobs**.

| Job | Cadence | What it does |
|---|---|---|
| `/api/cron/sync` | Hourly | Pulls each due linked account's stats |
| `/api/cron/announce` | Every 5 minutes | Drains the Discord post queue |
| `/api/cron/daily` | Daily, midnight | The gun, the close, milestones |

Each stamps the time it finished, and `/admin/preflight` shows when each last
fired. **A job that has never run shows as never run** — which is the symptom
of a missing `CRON_SECRET`, because the schedule fires, the route answers 401,
and Vercel's dashboard shows an invocation either way.

A job never moves money. The daily close opens payouts as drafts; a person
releases them.

---

## 5 · Discord

In the Discord Developer Portal, for your application:

| Setting | Value |
|---|---|
| Interactions Endpoint URL | `https://<your-domain>/api/discord/interactions` |
| OAuth2 redirect | `https://<your-domain>/api/auth/discord/callback` |
| Scopes | `identify` at sign-in; `guilds` only when adding the bot to a server |

Discord verifies the endpoint by sending a signed **PING** and refuses to save
the URL if the signature check fails. If it will not save, `DISCORD_PUBLIC_KEY`
is wrong or missing — that is almost always the cause.

### The slash commands, and why this is a step rather than a note

**Press "Register the slash commands" on `/admin/preflight` after any deploy
that changes them.** The row above the button is Discord's own answer to *which
commands are registered*, not ours — a local list compared against a local list
passes on the one day the registration failed.

This is a real deploy step because for a whole sprint it was nobody's. The bot
handled `Ping` and `MessageComponent`, no command was ever registered, and
`registerGlobalCommands` was written and called by nothing. Buttons only exist
on an announced challenge card, so **a gamer in a server with no live challenge
could not reach the bot at all** — while `12-IDENTITY` §3 was telling a gamer
with no parent server to go and use `/cluster`.

Global commands can take up to an hour to reach every client. The `PUT`
replaces the set whole, so a command deleted from `lib/discord/commands.ts` is
gone from Discord at the next registration and not before.

---

## 6 · Payments

Add the webhook endpoint in **Stripe → Developers → Webhooks**, pointing at
`https://<your-domain>/api/payments/webhook`, then copy the signing secret into
`STRIPE_WEBHOOK_SECRET`.

The endpoint answers **200 to everything it accepts**, including a replay, so
Stripe's delivery log stays clean; the body says which outcome it was. A
signature mismatch is a **400**, which is what the dashboard shows as a failed
delivery.

Replays are safe by design: an event id that has already been handled is
recorded and answered `replay`, and nothing moves a second time.

---

## 7 · Rolling back

| Situation | What to do |
|---|---|
| A bad deploy | **Vercel → Deployments → the previous one → Promote to Production.** Instant, and it does not touch the database |
| A bad migration | Migrations are forward-only. Rolling the app back does **not** roll the schema back. Restore the database from a **Neon branch** taken before the deploy, then promote the matching older deployment |
| A leaked secret | Rotate it at the source, update it in Vercel, redeploy. `/admin/preflight` confirms the new one is accepted |

Because rolling the app back leaves the schema forward, a deploy carrying a
destructive migration is the one thing worth taking a Neon branch before.

---

## 8 · What a human checks after a deploy

In order, and none of it needs a terminal.

1. **`/admin/preflight`** — every row green. This is the whole check; the rest
   is what to do when one is red.
2. The homepage, `/challenges` and `/pool` load with content.
3. **Vercel → Deployments → the build log** says the migrations ran. If the
   schema row on preflight is red, the answer is here.
4. **Vercel → Settings → Cron Jobs** lists three jobs. Preflight says when each
   last fired — a job that has never fired is usually `CRON_SECRET`.
5. Press a real button in Discord, **and type `/cluster`**. Nothing else
   exercises signature verification, the 3-second acknowledgement and the
   deferred work together, and neither test band covers any of it. The command
   is the half that has no button to fall back on: if the commands row on
   preflight is red, press its button and wait — Discord propagates globally.
6. If money moved: `/admin/vaults` reconciles, and the prize vault equals the
   sum of unredeemed money-trophies.

### Symptoms that do not look like their cause

| What you see | What it usually is |
|---|---|
| Every page 500s, `relation "…" does not exist` | Migrations never ran. Check the build log |
| The week never closed, nothing on any page says why | `CRON_SECRET` missing — the jobs are firing and answering 401 |
| The Discord bot dies on a card path | `PORTAL_SECRET` missing. A decoration reached for it |
| Card images 404 after a while | No `BLOB_READ_WRITE_TOKEN`; artwork was in memory and the process restarted |
| Discord will not save the endpoint URL | `DISCORD_PUBLIC_KEY` wrong or missing |
| Brands pay and nothing happens | `STRIPE_WEBHOOK_SECRET` missing or wrong. Stripe's delivery log shows 400s |
