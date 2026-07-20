import Link from "next/link";
import { and, asc, count, desc, eq, inArray, isNull, ne } from "drizzle-orm";
import { getCurrentUser, isStaff } from "@/lib/auth";
import { getDb, schema } from "@/lib/db";
import Icon from "@/components/Icon";
import GameLogo from "@/components/GameLogo";
import UserMenu from "@/components/UserMenu";
import MobileMenu from "@/components/MobileMenu";
import BrandGlyph from "@/components/BrandGlyph";
import BrandHeader from "@/components/BrandHeader";
import NavQuestCard from "@/components/NavQuestCard";
import NavMenus, { type NavNotif, type NavConvo } from "@/components/NavMenus";
import { getNavQuests, getTotalCp } from "@/lib/quests";
import { getContent } from "@/lib/cms";
import { slimImg } from "@/lib/img";

export default async function Nav() {
  const user = await getCurrentUser();
  const db = await getDb();
  let unread = 0;
  let navNotifs: NavNotif[] = [];
  let navConvos: NavConvo[] = [];
  if (user) {
    const [[row], recentNotifs, myConvoRows] = await Promise.all([
      db.select({ c: count() }).from(schema.notifications)
        .where(and(eq(schema.notifications.userId, user.id), isNull(schema.notifications.readAt))),
      db.select().from(schema.notifications).where(eq(schema.notifications.userId, user.id))
        .orderBy(desc(schema.notifications.createdAt)).limit(8),
      db.select({ conversationId: schema.conversationParticipants.conversationId, lastReadAt: schema.conversationParticipants.lastReadAt })
        .from(schema.conversationParticipants).where(eq(schema.conversationParticipants.userId, user.id)),
    ]);
    unread = Number(row?.c ?? 0);
    navNotifs = recentNotifs.map((n) => ({ id: n.id, type: n.type, title: n.title, body: n.body, href: n.href, read: !!n.readAt, at: n.createdAt.toISOString() }));

    // Recent conversations (top 5 by last activity) with the other participant + last message.
    const convIds = myConvoRows.map((c) => c.conversationId);
    if (convIds.length) {
      const lastReadBy = new Map(myConvoRows.map((c) => [c.conversationId, c.lastReadAt]));
      const convos = await db.select().from(schema.conversations)
        .where(inArray(schema.conversations.id, convIds)).orderBy(desc(schema.conversations.lastMessageAt)).limit(5);
      navConvos = await Promise.all(convos.map(async (c) => {
        const [[other], [lastMsg]] = await Promise.all([
          db.select({ name: schema.users.displayName, avatarUrl: schema.users.avatarUrl })
            .from(schema.conversationParticipants).innerJoin(schema.users, eq(schema.conversationParticipants.userId, schema.users.id))
            .where(and(eq(schema.conversationParticipants.conversationId, c.id), ne(schema.conversationParticipants.userId, user.id))).limit(1),
          db.select({ body: schema.messages.body, senderId: schema.messages.senderId }).from(schema.messages)
            .where(eq(schema.messages.conversationId, c.id)).orderBy(desc(schema.messages.createdAt)).limit(1),
        ]);
        const lr = lastReadBy.get(c.id);
        return {
          id: c.id, name: other?.name ?? "Gamer", avatarUrl: other?.avatarUrl ?? null,
          snippet: lastMsg?.body ?? "New conversation", at: c.lastMessageAt.toISOString(),
          unread: !!lastMsg && lastMsg.senderId !== user.id && (!lr || lr < c.lastMessageAt),
        };
      }));
    }
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

  // Quest cards fill the nav between the game logos and the right-hand controls.
  const navQuests = await getNavQuests(db, user?.id ?? null, 4);
  const totalCp = user ? await getTotalCp(db, user.id) : 0;
  const brand = await getContent(["brand.nav.planetsIcon", "brand.nav.bg", "brand.nav.hidePlanets"]);
  const planetsIcon = brand["brand.nav.planetsIcon"];
  const navBg = brand["brand.nav.bg"];
  const hidePlanets = brand["brand.nav.hidePlanets"] === "1";

  // Nav is game-first: the only things in the bar are the game planets. Feed and
  // "all planets" live in the mobile drawer for reachability.
  const mobileLinks = [
    ...(user ? [{ href: "/feed", label: "Home", icon: "home" }] : []),
    { href: "/planets", label: "All planets", icon: "planet" },
    ...navGames.map((g) => ({ href: planetHref(g), label: g.name, icon: "gamepad" })),
    ...(user ? [{ href: "/messages", label: "Messages", icon: "message" }] : []),
  ];

  return (
    <header className="sticky top-0 z-40 border-b border-violet-500/15 bg-[#04051a]/80 backdrop-blur-xl bg-cover bg-center"
      style={navBg ? { backgroundImage: `linear-gradient(rgba(4,5,26,0.82), rgba(4,5,26,0.82)), url(${navBg})` } : undefined}>
      <div className="mx-auto flex h-16 max-w-6xl items-center gap-4 px-4">
        <Link href={user ? "/feed" : "/"} className="shrink-0" aria-label="Cluster home">
          <BrandHeader placement="nav" />
        </Link>

        {/* Game planets — bigger, glorified logos. */}
        <nav className="hidden md:flex items-center gap-2.5 shrink-0">
          {navGames.map((g) => (
            <Link key={g.id} href={planetHref(g)} title={g.name}
              className="group shrink-0 relative rounded-xl transition-transform hover:scale-110">
              <span className="absolute -inset-1 rounded-xl bg-gradient-to-br from-violet-500/0 to-cyan-500/0 group-hover:from-violet-500/25 group-hover:to-cyan-500/25 blur-md transition-all" />
              <GameLogo logoUrl={slimImg(g.logoUrl, 300000)} name={g.name} size={40} rounded="rounded-xl"
                className="relative ring-1 ring-violet-400/25 group-hover:ring-cyan-400/60 shadow-lg" />
            </Link>
          ))}
          {!hidePlanets && (
            <Link href="/planets" title="All planets"
              className="shrink-0 flex h-10 w-10 items-center justify-center overflow-hidden rounded-xl border border-violet-400/25 text-muted hover:text-cyan-300 hover:border-cyan-400/50 transition-colors">
              {planetsIcon
                ? /* eslint-disable-next-line @next/next/no-img-element */ <img src={planetsIcon} alt="All planets" className="h-full w-full object-cover" />
                : <Icon name="planet" size={18} />}
            </Link>
          )}
        </nav>

        {/* One quest card (with a dropdown to switch) fills the nav space (lg+) */}
        {navQuests.length > 0 ? (
          <div className="hidden lg:flex flex-1 min-w-0 px-1 justify-center">
            <NavQuestCard quests={navQuests} totalCp={totalCp} />
          </div>
        ) : (
          <div className="flex-1" />
        )}
        <div className="md:hidden flex-1" />

        <div className="flex items-center gap-3 shrink-0">
          {user ? (
            <>
              <NavMenus notifications={navNotifs} unread={unread} conversations={navConvos} />
              <UserMenu
                displayName={user.displayName}
                avatarUrl={user.avatarUrl}
                slug={user.slug}
                canAdmin={isStaff(user)}
              />
            </>
          ) : (
            <>
              <Link href="/search" aria-label="Search" className="hidden sm:flex text-muted hover:text-ink transition-colors">
                <Icon name="search" size={19} />
              </Link>
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
