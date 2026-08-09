import { NextRequest, NextResponse } from "next/server";
import { and, eq, gte } from "drizzle-orm";
import { getDb, schema } from "@/lib/db";
import { getSession } from "@/lib/auth";
import { hashIp, hashSession } from "@/lib/ads";
import { uid } from "@/lib/utils";
import {
  IMPRESSION_WINDOW_MS, awardRef, impressionKey, originAllowed, rateLimited, viewerKey,
} from "@/lib/ads-beacon";

export const dynamic = "force-dynamic";

// Impression / click / duration capture.
//
// This route was the platform's open mint: the due-diligence reviewer awarded
// themselves CP with one `curl`. The rules it now enforces, and why each exists,
// are in `lib/ads-beacon.ts` — read that first. The short version:
//
//   * No session, no CP. Ever. The impression is still LOGGED, because a brand's
//     count should not depend on whether a reader happens to have an account,
//     but nothing is minted.
//   * One creative pays a gamer once per day, keyed on (creative, day) rather
//     than on the impression id — which was fresh on every call and so
//     deduplicated nothing.
//   * One viewer's impression of one creative counts once an hour, which also
//     ends the separate over-count where a rotating slot in an idle tab logged
//     twelve views a minute.
//   * `duration` can only extend an impression the caller owns.
//
// IPs are hashed with AD_ANALYTICS_SALT before storage — raw IPs never land.
export async function POST(req: NextRequest) {
  let payload: { type?: string; ccId?: string; id?: string | null; path?: string; ms?: number };
  try { payload = await req.json(); } catch { return NextResponse.json({ ok: false }, { status: 400 }); }

  if (!originAllowed(req.headers.get("origin"), req.headers.get("host"))) {
    return NextResponse.json({ ok: false }, { status: 403 });
  }

  const session = await getSession().catch(() => null);
  // B104. HASHED, not sliced. This used to keep the last sixteen characters of
  // the session JWT — a fragment of a live credential, in a table with a much
  // lower security bar than the cookie it came from. Nothing here ever needed
  // the value; it needed a key that is the same for the same browser, and a
  // hash is that.
  const sessionCookie = hashSession(req.cookies.get("cluster_session")?.value);
  const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "0.0.0.0";
  const hashedIp = hashIp(ip);
  const viewer = viewerKey(sessionCookie, hashedIp);

  if (rateLimited(viewer)) return NextResponse.json({ ok: false }, { status: 429 });

  const db = await getDb();

  if (payload.type === "impression" && payload.ccId) {
    // The creative has to be one we actually serve. Without this the counter
    // accepts any string and a brand's report can be padded with ids that were
    // never rendered anywhere.
    const [cc] = await db.select({ id: schema.adCampaignCreatives.id })
      .from(schema.adCampaignCreatives)
      .where(eq(schema.adCampaignCreatives.id, payload.ccId)).limit(1);
    if (!cc) return NextResponse.json({ ok: false }, { status: 404 });

    // One viewer, one creative, one window. `dedupeKey` carries a unique index,
    // so two racing calls cannot both insert — the second is a no-op rather
    // than a second row, and no transaction is needed to make that true.
    const dedupeKey = impressionKey(viewer, payload.ccId);
    const id = uid();
    const ua = req.headers.get("user-agent") ?? "";
    const inserted = await db.insert(schema.adImpressions).values({
      id,
      campaignCreativeId: payload.ccId,
      userId: session?.uid ?? null,
      sessionId: sessionCookie,
      pagePath: (payload.path ?? "").slice(0, 200),
      deviceType: /mobile|android|iphone/i.test(ua) ? "mobile" : "desktop",
      hashedIp,
      geoCountry: req.headers.get("x-vercel-ip-country"),
      geoCity: req.headers.get("x-vercel-ip-city"),
      dedupeKey,
      // B81.2. A web placement is one surface and one card kind; the two
      // columns exist so every row can say where it came from, and a row that
      // cannot is a row the report has to guess about.
      surface: "web",
      cardKind: "web",
    }).onConflictDoNothing().returning();

    // Already counted this hour. Hand back the existing id so the client can
    // still report a duration against it, and award nothing.
    if (!inserted.length) {
      const [existing] = await db.select({ id: schema.adImpressions.id })
        .from(schema.adImpressions)
        .where(eq(schema.adImpressions.dedupeKey, dedupeKey)).limit(1);
      return NextResponse.json({ ok: true, id: existing?.id ?? null, counted: false });
    }

    // CP only for a signed-in gamer, and keyed on (creative, day) so the same
    // creative cannot pay twice however many times it is seen.
    if (session?.uid) {
      const { awardQuestAction } = await import("@/lib/quests");
      await awardQuestAction(db, session.uid, "ad_impression", {
        refType: "imp", refId: awardRef(payload.ccId),
      });
    }
    return NextResponse.json({ ok: true, id, counted: true });
  }

  if (payload.type === "duration" && payload.id && typeof payload.ms === "number") {
    // Ownership. Previously this updated ANY impression id, so a caller could
    // rewrite the viewed duration on somebody else's impression — the number a
    // brand is shown as engagement.
    const owner = session?.uid
      ? eq(schema.adImpressions.userId, session.uid)
      : eq(schema.adImpressions.hashedIp, hashedIp);
    await db.update(schema.adImpressions)
      .set({ durationViewedMs: Math.min(Math.round(payload.ms), 3_600_000) })
      .where(and(
        eq(schema.adImpressions.id, payload.id),
        owner,
        // …and only while it is recent, so an old impression cannot be revised.
        gte(schema.adImpressions.createdAt, new Date(Date.now() - IMPRESSION_WINDOW_MS)),
      ));
    return NextResponse.json({ ok: true });
  }

  if (payload.type === "click" && payload.ccId) {
    const [cc] = await db.select({ id: schema.adCampaignCreatives.id })
      .from(schema.adCampaignCreatives)
      .where(eq(schema.adCampaignCreatives.id, payload.ccId)).limit(1);
    if (!cc) return NextResponse.json({ ok: false }, { status: 404 });

    const clickId = uid();
    await db.insert(schema.adClicks).values({
      id: clickId, campaignCreativeId: payload.ccId, impressionId: payload.id ?? null,
    });
    if (session?.uid) {
      await (await import("@/lib/quests")).awardQuestAction(db, session.uid, "ad_click", {
        refType: "click", refId: awardRef(payload.ccId),
      });
    }
    return NextResponse.json({ ok: true });
  }

  return NextResponse.json({ ok: false }, { status: 400 });
}
