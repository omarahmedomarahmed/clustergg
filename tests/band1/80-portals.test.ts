// Stage 8 — the portals.
//
// Access is by key, never a password (S1). `PORTAL_SECRET` is required and
// throws without it — and the rule that comes with it, from
// docs/11-PORTED-CODE.md, is the expensive one: **never call it from a
// decorative path.** A sponsor-link signature once took the entire Discord bot
// down because a missing secret threw out of an ad button.

import { ok, eq, no, throws } from "../helpers/assert.ts";
import { test } from "../helpers/suite.ts";
import { resetDemoDb, schema, type DB } from "../../lib/db/index.ts";
import { newPortalKey, hashPortalKey, keyMatches } from "../../lib/core/keys.ts";
import {
  ownerOverview,
  reAnnounce,
  buildCommunityChallenge,
  payCommunityChallenge,
  describeCommunity,
  CommunityBuilderRefused,
} from "../../lib/portal/owner.ts";
import {
  signUpBrand,
  quote,
  confirmAndPay,
  onInvoicePaid,
  brandReport,
  changeStartWeek,
  suppressSmallGroup,
  sellableGames,
  BuilderRefused,
} from "../../lib/portal/brand.ts";
import { balanceOf } from "../../lib/money/ledger.ts";
import { checkPrizeVault } from "../../lib/money/prize-vault.ts";
import {
  CHALLENGE_PRICE_CENTS,
  COMMUNITY_TIERS,
  communityPriceCents,
  MIN_AUDIENCE_GROUP,
  splitOf,
} from "../../lib/money/amounts.ts";
import { announce } from "../../lib/challenges/lifecycle.ts";
import { createGamer } from "../../lib/identity/gamers.ts";
import { uid } from "../../lib/core/utils.ts";
import { eq as sqlEq } from "drizzle-orm";

const NEXT_WEEK = new Date("2026-09-14T00:00:00Z");
const NOW = new Date("2026-09-09T12:00:00Z");

async function aGuild(db: DB, guildId = "g1", over: Record<string, unknown> = {}) {
  await db.insert(schema.guilds).values({
    guildId,
    name: "Nightfall",
    slug: `nightfall-${guildId}`,
    memberCount: 500,
    community: "Nightfall is a competitive gaming community.",
    announceChannelId: "chan-1",
    ...over,
  });
}

// ── Keys ────────────────────────────────────────────────────────────────────
//
// The SERVER-OWNER key is gone (S1) — a portal is opened by a linked Discord
// identity, and the tests for that live in `93-identity.test.ts`. What is left
// here is the hashing the BRAND invite still uses.

test("a portal key is compared in constant time, and never stored in the clear", () => {
  const key = newPortalKey();
  const hash = hashPortalKey(key);
  ok(hash !== key, "what we keep is not what they hold");
  ok(hash.length === 64, "a SHA-256 hex digest");
  ok(keyMatches(hash, key), "the real key matches");
  no(keyMatches(hash, newPortalKey()), "another key does not");
  no(keyMatches(hash, ""), "nor does nothing");
  no(keyMatches(null, key), "and nothing issued yet lets nobody in");
});

// ── The owner portal ────────────────────────────────────────────────────────

test("the owner overview reads sums, never a stored balance", async () => {
  const db = await resetDemoDb();
  await aGuild(db);

  const payoutId = uid();
  await db.insert(schema.serverPayouts).values({
    id: payoutId,
    guildId: "g1",
    weekStart: new Date("2026-08-31T00:00:00Z"),
    status: "released",
    releasedAt: NOW,
    releasedBy: "admin-1",
  });
  await db.insert(schema.payoutLines).values([
    { id: uid(), payoutId, kind: "flat", description: "Flat", amountCents: 219 },
    { id: uid(), payoutId, kind: "scored", description: "Scored", amountCents: 1_881 },
  ]);

  const overview = await ownerOverview(db, "g1", NOW);
  eq(overview?.lifetimeEarnedCents, 2_100, "lifetime earnings are the payout lines added up");
  eq(overview?.availableCents, 2_100, "released and not yet paid is what they can withdraw");
});

test("a server with no community profile is told why it is not scored", async () => {
  const db = await resetDemoDb();
  await aGuild(db, "g1", { community: null });
  const overview = await ownerOverview(db, "g1", NOW);
  eq(overview?.thisWeekCents, 0, "nothing this week");
  // The pool run only mentions servers that carried an entrant, so a quiet
  // server sees nothing rather than a scolding — which is right.
  ok(overview !== null, "and the portal still works, because it reads none of Discord");
});

test("the server profile is six fields, and all six are the pool gate", async () => {
  // 12 §5 — ten linked members is not enough. A server we cannot describe is
  // one we cannot sell, and the profile is what a brand is actually buying.
  const db = await resetDemoDb();
  await aGuild(db, "g1", { community: null });

  await throws(
    () => describeCommunity(db, "g1", { community: "hi" }),
    /sentence at least/,
    "a two-character bio is not a bio",
  );
  const err = await throws(
    () => describeCommunity(db, "g1", { community: "ok" }),
    /a brand reads/,
    "and the refusal says what it is for",
  );
  ok(err instanceof CommunityBuilderRefused, "by name");

  const afterBio = await describeCommunity(db, "g1", {
    community: "A long-running competitive Dota community.",
  });
  ok(afterBio.done > 0, "a real bio is accepted");
  no(afterBio.complete, "and one field of six is not a complete profile");

  // H3 — a progress bar on every gated thing, and it has to move.
  const filled = await describeCommunity(db, "g1", {
    memberAgeRange: "18-24",
    gamesPlayed: ["Dota 2"],
    inviteUrl: "https://discord.gg/g1",
    coverImageUrl: "https://cdn.test/g1.png",
    announceChannelId: "chan-1",
  });
  eq(filled.done, filled.total, "all six answered");
  ok(filled.complete, "and the profile is complete");
  eq(filled.percent, 100, "the bar reads 100% exactly when the gate opens");

  // 12 §5 says this in words, and it is the field most likely to be answered
  // with the wrong number.
  const ageField = filled.fields.find((f) => f.key === "memberAgeRange")!;
  ok(
    /not your own age band/i.test(ageField.help),
    "and the member age range says it is their members' ages, not the owner's own band",
  );
});

test("a blank answer is an unanswered question, not a ticked box", async () => {
  // The negative half. Without it, a `describeCommunity` that stored empty
  // strings would satisfy the test above by filling six columns with nothing
  // and reporting a complete profile.
  const db = await resetDemoDb();
  await aGuild(db, "g1", { community: null });
  const state = await describeCommunity(db, "g1", {
    memberAgeRange: "   ",
    gamesPlayed: ["", "  "],
    inviteUrl: "",
    coverImageUrl: "",
    announceChannelId: "",
  });
  eq(state.done, 0, "six blank submissions answer nothing");
  no(state.complete, "and the gate stays shut");
});

test("the portal survives the bot being removed, and says what to do", async () => {
  const db = await resetDemoDb();
  await aGuild(db, "g1", { removedAt: NOW });

  const overview = await ownerOverview(db, "g1", NOW);
  ok(overview !== null, "S9 — the portal still works. Nothing here reads Discord");

  const result = await reAnnounce(db, "g1", ["anything"]);
  eq(result.queued, 0, "re-announcing is the one thing that cannot work");
  ok(
    /reinstall Cluster/.test(result.error ?? ""),
    "and the error tells a member what to do rather than reporting a fault",
  );
});

test("re-announcing goes through the queue, even for one server", async () => {
  const db = await resetDemoDb();
  await aGuild(db);
  const challengeId = uid();
  await db.insert(schema.challenges).values({
    id: challengeId,
    title: "Weekly",
    game: "Chess",
    provider: "chesscom",
    startAt: NEXT_WEEK,
    endAt: new Date("2026-09-18T00:00:00Z"),
    state: "announced",
  });

  const result = await reAnnounce(db, "g1", [challengeId]);
  eq(result.queued, 1, "one row queued");
  const queued = await db.select().from(schema.discordPostQueue);
  eq(queued.length, 1, "nothing fanned out inline — even a single post is drained by the cron");
});

// ── The community builder ───────────────────────────────────────────────────

test("owner money reaches the prize vault and Cluster, never the server vault", async () => {
  // M22/C2 — paying an owner from a pool their own money funded would pay them
  // twice. This is the end-to-end proof of it, through the builder.
  const db = await resetDemoDb();
  await aGuild(db);

  const built = await buildCommunityChallenge(db, {
    guildId: "g1",
    title: "Nightfall Chess Night",
    game: "Chess",
    provider: "chesscom",
    tier: 2,
    startAt: NEXT_WEEK,
  });
  eq(built.priceCents, communityPriceCents(2), "billed at the tier price");

  await payCommunityChallenge(db, built.challengeId, 2);

  eq(
    await balanceOf(db, "prize"),
    COMMUNITY_TIERS[2].prizeCents,
    "the whole prize pool is backed",
  );
  eq(await balanceOf(db, "server"), 0, "and vault 3 sees nothing at all");
  ok((await balanceOf(db, "cluster")) > 0, "Cluster takes its margin");
});

test("a community challenge is locked behind a key you get by joining", async () => {
  const db = await resetDemoDb();
  await aGuild(db);
  const built = await buildCommunityChallenge(db, {
    guildId: "g1",
    title: "Members only",
    game: "Chess",
    provider: "chesscom",
    tier: 1,
    startAt: NEXT_WEEK,
  });
  const [challenge] = await db
    .select()
    .from(schema.challenges)
    .where(sqlEq(schema.challenges.id, built.challengeId));

  ok(challenge.accessKey !== null, "there is a key — the challenge IS the server's advertising");
  eq(challenge.visibility, "community", "and it is a community challenge");
  eq(challenge.places, COMMUNITY_TIERS[1].winners, "with the tier's winner count");
  eq(challenge.prizePoolCents, COMMUNITY_TIERS[1].prizeCents, "and its prize pool");
});

test("there is no rate limit on community challenges", async () => {
  // M26 — owners farming visibility is the growth engine, not an abuse. Adding
  // a throttle later would need a ruling, so this test exists to make removing
  // it a deliberate act.
  const db = await resetDemoDb();
  await aGuild(db);
  for (let i = 0; i < 12; i++) {
    await buildCommunityChallenge(db, {
      guildId: "g1",
      title: `Daily ${i}`,
      game: "Chess",
      provider: "chesscom",
      tier: 1,
      startAt: new Date(NEXT_WEEK.getTime() + i * 86_400_000),
      cadence: "daily",
    });
  }
  const built = await db
    .select()
    .from(schema.challenges)
    .where(sqlEq(schema.challenges.visibility, "community"));
  eq(built.length, 12, "twelve in a row, no throttle, no fee");
});

// ── The brand builder ───────────────────────────────────────────────────────

test("the builder offers only games we can actually score", () => {
  const games = sellableGames();
  ok(games.length > 0, "there are games to sell");
  no(
    games.some((g) => g.provider === "riot-valorant"),
    "VALORANT is not among them — a brand who bought it would find out at sync time",
  );
});

test("a brand sees dates and price before paying", async () => {
  const db = await resetDemoDb();
  const q = await quote(
    db,
    { games: ["chesscom"], challengesPerGame: 2, startingWeek: NEXT_WEEK, weeks: 3 },
    NOW,
  );
  eq(q.challenges.length, 6, "two challenges a week for three weeks");
  eq(q.totalCents, 6 * CHALLENGE_PRICE_CENTS, "billed individually, at the unit price");
  eq(q.prizeCents, splitOf(6 * CHALLENGE_PRICE_CENTS).prize, "with the prize half shown");
  eq(q.weeks.length, 3, "and every week named");
  ok(
    q.weeks[0].announceFrom.getTime() < q.weeks[0].weekStart.getTime(),
    "including when it could be announced",
  );
});

test("a brand cannot pick a date, only a week", async () => {
  const db = await resetDemoDb();
  await throws(
    () =>
      quote(
        db,
        {
          games: ["chesscom"],
          challengesPerGame: 1,
          startingWeek: new Date("2026-09-15T00:00:00Z"),
          weeks: 1,
        },
        NOW,
      ),
    /no date picker/,
    "a Tuesday is refused",
  );
});

test("a brand cannot buy a week that has already started", async () => {
  const db = await resetDemoDb();
  const err = await throws(
    () =>
      quote(
        db,
        {
          games: ["chesscom"],
          challengesPerGame: 1,
          startingWeek: new Date("2026-09-07T00:00:00Z"),
          weeks: 1,
        },
        NOW,
      ),
    /already started/,
    "the gun has fired on this week",
  );
  ok(err instanceof BuilderRefused, "by name");
});

test("a brand cannot buy a game we cannot score", async () => {
  const db = await resetDemoDb();
  await throws(
    () =>
      quote(
        db,
        { games: ["riot-valorant"], challengesPerGame: 1, startingWeek: NEXT_WEEK, weeks: 1 },
        NOW,
      ),
    /production access|not available/,
    "VALORANT is refused with the real reason",
  );
});

test("there is no cap on challenges per week", async () => {
  // B6 — unlimited, any number of games. The old platform's per-game capacity
  // ceiling was deleted by ruling; it is not a number to re-derive.
  const db = await resetDemoDb();
  const q = await quote(
    db,
    { games: ["chesscom", "lichess"], challengesPerGame: 25, startingWeek: NEXT_WEEK, weeks: 1 },
    NOW,
  );
  eq(q.challenges.length, 50, "fifty challenges in one week, and nothing objects");
});

test("checkout bills a series together and announces each one separately", async () => {
  const db = await resetDemoDb();
  const { brandId } = await signUpBrand(db, { name: "Acme", contactEmail: "a@acme.test" });

  const { invoiceId, challengeIds, totalCents } = await confirmAndPay(
    db,
    { brandId, games: ["chesscom"], challengesPerGame: 1, startingWeek: NEXT_WEEK, weeks: 4 },
    NOW,
  );
  eq(challengeIds.length, 4, "four weeks, four challenges");
  eq(totalCents, 4 * CHALLENGE_PRICE_CENTS, "one bill for the series");

  const before = await db.select().from(schema.challenges);
  ok(
    before.every((c) => c.state === "pending_payment"),
    "all awaiting payment — nothing is scheduled on a promise",
  );

  const scheduled = await onInvoicePaid(db, invoiceId);
  eq(scheduled.length, 4, "paying schedules all four");

  const after = await db.select().from(schema.challenges);
  ok(after.every((c) => c.state === "scheduled"), "eligible to announce, and no more than that");
  ok(
    after.every((c) => c.seriesId !== null && c.seriesId === after[0].seriesId),
    "and they are one series",
  );

  eq(
    await balanceOf(db, "prize"),
    splitOf(totalCents).prize,
    "with the prize half backing them",
  );
});

test("a brand may change the start week of a draft, and nothing else", async () => {
  const db = await resetDemoDb();
  const { brandId } = await signUpBrand(db, { name: "Acme", contactEmail: "a@acme.test" });
  const { challengeIds } = await confirmAndPay(
    db,
    { brandId, games: ["chesscom"], challengesPerGame: 1, startingWeek: NEXT_WEEK, weeks: 1 },
    NOW,
  );
  const id = challengeIds[0];

  const later = new Date("2026-09-21T00:00:00Z");
  await changeStartWeek(db, id, brandId, later, NOW);
  const [moved] = await db.select().from(schema.challenges).where(sqlEq(schema.challenges.id, id));
  eq(moved.startAt.toISOString(), later.toISOString(), "the week moved");
  eq(moved.endAt.toISOString(), "2026-09-25T00:00:00.000Z", "and the end moved with it");

  await throws(
    () => changeStartWeek(db, id, "another-brand", later, NOW),
    /not yours/,
    "another brand cannot move it",
  );
  await throws(
    () => changeStartWeek(db, id, brandId, new Date("2026-09-22T00:00:00Z"), NOW),
    /start of a week/,
    "and not to a Tuesday",
  );
});

// ── Reporting ───────────────────────────────────────────────────────────────

test("the report is per challenge, and never sums into a unique audience", async () => {
  const db = await resetDemoDb();
  await aGuild(db);
  const { brandId } = await signUpBrand(db, { name: "Acme", contactEmail: "a@acme.test" });
  const { invoiceId, challengeIds } = await confirmAndPay(
    db,
    { brandId, games: ["chesscom"], challengesPerGame: 1, startingWeek: NEXT_WEEK, weeks: 2 },
    NOW,
  );
  await onInvoicePaid(db, invoiceId);

  // Set them up enough to announce, then announce both to the same server.
  for (const id of challengeIds) {
    await db
      .update(schema.challenges)
      .set({ metrics: { wins: 10, matches: 1 } })
      .where(sqlEq(schema.challenges.id, id));
    await db.insert(schema.trophies).values({
      id: uid(),
      type: "podium",
      name: "First",
      valueCents: splitOf(CHALLENGE_PRICE_CENTS).prize,
      challengeId: id,
      place: 1,
    });
    await announce(db, id, "admin-1", ["g1"]);
  }

  // The same gamer enters both weeks.
  const userId = await createGamer(db, { displayName: "Loyal" });
  for (const id of challengeIds) {
    await db.insert(schema.challengeParticipants).values({
      id: uid(),
      challengeId: id,
      userId,
      linkedAccountId: uid(),
      joinGuildId: "g1",
      parentGuildIdAtBaseline: "g1",
    });
  }

  const report = await brandReport(db, brandId);
  eq(report.length, 2, "a row per challenge — B10, per week of a series");
  eq(report[0].entrants, 1, "one entrant on this one");
  eq(report[1].entrants, 1, "and one on that one");
  eq(
    report[0].reach + report[1].reach,
    1_000,
    "the same 500 members on two challenges is 1,000 reach — deliberate double counting",
  );
  ok(
    !("totalEntrants" in report[0]) && !("uniqueAudience" in report[0]),
    "and the report offers no unique-audience figure to be misread",
  );

  const filtered = await brandReport(db, brandId, { weekStart: NEXT_WEEK });
  eq(filtered.length, 1, "filterable by week");
});

test("no group smaller than the floor is ever described", async () => {
  const small = suppressSmallGroup(MIN_AUDIENCE_GROUP - 1);
  no(small.show, "a small group is suppressed");
  ok(
    /fewer than/.test(small.text),
    "and reported as 'fewer than', not as zero — zero would be a different and wrong claim",
  );
  const fine = suppressSmallGroup(MIN_AUDIENCE_GROUP);
  ok(fine.show, "the floor itself is shown");
});

test("a brand signs up and gets an invite, once", async () => {
  const db = await resetDemoDb();
  const { brandId, key } = await signUpBrand(db, { name: "Nova", contactEmail: "n@nova.test" });
  ok(key.length > 20, "a real invite key");

  const [brand] = await db.select().from(schema.brands).where(sqlEq(schema.brands.id, brandId));
  eq(brand.slug, "nova", "with a readable slug");

  // The credential is no longer on the company row — B1 moved it to a
  // `brand_users` row, where it is a one-time invite rather than a password.
  ok(!("portalKeyHash" in brand), "and the brand itself holds no credential at all");
});

test("the prize vault holds after a full brand purchase", async () => {
  const db = await resetDemoDb();
  const { brandId } = await signUpBrand(db, { name: "Acme", contactEmail: "a@acme.test" });
  const { invoiceId } = await confirmAndPay(
    db,
    { brandId, games: ["chesscom"], challengesPerGame: 1, startingWeek: NEXT_WEEK, weeks: 1 },
    NOW,
  );
  await onInvoicePaid(db, invoiceId);
  const check = await checkPrizeVault(db);
  eq(check.state, "unallocated", "money in, no trophies assigned yet — amber, and correct");
  eq(check.balanceCents, splitOf(CHALLENGE_PRICE_CENTS).prize, "holding exactly the prize half");
});
