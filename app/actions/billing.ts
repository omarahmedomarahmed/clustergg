"use server";

import { revalidatePath } from "next/cache";
import { eq } from "drizzle-orm";
import { getDb, schema } from "@/lib/db";
import { requireSystemFor } from "@/lib/departments";
import { pricingConfig } from "@/lib/pricing-live";
import { collector } from "@/lib/payments";
import {
  draftLines, dueDateFrom, getInvoice, liveGamesFor, monthLabel,
  nextInvoiceNumber, payToken,
} from "@/lib/invoices";
import { uid } from "@/lib/utils";

// Everything staff can do to a bill.
//
// The design decision worth defending: **every line is editable, including the
// ones the software generated.** Label, quantity, amount, and a discount is
// just a negative line. Sales negotiates; a billing system that refuses to
// print a negotiated number is one people work around in a spreadsheet, and
// then the invoice a brand received is a document this platform has never seen.
//
// What staff cannot do is take money. There is no card field here and no
// balance to move. "Mark paid" records a claim by a named person against a
// reference they typed, which is exactly what it is.

type Res = { ok?: true; error?: string; id?: string; message?: string };

async function guard() {
  const access = await requireSystemFor("/admin/billing");
  return access.user;
}

async function audit(adminId: string, action: string, targetId?: string, meta?: Record<string, unknown>) {
  try {
    const db = await getDb();
    await db.insert(schema.auditLog).values({
      id: uid(), adminId, action, targetType: "invoice", targetId, meta: meta ?? {},
    });
  } catch { /* the audit log must never be the thing that fails a payment action */ }
}

function refresh(brandSlug?: string | null) {
  revalidatePath("/admin/billing");
  if (brandSlug) revalidatePath(`/brands/${brandSlug}`);
}

/**
 * Open this month's bill for a brand.
 *
 * The lines come from `quote()` — the same function the pricing page runs — with
 * the games counted from their live campaigns. Nobody types a price, so nobody
 * can type the wrong one.
 */
export async function createInvoice(formData: FormData): Promise<Res> {
  const admin = await guard();
  const brandId = String(formData.get("brandId") ?? "");
  if (!brandId) return { error: "Pick a brand." };
  const addon = formData.get("addon") === "on";
  const termsDays = Math.max(0, Math.min(120, Number(formData.get("termsDays") ?? 30) || 30));

  const db = await getDb();
  const [brand] = await db.select().from(schema.brands).where(eq(schema.brands.id, brandId)).limit(1);
  if (!brand) return { error: "That brand no longer exists." };

  const cfg = await pricingConfig();
  const games = await liveGamesFor(db, brandId);
  const issued = new Date();
  const id = uid();

  await db.insert(schema.brandInvoices).values({
    id,
    brandId,
    number: await nextInvoiceNumber(db),
    status: "draft",
    currency: cfg.currency,
    periodLabel: monthLabel(issued),
    issuedAt: issued,
    dueAt: dueDateFrom(issued, termsDays),
    payToken: payToken(),
  });

  // The campaigns are read at DRAFT time, so an invoice carries the rate that
  // was live when it was raised. Changing the percentage later must never
  // rewrite a bill that has already been issued (B44).
  const { campaigns } = await import("@/lib/campaigns-read");
  const { offers } = await import("@/lib/offers");
  const o = await offers();
  const promo = await campaigns({
    serverValue: o.finance.welcomeChallengeCost,
    serverCap: o.finance.targetServers,
    brandCap: o.brands.cap,
  });
  const lines = draftLines({ games: games.length, addon, cfg, gameNames: games, campaigns: promo });
  for (const [i, l] of lines.entries()) {
    await db.insert(schema.invoiceLines).values({
      id: uid(), invoiceId: id, kind: l.kind, label: l.label,
      quantity: l.quantity, unitAmount: l.unitAmount,
      sourceType: l.sourceType ?? null, sourceId: l.sourceId ?? null, sortOrder: i * 10,
    });
  }

  await audit(admin.id, "invoice.create", id, {
    brandId, games: games.length,
    // What the campaign was set to when this bill was raised, so "why is this
    // invoice discounted and that one not" has an answer in the log rather than
    // in somebody's memory.
    campaign: promo.brand.enabled ? { pct: promo.brand.pct } : null,
  });
  refresh(brand.slug);
  return { ok: true, id, message: `Draft opened for ${brand.name}.` };
}

/** Add a line — a challenge somebody bought mid-month, a discount, anything. */
export async function addInvoiceLine(invoiceId: string, formData: FormData): Promise<Res> {
  const admin = await guard();
  const label = String(formData.get("label") ?? "").trim();
  const kind = String(formData.get("kind") ?? "adjustment");
  const quantity = Number(formData.get("quantity") ?? 1) || 1;
  let unitAmount = Number(formData.get("unitAmount") ?? 0);
  if (!label) return { error: "Give the line a name — it goes on the invoice the brand reads." };
  if (!Number.isFinite(unitAmount)) return { error: "That amount isn't a number." };
  // A discount typed as 100 means a hundred off, not a hundred on. Enforced
  // rather than left to whoever is filling the form at 6pm.
  if ((kind === "discount" || kind === "credit") && unitAmount > 0) unitAmount = -unitAmount;

  const db = await getDb();
  const [inv] = await db.select().from(schema.brandInvoices).where(eq(schema.brandInvoices.id, invoiceId)).limit(1);
  if (!inv) return { error: "That invoice no longer exists." };
  if (inv.status === "paid" || inv.status === "void") return { error: "A paid or voided invoice can't be edited." };

  const existing = await db.select({ sortOrder: schema.invoiceLines.sortOrder })
    .from(schema.invoiceLines).where(eq(schema.invoiceLines.invoiceId, invoiceId));
  const next = existing.reduce((m, l) => Math.max(m, l.sortOrder), 0) + 10;

  await db.insert(schema.invoiceLines).values({
    id: uid(), invoiceId, kind, label, quantity, unitAmount, sortOrder: next,
  });
  await audit(admin.id, "invoice.line_add", invoiceId, { label, unitAmount });
  refresh();
  return { ok: true, message: "Line added." };
}

export async function updateInvoiceLine(lineId: string, formData: FormData): Promise<Res> {
  const admin = await guard();
  const label = String(formData.get("label") ?? "").trim();
  const quantity = Number(formData.get("quantity") ?? 1);
  const unitAmount = Number(formData.get("unitAmount") ?? 0);
  if (!label) return { error: "A line needs a name." };
  if (!Number.isFinite(quantity) || !Number.isFinite(unitAmount)) return { error: "Check the numbers." };

  const db = await getDb();
  await db.update(schema.invoiceLines)
    .set({ label, quantity, unitAmount })
    .where(eq(schema.invoiceLines.id, lineId));
  await audit(admin.id, "invoice.line_edit", lineId, { label, unitAmount });
  refresh();
  return { ok: true, message: "Saved." };
}

export async function deleteInvoiceLine(lineId: string): Promise<Res> {
  const admin = await guard();
  const db = await getDb();
  await db.delete(schema.invoiceLines).where(eq(schema.invoiceLines.id, lineId));
  await audit(admin.id, "invoice.line_delete", lineId);
  refresh();
  return { ok: true };
}


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
async function emailBrandAboutInvoice(
  db: Awaited<ReturnType<typeof getDb>>,
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

/** Terms, period label, notes — the parts of a bill that are words. */
export async function updateInvoice(invoiceId: string, formData: FormData): Promise<Res> {
  const admin = await guard();
  const db = await getDb();
  const dueRaw = String(formData.get("dueAt") ?? "").trim();
  const patch: Record<string, unknown> = {
    periodLabel: String(formData.get("periodLabel") ?? "").trim() || null,
    notes: String(formData.get("notes") ?? "").trim() || null,
  };
  if (dueRaw) {
    const d = new Date(dueRaw);
    if (Number.isNaN(d.getTime())) return { error: "That due date isn't a date." };
    patch.dueAt = d;
  }
  await db.update(schema.brandInvoices).set(patch).where(eq(schema.brandInvoices.id, invoiceId));
  await audit(admin.id, "invoice.update", invoiceId);
  refresh();
  return { ok: true, message: "Saved." };
}

/**
 * Attach where the brand pays.
 *
 * Two routes into the same field. With a collection provider connected this
 * asks it to mint a hosted invoice and stores the URL it returns; with nothing
 * connected — the Payoneer case, and the day-one case — staff paste the link
 * they generated in that provider's own dashboard. The brand's experience is
 * identical either way, which is the point.
 */
export async function setInvoicePayLink(invoiceId: string, formData: FormData): Promise<Res> {
  const admin = await guard();
  const db = await getDb();
  const pasted = String(formData.get("payLinkUrl") ?? "").trim();
  const provider = String(formData.get("provider") ?? "").trim();

  if (pasted) {
    if (!/^https:\/\//i.test(pasted)) return { error: "A payment link has to be an https:// URL." };
    await db.update(schema.brandInvoices)
      .set({ payLinkUrl: pasted, payProvider: provider || "manual", payEmbeddable: false })
      .where(eq(schema.brandInvoices.id, invoiceId));
    await audit(admin.id, "invoice.paylink_set", invoiceId, { provider: provider || "manual" });
    refresh();
    return { ok: true, message: "Payment link attached." };
  }

  // Ask the provider for one.
  const inv = await getInvoice(invoiceId);
  if (!inv) return { error: "That invoice no longer exists." };
  if (inv.total <= 0) return { error: "There's nothing to bill on this invoice." };

  const { adapter, reason } = await collector();
  if (adapter.key === "manual") {
    return { error: reason ?? "No collection provider is connected — paste the link from wherever you raised it." };
  }

  const site = process.env.NEXT_PUBLIC_APP_URL ?? "https://clustergg.com";
  const res = await adapter.createPaymentLink({
    invoiceRef: inv.id,
    number: inv.number,
    brand: { ref: inv.brandId, name: inv.brandName, email: inv.brandEmail },
    total: { amount: inv.total, currency: inv.currency },
    dueAt: inv.dueAt,
    lines: inv.lines.map((l) => ({ label: l.label, amount: l.amount })),
    returnUrl: `${site}/pay/${inv.payToken ?? ""}`,
  });
  if (!res.ok) return { error: res.error };

  await db.update(schema.brandInvoices).set({
    payLinkUrl: res.url, payProvider: adapter.key, payRef: res.ref, payEmbeddable: res.embeddable,
  }).where(eq(schema.brandInvoices.id, invoiceId));
  await audit(admin.id, "invoice.paylink_provider", invoiceId, { provider: adapter.key });
  refresh();
  return { ok: true, message: `Hosted invoice created on ${adapter.key}.` };
}

/**
 * Send it.
 *
 * Sending is what makes an invoice real: it starts the clock on the terms and
 * it is the point after which the number stops being a draft somebody was
 * playing with. Refuses without a payment link, because "pay this" with nowhere
 * to pay is the most common way an invoice ages thirty days for no reason.
 */
export async function sendInvoice(invoiceId: string): Promise<Res> {
  const admin = await guard();
  const inv = await getInvoice(invoiceId);
  if (!inv) return { error: "That invoice no longer exists." };
  if (inv.status !== "draft") return { error: "Only a draft can be sent." };
  if (inv.total <= 0) return { error: "There's nothing on this invoice to bill." };
  if (!inv.payLinkUrl) return { error: "Attach a payment link first — an invoice with nowhere to pay just ages." };

  const db = await getDb();
  await db.update(schema.brandInvoices)
    .set({ status: "sent", issuedAt: inv.issuedAt ?? new Date() })
    .where(eq(schema.brandInvoices.id, invoiceId));
  await audit(admin.id, "invoice.send", invoiceId, { total: inv.total });
  refresh();
  return { ok: true, message: `${inv.number} is live on the brand's Billing tab.` };
}

export async function markInvoicePaid(invoiceId: string, formData: FormData): Promise<Res> {
  const admin = await guard();
  const db = await getDb();
  const paidVia = String(formData.get("paidVia") ?? "").trim() || null;
  const paidRef = String(formData.get("paidRef") ?? "").trim() || null;
  const [inv] = await db.select().from(schema.brandInvoices).where(eq(schema.brandInvoices.id, invoiceId)).limit(1);
  if (!inv) return { error: "That invoice no longer exists." };
  await db.update(schema.brandInvoices)
    .set({ status: "paid", paidAt: new Date(), paidVia, paidRef })
    .where(eq(schema.brandInvoices.id, invoiceId));
  await audit(admin.id, "invoice.paid", invoiceId, { paidVia, paidRef });
  await emailBrandAboutInvoice(db, invoiceId, "invoice.paid");
  refresh();
  return { ok: true, message: `${inv.number} marked paid.` };
}

export async function setInvoiceStatus(invoiceId: string, status: string): Promise<Res> {
  const admin = await guard();
  if (!["draft", "sent", "paid", "void"].includes(status)) return { error: "Unknown status." };
  const db = await getDb();
  await db.update(schema.brandInvoices)
    .set({ status, ...(status === "paid" ? { paidAt: new Date() } : {}), ...(status === "draft" ? { paidAt: null } : {}) })
    .where(eq(schema.brandInvoices.id, invoiceId));
  await audit(admin.id, `invoice.${status}`, invoiceId);
  // "sent" is the moment a brand is told it owes us money, and "paid" is the
  // moment it is told it does not. Both are worth an email; a draft going back
  // and forth internally is not.
  if (status === "sent") await emailBrandAboutInvoice(db, invoiceId, "invoice.issued");
  if (status === "paid") await emailBrandAboutInvoice(db, invoiceId, "invoice.paid");
  refresh();
  return { ok: true };
}

/** New token, old link dead. For when a pay link went to the wrong inbox. */
export async function rotatePayToken(invoiceId: string): Promise<Res> {
  const admin = await guard();
  const db = await getDb();
  await db.update(schema.brandInvoices).set({ payToken: payToken() }).where(eq(schema.brandInvoices.id, invoiceId));
  await audit(admin.id, "invoice.rotate_token", invoiceId);
  refresh();
  return { ok: true, message: "New link minted — the old one no longer opens." };
}

export async function deleteInvoice(invoiceId: string): Promise<Res> {
  const admin = await guard();
  const db = await getDb();
  const [inv] = await db.select().from(schema.brandInvoices).where(eq(schema.brandInvoices.id, invoiceId)).limit(1);
  if (!inv) return { ok: true };
  // A sent invoice is a document somebody else has a copy of. Voiding leaves a
  // record that it existed and was withdrawn; deleting pretends it never did.
  if (inv.status !== "draft") return { error: "Only a draft can be deleted — void a sent invoice instead." };
  await db.delete(schema.brandInvoices).where(eq(schema.brandInvoices.id, invoiceId));
  await audit(admin.id, "invoice.delete", invoiceId);
  refresh();
  return { ok: true, message: "Draft deleted." };
}
