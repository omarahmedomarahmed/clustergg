import { closeExpiredChallenges } from "@/lib/challenges";
import { remindLiveChallenges } from "@/lib/discord/announce";
import { postAdsToGuilds } from "@/lib/discord/ads";
import { postLeaderboardUpdates } from "@/lib/discord/leaderboard-feed";
import { postWeekUpdate } from "@/lib/discord/week-feed";
import { postBotListStats } from "@/lib/botlist-post";

// Everything periodic, as named jobs.
//
// Vercel's Hobby plan allows two cron entries and only a DAILY schedule, so we
// don't get one cron per job. Instead one daily cron runs this list, and every
// job is also a button in Mission Control — which is better anyway: staff can
// run a job the moment they need it instead of waiting for tomorrow.
//
// Each job must be safe to run repeatedly. Closing challenges is idempotent,
// and ad posting has its own per-server interval.

export type JobKey = "challenges" | "challenge-reminders" | "discord-ads" | "leaderboard-feed" | "week-update" | "botlist-stats" | "guild-snapshots" | "week-close";

export type JobResult = { key: JobKey; ok: boolean; summary: string };

/**
 * How often a job wants to run.
 *
 * `hourly` jobs keep the product current — standings move, a finished
 * challenge stops saying "live". `daily` jobs SPEAK: they post into servers,
 * and posting hourly is how a bot gets muted. The split is the whole reason
 * this field exists, so a faster cron can never accidentally turn a once-a-day
 * announcement into an every-hour one.
 */
export type JobCadence = "hourly" | "daily";

/**
 * The day a weekly job wants. 1 = Monday, UTC. C16.
 *
 * `vercel.json` has no weekly cron, so a weekly job runs on the DAILY one
 * behind this check — the same answer B86 reached for the snapshots. Every
 * weekly job must be idempotent anyway, because a human can run it from
 * Mission Control on any day, and this is a scheduling preference rather than
 * a lock.
 */
export const WEEKLY_DAY = 1;

export const JOBS: { key: JobKey; label: string; description: string; cadence: JobCadence; weeklyOn?: number }[] = [
  {
    // C16. The model is weekly and nothing weekly existed — the pool, the
    // scores and the payouts had no scheduler at all.
    key: "week-close", cadence: "daily", weeklyOn: WEEKLY_DAY,
    label: "Close last week and divide the server pool",
    description: "Scores every server that carried an entrant last week, cuts the server pool between them, and opens a DRAFT payout for each. Money only leaves when a human releases it. Closes the week by its Monday, so a missed run is caught by the next day rather than lost.",
  },
  {
    // B86. Daily cadence for a weekly row, on purpose: `vercel.json` has no
    // weekly schedule, and a job that writes the same row seven times is safer
    // than a cadence nobody has ever watched run.
    key: "guild-snapshots", cadence: "daily",
    label: "Snapshot every server's week",
    description: "Records each server's member count and qualified linked members against this week. The server pool scores on how these CHANGE, and none of it was being written down — a week not captured cannot be reconstructed.",
  },
  {
    key: "challenges", cadence: "hourly",
    label: "End finished challenges",
    description: "Freezes final standings, marks challenges completed and awards the podium trophies for anything past its end date.",
  },
  {
    key: "challenge-reminders", cadence: "daily",
    label: "Remind every server what's still running",
    description: "One post per live challenge saying how long is left. Skips anything launched in the last day (it was already announced) and keeps private challenges inside the servers that own them.",
  },
  {
    key: "discord-ads", cadence: "daily",
    label: "Post Discord ads",
    description: "Posts one ad into each server that has crossed the unlock threshold and is opted in. Respects the per-server interval, so running it early is safe.",
  },
  {
    key: "week-update", cadence: "daily",
    label: "Post the Profile of the Week update",
    description: "Posts the weekly vote standings — placements, days left and the way in — into every server running the bot. One post per server per day, so running it early or twice is safe.",
  },
  {
    key: "botlist-stats", cadence: "daily",
    label: "Post our server count to the bot lists",
    description: "Tells every bot list we hold a key for how many servers the bot is in. Server count is a ranking signal on all of them, and a stale one argues against installing us. Lists with no key are skipped, not failed.",
  },
  {
    key: "leaderboard-feed", cadence: "daily",
    label: "Post leaderboard updates to HQ",
    description: "Walks EVERY active leaderboard — not one per game — and posts its current top five into that game's feed channel in our server.",
  },
];

export async function runJob(key: JobKey): Promise<JobResult> {
  try {
    switch (key) {
      case "challenges": {
        const r = await closeExpiredChallenges();
        return { key, ok: true, summary: r.closed ? `Ended ${r.closed} challenge${r.closed === 1 ? "" : "s"} and awarded their trophies.` : "No challenges were due to end." };
      }
      case "challenge-reminders": {
        const r = await remindLiveChallenges();
        return {
          key, ok: true,
          summary: r.sent
            ? `Reminded ${r.sent} challenge${r.sent === 1 ? "" : "s"}${r.skipped ? ` · ${r.skipped} skipped` : ""}.`
            : r.skipped
              ? `Nothing to remind — ${r.skipped} skipped (just launched, or not running).`
              : "No challenge is running.",
        };
      }
      case "discord-ads": {
        const r = await postAdsToGuilds();
        return { key, ok: true, summary: `${r.posted} posted · ${r.skipped} skipped · ${r.considered} eligible server${r.considered === 1 ? "" : "s"}.` };
      }
      case "week-update": {
        const r = await postWeekUpdate();
        return {
          key, ok: true,
          summary: r.posted
            ? `Posted into ${r.posted} server${r.posted === 1 ? "" : "s"} · ${r.skipped} already had today's.`
            : r.considered
              ? `Every one of the ${r.considered} server${r.considered === 1 ? "" : "s"} already had today's update.`
              : "No server has the bot with announcements on yet.",
        };
      }
      case "guild-snapshots": {
        const { captureGuildSnapshots } = await import("@/lib/guild-snapshot");
        const r = await captureGuildSnapshots();
        return {
          key, ok: true,
          summary: `week of ${r.week}: ${r.written} of ${r.guilds} server${r.guilds === 1 ? "" : "s"} recorded.`,
        };
      }
      case "week-close": {
        const { closeWeek } = await import("@/lib/week-close");
        const r = await closeWeek();
        return { key, ok: true, summary: r.summary };
      }
      case "botlist-stats": {
        const r = await postBotListStats();
        return {
          key, ok: r.failed === 0,
          summary: `${r.guilds} server${r.guilds === 1 ? "" : "s"} → ${r.posted} list${r.posted === 1 ? "" : "s"} updated`
            + (r.failed ? `, ${r.failed} failed: ${r.results.filter((x) => !x.ok && !x.skipped).map((x) => `${x.name} (${x.detail})`).join("; ").slice(0, 200)}` : "")
            + (r.skipped ? `, ${r.skipped} not set up yet` : "") + ".",
        };
      }
      case "leaderboard-feed": {
        const r = await postLeaderboardUpdates();
        return {
          key, ok: true,
          summary: r.posted
            ? `Posted ${r.posted} board${r.posted === 1 ? "" : "s"} across ${new Set(r.boards.map((b) => b.game)).size} game${new Set(r.boards.map((b) => b.game)).size === 1 ? "" : "s"}.`
            : "No active leaderboard had anyone on it yet.",
        };
      }
    }
  } catch (e) {
    return { key, ok: false, summary: String(e).slice(0, 200) };
  }
}

/**
 * Run every job of one cadence, or all of them when none is named.
 *
 * `weeklyOn` jobs are skipped on the other six days when this is called by a
 * CRON. A human pressing the button in Mission Control passes `force` and gets
 * the job whatever day it is — the day check is a schedule, not a permission,
 * and a weekly job that cannot be run on a Thursday is a weekly job nobody can
 * re-run after fixing whatever broke it on Monday.
 */
export async function runAllJobs(cadence?: JobCadence, opts: { force?: boolean; now?: Date } = {}): Promise<JobResult[]> {
  const out: JobResult[] = [];
  const dow = (opts.now ?? new Date()).getUTCDay();
  for (const j of JOBS) {
    if (cadence && j.cadence !== cadence) continue;
    if (!opts.force && j.weeklyOn !== undefined && dow !== j.weeklyOn) {
      out.push({ key: j.key, ok: true, summary: `Skipped — runs on day ${j.weeklyOn} (UTC), today is ${dow}.` });
      continue;
    }
    out.push(await runJob(j.key));
  }
  return out;
}
