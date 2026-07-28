import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { getServerBySlugOrId } from "@/lib/server-portal";
import { getBrandBySlugOrId } from "@/lib/brands";
import { grantPortalSession, verifyPortalKey, clearThrottle, MAX_FAILURES } from "@/lib/portal-auth";
import { lockState, recordAttempt } from "@/lib/portal-attempts";

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

async function resolve(kind: Kind, slug: string): Promise<{ id: string; name: string; key: string | null; url: string } | null> {
  if (kind === "server") {
    const server = await getServerBySlugOrId(slug);
    if (!server) return null;
    return { id: server.guildId, name: server.name, key: server.portalKey, url: `/servers/${server.slug ?? server.guildId}` };
  }
  const db = await getDb();
  const brand = await getBrandBySlugOrId(db, slug);
  if (!brand) return null;
  return { id: brand.id, name: brand.name, key: brand.accessKey, url: `/brands/${brand.slug}` };
}

async function unlock(req: NextRequest, kind: string, slug: string, key: string) {
  // The destination is built from the portal we resolved, never from anything
  // the caller sent — otherwise this is an open redirect with a login on it.
  const home = new URL(kind === "brand" ? "/brands" : "/servers", req.nextUrl.origin);
  if (kind !== "server" && kind !== "brand") return NextResponse.redirect(home);

  const portal = await resolve(kind, slug);
  if (!portal) return NextResponse.redirect(home);

  const dest = new URL(portal.url, req.nextUrl.origin);
  const who = {
    ip: req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? null,
    userAgent: req.headers.get("user-agent"),
  };

  // Locked out? Answer before looking at the key at all. Checking it first
  // would let an attacker keep testing keys and simply ignore the response.
  const lock = await lockState(kind, portal.id);
  if (lock.locked) {
    await recordAttempt(kind, portal.id, portal.name, false, who);
    dest.searchParams.set("unlock", "throttled");
    dest.searchParams.set("mins", String(Math.max(1, Math.ceil(lock.retryInMs / 60000))));
    return NextResponse.redirect(dest);
  }

  const verdict = verifyPortalKey(kind, portal.id, portal.key, key);
  if (verdict !== "ok") {
    await recordAttempt(kind, portal.id, portal.name, false, who);
    // Says which of the two it was: a throttled owner who mistyped once needs
    // to know to wait, not to keep trying a key that is actually correct. And
    // it says how many tries are left, so a lockout is never a surprise.
    dest.searchParams.set("unlock", verdict);
    const left = Math.max(0, MAX_FAILURES - (lock.failures + 1));
    if (verdict === "bad") dest.searchParams.set("left", String(left));
    return NextResponse.redirect(dest);
  }

  await recordAttempt(kind, portal.id, portal.name, true, who);
  clearThrottle(kind, portal.id);
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
