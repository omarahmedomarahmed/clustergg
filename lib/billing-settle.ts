import { eq } from "drizzle-orm";
import type { DB } from "@/lib/db";
import { schema } from "@/lib/db";
import { allocateInvoice } from "@/lib/vaults";

// An invoice becoming paid, in one place. M1.
//
// ===== WHY THIS HAD TO COME OUT OF THE ADMIN ACTION =====
//
// Everything that happens when money arrives — the four vaults posting, the
// brand's receipt, the alert that tells staff a campaign can now be announced —
// lived inside `markInvoicePaid`, behind `guard()`, which requires a signed-in
// admin.
//
// So the only way for money to move through this platform was for a person to
// notice and click a button. A brand paying at 2am changed nothing until
// somebody opened the billing screen the next morning — and since NOTHING IS
// ANNOUNCED BEFORE ITS BILL IS PAID, an unnoticed payment silently held back
// the challenge the brand had bought.
//
// A webhook cannot call an admin action. Rather than let the webhook duplicate
// four steps and drift from the button, both now call this.
//
// ===== IDEMPOTENT, BECAUSE THE CALLER CANNOT PROMISE TO CALL ONCE =====
//
// Stripe retries a webhook until it gets a 2xx, and will happily deliver the
// same event twice on its own. Staff can also click the button on an invoice a
// webhook already settled. So:
//
//   - an invoice already `paid` returns `{ changed: false }` and touches
//     nothing, rather than re-stamping `paidAt` and re-sending a receipt;
//   - `allocateInvoice` refuses a second time on its own — it looks for a
//     ledger row against the invoice before posting.
//
// The receipt and the alert are the parts that would be VISIBLE if this ran
// twice, which is why the early return is above them and not inside them.

export type SettleResult =
  | { ok: true; changed: boolean; invoiceId: string; number: string }
  | { ok: false; error: string };

/**
 * Mark an invoice paid and do everything that follows from money arriving.
 *
 * `via` and `ref` are how it was settled — "stripe" and the provider's event or
 * object id, or whatever a human typed when they reconciled it by hand. They
 * are a record, never an instrument: no payment detail is stored here or
 * anywhere else.
 */
export async function settleInvoicePaid(
  db: DB,
  invoiceId: string,
  opts: { via?: string | null; ref?: string | null } = {},
): Promise<SettleResult> {
  const [inv] = await db.select({
    id: schema.brandInvoices.id,
    number: schema.brandInvoices.number,
    status: schema.brandInvoices.status,
  }).from(schema.brandInvoices).where(eq(schema.brandInvoices.id, invoiceId)).limit(1);

  if (!inv) return { ok: false, error: "That invoice no longer exists." };

  // Already settled. Not an error — a retried webhook and a staff click on an
  // already-paid invoice are both normal — but nothing may run again.
  if (inv.status === "paid") {
    return { ok: true, changed: false, invoiceId: inv.id, number: inv.number };
  }

  await db.update(schema.brandInvoices)
    .set({ status: "paid", paidAt: new Date(), paidVia: opts.via ?? null, paidRef: opts.ref ?? null })
    .where(eq(schema.brandInvoices.id, invoiceId));

  // The vaults hold money that has ARRIVED, so this is the moment the four
  // shares are posted.
  await allocateInvoice(db, invoiceId);

  // Both of these reach the outside world, so both are best-effort: a receipt
  // that fails to send must not roll back money that genuinely arrived.
  try {
    const { emailBrandAboutInvoice } = await import("@/lib/billing-email");
    await emailBrandAboutInvoice(db, invoiceId, "invoice.paid");
  } catch { /* the money is banked either way */ }

  try {
    const { raiseAlert } = await import("@/lib/staff-alerts");
    await raiseAlert(db, {
      kind: "invoice.paid", desk: "money",
      title: `${inv.number} is paid`,
      body: "The vaults have been posted. Anything this invoice covers can be announced now.",
      href: `/admin/billing?invoice=${invoiceId}`, refType: "invoice", refId: invoiceId, once: true,
    });
  } catch { /* an alert is a convenience, not a ledger */ }

  return { ok: true, changed: true, invoiceId: inv.id, number: inv.number };
}

/**
 * Find our invoice from what a provider sends back.
 *
 * Two routes, in order of trust:
 *
 *   1. `invoiceRef` in the provider's metadata — we put it there when the
 *      invoice was created, so it is our own id coming home.
 *   2. `payRef`, the provider's object id, which we stored when the pay link
 *      was minted.
 *
 * Both exist because either can be missing: metadata is dropped by some
 * provider test tools, and `payRef` is null on an invoice a human pasted a
 * Payoneer link into.
 */
export async function findInvoiceByProviderRef(
  db: DB,
  opts: { invoiceRef?: string | null; payRef?: string | null },
): Promise<string | null> {
  if (opts.invoiceRef) {
    const [byMeta] = await db.select({ id: schema.brandInvoices.id })
      .from(schema.brandInvoices).where(eq(schema.brandInvoices.id, opts.invoiceRef)).limit(1);
    if (byMeta) return byMeta.id;
  }
  if (opts.payRef) {
    const [byRef] = await db.select({ id: schema.brandInvoices.id })
      .from(schema.brandInvoices).where(eq(schema.brandInvoices.payRef, opts.payRef)).limit(1);
    if (byRef) return byRef.id;
  }
  return null;
}
