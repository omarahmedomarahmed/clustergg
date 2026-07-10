import Link from "next/link";
import { and, count, eq, isNull } from "drizzle-orm";
import { getCurrentUser, isAdmin } from "@/lib/auth";
import { getDb, schema } from "@/lib/db";
import Avatar from "@/components/Avatar";
import { logout } from "@/app/actions/auth";
import MobileMenu from "@/components/MobileMenu";

export default async function Nav() {
  const user = await getCurrentUser();
  let unread = 0;
  if (user) {
    const db = await getDb();
    const [row] = await db.select({ c: count() }).from(schema.notifications)
      .where(and(eq(schema.notifications.userId, user.id), isNull(schema.notifications.readAt)));
    unread = Number(row?.c ?? 0);
  }

  const links = [
    { href: "/leaderboards", label: "Leaderboards" },
    { href: "/spaces", label: "Spaces" },
    ...(user ? [{ href: "/feed", label: "Feed" }, { href: "/messages", label: "Messages" }] : []),
    { href: "/for-brands", label: "For Brands" },
  ];

  return (
    <header className="sticky top-0 z-40 border-b border-violet-500/15 bg-[#04051a]/80 backdrop-blur-xl">
      <div className="mx-auto flex h-16 max-w-6xl items-center gap-6 px-4">
        <Link href="/" className="flex items-center gap-2.5 shrink-0">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/assets/logo.png" alt="Cluster" width={34} height={34} className="rounded-full pulse-glow" />
          <span className="text-lg font-bold tracking-wide grad-text">CLUSTER</span>
        </Link>

        <nav className="hidden md:flex items-center gap-5 text-sm text-muted">
          {links.map((l) => (
            <Link key={l.href} href={l.href} className="hover:text-ink transition-colors">{l.label}</Link>
          ))}
        </nav>

        <div className="ml-auto flex items-center gap-3">
          <Link href="/search" aria-label="Search" className="hidden sm:flex text-muted hover:text-ink transition-colors text-lg">⌕</Link>
          {user ? (
            <>
              <Link href="/notifications" className="relative text-muted hover:text-ink transition-colors" aria-label="Notifications">
                <span className="text-lg">🔔</span>
                {unread > 0 && (
                  <span className="absolute -right-1.5 -top-1 rounded-full bg-fuchsia-500 px-1.5 text-[10px] font-bold text-white">
                    {unread > 9 ? "9+" : unread}
                  </span>
                )}
              </Link>
              {isAdmin(user) && (
                <Link href="/admin" className="hidden sm:inline text-xs text-amber-300/90 hover:text-amber-200 border border-amber-400/30 rounded-full px-2.5 py-1">
                  Admin
                </Link>
              )}
              <Link href="/profile" className="flex items-center gap-2">
                <Avatar name={user.displayName} src={user.avatarUrl} size={32} />
              </Link>
              <form action={logout}>
                <button className="hidden sm:inline text-xs text-muted hover:text-ink" type="submit">Sign out</button>
              </form>
            </>
          ) : (
            <>
              <Link href="/login" className="text-sm text-muted hover:text-ink">Log in</Link>
              <Link href="/signup" className="glow-btn rounded-full px-4 py-1.5 text-sm font-semibold text-white">
                Join the Cluster
              </Link>
            </>
          )}
          <MobileMenu links={links} loggedIn={!!user} />
        </div>
      </div>
    </header>
  );
}
