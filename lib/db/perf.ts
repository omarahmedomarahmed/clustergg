// Counting the queries a page actually makes (B55.8).
//
// A performance fix with no before/after is a claim, not a result — and wall
// time alone hides the cause. Query COUNT is the number that says whether a
// change removed work or just moved it: this app talks to Neon over `neon-http`,
// one HTTPS round trip per query, so the count is the latency.
//
// Off unless `PERF_COUNT=1`, and it only ever increments an integer.

let enabled = process.env.PERF_COUNT === "1";
let count = 0;
const byQuery = new Map<string, number>();

export function perfEnabled(): boolean { return enabled; }
export function perfEnable(on = true) { enabled = on; }
export function perfReset() { count = 0; byQuery.clear(); }
export function perfCount(): number { return count; }

/** The queries issued, most frequent first — this is what names the culprit. */
export function perfTop(n = 12): { q: string; n: number }[] {
  return [...byQuery.entries()]
    .map(([q, n]) => ({ q, n }))
    .sort((a, b) => b.n - a.n)
    .slice(0, n);
}

/** A drizzle logger that records rather than prints. */
export const perfLogger = {
  logQuery(query: string) {
    if (!enabled) return;
    count++;
    // Normalised: parameter values differ per call and would make every query
    // look unique, which is exactly the wrong shape for "what runs most".
    const key = query.replace(/\$\d+/g, "?").replace(/\s+/g, " ").slice(0, 110);
    byQuery.set(key, (byQuery.get(key) ?? 0) + 1);
  },
};
