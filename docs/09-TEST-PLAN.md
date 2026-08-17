# Proof

Two bands and a screenshot record. The point of all three is the same: **a green
test that has never failed is not evidence.**

---

## The four rules

| # | Rule |
|---|---|
| 1 | **Prove every guard by breaking it.** Break the code, watch the test go red, restore, watch it pass. Then confirm the break was actually reverted |
| 2 | **Shared assertion helpers live in one module.** Ninety-nine files each declaring their own is how one file quietly declared none and shipped three assertions that could never fail |
| 3 | **Walk the tree, never keep a file list.** A guard with a hand-maintained list only guards the files somebody remembered |
| 4 | **Assert properties, not strings.** A test pinned to one wording catches one file and goes red the first time somebody improves a sentence |

And one more, learned expensively: **an allowlist entry must expire with its
subject.** If a guard carries exceptions, every exception must still describe
something real or the suite fails. An allowance that outlives what it excused is
how a deleted rule comes back.

---

## Band 1 — logic

Runs in-process against an in-memory database. Needs nothing running.

| Area | Must prove |
|---|---|
| **Onboarding** | Nothing accrues until link + age + country. Under-13 deletes and cannot re-register |
| **Ownership** | Proof required where supported; entry allowed where not, with no penalty. One game account belongs to one gamer. A prover takes it from a claimer |
| **Baselining** | Early joiner does not score before the gun. Day-2 joiner does not bank days 1–2. Two challenges on one account never interfere. Final-second joiner scores ≈ 0 and still gets the trophy |
| **Scoring** | `(Δwins × 10) + (Δmatches × 1)`. Deltas clamp at 0. A season reset re-baselines instead of zeroing |
| **Rank gate** | A range, at join only, never re-checked. Ownership checked first |
| **Challenge states** | `announced` is impossible without a paid invoice. Start is always a period boundary |
| **Prize vault** | Balance equals unredeemed money-trophies on live accounts. Over-allocation refused. A redeem is impossible for an unaccounted trophy |
| **Trophy guard** | Values must equal the prize pool — flags over **and** under |
| **$0 trophies** | Unredeemable at the redeem action, not merely hidden |
| **Pool** | `allocation ≤ vault ÷ 2`. Flat 20% split evenly. Three KPIs. Community challenges contribute nothing |
| **Attribution** | Entrant credit is **½ parent + ½ join**. Parent = join → **1.0, not two halves**. Web join with no server → 1.0 to parent. No parent → everything works and no server earns. Linked-member count goes to the **parent only**. A parent that **loses the bot freezes**: keeps what it earned, gains nothing new |
| **Retroactive safety** | Attribution is stamped at join. An admin correcting a gamer's parent in week 6 **does not move week 3's money** |
| **The weekly record** | Written once at the close and **never updated** — a correction is a new row naming what it supersedes. `Σ week_records.totalCents == pool_allocations` for that week (W3), and `Σ week_credits.entrantsCredited == week_records.entrants` per server (W4). A **renamed** server reads under its old name in an old week (W5). An **ineligible** server that carried entrants still has a row, with the reason field by field (W6). Close two weeks and confirm **week 1's row is untouched** by week 2's gun (W7) |
| **Eligibility** | Frozen at Monday's gun and **never re-checked mid-week**. 8 linked at the gun + 50 on Tuesday earns nothing this week. 10 at the gun, 9 on Wednesday still pays. **The conversion denominator is live**, so the ratio can never exceed 1.0 |
| **Permissions** | An administrator cannot withdraw or approve a spend. Only the guild owner can. A 13–17 owner may spend and may not withdraw. A **renamed** Discord role does not revoke access — the ID does |
| **Identity** | A gamer can never change their own parent; admin can, and it is logged. A brand account is never a gamer account and never sees the gamer nav. A brand invite key works **once** |
| **Two doors, one row** | An email gamer with no Discord onboards, enters, scores, wins and redeems. A Discord gamer needs no email until redemption. **Linking the second method never creates a second row and never merges two.** An already-used identity gets a route, not a refusal. **Two accounts for one person are permitted and each onboards on its own** — and they cannot share a game account, because L1 stops it |
| **Staff** | A staff grant changes nothing about how they play — **they place in challenges they run, on merit, and there is no lever to pull**. No title reaches the gamer directory. A podium trophy unassigned at `ended` is flagged in the vault |
| **Analytics** | The grant is **permanent per server and survives sign-out**. The Update cooldown is on the **guild**, so signing out and back in does not reset it. The platform ceiling lengthens every server's cooldown at once and each is told why. The last snapshot always reads, dated. **No weekly-cycle figure reads a snapshot — drop the table and every dollar in the four-week simulation is identical** |
| **Messages** | An unanswered thread keeps alerting. The two inboxes never merge |
| **Ownership transfer** | The old owner must confirm. **14-day timeout** → admin arbitrates. A confirmed transfer **freezes withdrawal for 7 days** |
| **KPI 3** | An entrant who never plays **lowers** the server's score |
| **Payouts** | Open as drafts. A job never moves money |
| **Redemption** | 18+, verified email, allowed country. Sanctioned countries never offered |
| **Deletion** | Refused while a redemption is in flight. Orphaned trophy money stays in the vault |
| **Copy** | No page retypes a price, share, threshold or floor. No claim that an account is "verified" unless proof exists. No audience group under 25 |
| **Structural** | No column anywhere could hold a payment detail |

### The mutation harness

A separate tool that asks whether the band can tell working code from broken
code. Each mutation is a small, plausible, silent change; the harness reports how
many suites noticed.

| Mutation | Should be caught by |
|---|---|
| Move 10% of the prize to Cluster | ≥ 2 |
| Delete the flat participation share | ≥ 1 |
| Make every account count as ownership-proven | ≥ 1 |
| Let a half-onboarded gamer enter | ≥ 1 |
| Baseline at challenge start regardless of join time | ≥ 2 |
| Allow trophies worth more than the prize pool | ≥ 1 |
| Allow a pool allocation above half the vault | ≥ 1 |
| Make a $0 trophy redeemable | ≥ 1 |
| Stop scrubbing secrets from provider errors | ≥ 1 |
| Re-point a proven account after a key change | ≥ 1 |
| Give the join server full credit instead of a half | ≥ 2 |
| Give two halves when parent and join are the same server | ≥ 1 |
| Freeze the conversion denominator at the gun snapshot | ≥ 1 |
| Re-check pool eligibility mid-week | ≥ 1 |
| Let an administrator withdraw | ≥ 2 |
| Match a mapped admin role by **name** instead of ID | ≥ 1 |
| Let a gamer set their own parent server | ≥ 1 |
| Read the parent live at scoring instead of the frozen stamp | ≥ 1 |
| Recompute a closed week instead of reading its record | ≥ 2 |
| Overwrite last week's record at the next gun | ≥ 1 |
| Join the guild's current name instead of the stored one | ≥ 1 |
| Drop ineligible servers from the record instead of recording why | ≥ 1 |
| Let a KPI read a guild_snapshots row | ≥ 2 |
| Put the analytics cooldown on the session instead of the guild | ≥ 1 |
| Ignore the platform ceiling on one server's refresh | ≥ 1 |
| Merge two accounts when a gamer links an already-used identity | ≥ 1 |
| Create a second row when a gamer links their second method | ≥ 1 |

**A mutation caught by zero suites is a hole, and the report says so in those
words.** A mutation caught by one is worth looking at too: one assertion is one
edit away from none.

The harness must always restore the file — on success, on failure, on crash, on
interrupt. A harness that can leave the repository mutated is worse than none.

---

## Band 2 — browser, with screenshots

A real browser against a real build with seeded demo data. **Every screenshot is
saved in the repository as the record.**

### Fixture

| | |
|---|---|
| Servers | 10, varying sizes |
| Brands | 2 |
| Gamers | 100 linked — some proven, some on games that cannot prove, some under 18 |
| Games | Every live provider |
| Duration | 4 weeks simulated |

### What gets captured

Not one screenshot per page. **Every state of every flow.**

#### Gamer — from nothing to paid

| # | Shot |
|---|---|
| 1 | The challenge card in Discord |
| 2 | Join pressed — link prompt |
| 3 | Game picker |
| 4 | Name entry |
| 5 | Resolution success · **and the failure, with its reason** |
| 6 | Ownership proof instructions |
| 7 | Proof pending · **proof failed** · proof succeeded |
| 8 | Age band picker, with what each choice means |
| 9 | Country picker |
| 10 | *"You're in. Scoring starts Monday."* |
| 11 | **Rank gate refusal**, showing their rank and the range |
| 12 | Standings on day 1 · day 3 · final |
| 13 | Late join — *"Scoring starts now, 2 days left"* |
| 14 | Trophy awarded — podium **and** $0 participation |
| 15 | Rank-up message for a non-winner |
| 16 | Profile with trophies |
| 17 | Redeem: **blocked under 18** |
| 18 | Redeem: email verification, sent · verified |
| 19 | Redeem: method chosen, submitted |
| 20 | Redeem: approved · sent · **paid** |
| 21 | **Redeem refused on a $0 trophy** |

#### Server owner — every click

| # | Shot |
|---|---|
| 1 | Bot install |
| 2 | Admin role mapping · **and access denied before mapping** |
| 3 | Owner DM on install — *admins can build from your earnings, only you approve* |
| 4 | **Sign in with Discord** · the consent screen · landing in the portal that was already there |
| 4a | **Administrator** signed in: withdraw and approve **disabled**, with the reason |
| 4b | Server profile: 4 of 6 done · *"6 more linked gamers to unlock the pool"* |
| 4c | **In this week's pool** vs **on track for next week** |
| 5 | Overview: vault, pool, earnings |
| 6 | This week's challenges |
| 7 | **Re-announce one** — confirm, success, the resulting card in Discord |
| 8 | **Re-announce all** |
| 9 | Members joining — standing moves |
| 10 | Live earnings climbing |
| 11 | Community challenge builder: tier, winners, day |
| 12 | Billed · paid |
| 13 | Its money reaching the **prize vault**, allocated to a trophy |
| 14 | Its private announcement |
| 15 | The public community challenge page with the **Join server** CTA |
| 16 | Pool standings on Saturday |
| 17 | Withdrawal requested · released · paid |
| 18 | **Bot removed** — the error a member sees |

#### Brand — builder to report

| # | Shot |
|---|---|
| 1 | Signup |
| 2 | Invite-key email |
| 3 | Redeeming the key once · setting an email + password · **the same key refused a second time** |
| 3a | Email + password sign-in · password reset |
| 4 | Builder step 1 — game cards |
| 5 | Builder step 2 — counts, series, weeks |
| 6 | Builder step 3 — dates, reach, price |
| 7 | Checkout · payment · confirmation |
| 8 | Portal: awaiting setup |
| 9 | Portal: announced |
| 10 | Entrants and reach climbing |
| 11 | **Each week of a series separately** |
| 12 | Trophies and holder counts |
| 13 | Report, filtered by game and by week |
| 14 | Billing history |
| 15 | An **admin-created draft** appearing in their portal |

#### Admin — every page, every guard

| # | Shot |
|---|---|
| 1 | Dashboard: what is blocking this week |
| 2 | Queue: draft · pending · **paid, needs setup** · announced · live · ended |
| 3 | Editor: each of the seven setup steps |
| 4 | **Prize-pool guard failing — over** |
| 5 | **Prize-pool guard failing — under** |
| 6 | Guard passing |
| 7 | Announce: confirm, success, the cards landing |
| 8 | Prize vault: unallocated · unclaimed · **green** · orphaned |
| 9 | Vault search by gamer name |
| 10 | Redeem queue: approve, send, mark paid |
| 11 | Pool allocation · **refusal above half the vault** |
| 12 | Payouts: draft → released |
| 13 | Trophy creation: each type |
| 14 | Trophy templates instantiating a daily series |
| 15 | Daily series builder: prize → **computed bill** |
| 16 | The weekend checklist, part-done and complete |
| 17 | The three notifications |
| 18 | Every remaining admin page |

#### The full month

Four weeks end to end, screenshotted at each close: standings, pool division,
payouts, redemptions, vault states, and the brand's view of a series building
week over week.

### Storage

| | |
|---|---|
| Where | `screenshots/<flow>/<NN>-<what>.png` |
| Naming | Numbered in flow order so the sequence reads as a story |
| Rule | **Failures and refusals are captured too.** A record of only the happy path proves nothing |

---

## What "done" means

| # | |
|---|---|
| 1 | Both bands green |
| 2 | Every mutation caught by at least its expected number of suites |
| 3 | Every flow above screenshotted, including failures |
| 4 | The prize-vault invariant holds at every step of the four-week simulation |
| 5 | A human has clicked through all four journeys against the demo data |
