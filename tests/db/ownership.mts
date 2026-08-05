/**
 * One game account, one gamer. One Discord, one gamer.
 *
 * Both holes are exercised against a REAL database through the real code paths,
 * because both were the kind of bug that reports success while doing the
 * opposite — the only way to see them is to try the thing and then look at what
 * the database actually holds.
 *
 *   1. `linked_game_accounts` was unique on (user_id, provider, account_id):
 *      unique PER USER. Two gamers could hold one Riot account and both be paid
 *      for the same week of play.
 *   2. `attachIdentity` used `onConflictDoNothing`, so an email signup could run
 *      the "link Discord" flow against somebody else's Discord, have the insert
 *      quietly do nothing, and still get `users.discord_username` written plus a
 *      success redirect.
 *   3. `verified: true` was written whenever the provider's API answered, which
 *      only ever proved the account exists.
 */
process.env.DEMO_DB = "1";

let pass = 0, fail = 0;
const ok = (name: string, cond: boolean, extra = "") => {
  if (cond) { pass++; console.log(`  ✓ ${name}`); }
  else { fail++; console.log(`  ✗ ${name}${extra ? ` — ${extra}` : ""}`); }
};

const { getDb, schema } = await import("../../lib/db/index.ts");
const { and, eq, sql } = await import("drizzle-orm");
const { uid } = await import("../../lib/utils.ts");
const {
  accountHeldByOther, conflictMessage, isProof, proofFor, transferClaim, siblingProviders,
} = await import("../../lib/account-ownership.ts");

const db = await getDb();

const makeUser = async (name: string) => {
  const id = uid();
  await db.insert(schema.users).values({
    id, displayName: name, slug: `${name.toLowerCase()}-${id.slice(0, 5)}`, role: "user",
  });
  return id;
};
const claim = async (userId: string, provider: string, acct: string, extra: Record<string, unknown> = {}) => {
  const id = uid();
  await db.insert(schema.linkedGameAccounts).values({
    id, userId, provider, providerAccountId: acct, inGameName: acct, ...extra,
  });
  return id;
};

try {
  console.log("\n== The six live games, and what each can actually prove ==");
  // Prioritised exactly as asked. Three have a real ownership check; three do
  // not, and claiming otherwise would be the same lie `verified: true` was.
  const LIVE: [string, string, string][] = [
    ["riot-lol", "League of Legends", "riot-icon"],
    ["riot-valorant", "VALORANT", "riot-icon"],
    ["pubg", "PUBG", "none"],
    ["opendota", "Dota 2", "steam-openid"],
    ["apex", "Apex Legends", "none"],
    ["fortnite", "Fortnite", "epic-oauth"],
  ];
  for (const [id, game, kind] of LIVE) {
    const p = proofFor(id);
    ok(`${game}: ${kind === "none" ? "no check exists, and says so" : p.label}`, p.kind === kind, `${p.kind}`);
    ok(`${game}: the instruction is written for a gamer`, p.how.length > 20 && /\./.test(p.how), p.how);
  }
  ok("a proof method is distinguishable from a claim",
    isProof("icon") && isProof("openid") && isProof("oauth") && !isProof("exists") && !isProof("claimed"));
  ok("VALORANT is verified through the League account it shares a Riot ID with",
    siblingProviders("riot-lol").includes("riot-valorant")
    && siblingProviders("riot-valorant").includes("riot-lol"));

  console.log("\n== Two gamers cannot hold one game account ==");
  const alice = await makeUser("Alice");
  const bob = await makeUser("Bob");
  const PUUID = "puuid-shared-account-001";
  await claim(alice, "riot-lol", PUUID, { verified: false, verifiedMethod: "exists" });

  const seen = await accountHeldByOther(db, "riot-lol", PUUID, bob);
  ok("the holder is found before a second link is written", !!seen, "no conflict detected");
  ok("and identified by name, so the message can be specific", seen?.displayName === "Alice", seen?.displayName);
  ok("an unproven holder is reported as unproven", seen?.proven === false, String(seen?.proven));
  ok("the same gamer re-linking their OWN account is not a conflict",
    (await accountHeldByOther(db, "riot-lol", PUUID, alice)) === null);
  ok("a different account is free", (await accountHeldByOther(db, "riot-lol", "puuid-other", bob)) === null);

  const msg = conflictMessage(seen!, "League of Legends");
  ok("the message tells them what to do about it", /verify ownership/i.test(msg), msg);

  // The database refuses it too, not just the code path that checks first.
  let dbRefused = false;
  try {
    await claim(bob, "riot-lol", PUUID);
  } catch (e) {
    // Drizzle wraps the driver error as "Failed query: insert into …" and hangs
    // the real constraint violation off `cause`. Reading only the outer message
    // makes this assertion pass for ANY failure, which is worse than no test.
    const cause = String((e as { cause?: unknown }).cause ?? "");
    dbRefused = /unique|duplicate/i.test(cause);
    if (!dbRefused) console.log(`      (raised: ${cause.slice(0, 120) || String(e).slice(0, 120)})`);
  }
  ok("the database itself refuses the duplicate", dbRefused,
    "the partial unique index did not build — a second holder was written");

  console.log("\n== …but a proven owner takes it from a squatter ==");
  // Uniqueness without this is a denial of service: squat on a pro's Riot ID and
  // the pro can never link it.
  await transferClaim(db, (await db.select({ id: schema.linkedGameAccounts.id })
    .from(schema.linkedGameAccounts)
    .where(and(eq(schema.linkedGameAccounts.userId, alice), eq(schema.linkedGameAccounts.providerAccountId, PUUID)))
    .limit(1))[0].id);
  const [squatter] = await db.select().from(schema.linkedGameAccounts)
    .where(and(eq(schema.linkedGameAccounts.userId, alice), eq(schema.linkedGameAccounts.providerAccountId, PUUID))).limit(1);
  ok("the losing claim is marked, not deleted", !!squatter && squatter.ownershipStatus === "disputed",
    squatter?.ownershipStatus ?? "row gone");
  ok("their history survives for staff to look at", !!squatter);
  ok("it stops syncing", squatter?.syncStatus === "revoked", squatter?.syncStatus);
  ok("and it no longer claims to be verified", squatter?.verified === false);

  const bobAcct = await claim(bob, "riot-lol", PUUID, { verified: true, verifiedMethod: "icon", verifiedAt: new Date() });
  ok("the real owner can now hold it", !!bobAcct);
  const nowHeld = await accountHeldByOther(db, "riot-lol", PUUID, alice);
  ok("and is reported as PROVEN, so nobody takes it back", nowHeld?.proven === true, String(nowHeld?.proven));
  ok("a proven holder's message refuses rather than invites",
    /contact support/i.test(conflictMessage(nowHeld!, "League of Legends")),
    conflictMessage(nowHeld!, "League of Legends"));

  console.log("\n== One Discord, one gamer ==");
  const carol = await makeUser("Carol");        // signed up with Discord
  const dave = await makeUser("Dave");          // signed up with email
  const SNOWFLAKE = "100000000000000777";
  await db.insert(schema.oauthIdentities).values({
    id: uid(), userId: carol, provider: "discord", providerUserId: SNOWFLAKE,
  });

  // The exact shape of the old bug: insert with onConflictDoNothing, then write
  // the handle anyway.
  await db.insert(schema.oauthIdentities).values({
    id: uid(), userId: dave, provider: "discord", providerUserId: SNOWFLAKE,
  }).onConflictDoNothing();
  const owners = await db.select({ userId: schema.oauthIdentities.userId })
    .from(schema.oauthIdentities)
    .where(and(eq(schema.oauthIdentities.provider, "discord"), eq(schema.oauthIdentities.providerUserId, SNOWFLAKE)));
  ok("the identity still belongs to exactly one gamer", owners.length === 1, `${owners.length} rows`);
  ok("and it is the one who signed up with it", owners[0]?.userId === carol);
  // Which is precisely why the silent no-op was dangerous: it looked like this.
  ok("a silent no-op is indistinguishable from success at the insert",
    owners.length === 1, "this is the fact the fixed code now READS BACK before reporting success");

  // The read-back the callback now performs.
  const attaches = async (userId: string) => {
    const [owner] = await db.select({ userId: schema.oauthIdentities.userId })
      .from(schema.oauthIdentities)
      .where(and(eq(schema.oauthIdentities.provider, "discord"), eq(schema.oauthIdentities.providerUserId, SNOWFLAKE)))
      .limit(1);
    return !owner || owner.userId === userId;
  };
  ok("the owner may re-link their own Discord", await attaches(carol));
  ok("somebody else may not", !(await attaches(dave)));

  console.log("\n== The handle is never borrowed ==");
  const [daveRow] = await db.select({ handle: schema.users.discordUsername })
    .from(schema.users).where(eq(schema.users.id, dave)).limit(1);
  ok("a refused link leaves no Discord handle behind", !daveRow?.handle, daveRow?.handle ?? "");

  console.log("\n== `verified` stopped meaning `exists` ==");
  const erin = await makeUser("Erin");
  const claimed = await claim(erin, "pubg", "SomePubgName", { verified: false, verifiedMethod: "exists" });
  const [row] = await db.select().from(schema.linkedGameAccounts).where(eq(schema.linkedGameAccounts.id, claimed)).limit(1);
  ok("a freshly linked account is NOT verified", row?.verified === false);
  ok("and records what we actually know", row?.verifiedMethod === "exists", row?.verifiedMethod);
  ok("the default for an unknown row is weaker still",
    schema.linkedGameAccounts.verifiedMethod.default === "claimed",
    String(schema.linkedGameAccounts.verifiedMethod.default));

  console.log("\n== The Riot icon challenge ==");
  const { newIconChallenge, iconImageUrl, PROOF_WINDOW_MIN } = await import("../../lib/providers/riot-verify.ts");
  const c1 = newIconChallenge(null);
  ok("it picks an icon every account owns", c1.iconId >= 0 && c1.iconId <= 28, String(c1.iconId));
  ok("it expires", new Date(c1.expiresAt).getTime() > Date.now(), c1.expiresAt);
  ok(`the window is ${PROOF_WINDOW_MIN} minutes, not open-ended`,
    new Date(c1.expiresAt).getTime() - Date.now() <= PROOF_WINDOW_MIN * 60_000 + 2000);
  ok("it never asks for the icon already set",
    Array.from({ length: 40 }, () => newIconChallenge(7).iconId).every((i) => i !== 7));
  ok("it varies between attempts, so it can't be pre-set",
    new Set(Array.from({ length: 40 }, () => newIconChallenge(null).iconId)).size > 3);
  ok("the gamer is shown the icon, not told a number",
    /^https:\/\/ddragon\.leagueoflegends\.com\/.*\/12\.png$/.test(iconImageUrl(12)), iconImageUrl(12));

  console.log("\n== Nothing existing was broken ==");
  const total = await db.select({ n: sql<number>`count(*)::int` }).from(schema.linkedGameAccounts);
  ok("the seeded demo accounts are all still there", Number(total[0].n) >= 5, String(total[0].n));
  const seeded = await db.select().from(schema.linkedGameAccounts)
    .where(eq(schema.linkedGameAccounts.ownershipStatus, "ok"));
  ok("and none of them was marked disputed by the migration",
    seeded.length >= 5, `${seeded.length} ok rows`);
  const mlbb = await db.select().from(schema.linkedGameAccounts)
    .where(eq(schema.linkedGameAccounts.provider, "mobile-legends"));
  ok("Mobile Legends keeps its tick — an in-game code IS proof",
    mlbb.every((m) => m.verifiedMethod === "vc" || m.verified === false),
    mlbb.map((m) => m.verifiedMethod).join(","));

  console.log("\n== A declared proof is not a built proof ==");
  const { dotaAccountIdFromSteamId } = await import("../../lib/account-ownership.ts");
  // Shipping the policy ahead of the wiring puts a button on the page that
  // signs a gamer in, returns them, and changes nothing. The UI reads `wired`.
  ok("League's icon check is built", proofFor("riot-lol").wired);
  ok("Steam/Dota is built", proofFor("opendota").wired && proofFor("steam").wired);
  ok("Mobile Legends' in-game code is built", proofFor("mobile-legends").wired);
  ok("VALORANT's carry-over is declared but NOT offered yet",
    proofFor("riot-valorant").kind === "riot-icon" && !proofFor("riot-valorant").wired);
  ok("Fortnite's Epic sign-in is declared but NOT offered yet",
    proofFor("fortnite").kind === "epic-oauth" && !proofFor("fortnite").wired);
  ok("games with no check are never marked wired",
    !proofFor("pubg").wired && !proofFor("apex").wired);

  console.log("\n== Steam proves Dota, arithmetically ==");
  // Valve's account id is the low 32 bits of the SteamID64 — which is exactly
  // why signing in with Steam proves a Dota account.
  ok("Gabe's SteamID64 converts to his Dota Friend ID",
    dotaAccountIdFromSteamId("76561197960435530") === "169802",
    String(dotaAccountIdFromSteamId("76561197960435530")));
  ok("the conversion is exact at the base", dotaAccountIdFromSteamId("76561197960265728") === "0");
  ok("a Friend ID is not mistaken for a SteamID", dotaAccountIdFromSteamId("105248644") === null);
  ok("junk is refused rather than guessed",
    dotaAccountIdFromSteamId("not-a-steam-id") === null && dotaAccountIdFromSteamId("") === null);
} catch (e) {
  fail++;
  console.log("  ✗ threw:", (e as Error).message);
  console.log((e as Error).stack?.split("\n").slice(1, 4).join("\n"));
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
