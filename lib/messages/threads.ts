// Messages — one thread per server, one per brand, two admin inboxes.
//
// ===== SILENCE IS THE FAILURE MODE THIS PAGE EXISTS TO PREVENT =====
//
// H7 / MS1 — **an unanswered thread keeps alerting admin until somebody
// replies.** Support is the whole point of the page, so the thing that must
// never happen quietly is nothing happening. Every other alert on the platform
// fires because something went wrong; this one fires because nothing did.
//
// That is why "answered" is derived from **who spoke last** and never from a
// flag. A `needsReply` boolean is cleared by whoever last touched the row, and
// the row most likely to be touched and not answered is the one somebody
// opened, read, and meant to come back to.
//
// MS2 — **the two inboxes are separate surfaces and never merge.** A brand
// thread never appears in the server inbox. They are different conversations
// with different people about different money, and one list of both is a list
// somebody replies to from the wrong context.
//
// MS3 — refresh in place on all four surfaces: both portals, both inboxes.

import { and, asc, desc, eq, isNull, ne, sql } from "drizzle-orm";
import type { DB } from "../db/index.ts";
import { schema } from "../db/index.ts";
import { uid } from "../core/utils.ts";

/** Who is speaking. `cluster` is us; the other two are the customer. */
export type AuthorKind = "server" | "brand" | "cluster";
export type ThreadSide = "server" | "brand";

export class MessageRefused extends Error {
  constructor(message: string) {
    super(message);
    this.name = "MessageRefused";
  }
}

/**
 * The thread for this server or this brand, made on first use.
 *
 * One per counterparty rather than one per topic. A support conversation with
 * a server owner is a relationship, not a ticket queue, and threading by topic
 * is how the third message about the same problem starts a fourth thread.
 */
export async function threadFor(
  db: DB,
  input: { side: ThreadSide; guildId?: string; brandId?: string },
  now = new Date(),
): Promise<string> {
  // Exactly one of them, checked rather than assumed: a thread with both set
  // would appear in both inboxes, which is the one thing MS2 forbids.
  const guildId = input.side === "server" ? input.guildId : undefined;
  const brandId = input.side === "brand" ? input.brandId : undefined;
  if (input.side === "server" && !guildId) {
    throw new MessageRefused("A server thread needs a server.");
  }
  if (input.side === "brand" && !brandId) {
    throw new MessageRefused("A brand thread needs a brand.");
  }

  const [existing] = await db
    .select()
    .from(schema.messageThreads)
    .where(
      and(
        eq(schema.messageThreads.side, input.side),
        input.side === "server"
          ? eq(schema.messageThreads.guildId, guildId!)
          : eq(schema.messageThreads.brandId, brandId!),
      ),
    );
  if (existing) return existing.id;

  const id = uid();
  await db.insert(schema.messageThreads).values({
    id,
    side: input.side,
    guildId: guildId ?? null,
    brandId: brandId ?? null,
    createdAt: now,
  });
  return id;
}

/**
 * Say something.
 *
 * The thread's `lastAuthorKind` is written from the message, in the same call,
 * because the alert is derived from it — a summary that can be one write
 * behind is an alert that can be wrong for as long as nobody notices.
 */
export async function postMessage(
  db: DB,
  input: { threadId: string; authorKind: AuthorKind; authorId?: string | null; body: string },
  now = new Date(),
): Promise<string> {
  const body = input.body.trim();
  if (!body) throw new MessageRefused("An empty message is not a message.");

  const [thread] = await db
    .select()
    .from(schema.messageThreads)
    .where(eq(schema.messageThreads.id, input.threadId));
  if (!thread) throw new MessageRefused("That conversation does not exist.");

  // A brand cannot speak in a server thread and vice versa. Not because it
  // would break a query, but because `lastAuthorKind` is what the alert reads
  // and a `brand` author on a server thread makes the alert answer a question
  // about the wrong person.
  if (input.authorKind !== "cluster" && input.authorKind !== thread.side) {
    throw new MessageRefused(
      `A ${input.authorKind} cannot post in a ${thread.side} conversation.`,
    );
  }

  const id = uid();
  await db.insert(schema.messages).values({
    id,
    threadId: input.threadId,
    authorKind: input.authorKind,
    authorId: input.authorId ?? null,
    body,
    sentAt: now,
  });
  await db
    .update(schema.messageThreads)
    .set({ lastMessageAt: now, lastAuthorKind: input.authorKind })
    .where(eq(schema.messageThreads.id, input.threadId));
  return id;
}

/**
 * MS1 — is this thread waiting on us?
 *
 * A thread nobody has spoken in is not waiting on anybody. A thread whose last
 * word is ours is answered. Everything else is alerting, and stays alerting.
 *
 * Pure, and taking only the summary, so the derivation can be asserted without
 * a database and so no surface can compute it a second way.
 */
export function isAwaitingReply(thread: {
  lastAuthorKind: string | null;
}): boolean {
  if (!thread.lastAuthorKind) return false;
  return thread.lastAuthorKind !== "cluster";
}

export type InboxRow = {
  threadId: string;
  side: ThreadSide;
  guildId: string | null;
  brandId: string | null;
  name: string;
  lastMessageAt: Date | null;
  lastAuthorKind: string | null;
  awaitingReply: boolean;
  /** How long it has been waiting, in whole hours. Null when it is not. */
  waitingHours: number | null;
};

/**
 * One inbox. **`side` is the query, so there is no version of this that
 * returns both.**
 *
 * The alternative — one function with an optional filter — is one forgotten
 * argument away from a brand conversation in the server inbox, and MS2 is the
 * rule that makes that a defect rather than a convenience.
 */
export async function inbox(
  db: DB,
  side: ThreadSide,
  now = new Date(),
): Promise<InboxRow[]> {
  const rows = await db
    .select({
      thread: schema.messageThreads,
      guildName: schema.guilds.name,
      brandName: schema.brands.name,
    })
    .from(schema.messageThreads)
    .leftJoin(schema.guilds, eq(schema.guilds.guildId, schema.messageThreads.guildId))
    .leftJoin(schema.brands, eq(schema.brands.id, schema.messageThreads.brandId))
    .where(eq(schema.messageThreads.side, side))
    .orderBy(desc(schema.messageThreads.lastMessageAt));

  return rows.map(({ thread, guildName, brandName }) => {
    const awaitingReply = isAwaitingReply(thread);
    return {
      threadId: thread.id,
      side: thread.side as ThreadSide,
      guildId: thread.guildId,
      brandId: thread.brandId,
      name: guildName ?? brandName ?? thread.guildId ?? thread.brandId ?? "Unknown",
      lastMessageAt: thread.lastMessageAt,
      lastAuthorKind: thread.lastAuthorKind,
      awaitingReply,
      waitingHours:
        awaitingReply && thread.lastMessageAt
          ? Math.floor((now.getTime() - thread.lastMessageAt.getTime()) / 3_600_000)
          : null,
    };
  });
}

/** The conversation itself, oldest first — the order a person reads in. */
export async function conversation(db: DB, threadId: string) {
  return db
    .select()
    .from(schema.messages)
    .where(eq(schema.messages.threadId, threadId))
    .orderBy(asc(schema.messages.sentAt));
}

/**
 * What the admin dashboard shows: how many threads on each side are waiting.
 *
 * Counted per side rather than as one total, because the two inboxes are two
 * surfaces and "3 waiting" with no idea which page to open is an alert that
 * costs a click to act on every time it fires.
 */
export async function awaitingReplyCounts(
  db: DB,
): Promise<{ server: number; brand: number; total: number }> {
  const rows = await db
    .select({
      side: schema.messageThreads.side,
      n: sql<number>`count(*)::int`,
    })
    .from(schema.messageThreads)
    .where(
      and(
        ne(schema.messageThreads.lastAuthorKind, "cluster"),
        // A thread nobody has spoken in is not waiting on us.
        sql`${schema.messageThreads.lastAuthorKind} is not null`,
      ),
    )
    .groupBy(schema.messageThreads.side);

  const byside = new Map(rows.map((r) => [r.side, r.n]));
  const server = byside.get("server") ?? 0;
  const brand = byside.get("brand") ?? 0;
  return { server, brand, total: server + brand };
}
