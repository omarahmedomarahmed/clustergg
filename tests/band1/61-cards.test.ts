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

import { ok, eq, no } from "../helpers/assert.ts";
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
