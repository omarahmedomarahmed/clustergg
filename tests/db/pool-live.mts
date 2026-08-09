// The live pool, and the promise that it is the same arithmetic. B99.
//
// THE ASSERTION THIS FILE EXISTS FOR is the last block: the number an owner
// watches climb all week and the number that becomes their cheque come out of
// ONE function. A "live estimate" computed anywhere other than the code that
// decides the money is a number that drifts from the payment, and the first
// time it drifts the owner is right to say we made it up.
//
//   DEMO_DB=1 npx tsx tests/db/pool-live.mts

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
const { eq: sqlEq } = await import("drizzle-orm");
const { uid } = await import("../../lib/utils.ts");
const { standingFor, shareOf } = await import("../../lib/week-standing.ts");
const { livePool } = await import("../../lib/pool-live.ts");
const { weekStartOfDate } = await import("../../lib/allocations.ts");
const { PARTICIPATION_SHARE } = await import("../../lib/server-score.ts");

const db = await getDb();
const tag = uid().slice(0, 8);

const weekStart = weekStartOfDate();
const weekEnd = new Date(weekStart.getTime() + 7 * 86400_000);

// A server that CAN be paid: a complete profile is B47's gate, and a fixture
// without one would silently test the gate instead of the scoring.
const mkGuild = async (name: string, qualified: number) => {
  const guildId = `pool-${tag}-${uid().slice(0, 6)}`;
  await db.insert(schema.discordGuilds).values({
    id: uid(), guildId, name,
    // Every required field, because B47's gate drops a server that has not
    // described itself — and a fixture that trips the gate would be testing the
    // gate rather than the scoring.
    community: { games: ["Chess"], regions: ["mena"], vibes: ["competitive"], about: "MENA chess players who play daily." },
    contactEmail: `${guildId}@ob.test`,
  } as never);
  await db.insert(schema.guildSnapshots).values({
    id: uid(), guildId, weekStart, linked: qualified * 2, qualifiedLinked: qualified,
  } as never);
  return guildId;
};

const mkChallenge = async (visibility: string) => {
  const [space] = await db.select().from(schema.spaces).limit(1);
  const id = uid();
  await db.insert(schema.challenges).values({
    id, spaceId: space.id, game: "Chess", provider: "chesscom",
    title: `Pool ${tag} ${visibility}`,
    startAt: new Date(weekStart.getTime() + 3600_000),
    endAt: weekEnd, status: "active", visibility,
  } as never);
  return id;
};

const enter = async (challengeId: string, guildId: string) => {
  const userId = uid();
  await db.insert(schema.users).values({
    id: userId, slug: `pool-${tag}-${userId.slice(0, 6)}`, displayName: `Pool ${userId.slice(0, 4)}`,
    email: `${userId}@ob.test`, passwordHash: "x", ageBand: "adult",
  } as never);
  const accId = uid();
  await db.insert(schema.linkedGameAccounts).values({
    id: accId, userId, provider: "chesscom",
    providerAccountId: `pa-${accId.slice(0, 8)}`, inGameName: "x", verified: true,
  } as never);
  await db.insert(schema.challengeParticipants).values({
    id: uid(), challengeId, userId, linkedAccountId: accId, guildId,
    joinedAt: new Date(weekStart.getTime() + 7200_000),
  } as never);
  return userId;
};

console.log("== a week with nothing in it says so, rather than showing zeroes ==");
{
  const s = await standingFor(db, { weekStart, weekEnd, pool: 100 });
  if (s.servers.length === 0) {
    ok("it explains why there is nothing", s.reason.length > 40, s.reason);
    ok("…and names the reason private challenges do not count", /private/i.test(s.reason), s.reason);
  } else {
    ok("a seeded database can still be scored", true);
  }
}

console.log("\n== the pool is divided over the servers that took part ==");
const big = await mkGuild(`Pool Big ${tag}`, 40);
const small = await mkGuild(`Pool Small ${tag}`, 10);
{
  const ch = await mkChallenge("public");
  for (let i = 0; i < 3; i++) await enter(ch, big);
  await enter(ch, small);

  const s = await standingFor(db, { weekStart, weekEnd, pool: 1000 });
  const mine = s.servers.filter((x) => x.guildId === big || x.guildId === small);
  eq("both servers are scored", mine.length, 2);

  const paid = shareOf(s, big) + shareOf(s, small);
  ok("both are paid something", shareOf(s, big) > 0 && shareOf(s, small) > 0,
    `${shareOf(s, big)} / ${shareOf(s, small)}`);
  ok("…and the busier one is paid more", shareOf(s, big) > shareOf(s, small),
    `${shareOf(s, big)} vs ${shareOf(s, small)}`);
  ok("nothing is paid out of thin air", paid <= 1000 + 0.01, String(paid));

  // The flat share is the floor under everybody who took part, and it is the
  // thing that stops a small server reading the table as "not worth it".
  ok("the flat share is a real number", PARTICIPATION_SHARE > 0 && PARTICIPATION_SHARE < 100);
}

console.log("\n== a private challenge earns nobody a share ==");
{
  const priv = await mkChallenge("private");
  const only = await mkGuild(`Pool Private ${tag}`, 25);
  for (let i = 0; i < 5; i++) await enter(priv, only);

  const s = await standingFor(db, { weekStart, weekEnd, pool: 1000 });
  eq("a server whose only entrants are private is not in the run", shareOf(s, only), 0);
  ok("…and is not even scored", !s.servers.some((x) => x.guildId === only));
}

console.log("\n== a server with no profile is dropped, and counted ==");
{
  const guildId = `pool-${tag}-noprofile`;
  await db.insert(schema.discordGuilds).values({
    id: uid(), guildId, name: `No profile ${tag}`,
  } as never);
  await db.insert(schema.guildSnapshots).values({
    id: uid(), guildId, weekStart, linked: 50, qualifiedLinked: 25,
  } as never);
  const ch = await mkChallenge("public");
  await enter(ch, guildId);

  const s = await standingFor(db, { weekStart, weekEnd, pool: 1000 });
  eq("it is paid nothing", shareOf(s, guildId), 0);
  ok("…and is not scored, so it cannot take a percentile off anybody",
    !s.servers.some((x) => x.guildId === guildId));
  ok("…but it is COUNTED, so the page can say so", s.skippedForProfile > 0, String(s.skippedForProfile));
}

console.log("\n== the live pool never advertises money that is not there ==");
{
  const live = await livePool(db);
  ok("the pool is not negative", live.pool >= 0, String(live.pool));
  ok("…and the reserve is not either", live.reserve >= 0, String(live.reserve));
  // The close bounds the pool by the vault; so does this. Advertising a pool
  // larger than the vault would be advertising money that cannot be paid.
  ok("the pool is bounded by the vault, as the close bounds it",
    /Math\.min\(alloc\.amount, bank\.server\)/.test(code("lib/pool-live.ts")));
  ok("a week with no allocation is SAID, not shown as zero",
    /allocated/.test(code("app/pool/page.tsx")));
}

console.log("\n== the page and the cheque are the same arithmetic ==");
{
  // THE ASSERTION THIS FILE EXISTS FOR.
  const close = code("lib/week-close.ts");
  const page = code("lib/pool-live.ts");
  ok("the close calls the shared standing", /standingFor\(db, \{ weekStart, weekEnd, pool \}\)/.test(close));
  ok("…and so does the live pool", /standingFor\(db, \{ weekStart, weekEnd, pool \}\)/.test(page));

  // Proven by removal, not by reading: the scoring can only live in one file,
  // so the close must NOT still contain a copy of it.
  ok("the close no longer scores anything itself",
    !/percentile\(/.test(close) && !/exclusiveEntrants\(/.test(close),
    "week-close.ts still contains its own scoring");
  ok("…nor decides the split", !/weekPayouts\(/.test(close));
  ok("the standing writes nothing",
    !/db\.insert|db\.update|db\.delete|createPayout/.test(code("lib/week-standing.ts")));
}

console.log(`\n${pass} passed, ${fails.length} failed`);
if (fails.length) { fails.forEach((f) => console.log(`  - ${f}`)); process.exit(1); }
process.exit(0);
