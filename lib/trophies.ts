import { and, desc, eq, inArray } from "drizzle-orm";
import type { DB } from "@/lib/db";
import * as schema from "@/lib/db/schema";
import { uid } from "@/lib/utils";

// ===== Trophy economy read/award models =====

// One trophy on a gamer's shelf (award + trophy art + the challenge it came from).
export type TrophyAward = {
  id: string; trophyId: string; name: string; imageUrl: string; tier: string; value: number;
  challengeId: string | null; challengeTitle: string | null; game: string | null; gameLogoUrl: string | null;
  placement: number; status: string; awardedAt: string;
};

export type RedeemView = {
  id: string; awardIds: string[]; amount: number; currency: string; method: string;
  last4: string; status: string; gamerConfirmedAt: string | null; proofUrl: string | null;
  createdAt: string; decidedAt: string | null; paidAt: string | null;
};

// The last digits of the payout destination (never expose the full number in UI).
export function payoutLast4(details: Record<string, string> | null | undefined): string {
  const v = details?.account || details?.mobile || "";
  return v.length >= 4 ? v.slice(-4) : v;
}

// Everything on a gamer's trophy shelf, newest first. Includes redeemed ones —
// callers filter by status (redeemed stays visible only in history views).
export async function getTrophyCase(db: DB, userId: string): Promise<TrophyAward[]> {
  const rows = await db.select({
    id: schema.userTrophies.id, trophyId: schema.userTrophies.trophyId,
    challengeId: schema.userTrophies.challengeId, placement: schema.userTrophies.placement,
    status: schema.userTrophies.status, awardedAt: schema.userTrophies.awardedAt,
    name: schema.trophies.name, imageUrl: schema.trophies.imageUrl,
    tier: schema.trophies.tier, value: schema.trophies.value,
  }).from(schema.userTrophies)
    .innerJoin(schema.trophies, eq(schema.userTrophies.trophyId, schema.trophies.id))
    .where(eq(schema.userTrophies.userId, userId))
    .orderBy(desc(schema.userTrophies.awardedAt));
  if (rows.length === 0) return [];

  // Attach the source challenge + its game logo.
  const chalIds = [...new Set(rows.map((r) => r.challengeId).filter((x): x is string => !!x))];
  const chals = chalIds.length
    ? await db.select({ id: schema.challenges.id, title: schema.challenges.title, game: schema.challenges.game })
        .from(schema.challenges).where(inArray(schema.challenges.id, chalIds))
    : [];
  const chalById = new Map(chals.map((c) => [c.id, c]));
  const gameNames = [...new Set(chals.map((c) => c.game))];
  const games = gameNames.length
    ? await db.select({ name: schema.games.name, logoUrl: schema.games.logoUrl })
        .from(schema.games).where(inArray(schema.games.name, gameNames))
    : [];
  const logoByGame = new Map(games.map((g) => [g.name, g.logoUrl]));

  return rows.map((r) => {
    const c = r.challengeId ? chalById.get(r.challengeId) : undefined;
    return {
      id: r.id, trophyId: r.trophyId, name: r.name, imageUrl: r.imageUrl, tier: r.tier, value: Number(r.value ?? 0),
      challengeId: r.challengeId, challengeTitle: c?.title ?? null, game: c?.game ?? null,
      gameLogoUrl: c ? (logoByGame.get(c.game) ?? null) : null,
      placement: r.placement, status: r.status, awardedAt: r.awardedAt.toISOString(),
    };
  });
}

// A gamer's redeem requests, newest first (details reduced to last-4).
export async function getMyRedeems(db: DB, userId: string): Promise<RedeemView[]> {
  const rows = await db.select().from(schema.trophyRedeems)
    .where(eq(schema.trophyRedeems.userId, userId))
    .orderBy(desc(schema.trophyRedeems.createdAt)).limit(30);
  return rows.map((r) => ({
    id: r.id, awardIds: r.awardIds ?? [], amount: Number(r.amount), currency: r.currency, method: r.method,
    last4: payoutLast4(r.details), status: r.status,
    gamerConfirmedAt: r.gamerConfirmedAt?.toISOString() ?? null, proofUrl: r.proofUrl,
    createdAt: r.createdAt.toISOString(), decidedAt: r.decidedAt?.toISOString() ?? null,
    paidAt: r.paidAt?.toISOString() ?? null,
  }));
}

// Award a COMPLETED challenge's podium trophies to its placed participants.
// Idempotent (unique user+trophy+challenge index) — safe to call repeatedly.
export async function awardChallengeTrophies(db: DB, challengeId: string) {
  const [c] = await db.select().from(schema.challenges).where(eq(schema.challenges.id, challengeId)).limit(1);
  if (!c || c.status !== "completed") return;
  const prizes = c.prizes ?? (c.trophyId ? { first: [c.trophyId] } : null);
  if (!prizes) return;
  const byPlace: Record<number, string[]> = { 1: prizes.first ?? [], 2: prizes.second ?? [], 3: prizes.third ?? [] };
  const winners = await db.select({ userId: schema.challengeParticipants.userId, place: schema.challengeParticipants.finalPlacement })
    .from(schema.challengeParticipants)
    .where(and(eq(schema.challengeParticipants.challengeId, challengeId), inArray(schema.challengeParticipants.finalPlacement, [1, 2, 3])));
  for (const w of winners) {
    const place = Number(w.place);
    for (const trophyId of byPlace[place] ?? []) {
      try {
        await db.insert(schema.userTrophies)
          .values({ id: uid(), userId: w.userId, trophyId, challengeId, placement: place })
          .onConflictDoNothing();
        await db.insert(schema.notifications).values({
          id: uid(), userId: w.userId, type: "trophy",
          title: `You won a trophy in ${c.title}!`,
          body: `It's now on your profile — open your trophy case to see (and redeem) it.`,
          href: "/profile",
        }).onConflictDoNothing();
      } catch { /* non-fatal */ }
    }
  }
}
