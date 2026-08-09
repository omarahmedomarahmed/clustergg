// A brand's money always belongs to a campaign. B91.5.
//
// ===== THE RULE =====
//
// If a brand is paying for a challenge, that challenge belongs to a campaign.
// No exceptions, including the ones an admin builds by hand.
//
// It reads like bookkeeping pedantry and it is not. The campaign is the only
// object that answers "what did this brand buy" — the invoice lines point at
// it, `billFor` rolls a whole series up under it, the brand's own portal lists
// it, and the report at the end of the month is built from it. A sponsored
// challenge with no campaign is money that arrived attached to nothing: it
// shows on no report, appears in no renewal conversation, and the brand's
// portal says they bought nothing.
//
// ===== WHY IT IS CREATED RATHER THAN DEMANDED =====
//
// The builder could simply refuse to save until somebody picks a campaign. That
// is worse. The case this exists for is a SALES DEAL — eight weeks on two
// games at a price nobody has a package for — and at the moment that deal is
// being typed in, the campaign it belongs to does not exist yet. Refusing means
// the operator leaves the builder, creates a campaign somewhere else, comes
// back, and re-types everything they had on screen.
//
// So it is created from what they already typed, as a DRAFT: built, not paid.
// Which is exactly what a bespoke deal is until the invoice clears, and exactly
// what `stageOf` needs to keep it off the network until it does.

import { eq } from "drizzle-orm";
import type { DB } from "@/lib/db";
import * as schema from "@/lib/db/schema";
import { uid } from "@/lib/utils";
import { planRuns } from "@/lib/series-plan";

export type EnsureInput = {
  brandId: string;
  game: string;
  startAt: Date;
  cadence: string;
  runs: number;
  pricePerChallenge: number;
  /** The title the operator typed, so the campaign is recognisable in a list. */
  label?: string;
};

/**
 * The campaign this challenge belongs to, creating it if it does not exist.
 *
 * Returns null only when there is no brand — a house challenge belongs to
 * nothing and should not have an empty campaign minted for it.
 */
export async function ensureCampaignFor(
  db: DB,
  input: EnsureInput & { campaignId?: string | null },
): Promise<string | null> {
  if (!input.brandId) return null;

  // An existing campaign the operator picked. Verified rather than trusted: a
  // stale id from a re-submitted form would otherwise attach this challenge to
  // a campaign that has been deleted, and the bill would roll up to nothing.
  if (input.campaignId) {
    const [found] = await db.select({ id: schema.sponsoredCampaigns.id })
      .from(schema.sponsoredCampaigns)
      .where(eq(schema.sponsoredCampaigns.id, input.campaignId)).limit(1);
    if (found) return found.id;
  }

  try {
    const runs = Math.max(1, Math.round(input.runs) || 1);
    const windows = planRuns(input.startAt, input.cadence, runs);
    const price = Math.max(0, Number(input.pricePerChallenge) || 0);
    const id = uid();

    await db.insert(schema.sponsoredCampaigns).values({
      id,
      brandId: input.brandId,
      game: input.game,
      slots: runs,
      pricePerChallenge: price,
      total: Math.round(price * runs * 100) / 100,
      // DRAFT, not submitted. An admin building a bespoke deal has not been
      // paid for it yet, and a campaign that says "running" before the invoice
      // clears is the exact claim the status ladder exists to prevent.
      status: "draft",
      startAt: windows[0].startAt,
      slotState: windows.map((w) => ({
        index: w.index,
        startAt: w.startAt.toISOString(),
        endAt: w.endAt.toISOString(),
        game: input.game,
        status: "waiting" as const,
      })),
      targeting: {},
    } as never);
    return id;
  } catch {
    // A campaign we could not create must not take the challenge down with it.
    // The challenge saves unattached and `billFor` says so loudly — which is
    // the same warning an operator would get for forgetting to pick one.
    return null;
  }
}

/**
 * Attach a challenge — and every other run of its series — to a campaign.
 *
 * Series-wide on purpose. A campaign is what a brand BOUGHT, and they bought
 * eight weeks, not week one; attaching only the run being edited would leave
 * seven weeks billing to nothing and a report that says the deal was an eighth
 * of its size.
 */
export async function attachSeriesToCampaign(
  db: DB,
  seriesId: string,
  campaignId: string,
  brandId: string,
): Promise<number> {
  try {
    const runs = await db.select({ id: schema.challenges.id })
      .from(schema.challenges).where(eq(schema.challenges.seriesId, seriesId));
    for (const r of runs) {
      await db.update(schema.challenges)
        .set({ sponsorCampaignId: campaignId, sponsorBrandId: brandId })
        .where(eq(schema.challenges.id, r.id));
    }
    return runs.length;
  } catch { return 0; }
}
