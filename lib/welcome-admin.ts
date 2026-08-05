// The welcome challenge, from the admin side (B43).
//
// B31 assumed the owner would log into their portal, finish onboarding, and pick
// a game. Many never will. A draft that only its owner can complete is a draft
// that sits forever, and a cost we have already booked against a competition
// that never runs.
//
// So two things, and both are about not depending on somebody else's follow-up:
//
//   1. **Every draft is visible on the admin side from the moment it exists**,
//      whether or not the owner has ever opened the portal — with the reason it
//      is stuck, so the list is a work queue rather than an inventory.
//   2. **Admin can create one for any server at any time.** A draft cancelled
//      because we never learned which games a community plays can be recreated
//      later, when we do. That is what `challenges.kind = "welcome"` is for.
//
// Cancelling is a real state, not a delete: the invoice line stays and is
// voided, because a bill that quietly loses a row is a bill that stops
// reconciling.

import { and, desc, eq, inArray } from "drizzle-orm";
import { getDb, schema } from "@/lib/db";
import { uid } from "@/lib/utils";
import { providerForGame } from "@/lib/challenge-requests";

export type WelcomeState =
  /** Drafted, game chosen, waiting for staff to publish. */
  | "ready"
  /** Drafted but the game is not one we can verify play on. */
  | "needs_game"
  /** Live. */
  | "running"
  /** Finished. */
  | "done"
  | "cancelled";

export type WelcomeRow = {
  challengeId: string;
  guildId: string | null;
  serverName: string;
  game: string;
  title: string;
  state: WelcomeState;
  /** Why it is stuck, in one line. Empty when it is not. */
  blocker: string;
  value: number;
  /** Has the owner told us what their community plays? */
  ownerOnboarded: boolean;
  createdAt: string | null;
  billed: boolean;
};

/**
 * Every welcome challenge, with the reason each one is where it is.
 *
 * Deliberately one list rather than "drafts" and "live" on separate screens:
 * the question an admin has is "which of these needs me", and an answer split
 * across two screens is one nobody checks.
 */
export async function welcomeChallenges(limit = 200): Promise<WelcomeRow[]> {
  try {
    const db = await getDb();
    const rows = await db.select({
      id: schema.challenges.id,
      guildId: schema.challenges.guildId,
      game: schema.challenges.game,
      title: schema.challenges.title,
      status: schema.challenges.status,
      value: schema.challenges.sponsorPrice,
      createdAt: schema.challenges.createdAt,
    }).from(schema.challenges)
      .where(eq(schema.challenges.kind, "welcome"))
      .orderBy(desc(schema.challenges.createdAt))
      .limit(limit);
    if (!rows.length) return [];

    const guildIds = [...new Set(rows.map((r) => r.guildId).filter((g): g is string => !!g))];
    const guilds = guildIds.length
      ? await db.select({
          guildId: schema.discordGuilds.guildId,
          name: schema.discordGuilds.name,
          community: schema.discordGuilds.community,
        }).from(schema.discordGuilds).where(inArray(schema.discordGuilds.guildId, guildIds))
      : [];
    const byGuild = new Map(guilds.map((g) => [g.guildId, g]));

    const billed = new Set(
      (await db.select({ sourceId: schema.invoiceLines.sourceId })
        .from(schema.invoiceLines)
        .where(eq(schema.invoiceLines.sourceType, "welcome")))
        .map((l) => l.sourceId).filter((x): x is string => !!x),
    );

    return rows.map((r): WelcomeRow => {
      const guild = r.guildId ? byGuild.get(r.guildId) : undefined;
      const community = (guild?.community ?? {}) as { games?: string[] };
      const ownerOnboarded = (community.games ?? []).filter(Boolean).length > 0;
      const playable = !!r.game && !!providerForGame(r.game);

      let state: WelcomeState;
      let blocker = "";
      if (r.status === "cancelled") state = "cancelled";
      else if (r.status === "completed") state = "done";
      else if (r.status === "active") state = "running";
      else if (!playable) {
        state = "needs_game";
        blocker = ownerOnboarded
          // The owner told us games, but none of them is one we can read scores
          // from. Naming that is the difference between a queue and a mystery.
          ? "They told us what they play, but we cannot verify scores on it. Pick a game we can."
          : "They have never told us what their community plays. Pick a game, or ask them.";
      } else {
        state = "ready";
        blocker = "";
      }

      return {
        challengeId: r.id,
        guildId: r.guildId,
        serverName: guild?.name || r.guildId || "Unknown server",
        game: r.game ?? "",
        title: r.title,
        state,
        blocker,
        value: Number(r.value ?? 0),
        ownerOnboarded,
        createdAt: r.createdAt?.toISOString() ?? null,
        billed: billed.has(r.id),
      };
    });
  } catch { return []; }
}

export type WelcomeAction = { ok: true; challengeId: string } | { ok: false; reason: string };

/**
 * Admin picks the game a stuck draft should run on.
 *
 * Produces exactly what the owner's path would — the same draft, on the same
 * challenge — rather than a second one, so there is never a question of which
 * of two welcome challenges a server actually got.
 */
export async function completeWelcome(challengeId: string, game: string): Promise<WelcomeAction> {
  try {
    const db = await getDb();
    const provider = providerForGame(game);
    if (!provider) return { ok: false, reason: "no_provider" };

    const [ch] = await db.select().from(schema.challenges)
      .where(eq(schema.challenges.id, challengeId)).limit(1);
    if (!ch || ch.kind !== "welcome") return { ok: false, reason: "not_found" };
    if (ch.status !== "draft") return { ok: false, reason: "not_a_draft" };

    const [space] = await db.select({ id: schema.spaces.id }).from(schema.spaces)
      .where(eq(schema.spaces.game, game)).limit(1);
    if (!space) return { ok: false, reason: "no_planet" };

    await db.update(schema.challenges)
      .set({ game, provider: provider.id, spaceId: space.id })
      .where(eq(schema.challenges.id, challengeId));
    // Still a DRAFT. Completing it is choosing the game, not publishing — a
    // welcome challenge goes through the same approval as any other.
    return { ok: true, challengeId };
  } catch { return { ok: false, reason: "error" }; }
}

/**
 * Cancel a draft nobody is going to finish.
 *
 * The challenge becomes `cancelled` and its invoice line is VOIDED rather than
 * deleted: the bill keeps its history, so a month's spend still reconciles
 * against what was actually run. Removing the row would make the invoice quietly
 * change value after the fact.
 */
export async function cancelWelcome(challengeId: string, reason: string): Promise<WelcomeAction> {
  try {
    const db = await getDb();
    const [ch] = await db.select().from(schema.challenges)
      .where(eq(schema.challenges.id, challengeId)).limit(1);
    if (!ch || ch.kind !== "welcome") return { ok: false, reason: "not_found" };
    if (ch.status === "active" || ch.status === "completed") return { ok: false, reason: "already_ran" };

    await db.update(schema.challenges)
      .set({ status: "cancelled", description: `${ch.description ?? ""}\n\nCancelled: ${reason}`.trim() })
      .where(eq(schema.challenges.id, challengeId));

    // Void the line to zero rather than delete it.
    await db.update(schema.invoiceLines)
      .set({ unitAmount: 0, label: `Welcome challenge — cancelled (${reason})`.slice(0, 200) })
      .where(and(
        eq(schema.invoiceLines.sourceType, "welcome"),
        eq(schema.invoiceLines.sourceId, challengeId),
      ));

    // The guild can be offered one again later, which is the whole point of
    // B43.2 — a draft cancelled for want of a game is recreated once we know it.
    if (ch.guildId) {
      await db.update(schema.discordGuilds)
        .set({ welcomeChallengeAt: null, welcomeChallengeId: null })
        .where(eq(schema.discordGuilds.guildId, ch.guildId));
    }
    return { ok: true, challengeId };
  } catch { return { ok: false, reason: "error" }; }
}

/**
 * Create one for any server, at any time (B43.2).
 *
 * The path for a server whose draft was cancelled before we knew its games, and
 * for one that installed before the campaign existed. Bills exactly like the
 * automatic one, because it IS the same thing arriving by a different door.
 */
export async function createWelcomeFor(guildId: string, game: string, value: number): Promise<WelcomeAction> {
  try {
    const db = await getDb();
    const provider = providerForGame(game);
    if (!provider) return { ok: false, reason: "no_provider" };

    const [guild] = await db.select().from(schema.discordGuilds)
      .where(eq(schema.discordGuilds.guildId, guildId)).limit(1);
    if (!guild) return { ok: false, reason: "no_guild" };
    // One at a time. A server with a live welcome challenge does not need a
    // second, and a second would be billed as a second.
    if (guild.welcomeChallengeId) return { ok: false, reason: "already_has_one" };

    const [space] = await db.select({ id: schema.spaces.id }).from(schema.spaces)
      .where(eq(schema.spaces.game, game)).limit(1);
    if (!space) return { ok: false, reason: "no_planet" };

    const { houseBrand, billWelcomeChallenge } = await import("@/lib/house-brand");
    const brand = await houseBrand();

    const id = uid();
    const key = uid().replace(/[^A-Za-z0-9]/g, "").slice(0, 6).toUpperCase();
    await db.insert(schema.challenges).values({
      id, spaceId: space.id, game, provider: provider.id,
      title: `${guild.name || "Your server"} — Welcome Challenge`,
      description: `A competition for this server only, funded by Cluster.`,
      format: "top3", cadence: "weekly",
      rules: { conditions: [] }, pointsEngine: { wins: 10 },
      visibility: "private", guildId, accessKey: key, announceHype: true,
      startAt: new Date(), endAt: new Date(Date.now() + 7 * 86400_000),
      status: "draft", kind: "welcome",
      sponsorBrandId: brand?.id ?? null, sponsorPrice: value,
      prizeDescription: `$${value} prize pool, funded by Cluster`,
      createdBy: null,
    } as never);

    await db.update(schema.discordGuilds)
      .set({ welcomeChallengeAt: new Date(), welcomeChallengeId: id })
      .where(eq(schema.discordGuilds.guildId, guildId));

    try { await billWelcomeChallenge(id, guild.name || guildId, value); }
    catch { /* reconcilable — see lib/house-brand.ts */ }

    return { ok: true, challengeId: id };
  } catch { return { ok: false, reason: "error" }; }
}
