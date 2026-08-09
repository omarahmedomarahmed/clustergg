/**
 * B91.9 — which of a brand's trophies goes out.
 *
 * A brand can have three different $100 designs — a launch, a colourway, a
 * partner tie-in — and which one a week uses was decided by whoever built the
 * challenge and discovered by the brand when they saw the podium.
 *
 * The assertion that matters is the one about ANOTHER BRAND'S TROPHY. A trophy
 * carries a logo and the winner keeps it on their profile permanently, so one
 * brand putting another's logo on a podium is a mistake that ends two
 * relationships at once.
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
const { trophiesForBrand, ownTrophies, byValue, sanitisePrizeRequest } = await import("../../lib/brand-trophies.ts");

const db = await getDb();
const tag = uid().slice(0, 6);

const mkBrand = async (name: string) => {
  const id = uid();
  await db.insert(schema.brands).values({
    id, name: `${name} ${tag}`, slug: `${name.toLowerCase()}-${tag.toLowerCase()}`, status: "active",
  });
  return id;
};
const mkTrophy = async (brandId: string | null, name: string, value: number, tier = "gold") => {
  const id = uid();
  await db.insert(schema.trophies).values({
    id, name: `${name} ${tag}`, imageUrl: "/x.png", value: String(value),
    tier, brandId, inMarketplace: false,
  } as never);
  return id;
};

const ours = await mkBrand("Ours");
const theirs = await mkBrand("Theirs");

const gold1 = await mkTrophy(ours, "Launch Cup", 100);
const gold2 = await mkTrophy(ours, "Summer Cup", 100);
const silver = await mkTrophy(ours, "Runner Up", 50, "silver");
const rival = await mkTrophy(theirs, "Rival Cup", 100);
const catalogue = await mkTrophy(null, "House Cup", 25, "bronze");

console.log("== what a brand may put on a podium ==");
{
  const list = await trophiesForBrand(db, ours);
  const ids = new Set(list.map((t) => t.id));
  ok("its own", ids.has(gold1) && ids.has(gold2) && ids.has(silver));
  ok("…and the general catalogue", ids.has(catalogue));
  // The one that matters.
  ok("…and never another brand's", !ids.has(rival), JSON.stringify([...ids]));

  const own = await ownTrophies(db, ours);
  ok("\"your trophies\" means only the ones carrying their logo",
    own.every((t) => t.brandId === ours) && own.length === 3, JSON.stringify(own.map((t) => t.name)));
}

console.log("\n== grouped the way a brand thinks about them ==");
{
  // By VALUE, not by tier. "Gold" is our word and one of four; a brand with
  // three $100 designs is looking for the $100 row.
  const groups = byValue(await ownTrophies(db, ours));
  eq("highest value first", groups.map((g) => g.value), [100, 50]);
  eq("…with both $100 designs in one row", groups[0].trophies.length, 2);
}

console.log("\n== a request is sanitised, not trusted ==");
{
  const clean = await sanitisePrizeRequest(db, ours, [[gold1], [silver], [catalogue]]);
  eq("their own choices survive", clean, [[gold1], [silver], [catalogue]]);

  // A tampered form or a stale page is the only way this happens, and failing
  // the whole purchase over it would punish the wrong person. What matters is
  // that it never reaches a podium.
  const tampered = await sanitisePrizeRequest(db, ours, [[rival], [gold1]]);
  eq("another brand's trophy is dropped, and the rest kept", tampered, [[], [gold1]]);

  eq("nonsense is nothing", await sanitisePrizeRequest(db, ours, "not an array"), []);
  eq("unknown ids are dropped", await sanitisePrizeRequest(db, ours, [["nope"]]), []);
  // Trailing empties trimmed — an empty third place is not a third place.
  eq("trailing blanks are not places", await sanitisePrizeRequest(db, ours, [[gold1], [], []]), [[gold1]]);
}

console.log("\n== the campaign carries it ==");
{
  const { buyCampaign } = await import("../../lib/sponsored-campaigns.ts");
  const [game] = await db.select({ name: schema.games.name }).from(schema.games)
    .where((await import("drizzle-orm")).eq(schema.games.isActive, true)).limit(1);

  const res = await buyCampaign({
    brandId: ours, game: game.name, slots: 2,
    // A rival's trophy in the middle, the way a tampered form would send it.
    prizes: [[gold2], [rival], [silver]],
  });
  ok("the campaign was bought", res.ok, JSON.stringify(res));
  if (res.ok) {
    const [c] = await db.select({ prizes: schema.sponsoredCampaigns.prizes })
      .from(schema.sponsoredCampaigns)
      .where((await import("drizzle-orm")).eq(schema.sponsoredCampaigns.id, res.campaignId));
    eq("their choice is stored, the rival's is not",
      c.prizes?.places, [[gold2], [], [silver]]);
  }
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
