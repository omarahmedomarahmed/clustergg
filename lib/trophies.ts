import { and, desc, eq, inArray } from "drizzle-orm";
import type { DB } from "@/lib/db";
import * as schema from "@/lib/db/schema";
import { uid } from "@/lib/utils";
import { placesOf } from "@/lib/prize-places";

// ===== Trophy economy read/award models =====

// One trophy on a gamer's shelf (award + trophy art + the challenge it came from).
export type TrophyAward = {
  id: string; trophyId: string; name: string; imageUrl: string; tier: string; value: number;
  challengeId: string | null; challengeTitle: string | null; game: string | null; gameLogoUrl: string | null;
  placement: number; status: string; awardedAt: string;
};

export type RedeemView = {
  id: string; awardIds: string[]; amount: number; currency: string;
  /** A preference word — "bank", "paypal", "giftcard". Never an account. */
  method: string;
  status: string;
  /**
   * Where the gamer goes to collect it and choose how.
   *
   * Only ever sent to the gamer it belongs to. This replaced a form that asked
   * for a routing number: the choice now happens on the payout provider's own
   * page, which is why there is nothing here to mask and no `last4` any more.
   */
  collectUrl: string | null;
  gamerConfirmedAt: string | null; proofUrl: string | null;
  createdAt: string; decidedAt: string | null; sentAt: string | null; paidAt: string | null;
};

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

// A gamer's redeem requests, newest first.
export async function getMyRedeems(db: DB, userId: string): Promise<RedeemView[]> {
  const rows = await db.select().from(schema.trophyRedeems)
    .where(eq(schema.trophyRedeems.userId, userId))
    .orderBy(desc(schema.trophyRedeems.createdAt)).limit(30);
  return rows.map((r) => ({
    id: r.id, awardIds: r.awardIds ?? [], amount: Number(r.amount), currency: r.currency, method: r.method,
    status: r.status, collectUrl: r.collectUrl,
    gamerConfirmedAt: r.gamerConfirmedAt?.toISOString() ?? null, proofUrl: r.proofUrl,
    createdAt: r.createdAt.toISOString(), decidedAt: r.decidedAt?.toISOString() ?? null,
    sentAt: r.sentAt?.toISOString() ?? null,
    paidAt: r.paidAt?.toISOString() ?? null,
  }));
}

// Award a COMPLETED challenge's podium trophies to its placed participants.
// Idempotent (unique user+trophy+challenge index) — safe to call repeatedly.
export async function awardChallengeTrophies(db: DB, challengeId: string) {
  const [c] = await db.select().from(schema.challenges).where(eq(schema.challenges.id, challengeId)).limit(1);
  if (!c || c.status !== "completed") return;
  // B91.7. A podium is any depth now: one winner, or ten. The old
  // `{first, second, third}` shape is still READ — there are challenges in the
  // database holding it, and rewriting live prize data is how a trophy somebody
  // already won goes missing.
  const places = placesOf(c.prizes, c.trophyId);
  if (!places.length) return;
  const byPlace: Record<number, string[]> = {};
  places.forEach((ids, i) => { byPlace[i + 1] = ids; });

  // Exactly the places that pay. It used to be hard-coded to [1,2,3], so a
  // ten-place challenge awarded three trophies and the other seven were handed
  // out by hand — which means seven trophies on nobody's profile and missing
  // from the prize vault's arithmetic.
  const payingPlaces = places.map((_, i) => i + 1);
  const winners = await db.select({ userId: schema.challengeParticipants.userId, place: schema.challengeParticipants.finalPlacement })
    .from(schema.challengeParticipants)
    .where(and(eq(schema.challengeParticipants.challengeId, challengeId), inArray(schema.challengeParticipants.finalPlacement, payingPlaces)));
  const awardedTrophyIds: string[] = [];
  for (const w of winners) {
    const place = Number(w.place);
    for (const trophyId of byPlace[place] ?? []) {
      try {
        const rows = await db.insert(schema.userTrophies)
          .values({ id: uid(), userId: w.userId, trophyId, challengeId, placement: place })
          .onConflictDoNothing()
          .returning();
        // Only trophies that were actually INSERTED count toward the value
        // awarded. This function is idempotent and gets re-run; counting the
        // ones a conflict skipped would commit the prize vault twice for the
        // same podium.
        if (rows.length) awardedTrophyIds.push(trophyId);
        await db.insert(schema.notifications).values({
          id: uid(), userId: w.userId, type: "trophy",
          title: `You won a trophy in ${c.title}!`,
          body: `It's now on your profile — open your trophy case to see (and redeem) it.`,
          href: "/profile",
        }).onConflictDoNothing();
      } catch { /* non-fatal */ }
    }
  }
  await commitPrizes(db, { challengeId, title: c.title, sponsorPrice: Number(c.sponsorPrice ?? 0), awardedTrophyIds });
}

/**
 * The prize percentage, read through the CALLER'S handle.
 *
 * Not `pricingConfig()`, which goes through `lib/cms.ts` → `getDb()`. This runs
 * inside challenge completion, which runs during the demo bootstrap — and a
 * fresh `getDb()` there awaits the very bootstrap that is calling it. That
 * deadlock has now appeared twice in this codebase, both times through a
 * convenience helper that opens its own connection, so the rule is written
 * where the next person will hit it: **anything reachable from a seed or a
 * transaction takes the handle it was given.**
 */
async function prizePctOn(db: DB): Promise<number> {
  const { PRICING_DEFAULTS } = await import("@/lib/pricing");
  try {
    const [row] = await db.select({ value: schema.platformSettings.value })
      .from(schema.platformSettings)
      .where(eq(schema.platformSettings.key, "pricing.prizePct")).limit(1);
    const n = Number(String(row?.value ?? "").replace(/"/g, ""));
    return Number.isFinite(n) && n > 0 && n <= 100 ? n : PRICING_DEFAULTS.prizePct;
  } catch { return PRICING_DEFAULTS.prizePct; }
}

/**
 * Move the awarded value out of the prize vault, and check it against the pool.
 * C13 + C15.
 *
 * A prize becomes a LIABILITY the moment it is awarded, not the moment it is
 * redeemed — the gamer holds something we owe them, and a vault that only
 * moves on redemption would show money we do not have. So the commitment is
 * posted here, at award time, and redemption later is a settlement of it rather
 * than a new event.
 *
 * Nothing here is allowed to fail the award. A gamer who won a trophy has won
 * it whether or not our bookkeeping worked, and throwing from inside the awards
 * loop would leave a podium half-given.
 */
async function commitPrizes(db: DB, opts: {
  challengeId: string;
  title: string;
  sponsorPrice: number;
  awardedTrophyIds: string[];
}): Promise<void> {
  if (!opts.awardedTrophyIds.length) return;
  try {
    const { postToLedger } = await import("@/lib/vaults");
    const { promisedPool, reconcilePrizes, needsAttention } = await import("@/lib/prize-reconcile");

    const ids = [...new Set(opts.awardedTrophyIds)];
    const rows = await db.select({ id: schema.trophies.id, value: schema.trophies.value })
      .from(schema.trophies).where(inArray(schema.trophies.id, ids));
    const valueOf = new Map(rows.map((r) => [r.id, Number(r.value ?? 0)]));
    // Summed over the AWARDS, not over the distinct trophies — the same trophy
    // can go to three people, and it is worth its value three times.
    const awarded = Math.round(opts.awardedTrophyIds.reduce((s, id) => s + (valueOf.get(id) ?? 0), 0) * 100) / 100;

    const promised = promisedPool(opts.sponsorPrice, await prizePctOn(db));
    const r = reconcilePrizes({ promised, awarded });

    await postToLedger(db, [{
      vault: "prize",
      amount: -awarded,
      kind: "payout",
      refType: "challenge",
      refId: opts.challengeId,
      // The discrepancy is written into the row itself rather than to a log.
      // A reconciliation you have to go and look for is one nobody looks for.
      reason: needsAttention(r) ? `${opts.title} — ${r.note}` : `${opts.title} — podium awarded.`,
    }]);
  } catch { /* bookkeeping must never cost a gamer their trophy */ }
}
