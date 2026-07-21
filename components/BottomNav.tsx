"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import Icon from "@/components/Icon";
import { useT } from "@/components/LocaleProvider";
import { defaultBottomTabs, type MobileTab } from "@/lib/mobile-nav";

// Native-app-style bottom tab bar (mobile only). Admin can fully configure the
// tabs (label / icon / link / order, which one is the raised centre, and which
// are shown); when unconfigured it falls back to the localized defaults with the
// Planets globe raised in the middle.
export default function BottomNav({ loggedIn, globeUrl, tabs }: { loggedIn: boolean; globeUrl?: string; tabs?: MobileTab[] }) {
  const pathname = usePathname();
  // Hide inside the admin console (it has its own nav) and full-screen editors.
  if (pathname.startsWith("/admin") || pathname.startsWith("/onboarding")) return null;

  const t = useT();
  const label = (tab: MobileTab): string =>
    tab.label?.trim() ||
    ({ home: t("nav.home"), quests: t("nav.quests"), ranks: t("nav.ranks"), you: t("nav.you"), planets: t("nav.planets") } as Record<string, string>)[tab.key] ||
    tab.key;
  const isActive = (tab: MobileTab): boolean => {
    if (tab.key === "home") return pathname === "/" || pathname === "/feed";
    if (tab.key === "you") return pathname.startsWith("/profile") || pathname.startsWith("/u/") || pathname.startsWith("/login");
    if (tab.key === "planets") return pathname.startsWith("/planets") || pathname.startsWith("/games");
    return pathname === tab.href || (tab.href.length > 1 && pathname.startsWith(tab.href));
  };

  const all = (tabs && tabs.length ? tabs : defaultBottomTabs(loggedIn)).filter((x) => x.enabled !== false);
  if (all.length === 0) return null;
  const center = all.find((x) => x.center) ?? all[Math.floor(all.length / 2)];
  const sides = all.filter((x) => x !== center);
  const leftCount = Math.ceil(sides.length / 2);
  const left = sides.slice(0, leftCount);
  const right = sides.slice(leftCount);

  return (
    <nav className="md:hidden fixed bottom-0 inset-x-0 z-40" style={{ paddingBottom: "env(safe-area-inset-bottom)" }}>
      <div className="relative mx-auto max-w-md">
        <div className="flex items-end justify-around border-t border-violet-500/25 bg-[#070826]/95 backdrop-blur-xl px-2 pt-1.5 pb-1.5">
          {left.map((tab) => <Tab key={tab.key} href={tab.href} icon={tab.icon} label={label(tab)} active={isActive(tab)} />)}

          {center && (
            <Link href={center.href} aria-label={label(center)} className="relative -mt-7 flex flex-col items-center">
              <span className={`flex h-16 w-16 items-center justify-center rounded-full overflow-hidden ring-4 ring-[#070826] shadow-[0_-6px_24px_-6px_rgba(139,92,246,0.8)] transition-transform active:scale-95 ${isActive(center) ? "scale-105" : ""}`}
                style={{ background: "radial-gradient(circle at 35% 30%, #8b5cf6, #22d3ee 90%)" }}>
                {center.key === "planets" && globeUrl
                  // eslint-disable-next-line @next/next/no-img-element
                  ? <img src={globeUrl} alt="" className="h-full w-full object-cover" />
                  : <Icon name={center.icon} size={30} className="text-white" />}
              </span>
              <span className={`text-[10px] font-bold mt-0.5 ${isActive(center) ? "text-cyan-300" : "text-muted"}`}>{label(center)}</span>
            </Link>
          )}

          {right.map((tab) => <Tab key={tab.key} href={tab.href} icon={tab.icon} label={label(tab)} active={isActive(tab)} />)}
        </div>
      </div>
    </nav>
  );
}

function Tab({ href, icon, label, active }: { href: string; icon: string; label: string; active: boolean }) {
  return (
    <Link href={href} className="flex flex-1 flex-col items-center gap-0.5 py-1">
      <Icon name={icon} size={20} className={active ? "text-cyan-300" : "text-muted"} />
      <span className={`text-[10px] ${active ? "text-cyan-300 font-semibold" : "text-muted"} truncate max-w-[64px]`}>{label}</span>
    </Link>
  );
}
