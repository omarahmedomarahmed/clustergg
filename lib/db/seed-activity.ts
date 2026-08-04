// The demo's ACTIVITY layer — everything that happens *to* the entities the
// main seed creates.
//
// `seed.ts` builds the nouns: gamers, games, planets, brands, campaigns,
// creatives, placements, servers, challenges, trophies, quests. This builds the
// verbs: points earned, ads served and clicked, profiles viewed and voted for,
// invoices issued and paid, payouts requested, trophies bought and cashed out,
// challenges requested, stats moving over time.
//
// It exists because an audit of the schema found **36 of 74 tables with no demo
// rows at all**, and they were not obscure ones — they were `quest_events`,
// `ad_impressions`, `profile_votes`, `brand_invoices`, `server_payouts`. The
// consequence was that every screen built to report on activity reported zero:
// the gamer card read "0 CP · 0 views · 0 votes · LV 1", brand analytics drew an
// empty chart, the server portal showed no earnings, and the marketplace had
// nothing sold. A demo of a product where nothing has ever happened is a demo of
// the empty state, and the empty state is not what anyone needs to see.
//
// Two rules this module holds itself to:
//
// 1. **Drive the real code path wherever one exists.** Quest points go through
//    `awardQuestAction`, not hand-written `user_quest_progress` rows, so the
//    demo obeys the same caps, dedup and tier unlocks production does. If a rule
//    changes, this data changes with it instead of quietly contradicting it.
// 2. **Idempotent.** Every write is `onConflictDoNothing` or guarded by a count,
//    so running it twice against the same database is a no-op rather than a
//    second month of invoices.
//
// CALLED FROM THE BOOTSTRAP, AFTER `runBootMaintenance` — not from inside
// `seed()`. Points go through `awardQuestAction`, which credits every active
// quest listening to an action, and the quests are created by `seedQuests`,
// which boot maintenance calls. Run any earlier and every award finds no quest
// to credit and returns silently, because that path swallows its own errors by
// design (gamification must never block the action that triggered it). That is
// exactly what happened: everything else seeded correctly and the CP totals were
// quietly zero.

import { eq, sql } from "drizzle-orm";
import * as schema from "@/lib/db/schema";
import { uid } from "@/lib/utils";

const day = 86400000;
const ago = (d: number) => new Date(Date.now() - d * day);
/** Deterministic pseudo-random, so two runs of the demo look identical. */
const rng = (seed: number) => () => ((seed = (seed * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff);

export async function seedDemoActivity(db: {
  select: (...a: never[]) => never;
  insert: (...a: never[]) => never;
  update: (...a: never[]) => never;
  // Loosely typed on purpose — this is called with the same Drizzle handle the
  // rest of the seed uses, and pinning the generic here buys nothing.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
} | any): Promise<void> {
  const users = await db.select().from(schema.users);
  const bySlug = new Map<string, typeof users[number]>(users.map((u: { slug: string }) => [u.slug, u]));
  const nova = bySlug.get("nova"), lyra = bySlug.get("lyra"), orion = bySlug.get("orion"),
    vega = bySlug.get("vega"), atlas = bySlug.get("atlas");
  const admin = users.find((u: { role: string }) => u.role === "admin" || u.role === "superadmin");
  if (!nova || !lyra || !orion || !vega || !atlas) return; // not a demo database

  const gamers = [nova, lyra, orion, vega, atlas];

  await seedQuestProgress(db, gamers);
  await seedProfileAttention(db, gamers);
  await seedStatHistory(db);
  await seedMarketplace(db, gamers);
  // AFTER the marketplace, because it has to cover what the seeded orders spend.
  await seedCarriedBalance(db, gamers);
  await seedAdDelivery(db);
  await seedDemoPortalKeys(db);
  await seedBilling(db);
  await seedServerPayouts(db);
  await seedChallengeRequests(db);
  await seedPayoutAccounts(db, gamers);
  await seedServerScale(db);
  await seedNavArt(db);
  await seedFeatureShots(db);
  if (admin) await seedAuditTrail(db, admin.id);
}

// ===== Cluster Points, through the real award path =====
//
// Every gamer card, every quest page, every leaderboard and the whole wallet
// read from quest progress, and all of it was zero. These awards go through
// `awardQuestAction`, so the caps in ACTION_CATALOG apply exactly as they do in
// production — which also means this data is a live check that the award path
// still works.
//
// **B34 made every action capped**, and added a hard 500 CP/day ceiling. The
// note that used to sit here — "only uncapped actions are used" — no longer
// describes anything, because there are none. Every award below is now
// truncated by the same caps production applies, on the one day the seed runs,
// which is correct and which is also why the totals it produces are small.
//
// See `seedCarriedBalance` beneath it for how the demo gets a gamer who has
// visibly played for months without simulating months.
async function seedQuestProgress(db: any, gamers: { id: string; slug: string }[]) {
  const [existing] = await db.select({ c: sql<number>`count(*)` }).from(schema.questEvents);
  if (Number(existing?.c ?? 0) > 0) return;
  const { awardQuestAction } = await import("@/lib/quests");

  // How much each gamer has done. Nova is the showcase profile — the one every
  // screenshot is taken of — so she is the most active. Atlas is deliberately
  // near the bottom: a demo where everybody is a champion cannot show a
  // leaderboard, a progress bar mid-progress, or a tier not yet earned.
  const plan: Record<string, { wins: number; podiums: number; finishes: number; planets: number; followers: number; views: number; best: number }> = {
    nova:  { wins: 3, podiums: 5, finishes: 12, planets: 4, followers: 18, views: 24, best: 1 },
    lyra:  { wins: 2, podiums: 4, finishes: 9,  planets: 3, followers: 12, views: 16, best: 1 },
    orion: { wins: 1, podiums: 3, finishes: 7,  planets: 3, followers: 9,  views: 11, best: 0 },
    vega:  { wins: 0, podiums: 2, finishes: 5,  planets: 2, followers: 6,  views: 7,  best: 0 },
    atlas: { wins: 0, podiums: 0, finishes: 2,  planets: 1, followers: 2,  views: 3,  best: 0 },
  };

  for (const g of gamers) {
    const p = plan[g.slug];
    if (!p) continue;
    const n = async (action: Parameters<typeof awardQuestAction>[2], count: number, refType: string) => {
      for (let i = 0; i < count; i++) {
        await awardQuestAction(db, g.id, action, { refType, refId: `${g.slug}-${refType}-${i}` });
      }
    };
    await n("win_challenge", p.wins, "seed-win");
    await n("top3_challenge", p.podiums, "seed-podium");
    await n("finish_challenge", p.finishes, "seed-finish");
    await n("join_planet", p.planets, "seed-planet");
    await n("follower_gained", p.followers, "seed-follower");
    await n("profile_views_25", p.views, "seed-views");
    await n("best_profile_award", p.best, "seed-best");
    await n("connect_account", 2, "seed-connect");
  }
}

/**
 * What each demo gamer earned BEFORE the demo window — one row, stated plainly.
 *
 * B34 prices a $5 bronze trophy at 50,000 CP, which is a hundred days at the
 * ceiling. That is the intended economy: a trophy should be far, expensive and
 * reachable. But it leaves a demo where the richest gamer has three figures and
 * every shelf item is unaffordable, so the marketplace, the wallet, the gift
 * flow and the redemption path all show their empty state and none of them can
 * be looked at.
 *
 * Simulating a hundred days of play at boot is thousands of writes for a number
 * we already know, so this is one backdated event per gamer carrying it. It is
 * a **demo-data device and not an economy change**: it writes to the ledger
 * every reader already sums, it is labelled `seed-carried` so it is obvious in
 * the CP history, and it is dated before the window rather than pretending to
 * be today's earnings — a carried balance stamped "now" would blow straight
 * through the ceiling this item exists to enforce.
 *
 * The spread is deliberate. Nova can afford a bronze with change; Atlas cannot
 * afford anything, because a demo where everybody can buy everything cannot
 * show the one screen that matters most — the gamer who is still saving.
 *
 * The numbers below are BALANCES, not credits, so what the seeded orders already
 * spent is added back on top. Writing them as credits made Nova's wallet read
 * zero the moment she gifted a $10 trophy — the demo had a gamer whose header
 * said 62,000 CP and whose every tile said she could not afford anything.
 */
async function seedCarriedBalance(db: any, gamers: { id: string; slug: string }[]) {
  const CARRIED: Record<string, number> = {
    nova: 62_000, lyra: 41_500, orion: 23_800, vega: 9_400, atlas: 1_200,
  };
  const { cpSpent } = await import("@/lib/marketplace");
  const [quest] = await db.select({ id: schema.quests.id }).from(schema.quests)
    .where(eq(schema.quests.key, "conquest")).limit(1);
  if (!quest) return;
  for (const g of gamers) {
    const want = CARRIED[g.slug];
    if (!want) continue;
    const cp = want + await cpSpent(db, g.id);
    const at = new Date(Date.now() - 40 * 86400_000);
    await db.insert(schema.questEvents).values({
      id: uid(), userId: g.id, questId: quest.id, actionKey: "win_challenge",
      qpAwarded: 0,          // progress is what the awards above already gave
      cpAwarded: cp,         // this row is the balance, and nothing else
      refType: "seed-carried", refId: g.slug, createdAt: at,
    }).onConflictDoNothing();
  }
}

/**
 * A demo server big enough to be on a tier, and honest about who counts (B35).
 *
 * Demo-only, like everything in this file. Without it every demo server has two
 * linked members, so the tier ladder, the qualified/raw split, the payout
 * holding period and the growth-review queue are all correct and all invisible —
 * a feature nobody can look at is a feature nobody can check.
 *
 * The numbers are chosen to sit on the interesting side of the rule rather than
 * the comfortable one: **520 linked members, of which 180 qualify.** That is a
 * server which has visibly crossed 500 and is NOT being paid a tier for it,
 * which is exactly the state B35 exists to produce and the one an owner most
 * needs explained. A demo where everything qualifies would demonstrate nothing.
 */
async function seedServerScale(db: any) {
  const [guild] = await db.select().from(schema.discordGuilds).limit(1);
  if (!guild) return;
  const [existing] = await db.select({ c: sql<number>`count(*)` })
    .from(schema.discordGuildMembers).where(eq(schema.discordGuildMembers.guildId, guild.guildId));
  if (Number(existing?.c ?? 0) > 100) return;   // idempotent

  const TOTAL = 520, QUALIFIED = 180;
  const users: Record<string, unknown>[] = [];
  const members: Record<string, unknown>[] = [];
  const accounts: Record<string, unknown>[] = [];
  for (let i = 0; i < TOTAL; i++) {
    const id = `demo-m-${String(i).padStart(4, "0")}`;
    const qualifies = i < QUALIFIED;
    users.push({
      id, slug: `member-${i}`, displayName: `Member ${i}`,
      email: `${id}@demo.gg`, passwordHash: "x",
    });
    members.push({
      guildId: guild.guildId, userId: id,
      // The qualifying ones linked long ago; the rest arrived this week, which
      // is also what makes the growth-review queue show something real.
      firstLinkedAt: new Date(Date.now() - (qualifies ? 60 : 3) * 86400_000),
    });
    accounts.push({
      id: `demo-a-${String(i).padStart(4, "0")}`, userId: id,
      provider: "chesscom", providerAccountId: `demo-acct-${i}`,
      inGameName: `member${i}`,
      // `verified` means ownership PROVEN, not "the provider answered".
      verified: qualifies, verifiedMethod: qualifies ? "oauth" : "claimed",
      verifiedAt: qualifies ? new Date(Date.now() - 60 * 86400_000) : null,
    });
  }
  const chunk = <T,>(a: T[], n: number) => Array.from({ length: Math.ceil(a.length / n) }, (_, i) => a.slice(i * n, i * n + n));
  for (const c of chunk(users, 100)) await db.insert(schema.users).values(c).onConflictDoNothing();
  for (const c of chunk(members, 100)) await db.insert(schema.discordGuildMembers).values(c).onConflictDoNothing();
  for (const c of chunk(accounts, 100)) await db.insert(schema.linkedGameAccounts).values(c).onConflictDoNothing();
}

// ===== Views and votes =====
//
// The two numbers on the front of every profile card, and the entire input to
// Profile of the Week. Both were zero, so the competition had no standings and
// the card had nothing to boast.
async function seedProfileAttention(db: any, gamers: { id: string; slug: string }[]) {
  const at = (slug: string) => gamers.find((g) => g.slug === slug)?.id ?? "";
  const [existing] = await db.select({ c: sql<number>`count(*)` }).from(schema.profileVotes);
  if (Number(existing?.c ?? 0) > 0) return;

  // `lib/week` and NOT `lib/profile-week`.
  //
  // `profile-week` resolves the admin-set competition timezone, which reaches
  // the CMS and from there `next/headers` — and dragging that into the seed's
  // module graph broke the production build outright, because the seed is
  // imported from the database bootstrap. The seed has no request to read a
  // cookie from anyway, so the default timezone is the correct answer here as
  // well as the only compilable one.
  const { weekAt, previousWeek, DEFAULT_WEEK_TZ } = await import("@/lib/week");
  const week = weekAt(new Date(), DEFAULT_WEEK_TZ);
  const weekKey = week.key;
  const rand = rng(20260804);

  // Votes: a real spread, not a tie. The board is only worth looking at if
  // there is a leader, a chasing pack and somebody yet to be noticed.
  const votes: Record<string, number> = { nova: 34, lyra: 27, orion: 15, vega: 8, atlas: 2 };
  const viewsOf: Record<string, number> = { nova: 1840, lyra: 1210, orion: 760, vega: 430, atlas: 95 };
  const guilds = ["demo-guild-nebula-1", "demo-guild-nebula-2", "demo-guild-nebula-3"];

  for (const g of gamers) {
    const v = votes[g.slug] ?? 0;
    for (let i = 0; i < v; i++) {
      await db.insert(schema.profileVotes).values({
        id: uid(), profileUserId: g.id,
        // Most votes come from Discord, which is where the bot shows the card —
        // and that mix is itself the claim ("your profile gets seen in servers").
        voterUserId: null,
        voterDiscordId: `demo-voter-${g.slug}-${i}`,
        guildId: guilds[i % guilds.length],
        source: i % 4 === 0 ? "web" : "discord",
        weekKey,
        createdAt: ago(rand() * 6),
      }).onConflictDoNothing();
    }
    // The denormalised counters the cards read, kept in step with the rows.
    await db.update(schema.users)
      .set({ voteCount: v, profileViews: viewsOf[g.slug] ?? 0 })
      .where(eq(schema.users.id, g.id));

    // A sample of the view rows behind the counter, enough for "where did my
    // views come from" to have an answer.
    for (let i = 0; i < 12; i++) {
      await db.insert(schema.profileViews).values({
        id: uid(), profileUserId: g.id,
        source: i % 3 === 0 ? "web" : "discord",
        guildId: i % 3 === 0 ? null : guilds[i % guilds.length],
        guildName: i % 3 === 0 ? null : ["Chess Legion", "Endgame HQ", "Blitz Club MENA"][i % 3],
        viewerDiscordId: `demo-viewer-${i}`,
        createdAt: ago(rand() * 14),
      }).onConflictDoNothing();
    }
  }

  // Last week's result, so the band has a podium to show rather than only a
  // countdown. A competition nobody has ever won looks like one nobody plays.
  // Through the competition's own helper rather than string arithmetic on the
  // key — the key format is the week module's business, and decrementing it by
  // hand is how a demo ends up with two rows for the same week.
  const lastKey = previousWeek(week).key;
  await db.insert(schema.voteWeeks).values({
    weekKey: lastKey,
    podium: [
      { userId: at("lyra"), slug: "lyra", votes: 41 },
      { userId: at("nova"), slug: "nova", votes: 38 },
      { userId: at("orion"), slug: "orion", votes: 22 },
    ],
    announcedAt: ago(2), closedAt: ago(2),
  }).onConflictDoNothing();
  // The current week exists but is open — no podium, no announcement.
  await db.insert(schema.voteWeeks).values({ weekKey }).onConflictDoNothing();
}

// ===== Stat history =====
//
// `stat_current` is one row per metric; every "how am I trending" surface reads
// `stat_snapshots`, which had none. Thirty days of daily points per synced
// metric, climbing gently, so a chart has a shape rather than a dot.
async function seedStatHistory(db: any) {
  const [existing] = await db.select({ c: sql<number>`count(*)` }).from(schema.statSnapshots);
  if (Number(existing?.c ?? 0) > 0) return;
  const current = await db.select().from(schema.statCurrent);
  const rand = rng(77002);
  for (const s of current) {
    // Walk BACKWARDS from today's real value so the series ends exactly where
    // `stat_current` says it is. A history that disagrees with the present
    // reads as a bug in the sync, which is the one thing this data must not
    // imply.
    let v = s.metricValue as number;
    for (let d = 0; d < 30; d++) {
      await db.insert(schema.statSnapshots).values({
        id: uid(), linkedAccountId: s.linkedAccountId, game: s.game,
        metricKey: s.metricKey, metricValue: Math.round(v * 100) / 100,
        recordedAt: ago(d),
      }).onConflictDoNothing();
      // Ratings and ranks drift; counters only ever go up, so walking back
      // must only ever go down.
      const step = Math.max(1, Math.abs(v) * 0.004) * rand();
      v = /wins|losses|games|matches|played|count|level|views/.test(s.metricKey) ? Math.max(0, v - step) : v - step * (rand() > 0.35 ? 1 : -1);
    }
  }
}

// ===== The marketplace: things listed, bought, gifted and cashed out =====
async function seedMarketplace(db: any, gamers: { id: string; slug: string }[]) {
  const trophies = await db.select().from(schema.trophies);
  if (!trophies.length) return;

  // List the catalogue for sale. Priced at the platform rate so the two numbers
  // on every marketplace tile — CP to buy, dollars to redeem — agree with each
  // other instead of being two unrelated made-up figures.
  const { DEFAULT_CP_PER_DOLLAR } = await import("@/lib/marketplace");
  // Price by TIER where a trophy has no dollar value yet.
  //
  // Boot maintenance adds a second set of trophies with a flat cpPrice and no
  // value at all, so the marketplace card printed "= $0" beside a real CP price
  // — a shelf where everything is free, which is the opposite of the claim the
  // card is making. The tier is the only signal those rows carry, so it decides
  // the money, and the CP price is then derived from it at the platform rate so
  // the two numbers on every tile agree.
  const byTier: Record<string, number> = { legendary: 50, gold: 25, silver: 10, bronze: 5 };
  for (const t of trophies) {
    const value = (t.value as number) > 0 ? (t.value as number) : (byTier[t.tier as string] ?? 5);
    const cpPrice = Math.round(value * DEFAULT_CP_PER_DOLLAR);
    if (t.value === value && t.cpPrice === cpPrice) continue;
    await db.update(schema.trophies)
      .set({ value, cpPrice, inMarketplace: true })
      .where(eq(schema.trophies.id, t.id));
  }

  const [orders] = await db.select({ c: sql<number>`count(*)` }).from(schema.marketplaceOrders);
  if (Number(orders?.c ?? 0) > 0) return;

  const [nova, lyra, orion] = gamers;
  const bronze = trophies.find((t: { tier: string }) => t.tier === "bronze") ?? trophies[0];
  const silver = trophies.find((t: { tier: string }) => t.tier === "silver") ?? trophies[0];

  // One bought for themselves, one gifted — the two kinds the marketplace
  // supports, so neither branch of the orders list is an empty state.
  const mkOrder = async (buyer: string, recipient: string, t: any, kind: string, message: string | null, daysAgo: number) => {
    const awardId = uid();
    await db.insert(schema.userTrophies).values({
      id: awardId, userId: recipient, trophyId: t.id, placement: 1, awardedAt: ago(daysAgo),
    }).onConflictDoNothing();
    await db.insert(schema.marketplaceOrders).values({
      id: uid(), buyerId: buyer, recipientId: recipient, trophyId: t.id, awardId,
      cpSpent: t.cpPrice || Math.round((t.value as number) * 10000), value: t.value,
      kind, message, status: "complete", createdAt: ago(daysAgo),
    }).onConflictDoNothing();
    return awardId;
  };
  await mkOrder(orion.id, orion.id, bronze, "purchase", null, 9);
  await mkOrder(nova.id, lyra.id, silver, "gift", "gg on the endgame run 🏆", 4);

  // A redeem in every state the payout pipeline has, so the gamer's "cash out"
  // tab and the admin queue both show a real workflow instead of one row.
  const [redeems] = await db.select({ c: sql<number>`count(*)` }).from(schema.trophyRedeems);
  if (Number(redeems?.c ?? 0) > 0) return;
  const held = await db.select().from(schema.userTrophies).where(eq(schema.userTrophies.userId, nova.id));
  const pick = (n: number) => held.slice(n, n + 1).map((h: { id: string }) => h.id);
  const states: { status: string; amount: number; who: string; days: number; extra?: Record<string, unknown> }[] = [
    { status: "pending",  amount: 5,  who: nova.id,  days: 1 },
    { status: "approved", amount: 10, who: lyra.id,  days: 4 },
    { status: "sent",     amount: 25, who: orion.id, days: 8, extra: { collectUrl: "https://pay.example/collect/demo-sent", sentAt: ago(7), providerKey: "demo", providerRef: "demo-ref-sent" } },
    { status: "paid",     amount: 50, who: nova.id,  days: 21, extra: { paidAt: ago(19), sentAt: ago(20), providerKey: "demo", providerRef: "demo-ref-paid", gamerConfirmedAt: ago(19) } },
  ];
  for (const [i, s] of states.entries()) {
    await db.insert(schema.trophyRedeems).values({
      id: uid(), userId: s.who, awardIds: pick(i), amount: s.amount, currency: "USD",
      // A word, never an account number. See docs/PAYMENTS.md — the demo has to
      // be as incapable of holding a payment detail as production is.
      method: ["paypal", "bank", "wise", "crypto", "giftcard"][i % 5],
      details: {}, status: s.status, createdAt: ago(s.days), decidedAt: s.status === "pending" ? null : ago(s.days - 1),
      ...(s.extra ?? {}),
    }).onConflictDoNothing();
  }
}

// ===== Ads actually served =====
//
// Every brand-facing number — impressions, clicks, CTR, the analytics chart,
// the ROAS panel — reads these two tables, and both were empty, so the brand
// portal demonstrated a product that had never delivered anything.
async function seedAdDelivery(db: any) {
  const [existing] = await db.select({ c: sql<number>`count(*)` }).from(schema.adImpressions);
  if (Number(existing?.c ?? 0) > 0) return;
  const ccs = await db.select().from(schema.adCampaignCreatives);
  if (!ccs.length) return;
  const placements = await db.select().from(schema.adPlacements);
  const pathOf = new Map<string, string>(placements.map((p: { id: string; key: string }) => [p.id, routeForPlacement(p.key)]));
  const rand = rng(31337);
  const countries = ["EG", "SA", "AE", "US", "GB", "DE", "BR", "MA"];
  const guilds = ["demo-guild-nebula-1", "demo-guild-nebula-2", "demo-guild-nebula-3"];

  for (const cc of ccs) {
    // Spread over 30 days so a daily chart has 30 points. Volume varies by
    // weight, because that is what weight is for and a flat delivery curve
    // would make the weighting look like it does nothing.
    const perDay = 6 + Math.round((cc.weight ?? 1) * 5);
    for (let d = 0; d < 30; d++) {
      for (let k = 0; k < perDay; k++) {
        const impId = uid();
        const at = new Date(ago(d).getTime() + Math.floor(rand() * 20 * 3600000));
        await db.insert(schema.adImpressions).values({
          id: impId, campaignCreativeId: cc.id, userId: null,
          sessionId: `demo-sess-${d}-${k}`,
          pagePath: pathOf.get(cc.placementId) ?? "/",
          deviceType: rand() > 0.45 ? "mobile" : "desktop",
          hashedIp: `demo-${(d * 97 + k) % 500}`,
          geoCountry: countries[Math.floor(rand() * countries.length)],
          durationViewedMs: 800 + Math.floor(rand() * 9000),
          guildId: rand() > 0.8 ? guilds[Math.floor(rand() * guilds.length)] : null,
          createdAt: at,
        }).onConflictDoNothing();
        // ~2.4% CTR — a believable display rate. A demo showing 50% teaches
        // whoever reads it to expect a number the product will never hit.
        if (rand() < 0.024) {
          await db.insert(schema.adClicks).values({
            id: uid(), campaignCreativeId: cc.id, impressionId: impId,
            source: "web", createdAt: new Date(at.getTime() + 4000),
          }).onConflictDoNothing();
        }
      }
    }
  }
}

/** Where a placement key actually renders, for believable `pagePath` values. */
function routeForPlacement(key: string): string {
  if (key.startsWith("landing")) return "/";
  if (key.startsWith("leaderboard")) return "/leaderboards";
  if (key.startsWith("feed")) return "/feed";
  if (key.startsWith("profile")) return "/u/nova";
  if (key.startsWith("games") || key.startsWith("planet")) return "/planets";
  if (key.startsWith("challenge")) return "/challenges";
  return "/";
}

// ===== Portal keys a demo can actually open =====
//
// Production mints a random access key per brand and DMs a random portal key to
// each server owner; staff are deliberately never shown either. That is correct
// there and useless here: a demo where the entire brand portal and the entire
// server portal sit behind secrets nobody holds is a demo of the lock rather
// than of the product, and neither surface can be screenshotted or tested.
//
// So demo brands get a stable, obviously-fake key. Demo only — this runs inside
// the `demo` branch of the seed and never touches a production row, and the key
// is derived from the slug so it is guessable ON PURPOSE. A real brand's key is
// still `newAccessKey()`.
async function seedDemoPortalKeys(db: any) {
  const brands = await db.select().from(schema.brands);
  for (const b of brands) {
    if (!b.slug || /^DEMO-/.test(b.accessKey ?? "")) continue;
    await db.update(schema.brands)
      .set({ accessKey: `DEMO-${b.slug.toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 10)}` })
      .where(eq(schema.brands.id, b.id));
  }
}

// ===== Brand billing =====
//
// Invoices are built with `draftLines`, the same function the admin console
// uses, so the demo's totals are the product's arithmetic rather than numbers
// typed into a fixture that will disagree with it after the next price change.
async function seedBilling(db: any) {
  const [existing] = await db.select({ c: sql<number>`count(*)` }).from(schema.brandInvoices);
  if (Number(existing?.c ?? 0) > 0) return;
  const brands = await db.select().from(schema.brands);
  if (!brands.length) return;
  const { draftLines, dueDateFrom, monthLabel, payToken } = await import("@/lib/invoices");

  // Three invoices in three states — paid, issued-and-due, overdue — because
  // "chase the overdue ones" is the whole job of the billing screen and it
  // cannot be demonstrated with a single paid invoice.
  const plan = [
    { brand: brands[0], games: 2, addon: true,  status: "paid",   issued: 62, gameNames: ["Chess", "Dota 2"] },
    { brand: brands[0], games: 2, addon: true,  status: "issued", issued: 12, gameNames: ["Chess", "Dota 2"] },
    { brand: brands[1], games: 1, addon: false, status: "overdue", issued: 44, gameNames: ["Chess"] },
  ];
  for (const [i, p] of plan.entries()) {
    if (!p.brand) continue;
    const invId = uid();
    const issuedAt = ago(p.issued);
    await db.insert(schema.brandInvoices).values({
      id: invId, brandId: p.brand.id,
      number: `CG-${String(1041 + i)}`,
      status: p.status, currency: "USD",
      periodLabel: monthLabel(issuedAt),
      issuedAt, dueAt: dueDateFrom(issuedAt),
      paidAt: p.status === "paid" ? ago(p.issued - 9) : null,
      paidVia: p.status === "paid" ? "bank" : null,
      // A token, not a card. The pay page is a link to a provider; nothing
      // about a payment instrument is ever stored here.
      payToken: payToken(),
      createdAt: issuedAt,
    }).onConflictDoNothing();
    const lines = draftLines({ games: p.games, addon: p.addon, gameNames: p.gameNames });
    for (const [n, l] of lines.entries()) {
      await db.insert(schema.invoiceLines).values({ id: uid(), invoiceId: invId, sortOrder: n, ...l }).onConflictDoNothing();
    }
  }

  // Two enquiries in the inbox — one new, one already converted to a brand —
  // so the sales queue shows both ends of its own workflow.
  const [enq] = await db.select({ c: sql<number>`count(*)` }).from(schema.brandEnquiries);
  if (Number(enq?.c ?? 0) === 0) {
    await db.insert(schema.brandEnquiries).values([
      {
        id: uid(), company: "Hyperion Energy", contactName: "Dana Reyes", email: "dana@hyperion.example",
        website: "https://hyperion.example", message: "We want to sponsor a weekly VALORANT challenge across MENA servers. What does a three-month run cost?",
        tier: "sponsored", games: 1, addon: false, billing: "monthly", quotedMonthly: 1400,
        status: "new", createdAt: ago(2),
      },
      {
        id: uid(), company: "Ionmark", contactName: "Sam Okafor", email: "hello@ionmark.example",
        message: "Placements only to start, then we'll look at sponsoring Chess.",
        tier: "reach", games: 0, addon: false, billing: "monthly", quotedMonthly: 900,
        status: "converted", brandId: brands[2]?.id ?? null, createdAt: ago(21),
      },
    ]).onConflictDoNothing();
  }
}

// ===== Server-owner earnings =====
//
// A server owner's entire reason to install the bot. The portal's Earnings and
// Payouts tabs both read these tables and both were empty, so the demo's answer
// to "what do I get" was a blank page.
async function seedServerPayouts(db: any) {
  const [existing] = await db.select({ c: sql<number>`count(*)` }).from(schema.serverPayouts);
  if (Number(existing?.c ?? 0) > 0) return;
  const guilds = await db.select().from(schema.discordGuilds);
  if (!guilds.length) return;
  const challenges = await db.select({ id: schema.challenges.id, title: schema.challenges.title })
    .from(schema.challenges).where(eq(schema.challenges.status, "completed")).limit(4);

  // One paid, one in flight, one still accruing — the three states an owner
  // sees across a quarter.
  const states = [
    { status: "paid", start: 90, end: 60, extra: { paidAt: ago(56), providerKey: "demo", providerRef: "demo-payout-1" } },
    { status: "sent", start: 60, end: 30, extra: { collectUrl: "https://pay.example/collect/demo-server", providerKey: "demo", providerRef: "demo-payout-2" } },
    { status: "pending", start: 30, end: 0, extra: {} },
  ];
  for (const [i, s] of states.entries()) {
    const g = guilds[i % guilds.length];
    const payoutId = uid();
    await db.insert(schema.serverPayouts).values({
      id: payoutId, guildId: g.guildId, guildName: g.name, status: s.status, currency: "USD",
      periodStart: ago(s.start), periodEnd: ago(s.end),
      requestedAt: ago(s.end), createdAt: ago(s.end), ...s.extra,
    }).onConflictDoNothing();
    // Itemised by challenge — the claim on the marketing page is "every line
    // itemised", and a payout with a single lump total does not prove it.
    for (const [n, c] of challenges.slice(0, 3).entries()) {
      await db.insert(schema.serverPayoutLines).values({
        id: uid(), payoutId, kind: "challenge", label: c.title,
        challengeId: c.id, amount: [42.5, 28, 18.75][n] ?? 15,
      }).onConflictDoNothing();
    }
  }
}

// ===== Challenge requests from server owners =====
async function seedChallengeRequests(db: any) {
  const [existing] = await db.select({ c: sql<number>`count(*)` }).from(schema.challengeRequests);
  if (Number(existing?.c ?? 0) > 0) return;
  const guilds = await db.select().from(schema.discordGuilds);
  if (!guilds.length) return;

  // One of each state, so the review queue shows a decision that was taken both
  // ways rather than only a backlog.
  const rows = [
    { status: "pending", game: "Chess", title: "Weekend Blitz Ladder", days: 7, prizeValue: 100, note: null, at: 1 },
    { status: "approved", game: "Dota 2", title: "Ancient Push Week", days: 7, prizeValue: 150, note: "Approved — scheduled for Monday.", at: 12 },
    { status: "rejected", game: "Chess", title: "24h Bullet Marathon", days: 1, prizeValue: 600, note: "Prize pool is above what this server's size supports. Happy to run it at $150.", at: 20 },
  ];
  for (const [i, r] of rows.entries()) {
    await db.insert(schema.challengeRequests).values({
      id: uid(), guildId: guilds[i % guilds.length].guildId,
      requestedByDiscordId: "900000000000000001",
      game: r.game, provider: r.game === "Chess" ? "chesscom" : "opendota",
      title: r.title, description: `Requested by the server's Cluster admins. ${r.days}-day run.`,
      format: "top3", metric: "wins", days: r.days,
      prizeValue: r.prizeValue, prizeCurrency: "USD",
      prizeDescription: `USD ${r.prizeValue} prize pool`,
      status: r.status, reviewNote: r.note,
      reviewedAt: r.status === "pending" ? null : ago(r.at - 1),
      createdAt: ago(r.at),
    }).onConflictDoNothing();
  }
}

// ===== Payout accounts =====
//
// A preference word and an opaque provider handle. NOTHING else — no account
// number, no IBAN, no card. docs/PAYMENTS.md is the reason, and a demo that
// seeded a plausible-looking bank field would be teaching the wrong shape.
async function seedPayoutAccounts(db: any, gamers: { id: string; slug: string }[]) {
  const [existing] = await db.select({ c: sql<number>`count(*)` }).from(schema.payoutAccounts);
  if (Number(existing?.c ?? 0) > 0) return;
  const prefs = ["paypal", "bank", "wise"];
  for (const [i, g] of gamers.slice(0, 3).entries()) {
    await db.insert(schema.payoutAccounts).values({
      id: uid(), ownerType: "gamer", ownerId: g.id,
      providerKey: "demo", providerRecipientId: `demo-recipient-${g.slug}`,
      methodPreference: prefs[i], country: ["EG", "GB", "AE"][i], currency: "USD",
      status: "active",
    }).onConflictDoNothing();
  }
}

// ===== Chrome art the demo can actually be judged on =====
//
// `brand.nav.bg` shipped empty, so the demo's nav was a flat panel and the whole
// nav-group background treatment — one shared image under the bar, the
// Profile-of-the-Week strip and the expanded panel — was invisible and
// untestable. An admin sets this in Brand Kit; the demo needs a default so the
// chrome it is meant to be showing off is actually on.
//
// Only fills when unset, so an admin's own upload is never clobbered.
// Written straight to `platform_settings`, which is where `setContent` puts it.
// NOT through `lib/cms`: that module resolves the request locale and so reaches
// `next/headers`, and pulling that into the seed's module graph breaks the
// production build outright — the seed is imported by the database bootstrap.
// Same trap the week-key lookup fell into; the fix is the same shape.
async function seedNavArt(db: any) {
  const [existing] = await db.select().from(schema.platformSettings)
    .where(eq(schema.platformSettings.key, "brand.nav.bg")).limit(1);
  if (existing?.value) return;
  const { BANNER_ART } = await import("@/lib/assets");
  await db.insert(schema.platformSettings)
    .values({ key: "brand.nav.bg", value: BANNER_ART.profileDefault, updatedAt: new Date() })
    .onConflictDoNothing();
}

// ===== The captured screenshots =====
//
// `scripts/capture-shots.mjs` drives a production build with a browser and
// writes `public/shots/<key>.png` for every entry in SHOT_REGISTRY. Those PNGs
// are committed, so this only has to point each `feature_shots` row at its file
// and fill in the words.
//
// Files rather than an upload on purpose: a screenshot of the product is part of
// the product's source. Committed, the same picture ships to every environment,
// a diff shows when one changed, and an install with no Blob store configured
// still has real evidence behind its claims instead of placeholders.
//
// Idempotent, and deliberately NON-DESTRUCTIVE: a row whose `imageUrl` already
// points somewhere else was replaced by an admin at /admin/shots, and a re-seed
// must not undo that. Their upload wins forever.
//
// KEEP THAT SKIP through the V1.R recapture. A bulk recapture that removes it
// refreshes our own screenshots AND overwrites every one the customer replaced,
// which is a different and much worse operation. The plan says so at V1.R; this
// is the code it is talking about.
async function seedFeatureShots(db: any) {
  const { SHOT_REGISTRY } = await import("@/lib/shots");
  const existing = await db.select().from(schema.featureShots);
  const byKey = new Map(existing.map((r: { key: string }) => [r.key, r]));

  for (const def of SHOT_REGISTRY) {
    const row = byKey.get(def.key) as { imageUrl?: string | null } | undefined;
    // Page captures are JPEG, card renders are PNG — see scripts/capture-shots.
    // Twenty-eight full-page PNGs at 2x weighed 28MB; as JPEG they weigh 3.7MB
    // and look identical at display size. Cards stay PNG because they are copied
    // byte-for-byte from the render endpoint rather than re-encoded.
    const bundled = `/shots/${def.key}.${def.capturedFrom.startsWith("/api/card/") ? "png" : "jpg"}`;
    // An admin's replacement is anything that is not the bundled path.
    if (row?.imageUrl && row.imageUrl !== bundled) continue;
    await db.insert(schema.featureShots).values({
      key: def.key,
      imageUrl: bundled,
      // Sensible starting words, all of them editable. The claim is what the
      // shot is evidence FOR, so it makes an honest first caption and an honest
      // first alt text — and an admin rewriting either is one field on one page.
      caption: def.claim,
      altText: `${def.claim} — a screenshot of the real screen on Cluster.`,
      claim: def.claim,
      capturedFrom: def.capturedFrom,
      capturedAt: new Date(),
      // 1440x900 at deviceScaleFactor 1.5, which is what the capture script uses.
      // Recorded so <FeatureShot> can reserve the right box and the page never
      // shifts as the image lands.
      width: 2160, height: 1350,
    }).onConflictDoUpdate({
      target: schema.featureShots.key,
      set: { imageUrl: bundled, capturedFrom: def.capturedFrom, capturedAt: new Date(), updatedAt: new Date() },
    });
  }
}

// ===== The audit trail =====
//
// Every admin action is supposed to leave one. An empty log makes it impossible
// to see that, or to review the screen that displays it.
async function seedAuditTrail(db: any, adminId: string) {
  const [existing] = await db.select({ c: sql<number>`count(*)` }).from(schema.auditLog);
  if (Number(existing?.c ?? 0) > 0) return;
  const entries = [
    { action: "challenge.publish", targetType: "challenge", meta: { title: "NebulaTech Chess Challenge — week 4" }, days: 3 },
    { action: "creative.approve", targetType: "creative", meta: { name: "GPU hero 970x250" }, days: 5 },
    { action: "invoice.issue", targetType: "invoice", meta: { number: "CG-1042" }, days: 12 },
    { action: "redeem.approve", targetType: "redeem", meta: { amount: 25 }, days: 8 },
    { action: "payout.send", targetType: "server_payout", meta: { guild: "Chess Legion" }, days: 56 },
    { action: "brand.create", targetType: "brand", meta: { name: "Ionmark" }, days: 21 },
  ];
  for (const e of entries) {
    await db.insert(schema.auditLog).values({
      id: uid(), adminId, action: e.action, targetType: e.targetType,
      targetId: uid(), meta: e.meta, createdAt: ago(e.days),
    }).onConflictDoNothing();
  }
}
