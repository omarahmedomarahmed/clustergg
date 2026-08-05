// Who brought us this server, and paying them for it (B22).
//
// A Cluster member who gets the bot into a server has done the single most
// valuable thing a gamer can do for us — it is the one action whose value is not
// capped by their own play. It earned nothing, because the only place an install
// is observable is the OAuth callback, and an OAuth callback has no session.
//
// The fix is a signed state parameter. `state` is a standard OAuth field that
// Discord hands back untouched, so it carries the gamer's id out to Discord and
// home again. It is SIGNED because it comes back through the user's browser: an
// unsigned one is a URL anybody can write with somebody else's id in it, or with
// their own id and a guild they never installed.
//
// Three things this deliberately does not do:
//
//   1. It does not fail an install. Every path here is best-effort — a server
//      that onboards without credit is a working server; a server that fails to
//      onboard because the credit machinery threw is not.
//   2. It does not credit twice. The key is the GUILD, checked across all
//      gamers, so two people racing the same install produce one award.
//   3. It does not credit a re-install. A server that removes the bot and adds
//      it again is the same server arriving once.

import { createHmac, timingSafeEqual } from "node:crypto";
import { eq } from "drizzle-orm";
import { getDb, schema } from "@/lib/db";

/** The action key in `ACTION_CATALOG`. Weight and cap are the admin's (B16). */
export const INSTALL_ACTION = "bot_added" as const;

/** How long a minted state is good for. Long enough to read a permissions
 *  screen and pick a server; short enough that a leaked URL is worthless. */
export const STATE_TTL_MS = 60 * 60 * 1000;

function secret(): string {
  return process.env.AUTH_SECRET
    ?? process.env.BOT_API_SECRET
    ?? "cluster-demo-secret-set-AUTH_SECRET-in-production";
}

const mac = (payload: string) =>
  createHmac("sha256", secret()).update(payload).digest("hex").slice(0, 32);

/**
 * Mint the `state` for an install URL.
 *
 * Shape: `<userId>.<issuedAtMs>.<mac>`. The timestamp is inside the signed
 * payload, so an expired state cannot be refreshed by editing the URL.
 */
export function signInstallState(userId: string, now = Date.now()): string {
  const payload = `${userId}.${now}`;
  return `${payload}.${mac(payload)}`;
}

/** Recover the gamer id from a returned `state`, or null if it is not ours. */
export function verifyInstallState(state: string | null | undefined, now = Date.now()): string | null {
  if (!state) return null;
  const parts = state.split(".");
  if (parts.length !== 3) return null;
  const [userId, issued, sig] = parts;
  if (!userId || !/^\d+$/.test(issued)) return null;
  const expected = Buffer.from(mac(`${userId}.${issued}`));
  const given = Buffer.from(sig);
  if (expected.length !== given.length || !timingSafeEqual(expected, given)) return null;
  const age = now - Number(issued);
  // A negative age is a clock skew, not an attack — but a state issued in the
  // future is also what a forged timestamp looks like, so both are refused.
  if (age < 0 || age > STATE_TTL_MS) return null;
  return userId;
}

export type CreditResult =
  | { credited: true; userId: string }
  | { credited: false; reason: "no_state" | "bad_state" | "no_such_user" | "already_credited" | "error" };

/**
 * Credit an install, once, to the gamer who brought it.
 *
 * Called from the OAuth callback. Returns a reason rather than throwing,
 * because every one of these outcomes is ordinary: most installs arrive with no
 * state at all (Discord's own App Directory button carries none) and that is a
 * successful install, not a failure.
 */
export async function creditInstall(guildId: string, state: string | null | undefined): Promise<CreditResult> {
  if (!state) return { credited: false, reason: "no_state" };
  const userId = verifyInstallState(state);
  if (!userId) return { credited: false, reason: "bad_state" };

  try {
    const db = await getDb();
    const [user] = await db.select({ id: schema.users.id, status: schema.users.status })
      .from(schema.users).where(eq(schema.users.id, userId)).limit(1);
    if (!user || user.status !== "active") return { credited: false, reason: "no_such_user" };

    // Once per GUILD, across every gamer — not once per (gamer, guild), which is
    // what `awardQuestAction`'s own dedup would give us. Two people racing the
    // same install is one server arriving.
    const [existing] = await db.select({ id: schema.discordGuilds.guildId })
      .from(schema.discordGuilds)
      .where(eq(schema.discordGuilds.guildId, guildId)).limit(1);
    if (existing) {
      const [row] = await db.select({ by: schema.discordGuilds.installedByUserId })
        .from(schema.discordGuilds).where(eq(schema.discordGuilds.guildId, guildId)).limit(1);
      if (row?.by) return { credited: false, reason: "already_credited" };
      await db.update(schema.discordGuilds).set({ installedByUserId: userId })
        .where(eq(schema.discordGuilds.guildId, guildId));
    } else {
      // The callback races `onboardGuild`, which is the thing that creates the
      // row. Write the credit onto a row of our own rather than losing it —
      // `upsertGuild` merges into whatever is here.
      await db.insert(schema.discordGuilds)
        .values({ guildId, installedByUserId: userId })
        .onConflictDoNothing();
      const [after] = await db.select({ by: schema.discordGuilds.installedByUserId })
        .from(schema.discordGuilds).where(eq(schema.discordGuilds.guildId, guildId)).limit(1);
      if (after?.by && after.by !== userId) return { credited: false, reason: "already_credited" };
      if (!after?.by) {
        await db.update(schema.discordGuilds).set({ installedByUserId: userId })
          .where(eq(schema.discordGuilds.guildId, guildId));
      }
    }

    const { awardQuestAction } = await import("@/lib/quests");
    await awardQuestAction(db, userId, INSTALL_ACTION, { refType: "guild", refId: guildId });
    return { credited: true, userId };
  } catch {
    // An install that onboarded correctly and failed to pay is a support
    // ticket. An install that failed because the payment threw is a lost server.
    return { credited: false, reason: "error" };
  }
}
