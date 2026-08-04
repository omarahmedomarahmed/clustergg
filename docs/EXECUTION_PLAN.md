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
| B2 | The CP coin — a currency, not a word | `components/Icon.tsx`, new `components/Cp.tsx`, ~40 call sites, `lib/cards/render.tsx`, the nav | plan v1 | ☐ |
| B3 | Bot cards — install, list cards, flows, landing layout | `lib/discord/onboard.ts`, `screens.ts`, `components.ts`, `app/api/discord/interactions/route.ts`, the card layers | plan v1 | ☐ |
| B4 | The server portal, inside Discord | new `discord_guild_roles`, `/cluster admin`, six `srv_*` card kinds, `lib/server-portal.ts` (read only) | plan v1 | ☐ |
| B5 | Gifting — search as you type, web and Discord | `components/TrophyMarket.tsx`, new `/api/gamers/search`, the bot gift flow | plan v1 | ☐ |
| B6 | Redeem and marketplace, step by step, on the web | new `/redeem`, `/marketplace` confirm step | plan v1 | ☐ |
| B7 | The screenshot system — the plumbing only | new `feature_shots`, `<FeatureShot>`, `/admin/shots` | plan v1 | ☐ |
| B8 | The claim registry and the copy rewrite | `lib/claims.ts` (new), every marketing page, `lib/cms.ts` EN+AR, deck, data room | plan v1 | ☐ |
| B9+ | **Open.** Every instruction from here lands as its own row. | — | — | — |

**Part I closed on: _______** (fill this in; until then Part II does not start.)

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

## B9+ — Everything added from here

This section is deliberately empty and deliberately last. Each new instruction
becomes the next numbered heading below — `## B9 — <what it is>` — written to
the same shape as B1–B8:

```
## B9 — <the instruction, in the owner's own words where possible>

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

### Amendments

| Amends | The instruction | What changed |
|---|---|---|
| B4.2, B4.3 | "keep administrator always win" | The Administrator permission was a pre-designation fallback that stopped applying once the owner designated specific roles. It is now an unconditional grant: designation only ever adds people. The guard's first two branches are permanent by construction, and `tests/db/bot-admin.mts` asserts an administrator passes both before and after a designation they do not hold. |
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
→ **V4** (the report).

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
| `tests/ui/e2e-*.mjs`, `tests/db/e2e-*.mts` | **V3** | the full matrix, per user type | owed |

### R2 — The shot registry

One row per component worth proving. The `key` is the primary key of
`feature_shots` (B7.1) and the argument to `<FeatureShot shotKey="…" />` —
**change the row, and every page claiming it updates**, which is the whole
requirement.

| Shot key | Proves the claim | Captured from |
|---|---|---|
| `gamer.linked.verified` | "Every account is verified against the game's own API" | profile → linked accounts, a verified LoL account |
| `gamer.marketplace.shelf` | "Spend points on real trophies" | `/marketplace`, signed in with a balance |
| `gamer.redeem.method` | "Cash out without giving us your bank" | `/redeem` step 2 |
| `gamer.cp.ledger` | "Every point is accounted for" | the CP ledger with real entries |
| `gamer.quest.map` | "Quests you actually travel" | a quest page mid-progress |
| `gamer.profile.public` | "A profile worth sharing" | `/u/<slug>` on a decorated profile |
| `admin.challenge.rules` | "Rules in the game's own ladder" | challenge builder, "At least Diamond I in Flex 5v5" |
| `admin.payments.providers` | "Real payout rails, not promises" | `/admin/payments` |
| `brand.reach.perserver` | "Counted reach, not projections" | brand portal → challenge → servers table |
| `brand.invoice` | "One invoice a month, every line itemised" | brand portal → Billing |
| `brand.campaign.builder` | "Buy a sponsored challenge like a media placement" | the campaign builder |
| `brand.analytics.roas` | "See what it returned" | brand portal → Analytics |
| `server.tier.flagship` | "Owners take 25% at 5,000 linked" | Flagship server portal → Earnings |
| `server.members.winnings` | "Your members' winnings, paid to them" | server portal → the itemised list |
| `server.growth.journey` | "A ladder you can see yourself climbing" | server portal → the journey to 5,000 |
| `server.payout.history` | "Paid, in flight, awaiting — all visible" | server portal → Payouts |
| `bot.card.welcome` | "The bot opens like a home page" | the welcome card |
| `bot.card.challenges` | "Cards, not walls of text" | `/api/card/challenges` |
| `bot.card.srv_earnings` | "Run your server from Discord" | `/api/card/srv_earnings` |
| *(add a row per B9+ item that anyone can see)* | | |

### R3 — The surface registry

Every route that must be crawled by V3 and considered by V1. **Do not maintain
this by hand** — generate it, so a page added in B9 cannot be forgotten:

```bash
find app -name page.tsx | sed 's|^app||; s|/page.tsx$||; s|^$|/|' | sort
```

106 routes today. The registry is that list plus, per route, three facts kept
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
10. **A registry row is written in the same sitting as the instruction.** Not
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
- `docs/VERIFICATION_REPORT.md` is written and honest — including the section
  on what is still not covered.
