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

  const item = "flex items-center gap-2.5 px-4 py-2.5 text-sm text-muted hover:text-ink hover:bg-violet-500/10 transition-colors";

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
        <div className="absolute right-0 top-12 z-50 w-56 glass !rounded-xl overflow-hidden shadow-2xl">
          <div className="px-4 py-3 border-b border-violet-400/15">
            <div className="font-semibold text-sm truncate">{displayName}</div>
            <div className="text-xs text-muted truncate">@{slug}</div>
          </div>
          <nav className="py-1.5" onClick={() => setOpen(false)}>
            <Link href={`/u/${slug}`} className={item}><Icon name="user" size={16} /> My profile</Link>
            <Link href="/profile" className={item}><Icon name="edit" size={16} /> Edit profile</Link>
            <Link href="/settings/connections" className={item}><Icon name="link" size={16} /> Connections</Link>
            <Link href="/settings/account" className={item}><Icon name="settings" size={16} /> Settings</Link>
            {canAdmin && (
              <Link href="/admin" className={`${item} text-amber-300/90 hover:text-amber-200`}>
                <Icon name="shield" size={16} /> Mission Control
              </Link>
            )}
            <form action={logout}>
              <button type="submit" className={`${item} w-full text-left text-rose-300/90 hover:text-rose-200`}>
                <Icon name="logout" size={16} /> Sign out
              </button>
            </form>
          </nav>
        </div>
      )}
    </div>
  );
}
