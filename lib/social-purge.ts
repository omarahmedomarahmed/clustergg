import { sql } from "drizzle-orm";
import type { DB } from "@/lib/db";

// The rows the social purge does NOT delete on its own. B111.
//
// ===== WHY THIS IS A BUTTON AND NOT A MIGRATION =====
//
// B111 removed posts, comments and reactions from the product: the composer,
// the feed, the planet community tab, the moderation queue, the search column,
// the expert tiers scored from them, and every action that wrote one.
//
// It did NOT delete the rows, and that is a decision rather than an oversight.
//
// The obvious move is a `DROP TABLE` in `COLUMN_MIGRATIONS`. That list runs on
// every boot. A drop in it would delete every post anybody ever wrote, on the
// next deploy, irreversibly, as a SIDE EFFECT of shipping something else —
// with no confirmation, no count shown first, and no way back. This is
// user-authored content on a live product. Removing a feature is a refactor;
// destroying what people wrote in it is the owner's call, and it should look
// like a decision at the moment it is taken.
//
// So: the reader is gone today, and the rows wait for somebody to press a
// button that tells them how many they are about to destroy.
//
// ===== WHAT IS AND IS NOT HERE =====
//
// Four tables, and only these four. `spaces` and `space_members` STAY — a
// planet is a game's page and its membership is how a gamer says which games
// they play, neither of which was ever a social feature. `follows`,
// `conversations` and `messages` stay for the same reason: following and
// messaging are how you keep track of people you compete against, and B68 said
// so explicitly.
//
// `space_expert_scores` IS here, because it is nothing but a cache of a number
// computed from posts and likes. With the inputs gone it is a table of stale
// scores nobody can recompute.

/**
 * In deletion order — children before parents, since none of these carry a
 * foreign key that would cascade for us. Every table added after the base
 * generated schema has no FKs at all (see `lib/account-deletion.ts`, which
 * exists because of exactly that), so the order here is doing real work rather
 * than being tidy.
 */
export const SOCIAL_TABLES = [
  "comment_reactions",
  "post_reactions",
  "comments",
  "posts",
  "space_expert_scores",
] as const;

/** Never touched by this purge, listed by name so the test can assert it. */
export const SOCIAL_KEEPS = [
  "spaces", "space_members", "follows", "conversations", "messages",
  "users", "quest_events", "user_trophies",
] as const;

export type SocialCounts = { table: string; rows: number }[];

/**
 * How much is there, so nobody presses the button blind.
 *
 * Counts rather than deletes. A confirmation dialog that cannot say "12,431
 * posts" is a confirmation dialog that gets clicked through.
 */
export async function socialRowCounts(db: DB): Promise<SocialCounts> {
  const out: SocialCounts = [];
  for (const table of SOCIAL_TABLES) {
    try {
      const res = await db.execute(sql.raw(`SELECT count(*)::int AS n FROM "${table}"`));
      const rows = (Array.isArray(res) ? res : ((res as { rows?: unknown[] })?.rows ?? [])) as { n?: number }[];
      out.push({ table, rows: Number(rows[0]?.n ?? 0) });
    } catch {
      // A table that does not exist counts as nothing rather than failing the
      // whole page — a fresh install has never had one.
      out.push({ table, rows: 0 });
    }
  }
  return out;
}

export type PurgeResult = { table: string; deleted: number }[];

/**
 * Delete them. Only ever from an explicit admin action.
 *
 * Per-table and independent: one table failing must not leave the others
 * untouched, because a half-purge that reports failure is the state hardest to
 * reason about afterwards.
 */
export async function purgeSocialRows(db: DB): Promise<PurgeResult> {
  const out: PurgeResult = [];
  for (const table of SOCIAL_TABLES) {
    try {
      // `RETURNING` and count the rows, not `rowCount` — B104 found that PGlite
      // reports 0 there, which would make this log "nothing to remove" while
      // deleting thousands.
      const res = await db.execute(sql.raw(`DELETE FROM "${table}" RETURNING 1 AS purged`));
      const rows = (Array.isArray(res) ? res : ((res as { rows?: unknown[] })?.rows ?? [])) as unknown[];
      out.push({ table, deleted: rows.length });
    } catch {
      out.push({ table, deleted: 0 });
    }
  }
  return out;
}
