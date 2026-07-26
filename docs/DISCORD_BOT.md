# ClusterBot — architecture

How the bot works, for whoever maintains it next. For running it day to day see
[BOT_OPERATIONS.md](./BOT_OPERATIONS.md).

---

## The shape of it

There is no bot process. ClusterBot is **HTTP interactions inside the Next
app** — Discord POSTs to one route and we answer. No gateway, no websocket, no
`discord.js`, no always-on host, one deploy.

```
Discord ──POST──▶ app/api/discord/interactions/route.ts
                    ├─ verify Ed25519 signature   (401 if bad — non-negotiable)
                    ├─ ACK within 3 seconds
                    └─ after() → do the real work → PATCH the message
```

Proactive posts (announcements, ads, install onboarding, HQ reports) go the
other way: REST calls with the bot token, from server actions and cron.

### The two rules everything obeys

**1. Verify or 401.** Discord's developer portal refuses to save an
interactions endpoint that doesn't reject a bad signature. `lib/discord/verify.ts`
does this against the raw request bytes — the body must be read as text, because
re-serialising JSON changes the bytes the signature covers.

**2. ACK within 3 seconds or the interaction is dead.** Every handler returns a
deferred response immediately and does database and rendering work inside
`after()` from `next/server`, then PATCHes
`/webhooks/{appId}/{token}/messages/@original`. This is the single most common
way a Discord bot appears broken, and it is why no handler awaits anything
before responding.

---

## Screens: a card plus buttons

Discord embeds cannot put buttons **on** an image and cannot composite an
avatar into artwork. So every screen is:

- a **PNG card**, rendered server-side and shown as the embed image, and
- **buttons underneath**, which edit *this message* rather than posting a new one.

That in-place edit is what makes the bot feel like an app rather than a chat
log, and it's the reason `custom_id` carries the whole navigation state.

### The `custom_id` grammar

Discord gives a button 100 characters of `custom_id` and no server-side session.
So the navigation state lives in the id itself:

```
n|planet~Valorant|home                 navigate to planet Valorant, Back → home
b|home                                 go back
a|join~<challengeId>|planet~Valorant   run an action, then re-render
```

Frames are `screen~arg~arg`. The first frame is the destination; the rest are
the trail behind it. `pack()` in `lib/discord/components.ts` drops the **oldest**
trail entries first when it would overflow — losing deep history is harmless, an
unusable button is not.

### The standard tail

Every screen ends with the same four buttons, added by `tail()` in
`lib/discord/screens.ts`:

| Button | Why it's on every card |
|---|---|
| **Connect a game** | The one action that turns a viewer into a gamer. Opens the in-Discord picker — never a link out, because a browser hop is where most people stop. |
| **My profile** | Home and My profile are the *same destination*. There is no separate hub. |
| **More** | Everything that doesn't fit, so a card never has to choose between complete and readable. Also the recovery path when someone lands somewhere unexpected. |
| **Back** | The trail the button carried. |

`rows()` deduplicates by destination, so a screen adds whatever buttons it needs
and the tail quietly contributes only what's missing. Two buttons going to the
same place is the fastest way to make a card look untrustworthy.

### Modals

A Discord modal **must be the immediate response to a fresh interaction** — it
cannot be opened from a deferred edit. That's why `open-link|<game>`,
`open-key|<id>` and `open-req|<game>` are handled *synchronously*, outside the
normal nav grammar. There are exactly three, and each caps at five text inputs.

---

## The card engine (`lib/cards/`)

| File | Job |
|---|---|
| `render.tsx` | The frame and one body per card kind. Colour normalisation, the readability scrim, brand furniture. |
| `data.ts` | Turns database rows into `CardData`. No rendering here. |
| `img.ts` | Fetches and transcodes every remote image the card needs, under a deadline. |
| `cache.ts` | Content-hashed Blob storage — a card is re-rendered only when its data changed. |
| `brand.ts` | The astronaut and logo mark every card carries. |
| `layout-guide.ts` | Where each element lands per card kind, so admins can build matching seasonal art. |

### Three things that will bite you

**Satori decodes PNG and JPEG only.** Every brand asset in the repo is `.webp`,
and a WebP reaching the renderer throws *inside* the render, killing the whole
card. `img.ts` transcodes with `sharp` before anything is drawn. This cost us a
round of "only the art-less cards work".

**Absolutely positioned elements get zero size from `inset: 0`.** Satori lays
out through Yoga, which gives an empty div no size unless told. An overlay
written as `inset: 0` renders as *nothing* — silently. Every overlay in
`render.tsx` states `width: CARD_W, height: CARD_H` explicitly.

**Colours arrive in every shape CSS allows.** Alpha used to be applied by
string concatenation (`${accent}22`), which is only valid for 6-digit hex — a
legal `#f0f` became `#f0f22` and Satori threw, so anyone with a shorthand accent
had no card at all. Alpha is now `rgba()` via `alpha()`, colours are normalised
once by `safeTheme()`, and a failed render retries stripped to house colours.

### Deadlines

`CARD_IMAGE_BUDGET_MS = 3200` card-wide, `TIMEOUT_MS = 2200` per image, and
icons resolve at `maxWidth: 160`. Past the budget the card is drawn with
whatever resolved. A person who tapped a button gets a card, not a spinner that
times out in Discord's proxy.

---

## Identity

The join key is `oauth_identities` with `provider = "discord"` and
`providerUserId` = the Discord snowflake.

**Using the bot is the sign-up.** `ensureGamerForDiscord` creates the user on
first command. Sending someone to a website before they can see their own card
was the biggest drop-off in the funnel and bought nothing — the interaction is
signed and carries everything the OAuth callback would have.

`attributeMember` records which server a gamer came from, insert-if-absent, so
the first server they use the bot in gets the credit.

---

## Files

```
app/api/discord/
  interactions/route.ts   every interaction; GET is a browser-openable diagnostic
  installed/route.ts      OAuth install callback → onboarding
  install/route.ts        the invite link
  register/route.ts       slash-command registration (Bearer BOT_API_SECRET)

lib/discord/
  verify.ts        Ed25519
  config.ts        env + the permissions integer
  types.ts         interaction shapes, ButtonStyle, isGuildManager
  components.ts    custom_id grammar, button builders, dedupe
  screens.ts       every screen, the standard tail, the modals
  cards.ts         CardData → a URL Discord can show
  rest.ts          bot-token REST: channels, roles, messages, pins, DMs
  onboard.ts       install: #clustergg, guides, pins, owner DM
  announce.ts      proactive posts, with scope (only / except a server)
  guilds.ts        guild rows, attribution, command analytics
  hq.ts            builds our own server; reports from every server land there
  ads.ts           ad delivery into servers
  leaderboard-feed.ts  every board of every game, into HQ
  catalog.ts       autocomplete source, TTL-cached
  identity.ts      ensureGamerForDiscord
```

---

## Environment

| Variable | Without it |
|---|---|
| `DISCORD_PUBLIC_KEY` | `/api/discord/interactions` returns 503; the portal won't save the URL |
| `DISCORD_BOT_TOKEN` | Interactions still verify, but the bot can't post, pin, DM or create anything |
| `DISCORD_APP_ID` | Replies can't be delivered (falls back to `DISCORD_CLIENT_ID`) |
| `BOT_API_SECRET` | Only the API endpoints; every button in admin works without it |

With **none** of these set the site, admin and every existing page behave
exactly as they do today and the bot endpoints report "not configured" — the
same pattern as `blobConfigured()`.

`GET /api/discord/interactions` in a browser tells you which of these is wrong
and what to do about it, without a terminal.

---

## Permissions

`BOT_PERMISSIONS = 277025647696`. Decoded: Manage Channels, Manage Roles, Send
Messages, Embed Links, Attach Files, **Manage Messages**, **Mention Everyone**,
Read History, Add Reactions, Use Application Commands.

Manage Messages is required to *pin*. Without it `postGuides` posts fine and
every pin call 403s — silently. That bug shipped once; the number above is the
corrected one.

We deliberately do **not** request the Message Content intent. The bot cannot
read what anyone writes, which is worth saying out loud to every server owner
who asks.

---

## HQ

Our own Discord, built by the bot in one idempotent pass: 9 categories, 34 text
channels, 5 voice rooms, 10 roles, pinned starters. `lib/discord/hq.ts`.

Two things that matter if you touch it:

- **Discord lowercases and dashes channel names.** `Bug Reports` becomes
  `bug-reports`. Idempotency compares names the way Discord *stores* them
  (`sameChannelName`), or a second run duplicates everything.
- **There is no private category.** The `@everyone` VIEW_CHANNEL deny has to be
  repeated on every channel, and the `@everyone` role id equals the guild id.
  Roles are therefore created *before* staff-only channels, since those channels
  grant VIEW_CHANNEL to a role that must already exist.

---

## Out of scope, on purpose

Gateway/websocket mode · discord.js · voice · in-Discord mini-games · tournament
brackets · payment processing for gamers · the Message Content intent.
