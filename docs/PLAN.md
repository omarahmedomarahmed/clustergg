# The rebuild plan

Written from scratch against `cluster/v3-spec` **3678cba**. The previous plan was
written against an account model that no longer holds and has been deleted, not
edited.

**Nothing in `docs/` except this file is mine. This is a plan, not a rule.**

---

## 0 · The model, as it now stands

Everything below depends on getting this table right, so it is first.

| | |
|---|---|
| **Two account tables** | `users` and `brand_users`. There is no third |
| **Three capabilities on a gamer row** | Server manager · guild owner · Cluster staff. Each is a fact about a `users` row, never a separate account |
| **Two doors into `users`** | Discord sign-in, or email + password. Either reaches every gamer surface. Linking the second **never creates a second row and never merges two** |
| **Attribution** | ½ parent + ½ join · 1.0 when they are the same · 1.0 to parent on a web join · nothing when there is no parent. **Frozen onto the entry at `max(challengeStart, joinedAt)`** |
| **Eligibility** | Frozen at Monday's gun. All three KPIs live, including the conversion denominator |
| **Money** | Only the guild owner. Administrators request; the owner approves |
| **Analytics** | Opt-in per server, **permanent**, survives sign-out. Guild-level cooldown under a platform-wide ceiling. **No dollar may depend on it** |

### What changed since the plan I deleted

| Was in my last plan | Is now |
|---|---|
| Gamer email+password was an open question I refused to build | **Built.** `users.passwordHash`, email at signup **for the email path only**, **verified there** because it is the credential |
| Redemption always asks for an email | The signup verification **is** the one redemption requires. A gamer may never open `/redeem` and still be verified |
| An already-used identity is refused | It gets a **route**: *"You already have a Cluster account — sign in with Discord to reach it."* The spare account is left alone. **Never a merge** |
| No password reset anywhere | **Reset for gamers and for brands** |
| Staff were not modelled | `users.staffTitleId` · `staff_titles` · `/admin/staff`, super-admin-only. **Staff are gamers and win on merit** |
| Messages: flagged, unbuilt, in no sprint | **A sprint of its own.** Both portals, **two** admin inboxes, refresh in place on all four, unanswered threads keep alerting |
| Analytics did not exist | A whole feature — §7a, `guild_analytics_consent`, reworked `guild_snapshots` |
| `guild_snapshots` was the conversion denominator | It is **consent-gated, dated, and nothing in the weekly cycle may read it** |
| `parentGuildIdAtJoin` | **`parentGuildIdAtBaseline`**, frozen at `max(challengeStart, joinedAt)` |
| An owner had to sign in with Discord | An owner may **sign up by email and link Discord later**. Ownership is discovered at sign-in, at link, or on refresh |
| "We cannot read a member list" | **Never write that.** The GUILD_MEMBERS intent is app-wide; per-server consent is *our* gate. The sentence is *"we do not read this unless you ask us to"* |

---

## 1 · The audit

**KEEP** untouched · **AMEND** right shape, wrong rule inside · **REBUILD** built
on an assumption that is gone · **DELETE** should not exist.

Anything touching identity, owner auth, the portal key, per-server credit, pool
eligibility, brand login, nav, or who moves money is presumed REBUILD unless a
document line permits otherwise.

### 1.1 Foundation, providers, sync

| Item | Verdict | Reason |
|---|---|---|
| `lib/db/index.ts`, `lib/db/tx.ts`, `drizzle/` | KEEP | Transport |
| `tests/helpers/*` — the one assertion module | KEEP | 09 rule 2 |
| `tests/run.mts` | KEEP | — |
| `tests/mutate.mts` | AMEND | 09 now lists **23** mutations. 18 exist; **13 are new** |
| `lib/providers/*`, `lib/core/sync.ts`, `lib/core/utils.ts`, `lib/core/secret.ts`, `lib/core/crypto.ts` | KEEP | 11-PORTED unchanged |
| `tests/band1/00, 01, 02, 20, 21` | KEEP | None touch identity |
| `tests/band1/03-copy.test.ts` | AMEND | Must also walk the analytics, messages and staff surfaces |

### 1.2 Identity — the centre

| Item | Verdict | Reason |
|---|---|---|
| `users` table | AMEND | `+parentGuildId` `+parentStampedAt` `+passwordHash` `+staffTitleId`. `email`/`emailVerifiedAt`/`discordId` exist |
| `lib/identity/gamers.ts` | AMEND | Two creation doors, the parent stamp, and the shadow account (I5 — Discord ID and nothing else) |
| `lib/identity/unlock.ts` | AMEND | Still link + age + country (U1). Gains a **path** — the owner path substitutes `guilds` scope for the linked account |
| `lib/identity/age.ts`, `countries.ts` | KEEP | G6–G11 unchanged |
| `lib/auth/session.ts`, `lib/auth/current.ts` | AMEND | Must carry the selected **context** (12 §10) |
| `lib/auth/discord.ts` | REBUILD | A URL builder today. Needs token exchange, identity, `guilds`, roles |
| `app/signup`, `app/onboarding` | REBUILD | One page, two paths, **age before any other data is stored** (I7), progress bar, `guilds` here and never at signup (I10) |
| `app/goodbye` (under-13) | KEEP | 04 §1 rule 1 unchanged |
| `tests/band1/10-onboarding.test.ts`, `11-session.test.ts` | AMEND | The three-things rule survives; two doors, the fork, the parent stamp and the route-not-merge are new |
| `/api/auth/discord`, `/callback`, `/install` | **BUILD** | Do not exist. `/install` captures the installer **or it is lost forever** (G1) |
| `/api/auth/brand`, `/reset` | **BUILD** | Do not exist |
| **Staff** — `staff_titles`, `/admin/staff` | **BUILD** | Does not exist. Super-admin-only (ST1) |

### 1.3 Money, challenges, trophies

| Item | Verdict | Reason |
|---|---|---|
| `lib/money/amounts.ts` | KEEP | Every figure re-checked against 00 §3 and 02 §1–4. Unchanged |
| `lib/money/ledger.ts`, `invoices.ts`, `prize-vault.ts`, `pool.ts` | KEEP | 02 §5, 07 M1–M4 unchanged |
| `lib/money/prize-vault.ts` — the five states | AMEND | **T7 is new**: a podium trophy still unassigned at `ended` is a flagged state, on the dashboard |
| `lib/money/payouts.ts` | AMEND | Owner-only request; the 7-day transfer freeze |
| `lib/challenges/lifecycle.ts`, `week.ts`, `scoring.ts` | KEEP | Lifecycle, baselining and scoring are unchanged |
| `lib/challenges/entry.ts` | AMEND | Records `joinGuildId`, and **freezes `parentGuildIdAtBaseline` at the baseline instant** (P6) |
| `lib/challenges/jobs.ts` | AMEND | The gun also **freezes eligibility** and stamps the frozen parent for early joiners |
| `lib/trophies/*` | KEEP | 03 §6 unchanged |
| `lib/trophies/settle.ts` | AMEND | Must leave an unassigned podium trophy visible to the vault rather than silently passing |
| `tests/band1/30, 40, 50` | KEEP | Re-read against the new docs; no rule they assert has moved |
| `tests/band1/99-full-cycle.test.ts` | REBUILD | Seeds `guild_members` and the old credit model. It also becomes the **drop-the-table** proof (S2) |

### 1.4 The pool

| Item | Verdict | Reason |
|---|---|---|
| `dividePool`, `percentileRank`, flat 20% | KEEP | 02 §4 unchanged |
| `kpisForWeek` | **REBUILD** | Its middle is the deleted model — `guild_members`, `guildsOf`, `1/guilds.length` |
| The `carriedBy` restriction | DELETE | Existed only to bound the deleted split |
| K7 "dropped, not scored zero" | AMEND | Mechanism stays; the **test** becomes eligibility, not a `community` string |
| `guild_snapshots` as the denominator | **DELETE** | S3. The denominator is live, and the table is now consent-gated analytics that no dollar may read |
| `tests/band1/70-pool.test.ts` | REBUILD | Asserts ½-across-all-servers |

### 1.5 The portals

| Item | Verdict | Reason |
|---|---|---|
| `issueOwnerKey`, `ownerByKey`, `guilds.portalKeyHash` | **DELETE** | S1 — the credential is deleted entirely |
| `ownerOverview`, `ownerWallet`, `ownerStanding` | AMEND | Shapes survive; new KPIs, and **both** eligibility states (E2) |
| `ownerMembers` | REBUILD | Reads `guild_members`. Linked members are gamers **whose parent is this guild** (A3) |
| `describeCommunity` | REBUILD | One string becomes the **six-field** profile with a completeness bar |
| `buildCommunityChallenge`, `payCommunityChallenge` | AMEND | Money routing unchanged (C1/C2). **Request → approve** is new |
| `setPayoutPreference`, `setOwnerContact` | AMEND | House rule 5 and the role-ID rule survive; the payout half becomes owner-only |
| `lib/portal/session.ts` | **REBUILD** | Built on the deleted key |
| `lib/core/portal-auth.ts` — server half | DELETE | Nothing left to sign |
| `lib/core/portal-auth.ts` — brand half | AMEND | Still signs the brand session and the invite exchange (10 §1) |
| `app/portal/server/[guildId]/*` — 7 pages | REBUILD | Key-gated, and Settings/Members/Community each encode a deleted rule |
| `app/login/[kind]` — `server` half | DELETE | There is no `/login/server` |
| `app/login/[kind]` — `brand` half | REBUILD | Redeem once → email + password |
| `app/api/portal/unlock` | AMEND | Survives as the brand invite exchange, under `/api/auth/brand` |
| `app/portal/brand/[brandId]/*` — 6 pages | REBUILD | Pages close to right; **the shell is wrong** — SaaS side nav, docs inside, `i` on everything |
| `lib/portal/brand.ts` — `quote`, `confirmAndPay`, `brandReport`, `suppressSmallGroup` | KEEP | B3–B10 and the reach/entrant rules unchanged |
| `lib/portal/brand.ts` — `signUpBrand`, `brandByKey` | REBUILD | `brand_users`, one-time invite, password, reset |
| `tests/band1/80-portals.test.ts` | AMEND | Money and builder halves survive; every key assertion goes |
| `tests/band1/92-portal-screens.test.ts` | REBUILD | It is a test of the portal-key gate |
| `tests/band2/portals.mts` | REBUILD | 24 screenshots of a flow that no longer exists |

### 1.6 Admin

| Item | Verdict | Reason |
|---|---|---|
| `lib/admin/auth.ts` — `ROUTE_ACCESS`, `accessFor`, fail-closed, `ADMIN_ONLY` | **KEEP** | House rule 7 and 05 §7 unchanged. **ST2 explicitly reaffirms it**: the gamer directory stays admin-only *whatever a title says*. Staff titles feed this table; they do not replace it |
| `lib/admin/session.ts`, `app/admin/layout.tsx` | AMEND | Same gate, now reading `staffTitleId` → `staff_titles.departments` instead of the `staff` table's single department |
| `lib/admin/dashboard.ts` | AMEND | Adds the eligibility indicator, **T7's unassigned-trophy flag**, and the unanswered-message alert |
| `app/admin/page.tsx` + 14 pages | KEEP | 05 unchanged except §6 and §8 |
| `app/admin/servers/page.tsx` | AMEND | Ownership, eligibility and analytics columns |
| `/admin/servers/[guildId]` | **BUILD** | 05 §6 + 12 §8 — eight sections now, including Analytics |
| `/admin/inbox/servers`, `/admin/inbox/brands` | **BUILD** | 05 §6. Two surfaces, never merged |
| `/admin/staff` | **BUILD** | 05 §8. Super admin only |
| `/admin/challenges/new`, `/series/[id]`, `/vaults/ledger`, `/trophies/new`, `/templates`, `/brands/[id]`, `/invoices`, `/servers/requests`, `/content`, `/games`, `/cards`, `/users/[id]` | BUILD | Named in 05, never built |
| `tests/band1/90-admin.test.ts` | KEEP | Nothing it asserts moved |
| `tests/band1/91-admin-access.test.ts` | AMEND | Same properties, plus: no title reaches the directory (ST2) |
| `tests/band2/admin.mts` | AMEND | Extended |

### 1.7 Website and bot

| Item | Verdict | Reason |
|---|---|---|
| `/`, `/challenges`, `/trophies`, `/pool`, `/community`, `/servers/[slug]`, `/u/[slug]` | AMEND | Content unchanged; all gain the context switcher |
| `app/layout.tsx` nav | REBUILD | Four states: gamer, server manager, brand, guest |
| `/profile`, `/redeem`, `/games`, `/rules/[who]`, `/legal/*`, `/settings/*`, `/reset` | BUILD | Named in 04 §1, never built |
| `lib/discord/*` transport, `lib/cards/*` | KEEP | 11-PORTED and 04 §4 unchanged |
| `lib/discord/interactions.ts` | AMEND | **First click creates the account and stamps the parent.** The member object becomes load-bearing (12 §7) |
| `lib/discord/admin.ts` | AMEND | Role mapping by ID survives; owner/administrator split is new; **accumulates `guild_admins` from payloads** (G5) |
| Card layouts per family | BUILD | Still not built |
| `tests/band1/60-bot.test.ts` | AMEND | Parent stamp, member object, `guild_admins` accumulation |

### 1.8 Deletions in full

| Delete | Blast radius |
|---|---|
| `guild_members` | schema · `pool/score.ts` · `demo/seed.ts` · `portal/owner.ts` · 3 suites |
| `guilds.portalKeyHash` · `issueOwnerKey` · `ownerByKey` | `portal/owner.ts` · `portal/session.ts` · `80-portals` |
| `/login/server` | `app/login/[kind]` |
| The ½-across-every-server block | `kpisForWeek` |
| `staff` table's single `department` column | Replaced by `staffTitleId` → `staff_titles.departments` |
| `screenshots/portals/*` | Re-shot |

---

## 2 · The sprints

### Sprint 3 · Two doors, one row

| | |
|---|---|
| **Builds** | `/api/auth/discord` · `/callback` · `/install` · Discord sign-in · **email + password with the email verified at signup** · password reset for gamers · `brand_users`, the one-time invite, `/api/auth/brand`, brand reset · linking the second method · the shadow account on first bot click |
| **Deletes** | `guilds.portalKeyHash`, `issueOwnerKey`, `ownerByKey`, `/login/server`, the server half of `portal-auth` |
| **Governed by** | 12 §1 · 00 §6 G0–G3 · 07 Identity · 04 §1, §5 · 10 §1 |
| **Guards** | Linking never creates a second row · an already-used identity **routes, never merges** · a brand invite works once · a brand is never a gamer · the email path's verification is the one redemption uses, asked once |
| **A human can** | Sign up by email, verify, sign out, reset the password, sign back in, link Discord — and be told to sign in with Discord if it is already on another account |

### Sprint 4 · Onboarding, staff, and the console gate

| | |
|---|---|
| **Builds** | The one-page fork, **age before any other data is stored**, progress bar, `guilds` requested here · `staff_titles` · `users.staffTitleId` · `/admin/staff` super-admin-only · the console gate reading titles |
| **Deletes** | The `staff` table's single-department column |
| **Governed by** | 12 §2 · 04 §1 · 00 §9 A10–A12 · 07 U7/U8, ST1/ST2 |
| **Guards** | Nothing is stored before the age band · no staff title reaches the gamer directory (ST2) · only the super admin grants a title · a staff grant changes nothing about scoring |
| **A human can** | Walk both onboarding paths, and grant a title as super admin and not as anyone else |

### Sprint 5 · Attribution and eligibility

| | |
|---|---|
| **Builds** | `parentGuildId` · `parentStampedAt` · `parentGuildIdAtBaseline` frozen at `max(challengeStart, joinedAt)` · `joinGuildId` · the attribution module · `kpisForWeek` rewritten · conversion parent-scoped **and live** · eligibility frozen at the gun · the six-field profile with a completeness bar · both portal states (E2) |
| **Deletes** | `guild_members` · the ½-across-all-servers block · `guild_snapshots` as the denominator |
| **Governed by** | 12 §3, §4, §5 · 02 §4 · 00 §7 K1–K3 · 07 P6, G1–G7 |
| **Guards** | Parent = join is 1.0, not two halves · the join server never gets full credit · conversion cannot exceed 1.0 · **a closed week does not move when a parent is corrected** · a parent that loses the bot freezes · web join → 1.0 to parent · no parent → nobody earns · eligibility does not move mid-week · a gamer cannot change their own parent |
| **A human can** | Watch a server cross the gun from *on track* into *the pool*, and see one gamer credited ½ + ½ |

### Sprint 6 · Permissions and the owner portal

| | |
|---|---|
| **Builds** | The guild-permission gate (ADMINISTRATOR **or** mapped role ID) · owner vs administrator on every action · `spend_requests` — request → approve · withdrawal owner-only · the 13–17 owner who spends and cannot withdraw · all owner pages rebuilt on Discord identity · **an owner who signed up by email and links Discord later** |
| **Deletes** | The seven key-gated pages, `lib/portal/session.ts` as it stands |
| **Governed by** | 12 §1, §6 · 04 §2 · 06 §2 · 00 §7 S0–S10 |
| **Guards** | An administrator cannot withdraw · cannot approve a spend · a **renamed** role does not revoke access · a teen owner spends and does not withdraw · a transfer freezes withdrawal for 7 days |
| **A human can** | Sign in as an administrator and see withdraw and approve disabled **with the reason**, then as the owner and see them enabled |

### Sprint 7 · Opt-in analytics

| | |
|---|---|
| **Builds** | `guild_analytics_consent` · reworked `guild_snapshots` with `takenAt`/`takenBy` · the empty tab and its **Allow analytics** button · the warning and the *"we do not read this unless you ask us to"* sentence · the read-only notice · **Update** on a guild cooldown · the platform ceiling that lengthens every cooldown at once and says why and when · the registry's analytics section |
| **Governed by** | 12 §7, §7a · 07 `guild_snapshots`, `guild_analytics_consent` · 05 §6 · 10 §7 item 0 |
| **Guards** | The grant is permanent and **survives sign-out** · the cooldown is on the **guild**, so signing out does not reset it · the ceiling holds one server's refresh and tells it why · the last snapshot always reads, dated · **no weekly-cycle figure reads a snapshot: drop the table, re-run the four-week simulation, every dollar identical** |
| **A human can** | Grant analytics, refresh, be refused by the cooldown, sign out and back in and be refused by the same cooldown |

### Sprint 8 · Messages

| | |
|---|---|
| **Builds** | `message_threads` + `messages` · a Messages page in **both** portals · `/admin/inbox/servers` and `/admin/inbox/brands` · refresh in place on **all four** · the unanswered-thread alert on the dashboard |
| **Governed by** | 12 §11 H5–H7 · 04 §2, §3 · 05 §6 · 07 MS1–MS3 |
| **Guards** | An unanswered thread keeps alerting until Cluster replies · a brand thread never appears in the server inbox · the alert clears only on a Cluster reply, not on a read |
| **A human can** | Send from a portal, see it in the right inbox, reply, and watch the alert clear |

### Sprint 9 · The guild registry and ownership

| | |
|---|---|
| **Builds** | `/admin/servers/[guildId]`, all eight sections · `guild_admins` accumulated from payloads · the refresh button, owner + roles only, cooled down · transfer detection, the 14-day timeout, the 7-day freeze · the 4-week reassignment clock · admin sets age band and parent, logged · the owner DM, and **a failed DM as a recorded state** |
| **Governed by** | 12 §6, §7, §8 · 05 §6 |
| **Guards** | Refresh never requests the member list · role holders are *seen*, and the page says so · a confirmed transfer freezes withdrawal · setting a parent is logged · reassignment requires ADMINISTRATOR at that moment |
| **A human can** | Open the page that answers *"why am I not earning?"* and press Refresh |

### Sprint 10 · The brand dashboard and the nav

| | |
|---|---|
| **Builds** | The SaaS shell — side nav, no site nav, docs and guides **inside**, `i` on everything · the brand pages rebuilt into it · *Back to dashboard* · the context switcher · four nav states |
| **Governed by** | 12 §1, §10, §11 · 04 §1, §3 |
| **Guards** | A brand never appears in the switcher · never sees the gamer nav · the audience floor still suppresses |
| **A human can** | Switch between *Playing as …* and each server they manage |

### Sprint 11 · Help, progress, and the missing pages

| | |
|---|---|
| **Builds** | `i` overlays across both portals · progress bars on onboarding, profile, eligibility, lifecycle · `/profile` · `/redeem` · `/games` · `/rules/[who]` · `/legal/*` · `/settings/*` |
| **Governed by** | 12 §11 · 04 §1 |
| **Guards** | No progress bar on raw member count (H4) · no page retypes a figure (C1) |
| **A human can** | Read what every number means without leaving the portal |

### Sprint 12 · The Discord card layouts

| | |
|---|---|
| **Builds** | Every family in 04 §4, including the owner admin family · the three announcements · WebP converted on upload, artwork fenced |
| **Guards** | A decoration that throws does not take a card down · an admin card is never public · a first click stamps the parent |

### Sprint 13 · The series builder and the rest of admin

| | |
|---|---|
| **Builds** | `/admin/challenges/new`, the series builder (`bill = prize ÷ 0.5`) · trophy templates · the twelve admin pages named in 05 and never built |
| **Guards** | The bill is computed from the prize, never the reverse · 21 trophies from 3 templates and the guard still passes |

### Sprint 14 · Proof

| | |
|---|---|
| **Builds** | The **13 new mutations** (23 total) · the four-week simulation rebuilt on parent + join, **run twice, once without `guild_snapshots`** · the full screenshot record from 09 §Band 2 · Stripe wiring that needs no live key |
| **Done when** | Both bands green · every mutation caught · every flow shot including refusals · the invariant holds at every step · a human has clicked all four journeys |

---

## 3 · Every database change

### New tables

| Table | Columns | Why |
|---|---|---|
| `brand_users` | `id` · `brandId` · `email` · `passwordHash` · `inviteKeyHash` · `inviteRedeemedAt` · `lastLoginAt` · `lastLoginIp` · `createdAt` | 07 `brand_users` |
| `staff_titles` | `id` · `name` · `departments` · `createdAt` · `createdBy` | 07 `staff_titles` |
| `spend_requests` | `id` · `guildId` · `requestedBy` · `kind` · `tier` · `payload` · `state` · `approvedBy` · `approvedAt` | 07 `spend_requests`. `approvedBy` **must be the guild owner**, enforced |
| `guild_admins` | `guildId` · `discordId` · `source` · `seenAt` | 07 `guild_admins`. Accumulated from payloads, never a member list |
| `guild_analytics_consent` | `guildId` · `grantedBy` · `grantedAt` · `lastPullAt` · `cooldownUntil` | 07. **No session column** — the grant is not a session |
| `message_threads` | `id` · `side` · `guildId` · `brandId` · `lastMessageAt` · `lastAuthorKind` | 07 `messages` |
| `messages` | `id` · `threadId` · `authorKind` · `authorId` · `body` · `sentAt` · `readAt` | Same |
| `password_resets` | `id` · `subjectKind` · `subjectId` · `tokenHash` · `expiresAt` · `usedAt` | I1d. Gamers **and** brands, one mechanism, two subjects |

### New columns

| Table | Column | Why |
|---|---|---|
| `users` | `passwordHash` | G0, I1 |
| `users` | `staffTitleId` | 07 `users`. The grant, not the identity |
| `users` | `parentGuildId` · `parentStampedAt` | 12 §3 |
| `challenge_participants` | `joinGuildId` | P6 — *the only server column on this row* |
| `challenge_participants` | `parentGuildIdAtBaseline` | P6 — frozen beside the baseline |
| `guilds` | `ownerDiscordId` · `ownerFirstSignInAt` | 07 `guilds` |
| `guilds` | `installedByDiscordId` · `installerWasOwner` | G1 |
| `guilds` | `ownershipTransferAt` · `transferConfirmedAt` | T1–T4 |
| `guilds` | `eligibilityFrozenAt` · `eligibleThisWeek` | 12 §4 |
| `guilds` | `memberAgeRange` · `gamesPlayed` · `inviteUrl` · `coverImageUrl` | 12 §5. `community` becomes the one-line bio; `announceChannelId` is the sixth |
| `guilds` | `ownerDmState` | The failed DM as a recorded state (12 §6) |
| `guild_snapshots` | `takenAt` · `takenBy` · `rolesJson` · `roleHoldersJson` | S1. Reworked into a dated analytics reading |

### Dropped

| Dropped | Existing rows |
|---|---|
| `guild_members` | Dropped. **Not migrated into `parentGuildId`** — a membership is not a first bot click, and inventing a permanent, unchangeable attribution from data that never meant that is exactly the error class this branch exists to end |
| `guilds.portalKeyHash` | Dropped. S1 |
| `staff.department` | Replaced by `staffTitleId` → `staff_titles.departments` |
| `challenge_participants.guildId` | Renamed to `joinGuildId` — P6 forbids "a second `guildId` meaning something adjacent" |

### How existing rows are handled

There is **no production database.** `DATABASE_URL` is unset, every environment
is the in-process demo, and house rule 6 forbids writing to a production
database in any case. Every migration is additive-then-drop against a database
rebuilt from the seeder each run. **If a production database exists that I have
not been told about, this section is wrong and I must be told before Sprint 3.**

`users` rows predating `parentGuildId` get null, which A7 already defines: they
do everything, no server earns. That is the rule, not a fallback.

---

## 4 · The guards I will prove by breaking

Each names the file I break and the test I expect to go red.

| # | Guard | File I break | Test that must go red |
|---|---|---|---|
| 1 | An administrator cannot withdraw | `lib/portal/permissions.ts` → `mayWithdraw` | *"an administrator cannot withdraw"* |
| 2 | An administrator cannot approve a spend | same → `mayApproveSpend` | *"an administrator requests and does not approve"* |
| 3 | A 13–17 owner spends and does not withdraw | same — collapse the two checks | *"a teen owner spends and does not withdraw"* |
| 4 | A transfer freezes withdrawal for 7 days | same — drop the window | *"a confirmed transfer freezes withdrawal"* |
| 5 | A renamed Discord role does not revoke access | `lib/discord/admin.ts` — match by name | *"a renamed role still opens the portal"* |
| 6 | **Parent = join is 1.0, not two halves** | `lib/identity/attribution.ts` — remove the same-server branch | *"parent = join is 1.0, not two halves"* |
| 7 | The join server does not get full credit | same — return 1.0 to join | *"entrant credit is ½ parent + ½ join"* |
| 8 | **Web join with no server → 1.0 to parent** | same — return 0 | *"a web join credits the parent in full"* |
| 9 | **No parent → no server earns** | same — credit the join server 1.0 | *"a gamer with no parent earns nobody anything"* |
| 10 | **A parent that loses the bot freezes** | `lib/pool/score.ts` — drop the `removedAt` check | *"a parent that lost the bot gains nothing new"* |
| 11 | **The frozen parent is not read live** | `lib/pool/score.ts` — join `users.parentGuildId` instead of the stamp | *"scoring reads the frozen parent, not the live one"* |
| 12 | **A closed week does not move** | `lib/identity/attribution.ts` — let `setParent` rewrite past entries | *"correcting a parent in week 6 does not move week 3's money"* |
| 13 | Conversion cannot exceed 1.0 | `lib/pool/score.ts` — swap the live denominator for the gun snapshot | *"conversion is bounded at 1.0"* |
| 14 | Linked members count for the parent only | same — count join-server gamers too | *"linked members are counted for the parent alone"* |
| 15 | Eligibility does not move mid-week | `lib/challenges/jobs.ts` — recompute instead of reading the freeze | *"eligibility is frozen at the gun"* |
| 16 | A gamer cannot change their own parent | `lib/identity/attribution.ts` — drop the actor check | *"a gamer can never change their own parent"* |
| 17 | **Linking never creates a second row** | `lib/identity/accounts.ts` — insert on link | *"linking a second method keeps one row"* |
| 18 | **An already-used identity routes, never merges** | same — merge the two | *"an already-linked Discord routes to the other account and merges nothing"* |
| 19 | The email path verifies at signup | `app/signup/actions.ts` — skip verification | *"an email gamer is verified at signup and never asked again"* |
| 20 | A brand invite works once | `lib/portal/brand.ts` — skip `inviteRedeemedAt` | *"a brand invite key is dead after one use"* |
| 21 | A brand is never a gamer | `lib/auth/context.ts` — resolve a gamer from a brand session | *"a brand account never reaches the gamer nav"* |
| 22 | No staff title reaches the gamer directory | `lib/admin/auth.ts` — let a title widen `ADMIN_ONLY` | *"no title reaches the directory, whatever it says"* |
| 23 | Only the super admin grants a title | `lib/admin/staff.ts` — drop the check | *"a title is granted by the super admin alone"* |
| 24 | **T7 — an unassigned podium trophy is flagged** | `lib/money/prize-vault.ts` — drop the state | *"a podium trophy unassigned at ended is flagged in the vault"* |
| 25 | **The analytics cooldown is on the guild** | `lib/analytics/consent.ts` — key it on the session | *"signing out and back in does not reset the cooldown"* |
| 26 | **The grant survives sign-out** | same — expire it with the session | *"the analytics grant is permanent per server"* |
| 27 | **The platform ceiling holds every server** | same — ignore the ceiling for one guild | *"the ceiling lengthens every cooldown and says why"* |
| 28 | **No dollar depends on a snapshot** | `lib/pool/score.ts` — read `guild_snapshots` for the denominator | *"the four-week simulation pays identically with the table dropped"* |
| 29 | An unanswered thread keeps alerting | `lib/messages/threads.ts` — clear on read | *"a thread read but not answered still alerts"* |
| 30 | The two inboxes never merge | same — one query | *"a brand thread never appears in the server inbox"* |
| 31 | The installer is captured | `app/api/auth/discord/install/route.ts` — drop the capture | *"who installed the bot is recorded at the redirect"* |
| 32 | Refresh never lists members | `lib/discord/guilds.ts` — call the member list | *"refresh pulls owner and roles only"* |
| 33 | Age is asked before anything is stored | `app/onboarding/actions.ts` — store country first | *"nothing is stored before the age band"* |

Guard 28 is the one the whole analytics feature rests on, and it is a **whole-
simulation** guard, not a unit test: run the four-week money simulation, drop
`guild_snapshots`, run it again, compare every dollar. If a single figure moves,
analytics is wired into the money.

---

## 5 · What I believe is wrong, contradictory or impossible

Listed, not reconciled.

### 5.1 — `08-BUILD-ORDER.md` still forbids what `00-TRUTH` now permits. **The most dangerous one.**

Stage 9.5, the staff row, "Done when":

> **A staff member cannot place in a challenge they touched**

Three documents say the opposite, and give the reasoning:

| Where | Says |
|---|---|
| `00-TRUTH.md` A12 | *"A staff member wins like anybody else, **including in challenges they run**. They cannot manipulate one… There is no lever to pull"* |
| `00-TRUTH.md` A12a | The catch is **T7**, a trophy unassigned at close flagged in the vault — *"That, not a staff rule, is what catches a trophy going nowhere"* |
| `07-DATA-MODEL.md` U8 | *"A staff member places like anybody else, in any challenge, including ones they run… Manipulation is structurally unavailable, not policed"* |
| `09-TEST-PLAN.md` §Staff | *"they place in challenges they run, on merit, and there is no lever to pull"* |

The commit that changed this is literally named *"staff win on merit"*. 08's
done-when was missed.

**I have your instruction** — *"Do not build a staff placement block; build T7
instead"* — so I am not blocked. **I will build T7 and no placement block.** But
08-BUILD-ORDER is the file a future session reads to know what to build, and it
currently instructs the opposite. Worth a one-line edit at your end.

### 5.2 — `05-ADMIN.md` §6 forbids the analytics feature it also describes

Two lines on the same page:

> §6 rule 1 · **Never list guild members.** One member resolved on demand, never the paged list
> §6 registry · **Analytics** · Granted or not · the last snapshot **and when it was taken** …

A snapshot of "members, roles and who holds them" (07 `guild_snapshots`) is a
member-list read. 12 §7 was updated to make room for it — *"Never list guild
members **on any path the product depends on** … There is **one exception, and it
is opt-in per server**"* — and 05 §6 rule 1 was not.

**How I read it:** 12 §7 is the current form; 05 §6 rule 1 means *never on a path
the product depends on*. **I will build the opt-in exception.** Same page, §6
Permissions also still says *"who holds it now"* where 12 G5 now says *"everyone
we have **seen** holding it"* — the honest version, and the one I will build.

### 5.3 — `04-SURFACES.md` §1 still says onboarding has no email

> ### Onboarding — one page, two paths, **no email**
> Email is asked **only at redemption**, and verified then.

Against 00 G2 (*"The email path asks for one because it **is** the credential —
and verifies it there"*) and I7a.

**How I read it, and it is a distinction worth keeping:** *signup* and
*onboarding* are different screens. The email path collects and verifies at
`/signup`; the onboarding page that follows never asks either door for an email.
So 04's heading is true of onboarding and false of signup. I will build it that
way. Low risk — but if you meant the email path to collect the address without
verifying it until redemption, say so, because I7a says the opposite and it
changes the reset flow.

### 5.4 — `02-MONEY.md` KPI 2 is less specific than `00-TRUTH` K2, and only one reading is bounded

| Where | Denominator |
|---|---|
| `02-MONEY.md` §4 KPI 2 | *"entrants whose parent is this server **÷ linked members**"* |
| `00-TRUTH.md` §7 K2 | *"÷ linked members **whose parent is this server**. Both sides are whole gamers, both sides parent-scoped, and the denominator is **live**"* |

Only the parent-scoped denominator makes the ratio bounded at 1.0, which E1 and
the test plan both require. 12 says 02 and 12 must be read together and neither
is correct alone; 00 K2 is the one that spells it out.

**I will build both sides parent-scoped, as whole-gamer head counts** — not the
½ credit, which is KPI 1's unit and would push conversion under 0.5 for every
split entrant. This is the reading, not a line; correct me if it is wrong,
because it is the difference between a bounded ratio and an unbounded one.

### 5.5 — Smaller, listed so they are not silently absorbed

| # | Where | What |
|---|---|---|
| 1 | `09-TEST-PLAN.md` §Two doors | *"an already-taken identity is **refused with the reason**"* — where I1c1 and U4a say **a route, not a refusal**, and your message says the same. Wording only. I build the route |
| 2 | `12-IDENTITY.md` §7a N8 | *"as the platform approaches **Discord's limit**"*. Discord publishes a global per-bot rate limit, not a member-list quota. The ceiling is therefore **our** number, not one we can read from Discord. I will build it as an operator setting with a named default, so it is visible and tunable rather than a constant nobody can find |
| 3 | `07-DATA-MODEL.md` | `N1`/`N2` are used twice — once for analytics consent, once for content defaults. Harmless; noting it so a future citation is not ambiguous |
| 4 | `12-IDENTITY.md` §1 vs §6 | §1's table names **two** capabilities on a gamer row (server manager, staff). §6 splits manager into **guild owner** and **administrator**, and that split is the entire money boundary. I treat it as three capabilities. Not a contradiction — a table that folds where the rules divide |

---

## 6 · What I am not doing

| Not doing | Why |
|---|---|
| Opening any old branch | The one rule that matters |
| Migrating `guild_members` into `parentGuildId` | A membership is not a first bot click |
| Building a staff placement block | 00 A12, 07 U8, 09 §Staff, and your instruction. T7 instead |
| Writing copy that says we *cannot* read a member list | The intent is app-wide. The sentence is *"we do not read this unless you ask us to"* |
| Reconciling anything in §5 silently | Same reason this branch exists |
| Opening a pull request | Not asked |
