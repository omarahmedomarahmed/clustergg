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
  priceOf, cpWallet, buyTrophy, marketplaceCatalog, marketplaceWallet, marketplaceOrders,
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
const grantCp = async (userId: string, qp: number) => {
  const [q] = await db.select({ id: schema.quests.id }).from(schema.quests).limit(1);
  await db.insert(schema.userQuestProgress).values({ userId, questId: q.id, qp })
    .onConflictDoUpdate({
      target: [schema.userQuestProgress.userId, schema.userQuestProgress.questId],
      set: { qp },
    });
};

try {
  console.log("\n== The price is a model, not a guess ==");
  ok("a $5 bronze costs thousands, not hundreds",
    priceOf({ value: 5, tier: "bronze" }) === 5000, String(priceOf({ value: 5, tier: "bronze" })));
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
    priceOf({ value: 5, tier: "bronze", cpPrice: 0 }) === 5000);

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
  ok("the balance never went negative", (await cpWallet(db, nova.id)).balance >= 0);

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

  console.log("\n== Gifting ==");
  const giver = await mkUser("Giver");
  const friend = await mkUser("Friend");
  await grantCp(giver.id, 200000);
  const gift = await buyTrophy(giver.id, priced.id, { recipientSlug: friend.slug, message: "gg" });
  ok("a gift succeeds", gift.ok, gift.ok ? "" : gift.error);
  ok("and names who it went to", gift.ok && gift.gifted === "Friend", gift.ok ? String(gift.gifted) : "");
  const friendAward = await db.select().from(schema.userTrophies)
    .where(eq(schema.userTrophies.userId, friend.id));
  ok("the trophy lands on THEIR profile", friendAward.length === 1);
  ok("the giver paid, not the friend",
    (await cpWallet(db, friend.id)).spent === 0 && (await cpWallet(db, giver.id)).spent > 0);
  const notif = await db.select().from(schema.notifications)
    .where(eq(schema.notifications.userId, friend.id));
  ok("the friend is told, and by whom", notif.some((n) => /sent you a trophy/i.test(n.title)),
    notif.map((n) => n.title).join(" | "));

  const bad = await buyTrophy(giver.id, priced.id, { recipientSlug: "nobody-with-this-name" });
  ok("gifting to a name that doesn't exist is refused", !bad.ok);
  ok("with a message that says to check the spelling",
    !bad.ok && /spelling|profile/i.test(bad.error), bad.ok ? "" : bad.error);

  console.log("\n== The marketplace wallet ==");
  const mw = await marketplaceWallet(db);
  ok("it counts the CP taken in", mw.cpTaken > 0, String(mw.cpTaken));
  ok("and the orders", mw.orders >= 2, String(mw.orders));
  ok("and the gifts separately", mw.gifts >= 1, String(mw.gifts));
  ok("and the buyers", mw.buyers >= 2, String(mw.buyers));
  // The number nobody thinks to compute: every trophy sold is redeemable.
  ok("and what we OWE if every trophy is cashed out",
    mw.liability >= 0 && typeof mw.liability === "number", String(mw.liability));

  const ledger = await marketplaceOrders(db);
  ok("every transaction is in the ledger", ledger.length >= 2, String(ledger.length));
  ok("a gift shows both the buyer and the recipient",
    ledger.some((o) => o.kind === "gift" && o.buyerName === "Giver" && o.recipientName === "Friend"),
    ledger.map((o) => `${o.buyerName}→${o.recipientName}`).join(", "));
  ok("a self-purchase shows the buyer as the recipient",
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
