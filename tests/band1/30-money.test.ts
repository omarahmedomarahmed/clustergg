// Stage 3 — money.
//
// Built before anything that spends it, and tested the same way. Every figure
// here is imported from `lib/money/amounts.ts`; nothing in this file retypes a
// price, a share or a threshold, because a test that retypes a number is a
// second copy of it that can go on passing after the first one changes.

import { ok, eq, no, throws } from "../helpers/assert.ts";
import { test } from "../helpers/suite.ts";
import { resetDemoDb, schema } from "../../lib/db/index.ts";
import {
  CHALLENGE_PRICE_CENTS,
  DEFAULT_SPLIT_BPS,
  BPS,
  POOL_MAX_FRACTION_OF_VAULT,
  POOL_FLAT_BPS,
  POOL_SCORED_BPS,
  KPI_WEIGHTS,
  COMMUNITY_TIERS,
  communityPriceCents,
  communitySplitOf,
  splitOf,
  formatMoney,
} from "../../lib/money/amounts.ts";
import { balanceOf, allBalances, post, ledgerBalances } from "../../lib/money/ledger.ts";
import { createInvoice, markPaid, invoiceView, isInvoicePaid } from "../../lib/money/invoices.ts";
import {
  allocateToPool,
  maxAllocationCents,
  poolForWeek,
  PoolAllocationRefused,
  PoolAllocationLowered,
} from "../../lib/money/pool.ts";
import { draftPayout, releasePayout, payoutTotal, markPayoutPaid, PayoutNotReleasable } from "../../lib/money/payouts.ts";
import { checkPrizeVault, assertHeadroom, OverAllocationError } from "../../lib/money/prize-vault.ts";
import { createGamer } from "../../lib/identity/gamers.ts";
import { uid } from "../../lib/core/utils.ts";
import { eq as sqlEq } from "drizzle-orm";

// ── The numbers themselves ──────────────────────────────────────────────────

test("the split accounts for every cent", () => {
  eq(
    DEFAULT_SPLIT_BPS.prize + DEFAULT_SPLIT_BPS.server + DEFAULT_SPLIT_BPS.cluster,
    BPS,
    "the three shares are the whole of income — nothing falls between them",
  );
  const s = splitOf(CHALLENGE_PRICE_CENTS);
  eq(s.prize + s.server + s.cluster, CHALLENGE_PRICE_CENTS, "and a split loses nothing");
  eq(s.prize, CHALLENGE_PRICE_CENTS / 2, "half the price backs the prizes");
  eq(s.server, s.cluster, "and the other half divides evenly");
});

test("an odd cent goes to Cluster, never to the prize vault", () => {
  // 3 cents cannot divide 50/25/25. Something absorbs the remainder, and the
  // direction matters: a cent short in the prize vault breaks the invariant
  // that every trophy is backed, and a cent short in the server vault is a
  // cent owed to somebody else. We are the only party that can be short.
  const s = splitOf(3);
  eq(s.prize + s.server + s.cluster, 3, "the split is exact");
  eq(s.prize, 2, "the prize share rounds up rather than down");
  ok(s.cluster <= 1, "and Cluster absorbs what is left");

  for (const amount of [1, 3, 7, 33, 101, 35_001, 999_999]) {
    const x = splitOf(amount);
    eq(x.prize + x.server + x.cluster, amount, `${amount} cents splits exactly`);
  }
});

test("money is only ever whole cents", async () => {
  await throws(
    () => splitOf(350.5),
    /whole cents/,
    "a fractional amount is refused rather than silently rounded",
  );
});

test("a split that does not sum to the whole is refused", async () => {
  await throws(
    () => splitOf(1000, { prize: 5000, server: 2500, cluster: 2000 }),
    /every cent/,
    "an operator cannot configure a split that loses money",
  );
});

test("the KPI weights sum to a hundred", () => {
  eq(
    KPI_WEIGHTS.entrants + KPI_WEIGHTS.conversion + KPI_WEIGHTS.activation,
    100,
    "volume 40, efficiency 30, quality 30",
  );
  eq(POOL_FLAT_BPS + POOL_SCORED_BPS, BPS, "and the flat and scored halves of a pool are the whole of it");
});

test("community money never reaches the server vault", () => {
  // C2: paying an owner from a pool their own money funded would pay them
  // twice. This is the reason community income has its own split function
  // rather than a parameter — it is a rule, not a configuration.
  for (const tier of [1, 2] as const) {
    const split = communitySplitOf(tier);
    eq(split.server, 0, `tier ${tier} puts nothing into vault 3`);
    eq(
      split.prize + split.server + split.cluster,
      communityPriceCents(tier),
      `tier ${tier} splits exactly what the owner paid`,
    );
    eq(split.prize, COMMUNITY_TIERS[tier].prizeCents, `tier ${tier} funds its whole prize pool`);
  }
  eq(communitySplitOf(1).cluster, 0, "tier 1 carries no Cluster margin at all");
  ok(communitySplitOf(2).cluster > 0, "tier 2 carries 5%");
});

test("money formats as money", () => {
  eq(formatMoney(CHALLENGE_PRICE_CENTS), "$350.00", "the unit price reads as itself");
  eq(formatMoney(8_750), "$87.50", "and a quarter share does too");
  eq(formatMoney(-8_750), "-$87.50", "a debit is signed");
  eq(formatMoney(0), "$0.00", "and nothing is nothing");
});

// ── The ledger ──────────────────────────────────────────────────────────────

test("a balance is the sum of the rows, and there is no column", async () => {
  const db = await resetDemoDb();
  eq(await balanceOf(db, "prize"), 0, "an empty vault is empty");

  await post(db, [
    { vault: "prize", amount: 10_000, kind: "split", reason: "test in" },
    { vault: "prize", amount: -2_500, kind: "redemption", reason: "test out" },
  ]);
  eq(await balanceOf(db, "prize"), 7_500, "and a balance is what the rows add up to");
});

test("a ledger row without a reason is refused", async () => {
  const db = await resetDemoDb();
  await throws(
    () => post(db, [{ vault: "prize", amount: 100, kind: "split", reason: "" }]),
    /names a reason/,
    "a row nobody can explain is a row nobody can reverse",
  );
});

test("a paid invoice routes into the vaults, and an unpaid one does not", async () => {
  const db = await resetDemoDb();
  const invoiceId = await createInvoice(db, {
    payerType: "brand",
    payerId: "brand-acme",
    lines: [{ description: "League of Legends, week 1", amountCents: CHALLENGE_PRICE_CENTS }],
  });

  eq(await isInvoicePaid(db, invoiceId), false, "an issued invoice is not a paid one");
  eq(await balanceOf(db, "prize"), 0, "and nothing has reached a vault");

  const routed = await markPaid(db, invoiceId, { providerRef: "pi_test_123" });
  ok(routed.routed, "paying it routes the money");

  const balances = await allBalances(db);
  eq(balances.prize, CHALLENGE_PRICE_CENTS / 2, "half backs the prizes");
  eq(balances.server, CHALLENGE_PRICE_CENTS / 4, "a quarter is owed to servers");
  eq(balances.cluster, CHALLENGE_PRICE_CENTS / 4, "a quarter is ours");
  eq(balances.income, 0, "and income is a doorway, not a destination");
  ok(await ledgerBalances(db), "the ledger balances");
});

test("a webhook that fires twice does not pay twice", async () => {
  const db = await resetDemoDb();
  const invoiceId = await createInvoice(db, {
    payerType: "brand",
    lines: [{ description: "One challenge", amountCents: CHALLENGE_PRICE_CENTS }],
  });

  const first = await markPaid(db, invoiceId);
  const second = await markPaid(db, invoiceId);

  ok(first.routed, "the first delivery routes");
  no(second.routed, "the second says plainly that it did not");
  eq(
    await balanceOf(db, "prize"),
    CHALLENGE_PRICE_CENTS / 2,
    "and the prize vault holds one challenge's worth, not two",
  );
});

test("an invoice total is its lines, and overdue is a comparison", async () => {
  const db = await resetDemoDb();
  const yesterday = new Date(Date.now() - 86_400_000);
  const invoiceId = await createInvoice(db, {
    payerType: "brand",
    dueAt: yesterday,
    lines: [
      { description: "Week 1", amountCents: CHALLENGE_PRICE_CENTS },
      { description: "Week 2", amountCents: CHALLENGE_PRICE_CENTS },
    ],
  });

  const view = await invoiceView(db, invoiceId);
  eq(view?.totalCents, CHALLENGE_PRICE_CENTS * 2, "a series is billed together");
  ok(view?.overdue, "past its due date and unpaid is overdue — no flag, no job");

  await markPaid(db, invoiceId);
  const after = await invoiceView(db, invoiceId);
  no(after?.overdue, "and a paid invoice is never overdue, whatever the date says");
});

// ── The prize vault ─────────────────────────────────────────────────────────

async function aTrophy(db: Awaited<ReturnType<typeof resetDemoDb>>, valueCents: number) {
  const id = uid();
  await db.insert(schema.trophies).values({ id, type: "podium", name: "Test", valueCents });
  return id;
}

async function award(
  db: Awaited<ReturnType<typeof resetDemoDb>>,
  trophyId: string,
  userId: string,
) {
  await db.insert(schema.userTrophies).values({ id: uid(), trophyId, userId });
}

test("the prize vault is green when every dollar sits on a profile", async () => {
  const db = await resetDemoDb();
  const invoiceId = await createInvoice(db, {
    payerType: "brand",
    lines: [{ description: "One challenge", amountCents: CHALLENGE_PRICE_CENTS }],
  });
  await markPaid(db, invoiceId);

  const unallocated = await checkPrizeVault(db);
  eq(unallocated.state, "unallocated", "money in, not yet promised");
  no(unallocated.holds, "so the invariant does not hold yet — and the console says why");

  const userId = await createGamer(db, { displayName: "Winner" });
  await award(db, await aTrophy(db, CHALLENGE_PRICE_CENTS / 2), userId);

  const green = await checkPrizeVault(db);
  eq(green.state, "green", "every dollar now sits on a gamer's profile");
  ok(green.holds, "and the invariant holds");
  eq(green.liabilityCents, green.balanceCents, "balance equals liability, exactly");
});

test("a $0 trophy has nothing to do with the prize vault", async () => {
  const db = await resetDemoDb();
  const userId = await createGamer(db, { displayName: "Turned Up" });
  await award(db, await aTrophy(db, 0), userId);

  const check = await checkPrizeVault(db);
  eq(check.liabilityCents, 0, "a collectable is not a liability");
  eq(check.state, "green", "and an empty vault with no money-trophies is green");
});

test("a deleted holder leaves orphaned money the console can see", async () => {
  const db = await resetDemoDb();
  const invoiceId = await createInvoice(db, {
    payerType: "brand",
    lines: [{ description: "One challenge", amountCents: CHALLENGE_PRICE_CENTS }],
  });
  await markPaid(db, invoiceId);

  const userId = await createGamer(db, { displayName: "Leaving" });
  await award(db, await aTrophy(db, CHALLENGE_PRICE_CENTS / 2), userId);
  ok((await checkPrizeVault(db)).holds, "green before they leave");

  await db.update(schema.users).set({ status: "deleted" }).where(sqlEq(schema.users.id, userId));

  const after = await checkPrizeVault(db);
  eq(after.state, "orphaned", "the money is real and can never be claimed");
  eq(after.orphanedCents, CHALLENGE_PRICE_CENTS / 2, "and the console can say how much");
  eq(after.liabilityCents, 0, "it is no longer live liability");
  ok(
    /sweep/.test(after.explanation),
    "the explanation says what to do about it, not merely that it happened",
  );
});

test("over-allocation is refused at assignment, not discovered at payout", async () => {
  const db = await resetDemoDb();
  const invoiceId = await createInvoice(db, {
    payerType: "brand",
    lines: [{ description: "One challenge", amountCents: CHALLENGE_PRICE_CENTS }],
  });
  await markPaid(db, invoiceId);
  const headroom = CHALLENGE_PRICE_CENTS / 2;

  await assertHeadroom(db, headroom);

  const err = await throws(
    () => assertHeadroom(db, headroom + 1),
    /more money than the prize vault holds/,
    "one cent more than the vault holds is refused",
  );
  ok(err instanceof OverAllocationError, "with the error that names the rule");
  eq((err as OverAllocationError).shortfallCents, 1, "and says exactly how short it is");
});

test("the vault reports over-allocated rather than pretending it is unclaimed", async () => {
  const db = await resetDemoDb();
  const userId = await createGamer(db, { displayName: "Promised Too Much" });
  // No income at all, but a money-trophy exists — which can only happen if
  // something wrote outside the ledger. The console must not read this as a
  // normal amber phase.
  await award(db, await aTrophy(db, 10_000), userId);

  const check = await checkPrizeVault(db);
  eq(check.state, "over_allocated", "a promise we cannot keep is not a rhythm");
  no(check.holds, "and the invariant does not hold");
  ok(/must be impossible/.test(check.explanation), "the explanation says so in those words");
});

// ── The pool and the half rule ──────────────────────────────────────────────

async function fundServerVault(db: Awaited<ReturnType<typeof resetDemoDb>>, challenges: number) {
  for (let i = 0; i < challenges; i++) {
    const invoiceId = await createInvoice(db, {
      payerType: "brand",
      lines: [{ description: `Challenge ${i}`, amountCents: CHALLENGE_PRICE_CENTS }],
    });
    await markPaid(db, invoiceId);
  }
  return balanceOf(db, "server");
}

test("a pool may never exceed half the vault", async () => {
  const db = await resetDemoDb();
  const vault = await fundServerVault(db, 2);
  const week = new Date("2026-08-17T00:00:00Z");
  const max = maxAllocationCents(vault);

  eq(max, Math.floor(vault * POOL_MAX_FRACTION_OF_VAULT), "the ceiling is half the vault");

  const okAlloc = await allocateToPool(db, { weekStart: week, amountCents: max });
  eq(okAlloc.allocatedCents, max, "exactly half is allowed");

  const err = await throws(
    () => allocateToPool(db, { weekStart: week, amountCents: max + 1 }),
    /never exceed half/,
    "one cent over is refused",
  );
  ok(err instanceof PoolAllocationRefused, "with the error that names the rule");
  ok(
    /refunds, disputes and quiet weeks/.test(err.message),
    "and the refusal says what the held half is for",
  );
});

test("half, twice, is not a way around the half rule", async () => {
  const db = await resetDemoDb();
  const vault = await fundServerVault(db, 2);
  const week = new Date("2026-08-17T00:00:00Z");
  const max = maxAllocationCents(vault);

  await allocateToPool(db, { weekStart: week, amountCents: Math.floor(max / 2) });
  await throws(
    () => allocateToPool(db, { weekStart: week, amountCents: max + 100 }),
    /never exceed half/,
    "the ceiling applies to the total in the pool, not to each increment",
  );
  eq(await poolForWeek(db, week), Math.floor(max / 2), "and the pool is unchanged");
});

test("an allocation can be raised but never lowered", async () => {
  const db = await resetDemoDb();
  const vault = await fundServerVault(db, 4);
  const week = new Date("2026-08-17T00:00:00Z");

  await allocateToPool(db, { weekStart: week, amountCents: 5_000 });
  await allocateToPool(db, { weekStart: week, amountCents: 8_000 });
  eq(await poolForWeek(db, week), 8_000, "raising is fine");

  const err = await throws(
    () => allocateToPool(db, { weekStart: week, amountCents: 6_000 }),
    /raised but never lowered/,
    "lowering is refused — owners were shown the number",
  );
  ok(err instanceof PoolAllocationLowered, "with the error that says why");
  eq(await poolForWeek(db, week), 8_000, "and the pool did not move");
  void vault;
});

test("an allocation earmarks; it does not spend", async () => {
  const db = await resetDemoDb();
  const vault = await fundServerVault(db, 2);
  const week = new Date("2026-08-17T00:00:00Z");
  await allocateToPool(db, { weekStart: week, amountCents: maxAllocationCents(vault) });
  eq(
    await balanceOf(db, "server"),
    vault,
    "the vault is untouched until a payout is released — otherwise an " +
      "unreleased pool would shrink next week's ceiling for money nobody spent",
  );
});

// ── Payouts ─────────────────────────────────────────────────────────────────

test("payouts open as drafts and a total is its lines", async () => {
  const db = await resetDemoDb();
  await fundServerVault(db, 2);
  const week = new Date("2026-08-17T00:00:00Z");

  const payoutId = await draftPayout(db, {
    guildId: "guild-1",
    weekStart: week,
    lines: [
      { kind: "flat", description: "Flat participation share", amountCents: 219 },
      { kind: "scored", description: "Scored share", amountCents: 1_881 },
    ],
  });

  const [row] = await db
    .select()
    .from(schema.serverPayouts)
    .where(sqlEq(schema.serverPayouts.id, payoutId));
  eq(row.status, "draft", "nothing moves money on its own");
  eq(await payoutTotal(db, payoutId), 2_100, "and the total is the lines added up");
});

test("re-running the weekly close does not create a second payout", async () => {
  const db = await resetDemoDb();
  const week = new Date("2026-08-17T00:00:00Z");
  const lines = [{ kind: "flat" as const, description: "Flat", amountCents: 100 }];

  const a = await draftPayout(db, { guildId: "guild-1", weekStart: week, lines });
  const b = await draftPayout(db, { guildId: "guild-1", weekStart: week, lines });
  eq(a, b, "the same payout is updated, not duplicated");

  const all = await db.select().from(schema.serverPayouts);
  eq(all.length, 1, "one server, one week, one payout");
});

test("releasing requires a person, and moves the money once", async () => {
  const db = await resetDemoDb();
  const vault = await fundServerVault(db, 2);
  const week = new Date("2026-08-17T00:00:00Z");
  const payoutId = await draftPayout(db, {
    guildId: "guild-1",
    weekStart: week,
    lines: [{ kind: "flat", description: "Flat", amountCents: 2_100 }],
  });

  await throws(
    () => releasePayout(db, payoutId, ""),
    /requires a person/,
    "a job computes; a human releases",
  );
  eq(await balanceOf(db, "server"), vault, "and nothing moved");

  const released = await releasePayout(db, payoutId, "admin-1");
  eq(released.amountCents, 2_100, "the release moves the total");
  eq(await balanceOf(db, "server"), vault - 2_100, "out of vault 3");

  const err = await throws(
    () => releasePayout(db, payoutId, "admin-1"),
    /already released/,
    "and releasing twice would pay twice",
  );
  ok(err instanceof PayoutNotReleasable, "so it is refused by name");
});

test("a payout larger than the vault is refused", async () => {
  const db = await resetDemoDb();
  const week = new Date("2026-08-17T00:00:00Z");
  const payoutId = await draftPayout(db, {
    guildId: "guild-1",
    weekStart: week,
    lines: [{ kind: "flat", description: "Flat", amountCents: 100_000 }],
  });
  await throws(
    () => releasePayout(db, payoutId, "admin-1"),
    /cannot be released/,
    "money that is not there cannot be released",
  );
});

test("only a released payout can be marked paid", async () => {
  const db = await resetDemoDb();
  await fundServerVault(db, 2);
  const week = new Date("2026-08-17T00:00:00Z");
  const payoutId = await draftPayout(db, {
    guildId: "guild-1",
    weekStart: week,
    lines: [{ kind: "flat", description: "Flat", amountCents: 500 }],
  });

  await throws(
    () => markPayoutPaid(db, payoutId, "admin-1"),
    /released/,
    "a draft cannot be marked paid — it was never sent",
  );
  await releasePayout(db, payoutId, "admin-1");
  await markPayoutPaid(db, payoutId, "admin-1");

  const [row] = await db
    .select()
    .from(schema.serverPayouts)
    .where(sqlEq(schema.serverPayouts.id, payoutId));
  eq(row.status, "paid", "and the sequence is draft, released, paid");
});

// ── The worked example from the spec ────────────────────────────────────────

test("the four-week worked example in docs/02-MONEY.md comes out right", async () => {
  // §3 of the money document works four weeks of sales, allocating half the
  // vault each week. This recomputes it rather than retyping the answers.
  //
  // ===== A HALF-CENT WHERE THE DOCUMENT CONTRADICTS ITSELF =====
  //
  // Week 4's vault is $218.75, whose exact half is $109.375. The document's
  // table allocates **$109.38** and holds $109.37. That rounds the allocation
  // UP, which puts the pool half a cent *above* half the vault — and three
  // sections earlier the same document states the rule as an absolute:
  //
  //     "pool ≤ vault ÷ 2, always"
  //
  // with A1 in docs/07-DATA-MODEL.md making it a guard that refuses anything
  // above, with a reason. A guard cannot refuse $109.375 and also produce
  // $109.38.
  //
  // So the code floors, the rule holds at every step, and the month comes out
  // one cent the other way: $415.62 paid and $109.38 held rather than $415.63
  // and $109.37. The totals still reconcile exactly — the cent moved from the
  // paid column to the held column, and no money appeared or vanished.
  //
  // This is recorded rather than reconciled silently, and it has been raised.
  const db = await resetDemoDb();
  const weeks = [
    { sold: 2, week: new Date("2026-09-07T00:00:00Z") },
    { sold: 1, week: new Date("2026-09-14T00:00:00Z") },
    { sold: 2, week: new Date("2026-09-21T00:00:00Z") },
    { sold: 1, week: new Date("2026-09-28T00:00:00Z") },
  ];

  let paidOut = 0;
  const allocations: string[] = [];
  for (const w of weeks) {
    await fundServerVault(db, w.sold);
    const vaultBefore = await balanceOf(db, "server");
    const amount = maxAllocationCents(vaultBefore);

    // The rule, asserted at every single step rather than only at the end.
    ok(
      amount * 2 <= vaultBefore,
      `week of ${w.week.toISOString().slice(0, 10)}: the pool never exceeds half the vault`,
    );

    await allocateToPool(db, { weekStart: w.week, amountCents: amount });
    const payoutId = await draftPayout(db, {
      guildId: "guild-1",
      weekStart: w.week,
      lines: [{ kind: "flat", description: "Whole pool", amountCents: amount }],
    });
    await releasePayout(db, payoutId, "admin-1");
    paidOut += amount;
    allocations.push(formatMoney(amount));
  }

  eq(
    allocations,
    ["$87.50", "$87.50", "$131.25", "$109.37"],
    "the first three weeks match the document exactly; week 4 floors $109.375",
  );

  const held = await balanceOf(db, "server");
  eq(formatMoney(paidOut), "$415.62", "owners received $415.62 across the month");
  eq(formatMoney(held), "$109.38", "and $109.38 remains held for a quiet week or a refund");

  const serverShare = (CHALLENGE_PRICE_CENTS * 6 * DEFAULT_SPLIT_BPS.server) / BPS;
  eq(
    paidOut + held,
    serverShare,
    "paid plus held is exactly the server share of six challenges — the cent " +
      "moved between columns, it did not appear or vanish",
  );
});
