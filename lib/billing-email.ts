import { eq } from "drizzle-orm";
import type { DB } from "@/lib/db";
import { schema } from "@/lib/db";

// The three emails an invoice sends. M1.
//
// Extracted from `app/actions/billing.ts` so the Stripe webhook can send a
// receipt too. It used to be a private function inside a server action, which
// meant the only code that could ever thank a brand for paying was code an
// admin had clicked — and a webhook cannot click.
//
/**
 * Email a brand about one of its invoices.
 *
 * Reads the brand's contact address and the invoice's own totals rather than
 * being handed them, so the figure in the email is the figure on the invoice by
 * construction — a receipt that quotes a number computed separately from the
 * thing it is a receipt for is a receipt that will eventually disagree with it.
 *
 * Never throws (`sendEmail` cannot), so a mail problem can never stop an
 * invoice being issued or marked paid.
 */
export async function emailBrandAboutInvoice(
  db: DB,
  invoiceId: string,
  template: "invoice.issued" | "invoice.due" | "invoice.paid",
): Promise<void> {
  try {
    const { sendEmail } = await import("@/lib/email");
    const { getInvoice } = await import("@/lib/invoices");
    const inv = await getInvoice(invoiceId);
    if (!inv) return;
    const [brand] = await db.select({ name: schema.brands.name, email: schema.brands.contactEmail })
      .from(schema.brands).where(eq(schema.brands.id, inv.brandId)).limit(1);
    if (!brand?.email) return;
    const day = (d: Date | null | undefined) => (d ? new Date(d).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" }) : "—");
    const total = { amount: Math.round(inv.total * 100) / 100, currency: inv.currency };
    // The pay page is a token URL, never a payment instrument — see
    // docs/PAYMENTS.md. Nothing about a card or an account is in this email.
    const payUrl = `${process.env.NEXT_PUBLIC_SITE_URL || "https://clustergg.com"}/pay/${inv.payToken ?? ""}`;
    const common = { brand: brand.name, number: inv.number, total };
    if (template === "invoice.paid") {
      await sendEmail({ to: brand.email, template, data: { ...common, paidOn: day(inv.paidAt) }, ref: { type: "invoice", id: inv.id } });
    } else {
      await sendEmail({ to: brand.email, template, data: { ...common, dueOn: day(inv.dueAt), payUrl }, ref: { type: "invoice", id: inv.id } });
    }
  } catch { /* a receipt must never break the thing it is a receipt for */ }
}
