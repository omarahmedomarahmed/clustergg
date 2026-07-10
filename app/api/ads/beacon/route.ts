import { NextRequest, NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { getDb, schema } from "@/lib/db";
import { getSession } from "@/lib/auth";
import { hashIp } from "@/lib/ads";
import { uid } from "@/lib/utils";

export const dynamic = "force-dynamic";

// Impression / click / viewed-duration capture. IPs are hashed with
// AD_ANALYTICS_SALT before storage — raw IPs never touch the database.
export async function POST(req: NextRequest) {
  let payload: { type?: string; ccId?: string; id?: string | null; path?: string; ms?: number };
  try { payload = await req.json(); } catch { return NextResponse.json({ ok: false }, { status: 400 }); }

  const db = await getDb();

  if (payload.type === "impression" && payload.ccId) {
    const session = await getSession().catch(() => null);
    const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "0.0.0.0";
    const ua = req.headers.get("user-agent") ?? "";
    const id = uid();
    await db.insert(schema.adImpressions).values({
      id,
      campaignCreativeId: payload.ccId,
      userId: session?.uid ?? null,
      sessionId: req.cookies.get("cluster_session")?.value?.slice(-16) ?? null,
      pagePath: (payload.path ?? "").slice(0, 200),
      deviceType: /mobile|android|iphone/i.test(ua) ? "mobile" : "desktop",
      hashedIp: hashIp(ip),
      geoCountry: req.headers.get("x-vercel-ip-country"),
      geoCity: req.headers.get("x-vercel-ip-city"),
    });
    return NextResponse.json({ ok: true, id });
  }

  if (payload.type === "duration" && payload.id && typeof payload.ms === "number") {
    await db.update(schema.adImpressions)
      .set({ durationViewedMs: Math.min(Math.round(payload.ms), 3_600_000) })
      .where(eq(schema.adImpressions.id, payload.id));
    return NextResponse.json({ ok: true });
  }

  if (payload.type === "click" && payload.ccId) {
    await db.insert(schema.adClicks).values({
      id: uid(), campaignCreativeId: payload.ccId, impressionId: payload.id ?? null,
    });
    return NextResponse.json({ ok: true });
  }

  return NextResponse.json({ ok: false }, { status: 400 });
}
