/**
 * THE DAILY CRON IS SAFE TO RUN TWICE. C1.
 *
 * ===== THE DEFECT =====
 *
 * I ran `/api/cron/daily` twice, back to back, and compared the summaries:
 *
 *   week-update          "Every one of the 3 servers already had today's"  ✅
 *   announce (queue)     attempted 0                                        ✅
 *   guild-snapshots      onConflictDoUpdate on the week key                 ✅
 *   week-close           refuses a week already closed                      ✅
 *   challenge-reminders  "Reminded 3 challenges · 1 skipped"  BOTH TIMES    ❌
 *   leaderboard-feed     "Posted 13 boards across 5 games"    BOTH TIMES    ❌
 *
 * The two failures are not symmetric and the audit overstated one of them.
 * Challenge reminders fan out into CUSTOMER servers, so a second run is
 * duplicate bot spam in somebody else's community — the thing that gets a bot
 * removed. The leaderboard feed posts only into our own HQ server via
 * `reportToHq`; I reported it as reaching customer servers and it does not.
 * It is still worth fixing: HQ is where staff read what the platform did, and
 * a feed that duplicates on every retry is one people stop reading.
 *
 * A second run is not hypothetical. Vercel retries crons, and `docs/SETUP.md`
 * tells an operator to "run each job once" from the admin command centre after
 * every deploy — which, on a day the schedule already fired, IS the second run.
 *
 * ===== WHAT IS ASSERTED =====
 *
 * Not "the helper works". The property: run the job, run it again, and the
 * second run must post NOTHING — while a genuinely new day, or a server the
 * first run never reached, still gets its post. A guard that also blocks the
 * work that should happen is not a fix.
 *
 *   DEMO_DB=1 npx tsx tests/db/cron-idempotent.mts
 */
process.env.DEMO_DB = "1";

import { readFileSync } from "node:fs";

let pass = 0;
const fails: string[] = [];
const ok = (name: string, cond: boolean, detail = "") => {
  if (cond) { pass++; console.log(`  ok   ${name}`); }
  else { fails.push(name); console.log(`  FAIL ${name}${detail ? ` — ${detail}` : ""}`); }
};
const eq = <T,>(name: string, got: T, want: T) =>
  ok(name, got === want, `got ${String(got)}, want ${String(want)}`);
const code = (p: string) => readFileSync(new URL(`../../${p}`, import.meta.url), "utf8")
  .replace(/\/\*[\s\S]*?\*\//g, "").split("\n").filter((l) => !/^\s*(\/\/|\*)/.test(l)).join("\n");

const { alreadyPosted, recordPost, dayKey } = await import("../../lib/discord/week-feed.ts");
const { getDb, schema } = await import("../../lib/db/index.ts");
const { eq: sqlEq, like } = await import("drizzle-orm");

const db = await getDb();
const GUILD_A = "9000000000000000001";
const GUILD_B = "9000000000000000002";
const clean = async () => {
  await db.delete(schema.discordWeekPosts).where(like(schema.discordWeekPosts.postKey, "test:%"));
};

console.log("== the once-per-server ledger behaves as a fan-out needs ==");
{
  await clean();
  const day = await dayKey();
  const key = `test:reminder:ch1:${day}`;

  eq("a server that has had nothing gets the post", await alreadyPosted(GUILD_A, key), false);
  await recordPost(GUILD_A, key, day, "reminder", "chan-a", null, true);
  eq("…and is skipped the second time", await alreadyPosted(GUILD_A, key), true);

  // THE HALF THAT MUST STILL WORK. A run that reached one server and died has
  // to be able to finish the rest — which is why the key is per server rather
  // than one global "done today" flag.
  eq("a server the first run never reached still gets it", await alreadyPosted(GUILD_B, key), false);

  // And tomorrow is a different post.
  eq("the same challenge on a different day is not blocked",
    await alreadyPosted(GUILD_A, `test:reminder:ch1:1999-01-01`), false);
  // A different challenge today is not blocked either.
  eq("a different challenge the same day is not blocked",
    await alreadyPosted(GUILD_A, `test:reminder:ch2:${day}`), false);

  // Recording twice must not throw or double-insert — the fan-out records after
  // enqueue, and an enqueue can be retried.
  await recordPost(GUILD_A, key, day, "reminder", "chan-a", null, true);
  const rows = await db.select({ id: schema.discordWeekPosts.id })
    .from(schema.discordWeekPosts).where(sqlEq(schema.discordWeekPosts.postKey, key));
  eq("recording the same post twice leaves one row", rows.length, 1);

  await clean();
}

console.log("== a read that fails must SUPPRESS the post, not allow it ==");
{
  // The one place in this codebase where failing closed is right: a missed
  // daily post is invisible, a duplicate across a hundred servers is not.
  const src = code("lib/discord/week-feed.ts");
  const fn = src.slice(src.indexOf("export async function alreadyPosted"));
  ok("alreadyPosted returns TRUE when it cannot tell", /catch\s*\{[\s\S]{0,200}return true;/.test(fn.slice(0, 700)));
}

console.log("== and both jobs are actually wired through it ==");
{
  // The half a helper test cannot see.
  const announce = code("lib/discord/announce.ts");
  ok("the fan-out filters targets by postKey", /postedGuilds\(list\.map\(keyOf\)/.test(announce));
  ok("…and records the ones it sent to", /recordPosts\(/.test(announce));
  // SET-BASED, and this assertion is not cosmetic: the first version of the fix
  // asked per guild in a loop, which is a sequential round trip per server
  // inside a server action with no maxDuration — the bug class B33 removed from
  // this function. tests/db/announce-queue.mts caught it on the first full run.
  ok("…without a per-guild loop", !/for\s*\(const\s+t\s+of\s+list\)/.test(announce),
    "a sequential per-server round trip is back in announce()");
  ok("…and the filter runs BEFORE the queue, not after",
    announce.indexOf("postedGuilds(") < announce.indexOf("enqueuePosts("),
    "a queued duplicate is one retry away from being sent");
  ok("the daily reminder pass sets a per-day key",
    /postKey:[\s\S]{0,80}reminder:\$\{challengeId\}/.test(announce));
  ok("…and a staff member sending one by hand is not silently refused",
    /opts\.manual \? null :/.test(announce));

  const feed = code("lib/discord/leaderboard-feed.ts");
  ok("the leaderboard feed checks before posting", /alreadyPosted\(hq, postKey\)/.test(feed));
  ok("…and records after", /recordPost\(hq, postKey/.test(feed));
  ok("…keyed per board rather than per run",
    /board:\$\{b\.game\}:\$\{b\.metricKey\}/.test(feed));
}

console.log(`\n${pass} passed, ${fails.length} failed`);
if (fails.length) { for (const f of fails) console.log(`  - ${f}`); process.exit(1); }
