import type { CollectAdapter, PayoutAdapter } from "@/lib/payments/types";

// The adapter that always works.
//
// Not a placeholder and not a stub — this is how the billing and payout cycle
// runs on day one, and how it keeps running for any vendor whose product is a
// dashboard rather than an API. Payoneer payment requests are the obvious
// example: there is no endpoint to call, a human clicks "Request a payment" and
// pastes the link onto the invoice. That workflow is completely legitimate and
// the software's job is to hold the link, the reference and the state — which
// is exactly what these two do.
//
// Both return `ok` with no URL. The caller reads that as "a person does this
// step", which every page here is already built to show.

export const manualCollect: CollectAdapter = {
  key: "manual",
  label: "Manual — paste a payment link",
  configured: () => true,
  async createPaymentLink() {
    return {
      ok: true,
      // Empty on purpose: staff paste the real one from whatever provider
      // issued it. The invoice's own `payLinkUrl` is what the brand sees.
      url: "",
      ref: "",
      embeddable: false,
    };
  },
};

export const manualPayout: PayoutAdapter = {
  key: "manual",
  label: "Manual — send it yourself",
  configured: () => true,
  async onboardingUrl() {
    // Nothing hosted to send them to. The recipient states a PREFERENCE — "pay
    // me by bank transfer", "pay me on PayPal" — and the actual details are
    // exchanged out of band, over the message thread that already exists in
    // both portals. Nothing lands in this database either way.
    return { ok: true, url: null, embeddable: false, recipientRef: null };
  },
  async send() {
    // Recorded, not sent. Staff make the transfer and mark it paid with a
    // reference, which is the honest state: the row says money is owed and a
    // human says when it moved.
    return { ok: true, ref: "", link: null, settled: false };
  },
};
