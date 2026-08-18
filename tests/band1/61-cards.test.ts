// The card families, the three announcements, and the two rules a card must
// never break.
//
// ===== WHAT THIS SUITE ASKS THAT `60-bot` DOES NOT =====
//
// `60-bot` guards the transport: acknowledge in three seconds, verify a
// signature, keep a `custom_id` under a hundred characters, and never let a
// decoration take a card down. All of that was true on a platform where
// **`SCREENS` was empty** and every interaction fell through to *"that screen
// has gone"*.
//
// So this one asks the other question: is there anything there? Every family
// 04 §4 names, registered; every owner card ephemeral; every announcement
// enqueued rather than fanned out inline; and the first press creating the
// account that A1 stamps a parent onto.

import { ok, eq, no, throws } from "../helpers/assert.ts";
import { test } from "../helpers/suite.ts";
import { resetDemoDb, schema } from "../../lib/db/index.ts";
import { eq as sqlEq } from "drizzle-orm";
import { SCREENS, CARD_FAMILIES, ADMIN_SCREENS } from "../../lib/discord/screens/index.ts";
import { identifyPresser } from "../../lib/discord/identify.ts";
import { cardText } from "../../lib/discord/screens/card.ts";
import { lifecycleProgress } from "../../lib/site/progress.ts";
import type { Interaction } from "../../lib/discord/interactions.ts";
import { uid } from "../../lib/core/utils.ts";

function anInteraction(over: Partial<Interaction> = {}): Interaction {
  return {
    id: "i1",
    token: "t1",
    application_id: "app1",
    type: 2,
    data: { name: "home" },
    member: { user: { id: "discord-1", username: "Presser" }, roles: [] },
    guild_id: "guild-1",
    ...over,
  } as Interaction;
}

async function aGuild(db: Awaited<ReturnType<typeof resetDemoDb>>, over: Record<string, unknown> = {}) {
  const guildId = (over.guildId as string) ?? `guild-${uid()}`;
  await db.insert(schema.guilds).values({
    guildId,
    name: "A Server",
    slug: `s-${guildId.toLowerCase()}`,
    announceChannelId: "chan-1",
    ...over,
  });
  return guildId;
}

// ── Every family 04 §4 names, registered ────────────────────────────────────

test("every card family in 04 §4 is registered, and nothing is a stub", () => {
  // ===== CAN THIS FAIL? =====
  //
  // It did, for ten stages and eleven sprints: `SCREENS` was empty and the
  // handler answered every press with *"that screen has gone"*. Which is the
  // worst possible failure mode — it reads like a stale button, so nobody
  // reports it as "the bot has no screens".
  const registered = [...SCREENS.keys()];
  ok(registered.length > 15, `the registry is filled (${registered.length} screens)`);

  const missing: string[] = [];
  for (const [family, screens] of Object.entries(CARD_FAMILIES)) {
    for (const name of screens) {
      if (!SCREENS.has(name)) missing.push(`${family}/${name}`);
    }
  }
  eq(missing, [], "every screen named in a family has a handler");

  // And the negative half: a registry that answered `has()` for everything
  // would satisfy the loop above without a single real screen behind it.
  no(SCREENS.has("a-screen-nobody-wrote"), "and the registry does not answer for a screen nobody wrote");
});

// ── S8 · an admin card is never a public message ────────────────────────────

/**
 * Run every owner card as one person, and report which came back public.
 *
 * The `who` split is the whole point. The first version of this guard ran them
 * all as a stranger — so every call took `checkAdmin`'s refusal branch and
 * returned before the handler, and **the line that sets `ephemeral` on a real
 * card was never executed.** Deleting that line went green. Trap 27: the break
 * applied to the file, and the test had no way to receive it.
 */
async function ephemeralityOf(
  db: Awaited<ReturnType<typeof resetDemoDb>>,
  guildId: string,
  who: { discordId: string; roles: string[] },
): Promise<string[]> {
  const leaked: string[] = [];
  for (const name of ADMIN_SCREENS) {
    const handler = SCREENS.get(name);
    ok(handler !== undefined, `${name} is registered`);
    const result = await handler!({
      interaction: anInteraction({
        guild_id: guildId,
        member: { user: { id: who.discordId, username: "Someone" }, roles: who.roles },
      }),
      frame: { screen: name, args: [] },
      trail: [],
      userId: who.discordId,
      guildId,
      presser: {
        userId: null,
        discordId: who.discordId,
        guildId,
        roleIds: who.roles,
        created: false,
        blocked: false,
      },
    });
    if (!result.ephemeral) leaked.push(name);
  }
  return leaked;
}

test("every owner card is ephemeral — the card itself, not only the refusal", async () => {
  // ===== BOTH BRANCHES, BECAUSE THEY ARE DIFFERENT LINES =====
  //
  // S8 has no exceptions, and it is broken in two different places: the
  // wrapper's refusal, and the wrapper's return of a real card. A guard that
  // only ever reaches the first proves nothing about the second — and the
  // second is the one carrying a wallet balance.
  const db = await resetDemoDb();
  const guildId = await aGuild(db, {
    guildId: "guild-s8",
    ownerDiscordId: "discord-owner",
    adminRoleId: "42",
  });

  // The guild owner. Every card renders for real, so the flag under test is
  // the one the wrapper puts on a **finished** card.
  const asOwner = await ephemeralityOf(db, guildId, { discordId: "discord-owner", roles: [] });
  eq(asOwner, [], "S8 — a rendered admin card is never a public message. Ever");

  // A mapped role reaches the same cards (S4), and they are just as private.
  const asMapped = await ephemeralityOf(db, guildId, { discordId: "discord-staff", roles: ["42"] });
  eq(asMapped, [], "and the same for anyone holding the mapped role");

  // And the refusal, which is the case where posting publicly would announce
  // to a whole server that somebody tried.
  const asStranger = await ephemeralityOf(db, guildId, { discordId: "discord-nobody", roles: [] });
  eq(asStranger, [], "and the refusal is ephemeral too");
});

test("a gamer card is not ephemeral, or the rule above would be vacuous", async () => {
  // ===== THE NEGATIVE HALF (guard 118's lesson) =====
  //
  // If every screen on the platform returned `ephemeral: true`, the assertion
  // above would pass and prove nothing. A public card has to actually be
  // public for "never public" to mean something about the admin ones.
  const db = await resetDemoDb();
  await aGuild(db, { guildId: "guild-1" });
  const handler = SCREENS.get("home")!;
  const result = await handler({
    interaction: anInteraction(),
    frame: { screen: "home", args: [] },
    trail: [],
    userId: "discord-1",
    guildId: "guild-1",
    presser: {
      userId: null,
      discordId: "discord-1",
      guildId: "guild-1",
      roleIds: [],
      created: false,
      blocked: false,
    },
  });
  eq(result.ephemeral ?? false, false, "home is a public card");
});

// ── I5 / A1 · the first press ───────────────────────────────────────────────

test("the first press creates the account and stamps the parent", async () => {
  const db = await resetDemoDb();
  const guildId = await aGuild(db, { guildId: "guild-first" });

  const first = await identifyPresser(db, anInteraction({ guild_id: guildId }));
  ok(first.created, "the press created the row — I5");
  ok(first.userId !== null, "and we know who they are from here on");

  const [user] = await db
    .select()
    .from(schema.users)
    .where(sqlEq(schema.users.id, first.userId as string));
  eq(user.parentGuildId, guildId, "A1 — the parent is where they first pressed");
  ok(user.parentStampedAt !== null, "and when");

  // I5 — **nothing but the Discord ID.** The payload carries a username and we
  // do not take it: I7 says nothing is stored before the age question, and a
  // display name is data about somebody we have not asked about.
  eq(user.displayName, "discord-1", "no name was taken from the payload");
  eq(user.email, null, "no email");
  eq(user.ageBand, null, "and no age band — that is asked, not inferred");
});

test("a second press in another server does not move the parent", async () => {
  // A1/A2 — the parent is stamped at the **first** click and never moves. A
  // gamer who presses a button in a second server must not take their parent
  // with them, or the credit follows whoever posted most recently.
  const db = await resetDemoDb();
  const first = await aGuild(db, { guildId: "guild-a" });
  const second = await aGuild(db, { guildId: "guild-b" });

  const one = await identifyPresser(db, anInteraction({ guild_id: first }));
  const two = await identifyPresser(db, anInteraction({ guild_id: second }));

  eq(two.userId, one.userId, "the same gamer");
  no(two.created, "and the second press created nothing");

  const [user] = await db
    .select()
    .from(schema.users)
    .where(sqlEq(schema.users.id, one.userId as string));
  eq(user.parentGuildId, first, "the parent is still the first server");
});

test("role holders are accumulated from the payload, never listed", async () => {
  // G5 — *"role holders are accumulated from interaction payloads, never
  // listed."* The member object arrives with every press, so this costs
  // nothing; the alternative is the GUILD_MEMBERS intent, which 12 §7 forbids
  // on any path the product depends on.
  const db = await resetDemoDb();
  const guildId = await aGuild(db, { guildId: "guild-roles", adminRoleId: "999" });

  await identifyPresser(
    db,
    anInteraction({
      guild_id: guildId,
      member: { user: { id: "discord-admin", username: "Admin" }, roles: ["999"] },
    }),
  );

  const seen = await db
    .select()
    .from(schema.guildAdmins)
    .where(sqlEq(schema.guildAdmins.guildId, guildId));
  eq(seen.length, 1, "we have seen one holder");
  eq(seen[0].discordId, "discord-admin", "and who");

  // And somebody without the role is not recorded, or the table would say we
  // had seen everybody holding it.
  await identifyPresser(
    db,
    anInteraction({
      guild_id: guildId,
      member: { user: { id: "discord-member", username: "Member" }, roles: ["111"] },
    }),
  );
  eq(
    (await db.select().from(schema.guildAdmins).where(sqlEq(schema.guildAdmins.guildId, guildId)))
      .length,
    1,
    "somebody without the role is not a holder we have seen",
  );
});

// ── The three announcements ─────────────────────────────────────────────────

test("announcing a challenge queues a card for every installed server", async () => {
  // A3 — nothing fans out per-guild inline from a request. Even one server
  // goes through the queue, and this asserts the rows exist rather than that a
  // REST call was made, because there is no REST call to make.
  const db = await resetDemoDb();
  await aGuild(db, { guildId: "g1" });
  await aGuild(db, { guildId: "g2" });
  // S9 — a server that removed the bot is not posted to.
  await aGuild(db, { guildId: "g3", removedAt: new Date() });

  const challengeId = uid();
  await db.insert(schema.challenges).values({
    id: challengeId,
    title: "A Challenge",
    game: "League of Legends",
    provider: "riot-lol",
    state: "announced",
    startAt: new Date("2026-09-07T00:00:00Z"),
    endAt: new Date("2026-09-11T00:00:00Z"),
    prizePoolCents: 17_500,
  });

  const { announceChallenge } = await import("../../lib/discord/announce.ts");
  const result = await announceChallenge(db, challengeId);

  eq(result.guilds, 2, "the two live servers, and not the one that removed the bot");
  eq(result.queued, 2, "one queued row each");

  const queued = await db.select().from(schema.discordPostQueue);
  eq(queued.length, 2, "the rows are in the queue, not posted inline");
  ok(
    queued.every((q) => q.ledgerChallengeId === challengeId),
    "each carries the ledger key that makes a second send a no-op",
  );

  // The card has to carry a Join button, or it is a notification rather than
  // the first step of the funnel.
  const payload = queued[0].payload as { components?: { components?: { label?: string }[] }[] };
  const labels = (payload.components ?? []).flatMap((r) => (r.components ?? []).map((b) => b.label));
  ok(labels.includes("Join"), `the card can be joined from: ${labels.join(", ")}`);
});

test("a community challenge is announced to its own server only", async () => {
  // C24/M25 — it is public on the web, and announced privately to the server
  // that paid for it. Announcing it everywhere would make one server's
  // advertising into everybody's noise.
  const db = await resetDemoDb();
  await aGuild(db, { guildId: "owner-guild" });
  await aGuild(db, { guildId: "other-guild" });

  const challengeId = uid();
  await db.insert(schema.challenges).values({
    id: challengeId,
    title: "Our Own Thing",
    game: "League of Legends",
    provider: "riot-lol",
    state: "announced",
    visibility: "community",
    guildId: "owner-guild",
    startAt: new Date("2026-09-07T00:00:00Z"),
    endAt: new Date("2026-09-11T00:00:00Z"),
    prizePoolCents: 500,
  });

  const { announceChallenge } = await import("../../lib/discord/announce.ts");
  const result = await announceChallenge(db, challengeId);
  eq(result.guilds, 1, "one server");

  const queued = await db.select().from(schema.discordPostQueue);
  eq(queued[0].guildId, "owner-guild", "and it is the one that runs it");

  const payload = queued[0].payload as { embeds?: { description?: string }[] };
  ok(
    /community challenge run by/i.test(payload.embeds?.[0]?.description ?? ""),
    `C27 — the wording is always the server's: ${payload.embeds?.[0]?.description}`,
  );
});

test("the winners card names the server each winner came from", async () => {
  // 04 §4 and 01-CYCLE both say it explicitly, and it is the cheapest
  // advertising the pool has: a server reads its own name on a card that went
  // to every other server on the platform.
  //
  // The name comes from `parentGuildIdAtBaseline` — the **frozen** stamp, not
  // the live parent. A1b: the winner belongs to the server that had them when
  // the week ran.
  const db = await resetDemoDb();
  await aGuild(db, { guildId: "winners-home", name: "Winners Home" });
  await aGuild(db, { guildId: "somewhere-else", name: "Somewhere Else" });

  const challengeId = uid();
  await db.insert(schema.challenges).values({
    id: challengeId,
    title: "Closed Week",
    game: "League of Legends",
    provider: "riot-lol",
    state: "ended",
    startAt: new Date("2026-09-07T00:00:00Z"),
    endAt: new Date("2026-09-11T00:00:00Z"),
    prizePoolCents: 17_500,
  });

  const userId = uid();
  await db.insert(schema.users).values({
    id: userId,
    slug: `u-${userId.toLowerCase()}`,
    displayName: "The Winner",
    // The **live** parent is the other server, so a card reading this instead
    // of the frozen stamp would name the wrong one.
    parentGuildId: "somewhere-else",
  });
  const accountId = uid();
  await db.insert(schema.linkedGameAccounts).values({
    id: accountId,
    userId,
    provider: "riot-lol",
    providerAccountId: `puuid-${accountId}`,
    verified: true,
    verifiedMethod: "icon",
  });
  await db.insert(schema.challengeParticipants).values({
    id: uid(),
    challengeId,
    userId,
    linkedAccountId: accountId,
    joinGuildId: "winners-home",
    parentGuildIdAtBaseline: "winners-home",
    joinedAt: new Date("2026-09-07T00:00:00Z"),
    baselineAt: new Date("2026-09-07T00:00:00Z"),
    placement: 1,
  });

  const { announceWinners } = await import("../../lib/discord/announce.ts");
  await announceWinners(db, challengeId);

  const queued = await db.select().from(schema.discordPostQueue);
  const payload = queued[0].payload as { embeds?: { fields?: { name: string; value: string }[] }[] };
  const field = payload.embeds?.[0]?.fields?.[0];
  ok(field !== undefined, "the card names a winner");
  ok(/The Winner/.test(field!.name), `and who they are: ${field!.name}`);
  eq(field!.value, "Winners Home", "and the server they came from — the frozen one");
});

// ── The card itself ─────────────────────────────────────────────────────────

test("a card says everything without its picture", () => {
  // House rule 11, in the form it takes here. `cardReply` falls back to this
  // text when the renderer throws — so if the fallback dropped the figures,
  // a card whose artwork failed would arrive saying nothing.
  const text = cardText({
    title: "A Challenge",
    subtitle: "League of Legends",
    rows: [
      { label: "Prize pool", value: "$175.00" },
      { label: "Entrants", value: "62" },
    ],
    footer: "3 days left.",
  });

  ok(text.includes("A Challenge"), "the title");
  ok(text.includes("$175.00"), "and the money — the figure the card exists to carry");
  ok(text.includes("62"), "and the entrants");
  ok(text.includes("3 days left."), "and the footer");
});

test("the lifecycle bar the bot and the web share reads the same either side", () => {
  // 01-CYCLE's one-function rule, at its smallest: the bot's stage line and
  // the website's progress bar are the same derivation, so a challenge cannot
  // read "live" on one surface and "announced" on the other.
  eq(lifecycleProgress("live").done, 5, "live is the fifth of six");
  eq(lifecycleProgress("ended").percent, 100, "and ended is finished");
});

// ── The close, as a job rather than as a test that orchestrates one ─────────

test("the daily job runs the whole close, not two steps of it", async () => {
  // ===== THE ONE THIS SUITE EXISTS FOR =====
  //
  // `runDailyJobs` ran `stampBaselinesAtGun` and `closeChallenges` and stopped.
  // No trophies, no draft payout, no week record, no announcement — on a real
  // deployment the entire close, as a gamer or an owner experiences it, did
  // not happen.
  //
  // Every step was built, correct, and guarded. `99-full-cycle` ran them **by
  // hand**, in this order, which is exactly why nothing noticed: the band
  // orchestrated the close itself, so it never asked whether anything else
  // did. §0.1, on the largest thing on the platform.
  //
  // ===== CAN THIS FAIL? =====
  //
  // Every assertion below is a separate step of 03 §9, and removing any one
  // line from `runDailyJobs` turns exactly one of them red. That is the shape
  // this guard has to have: a single "the close ran" assertion would go green
  // on a job that did half of it.
  const db = await resetDemoDb();
  const { closeWeek: _unused } = await import("../../lib/pool/score.ts");
  void _unused;

  const weekStart = new Date("2026-09-07T00:00:00Z");
  const closeAt = new Date("2026-09-11T00:00:01Z");
  await aClosableWeek(db, weekStart);

  const { runDailyJobs } = await import("../../lib/challenges/jobs.ts");
  const result = await runDailyJobs(db, closeAt);

  eq(result.close.closed.length, 1, "the challenge closed");

  // 03 §9 step 3 and 4 — podium trophies, and the $0 collectable for everyone
  // who turned up.
  const awarded = await db.select().from(schema.userTrophies);
  ok(awarded.length > 0, `trophies were awarded (${awarded.length})`);
  ok(result.settled > 0, "and the job says how many");

  // Step 8 — the pool, and payouts opened as **drafts**. A1: it computes, a
  // human releases, so nothing here may be `released`.
  const payouts = await db.select().from(schema.serverPayouts);
  ok(payouts.length > 0, `a payout was drafted (${payouts.length})`);
  ok(
    payouts.every((p) => p.status === "draft"),
    "and every one of them is a draft — a job never releases money",
  );

  // W1 — the week's working, written once, from the division the close made.
  const records = await db.select().from(schema.weekRecords);
  ok(records.length > 0, `the week's record was written (${records.length} rows)`);

  // Steps 7 and 9 — winners on Friday, pool standings on Saturday. Both
  // through the queue (A3), which is what these rows are.
  const queued = await db.select().from(schema.discordPostQueue);
  const kinds = new Set(queued.map((q) => q.ledgerKind));
  ok(kinds.has("result"), `the close announced something: ${[...kinds].join(", ")}`);
  ok(result.announced > 0, "and the job says how many cards");
  ok(result.pool.announced > 0, "including the pool standings");
});

test("running the close twice awards nothing twice", async () => {
  // Trap 14's shape, on the job that matters most. A cron fires on a schedule
  // and a schedule fires twice — a retried invocation, an operator pressing
  // the button, a deploy that overlaps. Every step in the close is idempotent
  // and this is where that is checked as one property rather than six.
  const db = await resetDemoDb();
  const weekStart = new Date("2026-09-07T00:00:00Z");
  const closeAt = new Date("2026-09-11T00:00:01Z");
  await aClosableWeek(db, weekStart);

  const { runDailyJobs } = await import("../../lib/challenges/jobs.ts");
  await runDailyJobs(db, closeAt);

  const after = {
    trophies: (await db.select().from(schema.userTrophies)).length,
    payouts: (await db.select().from(schema.serverPayouts)).length,
    records: (await db.select().from(schema.weekRecords)).length,
  };

  await runDailyJobs(db, new Date(closeAt.getTime() + 60_000));

  eq((await db.select().from(schema.userTrophies)).length, after.trophies, "no second trophy");
  eq((await db.select().from(schema.serverPayouts)).length, after.payouts, "no second payout");
  eq((await db.select().from(schema.weekRecords)).length, after.records, "no second record");
});

/** A week with one paid, announced, trophied challenge and two entrants. */
async function aClosableWeek(
  db: Awaited<ReturnType<typeof resetDemoDb>>,
  weekStart: Date,
): Promise<string> {
  const { createGamer } = await import("../../lib/identity/gamers.ts");
  const { createInvoice, markPaid } = await import("../../lib/money/invoices.ts");
  const { createChallenge, attachInvoice, markScheduled, announce } = await import(
    "../../lib/challenges/lifecycle.ts"
  );
  const { createTrophy } = await import("../../lib/trophies/trophies.ts");
  const { allocateToPool } = await import("../../lib/money/pool.ts");
  const { freezeEligibilityAtGun, LINKED_MEMBERS_TO_UNLOCK_POOL } = await import(
    "../../lib/pool/eligibility.ts"
  );
  const { CHALLENGE_PRICE_CENTS } = await import("../../lib/money/amounts.ts");

  const guildId = await aGuild(db, {
    guildId: "close-guild",
    name: "Nightfall",
    community: "A competitive community.",
    memberAgeRange: "18-24",
    gamesPlayed: ["Chess"],
    inviteUrl: "https://discord.gg/close-guild",
    coverImageUrl: "https://cdn.test/close.png",
  });

  for (let i = 0; i < LINKED_MEMBERS_TO_UNLOCK_POOL + 1; i++) {
    const userId = await createGamer(db, { displayName: `m${i}`, parentGuildId: guildId });
    await db.insert(schema.linkedGameAccounts).values({
      id: uid(),
      userId,
      provider: "chesscom",
      providerAccountId: `acct-${uid()}`,
      verified: true,
      verifiedMethod: "exists",
    });
  }
  await freezeEligibilityAtGun(db, weekStart);

  const challengeId = await createChallenge(db, {
    title: "Acme Weekly",
    game: "Chess",
    provider: "chesscom",
    startAt: weekStart,
    metrics: { wins: 10, matches: 1 },
    prizePoolCents: 17_500,
    places: 1,
  });
  const invoiceId = await createInvoice(db, {
    payerType: "brand",
    lines: [{ description: "Challenge", amountCents: CHALLENGE_PRICE_CENTS }],
  });
  await attachInvoice(db, challengeId, invoiceId);
  await markPaid(db, invoiceId);
  await markScheduled(db, challengeId);
  // T3 — the podium values must equal the prize pool, or the announce refuses.
  await createTrophy(db, {
    name: "Acme Champion",
    type: "podium",
    valueCents: 17_500,
    challengeId,
    place: 1,
  });
  await announce(db, challengeId, "admin-1", [guildId]);

  for (let i = 0; i < 2; i++) {
    const userId = await createGamer(db, { displayName: `entrant-${i}`, parentGuildId: guildId });
    const accountId = uid();
    await db.insert(schema.linkedGameAccounts).values({
      id: accountId,
      userId,
      provider: "chesscom",
      providerAccountId: `entrant-acct-${uid()}`,
      verified: true,
      verifiedMethod: "exists",
    });
    await db.insert(schema.challengeParticipants).values({
      id: uid(),
      challengeId,
      userId,
      linkedAccountId: accountId,
      joinGuildId: guildId,
      parentGuildIdAtBaseline: guildId,
      joinedAt: weekStart,
      baselineAt: weekStart,
      baseline: { wins: 0, matches: 0 },
    });
    // Somebody has to have played, or activation is zero and the server earns
    // nothing — which would make the payout assertion pass for the wrong
    // reason on a week where nothing happened.
    // One row per metric, which is what the table actually stores. A wide row
    // per reading would have made `scoreFrom` read a JSON blob, and a metric
    // added later would then be invisible to every observation before it.
    for (const [metricKey, value] of [
      ["wins", i + 1],
      ["matches", (i + 1) * 3],
    ] as const) {
      await db.insert(schema.observations).values({
        id: uid(),
        linkedAccountId: accountId,
        provider: "chesscom",
        metricKey,
        value,
        observedAt: new Date(weekStart.getTime() + 60_000),
      });
    }
  }

  await allocateToPool(db, { weekStart, amountCents: 4_000 });
  return challengeId;
}

// ── Convert on upload, and the path list that is finally consulted ──────────

test("nothing that is not PNG or JPEG reaches the store", async () => {
  // ===== THE RULE HAD NO CALLER FOR TWO SPRINTS =====
  //
  // `acceptImage` has said *"nothing that is not PNG or JPEG reaches storage"*
  // since Stage 6 and nothing called it, so the rule was enforced by nobody.
  // `/api/uploads` is its door, and `putImage` takes a `StoredImage` — which
  // only `acceptImage` produces — so the type is the gate rather than a check
  // somebody could route around.
  const { acceptImage, UploadRefused } = await import("../../lib/cards/upload.ts");
  const { putImage, readImage } = await import("../../lib/cards/store.ts");

  const png = await acceptImage({
    bytes: new Uint8Array([1, 2, 3]),
    contentType: "image/png",
  });
  const stored = await putImage(png, "img-png");
  eq(readImage("img-png")?.contentType, "image/png", "a PNG goes through untouched");
  no(stored.converted, "and needed no converting");

  // WebP is the one that bites: the renderer answers `Unsupported image type`
  // and the artwork simply does not appear. With no converter configured the
  // refusal is the honest failure — the alternative is storing it and finding
  // out months later that every card carrying it renders blank.
  const refused = await (async () => {
    try {
      await acceptImage({ bytes: new Uint8Array([1]), contentType: "image/webp" });
      return null;
    } catch (e) {
      return e;
    }
  })();
  ok(refused instanceof UploadRefused, "a WebP with no converter is refused, in words");
  ok(/PNG and JPEG/.test((refused as Error).message), "naming what the renderer can read");

  // And with one, it is **converted rather than rejected** — 11-PORTED is
  // explicit that the rule is not "reject WebP": a brand told their logo is
  // the wrong format will send it anyway, in an email, on a Friday.
  const converted = await acceptImage(
    { bytes: new Uint8Array([1]), contentType: "image/webp" },
    async () => ({ bytes: new Uint8Array([9, 9]), contentType: "image/png" as const }),
  );
  ok(converted.converted, "a converter turns it into something drawable");
  eq(converted.contentType, "image/png", "and what reaches the store is PNG");

  await putImage(converted, "img-webp");
  eq(readImage("img-webp")?.contentType, "image/png", "so the store never holds a WebP");
});

test("a Riot call is checked against the approved path list before it goes out", async () => {
  // `riot-methods.ts` is *"the authority"* on the 39 paths the personal key can
  // call. It was written down, diffed path by path against Riot's own list —
  // and read by nothing. An unapproved path returns a 403 that looks exactly
  // like an expired key, and 10 §4 warns that sends whoever is debugging it to
  // regenerate a key that has not expired.
  const { isApprovedRiotPath, riotPathShape } = await import(
    "../../lib/providers/riot-methods.ts"
  );

  const approved = riotPathShape(
    "https://euw1.api.riotgames.com/lol/summoner/v4/summoners/by-puuid/abc",
  );
  ok(isApprovedRiotPath(approved), `the icon proof's own path is approved: ${approved}`);

  // VALORANT: not one endpoint survives on this key, not even platform status.
  const val = riotPathShape("https://eu.api.riotgames.com/val/ranked/v1/leaderboards/by-act/x");
  no(isApprovedRiotPath(val), `and a VAL path is not: ${val}`);

  // ===== BEHAVIOUR, THEN THE CHOKEPOINT — AND THE FIRST VERSION WAS NEITHER
  //
  // This guard originally asserted that `riot-verify.ts` **mentions**
  // `isApprovedRiotPath`. Deleting the call went straight through, because the
  // import line still mentioned it. Trap 16, in a guard written to close a
  // §0.1 hole: I guarded the vocabulary instead of the thing.
  const { assertApprovedRiotPath } = await import("../../lib/providers/riot-verify.ts");
  await throws(
    async () =>
      assertApprovedRiotPath("https://eu.api.riotgames.com/val/ranked/v1/leaderboards/by-act/x"),
    /not one of the paths/,
    "an unapproved path is refused before the fetch",
  );
  // The positive half, or a function that refused everything would pass.
  assertApprovedRiotPath("https://euw1.api.riotgames.com/lol/summoner/v4/summoners/by-puuid/abc");

  // And the chokepoint: every Riot call in the module goes through one fetch
  // helper, and that helper calls it. Asserted with the imports stripped, so
  // the name surviving at the top of the file cannot satisfy it.
  const fs = await import("node:fs/promises");
  const path = await import("node:path");
  const repoRoot = path.resolve(new URL("../..", import.meta.url).pathname);
  const src = await fs.readFile(
    path.join(repoRoot, "lib", "providers", "riot-verify.ts"),
    "utf8",
  );
  // Imports **and comments** stripped. The comment above the call explains the
  // rule at length and would satisfy a naive search on its own — which is the
  // same defect one layer down: a guard matching prose about a thing rather
  // than the thing.
  const body = src
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/^\s*\/\/.*$/gm, "")
    .replace(/^import[^;]*;$/gm, "");
  ok(/async function riot</.test(body), "the read reached the module — an empty read proves nothing");
  const helper = body.slice(body.indexOf("async function riot<"));
  ok(
    /assertApprovedRiotPath\(/.test(helper.slice(0, 400)),
    "and the fetch helper calls it, rather than the file merely importing it",
  );
});

test("a card renders with no brand fonts installed", async () => {
  // ===== THE FENCE HID THIS FOR A WHOLE SPRINT =====
  //
  // `ImageResponse` ships a vendored font and uses it when `fonts` is
  // **omitted**. Passing `fonts: []` throws — and `loadCardFonts()` returns
  // `[]` when no brand fonts are installed, which is the documented normal
  // case. So every card on the platform threw, `fence` caught it, the text
  // fallback went out, and nothing ever failed.
  //
  // That is house rule 11 working and hiding the reason it was working. The
  // product silently lost its entire visual identity and told nobody; it was
  // found by pressing a button on a real build and reading the log.
  //
  // ===== CAN THIS FAIL? =====
  //
  // Yes: restore `fonts: []` and this throws with the renderer's own message.
  // Which is why the assertion is on **bytes returned**, not on `fence`
  // reporting success — a card that renders text-only also "succeeds", and
  // that is the state this exists to catch.
  const { renderCard } = await import("../../lib/cards/render.ts");
  const { loadCardFonts } = await import("../../lib/cards/fonts.ts");

  eq(
    (await loadCardFonts()).length,
    0,
    "no brand fonts are installed here — which is the case that broke",
  );

  const card = await renderCard({
    title: "A Challenge",
    subtitle: "League of Legends",
    rows: [{ label: "Prize pool", value: "$175.00" }],
    footer: "3 days left.",
  });

  ok(card.png.byteLength > 0, `a PNG came back (${card.png.byteLength} bytes)`);
  no(card.artworkDropped, "and no artwork was asked for, so none was dropped");
});

test("the card family string never names a font that is not loaded", async () => {
  // `cardFontFamily` was exported and called by nothing while the layout named
  // `Cluster` by hand — a family the renderer has never heard of unless
  // somebody has dropped the TTFs in. Harmless on its own, and exactly the
  // shape of thing that is true until it is not.
  const { cardFontFamily } = await import("../../lib/cards/fonts.ts");
  eq(cardFontFamily([]), "sans-serif", "with none installed, the built-in");
  eq(
    cardFontFamily([{ name: "Cluster", data: new ArrayBuffer(0), weight: 400, style: "normal" }]),
    '"Cluster", sans-serif',
    "and the brand face when there is one",
  );

  const fs = await import("node:fs/promises");
  const path = await import("node:path");
  const repoRoot = path.resolve(new URL("../..", import.meta.url).pathname);
  const src = await fs.readFile(path.join(repoRoot, "lib", "cards", "render.ts"), "utf8");
  const body = src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
  ok(/fontFamily:/.test(body), "the read reached the layout");
  no(
    /fontFamily:\s*["'`][^"'`]*Cluster/.test(body),
    "and the layout asks the module rather than naming a family it hopes exists",
  );
});
