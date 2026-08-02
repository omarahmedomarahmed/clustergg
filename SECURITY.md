# Security

Report anything you find to **security@clustergg.com**. We'll answer.

## What we defend, and how

| Asset | Control |
|---|---|
| Gamer sessions | JWT in an httpOnly, SameSite=Lax, Secure cookie; bcrypt password hashes; Server Actions are same-origin POST only |
| Admin surface | Every mutating path calls `requireStaff()` / `requireAdmin()`; a staff member sees only their department's systems (`lib/systems.ts`); `/admin/users` and `/admin/linked-accounts` are closed to all staff |
| One user's data from another | Every self-service action filters by `userId = me.id` — unlink, resync, join, message, post |
| Brand and server portals | An access key exchanged for a signed, httpOnly session cookie scoped to that one portal. Comparison is timing-safe; three misses lock the portal for 15 minutes and every attempt is a row staff can read. |
| Discord | Every interaction verified by Ed25519 against `DISCORD_PUBLIC_KEY`. An unverified request never reaches a handler. |
| Uploads | Size cap and type allow-list; images are only ever rendered as `img src` or `background-image` |
| Cron and bootstrap | `CRON_SECRET` and `SETUP_TOKEN`; both routes reject anything else |
| The database | Drizzle parameterised queries throughout. Dynamic SQL uses a hardcoded identifier allow-list, never user input. |
| Secrets | Env only. Nothing committed. |

## Things worth knowing before you change them

- **A Server Component may not write cookies.** Portal unlock is a route handler
  for that reason; moving it back into a page breaks *correct* keys while wrong
  ones still show the locked view.
- **The portal signing secret lives on `globalThis`.** Next bundles server code
  per entry point, and a module-local secret means the bundle that mints a
  session and the bundle that checks it disagree.
- **We never request Discord's Message Content intent.** The bot cannot read
  message text, by design. Anything that needs a gamer's words gets them from a
  modal or the site.
- **Portal keys never appear in a URL.** The unlock form POSTs; a shared `?key=`
  link is handed off and stripped, so it stays out of history, logs and the
  Referer of every outbound link on the page.

## Checks before a release

```bash
npx tsc --noEmit
npm run build
```

Then: sign in as a non-staff account and try to open `/admin` (404), unlock a
portal with a wrong key four times (locked, with the reason), and POST an
invalid signature to `/api/discord/interactions` (401).
