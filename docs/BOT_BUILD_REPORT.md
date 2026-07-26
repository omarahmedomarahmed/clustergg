# ClusterGG — Discord Bot Build & Platform Pivot

**Report for Kimi** · branch `claude/clustergg-platform-build-mfkzaa`

Everything built since the bot work began, the decisions behind it, and the
bugs found along the way.

---

## 0. Headline

| | |
|---|---|
| Commits (bot era) | 20 |
| Files changed | 97 |
| Lines added | ~12,100 |
| New files | 68 |
| Existing files modified | 28 |
| New database tables | 9 |
| New idempotent migrations | 32 |
| New dependencies | **0** |

The zero is deliberate and load-bearing — see §2.

---

## 1. The pivot

Cluster started as a **gamer identity platform**: profiles, linked game
accounts, quests, challenges, trophies. It had depth and no distribution.

It is now **the engagement layer for Discord communities**. The bot is the
product; the platform is what the bot renders. Three consequences, each of
which changed real code:

1. **The headline metric changed.** The homepage led with registered accounts.
   It now leads with **reach** — the combined membership of every server
   running the bot (`lib/network.ts`). That is what a brand buys and what a
   server owner joins for. Accounts became a conversion metric underneath it.

2. **The customer changed.** A server owner is now a first-class user with
   their own portal, their own key, their own tiers and their own revenue —
   without needing a Cluster account at all.

3. **Sign-up moved into Discord.** The first `/cluster` creates the profile
   from the signed interaction. Sending someone to a website before they can
   see their own card was the largest drop-off in the funnel and bought
   nothing.

---

## 2. Architecture decisions

### A1 — HTTP interactions inside the existing Next app
No `discord.js`, no gateway, no always-on process. One endpoint
(`app/api/discord/interactions/route.ts`) verifies Ed25519 and handles slash
commands, buttons, autocomplete and modals. Proactive posts use REST with the
bot token from server actions and cron.

*Why:* a gateway bot needs a second always-on deployment. This ships with the
site.

### A2 — Every screen is "a PNG card + buttons underneath"
Discord embeds cannot put buttons **on** an image, and cannot composite an
avatar into artwork. So the visual is a server-rendered 1200×630 PNG shown as
the embed image, and navigation is button rows below it. **Pressing a button
edits the same message** rather than posting a new one — that is what makes it
feel like an app rather than a chat log.

### A3 — Zero new dependencies
`next/og`'s `ImageResponse` is vendored inside Next. `sharp` already ships with
Next for image optimisation. Ed25519 verification uses Node's `crypto`. Nothing
was added to `package.json` for any of this.

### A4 — The 3-second rule is non-negotiable
Discord kills an unacknowledged interaction after 3s. Every handler ACKs
immediately and does DB + render work in `after()` from `next/server`, then
PATCHes the real content through the interaction webhook.

### A5 — Modals are used exactly three times
Discord modals are 5-text-input forms — no images, no buttons. They are correct
for: linking a game account, entering a challenge key, and submitting a
challenge request. Everything else is embeds + buttons.

A modal **must be the immediate response to a fresh interaction** — it cannot
be opened from a deferred edit. So `open-link|`, `open-key|` and `open-req|`
are handled synchronously *before* the normal nav dispatch. This constraint
shaped the whole button grammar.

### A6 — Card caching is mandatory
Rendering per command would be slow and burn Blob transfer (already the
tightest resource). Cards are cached in Blob keyed by a content hash of the
card payload; `RENDER_VERSION` is folded into the hash so a renderer fix
invalidates everything (`lib/cards/cache.ts`).

### A7 — Vercel Hobby: 2 cron entries, daily only
A Phase-4 deploy was **rejected** for exceeding the cron limit. Jobs were
consolidated into one daily cron over a named job list (`lib/jobs.ts`), and
every job is also a button in admin — which is better anyway: staff run a job
when they need it instead of waiting for tomorrow.

---

## 3. What was built

### 3.1 The card engine — `lib/cards/`

| File | LOC | Role |
|---|---:|---|
| `render.tsx` | 715 | 9 card bodies + the shared cosmic frame |
| `data.ts` | 424 | Platform data → card payloads |
| `img.ts` | 186 | Image decode/convert/downscale pipeline |
| `layout-guide.ts` | 183 | The design guide (§3.8) |
| `guides.ts` | 178 | How-to guide content |
| `types.ts` | 146 | Card payload shapes |
| `cache.ts` | 110 | Blob-backed render cache |
| `brand.ts` | 40 | Mascot + logo resolution |
| `fonts.ts` | 48 | Optional brand TTFs |

Nine card kinds: `profile`, `game-stats`, `quest`, `cp-summary`, `leaderboard`,
`challenge`, `planet`, `planets`, `guide`.

Every card carries the **astronaut mascot** (bottom-left, behind content) and
the **real Cluster logo** (bottom-right, 104px, drawn last so nothing can cover
it). Both are admin-editable and resolved in the renderer rather than
per-loader, so a card kind added later cannot omit them.

### 3.2 The bot — `lib/discord/`

| File | LOC | Role |
|---|---:|---|
| `screens.ts` | 920 | Every screen: home, show, planet, challenge, link, admin… |
| `hq.ts` | 497 | Our own server: blueprint, build, reporting |
| `guilds.ts` | 401 | Attribution, growth counters, unlock, command logs |
| `announce.ts` | 246 | Proactive posts, scoped to servers |
| `rest.ts` | 190 | Bot-token REST: channels, roles, messages, pins, DMs |
| `ads.ts` | 150 | Ad posts into eligible servers |
| `onboard.ts` | 159 | Install: channel, guides, owner DM |
| + 8 more | | catalog, cards, commands, components, config, identity, reply, share, types, verify, leaderboard-feed |

**Command surface** — one `/cluster` with 13 subcommands: `home`, `show`,
`planet`, `leaderboard`, `challenge`, `link`, `quest`, `share`, `vote`,
`guide`, `server`, `admin`, `help`.

**Navigation grammar** (`components.ts`): the back-stack is encoded in the
`custom_id` (≤100 chars), so navigation needs no server session.

### 3.3 Server-owner economy

**Challenge requests** (`lib/challenge-requests.ts`, 278 LOC). An owner builds a
challenge in Discord — game, length, prize, trophies — and submits it. Staff
approve it, and **approval is what creates the challenge, mints the access key
and announces it**. Nothing runs under Cluster's name without a human seeing it.

**Four tiers** (`lib/server-portal.ts`), each a real capability bought with a
real number:

| Tier | Threshold | Unlocks |
|---|---:|---|
| 🌱 Seed Server | 0 | Private challenges for your community |
| 💠 Monetized | 500 | Ad revenue share |
| 📡 Broadcaster | 1,000 | Carry other servers' challenges, and get paid |
| 👑 Sponsored | 5,000 | Brand-sponsored challenges, keep the whole fee |

**The portal** — `/servers/<slug>`, key-gated, tabs for overview, challenges,
requests, activity and the server board. Public view for everyone (badges,
tier, live challenges, invite); dashboard for the key-holder.

**The funnel is measured, not asserted**: challenge view → invite click →
join, with the click going through a counted redirect (`/api/servers/invite`,
which only ever forwards to `discord.gg`/`discord.com` — it takes a parameter
and is public, so without that check it is an open redirect).

### 3.4 Server-gated challenges — a design reversal

Originally private challenges were hidden from everyone but their server. That
was **reversed on your instruction**, and it was the right call: a competition
other communities can watch but not enter is the best advertising a server
challenge has.

Now they appear everywhere a normal challenge does — homepage, planet, every
server's bot — with full standings, trophies and countdown. The restriction
moved from **looking** to **joining**:

- `liveChallenges` no longer filters by visibility
- `joinChallengeFor` takes an `accessKey`, returns `locked` / `bad_key`
- comparison ignores case and padding, because people retype keys out of chat
- `challengeGate` / `keyVisibleTo` are shared, so web and bot cannot disagree
- inside the owning server the key is on the card and joining is one tap;
  everywhere else the button opens a key modal

A private challenge can run across **several** servers (`guildIds`), each
getting the announcement and the key, each shown on the challenge page with an
invite link.

### 3.5 HQ — our own server

`/admin/discord/hq`. Point the bot at our server ID and it builds **9
categories, 34 text channels, 5 voice rooms, 10 roles**: START HERE, COMMUNITY,
FIND A GAME (`#lfg-<game>`), COMPETE, SUPPORT, GAME FEEDS (`#<game>-feed` per
planet, plus `#leaderboard-updates` and `#challenge-reminders`), REPORTS,
OPERATIONS (staff-only), VOICE.

Three properties that decide whether this is safe:

1. **Preview before execute.** Creating channels in a real server is the least
   reversible thing the bot does, so saving an ID only records an ID. The full
   plan is shown — every channel marked *exists* or *will create* — and nothing
   happens until someone presses build.

2. **Discord has no private category.** Marking a category staff-only does not
   protect the channels inside it; the deny must be repeated on every channel,
   or an ops channel carrying other servers' data is readable by anyone who
   wanders in.

3. **Roles are created before channels**, because a staff-only channel grants
   `VIEW_CHANNEL` *to* the staff role. Build channels first and the deny lands
   with nothing to grant — making the channel invisible to us too.

**Idempotency** rests on one detail: Discord lowercases and dashes text channel
names, so `Bug Reports` returns as `bug-reports`. Naive comparison would
duplicate all 39 channels on the second run. Simulated: 28 created first pass,
**0** on the second, **0** on the third, **0** after names come back lowercased.

Reporting routes by kind — installs → `#new-servers`, requests →
`#owner-requests`, a game's challenge → that game's feed, leaderboards → feed +
`#leaderboard-updates`, errors → `#errors` — each falling back to channels every
HQ has. A report with nowhere *safe* to go is dropped rather than posted where
members can read it.

### 3.6 Identity layer

`profile_votes` (web + Discord, one vote per identity, DB-enforced),
`profile_views` with source and guild, Best Profile leaderboard, per-server
analytics of views and votes. Being shown in a server **is** a profile view —
that is how a gamer gets seen, so they get credit for it.

### 3.7 Portal security

Both portals (brand and server) are unauthenticated and key-gated, which makes
the key the only thing between someone and another party's data. It was being
compared with `!==` and lived in the query string. Now (`lib/portal-auth.ts`):

- constant-time comparison over HMACs, so neither content nor length leaks
- a correct key is exchanged for an **httpOnly, per-portal session cookie** and
  dropped from the URL by redirect — out of history, logs and `Referer`
- the cookie name carries the portal ID, so one server's session cannot be
  replayed against another
- per-portal failure throttling

Every plain-comparison site was converted, including the pre-existing brand
page, brand portal actions and both brand API routes.

*Verified:* a server's key does not open another's, nor does a prefix of it, a
lowercased copy, an empty string, or a null stored key.

### 3.8 Card layout guide

`/admin/cards/guide`. Every card kind drawn **to scale** with its regions
overlaid — text areas, reserved mascot/logo corners, the top-right badge — plus
the rules that hold everywhere and a paste-ready brief per card for an artist or
an image prompt.

The guide's coordinates *are* the renderer's. Stated in the file: if a region
moves in `render.tsx` it must move here, because a guide that drifts from the
renderer is worse than no guide.

---

## 4. Bugs found and fixed

These are the ones worth recording, because most were **not** reported — they
were found by reading the code around a reported symptom.

### 4.1 Satori cannot decode WebP — every card with artwork was broken
*Reported as:* "only the auto-sent guide cards render."

Satori decodes **PNG and JPEG only**. Given anything else it throws *inside* the
render, losing the whole card rather than one image. Every piece of brand art in
`lib/assets.ts` is WebP, and `img.ts` listed `image/webp` as acceptable — so the
art was fetched, inlined, and reliably killed the card. That is exactly the
split that was reported: art → broken, no art → fine.

*Fix:* WebP, AVIF, GIF, TIFF, BMP and SVG are transcoded to PNG via sharp.
Game logos in SVG render for the first time.

### 4.2 The readability scrim never rendered at all
*Found by:* rendering the cards and looking at them.

Every overlay was positioned with `inset: 0` and no size. Satori lays out
absolutely-positioned elements through Yoga, which gives an empty div **zero
size** unless told otherwise — so the darkening layer had been a no-op since it
was written, and artwork came through at full brightness. On a bright
background the silver 2nd-place trophy label vanished entirely.

### 4.3 `slimImg` was deleting card art — twice
*Reported as:* "my custom profile doesn't show on the card."

`slimImg` caps data-URL length to keep megabytes out of page HTML. In a card
loader it is simply wrong — the renderer decodes and downscales. It was
silently discarding the background of **everyone who had customised their
profile** (a 1920×1080 upload is an 8.3 MB data URL).

I fixed the profile background and shipped. It was **still applied in nine
other places** — avatars, game logos, planet backgrounds, champion and match
icons — so the same bug persisted in the spots I had not touched. That was my
error: I fixed the reported instance instead of the class. Second pass removed
it from `lib/cards/data.ts` entirely.

### 4.4 Challenges never ended
`refreshStaleChallengeWindows` pushed end dates forward on **every boot** for
any challenge with a daily/weekly/monthly cadence. So no challenge ever expired,
no placements were frozen, and no trophy was ever awarded. Cadence now describes
how often staff intend to run a *new* one; `closeExpiredChallenges` actually
closes them.

### 4.5 The permissions integer was missing MANAGE_MESSAGES
`277025508432` grants Manage Channels, Send Messages, Embed Links, Attach Files,
Read History, Add Reactions, Use Application Commands — but **not** Manage
Messages (needed to pin) or Mention Everyone. Silent: guides post fine and every
pin 403s. Corrected to `277025647696`.

### 4.6 The growth counter undercounted
`markMemberLinked` only fires at link time, but most gamers link **before**
first using the bot in a server — so their row sat at `firstLinkedAt = null`
forever and the server was permanently undercounted. This gates the owner's
revenue, so it was the worst direction to be wrong in. `attributeMember` now
back-fills from existing accounts.

### 4.7 Game buttons hung
A game-stats card resolves an avatar, a logo, a game avatar, 5 champion icons
and 5 match icons — each with a 4s timeout, so one slow CDN held the whole card.
Now 2.2s per image, a **3.2s deadline on the entire image step** (draw what
resolved, placeholder the rest), and icons resolved at 160px rather than 1200px.

### 4.8 Owner-only actions were not gated
`setChallengeState` checked only that a challenge belonged to the guild — so
**any member** could pause their server's challenge. Now gated on Discord's own
`MANAGE_GUILD`/`ADMINISTRATOR`.

### 4.9 `requestableGames` offered games that could never be approved
Caught by the end-to-end test: an owner could fill in a form for a game with no
planet, and approval would then fail with `no_planet`. Now only games that are
active, synced **and** have a planet are offered.

### 4.10 The Discord glyph was never centred
Its artwork sits between y≈3.2 and y≈22.8 on a square 0–24 viewBox, so it
rendered low everywhere it appeared. Framed on its own bounds now.

### 4.11 Progress bars claimed 100% early
`Math.round(499/500*100)` = 100. Telling an owner they have arrived when they
have not is the one error that bar can make. Floored.

### 4.12 Two dual-driver traps
- `.returning({...})` type-mismatches across neon-http and PGlite → select-then-update everywhere.
- `??` and `||` cannot be mixed without parentheses — surfaced while removing `slimImg`.

---

## 5. Diagnostics built (rather than guessing twice)

Two problems cost multiple rounds of inferring data I could not see. Both now
have browser-openable answers:

- **`GET /api/discord/interactions`** — why Discord refuses to verify the
  endpoint. Reports which env var is missing or the wrong shape, and whether the
  deployment's own URL matches `NEXT_PUBLIC_APP_URL`. Exposes no secret values.
- **`/api/card/<kind>?...&debug=1`** — why a card's art is missing. Reports
  which background source was chosen, whether it resolved into drawable bytes,
  how long it took, and *which of those two different failures* it was.

---

## 6. Database

Nine new tables, all created through the existing self-healing migration list
(`COLUMN_MIGRATIONS` in `lib/db/index.ts`, 32 new idempotent statements run
every boot):

| Table | Purpose |
|---|---|
| `card_renders` | Blob-backed card cache, content-hash keyed |
| `discord_guilds` | Installed servers, channel, tier, portal slug + key, invite |
| `discord_guild_members` | Attribution ledger — who a server brought us |
| `discord_command_logs` | Every command and button press, with latency |
| `discord_ad_posts` | Ads delivered per server |
| `challenge_requests` | Owner-submitted challenges awaiting review |
| `server_events` | Challenge view → invite click → join funnel |
| `profile_votes` | Best Profile votes, web + Discord |
| `profile_views` | Views with source and guild |

Plus columns on existing tables: `challenges.visibility/guildId/guildIds/accessKey/announceHype`,
`ad_impressions.guildId`, `users.voteCount/discordViews`,
`challenge_participants.joinedFrom`.

---

## 7. Verification approach

Every claim in the commit log was tested before it was written. Notable:

- **Card pipeline** — real WebP/AVIF/SVG through the converter; card bytes
  compared with and without background, mascot and logo to prove they are drawn.
- **Profile art** — reproduced what the profile builder actually produces (a
  548 KB WebP data URL at 1280px from `downscale.ts`), confirmed it resolves,
  and confirmed a dead custom URL falls back to the banner rather than
  rendering bare.
- **Compression** — a photographic card is 2.4 MB as PNG; past ~900 KB it
  re-encodes to JPEG at 329 KB, while a flat graphic card stays a 51 KB PNG.
- **Gated challenges** — visible globally and on its planet; no key → `locked`,
  wrong key → `bad_key`, `" nebula7 "` → joined.
- **Request lifecycle** — submit → approve → private challenge with key; co-host
  pause forbidden, owner pause accepted, staff end works, re-approval idempotent.
- **Portal keys** — a server's key does not open another's, nor a prefix,
  lowercase copy, empty string or null stored key.
- **HQ idempotency** — 28 created first pass, 0 on second, 0 on third, 0 after
  Discord lowercases the names.

---

## 8. Open items

Not built, and honestly flagged rather than implied:

1. **Admin page consolidation** — 25+ pages into grouped command centres. The
   nav, the `AdminPage` shell (entries-first) and three new Discord pages exist;
   the remaining pages have not been converted.
2. **Per-card button semantics** — proper *back* / *more details* per card kind.
3. **In-Discord link modal on every path** — a few paths still link to the site.
4. **The two floating orbs** — Discord + quest, larger, admin-editable.
5. **Owner trophy picking in Discord** — the schema field exists; Discord modals
   cap at 5 text inputs, so it needs a button-driven selection step.
6. **Docs** — `docs/DISCORD_BOT.md` and `docs/BOT_OPERATIONS.md` are still to
   be written; this report is the interim.
7. **Nitro role icons** — the per-game role foundation is built, but assigning
   game logos to roles requires the server to be **Boost Level 2**. Worth
   confirming before pricing it.

---

## 9. Setup (what turns it on)

Four environment variables: `DISCORD_BOT_TOKEN`, `DISCORD_PUBLIC_KEY`,
`DISCORD_APP_ID` (falls back to `DISCORD_CLIENT_ID`), `BOT_API_SECRET`. Plus
`PORTAL_SECRET` for portal sessions (falls back to `CRON_SECRET`).

With **none** of these set, the site, admin and every existing page behave
exactly as before and the bot endpoints report "not configured" — the same
pattern as `blobConfigured()`. That property was maintained deliberately
throughout: the bot is additive, never load-bearing for the website.

Everything else is a button in `/admin/discord`: register commands, re-post
guides, run jobs, broadcast, send an ad, build HQ.
