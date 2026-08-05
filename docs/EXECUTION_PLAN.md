# ClusterGG — the build plan, and the verification that closes it

**Status:** Part I is **open** and being added to. Part II has **not started**
and must not start until Part I closes. Written to be executed from a cold
start by whoever picks it up, with no reliance on the conversation that
produced it.

This document has two halves and they run in one direction:

| | | |
|---|---|---|
| **Part I — The build** | Every edit, feature, page and fix. | **Open.** Grows every time a new instruction arrives. |
| **Part II — The verification** | Every committed test, every screenshot, every claim proven, the report. | **Sealed** until Part I closes. Grows *with* Part I, executes *after* it. |

Part II is not a phase that got postponed. It is a list that is being written
continuously, in Part I's own sections and in the three registries at the top
of Part II, and then executed once, against the finished thing.

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
8. **A process sweep that greps its own command line kills nothing.**
   `pgrep -f next-server`, or `case "$c" in *next-server*)` over
   `/proc/*/cmdline`, MATCHES THE SHELL DOING THE SEARCHING. It reports a hit,
   feels like it worked, and leaves the real server running — which is how five
   stuck production servers accumulated in one session, each holding its port
   against the next run. Anchor on the start of the cmdline and skip your own
   pid:
   ```js
   if (pid === String(process.pid)) continue;
   if (/^(next-server|next start|sh -c next start)/.test(cmd)) kill(pid);
   ```
   Better still, do not hand-start one: `npm test -- --ui` and
   `scripts/with-server.sh PORT CMD` both stand a server up and take it down on
   exit, SIGINT, SIGTERM and a crash. `next start` never exits on its own, so
   anything that starts one owes a `trap`.

### Workflow, non-negotiable

For every unit of work: **typecheck → build → verify empirically against a
real browser or a real database → commit → push.** Never commit on
"it should work". Every bug found by a test gets a comment at the fix site
explaining what broke, so the next person does not reintroduce it.

Branch: `claude/clustergg-platform-build-mfkzaa`. Push with
`git push -u origin claude/clustergg-platform-build-mfkzaa`.

This still applies during Part I, where no committed suite exists yet. See
§1.3 for exactly what is deferred and what is not.

---

## 1. How this plan works

### 1.1 Build everything, then prove everything

**Part II does not begin until Part I is closed.** Part I stays open for as
long as new instructions keep arriving, and new instructions are expected —
this plan is written on the assumption that it is not finished.

The ordering is arithmetic, not preference. A suite written against B3 has to
be re-read, re-run and usually rewritten the moment B9 touches the same screen.
A screenshot taken before the copy rewrite is a picture of copy that no longer
exists. Verifying in the middle means verifying the same surface three or four
times and publishing whichever version happened to be photographed last.
Verifying at the end means verifying once, against what actually shipped.

### The one exception: money-touching items are tested when they are built

**B33, B34, B35, B36, B37 and B39 get their suites written alongside them, not
in Part II.** They are marked in R1.

The reasoning, because this is a deliberate hole in an otherwise firm rule: a UI
bug found late costs rework. A bug in what we pay out costs cash that has already
left. The CP model decides money; the caps decide money; the prepay policy
decides who we extend credit to; eligibility decides whether a payout is legal;
the stuck-money states decide whether a prize is ever paid twice. Six suites out
of forty-plus does not reopen the ordering argument, and it is the difference
between a wrong number caught in an afternoon and one caught after a month of
paying out.

Everything else — every screen, every card, every page — still waits.

The cost of this ordering, stated honestly so nobody is surprised by it: bugs
that a suite would have caught in week one are found in the verification pass
instead. That is the trade being made deliberately. It is paid down by B1.4-
style sweeps during the build and by never committing on "it should work"
(§1.3).

### 1.2 The intake protocol — what to do when a new instruction arrives

Every new instruction goes through these four steps **before any code is
written**, and there is no exception for small ones. Small changes are exactly
the ones that get built and then never proved.

1. **Append it to Part I** as the next `B<n>`, with its own section: what
   changes, which files, which rules it must not break. Never insert it into an
   earlier B — the numbers are a build order and rewriting history makes the
   ledger useless.
2. **Add its row to the test registry** (Part II). Name the suite file and
   write the assertions in one line each, while the reasoning is fresh. If it
   fits an existing suite, add the row against that suite rather than making a
   new file.
3. **Add its rows to the shot registry** (Part II) if a human can see it. One
   row per *component* worth proving, with the claim it backs. A build item
   nobody can see — a migration, a policy module — is exempt, and that is the
   only exemption.
4. **Add any new route to the surface registry** (Part II) so the E2E matrix
   and the capture pass both pick it up automatically.

Then build it. Steps 2–4 execute nothing today; they are entries in a list that
Part II works through later. This is what keeps testing dynamic: the work list
is written by the same hand, at the same moment, as the work.

**The phrase to look for:** every build item ends in a
**`Verification owed → <file>`** block. That block is the item's contract with
Part II. An item without one is not finished being planned.

### 1.3 What "verify" means before Part II exists

Deferring the suites does not defer looking at your own work. For every unit of
work in Part I, unchanged from the standing workflow:

**typecheck → build → open it in a real browser or drive it against a real
database → commit → push.**

What Part II defers is the **committed suite** and the **captured screenshot** —
the artefacts that go stale when the next instruction lands. It does not defer
your eyes. Never commit on "it should work"; the difference between that and a
test is a week of somebody else's time.

Where a build item fixes a bug, the comment at the fix site explaining what
broke is written *now*, in Part I, not later. Comments do not go stale the way
suites do.

### 1.4 When Part I closes

Part I closes when the instructions stop — that is a call the owner of this
plan makes explicitly, by writing the date in the build ledger. Nothing else
changes at that moment except that Part II starts, and Part II starts with its
work list already complete, because the list was written as the work arrived.

If an instruction arrives *after* Part I closes and Part II is under way: it
reopens Part I as the next `B<n>`, goes through the same four steps, and Part II
restarts from the registry rows it touches. That is cheaper than it sounds,
because the registries say exactly which rows those are.

### 1.5 Universal rule — commit and push every small chunk

**Every chunk of work that stands on its own gets its own commit and its own
push, the moment it works.** Not at the end of the item, not at the end of the
day. A build item is usually three to eight commits, not one.

A chunk is "standing on its own" when it typechecks, builds, and leaves the app
in a state you would be willing to hand over. That is the only bar.

Why this is a rule rather than a preference, in this project specifically:

- The session that does the work is **ephemeral**. The container is reclaimed;
  anything not pushed is gone. Unpushed work is not slow progress, it is *no*
  progress.
- A twelve-file commit that broke something is a bisect. A one-concern commit
  that broke something is a revert.
- The push is the only durable record that a decision was made. The plan says
  what we intend; the commit says what we did.

Write the *reason* in the commit message, not the diff — the diff is already in
the commit. The next person needs to know why, and they will read the log before
they read the code.

### 1.6 Universal rule — the order is reorderable

The ledger's numbering is a **build order, not a priority order**. B9 is not
more important than B20; it arrived first.

**Before starting a work session, re-read the ledger and pick what to build
next.** Priorities can be reordered at any time, and near the end they should
be — by then it is clear which items are load-bearing and which were nice ideas.
Reordering is a first-class action, not a deviation:

- **Never renumber.** B14 stays B14 wherever it sits in the queue. Renumbering
  breaks every registry reference and every commit message that named it.
- Reorder by editing the ledger's `Built` column and, if it helps, adding a
  `Priority` column. The section stays where it is in the document.
- If an item is dropped, say so in the ledger with one line on why, and delete
  its registry rows. A dropped item that leaves orphan rows in R1 means Part II
  hunts for a suite that has nothing to test.
- **Dependencies are the only hard constraint on order**, and there are few:
  B16 must precede B17 (caps need the model that sets them), B7 must precede
  B23's slot placement, B13/B14 share card infrastructure. Everything else can
  move.

---

# PART I — THE BUILD

**Open.** Append, never insert. Nothing here is verified by a committed suite
or a screenshot until Part II; everything here is typechecked, built and looked
at before it is committed (§1.3).

## The build ledger

Every build item, in build order. **This table is the index of the whole
plan** — a new instruction gets a row here first, then its rows in the three
registries in Part II, then it gets built.

Read the scope correctly: the ledger lists what is **outstanding**, not what
exists. Most of the platform — 106 routes, six game integrations, the three
portals, the bot, the payments layer — is already built and shipped. Part II
covers **all of it**, shipped and outstanding alike: R1 carries the twelve
suites written against work already done, R3 is generated from every route in
the app, and the V3 matrix walks every operation for every user type. Part I is
the remaining edits; Part II is the whole platform.

| # | Build item | Touches | Added | Built |
|---|---|---|---|---|
| B1 | The spam audit — announcement audiences, cooldowns, kill switches | `lib/discord/announce.ts`, `lib/link-account.ts`, new `lib/discord/audience.ts`, `/admin/discord` | plan v1 | ☐ |
| B2 | The CP coin — a currency, not a word | `components/Icon.tsx`, new `components/Cp.tsx`, 11 files, `lib/cards/render.tsx`, the nav | plan v1 | ☑ |
| B3 | Bot cards — install, list cards, flows, landing layout | `lib/discord/onboard.ts`, `screens.ts`, `components.ts`, `app/api/discord/interactions/route.ts`, the card layers | plan v1 | ☐ |
| B4 | The server portal, inside Discord | new `discord_guild_roles`, `/cluster admin`, six `srv_*` card kinds, `lib/server-portal.ts` (read only) | plan v1 | ☐ |
| B5 | Gifting — search as you type, web and Discord | `components/TrophyMarket.tsx`, new `/api/gamers/search`, the bot gift flow | plan v1 | ☐ **folded into B49** |
| B6 | Redeem and marketplace, step by step, on the web | new `/redeem`, `/marketplace` confirm step | plan v1 | ☐ **folded into B49** |
| B7 | The screenshot system — plumbing **and** an admin who can replace any image | new `feature_shots`, `lib/shots.ts`, `<FeatureShot>`, `/admin/shots` | plan v1 | ☑ |
| B8 | The claim registry and the copy rewrite | `lib/claims.ts` (new), every marketing page, `lib/cms.ts` EN+AR, deck, data room | plan v1 | ☐ |
| B9 | Nav: the marketplace badge beside the planets badge | `components/Nav.tsx`, `lib/site-chrome.ts`, `components/BrandingEditor.tsx` | batch 2 | ☑ |
| B10 | One background image behind a component group, not three copies | `components/Nav.tsx`, `components/WeekBand.tsx` | batch 2 | ☑ |
| B11 | Nav game badges open the planet in place, not by navigating | `components/Nav.tsx`, the homepage hero world component (reused) | batch 2 | ☐ |
| B12 | Planet hero: live only; completed challenges + standings on the page | `lib/planet-explore.ts`, `app/planets/[slug]/page.tsx` | batch 2 | ☑ |
| B13 | The bot guides, rebuilt — fewer than nine, redesigned | `lib/cards/*`, `lib/discord/onboard.ts`, `/cluster guide` | batch 2 | ☐ |
| B14 | The Home card: a Cluster home page, in Discord | new `home` card kind, `lib/discord/screens.ts` | batch 2 | ☐ |
| B15 | The new CP actions wired into the quests that exist | `lib/quests.ts` `ACTION_CATALOG`, the redeem/gift/install paths | batch 2 | ☑ |
| B16 | **The CP economics model and the admin calculator** | new `lib/cp-economics.ts`, new `/admin/cp-calculator`, `platform_settings` | batch 2 | ☑ |
| B17 | Daily caps on every action — silent enforcement, full disclosure | `lib/quests.ts` `awardQuestAction`, quest cards, the CP history | batch 2 | ☑ |
| B18 | The wallet — CP, dollar value, trophy case, one ledger | new `lib/wallet.ts`, new `/wallet`, `components/FeatureShot.tsx` | batch 2 | ☑ |
| B19 | Marketplace, revamped | `/marketplace`, the quests-page section | batch 2 | ☐ **folded into B49** |
| B20 | The wallet card, in Discord | the bot wallet card, the redeem stepper | batch 2 | ☐ |
| B21 | The economy, explained in visuals, everywhere | bot guides, quests, wallet, homepage, deck | batch 2 | ☐ |
| B22 | Track the bot install, and pay for it | `app/api/discord/installed/route.ts`, the signal quest | batch 2 | ☐ |
| B23 | Page consolidation, the footer, and the copy rewrite | `/servers`+`/discord-bot`→one, new `/for-brands`, `/brands`→`/contact`, `/pricing`, `/`, `/blog`, the footer | batch 2 | ☐ |
| B24 | Park localization (keep the machinery, drop the switch) | `components/Footer.tsx` | batch 2 | ☑ |
| B25 | The gamer's Discord card: trophy case ×3, one button per account | `lib/cards/data.ts`, `lib/cards/render.tsx`, `lib/discord/screens.ts` | batch 3 | ☑ |
| B26 | LoL stats read as ranks; the level stops appearing twice | new `lib/metric-display.ts`, `app/feed`, `components/LolCard.tsx`, `components/ProfileAccounts.tsx` | batch 3 | ☑ |
| B27 | Every bot card: buttons grouped by meaning and position | `lib/discord/components.ts` `rows()`, `lib/discord/sponsor.ts` | batch 3 | ☑ (position; colour is B3.0.2) |
| B28 | The bot preview rebuilt — scoped per section, live renders instead of shots | the preview component, the marketing pages | batch 3 | ☐ |
| B29 | Everything new is an admin system, staffable by department | `lib/systems.ts`, every new surface | batch 3 | ☐ |
| B30 | The founding offers: admin console, paused by default, bill discounts | `lib/offers.ts`, `lib/invoices.ts`, new `/admin/offers` | batch 3 | ☐ |
| B31 | Welcome challenges: auto-drafted, sponsored by Cluster, billed to Cluster | the install path, the server portal, the house brand, billing | batch 3 | ☐ |
| B32 | Email: Resend, one template system, a delivery console | new `lib/email/`, `email_log`, new `/admin/email`, the webhook | batch 4 | ☑ |
| B33 | **Announcements become a queue** (live bug — sequential await in a server action) | `lib/discord/announce.ts`, the calling actions, a drain cron | batch 4 | ☐ |
| B34 | **The repriced economy**: 1,000 CP = $0.10, every action capped, 500/day ceiling | `lib/quests.ts`, `lib/marketplace.ts`, supersedes B16/B17's numbers | batch 4 | ☑ |
| B35 | Anti-abuse: payout holding period, qualified linked accounts, velocity limits | new `lib/abuse.ts`, payouts, tier unlocks, new `/admin/growth-review` | batch 4 | ☑ (defences 1–2 + the review queue; **velocity limits still owed** — see below) |
| B36 | Brands prepay: due on issue, live on creation, settled by the first challenge's end | new `lib/prepay.ts`, `lib/sponsored-campaigns.ts`, `lib/challenge-requests.ts`, the brand portal | batch 4 | ☑ |
| B37 | The legal framing of the economy | new `lib/eligibility.ts`, new `/legal/economy`, `app/actions/trophies.ts`, `/admin/redeems` | batch 4 | ☑ (**every threshold is a placeholder for counsel** — flagged in the code and on the page) |
| B38 | One gamer, one account, one challenge | `lib/challenges.ts`, `app/actions/social.ts`, the challenge page | batch 4 | ☑ |
| B39 | Stuck money: every state where a prize has nowhere to go | new `lib/stuck-money.ts`, new `/admin/stuck`, `lib/challenges.ts`, `app/actions/trophies.ts` | batch 4 | ☑ |
| B40 | Deleting an account with a balance | `app/settings/account` | batch 4 | ☑ |
| B41 | The gamer homepage: hero, challenges, quests, missions, Discord | `app/page.tsx` | batch 4 | ☐ |
| B42 | Missions: the guided first week, on homepage, quests page and feed | `lib/quest-game.ts` `StarterMissions` | batch 4 | ☐ |
| B43 | Welcome challenges under admin control (amends B31) | admin challenges, the welcome type | batch 4 | ☐ |
| B44 | The promotional campaigns console (amends B30) + funding figure is $100K | `/admin/offers`, `lib/invoices.ts`, the deck | batch 4 | ☐ |
| B45 | The portal key follows ownership | the guild refresh path, key rotation | batch 4 | ☐ |
| B46 | Spend limits on storage and rendering | `lib/storage-audit.ts`, the card cache, `/admin/storage` | batch 4 | ☐ |
| S1 | **The demo activity layer** — 36 of 74 tables had no rows, so every screen that reports on activity reported zero | new `lib/db/seed-activity.ts`, `lib/db/seed.ts` | wave 1 | ☑ |
| S2 | **The capture script** — one command turns a running build into every screenshot in R2 | new `scripts/capture-shots.mjs`, `public/shots/` | wave 1 | ☑ (provisional — V1.R recaptures) |
| S3 | Demo fixtures the rules could not be tested without: rank-carrying stats, priced trophies, a shelf big enough to cap, deterministic portal keys, nav art | `lib/db/seed.ts`, `lib/db/seed-activity.ts` | wave 1 | ☑ |
| S4 | **A JSX expression rendering as literal text** on every unaffordable trophy tile — a backtick where a fragment belonged, so the marketplace read `$<Cp amount={t.cpPrice - balance} /> to go` | `components/TrophyMarket.tsx` | wave 2 (found by B34) | ☑ |
| S10 | **Every `<FeatureShot>` slot placed since B47 rendered a BROKEN IMAGE, not a placeholder** — `seedFeatureShots` wrote `/shots/<key>.jpg` for every registry key whether the file existed or not, so eight registered-but-uncaptured slots showed a full-height box of alt text. Precisely the set the "place them and leave them EMPTY" rule creates | `lib/shots.ts`, `lib/db/seed-activity.ts`, `components/FeatureShot.tsx` | wave 2 (found by B18) | ☑ |
| S9 | **Deleting a trophy silently deleted every holder's copy of it** — `user_trophies.trophyId` is `onDelete: "cascade"` (`schema.ts:669`) while `marketplace_orders.trophyId` is `onDelete: "restrict"` (`:649`), so a trophy that was ever BOUGHT was refused by the database and one that was only ever WON cascaded away. The gap was "won, never bought" — most trophies | `app/actions/admin.ts`, `lib/trophy-admin.ts` | wave 2 (found by B53) | ☑ |
| S8 | **Demo campaign invoices** — the overdue banner, the dunning schedule and the publish block were all built, correct, and invisible, because the demo's campaigns predated invoicing and nothing owed anything | `lib/db/seed-activity.ts` | wave 2 (B36 fallout) | ☑ |
| S7 | **A quest card contained no link on its default tab** — `role="link"` with a `router.push`, so it worked for a mouse and Enter and nothing else; the only `<Link>` lived on the non-default leaderboard tab | `components/QuestCard.tsx` | wave 2 (found by B48) | ☑ |
| S6 | **A demo server at tier scale** — 522 linked, 180 qualified — because the tier ladder, the qualified split, the holding period and the review queue were all correct and all invisible at two members a server | `lib/db/seed-activity.ts` | wave 2 (B35 fallout) | ☑ |
| S5 | **Demo balances rescaled for B34's prices**, as balances net of what the seeded orders spend — Nova can afford exactly one trophy, Atlas none | `lib/db/seed-activity.ts` | wave 2 (B34 fallout) | ☑ |
| B47 | **The server profile becomes mandatory, and gates the 5%** + admin can email anyone manually | `discord_guilds.contact_email`, `lib/discord/community.ts`, `lib/server-earnings.ts`, `lib/billing.ts`, the portal, `/admin/email` | batch 5 | ☑ |
| B48 | **The marketplace says how you get the points** — quest cards on the shelf, a clickable balance, the redemption value promoted | `/marketplace`, `components/TrophyMarket.tsx`, `components/QuestCard.tsx` | wave 2 (after B35) | ☑ |
| B49 | **The marketplace purchase and gift experience** — checkout modal, gift search, confirm-the-person, gift-sent receipt. **Absorbs B5, B6, B19** | `components/TrophyMarket.tsx`, new `/api/gamers/search`, `app/actions/marketplace.ts` | wave 2 band | ☐ |
| B50 | **The quest page as a how-to-play guide** — every action, its CP and its cap, as the pitch | `components/QuestGame.tsx`, `lib/quests.ts` (read `rules`, do not restate) | wave 2 | ☐ |
| B51 | **The Profile of the Week band** — nav art behind it, top 3 only, a trophy per place, smaller cards, click-out collapses, profiles open in a new tab | `components/WeekBand.tsx`, `lib/profile-week.ts`, `/admin/profile-week` | wave 2 | ☐ |
| B52 | **Planet explore shows game identities** — in-game name, one row per account | `lib/planet-explore.ts`, `app/planets/[slug]/page.tsx` | wave 2 | ☐ |
| B53 | **Admin owns every trophy, including the ones already held** | new `lib/trophy-admin.ts`, `/admin/trophies`, `app/actions/admin.ts`, `lib/db/schema.ts` | wave 2 (**money-touching**) | ☑ |
| B54 | **The bot card design overhaul** — a card is a web page, not a poster. **Leads the Discord band: B3, B13, B14, B20, B27, B28 follow it** | `lib/cards/render.tsx`, `lib/cards/part-content.ts`, `lib/cards/data.ts` | wave 3 | ☐ |
| B55 | **The platform is slow** — a live, structural performance defect on every surface | `app/admin/layout.tsx`, `lib/threads.ts`, `lib/cms.ts`, `lib/departments.ts`, `lib/planet-explore.ts`, `lib/providers/riot-lol-rich.ts` | **wave 2, ahead of everything** | ☐ |
| B47+ | **Open.** Every instruction from here lands as its own row. | — | — | — |

**S rows** are work that shipped without being planned — support the build
needed rather than an instruction that arrived. They are lettered, not numbered,
so they can never be confused with an instruction from the owner, and they are
in the ledger because a ledger that only lists what was asked for stops being an
index of what happened.

**Part I closed on: _______** (fill this in; until then Part II does not start.)

**Reordering:** the numbers are arrival order, not priority — see §1.6. Reorder
freely, never renumber.

### The suggested order — small first, heavy after

Ship the quick wins before the hard items. Not because they matter more, but
because each one is a commit that stands on its own, they are the fastest way to
make the product visibly better, and they leave a working app behind at every
point. The heavy items take days and are more pleasant to start once the small
irritations are gone.

| Wave | Items | Why here |
|---|---|---|
| **0 — the live bugs, before anything else** | **B33** the announcement queue · **B1** the spam audit | **B33 is a verified live bug that corrupts data rather than erroring** — the fan-out is a sequential await inside a server action with no `maxDuration`, so past ~50 servers it is killed mid-loop and records a plausible, wrong reach. B1 announces every account link to *every* server on the network. Neither is a UI nicety. If no real servers carry the bot yet, both can wait for wave 2 — but they get worse with exactly the growth being built for. |
| **1 — quick wins and UI** | **B9** nav badge · **B26** LoL ranks + the duplicated level · **B25** bot profile card · **B10** one background image · **B12** live-only planet hero · **B24** park localization (delete the language switch) · **B7** the shot plumbing · **B2** the CP coin · **B27** bot card buttons | Small, independent, each shippable in its own commit. **B7 belongs here, early**, so `<FeatureShot>` slots can be dropped into every page as it is touched — visibly empty, filled by V1 much later. Placing a slot costs a line; retrofitting them all at the end costs a day. **But do not carpet the pages B23 will rewrite** — on `/`, `/pricing`, `/servers`, `/discord-bot`, `/brands` and `/blog`, place slots only where you are confident the section survives consolidation. Everywhere else, place freely. |
| **1.5 — email, because everything else notifies through it** | **B32** | Small, self-contained, and every money item in wave 2 wants to send something. Doing it before them means the notifications go in as those features are built rather than being retrofitted. |
| **2 — the economy and the money** | **B34** the repriced economy · **B16** the model + calculator · **B17** caps · **B35** anti-abuse · **B36** brands prepay · **B37** legal framing · **B38** entry rules · **B39** stuck money · **B40** deletion with a balance · **B15** new CP actions · **B22** install attribution · **B18** the wallet · **B6** redeem/marketplace steppers · **B19** marketplace · **B20** the bot wallet card · **B5** gifting · **B44** the promo console · **B30** offers · **B31**/**B43** welcome challenges | **B34 first — it decides the numbers everything else spends.** Then B16/B17 build the machinery around them. These six carry their suites with them (§1.1's exception): B33, B34, B35, B36, B37, B39. |
| **3 — surfaces and story** | **B41** the gamer homepage · **B42** missions · **B11** nav planet dropdown · **B13** the guides · **B14** the Home card · **B3** bot list cards and flows · **B4** the server portal in Discord · **B21** the visual explainer · **B28** the bot preview · **B23** page consolidation and copy · **B8** the claim registry · **B45** key rotation · **B46** spend limits | The expensive, high-surface work. **B23 and B8 last** — they consume everything the earlier waves produce, and doing them before the product settles means writing the copy twice. |
| **continuous** | **B29** | Not a wave. Every item in every wave registers its surface as an admin system before it is called done. |

---

## B1 — The spam audit

### B1.1 The reported bug

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

### B1.2 Write down the policy, then enforce it

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

### B1.3 Rate limits, because policy alone is not enough

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

### B1.4 Sweep for the same class of bug

`grep -rn "void announce\|void report\|\.catch(() => {})" lib app` and check
every hit. Anything fired from a server action or route handler that writes to
the database must be awaited.

**Verification owed → `tests/db/spam.mts`:**
- A personal event resolves to only the servers that gamer is in.
- A gamer in zero servers produces zero targets, not a network broadcast.
- The cooldown collapses five links in an hour to one post.
- A disabled kind produces zero targets.
- A per-server opt-out is honoured while other servers still receive it.
- No announcement helper is called without `await` (a source-level assertion —
  read the files and regex them; ugly, but this bug class has now appeared
  twice and a comment did not prevent the second one).

---

## B2 — The CP coin: a currency, not a word

### B2.1 The mark

Design a Cluster Points coin as **inline SVG** and add it to
`components/Icon.tsx` as `cpCoin`. Requirements: legible at 12px, works on
dark and light, no text inside it, and a flat PNG variant at 64px and 128px
in `public/` for the Satori card renderer (Satori's SVG support is limited —
do not fight it, embed a PNG).

### B2.2 One component, used everywhere

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

### B2.3 The sweep

```bash
grep -rn "CP\b" --include=*.tsx --include=*.ts app components lib | grep -v node_modules
```

Every hit is one of: a number that needs `<Cp>`, prose that stays, or a
variable name that stays. Expect ~40 sites. Known ones:
`TrophyMarket.tsx`, `TrophyCase.tsx`, `app/marketplace/page.tsx`,
`app/admin/marketplace/page.tsx`, the quest pages, the CP ledger, the nav.

### B2.4 The nav

Put the balance in the nav as `🪙 4,120` — a persistent wallet, the way a game
shows currency. Clicking it opens the CP ledger. This is what makes CP feel
like money rather than a score.

### B2.5 The Discord cards

`lib/cards/render.tsx` — every place a card prints a CP figure gets the coin
PNG at the right optical size. Affected kinds: `market`, `cp`, `profile`,
`quest`, and any card with a balance on it.

**Verification owed → `tests/ui/cp-currency.mjs`:** no rendered page contains the standalone
token "CP" immediately after a number; the coin is present wherever a CP figure
is; the nav shows the balance; `/api/card/market` and `/api/card/cp` render
with the coin (fetch the PNG, assert 200 and a plausible byte size).

---

## B3 — Bot cards: lists, flows, and a landing page

This is the largest build item and the biggest functional gap.

### B3.0 Install: stop the guide dump

`lib/discord/onboard.ts` → `postGuides(channel.id)` posts **~9 guide cards**
into `#clustergg` and pins them. That is a wall of PNGs in a channel nobody has
opened yet, and it is the first impression the product makes.

**Post exactly three cards, pin those three, delete the rest of the flow:**

1. **Welcome to Cluster** — the landing-page grid from 3.3 below.
2. **The four quests** — a 2×2 box grid, each quest with its own **map art**,
   and inside each box, in large type, **how you earn CP on it**. The coin, not
   the word (B2), left of every number.
3. **The game planets** — the six live games, what each one tracks, one box
   each.

All three carry the same three buttons: **START HERE** · **Add to your
server** · **Link a game account**.

**Any button on any of the three creates the account if it doesn't exist**, and
lands the person straight on something useful — their profile, the link modal,
or a challenge to join. Nobody should have to sign up on the website first;
the click is the signup.

The old guide cards are not deleted from the codebase — they stay reachable
from `/cluster guide`, so somebody who wants the how-to can ask for it. What
changes is that we stop pushing nine of them at a server that has said nothing
yet.

### B3.0.1 The ephemeral rule — the one that is currently broken

**A button on a public message must never edit that message.**

Today `START HERE` responds with `UPDATE_MESSAGE`, which edits the message the
button sits on. On a **pinned public welcome card** that means the first
person to press it rewrites the pin for the entire server, and the next person
arrives at somebody else's profile.

The rule, implemented once in `app/api/discord/interactions/route.ts` and
never decided per-screen again:

```
if the message the button is on is PUBLIC (its flags do not include EPHEMERAL):
    respond with CHANNEL_MESSAGE_WITH_SOURCE (type 4) + flags: 64
    → a new, private message, visible only to the clicker.
      The public message is untouched.

if the message is ALREADY EPHEMERAL (this person's own private thread):
    respond with UPDATE_MESSAGE (type 7)
    → edits in place, which is what makes Back and navigation feel right
      without filling their DMs with cards.
```

So: **public → open a private copy. Private → navigate in place.** Every
screen inherits this; no screen implements it.

### B3.0.2 Button colours, unified by meaning

Discord gives five styles. Assign them by *what the button does*, once, in
`lib/discord/components.ts`, so it cannot drift card to card:

| Style | Used for |
|---|---|
| **Secondary** (grey) | The card's own options and choices — pick a game, pick a challenge, pick a trophy |
| **Success** (green) | **Add to your server**, and every sponsored / ad button |
| **Primary** (blurple) | **Home** and **Back** — navigation, distinct from choices |
| **Danger** (red) | Anything destructive — cancel a redeem, end a challenge |
| **Link** | Anything that leaves Discord — the portal, the website, a payout page |

A lint-style test asserts no screen uses a style outside its category.

### B3.1 List cards — the reported gap

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

### B3.2 Every card gets the buttons that belong to it

Audit every screen in `lib/discord/screens.ts`. Each card should offer: the
obvious next action, **Back**, and a link out to the web equivalent. Current
gaps to check: the trophy case, the CP screen, the quest screens, the profile
card, the server screen.

Limits: 5 buttons a row, 5 rows, 25 total. The `custom_id` grammar is
`actionId(action, args, trail)` / `parseId` — a Discord custom_id is capped at
100 characters, so the back-trail must be pruned, not appended to forever.

### B3.3 The welcome card as a landing page

Today it is a numbered list of instructions. It should be a **grid of boxes**,
each a thing you can do — Link a game · Enter a challenge · See your stats ·
Spend your points · Customize your profile · How your server earns — with an
icon, one line each, and a button per box.

This is the first thing anybody sees from the product. It should look like a
home page, not a README.

### B3.4 Trophy redeem, in the bot

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

### B3.5 Marketplace buy, step by step

The `market` card exists and shows six trophies with prices. Buying is one
click with no confirmation. Add: **confirm** (what you are buying, what it
costs, what your balance will be) → **bought** (the trophy, the new balance,
and that it redeems exactly like a won one).

Guard the same rules the web path guards, in the same server-side function —
`buyTrophy` in `lib/marketplace.ts` already re-reads the balance at purchase
time; do not duplicate the logic, call it.

**Verification owed → `tests/ui/bot-cards.mjs`:** every card kind renders 200 with a
plausible size from `/api/card/<kind>`; the list cards show more than one item;
the welcome card is a grid; each screen's button set is non-empty and within
Discord's limits. Plus `tests/db/bot-flows.mts` for the redeem and buy state
machines, driven through the interaction handler with synthetic payloads.

---

## B4 — The server portal, inside Discord

A server owner should be able to run their community from Discord without
opening a browser — except for the one thing that moves money.

### B4.0 What Discord actually gives us (verified, not assumed)

Answering this before designing, because the design depends on it:

| Question | Answer |
|---|---|
| Can the bot read a server's roles? | **Yes.** `GET /guilds/{id}/roles` with the bot token returns every role with `id`, `name`, `color`, `position`, `managed`, and a **`permissions` bitfield string**. **No privileged intent required.** |
| Can it read each role's permissions? | **Yes** — that `permissions` bitfield, decodable to the named flags (`"8"` = Administrator). |
| Can it store them on our side? | Yes. Nothing stops it; see the table below. |
| How do we know a *clicker's* roles? | **The interaction payload already carries them.** Every guild interaction includes `member.roles` (role ids) and `member.permissions` (computed bitfield). **Zero extra API calls, zero intents.** The roles API is only needed to show the owner a list to choose from. |
| Can it list every member? | **No, not without the GUILD_MEMBERS privileged intent**, which we deliberately do not enable (it forces Discord verification at 75+ servers). We never need it for any of this. |
| Who is the "server owner"? | `GET /guilds/{id}` → `owner_id`. **Discord has no concept of "original creator"** — a transfer overwrites `owner_id` and the old value is gone. Operationally, owner = current `owner_id`. |
| Can the bot DM the key to a moderator instead? | **Technically yes** — a DM is `POST /users/@me/channels` with any user id sharing a guild with the bot. Nothing in Discord prevents the wrong recipient. **Today the code does the right thing** (`onboardGuild` is passed `guild.owner_id`, not the installer) — but that is a habit, not a guarantee, so it becomes a tested rule below. |
| What if DMs are closed? | `dmUser` gets a **403**. Must be handled: post in `#clustergg` telling the owner to open DMs and run a command, and surface "key undelivered" in mission control so staff can resend. |

### B4.1 Store the roles

```
discord_guild_roles
  guildId, roleId          (composite PK)
  name, color, position
  permissions              text   -- the raw bitfield, decoded on read
  managed                  bool   -- bot/integration roles, never selectable
  isClusterAdmin           bool   -- the owner designated this one
  syncedAt                 timestamptz
```

`refreshGuildRoles(guildId)` calls the roles endpoint and upserts. Called at
install, when the owner opens the admin settings card, and from mission
control on demand. Roles that vanished from Discord are marked gone, not
deleted — an audit trail of "this role used to be a Cluster admin" is worth
keeping.

Surface it in mission control (`/admin/discord/<guildId>`): every role, its
permissions, which ones are Cluster admins, when it was last synced.

### B4.2 Designating Cluster admins

At install, the owner's DM asks them to pick which of their roles may use
`/cluster admin`. Also reachable any time from the admin settings card.

Designation *adds* people; it never takes anyone away. **Two grants are
permanent and cannot be designated away: the guild owner, and anyone holding
Discord's Administrator permission.** A fresh server must never be locked out of
its own admin commands, and a server that has designated roles must not be able
to lock out its own administrators either — including by accident, which is the
likelier case. `member.permissions` on the interaction tells us this for free.

The rule stated plainly, because it is easy to get backwards: **Administrator
always wins.** Before designation, after designation, whatever roles exist. If
Discord trusts you with the whole server, Cluster is not the thing that argues.
Designated roles exist so an owner can hand `/cluster admin` to a community
manager who is *not* an administrator — that is the entire job of the feature.

### B4.3 Gating `/cluster admin`

Every admin subcommand and every button on an admin card checks, in one shared
guard:

```
allowed =  member.user.id === guild.owner_id          -- always
        || member.permissions has ADMINISTRATOR       -- always
        || member.roles ∩ designatedClusterAdminRoles ≠ ∅
```

Three independent grants, OR'd. None of them is conditional on the others, and
in particular **no branch of this guard may ever read "…and no roles are
designated."** The first two lines are unconditional by construction; a future
change that makes them conditional is a regression, and the tests below exist to
catch exactly that.

Refusal is a polite ephemeral card, not silence: *"Only this server's Cluster
admins can open this. Ask an admin to add your role in /cluster admin →
Settings."*

**All server-owner surfaces move to `/cluster admin`.** Nothing owner-facing
stays on `/cluster show`, which is the gamer command and is open to everyone.

### B4.4 The portal, as cards

New card kinds mirroring the web portal, each with the same numbers, read from
the same functions (`lib/server-portal.ts` — do not write second
implementations):

| Card | Shows |
|---|---|
| `srv_overview` | Members · on Cluster · linked · left · tier badge · progress to the next rung |
| `srv_earnings` | Sponsored share, members' winnings **stated as not payable**, paid / in flight / awaiting |
| `srv_growth` | The journey to 5,000 — the same four gates as the web portal |
| `srv_challenges` | Their challenges: live, requested, finished, with entry keys for their own |
| `srv_members` | Who linked, who won, recent joins |
| `srv_payouts` | **Read only.** What is owed, what was paid, and a Link button to the portal |

### B4.5 Money is web-only, and the key is the owner's

Two rules, and the second is the reason for the first:

1. **A payout request can only be made in the web portal.** The bot displays
   what is owed and links out. It never initiates money movement.
2. **The portal key is DM'd to `owner_id` and to nobody else, ever.** Not the
   installer, not a moderator, not the person who ran a command.

Why they go together: a server owner may well have a moderator add the bot.
That moderator can be given a Cluster-admin role and run `/cluster admin` — see
earnings, request challenges, read growth. **They still cannot open the portal,
because they do not have the key, and they cannot ask for a payout, because the
bot cannot ask for one.** The key is the proof of ownership, and it lives in
one inbox.

If the owner wants to delegate the portal, they hand over the key deliberately
— which is a decision they made, not one the software made for them.

**Verification owed → `tests/db/bot-admin.mts`:**
- Roles sync from a mocked Discord response and land in the table with their
  permissions.
- A member with a designated role passes the guard; the same member without it
  fails.
- The guild owner always passes, even with no designation.
- **A member with Discord Administrator passes in every case** — asserted twice
  over: once with nothing designated, and again on the same guild *after* the
  owner has designated a role that this member does not hold. Administrator
  always wins; designation only ever adds people.
- Designating roles never removes an existing grant: assert the owner and an
  administrator both still pass immediately after a designation is saved.
- A managed (bot) role can never be designated.
- **The portal key is delivered to `owner_id` and to no other id** — assert on
  the recipient argument, for every path that sends a key: install, resend from
  mission control, rotate.
- `/cluster admin` on a server where the caller has no role produces a refusal
  card, not data.
- No admin card exposes a payout action.

**Verification owed → `tests/ui/bot-admin-cards.mjs`:** every `srv_*` card renders 200 from
`/api/card/<kind>`; the numbers on `srv_earnings` equal the numbers the web
portal shows for the same guild (this is the assertion that stops the two
implementations drifting).

---

## B5 — Gifting: search as you type

### B5.1 On the web

`components/TrophyMarket.tsx` currently asks for a "profile name" in a plain
text box, and a typo means a rejected purchase. Replace it with a debounced
type-ahead: avatar, display name, `@slug`, and their Discord handle if they
have one.

Needs a `GET /api/gamers/search?q=` endpoint — prefix match on display name,
slug and Discord username, limit 8, **public data only** (no email, ever), and
rate-limited. Check whether an existing search endpoint can be reused rather
than adding a second one.

### B5.2 In the bot

Allow entering a **Discord username** as the recipient. This is the natural
identifier there — a gamer knows their friend's Discord handle, not their
Cluster slug. `users.discordUsername` already exists and is populated at OAuth.

Two safeguards: show the resolved profile before charging anything ("Send to
**Nova** (@nova)? — yes / no"), and handle the not-found case with a message
that says how to find the right name rather than just failing.

Discord's autocomplete interaction type can serve this live if the gift flow
is a slash command; if it is a modal, resolve on submit and show a confirm
step.

### B5.3 Show the value in CP

Every gift surface shows the price with the coin, and the recipient's
notification says what it was worth.

**Verification owed → `tests/ui/gifting.mjs`** (typing three characters produces results;
picking one fills the form; a misspelling never reaches the server action) and
**`tests/db/gifting.mts`** (resolve by slug, by display name, by Discord
username; ambiguous names; self-gifting; the giver is charged, not the
recipient — this last one is already asserted in the marketplace suite,
keep it).

---

## B6 — Redeem and marketplace, step by step, on the web

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

**Verification owed → `tests/ui/redeem-flow.mjs`:** every step renders; back works; a
refresh mid-flow resumes; the totals match; no bank field exists anywhere on
any step (assert on input names and placeholders — this is the property the
whole payments design rests on).

---

## B7 — The screenshot system (the plumbing)

**The goal, in one sentence: no claim on the website without a real screenshot
of the real feature behind it.**

This item builds the **plumbing only** — the table, the component, the console.
It captures nothing. The `<FeatureShot>` placeholder is what makes that
possible: slots go onto pages during the build, visibly empty, and V1 fills
every one of them in a single run once Part I closes. A slot placed in B8 and a
slot placed in B14 are filled by the same pass, which is the point.

### B7.1 The data model

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

### B7.2 The component

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

### B7.3 The admin console

`/admin/shots`: every shot key, its image, where it is used on the site (the
reverse index — computed by grepping `shotKey=` at build time or maintained as
a registry constant), whether it has been captured, and when. Bulk recapture.
Filter for "claims with no shot" — that list is B8.1's to-do, and V2 works
through it.

**Verification owed → `tests/ui/shots.mjs`:** the component renders an image when one
exists and a visible placeholder when it does not; an admin can replace one and
it changes on every page using it; a non-admin sees no edit affordance;
overlays render; nothing 404s.

---

## B8 — The claim registry and the copy rewrite

### B8.1 Inventory the claims

Walk every public page and list every claim the product makes:

`/` · `/pricing` · `/discord-bot` · `/marketplace` · `/quests` ·
`/leaderboards` · `/challenges` · every planet page · `/blog/*` · `/dataroom/*`
· the pitch deck · the partner profile · `/servers` · the brand and server
sign-in pages.

Keep the inventory **as data** — `lib/claims.ts`, one entry per claim with its
text, its page, its `shotKey` and its state (`proven` | `unproven`). That is
what makes `tests/ui/claims.mjs` able to check it, what feeds the "claims with
no shot" filter in `/admin/shots`, and what R2 is generated from once it
exists. A claim inventory kept in prose is a claim inventory nobody maintains.

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
of B8 and of V2, and it is worth more than the images.

### B8.2 Rewrite the copy around what is now demonstrable

With the shots in hand, rewrite each page so text and image argue together:
what we do, who for, what it costs, what you get. Positioning stays as it is —
*the media-buying and monetization layer for gaming communities* — but every
section should now be **claim → proof**, not claim → adjective.

All copy is CMS-editable (`lib/cms.ts`) and bilingual (EN/AR). Anything added
needs both, or it renders English inside an Arabic page.

### B8.3 The pitch deck and data room

Same treatment. An investor deck whose product slides are real screenshots of a
working product is a different document from one with bullet points, and this
is the cheapest credibility available.

**Verification owed → `tests/ui/claims.mjs`:** every registered shot key resolves to an
image; every marketing page renders its shots; **no page contains a claim
listed in the registry as unproven** (keep the claim registry as data so this
is checkable); no broken images anywhere.

---

## B9 — Nav: the marketplace badge

The trophy marketplace is an icon in the nav. It becomes a **badge, beside the
planets badge**, in the same visual family — and **admin-editable** the same way
the planets badge is (art, label, visibility, order), through the existing
chrome editor rather than a new one.

Files: `components/Nav.tsx`, `lib/admin-nav.ts` / the chrome CMS keys,
`lib/mobile-nav.ts` for the mobile equivalent.

**Verification owed → `tests/ui/nav.mjs`:**
- The marketplace badge renders beside the planets badge, not as a bare icon.
- An admin change to its art/label shows on the next render.
- It appears in the mobile drawer too, in the same order.

**Shots owed:** `nav.badges` — "One nav, two doors: your planets and the
marketplace" — the signed-in nav.
**New routes:** none.

---

## B10 — One background image behind a component group, not three copies

The nav art is painted **three times**: once behind the nav, once behind the
collapsed Profile-of-the-Week band, once behind the expanded band (darker). It
should be **one image, one element, overflowing** — the nav sits on it, the
collapsed band continues it, and when the band expands the same image continues
into the expanded panel.

The general rule, which is the part that outlives this instance: **a background
image belongs to a component *group*, not to each component in it.** One
positioned layer at the group root, children transparent over it, the darker
expanded state achieved with a veil over the shared image rather than a second
copy of the image.

Why this matters beyond looks: three copies means three downloads, three
decodes, and three chances for the art to align a pixel differently — which is
exactly why the seam is visible today.

Apply to the nav + Profile-of-the-Week group first, then **audit every other
background-art surface for the same pattern** (`lib/card-bg.ts` consumers, the
page-background editor, the feed cards) and collapse any other duplicates found.
Record what was found in the commit message.

**Verification owed → `tests/ui/backgrounds.mjs`:**
- Exactly one element carries the nav background art URL (count nodes whose
  computed `background-image` resolves to it).
- The collapsed band and the nav share one continuous image (assert the layer is
  a common ancestor of both).
- Expanding the band does not add a second copy; the darker look comes from an
  overlay.
- No other component group paints the same URL more than once.

**Shots owed:** `nav.potw.expanded` — "One continuous surface" — nav with the
Profile-of-the-Week band expanded.
**New routes:** none.

---

## B11 — Nav game badges open the planet, in place

Clicking a game logo in the nav navigates to that game's planet page. It should
instead **expand a dropdown**, exactly like the Profile-of-the-Week dropdown:
full-width, the hero globe art, the game world, everything the planet page shows
— and clicking a **different** game logo swaps the world in place rather than
closing and reopening.

This is the same interaction the homepage hero already implements (game logos
expand a world; clicking another game changes it). **Reuse that component. Do
not write a second one** — two implementations of the game-world hero will
diverge inside a month, and the homepage one is the one that has been tuned.

The dropdown ends with a **"Open the planet"** button to the full page, because
the dropdown is a preview surface, not a replacement for the page.

Files: `components/Nav.tsx`, the homepage hero world component, `lib/hero-layout.ts`.

**Verification owed → `tests/ui/nav-planet.mjs`:**
- Clicking a game badge expands a panel and does **not** navigate.
- The globe art and the game world render inside it with real data.
- Clicking a second game swaps the content without collapsing the panel.
- The "Open the planet" button navigates to `/planets/<slug>`.
- Escape and outside-click close it (the existing dropdown behaviour).

**Shots owed:** `nav.planet.dropdown` — "Every game, one click from anywhere" —
the nav dropdown with a game world open.
**New routes:** none.

---

## B12 — Planet hero shows live challenges only; completed ones live on the page

The planet hero globe currently lists challenges regardless of state. Split it:

- **Hero: live challenges only.** A hero is a "what can I do right now" surface,
  and an ended challenge in it is an invitation to do nothing.
- **Planet page: a Completed section.** Every finished challenge for that game,
  with its **final standings, the scoring, and the numbers** — who placed where,
  on what metric, with what figure. This is the proof the scoring is real, and
  it is currently only visible while a challenge is running, which is precisely
  backwards.

Files: `app/planets/[slug]/page.tsx`, the planet hero components, `lib/challenges.ts`.

**Verification owed → `tests/ui/planet.mjs`:**
- The hero lists only challenges whose state is live.
- A completed challenge appears in the Completed section on the page.
- Its standings render with real placements and metric figures.
- A game with no completed challenges shows an honest empty state, not a gap.

**Shots owed:** `planet.completed.standings` — "Every challenge settles in
public" — a planet page's completed section with standings.
**New routes:** none.

---

## B13 — The bot guides, rebuilt

Fewer than nine cards, redesigned from scratch, each one a *thing a gamer needs
to understand* rather than a step in a manual:

1. **Challenges and scoring** — how you enter, how you are scored, what the
   game's own ladder has to do with it, what happens when it ends.
2. **Trophies and redeem** — what a trophy is, that it holds a cash value, how
   you cash it out, and that we never ask for your bank details.
3. **Cluster Points** — the overview: every action that earns, what each is
   worth, the daily cap on each, and what points turn into.

Plus the three install cards (B14), which are also reachable from Home.

Design bar: these are the product's teaching surface and they currently read
like documentation. Every one is a **visual** — boxes, icons, numbers — not a
paragraph. The coin (B2) beside every figure.

**Verification owed → `tests/ui/bot-guides.mjs`:**
- Fewer than nine guide kinds are registered.
- Each renders 200 from `/api/card/<kind>` at a plausible byte size.
- The CP guide lists every earning action with its weight and its daily cap,
  and those numbers equal `ACTION_CATALOG` (assert against the source, so the
  card cannot drift from the engine).
- Every guide is reachable from Home and from `/cluster guide`.

**Shots owed:** `bot.guide.cp`, `bot.guide.challenges`, `bot.guide.trophies` —
"The bot teaches in cards" — `/api/card/<kind>`.
**New routes:** none.

---

## B14 — The Home card: a Cluster home page, in Discord

`Home` gets a new card kind, `home`, which is the gamer's actual home page:

**Background:** their own profile customization if they have one, otherwise the
admin-set card background — so a decorated profile is visibly rewarded and an
undecorated one still looks deliberate.

**Top left:** their Discord display name, their avatar, and beneath the name
**the logos only** of the games they have linked. No labels — the logos are the
statement.

**Row 1 — three live challenges**, side by side, each glorified with the
challenge cover and the game logo on it, plus a **More challenges** button →
an all-challenges card, filterable by game, showing **active challenges only**.

**Row 2 — the four quests**, side by side, plus a **Quests** button → all
quests. Opening a quest shows the gamer's progress, their CP (with the coin),
and a clear, organised list of **the actions that earn CP on that quest** —
each with its value and its daily cap (B17).

The three install cards (B13) are reachable from here too, so a gamer who
arrives late still gets the introduction.

**Verification owed → `tests/ui/bot-home.mjs` + `tests/db/bot-home.mts`:**
- The card renders for a gamer with a customized profile and for one without.
- Linked-game logos match that gamer's linked accounts exactly.
- Row 1 holds three challenges, all live.
- Row 2 holds four quests with the gamer's real progress.
- The game filter on the all-challenges card returns only that game's active
  challenges.
- A gamer with zero linked games and zero progress still gets a card that
  renders (the empty state is the most common first impression).

**Shots owed:** `bot.home` — "Your whole Cluster, in one card" —
`/api/card/home`.
**New routes:** none.

---

## B15 — The new CP actions, wired into the quests that already exist

`ACTION_CATALOG` in `lib/quests.ts` has **19** actions (counted from the
catalogue itself — an earlier draft of this document said 20, and B34's table is
19 existing plus the 4 below, which is where the number matters). The features
shipped since
it was written earn nothing:

| New action | Quest | Why there |
|---|---|---|
| `redeem_trophy` | ascension | Cashing out is the end of the loop and should be celebrated, not silent |
| `gift_sent` | orbit | Giving is the most social act in the product |
| `gift_received` | orbit | And receiving pulls the recipient back in |
| `bot_added` | signal | See B22 — this one grows the platform |

Weights and caps are set by B16's calculator, not picked here.

**Glorify the actions themselves.** Quests can now earn real money — a gamer
who tops up their CP is topping up something redeemable — and the whole site
still talks about them as if they were a score. Every quest surface should make
the action feel like the opportunity it is.

**Verification owed → `tests/db/quests.mts`:**
- Each new action awards on the real code path (redeem, gift send, gift receive,
  bot add), not a test-only shim.
- Each is deduped by `(quest, action, ref)` like every existing action.
- Each respects its daily cap.

**Shots owed:** `gamer.quest.actions` — "Every action, what it pays, what it
caps at" — a quest page's action list.
**New routes:** none.

---

## B16 — The CP economics model and the admin calculator

**This is the most important item in Part I, and the only one where getting it
wrong costs money rather than time.**

### B16.0 What the code says today

Grounded in `lib/quests.ts` and `lib/marketplace.ts`, not assumed:

- **1,000 CP = $1** (`DEFAULT_CP_PER_DOLLAR`), admin-movable via
  `platform_settings["marketplace.cpPerDollar"]`.
- Ten actions carry a `defaultCap`. **Nine do not** — `finish_challenge`,
  `top3_challenge`, `win_challenge`, `join_planet`, `follower_gained`,
  `profile_views_25`, `connect_account`, `profile_vote_received`,
  `best_profile_award`.
> **The table below is the PRE-B34 state, kept because it is the diagnosis.**
> It is what the code paid when this item was written and it is why B34 exists.
> The shipped numbers are B34.1's table; do not read this one as current.

- Maximum **capped** earnings, one quest per action, per gamer per day:

  | Action | CP | Cap/day | CP/day |
  |---|---|---|---|
  | `stat_levelup` | 25 | 20 | 500 |
  | `reaction_received` | 3 | 50 | 150 |
  | `write_post` | 10 | 10 | 100 |
  | `write_comment` | 5 | 20 | 100 |
  | `botlist_vote` | 50 | 2 | 100 |
  | `join_challenge` | 15 | 5 | 75 |
  | `reaction_given` | 2 | 30 | 60 |
  | `message_new` | 4 | 15 | 60 |
  | `ad_impression` | 1 | 60 | 60 |
  | `ad_click` | 5 | 10 | 50 |
  | **Total** | | | **1,255 CP/day = $1.26/gamer/day** |

  Plus an **unbounded tail** from the nine uncapped actions.

- **An action can pay more than once.** `awardQuestAction` credits **every quest
  listening to that action**, and the cap is stored per quest. Point two quests
  at `ad_impression` and both the reward and the cap double. This is a feature
  as designed and a multiplier that must appear in the model.

At $1.26/day the worst case is **$1,255/day at 1,000 gamers, $125,500/day at
100,000, $1.26M/day at 1,000,000** — before the uncapped tail. That is the
number this item exists to bring under control.

### B16.1 The model

`lib/cp-economics.ts` — pure functions, no I/O, so it can be tested and reused
by the calculator, the admin dashboards and the financial model:

```
maxDailyCp(config)            → per gamer, with the multi-quest multiplier applied
maxDailyCost(config, gamers)  → dollars, at any population
exposure(config)              → { capped, uncapped[], worstCase, realistic }
abuseSurface(config)          → every action reachable without spending money
                                 or playing a game, ranked by CP per minute
```

Every uncapped action is listed by `exposure()` as an open liability with the
reason it is open — some genuinely should be (winning a challenge should not be
rationed) and the model must say so rather than silently zeroing them.

### B16.2 The calculator

`/admin/cp-calculator`, staff-visible, admin-editable:

- Every action, its CP weight, its daily cap, which quests listen to it, and its
  resulting **CP/day and $/day per gamer** — recomputed live as you drag.
- **Population sliders**: 1k / 10k / 100k / 1M, and a free entry.
- **Participation assumptions**, because "every gamer maxes every action" is the
  worst case, not the forecast: what share are daily-active, what share of the
  cap an active gamer actually reaches. Both editable, both shown beside the
  worst case so the two numbers are never confused.
- **Offsetting revenue** on the same screen — ad revenue per impression, brand
  spend per challenge — so the question is answered as *margin*, not as cost.
- **Save**: writes the weights and caps back to the quests and to
  `platform_settings`, platform-wide, in one transaction, with an audit-log
  entry recording who changed what from what to what. **Money settings are the
  one place where "who changed this" is not optional.**

### B16.3 Defaults that keep us safe

> **Superseded by B34.** The numbers were decided after this item was written:
> 1,000 CP = $0.10, every action capped, and a hard ceiling of 500 CP per gamer
> per day. B16 still builds the model and the calculator — B34 is what they are
> initialised with, and B34.0 explains why. Read B34 before touching a weight.


Propose and apply a default cap for **every** action, including the nine open
ones, chosen so that **maximum CP per gamer per day lands under a stated ceiling
in dollars** — the ceiling itself being an admin setting, so the policy is one
number rather than twenty.

Where an action should not be rationed (winning a challenge), cap it at a level
no honest gamer reaches but a script does, and say that in the UI.

**Verification owed → `tests/db/cp-economics.mts`:**
- `maxDailyCp` equals a hand-computed figure for a known config (B34's table is
  the fixture, not the one above — see the correction below).
- ~~The multi-quest multiplier is counted: an action on two quests pays twice
  and caps twice.~~ **Corrected by B34.2.** The multiplier was removed, not
  modelled: CP is credited once per action and progress goes to every listening
  quest. The assertion is now the opposite one — an action on two quests pays
  ONCE and progresses twice — and it is in the suite. A model that counted a
  multiplier the engine no longer has would overstate our cost by however many
  quests an admin happened to point at an action.
- No action in `ACTION_CATALOG` lacks a cap after the defaults are applied.
- Saving from the calculator changes what `awardQuestAction` actually grants — assert
  through the real award path, not the settings row.
- The worst-case daily cost at 1M gamers is under the configured ceiling.
- The audit log records every change.

**Shots owed:** `admin.cp.calculator` — "Every point we give away, modelled
before we give it" — `/admin/cp-calculator`.
**New routes:** `/admin/cp-calculator`.

---

## B17 — Daily caps on every action, enforced silently and shown honestly

Two halves, and the second is what makes the first humane.

**Enforce:** every action carries a cap (B16.3). `awardQuestAction` already checks
one; extend it so no action is uncapped, and so the cap is evaluated across
quests, not per quest, when the config says so.

**Say nothing when it is reached.** No error, no toast, no "you've hit your
limit", no disabled button. The action still works — the post posts, the ad
still counts as an impression for the brand — it simply stops earning. A gamer
who is told they have hit a limit feels metered; a gamer who is not told feels
nothing, and comes back tomorrow.

**But never hide it.** The cap for every action is stated **up front** on the
quest card and in the CP guide, and when today's cap is reached the CP history
shows the entry — *"Ad views — daily maximum reached (60/60)"* — so anyone who
looks can see exactly what happened and when it resets. The rule is **no
interruption, full disclosure**: nothing blocks, nothing surprises.

**Verification owed → `tests/db/caps.mts` + `tests/ui/caps.mjs`:**
- Past the cap, the underlying action still succeeds and awards zero.
- No error is returned, thrown or rendered, and no control is disabled.
- The cap resets at UTC midnight (the boundary `startOfUtcDay()` already uses).
- Every quest card renders the cap next to every action.
- The CP history shows a maxed entry with the figure and the reset.

**Shots owed:** `gamer.cp.capped` — "Capped, and told plainly" — the CP history
showing a maxed action.
**New routes:** none.

---

## B18 — The wallet

A new gamer page, `/wallet`, which is the gamer's financial statement.

**Centre of the page: Cluster Points, with the dollar value beside them, always.**
A currency whose worth is a mystery is a score. Below it, the **trophy case**:
each trophy with its own cash value, the total, and a redeem action on each.

Below that, **the ledger** — one list, in and out, like a bank statement:

| | |
|---|---|
| Earned 120 CP — Connected a game account | `+` |
| Bought *Nebula Cup* — 5,000 CP | `−` |
| Trophy received — *Nebula Cup*, worth $5.00 | `+` trophy in |
| Redeemed *Nebula Cup* — $5.00 | `−` trophy out |
| Gift received — *Comet Shard*, worth $2.00 | `+` trophy in |

Every CP movement with what it was for; every trophy movement in or out with
what it was worth. A gamer should be able to answer "where did my points go and
what do I have" without asking anyone.

The **marketplace is embedded here too** — buying is a wallet action, and making
someone navigate elsewhere to spend the balance they are looking at is a
self-inflicted drop-off.

**Verification owed → `tests/ui/wallet.mjs` + `tests/db/wallet.mts`:**
- CP balance and its dollar value both render, and the dollar value equals
  `balance / cpPerDollar`.
- Trophy case totals equal the sum of the individual values.
- The ledger contains an entry for every CP movement and every trophy movement,
  signed correctly, and reconciles: balance = earned − spent.
- Redeeming from the wallet reaches the same server function as the trophy case.
- No payment detail appears on the page, in any state.

**Shots owed:** `gamer.wallet` — "Your points, your trophies, what they are
worth" — `/wallet`; `gamer.wallet.ledger` — "Every point accounted for".
**New routes:** `/wallet`.

---

## B19 — Marketplace, revamped

`/marketplace` and the marketplace section on the quests page, rebuilt to match
the wallet: every trophy with its CP price **and its dollar value**, what your
balance buys right now, and the confirm step from B6.

**Verification owed → `tests/ui/marketplace.mjs`** (extend the existing suite):
- Every trophy shows CP price and dollar value.
- Affordability is computed against the real balance.
- The quests-page section and the page itself show the same prices.

**Shots owed:** `gamer.marketplace.shelf` (already registered — recapture).
**New routes:** none.

---

## B20 — The wallet card, in Discord

The bot's wallet card, working properly: CP with its dollar value, the trophy
case with its dollar value, **recent transactions**, and a **redeem** flow that
completes inside Discord (B3.4's stepper, reached from here).

Same numbers as `/wallet`, from the same functions — assert it, because two
implementations of a balance is how a support ticket starts.

**Verification owed → `tests/ui/bot-wallet.mjs`:**
- The card renders with balance, dollar value, trophy case and recent movements.
- Its figures equal `/wallet`'s for the same gamer.
- Redeem completes from Discord and shows in the web ledger.

**Shots owed:** `bot.card.wallet` — "Your wallet, in Discord" —
`/api/card/wallet`.
**New routes:** none.

---

## B21 — The economy, explained in visuals

The loop, told everywhere it matters, in pictures rather than paragraphs:

> **You earn points for free, by doing things. Points buy trophies. Trophies
> redeem for real money.**
>
> Enter a challenge for a chance at a trophy. **Lose, and you still earn** — for
> entering, for linking an account, for showing up. You can earn as little as
> watching an ad or clicking one. Every action has a daily maximum, and it is
> written next to the action.

This runs through the bot guides (B13), the quest pages, the wallet (B18), the
homepage (B23) and the pitch deck. Same loop, same order, same visual language
everywhere — a gamer who learns it in Discord should recognise it on the site.

**Verification owed → `tests/ui/economy-copy.mjs`:**
- Every surface in the list states the loop in the same order.
- Every surface that mentions earning also states the cap.
- No surface promises an amount the caps make unreachable.

**Shots owed:** `gamer.economy.loop` — "Free points → trophies → real money".
**New routes:** none.

---

## B22 — Track the bot install, and pay for it

Anyone who clicks **Add the bot to your server** and completes the install
should earn CP on the **signal** quest — a Cluster member who brings us a server
has done the single most valuable thing a gamer can do for us.

- Attribute the click: a signed state parameter through the OAuth install URL
  back to `app/api/discord/installed/route.ts`, which already receives
  `guild_id`. Attribute to the signed-in Cluster user, if there is one.
- Award once per guild, not once per click — the dedup key is the guild id.
- **Default 500 CP, adjustable** in the calculator (B16) like every other
  weight. Ad impression and ad click likewise become adjustable there rather
  than living as constants.

**Verification owed → `tests/db/bot-attribution.mts`:**
- A completed install by a signed-in gamer awards signal CP once.
- A second install of the same guild awards nothing.
- An install by somebody with no Cluster account awards nothing and does not
  error.
- The award respects the daily cap and the configured weight.

**Shots owed:** `gamer.quest.signal` — "Bring us a server, get paid for it".
**New routes:** none.

---

## B23 — The page consolidation, the footer, and the copy

The public site says the same things in several places with different words. One
page per audience, and each one carries the screenshots that prove it.

| Page | Becomes |
|---|---|
| `/servers` + `/discord-bot` | **One server-owner page.** The pitch, the portal screenshot, the three tiers glorified. One hero, one argument. |
| *(new)* `/for-brands` | **The brand page.** Same shape as the server-owner page, different colour treatment, the brand-portal screenshot, the three pricing tiers. |
| `/brands` | It is a contact form, so it becomes **`/contact`**, linked from the footer. |
| `/pricing` | **One element only**: the tier switcher — *brands pay* ⇄ *owners earn* — with links to the two pages above. Nothing else. |
| `/` (guest **and** signed-in) | **The gamers page.** The homepage is the for-gamers page, in both states, fully rewritten and reordered. |
| `/blog` | Revamped to the same structure and rhythm as the rest. |
| Footer | Rebuilt: structured, clean, one system across every page. **Remove the language switch** (B24). |

Every section on every one of these pages carries **the screenshot that belongs
to that section** — `<FeatureShot>` slots placed during this item, filled by V1.

Copy: rewritten end to end. The positioning holds — *the media-buying and
monetization layer for gaming communities* — but each page now argues to one
audience instead of three, and every section is **claim → proof**.

**Verification owed → `tests/ui/pages.mjs`:**
- Each consolidated page renders, with its hero, its tiers and its shot slots.
- `/servers` and `/discord-bot` resolve to the one page (redirect, not a
  duplicate).
- `/brands` redirects to `/contact` and the old URL does not 404 for anyone who
  bookmarked it.
- `/pricing` contains the switcher and no second pitch.
- The homepage renders the gamers page signed in and signed out.
- The footer is identical across pages and carries no language switch.
- Every nav and footer link resolves (crawl, do not assume).

**Shots owed:** `page.servers.hero`, `server.tiers.three`, `page.brands.hero`,
`brand.tiers.three`, `page.pricing.switch`, `page.home.gamer` — one per page,
plus the per-section slots.
**New routes:** `/for-brands`, `/contact` (and redirects from `/servers`,
`/discord-bot`, `/brands`).

---

## B24 — Park localization

Translation is out of scope until the product stops moving. Rewriting copy twice
in two languages while the pages themselves are being consolidated is paying for
the same work twice and getting the Arabic wrong both times.

- **Remove the language switch from the footer.**
- Stop maintaining AR alongside every copy change; English is the working
  language for the whole of Part I.
- **Keep the machinery.** `lib/i18n`, the locale-namespaced CMS keys, the
  per-entity translation columns all stay exactly where they are, unused. This
  is a pause, not a removal, and ripping the plumbing out would make resuming
  cost more than the pause saved.
- Add a line to the V4 report saying localization is parked and what it will
  take to restart.

**Verification owed → `tests/ui/pages.mjs`** (same suite as B23):
- No language switch renders in the footer.
- Setting a locale does not break a page (the machinery still resolves).

**Shots owed:** none.
**New routes:** none.

---

## B25 — The gamer's Discord card: the trophy case, and one button per account

Two additions to the gamer/profile card:

**Trophy case, up to three.** The three most valuable trophies they hold,
rendered on the card — cover, name, cash value. Three because a card is 1200×630
and a fourth makes all four unreadable; "up to" because a gamer with one trophy
should see one, not two empty frames.

**One button per linked account, labelled with the account's own name.** Not
"Valorant" — *"NovaStrike#EUW"*. And when a gamer has **two accounts on the same
game**, that is **two buttons**, one per account, each opening that account's
stats. The current card collapses them, which is exactly the case where a gamer
most needs to choose.

Button budget: 5 per row, 25 total. Six games × two accounts is 12 buttons,
which fits, but the layout must not assume one row.

**Verification owed → `tests/ui/bot-profile-card.mjs`:**
- A gamer with 5 trophies shows exactly 3, the most valuable ones.
- A gamer with 1 trophy shows 1 and no placeholders.
- A gamer with 0 trophies renders without an empty shelf.
- Each linked account produces its own button, labelled with the in-game name.
- Two accounts on one game produce two distinct buttons that open different
  stats screens.
- A gamer with 12 linked accounts stays inside Discord's component limits.

**Shots owed:** `bot.card.profile` — "Your trophies and every account, on one
card" — `/api/card/profile`.
**New routes:** none.

---

## B26 — LoL stats read as ranks, and the level stops appearing twice

Two defects in the League of Legends surfaces, both visible today.

> **Corrected before build.** This section was written from an assumption about
> where each defect lives. Both defects are real; both were in a different place
> than described. The corrected diagnosis is below — the original wording, kept
> for the record, said "the cards render `value`" (most of them do not) and
> blamed "a generic `level` metric" (no such metric exists on the LoL provider).
> What follows is what the code actually does, read line by line.

**Ranks render as numbers instead of ranks — on the feed dashboard, and only
there.** `lib/providers/adapters.ts:304-305` returns `solo_tier` and `flex_tier`
as `{ value, rankLabel }`, where `rankLabel` is the real thing — *"Gold II"* —
and `value` is the sortable ladder position it was derived from.

Most surfaces already get this right and must not be touched:
`app/u/[slug]/page.tsx:194`, `components/LeaderboardWidget.tsx:72,103` and the
Discord card data at `lib/cards/data.ts:160,350,517` all read
`rankLabel ?? fmtNum(value)`.

The one offender is the **feed dashboard**. `app/feed/page.tsx:131` builds
`dashStats` without selecting `rankLabel` at all, so
`components/FeedDashboard.tsx:189,197` can only print
`s.value.toLocaleString()` — a LoL gamer's Solo/Duo rank reads as `2700`. The
same projection derives its label as `metricKey.replace(/_/g, " ")` → *"solo
tier"*, rather than the registry's declared `label` → *"Solo/Duo tier"*.

Fix, in the order that makes the next game inherit it:

1. Carry `rankLabel` through the `dashStats` projection and add it to
   `DashStat` in `components/FeedDashboard.tsx:14`.
2. Resolve the display label from the provider registry's `capabilities[].label`
   (`lib/providers/registry.ts`), falling back to the de-underscored key only
   when the registry has no entry.
3. **Wherever a metric carries a `rankLabel`, that label is the display value
   and the number is only for sorting.** Not a LoL special case — Dota's
   `rank_tier` carries one too (`adapters.ts:128-134`), and every ladder game
   added later will. Put it in one shared helper rather than a fourth copy of
   `rankLabel ?? fmtNum(value)`, and have the three existing correct call sites
   use it so there is one definition to change.

Show **both** LoL ranks as text on the card: **Solo/Duo** and **Flex**.

**The level appears three times, and no metric is at fault.** There is no
generic `level` metric on the LoL provider — `level` is declared only by Apex
(`registry.ts:329`) and Mobile Legends (`registry.ts:363`), different providers
that cannot collide with `summoner_level`. `adapters.ts:614` is the MLBB
mapping, not a shared one. The duplication is purely in the rendering:

| Where | What it prints |
|---|---|
| `LolCard.tsx` `statNumbers` | the `summoner_level` metric tile, labelled "Summoner level" |
| `LolCard.tsx:167-172` | a **second** "Summoner level" tile, from the rich snapshot |
| `ProfileAccounts.tsx:155` | a **third**, as `· Lv N` in the account header |

Fix: delete the snapshot tile at `LolCard.tsx:167-172` — the metric tile is the
tracked, synced, leaderboard-backed one and is the copy to keep. Keep the header
`· Lv N`: it is a different affordance (an identity pill on a collapsed row, not
a stat in the stats grid) and it is the only level visible before the card is
expanded. Leave a comment at the deletion site saying why, so the snapshot tile
is not helpfully added back.

Then check the same *rendering* collision on every other provider: the rule is
that a component holding both a metrics list and its own rich snapshot must not
print a figure the metrics list already carries.

**Verification owed → `tests/db/metrics.mts` + `tests/ui/lol-card.mjs`:**
- A metric with a `rankLabel` renders the label, never the number, on every
  surface: profile, planet, leaderboard, the feed dashboard, and the Discord
  card. The feed dashboard is the one that was broken — assert it by name.
- A metric's displayed label comes from the provider registry, so `solo_tier`
  reads "Solo/Duo tier" and never "solo tier".
- Sorting still uses the number (assert a leaderboard orders correctly while
  displaying labels).
- The LoL card shows Solo and Flex, both as text.
- No stat label appears twice inside one account card, for any provider —
  assert across all of them, not just LoL, and count rendered tiles rather than
  metric keys, because the duplication was a second renderer and not a second
  metric.

**Shots owed:** `gamer.lol.card` — "Your rank, in the game's own words" — a
profile's LoL account card.
**New routes:** none.

---

## B27 — Every bot card: the data reads well, the buttons are grouped

A sweep across **every** card kind and every screen, not a fix to one:

**The cards.** Each kind gets read as a *page*: is the hierarchy right, does the
most important number dominate, is anything clipped, does an empty state look
deliberate. The list cards established the working conventions (`TILE_W = 218`,
three across, no fixed text height because it clips descenders, `clamp()` on
names, numbered badges matching numbered buttons) — apply them everywhere and
record any kind that cannot follow them, with the reason.

**The buttons.** Group them by meaning, in a fixed row order, so muscle memory
works across screens:

```
row 1 — what this card is about   (the choices: pick a game, a challenge, a trophy)
row 2 — what you can do next      (join, link, redeem, buy)
row 3 — where you can go          (Home, Back, and the link out to the web)
```

Colours by category are already decided (B3.0.2); this adds *position* to
*colour*. Back is always in the same place, on every card, which is the single
biggest usability change in this item.

**Verification owed → `tests/ui/bot-cards.mjs`** (extend):
- Every registered card kind renders 200 at a plausible size.
- No card kind has an empty button set.
- Row order matches the grouping above on every screen.
- Back and Home sit in the same position on every card that has them.
- No screen exceeds 5 per row or 25 total.

**Shots owed:** none new — the existing bot card shots recapture.
**New routes:** none.

---

## B28 — The bot preview, rebuilt — and used instead of screenshots

The live bot preview exists and is not doing its job. Rebuild it:

- **Better sidebar navigation**, grouped by what a person is trying to
  understand rather than by card kind.
- **Scoped**: a preview embedded in a page section shows **only the cards
  relevant to that section**. The challenges section shows challenge cards; the
  quests section shows quest cards; the trophies section shows trophy and redeem
  cards; the server-owner section shows the `srv_*` portal cards; the gamer
  section shows the gamer's own cards.
- **Every card type, what it does, and how to ask for it** — the command or
  button that produces it, beside it. A preview that shows the output without
  the input teaches nothing.

**And then use it instead of screenshots.** Where a page demonstrates the bot,
embed the **real rendered card**, not a `<FeatureShot>` of one. The card renderer
is live, public and cached (`/api/card/<kind>`) — a screenshot of it would be a
photograph of something we can just show. `<FeatureShot>` stays for everything
the renderer cannot produce: portals, admin consoles, web pages.

This is a real saving in V1 as well: every bot claim proves itself at request
time and never goes stale.

**The coupling this creates, and the mitigation.** A marketing page that embeds
live renders is a marketing page that depends on the card renderer being up and
fast. Every embed therefore needs a **static fallback** — the last successfully
rendered card, served from cache, with the live render as an upgrade rather than
a requirement. The homepage must never be slow or broken because
`/api/card/` is. This slightly reduces the "no screenshots needed" saving and is
worth it.

**Verification owed → `tests/ui/bot-preview.mjs`:**
- The preview renders on the server-owner page, the homepage and the gamer page.
- Each embedded instance shows only its section's card kinds.
- Every card in the sidebar renders and states the command that produces it.
- The embeds are live renders, not images (assert the source is `/api/card/`).
- A card kind that fails to render degrades visibly, never to a blank frame.

**Shots owed:** none — this item *removes* shots. Record which R2 rows it
retires.
**New routes:** none.

---

## B29 — Everything new is an admin system, staffable by department

A standing rule, applied to every item in this plan and every one after it:

**Nothing ships without an owner in the admin taxonomy.** If admin cannot see
it, edit it, and delegate it, it is not finished. `lib/systems.ts` already makes
admin sections drive departments — every new surface registers there, gets its
actions, and becomes assignable to a department exactly like everything before
it. No parallel permission logic, no page that only works because you happen to
be an admin.

Applies to, at minimum: the CP calculator (B16), caps configuration (B17), the
wallet (B18), the shot console (B7), the bot preview (B28), the offers console
(B30), welcome challenges (B31), and every card kind's content and background.

**The two standing exceptions hold and are re-asserted here**: `/admin/users`
and `/admin/linked-accounts` are **admin-only** — no department reaches the gamer
directory or the linked-account list. `/admin/payments` likewise. B29 makes new
things delegable; it does not widen those two.

**Verification owed → `tests/db/taxonomy.mts`** (extend):
- Every admin route resolves to a registered system with actions.
- A department granted a system reaches its pages and no others.
- The two admin-only paths refuse every department, including one granted
  everything.
- No new page checks permissions on its own instead of through `pathAllowedFor`.

**Shots owed:** none.
**New routes:** none.

---

## B30 — The founding offers: admin-controlled, paused, and measured

`lib/offers.ts` already models both founding offers — 1,000 servers with a
welcome challenge, and the brand acquisition offer — from pricing and CMS keys.
What it lacks is a switch, an audit and a bill.

### B30.1 The console

`/admin/offers`, a first-class admin system (B29):

- **On/off per offer, off by default.** Both are **paused now** and turned on
  when we decide, not when the code deploys.
- **Every number editable**: the cap (30 brands, 1,000 servers), the value
  ($1,000 per brand, $25 per server), and — the one that decides the money —
  **the discount percentage applied to a brand's bill**.
- **Analytics**: who has received each offer, when, what it was worth, and what
  it has produced. Brands and servers in one table, filterable, because the
  question "what did the founding offers cost us and what did they return" has
  one answer, not two.

### B30.2 The brand bill

When the brand offer is on and a brand buys a month of challenges, the invoice
shows **the full price and then the discount as its own line**:

```
Sponsored challenges — 4 × $250                      $1,000.00
Founding brand offer — 100% covered by Cluster        −$1,000.00
                                                    ───────────
Due                                                       $0.00
```

Never a quietly reduced unit price. This is the same rule the base-reduction
discount already follows in `lib/invoices.ts`, and it exists because a bill
whose numbers cannot be traced is a bill somebody will dispute. The gross figure
is also what tells us what the offer actually cost.

- The discount is applied **automatically** while the offer is on, at the
  configured percentage.
- **Admin can edit both the bill and the discount** on any individual invoice —
  the automatic behaviour is a default, not a cage.
- Admin sees **which brands got what discount**, per invoice, in one list.

**Verification owed → `tests/db/offers.mts`:**
- Both offers are off by default.
- With the brand offer off, a challenge month bills at full price and no
  discount line exists.
- With it on, the discount line appears at the configured percentage, and the
  invoice total still equals the sum of its lines (totals are never stored — the
  standing rule).
- Changing the percentage changes the next invoice and never a sent one.
- An admin edit to a bill survives a recalculation.
- The analytics table counts each recipient once, and its totals equal the sum
  of the discount lines actually issued.

**Shots owed:** `admin.offers.console` — "Every founding offer, switchable and
counted" — `/admin/offers`; `brand.invoice.discount` — "The full price, and what
we covered" — a discounted invoice.
**New routes:** `/admin/offers`.

---

## B31 — Welcome challenges: auto-drafted, sponsored by Cluster, billed to Cluster

The server side of B30, and the more involved half.

### B31.1 The draft appears on its own

While the server offer is on, **a new server installing the bot gets a draft
welcome challenge created on its portal automatically.** Not an email, not an
offer to claim — a draft already sitting in their Challenges tab.

The owner's path, and the order matters:

1. Sign in to the portal with the key (already built).
2. **Complete onboarding** — audience details, description, the games their
   community plays. The existing server community profile.
3. **Challenges tab** → the draft is there → **choose the game** for it, from
   the games they just told us they play.
4. The **prize pool shows the trophy value admin set** for welcome challenges.
5. Submit. From there it is a normal challenge request in the admin queue —
   approve makes a **draft** and staff edit it before it publishes (the standing
   rule from B1-era work; a welcome challenge does not get to skip it).

Onboarding first is deliberate: a challenge aimed at an audience we know nothing
about is a challenge that does not fill.

### B31.2 Cluster is the brand, and Cluster gets the bill

The welcome challenge is **sponsored by the Cluster house brand** and **billed to
Cluster exactly like any other brand's sponsored challenge** — same invoice
machinery, same line items, same statuses.

This is the whole point, and it is worth being explicit about why: a giveaway
that skips the billing system is a giveaway nobody can add up. Running it
through the same invoice as a paying brand means the cost of the server offer
appears in the same ledger, in the same units, as the revenue it is meant to
produce. When somebody asks what customer acquisition cost, the answer is a
query, not an estimate.

- The house brand is a real brand record, marked as ours.
- Every auto-created welcome challenge appears on **Cluster's own bill**, line
  item *"Welcome challenge — <server name>"*.
- **Admin sets the prize pool per challenge** — the offer default is a default.
- Admin sees, in one place, every welcome challenge: which server, which game,
  what it cost, whether it ran, and what it produced in linked accounts.

**Verification owed → `tests/db/welcome-challenge.mts`:**
- Offer on + install → exactly one draft welcome challenge for that guild.
- Offer off + install → none.
- Two installs of the same guild → still one.
- The draft is invisible to members until it publishes.
- Submitting it enters the normal request queue, and approving it produces a
  draft, not a live challenge.
- It bills to the house brand, as its own line, at the admin-set value.
- Cluster's invoice total equals the sum of its welcome-challenge lines.
- Changing the default prize pool does not alter a challenge already drafted.

**Shots owed:** `server.welcome.draft` — "Your first challenge is already
waiting" — the portal's Challenges tab with the draft; `admin.welcome.ledger` —
"What we spent to grow, on the same bill as everything else" — Cluster's brand
invoice.
**New routes:** none (the portal tab and `/admin/offers` already exist).

---

## B32 — Email: Resend, one template system, and a delivery console

**Verified gap:** `package.json` has **no mail dependency of any kind**. Every
money event in this product currently depends on somebody opening Discord or
happening to log in. A brand that was never told it owes $1,000 does not pay it.

### B32.1 Outbound — Resend

`lib/email/` with the same graceful-degradation pattern as `lib/blob.ts`:
without `RESEND_API_KEY` the whole layer no-ops, logs the intent, and the app
behaves exactly as it does today. **Nothing may throw because mail is not
configured** — that is what makes it safe to build before the key exists.

DNS, which decides whether any of this arrives: **SPF, DKIM and DMARC** on the
sending domain. Billing mail that lands in spam is worse than no billing mail,
because you believe it was delivered.

### B32.2 Inbound — the recommendation

Resend sends; it is not a mailbox. To *receive* at the domain:

| Option | Cost | When it is right |
|---|---|---|
| **Cloudflare Email Routing** ← recommended now | **Free** | Forwards `hello@`, `support@`, `billing@` into an inbox you already own. Requires the domain's DNS on Cloudflare. Pair with Resend SMTP as a "send mail as" relay and you can reply from the domain. This is the correct answer for a pre-revenue company with one or two people. |
| **Zoho Mail** | ~$1/user/mo | Real mailboxes, cheap, when forwarding stops being enough. |
| **Google Workspace** | ~$7/user/mo | When you have staff, shared inboxes and want zero surprises. The default answer once there is a team. |

Start on Cloudflare. Moving to Workspace later is a DNS change, not a migration,
so this is a cheap decision to get wrong.

### B32.3 One template, many messages

A single layout — header, brand mark, body slot, footer, unsubscribe where the
law requires one — and **one content template per event**, never a hand-built
HTML string at a call site. Every message inherits the layout, so a design change
is one file.

The messages, at minimum: invoice issued · invoice due · invoice paid · payout
released · payout paid · redeem approved · redeem ready to collect · portal key
(and key rotated — B45) · challenge approved · challenge published · challenge
ended with results · welcome challenge drafted · a brand's offer applied ·
account deletion confirmation (B40).

**Every one of them is plain, short and states the number.** These are receipts,
not marketing.

### B32.4 The delivery console

`email_log` — recipient, template key, subject, provider id, status, timestamps,
error. Subscribe to **Resend's webhooks** (delivered, bounced, complained) and
write the status back.

`/admin/email` shows every message sent, its status, and a filter for failures.
Registered as an admin system, assignable to a department (B29). **A bounced
invoice email must be visible to a human**, because a bounce is the moment you
learn a customer never heard from you.

**Verification owed → `tests/db/email.mts` + `tests/ui/admin-email.mjs`:**
- With no API key, every send no-ops and nothing throws.
- Every template renders with real data and contains no unfilled placeholder.
- A webhook marks the log row delivered / bounced.
- The console lists sends, filters failures, and is department-assignable.
- No email contains a payment detail or a portal key in the subject line.

**Shots owed:** `admin.email.console` — "Every message we send, and whether it
arrived" — `/admin/email`.
**New routes:** `/admin/email`, the Resend webhook endpoint.

---

## B33 — Announcements become a queue

> **Re-verified against the code before building.** The loop, the call sites and
> the absence of `maxDuration` are all exactly as described. `grep -rn
> maxDuration app lib` returns only `app/admin/storage/page.tsx`,
> `app/api/cron/daily`, `app/api/cron/sync` and `app/api/setup` — nothing that
> covers a server action. The loop body is lines 105–119; the section says
> 105–117, which is the same loop.

**A verified live bug that gets worse with exactly the growth we are building
for.** `lib/discord/announce.ts:105–119` posts to guilds **sequentially, awaiting
each call**, and it is invoked from server actions — `app/actions/admin.ts:606`,
`app/actions/discord.ts:106`, `app/actions/challenge-requests.ts:113`,
`lib/challenge-series.ts:174`, `lib/welcome-challenge.ts:103`. **None of those
declare `maxDuration`**; only the cron routes do (`sync` 300s, `daily` 60s).

At ~200ms per Discord call, 100 servers is 20 seconds and 1,000 servers is over
three minutes, inside a request that is killed long before. The failure is
**silent and partial**: the checkpoint flushes every 10 servers, so the ledger
records a plausible-looking number and stops. You would read it as "reach was
lower than expected", not as "the process was killed".

**The fix:** the server action **enqueues**; a cron drains.

- `discord_post_queue` — one row per (scope, guild), with attempts, last error
  and status. The unit of retry is one server, not one announcement.
- The server action writes the rows and returns immediately, reporting *queued*,
  not *reached*. **The UI must stop claiming a number it cannot know yet** —
  reach becomes a figure that fills in over the next minutes.
- A cron route with a real `maxDuration` drains a bounded batch per run, honours
  Discord's rate limits (429 → respect `retry_after`, do not spin), and marks
  each row done or failed with the reason.
- Failures are visible in `/admin/discord`, per server, with a retry.

**Do not simply parallelise the loop.** 1,000 concurrent posts hits Discord's
global rate limit and gets the bot temporarily banned, which is a worse failure
than a slow one.

**Verification owed → `tests/db/announce-queue.mts`:**
- Publishing enqueues one row per target and returns without posting.
- Draining posts, marks done, and is idempotent across two drains.
- A 429 reschedules rather than dropping.
- A permanently failing guild stops after N attempts and surfaces the reason.
- The reach ledger counts only what actually landed.
- Nothing calls the fan-out inline from a server action any more (source-level
  assertion — this bug class has now appeared three times).

**Shots owed:** none.
**New routes:** the drain cron.

---

## B34 — The repriced economy: 1,000 CP = $0.10, every action capped, 500 a day

**This item supersedes the numbers in B16 and B17. B16 still builds the model
and the calculator; B17 still builds the enforcement. B34 is the decision about
what the numbers are.**

> **Re-verified against the code before repricing.** All four load-bearing facts
> hold: `DEFAULT_CP_PER_DOLLAR = 1000` (`lib/marketplace.ts:40`);
> `ACTION_CATALOG` carries 19 actions, 10 with a `defaultCap` and 9 without; the
> capped ten sum to exactly **1,255 CP/day**
> (75+100+100+60+150+60+100+500+60+50); and the award path credits every active
> quest whose `actionWeights[actionKey] > 0`, checking `quest.dailyCaps` **per
> quest**, so one action can pay N times and the cap is per quest rather than
> per action. One naming correction: the function is **`awardQuestAction`**
> (`lib/quests.ts:240`), not `awardAction` — corrected throughout this document.

### B34.0 The decision, and why

Three changes, taken together:

1. **1,000 CP = $0.10.** `DEFAULT_CP_PER_DOLLAR` goes from `1000` to `10000`.
2. **Every action is capped**, including the nine that never were.
3. **A hard ceiling of 500 CP per gamer per day**, across every action and every
   quest.

The result is that a gamer who does *everything we want, every day, at the
maximum* costs us **$0.05 a day**. A hundred days of that is $5 — and a hundred
consecutive days of maximum engagement is a retention outcome any gaming company
would take. The point of this pricing is that our worst case and our best case
are the same event.

Compare with where it stands today: 1,255 CP/day at 1,000 CP = $1 is **$1.26 per
gamer per day**, or $1.26M/day at a million gamers, plus an unbounded tail from
the uncapped actions. The repricing takes the worst case down by **25×** and
removes the tail entirely.

Sanity check in the other direction, because a currency that costs nothing is
also worth nothing: 20 ad impressions pay 20 CP = **$0.002**. At even a $0.50
CPM those impressions earn more than $0.01. **CP paid for attention is roughly
5× covered by the revenue that attention generates**, which is the test the
original `cpPerDollar` comment set and the only one that matters.

### B34.1 The table

Every action capped. Weights reduced. Rare and hard actions pay more and cap at
one; grindable actions pay little.

| Action | CP | Cap/day | Max/day | Quest |
|---|---|---|---|---|
| `win_challenge` | 100 | 1 | 100 | conquest |
| `best_profile_award` | 100 | 1 | 100 | orbit |
| `top3_challenge` | 50 | 1 | 50 | conquest |
| `connect_account` | 50 | 1 | 50 | ascension |
| `bot_added` | 50 | 1 | 50 | signal |
| `finish_challenge` | 25 | 2 | 50 | conquest |
| `redeem_trophy` | 25 | 1 | 25 | ascension |
| `botlist_vote` | 15 | 2 | 30 | signal |
| `join_challenge` | 10 | 2 | 20 | conquest |
| `stat_levelup` | 5 | 4 | 20 | ascension |
| `ad_impression` | 1 | 20 | 20 | signal |
| `profile_vote_received` | 3 | 5 | 15 | orbit |
| `join_planet` | 10 | 1 | 10 | orbit |
| `gift_sent` | 10 | 1 | 10 | orbit |
| `gift_received` | 10 | 1 | 10 | orbit |
| `follower_gained` | 2 | 5 | 10 | orbit |
| `profile_views_25` | 2 | 5 | 10 | orbit |
| `reaction_received` | 1 | 10 | 10 | orbit |
| `ad_click` | 2 | 5 | 10 | signal |
| `write_post` | 3 | 3 | 9 | orbit |
| `write_comment` | 1 | 5 | 5 | orbit |
| `reaction_given` | 1 | 5 | 5 | orbit |
| `message_new` | 1 | 5 | 5 | orbit |
| | | | **624** | |

**624 is the sum of the per-action caps; 500 is what anybody can actually be
credited.** Both numbers are true and they mean different things. The per-action
caps shape *behaviour* — what is worth doing, and how often. The 500 ceiling is
the *guarantee*, and it holds no matter what the per-action numbers are set to
later. Nobody wins a challenge, places top three and takes Best Profile on the
same day, so the gap is theoretical — but the guarantee must not depend on that.

Every number here is editable in B16's calculator. **The ceiling is editable
too, and it is one number**, which is what makes the policy auditable rather
than twenty numbers that have to be re-summed every time one moves.

### B34.2 CP is awarded once; progress counts everywhere

`awardQuestAction` currently credits **every quest listening to an action**, with the
cap stored per quest — so pointing two quests at `ad_impression` doubles both
the payout and the ceiling. That is a silent multiplier on cost.

**Split the two ideas:**
- **CP is awarded once per action**, against the global daily ceiling.
- **Progress is credited to every listening quest**, so one action can still
  advance two quests — which is the feature that behaviour was trying to be.

This kills the multiplier without losing anything anybody wanted.

### B34.3 The rebase question — decide it, do not discover it

Multiplying `cpPerDollar` by ten divides every existing balance's worth by ten.
**Default: do not rebase — this is pre-launch and the balances are demo data.**

If there are real balances by the time this runs, rebase them ×10 at the same
moment the rate changes, in one transaction, and say so in the CP history.
Silently devaluing somebody's balance by 10× is the kind of thing people
screenshot.

**Verification owed → `tests/db/cp-economics.mts`** (extend):
- No action lacks a cap.
- The per-action sum equals 624 for the shipped table (fixture — change it
  deliberately, not accidentally).
- A gamer credited to the ceiling gets exactly 500 and no more, whatever they do
  next.
- An action listened to by two quests pays once and progresses twice.
- `priceOf` at the new rate makes a $5 bronze trophy 50,000 CP.
- The ad economics assertion: CP paid per impression × 1,000 is less than the
  configured CPM.

---

## B35 — Anti-abuse: the caps do not stop a second account

Per-gamer caps are meaningless if gamers are free to create. One person with 50
accounts is 50 capped gamers. At the B34 numbers that is $2.50/day rather than
$63/day — **the repricing already removed most of the incentive** — but the
server-owner side is untouched by it and is where the real money is.

**Server-owner tier fraud is the one that costs.** Owners are paid 5% at 500
linked, 10% at 1,000, 25% at 5,000. That is a standing incentive to manufacture
linked members, and fake Discord accounts are cheap while a tier is worth a
share of brand spend forever.

Three defences, in order of value:

1. **A payout holding period.** No server's first payout releases until N days
   after the tier unlocks. Money that has left through Tremendous cannot be
   clawed back; a delay is the only reversal mechanism that exists.
2. **Linked-account quality, not count.** A linked account with no match
   history, no rank and a creation date inside the last week is not a member —
   it is a row. Count *qualified* linked accounts toward tiers, define qualified
   in one place, and show owners both numbers so the rule is not a secret.
3. **Account-creation velocity limits** — per IP, per Discord account age, per
   email domain. Not a wall, a friction: enough that fifty accounts is work.

> **Status.** Defences 1 and 2 and the review queue are built. **Defence 3 is
> not, and is deliberately last**: B34 already took the gamer-side incentive
> from $63/day to $2.50/day for fifty accounts, and defence 2 means those fifty
> accounts move no tier until each one has been linked a week AND proven
> ownership of a game account — which is the cost velocity limits were meant to
> impose, applied at the point where money is decided rather than at signup.
> It stays owed because it is still the cheapest way to stop the noise, but it
> no longer guards anything on its own.

Plus an admin view: servers whose linked-member growth is anomalous, so a human
can look before a payout goes out.

**Verification owed → `tests/db/abuse.mts`:**
- A payout cannot release inside the holding period, and can after it.
- An unqualified linked account raises the raw count and not the qualified one.
- Tier unlocks read the qualified count.
- Velocity limits refuse the eleventh account from one source and not the first.
- An owner sees both numbers and the rule.

**Shots owed:** `admin.abuse.review` — "Growth we look at before we pay for it".
**New routes:** an admin review page (or a tab on the existing servers page).

---

## B36 — Brands prepay: due on issue, live on creation, settled by the end

Today a brand can have a challenge run, gamers win, trophies redeem into real
cash — and then not pay. The money went out; it never came in.

> **Verified against the code, and it is worse than this said.** `buyCampaign`
> (`lib/sponsored-campaigns.ts`) creates the campaign, opens slot 0 as a
> challenge request, and **never creates an invoice at all**. Invoices are
> monthly, per brand, created by hand from `/admin/billing`, and they carry
> *game* lines derived from campaigns that are already running. So the failure
> mode is not "a brand pays late" — it is "a campaign runs, pays out prizes, and
> is never billed unless a human remembers". The first thing this item does is
> issue the invoice at the moment of purchase.
>
> **One correction to the mechanism below.** There is no separate challenge
> invoice type to retermed from 30 days to 0: `dueDateFrom(issued, 30)` is the
> monthly subscription path and stays as it is. A *campaign* invoice is a new
> thing, issued on purchase with same-day terms, and the 30-day default is left
> alone — a brand's monthly subscription and a campaign it just bought are two
> different promises and should not share a due date.

**The decided policy:**

- The invoice is **issued the moment a campaign is bought, and due that day**
  (`dueDateFrom(issued, 0)`). The monthly subscription invoice keeps its 30-day
  terms — see the correction above.
- **The challenge still goes live immediately.** We are not holding a
  community's competition hostage over a payment term, and the first campaign is
  the one where trust is being built.
- The brand has **until the end of the first challenge** to settle. That is the
  grace period, and it is stated on the invoice, not implied.
- **Unpaid at the end of the first challenge → no further challenges are
  published for that brand** until it clears. Existing ones finish; new ones
  queue. Prizes already won are always honoured — a gamer must never lose a
  prize because a brand was late.

This gives a brand a real window and gives us a hard stop before a *second*
campaign's prizes are exposed. The most we can ever lose to one bad brand is one
campaign.

Plus: an **overdue state** the brand can see in its own portal, with the amount
and the consequence, and a dunning schedule over email (B32) — issued, due,
overdue, blocked.

**Verification owed → `tests/db/prepay.mts`:**
- A challenge invoice is due on its issue date.
- The challenge publishes regardless.
- Past the first challenge's end with the invoice unpaid, publishing a new
  challenge for that brand is refused with a stated reason.
- Prizes owed from an unpaid campaign still pay out.
- Clearing the invoice unblocks publishing immediately.
- Each dunning stage sends exactly once.

**Shots owed:** `brand.invoice.due` — "Due when it is issued, and you have the
first challenge to settle it".

---

## B37 — The legal framing of the economy

Free points → trophies → real money, paid worldwide, is a prize and promotion
scheme. It needs to be written down before the first real payout, not after.

Not legal advice and not a substitute for it — this item produces the pages and
the enforcement points, and flags what a lawyer must review before launch:

- **Economy terms**, separate from the site terms: what CP is (not property, not
  transferable outside the platform, no cash value except through redemption),
  what a trophy is, how redemption works, and that we may change rates —
  including what happens to balances if we do (B34.3).
- **Eligibility**: a minimum age, stated. Countries we cannot pay into —
  sanctioned jurisdictions are a hard block, and the payout provider will refuse
  them anyway, so refusing earlier is kinder than a failed redemption.
- **Tax**: at redemption we are paying people. Thresholds vary; the US
  $600/year 1099 line is the one that arrives first. What we need is a
  per-recipient annual total, available on demand, and a stated position on who
  reports what.
- **Enforcement points in code**, not just prose: country and age captured
  before the first redemption, blocked jurisdictions refused at redemption with
  a clear reason, and the annual per-recipient total queryable.
- **A stated anti-abuse clause** — accounts may be suspended and balances
  voided for manipulation — which is what makes B35 enforceable rather than
  arbitrary.

**Verification owed → `tests/db/eligibility.mts` + `tests/ui/legal.mjs`:**
- Redemption is refused without an age and a country on file, with a reason.
- A blocked country is refused before any provider call.
- The annual per-recipient total is correct across a year boundary.
- The economy terms page renders and is linked from redeem, wallet and signup.

**New routes:** `/legal/economy`.

---

## B38 — One gamer, one account, one challenge

**The decided rule:** a gamer with two accounts on the same game may enter a
challenge with **one of them only**. They choose which. They may use the other
account on a **different** challenge. Never two accounts belonging to the same
gamer in the same challenge.

Why it matters: without it, one person occupies several podium places and takes
prizes that were meant to spread. With it, multiple accounts stay a convenience
rather than an advantage.

Two people who happen to share a household are a different matter and are not
something we can see or should try to police — this rule is about **one Cluster
account**, which is the only identity we actually know.

Implementation: at entry, if the gamer already has an entry in this challenge on
another account, refuse with a message naming the account already entered and
offering to switch **before the challenge starts** (and not after, or the switch
becomes a way to shop for the better score).

**Verification owed → `tests/db/entry-rules.mts`:**
- A second account of the same gamer is refused entry to the same challenge.
- The refusal names the account already entered.
- The same gamer may enter a *different* challenge with the other account.
- Switching is allowed before the start and refused after it.
- Two different gamers on the same game are unaffected.

---

## B39 — Stuck money: the states where a prize has nowhere to go

Every one of these ends with money in limbo and no screen that explains it.
Decide each, build the state, and make it visible to admin:

| State | Decision |
|---|---|
| Fewer entrants than podium places | Unfilled places are not paid. The prize pool returns to the sponsor's next challenge as credit, and the challenge card says so up front so nobody feels cheated. |
| A tie on the metric | The earlier submission wins. Stated in the rules before entry, because a tie-break invented afterwards is always disputed. |
| A winner deletes their account before collecting | The prize is held for a stated period, then forfeited. Deletion warns about pending prizes (B40). |
| A winner has no payout preference | The trophy is awarded and holds its value indefinitely; it simply cannot be redeemed until they set one. Nothing expires silently. |
| A redemption fails at the provider | It returns to `approved`, not to nothing, with the provider's reason visible to admin and a plain-language message to the gamer. |
| A challenge is cancelled after entries | Everyone who entered keeps their entry CP. No prize. Stated at cancellation. |

Every one of these gets an **admin view showing what is stuck, why, and the
action that unsticks it.** Money with no owner and no screen is how a support
queue becomes a spreadsheet.

**Verification owed → `tests/db/stuck-money.mts`:** one assertion per row, plus:
nothing is ever paid twice, and every terminal state is reachable from the admin
view.

---

## B40 — Deleting an account with a balance

Deletion exists (`app/settings/account`). A balance with no owner is a liability
whose owner has been erased.

**Before deletion completes, the gamer is shown, plainly:**
- their CP balance **and what it is worth in dollars**,
- their trophy case and its total value,
- any **pending prizes or in-flight redemptions**,
- and that all of it is forfeited on deletion.

With one obvious alternative offered: **redeem first, then delete.** Most people
who see the number will take it, which is the point.

Legal position stated in the economy terms (B37): CP is forfeited on deletion.
Data deletion still proceeds — this is about telling somebody what they are
giving up, not about keeping their data.

**Verification owed → `tests/ui/delete-account.mjs`:**
- The confirmation shows balance, dollar value, trophies and pending items.
- A gamer with an in-flight redemption is warned specifically about it.
- Deletion proceeds if confirmed and the balance is zeroed with a ledger entry.
- A gamer with nothing to lose is not shown a scary empty warning.

---

## B41 — The gamer homepage

`/` signed out **and** signed in is the gamers page (B23), and this is what is
on it:

1. **A gamer hero** — what this is, in their language: play the games you
   already play, earn points for free, win real money.
2. **Live challenges, every game**, with a **filter by game logo** — the same
   logo row used elsewhere, so it is recognisable rather than new.
3. **The quests section, glorified.** Every quest with its own art as the
   section background, a switcher between the four, and for the selected quest:
   every action that earns, **what each is worth, and its daily cap**, plus a
   button through to the quest itself. The caps are not fine print — they are
   part of the pitch, because "capped" is what makes "free money" credible.
4. **Missions** (B42) — the guided first week, as glorified milestone steps.
5. **Cluster on Discord** — a live preview of the bot (B28, scoped to this
   section) and a CTA to **invite Cluster to your server and earn CP** for it
   (B22).

**Verification owed → `tests/ui/home-gamer.mjs`:**
- Renders signed out and signed in, with the signed-in version showing progress.
- The game filter narrows the challenge list and shows only live challenges.
- Switching quests changes the action list, the caps and the art.
- Every CP figure uses the coin (B2) and every action shows its cap.
- The Discord preview renders live cards, not images.

**Shots owed:** `page.home.gamer`, `home.quests.section`, `home.missions`.

---

## B42 — Missions: the guided first week

`lib/quest-game.ts` already has a `StarterMissions` type — this builds on it
rather than inventing a parallel system.

**Missions are the first action of each quest, glorified into a step.** They are
one-time, ordered, and they exist because a new gamer facing four quests and
twenty-three actions does not know what to do first.

The starting set, at least one from each quest:

| Mission | Quest |
|---|---|
| Sign in with Discord | signal |
| Link your first game account | ascension |
| Join a challenge | conquest |
| See an ad | signal |
| Click an ad | signal |
| Invite Cluster to your server | signal |
| Win a challenge | conquest |
| Redeem a trophy | ascension |

Each pays CP (inside the B34 ceiling — a big first day is still capped at 500,
which is the correct behaviour and should be visible, not hidden).

**Shown in three places, with the same component:**
- the **homepage** (B41), for a gamer who has not started;
- the **quests page**, in a Missions section beside that quest's action list, so
  the relationship between "the guided step" and "the ongoing action" is obvious;
- the **feed**, showing their own progress.

**Verification owed → `tests/db/missions.mts` + `tests/ui/missions.mjs`:**
- Each mission completes on the real action, once, and never re-awards.
- Every quest has at least one mission.
- Progress is identical on homepage, quests page and feed (one read model).
- A gamer who completed a mission before it existed is credited retroactively —
  or explicitly is not, decided once and asserted, because the half-state is
  what generates support tickets.
- Mission CP respects the daily ceiling.

**Shots owed:** `gamer.missions.progress`.

---

## B43 — Welcome challenges, under admin control

Amends **B31**. Two changes, both because the owner may never finish onboarding:

1. **The draft is always visible on the admin side**, from the moment it is
   created, whether or not the owner has logged into the portal. Admin can
   **complete it** (pick the game themselves), **edit it**, or **cancel/delete
   it**.
2. **A `welcome` challenge type** — a private, server-scoped challenge admin can
   create **at any time**, for any server. So a draft cancelled because we never
   learned which games the community plays can be recreated later, when we do.

The rest of B31 holds: sponsored by the house brand, billed to Cluster like any
paying brand, prize pool per challenge set by admin, and approval still produces
a **draft** that staff edit before it publishes.

**Verification owed → `tests/db/welcome-challenge.mts`** (extend):
- An incomplete draft appears in the admin list with its state.
- Admin completing it produces the same challenge the owner's path would.
- Cancelling removes it from the portal and leaves an audit trail.
- Admin can create a welcome challenge for a server that has no draft.
- A welcome challenge is private to its server in every surface.

---

## B44 — The promotional campaigns console

Amends **B30**. The offers are **promotional campaigns we switch on and off**,
not permanent product behaviour.

- **Both off by default.** They turn on when we have raised or decided to spend,
  not when the code deploys.
- The brand offer is expressed as **a percentage of the bill**, not a fixed
  $1,000. $1,000 happens to be 100% of four weekly challenges; expressing it as
  a percentage is what lets admin dial it to 50% or 25% without redesigning the
  offer. **Placements are still billed** — the offer covers the challenge lines.
- **Admin can edit any auto-generated invoice**: the discount, the lines, the
  amounts, anything. The automation is a default, never a cage. Every edit is
  audit-logged with who and what.
- Analytics: who received which campaign, when, what it was worth, what it
  produced — brands and servers in one table.

**Funding figure:** the deck and financial model say **$100K**, not $30K. Where
any document still says $30K it is stale and gets corrected in this item — the
offer sizing argument depends on it.

**Verification owed → `tests/db/offers.mts`** (extend):
- Both campaigns off by default.
- The discount is a percentage of the challenge lines, applied as its own line,
  with placements still charged.
- Changing the percentage affects the next invoice and never a sent one.
- An admin edit survives recalculation and is audit-logged.
- No document states a funding figure other than $100K.

---

## B45 — The portal key follows ownership

Discord overwrites `owner_id` when a server is transferred. The old key keeps
working, which means the previous owner keeps access to earnings and payout
requests for a community that is no longer theirs.

**On detected ownership change: rotate the key, DM the new key to the new
`owner_id`, invalidate the old one immediately, and notify admin.** Detection
happens wherever we already read the guild — the interaction path and the
refresh job.

The rule from B4 holds and is the reason this matters: **the key goes to
`owner_id` and to nobody else, ever.** If ownership moves, so does the key.

**Verification owed → `tests/db/portal-key.mts`:**
- A changed `owner_id` rotates the key exactly once.
- The old key is refused afterwards.
- The new key is delivered to the new owner and to no other id.
- A DM failure surfaces "key undelivered" to admin rather than failing silently.

---

## B46 — Spend limits on storage and rendering

Vercel Pro raises the ceiling; it does not remove it, and B14's home card is
cached **per gamer, per state** — a cache key that invalidates whenever they
link an account or their challenges change.

- **A TTL and a cap on card renders**, with least-recently-used eviction. The
  existing `lib/storage-audit.ts` already deletes stale blobs; make it run on a
  budget rather than on demand.
- **A per-day render ceiling**, so a bug that busts the cache cannot bill us
  overnight. When it trips, serve the last good card rather than rendering.
- **A storage dashboard** on `/admin/storage` (which exists) showing what is
  held, by kind, and what the trend is.

**Verification owed → `tests/db/storage-budget.mts`:**
- Eviction removes the least recently used first and never an in-use card.
- The daily ceiling stops rendering and serves stale rather than failing.
- The audit reports by kind and the totals reconcile.

---

## B47 — The server profile becomes mandatory, and it gates the earn

**In the owner's words:** *"allow admin to email anyone manually through Resend
— either a gamer or brand or server owner. Ask owners for a contact email in
onboarding in Discord and on the portal. Make their server onboarding mandatory
for them to fill all fields to complete their server profile… a server with no
contact email shows their profile incomplete… they link 500 members, they can't
earn 5% from sponsored challenges unless they complete their profile by adding
full audience description and games played by their members and contact email."*

### B47.0 Why this is a money item, not an onboarding item

The tier table says 5% at 500 linked. This adds a second condition: **and a
complete profile.** That makes profile completeness a thing that decides whether
somebody gets paid, which puts it in the same category as B34–B37 — so it
carries its suite with it (§1.1's exception), and the reasoning is the same. A
gate that wrongly pays is cash that has already left; a gate that wrongly
withholds is a server owner who was promised 5%, hit 500 members, and got
nothing, with no explanation. Both are worse than a UI bug.

The commercial argument for the gate, which is the thing that must be true for
it to be fair: **a server we cannot describe is a server we cannot sell.** A
brand buys "PUBG players in MENA". A server with no games named, no audience
description and nobody to email is not inventory — it is a number. Asking for
three fields in exchange for a revenue share is not a hoop; it is the minimum
that makes the share possible to earn.

### B47.1 A contact email, asked for twice

`discord_guilds.contact_email`, a column rather than a field inside the
`community` JSONB: it is an operational contact, not audience data, and it needs
to be queryable ("every server we cannot reach").

Asked in **both** places an owner already is:

- **Discord**, in the setup card, as a modal — a text input cannot be a select
  menu, and `open-about|` already establishes the pattern.
- **The portal**, in the community profile editor.

Never inferred from Discord. The bot cannot read an owner's email, and guessing
one from a username would be a made-up address on a billing path.

### B47.2 "Complete" has one definition

A profile is complete when **all five** are answered: games, regions, vibes,
audience description, contact email. One definition, in
`lib/discord/community.ts`, used by the badge, the portal, the Discord card and
the earn gate — four surfaces disagreeing about what "complete" means is how an
owner ends up staring at a green tick and an empty payout.

`completeness()` already scores four of them and must now include the email.
Incomplete servers say **which** field is missing, everywhere they say they are
incomplete. "Profile incomplete" with no list is a dead end.

### B47.3 The gate

`ownerPctFor(linked)` stays exactly as it is — it answers "what does this tier
pay", and the growth ladder must keep showing an owner what 500 and 1,000 and
5,000 are worth whether or not they have filled anything in. Hiding the reward
is the wrong way to ask for the form.

A **new** `earningOwnerPct(linked, profileComplete)` answers "what do they
actually earn right now", returning 0 when the profile is incomplete. Only the
money paths use it: the billing split and what the portal says they are owed.

Consequences that must be true, or the gate is a trap:

- The portal states it **before** they hit 500, not after. An owner who finds
  out at the finish line was misled the whole way.
- The ladder shows the tier they have reached AND that it is not paying yet,
  with the missing fields listed and a link to fill them.
- Nothing already earned is clawed back. The gate decides future splits.

### B47.4 Admin can email anyone

`/admin/email` gains a compose form: pick a gamer, a brand or a server owner,
write a subject and a body, send. Through the same `sendEmail` path as every
templated message, so it is logged, it degrades identically without a key, and
it appears in the same console.

The recipient picker reads real addresses — a gamer's `users.email`, a brand's
`contactEmail`, a server's new `contact_email` — and a server with no email
**is offered but disabled, with the reason**, because "I can't email them" is
exactly the fact this screen exists to surface.

Admin-only (the `billing` system, like the rest of the console). Free-text mail
from an admin console is a phishing vector if it is loose, so: no HTML from the
composer, plain text through the standard layout, and every send logged with the
admin's id.

**Verification owed → `tests/db/server-profile.mts`** (money-adjacent, written
with the item):
- A complete profile at 500 linked earns 5%; the same server with any one field
  blanked earns 0%.
- `ownerPctFor` is unchanged by completeness — the ladder still shows the reward.
- Removing the contact email alone flips a complete profile to incomplete.
- The missing-field list names exactly the blank fields, no more.
- Already-settled earnings are not recalculated by a later gate change.
- A manual admin email is logged with its recipient kind and the admin id.
- No manual email can be sent to a server with no contact email.

**Shots owed:** `server.profile.incomplete` — "A server we cannot describe is a
server we cannot sell" — the portal's incomplete banner. `admin.email.compose` —
"Email any gamer, brand or server owner" — `/admin/email`.
**New routes:** none (both live on existing pages).

---

## B47+ — Everything added from here

This section is deliberately empty and deliberately last. Each new instruction
becomes the next numbered heading below — `## B47 — <what it is>` — written to
the same shape as B1–B46:

```
## B47 — <the instruction, in the owner's own words where possible>

<what changes, and why — including the reason it was asked for, because that
 is the thing that gets lost and the thing that decides the edge cases>

<which files, which surfaces, which existing rules it must not break>

**Verification owed → `tests/<db|ui>/<suite>.<mts|mjs>`:**
- <one line per assertion>

**Shots owed:** `<shot.key>` — <the claim it proves> — <captured from>
**New routes:** `<route>` (or "none")
```

Then its rows go into the three registries below, and only then is it built.

An instruction that is a *correction* to an earlier item still gets logged. The
earlier section is edited in place so it reads correctly, **and** the
correction goes in the amendments table below with a one-line note saying which
item it amended. A plan that quietly overwrites itself cannot be audited, and
the corrections are usually the most important lines in it.

## B48 — The marketplace has to say how you get the points

> "show navigation cards and buttons of quests in the trophy marketplace page so
> gamers know how to get it, and make the balance of CP clickable from the
> marketplace page, make the text where it says redeems for dollar amount
> bigger, glorify the look of it, and make it show the quests"

**Why it was asked for, which is the part that decides the edge cases.** B34
repriced a $5 trophy to 50,000 CP. That is a hundred days at the ceiling — far,
expensive and reachable, exactly as intended — but it turns the marketplace into
a shelf a new gamer cannot reach, and the page currently gives them nowhere to
go about it. A price with no visible path to affording it does not read as
aspiration, it reads as a wall. The shelf and the way to earn have to be on the
same screen, or the repricing lands as a product that took something away.

The redemption value is the second half of the same problem. "redeems for $50"
is set in the smallest text on the tile, under the CP price, so the number that
justifies the price is the least visible thing on the card. It is what makes a
trophy an asset rather than a sticker and it should read that way.

**What changes:**

- **The quests come to the marketplace.** Quest navigation cards on `/marketplace`
  — one per quest, with its art, what it pays and a button into it — so the
  answer to "how do I afford this?" is on the page that asked the question.
  Reuses the existing quest card rather than inventing a second one: two
  divergent renderings of the same quest is how the two screens end up
  disagreeing about what a quest pays.
- **The balance becomes a link** into `/quests`, wherever it appears on the page.
  It is the single most-looked-at number on the screen and it currently does
  nothing.
- **The redemption value is promoted** on every tile: larger, and styled as the
  claim it is, above the CP price rather than beneath it.
- **The "to go" figure earns its place** — a gamer who is short should see how
  short and where to close the gap, not only that they cannot buy.

Must not break: the CP price and the dollar value are two views of one number
(`priceOf` at the platform rate) and must keep agreeing on every tile — that
agreement is why `seedMarketplace` derives one from the other. `<Cp>` stays the
only renderer of a CP figure (B2). Nothing here changes what anything costs.

**Verification owed → `tests/ui/marketplace.mjs`:**
- Every quest with scoring actions is reachable from `/marketplace` by a link.
- The balance is an anchor to `/quests`, not a bare number.
- Every tile's dollar value and CP price agree at the platform rate.
- The redemption value renders larger than the CP price on the same tile.
- A gamer who cannot afford a trophy still sees the shortfall and a way to earn.

**Shots owed:** `gamer.marketplace.earn` — "The shelf, and how to reach it" —
`/marketplace`.
**New routes:** none.

---

## B49 — The marketplace purchase and gift experience

> "a proper modal flow, not a click that just happens… confirm the person —
> their avatar, display name and cover art — before any CP moves"

**This item ABSORBS B5, B6 and B19.** All four are the same screen: B5 is the
gift search, B6 is the redeem/marketplace stepper, B19 is the marketplace
revamp, and B49 is the checkout and gift flow. Built separately, that screen
gets redesigned four times and three of those redesigns are thrown away. They
are one band, built once. B5/B6/B19 keep their numbers and their rows — nothing
is renumbered — and each is marked "folded into B49".

**What changes:**

- **A checkout modal for buying for yourself.** What you are buying, what it
  costs, your balance before and after, one confirm. No silent purchases: today
  a click spends points with no step in between, and the first time a gamer
  notices is when the balance is different.
- **A gift flow that confirms the PERSON.** Search as you type, select, and then
  see their avatar, display name and cover art before any CP moves. Buying the
  wrong person a trophy is unrecoverable — there is no refund path and there
  should not be one, because the trophy is already on their profile.
- **A gift-sent confirmation** that names and shows who it went to.
- **It has to look like the platform**, not like a browser dialog.

**Verification owed → `tests/ui/marketplace.mjs` (extend) + `tests/db/marketplace.mts`:**
- No purchase completes without a confirm step.
- The confirm states the price, the balance before, and the balance after.
- The gift confirm shows the recipient's avatar and display name.
- Searching returns no private/blocked accounts.
- A gift lands on the recipient's profile and the sender's ledger, once.
- Balance is checked at CONFIRM, not only at open — a second tab must not let
  the same points be spent twice.

**Shots owed:** `gamer.marketplace.checkout` — "One confirm, and what it costs" —
the checkout modal. `gamer.marketplace.gift` — "Confirm the person before the
points move" — the gift confirm.
**New routes:** `/api/gamers/search`.

---

## B50 — The quest page as a how-to-play guide

> "glorify the actions and their points as a guide to playing, not a table…
> a button reveals every action with its CP value and its daily cap"

The quest page already renders `rules` — action, points, and `max N/day` — as a
plain list. This makes it the pitch: what to do, what it pays, and how often it
pays, presented as a guide rather than a schedule.

**The caps are part of the pitch, not the small print.** "Free points" is a
claim nobody believes; "free points, capped, and here is the cap" is one they
can check. B17 already computes both the cap and today's usage — **read them,
do not restate them.** A second copy of a number that B34's calculator can move
is a number that will be wrong the first time somebody moves it.

**Verification owed → `tests/ui/quests.mjs`:**
- Every action a quest listens to appears with its CP value and its daily cap.
- The figures equal what `getUserQuests` returns — no hardcoded numbers.
- An action with no cap is not shown with an invented one.

**Shots owed:** `gamer.quest.guide` — "What to do, what it pays, and how often".
**New routes:** none.

---

## B51 — The Profile of the Week band

Six changes to one component:

- **The expanded band renders the nav's background image** with a dark overlay.
  It is blank behind the winners today. **One image, shared with the nav** —
  the same rule and the same group as B10, which is why it is not a second copy.
- **Top 3 only**, with a glorified "See all" for the rest. The whole platform in
  a band is a leaderboard nobody reads; three is a podium.
- **A trophy per place, set by admin** (1st/2nd/3rd). Each top-3 profile shows
  the trophy it *would* win, replacing the generic crown and medal icons.
  Framed as **"if the week ended now"** — it must not read as already won, or
  the Sunday result reads as something being taken away.
- **Smaller cards**, so expanding does not cover the page.
- **Clicking below the band collapses it.**
- **A profile opens in a NEW TAB** (`target="_blank" rel="noopener"`). Profiles
  must never open inside the band.

**Verification owed → `tests/ui/week-band.mjs`:**
- Exactly one element paints the nav art (the B10 assertion, extended to the band).
- Three profiles, not more.
- Each shows the trophy for its place, and the copy says "if the week ended now".
- A profile link carries `target="_blank"` and `rel` containing `noopener`.
- A click below the band collapses it.

**Shots owed:** `home.week.band` — "The podium, if the week ended now".
**New routes:** none.

---

## B52 — Planet explore shows game identities

The explore list on a planet hero shows the **in-game account name**, not the
Cluster profile name. A gamer with two accounts on that game **appears twice**,
and that is correct: these are accounts, not people. Clicking one reveals their
Cluster or Discord name and links through to the profile.

**The rule, decided and written down now so it is not re-litigated:**

> **Leaderboards are per-ACCOUNT. Challenge entry is per-GAMER.**
>
> A ladder ranks accounts because that is what the game ranks — two accounts of
> one person are two positions on that game's ladder, and hiding one would make
> our board disagree with the game's own. A challenge is a prize pool, and a
> prize pool ranks people, because one person taking two podium places takes a
> prize meant to spread (B38).
>
> Different questions, different right answers. Neither is a bug in the other.

**Verification owed → `tests/db/planet-explore.mts` + `tests/ui/planet.mjs`:**
- A gamer with two accounts on a game appears twice in explore.
- Each row shows the in-game name, not the display name.
- The reveal names the Cluster profile and links to it.
- The same gamer still holds exactly one entry in a challenge on that game.

**Shots owed:** `planet.explore.accounts` — "That game's ladder, by that game's names".
**New routes:** none.

---

## B53 — Admin owns every trophy, including the ones already held

- Edit image, name, title, description — **the change propagates to every gamer
  holding that trophy.**
- Assign or change its dollar value — it becomes worth that to every holder.
- Per trophy, always visible: **who holds it, how many hold it, how many have
  redeemed it.**
- Hide-from-marketplace toggle.
- **A trophy held by at least one gamer cannot be deleted.** Everything else
  about it stays editable.

### B53.0 The hazard, located correctly

> **Corrected from the instruction.** It named `trophy_awards` snapshotting "the
> trophy's cash value at purchase time" at `schema.ts:644`. Checked before
> building: **line 644 is `marketplaceOrders`**, and **`userTrophies`
> (`schema.ts:666`) has no value column at all** — a holding carries
> `trophyId`, `placement`, `status`, and nothing about money. Value is read LIVE
> from `trophies.value` by join.
>
> So half the requirement is already free: unredeemed holdings track the trophy's
> value automatically, because they never stored one.
>
> The freeze happens somewhere else. `app/actions/trophies.ts:136` —
> `const amount = awards.reduce((s, a) => s + Number(a.value ?? 0), 0)` — writes
> `trophyRedeems.amount` at REQUEST time. That row is the money.

**The rule, therefore:**

- Editing `trophies.value` **changes what every unredeemed holding is worth.**
  That is the feature.
- It **must never move `trophyRedeems.amount`** on a row that is pending,
  approved, sent or paid. A payout whose value changes after it left is a
  reconciliation failure with a real person on the other end, and a *pending*
  request is a number a gamer has already been shown.

**Verification owed → `tests/db/trophy-admin.mts`** (money-touching, written
with the item):
- Editing name/image/description changes what every holder sees.
- Raising the value raises what an unredeemed holding is worth.
- A pending redemption's amount is unchanged by a later value edit.
- So is an approved, a sent, and a paid one — all four states.
- Lowering the value does not reduce an already-requested amount either.
- A trophy with at least one holder cannot be deleted, and the refusal says why.
- A trophy with no holders can be.
- The holder count, and the redeemed count, are correct.

**Shots owed:** `admin.trophy.holders` — "Who holds it, and what it is worth to
them".
**New routes:** none.

---

## B54 — The bot card design overhaul

A complete redesign of how every card renders. Same content, far better
display. **A card is a web page, not a poster.**

- **A fixed top strip**: branding top-RIGHT, card title or gamer identity
  top-LEFT.
- **Everything below is free space** for the body, laid out to render what a
  gamer sees on the platform.
- **Challenge and planet cards get their background image.** They are basic
  lists today. Game account cards likewise.
- **The game logo moves into the top strip, semi-transparent.** The mascot
  likewise. Both are decoration: draw over them freely, and if a card reads
  better without either, leave them out.
- **Text flow is cut off on most cards today. Fix it properly** — no fixed text
  heights (that clips descenders, and it is a known bug), clamp names, let the
  body size itself.
- **Every leaderboard and standings shows the IN-GAME NAME first**, Cluster name
  secondary. It is that game's ladder and that game's challenge; the game
  identity is the subject. (Consistent with B52.)
- **Design each card around its body content**, not around a template.

### B54.0 Sequencing, and this one matters

**B54 leads the Discord band. B3, B13, B14, B20, B27 and B28 follow it.**

If the guides or the Home card are rebuilt before the layout system is
redefined, they get built twice — once against the current template and once
against B54's. B27 is already ☑ for button *position*; its card *rendering* is
downstream of this.

**Verification owed → `tests/ui/cards.mjs` + `tests/db/cards.mts`:**
- No card clips its text at a fixed height (rendered height ≥ content height).
- Every card has the top strip, with branding right and identity left.
- Challenge and planet cards carry a background image.
- Every standings row leads with the in-game name.
- A long display name clamps rather than overflowing.
- Satori renders every card kind without throwing (the marks are divs, not SVG).

**Shots owed:** retired, not added — B28 replaces `bot.card.*` with live renders.
**New routes:** none.

---

## B55 — The platform is slow, and it always has been

Not a regression: it has been like this since day one, so it is structural.
Everyone feels it — gamers, mods in the console, server owners, brands — and
admin is the worst.

**Seven causes. All seven were checked against the file before this was written,
and two of them were not quite what the report said.** Both corrections are
recorded here rather than discovered mid-fix.

### B55.1 A badge that scans the whole message table — CONFIRMED, and worse

`app/admin/layout.tsx:40-44` calls `adminInbox()` to compute ONE number: how
many threads have anything unread. `adminInbox` (`lib/threads.ts:153`) fans out
to two queries:

- `serverThreads` → `lib/server-messages.ts:171` `inbox()`, which selects
  **every column including `body`** with `.limit(2000)` and groups in JS;
- `brandThreads` (`lib/threads.ts:175`) — **no limit at all**, joined to
  `brands`, also selecting bodies.

Megabytes over the wire, on every admin page load, to render a number. Two
`count(distinct …)` queries replace it. This is the single biggest win and it
gets worse every day the tables grow.

### B55.2 Nothing in the chrome is per-request cached except the user — CONFIRMED

`getCurrentUser` and `getSession` correctly use React `cache()`
(`lib/auth.ts:84`, `:37`). These do not: `getContent` (`lib/cms.ts:227`),
`currentAccess` (`lib/departments.ts:118`), `getStaffGrants`
(`lib/permissions.ts:12`), `countPendingRequests`
(`lib/challenge-requests.ts:145`), `adminInbox` (`lib/threads.ts:153`).

`getContent` alone runs **five times per render** — `app/layout.tsx:37`,
`app/layout.tsx:86`, `components/Nav.tsx:108`, `components/Footer.tsx:16`,
`components/FloatingOrbs.tsx:23` — five separate reads of the same
`platform_settings` table.

### B55.3 Every query is its own HTTPS round trip — CONFIRMED

`lib/db/index.ts:884` uses `drizzle-orm/neon-http`: no pooling, no pipelining.
Each query is a fresh HTTPS request. **This is not fixed by swapping the
driver** — it is fixed by making fewer queries, which is what B55.1 and B55.2
do. Anything still sequential that could be `Promise.all` goes with them.

### B55.4 The admin layout re-runs on every tab — CORRECTED

The report says `headers()` at `app/admin/layout.tsx:72` forces the layout
dynamic, and that removing it makes tab switching instant.

**`headers()` is not the only thing making it dynamic.** Line 21 calls
`getCurrentUser()`, which reads `cookies()` — and an admin layout must know who
you are, so it cannot stop. Removing `headers()` alone therefore does **not**
make this layout static or cacheable.

So the fix is measured, not assumed: instrument first, establish whether a
sibling navigation actually re-runs the layout, and only then decide whether
moving the check is worth it. **The guard does not weaken either way** —
`/admin/users` and `/admin/linked-accounts` stay admin-only and no department
reaches them, which `tests/db/taxonomy.mts` already asserts and which must still
pass afterwards.

### B55.5 The badges block the nav — CONFIRMED

Both counts are awaited before the rail renders. Behind `<Suspense>`, the nav
paints and the numbers arrive.

### B55.6 Planet explore pulls unbounded rows — CONFIRMED

`lib/planet-explore.ts:45` selects **every** `linked_game_accounts` row for the
game joined to `users`, with no limit; `:65` selects **every** `stat_current`
row for the game across every tracked metric, also unlimited. Both are grouped
in JS to render a short list. `app/api/planet/gamer/route.ts` limits to 60; the
page path does not.

### B55.7 Riot: ~9 uncached external calls per view — CONFIRMED, cause corrected

`rj()` (`lib/providers/riot-lol-rich.ts:9`) sets `cache: "no-store"`, so nothing
uses Next's fetch cache. One snapshot is: summoner + mastery + match-ids
(`:106-108`, parallel) + **five match details** (`:126`) + spectator = **nine
calls**, each with a 7–8s timeout.

**The "cached 6h" comment is not a lie, it is pointing at a different function.**
`matchCache` (`:88`, 6h, used at `:205`/`:240`) belongs to
`getLolMatchDetail` — the click-through view. The card path calls
`matchSummaryFor` (`:157`) → `getMatchRaw` (`:195`) **directly, with no cache
lookup at all**. There is also a `snapCache` (`:87`) at 5 minutes.

And both are **in-process `Map`s**, which do not survive between serverless
invocations. On Vercel a cold lambda has an empty cache, so most views pay all
nine calls.

This is external latency: no database change touches it. Serve the stored
`statCurrent` snapshot immediately and refresh in the background (the sync cron
exists), or put the rich card behind `<Suspense>` so the profile paints without
waiting on Riot. **A gamer must never stare at a blank card while we talk to
Riot nine times.**

### B55.8 Measurement is part of the item

A performance fix with no before/after is a claim, not a result. Query count and
wall time are recorded for a representative page on every surface — public,
feed, admin, brand portal, server portal — before and after, and the numbers go
in the commit message. **B55.6 and B55.7 are measured separately from the
page-render fixes**, because they have different causes and it must be visible
which change bought which improvement.

**Verification owed → `tests/db/perf.mts` + the existing suites:**
- The unread badge issues a bounded number of queries and reads no message body.
- `getContent` called five times in one render issues one query.
- Planet explore is bounded however many accounts exist.
- **`tests/db/taxonomy.mts` still passes** — caching is exactly the kind of
  change that builds cleanly and breaks an authorization boundary.

**Shots owed:** none.
**New routes:** none.

---

### Amendments

| Amends | The instruction | What changed |
|---|---|---|
| B4.2, B4.3 | "keep administrator always win" | The Administrator permission was a pre-designation fallback that stopped applying once the owner designated specific roles. It is now an unconditional grant: designation only ever adds people. The guard's first two branches are permanent by construction, and `tests/db/bot-admin.mts` asserts an administrator passes both before and after a designation they do not hold. |
| B7, B8 | "placeholder for the screenshot images everywhere empty till it's done later" | The shot plumbing moves to wave 1 and slots are placed as pages are touched, visibly empty. Capture still happens once, in V1, after Part I closes. |
| B23 | "remove the content translation task for now" | Localization parked as B24; the machinery stays, the footer switch goes. |
| B16, B17 | "make the caps aggressive… total of 500 per gamer per day… 1,000 CP worth $0.10" | Superseded by **B34**, which carries the decided table, the global ceiling and the reasoning. B16/B17 still build the model and the enforcement. |
| B30 | "admin can reduce this number… as percent of the bill… by default they're off" | **B44**: the offers become promotional campaigns expressed as a percentage of the challenge lines, off by default, with every auto-generated invoice fully editable. |
| B31 | "admin can edit it or delete it… create a challenge type called welcome challenge" | **B43**: the draft is admin-visible from creation regardless of owner onboarding, and a `welcome` challenge type can be created for any server at any time. |
| §1.1 | "implement your recommendation for all 3 insights" | Money-touching items (B33–B37, B39) now carry their suites; B28 gains a static fallback; wave 1 slot placement avoids the pages B23 rewrites. |
| the deck | funding is $100K, not $30K | Corrected in **B44**; every stale $30K reference is part of that item. |
| §1.1, V1 | the capture pass ran in wave 1 | **The 28 screenshots now in `public/shots/` are PROVISIONAL.** The capture was run early, against a wave-1 build, which is a deviation from §1.1's ordering. The reason that rule exists is directly ahead in the queue: **B23** rewrites `/`, `/pricing`, `/servers`, `/discord-bot`, `/brands` and `/blog`, so every full-page shot of those is a picture of copy that will not exist; **B41** replaces the homepage entirely; **B2** puts the coin on every CP figure; **B27** changes the button layout on every bot card; **B34** reprices the currency, so every dollar figure in a shot changes; and **B28** retires the `bot.card.*` rows in favour of live renders. A **full recapture is owed** once Part I closes — see V1.R. Until then the stale shots stay: they are not recaptured piecemeal, and the capture script is not re-run at the end of each wave. |
| B34, B18 | "make the marketplace show the quests… make the balance clickable" | **B48.** The repricing made the shelf unreachable for a new gamer and the page offered no path off it. The quests, the balance link and the promoted redemption value are that path. |
| B36 | — (found while building) | `buyCampaign` never created an invoice, so a campaign could run and pay out prizes and never be billed unless a human remembered. B36 now issues the invoice at purchase; the "retermed challenge invoice" it described did not exist. |
| B38 | — (found while building) | The uniqueness was ALREADY enforced: `cp_challenge_user_idx` is unique on (challenge, user), so a second account never could enter. What was missing was the telling and the switch — the web join action discarded its result entirely, so a gamer who picked their smurf got silence and a standing on the other account. B38 is now the disclosure and the before-the-start switch, not the constraint. |
| B5, B6, B19 | "a proper modal flow, not a click that just happens" | **Folded into B49.** All four are the same screen; built separately it would be redesigned four times. Numbers and rows kept, nothing renumbered. |
| B53 | the hazard was mislocated | The instruction named `trophy_awards` snapshotting value at `schema.ts:644`. Line 644 is `marketplaceOrders`; `userTrophies` (`:666`) has **no value column** and reads `trophies.value` live. The real freeze is `trophyRedeems.amount`, written at `app/actions/trophies.ts:136`. B53.0 carries the corrected rule. |
| B3, B13, B14, B20, B27, B28 | "B54 must lead the Discord band" | **B54 is now first in wave 3** and the rest follow it. Rebuilding a card before the layout system is redefined builds it twice. |
| B29 | rescoped | Already honoured in practice: `/admin/shots`, `/admin/email`, `/admin/cp-calculator` and `/admin/growth-review` all carry a `system:` key in `lib/admin-nav.ts`. What remains is the AUDIT and the assertion, not a retrofit. |
| V0.1 | ".scratch holds twelve legacy suites, ~390 assertions" | **Checked: they are not there.** `.scratch/` holds 72 files; none of the twelve named exist, and the 33 scripts present carry **zero** `ok()`/`eq()` assertions — they are `console.log` probes named after build items. Nothing was at risk. `tests/run-all.mjs` + `npm test` added over the seven real suites instead. |
| B34, V0.1 | the twelve legacy suites arrived from the other container | **Correction to my own earlier finding.** `.scratch/` is gitignored, so the suites lived only in the OTHER session's container and were never in this clone — my report ("only my own probes here") was true of this machine and not of the work. Commit `1e08929` moved all twelve in: 12 new files, zero modifications (`git show --diff-filter=M` empty). Two needed fixing and neither was a product defect: `marketplace.mts`'s `grantCp` wrote `userQuestProgress.qp`, which **B34.2 stopped being the source of truth** — CP moved to the `quest_events` ledger and `getTotalCp` sums `CP_PAID` — so the wallet read zero and sixteen assertions failed behind one broken fixture. Fixed the FIXTURE, not the assertions. Three more hardcoded pre-B34 CP figures (5,000 and 200,000) now derive from `DEFAULT_CP_PER_DOLLAR`. `bot-growth.mts` needs a running server for one block; it probes and skips rather than failing. |
| B55.4 | "reading headers() forces the layout dynamic" | **Corrected before building.** True but not sufficient: `app/admin/layout.tsx:21` calls `getCurrentUser()`, which reads `cookies()`, so the layout is dynamic regardless. Removing `headers()` alone does not make it static. Measured rather than assumed. |
| B55.7 | "the comments claim matches are cached 6h — check whether that caching actually happens" | **Checked: it happens, in a function the card never calls.** `matchCache` (6h) is used only by `getLolMatchDetail`, the click-through. The card path goes `matchSummaryFor` → `getMatchRaw` with no cache lookup. Both caches are in-process `Map`s and do not survive a cold lambda. |
| B40 | "deletion proceeds if confirmed and the balance is zeroed with a ledger entry" | **Not zeroed — there is nothing left to zero.** `deleteAccount` calls `db.delete(users)` and every CP row cascades, so there is no surviving row to write a zeroing ledger entry against. The forfeiture is recorded where it can still be read: the `account.deleted` email, sent BEFORE the delete, carries the balance and its dollar value. Also found while building: `deletionImpact` fanned out with `Promise.all`, so a dead database rejected four promises and only the first was observed — the other three were unhandled rejections. It uses `allSettled` and re-throws, which keeps the fail-open behaviour and observes every leg. |
| B39 | the stated gap is closed | B39 shipped saying "the demo data exercises only three of the six states… seeding the other three is owed". `seedStuckMoney` now produces the two that carry a dollar figure and need a decision: a redemption pushed back to `approved` with the provider's reason (the same state the real failure path writes, not a new row), and a departed winner past the 90-day hold. `cancelled_with_entries` remains suite-only — cancelling a seeded challenge would remove it from every other demo screen. |
| B15 | — (found while building) | Three of the four had no emitter; the fourth (`bot_added`) has no signed-in user at its only seam and is **B22's** to wire, so B15 ships the three that could be. Also: `repriceQuests` (`lib/quests.ts:270`) was ALREADY seeding all four onto their quests with weights and caps, so the quest pages had been advertising four ways to earn that nothing could earn. The "glorify" half is priced rather than decorated — the rules panel now totals the day's caps and converts at the platform rate. On the seeded economy that reads **199 CP = $0.02 a day** for the orbit quest, which is true and is worth looking at: it is B34's numbers, stated out loud for the first time. |
| — | *(next amendment here)* | |

---

# PART II — THE VERIFICATION

**Sealed until Part I closes.** Do not write a suite here, do not capture a
screenshot here, while an instruction is still outstanding. What you *do* do
continuously is keep the three registries below current — they are written
during Part I and executed after it.

Order of execution once Part I closes: **V0** (infrastructure and the showcase
seed) → **V1** (capture every shot) → **V2** (prove every claim, delete the
unprovable ones) → **V3** (the E2E matrix, every operation for every user type)
→ **V5** (user acceptance testing — human-run, two rounds per role) → **V4**
(the report, written last because V5 feeds it).

V3 and V5 are not alternatives. V3 proves the software does what the code says;
V5 proves it does what the person who asked for it meant. They fail in different
places, which is the reason for having both.

---

## The registries

Three tables. They are the work list for everything above, and they are the
part of this document that changes most often. **Adding to them is step 2–4 of
the intake protocol (§1.2); executing them is Part II.**

### R1 — The test registry

Every suite, what it covers, and which build item owes it. Suites already
written live in `.scratch/` and are **gitignored** — V0.1 moves them into
`tests/`, which is why they appear here as owed even though they exist.

| Suite | Owed by | Asserts | State |
|---|---|---|---|
| `tests/db/money.mts` | shipped work | 65 — invoices, payouts, no payment details anywhere | written, needs migrating |
| `tests/db/publish.mts` | shipped work | 19 — approve makes a draft; the reach ledger is real | written, needs migrating |
| `tests/db/marketplace.mts` | shipped work | 45 — CP economy, gifting, wallet | written, needs migrating |
| `tests/db/ownership.mts` | shipped work | 56 — one account, one gamer | written, needs migrating |
| `tests/db/ranks.mts` | shipped work | 42 — the game's own rank ladders | written, needs migrating |
| `tests/db/taxonomy.mts` | shipped work | 40 — admin systems and departments | written, needs migrating |
| `tests/db/bot-growth.mts` | shipped work | 32 — server tiers and unlocks | written, needs migrating |
| `tests/ui/money.mjs` | shipped work | 67 — billing, payouts, the pay page | written, needs migrating |
| `tests/ui/server-owner.mjs` | shipped work | 33 — earnings, guide, tiers | written, needs migrating |
| `tests/ui/marketplace.mjs` | shipped work | 21 | written, needs migrating |
| `tests/ui/admin.mjs` | shipped work | 46 | written, needs migrating |
| `tests/ui/landing.mjs` | shipped work | 22 | written, needs migrating |
| `tests/db/spam.mts` | **B1** | audience scoping, cooldowns, kill switches, the no-floating-promise source assertion | owed |
| `tests/ui/cp-currency.mjs` | **B2** | no bare "CP" after a number; the coin renders; the nav balance; the card PNGs | owed |
| `tests/ui/bot-cards.mjs` | **B3** | every card kind renders; list cards list; the welcome grid; button limits and styles | owed |
| `tests/db/bot-flows.mts` | **B3** | the redeem and buy state machines, driven through the interaction handler | owed |
| `tests/db/bot-admin.mts` | **B4** | role sync, the three-way guard, Administrator always wins, the key goes only to `owner_id` | owed |
| `tests/ui/bot-admin-cards.mjs` | **B4** | every `srv_*` card renders and its numbers equal the web portal's | owed |
| `tests/ui/gifting.mjs` | **B5** | type-ahead resolves; a misspelling never reaches the server action | owed |
| `tests/db/gifting.mts` | **B5** | resolve by slug, name, Discord username; ambiguity; self-gift; the giver is charged | owed |
| `tests/ui/redeem-flow.mjs` | **B6** | every step; back; refresh mid-flow; totals; **no bank field on any step** | owed |
| `tests/ui/shots.mjs` | **B7** | the component renders, falls back visibly, admin-replaceable, propagates everywhere | owed |
| `tests/ui/claims.mjs` | **B8** | every claim resolves to a shot; no page carries an unproven claim | owed |
| `tests/ui/nav.mjs` | **B9** | the marketplace badge, admin-editable, mobile too | owed |
| `tests/ui/backgrounds.mjs` | **B10** | one element per background image; no duplicate paints anywhere | owed |
| `tests/ui/nav-planet.mjs` | **B11** | the badge expands instead of navigating; swapping games; open-the-planet | owed |
| `tests/ui/planet.mjs` | **B12** | live-only hero; completed section with real standings | owed |
| `tests/ui/bot-guides.mjs` | **B13** | fewer than nine guides; the CP guide's numbers equal `ACTION_CATALOG` | owed |
| `tests/ui/bot-home.mjs` + `tests/db/bot-home.mts` | **B14** | the home card, both background states, three live + four quests, the empty state | owed |
| `tests/db/quest-actions.mts` | **B15** | the new actions award on the real code path, deduped, capped; buying for yourself is not a gift; the emitters are awaited, not floated | ☑ 42 |
| `tests/db/cp-economics.mts` | **B16**, **B34** | the model against a hand-computed fixture; ~~the multi-quest multiplier~~ **the absence of one, per B34.2**; no uncapped action survives; what the calculator writes is what the engine pays | **written — 57 assertions** |
| `tests/db/caps.mts` | **B17** | past the cap the action still succeeds and awards zero, silently; the cap is shown up front; the maxed entry appears in history with its figure and its reset | **written — 18 assertions** (the UI half is covered in-browser; a `tests/ui/caps.mjs` is still owed for CI) |
| `tests/ui/wallet.mjs` + `tests/db/wallet.mts` | **B18** | dollar value correct; the ledger reconciles; no payment field in any state | owed |
| `tests/ui/bot-wallet.mjs` | **B20** | the card's figures equal `/wallet`'s; redeem completes from Discord | owed |
| `tests/ui/economy-copy.mjs` | **B21** | the loop stated in one order everywhere; every earning claim states its cap | owed |
| `tests/db/bot-attribution.mts` | **B22** | one award per guild; no account, no error | owed |
| `tests/ui/pages.mjs` | **B23**, **B24** | every consolidated page; the redirects; one footer; no language switch; every link resolves | owed |
| `tests/ui/bot-profile-card.mjs` | **B25** | three trophies max, one button per account, two accounts on one game | owed |
| `tests/db/metrics.mts` + `tests/ui/lol-card.mjs` | **B26** | a `rankLabel` always displays over its number; sorting still uses the number; no duplicate stat key on any provider | owed |
| `tests/ui/bot-preview.mjs` | **B28** | scoped per section; live renders not images; every card states its command | owed |
| `tests/db/taxonomy.mts` | **B29** | every admin route is a registered system; departments reach only what they are granted; the two admin-only paths refuse everyone | owed |
| `tests/db/offers.mts` | **B30** | off by default; the discount is its own line; totals equal lines; admin edits survive recalculation | owed |
| `tests/db/welcome-challenge.mts` | **B31** | one draft per guild; approve still produces a draft; billed to the house brand at the admin-set value | owed |
| `tests/db/email.mts` + `tests/ui/admin-email.mjs` | **B32** | no key = no-op, never throws; every template fills; webhooks update status; no key or payment detail in a subject | owed |
| `tests/db/marketplace.mts` + `tests/ui/marketplace.mjs` (extend) | **B49** (absorbs B5/B6/B19) | no purchase without a confirm; the confirm states price and balance before/after; the gift confirm shows the recipient; balance re-checked at confirm, not only at open | owed |
| `tests/ui/quests.mjs` | **B50** | every action shows its CP and its cap, read from `getUserQuests` rather than restated | owed |
| `tests/ui/week-band.mjs` | **B51** | exactly one element paints the nav art; three profiles; the trophy per place reads "if the week ended now"; profiles open in a new tab with rel=noopener | owed |
| `tests/db/planet-explore.mts` + `tests/ui/planet.mjs` | **B52** | two accounts of one gamer appear twice; rows lead with the in-game name; challenge entry stays one-per-gamer | owed |
| `tests/db/trophy-admin.mts` | **B53** | edits propagate to holders; raising the value raises unredeemed holdings; a pending/approved/sent/paid redemption's amount NEVER moves, up or down; a held trophy cannot be deleted and the ACTION refuses, not just the helper | **written — 30 assertions** |
| `tests/ui/cards.mjs` + `tests/db/cards.mts` | **B54** | no card clips text at a fixed height; the top strip is present; challenge and planet cards carry a background; standings lead with the in-game name; every card kind renders through Satori | owed |
| `tests/db/entry-rules.mts` | **B38** | a second account makes no second entry and the response names the one entered; the other account is free on a different challenge; switching allowed before the start and refused after, with the reason; the score is re-baselined; two different gamers unaffected | **written — 24 assertions** |
| `tests/db/eligibility.mts` | **B37** | redemption refused without an age or a country, with the reason; the boundary age is not off by one; a sanctioned country is refused by name; nothing is committed on a refusal; the annual total is right across a year boundary and counts the date the money moved | **written — 33 assertions** (a `tests/ui/legal.mjs` is still owed for CI; the page and its three links were browser-verified by hand) |
| `tests/db/prepay.mts` | **B36** | the invoice exists at purchase and is due that day; billed once; the challenge still opens; past the window unpaid a NEW challenge is refused with the reason; a won prize is still held and redeemable; paying unblocks; each dunning stage sends once | **written — 26 assertions** |
| `tests/db/abuse.mts` | **B35** | the hold refuses inside the window and releases after; an unknown unlock date fails CLOSED; unqualified accounts raise raw and not qualified; the stamp is one-way; a draft or cancelled payout is not a track record | **written — 27 assertions** |
| `tests/ui/marketplace.mjs` | **B48** | every quest reachable from the shelf; the balance is a link; dollar value and CP price agree on every tile; the redemption value outsizes the price | **written — 18 assertions** |
| `tests/db/server-profile.mts` | **B47** | the gate at 500 linked; completeness has one definition; the missing-field list; nothing clawed back; manual mail logged and refused without an address | **write with the item — it decides who gets paid, see §1.1** |
| `tests/db/stuck-money.mts` | **B39** | one assertion per row of the decision table; a tie is broken by entry time and is stable across reads; nothing is paid twice; every state reaches the admin view | **written — 33 assertions** |
| `tests/db/wallet.mts` | **B18** | an empty wallet is honest; the ledger RECONCILES against the wallet and against `cpWallet`; a trophy is not a points movement; a bought trophy appears once; a gift costs the receiver nothing; no payment detail in any state | **written — 42 assertions** |
| `tests/db/announce-queue.mts` | **B33** | publishing enqueues and returns; draining is idempotent; 429 reschedules; nothing fans out inline from a server action | **write with the item — money-adjacent, see §1.1** |
| `tests/db/cp-economics.mts` | **B34** | no uncapped action; the 624 fixture; the 500 ceiling holds absolutely; award once, progress twice; $5 bronze = 50,000 CP; CP per impression under the CPM | **write with the item** |
| `tests/db/abuse.mts` | **B35** | holding period blocks then releases; qualified count drives tiers; velocity limits bite | **write with the item** |
| `tests/db/prepay.mts` | **B36** | due on issue; publishes anyway; blocked after the grace window; prizes still honoured; dunning sends once | **write with the item** |
| `tests/db/eligibility.mts` + `tests/ui/legal.mjs` | **B37** | no age/country = no redemption; blocked country refused before the provider; annual totals correct | **write with the item** |
| `tests/db/entry-rules.mts` | **B38** | one account per gamer per challenge; switch before the start only | owed |
| `tests/db/stuck-money.mts` | **B39** | one assertion per stuck state; nothing pays twice | **write with the item** |
| `tests/db/account-deletion.mts` + `tests/ui/account-deletion.mjs` | **B40** | the impact numbers are the wallet's own; a payout in flight is a hard refusal with a reason; a typed word is required; the email goes BEFORE the row does | ☑ 53 + 17 |
| `tests/ui/home-gamer.mjs` | **B41** | renders both states; the game filter; quest switching with caps shown | owed |
| `tests/db/missions.mts` + `tests/ui/missions.mjs` | **B42** | one-time, per quest, identical progress in three places, capped | owed |
| `tests/db/portal-key.mts` | **B45** | rotates once on owner change; old key refused; delivered only to the new owner | owed |
| `tests/db/storage-budget.mts` | **B46** | LRU eviction; the daily ceiling serves stale rather than failing | owed |
| `tests/ui/e2e-*.mjs`, `tests/db/e2e-*.mts` | **V3** | the full matrix, per user type | owed |
| `docs/UAT/*.md` | **V5** | human acceptance, two rounds per role — not automatable, by design | owed |

### R2 — The shot registry

One row per component worth proving. The `key` is the primary key of
`feature_shots` (B7.1) and the argument to `<FeatureShot shotKey="…" />` —
**change the row, and every page claiming it updates**, which is the whole
requirement.

**State, as of wave 1:** every key below marked *captured (provisional)* has a
real image in `public/shots/`, taken during the early capture pass. Provisional
means exactly what it says — the shot exists, it is a real screenshot of a real
screen, and it is **not finished work**. B2, B23, B27, B28, B34 and B41 all
change what these show. The recapture that settles them is **V1.R**. A key with
no marker has never been captured and renders a labelled placeholder, which is
the correct state for it.

| Shot key | Proves the claim | Captured from | State |
|---|---|---|---|
| `gamer.linked.verified` | "Every account is verified against the game's own API" | profile → linked accounts, a verified LoL account | **captured (provisional)** → V1.R |
| `gamer.marketplace.shelf` | "Spend points on real trophies" | `/marketplace`, signed in with a balance | **captured (provisional)** → V1.R |
| `gamer.redeem.method` | "Cash out without giving us your bank" | `/redeem` step 2 | **captured (provisional)** → V1.R |
| `gamer.cp.ledger` | "Every point is accounted for" | the CP ledger with real entries | **captured (provisional)** → V1.R |
| `gamer.quest.map` | "Quests you actually travel" | a quest page mid-progress | **captured (provisional)** → V1.R |
| `gamer.profile.public` | "A profile worth sharing" | `/u/<slug>` on a decorated profile | **captured (provisional)** → V1.R |
| `admin.challenge.rules` | "Rules in the game's own ladder" | challenge builder, "At least Diamond I in Flex 5v5" | **captured (provisional)** → V1.R |
| `admin.payments.providers` | "Real payout rails, not promises" | `/admin/payments` | **captured (provisional)** → V1.R |
| `brand.reach.perserver` | "Counted reach, not projections" | brand portal → challenge → servers table | **captured (provisional)** → V1.R |
| `brand.invoice` | "One invoice a month, every line itemised" | brand portal → Billing | **captured (provisional)** → V1.R |
| `brand.campaign.builder` | "Buy a sponsored challenge like a media placement" | the campaign builder | **captured (provisional)** → V1.R |
| `brand.analytics.roas` | "See what it returned" | brand portal → Analytics | **captured (provisional)** → V1.R |
| `server.tier.flagship` | "Owners take 25% at 5,000 linked" | Flagship server portal → Earnings | **captured (provisional)** → V1.R |
| `server.members.winnings` | "Your members' winnings, paid to them" | server portal → the itemised list | **captured (provisional)** → V1.R |
| `server.growth.journey` | "A ladder you can see yourself climbing" | server portal → the journey to 5,000 | **captured (provisional)** → V1.R |
| `server.payout.history` | "Paid, in flight, awaiting — all visible" | server portal → Payouts | **captured (provisional)** → V1.R |
| `bot.card.welcome` | "The bot opens like a home page" | the welcome card | not captured · retired by B28 → never captured, row is deleted |
| `bot.card.challenges` | "Cards, not walls of text" | `/api/card/challenges` | not captured · retired by B28 → never captured, row is deleted |
| `bot.card.srv_earnings` | "Run your server from Discord" | `/api/card/srv_earnings` | not captured · retired by B28 → never captured, row is deleted |
| `nav.badges` | "One nav, two doors: planets and the marketplace" | the signed-in nav | **captured (provisional)** → V1.R |
| `nav.potw.expanded` | "One continuous surface" | nav + Profile-of-the-Week expanded | **captured (provisional)** → V1.R |
| `nav.planet.dropdown` | "Every game, one click from anywhere" | the nav game dropdown | not captured — placeholder |
| `planet.completed.standings` | "Every challenge settles in public" | a planet page's completed section | **captured (provisional)** → V1.R |
| `bot.guide.cp` · `bot.guide.challenges` · `bot.guide.trophies` | "The bot teaches in cards" | `/api/card/<kind>` | not captured — placeholder |
| `bot.home` | "Your whole Cluster, in one card" | `/api/card/home` | not captured — placeholder |
| `bot.card.wallet` | "Your wallet, in Discord" | `/api/card/wallet` | not captured · retired by B28 → never captured, row is deleted |
| `gamer.quest.actions` | "Every action, what it pays, what it caps at" | a quest page's action list | not captured — placeholder |
| `admin.shots.console` | "Every screenshot on the site is one row an admin owns" | `/admin/shots` | **captured (provisional)** → V1.R |
| `admin.email.console` | "Every message we send, and whether it arrived" | `/admin/email` | not captured — placeholder |
| `admin.email.compose` | "Email any gamer, brand or server owner" | `/admin/email` | not captured — placeholder |
| `server.profile.incomplete` | "A server we cannot describe is a server we cannot sell" | the server portal's incomplete banner | not captured — placeholder |
| `bot.card.challenge` | "A challenge card anyone can join from Discord" | `/api/card/planets` | **captured (provisional)** · retired by B28 → V1.R deletes it |
| `bot.card.market` | "The marketplace, inside Discord" | `/api/card/market` | **captured (provisional)** · retired by B28 → V1.R deletes it |
| `gamer.feed.dashboard` | "Build the dashboard you want to look at" | `/feed` | **captured (provisional)** → V1.R |
| `gamer.leaderboard.rank` | "Ranked against everyone who plays it" | `/leaderboards` | **captured (provisional)** → V1.R |
| `gamer.planet.page` | "A planet per game, with its own world" | `/planets` | **captured (provisional)** → V1.R |
| `server.earnings.ledger` | "Every line itemised" | `/servers/demo-guild-nebula-1?key=DEMO-DNEBULA1` | **captured (provisional)** → V1.R |
| `gamer.quest.signal` | "Bring us a server, get paid for it" | the signal quest | not captured — placeholder |
| `gamer.cp.capped` | "Capped, and told plainly" | the CP history, maxed entry | not captured — placeholder |
| `gamer.wallet` · `gamer.wallet.ledger` | "Your points, your trophies, what they are worth" | `/wallet` | not captured — placeholder |
| `gamer.economy.loop` | "Free points → trophies → real money" | the explainer | not captured — placeholder |
| `admin.cp.calculator` | "Every point we give away, modelled before we give it" | `/admin/cp-calculator` | not captured — placeholder |
| `gamer.cp.capped` | "Capped, and told plainly" | `/quests`, today’s limits above the history | not captured — placeholder |
| `gamer.marketplace.earn` | "The shelf, and how to reach it" | `/marketplace` with the quest cards | not captured — placeholder |
| `gamer.wallet` | "Your points, your trophies, what they are worth" | `/wallet` | not captured — placeholder |
| `gamer.wallet.ledger` | "Every point accounted for" | `/wallet`, the movement list | not captured — placeholder |
| `admin.stuck.money` | "Every prize has somewhere to go, or a reason it does not" | `/admin/stuck` | not captured — placeholder |
| `admin.abuse.review` | "Growth we look at before we pay for it" | `/admin/growth-review` | not captured — placeholder |
| `brand.invoice.due` | "Due when it is issued — you have the first challenge to settle" | the brand portal, blocked banner | not captured — placeholder |
| `gamer.marketplace.checkout` | "One confirm, and what it costs" | the checkout modal | not captured — placeholder |
| `gamer.marketplace.gift` | "Confirm the person before the points move" | the gift confirm | not captured — placeholder |
| `gamer.quest.guide` | "What to do, what it pays, and how often" | a quest page, actions revealed | not captured — placeholder |
| `home.week.band` | "The podium, if the week ended now" | `/`, band expanded | not captured — placeholder |
| `planet.explore.accounts` | "That game's ladder, by that game's names" | a planet hero | not captured — placeholder |
| `admin.trophy.holders` | "Who holds it, and what it is worth to them" | `/admin/trophies` | not captured — placeholder |
| `page.servers.hero` · `server.tiers.three` | the server-owner argument | the consolidated server page | not captured — placeholder |
| `page.brands.hero` · `brand.tiers.three` | the brand argument | `/for-brands` | not captured — placeholder |
| `page.pricing.switch` | "Brands pay. Owners earn." | `/pricing` | not captured — placeholder |
| `page.home.gamer` | the gamer argument | `/` | not captured — placeholder |
| `bot.card.profile` | "Your trophies and every account, on one card" | `/api/card/profile` | **captured (provisional)** · retired by B28 → V1.R deletes it |
| `gamer.lol.card` | "Your rank, in the game's own words" | a profile's LoL account card | **captured (provisional)** → V1.R |
| `admin.offers.console` | "Every founding offer, switchable and counted" | `/admin/offers` | not captured — placeholder |
| `brand.invoice.discount` | "The full price, and what we covered" | a discounted invoice | not captured — placeholder |
| `server.welcome.draft` | "Your first challenge is already waiting" | the portal's Challenges tab | not captured — placeholder |
| `admin.welcome.ledger` | "What we spent to grow, on the same bill as everything else" | Cluster's brand invoice | not captured — placeholder |
| `admin.email.console` | "Every message we send, and whether it arrived" | `/admin/email` | not captured — placeholder |
| `admin.abuse.review` | "Growth we look at before we pay for it" | the server review page | not captured — placeholder |
| `brand.invoice.due` | "Due when it is issued — you have the first challenge to settle" | a challenge invoice | not captured — placeholder |
| `home.quests.section` · `home.missions` | "Free points, capped and stated" | `/` | not captured — placeholder |
| `gamer.missions.progress` | "Your first week, one step at a time" | the feed | not captured — placeholder |
| `server.profile.incomplete` | "A server we cannot describe is a server we cannot sell" | the portal's profile form, incomplete | not captured — placeholder |
| `admin.email.compose` | "Email any gamer, brand or server owner" | `/admin/email`, composer open | not captured — placeholder |
| `admin.cp.calculator` | "Every point we give away, modelled before we give it" | `/admin/cp-calculator` | not captured — placeholder |
| *(add a row per B47+ item that anyone can see)* | | |

**B28 retires rows**: anywhere a page demonstrates a bot card, the live render
from `/api/card/<kind>` replaces the shot. Delete those rows when B28 lands and
say which in its commit — a shot registry with entries nothing uses is how V1
ends up capturing images no page shows.

### R3 — The surface registry

Every route that must be crawled by V3 and considered by V1. **Do not maintain
this by hand** — generate it, so a page added in B9 cannot be forgotten:

```bash
find app -name page.tsx | sed 's|^app||; s|/page.tsx$||; s|^$|/|' | sort
```

106 routes today, plus what Part I adds: `/wallet`, `/for-brands`, `/contact`,
`/admin/cp-calculator`, `/admin/offers`, and the redirects standing in for
`/servers`, `/discord-bot` and `/brands`. Regenerate rather than edit — that is the point of
generating it.

The registry is that list plus, per route, three facts kept
in `tests/lib/surfaces.mjs`: **who can reach it** (visitor / gamer / owner /
brand / staff / admin), **whether it makes a claim** (→ needs a shot), and
**whether it is dynamic** (needs a seeded id from the showcase seed).

Two standing rules the generated list must respect, both already enforced in
`lib/systems.ts` and both re-asserted in V3.5:

- `/admin/users` and `/admin/linked-accounts` are **admin-only**. No staff
  department may reach the gamer directory or the linked-account list, ever.
- `/admin/payments` is admin-only.

---

## V0 — Test infrastructure and the showcase seed

### V0.1 Move tests out of `.scratch/`

`.scratch/` is **gitignored**. Every test written so far is invisible to the
repo, which is why V0.1 exists.

Create `tests/` at the repo root, committed:

```
tests/
  README.md              ← how to run them, what each covers, the traps above
  lib/
    harness.mjs          ← tap(), ok(), login helpers, screenshot helpers
    seed-showcase.mts    ← the demo dataset described in 0.2
  db/                    ← *.mts, run with `npx tsx`, DEMO_DB=1, no browser
  ui/                    ← *.mjs, run with `node`, playwright-core
  shots/                 ← *.mjs, capture-only runs (V1)
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

### V0.2 The showcase seed — the single biggest enabler in this plan

You cannot screenshot "a server at 5,000 linked members earning a payout" if
no such server exists. **Every screenshot in V1 is only as good as this
dataset**, which is why the seed is the first thing Part II builds.

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

## V1 — The capture pass

Every shot in R2, captured from the seeded demo, in one run.

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

Run order matters: capture **after** V0's showcase seed exists and **after**
every B item is built, because a shot of a screen that B9 later changed is
worse than no shot — it is a confident lie about the product.

Then load them: `/admin/shots` bulk-imports the manifest, so the capture run
and the live site share one source of truth.

### V1.R — The recapture, which is the one that counts

**A capture pass already ran, in wave 1.** It built the machinery
(`scripts/capture-shots.mjs`, `lib/shots.ts`, `<FeatureShot>`, `/admin/shots`)
and left 28 images in `public/shots/`. Those images are **provisional**. They
are pictures of a wave-1 product and most of them are already wrong by the time
Part I closes.

So V1's real job is a **recapture**, not a first capture:

```bash
npm run build
DEMO_DB=1 npx next start -p 3031
node scripts/capture-shots.mjs          # every key, or name keys to redo some
```

Three rules for that run, each of which somebody will otherwise get wrong:

1. **Replace every bundled image.** Not the ones that look stale — all of them.
   Deciding shot-by-shot which copy changed is the judgement call the single
   pass exists to avoid.
2. **`bot.card.*` rows are DELETED, not recaptured.** B28 replaces bot-card
   screenshots with live renders from `/api/card/<kind>`, so `bot.card.profile`,
   `bot.card.market`, `bot.card.challenge` and any sibling key are removed from
   `SHOT_REGISTRY`, their rows dropped from `feature_shots`, and their files
   deleted from `public/shots/`. A live render cannot go stale; a screenshot of
   one can, which is the entire reason B28 exists.
3. **An admin's override must survive.** `seedFeatureShots` already skips any
   row whose `imageUrl` is not the bundled path, because that means somebody
   replaced it through `/admin/shots` and their version wins. **Do not remove
   that skip while doing a bulk recapture** — it is the difference between
   refreshing our own screenshots and overwriting the customer's.

**And do not recapture before then.** Not mid-item when a shot goes visibly
stale, not at the end of each wave. Capture is a single pass over a settled
product; running it three times is precisely the waste §1.1's ordering was
designed to avoid. A stale shot between now and Part I closing is expected, and
the right response to noticing one is to leave it.

New slots keep being placed as pages are touched in waves 2 and 3 — register the
key in R2 and leave the image **empty**. The placeholder is doing its job when
it is visible.

## V2 — The claim-proof pass

**The rule, and it is the most important line in this document: a claim with no
shot is either removed or made true.** Not staged, not mocked, not
"illustrative". If the product cannot demonstrate it, the website does not say
it.

Walk the claim registry built in B8.1. For each claim, one of three outcomes,
recorded in the registry:

| Outcome | What it means | What you do |
|---|---|---|
| **Proven** | A captured shot shows it working on seeded data | Wire the `shotKey`, ship it |
| **Made true** | The claim was right but the feature was thin | It becomes a new `B<n>` — Part I reopens for it (§1.4) |
| **Deleted** | The product does not do this | Remove the copy, in EN and AR, and log the deletion in V4 |

The deletions are the valuable output here. A page that claims six things and
proves six is worth more than one that claims twelve and proves nine, and the
three deletions are the only part of this pass anybody will be tempted to skip.

**Verification owed → `tests/ui/claims.mjs`** — already registered in R1; this
is where it runs.

---

## V3 — The full end-to-end test matrix

Every operation, for every user type. Each row is a real assertion in a
committed file, not a manual check.

### V3.1 Visitor — `tests/ui/e2e-visitor.mjs`

Home renders · every marketing page renders · pricing calculator computes ·
game planets load with real data · leaderboards show real gamers · a challenge
page opens · a public profile opens · a public server page opens · blog renders
· sitemap and robots · OG images render for each page type · cookie consent ·
language toggle EN↔AR · mobile at 390px with no horizontal overflow · no
console errors · every nav and footer link resolves (crawl them, do not assume).

### V3.2 Gamer — `tests/ui/e2e-gamer.mjs`

Sign up with email · sign in · sign in with Discord (mocked callback) · link a
game account for each of the six live games · a second gamer cannot link the
same account (the one-account-one-gamer rule) · ownership proof flow · sync
stats · view profile · customize profile · enter a challenge · be refused when
entry rules are unmet, with the reason in the game's own ladder terms · quest
progress and CP earning · the CP ledger · the trophy case · buy from the
marketplace · gift a trophy using search · redeem: every step · collect ·
vote for Profile of the Week · notifications · DMs · follow · feed dashboard ·
sign out.

### V3.3 Server owner — `tests/ui/e2e-server-owner.mjs`

Install callback creates the guild · portal key unlocks the portal · a wrong
key is refused and locks out after repeated misses · Overview · the tier ladder
· the earning guide and journey · Earnings: sponsored share and members'
winnings shown separately, with the not-payable statement · the itemised
per-member list · payout preference saved (**and nothing account-shaped
stored**) · payout history · request a challenge · the request appears in the
admin queue · messages to and from Cluster · the funnel · the command feed ·
the server board · the public view for somebody without the key.

### V3.4 Brand — `tests/ui/e2e-brand.mjs`

Portal key unlocks · Overview · buy challenges (the campaign builder) ·
Campaigns · Creatives: upload, replace, pause · Analytics with real
impressions and clicks · per-challenge detail: entrants, scoring, the servers
it reached · **Billing: invoice list, line items, amount due, pay** ·
the `/pay/<token>` page with no session · Appearance · Messages · sign out.

### V3.5 Staff — `tests/ui/e2e-staff.mjs`

Sign in · see only their department's rail · open a page inside their
department · be 404'd outside it · **never reach `/admin/users` or
`/admin/linked-accounts`, whatever department they are in** (this is a
standing security requirement — no department may read the gamer directory or
the linked-account list) · never reach `/admin/payments`.

### V3.6 Admin — `tests/ui/e2e-admin.mjs`

Every page in `ADMIN_NAV` returns 200 and renders its heading (drive the nav,
do not hardcode the list) · build a challenge · **approve a request → it is a
draft → edit → publish → it announces and the reach is counted** · the card
layout editor · card backgrounds · CMS text editing EN and AR · quests ·
leaderboards · trophies · marketplace · billing: create, edit lines, discount,
attach a link, send, mark paid · payouts: open, release, mark paid · redeems:
approve, release, mark paid · payment providers · Discord: servers, analytics,
broadcast, requests · the audit log records all of it · departments and roles ·
the data room builder · storage.

### V3.7 Discord — `tests/db/e2e-bot.mts`

Signature verification rejects a bad signature · every `/cluster` subcommand
dispatches · autocomplete returns options · every screen renders its card ·
every button parses back to a screen · Back returns without a new message ·
the link modal · joining a challenge · the redeem flow end to end · the
marketplace buy flow · gifting by Discord username · announcement audiences
per the B1 policy · nothing is announced for a draft.

### V3.8 Cross-cutting — `tests/db/e2e-integrity.mts`

Money reconciles across every surface (a payout's lines equal its total; a
brand's invoice equals its lines; a server's earnings equal its ledger; CP
balance equals earned minus spent) · no orphan rows · every foreign key
resolves · no page stores a payment detail (the structural
`information_schema` assertion already in `money.mts` — extend it to every
table) · every migration is idempotent (boot twice, compare).

---

## V4 — The final report

`docs/VERIFICATION_REPORT.md`, committed:

- Every operation tested, per user type, with pass/fail and the file that
  asserts it.
- Every bug found, what caused it, what fixed it, and the assertion that now
  prevents it.
- Every screenshot captured, its key, and where it appears on the site.
- Every claim on the website, and the shot that proves it.
- **Every UAT round: who ran it, what failed, what each fail became.** The
  misunderstandings are the most useful rows in the document — they are the
  places the product was right and could not say so.
- Localization is parked (B24) and what restarting it costs.
- **What is still not covered, and why.** The most useful section in the
  document, and the one there is most temptation to leave out. Anything that
  needs live Discord credentials, a real payment provider, or a real game API
  key belongs here, stated plainly.

---

---

## V5 — User acceptance testing

The automated suites in V3 prove the software does what the *code* says. UAT
proves it does what the *person who asked for it* meant. They fail differently,
which is the whole reason for having both: a suite asserts the payout page
renders and the total is right; UAT catches that a server owner looked at it and
could not tell whether they had been paid.

**Be clear about what this is: UAT is run by a human, not by me.** A model
writing and then "passing" its own acceptance test has proved nothing — it is
the same judgement that built the thing, marking its own work. What I can build
is everything around it: the scripts, the seeded environment, the recording of
results, and the fixes. The sign-off is yours.

### V5.1 The scripts

`docs/UAT/` — one script per user type, committed, in plain language, written so
somebody who has never seen the code can run it:

```
docs/UAT/
  README.md            ← how to run a session, what to record, how to report a fail
  gamer.md
  server-owner.md
  brand.md
  staff.md
  admin.md
  discord.md           ← run inside Discord, not a browser
  mobile.md            ← the same journeys at 390px
```

Every step is written as **do this → you should see this**, with a checkbox and
a notes column. Never "verify the payout page works" — that is not a test, it is
a wish. Instead:

> **12.** From the portal, open **Payouts**.
> **You should see:** what you have been paid, what is in flight, and what is
> still being counted — as three separate numbers, each with a date.
> ☐ Pass ☐ Fail — Notes: ______

Each script ends with three questions that catch what checkboxes cannot:

1. Was there any point where you did not know what to do next?
2. Was there anything you expected to find and could not?
3. Would you trust this with your money?

Question 3 is the one that matters, and it is the one that only a human can
answer.

### V5.2 The environment

UAT runs against the **showcase seed** (V0.2), on a deployed preview — not a
local server, because "it works on the machine that built it" is exactly the
failure UAT exists to catch. Credentials for each role are listed in
`docs/UAT/README.md`, and every account is fictional by construction.

### V5.3 Recording results

`docs/UAT/results/<date>-<role>.md`, committed — the filled-in script, with a
line per fail: **what was expected, what happened, and where.** Nothing else,
because a fail report that argues about the cause is a fail report nobody can
act on.

Each fail becomes one of:

| | |
|---|---|
| **A bug** | Fixed, with a regression assertion added to the suite that should have caught it. The suite missing it is itself a finding — record why it was missed. |
| **A misunderstanding** | The product is right and the person could not tell. That is a copy or design fix, not a shrug. |
| **A new build item** | It works as specified and the specification was wrong. New `B<n>`, full intake protocol (§1.2). |

### V5.4 The rounds

UAT is not one pass. Round one finds a pile; round two, after the fixes, finds
the things round one's confusion was hiding. **Two rounds minimum per role**,
and a role is signed off when a full script runs with no fails and question 3
answers yes.

Sign-off goes in the ledger, dated. That signature — not a green suite — is what
"done" means for a user-facing product.

**Verification owed:** UAT *is* the verification. What is owed here is that
every script exists, every role has been run twice, every fail is resolved into
one of the three buckets above, and every resolution is linked from
`docs/VERIFICATION_REPORT.md` (V4).

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
   rail). They are out of scope and have stayed out of scope.
7. **Commit per build item, minimum.** A single commit across several items is
   unreviewable and unrevertable.
8. **No build item is "too small to register."** If it is worth building it is
   worth one row in R1 and, if anybody can see it, one row in R2. The small
   ones are the ones that ship unproven.
9. **Do not start Part II early "just for this one bit."** The exception is how
   the ordering dies: one suite written early becomes three suites rewritten
   later, and the plan quietly reverts to testing-as-you-go against a product
   that keeps moving.
10. **Mobile: if it would break, do not ship it on mobile.** Some things do not
    belong on a 390px screen — B11's full-width expanding game world is the
    obvious one. Degrade to the existing behaviour (navigate to the planet page)
    rather than building a second interaction that has to be maintained. Do not
    spend a day making something work badly on a screen it was never for; say
    so in the commit and move on.
11. **B34's numbers are decisions, not suggestions.** The weights, the caps, the
    500/day ceiling and the 1,000 CP = $0.10 rate were chosen deliberately with
    the reasoning written in B34.0. Change them through the calculator, not by
    editing constants, and never without re-reading why they are what they are.
12. **A registry row is written in the same sitting as the instruction.** Not
    "when I get to it" — the reasoning that makes an assertion sharp is
    available for about an hour after the instruction arrives, and then it is
    gone.

---

## Definition of done

**Part I is done when:**

- Every row in the build ledger is built, typechecked, built clean, looked at
  in a real browser, committed and pushed.
- Every build item carries a `Verification owed →` block.
- Every item has its rows in R1, and every visible item its rows in R2.
- The close date is written in the build ledger.

**Part II is done when:**

- `npx tsc --noEmit` and `npm run build` clean.
- `npm run test` runs every suite in R1 green from a cold build.
- Every shot key in R2 has a captured image, and `/admin/shots` reports zero
  missing.
- Every route in R3 is covered by the V3 matrix for every role that can reach
  it — and refused for every role that cannot.
- Every marketing claim has a shot behind it, or is gone (V2).
- An admin can change any shot from `/admin/shots` and see it change on every
  page that uses it.
- **Every UAT script has been run twice by a human, every fail resolved, and
  every role signed off and dated in the ledger** (V5). A green suite is not a
  sign-off.
- `docs/VERIFICATION_REPORT.md` is written and honest — including the section
  on what is still not covered.
