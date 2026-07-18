import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { and, eq, ne } from "drizzle-orm";
import { getDb, schema } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";
import Avatar from "@/components/Avatar";
import AdSlot from "@/components/AdSlot";
import MessageThread from "@/components/MessageThread";
import ConversationsSidebar from "@/components/ConversationsSidebar";
import { sendMessage } from "@/app/actions/social";

export const dynamic = "force-dynamic";

export default async function ConversationPage({
  params,
}: { params: Promise<{ conversationId: string }> }) {
  const { conversationId } = await params;
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  const db = await getDb();

  const [membership] = await db.select().from(schema.conversationParticipants).where(and(
    eq(schema.conversationParticipants.conversationId, conversationId),
    eq(schema.conversationParticipants.userId, user.id),
  )).limit(1);
  if (!membership) notFound();

  const others = await db.select({ u: schema.users })
    .from(schema.conversationParticipants)
    .innerJoin(schema.users, eq(schema.conversationParticipants.userId, schema.users.id))
    .where(and(
      eq(schema.conversationParticipants.conversationId, conversationId),
      ne(schema.conversationParticipants.userId, user.id)));
  const other = others[0]?.u;

  await db.update(schema.conversationParticipants).set({ lastReadAt: new Date() }).where(and(
    eq(schema.conversationParticipants.conversationId, conversationId),
    eq(schema.conversationParticipants.userId, user.id),
  ));

  return (
    <div className="mx-auto max-w-5xl px-4 py-6 grid lg:grid-cols-[300px_1fr] gap-4" style={{ minHeight: "calc(100vh - 4rem)" }}>
      {/* Conversations rail (desktop) */}
      <ConversationsSidebar userId={user.id} activeId={conversationId} className="hidden lg:block max-h-[calc(100vh-7rem)] sticky top-20" />

      <div className="flex flex-col min-w-0">
        <div className="glass flex items-center gap-3 p-4 mb-4">
          <Link href="/messages" className="text-muted hover:text-ink lg:hidden">←</Link>
          {other && (
            <>
              <Avatar name={other.displayName} src={other.avatarUrl} size={36} />
              <Link href={`/u/${other.slug}`} className="font-semibold hover:text-cyan-300">{other.displayName}</Link>
            </>
          )}
        </div>

        <MessageThread conversationId={conversationId} viewerId={user.id} />

        <div className="mt-4">
          <AdSlot placement="messages_footer" className="mb-3" />
          <form action={sendMessage.bind(null, conversationId)} className="flex gap-2">
            <input name="body" required maxLength={4000} placeholder="Transmit a message…" className="input-cosmic" autoComplete="off" />
            <button className="glow-btn rounded-full px-6 text-sm font-semibold text-white shrink-0">Send</button>
          </form>
        </div>
      </div>
    </div>
  );
}
