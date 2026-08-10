// The tables and columns this platform no longer has. B116.
//
// ===== WHY THIS IS A MIGRATION AND NOT A BUTTON =====
//
// B111 removed posts, comments and reactions from the product and deliberately
// LEFT THE ROWS, behind an admin button that showed a count first. The reason
// was sound at the time: a `DROP TABLE` that runs on every boot destroys what
// people wrote as a side effect of shipping something unrelated, with no
// confirmation and no way back. That is the owner's call, not a refactor.
//
// The owner has now made it, and the count that button was built to show turns
// out to be **zero** — every one of these tables is empty in production. There
// was never a post or a comment on this platform that a person wrote. So the
// button was guarding nothing, and keeping it meant keeping five tables, a
// panel, a lib and a suite alive to protect data that does not exist.
//
// The same call covers the badge system. Badges were the pre-pivot achievement
// shelf: twelve rows defining rules like "20 posts with 50 likes received" and
// "earn Expert tier in a Space" — criteria that count things this platform
// stopped having. Awarding was already switched off, so the tables held twelve
// definitions nobody could earn and two grants nobody could see.
//
// ===== WHAT REPLACED THEM, SO NOBODY LOOKS FOR A GAP =====
//
// Nothing needs to. Quests and Cluster Points are the progression system, and
// trophies are the award — a trophy carries a dollar value and can be redeemed
// for money, which is the whole point of playing here. A badge was a picture.
//
// ===== THE ONE THING THAT MAKES THIS SAFE TO RUN ON EVERY BOOT =====
//
// `DROP TABLE IF EXISTS` and `DROP COLUMN IF EXISTS` are no-ops the second time
// and every time after. The statements below join `COLUMN_MIGRATIONS`, which
// runs on connect, so the live database converges on this shape by deploying
// and a fresh demo database never creates them in the first place.

/**
 * Dropped whole. In child-before-parent order: each table's foreign keys go
 * with it, so dropping the referencing table first means no `CASCADE` and no
 * chance of taking something unlisted down with it.
 */
export const DROPPED_TABLES = [
  "comment_reactions",
  "post_reactions",
  "comments",
  "posts",
  "space_expert_scores",
  "user_badges",
  "badges",
] as const;

/**
 * Columns that existed only to serve a dropped table.
 *
 * `spaces.post_count` counted posts. `spaces.expert_thresholds` configured the
 * tiers in `space_expert_scores`. Neither has an input any more, so leaving
 * them would leave two numbers on every planet that can never change again and
 * that a future reader would reasonably believe mean something.
 */
export const DROPPED_COLUMNS = [
  { table: "spaces", column: "post_count" },
  { table: "spaces", column: "expert_thresholds" },
] as const;

/**
 * Kept, and named here so a test can assert the drop did not creep.
 *
 * A planet is a game's page and its membership is how a gamer says which games
 * they play — neither was ever a social feature. Following and messaging are
 * how you keep track of the people you compete against.
 */
export const LEGACY_DROP_KEEPS = [
  "spaces", "space_members", "space_requests", "follows", "conversations",
  "messages", "users", "trophies", "user_trophies", "quest_events",
] as const;

/**
 * Notifications that survived their own feature.
 *
 * A notification is a link plus a sentence. When the thing it links to stops
 * existing, the row becomes a message in a gamer's bell that tells them they
 * earned something the product no longer has, pointing at a page that will not
 * show it. Two kinds are in that state:
 *
 *   - `Badge earned: …` — from the shelf this file deletes. TWO rows live.
 *   - `trophy_gift` — from gifting, deleted in B72.3. ONE row live.
 *
 * Matched narrowly ON PURPOSE. `type = 'badge'` also covers "Bronze unlocked in
 * Signal!", which is the LIVE quest tier system writing under the same type
 * string — 23 of the 25 rows. Deleting by type alone would take those with it.
 */
export const LEGACY_NOTIFICATION_DELETES = [
  `DELETE FROM "notifications" WHERE "type" = 'badge' AND "title" LIKE 'Badge earned: %'`,
  `DELETE FROM "notifications" WHERE "type" = 'trophy_gift'`,
];

/** The statements themselves, appended to `COLUMN_MIGRATIONS`. */
export const LEGACY_DROP_STATEMENTS: string[] = [
  ...DROPPED_TABLES.map((t) => `DROP TABLE IF EXISTS "${t}"`),
  ...DROPPED_COLUMNS.map(({ table, column }) => `ALTER TABLE "${table}" DROP COLUMN IF EXISTS "${column}"`),
  ...LEGACY_NOTIFICATION_DELETES,
];
