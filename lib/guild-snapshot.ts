// One row per guild per week. B86.
//
// WHY THIS RUNS BEFORE ANYTHING THAT USES IT: the server pool scores on how a
// server CHANGED — newly qualified members this week — and none of that was
// being written down anywhere. `discordGuilds.memberCount` is a single current
// integer that Discord overwrites, so there was no "last week" to compare
// against and the model's growth term could not be computed at all.
//
// Unlike every other item in the plan, this one has a deadline that has already
// started running. A defect can be fixed next month and be just as fixed. A
// week of history that was never captured is gone.
//
// It runs on the DAILY cron behind an idempotent unique index rather than on a
// weekly one, because `vercel.json` has no weekly schedule — and adding a
// cadence nobody tests is a worse answer than a daily job that writes the same
// row all week. Running it seven times a week produces exactly one row.

import { getDb, schema } from "@/lib/db";
import { uid } from "@/lib/utils";
import { linkedCounts } from "@/lib/abuse";

/** The Monday 00:00 UTC of the week a date falls in. */
export function weekStartOf(d = new Date()): Date {
  const x = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
  // getUTCDay: 0 = Sunday. Monday-based weeks, so Sunday belongs to the week before.
  const dow = (x.getUTCDay() + 6) % 7;
  x.setUTCDate(x.getUTCDate() - dow);
  return x;
}

export type SnapshotResult = { week: string; guilds: number; written: number };

/**
 * Capture this week's row for every guild the bot is in.
 *
 * Idempotent by construction: the unique index on (guild, week) plus
 * `onConflictDoUpdate` means today's run overwrites today's numbers rather than
 * adding a second row. A week therefore records its LAST observation, which is
 * the right choice — a snapshot taken on Monday and never revised would miss
 * everything that happened in the week it is supposed to describe.
 */
export async function captureGuildSnapshots(now = new Date()): Promise<SnapshotResult> {
  const db = await getDb();
  const week = weekStartOf(now);

  const guilds = await db.select({
    guildId: schema.discordGuilds.guildId,
    memberCount: schema.discordGuilds.memberCount,
  }).from(schema.discordGuilds);
  if (!guilds.length) return { week: week.toISOString().slice(0, 10), guilds: 0, written: 0 };

  // ONE query for every guild, and it is `lib/abuse.ts`'s own function rather
  // than a second count written here. The qualification rule is shown to owners
  // as prose (`QUALIFY_RULE`) and used to decide tiers; a second implementation
  // of it in this file would drift from the one they were shown, and the first
  // anybody would know is an owner arguing about a payout.
  const counts = await linkedCounts(db, guilds.map((g) => g.guildId));

  let written = 0;
  for (const g of guilds) {
    const c = counts.get(g.guildId) ?? { raw: 0, qualified: 0 };
    const row = {
      memberCount: Number(g.memberCount ?? 0),
      linked: c.raw,
      qualifiedLinked: c.qualified,
    };
    await db.insert(schema.guildSnapshots)
      .values({ id: uid(), guildId: g.guildId, weekStart: week, ...row })
      .onConflictDoUpdate({
        target: [schema.guildSnapshots.guildId, schema.guildSnapshots.weekStart],
        set: row,
      });
    written++;
  }

  return { week: week.toISOString().slice(0, 10), guilds: guilds.length, written };
}
