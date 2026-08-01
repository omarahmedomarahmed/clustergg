"use server";

import { revalidatePath } from "next/cache";
import { eq } from "drizzle-orm";
import { getDb, schema } from "@/lib/db";
import { keysMatch, hasPortalSession } from "@/lib/portal-auth";
import { ownerSend, markRead } from "@/lib/server-messages";
import { submitChallengeRequest } from "@/lib/challenge-requests";
import { saveCommunity } from "@/lib/discord/community";

// Everything a server owner can do from their dashboard.
//
// The portal is unauthenticated and gated by the server's own key, exactly like
// the brand portal — an owner should not need a Cluster account to run the
// community they already run. So every action re-validates the key against the
// server before touching anything, and nothing here takes a guild id on trust.

async function requireServer(guildId: string, key: string) {
  const db = await getDb();
  const [server] = await db.select().from(schema.discordGuilds)
    .where(eq(schema.discordGuilds.guildId, guildId)).limit(1);
  if (!server) throw new Error("Unknown server");
  // Constant-time, and either credential: the key itself, or a session already
  // granted for THIS server by the unlock route.
  const ok = keysMatch(server.portalKey, key) || (await hasPortalSession("server", server.guildId));
  if (!ok) throw new Error("Invalid server access key");
  return { db, server };
}

export type PortalActionState = { ok?: string; error?: string } | null;

/** The owner writing to us. Lands in the admin inbox under their server. */
export async function portalSendMessage(
  guildId: string, key: string,
  _prev: PortalActionState, formData: FormData,
): Promise<PortalActionState> {
  try {
    const { server } = await requireServer(guildId, key);
    const body = String(formData.get("body") ?? "");
    const res = await ownerSend({
      guildId, body, discordUserId: server.ownerDiscordId, source: "portal",
    });
    if (!res.ok) {
      return { error: res.reason === "empty" ? "Write something first." : "Couldn't send that. Try again." };
    }
    revalidatePath(`/servers/${server.slug ?? guildId}`);
    return { ok: "Sent. We answer in the bot's DMs and here." };
  } catch { return { error: "That link has expired — reopen your dashboard." }; }
}

export async function portalMarkRead(guildId: string, key: string): Promise<void> {
  try {
    await requireServer(guildId, key);
    await markRead(guildId, "owner");
  } catch { /* an unread badge is not worth an error page */ }
}

/**
 * An owner building a challenge for their community, from the web.
 *
 * The same request `/cluster admin` submits, from a form with room to think.
 * A Discord modal allows five short inputs and no help text, which is fine for
 * a quick ask and wrong for the thing an owner is most nervous about getting
 * right — so both paths exist and land in the same queue.
 */
export async function portalRequestChallenge(
  guildId: string, key: string,
  _prev: PortalActionState, formData: FormData,
): Promise<PortalActionState> {
  try {
    const { server } = await requireServer(guildId, key);
    const res = await submitChallengeRequest({
      guildId,
      game: String(formData.get("game") ?? ""),
      title: String(formData.get("title") ?? ""),
      description: String(formData.get("description") ?? ""),
      format: String(formData.get("format") ?? "top3"),
      days: Number(formData.get("days") ?? 7),
      prizeValue: Number(formData.get("prizeValue") ?? 0),
      prizeDescription: String(formData.get("prizeDescription") ?? "") || null,
      requestedByDiscordId: server.ownerDiscordId,
    });
    if (!res.ok) {
      const why: Record<string, string> = {
        no_game: "Pick a game.",
        no_title: "Give it a name your members will recognise.",
        unknown_game: "We can't score that game yet, so it can't carry a challenge.",
        too_many_pending: "You already have three waiting on us. We'll get to them first.",
        error: "Couldn't submit that. Try again.",
      };
      return { error: why[res.reason] ?? why.error };
    }
    revalidatePath(`/servers/${server.slug ?? guildId}`);
    return { ok: "Sent for review. We usually come back the same day." };
  } catch { return { error: "That link has expired — reopen your dashboard." }; }
}

/**
 * The community profile, edited from the web.
 *
 * The same answers the install-time questions collect. An owner's community
 * changes — a server that was Valorant last year is Marvel Rivals now — and
 * targeting built on a stale answer sells a brand the wrong audience.
 */
export async function portalSaveCommunity(
  guildId: string, key: string,
  _prev: PortalActionState, formData: FormData,
): Promise<PortalActionState> {
  try {
    const { server } = await requireServer(guildId, key);
    await saveCommunity(guildId, {
      games: formData.getAll("games").map(String),
      regions: formData.getAll("regions").map(String),
      vibes: formData.getAll("vibes").map(String),
      about: String(formData.get("about") ?? ""),
    });
    revalidatePath(`/servers/${server.slug ?? guildId}`);
    return { ok: "Saved. Brands targeting these games and regions can now find you." };
  } catch { return { error: "Couldn't save that. Try again." }; }
}
