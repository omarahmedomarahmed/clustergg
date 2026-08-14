# ClusterGG v3 — read this before anything else

This branch is a **specification with no application code**. You are building the
platform described in `docs/00-TRUTH.md`, from nothing.

## The one rule that matters

**Do not open the old branches.** `claude/clustergg-audit-g2ftlm` holds the
previous platform. Everything worth keeping has already been copied into
`ported/`, deliberately, with a written reason in `docs/06-PORTED-CODE.md`.

This is not tidiness. Three prior sessions inherited each other's mistakes by
reading old code and assuming it encoded a current decision. It did not — it
encoded a *previous* decision, and nothing in the file said which. That cost:

- a test suite enforcing a revenue ceiling nobody believed
- a document quoting an owner's withdrawal floor at twice its real value
- a compliance analysis deleted while ten files still cited it
- three assertions in the weekly-close suite that called a SQL builder and
  tested nothing, one of them the guard protecting the server pool from being
  drained by private challenges

If you need something that is not in `ported/`, **ask**. Do not go looking.

## Reading order

| File | What |
|---|---|
| `docs/00-TRUTH.md` | The ratified rules. Every one was decided by the owner on 2026-08-13 |
| `docs/06-PORTED-CODE.md` | What was carried over and what to change on arrival |

## House rules

| # | Rule |
|---|---|
| 1 | **Derived, never stored.** Balances, standings, stages, progress — computed from rows that exist for another reason. No stored balance columns |
| 2 | **Import numbers, never retype them.** Every page, document and card pulls its figures from the module that enforces them |
| 3 | **Prove a guard by breaking it.** Break the code, watch the test go red, restore, watch it pass. A green test that has never failed is not evidence |
| 4 | **Shared assertion helpers live in one module.** Never re-declared per suite |
| 5 | **Never store a payment detail.** Not an IBAN, not a card, not a last four. A preference word and an opaque provider handle |
| 6 | **Treat any production database as read-only.** No writes, no migrations, no DDL |
| 7 | **`/admin/users` and `/admin/linked-accounts` are admin-only.** No staff department reaches the gamer directory, ever |
| 8 | **Do not open a pull request** unless asked |
| 9 | **Kill background tasks you start.** Never leave a server running |
| 10 | **Acknowledge Discord interactions within 3 seconds.** Work happens in `after()` |
| 11 | **A decoration may never take a card down.** Fence anything that can throw on a path the product depends on |

## If the truth and the code disagree

**Stop and ask.** Do not reconcile them silently and do not assume either is
right. That is the failure this whole branch exists to end.
