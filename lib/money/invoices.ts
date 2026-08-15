// Invoices. A total is its lines; overdue is a comparison, not a flag.
//
// I1 — the total is recomputed from `invoice_lines` every time it is asked
// for. A stored total is a second copy of a number, and a second copy is a
// number that can disagree with the first.
//
// I2 — overdue is **derived** from `dueAt`. A flag needs a job to flip it, the
// job is the thing that breaks, and an invoice that is overdue in reality and
// not-overdue in the database is exactly how a challenge announces unpaid.
//
// I3 — `markPaid` is the only trigger for vault routing, and it is here.

import { eq } from "drizzle-orm";
import type { DB } from "../db/index.ts";
import { schema } from "../db/index.ts";
import { uid } from "../core/utils.ts";
import { routePaidInvoice, totalOf } from "./ledger.ts";
import type { CommunityTier, SplitBps } from "./amounts.ts";

export type InvoiceStatus = "draft" | "issued" | "paid" | "void";

export type InvoiceLineInput = {
  description: string;
  amountCents: number;
  refType?: string | null;
  refId?: string | null;
};

export async function createInvoice(
  db: DB,
  input: {
    payerType: "brand" | "guild" | "house";
    payerId?: string | null;
    lines: InvoiceLineInput[];
    dueAt?: Date | null;
  },
): Promise<string> {
  if (input.lines.length === 0) {
    throw new Error("An invoice with no lines has no total. C8 — every challenge has a bill.");
  }
  const { withTx } = await import("../db/tx.ts");
  const id = uid();
  await withTx(db, async (tx) => {
    await tx.insert(schema.invoices).values({
      id,
      payerType: input.payerType,
      payerId: input.payerId ?? null,
      status: "draft",
      dueAt: input.dueAt ?? null,
    });
    await tx.insert(schema.invoiceLines).values(
      input.lines.map((l) => ({
        id: uid(),
        invoiceId: id,
        description: l.description,
        amountCents: l.amountCents,
        refType: l.refType ?? null,
        refId: l.refId ?? null,
      })),
    );
  });
  return id;
}

export async function issueInvoice(db: DB, invoiceId: string): Promise<void> {
  await db
    .update(schema.invoices)
    .set({ status: "issued", issuedAt: new Date() })
    .where(eq(schema.invoices.id, invoiceId));
}

/**
 * Mark an invoice paid, and route the money. The only path into a vault.
 *
 * Returns whether routing actually happened, so a webhook that fires twice —
 * which every payment provider does — can tell a first delivery from a
 * duplicate without guessing.
 */
export async function markPaid(
  db: DB,
  invoiceId: string,
  opts: {
    providerRef?: string | null;
    bps?: SplitBps;
    communityTier?: CommunityTier;
    actorId?: string | null;
  } = {},
): Promise<{ routed: boolean; prize: number; server: number; cluster: number }> {
  const [invoice] = await db
    .select()
    .from(schema.invoices)
    .where(eq(schema.invoices.id, invoiceId));
  if (!invoice) throw new Error(`No such invoice: ${invoiceId}`);
  if (invoice.status === "void") {
    throw new Error("A void invoice cannot be paid. Issue a new one.");
  }

  if (!invoice.paidAt) {
    await db
      .update(schema.invoices)
      .set({
        status: "paid",
        paidAt: new Date(),
        // An opaque provider handle. Never a card, never a last four —
        // house rule 5, checked structurally by the test band.
        providerRef: opts.providerRef ?? invoice.providerRef,
      })
      .where(eq(schema.invoices.id, invoiceId));
  }

  return routePaidInvoice(db, invoiceId, opts);
}

export type InvoiceView = {
  id: string;
  status: InvoiceStatus;
  totalCents: number;
  paid: boolean;
  /** Derived from `dueAt` and the clock. Never a column. */
  overdue: boolean;
  dueAt: Date | null;
  paidAt: Date | null;
  lines: { description: string; amountCents: number }[];
};

export async function invoiceView(
  db: DB,
  invoiceId: string,
  now = new Date(),
): Promise<InvoiceView | null> {
  const [invoice] = await db
    .select()
    .from(schema.invoices)
    .where(eq(schema.invoices.id, invoiceId));
  if (!invoice) return null;

  const lines = await db
    .select()
    .from(schema.invoiceLines)
    .where(eq(schema.invoiceLines.invoiceId, invoiceId));

  const paid = invoice.paidAt !== null;
  return {
    id: invoice.id,
    status: invoice.status as InvoiceStatus,
    totalCents: await totalOf(db, invoiceId),
    paid,
    // An invoice that has been paid is never overdue, whatever the date says.
    overdue: !paid && invoice.dueAt !== null && invoice.dueAt.getTime() < now.getTime(),
    dueAt: invoice.dueAt,
    paidAt: invoice.paidAt,
    lines: lines.map((l) => ({ description: l.description, amountCents: l.amountCents })),
  };
}

/** Whether a challenge may be announced: C1/C3, there is no path around it. */
export async function isInvoicePaid(db: DB, invoiceId: string | null): Promise<boolean> {
  if (!invoiceId) return false;
  const [invoice] = await db
    .select({ paidAt: schema.invoices.paidAt })
    .from(schema.invoices)
    .where(eq(schema.invoices.id, invoiceId));
  return Boolean(invoice?.paidAt);
}
