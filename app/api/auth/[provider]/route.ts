import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { buildAuthorizeUrl, isOAuthAvailable, appBaseUrl, originFromHeaders } from "@/lib/oauth";
import { safeNext } from "@/lib/safe-next";

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

  // B103. `next` is attacker-controllable — this endpoint is reached by a link
  // — and it ends up in `new URL(dest, base)`, which honours an ABSOLUTE url and
  // ignores the base. Sanitised on the way IN as well as on the way out: a
  // cookie holding a hostile destination is a hostile destination waiting for
  // the one code path that forgets to check.
  const next = safeNext(req.nextUrl.searchParams.get("next"));
  const intent = req.nextUrl.searchParams.get("intent") || "signin";
  const state = crypto.randomUUID().replace(/-/g, "");

  const store = await cookies();
  store.set("oauth_flow", JSON.stringify({ state, next, intent, provider }), {
    httpOnly: true, secure: process.env.NODE_ENV === "production", sameSite: "lax",
    path: "/", maxAge: 600,
  });

  return NextResponse.redirect(buildAuthorizeUrl(provider, origin, state));
}
