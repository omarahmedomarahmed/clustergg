// The guild registry, ownership transfer, and reassignment — 12 §6, §8.
//
// This is the page opened when an owner asks *"why am I not earning?"*, and
// the two rules that shape it are both about **what we deliberately do not
// know**: refresh pulls owner and roles only (G3), and role holders are people
// we have *seen* rather than a list we read (G5). Both are honest gaps, and
// the page has to say so or admin will act on somebody's absence.

import { ok, eq, no, throws } from "../helpers/assert.ts";
import { test } from "../helpers/suite.ts";
import { resetDemoDb, schema, type DB } from "../../lib/db/index.ts";
import {
  arbitrateTransfer,
  confirmTransfer,
  guildRegistry,
  reassignmentState,
  reassignOwner,
  recordOwnerDm,
  RegistryRefused,
  setAgeBandByAdmin,
  transferStateOf,
  REASSIGNMENT_AFTER_MS,
  TRANSFER_TIMEOUT_MS,
} from "../../lib/admin/registry.ts";
import { refreshGuild } from "../../lib/discord/guilds.ts";
import { seeAdmin } from "../../lib/discord/ownership.ts";
import { mayWithdraw, TRANSFER_FREEZE_MS } from "../../lib/portal/permissions.ts";
import { createGamer } from "../../lib/identity/gamers.ts";
import { eq as sqlEq } from "drizzle-orm";

const NOW = new Date("2026-09-09T12:00:00Z");
const OLD_OWNER = "111111111111111111";
const NEW_OWNER = "222222222222222222";
const ADMIN = "333333333333333333";
const days = (n: number) => new Date(NOW.getTime() + n * 24 * 60 * 60 * 1000);

// ── Refresh: owner and roles, never members ─────────────────────────────────

test("refresh pulls owner and roles only, and never the member list", async () => {
  // G3, asserted against a **recorded call list** rather than by reading the
  // source. A guard that greps for `/members` catches the spelling somebody
  // used; this catches the call.
  const db = await resetDemoDb();
  await aGuild(db);

  const calls: string[] = [];
  const result = await refreshGuild(
    db,
    "g1",
    {
      guild: async (id) => {
        calls.push(`guild:${id}`);
        return { ownerId: OLD_OWNER, name: "Nightfall", memberCount: 4300 };
      },
      roles: async (id) => {
        calls.push(`roles:${id}`);
        return [{ id: "333333333333333333", name: "Moderators", permissions: "8" }];
      },
    },
    NOW,
  );

  ok(result.ok, "the refresh worked");
  eq(calls, ["guild:g1", "roles:g1"], "two calls, and neither of them is a member list");
  no(
    calls.some((c) => /member/i.test(c)),
    "12 §7 — never list guild members on any path the product depends on",
  );

  // ===== AND THE HALF THE CALL LIST CANNOT SEE =====
  //
  // The recorded list catches anything routed through the injected fetcher,
  // which is every call this function is *supposed* to make. It cannot see a
  // direct REST call added beside them — and that is the realistic way this
  // rule gets broken, because `discordRest` is right there and a member list
  // is one path away. Break 156 was exactly this: a call added through the
  // fetcher was a no-op, because the test's fetcher has no such key to hit.
  //
  // `/guilds/{id}/members` is an unavoidable literal, so here the vocabulary
  // *is* the chokepoint: there is no way to page a member list without naming
  // that path.
  const fs = await import("node:fs/promises");
  const path = await import("node:path");
  const repoRoot = path.resolve(new URL("../..", import.meta.url).pathname);
  const src = await fs.readFile(path.join(repoRoot, "lib", "discord", "guilds.ts"), "utf8");
  const code = src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
  ok(/refreshGuild/.test(code), "the walk read the right file — an empty read would prove nothing");
  no(
    /\/members|listMembers|guildMembers|GUILD_MEMBERS/.test(code),
    "and nothing in it reaches for a member list by any spelling",
  );
});

test("role holders are people we have seen, and the page says so", async () => {
  // G5. Honestly incomplete, and the incompleteness is stated — a list that
  // reads as "who holds the role" is one admin will act on, telling somebody
  // they do not have a role when the truth is we have never seen them press
  // anything.
  const db = await resetDemoDb();
  await aGuild(db);
  await seeAdmin(db, { guildId: "g1", discordId: ADMIN, source: "mapped_role" });

  const registry = await guildRegistry(db, "g1", NOW);
  eq(registry!.permissions.seenHolders.length, 1, "one holder, seen");
  eq(registry!.permissions.seenHolders[0].source, "mapped_role", "and how we saw them");
  ok(registry!.permissions.seenHolders[0].seenAt instanceof Date, "and when");
  ok(/have \*\*seen\*\*/.test(registry!.permissions.note), "the page says seen");
  ok(
    /never pressed a button will not appear/.test(registry!.permissions.note),
    "and names exactly who is missing from it",
  );
  ok(
    /do not read your member list/.test(registry!.permissions.note),
    "and why we do not close the gap",
  );
});

// ── Transfer ────────────────────────────────────────────────────────────────

test("a transfer waits on the outgoing owner for fourteen days", () => {
  eq(
    transferStateOf({ ownershipTransferAt: null, transferConfirmedAt: null }, NOW).state,
    "none",
    "a server nobody is transferring is not in a transfer state",
  );

  const waiting = transferStateOf(
    { ownershipTransferAt: NOW, transferConfirmedAt: null },
    days(3),
  );
  eq(waiting.state, "awaiting_confirmation", "day three: still theirs to answer");
  eq(
    waiting.state === "awaiting_confirmation" && waiting.deadline.getTime(),
    NOW.getTime() + TRANSFER_TIMEOUT_MS,
    "with a deadline fourteen days out",
  );

  const timedOut = transferStateOf(
    { ownershipTransferAt: NOW, transferConfirmedAt: null },
    days(15),
  );
  // T5 — without a timeout, a vanished or hostile old owner locks the money
  // for ever. And it is not "confirmed by default": a human must now decide.
  eq(timedOut.state, "timed_out", "day fifteen: admin arbitrates");
});

test("only the outgoing owner can confirm a transfer", async () => {
  // T2, and the plausible mistake is the incoming owner confirming their own —
  // they are the one asking for it.
  const db = await resetDemoDb();
  await aGuild(db, { ownershipTransferAt: NOW });

  const err = await throws(
    () => confirmTransfer(db, { guildId: "g1", byDiscordId: NEW_OWNER }, days(1)),
    /Only the outgoing owner/,
    "the incoming owner cannot confirm their own transfer",
  );
  ok(err instanceof RegistryRefused, "by name");

  await confirmTransfer(db, { guildId: "g1", byDiscordId: OLD_OWNER }, days(1));
  const [guild] = await db.select().from(schema.guilds).where(sqlEq(schema.guilds.guildId, "g1"));
  ok(guild.transferConfirmedAt !== null, "the outgoing owner can");

  const [entry] = await db
    .select()
    .from(schema.auditLog)
    .where(sqlEq(schema.auditLog.action, "guild.transfer.confirmed"));
  eq(entry.refId, "g1", "and it is logged against the server");
});

test("a confirmed transfer freezes withdrawal for seven days, and the registry says until when", async () => {
  // T4. The registry and the withdrawal gate must agree, so both read
  // `TRANSFER_FREEZE_MS` from the module that owns it rather than each stating
  // seven days — two surfaces telling an owner different dates about their own
  // money is the failure this shares an import to prevent.
  const db = await resetDemoDb();
  await aGuild(db, { ownershipTransferAt: NOW });
  await confirmTransfer(db, { guildId: "g1", byDiscordId: OLD_OWNER }, days(1));

  const registry = await guildRegistry(db, "g1", days(2));
  const transfer = registry!.ownership.transfer;
  eq(transfer.state, "confirmed", "confirmed");
  eq(
    transfer.state === "confirmed" && transfer.withdrawalFrozenUntil.getTime(),
    days(1).getTime() + TRANSFER_FREEZE_MS,
    "and the registry shows the same date the withdrawal gate uses",
  );

  const verdict = mayWithdraw({
    access: { kind: "owner", discordId: NEW_OWNER },
    ageBand: "adult",
    country: "GB",
    transferConfirmedAt: days(1),
    now: days(2),
  });
  no(verdict.allowed, "and withdrawal really is frozen");
});

test("arbitration is only available after the timeout, and is logged as arbitration", async () => {
  // Deliberately a different audit action from a confirmation: *"nobody
  // answered and admin decided"* and *"the owner agreed"* are different facts
  // about the same server, and a log that conflates them cannot answer a
  // dispute six months later.
  const db = await resetDemoDb();
  await aGuild(db, { ownershipTransferAt: NOW });

  await throws(
    () =>
      arbitrateTransfer(
        db,
        { guildId: "g1", actorId: "admin-1", newOwnerDiscordId: NEW_OWNER, reason: "asked" },
        days(3),
      ),
    /still has until/,
    "day three: the outgoing owner's fourteen days are theirs",
  );

  await arbitrateTransfer(
    db,
    { guildId: "g1", actorId: "admin-1", newOwnerDiscordId: NEW_OWNER, reason: "no answer" },
    days(15),
  );
  const [guild] = await db.select().from(schema.guilds).where(sqlEq(schema.guilds.guildId, "g1"));
  eq(guild.ownerDiscordId, NEW_OWNER, "day fifteen: admin can decide");
  eq(guild.ownerFirstSignInAt, null, "and 'has the owner signed in' is now about somebody else");

  const actions = (await db.select().from(schema.auditLog)).map((a) => a.action);
  ok(actions.includes("guild.transfer.arbitrated"), "logged as an arbitration");
  no(actions.includes("guild.transfer.confirmed"), "and never as a confirmation");
});

// ── The four-week reassignment clock ────────────────────────────────────────

test("an owner who has never signed in may be reassigned after four weeks", () => {
  const installed = { ownerFirstSignInAt: null, installedAt: NOW };
  no(reassignmentState(installed, days(27)).eligible, "day 27: not yet");
  ok(reassignmentState(installed, days(29)).eligible, "day 29: open");
  eq(
    reassignmentState(installed, days(29)).at.getTime(),
    NOW.getTime() + REASSIGNMENT_AFTER_MS,
    "four weeks from when we first saw the server",
  );

  // The clock is about an owner who never appears. One sign-in ends it for
  // good — they exist, and reassigning a real owner is not a thing we do.
  no(
    reassignmentState({ ownerFirstSignInAt: days(1), installedAt: NOW }, days(400)).eligible,
    "an owner who signed in once is never reassignable, however long ago",
  );
});

test("the claimant must hold ADMINISTRATOR at that moment", async () => {
  // 12 §6's clause, and the reason it is an argument rather than a lookup:
  // `guild_admins` is what we have **seen**, and a role somebody held in March
  // is not a role they hold today.
  const db = await resetDemoDb();
  await aGuild(db, { ownerFirstSignInAt: null });

  await throws(
    () =>
      reassignOwner(
        db,
        {
          guildId: "g1",
          actorId: "admin-1",
          newOwnerDiscordId: NEW_OWNER,
          claimantHoldsAdministrator: false,
          reason: "owner never appeared",
        },
        days(30),
      ),
    /must hold ADMINISTRATOR on this server right now/,
    "a claimant who does not hold it now is refused",
  );

  await throws(
    () =>
      reassignOwner(
        db,
        {
          guildId: "g1",
          actorId: "admin-1",
          newOwnerDiscordId: NEW_OWNER,
          claimantHoldsAdministrator: true,
          reason: "owner never appeared",
        },
        days(10),
      ),
    /reassignment opens on/,
    "and four weeks is four weeks, whoever is asking",
  );

  // ===== L9 — AND THE THIRD CONDITION, WHICH IS THE EXPENSIVE ONE =====
  //
  // *"Reassigning somebody who was never notified is indistinguishable from
  // taking their money."* Both conditions above are met here and it is still
  // refused, because nobody has told this owner anything.
  await throws(
    () =>
      reassignOwner(
        db,
        {
          guildId: "g1",
          actorId: "admin-1",
          newOwnerDiscordId: NEW_OWNER,
          claimantHoldsAdministrator: true,
          reason: "owner never appeared",
        },
        days(30),
      ),
    /has not been warned yet/,
    "a warning that was never sent is not a warning",
  );

  // A DM that Discord refused is not a warning either, and it says which.
  await recordOwnerDm(db, { guildId: "g1", state: "failed" });
  await throws(
    () =>
      reassignOwner(
        db,
        {
          guildId: "g1",
          actorId: "admin-1",
          newOwnerDiscordId: NEW_OWNER,
          claimantHoldsAdministrator: true,
          reason: "owner never appeared",
        },
        days(30),
      ),
    /Discord refused to deliver it/,
    "and an owner who blocks DMs is un-reassignable, which is the intended answer",
  );

  await recordOwnerDm(db, { guildId: "g1", state: "sent" });
  await reassignOwner(
    db,
    {
      guildId: "g1",
      actorId: "admin-1",
      newOwnerDiscordId: NEW_OWNER,
      claimantHoldsAdministrator: true,
      reason: "owner never appeared",
    },
    days(30),
  );
  const [guild] = await db.select().from(schema.guilds).where(sqlEq(schema.guilds.guildId, "g1"));
  eq(guild.ownerDiscordId, NEW_OWNER, "with all three conditions met, it happens");
  const [entry] = await db
    .select()
    .from(schema.auditLog)
    .where(sqlEq(schema.auditLog.action, "guild.owner.reassigned"));
  eq((entry.detail as Record<string, unknown>).from, OLD_OWNER, "logged, with who it was");
  eq((entry.detail as Record<string, unknown>).reason, "owner never appeared", "and why");
});

// ── The DM that fails quietly ───────────────────────────────────────────────

test("a failed owner DM is a recorded state, not an error swallowed on a background path", async () => {
  // 12 §6. **We cannot email a guild owner before they sign in** — Discord
  // never gives us an address — so every owner-facing promise runs through
  // that DM. An owner who blocks DMs from server members never receives it and
  // Discord says so quietly, which means a silent failure is an owner who is
  // never told they are earning money.
  const db = await resetDemoDb();
  await aGuild(db);

  await recordOwnerDm(db, { guildId: "g1", state: "blocked" }, NOW);
  const registry = await guildRegistry(db, "g1", NOW);
  eq(registry!.ownership.dmState, "blocked", "the registry shows it");
  no(registry!.ownership.hasEverSignedIn, "on a server whose owner has never appeared");

  const [entry] = await db
    .select()
    .from(schema.auditLog)
    .where(sqlEq(schema.auditLog.action, "guild.owner_dm.failed"));
  ok(entry !== undefined, "and it is in the audit log rather than a console line nobody reads");

  // A DM that worked is recorded too, and logs nothing — otherwise the audit
  // trail is one row per week per server and the failures are invisible in it.
  await recordOwnerDm(db, { guildId: "g1", state: "sent" }, days(7));
  eq(
    (await db.select().from(schema.auditLog)).length,
    1,
    "a successful DM adds no noise to the log",
  );
});

// ── Admin corrections ───────────────────────────────────────────────────────

test("admin sets an age band, and it is logged with both sides", async () => {
  // G4/G9 — a gamer can never change their own, and a 13–17 gamer who turns 18
  // must contact support. This is that support path.
  const db = await resetDemoDb();
  const userId = await createGamer(db, { displayName: "Turned eighteen" });
  await db.update(schema.users).set({ ageBand: "teen" }).where(sqlEq(schema.users.id, userId));

  await throws(
    () => setAgeBandByAdmin(db, { userId, ageBand: "adult", actorId: userId, reason: "birthday" }),
    /never set their own age band/,
    "not even by signing in as an admin and doing it to themselves",
  );
  await throws(
    () => setAgeBandByAdmin(db, { userId, ageBand: "adult", actorId: "", reason: "birthday" }),
    /changed by a person/,
    "and never by nobody",
  );

  await setAgeBandByAdmin(
    db,
    { userId, ageBand: "adult", actorId: "admin-1", reason: "ID checked" },
    NOW,
  );
  const [row] = await db.select().from(schema.users).where(sqlEq(schema.users.id, userId));
  eq(row.ageBand, "adult", "support can");
  const [entry] = await db
    .select()
    .from(schema.auditLog)
    .where(sqlEq(schema.auditLog.action, "user.age_band.set"));
  eq((entry.detail as Record<string, unknown>).from, "teen", "logged, from");
  eq((entry.detail as Record<string, unknown>).to, "adult", "to");
  eq((entry.detail as Record<string, unknown>).reason, "ID checked", "and why");
});

// ── The eight sections ──────────────────────────────────────────────────────

test("the registry answers why am I not earning, in one object", async () => {
  const db = await resetDemoDb();
  await aGuild(db, { coverImageUrl: null });

  const registry = await guildRegistry(db, "g1", NOW);
  ok(registry !== null, "the page has something to render");
  ok(registry!.ownership.ownerDiscordId !== null, "1 · ownership");
  ok("installedByDiscordId" in registry!.install, "2 · who installed it");
  ok(Array.isArray(registry!.permissions.seenHolders), "3 · permissions");
  ok(registry!.eligibility !== null, "4 · pool eligibility");
  no(registry!.eligibility!.eligible, "and it is the answer to the question the page is for");
  ok(/profile field/.test(registry!.eligibility!.reason ?? ""), "field by field, in words");
  ok(Array.isArray(registry!.money.pendingSpendRequests), "5 · money");
  ok("granted" in registry!.analytics, "7 · analytics");
  ok(Array.isArray(registry!.audit), "8 · audit");

  eq(await guildRegistry(db, "nope", NOW), null, "and a server we have never seen is null");
});

// ── Fixtures ────────────────────────────────────────────────────────────────

async function aGuild(db: DB, over: Record<string, unknown> = {}) {
  await db.insert(schema.guilds).values({
    guildId: "g1",
    name: "Nightfall",
    slug: "nightfall",
    memberCount: 4200,
    adminRoleId: "333333333333333333",
    ownerDiscordId: OLD_OWNER,
    installedAt: NOW,
    community: "A competitive gaming community.",
    announceChannelId: "chan-1",
    memberAgeRange: "18-24",
    gamesPlayed: ["Chess"],
    inviteUrl: "https://discord.gg/g1",
    coverImageUrl: "https://cdn.test/g1.png",
    ...over,
  });
}
