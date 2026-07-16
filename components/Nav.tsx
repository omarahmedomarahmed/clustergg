import Link from "next/link";
import { and, asc, count, eq, inArray, isNull } from "drizzle-orm";
import { getCurrentUser, isStaff } from "@/lib/auth";
import { getDb, schema } from "@/lib/db";
import Icon from "@/components/Icon";
import GameLogo from "@/components/GameLogo";
import UserMenu from "@/components/UserMenu";
import MobileMenu from "@/components/MobileMenu";
import BrandGlyph from "@/components/BrandGlyph";
import { slimImg } from "@/lib/img";

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
  // Project only the columns the nav renders — never pull the heavy planet
  // art / cover / pins columns here (this runs on EVERY page request).
  const navGames = await db.select({
    id: schema.games.id, name: schema.games.name, slug: schema.games.slug,
    logoUrl: schema.games.logoUrl,
  }).from(schema.games)
    .where(and(eq(schema.games.isActive, true), eq(schema.games.showInNav, true)))
    .orderBy(asc(schema.games.sortOrder)).limit(8);

  // Resolve each nav game to its planet (community space) slug.
  const navGameNames = navGames.map((g) => g.name);
  const navSpaces = navGameNames.length
    ? await db.select({ slug: schema.spaces.slug, game: schema.spaces.game }).from(schema.spaces)
        .where(and(eq(schema.spaces.isActive, true), inArray(schema.spaces.game, navGameNames)))
    : [];
  const planetSlugByGame = new Map(navSpaces.filter((s) => s.game).map((s) => [s.game as string, s.slug]));
  const planetHref = (g: typeof navGames[number]) => {
    const s = planetSlugByGame.get(g.name);
    return s ? `/planets/${s}` : `/games/${g.slug}`; // fallback redirects to a planet
  };

  // Nav is game-first: the only things in the bar are the game planets. Feed and
  // "all planets" live in the mobile drawer for reachability.
  const mobileLinks = [
    ...(user ? [{ href: "/feed", label: "Home", icon: "home" }] : []),
    { href: "/planets", label: "All planets", icon: "planet" },
    ...navGames.map((g) => ({ href: planetHref(g), label: g.name, icon: "gamepad" })),
    ...(user ? [{ href: "/messages", label: "Messages", icon: "message" }] : []),
  ];

  return (
    <header className="sticky top-0 z-40 border-b border-violet-500/15 bg-[#04051a]/80 backdrop-blur-xl">
      <div className="mx-auto flex h-16 max-w-6xl items-center gap-4 px-4">
        <Link href={user ? "/feed" : "/"} className="flex items-center gap-2.5 shrink-0" aria-label="Cluster home">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/assets/logo.png" alt="Cluster" width={34} height={34} className="rounded-full pulse-glow" />
          <span className="hidden sm:inline text-lg font-bold tracking-wide grad-text">CLUSTER</span>
        </Link>

        {/* Game planets — the whole nav. Bigger, glorified logos. */}
        <nav className="hidden md:flex items-center gap-2.5 flex-1 min-w-0 overflow-x-auto no-scrollbar">
          {navGames.map((g) => (
            <Link key={g.id} href={planetHref(g)} title={g.name}
              className="group shrink-0 relative rounded-xl transition-transform hover:scale-110">
              <span className="absolute -inset-1 rounded-xl bg-gradient-to-br from-violet-500/0 to-cyan-500/0 group-hover:from-violet-500/25 group-hover:to-cyan-500/25 blur-md transition-all" />
              <GameLogo logoUrl={slimImg(g.logoUrl, 300000)} name={g.name} size={40} rounded="rounded-xl"
                className="relative ring-1 ring-violet-400/25 group-hover:ring-cyan-400/60 shadow-lg" />
            </Link>
          ))}
          <Link href="/planets" title="All planets"
            className="shrink-0 flex h-10 w-10 items-center justify-center rounded-xl border border-violet-400/25 text-muted hover:text-cyan-300 hover:border-cyan-400/50 transition-colors">
            <Icon name="planet" size={18} />
          </Link>
        </nav>
        <div className="md:hidden flex-1" />

        <div className="flex items-center gap-3 shrink-0">
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
              <Link href="/login" className="text-sm text-muted hover:text-ink hidden sm:inline">Log in</Link>
              <a href="/api/auth/discord?next=/onboarding" title="Sign in with Discord"
                className="pressable inline-flex items-center gap-2 rounded-full px-4 py-1.5 text-sm font-semibold text-white"
                style={{ background: "#5865f2", boxShadow: "0 6px 18px -8px #5865f2" }}>
                <BrandGlyph provider="discord" size={16} /> <span className="hidden sm:inline">Sign in with</span> Discord
              </a>
            </>
          )}
          <MobileMenu links={mobileLinks} loggedIn={!!user} profileSlug={user?.slug ?? null} />
        </div>
      </div>
    </header>
  );
}
