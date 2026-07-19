import Link from "next/link";
import { and, desc, eq, inArray, ne } from "drizzle-orm";
import { getDb, schema } from "@/lib/db";
import Avatar from "@/components/Avatar";
import { timeAgo } from "@/lib/utils";

// Conversation list rail, shared by /messages and the conversation view. Shows a
// red dot for threads with unread incoming messages.
export default async function ConversationsSidebar({ userId, activeId, className = "" }: { userId: string; activeId?: string; className?: string }) {
  const db = await getDb();
  const mine = await db.select({ conversationId: schema.conversationParticipants.conversationId, lastReadAt: schema.conversationParticipants.lastReadAt })
    .from(schema.conversationParticipants).where(eq(schema.conversationParticipants.userId, userId));
  const convIds = mine.map((m) => m.conversationId);
  const lastReadBy = new Map(mine.map((m) => [m.conversationId, m.lastReadAt]));
  const conversations = convIds.length
    ? await db.select().from(schema.conversations).where(inArray(schema.conversations.id, convIds)).orderBy(desc(schema.conversations.lastMessageAt))
    : [];

  const items = await Promise.all(conversations.map(async (c) => {
    const [others, [lastMsg]] = await Promise.all([
      db.select({ u: schema.users }).from(schema.conversationParticipants)
        .innerJoin(schema.users, eq(schema.conversationParticipants.userId, schema.users.id))
        .where(and(eq(schema.conversationParticipants.conversationId, c.id), ne(schema.conversationParticipants.userId, userId))),
      db.select().from(schema.messages).where(eq(schema.messages.conversationId, c.id)).orderBy(desc(schema.messages.createdAt)).limit(1),
    ]);
    const lr = lastReadBy.get(c.id);
    const unread = !!lastMsg && lastMsg.senderId !== userId && (!lr || lr < c.lastMessageAt);
    return { c, other: others[0]?.u, lastMsg, unread };
  }));

  return (
    <div className={`glass overflow-y-auto ${className}`}>
      <div className="p-3 border-b border-white/10 text-xs uppercase tracking-widest text-muted sticky top-0 bg-[#070826]/80 backdrop-blur">Conversations</div>
      {items.length === 0 ? (
        <div className="p-4 text-sm text-muted">No conversations yet.</div>
      ) : items.map(({ c, other, lastMsg, unread }) => other && (
        <Link key={c.id} href={`/messages/${c.id}`}
          className={`flex items-center gap-3 p-3 border-b border-white/[0.06] transition-colors ${c.id === activeId ? "bg-cyan-500/[0.08]" : "hover:bg-white/[0.04]"}`}>
          <div className="relative shrink-0">
            <Avatar name={other.displayName} src={other.avatarUrl} size={40} />
            {unread && <span className="absolute -top-0.5 -right-0.5 h-3 w-3 rounded-full bg-rose-500 ring-2 ring-[#070826]" />}
          </div>
          <div className="min-w-0 flex-1">
            <div className={`text-sm truncate ${unread ? "font-bold text-ink" : "font-semibold"}`}>{other.displayName}</div>
            <div className={`text-xs truncate ${unread ? "text-cyan-200" : "text-muted"}`}>{lastMsg?.body ?? "New conversation"}</div>
          </div>
          {lastMsg && <div className="text-[10px] text-muted shrink-0">{timeAgo(lastMsg.createdAt)}</div>}
        </Link>
      ))}
    </div>
  );
}
