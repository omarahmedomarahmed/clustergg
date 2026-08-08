// B52 — the rule, written down so it is not re-litigated per incident.
//
//   Leaderboards are per-ACCOUNT. Challenge entry is per-GAMER.
//
// A ladder ranks accounts because that is what the GAME ranks. Two accounts of
// one person are two positions on that game's ladder, and hiding one would make
// our board disagree with the game's own — which is the one thing a ladder
// cannot do and remain a ladder.
//
// A challenge is a prize pool, and a prize pool ranks people, because one person
// taking two podium places takes a prize meant to spread (B38).
//
// Different questions, different right answers. Neither is a bug in the other,
// and this file exists so that a future reader finding "the same gamer twice"
// has somewhere to look before deciding it is a duplicate and fixing it.
//
//   DEMO_DB=1 npx tsx tests/db/planet-explore.mts

process.env.DEMO_DB = "1";

let pass = 0;
const fails: string[] = [];
const ok = (name: string, cond: boolean, detail = "") => {
  if (cond) { pass++; console.log(`  ok   ${name}`); }
  else { fails.push(name); console.log(`  FAIL ${name}${detail ? ` — ${detail}` : ""}`); }
};
const eq = (name: string, got: unknown, want: unknown) =>
  ok(name, JSON.stringify(got) === JSON.stringify(want), `got ${JSON.stringify(got)}, want ${JSON.stringify(want)}`);

const { getPlanetExplore } = await import("../../lib/planet-explore.ts");
const { joinChallengeFor } = await import("../../lib/challenges.ts");
const { getDb, schema } = await import("../../lib/db/index.ts");
const { eq: sqlEq, and } = await import("drizzle-orm");
const { uid } = await import("../../lib/utils.ts");
const { PROVIDERS } = await import("../../lib/providers/registry.ts");

const db = await getDb();
const tag = uid().slice(0, 6);

// A planet whose game we have a provider for AND an active board on.
//
// Both, not either: a game with a provider but no board renders no ladder at
// all, so a suite that picked one would assert "zero rows" and pass while
// proving nothing. The first attempt did exactly that on VALORANT.
const spaces = await db.select().from(schema.spaces);
const boards = await db.select().from(schema.leaderboards)
  .where(sqlEq(schema.leaderboards.isActive, true));
const boardGames = new Set(boards.map((b) => b.game));
const planet = spaces.find((s) =>
  s.game && boardGames.has(s.game) && PROVIDERS.some((p) => p.game === s.game));
ok("the demo has a planet with a connected game AND a live ladder", !!planet,
  JSON.stringify({ spaces: spaces.map((s) => s.game), boards: [...boardGames] }));
if (!planet) { console.log("\ncannot continue without one"); process.exit(1); }
const game = planet.game!;
const provider = PROVIDERS.find((p) => p.game === game)!;
const board = boards.find((b) => b.game === game)!;
ok(`"${game}" has an active leaderboard`, !!board);

// ONE gamer, TWO accounts on that game. This is the shape the whole item is
// about, and it is the shape somebody will one day call a duplicate.
const userId = uid();
const slug = `pe-${tag}`;
await db.insert(schema.users).values({
  id: userId, slug, displayName: `Planet Explorer ${tag}`,
  email: `${userId}@test.invalid`, passwordHash: "x", ageBand: "adult", status: "active",
} as never);

const mkAccount = async (ign: string) => {
  const id = uid();
  await db.insert(schema.linkedGameAccounts).values({
    id, userId, provider: provider.id, providerAccountId: `pa-${id.slice(0, 8)}`,
    inGameName: ign, verified: true,
  } as never);
  return id;
};
const main = await mkAccount(`Main${tag}`);
const smurf = await mkAccount(`Smurf${tag}`);

// Give both a ranked value on the board so both are on the ladder.
if (board) {
  for (const [i, acct] of [main, smurf].entries()) {
    await db.insert(schema.statCurrent).values({
      id: uid(), linkedAccountId: acct, game, metricKey: board.metricKey,
      metricValue: 900_000 - i, rankLabel: null,
    } as never).onConflictDoNothing();
  }
}

console.log("\n== a gamer with two accounts appears TWICE ==");
const explore = await getPlanetExplore(db, planet.slug);
ok("the planet resolves", !!explore);
const rows = (explore?.boards ?? []).flatMap((b) => b.entries).filter((e) => e.slug === slug);
eq("two rows, one per account", rows.length, 2);
ok("…and they are different accounts",
  new Set(rows.map((r) => r.accountId)).size === 2, JSON.stringify(rows.map((r) => r.accountId)));

console.log("\n== each row is the name the GAME knows them by ==");
eq("both in-game names present",
  rows.map((r) => r.ign).sort(), [`Main${tag}`, `Smurf${tag}`]);
ok("…and NOT the Cluster display name",
  rows.every((r) => r.ign !== r.name), JSON.stringify(rows.map((r) => [r.ign, r.name])));

console.log("\n== the Cluster identity is still carried, for the reveal ==");
ok("every row knows the profile it belongs to",
  rows.every((r) => r.slug === slug && !!r.name), JSON.stringify(rows.map((r) => r.slug)));
// "Linkable" means /u/<slug> resolves to a real profile — checked against the
// database, not against a regex, which the first version did and which only
// ever tested the shape of this file's own fixture.
const [resolved] = await db.select({ id: schema.users.id })
  .from(schema.users).where(sqlEq(schema.users.slug, rows[0]?.slug ?? "")).limit(1);
eq("…and /u/<slug> resolves to that gamer", resolved?.id, userId);

console.log("\n== a challenge on the same game admits the gamer ONCE ==");
// The other half of the rule, and the one that costs money if it is wrong.
const challengeId = uid();
await db.insert(schema.challenges).values({
  id: challengeId, spaceId: planet.id, game, provider: provider.id,
  title: `Explore rule ${tag}`,
  startAt: new Date(Date.now() + 86400_000), endAt: new Date(Date.now() + 5 * 86400_000),
  status: "active", visibility: "public",
} as never);

const first = await joinChallengeFor(userId, challengeId, { linkedAccountId: main });
ok("the first account gets in", first.ok !== false, JSON.stringify(first));
const second = await joinChallengeFor(userId, challengeId, { linkedAccountId: smurf });
const entries = await db.select().from(schema.challengeParticipants)
  .where(and(sqlEq(schema.challengeParticipants.challengeId, challengeId),
    sqlEq(schema.challengeParticipants.userId, userId)));
eq("ONE entry, whatever the second attempt did", entries.length, 1);
ok("…and the second attempt did not silently create a duplicate",
  entries.length === 1, JSON.stringify(second));

console.log("\n== the two rules coexist on the same data ==");
// The point of writing this down: the exact same gamer, the same game, the same
// two accounts — two ladder rows and one challenge entry, at the same time.
const after = await getPlanetExplore(db, planet.slug);
const stillTwo = (after?.boards ?? []).flatMap((b) => b.entries).filter((e) => e.slug === slug);
eq("still two on the ladder", stillTwo.length, 2);
eq("…and still one in the prize pool", entries.length, 1);

console.log("\n== the ladder is bounded ==");
// Read caps, so a planet with fifty thousand accounts does not read all of them
// to render fifteen rows (B55.6).
const { EXPLORE_ACCOUNT_CAP, EXPLORE_STAT_CAP } = await import("../../lib/planet-explore.ts");
ok("accounts are capped", EXPLORE_ACCOUNT_CAP > 0 && EXPLORE_ACCOUNT_CAP <= 5000, String(EXPLORE_ACCOUNT_CAP));
ok("stats are capped", EXPLORE_STAT_CAP > 0 && EXPLORE_STAT_CAP <= 10000, String(EXPLORE_STAT_CAP));
ok("every board shows at most fifteen",
  (after?.boards ?? []).every((b) => b.entries.length <= 15),
  JSON.stringify((after?.boards ?? []).map((b) => b.entries.length)));

console.log(`\n${pass} passed, ${fails.length} failed`);
if (fails.length) { fails.forEach((f) => console.log(`  - ${f}`)); process.exit(1); }
process.exit(0);
