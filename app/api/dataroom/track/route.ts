import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { recordDocView } from "@/lib/dataroom";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Section dwell time, flushed by the reader when they leave.
//
// This arrives via `sendBeacon`, which means: no response is read, it must
// never block, and it fires exactly when a tab is closing. So the handler does
// the least possible work and always answers 204 — a beacon that errors is
// invisible anyway, and a slow one costs the reader nothing but costs us the
// data.
//
// A visitor id is minted here if the reader doesn't have one. It's a random
// value in a first-party cookie, used only to tell one reader from ten. No
// identity, nothing shared, nothing that survives clearing cookies.
const MAX_SECTIONS = 40;

export async function POST(req: NextRequest) {
  try {
    const body = (await req.json()) as {
      docId?: string;
      sections?: { anchor?: string; seconds?: number }[];
    };
    if (!body?.docId || !Array.isArray(body.sections)) {
      return new NextResponse(null, { status: 204 });
    }

    const jar = await cookies();
    let visitorId = jar.get("cl_visitor")?.value ?? null;
    if (!visitorId) {
      visitorId = crypto.randomUUID();
      jar.set("cl_visitor", visitorId, {
        httpOnly: true,
        sameSite: "lax",
        secure: process.env.NODE_ENV === "production",
        path: "/",
        maxAge: 60 * 60 * 24 * 365,
      });
    }

    const referrer = req.headers.get("referer");
    const ua = req.headers.get("user-agent") ?? "";
    const device = /mobile|android|iphone|ipad/i.test(ua) ? "mobile" : "desktop";

    for (const s of body.sections.slice(0, MAX_SECTIONS)) {
      if (!s?.anchor) continue;
      await recordDocView({
        docId: body.docId,
        sectionAnchor: String(s.anchor).slice(0, 80),
        visitorId,
        referrer,
        device,
        seconds: Number(s.seconds) || 0,
      });
    }
  } catch { /* a lost analytics event is never worth a 500 */ }

  return new NextResponse(null, { status: 204 });
}
