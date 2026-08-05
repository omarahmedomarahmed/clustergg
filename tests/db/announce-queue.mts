// B33 — announcements become a queue.
//
// The bug was live: `announce()` posted to every guild sequentially, awaiting
// each call, from server actions declaring no `maxDuration`. The awaits were
// never wrong — sequential avoids a rate-limit ban — there were simply too many
// of them in one request, and the failure was silent and PARTIAL because the
// delivery ledger checkpointed every ten servers and left a plausible number
// behind.
//
//   DEMO_DB=1 npx tsx tests/db/announce-queue.mts

process.env.DEMO_DB = "1";

let pass = 0;
const fails: string[] = [];
const ok = (name: string, cond: boolean, detail = "") => {
  if (cond) { pass++; console.log(`  ok   ${name}`); }
  else { fails.push(name); console.log(`  FAIL ${name}${detail ? ` — ${detail}` : ""}`); }
};
const eq = (name: string, got: unknown, want: unknown) =>
  ok(name, JSON.stringify(got) === JSON.stringify(want), `got ${JSON.stringify(got)}, want ${JSON.stringify(want)}`);

const { readFileSync, readdirSync } = await import("node:fs");
const { enqueuePosts, drainPostQueue, queueStatus, retryFailed, MAX_ATTEMPTS } =
  await import("../../lib/discord/post-queue.ts");
const { getDb, schema } = await import("../../lib/db/index.ts");
const { eq: sqlEq, inArray } = await import("drizzle-orm");

const db = await getDb();

// ---- A fake Discord, so nothing here touches the network ----
//
// `postMessage` is what the drain calls. Stubbing fetch rather than the module
// keeps the REST layer's own 429 handling in the path, which is the layer this
// item has to cooperate with rather than bypass.
process.env.DISCORD_BOT_TOKEN = process.env.DISCORD_BOT_TOKEN || "test-token";
type Reply = { status: number; retryAfter?: string };
let plan: (channelId: string) => Reply = () => ({ status: 200 });
const calls: string[] = [];
globalThis.fetch = (async (url: unknown, init?: { method?: string }) => {
  const u = String(url);
  const m = u.match(/\/channels\/([^/]+)\/messages/);
  if (!m || init?.method !== "POST") return new Response("{}", { status: 200 });
  calls.push(m[1]);
  const r = plan(m[1]);
  return new Response(JSON.stringify({ id: "m1" }), {
    status: r.status,
    headers: r.retryAfter ? { "retry-after": r.retryAfter } : {},
  });
}) as never;

const mk = (n: number, prefix = "c") =>
  Array.from({ length: n }, (_, i) => ({ channelId: `${prefix}${i}`, guildId: `g${prefix}${i}`, payload: { content: `m${i}` } }));

console.log("== enqueue posts nothing ==");
calls.length = 0;
const batch = await enqueuePosts(mk(5, "a"));
eq("one row per target", batch.queued, 5);
eq("and NOT ONE Discord call was made", calls.length, 0);
const queuedRows = await db.select().from(schema.discordPostQueue)
  .where(sqlEq(schema.discordPostQueue.batchId, batch.batchId));
eq("the rows are pending", queuedRows.filter((r) => r.status === "pending").length, 5);
ok("…and carry the per-target payload", queuedRows.every((r) => !!(r.payload as { content?: string }).content));

console.log("\n== draining posts, marks done, and is idempotent ==");
plan = () => ({ status: 200 });
calls.length = 0;
const d1 = await drainPostQueue(100);
ok("the drain posts", d1.posted >= 5, JSON.stringify(d1));
eq("…one call per row", calls.filter((c) => c.startsWith("a")).length, 5);
const afterDrain = await db.select().from(schema.discordPostQueue)
  .where(sqlEq(schema.discordPostQueue.batchId, batch.batchId));
eq("every row is done", afterDrain.filter((r) => r.status === "done").length, 5);
ok("…with a posted timestamp", afterDrain.every((r) => !!r.postedAt));

calls.length = 0;
const d2 = await drainPostQueue(100);
eq("a second drain re-posts nothing from that batch", calls.filter((c) => c.startsWith("a")).length, 0);
void d2;

console.log("\n== a 429 reschedules, it does not drop ==");
const rl = await enqueuePosts(mk(1, "rate"));
plan = () => ({ status: 429, retryAfter: "99" });   // >5s, so the REST layer gives up rather than sleeping
await drainPostQueue(100);
const [rlRow] = await db.select().from(schema.discordPostQueue)
  .where(sqlEq(schema.discordPostQueue.batchId, rl.batchId));
eq("the row is still pending, not failed", rlRow.status, "pending");
ok("…scheduled for later", rlRow.nextAttemptAt.getTime() > Date.now());
// The give-up budget is for broken channels, not for a busy Discord. Counting a
// rate limit against it would drop a message nobody knew was missing.
eq("…and the rate limit did NOT count as an attempt", rlRow.attempts, 0);

console.log("\n== a permanently broken server gives up, with the reason ==");
const dead = await enqueuePosts(mk(1, "dead"));
plan = () => ({ status: 403, retryAfter: undefined });
for (let i = 0; i < MAX_ATTEMPTS; i++) {
  // Each pass is a separate drain; the backoff is cleared by hand so the test
  // does not have to wait an hour to assert an hour-long backoff.
  await db.update(schema.discordPostQueue).set({ nextAttemptAt: new Date(0) })
    .where(sqlEq(schema.discordPostQueue.batchId, dead.batchId));
  await drainPostQueue(100);
}
const [deadRow] = await db.select().from(schema.discordPostQueue)
  .where(sqlEq(schema.discordPostQueue.batchId, dead.batchId));
eq("it is marked failed", deadRow.status, "failed");
eq(`…after exactly ${MAX_ATTEMPTS} attempts`, deadRow.attempts, MAX_ATTEMPTS);
ok("…and the reason is recorded", /403/.test(deadRow.lastError ?? ""), deadRow.lastError ?? "");

const status = await queueStatus();
ok("the console surfaces it", status.failures.some((f) => f.guildId === "gdead0"), JSON.stringify(status.failures));
const retried = await retryFailed();
ok("retry puts it back", retried >= 1);
const [back] = await db.select().from(schema.discordPostQueue)
  .where(sqlEq(schema.discordPostQueue.batchId, dead.batchId));
eq("…as pending with a clean slate", [back.status, back.attempts], ["pending", 0]);
await db.delete(schema.discordPostQueue).where(sqlEq(schema.discordPostQueue.batchId, dead.batchId));

console.log("\n== the ledger counts only what landed ==");
const [challenge] = await db.select({ id: schema.challenges.id }).from(schema.challenges).limit(1);
if (challenge) {
  const before = await db.select({ g: schema.challengeDeliveries.guildId })
    .from(schema.challengeDeliveries).where(sqlEq(schema.challengeDeliveries.challengeId, challenge.id));
  const led = await enqueuePosts(
    [
      { channelId: "led-ok", guildId: "g-led-ok", payload: { content: "x" } },
      { channelId: "led-bad", guildId: "g-led-bad", payload: { content: "x" } },
    ],
    { challengeId: challenge.id, kind: "launch" },
  );
  void led;
  plan = (c) => ({ status: c === "led-bad" ? 403 : 200 });
  await drainPostQueue(100);
  const after = await db.select({ g: schema.challengeDeliveries.guildId })
    .from(schema.challengeDeliveries).where(sqlEq(schema.challengeDeliveries.challengeId, challenge.id));
  const added = after.map((r) => r.g).filter((g) => !before.some((b) => b.g === g));
  ok("the server that took the message is in the ledger", added.includes("g-led-ok"), JSON.stringify(added));
  ok("…and the one that refused it is NOT", !added.includes("g-led-bad"), JSON.stringify(added));
} else {
  ok("a challenge exists to record against", false, "no challenge seeded");
}

console.log("\n== nothing fans out inline from a server action any more ==");
// A source-level assertion, because this bug class has now appeared three
// times. The fan-out loop must live in exactly one place — the drain — and no
// server action may await a per-guild loop.
const announceSrc = readFileSync(new URL("../../lib/discord/announce.ts", import.meta.url), "utf8");
ok("announce.ts no longer loops targets posting to each",
  !/for\s*\(const\s+t\s+of\s+list\)/.test(announceSrc), "the sequential loop is back in announce.ts");
ok("…and no longer imports postMessage",
  !/\bpostMessage\b/.test(announceSrc), "announce.ts still posts directly");
ok("the drain declares a maxDuration",
  /export const maxDuration/.test(
    readFileSync(new URL("../../app/api/cron/announce/route.ts", import.meta.url), "utf8")));

// And the queue must be drained by something. A queue nobody drains is a
// silent failure that looks exactly like the one this item removed.
const vercel = JSON.parse(readFileSync(new URL("../../vercel.json", import.meta.url), "utf8"));
ok("a cron is scheduled to drain it",
  (vercel.crons ?? []).some((c: { path: string }) => c.path === "/api/cron/announce"),
  JSON.stringify(vercel.crons));

// Only the drain may post per-guild in a loop.
const files = readdirSync(new URL("../../app/actions", import.meta.url).pathname).filter((f) => f.endsWith(".ts"));
const offenders = files.filter((f) => {
  const src = readFileSync(new URL(`../../app/actions/${f}`, import.meta.url), "utf8");
  return /\bpostMessage\s*\(/.test(src);
});
eq("no server action calls postMessage directly", offenders, []);

console.log(`\n${pass} passed, ${fails.length} failed`);
if (fails.length) { fails.forEach((f) => console.log(`  - ${f}`)); process.exit(1); }
process.exit(0);
