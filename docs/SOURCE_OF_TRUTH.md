# ClusterGG — the source of truth

**Read this first.** It is the whole product in one file: what it sells, how the
money moves, who touches what, and which rules cannot be bent. Every other
document narrows to one topic; this one is the map.

It describes what is true right now. When this file and anything else disagree,
check the code — and then fix whichever of the two is wrong.

---

## 1. The one-sentence version

**A brand buys a weekly gaming challenge. Gamers enter it from inside the
Discord servers they already sit in. Half the money leaves as prize money, and
the servers that carried the challenge share a weekly pool of the rest.**

Everything below keeps that sentence true.

---

## 2. Why anyone buys it

There is no ads manager for Discord. A brand that wants the people inside a
gaming server has no self-serve way to reach them, and the servers themselves
have no way to earn from being worth reaching.

Cluster is that market. The brand gets a competition with their name on it, a
trophy sitting permanently on the winner's profile, and a delivery ledger that
counts what actually happened instead of estimating it. The server gets paid.
The gamer gets money for playing the game they were going to play anyway.

**Brand imagery lives on our own domain and the bot links to it.** We do not
sell display inventory inside Discord. That began as a legal read
(`docs/B73_RESEARCH.md`) and turned out to be the better product.

---

## 3. The three customers

| | Where they live | What they can do |
|---|---|---|
| **Gamer** | `/`, `/quests`, `/u/[slug]` | Link a game account, enter challenges, earn Cluster Points, win trophies, redeem a trophy for money from 18 |
| **Server owner** | `/servers/[slug]` + a portal key | Earn from the weekly pool, withdraw, buy a private challenge for their own members |
| **Brand** | `/brands/[slug]` + a portal key | Buy 1–4 weekly challenges, choose the trophy, read a delivery report |

**Only staff sign in with a password.** Owners and brands hold a portal key, and
the guards that check it are constant-time (`lib/portal-auth.ts`).

---

## 4. The money cycle, start to finish

```
brand pays an invoice
        ↓
   the four vaults           50% prize · 15% server pool · 15% CP · 20% Cluster
        ↓
   ┌────┴────┬──────────────┬──────────────┐
   ↓         ↓              ↓              ↓
trophies   weekly pool   CP ceiling     Cluster
 to the    to servers    to gamers
 winners   that carried
           the challenge
   ↓         ↓
redeemed   withdrawn
for cash   by the owner
 at 18+    over $20
```

The shares are a **setting an operator can change** (`/admin/vaults`), not a
constant in the code. The prize half is fixed; the other half splits three ways.

**Money reaches a vault when an invoice is marked paid**, never when it is
issued. Allocating on issue fills the vaults with money nobody has sent, and
every payout below then draws on a promise.

**No vault has a balance column.** Each is `sum(amount)` over a ledger where
every row names who moved it and why. A stored balance cannot be reconstructed
after it goes wrong, and eventually every one of them goes wrong. Same for every
wallet and every total on every screen. See `lib/vaults.ts`,
`lib/server-wallet.ts`.

**Our share is the Cluster vault, not everything that is not a prize.** Of a
sponsored challenge, half is prize money, the server pool and the points vault
take their shares next, and what is left is ours. The other three are
obligations that leave. `marginPerChallenge()` is the only place that figure is
computed.

**The prices are in `lib/pricing.ts` and nowhere else.** A document that quotes
a rate is a rate we are held to by whoever read it, so no document here quotes
one. Every page, guide, invoice and deck imports the figure from the module that
enforces it.

### The constraint that sizes the whole business

**A game runs one sponsored challenge at a time.** Two on the same game in the
same week split the field and make both look empty.

A campaign is four consecutive weekly challenges — one month, on one game. So a
game serves exactly one paying brand per month, and the network serves as many
sponsors as it has games. Six games is six sponsors, whatever the demand.

This is the ceiling on revenue and it is not moved by selling harder. It is
moved by adding games. `lib/finance.ts` computes it as `payingBrandCapacity`
and caps every projection with it.

---

## 5. What a challenge is, and the five states it passes through

```
draft → queued → announced → live → ended
```

- **draft** — being built. Later weeks of a multi-week buy sit here.
- **queued** — built and waiting for its week.
- **announced** — visible and joinable, days before it starts.
- **live** — scoring has begun, for everybody at once.
- **ended** — placements are final, trophies are awarded.

**Announced and live are deliberately separate gates.** Publishing early is how
a competition gets a field. Scoring early would hand an early entrant a head
start nobody could match.

**Nothing is announced before its bill is paid.** That check
(`lib/challenge-billing.ts`) is the only thing standing between a handshake and
a promise made to every server on the network.

**Nothing counts before the gun.** Every entrant is rebaselined at the
challenge's start, so joining early buys visibility and never points.

A challenge pays **1 to 10 places** — whoever bought it decides how deep.

---

## 6. The gamer

### Nothing accrues until the account is real

Three steps, one page, about a minute:

1. **Link a game account.**
2. **Confirm an email** — a six-digit code, sent automatically at signup.
3. **Answer three questions** — age band, country, and the colours their card
   wears.

Until all three are done, **nothing accrues**: no points, no trophies, no
challenge entry. A balance is a promise, and a promise made to an account whose
age, country and inbox we do not know is one we may not be able to keep.

Two age bands are selectable — **13 to 17** and **18 or over**. Under-13 is a
link that explains why, asks for a typed confirmation, and deletes the account.
A salted hash of the email and the Discord ID is kept afterwards and nothing
else, so the same person cannot sign up again a minute later with a different
answer.

A confirmed account carries a **check mark** — gold at 18+, blue below. The
hover text says "Confirmed account" and never an age. It can be switched off in
one place, and switching it off changes nothing about what they may do.

### What they earn

- **Cluster Points (CP)** for playing, under a **daily ceiling** derived from
  what the operator released from the CP vault that week, divided by the
  eligible gamers, divided by the days left. The ceiling is why the points are
  still worth something in six months.
- **Trophies** for winning, kept permanently on their profile. A trophy carries
  a dollar value.
- **Cash**, by redeeming a trophy, from 18. Where they live decides whether that
  is possible at all — which is why country is asked before anybody earns rather
  than at the moment they try to collect.

### Quests

Quests are the guided path across the platform: a map, tiers with cumulative CP
thresholds, and a daily mission with a streak. They are how a gamer with no
challenge running still has a reason to link an account and come back.

---

## 7. The server owner

### The weekly pool, not a rate

An owner is never quoted a per-challenge percentage. A rate quoted is a rate we
are held to, and the pool is not a rate.

**The weekly close** runs on Monday (`lib/week-close.ts`):

1. An operator **releases** an amount of the server vault for the week. What is
   not released is the **reserve** — that is what pays owners through a week
   when nothing sells.
2. Servers that carried a **public** challenge are scored on three terms:
   exclusive-weighted entrants, newly qualified members, and entrant conversion.
   Every term is percentile-ranked **within a bracket**.
3. **A flat share of the pool is split evenly** between everybody who took part,
   placed or not. Turning up is worth something.
4. The rest is shared in proportion to score, inside the bracket. A bracket
   decides who you compete against and nothing else, so a handful of large
   servers can never take the small servers' share.
5. A **draft payout** is opened for each. Money moves when a human releases it.

**What does not count:** a private challenge the owner bought themselves. That
money came from brands buying public inventory, and paying an owner out of it
for their own event pays them twice. **What does count:** every member who links
an account, whatever prompted it. *A private challenge grows you, it does not
pay you twice.*

`/pool` is public: this week's released pool, every server competing for it,
what each has done, and what each would be paid if the week ended now — computed
by the same function that writes Monday's cheques, never by a second
implementation that could drift.

### The wallet

`earned − paid − requested − spent = available`, every term a sum over rows.

- **Withdraw** it, above a floor set in `lib/server-wallet.ts`. Below that a
  transfer spends most of itself in fees. Requesting a withdrawal makes the
  money unspendable immediately, so it can never go out twice.
- **Spend** it on a private challenge for their own members: the prize pool plus
  a margin.

That margin is not a hidden charge. It is what makes a private challenge a
**product we sell** rather than us moving an owner's money to their members —
which would be money transmission. The owner buys a competition; we then owe the
prize as our own obligation.

---

## 8. The brand

A brand buys **1 to 4 consecutive weekly challenges** on one game. Four is a
month, and a month is how a media buy is planned. Anything longer, mixed across
more games, or priced off the rate card is a **custom deal**: an operator builds
it, a campaign is created from what they typed, and the brand confirms it in
their own portal. There is no way for a brand to self-serve past four.

**They pay a fixed price per challenge.** Impressions are delivery evidence —
proof we ran what we sold — and never an invoice line.

In the portal they choose the trophy, watch the challenge fill, and read a
report that shows their own delivery against platform benchmarks with nobody
named.

---

## 9. What we will not do

| Not doing | Why |
|---|---|
| Show a brand another brand's numbers | Which is exactly why they never see yours |
| Describe any audience group under 25 people | A count of three is three people somebody can name |
| Slice an audience by age band | It is a compliance field. Slicing by it is the under-18 profiling nine jurisdictions bar |
| Promise a per-challenge rate to an owner | A rate quoted is a rate we are held to |
| Store a payment detail | Not an IBAN, not a card, not a last-four. A preference word and an opaque provider handle, nothing else. `docs/PAYMENTS.md` |
| Let staff into the gamer directory | `/admin/users` and `/admin/linked-accounts` are admin-only. No staff department reaches them, ever |

---

## 10. How the platform is built

Next.js 15 App Router, React 19, TypeScript, Tailwind v4, Drizzle ORM over
Postgres (Neon in production, PGlite in-process for tests and the demo),
deployed on Vercel with Vercel Blob for uploads. A Discord bot renders every
surface as a card image.

### Five invariants

**Derived, never stored.** Balances, streaks, a challenge's stage, unlock
progress, sponsor lists, risk scores — all computed from rows that exist for
another reason.

**Numbers are imported, never retyped.** Every guide, document and deck pulls
its figures from the module that enforces them. There is no second copy to go
stale.

**The demo database is built from a DDL list, not from the schema.**
`lib/db/schema.ts` is Drizzle's view; `lib/db/ddl.ts` holds the literal
`CREATE TABLE` list the demo database is made of. A new table needs both. A new
column needs `schema.ts` plus an entry in `COLUMN_MIGRATIONS` — which is how it
reaches production, by deploying.

**Only the base generated schema has foreign keys.** Tables added later via
`CREATE TABLE IF NOT EXISTS` have none, so anything that deletes across them
must handle its own ordering (`lib/account-deletion.ts` exists for exactly this).

**Anything reachable from a seed or a transaction takes the handle it was
given.** A helper that calls `getDb()` for itself deadlocks waiting on the
bootstrap that is calling it. If a test hangs forever with no output, this is
why.

### Testing

Two bands. The **db band** stands up its own in-memory PGlite per suite and
needs nothing running — `npm test`. The **browser band** drives a real Chromium
against a production build and is opt-in — `npm test -- --ui`.

`networkidle` never fires in this app; use the helpers in `tests/ui/_nav.mjs`.

**Prove a guard by breaking it and watching it go red** — and check the break
actually applied. A guard that passes against a deliberately broken build is not
a guard.

---

## 11. Where every rule that binds a customer is published

`/rules/gamer`, `/rules/owner` and `/rules/brand`. Every figure on those pages
is imported from the code that enforces it, so changing a constant changes the
guide with it — and `tests/db/rules.mts` fails if it does not.

---

## 12. The other documents

| Question | File |
|---|---|
| What do we sell, and where does each dollar go? | `docs/MODEL.md` |
| What may we never do with payment data? | `docs/PAYMENTS.md` |
| What does somebody taking this over need to know? | `docs/HANDOVER.md` |
| How is the codebase laid out? | `docs/ARCHITECTURE.md` |
| How do I run it? | `docs/SETUP.md` |
| How is it operated day to day? | `docs/OPERATIONS.md` |
| What did the legal research say? | `docs/B73_RESEARCH.md` |
