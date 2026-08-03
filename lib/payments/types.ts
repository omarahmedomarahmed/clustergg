// The contract every payment provider is held to.
//
// The rule this file exists to enforce: **Cluster never handles payment
// details.** Not a card number, not an IBAN, not a wallet address. Every
// adapter below either returns a URL we send somebody to, or a reference we
// store. If a method here ever grows a parameter called `accountNumber`, the
// design has failed and the answer is a different provider, not a new column.
//
// Two consequences that are easy to miss and worth stating:
//
//   1. Everything is asynchronous and everything can fail with the vendor
//      simply not being set up. `configured()` is therefore part of the
//      interface, and the UI asks it before offering a button — the same
//      pattern as `blobConfigured()`.
//
//   2. There is always a working answer. The `manual` adapter satisfies both
//      interfaces with no credentials at all, so the billing and payout cycle
//      is complete before any vendor relationship exists. Signing with a
//      provider changes which adapter runs; it does not change one page, one
//      table or one server action.

export type Money = { amount: number; currency: string };

export type ProviderResult<T> = ({ ok: true } & T) | { ok: false; error: string };

/** What we know about a counterparty. Deliberately the minimum a vendor needs. */
export type Counterparty = {
  /** Our id for them — a guild id, a user id, a brand id. */
  ref: string;
  name: string;
  email?: string | null;
  /** ISO-3166 alpha-2, when we know it. Used for method availability, nothing else. */
  country?: string | null;
};

// ===== Collecting from brands =====

export type CollectRequest = {
  /** Our invoice id — echoed back by the vendor so a webhook can find it. */
  invoiceRef: string;
  /** Human-facing number, e.g. CGG-0007. */
  number: string;
  brand: Counterparty;
  total: Money;
  dueAt: Date | null;
  lines: { label: string; amount: number }[];
  /** Where the payer lands once the vendor is done with them. */
  returnUrl: string;
};

export type CollectAdapter = {
  key: string;
  label: string;
  configured(): boolean;
  /**
   * A URL the brand can pay at.
   *
   * `embeddable` says whether it is safe to put in an iframe. Most hosted
   * checkouts set `X-Frame-Options: DENY` and must open in a new tab; the pay
   * page renders either without changing.
   */
  createPaymentLink(req: CollectRequest): Promise<ProviderResult<{ url: string; ref: string; embeddable: boolean }>>;
};

// ===== Paying server owners and gamers =====

export type PayoutRequest = {
  /** Our id for the payout row, echoed back for reconciliation. */
  payoutRef: string;
  to: Counterparty;
  amount: Money;
  /** What it is for, shown to the recipient. */
  memo: string;
};

export type PayoutAdapter = {
  key: string;
  label: string;
  configured(): boolean;
  /**
   * Where the recipient goes to tell the VENDOR how they want to be paid.
   *
   * This is the boundary the whole design hangs on. Bank details, tax forms and
   * wallet addresses are entered on the vendor's page — usually an iframe we
   * embed — and we get back an opaque id. Returning `null` means this vendor
   * needs no onboarding step (Tremendous does not: the recipient chooses at
   * redemption time instead).
   */
  onboardingUrl(to: Counterparty): Promise<ProviderResult<{ url: string | null; embeddable: boolean; recipientRef: string | null }>>;
  /**
   * Send the money.
   *
   * `link` is set when the recipient has to do something to collect it — the
   * Tremendous case, where they open a page and choose between a gift card, a
   * transfer or PayPal. `settled` distinguishes "gone" from "queued".
   */
  send(req: PayoutRequest): Promise<ProviderResult<{ ref: string; link: string | null; settled: boolean }>>;
};

/** Both halves, for a vendor that does both. */
export type Adapter = Partial<CollectAdapter & PayoutAdapter> & { key: string; label: string };

export const fail = (error: string): { ok: false; error: string } => ({ ok: false, error });

/**
 * A fetch with a deadline.
 *
 * Every provider call happens inside a server action a human is waiting on. A
 * vendor having a bad afternoon must not turn into a request that hangs until
 * the platform's own timeout — the payout is not lost, it is unsent, and the
 * page should say so within a few seconds.
 */
export async function providerFetch(
  url: string,
  init: RequestInit & { timeoutMs?: number } = {},
): Promise<Response> {
  const { timeoutMs = 12000, ...rest } = init;
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    return await fetch(url, { ...rest, signal: ctrl.signal, cache: "no-store" });
  } finally {
    clearTimeout(timer);
  }
}

/** Vendor errors are JSON, HTML or nothing at all. Turn any of them into a sentence. */
export async function providerError(res: Response, vendor: string): Promise<string> {
  let detail = "";
  try {
    const text = await res.text();
    try {
      const j = JSON.parse(text) as { errors?: { message?: string }; error?: { message?: string } | string; message?: string };
      detail = (typeof j.error === "string" ? j.error : j.error?.message)
        || j.errors?.message || j.message || text.slice(0, 200);
    } catch { detail = text.slice(0, 200); }
  } catch { /* body already consumed or empty */ }
  return `${vendor} refused this (${res.status})${detail ? `: ${detail}` : ""}`;
}
