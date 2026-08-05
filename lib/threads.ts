import { cache } from "react";
import { and, desc, eq, sql } from "drizzle-orm";
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

// ===== The inbox =====
//
// One list, both kinds. Staff answering a server owner and staff answering a
// brand are the same job at the same desk, and splitting them across two pages
// (one of which lived three clicks inside a brand's detail page) meant the
// brand side went unanswered for days at a time — nobody had a reason to open
// it, because nothing told them there was anything in it.
//
// Ordered by the last message rather than by unread count: a support queue is a
// queue of conversations, and the oldest unanswered one is the one that costs.

export type InboxThread = {
  kind: ThreadKind;
  /** guildId for a server, brandId for a brand. */
  id: string;
  name: string;
  iconUrl: string | null;
  /** Where staff go to answer it. */
  href: string;
  lastBody: string;
  lastSender: string;
  lastAt: Date;
  unread: number;
  /** Server threads only: replies that never reached Discord. */
  undelivered: number;
};

/**
 * How many threads have something unread — the badge, and NOTHING else (B55.1).
 *
 * The admin layout used to call `adminInbox()` for this one integer. That fans
 * out to `inbox()`, which selects **every column including the message body**
 * with `.limit(2000)` and groups in JS, plus `brandThreads`, which had **no
 * limit at all**. Megabytes over the wire, on every admin page load, to render a
 * number — and it got worse every day the tables grew.
 *
 * Two `count(distinct …)` queries, no bodies, bounded by nothing that grows.
 *
 * "Unread" means a message FROM them that we have not read. A reply we wrote
 * ourselves is not something we are waiting on, which is why `sender` is in both
 * predicates.
 */
export const unreadThreadCount = cache(async (): Promise<number> => {
  try {
    const db = await getDb();
    const [servers, brands] = await Promise.all([
      db.select({ n: sql<number>`count(distinct ${schema.serverMessages.guildId})` })
        .from(schema.serverMessages)
        .where(and(eq(schema.serverMessages.sender, "server"), eq(schema.serverMessages.readByAdmin, false))),
      db.select({ n: sql<number>`count(distinct ${schema.brandMessages.brandId})` })
        .from(schema.brandMessages)
        .where(and(eq(schema.brandMessages.sender, "brand"), eq(schema.brandMessages.readByAdmin, false))),
    ]);
    return Number(servers[0]?.n ?? 0) + Number(brands[0]?.n ?? 0);
  } catch { return 0; }
});

export async function adminInbox(): Promise<InboxThread[]> {
  const [servers, brands] = await Promise.all([serverThreads(), brandThreads()]);
  return [...servers, ...brands].sort((a, b) => b.lastAt.getTime() - a.lastAt.getTime());
}

async function serverThreads(): Promise<InboxThread[]> {
  try {
    const { inbox } = await import("@/lib/server-messages");
    return (await inbox()).map((r) => ({
      kind: "server" as const,
      id: r.guildId,
      name: r.name,
      iconUrl: r.iconUrl,
      href: `/admin/discord/${r.guildId}#messages`,
      lastBody: r.lastBody,
      lastSender: r.lastSender,
      lastAt: r.lastAt,
      unread: r.unread,
      undelivered: r.undelivered,
    }));
  } catch { return []; }
}

async function brandThreads(): Promise<InboxThread[]> {
  try {
    const db = await getDb();
    const rows = await db
      .select({
        brandId: schema.brandMessages.brandId,
        name: schema.brands.name,
        logoUrl: schema.brands.logoUrl,
        body: schema.brandMessages.body,
        sender: schema.brandMessages.sender,
        createdAt: schema.brandMessages.createdAt,
        readByAdmin: schema.brandMessages.readByAdmin,
      })
      .from(schema.brandMessages)
      .innerJoin(schema.brands, eq(schema.brandMessages.brandId, schema.brands.id))
      .orderBy(desc(schema.brandMessages.createdAt));

    // Grouped in memory rather than with a lateral join: this is a support
    // inbox, not a feed — it is tens of rows, and one query beats N+1.
    const byBrand = new Map<string, InboxThread>();
    for (const r of rows) {
      const at = r.createdAt ?? new Date(0);
      const existing = byBrand.get(r.brandId);
      if (!existing) {
        byBrand.set(r.brandId, {
          kind: "brand",
          id: r.brandId,
          name: r.name,
          iconUrl: r.logoUrl,
          href: `/admin/brands/${r.brandId}#messages`,
          lastBody: r.body,
          lastSender: r.sender,
          lastAt: at,
          // Only a message FROM the brand can be unread by us. A reply we wrote
          // ourselves is not a thing we are waiting on.
          unread: r.sender === "brand" && !r.readByAdmin ? 1 : 0,
          undelivered: 0,
        });
      } else if (r.sender === "brand" && !r.readByAdmin) {
        existing.unread += 1;
      }
    }
    return [...byBrand.values()];
  } catch { return []; }
}
