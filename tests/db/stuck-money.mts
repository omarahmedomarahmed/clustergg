// B39 — every state where a prize has nowhere to go.
//
// Money-touching, so it is written with the item (§1.1). One assertion per row
// of the decision table, plus the two the plan adds: nothing is ever paid twice,
// and every terminal state is reachable from the admin view.
//
//   DEMO_DB=1 npx tsx tests/db/stuck-money.mts

process.env.DEMO_DB = "1";

let pass = 0;
const fails: string[] = [];
const ok = (name: string, cond: boolean, detail = "") => {
  if (cond) { pass++; console.log(`  ok   ${name}`); }
  else { fails.push(name); console.log(`  FAIL ${name}${detail ? ` — ${detail}` : ""}`); }
};
const eq = (name: string, got: unknown, want: unknown) =>
  ok(name, JSON.stringify(got) === JSON.stringify(want), `got ${JSON.stringify(got)}, want ${JSON.stringify(want)}`);

const { stuckMoney, stuckTotal, UNCLAIMED_HOLD_DAYS } = await import("../../lib/stuck-money.ts");
const { challengeStandings, closeChallenge } = await import("../../lib/challenges.ts");
const { getDb, schema } = await import("../../lib/db/index.ts");
const { and, eq: sqlEq } = await import("drizzle-orm");
const { uid } = await import("../../lib/utils.ts");

const db = await getDb();
const DAY = 86400_000;
const [space] = await db.select({ id: schema.spaces.id, game: schema.spaces.game }).from(schema.spaces).limit(1);

const mkUser = async (tag: string, extra: Record<string, unknown> = {}) => {
  const id = uid();
  await db.insert(schema.users).values({
    id, slug: `sm-${tag}-${id.slice(0, 6)}`, displayName: `SM ${tag}`,
    email: `${id}@test.invalid`, passwordHash: "x", ageBand: "adult", ...extra,
  } as never);
  return id;
};
const mkChallenge = async (extra: Record<string, unknown> = {}) => {
  const id = uid();
  await db.insert(schema.challenges).values({
    id, spaceId: space.id, game: space.game, provider: "chesscom",
    title: `Stuck ${id.slice(0, 5)}`,
    startAt: new Date(Date.now() - 9 * DAY), endAt: new Date(Date.now() - DAY),
    status: "active", visibility: "public", ...extra,
  } as never);
  return id;
};
const mkAccount = async (userId: string) => {
  const id = uid();
  await db.insert(schema.linkedGameAccounts).values({
    id, userId, provider: "chesscom", providerAccountId: `pa-${id.slice(0, 8)}`,
    inGameName: `ign-${id.slice(0, 5)}`, verified: true,
  } as never);
  return id;
};
const enter = async (challengeId: string, userId: string, points: number, joinedAt: Date) => {
  const acct = await mkAccount(userId);
  await db.insert(schema.challengeParticipants).values({
    id: uid(), challengeId, userId, linkedAccountId: acct,
    currentPoints: points, joinedAt, status: "active",
  } as never);
};

console.log("== a tie is broken by who entered first ==");
// The row that mattered most: this ordered by points alone, so equal scores were
// placed in whatever order the database returned — which can differ between two
// reads and decides who gets a trophy.
const tie = await mkChallenge();
const early = await mkUser("early");
const late = await mkUser("late");
await enter(tie, late, 100, new Date(Date.now() - 2 * DAY));    // same score…
await enter(tie, early, 100, new Date(Date.now() - 5 * DAY));   // …entered first
const standings = await challengeStandings(tie, 10);
eq("the earlier entry takes first place", standings[0]?.userId, early);
eq("…and the later one second", standings[1]?.userId, late);
// Deterministic: the same read twice must not reorder.
const again = await challengeStandings(tie, 10);
eq("the order is stable across reads", again.map((s) => s.userId), standings.map((s) => s.userId));

console.log("\n== fewer entrants than podium places ==");
const [t1, t2, t3] = await db.select().from(schema.trophies).limit(3);
const thin = await mkChallenge({
  prizes: { first: [t1.id], second: [t2.id], third: [t3.id] },
  sponsorPrice: 300, sponsorBrandId: null,
});
const only = await mkUser("only");
await enter(thin, only, 50, new Date(Date.now() - 3 * DAY));
await closeChallenge(thin);
const awarded = await db.select().from(schema.userTrophies)
  .where(sqlEq(schema.userTrophies.challengeId, thin));
eq("only the filled place is paid", awarded.length, 1);
eq("…and it is first place", awarded[0]?.placement, 1);
const rows1 = await stuckMoney(db);
const unfilled = rows1.find((r) => r.kind === "unfilled_podium" && r.id === thin);
ok("the unfilled places are surfaced", !!unfilled, JSON.stringify(rows1.map((r) => r.kind)));
ok("…saying how many were never filled", /2 places were never filled/.test(unfilled?.why ?? ""), unfilled?.why ?? "");
ok("…and what to do about it", !!unfilled?.action);

console.log("\n== a redemption that failed at the provider ==");
const failed = await mkUser("failed");
const fAward = uid();
await db.insert(schema.userTrophies).values({
  id: fAward, userId: failed, trophyId: t1.id, placement: 1, status: "pending",
} as never);
const fRedeem = uid();
await db.insert(schema.trophyRedeems).values({
  id: fRedeem, userId: failed, awardIds: [fAward], amount: 25, currency: "USD",
  method: "bank", status: "approved", failedReason: "Provider rejected: unsupported country",
} as never);
const rows2 = await stuckMoney(db);
const fail = rows2.find((r) => r.kind === "failed_payout" && r.id === fRedeem);
ok("it is listed", !!fail);
eq("…still approved, not lost", (await db.select({ s: schema.trophyRedeems.status })
  .from(schema.trophyRedeems).where(sqlEq(schema.trophyRedeems.id, fRedeem)))[0].s, "approved");
ok("…with the provider's own reason", /unsupported country/.test(fail?.why ?? ""), fail?.why ?? "");
eq("…and the amount in limbo", fail?.amount, 25);

console.log("\n== a winner who never said how to pay them ==");
const noPref = await mkUser("nopref");
await db.insert(schema.userTrophies).values({
  id: uid(), userId: noPref, trophyId: t1.id, placement: 1, status: "held",
} as never);
const rows3 = await stuckMoney(db);
const pref = rows3.find((r) => r.kind === "no_payout_preference" && r.id === noPref);
ok("they are surfaced", !!pref, JSON.stringify(rows3.filter((r) => r.kind === "no_payout_preference").map((r) => r.id)));
ok("…and NOTHING is said to expire", /nothing expires/i.test(pref?.action ?? ""), pref?.action ?? "");
// The trophy is untouched — this is a state, not a debt.
const stillHeld = await db.select().from(schema.userTrophies)
  .where(and(sqlEq(schema.userTrophies.userId, noPref), sqlEq(schema.userTrophies.status, "held")));
eq("their trophy is still held", stillHeld.length, 1);
ok("…and it is NOT counted in the limbo total",
  !stuckTotal(rows3.filter((r) => r.kind === "no_payout_preference")), String(stuckTotal(rows3)));

console.log("\n== a prize whose owner is gone ==");
const gone = await mkUser("gone", { status: "deleted" });
const goneAward = uid();
await db.insert(schema.userTrophies).values({
  id: goneAward, userId: gone, trophyId: t1.id, placement: 1, status: "held",
  awardedAt: new Date(Date.now() - (UNCLAIMED_HOLD_DAYS + 5) * DAY),
} as never);
const rows4 = await stuckMoney(db);
const ownerGone = rows4.find((r) => r.kind === "owner_gone" && r.id === goneAward);
ok("it is surfaced", !!ownerGone);
ok("…and past the hold it says to forfeit", /Forfeit/.test(ownerGone?.action ?? ""), ownerGone?.action ?? "");
// Inside the hold it must NOT say forfeit — that is the difference between a
// stated policy and money quietly disappearing.
const recent = await mkUser("recent", { status: "deleted" });
const recentAward = uid();
await db.insert(schema.userTrophies).values({
  id: recentAward, userId: recent, trophyId: t1.id, placement: 1, status: "held",
  awardedAt: new Date(Date.now() - 2 * DAY),
} as never);
const rows5 = await stuckMoney(db);
const held = rows5.find((r) => r.kind === "owner_gone" && r.id === recentAward);
ok("inside the hold it is held, not forfeited", /Nothing yet/.test(held?.action ?? ""), held?.action ?? "");
ok("…with the date it runs out", /Held until/.test(held?.why ?? ""), held?.why ?? "");

console.log("\n== a cancelled challenge that had entries ==");
const cancelled = await mkChallenge({ status: "cancelled" });
const entrant = await mkUser("entrant");
await enter(cancelled, entrant, 40, new Date(Date.now() - 4 * DAY));
const rows6 = await stuckMoney(db);
const cx = rows6.find((r) => r.kind === "cancelled_with_entries" && r.id === cancelled);
ok("it is surfaced", !!cx);
ok("…saying entrants keep their points", /keeps the Cluster Points/.test(cx?.why ?? ""), cx?.why ?? "");
eq("…and nothing is owed", cx?.amount, 0);
const stillIn = await db.select().from(schema.challengeParticipants)
  .where(sqlEq(schema.challengeParticipants.challengeId, cancelled));
eq("the entry itself survives cancellation", stillIn.length, 1);

console.log("\n== nothing is ever paid twice ==");
// Closing a challenge again must not mint a second trophy.
const before = await db.select().from(schema.userTrophies)
  .where(sqlEq(schema.userTrophies.challengeId, thin));
await closeChallenge(thin);
const after = await db.select().from(schema.userTrophies)
  .where(sqlEq(schema.userTrophies.challengeId, thin));
eq("re-closing a challenge awards nothing more", after.length, before.length);

console.log("\n== every state reaches the admin view ==");
const all = await stuckMoney(db);
for (const kind of ["unfilled_podium", "failed_payout", "no_payout_preference", "owner_gone", "cancelled_with_entries"]) {
  ok(`"${kind}" is reachable`, all.some((r) => r.kind === kind));
}
ok("every row says WHY", all.every((r) => !!r.why));
ok("every row says WHAT UNSTICKS IT", all.every((r) => !!r.action));
ok("the total counts only what needs a decision",
  stuckTotal(all) === all.filter((r) => ["failed_payout", "owner_gone", "unfilled_podium"].includes(r.kind))
    .reduce((s, r) => s + r.amount, 0));

console.log(`\n${pass} passed, ${fails.length} failed`);
if (fails.length) { fails.forEach((f) => console.log(`  - ${f}`)); process.exit(1); }
process.exit(0);
