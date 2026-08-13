# The test band, read line by line

99 db suites, 19,311 lines. This file records a verdict for every one of them,
written while reading rather than inferred from the filename — because the
question that prompted it was exactly "are you sure what you are running", and
a filename is not evidence.

**Method.** Each suite is read in full against (a) the code it imports, (b)
`docs/SOURCE_OF_TRUTH.md`, and (c) decisions taken since the suite was written.
A suite is judged on one question: *can this assertion tell correct code from
broken code, about something we still believe?*

Four verdicts:

| | Meaning |
|---|---|
| **keep** | Tests live behaviour we still want |
| **stale** | Tests behaviour that has changed — the assertion is wrong now |
| **superseded** | Tests a decision we have since reversed — green is a lie |
| **vacuous** | Cannot fail. Guards code deleted so long ago the pattern matches nothing |

A **vacuous** assertion is not automatically a deletion. A negative guard on a
decision that still stands ("the wildcard image host is gone") is cheap
insurance against a regression. A negative guard on a decision we have since
reversed is worse than nothing: it pins us to the wrong answer and reports
green for doing it.

---

## The one that matters most: the capacity model is superseded

**Status: superseded. Confirmed against an explicit correction, not inferred.**

`lib/finance.ts` encodes:

```
payingBrandCapacity = floor(games / gamesPerPayingBrand)
```

on the stated reasoning that "a game runs one sponsored challenge at a time, so
a game IS a paying brand's slot — six games is six sponsors, whatever the
demand." That number is the spine of the raise narrative: the data room argues
that $1.25M buys *capacity*, by taking twelve more games live to reach eighteen
sponsors.

The rule is not what we do. The cap is **per brand, not per game**: one brand
may run one challenge per game per week — six challenges a week at six games —
and four different brands may each run a League challenge in the same week. Four
brands buying League is four sales, not one.

So `payingBrandCapacity` does not exist as a constraint. What actually bounds
revenue is demand and entrant supply, neither of which is `games / 1`.

### What is pinned to the wrong model

| Where | What it says |
|---|---|
| `lib/finance.ts:159,245,474–481,717` | Computes and caps every projection by it |
| `lib/dataroom/defaults.ts:315,327` | The raise: "six games serve six brands; eighteen serve eighteen" |
| `lib/dataroom/tokens.ts:15` | Same figure, tokenised |
| `lib/cms.ts:129` | Marketing copy built on it |
| `docs/SOURCE_OF_TRUTH.md` §4 | "The constraint that sizes the whole business" |
| `tests/db/split.mts:221–251` | **Nine assertions pinning it green** |
| `tests/db/dataroom-truth.mts:12` | Pins the data-room prose to it |

`split.mts:229` reads `paying brands never exceed it`. That assertion is
enforcing a ceiling we do not have, and it has been passing the whole time.

This is the shape the audit was called to find: not a broken test, a **correct
test of a superseded decision**.

---

## Mechanical sweep: vacuous negative assertions

An assertion of the form `ok("…", !/pattern/.test(src))` passes forever once the
pattern is deleted from the codebase. 32 of them exist. That is ~1.5% of the
corpus — **not the 80% the audit was called on**, and saying so is part of the
answer.

Each still needs reading in context, because most are legitimate regression
guards. The list is in the per-suite table below.

---

## Per-suite verdicts

| # | Suite | Verdict | Note |
|---|---|---|---|
| 1 | `abuse.mts` | keep | Well maintained. Documents its own inversion (C3 removed the per-challenge rate; the assertion moved to `rungOf` rather than being deleted). One vacuous line (`ownerPctFor` is gone) — cheap, keep. |
| 2 | `account-deletion.mts` | keep | Tests live `deletionImpact`/`deletionAllowed`. Ordering assertions on the real action. No stale references. |
| 3 | `ad-views.mts` | keep | Mostly negative by design, and correctly so: it guards the deleted `mediaValue` estimate. That decision still stands, so the negatives are earning their keep. |
| 4 | `allocations.mts` | keep | Tests live `setAllocation`/`weekBudget`/`planDailyCeiling`. Directional assertions (more gamers → smaller ceiling) are real. |
| 5 | `announce-queue.mts` | keep | Tests the live post queue end to end with a stubbed Discord. One vacuous negative (`postMessage` in announce.ts) — legitimate regression guard, this bug class recurred three times. |
| 6 | `bot-payload.mts` | keep | Extended this session with the ad/`PORTAL_SECRET` regression. |
| 7 | `marketing-truth.mts` | keep | The best suite in the band. A drift alarm that was itself caught being too narrow (pinned to one wording, caught one file) and widened to walk every `.ts`/`.tsx` under `app`, `components`, `lib`. Strips comments first so the note explaining a retired promise is not read as the promise. |
| 8 | `split.mts` | **superseded (§214–256)** | See above. The rest of the suite is sound. |

*(continues as the read proceeds)*

---

## `split.mts:244–256` — the assertion that proves the point

The suite does not merely mention the capacity ceiling. It *proves the ceiling
binds*, deliberately:

```js
const flooded = finance({ ...cfg, targetBrands: cfg.targetBrands * 4,
                                  brandsConverting: cfg.brandsConverting * 4 });
ok("…and quadrupling the brands does not [raise revenue], once the slots are full",
   flooded.exit.mrr === f.exit.mrr);
```

Under the rule we actually run, quadrupling the brands **does** raise revenue —
four brands each buying a League challenge is four sales in one week on one
game. The suite is not failing to test the model. It is testing it correctly and
the model is wrong, which is the only failure mode a green band cannot show you.

This is why the audit was worth asking for.
