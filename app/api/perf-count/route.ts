import { NextResponse } from "next/server";
import { perfCount, perfReset, perfTop, perfEnabled } from "@/lib/db/perf";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// The query counter's read/reset endpoint (B55.8).
//
// NOT `_perf`: a directory whose name starts with an underscore is a PRIVATE
// FOLDER in the App Router and is excluded from routing entirely. The first
// version of this returned the homepage's HTML to every measurement call, which
// looks exactly like a working endpoint returning odd data.
//
// Gated on PERF_COUNT — with the flag unset the counter never increments and
// this route reports that rather than a misleading zero. It is deliberately not
// in the admin console: it is a measurement tool for a build, not a feature.
export async function GET(req: Request) {
  if (process.env.PERF_COUNT !== "1") {
    return NextResponse.json({ enabled: false, note: "set PERF_COUNT=1" });
  }
  const reset = new URL(req.url).searchParams.get("reset") === "1";
  const body = { enabled: perfEnabled(), queries: perfCount(), top: perfTop() };
  if (reset) perfReset();
  return NextResponse.json(body);
}
