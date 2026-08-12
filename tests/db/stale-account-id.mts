/**
 * A STALE PROVIDER ID HEALS ITSELF — BUT NEVER ON A PROVEN ACCOUNT.
 *
 * ===== WHAT HAPPENED =====
 *
 * Riot encrypts the ids it issues. The Riot API key was rotated from a
 * development key to the approved personal key, and every PUUID minted under
 * the old key stopped decrypting. Riot said so plainly:
 *
 *   400 Bad Request - Exception decrypting uhbeuYzf3fL319S5ZY4E2f73L3GH…
 *
 * All five League accounts in production went down the moment the key changed
 * and stayed down. Nothing retries its way out of that — the request is wrong,
 * not unlucky — and the Riot ID needed to mint a fresh PUUID was sitting in
 * `in_game_name` the whole time.
 *
 * ===== THE HAZARD THIS CARRIES, WHICH IS THE REAL SUBJECT HERE =====
 *
 * Re-resolving asks "who holds GameName#TAG *now*". Riot IDs can be changed,
 * and the abandoned one taken by somebody else. So on a renamed account, an
 * unconditional repair silently repoints our row — with its trophies, its
 * standings and its payouts — at a different human.
 *
 * That is only acceptable where the row never claimed to be a proven person.
 * A row with real ownership proof is left alone and marked for reconnection.
 *
 * Which is why the proven case is tested first and hardest: getting the repair
 * wrong costs a broken sync, and getting the guard wrong hands somebody else's
 * account away.
 *
 *   DEMO_DB=1 npx tsx tests/db/stale-account-id.mts
 */
process.env.DEMO_DB = "1";
// `syncAccount` refuses a provider whose key is unset and returns `needs_key`
// long before any of this code runs. Without this the suite reported 14 passes,
// three of which were green for the wrong reason — the proven-account block
// "passed" because nothing had been attempted at all, which is exactly the
// result it would give if the guard were deleted.
//
// Never used: every adapter method is stubbed below. It only has to exist.
process.env.RIOT_API_KEY = "RGAPI-test-0000-0000-0000-000000000000";

let pass = 0;
const fails: string[] = [];
const ok = (name: string, cond: boolean, detail = "") => {
  if (cond) { pass++; console.log(`  ok   ${name}`); }
  else { fails.push(name); console.log(`  FAIL ${name}${detail ? ` — ${detail}` : ""}`); }
};
const eq = <T,>(name: string, got: T, want: T) =>
  ok(name, got === want, `got ${JSON.stringify(got)}, want ${JSON.stringify(want)}`);

const { isStaleIdentifier, ADAPTERS } = await import("../../lib/providers/adapters.ts");
const { syncAccount } = await import("../../lib/sync.ts");
const { getDb, schema } = await import("../../lib/db/index.ts");
const { eq: sqlEq } = await import("drizzle-orm");

const db = await getDb();

console.log("== the signal is the sentence Riot actually sends ==");
{
  // Taken verbatim from production, prefix and all.
  const real = "Error: HTTP 400 from na1.api.riotgames.com — Bad Request - Exception decrypting uhbeuYzf3fL319S5ZY4E2f73L3GHGj_aFJZc8GOyKX_8YJhypVW8N_0951he1eTV3Rq76XpKHkDReQ";
  ok("the production error is recognised", isStaleIdentifier(real), real.slice(0, 60));

  // NARROW ON PURPOSE. Matching any 400 would re-resolve on every malformed
  // request, and re-resolving is the thing with an ownership hazard attached.
  ok("a plain 400 is NOT treated as stale",
    !isStaleIdentifier("Error: HTTP 400 from na1.api.riotgames.com"));
  ok("a 404 is not", !isStaleIdentifier("Error: HTTP 404 from na1.api.riotgames.com — Data not found"));
  ok("a rate limit is not", !isStaleIdentifier("Error: HTTP 429 from na1.api.riotgames.com"));
  ok("a 403 is not", !isStaleIdentifier("Error: HTTP 403 from na1.api.riotgames.com — Forbidden"));

  // And it only fires where a repair is possible at all.
  ok("Riot's adapter can re-identify", typeof ADAPTERS["riot-lol"].reidentify === "function");
  ok("…and VALORANT's too, sharing the one Riot account",
    typeof ADAPTERS["riot-valorant"].reidentify === "function");
  ok("a provider whose id cannot go stale has no repair path",
    ADAPTERS["chesscom"].reidentify === undefined,
    "Chess.com's account id IS the username");
}

// A linked account wired to a stubbed provider, so the whole path runs without
// a network or a key.
const USER = "s-stale-user-0001";
async function fixture(verifiedMethod: string, id = "old-encrypted-id") {
  await db.delete(schema.linkedGameAccounts).where(sqlEq(schema.linkedGameAccounts.userId, USER));
  await db.delete(schema.users).where(sqlEq(schema.users.id, USER));
  await db.insert(schema.users).values({
    id: USER, email: "stale@example.com", displayName: "Stale", slug: "stale-tester",
  });
  const accId = "acc-stale-0001";
  await db.insert(schema.linkedGameAccounts).values({
    id: accId, userId: USER, provider: "riot-lol",
    providerAccountId: id, inGameName: "Casper#NA23", region: "na1",
    verified: verifiedMethod !== "exists", verifiedMethod, syncStatus: "ok",
  });
  const [row] = await db.select().from(schema.linkedGameAccounts)
    .where(sqlEq(schema.linkedGameAccounts.id, accId)).limit(1);
  return row!;
}
const current = async (id: string) => (await db.select().from(schema.linkedGameAccounts)
  .where(sqlEq(schema.linkedGameAccounts.id, id)).limit(1))[0]!;

const STALE = "Error: HTTP 400 from na1.api.riotgames.com — Bad Request - Exception decrypting old-encrypted-id";
const real = { fetch: ADAPTERS["riot-lol"].fetchStats, reid: ADAPTERS["riot-lol"].reidentify };
/** Stub the adapter: fail on the old id, succeed on the new one. */
function stub(freshId: string | null, calls: { reid: number } = { reid: 0 }) {
  ADAPTERS["riot-lol"].fetchStats = async (a) =>
    a.providerAccountId === freshId
      ? { ok: true, metrics: { summoner_level: { value: 42 } } }
      : { ok: false, error: STALE };
  ADAPTERS["riot-lol"].reidentify = async () => { calls.reid++; return freshId; };
  return calls;
}
const restore = () => {
  ADAPTERS["riot-lol"].fetchStats = real.fetch;
  ADAPTERS["riot-lol"].reidentify = real.reid;
};

console.log("== an UNPROVEN account is repaired and retried ==");
{
  const acc = await fixture("exists");
  const calls = stub("fresh-puuid-abc");
  try {
    const res = await syncAccount(db, acc);
    ok("the sync ends up succeeding", res.ok, JSON.stringify(res));
    eq("re-identification was attempted exactly once", calls.reid, 1);
    const after = await current(acc.id);
    eq("the fresh id was stored", after.providerAccountId, "fresh-puuid-abc");
    eq("…and the account is healthy again", after.syncStatus, "ok");
  } finally { restore(); }
}

console.log("== A PROVEN ACCOUNT IS NEVER RE-POINTED ==");
{
  // The block that matters. "icon" is a real ownership proof — the gamer set a
  // profile icon we named. Re-resolving the Riot ID could hand this row to
  // whoever holds that name today.
  const acc = await fixture("icon");
  const calls = stub("fresh-puuid-abc");
  try {
    const res = await syncAccount(db, acc);
    ok("the sync does not silently succeed", !res.ok, JSON.stringify(res));
    eq("re-identification was NOT attempted", calls.reid, 0);
    const after = await current(acc.id);
    eq("the stored id is untouched", after.providerAccountId, "old-encrypted-id");
    eq("…and the gamer is asked to reconnect", after.syncStatus, "needs_reconnect");
    ok("…with a reason that explains itself", /re-verify/i.test(after.syncError ?? ""), after.syncError ?? "");
  } finally { restore(); }
}

console.log("== a repair that changes nothing is not written ==");
{
  // Riot returning the SAME id means the diagnosis was wrong. Writing it back
  // would record a repair that did not happen, and retrying would burn a call.
  const acc = await fixture("exists");
  // Its own stub rather than `stub()`: that helper succeeds when the id matches
  // the "fresh" one, so passing the CURRENT id made the very first fetch
  // succeed and the stale path never ran. The suite went green on two
  // assertions that had tested nothing.
  const calls = { reid: 0 };
  ADAPTERS["riot-lol"].fetchStats = async () => ({ ok: false, error: STALE });
  ADAPTERS["riot-lol"].reidentify = async () => { calls.reid++; return "old-encrypted-id"; };
  try {
    const res = await syncAccount(db, acc);
    ok("the sync still fails, honestly", !res.ok, JSON.stringify(res));
    eq("re-identification was tried", calls.reid, 1);
    const after = await current(acc.id);
    eq("the id is unchanged", after.providerAccountId, "old-encrypted-id");
    ok("…and the real error is kept", /Exception decrypting/.test(after.syncError ?? ""), after.syncError ?? "");
  } finally { restore(); }
}

console.log("== and one retry, never a loop ==");
{
  // The new id failing too is a real failure. It must land in the normal error
  // path rather than re-resolving again.
  const acc = await fixture("exists");
  const calls = stub("never-works");
  ADAPTERS["riot-lol"].fetchStats = async () => ({ ok: false, error: STALE });
  try {
    const res = await syncAccount(db, acc);
    ok("it gives up rather than spinning", !res.ok);
    eq("re-identification ran once, not repeatedly", calls.reid, 1);
    const after = await current(acc.id);
    eq("the account is left in error", after.syncStatus, "error");
  } finally { restore(); }
}

await db.delete(schema.linkedGameAccounts).where(sqlEq(schema.linkedGameAccounts.userId, USER));
await db.delete(schema.users).where(sqlEq(schema.users.id, USER));

console.log(`\n${pass} passed, ${fails.length} failed`);
if (fails.length) { for (const f of fails) console.log(`  - ${f}`); process.exit(1); }
