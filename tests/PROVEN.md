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
