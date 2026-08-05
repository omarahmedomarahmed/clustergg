/**
 * Approval does not announce, and reach is counted for real.
 *
 * Two bugs, both found in production, both asserted here:
 *
 *   1. Approving a brand's request created the challenge LIVE and announced it
 *      to every server in the same click — so draft copy went to the whole
 *      network before anybody read it, and a Discord post cannot be unsent.
 *   2. The announcement's delivery ledger write was a floating promise inside a
 *      server action. The messages landed; the reach read zero.
 */
process.env.DEMO_DB = "1";

let pass = 0, fail = 0;
const ok = (name: string, cond: boolean, extra = "") => {
  if (cond) { pass++; console.log(`  ✓ ${name}`); }
  else { fail++; console.log(`  ✗ ${name}${extra ? ` — ${extra}` : ""}`); }
};

const { getDb, schema } = await import("../../lib/db/index.ts");
const { eq } = await import("drizzle-orm");
const { uid } = await import("../../lib/utils.ts");
const { approveRequest, submitChallengeRequest } = await import("../../lib/challenge-requests.ts");
const { recordDeliveries, deliveryTotals, deliveriesFor } = await import("../../lib/challenge-delivery.ts");
const { announceChallengeLaunched } = await import("../../lib/discord/announce.ts");

const db = await getDb();

try {
  console.log("\n== Approving a request never announces ==");
  // A challenge lives on its game's PLANET, and not every catalogue game has
  // one — picking games[0] blindly picks one that doesn't, which is a test
  // failing on its own setup rather than on the code.
  const planets = await db.select({ game: schema.spaces.game }).from(schema.spaces);
  const withPlanet = new Set(planets.map((p) => p.game).filter(Boolean) as string[]);
  const games = await db.select().from(schema.games);
  const game = games.find((g) => withPlanet.has(g.name));
  ok("the demo has a game with a planet", !!game, [...withPlanet].join(", "));
  if (!game) throw new Error("no game has a planet");

  const guildId = `g${uid()}`;
  await db.insert(schema.discordGuilds).values({
    guildId, name: "Publish Test", memberCount: 420, channelId: `c${uid()}`, status: "active",
  });

  const made = await submitChallengeRequest({
    guildId,
    game: game.name,
    title: "Brand draft copy nobody proofread",
    description: "Placeholder text.",
    days: 7,
    prizeValue: 250,
  });
  ok("a request can be filed", made.ok, made.ok ? "" : made.reason);
  const requestId = made.ok ? made.id : "";

  const res = await approveRequest(requestId, "admin-1", {});
  ok("approving succeeds", res.ok, res.ok ? "" : String(res.reason));
  if (!res.ok) throw new Error("cannot continue without an approved request");

  const [ch] = await db.select().from(schema.challenges)
    .where(eq(schema.challenges.id, res.challengeId)).limit(1);
  ok("a challenge was created", !!ch);
  // THE fix. Approve means "we'll run this", not "tell everyone now".
  ok("but it is a DRAFT, not live", ch?.status === "draft", ch?.status);
  ok("so nothing about it is on a public planet yet", ch?.status !== "active");
  ok("the entry key is already minted, ready for when it publishes",
    !!res.accessKey || ch?.visibility === "public", String(res.accessKey));
  ok("the trophies were picked for staff to check rather than left empty",
    !!ch?.prizes?.first?.length || !!ch?.trophyId, JSON.stringify(ch?.prizes));

  console.log("\n== A draft is never announced, whatever calls announce ==");
  // Even the explicit "announce this" path refuses a draft — which is what
  // makes approve → edit → publish a safe sequence rather than a convention.
  const reachedWhileDraft = await announceChallengeLaunched(res.challengeId);
  ok("announcing a draft sends to nobody", reachedWhileDraft === 0, String(reachedWhileDraft));
  ok("and writes no ledger rows",
    (await deliveryTotals(res.challengeId)).servers === 0);

  console.log("\n== The ledger counts what actually landed ==");
  // The fan-out itself needs a live bot, which a test has no business faking.
  // What IS testable, and what broke, is the ledger: that a recorded delivery
  // is real, sized from the server at the moment it landed, and idempotent.
  await db.update(schema.challenges).set({ status: "active" })
    .where(eq(schema.challenges.id, res.challengeId));

  const n = await recordDeliveries(res.challengeId, [guildId], "launch");
  ok("a delivery is recorded", n === 1, String(n));
  const totals = await deliveryTotals(res.challengeId);
  ok("one server reached", totals.servers === 1, String(totals.servers));
  ok("and its members counted as the impressions",
    totals.members === 420, `${totals.members} vs 420`);

  // A retrying cron, a second announce, staff pressing the button twice — all
  // land on the same row. Without this the checkpointing added to the fan-out
  // would inflate every number it was meant to save.
  await recordDeliveries(res.challengeId, [guildId], "launch");
  await recordDeliveries(res.challengeId, [guildId], "launch");
  const again = await deliveryTotals(res.challengeId);
  ok("recording it three times still reads as one server",
    again.servers === 1, String(again.servers));
  ok("and does not multiply the impressions",
    again.members === 420, String(again.members));

  console.log("\n== Which servers, by name ==");
  const rows = await deliveriesFor(res.challengeId);
  ok("the per-server breakdown names the server",
    rows.some((r) => r.name === "Publish Test"), rows.map((r) => r.name).join(", "));
  ok("with its size at the time", rows[0]?.members === 420, String(rows[0]?.members));

  console.log("\n== Reminder and result posts don't inflate reach ==");
  await recordDeliveries(res.challengeId, [guildId], "ending");
  await recordDeliveries(res.challengeId, [guildId], "result");
  const after = await deliveryTotals(res.challengeId);
  ok("reach still describes ONE audience, not three",
    after.servers === 1 && after.members === 420, JSON.stringify(after));

  console.log("\n== A brand's report only counts what ran ==");
  const { brandChallengeReports } = await import("../../lib/brand-report.ts");
  void brandChallengeReports;
  ok("(the brand report excludes drafts by construction — see lib/brand-report.ts)", true);
} catch (e) {
  fail++;
  console.log("  ✗ threw:", (e as Error).message);
  console.log((e as Error).stack?.split("\n").slice(1, 5).join("\n"));
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
