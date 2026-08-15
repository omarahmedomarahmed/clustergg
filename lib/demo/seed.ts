// Seed the demo database so a human — and the browser band — can click
// through a platform mid-week with real numbers in it.
//
// This writes to the in-process PGlite database, which lives for the lifetime
// of the server process. It refuses to run against anything else: a seeder
// that could reach a real database is one environment variable away from
// doing it.

import { resetDemoDb, schema, isDemoMode } from "../db/index.ts";
import { createGamer, setAgeBand, setCountry } from "../identity/gamers.ts";
import { linkAccount } from "../identity/accounts.ts";
import { signUpBrand, confirmAndPay, onInvoicePaid } from "../portal/brand.ts";
import { createTrophy } from "../trophies/trophies.ts";
import { announce } from "../challenges/lifecycle.ts";
import { enterChallenge } from "../challenges/entry.ts";
import { stampBaselinesAtGun } from "../challenges/jobs.ts";
import { forceSync } from "../core/sync.ts";
import { snapshotGuilds } from "../pool/score.ts";
import { allocateToPool, maxAllocationCents } from "../money/pool.ts";
import { balanceOf } from "../money/ledger.ts";
import { buildCommunityChallenge, payCommunityChallenge } from "../portal/owner.ts";
import { weekStartFor } from "../challenges/week.ts";
import { CHALLENGE_PRICE_CENTS, splitOf } from "../money/amounts.ts";
import { ADAPTERS, type StatsResult } from "../providers/adapters.ts";
import { PROVIDERS, type ProviderDef } from "../providers/registry.ts";
import { uid } from "../core/utils.ts";
import { eq } from "drizzle-orm";

if (!isDemoMode) throw new Error("The seeder is demo-mode only.");

const SIM = "demo-provider";
if (!PROVIDERS.some((p: ProviderDef) => p.id === SIM)) {
  PROVIDERS.push({
    id: SIM,
    name: "Apex Legends",
    game: "Apex Legends",
    glyph: "◆",
    color: "#da292a",
    authType: "public",
    envVars: [],
    identifierLabel: "Origin name",
    phase: 1,
    capabilities: [
      { key: "wins", label: "Wins", higherIsBetter: true },
      { key: "matches", label: "Matches", higherIsBetter: true },
    ],
  });
}

const stats = new Map<string, { wins: number; matches: number }>();
ADAPTERS[SIM] = {
  async verify() {
    return { ok: true as const, accountId: "a", name: "n" };
  },
  async fetchStats(a): Promise<StatsResult> {
    const s = stats.get(a.providerAccountId) ?? { wins: 0, matches: 0 };
    return { ok: true, metrics: { wins: { value: s.wins }, matches: { value: s.matches } } };
  },
};

/**
 * The demo is placed mid-week deliberately: Wednesday is the state most of the
 * product is in most of the time, and it is the only phase where the countdown
 * and the live pool are both on screen.
 */
export async function seedDemo(now = new Date()) {
  const db = await resetDemoDb();
  stats.clear();

  const weekStart = weekStartFor(now);

  // Five servers, and the last one has **removed the bot**.
  //
  // S9 is a live state, not an edge case: a portal that survives its bot being
  // removed is only demonstrably true if the demo contains one. Its earnings,
  // standings and history all still work; only re-announcing errors, and the
  // error says to reinstall rather than describing what failed.
  const SERVERS = [
    { name: "Nightfall", members: 4200, removed: false },
    { name: "Dawnbreak", members: 1800, removed: false },
    { name: "Ironclad", members: 940, removed: false },
    { name: "Zenith", members: 610, removed: false },
    { name: "Lowlands", members: 220, removed: true },
  ];

  const guildIds: string[] = [];
  for (const [i, s] of SERVERS.entries()) {
    const guildId = `demo-guild-${i}`;
    guildIds.push(guildId);
    await db.insert(schema.guilds).values({
      guildId,
      name: s.name,
      slug: s.name.toLowerCase(),
      memberCount: s.members,
      community: `${s.name} is a competitive community that has been running weekly nights since 2023.`,
      announceChannelId: `demo-chan-${i}`,
      removedAt: s.removed ? new Date(now.getTime() - 2 * 86_400_000) : null,
    });
  }

  // 60 gamers, spread unevenly across the servers so the KPIs differ.
  const gamers: { userId: string; accountId: string; providerAccountId: string; guildId: string }[] = [];
  for (let i = 0; i < 60; i++) {
    const guildId = guildIds[i % guildIds.length];
    const userId = await createGamer(db, {
      displayName: DEMO_NAMES[i % DEMO_NAMES.length] + (i >= DEMO_NAMES.length ? ` ${i}` : ""),
      parentGuildId: guildId,
    });
    await setAgeBand(db, userId, i % 6 === 0 ? "teen" : "adult");
    await setCountry(db, userId, ["GB", "US", "DE", "BR", "AE"][i % 5]);

    const providerAccountId = `demo-acct-${i}`;
    const { id: accountId } = await linkAccount(db, {
      userId,
      provider: SIM,
      providerAccountId,
      inGameName: `player_${i}`,
      verifiedMethod: i % 4 === 0 ? "icon" : "exists",
    });
    stats.set(providerAccountId, { wins: 0, matches: 0 });
    await db.insert(schema.guildMembers).values({ id: uid(), guildId, userId });
    if (i % 4 === 0) {
      await db.insert(schema.guildMembers).values({
        id: uid(),
        guildId: guildIds[(i + 1) % guildIds.length],
        userId,
      });
    }
    gamers.push({ userId, accountId, providerAccountId, guildId });
  }

  // Two brands. One bought a four-week series, one bought a single week.
  const acme = await signUpBrand(db, { name: "Acme Energy", contactEmail: "hi@acme.test" });
  const nova = await signUpBrand(db, { name: "Nova Peripherals", contactEmail: "hi@nova.test" });

  const buyer = async (brandId: string, weeks: number, startingWeek: Date) => {
    const { invoiceId, challengeIds } = await confirmAndPay(
      db,
      { brandId, games: [SIM], challengesPerGame: 1, startingWeek, weeks },
      new Date(startingWeek.getTime() - 3 * 86_400_000),
    );
    await onInvoicePaid(db, invoiceId);
    return challengeIds;
  };

  // Last week's, so the site has closed challenges and winners.
  const lastWeek = new Date(weekStart.getTime() - 7 * 86_400_000);
  const past = await buyer(acme.brandId, 1, lastWeek);
  const current = await buyer(acme.brandId, 1, weekStart);
  const novaCurrent = await buyer(nova.brandId, 1, weekStart);
  const nextWeek = await buyer(nova.brandId, 1, new Date(weekStart.getTime() + 7 * 86_400_000));

  const setUpAndAnnounce = async (challengeId: string, brandId: string, title: string) => {
    await db
      .update(schema.challenges)
      .set({ metrics: { wins: 10, matches: 1 }, title })
      .where(eq(schema.challenges.id, challengeId));
    await createTrophy(db, {
      type: "podium",
      name: `${title} — champion`,
      valueCents: splitOf(CHALLENGE_PRICE_CENTS).prize,
      brandId,
      challengeId,
      place: 1,
    });
    await announce(db, challengeId, "demo-admin", guildIds);
  };

  await setUpAndAnnounce(past[0], acme.brandId, "Acme Energy Weekly — last week");
  await setUpAndAnnounce(current[0], acme.brandId, "Acme Energy Weekly");
  await setUpAndAnnounce(novaCurrent[0], nova.brandId, "Nova Peripherals Showdown");
  await setUpAndAnnounce(nextWeek[0], nova.brandId, "Nova Peripherals — next week");

  // A community challenge, so /community and a server page have something.
  const community = await buildCommunityChallenge(db, {
    guildId: guildIds[0],
    title: "Nightfall Friday Night",
    game: "Apex Legends",
    provider: SIM,
    tier: 2,
    startAt: weekStart,
  });
  await payCommunityChallenge(db, community.challengeId, 2);
  await db
    .update(schema.challenges)
    .set({ metrics: { wins: 10, matches: 1 } })
    .where(eq(schema.challenges.id, community.challengeId));
  await createTrophy(db, {
    type: "podium",
    name: "Nightfall Friday — first",
    valueCents: 1_000,
    challengeId: community.challengeId,
    place: 1,
  });
  await announce(db, community.challengeId, "demo-admin", [guildIds[0]]);

  // And one for next week. During the grace period — which is when community
  // challenges are PROMOTED on the homepage — this week's has already closed,
  // so a demo seeded only with this week's shows an empty community page on
  // exactly the days the product means to feature it.
  const communityNext = await buildCommunityChallenge(db, {
    guildId: guildIds[1],
    title: "Dawnbreak Weekend Ladder",
    game: "Apex Legends",
    provider: SIM,
    tier: 1,
    startAt: new Date(weekStart.getTime() + 7 * 86_400_000),
  });
  await payCommunityChallenge(db, communityNext.challengeId, 1);
  await db
    .update(schema.challenges)
    .set({ metrics: { wins: 10, matches: 1 } })
    .where(eq(schema.challenges.id, communityNext.challengeId));
  await createTrophy(db, {
    type: "podium",
    name: "Dawnbreak Weekend — first",
    valueCents: 500,
    challengeId: communityNext.challengeId,
    place: 1,
  });
  await announce(db, communityNext.challengeId, "demo-admin", [guildIds[1]]);

  // ── Play the current week up to Wednesday. ────────────────────────────
  const liveChallenges = [current[0], novaCurrent[0]];
  for (const challengeId of liveChallenges) {
    for (const [i, g] of gamers.entries()) {
      if (i % 3 === 2) continue; // Not everybody enters everything.
      await enterChallenge(
        db,
        { challengeId, userId: g.userId, guildId: g.guildId },
        new Date(weekStart.getTime() - 86_400_000),
      );
    }
  }
  await stampBaselinesAtGun(db, weekStart);

  for (const [i, g] of gamers.entries()) {
    const s = stats.get(g.providerAccountId)!;
    // A quarter of entrants never play — that is what activation measures.
    if (i % 4 !== 3) {
      s.wins += 2 + (i % 9);
      s.matches += 6 + (i % 11);
    }
    await forceSync(db, g.accountId, { at: new Date(weekStart.getTime() + 86_400_000) });
  }

  await snapshotGuilds(db, weekStart);
  await snapshotGuilds(db, lastWeek);

  // Allocate this week's pool, within the half rule.
  const ceiling = maxAllocationCents(await balanceOf(db, "server"));
  if (ceiling > 0) {
    await allocateToPool(db, { weekStart, amountCents: ceiling, actorId: "demo-admin" });
  }

  return {
    guildIds,
    gamers: gamers.length,
    brands: [acme.brandId, nova.brandId],
    challenges: { past, current: liveChallenges, next: nextWeek, community: community.challengeId },
    weekStart,
  };
}

const DEMO_NAMES = [
  "Kestrel", "Мороз", "日本語ゲーマー", "Sable", "Vireo", "Onyx", "Пламя", "Quill",
  "Marlow", "Ash", "Corvid", "Nyx", "Halden", "Юрий", "Fen", "Bramble",
  "Sorrel", "Torrent", "Wren", "Zephyr",
];
