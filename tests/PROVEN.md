# Guards proven by breaking them

House rule 3, and rule 1 of `docs/09-TEST-PLAN.md`: **a green test that has never
failed is not evidence.** Every guard below was proven by breaking the code,
watching the suite go red, restoring, watching it pass, and confirming the
working tree was clean afterwards.

One row per guard. A guard with no row here has not been proven.

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
| 34 | Linking a second method updates one row | Insert instead of update | *"linking a second method updates one row and never creates another"* | clean, 264/264 |
| 35 | An already-used identity **routes, never merges** | The `elsewhere` branch made to steal the identity from the other account | *"an identity already on another account is a route, never a merge"* | clean, 264/264 |
| 36 | Each account clears every gate on its own | `deriveUnlock` made to default age, country and a link | 5 cases across three suites | clean, 264/264 |
| 37 | **L1 is what stops one person scoring twice** | The collision refusal in `linkAccount` bypassed | 2 cases, in two suites | clean, 264/264 |
| 38 | The email door's verification is redemption's | `emailVerifiedAt` no longer written | **7 cases**, including the four-week simulation | clean, 264/264 |
| 39 | A brand invite works exactly once | The `inviteRedeemedAt` check bypassed | *"a brand invite works exactly once"* | clean, 264/264 |
| 40 | The parent is stamped at the first click | The early return made conditional, so a later click re-stamps | *"the parent is stamped at the first click and never re-stamped"* | clean, 264/264 |

### The break that proved the guard was somewhere else

Attempt one at guard 37 removed `uniqueIndex` from `linked_game_accounts` in
`lib/db/schema.ts`. **Nothing went red**, and for a moment that read as a hole.

It was not. The in-process database is created from `drizzle/*.sql`, not from
`schema.ts`, so editing the schema file cannot change the running database's
constraints — the break never applied. The rule from sprint 1 held again: a
break that does not go red has two explanations, and *"the test is blind"* is
only one of them.

The guard L1 actually rests on is the collision refusal in
`lib/identity/accounts.ts`. Breaking **that** went red in two suites, which is
the right answer: the unique index is a backstop, and the code is the guard.

### What guard 38's blast radius says

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
| 41 | Every form action posts to a handler that exists | The brand login form pointed back at `/api/portal/unlock` | *"every form action posts to a route handler that exists"* | clean, 268/268 |
| 42 | Every redirect resolves to a page | `lib/portal/session.ts` redirected to `/login/brands` | *"every redirect target in the app resolves to a page or a handler"* | clean, 268/268 |
| 43 | No rendered copy offers the deleted credential | *"Sign in with your portal key"* put back into the brand login heading | *"no rendered copy offers a credential the platform deleted"* | clean, 268/268 |

### Guards 42 and 43 failed on the first attempt, and both failures were mine

**42 went green** because the walker covered `app/` only — and two of the three
call sites that caused the original bug live in `lib/`. A guard that covers the
surface but not the code redirecting into it is guarding the easy half. It now
walks `lib/` too, with a canary asserting the walk actually reaches
`lib/portal/session.ts`.

**43 went green** because the check exempted any file mentioning *"one-time
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
| 44 | Only the super admin grants a title | `requireSuperAdmin` made to refuse only a null department | 3 cases | clean, 277/277 |
| 45 | No title reaches the gamer directory (ST2) | `/admin/users` widened from `ADMIN_ONLY` to a department list | **7 cases across two suites** | clean, 277/277 |

Guard 45's blast radius is the sprint-1 design paying off: `ADMIN_ONLY` is its
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
| 46 | An unset `CRON_SECRET` refuses on a real deployment | The demo fence removed, so unset means allow | *"a cron route with no secret configured refuses on a real deployment"* | clean, 292/292 |
| 47 | A retried Stripe event moves no money | `alreadyHandled` bypassed | *"a retried event is a no-op, and still answers"* | clean, 292/292 |
| 48 | A rotation signature still verifies | Only the first `v1` checked | *"a signature from during a secret rotation still verifies"* | clean, 292/292 |

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

### Why guard 47 is the expensive one

Stripe retries any non-2xx **for three days**. Without idempotency one payment
routes into the vaults twice, and `prizeVault.balance == Σ(unredeemed
money-trophies on live accounts)` — the invariant the whole platform rests on —
stops holding. The test asserts all four vault balances are unchanged after a
replay, not merely that the second call returned something different.

### And why Stripe moved sprints

It was in sprint 14, last. `08-BUILD-ORDER`'s own ordering rule is **money
before anything that spends it**, and sprints 5 through 13 all assume a paid
invoice works. It is now in 4a with everything else that had no endpoint.
