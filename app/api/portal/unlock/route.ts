import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { getServerBySlugOrId } from "@/lib/server-portal";
import { getBrandBySlugOrId } from "@/lib/brands";
import { grantPortalSession, verifyPortalKey } from "@/lib/portal-auth";

export const dynamic = "force-dynamic";

// Exchanging a portal key for a session.
//
// This is a Route Handler because it has to be. Next forbids writing a cookie
// during a Server Component render, so the portal pages — which used to verify
// and grant in one step, mid-render — crashed on a CORRECT key and showed the
// locked view on a wrong one. A handler is allowed to set cookies, so the
// exchange lives here and the pages only ever ask "is there a session?".
//
// Both entry points land here:
//   * the unlock form POSTs, so the key never enters a URL at all;
//   * a shared `/servers/x?key=...` link is redirected here by the page, which
//     is also what finally strips the key out of the address bar.

type Kind = "server" | "brand";

async function resolve(kind: Kind, slug: string): Promise<{ id: string; key: string | null; url: string } | null> {
  if (kind === "server") {
    const server = await getServerBySlugOrId(slug);
    if (!server) return null;
    return { id: server.guildId, key: server.portalKey, url: `/servers/${server.slug ?? server.guildId}` };
  }
  const db = await getDb();
  const brand = await getBrandBySlugOrId(db, slug);
  if (!brand) return null;
  return { id: brand.id, key: brand.accessKey, url: `/brands/${brand.slug}` };
}

async function unlock(req: NextRequest, kind: string, slug: string, key: string) {
  // The destination is built from the portal we resolved, never from anything
  // the caller sent — otherwise this is an open redirect with a login on it.
  const home = new URL(kind === "brand" ? "/brands" : "/servers", req.nextUrl.origin);
  if (kind !== "server" && kind !== "brand") return NextResponse.redirect(home);

  const portal = await resolve(kind, slug);
  if (!portal) return NextResponse.redirect(home);

  const dest = new URL(portal.url, req.nextUrl.origin);
  const verdict = verifyPortalKey(kind, portal.id, portal.key, key);
  if (verdict !== "ok") {
    // Says which of the two it was: a throttled owner who mistyped once needs
    // to know to wait, not to keep trying a key that is actually correct.
    dest.searchParams.set("unlock", verdict);
    return NextResponse.redirect(dest);
  }

  const res = NextResponse.redirect(dest);
  await grantPortalSession(kind, portal.id, res.cookies);
  return res;
}

export async function POST(req: NextRequest) {
  const form = await req.formData().catch(() => null);
  return unlock(
    req,
    String(form?.get("kind") ?? ""),
    String(form?.get("slug") ?? ""),
    String(form?.get("key") ?? "").trim(),
  );
}

export async function GET(req: NextRequest) {
  const q = req.nextUrl.searchParams;
  return unlock(req, q.get("kind") ?? "", q.get("slug") ?? "", (q.get("key") ?? "").trim());
}
