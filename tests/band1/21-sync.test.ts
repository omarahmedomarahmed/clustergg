// Stage 2 — the sync engine.
//
// Exercised against a fake adapter installed into the real `ADAPTERS` table,
// so `syncAccount` runs its actual code path: provider lookup, liveness check,
// stale-identifier repair, the proven-account guard, error backoff, and the
// season-rollover detection added on arrival. Nothing here touches a publisher
// API — a test that needs the internet is a test that gets skipped.

import { ok, eq, no } from "../helpers/assert.ts";
import { test } from "../helpers/suite.ts";
import { resetDemoDb, schema, type DB } from "../../lib/db/index.ts";
import { createGamer } from "../../lib/identity/gamers.ts";
import { linkAccount } from "../../lib/identity/accounts.ts";
import {
  syncAccount,
  syncDueAccounts,
  latestObservations,
  providersDown,
} from "../../lib/core/sync.ts";
import { ADAPTERS, type StatsResult } from "../../lib/providers/adapters.ts";
import { PROVIDERS } from "../../lib/providers/registry.ts";
import { eq as sqlEq } from "drizzle-orm";

// ── A provider that exists only for this suite. Registered in the real
//    registry and the real adapter table, so the code under test cannot tell
//    it apart from Chess.com.
const FAKE = "test-provider";

if (!PROVIDERS.some((p) => p.id === FAKE)) {
  PROVIDERS.push({
    id: FAKE,
    name: "Test Provider",
    game: "Test Game",
    glyph: "◆",
    color: "#888888",
    authType: "public",
    envVars: [],
    identifierLabel: "Test name",
    phase: 1,
    capabilities: [
      { key: "wins", label: "Wins", higherIsBetter: true },
      { key: "matches", label: "Matches", higherIsBetter: true },
      { key: "tier", label: "Tier", higherIsBetter: true, ranks: [{ value: 0, label: "Bronze" }] },
    ],
  });
}

/** What the fake adapter will answer next, and what it was asked. */
const fake = {
  next: null as StatsResult | null,
  queue: undefined as string | undefined,
  rich: undefined as boolean | undefined,
  reidentifyTo: null as string | null,
  reidentifyCalls: 0,
};

ADAPTERS[FAKE] = {
  async verify() {
    return { ok: true as const, accountId: "acct-1", name: "Tester" };
  },
  async reidentify() {
    fake.reidentifyCalls++;
    return fake.reidentifyTo;
  },
  async fetchStats(a) {
    fake.queue = a.queue;
    fake.rich = a.rich;
    return fake.next ?? { ok: false as const, error: "nothing staged" };
  },
};

function stats(metrics: Record<string, number>): StatsResult {
  return {
    ok: true,
    metrics: Object.fromEntries(Object.entries(metrics).map(([k, v]) => [k, { value: v }])),
  };
}

async function anAccount(
  db: DB,
  opts: { verifiedMethod?: "claimed" | "icon"; providerAccountId?: string } = {},
) {
  const userId = await createGamer(db, { displayName: `Tester ${Math.random()}` });
  const { id } = await linkAccount(db, {
    userId,
    provider: FAKE,
    providerAccountId: opts.providerAccountId ?? `acct-${Math.random()}`,
    inGameName: "Tester",
    verifiedMethod: opts.verifiedMethod ?? "claimed",
  });
  const [row] = await db
    .select()
    .from(schema.linkedGameAccounts)
    .where(sqlEq(schema.linkedGameAccounts.id, id));
  return row;
}

test("a successful sync appends observations and derives the latest value", async () => {
  const db = await resetDemoDb();
  const account = await anAccount(db);

  fake.next = stats({ wins: 10, matches: 25 });
  const first = await syncAccount(db, account);
  ok(first.ok, "the sync succeeded");

  fake.next = stats({ wins: 13, matches: 31 });
  await syncAccount(db, account);

  const rows = await db
    .select()
    .from(schema.observations)
    .where(sqlEq(schema.observations.linkedAccountId, account.id));
  eq(rows.length, 4, "every reading is appended — two syncs, two metrics");

  const latest = await latestObservations(db, account.id);
  eq(latest, { wins: 13, matches: 31 }, "and the current value is the latest row, not a column");
});

test("an unchanged value is still recorded, so the series has no gaps", async () => {
  const db = await resetDemoDb();
  const account = await anAccount(db);
  fake.next = stats({ wins: 7 });
  await syncAccount(db, account);
  await syncAccount(db, account);
  const rows = await db
    .select()
    .from(schema.observations)
    .where(sqlEq(schema.observations.linkedAccountId, account.id));
  eq(rows.length, 2, "a series with gaps cannot answer what a value was on Tuesday");
});

test("a season reset re-baselines instead of zeroing a week", async () => {
  const db = await resetDemoDb();
  const account = await anAccount(db);

  fake.next = stats({ wins: 140, matches: 300 });
  await syncAccount(db, account);

  // Riot zeroes `wins` at a split. The naive handling — clamp the delta at
  // zero — reads as a bad week forever and silently costs every League player
  // their progress, every split.
  fake.next = stats({ wins: 2, matches: 5 });
  const after = await syncAccount(db, account);

  ok(after.ok, "the sync still succeeds — a reset is not an error");
  eq(after.seasonResets?.sort(), ["matches", "wins"], "and both counters are reported as reset");

  const resets = await db
    .select()
    .from(schema.seasonResets)
    .where(sqlEq(schema.seasonResets.linkedAccountId, account.id));
  eq(resets.length, 2, "each reset is a row, so a gamer can be told why their points moved");
  const wins = resets.find((r) => r.metricKey === "wins");
  eq(wins?.previousValue, 140, "the row records what it was");
  eq(wins?.newValue, 2, "and what it became");
});

test("a rank going down is a bad week, not a season reset", async () => {
  const db = await resetDemoDb();
  const account = await anAccount(db);

  fake.next = stats({ tier: 1200 });
  await syncAccount(db, account);
  fake.next = stats({ tier: 1100 });
  const after = await syncAccount(db, account);

  eq(after.seasonResets, undefined, "a demotion is real and must not be erased");
  const resets = await db.select().from(schema.seasonResets);
  eq(resets.length, 0, "so nothing was recorded as a reset");
});

test("a proven account is never silently re-pointed after a key change", async () => {
  const db = await resetDemoDb();
  const account = await anAccount(db, { verifiedMethod: "icon" });

  fake.reidentifyCalls = 0;
  fake.reidentifyTo = "somebody-elses-account";
  fake.next = { ok: false, error: "400 Bad Request - Exception decrypting abc" };

  const result = await syncAccount(db, account);
  no(result.ok, "the sync fails rather than healing");
  eq(fake.reidentifyCalls, 0, "and re-resolution was never even attempted");

  const [row] = await db
    .select()
    .from(schema.linkedGameAccounts)
    .where(sqlEq(schema.linkedGameAccounts.id, account.id));
  eq(row.providerAccountId, account.providerAccountId, "the id is untouched");
  eq(row.syncStatus, "needs_reconnect", "and the gamer is asked to re-prove it");
  ok(
    /re-point a proven account/.test(row.syncError ?? ""),
    "with a reason that says why we will not do it for them",
  );
});

test("an unproven account heals itself, once", async () => {
  const db = await resetDemoDb();
  const account = await anAccount(db, { verifiedMethod: "claimed" });

  fake.reidentifyCalls = 0;
  fake.reidentifyTo = "fresh-id";
  let call = 0;
  ADAPTERS[FAKE].fetchStats = async (a) => {
    call++;
    if (call === 1) return { ok: false, error: "400 Bad Request - Exception decrypting abc" };
    return a.providerAccountId === "fresh-id"
      ? stats({ wins: 5 })
      : { ok: false, error: "still wrong" };
  };

  const result = await syncAccount(db, account);
  ok(result.ok, "the retry from the fresh id succeeded");
  eq(fake.reidentifyCalls, 1, "re-resolution ran once, not in a loop");

  const [row] = await db
    .select()
    .from(schema.linkedGameAccounts)
    .where(sqlEq(schema.linkedGameAccounts.id, account.id));
  eq(row.providerAccountId, "fresh-id", "and the repaired id was written");

  // Restore the shared fake for the suites after this one.
  ADAPTERS[FAKE].fetchStats = async (a) => {
    fake.queue = a.queue;
    fake.rich = a.rich;
    return fake.next ?? { ok: false as const, error: "nothing staged" };
  };
});

test("a failure preserves what was already observed", async () => {
  const db = await resetDemoDb();
  const account = await anAccount(db);

  fake.next = stats({ wins: 42 });
  await syncAccount(db, account);

  fake.next = { ok: false, error: "503 provider is having a day" };
  await syncAccount(db, account);

  const latest = await latestObservations(db, account.id);
  eq(latest, { wins: 42 }, "a gamer keeps their standing while a provider is down");

  const [row] = await db
    .select()
    .from(schema.linkedGameAccounts)
    .where(sqlEq(schema.linkedGameAccounts.id, account.id));
  eq(row.syncStatus, "error", "the account is flagged");
  ok(row.nextSyncAt !== null, "and backed off rather than hammered");
});

test("a rate limit is told apart from a failure", async () => {
  const db = await resetDemoDb();
  const account = await anAccount(db);
  fake.next = { ok: false, error: "429 Too Many Requests" };
  await syncAccount(db, account);
  const [row] = await db
    .select()
    .from(schema.linkedGameAccounts)
    .where(sqlEq(schema.linkedGameAccounts.id, account.id));
  eq(row.syncStatus, "rate_limited", "because the fix for one is not the fix for the other");
});

test("the hourly sync does not spend the tight endpoint", async () => {
  const db = await resetDemoDb();
  const account = await anAccount(db);
  fake.next = stats({ wins: 1 });
  fake.rich = true;
  await syncAccount(db, account);
  // `summoner-v4 by-puuid` is 1,600/minute — seventy times tighter than its
  // neighbours. docs/11: never put it on a hot path. The hourly sync is the
  // hot path by definition.
  eq(fake.rich, undefined, "a routine sync does not ask for the expensive extras");

  await syncAccount(db, account, { rich: true });
  eq(fake.rich, true, "while linking and reconnecting still can");
});

test("the queue travels with the request, not with the account", async () => {
  const db = await resetDemoDb();
  const account = await anAccount(db);
  fake.next = stats({ wins: 1 });

  await syncAccount(db, account, { queue: "flex" });
  eq(fake.queue, "flex", "a flex challenge reads flex");

  await syncAccount(db, account, { queue: "both" });
  eq(fake.queue, "both", "and a both challenge reads both");
});

test("sync health is per provider, and a whole provider down is the signal", () => {
  // Not a failure-count threshold: that number gets tuned upwards the first
  // time it pages somebody at a weekend, and it never comes back down.
  const report = providersDown([
    { provider: "riot-lol", synced: 0, failed: 40, down: true, lastError: "401" },
    { provider: "chesscom", synced: 97, failed: 3, down: false },
  ]);
  eq(report.length, 1, "one provider is down");
  eq(report[0].provider, "riot-lol", "and it is the one where everything failed");
});

test("a batch run reports per provider and does not stop at the first failure", async () => {
  const db = await resetDemoDb();
  const a = await anAccount(db);
  const b = await anAccount(db);
  void a;
  void b;

  fake.next = { ok: false, error: "401 Unauthorized — key expired" };
  const run = await syncDueAccounts(db);

  eq(run.synced, 0, "nothing synced");
  eq(run.failed, 2, "both accounts were attempted — one failure did not abandon the rest");
  eq(run.down, [FAKE], "and the report names the provider that is entirely down");
  ok(
    /401/.test(run.byProvider[0].lastError ?? ""),
    "carrying the reason, so the report says what to do about it",
  );
});
