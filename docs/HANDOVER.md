# Brief for the next session

You are picking up ClusterGG cold. Nobody expects you to have context, and this
file is deliberately short on it — your job needs fresh eyes more than it needs
history.

---

## 1. What this company is

**A brand buys a weekly gaming challenge. Gamers enter it from inside the
Discord servers they already sit in. Half the money leaves as prize money, and
the servers that carried the challenge share a weekly pool of the rest.**

The bot is the **delivery engine**, not a billboard. That distinction is the
whole business: we do not sell advertising space inside Discord, we deliver a
brand's *competition* to gamers in their own home and report on **entrants** —
people who actually played — rather than impressions. If 100 members enter a
weekly challenge, that is 400 entrants a month across four challenges, each
counted against its own server's members.

Read `docs/SOURCE_OF_TRUTH.md` next. Then `docs/MODEL.md` for the money.

---

## 2. One piece of context you do need

**This platform has been through two pivots.** You are not being asked to verify
them, and you are deliberately not being told what the product was before —
knowing would bias what you find.

You are told at all because you will probably meet the wreckage: a code comment
describing behaviour that no longer exists, a variable named for a concept that
was removed, an admin page for a flow nobody runs, a test asserting something
the product stopped doing. **When you hit something that does not add up, that
is a finding — report it.** Do not assume you have misread it, and do not
quietly work around it.

---

## 3. What you are being asked to do

### 3.1 Audit, as a stranger

Go through the product **as a first-time user would**, not as someone who has
read the code. Open pages, click things, try to complete real tasks. The point
is the experience and its contradictions, not a code review.

Two passes:

**Public-facing.** Every page a gamer, a server owner or a brand can reach. Does
what the page *says* match what the platform *does*? Is the core offering —
sponsored challenges delivered through Discord — actually stated anywhere a
visitor would find it? What is in the business model or the idea that has **no
representation at all** in the product: no page, no route, no button, no copy?

**Admin.** Role-play **every staff type** that could use the admin side, one at
a time, as though you had just been handed the login on your first day.
Walk each department's real flows — every click needed to complete an action.
For each role, report:

- pages they need and cannot reach, or can reach and should not
- pages sitting in the wrong group or under an inconsistent route
- anything you got stuck finding
- anything that contradicts something else in the product

### 3.2 Rewrite the tests

The existing suites were written alongside the code and inherit its
assumptions. **Write new ones from your own understanding of the platform**, as
formed from the docs and the product — not from reading the old tests. Then run
them.

Two house rules, learned expensively:

- **Prove a guard by breaking it and watching it go red**, then verify the break
  was reverted. Several suites here have passed for months while asserting
  nothing — one checked that a variable held a figure, not that anybody received
  the money.
- **Import numbers, never retype them.** Guides, docs and decks import the
  constants that enforce them, so no page can quote a figure the product stopped
  using.

Run the bands with `node tests/run-all.mjs` (database) and
`npm test -- --ui` (browser — it builds and starts its own server on :3031, and
**needs a prior `next build`**; browser suites run under plain `node` and cannot
import a `.ts` module, so read source and parse it as `tests/ui/admin-sweep.mjs`
does).

### 3.3 The data room

Rebuild it. Every document, full-page rewrite. It should read as real materials
for a startup raising money — pitch deck, company profile, financial model — not
a side-scrolling slide toggle. Some of the current content is stale and the
visualisation engine in it is poor.

---

## 4. How to report

**Do not fix and move on.** For anything you flag, come back with:

- what you found, in plain English
- why it is wrong — the logic behind the flag
- what you recommend, and the alternatives you considered
- clear choices for the owner to pick between

Use **tables**. Group findings by area. Then **stop and ask for direction**
before making the changes.

The one thing to avoid: reporting a finding you have not verified. If you
suspect something but could not confirm it, say that in those words.

---

## 5. Known issues, reported by the owner

These are **already confirmed** — you do not need to rediscover them, and they
need fixing rather than investigating.

| Area | Issue |
|---|---|
| **Nav dropdowns** | Hovering Play / Earn / Advertise opens a panel with **no background**. It is transparent, overlays the page behind it, and is unreadable. |
| **Nav bands** | The CP indicator renders the **word "CP"** instead of the icon. The nav bands need rebuilding from scratch. |
| **Admin routes** | Many admin pages sit under inconsistent paths. They should be reorganised into consistent, simple groups under `/admin`. |
| **Admin — sales flow** | A button the sales staff need is at the bottom of the page and is hard to find. |
| **Admin — gamer profile** | Needs full staff management: an audit trail, the gamer's earnings history, which servers they belong to, and which challenges they joined — so support staff can actually do their job. |
| **Vaults** | The vault system does not cover one aspect of each challenge's money cycle. Work out which, and propose the fix. |

The owner's own view is that **every public page and every admin page needs
rewriting and reorganising**. Treat that as the expected scale of the work, not
as a conclusion you must confirm — assess each page and say what you actually
find, including where you disagree.

---

## 6. Work left undone by the previous session

Not your purpose, and not a mess to clean up before you start. Just the honest
state of the queue when the last session ended. Sequence them however your audit
suggests.

| # | Item | State |
|---|---|---|
| **Repost button** | Every bot announcement — challenge, Profile of the Week, winners — needs a button that re-posts that exact announcement to the same channel as a **new** message, triggered per server. | Not started. The privacy fix it depends on (a public card must answer privately) is done and tested. |
| **Challenge dashboard** | One dashboard to manage every challenge from. | Not started. |
| **M6** | Private challenges: `MIN_PRIZE_POOL` $20 → $5, prize pools in $5 increments, surfaced in the server wallet at $5. A server owner buys a private challenge for their own members out of their wallet balance. | Not started. |
| **M7** | One end-to-end test of the money loop: brand pays → vaults post → week closes → server wallet credited → withdrawal opens. | Not started. |
| **M10** | The data room rebuild (§3.3 above). | Not started. |

Two things need the owner rather than an agent:

- **Three data-room documents still need reseeding in production.** They quote a
  price and a raise that are no longer current. Reseeding destroys hand-edits
  made since 2 August, which is why it has not been done.
- **A GitHub ruleset** was drafted and never applied.

---

## 7. Rules that are not yours to change

- **Never store a payment detail anywhere.** Only a preference word and an opaque
  provider handle. See `docs/PAYMENTS.md`.
- **`/admin/users` and `/admin/linked-accounts` are admin-only.** No staff
  department reaches the gamer directory or the linked-account list, ever.
- **If Neon MCP is available, treat it as READ-ONLY.** No writes, no migrations,
  no DDL against production.
- **Do not open a pull request unless asked.**
- **Kill background tasks you start.** Never leave a server running.

---

## 8. Where things are

| Looking for | File |
|---|---|
| What the product is | `docs/SOURCE_OF_TRUTH.md` |
| The money model | `docs/MODEL.md` |
| How it is built | `docs/ARCHITECTURE.md` |
| Running it | `docs/SETUP.md`, `docs/OPERATIONS.md` |
| Payment rules | `docs/PAYMENTS.md` |
| What a delivered view means | `docs/DELIVERY.md` |
| The server ladder | `lib/ladder.ts` — one array; rung, bracket and label at once |
| The weekly close | `lib/week-close.ts`, `lib/week-standing.ts`, `lib/server-score.ts` |
| The four vaults | `lib/vaults.ts`, `lib/vault-split.ts` |
| The bot | `lib/discord/`, `app/api/discord/interactions/route.ts` |
| Wondering what happened | `git log` |
