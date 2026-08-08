// Who paid for this challenge, and have they. B91.2.
//
// ===== THE QUESTION THIS ANSWERS =====
//
// Every challenge on the platform costs somebody money — that is the whole
// business model — and until now an admin looking at one could not tell which
// somebody, or whether they had paid. The information existed: `sponsorBrandId`,
// `sponsorCampaignId`, `sponsorPrice` and the invoice lines that reference a
// challenge or its campaign. It was just never assembled anywhere.
//
// The cost of not assembling it is specific: a challenge goes live because
// somebody pressed publish, and nobody notices for a month that the invoice
// behind it was never paid. Half of what that challenge paid out in prize money
// came out of the prize vault, which is other brands' money.
//
// ===== FOUR KINDS, AND WHAT EACH ONE MEANS =====
//
//   campaign  A brand bought it as one of 1–4 weekly slots. One bill covers the
//             whole campaign; the challenge inherits its paid state.
//   custom    Admin built it for one or two brands — a bespoke deal, any
//             cadence, any length. Each co-sponsor gets its own bill.
//   private   A server owner bought it for their own members, out of their
//             wallet. B90.4.
//   house     Ours. The welcome challenge a server gets on install, billed to
//             the Cluster house brand so customer-acquisition cost is a query
//             rather than an estimate.
//
// The kind is DERIVED, like the stage in lib/challenge-stage.ts and for the
// same reason: every fact it needs is already on the row, and a second stored
// copy is a second thing to drift.

import { and, desc, eq, inArray, or } from "drizzle-orm";
import type { DB } from "@/lib/db";
import * as schema from "@/lib/db/schema";

export type ChallengeKind = "campaign" | "custom" | "private" | "house";

export const KINDS: Record<ChallengeKind, { label: string; blurb: string }> = {
  campaign: {
    label: "Campaign",
    blurb: "One week of a brand's campaign. The campaign carries one bill for all of its weeks.",
  },
  custom: {
    label: "Custom",
    blurb: "Built here for a brand outside the standard package — any cadence, any length, its own bill.",
  },
  private: {
    label: "Private",
    blurb: "A server owner bought this for their own members. It is announced in that server only.",
  },
  house: {
    label: "House",
    blurb: "Ours, billed to the Cluster house brand so what we spend acquiring servers is a query.",
  },
};

export type KindInput = {
  kind?: string | null;
  visibility?: string | null;
  guildId?: string | null;
  sponsorBrandId?: string | null;
  sponsorCampaignId?: string | null;
};

/**
 * Which kind.
 *
 * Order matters. `welcome` is checked first because a welcome challenge is
 * also private to a guild and would otherwise read as something the owner
 * bought — and telling an owner they were billed for their free install
 * challenge is the worst version of this being wrong.
 */
export function kindOf(c: KindInput): ChallengeKind {
  if (c.kind === "welcome") return "house";
  if (c.sponsorCampaignId) return "campaign";
  if (c.sponsorBrandId) return "custom";
  if (c.visibility === "private" && c.guildId) return "private";
  return "house";
}

export type Bill = {
  kind: ChallengeKind;
  /** Who owes it. Null for a house challenge nobody is billed for yet. */
  payer: { type: "brand" | "server"; id: string; name: string } | null;
  /** What this challenge is worth. Zero when it was never priced. */
  amount: number;
  paid: boolean;
  /** Why we say it is paid — the invoice number, or the wallet charge. */
  evidence: string | null;
  /** Where to go and look. */
  href: string | null;
  /**
   * What an operator should do about it, in one line. Empty when nothing is
   * wrong — a screen that always says something teaches people to skip it.
   */
  warning: string;
};

const round2 = (n: number) => Math.round(n * 100) / 100;

/**
 * Assemble the bill for one challenge.
 *
 * Reads, in this order: the campaign it belongs to, the invoice lines that
 * reference it or its campaign, and the wallet charge that bought it. Every
 * one of those is optional — a challenge with none of them is unbilled, and
 * saying so plainly is the point.
 */
export async function billFor(
  db: DB,
  challenge: KindInput & { id: string; sponsorPrice?: number | null; title?: string },
): Promise<Bill> {
  const kind = kindOf(challenge);
  const base: Bill = {
    kind, payer: null, amount: round2(Number(challenge.sponsorPrice ?? 0)),
    paid: false, evidence: null, href: null, warning: "",
  };

  try {
    if (kind === "private") {
      // Bought out of a server owner's wallet. The charge IS the payment —
      // `chargeWallet` refuses to overdraw, so a charge that exists is money
      // that was there.
      const [charge] = await db.select().from(schema.serverCharges)
        .where(eq(schema.serverCharges.challengeId, challenge.id))
        .orderBy(desc(schema.serverCharges.createdAt)).limit(1);
      const [guild] = challenge.guildId
        ? await db.select({ name: schema.discordGuilds.name })
          .from(schema.discordGuilds).where(eq(schema.discordGuilds.guildId, challenge.guildId)).limit(1)
        : [undefined];
      return {
        ...base,
        payer: { type: "server", id: challenge.guildId ?? "", name: guild?.name || challenge.guildId || "a server" },
        amount: charge ? round2(Number(charge.amount) + Number(charge.feeAmount ?? 0)) : base.amount,
        paid: !!charge,
        evidence: charge ? `Paid from the server's wallet balance` : null,
        href: challenge.guildId ? `/admin/discord/${challenge.guildId}` : null,
        warning: charge ? "" : "Nothing has been charged for this. A private challenge is announced only after payment clears.",
      };
    }

    const brandId = challenge.sponsorBrandId ?? null;
    const [brand] = brandId
      ? await db.select({ id: schema.brands.id, name: schema.brands.name, isHouse: schema.brands.isHouse })
        .from(schema.brands).where(eq(schema.brands.id, brandId)).limit(1)
      : [undefined];

    // The invoice lines that point at this challenge OR at its campaign. A
    // campaign is billed once for all of its weeks, so a week with no line of
    // its own is not unpaid — it is covered.
    const sources = [challenge.id, challenge.sponsorCampaignId].filter((x): x is string => !!x);
    const lines = sources.length
      ? await db.select({
        invoiceId: schema.invoiceLines.invoiceId,
        quantity: schema.invoiceLines.quantity,
        unitAmount: schema.invoiceLines.unitAmount,
      }).from(schema.invoiceLines)
        .where(and(
          inArray(schema.invoiceLines.sourceId, sources),
          or(eq(schema.invoiceLines.sourceType, "challenge"), eq(schema.invoiceLines.sourceType, "campaign")),
        ))
      : [];

    const invoices = lines.length
      ? await db.select({
        id: schema.brandInvoices.id,
        number: schema.brandInvoices.number,
        status: schema.brandInvoices.status,
      }).from(schema.brandInvoices)
        .where(inArray(schema.brandInvoices.id, [...new Set(lines.map((l) => l.invoiceId))]))
      : [];

    const paidInvoice = invoices.find((i) => i.status === "paid");
    const anyInvoice = paidInvoice ?? invoices[0];
    const lineTotal = round2(lines.reduce((a, l) => a + Number(l.quantity ?? 1) * Number(l.unitAmount ?? 0), 0));

    const payer = brand
      ? { type: "brand" as const, id: brand.id, name: brand.name }
      : null;

    if (kind === "house") {
      return {
        ...base, payer,
        amount: lineTotal || base.amount,
        paid: !!paidInvoice,
        evidence: paidInvoice ? `Invoice ${paidInvoice.number}` : null,
        href: anyInvoice ? `/admin/billing?invoice=${anyInvoice.id}` : null,
        // Ours. An unpaid house invoice is bookkeeping, not a problem, and
        // flagging it every week would train people to ignore the flag.
        warning: "",
      };
    }

    return {
      ...base, payer,
      amount: lineTotal || base.amount,
      paid: !!paidInvoice,
      evidence: paidInvoice ? `Invoice ${paidInvoice.number}` : anyInvoice ? `Invoice ${anyInvoice.number} — ${anyInvoice.status}` : null,
      href: anyInvoice ? `/admin/billing?invoice=${anyInvoice.id}` : null,
      warning: !brand
        ? "No brand on this challenge, so nobody is being billed for it."
        : !invoices.length
          ? "No invoice covers this yet. It is running on nobody's money."
          : !paidInvoice
            ? `Invoiced and not paid — ${anyInvoice?.number}.`
            : "",
    };
  } catch {
    // A billing panel that throws takes the challenge editor down with it.
    return { ...base, warning: "The bill could not be read." };
  }
}
