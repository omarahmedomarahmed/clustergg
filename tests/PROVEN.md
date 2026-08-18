# Guards proven by breaking them

House rule 3, and rule 1 of `docs/09-TEST-PLAN.md`: **a green test that has never
failed is not evidence.** Every guard below was proven by breaking the code,
watching the suite go red, restoring, watching it pass, and confirming the
working tree was clean afterwards.

One row per guard. A guard with no row here has not been proven.

**Guard IDs are unique across this whole file and are never reused.** One
continuous series in document order, not one per sprint. This file is the
evidence record — the thing that answers *"prove this guard was tested"* — and
it briefly carried two colliding series, so guard 51 had two different answers.
A duplicate id fails the band (`tests/band1/94-reachability.test.ts`).

---

## Stage 0 — foundation

| # | Guard | The break | What went red | Restored |
|---|---|---|---|---|
| 1 | No column anywhere could hold a payment detail | Added `payoutIban: text("payout_iban")` to `users` | `02-structural` — *"a redemption stores a method word and an opaque handle. Nothing account-shaped"*, naming `lib/db/schema.ts: payout_iban` | `git checkout`, tree clean, 17/17 |
| 2 | No stored balance column | Added `balance: text("balance")` to `users` | `02-structural` — *"no stored balance column, anywhere, ever"*, naming `lib/db/schema.ts: balance` | `git checkout`, tree clean, 17/17 |
| 3 | No suite declares its own assertion helper | A temporary suite declaring `function ok(cond, msg)` | `00-assertion-discipline` — *"assertion helpers are declared in exactly one module and nowhere else"*, naming the offending file and the name it bound | File deleted, tree clean, 17/17 |
| 4 | A suite that asserts nothing fails the band | A temporary suite whose only case computes `1 + 1` | The runner printed *"These suites asserted nothing…"* and **exited 1 while reporting 18/18 cases passed** — which is the whole point: every case green, nothing proven | File deleted, tree clean, exit 0 |

## Stage 1 — identity

| # | Guard | The break | What went red | Restored |
|---|---|---|---|---|
| 5 | Nothing accrues until all three onboarding steps are done | `deriveUnlock` returns `unlocked: true` unconditionally | 4 cases across `10-onboarding`, including *"a half-onboarded gamer cannot enter, and the refusal says why"* | `git checkout`, tree clean, 39/39 |
| 6 | Proof takes a game account from a claim (L2) | The contested branch refuses unconditionally | *"one game account belongs to one gamer, and proof takes it from a claim"* | `git checkout`, tree clean, 39/39 |
| 7 | The age band is set once | The `AgeBandLockedError` throw deleted | *"the age band is set once and never by the gamer again"* | `git checkout`, tree clean, 39/39 |
| 8 | Only `icon`/`oauth`/`openid`/`admin` count as ownership proof | `claimed` and `exists` added to the proof set | 3 cases, including *"an account that merely exists is not an account somebody owns"* | `git checkout`, tree clean, 39/39 |
| 9 | Sanctioned countries are never offered | `DEFAULT_SANCTIONED` emptied | **Nothing. Caught by zero suites** — see below. After the fix: *"the sanctions default is not empty"* | `git checkout`, tree clean, 39/39 |

### The hole break 9 found

Emptying the sanctions list changed a compliance default and **no test noticed.**
The suite iterated the list:

```ts
for (const code of DEFAULT_SANCTIONED) { … }
```

An empty list runs that body zero times. Every assertion in the file stayed
green because the assertions that would have failed never ran — a whole test
switched off by editing the data it read. This is the vacuous-assertion shape
the test plan warns about, arriving through a door nobody had watched.

The fix is two assertions: one that the default is non-empty, and one that
exercises the filter against a fixture list of its own, so the mechanism stays
proven whatever admin later edits the default to. Re-run after the fix: red,
naming the emptied list.

### One process note, learned the expensive way

The first attempt at breaks 5–8 ran against **uncommitted** files, so every
`git checkout --` restore failed with *"pathspec did not match any file"* and
four breaks accumulated on top of each other. The test output was still red, so
it looked like it was working. **Commit before breaking**, and read what the
restore actually printed.

## Stage 2 — providers and sync

| # | Guard | The break | What went red | Restored |
|---|---|---|---|---|
| 10 | VALORANT cannot be sold | The `notLive` check removed from `isProviderLive` | *"VALORANT cannot be sold, whatever keys are configured"* | clean, 63/63 |
| 11 | No percentage can score | Both mechanisms removed from `isScoreable` | *"no ratio, rate or percentage can score a challenge"* + the builder case | clean, 63/63 |
| 12 | The two scoreable mechanisms agree | One metric's `scoreable: false` deleted | *"the explicit flag and the shape rule never disagree"* | clean, 63/63 |
| 13 | League counts matches | The metric and its emission removed | *"League counts matches, from the one call that already returns them"* | clean, 63/63 |
| 14 | A proven account is never re-pointed | `isProven` check replaced with `false` | *"a proven account is never silently re-pointed after a key change"* | clean, 63/63 |
| 15 | A season reset re-baselines | Rollover detection disabled | *"a season reset re-baselines instead of zeroing a week"* | clean, 63/63 |
| 16 | A demotion is not a reset | The ladder exclusion removed | *"a rank going down is a bad week, not a season reset"* | clean, 63/63 |
| 17 | The tight Riot endpoint stays off the hot path | `a.rich` replaced with `true` | **Nothing, first time** — see below. After the fix: the intercept test | clean, 64/64 |
| 18 | The League queue is honoured | `a.queue ?? "solo"` hard-coded to `"solo"` | **Nothing, first time** — see below. After the fix: *"the League adapter reads the queue it was asked for"* | clean, 65/65 |

### Two holes found in one sitting, both the same shape

Breaks 17 and 18 were each caught by **zero suites**, and for one reason: the
sync suite drives a *fake adapter*. It proved that `syncAccount` passes `rich`
and `queue` through to whatever adapter it is given — which is true and worth
knowing — and proved nothing at all about what the **League adapter** does with
them. The endpoint choice and the queue arithmetic both live in the adapter.

A guard has to be asserted where the decision is made. Two tests now intercept
`fetch` and check the adapter's actual HTTP calls and actual arithmetic: that a
routine sync reads `league-v4` and never `summoner-v4`, and that solo, flex and
both each read the queue they name. Re-broken afterwards, both red.

This is the same lesson as the empty-sanctions hole, from a different angle:
**a test that mocks the thing it is meant to be checking is checking the mock.**

## Stage 3 — money

| # | Guard | The break | What went red | Restored |
|---|---|---|---|---|
| 19 | The pool never exceeds half the vault | The ceiling check deleted | *"a pool may never exceed half the vault"* + *"half, twice, is not a way around the half rule"* | clean, 92/92 |
| 20 | The half rule is **a half** | `POOL_MAX_FRACTION_OF_VAULT` set to `1` | **One incidental assertion, first time** — see below. After the fix: 3 cases | clean, 94/94 |
| 21 | The 50/25/25 split | 10% of the prize moved to Cluster | 6 cases across the split, routing and the vault invariant | clean, 92/92 |
| 22 | Over-allocation is refused at assignment | The headroom comparison replaced with `false` | *"over-allocation is refused at assignment, not discovered at payout"* | clean, 92/92 |
| 23 | A duplicate webhook does not pay twice | The already-routed check deleted | *"a webhook that fires twice does not pay twice"* | clean, 92/92 |
| 24 | Community money never reaches vault 3 | `communitySplitOf` replaced with the standard split | *"community money never reaches the server vault"* | clean, 94/94 |
| 25 | A job never moves money | The `actorId` requirement deleted from `releasePayout` | *"releasing requires a person, and moves the money once"* | clean, 94/94 |
| 26 | Money enters on **paid**, never on issued | The `paidAt` check deleted from routing | **Nothing, first time** — see below. After the fix: *"routing refuses an invoice that has not been paid"* | clean, 95/95 |
| 27 | A paid invoice is never overdue | The `!paid` term dropped from the derivation | *"an invoice total is its lines, and overdue is a comparison"* | clean, 95/95 |
| 28 | An allocation is raised, never lowered | The lowering check deleted | *"an allocation can be raised but never lowered"* | clean, 95/95 |

### Break 20: the tests were derived from the rule they were testing

Setting the pool ceiling from a half to the **whole vault** — allocating every
cent of vault 3 into one week's pool, which is precisely the failure the rule
exists to prevent, and which would leave nothing to claw a refund back from —
was caught by *one* assertion, and only incidentally, in the worked example.

The dedicated half-rule test computed its own ceiling with
`maxAllocationCents(vault)`, so when the constant changed, the expectation
changed with it and the test stayed green. Every money test had the same shape:
import the number, derive the expectation, assert they match. That is the right
rule for a *page* — no surface may retype a figure — and it is exactly wrong for
the test that guards the figure.

Two fixes: an **anchor test** that is the one file permitted to state the
ratified values literally, and a half-rule test whose arithmetic
(`Math.floor(vault / 2)`) never touches the constant. Re-broken: three red.

### Break 26: a guard only ever called with the answer it wanted

Deleting the "an unpaid invoice does not reach a vault" check changed nothing,
because every path into routing goes through `markPaid`, which sets `paidAt`
first. The guard was real, reachable and completely untested — nothing ever
called it in the state it existed to refuse.

## Stage 4 — challenges, baselining and scoring

| # | Guard | The break | What went red | Restored |
|---|---|---|---|---|
| 29 | `baseline = max(challengeStart, joinedAt)` | Always `challengeStart` | 1 case, first time — see below. After the fix: 3, including the day-2 joiner and the two-challenges case | clean, 127/127 |
| 30 | The same, the other way | Always `joinedAt` | *"the rule is max(...)"* + *"the early joiner does not score for the week before the gun"* | clean, 127/127 |
| 31 | Ownership is required where the API supports it | The proof check replaced with `false` | *"ownership is checked before rank"* | clean, 127/127 |
| 32 | A challenge cannot be announced until it is ready | The readiness check bypassed | **Nothing, first time** — see below. After the fix: *"a paid challenge whose trophies do not match the pool cannot be announced"* | clean, 128/128 |
| 33 | Start is always a period boundary | The boundary check bypassed | *"there is no date picker, and the model is what enforces it"* | clean, 128/128 |
| 34 | Nothing announces itself | The `actorId` requirement deleted | *"nothing announces itself"* | clean, 128/128 |
| 35 | A decline never subtracts | `Math.max(0, …)` removed | *"a decline never subtracts"* | clean, 128/128 |
| 36 | The rank gate is a range | The floor check bypassed | *"the rank gate is a range, and the refusal shows the numbers"* | clean, 128/128 |
| 37 | The final sync lands inside the scoring window | The close's `at` removed | *"placements are written once, on a final sync"* | clean, 128/128 |

### Break 29 found two silent production bugs

Forcing the baseline to `challengeStart` was caught by the pure-function test
and **not** by the day-2-joiner test, which is the case the rule exists for.
The reason: `enterChallenge` stamped the **date** from the rule and the
**values** from `now`. For a day-2 joiner those are the same instant, so the
score came out right while the stored `baselineAt` was a lie.

Reading the baseline values *as at the baseline instant* fixed it — and
immediately exposed two bugs of the same shape, both of which would have been
silent in production:

1. **The forced sync on join** stamped its reading a few milliseconds *after*
   the join instant. Scoring reads `observedAt <= baselineAt`, so the gamer
   would have baselined on the reading taken **before** their forced sync —
   precisely the stale reading that forced sync exists to prevent (B1).

2. **The final sync at the close** stamped `now`, which is necessarily *after*
   `endAt`. Its reading fell outside the scoring window, so the sync was an
   expensive no-op and placements were decided on the last hourly reading —
   exactly what B3 forbids. Nothing would have thrown. The leaderboard would
   simply have been slightly wrong, every week, forever.

Both now stamp at the instant they represent. Guard 37 exists to keep the
second one fixed.

### Break 32: another guard never called in the state it refuses

Same shape as break 26 in Stage 3. Every test either announced a
correctly-set-up challenge or was stopped earlier by the unpaid check, so
deleting the readiness check inside `announce` changed nothing — a paid
challenge whose trophy values did not equal its prize pool could have gone out
to every server.

## Stage 5 — trophies, milestones, redemption and sweeps

| # | Guard | The break | What went red | Restored |
|---|---|---|---|---|
| 38 | A trophy cannot be worth more than the vault holds | `assertHeadroom` deleted from `awardTrophy` | *"an award with no money behind it is refused"* | clean, 154/154 |
| 39 | A $0 trophy is unredeemable **at the action** | The zero-value check bypassed | *"a $0 trophy is unredeemable at the action, not merely hidden"* | clean, 154/154 |
| 40 | Only 18+ may redeem | The age check bypassed | *"a teen keeps the trophy and is told when they can have it"* | clean, 154/154 |
| 41 | A collectable can never carry money | The type/value check bypassed | *"a collectable can never carry money"* | clean, 154/154 |
| 42 | A sweep is reversible | The sweep deletes the holding instead of parking it | *"a sweep is reversible, and re-funds the trophy"* | clean, 154/154 |
| 43 | Both sides of the invariant move together on payout | The holding is no longer marked redeemed | *"the full redemption sequence…"* + *"the same trophy cannot be redeemed twice"* | clean, 154/154 |
| 44 | Consecutive means consecutive | A gap no longer resets the run | *"consecutive weeks means consecutive, and a gap resets"* | clean, 154/154 |
| 45 | A verified email is required to redeem | The check bypassed | *"email is asked only at redemption, and must be verified"* | clean, 154/154 |
| 46 | The five-year hold is five years | The expired-sweep window opened to everything | *"an expired sweep takes only what is actually five years old"* | clean, 154/154 |
| 47 | A duplicate award is a no-op | The already-held check deleted | 3 cases, including settlement and milestones | clean, 154/154 |

### A note on the band's speed, which is a correctness matter

Proving a guard runs the whole band twice. At one PGlite instance per test the
band took four minutes, so each guard cost eight — and a proof that is
expensive is a proof that gets skipped. `resetDemoDb` now truncates instead of
rebuilding: **four minutes to eleven seconds**, same 154 tests, same isolation.
The table list is read from `pg_tables` rather than kept in the code, for the
same reason every other guard here walks the tree.

## Stage 6 — the bot

| # | Guard | The break | What went red | Restored |
|---|---|---|---|---|
| 48 | A decoration may never take a card down | `fence` rethrows | *"a decoration that throws does not take the card down"* | clean, 175/175 |
| 49 | Acknowledge within three seconds | The work awaited before the response | *"the acknowledgement is sent before any work happens"* + *"a slow screen cannot delay the acknowledgement"* | clean, 175/175 |
| 50 | An owner card is never public | `ownerOnly` stops setting `ephemeral` | *"an owner card is never a public message, including its refusal"* | clean, 175/175 |
| 51 | The admin role is stored by ID | The snowflake check bypassed | *"the admin role is stored by ID, so renaming it revokes nothing"* | clean, 175/175 |
| 52 | The renderer cannot decode WebP | Any `image/*` treated as renderable | 3 cases, across the check and both upload paths | clean, 175/175 |
| 53 | `group` never reaches Discord | The strip in `rows()` removed | *"`group` is ours, not Discord's, and never reaches the wire"* | clean, 175/175 |

## Stage 7 — the website, and the pool computation

| # | Guard | The break | What went red | Restored |
|---|---|---|---|---|
| 54 | No page retypes a figure | The homepage states the price instead of importing it | *"no page retypes a price, a share or a threshold"* | clean, 192/192 |
| 55 | A gamer in two servers is worth ½ to each | The split divisor removed | *"a gamer in two servers is worth half to each"* | clean, 192/192 |
| 56 | A fifth of every pool is split evenly | The flat share zeroed | *"a fifth of every pool is split evenly, because turning up is worth something"* | clean, 192/192 |
| 57 | An undescribed server is dropped, not scored | The community check bypassed | *"a server that never described itself is dropped, not scored zero"* | clean, 192/192 |
| 58 | Community challenges feed no weekly pool | The `sponsored` filter deleted | **Nothing, first time** — see below. After the fix: *"a community challenge contributes nothing to the pool"* | clean, 192/192 |
| 59 | An entrant who never plays lowers the score | Every entrant counted as activated | *"an entrant who never plays lowers the server's score"* | clean, 192/192 |

### Break 58: excluded by the wrong filter

Deleting the `visibility = sponsored` condition changed nothing, because the
test's community challenge was only `scheduled` — the **state** filter excluded
it and the visibility filter was never exercised at all. The test looked like
it proved K8 and proved something else that happened to be true.

Announcing it in the fixture makes the visibility filter the only thing
standing between that entrant and the pool. Re-broken: red.

### And one rule that needed a table nobody had built

K1 splits an entrant "across every server a gamer belongs to" and G2 makes that
½ each. Neither is expressible from `challenge_participants`, which is unique
on (challenge, gamer) — P4 — so it records the one server they clicked Join in
and cannot record the three they are in.

Without a membership table the ½ rule silently becomes *"whole credit to
whichever server they happened to click in"*, and two servers carrying the same
gamer sum to two entrants — precisely what K5 forbids. `guild_members` exists
for that one rule.

## Stage 8 — the portals

| # | Guard | The break | What went red | Restored |
|---|---|---|---|---|
| 60 | Portal keys are hashed and compared in constant time | Compared against the raw value | 3 cases across owner and brand keys | clean, 214/214 |
| 61 | A removed bot errors with what to do | The removal check bypassed | *"the portal survives the bot being removed, and says what to do"* | clean, 214/214 |
| 62 | A brand cannot buy a game we cannot score | The liveness check bypassed | *"a brand cannot buy a game we cannot score"* | clean, 214/214 |
| 63 | A brand cannot buy a week that has started | Both week-floor checks bypassed | *"a brand cannot buy a week that has already started"* | clean, 214/214 |
| 64 | Owner money never reaches vault 3 | `communitySplitOf` replaced with the standard split | 2 cases, including the end-to-end builder path | clean, 214/214 |
| 65 | No group under the audience floor is described | The floor lowered to 1 | *"no group smaller than the floor is ever described"* | clean, 214/214 |

## Stage 9 — admin

| # | Guard | The break | What went red | Restored |
|---|---|---|---|---|
| 66 | A challenge that missed its week is the loudest row | The started-and-unannounced check bypassed | *"a challenge whose week started and never announced is the loudest row"* | clean, 228/228 |
| 67 | The dashboard names the specific blocker | Replaced with *"Needs attention"* | *"the dashboard names the specific thing blocking each challenge"* | clean, 228/228 |
| 68 | The prize-pool check is live, not a report | The continuous check bypassed | *"a prize-pool mismatch on an announced challenge is flagged on the dashboard"* | clean, 228/228 |

## Stage 10 — proof

The mutation harness (`npm run mutate`) is the standing version of this
document: 18 mutations, each a small plausible silent change, **18 caught**,
zero holes. It always restores — try/finally, a signal handler, and a byte
comparison after each one — and it fails loudly when a mutation stops applying,
because a mutation that cannot apply reports as "caught by zero", which reads
exactly like a genuine hole.

The four-week simulation asserts the prize-vault invariant and the ledger
balance **after every state change** across four weeks, which is requirement 4
of "what done means".

| # | Guard | The break | What went red | Restored |
|---|---|---|---|---|
| 69 | The band can tell working code from broken | 18 mutations, one at a time | 18 of 18 caught | every file byte-compared after restore |

### One guard that fired before anyone broke it

`02-structural`'s first case asserts that the tree-walk actually reached the
schema — that it found `display_name`, and that it read a `.sql` file. On the
first run it went red: `repoRoot` was computed with one `dirname` too few and
resolved to `tests/`, so the walk covered no application code at all.

Without that case, the payment-detail guard and the stored-balance guard would
both have passed — over an empty list — and Stage 0 would have shipped two
guards that guarded nothing. That is the same defect class as the three dead
assertions in the old weekly close, caught this time because the canary was
written before the guard was trusted.

---

# Sprint 1 — the admin screens

Fifteen pages over `lib/admin/dashboard.ts`, which was already tested. The only
new *logic* is the access gate, so that is what was broken.

| # | Guard | The break | What went red | Restored |
|---|---|---|---|---|
| 70 | The gamer directory is admin-only | `/admin/users` and `/admin/linked-accounts` changed to `departments("admin","support")` | 4 cases, across the kind test, the department matrix and the widening sweep | clean, 238/238 |
| 71 | An unclassified route fails closed | `accessFor`'s fallback changed from `ADMIN_ONLY` to the dashboard's rule | *"an unclassified route fails closed"* | clean, 238/238 |
| 72 | `/admin` matches exactly, so the root cannot match as a prefix | The `.filter((r) => r !== "/admin")` line removed **and** the early return removed | *"an unclassified route fails closed"* | clean, 238/238 |

### Guard 72 was caught by zero suites the first time, and the fault was mine

The first attempt at breaking it removed the wrong line — the early return,
which fails *more* closed, not less — so nothing went red and the guard looked
unproven. The line that actually carries the property is the `.filter`.
Removing both is what re-broke it, and the fail-closed case then went red.

The lesson is narrow and worth keeping: **a break that does not go red has two
explanations, and "the test is blind" is only one of them.** Check that the
break actually changes behaviour in the direction the guard forbids before
recording a hole.

### And one assertion that was missing

Failing closed everywhere is not correct either. The fix for the prefix bug
excludes `/admin` from prefix matching, and a careless edit to that exclusion
would lock all four departments out of the dashboard — a bug the fail-closed
test cannot see, because it only checks the tight direction. Added:

> *"the dashboard itself is reachable by every department"*

which is the counterpart, and would have gone red on that edit.

---

# Sprint 2 — the portal screens

Fifteen pages over `lib/portal`, which was already tested, plus three pieces of
new logic that the pages could not have been written without. All three fail
silently when wrong, which is why all three are here.

| # | Guard | The break | What went red | Restored |
|---|---|---|---|---|
| 73 | With a database configured, no session means no portal | `mayOpenPortal` returns `true` unconditionally | *"with a database configured, no session means no portal"* | clean, 248/248 |
| 74 | A portal session is for exactly one portal | The portal's id removed from the cookie **name** | *"a portal session is scoped to one portal, by construction"* | clean, 248/248 |
| 75 | An account number cannot be stored as a payout handle | The check bypassed | *"an account number cannot be typed into the payout handle"* | clean, 248/248 |
| 76 | …and specifically the digit **count**, not the run length | Reverted to the original `/\d[\d\s-]{10,}/` | same case, on the UK sort-code-and-number string | clean, 248/248 |
| 77 | The admin role is an ID, never a name | The format check bypassed | *"the admin role is stored as an ID, never a name"* | clean, 248/248 |
| 78 | The lever is the weakest **rank**, not the heaviest weight | Sorted by weight instead of rank | *"the lever names the weakest KPI, not the loudest one"* | clean, 248/248 |
| 79 | A dropped server has no position at all | Returned `ordered.length + 1` — last place | *"a dropped server is told it is out of the run, not ranked last"* | clean, 248/248 |
| 80 | The standings are ordered best-first | Sort direction flipped | *"a standing is a position, a field size, and a lever"* | clean, 248/248 |

### The gate had a part no test could reach, so it was split

`lib/portal/session.ts` needs `next/headers`, so nothing in it was assertable
from the logic band — including the **direction of its default**, which is the
one part of an access gate that can be catastrophically wrong while looking
completely normal. A demo fence that quietly stopped being a fence opens every
portal on a real deployment and nothing looks different until somebody reads
somebody else's numbers.

`mayOpenPortal({hasSession, isDemo})` is that decision with the request taken
out of it. Guard 73 is what the split bought.

### Guard 76 is a regression test for a bug this sprint's own test found

The first `accountShaped` was `/\d[\d\s-]{10,}/` — a long enough *run* of
digits, spaces and hyphens. It let `"sort 20-00-00 acct 55779911"` straight
through, because the words break the run into two short ones. That is a UK bank
account written the way a person writes one, in the field asking how they want
to be paid.

The test asserted the refusal before the code could do it, and went red. It now
counts digits per group instead of measuring a run, and guard 76 puts the old
version back to prove the difference is load-bearing.

### And one guard that was never in the default command

`npm run test:browser` ran `site.mts` only. The admin browser pass written in
sprint 1 — 39 assertions, 16 screenshots — was real, passed, and **was not run
by the documented command**. A test nobody runs is a test that is already
broken; it just has not been told yet. The script now runs all three passes.

---

# Sprint 3 — two doors, one row

The specification changed underneath the build twice. This is the first sprint
of the rebuild: Discord OAuth, the email door, the brand's own table, and the
deletion of the server-owner portal key.

| # | Guard | The break | What went red | Restored |
|---|---|---|---|---|
| 81 | Linking a second method updates one row | Insert instead of update | *"linking a second method updates one row and never creates another"* | clean, 264/264 |
| 82 | An already-used identity **routes, never merges** | The `elsewhere` branch made to steal the identity from the other account | *"an identity already on another account is a route, never a merge"* | clean, 264/264 |
| 83 | Each account clears every gate on its own | `deriveUnlock` made to default age, country and a link | 5 cases across three suites | clean, 264/264 |
| 84 | **L1 is what stops one person scoring twice** | The collision refusal in `linkAccount` bypassed | 2 cases, in two suites | clean, 264/264 |
| 85 | The email door's verification is redemption's | `emailVerifiedAt` no longer written | **7 cases**, including the four-week simulation | clean, 264/264 |
| 86 | A brand invite works exactly once | The `inviteRedeemedAt` check bypassed | *"a brand invite works exactly once"* | clean, 264/264 |
| 87 | The parent is stamped at the first click | The early return made conditional, so a later click re-stamps | *"the parent is stamped at the first click and never re-stamped"* | clean, 264/264 |

### The break that proved the guard was somewhere else

Attempt one at guard 84 removed `uniqueIndex` from `linked_game_accounts` in
`lib/db/schema.ts`. **Nothing went red**, and for a moment that read as a hole.

It was not. The in-process database is created from `drizzle/*.sql`, not from
`schema.ts`, so editing the schema file cannot change the running database's
constraints — the break never applied. The rule from sprint 1 held again: a
break that does not go red has two explanations, and *"the test is blind"* is
only one of them.

The guard L1 actually rests on is the collision refusal in
`lib/identity/accounts.ts`. Breaking **that** went red in two suites, which is
the right answer: the unique index is a backstop, and the code is the guard.

### What guard 85's blast radius says

Removing one `emailVerifiedAt` write took down seven cases including the
four-week simulation — because I7a made one verification serve two purposes.
That is the intended shape (*"never asked twice"*), and the blast radius is the
evidence: signup and redemption really are reading the same fact, rather than
two facts that happen to agree today.

---

# Sprint 3½ — the three things review caught

## The bug: brand login was broken end to end

I deleted `/api/portal/unlock` in sprint 3 and left the page it served behind.
`app/login/[kind]/page.tsx` still described the deleted portal-key model and
still posted to the deleted route; three live call sites redirected into it;
`/login/brand` did not exist. **A brand could not sign in at all.**

Typecheck was clean. The band was green at 264/264. Nothing caught it, because
a route is a string and no type system has an opinion about one.

| # | Guard | The break | What went red | Restored |
|---|---|---|---|---|
| 88 | Every form action posts to a handler that exists | The brand login form pointed back at `/api/portal/unlock` | *"every form action posts to a route handler that exists"* | clean, 268/268 |
| 89 | Every redirect resolves to a page | `lib/portal/session.ts` redirected to `/login/brands` | *"every redirect target in the app resolves to a page or a handler"* | clean, 268/268 |
| 90 | No rendered copy offers the deleted credential | *"Sign in with your portal key"* put back into the brand login heading | *"no rendered copy offers a credential the platform deleted"* | clean, 268/268 |

### Guards 89 and 90 failed on the first attempt, and both failures were mine

**89 went green** because the walker covered `app/` only — and two of the three
call sites that caused the original bug live in `lib/`. A guard that covers the
surface but not the code redirecting into it is guarding the easy half. It now
walks `lib/` too, with a canary asserting the walk actually reaches
`lib/portal/session.ts`.

**90 went green** because the check exempted any file mentioning *"one-time
invite"* — which the brand login page legitimately says, so the page exempted
itself from the whole rule. It now strips comments and checks what is left: a
comment may explain that the key was deleted; rendered copy may not offer one.

Both were re-broken against the fixed guard and both went red.

### What the guard found on its first green run

Two more, neither of which I had noticed:

- A dead `/rules` link in the brand builder. `04-SURFACES` specifies
  `/rules/[who]`, which is sprint 11 — the link was pointing at nothing.
- Copy on the owner settings page still telling owners that holding the mapped
  role *"gets the portal key"*.

## The column that shipped ahead of its gate

`users.staffTitleId` and `staff_titles` migrated in sprint 3. `currentStaff`
read the column. **Nothing enforced who could write it** — a column that opens
the admin console, with no gate, for one sprint.

| # | Guard | The break | What went red | Restored |
|---|---|---|---|---|
| 91 | Only the super admin grants a title | `requireSuperAdmin` made to refuse only a null department | 3 cases | clean, 277/277 |
| 92 | No title reaches the gamer directory (ST2) | `/admin/users` widened from `ADMIN_ONLY` to a department list | **7 cases across two suites** | clean, 277/277 |

Guard 92's blast radius is the sprint-1 design paying off: `ADMIN_ONLY` is its
own *kind*, not a list, so a title naming every department still cannot reach
the directory — and widening it breaks seven assertions rather than one.

## And one loaded gun removed

`isGuildManager` in `lib/discord/types.ts` — zero call sites, and the exact
shape 12 §6 forbids. It was also wrong on its own terms: it accepted
**MANAGE_GUILD**, which P2 never grants. Deleted, with the reasoning left where
it was so nobody writes it again.

---

# Sprint 4a — the wiring

## The gap

Eight routes named in `04-SURFACES.md` §5 did not exist, and no sprint built
them. The libraries behind every one were written and tested; nothing was in
front of them.

**Band 1 was green at 277/277 on a platform where a gamer could not press
Join** — because band 1 calls the libraries directly and never goes through
HTTP. Discord could not reach us, no sync could run, no payment could land, and
the week could neither start nor end.

Found by audit against the specification, not by anything failing. Same class
as `/login/brand`: a surface nothing tested. One level up, because it was the
whole surface.

| # | Guard | The break | What went red | Restored |
|---|---|---|---|---|
| 93 | An unset `CRON_SECRET` refuses on a real deployment | The demo fence removed, so unset means allow | *"a cron route with no secret configured refuses on a real deployment"* | clean, 292/292 |
| 94 | A retried Stripe event moves no money | `alreadyHandled` bypassed | *"a retried event is a no-op, and still answers"* | clean, 292/292 |
| 95 | A rotation signature still verifies | Only the first `v1` checked | *"a signature from during a secret rotation still verifies"* | clean, 292/292 |

### The guard was written first, and committed red

`94-reachability` was extended before a single route was built, and the failing
run named all eight:

```
actual: ["/api/discord/interactions","/api/cron/sync","/api/cron/daily",
         "/api/cron/announce","/api/payments/webhook",
         "/api/challenges/x/leaderboard","/api/pool","/api/auth/x"]
```

It reads the route table **out of `docs/04-SURFACES.md` §5** rather than from a
list in the test file. A hand-written list would only guard the routes somebody
remembered, and forgetting is precisely what happened. Add a route to §5 and
the suite demands it exist; delete one and the demand goes with it. A canary
asserts the section still parses, so a renamed heading fails loudly rather than
quietly guarding an empty list.

### Why guard 94 is the expensive one

Stripe retries any non-2xx **for three days**. Without idempotency one payment
routes into the vaults twice, and `prizeVault.balance == Σ(unredeemed
money-trophies on live accounts)` — the invariant the whole platform rests on —
stops holding. The test asserts all four vault balances are unchanged after a
replay, not merely that the second call returned something different.

### And why Stripe moved sprints

It was in sprint 14, last. `08-BUILD-ORDER`'s own ordering rule is **money
before anything that spends it**, and sprints 5 through 13 all assume a paid
invoice works. It is now in 4a with everything else that had no endpoint.

---

# The dead assertion, and what the sweep found

## What happened

`96-wiring.test.ts` shipped this, in the suite that tests the payments webhook:

```ts
ok(vault.ok || vault.state !== "over_allocated", "and the invariant is intact")
```

`PrizeVaultCheck` has no `ok` — the field is `holds`. The left side was always
`undefined`, so the whole expression collapsed to one enum comparison. It read
as a guard on **M3, the invariant the entire platform rests on**, and guarded
nothing of the kind.

**This is the exact defect this branch exists to end** — the three assertions in
the old weekly-close suite that called a SQL builder and tested nothing. Same
shape, same place: the money path.

### Why nothing caught it

`tsc --noEmit` names it in one line. **It was not being run.** `next build`
does not typecheck files outside the app graph, so an entire test suite can be
type-broken while the build reports success — and I reported *"build clean"* as
though that covered tests. It does not, and the two are not the same statement.

## Fixing it took three goes, and each go was a different mistake

| Attempt | What happened |
|---|---|
| 1 · `ok(vault.holds, …)` | **Failed, correctly.** $175 is paid and no trophy is assigned, so the vault is legitimately **unallocated** — the amber rhythm 02-MONEY §5 calls normal. `holds` is false by design there. The assertion was demanding a state the platform should not be in |
| 2 · assert the vault is unchanged | **Passed, and could not fail.** Money cannot enter the vaults twice for one invoice whatever that route does: `routePaidInvoice` refuses when the append-only ledger already holds a row for it. Breaking the webhook's idempotency *and* `markPaid`'s **together** still moved nothing |
| 3 · assert what the route decides | A replay must write no second record. Falsifiable, and proven — guard 99 |

Attempt 2 is the interesting one. It was *true*, and it was still decoration:
**an assertion that cannot fail is not a test, however correct it is.** The
vault property belongs where it can vary, and it was already there.

| # | Guard | The break | What went red | Restored |
|---|---|---|---|---|
| 96 | A retried Stripe event is a no-op | `alreadyHandled` bypassed | *"a retried event is a no-op"* — on the `kind` assertion, which short-circuits before the vault ones | clean, 292/292 |
| 97 | (diagnostic) A replay routes money but reports itself a replay | The replay branch made to route | **nothing** — which is how the unfalsifiability was found | clean |
| 98 | The ledger's own double-route guard | `routePaidInvoice`'s ledger check bypassed | *"a webhook that fires twice does not pay twice"*, in `30-money` — the right place | clean, 292/292 |
| 99 | A replay writes no second record | The replay branch made to record | *"a retried event is a no-op"* | clean, 292/292 |
| 100 | `npm test` typechecks first | `tsc --noEmit &&` removed from the script | *"the test command typechecks before it runs"* | clean, 293/293 |
| 101 | **M3 across the whole money layer** | The prize share routed one cent short | **24 cases across 7 suites** | clean, 293/293 |

Guard 101 is the answer to *"is the invariant actually load-bearing?"* One cent
of drift takes down twenty-four assertions from the ledger to the four-week
simulation. It is not guarded in one place; it is guarded everywhere money
moves.

## The sweep

**Dead property reads: none remain.** That is not an opinion — `tsc --noEmit` is
exactly the tool that finds them, it is now clean, and `npm test` runs it before
the band so it cannot silently stop being clean.

**Boolean-combining assertions: 27 found, 26 legitimate.** Most are
discriminated-union narrowings (`!result.ok && /reason/.test(result.reason)`),
which typecheck now confirms are reading fields that exist.

The one worth changing was in the four-week simulation:

```ts
ok(finalCheck.state === "green" || finalCheck.state === "unclaimed", "…healthy")
```

Falsifiable, so not dead — but weaker than the code deserves. After four closed
weeks nothing should be *unclaimed*, and permitting it meant the assertion would
have stayed green through a month that ended with trophies promised to a
challenge that never closed. `holds` is true there, so the weaker form bought
nothing. Now `ok(finalCheck.holds, …)` plus `eq(finalCheck.state, "green", …)`.

## The systemic fix

`npm test` is now `tsc --noEmit && tsx tests/run.mts`. Typecheck runs **before**
the band, so a type error stops the run rather than being buried under three
hundred passing assertions. `94-reachability` asserts that the script still does
this, and asserts the ordering — the fix is one careless edit from being undone
and nothing else would notice.

**And the reporting rule that goes with it: "typecheck clean" is only said after
`npm run typecheck` has actually been run. "Build clean" is a different
statement and does not cover tests.**

---

# Bookkeeping — the numbering

This file briefly carried **two colliding series**: one from the ten stages, one
restarted at the rebuild. 24 ids meant two different things, and the second
series skipped a number. Guard 51 had two answers.

Renumbered 1..101 in document order. **Every write-up is unchanged** — only the
ids moved. The thirteen prose references were re-resolved by position and each
checked against the row it names; *"Guards 42 and 43"* was plural, slipped the
first pass, and was corrected by hand to 89 and 90.

| # | Guard | The break | What went red | Restored |
|---|---|---|---|---|
| 102 | Guard ids are unique and continuous | Row 101 renumbered to 51, recreating a collision | *"every guard id in PROVEN.md is unique, and the series is continuous"* | clean, 294/294 |

The continuity half is the part that keeps this honest: a row cannot be
inserted without renumbering, so the prose references cannot quietly drift away
from the rows they cite.

---

# Sprint 4 — the fork, the two paths, the progress bar

Fifteen breaks, each one applied on its own and reverted before the next.
`tests/band1/97-onboarding-paths.test.ts` unless the row says otherwise.

| # | Guard | The break | What went red | Restored |
|---|---|---|---|---|
| 103 | The two paths differ in exactly one step | `OWNER_STEPS` gained `"link"` back | *"the two paths differ in exactly one step"* + 3 more | clean |
| 104 | Age band is asked before anything is stored (I7) | `GAMER_STEPS` reordered to link-first | *"age band is the first step on every path"* | clean |
| 105 | A path gets its own list | `stepsFor` returns `GAMER_STEPS` for both | *"an owner is never blocked on a game account"* + 2 more | clean |
| 106 | The default path is the stricter one | `facts.path ?? "gamer"` → `?? "owner"` | *"the default path is the stricter one"* | clean |
| 107 | `stepsFor` fails safe on an unknown path | Inverted to `path === "gamer" ? GAMER : OWNER` | *"stepsFor falls back to the gamer list"* | clean |
| 108 | Switching path costs only the step that differs | `missing` filter drops `ageBand` | *"the progress bar counts the steps of the path"* | clean |
| 109 | The bar counts this path's steps, not all four | `total` hardcoded to `4` | *"…counts the steps of the path"* + the switch test | clean |
| 110 | The bar and the gate agree | `Math.round(…)` → `Math.ceil(… + 33)` | *"the bar reads 100% exactly when the account is unlocked"* | clean |
| 111 | Guild rows come from ownership, not membership | `if (g.owner \|\| hasAdministrator(…))` → `if (true)` | *"the owner's step is answered by rows, not by a flag"* | clean |
| 112 | One file decides what Discord is asked for | A signup route calls `discordAuthUrl` with `guilds` | *"the guilds scope is asked for at onboarding…"* | clean |
| 113 | …and only when it was sent there to | `guilds` appended to every scope list | same | clean |
| 114 | …and it is actually sent when asked | Scope hardcoded to `"identify"` | same | clean |
| 115 | The guilds round trip has a static route | `app/api/auth/discord/route.ts` moved aside | same — **and nothing else in the band moved: 303/304** | clean |

Guard 115 is the one worth reading twice. `app/api/auth/[provider]/route.ts`
matches **any** `/api/auth/*`, so the reachability guard correctly reports the
onboarding redirect as resolving no matter how it is spelled — a moved or
renamed Discord route would be silently absorbed by the game-provider handler,
which answers *"we do not run challenges on discord"* and drops the owner back
on `/settings/connections` having done nothing. Reachability cannot see that
class of break by construction. This is the assertion that can.

## What the screenshot record found

`tests/band2/stage1-onboarding.mts` walks the fork, both paths, the switch
between them and the under-13 route. Its last step — *"and they cannot come back
with a different answer"* — **photographed a successful signup**.

U3 deletes the account and keeps a salted fingerprint precisely so the answer
cannot be retaken. The fingerprint was written by `blockUnderThirteen` and read
by exactly one door: the demo sign-in action. The **email signup route** and the
**Discord callback** both created a `users` row without ever looking. A child
who answered "under 13" could sign up again with the same address, or sign in
again with the same Discord account, and be straight back inside.

Guard 24 above proved the fingerprint *survives*. It did not prove anybody
*consults* it, and those are different claims — the same shape as the dead
assertion this file already records, one level up: a guard that verifies the
evidence exists without verifying anything reads it.

The check now lives in `lib/identity/gamers.ts`, at the point the row is made,
rather than at each door. Every door inherits it, including doors added later —
and that placement is the actual fix, because *"every door has its own copy"* is
how two of them came to have none.

| # | Guard | The break | What went red | Restored |
|---|---|---|---|---|
| 116 | The email door consults the fingerprint | `refuseIfBlocked` stops passing `email` | *"the under-13 answer cannot be retaken at any door…"* (`10-onboarding`) | clean |
| 117 | The Discord door consults it too | `refuseIfBlocked` removed from `shadowGamerForDiscord` | same | clean |
| 118 | And it is not a blanket refusal | `refuseIfBlocked` throws unconditionally | 9 tests across `10-onboarding` | clean |

Guard 118 is the negative half, and it is not decoration: without it, 116 and
117 are both satisfied by a function that refuses everybody.

---

# Sprint 5 — attribution and eligibility

The highest-risk work on the branch: it rewrites how money is attributed. The
credit model that `guild_members` existed for is deleted, and **parent + join**
replaces it — at most two servers per gamer, both recorded on the entry itself.

Sixteen breaks, each applied on its own and reverted before the next, with the
tree confirmed clean after every one. `tests/band1/98-attribution.test.ts`
unless the row says otherwise.

| # | Guard | The break | What went red | Restored |
|---|---|---|---|---|
| 119 | **Parent = join is 1.0, not two halves** | The same-server branch removed from `entrantCredit` | *"parent = join is 1.0, and not two halves"* | clean, 329/330 |
| 120 | The join server never gets full credit | `entrantCredit` returns 1.0 to the join server | **4 cases across 3 suites**, including *"the four outcomes reach the pool exactly as they are defined"* | clean, 326/330 |
| 121 | **A web join credits the parent in full** | The `!join` branch returns `[]` | *"a web join credits the parent in full"* + the pool case | clean, 328/330 |
| 122 | **No parent → no server earns** | The `!parent` branch credits the join server 1.0 | 3 cases | clean, 327/330 |
| 123 | A parent that lost the bot gains nothing new | The `removedAt` comparison deleted from `lib/pool/score.ts` | *"a parent that lost the bot keeps what it earned and gains nothing new"* | clean, 329/330 |
| 124 | **Scoring reads the frozen parent, not the live one** | `kpisForWeek` joins `users.parentGuildId` instead of the stamp | **13 cases across 4 suites** | clean, 317/330 |
| 125 | **A closed week does not move** | `setParentGuild` rewrites every past entry's stamp | 3 cases | clean, 327/330 |
| 126 | Conversion's denominator is live | The gun's snapshot count swapped in for `linkedMembersOf` | **5 cases across 3 suites** | clean, 325/330 |
| 127 | Linked members are counted for the parent alone | `linkedMembersOf` also counts gamers who entered from this guild | 1 case, first time — see below. After the fix: 2 | clean, 328/330 |
| 128 | **Eligibility is frozen at the gun** | `kpisForWeek` recomputes the live gate instead of reading the freeze | **5 cases across 2 suites** | clean, 325/330 |
| 129 | A gamer can never change their own parent | The actor check deleted from `setParentGuild` | *"a gamer can never change their own parent"* | clean, 329/330 |
| 130 | Ten linked members is not the whole gate | `eligible` drops the `profile.complete` term | **5 cases across 3 suites** | clean, 325/330 |
| 131 | **No weekly-cycle dollar reads `guild_snapshots`** | `activation` nudged when a snapshot row exists | **Nothing, first time** — see below. After the fix: *"no weekly-cycle dollar reads a guild_snapshots row"*, and again on the denominator read (5 cases) | clean, 329/330 |
| 132 | The gun freezes the parent beside the baseline | `stampBaselinesAtGun` stops writing `parentGuildIdAtBaseline` | **Nothing, first time** — see below. After the fix: *"an early joiner's parent is stamped by the gun, and the pool reads it"* | clean, 332/333 |
| 133 | The parented-entrant check is per entry | Reverted to `entrantShare.has(parent)` — a running total | **Nothing, first time** — see below. After the fix: *"a parent skipped by the removed-bot rule is not counted as a recruiter"* | clean, 332/333 |
| 134 | An early joiner's parent is **not** frozen at the click | `enterChallenge` freezes the parent unconditionally | *"an early joiner's parent is stamped by the gun, and the pool reads it"* | clean, 332/333 |

### Break 127: the test named for the rule could not fail

Counting join-server gamers in `linkedMembersOf` was caught by one case, and
**not** by *"linked members are counted live, parent-scoped"* — the test written
for exactly that rule. Its fixture had no entries at all, so there was nothing
for a join-scoped count to pick up and the assertion could not vary. Trap 2,
arriving in the test named after the thing it fails to guard.

Six of g2's members now press Join on g1's card, which is both the realistic
shape and the number an owner would say out loud. Re-broken: red in two suites.

### Break 131 went green twice over, for two different reasons

Reading `guild_snapshots` and nudging `activation` was caught by **zero**
suites, and the break had definitely applied.

Two faults, both mine, both in the guard rather than the code:

1. The assertion compared `totalCents` and `conversion` — **three fields
   somebody remembered.** A break that moved `activation` sailed through. It
   now compares the whole division.
2. The fixture gave **both** servers a snapshot row, so any read cancelled out
   in the percentile ranking. The grant is per server (N1), so one server
   having a row and the other not is the realistic shape — and the only one
   where a read moves money *between* servers.

This is the file-list defect one level down: a hand-picked list of fields
guards the fields somebody thought of, exactly as a hand-kept list of files
guards the files somebody remembered.

### Breaks 132 and 133 are §0.1, twice, in one sitting

> **Something was proven to EXIST. Nothing was proven to READ it.**

**132.** Deleting the gun's parent stamp changed nothing. Every test in the
attribution suite inserts participants directly, and the four-week simulation
still allocated every cent — because half its joiners arrive on day two and
freeze their parent at Join, so the pool still had shares and the arithmetic
still balanced. The gun was proven to *write* the stamp by the code being
there. **Nothing read an entry the gun had stamped.**

The fix is two tests that go through `enterChallenge` and `stampBaselinesAtGun`
for real — the early joiner and the mid-week joiner, which is both halves of
`max(challengeStart, joinedAt)`. Guard 134 is the negative half of the first:
without it, an `enterChallenge` that froze the parent at the click satisfies
132 while breaking A1a.

**133.** The parented-entrant check needs two entries on the same parent, one
either side of the bot being removed — the running-total version is true the
moment *any* earlier entry credited that parent. No fixture had that shape,
because it takes a removed bot and two entrants to build.

Both re-broken after the fix, both red.

### What the eligibility fixture found on its first run

`twoEligibleServers` froze eligibility for two weeks, and every test that read
the first week scored against an empty run. The freeze is **one pair of
columns**, so the next gun overwrites it.

That is correct and it is now written down in `isFrozenEligible`: a closed
week's numbers live in `server_payouts`, drafted at that week's own close
before the next gun fires. Recomputing a closed week from a gate that no longer
exists is precisely the drift `01-CYCLE`'s one-function rule exists to prevent.

---

# Sprint 6 — permissions, and the install round trip

Two things. The **owner/administrator split**, which is where every money rule
on a server sits, and the **bot-install flow** carried in from §2.0 — the half
of a round trip that was missing.

`tests/band1/95-permissions.test.ts` unless the row says otherwise.

| # | Guard | The break | What went red | Restored |
|---|---|---|---|---|
| 135 | **An administrator cannot withdraw** | `mayWithdraw`'s owner check widened to `kind !== "none"` | 2 cases, including *"an administrator does everything except move money"* | clean, 346/348 |
| 136 | **An administrator cannot approve a spend** | `mayApproveSpend` widened to `kind !== "none"` | 3 cases, across the capability table and both spend paths | clean, 345/348 |
| 137 | A teen owner spends and does not withdraw | The age gate collapsed into the owner gate — 09's mutation, written out | *"a teen owner spends and does not withdraw"* | clean, 347/348 |
| 138 | A confirmed transfer freezes withdrawal for 7 days | The window check disabled | *"a confirmed transfer freezes withdrawal for seven days"* | clean, 347/348 |
| 139 | The owner is the owner, whatever roles they also hold | The administrator branch moved above the owner branch | *"the owner is the owner, whatever roles they also hold"* | clean, 347/348 |
| 140 | **Who acted is taken from the access shape** | `identityOf` returns a constant instead of the id | 2 cases | clean, 346/348 |
| 141 | The install round trip has a starting point | The whole `!code` branch deleted from the install route (`97-onboarding-paths`) | *"the bot install round trip has a starting point, not just a callback"* | clean, 347/348 |
| 142 | **A request commits nothing until the owner answers** | `requestCommunitySpend` builds and bills the challenge | 3 cases | clean, 345/348 |

### Guard 139 is an ordering bug, not a permission bug

Both branches are individually correct. Swapping them demotes an owner who
**also** holds the mapped role to an administrator — and every server where the
owner mapped a role they themselves hold is exactly that case, which is most of
them. The owner would open their own portal and find withdraw disabled.

It is the same class as guard 72's prefix bug in sprint 1: the predicate is
right and the order is what carries the property.

### Guard 141, and why it needed a chokepoint rather than a search

`botInstallUrl` shipped in sprint 3 **exported and called from nowhere**. The
install *callback* was complete and correct — it captures the installer, which
G1 says is captured there or lost forever — and nothing started the round trip
that would ever reach it. An owner whose server had never had Cluster in it
granted `guilds`, saw no rows, and had no way forward.

Typecheck cannot see this: an exported function with no caller is not an error,
it is a library. Reachability cannot see it either — nothing pointed at a
missing route, the route existed and was simply never entered from the front.

So the guard is on the **function that builds the consent URL**, the way guard
112 is for `discordAuthUrl`. Searching for the word "install" would sweep up a
route name, a state kind, a column and four sentences of prose — trap 16, and a
guard whose expected list churns on unrelated edits is one somebody deletes.

The second half of the guard is that onboarding actually links to it. A route
with a caller nobody can reach is the same gap one step along.

### Guard 142 is where the request state earns its existence

Building and billing at *request* time is the plausible shortcut, and it looks
harmless — the owner still approves before anything is announced. It is not:
C3 makes every challenge past `draft` carry an invoice, so a built challenge is
already money committed against the guild, and the owner's approval would be
approving something already spent. The row exists precisely so there is
somewhere to hold a request that has cost nothing.

---

# Sprint 7 — opt-in analytics

The one feature on the platform whose whole design is *"and no dollar may
depend on it"*. `tests/band1/96-analytics.test.ts` unless the row says
otherwise.

The rule the feature rests on — S2/N9, **no weekly-cycle figure reads a
snapshot** — is guard 131 and the four-week simulation's own comparison, both
proven in sprint 5. Those live where the money is. What is below is the consent.

| # | Guard | The break | What went red | Restored |
|---|---|---|---|---|
| 143 | **The cooldown is on the guild** | The `cooldownUntil` check disabled | 2 cases | clean, 359/361 |
| 144 | **The grant survives sign-out** | Consent aged out after 30 minutes inside `refreshState` | 3 cases, first time — **and not the test named for it**, see below. After the fix: 4 | clean, 357/361 |
| 145 | The platform ceiling holds every server | The `used >= ceiling` check disabled | 2 cases | clean, 359/361 |
| 146 | A refusal costs no call | The member-list read moved above the gate | 2 cases | clean, 359/361 |
| 147 | The ceiling is a **setting**, not a constant | `pullCeiling` ignores the row and returns the default | 3 cases | clean, 358/361 |
| 148 | The ceiling **lengthens every cooldown as load rises** | `cooldownForLoad` flattened to the base wait | *"the ceiling lengthens every server's cooldown at once"* | clean, 360/361 |
| 149 | The page never says we **cannot** read a member list | The scope sentence rewritten to *"we cannot"* | *"the page says we do not read this, and never that we cannot"* | clean, 360/361 |
| 150 | A snapshot never reaches a page without its date | `analyticsView` returns `takenAt: null` | 2 cases | clean, 359/361 |

### Break 144: the test named for the rule read the row, not the path

*"The grant is permanent and survives a sign-out"* asserted that the consent row
exists a year later, and that the row carries no session, token or expiry
column. Both true, and both still true under a grant expired **in code**: the
break aged the consent out inside `refreshState`, `granted` stayed true, and the
test stayed green while three other tests went red.

The structural half is worth keeping — a column that could expire is the failure
mode most likely to be introduced — but it is not the claim. The claim is that a
year-old grant still *works*, so the test now asserts Update still runs.

This is the same shape as breaks 132 and 133 in sprint 5, and as trap 18: *the
evidence is recorded* and *the evidence is honoured* are different claims that
read identically in a test name.

### Break 148 is why the ceiling is a curve and not a line

Flattening `cooldownForLoad` to a constant leaves a ceiling that is free below
the limit and a wall above it — which means the first servers to press Update
each day spend the whole platform budget and every other server hits the wall.
N8 asks for the opposite: as the platform approaches Discord's limit the
cooldown lengthens **everywhere**, so it degrades evenly and every server is
told plainly why and when.

### Break 149 is a sentence, and it is load-bearing

The GUILD_MEMBERS intent is **app-wide** — one switch, every guild, no per-guild
control — so per-server consent is *our* gate, kept in code. *"We cannot read
your member list"* would be a promise the architecture cannot keep, and 12 §7a
says so explicitly. The guard asserts both halves: that the sentence says *we do
not*, and that it does not say *we cannot*.

---

# Sprint 8 — messages

The one alert on the platform that fires because **nothing** happened.
`tests/band1/97-messages.test.ts`.

| # | Guard | The break | What went red | Restored |
|---|---|---|---|---|
| 151 | **The alert clears on a reply, never on a read** | `markRead` also sets `lastAuthorKind` to `cluster` | *"reading is not answering"* | clean, 369/370 |
| 152 | An unanswered thread keeps alerting | `isAwaitingReply` returns `false` | **4 cases** | clean, 366/370 |
| 153 | **The two inboxes never merge** | The `side` filter dropped from `inbox` | *"a brand thread never appears in the server inbox"* | clean, 369/370 |
| 154 | A brand cannot speak in a server conversation | The author/side check disabled | *"a brand cannot speak in a server conversation"* | clean, 369/370 |
| 155 | The thread summary is written with the message | The `lastAuthorKind` update dropped from `postMessage` | **4 cases** | clean, 366/370 |

### Guard 151 is the edit somebody will make

Clearing the alert when admin opens the thread reads like an obvious
improvement — it is what every other inbox on earth does. It turns H7 into its
exact opposite: the threads that would stop alerting are precisely the ones
somebody opened, meant to answer, and did not.

So `markRead` exists, does what its name says, and is guarded against doing
anything else. The alert is derived from **who spoke last**, which is a fact
about the conversation rather than a fact about a session.

### Guard 155 is why the summary is written in the same call

`lastAuthorKind` is a denormalisation, and normally that would be worth
avoiding — but the alert has to be answerable from a list query across every
thread, and deriving it per row from the messages table makes the admin
dashboard's count a scan. Writing it in the same call as the message is what
keeps it from being one write behind, and a summary that can lag is an alert
that can be wrong for as long as nobody notices.

---

# Sprint 9 — the guild registry, ownership and reassignment

The page opened when an owner asks *"why am I not earning?"* Its two shaping
rules are both about what we deliberately **do not know**.
`tests/band1/98-registry.test.ts`.

| # | Guard | The break | What went red | Restored |
|---|---|---|---|---|
| 156 | **Refresh never lists members** | A direct `discordRest` call to `/guilds/{id}/members` beside the fetcher | **Nothing, first time** — see below. After the fix: *"refresh pulls owner and roles only, and never the member list"* | clean, 380/381 |
| 157 | Only the outgoing owner confirms a transfer | The owner check disabled | *"only the outgoing owner can confirm a transfer"* | clean, 380/381 |
| 158 | The claimant must hold ADMINISTRATOR **now** | The claimant check disabled | *"the claimant must hold ADMINISTRATOR at that moment"* | clean, 380/381 |
| 159 | Arbitration only after the fourteen days | The `timed_out` check disabled | *"arbitration is only available after the timeout"* | clean, 380/381 |
| 160 | An owner who signed in is never reassignable | `reassignmentState` drops the never-signed-in term | *"an owner who has never signed in may be reassigned after four weeks"* | clean, 380/381 |
| 161 | A failed owner DM is recorded, not swallowed | The audit write dropped from `recordOwnerDm` | *"a failed owner DM is a recorded state…"* | clean, 380/381 |
| 162 | A gamer can never set their own age band | The self-edit check deleted | *"admin sets an age band, and it is logged with both sides"* | clean, 380/381 |
| 163 | Arbitration is never logged as a confirmation | The audit action renamed to `guild.transfer.confirmed` | *"…and is logged as arbitration"* | clean, 380/381 |

### Break 156 was a no-op, and that is a different failure from a blind guard

The first attempt added `await fetcher.members?.(guildId)`. The file changed,
so the harness let it run — and the test's fetcher has no `members` key, so the
optional call short-circuited and **nothing executed**. Trap 8's rule again: a
break that changes nothing proves nothing in either direction, and this one
changed the source without changing behaviour reachable from the test.

The recorded call list is sound for everything routed through the injected
fetcher, which is every call `refreshGuild` is *supposed* to make. What it
cannot see is a direct REST call added beside them — and that is the realistic
way G3 gets broken, because `discordRest` is right there and a member list is
one path away.

So the guard has a second half that reads the module and asserts nothing in it
names a member-list path. That is a vocabulary check, which trap 16 usually
warns against — but here the vocabulary **is** the chokepoint: there is no way
to page a member list without naming `/guilds/{id}/members`. A canary asserts
the read reached the right file first, so an empty read cannot pass.

### Break 163 is about the audit log being answerable, not about behaviour

Renaming the arbitration's audit action changes nothing a user can see. It
conflates *"nobody answered for fourteen days and Cluster decided"* with *"the
outgoing owner agreed"* — two different facts about the same server, and the
difference is the whole content of a dispute six months later. The log is the
product here, and a log that cannot tell them apart is not one.

---

# Sprint 10 — the brand dashboard, the nav, and band 2 green again

`tests/band1/99-nav.test.ts` unless the row says otherwise.

| # | Guard | The break | What went red | Restored |
|---|---|---|---|---|
| 164 | **A brand never appears in the switcher** | The brand pushed into `switcherFor`'s output | *"a brand never appears in the switcher"* | clean, 388/389 |
| 165 | A brand is decided first, whatever else is in the browser | The gamer branch moved above the brand branch | *"a brand is decided first…"* | clean, 388/389 |
| 166 | The brand dashboard has **no site nav** | `showsSiteNav` returns `true` for every state | *"the brand dashboard has no site nav"* | clean, 388/389 |
| 167 | *Back to dashboard* only away from the dashboard | The `onPublicSite` term dropped | *"a brand browsing the public site gets a way back"* | clean, 388/389 |
| 168 | The two inboxes are classified apart | `/admin/inbox/brands` widened to `support` | **Nothing, first time** — the anchor table did not cover routes added this sprint. After the fix: *"a department reaches what it should and nothing more"* (`91-admin-access`) | clean, 388/389 |

### Guard 164 is about a source, not a filter

The brand is not removed from the switcher at the end — it is **never an
input**. A filter is a line somebody deletes while tidying, and its absence
looks like simplification. An input that was never there cannot be restored by
accident.

### Break 168 found the anchor table, not a hole

Widening the brand inbox to `support` went green because
`91-admin-access`'s literal case table — the anchor that exists precisely so
the tests are not derived from the rule they test — had no rows for pages added
this sprint. The admin-page census caught them as *unclassified* when they were
added, which is what put the classification in `ROUTE_ACCESS` at all; nothing
then asserted **which** classification.

Worth being exact about what this guards: 05 §6 names two inboxes and MS2 keeps
their data apart, which is guard 153. Which *departments* reach which inbox is
**our** decision, not a ratified rule — and that is the reason it belongs in
the table rather than the reason it does not. This file's own standard is that
silence is not a decision.

## Band 2 is fully green for the first time since Sprint 3

`tests/band2/portals.mts` was RED and carried a date rather than a shrug (§2.0,
trap 19). It drove the deleted portal-key model — `input[name="id"]` plus a
key, and copy asserting *"there is no password anywhere"* — and could not be
repaired in place, because its premise was gone and the shell it photographs
was about to change. Re-authored here against **B1**: the emailed key is a
one-time invite, exchanged once for an email-and-password account, and every
sign-in after that is email and password.

Seven new shots cover this sprint's own surfaces: the SaaS side nav, the guides
inside the portal, both message pages, and the two admin inboxes photographed
from the side where merging them would actually happen.

| Pass | Result |
|---|---|
| `site.mts` | green |
| `admin.mts` | green |
| `portals.mts` | **green — 31 shots, first time since Sprint 3** |

### And one thing that had nothing to do with the model

All four passes launched with
`executablePath: process.env.CHROMIUM_PATH ?? "/opt/pw-browsers/chromium"`,
which worked in the container they were written in. In this one that path is a
**directory**; the binary is under `chromium-<build>/chrome-linux/chrome`, and
the build number moves whenever the image or the pinned Playwright version
does. Playwright's error suggests re-downloading, which is exactly what
`PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD` exists to prevent — so it reads as a broken
setup rather than a moved file.

`tests/band2/browser.mts` now resolves the binary by looking, preferring a full
Chromium over a headless shell, and names every path it tried when it cannot
find one. **A browser pass that cannot start must not read as a product
failure.**

---

# Sprint 10a — the surfaces, and the weekly record

Two things, and the second is why the sprint exists.

**The ruling.** Eligibility as two columns on the guild row, overwritten every
Monday, was overturned. The reasoning that "a closed week's numbers live in
`server_payouts`" was wrong in a specific way: **the number survives, the
working does not** — and a disputed payout is exactly the moment somebody needs
the working, because the total is the one thing not in dispute.

**The real problem.** Sprints 6, 7 and 9 shipped complete, correct, fully
guarded libraries and **no pages**. Every guard called the module directly; not
one asked whether a surface did. §0.1's shape, fourth time.

| # | Guard | The break | What went red | Restored |
|---|---|---|---|---|
| 169 | **The record is not a second computation** | `record.ts` computes its own division | **Nothing, first time** — see below. After the fix: *"nothing that writes or reads the record computes a pool of its own"* | clean, 400/401 |
| 170 | Closing twice writes no second record | The already-written check deleted | *"closing twice does not write a second record"* | clean, 399/400 |
| 171 | **W5 — names are copied at write time** | `guildName` written empty | *"a server renamed in week 2 still reads as its week-1 name"* | clean, 400/401 |
| 172 | **W6 — an ineligible server still gets a row** | The dropped-server loop deleted | *"…has a row, and it says exactly why"* | clean, 400/401 |
| 173 | W2 — a superseded row is not current | `currentRows` returns everything | 2 cases | clean, 399/401 |
| 174 | W7 — a stale freeze is not this week's | The week comparison dropped from `isFrozenEligible` | *"a freeze from last week is not a freeze for this one"* | clean, 400/401 |
| 175 | **W4 is checked, not asserted** | `reconcileCredits` hardcodes `ok: true` | **Nothing, first time** — no negative half. After the fix: *"a server's per-challenge credits add up…"* | clean, 400/401 |
| 176 | W3 is checked, not asserted | `weekSummaries` hardcodes `reconciles: true` | *"the shares recorded for a week add up to that week's allocation"* | clean, 400/401 |
| 177 | The analytics tab exists | The whole page directory deleted | *"every redirect target in the app resolves to a page or a handler"* — see below | clean, 400/401 |
| 178 | **The guild registry has a page** | The whole page directory deleted | *"every library module is reachable from a page or a route handler"* | clean, 400/401 |

### Break 169: W1 is not a claim about today's numbers

Replacing the division with a **recomputation a day later** went green, because
on a fixture where nothing moved in between the two agree. Trap 2 in its purest
form: the assertion was true and could not vary.

W1/K12 does not say *the numbers match today*. It says **there is one
implementation**. So it is asserted where it can only be true or false — the
module that writes the record must not compute one, and the three pages that
read it must not either, which is 05 §6 rule 3 in the same words.

### Break 175, and the one I made worse before I made it better

`reconcileCredits` hardcoded to `ok: true` left the suite green: every
assertion was satisfied by a checker that always says yes. W3 already had its
negative half; W4 did not.

The fix then broke the test a second way, and this one is mine to own. The
negative half **mutates a credit on purpose**, and I put it in the middle of
the test — so the *"at least one credit is a half"* assertion below it read
numbers the block had just corrupted. Worse, I committed while the band was
400/401, because I ran the full band after the break rather than before the
commit. My own rule, missed. It is fixed, the assertion is last, and the reason
it is last is written above it.

### Breaks 177 and 178 catch the same defect through different guards

Deleting the analytics page went red via **reachability** — the portal layout
links to it, and that link now resolves to nothing. Deleting the guild registry
went red via **surface-reach** — `lib/admin/registry.ts` lost its only app-side
caller.

Worth being exact, because the two are not interchangeable: reachability sees a
*link to a missing page*, surface-reach sees a *module nothing points at*. The
analytics deletion did **not** trip surface-reach, because the portal's actions
file still imports `grantAnalytics` and actions live under `app/`. Neither
guard alone covers the class; together they do.

## The guard that ends this class

`tests/band1/94-surface-reach.test.ts`, committed **red**, naming ten modules —
the three known, and seven that were not known until it said so.

Roots are the files under `app/`; reachability follows imports through `lib/`,
including dynamic ones (`closeWeek` reaches `record.ts` and `payouts.ts` that
way, and a guard seeing only static imports would call both dead). A test is
not a surface: all three modules **were** called, by their own tests, which is
why "called from anywhere" would have passed.

Six modules remain, all Sprint 12's, on a **self-expiring** allowlist: the band
fails if an entry gains a surface (its reason is spent) or loses its module (it
has no subject). 09's fifth rule, and trap 19's other half — a permanently red
guard gets deleted, so this one carries a date.

### One thing band 1 cannot see, and where it goes instead

Break 179 hid the approve button from an administrator instead of disabling it
with the reason, and **nothing went red**. That is a rendering property, and
09's Band 2 shot 4a is where it is specified. It is asserted in the browser
pass rather than faked with a source check on JSX.
