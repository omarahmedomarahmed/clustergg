// Brands prepay (B36).
//
// The exposure this closes: a brand buys a campaign, the challenges run, gamers
// win, trophies redeem into real cash — and nothing ever billed them. That is
// not a late-payment problem, it is a **no-invoice** problem: `buyCampaign`
// created the campaign and opened its first slot and stopped there, and the only
// invoices in the system were monthly ones a human remembered to open.
//
// The decided policy, and each line of it is a decision rather than a default:
//
//   - The invoice is issued **at purchase**, due the same day. A campaign that
//     has been bought is a debt from that moment.
//   - The challenge **still goes live immediately**. We do not hold a
//     community's competition hostage over a payment term, and the first
//     campaign is where trust is being built rather than tested.
//   - The brand has until **the end of its first challenge** to settle. That is
//     a real window and it is stated, not implied.
//   - Unpaid past that → **no further challenges are published for that brand**.
//     Existing ones finish. **Prizes already won are always honoured** — a gamer
//     must never lose a prize because a brand was late; the brand's failure is
//     not the gamer's.
//
// So the most we can ever lose to one bad brand is one campaign.

import { and, asc, desc, eq, inArray, isNull, or } from "drizzle-orm";
import type { DB } from "@/lib/db";
import * as schema from "@/lib/db/schema";
import { uid } from "@/lib/utils";
import { dueDateFrom, monthLabel, nextInvoiceNumber, payToken } from "@/lib/invoices";

/** Same-day terms, spelled out so the call sites read as the policy. */
export const CAMPAIGN_TERMS_DAYS = 0;

export type DunningStage = "issued" | "due" | "overdue" | "blocked" | "paid";

/**
 * Issue the invoice for a campaign. Idempotent.
 *
 * Keyed on an invoice line carrying `sourceType: "campaign"` and the campaign
 * id, so a retry, a double-submit, or a re-run of boot maintenance cannot bill
 * a brand twice. Double-billing is the one failure here that is worse than not
 * billing at all: it costs the customer relationship as well as the money.
 */
export async function invoiceCampaign(db: DB, campaignId: string): Promise<string | null> {
  try {
    const [existing] = await db.select({ invoiceId: schema.invoiceLines.invoiceId })
      .from(schema.invoiceLines)
      .where(and(eq(schema.invoiceLines.sourceType, "campaign"), eq(schema.invoiceLines.sourceId, campaignId)))
      .limit(1);
    if (existing) return existing.invoiceId;

    const [c] = await db.select().from(schema.sponsoredCampaigns)
      .where(eq(schema.sponsoredCampaigns.id, campaignId)).limit(1);
    if (!c) return null;

    const issued = new Date();
    const id = uid();
    await db.insert(schema.brandInvoices).values({
      id,
      brandId: c.brandId,
      number: await nextInvoiceNumber(db),
      // "sent", not "draft". A draft is something staff are still deciding
      // about; this one is already owed the moment it exists.
      status: "sent",
      currency: "USD",
      periodLabel: monthLabel(issued),
      issuedAt: issued,
      dueAt: dueDateFrom(issued, CAMPAIGN_TERMS_DAYS),
      payToken: payToken(),
    });
    await db.insert(schema.invoiceLines).values({
      id: uid(), invoiceId: id, kind: "campaign",
      label: `${c.game} — ${c.slots} sponsored weekly challenges`,
      quantity: c.slots, unitAmount: c.pricePerChallenge,
      sourceType: "campaign", sourceId: campaignId, sortOrder: 0,
    });
    return id;
  } catch { return null; }
}

/** The invoice for a campaign, if one has been issued. */
export async function campaignInvoice(db: DB, campaignId: string) {
  const [line] = await db.select({ invoiceId: schema.invoiceLines.invoiceId })
    .from(schema.invoiceLines)
    .where(and(eq(schema.invoiceLines.sourceType, "campaign"), eq(schema.invoiceLines.sourceId, campaignId)))
    .limit(1);
  if (!line) return null;
  const [inv] = await db.select().from(schema.brandInvoices)
    .where(eq(schema.brandInvoices.id, line.invoiceId)).limit(1);
  return inv ?? null;
}

/**
 * When the grace period ends: the end of that campaign's FIRST challenge.
 *
 * Read from the challenge itself rather than computed from the campaign's start
 * date, because a challenge can be rescheduled and the promise was "until your
 * first one ends", not "until a date we worked out in advance".
 *
 * Null means no challenge has ended-dated yet, which means the window has not
 * started and nothing is blocked.
 */
export async function graceEndsAt(db: DB, campaignId: string): Promise<Date | null> {
  try {
    // `challenges.sponsorCampaignId` is the link of record. The campaign's
    // `slotState` JSON also carries challengeIds, but it is a denormalised copy
    // maintained by `bindSlotChallenge` — so it is the fallback, not the source,
    // and a challenge created by any other route still counts.
    const direct = await db.select({ endAt: schema.challenges.endAt })
      .from(schema.challenges)
      .where(eq(schema.challenges.sponsorCampaignId, campaignId))
      .orderBy(asc(schema.challenges.startAt)).limit(1);
    if (direct[0]?.endAt) return direct[0].endAt;

    const [c] = await db.select({ slotState: schema.sponsoredCampaigns.slotState })
      .from(schema.sponsoredCampaigns).where(eq(schema.sponsoredCampaigns.id, campaignId)).limit(1);
    const slots = (c?.slotState ?? []) as { index: number; challengeId?: string | null }[];
    const ids = [...slots].sort((a, b) => a.index - b.index)
      .map((s) => s.challengeId).filter((x): x is string => !!x);
    if (!ids.length) return null;
    const rows = await db.select({ endAt: schema.challenges.endAt })
      .from(schema.challenges).where(inArray(schema.challenges.id, ids))
      .orderBy(asc(schema.challenges.startAt)).limit(1);
    return rows[0]?.endAt ?? null;
  } catch { return null; }
}

export type BlockState = {
  blocked: boolean;
  reason: string;
  invoiceId: string | null;
  invoiceNumber: string | null;
  amount: number;
  /** When the window closes (or closed). */
  graceEndsAt: string | null;
  stage: DunningStage;
};

const OPEN: BlockState = { blocked: false, reason: "", invoiceId: null, invoiceNumber: null, amount: 0, graceEndsAt: null, stage: "paid" };

/**
 * Whether a brand may have another challenge published.
 *
 * NOT whether it may be paid, and NOT whether its gamers may redeem. The block
 * is on publishing new inventory and on nothing else — everything already won
 * still pays, which is the line that keeps this fair to the people who did the
 * work.
 */
export async function brandBlocked(db: DB, brandId: string, now = new Date()): Promise<BlockState> {
  try {
    const campaigns = await db.select().from(schema.sponsoredCampaigns)
      .where(eq(schema.sponsoredCampaigns.brandId, brandId))
      .orderBy(asc(schema.sponsoredCampaigns.createdAt));
    if (!campaigns.length) return OPEN;

    let worst: BlockState = OPEN;
    for (const c of campaigns) {
      const inv = await campaignInvoice(db, c.id);
      if (!inv || inv.status === "paid" || inv.status === "void") continue;
      const total = await invoiceTotal(db, inv.id);
      const grace = await graceEndsAt(db, c.id);
      const past = !!grace && now > grace;
      const stage: DunningStage = past ? "blocked" : (inv.dueAt && now >= inv.dueAt ? "due" : "issued");
      const state: BlockState = {
        blocked: past,
        reason: past
          ? `Invoice ${inv.number} for your ${c.game} campaign is unpaid, and the first challenge has ended. Nothing new is published until it clears — your running challenges finish, and every prize already won is still paid.`
          : "",
        invoiceId: inv.id, invoiceNumber: inv.number, amount: total,
        graceEndsAt: grace?.toISOString() ?? null,
        stage,
      };
      // The blocking one wins; otherwise the furthest-along unpaid one, so the
      // portal shows the invoice that matters rather than the oldest row.
      if (state.blocked) return state;
      if (worst === OPEN || stage === "due") worst = state;
    }
    return worst;
  } catch {
    // Fail OPEN. This guard withholds a community's competition, and a database
    // hiccup is not a reason to do that — the money guard that fails closed is
    // the payout one (B35), where the cost of being wrong is unrecoverable.
    return OPEN;
  }
}

export async function invoiceTotal(db: DB, invoiceId: string): Promise<number> {
  try {
    const lines = await db.select({ q: schema.invoiceLines.quantity, u: schema.invoiceLines.unitAmount })
      .from(schema.invoiceLines).where(eq(schema.invoiceLines.invoiceId, invoiceId));
    return Math.round(lines.reduce((s, l) => s + Number(l.q ?? 0) * Number(l.u ?? 0), 0) * 100) / 100;
  } catch { return 0; }
}

/**
 * The dunning schedule: issued → due → overdue → blocked, each sent once.
 *
 * "Once" is enforced from `email_log` rather than from a flag on the invoice.
 * The log is the record of what actually left the building, so it is the only
 * thing that can answer "did they get told" — a flag records that we intended
 * to, which is a different question and the wrong one.
 */
export async function runDunning(db: DB, now = new Date()): Promise<{ sent: string[] }> {
  const sent: string[] = [];
  try {
    const { emailUser, sendEmail } = await import("@/lib/email");
    void emailUser;
    const campaigns = await db.select().from(schema.sponsoredCampaigns);
    for (const c of campaigns) {
      const inv = await campaignInvoice(db, c.id);
      if (!inv || inv.status === "paid" || inv.status === "void") continue;
      const grace = await graceEndsAt(db, c.id);
      const stage: DunningStage = grace && now > grace ? "blocked"
        : inv.dueAt && now >= inv.dueAt ? "due" : "issued";
      const template = stage === "blocked" ? "invoice.due" : stage === "due" ? "invoice.due" : "invoice.issued";
      // One row per (template, invoice). A brand that has already been told the
      // invoice is due does not get told again every time this runs.
      const [already] = await db.select({ id: schema.emailLog.id }).from(schema.emailLog)
        .where(and(
          eq(schema.emailLog.template, template),
          eq(schema.emailLog.refType, `campaign:${stage}`),
          eq(schema.emailLog.refId, inv.id),
        )).limit(1);
      if (already) continue;

      const [brand] = await db.select({ name: schema.brands.name, email: schema.brands.contactEmail })
        .from(schema.brands).where(eq(schema.brands.id, c.brandId)).limit(1);
      if (!brand?.email) continue;   // nothing to send to; the console shows it
      const total = await invoiceTotal(db, inv.id);
      const site = process.env.NEXT_PUBLIC_SITE_URL || "https://clustergg.com";
      await sendEmail({
        to: brand.email,
        template,
        data: {
          brand: brand.name,
          number: inv.number,
          total: { amount: total, currency: inv.currency ?? "USD" },
          dueOn: (inv.dueAt ?? now).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" }),
          payUrl: `${site}/invoice/${inv.payToken}`,
        },
        ref: { type: `campaign:${stage}`, id: inv.id },
      });
      sent.push(`${inv.number}:${stage}`);
    }
  } catch { /* dunning must never take a boot down */ }
  return { sent };
}
