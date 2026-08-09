// Three steps, and nothing at all before they are done. B83 → B94.
//
// This file used to exist for one assertion: that an account created before the
// lock was never locked. B94 REVERSED that, and the reversal is now what the
// last block asserts — everybody goes through onboarding, including the people
// who were here first.
//
// The promise that survives is the one that was always the important half:
// **nothing anybody earned is taken.** A pre-existing account is stopped from
// doing the NEXT thing, never stripped of the last one, and the tests below
// check the balance is still there afterwards.
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
  unlockState, tryUnlock, hasCustomized, stepsFor, UNLOCK_STEPS,
} = await import("../../lib/unlock.ts");
const { awardQuestAction } = await import("../../lib/quests.ts");
const { buyTrophy, cpPerDollar, priceOf } = await import("../../lib/marketplace.ts");

const db = await getDb();
const tag = uid().slice(0, 8);

const mkGamer = async (opts: {
  customized?: boolean; country?: boolean; email?: boolean;
  band?: string | null; unlocked?: boolean; theme?: boolean;
} = {}) => {
  const id = uid();
  await db.insert(schema.users).values({
    id, email: `${id}@ob.test`, displayName: `OB ${id.slice(0, 4)}`,
    slug: `ob-${tag}-${id.slice(0, 6)}`, passwordHash: "x",
    ageBand: opts.band === undefined ? "adult" : opts.band,
    // One flag per step, so a fixture can never satisfy two at once and hide
    // which one the assertion is actually about.
    ...(opts.customized ? { avatarUrl: "/a.png" } : {}),
    ...(opts.country ? { country: "EG" } : {}),
    ...(opts.theme ? { theme: { template: "cosmic" } } : {}),
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

console.log("\n== a new gamer is locked, and earns NOTHING ==");
{
  const id = await mkGamer();
  const s = await unlockState(db, id);
  ok("a fresh account is locked", !s.unlocked);
  eq("…with every step outstanding", s.steps.filter((x) => x.done).length, 0);

  // B94 REVERSED B83. It used to accrue to a cap, on the theory that a balance
  // somebody can see is a reason to finish. What that actually created was a
  // promise made to an account with no confirmed inbox, no declared age and no
  // country — a promise we could not price, could not pay, and could not
  // legally have made if the person behind it turned out to be twelve.
  await awardQuestAction(db, id, "join_challenge");
  const [row] = await db.select({ n: sql<number>`coalesce(sum(${schema.questEvents.cpAwarded}), 0)` })
    .from(schema.questEvents).where(sqlEq(schema.questEvents.userId, id));
  eq("a locked gamer accrues nothing", Number(row.n), 0);

  // But the ACTION is still recorded, the same as an action over the daily
  // ceiling. Nothing should look like it vanished, and the history is there the
  // moment they finish.
  const [seen] = await db.select({ n: sql<number>`count(*)` })
    .from(schema.questEvents).where(sqlEq(schema.questEvents.userId, id));
  ok("…but what they did is still written down", Number(seen.n) > 0, String(seen.n));

  // And the page never shows a pending number, because there is not one.
  eq("there is no held balance to advertise", s.heldCp, 0);
}

console.log("\n== the gate lives in one place, and every door reads it ==");
{
  // The award path, the challenge path and the redeem path. Three doors, one
  // check — a gate that has to be remembered at each emitter is a gate that
  // will be forgotten at one of them, and the one it is forgotten at is the one
  // that pays somebody we know nothing about.
  ok("nothing accrues before onboarding is finished",
    /if \(!state\.unlocked\) room = 0;/.test(code("lib/quests.ts")));
  ok("…joining a challenge is refused with its own reason",
    /reason: "onboarding"/.test(code("lib/challenges.ts")));
  ok("…and the refusal is in the LIB, so Discord is covered too",
    /unlockState/.test(code("lib/challenges.ts")));
  ok("…the web path sends them to the page rather than showing an error",
    /\/onboarding\?from=challenge/.test(code("app/actions/social.ts")));
  ok("…and the bot path names the same page",
    /onboarding/.test(code("app/api/discord/interactions/route.ts")));
}

console.log("\n== a locked gamer cannot spend or cash out ==");
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
  ok("…and an age band with no colours is not enough either (B97)",
    !(await unlockState(db, id)).unlocked);
  await db.update(schema.users).set({ theme: { template: "cosmic" } }).where(sqlEq(schema.users.id, id));
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

console.log("\n== nobody is grandfathered, and nothing is taken ==");
{
  // THE ASSERTION THIS FILE EXISTS FOR, and it is the reverse of what it was.
  //
  // B83 unlocked every pre-existing account by copying `created_at` into
  // `unlocked_at`, on the principle that you do not take something away from
  // somebody to close a hole they did not open. B94 lifts that stamp, because
  // the two facts we now require — a confirmed inbox and a declared age — are
  // the two we cannot operate without, and grandfathering an account with
  // neither carries the hole forward forever.
  //
  // What must remain true is the other half of the old promise: their MONEY is
  // untouched. Both halves are asserted here, in that order.
  const dbSrc = code("lib/db/index.ts");
  ok("the old blanket backfill is gone",
    !/SET "unlocked_at" = "created_at"/.test(dbSrc));
  ok("…and an account that does not meet the bar has its stamp lifted",
    /SET "unlocked_at" = NULL/.test(dbSrc));
  ok("…on all three conditions, not just the age one",
    /"age_band" IS NULL/.test(dbSrc)
    && /"email_verified_at" IS NULL/.test(dbSrc)
    && /linked_game_accounts/.test(dbSrc));
  ok("…and the backfilled email stamps are lifted with it",
    /SET "email_verified_at" = NULL/.test(dbSrc));

  // Behaviourally: a stamp on an account that has done nothing is still a
  // stamp, because `unlockState` trusts the column — the migration is what
  // clears it, and it is asserted above. What is asserted HERE is the promise:
  // an old account with a real balance is stopped, and the balance survives.
  const old = await mkGamer();
  const [quest] = await db.select().from(schema.quests).limit(1);
  await db.insert(schema.questEvents).values({
    id: uid(), userId: old, questId: quest.id, actionKey: "manual",
    qpAwarded: 0, cpAwarded: 4321, refType: "seed", refId: "legacy-balance",
  });

  const s = await unlockState(db, old);
  ok("an account from before the lock is locked like everybody else", !s.unlocked);
  eq("…and is shown the same checklist", s.steps.length, UNLOCK_STEPS);
  eq("…with the balance it already had, intact", s.heldCp, 4321);

  // Not "pending", not "at risk", not "held for review". It is theirs.
  const checklist = code("components/UnlockChecklist.tsx");
  ok("the page calls that balance safe rather than pending",
    /safe/i.test(checklist) && !/CP locked/.test(checklist));

  // And finishing gives it straight back.
  await linkAccount(old);
  await db.update(schema.users).set({
    country: "EG", ageBand: "adult", emailVerifiedAt: new Date(),
    theme: { template: "cosmic" },
  }).where(sqlEq(schema.users.id, old));
  const after = await tryUnlock(db, old);
  ok("finishing the steps unlocks it", after.unlocked);

  const rate = await cpPerDollar(db);
  const trophyId = uid();
  await db.insert(schema.trophies).values({
    id: trophyId, name: `Old ${tag}`, imageUrl: "/x.png", value: "0", inMarketplace: true,
  });
  await db.insert(schema.questEvents).values({
    id: uid(), userId: old, questId: quest.id, actionKey: "manual",
    qpAwarded: 0, cpAwarded: priceOf({ value: "0" } as never, rate) * 3,
    refType: "seed", refId: "funding",
  });
  const spend = await buyTrophy(old, trophyId);
  ok("…and the balance they had is spendable again", spend.ok === true, JSON.stringify(spend));
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
