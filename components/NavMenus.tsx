"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import Icon from "@/components/Icon";
import Avatar from "@/components/Avatar";
import { markAllNotificationsRead } from "@/app/actions/social";

export type NavNotif = { id: string; type: string; title: string; body: string | null; href: string | null; read: boolean; at: string };
export type NavConvo = { id: string; name: string; avatarUrl: string | null; snippet: string; at: string; unread: boolean };

function ago(iso: string): string {
  const s = Math.floor((Date.now() - new Date(iso).getTime()) / 1000);
  if (s < 60) return "now";
  const m = Math.floor(s / 60); if (m < 60) return `${m}m`;
  const h = Math.floor(m / 60); if (h < 24) return `${h}h`;
  return `${Math.floor(h / 24)}d`;
}

// Search + DMs + notifications, each a click-to-open dropdown. Only one opens at
// a time; any outside click or Escape closes it.
export default function NavMenus({
  notifications, unread, conversations,
}: { notifications: NavNotif[]; unread: number; conversations: NavConvo[] }) {
  const [open, setOpen] = useState<null | "search" | "dm" | "bell">(null);
  const wrap = useRef<HTMLDivElement | null>(null);
  const router = useRouter();
  const [q, setQ] = useState("");

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => { if (wrap.current && !wrap.current.contains(e.target as Node)) setOpen(null); };
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") setOpen(null); };
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => { document.removeEventListener("mousedown", onDown); document.removeEventListener("keydown", onKey); };
  }, [open]);

  const toggle = (k: "search" | "dm" | "bell") => setOpen((v) => (v === k ? null : k));
  const iconBtn = "relative flex items-center justify-center text-muted hover:text-ink transition-colors";
  const [markPending, startMark] = useTransition();
  const markAllRead = () => startMark(async () => { await markAllNotificationsRead(); router.refresh(); });
  const panel = "absolute right-0 top-full z-50 mt-2 w-80 max-w-[calc(100vw-2rem)] rounded-xl border border-white/10 bg-[#0a0a1c]/95 backdrop-blur-xl shadow-2xl overflow-hidden";

  return (
    <div ref={wrap} className="flex items-center gap-3">
      {/* Search */}
      <div className="relative hidden sm:block">
        <button type="button" aria-label="Search" className={iconBtn} onClick={() => toggle("search")}>
          <Icon name="search" size={19} />
        </button>
        {open === "search" && (
          <div className={panel}>
            <form onSubmit={(e) => { e.preventDefault(); const t = q.trim(); if (t) { router.push(`/search?q=${encodeURIComponent(t)}`); setOpen(null); } }} className="p-3">
              <div className="flex items-center gap-2 rounded-lg border border-white/12 bg-black/30 px-3 py-2">
                <Icon name="search" size={15} className="text-muted" />
                {/* eslint-disable-next-line jsx-a11y/no-autofocus */}
                <input autoFocus value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search gamers, planets, games…" className="w-full bg-transparent text-sm outline-none" />
              </div>
              <button className="mt-2 w-full glow-btn pressable rounded-lg py-1.5 text-xs font-semibold text-white">Search the Cluster</button>
            </form>
          </div>
        )}
      </div>

      {/* Messages */}
      <div className="relative">
        <button type="button" aria-label="Messages" className={iconBtn} onClick={() => toggle("dm")}>
          <Icon name="message" size={19} />
          {conversations.some((c) => c.unread) && <span className="absolute -right-1.5 -top-1 h-2.5 w-2.5 rounded-full bg-rose-500 ring-2 ring-[#04051a] animate-pulse" />}
        </button>
        {open === "dm" && (
          <div className={panel}>
            <div className="flex items-center justify-between px-4 py-2.5 border-b border-white/8">
              <span className="text-sm font-bold">Messages</span>
              <Link href="/messages" onClick={() => setOpen(null)} className="text-[11px] text-cyan-300 hover:underline">Open inbox</Link>
            </div>
            <div className="max-h-96 overflow-y-auto">
              {conversations.length === 0 ? (
                <div className="p-5 text-center text-xs text-muted">No conversations yet.</div>
              ) : conversations.map((c) => (
                <Link key={c.id} href={`/messages/${c.id}`} onClick={() => setOpen(null)}
                  className="flex items-center gap-3 px-4 py-2.5 hover:bg-white/5">
                  <Avatar name={c.name} src={c.avatarUrl} size={34} />
                  <span className="min-w-0 flex-1">
                    <span className="flex items-center justify-between gap-2">
                      <span className={`text-sm truncate ${c.unread ? "font-bold" : "font-semibold"}`}>{c.name}</span>
                      <span className="text-[10px] text-muted shrink-0">{ago(c.at)}</span>
                    </span>
                    <span className={`block text-xs truncate ${c.unread ? "text-ink" : "text-muted"}`}>{c.snippet}</span>
                  </span>
                  {c.unread && <span className="h-2.5 w-2.5 shrink-0 rounded-full bg-rose-500" />}
                </Link>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Notifications */}
      <div className="relative">
        <button type="button" aria-label="Notifications" className={iconBtn} onClick={() => toggle("bell")}>
          <Icon name="bell" size={19} />
          {unread > 0 && (
            <span className="absolute -right-2 -top-1.5 rounded-full bg-fuchsia-500 px-1.5 text-[10px] font-bold text-white">{unread > 9 ? "9+" : unread}</span>
          )}
        </button>
        {open === "bell" && (
          <div className={panel}>
            <div className="flex items-center justify-between px-4 py-2.5 border-b border-white/8">
              <span className="text-sm font-bold">Notifications</span>
              <div className="flex items-center gap-3">
                {unread > 0 && (
                  <button type="button" onClick={markAllRead} disabled={markPending}
                    className="text-[11px] text-cyan-300 hover:underline disabled:opacity-50 inline-flex items-center gap-1">
                    <Icon name="check" size={11} /> {markPending ? "Marking…" : "Mark all read"}
                  </button>
                )}
                <Link href="/notifications" onClick={() => setOpen(null)} className="text-[11px] text-cyan-300 hover:underline">See all</Link>
              </div>
            </div>
            <div className="max-h-96 overflow-y-auto">
              {notifications.length === 0 ? (
                <div className="p-5 text-center text-xs text-muted">You&apos;re all caught up.</div>
              ) : notifications.map((n) => {
                const inner = (
                  <span className="flex gap-3">
                    <span className={`mt-1 h-2 w-2 shrink-0 rounded-full ${n.read ? "bg-transparent" : "bg-fuchsia-400"}`} />
                    <span className="min-w-0 flex-1">
                      <span className="flex items-center justify-between gap-2">
                        <span className={`text-sm truncate ${n.read ? "font-semibold text-ink/90" : "font-bold"}`}>{n.title}</span>
                        <span className="text-[10px] text-muted shrink-0">{ago(n.at)}</span>
                      </span>
                      {n.body && <span className="block text-xs text-muted line-clamp-2">{n.body}</span>}
                    </span>
                  </span>
                );
                return n.href
                  ? <Link key={n.id} href={n.href} onClick={() => setOpen(null)} className="block px-4 py-2.5 hover:bg-white/5">{inner}</Link>
                  : <div key={n.id} className="px-4 py-2.5">{inner}</div>;
              })}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
