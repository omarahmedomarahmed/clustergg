"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import Avatar from "@/components/Avatar";
import Icon from "@/components/Icon";
import { logout } from "@/app/actions/auth";

export default function UserMenu({
  displayName, avatarUrl, slug, canAdmin,
}: { displayName: string; avatarUrl: string | null; slug: string; canAdmin: boolean }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const onClick = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onClick);
    return () => document.removeEventListener("mousedown", onClick);
  }, []);

  const item = "flex items-center gap-2.5 px-4 py-2.5 text-sm text-ink/90 hover:text-white hover:bg-violet-500/20 transition-colors";

  return (
    <div className="relative" ref={ref}>
      <button
        onClick={() => setOpen((o) => !o)}
        className="flex items-center gap-1.5 rounded-full border border-transparent hover:border-violet-400/40 p-0.5 pr-1.5 transition-colors"
        aria-label="Account menu"
      >
        <Avatar name={displayName} src={avatarUrl} size={32} />
        <Icon name="chevronDown" size={14} className={`text-muted transition-transform ${open ? "rotate-180" : ""}`} />
      </button>
      {open && (
        // Solid, opaque background so items are always legible (previous glass
        // version was see-through). One clean list — profile is the hub.
        <div
          className="absolute right-0 top-12 z-50 w-56 rounded-xl overflow-hidden border border-violet-400/30 shadow-2xl"
          style={{ background: "#0b0d26", boxShadow: "0 20px 60px -12px rgba(0,0,0,.8)" }}
        >
          <Link href={`/u/${slug}`} onClick={() => setOpen(false)} className="block px-4 py-3.5 border-b border-violet-400/15 hover:bg-violet-500/15 transition-colors">
            <div className="flex items-center gap-3">
              <Avatar name={displayName} src={avatarUrl} size={40} />
              <div className="min-w-0">
                <div className="font-semibold text-sm truncate text-white">{displayName}</div>
                <div className="text-xs text-cyan-300/90 truncate">View my profile →</div>
              </div>
            </div>
          </Link>
          <nav className="py-1.5" onClick={() => setOpen(false)}>
            <Link href="/profile" className={item}><Icon name="edit" size={16} className="text-violet-300" /> Customize profile</Link>
            <Link href="/settings/account" className={item}><Icon name="settings" size={16} className="text-violet-300" /> Settings</Link>
            {canAdmin && (
              <Link href="/admin" className={`${item} !text-amber-300 hover:!text-amber-200`}>
                <Icon name="shield" size={16} /> Mission Control
              </Link>
            )}
            <div className="my-1 border-t border-violet-400/15" />
            <form action={logout}>
              <button type="submit" className={`${item} w-full text-left !text-rose-300 hover:!text-rose-200`}>
                <Icon name="logout" size={16} /> Sign out
              </button>
            </form>
          </nav>
        </div>
      )}
    </div>
  );
}
