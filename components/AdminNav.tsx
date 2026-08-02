"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import Icon from "@/components/Icon";

// The Mission Control rail — sections, not pages.
//
// It used to list all thirty-nine admin pages at once. That is a table of
// contents pretending to be navigation: nobody holds thirty-nine items in their
// head, half of them were a single control each, and the ones that mattered
// (a queue with something in it) were indistinguishable from the ones that
// didn't. So the rail lists the seven sections, each with its own waiting
// count, and the pages inside a section appear as tabs across the top of it
// (`AdminSectionTabs`). Same pages, one level of choice at a time.

export type NavItem = {
  href: string; label: string; icon?: string; badge?: number; exact?: boolean;
  /** Who can open it. Marked on the rail so an admin delegating work can see
   *  the boundary without opening the roles page. */
  access?: "staff" | "grantable" | "admin";
};
export type NavGroup = { section: string; icon?: string; home: string; items: NavItem[] };

export function isActive(pathname: string, item: { href: string; exact?: boolean }): boolean {
  if (item.exact) return pathname === item.href;
  return pathname === item.href || pathname.startsWith(`${item.href}/`);
}

const inGroup = (pathname: string, group: NavGroup) => group.items.some((i) => isActive(pathname, i));

export function AdminRail({ groups, staffNote }: { groups: NavGroup[]; staffNote?: string }) {
  const pathname = usePathname() || "";
  return (
    <div className="glass sticky top-20 max-h-[calc(100vh-6rem)] space-y-1 overflow-y-auto overscroll-contain p-4">
      <div className="mb-3 flex items-center gap-2 text-xs uppercase tracking-widest text-amber-300">
        <Icon name="shield" size={14} /> Mission Control
      </div>
      {staffNote && (
        <div className="mb-3 rounded-lg border border-amber-400/25 p-2 text-[10px] text-muted">{staffNote}</div>
      )}
      {groups.map((group) => {
        const active = inGroup(pathname, group);
        // A section is worth opening if something inside it is waiting.
        const waiting = group.items.reduce((n, i) => n + (i.badge ?? 0), 0);
        const locked = group.items.every((i) => i.access === "admin");
        return (
          <Link
            key={group.section}
            href={group.home}
            aria-current={active ? "page" : undefined}
            className={`flex items-center justify-between gap-2 rounded-lg px-2.5 py-2 text-sm transition ${
              active
                ? "bg-violet-500/20 font-semibold text-ink ring-1 ring-violet-400/40"
                : "text-muted hover:bg-violet-500/10 hover:text-ink"
            }`}
          >
            <span className="flex min-w-0 items-center gap-2 truncate">
              {group.icon && <Icon name={group.icon} size={13} className="shrink-0 opacity-70" />}
              {group.section}
              {locked && <Dot title="Admin only" className="bg-rose-400/80" />}
            </span>
            <span className="flex shrink-0 items-center gap-1.5">
              {waiting > 0 && (
                <span className="rounded-full bg-amber-500/25 px-1.5 py-0.5 text-[10px] font-black text-amber-200">
                  {waiting > 99 ? "99+" : waiting}
                </span>
              )}
              <span className="text-[10px] text-muted/70">{group.items.length}</span>
            </span>
          </Link>
        );
      })}
    </div>
  );
}

/**
 * The pages of one section, as tabs on whichever page you opened.
 *
 * This is what makes a section feel like one page with panels instead of a
 * folder of separate pages. It is rendered once, in the admin layout, so every
 * page gets its own bar without each page having to remember to draw it.
 */
export function AdminSectionTabs({ groups }: { groups: NavGroup[] }) {
  const pathname = usePathname() || "";
  const group = groups.find((g) => inGroup(pathname, g));
  // One page in a section is not a tab bar, it's a redundant heading.
  if (!group || group.items.length < 2) return null;

  return (
    <div className="mb-6 border-b border-white/10 pb-2">
      <div className="mb-1.5 flex items-center gap-1.5 text-[10px] uppercase tracking-[0.2em] text-muted">
        {group.icon && <Icon name={group.icon} size={11} />} {group.section}
      </div>
      <div className="no-scrollbar -mx-1 flex gap-1 overflow-x-auto px-1 pb-0.5">
        {group.items.map((item) => {
          const on = isActive(pathname, item);
          return (
            <Link
              key={item.href}
              href={item.href}
              aria-current={on ? "page" : undefined}
              className={`inline-flex shrink-0 items-center gap-1.5 whitespace-nowrap rounded-full border px-3.5 py-1.5 text-xs transition ${
                on
                  ? "border-violet-400/60 bg-violet-500/20 font-semibold text-ink"
                  : "border-transparent text-muted hover:border-white/15 hover:text-ink"
              }`}
            >
              {item.label}
              {item.access === "admin" && <Dot title="Admin only" className="bg-rose-400/80" />}
              {item.badge ? (
                <span className="rounded-full bg-amber-500/25 px-1.5 text-[10px] font-black text-amber-200">
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

function Dot({ title, className }: { title: string; className: string }) {
  return <span title={title} className={`inline-block h-1.5 w-1.5 shrink-0 rounded-full ${className}`} />;
}

// Mobile: the sections as a horizontal rail. The tab bar below it carries the
// pages, so this stays at one level too.
export function AdminMobileNav({ groups }: { groups: NavGroup[] }) {
  const pathname = usePathname() || "";
  return (
    <div className="-mx-4 mb-4 px-4 lg:hidden">
      <div className="mb-2 flex items-center gap-2 text-xs uppercase tracking-widest text-amber-300">
        <Icon name="shield" size={14} /> Mission Control
      </div>
      <div className="flex gap-1.5 overflow-x-auto overscroll-x-contain pb-1 [scrollbar-width:none]">
        {groups.map((group) => {
          const active = inGroup(pathname, group);
          const waiting = group.items.reduce((n, i) => n + (i.badge ?? 0), 0);
          return (
            <Link
              key={group.section}
              href={group.home}
              aria-current={active ? "page" : undefined}
              className={`inline-flex shrink-0 items-center gap-1.5 whitespace-nowrap rounded-full border px-3 py-1.5 text-xs transition ${
                active
                  ? "border-violet-400/60 bg-violet-500/20 font-semibold text-ink"
                  : "border-white/12 text-muted hover:border-cyan-400/40 hover:text-ink"
              }`}
            >
              {group.section}
              {waiting > 0 && (
                <span className="rounded-full bg-amber-500/25 px-1.5 text-[10px] font-black text-amber-200">
                  {waiting > 99 ? "99+" : waiting}
                </span>
              )}
            </Link>
          );
        })}
      </div>
    </div>
  );
}
