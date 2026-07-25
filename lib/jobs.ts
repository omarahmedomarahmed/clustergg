import { closeExpiredChallenges } from "@/lib/challenges";
import { postAdsToGuilds } from "@/lib/discord/ads";

// Everything periodic, as named jobs.
//
// Vercel's Hobby plan allows two cron entries and only a DAILY schedule, so we
// don't get one cron per job. Instead one daily cron runs this list, and every
// job is also a button in Mission Control — which is better anyway: staff can
// run a job the moment they need it instead of waiting for tomorrow.
//
// Each job must be safe to run repeatedly. Closing challenges is idempotent,
// and ad posting has its own per-server interval.

export type JobKey = "challenges" | "discord-ads";

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
    description: "Posts one ad into each server that has unlocked revenue share and is opted in. Respects the per-server interval, so running it early is safe.",
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
