import { and, desc, eq, inArray, sql } from "drizzle-orm";
import { getDb, schema } from "@/lib/db";
import { uid } from "@/lib/utils";
import { PRICING_DEFAULTS, type PricingConfig } from "@/lib/pricing";
import { parseCommunity } from "@/lib/discord/community";
import { DEFAULT_UNLOCK_THRESHOLD } from "@/lib/discord/guilds";

// Buying a month of sponsored challenges.
//
// This is the media buy, and it is deliberately not a subscription. A brand
// picks a game, sees who it reaches, and buys four weekly challenges: one
// month, one payment, done. If it worked they buy another month; if it didn't
// they don't, and nothing has to be cancelled. A first campaign that requires a
// standing commitment is a first campaign that doesn't happen.
//
// Four is the floor because one challenge is a post and four is a campaign —
// a brand needs the second week to see whether the first one meant anything,
// and the Sunday show features each of the four in turn.
//
// The four are NOT created at once. Only the first becomes a live challenge;
// the next opens when it ends. A game runs ONE sponsored challenge at a time,
// because two competing on the same game in the same week split the field and
// make both look empty. Buying a second game runs a second, independent queue.

export const SLOTS_PER_CAMPAIGN = 4;
export const SLOT_DAYS = 7;

export type Slot = {
  index: number;
  startAt: string;
  endAt: string;
  coverUrl?: string | null;
  requestId?: string | null;
  challengeId?: string | null;
  status: "waiting" | "requested" | "live" | "done";
};

export type Campaign = typeof schema.sponsoredCampaigns.$inferSelect;

/** What one game costs for a month, and what the money does. */
export function campaignQuote(cfg: PricingConfig = PRICING_DEFAULTS, slots = SLOTS_PER_CAMPAIGN) {
  const n = Math.max(SLOTS_PER_CAMPAIGN, Math.round(slots));
  return {
    slots: n,
    pricePerChallenge: cfg.challengePrice,
    prizePerChallenge: cfg.prizePool,
    feePerChallenge: Math.max(0, cfg.challengePrice - cfg.prizePool),
    total: cfg.challengePrice * n,
    prizeTotal: cfg.prizePool * n,
    /** The share of the buy that reaches gamers. Always shown, never rounded up. */
    prizeSharePct: cfg.challengePrice > 0 ? Math.round((cfg.prizePool / cfg.challengePrice) * 100) : 0,
  };
}

/**
 * The next Monday, in UTC.
 *
 * Weeks start on Monday because the platform's other week does — Profile of the
 * Week runs Monday to Saturday — and a campaign whose weeks are offset from the
 * show that features it is a reporting problem forever.
 */
export function nextMonday(from = new Date()): Date {
  const d = new Date(Date.UTC(from.getUTCFullYear(), from.getUTCMonth(), from.getUTCDate()));
  const shift = (8 - d.getUTCDay()) % 7 || 7;
  d.setUTCDate(d.getUTCDate() + shift);
  return d;
}

/** The four weekly windows a brand is buying, as dates they can read. */
export function slotWindows(startAt: Date, slots = SLOTS_PER_CAMPAIGN): { startAt: Date; endAt: Date }[] {
  return Array.from({ length: slots }, (_, i) => {
    const s = new Date(startAt.getTime() + i * SLOT_DAYS * 86400000);
    return { startAt: s, endAt: new Date(s.getTime() + SLOT_DAYS * 86400000) };
  });
}

export function freshSlots(startAt: Date, slots = SLOTS_PER_CAMPAIGN, coverUrl?: string | null): Slot[] {
  return slotWindows(startAt, slots).map((w, i) => ({
    index: i,
    startAt: w.startAt.toISOString(),
    endAt: w.endAt.toISOString(),
    coverUrl: coverUrl ?? null,
    requestId: null,
    challengeId: null,
    status: "waiting",
  }));
}

// ===== Reach =====

export type GameReach = {
  game: string;
  /** Servers whose owners said their community plays this game. */
  servers: number;
  /** Of those, the ones that have crossed the unlock threshold. */
  unlockedServers: number;
  /** Linked gamers in those servers — who a challenge here can reach. */
  gamers: number;
  /** Gamers on the whole network with a linked account for this game. */
  verifiedPlayers: number;
  /** Where those servers say their members are. */
  regions: { key: string; label: string; servers: number; gamers: number }[];
};

export type NetworkReach = {
  /** Every server with the bot, and every server that can carry a sponsored challenge. */
  servers: number;
  unlockedServers: number;
  /** Every linked gamer the network reaches, across all games. */
  gamers: number;
  byGame: GameReach[];
};

/**
 * What a brand is choosing between, counted.
 *
 * Shown at the top of the builder before a game is picked (the network numbers)
 * and again once one is (that game's own). Nothing here is projected: a game
 * with no described servers reports zero rather than an estimate, because the
 * first number a media buyer checks is the one that decides whether they trust
 * the rest.
 */
export async function networkReach(): Promise<NetworkReach> {
  const empty: NetworkReach = { servers: 0, unlockedServers: 0, gamers: 0, byGame: [] };
  try {
    const db = await getDb();
    const [guilds, counts, games, accounts] = await Promise.all([
      db.select({
        guildId: schema.discordGuilds.guildId,
        community: schema.discordGuilds.community,
        unlockedAt: schema.discordGuilds.adUnlockedAt,
      }).from(schema.discordGuilds).where(eq(schema.discordGuilds.status, "active")),
      db.select({
        guildId: schema.discordGuildMembers.guildId,
        linked: sql<number>`count(${schema.discordGuildMembers.firstLinkedAt})`,
      }).from(schema.discordGuildMembers).groupBy(schema.discordGuildMembers.guildId),
      db.select({ name: schema.games.name }).from(schema.games)
        .where(eq(schema.games.isActive, true)).orderBy(schema.games.sortOrder),
      // Verified players per game: a linked account IS the verification, and it
      // is the number a brand should weigh most — it does not depend on an
      // owner remembering to describe their server. Counted by PROVIDER, which
      // is what an account records; the provider registry maps it to the game.
      db.select({ provider: schema.linkedGameAccounts.provider, n: sql<number>`count(distinct ${schema.linkedGameAccounts.userId})` })
        .from(schema.linkedGameAccounts).groupBy(schema.linkedGameAccounts.provider),
    ]);

    const linkedBy = new Map(counts.map((c) => [c.guildId, Number(c.linked ?? 0)]));
    const { PROVIDERS } = await import("@/lib/providers/registry");
    const gameOf = new Map(PROVIDERS.map((p) => [p.id, p.game]));
    const verifiedBy = new Map<string, number>();
    for (const a of accounts) {
      const game = gameOf.get(a.provider);
      if (!game) continue;
      verifiedBy.set(game, (verifiedBy.get(game) ?? 0) + Number(a.n ?? 0));
    }
    const { REGIONS } = await import("@/lib/discord/community");
    const regionLabels = new Map(REGIONS.map((r) => [r.key, r.label]));

    // Only games a challenge can be SCORED on reach the buying bar. Offering a
    // game we can identify but not rank means a brand picks it, pays, and then
    // hears it can't run — the worst possible first minute of a media buy.
    const { linkableProvider } = await import("@/lib/providers/registry");
    const byGame = new Map<string, GameReach>();
    for (const g of games) {
      if (!linkableProvider(g.name)) continue;
      byGame.set(g.name, {
        game: g.name, servers: 0, unlockedServers: 0, gamers: 0,
        verifiedPlayers: verifiedBy.get(g.name) ?? 0, regions: [],
      });
    }

    let gamers = 0;
    let unlockedServers = 0;
    const regionsPerGame = new Map<string, Map<string, { servers: number; gamers: number }>>();

    for (const guild of guilds) {
      const profile = parseCommunity(guild.community);
      const linked = linkedBy.get(guild.guildId) ?? 0;
      const unlocked = !!guild.unlockedAt || linked >= DEFAULT_UNLOCK_THRESHOLD;
      gamers += linked;
      if (unlocked) unlockedServers++;

      for (const game of profile.games) {
        const row = byGame.get(game);
        if (!row) continue;
        row.servers++;
        row.gamers += linked;
        if (unlocked) row.unlockedServers++;

        const per = regionsPerGame.get(game) ?? new Map();
        for (const key of profile.regions) {
          const r = per.get(key) ?? { servers: 0, gamers: 0 };
          r.servers++;
          r.gamers += linked;
          per.set(key, r);
        }
        regionsPerGame.set(game, per);
      }
    }

    for (const [game, per] of regionsPerGame) {
      const row = byGame.get(game);
      if (!row) continue;
      row.regions = [...per.entries()]
        .map(([key, v]) => ({ key, label: regionLabels.get(key) ?? key, ...v }))
        .sort((a, b) => b.gamers - a.gamers);
    }

    return {
      servers: guilds.length,
      unlockedServers,
      gamers,
      // Sorted by what a brand actually weighs: verified players of that game
      // first, then how much of the network already plays it.
      byGame: [...byGame.values()].sort((a, b) => b.verifiedPlayers - a.verifiedPlayers || b.gamers - a.gamers),
    };
  } catch { return empty; }
}

// ===== Buying =====

export type BuyResult =
  | { ok: true; campaignId: string; requestId: string | null }
  | { ok: false; reason: "no_game" | "unknown_game" | "already_running" | "error"; message: string };

/**
 * Buy a month of challenges on one game.
 *
 * Creates the campaign and opens the FIRST slot as a challenge request that
 * admin reviews. The other three sit visible and waiting: the brand can see
 * their dates and change their covers, and each opens as the one before it
 * finishes.
 */
export async function buyCampaign(input: {
  brandId: string;
  game: string;
  startAt?: Date;
  coverUrl?: string | null;
  /** One cover per slot, when a brand wants four different ones. */
  slotCovers?: (string | null)[];
  targeting?: { regions?: string[]; countries?: string[]; guildIds?: string[] };
  cfg?: PricingConfig;
}): Promise<BuyResult> {
  const game = (input.game ?? "").trim();
  if (!game) return { ok: false, reason: "no_game", message: "Pick a game first." };
  try {
    const db = await getDb();
    const [row] = await db.select({ name: schema.games.name }).from(schema.games)
      .where(and(eq(schema.games.name, game), eq(schema.games.isActive, true))).limit(1);
    if (!row) return { ok: false, reason: "unknown_game", message: "That game isn't one we sync stats for." };

    // Being in the catalogue is not enough to be sellable.
    //
    // Some games we can only identify a player on, not score — VALORANT until
    // Riot approves production access. A challenge there can never be ranked,
    // so buying one would take $1,000 for four weeks that could never open.
    // Checked HERE, before any money or any row, and not left to the slot to
    // discover.
    const { providerForGame } = await import("@/lib/challenge-requests");
    if (!providerForGame(game)) {
      return {
        ok: false, reason: "unknown_game",
        message: `We can identify ${game} players but can't score them yet, so it can't carry a challenge. Pick another game.`,
      };
    }

    // One campaign at a time per brand per game. A second one bought while the
    // first is still running would put two of the same brand's challenges on
    // the same game — the exact thing the one-at-a-time rule exists to stop.
    const [running] = await db.select({ id: schema.sponsoredCampaigns.id })
      .from(schema.sponsoredCampaigns)
      .where(and(
        eq(schema.sponsoredCampaigns.brandId, input.brandId),
        eq(schema.sponsoredCampaigns.game, game),
        inArray(schema.sponsoredCampaigns.status, ["submitted", "running"]),
      )).limit(1);
    if (running) {
      return {
        ok: false, reason: "already_running",
        message: `You already have a month of ${game} challenges running. Buy another game, or wait for this one to finish.`,
      };
    }

    const cfg = input.cfg ?? PRICING_DEFAULTS;
    const q = campaignQuote(cfg);
    const startAt = input.startAt ?? nextMonday();
    const slots = freshSlots(startAt, q.slots, input.coverUrl).map((s) => ({
      ...s,
      coverUrl: input.slotCovers?.[s.index] ?? input.coverUrl ?? null,
    }));

    const campaignId = uid();
    await db.insert(schema.sponsoredCampaigns).values({
      id: campaignId,
      brandId: input.brandId,
      game,
      slots: q.slots,
      pricePerChallenge: q.pricePerChallenge,
      total: q.total,
      status: "submitted",
      startAt,
      coverUrl: input.coverUrl ?? null,
      slotState: slots,
      targeting: input.targeting ?? {},
    });

    const requestId = await openSlot(campaignId, 0);
    return { ok: true, campaignId, requestId };
  } catch { return { ok: false, reason: "error", message: "Couldn't create that campaign. Try again." }; }
}

/**
 * Turn one slot into a challenge request for admin.
 *
 * This is where a brand's purchase becomes something a human reviews. The
 * request lands in the SAME queue as a server owner's, because both end in a
 * challenge with Cluster's name on it — but it carries the brand, so admin sees
 * at a glance that this one is paid inventory rather than a community favour.
 */
export async function openSlot(campaignId: string, index: number): Promise<string | null> {
  try {
    const db = await getDb();
    const [c] = await db.select().from(schema.sponsoredCampaigns)
      .where(eq(schema.sponsoredCampaigns.id, campaignId)).limit(1);
    if (!c) return null;
    const slots = (c.slotState ?? []) as Slot[];
    const slot = slots.find((s) => s.index === index);
    if (!slot || slot.status !== "waiting") return null;

    const [brand] = await db.select({ name: schema.brands.name }).from(schema.brands)
      .where(eq(schema.brands.id, c.brandId)).limit(1);
    const { providerForGame } = await import("@/lib/challenge-requests");
    const provider = providerForGame(c.game);
    if (!provider) return null;

    const cfg = PRICING_DEFAULTS;
    const requestId = uid();
    await db.insert(schema.challengeRequests).values({
      id: requestId,
      // Not a server's request. `guildId` is empty and the brand is set, which
      // is exactly how admin tells the two apart in one query.
      guildId: "",
      brandId: c.brandId,
      campaignId: c.id,
      slotIndex: index,
      game: c.game,
      provider: provider.id,
      title: `${brand?.name ?? "Sponsored"} ${c.game} Challenge — week ${index + 1}`,
      description: `Week ${index + 1} of ${c.slots}, sponsored by ${brand?.name ?? "a brand"}.`,
      days: SLOT_DAYS,
      prizeValue: Math.round(cfg.prizePool),
      prizeCurrency: cfg.currency,
      prizeDescription: `${cfg.currency} ${cfg.prizePool} prize pool — ${cfg.prize1} / ${cfg.prize2} / ${cfg.prize3}`,
      status: "pending",
    });

    await db.update(schema.sponsoredCampaigns).set({
      status: "running",
      slotState: slots.map((s) => (s.index === index ? { ...s, requestId, status: "requested" as const } : s)),
    }).where(eq(schema.sponsoredCampaigns.id, campaignId));

    return requestId;
  } catch { return null; }
}

/**
 * A slot's challenge finished — move the campaign on to the next one.
 *
 * Two ways the next week can begin, and this handles both:
 *
 *  1. **The series already opened it.** A campaign challenge created with a
 *     weekly cadence rolls itself over the moment it closes, so week two is a
 *     live challenge before this runs. The campaign's job is then only to bind
 *     the slot to it — asking staff to approve a week the brand already bought
 *     would stall a paid campaign behind a queue.
 *  2. **Nothing opened it.** Older campaigns whose slots are individually
 *     approved fall back to raising the next request, which is the original
 *     one-at-a-time behaviour.
 *
 * Either way, a game never carries two sponsored competitions at once.
 */
export async function advanceCampaign(
  challengeId: string,
  nextChallengeId?: string | null,
): Promise<string | null> {
  try {
    const db = await getDb();
    const [c] = await db.select().from(schema.sponsoredCampaigns)
      .where(sql`${schema.sponsoredCampaigns.slotState}::text like ${`%${challengeId}%`}`)
      .limit(1);
    if (!c) return null;
    const slots = (c.slotState ?? []) as Slot[];
    const current = slots.find((s) => s.challengeId === challengeId);
    if (!current) return null;

    const done = slots.map((s) => (s.index === current.index ? { ...s, status: "done" as const } : s));
    const next = done.find((s) => s.status === "waiting");

    // The series already produced the next week — bind it and go live.
    if (next && nextChallengeId) {
      const bound = done.map((s) =>
        s.index === next.index
          ? { ...s, challengeId: nextChallengeId, status: "live" as const }
          : s);
      await db.update(schema.sponsoredCampaigns)
        .set({ slotState: bound, status: "running" })
        .where(eq(schema.sponsoredCampaigns.id, c.id));
      return nextChallengeId;
    }

    await db.update(schema.sponsoredCampaigns).set({
      slotState: done,
      status: next ? "running" : "completed",
    }).where(eq(schema.sponsoredCampaigns.id, c.id));

    return next ? openSlot(c.id, next.index) : null;
  } catch { return null; }
}

/** Mark a slot live once its request is approved into a real challenge. */
export async function bindSlotChallenge(campaignId: string, index: number, challengeId: string): Promise<void> {
  try {
    const db = await getDb();
    const [c] = await db.select({ slotState: schema.sponsoredCampaigns.slotState })
      .from(schema.sponsoredCampaigns).where(eq(schema.sponsoredCampaigns.id, campaignId)).limit(1);
    if (!c) return;
    const slots = (c.slotState ?? []) as Slot[];
    await db.update(schema.sponsoredCampaigns).set({
      slotState: slots.map((s) => (s.index === index ? { ...s, challengeId, status: "live" as const } : s)),
    }).where(eq(schema.sponsoredCampaigns.id, campaignId));
  } catch { /* the challenge exists either way; the portal re-syncs on read */ }
}

/** Change the cover on a slot that hasn't gone live yet. */
export async function setSlotCover(campaignId: string, index: number, coverUrl: string | null): Promise<boolean> {
  try {
    const db = await getDb();
    const [c] = await db.select({ slotState: schema.sponsoredCampaigns.slotState })
      .from(schema.sponsoredCampaigns).where(eq(schema.sponsoredCampaigns.id, campaignId)).limit(1);
    if (!c) return false;
    const slots = (c.slotState ?? []) as Slot[];
    const slot = slots.find((s) => s.index === index);
    // A live challenge's cover is already in a message in hundreds of servers.
    // Changing it there is admin's call, not a silent edit from the portal.
    if (!slot || slot.status === "live" || slot.status === "done") return false;
    await db.update(schema.sponsoredCampaigns).set({
      slotState: slots.map((s) => (s.index === index ? { ...s, coverUrl } : s)),
    }).where(eq(schema.sponsoredCampaigns.id, campaignId));
    return true;
  } catch { return false; }
}

export async function brandCampaigns(brandId: string): Promise<Campaign[]> {
  try {
    const db = await getDb();
    return await db.select().from(schema.sponsoredCampaigns)
      .where(eq(schema.sponsoredCampaigns.brandId, brandId))
      .orderBy(desc(schema.sponsoredCampaigns.createdAt));
  } catch { return []; }
}

export async function getCampaign(id: string): Promise<Campaign | null> {
  try {
    const db = await getDb();
    const [c] = await db.select().from(schema.sponsoredCampaigns)
      .where(eq(schema.sponsoredCampaigns.id, id)).limit(1);
    return c ?? null;
  } catch { return null; }
}

/** Is this game already carrying somebody's sponsored challenge? */
export async function gameIsBusy(game: string): Promise<boolean> {
  try {
    const db = await getDb();
    const [live] = await db.select({ id: schema.challenges.id })
      .from(schema.challenges)
      .where(and(
        eq(schema.challenges.game, game),
        eq(schema.challenges.status, "active"),
        sql`${schema.challenges.sponsorPrice} > 0`,
      )).limit(1);
    return !!live;
  } catch { return false; }
}
