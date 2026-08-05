// Cluster, as a brand that gets a bill (B31.2).
//
// A welcome challenge is a giveaway. The temptation is to run it outside the
// billing system, because nobody is going to pay the invoice — and that is
// exactly the mistake. A giveaway that skips billing is a giveaway nobody can
// add up: it shows as a cost in a spreadsheet somebody maintains by hand, in
// units that do not match the revenue it is supposed to produce.
//
// Running it through the same invoice machinery a paying brand uses means the
// cost of the server offer lands in the same ledger, in the same units, as the
// revenue it is meant to produce. When somebody asks what customer acquisition
// cost, the answer is a query.
//
// **THE HOUSE BRAND ALREADY EXISTS. This file must never create a second one.**
//
// `runBootMaintenance` in `lib/db/seed.ts` inserts it on every boot with the
// fixed id `house-cluster-brand`, and production's row carries every house ad
// creative and its own brand portal. A second "Cluster" brand would split the
// ledger this exists to keep whole and orphan those creatives — so this
// resolves to the known id first, adopts a plausible existing row second, and
// only ever inserts USING THAT SAME ID, which `onConflictDoNothing` then makes a
// no-op against the row boot maintenance already made.

import { eq, or } from "drizzle-orm";
import { getDb, schema } from "@/lib/db";
import { uid } from "@/lib/utils";

/** The id `runBootMaintenance` uses. Kept in sync deliberately, not derived. */
export const HOUSE_BRAND_ID = "house-cluster-brand";
export const HOUSE_BRAND_NAME = "Cluster";

export type HouseBrand = { id: string; name: string; slug: string | null };

/**
 * The house brand — found, never duplicated.
 *
 * Returns null rather than throwing when the database is unreachable: a welcome
 * challenge that exists and is not yet billed is a reconciliation job; one that
 * failed to be created because billing was down is a server that never got its
 * offer.
 */
export async function houseBrand(): Promise<HouseBrand | null> {
  try {
    const db = await getDb();
    const cols = { id: schema.brands.id, name: schema.brands.name, slug: schema.brands.slug };

    // 1. The known id. This is the row boot maintenance makes and the row
    //    production's house creatives hang off.
    const [byId] = await db.select(cols).from(schema.brands)
      .where(eq(schema.brands.id, HOUSE_BRAND_ID)).limit(1);
    if (byId) {
      // Flag it if it predates the flag, so lists that mean "customers" can
      // filter on one thing rather than on a magic id.
      await db.update(schema.brands).set({ isHouse: true })
        .where(eq(schema.brands.id, HOUSE_BRAND_ID));
      return byId;
    }

    // 2. Anything already flagged, or sitting on a name/slug we would have
    //    used. Adopting beats creating every time: the cost of adopting the
    //    wrong row is a mislabelled invoice; the cost of creating a rival is a
    //    split ledger and orphaned creatives.
    const [existing] = await db.select(cols).from(schema.brands)
      .where(or(
        eq(schema.brands.isHouse, true),
        eq(schema.brands.slug, "cluster"),
        eq(schema.brands.name, HOUSE_BRAND_NAME),
      )).limit(1);
    if (existing) {
      await db.update(schema.brands).set({ isHouse: true })
        .where(eq(schema.brands.id, existing.id));
      return existing;
    }

    // 3. Only on a database that has never booted maintenance. Uses the SAME
    //    id, so when maintenance does run its insert is a no-op rather than a
    //    second Cluster.
    await db.insert(schema.brands).values({
      id: HOUSE_BRAND_ID, name: HOUSE_BRAND_NAME, industry: "gaming",
      status: "active", isHouse: true,
    } as never).onConflictDoNothing();
    const [made] = await db.select(cols).from(schema.brands)
      .where(eq(schema.brands.id, HOUSE_BRAND_ID)).limit(1);
    return made ?? null;
  } catch { return null; }
}

/**
 * Put one welcome challenge on Cluster's own bill.
 *
 * Keyed on the CHALLENGE, so a re-run adds nothing — the same rule every other
 * invoicing path in this codebase follows, and the reason the offer cannot be
 * double-counted by pressing a button twice.
 *
 * The line goes on an OPEN draft invoice for the house brand, one per month, so
 * a month of growth is one bill rather than forty.
 */
export async function billWelcomeChallenge(
  challengeId: string,
  serverName: string,
  value: number,
): Promise<{ billed: boolean; invoiceId?: string; reason?: string }> {
  if (value <= 0) return { billed: false, reason: "no_value" };
  try {
    const db = await getDb();
    const brand = await houseBrand();
    if (!brand) return { billed: false, reason: "no_house_brand" };

    // Already billed? The challenge id is the key.
    const [dupe] = await db.select({ id: schema.invoiceLines.id })
      .from(schema.invoiceLines)
      .where(eq(schema.invoiceLines.sourceId, challengeId)).limit(1);
    if (dupe) return { billed: false, reason: "already_billed" };

    const { nextInvoiceNumber, payToken, dueDateFrom, monthLabel } = await import("@/lib/invoices");
    const period = monthLabel(new Date());

    const open = await db.select({ id: schema.brandInvoices.id, period: schema.brandInvoices.periodLabel, status: schema.brandInvoices.status })
      .from(schema.brandInvoices).where(eq(schema.brandInvoices.brandId, brand.id));
    let invoiceId = open.find((i) => i.status === "draft" && i.period === period)?.id;

    if (!invoiceId) {
      invoiceId = uid();
      const issued = new Date();
      await db.insert(schema.brandInvoices).values({
        id: invoiceId, brandId: brand.id, number: await nextInvoiceNumber(db),
        status: "draft", currency: "USD", periodLabel: period,
        issuedAt: issued, dueAt: dueDateFrom(issued, 30), payToken: payToken(),
      } as never);
    }

    await db.insert(schema.invoiceLines).values({
      id: uid(), invoiceId, kind: "game",
      label: `Welcome challenge — ${serverName}`,
      quantity: 1, unitAmount: value,
      sourceType: "welcome", sourceId: challengeId, sortOrder: 0,
    } as never);

    return { billed: true, invoiceId };
  } catch { return { billed: false, reason: "error" }; }
}
