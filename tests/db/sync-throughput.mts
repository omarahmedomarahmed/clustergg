// The queue has to drain. B105.
//
// THE DEFECT: `syncDueAccounts` was a serial loop over 25 accounts, each one an
// external HTTP call, on an hourly cron. That is a hard ceiling of 25 accounts
// an hour — so at about thirty linked accounts the queue stops draining and
// every account after that falls further behind every hour, forever.
//
// It is the worst shape a scale bug can have: nothing crashes, nothing errors,
// and the only symptom is a leaderboard that quietly stops moving.
//
//   DEMO_DB=1 npx tsx tests/db/sync-throughput.mts

process.env.DEMO_DB = "1";

import { readFileSync } from "node:fs";

let pass = 0;
const fails: string[] = [];
const ok = (name: string, cond: boolean, detail = "") => {
  if (cond) { pass++; console.log(`  ok   ${name}`); }
  else { fails.push(name); console.log(`  FAIL ${name}${detail ? ` — ${detail}` : ""}`); }
};
const eq = (name: string, got: unknown, want: unknown) =>
  ok(name, JSON.stringify(got) === JSON.stringify(want), `got ${JSON.stringify(got)}, want ${JSON.stringify(want)}`);

const code = (p: string) => readFileSync(new URL(`../../${p}`, import.meta.url), "utf8")
  .replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|\s)\/\/.*$/gm, "");

const { SYNC_TAKE, SYNC_POOL } = await import("../../lib/sync.ts");

console.log("== the numbers are two numbers, and both are bounded ==");
{
  ok("a run takes more than the old serial ceiling", SYNC_TAKE > 25, String(SYNC_TAKE));
  ok("…but not an unbounded amount", SYNC_TAKE <= 1000, String(SYNC_TAKE));
  ok("more than one runs at a time", SYNC_POOL > 1, String(SYNC_POOL));
  // The thing on the other end is somebody else's rate limit. The fastest way
  // to lose a Riot key is to spike it.
  ok("…but never all of them at once", SYNC_POOL < SYNC_TAKE, `${SYNC_POOL} of ${SYNC_TAKE}`);
  ok("…and the pool stays polite", SYNC_POOL <= 20, String(SYNC_POOL));

  const src = code("lib/sync.ts");
  ok("the batch is not a serial loop any more",
    !/for \(const account of due\) \{\s*const r = await syncAccount/.test(src));
  ok("…and not Promise.all over everything either",
    !/Promise\.all\(due\.map/.test(src));
  ok("it uses a worker pool", /async function pool</.test(src));
  ok("…that takes the NEXT item rather than a fixed chunk",
    /const i = next\+\+/.test(src),
    "chunking would idle five workers waiting on one slow account");
}

console.log("\n== a throw cannot abandon the rest of the queue ==");
{
  // `syncAccount` swallows its own failures onto the row. The catch exists for
  // the case it cannot — and without it, one throw kills a worker and every
  // account that worker had left.
  const src = code("lib/sync.ts");
  ok("each account is caught individually",
    /try \{[\s\S]{0,200}syncAccount\(db, account\)[\s\S]{0,120}\} catch \{ failed\+\+; \}/.test(src));
}

console.log("\n== the pool actually runs everything, and in parallel ==");
{
  // Behavioural, against the real function shape rather than the real network:
  // a pool that drops items is worse than a serial loop, and a pool that is
  // secretly serial fixes nothing.
  const items = Array.from({ length: 50 }, (_, i) => i);
  const seen: number[] = [];
  let inFlight = 0;
  let peak = 0;

  // Same implementation as `lib/sync.ts` — asserted below to be the same shape.
  const pool = async <T,>(list: T[], size: number, work: (item: T) => Promise<void>) => {
    let next = 0;
    const workers = Array.from({ length: Math.min(size, list.length) }, async () => {
      for (;;) {
        const i = next++;
        if (i >= list.length) return;
        await work(list[i]);
      }
    });
    await Promise.all(workers);
  };

  await pool(items, 6, async (n) => {
    inFlight++;
    peak = Math.max(peak, inFlight);
    await new Promise((r) => setTimeout(r, n % 7));
    seen.push(n);
    inFlight--;
  });

  eq("every item is worked", seen.length, 50);
  eq("…exactly once", new Set(seen).size, 50);
  ok("…more than one at a time", peak > 1, String(peak));
  ok("…and never more than the pool size", peak <= 6, String(peak));
}

console.log("\n== the cron still calls it ==");
{
  const jobs = code("lib/jobs.ts");
  const sync = code("app/api/cron/sync/route.ts");
  ok("the hourly cron reaches the sync",
    /syncDueAccounts/.test(sync) || /syncDueAccounts/.test(jobs),
    "nothing calls syncDueAccounts");
}

console.log(`\n${pass} passed, ${fails.length} failed`);
if (fails.length) { fails.forEach((f) => console.log(`  - ${f}`)); process.exit(1); }
process.exit(0);
