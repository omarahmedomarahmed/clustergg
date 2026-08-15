# Build order

Ten stages. Each one ends with something that can be demonstrated, and nothing
depends on a stage after it.

**The rule for every stage: it is not done until a human can click through it and
a test proves the guard by breaking it.**

---

## Stage 0 — Foundation

| Build | Done when |
|---|---|
| Next.js app, TypeScript, Tailwind | It builds |
| Database connection, migration mechanism | A table can be added and reaches production by deploying |
| An in-process database for tests and the demo | Tests need nothing running |
| **The shared assertion module** | One place declaring `ok`, `eq`, `near`. Never re-declared per suite |
| Wire `ported/core/utils.ts`, `ported/db/tx.ts` | — |

**Node 22+.** The pooled driver needs a global `WebSocket`; Node 20 has none and
every money path throws without it.

---

## Stage 1 — Identity

| Build | Done when |
|---|---|
| Signup, login, session | A gamer exists |
| Onboarding: link · age band · country | Three steps, **no email** |
| Under-13 path | Deletes the account, keeps a salted hash |
| `unlockState` — derived, never stored | Nothing accrues until all three are done |
| Wire `ported/core/secret.ts` | — |

**Guard to prove:** break the unlock check and confirm a half-onboarded gamer
can no longer enter a challenge.

---

## Stage 2 — Providers and sync

| Build | Done when |
|---|---|
| Wire `ported/providers/*` | Accounts resolve |
| **Add the `matches` metric** to League: `Δwins + Δlosses` | It appears in the builder |
| **Remove `win_rate`** from scoreable metrics | Percentages are gone |
| Queue becomes a per-challenge setting | Solo, flex or both |
| Mark **VALORANT not live** | It cannot be sold |
| Wire `ported/core/sync.ts` | Hourly pull works |
| **Keep the stale-identifier self-heal** | Including the proven-account guard |
| **Add season-rollover detection** | A decrease re-baselines |
| Ownership proof per provider | Where the API supports it |

**Guards to prove:** break the proven-account guard and confirm a proven account
is no longer silently re-pointed. Break rollover detection and confirm a reset
season no longer zeroes a week.

---

## Stage 3 — Money

Build this **before** anything that spends money.

| Build | Done when |
|---|---|
| `vault_ledger`, append-only | Balances are `sum()` |
| The 50/25/25 split on payment | Vault routing works |
| Invoices — totals are lines, overdue is derived | — |
| **The prize vault as a liability ledger** | Balance equals unredeemed money-trophies |
| Pool allocation with the **half rule** | Over half is refused with a reason |
| Payouts open as drafts | Nothing moves money automatically |

**Guards to prove:** break the half rule and confirm an over-allocation is
accepted (then restore). Break the prize-vault invariant and confirm the check
fires.

---

## Stage 4 — Challenges

| Build | Done when |
|---|---|
| The six states and their transitions | `announced` is impossible without a paid invoice |
| **Baselining: `max(challengeStart, joinedAt)`** | Per participant, per challenge |
| Forced sync on join | Baseline stamped from a fresh read |
| Start-of-week baseline job | The gun is a real event |
| Scoring: `(Δwins × 10) + (Δmatches × 1)` | Clamped ≥ 0 |
| Final sync before close | Placements never on stale data |
| The entry guard chain, in order | Ownership before rank |
| Rank gate — a range, at join only, default off | — |

**Guards to prove:** the day-2 joiner does not bank days 1–2. The early joiner
does not score before the gun. Both, by breaking the baseline rule and watching
the numbers move.

---

## Stage 5 — Trophies

| Build | Done when |
|---|---|
| Trophy definitions and holdings | — |
| **The prize-pool guard** | Over **and** under both flag |
| $0 participation trophy for every entrant | — |
| $0 milestone trophies, with live progress | — |
| **Trophy templates** | A 7-day series does not need 21 hand-made trophies |
| Redemption: 18+, verified email, allowed country, **vault-accounted trophy** | — |
| Five-year hold, sweep, reversible | — |

**Guard to prove:** break the prize-pool guard and confirm trophies worth more
than the pool can be assigned.

---

## Stage 6 — The bot

| Build | Done when |
|---|---|
| Wire `ported/discord/*` | Interactions verify |
| **3-second acknowledgement**, work deferred | Never a timeout |
| Card renderer + the new layouts | — |
| Every gamer card: challenges, join, standings, profile, trophies | — |
| Every owner card, **admin-only, never public** | — |
| Admin role mapping — **role ID, not name** | — |
| Wire `ported/discord/post-queue.ts` | Nothing fans out inline |

**Guard to prove:** a decoration that throws must not take a card down.

---

## Stage 7 — The website

| Build | Done when |
|---|---|
| Homepage: live challenges, countdown, **the live pool** | Refreshes in place |
| `/challenges`, `/challenges/[id]` | — |
| `/trophies`, `/trophies/[id]` | Showcase, not a shop |
| `/pool` | Same function as Friday's close |
| `/servers/[slug]` with a big Join button | — |
| `/community` | — |
| `/u/[slug]`, `/profile`, `/redeem`, `/settings/*` | — |
| Content store with defaults | No page retypes a number |

---

## Stage 8 — Portals

| Build | Done when |
|---|---|
| Wire `ported/core/portal-auth.ts` | Key exchange works |
| **Brand:** signup → key email → setup → builder → pay → reports | Self-serve end to end |
| **Owner:** vault, pool, this week's challenges, re-announce, community builder, wallet | — |
| Every owner page also a bot card | — |

**`PORTAL_SECRET` is required.** Never call it from a decorative path.

---

## Stage 9 — Admin

| Build | Done when |
|---|---|
| **The dashboard** — what is blocking this week | Built first |
| Challenge queue and editor with all seven setup steps | — |
| Vault pages, especially the **prize vault** | — |
| Trophy creation and templates | — |
| Brands, servers, gamers, redemptions, payouts | — |
| **The weekend routine as a checklist with state** | It survives one person being ill |
| The three notifications | Signup · started building · paid |

---

## Stage 9.5 — Identity, attribution and permissions

Everything in `docs/12-IDENTITY.md`. It replaces the portal key.

| Build | Done when |
|---|---|
| `/api/auth/discord/callback` | Token exchange, identity, guild roles. **The route that does not exist yet** |
| Discord sign-in **and** email + password, one `users` row | Linking the second method never creates a second row |
| Password reset — gamers and brands | |
| **Staff are gamers** — `staffTitleId` grants the console, super admin grants the title | They **enter and win challenges they run**, on merit. No placement block. Build **T7** instead: a podium trophy unassigned at `ended` is flagged in the prize vault |
| Brand: key → one-time invite → email + password account | Separate route, separate table from gamers |
| **Messages** in both portals + **two admin inboxes**, refresh in place | An unanswered thread keeps alerting |
| **Opt-in server analytics** — `12-IDENTITY.md` §7a | Granted once and permanent · Update on a guild-level cooldown · platform-wide ceiling · dated snapshots · **no weekly-cycle figure may read one** |
| **Capture the installer** at the install redirect | Sign them in first if they are not |
| Parent-server attribution | First bot click, permanent, ½ + ½ entrant credit |
| Guild owner vs administrator permissions | Only the owner touches money |
| Eligibility frozen at the gun, KPIs live | Conversion denominator live too |
| Onboarding fork — gamer or server owner | Both ask age + country |
| Nav context switcher | Never a brand |
| The guild registry + refresh button | Everything in §8 |
| `i`-icon help overlays, docs inside both portals | |
| Progress bars everywhere | Never on raw member count |
| Delete `guild_members` and the ½-across-all-servers logic | Replaced by parent + join |

**Guards to prove:** an administrator cannot withdraw. A gamer cannot change
their own parent. Conversion cannot exceed 1.0. Eligibility does not move
mid-week. A renamed Discord role does not revoke access. Parent = join gives 1.0
and not two halves. A closed week does not move when a parent is corrected.
The analytics Update cooldown does not reset with a sign-out. **No weekly-cycle
figure reads an analytics snapshot** — drop the table and every dollar in the
four-week simulation is identical.

---

## Stage 10 — Proof

Everything in `docs/09-TEST-PLAN.md`: the full-cycle simulation and the
screenshot pass across every page, every click, every state.

---

## What must be true before any stage is called done

| # | |
|---|---|
| 1 | A human can click through it |
| 2 | Every guard was **proven by breaking it** and watching a test go red |
| 3 | Every number is **imported**, never retyped |
| 4 | Nothing stores a balance |
| 5 | Nothing new can hold a payment detail |
| 6 | If it touches money, there is a ledger row naming who and why |

---

## The order that matters most

**Money before anything that spends it. Baselining before scoring. The prize
vault before trophies. The dashboard before the rest of admin.**

Everything else can move.
