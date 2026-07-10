import { eq, sql } from "drizzle-orm";
import type { DB } from "@/lib/db";
import { schema } from "@/lib/db";
import { evaluateBadgesForUser } from "@/lib/badges";

// Space Expert scoring: points from posts (5), comments (2), likes received (1)
// in each space; tier thresholds are configured per space.
export async function recomputeExpertScores(db: DB, spaceId?: string) {
  const spaces = spaceId
    ? await db.select().from(schema.spaces).where(eq(schema.spaces.id, spaceId))
    : await db.select().from(schema.spaces);

  for (const space of spaces) {
    const rows = await db.execute(sql`
      SELECT u.id AS user_id,
        COALESCE(p.post_count, 0) * 5 + COALESCE(c.comment_count, 0) * 2 + COALESCE(r.likes, 0) AS points
      FROM users u
      LEFT JOIN (
        SELECT author_id, COUNT(*) AS post_count FROM posts
        WHERE space_id = ${space.id} AND deleted_at IS NULL GROUP BY author_id
      ) p ON p.author_id = u.id
      LEFT JOIN (
        SELECT c.author_id, COUNT(*) AS comment_count FROM comments c
        JOIN posts po ON po.id = c.post_id
        WHERE po.space_id = ${space.id} AND c.deleted_at IS NULL GROUP BY c.author_id
      ) c ON c.author_id = u.id
      LEFT JOIN (
        SELECT po.author_id, COUNT(*) AS likes FROM post_reactions pr
        JOIN posts po ON po.id = pr.post_id
        WHERE po.space_id = ${space.id} AND pr.reaction_type = 'like' GROUP BY po.author_id
      ) r ON r.author_id = u.id
      WHERE COALESCE(p.post_count, 0) + COALESCE(c.comment_count, 0) > 0
    `);
    const t = space.expertThresholds;
    const list = (rows as unknown as { rows?: { user_id: string; points: number | string }[] }).rows
      ?? (rows as unknown as { user_id: string; points: number | string }[]);
    for (const row of Array.isArray(list) ? list : []) {
      const points = Number(row.points);
      const tier = points >= t.expert ? "expert" : points >= t.helper ? "helper" : points >= t.contributor ? "contributor" : null;
      await db.insert(schema.spaceExpertScores)
        .values({ spaceId: space.id, userId: row.user_id, points, tier, computedAt: new Date() })
        .onConflictDoUpdate({
          target: [schema.spaceExpertScores.spaceId, schema.spaceExpertScores.userId],
          set: { points, tier, computedAt: new Date() },
        });
      if (tier) { try { await evaluateBadgesForUser(db, row.user_id); } catch { /* non-fatal */ } }
    }
  }
}
