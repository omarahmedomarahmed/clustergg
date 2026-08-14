# What was carried over, and why

**Do not open the old branch.** Everything worth keeping is in `ported/`, copied
here deliberately, file by file, each with the reason it survived.

That rule exists because the last three sessions inherited each other's mistakes
by reading old code and assuming it encoded a decision. It did not — it encoded
a *previous* decision, and nothing said which. If something you need is missing
from `ported/`, ask before going to look for it.

The old work lives on `claude/clustergg-audit-g2ftlm` if a human wants it.

---

## The rule for using these files

| | |
|---|---|
| **Wire them as they are** | They work. They were read, and in several cases proven by breaking them |
| **Do not refactor on arrival** | Refactoring code you have not yet exercised is how working things break |
| **Do change the parts this document says to change** | Listed per file below |
| **Their tests did not come with them** | New tests, written against the new truth |

---

## `ported/providers/` — the moat

24 adapters across 23 games. This is the most valuable thing in the repository:
publisher API access is the real constraint on the business, not code.

| File | Why | Change on arrival |
|---|---|---|
| `registry.ts` | Every provider, its metrics, its rank ladders, whether it is live | **Add a `matches` metric to `riot-lol`** (`Δwins + Δlosses`). **Remove `win_rate` from scoreable metrics** — §4.3 rules out percentages |
| `adapters.ts` | The fetchers. Also `scrubSecrets`, `explainErrorBody`, `isStaleIdentifier` | `riot-lol` reads **solo queue only** for wins/losses. Queue must become a per-challenge setting — solo, flex, or both |
| `riot-methods.ts` | **The 39 approved paths on the personal key.** Rate limits included | Keep as the authority. `summoner-v4 by-puuid` is capped at **1,600/min** — 70× tighter than anything else |
| `riot-verify.ts` | Profile-icon ownership proof | — |
| `riot-lol-rich.ts` | Richer LoL detail | — |
| `mlbb.ts` | Mobile Legends in-game mail code | — |
| `serialize.ts` | Observation serialisation | — |

### Two things about Riot that cost real downtime to learn

1. **PUUIDs are key-scoped.** When the key changed, every stored PUUID became
   invalid and every League account broke with `Exception decrypting <puuid>`.
   The self-heal in `ported/core/sync.ts` recovered all of them. **Keep it.**
2. **The personal key has 39 methods, not the development key's 59.**
   `summoner-v4` is `by-puuid` only. There is no `val/*` beyond platform status.
   `spectator-v5`'s path says `by-summoner` and takes a PUUID.

### What the key does support, confirmed

`/lol/league/v4/entries/by-puuid/{}` returns **tier, division, LP, wins and
losses per queue** in one call. That single endpoint covers ranked wins, matches
played, and both solo and flex rank gating. No `match-v5` fan-out required.

---

## `ported/core/sync.ts` — the sync engine

| Why | Change on arrival |
|---|---|
| Batching, intervals, error backoff, and the **stale-identifier self-heal** that recovered production when Riot's key rotated | The **proven-account guard** must survive: an account whose ownership was *proven* is never silently re-pointed at whoever holds that Riot ID today. It goes to `needs_reconnect` instead |

Add for the new model: **season-rollover detection.** Riot resets `wins` to 0 at
a split. A decrease must trigger a re-baseline, not a clamped-to-zero week that
silently costs every League player their progress.

---

## `ported/discord/` — the bot plumbing

The *screens and cards are new*. The transport is not.

| File | Why |
|---|---|
| `verify.ts` | Ed25519 request verification. Correct, and easy to get subtly wrong |
| `types.ts` | Discord's interaction and component types |
| `components.ts` | Row building, and the `custom_id` nav grammar. **`group` is ours, not Discord's — `rows()` strips it.** An unknown field is a rejected message, which is a card that never appears |
| `rest.ts` | REST layer with 429 handling |
| `config.ts` | Bot configuration |
| `post-queue.ts` | Enqueue + drain. **Nothing may fan out per-guild inline from a server action** — that bug class appeared three times before this existed |

**The 3-second rule:** Discord kills an interaction that is not acknowledged in
three seconds. Acknowledge first, do the work in `after()`. Every screen.

**`custom_id` is capped at 100 characters.** The nav grammar packs a screen, its
arguments and a back-trail into that budget.

---

## `ported/cards/fonts.ts`

Font loading for the Satori card renderer. Layouts are entirely new; this is not.

---

## `ported/core/portal-auth.ts` — session crypto

| Why | Change on arrival |
|---|---|
| Constant-time key comparison, HMAC sessions, brute-force lockout | **`PORTAL_SECRET` is required and throws without it.** Keep that. But **never call it from a decorative path** — a sponsor-link signature once took the entire Discord bot down because a missing secret threw out of an ad button. Fence anything decorative |

---

## `ported/core/secret.ts`

`AUTH_SECRET` handling. Throws in a real runtime, allows a fixed value in demo.
The fixed demo value is deliberate — a random one silently invalidates every
session on restart and nobody can work out why.

---

## `ported/core/utils.ts`

`uid()` and small helpers. No dependencies.

---

## `ported/db/tx.ts`

Transaction handling and the WebSocket polyfill for the pooled driver.

**Node 22+ is required** — the pooled driver needs a global `WebSocket`, Node 20
has none, and every money path throws without it. Pin it in `package.json` and
`.nvmrc`.

---

## What was deliberately **not** carried over

| Not ported | Why |
|---|---|
| Database schema | Fresh schema for a fresh product |
| Every page, route, action | The whole surface is new |
| All 99 test suites | They encode the old model's rules. **The patterns come across; the files do not** |
| `lib/finance.ts` | Built on a capacity ceiling that does not exist |
| The data room | Same |
| CMS keys and content | Every key is rewritten |
| Quests, CP, marketplace, wallet, feed | Deleted by ruling |
| `lib/week-close.ts`, `lib/server-score.ts`, `lib/ladder.ts` | The pool model changed. Rewrite against the new three KPIs |

---

## Test *patterns* worth stealing — the files are not coming

These are the four ideas that actually caught defects. Reimplement them; do not
copy the old suites.

| Pattern | What it does |
|---|---|
| **Break it and watch it go red** | A guard that has never failed is not known to be a guard. Break the code, confirm the test fails, restore, confirm it passes. This is how a dead assertion in the weekly close was found — three "assertions" were calling a SQL builder and testing nothing |
| **Self-expiring allowlists** | Every exception in a guard's allowlist must still describe something real, or the suite fails. An allowance cannot outlive its subject |
| **Walk the tree, never list files** | A guard with a hand-maintained file list only guards the files somebody remembered. Walk `app`, `components`, `lib` |
| **Assert properties, not strings** | A test pinned to one wording catches one file and goes red the first time somebody improves a sentence |

And one hard-won rule: **shared assertion helpers live in one module.** Ninety-nine
files each re-declaring `ok`/`eq`/`near` is exactly what let one file quietly not
declare one, and ship three assertions that could never fail.
