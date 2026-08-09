// The CP↔dollar rate, alone in its own module.
//
// It lives here rather than in `lib/marketplace.ts` for a BUILD reason, not a
// tidiness one, and the reason is worth writing down because it cost a red
// build to find.
//
// `components/CpCalculator.tsx` is a client component. It imports
// `lib/cp-economics.ts`, which imported this one constant from
// `lib/marketplace.ts`, which imports `lib/db/tx.ts`, which imports `pg`. Next
// traces the module graph across the client boundary **even for a dynamic
// `await import()`**, so the whole node-postgres driver — `fs`, `net`, `dns` —
// was pulled toward the browser bundle and the build failed. `tsc` stayed
// green the whole time.
//
// The fix is not a webpack alias hiding the edge. It is that a number a
// calculator needs should never have been reachable only through the database
// layer. Nothing in this file imports anything.

/**
 * How many Cluster Points buy one dollar of trophy.
 *
 * Derived, not guessed — and repriced deliberately in B34 from 1,000 to 10,000.
 *
 * At the old rate, a gamer doing everything the product asks, every day, cost
 * **$1.26 a day**, with an unbounded tail from nine uncapped actions. At a
 * million gamers that is $1.26M/day. The number was never survivable; it only
 * looked survivable because nobody had multiplied it out.
 *
 * At 10,000 CP = $1, with every action capped and a hard 500 CP/day ceiling
 * (`DEFAULT_DAILY_CP_CEILING`), the same maximal gamer costs **$0.05 a day**.
 * A hundred consecutive days of that is $5 for a hundred-day retention streak,
 * which is a trade any gaming company would take. Our worst case and our best
 * case became the same event.
 *
 * ===== What justifies the rate now — C9 =====
 *
 * This paragraph used to argue the rate from AD revenue: 20 impressions pay 20
 * CP = $0.002, against more than $0.01 earned at even a $0.50 CPM, so CP was
 * "roughly 5× covered by the revenue that attention generates".
 *
 * **That basis is void.** `COMMERCIAL_MODEL_V2` merges ads into the challenge
 * package and gives them away — ad revenue is $0, and a coverage ratio with
 * zero on top is not a small number, it is not a number.
 *
 * The rate is now a COST OF GOODS, and the model states it: **15% of every
 * challenge sale funds the CP vault** (§2). At $350 a challenge that is $52.50,
 * which at 10,000 CP/$1 is 525,000 CP — and at the 500 CP/day ceiling, one
 * challenge sold funds 1,050 gamer-days of maximal earning. That is the real
 * constraint, and it is a division anybody can check rather than a CPM nobody
 * can source.
 *
 * The uncomfortable half of the same arithmetic, stated because it decides the
 * company: at 4,200 daily-active maximal gamers the vault is exhausted and
 * Cluster's 20% starts subsidising it; at 9,800 the 20% is gone entirely.
 * **We need roughly one brand per 1,400 daily-active gamers just to hold the
 * floor.** `docs/MODEL.md` §3.
 *
 * A $5 bronze trophy is 50,000 CP at this rate. That is a hundred days at the
 * ceiling: far, expensive, and reachable, which is what a trophy should be.
 *
 * Admin can move it: `platform_settings` key `marketplace.cpPerDollar`.
 */
export const DEFAULT_CP_PER_DOLLAR = 10000;
