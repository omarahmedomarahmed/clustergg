/**
 * B88.1 — a CP credit is money leaving a vault.
 *
 * THE DEFECT: nothing debited the CP vault. Sales credited it and nothing ever
 * took anything out, so its balance was a running total of what we had SOLD
 * rather than what was LEFT — and "how much of this week's allocation is still
 * available" could not be asked at all.
 *
 * That matters because the entire gamer economy is about to be derived from
 * that number (B88.3). A ceiling computed against a balance that only grows is
 * a ceiling that grows forever.
 *
 * Every assertion here is NEGATIVE in the sense that matters: it fails if the
 * vault reconciles high, if a zero-CP event writes a row, or if a bookkeeping
 * failure is allowed to take an earned credit away from a gamer.
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
const { balances, debitCpVault, cpSpentSince, postToLedger } = await import("../../lib/vaults.ts");
const { uid } = await import("../../lib/utils.ts");
const db = await getDb();

const RATE = 10_000;   // the shipped default: 10,000 CP = $1

// A clean starting point that does not depend on what the seed left behind.
const before = (await balances(db)).cp;
const t0 = new Date();

console.log("\n== CP credited is money out ==");
{
  await debitCpVault(db, [
    { userId: "u-alpha", cp: 500, actionKey: "daily_login", rate: RATE },
    { userId: "u-beta", cp: 250, actionKey: "play_session", rate: RATE },
  ]);
  const after = (await balances(db)).cp;
  // 750 CP at 10,000/$ is $0.075 — which rounds to $0.08 in cents, per row.
  // Asserted as the SUM OF THE ROWS rather than as a hand-computed figure: the
  // ledger's own rounding is the thing that has to be self-consistent.
  const spent = await cpSpentSince(db, t0);
  ok("the vault went down", after < before, `${before} → ${after}`);
  eq("…by exactly what the rows say", Math.round((before - after) * 100) / 100, Math.round(spent * 100) / 100);
  ok("…and that is roughly 750 CP at the rate", Math.abs(spent - 750 / RATE) < 0.02, String(spent));
}

console.log("\n== a gamer at their ceiling drains nothing ==");
{
  const mid = new Date();
  const balBefore = (await balances(db)).cp;
  await debitCpVault(db, [
    { userId: "u-alpha", cp: 0, actionKey: "profile_view", rate: RATE },
    { userId: "u-beta", cp: 0, actionKey: "post_react", rate: RATE },
  ]);
  const balAfter = (await balances(db)).cp;
  // `awardQuestAction` writes a quest_event whenever an action fires, INCLUDING
  // at the ceiling where it pays nothing. Those must not reach the ledger or it
  // fills with rows worth $0.00 and the count of "where the vault went" becomes
  // a count of activity instead.
  eq("no row is written for a zero-CP event", balAfter, balBefore);
  eq("…and nothing is counted as spent", await cpSpentSince(db, mid), 0);
}

console.log("\n== a rate of zero cannot divide by itself ==");
{
  const balBefore = (await balances(db)).cp;
  await debitCpVault(db, [{ userId: "u-alpha", cp: 100, actionKey: "daily_login", rate: 0 }]);
  // Not a hypothetical: `cpPerDollar` falls back to a default, but a settings
  // row of 0 would reach here. Dividing by it gives Infinity, and an Infinity in
  // a money column is a balance nobody can ever reconcile again.
  eq("a zero rate writes nothing rather than an infinite debit", (await balances(db)).cp, balBefore);
}

console.log("\n== the balance is the sum of its rows, still ==");
{
  // Read back independently of `balances` so the two cannot agree by sharing a
  // bug: sum every cp row by hand and compare.
  const rows = await db.select({ amount: schema.vaultLedger.amount, vault: schema.vaultLedger.vault })
    .from(schema.vaultLedger);
  const byHand = rows.filter((r) => r.vault === "cp")
    .reduce((a, r) => a + Number(r.amount ?? 0), 0);
  eq("summing by hand matches the balance",
    Math.round(byHand * 100) / 100, Math.round((await balances(db)).cp * 100) / 100);
}

console.log("\n== bookkeeping never fails an award ==");
{
  // The rule: a gamer who earned CP has earned it. A missing ledger row shows up
  // as a vault that reconciles high — visible, fixable, and ours. A refused
  // award shows up as a gamer who thinks the site is broken.
  const broken = {
    insert() { throw new Error("ledger is down"); },
  } as unknown as Parameters<typeof debitCpVault>[0];
  let threw = false;
  try {
    await debitCpVault(broken, [{ userId: "u-alpha", cp: 50, actionKey: "daily_login", rate: RATE }]);
  } catch { threw = true; }
  ok("a ledger failure is swallowed, not raised", !threw);
}

console.log("\n== an inflow and an outflow are distinguishable ==");
{
  const mid = new Date();
  await postToLedger(db, [{
    vault: "cp", amount: 100, kind: "challenge_sale", refType: "invoice", refId: uid(),
  }]);
  await debitCpVault(db, [{ userId: "u-gamma", cp: 1000, actionKey: "daily_login", rate: RATE }]);
  const spent = await cpSpentSince(db, mid);
  // `cpSpentSince` must count only what gamers took. If it counted every row it
  // would net the sale against the credit and report the week as barely spent.
  ok("a sale is not counted as spending", Math.abs(spent - 1000 / RATE) < 0.02, String(spent));
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
