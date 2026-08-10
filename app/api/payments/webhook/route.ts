import { NextRequest, NextResponse } from "next/server";
import { createHmac, timingSafeEqual } from "node:crypto";
import { getDb } from "@/lib/db";
import { settleInvoicePaid, findInvoiceByProviderRef } from "@/lib/billing-settle";

export const dynamic = "force-dynamic";

/**
 * Stripe tells us a brand paid. M1.
 *
 * ===== THE HOLE THIS FILLS =====
 *
 * Before this route existed, the money loop had a person standing in the middle
 * of it. A brand received a hosted Stripe invoice, paid it, and **nothing
 * happened** — no vault posting, no receipt, no alert — until a member of staff
 * opened `/admin/billing` and clicked "Mark paid".
 *
 * That is not merely slow. `lib/challenge-billing.ts` refuses to announce a
 * challenge whose bill is unpaid, so an unnoticed payment silently withheld the
 * thing the brand had just bought, from every server on the network, for as
 * long as nobody looked. A brand paying on Friday night bought a weekend of
 * nothing.
 *
 * The rest of the machine was already waiting for this: `allocateInvoice`
 * refuses to post twice, and the comment above the admin button has said "a
 * webhook may reach it a third time" since C13. The webhook was designed and
 * never built.
 *
 * ===== WHY THE RAW BODY IS READ AS TEXT =====
 *
 * A signature covers bytes, not objects. `await req.json()` re-serialises, and
 * the re-serialised form differs from what Stripe signed by whitespace and key
 * order — so verification fails on every genuine event and passes on none. The
 * body is read once, as text, verified, and only then parsed.
 *
 * ===== AN UNSET SECRET REFUSES =====
 *
 * The alternative — accept everything when unconfigured — is a hole that opens
 * itself on the one deployment where somebody forgot an environment variable,
 * which is exactly the deployment nobody is watching. An open endpoint here
 * lets anybody mark any invoice paid and post money into the vaults.
 */

/** Stripe signs `t=<unix>,v1=<hex>`; there may be several `v1` during a rotation. */
function verify(raw: string, header: string | null, secret: string): boolean {
  if (!header) return false;
  const parts = Object.create(null) as Record<string, string[]>;
  for (const piece of header.split(",")) {
    const [k, v] = piece.split("=", 2);
    if (!k || !v) continue;
    (parts[k.trim()] ??= []).push(v.trim());
  }
  const timestamp = parts.t?.[0];
  const signatures = parts.v1 ?? [];
  if (!timestamp || signatures.length === 0) return false;

  // Replay window. Without it, a signature captured once is valid forever, and
  // a single leaked request body could be posted back repeatedly. Five minutes
  // is Stripe's own tolerance.
  const age = Math.abs(Date.now() / 1000 - Number(timestamp));
  if (!Number.isFinite(age) || age > 300) return false;

  const expected = createHmac("sha256", secret).update(`${timestamp}.${raw}`).digest("hex");
  const want = Buffer.from(expected, "utf8");
  return signatures.some((sig) => {
    const got = Buffer.from(sig, "utf8");
    // `timingSafeEqual` throws on a length mismatch, which is itself a leak of
    // sorts and definitely a 500 on a malformed header.
    return got.length === want.length && timingSafeEqual(got, want);
  });
}

type StripeEvent = {
  id?: string;
  type?: string;
  data?: { object?: { id?: string; metadata?: Record<string, string> } };
};

export async function POST(req: NextRequest) {
  const secret = process.env.STRIPE_WEBHOOK_SECRET;
  if (!secret) return NextResponse.json({ error: "webhook not configured" }, { status: 503 });

  const raw = await req.text();
  if (!verify(raw, req.headers.get("stripe-signature"), secret)) {
    return NextResponse.json({ error: "bad signature" }, { status: 400 });
  }

  let event: StripeEvent;
  try { event = JSON.parse(raw) as StripeEvent; }
  catch { return NextResponse.json({ error: "bad json" }, { status: 400 }); }

  // Only the events that mean MONEY ARRIVED. Stripe emits dozens; anything we
  // do not model is acknowledged rather than rejected, because a 4xx makes
  // Stripe retry an event we will never accept and eventually disable the
  // endpoint — taking the ones we DO want down with it.
  const PAID = new Set(["invoice.paid", "invoice.payment_succeeded"]);
  if (!event.type || !PAID.has(event.type)) {
    return NextResponse.json({ ok: true, ignored: event.type ?? null });
  }

  const object = event.data?.object ?? {};
  const db = await getDb();
  const invoiceId = await findInvoiceByProviderRef(db, {
    invoiceRef: object.metadata?.invoiceRef ?? null,
    payRef: object.id ?? null,
  });

  // An event for an invoice we do not have is not a failure — it is a Stripe
  // account shared with something else, or a test event. Acknowledged, and
  // said out loud in the response so it is visible in Stripe's own log.
  if (!invoiceId) {
    return NextResponse.json({ ok: true, matched: false, stripeId: object.id ?? null });
  }

  const res = await settleInvoicePaid(db, invoiceId, {
    via: "stripe",
    ref: object.id ?? event.id ?? null,
  });

  if (!res.ok) return NextResponse.json({ ok: false, error: res.error }, { status: 200 });
  return NextResponse.json({ ok: true, matched: true, changed: res.changed, invoice: res.number });
}
