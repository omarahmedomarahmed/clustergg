import { NextResponse, type NextRequest } from "next/server";
import { jwtVerify } from "jose";

// The admin gate, moved in front of rendering.
//
// `app/admin/layout.tsx` calls `redirect()` for anyone who isn't staff, and that
// is not enough. In the App Router a layout and its page render in PARALLEL, so
// the page's server component still runs, still queries, and its output still
// goes into the streamed response — the redirect only changes what the browser
// does with it afterwards. A `curl` of an admin URL with no cookie at all came
// back with real rows in it: user emails, and now brand contact details from the
// enquiry queue.
//
// Middleware runs before any of that. No valid staff session, no render.
//
// This is a pre-filter, not the authority: the JWT carries the role it was
// signed with, so someone demoted since signing in still passes here and is
// stopped by the layout's live database check. Both layers stay.

const COOKIE = "cluster_session";
const SECRET = new TextEncoder().encode(
  process.env.AUTH_SECRET ?? "cluster-demo-secret-set-AUTH_SECRET-in-production",
);
const STAFF = new Set(["staff", "admin", "superadmin"]);

export async function middleware(req: NextRequest) {
  const token = req.cookies.get(COOKIE)?.value;
  if (token) {
    try {
      const { payload } = await jwtVerify(token, SECRET);
      if (STAFF.has(String(payload.role))) return NextResponse.next();
    } catch { /* expired, tampered or signed with a different secret */ }
  }
  // Same destination the layout uses, so the experience is unchanged for a
  // human — they just never receive the bytes they weren't allowed to see.
  const url = req.nextUrl.clone();
  url.pathname = "/login";
  url.search = `?next=${encodeURIComponent(req.nextUrl.pathname)}`;
  return NextResponse.redirect(url);
}

export const config = {
  // Only the admin surface. Everything else is public or guarded per-route, and
  // running middleware on every request costs Edge invocations for nothing.
  matcher: ["/admin/:path*"],
};
