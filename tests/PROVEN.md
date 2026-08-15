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
