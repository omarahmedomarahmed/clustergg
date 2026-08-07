import { and, desc, eq, sql } from "drizzle-orm";
import { getDb, schema, type DB } from "@/lib/db";
import { uid } from "@/lib/utils";
import { awardQuestAction, getTotalCp } from "@/lib/quests";
import { lockGamer, withTx } from "@/lib/db/tx";

// The trophy marketplace: what Cluster Points are FOR.
//
// Before this, CP was a score. You earned it for playing, it moved a bar, and
// that was the end of it — which meant a gamer who entered a sponsored
// challenge and didn't win walked away with nothing, having generated exactly
// the impressions the brand paid for. The marketplace closes that loop: the CP
// you earn buys a real trophy, and a trophy is redeemable for real money
// through the redemption flow that already exists.
//
// Two rules the whole design hangs on.
//
//   1. SPENDING NEVER COSTS A LEVEL. Quest progress is what levels read, and
//      buying does not touch it. Balance is EARNED minus SPENT, computed from
//      two separate places, so a gamer can empty their balance and keep every
//      tier they climbed. Decrementing `qp` would have been one line and would
//      have demoted people for shopping.
//
//   2. CP IS FREE, SO IT MUST BE EXPENSIVE. The price has to be high enough
//      that the trophies we pay out cost less than the ad revenue the same
//      gamer's attention generated, and low enough to be worth playing for.
//      `cpPerDollar` is that dial, and it is set in one place below.

/**
 * Re-exported, not defined here. The definition and the reason it moved are in
 * `lib/cp-rate.ts`: this module reaches the database driver, and a client
 * component needed only the number.
 */
import { DEFAULT_CP_PER_DOLLAR } from "@/lib/cp-rate";
export { DEFAULT_CP_PER_DOLLAR };


/**
 * Scarcity premium by tier.
 *
 * A legendary that costs the same as a bronze of equal cash value would make
 * tier decoration rather than achievement. The multiplier is what keeps the
 * rare ones rare on profiles.
 */
export const TIER_MULTIPLIER: Record<string, number> = {
  bronze: 1, silver: 1.25, gold: 1.5, legendary: 2,
};

export type MarketTrophy = {
  id: string;
  name: string;
  tier: string;
  imageUrl: string;
  game: string | null;
  value: number;
  cpPrice: number;
  /** True when staff set the price by hand rather than letting the model do it. */
  pricedByHand: boolean;
  brandId: string | null;
  brandName: string | null;
  /** Can the viewer afford it right now? */
  affordable: boolean;
};

/**
 * What a trophy costs, in CP.
 *
 * An explicit `cpPrice` always wins — staff pricing a specific trophy is a
 * decision, not a suggestion. Otherwise the model prices it from its cash value
 * and tier, rounded to a clean hundred so the number reads like a price rather
 * than a calculation.
 */
export function priceOf(
  t: { value: number | null; tier: string; cpPrice?: number | null },
  cpPerDollar = DEFAULT_CP_PER_DOLLAR,
): number {
  if (t.cpPrice && t.cpPrice > 0) return t.cpPrice;
  const value = Math.max(0, Number(t.value ?? 0));
  const mult = TIER_MULTIPLIER[t.tier] ?? 1;
  const raw = value * cpPerDollar * mult;
  // A trophy with no cash value is still worth something as decoration; floor
  // it rather than giving it away.
  return Math.max(500, Math.ceil(raw / 100) * 100);
}

/** The rate, from settings, with the model's default when unset. */
export async function cpPerDollar(db: DB): Promise<number> {
  try {
    const [row] = await db.select({ value: schema.platformSettings.value })
      .from(schema.platformSettings)
      .where(eq(schema.platformSettings.key, "marketplace.cpPerDollar")).limit(1);
    const n = Number((row?.value as { rate?: number } | null)?.rate);
    return Number.isFinite(n) && n > 0 ? n : DEFAULT_CP_PER_DOLLAR;
  } catch { return DEFAULT_CP_PER_DOLLAR; }
}

/** Everything a gamer has spent in the marketplace. */
export async function cpSpent(db: DB, userId: string | null): Promise<number> {
  if (!userId) return 0;
  try {
    const [row] = await db.select({ n: sql<number>`COALESCE(SUM(${schema.marketplaceOrders.cpSpent}), 0)` })
      .from(schema.marketplaceOrders)
      .where(and(
        eq(schema.marketplaceOrders.buyerId, userId),
        eq(schema.marketplaceOrders.status, "complete"),
      ));
    return Number(row?.n ?? 0);
  } catch { return 0; }
}

export type CpWallet = { earned: number; spent: number; balance: number };

/**
 * Earned, spent, and what's left.
 *
 * Earned is deliberately the same number the quest tiers read, and it only ever
 * goes up. That is the whole reason spending can't demote anybody.
 */
export async function cpWallet(db: DB, userId: string | null): Promise<CpWallet> {
  const [earned, spent] = await Promise.all([getTotalCp(db, userId), cpSpent(db, userId)]);
  return { earned, spent, balance: Math.max(0, earned - spent) };
}

/**
 * The shelf.
 *
 * Branded trophies are included on purpose: a gamer who missed a brand's
 * sponsored week can still buy that brand's trophy, which is more impressions
 * for the brand and a second chance for the gamer. Staff can hide any trophy
 * with `inMarketplace`.
 */
export async function marketplaceCatalog(
  db: DB,
  opts: { userId?: string | null; includeHidden?: boolean } = {},
): Promise<{ trophies: MarketTrophy[]; wallet: CpWallet; rate: number }> {
  const [rate, wallet] = await Promise.all([
    cpPerDollar(db),
    cpWallet(db, opts.userId ?? null),
  ]);
  const rows = await db.select({
    t: schema.trophies,
    brandName: schema.brands.name,
  })
    .from(schema.trophies)
    .leftJoin(schema.brands, eq(schema.brands.id, schema.trophies.brandId))
    .orderBy(desc(schema.trophies.value));

  const trophies = rows
    .filter((r) => opts.includeHidden || r.t.inMarketplace)
    .map((r) => {
      const cp = priceOf(r.t, rate);
      return {
        id: r.t.id, name: r.t.name, tier: r.t.tier, imageUrl: r.t.imageUrl,
        game: r.t.game, value: Number(r.t.value ?? 0),
        cpPrice: cp, pricedByHand: !!(r.t.cpPrice && r.t.cpPrice > 0),
        brandId: r.t.brandId, brandName: r.brandName ?? null,
        affordable: wallet.balance >= cp,
      };
    });
  return { trophies, wallet, rate };
}

export type BuyResult =
  | { ok: true; orderId: string; awardId: string; cpSpent: number; balance: number; trophy: string; gifted: string | null }
  | { ok: false; error: string };

/**
 * Buy a trophy, for yourself or as a gift.
 *
 * The balance check and the write are ordered so that the worst case is a
 * refused purchase rather than a negative balance: the order is written first
 * and the award second, and the balance is re-read INSIDE the same call rather
 * than trusted from the page that rendered the button — a stale page is the
 * ordinary way this would be abused.
 */
export async function buyTrophy(
  buyerId: string,
  trophyId: string,
  opts: { recipientSlug?: string; message?: string } = {},
): Promise<BuyResult> {
  const db = await getDb();

  const [trophy] = await db.select().from(schema.trophies)
    .where(eq(schema.trophies.id, trophyId)).limit(1);
  if (!trophy) return { ok: false, error: "That trophy doesn't exist." };
  if (!trophy.inMarketplace) return { ok: false, error: "That trophy isn't for sale right now." };

  // Who gets it.
  let recipientId = buyerId;
  let giftedTo: string | null = null;
  const slug = (opts.recipientSlug ?? "").trim().replace(/^@/, "");
  if (slug) {
    const [to] = await db.select({ id: schema.users.id, name: schema.users.displayName, status: schema.users.status })
      .from(schema.users).where(eq(schema.users.slug, slug)).limit(1);
    if (!to) return { ok: false, error: `No gamer with the profile “${slug}”. Check the spelling of their profile link.` };
    if (to.status !== "active") return { ok: false, error: "That gamer's account isn't active." };
    if (to.id !== buyerId) { recipientId = to.id; giftedTo = to.name; }
  }

  const rate = await cpPerDollar(db);
  const price = priceOf(trophy, rate);

  const orderId = uid();
  const awardId = uid();

  // B74 — the balance read and the spend, in ONE transaction, behind a lock on
  // the buyer's own row.
  //
  // Before this, "re-read the balance here, never trust the page" was as far as
  // it went — and re-reading is exactly the half of the pattern that does not
  // help. Two purchases submitted together both re-read the same balance, both
  // found it sufficient, and both inserted: one balance, spent twice. The
  // comment was right that the page cannot be trusted and wrong that a fresh
  // read fixes it.
  //
  // The lock is on the GAMER, not on the wallet row, because there is no wallet
  // row — a balance is a sum over `quest_events` and orders, and you cannot lock
  // a sum. Serializing the gamer serializes every path that can move it.
  const balance = await withTx(db, async (tx) => {
    await lockGamer(tx, buyerId);

    const wallet = await cpWallet(tx, buyerId);
    if (wallet.balance < price) return null;

    await tx.insert(schema.marketplaceOrders).values({
      id: orderId, buyerId, recipientId, trophyId,
      awardId, cpSpent: price, value: Number(trophy.value ?? 0),
      kind: giftedTo ? "gift" : "self",
      message: (opts.message ?? "").trim().slice(0, 200) || null,
    });

    // The award is an ordinary held trophy: it shows on the profile and it is
    // redeemable for cash through the flow that already exists. `challengeId`
    // stays null, which is what marks it as bought rather than won.
    await tx.insert(schema.userTrophies).values({
      id: awardId, userId: recipientId, trophyId,
      challengeId: null, placement: 1, status: "held",
    }).onConflictDoNothing();

    return wallet.balance;
  });

  if (balance === null) {
    // Read again for the message only. The decision was made under the lock;
    // this is just so the number a gamer is shown is not stale by the time
    // they read it.
    const now = await cpWallet(db, buyerId);
    return {
      ok: false,
      error: `That costs ${price.toLocaleString()} CP and you have ${now.balance.toLocaleString()}. Keep playing — every quest action earns, whether or not you win the challenge.`,
    };
  }

  // Tell the recipient, if it was a gift.
  if (giftedTo) {
    try {
      const [from] = await db.select({ name: schema.users.displayName, slug: schema.users.slug })
        .from(schema.users).where(eq(schema.users.id, buyerId)).limit(1);
      await db.insert(schema.notifications).values({
        id: uid(), userId: recipientId, type: "trophy_gift",
        title: `${from?.name ?? "A gamer"} sent you a trophy`,
        body: `${trophy.name} is on your profile.${opts.message ? ` “${opts.message.slice(0, 120)}”` : ""}`,
        href: from?.slug ? `/u/${from.slug}` : "/profile",
      });
    } catch { /* a failed notification must not fail a purchase */ }

    // Giving and receiving both earn on the orbit quest (B15).
    //
    // Only on a GIFT. Buying a trophy for yourself is already its own reward and
    // paying CP for the act of spending CP would be a loop that pays for itself.
    // Both sides key on the order, so one gift is one award each however many
    // times this is retried, and the buyer's daily cap is what stops a pair of
    // accounts gifting the same trophy back and forth all afternoon.
    //
    // `awardQuestAction` swallows its own errors by design — gamification must
    // never fail the purchase that triggered it — but these are awaited rather
    // than floated: a floating promise in a server action is killed when the
    // response is sent (§0), which is how an award silently never happens.
    await awardQuestAction(db, buyerId, "gift_sent", { refType: "order", refId: orderId });
    await awardQuestAction(db, recipientId, "gift_received", { refType: "order", refId: orderId });
  }

  return {
    ok: true, orderId, awardId, cpSpent: price,
    balance: balance - price, trophy: trophy.name, gifted: giftedTo,
  };
}

export type MarketOrder = {
  id: string;
  at: string;
  trophyName: string;
  trophyImage: string;
  cpSpent: number;
  value: number;
  kind: string;
  buyerName: string;
  buyerSlug: string;
  recipientName: string;
  recipientSlug: string;
};

/** Every purchase, for the admin marketplace ledger. */
export async function marketplaceOrders(db: DB, limit = 200): Promise<MarketOrder[]> {
  const buyer = schema.users;
  const rows = await db.select({
    o: schema.marketplaceOrders,
    trophyName: schema.trophies.name,
    trophyImage: schema.trophies.imageUrl,
    buyerName: buyer.displayName,
    buyerSlug: buyer.slug,
  })
    .from(schema.marketplaceOrders)
    .innerJoin(schema.trophies, eq(schema.trophies.id, schema.marketplaceOrders.trophyId))
    .innerJoin(buyer, eq(buyer.id, schema.marketplaceOrders.buyerId))
    .orderBy(desc(schema.marketplaceOrders.createdAt))
    .limit(limit);

  // Recipients in one more pass rather than a second join on the same table,
  // which Drizzle would need an alias for and which nobody would enjoy reading.
  const recipientIds = [...new Set(rows.map((r) => r.o.recipientId))];
  const recipients = new Map<string, { name: string; slug: string }>();
  if (recipientIds.length) {
    const rs = await db.select({ id: schema.users.id, name: schema.users.displayName, slug: schema.users.slug })
      .from(schema.users);
    for (const r of rs) recipients.set(r.id, { name: r.name, slug: r.slug });
  }

  return rows.map((r) => ({
    id: r.o.id,
    at: r.o.createdAt.toISOString(),
    trophyName: r.trophyName,
    trophyImage: r.trophyImage,
    cpSpent: r.o.cpSpent,
    value: Number(r.o.value ?? 0),
    kind: r.o.kind,
    buyerName: r.buyerName,
    buyerSlug: r.buyerSlug,
    recipientName: recipients.get(r.o.recipientId)?.name ?? r.buyerName,
    recipientSlug: recipients.get(r.o.recipientId)?.slug ?? r.buyerSlug,
  }));
}

export type MarketWallet = {
  /** Total CP gamers have handed back to us for trophies. */
  cpTaken: number;
  orders: number;
  gifts: number;
  /** What those trophies are worth if every one is redeemed for cash. */
  liability: number;
  buyers: number;
};

/**
 * The marketplace wallet: what the economy has actually done.
 *
 * `liability` is the number that matters and the one nobody thinks to compute:
 * every trophy sold is redeemable, so the marketplace's takings in CP are
 * matched by a real dollar obligation. Showing them side by side is what stops
 * the CP price drifting somewhere that costs money.
 */
export async function marketplaceWallet(db: DB): Promise<MarketWallet> {
  try {
    const [row] = await db.select({
      cpTaken: sql<number>`COALESCE(SUM(${schema.marketplaceOrders.cpSpent}), 0)`,
      orders: sql<number>`COUNT(*)`,
      gifts: sql<number>`COUNT(*) FILTER (WHERE ${schema.marketplaceOrders.kind} = 'gift')`,
      liability: sql<number>`COALESCE(SUM(${schema.marketplaceOrders.value}), 0)`,
      buyers: sql<number>`COUNT(DISTINCT ${schema.marketplaceOrders.buyerId})`,
    })
      .from(schema.marketplaceOrders)
      .where(eq(schema.marketplaceOrders.status, "complete"));
    return {
      cpTaken: Number(row?.cpTaken ?? 0),
      orders: Number(row?.orders ?? 0),
      gifts: Number(row?.gifts ?? 0),
      liability: Number(row?.liability ?? 0),
      buyers: Number(row?.buyers ?? 0),
    };
  } catch { return { cpTaken: 0, orders: 0, gifts: 0, liability: 0, buyers: 0 }; }
}
