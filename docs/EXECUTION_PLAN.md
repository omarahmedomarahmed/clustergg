# ClusterGG — Full end-to-end verification, CP currency, bot cards, and screenshot-backed claims

**Status:** not started. Written to be executed from a cold start by whoever
picks it up, with no reliance on the conversation that produced it.

---

## 0. Read this first

### What this repo is

ClusterGG is **the media-buying and monetization layer for gaming
communities**. Three sides:

- **Gamers** link real game accounts (LoL, Valorant, PUBG, Dota 2, Apex,
  Fortnite are the six live ones), enter sponsored challenges, earn Cluster
  Points, buy and redeem trophies for real money.
- **Server owners** install the Discord bot, get their members to link
  accounts, and take a share of what brands pay — 5% at 500 linked, 10% at
  1,000, 25% at 5,000.
- **Brands** buy placements and sponsored challenges, and get counted reach.

Next.js 15 App Router, React 19, TypeScript, Tailwind v4, Drizzle ORM.

### The two commands you will use constantly

```bash
npx tsc --noEmit          # must be clean before every commit
npm run build             # must pass before every commit
```

```bash
# Demo server. `next start` serves the BUILT output — always rebuild first.
pkill -f next-server; sleep 3
(setsid nohup env DEMO_DB=1 npx next start -p 3031 > /tmp/cluster.log 2>&1 < /dev/null &)
sleep 20; curl -s -o /dev/null -w "%{http_code}\n" http://localhost:3031/
```

`DEMO_DB=1` builds a fresh in-memory PGlite database per process. It is seeded
from `lib/db/seed.ts`. **A test script cannot read ids from its own `getDb()`
and expect the running server to have them** — different process, different
database. Drive the server through its UI or its API.

Demo credentials: admin `admin@clustergg.com` / `cluster-admin`; staff
`ops@clustergg.com` / `cluster-demo`; gamers `nova@demo.gg`, `orion@demo.gg` /
`cluster-demo`.

### Traps this codebase has already cost people days on

1. **`html { zoom: 0.9 }` breaks Playwright's synthesized click coordinates.**
   The computed hit point lands on the sticky nav. Always:
   ```js
   const tap = async (loc) => {
     await loc.evaluate((el) => el.scrollIntoView({ block: "center" })).catch(() => {});
     await loc.click({ timeout: 4000 }).catch(async () => { await loc.evaluate((el) => el.click()); });
   };
   ```
2. **`innerText` returns CSS-transformed text.** `uppercase` classes break
   case-sensitive assertions. This has bitten five separate times. Use `/i`.
3. **`innerText` does not return the contents of a collapsed `<details>`.**
   Open them first: `document.querySelectorAll("details").forEach(d => d.open = true)`.
4. **The console shell paints a loading screen first.** Read after
   `networkidle`, and assert on `h1` not `body`, or you are racing.
5. **`notFound()` renders the 404 page but the HTTP status is 200** in this
   app. Assert on the heading, not the status.
6. **Floating promises die in server actions.** The runtime freezes the
   function the moment the request returns. `void doThing()` inside a server
   action is a bug — this is exactly why challenge reach reported zero while
   the Discord messages were visibly delivered. **Await, always.**
7. **A static property on a client component is `undefined` on the server
   side.** `Comp.Sub = Sub` renders as undefined from a server component —
   what crosses the boundary is a reference proxy. Use named exports.

### Workflow, non-negotiable

For every unit of work: **typecheck → build → verify empirically against a
real browser or a real database → commit → push.** Never commit on
"it should work". Every bug found by a test gets a comment at the fix site
explaining what broke, so the next person does not reintroduce it.

Branch: `claude/clustergg-platform-build-mfkzaa`. Push with
`git push -u origin claude/clustergg-platform-build-mfkzaa`.

---

## 1. What this plan delivers

Nine phases. Each is independently shippable and independently valuable — if
you run out of runway at phase 5, phases 0–5 still leave the product better
than they found it. **Do not start a phase before the previous one is pushed.**

| # | Phase | Why it comes here |
|---|---|---|
| 0 | Test infrastructure + showcase seed | Everything downstream needs committed tests and rich demo data to screenshot |
| 1 | Spam audit + announcement policy | A live bug annoying real servers right now |
| 2 | The CP coin — a currency, not a word | Touches every surface; do it before screenshots are taken |
| 3 | Bot cards: lists, flows, landing layout | The biggest functional gap in the product |
| 4 | Gifting: search as you type, web + Discord | Self-contained |
| 5 | Redeem + marketplace, step by step | Self-contained |
| 6 | The screenshot system | Needs 0–5 finished so the shots show the real thing |
| 7 | Every claim gets a shot; copy rewrite | Needs 6 |
| 8 | The full E2E matrix | Runs against everything above |
| 9 | The final report | Needs 8 |

---

## PHASE 0 — Test infrastructure and the showcase seed

### 0.1 Move tests out of `.scratch/`

`.scratch/` is **gitignored**. Every test written so far is invisible to the
repo, which is why this phase exists.

Create `tests/` at the repo root, committed:

```
tests/
  README.md              ← how to run them, what each covers, the traps above
  lib/
    harness.mjs          ← tap(), ok(), login helpers, screenshot helpers
    seed-showcase.mts    ← the demo dataset described in 0.2
  db/                    ← *.mts, run with `npx tsx`, DEMO_DB=1, no browser
  ui/                    ← *.mjs, run with `node`, playwright-core
  shots/                 ← *.mjs, capture-only runs (phase 6)
```

Migrate the existing suites verbatim, keeping every comment (they document
real bugs):

| From `.scratch/` | To | Asserts |
|---|---|---|
| `money.mts` | `tests/db/money.mts` | 65 — invoices, payouts, no payment details anywhere |
| `publish.mts` | `tests/db/publish.mts` | 19 — approve makes a draft; reach ledger is real |
| `market.mts` | `tests/db/marketplace.mts` | 45 — CP economy, gifting, wallet |
| `ownership.mts` | `tests/db/ownership.mts` | 56 — one account, one gamer |
| `ranks.mts` | `tests/db/ranks.mts` | 42 — the game's own rank ladders |
| `taxonomy.mts` | `tests/db/taxonomy.mts` | 40 — admin systems and departments |
| `botgrowth.mts` | `tests/db/bot-growth.mts` | 32 — server tiers and unlocks |
| `moneyui.mjs` | `tests/ui/money.mjs` | 67 — billing, payouts, the pay page |
| `ownerui.mjs` | `tests/ui/server-owner.mjs` | 33 — earnings, guide, tiers |
| `marketui.mjs` | `tests/ui/marketplace.mjs` | 21 |
| `admin.mjs` | `tests/ui/admin.mjs` | 46 |
| `landing.mjs` | `tests/ui/landing.mjs` | 22 |

Add `tests/run-all.mjs` that runs every suite, prints one table, and exits
non-zero on any failure. Add `npm run test` → `node tests/run-all.mjs`.

**Verify:** `npm run test` runs all of them green from a cold build.

### 0.2 The showcase seed — the single biggest enabler in this plan

You cannot screenshot "a server at 5,000 linked members earning a payout" if
no such server exists. **Every screenshot in phase 6 is only as good as this
dataset**, and it is the reason that phase can't be done first.

Write `tests/lib/seed-showcase.mts`, callable as
`DEMO_DB=1 SEED_SHOWCASE=1` at boot, producing a coherent narrative — not
random rows. Everything below must exist and be internally consistent (the
numbers on one page must reconcile with the numbers on another):

**Servers, one per tier, so the ladder is demonstrable:**
- Seed Server, ~40 linked — the "just installed" story.
- Sponsored Server, 640 linked — just crossed 500, 5% share, first payout paid.
- Broadcaster, 1,300 linked — 10%, three payouts, one in flight.
- **Flagship Server, 5,200 linked** — 25%, a payout history, a full earnings
  ledger, an itemised list of members who won. This is the money screenshot.

**Brands:**
- One on placements only — a $600 invoice, sent, unpaid, 12 days to run.
- One sponsoring three games — invoice with base + three game lines + the
  base-reduction discount, paid, with a reference.
- One with a live campaign: four weekly challenges, two completed with
  podiums, one live, one waiting; real impressions, clicks, reach.
- One overdue, so the overdue state is screenshot-able.

**Gamers (at least 30, with real-looking ranks across all six games):**
- One with every one of the six games linked and verified.
- One mid-verification (proof issued, not yet confirmed).
- One with a disputed account claim.
- Winners on the podiums above, with trophies held.
- One with a trophy redeem at each state: pending, approved, sent (with a
  collect link), paid.
- One with a large CP balance who has bought and gifted trophies.
- Vote counts for Profile of the Week, with a decided week and a live one.

**Challenges:** at least one per live game, spread across draft / active /
completed, with delivery-ledger rows so reach is non-zero, and participants
with scores so leaderboards are populated.

**Quests:** progress spread across tiers so the quest map and CP ledger have
something to show.

Seeding must be **idempotent and deterministic** — same input, same ids, same
numbers, so a screenshot taken today matches one taken next month. Use a fixed
PRNG seed, not `Math.random()`.

**Verify:** boot with the flag, open every portal, confirm the numbers
reconcile across pages (a server's earnings equal the sum of its ledger rows;
a brand's invoice total equals its line items; a gamer's CP balance equals
earned minus spent).

---

## PHASE 1 — The spam audit

### 1.1 The reported bug

`lib/link-account.ts:94`:

```ts
void announceAccountLinked(userId, provider.game).catch(() => {});
```

Two defects in one line: it announces **to every server on the network** that
one person linked an account, and it is a **floating promise** in a server
action (see trap 6).

At three servers this reads as a lively product. At three hundred it is a
stranger's name in everybody's channel, and it is the single fastest way to
get the bot removed.

### 1.2 Write down the policy, then enforce it

Add `lib/discord/audience.ts` with an explicit, commented policy and make
every announcement declare which bucket it is in:

| Audience | Goes to | Examples |
|---|---|---|
| `NETWORK` | every opted-in server | a **public** challenge launching; the Sunday winners |
| `OWNING_SERVERS` | the servers that carry it | a **private** challenge, with its key |
| `THEIR_SERVERS` | only servers this gamer is in | linked an account, joined a challenge, hit a quest tier, entered the top 5 |
| `DIRECT` | a DM to one person | your payout was sent, your redeem is ready to collect |
| `HQ_ONLY` | our own server | operational noise |

`lib/discord/announce.ts` already has `guildsOfGamer` for personal news and a
comment saying personal news "was fanned out to EVERY server". **Audit every
exported function in that file** and confirm which bucket it actually uses.
Anything personal that is not `THEIR_SERVERS` or `DIRECT` is a bug.

### 1.3 Rate limits, because policy alone is not enough

Even correctly scoped, a server with 200 members linking accounts on launch
day gets 200 messages. Add:

- **Per-guild-per-kind cooldown** — at most one "someone linked an account"
  post per server per hour, batched: "4 members linked a game account today:
  …". Store in a small `discord_post_log` table keyed on
  `(guildId, kind, window)`.
- **A global kill switch per announcement kind**, admin-editable at
  `/admin/discord`, so a noisy kind can be silenced without a deploy.
- **Per-server opt-outs by kind**, surfaced in the server portal — an owner
  who wants challenge announcements but not join notifications should not have
  to choose between all and nothing.

### 1.4 Sweep for the same class of bug

`grep -rn "void announce\|void report\|\.catch(() => {})" lib app` and check
every hit. Anything fired from a server action or route handler that writes to
the database must be awaited.

**Tests → `tests/db/spam.mts`:**
- A personal event resolves to only the servers that gamer is in.
- A gamer in zero servers produces zero targets, not a network broadcast.
- The cooldown collapses five links in an hour to one post.
- A disabled kind produces zero targets.
- A per-server opt-out is honoured while other servers still receive it.
- No announcement helper is called without `await` (a source-level assertion —
  read the files and regex them; ugly, but this bug class has now appeared
  twice and a comment did not prevent the second one).

---

## PHASE 2 — The CP coin: a currency, not a word

### 2.1 The mark

Design a Cluster Points coin as **inline SVG** and add it to
`components/Icon.tsx` as `cpCoin`. Requirements: legible at 12px, works on
dark and light, no text inside it, and a flat PNG variant at 64px and 128px
in `public/` for the Satori card renderer (Satori's SVG support is limited —
do not fight it, embed a PNG).

### 2.2 One component, used everywhere

```tsx
// components/Cp.tsx
<Cp amount={4120} />        // 🪙 4,120
<Cp amount={500} size="sm" />
<Cp amount={-250} />        // spend, in the negative tone
```

The coin goes **before** the number, like a currency symbol. The word "CP"
appears nowhere in normal UI. It may still appear in prose that explains what
Cluster Points are — a currency symbol with no name is a puzzle — but never as
a unit suffix on a number.

### 2.3 The sweep

```bash
grep -rn "CP\b" --include=*.tsx --include=*.ts app components lib | grep -v node_modules
```

Every hit is one of: a number that needs `<Cp>`, prose that stays, or a
variable name that stays. Expect ~40 sites. Known ones:
`TrophyMarket.tsx`, `TrophyCase.tsx`, `app/marketplace/page.tsx`,
`app/admin/marketplace/page.tsx`, the quest pages, the CP ledger, the nav.

### 2.4 The nav

Put the balance in the nav as `🪙 4,120` — a persistent wallet, the way a game
shows currency. Clicking it opens the CP ledger. This is what makes CP feel
like money rather than a score.

### 2.5 The Discord cards

`lib/cards/render.tsx` — every place a card prints a CP figure gets the coin
PNG at the right optical size. Affected kinds: `market`, `cp`, `profile`,
`quest`, and any card with a balance on it.

**Tests → `tests/ui/cp-currency.mjs`:** no rendered page contains the standalone
token "CP" immediately after a number; the coin is present wherever a CP figure
is; the nav shows the balance; `/api/card/market` and `/api/card/cp` render
with the coin (fetch the PNG, assert 200 and a plausible byte size).

---

## PHASE 3 — Bot cards: lists, flows, and a landing page

This is the largest phase and the biggest functional gap.

### 3.1 List cards — the reported gap

Today `/cluster challenge` opens **one** challenge with buttons to switch. It
should open a **card showing every live challenge for that game at once**, and
the buttons pick one.

Add two card kinds to `lib/cards/types.ts` → `data.ts` → `render.tsx` →
`layout-guide.ts` → `part-content.ts` → `preview.ts` → `LAYOUT_KINDS`:

- **`challenges`** — up to 6 live challenges for a game in a grid: title,
  sponsor logo, prize pool, entrants, time left, and a number badge matching
  the button beneath it.
- **`boards`** — every leaderboard for a game in one card: board name, metric,
  the current leader and their figure, and the viewer's own rank if they have
  one. Numbered to match buttons.

Follow the pattern the `market` card already established: `TILE_W = 218`,
three across, no fixed text height (it clips descenders — this was a real
bug), `clamp()` the names, numbered badges matching numbered buttons, because
**Discord cannot put a button on the image it belongs to.**

Update `lib/discord/screens.ts` so `challenges` and `leaderboards` open the
list card first, with the single-item card as the drill-down.

### 3.2 Every card gets the buttons that belong to it

Audit every screen in `lib/discord/screens.ts`. Each card should offer: the
obvious next action, **Back**, and a link out to the web equivalent. Current
gaps to check: the trophy case, the CP screen, the quest screens, the profile
card, the server screen.

Limits: 5 buttons a row, 5 rows, 25 total. The `custom_id` grammar is
`actionId(action, args, trail)` / `parseId` — a Discord custom_id is capped at
100 characters, so the back-trail must be pruned, not appended to forever.

### 3.3 The welcome card as a landing page

Today it is a numbered list of instructions. It should be a **grid of boxes**,
each a thing you can do — Link a game · Enter a challenge · See your stats ·
Spend your points · Customize your profile · How your server earns — with an
icon, one line each, and a button per box.

This is the first thing anybody sees from the product. It should look like a
home page, not a README.

### 3.4 Trophy redeem, in the bot

There is currently no Discord path to redeem at all. Build it as a numbered
sequence of cards:

1. **Your trophy case** — what you hold, what it is worth, what is redeemable.
2. **Pick what to cash out** — numbered buttons, running total on the card.
3. **How would you like to be paid** — the five preference words. **No account
   details, ever** — see `docs/PAYMENTS.md`; the whole design rests on this.
4. **Confirm** — the amount, the preference, one button.
5. **Submitted** — what happens next and when.
6. **Ready to collect** — a link button to the payout provider's own page.

Each step is a rendered PNG card with buttons. Each step must be re-enterable
after a Discord client restart, so state lives in the `custom_id` and the
database, never in memory.

### 3.5 Marketplace buy, step by step

The `market` card exists and shows six trophies with prices. Buying is one
click with no confirmation. Add: **confirm** (what you are buying, what it
costs, what your balance will be) → **bought** (the trophy, the new balance,
and that it redeems exactly like a won one).

Guard the same rules the web path guards, in the same server-side function —
`buyTrophy` in `lib/marketplace.ts` already re-reads the balance at purchase
time; do not duplicate the logic, call it.

**Tests → `tests/ui/bot-cards.mjs`:** every card kind renders 200 with a
plausible size from `/api/card/<kind>`; the list cards show more than one item;
the welcome card is a grid; each screen's button set is non-empty and within
Discord's limits. Plus `tests/db/bot-flows.mts` for the redeem and buy state
machines, driven through the interaction handler with synthetic payloads.

---

## PHASE 4 — Gifting: search as you type

### 4.1 On the web

`components/TrophyMarket.tsx` currently asks for a "profile name" in a plain
text box, and a typo means a rejected purchase. Replace it with a debounced
type-ahead: avatar, display name, `@slug`, and their Discord handle if they
have one.

Needs a `GET /api/gamers/search?q=` endpoint — prefix match on display name,
slug and Discord username, limit 8, **public data only** (no email, ever), and
rate-limited. Check whether an existing search endpoint can be reused rather
than adding a second one.

### 4.2 In the bot

Allow entering a **Discord username** as the recipient. This is the natural
identifier there — a gamer knows their friend's Discord handle, not their
Cluster slug. `users.discordUsername` already exists and is populated at OAuth.

Two safeguards: show the resolved profile before charging anything ("Send to
**Nova** (@nova)? — yes / no"), and handle the not-found case with a message
that says how to find the right name rather than just failing.

Discord's autocomplete interaction type can serve this live if the gift flow
is a slash command; if it is a modal, resolve on submit and show a confirm
step.

### 4.3 Show the value in CP

Every gift surface shows the price with the coin, and the recipient's
notification says what it was worth.

**Tests → `tests/ui/gifting.mjs`** (typing three characters produces results;
picking one fills the form; a misspelling never reaches the server action) and
**`tests/db/gifting.mts`** (resolve by slug, by display name, by Discord
username; ambiguous names; self-gifting; the giver is charged, not the
recipient — this last one is already asserted in the marketplace suite,
keep it).

---

## PHASE 5 — Redeem and marketplace, step by step, on the web

A dedicated `/redeem` route with a real stepper: **choose trophies → how you
want to be paid → confirm → submitted → collect**, each step deep-linkable and
survivable across a refresh. Today this is a popup inside the trophy case,
which is fine for one trophy and poor for the moment somebody cashes out $400.

Same for `/marketplace` buying: a confirm step showing balance before, price,
balance after.

Both must state, at the step where it matters: **spending points never lowers
your level**, and **we never see your bank details**. These are the two things
that make people trust the economy, and burying them costs more than the space
they take.

**Tests → `tests/ui/redeem-flow.mjs`:** every step renders; back works; a
refresh mid-flow resumes; the totals match; no bank field exists anywhere on
any step (assert on input names and placeholders — this is the property the
whole payments design rests on).

---

## PHASE 6 — The screenshot system

**The goal, in one sentence: no claim on the website without a real screenshot
of the real feature behind it.**

### 6.1 The data model

```
feature_shots
  key            text primary key   -- "server.earnings.ledger"
  imageUrl       text               -- Blob
  altText        text               -- accessibility, and it is a claim too
  caption        text
  overlay        jsonb              -- {title, subtitle, badge, focusRect, blur[]}
  capturedAt     timestamptz
  capturedFrom   text               -- the route, so it can be recaptured
  updatedBy      text
```

One row per **component**, keyed by a stable name. Change the row, and every
page claiming that component updates — which is exactly the requirement:
*"admin can change 1 image it would change everywhere this component exists"*.

### 6.2 The component

```tsx
<FeatureShot shotKey="server.earnings.ledger" />
```

- Renders the image with the overlay applied, `loading="lazy"`, correct aspect
  ratio reserved so nothing shifts on load.
- Falls back to a labelled placeholder when no shot exists yet — **visibly**,
  so a missing shot is obvious rather than an empty gap.
- For an admin, shows an inline edit affordance: replace the image, edit the
  caption and alt text, adjust the overlay, or trigger a recapture.
- Never renders a broken image; a dead Blob URL degrades to the placeholder.

### 6.3 The capture harness

`tests/shots/capture.mjs` — drives the demo app with the showcase seed and
saves named screenshots. Rules that make the output usable:

- **Full-page and component-cropped variants.** A claim about the earnings
  ledger wants the ledger, not the whole page. Crop with
  `locator.screenshot()`, not by hand.
- **Deterministic.** Fixed viewport, seeded data, `prefers-reduced-motion`,
  animations disabled, dates frozen where possible. Two runs a month apart
  should differ only where the product changed.
- **Both themes and both breakpoints** where the marketing page uses them.
- **Nothing real in them.** The seed is fictional by construction; assert that
  no screenshot contains a demo email address or a portal key before it is
  published.
- Writes a **manifest** (`tests/shots/manifest.json`) mapping shot key →
  route → selector → file, so recapture is one command and never a hunt.

### 6.4 The admin console

`/admin/shots`: every shot key, its image, where it is used on the site (the
reverse index — computed by grepping `shotKey=` at build time or maintained as
a registry constant), whether it has been captured, and when. Bulk recapture.
Filter for "claims with no shot" — that list is the phase 7 to-do.

**Tests → `tests/ui/shots.mjs`:** the component renders an image when one
exists and a visible placeholder when it does not; an admin can replace one and
it changes on every page using it; a non-admin sees no edit affordance;
overlays render; nothing 404s.

---

## PHASE 7 — Every claim gets a shot, and the copy gets rewritten

### 7.1 Inventory the claims

Walk every public page and list every claim the product makes:

`/` · `/pricing` · `/discord-bot` · `/marketplace` · `/quests` ·
`/leaderboards` · `/challenges` · every planet page · `/blog/*` · `/dataroom/*`
· the pitch deck · the partner profile · `/servers` · the brand and server
sign-in pages.

For each claim, name the shot that proves it. Examples of the mapping:

| Claim | Shot key | Captured from |
|---|---|---|
| "Every account is verified against the game's own API" | `gamer.linked.verified` | profile → linked accounts, verified LoL account |
| "Rank rules in the game's own ladder" | `admin.challenge.rules` | challenge builder, "At least Diamond I in Flex 5v5" |
| "Brands get counted reach, not projections" | `brand.reach.perserver` | brand portal → challenge → servers table |
| "Owners take 25% at 5,000 linked" | `server.tier.flagship` | Flagship server portal → Earnings |
| "Your members' winnings, paid to them" | `server.members.winnings` | server portal → the itemised list |
| "Spend points on real trophies" | `gamer.marketplace.shelf` | `/marketplace`, signed in with a balance |
| "Cash out a trophy without giving us your bank" | `gamer.redeem.method` | redeem step 2 |
| "One invoice a month, every line itemised" | `brand.invoice` | brand portal → Billing |
| "The bot answers in cards, not walls of text" | `bot.card.challenges` | `/api/card/challenges` |

**Rule: a claim with no shot is either removed or made true.** If the product
cannot demonstrate it, the website should not say it. That is the whole point
of this phase, and it is worth more than the images.

### 7.2 Rewrite the copy around what is now demonstrable

With the shots in hand, rewrite each page so text and image argue together:
what we do, who for, what it costs, what you get. Positioning stays as it is —
*the media-buying and monetization layer for gaming communities* — but every
section should now be **claim → proof**, not claim → adjective.

All copy is CMS-editable (`lib/cms.ts`) and bilingual (EN/AR). Anything added
needs both, or it renders English inside an Arabic page.

### 7.3 The pitch deck and data room

Same treatment. An investor deck whose product slides are real screenshots of a
working product is a different document from one with bullet points, and this
is the cheapest credibility available.

**Tests → `tests/ui/claims.mjs`:** every registered shot key resolves to an
image; every marketing page renders its shots; **no page contains a claim
listed in the registry as unproven** (keep the claim registry as data so this
is checkable); no broken images anywhere.

---

## PHASE 8 — The full end-to-end test matrix

Every operation, for every user type. Each row is a real assertion in a
committed file, not a manual check.

### 8.1 Visitor — `tests/ui/e2e-visitor.mjs`

Home renders · every marketing page renders · pricing calculator computes ·
game planets load with real data · leaderboards show real gamers · a challenge
page opens · a public profile opens · a public server page opens · blog renders
· sitemap and robots · OG images render for each page type · cookie consent ·
language toggle EN↔AR · mobile at 390px with no horizontal overflow · no
console errors · every nav and footer link resolves (crawl them, do not assume).

### 8.2 Gamer — `tests/ui/e2e-gamer.mjs`

Sign up with email · sign in · sign in with Discord (mocked callback) · link a
game account for each of the six live games · a second gamer cannot link the
same account (the one-account-one-gamer rule) · ownership proof flow · sync
stats · view profile · customize profile · enter a challenge · be refused when
entry rules are unmet, with the reason in the game's own ladder terms · quest
progress and CP earning · the CP ledger · the trophy case · buy from the
marketplace · gift a trophy using search · redeem: every step · collect ·
vote for Profile of the Week · notifications · DMs · follow · feed dashboard ·
sign out.

### 8.3 Server owner — `tests/ui/e2e-server-owner.mjs`

Install callback creates the guild · portal key unlocks the portal · a wrong
key is refused and locks out after repeated misses · Overview · the tier ladder
· the earning guide and journey · Earnings: sponsored share and members'
winnings shown separately, with the not-payable statement · the itemised
per-member list · payout preference saved (**and nothing account-shaped
stored**) · payout history · request a challenge · the request appears in the
admin queue · messages to and from Cluster · the funnel · the command feed ·
the server board · the public view for somebody without the key.

### 8.4 Brand — `tests/ui/e2e-brand.mjs`

Portal key unlocks · Overview · buy challenges (the campaign builder) ·
Campaigns · Creatives: upload, replace, pause · Analytics with real
impressions and clicks · per-challenge detail: entrants, scoring, the servers
it reached · **Billing: invoice list, line items, amount due, pay** ·
the `/pay/<token>` page with no session · Appearance · Messages · sign out.

### 8.5 Staff — `tests/ui/e2e-staff.mjs`

Sign in · see only their department's rail · open a page inside their
department · be 404'd outside it · **never reach `/admin/users` or
`/admin/linked-accounts`, whatever department they are in** (this is a
standing security requirement — no department may read the gamer directory or
the linked-account list) · never reach `/admin/payments`.

### 8.6 Admin — `tests/ui/e2e-admin.mjs`

Every page in `ADMIN_NAV` returns 200 and renders its heading (drive the nav,
do not hardcode the list) · build a challenge · **approve a request → it is a
draft → edit → publish → it announces and the reach is counted** · the card
layout editor · card backgrounds · CMS text editing EN and AR · quests ·
leaderboards · trophies · marketplace · billing: create, edit lines, discount,
attach a link, send, mark paid · payouts: open, release, mark paid · redeems:
approve, release, mark paid · payment providers · Discord: servers, analytics,
broadcast, requests · the audit log records all of it · departments and roles ·
the data room builder · storage.

### 8.7 Discord — `tests/db/e2e-bot.mts`

Signature verification rejects a bad signature · every `/cluster` subcommand
dispatches · autocomplete returns options · every screen renders its card ·
every button parses back to a screen · Back returns without a new message ·
the link modal · joining a challenge · the redeem flow end to end · the
marketplace buy flow · gifting by Discord username · announcement audiences
per the phase 1 policy · nothing is announced for a draft.

### 8.8 Cross-cutting — `tests/db/e2e-integrity.mts`

Money reconciles across every surface (a payout's lines equal its total; a
brand's invoice equals its lines; a server's earnings equal its ledger; CP
balance equals earned minus spent) · no orphan rows · every foreign key
resolves · no page stores a payment detail (the structural
`information_schema` assertion already in `money.mts` — extend it to every
table) · every migration is idempotent (boot twice, compare).

---

## PHASE 9 — The final report

`docs/VERIFICATION_REPORT.md`, committed:

- Every operation tested, per user type, with pass/fail and the file that
  asserts it.
- Every bug found, what caused it, what fixed it, and the assertion that now
  prevents it.
- Every screenshot captured, its key, and where it appears on the site.
- Every claim on the website, and the shot that proves it.
- **What is still not covered, and why.** The most useful section in the
  document, and the one there is most temptation to leave out. Anything that
  needs live Discord credentials, a real payment provider, or a real game API
  key belongs here, stated plainly.

---

## Judgement calls, decided in advance

These are the questions that will come up mid-execution. Deciding them now
stops them being decided badly at 2am.

1. **A test that cannot pass without a live third party is not written as a
   pass.** It is written as a skip with a printed reason. A green suite that is
   green because it checked nothing is worse than a red one.
2. **Screenshots are captured from the seeded demo, never from production.**
   No real person appears in marketing.
3. **If a claim cannot be demonstrated, delete the claim.** Do not stage a
   screenshot of a feature that does not work. This is the single rule in this
   document that most needs holding to.
4. **CP prose survives, CP-as-a-unit does not.** "Cluster Points" explains the
   currency; "4,120 CP" becomes "🪙 4,120".
5. **Do not rewrite the payments layer.** `docs/PAYMENTS.md` documents a
   deliberate design where no payment detail is ever stored. Test it, screenshot
   it, do not "improve" it.
6. **Do not touch the social features** (posts, comments, reactions, the feed
   rail). They are out of scope and have been for several phases.
7. **Commit per phase, minimum.** A single commit at the end of nine phases is
   unreviewable and unrevertable.

---

## Definition of done

- `npx tsc --noEmit` and `npm run build` clean.
- `npm run test` runs every suite green from a cold build.
- Every phase committed and pushed separately.
- `docs/VERIFICATION_REPORT.md` written and honest.
- Every marketing claim on the site has a shot behind it, or is gone.
- An admin can change any shot from `/admin/shots` and see it change
  everywhere.
