// Who may open which portal.
//
// ===== A PORTAL SESSION IS FOR ONE PORTAL =====
//
// The rule that matters here is the one docs/04-SURFACES.md §9 states from the
// brand's side — *"See another brand's numbers · which is exactly why nobody
// sees theirs"* — and it is the same rule on the owner side. A brand contact
// holding a valid session for their own portal must be refused at another
// brand's, and refused the same way a stranger is: no page, no partial page,
// no "you are not allowed to see the entrants but here is the header".
//
// `lib/core/portal-auth.ts` already puts the portal's id **inside the cookie
// name** and signs `"<kind>:<id>"`, so a session for one portal is not a
// session for another even if the cookie value leaks. This module is the
// layer that actually asks, and — like the admin console — it is called from
// the LAYOUT so no page can forget it.

import { headers } from "next/headers";
import { notFound, redirect } from "next/navigation";
import { getDb, isDemoMode } from "../db/index.ts";
import { schema } from "../db/index.ts";
import { eq } from "drizzle-orm";
import { hasPortalSession, verifyPortalKey, type PortalCheck } from "../core/portal-auth.ts";

export type PortalKind = "brand" | "server";

/**
 * Is this request holding a session for exactly this portal?
 *
 * Demo mode is fenced, and fenced *narrowly*: with no `DATABASE_URL` there are
 * no real customers to leak, and the screenshot record has to be able to walk
 * both portals without a key. A process with a database gets the real check.
 */
export async function portalOpen(kind: PortalKind, id: string): Promise<boolean> {
  return mayOpenPortal({ hasSession: await hasPortalSession(kind, id), isDemo: isDemoMode });
}

/**
 * The decision, with the request taken out of it.
 *
 * Split out so it can be asserted. Everything else in the gate needs
 * `next/headers` and therefore a live request, which means the *direction of
 * the default* — the only part that can be catastrophically wrong — was
 * reachable by inspection alone. A demo fence that quietly stopped being a
 * fence would open every portal on a real deployment, and nothing would look
 * different until somebody read somebody else's numbers.
 */
export function mayOpenPortal(facts: { hasSession: boolean; isDemo: boolean }): boolean {
  if (facts.hasSession) return true;
  // ===== THE ONLY REASON THIS IS NOT `return false` =====
  // With no `DATABASE_URL` there is no real customer to leak and the
  // screenshot record has to walk both portals with no key. The moment a
  // database is configured, this is `false`.
  return facts.isDemo;
}

/**
 * Check a key without granting anything.
 *
 * Granting writes a cookie and a Server Component render may not — that is
 * `/api/portal/unlock`'s job. Splitting it this way is deliberate and is
 * written up in `lib/core/portal-auth.ts`: the version that granted during its
 * own render crashed on a **correct** key and quietly showed the locked view
 * on a wrong one, so the bug only appeared on success.
 */
export async function checkPortalKey(
  kind: PortalKind,
  id: string,
  key: string | null,
): Promise<PortalCheck> {
  const db = await getDb();
  const hash =
    kind === "brand"
      ? (await db.select().from(schema.brands).where(eq(schema.brands.id, id)))[0]?.portalKeyHash
      : (await db.select().from(schema.guilds).where(eq(schema.guilds.guildId, id)))[0]
          ?.portalKeyHash;

  // An unknown portal is answered exactly like a wrong key. Answering "no such
  // brand" differently turns the login form into a directory of our customers.
  if (!hash) return "bad";

  // `verifyPortalKey` compares the *key*; what we hold is its hash. Hash the
  // given key first so the constant-time comparison is hash against hash.
  const { hashPortalKey } = await import("../core/keys.ts");
  return verifyPortalKey(kind, id, hash, key === null ? null : hashPortalKey(key));
}

/** Called once, by a portal layout. Every page under it is covered. */
export async function requirePortal(kind: PortalKind, id: string): Promise<void> {
  if (await portalOpen(kind, id)) return;
  const path = (await headers()).get("x-pathname") ?? `/portal/${kind}/${id}`;
  redirect(`/login/${kind}?id=${encodeURIComponent(id)}&next=${encodeURIComponent(path)}`);
}

/**
 * The portal's own record, or a 404.
 *
 * Separate from the gate on purpose: the gate answers *may you*, this answers
 * *does it exist*, and a portal that does not exist must 404 rather than
 * redirect to a login form for a customer we do not have.
 */
export async function brandForPortal(id: string) {
  const db = await getDb();
  const [brand] = await db.select().from(schema.brands).where(eq(schema.brands.id, id));
  if (!brand) notFound();
  return brand;
}

export async function guildForPortal(id: string) {
  const db = await getDb();
  const [guild] = await db.select().from(schema.guilds).where(eq(schema.guilds.guildId, id));
  if (!guild) notFound();
  return guild;
}
