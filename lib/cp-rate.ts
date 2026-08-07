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
 * The sanity check in the other direction, because a currency that costs
 * nothing is also worth nothing: 20 ad impressions pay 20 CP = $0.002, while at
 * even a $0.50 CPM those same impressions earn more than $0.01. **CP paid for
 * attention stays roughly 5× covered by the revenue that attention generates**
 * — the test this comment set originally, and the only one that matters.
 *
 * A $5 bronze trophy is 50,000 CP at this rate. That is a hundred days at the
 * ceiling: far, expensive, and reachable, which is what a trophy should be.
 *
 * Admin can move it: `platform_settings` key `marketplace.cpPerDollar`.
 */
export const DEFAULT_CP_PER_DOLLAR = 10000;
