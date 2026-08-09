"use server";

import { revalidatePath } from "next/cache";
import { and, eq } from "drizzle-orm";
import { getDb, schema } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";
import { hasPortalSession } from "@/lib/portal-auth";
import { buyPrivateChallenge, quotePrivate } from "@/lib/private-challenge";
import { raiseAlert } from "@/lib/staff-alerts";
import { providerForGame } from "@/lib/challenge-requests";

// An owner buying a challenge for their own members. B90.4.
//
// Guarded by the portal session, like every other thing an owner can do. The
// difference is that this one SPENDS: everything below is written so that the
// worst case is a refusal, never a charge with nothing to show for it.

export type BuyState = { ok?: true; error?: string; message?: string; challengeId?: string };

export async function buyPrivateChallengeAction(
  _prev: BuyState | undefined, fd: FormData,
): Promise<BuyState> {
  const guildId = String(fd.get("guildId") ?? "");
  if (!guildId) return { error: "Missing server." };

  const unlocked = await hasPortalSession("server", guildId);
  const user = await getCurrentUser();
  if (!unlocked && !(user && (user.role === "admin" || user.role === "superadmin"))) {
    return { error: "Open your portal with your key first." };
  }

  const game = String(fd.get("game") ?? "").trim();
  const provider = providerForGame(game);
  if (!provider) return { error: "Pick one of the games we can score automatically." };

  const start = new Date(String(fd.get("startAt") ?? ""));
  const days = Math.max(1, Math.min(30, Number(fd.get("days")) || 7));
  if (Number.isNaN(start.getTime())) return { error: "That start date isn't a date." };

  const db = await getDb();
  const [guild] = await db.select({ name: schema.discordGuilds.name })
    .from(schema.discordGuilds).where(eq(schema.discordGuilds.guildId, guildId)).limit(1);

  // The space the game lives in, so the challenge appears on its planet like
  // any other. A private challenge is hidden from people who cannot enter it,
  // not homeless.
  const [space] = await db.select({ id: schema.spaces.id }).from(schema.spaces)
    .where(and(eq(schema.spaces.name, game))).limit(1);

  const res = await buyPrivateChallenge(db, {
    guildId,
    guildName: guild?.name ?? null,
    title: String(fd.get("title") ?? ""),
    game,
    provider: provider.id,
    prizePool: Number(fd.get("prizePool")),
    startAt: start,
    endAt: new Date(start.getTime() + days * 86400_000),
    spaceId: space?.id ?? null,
  });
  if (!res.ok) return { error: res.error };

  const quote = quotePrivate(Number(fd.get("prizePool")));
  await raiseAlert(db, {
    kind: "server.private_challenge", desk: "ops",
    title: `${guild?.name || guildId} bought a private challenge`,
    body: `"${String(fd.get("title") ?? "").trim()}" on ${game} — $${quote.prizePool} in prizes, paid. `
      + "It needs a metric, rules and trophies before it can be announced to their server.",
    href: `/admin/challenges/${res.challengeId}`,
    refType: "challenge", refId: res.challengeId, once: true,
  });

  try { revalidatePath("/admin/challenges"); } catch { /* non-fatal */ }
  return {
    ok: true,
    challengeId: res.challengeId,
    message: `Bought. $${res.charged.toLocaleString("en-US")} came out of your balance. We set the scoring and the rules `
      + "and it goes out to your server before it starts — you'll see it move to Announced.",
  };
}
