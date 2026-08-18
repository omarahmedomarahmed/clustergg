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
import { settleChallenge } from "../trophies/settle.ts";
import { announce } from "../challenges/lifecycle.ts";
import { enterChallenge } from "../challenges/entry.ts";
import { stampBaselinesAtGun, closeChallenges } from "../challenges/jobs.ts";
import { forceSync } from "../core/sync.ts";
import { allocateToPool, maxAllocationCents } from "../money/pool.ts";
import { closeWeek } from "../pool/score.ts";
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
      // ===== THE SIX-FIELD PROFILE (12 §5) =====
      //
      // Zenith is deliberately left **incomplete** — no cover image. Ten
      // linked members is not the whole gate, and a demo where every server
      // has a full profile cannot show the state an owner actually opens the
      // portal to fix. K7 drops it from the run with a reason rather than
      // scoring it zero.
      community: `${s.name} is a competitive community that has been running weekly nights since 2023.`,
      announceChannelId: `demo-chan-${i}`,
      memberAgeRange: i % 2 === 0 ? "18-24" : "16-21",
      gamesPlayed: ["League of Legends", "Counter-Strike"],
      inviteUrl: `https://discord.gg/demo-${i}`,
      coverImageUrl: s.name === "Zenith" ? null : `https://cdn.test/${guildId}.png`,
      // Removal is applied **after the gun**, further down. Seeding it here
      // would make Lowlands ineligible on Monday and it would simply vanish
      // from the pool — which is not the state S9 and A9 describe. The state
      // worth demonstrating is a server that was in the pool, earned, and then
      // lost the bot on Tuesday: it **keeps what it earned and gains nothing
      // new**, and its portal still works.
    });
  }

  // 60 gamers, spread unevenly across the servers so the KPIs differ.
  const gamers: {
    userId: string;
    accountId: string;
    providerAccountId: string;
    /** Their parent server — where they first pressed a bot button (A1). */
    guildId: string;
    /** Where they press Join. Null is a web join (A6). */
    joinGuildId: string | null;
  }[] = [];
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

    // ===== WHERE THEY WILL PRESS JOIN, WHICH IS NOT ALWAYS HOME =====
    //
    // A4 is the ordinary case and a demo in which every gamer joins from their
    // own parent server never renders it: parent = join is 1.0 (A5), so the
    // pool page would show whole entrants everywhere and the ½ + ½ split would
    // be invisible on every surface that photographs it.
    //
    // So one gamer in four presses Join on a neighbouring server's card, and
    // one in nine joins from the web with no server context at all (A6 — 1.0
    // to the parent).
    const joinGuildId =
      i % 9 === 4 ? null : i % 4 === 0 ? guildIds[(i + 1) % guildIds.length] : guildId;
    gamers.push({ userId, accountId, providerAccountId, guildId, joinGuildId });
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

  // ===== LAST WEEK HAS A THREE-PLACE PODIUM, ON PURPOSE =====
  //
  // With one place there is exactly one money-trophy in the whole demo, and it
  // lands on whoever scored highest — an adult, as the fixture happens to fall.
  // 09's gamer flow then has no way to photograph shot 17, *"redeem: blocked
  // under 18"*, because no 13–17 gamer holds anything worth blocking.
  //
  // Three places puts second on a teen and first on an adult, so the same demo
  // shows the refusal and the payout. T2/T3 still hold: the three values add up
  // to the prize pool exactly, and they are derived from it here rather than
  // typed, so a change to the price cannot silently break the guard.
  const pastPrize = splitOf(CHALLENGE_PRICE_CENTS).prize;
  const podium = [
    Math.round(pastPrize * 0.5),
    Math.round(pastPrize * 0.3),
    pastPrize - Math.round(pastPrize * 0.5) - Math.round(pastPrize * 0.3),
  ];
  await db
    .update(schema.challenges)
    .set({
      metrics: { wins: 10, matches: 1 },
      title: "Acme Energy Weekly — last week",
      places: podium.length,
    })
    .where(eq(schema.challenges.id, past[0]));
  for (const [i, valueCents] of podium.entries()) {
    await createTrophy(db, {
      type: "podium",
      name: `Acme Energy Weekly — ${["champion", "runner-up", "third"][i]}`,
      valueCents,
      brandId: acme.brandId,
      challengeId: past[0],
      place: i + 1,
    });
  }
  await announce(db, past[0], "demo-admin", guildIds);
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

  // ===== LAST WEEK IS ACTUALLY PLAYED, CLOSED AND PAID =====
  //
  // The seeder bought a challenge for last week, set it up and announced it —
  // and then nobody entered it and nothing closed it. So the demo had no
  // placements, no trophies, no week record and no payouts, and the whole
  // second half of 09's gamer flow (shots 14 and 16-21: *trophy awarded*,
  // *profile with trophies*, *redeem blocked under 18*, *redeem refused on a
  // $0 trophy*) could not be photographed, because none of those states
  // existed in the demo at all.
  //
  // This is not decoration. A closed week is the only way the record can show
  // a **podium trophy beside a $0 collectable on the same profile**, which is
  // the comparison T1 exists for — and the only way `/redeem` can be
  // photographed refusing anything, since a refusal needs something to refuse.
  const lastClose = new Date(lastWeek.getTime() + 5 * 86_400_000);
  for (const [i, g] of gamers.entries()) {
    if (i % 3 === 2) continue; // The same "not everybody enters" shape as below.
    await enterChallenge(
      db,
      { challengeId: past[0], userId: g.userId, guildId: g.joinGuildId },
      new Date(lastWeek.getTime() - 86_400_000),
    );
  }
  await stampBaselinesAtGun(db, lastWeek);
  for (const [i, g] of gamers.entries()) {
    const s = stats.get(g.providerAccountId)!;
    if (i % 4 !== 3) {
      s.wins += 1 + (i % 7);
      s.matches += 4 + (i % 9);
    }
    await forceSync(db, g.accountId, { at: new Date(lastWeek.getTime() + 86_400_000) });
  }
  // Placements first, then trophies. `closeChallenges` runs the final sync
  // itself — B3, and the reason the close is a job rather than a query.
  await closeChallenges(db, lastClose);
  await settleChallenge(db, past[0], { actorId: "demo-admin", at: lastClose });

  // And last week's pool, so there is a week record to read and a payout to
  // release. W1 — written once, at the close.
  const lastCeiling = maxAllocationCents(await balanceOf(db, "server"));
  if (lastCeiling > 0) {
    await allocateToPool(db, { weekStart: lastWeek, amountCents: lastCeiling, actorId: "demo-admin" });
    await closeWeek(db, lastWeek, lastClose);
  }

  // ── Play the current week up to Wednesday. ────────────────────────────
  const liveChallenges = [current[0], novaCurrent[0]];
  for (const challengeId of liveChallenges) {
    for (const [i, g] of gamers.entries()) {
      if (i % 3 === 2) continue; // Not everybody enters everything.
      await enterChallenge(
        db,
        { challengeId, userId: g.userId, guildId: g.joinGuildId },
        new Date(weekStart.getTime() - 86_400_000),
      );
    }
  }
  await stampBaselinesAtGun(db, weekStart);

  // ===== A9 — THE BOT COMES OFF ON TUESDAY, AFTER THE GUN =====
  //
  // Lowlands was eligible at the gun and its entrants' attribution froze on
  // Monday, so it keeps this week's credit. Anything attributed after this
  // instant earns it nothing. The portal survives (S9): earnings, standings
  // and history all still read, and only re-announcing errors.
  const removedGuildId = guildIds[SERVERS.findIndex((s) => s.removed)];
  await db
    .update(schema.guilds)
    .set({ removedAt: new Date(weekStart.getTime() + 86_400_000) })
    .where(eq(schema.guilds.guildId, removedGuildId));

  for (const [i, g] of gamers.entries()) {
    const s = stats.get(g.providerAccountId)!;
    // A quarter of entrants never play — that is what activation measures.
    if (i % 4 !== 3) {
      s.wins += 2 + (i % 9);
      s.matches += 6 + (i % 11);
    }
    await forceSync(db, g.accountId, { at: new Date(weekStart.getTime() + 86_400_000) });
  }

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
