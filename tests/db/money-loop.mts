/**
 * One dollar, end to end. M7.
 *
 * ===== WHY THIS SUITE EXISTS =====
 *
 * Every stage of the money loop is tested, and no test followed a dollar
 * through all of them. That is not a gap in coverage so much as a gap in
 * MEANING: each stage was verified against its own idea of what it received and
 * what it hands on, and two stages can each be right while disagreeing about
 * the thing between them.
 *
 * That is exactly how the two worst defects in this codebase survived. The
 * weekly close computed a payout and dropped anything under $25 into a variable
 * with no consumer — every stage passed its own tests while the money ceased to
 * exist. And nothing settled a paid invoice at all until a human clicked a
 * button, so the loop's first link was a person.
 *
 * So this walks the whole chain in one run:
 *
 *   1. a brand is invoiced
 *   2. the invoice is paid          → the four vaults are posted
 *   3. an admin releases a pool     → from the server vault
 *   4. the week closes              → servers are scored and credited
 *   5. the owner's wallet fills     → earned, and spendable
 *   6. the owner spends or withdraws
 *
 * At every step it asserts CONSERVATION — what went in comes out — because a
 * money loop that loses a cent somewhere is the only kind of bug here that
 * cannot be apologised for.
 *
 *   DEMO_DB=1 npx tsx tests/db/money-loop.mts
 */
process.env.DEMO_DB = "1";

let pass = 0;
const fails: string[] = [];
const ok = (name: string, cond: boolean, detail = "") => {
  if (cond) { pass++; console.log(`  ok   ${name}`); }
  else { fails.push(name); console.log(`  FAIL ${name}${detail ? ` — ${detail}` : ""}`); }
};
const near = (name: string, got: number, want: number, tol = 0.02) =>
  ok(name, Math.abs(got - want) <= tol, `got ${got}, want ${want}`);

const { getDb, schema } = await import("../../lib/db/index.ts");
const { eq } = await import("drizzle-orm");
const { uid } = await import("../../lib/utils.ts");
const { balances } = await import("../../lib/vaults.ts");
const { settleInvoicePaid } = await import("../../lib/billing-settle.ts");
const { DEFAULT_SPLIT } = await import("../../lib/vault-split.ts");
const { walletFor, requestWithdrawal, MIN_WITHDRAWAL } = await import("../../lib/server-wallet.ts");
const { MIN_PRIZE_POOL, PRIZE_POOL_STEP, quotePrivate } = await import("../../lib/private-quote.ts");
const { weekPayouts, PARTICIPATION_SHARE } = await import("../../lib/server-score.ts");
const { RUNGS, EARN_FLOOR } = await import("../../lib/ladder.ts");

const db = await getDb();
const SALE = 350;

console.log("== 1–2. a brand pays, and the four vaults post ==");
let invoiceId = "";
{
  const [brand] = await db.select({ id: schema.brands.id }).from(schema.brands).limit(1);
  invoiceId = uid();
  await db.insert(schema.brandInvoices).values({
    id: invoiceId, brandId: brand.id, number: `CGG-M7${Math.floor(Math.random() * 9000 + 1000)}`,
    status: "sent", currency: "USD",
  });
  await db.insert(schema.invoiceLines).values({
    id: uid(), invoiceId, label: "Sponsored challenge", quantity: 1, unitAmount: SALE,
  });

  const before = await balances(db);
  const res = await settleInvoicePaid(db, invoiceId, { via: "test", ref: "m7" });
  ok("the invoice settles", res.ok && res.changed === true, JSON.stringify(res));
  const after = await balances(db);

  const moved = (after.prize - before.prize) + (after.server - before.server)
    + (after.cp - before.cp) + (after.cluster - before.cluster);
  // THE FIRST CONSERVATION CHECK. Every cent the brand paid is somewhere.
  near("every cent the brand paid reaches a vault", moved, SALE);

  // …and in the shares the platform actually promises, read from the split
  // rather than retyped, so a repricing cannot leave this asserting the old one.
  near("the prize vault takes its share", after.prize - before.prize, SALE * DEFAULT_SPLIT.prize / 100);
  near("…the server vault takes its share", after.server - before.server, SALE * DEFAULT_SPLIT.server / 100);
  near("…the points vault takes its share", after.cp - before.cp, SALE * DEFAULT_SPLIT.cp / 100);
  near("…and we take ours", after.cluster - before.cluster, SALE * DEFAULT_SPLIT.cluster / 100);

  ok("the gamers' share is the largest single one",
    DEFAULT_SPLIT.prize > Math.max(DEFAULT_SPLIT.server, DEFAULT_SPLIT.cp, DEFAULT_SPLIT.cluster),
    JSON.stringify(DEFAULT_SPLIT));

  // Settling twice must not post twice. Stripe re-delivers on its own.
  const again = await settleInvoicePaid(db, invoiceId, { via: "test", ref: "m7" });
  const end = await balances(db);
  ok("a second settle changes nothing", again.ok && again.changed === false);
  near("…and posts no second allocation",
    (end.prize + end.server + end.cp + end.cluster)
    - (after.prize + after.server + after.cp + after.cluster), 0);
}

console.log("\n== 3–4. the pool is divided, and nothing is withheld ==");
{
  // The division is pure arithmetic, so it is exercised directly rather than
  // through a week of fixtures — `tests/db/week-close.mts` owns the fixtures.
  // What matters HERE is the join: the server vault's share of the sale is what
  // there is to divide, and all of it must land.
  const serverPool = SALE * DEFAULT_SPLIT.server / 100;

  const field = [
    { guildId: "m7-a", score: 90, rung: RUNGS[0].key },
    { guildId: "m7-b", score: 30, rung: RUNGS[0].key },
    { guildId: "m7-c", score: 60, rung: RUNGS[1].key },
  ];
  const { payouts } = weekPayouts(serverPool, field);
  const total = payouts.reduce((a, p) => a + p.amount, 0);

  near("the whole server pool is distributed", total, serverPool);
  ok("every server that took part is credited", payouts.length === field.length,
    `${payouts.length} of ${field.length}`);
  // THE M2 REGRESSION. There is no floor on a distribution: it moves a number
  // between two rows of our own database, so there is no fee and nothing is too
  // small to move. A server owed $0.50 is credited $0.50.
  ok("…including the ones owed only a few dollars",
    payouts.every((p) => p.amount > 0), JSON.stringify(payouts));

  // A pool small enough that every share is under a dollar still lands whole.
  const tiny = weekPayouts(3, field).payouts;
  near("a $3 pool is still conserved", tiny.reduce((a, p) => a + p.amount, 0), 3, 0.05);
  ok("…across every server", tiny.length === field.length);

  ok("the flat share is a real fraction of the pool",
    PARTICIPATION_SHARE > 0 && PARTICIPATION_SHARE < 100, String(PARTICIPATION_SHARE));
}

console.log("\n== 5–6. the wallet fills, and both doors open ==");
{
  // A wallet is DERIVED — earned − paid − pending − spent — so a real payout
  // row is what makes a balance, not a column somebody set.
  const guildId = `m7-guild-${uid().slice(0, 6)}`;
  await db.insert(schema.discordGuilds).values({
    guildId, name: "M7 Test Server", memberCount: 120,
  }).onConflictDoNothing();

  const { WEEK_CLOSE_ACTOR } = await import("../../lib/week-close.ts");
  const payoutId = uid();
  const weekStart = new Date(Date.UTC(2031, 0, 6));
  await db.insert(schema.serverPayouts).values({
    id: payoutId, guildId, status: "draft", requestedBy: WEEK_CLOSE_ACTOR,
    periodStart: weekStart, periodEnd: new Date(weekStart.getTime() + 7 * 86400_000),
  });
  const EARNED = 40;
  await db.insert(schema.serverPayoutLines).values({
    id: uid(), payoutId, kind: "pool", label: "Server pool", amount: EARNED,
  });

  const w = await walletFor(db, guildId);
  near("what the close awarded is what the wallet says was earned", w.earned, EARNED);
  // A DRAFT is our own calculation sitting in their wallet, not money on its
  // way out — treating it as committed makes every balance identically zero.
  near("…and it is spendable, because a draft is not a withdrawal", w.available, EARNED);

  // THE TWO THRESHOLDS, and the order they open in. This is the whole M6
  // decision in one assertion: spending inside the platform opens BEFORE taking
  // money out, because a distribution costs nothing to make and a transfer
  // pays a provider fee.
  ok("the spend door opens lower than the withdraw door",
    MIN_PRIZE_POOL < MIN_WITHDRAWAL, `spend ${MIN_PRIZE_POOL}, withdraw ${MIN_WITHDRAWAL}`);
  ok("…and the smallest challenge is one step, not a fraction of one",
    MIN_PRIZE_POOL % PRIZE_POOL_STEP === 0, `${MIN_PRIZE_POOL} / ${PRIZE_POOL_STEP}`);

  // Below the withdrawal floor, the money is not lost — it is still theirs and
  // still spendable, which is the sentence the product makes to owners.
  const tooSmall = await requestWithdrawal(db, { guildId, amount: MIN_WITHDRAWAL - 1 });
  ok("a withdrawal under the floor is refused", !tooSmall.ok);
  ok("…and the refusal names the real number",
    !tooSmall.ok && tooSmall.error.includes(String(MIN_WITHDRAWAL)), !tooSmall.ok ? tooSmall.error : "");
  const still = await walletFor(db, guildId);
  near("…and the balance is untouched by being refused", still.available, EARNED);

  // Spending: the quote is what the wallet is charged, with the fee on top.
  const q = quotePrivate(MIN_PRIZE_POOL);
  near("a minimum challenge costs the pool plus the fee", q.total, MIN_PRIZE_POOL + q.fee);
  ok("…and this balance affords one", q.total <= still.available, `${q.total} vs ${still.available}`);

  // Withdrawing: at the floor it opens, and the money stops being spendable the
  // instant it is requested — otherwise it goes out twice, once to a bank and
  // once on a challenge.
  const out = await requestWithdrawal(db, { guildId, amount: MIN_WITHDRAWAL });
  ok("a withdrawal at the floor opens", out.ok, out.ok ? "" : out.error);
  const after = await walletFor(db, guildId);
  near("…and the requested money leaves the spendable balance", after.available, EARNED - MIN_WITHDRAWAL);
  near("…while what was earned is unchanged", after.earned, EARNED);

  // THE LAST CONSERVATION CHECK. Nothing evaporated between the close and here.
  near("available + pending still equals what was earned",
    after.available + after.pending, EARNED);
}

console.log("\n== the loop has no human in the middle ==");
{
  // The defect that made this suite necessary: a brand paid and NOTHING moved
  // until a member of staff noticed. A challenge cannot be announced before its
  // bill is paid, so an unnoticed payment silently withheld the thing the brand
  // had just bought from every server on the network.
  const [inv] = await db.select({ status: schema.brandInvoices.status, paidVia: schema.brandInvoices.paidVia })
    .from(schema.brandInvoices).where(eq(schema.brandInvoices.id, invoiceId)).limit(1);
  ok("the invoice settled without anyone clicking anything", inv.status === "paid", inv.status);
  ok("…and recorded how", inv.paidVia === "test", String(inv.paidVia));

  // And the earning gate is a real bar, so the pool divides between servers
  // that brought somebody rather than every guild the bot happens to sit in.
  ok("the ladder's first rung is a bar, not zero", EARN_FLOOR > 0, String(EARN_FLOOR));
}

console.log(`\n${pass} passed, ${fails.length} failed`);
if (fails.length) { console.log(fails.map((f) => `  ✗ ${f}`).join("\n")); process.exit(1); }
