import Link from "next/link";
import { redirect } from "next/navigation";
import { desc, eq, inArray, ne, and } from "drizzle-orm";
import { getDb, schema } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";
import Avatar from "@/components/Avatar";
import { timeAgo } from "@/lib/utils";

export const dynamic = "force-dynamic";
export const metadata = { title: "Messages" };

export default async function MessagesPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  const db = await getDb();

  const mine = await db.select({ conversationId: schema.conversationParticipants.conversationId })
    .from(schema.conversationParticipants)
    .where(eq(schema.conversationParticipants.userId, user.id));
  const convIds = mine.map((m) => m.conversationId);

  const conversations = convIds.length
    ? await db.select().from(schema.conversations)
        .where(inArray(schema.conversations.id, convIds))
        .orderBy(desc(schema.conversations.lastMessageAt))
    : [];

  const items = await Promise.all(conversations.map(async (c) => {
    const [others, [lastMsg]] = await Promise.all([
      db.select({ u: schema.users })
        .from(schema.conversationParticipants)
        .innerJoin(schema.users, eq(schema.conversationParticipants.userId, schema.users.id))
        .where(and(
          eq(schema.conversationParticipants.conversationId, c.id),
          ne(schema.conversationParticipants.userId, user.id))),
      db.select().from(schema.messages)
        .where(eq(schema.messages.conversationId, c.id))
        .orderBy(desc(schema.messages.createdAt)).limit(1),
    ]);
    return { c, other: others[0]?.u, lastMsg };
  }));

  return (
    <div className="mx-auto max-w-2xl px-4 py-10">
      <h1 className="text-2xl font-bold mb-6">Messages</h1>
      {items.length === 0 ? (
        <div className="glass p-10 text-center text-muted">
          No transmissions yet. Visit a <Link href="/search" className="text-cyan-300 underline">gamer&apos;s profile</Link> and hit Message.
        </div>
      ) : (
        <div className="space-y-2">
          {items.map(({ c, other, lastMsg }) => other && (
            <Link key={c.id} href={`/messages/${c.id}`} className="glass glass-hover flex items-center gap-3 p-4">
              <Avatar name={other.displayName} src={other.avatarUrl} size={44} />
              <div className="min-w-0 flex-1">
                <div className="font-semibold">{other.displayName}</div>
                <div className="text-sm text-muted truncate">{lastMsg?.body ?? "New conversation"}</div>
              </div>
              <div className="text-xs text-muted shrink-0">{lastMsg && timeAgo(lastMsg.createdAt)}</div>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
