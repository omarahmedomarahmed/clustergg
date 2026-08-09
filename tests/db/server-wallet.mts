/**
 * B89.1 — a server owner's wallet.
 *
 * An owner could see the challenges they ran and could not see the money they
 * were owed. This is the balance, and the two ways it goes down: withdrawing it,
 * and spending it on a private challenge for their own members.
 *
 * The assertions that matter are the ones about DOUBLE-SPENDING. A balance that
 * can be both withdrawn and spent in the same week is a platform that owes twice
 * and discovers it at the payment provider.
 */
process.env.DEMO_DB = "1";

let pass = 0, fail = 0;
const ok = (name: string, cond: boolean, extra = "") => {
  if (cond) { pass++; console.log(`  ✓ ${name}`); }
  else { fail++; console.log(`  ✗ ${name}${extra ? ` — ${extra}` : ""}`); }
};
const eq = (name: string, got: unknown, want: unknown) =>
  ok(name, JSON.stringify(got) === JSON.stringify(want), `got ${JSON.stringify(got)}, want ${JSON.stringify(want)}`);

const { getDb, schema } = await import("../../lib/db/index.ts");
const { uid } = await import("../../lib/utils.ts");
const { walletFor, statementFor, chargeWallet, requestWithdrawal, MIN_WITHDRAWAL, ownerActor } =
  await import("../../lib/server-wallet.ts");
const { WEEK_CLOSE_ACTOR } = await import("../../lib/week-close.ts");
const { eq: dEq } = await import("drizzle-orm");

const db = await getDb();
const guild = `wal-${uid().slice(0, 6)}`;

await db.insert(schema.discordGuilds).values({
  guildId: guild, name: "Wallet Test", memberCount: 400,
}).onConflictDoNothing();

/** Open a payout with one line, the way the close does. */
const award = async (amount: number, status: string, by = WEEK_CLOSE_ACTOR, periodStart?: Date) => {
  const id = uid();
  await db.insert(schema.serverPayouts).values({
    id, guildId: guild, guildName: "Wallet Test", status,
    requestedBy: by, periodStart: periodStart ?? new Date(),
    paidAt: status === "paid" ? new Date() : null,
  } as never);
  await db.insert(schema.serverPayoutLines).values({
    id: uid(), payoutId: id, label: "Server pool", amount, kind: "pool",
  } as never);
  return id;
};

console.log("\n== an empty wallet is empty, not broken ==");
{
  const w = await walletFor(db, `nobody-${uid().slice(0, 4)}`);
  eq("nothing earned", w.earned, 0);
  eq("nothing available", w.available, 0);
}

console.log("\n== the close credits the wallet ==");
{
  await award(100, "draft");
  const w = await walletFor(db, guild);
  eq("earned is what the close awarded", w.earned, 100);
  // A DRAFT is the close's OWN calculation, not a withdrawal the owner asked
  // for. It is their money sitting in their wallet, so it is spendable.
  //
  // This is the assertion that caught the original design: when a draft counted
  // as committed, `available` was earned − paid − earned = 0 for every owner
  // forever, and the wallet could never be used for anything.
  eq("…and a draft is not a withdrawal, so it is spendable", w.pending, 0);
  eq("…so the whole amount is available", w.available, 100);
}

console.log("\n== paying it out moves it from pending to paid ==");
{
  const payoutId = await award(50, "paid");
  void payoutId;
  const w = await walletFor(db, guild);
  eq("earned counts both weeks", w.earned, 150);
  eq("…and one of them is paid", w.paid, 50);
  eq("…leaving the unpaid one available", w.available, 100);
}

console.log("\n== a CANCELLED payout returns the money ==");
{
  // Cancelling a withdrawal must give the balance back. If it did not, an owner
  // who changed their mind would have lost the money to a status change.
  const id = await award(80, "requested");
  let w = await walletFor(db, guild);
  eq("a REQUESTED payout is committed", w.pending, 80);

  await db.update(schema.serverPayouts).set({ status: "cancelled" }).where(dEq(schema.serverPayouts.id, id));
  w = await walletFor(db, guild);
  eq("cancelled money is not earned", w.earned, 150);
  eq("…and not pending", w.pending, 0);
  eq("…and is back in the balance", w.available, 100);
}

console.log("\n== a hand-opened payout is not earnings ==");
{
  // A correction or a goodwill cheque was never funded out of the pool.
  // Counting it as earnings would let an adjustment inflate a balance the owner
  // can then spend on a private challenge.
  await award(500, "draft", "admin-by-hand");
  const w = await walletFor(db, guild);
  eq("it does not raise what was earned", w.earned, 150);
}

console.log("\n== spending the balance ==");
{
  const before = await walletFor(db, guild);
  ok("there is something to spend", before.available > 0, JSON.stringify(before));

  const tooMuch = await chargeWallet(db, {
    guildId: guild, amount: before.available + 1000, fee: 0, label: "Too big",
  });
  ok("an overdraft is refused", !tooMuch.ok);
  // "Declined" with no number reads as the platform being broken.
  ok("…and the refusal names the balance",
    !tooMuch.ok && /\$/.test(tooMuch.error), !tooMuch.ok ? tooMuch.error : "");

  {
    const amount = Math.min(before.available, 10);
    const fee = Math.round(amount * 0.05 * 100) / 100;
    const r = await chargeWallet(db, {
      guildId: guild, amount, fee, label: "Private challenge — Chess night",
    });
    ok("a charge inside the balance goes through", r.ok, JSON.stringify(r));
    const after = await walletFor(db, guild);
    // AMOUNT PLUS FEE. B90.4: a charge stores the prize pool and our margin in
    // separate columns, and this used to assert the pool alone — which is
    // exactly the bug it was hiding. The fee never left the wallet: the owner
    // was billed for it and it was a discount nobody decided to give.
    eq("…and the balance went down by the whole charge, fee included",
      Math.round((before.available - after.available) * 100) / 100, Math.round((amount + fee) * 100) / 100);
    eq("…and that is what is recorded as spent", after.spent, Math.round((amount + fee) * 100) / 100);
  }
}

console.log("\n== zero and nonsense are refused ==");
{
  for (const bad of [0, -5, Number.NaN]) {
    const r = await chargeWallet(db, { guildId: guild, amount: bad, fee: 0, label: "x" });
    ok(`${String(bad)} is refused`, !r.ok);
  }
}

console.log("\n== a goodwill cheque does not eat the balance ==");
{
  // The mirror of the hand-opened-draft case above, and a worse bug: a payout
  // an admin typed by hand was never funded out of the pool, so counting it as
  // PAID while it does not count as EARNED would drop the owner's spendable
  // balance by exactly the amount we just gave them. Give somebody $200 and
  // take $200 off what they can spend.
  const before = await walletFor(db, guild);
  await award(200, "paid", "admin-by-hand");
  const after = await walletFor(db, guild);
  eq("paying a correction leaves the balance alone", after.available, before.available);
  eq("…and it is not counted as a withdrawal of the pool", after.paid, before.paid);
}

console.log("\n== the owner asks for their money ==");
{
  const before = await walletFor(db, guild);
  ok("there is a balance to withdraw", before.available >= MIN_WITHDRAWAL, JSON.stringify(before));

  const tiny = await requestWithdrawal(db, { guildId: guild, amount: MIN_WITHDRAWAL - 1 });
  ok("under the minimum is refused", !tiny.ok);
  ok("…and the refusal says what the minimum is",
    !tiny.ok && tiny.error.includes(String(MIN_WITHDRAWAL)), !tiny.ok ? tiny.error : "");

  const huge = await requestWithdrawal(db, { guildId: guild, amount: before.available + 500 });
  ok("more than the balance is refused", !huge.ok);

  const amount = MIN_WITHDRAWAL;
  const r = await requestWithdrawal(db, { guildId: guild, amount, guildName: "Wallet Test" });
  ok("a withdrawal inside the balance opens", r.ok, JSON.stringify(r));

  const after = await walletFor(db, guild);
  eq("…it is now committed", after.pending, amount);
  eq("…and it left the spendable balance",
    after.available, Math.round((before.available - amount) * 100) / 100);
  // The double-spend this whole file exists to prevent: money the owner has
  // asked for must not still be available to buy a private challenge with.
  const doubleSpend = await chargeWallet(db, {
    guildId: guild, amount: before.available, fee: 0, label: "Spending it twice",
  });
  ok("…so it cannot also be spent", !doubleSpend.ok);

  // An owner-requested withdrawal is not earnings, however it is labelled.
  eq("asking for money does not create money", after.earned, before.earned);
  ok("the request is attributed to the owner, not to staff",
    ownerActor(guild) === `owner:${guild}`);
}

console.log("\n== the statement shows both sides of a movement ==");
{
  const rows = await statementFor(db, guild);
  ok("there are lines", rows.length > 0, String(rows.length));
  ok("earnings appear", rows.some((r) => r.kind === "earned"));
  ok("withdrawals appear as their own negative line", rows.some((r) => r.kind === "withdrawn" && r.amount < 0));
  ok("spending appears", rows.some((r) => r.kind === "spent" && r.amount < 0));
  // An owner reconciling a statement needs to see both events, not their net.
  // A single line reading "$0" for an earning that was immediately withdrawn is
  // the shape of a support ticket.
  ok("…and an earning is never netted against its own withdrawal",
    rows.filter((r) => r.kind === "earned").every((r) => r.amount > 0));
  ok("newest first", rows.every((r, i) => i === 0 || +rows[i - 1].at >= +r.at));
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
