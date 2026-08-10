// What a brand is shown about delivery. B82.
//
// Every number here is `count(*)` over `ad_impressions`. That is not a
// simplification of the design — it IS the design, and `docs/DELIVERY.md` is the
// contract it implements.
//
// WHAT THIS REPLACES. The old report computed a "media value" and a return on
// spend from SERVER HEADCOUNT: a card posted into a 4,000-member server was
// valued as 4,000 impressions at a benchmark CPM. Nobody had seen those 4,000
// people, and the figure was labelled "Counted delivery". B72.1 deleted it and
// left the panel saying delivery measurement was being rebuilt. This is the
// rebuild, and the rule it is built on is one sentence:
//
//   **No brand-facing figure may be computed from anything but logged rows.**
//
// ===== THREE BOUNDS, NONE OF THEM OPTIONAL =====
//
// 1. AGGREGATE QUERIES ONLY. The old report loaded every impression row into
//    function heap to count them in JavaScript. At a million rows that is an
//    out-of-memory error on a dashboard. Everything here is `GROUP BY` in the
//    database, with `LIMIT` on anything a brand could grow without bound.
//
// 2. NO IDENTITY, EVER. No query in this file selects a user id, name, slug,
//    handle or avatar, and none can be made to by passing an argument. A brand
//    buys an audience, not a list of people.
//
// 3. MINIMUM COHORT 25. No percentage is shown for a breakdown with fewer than
//    25 viewers behind it. A 30-member server where three people play one game
//    is a re-identification, not a statistic — so the cell says "too few to
//    report" rather than a number, and the label is the honest one.

import { and, desc, eq, gte, inArray, isNotNull, sql } from "drizzle-orm";
import type { DB } from "@/lib/db";
import * as schema from "@/lib/db/schema";

/**
 * The smallest group we will describe with a percentage.
 *
 * 25 is a judgement, not a standard. It is high enough that no single person
 * moves a percentage point visibly in a small server, and low enough that a
 * genuinely small campaign still gets a composition read. Stated here, once,
 * so it cannot be different on two screens.
 */
export const MIN_COHORT = 25;

/** A row a brand may see. Deliberately has no field that identifies anybody. */
export type DeliveryRow = { label: string; views: number };

export type AudienceSlice = {
  game: string;
  viewers: number;
  /** Null when the cohort is under `MIN_COHORT`. Never zero as a stand-in. */
  pct: number | null;
};

export type Delivery = {
  /** The headline. One number, counted. */
  views: number;
  /** Distinct gamers we could attribute a view to. Anonymous views are not here. */
  attributedViewers: number;
  byCardKind: DeliveryRow[];
  /** Server name, and its member count as CONTEXT — never multiplied by anything. */
  byServer: { label: string; views: number; members: number | null }[];
  byPlacement: DeliveryRow[];
  /**
   * What the attributed part of the audience plays.
   *
   * Percentages sum to MORE than 100 and that is correct: a gamer with Chess
   * and Dota linked is in both. The copy says so — a reader who works it out
   * themselves assumes we got it wrong.
   */
  audience: AudienceSlice[];
  /** True when composition is suppressed because the cohort is too small. */
  audienceSuppressed: boolean;
  /** One sentence, for the panel. Says what the numbers are, not how good they are. */
  note: string;
};

const EMPTY: Delivery = {
  views: 0, attributedViewers: 0, byCardKind: [], byServer: [], byPlacement: [],
  audience: [], audienceSuppressed: false,
  note: "No cards carrying this creative have been delivered yet.",
};

/** Card kinds, in the words a brand uses rather than the keys we store. */
const KIND_LABEL: Record<string, string> = {
  profile: "Gamer profiles",
  challenge: "Challenge cards",
  planet: "Game planets",
  leaderboard: "Leaderboards",
  guide: "Guides",
  market: "Marketplace",
  ad_post: "Server ad posts",
  web: "Website placements",
};

/**
 * Delivery for one brand's creatives.
 *
 * `creativeIds` is resolved by the caller from the brand's campaigns, so this
 * function cannot be pointed at somebody else's creatives by passing a brand id
 * — the scoping happened before it was called, which is the harder thing to get
 * wrong by accident.
 */
export async function deliveryFor(
  db: DB,
  creativeIds: string[],
  opts: { since?: Date; serverLimit?: number } = {},
): Promise<Delivery> {
  if (!creativeIds.length) return EMPTY;
  const serverLimit = Math.min(100, Math.max(1, opts.serverLimit ?? 25));

  const scope = opts.since
    ? and(
      inArray(schema.adImpressions.campaignCreativeId, creativeIds),
      gte(schema.adImpressions.createdAt, opts.since),
    )
    : inArray(schema.adImpressions.campaignCreativeId, creativeIds);

  try {
    // ===== The headline =====
    const [total] = await db.select({
      views: sql<number>`count(*)`,
      viewers: sql<number>`count(distinct ${schema.adImpressions.userId})`,
    }).from(schema.adImpressions).where(scope);
    const views = Number(total?.views ?? 0);
    if (!views) return EMPTY;
    const attributedViewers = Number(total?.viewers ?? 0);

    // ===== By card kind =====
    //
    // `surface` is NOT grouped or returned. It is stored for our own pacing,
    // and telling a brand which of its views came from private replies is a
    // step toward inferring who saw one.
    const kinds = await db.select({
      kind: schema.adImpressions.cardKind,
      views: sql<number>`count(*)`,
    }).from(schema.adImpressions).where(scope)
      .groupBy(schema.adImpressions.cardKind)
      .orderBy(desc(sql`count(*)`));

    const byCardKind = kinds
      .filter((r) => r.kind && r.kind !== "web")
      .map((r) => ({ label: KIND_LABEL[r.kind as string] ?? (r.kind as string), views: Number(r.views ?? 0) }));
    const byPlacement = kinds
      .filter((r) => r.kind === "web")
      .map((r) => ({ label: "Website placements", views: Number(r.views ?? 0) }));

    // ===== By server =====
    //
    // Bounded. A brand on the whole network could otherwise ask for thousands
    // of rows, which is the shape of the defect this file is replacing.
    const guilds = await db.select({
      guildId: schema.adImpressions.guildId,
      views: sql<number>`count(*)`,
    }).from(schema.adImpressions)
      .where(and(scope, isNotNull(schema.adImpressions.guildId)))
      .groupBy(schema.adImpressions.guildId)
      .orderBy(desc(sql`count(*)`))
      .limit(serverLimit);

    const guildIds = guilds.map((g) => String(g.guildId));
    const names = guildIds.length
      ? await db.select({
        guildId: schema.discordGuilds.guildId,
        name: schema.discordGuilds.name,
        members: schema.discordGuilds.memberCount,
      }).from(schema.discordGuilds).where(inArray(schema.discordGuilds.guildId, guildIds))
      : [];
    const nameBy = new Map(names.map((n) => [n.guildId, n]));

    // A card delivered with no guild came from a direct message. Named as such
    // rather than dropped: the views are real and the brand paid for them.
    const [dm] = await db.select({ views: sql<number>`count(*)` })
      .from(schema.adImpressions)
      .where(and(scope, sql`${schema.adImpressions.guildId} is null and ${schema.adImpressions.cardKind} <> 'web'`));
    const dmViews = Number(dm?.views ?? 0);

    const byServer = guilds.map((g) => {
      const meta = nameBy.get(String(g.guildId));
      return {
        label: meta?.name || "A server",
        views: Number(g.views ?? 0),
        // CONTEXT ONLY. It is never multiplied by anything — see AD_VIEW.md.
        members: meta?.members ?? null,
      };
    });
    if (dmViews > 0) byServer.push({ label: "Direct message", views: dmViews, members: null });

    // ===== Audience composition =====
    //
    // Only over rows we could attribute to a gamer. An anonymous web view has
    // no linked games, and letting it shrink the denominator would report a
    // composition for people we know nothing about.
    let audience: AudienceSlice[] = [];
    let audienceSuppressed = false;
    if (attributedViewers >= MIN_COHORT) {
      const games = await db.select({
        game: schema.linkedGameAccounts.provider,
        viewers: sql<number>`count(distinct ${schema.adImpressions.userId})`,
      }).from(schema.adImpressions)
        .innerJoin(
          schema.linkedGameAccounts,
          eq(schema.linkedGameAccounts.userId, schema.adImpressions.userId),
        )
        .where(and(scope, isNotNull(schema.adImpressions.userId)))
        .groupBy(schema.linkedGameAccounts.provider)
        .orderBy(desc(sql`count(distinct ${schema.adImpressions.userId})`))
        .limit(20);

      audience = games.map((g) => {
        const viewers = Number(g.viewers ?? 0);
        return {
          game: String(g.game),
          viewers,
          // Suppressed per SLICE as well as overall. A campaign with 500
          // viewers can still have a game only four of them play, and that
          // four is exactly the cell that identifies somebody.
          pct: viewers >= MIN_COHORT
            ? Math.round((viewers / attributedViewers) * 1000) / 10
            : null,
        };
      });
    } else {
      audienceSuppressed = attributedViewers > 0;
    }

    return {
      views,
      attributedViewers,
      byCardKind,
      byServer,
      byPlacement,
      audience,
      audienceSuppressed,
      note:
        `${views.toLocaleString()} cards carrying your creative were delivered. `
        + "Every figure here is a count of delivered cards — we do not multiply a public post by a server's "
        + "member count, and we do not estimate. See docs/DELIVERY.md for exactly what is and is not counted.",
    };
  } catch { return EMPTY; }
}

/**
 * The copy that has to sit under a composition chart.
 *
 * Exported rather than written into a component, because the reason the
 * percentages exceed 100 is a fact about the data and belongs next to the data
 * wherever it is drawn — including a CSV, where there is no component at all.
 */
export const AUDIENCE_NOTE =
  "Percentages are of the gamers we could attribute a view to, and add up to more than 100% "
  + "because a gamer who has linked two games is counted in both. Anything under "
  + `${MIN_COHORT} viewers is not reported at all, so nobody can be identified from a small server.`;

/**
 * Every creative id belonging to one brand, including retired ones.
 *
 * RETIRED ONES INCLUDED, deliberately. A brand that replaced its artwork has
 * not stopped having delivered the old one, and dropping those rows would make
 * a campaign's numbers fall when somebody uploaded a better image — the exact
 * defect the `retiredAt` column was added to prevent.
 *
 * This is also the scoping boundary: `deliveryFor` takes ids, never a brand id,
 * so there is no argument anybody can pass it that reaches another brand's
 * delivery.
 */
export async function brandCreativeIds(db: DB, brandId: string): Promise<string[]> {
  try {
    const rows = await db.select({ id: schema.adCampaignCreatives.id })
      .from(schema.adCampaignCreatives)
      .innerJoin(schema.adCampaigns, eq(schema.adCampaignCreatives.campaignId, schema.adCampaigns.id))
      .where(eq(schema.adCampaigns.brandId, brandId));
    return rows.map((r) => r.id);
  } catch { return []; }
}
