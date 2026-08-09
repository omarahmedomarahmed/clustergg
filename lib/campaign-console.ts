// Every campaign, and whether it is actually happening. B102.
//
// ===== THE QUESTION THIS ANSWERS =====
//
// A campaign is the thing a brand buys: one to four weekly challenges, one
// bill. Until now the only way to see one was to open the brand it belongs to,
// and the only way to see all of them was not to.
//
// That is fine right up until there are twenty, and then the question nobody
// can answer is the one that costs money: **which weeks did somebody pay for
// that are not going to happen?** A slot with no challenge two days before it
// opens is a refund and an apology; a week later it is a refund, an apology and
// a brand that does not come back.
//
// So the console is sorted by RISK, not by date. What needs doing is at the
// top, and "nothing needs doing" is a thing it can say.
//
// ===== IT COMPUTES NOTHING OF ITS OWN =====
//
// The slot state, the games and the bill are read from the same functions the
// brand's own portal and the challenge editor read. A console with a private
// idea of what "live" means is a console that disagrees with the screen an
// operator opens next.

import { and, desc, eq, inArray } from "drizzle-orm";
import type { DB } from "@/lib/db";
import * as schema from "@/lib/db/schema";
import { campaignGames, type Slot } from "@/lib/sponsored-campaigns";

/** A slot opening sooner than this with nothing in it is urgent. */
export const AT_RISK_DAYS = 3;

export type ConsoleSlot = {
  index: number;
  startAt: string;
  endAt: string;
  game: string;
  status: Slot["status"];
  challengeId: string | null;
  /** Opens within AT_RISK_DAYS and has no challenge behind it. */
  atRisk: boolean;
};

export type ConsoleCampaign = {
  id: string;
  brandId: string;
  brandName: string;
  /** Every game across the slots, in slot order. C7 — a campaign can be mixed. */
  games: string[];
  status: string;
  startAt: string;
  slots: ConsoleSlot[];
  slotsBought: number;
  slotsLive: number;
  slotsDone: number;
  /** Slots with nothing built for them yet. */
  slotsEmpty: number;
  total: number;
  /** Invoiced, and how much of it has actually been paid. */
  invoiced: number;
  paid: number;
  /**
   * Why this campaign is at the top of the list, in one line. Empty when
   * nothing is wrong — a console that always says something teaches people to
   * skip it.
   */
  warning: string;
  /** Higher sorts first. Derived from the warnings, never stored. */
  risk: number;
};

const round2 = (n: number) => Math.round(n * 100) / 100;

/**
 * Every campaign, worst first.
 *
 * `limit` bounds the read rather than the answer: an operator wants the twenty
 * that need attention, and a console that loads two thousand rows to show
 * twenty is a page nobody opens twice.
 */
export async function campaignConsole(db: DB, limit = 100): Promise<ConsoleCampaign[]> {
  try {
    const rows = await db.select().from(schema.sponsoredCampaigns)
      .orderBy(desc(schema.sponsoredCampaigns.createdAt)).limit(limit);
    if (!rows.length) return [];

    const brandIds = [...new Set(rows.map((r) => r.brandId))];
    const brands = await db.select({ id: schema.brands.id, name: schema.brands.name })
      .from(schema.brands).where(inArray(schema.brands.id, brandIds));
    const brandName = new Map(brands.map((b) => [b.id, b.name]));

    // The invoice lines that point at these campaigns, and what was paid. One
    // query for the whole page rather than one per campaign — the console is
    // the screen most likely to be left open on a second monitor.
    const lines = await db.select({
      sourceId: schema.invoiceLines.sourceId,
      quantity: schema.invoiceLines.quantity,
      unitAmount: schema.invoiceLines.unitAmount,
      status: schema.brandInvoices.status,
    }).from(schema.invoiceLines)
      .innerJoin(schema.brandInvoices, eq(schema.brandInvoices.id, schema.invoiceLines.invoiceId))
      .where(and(
        eq(schema.invoiceLines.sourceType, "campaign"),
        inArray(schema.invoiceLines.sourceId, rows.map((r) => r.id)),
      ));

    const invoicedBy = new Map<string, number>();
    const paidBy = new Map<string, number>();
    for (const l of lines) {
      const key = String(l.sourceId ?? "");
      const amount = Number(l.quantity ?? 1) * Number(l.unitAmount ?? 0);
      invoicedBy.set(key, (invoicedBy.get(key) ?? 0) + amount);
      if (l.status === "paid") paidBy.set(key, (paidBy.get(key) ?? 0) + amount);
    }

    const now = Date.now();
    const riskWindow = AT_RISK_DAYS * 86400_000;

    const out = rows.map((c) => {
      const slotState = ((c.slotState ?? []) as Slot[]).slice().sort((a, b) => a.index - b.index);
      const games = campaignGames(c);

      const slots: ConsoleSlot[] = slotState.map((s) => {
        const startAt = new Date(s.startAt);
        const empty = !s.challengeId;
        return {
          index: s.index,
          startAt: s.startAt,
          endAt: s.endAt,
          game: s.game || c.game,
          status: s.status,
          challengeId: s.challengeId ?? null,
          // Only a FUTURE slot can be at risk. A week that already opened with
          // nothing in it is a different and worse problem, and calling it "at
          // risk" would let it hide among the ones that are still fixable.
          atRisk: empty && +startAt > now && +startAt - now < riskWindow,
        };
      });

      const slotsEmpty = slots.filter((s) => !s.challengeId && s.status !== "done").length;
      const atRisk = slots.filter((s) => s.atRisk).length;
      const missed = slots.filter((s) => !s.challengeId && +new Date(s.startAt) <= now).length;
      const invoiced = round2(invoicedBy.get(c.id) ?? 0);
      const paid = round2(paidBy.get(c.id) ?? 0);
      const unpaid = round2(invoiced - paid);

      // In severity order, and only the first is shown. Three warnings stacked
      // on one row is a row nobody reads.
      const warning =
        missed > 0
          ? `${missed} week${missed === 1 ? "" : "s"} opened with no challenge behind ${missed === 1 ? "it" : "them"}. That is a refund conversation, not a backlog item.`
          : atRisk > 0
            ? `${atRisk} week${atRisk === 1 ? "" : "s"} open${atRisk === 1 ? "s" : ""} within ${AT_RISK_DAYS} days with nothing built.`
            : invoiced === 0 && c.status !== "draft"
              ? "Nothing has been invoiced for this. It is running on nobody's money."
              : unpaid > 0.005 && c.status === "running"
                ? `Running with $${unpaid.toFixed(2)} unpaid.`
                : "";

      const risk = (missed * 1000) + (atRisk * 100)
        + (invoiced === 0 && c.status !== "draft" ? 50 : 0)
        + (unpaid > 0.005 && c.status === "running" ? 10 : 0);

      return {
        id: c.id,
        brandId: c.brandId,
        brandName: brandName.get(c.brandId) ?? c.brandId,
        games,
        status: c.status,
        startAt: c.startAt.toISOString(),
        slots,
        slotsBought: Number(c.slots ?? slots.length),
        slotsLive: slots.filter((s) => s.status === "live").length,
        slotsDone: slots.filter((s) => s.status === "done").length,
        slotsEmpty,
        total: round2(Number(c.total ?? 0)),
        invoiced,
        paid,
        warning,
        risk,
      };
    });

    // Worst first, then newest. An operator opening this wants the thing that
    // is on fire, not the thing that happens to be most recent.
    return out.sort((a, b) => b.risk - a.risk || (a.startAt < b.startAt ? 1 : -1));
  } catch { return []; }
}
