// Messages — 12 §11 H5–H7, 07 MS1–MS3.
//
// The alert here is unlike every other alert on the platform: the others fire
// because something went wrong, and this one fires because **nothing did**.
// H7 — an unanswered message keeps alerting until somebody replies, because
// support is the point of the page and silence is the failure mode it exists
// to prevent.

import { ok, eq, no, throws } from "../helpers/assert.ts";
import { test } from "../helpers/suite.ts";
import { resetDemoDb, schema, type DB } from "../../lib/db/index.ts";
import {
  awaitingReplyCounts,
  conversation,
  inbox,
  isAwaitingReply,
  MessageRefused,
  postMessage,
  threadFor,
} from "../../lib/messages/threads.ts";
import { eq as sqlEq } from "drizzle-orm";

const NOW = new Date("2026-09-09T12:00:00Z");
const later = (h: number) => new Date(NOW.getTime() + h * 3_600_000);

// ── The alert ───────────────────────────────────────────────────────────────

test("a thread waits on us until Cluster speaks last", () => {
  // Pure, and asserted here because it is the derivation every surface reads.
  no(isAwaitingReply({ lastAuthorKind: null }), "a thread nobody has spoken in waits on nobody");
  ok(isAwaitingReply({ lastAuthorKind: "server" }), "an owner's message waits on us");
  ok(isAwaitingReply({ lastAuthorKind: "brand" }), "a brand's does too");
  no(isAwaitingReply({ lastAuthorKind: "cluster" }), "and our reply ends it");
});

test("an unanswered thread keeps alerting, however long it takes", async () => {
  const db = await resetDemoDb();
  await aGuild(db);
  const threadId = await threadFor(db, { side: "server", guildId: "g1" }, NOW);
  await postMessage(
    db,
    { threadId, authorKind: "server", authorId: "owner-1", body: "Why am I not earning?" },
    NOW,
  );

  for (const hours of [0, 1, 24, 24 * 30]) {
    const rows = await inbox(db, "server", later(hours));
    ok(rows[0].awaitingReply, `${hours}h later: still alerting`);
  }
  const week = await inbox(db, "server", later(24 * 7));
  eq(week[0].waitingHours, 24 * 7, "and it says how long, because that is the number that shames");

  const counts = await awaitingReplyCounts(db);
  eq(counts.server, 1, "the dashboard counts it");
  eq(counts.total, 1, "and it is on the dashboard, not in a nightly report");
});

test("reading is not answering", async () => {
  // ===== THE MOST PLAUSIBLE EDIT ANYBODY WILL EVER MAKE TO THIS FILE =====
  //
  // Marking a thread read and clearing the alert with it reads like an obvious
  // improvement, and it turns H7 into its exact opposite: the threads that
  // would stop alerting are the ones somebody opened, meant to answer, and did
  // not.
  //
  // `markRead` was deleted this sprint — it wrote `readAt` stamps that nothing
  // read, and its only caller was this test. **The property survives it**, and
  // is now asserted the way it actually has to hold: the alert is derived from
  // `lastAuthorKind`, so there is no read state anywhere that could clear it.
  const db = await resetDemoDb();
  await aGuild(db);
  const threadId = await threadFor(db, { side: "server", guildId: "g1" }, NOW);
  await postMessage(db, { threadId, authorKind: "server", body: "Are you there?" }, NOW);

  // Opening it is a read query and nothing else. That is the point: there is
  // no write here to get the rule wrong with.
  const messages = await conversation(db, threadId);
  eq(messages.length, 1, "admin opened it and saw the question");

  const rows = await inbox(db, "server", later(2));
  ok(rows[0].awaitingReply, "and it is still alerting, because nobody answered");
  eq((await awaitingReplyCounts(db)).total, 1, "and still on the dashboard");
});

test("a reply clears it, and the next question starts it again", async () => {
  // The positive half. Without it, an `isAwaitingReply` that returned true
  // unconditionally satisfies every assertion above.
  const db = await resetDemoDb();
  await aGuild(db);
  const threadId = await threadFor(db, { side: "server", guildId: "g1" }, NOW);
  await postMessage(db, { threadId, authorKind: "server", body: "Why am I not earning?" }, NOW);

  await postMessage(
    db,
    { threadId, authorKind: "cluster", authorId: "admin-1", body: "Your profile is missing a cover image." },
    later(1),
  );
  no((await inbox(db, "server", later(2)))[0].awaitingReply, "answered — the alert clears");
  eq((await awaitingReplyCounts(db)).total, 0, "and leaves the dashboard");
  eq((await inbox(db, "server", later(2)))[0].waitingHours, null, "with no waiting time to show");

  await postMessage(db, { threadId, authorKind: "server", body: "Fixed — anything else?" }, later(3));
  ok((await inbox(db, "server", later(4)))[0].awaitingReply, "and the next question starts it again");
});

// ── The two inboxes ─────────────────────────────────────────────────────────

test("a brand thread never appears in the server inbox", async () => {
  // MS2 — two surfaces, never merged. They are different conversations with
  // different people about different money, and one list of both is a list
  // somebody replies to from the wrong context.
  const db = await resetDemoDb();
  await aGuild(db);
  await aBrand(db);

  const serverThread = await threadFor(db, { side: "server", guildId: "g1" }, NOW);
  const brandThread = await threadFor(db, { side: "brand", brandId: "b1" }, NOW);
  await postMessage(db, { threadId: serverThread, authorKind: "server", body: "From a server." }, NOW);
  await postMessage(db, { threadId: brandThread, authorKind: "brand", body: "From a brand." }, NOW);

  const servers = await inbox(db, "server", NOW);
  const brands = await inbox(db, "brand", NOW);
  eq(servers.map((r) => r.threadId), [serverThread], "the server inbox holds one thread");
  eq(brands.map((r) => r.threadId), [brandThread], "and the brand inbox holds the other");
  eq(servers[0].name, "Nightfall", "named by the server");
  eq(brands[0].name, "Acme Energy", "and by the brand");

  const counts = await awaitingReplyCounts(db);
  eq(counts.server, 1, "and the dashboard counts them apart");
  eq(counts.brand, 1, "so an alert says which page to open");
});

test("a thread belongs to exactly one side", async () => {
  const db = await resetDemoDb();
  await aGuild(db);
  await aBrand(db);

  const serverThread = await threadFor(db, { side: "server", guildId: "g1" }, NOW);
  const [row] = await db
    .select()
    .from(schema.messageThreads)
    .where(sqlEq(schema.messageThreads.id, serverThread));
  eq(row.brandId, null, "a server thread carries no brand — it could otherwise be in both inboxes");

  // And a thread cannot be conjured without its counterparty.
  await throws(
    () => threadFor(db, { side: "server" }, NOW),
    /needs a server/,
    "a server thread needs a server",
  );
  await throws(
    () => threadFor(db, { side: "brand" }, NOW),
    /needs a brand/,
    "and a brand thread needs a brand",
  );
});

test("a brand cannot speak in a server conversation", async () => {
  const db = await resetDemoDb();
  await aGuild(db);
  const threadId = await threadFor(db, { side: "server", guildId: "g1" }, NOW);

  await throws(
    () => postMessage(db, { threadId, authorKind: "brand", body: "Wrong room." }, NOW),
    /cannot post in a server conversation/,
    "refused",
  );
  eq((await conversation(db, threadId)).length, 0, "and nothing was said");

  // Cluster can speak anywhere — that is the whole job.
  await postMessage(db, { threadId, authorKind: "cluster", body: "Hello." }, NOW);
  eq((await conversation(db, threadId)).length, 1, "we can");
});

test("one thread per counterparty, made once", async () => {
  const db = await resetDemoDb();
  await aGuild(db);
  const first = await threadFor(db, { side: "server", guildId: "g1" }, NOW);
  const second = await threadFor(db, { side: "server", guildId: "g1" }, later(48));
  eq(first, second, "the same conversation, not a second ticket");
  eq((await db.select().from(schema.messageThreads)).length, 1, "one row");
});

// ── The conversation ────────────────────────────────────────────────────────

test("the conversation reads oldest first, and an empty message is refused", async () => {
  const db = await resetDemoDb();
  await aGuild(db);
  const threadId = await threadFor(db, { side: "server", guildId: "g1" }, NOW);
  await postMessage(db, { threadId, authorKind: "server", body: "First." }, NOW);
  await postMessage(db, { threadId, authorKind: "cluster", body: "Second." }, later(1));
  await postMessage(db, { threadId, authorKind: "server", body: "Third." }, later(2));

  eq(
    (await conversation(db, threadId)).map((m) => m.body),
    ["First.", "Second.", "Third."],
    "the order a person reads in",
  );

  const err = await throws(
    () => postMessage(db, { threadId, authorKind: "server", body: "   " }, later(3)),
    /not a message/,
    "whitespace is not a message",
  );
  ok(err instanceof MessageRefused, "by name");
});

// ── Fixtures ────────────────────────────────────────────────────────────────

async function aGuild(db: DB) {
  await db.insert(schema.guilds).values({
    guildId: "g1",
    name: "Nightfall",
    slug: "nightfall",
    memberCount: 500,
    community: "A competitive gaming community.",
    announceChannelId: "chan-1",
  });
}

async function aBrand(db: DB) {
  await db.insert(schema.brands).values({ id: "b1", name: "Acme Energy", slug: "acme" });
}
