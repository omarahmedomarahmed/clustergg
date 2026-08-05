// B38 — one gamer, one account, one challenge.
//
// Without this rule, one person occupies several podium places and takes prizes
// that were meant to spread. With it, multiple accounts stay a convenience
// rather than an advantage.
//
// Two people who happen to share a household are a different matter and not
// something we can see or should try to police. This is about **one Cluster
// account**, which is the only identity we actually know.
//
//   DEMO_DB=1 npx tsx tests/db/entry-rules.mts

process.env.DEMO_DB = "1";

let pass = 0;
const fails: string[] = [];
const ok = (name: string, cond: boolean, detail = "") => {
  if (cond) { pass++; console.log(`  ok   ${name}`); }
  else { fails.push(name); console.log(`  FAIL ${name}${detail ? ` — ${detail}` : ""}`); }
};
const eq = (name: string, got: unknown, want: unknown) =>
  ok(name, JSON.stringify(got) === JSON.stringify(want), `got ${JSON.stringify(got)}, want ${JSON.stringify(want)}`);

const { joinChallengeFor, switchChallengeAccount, switchOpen } = await import("../../lib/challenges.ts");
const { getDb, schema } = await import("../../lib/db/index.ts");
const { and, eq: sqlEq } = await import("drizzle-orm");
const { uid } = await import("../../lib/utils.ts");

const db = await getDb();
const DAY = 86400_000;
const [space] = await db.select({ id: schema.spaces.id, game: schema.spaces.game }).from(schema.spaces).limit(1);

const mkChallenge = async (startsIn: number) => {
  const id = uid();
  await db.insert(schema.challenges).values({
    id, spaceId: space.id, game: space.game, provider: "chesscom",
    title: `Entry ${id.slice(0, 6)}`,
    startAt: new Date(Date.now() + startsIn), endAt: new Date(Date.now() + startsIn + 7 * DAY),
    status: "active", visibility: "public",
  } as never);
  return id;
};
const mkGamer = async (tag: string, accounts: string[]) => {
  const id = uid();
  await db.insert(schema.users).values({
    id, slug: `er-${tag}-${id.slice(0, 6)}`, displayName: `ER ${tag}`,
    email: `${id}@test.invalid`, passwordHash: "x",
  } as never);
  const ids: string[] = [];
  for (const name of accounts) {
    const aid = uid();
    await db.insert(schema.linkedGameAccounts).values({
      id: aid, userId: id, provider: "chesscom",
      providerAccountId: `pa-${aid.slice(0, 8)}`, inGameName: name, verified: true,
    } as never);
    ids.push(aid);
  }
  return { id, accounts: ids };
};

console.log("== one account per gamer per challenge ==");
const future = await mkChallenge(2 * DAY);
const twoAccounts = await mkGamer("two", ["MainSmith", "SmurfSmith"]);
const first = await joinChallengeFor(twoAccounts.id, future, { linkedAccountId: twoAccounts.accounts[0] });
ok("the first account enters", first.ok === true && first.already === false, JSON.stringify(first));
eq("…as the account they chose", first.ok === true ? first.account : null, "MainSmith");

const second = await joinChallengeFor(twoAccounts.id, future, { linkedAccountId: twoAccounts.accounts[1] });
ok("a second account does not create a second entry", second.ok === true && second.already === true);
// The refusal has to NAME the account already entered, or a gamer who picked
// their smurf reasonably believes the smurf is the one being scored.
eq("…and names the account already entered", second.ok === true ? second.account : null, "MainSmith");
ok("…and says outright that a different account was asked for",
  second.ok === true && second.otherAccountRequested === true);

const rows = await db.select({ id: schema.challengeParticipants.id, acct: schema.challengeParticipants.linkedAccountId })
  .from(schema.challengeParticipants)
  .where(and(
    sqlEq(schema.challengeParticipants.challengeId, future),
    sqlEq(schema.challengeParticipants.userId, twoAccounts.id),
  ));
eq("exactly one entry exists in the database", rows.length, 1);
eq("…still on the first account", rows[0].acct, twoAccounts.accounts[0]);

console.log("\n== the other account is free elsewhere ==");
const other = await mkChallenge(2 * DAY);
const elsewhere = await joinChallengeFor(twoAccounts.id, other, { linkedAccountId: twoAccounts.accounts[1] });
ok("the same gamer may enter a DIFFERENT challenge on the other account",
  elsewhere.ok === true && elsewhere.already === false, JSON.stringify(elsewhere));
eq("…as that account", elsewhere.ok === true ? elsewhere.account : null, "SmurfSmith");

console.log("\n== switching, before the start only ==");
ok("the window is open before the start", switchOpen({ startAt: new Date(Date.now() + DAY) }));
ok("…and shut after it", !switchOpen({ startAt: new Date(Date.now() - DAY) }));
ok("the join result advertises the window", second.ok === true && second.switchable === true);

const sw = await switchChallengeAccount(twoAccounts.id, future, twoAccounts.accounts[1]);
ok("switching before the start is allowed", sw.ok === true, JSON.stringify(sw));
eq("…and moves the entry", sw.ok === true ? sw.account : null, "SmurfSmith");
const after = await db.select({ acct: schema.challengeParticipants.linkedAccountId, pts: schema.challengeParticipants.currentPoints })
  .from(schema.challengeParticipants)
  .where(and(
    sqlEq(schema.challengeParticipants.challengeId, future),
    sqlEq(schema.challengeParticipants.userId, twoAccounts.id),
  ));
eq("the database agrees", after[0].acct, twoAccounts.accounts[1]);
// A baseline carried over from the old account would score the new account's
// entire history as if it had happened this week.
eq("…and the score is re-baselined, not carried", after[0].pts, 0);
eq("still exactly one entry", after.length, 1);

const same = await switchChallengeAccount(twoAccounts.id, future, twoAccounts.accounts[1]);
ok("switching to the account already entered is refused as such",
  same.ok === false && same.reason === "same_account", JSON.stringify(same));

console.log("\n== after the start, the account is locked in ==");
const started = await mkChallenge(-DAY);   // began yesterday
const late = await mkGamer("late", ["LateMain", "LateAlt"]);
await joinChallengeFor(late.id, started, { linkedAccountId: late.accounts[0] });
const refused = await switchChallengeAccount(late.id, started, late.accounts[1]);
ok("switching after the start is refused", refused.ok === false && refused.reason === "started");
ok("…with the reason stated, not just a no",
  refused.ok === false && /keep the better score/.test(refused.message), refused.ok === false ? refused.message : "");
const stillFirst = await db.select({ acct: schema.challengeParticipants.linkedAccountId })
  .from(schema.challengeParticipants)
  .where(and(
    sqlEq(schema.challengeParticipants.challengeId, started),
    sqlEq(schema.challengeParticipants.userId, late.id),
  ));
eq("…and nothing moved", stillFirst[0].acct, late.accounts[0]);

console.log("\n== somebody else's account is not switchable to ==");
const stranger = await mkGamer("stranger", ["Stranger"]);
const theft = await switchChallengeAccount(twoAccounts.id, future, stranger.accounts[0]);
ok("you cannot switch onto an account that is not yours",
  theft.ok === false && theft.reason === "no_account", JSON.stringify(theft));

console.log("\n== two different gamers are unaffected ==");
const a = await mkGamer("a", ["PlayerA"]);
const b = await mkGamer("b", ["PlayerB"]);
const third = await mkChallenge(2 * DAY);
const ja = await joinChallengeFor(a.id, third);
const jb = await joinChallengeFor(b.id, third);
ok("both enter", ja.ok === true && ja.already === false && jb.ok === true && jb.already === false);
const both = await db.select({ id: schema.challengeParticipants.id })
  .from(schema.challengeParticipants)
  .where(sqlEq(schema.challengeParticipants.challengeId, third));
eq("…as two separate entries", both.length, 2);

console.log(`\n${pass} passed, ${fails.length} failed`);
if (fails.length) { fails.forEach((f) => console.log(`  - ${f}`)); process.exit(1); }
process.exit(0);
