import { NextRequest, NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { getDb, schema } from "@/lib/db";

export const dynamic = "force-dynamic";

/**
 * Resend's delivery webhooks — delivered, bounced, complained.
 *
 * A bounce is the moment you learn a customer never heard from you. Without
 * this, `email_log` says "sent" forever and a bounced invoice looks exactly like
 * a paid-attention-to one, which is the worst of both: the record is confident
 * and wrong.
 *
 * Verified with a shared secret rather than left open. An unauthenticated
 * endpoint that writes delivery status lets anybody mark our billing mail
 * delivered — not catastrophic, but it corrupts the one record staff use to
 * decide whether to chase somebody.
 *
 * Unset secret = refuse. The alternative (accept everything when unconfigured)
 * is a hole that opens itself on a deployment where somebody forgot a variable,
 * which is exactly the deployment where nobody is looking.
 */
export async function POST(req: NextRequest) {
  const secret = process.env.RESEND_WEBHOOK_SECRET;
  if (!secret) return NextResponse.json({ error: "webhook not configured" }, { status: 503 });
  const given = req.headers.get("x-webhook-secret") ?? new URL(req.url).searchParams.get("secret");
  if (given !== secret) return NextResponse.json({ error: "forbidden" }, { status: 403 });

  let body: { type?: string; data?: { email_id?: string; to?: string[] } };
  try { body = await req.json(); } catch { return NextResponse.json({ error: "bad json" }, { status: 400 }); }

  // Resend types look like "email.delivered" / "email.bounced" / "email.complained".
  const STATUS: Record<string, string> = {
    "email.sent": "sent",
    "email.delivered": "delivered",
    "email.delivery_delayed": "sent",
    "email.bounced": "bounced",
    "email.complained": "complained",
  };
  const status = STATUS[body.type ?? ""];
  const providerId = body.data?.email_id;
  // An event we do not model is not an error — Resend adds types over time, and
  // a 400 here would make them retry something we will never accept.
  if (!status || !providerId) return NextResponse.json({ ok: true, ignored: body.type ?? null });

  try {
    const db = await getDb();
    await db.update(schema.emailLog)
      .set({ status, updatedAt: new Date() })
      .where(eq(schema.emailLog.providerId, providerId));
  } catch {
    // Swallowed on purpose: a failed status write must not make Resend retry
    // forever. The console still shows the last known state.
    return NextResponse.json({ ok: false });
  }
  return NextResponse.json({ ok: true });
}
