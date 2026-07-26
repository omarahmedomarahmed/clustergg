"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import Icon from "@/components/Icon";

// The Mission Control rail.
//
// Two things it has to do that the old flat list didn't: show you where you
// are, and show you what is waiting for you. A queue nobody can see from the
// nav is a queue nobody works.

export type NavItem = {
  href: string; label: string; icon?: string; badge?: number; exact?: boolean;
  /** Who can open it. Marked on the rail so an admin delegating work can see
   *  the boundary without opening the roles page. */
  access?: "staff" | "grantable" | "admin";
};
export type NavGroup = { section: string; icon?: string; items: NavItem[] };

function isActive(pathname: string, item: NavItem): boolean {
  if (item.exact) return pathname === item.href;
  return pathname === item.href || pathname.startsWith(`${item.href}/`);
}

export function AdminRail({ groups, staffNote }: { groups: NavGroup[]; staffNote?: string }) {
  const pathname = usePathname() || "";
  return (
    <div className="glass p-4 sticky top-20 space-y-5 max-h-[calc(100vh-6rem)] overflow-y-auto overscroll-contain">
      <div className="text-xs uppercase tracking-widest text-amber-300 flex items-center gap-2">
        <Icon name="shield" size={14} /> Mission Control
      </div>
      {staffNote && (
        <div className="text-[10px] text-muted border border-amber-400/25 rounded-lg p-2">{staffNote}</div>
      )}
      {groups.map((group) => (
        <div key={group.section}>
          <div className="text-[10px] uppercase tracking-widest text-muted mb-1.5 flex items-center gap-1.5">
            {group.icon && <Icon name={group.icon} size={11} />} {group.section}
          </div>
          <ul className="space-y-0.5">
            {group.items.map((item) => {
              const active = isActive(pathname, item);
              return (
                <li key={item.href}>
                  <Link
                    href={item.href}
                    aria-current={active ? "page" : undefined}
                    className={`flex items-center justify-between gap-2 rounded-lg px-2.5 py-1.5 text-sm transition ${
                      active
                        ? "bg-violet-500/20 text-ink ring-1 ring-violet-400/40 font-semibold"
                        : "text-muted hover:text-ink hover:bg-violet-500/10"
                    }`}
                  >
                    <span className="truncate flex items-center gap-1.5">
                      {item.label}
                      {item.access === "admin" && <Dot title="Admin only" className="bg-rose-400/80" />}
                      {item.access === "grantable" && <Dot title="Admin, grantable to staff" className="bg-amber-400/80" />}
                    </span>
                    {item.badge ? (
                      <span className="shrink-0 rounded-full bg-amber-500/25 text-amber-200 px-1.5 py-0.5 text-[10px] font-black">
                        {item.badge > 99 ? "99+" : item.badge}
                      </span>
                    ) : null}
                  </Link>
                </li>
              );
            })}
          </ul>
        </div>
      ))}
    </div>
  );
}

// Mobile: the same information, as a horizontal rail. Grouped headings would
// cost more room than they earn on a phone, so the group name rides along with
// the active item only.
function Dot({ title, className }: { title: string; className: string }) {
  return <span title={title} className={`inline-block h-1.5 w-1.5 shrink-0 rounded-full ${className}`} />;
}

export function AdminMobileNav({ groups }: { groups: NavGroup[] }) {
  const pathname = usePathname() || "";
  const items = groups.flatMap((g) => g.items);
  return (
    <div className="lg:hidden mb-4 -mx-4 px-4">
      <div className="flex items-center gap-2 mb-2 text-xs uppercase tracking-widest text-amber-300">
        <Icon name="shield" size={14} /> Mission Control
      </div>
      <div className="flex gap-1.5 overflow-x-auto overscroll-x-contain pb-1 [scrollbar-width:none]">
        {items.map((item) => {
          const active = isActive(pathname, item);
          return (
            <Link
              key={item.href}
              href={item.href}
              aria-current={active ? "page" : undefined}
              className={`shrink-0 inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs whitespace-nowrap transition ${
                active
                  ? "border-violet-400/60 bg-violet-500/20 text-ink font-semibold"
                  : "border-white/12 text-muted hover:text-ink hover:border-cyan-400/40"
              }`}
            >
              {item.label}
              {item.badge ? (
                <span className="rounded-full bg-amber-500/25 text-amber-200 px-1.5 text-[10px] font-black">
                  {item.badge > 99 ? "99+" : item.badge}
                </span>
              ) : null}
            </Link>
          );
        })}
      </div>
    </div>
  );
}
