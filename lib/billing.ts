import { and, desc, eq, gte, inArray, sql } from "drizzle-orm";
import { getDb, schema } from "@/lib/db";
import { PRICING_DEFAULTS, type PricingConfig } from "@/lib/pricing";
import { challengeEarning, ownerPctFor, clusterPctFor } from "@/lib/server-earnings";

// The books.
//
// Cluster's whole claim to a brand is that the buy is the only cost — no setup,
// no ad ops, no account management — and its whole claim to a server owner is
// that they get a real share. Both are only true if this reconciles. So this
// module answers four questions with counted numbers:
//
//   1. What did brands buy, and has it been billed?
//   2. What did we promise gamers, and has it been paid?
//   3. What did each server earn, and from which challenge?
//   4. For each challenge, which server did each of first, second and third
//      come from — because that is what decides who gets paid what.
//
// Nothing here is projected. A month with no campaigns reports nothing rather
// than a run rate.

const round2 = (n: number) => Math.round(n * 100) / 100;

export type CampaignBill = {
  campaignId: string;
  brandId: string;
  brandName: string;
  game: string;
  status: string;
  startAt: Date;
  slots: number;
  total: number;
  /** Weeks that actually became live challenges. */
  delivered: number;
  /** The prize money those weeks committed us to. */
  prizeCommitted: number;
  /** What we keep before server shares. */
  grossFee: number;
};

export type PodiumPayout = {
  challengeId: string;
  title: string;
  game: string;
  endAt: Date;
  brandName: string | null;
  /** Where each of 1st, 2nd, 3rd came from. */
  places: { place: number; gamer: string; slug: string | null; guildName: string | null; amount: number }[];
  /** How many distinct servers had somebody on the podium. */
  serversWithWinners: number;
  /** What the whole podium paid out. */
  paidOut: number;
};

export type ServerEarningRow = {
  guildId: string;
  name: string;
  linked: number;
  ownerPct: number;
  clusterPct: number;
  challenges: number;
  owed: number;
};

export type BillingSummary = {
  campaigns: CampaignBill[];
  podiums: PodiumPayout[];
  servers: ServerEarningRow[];
  totals: {
    /** Booked from brands. */
    booked: number;
    /** Of that, the part whose weeks have actually run. */
    delivered: number;
    /** Prize money owed or paid to gamers. */
    toGamers: number;
    /** Owed to server owners out of the platform fee. */
    toServers: number;
    /** What Cluster keeps after both. */
    kept: number;
  };
  cfg: PricingConfig;
};

const EMPTY: BillingSummary = {
  campaigns: [], podiums: [], servers: [],
  totals: { booked: 0, delivered: 0, toGamers: 0, toServers: 0, kept: 0 },
  cfg: PRICING_DEFAULTS,
};

export async function billingSummary(
  cfg: PricingConfig = PRICING_DEFAULTS,
  sinceDays = 90,
): Promise<BillingSummary> {
  try {
    const db = await getDb();
    const since = new Date(Date.now() - sinceDays * 86400000);

    const [campaigns, brands, sponsored] = await Promise.all([
      db.select().from(schema.sponsoredCampaigns)
        .where(gte(schema.sponsoredCampaigns.createdAt, since))
        .orderBy(desc(schema.sponsoredCampaigns.createdAt)).limit(200),
      db.select({ id: schema.brands.id, name: schema.brands.name }).from(schema.brands),
      db.select({
        id: schema.challenges.id,
        title: schema.challenges.title,
        game: schema.challenges.game,
        endAt: schema.challenges.endAt,
        status: schema.challenges.status,
        price: schema.challenges.sponsorPrice,
        brandId: schema.challenges.sponsorBrandId,
      }).from(schema.challenges)
        .where(sql`${schema.challenges.sponsorPrice} > 0`)
        .orderBy(desc(schema.challenges.endAt)).limit(100),
    ]);
    const brandName = new Map(brands.map((b) => [b.id, b.name]));

    // ===== 1. What brands bought =====
    const bills: CampaignBill[] = campaigns.map((c) => {
      const slots = (c.slotState ?? []) as { status: string }[];
      const delivered = slots.filter((s) => s.status === "live" || s.status === "done").length;
      return {
        campaignId: c.id,
        brandId: c.brandId,
        brandName: brandName.get(c.brandId) ?? "Unknown brand",
        game: c.game,
        status: c.status,
        startAt: c.startAt,
        slots: c.slots,
        total: c.total,
        delivered,
        prizeCommitted: round2(delivered * cfg.prizePool),
        grossFee: round2(delivered * Math.max(0, c.pricePerChallenge - cfg.prizePool)),
      };
    });

    // ===== 2 & 4. Who won, from where, and what it paid =====
    const finished = sponsored.filter((c) => c.status === "completed");
    const podiums: PodiumPayout[] = [];
    for (const c of finished.slice(0, 40)) {
      const winners = await db.select({
        place: schema.challengeParticipants.finalPlacement,
        userId: schema.challengeParticipants.userId,
        name: schema.users.displayName,
        slug: schema.users.slug,
      }).from(schema.challengeParticipants)
        .innerJoin(schema.users, eq(schema.challengeParticipants.userId, schema.users.id))
        .where(and(
          eq(schema.challengeParticipants.challengeId, c.id),
          sql`${schema.challengeParticipants.finalPlacement} in (1,2,3)`,
        ));
      if (!winners.length) continue;

      // Which server each winner came to us through. A gamer can be in several
      // servers; the one that counts is where they first linked, because that
      // is the community that actually brought them.
      const ids = winners.map((w) => w.userId);
      const via = await db.select({
        userId: schema.discordGuildMembers.userId,
        guildId: schema.discordGuildMembers.guildId,
        name: schema.discordGuilds.name,
        firstLinkedAt: schema.discordGuildMembers.firstLinkedAt,
      }).from(schema.discordGuildMembers)
        .leftJoin(schema.discordGuilds, eq(schema.discordGuildMembers.guildId, schema.discordGuilds.guildId))
        .where(and(
          inArray(schema.discordGuildMembers.userId, ids),
          sql`${schema.discordGuildMembers.firstLinkedAt} is not null`,
        ));
      const homeOf = new Map<string, { guildId: string; name: string | null }>();
      for (const v of via) {
        const prev = homeOf.get(v.userId);
        if (!prev) homeOf.set(v.userId, { guildId: v.guildId, name: v.name });
      }

      const prize = (place: number) =>
        place === 1 ? cfg.prize1 : place === 2 ? cfg.prize2 : cfg.prize3;

      const places = winners
        .map((w) => ({
          place: w.place ?? 0,
          gamer: w.name,
          slug: w.slug,
          guildName: homeOf.get(w.userId)?.name ?? null,
          amount: prize(w.place ?? 0),
        }))
        .sort((a, b) => a.place - b.place);

      podiums.push({
        challengeId: c.id,
        title: c.title,
        game: c.game,
        endAt: c.endAt,
        brandName: c.brandId ? brandName.get(c.brandId) ?? null : null,
        places,
        serversWithWinners: new Set(
          winners.map((w) => homeOf.get(w.userId)?.guildId).filter(Boolean),
        ).size,
        paidOut: round2(places.reduce((a, p) => a + p.amount, 0)),
      });
    }

    // ===== 3. What each server is owed =====
    const [guilds, linkedCounts, entrantsByGuild] = await Promise.all([
      db.select({
        guildId: schema.discordGuilds.guildId,
        name: schema.discordGuilds.name,
      }).from(schema.discordGuilds).where(eq(schema.discordGuilds.status, "active")),
      db.select({
        guildId: schema.discordGuildMembers.guildId,
        n: sql<number>`count(${schema.discordGuildMembers.firstLinkedAt})`,
      }).from(schema.discordGuildMembers).groupBy(schema.discordGuildMembers.guildId),
      // Entrants per (challenge, server) — the apportionment the earnings model
      // needs to split one challenge's fee across the servers that supplied it.
      db.select({
        challengeId: schema.challengeParticipants.challengeId,
        guildId: schema.discordGuildMembers.guildId,
        n: sql<number>`count(distinct ${schema.challengeParticipants.userId})`,
      }).from(schema.challengeParticipants)
        .innerJoin(schema.discordGuildMembers, eq(schema.challengeParticipants.userId, schema.discordGuildMembers.userId))
        .where(inArray(schema.challengeParticipants.challengeId, sponsored.map((c) => c.id)))
        .groupBy(schema.challengeParticipants.challengeId, schema.discordGuildMembers.guildId),
    ]);

    const linkedBy = new Map(linkedCounts.map((l) => [l.guildId, Number(l.n ?? 0)]));
    const totalEntrants = new Map<string, number>();
    for (const e of entrantsByGuild) {
      totalEntrants.set(e.challengeId, (totalEntrants.get(e.challengeId) ?? 0) + Number(e.n ?? 0));
    }

    const owedBy = new Map<string, { owed: number; challenges: number }>();
    for (const e of entrantsByGuild) {
      const linked = linkedBy.get(e.guildId) ?? 0;
      const share = challengeEarning({
        linked,
        entrants: Number(e.n ?? 0),
        totalEntrants: totalEntrants.get(e.challengeId) ?? 0,
        cfg,
      });
      if (share.owner <= 0) continue;
      const prev = owedBy.get(e.guildId) ?? { owed: 0, challenges: 0 };
      owedBy.set(e.guildId, { owed: round2(prev.owed + share.owner), challenges: prev.challenges + 1 });
    }

    const servers: ServerEarningRow[] = guilds
      .map((g) => {
        const linked = linkedBy.get(g.guildId) ?? 0;
        const o = owedBy.get(g.guildId);
        return {
          guildId: g.guildId,
          name: g.name || g.guildId,
          linked,
          ownerPct: ownerPctFor(linked),
          clusterPct: clusterPctFor(linked),
          challenges: o?.challenges ?? 0,
          owed: o?.owed ?? 0,
        };
      })
      .filter((s) => s.owed > 0 || s.linked > 0)
      .sort((a, b) => b.owed - a.owed || b.linked - a.linked);

    const booked = round2(bills.reduce((a, b) => a + b.total, 0));
    const delivered = round2(bills.reduce((a, b) => a + b.delivered * (b.total / Math.max(1, b.slots)), 0));
    const toGamers = round2(bills.reduce((a, b) => a + b.prizeCommitted, 0));
    const toServers = round2(servers.reduce((a, s) => a + s.owed, 0));

    return {
      campaigns: bills,
      podiums,
      servers,
      totals: {
        booked, delivered, toGamers, toServers,
        kept: round2(delivered - toGamers - toServers),
      },
      cfg,
    };
  } catch { return { ...EMPTY, cfg }; }
}
