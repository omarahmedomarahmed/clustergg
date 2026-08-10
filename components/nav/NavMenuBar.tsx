"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import Icon from "@/components/Icon";
import GameLogo from "@/components/GameLogo";
import { NAV_MENUS, type NavMenu } from "@/lib/nav-menus";

export type NavGame = { id: string; name: string; href: string; logoUrl: string | null };

// Three menus, one row, identical for every visitor. B123.
//
// ===== THE ONE RULE THAT MAKES A DROPDOWN NAV WORK =====
//
// It opens on HOVER on a pointer device and on CLICK everywhere, and a click
// always wins. Hover-only strands every touch user; click-only makes a desktop
// nav feel slow. Both, with click able to pin a panel open, is the combination
// people already know from every large site.
//
// ===== AND THE ONE THAT MAKES IT NOT ANNOY =====
//
// A hover menu that closes the instant the pointer leaves the trigger is
// unusable, because the gap between the trigger and the panel is a dead zone
// the pointer must cross. So closing is delayed, and moving into the panel
// cancels the close. This is the whole reason mega-menus feel broken when they
// are built naively.

export default function NavMenuBar({ games, signedIn }: { games: NavGame[]; signedIn: boolean }) {
  const [open, setOpen] = useState<string | null>(null);
  const [pinned, setPinned] = useState(false);
  const closeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const root = useRef<HTMLDivElement>(null);

  const cancelClose = () => {
    if (closeTimer.current) { clearTimeout(closeTimer.current); closeTimer.current = null; }
  };
  const scheduleClose = () => {
    cancelClose();
    if (pinned) return;
    closeTimer.current = setTimeout(() => setOpen(null), 180);
  };

  // Escape closes, and a click anywhere outside closes. Both are what somebody
  // reaches for when a panel is covering what they wanted to read.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") { setOpen(null); setPinned(false); }
    };
    const onDown = (e: MouseEvent) => {
      if (root.current && !root.current.contains(e.target as Node)) { setOpen(null); setPinned(false); }
    };
    document.addEventListener("keydown", onKey);
    document.addEventListener("mousedown", onDown);
    return () => {
      document.removeEventListener("keydown", onKey);
      document.removeEventListener("mousedown", onDown);
    };
  }, []);

  useEffect(() => () => cancelClose(), []);

  const toggle = (id: string) => {
    if (open === id && pinned) { setOpen(null); setPinned(false); }
    else { setOpen(id); setPinned(true); }
  };

  return (
    <div ref={root} className="hidden md:flex items-center gap-1" onMouseLeave={scheduleClose}>
      {NAV_MENUS.map((m) => {
        const on = open === m.id;
        return (
          <div key={m.id} className="relative">
            <button
              type="button"
              onClick={() => toggle(m.id)}
              onMouseEnter={() => { cancelClose(); setOpen(m.id); }}
              aria-expanded={on}
              aria-haspopup="true"
              className={`inline-flex items-center gap-1.5 rounded-full px-3.5 py-1.5 text-sm font-semibold transition-colors ${
                on ? "text-ink" : "text-muted hover:text-ink"
              }`}
              style={on ? { background: `${m.accent}1f`, color: m.accent } : undefined}
            >
              {m.label}
              <Icon name="chevronDown" size={12} className={on ? "" : "opacity-50"} />
            </button>
          </div>
        );
      })}

      {/* ONE panel, positioned under the whole bar rather than under its
          trigger. A panel anchored to a 70px-wide button either overflows the
          viewport or forces the content into a column — and the content here is
          a grid. Anchoring to the bar also means switching menus slides rather
          than closes-and-reopens. */}
      {open && (
        <div
          onMouseEnter={cancelClose}
          onMouseLeave={scheduleClose}
          className="absolute left-0 right-0 top-full z-50 px-3 sm:px-4"
        >
          <div className="mx-auto max-w-6xl">
            <Panel
              menu={NAV_MENUS.find((m) => m.id === open)!}
              games={games}
              signedIn={signedIn}
              onNavigate={() => { setOpen(null); setPinned(false); }}
            />
          </div>
        </div>
      )}
    </div>
  );
}

function Panel({
  menu, games, signedIn, onNavigate,
}: { menu: NavMenu; games: NavGame[]; signedIn: boolean; onNavigate: () => void }) {
  // The `auth` leaves are the only thing that differs between visitors, and
  // only ever by omission — the group, its order and its accent never change.
  const links = menu.links.filter((l) => !l.auth || signedIn);
  const showGames = menu.id === "play" && games.length > 0;

  return (
    <div
      className="mt-1 overflow-hidden rounded-3xl border border-white/12 shadow-2xl"
      style={{ background: "rgba(4,5,26,0.97)", backdropFilter: "blur(20px)" }}
    >
      <div className="flex items-start gap-2 border-b border-white/8 px-5 py-3">
        <span className="grid h-7 w-7 shrink-0 place-items-center rounded-lg" style={{ background: `${menu.accent}22` }}>
          <Icon name={menu.icon} size={14} style={{ color: menu.accent }} />
        </span>
        <p className="text-sm leading-snug text-muted">{menu.lede}</p>
      </div>

      <div className={`grid gap-1 p-3 ${showGames ? "lg:grid-cols-[1.3fr_1fr]" : "sm:grid-cols-2"}`}>
        <div className={`grid gap-1 ${showGames ? "sm:grid-cols-2" : "sm:grid-cols-2 sm:col-span-2"}`}>
          {links.map((l) => (
            <Link
              key={l.href}
              href={l.href}
              onClick={onNavigate}
              className="group flex items-start gap-2.5 rounded-2xl px-3 py-2.5 transition-colors hover:bg-white/[0.06]"
            >
              <span
                className="mt-0.5 grid h-8 w-8 shrink-0 place-items-center rounded-xl border transition-colors"
                style={{ borderColor: `${menu.accent}33`, background: `${menu.accent}12` }}
              >
                <Icon name={l.icon} size={14} style={{ color: menu.accent }} />
              </span>
              <span className="min-w-0">
                <span className="block text-sm font-semibold">{l.label}</span>
                {l.note && <span className="block text-xs leading-snug text-muted">{l.note}</span>}
              </span>
            </Link>
          ))}
        </div>

        {/* The game logos, which used to eat the top row. They are a
            destination list, so they live in the menu that goes to them. */}
        {showGames && (
          <div className="rounded-2xl border border-white/8 bg-black/25 p-3">
            <div className="mb-2 text-[10px] uppercase tracking-[0.2em] text-muted">Jump to a game</div>
            <div className="grid grid-cols-3 gap-1.5 sm:grid-cols-4 lg:grid-cols-3">
              {games.map((g) => (
                <Link
                  key={g.id}
                  href={g.href}
                  onClick={onNavigate}
                  title={g.name}
                  className="group flex flex-col items-center gap-1 rounded-xl p-1.5 transition-colors hover:bg-white/[0.07]"
                >
                  <GameLogo logoUrl={g.logoUrl} name={g.name} size={34} rounded="rounded-lg"
                    className="ring-1 ring-white/10 transition-transform group-hover:scale-105" />
                  <span className="w-full truncate text-center text-[10px] leading-tight text-muted">{g.name}</span>
                </Link>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
