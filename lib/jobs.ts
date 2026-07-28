import { closeExpiredChallenges } from "@/lib/challenges";
import { postAdsToGuilds } from "@/lib/discord/ads";
import { postLeaderboardUpdates } from "@/lib/discord/leaderboard-feed";
import { postWeekUpdate } from "@/lib/discord/week-feed";

// Everything periodic, as named jobs.
//
// Vercel's Hobby plan allows two cron entries and only a DAILY schedule, so we
// don't get one cron per job. Instead one daily cron runs this list, and every
// job is also a button in Mission Control — which is better anyway: staff can
// run a job the moment they need it instead of waiting for tomorrow.
//
// Each job must be safe to run repeatedly. Closing challenges is idempotent,
// and ad posting has its own per-server interval.

export type JobKey = "challenges" | "discord-ads" | "leaderboard-feed" | "week-update";

export type JobResult = { key: JobKey; ok: boolean; summary: string };

export const JOBS: { key: JobKey; label: string; description: string }[] = [
  {
    key: "challenges",
    label: "End finished challenges",
    description: "Freezes final standings, marks challenges completed and awards the podium trophies for anything past its end date.",
  },
  {
    key: "discord-ads",
    label: "Post Discord ads",
    description: "Posts one ad into each server that has crossed the unlock threshold and is opted in. Respects the per-server interval, so running it early is safe.",
  },
  {
    key: "week-update",
    label: "Post the Profile of the Week update",
    description: "Posts the weekly vote standings — placements, days left and the way in — into every server running the bot. One post per server per day, so running it early or twice is safe.",
  },
  {
    key: "leaderboard-feed",
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

export async function runAllJobs(): Promise<JobResult[]> {
  const out: JobResult[] = [];
  for (const j of JOBS) out.push(await runJob(j.key));
  return out;
}
