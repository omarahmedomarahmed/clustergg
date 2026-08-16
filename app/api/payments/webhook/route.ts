// `/api/payments/webhook` — Stripe's delivery point.
//
// A2: **the only thing that moves a challenge to `scheduled`.**
//
// Two things about this file that look like style and are not:
//
//   1. The body is read with `request.text()` and never `request.json()`.
//      Ed25519 aside, Stripe signs the exact bytes it sent; parsing first and
//      re-serialising changes them and every delivery 400s on a perfectly
//      valid request.
//   2. It answers **200 to a replay**. Stripe retries any non-2xx for three
//      days, so returning an error to a duplicate is how one payment becomes
//      an endless stream of duplicates. The work is skipped; the answer is
//      still "received".

import { getDb } from "../../../../lib/db/index.ts";
import {
  verifySignature,
  handleStripeEvent,
  type StripeEvent,
} from "../../../../lib/money/stripe.ts";

export const dynamic = "force-dynamic";

export async function POST(request: Request): Promise<Response> {
  const raw = await request.text();

  const signature = verifySignature(
    raw,
    request.headers.get("stripe-signature"),
    process.env.STRIPE_WEBHOOK_SECRET,
  );
  if (!signature.ok) {
    // 400, which is what Stripe's dashboard shows as a signature mismatch —
    // the exact symptom 10-SETUP §5 tells somebody to look for.
    return Response.json({ error: signature.reason }, { status: 400 });
  }

  let event: StripeEvent;
  try {
    event = JSON.parse(raw) as StripeEvent;
  } catch {
    return Response.json({ error: "Malformed event." }, { status: 400 });
  }

  const db = await getDb();
  const outcome = await handleStripeEvent(db, event);

  // Every outcome is a 200, including `replay` and `ignored`. The body says
  // which, so the dashboard's delivery log is readable.
  return Response.json({ received: true, outcome });
}
