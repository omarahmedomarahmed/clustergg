import { and, eq, sql } from "drizzle-orm";
import { getDb, schema } from "@/lib/db";
import { uid } from "@/lib/utils";
import { canAct, siteUrl } from "@/lib/discord/config";
import { announcingGuilds } from "@/lib/discord/guilds";
import { postMessage } from "@/lib/discord/rest";
import { cardRef, embedColor } from "@/lib/discord/cards";
import { withSponsorRow } from "@/lib/discord/sponsor";
import { frame, navButton, linkButton, rows } from "@/lib/discord/components";
import { ButtonStyle } from "@/lib/discord/types";
import { currentWeek, weekBoard, weekTimezone } from "@/lib/profile-week";
import { weekFromKey } from "@/lib/week";
import { challengeStandings } from "@/lib/challenges";
import { presentersFor, joinNames } from "@/lib/presented-by";

// Profile of the Week, in every server, every day.
//
// This is the bot's one recurring post, and it earns its place because it is
// the only thing on the platform that changes for everybody at once: the clock
// runs down, the placements move, and on Sunday somebody wins. A server that
// sees it every day sees a competition running; a server that sees it once sees
// an ad.
//
// Two things keep it from being spam, and both are hard rules rather than
// intentions:
//
//   * One post per server per day, enforced by a unique index rather than by
//     the cron's timing. A retry, a second cron, or a staff member pressing the
//     button by hand cannot double-post.
//   * It always carries the two actions that put the reader IN the competition
//     — link an account, make your profile yours — because a leaderboard you
//     can only watch is somebody else's leaderboard.

export type WeekPostResult = { considered: number; posted: number; skipped: number; kind: "update" | "result" };

/** The day, in the competition's own clock — so "one a day" means one Cluster day. */
async function dayKey(): Promise<string> {
  const tz = await weekTimezone();
  try {
    return new Intl.DateTimeFormat("en-CA", { timeZone: tz, year: "numeric", month: "2-digit", day: "2-digit" })
      .format(new Date());
  } catch {
    return new Date().toISOString().slice(0, 10);
  }
}

async function alreadyPosted(guildId: string, postKey: string): Promise<boolean> {
  try {
    const db = await getDb();
    const rows = await db.select({ id: schema.discordWeekPosts.id })
      .from(schema.discordWeekPosts)
      .where(and(
        eq(schema.discordWeekPosts.guildId, guildId),
        eq(schema.discordWeekPosts.postKey, postKey),
      )).limit(1);
    return rows.length > 0;
  } catch {
    // Can't tell? Don't post. A missed daily update is invisible; a duplicate
    // in a hundred servers is the thing that gets a bot removed.
    return true;
  }
}

async function record(guildId: string, postKey: string, weekKey: string, kind: string, channelId: string, messageId: string | null, ok: boolean) {
  try {
    const db = await getDb();
    await db.insert(schema.discordWeekPosts).values({
      id: uid(), guildId, postKey, weekKey, kind, channelId, messageId,
      status: ok ? "posted" : "failed",
    }).onConflictDoNothing();
  } catch { /* the post already happened; bookkeeping failing is not worse */ }
}

// The daily standings post.
//
// On announcement day it deliberately does NOT try to be the result post — the
// result is announced when a week is actually CALLED, which is a staff action
// on a stream, not a time of day. What this says on Sunday is "voting is shut,
// the winners are about to be named", which is true from midnight.
export async function postWeekUpdate(opts: { guildIds?: string[]; force?: boolean } = {}): Promise<WeekPostResult> {
  const out: WeekPostResult = { considered: 0, posted: 0, skipped: 0, kind: "update" };
  if (!canAct()) return out;

  let guilds = await announcingGuilds();
  if (opts.guildIds?.length) guilds = guilds.filter((g) => opts.guildIds!.includes(g.guildId));
  out.considered = guilds.length;
  if (!guilds.length) return out;

  const [week, board, day] = await Promise.all([currentWeek(), weekBoard({ limit: 3 }), dayKey()]);
  const postKey = `update:${day}`;

  // One render for the whole run: every server sees the same standings, which
  // is also the only honest thing to show — it is one competition.
  const { url, data, ad } = await cardRef("week", { mode: "race" });
  const accent = data && "theme" in data ? data.theme.accent : "#fbbf24";

  const top = board.entries.filter((e) => !e.disqualified).slice(0, 3);
  const medals = ["🥇", "🥈", "🥉"];
  const standings = top.length
    ? top.map((e, i) => `${medals[i]} **${e.displayName}** — ${e.weekVotes.toLocaleString()} vote${e.weekVotes === 1 ? "" : "s"} this week`).join("\n")
    : "Nobody has a vote yet. First one on the board takes the lead.";

  const daysLeft = week.phase === "voting"
    ? Math.max(0, Math.ceil((week.votingEndsAt.getTime() - Date.now()) / 86400000))
    : 0;

  const headline = week.phase === "announcement"
    ? "**Profile of the Week — voting is closed.** The winners are called today."
    : daysLeft <= 1
      ? "**Profile of the Week — last day to vote.**"
      : `**Profile of the Week** — ${daysLeft} days left to vote.`;

  const content = [
    headline,
    standings,
    week.phase === "announcement"
      ? "Monday the count restarts at zero for everyone."
      : "Every Cluster profile is entered automatically. Link a game, make your profile yours, and share it — that is the whole entry.",
  ].join("\n\n");

  for (const g of guilds) {
    if (!g.channelId) { out.skipped++; continue; }
    if (!opts.force && await alreadyPosted(g.guildId, postKey)) { out.skipped++; continue; }

    // The sponsor row is minted per SERVER, not once for the run: the daily
    // post is the bot's widest reach, and a click from it has to be
    // attributable to the community it came from.
    const res = await postMessage(g.channelId, withSponsorRow({
      content,
      embeds: [{ color: embedColor(accent), image: { url } }],
      components: rows([
        linkButton("Vote now", `${siteUrl()}/leaderboards/best-profile`, "🏆"),
        navButton("Link a game account", frame("link", ""), [frame("home")], ButtonStyle.Success, "🎮"),
        linkButton("Customize your profile", `${siteUrl()}/profile`, "✨"),
        navButton("The competition", frame("week"), [frame("home")], ButtonStyle.Secondary, "👑"),
      ]),
    }, ad, g.guildId));

    await record(g.guildId, postKey, week.key, "update", g.channelId, res.ok ? res.data.id : null, res.ok);
    if (res.ok) out.posted++; else out.skipped++;
  }

  return out;
}

// Sunday. The winners, their placements, and the trophy each of them got.
//
// Fired when a week is CALLED rather than on a schedule, because that is when
// there is something to announce — and keyed on the week, so calling a week
// twice (which happens when a stream stalls) announces it once.
export async function announceWeekWinners(weekKey: string, opts: { force?: boolean } = {}): Promise<WeekPostResult> {
  const out: WeekPostResult = { considered: 0, posted: 0, skipped: 0, kind: "result" };
  if (!canAct()) return out;

  const tz = await weekTimezone();
  const week = weekFromKey(weekKey, tz);
  const board = await weekBoard({ weekKey, limit: 3 });
  const podium = board.result?.podium ?? [];
  // Nothing was called, so there is nothing to announce. Posting "here are the
  // winners" with no winners is worse than staying quiet.
  if (!podium.length) return out;

  let guilds = await announcingGuilds();
  out.considered = guilds.length;
  if (!guilds.length) return out;

  const postKey = `result:${weekKey}`;
  const { url, data, ad } = await cardRef("week", { week: weekKey, mode: "result" });
  const accent = data && "theme" in data ? data.theme.accent : "#fbbf24";
  const trophy = board.result?.trophy ?? null;

  const medals = ["🥇", "🥈", "🥉"];
  const lines = podium.slice(0, 3).map((p, i) =>
    `${medals[i]} **${p.displayName}** — ${p.votes.toLocaleString()} vote${p.votes === 1 ? "" : "s"}`);

  // Sunday is also where the week's sponsored challenges get their moment.
  //
  // A brand buys four weeks and the show features each one in turn — that is
  // part of what the month costs, so it happens here rather than depending on
  // anyone remembering. Named plainly, with the podium, because a sponsor
  // mentioned without a result is an ad and a sponsor mentioned with one is
  // news.
  const sponsored = await sponsoredThisWeek();

  const content = [
    `👑 **Profile of the Week — ${weekKey}**`,
    lines.join("\n"),
    sponsored,
    trophy
      ? `Each of them has been handed the **${trophy.name}**${trophy.value > 0 ? ` (worth $${Math.round(trophy.value).toLocaleString()})` : ""} — it's in their trophy case now, and it can be redeemed for real value.`
      : "Their placements are on their profiles.",
    // Discord renders `<t:unix:D>` in each reader's own timezone, which is the
    // only way to say "Monday" to a server spread across the world and be right.
    week
      ? `Voting reopens <t:${Math.floor(week.endsAt.getTime() / 1000)}:R> and everyone starts at zero. Link a game, make your profile yours, and you're in.`
      : "Voting reopens Monday and everyone starts at zero. Link a game, make your profile yours, and you're in.",
  ].filter(Boolean).join("\n\n");

  const stream = board.stream.url;

  for (const g of guilds) {
    if (!g.channelId) { out.skipped++; continue; }
    if (!opts.force && await alreadyPosted(g.guildId, postKey)) { out.skipped++; continue; }

    const res = await postMessage(g.channelId, withSponsorRow({
      content,
      embeds: [{
        color: embedColor(accent),
        image: { url },
        footer: { text: "Profile of the Week runs Monday to Saturday. Every Cluster profile is entered." },
      }],
      components: rows([
        ...podium.slice(0, 3).map((p, i) => linkButton(`${medals[i]} ${p.displayName}`.slice(0, 24), `${siteUrl()}/u/${p.slug}`)),
        stream ? linkButton("Watch the announcement", stream, "📺") : null,
        linkButton("Customize your profile", `${siteUrl()}/profile`, "✨"),
        navButton("Next week's board", frame("week"), [frame("home")], ButtonStyle.Success, "👑"),
      ]),
    }, ad, g.guildId));

    await record(g.guildId, postKey, weekKey, "result", g.channelId, res.ok ? res.data.id : null, res.ok);
    if (res.ok) out.posted++; else out.skipped++;
  }

  return out;
}

/**
 * The sponsored challenges that ran this week, for the Sunday show.
 *
 * A brand's month is four weeks and each one is featured in turn — the feature
 * is part of what they bought, so it is generated from the challenges that
 * actually ran rather than from a list somebody maintains. Returns an empty
 * string when nothing was sponsored, so the post simply doesn't mention it.
 */
async function sponsoredThisWeek(): Promise<string> {
  try {
    const db = await getDb();
    const since = new Date(Date.now() - 8 * 86400000);
    // B107. This used to INNER JOIN the lead brand, which made a co-sponsor
    // structurally impossible to name: the second brand paid half the bill and
    // could not appear in the one line on the platform that named a sponsor to
    // a gamer. Now it selects both ids and resolves them through
    // `presentersFor`, in ONE query for the whole list.
    //
    // The join is gone rather than widened. Joining twice would have dropped a
    // challenge whose co-sponsor row was deleted, which is the same class of
    // bug in a new place.
    const rows = await db.select({
      id: schema.challenges.id,
      title: schema.challenges.title,
      game: schema.challenges.game,
      sponsorBrandId: schema.challenges.sponsorBrandId,
      coSponsorBrandId: schema.challenges.coSponsorBrandId,
    }).from(schema.challenges)
      .where(and(
        sql`${schema.challenges.sponsorPrice} > 0`,
        sql`${schema.challenges.sponsorBrandId} IS NOT NULL`,
        sql`${schema.challenges.endAt} >= ${since}`,
        sql`${schema.challenges.startAt} <= now()`,
      ))
      .limit(3);
    if (!rows.length) return "";

    const presenters = await presentersFor(rows);
    const parts: string[] = [];
    for (const c of rows) {
      const names = (presenters.get(c.id) ?? []).map((p) => p.name);
      // A sponsored challenge whose brand rows have gone is still a real
      // challenge — it just loses the "sponsored by" clause rather than the
      // whole line.
      const by = names.length ? ` — sponsored by ${joinNames(names)}` : "";
      const top = await challengeStandings(c.id, 1);
      const leader = top[0];
      parts.push(leader
        ? `**${c.title}**${by}. ${leader.displayName} leads on ${c.game} with ${leader.points.toLocaleString()} points.`
        : `**${c.title}**${by}, running on ${c.game} right now.`);
    }
    return [`🏆 **This week's sponsored challenges**`, parts.join("\n")].join("\n");
  } catch { return ""; }
}
