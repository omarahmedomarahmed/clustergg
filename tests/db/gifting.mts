// B5/B49 — resolving the person, and who is allowed to be found.
//
// The browser half is `tests/ui/checkout.mjs`. This is the half a browser
// cannot see: which accounts the type-ahead is willing to name, what fields
// leave the server, and the property the whole gift flow rests on — that a
// second tab cannot spend the same points twice.
//
//   DEMO_DB=1 npx tsx tests/db/gifting.mts

process.env.DEMO_DB = "1";

let pass = 0;
const fails: string[] = [];
const ok = (name: string, cond: boolean, detail = "") => {
  if (cond) { pass++; console.log(`  ok   ${name}`); }
  else { fails.push(name); console.log(`  FAIL ${name}${detail ? ` — ${detail}` : ""}`); }
};
const eq = (name: string, got: unknown, want: unknown) =>
  ok(name, JSON.stringify(got) === JSON.stringify(want), `got ${JSON.stringify(got)}, want ${JSON.stringify(want)}`);

const { giftSearch, giftRecipient, MIN_QUERY, MAX_RESULTS } = await import("../../lib/gift-search.ts");
const { buyTrophy, cpPerDollar, priceOf } = await import("../../lib/marketplace.ts");
const { getDb, schema } = await import("../../lib/db/index.ts");
const { eq: sqlEq } = await import("drizzle-orm");
const { uid } = await import("../../lib/utils.ts");

const db = await getDb();
const rate = await cpPerDollar(db);

const tag = uid().slice(0, 6);
const mkUser = async (name: string, extra: Record<string, unknown> = {}) => {
  const id = uid();
  const slug = `gift-${name}-${tag}`;
  await db.insert(schema.users).values({
    id, slug, displayName: name, email: `${id}@test.invalid`, passwordHash: "x", ...extra,
  } as never);
  return { id, slug, name };
};
const grant = async (userId: string, cp: number) => {
  const [q] = await db.select({ id: schema.quests.id }).from(schema.quests).limit(1);
  await db.insert(schema.questEvents).values({
    id: uid(), userId, questId: q.id, actionKey: "win_challenge",
    qpAwarded: 0, cpAwarded: cp, refType: "gift-seed", refId: uid(),
    // Backdated: B34's 500 CP/day ceiling counts anything stamped today, and a
    // fixture that funds a wallet today eats the whole day's room.
    createdAt: new Date(Date.now() - 2 * 86400_000),
  } as never);
};

const zephyrine = await mkUser(`Zephyrine${tag}`);
const zeph2 = await mkUser(`Zephyrina${tag}`, { discordUsername: `zephyr_disc_${tag}` });
const hidden = await mkUser(`Zephyrhidden${tag}`, { profileVisibility: "private" });
const followersOnly = await mkUser(`Zephyrfoll${tag}`, { profileVisibility: "followers" });
const banned = await mkUser(`Zephyrbanned${tag}`, { status: "banned" });

console.log("== a query too short means nothing ==");
for (const q of ["", "z", " z "]) {
  eq(`"${q}" returns nothing`, (await giftSearch(q)).length, 0);
}
ok(`the floor is ${MIN_QUERY} characters`, MIN_QUERY === 2);

console.log("\n== it finds people by the things a human types ==");
const byName = await giftSearch(`Zephyrine${tag}`);
ok("by display name", byName.some((g) => g.slug === zephyrine.slug), JSON.stringify(byName.map((g) => g.slug)));
const bySlug = await giftSearch(zeph2.slug);
ok("by @profile", bySlug.some((g) => g.slug === zeph2.slug));
const byDiscord = await giftSearch(`zephyr_disc_${tag}`);
ok("by Discord handle", byDiscord.some((g) => g.slug === zeph2.slug), JSON.stringify(byDiscord.map((g) => g.slug)));
const atPrefixed = await giftSearch(`@${zeph2.slug}`);
ok("a leading @ is not a typo", atPrefixed.some((g) => g.slug === zeph2.slug));

console.log("\n== who is NOT in the directory ==");
const all = await giftSearch(`Zephyr${tag}`, { limit: MAX_RESULTS });
const slugs = all.map((g) => g.slug);
ok("a private profile is not enumerable", !slugs.includes(hidden.slug), JSON.stringify(slugs));
ok("nor a followers-only one", !slugs.includes(followersOnly.slug), JSON.stringify(slugs));
ok("nor a banned account", !slugs.includes(banned.slug), JSON.stringify(slugs));
const self = await giftSearch(`Zephyrine${tag}`, { excludeUserId: zephyrine.id });
ok("and you never find yourself", !self.some((g) => g.slug === zephyrine.slug));

console.log("\n== …but a private profile can still be gifted by someone who has the link ==");
// Deliberate, and the reason it is safe: an exact @profile is the thing you
// only have if they gave it to you. Opting out of a search box is not opting
// out of presents.
const direct = await giftRecipient(hidden.slug);
eq("an exact slug resolves them", direct?.slug, hidden.slug);
eq("…with a leading @ too", (await giftRecipient(`@${hidden.slug}`))?.slug, hidden.slug);
eq("a banned account never resolves", await giftRecipient(banned.slug), null);
eq("nor a slug that does not exist", await giftRecipient(`nobody-${tag}`), null);

console.log("\n== only public fields ever leave ==");
// docs/PAYMENTS.md and the standing rule: /admin/users is the gamer directory,
// and this is not it. Nothing here is anything a profile page does not already
// show a signed-out visitor.
const blob = JSON.stringify(all);
for (const bad of ["email", "passwordHash", "password_hash", "userId", '"id"', "payoutMethod", "country"]) {
  ok(`no "${bad}" in a result`, !blob.includes(bad), blob.slice(0, 200));
}
ok("every result carries a name, a slug and a reason it matched",
  all.every((g) => !!g.displayName && !!g.slug && !!g.matchedOn));

console.log("\n== never more than a screenful ==");
ok(`capped at ${MAX_RESULTS}`, all.length <= MAX_RESULTS, String(all.length));
ok("…and a caller cannot ask for more",
  (await giftSearch(`Zephyr${tag}`, { limit: 500 })).length <= MAX_RESULTS);

console.log("\n== an exact prefix outranks a substring ==");
// Typing somebody's actual name should not put them third.
const ranked = await giftSearch(`Zephyrine${tag}`.slice(0, 9));
ok("the prefix match comes first",
  ranked.length === 0 || ranked[0].displayName.toLowerCase().startsWith("zephyri"),
  JSON.stringify(ranked.map((g) => g.displayName)));

console.log("\n== the balance is checked at CONFIRM, not at open ==");
// The two-tab problem: open the shelf twice, buy in one, then confirm in the
// other. `buyTrophy` re-reads the wallet rather than trusting the page, so the
// second confirm fails instead of overdrawing.
const [trophy] = await db.select().from(schema.trophies).limit(1);
const price = priceOf(trophy, rate);
const buyer = await mkUser(`Buyer${tag}`);
await grant(buyer.id, price + Math.floor(price / 2));   // enough for ONE
const first = await buyTrophy(buyer.id, trophy.id, { recipientSlug: zephyrine.slug });
ok("the first purchase goes through", first.ok, JSON.stringify(first));
const second = await buyTrophy(buyer.id, trophy.id, { recipientSlug: zephyrine.slug });
eq("the second is refused, not overdrawn", second.ok, false);
ok("…and it says what they have", /have/.test(second.ok ? "" : second.error ?? ""), JSON.stringify(second));

console.log("\n== a gift lands once, on the right person ==");
const orders = await db.select().from(schema.marketplaceOrders)
  .where(sqlEq(schema.marketplaceOrders.buyerId, buyer.id));
eq("one order", orders.length, 1);
eq("…recorded as a gift", orders[0].kind, "gift");
eq("…charged to the giver", orders[0].buyerId, buyer.id);
eq("…and awarded to the recipient", orders[0].recipientId, zephyrine.id);
const landed = await db.select().from(schema.userTrophies)
  .where(sqlEq(schema.userTrophies.userId, zephyrine.id));
eq("one trophy on their profile", landed.length, 1);
eq("…held, so it is redeemable exactly like a won one", landed[0].status, "held");
eq("…and not attached to a challenge, which is what marks it bought", landed[0].challengeId, null);
const notMine = await db.select().from(schema.userTrophies)
  .where(sqlEq(schema.userTrophies.userId, buyer.id));
eq("the giver keeps nothing", notMine.length, 0);

console.log("\n== gifting a banned or missing account is refused before points move ==");
const rich = await mkUser(`Rich${tag}`);
await grant(rich.id, price * 3);
const toBanned = await buyTrophy(rich.id, trophy.id, { recipientSlug: banned.slug });
eq("a banned recipient is refused", toBanned.ok, false);
const toGhost = await buyTrophy(rich.id, trophy.id, { recipientSlug: `nobody-${tag}` });
eq("an unknown recipient is refused", toGhost.ok, false);
eq("…and nothing was charged",
  (await db.select().from(schema.marketplaceOrders)
    .where(sqlEq(schema.marketplaceOrders.buyerId, rich.id))).length, 0);

console.log(`\n${pass} passed, ${fails.length} failed`);
if (fails.length) { fails.forEach((f) => console.log(`  - ${f}`)); process.exit(1); }
process.exit(0);
