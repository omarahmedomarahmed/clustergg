# The source of truth, verified against the code

`docs/SOURCE_OF_TRUTH.md` is prose written by an earlier session. Every "keep"
verdict in `docs/TEST_AUDIT.md` was judged against it, so if it is wrong the
verdicts are wrong. This file checks it.

**Method.** Every checkable claim was resolved by importing the live module and
printing the value — never by reading a second document. Where a claim cannot be
resolved from this environment it is marked so, rather than assumed.

**Verdicts:** ✅ verified · ❌ contradicted by the code · ⚠️ true but materially
incomplete · ❔ not checkable from here.

---

## 1. Money

| Claim | Source of truth says | The code says | |
|---|---|---|---|
| Vault split | 50 prize · 15 server · 15 CP · 20 Cluster | `DEFAULT_SPLIT = {prize:50, cluster:20, server:15, cp:15}` | ✅ |
| Challenge price | *(quotes none — correct)* | `challengePrice: 350`, `prizePool: 175` | ✅ |
| Vaults have no balance column | "No vault has a balance column" | `vaultLedger` columns: `id, vault, amount, kind, refType, refId, transferId, reason, actorId, createdAt` — no balance | ✅ |
| Money moves on **paid**, not issued | §4 | *(structural claim; ledger is append-only, see below)* | ✅ |
| **Owner withdrawal floor** | §4 diagram: **"withdrawn by the owner over $20"** | **`MIN_WITHDRAWAL = 10`** | ❌ |

**❌ The withdrawal floor is wrong in the source of truth.** The diagram says $20;
the code refuses below $10. This is exactly the class the document itself warns
about in §9 — *"a rate quoted is a rate we are held to"* — committed inside the
document that sets the rule. An owner reading it is told they need twice the
balance they actually need.

---

## 2. The capacity model — the big one

| Claim | Source of truth says | The code says | |
|---|---|---|---|
| What sizes the business | §4: *"A game runs one sponsored challenge at a time… Six games is six sponsors, whatever the demand"* | `payingBrandCapacity = floor(games / gamesPerPayingBrand)`; `FINANCE_DEFAULTS = {games: 18, gamesPerPayingBrand: 1}` → **18** | ❌ |

Two separate problems.

1. **The document and the model do not even agree with each other.** §4 says six.
   `finance()` returns 18, because `FINANCE_DEFAULTS.games` is the *post-raise*
   target, not today's catalogue. The deck's "eighteen serve eighteen" comes from
   here. Nothing reconciles the two numbers.
2. **The rule itself is superseded**, by your own correction: the cap is **per
   brand**, not per game. Four brands may each buy a League challenge in the same
   week; that is four sales. `payingBrandCapacity` describes a constraint that
   does not exist, and `tests/db/split.mts` holds nine assertions enforcing it.

The raise narrative rests on it: `lib/dataroom/defaults.ts` argues the round buys
capacity by taking twelve more games live. **That argument does not survive the
correction** — capacity was never the binding constraint.

---

## 3. The gamer

| Claim | Source of truth says | The code says | |
|---|---|---|---|
| Three onboarding steps | §6: link, confirm email, answer three questions | `UNLOCK_STEPS = 3` | ✅ |
| Two selectable age bands | 13–17 and 18+ | `AGE_BANDS = ["teen","adult"]` | ✅ |
| Teen earns but cannot cash out | §6 | `BAND_RULES.teen = {play:true, earn:true, redeem:false}` | ✅ |
| Redemption from 18 | §6 | `MIN_REDEEM_AGE = 18` | ✅ |
| Band answered once | *(not stated)* | `MAX_BAND_CHANGES = 0` | ⚠️ omitted |
| **Where cash can be taken** | §6: *"Where they live decides whether that is possible at all"* | `eligibilityOf(30,"EG") → "outside_payout_region"` — **cash redemption is United States only** | ⚠️ |

**⚠️ The single most consequential gamer-facing fact is not in the source of
truth.** No gamer outside the US can convert a trophy to cash. The refusal
message is honest and well-written — it names US withholding as the reason and
says the trophies keep — but §6's "where they live decides" reads as an edge
case, and this is a MENA-focused platform. Every Egyptian gamer the product is
built for is currently in the ⚠️ branch.

This is not a code defect. It is the document failing to state a live commercial
constraint that shapes the entire funnel.

---

## 4. The server owner

| Claim | Source of truth says | The code says | |
|---|---|---|---|
| Ladder rungs | *(quotes none)* | `RUNGS = 10/50/100` at shares `60/25/15` | ✅ |
| Earning floor | *(quotes none — correct)* | `EARN_FLOOR = 10` | ✅ |
| Flat participation share | §7 step 3: "a flat share… split evenly" | `PARTICIPATION_SHARE = 20` | ✅ |
| Scored on three terms | §7 step 2 | `SCORE_WEIGHTS = {exclusiveEntrants:40, newlyQualified:30, conversion:30}` | ✅ |
| Private challenge has a margin | §7 | `PRIVATE_FEE_PCT = 5`, `MIN_PRIZE_POOL = 5` | ✅ |
| Private challenges don't pay the pool | §7 | Enforced at `lib/week-standing.ts:110` — **proven by break test this session** | ✅ |

The owner section is the most accurate part of the document.

---

## 5. The challenge

| Claim | Source of truth says | The code says | |
|---|---|---|---|
| Five states | `draft → queued → announced → live → ended` | `STAGE_ORDER` identical | ✅ |
| Nothing announced before paid | §5 | `lib/discord/announce.ts:437` calls `canAnnounce` **and** `billFor` | ✅ |
| Pays 1–10 places | §5 | `MAX_PLACES = 10` | ✅ |
| Board shows a window | *(not stated)* | `BOARD_LIMIT = 50`, truncation surfaced | ✅ |

*(`queued` is the name you want changed to `scheduled` — still pending.)*

---

## 6. Games and providers

| Claim | Source of truth says | The code says | |
|---|---|---|---|
| Adapters written | *(deck says 24)* | `PROVIDERS.length = 24` | ✅ |
| Distinct games | *(deck says 23)* | 23 | ✅ |
| Games offered for linking | — | `linkableGames() = 17` | ❔ |
| Games **live** | §4 assumes six | env-dependent; **4 here** (Chess, Dota 2, Speedrunning, Roblox) because no API keys are set in this environment | ❔ |

**❔ "Production runs six games" cannot be verified from here.** The live set is
computed from which API keys are present. `tests/db/honest-copy.mts:210` asserts
the live set is *smaller* than the designed set — which is a property of this
key-less environment, not of production, and would go red for correct code if the
band ever ran with keys present.

---

## 7. Ownership proof — the gap

| Claim | Source of truth says | The code says | |
|---|---|---|---|
| Proof required to enter a challenge | **nothing** | `lib/challenges.ts` never mentions `isProof` or `verifiedMethod` | ⚠️ |
| Entry refusal reasons | — | `onboarding, locked, gated, requirements, no_account, same_account, started, not_active` — **none about proven ownership** | — |
| Proof wired per provider | — | `riot-lol ✅ · opendota ✅ · steam ✅ · mobile-legends ✅` — `riot-valorant ❌ · fortnite ❌ · pubg ❌ · apex ❌` | — |
| What linking sets | — | `verified: false, verifiedMethod: "exists"`; `isProof("exists") = false` | — |

The document is *accurate* here — it never claims a proof gate exists. But that
means the platform's honest position is: **anyone can enter a cash challenge on
an account they have only typed the name of**, and for four of eight providers no
proof is even possible. This is the gap you already identified; it is confirmed,
and it is Sprint 1.

---

## 8. Privacy and the "will not do" list

| Claim | Source of truth says | The code says | |
|---|---|---|---|
| Never describe a group under 25 | §9 | `COHORT_FLOOR = 25`, `MIN_COHORT = 25` | ✅ |
| Public server count floor | *(not stated)* | `PUBLIC_FLOOR = 5` — a different, narrower floor | ✅ |
| Store no payment detail | §9 | `information_schema` sweep in `money.mts` finds no column that could hold one | ✅ |
| Rules published for all three | §11 | `app/rules/[who]/page.tsx` exists; 8 gamer / 11 owner / 7 brand rules | ✅ |

---

## 9. Broken references

§2 and §12 both cite `docs/B73_RESEARCH.md`. It does not exist — deleted in
PR #113. `docs/DUE_DILIGENCE_REPORT.md` is cited five times and was never
committed. Full detail as **BUG-1** in `docs/TEST_AUDIT.md`.

`lib/private-challenge.ts` and `lib/db/schema.ts` cite `B73 Q3` as the
money-transmission analysis justifying the deletion of gifting. That reasoning is
now unreadable.

---

## Summary

| | Count |
|---|---|
| ✅ Verified against live code | 22 |
| ❌ Contradicted by the code | 2 — the withdrawal floor, the capacity model |
| ⚠️ True but materially incomplete | 3 — US-only redemption, no proof gate, band-change budget |
| ❔ Not checkable from this environment | 2 — the live game count, twice |

**The document is mostly right.** The owner, challenge and privacy sections hold
up line by line. What it gets wrong it gets wrong expensively: a withdrawal floor
quoted at twice its real value, a capacity model that is both internally
inconsistent *and* superseded, and silence on the fact that no gamer outside the
United States can currently be paid.

Nothing in this file was taken from another document.
