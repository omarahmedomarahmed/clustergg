/**
 * RUN THE DAILY CRON TWICE. C1.
 *
 * The behavioural half of `tests/db/cron-idempotent.mts`, and the one that
 * actually reproduces the defect: it runs the two jobs through `runJob` — the
 * same entry point the cron route and the admin command centre both use —
 * with a stub in front of `fetch`, and counts the messages that reach Discord.
 *
 * Before the fix:
 *   challenge-reminders  run 1 → 6 messages   run 2 → 6 messages
 *   leaderboard-feed     run 1 → 5 messages   run 2 → 5 messages
 *
 * The first-run count is asserted as well as the second. A guard that stops
 * the duplicate by stopping the post is not a fix, and "0 and 0" would pass a
 * test that only looked at run 2.
 *
 *   DEMO_DB=1 npx tsx tests/db/cron-twice.mts
 */
process.env.DEMO_DB = "1";
process.env.DISCORD_BOT_TOKEN = "faketoken";
process.env.DISCORD_APP_ID = "999000111";
process.env.NEXT_PUBLIC_APP_URL = "http://localhost:3000";

let sent: string[] = [];
const real = globalThis.fetch;
globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
  const url = typeof input === "string" ? input : (input as Request).url ?? String(input);
  if (url.includes("discord.com/api")) {
    const method = init?.method ?? "GET";
    if (method === "POST" && /\/channels\/[^/]+\/messages$/.test(url)) sent.push(url);
    let data: unknown = { id: "m" + Math.random(), channel_id: "c1" };
    if (/\/guilds\/[^/]+\/channels$/.test(url) && method === "GET") data = [{ id: "c1", name: "clustergg", type: 0 }];
    if (/\/guilds\/[^/]+\/roles$/.test(url) && method === "GET") data = [];
    if (/\/users\/@me\/channels$/.test(url)) data = { id: "dm1", type: 1 };
    if (/\/guilds\/[^/?]+\?/.test(url)) data = { id: "g", name: "Test Guild", owner_id: "1", approximate_member_count: 10 };
    return new Response(JSON.stringify(data), { status: 200, headers: { "content-type": "application/json" } });
  }
  return real(input as never, init);
}) as typeof fetch;

// The HQ server has to exist for the leaderboard feed to post at all — with no
// HQ id configured, reportToHq drops every message and the job is unexercised.
const { setContent } = await import("../../lib/cms.ts");
const { HQ_ID_KEY } = await import("../../lib/discord/hq.ts");
await setContent(HQ_ID_KEY, "9100000000000000001");

const { runJob } = await import("../../lib/jobs.ts");
const { drainPostQueue } = await import("../../lib/discord/post-queue.ts");

// Reminders are QUEUED, so "what reached Discord" means enqueue + drain.
const runReminders = async () => {
  sent = [];
  const r = await runJob("challenge-reminders");
  await drainPostQueue(500).catch(() => {});
  return { summary: r.summary, posts: sent.length };
};
const runFeed = async () => {
  sent = [];
  const r = await runJob("leaderboard-feed");
  return { summary: r.summary, posts: sent.length };
};

console.log("challenge-reminders");
const a1 = await runReminders();
console.log("  run 1:", a1.summary, `→ ${a1.posts} message(s) to Discord`);
const a2 = await runReminders();
console.log("  run 2:", a2.summary, `→ ${a2.posts} message(s) to Discord`);

console.log("\nleaderboard-feed");
const b1 = await runFeed();
console.log("  run 1:", b1.summary, `→ ${b1.posts} message(s) to Discord`);
const b2 = await runFeed();
console.log("  run 2:", b2.summary, `→ ${b2.posts} message(s) to Discord`);

const bad: string[] = [];
if (a1.posts === 0) bad.push("challenge-reminders posted nothing on run 1 — the test proves nothing");
if (a2.posts !== 0) bad.push(`challenge-reminders posted ${a2.posts} duplicate(s) on run 2`);
if (b1.posts === 0) bad.push("leaderboard-feed posted nothing on run 1 — the test proves nothing");
if (b2.posts !== 0) bad.push(`leaderboard-feed posted ${b2.posts} duplicate(s) on run 2`);

console.log(bad.length ? `\n0 passed, ${bad.length} failed\n  ${bad.join("\n  ")}` : "\n4 passed, 0 failed — both jobs posted on the first run and nothing on the second.");
process.exit(bad.length ? 1 : 0);
