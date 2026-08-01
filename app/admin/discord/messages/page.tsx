import Link from "next/link";
import { requireStaff } from "@/lib/auth";
import { inbox } from "@/lib/server-messages";
import Icon from "@/components/Icon";

export const dynamic = "force-dynamic";
export const metadata = { title: "Admin · Server messages" };

// The support inbox: one thread per server.
//
// Ordered by the last message rather than by unread count, because a support
// queue is a queue of conversations and the oldest unanswered one is the one
// that costs a server. Undelivered replies are flagged separately and loudly —
// a reply that never reached Discord is an owner who thinks they were ignored,
// which is worse than never having answered.
export default async function ServerMessagesInboxPage() {
  await requireStaff();
  const rows = await inbox();
  const waiting = rows.filter((r) => r.unread > 0);
  const quiet = rows.filter((r) => r.unread === 0);

  return (
    <div className="max-w-4xl">
      <div className="mb-2 flex items-baseline justify-between gap-3 flex-wrap">
        <h1 className="text-2xl font-bold">Server messages</h1>
        <Link href="/admin/discord" className="text-sm text-cyan-300 hover:underline">← Discord bot</Link>
      </div>
      <p className="mb-8 max-w-2xl text-sm text-muted">
        Owners write from their dashboard or from the bot. Your reply is delivered as a DM from ClusterBot
        and appears in their dashboard — to them it is one conversation with the bot they installed, so
        answer like a person and not a ticket system.
      </p>

      {rows.length === 0 ? (
        <div className="glass p-6 text-sm text-muted">
          Nothing yet. Owners reach this from their dashboard, or with{" "}
          <code className="text-cyan-300">/cluster admin</code> → Message Cluster.
        </div>
      ) : (
        <>
          {waiting.length > 0 && (
            <section className="mb-10">
              <h2 className="mb-3 font-bold">
                Waiting on us <span className="text-amber-300">({waiting.length})</span>
              </h2>
              <div className="space-y-3">{waiting.map((r) => <Row key={r.guildId} r={r} />)}</div>
            </section>
          )}
          {quiet.length > 0 && (
            <section>
              <h2 className="mb-3 font-bold">Answered</h2>
              <div className="space-y-3">{quiet.map((r) => <Row key={r.guildId} r={r} />)}</div>
            </section>
          )}
        </>
      )}
    </div>
  );
}

function Row({ r }: { r: Awaited<ReturnType<typeof inbox>>[number] }) {
  return (
    <Link
      href={`/admin/discord/${r.guildId}#messages`}
      className={`glass flex items-start gap-4 p-5 transition hover:border-cyan-400/40 ${
        r.unread > 0 ? "border border-amber-400/30" : "border border-white/10"
      }`}
    >
      {r.iconUrl
        // eslint-disable-next-line @next/next/no-img-element
        ? <img src={r.iconUrl} alt="" className="h-11 w-11 shrink-0 rounded-xl object-cover" />
        : <span className="grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-white/10 text-sm font-bold">{r.name.slice(0, 1)}</span>}
      <div className="min-w-0 flex-1">
        <div className="flex items-baseline gap-2">
          <span className="truncate font-bold">{r.name}</span>
          <span className="shrink-0 text-[11px] text-muted">
            {r.lastAt.toLocaleString(undefined, { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" })}
          </span>
        </div>
        <p className="mt-0.5 truncate text-sm text-muted">
          {r.lastSender === "admin" ? "You: " : ""}{r.lastBody}
        </p>
        {r.undelivered > 0 && (
          <p className="mt-1 flex items-center gap-1.5 text-[11px] text-rose-300">
            <Icon name="alert" size={11} />
            {r.undelivered} {r.undelivered === 1 ? "reply" : "replies"} never reached their DMs — they may not know you answered
          </p>
        )}
      </div>
      {r.unread > 0 && (
        <span className="shrink-0 rounded-full bg-amber-500/20 px-2.5 py-0.5 text-[11px] font-bold text-amber-200">
          {r.unread}
        </span>
      )}
    </Link>
  );
}
