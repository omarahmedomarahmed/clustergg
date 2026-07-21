"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import Icon from "@/components/Icon";
import GameLogo from "@/components/GameLogo";
import { useT } from "@/components/LocaleProvider";
import { logout } from "@/app/actions/auth";

export default function MobileMenu({
  links, loggedIn, profileSlug, wordmarkUrl, markUrl,
}: {
  links: { href: string; label: string; icon: string; logoUrl?: string | null }[];
  loggedIn: boolean; profileSlug?: string | null;
  wordmarkUrl?: string | null; markUrl?: string | null;
}) {
  const [open, setOpen] = useState(false);
  const [mounted, setMounted] = useState(false);
  const pathname = usePathname();
  const t = useT();

  useEffect(() => setMounted(true), []);
  useEffect(() => { setOpen(false); }, [pathname]);
  useEffect(() => {
    document.body.style.overflow = open ? "hidden" : "";
    return () => { document.body.style.overflow = ""; };
  }, [open]);

  // The drawer is portaled to <body> so it escapes the nav header's
  // backdrop-filter containing block (otherwise a `fixed` child is trapped
  // inside the header and renders behind the page).
  const drawer = (
    <div className="fixed inset-0 z-[100] md:hidden">
      <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" onClick={() => setOpen(false)} />
      <div className="absolute right-0 top-0 h-full w-72 max-w-[85vw] bg-[#070826]/97 backdrop-blur-2xl border-l border-violet-500/25 p-5 flex flex-col animate-[rise-in_.25s_ease] shadow-2xl overflow-y-auto"
        style={{ paddingTop: "calc(env(safe-area-inset-top) + 1.25rem)", paddingBottom: "calc(env(safe-area-inset-bottom) + 1.25rem)" }}>
        <div className="flex items-center justify-between mb-6">
          {wordmarkUrl
            // eslint-disable-next-line @next/next/no-img-element
            ? <img src={wordmarkUrl} alt="Cluster" className="h-8 w-auto max-w-[150px] object-contain" />
            : markUrl
              // eslint-disable-next-line @next/next/no-img-element
              ? <img src={markUrl} alt="Cluster" className="h-9 w-9 rounded-lg object-cover ring-1 ring-violet-400/30" />
              : <span className="text-sm font-bold tracking-widest grad-text">CLUSTER</span>}
          <button aria-label="Close menu" onClick={() => setOpen(false)}
            className="flex h-9 w-9 items-center justify-center rounded-lg border border-violet-400/25 text-muted">
            <Icon name="x" size={16} />
          </button>
        </div>
        <nav className="flex flex-col gap-1">
          {links.map((l) => {
            const active = pathname === l.href || pathname.startsWith(l.href + "/");
            return (
              <Link key={l.href} href={l.href}
                className={`flex items-center gap-3 rounded-xl px-3 py-2.5 text-[15px] transition-colors ${
                  active ? "bg-violet-500/15 text-ink border border-violet-400/30" : "text-muted hover:text-ink hover:bg-violet-500/8"}`}>
                {l.logoUrl
                  ? <GameLogo logoUrl={l.logoUrl} name={l.label} size={26} rounded="rounded-lg" className="ring-1 ring-violet-400/25 shrink-0" />
                  : <Icon name={l.icon} size={18} className={active ? "text-cyan-300" : ""} />}
                <span className="truncate">{l.label}</span>
              </Link>
            );
          })}
        </nav>
        <div className="mt-auto pt-6 border-t border-violet-400/15 space-y-1">
          {loggedIn ? (
            <>
              {profileSlug && (
                <Link href={`/u/${profileSlug}`} className="flex items-center gap-3 rounded-xl px-4 py-3 text-[15px] text-muted hover:text-ink">
                  <Icon name="user" size={18} /> {t("nav.myProfile")}
                </Link>
              )}
              <Link href="/profile" className="flex items-center gap-3 rounded-xl px-4 py-3 text-[15px] text-muted hover:text-ink">
                <Icon name="edit" size={18} /> {t("nav.customize")}
              </Link>
              <form action={logout}>
                <button type="submit" className="flex w-full items-center gap-3 rounded-xl px-4 py-3 text-[15px] text-rose-300 hover:text-rose-200 text-left">
                  <Icon name="logout" size={18} /> {t("nav.signOut")}
                </button>
              </form>
            </>
          ) : (
            <Link href="/signup" className="glow-btn block rounded-full px-6 py-3 text-center font-semibold text-white">
              {t("nav.join")}
            </Link>
          )}
        </div>
      </div>
    </div>
  );

  return (
    <div className="md:hidden">
      <button aria-label="Menu" onClick={() => setOpen(true)}
        className="flex h-9 w-9 items-center justify-center rounded-lg border border-violet-400/25 text-muted hover:text-ink">
        <Icon name="menu" size={18} />
      </button>
      {mounted && open && createPortal(drawer, document.body)}
    </div>
  );
}
