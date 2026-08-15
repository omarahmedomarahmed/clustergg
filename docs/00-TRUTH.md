# ClusterGG — the ratified source of truth

**This is pivot three. It is the first one that was written down.**

Pivots one and two left no record. The cost of that was measured in August 2026:
a test suite was found enforcing a revenue ceiling nobody believed, a document
quoted an owner withdrawal floor at twice its real value, and the money-transmission
analysis behind a live compliance decision had been deleted and was unreadable.

Every rule in this file was ruled on by the owner, in conversation, on
2026-08-13. Nothing here is inherited. Nothing here was carried over from a
previous document because it "looked fine".

**The rule for the next session: if this file and the code disagree, stop and
ask. Do not reconcile them silently, and do not assume either one is right.**

---

## 1 · What we sell

**A brand buys an automated weekly gaming competition. It runs inside the Discord
servers gamers already sit in. There is no bracket, no schedule, no lobby, no
stream, no staff and no dispute — the game's own API is the referee.**

### Why this is worth money

Esports sponsorship is expensive because of everything *around* the competition:
organisers, referees, venue or production, scheduled match times that require
attendance, live streams, crowd control, dispute handling — and months of paid
promotion and influencer spend just to guarantee entrants. All of it is funded
from the sponsor's budget. The brand pays for a competition and most of the money
goes to the machinery of running one.

We delete the machinery. The gamer plays the game they were already going to
play, from where they already are. Stats come from the publisher's own API, so
scores are not reported, claimed or adjudicated — they are read.

| | |
|---|---|
| **Unit** | One challenge · one game · one week · **$350** · billed individually |
| **Brand gets** | Their name on a real competition, branded trophies with real cash value, and delivery numbers that are counted rather than modelled |
| **Gamer gets** | A branded trophy — worth money if they place, worth nothing but collectable if they turn up |
| **Server owner gets** | Free prizes for their members, and a share of a weekly pool |
| **We never** | Organise anything |

---

## 2 · The week

**Mon 00:00 UTC → Fri 00:00 UTC** is the competition. Five days.
**Sat + Sun** is the grace period. No sponsored challenge runs.

| When | What happens |
|---|---|
| Mon 00:00 UTC | **The gun.** Baselines stamped, scoring begins |
| Mon–Thu | Competition runs. Sales, onboarding, new servers, brand commitments for future weeks |
| Fri 00:00 UTC | Week closes. Placements final |
| **Fri** | **Winners announced once**, on every server. Winner cards name the server they came from |
| **Sat** | **Pool standings announced once**, on every server |
| Sat–Sun | Redemptions paid · owner payouts released · vaults balanced · next week's challenges set up and announced · community challenges and house dailies run · brands chased for payment |
| **Sat evening** | **Payment deadline.** A challenge unpaid by then cannot start Monday |
| Sun | Next week's challenges announced, gathering entrants before the gun |

The grace period is not downtime. It is when the business closes one week and
opens the next. During the week the platform mostly maintains itself.

**Payment guidance to brands:** pay at least 3 days before Monday for maximum
exposure. Hard deadline Saturday evening — a minimum of 24 hours before the gun.
A challenge paid earlier can be announced weeks ahead.

---

## 3 · Money

### 3.1 The vaults

```
                    ALL INCOME
        (brands + server owners, every dollar)
                        │
                   VAULT 1 · income
                        │
        ┌───────────────┼───────────────┐
        ↓               ↓               ↓
      50%             25%             25%
   VAULT 2         VAULT 3         Cluster
   prize pool     server vault
        │               │
   funds every     allocated by hand
   money-trophy    to each week's pool
```

| # | Rule | Value |
|---|---|---|
| M1 | Challenge price | **$350** |
| M2 | Prize share | **50%** → $175 |
| M3 | Server owner share | **25%** → $87.50 |
| M4 | Cluster share | **25%** → $87.50 |
| M5 | Cluster Points (CP) | **Do not exist.** No CP vault, ceiling, dial, allocation, wallet or pricing anywhere |
| M6 | Money enters a vault | When the invoice is **paid**. Never when issued |
| M7 | Balances | `sum(ledger)`. **No stored balance column, anywhere, ever** |

### 3.2 Vault 3 → the weekly pool

| # | Rule |
|---|---|
| M8 | Allocation is **manual**. Nothing auto-allocates |
| M9 | **The pool may never exceed half the vault.** `pool ≤ vault ÷ 2`, always |
| M10 | The held half covers refunds, disputes and quiet weeks |
| M11 | So a week's challenges contribute 25% to the vault, and roughly half of that reaches that week's pool |
| M12 | The pool page names exactly which challenges fed this week's pool |

### 3.3 The prize vault is a liability ledger

**This is the most important accounting rule on the platform.**

```
prizeVault.balance  ==  Σ(value of every unredeemed money-trophy
                          held by a live account)
```

Every trophy worth money is backed by real money sitting in vault 2. If every
holder redeemed at the same instant, we could pay all of them.

| State | Meaning | Alert |
|---|---|---|
| **Unallocated** | A bill was paid; no trophies assigned yet | ⚠️ amber |
| **Unclaimed** | Trophies assigned to a challenge that has not ended | ⚠️ amber |
| **Green** | Every dollar sits on a gamer's profile | ✓ |
| **Over-allocated** | Trophies worth more than the vault holds | 🔴 **must be impossible — guarded at assignment** |
| **Orphaned** | The holder deleted their account. The money is real and unclaimable | 🔴 admin sweeps to Cluster, logged |

| # | Rule |
|---|---|
| M13 | A redeem **reduces** the balance by exactly the trophy's value, and the holder count by one |
| M14 | A redeem request is **impossible** for a trophy not accounted for in the vault. This is what makes duplicate awards and double payouts structurally impossible rather than merely guarded |
| M15 | Admin can search the vault **by gamer name** and see every trophy they hold and whether a redeem is pending |
| M16 | A deleted holder leaves the money in the vault permanently — it was paid by a brand. Admin may sweep it to Cluster so the balance equals live redeemable liability |
| M17 | **Trophies are held for 5 years.** A 13-year-old must still have theirs at 18 |
| M18 | After 5 years, sweep to Cluster — logged with date, holder, value and reason, and **reversible** if the holder returns |
| M19 | Any trophy without a dollar value is a **collectable** and has nothing to do with this vault |

### 3.4 Private and community challenges

| # | Rule |
|---|---|
| M20 | Tier 1: **$5** prize pool · **1 winner** · **no Cluster margin** |
| M21 | Tier 2: **$10** prize pool · **3 winners** · **5% Cluster margin** (owner pays $10.50) |
| M22 | Owner money pays into **vault 2 (prize)** and Cluster only. **Never vault 3** |
| M23 | A community challenge **does not count** toward the weekly pool |
| M24 | It is **public on the web** — that is the point |
| M25 | To enter, you must join the server to get the key. The challenge is the server's advertising |
| M26 | **No rate limit and no fee.** Owners farming visibility is the growth engine, not an abuse |
| M27 | Wording is always *"a community challenge run by this server"*. They paid for it, it is theirs, we are the engine |

---

## 4 · The challenge

### 4.1 Lifecycle

| State | Meaning | Who moves it |
|---|---|---|
| `draft` | Being built by a brand, an owner, or admin. **No bill exists** | Brand / owner / admin |
| `pending_payment` | They pressed Confirm & Pay. **Bill created** | System |
| `scheduled` | **Paid.** In the admin queue for its week | Payment webhook |
| `announced` | **Admin pressed Announce.** Joinable | **Admin, by hand** |
| `live` | The gun fired | System |
| `ended` | Placements final, trophies awarded | System |

| # | Rule |
|---|---|
| C1 | **Nothing announces itself. Ever.** Announcement is always an admin click |
| C2 | Payment makes a challenge *eligible* to announce, not announced |
| C3 | **There can never be an announced challenge that is unpaid** |
| C4 | Before announcing, admin must set: game, metrics, rules, trophies |
| C5 | Start is **always the start of a week**. No date picker, ever |
| C6 | Bought mid-week → next week or any week after |
| C7 | A paid future challenge may be announced immediately. Gamers join now, score from the gun |
| C8 | **Every challenge has a bill** — to a brand, a server, or the Cluster house brand. No unbilled challenges |
| C9 | A **series** is several challenges, each announced individually after its own payment clears |
| C10 | Cadence: weekly (the brand product) or daily (admin-built custom only) |

### 4.2 Baselining — the rule that took the longest to get right

```
baseline = max(challengeStart, joinedAt)
```

Stored **per (challenge, participant)** as a snapshot of the metric values at
that instant. Two challenges on one game account keep two independent baselines
and never interfere.

| Case | Baseline | Why |
|---|---|---|
| Joins before the gun | At the gun | Nothing played before the week counts |
| Joins on day 2 | At join | They cannot bank the two days they played before entering |
| Joins in the final second | At join | Score ≈ 0, and they still get the participation trophy |

| # | Rule |
|---|---|
| C11 | **Force a sync on join** and stamp the baseline from that result. A stale reading becomes free progress |
| C12 | A start-of-week job stamps baselines for everyone who joined early |
| C13 | A **final sync runs before close**. Placements are never computed on stale data |
| C14 | Late joiners are disadvantaged, and the card says so: *"Scoring starts now. 2 days left."* |
| C15 | Gamers may join **until the final second** of the week |

### 4.3 Scoring

```
points = (Δwins × 10) + (Δmatches × 1)
```

| # | Rule |
|---|---|
| C16 | Wins and matches, counted. **No win rate. No percentages. No ratios** |
| C17 | Every delta clamped `≥ 0` |
| C18 | Ties are effectively impossible, so **there is no tiebreak rule** |
| C19 | Matches played is **always counted and always shown** on standings, whether or not it is scored |
| C20 | For League both come from one call — `league/v4/entries/by-puuid` returns `wins` and `losses` per queue; `matches = wins + losses` |

**Known consequence, accepted deliberately:** this rewards volume. A player with
a 50% win rate over 40 games beats a player with 70% over 20. That is the ruling —
grinding is a legitimate way to win.

### 4.4 Rank gating — optional, off by default

| # | Rule |
|---|---|
| C21 | A gate is a **range**: minimum tier and maximum tier |
| C22 | Checked **at join only**. Never re-checked, not at the gun, not at close |
| C23 | Rationale: they will rank up during the week, and that is the point |
| C24 | Queue is selectable — **solo/duo or flex**, per challenge |
| C25 | **Default is no gate.** Most challenges are open |
| C26 | Stated before joining: *"Gold I to Platinum IV, solo queue"* |
| C27 | An account outside the range is refused with the reason |
| C28 | Ownership is checked **before** rank — an unproven account never reaches the rank test |

### 4.5 Rank-up recognition

At close, every entrant who changed tier is told — **winners and non-winners
alike**. *"You didn't place, but you went from Gold III to Gold I."* It costs
nothing and it is the only good news most entrants get.

---

## 5 · Trophies

| Type | Value | Redeemable | Funded by | Given to |
|---|---|---|---|---|
| Sponsored podium | Set by admin | Yes, 18+ | Prize vault | Places 1–N |
| Sponsored participation | **$0** | **No** | Nothing | Every entrant who did not place |
| Milestone — 5 challenges in one game | **$0** | **No** | Nothing | Automatic, per game |
| Milestone — 4 consecutive weeks | **$0** | **No** | Nothing | Automatic, rolling |

| # | Rule |
|---|---|
| T1 | **Any $0 trophy is unredeemable.** Enforced at the redeem action, not just hidden in the UI |
| T2 | **Guard: the sum of a challenge's podium trophy values must equal its prize pool.** Flag if over **or** under |
| T3 | The participation trophy shows **once** on `/trophies` with a holder count — not one row per gamer |
| T4 | Admin creates every trophy: type, value, brand-linked or generic, milestone or sponsored, which game, which challenge, which place |
| T5 | The challenge is created **first**; trophies are assigned to it after payment clears |
| T6 | Milestone trophies show live progress: *"3 of 5 challenges in League"* |
| T7 | **A trophy's value can never be edited.** A $100 trophy is a $100 trophy forever |
| T8 | Editable: **name, image, brand**. An edit propagates to every holder, everywhere |
| T9 | Trophies **lock at `ended`** |
| T10 | Any trophy carrying a prize value flags the prize vault until a gamer wins it |
| T11 | `/trophies` is a **showcase, not a shop.** Nothing is for sale. No CP, no purchase |
| T12 | A trophy page shows: value, brand, challenge, other challenges it appeared in, the series it belongs to, current holders with profiles, and past holders who redeemed |
| T13 | For our own milestone trophies, show what a gamer is **missing** to earn it |

---

## 6 · The gamer

| # | Rule |
|---|---|
| G1 | Onboarding is **link a game account + age band + country**. Three things |
| G2 | **No email at onboarding** |
| G3 | Email is asked **only at redemption**, and must be **verified** then |
| G4 | Ownership proof is **required** where the game's API supports it |
| G5 | Where the API cannot support it, entry is allowed with an unproven account — **no badge, no warning, no second class.** It is not the gamer's fault the publisher has no endpoint |
| G6 | Age bands: **13–17** and **18+** |
| G7 | 13–17 earn and hold trophies. **They cannot redeem** |
| G8 | 18+ redeem worldwide (US LLC for US, Dubai LLC for international) |
| G9 | Age band **cannot be changed by the gamer**. Support only |
| G10 | A 13–17 gamer pressing Redeem is told to contact support if they have turned 18 |
| G11 | **Sanctioned countries are not offered in the country picker at all.** Admin can edit the list |
| G12 | Everything is doable from the **Discord bot** and from the **website** |

---

## 7 · The server owner

| # | Rule |
|---|---|
| S1 | **Portal access by Discord sign-in.** The credential is deleted entirely — see `docs/12-IDENTITY.md` |
| S2 | On install, only the **guild owner** has admin |
| S3 | The guild owner maps an **admin role** in bot settings — the same way they pick a channel |
| S4 | Anyone with that role signs in with Discord and gets the portal, the bot's admin cards, everything |
| S5 | **Store the role ID, not the name.** A renamed role must not silently revoke access |
| S6 | Owners can **re-announce** one challenge or all of this week's, from the portal or the bot |
| S7 | Every portal page and tab also exists as an **admin bot card** |
| S8 | **Admin cards are never public messages.** Ever. Only the owner and mapped roles see them |
| S9 | If the bot is removed, the portal survives. Re-announce errors say *"tell your admin to reinstall Cluster"* |
| S10 | Owners can build community challenges (§3.4) |

### The weekly pool — three KPIs

| # | KPI | Measures | Weight |
|---|---|---|---|
| K1 | **Exclusive entrants** — split across every server a gamer belongs to | Volume | 40 |
| K2 | **Conversion** — entrants ÷ linked members | Efficiency | 30 |
| K3 | **Activation** — entrants who scored above zero ÷ entrants | Quality | 30 |

Plus a **flat share split evenly** among every server that carried an entrant.
Turning up is worth something.

| # | Rule |
|---|---|
| K4 | **No KPI may measure Discord activity.** Not bot commands, not card opens, not messages. That was the Discord ToS violation in the old model and it is why these three measure outcomes on *our* platform |
| K5 | K3 exists to kill fake entrants: a member who joins and never plays *lowers* the ratio |
| K6 | All three are **ratios or split volumes**, so a large server cannot simply out-mass a small one |
| K7 | The homepage states the three KPIs and says plainly that we respect Discord's terms |
| K8 | Winning a challenge earns a server **nothing** directly. Entrants do |

---

## 8 · The brand

| # | Rule |
|---|---|
| B1 | Fully self-serve from signup. **The emailed key is a one-time invite** exchanged for an email-and-password account. A brand user is never a gamer |
| B2 | Setup: contact name, phone, logo |
| B3 | Builder: big game cards → pick one or many → challenges per game → single or series → which week |
| B4 | They see start date, announce date and price **before** paying |
| B5 | Self-serve is **weekly only**. No daily option, no custom prize pool, no date picker |
| B6 | **Unlimited challenges per week**, any number of games. There is no capacity cap |
| B7 | Admin may build a **custom challenge** (daily, or a repeating series) and assign it to a brand. It appears in their portal as a draft |
| B8 | On an admin-built draft the brand may change **only the start day/week** |
| B9 | A series is billed together; a single challenge is billed alone |
| B10 | Reporting: trophies, holder counts, entrants per challenge, reach, filtered by game and week |

### Reach and entrants — counted, never modelled

| Term | Definition |
|---|---|
| **Reach** | Every member of every server a challenge was announced to |
| **Entrants** | Gamers who joined **that** challenge |
| **Double counting** | **Deliberate.** The same 10 members on two challenges is 2 × 10 reach. The same gamer entering week 1 and week 2 is 2 entrants |
| **Never** | Sum reach or entrants across challenges into a "unique audience" figure |

---

## 9 · Admin

| # | Rule |
|---|---|
| A1 | The **challenges dashboard is the most important page on the platform** |
| A2 | Admin is notified when: a brand signs up · a brand starts building · a challenge is paid |
| A3 | Admin sees unpaid drafts, labelled *draft — not yet eligible to announce* |
| A4 | On payment: *eligible to announce — needs setup* |
| A5 | Admin confirms game and metrics, assigns trophies, then announces |
| A6 | The **prize-pool guard fires** if trophy values do not equal the prize pool |
| A7 | Vault allocation to the weekly pool is a deliberate admin action, capped at half the vault |
| A8 | Admin can create a challenge billed to any brand, any server, or the house brand |
| A9 | `/admin/users` and `/admin/linked-accounts` are **admin-only**. No staff department reaches the gamer directory, ever |

---

## 10 · The homepage

Challenge-first, and the pool is as prominent as the challenges.

| Block | During the week | During the grace period |
|---|---|---|
| Hero | **Live challenges** + big **countdown to Friday** | **Week ended** · winners · next week's challenges |
| Pool | **This week's pool, live** — every server, entrants, KPIs, and **the actual dollars each has earned so far**, updating as members join. Refreshes in place without a page reload | Final standings, paid |
| Community | Hidden from the top | **Promoted** — community challenges |
| Always | The three KPIs, stated. A bold line saying we respect Discord's terms and reward outcomes, not activity | Same |

The pool being public is the innovation: we do not buy entrants with advertising.
We share the value with gaming communities and they bring their members.

---

## 11 · What does not exist any more

Cluster Points · the CP vault, ceiling, dial and allocation · quests · quest
actions · daily missions · streaks · the trophy marketplace · buying a trophy ·
`/wallet` · the editable feed dashboard · email gating at onboarding · the
per-game sponsor capacity ceiling · win-rate scoring · any KPI measuring Discord
activity.

**Retention is deliberately out of scope.** Prove the cycle first: sell to
brands, get servers earning, get gamers paid. Gamification comes after, designed
properly, or not at all. Gamers come for money at stake — and mostly they do not
come to us at all. We go to them, on Discord, through their server owners.
