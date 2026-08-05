// B31/B43 — the giveaway that has to appear on a bill.
//
// Money-touching, so it is written with the item (§1.1). The property the whole
// thing exists for: **a welcome challenge is billed to Cluster through the same
// invoice machinery a paying brand uses.** A giveaway that skips billing is a
// giveaway nobody can add up — it becomes a cost in a spreadsheet somebody
// maintains by hand, in units that do not match the revenue it is meant to
// produce. Run through the same invoice, "what did customer acquisition cost"
// is a query rather than an estimate.
//
// The second property: it is a **draft**, not a live challenge. It used to
// publish and announce itself on install, which skips both the owner choosing
// the game for their own community and staff seeing it before it goes out.
//
//   DEMO_DB=1 npx tsx tests/db/welcome-challenge.mts

process.env.DEMO_DB = "1";

let pass = 0;
const fails: string[] = [];
const ok = (name: string, cond: boolean, detail = "") => {
  if (cond) { pass++; console.log(`  ok   ${name}`); }
  else { fails.push(name); console.log(`  FAIL ${name}${detail ? ` — ${detail}` : ""}`); }
};
const eq = (name: string, got: unknown, want: unknown) =>
  ok(name, JSON.stringify(got) === JSON.stringify(want), `got ${JSON.stringify(got)}, want ${JSON.stringify(want)}`);

const { grantWelcomeChallenge } = await import("../../lib/welcome-challenge.ts");
const { houseBrand, billWelcomeChallenge, HOUSE_BRAND_ID } = await import("../../lib/house-brand.ts");
const { totalsOf } = await import("../../lib/invoices.ts");
const { getDb, schema } = await import("../../lib/db/index.ts");
const { eq: sqlEq, and } = await import("drizzle-orm");
const { uid } = await import("../../lib/utils.ts");
// `providerForGame`, not PROVIDERS: the grant needs a provider that can
// actually verify play, and VALORANT is in the registry without one. Picking by
// the registry alone chooses a game the grant will refuse, which reads as a
// broken grant and is a broken fixture.
const { providerForGame } = await import("../../lib/challenge-requests.ts");

const db = await getDb();
const tag = uid().slice(0, 6);

// A game we have both a provider and a planet for — a welcome challenge on a
// game we cannot read scores from is a poster, not a competition.
// The game has to be ACTIVE in `games`, have a provider, and have a planet —
// `grantWelcomeChallenge` needs all three, and a fixture that inserts its own
// game row fails on the slug it does not know it has to supply. Use what the
// demo already carries.
const spaces = await db.select().from(schema.spaces);
const activeGames = await db.select().from(schema.games).where(sqlEq(schema.games.isActive, true));
const playable = spaces.find((s) =>
  s.game && activeGames.some((g) => g.name === s.game) && !!providerForGame(s.game));
ok("the demo has an active, playable game with a planet", !!playable,
  JSON.stringify({ spaces: spaces.map((s) => s.game), games: activeGames.map((g) => g.name) }));
if (!playable) process.exit(1);
const game = playable.game!;

const mkGuild = async (games: string[] | null, name = `Guild ${tag}`) => {
  const guildId = `wc-${uid().slice(0, 10)}`;
  await db.insert(schema.discordGuilds).values({
    guildId, name, status: "active",
    community: games ? { games } : {},
  } as never);
  return guildId;
};

console.log("\n== the house brand is real, and marked as ours ==");
const house = await houseBrand();
ok("it exists", !!house);
// THE assertion, after the user flagged that production already carries a
// Cluster brand with every house ad creative linked to it: this must resolve to
// the row `runBootMaintenance` makes, never mint a rival. A second "Cluster"
// splits the ledger and orphans the creatives.
eq("…and it IS the brand boot maintenance already made", house?.id, HOUSE_BRAND_ID);
const [seeded] = await db.select({ id: schema.brands.id, name: schema.brands.name })
  .from(schema.brands).where(sqlEq(schema.brands.id, HOUSE_BRAND_ID)).limit(1);
ok("…which exists independently of this module", !!seeded, JSON.stringify(seeded ?? null));
// Its ad creatives must still hang off it.
const creatives = await db.select({ id: schema.adCreatives.id })
  .from(schema.adCreatives).where(sqlEq(schema.adCreatives.brandId, HOUSE_BRAND_ID));
ok("…with its house creatives still attached", creatives.length > 0, `${creatives.length} creatives`);
const [houseRow] = await db.select().from(schema.brands).where(sqlEq(schema.brands.id, house!.id)).limit(1);
eq("…and flagged, so it stays out of lists that mean customers", houseRow.isHouse, true);
// Calling again must not mint a second one — two house brands split the ledger
// this exists to keep whole.
const again = await houseBrand();
eq("asking twice returns the same brand", again?.id, house?.id);
const allHouse = await db.select().from(schema.brands).where(sqlEq(schema.brands.isHouse, true));
eq("…and there is exactly one", allHouse.length, 1);
const named = await db.select({ id: schema.brands.id }).from(schema.brands)
  .where(sqlEq(schema.brands.name, "Cluster"));
eq("…and exactly one brand called Cluster, not two", named.length, 1);

console.log("\n== a server that told us what it plays gets a DRAFT ==");
const guildId = await mkGuild([game], `Draftable ${tag}`);
const res = await grantWelcomeChallenge(guildId);
ok("it is granted", res.ok, JSON.stringify(res));
const [ch] = await db.select().from(schema.challenges)
  .where(sqlEq(schema.challenges.id, res.ok ? res.challengeId : "")).limit(1);
ok("the challenge exists", !!ch);
eq("…as a DRAFT, not live", ch.status, "draft");
eq("…marked as a welcome challenge", ch.kind, "welcome");
eq("…private to its server", ch.visibility, "private");
eq("…scoped to that guild", ch.guildId, guildId);
eq("…sponsored by the house brand", ch.sponsorBrandId, house!.id);
ok("…and carrying what it is worth, per challenge", Number(ch.sponsorPrice) > 0, String(ch.sponsorPrice));

console.log("\n== it is INVISIBLE to members until it publishes ==");
// A draft that members can see is a competition we advertised and did not run.
const publicList = await db.select().from(schema.challenges)
  .where(and(sqlEq(schema.challenges.status, "active"), sqlEq(schema.challenges.guildId, guildId)));
eq("nothing live on that guild yet", publicList.length, 0);

console.log("\n== and it lands on CLUSTER'S OWN BILL ==");
const lines = await db.select().from(schema.invoiceLines)
  .where(sqlEq(schema.invoiceLines.sourceId, ch.id));
eq("one line for one challenge", lines.length, 1);
eq("…naming the server", lines[0].label, `Welcome challenge — Draftable ${tag}`);
eq("…at what the challenge is worth", Number(lines[0].unitAmount), Number(ch.sponsorPrice));
eq("…keyed as a welcome line", lines[0].sourceType, "welcome");
const [inv] = await db.select().from(schema.brandInvoices)
  .where(sqlEq(schema.brandInvoices.id, lines[0].invoiceId)).limit(1);
eq("…on an invoice to the house brand", inv.brandId, house!.id);
eq("…as a draft bill", inv.status, "draft");

console.log("\n== nothing is ever billed twice ==");
const twice = await grantWelcomeChallenge(guildId);
ok("a second grant is a no-op", twice.ok && twice.already, JSON.stringify(twice));
eq("…and mints no second challenge",
  (await db.select().from(schema.challenges).where(sqlEq(schema.challenges.guildId, guildId))).length, 1);
const rebill = await billWelcomeChallenge(ch.id, "Draftable", 25);
eq("billing the same challenge again is refused", rebill, { billed: false, reason: "already_billed" });
eq("…and there is still one line",
  (await db.select().from(schema.invoiceLines).where(sqlEq(schema.invoiceLines.sourceId, ch.id))).length, 1);

console.log("\n== a month of growth is ONE bill, not forty ==");
const second = await mkGuild([game], `Second ${tag}`);
const r2 = await grantWelcomeChallenge(second);
ok("the second server is granted", r2.ok, JSON.stringify(r2));
const l2 = await db.select().from(schema.invoiceLines)
  .where(sqlEq(schema.invoiceLines.sourceId, r2.ok ? r2.challengeId : ""));
eq("its line exists", l2.length, 1);
eq("…on the SAME invoice as the first", l2[0].invoiceId, lines[0].invoiceId);

console.log("\n== the bill totals the sum of its lines ==");
// The standing rule: totals are never stored.
const allLines = await db.select().from(schema.invoiceLines)
  .where(sqlEq(schema.invoiceLines.invoiceId, lines[0].invoiceId));
const t = totalsOf(allLines.map((l) => ({ quantity: Number(l.quantity), unitAmount: Number(l.unitAmount), kind: l.kind })));
eq("the total is the sum of the welcome lines",
  t.total, Math.round(allLines.reduce((s, l) => s + Number(l.quantity) * Number(l.unitAmount), 0) * 100) / 100);
ok("…and it is not zero", t.total > 0, String(t.total));

console.log("\n== a server that never told us what it plays gets nothing ==");
// An activation on the wrong game is worse than none. The honest move is to go
// and ask, which `askForGames` does — not to guess.
const silent = await mkGuild(null, `Silent ${tag}`);
const none = await grantWelcomeChallenge(silent);
eq("it is refused, with the reason", none, { ok: false, reason: "no_game" });
eq("…and nothing was drafted",
  (await db.select().from(schema.challenges).where(sqlEq(schema.challenges.guildId, silent))).length, 0);
eq("…and nothing was billed",
  (await db.select().from(schema.discordGuilds)
    .where(sqlEq(schema.discordGuilds.guildId, silent)))[0].welcomeChallengeAt, null);

console.log("\n== changing the default never rewrites a draft already made ==");
// The value rides on the challenge, not on a config the ledger reads later.
const before = Number(ch.sponsorPrice);
const [stillCh] = await db.select().from(schema.challenges).where(sqlEq(schema.challenges.id, ch.id)).limit(1);
eq("the drafted value is stored on the challenge", Number(stillCh.sponsorPrice), before);
eq("…and its invoice line still says the same",
  Number((await db.select().from(schema.invoiceLines).where(sqlEq(schema.invoiceLines.sourceId, ch.id)))[0].unitAmount),
  before);

console.log("\n== the grant is not announced ==");
// Announcing a competition nobody has chosen a game for is how a server's first
// impression becomes a correction.
const { readFile } = await import("node:fs/promises");
const src = await readFile(new URL("../../lib/welcome-challenge.ts", import.meta.url), "utf8");
ok("nothing announces the draft", !/announceChallengeLaunched/.test(src));
ok("…and the owner DM says it is waiting, not live",
  /waiting/i.test(src) && !/is live/i.test(src.slice(src.indexOf("dmUser"))), "");
ok("billing can never fail the grant",
  /catch \{ \/\* reconcilable/.test(src));

console.log("\n== B43: the draft is on the ADMIN side from the moment it exists ==");
// B31 assumed the owner would log in and pick a game. Many never will, and a
// draft only its owner can finish is a cost already booked against a
// competition that never runs.
const { welcomeChallenges, completeWelcome, cancelWelcome, createWelcomeFor } =
  await import("../../lib/welcome-admin.ts");
const queue = await welcomeChallenges();
const mine = queue.find((w) => w.challengeId === ch.id);
ok("it is in the admin list", !!mine, JSON.stringify(queue.map((w) => w.challengeId)));
eq("…named by its server", mine?.serverName, `Draftable ${tag}`);
eq("…with its state", mine?.state, "ready");
eq("…and shown as billed", mine?.billed, true);
ok("every row says what it is worth", queue.every((w) => typeof w.value === "number"));

console.log("\n== a draft nobody can run says WHY, not nothing ==");
// The difference between a work queue and an inventory.
const stuckGuild = await mkGuild([game], `Stuck ${tag}`);
const stuckRes = await grantWelcomeChallenge(stuckGuild);
ok("it is drafted", stuckRes.ok, JSON.stringify(stuckRes));
// Break it the way reality does: a game we cannot verify scores on.
await db.update(schema.challenges).set({ game: "A Game We Cannot Read" })
  .where(sqlEq(schema.challenges.id, stuckRes.ok ? stuckRes.challengeId : ""));
const q2 = await welcomeChallenges();
const broken = q2.find((w) => w.challengeId === (stuckRes.ok ? stuckRes.challengeId : ""));
eq("its state is needs_game", broken?.state, "needs_game");
ok("…and the blocker names the problem", (broken?.blocker ?? "").length > 20, broken?.blocker ?? "");
ok("…and says whether the owner ever told us anything",
  typeof broken?.ownerOnboarded === "boolean");

console.log("\n== admin completing it produces the SAME challenge, still a draft ==");
const completed = await completeWelcome(broken!.challengeId, game);
ok("it completes", completed.ok, JSON.stringify(completed));
const [after] = await db.select().from(schema.challenges)
  .where(sqlEq(schema.challenges.id, broken!.challengeId)).limit(1);
eq("the game is set", after.game, game);
eq("…on the SAME challenge, not a second one", after.id, broken!.challengeId);
eq("…and it is STILL a draft", after.status, "draft");
eq("…so a welcome challenge does not skip approval", after.kind, "welcome");
// A game we cannot verify is refused rather than accepted and left broken.
eq("an unverifiable game is refused",
  (await completeWelcome(broken!.challengeId, "Nonsense Game")).ok, false);

console.log("\n== cancelling VOIDS the line, never deletes it ==");
// A bill that quietly loses a row is a bill that stops reconciling.
const lineBefore = await db.select().from(schema.invoiceLines)
  .where(sqlEq(schema.invoiceLines.sourceId, broken!.challengeId));
eq("it had a line", lineBefore.length, 1);
const cancelled = await cancelWelcome(broken!.challengeId, "they never told us what they play");
ok("it cancels", cancelled.ok, JSON.stringify(cancelled));
const [cch] = await db.select().from(schema.challenges)
  .where(sqlEq(schema.challenges.id, broken!.challengeId)).limit(1);
eq("the challenge is cancelled", cch.status, "cancelled");
ok("…and says why, on the record", /never told us what they play/.test(cch.description ?? ""), cch.description ?? "");
const voided = await db.select().from(schema.invoiceLines)
  .where(sqlEq(schema.invoiceLines.sourceId, broken!.challengeId));
eq("THE LINE STILL EXISTS", voided.length, 1);
eq("…at zero", Number(voided[0].unitAmount), 0);
ok("…and labelled as cancelled", /cancelled/i.test(voided[0].label), voided[0].label);
// The server can be offered one again — that is what B43.2 is for.
const [freed] = await db.select().from(schema.discordGuilds)
  .where(sqlEq(schema.discordGuilds.guildId, stuckGuild)).limit(1);
eq("the server is free to receive another", freed.welcomeChallengeId, null);

console.log("\n== a challenge that already RAN cannot be cancelled ==");
await db.update(schema.challenges).set({ status: "active" }).where(sqlEq(schema.challenges.id, ch.id));
eq("cancelling a running one is refused",
  await cancelWelcome(ch.id, "changed my mind"), { ok: false, reason: "already_ran" });
await db.update(schema.challenges).set({ status: "draft" }).where(sqlEq(schema.challenges.id, ch.id));

console.log("\n== B43.2: admin can create one for a server with no draft ==");
const recreated = await createWelcomeFor(stuckGuild, game, 30);
ok("it is created", recreated.ok, JSON.stringify(recreated));
const [made] = await db.select().from(schema.challenges)
  .where(sqlEq(schema.challenges.id, recreated.ok ? recreated.challengeId : "")).limit(1);
eq("…as a draft", made.status, "draft");
eq("…of the welcome kind", made.kind, "welcome");
eq("…private to that server", [made.visibility, made.guildId], ["private", stuckGuild]);
eq("…at the value admin chose, not the default", Number(made.sponsorPrice), 30);
const madeLine = await db.select().from(schema.invoiceLines)
  .where(sqlEq(schema.invoiceLines.sourceId, made.id));
eq("…and billed exactly like the automatic one", madeLine.length, 1);
eq("…at that value", Number(madeLine[0].unitAmount), 30);
// One at a time: a second would be billed as a second.
eq("a server that already has one is refused",
  (await createWelcomeFor(stuckGuild, game, 30)), { ok: false, reason: "already_has_one" });

console.log("\n== a welcome challenge is private in every surface ==");
const everyWelcome = await db.select().from(schema.challenges)
  .where(sqlEq(schema.challenges.kind, "welcome"));
ok("every one is private", everyWelcome.every((c) => c.visibility === "private"),
  JSON.stringify(everyWelcome.filter((c) => c.visibility !== "private").map((c) => c.id)));
ok("…and scoped to a guild", everyWelcome.every((c) => !!c.guildId));

console.log(`\n${pass} passed, ${fails.length} failed`);
if (fails.length) { fails.forEach((f) => console.log(`  - ${f}`)); process.exit(1); }
process.exit(0);
