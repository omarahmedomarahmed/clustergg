import { and, eq, isNull } from "drizzle-orm";
import { getDb, schema } from "@/lib/db";
import { uid } from "@/lib/utils";
import { buildFinance, FINANCE_CMS_KEYS } from "@/lib/finance";
import { getContent } from "@/lib/cms";
import { providerForGame } from "@/lib/challenge-requests";
import { announceChallengeLaunched } from "@/lib/discord/announce";
import { dmUser } from "@/lib/discord/rest";
import { siteUrl } from "@/lib/discord/config";

// The welcome challenge: what a server gets on the day it installs the bot.
//
// A community that installs a bot has done us a favour and got nothing back
// yet. The welcome challenge is the thing that arrives in return — a real
// competition, with real prize money we fund, for that server's members only.
// It is the only acquisition offer that reaches MEMBERS rather than owners,
// and that is the point: an owner installing a bot is not distribution, an
// owner's members linking their game accounts is.
//
// Deliberately private and keyed to the server. Everyone else can see it
// running, which is the best advertising a server challenge has, and only that
// community can enter.

export type WelcomeResult =
  | { ok: true; challengeId: string; game: string; already: boolean }
  | { ok: false; reason: "no_guild" | "no_game" | "failed" };

/**
 * Give one server its welcome challenge, if it hasn't had one.
 *
 * Idempotent by the `welcomeChallengeAt` stamp rather than by searching for a
 * challenge that looks like a welcome challenge — an offer that can be claimed
 * twice by pressing a button twice is a budget with a hole in it.
 */
export async function grantWelcomeChallenge(guildId: string): Promise<WelcomeResult> {
  const db = await getDb();
  const [guild] = await db.select().from(schema.discordGuilds)
    .where(eq(schema.discordGuilds.guildId, guildId)).limit(1);
  if (!guild) return { ok: false, reason: "no_guild" };
  if (guild.welcomeChallengeAt && guild.welcomeChallengeId) {
    const [existing] = await db.select({ game: schema.challenges.game }).from(schema.challenges)
      .where(eq(schema.challenges.id, guild.welcomeChallengeId)).limit(1);
    return { ok: true, challengeId: guild.welcomeChallengeId, game: existing?.game ?? "", already: true };
  }

  // Which game. The community told us at install what it plays; if it never
  // did, we cannot pick one for them — an activation on the wrong game is
  // worse than none, and the honest move is to go and ask.
  const community = (guild.community ?? {}) as { games?: string[] };
  const wanted = (community.games ?? []).filter(Boolean);
  const games = await db.select().from(schema.games).where(eq(schema.games.isActive, true));
  // The game AND a provider that can actually verify play on it. A challenge
  // on a game we cannot read scores from is a poster, not a competition.
  const game = games.find((g) => wanted.includes(g.name) && providerForGame(g.name)) ?? null;
  const provider = game ? providerForGame(game.name) : null;
  if (!game || !provider) return { ok: false, reason: "no_game" };

  const [space] = await db.select({ id: schema.spaces.id }).from(schema.spaces)
    .where(eq(schema.spaces.game, game.name)).limit(1);
  if (!space) return { ok: false, reason: "failed" };

  const content = await getContent(FINANCE_CMS_KEYS).catch(() => ({} as Record<string, string>));
  const fin = buildFinance(content);

  const id = uid();
  // A key nobody has to be told twice: short, unambiguous, all caps.
  const key = uid().replace(/[^A-Za-z0-9]/g, "").slice(0, 6).toUpperCase();
  try {
    await db.insert(schema.challenges).values({
      id,
      spaceId: space.id,
      game: game.name,
      provider: provider.id,
      title: `${guild.name || "Your server"} — Welcome Challenge`,
      description:
        `A competition for this server only, funded by Cluster. Every ${game.name} win this week scores. `
        + `The prize is real money and it is already paid for — this is what the bot does every week from here on.`,
      format: "top3",
      cadence: "weekly",
      rules: { conditions: [] },
      pointsEngine: { wins: 10 },
      visibility: "private",
      guildId,
      accessKey: key,
      announceHype: true,
      startAt: new Date(),
      endAt: new Date(Date.now() + 7 * 86400_000),
      status: "active",
      prizeDescription: `$${fin.welcomeChallengeCost} prize pool, funded by Cluster`,
      createdBy: null,
    } as never);

    await db.update(schema.discordGuilds)
      .set({ welcomeChallengeAt: new Date(), welcomeChallengeId: id })
      .where(eq(schema.discordGuilds.guildId, guildId));
  } catch {
    return { ok: false, reason: "failed" };
  }

  // Announce it where it belongs, and tell the owner. Neither can fail the
  // grant: the challenge exists either way, and a silent announcement is a
  // support ticket rather than a lost competition.
  try { await announceChallengeLaunched(id); } catch { /* the challenge is live regardless */ }
  if (guild.ownerDiscordId) {
    await dmUser(guild.ownerDiscordId, {
      embeds: [{
        title: "Your welcome challenge is live",
        description: [
          `**${guild.name || "Your server"}** now has its own ${game.name} competition running, and Cluster is paying the prize.`,
          "",
          `Entry key for your members: **\`${key}\`**`,
          "",
          "Anyone can watch it. Only your members can enter — that key is the door, and it is yours to post.",
          "",
          `Everything it does: ${siteUrl()}/servers`,
        ].join("\n"),
        color: 0x34d399,
      }],
    }).catch(() => false);
  }

  return { ok: true, challengeId: id, game: game.name, already: false };
}

export type SweepResult = {
  granted: number;
  already: number;
  /** Servers we could not give one to because we don't know what they play. */
  needAsking: { guildId: string; name: string }[];
  failed: number;
};

/**
 * Give it to every server that hasn't had one — including the ones that
 * installed before the offer existed.
 *
 * This is the whole reason the stamp is nullable. Running it is safe at any
 * time and any number of times: a server that has one is skipped, and a server
 * that never told us what it plays is REPORTED rather than guessed at, so
 * somebody can go and ask instead of running a Fortnite competition in a chess
 * community.
 */
export async function sweepWelcomeChallenges(limit = 50): Promise<SweepResult> {
  const db = await getDb();
  const pending = await db.select({ guildId: schema.discordGuilds.guildId, name: schema.discordGuilds.name })
    .from(schema.discordGuilds)
    .where(and(eq(schema.discordGuilds.status, "active"), isNull(schema.discordGuilds.welcomeChallengeAt)))
    .limit(limit);

  const out: SweepResult = { granted: 0, already: 0, needAsking: [], failed: 0 };
  for (const g of pending) {
    const res = await grantWelcomeChallenge(g.guildId);
    if (res.ok && res.already) out.already++;
    else if (res.ok) out.granted++;
    else if (res.reason === "no_game") out.needAsking.push({ guildId: g.guildId, name: g.name || g.guildId });
    else out.failed++;
  }
  return out;
}

/**
 * Ask a server what it plays, so it can be given one.
 *
 * Sent to the servers the sweep could not serve. Deliberately a DM to the
 * owner with a reason attached: "tell us your games" with no explanation is a
 * form, and "tell us your games and we will fund a competition for your members
 * this week" is an offer.
 */
export async function askForGames(guildId: string): Promise<boolean> {
  const db = await getDb();
  const [guild] = await db.select().from(schema.discordGuilds)
    .where(eq(schema.discordGuilds.guildId, guildId)).limit(1);
  if (!guild?.ownerDiscordId) return false;
  const content = await getContent(FINANCE_CMS_KEYS).catch(() => ({} as Record<string, string>));
  const fin = buildFinance(content);
  return dmUser(guild.ownerDiscordId, {
    embeds: [{
      title: "We owe your server a competition",
      description: [
        `**${guild.name || "Your server"}** has the Cluster bot, and every server carrying it gets one competition funded by us — `
        + `a $${fin.welcomeChallengeCost} prize pool for your members, paid by Cluster, not by you.`,
        "",
        "We just need to know what your community actually plays, so we run the right one.",
        "",
        "Reply with `/cluster admin` in your server and tell us your games — it takes about twenty seconds, "
        + "and the challenge goes live the same day.",
      ].join("\n"),
      color: 0x8b5cf6,
    }],
  }).catch(() => false);
}
