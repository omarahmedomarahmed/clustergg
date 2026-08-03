import { getContent, setContent } from "@/lib/cms";
import { manualCollect, manualPayout } from "@/lib/payments/manual";
import { stripeCollect, stripeConfigured } from "@/lib/payments/stripe";
import { tremendousMode, tremendousPayout, tremendousConfigured } from "@/lib/payments/tremendous";
import { trolleyPayout, trolleyConfigured } from "@/lib/payments/trolley";
import { RECOMMENDATION, VENDORS, type Flow } from "@/lib/payments/vendors";
import type { CollectAdapter, PayoutAdapter } from "@/lib/payments/types";

// Which vendor handles which flow.
//
// Two inputs decide it, in this order:
//
//   1. What an admin chose, stored in the CMS like every other setting.
//   2. Whether that vendor's keys actually exist.
//
// If either is missing we fall back to `manual`, which always works. That
// fallback is not a degraded mode — it is a complete workflow where staff paste
// a link and record a reference, and it is how this runs until somebody signs
// with a provider. The important property is that the fallback and the
// integration produce the SAME rows in the same tables, so switching providers
// never orphans an invoice or a payout.
//
// Secrets live in environment variables and only there. The CMS holds a choice
// of vendor — a word like "tremendous" — and nothing else. An admin console
// that could read an API key is a console that leaks one.

export const SETTING_KEYS: Record<Flow, string> = {
  collect: "payments.collect.provider",
  payout: "payments.payout.provider",
  rewards: "payments.rewards.provider",
};

export const PAYMENT_CMS_KEYS = [
  ...Object.values(SETTING_KEYS),
  "payments.payTerms",
  "payments.payNote",
  "payments.payoutNote",
  "payments.redeemNote",
];

const COLLECT: Record<string, CollectAdapter> = {
  manual: manualCollect,
  stripe: stripeCollect,
};

const PAYOUT: Record<string, PayoutAdapter> = {
  manual: manualPayout,
  tremendous: tremendousPayout,
  trolley: trolleyPayout,
};

/** Every vendor whose keys are present, whatever the admin chose. */
export function liveVendors(): string[] {
  return [
    "manual",
    ...(stripeConfigured() ? ["stripe"] : []),
    ...(tremendousConfigured() ? ["tremendous"] : []),
    ...(trolleyConfigured() ? ["trolley"] : []),
  ];
}

async function chosen(flow: Flow): Promise<string> {
  try {
    const c = await getContent([SETTING_KEYS[flow]]);
    const pick = (c[SETTING_KEYS[flow]] ?? "").trim();
    if (pick) return pick;
  } catch { /* CMS unavailable — fall through to the recommendation */ }
  return RECOMMENDATION[flow];
}

/**
 * The adapter that will actually run, and why.
 *
 * Returns the fallback rather than throwing when a chosen vendor has no keys,
 * and says so in `reason` — a payout page that refuses to load because somebody
 * picked Trolley last week and never pasted the secret is a page that has made
 * a configuration mistake into an outage.
 */
export async function collector(): Promise<{ adapter: CollectAdapter; picked: string; reason: string | null }> {
  const picked = await chosen("collect");
  const adapter = COLLECT[picked];
  if (adapter?.configured()) return { adapter, picked, reason: null };
  return {
    adapter: manualCollect,
    picked,
    reason: adapter
      ? `${picked} is selected but its keys are not set, so payment links are entered by hand.`
      : `${picked} has no API worth integrating, so payment links are entered by hand.`,
  };
}

export async function payer(flow: "payout" | "rewards"): Promise<{ adapter: PayoutAdapter; picked: string; reason: string | null }> {
  const picked = await chosen(flow);
  const adapter = PAYOUT[picked];
  if (adapter?.configured()) return { adapter, picked, reason: null };
  return {
    adapter: manualPayout,
    picked,
    reason: adapter
      ? `${picked} is selected but its keys are not set, so payouts are sent by hand and recorded here.`
      : `${picked} has no API worth integrating, so payouts are sent by hand and recorded here.`,
  };
}

export async function setProvider(flow: Flow, key: string): Promise<void> {
  const valid = VENDORS.some((v) => v.key === key && v.flows.includes(flow));
  if (!valid) return;
  await setContent(SETTING_KEYS[flow], key);
}

/** What the admin console shows: the choice, the keys, and the truth about both. */
export type ProviderStatus = {
  flow: Flow;
  picked: string;
  effective: string;
  configured: boolean;
  note: string | null;
  /** Extra detail worth stating on the page — sandbox vs production, mostly. */
  mode: string | null;
};

export async function providerStatus(): Promise<ProviderStatus[]> {
  const [c, p, r] = await Promise.all([collector(), payer("payout"), payer("rewards")]);
  const modeOf = (key: string) => (key === "tremendous" ? tremendousMode() : null);
  return [
    { flow: "collect", picked: c.picked, effective: c.adapter.key, configured: !c.reason, note: c.reason, mode: modeOf(c.adapter.key) },
    { flow: "payout", picked: p.picked, effective: p.adapter.key, configured: !p.reason, note: p.reason, mode: modeOf(p.adapter.key) },
    { flow: "rewards", picked: r.picked, effective: r.adapter.key, configured: !r.reason, note: r.reason, mode: modeOf(r.adapter.key) },
  ];
}

export const FLOW_LABEL: Record<Flow, string> = {
  collect: "Brands pay us",
  payout: "We pay server owners",
  rewards: "Gamers cash out trophies",
};
