import Link from "next/link";
import { requireStaff } from "@/lib/auth";
import { adminInbox, type InboxThread } from "@/lib/threads";
import Icon from "@/components/Icon";

export const dynamic = "force-dynamic";
export const metadata = { title: "Admin · Messages" };

// One inbox, both sides of the marketplace.
//
// There were two message queues. Server owners had a page of their own; brands
// had a box buried inside a brand's detail page, three clicks in, that nothing
// linked to and no counter surfaced. Predictably the brand side went unanswered
// for days — not because anyone decided to ignore it, but because nothing ever
// said there was something in it.
//
// Answering an owner and answering a brand is the same job at the same desk, so
// it is one queue, ordered by the oldest thing still waiting on us. The filter
// is a filter, not a different page.
export default async function AdminMessagesPage({
  searchParams,
}: { searchParams: Promise<{ kind?: string }> }) {
  await requireStaff();
  const { kind } = await searchParams;
  const all = await adminInbox();

  const filter = kind === "server" || kind === "brand" ? kind : "all";
  const shown = filter === "all" ? all : all.filter((t) => t.kind === filter);
  const waiting = shown.filter((t) => t.unread > 0);
  const answered = shown.filter((t) => t.unread === 0);

  const counts = {
    all: all.filter((t) => t.unread > 0).length,
    server: all.filter((t) => t.kind === "server" && t.unread > 0).length,
    brand: all.filter((t) => t.kind === "brand" && t.unread > 0).length,
  };

  return (
    <div className="max-w-4xl">
      <h1 className="text-2xl font-bold">Messages</h1>
      <p className="mt-2 mb-6 max-w-2xl text-sm text-muted">
        Every conversation with a server owner or a brand, in one queue. A reply to an owner is
        delivered as a DM from ClusterBot and appears in their dashboard — to them it is one
        conversation with the bot they installed, so answer like a person and not a ticket system.
      </p>

      <div className="mb-6 flex flex-wrap gap-2">
        <Filter href="/admin/messages" label="Everything" on={filter === "all"} badge={counts.all} total={all.length} />
        <Filter href="/admin/messages?kind=server" label="Server owners" on={filter === "server"}
          badge={counts.server} total={all.filter((t) => t.kind === "server").length} />
        <Filter href="/admin/messages?kind=brand" label="Brands" on={filter === "brand"}
          badge={counts.brand} total={all.filter((t) => t.kind === "brand").length} />
      </div>

      {shown.length === 0 ? (
        <div className="glass p-6 text-sm text-muted">
          Nothing here yet. Owners reach us from their dashboard or with{" "}
          <code className="text-cyan-300">/cluster show:admin</code> → Message Cluster; brands write
          from their portal.
        </div>
      ) : (
        <>
          {waiting.length > 0 && (
            <section className="mb-10">
              <h2 className="mb-3 font-bold">
                Waiting on us <span className="text-amber-300">({waiting.length})</span>
              </h2>
              <div className="space-y-3">{waiting.map((t) => <Row key={`${t.kind}-${t.id}`} t={t} />)}</div>
            </section>
          )}
          {answered.length > 0 && (
            <section>
              <h2 className="mb-3 font-bold">Answered</h2>
              <div className="space-y-3">{answered.map((t) => <Row key={`${t.kind}-${t.id}`} t={t} />)}</div>
            </section>
          )}
        </>
      )}
    </div>
  );
}

function Filter({ href, label, on, badge, total }: {
  href: string; label: string; on: boolean; badge: number; total: number;
}) {
  return (
    <Link
      href={href}
      aria-current={on ? "page" : undefined}
      className={`inline-flex items-center gap-2 rounded-full border px-4 py-1.5 text-xs transition ${
        on ? "border-violet-400/60 bg-violet-500/20 font-semibold text-ink" : "border-white/12 text-muted hover:border-cyan-400/40 hover:text-ink"
      }`}
    >
      {label}
      <span className="text-[10px] text-muted">{total}</span>
      {badge > 0 && (
        <span className="rounded-full bg-amber-500/25 px-1.5 text-[10px] font-black text-amber-200">{badge}</span>
      )}
    </Link>
  );
}

function Row({ t }: { t: InboxThread }) {
  const you = t.lastSender === "admin";
  return (
    <Link
      href={t.href}
      className={`glass flex items-start gap-4 p-5 transition hover:border-cyan-400/40 ${
        t.unread > 0 ? "border border-amber-400/30" : "border border-white/10"
      }`}
    >
      {t.iconUrl
        // eslint-disable-next-line @next/next/no-img-element
        ? <img src={t.iconUrl} alt="" className="h-11 w-11 shrink-0 rounded-xl object-cover" />
        : <span className="grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-white/10 text-sm font-bold">{t.name.slice(0, 1)}</span>}
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-baseline gap-2">
          <span className="truncate font-bold">{t.name}</span>
          {/* Which marketplace side this is. Two queues in one list only works
              if every row says which one it came from. */}
          <span className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-semibold ${
            t.kind === "server" ? "bg-cyan-500/15 text-cyan-200" : "bg-violet-500/15 text-violet-200"
          }`}>
            {t.kind === "server" ? "Server" : "Brand"}
          </span>
          <span className="shrink-0 text-[11px] text-muted">
            {t.lastAt.toLocaleString(undefined, { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" })}
          </span>
        </div>
        <p className="mt-0.5 truncate text-sm text-muted">{you ? "You: " : ""}{t.lastBody}</p>
        {t.undelivered > 0 && (
          <p className="mt-1 flex items-center gap-1.5 text-[11px] text-rose-300">
            <Icon name="alert" size={11} />
            {t.undelivered} {t.undelivered === 1 ? "reply" : "replies"} never reached their DMs — they may not know you answered
          </p>
        )}
      </div>
      {t.unread > 0 && (
        <span className="shrink-0 rounded-full bg-amber-500/20 px-2.5 py-0.5 text-[11px] font-bold text-amber-200">
          {t.unread}
        </span>
      )}
    </Link>
  );
}
