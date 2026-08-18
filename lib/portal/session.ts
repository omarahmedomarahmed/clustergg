// Who may open which portal.
//
// ===== TWO PORTALS, TWO COMPLETELY DIFFERENT ANSWERS =====
//
// A **server portal** is opened by a linked Discord identity that Discord says
// admins that guild (12 §2, S1). There is no key, no invite, nothing we
// issued: the credential was deleted, and what replaced it is a fact about
// Discord that we look up.
//
// A **brand portal** is opened by an email-and-password session against
// `brand_users` (I2). Separate table, separate route, separate cookie — one
// email could otherwise be both, and a brand landing in gamer onboarding is a
// mess.
//
// The two are not variations of one mechanism and are deliberately not written
// as one. The only thing they share is that the gate is called from the layout
// so no page can forget it.

import { headers } from "next/headers";
import { notFound, redirect } from "next/navigation";
import { eq } from "drizzle-orm";
import { getDb, isDemoMode, schema } from "../db/index.ts";
import { currentGamer } from "../auth/current.ts";
import { hasSeenAdmin } from "../discord/admin.ts";
import { hasPortalSession } from "../core/portal-auth.ts";
import {
  guildAccessFor,
  mayWithdraw,
  type GuildAccess,
  type WithdrawVerdict,
} from "./permissions.ts";

// ── The brand portal ────────────────────────────────────────────────────────

/**
 * Is this request holding a brand session for exactly this brand?
 *
 * Demo mode is fenced, and fenced narrowly: with no `DATABASE_URL` there are
 * no real customers to leak, and the screenshot record has to walk the portal
 * without a password.
 */
export async function brandPortalOpen(brandId: string): Promise<boolean> {
  return mayOpenPortal({
    hasSession: await hasPortalSession("brand", brandId),
    isDemo: isDemoMode,
  });
}

/**
 * The decision, with the request taken out of it.
 *
 * Split out so it can be asserted. Everything else here needs `next/headers`
 * and therefore a live request, which means the **direction of the default** —
 * the only part that can be catastrophically wrong — would otherwise be
 * reachable by inspection alone.
 */
export function mayOpenPortal(facts: { hasSession: boolean; isDemo: boolean }): boolean {
  if (facts.hasSession) return true;
  // ===== THE ONLY REASON THIS IS NOT `return false` =====
  // With no `DATABASE_URL` there is no real customer to leak and the
  // screenshot record has to walk the portal. With a database, it is `false`.
  return facts.isDemo;
}

export async function requireBrandPortal(brandId: string): Promise<void> {
  if (await brandPortalOpen(brandId)) return;
  const path = (await headers()).get("x-pathname") ?? `/portal/brand/${brandId}`;
  redirect(`/login/brand?next=${encodeURIComponent(path)}`);
}

// ── The server portal ───────────────────────────────────────────────────────

/**
 * What the signed-in gamer may do on this guild.
 *
 * Returns the **whole** access shape rather than a boolean, because a page
 * needs to know *which* of owner and administrator they are: an administrator
 * sees the withdraw button disabled with a reason, not hidden (09 §Band 2,
 * shot 4a). A boolean here forces every page to ask a second question, and the
 * second question is the one somebody forgets.
 */
export async function serverPortalAccess(guildId: string): Promise<GuildAccess> {
  const db = await getDb();
  const gamer = await currentGamer();
  const [guild] = await db.select().from(schema.guilds).where(eq(schema.guilds.guildId, guildId));
  if (!guild) notFound();

  return guildAccessFor({
    guild,
    discordId: gamer?.discordId ?? null,
    // Asked of `hasSeenAdmin`, which knows that a `guild_admins` row is a
    // **pair**. This used to run its own query with only the guild in the
    // `where`, and every gamer who had linked Discord was an administrator of
    // every server that had ever seen one.
    seenAdmin: await hasSeenAdmin(db, guildId, gamer?.discordId),
    isDemo: isDemoMode,
  });
}

/**
 * May the signed-in gamer withdraw this guild's money — the same four gates
 * the Discord wallet card asks, asked the same way.
 *
 * ===== 09 BAND 2 SHOT 4a: DISABLED WITH A REASON, NOT HIDDEN =====
 *
 * `serverPortalAccess` above already says why it returns the whole access
 * shape rather than a boolean — *"an administrator sees the withdraw button
 * disabled with a reason, not hidden."* The wallet page had neither. It
 * carried the rule as a sentence of help text and consulted nothing, which is
 * the shape this branch exists to find: a rule proven to exist, read by
 * nobody.
 *
 * The verdict is the whole answer, refusal wording included, so the page
 * renders the reason rather than composing one.
 */
export async function serverWithdrawVerdict(guildId: string): Promise<WithdrawVerdict> {
  const db = await getDb();
  const gamer = await currentGamer();
  const [guild] = await db.select().from(schema.guilds).where(eq(schema.guilds.guildId, guildId));
  if (!guild) notFound();

  return mayWithdraw({
    access: await serverPortalAccess(guildId),
    ageBand: gamer?.ageBand ?? null,
    country: gamer?.country ?? null,
    transferConfirmedAt: guild.transferConfirmedAt,
  });
}

export async function requireServerPortal(guildId: string): Promise<GuildAccess> {
  const access = await serverPortalAccess(guildId);
  if (access.kind === "none") {
    const path = (await headers()).get("x-pathname") ?? `/portal/server/${guildId}`;
    // Not "access denied" — a route. They may genuinely admin this guild and
    // simply not have linked Discord yet (S1: sign up by email, link later).
    redirect(`/login?next=${encodeURIComponent(path)}&need=discord`);
  }
  return access;
}

// ── Existence, which is a different question from permission ────────────────

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
