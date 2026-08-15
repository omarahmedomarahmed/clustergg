// `/api/auth/brand` — the brand's three doors, all POST, all one route.
//
//   `redeem`  — the one-time invite, exchanged for an email and a password (B1)
//   `signin`  — every time after that
//   `reset`   — begin, and complete, a password reset (I1d)
//
// A Route Handler because each one writes a cookie, which a Server Component
// render may not. That constraint is written up at length in
// `lib/core/portal-auth.ts`: the version that granted during its own render
// crashed on a **correct** credential and quietly showed the locked view on a
// wrong one, so the bug only appeared on success.

import { NextResponse, type NextRequest } from "next/server";
import { getDb } from "../../../../lib/db/index.ts";
import { grantPortalSession } from "../../../../lib/core/portal-auth.ts";
import {
  redeemBrandInvite,
  brandSignIn,
  CredentialRefused,
} from "../../../../lib/portal/brand-auth.ts";
import { beginReset, completeReset } from "../../../../lib/identity/reset.ts";

export const dynamic = "force-dynamic";

function back(request: NextRequest, path: string, params: Record<string, string>) {
  const url = new URL(path, request.url);
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);
  return NextResponse.redirect(url, 303);
}

export async function POST(request: NextRequest): Promise<NextResponse> {
  const form = await request.formData();
  const action = String(form.get("action") ?? "signin");
  const db = await getDb();
  const ip = request.headers.get("x-forwarded-for");

  try {
    if (action === "redeem") {
      const result = await redeemBrandInvite(db, {
        email: String(form.get("email") ?? ""),
        key: String(form.get("key") ?? ""),
        password: String(form.get("password") ?? ""),
      });
      if (!result.ok) return back(request, "/login/brand", { error: result.reason });

      const response = NextResponse.redirect(
        new URL(`/portal/brand/${result.brandId}?welcome=1`, request.url),
        303,
      );
      await grantPortalSession("brand", result.brandId, response.cookies);
      return response;
    }

    if (action === "signin") {
      const result = await brandSignIn(db, {
        email: String(form.get("email") ?? ""),
        password: String(form.get("password") ?? ""),
        ip,
      });
      if (!result.ok) return back(request, "/login/brand", { error: result.reason });

      const response = NextResponse.redirect(
        new URL(`/portal/brand/${result.brandId}`, request.url),
        303,
      );
      await grantPortalSession("brand", result.brandId, response.cookies);
      return response;
    }

    if (action === "reset-begin") {
      const token = await beginReset(db, { kind: "brand", email: String(form.get("email") ?? "") });
      // ===== THE SAME ANSWER EITHER WAY =====
      //
      // `token` is null when there is nobody to reset, and the page must not
      // say so. A reset form that distinguishes is a form that confirms which
      // of our customers exist to anybody who asks.
      //
      // In demo mode the token is handed back in the URL so the screenshot
      // record can walk the flow without an inbox. Fenced on the absence of a
      // database, exactly like the portal gate.
      const demo: Record<string, string> = !process.env.DATABASE_URL && token ? { token } : {};
      return back(request, "/reset", { kind: "brand", sent: "1", ...demo });
    }

    if (action === "reset-complete") {
      const result = await completeReset(db, {
        kind: "brand",
        token: String(form.get("token") ?? ""),
        password: String(form.get("password") ?? ""),
      });
      if (!result.ok) return back(request, "/reset", { kind: "brand", error: result.reason });
      return back(request, "/login/brand", { reset: "1" });
    }
  } catch (e) {
    if (e instanceof CredentialRefused) {
      const path = action === "reset-complete" ? "/reset" : "/login/brand";
      return back(request, path, { error: e.message, ...(action.startsWith("reset") ? { kind: "brand" } : {}) });
    }
    throw e;
  }

  return NextResponse.json({ error: "Unknown action." }, { status: 400 });
}
