# The journeys

Four people, one cycle. Each journey below is written as clicks, not as a
feature list, because a feature list hides the moment where somebody gets stuck.

---

## 1 · The gamer

### First contact to first trophy

| # | Where | They do | System does | They see |
|---|---|---|---|---|
| 1 | Their Discord server | — | Announcement card posted | A brand's challenge, on a game they play, with the prize |
| 2 | The card | Press **Join** | Checks onboarding | *"First, link your account"* |
| 3 | Bot | Pick a game | Shows only games with a live provider | Game picker |
| 4 | Bot modal | Type their in-game name | Resolves against the provider API | Found · **or the reason it wasn't** |
| 5 | Bot | — | If the game supports proof | *"Set your profile icon to this, then press Verify"* |
| 6 | Bot | Press Verify | Checks the icon | Proven · **or "we still see the old icon"** |
| 5a | Bot | — | If the game **cannot** prove ownership | Nothing. No badge, no warning, no second class |
| 7 | Bot | Pick an age band | — | Two options, each saying what it means. Under-13 is a link, never a button |
| 8 | Bot | Pick a country | — | Sanctioned countries are not in the list |
| 9 | Bot | — | **Forces a sync, stamps the baseline** | *"You're in. Scoring starts Monday."* |
| 10 | The game | Plays normally | Hourly sync computes deltas | Nothing changes about how they play |
| 11 | Bot or web | Check standings | — | Their rank, points, matches played |
| 12 | Friday | — | Final sync, placements, trophies | Podium trophy **or** the $0 branded participation trophy |
| 13 | Friday | — | Rank movement computed for everyone | *"You didn't place, but you went Gold III → Gold I"* |

### If they are refused

| Refusal | What they see |
|---|---|
| Onboarding incomplete | Which of the three steps is missing |
| No account on that game | An offer to link one |
| Ownership unproven | The proof instructions, again |
| Rank outside the gate | **Their rank and the range**, so it is not a mystery |
| Already entered on another account | Which account they used |
| Joining late | *"Scoring starts now. 2 days left."* — not a refusal |

### Redemption

| # | They do | Condition | Result |
|---|---|---|---|
| 1 | Press **Redeem** on a trophy | $0 trophy | Refused — it is a collectable |
| 2 | — | Under 18 | *"Your trophy keeps. Contact support when you turn 18"* |
| 3 | Enter an email | **First time it is ever asked** | Verification code sent |
| 4 | Enter the code | — | Email verified |
| 5 | Pick a method and country | Sanctioned country | Refused, with the real reason |
| 6 | Submit | — | Pending |
| 7 | — | Admin approves, sends, marks paid | Paid. **The prize vault falls by exactly that trophy's value** |

---

## 2 · The server owner

| # | Where | They do | System does |
|---|---|---|---|
| 1 | Discord | Add the bot | Guild registered. **Only the guild owner has admin** |
| 2 | Bot settings | Map an **admin role** | Stores the role **ID** |
| 3 | Bot settings | Pick an announcement channel | — |
| 4 | Bot or email | Receive the portal key | DM'd |
| 5 | Portal | Sign in with the key | Session |
| 6 | Portal | Describe the community | **Required to be scored at all** |
| 7 | Portal | See this week's challenges | The ones feeding this week's pool |
| 8 | Portal or bot | **Re-announce** one, or all | Cards reposted to their server |
| 9 | — | Members join | Their KPIs and **live earnings** climb |
| 10 | Portal | Watch the pool | Their share in dollars, updating |
| 11 | Saturday | — | Pool standings announced on every server |
| 12 | Portal | Request a withdrawal | Admin releases |

### Building a community challenge

| # | They do | System does |
|---|---|---|
| 1 | Open the builder | — |
| 2 | Pick a game and a tier — $5/1 winner or $10/3 winners | — |
| 3 | Pick a week or a day | — |
| 4 | Confirm | Draft appears to admin. **Bill created** |
| 5 | Pay from balance or by card | → `scheduled` |
| 6 | — | Money reaches the **prize vault**. Admin assigns a trophy |
| 7 | — | Admin announces it to **their server only** |
| 8 | — | It appears **publicly on the web** with a **Join this server** button |

That public page is the point: their competition advertises their server.

### If the bot is removed

| | |
|---|---|
| Portal | Still works. Nothing deleted |
| Earnings | Kept |
| Reach | Frozen at removal |
| Re-announce | Errors |
| Members clicking a card | *"Tell your admin to reinstall Cluster"* |
| Reinstalling | Everything resumes |

---

## 3 · The brand

| # | Where | They do | System does | Admin sees |
|---|---|---|---|---|
| 1 | `/brands` | Sign up | Portal created, **key emailed** | **Notified: new brand** |
| 2 | `/login/brand` | Enter the key | Session | — |
| 3 | Portal | Contact name, phone, logo | — | — |
| 4 | Builder 1 | Pick games from big cards | — | — |
| 5 | Builder 2 | Per game: how many, single or series, which week | **Draft challenges created** | **Notified: started building.** Shows as *draft — unpaid* |
| 6 | Builder 3 | Review start date, announce date, reach, price | — | — |
| 7 | Checkout | **Confirm & Pay** | **Bill created** → `pending_payment` | Shows as awaiting payment |
| 8 | Stripe | Pay | → `scheduled` | **Notified: paid, needs setup** |
| 9 | Portal | Wait | Admin sets metrics and trophies, announces | — |
| 10 | Portal | Watch entrants and reach climb | — | — |
| 11 | Portal | Read the report | — | — |

### What they see in the report

| | |
|---|---|
| Entrants | **Per challenge.** The same gamer in week 1 and week 2 is two entrants |
| Reach | Every member of every server it was announced to. **Counted again per challenge** |
| Trophies | Theirs, with **how many gamers hold each** |
| Series | Each week separately, never merged |
| Never | A "unique audience" figure. Nothing modelled, nothing estimated |

### An admin-built draft

Admin can build a challenge — including a daily series, which brands cannot
build themselves — and assign it to a brand. It appears in their portal as a
draft. **They may change the start day or week, and nothing else.**

---

## 4 · Admin — the operating loop

| # | Trigger | Page | Action |
|---|---|---|---|
| 1 | **Notified: brand signed up** | Brands | Maybe call them |
| 2 | **Notified: brand started building** | Challenges | See the draft. Chase payment |
| 3 | **Notified: paid** | Challenges | Open it. **The clock starts** |
| 4 | — | Editor | Confirm game · set metrics · set queue · optional rank gate · set places |
| 5 | — | Trophies | Assign or create. **The prize-pool guard fires if the total is not exactly the pool** |
| 6 | — | Editor | **Announce** |
| 7 | Monday | Vaults | **Allocate** part of the server vault to this week's pool. Never more than half |
| 8 | Daily | Dashboard | Watch entrants, reach, sync health |
| 9 | Friday | Challenges | Confirm the close. **Announce winners, once** |
| 10 | Saturday | Servers | **Announce pool standings, once** |
| 11 | Sat–Sun | Payouts | Release owner payouts |
| 12 | Sat–Sun | Redeems | Approve, send, mark paid |
| 13 | Sat evening | Challenges | **Payment deadline.** Anything unpaid waits a week |
| 14 | Sunday | Challenges | Set up and announce next week |

---

## 5 · What is happening everywhere else, at the same time

The thing a single-surface spec always misses.

| Admin does | Brand portal | Owner portal | Discord | Gamer |
|---|---|---|---|---|
| *(brand still building)* | *Draft — not paid* | — | — | — |
| Brand pays | *Paid — awaiting setup* | — | — | — |
| Sets metrics | *Being prepared* | — | — | — |
| **Announces** | *Live — announced to N servers* | Appears in **this week's challenges** with a re-announce button | Card posted everywhere | **Join** |
| Owner re-announces | **Reach increases** | *Re-announced ✓* | Card reposted | Join |
| Gamers join | Entrants climb | Their KPIs and **live earnings** climb | Standings card updates | Their rank |
| Allocates the pool | — | **Pool amount appears.** Live earnings become real | — | Visible on `/pool` |
| Friday close | Final report | Draft payout appears | **Winners announced once** | **Trophy lands** |
| Saturday | — | Standing confirmed | **Pool standings announced once** | — |
| Releases payout | — | Wallet moves to paid | — | — |
| Approves a redeem | — | — | — | **Paid.** Vault falls |

---

## 6 · One month, with the money

**10 servers · 2 brands · 100 linked gamers.**

| Week | What happens | Money |
|---|---|---|
| **0** (grace) | Acme buys a 4-week League series. Nova buys Valorant week 1. Admin sets both up and announces Sunday | In: $1,750. Prize $875 · Server $437.50 · Cluster $437.50 |
| **1** | Gun Monday. League 62 entrants, Valorant 41. 8 of 10 servers carry an entrant. Friday: winners announced. Saturday: standings | Pool allocated **$87.50** — flat $17.50 split 8 ways, scored $70 |
| **2** | Acme League #2. Nightfall buys a $10 community challenge | In: $360.50 → prize $185, server $87.50, Cluster $88 |
| **3** | Acme League #3. Nova Dota | Pool **$131.25** |
| **4** | Acme League #4. A gamer completes 4 consecutive weeks → **$0 milestone trophy** | Pool **$109.38** |

| Month totals | |
|---|---|
| Received | $2,110.50 |
| Prize vault | $1,060 |
| Owner payouts released | $415.63 |
| Held in server vault | $109.37 |
| Cluster gross | $525.50 |
| Trophies awarded | ≈ 350 — 8 podium, the rest $0 |

**The check that must hold at every instant:** the prize vault balance equals the
sum of every unredeemed money-trophy on a live account. Not at month end — at
every instant.

---

## 7 · The gamer's whole experience, in nine steps

If a change does not make one of these easier, it is not worth building.

| | |
|---|---|
| 1 | A card appears in their server |
| 2 | Press Join |
| 3 | Link an account, prove it if the game allows |
| 4 | Age and country |
| 5 | *"You're in"* |
| 6 | Play the game they were already playing |
| 7 | Check standings when they feel like it |
| 8 | A trophy lands on Friday |
| 9 | Get paid, if they are 18 |

No bracket. No schedule. No lobby. No stream. No dispute. No attendance.
