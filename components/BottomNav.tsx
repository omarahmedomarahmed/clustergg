"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import Icon from "@/components/Icon";
import { useT } from "@/components/LocaleProvider";

// Native-app-style bottom tab bar, mobile only. Five tabs with the Planets globe
// raised + glorified in the centre. Same tabs for guests and members (the Home
// and You tabs just point to different routes when signed out).
export default function BottomNav({ loggedIn, globeUrl }: { loggedIn: boolean; globeUrl?: string }) {
  const pathname = usePathname();
  // Hide inside the admin console (it has its own nav) and full-screen editors.
  if (pathname.startsWith("/admin") || pathname.startsWith("/onboarding")) return null;

  const t = useT();
  const tabs = [
    { href: loggedIn ? "/feed" : "/", label: t("nav.home"), icon: "home", match: (p: string) => p === "/" || p === "/feed" },
    { href: "/quests", label: t("nav.quests"), icon: "trophy", match: (p: string) => p.startsWith("/quests") },
    { href: "/leaderboards", label: t("nav.ranks"), icon: "chart", match: (p: string) => p.startsWith("/leaderboards") },
    { href: loggedIn ? "/profile" : "/login", label: t("nav.you"), icon: "user", match: (p: string) => p.startsWith("/profile") || p.startsWith("/u/") || p.startsWith("/login") },
  ];
  const planetsActive = pathname.startsWith("/planets") || pathname.startsWith("/games");

  return (
    <nav className="md:hidden fixed bottom-0 inset-x-0 z-40" style={{ paddingBottom: "env(safe-area-inset-bottom)" }}>
      <div className="relative mx-auto max-w-md">
        <div className="flex items-end justify-around border-t border-violet-500/25 bg-[#070826]/95 backdrop-blur-xl px-2 pt-1.5 pb-1.5">
          {/* left two */}
          {tabs.slice(0, 2).map((t) => <Tab key={t.href} t={t} active={t.match(pathname)} />)}
          {/* center planets globe */}
          <Link href="/planets" aria-label="Planets" className="relative -mt-7 flex flex-col items-center">
            <span className={`flex h-16 w-16 items-center justify-center rounded-full overflow-hidden ring-4 ring-[#070826] shadow-[0_-6px_24px_-6px_rgba(139,92,246,0.8)] transition-transform active:scale-95 ${planetsActive ? "scale-105" : ""}`}
              style={{ background: "radial-gradient(circle at 35% 30%, #8b5cf6, #22d3ee 90%)" }}>
              {globeUrl
                // eslint-disable-next-line @next/next/no-img-element
                ? <img src={globeUrl} alt="" className="h-full w-full object-cover" />
                : <Icon name="planet" size={30} className="text-white" />}
            </span>
            <span className={`text-[10px] font-bold mt-0.5 ${planetsActive ? "text-cyan-300" : "text-muted"}`}>{t("nav.planets")}</span>
          </Link>
          {/* right two */}
          {tabs.slice(2).map((t) => <Tab key={t.href} t={t} active={t.match(pathname)} />)}
        </div>
      </div>
    </nav>
  );
}

function Tab({ t, active }: { t: { href: string; label: string; icon: string }; active: boolean }) {
  return (
    <Link href={t.href} className="flex flex-1 flex-col items-center gap-0.5 py-1">
      <Icon name={t.icon} size={20} className={active ? "text-cyan-300" : "text-muted"} />
      <span className={`text-[10px] ${active ? "text-cyan-300 font-semibold" : "text-muted"}`}>{t.label}</span>
    </Link>
  );
}
