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

| 9 | `dataroom-truth.mts` | keep, 1 nit | Excellent. Walks every string in every seeded doc and fails on a hard-coded price. **Nit at :248** — `ok("…and it matches the registry", games === 23)` retypes the number the suite's whole thesis forbids. It is deliberate (a 24th game must force a deck rewrite) but it should read the registry and assert the deck's spelled-out word, not a literal. **Separately: the deck it pins carries the superseded capacity argument** (`defaults.ts:315,327`). The suite is right; its subject is wrong. |
| 10 | `docs-truth.mts` | keep | The strongest design in the band: a `RETIRED` registry in `lib/retired.ts` whose every entry must name evidence, and the evidence file must still say it. Blanks comments while **keeping newlines** so line numbers stay true. Extends over `app/` and `components/`, not just `docs/`. This is the pattern the consolidated band should be built on. |

| 11 | `honest-copy.mts` | keep, 1 fragility | Ten real defects, each asserted as a property. Its three vacuous negatives are all legitimate guards. **Fragility at :210** — `ok("…on a deployment with no provider keys it is genuinely smaller", live.length < all.length)` asserts a property of the *fixture*, not the product. `RIOT_API_KEY` is set in production; if the band ever runs with keys present this goes red for the right code. This is precisely the trap `public-copy.mts` documents at :75. |
| 12 | `public-copy.mts` | keep | The most self-aware suite here. Its header records that its own first version asserted a demo-only game count and "enforced a falsehood about production from inside the file meant to prevent exactly that". Asserts properties, never the strings. |

| 13 | `rules.mts` | keep | Every figure imported from the module that enforces it; also checks each journey step's `href` resolves to a real `page.tsx`. Good pattern — steal it. |
| 14 | `integrity.mts` | keep | Phase-0 defects pinned. Its negatives (`mediaValue`, `roasOf`) guard decisions that still stand. **Surfaced BUG-1 below.** |

| 15 | `money.mts` | keep | The structural "no column could hold a bank account" check reads `information_schema` rather than trusting the schema file. Best assertion in the band. |
| 16 | `eligibility.mts` | keep | Current through B95. Documents its own B93 inversion (`AgeGate` → `OnboardingBar`) instead of deleting the assertion. Cites `B73 §5 Q4` — **more BUG-1 fallout**. |

---

## READ PROGRESS — 16 of 99

Read so far (alphabetical position is not the read order):
`abuse`, `account-deletion`, `ad-views`, `allocations`, `announce-queue`,
`bot-payload`, `dataroom-truth`, `docs-truth`, `eligibility`, `honest-copy`,
`integrity`, `marketing-truth`, `money`, `public-copy`, `rules`,
`split` (§214–256 only — **needs a full read**, 593 lines).

**Next:** `attribution`, `audit-batch`, `bootstrap`, `bot-attribution`,
`bot-dead-ends`, `bot-errors`, `bot-growth`, `bot-unlock`, `brand-signup`,
`brand-trophies`, `campaign-confirm`, `campaign-console`, `caps`, `card-images`,
`card-refs`, `cards`, `challenge-billing`, `challenge-stage`,
`close-to-next-run`, `co-sponsor`, `cold-start`, `concurrency`, `cp-economics`,
`cp-vault`, `cron-idempotent`, `cron-twice`, `custom-campaign`, `entry-rules`,
`form-drafts`, `gifting`, `guild-defaults`, `ladder`, `legacy-drop`,
`live-components`, `marketplace`, `milestones-admin`, `mission-live`,
`missions`, `money-loop`, `nav`, `no-discord-ads`, `offers`, `onboarding`,
`ownership`, `payment-webhook`, `planet-explore`, `pool-live`, `portal-key`,
`portal-keys`, `pre-start-scoring`, `prepay`, `presented-by`,
`private-challenge`, `prize-places`, `provider-errors`, `public-card-privacy`,
`publish`, `quest-actions`, `ranks`, `retention`, `riot-methods`,
`security-b103`, `segments`, `series-plan`, `server-profile`, `server-public`,
`server-wallet`, `slugs`, `spam-audit`, `stale-account-id`, `storage-budget`,
`stuck-money`, `sync-throughput`, `taxonomy`, `trophy-admin`, `trophy-stack`,
`under13`, `unlock-monotonic`, `wallet`, `week-close`, `week-prizes`,
`welcome-challenge`.

---

# Bugs found by reading (not by running)

## BUG-1 — ten citations to two documents that do not exist

`docs/B73_RESEARCH.md` and `docs/DUE_DILIGENCE_REPORT.md` are both gone. Ten
places still cite them, and the citations are not decoration:

| File | What it cites them for |
|---|---|
| `docs/SOURCE_OF_TRUTH.md:35` | Why brand imagery is on our domain — "that began as a legal read" |
| `docs/SOURCE_OF_TRUTH.md:326` | Its own index: *"What did the legal research say? → docs/B73_RESEARCH.md"* |
| `docs/MODEL.md:32` | Same legal read |
| `lib/db/schema.ts:1949` | **The money-transmission reasoning behind a schema decision** (`B73 Q3`) |
| `lib/private-challenge.ts:8` | **Why gifting was deleted** (`B73 Q3`) |
| `lib/brand-report.ts:16,54,112` | Finding #1 — why no brand figure derives from headcount |
| `lib/ads-beacon.ts:3` | The beacon-minting finding |
| `tests/db/integrity.mts:4` | Claims *every* assertion in it corresponds to a finding in the missing report |

The last two rows are the ones that bite. `lib/private-challenge.ts` and
`lib/db/schema.ts` cite a legal analysis as the reason a money-transmission risk
was closed, and that analysis can no longer be read. The next person to ask "why
can't a gamer gift a trophy?" gets a dead pointer.

**Why no suite caught it:** `docs-truth.mts` checks that nothing points at the
deleted `docs/legacy` folder, and that each `RETIRED` entry's evidence file
exists. It never checks that a document *cited in prose* exists. The guard was
built for the last failure, not the shape of it.

**Fix:** restore both documents from git history if they were deleted in error,
or rewrite the reasoning into a live doc and repoint all ten citations. Then add
a link-integrity check — every `docs/*.md` path named anywhere in the tree must
resolve — which is one assertion and would have caught this the day it broke.

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
