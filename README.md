# Cluster

**The media-buying and monetization layer for Discord gaming communities.**

A brand buys a weekly competition. The gamers who already play that game enter
it from inside the Discord server they are already in. Half of what the brand
pays leaves as prize money the gamers win, the servers that carried it share a
pool of the rest, and everything anybody was promised is a number computed from
rows that already exist.

```
brand pays  →  50% prizes  →  gamers win trophies (redeemable for cash at 18)
            →  15% pool    →  servers that carried it, scored and bracketed
            →  15% points  →  the CP economy gamers earn from daily play
            →  20% ours
```

---

## The three people this is for

| | What they get | Where |
|---|---|---|
| **A gamer** | One profile across every game they play, a weekly competition worth real money, points for playing anyway | `/`, `/quests`, `/planets`, `/u/[slug]` |
| **A server owner** | A free bot, a share of the weekly pool, a wallet they can withdraw from or spend on a competition for their own members | `/discord-bot`, `/servers/[slug]` |
| **A brand** | 1–4 weekly challenges on a game, their name on the competition, their trophy on the winner's profile, reach counted from a delivery ledger | `/brands`, `/brands/[slug]` |

Every rule that binds each of them is published, with the reason it exists, at
**`/rules/gamer`**, **`/rules/owner`** and **`/rules/brand`** — and every figure
on those pages is imported from the code that enforces it, so none of them can
quote a number the product no longer uses.

---

## How a challenge works

Five rungs, one vocabulary, everywhere in the product:

```
draft → queued → announced → live → ended
```

| Rung | Means |
|---|---|
| **draft** | Built, not paid. Nobody outside the console can see it |
| **queued** | Paid and dated. Opens on its start date; no server told yet |
| **announced** | Every server it runs in has been told. It is now visible and joinable, and reach counts from here |
| **live** | Running. Scoring is moving |
| **ended** | Closed, scored, trophies awarded |

**Two gates, deliberately separate.** A challenge becomes joinable when it is
*announced*, days before it starts — that is how a competition gets a field.
Scoring begins at the *start*, for everybody at once: entering early buys a
place in the queue and no head start. `lib/challenge-stage.ts`, `lib/sync.ts`.

**Nothing is announced before its bill is paid.** The announce path asks
`lib/challenge-billing.ts` whether the invoice cleared, and that check is the
only thing between a handshake and a promise to every server on the network.

---

## The money

Four vaults, and no balance is ever stored — each is `sum(amount)` over a
ledger where every row says who moved it and why (`lib/vaults.ts`).

| Vault | Share | Whose it is |
|---|---|---|
| Prize | 50% | The gamers', as trophies. A liability, not income |
| Server pool | 15% | Divided weekly between servers that carried a public challenge |
| CP vault | 15% | Funds every point a gamer earns |
| Cluster | 20% | Ours |

**The weekly close** (`lib/week-close.ts`) runs Monday: it scores the servers
that carried a *public* challenge, splits the released pool 60/25/15 across
small, mid and large brackets, and opens a draft payout for each. A bracket
decides who you compete against and nothing else. 20% of the pool is split flat
between everybody who took part.

**A server owner's wallet** (`lib/server-wallet.ts`) is the same idea: earned −
paid − requested − spent, every term summed from rows. They can withdraw it
(minimum $20) or spend it on a private challenge for their own members at the
prize pool plus 5%.

---

## Running it

```bash
npm install
DEMO_DB=1 npm run dev      # no database needed — PGlite in-process, seeded
```

`DEMO_DB=1` gives a complete working platform with servers, brands, challenges
and trophies. Set `DATABASE_URL` instead to run against Postgres or Neon; the
schema provisions itself on first connect.

```bash
npm test                   # every database suite (~5 min)
npm test -- --ui           # plus the browser suites; starts its own server
npx tsc --noEmit           # types
DEMO_DB=1 npm run build    # catches what tsc cannot: the client/server boundary
```

Full instructions, environment variables and deployment: **`docs/SETUP.md`**.

---

## The map

| Where | What |
|---|---|
| `app/` | Routes. `app/admin` is the console, `app/brands/[slug]` and `app/servers/[slug]` are the two customer portals |
| `lib/` | Every rule. If a number matters, it lives here and is imported, never retyped |
| `lib/db/` | `schema.ts` is the tables; `index.ts` holds the DDL and the idempotent column migrations that reach production by deploying |
| `components/` | UI. `components/admin/kit.tsx` is the console's vocabulary |
| `tests/db/` | 75 suites. They run the real functions against a real database |
| `docs/SOURCE_OF_TRUTH.md` | The whole product in one file. Read it before writing anything about what Cluster does |
| `docs/legacy/` | The platform before the pivots, kept because the reasoning is still useful |

---

## What to read next

| If you are | Read |
|---|---|
| Setting it up | `docs/SETUP.md` |
| Taking it over | `docs/HANDOVER.md` |
| Deciding something | `docs/MODEL.md` — what we sell and why it is priced that way |
| Touching money | `docs/PAYMENTS.md` — **we never store a payment detail. Ever.** |
| Wondering what it does | `docs/SOURCE_OF_TRUTH.md` |
| Wondering what happened | `git log`, then `docs/legacy/` |
