import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { buildAuthorizeUrl, isOAuthAvailable, appBaseUrl, originFromHeaders } from "@/lib/oauth";

export const dynamic = "force-dynamic";

// GET /api/auth/:provider?next=/feed&intent=link — start a sign-in / link flow.
export async function GET(req: NextRequest, { params }: { params: Promise<{ provider: string }> }) {
  const { provider } = await params;
  // Keep the whole flow on the host the user is actually on (see appBaseUrl).
  const origin = originFromHeaders(req.headers, req.nextUrl.origin);
  const base = appBaseUrl(origin);

  if (!isOAuthAvailable(provider)) {
    return NextResponse.redirect(new URL(`/login?error=${provider}_unavailable`, base));
  }

  const next = req.nextUrl.searchParams.get("next") || "/feed";
  const intent = req.nextUrl.searchParams.get("intent") || "signin";
  const state = crypto.randomUUID().replace(/-/g, "");

  const store = await cookies();
  store.set("oauth_flow", JSON.stringify({ state, next, intent, provider }), {
    httpOnly: true, secure: process.env.NODE_ENV === "production", sameSite: "lax",
    path: "/", maxAge: 600,
  });

  return NextResponse.redirect(buildAuthorizeUrl(provider, origin, state));
}
