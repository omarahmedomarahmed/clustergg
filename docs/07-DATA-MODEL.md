# The data model

Shapes and invariants, not migrations. The next session chooses the exact column
types; what it may not change is the set of rules below.

---

## The three laws

| # | Law | Why |
|---|---|---|
| 1 | **No stored balances.** Ever | A balance is `sum(ledger)`. A stored one cannot be reconstructed after it goes wrong, and eventually every one of them does |
| 2 | **No payment details.** Ever | A preference word and an opaque provider handle. Nothing account-shaped |
| 3 | **Append-only where money moves** | A ledger row is never updated or deleted. A correction is a new row |

Also derived, never stored: challenge stage, standings, pool shares, onboarding
progress, milestone progress, trophy holder counts, reach, entrant counts.

---

## Identity

### `users`
A gamer. Created by the bot or the website.

| Field | Note |
|---|---|
| `id`, `slug`, `displayName` | |
| `email`, `emailVerifiedAt` | **Null until redemption.** Not asked at onboarding |
| `ageBand` | `teen` \| `adult`. Set once, changed only by support |
| `country` | Sanctioned countries are never offered |
| `discordId` | |
| `parentGuildId` | **Where they first pressed a bot button.** Permanent. See `12-IDENTITY.md` §3 |
| `parentStampedAt` | When that first click happened |
| `createdAt`, `status` |

| # | Invariant |
|---|---|
| U1 | Nothing accrues until an account is linked **and** age band **and** country are set |
| U2 | `ageBand` is never self-editable after it is set |
| U3 | Under-13 is not a value — that path deletes the account and keeps a salted hash of email + Discord ID so the same person cannot re-register with a different answer |

### `brand_users`
A brand's login. **A separate table from `users`, on purpose.**

| Field | Note |
|---|---|
| `brandId` | |
| `email`, `passwordHash` | Email + password only. **Never Discord** |
| `inviteKeyHash`, `inviteRedeemedAt` | The one-time invite that creates the account |
| `lastLoginAt`, `lastLoginIp` | |

| # | Invariant |
|---|---|
| B1 | An invite key is redeemable **once**. After that it is dead |
| B2 | A brand user is **never** a gamer, never linked to one, never sees the gamer nav |
| B3 | One brand, one login. Shared credentials are accepted — so **every spend is logged with timestamp, actor and IP** |
| B4 | Brands and gamers sign in through **different routes**. One email could otherwise be both |

### `linked_game_accounts`

| Field | Note |
|---|---|
| `userId`, `provider`, `providerAccountId` | |
| `inGameName`, `region` | |
| `verified`, `verifiedMethod` | `claimed` · `exists` · `icon` · `oauth` · `openid` · `admin` |
| `syncStatus`, `syncError`, `lastSyncAt` | |

| # | Invariant |
|---|---|
| L1 | **Unique on `(provider, providerAccountId)` across all users.** One game account belongs to one gamer |
| L2 | A gamer who **proves** ownership takes the account from one who only claimed it — otherwise uniqueness is a denial of service |
| L3 | `verified: true, verifiedMethod: "exists"` means *the account exists*, not that they own it. Only `icon`/`oauth`/`openid`/`admin` are proof |
| L4 | A **proven** account is never silently re-pointed when a provider identifier changes. It goes to `needs_reconnect` |

---

## Challenges

### `challenges`

| Field | Note |
|---|---|
| `id`, `title`, `game`, `provider` | |
| `state` | `draft` → `pending_payment` → `scheduled` → `announced` → `live` → `ended` |
| `visibility` | `sponsored` \| `community` |
| `sponsorBrandId` \| `guildId` | Who it belongs to |
| `seriesId`, `seriesIndex` | Null for a single challenge |
| `cadence` | `weekly` \| `daily` |
| `startAt`, `endAt` | **Always a week or day boundary.** Never arbitrary |
| `prizePool` | The money backing its trophies |
| `places` | 1–N |
| `metrics` | Which stats score, and their weights |
| `queue` | Solo/duo · flex · both |
| `rankMin`, `rankMax` | Null = no gate |
| `accessKey` | Community challenges only |
| `invoiceId` | **Never null past `draft`** |

| # | Invariant |
|---|---|
| C1 | `announced` requires a **paid** invoice. There is no path around it |
| C2 | `startAt` is always a period boundary — enforced in the model, not the UI |
| C3 | Every challenge past `draft` has an invoice |
| C4 | Community challenges never contribute to a weekly pool |

### `challenge_participants`

| Field | Note |
|---|---|
| `challengeId`, `userId`, `linkedAccountId` | |
| `guildId` | Which server gets the credit |
| `joinedAt` | |
| **`baselineAt`** | `max(challengeStart, joinedAt)` |
| **`baseline`** | A snapshot of the metric values at `baselineAt` |
| `rankAtJoin` | For the gate, and for rank-up recognition |

| # | Invariant |
|---|---|
| P1 | **The baseline is stored per participant per challenge.** Two challenges on one account never interfere |
| P2 | `baselineAt = max(challengeStart, joinedAt)` — no exceptions |
| P3 | A sync is **forced on join** and the baseline stamped from its result |
| P4 | Unique on `(challengeId, userId)` — one entry per gamer per challenge |
| P5 | Score is derived from `baseline` and the latest observation. **Never stored** |

### `observations`
Time-series stat readings per linked account. The raw material for every delta.

| # | Invariant |
|---|---|
| O1 | Append-only |
| O2 | A **decrease** in a cumulative metric means a season reset → re-baseline, never a clamped-to-zero week |

---

## Money

### `vault_ledger`
Append-only. Every movement of every dollar.

| Field | Note |
|---|---|
| `vault` | `income` \| `prize` \| `server` \| `cluster` |
| `amount` | Signed |
| `kind` | `challenge_sale` · `split` · `trophy_award` · `redemption` · `pool_allocation` · `payout` · `sweep` · `refund` |
| `refType`, `refId` | What caused it |
| `reason`, `actorId` | Who and why |

| # | Invariant |
|---|---|
| M1 | **Never updated, never deleted.** A correction is a new row |
| M2 | Every balance is `sum(amount)` filtered by vault |
| M3 | **`prizeVault.balance == Σ(unredeemed money-trophy values on live accounts)`** — the invariant the platform rests on |
| M4 | Money enters on **paid**, never on issued |

### `invoices` / `invoice_lines`

| # | Invariant |
|---|---|
| I1 | A total is **its lines**, recomputed. Never a stored number |
| I2 | Overdue is **derived** from the due date. Never a flag |
| I3 | Marking paid is the **only** trigger for vault routing |

### `trophies` and `user_trophies`

`trophies` is the definition; `user_trophies` is one gamer holding one.

| Trophy field | Note |
|---|---|
| `type` | `podium` \| `participation` \| `milestone` |
| `value` | **Immutable.** $0 for participation and milestone |
| `brandId` | Null = generic |
| `challengeId`, `place` | For podium |
| `milestoneKind`, `milestoneGame` | For milestone |
| `name`, `imageUrl` | **Editable — propagates to every holder** |

| # | Invariant |
|---|---|
| T1 | `value` is **immutable after creation** |
| T2 | **Any `value = 0` trophy is unredeemable**, enforced at the redeem action |
| T3 | `Σ(podium values for a challenge) == challenge.prizePool` — guarded at assignment, flagged over **and** under |
| T4 | Unique on `(challengeId, userId, place)` — duplicates impossible |
| T5 | Locked at `ended` |
| T6 | A holder's `user_trophy` survives the holder's deletion as an **orphan**, so the money stays accounted for |

### `redemptions`

| # | Invariant |
|---|---|
| R1 | Requires: 18+, verified email, allowed country, **and a trophy the vault accounts for** |
| R2 | States: `pending` → `approved` → `sent` → `paid`, or `cancelled` / `rejected` |
| R3 | Deletion of the account is **refused** while a redemption is in flight |
| R4 | On `paid`, the prize vault falls by exactly that trophy's value |
| R5 | Stores a method **word** and a provider handle. Nothing else |

### `pool_allocations` and `server_payouts`

| # | Invariant |
|---|---|
| A1 | **`allocation ≤ serverVault ÷ 2`** — refused above, with the reason |
| A2 | An allocation can be raised, never lowered — people were shown the number |
| A3 | Payouts open as **drafts**. A human releases them |
| A4 | A payout's total is its lines |

---

## Servers

### `guilds`

| Field | Note |
|---|---|
| `guildId`, `name`, `memberCount` | |
| `adminRoleId` | **The ID, never the name** — a renamed role must not revoke access |
| `ownerDiscordId` | The guild owner. **Only they touch money** |
| `ownerFirstSignInAt` | Null until they appear. Drives the 4-week reassignment clock |
| `installedByDiscordId` | **Captured at the install redirect or lost forever.** Discord never tells us afterwards |
| `installerWasOwner` | Whether the installer was the guild owner |
| `ownershipTransferAt` · `transferConfirmedAt` | The 14-day timeout and the 7-day withdrawal freeze |
| `eligibilityFrozenAt` · `eligibleThisWeek` | The gun snapshot |
| `announceChannelId` | |
| `community` | Profile. **A server that never described itself is dropped from scoring** |
| `installedAt`, `removedAt` | Removal freezes reach; earnings survive |

### `guild_snapshots`
Weekly member and linked counts. The denominator for the conversion KPI.

### Attribution — see `12-IDENTITY.md` §3

| # | Rule |
|---|---|
| G1 | **Parent server** = first bot click, permanent. **Join server** = where they pressed Join on that challenge |
| G2 | Linked member count → **parent only**. Entrant credit → **½ parent + ½ join** |
| G3 | **Parent = join server → 1.0**, not two halves |
| G4 | Web join, no server context → **1.0 to parent** |
| G5 | No parent at all → everything works, no server earns |
| G6 | A gamer can never change their own parent. **Admin can**, logged |
| G7 | Parent loses the bot → their credit **freezes** |

### `guild_members` is deleted

The ½-split-across-every-server model is replaced by parent + join server. One
gamer, at most two servers, no membership table, no per-server dilution.

---

## Content

| Table | Purpose |
|---|---|
| `content` | Every editable copy key, with a code-side default |
| `settings` | Vault split, feature switches, operator knobs |
| `audit_log` | Every admin action that touches money or access |

| # | Rule |
|---|---|
| N1 | A default must **never state a number the product decides**. It asks for it |
| N2 | Every figure on every page is imported from the module that enforces it |

---

## The checks that should run continuously

| # | Check | If it fails |
|---|---|---|
| 0 | Only the guild owner can withdraw or approve a community spend | 🔴 Refuse |
| 1 | `prizeVault.balance == Σ(unredeemed money-trophies on live accounts)` | 🔴 Alert. The platform's core promise is broken |
| 2 | `Σ(podium trophy values) == prizePool` for every challenge | 🔴 Block the announce |
| 3 | `poolAllocation ≤ serverVault ÷ 2` | 🔴 Refuse the allocation |
| 4 | No `announced` challenge with an unpaid invoice | 🔴 Alert |
| 5 | No column anywhere that could hold a payment detail | 🔴 Fail the build |
| 6 | Every participant has a `baselineAt ≥ challengeStart` | 🔴 Alert |
| 7 | Every challenge past `draft` has an invoice | 🔴 Alert |

Checks 1–3 belong on the admin dashboard as live indicators, not in a nightly
report. Check 5 belongs in the test suite.
