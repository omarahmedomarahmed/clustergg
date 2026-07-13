import Link from "next/link";
import { and, asc, count, eq, isNull } from "drizzle-orm";
import { getCurrentUser, isStaff } from "@/lib/auth";
import { getDb, schema } from "@/lib/db";
import Icon from "@/components/Icon";
import GameLogo from "@/components/GameLogo";
import UserMenu from "@/components/UserMenu";
import MobileMenu from "@/components/MobileMenu";

export default async function Nav() {
  const user = await getCurrentUser();
  const db = await getDb();
  let unread = 0;
  if (user) {
    const [row] = await db.select({ c: count() }).from(schema.notifications)
      .where(and(eq(schema.notifications.userId, user.id), isNull(schema.notifications.readAt)));
    unread = Number(row?.c ?? 0);
  }
  // Games pinned to the nav by an admin (Admin → Games → "Show in nav").
  const navGames = await db.select().from(schema.games)
    .where(and(eq(schema.games.isActive, true), eq(schema.games.showInNav, true)))
    .orderBy(asc(schema.games.sortOrder)).limit(8);

  const links = [
    { href: "/games", label: "Games", icon: "gamepad" },
    { href: "/leaderboards", label: "Leaderboards", icon: "chart" },
    { href: "/spaces", label: "Spaces", icon: "users" },
    ...(user
      ? [{ href: "/feed", label: "Feed", icon: "home" }, { href: "/messages", label: "Messages", icon: "message" }]
      : []),
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
            <Link key={l.href} href={l.href} className="nav-link">{l.label}</Link>
          ))}
          {navGames.length > 0 && (
            <span className="flex items-center gap-2.5 border-l border-violet-400/20 pl-4">
              {navGames.map((g) => (
                <Link key={g.id} href={`/games/${g.slug}`} title={g.name} className="opacity-80 hover:opacity-100 transition-all hover:scale-110">
                  <GameLogo logoUrl={g.logoUrl} name={g.name} size={26} rounded="rounded-lg" />
                </Link>
              ))}
            </span>
          )}
        </nav>

        <div className="ml-auto flex items-center gap-3">
          <Link href="/search" aria-label="Search" className="hidden sm:flex text-muted hover:text-ink transition-colors">
            <Icon name="search" size={19} />
          </Link>
          {user ? (
            <>
              <Link href="/notifications" className="relative text-muted hover:text-ink transition-colors" aria-label="Notifications">
                <Icon name="bell" size={19} />
                {unread > 0 && (
                  <span className="absolute -right-2 -top-1.5 rounded-full bg-fuchsia-500 px-1.5 text-[10px] font-bold text-white">
                    {unread > 9 ? "9+" : unread}
                  </span>
                )}
              </Link>
              <UserMenu
                displayName={user.displayName}
                avatarUrl={user.avatarUrl}
                slug={user.slug}
                canAdmin={isStaff(user)}
              />
            </>
          ) : (
            <>
              <Link href="/login" className="text-sm text-muted hover:text-ink">Log in</Link>
              <Link href="/signup" className="glow-btn pressable rounded-full px-4 py-1.5 text-sm font-semibold text-white">
                Join the Cluster
              </Link>
            </>
          )}
          <MobileMenu links={links} loggedIn={!!user} profileSlug={user?.slug ?? null} />
        </div>
      </div>
    </header>
  );
}
