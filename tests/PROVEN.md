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
