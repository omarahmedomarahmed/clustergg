/**
 * The trophy economy, end to end, against a real database.
 *
 * The two rules the whole design hangs on, asserted rather than assumed:
 *
 *   1. Spending never costs a level. Quest progress is what levels read, and
 *      buying must not touch it. If this ever regresses, gamers get demoted for
 *      shopping — the single worst thing this feature could do.
 *   2. CP is free, so the price has to hold. A balance is EARNED minus SPENT,
 *      re-read on the server at purchase time; a stale page must not be able to
 *      buy anything.
 */
process.env.DEMO_DB = "1";

let pass = 0, fail = 0;
const ok = (name: string, cond: boolean, extra = "") => {
  if (cond) { pass++; console.log(`  ✓ ${name}`); }
  else { fail++; console.log(`  ✗ ${name}${extra ? ` — ${extra}` : ""}`); }
};

const { getDb, schema } = await import("../../lib/db/index.ts");
const { and, eq } = await import("drizzle-orm");
const { uid } = await import("../../lib/utils.ts");
const {
  priceOf, cpWallet, cpSpent, buyTrophy, marketplaceCatalog, marketplaceWallet, marketplaceOrders,
  DEFAULT_CP_PER_DOLLAR, TIER_MULTIPLIER,
} = await import("../../lib/marketplace.ts");
const { getTotalCp } = await import("../../lib/quests.ts");

const db = await getDb();

const mkUser = async (name: string) => {
  const id = uid();
  await db.insert(schema.users).values({
    id, displayName: name, slug: `${name.toLowerCase()}-${id.slice(0, 5)}`, role: "user",
  });
  return { id, slug: `${name.toLowerCase()}-${id.slice(0, 5)}` };
};

/** Give a gamer CP the way the platform does: quest progress. */
/**
 * Put CP in a gamer's wallet.
 *
 * **Writes to the EVENT LEDGER, not to quest progress.** This helper used to
 * set `userQuestProgress.qp`, which was the source of truth when it was
 * written. B34.2 split the two: CP is credited once per action and recorded on
 * `quest_events`, while progress is credited to every listening quest — so
 * `getTotalCp` now sums `COALESCE(cp_awarded, qp_awarded)` from events and no
 * longer reads progress at all.
 *
 * The helper was therefore writing to the side that stopped being read, the
 * wallet returned zero, and sixteen purchase assertions failed behind one
 * broken fixture. Fixed HERE rather than by relaxing the assertions: they were
 * right, and a fixture that lies is worse than a test that fails.
 */
const grantCp = async (userId: string, cp: number) => {
  const [q] = await db.select({ id: schema.quests.id }).from(schema.quests).limit(1);
  await db.insert(schema.questEvents).values({
    id: `grant-${userId}-${cp}-${Math.random().toString(36).slice(2, 10)}`,
    userId, questId: q.id, actionKey: "win_challenge",
    qpAwarded: 0,          // progress is not what this fixture is about
    cpAwarded: cp,         // the wallet reads this
    refType: "test-grant", refId: `${cp}`,
  } as never);
};

try {
  console.log("\n== The price is a model, not a guess ==");
  // Derived, not hardcoded. This read `=== 5000` when the rate was 1,000 CP to
  // the dollar; B34 repriced it to 10,000 and the same trophy is 50,000. An
  // assertion that restates a number the calculator can move is one that fails
  // the first time somebody moves it, for no reason anybody cares about.
  ok("a $5 bronze costs thousands, not hundreds",
    priceOf({ value: 5, tier: "bronze" }) === 5 * DEFAULT_CP_PER_DOLLAR,
    String(priceOf({ value: 5, tier: "bronze" })));
  ok("rarity costs more at the same cash value",
    priceOf({ value: 5, tier: "legendary" }) > priceOf({ value: 5, tier: "bronze" }),
    `${priceOf({ value: 5, tier: "legendary" })} vs ${priceOf({ value: 5, tier: "bronze" })}`);
  ok("the tier multiplier is what does it",
    priceOf({ value: 10, tier: "gold" }) === 10 * DEFAULT_CP_PER_DOLLAR * TIER_MULTIPLIER.gold,
    String(priceOf({ value: 10, tier: "gold" })));
  ok("prices land on clean hundreds",
    priceOf({ value: 3.33, tier: "silver" }) % 100 === 0, String(priceOf({ value: 3.33, tier: "silver" })));
  ok("a trophy with no cash value still costs something",
    priceOf({ value: 0, tier: "bronze" }) >= 500, String(priceOf({ value: 0, tier: "bronze" })));
  ok("an admin price overrides the model",
    priceOf({ value: 100, tier: "legendary", cpPrice: 750 }) === 750);
  ok("a zero override does NOT override — it means 'let the model price it'",
    priceOf({ value: 5, tier: "bronze", cpPrice: 0 }) === 5 * DEFAULT_CP_PER_DOLLAR);

  console.log("\n== The shelf ==");
  const [trophy] = await db.select().from(schema.trophies).limit(1);
  ok("there are trophies to sell", !!trophy, "the seed has none");
  const nova = await mkUser("Buyer");
  const cat = await marketplaceCatalog(db, { userId: nova.id });
  ok("the catalogue lists them with prices", cat.trophies.length > 0 && cat.trophies.every((t) => t.cpPrice > 0));
  ok("a broke gamer can afford nothing", cat.trophies.every((t) => !t.affordable));
  ok("the rate is published", cat.rate === DEFAULT_CP_PER_DOLLAR, String(cat.rate));

  // Hidden trophies stay off the shelf but keep working as challenge prizes.
  await db.update(schema.trophies).set({ inMarketplace: false }).where(eq(schema.trophies.id, trophy.id));
  const hidden = await marketplaceCatalog(db, { userId: nova.id });
  ok("staff can hide a trophy from the shelf",
    !hidden.trophies.some((t) => t.id === trophy.id), "hidden trophy still listed");
  ok("but admin still sees it",
    (await marketplaceCatalog(db, { includeHidden: true })).trophies.some((t) => t.id === trophy.id));
  await db.update(schema.trophies).set({ inMarketplace: true }).where(eq(schema.trophies.id, trophy.id));

  console.log("\n== You cannot buy what you cannot afford ==");
  const priced = (await marketplaceCatalog(db, { userId: nova.id })).trophies[0];
  const broke = await buyTrophy(nova.id, priced.id);
  ok("a broke gamer is refused", !broke.ok);
  ok("and told what it costs and what they have",
    !broke.ok && /\d/.test(broke.error) && /CP/.test(broke.error), broke.ok ? "" : broke.error);
  ok("nothing was written", (await db.select().from(schema.marketplaceOrders)
    .where(eq(schema.marketplaceOrders.buyerId, nova.id))).length === 0);

  console.log("\n== Buying, and what it does NOT cost ==");
  // Exactly the price, so the second attempt below is genuinely unaffordable
  // rather than accidentally affordable — which is what a sloppy grant here
  // would make it, quietly turning the next assertion into a no-op.
  await grantCp(nova.id, priced.cpPrice);
  const earnedBefore = await getTotalCp(db, nova.id);
  const bought = await buyTrophy(nova.id, priced.id);
  ok("the purchase goes through", bought.ok, bought.ok ? "" : bought.error);
  ok("it names what they got", bought.ok && bought.trophy === priced.name);

  const earnedAfter = await getTotalCp(db, nova.id);
  // THE rule. Levels read earned CP; if buying moved it, shopping demotes you.
  ok("EARNED CP is untouched — buying never costs a level",
    earnedAfter === earnedBefore, `${earnedBefore} → ${earnedAfter}`);
  const w = await cpWallet(db, nova.id);
  ok("the balance went down by exactly the price",
    w.balance === earnedBefore - priced.cpPrice, `${w.balance} vs ${earnedBefore - priced.cpPrice}`);
  ok("and spent is recorded", w.spent === priced.cpPrice, String(w.spent));

  const [award] = await db.select().from(schema.userTrophies)
    .where(and(eq(schema.userTrophies.userId, nova.id), eq(schema.userTrophies.trophyId, priced.id))).limit(1);
  ok("the trophy is on their profile", !!award);
  ok("held, so it can be redeemed for cash like a won one", award?.status === "held", award?.status);
  ok("and marked as bought rather than won", award?.challengeId === null, String(award?.challengeId));

  console.log("\n== A stale page cannot overspend ==");
  const left = (await cpWallet(db, nova.id)).balance;
  ok("their balance is spent", left < priced.cpPrice, `${left} vs ${priced.cpPrice}`);
  const again = await buyTrophy(nova.id, priced.id);
  ok("a second purchase is refused on the SERVER, not by the page", !again.ok);
  // NOT `balance >= 0`. That was the assertion the due-diligence report called
  // vacuous and it was right: `cpWallet` returns `Math.max(0, earned - spent)`
  // (`lib/marketplace.ts:141`), so the number it hands back cannot be negative
  // whatever the ledger says. It asserted the clamp, not the money.
  //
  // The real invariant is on the UNCLAMPED difference: CP spent must never
  // exceed CP earned. Overspending is visible there and nowhere else.
  {
    const earned = await getTotalCp(db, nova.id);
    const spent = await cpSpent(db, nova.id);
    ok("no CP was spent that was never earned", spent <= earned, `spent ${spent} of ${earned}`);
  }

  // Two of the same trophy is legitimate — they are worth cash, and a gamer
  // saving up for two is not a bug. Worth proving, because `user_trophies` has
  // a unique index over (user, trophy, challenge) and a conflict here would
  // take the CP and hand back nothing.
  await grantCp(nova.id, priced.cpPrice * 4);
  const second = await buyTrophy(nova.id, priced.id);
  ok("buying the same trophy twice works", second.ok, second.ok ? "" : second.error);
  const owned = await db.select().from(schema.userTrophies)
    .where(and(eq(schema.userTrophies.userId, nova.id), eq(schema.userTrophies.trophyId, priced.id)));
  ok("and they hold two of them — the CP bought something both times",
    owned.length === 2, `${owned.length} awards`);

  console.log("\n== Gifting is DELETED ==");
  // This block used to prove a gift worked end to end: the recipient named, the
  // trophy on THEIR profile, the giver paying, the friend notified, and a
  // misspelt handle refused. Gifting is gone (B72.3) — a trophy redeems for
  // cash, so handing one over moved real value between two accounts.
  //
  // Inverted rather than deleted. `tests/db/gifting.mts` is the full proof; what
  // stays here is the one thing THIS file is about: a purchase reaches exactly
  // one profile, and it is the buyer's.
  const giver = await mkUser("Giver");
  const friend = await mkUser("Friend");
  await grantCp(giver.id, priced.cpPrice);
  const bought2 = await buyTrophy(giver.id, priced.id);
  ok("a purchase succeeds", bought2.ok, bought2.ok ? "" : bought2.error);
  const friendAward = await db.select().from(schema.userTrophies)
    .where(eq(schema.userTrophies.userId, friend.id));
  ok("nothing reaches anybody else's profile", friendAward.length === 0);
  ok("the buyer paid, and only the buyer",
    (await cpWallet(db, friend.id)).spent === 0 && (await cpWallet(db, giver.id)).spent > 0);
  const notif = await db.select().from(schema.notifications)
    .where(eq(schema.notifications.userId, friend.id));
  ok("no gift notification is written to anybody", !notif.some((n) => /sent you a trophy/i.test(n.title)),
    notif.map((n) => n.title).join(" | "));

  console.log("\n== The marketplace wallet ==");
  const mw = await marketplaceWallet(db);
  ok("it counts the CP taken in", mw.cpTaken > 0, String(mw.cpTaken));
  ok("and the orders", mw.orders >= 2, String(mw.orders));
  // Historical only now — the number can never rise again, so it is asserted as
  // a number rather than as a number that grows.
  ok("gifts are still counted, for the orders that predate the deletion", typeof mw.gifts === "number");
  ok("and the buyers", mw.buyers >= 2, String(mw.buyers));
  // The number nobody thinks to compute: every trophy sold is redeemable.
  ok("and what we OWE if every trophy is cashed out",
    mw.liability >= 0 && typeof mw.liability === "number", String(mw.liability));

  const ledger = await marketplaceOrders(db);
  ok("every transaction is in the ledger", ledger.length >= 2, String(ledger.length));
  ok("no new order is a gift",
    ledger.every((o) => o.kind === "self"),
    ledger.map((o) => `${o.buyerName}→${o.recipientName} (${o.kind})`).join(", "));
  ok("a purchase shows the buyer as the recipient",
    ledger.some((o) => o.kind === "self" && o.buyerName === o.recipientName));

  console.log("\n== A hidden trophy can't be bought, even by id ==");
  await db.update(schema.trophies).set({ inMarketplace: false }).where(eq(schema.trophies.id, priced.id));
  const sneaky = await buyTrophy(giver.id, priced.id);
  ok("naming a hidden trophy directly is refused", !sneaky.ok, sneaky.ok ? "it went through" : "");
  await db.update(schema.trophies).set({ inMarketplace: true }).where(eq(schema.trophies.id, priced.id));
} catch (e) {
  fail++;
  console.log("  ✗ threw:", (e as Error).message);
  console.log((e as Error).stack?.split("\n").slice(1, 4).join("\n"));
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
