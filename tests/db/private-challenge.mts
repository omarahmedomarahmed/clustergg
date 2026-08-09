/**
 * B90.4 — a server owner buying a competition for their own members.
 *
 * The shape that matters is legal, not technical: an owner pays the prize pool
 * PLUS a margin, and we then owe the prize as our own obligation. Taking money
 * from person A and handing it to person B is money transmission — the thing
 * deleting gifting closed. Selling a product that pays out prizes is
 * advertising. So the fee is not decoration, and the test asserts it.
 *
 * The other assertion with teeth: the charge and the challenge land together,
 * or neither does. An owner whose balance went down and whose challenge does
 * not exist is a support ticket about money.
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
const {
  quotePrivate, buyPrivateChallenge, PRIVATE_FEE_PCT, MIN_PRIZE_POOL, MAX_PRIZE_POOL,
} = await import("../../lib/private-challenge.ts");
const { walletFor } = await import("../../lib/server-wallet.ts");
const { WEEK_CLOSE_ACTOR } = await import("../../lib/week-close.ts");
const { billFor, kindOf } = await import("../../lib/challenge-billing.ts");
const { eq: dEq } = await import("drizzle-orm");

const db = await getDb();
const tag = uid().slice(0, 6);
const guildId = `priv-${tag}`;
const [space] = await db.select({ id: schema.spaces.id }).from(schema.spaces).limit(1);

await db.insert(schema.discordGuilds).values({
  guildId, name: `Private Test ${tag}`, memberCount: 300,
}).onConflictDoNothing();

/** Put money in the wallet the way the weekly close does. */
const fund = async (amount: number) => {
  const id = uid();
  await db.insert(schema.serverPayouts).values({
    id, guildId, guildName: `Private Test ${tag}`, status: "draft",
    requestedBy: WEEK_CLOSE_ACTOR, periodStart: new Date(),
  } as never);
  await db.insert(schema.serverPayoutLines).values({
    id: uid(), payoutId: id, label: "Server pool", amount, kind: "pool",
  } as never);
};

const window = { startAt: new Date(Date.now() + 3 * 86400_000), endAt: new Date(Date.now() + 10 * 86400_000) };

console.log("== the quote is the prize plus our margin ==");
{
  const q = quotePrivate(200);
  eq("the pool is what they asked for", q.prizePool, 200);
  eq(`the fee is ${PRIVATE_FEE_PCT}%`, q.fee, 10);
  eq("…and the total is both", q.total, 210);
  // Zero is allowed as a discount — an ordinary invoice adjustment — but it has
  // to be asked for, not the default.
  eq("a zeroed fee is possible", quotePrivate(200, 0).fee, 0);
  eq("…and is not what happens by default", quotePrivate(200).fee > 0, true);
}

console.log("\n== you cannot buy what you cannot afford ==");
{
  const res = await buyPrivateChallenge(db, {
    guildId, title: `Too big ${tag}`, game: "Chess.com", provider: "chesscom",
    prizePool: 100, spaceId: space?.id, ...window,
  });
  ok("an empty wallet is refused", !res.ok);
  ok("…and the refusal names both numbers",
    !res.ok && /\$105/.test(res.error) && /\$0/.test(res.error), !res.ok ? res.error : "");
}

console.log("\n== buying one ==");
{
  await fund(500);
  const before = await walletFor(db, guildId);
  const res = await buyPrivateChallenge(db, {
    guildId, guildName: `Private Test ${tag}`, title: `Chess night ${tag}`,
    game: "Chess.com", provider: "chesscom", prizePool: 200, spaceId: space?.id, ...window,
  });
  ok("it went through", res.ok, JSON.stringify(res));
  if (!res.ok) throw new Error("nothing to check");

  eq("the total charged is prize + fee", res.charged, 210);
  const after = await walletFor(db, guildId);
  eq("…and the balance went down by exactly that",
    Math.round((before.available - after.available) * 100) / 100, 210);

  const [c] = await db.select().from(schema.challenges).where(dEq(schema.challenges.id, res.challengeId));
  ok("the challenge exists", !!c);
  eq("…as a DRAFT, because we still have to set the metric and the rules", c.status, "draft");
  eq("…private", c.visibility, "private");
  eq("…to their server only", c.guildIds, [guildId]);
  ok("…with an entry key for their members", !!c.accessKey);
  // Never announced by buying. It reaches the server after a human finishes it.
  eq("…and nobody has been told", c.announcedAt, null);

  // The kind and the bill, on the admin screen.
  eq("it reads as a private challenge", kindOf(c), "private");
  const bill = await billFor(db, c);
  ok("…and it is paid", bill.paid, JSON.stringify(bill));
  eq("…for what they actually paid, fee included", bill.amount, 210);
  eq("…with no warning, because nothing is wrong", bill.warning, "");
}

console.log("\n== what it does NOT do ==");
{
  // A private challenge is not brand inventory. Its entrants must never earn a
  // share of the weekly pool — that money came from brands buying PUBLIC
  // challenges, and paying an owner from it for an event they bought
  // themselves pays them twice.
  const { readFileSync } = await import("node:fs");
  const close = readFileSync("lib/week-close.ts", "utf8");
  ok("the weekly close counts public challenges only",
    /eq\(schema\.challenges\.visibility, "public"\)/.test(close));
}

console.log("\n== the bounds ==");
{
  await fund(9000);
  for (const [label, pool, needle] of [
    ["a trivial pool", MIN_PRIZE_POOL - 1, "smallest"],
    ["an absurd pool", MAX_PRIZE_POOL + 1, "largest"],
  ] as const) {
    const r = await buyPrivateChallenge(db, {
      guildId, title: `Bounds ${tag}`, game: "Chess.com", provider: "chesscom",
      prizePool: pool, spaceId: space?.id, ...window,
    });
    ok(`${label} is refused`, !r.ok);
    ok(`…and says why`, !r.ok && r.error.toLowerCase().includes(needle), !r.ok ? r.error : "");
  }

  const noName = await buyPrivateChallenge(db, {
    guildId, title: "  ", game: "Chess.com", provider: "chesscom",
    prizePool: 100, spaceId: space?.id, ...window,
  });
  ok("an unnamed challenge is refused", !noName.ok);

  const backwards = await buyPrivateChallenge(db, {
    guildId, title: `Backwards ${tag}`, game: "Chess.com", provider: "chesscom",
    prizePool: 100, spaceId: space?.id,
    startAt: window.endAt, endAt: window.startAt,
  });
  ok("…and so is one that ends before it starts", !backwards.ok);

  // None of those refusals may have taken money.
  const w = await walletFor(db, guildId);
  const charges = await db.select({ n: schema.serverCharges.amount })
    .from(schema.serverCharges).where(dEq(schema.serverCharges.guildId, guildId));
  eq("exactly one charge exists — the one that worked", charges.length, 1);
  ok("…and what left the wallet is the prize AND the fee", w.spent === 210, String(w.spent));
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
