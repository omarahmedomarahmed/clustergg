import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { getServerBySlugOrId } from "@/lib/server-portal";
import { getBrandBySlugOrId } from "@/lib/brands";
import { grantPortalSession, verifyPortalKey, clearThrottle, MAX_FAILURES } from "@/lib/portal-auth";
import { lockState, ipLockState, recordAttempt } from "@/lib/portal-attempts";

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

/**
 * The one thing a caller may influence about the destination.
 *
 * A shared link like `/brands/x?key=…&challenge=abc` used to lose the
 * `challenge` on the way through: the exchange redirects to the CLEAN portal
 * URL, and everything but the key went with it. So the deep link that a brand
 * was actually sent — open this week — landed them on the portal home instead.
 *
 * Allow-listed and re-encoded rather than passed through, because "preserve
 * whatever the caller sent" on a redirect is how an open redirect is born.
 */
const DEEP_LINK_PARAMS = ["challenge", "campaign", "tab"] as const;

function applyDeepLink(dest: URL, deep: string) {
  if (!deep) return;
  try {
    const src = new URLSearchParams(deep);
    for (const name of DEEP_LINK_PARAMS) {
      const v = src.get(name);
      // Ids and tab names only — no slashes, no protocol, nothing that could
      // steer the redirect somewhere other than the portal we resolved.
      if (v && /^[\w-]{1,64}$/.test(v)) dest.searchParams.set(name, v);
    }
  } catch { /* a malformed deep link just means the portal home */ }
}

async function unlock(req: NextRequest, kind: string, slug: string, key: string, deep = "") {
  // The destination is built from the portal we resolved, never from anything
  // the caller sent — otherwise this is an open redirect with a login on it.
  const home = new URL(kind === "brand" ? "/brands" : "/servers", req.nextUrl.origin);
  if (kind !== "server" && kind !== "brand") return NextResponse.redirect(home);

  const portal = await resolve(kind, slug);
  if (!portal) return NextResponse.redirect(home);

  const dest = new URL(portal.url, req.nextUrl.origin);
  applyDeepLink(dest, deep);
  const who = {
    ip: req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? null,
    userAgent: req.headers.get("user-agent"),
  };

  // Locked out? Answer before looking at the key at all. Checking it first
  // would let an attacker keep testing keys and simply ignore the response.
  //
  // TWO LOCKS, and they answer different questions. B103.
  //
  //   lockState    is this PORTAL under attack — five wrong keys at one server.
  //   ipLockState  is this PERSON attacking — fifteen wrong keys from one
  //                address, whichever portals they were aimed at.
  //
  // The second is the one that matters against a spray: four guesses each at
  // two hundred servers never trips a per-portal counter, which made guessing
  // free at exactly the scale somebody would actually use.
  const [lock, ipLock] = await Promise.all([
    lockState(kind, portal.id),
    ipLockState(who.ip),
  ]);
  if (lock.locked || ipLock.locked) {
    await recordAttempt(kind, portal.id, portal.name, false, who);
    dest.searchParams.set("unlock", "throttled");
    dest.searchParams.set("mins", String(Math.max(1, Math.ceil(
      Math.max(lock.retryInMs, ipLock.retryInMs) / 60000,
    ))));
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
    String(form?.get("deep") ?? ""),
  );
}

export async function GET(req: NextRequest) {
  const q = req.nextUrl.searchParams;
  return unlock(req, q.get("kind") ?? "", q.get("slug") ?? "", (q.get("key") ?? "").trim());
}
