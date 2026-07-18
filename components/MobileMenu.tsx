"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import Icon from "@/components/Icon";
import { logout } from "@/app/actions/auth";

export default function MobileMenu({
  links, loggedIn, profileSlug,
}: { links: { href: string; label: string; icon: string }[]; loggedIn: boolean; profileSlug?: string | null }) {
  const [open, setOpen] = useState(false);
  const pathname = usePathname();

  useEffect(() => { setOpen(false); }, [pathname]);
  useEffect(() => {
    document.body.style.overflow = open ? "hidden" : "";
    return () => { document.body.style.overflow = ""; };
  }, [open]);

  return (
    <div className="md:hidden">
      <button
        aria-label="Menu"
        className="flex h-9 w-9 items-center justify-center rounded-lg border border-violet-400/25 text-muted hover:text-ink"
        onClick={() => setOpen(true)}
      >
        <Icon name="menu" size={18} />
      </button>

      {open && (
        <div className="fixed inset-0 z-[60]">
          <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" onClick={() => setOpen(false)} />
          <div className="absolute right-0 top-0 h-full w-72 bg-[#070826] border-l border-violet-500/25 p-5 flex flex-col animate-[rise-in_.25s_ease] shadow-2xl">
            <div className="flex items-center justify-between mb-6">
              <span className="text-sm font-bold tracking-widest grad-text">CLUSTER</span>
              <button
                aria-label="Close menu"
                onClick={() => setOpen(false)}
                className="flex h-9 w-9 items-center justify-center rounded-lg border border-violet-400/25 text-muted"
              >
                <Icon name="x" size={16} />
              </button>
            </div>
            <nav className="flex flex-col gap-1">
              {links.map((l) => {
                const active = pathname === l.href || pathname.startsWith(l.href + "/");
                return (
                  <Link
                    key={l.href}
                    href={l.href}
                    className={`flex items-center gap-3 rounded-xl px-4 py-3 text-[15px] transition-colors ${
                      active ? "bg-violet-500/15 text-ink border border-violet-400/30" : "text-muted hover:text-ink hover:bg-violet-500/8"
                    }`}
                  >
                    <Icon name={l.icon} size={18} className={active ? "text-cyan-300" : ""} />
                    {l.label}
                  </Link>
                );
              })}
            </nav>
            <div className="mt-auto pt-6 border-t border-violet-400/15 space-y-1">
              {loggedIn ? (
                <>
                  {profileSlug && (
                    <Link href={`/u/${profileSlug}`} className="flex items-center gap-3 rounded-xl px-4 py-3 text-[15px] text-muted hover:text-ink">
                      <Icon name="user" size={18} /> My profile
                    </Link>
                  )}
                  <Link href="/profile" className="flex items-center gap-3 rounded-xl px-4 py-3 text-[15px] text-muted hover:text-ink">
                    <Icon name="edit" size={18} /> Customize profile
                  </Link>
                  <form action={logout}>
                    <button type="submit" className="flex w-full items-center gap-3 rounded-xl px-4 py-3 text-[15px] text-rose-300 hover:text-rose-200 text-left">
                      <Icon name="logout" size={18} /> Sign out
                    </button>
                  </form>
                </>
              ) : (
                <Link href="/signup" className="glow-btn block rounded-full px-6 py-3 text-center font-semibold text-white">
                  Join the Cluster
                </Link>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
