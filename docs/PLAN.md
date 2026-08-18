# The rebuild plan

Written from scratch against `cluster/v3-spec` **0251807**. The previous plan was
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
| **The HTTP surface** | Eight routes in `04-SURFACES` §5 existed only as libraries. Sprint 4a builds them. A library with no endpoint in front of it is a library nothing can call |
| **Two doors into `users`** | Discord sign-in, or email + password. Either reaches every gamer surface. Linking the second **never creates a second row and never merges two** |
| **Attribution** | ½ parent + ½ join · 1.0 when they are the same · 1.0 to parent on a web join · nothing when there is no parent. **Frozen onto the entry at `max(challengeStart, joinedAt)`** |
| **Eligibility** | Frozen at Monday's gun. All three KPIs live, including the conversion denominator |
| **Money** | Only the guild owner. Administrators request; the owner approves |
| **Analytics** | Opt-in per server, **permanent**, survives sign-out. Guild-level cooldown under a platform-wide ceiling. **No dollar may depend on it** |

### What changed since the plan I deleted

| Was in my last plan | Is now |
|---|---|
| Two accounts for one person was an open question | **Ruled and closed: permitted, permanently** (G0d, U4b–U4d, I1c2–I1c4). No merge exists, none is planned, **and none is designed for.** Each account onboards separately and clears **every gate on its own**. They cannot share a game account because **L1 already forbids it** — that, not a merge, is what stops one person scoring twice |
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

## 0.1 · The one failure shape this branch keeps producing

Three of the four worst defects found here were the same shape, and none of them
looked alike from the outside. Read this before writing a guard.

> **Something was proven to EXIST. Nothing was proven to READ it.**

| Where | What existed | What never read it |
|---|---|---|
| `/login/brand` | A page, a form, three redirects pointing at it | The route the form posted to had been deleted. Typecheck cannot see it: **a route is a string** |
| The HTTP surface | Every library, fully tested, 277/277 green | Nothing in front of them. Band 1 calls libraries directly and never goes through HTTP, so a gamer could not press Join |
| **U3, the under-13 block** | A salted fingerprint, written by the age step, proven to survive account deletion (guard 24) | **Two of the three doors that create a `users` row.** A 12-year-old told *"you cannot come back with a different answer"* could come back through either |

The U3 one is the sharpest, because the guard on it was correct. It proved the
evidence survives. It never proved anybody consults it, and **those are different
claims that read identically in a test name.** `docs/TRAPS.md` §18 has the full
write-up; the fix was to move the check to the point the row is created, so every
door inherits it, including doors added later.

So: for every rule you guard, ask **what reads it** — not what writes it. Then
ask whether *every* path that should read it goes through that code. One grep,
before the fix, not after (trap 21).

And write the negative half. Guard 118 proves `refuseIfBlocked` is **not** a
blanket refusal; without it, a function that refuses everybody satisfies the two
guards either side of it.

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

### 2.0 · Where the work has got to

Read this before the sprint tables. Everything above the line is built, guarded
and pushed; everything below is unstarted.

| Sprint | State |
|---|---|
| Stages 1–10 (the ten stages of `08-BUILD-ORDER`) | **Done** |
| 3 · Two doors, one row | **Done** |
| 4 · Onboarding, staff, and the console gate | **Done** |
| 4a · The wiring | **Done** — inserted mid-branch after review; see the table below |
| 5 · Attribution and eligibility | **Done** |
| 6 · Permissions and the owner portal | **Done** — including the carried-in bot-install flow |
| 7 · Opt-in analytics | **Done** |
| 8 · Messages | **Done** |
| 9 · The guild registry and ownership | **Done** |
| 10 · The brand dashboard and the nav | **Done** — band 2 fully green again |
| 10a · The surfaces, and the weekly record | **Done** — inserted after review |
| 11 · Help, progress, and the missing pages | **Done** |
| 12 · The Discord card layouts | **Done** — `NOT_YET_RENDERED` is empty |
| 13 · The series builder, and the rest of admin | **Done** |
| 14 · Proof | **In progress** — mutations, the month run twice, and the screenshot record are done; the final harness pass is the last thing |

**446 tests, 2,628 assertions, 222 guards proven by breaking, 34 mutations,
typecheck gating the band inside `npm test`.** Band 1 is entirely green, and so
is band 2 — now **four** passes, each run twice back to back (trap 14), against
`next build` + `next start` rather than the dev server.

#### What Sprint 14 has closed so far

| | |
|---|---|
| The nine mutations 09 names | Added. Two were wrong when written and both are fixed: *"let an administrator withdraw"* never matched its line, and *"recompute a closed week"* broke the writer's idempotency rather than a reader |
| The harness itself | Refuses a dirty tree; restores on interrupt (the handler used `require` in ESM and never ran); and **checks every mutation applies exactly once before writing anything**, which immediately found a `find` string that was silently testing one of the two paths it named |
| The four-week month | Now a function, run **twice** — once normally, once with `guild_snapshots` **dropped out of the database**. Every week record, payout line, allocation and vault balance compared. Dropped rather than emptied: an empty table still answers a query |
| The screenshot record | `screenshots/gamer-money` (16 shots, 3 of them refusals) and 09's shots 4 and 4a in `screenshots/portals`. Both needed the demo to grow states it had never had |
| Stripe | Confirmed to need no live key: `stripeConfigured()` gates the checkout call, the webhook takes its secret as an argument, and both bands run green with neither `STRIPE_SECRET_KEY` nor `DATABASE_URL` set |

#### And four rules that existed and were read by nobody

The §0.1 shape again, four more times, all found by asking *what reads this?*

| Rule | Who read it |
|---|---|
| `mayWithdraw` — 12 §2's four gates | **Nothing.** The Discord wallet card gated on `ownerDiscordId` alone, so a 13–17 owner was offered a Withdraw button; the web wallet carried the rule as help text |
| S2 — on install, only the guild owner has admin | `checkAdmin` knew it only when a caller passed `guildOwnerId`, and the screen wrapper has a guild *id*. Every owner card refused the owner on day one |
| G5 — a `guild_admins` row is a **pair** | `serverPortalAccess` matched on the guild alone. Any gamer who had linked Discord was an administrator of every server that had ever seen staff |
| R3/V17 — deletion is refused mid-redemption | Sprint 11's find, listed here because it is the same shape and the same cause |

### The mutation count, which the documents disagree about

`09-TEST-PLAN` lists **27** mutations. `tests/mutate.mts` holds **24**, of which
**18** are 09's — the other six were earned by later stages and are not in the
document. So **nine of 09's names have no mutation**, and Sprint 14 owes all
nine:

| 09 mutation | Expected |
|---|---|
| Let an administrator withdraw | ≥ 2 |
| Recompute a closed week instead of reading its record | ≥ 2 |
| Overwrite last week's record at the next gun | ≥ 1 |
| Join the guild's current name instead of the stored one | ≥ 1 |
| Drop ineligible servers from the record instead of recording why | ≥ 1 |
| Put the analytics cooldown on the session instead of the guild | ≥ 1 |
| Ignore the platform ceiling on one server's refresh | ≥ 1 |
| Merge two accounts when a gamer links an already-used identity | ≥ 1 |
| Create a second row when a gamer links their second method | ≥ 1 |

Sprint 14's own row below says *"the 13 new mutations (23 total)"*, which was
written before the harness had the six later-stage ones and is wrong in both
figures. **09 governs and it is nine.** Raised with the owner rather than
reconciled quietly, because that is what this branch exists for.

**Closed.** All nine were added, and one of them became two: 09's *"merge two
accounts when a gamer links an already-used identity"* names one rule with two
implementations — `discordLinkOutcome` and `emailLinkOutcome` end in the same
two lines, character for character. Written as one mutation it silently tested
the Discord path only and reported itself caught, which said nothing at all
about email. **34 mutations now**, and the harness refuses to start if any of
them matches zero places or more than one.

Two things about Sprint 4a, because a fresh session reading straight down will
otherwise assume the numbering skipped: **it is a real sprint, it is complete,
and it is where Stripe lives.** Stripe was originally scheduled in Sprint 14 —
the last one — which put the thing that takes the money after everything that
spends it. `08`'s own ordering rule is *money before anything that spends it*,
so it moved. Sprint 14's entry records the move; this is the second place it is
written down, because one place was not enough to stop the question being asked.

### Sprint 10a · The surfaces, and the weekly record — **inserted after review**

Two things review found, and the second is the larger.

| | |
|---|---|
| **Builds** | `week_records` + `week_credits`, written at the close from the division `/pool` already showed (W1/K12) · `/admin/weeks`, `/admin/weeks/[weekStart]`, `/admin/weeks/[weekStart]/[guildId]` · the week strip on `/admin/servers/[guildId]` · `/admin/servers/[guildId]` itself, all eight sections · the owner portal's **Analytics tab**, complete · the community **request** and **approve** screens · `lib/site/nav.ts` wired into the header |
| **Fixes** | `buildCommunityAction` built **and paid** under `mayRequestSpend` — an administrator moving the guild's money, which P1 forbids, on the sprint whose library existed to prevent it |
| **Governed by** | 07 `week_records`/`week_credits` W1–W7 · 02 K11/K12 · 12 E4 · 05 §6 *The weekly history* |
| **Guards** | 169–178, and the structural one: **every library module must be reachable from a page or a route handler** |

**What it was for.** Sprints 6, 7 and 9 shipped complete, correct, fully guarded
libraries and **no pages**. Every guard called the module directly; not one
asked whether a surface did — §0.1's shape, fourth time. See trap 24.

**And the ruling that overturned §2.0's eligibility design.** Two columns on the
guild row, overwritten every Monday, kept the *number* in `server_payouts` and
lost the *working* — and a disputed payout is exactly when the working is
needed. `week_records` is not a stored derivation: a balance is derived because
its inputs are permanent, and a week's standing is recorded because its inputs
are not. The reasoning is in `07` and in `lib/pool/record.ts`, in both places on
purpose.

#### Carried forward, with an owner and a sprint

Neither of these is a note in a chat log. Both are deliverables of a named
sprint, and both are listed again in that sprint's **Builds** row.

| What | Owner | Why it is not now |
|---|---|---|
| ~~**`tests/band2/portals.mts` is RED**~~ **— re-authored in Sprint 10, green** | Sprint 10, with the brand dashboard | It drives the deleted portal-key model — `input[name="id"]` plus a key, and copy asserting *"there is no password anywhere"*. Sprint 3's brand-login rebuild invalidated the whole premise; it was last touched at `6d2724a`. Repairing it means re-authoring the brand portal's screenshot record against email + password and the one-time invite, which is Sprint 10's job. **A permanently-failing suite is how a suite gets deleted** — trap 19 — so it has a date, not a shrug |
| ~~**The bot-install flow does not exist**~~ **— done in Sprint 6** | Sprint 6, with the owner portal | `botInstallUrl` is exported from `lib/auth/discord.ts` and **called from nowhere.** `/api/auth/discord/install` handles the callback; nothing starts the round trip. So an owner whose server has never had Cluster in it grants `guilds`, `recordGuildOwnership` finds no known guild to record against, and the step never completes. **Right now the page tells the truth and stops there** — *"A server Cluster has never been added to will not show up — add the bot there first and it appears here"* — which is honest and is not a way through. It belongs in Sprint 6, where the guild-permission gate already lives |

### Sprint 3 · Two doors, one row

| | |
|---|---|
| **Builds** | `/api/auth/discord` · `/callback` · `/install` · Discord sign-in · **email + password with the email verified at signup** · password reset for gamers · `brand_users`, the one-time invite, `/api/auth/brand`, brand reset · linking the second method · the shadow account on first bot click |
| **Deletes** | `guilds.portalKeyHash`, `issueOwnerKey`, `ownerByKey`, `/login/server`, the server half of `portal-auth` |
| **Governed by** | 12 §1 · 00 §6 G0–G3 · 07 Identity · 04 §1, §5 · 10 §1 |
| **Guards** | Linking never creates a second row · an already-used identity **routes, never merges** · **two accounts for one person each clear every gate alone** · **L1 refuses the second one the same game account** · a brand invite works once · a brand is never a gamer · the email path's verification is the one redemption uses, asked once |
| **A human can** | Sign up by email, verify, sign out, reset the password, sign back in, link Discord — and be routed to the other account if that Discord is already on one, with both accounts left standing |

### Sprint 4 · Onboarding, staff, and the console gate

| | |
|---|---|
| **Builds** | The one-page fork, **age before any other data is stored**, progress bar, `guilds` requested here · `staff_titles` · `users.staffTitleId` · `/admin/staff` super-admin-only · the console gate reading titles |
| **Deletes** | The `staff` table's single-department column |
| **Governed by** | 12 §2 · 04 §1 · 00 §9 A10–A12 · 07 U7/U8, ST1/ST2 |
| **Guards** | Nothing is stored before the age band · no staff title reaches the gamer directory (ST2) · only the super admin grants a title · a staff grant changes nothing about scoring |
| **A human can** | Walk both onboarding paths, and grant a title as super admin and not as anyone else |

### Sprint 4a · The wiring — **inserted after review**

The gap this closes is the largest found on the branch, and it was found by
audit rather than by anything failing. **Eight routes named in
`04-SURFACES.md` §5 did not exist and were in no sprint.** The libraries behind
them were all written and all tested; nothing was in front of them. Band 1 was
green at 277/277 on a platform where Discord could not reach us, no sync could
run, no payment could land, and the week could neither start nor end — because
band 1 calls the libraries directly and never goes through HTTP.

Same class as the `/login/brand` bug, one level up: a surface nothing tested.

| | |
|---|---|
| **Builds** | `/api/discord/interactions` — raw body for Ed25519, 3-second ACK, deferred work in `after()` · `/api/cron/sync`, `/daily`, `/announce` — authorised, bounded, computing only · `/api/payments/webhook` — the only path to `scheduled`, idempotent on the event id · `/api/pool` · `/api/challenges/[id]/leaderboard` · `/api/auth/[provider]` · `lib/money/stripe.ts` · `lib/core/cron-auth.ts` · `/settings/connections` |
| **Moves** | **Stripe, out of sprint 14.** 08's own ordering rule is *money before anything that spends it*, and sprints 5–13 all assume a paid invoice works |
| **Governed by** | 04 §5 · 05 §9 · 10 §5, §6 · 01-CYCLE's cron table |
| **Guards** | An unset `CRON_SECRET` refuses on a real deployment · a retried Stripe event moves no money · a rotation signature still verifies · **every route §5 names resolves to a handler** |
| **A human can** | Point Discord's interactions endpoint at the deployment and have it verify; fire a Stripe test webhook and watch a challenge reach `scheduled` |

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
| **Builds** | The guild-permission gate (ADMINISTRATOR **or** mapped role ID) · owner vs administrator on every action · `spend_requests` — request → approve · withdrawal owner-only · the 13–17 owner who spends and cannot withdraw · all owner pages rebuilt on Discord identity · **an owner who signed up by email and links Discord later** · **the bot-install flow** — the route that *starts* the round trip `botInstallUrl` was written for, reached from onboarding's `guilds` step and from the owner portal |
| **Carried in** | **The bot-install gap** (§2.0). `botInstallUrl` is exported and called from nowhere, so onboarding's owner path dead-ends for anybody whose server has never had Cluster in it. Sprint 4 answered it with honest copy rather than widening its own scope; this sprint answers it with the route. G1 is the constraint on that route: **who installed the bot is captured at the callback or lost forever** — Discord will never tell us afterwards |
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
| **Builds** | The SaaS shell — side nav, no site nav, docs and guides **inside**, `i` on everything · the brand pages rebuilt into it · *Back to dashboard* · the context switcher · four nav states · **`tests/band2/portals.mts` re-authored** against email + password and the one-time invite |
| **Carried in** | **`tests/band2/portals.mts` is red until this sprint** (§2.0). It still drives the portal-key model Sprint 3 deleted, and its assertions describe copy that no longer exists. It is not repaired in place — the brand portal's screenshot record is rewritten here, alongside the pages it photographs, because a record written against a shell that is about to change would be written twice |
| **Governed by** | 12 §1, §10, §11 · 04 §1, §3 |
| **Guards** | A brand never appears in the switcher · never sees the gamer nav · the audience floor still suppresses |
| **Done when** | The nav is right **and band 2 is fully green for the first time since Sprint 3** |
| **A human can** | Switch between *Playing as …* and each server they manage |

### Sprint 11 · Help, progress, and the missing pages — **done**

| | |
|---|---|
| **Builds** | `i` overlays across both portals · **the owner portal's guides section**, which H2 requires and only the brand portal had · progress bars on onboarding, profile, eligibility, lifecycle, milestones · `/profile` · `/redeem` · `/games` · `/games/[slug]` · `/rules/[who]` · `/legal/*` · `/settings/*` with account, privacy and notifications |
| **Fixes** | The **six-field server profile form**, which `describeCommunity` has accepted since Sprint 5 behind a page with one box · **E2's two states** on the owner's own standings, read from `poolStatesFor`, which only the admin registry had ever called · **`deleteAccount`**, which R3/V17 requires and nothing implemented |
| **Governed by** | 12 §11 · 04 §1 · 02 §5 V14–V17 · 07 R3 |
| **Guards** | 179–190. No progress bar on raw member count (H4), asserted at the chokepoint · one component draws every bar · every portal page carries an `i` · both portals have guides inside them · deletion refused in flight, allowed once landed, and **not** a blanket refusal · a closed account keeps its trophies as orphans · the $0 collectable reaches `/redeem` so its refusal is reachable |
| **A human can** | Read what every number means without leaving the portal — and close their own account, which nothing on the platform could do before this sprint |

**The rule that had a guard and no code.** `50-trophies` carried a case named
*"deletion is refused while a redemption is in flight"* whose body asserted only
that `redemptionsInFlight` counts what it counts. Nothing deleted an account,
and the three suites that needed a deleted gamer each wrote the `UPDATE` by
hand. §0.1 with its halves reversed: usually the evidence exists and nothing
reads it — here the **guard** existed and the **rule** did not, and the test
name read identically either way.

### Sprint 12 · The Discord card layouts — **done**

| | |
|---|---|
| **Builds** | Every family in 04 §4 — home, challenges, games, profile, trophies, server and community — registered into `SCREENS` and imported by the interactions route · **the three announcements**, none of which existed · the first bot click creating the account and stamping the parent (I5/A1) · G5's role accumulation from the payload · `/api/uploads`, the door `acceptImage` was written for |
| **Fixes** | **The close.** `runDailyJobs` ran two of 03 §9's nine steps — no trophies, no draft payout, no week record, no announcement. The four-week simulation ran them by hand, which is why nothing noticed · **`riot-methods.ts`**, the authority on the personal key's 39 paths, was read by nothing · **the card renderer**, which threw on every card because `fonts: []` is not the same as no `fonts` — the fence caught it and the product shipped plain text |
| **Governed by** | 04 §4 · 12 §1 §3 §7 · 03 §9 · 11-PORTED `cards/fonts.ts` · 10 §8 |
| **Guards** | 191–211. A rendered admin card is ephemeral **and** so is its refusal · every family registered · the parent never moves on a second press · the first record holds nothing but the Discord ID · role holders are seen, not enumerated · the winners card names the **frozen** server · the close awards, drafts, records and announces — and never releases · nothing undecodable reaches storage · a card renders with no brand fonts installed |
| **A human can** | Press a button in Discord and get a card back — which, before this sprint, answered *"that screen has gone"* on every screen in the product |

**`NOT_YET_RENDERED` is empty.** All six entries went red as their modules
gained surfaces, which is 09's fifth rule working: an allowance that outlives
what it excused is how a deleted rule comes back. Keep it empty — a new entry
needs a sprint name and a date.

**One thing deliberately not built.** The production image backend. 10 §1 names
`BLOB_READ_WRITE_TOKEN`, so Vercel Blob is the intended store; nothing in this
environment can exercise it, and an integration nobody has ever run is the
shape of code that looks finished and is not. `lib/cards/store.ts` has the seam
(`setImageBackend`) and says which backend is live. **It belongs with 10-SETUP's
deployment step and the owner needs to be told it is outstanding.**

### Sprint 13 · The series builder and the rest of admin — **done**

| | |
|---|---|
| **Builds** | `lib/challenges/series.ts` — `planSeries`, `billForPrize`, `checkTemplates`, `createSeries` · `/admin/challenges/new` with a live preview from the same function that builds it · `/admin/challenges/series/[id]` with the template editor and the guard shown while you type · the twelve pages 05 names and never had: `vaults/ledger`, `trophies/new`, `trophies/templates`, `brands/[id]`, `brands/[id]/draft`, `invoices`, `servers/requests`, `content`, `games`, `cards`, `users/[id]` · all of them in the nav, each classified in `ROUTE_ACCESS` **and** anchored in `91-admin-access` |
| **Governed by** | 05 §2 §3 §4 §5 §6 §8 · 03 §6 §7 · 02 §2 §5 |
| **Guards** | 212–217. The bill rounds **up** so a prize is never under-covered · the bill is derived from the prize and not the reverse · templates are refused over **and** under · every instance starts on its own boundary, in order · one invoice for the whole series · every admin page classified, and the classification anchored |
| **A human can** | Type a $10 daily prize over seven days and watch it price at $140 before anything is created, then turn three templates into twenty-one trophies with the guard passing on each instance |

**The decision the rounding forced.** `splitOf` rounds, so bill → prize is not
injective and something has to absorb the cent. 02 §5 decides it: the prize
vault holds exactly the sum of every unredeemed money-trophy, so the **buyer**
covers it and `billForPrize` rounds up. At the shipped 50/25/25 split the
arithmetic is exact and the question never arises — which is precisely why the
guard had to be written against a split where it does (02 §2: the shares are an
operator setting, not a constant).

### Sprint 14 · Proof

| | |
|---|---|
| **Builds** | The **13 new mutations** (23 total) · the four-week simulation rebuilt on parent + join, **run twice, once without `guild_snapshots`** · the full screenshot record from 09 §Band 2. *(Stripe moved to sprint 4a — money before anything that spends it.)* |
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
| 18a | **Two accounts for one person each clear every gate alone** | `lib/identity/unlock.ts` — inherit the other account's age band | *"a second account onboards from nothing, inheriting neither age nor country"* |
| 18b | **L1 is what stops one person scoring twice** | `lib/identity/accounts.ts` — drop the uniqueness check | *"two accounts cannot link the same game account"* |
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
| 34 | **Every route the spec promises exists** | Delete any handler under `app/api/` | *"every route the spec promises resolves to a handler that exists"* |
| 35 | An unset `CRON_SECRET` refuses | `lib/core/cron-auth.ts` — return ok when unset | *"a cron route with no secret configured refuses on a real deployment"* |
| 36 | A retried Stripe event moves no money | `lib/money/stripe.ts` — drop the `alreadyHandled` check | *"a retried event is a no-op, and still answers"* |
| 37 | A rotation signature still verifies | same — check only the first `v1` | *"a signature from during a secret rotation still verifies"* |

Guard 28 is the one the whole analytics feature rests on, and it is a **whole-
simulation** guard, not a unit test: run the four-week money simulation, drop
`guild_snapshots`, run it again, compare every dollar. If a single figure moves,
analytics is wired into the money.

---

## 5 · The four contradictions — all four ruled, all four fixed

Every one was an error in the specification, and every one is corrected at
`b6ee860`. Recorded here because the next session should know these were found
by reading rather than by shipping them.

| # | What I found | The ruling |
|---|---|---|
| 5.1 | `08-BUILD-ORDER` Stage 9.5 said *"a staff member cannot place in a challenge they touched"*, contradicting 00 A12, 07 U8 and 09 §Staff — in a commit named *"staff win on merit"* | Fixed. It now says they **enter and win on merit, no placement block, build T7 instead**. This was the dangerous one: 08 is the file a future session builds from |
| 5.2 | `05-ADMIN` §6 rule 1 forbade the member-list read that the analytics section on the same page depends on | Fixed. It now matches 12 §7 — never on a path the product depends on, **with the opted-in analytics tab as the one exception** |
| 5.3 | `04-SURFACES` §1 headed onboarding *"no email"* against G2 and I7a | Fixed. **Signup and onboarding are different screens**, and it now says so. Confirmed directly: the email is **verified at signup**, because the password reset depends on it |
| 5.4 | `02-MONEY` KPI 2's denominator was unbounded as written | Fixed. **Both sides parent-scoped, both whole gamers, denominator live** — the only reading bounded at 1.0 |

### The one number the documents leave to me

`12-IDENTITY.md` §7a N8 requires a platform-wide ceiling on member-list pulls but
gives no figure, and Discord publishes a global per-bot rate limit rather than a
member-list quota — so the number is ours.

**It is a row in `settings`, never a constant.** Admin must be able to lower it
the day Discord tightens something, without a deploy. The code ships a named
default and reads the setting; nothing anywhere hard-codes it.

---

## 6 · What I am not doing

| Not doing | Why |
|---|---|
| Opening any old branch | The one rule that matters |
| Migrating `guild_members` into `parentGuildId` | A membership is not a first bot click |
| Building an account merge, **or designing so one is possible later** | G0d, U4b, I1c2. Two accounts for one person are permanent and fine. L1 is what stops one person scoring twice |
| One `isGuildManager` check doing both jobs | The owner/manager split is where every money rule lives. Two functions, always |
| Building a staff placement block | 00 A12, 07 U8, 09 §Staff, and your instruction. T7 instead |
| Writing copy that says we *cannot* read a member list | The intent is app-wide. The sentence is *"we do not read this unless you ask us to"* |
| Reconciling anything in §5 silently | Same reason this branch exists |
| Opening a pull request | Not asked |
