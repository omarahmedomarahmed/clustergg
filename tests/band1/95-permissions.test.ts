// Permissions — the line between an administrator and the owner's money.
//
// docs/12-IDENTITY.md §6. One line, and every money rule sits on it:
//
//   Both:  view · re-announce · edit the profile · add the bot · **request**
//   Owner: **approve** a spend · **withdraw**
//
// Trap 10 is why there is no single predicate covering both: `isGuildManager`
// answered *may they see this portal* and *may they move money* at once, which
// is one careless call site away from letting an administrator withdraw — and
// that call site would look completely correct.
//
// P5 is the case that catches people out: a **13–17 owner earns, may spend on
// community challenges, and may not withdraw.** Owner and adult are two
// independent questions and collapsing them is the mutation 09 asks for.

import { ok, eq, no, throws } from "../helpers/assert.ts";
import { test } from "../helpers/suite.ts";
import { resetDemoDb, schema, type DB } from "../../lib/db/index.ts";
import {
  guildAccessFor,
  identityOf,
  mayApproveSpend,
  mayEditProfile,
  mayReAnnounce,
  mayRequestSpend,
  mayViewPortal,
  mayWithdraw,
  TRANSFER_FREEZE_MS,
  type GuildAccess,
} from "../../lib/portal/permissions.ts";
import {
  approveCommunitySpend,
  pendingSpendRequests,
  rejectCommunitySpend,
  requestCommunitySpend,
  SpendRefused,
} from "../../lib/portal/spend.ts";
import { uid } from "../../lib/core/utils.ts";
import { eq as sqlEq } from "drizzle-orm";

const OWNER_ID = "111111111111111111";
const ADMIN_ID = "222222222222222222";
const MONDAY = new Date("2026-09-07T00:00:00Z");

const OWNER: GuildAccess = { kind: "owner", discordId: OWNER_ID };
const ADMIN: GuildAccess = { kind: "administrator", discordId: ADMIN_ID };
const NONE: GuildAccess = { kind: "none" };

// ── The gate itself ─────────────────────────────────────────────────────────

test("the owner is the owner, whatever roles they also hold", () => {
  // P1 — one person. The check is Discord's `ownerDiscordId`, and it is tested
  // first so that an owner who is also in `guild_admins` is not demoted to an
  // administrator by the order of the branches.
  const guild = { ownerDiscordId: OWNER_ID, adminRoleId: "333" };
  eq(
    guildAccessFor({ guild, discordId: OWNER_ID, seenAdmin: true, isDemo: false }).kind,
    "owner",
    "the owner, even though we have also seen them holding the mapped role",
  );
  eq(
    guildAccessFor({ guild, discordId: ADMIN_ID, seenAdmin: true, isDemo: false }).kind,
    "administrator",
    "and somebody we have seen with the role is an administrator",
  );
  eq(
    guildAccessFor({ guild, discordId: "999", seenAdmin: false, isDemo: false }).kind,
    "none",
    "and a stranger is nobody",
  );
  eq(
    guildAccessFor({ guild, discordId: null, seenAdmin: true, isDemo: false }).kind,
    "none",
    "seen-admin without an identity is nobody — the id is what the fact is about",
  );
});

test("a renamed Discord role revokes nothing, because the ID is what we stored", async () => {
  // S5/P3. Names are what people change; ids are what Discord keys on. The
  // mapped role is stored as a snowflake and `guild_admins` accumulates the
  // people we have **seen** holding it (G5), so renaming the role touches
  // neither.
  const db = await resetDemoDb();
  await aGuild(db);
  await db.insert(schema.guildAdmins).values({
    id: uid(),
    guildId: "g1",
    discordId: ADMIN_ID,
    source: "mapped_role",
  });

  const before = await accessOf(db, ADMIN_ID);
  eq(before.kind, "administrator", "they are in");

  // The owner renames the role in Discord. Nothing about our row changes,
  // because nothing about our row was the name.
  const [guild] = await db.select().from(schema.guilds).where(sqlEq(schema.guilds.guildId, "g1"));
  ok(/^\d+$/.test(guild.adminRoleId ?? ""), "the mapped role is stored as an ID");

  const after = await accessOf(db, ADMIN_ID);
  eq(after.kind, "administrator", "and they are still in");
  ok(mayViewPortal(after) && mayReAnnounce(after) && mayEditProfile(after), "with the same reach");
});

// ── The generous half ───────────────────────────────────────────────────────

test("an administrator does everything except move money", () => {
  // The positive half, and it is not decoration: without it, a permissions
  // module that refused administrators outright would satisfy every refusal
  // test below and quietly lock every server's staff out of their own portal.
  ok(mayViewPortal(ADMIN), "views the portal");
  ok(mayReAnnounce(ADMIN), "re-announces");
  ok(mayEditProfile(ADMIN), "edits the server profile");
  ok(mayRequestSpend(ADMIN), "and requests a community challenge");

  no(mayApproveSpend(ADMIN), "but does not approve the spend");
  no(mayWithdraw({ access: ADMIN, ageBand: "adult", country: "GB" }).allowed, "and does not withdraw");
});

test("nobody with no access reaches anything at all", () => {
  no(mayViewPortal(NONE), "not the portal");
  no(mayReAnnounce(NONE), "not re-announce");
  no(mayEditProfile(NONE), "not the profile");
  no(mayRequestSpend(NONE), "not even a request");
  no(mayApproveSpend(NONE), "certainly not an approval");
});

// ── Withdrawal ──────────────────────────────────────────────────────────────

test("an administrator cannot withdraw, and is told why in words they can act on", () => {
  const verdict = mayWithdraw({ access: ADMIN, ageBand: "adult", country: "GB" });
  no(verdict.allowed, "refused");
  ok(
    !verdict.allowed && /Only the Discord server owner/.test(verdict.reason),
    "naming who can",
  );
  ok(
    !verdict.allowed && /requesting a community challenge/.test(verdict.reason),
    "and what they can do instead — a disabled button with no explanation is a support ticket",
  );
});

test("a teen owner spends and does not withdraw", () => {
  // P5. Two independent questions, and the whole point of this test is that
  // they are answered separately: collapsing them either locks a teen owner
  // out of their own community challenges or hands them a payout.
  const teen: GuildAccess = OWNER;
  ok(mayApproveSpend(teen), "a 13–17 owner approves their own spend — exposure now");

  const verdict = mayWithdraw({ access: teen, ageBand: "teen", country: "GB" });
  no(verdict.allowed, "and cannot withdraw");
  ok(!verdict.allowed && /18\+/.test(verdict.reason), "because withdrawing is 18+");
  ok(
    !verdict.allowed && /balance keeps/.test(verdict.reason),
    "and their balance keeps, which is the part that matters to them",
  );
});

test("an adult owner in an allowed country withdraws", () => {
  // The positive half of all four gates. Without it, a `mayWithdraw` that
  // refused everybody satisfies every other case in this file.
  ok(
    mayWithdraw({ access: OWNER, ageBand: "adult", country: "GB" }).allowed,
    "owner, adult, country set — allowed",
  );
  no(
    mayWithdraw({ access: OWNER, ageBand: "adult", country: null }).allowed,
    "and a missing country is its own refusal, because it decides which entity pays",
  );
});

test("a confirmed transfer freezes withdrawal for seven days", () => {
  // T4/T5 — without it, a vanished or hostile old owner locks the money for
  // ever; with it, a transfer is not a way to take somebody else's earnings.
  const confirmed = MONDAY;
  const dayThree = new Date(confirmed.getTime() + 3 * 24 * 60 * 60 * 1000);
  const dayEight = new Date(confirmed.getTime() + 8 * 24 * 60 * 60 * 1000);

  const frozen = mayWithdraw({
    access: OWNER,
    ageBand: "adult",
    country: "GB",
    transferConfirmedAt: confirmed,
    now: dayThree,
  });
  no(frozen.allowed, "day three: frozen");
  ok(!frozen.allowed && /frozen until/.test(frozen.reason), "and told until when");

  ok(
    mayWithdraw({
      access: OWNER,
      ageBand: "adult",
      country: "GB",
      transferConfirmedAt: confirmed,
      now: dayEight,
    }).allowed,
    "day eight: thawed — the freeze is a window, not a permanent state",
  );
  eq(TRANSFER_FREEZE_MS, 7 * 24 * 60 * 60 * 1000, "and the window is seven days");
});

// ── Request → approve ───────────────────────────────────────────────────────

test("an administrator requests and the owner approves", async () => {
  const db = await resetDemoDb();
  await aGuild(db);

  const requestId = await requestCommunitySpend(db, {
    guildId: "g1",
    access: ADMIN,
    tier: 1,
    payload: aPayload(),
  });

  const waiting = await pendingSpendRequests(db, "g1");
  eq(waiting.length, 1, "one request, waiting for the owner");
  eq(waiting[0].requestedBy, ADMIN_ID, "recorded against the administrator who asked");
  eq(waiting[0].state, "pending", "and nothing is built or billed yet");

  const challenges = await db.select().from(schema.challenges);
  eq(challenges.length, 0, "no challenge exists — a request is not a commitment");
  const invoices = await db.select().from(schema.invoices);
  eq(invoices.length, 0, "and no bill, which is the whole reason the state exists");

  const built = await approveCommunitySpend(db, { requestId, access: OWNER });
  ok(built.challengeId.length > 0, "approval builds it");
  ok(built.priceCents > 0, "and bills it");

  const [after] = await db
    .select()
    .from(schema.spendRequests)
    .where(sqlEq(schema.spendRequests.id, requestId));
  eq(after.state, "approved", "the request is answered");
  eq(after.approvedBy, OWNER_ID, "by the owner");
  eq(after.challengeId, built.challengeId, "and it names what it became");
  eq((await pendingSpendRequests(db, "g1")).length, 0, "nothing left waiting");
});

test("an administrator cannot approve their own request", async () => {
  // P1 — the gap between the two rows of 12 §6, through the code that has to
  // enforce it rather than the boolean that describes it.
  const db = await resetDemoDb();
  await aGuild(db);
  const requestId = await requestCommunitySpend(db, {
    guildId: "g1",
    access: ADMIN,
    tier: 2,
    payload: aPayload(),
  });

  const err = await throws(
    () => approveCommunitySpend(db, { requestId, access: ADMIN }),
    /Only the Discord server owner/,
    "refused by name",
  );
  ok(err instanceof SpendRefused, "with a typed refusal the portal can catch");

  eq((await db.select().from(schema.challenges)).length, 0, "and nothing was built");
  eq((await db.select().from(schema.invoices)).length, 0, "and nothing was billed");
  const [row] = await db
    .select()
    .from(schema.spendRequests)
    .where(sqlEq(schema.spendRequests.id, requestId));
  eq(row.state, "pending", "the request is untouched, still waiting for the owner");
  eq(row.approvedBy, null, "and nobody is recorded as having answered it");
});

test("an administrator cannot reject one either", async () => {
  // Rejecting is a smaller version of the same authority: an administrator who
  // could reject could bury another administrator's request.
  const db = await resetDemoDb();
  await aGuild(db);
  const requestId = await requestCommunitySpend(db, {
    guildId: "g1",
    access: ADMIN,
    tier: 1,
    payload: aPayload(),
  });

  await throws(
    () => rejectCommunitySpend(db, { requestId, access: ADMIN }),
    /Only the Discord server owner/,
    "refused",
  );
  await rejectCommunitySpend(db, { requestId, access: OWNER, reason: "not this week" });
  const [row] = await db
    .select()
    .from(schema.spendRequests)
    .where(sqlEq(schema.spendRequests.id, requestId));
  eq(row.state, "rejected", "the owner can");
  eq(row.rejectedReason, "not this week", "and the reason is kept, so the admin knows why");
});

test("a request is answered once", async () => {
  const db = await resetDemoDb();
  await aGuild(db);
  const requestId = await requestCommunitySpend(db, {
    guildId: "g1",
    access: ADMIN,
    tier: 1,
    payload: aPayload(),
  });

  await approveCommunitySpend(db, { requestId, access: OWNER });
  await throws(
    () => approveCommunitySpend(db, { requestId, access: OWNER }),
    /already approved/,
    "a second approval is refused, and says so rather than spending twice",
  );
  eq((await db.select().from(schema.challenges)).length, 1, "one challenge, not two");
});

test("who approved is taken from the access, never from an argument", () => {
  // The structural half of P1. If `approvedBy` could be passed in, an
  // administrator's form could name the owner and the gate would be one
  // hidden field wide.
  eq(identityOf(OWNER), OWNER_ID, "the owner's id comes from the owner access");
  eq(identityOf(ADMIN), ADMIN_ID, "the administrator's from theirs");
  eq(identityOf(NONE), null, "and no access carries no identity at all");
});

test("nobody without access can even request", async () => {
  const db = await resetDemoDb();
  await aGuild(db);
  await throws(
    () => requestCommunitySpend(db, { guildId: "g1", access: NONE, tier: 1, payload: aPayload() }),
    /admins this server/,
    "a stranger cannot put a request in front of somebody else's owner",
  );
  eq((await pendingSpendRequests(db, "g1")).length, 0, "and nothing is waiting");
});

// ── Fixtures ────────────────────────────────────────────────────────────────

async function aGuild(db: DB) {
  await db.insert(schema.guilds).values({
    guildId: "g1",
    name: "Nightfall",
    slug: "nightfall",
    memberCount: 500,
    // Stored as an ID, never a name (S5/P3).
    adminRoleId: "333333333333333333",
    ownerDiscordId: OWNER_ID,
    community: "Nightfall is a competitive gaming community.",
    announceChannelId: "chan-1",
    memberAgeRange: "18-24",
    gamesPlayed: ["Chess"],
    inviteUrl: "https://discord.gg/g1",
    coverImageUrl: "https://cdn.test/g1.png",
  });
}

async function accessOf(db: DB, discordId: string): Promise<GuildAccess> {
  const [guild] = await db.select().from(schema.guilds).where(sqlEq(schema.guilds.guildId, "g1"));
  const seen = await db
    .select()
    .from(schema.guildAdmins)
    .where(sqlEq(schema.guildAdmins.discordId, discordId));
  return guildAccessFor({
    guild,
    discordId,
    seenAdmin: seen.length > 0,
    isDemo: false,
  });
}

function aPayload() {
  return {
    title: "Nightfall Friday Night",
    game: "Chess",
    provider: "chesscom",
    startAt: MONDAY.toISOString(),
  };
}
