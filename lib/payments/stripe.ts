import { fail, providerError, providerFetch, type CollectAdapter, type CollectRequest } from "@/lib/payments/types";

// Stripe Invoicing — collecting from brands, once there is an entity Stripe
// supports.
//
// The object built here is a real hosted INVOICE, not a checkout session. That
// distinction is the whole reason to use Stripe for this: a checkout link
// expires in a day and looks like a shopping cart, while an invoice has a
// number, a due date, a PDF and a Pay button, and it is what a brand's finance
// department is expecting to receive. Every line item on our invoice becomes a
// line item on theirs, so the two documents say the same thing.
//
// Stripe's API is form-encoded, which is why the little serialiser exists.
//
// The catch, stated here so nobody discovers it during a launch: Stripe does
// not accept sellers in Egypt or most of MENA. This adapter is correct and
// finished, and it is unusable until the company is incorporated somewhere on
// Stripe's list. Until then `configured()` is false and collection runs on the
// manual adapter with a Payoneer request link. See lib/payments/vendors.ts.

const API = "https://api.stripe.com/v1";

export function stripeConfigured(): boolean {
  return !!process.env.STRIPE_SECRET_KEY;
}

/** Stripe takes `a[b][c]=v`, not JSON. Flatten anything into that. */
function form(obj: Record<string, unknown>, prefix = ""): string[] {
  const out: string[] = [];
  for (const [k, v] of Object.entries(obj)) {
    if (v === undefined || v === null || v === "") continue;
    const key = prefix ? `${prefix}[${k}]` : k;
    if (typeof v === "object" && !Array.isArray(v)) out.push(...form(v as Record<string, unknown>, key));
    else if (Array.isArray(v)) v.forEach((item, i) => {
      if (typeof item === "object") out.push(...form(item as Record<string, unknown>, `${key}[${i}]`));
      else out.push(`${encodeURIComponent(`${key}[${i}]`)}=${encodeURIComponent(String(item))}`);
    });
    else out.push(`${encodeURIComponent(key)}=${encodeURIComponent(String(v))}`);
  }
  return out;
}

async function call(path: string, body?: Record<string, unknown>): Promise<Response> {
  return providerFetch(`${API}${path}`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${process.env.STRIPE_SECRET_KEY}`,
      "Content-Type": "application/x-www-form-urlencoded",
      // Guards a retry after a timeout: the same invoice never bills twice.
      ...(body?.__idempotency ? { "Idempotency-Key": String(body.__idempotency) } : {}),
    },
    body: form(Object.fromEntries(Object.entries(body ?? {}).filter(([k]) => k !== "__idempotency"))).join("&"),
  });
}

export const stripeCollect: CollectAdapter = {
  key: "stripe",
  label: "Stripe Invoicing — hosted invoice with a Pay button",
  configured: stripeConfigured,

  async createPaymentLink(req: CollectRequest) {
    if (!stripeConfigured()) return fail("Stripe is not connected yet — add STRIPE_SECRET_KEY.");
    if (!(req.total.amount > 0)) return fail("Nothing to bill.");
    const cur = req.total.currency.toLowerCase();

    try {
      // 1. The customer. Keyed on our brand id so the same brand accumulates
      //    one billing history on Stripe's side rather than one per invoice.
      const cRes = await call("/customers", {
        name: req.brand.name,
        email: req.brand.email || undefined,
        metadata: { brandId: req.brand.ref },
        __idempotency: `cust_${req.brand.ref}`,
      });
      if (!cRes.ok) return fail(await providerError(cRes, "Stripe"));
      const customer = (await cRes.json() as { id: string }).id;

      // 2. The draft invoice, created BEFORE its items so each item can name
      //    it. Created the other way round, a pending item from an earlier
      //    failed attempt gets swept onto this invoice and the brand is billed
      //    twice for one month.
      const daysUntilDue = req.dueAt
        ? Math.max(1, Math.ceil((req.dueAt.getTime() - Date.now()) / 86400000))
        : 30;
      const iRes = await call("/invoices", {
        customer,
        collection_method: "send_invoice",
        days_until_due: daysUntilDue,
        number: req.number,
        metadata: { invoiceRef: req.invoiceRef },
        __idempotency: `inv_${req.invoiceRef}`,
      });
      if (!iRes.ok) return fail(await providerError(iRes, "Stripe"));
      const invoice = (await iRes.json() as { id: string }).id;

      // 3. Our line items become theirs, including the negative ones — a
      //    discount a brand can see on the invoice they pay is the only kind
      //    worth giving.
      for (const [i, line] of req.lines.entries()) {
        if (!line.amount) continue;
        const liRes = await call("/invoiceitems", {
          customer,
          invoice,
          currency: cur,
          amount: Math.round(line.amount * 100),
          description: line.label,
          __idempotency: `li_${req.invoiceRef}_${i}`,
        });
        if (!liRes.ok) return fail(await providerError(liRes, "Stripe"));
      }

      // 4. Finalise — this is what mints the hosted URL and the PDF.
      const fRes = await call(`/invoices/${invoice}/finalize`, { __idempotency: `fin_${req.invoiceRef}` });
      if (!fRes.ok) return fail(await providerError(fRes, "Stripe"));
      const final = await fRes.json() as { hosted_invoice_url?: string; id: string };
      if (!final.hosted_invoice_url) return fail("Stripe finalised the invoice but returned no payment URL.");

      // Stripe sends X-Frame-Options on hosted invoices, so this opens in a
      // new tab. The pay page handles both without knowing which it has.
      return { ok: true as const, url: final.hosted_invoice_url, ref: final.id, embeddable: false };
    } catch (e) {
      return fail(`Could not reach Stripe: ${(e as Error).message}`);
    }
  },
};
