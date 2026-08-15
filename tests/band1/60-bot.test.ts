// Stage 6 — the bot.
//
// The guard docs/08-BUILD-ORDER.md names for this stage is one sentence: **a
// decoration that throws must not take a card down.** It is house rule 11, and
// it is here because a sponsor-link signature once threw out of an ad button
// and took the entire Discord bot down with it.
//
// The other three properties tested here are the ones that make the bot work
// at all: acknowledge inside three seconds, never post an owner card publicly,
// and keep the nav grammar inside Discord's 100-character `custom_id`.

import { ok, eq, no, throws } from "../helpers/assert.ts";
import { test } from "../helpers/suite.ts";
import { resetDemoDb, schema } from "../../lib/db/index.ts";
import {
  handleInteraction,
  screen,
  SCREENS,
  type ScreenResult,
} from "../../lib/discord/interactions.ts";
import { checkAdmin, ownerOnly, mapAdminRole } from "../../lib/discord/admin.ts";
import {
  frame,
  navId,
  parseId,
  rows,
  button,
  MAX_CUSTOM_ID,
} from "../../lib/discord/components.ts";
import { InteractionType, InteractionResponseType } from "../../lib/discord/types.ts";
import { fence, isRenderableImageType } from "../../lib/cards/render.ts";
import { acceptImage, UploadRefused } from "../../lib/cards/upload.ts";
import { enqueuePosts } from "../../lib/discord/post-queue.ts";
import { uid } from "../../lib/core/utils.ts";

/** An interaction the handler will accept, with verification stubbed out. */
function anInteraction(over: Record<string, unknown> = {}) {
  return JSON.stringify({
    id: "i1",
    token: "t1",
    application_id: "app1",
    type: InteractionType.ApplicationCommand,
    data: { name: "home" },
    member: { user: { id: "u1", username: "Gamer" }, roles: [] },
    guild_id: "g1",
    ...over,
  });
}

const alwaysVerified = async () => true;

/** Runs the handler and waits for the deferred work, so a test can see both. */
async function run(body: string) {
  const deferred: (() => Promise<void>)[] = [];
  let delivered: ScreenResult | null = null;
  const started = performance.now();

  const response = await handleInteraction(
    { body, signature: "sig", timestamp: "ts" },
    {
      verify: alwaysVerified,
      defer: (fn) => deferred.push(fn),
      edit: async (_a, _t, result) => {
        delivered = result;
      },
    },
  );
  const ackMs = performance.now() - started;

  for (const fn of deferred) await fn();
  return { response, delivered: delivered as ScreenResult | null, ackMs, deferredCount: deferred.length };
}

// ── The three-second rule ───────────────────────────────────────────────────

test("the acknowledgement is sent before any work happens", async () => {
  let workRan = false;
  screen("slow-work", async () => {
    workRan = true;
    return { content: "done" };
  });

  const deferred: (() => Promise<void>)[] = [];
  const response = await handleInteraction(
    { body: anInteraction({ data: { name: "slow-work" } }), signature: "s", timestamp: "t" },
    { verify: alwaysVerified, defer: (fn) => deferred.push(fn), edit: async () => {} },
  );

  eq(response.status, 200, "the handler answers");
  no(workRan, "and the screen has not run yet — the work is deferred, not awaited");
  eq(deferred.length, 1, "it is queued for after the response");

  await deferred[0]();
  ok(workRan, "and it runs once the acknowledgement has gone");
});

test("a slow screen cannot delay the acknowledgement", async () => {
  // The failure this prevents: a screen that takes four seconds on a cold
  // function, an interaction Discord has already killed, and a gamer looking
  // at "This interaction failed".
  screen("very-slow", async () => {
    await new Promise((r) => setTimeout(r, 300));
    return { content: "eventually" };
  });

  const { response, ackMs, delivered } = await run(
    anInteraction({ data: { name: "very-slow" } }),
  );
  ok(ackMs < 100, `the acknowledgement took ${ackMs.toFixed(0)}ms, not the screen's 300`);
  eq(
    (response.body as { type: number }).type,
    InteractionResponseType.DeferredChannelMessageWithSource,
    "and it is a deferred response, so the card can arrive later",
  );
  eq(delivered?.content, "eventually", "and the card does arrive");
});

test("a button press replaces its card rather than posting a new one", async () => {
  screen("pressed", async () => ({ content: "updated" }));
  const { response } = await run(
    anInteraction({
      type: InteractionType.MessageComponent,
      data: { custom_id: navId(frame("pressed")) },
    }),
  );
  eq(
    (response.body as { type: number }).type,
    InteractionResponseType.DeferredUpdateMessage,
    "a component interaction defers an update, not a new message",
  );
});

test("Discord's ping is answered", async () => {
  const { response } = await run(anInteraction({ type: InteractionType.Ping }));
  eq(
    (response.body as { type: number }).type,
    InteractionResponseType.Pong,
    "the handshake is the one thing that must never be deferred",
  );
});

test("an unverified request is not an interaction", async () => {
  const deferred: (() => Promise<void>)[] = [];
  const bad = await handleInteraction(
    { body: anInteraction(), signature: "sig", timestamp: "ts" },
    { verify: async () => false, defer: (fn) => deferred.push(fn), edit: async () => {} },
  );
  eq(bad.status, 401, "a bad signature is refused");
  eq(deferred.length, 0, "and nothing was queued to run");

  const missing = await handleInteraction(
    { body: anInteraction(), signature: null, timestamp: null },
    { verify: alwaysVerified, defer: (fn) => deferred.push(fn), edit: async () => {} },
  );
  eq(missing.status, 401, "and so is a missing one");
});

// ── The guard for this stage ────────────────────────────────────────────────

test("a decoration that throws does not take the card down", async () => {
  // House rule 11. A sponsor-link signature once threw out of an ad button and
  // took the whole bot down.
  const good = await fence("artwork", () => "https://example.com/a.png");
  ok(good.ok, "a decoration that works returns its value");
  eq(good.ok ? good.value : "", "https://example.com/a.png", "unchanged");

  const bad = await fence("artwork", () => {
    throw new Error("Unsupported image type: image/webp");
  });
  no(bad.ok, "one that throws returns a failure instead of propagating");
  ok(
    !bad.ok && /webp/.test(bad.error),
    "carrying the reason, so a bad asset is findable rather than merely invisible",
  );
});

test("a screen that throws still produces a card", async () => {
  screen("explodes", async () => {
    throw new Error("the standings query fell over");
  });

  const { delivered } = await run(anInteraction({ data: { name: "explodes" } }));
  ok(delivered !== null, "the gamer gets a card rather than a spinner that never resolves");
  ok(
    /went wrong/.test(delivered?.content ?? ""),
    "which says something went wrong",
  );
  ok(
    /nothing you have entered is affected/.test(delivered?.content ?? ""),
    "and reassures them about the thing they actually care about",
  );
  ok(delivered?.ephemeral, "privately, because an error is not an announcement");
});

test("an unknown screen is a card, not a crash", async () => {
  const { delivered, response } = await run(anInteraction({ data: { name: "no-such-screen" } }));
  eq(response.status, 200, "the interaction is still acknowledged");
  ok(/start again/.test(delivered?.content ?? ""), "and the card tells them what to do");
});

// ── The renderer's one hard limit ───────────────────────────────────────────

test("the renderer's decodable formats are PNG and JPEG, and WebP is not one", () => {
  ok(isRenderableImageType("image/png"), "PNG decodes");
  ok(isRenderableImageType("image/jpeg"), "JPEG decodes");
  ok(isRenderableImageType("image/png; charset=binary"), "a parameter does not confuse it");
  no(
    isRenderableImageType("image/webp"),
    "WebP does not — this is live in production and it is why artwork silently vanished",
  );
  no(isRenderableImageType("image/avif"), "nor does AVIF");
  no(isRenderableImageType(null), "and nothing is not an image");
});

test("an upload is converted rather than refused", async () => {
  // Rule 1: accept whatever the uploader gives and store something the
  // renderer can read. A brand told their logo is the wrong format will send
  // it anyway, in an email, on a Friday.
  const webp = { bytes: new Uint8Array([1, 2, 3]), contentType: "image/webp" };
  const converted = await acceptImage(webp, async () => ({
    bytes: new Uint8Array([9, 9]),
    contentType: "image/png" as const,
  }));
  eq(converted.contentType, "image/png", "what reaches storage is decodable");
  ok(converted.converted, "and the conversion is recorded");
  eq(converted.sourceType, "image/webp", "along with what it came from");

  const png = await acceptImage({ bytes: new Uint8Array([1]), contentType: "image/png" });
  no(png.converted, "something already decodable is left alone");
});

test("nothing undecodable ever reaches storage", async () => {
  const err = await throws(
    () =>
      acceptImage({ bytes: new Uint8Array([1]), contentType: "image/webp" }),
    /cannot be drawn on a card/,
    "with no converter, an undecodable upload is refused rather than stored",
  );
  ok(err instanceof UploadRefused, "by name");

  await throws(
    () =>
      acceptImage({ bytes: new Uint8Array([1]), contentType: "image/webp" }, async () => ({
        bytes: new Uint8Array([1]),
        contentType: "image/webp" as unknown as "image/png",
      })),
    /still cannot decode/,
    "and a converter that returns something undecodable is not trusted either",
  );
});

// ── Owner cards ─────────────────────────────────────────────────────────────

test("the admin role is stored by ID, so renaming it revokes nothing", async () => {
  const db = await resetDemoDb();
  await db.insert(schema.guilds).values({
    guildId: "g1",
    name: "Nightfall",
    slug: "nightfall",
    memberCount: 500,
  });

  await throws(
    () => mapAdminRole(db, "g1", "Moderators"),
    /not an ID/,
    "a name is refused — that is the whole rule",
  );

  await mapAdminRole(db, "g1", "112233445566");
  const allowed = await checkAdmin(db, {
    guildId: "g1",
    memberRoleIds: ["999", "112233445566"],
    userId: "u1",
  });
  ok(allowed.allowed, "somebody holding the role is an admin");

  // The role is renamed in Discord. Nothing we store changes, because we never
  // stored the name.
  const stillAllowed = await checkAdmin(db, {
    guildId: "g1",
    memberRoleIds: ["112233445566"],
    userId: "u1",
  });
  ok(stillAllowed.allowed, "and a rename cannot silently revoke access");
});

test("the guild owner is an admin before any role is mapped", async () => {
  const db = await resetDemoDb();
  await db.insert(schema.guilds).values({
    guildId: "g1",
    name: "Fresh Install",
    slug: "fresh",
    memberCount: 10,
  });

  const owner = await checkAdmin(db, {
    guildId: "g1",
    memberRoleIds: [],
    userId: "owner-1",
    guildOwnerId: "owner-1",
  });
  ok(owner.allowed, "S2 — on install, only the guild owner has admin");
  eq(owner.allowed ? owner.because : "", "guild_owner", "and we know why");

  const member = await checkAdmin(db, {
    guildId: "g1",
    memberRoleIds: [],
    userId: "member-1",
    guildOwnerId: "owner-1",
  });
  no(member.allowed, "nobody else does yet");
  ok(
    !member.allowed && /admin role is mapped/.test(member.reason),
    "and the refusal says what to do about it",
  );
});

test("an owner card is never a public message, including its refusal", async () => {
  const db = await resetDemoDb();
  await db.insert(schema.guilds).values({
    guildId: "g1",
    name: "Nightfall",
    slug: "nightfall",
    memberCount: 500,
    adminRoleId: "112233445566",
  });

  // A screen that deliberately forgets to be ephemeral. The wrapper is what
  // makes S8 true, so that a screen cannot forget it.
  const card = ownerOnly(async () => ({ content: "Your vault holds $87.50" }));

  const allowed = await card({
    db,
    interaction: {
      id: "i",
      token: "t",
      type: InteractionType.MessageComponent,
      application_id: "a",
      guild_id: "g1",
      member: { user: { id: "u1", username: "Admin" }, roles: ["112233445566"] },
    },
  });
  ok(allowed.ephemeral, "the card is private even though the screen did not say so");

  const refused = await card({
    db,
    interaction: {
      id: "i",
      token: "t",
      type: InteractionType.MessageComponent,
      application_id: "a",
      guild_id: "g1",
      member: { user: { id: "u2", username: "Member" }, roles: [] },
    },
  });
  ok(refused.ephemeral, "and so is the refusal — a public one announces that somebody tried");
  no(/vault/.test(refused.content ?? ""), "which of course says nothing about the vault");
});

test("a removed bot gives an error that says what to do", async () => {
  const db = await resetDemoDb();
  const check = await checkAdmin(db, {
    guildId: "gone",
    memberRoleIds: [],
    userId: "u1",
  });
  no(check.allowed, "refused");
  ok(
    !check.allowed && /reinstall Cluster/.test(check.reason),
    "S9 — the error tells a member to tell their admin, rather than reporting a fault",
  );
});

// ── The nav grammar ─────────────────────────────────────────────────────────

test("a custom_id round-trips, and never exceeds Discord's limit", () => {
  const target = frame("standings", "challenge-123");
  const trail = [frame("home"), frame("challenges"), frame("challenge", "challenge-123")];
  const id = navId(target, trail);

  ok(id.length <= MAX_CUSTOM_ID, `the id is ${id.length} characters, within ${MAX_CUSTOM_ID}`);
  const parsed = parseId(id);
  ok(parsed !== null, "and it parses back");
  eq(parsed.target.screen, "standings", "to the screen it named");
  eq(parsed.target.args, ["challenge-123"], "with its arguments");
});

test("a deep trail is truncated rather than producing a rejected message", () => {
  // A `custom_id` over 100 characters is a message Discord refuses, which is a
  // card that never appears. Losing the oldest breadcrumb is the right trade.
  const deep = Array.from({ length: 20 }, (_, i) => frame(`screen-number-${i}`, `arg-${i}`));
  const id = navId(frame("destination", "some-long-argument-here"), deep);
  ok(id.length <= MAX_CUSTOM_ID, `still ${id.length} characters`);
  const parsed = parseId(id);
  ok(parsed !== null, "and it still parses");
  eq(parsed.target.screen, "destination", "the destination survives — the trail is what gives way");
});

test("`group` is ours, not Discord's, and never reaches the wire", () => {
  // An unknown field is a rejected message, which is a card that never
  // appears. `rows()` strips it.
  const built = rows([
    button("One", "a", 2, undefined, "choice"),
    button("Two", "b", 2, undefined, "nav"),
  ]);
  const flattened = built.flatMap((r) => r.components);
  ok(flattened.length === 2, "both buttons made it");
  eq(
    flattened.filter((b) => "group" in b).length,
    0,
    "and neither carries our own field into Discord's payload",
  );
});

// ── The post queue ──────────────────────────────────────────────────────────

test("nothing fans out inline — an announcement is queued", async () => {
  const db = await resetDemoDb();
  const targets = Array.from({ length: 250 }, (_, i) => ({
    channelId: `c${i}`,
    guildId: `g${i}`,
    payload: { content: "A challenge just went live" },
  }));

  const result = await enqueuePosts(targets, { challengeId: "ch1", kind: "launch" });
  eq(result.queued, 250, "every target got a row and nothing was posted");

  const queued = await db.select().from(schema.discordPostQueue);
  eq(queued.length, 250, "the rows are there");
  ok(
    queued.every((r) => r.status === "pending"),
    "all pending — a cron drains them, so a server action cannot time out mid-fanout",
  );
  eq(new Set(queued.map((r) => r.batchId)).size, 1, "one batch, so a drain can be reasoned about");
});

test("an empty announcement queues nothing and does not fail", async () => {
  await resetDemoDb();
  const result = await enqueuePosts([]);
  eq(result.queued, 0, "no targets, no rows, no error");
});

// Keep the registry clean for any suite that runs after this one.
test("the screen registry is left as it was found", () => {
  for (const name of ["slow-work", "very-slow", "pressed", "explodes"]) {
    SCREENS.delete(name);
  }
  ok(!SCREENS.has("explodes"), "the test screens are removed");
  void uid;
});
