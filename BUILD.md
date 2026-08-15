# What has been built

`docs/` is the specification and has not been edited. This file is the report
against it.

Ten stages of `docs/08-BUILD-ORDER.md`, in order. **229 tests, 1,017
assertions, 18 mutations caught, 68 guards proven by breaking them.**

---

## How to run it

Nothing here needs a database, a key, or an environment variable. The whole
build and test cycle runs against an in-process database.

| | |
|---|---|
| `npm test` | Band 1 — the logic band. Eleven seconds |
| `npm run mutate` | The mutation harness. Asks whether the band can tell working code from broken |
| `npm run build && npm start` | The site, with an in-process database |
| `npm run test:browser` | Band 2 — seeds the demo and photographs the record |
| `npm run seed` | Seed the demo database from a terminal |

`screenshots/` is the record. It is committed.

---

## The stages

| Stage | What | Where |
|---|---|---|
| 0 · Foundation | Next.js, the three-way database layer, migrations, **the one assertion module** | `lib/db`, `tests/helpers` |
| 1 · Identity | Signup, session, onboarding, derived `unlockState`, the under-13 path | `lib/identity`, `lib/auth` |
| 2 · Providers | 24 adapters, `matches`, no percentages, per-challenge queue, VALORANT not live, season rollover | `lib/providers`, `lib/core/sync.ts` |
| 3 · Money | Four vaults, one append-only ledger, the prize-vault invariant, the half rule, payouts as drafts | `lib/money` |
| 4 · Challenges | Six states, `max(challengeStart, joinedAt)`, scoring, the eight-guard entry chain, the gun and the close | `lib/challenges` |
| 5 · Trophies | Definitions, templates, the prize-pool guard, milestones, redemption, five-year hold and sweeps | `lib/trophies` |
| 6 · The bot | Ed25519, the three-second rule, the nav grammar, the fenced card renderer, owner-only cards | `lib/discord`, `lib/cards` |
| 7 · The website | Homepage with the live pool, challenges, trophies, community, servers, profiles | `app`, `lib/pool`, `lib/site` |
| 8 · Portals | Portal keys, the owner portal and community builder, the brand builder and reports | `lib/portal` |
| 9 · Admin | The dashboard first, live indicators, the three notifications, the weekend checklist | `lib/admin` |
| 10 · Proof | The mutation harness, the four-week simulation, the browser record | `tests/mutate.mts`, `tests/band1/99-full-cycle.test.ts`, `tests/band2` |

---

## What is not built

Honestly, so nobody has to discover it.

| Not built | Why |
|---|---|
| The Discord **card layouts** | The transport, the 3-second rule, the nav grammar, the renderer and its fences are all done and tested. The individual card designs per family are not — they are drawing, and they need the real bot connected to be worth doing |
| Admin **screens** | `lib/admin/dashboard.ts` computes everything the console shows and is fully tested. The pages that render it are not written |
| Portal **screens** | Same shape: `lib/portal/*` is complete and tested; the brand and owner pages are not written |
| `/games`, `/rules`, `/legal`, `/settings/*` | Content pages with no logic behind them |
| Discord **OAuth** | The route and the config exist. It needs the credentials from `docs/10-SETUP.md` |
| Stripe | The webhook's job is one function — `onInvoicePaid` — and it is tested. Wiring it to Stripe needs the keys |
| Daily series **builder UI** | The arithmetic (`bill = prize ÷ 0.5`), templates and instantiation are done and tested |

Everything above is a surface over logic that exists and is proven. Nothing
below the surface is missing.

---

## The five findings worth reading

These came out of building it, not out of reading the spec.

### 1. A half-cent where the money document contradicted itself — **resolved**

`docs/02-MONEY.md` §3's worked table allocated **$109.38** of a $218.75 vault in
week 4. That is half a cent *above* half the vault, and the same document stated
the rule three subsections earlier as an absolute — `pool ≤ vault ÷ 2, always` —
with `docs/07-DATA-MODEL.md` A1 making it a guard that refuses anything above. A
guard cannot refuse $109.375 and also produce $109.38.

It was raised rather than reconciled silently. **The ruling: the rule stands,
the table was wrong.** The document now floors too — week 4 allocates $109.37
and holds $109.38, and the month reads $415.62 paid / $109.38 held. The code did
not change; it was already right.

### 2. The ½ split needed a table that did not exist

K1 splits an entrant "across every server a gamer belongs to". That is not
expressible from `challenge_participants`, which is unique on (challenge,
gamer) — P4 — so it records the one server they clicked Join in and cannot
record the three they are in.

Without membership the rule silently becomes *"whole credit to whichever server
they happened to click in"*, and two servers carrying one gamer sum to two
entrants — exactly what K5 forbids. `guild_members` exists for that one rule,
and the split is restricted to servers the challenge was actually announced to,
because a server it never reached did nothing for that entrant.

### 3. Two silent timing bugs in baselining

Found by breaking the baseline rule and noticing the day-2 test did **not** go
red. `enterChallenge` was stamping the *date* from the rule and the *values*
from `now` — identical for a day-2 joiner, so the score came out right while
the stored `baselineAt` was a lie. Fixing it exposed two more:

- The **forced sync on join** stamped its reading milliseconds *after* the join
  instant, and scoring reads `observedAt <= baselineAt`. The gamer would have
  baselined on the reading taken *before* their forced sync — the stale reading
  that forced sync exists to prevent.
- The **final sync at the close** stamped `now`, which is necessarily after
  `endAt`. Its reading fell outside the scoring window, making the final sync an
  expensive no-op and deciding placements on the last hourly reading — exactly
  what B3 forbids. Nothing would have thrown; the leaderboard would just have
  been slightly wrong, every week, forever.

### 4. `summoner-v4` was on the hot path

`docs/11-PORTED-CODE.md` says never put it there — it is 1,600 requests a
minute against `league-v4`'s 20,000 per ten seconds. The ported adapter called
it on **every stat sync of every League account**. It is now `rich`-only:
linking, reconnecting, verifying.

### 5. Two provider entries were a hard-coded pair of ids

`isProviderLive` had `p.id === "psn" || p.id === "activision"` written into it.
A rule expressed as a list of names only covers the names somebody remembered
and cannot be tested as a property. Both now carry `notLive` with their reason,
which is the same mechanism VALORANT needed.

---

## The seven holes the guard-breaking found

Each of these was a guard that existed, was reachable, and was **caught by zero
suites** when broken. All are closed and re-broken. Full detail in
`tests/PROVEN.md`.

| Hole | Why it was invisible |
|---|---|
| Emptying the sanctions list | The test looped over the list, so an empty list ran the body zero times |
| The Riot endpoint budget | The sync suite drives a fake adapter — it proved the plumbing, not the League adapter |
| The League queue setting | Same: it proved the setting was *passed*, never that it was *read* |
| The money constants | Every test derived its expectation from the constant it was guarding |
| Paid-only vault routing | Every path reached it through `markPaid`, so the guard was only ever called with the answer it wanted |
| The announce readiness check | Every test either announced a correct challenge or was stopped earlier by the unpaid check |
| Community challenges in the pool | The fixture's challenge was excluded by the *state* filter, so the visibility filter was never exercised |

The pattern in five of the seven: **a test that mocks or derives from the thing
it is meant to be checking is checking itself.**

---

## What is needed from the owner

Nothing, until you want this on the internet. Then `docs/10-SETUP.md`, which is
entirely dashboard clicks — a database, a payment webhook, a Discord
application, and four environment variables.

Until then it runs, in full, with nothing configured.
