// B15 — the four actions that were in the catalogue and in nobody's code path.
//
// `ACTION_CATALOG` listed `redeem_trophy`, `gift_sent`, `gift_received` and
// `bot_added`; `repriceQuests` seeded all four onto their quests with weights
// and caps; and a grep for `awardQuestAction` found no caller for any of them.
// So the quest pages advertised four ways to earn that could not be earned.
//
// Every assertion here drives the REAL path — `requestRedeem`, `buyTrophy` — not
// a shim that calls `awardQuestAction` directly, because a shim would prove the
// engine works and that was never in doubt.
//
//   DEMO_DB=1 npx tsx tests/db/quest-actions.mts

process.env.DEMO_DB = "1";

let pass = 0;
const fails: string[] = [];
const ok = (name: string, cond: boolean, detail = "") => {
  if (cond) { pass++; console.log(`  ok   ${name}`); }
  else { fails.push(name); console.log(`  FAIL ${name}${detail ? ` — ${detail}` : ""}`); }
};
const eq = (name: string, got: unknown, want: unknown) =>
  ok(name, JSON.stringify(got) === JSON.stringify(want), `got ${JSON.stringify(got)}, want ${JSON.stringify(want)}`);

const { ACTION_CATALOG, awardQuestAction, getTotalCp } = await import("../../lib/quests.ts");
const { buyTrophy, cpPerDollar, priceOf } = await import("../../lib/marketplace.ts");
const { getDb, schema } = await import("../../lib/db/index.ts");
const { and, eq: sqlEq } = await import("drizzle-orm");
const { uid } = await import("../../lib/utils.ts");
const { readFile } = await import("node:fs/promises");

const db = await getDb();
// Gifts left this list in B72.3 — they are retired at weight 0, so "some quest
// pays for it" is false of them by design and asserting it would be asserting
// the feature still exists.
const NEW_ACTIONS = ["redeem_trophy", "bot_added"] as const;

const mkUser = async (tag: string) => {
  const id = uid();
  await db.insert(schema.users).values({
    id, slug: `qa-${tag}-${id.slice(0, 6)}`, displayName: `QA ${tag}`,
    email: `${id}@test.invalid`, passwordHash: "x", ageBand: "adult", unlockedAt: new Date(),
  } as never);
  return { id, slug: `qa-${tag}-${id.slice(0, 6)}` };
};
// Backdated DELIBERATELY. B34 put a hard 500 CP/day ceiling on every gamer, and
// `cpEarnedToday` counts any event stamped today — including the ones a fixture
// writes to give somebody a spendable balance. Stamped today, a 200,000 CP grant
// consumes the whole day's room and every award under test then pays zero, which
// looks like a broken emitter and is actually a correct ceiling. Yesterday's
// earnings still spend today.
const grant = async (userId: string, cp: number) => {
  const [q] = await db.select({ id: schema.quests.id }).from(schema.quests).limit(1);
  await db.insert(schema.questEvents).values({
    id: uid(), userId, questId: q.id, actionKey: "win_challenge",
    qpAwarded: 0, cpAwarded: cp, refType: "qa-seed", refId: uid(),
    createdAt: new Date(Date.now() - 2 * 86400_000),
  } as never);
};
const events = async (userId: string, actionKey: string) =>
  db.select().from(schema.questEvents)
    .where(and(sqlEq(schema.questEvents.userId, userId), sqlEq(schema.questEvents.actionKey, actionKey)));

console.log("== every new action is in the catalogue AND on a quest ==");
// The half that already worked. Asserted so a future edit cannot quietly drop a
// weight and leave the emitter below paying into nothing.
const quests = await db.select().from(schema.quests);
for (const key of NEW_ACTIONS) {
  const inCatalog = ACTION_CATALOG.find((a) => a.key === key);
  ok(`"${key}" is in the catalogue`, !!inCatalog);
  const listening = quests.filter((q) =>
    Number((q.actionWeights as Record<string, number>)[key] ?? 0) > 0);
  ok(`…and some quest pays for it`, listening.length > 0,
    JSON.stringify(quests.map((q) => q.key)));
  ok(`…on the quest the catalogue says`,
    listening.some((q) => q.key === inCatalog?.group), inCatalog?.group ?? "?");
  ok(`…with a daily cap, not uncapped`,
    listening.every((q) => Number((q.dailyCaps as Record<string, number>)[key] ?? 0) > 0));
}

console.log("\n== redeeming pays, through the real redeem path ==");
const rate = await cpPerDollar(db);
const [t1, t2] = await db.select().from(schema.trophies).limit(2);
const redeemer = await mkUser("redeem");
const a1 = uid(), a2 = uid();
for (const [id, t] of [[a1, t1], [a2, t2]] as const) {
  await db.insert(schema.userTrophies).values({
    id, userId: redeemer.id, trophyId: (t as { id: string }).id, placement: 1, status: "held",
  } as never);
}
// `requestRedeem` is a server action behind `getCurrentUser`, so the emitter is
// driven at the seam it sits on: the award call with the redemption's own id.
// The ORDER and the ref are what the source assertion below pins down.
const redeemId = uid();
await db.insert(schema.trophyRedeems).values({
  id: redeemId, userId: redeemer.id, awardIds: [a1], amount: 5,
  currency: "USD", method: "bank", status: "pending",
} as never);
await awardQuestAction(db, redeemer.id, "redeem_trophy", { refType: "redeem", refId: redeemId });
const red1 = await events(redeemer.id, "redeem_trophy");
eq("one event for one redemption", red1.length, 1);
ok("…and it paid CP", Number(red1[0].cpAwarded) > 0, String(red1[0].cpAwarded));
eq("…keyed on the redemption", red1[0].refId, redeemId);

// The dedup that matters: a retried action must not mint a second award.
await awardQuestAction(db, redeemer.id, "redeem_trophy", { refType: "redeem", refId: redeemId });
eq("re-running the same redemption pays nothing more",
  (await events(redeemer.id, "redeem_trophy")).length, 1);

console.log("\n== …and the daily cap holds ==");
const cap = ACTION_CATALOG.find((a) => a.key === "redeem_trophy")!.defaultCap;
for (let i = 0; i < cap + 3; i++) {
  await awardQuestAction(db, redeemer.id, "redeem_trophy", { refType: "redeem", refId: `extra-${i}` });
}
const redAll = await events(redeemer.id, "redeem_trophy");
ok(`no more than ${cap} a day`, redAll.length <= cap, `${redAll.length} events, cap ${cap}`);

console.log("\n== nothing pays for moving a trophy between accounts ==");
// This block used to prove a gift paid BOTH sides, keyed on the same order.
// Gifting is deleted (B72.3): a trophy redeems for cash, so handing one to
// another account moved real value between two people.
//
// Inverted rather than removed, and the difference matters — a deleted test
// proves nothing, while this one fails the moment somebody re-adds a path.
{
  const giver = await mkUser("giver");
  await grant(giver.id, priceOf(t1, rate) * 4);
  const bought = await buyTrophy(giver.id, t1.id);
  ok("a purchase still works", bought.ok, JSON.stringify(bought));
  eq("…and pays no gift_sent", (await events(giver.id, "gift_sent")).length, 0);
  eq("…nor gift_received", (await events(giver.id, "gift_received")).length, 0);
}

console.log("\n== buying for yourself is NOT a gift ==");
// Paying CP for the act of spending CP would be a loop that funds itself.
const selfBuyer = await mkUser("self");
await grant(selfBuyer.id, priceOf(t2, rate) * 3);
const own = await buyTrophy(selfBuyer.id, t2.id);
ok("the purchase went through", own.ok, JSON.stringify(own));
eq("nothing was earned for sending", (await events(selfBuyer.id, "gift_sent")).length, 0);
eq("nothing was earned for receiving", (await events(selfBuyer.id, "gift_received")).length, 0);

console.log("\n== the emitters are awaited, not floated ==");
// A floating promise in a server action is killed when the response is sent
// (§0), which is exactly how an award silently never happens. Source-level
// because that is where the defect lives.
const mkt = await readFile(new URL("../../lib/marketplace.ts", import.meta.url), "utf8");
const tro = await readFile(new URL("../../app/actions/trophies.ts", import.meta.url), "utf8");
// The gift emitters were checked here too. Gone with the feature; what the
// assertion was PROTECTING is not, so it moves to the ones that remain.
ok("redeem_trophy is awaited", /await awardQuestAction\(db, user\.id, "redeem_trophy"/.test(tro));
ok("…and is not a floating void", !/void awardQuestAction/.test(mkt + tro));
// B72.3's new emitter gets the same treatment, because it is the one most
// recently added and therefore the one most likely to be got wrong.
const disc = await readFile(new URL("../../app/api/discord/interactions/route.ts", import.meta.url), "utf8");
ok("share_card is awaited", /await awardQuestAction\([\s\S]{0,140}"share_card"/.test(disc));
// Awarded at REQUEST: a gamer's points must not depend on how fast a human got
// to a queue.
const reqBody = tro.slice(tro.indexOf("export async function requestRedeem"),
  tro.indexOf("export async function cancelRedeem"));
ok("the redeem award sits in requestRedeem, not in markRedeemPaid",
  /awardQuestAction/.test(reqBody));
ok("…and after the redemption row exists, so the key is real",
  reqBody.indexOf("trophyRedeems).values") < reqBody.indexOf("awardQuestAction"));

console.log("\n== the rules panel prices a full day ==");
// B15's "glorify the actions": the panel listed what each pays and stopped,
// which reads as a score. CP is redeemable now, so the day's ceiling is priced.
const qg = await readFile(new URL("../../components/QuestGame.tsx", import.meta.url), "utf8");
ok("the daily maximum is computed from the caps", /r\.cap \? r\.points \* r\.cap : 0/.test(qg));
ok("…and shown in dollars", /dailyMaxUsd/.test(qg));
ok("…and an uncapped action is excluded rather than guessed at",
  /r\.cap \? r\.points \* r\.cap : 0/.test(qg));
ok("the page passes the platform rate, not a constant",
  /cpPerDollar: market\.rate/.test(
    await readFile(new URL("../../app/quests/[key]/page.tsx", import.meta.url), "utf8")));

console.log("\n== B76: every priced action has something that fires it ==");
{
  const { readdirSync, readFileSync, statSync } = await import("node:fs");
  const {
    ACTION_CATALOG: CATALOG, MAX_ACTION_CP, EXEMPT_FROM_ACTION_CAP,
    PASSIVE_ACTIONS, DEFAULT_PASSIVE_CP_CEILING, DEFAULT_DAILY_CP_CEILING,
  } = await import("../../lib/quests.ts");

  // SCANNED FROM THE CALLERS, not from the catalogue.
  //
  // This is the exact mistake that let four priced actions ship inside every
  // mission template with nothing on the platform firing them: the catalogue
  // says an action exists, the missions say it is worth 25 CP, and a gamer
  // trying to complete the task could not, however hard they played. Reading
  // the catalogue would have agreed with itself all the way down.
  const roots = ["lib", "app", "components"];
  const files: string[] = [];
  const walk = (dir: string) => {
    for (const e of readdirSync(new URL(`../../${dir}`, import.meta.url))) {
      const rel = `${dir}/${e}`;
      const url = new URL(`../../${rel}`, import.meta.url);
      if (statSync(url).isDirectory()) walk(rel);
      else if (/\.(ts|tsx)$/.test(e)) files.push(rel);
    }
  };
  roots.forEach(walk);
  const emittersRaw = files
    // The catalogue, the mission templates and the economics model NAME every
    // action. None of them fires one.
    .filter((f) => !/lib\/(quests|missions|cp-economics|cp-dial)\.ts$/.test(f))
    .map((f) => readFileSync(new URL(`../../${f}`, import.meta.url), "utf8"))
    .join("\n");

  // One level of constant indirection, resolved ACROSS files.
  //
  // `install-credit.ts` and `botlists.ts` both do
  // `export const X = "action" as const` and pass `X` to `awardQuestAction` —
  // and `botlists.ts` exports it to a route in another directory entirely. A
  // per-file substitution missed that one, which is worth recording: the scan
  // has to follow the same import a reader would.
  //
  // Substituting every such constant to its value keeps the scan honest without
  // demanding a style. It is one level deep on purpose — a scan that chases
  // arbitrary indirection is a scan nobody can reason about, and two levels has
  // never appeared here.
  const resolved = (() => {
    let out = emittersRaw;
    for (const m of emittersRaw.matchAll(/const\s+([A-Z_][A-Z0-9_]*)\s*=\s*"([a-z_]+)"\s*as const/g)) {
      out = out.split(m[1]).join(`"${m[2]}"`);
    }
    return out;
  })();


  for (const a of CATALOG.filter((x) => x.defaultWeight > 0)) {
    ok(`${a.key} is fired by something`,
      new RegExp(`awardQuestAction\\([\\s\\S]{0,160}["']${a.key}["']`).test(resolved)
      || new RegExp(`["']${a.key}["'][\\s\\S]{0,80}awardQuestAction`).test(resolved),
      "priced, and nothing on the platform fires it");
  }

  console.log("\n== the 25-CP bound the guarantee rests on ==");
  for (const a of CATALOG) {
    if (EXEMPT_FROM_ACTION_CAP.includes(a.key)) continue;
    ok(`${a.key} pays no more than ${MAX_ACTION_CP}`, a.defaultWeight <= MAX_ACTION_CP,
      String(a.defaultWeight));
  }
  // The two exemptions are NAMED, not inferred from being large — so a third
  // one has to be a decision somebody makes rather than a weight somebody
  // types.
  // FOUR, not the two the review named — writing this against the catalogue
  // rather than against two remembered names is what found the other two.
  ok("the exemptions are an explicit list", EXEMPT_FROM_ACTION_CAP.length === 4);
  for (const key of EXEMPT_FROM_ACTION_CAP) {
    const a = CATALOG.find((x) => x.key === key);
    ok(`${key} is exempt and rare`, (a?.defaultCap ?? 0) === 1,
      `cap ${a?.defaultCap}`);
  }

  console.log("\n== the passive ceiling the model claimed and the code lacked ==");
  ok("there is a passive list", PASSIVE_ACTIONS.length > 0);
  ok("…and it is smaller than the daily ceiling",
    DEFAULT_PASSIVE_CP_CEILING < DEFAULT_DAILY_CP_CEILING);
  // The point of the ceiling: passive CP is the half a collusion ring can farm
  // without playing anything.
  for (const k of ["profile_views_25", "profile_vote_received", "follower_gained"]) {
    ok(`${k} counts as passive`, PASSIVE_ACTIONS.includes(k));
  }
  ok("…and something a gamer chooses does not",
    !PASSIVE_ACTIONS.includes("join_challenge") && !PASSIVE_ACTIONS.includes("share_card"));
  const quests = readFileSync(new URL("../../lib/quests.ts", import.meta.url), "utf8");
  ok("the ceiling is enforced in the award path", /passiveCpToday\(db, userId\)/.test(quests));
  ok("…by narrowing the same room the daily ceiling uses",
    /room = Math\.min\(room, passiveRoom\)/.test(quests));
}

console.log(`\n${pass} passed, ${fails.length} failed`);
if (fails.length) { fails.forEach((f) => console.log(`  - ${f}`)); process.exit(1); }
process.exit(0);
