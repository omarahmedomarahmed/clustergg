// Attribution and eligibility — who a gamer earns for, and who is in the pool.
//
// docs/12-IDENTITY.md §3 and §4, and docs/02-MONEY.md §4. **Neither document
// is correct without the other**, which is why the credit rules and the KPI
// that consumes them are tested in one file: a ½ that is right in isolation
// and read wrongly by conversion is not a ½ that works.
//
// The shape §0.1 of the plan warns about governs every case below: for each
// rule, the question is not *"is it recorded"* but **"what reads it, and does
// every path that should read it go through that code"**. So the tests are
// written against `kpisForWeek` — the thing the money actually flows through —
// wherever the property can vary there, and against the pure function only
// where it genuinely cannot.

import { ok, eq, no, near, throws } from "../helpers/assert.ts";
import { test } from "../helpers/suite.ts";
import { resetDemoDb, schema, type DB } from "../../lib/db/index.ts";
import {
  entrantCredit,
  setParentGuild,
  ParentChangeRefused,
} from "../../lib/identity/attribution.ts";
import {
  freezeEligibilityAtGun,
  isFrozenEligible,
  linkedMembersOf,
  poolStatesFor,
  profileCompleteness,
  readEligibility,
  LINKED_MEMBERS_TO_UNLOCK_POOL,
  SERVER_PROFILE_FIELDS,
} from "../../lib/pool/eligibility.ts";
import { kpisForWeek } from "../../lib/pool/score.ts";
import { createGamer } from "../../lib/identity/gamers.ts";
import { createChallenge, attachInvoice, markScheduled, announce } from "../../lib/challenges/lifecycle.ts";
import { createInvoice, markPaid } from "../../lib/money/invoices.ts";
import { CHALLENGE_PRICE_CENTS } from "../../lib/money/amounts.ts";
import { uid } from "../../lib/core/utils.ts";
import { eq as sqlEq } from "drizzle-orm";

const MONDAY = new Date("2026-09-07T00:00:00Z");
const NEXT_MONDAY = new Date("2026-09-14T00:00:00Z");

// ── The four outcomes, as a pure function ───────────────────────────────────
//
// These four cases are the whole rule, and they are asserted here as well as
// through the pool below because the pure function is where the *shape* can be
// wrong (two halves instead of one whole) in a way the totals hide.

test("entrant credit is half the parent and half the join server", () => {
  const credits = entrantCredit({ parentGuildId: "parent", joinGuildId: "join" });
  eq(credits.length, 2, "A4 — two servers, never more");
  near(credits.find((c) => c.guildId === "parent")!.share, 0.5, "half to the parent");
  near(credits.find((c) => c.guildId === "join")!.share, 0.5, "half to the join server");
  near(
    credits.reduce((s, c) => s + c.share, 0),
    1,
    "K5 — and they sum to exactly one entrant, never past it",
  );
});

test("parent = join is 1.0, and not two halves", () => {
  // A5. Two halves for the same guild sum to the same money and are a
  // different answer everywhere a count of crediting servers is taken — and
  // they make the "at most two servers" cap read as three rows for one gamer.
  const credits = entrantCredit({ parentGuildId: "same", joinGuildId: "same" });
  eq(credits.length, 1, "one row, because one server did both jobs");
  eq(credits[0].guildId, "same", "and it is that server");
  near(credits[0].share, 1, "for a whole entrant");
});

test("a web join credits the parent in full", () => {
  // A6 — no server context. The parent takes the whole entrant rather than
  // half of one with the other half going nowhere: nobody else did anything.
  const credits = entrantCredit({ parentGuildId: "parent", joinGuildId: null });
  eq(credits.length, 1, "one server earns");
  eq(credits[0].guildId, "parent", "the parent");
  near(credits[0].share, 1, "in full — not a half with the rest evaporating");
});

test("a gamer with no parent earns nobody anything", () => {
  // A7. The join server is deliberately populated here: crediting it 1.0 is
  // the plausible wrong answer, and it would make clearing a parent a way to
  // move money.
  eq(entrantCredit({ parentGuildId: null, joinGuildId: "join" }), [], "not even the join server");
  eq(entrantCredit({ parentGuildId: null, joinGuildId: null }), [], "and not from a web join either");
});

// ── The same four, through the money ────────────────────────────────────────

test("the four outcomes reach the pool exactly as they are defined", async () => {
  // §0.1 — proving the rule *exists* is not proving anything *reads* it. The
  // pure function above is the rule; this is the one path money takes.
  const db = await resetDemoDb();
  await twoEligibleServers(db);
  const challengeId = await aLiveChallenge(db);

  await entrant(db, challengeId, { parent: "g1", join: "g2" }); // ½ + ½
  await entrant(db, challengeId, { parent: "g1", join: "g1" }); // 1.0 to g1
  await entrant(db, challengeId, { parent: "g2", join: null }); // 1.0 to g2
  await entrant(db, challengeId, { parent: null, join: "g1" }); // nobody

  const { kpis } = await kpisForWeek(db, MONDAY);
  near(kpis.find((k) => k.guildId === "g1")!.entrants, 1.5, "g1: a half and a whole");
  near(kpis.find((k) => k.guildId === "g2")!.entrants, 1.5, "g2: a half and a web join");
  near(
    kpis.reduce((s, k) => s + k.entrants, 0),
    3,
    "three of the four entrants are attributable, and the fourth earns nobody anything",
  );
});

// ── The freeze ──────────────────────────────────────────────────────────────

test("scoring reads the frozen parent, not the live one", async () => {
  // P6. Not a rule about which weeks may be rewritten — a scoring path that
  // cannot see `users.parentGuildId` at all.
  const db = await resetDemoDb();
  await twoEligibleServers(db);
  const challengeId = await aLiveChallenge(db);

  const userId = await createGamer(db, { displayName: "Moved", parentGuildId: "g1" });
  await entrant(db, challengeId, { parent: "g1", join: "g1" }, userId);

  // Admin corrects the live parent to g2 — mid-week, while this week runs.
  await setParentGuild(db, { userId, guildId: "g2", actorId: "admin-1" });

  const { kpis } = await kpisForWeek(db, MONDAY);
  near(kpis.find((k) => k.guildId === "g1")!.entrants, 1, "the entry still earns g1");
  eq(
    kpis.find((k) => k.guildId === "g2"),
    undefined,
    "and g2 earns nothing from an entry that was frozen before it was their gamer",
  );
});

test("correcting a parent in week 6 does not move week 3's money", async () => {
  // A1b, the same property across a **closed** week — which is the one an
  // owner has already been paid for.
  const db = await resetDemoDb();
  await twoEligibleServers(db);

  const closedWeek = await aLiveChallenge(db, MONDAY);
  const laterWeek = await aLiveChallenge(db, NEXT_MONDAY);
  // Week 3 is the closed one, so its gun is the freeze that stands.

  const userId = await createGamer(db, { displayName: "Reassigned", parentGuildId: "g1" });
  await entrant(db, closedWeek, { parent: "g1", join: "g1" }, userId, MONDAY);
  await entrant(db, laterWeek, { parent: "g1", join: "g1" }, userId, NEXT_MONDAY);

  const before = await kpisForWeek(db, MONDAY);
  await setParentGuild(db, { userId, guildId: "g2", actorId: "admin-1", reason: "wrong server" });
  const after = await kpisForWeek(db, MONDAY);

  eq(
    after.kpis.map((k) => `${k.guildId}:${k.entrants}`),
    before.kpis.map((k) => `${k.guildId}:${k.entrants}`),
    "the closed week is byte-for-byte what it was before the correction",
  );

  // And the negative half: the correction must actually be capable of changing
  // something, or the assertion above is satisfied by a no-op.
  const [row] = await db
    .select({ parentGuildId: schema.users.parentGuildId })
    .from(schema.users)
    .where(sqlEq(schema.users.id, userId));
  eq(row.parentGuildId, "g2", "while the live parent really did change");
});

test("the parent freezes with the baseline, not at the click", async () => {
  // A1a — `max(challengeStart, joinedAt)`, one rule for both columns. An early
  // joiner whose parent is corrected between joining and Monday competes under
  // the corrected one, because the gun is when their attribution is decided.
  const db = await resetDemoDb();
  await twoEligibleServers(db);
  const challengeId = await aLiveChallenge(db);

  const userId = await createGamer(db, { displayName: "Early", parentGuildId: "g1" });
  // Joined before the gun: no baseline yet, so no frozen parent yet.
  await db.insert(schema.challengeParticipants).values({
    id: uid(),
    challengeId,
    userId,
    linkedAccountId: uid(),
    joinGuildId: "g1",
    joinedAt: new Date(MONDAY.getTime() - 86_400_000),
  });

  const early = await kpisForWeek(db, MONDAY);
  eq(early.kpis.length, 0, "before the gun there is no attribution, so nobody earns yet");

  // The gun stamps both columns together.
  const [p] = await db.select().from(schema.challengeParticipants);
  await db
    .update(schema.challengeParticipants)
    .set({ baselineAt: MONDAY, baseline: {}, parentGuildIdAtBaseline: "g1" })
    .where(sqlEq(schema.challengeParticipants.id, p.id));

  const after = await kpisForWeek(db, MONDAY);
  near(after.kpis.find((k) => k.guildId === "g1")!.entrants, 1, "and after it, they do");
});

test("a parent that lost the bot keeps what it earned and gains nothing new", async () => {
  // A9. The test is not "does this guild still have the bot" — that would take
  // away credit an owner was already shown — it is whether **this entry** was
  // frozen before the bot went.
  const db = await resetDemoDb();
  await twoEligibleServers(db);
  const challengeId = await aLiveChallenge(db);

  const tuesday = new Date(MONDAY.getTime() + 86_400_000);
  const wednesday = new Date(MONDAY.getTime() + 2 * 86_400_000);

  await entrant(db, challengeId, { parent: "g1", join: "g1" }, undefined, MONDAY);
  await entrant(db, challengeId, { parent: "g1", join: "g1" }, undefined, wednesday);

  await db
    .update(schema.guilds)
    .set({ removedAt: tuesday })
    .where(sqlEq(schema.guilds.guildId, "g1"));

  const { kpis } = await kpisForWeek(db, MONDAY, wednesday);
  near(
    kpis.find((k) => k.guildId === "g1")!.entrants,
    1,
    "Monday's entrant still counts; Wednesday's, after the bot went, does not",
  );
});

// ── Conversion ──────────────────────────────────────────────────────────────

test("conversion is bounded at 1.0, because the denominator is live", async () => {
  // ===== E1, THE CASE THAT MOTIVATES THE WHOLE RULE =====
  //
  // "Eligible at the gun, links 50 more mid-week, 30 enter → all 30 count,
  // live. Denominator grows to 60." Frozen at the gun's ten it would be 3.0.
  const db = await resetDemoDb();
  await twoEligibleServers(db, { linkedPerGuild: 10 });
  const challengeId = await aLiveChallenge(db);

  // Fifty more link on Tuesday, and thirty of them enter.
  const newcomers = await linkGamers(db, "g1", 50);
  for (const userId of newcomers.slice(0, 30)) {
    await entrant(db, challengeId, { parent: "g1", join: "g1" }, userId);
  }

  const { kpis } = await kpisForWeek(db, MONDAY);
  const g1 = kpis.find((k) => k.guildId === "g1")!;
  eq(g1.linkedMembers, 60, "the denominator grew with them — it is live, not the gun's ten");
  near(g1.conversion, 0.5, "thirty of sixty");
  ok(g1.conversion <= 1, "and a conversion can never exceed 1.0");
});

test("conversion counts only entrants whose parent is this server", async () => {
  // K9 — a server with ten members converting twenty outsiders would otherwise
  // score 2.0, which rewards poaching over recruiting. The join server is paid
  // for that conversion through KPI 1; it does not also claim somebody else's
  // member as its own recruit.
  const db = await resetDemoDb();
  await twoEligibleServers(db, { linkedPerGuild: 10 });
  const challengeId = await aLiveChallenge(db);

  // Twenty of g2's members press Join on g1's card.
  const outsiders = await linkGamers(db, "g2", 20);
  for (const userId of outsiders) {
    await entrant(db, challengeId, { parent: "g2", join: "g1" }, userId);
  }

  const { kpis } = await kpisForWeek(db, MONDAY);
  const g1 = kpis.find((k) => k.guildId === "g1")!;
  near(g1.entrants, 10, "g1 is paid for the conversion — twenty halves");
  eq(g1.conversion, 0, "and claims none of them as its own recruits");
  ok(g1.conversion <= 1, "so the ratio stays bounded");

  const g2 = kpis.find((k) => k.guildId === "g2")!;
  near(g2.conversion, 20 / 30, "while g2 recruited them, and is measured on that");
});

test("a re-parented gamer cannot push conversion past 1.0", async () => {
  // The negative half of the bound, and the case the specification leaves
  // open: the numerator is frozen (P6) and the denominator is live (E1), so a
  // mid-week correction, a deletion or an unlink separates the two sides. The
  // denominator counts every gamer parented here who has linked — and an entry
  // frozen to this parent is itself evidence of both.
  const db = await resetDemoDb();
  await twoEligibleServers(db, { linkedPerGuild: 10 });
  const challengeId = await aLiveChallenge(db);

  const linked = await db
    .select({ id: schema.users.id })
    .from(schema.users)
    .where(sqlEq(schema.users.parentGuildId, "g1"));
  for (const { id } of linked) {
    await entrant(db, challengeId, { parent: "g1", join: "g1" }, id);
  }

  // Every one of them is re-parented to g2 on Wednesday. The live count for
  // g1 falls to zero while ten entries stay frozen to it.
  for (const { id } of linked) {
    await setParentGuild(db, { userId: id, guildId: "g2", actorId: "admin-1" });
  }
  eq(await linkedMembersOf(db, "g1"), 0, "g1's live linked count really did fall to nothing");

  const { kpis } = await kpisForWeek(db, MONDAY);
  const g1 = kpis.find((k) => k.guildId === "g1")!;
  near(g1.conversion, 1, "ten of ten — the entrants are counted on both sides");
  ok(g1.conversion <= 1, "and never above it, whatever admin does mid-week");
});

// ── Who may change a parent ─────────────────────────────────────────────────

test("a gamer can never change their own parent", async () => {
  // A8, both halves — the gamer, and an unattributed change.
  const db = await resetDemoDb();
  await twoEligibleServers(db);
  const userId = await createGamer(db, { displayName: "Ambitious", parentGuildId: "g1" });

  const err = await throws(
    () => setParentGuild(db, { userId, guildId: "g2", actorId: userId }),
    /never change their own parent/,
    "a gamer setting their own is refused by name",
  );
  ok(err instanceof ParentChangeRefused, "with a typed refusal the caller can catch");

  await throws(
    () => setParentGuild(db, { userId, guildId: "g2", actorId: "" }),
    /logged against the person/,
    "and so is a change nobody is accountable for",
  );

  const [row] = await db
    .select({ parentGuildId: schema.users.parentGuildId })
    .from(schema.users)
    .where(sqlEq(schema.users.id, userId));
  eq(row.parentGuildId, "g1", "and the parent did not move");
});

test("an admin can, and it is logged with both sides of the change", async () => {
  // The positive half. Without it, a `setParentGuild` that refused everybody
  // would satisfy the test above.
  const db = await resetDemoDb();
  await twoEligibleServers(db);
  const userId = await createGamer(db, { displayName: "Corrected", parentGuildId: "g1" });

  await setParentGuild(db, { userId, guildId: "g2", actorId: "admin-1", reason: "support ticket" });

  const [row] = await db
    .select()
    .from(schema.users)
    .where(sqlEq(schema.users.id, userId));
  eq(row.parentGuildId, "g2", "the parent moved");
  ok(row.parentStampedAt !== null, "and it is stamped, because a parent without a date is not one");

  const [entry] = await db
    .select()
    .from(schema.auditLog)
    .where(sqlEq(schema.auditLog.action, "user.parent_guild.set"));
  eq(entry.actorId, "admin-1", "logged against the admin who did it");
  eq(entry.refId, userId, "against the gamer it happened to");
  eq((entry.detail as Record<string, unknown>).from, "g1", "with where it came from");
  eq((entry.detail as Record<string, unknown>).to, "g2", "and where it went");
});

// ── Eligibility ─────────────────────────────────────────────────────────────

test("eligibility is frozen at the gun and never re-checked mid-week", async () => {
  // E3 — what the pool page shows on Wednesday is what pays on Friday.
  const db = await resetDemoDb();
  await twoEligibleServers(db);
  const challengeId = await aLiveChallenge(db);
  await entrant(db, challengeId, { parent: "g1", join: "g1" });

  const before = await kpisForWeek(db, MONDAY);
  eq(before.kpis.length, 1, "g1 is in the pool");

  // The owner deletes half their profile on Wednesday.
  await db
    .update(schema.guilds)
    .set({ coverImageUrl: null, inviteUrl: null })
    .where(sqlEq(schema.guilds.guildId, "g1"));
  const live = await readEligibility(db, "g1");
  no(live!.eligible, "and a live reading now says they would not qualify");

  const after = await kpisForWeek(db, MONDAY);
  eq(after.kpis.length, 1, "but the pool does not move — the gun already fired");
  eq(after.dropped.length, 0, "and they are not dropped");
});

test("eight linked at the gun and fifty on Tuesday earns nothing this week", async () => {
  // 12 §4's second row, which is the direction that costs money.
  const db = await resetDemoDb();
  await twoEligibleServers(db, { linkedPerGuild: 8, freeze: false });
  await freezeEligibilityAtGun(db, MONDAY);

  const challengeId = await aLiveChallenge(db);
  const newcomers = await linkGamers(db, "g1", 50);
  for (const userId of newcomers.slice(0, 30)) {
    await entrant(db, challengeId, { parent: "g1", join: "g1" }, userId);
  }

  const { kpis, dropped } = await kpisForWeek(db, MONDAY);
  eq(kpis.length, 0, "thirty entrants, and the server earns nothing this week");
  eq(dropped.map((d) => d.guildId), ["g1"], "it is told why rather than silently absent");

  // And it is eligible next Monday, which is the other half of the ruling.
  const next = await freezeEligibilityAtGun(db, NEXT_MONDAY);
  ok(next.find((g) => g.guildId === "g1")!.eligible, "eligible at the next gun");
});

test("ten at the gun and nine on Wednesday still pays", async () => {
  // 12 §4's third row. The gate is not a running condition.
  const db = await resetDemoDb();
  await twoEligibleServers(db, { linkedPerGuild: 10 });
  const challengeId = await aLiveChallenge(db);
  await entrant(db, challengeId, { parent: "g1", join: "g1" });

  // One of them deletes their account on Wednesday.
  const [someone] = await db
    .select({ id: schema.users.id })
    .from(schema.users)
    .where(sqlEq(schema.users.parentGuildId, "g1"));
  await db
    .update(schema.users)
    .set({ status: "deleted" })
    .where(sqlEq(schema.users.id, someone.id));
  eq(await linkedMembersOf(db, "g1"), 9, "the live count really did fall below the gate");

  const { kpis } = await kpisForWeek(db, MONDAY);
  eq(kpis.length, 1, "and they stay in this week's pool");
});

test("a freeze from last week is not a freeze for this one", async () => {
  // The stamp carries the week it was taken for, so a stale freeze cannot be
  // mistaken for a current one. Without the date, a server eligible in week 3
  // would be eligible for ever.
  const guild = { eligibilityFrozenAt: MONDAY, eligibleThisWeek: true };
  ok(isFrozenEligible(guild, MONDAY), "the week it was taken for");
  no(isFrozenEligible(guild, NEXT_MONDAY), "and not the next one");
  no(
    isFrozenEligible({ eligibilityFrozenAt: null, eligibleThisWeek: true }, MONDAY),
    "and a server the gun never saw is not in the pool, whatever the flag says",
  );
});

// ── The profile, and both portal states ─────────────────────────────────────

test("the profile is six fields and the bar counts all six", async () => {
  eq(SERVER_PROFILE_FIELDS.length, 6, "12 §5 names six");
  const empty = profileCompleteness({});
  eq(empty.done, 0, "nothing answered");
  eq(empty.percent, 0, "and the bar says so");
  no(empty.complete, "and the gate is shut");

  const partial = profileCompleteness({ community: "a real bio", memberAgeRange: "18-24" });
  eq(partial.done, 2, "two of six");
  eq(partial.percent, 33, "H3 — a progress bar on every gated thing");
  no(partial.complete, "still shut");
  eq(partial.fields.filter((f) => f.done).length, 2, "and it names which two");
});

test("the portal shows both states, and they answer different questions", async () => {
  // E2. An owner who only saw "in this week's pool" would have no way to tell
  // whether the work they did on Wednesday achieved anything.
  const db = await resetDemoDb();
  await twoEligibleServers(db, { linkedPerGuild: 4, freeze: false });
  await freezeEligibilityAtGun(db, MONDAY);

  const behind = await poolStatesFor(db, "g1", MONDAY);
  no(behind!.inThisWeeksPool, "not in this week's");
  no(behind!.onTrackForNextWeek, "and not on track either, at four linked members");
  ok(/6 more linked gamers/.test(behind!.live.reason ?? ""), "with the number they need");

  await linkGamers(db, "g1", 6);
  const onTrack = await poolStatesFor(db, "g1", MONDAY);
  no(onTrack!.inThisWeeksPool, "this week is still decided — the gun does not fire twice");
  ok(onTrack!.onTrackForNextWeek, "but they are on track for the next one");
  eq(onTrack!.live.reason, null, "and there is nothing left to tell them to do");
});

test("ten linked members is not enough on its own", async () => {
  // 12 §5 says it in those words: a server we cannot describe is one we cannot
  // sell. Without this, the profile half of the gate is decoration.
  const db = await resetDemoDb();
  await twoEligibleServers(db, { freeze: false });
  await db
    .update(schema.guilds)
    .set({ coverImageUrl: null })
    .where(sqlEq(schema.guilds.guildId, "g1"));

  const reading = await readEligibility(db, "g1");
  ok(
    reading!.linkedMembers >= LINKED_MEMBERS_TO_UNLOCK_POOL,
    "they have the members",
  );
  no(reading!.eligible, "and are still not eligible");
  ok(/1 more profile field/.test(reading!.reason ?? ""), "and are told which half is missing");
});

// ── Fixtures ────────────────────────────────────────────────────────────────

async function twoEligibleServers(
  db: DB,
  opts: { linkedPerGuild?: number; freeze?: boolean } = {},
) {
  const linked = opts.linkedPerGuild ?? LINKED_MEMBERS_TO_UNLOCK_POOL + 2;
  for (const [guildId, name] of [
    ["g1", "Nightfall"],
    ["g2", "Dawnbreak"],
  ]) {
    await db.insert(schema.guilds).values({
      guildId,
      name,
      slug: name.toLowerCase(),
      memberCount: 500,
      community: `${name} is a competitive gaming community.`,
      memberAgeRange: "18-24",
      gamesPlayed: ["Chess"],
      inviteUrl: `https://discord.gg/${guildId}`,
      coverImageUrl: `https://cdn.test/${guildId}.png`,
      announceChannelId: `chan-${guildId}`,
    });
    await linkGamers(db, guildId, linked);
  }
  // MONDAY only. The freeze is one pair of columns, so freezing a second week
  // overwrites the first — see `isFrozenEligible`. A fixture that froze both
  // would leave every test in this file scored against the wrong week, which
  // is exactly what it did on the first run.
  if (opts.freeze !== false) await freezeEligibilityAtGun(db, MONDAY);
}

/** `n` gamers parented to this guild, each with a linked account (A3). */
async function linkGamers(db: DB, guildId: string, n: number): Promise<string[]> {
  const ids: string[] = [];
  for (let i = 0; i < n; i++) {
    const userId = await createGamer(db, {
      displayName: `${guildId}-member-${i}`,
      parentGuildId: guildId,
    });
    await db.insert(schema.linkedGameAccounts).values({
      id: uid(),
      userId,
      provider: "chesscom",
      providerAccountId: `acct-${uid()}`,
      verifiedMethod: "exists",
    });
    ids.push(userId);
  }
  return ids;
}

/** One entry, with both server columns stamped the way the platform stamps them. */
async function entrant(
  db: DB,
  challengeId: string,
  who: { parent: string | null; join: string | null },
  userId?: string,
  baselineAt: Date = MONDAY,
) {
  const id = userId ?? (await createGamer(db, { displayName: `entrant-${uid()}` }));
  await db.insert(schema.challengeParticipants).values({
    id: uid(),
    challengeId,
    userId: id,
    linkedAccountId: uid(),
    joinGuildId: who.join,
    parentGuildIdAtBaseline: who.parent,
    baselineAt,
    baseline: { wins: 0, matches: 0 },
  });
  return id;
}

async function aLiveChallenge(db: DB, startAt: Date = MONDAY): Promise<string> {
  const challengeId = await createChallenge(db, {
    title: "Weekly",
    game: "Chess",
    provider: "chesscom",
    startAt,
    metrics: { wins: 10, matches: 1 },
  });
  const invoiceId = await createInvoice(db, {
    payerType: "brand",
    lines: [{ description: "Challenge", amountCents: CHALLENGE_PRICE_CENTS }],
  });
  await attachInvoice(db, challengeId, invoiceId);
  await markPaid(db, invoiceId);
  await markScheduled(db, challengeId);
  await announce(db, challengeId, "admin-1", []);
  return challengeId;
}
