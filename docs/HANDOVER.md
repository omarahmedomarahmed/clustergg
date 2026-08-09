# Handover

What somebody taking this over needs to know, in the order they will need it.
Not a tour of the code — the code is readable. This is the part that is not
obvious from reading it.

---

## 1. What the product actually is

A brand buys a **weekly challenge** on a game. Gamers who already play it enter
from the Discord server they are already in. Half the money leaves as prize
money; the servers that carried it share a weekly pool of the rest.

That sentence is the whole thing, and everything below exists to keep it true.

**The three customers, and their doors:**

| | Where they live | What they can do |
|---|---|---|
| Gamer | `/`, `/quests`, `/u/[slug]` | Link a game account, enter challenges, earn points, redeem trophies at 18 |
| Server owner | `/servers/[slug]` + portal key | Earn from the pool, withdraw, buy a private challenge for their members |
| Brand | `/brands/[slug]` + portal key | Buy 1–4 weekly challenges, choose trophies, read a report |

**Nobody signs in with a password except staff.** Owners and brands hold a
portal key; the guards are in `lib/portal-auth.ts` and they are constant-time.

---

## 2. The five things that will bite you

### The bootstrap deadlock

Anything reachable from a seed or from inside a transaction **takes the handle
it was given**. A helper that calls `getDb()` for itself will deadlock waiting
on the bootstrap that is calling it. This has happened twice. If a test hangs
forever with no output, this is why.

### The demo database is built from a DDL list, not from the schema

`lib/db/schema.ts` is Drizzle's view. `lib/db/index.ts` holds a literal
`CREATE TABLE IF NOT EXISTS` list, and **that** is what the demo database is
made of. A new table needs both. A new column needs `schema.ts` plus an entry in
`COLUMN_MIGRATIONS`, which is how it reaches production — by deploying.

### `status = "active"` means "live now" to a dozen queries

The homepage, the feed, the planets, the card renderer and the Discord resolver
all read it that way. That is why later runs of a series are written as
**drafts** and why announcing is what flips a run to active. Write a future week
as active and it appears on the homepage today.

### Nothing counts before the gun

Scoring rebaselines every entrant at the challenge's start
(`lib/sync.ts`). A participant row whose `baselineAt` is null is one written
before that existed and is deliberately never rebaselined — rebaselining a
running challenge wipes points people have already been shown.

### `networkidle` never fires in this app

Link prefetch and analytics keep the network busy forever. Use the helpers in
`tests/ui/_nav.mjs` (`open`, `after`, `settle`). Six suites were once killed by
this before anybody noticed the pattern.

---

## 3. Money: the rules that are not negotiable

- **No balance is ever stored.** Every vault, every wallet, every total is a sum
  over rows that exist for another reason. A stored balance cannot be
  reconstructed after it goes wrong. `lib/vaults.ts`, `lib/server-wallet.ts`.
- **We never store a payment detail.** Not an IBAN, not a card, not a last-four.
  A preference word and an opaque provider handle, nothing else. `docs/PAYMENTS.md`,
  and `tests/db/account-deletion.mts` asserts the absence by name.
- **Nothing is announced before its bill is paid.** Enforced at the announce
  path via `lib/challenge-billing.ts`, not by convention.
- **A private challenge is a sale, not a transfer.** The owner pays the prize
  pool plus 5% and we then owe the prize as our own obligation. Removing that
  margin turns the feature into money transmission.

---

## 4. Where the decisions are written down

| Question | File |
|---|---|
| What did we build, when, and what did it cost? | `docs/PLAN.md` — the dev log |
| What do we sell and why is it priced that way? | `docs/MODEL.md` |
| What may we never do with payment data? | `docs/PAYMENTS.md` |
| What did counsel research say? | `docs/B73_RESEARCH.md` |
| What did the product look like before the pivots? | `docs/legacy/LEGACY_PRODUCT_AND_CHANGELOG.md` |

**Every rule that binds a customer is published** at `/rules/gamer`,
`/rules/owner` and `/rules/brand`, and every figure on those pages is imported
from the code that enforces it. If you change a constant, the guide changes with
it — and `tests/db/rules.mts` fails if it does not.

---

## 5. How to work on it

**Typecheck → build → drive it in a real browser → commit → push.** Never
commit on "it should work". The build catches what the type-check cannot, and
the browser catches what neither does.

**Commit every chunk that stands on its own, the moment it works.** A build item
is three to eight commits, not one.

**When you write down what is broken, name the file and the line you actually
read.** An inference that sounds right is how a session ends up editing three
files that were already correct.

**Invert a test rather than deleting it.** When behaviour changes, the old
assertion usually becomes a new one worth keeping — and the comment explaining
why it flipped is the most valuable line in the file.

---

## 6. What is not finished

`docs/PLAN.md` is authoritative and current. The short version:

| Area | State |
|---|---|
| Challenge lifecycle, campaigns, pool, wallets, private challenges | Built and tested |
| Public `/pool` page, public server profile rebuild | Not built |
| Co-sponsored challenges (two brands, one competition) | Not built |
| Scale: cold-start DDL replay, stat-sync throughput, unbounded event tables | Known, unfixed, and the reviewer called them fatal |
| Sybil defence: no email verification, no captcha | Known, unfixed, and load-bearing now that the pool pays for member counts |
| Legal: non-US withholding, under-18 ad profiling | Open questions, documented in `docs/B73_RESEARCH.md` |

The honest summary is that the *product* is ahead of the *platform*: what a
customer touches works and is tested; what would break at a hundred times the
traffic has been identified and not yet fixed.
