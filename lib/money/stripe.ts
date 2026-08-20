// Stripe: the signature, the event, and the four ways this breaks.
//
// ===== THE WEBHOOK IS THE ONLY THING THAT MOVES A CHALLENGE TO `scheduled` =====
//
// A2. When it is wrong the buyer sees a receipt and a success page and nothing
// happens on our side, and **nobody finds out until the brand asks why their
// challenge never ran.** That asymmetry is why this module is written the way
// it is: every failure mode 10-SETUP §5 names has something here that answers
// it.
//
// | Trap | Answer |
// |---|---|
// | Test and live are separate worlds | Different keys, endpoints and signing secrets. Nothing here reads a mode; the environment decides which world it is in |
// | The signature needs the **raw body** | `verifySignature` takes a string and never a parsed object. Anything that parses first changes the bytes and every delivery 400s |
// | Deployment protection returns 401 to Stripe | Not solvable in code. Named in 10-SETUP so it is checked |
// | **Stripe retries for three days** | Idempotency, keyed on the event id. A repeat is a no-op |
//
// The last one is the expensive one: without it one payment becomes two
// challenges and two sets of vault entries, which breaks the prize-vault
// invariant the whole platform rests on.
//
// There is no `stripe` package here. The webhook needs a constant-time HMAC
// and a JSON parse, and the SDK would be a dependency carried into every
// bundle for two functions.

import { createHmac, timingSafeEqual } from "node:crypto";
import { eq } from "drizzle-orm";
import type { DB } from "../db/index.ts";
import { schema } from "../db/index.ts";
import { uid } from "../core/utils.ts";

export function stripeConfigured(): boolean {
  return Boolean(process.env.STRIPE_SECRET_KEY && process.env.STRIPE_WEBHOOK_SECRET);
}

/** Stripe rejects a timestamp older than this, and so do we. */
export const SIGNATURE_TOLERANCE_SECONDS = 5 * 60;

export type SignatureResult = { ok: true } | { ok: false; reason: string };

/**
 * Verify `Stripe-Signature` against the **raw** request body.
 *
 * The header looks like `t=1699999999,v1=<hex>,v1=<hex>`. More than one `v1`
 * appears while a signing secret is being rotated, and any one of them
 * matching is a valid signature — a verifier that reads only the first breaks
 * for the duration of every rotation.
 */
export function verifySignature(
  rawBody: string,
  header: string | null,
  secret: string | undefined,
  now = new Date(),
): SignatureResult {
  if (!secret) return { ok: false, reason: "STRIPE_WEBHOOK_SECRET is not set." };
  if (!header) return { ok: false, reason: "No Stripe-Signature header." };

  const parts = Object.create(null) as Record<string, string[]>;
  for (const piece of header.split(",")) {
    const [k, v] = piece.split("=", 2);
    if (!k || !v) continue;
    (parts[k.trim()] ??= []).push(v.trim());
  }

  const timestamp = parts.t?.[0];
  const signatures = parts.v1 ?? [];
  if (!timestamp || signatures.length === 0) {
    return { ok: false, reason: "Malformed Stripe-Signature header." };
  }

  // A replay of a genuinely-signed old delivery is still a replay.
  const age = Math.abs(Math.floor(now.getTime() / 1000) - Number(timestamp));
  if (!Number.isFinite(age) || age > SIGNATURE_TOLERANCE_SECONDS) {
    return { ok: false, reason: "That delivery is too old to accept." };
  }

  const expected = createHmac("sha256", secret)
    .update(`${timestamp}.${rawBody}`)
    .digest("hex");
  const want = Buffer.from(expected);

  const matched = signatures.some((candidate) => {
    const have = Buffer.from(candidate);
    return have.length === want.length && timingSafeEqual(have, want);
  });

  return matched ? { ok: true } : { ok: false, reason: "Signature does not match." };
}

/** The four events 10-SETUP §5 subscribes to, and nothing else. */
export const HANDLED_EVENTS = [
  "checkout.session.completed",
  "checkout.session.async_payment_succeeded",
  "checkout.session.async_payment_failed",
  "charge.refunded",
] as const;

export type StripeEvent = {
  id: string;
  type: string;
  livemode?: boolean;
  data?: { object?: Record<string, unknown> };
};

export type WebhookOutcome =
  | { kind: "paid"; invoiceId: string; challengeIds: string[] }
  | { kind: "failed"; invoiceId: string }
  | { kind: "refunded"; invoiceId: string }
  | { kind: "ignored"; why: string }
  | { kind: "replay"; why: string };

/**
 * Has this event already been handled?
 *
 * ===== STRIPE RETRIES FOR THREE DAYS =====
 *
 * Any non-2xx — a cold start that timed out, a deploy mid-delivery — brings
 * the same event back. Without this, one payment routes into the vaults twice
 * and `prizeVault.balance == Σ(unredeemed money-trophies)` stops holding.
 *
 * The record is an `audit_log` row rather than a table of its own, because
 * that is already the append-only place where "this happened, once" is
 * recorded, and a second table is a second thing to keep consistent.
 */
export async function alreadyHandled(db: DB, eventId: string): Promise<boolean> {
  const rows = await db
    .select({ id: schema.auditLog.id })
    .from(schema.auditLog)
    .where(eq(schema.auditLog.refId, eventId));
  return rows.length > 0;
}

async function recordEvent(db: DB, event: StripeEvent, outcome: string): Promise<void> {
  await db.insert(schema.auditLog).values({
    id: uid(),
    actorId: "stripe",
    action: "stripe_webhook",
    refType: "stripe_event",
    refId: event.id,
    detail: { type: event.type, outcome, livemode: event.livemode ?? null },
  });
}

/**
 * Turn a verified Stripe event into the one thing it means for us.
 *
 * The invoice id travels in `client_reference_id` — set when the checkout
 * session is created — rather than being looked up from an amount, because an
 * amount is not a key and two brands buying one challenge in the same minute
 * would be indistinguishable.
 */
export async function handleStripeEvent(
  db: DB,
  event: StripeEvent,
): Promise<WebhookOutcome> {
  if (await alreadyHandled(db, event.id)) {
    return { kind: "replay", why: `Event ${event.id} was already handled.` };
  }

  if (!(HANDLED_EVENTS as readonly string[]).includes(event.type)) {
    // Recorded anyway. An event we ignore having arrived is worth knowing when
    // somebody asks why nothing happened.
    await recordEvent(db, event, "ignored");
    return { kind: "ignored", why: `Nothing to do for ${event.type}.` };
  }

  const object = event.data?.object ?? {};
  const invoiceId =
    typeof object.client_reference_id === "string" ? object.client_reference_id : null;

  if (!invoiceId) {
    await recordEvent(db, event, "no_invoice");
    return { kind: "ignored", why: "That event carries no invoice reference." };
  }

  if (
    event.type === "checkout.session.completed" ||
    event.type === "checkout.session.async_payment_succeeded"
  ) {
    // A2 — this call is the only path to `scheduled`, and it is the same
    // function the brand builder's demo checkout uses, so the two can never
    // route money differently.
    const { onInvoicePaid } = await import("../portal/brand.ts");
    const challengeIds = await onInvoicePaid(db, invoiceId);
    await recordEvent(db, event, "paid");
    return { kind: "paid", invoiceId, challengeIds };
  }

  if (event.type === "checkout.session.async_payment_failed") {
    // Nothing to reverse — money never arrived. Recorded so a bill that sits
    // unpaid has a reason next to it rather than silence.
    await recordEvent(db, event, "failed");
    return { kind: "failed", invoiceId };
  }

  await recordEvent(db, event, "refunded");
  return { kind: "refunded", invoiceId };
}

