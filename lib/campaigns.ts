// The founding offers, as promotional campaigns we switch on and off (B44,
// amending B30).
//
// **This file is PURE and stays that way.** `lib/invoices.ts` imports
// `campaignDiscountLine`, and two client components import `lib/invoices` — so
// the moment anything here reaches `lib/cms` (which reaches `lib/i18n/server`,
// which reaches `next/headers`) the BUILD fails with an error naming i18n and
// nothing in this feature, while the typecheck stays green. A dynamic import
// does not help: Next traces those too. The readers live in
// `lib/campaigns-read.ts`, which only server code imports.
//
// They were modelled in `lib/offers.ts` as product behaviour: counters derived
// from pricing and finance config, always live, with no way to stop them. That
// is the wrong shape for what they are. These are **spend** — funded out of the
// round, not out of a customer's budget — and spend needs a switch, a rate, a
// bill that shows it, and a number at the end saying what it cost.
//
// Four decisions, stated once:
//
//   1. **Off by default.** Both campaigns turn on when we have decided to
//      spend, not when the code deploys. `enabled` defaults to false and there
//      is no environment or seed that flips it.
//   2. **A PERCENTAGE, not a fixed amount.** $1,000 happens to be 100% of four
//      weekly challenges at today's price. Expressed as a percentage, admin can
//      dial it to 50% or 25% without redesigning the offer, and it survives a
//      repricing. Expressed as $1,000 it would silently become 80% the day
//      challenges cost more.
//   3. **It covers the CHALLENGE lines only.** Placements are still billed.
//      That is what makes it a promotion on the thing we want brands to try
//      rather than a month of free everything.
//   4. **Its own line on the bill, never a reduced unit price.** The gross
//      figure is what tells us what the campaign cost, and a bill whose numbers
//      cannot be traced is a bill somebody disputes. Same rule the sponsored-
//      plan base reduction already follows in `lib/invoices.ts`.

export const CAMPAIGN_KEYS = {
  brandEnabled: "campaign.brand.enabled",
  brandPct: "campaign.brand.pct",
  brandCap: "campaign.brand.cap",
  serverEnabled: "campaign.server.enabled",
  serverValue: "campaign.server.value",
  serverCap: "campaign.server.cap",
} as const;

export const CAMPAIGN_CMS_KEYS = Object.values(CAMPAIGN_KEYS);

/** 100% of the challenge lines — what the original offer was, as a rate. */
export const DEFAULT_BRAND_PCT = 100;

export type CampaignConfig = {
  brand: {
    /** OFF until somebody turns it on. Never defaulted true. */
    enabled: boolean;
    /** Percentage of the CHALLENGE lines covered. Placements are still billed. */
    pct: number;
    cap: number;
  };
  server: {
    enabled: boolean;
    /** What one funded welcome challenge costs us. */
    value: number;
    cap: number;
  };
};

const bool = (v: string | undefined) => v === "1" || v === "true";

/**
 * A number from the CMS, or the fallback.
 *
 * The empty-string check is load-bearing and was missing. `getContent` returns
 * `""` for a key that has never been set, and `Number("")` is `0` — which is
 * finite and non-negative, so the fallback never applied and a fresh install
 * read the brand campaign as **0%** instead of 100%. Found in a browser: the
 * console rendered "0%" on a page whose default is 100, while the unit test
 * passed because it fed `{}` rather than `{ key: "" }`.
 */
const num = (v: string | undefined, fallback: number) => {
  if (v === undefined || v === null || String(v).trim() === "") return fallback;
  const n = Number(v);
  return Number.isFinite(n) && n >= 0 ? n : fallback;
};

/** Clamped to 0–100: a percentage outside that is a typo, not an instruction. */
export const clampPct = (n: number) => Math.max(0, Math.min(100, Math.round(n)));

export function buildCampaigns(
  content: Record<string, string | undefined>,
  fallbacks: { serverValue: number; serverCap: number; brandCap: number },
): CampaignConfig {
  return {
    brand: {
      enabled: bool(content[CAMPAIGN_KEYS.brandEnabled]),
      pct: clampPct(num(content[CAMPAIGN_KEYS.brandPct], DEFAULT_BRAND_PCT)),
      cap: num(content[CAMPAIGN_KEYS.brandCap], fallbacks.brandCap),
    },
    server: {
      enabled: bool(content[CAMPAIGN_KEYS.serverEnabled]),
      value: num(content[CAMPAIGN_KEYS.serverValue], fallbacks.serverValue),
      cap: num(content[CAMPAIGN_KEYS.serverCap], fallbacks.serverCap),
    },
  };
}

export type BillLine = { kind: string; label: string; quantity: number; unitAmount: number };

const round2 = (n: number) => Math.round(n * 100) / 100;

/**
 * The campaign's discount line for a set of invoice lines, or null.
 *
 * Reads the CHALLENGE lines only (`kind: "game"`), so placements are still
 * charged however generous the percentage is. Returns null rather than a zero
 * line when the campaign is off or there is nothing to cover — a $0.00
 * "Founding brand offer" row on a bill is a question, not information.
 */
export function campaignDiscountLine(
  lines: BillLine[],
  cfg: CampaignConfig,
): BillLine | null {
  if (!cfg.brand.enabled || cfg.brand.pct <= 0) return null;
  const challenges = lines
    .filter((l) => l.kind === "game")
    .reduce((s, l) => s + l.quantity * l.unitAmount, 0);
  if (challenges <= 0) return null;
  const covered = round2((challenges * cfg.brand.pct) / 100);
  if (covered <= 0) return null;
  return {
    kind: "discount",
    label: cfg.brand.pct >= 100
      ? "Founding brand offer — sponsored challenges covered by Cluster"
      : `Founding brand offer — ${cfg.brand.pct}% of sponsored challenges covered by Cluster`,
    quantity: 1,
    unitAmount: -covered,
  };
}

/** What one invoice's campaign line actually cost us, for the analytics table. */
export function campaignCostOf(lines: { kind: string; label: string; quantity: number; unitAmount: number }[]): number {
  return round2(lines
    .filter((l) => l.kind === "discount" && /founding brand offer/i.test(l.label))
    .reduce((s, l) => s + Math.abs(l.quantity * l.unitAmount), 0));
}
