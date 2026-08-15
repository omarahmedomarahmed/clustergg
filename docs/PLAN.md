# The rebuild plan

The specification changed on 2026-08-15. `docs/12-IDENTITY.md` is new and ten of
the other documents were edited to agree with it. This file is the audit of what
already exists against the new documents, and the plan from here to done.

**Nothing in `docs/` was written by me. This file is the only document on this
branch that is mine, and it is a plan, not a rule.**

---

## 0 · What actually changed, in one table

Read this first; the audit below only makes sense against it.

| Was | Is now | Governing |
|---|---|---|
| Owner opens their portal with a **portal key** | **Discord sign-in + admin rights on that guild.** The credential is deleted | 00 §7 S1 · 12 §6 P2 · 04 §2 |
| Brand holds a **long-lived portal key** | The key is a **one-time invite**, exchanged once for an **email + password account** in `brand_users` | 00 §8 B1 · 07 `brand_users` · 12 §1 |
| A gamer is a `users` row; a brand is a key | Three kinds. A brand is **never** a gamer, never in the switcher, never sees the gamer nav | 12 §1 I2/I4 · 07 B2 |
| Entrant credit **½ to every server the gamer is in**, read from `guild_members` | **½ parent + ½ join. 1.0 when they are the same.** `guild_members` is **deleted** | 12 §3 · 02 §4 · 07 §Servers |
| Conversion = entrants ÷ linked members, from a **weekly snapshot** | Conversion = **entrants whose parent is this server ÷ linked members**, and the denominator is **live** | 02 §4 K9/K10 · 12 §4 E1 |
| A server is scored if it has a `community` text | Scored only if **eligible at Monday's gun**: `linked ≥ 10` **and** a **six-field** server profile | 12 §4 · 12 §5 |
| Anyone who reaches the owner portal can do anything in it | **Only the guild owner touches money.** Administrators request; the owner approves | 12 §6 · 04 §2 |
| Onboarding is three steps | **One page, two paths**, forked on *"gamer or server owner?"*, both asking age band and country | 12 §2 · 04 §1 |
| Discord OAuth was a config stub | **Three real routes**, one of which captures data that is **lost forever** if it does not | 04 §5 · 12 §8 G1 |

---

## 1 · The audit

Verdicts: **KEEP** untouched · **AMEND** right shape, wrong rule inside ·
**REBUILD** built on an assumption that is gone · **DELETE** should not exist.

Anything touching owner auth, the portal key, guild membership, per-server
credit, pool eligibility, brand login, nav, or who moves money is presumed
REBUILD unless a document line permits otherwise. Where I claim KEEP for one of
those, the line is cited.

### 1.1 Foundation, providers, sync — Stages 0 and 2

| Item | Verdict | Reason |
|---|---|---|
| `lib/db/index.ts`, `lib/db/tx.ts`, `drizzle/` mechanism | KEEP | Transport. No rule touches it |
| `tests/helpers/*` — the one assertion module | KEEP | 09 rule 2 unchanged |
| `tests/run.mts`, `tests/mutate.mts` | AMEND | Harness is right; **7 new mutations** are required by 09 §Band 1 |
| `lib/providers/*`, `lib/core/sync.ts` | KEEP | 11-PORTED unchanged. VALORANT still not live, self-heal still required |
| `lib/core/utils.ts`, `lib/core/secret.ts`, `lib/core/crypto.ts` | KEEP | Unchanged |
| `tests/band1/00,01,02,20,21` | KEEP | Assertion discipline, foundation, structural, providers, sync — none touch identity |
| `tests/band1/03-copy.test.ts` | AMEND | Guard is right; it must also walk the new brand-dashboard and portal pages |

### 1.2 Identity — Stage 1, and the centre of the change

| Item | Verdict | Reason |
|---|---|---|
| `users` table | AMEND | Add `parentGuildId`, `parentStampedAt`, `passwordHash`. `discordId` already exists (07 `users`) |
| `lib/identity/gamers.ts` | AMEND | Must stamp a parent at creation-from-bot, and must never let a gamer set it (A8) |
| `lib/identity/unlock.ts` | AMEND | Still link + age + country (U1), but onboarding is now a **fork** and the owner path substitutes `guilds` scope for the linked account (12 §2). `deriveUnlock` needs a path |
| `lib/identity/age.ts`, `countries.ts` | KEEP | G6–G11 unchanged. Sanctioned list still never offered |
| `lib/auth/session.ts`, `lib/auth/current.ts` | AMEND | Session shape survives; it must now also carry *which* context is selected (12 §10) |
| `lib/auth/discord.ts` | REBUILD | Today it is a URL builder and a `configured()` flag. It needs token exchange, identity, `guilds` when asked, and role reading |
| `app/signup`, `app/onboarding` | REBUILD | 12 §2 is a different page: one page, two paths, age **before any other data is stored** (I7), progress bar, `guilds` requested here and never at signup (I10) |
| `app/goodbye` (under-13) | KEEP | 04 §1 rule 1 unchanged — a link that deletes, never a third button |
| `tests/band1/10-onboarding.test.ts`, `11-session.test.ts` | AMEND | The three-things rule survives; the fork, the parent stamp and the shadow account are new |
| **`/api/auth/discord`, `/callback`, `/install`** | **BUILD** | Do not exist. 04 §5. `/install` captures the installer **or it is lost forever** (12 §8 G1) |

### 1.3 Money, challenges, trophies — Stages 3, 4, 5

| Item | Verdict | Reason |
|---|---|---|
| `lib/money/amounts.ts` | KEEP | 50/25/25, $350, tiers, KPI weights, the half rule, the floor — every figure re-checked against 02 §1–3 and 00 §3. Unchanged |
| `lib/money/ledger.ts`, `invoices.ts`, `prize-vault.ts`, `pool.ts` | KEEP | 02 §5 and 07 M1–M4 unchanged. The invariant is word-for-word the same |
| `lib/money/payouts.ts` | AMEND | Payouts still open as drafts (A3), but a withdrawal **request** is now owner-only and a transfer **freezes withdrawal for 7 days** (T4) |
| `lib/challenges/*` — lifecycle, week, scoring, entry, jobs | AMEND | Lifecycle, baselining and scoring are unchanged. `jobs.ts` gains **the eligibility freeze at the gun** (12 §4), and `entry.ts` must record the **join server** and check membership at entry (12 §7) |
| `lib/trophies/*` | KEEP | 03 §6 and 02 §5 unchanged, five-year hold and sweeps unchanged |
| `tests/band1/30,40,50` | KEEP | Money, challenges, trophies. Re-read against the new docs; no rule they assert has moved |
| `tests/band1/99-full-cycle.test.ts` | REBUILD | It seeds `guild_members` and asserts the old credit model. The four-week shape survives; the fixture does not |

### 1.4 The pool — the arithmetic that changed

| Item | Verdict | Reason |
|---|---|---|
| `lib/pool/score.ts` — `dividePool`, `percentileRank`, flat 20% | KEEP | 02 §4 unchanged: flat 20 / scored 80, weights 40/30/30, percentile ranking |
| `lib/pool/score.ts` — `kpisForWeek` | **REBUILD** | Its entire middle is the deleted model: it reads `guild_members`, builds `guildsOf`, and divides `1/guilds.length` across every server. Replaced by parent + join |
| The `carriedBy` restriction to announced guilds | DELETE | It existed only to bound the ½-across-all-servers split. Parent and join need no such bound |
| K7 "dropped, not scored zero" | AMEND | The mechanism stays; the **test** becomes eligibility (12 §4), not the presence of a `community` string |
| `guild_snapshots` as the conversion denominator | DELETE | E1: the denominator is **live**. See open question 3 |
| `tests/band1/70-pool.test.ts` | REBUILD | Asserts ½-across-all-servers directly |

### 1.5 The portals — Sprint 2, five days old

| Item | Verdict | Reason |
|---|---|---|
| `lib/portal/owner.ts` — `issueOwnerKey`, `ownerByKey` | **DELETE** | S1: the credential is deleted entirely |
| `lib/portal/owner.ts` — `ownerOverview`, `ownerWallet`, `ownerStanding` | AMEND | Shapes survive. They must read the new KPIs, and the standing must show **both** states (E2) |
| `lib/portal/owner.ts` — `ownerMembers` | REBUILD | Reads `guild_members`. Linked members are now **gamers whose parent is this guild** (A3) |
| `lib/portal/owner.ts` — `describeCommunity` | REBUILD | A one-line string becomes the **six-field server profile** with a completeness bar (12 §5) |
| `lib/portal/owner.ts` — `buildCommunityChallenge`, `payCommunityChallenge` | AMEND | Money routing is unchanged (C1/C2). The **request → approve** split is new: an administrator may only request |
| `lib/portal/owner.ts` — `setPayoutPreference`, `setOwnerContact` | AMEND | House rule 5 and the role-ID rule survive intact (P3). Both become **owner-only** for the payout half |
| `lib/portal/session.ts` | **REBUILD** | Built entirely on the portal-key session. Replaced by Discord identity + guild permission |
| `lib/core/portal-auth.ts` — server half | DELETE | No server portal key exists to sign |
| `lib/core/portal-auth.ts` — brand half | AMEND | Brands now hold a password, not a key. The one-time invite still needs constant-time comparison and the lockout |
| `app/portal/server/[guildId]/*` — all 7 pages | REBUILD | Every one is gated by the deleted key, and Settings/Members/Community each encode a deleted rule |
| `app/login/[kind]` — the `server` half | DELETE | 04 §1 lists `/login` and `/login/brand`. There is no `/login/server` |
| `app/login/[kind]` — the `brand` half | REBUILD | Becomes redeem-once-then-email-and-password |
| `app/api/portal/unlock` | AMEND | Survives for the brand invite exchange only; 04 §5 names `/api/auth/brand` |
| `app/portal/brand/[brandId]/*` — all 6 pages | REBUILD | The pages are close to right; the **shell is wrong**. 12 §10: no site nav, a SaaS side nav, docs and guides inside, an `i` icon on everything |
| `lib/portal/brand.ts` — `quote`, `confirmAndPay`, `brandReport`, `suppressSmallGroup` | KEEP | B3–B10 and the reach/entrant rules are unchanged, word for word |
| `lib/portal/brand.ts` — `signUpBrand`, `brandByKey` | REBUILD | `brand_users`, one-time invite, password |
| `tests/band1/80-portals.test.ts` | AMEND | The money and builder halves survive; every key assertion goes |
| `tests/band1/92-portal-screens.test.ts` | REBUILD | It is a test of the portal-key gate |
| `tests/band2/portals.mts` | REBUILD | 24 screenshots of a flow that no longer exists |

### 1.6 Admin — Sprint 1

| Item | Verdict | Reason |
|---|---|---|
| `lib/admin/auth.ts` — `ROUTE_ACCESS`, `accessFor`, fail-closed, `ADMIN_ONLY` | **KEEP** | House rule 7 and 05 §7 are unchanged. This is Cluster staff, not guild permissions — a different axis entirely, and the new documents do not touch it |
| `lib/admin/session.ts`, `app/admin/layout.tsx` | KEEP | Same reason |
| `lib/admin/dashboard.ts` | AMEND | Blocks are unchanged (05 §1). The eligibility indicator is new |
| `app/admin/page.tsx` and the 14 other admin pages | KEEP | 05 is unchanged except §6 |
| `app/admin/servers/page.tsx` | AMEND | Gains ownership and eligibility columns |
| **`/admin/servers/[guildId]`** | **BUILD** | Does not exist. 05 §6 and 12 §8 — seven sections and a refresh button |
| `/admin/challenges/new`, `/series/[id]`, `/vaults/ledger`, `/trophies/new`, `/templates`, `/brands/[id]`, `/invoices`, `/servers/requests`, `/content`, `/games`, `/cards`, `/users/[id]` | BUILD | Named in 05, never built. Listed here so they stop being invisible |
| `tests/band1/90-admin.test.ts`, `91-admin-access.test.ts` | KEEP | Neither asserts anything the change touches |
| `tests/band2/admin.mts` | AMEND | Extended, not replaced |

### 1.7 The website and the bot

| Item | Verdict | Reason |
|---|---|---|
| `app/page.tsx`, `/challenges`, `/trophies`, `/pool`, `/community`, `/servers/[slug]`, `/u/[slug]` | AMEND | Content unchanged; all gain the **context switcher** (12 §10) and the pool page reflects the new KPIs |
| `app/layout.tsx` nav | REBUILD | Four nav states now: gamer, server manager, brand, guest (12 §10) |
| `/profile`, `/redeem`, `/games`, `/rules/[who]`, `/legal/*`, `/settings/*` | BUILD | Named in 04 §1, never built |
| `lib/discord/*` transport, `lib/cards/*` | KEEP | 11-PORTED and 04 §4 unchanged |
| `lib/discord/interactions.ts` | AMEND | **The first click must create the account and stamp the parent** (01 §The Discord bot, 12 §3). The payload's member object is now load-bearing (12 §7) |
| `lib/discord/admin.ts` | AMEND | Role mapping by ID survives; the owner/administrator split is new |
| Card **layouts** per family | BUILD | Still not built. Now includes the owner admin-card family |
| `tests/band1/60-bot.test.ts` | AMEND | Add the parent stamp and the member-object path |

### 1.8 Deletions, in full

| Delete | Blast radius |
|---|---|
| `guild_members` table | `lib/db/schema.ts` · `lib/pool/score.ts` · `lib/demo/seed.ts` · `lib/portal/owner.ts` · three suites |
| `guilds.portalKeyHash` | `lib/portal/owner.ts` · `lib/portal/session.ts` |
| `issueOwnerKey`, `ownerByKey` | `lib/portal/owner.ts` · `tests/band1/80-portals.test.ts` |
| `/login/server` | `app/login/[kind]/page.tsx` |
| The ½-across-every-server logic | `kpisForWeek`'s `guildsOf` / `carriedBy` / `1/guilds.length` block |
| `screenshots/portals/*` (24 files) | Re-shot against the rebuilt flow |

---

## 2 · The sprints, renumbered

The old sprint list is void. Sprint 3 is the structural change itself. Each
sprint ends with something a human can click.

### Sprint 3 · Identity and sign-in

| | |
|---|---|
| **Builds** | `/api/auth/discord` · `/api/auth/discord/callback` · `/api/auth/discord/install` · Discord sign-in for gamers and owners · email + password for gamers · `brand_users` with the one-time invite and `/api/auth/brand` · the onboarding fork (one page, two paths, age before any storage) · the shadow account on first bot click |
| **Deletes** | `guilds.portalKeyHash`, `issueOwnerKey`, `ownerByKey`, `/login/server`, the server half of `portal-auth` |
| **Governed by** | 12 §1, §2 · 04 §1, §5 · 07 Identity · 10 §1 Discord |
| **Guards to break** | A brand account is never a gamer and never reaches the gamer nav · a brand invite key works exactly once · the installer is captured at the redirect · age is asked before any other field is stored |
| **A human can** | Sign in with Discord, walk both onboarding paths, redeem a brand invite once and be refused the second time |

### Sprint 4 · Attribution and eligibility

| | |
|---|---|
| **Builds** | `parentGuildId` + `parentStampedAt` · the attribution module (½ + ½, 1.0, web, none) · `kpisForWeek` rewritten · conversion parent-scoped and live · the eligibility freeze at the gun · the six-field server profile with a completeness bar · "in this week's pool" vs "on track for next week" |
| **Deletes** | `guild_members` · the ½-across-all-servers block · `guild_snapshots` as the conversion denominator |
| **Governed by** | 12 §3, §4, §5 · 02 §4 · 07 §Servers |
| **Guards to break** | Parent = join gives 1.0, not two halves · conversion cannot exceed 1.0 · eligibility does not move mid-week · a gamer cannot change their own parent · linked-member count goes to the parent only |
| **A human can** | Watch a server move from *on track* to *in the pool* across a simulated gun, and see one gamer credited ½ + ½ |

### Sprint 5 · Permissions and the owner portal

| | |
|---|---|
| **Builds** | Guild-permission gate (ADMINISTRATOR **or** mapped role ID) · owner-vs-administrator across every action · community challenge **request → approve** · withdrawal owner-only · the 13–17 owner who spends and cannot withdraw · all seven owner pages rebuilt on Discord sign-in |
| **Deletes** | `lib/portal/session.ts` as it stands · the seven key-gated pages |
| **Governed by** | 12 §6 · 04 §2 · 06 §2 |
| **Guards to break** | An administrator cannot withdraw · an administrator cannot approve a spend · a renamed Discord role does not revoke access · a 13–17 owner may spend and may not withdraw |
| **A human can** | Sign in as an administrator and see withdraw and approve disabled **with the reason**, then as the owner and see them enabled |

### Sprint 6 · The guild registry and ownership

| | |
|---|---|
| **Builds** | `/admin/servers/[guildId]` — all seven sections · the refresh button (owner + roles only, cooled down) · ownership-transfer detection, the 14-day timeout, the 7-day withdrawal freeze · the 4-week reassignment clock · admin sets a gamer's age band and parent, logged · the owner DM on install and at each close |
| **Governed by** | 12 §6, §7, §8 · 05 §6 |
| **Guards to break** | Refresh never requests the member list · a confirmed transfer freezes withdrawal for 7 days · admin setting a parent is logged · reassignment requires ADMINISTRATOR at that moment |
| **A human can** | Open the page an owner's *"why am I not earning?"* is answered from, and press Refresh |

### Sprint 7 · The brand dashboard and the nav

| | |
|---|---|
| **Builds** | The brand SaaS shell — side nav, no site nav, docs and guides **inside**, an `i` icon on everything · the six brand pages rebuilt into it · *Back to dashboard* on the public site · the gamer/server context switcher · the four nav states |
| **Governed by** | 12 §1, §10, §11 · 04 §1, §3 |
| **Guards to break** | A brand never appears in the context switcher · a brand never sees the gamer nav · the audience floor still suppresses |
| **A human can** | Switch between *Playing as …* and each server they manage, and see the server's portal become the homepage |

### Sprint 8 · Help, progress and the missing content pages

| | |
|---|---|
| **Builds** | `i`-icon overlays across both portals · progress bars on onboarding, server profile, pool eligibility, challenge lifecycle · `/profile` · `/redeem` · `/games` · `/rules/[who]` · `/legal/*` · `/settings/*` |
| **Governed by** | 12 §11 · 04 §1 |
| **Guards to break** | No progress bar on raw member count (H4) · no page retypes a figure (C1) |
| **A human can** | Read what every number on both portals means without leaving the portal |

### Sprint 9 · The Discord card layouts

| | |
|---|---|
| **Builds** | Every card family in 04 §4, including the owner admin family · the three announcements · WebP converted on upload, artwork fenced |
| **Governed by** | 04 §4 · 11-PORTED §cards |
| **Guards to break** | A decoration that throws does not take a card down · an admin card is never a public message · a first click stamps the parent |
| **A human can** | See every card rendered as an image in the screenshot record |

### Sprint 10 · The daily series builder, and the rest of admin

| | |
|---|---|
| **Builds** | `/admin/challenges/new` and the series builder (`bill = prize ÷ 0.5`) · trophy templates instantiating a series · the twelve admin pages named in 05 and never built |
| **Governed by** | 03 §7 · 05 §2, §4, §5, §8 |
| **Guards to break** | The bill is computed from the prize and never the reverse · 21 trophies instantiate from 3 templates and the guard still passes |
| **A human can** | Build a 7-day series in one flow and watch the bill compute itself |

### Sprint 11 · Proof

| | |
|---|---|
| **Builds** | The 7 new mutations · the four-week simulation rebuilt on parent + join · the full screenshot record from 09 §Band 2, every flow, every refusal · Stripe wiring that needs no live key |
| **Governed by** | 09 in full |
| **Done when** | Both bands green · every mutation caught · every flow shot including failures · the invariant holds at every step · a human has clicked all four journeys |

---

## 3 · Every database change

### New tables

| Table | Columns | Why |
|---|---|---|
| `brand_users` | `id` · `brandId` · `email` · `passwordHash` · `inviteKeyHash` · `inviteRedeemedAt` · `lastLoginAt` · `lastLoginIp` · `createdAt` | 07 `brand_users`. Separate from `users` **on purpose** (I2) |
| `guild_admins` | `guildId` · `discordId` · `source` (`administrator` \| `mapped_role`) · `seenAt` | The only way to answer 12 §8's *"who currently holds it"* without listing members — see open question 4 |
| `spend_requests` | `id` · `guildId` · `requestedBy` · `kind` · `tier` · `payload` · `state` · `approvedBy` · `approvedAt` | 12 §6 — administrators request, the owner approves. There is nowhere to hold a pending request today |

### New columns

| Table | Column | Why |
|---|---|---|
| `users` | `parentGuildId` · `parentStampedAt` | 07 `users`, 12 §3 |
| `users` | `passwordHash` | I1 — email + password reaches every gamer surface |
| `guilds` | `ownerDiscordId` · `ownerFirstSignInAt` | 07 `guilds`. Drives the 4-week clock |
| `guilds` | `installedByDiscordId` · `installerWasOwner` | G1 — captured at the redirect **or lost forever** |
| `guilds` | `ownershipTransferAt` · `transferConfirmedAt` | T1–T4 |
| `guilds` | `eligibilityFrozenAt` · `eligibleThisWeek` | 12 §4, the gun snapshot |
| `guilds` | `memberAgeRange` · `gamesPlayed` · `bio` · `inviteUrl` · `coverImageUrl` | 12 §5, the six-field profile. `announceChannelId` is the sixth and exists |
| `challenge_participants` | `joinGuildId` | The join server, distinct from the recorded `guildId` |
| `audit_log` | — | Exists. Gains the parent-change and transfer entries |

### Dropped

| Dropped | Existing rows |
|---|---|
| `guild_members` | Dropped. **Not migrated into parent** — a membership is not a parent, and inventing one would stamp a permanent, unchangeable attribution from data that never meant that. Existing demo rows are discarded and reseeded |
| `guilds.portalKeyHash` | Dropped. The credential is deleted (S1) |
| `guild_snapshots.linkedCount` as the conversion denominator | The table survives as history; the denominator is computed live |

### How existing rows are handled

There is **no production database** — `DATABASE_URL` is unset, every environment
is the in-process demo, and house rule 6 forbids writing to a production
database in any case. So every migration below is additive-then-drop against a
database that is rebuilt from the seeder on each run. **If a production database
exists that I have not been told about, this section is wrong and I need to be
told before Sprint 3 runs.**

For `users` rows that predate `parentGuildId`: null, which A7 already defines —
they can do everything and no server earns. That is the correct answer, not a
fallback.

---

## 4 · The guards I will prove by breaking

Every one names the file I will break and the test I expect to go red. The six
the brief names are marked ★.

| # | Guard | File I break | Test that must go red |
|---|---|---|---|
| ★1 | An administrator cannot withdraw | `lib/portal/permissions.ts` — the owner check in `mayWithdraw` | *"an administrator cannot withdraw"* |
| 2 | An administrator cannot approve a spend | same, `mayApproveSpend` | *"an administrator may request and may not approve"* |
| ★3 | A gamer cannot change their own parent | `lib/identity/attribution.ts` — the actor check in `setParent` | *"a gamer can never change their own parent"* |
| ★4 | Conversion cannot exceed 1.0 | `lib/pool/score.ts` — swap the live denominator for the gun snapshot | *"conversion is bounded at 1.0"* |
| ★5 | Eligibility does not move mid-week | `lib/challenges/jobs.ts` — recompute eligibility instead of reading the freeze | *"eligibility is frozen at the gun"* |
| ★6 | A renamed Discord role does not revoke access | `lib/discord/admin.ts` — match the role by name | *"a renamed role still opens the portal"* |
| ★7 | Parent = join gives 1.0, not two halves | `lib/identity/attribution.ts` — remove the same-server branch | *"parent = join is 1.0, not two halves"* |
| 8 | The join server does not get full credit | same — return 1.0 to join | *"entrant credit is ½ parent + ½ join"* |
| 9 | A brand invite key works once | `lib/portal/brand.ts` — skip the `inviteRedeemedAt` check | *"a brand invite key is dead after one use"* |
| 10 | A brand is never a gamer | `lib/auth/context.ts` — let a brand session resolve a gamer | *"a brand account never reaches the gamer nav"* |
| 11 | The installer is captured | `app/api/auth/discord/install/route.ts` — drop the capture | *"who installed the bot is recorded at the redirect"* |
| 12 | Refresh never lists members | `lib/discord/guilds.ts` — call the member list | *"refresh pulls owner and roles only"* |
| 13 | A transfer freezes withdrawal for 7 days | `lib/portal/permissions.ts` — drop the freeze window | *"a confirmed transfer freezes withdrawal"* |
| 14 | A 13–17 owner may spend and may not withdraw | same — collapse the two into one check | *"a teen owner spends and does not withdraw"* |
| 15 | Linked-member count goes to the parent only | `lib/pool/score.ts` — count join-server gamers too | *"linked members are counted for the parent alone"* |
| 16 | Age is asked before any other data is stored | `app/onboarding/actions.ts` — store the country first | *"nothing is stored before the age band"* |

Plus the 7 new mutations required by 09 §Band 1, which are the standing version
of the same question.

---

## 5 · What I believe is wrong, contradictory or impossible

Listed, not reconciled. I have not written code against any of these.

### 5.1 — `00-TRUTH.md` §7 K1 still describes the deleted model

`docs/00-TRUTH.md` line 312 reads:

> K1 · **Exclusive entrants** — split across every server a gamer belongs to

That is the model `12-IDENTITY.md` §3, `02-MONEY.md` §4 and `07-DATA-MODEL.md`
delete. Three documents say ½ parent + ½ join and one says split across every
server, and the one that disagrees is the file whose own header says *"if this
file and the code disagree, stop and ask"*.

**How I read it:** 00-TRUTH was ratified 2026-08-13, 12-IDENTITY on 2026-08-15,
and the later ruling supersedes. Every other document was updated and this line
was missed.

**What I need:** confirmation that this is a missed edit and not a retained
rule. **I will build ½ parent + ½ join.** I am flagging rather than waiting,
because three documents agree and blocking the whole rebuild on one stale line
would be the wrong call — but if I am wrong here, Sprint 4 is wasted, so say so
early.

### 5.2 — Where does a gamer's email come from, and when? **This one blocks.**

Three statements that cannot all hold:

| Where | Says |
|---|---|
| `00-TRUTH.md` G2 | **No email at onboarding** |
| `07-DATA-MODEL.md` `users` | `email` — **"Null until redemption.** Not asked at onboarding" |
| `12-IDENTITY.md` I1 | *"Discord sign-in is **optional**. Email + password reaches every gamer surface"* |

A gamer who signs in with email and password has given us an email at signup, by
definition. So `email` is not null until redemption for that gamer, and
onboarding — or something immediately before it — did ask.

The reconciliations available, and why I will not pick one silently:

1. **Email+password signup is a route, not part of onboarding.** `email` is set
   at signup for those users, `emailVerifiedAt` stays null until redemption
   (G3), and "no email at onboarding" means the bot/Discord path never asks.
   Cheapest, and it is what I would build.
2. **Email+password is sign-**in** only** — an alternative credential added to an
   existing account, never a way to create one. Then `email` really is null
   until redemption, but a gamer with no Discord and no email cannot create an
   account at all, which contradicts *"reaches every gamer surface"*.

These produce different tables, different routes and a different onboarding
page. **I am not choosing.** Which is it?

Interim: Sprint 3 builds Discord sign-in, the brand password path, and the
onboarding fork — none of which depend on the answer — and leaves the gamer
email+password route until you rule.

### 5.3 — `guild_snapshots` contradicts E1

`07-DATA-MODEL.md` still describes `guild_snapshots` as *"Weekly member and
linked counts. **The denominator for the conversion KPI**"*, while
`12-IDENTITY.md` E1 says the conversion denominator is **live, not the gun
snapshot**, and gives the reason (a frozen denominator lets a server score 3.0).

They cannot both be true. **How I read it:** E1 is the newer and the reasoned
one; `guild_snapshots` survives as history and as the eligibility freeze's
evidence, and the denominator is computed live. Low risk, but it is a table
whose stated purpose is now wrong, and I would rather it were corrected in the
document than quietly repurposed in code.

### 5.4 — "Who currently holds the mapped role" cannot be answered as specified

`12-IDENTITY.md` §8 requires the registry to show:

> **Permissions** · Every ADMINISTRATOR · the mapped role (ID **and** current
> name) · **who currently holds it**

And §7 / G3 forbid the only API that answers it:

> **Never list guild members.** `GET /guilds/{id}/members` pages at 1,000 and
> needs the GUILD_MEMBERS privileged intent.
> G3 · Refresh pulls **owner + roles only. Never the member list**

`GET /guilds/{id}/roles` gives every role and its permission bits — so *"every
role with ADMINISTRATOR"* and *"the mapped role's current name"* are both free.
**Who holds a role is only in the member list.** There is no third endpoint.

**What I propose, and will build unless told otherwise:** accumulate holders
from interactions. §7 already says the interaction payload *"contains the member
object — proves membership and gives current roles, free, on every press"*. So
`guild_admins` records each admin we have **actually seen**, with the timestamp
we saw them, and the page reads:

> *3 people seen holding this role. Last seen 2 days ago. This list is built
> from people who have used the bot — somebody who holds the role and has never
> pressed a button will not appear.*

That is honest and it never lists members. What it is not is *"who currently
holds it"*. Confirm the substitution, or tell me the privileged intent is
acceptable after all.

### 5.5 — Smaller, non-blocking, listed so they are not silently absorbed

| # | Where | What |
|---|---|---|
| 1 | `10-SETUP.md` §1 | `PORTAL_SECRET` is still described as signing *"every brand and **server** portal session"*, and §8 says a missing one means *"every portal login fails"*. Server portals no longer have a session to sign. The variable is still needed for the brand invite; the description is stale |
| 2 | `04-SURFACES.md` §2 and §3 | Both portals still list a **Messages · talk to staff** page. There is no table, no logic, no admin inbox, and it was in no stage. I flagged this after Sprint 2 and it is still open. **Not in any sprint above** — tell me if you want it |
| 3 | `12-IDENTITY.md` §6 | *"DM the guild owner"* on install. A bot can only DM a user who allows DMs from server members. It will sometimes fail, silently. I will treat a failed DM as a recorded state the registry shows, not as an error — but the document reads as though delivery is certain |
| 4 | `02-MONEY.md` §4 KPI 2 vs KPI 1 | KPI 1 counts **split credit** (½/½); KPI 2 must count **whole gamers** whose parent is this server, over linked members whose parent is this server, or the 1.0 bound in E1 does not hold. I am confident this is the intended reading — both are parent-scoped head counts — and will build it, but it is an inference, not a line |

---

## 6 · What I am not doing

| Not doing | Why |
|---|---|
| Opening any old branch | The one rule that matters |
| Migrating `guild_members` into `parentGuildId` | A membership is not a first bot click. Inventing a permanent attribution from data that never meant it is exactly the class of error this branch exists to end |
| Reconciling anything in §5 silently | Same |
| Opening a pull request | Not asked |
