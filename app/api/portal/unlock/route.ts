// `/api/portal/unlock` — docs/04-SURFACES.md §5: *"exchanges a portal key for
// a session"*.
//
// A Route Handler rather than a page, because writing a cookie is something
// only a Route Handler or a Server Action may do. The key arrives once, here,
// and never travels in a query string again — which is the point: a `?key=` in
// the URL sits in browser history, in server logs, and in the Referer header of
// every outbound link on the page it opened.

import { NextResponse } from "next/server";
import { grantPortalSession, clearThrottle, MAX_FAILURES, LOCKOUT_MS } from "../../../../lib/core/portal-auth.ts";
import { checkPortalKey, type PortalKind } from "../../../../lib/portal/session.ts";

export const dynamic = "force-dynamic";

// Resolved against the request's own URL rather than a configured base, so a
// deployment with no `NEXT_PUBLIC_SITE_URL` redirects to itself instead of to
// localhost — which is the shape of bug that only shows up in production.
function back(request: Request, kind: string, id: string, error: string) {
  return NextResponse.redirect(
    new URL(
      `/login/${kind}?id=${encodeURIComponent(id)}&error=${encodeURIComponent(error)}`,
      request.url,
    ),
    { status: 303 },
  );
}

export async function POST(request: Request): Promise<NextResponse> {
  const form = await request.formData();
  const kind = String(form.get("kind") ?? "") as PortalKind;
  const id = String(form.get("id") ?? "").trim();
  const key = String(form.get("key") ?? "").trim();
  const next = String(form.get("next") ?? "");

  if (kind !== "brand" && kind !== "server") {
    return NextResponse.json({ error: "Unknown portal." }, { status: 400 });
  }

  const result = await checkPortalKey(kind, id, key || null);

  if (result === "throttled") {
    return back(
      request,
      kind,
      id,
      `Too many wrong keys. This portal is locked for ${Math.round(LOCKOUT_MS / 60_000)} minutes. ` +
        `Ask us to reissue it.`,
    );
  }
  if (result === "bad") {
    // Deliberately one message for a wrong key and for a portal that does not
    // exist. Two messages would make this form a directory of our customers.
    return back(
      request,
      kind,
      id,
      `That key does not open this portal. ${MAX_FAILURES} wrong keys locks it for a while.`,
    );
  }

  clearThrottle(kind, id);

  const destination =
    next.startsWith(`/portal/${kind}/${id}`) ? next : `/portal/${kind}/${id}`;
  const response = NextResponse.redirect(new URL(destination, request.url), { status: 303 });
  await grantPortalSession(kind, id, response.cookies);
  return response;
}
