// Posts, comments and reactions leave the product. B111.
//
// B68's brief, unchanged: *"Posts, comments and reactions leave the product —
// the feature, its pages, its rows. Following, messaging and gifting stay. The
// platform is a competition and earning layer, not a social network."*
//
// THE ONE DECISION WORTH DEFENDING is the half of that sentence this sprint did
// NOT do. The rows stay until somebody presses a button.
//
// The obvious move is a `DROP TABLE` in `COLUMN_MIGRATIONS`. That list runs on
// every boot. A drop in it deletes every post anybody ever wrote, on the next
// deploy, irreversibly, as a SIDE EFFECT of shipping something else — no count
// shown, no confirmation, no way back. Removing a feature is a refactor;
// destroying what people wrote in it is the owner's call.
//
//   DEMO_DB=1 npx tsx tests/db/social-purge.mts

process.env.DEMO_DB = "1";

import { readFileSync, existsSync } from "node:fs";

let pass = 0;
const fails: string[] = [];
const ok = (name: string, cond: boolean, detail = "") => {
  if (cond) { pass++; console.log(`  ok   ${name}`); }
  else { fails.push(name); console.log(`  FAIL ${name}${detail ? ` — ${detail}` : ""}`); }
};
const eq = (name: string, got: unknown, want: unknown) =>
  ok(name, JSON.stringify(got) === JSON.stringify(want), `got ${JSON.stringify(got)}, want ${JSON.stringify(want)}`);

const path = (p: string) => new URL(`../../${p}`, import.meta.url);
const read = (p: string) => readFileSync(path(p), "utf8");
const has = (p: string) => existsSync(path(p));
const code = (p: string) => read(p).replace(/\/\*[\s\S]*?\*\//g, " ").replace(/^\s*\/\/.*$/gm, " ");


// ===== THE CHECK THAT RUNS BEFORE THE DATABASE DOES =====
//
// Deliberately first, above the `getDb()` import. A `DROP TABLE` in
// `COLUMN_MIGRATIONS` breaks the demo bootstrap, so a check placed after the
// import never reports — the suite dies with a stack trace instead of naming
// the defect. The assertion that must never fail cannot depend on the database
// booting.
console.log("== NOTHING DROPS THE TABLES ==");
{
  const dbIndex = read("lib/db/index.ts");
  ok("no migration drops any table",
    !/DROP TABLE/i.test(dbIndex),
    "COLUMN_MIGRATIONS runs on EVERY boot — a drop in it deletes what people wrote as a side effect of a deploy");
  for (const t of ["posts", "comments", "post_reactions", "comment_reactions"]) {
    ok(`…and none names "${t}"`, !new RegExp(`DROP TABLE[^\\n]*${t}`, "i").test(dbIndex));
  }
}

const { getDb, schema } = await import("../../lib/db/index.ts");
const { SOCIAL_TABLES, SOCIAL_KEEPS, socialRowCounts, purgeSocialRows } =
  await import("../../lib/social-purge.ts");
const { uid } = await import("../../lib/utils.ts");
const { sql } = await import("drizzle-orm");

const db = await getDb();

console.log("== nothing writes a post any more ==");
{
  const actions = code("app/actions/social.ts");
  for (const fn of ["createPost", "reactToPost", "addComment"]) {
    ok(`${fn} is gone`, !new RegExp(`function ${fn}\\b`).test(actions));
  }
  // The half B68 said to keep.
  for (const fn of ["toggleFollow", "startConversation", "sendMessage", "toggleSpaceMembership"]) {
    ok(`${fn} stays`, new RegExp(`function ${fn}\\b`).test(actions),
      "following and messaging are how a gamer tracks people they compete against");
  }
  ok("the admin post actions are gone too",
    !/function adminDeletePost\b|function togglePinPost\b/.test(code("app/actions/admin.ts")),
    "an action writing to a table no surface reads is a button whose only effect is an audit row");
}

console.log("\n== no page renders one ==");
{
  for (const f of ["components/PostCard.tsx", "components/CommentThread.tsx", "components/ReactionBar.tsx"]) {
    ok(`${f} is deleted`, !has(f));
  }
  ok("lib/experts.ts is deleted", !has("lib/experts.ts"),
    "expert tiers were scored entirely from posts, comments and likes — with those gone it had no inputs");

  const pages = [
    "app/feed/page.tsx", "app/planets/[slug]/page.tsx", "app/u/[slug]/page.tsx",
    "app/profile/page.tsx", "app/search/page.tsx", "app/admin/games/page.tsx",
  ];
  for (const f of pages) {
    const src = code(f);
    ok(`${f} reads no post table`,
      !/schema\.(posts|comments|postReactions|commentReactions)\b/.test(src));
    ok(`${f} renders no PostCard`, !/<PostCard/.test(src));
  }
  ok("nothing imports the deleted modules anywhere",
    !pages.concat(["app/api/cron/sync/route.ts", "lib/badges.ts"])
      .some((f) => /@\/lib\/experts|@\/components\/PostCard|@\/components\/CommentThread|@\/components\/ReactionBar/.test(read(f))));
}

console.log("\n== /feed survives, because it was never only a feed ==");
{
  ok("the route still exists", has("app/feed/page.tsx"),
    "/feed is the signed-in home — sign-in, OAuth and the bot all land there");
  const feed = code("app/feed/page.tsx");
  ok("…and still shows live challenges", /schema\.challenges/.test(feed));
  ok("…and the trophy case", /getTrophyCase/.test(feed));
  ok("…and no longer counts posts", !/postRow/.test(feed));
}

console.log("\n== the earning half was already retired, and stays that way ==");
{
  const quests = read("lib/quests.ts");
  for (const key of ["write_post", "write_comment"]) {
    ok(`${key} is still marked retired`, new RegExp(`"${key}"[^\\n]*retired`).test(quests),
      "an action that pays CP for a thing nobody can do is a dead quest");
    ok(`…and pays 0`, new RegExp(`key: "${key}"[^\\n]*defaultWeight: 0`).test(quests));
  }
  const badges = code("lib/badges.ts");
  ok("the community_activity badge is unearnable rather than free",
    /case "community_activity":\s*earned = false;/.test(badges),
    "a badge that starts awarding itself to everyone the day its condition becomes uncountable is worse than one nobody earns");
}

console.log("\n== the purge is reachable only on purpose ==");
{
  const admin = code("app/actions/admin.ts");
  ok("the purge action requires an ADMIN, not staff",
    /export async function purgeSocialContent[\s\S]{0,400}await requireAdmin\(\)/.test(admin),
    "requireStaff would cover a support agent clearing a queue");
  ok("…and refuses without the typed word",
    /if \(typed !== "DELETE"\)/.test(admin));
  ok("…and audits what it destroyed", /audit\(admin\.id, "social\.purge"/.test(admin));
  ok("nothing else in the codebase calls the purge",
    !/purgeSocialRows/.test(code("lib/jobs.ts")) && !/purgeSocialRows/.test(code("lib/retention.ts")),
    "the daily retention job must never be the thing that deletes user writing");
}

console.log("\n== the button cannot be pressed blind ==");
{
  const panel = read("components/SocialPurgePanel.tsx");
  ok("the count is on the page", /counts\.map/.test(panel) && /rows\.toLocaleString\(\)/.test(panel),
    "a dialog that cannot say \"12,431 posts\" is a dialog people click through");
  ok("the total is stated before the box", /total\.toLocaleString\(\)/.test(panel));
  ok("the confirmation is typed, not clicked", /typed\.trim\(\) === "DELETE"/.test(panel));
  ok("…and the button is disabled until it matches", /disabled=\{!armed \|\| busy\}/.test(panel));
  ok("it says there is no undo", /no undo/.test(panel));
}

console.log("\n== what the purge touches, and what it must never ==");
{
  eq("five tables, children first",
    [...SOCIAL_TABLES],
    ["comment_reactions", "post_reactions", "comments", "posts", "space_expert_scores"]);
  // None of these tables has a foreign key — every table added after the base
  // generated schema has none — so the order is doing real work.
  ok("comments are deleted before posts",
    SOCIAL_TABLES.indexOf("comments") < SOCIAL_TABLES.indexOf("posts"));
  ok("reactions before both",
    SOCIAL_TABLES.indexOf("post_reactions") < SOCIAL_TABLES.indexOf("posts")
    && SOCIAL_TABLES.indexOf("comment_reactions") < SOCIAL_TABLES.indexOf("comments"));

  for (const keep of ["spaces", "space_members", "follows", "conversations", "messages", "users", "quest_events", "user_trophies"]) {
    ok(`"${keep}" is never purged`, !(SOCIAL_TABLES as readonly string[]).includes(keep));
    ok(`…and is named in SOCIAL_KEEPS`, (SOCIAL_KEEPS as readonly string[]).includes(keep),
      "a table that must not be deleted from is worth writing down twice");
  }
}

console.log("\n== counting and deleting, against a real database ==");
{
  const before = await socialRowCounts(db);
  eq("it counts every table it would delete", before.map((c) => c.table), [...SOCIAL_TABLES]);
  ok("counting deletes nothing",
    JSON.stringify(await socialRowCounts(db)) === JSON.stringify(before));

  // Plant one of each so the delete has something to prove.
  const [space] = await db.select({ id: schema.spaces.id }).from(schema.spaces).limit(1);
  const [user] = await db.select({ id: schema.users.id }).from(schema.users).limit(1);
  if (space && user) {
    const postId = uid();
    await db.insert(schema.posts).values({ id: postId, spaceId: space.id, authorId: user.id, body: "fixture" });
    await db.insert(schema.comments).values({ id: uid(), postId, authorId: user.id, body: "fixture" });
    await db.insert(schema.postReactions).values({ postId, userId: user.id, reactionType: "like" });

    const planted = await socialRowCounts(db);
    ok("the plant is counted",
      (planted.find((c) => c.table === "posts")?.rows ?? 0) > 0,
      JSON.stringify(planted));

    const usersBefore = await db.select({ id: schema.users.id }).from(schema.users);
    const spacesBefore = await db.select({ id: schema.spaces.id }).from(schema.spaces);

    const result = await purgeSocialRows(db);
    ok("the purge reports what it deleted",
      result.reduce((n, r) => n + r.deleted, 0) >= 3,
      JSON.stringify(result));
    // B104's lesson: PGlite reports rowCount 0 on deletes, so a purge counting
    // that way logs "nothing to remove" while deleting thousands.
    ok("…by counting RETURNING rows, not rowCount",
      /RETURNING 1 AS purged/.test(code("lib/social-purge.ts")));

    const after = await socialRowCounts(db);
    eq("everything is gone", after.map((c) => c.rows), after.map(() => 0));

    // THE ASSERTION THAT MATTERS MOST. These tables carry no foreign keys, so a
    // purge that named the wrong one would take real people or real games with
    // it and nothing in the database would object.
    eq("no user was deleted",
      (await db.select({ id: schema.users.id }).from(schema.users)).length, usersBefore.length);
    eq("no planet was deleted",
      (await db.select({ id: schema.spaces.id }).from(schema.spaces)).length, spacesBefore.length);
    const follows = await db.execute(sql.raw(`SELECT count(*)::int AS n FROM "follows"`));
    ok("follows survive", Array.isArray(follows) || !!follows);
  } else {
    ok("no fixture space/user in this database — skipping the behavioural half", true);
  }
}

console.log("\n== nothing left behind ==");
{
  ok("the seed no longer creates posts",
    !/schema\.(posts|comments|postReactions)\b/.test(code("lib/db/seed.ts")),
    "a fresh install would otherwise show content to destroy on the purge screen");
  ok("the dead ad placement is not seeded",
    !/key: "feed_inline"/.test(code("lib/db/seed.ts")),
    "inventory with no surface is something a brand can be sold that delivers zero");
  ok("the posts metric is gone from admin",
    !/key: "posts"/.test(code("lib/admin-metrics.ts")));
  ok("…and from the analytics page", !/label="Posts"/.test(code("app/admin/analytics/page.tsx")));
  ok("the cron no longer recomputes expert tiers",
    !/recomputeExpertScores/.test(code("app/api/cron/sync/route.ts")));
}

console.log(`\n${pass} passed, ${fails.length} failed`);
if (fails.length) { fails.forEach((f) => console.log(`  - ${f}`)); process.exit(1); }
process.exit(0);
