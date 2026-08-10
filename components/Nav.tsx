import Link from "next/link";
import { and, asc, count, desc, eq, inArray, isNull, ne } from "drizzle-orm";
import { getCurrentUser, isStaff } from "@/lib/auth";
import { getDb, schema } from "@/lib/db";
import Icon from "@/components/Icon";
import GameLogo from "@/components/GameLogo";
import UserMenu from "@/components/UserMenu";
import MobileMenu from "@/components/MobileMenu";
import BrandGlyph from "@/components/BrandGlyph";
import AddBotButton from "@/components/AddBotButton";
import BrandHeader from "@/components/BrandHeader";
import NavQuestCard from "@/components/NavQuestCard";
import NavMenus, { type NavNotif, type NavConvo } from "@/components/NavMenus";
import NavMenuBar from "@/components/nav/NavMenuBar";
import MobileHud from "@/components/MobileHud";
import UnlockChecklist from "@/components/UnlockChecklist";
import { unlockState } from "@/lib/unlock";
import WeekBand, { type BandData } from "@/components/WeekBand";
import MissionBand, { type MissionBandData } from "@/components/MissionBand";
import { getNavQuests, getTotalCp } from "@/lib/quests";
import { weekBoard } from "@/lib/profile-week";
import { parseDrawerLinks } from "@/lib/mobile-nav";
import { getContent } from "@/lib/cms";
import { NAV_SETTING_KEY, navBadges, navShows, parseNav } from "@/lib/site-chrome";
import { getT } from "@/lib/i18n/t-server";
import { slimImg, optImg } from "@/lib/img";

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
  // B83. Locked gamers see their balance with a lock on it and a way through,
  // on every page. An unlocked one gets nothing extra — this renders null.
  const unlock = user ? await unlockState(db, user.id) : null;

  // Profile of the Week rides under the nav on every page, so it's read here
  // with the rest of the chrome rather than by each page separately.
  const board = await weekBoard({ viewerId: user?.id ?? null, limit: 25 });
  const bandData: BandData = {
    ...board,
    week: {
      ...board.week,
      startsAt: board.week.startsAt.toISOString(),
      votingEndsAt: board.week.votingEndsAt.toISOString(),
      endsAt: board.week.endsAt.toISOString(),
    },
    result: board.result
      ? { ...board.result, announcedAt: board.result.announcedAt?.toISOString() ?? null }
      : null,
    signedIn: !!user,
    me: user ? { id: user.id, slug: user.slug } : null,
  };
  // B113. The mission and the streak, read here with the rest of the chrome.
  // Never for a guest: there is no mission for somebody with no account, and
  // the query is skipped rather than run and discarded.
  //
  // READ ONLY. `awardStreakMilestones` is deliberately NOT called from a page
  // render — handing somebody a redeemable trophy because they loaded a page is
  // a write nobody asked for. The cron does it.
  let missionBand: MissionBandData | null = null;
  if (user) {
    try {
      const { liveMission } = await import("@/lib/mission-live");
      const m = await liveMission(db, user.id);
      missionBand = {
        streak: m.streak,
        earned: m.progress.earned,
        ceiling: m.progress.ceiling,
        complete: m.progress.complete,
        tasks: m.progress.tasks.map((t) => ({
          label: t.label, count: t.count, done: t.done, complete: t.complete, cp: t.cp,
        })),
        milestones: m.milestones.map((x) => ({ days: x.days, hasTrophy: !!x.trophyId })),
        reached: m.reached,
        next: m.next ? { days: m.next.milestone.days, away: m.next.away } : null,
      };
    } catch { missionBand = null; }
  }

  const brand = await getContent(["brand.nav.planetsIcon", "brand.nav.bg", "brand.nav.hidePlanets", "brand.logo", "brand.wordmark", "brand.nav.mode", "mobile.drawer.extra", "brand.nav.marketplaceIcon", "brand.nav.marketplaceLabel", "brand.nav.marketplaceOrder", NAV_SETTING_KEY]);
  // What this audience is allowed to see (Admin → Site chrome). Guests and
  // members are configured separately, because the row a brand needs and the
  // row a gamer needs are different rows.
  const chrome = parseNav(brand[NAV_SETTING_KEY]);
  const who = user ? "user" : "guest";
  const show = (id: string) => navShows(chrome, id, who);
  const planetsIcon = brand["brand.nav.planetsIcon"];
  const navBg = brand["brand.nav.bg"];
  const hidePlanets = brand["brand.nav.hidePlanets"] === "1";
  // The marketplace badge (B9). Same family as the planets badge, same editor,
  // same three knobs — art, label, order — so an admin who has learned one has
  // learned both. Visibility is the `marketplaceBadge` chrome item.
  const marketIcon = brand["brand.nav.marketplaceIcon"];
  const marketLabel = brand["brand.nav.marketplaceLabel"] || "Trophy marketplace";
  const marketFirst = brand["brand.nav.marketplaceOrder"] === "before";
  // The uploaded brand lockup for the mobile drawer (falls back to the mark, then
  // the built-in wordmark text) — mirrors BrandHeader so the drawer never shows
  // the placeholder "CLUSTER" text when a wordmark/logo is uploaded.
  const brandMode = brand["brand.nav.mode"] || "both";
  const drawerWordmark = brandMode !== "mark" ? (brand["brand.wordmark"] || null) : null;
  // Only pass a real uploaded mark — the built-in placeholder path doesn't exist
  // as a file, so leaving it null lets the drawer show the gradient CLUSTER text.
  const drawerMark = brand["brand.logo"] && brand["brand.logo"] !== "/assets/logo.png" ? brand["brand.logo"] : null;
  const { t } = await getT(user?.locale ?? null);

  // Nav is game-first: the only things in the bar are the game planets. Feed and
  // "all planets" live in the mobile drawer for reachability.
  const drawerExtra = parseDrawerLinks(brand["mobile.drawer.extra"]);
  const mobileLinks = [
    ...(user ? [{ href: "/feed", label: t("nav.home"), icon: "home" }] : []),
    // The same two destination badges as the bar, in the same admin-set order,
    // read from the same helper — so an admin who moves the marketplace ahead of
    // the planets moves it in both places.
    //
    // `show: () => true` on purpose. The per-audience chrome switches govern the
    // top bar, which is a crowded row on a 390px screen; the drawer is the
    // reachability surface and has always carried "all planets" regardless. An
    // explicit "hide the badge" (`hidePlanets`) is a different instruction and is
    // still honoured, because that one says hide it, not hide it from the bar.
    ...navBadges({ hidePlanets, show: () => true, planetsIcon, marketIcon, marketLabel, marketFirst })
      .map((b) => ({
        href: b.href,
        label: b.id === "planets" ? t("nav.allPlanets") : b.label,
        icon: b.glyph,
        logoUrl: (b.art || null) as string | null,
      })),
    ...navGames.map((g) => ({ href: planetHref(g), label: g.name, icon: "gamepad", logoUrl: slimImg(g.logoUrl, 300000) as string | null })),
    ...(user ? [{ href: "/messages", label: t("nav.messages"), icon: "message" }] : []),
    // The two commercial doors. On mobile the drawer is the only place they can
    // live, and a brand reading the site on a phone has nowhere else to go.
    ...(user ? [] : [
      { href: "/pricing", label: "For brands", icon: "target" },
      { href: "/discord-bot", label: "For Discord servers", icon: "satellite" },
      { href: "/search", label: t("common.findGamers"), icon: "search" },
    ]),
    // Admin-defined extra drawer links (Admin → Mobile chrome).
    ...drawerExtra,
  ];

  return (
    <>
    <header className="sticky top-0 z-40 border-b border-violet-500/15 bg-[#04051a]/80 backdrop-blur-xl">
      {/* ONE background image for the whole nav group.
          A background image belongs to a component GROUP, not to each component
          in it. This art was painted three times — once by the header, once by
          the collapsed Profile-of-the-Week strip, once by the expanded panel,
          each with its own veil and its own alignment. Three downloads, three
          decodes, and three chances for the art to land a pixel differently,
          which is precisely why there was a visible seam where the bar met the
          strip.
          Now: one positioned layer, children transparent over it, and the
          expanded panel's darker look comes from a scrim rather than a second
          copy. `--nav-group-h` is measured by WeekBand and grows to cover the
          panel when it drops, so the image continues into it instead of
          restarting. */}
      {navBg && (
        <div
          aria-hidden
          data-nav-backdrop
          className="pointer-events-none fixed inset-x-0 top-0 z-0 bg-cover bg-center"
          style={{
            height: "var(--nav-group-h, var(--nav-h, 96px))",
            backgroundImage: `linear-gradient(rgba(4,5,26,0.82), rgba(4,5,26,0.82)), url(${optImg(navBg, 1600)})`,
          }}
        />
      )}
      {/* A tighter gap on phones. Combined with hiding the install button below
          `md` (see below), this is what stopped every page scrolling sideways by
          ~40px on a 390px screen. */}
      <div className="relative z-10 mx-auto flex h-16 max-w-6xl items-center gap-2 sm:gap-4 px-3 sm:px-4 min-w-0">
        <Link href={user ? "/feed" : "/"} className="shrink-0" aria-label="Cluster home">
          <BrandHeader placement="nav" />
        </Link>

        {/* ===== THE THREE MENUS. B123. =====
            Play / Earn / Advertise, identical for every visitor. What used to
            be here — up to six game logos, a planets badge and a marketplace
            badge, then two text links stranded behind `hidden lg:inline` — is
            now inside them, which is what gives the row back its space.
            `gameLogos` still gates the logo grid inside the Play panel, so the
            admin switch keeps meaning what it says. */}
        <NavMenuBar
          games={show("gameLogos") ? navGames.map((g) => ({
            id: g.id, name: g.name, href: planetHref(g), logoUrl: slimImg(g.logoUrl, 300000) as string | null,
          })) : []}
          signedIn={!!user}
        />

        {/* THE TWO PLACES, kept in the row. B123.1.
            My first pass moved these into the Play menu with the game logos,
            and `tests/ui/marketplace-ui.mjs` went red on an assertion named
            "It is reachable without knowing it exists" — which is exactly the
            property that was lost. Two interactions deep is not discoverable.

            It also undid B9 on purpose-built grounds: the marketplace was
            promoted OUT of the utility icons precisely so it would read as a
            place rather than as a control. A dropdown is further from a place
            than the icon row it was rescued from.

            So the menus carry the ROUTES and these two carry the PLACES. Two
            badges beside three menus is still a short row — the twelve-item
            version is what was wrong, not the idea of a visible destination. */}
        <nav className="hidden md:flex items-center gap-2 shrink-0">
          {navBadges({ hidePlanets, show, planetsIcon, marketIcon, marketLabel, marketFirst })
            .map((b) => (
              <Link key={b.id} href={b.href} title={b.label}
                className={`shrink-0 flex h-9 w-9 items-center justify-center overflow-hidden rounded-xl border border-violet-400/25 text-muted transition-colors ${b.hover}`}>
                {b.art
                  ? /* eslint-disable-next-line @next/next/no-img-element */ <img src={b.art} alt={b.label} className="h-full w-full object-cover" />
                  : <Icon name={b.glyph} size={17} />}
              </Link>
            ))}
        </nav>

        {/* One quest card (with a dropdown to switch) fills the nav space (lg+).
            Members only: a quest tracker means nothing to somebody who has no
            quests, and the space is better spent on the two doors a guest is
            actually here for. */}
        {user && show("questCard") && navQuests.length > 0 ? (
          <div className="hidden lg:flex flex-1 min-w-0 px-1 justify-center">
            <NavQuestCard quests={navQuests} totalCp={totalCp} />
          </div>
        ) : (
          <div className="flex-1" />
        )}
        <div className="md:hidden flex-1" />

        <div className="flex items-center gap-2 sm:gap-3 shrink-0">
          {/* The language switch lives in the footer now. It was taking a slot in
              the busiest row on the site for a control almost nobody touches
              twice, and on a phone it was one of the things pushing the burger
              off the edge. */}
          {user ? (
            <>
              {show("search") && (
                <Link href="/search" title={t("common.findGamers")} className="text-muted hover:text-ink hidden sm:inline-flex">
                  <Icon name="search" size={18} />
                </Link>
              )}
              {/* B123. "For brands" and "For Discord servers" were here behind
                  `hidden lg:inline` — the two commercial doors, and so the first
                  things to vanish on a laptop. They are Earn and Advertise in
                  the menu bar now, at every width, for every visitor. */}
              {show("alerts") && <NavMenus notifications={navNotifs} unread={unread} conversations={navConvos} />}
              {show("profileMenu") && (
                <UserMenu
                  displayName={user.displayName}
                  avatarUrl={user.avatarUrl}
                  slug={user.slug}
                  canAdmin={isStaff(user)}
                />
              )}
              {/* Wrapped rather than given `hidden lg:inline-flex` directly:
                  AddBotButton sets `inline-flex` itself, and which display wins
                  depends on the order of the two utilities in the generated
                  stylesheet, not on the class attribute. It lost — the install
                  button was showing on phones and pushing the row off-screen. */}
              {show("addBot") && <span className="hidden lg:inline-flex"><AddBotButton size="sm" /></span>}
            </>
          ) : (
            <>
              {/* The two doors a guest is here for. A guest is far more likely
                  to be a brand or a server owner than a gamer hunting for the
                  search box — and search is one tap away in the drawer. */}
              {show("search") && (
                <Link href="/search" title={t("common.findGamers")} className="text-muted hover:text-ink hidden sm:inline-flex">
                  <Icon name="search" size={18} />
                </Link>
              )}
              {/* B123. "For brands" and "For Discord servers" were here behind
                  `hidden lg:inline` — the two commercial doors, and so the first
                  things to vanish on a laptop. They are Earn and Advertise in
                  the menu bar now, at every width, for every visitor. */}
              {show("loginLink") && <Link href="/login" className="text-sm text-muted hover:text-ink hidden sm:inline">{t("nav.login")}</Link>}
              {show("addBot") && <span className="hidden md:inline-flex"><AddBotButton size="sm" /></span>}
              {show("discordSignIn") && (
              <a href="/api/auth/discord?next=/onboarding" title="Sign in with Discord"
                className="pressable inline-flex items-center gap-2 rounded-full px-4 py-1.5 text-sm font-semibold text-white"
                style={{ background: "#404eed", boxShadow: "0 6px 18px -8px #404eed" }}>
                <BrandGlyph provider="discord" size={16} /> <span className="hidden sm:inline">{t("nav.signIn")}</span> Discord
              </a>
              )}
            </>
          )}
          <MobileMenu links={mobileLinks} loggedIn={!!user} profileSlug={user?.slug ?? null} wordmarkUrl={drawerWordmark} markUrl={drawerMark} />
        </div>
      </div>

      {/* Native-mobile-game HUD strip (level bar + red-dot alerts), members only */}
      <div className="relative z-10">
      {/* The lock, wherever they are. Tapping it opens the onboarding page —
          the plan's rule is that the CTA is the balance itself, because a
          balance you cannot spend is the only prompt that needs no copy. */}
      {unlock && !unlock.unlocked && (
        <div className="flex justify-center px-4 py-1.5">
          <UnlockChecklist state={unlock} compact />
        </div>
      )}
      {user && show("mobileHud") && (
        <MobileHud
          displayName={user.displayName}
          avatarUrl={user.avatarUrl}
          slug={user.slug}
          cp={totalCp}
          unread={unread}
          unreadDm={navConvos.some((c) => c.unread)}
        />
      )}

      {/* Profile of the Week. The strip stays in the sticky header; expanding
          it drops a panel OVER the page from the bottom of the nav, wherever
          you happen to be scrolled — it no longer inserts itself at the top of
          the document and shoves everything down.

          Never over the admin area. Staff are signed in, so the board opened by
          default and covered Mission Control with a fixed panel that swallowed
          every click underneath it — the card studio was unusable. Admin is a
          workspace, not somewhere anyone votes. */}
      {show("weekBand") && <WeekBand initial={bandData} bgUrl={navBg ? optImg(navBg, 1600) ?? "" : ""} />}

      {/* B63.1 / B113. The second band: today's mission and the streak.
          Signed-in only — there is no mission for somebody with no account,
          and a strip saying "start a streak" above a sign-up page is noise.
          Same background art as the nav and the band above (B63.2), so the
          two read as one piece of chrome. */}
      {missionBand && <MissionBand data={missionBand} bgUrl={navBg ? optImg(navBg, 1600) ?? "" : ""} />}
      </div>
    </header>
    </>
  );
}
