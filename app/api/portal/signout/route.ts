import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { getServerBySlugOrId } from "@/lib/server-portal";
import { getBrandBySlugOrId } from "@/lib/brands";
import { portalCookieName } from "@/lib/portal-auth";

export const dynamic = "force-dynamic";

// Leaving a portal.
//
// A portal session is twelve hours long and lives behind a key that gets shared
// in a DM — which means the realistic way in is somebody's laptop, and the
// realistic way out was closing the browser and hoping. A dashboard showing a
// brand's spend, or a server's earnings, needs a door marked exit.
//
// It is a Route Handler for the same reason the unlock is: a Server Component
// render may not touch cookies, so the page can only ever ASK about the
// session, never end it.

async function portalUrl(kind: string, slug: string): Promise<string | null> {
  if (kind === "server") {
    const server = await getServerBySlugOrId(slug);
    return server ? `/servers/${server.slug ?? server.guildId}` : null;
  }
  if (kind === "brand") {
    const db = await getDb();
    const brand = await getBrandBySlugOrId(db, slug);
    return brand ? `/brands/${brand.slug ?? brand.id}` : null;
  }
  return null;
}

async function portalId(kind: string, slug: string): Promise<string | null> {
  if (kind === "server") {
    const server = await getServerBySlugOrId(slug);
    return server?.guildId ?? null;
  }
  const db = await getDb();
  const brand = await getBrandBySlugOrId(db, slug);
  return brand?.id ?? null;
}

export async function POST(req: NextRequest) {
  const form = await req.formData().catch(() => null);
  const kind = String(form?.get("kind") ?? "");
  const slug = String(form?.get("slug") ?? "");

  // Built from what we resolved, never from anything the caller sent — the
  // same rule the unlock handler follows, and for the same reason.
  const home = new URL(kind === "brand" ? "/brands" : "/servers", req.nextUrl.origin);
  if (kind !== "server" && kind !== "brand") return NextResponse.redirect(home, 303);

  const [url, id] = await Promise.all([portalUrl(kind, slug), portalId(kind, slug)]);
  const res = NextResponse.redirect(new URL(url ?? home.pathname, req.nextUrl.origin), 303);
  if (id) {
    // Written as an expired cookie on the SAME path it was set with. A bare
    // `delete` defaults to the request's path (`/api/portal/signout`), which
    // clears nothing and leaves the reader signed in while telling them they
    // are not — the worst of both.
    res.cookies.set({
      name: portalCookieName(kind, id),
      value: "",
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      path: "/",
      maxAge: 0,
    });
  }
  return res;
}
