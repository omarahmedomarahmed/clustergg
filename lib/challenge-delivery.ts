import { and, eq, inArray, sql } from "drizzle-orm";
import { getDb, schema } from "@/lib/db";
import { uid } from "@/lib/utils";

// Who a challenge announcement actually reached.
//
// "How many people saw it" is the first question a brand asks and the easiest
// one to answer dishonestly. So the answer is a ledger, not a calculation: at
// the moment we post a challenge into a server we write down that server and
// how many members it had, and that row is never touched again. Recomputing it
// later from today's server sizes would silently rewrite every past campaign's
// numbers each time a server grew — which is exactly the kind of number a media
// buyer is right to distrust.
//
// The unique index on (challenge, guild, kind) is what makes this idempotent. A
// retrying cron, a second announcement, or staff pressing the button again all
// land on the same row rather than inflating the count.

export type DeliveryKind = "launch" | "ending" | "result";

export type Delivery = { guildId: string; members: number; linked: number };

/** Record a fan-out. Never throws — an announcement that posted still counts. */
export async function recordDeliveries(
  challengeId: string,
  guildIds: string[],
  kind: DeliveryKind = "launch",
): Promise<number> {
  const ids = [...new Set(guildIds.filter(Boolean))];
  if (!challengeId || !ids.length) return 0;
  try {
    const db = await getDb();
    // Server size at the moment of delivery, and how many of those members had
    // linked an account — the difference between who saw it and who could enter.
    const [guilds, linked] = await Promise.all([
      db.select({ guildId: schema.discordGuilds.guildId, memberCount: schema.discordGuilds.memberCount })
        .from(schema.discordGuilds).where(inArray(schema.discordGuilds.guildId, ids)),
      db.select({
        guildId: schema.discordGuildMembers.guildId,
        n: sql<number>`count(${schema.discordGuildMembers.firstLinkedAt})`,
      }).from(schema.discordGuildMembers)
        .where(inArray(schema.discordGuildMembers.guildId, ids))
        .groupBy(schema.discordGuildMembers.guildId),
    ]);
    const members = new Map(guilds.map((g) => [g.guildId, g.memberCount ?? 0]));
    const linkedBy = new Map(linked.map((l) => [l.guildId, Number(l.n ?? 0)]));

    const rows = ids.map((guildId) => ({
      id: uid(),
      challengeId,
      guildId,
      members: members.get(guildId) ?? 0,
      linked: linkedBy.get(guildId) ?? 0,
      kind,
    }));
    await db.insert(schema.challengeDeliveries).values(rows).onConflictDoNothing();
    return rows.length;
  } catch { return 0; }
}

export type DeliveryTotals = {
  /** Servers the message landed in. */
  servers: number;
  /** Members in those servers at the moment it landed — the impressions. */
  members: number;
  /** Of those, the ones who could actually enter. */
  linked: number;
};

const EMPTY: DeliveryTotals = { servers: 0, members: 0, linked: 0 };

/**
 * What one challenge reached, counted from the ledger.
 *
 * Only the launch post counts as reach. The ending and result posts land in the
 * same servers, and adding them would triple a number that describes one
 * audience — the classic way an impression count stops meaning anything.
 */
export async function deliveryTotals(challengeId: string): Promise<DeliveryTotals> {
  const many = await deliveryTotalsFor([challengeId]);
  return many.get(challengeId) ?? EMPTY;
}

export async function deliveryTotalsFor(challengeIds: string[]): Promise<Map<string, DeliveryTotals>> {
  const out = new Map<string, DeliveryTotals>();
  const ids = [...new Set(challengeIds.filter(Boolean))];
  if (!ids.length) return out;
  try {
    const db = await getDb();
    const rows = await db.select({
      challengeId: schema.challengeDeliveries.challengeId,
      servers: sql<number>`count(*)`,
      members: sql<number>`coalesce(sum(${schema.challengeDeliveries.members}), 0)`,
      linked: sql<number>`coalesce(sum(${schema.challengeDeliveries.linked}), 0)`,
    }).from(schema.challengeDeliveries)
      .where(and(
        inArray(schema.challengeDeliveries.challengeId, ids),
        eq(schema.challengeDeliveries.kind, "launch"),
      ))
      .groupBy(schema.challengeDeliveries.challengeId);
    for (const r of rows) {
      out.set(r.challengeId, {
        servers: Number(r.servers ?? 0),
        members: Number(r.members ?? 0),
        linked: Number(r.linked ?? 0),
      });
    }
  } catch { /* an empty map reads as zero everywhere, which is the truth */ }
  return out;
}

/** Every server one challenge reached, for the per-challenge server table. */
export async function deliveriesFor(challengeId: string): Promise<(Delivery & { name: string | null })[]> {
  try {
    const db = await getDb();
    return await db.select({
      guildId: schema.challengeDeliveries.guildId,
      members: schema.challengeDeliveries.members,
      linked: schema.challengeDeliveries.linked,
      name: schema.discordGuilds.name,
    }).from(schema.challengeDeliveries)
      .leftJoin(schema.discordGuilds, eq(schema.challengeDeliveries.guildId, schema.discordGuilds.guildId))
      .where(and(
        eq(schema.challengeDeliveries.challengeId, challengeId),
        eq(schema.challengeDeliveries.kind, "launch"),
      ))
      .orderBy(sql`${schema.challengeDeliveries.members} desc`)
      .limit(200);
  } catch { return []; }
}
