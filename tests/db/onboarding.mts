// Two steps, a held balance, and the promise not to take anything. B83.
//
// The assertion this file exists for is the LAST one: an account that existed
// before the lock did is never locked. Everything else here is a gate, and a
// gate that is slightly wrong costs a support ticket. Locking an early user out
// of a balance they already had costs the early user, and there is no version
// of that we could apologise our way out of.
//
//   DEMO_DB=1 npx tsx tests/db/onboarding.mts

process.env.DEMO_DB = "1";

import { readFileSync } from "node:fs";

let pass = 0;
const fails: string[] = [];
const ok = (name: string, cond: boolean, detail = "") => {
  if (cond) { pass++; console.log(`  ok   ${name}`); }
  else { fails.push(name); console.log(`  FAIL ${name}${detail ? ` — ${detail}` : ""}`); }
};
const eq = (name: string, got: unknown, want: unknown) =>
  ok(name, JSON.stringify(got) === JSON.stringify(want), `got ${JSON.stringify(got)}, want ${JSON.stringify(want)}`);

const code = (p: string) => readFileSync(new URL(`../../${p}`, import.meta.url), "utf8")
  .replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|\s)\/\/.*$/gm, "");

const { getDb, schema } = await import("../../lib/db/index.ts");
const { eq: sqlEq, sql } = await import("drizzle-orm");
const { uid } = await import("../../lib/utils.ts");
const {
  unlockState, tryUnlock, hasCustomized, stepsFor, creditableWhileLocked, LOCKED_CP_CAP,
} = await import("../../lib/unlock.ts");
const { awardQuestAction } = await import("../../lib/quests.ts");
const { buyTrophy, cpPerDollar, priceOf } = await import("../../lib/marketplace.ts");

const db = await getDb();
const tag = uid().slice(0, 8);

const mkGamer = async (opts: { customized?: boolean; country?: boolean; email?: boolean; band?: string | null; unlocked?: boolean } = {}) => {
  const id = uid();
  await db.insert(schema.users).values({
    id, email: `${id}@ob.test`, displayName: `OB ${id.slice(0, 4)}`,
    slug: `ob-${tag}-${id.slice(0, 6)}`, passwordHash: "x",
    ageBand: opts.band === undefined ? "adult" : opts.band,
    // One flag per step, so a fixture can never satisfy two at once and hide
    // which one the assertion is actually about.
    ...(opts.customized ? { avatarUrl: "/a.png" } : {}),
    ...(opts.country ? { country: "EG" } : {}),
    ...(opts.email ? { emailVerifiedAt: new Date() } : {}),
    ...(opts.unlocked ? { unlockedAt: new Date() } : {}),
  });
  return id;
};
const linkAccount = (userId: string) => db.insert(schema.linkedGameAccounts).values({
  id: uid(), userId, provider: "chesscom", providerAccountId: `ob-${uid().slice(0, 8)}`,
  inGameName: "x", verified: true,
});

console.log("== what counts as customizing ==");
{
  // Deliberately generous. The step exists to get somebody to make the profile
  // theirs, and insisting on a particular gesture fails the gamer who made it a
  // different way — including the one who only ever tapped a flag in Discord.
  ok("a country flag counts", hasCustomized({ country: "EG" }));
  ok("an avatar counts", hasCustomized({ avatarUrl: "/a.png" }));
  ok("a bio counts", hasCustomized({ bio: "hello" }));
  ok("a theme counts", hasCustomized({ theme: { bg: "#000" } }));
  ok("nothing counts as nothing", !hasCustomized({}));
  ok("…and whitespace is not a bio", !hasCustomized({ bio: "   " }));
  ok("…and an empty theme object is not a theme", !hasCustomized({ theme: {} }));

  // B93. THREE steps, and none of them is a scavenger hunt. It was four, one of
  // which — "make your profile yours" — was satisfied by uploading a picture,
  // which tells us nothing about whether somebody may be paid.
  const steps = stepsFor({ linked: false, email: false, profile: false });
  eq("there are exactly three steps", steps.length, 3);
  ok("…and none of them is sharing a card",
    !steps.some((s) => /share/i.test(s.label) || /share/i.test(s.key)));
  eq("…in the order a gamer does them", steps.map((s) => s.key), ["link", "email", "profile"]);

  // Every step says WHY, not just what. A step with no reason reads as a chore.
  ok("every step explains itself", steps.every((s) => s.detail.length > 40),
    JSON.stringify(steps.map((s) => s.detail.length)));
  ok("the email step says what it switches on",
    /earning/i.test(steps.find((s) => s.key === "email")?.detail ?? ""));
  ok("…and the profile step says what each answer decides",
    /age decides/i.test(steps.find((s) => s.key === "profile")?.detail ?? "")
    && /country decides/i.test(steps.find((s) => s.key === "profile")?.detail ?? ""));

  // Both answers, not either. A country with no age band cannot be paid, and an
  // age band with no country cannot be paid either.
  ok("the profile step needs BOTH answers",
    !stepsFor({ linked: true, email: true, profile: false }).find((x) => x.key === "profile")?.done);
}

console.log("\n== a new gamer is locked, and earns anyway ==");
{
  const id = await mkGamer();
  const s = await unlockState(db, id);
  ok("a fresh account is locked", !s.unlocked);
  eq("…with every step outstanding", s.steps.filter((x) => x.done).length, 0);

  // Earning still happens. A gamer who earns nothing until they finish learns
  // nothing about what earning feels like.
  await awardQuestAction(db, id, "join_challenge");
  const [row] = await db.select({ n: sql<number>`coalesce(sum(${schema.questEvents.cpAwarded}), 0)` })
    .from(schema.questEvents).where(sqlEq(schema.questEvents.userId, id));
  ok("a locked gamer still accrues CP", Number(row.n) > 0, String(row.n));
}

console.log("\n== the cap holds, and does not refuse the last few points ==");
{
  const state = { unlocked: false, lockedCp: 0, capped: false } as never;
  eq("under the cap, the full amount is credited", creditableWhileLocked(state, 25), 25);
  // The one that matters: at 4,990 a 25-CP action credits 10, not 0. Refusing
  // the whole action would leave the balance reading 4,990 forever, which looks
  // broken in exactly the way that generates support tickets.
  eq("at the edge, what is left is credited",
    creditableWhileLocked({ unlocked: false, lockedCp: LOCKED_CP_CAP - 10 } as never, 25), 10);
  eq("at the cap, nothing is", creditableWhileLocked({ unlocked: false, lockedCp: LOCKED_CP_CAP } as never, 25), 0);
  eq("past the cap, still nothing and never negative",
    creditableWhileLocked({ unlocked: false, lockedCp: LOCKED_CP_CAP + 500 } as never, 25), 0);
  eq("an unlocked gamer is uncapped", creditableWhileLocked({ unlocked: true } as never, 999), 999);

  // The cap is applied centrally, beside the daily ceiling — not at each
  // emitter. Same rule as B72.4's age gate, same reason.
  ok("the cap lives in the award path", /creditableWhileLocked/.test(code("lib/quests.ts")));
}

console.log("\n== locked CP cannot be spent or cashed out ==");
{
  const id = await mkGamer();
  const rate = await cpPerDollar(db);
  const trophyId = uid();
  await db.insert(schema.trophies).values({
    id: trophyId, name: `Lock ${tag}`, imageUrl: "/x.png", value: "0", inMarketplace: true,
  });
  // Fund them well past the price, so a refusal cannot be mistaken for "poor".
  const [quest] = await db.select().from(schema.quests).limit(1);
  await db.insert(schema.questEvents).values({
    id: uid(), userId: id, questId: quest.id, actionKey: "manual",
    qpAwarded: 0, cpAwarded: priceOf({ value: "0" } as never, rate) * 5,
    refType: "seed", refId: "funding",
  });

  const res = await buyTrophy(id, trophyId);
  ok("a locked gamer cannot buy a trophy", res.ok === false, JSON.stringify(res));
  // A trophy is cash with a picture on it — that is why this one is refused.
  ok("…and is told their points are safe", /safe|waiting/i.test((res as { error: string }).error));

  // Redemption, from source: running it needs a payout provider and an
  // eligibility pass, and what is being checked is that the gate EXISTS ahead
  // of both — a gamer asked for their country and then told about onboarding
  // has been asked twice for two different things.
  const redeem = code("app/actions/trophies.ts");
  ok("redemption checks the lock", /unlockState\(db, user\.id\)/.test(redeem));
  ok("…before the age and country checks",
    redeem.indexOf("unlockState") < redeem.indexOf("eligibilityFor"));
}

console.log("\n== finishing both steps unlocks, and says what they did ==");
{
  // No band on purpose: the profile step is BOTH answers, and this block walks
  // them one at a time.
  const id = await mkGamer({ email: true, band: null });
  const half = await unlockState(db, id);
  ok("one step done is still locked", !half.unlocked, JSON.stringify(half.steps));
  eq("…and the checklist says which one", half.steps.filter((s) => s.done).map((s) => s.key), ["email"]);

  await linkAccount(id);
  const stillLocked = await unlockState(db, id);
  ok("linking a game is not enough on its own either", !stillLocked.unlocked,
    JSON.stringify(stillLocked.steps.map((x) => [x.key, x.done])));
  ok("…and what is missing is the profile",
    stillLocked.steps.find((x) => x.key === "profile")?.done === false);

  // Country alone does not finish it — the band is the other half.
  await db.update(schema.users).set({ country: "EG" }).where(sqlEq(schema.users.id, id));
  ok("a country with no age band is still not enough",
    !(await unlockState(db, id)).unlocked);
  await db.update(schema.users).set({ ageBand: "adult" }).where(sqlEq(schema.users.id, id));
  const done = await tryUnlock(db, id);
  ok("all three steps unlock it", done.unlocked);
  ok("…and it names the game they linked",
    done.achieved.some((a) => /chesscom/i.test(a)), JSON.stringify(done.achieved));
  ok("…rather than congratulating them for filling in a form",
    !done.achieved.some((a) => /onboarding|complete/i.test(a)), JSON.stringify(done.achieved));

  // Idempotent, and the moment does not move.
  const [first] = await db.select({ at: schema.users.unlockedAt }).from(schema.users)
    .where(sqlEq(schema.users.id, id)).limit(1);
  await tryUnlock(db, id);
  const [second] = await db.select({ at: schema.users.unlockedAt }).from(schema.users)
    .where(sqlEq(schema.users.id, id)).limit(1);
  eq("unlocking twice does not move the moment",
    first.at?.toISOString(), second.at?.toISOString());

  // And spending works now.
  const trophyId = uid();
  await db.insert(schema.trophies).values({
    id: trophyId, name: `Free ${tag}`, imageUrl: "/x.png", value: "0", inMarketplace: true,
  });
  const rate = await cpPerDollar(db);
  const [quest] = await db.select().from(schema.quests).limit(1);
  await db.insert(schema.questEvents).values({
    id: uid(), userId: id, questId: quest.id, actionKey: "manual",
    qpAwarded: 0, cpAwarded: priceOf({ value: "0" } as never, rate) * 3,
    refType: "seed", refId: "funding",
  });
  const bought = await buyTrophy(id, trophyId);
  ok("an unlocked gamer can spend", bought.ok === true, JSON.stringify(bought));
}

console.log("\n== the grandfather rule ==");
{
  // THE ASSERTION THIS FILE EXISTS FOR.
  //
  // Every account that existed before the lock did is unlocked, at the moment
  // it was created. It is a MIGRATION rather than a runtime check, so it cannot
  // be forgotten on a later read path — and the migration is the entire promise
  // that nothing anybody already earned is ever taken away.
  const dbSrc = code("lib/db/index.ts");
  ok("the backfill exists",
    /UPDATE "users" SET "unlocked_at" = "created_at" WHERE "unlocked_at" IS NULL/.test(dbSrc));
  ok("…and it is unconditional on age, not gated on a deploy date",
    !/created_at\s*<\s*'/.test(dbSrc));

  // Behaviourally: an account carrying the stamp is unlocked with no steps
  // done and no game linked at all.
  const old = await mkGamer({ unlocked: true });
  const s = await unlockState(db, old);
  ok("an existing account is unlocked with nothing done", s.unlocked);
  eq("…and is shown no checklist", s.steps.length, 0);

  const rate = await cpPerDollar(db);
  const trophyId = uid();
  await db.insert(schema.trophies).values({
    id: trophyId, name: `Old ${tag}`, imageUrl: "/x.png", value: "0", inMarketplace: true,
  });
  const [quest] = await db.select().from(schema.quests).limit(1);
  await db.insert(schema.questEvents).values({
    id: uid(), userId: old, questId: quest.id, actionKey: "manual",
    qpAwarded: 0, cpAwarded: priceOf({ value: "0" } as never, rate) * 3,
    refType: "seed", refId: "funding",
  });
  const spend = await buyTrophy(old, trophyId);
  ok("…and can spend a balance it already had", spend.ok === true, JSON.stringify(spend));
}

console.log("\n== a read that fails must not lock somebody out ==");
{
  // Fails OPEN, like the rest of the abuse layer. The thing a closed failure
  // costs is a gamer's access to their own money.
  const src = code("lib/unlock.ts");
  ok("a failed read returns unlocked", /catch \{[\s\S]{0,120}return UNLOCKED;/.test(src));
}

console.log(`\n${pass} passed, ${fails.length} failed`);
if (fails.length) { fails.forEach((f) => console.log(`  - ${f}`)); process.exit(1); }
process.exit(0);
