// What we keep, for how long, and what must never be deleted. B104.
//
// THE ASSERTION THIS FILE EXISTS FOR is the second block: the purge must never
// reach a money table. Everything it deletes is an observation — a row written
// because something happened, counted into a rollup that day, and read by
// nobody afterwards. A quest event is somebody's CP balance and a payout line
// is somebody's cheque, and "we deleted the row your balance came from" is not
// a sentence this product will ever say.
//
//   DEMO_DB=1 npx tsx tests/db/retention.mts

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

const { getDb, schema } = await import("../../lib/db/index.ts");
const { sql, eq: sqlEq } = await import("drizzle-orm");
const { uid } = await import("../../lib/utils.ts");
const {
  purgeOldObservations, purgeSummary, RETENTION_DAYS, PURGE_BATCH, NEVER_PURGED,
} = await import("../../lib/retention.ts");
const { hashSession, hashIp } = await import("../../lib/ads.ts");

const db = await getDb();
const tag = uid().slice(0, 8);
const DAY = 86400_000;

console.log("== the window is a number somebody chose ==");
{
  ok("it is measured in days", RETENTION_DAYS >= 30 && RETENTION_DAYS <= 400, String(RETENTION_DAYS));
  ok("…and the purge is batched", PURGE_BATCH > 0 && PURGE_BATCH <= 50000, String(PURGE_BATCH));
  const src = code("lib/retention.ts");
  ok("a batched delete cannot lock the whole table", /LIMIT \$\{batch\}/.test(src));
  ok("…and it never throws out of the job", /catch \{/.test(src));
}

console.log("\n== nothing that is money or entitlement is on the list ==");
{
  // THE ASSERTION THIS FILE EXISTS FOR. Read from source: the purge names its
  // tables in a literal list, so the two lists can be compared directly and a
  // table added to the wrong one turns this red.
  const src = code("lib/retention.ts");
  const observed = [...src.matchAll(/\{ table: "(\w+)"/g)].map((m) => m[1]);
  ok("it deletes from something", observed.length > 0, JSON.stringify(observed));

  for (const t of NEVER_PURGED) {
    ok(`${t} is never purged`, !observed.includes(t), `${t} appears in the purge list`);
  }
  // The two that would hurt most, said again by name because a loop over a
  // constant proves the constant and not the intent.
  ok("the vault ledger is not purged", !observed.includes("vault_ledger"));
  ok("quest events are not purged — that is somebody's balance",
    !observed.includes("quest_events"));
  ok("the delivery ledger is not purged — that is what a brand is billed on",
    !observed.includes("challenge_delivery"));

  // It is a LIST, not a loop over the schema. A loop would quietly include the
  // next table somebody adds, and the next table somebody adds might be the
  // ledger.
  ok("the tables are named one by one", /const OBSERVATIONS/.test(src));
  ok("…rather than derived from the schema",
    !/Object\.keys\(schema\)|for \(const t of Object/.test(src));
}

console.log("\n== old rows go and recent ones stay ==");
{
  const guildId = `ret-${tag}`;
  const mk = async (daysAgo: number) => {
    await db.insert(schema.serverEvents).values({
      id: uid(), guildId, type: "challenge_view",
      createdAt: new Date(Date.now() - daysAgo * DAY),
    } as never);
  };
  await mk(RETENTION_DAYS + 10);
  await mk(RETENTION_DAYS + 1);
  await mk(2);
  await mk(0);

  const countMine = async () => {
    const [r] = await db.select({ n: sql<number>`count(*)` })
      .from(schema.serverEvents).where(sqlEq(schema.serverEvents.guildId, guildId));
    return Number(r?.n ?? 0);
  };
  eq("four rows to start with", await countMine(), 4);

  const res = await purgeOldObservations(db);
  eq("the two old ones are gone", await countMine(), 2);
  ok("…and it says what it removed", res.total >= 2, JSON.stringify(res.removed));
  ok("…in a sentence a person can read",
    /Removed .* rows past \d+ days/.test(purgeSummary(res)), purgeSummary(res));

  // Idempotent: running it again removes nothing and says so.
  const again = await purgeOldObservations(db);
  eq("a second run has nothing to do", again.total, 0);
  ok("…and says that rather than saying nothing",
    /Nothing older than/.test(purgeSummary(again)), purgeSummary(again));
}

console.log("\n== a session key is a hash, never a piece of the cookie ==");
{
  // THE HOLE: the beacon stored `cluster_session.slice(-16)` — sixteen
  // characters of a live credential, in a table read by staff and joined on by
  // reports, and present in every backup of it.
  const jwt = "eyJhbGciOiJIUzI1NiJ9.eyJ1aWQiOiJhYmMifQ.s3cr3t-s1gnatur3-here";
  const key = hashSession(jwt);
  ok("a key is produced", !!key);
  ok("…and it contains none of the cookie",
    !!key && !jwt.includes(key) && !key.includes(jwt.slice(-16)), String(key));
  ok("…and it is stable, so dedupe still works", hashSession(jwt) === key);
  ok("…and different sessions differ", hashSession(`${jwt}x`) !== key);
  eq("no cookie is no key", hashSession(null), null);
  eq("…and an empty one is not a key either", hashSession("   "), null);
  ok("it is not the same as the ip hash", hashSession("1.2.3.4") !== hashIp("1.2.3.4"));

  const beacon = code("app/api/ads/beacon/route.ts");
  ok("the beacon hashes it", /hashSession\(/.test(beacon));
  ok("…and no longer slices the cookie", !/slice\(-16\)/.test(beacon), beacon.slice(0, 200));
  ok("the bot's own event log hashes it too",
    /hashSession\(opts\.sessionId\)/.test(code("lib/server-portal.ts")));
}

console.log("\n== it runs on its own, every day ==");
{
  const jobs = code("lib/jobs.ts");
  ok("the purge is a job", /purge-observations/.test(jobs));
  ok("…on the daily cadence", /key: "purge-observations", cadence: "daily"/.test(jobs));
  ok("…and it is described in terms of what it deletes",
    /Money and entitlement are never touched/.test(readFileSync(
      new URL("../../lib/jobs.ts", import.meta.url), "utf8")));
}

console.log(`\n${pass} passed, ${fails.length} failed`);
if (fails.length) { fails.forEach((f) => console.log(`  - ${f}`)); process.exit(1); }
process.exit(0);
