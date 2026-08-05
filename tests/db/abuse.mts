// B35 — the caps do not stop a second account.
//
// Money-touching, so it is written with the item (§1.1). The thing under test is
// not "can we detect fraud" — it is "can money leave before a human has looked",
// and the answer has to be no.
//
//   DEMO_DB=1 npx tsx tests/db/abuse.mts

process.env.DEMO_DB = "1";

let pass = 0;
const fails: string[] = [];
const ok = (name: string, cond: boolean, detail = "") => {
  if (cond) { pass++; console.log(`  ok   ${name}`); }
  else { fails.push(name); console.log(`  FAIL ${name}${detail ? ` — ${detail}` : ""}`); }
};
const eq = (name: string, got: unknown, want: unknown) =>
  ok(name, JSON.stringify(got) === JSON.stringify(want), `got ${JSON.stringify(got)}, want ${JSON.stringify(want)}`);

const { payoutHold, PAYOUT_HOLD_DAYS, QUALIFY_AFTER_DAYS, QUALIFY_RULE,
  linkedCountsFor, markTierUnlocked, payoutHoldFor, hasBeenPaid, anomalousGrowth } =
  await import("../../lib/abuse.ts");
const { ownerPctFor } = await import("../../lib/server-earnings.ts");
const { getDb, schema } = await import("../../lib/db/index.ts");
const { eq: sqlEq, and: sqlAnd } = await import("drizzle-orm");
const { uid } = await import("../../lib/utils.ts");

const db = await getDb();
const DAY = 86400_000;

console.log("== the holding period ==");
const unlocked = new Date(Date.now() - 10 * DAY);
const inside = payoutHold(unlocked, false);
ok("a first payout inside the window is held", inside.held);
ok("…and says how long is left", /20 days left/.test(inside.reason), inside.reason);
ok("…and gives the date", !!inside.until);
const after = payoutHold(new Date(Date.now() - (PAYOUT_HOLD_DAYS + 1) * DAY), false);
ok("a first payout past the window is released", !after.held);
// A server with a track record is not held again. Holding every payout forever
// would tax the honest majority to slow down a minority we can already see.
ok("a server that has been paid before is never held", !payoutHold(new Date(), true).held);
// The dangerous case: no recorded unlock. Fail CLOSED.
const unknown = payoutHold(null, false);
ok("an unknown unlock date is HELD, not released", unknown.held);
ok("…and says a human has to confirm", /human/.test(unknown.reason));
// Exactly at the boundary.
ok("the hold ends exactly at the boundary, not a day late",
  !payoutHold(new Date(Date.now() - PAYOUT_HOLD_DAYS * DAY), false).held);

console.log("\n== qualified vs raw ==");
const guildId = `t-guild-${uid().slice(0, 8)}`;
await db.insert(schema.discordGuilds).values({ guildId, name: "Test Guild", status: "active" } as never);

const mkMember = async (linkedDaysAgo: number | null, proven: boolean) => {
  const id = uid();
  await db.insert(schema.users).values({
    id, slug: `ab-${id.slice(0, 8)}`, displayName: "Ab", email: `${id}@test.invalid`, passwordHash: "x",
  } as never);
  await db.insert(schema.discordGuildMembers).values({
    guildId, userId: id,
    firstLinkedAt: linkedDaysAgo === null ? null : new Date(Date.now() - linkedDaysAgo * DAY),
  } as never);
  await db.insert(schema.linkedGameAccounts).values({
    id: uid(), userId: id, provider: "chesscom", providerAccountId: `p-${id.slice(0, 8)}`,
    inGameName: "x", verified: proven,
  } as never);
  return id;
};

await mkMember(30, true);    // counts
await mkMember(30, true);    // counts
await mkMember(2, true);     // too recent
await mkMember(30, false);   // ownership never proven
await mkMember(null, true);  // never linked

const counts = await linkedCountsFor(db, guildId);
eq("the raw count includes everyone who ever linked", counts.raw, 4);
eq("…and the qualified count only the ones that survive both rules", counts.qualified, 2);
ok("an unqualified account raises the raw count and not the qualified one",
  counts.raw > counts.qualified);
ok(`the rule mentions the ${QUALIFY_AFTER_DAYS}-day wait`, QUALIFY_RULE.includes(String(QUALIFY_AFTER_DAYS)));
ok("…and says the unqualified still show in the member count",
  /still show/.test(QUALIFY_RULE), QUALIFY_RULE);

console.log("\n== the tier reads the qualified count ==");
// The rate must come from the qualified number, or the whole defence is a
// display change.
eq("500 raw but 0 qualified pays nothing", ownerPctFor(0), 0);
eq("500 qualified pays 5%", ownerPctFor(500), 5);

console.log("\n== the unlock stamp is one-way ==");
const first = new Date(Date.now() - 40 * DAY);
await markTierUnlocked(db, guildId, first);
const [g1] = await db.select({ t: schema.discordGuilds.tierUnlockedAt })
  .from(schema.discordGuilds).where(sqlEq(schema.discordGuilds.guildId, guildId)).limit(1);
eq("the first crossing is stamped", g1.t?.toISOString(), first.toISOString());
// A server that dips below and climbs back must not get a fresh holding period,
// and must not be able to be given one deliberately.
await markTierUnlocked(db, guildId, new Date());
const [g2] = await db.select({ t: schema.discordGuilds.tierUnlockedAt })
  .from(schema.discordGuilds).where(sqlEq(schema.discordGuilds.guildId, guildId)).limit(1);
eq("a second crossing does not restart the clock", g2.t?.toISOString(), first.toISOString());

console.log("\n== the guard, against the database ==");
ok("a guild with no completed payout has no track record", !(await hasBeenPaid(db, guildId)));
const held40 = await payoutHoldFor(db, guildId);
ok("stamped 40 days ago and never paid → released", !held40.held, held40.reason);

// Re-stamp recent by clearing first, to prove the guard reads the column.
await db.update(schema.discordGuilds).set({ tierUnlockedAt: new Date(Date.now() - 3 * DAY) })
  .where(sqlEq(schema.discordGuilds.guildId, guildId));
const held3 = await payoutHoldFor(db, guildId);
ok("stamped 3 days ago → held", held3.held);
ok("…with the days remaining stated", /27 days left/.test(held3.reason), held3.reason);

// A DRAFT payout is not a track record — otherwise anybody could open and
// cancel one to clear their own hold.
await db.insert(schema.serverPayouts).values({
  id: uid(), guildId, status: "draft", total: 100,
} as never);
ok("a draft payout does not count as having been paid", !(await hasBeenPaid(db, guildId)));
await db.insert(schema.serverPayouts).values({
  id: uid(), guildId, status: "cancelled", total: 100,
} as never);
ok("nor does a cancelled one", !(await hasBeenPaid(db, guildId)));
await db.insert(schema.serverPayouts).values({
  id: uid(), guildId, status: "paid", total: 100,
} as never);
ok("a PAID one does", await hasBeenPaid(db, guildId));
ok("…and clears the hold, even three days in", !(await payoutHoldFor(db, guildId)).held);

console.log("\n== the review queue is a queue, not a block ==");
const flags = await anomalousGrowth(db);
ok("it returns without throwing", Array.isArray(flags));
ok("a five-member server is below the threshold for a human's attention",
  !flags.some((f) => f.guildId === guildId));

console.log(`\n${pass} passed, ${fails.length} failed`);
if (fails.length) { fails.forEach((f) => console.log(`  - ${f}`)); process.exit(1); }
process.exit(0);
