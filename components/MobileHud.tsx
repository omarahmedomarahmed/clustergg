import Link from "next/link";
import Avatar from "@/components/Avatar";
import CpIcon from "@/components/CpIcon";
import { levelFromCp } from "@/lib/level";

// The native-mobile-game HUD strip, shown on mobile only (md:hidden) directly
// under the top nav row for signed-in gamers. It reads like a game's account
// bar: avatar with a level ring, an animated XP bar (Cluster Points toward the
// next level), and quick red-dot alerts for notifications + messages so the
// gamer always sees "where to pay attention".
export default function MobileHud({
  displayName, avatarUrl, slug, cp, unread, unreadDm,
}: {
  displayName: string; avatarUrl: string | null; slug: string;
  cp: number; unread: number; unreadDm: boolean;
}) {
  const lv = levelFromCp(cp);
  return (
    <div className="md:hidden border-t border-violet-500/15 bg-[#04051a]/70 px-3 py-1.5">
      <div className="flex items-center gap-2.5">
        {/* Avatar + level badge */}
        <Link href={`/u/${slug}`} className="relative shrink-0" aria-label="Your profile">
          <span className="block rounded-full ring-2 ring-cyan-400/60 p-[1px]">
            <Avatar name={displayName} src={avatarUrl} size={30} />
          </span>
          <span className="absolute -bottom-1 -right-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-gradient-to-br from-violet-500 to-cyan-400 px-1 text-[9px] font-black text-white ring-2 ring-[#04051a]">
            {lv.level}
          </span>
        </Link>

        {/* XP bar */}
        <Link href="/quests" className="min-w-0 flex-1">
          <div className="flex items-center justify-between text-[10px] leading-none mb-1">
            <span className="font-bold text-cyan-200">LV {lv.level}</span>
            <span className="inline-flex items-center gap-1 text-muted"><CpIcon size={11} /> {cp.toLocaleString()}</span>
          </div>
          <div className="h-2 rounded-full bg-black/50 overflow-hidden ring-1 ring-white/10">
            <div className="h-full rounded-full bg-gradient-to-r from-violet-500 via-fuchsia-400 to-cyan-400 transition-[width] duration-500"
              style={{ width: `${Math.max(6, lv.pct)}%` }} />
          </div>
        </Link>

        {/* Alerts — red dots where attention is needed */}
        <div className="flex items-center gap-1.5 shrink-0">
          <HudAlert href="/notifications" icon="bell" on={unread > 0} count={unread} />
          <HudAlert href="/messages" icon="message" on={unreadDm} />
        </div>
      </div>
    </div>
  );
}

function HudAlert({ href, icon, on, count }: { href: string; icon: "bell" | "message"; on: boolean; count?: number }) {
  return (
    <Link href={href} className="relative flex h-8 w-8 items-center justify-center rounded-xl border border-white/10 bg-black/25 text-muted active:scale-95 transition-transform">
      {icon === "bell"
        ? <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9" /><path d="M10.3 21a1.94 1.94 0 0 0 3.4 0" /></svg>
        : <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" /></svg>}
      {on && (
        <span className="absolute -top-1 -right-1 flex min-h-4 min-w-4 items-center justify-center rounded-full bg-rose-500 px-1 text-[9px] font-black text-white ring-2 ring-[#04051a] animate-pulse">
          {count && count > 0 ? (count > 9 ? "9+" : count) : ""}
        </span>
      )}
    </Link>
  );
}
