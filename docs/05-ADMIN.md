# Admin

Admin is the only surface that can move a challenge forward and the only one
that can move money. Everything else computes, displays and waits.

**Design principle: the admin console is an operating theatre, not a database
browser.** Every page answers *"what needs me right now, and what is blocking
it?"* If a page cannot answer that, it is a report and belongs behind one.

---

## 1 · The dashboard — the most important page on the platform

The first thing anyone sees on signing in. It answers one question: **what is
blocking this week?**

| Block | Shows | Action |
|---|---|---|
| **Needs you now** | Paid challenges not yet announced, ordered by how soon they start | Open → set up → announce |
| **Vault alerts** | Prize vault unallocated · unclaimed · over-allocated · orphaned | Open the vault |
| **This week** | Every live challenge · entrants · reach · sync health | — |
| **The pool** | Allocated so far · vault balance · half-rule headroom | Allocate |
| **Money waiting** | Redemptions to approve · owner payouts to release | Approve / release |
| **Countdown** | Time to the close, or time to the payment deadline | — |
| **Inbox** | New brand signups · new drafts · new server installs | — |

### The three notifications admin must receive

| Trigger | Why it matters |
|---|---|
| A brand **signs up** | Somebody may need a call |
| A brand **starts building** — selects games and continues | A draft now exists. This is the sales signal |
| A challenge is **paid** | The clock starts: it must be set up and announced before its week |

---

## 2 · Challenges

| Page | Purpose |
|---|---|
| `/admin/challenges` | The queue. Every challenge in every state, with what is blocking it |
| `/admin/challenges/[id]` | The editor — game, metrics, rules, trophies, announce |
| `/admin/challenges/new` | The builder — weekly, daily, or a repeating series |
| `/admin/challenges/series/[id]` | A series and its instances |

### The queue, grouped by what it needs

| Group | Label | Action available |
|---|---|---|
| Drafts | *Not paid — no bill yet* | View only. Chase the buyer |
| Awaiting payment | *Bill issued* | Resend, cancel |
| **Paid, needs setup** | **Eligible to announce** | **Set up → announce** |
| Announced | *N servers · X entrants* | Re-announce, edit before the gun |
| Live | *Day 3 of 5* | Watch. Emergency only |
| Ended | *Closed* | Review, reopen if something went wrong |

### The editor, in the order it must be done

| Step | Field | Guard |
|---|---|---|
| 1 | Game | Must have a live provider |
| 2 | Metrics | Which stats score, and their weights |
| 3 | Queue | Solo/duo, flex, or both — for games that have queues |
| 4 | Rank gate | **Optional, default off.** A range, checked at join only |
| 5 | Places | 1 to N |
| 6 | **Trophies** | **The prize-pool guard fires here.** Values must equal the prize pool — flag over **and** under |
| 7 | Announce | Only enabled when 1–6 are complete and the bill is paid |

### The builder

| Type | Who can | Prize | Dates |
|---|---|---|---|
| Weekly sponsored | Brand self-serve, or admin | Fixed $350 | Which week |
| Daily | **Admin only** | Admin sets | Which day |
| Repeating daily series | **Admin only** | Admin sets per day; bill computed | Start day + count |
| Community | Server owner | $5 or $10 tier | Which week or day |

**The arithmetic, one direction only:** admin enters the **prize**; the system
computes the **bill** as `prize ÷ 0.5`. Never the reverse, or the split drifts.

Admin can bill any challenge to a brand, a server, or the Cluster house brand —
including creating a draft that appears in a brand's portal ready to confirm and
pay.

---

## 3 · Vaults

| Page | Purpose |
|---|---|
| `/admin/vaults` | All four vaults, balances, alerts |
| `/admin/vaults/prize` | **The liability ledger** |
| `/admin/vaults/server` | Vault 3, allocation to the weekly pool |
| `/admin/vaults/ledger` | Every movement, searchable |

### The prize vault page

This page is the platform's balance sheet and must be built with more care than
anything else.

| Shows | |
|---|---|
| **Balance** | Which must equal the sum of every unredeemed money-trophy on a live account |
| **Every trophy**, not a total | Value, holder count, which challenge, which brand |
| **State** | Unallocated · unclaimed · green · over-allocated · orphaned |
| **Search by gamer name** | Every trophy they hold and whether a redeem is pending |
| **Redeem queue** | Per holder, per trophy. Approve individually |
| **Sweep** | Orphaned money and five-year expiries, logged and reversible |

| # | Guard |
|---|---|
| 1 | A redeem cannot exist for a trophy the vault does not account for |
| 2 | Trophies cannot be assigned worth more than the vault holds |
| 3 | A trophy's value can never be edited |
| 4 | Every sweep is logged with date, holder, value and reason |

### Allocating the weekly pool

| # | Rule |
|---|---|
| 1 | Deliberate. Nothing auto-allocates |
| 2 | **`pool ≤ vault ÷ 2`.** The control refuses more and says why |
| 3 | The page shows exactly which challenges fed the vault this week |
| 4 | A locked week can be raised, never lowered — people were already shown the number |

---

## 4 · Trophies

| Page | Purpose |
|---|---|
| `/admin/trophies` | Every trophy |
| `/admin/trophies/new` | Create one |
| `/admin/trophies/templates` | Templates for repeating series |

### Creating a trophy

| Field | Options |
|---|---|
| Type | Sponsored podium · sponsored participation · milestone |
| Value | A number, or **$0** |
| Brand | Brand-linked or generic |
| If milestone | Which kind — *5 challenges in a game* (and which game) or *4 consecutive weeks* |
| If sponsored | Which brand, which challenge, which place |
| Name, image | Editable forever |

| # | Rule |
|---|---|
| 1 | **Milestone trophies are always $0.** They are collectables and are funded by nothing |
| 2 | Any $0 trophy is unredeemable, enforced at the redeem action |
| 3 | Value is set once and never changes |
| 4 | Editing name or image propagates to **every holder everywhere** |
| 5 | The challenge is created first; trophies are assigned to it after payment |

---

## 5 · Brands

| Page | Purpose |
|---|---|
| `/admin/brands` | Every brand, state, spend |
| `/admin/brands/[id]` | One brand — challenges, invoices, trophies, contact |
| `/admin/brands/[id]/draft` | Build a challenge into their portal for them to confirm |
| `/admin/invoices` | Every bill |

---

## 6 · Servers

| Page | Purpose |
|---|---|
| `/admin/servers` | Every server — members, linked, entrants, pool position |
| `/admin/servers/[guildId]` | One server — profile, standing, payouts, messages |
| `/admin/servers/requests` | Community challenge requests |
| `/admin/payouts` | Owner payouts. **Draft → released** |
| `/admin/inbox/servers` | **The server-owner inbox.** Refresh in place |
| `/admin/inbox/brands` | **The brand inbox.** Separate surface, never merged |

### The guild registry — `/admin/servers/[guildId]`

The page opened when an owner asks *"why am I not earning?"* Every section in
`docs/12-IDENTITY.md` §8.

| Section | Shows |
|---|---|
| **Ownership** | Guild owner, ID and name · **has the owner ever signed in** · transfer state · the 14-day confirmation timer · the 4-week reassignment clock |
| **Who installed it** | The user who added the bot, their role at the time, whether they were the owner |
| **Permissions** | Every ADMINISTRATOR · the mapped role, ID **and** current name · who holds it now |
| **Pool eligibility** | Linked members vs 10 · profile completeness field by field · **in this week's pool, yes or no** |
| **Money** | Balance · this week's share · payout history · pending community-challenge requests |
| **Refresh** | One button, per guild, cooled down. Re-pulls **owner and roles only** |
| **Analytics** | Granted or not · the last snapshot **and when it was taken** · the Update cooldown, and whether the platform-wide ceiling is what is holding it |
| **Audit** | Every admin action on this server, timestamped |

| # | Rule |
|---|---|
| 1 | **Never list guild members.** One member resolved on demand, never the paged list |
| 2 | Admin may set any gamer's **age band** and **parent server** by hand, from the servers that gamer is in. Logged |
| 3 | An owner who has never signed in for **4 weeks** may be reassigned — manually, and the claimant must hold ADMINISTRATOR at that moment |
| 4 | A confirmed ownership transfer **freezes withdrawal for 7 days** |

---

## 7 · Gamers

| Page | Purpose | Access |
|---|---|---|
| `/admin/users` | The gamer directory | **Admin only. No staff department, ever** |
| `/admin/users/[id]` | One gamer — accounts, trophies, entries, redemptions | **Admin only** |
| `/admin/linked-accounts` | Every linked game account, sync health | **Admin only** |
| `/admin/redeems` | The redemption queue | Admin + finance |

### Redemption queue

| Step | Action |
|---|---|
| 1 | Gamer requests. Email verified, 18+, country allowed |
| 2 | Admin confirms the trophy is held and accounted for in the vault |
| 3 | Approve → send → mark paid |
| 4 | The vault balance falls by exactly that trophy's value |

**Support-only actions:** changing a gamer's age band (they cannot change it
themselves — a 13–17 gamer who turns 18 must contact support), and reinstating a
swept trophy.

---

## 8 · Content

| Page | Purpose |
|---|---|
| `/admin/content` | Every editable copy key, with its default |
| `/admin/games` | The game catalogue, provider status, whether proof is required |
| `/admin/cards` | Bot card layouts |
| `/admin/settings` | Platform settings, vault split, feature switches |
| `/admin/staff` | Staff titles and their departments. **Super admin only** |

---

## 9 · The weekend routine

The whole business runs on this. It should be a checklist on one page.

| Order | Task | Page |
|---|---|---|
| 1 | Close the week — confirm placements | `/admin/challenges` |
| 2 | Confirm trophies landed, vault is green | `/admin/vaults/prize` |
| 3 | **Friday: announce winners, once** | `/admin/challenges` |
| 4 | Compute the pool, review draft payouts | `/admin/vaults/server` |
| 5 | **Saturday: announce pool standings, once** | `/admin/servers` |
| 6 | Release owner payouts | `/admin/payouts` |
| 7 | Approve and pay redemptions | `/admin/redeems` |
| 8 | Chase unpaid drafts — **deadline Saturday evening** | `/admin/challenges` |
| 9 | Set up every paid challenge for next week | `/admin/challenges/[id]` |
| 10 | Assign trophies, confirm the guard passes | `/admin/trophies` |
| 11 | **Sunday: announce next week's challenges** | `/admin/challenges` |
| 12 | Allocate the pool for next week | `/admin/vaults/server` |

**Build this as an actual checklist with state**, not a document somebody
remembers. It is the operating heartbeat of the company, and it must survive one
person being ill.

---

## 10 · What admin must never be able to do

| # | |
|---|---|
| 1 | Announce an unpaid challenge |
| 2 | Assign trophies worth more than the prize pool |
| 3 | Allocate more than half the server vault to one week |
| 4 | Edit a trophy's value |
| 5 | Edit trophies after a challenge has ended |
| 6 | Pay a redemption for a trophy the vault does not account for |
| 7 | Pick an arbitrary challenge start date |
| 8 | Reach the gamer directory from a staff department account |
