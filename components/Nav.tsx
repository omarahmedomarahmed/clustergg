import { and, asc, count, desc, eq, inArray, isNull, ne } from "drizzle-orm";
import { getCurrentUser, isStaff } from "@/lib/auth";
import { getDb, schema } from "@/lib/db";
import { getNavQuests, getTotalCp } from "@/lib/quests";
import { weekBoard } from "@/lib/profile-week";
import { unlockState } from "@/lib/unlock";
import { parseDrawerLinks } from "@/lib/mobile-nav";
import { getContent } from "@/lib/cms";
import { NAV_ITEMS, NAV_SETTING_KEY, navBadges, navShows, parseNav } from "@/lib/site-chrome";
import { getT } from "@/lib/i18n/t-server";
import { slimImg, optImg } from "@/lib/img";
import BrandHeader from "@/components/BrandHeader";
import AddBotButton from "@/components/AddBotButton";
import MobileHud from "@/components/MobileHud";
import UnlockChecklist from "@/components/UnlockChecklist";
import NavChrome, {
  type NavChromeProps, type NavConvo, type NavNotif, type MissionView,
} from "@/components/nav/NavChrome";

// ============================================================================
// THE NAV, SERVER HALF. It reads; `components/nav/NavChrome.tsx` paints.
//
// That is the only split, and the framework forces it: this needs `getDb()`
// and `getCurrentUser()`, which a `"use client"` file cannot do, and the nav
// needs `useState` for every panel, which a server component cannot do.
//
// The line falls on data/paint rather than through any feature — so there is
// no second opinion anywhere about what an admin switch means, what the
// background is, or how tall the header is. See docs/NAV.md for the contract
// this replaced ten files' worth of convention with.
//
// EVERY QUERY HERE RUNS ON EVERY PAGE. That is why the columns are projected
// rather than selected, and why nothing heavy (planet art, banners, themes)
// is read.
// ============================================================================

export default async function Nav() {
  const user = await getCurrentUser();
  const db = await getDb();

  // ===== The signed-in reads =====
  let unread = 0;
  let notifications: NavNotif[] = [];
  let conversations: NavConvo[] = [];
  if (user) {
    const [[row], recent, myConvos] = await Promise.all([
      db.select({ c: count() }).from(schema.notifications)
        .where(and(eq(schema.notifications.userId, user.id), isNull(schema.notifications.readAt))),
      db.select().from(schema.notifications).where(eq(schema.notifications.userId, user.id))
        .orderBy(desc(schema.notifications.createdAt)).limit(8),
      db.select({ conversationId: schema.conversationParticipants.conversationId, lastReadAt: schema.conversationParticipants.lastReadAt })
        .from(schema.conversationParticipants).where(eq(schema.conversationParticipants.userId, user.id)),
    ]);
    unread = Number(row?.c ?? 0);
    notifications = recent.map((n) => ({
      id: n.id, type: n.type, title: n.title, body: n.body, href: n.href,
      read: !!n.readAt, at: n.createdAt.toISOString(),
    }));

    const ids = myConvos.map((c) => c.conversationId);
    if (ids.length) {
      const lastReadBy = new Map(myConvos.map((c) => [c.conversationId, c.lastReadAt]));
      const convos = await db.select().from(schema.conversations)
        .where(inArray(schema.conversations.id, ids))
        .orderBy(desc(schema.conversations.lastMessageAt)).limit(5);
      conversations = await Promise.all(convos.map(async (c) => {
        const [[other], [last]] = await Promise.all([
          db.select({ name: schema.users.displayName, avatarUrl: schema.users.avatarUrl })
            .from(schema.conversationParticipants)
            .innerJoin(schema.users, eq(schema.conversationParticipants.userId, schema.users.id))
            .where(and(eq(schema.conversationParticipants.conversationId, c.id), ne(schema.conversationParticipants.userId, user.id)))
            .limit(1),
          db.select({ body: schema.messages.body, senderId: schema.messages.senderId })
            .from(schema.messages).where(eq(schema.messages.conversationId, c.id))
            .orderBy(desc(schema.messages.createdAt)).limit(1),
        ]);
        const lr = lastReadBy.get(c.id);
        return {
          id: c.id, name: other?.name ?? "Gamer", avatarUrl: other?.avatarUrl ?? null,
          snippet: last?.body ?? "New conversation", at: c.lastMessageAt.toISOString(),
          unread: !!last && last.senderId !== user.id && (!lr || lr < c.lastMessageAt),
        };
      }));
    }
  }

  // ===== Games pinned to the nav by an admin (Admin → Games → Show in nav) =====
  const navGames = await db.select({
    id: schema.games.id, name: schema.games.name, slug: schema.games.slug, logoUrl: schema.games.logoUrl,
  }).from(schema.games)
    .where(and(eq(schema.games.isActive, true), eq(schema.games.showInNav, true)))
    .orderBy(asc(schema.games.sortOrder)).limit(8);

  const names = navGames.map((g) => g.name);
  const spaces = names.length
    ? await db.select({ slug: schema.spaces.slug, game: schema.spaces.game }).from(schema.spaces)
        .where(and(eq(schema.spaces.isActive, true), inArray(schema.spaces.game, names)))
    : [];
  const planetBy = new Map(spaces.filter((s) => s.game).map((s) => [s.game as string, s.slug]));
  // Falls back to the game page, which redirects to a planet — so a game with
  // no space configured is still reachable rather than a dead logo.
  const planetHref = (g: typeof navGames[number]) => {
    const s = planetBy.get(g.name);
    return s ? `/planets/${s}` : `/games/${g.slug}`;
  };

  const [navQuests, totalCp, unlock, board] = await Promise.all([
    getNavQuests(db, user?.id ?? null, 4),
    user ? getTotalCp(db, user.id) : Promise.resolve(0),
    user ? unlockState(db, user.id) : Promise.resolve(null),
    weekBoard({ viewerId: user?.id ?? null, limit: 25 }),
  ]);

  // ===== Today's mission =====
  //
  // Never for a guest: there is no mission for somebody with no account, and
  // the query is skipped rather than run and discarded.
  //
  // READ ONLY. `awardStreakMilestones` is deliberately NOT called from a page
  // render — handing somebody a redeemable trophy because they loaded a page is
  // a write nobody asked for. The cron does it.
  let mission: MissionView | null = null;
  if (user) {
    try {
      const [{ liveMission }, { getWallet }] = await Promise.all([
        import("@/lib/mission-live"),
        import("@/lib/wallet"),
      ]);
      // `limit: 1` on the ledger. The panel shows a BALANCE, not a history, and
      // the default 200-row read would be pulled on every page in the product
      // for a panel most visits never open. This is the one number worth the
      // aggregate; the ledger itself is a click away at /wallet.
      const [m, w] = await Promise.all([liveMission(db, user.id), getWallet(db, user.id, 1)]);
      mission = {
        streak: m.streak,
        earned: m.progress.earned,
        ceiling: m.progress.ceiling,
        complete: m.progress.complete,
        // `action` is CARRIED THROUGH. Dropping it here is what left every task
        // in the band as unclickable text with no icon and no idea which quest
        // it belonged to — the key that answers all three was always present.
        tasks: m.progress.tasks.map((t) => ({
          action: t.action, label: t.label, count: t.count,
          done: t.done, complete: t.complete, cp: t.cp,
        })),
        milestones: m.milestones.map((x) => ({ days: x.days, hasTrophy: !!x.trophyId })),
        reached: m.reached,
        next: m.next ? { days: m.next.milestone.days, away: m.next.away } : null,
        totalCp,
        wallet: { balance: w.balanceUsd, currency: "USD" },
      };
    } catch { mission = null; }
  }

  // ===== Brand, chrome and the fourteen switches =====
  const brand = await getContent([
    "brand.nav.planetsIcon", "brand.nav.bg", "brand.nav.hidePlanets", "brand.logo",
    "brand.wordmark", "brand.nav.mode", "mobile.drawer.extra", "brand.nav.marketplaceIcon",
    "brand.nav.marketplaceLabel", "brand.nav.marketplaceOrder", NAV_SETTING_KEY,
  ]);
  const chrome = parseNav(brand[NAV_SETTING_KEY]);
  const who = user ? "user" : "guest";
  // Resolved to a plain object here so the client half never has to know how a
  // switch works — and so an unset item keeps using ITS OWN default rather than
  // silently becoming `true`.
  const show: Record<string, boolean> = Object.fromEntries(
    NAV_ITEMS.map((i) => [i.id, navShows(chrome, i.id, who)]),
  );

  const planetsIcon = brand["brand.nav.planetsIcon"];
  const hidePlanets = brand["brand.nav.hidePlanets"] === "1";
  const marketIcon = brand["brand.nav.marketplaceIcon"];
  const marketLabel = brand["brand.nav.marketplaceLabel"] || "Trophy marketplace";
  const marketFirst = brand["brand.nav.marketplaceOrder"] === "before";
  const badgeOpts = { hidePlanets, planetsIcon, marketIcon, marketLabel, marketFirst };

  const brandMode = brand["brand.nav.mode"] || "both";
  const drawerWordmark = brandMode !== "mark" ? (brand["brand.wordmark"] || null) : null;
  // Only a REAL uploaded mark. `/assets/logo.png` is the built-in placeholder
  // path and is not a file on disk, so passing it makes the drawer render a
  // broken image instead of the gradient wordmark.
  const drawerMark = brand["brand.logo"] && brand["brand.logo"] !== "/assets/logo.png" ? brand["brand.logo"] : null;

  const { t } = await getT(user?.locale ?? null);
  const drawerExtra = parseDrawerLinks(brand["mobile.drawer.extra"]);
  const drawerLinks = [
    ...(user ? [{ href: "/feed", label: t("nav.home"), icon: "home" }] : []),
    // `show: () => true` ON PURPOSE. The per-audience switches govern the top
    // BAR, which is a crowded row on a 390px screen. The drawer is the
    // reachability surface and has always carried these regardless. An explicit
    // `hidePlanets` is a different instruction and IS still honoured, because
    // that one says hide it, not hide it from the bar.
    ...navBadges({ ...badgeOpts, show: () => true }).map((b) => ({
      href: b.href,
      label: b.id === "planets" ? t("nav.allPlanets") : b.label,
      icon: b.glyph,
      logoUrl: (b.art || null) as string | null,
    })),
    ...navGames.map((g) => ({ href: planetHref(g), label: g.name, icon: "gamepad", logoUrl: slimImg(g.logoUrl, 300000) as string | null })),
    ...(user ? [{ href: "/messages", label: t("nav.messages"), icon: "message" }] : []),
    // The two commercial doors. On a phone the drawer is the only place they
    // can live, and a brand reading the site on one has nowhere else to go.
    ...(user ? [] : [
      { href: "/pricing", label: "For brands", icon: "target" },
      { href: "/discord-bot", label: "For Discord servers", icon: "satellite" },
      { href: "/search", label: t("common.findGamers"), icon: "search" },
    ]),
    ...drawerExtra,
  ];

  const props: NavChromeProps = {
    user: user
      ? { displayName: user.displayName, avatarUrl: user.avatarUrl, slug: user.slug, canAdmin: isStaff(user) }
      : null,
    show,
    navBgUrl: brand["brand.nav.bg"] ? optImg(brand["brand.nav.bg"], 1600) : null,
    badges: navBadges({ ...badgeOpts, show: (id) => show[id] ?? true }),
    games: navGames.map((g) => ({
      id: g.id, name: g.name, href: planetHref(g), logoUrl: slimImg(g.logoUrl, 300000) as string | null,
    })),
    quests: navQuests.map((q) => ({
      id: q.key, key: q.key, name: q.name, logoUrl: q.logoUrl,
      done: Math.round(q.pct), total: 100, cp: q.qp,
    })),
    totalCp,
    unlock,
    notifications,
    conversations,
    unread,
    drawerLinks,
    drawerWordmark,
    drawerMark,
    week: {
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
    },
    mission,
    // Rendered here because each of these reads the CMS, and `lib/cms.ts`
    // reaches `next/headers` — which cannot exist in a client bundle. See the
    // note on the slots in NavChrome.
    brandHeader: <BrandHeader placement="nav" />,
    addBot: <AddBotButton size="sm" />,
    mobileHud: user ? (
      <MobileHud
        displayName={user.displayName} avatarUrl={user.avatarUrl} slug={user.slug}
        cp={totalCp} unread={unread} unreadDm={conversations.some((c) => c.unread)}
      />
    ) : null,
    unlockRow: unlock && !unlock.unlocked ? (
      // The lock, wherever they are. Tapping it opens onboarding — the CTA is
      // the balance itself, because a balance you cannot spend is the only
      // prompt that needs no copy.
      <div className="flex justify-center px-4 py-1.5">
        <UnlockChecklist state={unlock} compact />
      </div>
    ) : null,
    labels: {
      home: t("nav.home"),
      login: t("nav.login"),
      signIn: t("nav.signIn"),
      findGamers: t("common.findGamers"),
      messages: t("nav.messages"),
      allPlanets: t("nav.allPlanets"),
    },
  };

  return <NavChrome {...props} />;
}
