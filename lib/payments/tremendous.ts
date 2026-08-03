import { fail, providerError, providerFetch, type Counterparty, type PayoutAdapter, type PayoutRequest } from "@/lib/payments/types";

// Tremendous — the rewards rail.
//
// This is the one that solves trophy redemption, and it solves it by not
// asking. We send an amount and a name; Tremendous returns a link; the gamer
// opens it and chooses for themselves between a bank transfer, PayPal, a
// prepaid Visa or a gift card in their own currency, from 200 countries.
//
// Which means the thing we would otherwise have to collect — a routing number
// from a nineteen-year-old in a country whose banking system we have never
// heard of — is never collected at all. There is no payout detail in this
// database because there is no moment at which one would arrive.
//
// What we keep: an order id and a redemption URL. Both are useless to anybody
// who steals them after redemption, and the URL is only ever shown to the gamer
// it belongs to.
//
// Setup is in docs/PAYMENTS.md. The sandbox needs no approval, so this whole
// path is testable before the company has a bank account.

const PROD = "https://api.tremendous.com/api/v2";
const SANDBOX = "https://testflight.tremendous.com/api/v2";

function base(): string {
  return (process.env.TREMENDOUS_ENV ?? "sandbox").toLowerCase() === "production" ? PROD : SANDBOX;
}

export function tremendousConfigured(): boolean {
  return !!process.env.TREMENDOUS_API_KEY;
}

/** Which environment is live, for the admin console to state plainly. */
export function tremendousMode(): "production" | "sandbox" {
  return (process.env.TREMENDOUS_ENV ?? "sandbox").toLowerCase() === "production" ? "production" : "sandbox";
}

async function call(path: string, body: unknown): Promise<Response> {
  return providerFetch(`${base()}${path}`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${process.env.TREMENDOUS_API_KEY}`,
      "Content-Type": "application/json",
      Accept: "application/json",
    },
    body: JSON.stringify(body),
  });
}

/**
 * Dig the redemption link out of the response.
 *
 * Tremendous has put it in more than one place across API revisions, and a
 * successful order whose link we failed to find is money sent to somebody who
 * cannot collect it. So look everywhere rather than trusting one path.
 */
function linkFrom(json: unknown): string | null {
  const order = (json as { order?: Record<string, unknown> })?.order ?? (json as Record<string, unknown>);
  const rewards = (order?.rewards ?? []) as Record<string, unknown>[];
  for (const r of rewards) {
    const delivery = (r?.delivery ?? {}) as Record<string, unknown>;
    const candidate = delivery.link ?? r.link ?? (r as { redemption?: { link?: string } }).redemption?.link;
    if (typeof candidate === "string" && candidate.startsWith("http")) return candidate;
  }
  return null;
}

function idFrom(json: unknown): string {
  const order = (json as { order?: { id?: string } })?.order;
  return String(order?.id ?? (json as { id?: string })?.id ?? "");
}

export const tremendousPayout: PayoutAdapter = {
  key: "tremendous",
  label: "Tremendous — the recipient picks their own payout",
  configured: tremendousConfigured,

  async onboardingUrl(_to: Counterparty) {
    // No onboarding step exists, and that is the feature. The recipient makes
    // their choice at redemption time on Tremendous's page, so there is nothing
    // to collect in advance and nothing for us to hold in the meantime.
    void _to;
    return { ok: true as const, url: null, embeddable: false, recipientRef: null };
  },

  async send(req: PayoutRequest) {
    if (!tremendousConfigured()) return fail("Tremendous is not connected yet — add TREMENDOUS_API_KEY.");
    if (!(req.amount.amount > 0)) return fail("Nothing to send.");

    const reward: Record<string, unknown> = {
      value: { denomination: Number(req.amount.amount.toFixed(2)), currency_code: req.amount.currency },
      // LINK, never EMAIL. We deliver the link ourselves, inside the account
      // the gamer is already signed into, so a redemption cannot be collected
      // by whoever happens to read their inbox.
      delivery: { method: "LINK" },
      recipient: { name: req.to.name, email: req.to.email || undefined },
    };
    if (process.env.TREMENDOUS_CAMPAIGN_ID) reward.campaign_id = process.env.TREMENDOUS_CAMPAIGN_ID;

    try {
      const res = await call("/orders", {
        // Our payout id, so a duplicate submission is rejected by Tremendous
        // rather than paid twice. The single most valuable line in this file.
        external_id: req.payoutRef,
        payment: { funding_source_id: process.env.TREMENDOUS_FUNDING_SOURCE_ID || "balance" },
        reward,
      });
      if (!res.ok) return fail(await providerError(res, "Tremendous"));
      const json = await res.json();
      const link = linkFrom(json);
      const ref = idFrom(json);
      if (!ref) return fail("Tremendous accepted the order but returned no id — check the dashboard before retrying.");
      return {
        ok: true as const,
        ref,
        link,
        // Ordered, not collected. It is settled when the gamer redeems, and the
        // difference matters: the liability is still ours until they do.
        settled: false,
      };
    } catch (e) {
      return fail(`Could not reach Tremendous: ${(e as Error).message}`);
    }
  },
};
