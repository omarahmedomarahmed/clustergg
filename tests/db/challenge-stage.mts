/**
 * B90.3 — the status ladder.
 *
 * Pure derivation, so this is mostly a truth table. The assertions that matter
 * are the ORDER of the rules: an ended challenge is ended whatever else is
 * true, and an unpaid one is a draft whatever its dates say. Getting those two
 * the wrong way round either resurrects a finished challenge or tells a brand
 * that something it has not paid for is live on the network.
 */
process.env.DEMO_DB = "1";

let pass = 0, fail = 0;
const ok = (name: string, cond: boolean, extra = "") => {
  if (cond) { pass++; console.log(`  ✓ ${name}`); }
  else { fail++; console.log(`  ✗ ${name}${extra ? ` — ${extra}` : ""}`); }
};
const eq = (name: string, got: unknown, want: unknown) =>
  ok(name, JSON.stringify(got) === JSON.stringify(want), `got ${JSON.stringify(got)}, want ${JSON.stringify(want)}`);

const { readFileSync } = await import("node:fs");
const { stageOf, canAnnounce, STAGES, STAGE_ORDER } = await import("../../lib/challenge-stage.ts");

const NOW = new Date("2026-08-08T12:00:00Z");
const day = (n: number) => new Date(NOW.getTime() + n * 86400_000);

console.log("== the five rungs ==");
{
  eq("draft: built, not started", stageOf({ status: "draft", startAt: day(3), endAt: day(10) }, NOW), "draft");
  eq("queued: dated, nobody told", stageOf({ status: "active", startAt: day(3), endAt: day(10) }, NOW), "queued");
  eq("announced: the servers know",
    stageOf({ status: "active", startAt: day(3), endAt: day(10), announcedAt: day(-1) }, NOW), "announced");
  eq("live: running now", stageOf({ status: "active", startAt: day(-1), endAt: day(6) }, NOW), "live");
  eq("ended: closed", stageOf({ status: "completed", startAt: day(-9), endAt: day(-2) }, NOW), "ended");

  eq("the ladder is in order", STAGE_ORDER, ["draft", "queued", "announced", "live", "ended"]);
  ok("every rung says what it means to whoever is reading",
    STAGE_ORDER.every((k) => STAGES[k].blurb.length > 25 && STAGES[k].label.length > 2));
}

console.log("\n== ended beats everything ==");
{
  // A cancelled challenge with a future start date is not queued. It is over.
  eq("cancelled is ended even with a future date",
    stageOf({ status: "cancelled", startAt: day(5), endAt: day(12) }, NOW), "ended");
  eq("a past end date ends it even if the status was never updated",
    stageOf({ status: "active", startAt: day(-14), endAt: day(-7) }, NOW), "ended");
  // …but a DRAFT whose dates have slipped into the past is still a draft. It
  // was never announced, never paid and never ran; calling it "ended" would put
  // a challenge nobody ever saw into the reports as though it had.
  eq("a stale draft is still a draft, not a thing that ran",
    stageOf({ status: "draft", startAt: day(-14), endAt: day(-7) }, NOW), "draft");
}

console.log("\n== unpaid beats every date ==");
{
  // The rule this ladder exists for: nothing queues before payment clears.
  eq("an unpaid challenge whose start has arrived is a draft",
    stageOf({ status: "active", startAt: day(-1), endAt: day(6), paid: false }, NOW), "draft");
  eq("…and an unpaid future one is a draft too",
    stageOf({ status: "active", startAt: day(3), endAt: day(10), paid: false }, NOW), "draft");
  // Paid is OPTIONAL. A caller that does not know must not have its challenges
  // silently demoted to drafts — that is every screen that existed before this.
  eq("not knowing is not the same as unpaid",
    stageOf({ status: "active", startAt: day(-1), endAt: day(6) }, NOW), "live");
  eq("…and an explicit paid:true reads the same",
    stageOf({ status: "active", startAt: day(-1), endAt: day(6), paid: true }, NOW), "live");
}

console.log("\n== announcing is a thing you can be too late for ==");
{
  ok("a queued challenge can be announced",
    canAnnounce({ status: "active", startAt: day(3), endAt: day(10) }, NOW));
  // Announcing something already running is not an announcement, it is a note
  // that you missed it — and it would stamp announcedAt after the fact, which
  // corrupts the reach window the stamp exists to define.
  ok("a live one cannot", !canAnnounce({ status: "active", startAt: day(-1), endAt: day(6) }, NOW));
  ok("an ended one cannot", !canAnnounce({ status: "completed", startAt: day(-9), endAt: day(-2) }, NOW));
  ok("a draft cannot — there is nothing paid to announce",
    !canAnnounce({ status: "draft", startAt: day(3), endAt: day(10) }, NOW));
  ok("and one already announced cannot be announced twice",
    !canAnnounce({ status: "active", startAt: day(3), endAt: day(10), announcedAt: day(-1) }, NOW));
}

console.log("\n== the column is real, and reaches production ==");
{
  // A derived stage is only honest if the one thing it cannot derive — when we
  // told people — is actually stored. And a column added to the schema without
  // a migration is a column that exists in the demo database and nowhere else.
  const schema = readFileSync("lib/db/schema.ts", "utf8");
  ok("challenges carry announcedAt", /announcedAt: timestamp\("announced_at"/.test(schema));
  const idx = readFileSync("lib/db/index.ts", "utf8");
  ok("…and it is in COLUMN_MIGRATIONS, so it reaches Neon by deploying",
    /ALTER TABLE "challenges" ADD COLUMN IF NOT EXISTS "announced_at"/.test(idx));
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
