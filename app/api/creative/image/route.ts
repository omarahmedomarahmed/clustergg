import { NextRequest, NextResponse } from "next/server";

export const dynamic = "force-dynamic";

// CORS image proxy for the creative studio: the PNG export draws external art
// (blob / cloudfront / game CDNs) onto a <canvas>, which taints the canvas
// unless the image is same-origin CORS-clean. We fetch allow-listed hosts
// server-side and re-serve them with an open ACAO header so export works.
const ALLOW = [
  /\.public\.blob\.vercel-storage\.com$/i,
  /(^|\.)cloudfront\.net$/i,
  /(^|\.)ddragon\.leagueoflegends\.com$/i,
  /(^|\.)valorant-api\.com$/i,
  /(^|\.)media\.valorant-api\.com$/i,
  /(^|\.)cdn\.cloudflare\.steamstatic\.com$/i,
  /(^|\.)fortnite-api\.com$/i,
  /(^|\.)higgsfield/i,
];

export async function GET(req: NextRequest) {
  const url = req.nextUrl.searchParams.get("url") ?? "";
  let host = "";
  try { host = new URL(url).host; } catch { return NextResponse.json({ error: "bad url" }, { status: 400 }); }
  if (!/^https:\/\//i.test(url) || !ALLOW.some((re) => re.test(host))) {
    return NextResponse.json({ error: "host not allowed" }, { status: 403 });
  }
  try {
    const r = await fetch(url, { signal: AbortSignal.timeout(12000) });
    if (!r.ok) return NextResponse.json({ error: `upstream ${r.status}` }, { status: 502 });
    const ct = (r.headers.get("content-type") || "image/png").split(";")[0];
    if (!ct.startsWith("image/")) return NextResponse.json({ error: "not an image" }, { status: 415 });
    const buf = Buffer.from(await r.arrayBuffer());
    return new NextResponse(buf, {
      headers: {
        "Content-Type": ct,
        "Access-Control-Allow-Origin": "*",
        "Cache-Control": "public, max-age=86400",
      },
    });
  } catch {
    return NextResponse.json({ error: "fetch failed" }, { status: 502 });
  }
}
