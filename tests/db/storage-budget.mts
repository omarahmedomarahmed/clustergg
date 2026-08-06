// B46 — spend limits on rendering and storage.
//
// Vercel Pro raises the ceiling; it does not remove it. Two different failure
// modes, and the assertions split the same way:
//
//   The overnight bill — B14's home card is cached per gamer, per state, on a
//   key that invalidates whenever they link an account. A bug that busts that
//   key does not fail, it renders and renders and bills. A daily ceiling turns
//   that from an invoice into a graph.
//
//   The slow fill — every render stores a PNG and nothing ever removed one. A
//   cap with least-recently-used eviction turns "grows forever" into "holds the
//   cards people look at".
//
// The rule when the ceiling trips is the one that matters most: **serve the
// last good card, never fail.**
//
//   DEMO_DB=1 npx tsx tests/db/storage-budget.mts

process.env.DEMO_DB = "1";

let pass = 0;
const fails: string[] = [];
const ok = (name: string, cond: boolean, detail = "") => {
  if (cond) { pass++; console.log(`  ok   ${name}`); }
  else { fails.push(name); console.log(`  FAIL ${name}${detail ? ` — ${detail}` : ""}`); }
};
const eq = (name: string, got: unknown, want: unknown) =>
  ok(name, JSON.stringify(got) === JSON.stringify(want), `got ${JSON.stringify(got)}, want ${JSON.stringify(want)}`);

const {
  renderBudget, evictCards, storeReport, lastGoodCard, evictionCandidates,
  DAILY_RENDER_CEILING, CARD_STORE_CAP, CARD_TTL_DAYS,
} = await import("../../lib/cards/budget.ts");
const { getDb, schema } = await import("../../lib/db/index.ts");
const { eq: sqlEq, inArray } = await import("drizzle-orm");
const { uid } = await import("../../lib/utils.ts");
const { readFile } = await import("node:fs/promises");

const db = await getDb();
const tag = uid().slice(0, 6);
const DAY = 86400_000;

const mkCard = async (kind: string, key: string, opts: { bytes?: number; hits?: number; ageDays?: number } = {}) => {
  const id = uid();
  await db.insert(schema.cardRenders).values({
    id, kind, cacheKey: key, dataHash: uid(),
    // A URL that is obviously not a real blob — nothing here deletes from a
    // store that is not configured, and asserting on deletion of a fake object
    // would be asserting on the mock.
    url: `https://example.invalid/${id}.png`,
    bytes: opts.bytes ?? 1000, hits: opts.hits ?? 0,
    updatedAt: new Date(Date.now() - (opts.ageDays ?? 0) * DAY),
  } as never);
  return id;
};

console.log("== the limits are numbers somebody chose ==");
ok("there is a daily render ceiling", DAILY_RENDER_CEILING > 0, String(DAILY_RENDER_CEILING));
ok("there is a store cap", CARD_STORE_CAP > 0, String(CARD_STORE_CAP));
ok("there is a TTL", CARD_TTL_DAYS > 0, String(CARD_TTL_DAYS));

console.log("\n== the budget is counted from what was actually drawn ==");
// From the render rows themselves, not from a separate counter — a counter can
// drift from reality and the thing that matters is how many PNGs exist.
const before = await renderBudget();
ok("it reports a ceiling", before.ceiling === DAILY_RENDER_CEILING);
ok("…and what is left", before.remaining === Math.max(0, before.ceiling - before.used));
ok("…and when it resets", !!before.resetsAt && new Date(before.resetsAt) > new Date());
await mkCard(`budget-${tag}`, "one");
const after = await renderBudget();
eq("a render today counts against it", after.used, before.used + 1);
// A card drawn last week does not.
await mkCard(`budget-${tag}`, "old", { ageDays: 3 });
eq("a render from three days ago does not", (await renderBudget()).used, after.used);

console.log("\n== the report reconciles with itself ==");
// The dashboard cannot show a total that disagrees with the table under it,
// because the total is summed FROM the table rather than counted separately.
const report = await storeReport();
eq("the total count is the sum of the kinds",
  report.totalCount, report.byKind.reduce((s, k) => s + k.count, 0));
eq("…and the total bytes likewise",
  report.totalBytes, report.byKind.reduce((s, k) => s + k.bytes, 0));
ok("it reports by kind", report.byKind.length > 0, JSON.stringify(report.byKind.slice(0, 2)));
ok("…largest first, so the answer is the first row",
  report.byKind.every((k, i) => i === 0 || report.byKind[i - 1].bytes >= k.bytes));
ok("…and carries the live budget", report.budget.ceiling === DAILY_RENDER_CEILING);
const mine = report.byKind.find((k) => k.kind === `budget-${tag}`);
eq("our two cards are counted", mine?.count, 2);

console.log("\n== eviction takes the LEAST RECENTLY USED first ==");
const kind = `evict-${tag}`;
const newest = await mkCard(kind, "newest", { ageDays: 0, bytes: 500 });
const middle = await mkCard(kind, "middle", { ageDays: 5, bytes: 500 });
const oldest = await mkCard(kind, "oldest", { ageDays: 40, bytes: 500 });
const ours = [newest, middle, oldest];

// What would go next, before anything is deleted.
const candidates = await evictionCandidates(50);
const ci = candidates.findIndex((c) => c.cacheKey === "oldest");
const cn = candidates.findIndex((c) => c.cacheKey === "newest");
ok("the oldest is a candidate before the newest", ci >= 0 && (cn === -1 || ci < cn),
  JSON.stringify(candidates.slice(0, 3).map((c) => c.cacheKey)));

// A dry run must count without deleting — the answer to "what would this cost"
// has to be free to ask.
const totalNow = (await storeReport()).totalCount;
const dry = await evictCards({ cap: totalNow - 1, ttlDays: 999, dryRun: true });
eq("a dry run names one", dry.evicted, 1);
eq("…and deletes nothing", (await storeReport()).totalCount, totalNow);

console.log("\n== past the TTL goes, whatever the cap says ==");
// 40 days old, cap left enormous: it goes on age alone.
const evicted = await evictCards({ cap: 100_000, ttlDays: CARD_TTL_DAYS });
ok("something was evicted", evicted.evicted > 0, JSON.stringify(evicted));
const survivors = await db.select({ id: schema.cardRenders.id, key: schema.cardRenders.cacheKey })
  .from(schema.cardRenders).where(inArray(schema.cardRenders.id, ours));
const keys = survivors.map((s) => s.key);
ok("the 40-day-old card is gone", !keys.includes("oldest"), JSON.stringify(keys));
ok("…and the recent ones are not", keys.includes("newest") && keys.includes("middle"), JSON.stringify(keys));
ok("…and the bytes freed are reported", evicted.freedBytes > 0, String(evicted.freedBytes));

console.log("\n== a card with many hits is still evictable, and that is correct ==");
// `updatedAt` is not touched on a cache hit — deliberately, because touching a
// row on every hit is a write per Discord message. So a popular card whose
// payload has not changed in a month can be evicted, and the only cost is one
// re-render.
const popular = await mkCard(`hot-${tag}`, "popular", { hits: 9999, ageDays: 45 });
await evictCards({ cap: 100_000, ttlDays: CARD_TTL_DAYS });
const stillThere = await db.select().from(schema.cardRenders).where(sqlEq(schema.cardRenders.id, popular));
eq("evicted on age, not on popularity", stillThere.length, 0);

console.log("\n== the ceiling serves STALE rather than failing ==");
// The assertion the whole item rests on. Read at source, because the failure
// mode is a `return null` somebody adds later that turns a bill into an outage.
const cache = await readFile(new URL("../../lib/cards/cache.ts", import.meta.url), "utf8");
ok("the budget is consulted", /renderBudget\(\)/.test(cache));
ok("…AFTER the cache lookup, so a hit costs nothing",
  cache.indexOf("existing.dataHash === hash") < cache.indexOf("renderBudget()"));
ok("…and an exhausted budget serves the stored card",
  /if \(budget\.exhausted\) \{\s*\n\s*if \(existing\?\.url\) return \{ url: existing\.url, cached: true \}/.test(cache),
  cache.slice(cache.indexOf("budget.exhausted"), cache.indexOf("budget.exhausted") + 160));
ok("…rather than throwing", !/throw/.test(cache.slice(cache.indexOf("renderBudget()"), cache.indexOf("let url"))));
ok("a budget that cannot be READ does not stop rendering",
  /catch \{ \/\* a budget we cannot read must not stop rendering/.test(cache));

console.log("\n== the last good card is findable ==");
const keyed = `stale-${tag}`;
await mkCard("home", keyed, { bytes: 2048 });
ok("it resolves", !!(await lastGoodCard("home", keyed)));
eq("…and an unknown key is null, not a throw", await lastGoodCard("home", `nope-${tag}`), null);

console.log("\n== eviction deletes the blob BEFORE the row ==");
// The other order leaves a row pointing at an object that is gone, which is a
// broken card. This order can leave an orphaned object, which is kilobytes.
const budgetSrc = await readFile(new URL("../../lib/cards/budget.ts", import.meta.url), "utf8");
const loop = budgetSrc.slice(budgetSrc.indexOf("for (const r of doomed.values())"));
ok("the blob goes first", loop.indexOf("delBlobObject") < loop.indexOf("db.delete"));

console.log(`\n${pass} passed, ${fails.length} failed`);
if (fails.length) { fails.forEach((f) => console.log(`  - ${f}`)); process.exit(1); }
process.exit(0);
