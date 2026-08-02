# Bot operations — the staff runbook

Everything you'd actually do. Architecture lives in
[DISCORD_BOT.md](./DISCORD_BOT.md).

Nothing here needs a terminal. Every operation is a button in Mission Control.

---

## Turning the bot on (once)

In the Discord developer portal, using the app that already holds
`DISCORD_CLIENT_ID` — one application holds both the OAuth credentials and the
bot, so there is nothing extra to wire.

1. **Bot tab** → Reset Token → copy it. Shown once. Public Bot **off** while
   testing. Message Content Intent **off** and leave it off.
2. **General Information** → copy the Application ID and the Public Key.
3. **OAuth2 → Redirects** → add both:
   `https://clustergg.com/api/auth/discord/callback` (sign-in) and
   `https://clustergg.com/api/discord/installed` (install — Discord returns
   `guild_id` here, and without it the install redirect fails).
4. Add the four environment variables in Vercel for **Production and Preview**,
   then **redeploy** — env changes do not apply to an already-built deployment.
5. **Last**, set the Interactions Endpoint URL to
   `https://clustergg.com/api/discord/interactions`. Saving it makes Discord
   send a real signed request; if the public key isn't live yet Discord refuses
   to save.

**Admin → Servers & bot status** has every one of these values built from the
domain you're on, so they're always right for that deployment. Once all four
checks are green the whole setup section collapses to one line.

**If the portal won't save the URL**, open
`https://clustergg.com/api/discord/interactions` in a browser. It tells you
which variable is missing or misshapen. The usual answer is that the public key
was set but not redeployed.

---

## Registering `/cluster`

Slash commands are not automatic. **Admin → Servers & bot status → Setup →
Register commands.**

Global registration can take up to an hour to appear. Register to a single
server for instant testing, then globally at launch.

Re-run it after any change to `lib/discord/commands.ts`.

---

## Onboarding a server

Nothing to do — the install callback creates `#clustergg`, posts and pins a
guide for every topic and every quest, and DMs the owner with their growth
counter and portal key.

**If a server has the bot but no channel or guides** (usually a permissions
failure at install), use **Re-post guides** on the same page with that server's
id. If it reports posting but not pinning, the bot is missing Manage Messages —
re-invite it with the link on that page.

---

## The challenge flow, end to end

This is the loop the whole server-owner story runs on. It is verified as one
path, and the checks below are the order to follow if something is wrong.

```
owner: /cluster show:admin  →  Request a challenge  →  picks game, sets prize
   ↓
staff: Admin → Challenge requests  →  Approve
   ↓
approval creates the challenge, mints an entry key, attaches trophies,
and announces it — the key to the owner's server, the challenge to everyone else
   ↓
members: tap Join in their server (the key is already on the card there)
   ↓
standings move on every stat sync
   ↓
owner or staff end it  →  placements freeze  →  trophies land in trophy cases
   ↓
winners redeem  →  Admin → Trophy redemptions
```

**What each step needs, and what it refuses:**

| Step | Requires | Refuses |
|---|---|---|
| Request | A game we sync **and** that has a planet | Games with no provider or no planet — the challenge couldn't be scored |
| Request | Manage Server permission in Discord | Ordinary members. Running a challenge commits the server's name and the owner's money |
| Approve | The game's planet to exist | `no_planet`. Create it in Admin → Planets first |
| Join | A linked account **for that game** | `no_account`. You can't enter a Valorant challenge with a Chess account |
| Join | The entry key, outside the owning server | `locked` / `bad_key`. Inside the owning server the key is on the card and joining is one tap |
| Pause / resume / end | To be the server it **belongs** to, or staff | `forbidden`. A server it was merely also launched on is a participant, not an owner |
| End | Not already completed | `bad_state` |

**Prizes.** An owner names a monetary value; they can't pick trophy ids from a
Discord modal. Approval therefore selects trophies from our catalogue worth
roughly the pool, split 60/30/10 across the podium, preferring a trophy tagged
for that game. Staff can override in the challenge builder before or after.
Without this the winners would get a prize *description* and an empty trophy
case.

**Baselines.** A participant's stats are snapshotted the moment they join, so
only activity after joining counts. This is what stops the highest-ranked member
winning by showing up.

---

## Reviewing a request

**Admin → Discord → Challenge requests.** The badge in the rail is the count
waiting; a queue nobody can see is a queue nobody works.

Before approving, check:

- The prize is real and the owner can pay it. Our name goes on this.
- The length is sane — 7 to 14 days is where these work.
- The metric matches the game. The builder lists what we actually track.

Rejecting takes a note, and the owner sees it. Say why.

---

## Managing a server

**Admin → Discord → open a server.**

| Action | When |
|---|---|
| **DM the owner their key** | They lost it. Never paste a key into a channel |
| **Reset portal key** | It leaked. The old key stops working immediately and the owner is locked out until you send the new one — so send it in the same sitting. The new key is shown **once**, on that screen |
| **Announcements off** | The server asked for quiet, or is being disruptive |
| **Ad delivery off** | Same. Only reaches unlocked servers anyway |
| **Force unlock** | An agreed partnership, a migration, or a miscount. Records a real unlock so every downstream check behaves identically |

---

## Jobs

Vercel's plan allows one daily cron entry, so **Admin → Servers & bot status →
Operations** runs any job now rather than tomorrow. Same code the cron runs.

| Job | What it does |
|---|---|
| `challenges` | Ends challenges whose window elapsed, freezes placements, awards trophies |
| `discord-ads` | Posts one ad into eligible, opted-in servers, respecting the interval |
| `leaderboard-feed` | Posts the top of **every** active board into its game's HQ channel |

---

## Reading the numbers

- **Admin → Command centre** — every console, every live number, what needs you today.
- **Admin → Product analytics** — every metric with its definition, filterable, one printable page per metric.
- **Admin → Bot analytics** — commands, screens, latency, and per-server usage.

Two things worth watching:

**Latency.** Discord kills an interaction that isn't acknowledged in 3000 ms. A
command drifting up on the bot analytics page is an outage forming, not a
statistic. Anything past 2500 ms is flagged amber.

**Silent servers.** Bot analytics names servers that installed the bot and used
it zero times in the window. That's a churn signal that never appears in a
total. Re-post the guides, or broadcast.

---

## Incidents

**"The application did not respond."** A handler threw before the ACK. Check
Vercel runtime logs for the interaction. The fix is always the same: nothing may
be awaited before the deferred response.

**A card renders as a broken image.** Open `/api/card/<kind>?...&debug=1` — it
reports which background source was chosen, whether it resolved, how long it
took, and the failure mode. The two historical causes were a WebP reaching
Satori and a shorthand hex accent; both are handled now, but the endpoint is how
you'd find the third.

**Cards are slow.** The budget is 3200 ms card-wide. A slow remote image is the
usual cause — check what art the affected card kind pulls in Admin → Card
backgrounds.

**A server is angry about noise.** Turn off announcements for that server on
its admin page. Don't remove the bot; that loses the attribution history.

**A key leaked.** Rotate it on the server's admin page and DM the owner the new
one in the same sitting.

---

## HQ

**Admin → Discord → HQ server.** Paste our server id, review the plan — it
lists every channel and role and marks what already exists — then build. It
runs once and records which server it built.

Re-running is safe: every channel is created only if one of that name and type
isn't already there, so a second pass fills gaps rather than duplicating. Moving
HQ means changing the id and building again; the old server is left exactly as
it is, because nothing here ever deletes.

If the plan says it can't read the server, the bot isn't in it or the id is
wrong (a channel id and a server id look identical and are not).
