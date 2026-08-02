import { and, desc, eq } from "drizzle-orm";
import { getDb, schema } from "@/lib/db";

// Every conversation in the product, read the same way.
//
// There are four message boxes — a server owner's, a brand's, and the staff
// side of each — plus gamer DMs, and until now each one loaded only when its
// whole page loaded. Somebody waiting on a reply had to reload a dashboard that
// runs forty queries to find out whether one row had appeared.
//
// So reading a thread is separated from rendering the page that hosts it. The
// two tables are different shapes for good reasons (a staff reply to a server
// owner is delivered as a Discord DM and can fail; a brand message has nowhere
// to be delivered TO), and this flattens them into one view without pretending
// those differences away: `delivered` is `null` where delivery is not a thing
// that happens, and the UI shows nothing rather than inventing a tick.

export type ThreadKind = "server" | "brand";
/** Which end of the conversation is reading. */
export type ThreadSide = "portal" | "admin";

export type ThreadMessageView = {
  id: string;
  /** Raw side: `owner`/`brand` or `admin`. The reader decides which is "you". */
  sender: string;
  body: string;
  /** ISO — crosses to the client as a string, formatted there in local time. */
  createdAt: string;
  /** Where it was written: portal | discord | admin. */
  source: string;
  /**
   * Whether a staff reply reached Discord. `null` means this thread has no
   * delivery step at all, which is not the same as "not delivered".
   */
  delivered: boolean | null;
  deliveryError: string | null;
};

const LIMIT = 100;

/** The thread, oldest first — the order it is read in. */
export async function readThread(kind: ThreadKind, id: string, limit = LIMIT): Promise<ThreadMessageView[]> {
  try {
    const db = await getDb();
    if (kind === "server") {
      const rows = await db.select().from(schema.serverMessages)
        .where(eq(schema.serverMessages.guildId, id))
        .orderBy(desc(schema.serverMessages.createdAt)).limit(limit);
      return rows.reverse().map((m) => ({
        id: m.id,
        sender: m.sender,
        body: m.body,
        createdAt: m.createdAt.toISOString(),
        source: m.source,
        // Only a staff reply has a delivery to report; the owner's own message
        // was typed here and went nowhere.
        delivered: m.sender === "admin" ? !!m.deliveredAt : null,
        deliveryError: m.deliveryError,
      }));
    }
    const rows = await db.select().from(schema.brandMessages)
      .where(eq(schema.brandMessages.brandId, id))
      .orderBy(desc(schema.brandMessages.createdAt)).limit(limit);
    return rows.reverse().map((m) => ({
      id: m.id,
      sender: m.sender,
      body: m.body,
      createdAt: m.createdAt.toISOString(),
      source: "portal",
      delivered: null,
      deliveryError: null,
    }));
  } catch { return []; }
}

/** Who wrote the messages the given side has NOT read. */
function otherSender(kind: ThreadKind, side: ThreadSide): string {
  if (side === "admin") return kind === "server" ? "owner" : "brand";
  return "admin";
}

/**
 * How many messages from the other side are unread.
 *
 * Counted before marking read, always — a badge that disappears the instant the
 * page loads tells the reader nothing about what arrived since last time.
 */
export async function unreadCount(kind: ThreadKind, id: string, side: ThreadSide): Promise<number> {
  try {
    const db = await getDb();
    const from = otherSender(kind, side);
    if (kind === "server") {
      const rows = await db.select({ id: schema.serverMessages.id }).from(schema.serverMessages).where(and(
        eq(schema.serverMessages.guildId, id),
        eq(schema.serverMessages.sender, from),
        eq(side === "admin" ? schema.serverMessages.readByAdmin : schema.serverMessages.readByOwner, false),
      ));
      return rows.length;
    }
    const rows = await db.select({ id: schema.brandMessages.id }).from(schema.brandMessages).where(and(
      eq(schema.brandMessages.brandId, id),
      eq(schema.brandMessages.sender, from),
      eq(side === "admin" ? schema.brandMessages.readByAdmin : schema.brandMessages.readByBrand, false),
    ));
    return rows.length;
  } catch { return 0; }
}

/** Looking at the thread is reading it. */
export async function markThreadRead(kind: ThreadKind, id: string, side: ThreadSide): Promise<void> {
  try {
    const db = await getDb();
    const from = otherSender(kind, side);
    if (kind === "server") {
      await db.update(schema.serverMessages)
        .set(side === "admin" ? { readByAdmin: true } : { readByOwner: true })
        .where(and(eq(schema.serverMessages.guildId, id), eq(schema.serverMessages.sender, from)));
      return;
    }
    await db.update(schema.brandMessages)
      .set(side === "admin" ? { readByAdmin: true } : { readByBrand: true })
      .where(and(eq(schema.brandMessages.brandId, id), eq(schema.brandMessages.sender, from)));
  } catch { /* an unread badge that lingers is not worth failing a page load */ }
}
