# The cycle — the one loop everything serves

**Read this second. It is the spine.**

Every surface on this platform — the website, the Discord bot, the brand portal,
the server-owner portal, the admin console, the cron jobs, the public API — is
doing one of three things: **preparing a week, running a week, or closing a
week.** Nothing exists outside that loop.

If you are building a screen and cannot say which part of the cycle it serves,
it does not belong.

---

## The shape of a week

```
  MON 00:00 UTC ─────────────────────────────► FRI 00:00 UTC ──► SAT ──► SUN ──► MON
        │                                            │            │       │
      THE GUN                                    THE CLOSE     GRACE   GRACE
        │                                            │            │       │
  baselines stamped                          placements final  winners  next week
  scoring begins                             trophies awarded  paid     announced
```

**Five days of competition. Two days of grace.** The grace period is not
downtime — it is when one week is closed out and the next is loaded. During the
five days the platform largely runs itself, which is what makes the model
operable by a very small team.

---

## The three phases, and what every surface does in each

### Phase 1 — PREPARE (Sat, Sun, and continuously through the week)

| Surface | What it does |
|---|---|
| **Website** | Sells. `/` shows next week's announced challenges so gamers can join before the gun. `/brands` converts |
| **Brand portal** | Brand builds challenges, sees dates and price, pays. Draft → pending payment → paid |
| **Owner portal** | Owner sees next week's challenges and can re-announce to their server |
| **Bot** | Posts announcements to every server. Gamers join now, score later |
| **Admin** | Reviews paid challenges, sets metrics and rules, assigns trophies, presses **Announce** |
| **Cron** | Drains the post queue every 5 minutes |
| **Money** | Bills paid → vault 1 → split 50/25/25. Trophies assigned against vault 2 |

**Nothing announces itself.** Announcement is always an admin decision.

### Phase 2 — RUN (Mon 00:00 → Fri 00:00 UTC)

| Surface | What it does |
|---|---|
| **The gun** | A job stamps a baseline for every participant who joined early, **and snapshots which servers are eligible for the pool** |
| **Eligibility** | Frozen here — `linked ≥ 10` and a complete server profile. **Never re-checked mid-week.** All three KPIs stay live |
| **Sync** | Hourly. Pulls each linked account's stats, computes deltas from that participant's own baseline |
| **Website** | `/` shows live challenges, a countdown to Friday, and **the pool live** — every server, its KPIs, and the actual dollars it has earned so far |
| **Bot** | Standings cards, join cards, profile cards. Gamers join right up to the final second |
| **Brand portal** | Watches entrants and reach climb |
| **Owner portal** | Watches their standing and their live earnings climb |
| **Admin** | Watches the dashboard. Sells next week. Onboards servers |
| **Money** | Admin allocates a slice of vault 3 into this week's pool. Never automatic, never more than half the vault |

### Phase 3 — CLOSE (Fri 00:00 UTC, then Sat + Sun)

| When | Surface | What happens |
|---|---|---|
| Fri 00:00 | Sync | **A final sync runs before anything is computed.** Placements are never decided on stale data |
| Fri 00:00 | System | Placements final. Trophies awarded — podium trophies to winners, the $0 participation trophy to everyone else |
| Fri 00:00 | System | Every entrant who changed rank is told, **winners and non-winners alike** |
| **Fri** | Bot | **Winners announced once**, on every server. The card names the server each winner came from |
| Fri | Money | Prize vault moves from *unclaimed* to *green* — every dollar now sits on a gamer's profile |
| **Sat** | Bot | **Pool standings announced once**, on every server |
| Sat–Sun | Admin | Owner payouts released · redemptions approved and paid · vaults balanced |
| Sat–Sun | Website | Community challenges promoted. House daily challenges run |
| **Sat evening** | Admin | **Payment deadline** for next week |
| Sun | Admin | Next week's challenges set up and announced |
| Mon 00:00 | — | The gun. Phase 2 again |

---

## The rule that makes the cycle honest

**Every surface reads the same numbers from the same module.** There is no
second implementation of anything that decides money.

| Number | Computed once, in | Read by |
|---|---|---|
| A server's pool share | The weekly-close function | `/pool`, the owner portal, the bot's standings card, Saturday's announcement, the payout |
| Who a gamer earns for | The attribution module | Every KPI, the pool, the registry. **½ parent + ½ join, 1.0 when they are the same** |
| A gamer's challenge score | The scoring function | The board, the bot card, the brand report, the final placement |
| A challenge's price | The pricing module | Builder, invoice, website, brand portal |
| The vault split | The split module | Every vault view, every projection, every guide |

`/pool` shows what each server *would* be paid if the week ended now — computed
by **the same function that writes Friday's placements**, never by a second
implementation that could drift.

---

## What every surface owes the cycle

### The website

Public, and it is the shop window for all three audiences at once.

| Must always show | Why |
|---|---|
| This week's challenges, live, with a countdown | The product |
| **The pool, live, with real dollar amounts per server** | This is the innovation. Owners can see what they are earning while they earn it, and so can everyone else |
| The three pool KPIs, stated plainly | Owners need to know what to optimise |
| A clear line that we reward outcomes, not Discord activity | It is true, and it is why we are allowed to exist |

### The Discord bot

Every page on the website has a card. **The bot is not a companion to the
platform — for most gamers it is the entire platform.**

| Rule | |
|---|---|
| Acknowledge within **3 seconds**, always | Discord kills a slower interaction |
| Do the work in `after()` | Never in the handler |
| Every reply is a card | Consistency is the product's face |
| A decoration may never take a card down | Fence anything that can throw |
| Admin cards are **never public messages** | Only the guild owner and mapped roles |
| The **first bot click** creates an account and stamps the parent server | Permanent. `docs/12-IDENTITY.md` §3 |
| The interaction payload **contains the member object** | Membership and roles are proven free, on every press. Never poll |

### The brand portal

| Owes the cycle | |
|---|---|
| Self-serve purchase, weekly only, no date picker | Start is always the start of a week |
| Honest delivery numbers | Counted, never modelled. Reach and entrants are per challenge and deliberately double-counted across challenges |
| Visibility of their own trophies and who holds them | The trophy is the product they bought |

### The owner portal

| Owes the cycle | |
|---|---|
| Vault, pool, and **which challenges feed this week's pool** | So the owner knows exactly what to push their members toward |
| Re-announce, per challenge or all at once | The owner is our distribution |
| Community challenges | Their own competition, publicly visible, a growth loop for their server |
| Every portal page also exists as an **admin bot card** | Owners live in Discord |

### The admin console

The only surface that can move a challenge forward, and the only one that can
move money.

| Owes the cycle | |
|---|---|
| A challenges dashboard that shows **exactly what is blocking each challenge** | Unpaid · paid but not set up · set up but not announced · live · closed |
| The prize-pool guard | Trophy values must equal the prize pool. Flag over **and** under |
| Deliberate vault allocation | Never automatic, capped at half |
| Notifications on: brand signup · brand starts building · challenge paid | The admin should never have to go looking |

### The cron jobs

| Job | Cadence | Serves |
|---|---|---|
| Sync | Hourly | Phase 2 |
| Post-queue drain | Every 5 minutes | Phase 1 and 3 |
| Daily jobs | Daily | Gun stamping, close, milestones |

**A job never moves money on its own.** It computes; a human releases.

---

## The one-gamer view of the whole cycle

This is the loop the entire platform exists to produce. If a change does not
make one of these steps easier, it is not worth building.

| Step | Where | What the gamer experiences |
|---|---|---|
| 1 | Their Discord server | A card appears: a brand's challenge, on a game they play |
| 2 | The card | Press **Join** |
| 3 | The bot | Link a game account · prove ownership if the game allows · age band · country |
| 4 | The bot | *"You're in. Scoring starts Monday."* |
| 5 | The game | They play. Nothing changes about how they play |
| 6 | Bot or web | They check standings when they feel like it |
| 7 | Friday | A trophy lands on their profile — worth money if they placed, a branded collectable if they turned up |
| 8 | Friday | *"You went from Gold III to Gold I."* |
| 9 | `/redeem` | 18+: verify an email, pick a method, get paid |

Nine steps. No bracket, no schedule, no lobby, no stream, no dispute, no
attendance. **That is the entire product.**
