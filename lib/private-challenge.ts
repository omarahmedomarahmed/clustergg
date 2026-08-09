// A server owner buying a competition for their own members. B90.4.
//
// ===== IT IS A SALE, NOT A TRANSFER =====
//
// An owner pays the prize pool PLUS a margin, and we then owe the prize as our
// own obligation. That distinction is the whole legal shape of this feature:
// taking money from person A and handing it to person B is money transmission,
// and it is the thing deleting gifting closed (see docs/B73_RESEARCH.md Q3).
// Selling somebody a product that happens to pay out prizes is advertising.
//
// The margin is therefore not optional decoration — it is what makes this a
// product. It is editable per bill and can be set to zero as a discount, the
// same as any other invoice adjustment, but the default exists for a reason and
// the reason is written down here.
//
// ===== IT DOES NOT COUNT FOR THE POOL =====
//
// A private challenge is not brand inventory. Its entrants do not earn a share
// of the weekly server pool — that money came from brands buying public
// challenges, and paying an owner out of it for an event they bought
// themselves would pay them twice. `lib/week-close.ts` already filters on
// `visibility = public`; this just never becomes public.
//
// What DOES count is linking: a member who links an account because of a
// private challenge is a linked member like any other. A private challenge
// grows you, it does not pay you twice.

import type { DB } from "@/lib/db";
import * as schema from "@/lib/db/schema";
import { uid } from "@/lib/utils";
import { chargeWallet, walletFor } from "@/lib/server-wallet";
import { PRIVATE_FEE_PCT, MIN_PRIZE_POOL, MAX_PRIZE_POOL, quotePrivate } from "@/lib/private-quote";

export {
  PRIVATE_FEE_PCT, MIN_PRIZE_POOL, MAX_PRIZE_POOL, quotePrivate, type PrivateQuote,
} from "@/lib/private-quote";

export type BuyResult =
  | { ok: true; challengeId: string; charged: number }
  | { ok: false; error: string };

/**
 * Buy one.
 *
 * The charge and the challenge are written together: an owner whose balance
 * went down and whose challenge does not exist is a support ticket about money,
 * which is the worst kind. `chargeWallet` refuses to overdraw, so the order is
 * charge-then-create and a failed create rolls the charge back by hand.
 *
 * What is created is a DRAFT. It has no game metric, no rules and no trophies
 * yet — those are ours to set, and setting them is what the ops alert is for.
 * Nothing is announced: a private challenge reaches its server only after a
 * human has finished it, and `announceChallengeUpcoming` will not touch it
 * until `billFor` says it is paid, which the charge is what makes true.
 */
export async function buyPrivateChallenge(
  db: DB,
  input: {
    guildId: string;
    guildName?: string | null;
    title: string;
    game: string;
    provider: string;
    prizePool: number;
    startAt: Date;
    endAt: Date;
    spaceId?: string | null;
    feePct?: number;
  },
): Promise<BuyResult> {
  const title = String(input.title ?? "").trim().slice(0, 160);
  if (!title) return { ok: false, error: "Give it a name — your members will see it." };
  if (!input.game || !input.provider) return { ok: false, error: "Pick a game we can score." };

  const quote = quotePrivate(input.prizePool, input.feePct ?? PRIVATE_FEE_PCT);
  if (quote.prizePool < MIN_PRIZE_POOL) {
    return { ok: false, error: `The smallest prize pool is $${MIN_PRIZE_POOL}. Below that the fee is more than the prize.` };
  }
  if (quote.prizePool > MAX_PRIZE_POOL) {
    return { ok: false, error: `The largest we can take from a wallet is $${MAX_PRIZE_POOL.toLocaleString("en-US")}. Message us for anything bigger and we will invoice it.` };
  }
  if (input.endAt <= input.startAt) {
    return { ok: false, error: "It has to end after it starts." };
  }

  const wallet = await walletFor(db, input.guildId);
  if (quote.total > wallet.available + 0.005) {
    return {
      ok: false,
      error: `That is $${quote.total.toLocaleString("en-US")} with the ${quote.feePct}% on top, and your balance is $${wallet.available.toLocaleString("en-US")}. Make the prize smaller, or wait for Monday's pool.`,
    };
  }

  const challengeId = uid();
  const charge = await chargeWallet(db, {
    guildId: input.guildId,
    amount: quote.prizePool,
    fee: quote.fee,
    label: `Private challenge — ${title}`,
    challengeId,
  });
  if (!charge.ok) return { ok: false, error: charge.error };

  try {
    await db.insert(schema.challenges).values({
      id: challengeId,
      spaceId: input.spaceId ?? null,
      title,
      game: input.game,
      provider: input.provider,
      format: "top3",
      // PRIVATE, and to this server only. That is what the owner bought, and it
      // is also what keeps it out of the weekly pool's arithmetic.
      visibility: "private",
      guildId: input.guildId,
      guildIds: [input.guildId],
      accessKey: uid().slice(0, 8).toUpperCase(),
      status: "draft",
      startAt: input.startAt,
      endAt: input.endAt,
      cadence: "custom",
      prizeDescription: `$${quote.prizePool.toLocaleString("en-US")} in prizes, bought by ${input.guildName || "this server"}.`,
      sponsorPrice: quote.total,
    } as never);
  } catch {
    // The money moved and the thing it bought does not exist. Give it back
    // rather than leaving an owner to notice.
    try {
      await db.delete(schema.serverCharges).where(
        (await import("drizzle-orm")).eq(schema.serverCharges.id, charge.id),
      );
    } catch { /* then it is a support ticket, but a visible one */ }
    return { ok: false, error: "We could not create the challenge, so nothing was charged." };
  }

  return { ok: true, challengeId, charged: quote.total };
}
