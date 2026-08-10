// The nav, as three menus. B123.
//
// ===== WHAT WAS WRONG =====
//
// The top bar held up to twelve things in one flat row: the wordmark, N game
// logos, a planets badge, a marketplace badge, a quest card, search, "For
// brands", "For Discord servers", the bell, the avatar, an install button and a
// burger. Below it, two more full-width strips. Three rows of chrome.
//
// Flat means every item competes with every other item, so the row grew until
// things had to be hidden by breakpoint — `hidden lg:inline` on the two links
// that a server owner and a brand are actually here for. The commercial doors
// were the first things to disappear on a laptop.
//
// ===== WHAT REPLACED IT =====
//
// THREE MENUS, THE SAME FOR EVERYBODY. Not an audience switch: a guest and a
// signed-in gamer see the same three words in the same order, because a nav
// that rearranges itself when you log in is a nav people have to relearn.
//
//   PLAY       what a gamer does here
//   EARN       what a server owner gets
//   ADVERTISE  what a brand buys
//
// Every destination the flat row carried is inside one of them, including the
// game logos — which is what frees the space. A game is a place you go to play,
// so it belongs under Play rather than in the chrome.
//
// ===== WHY THIS IS DATA AND NOT JSX =====
//
// A menu written as markup is a menu nobody can test and nobody can count. As
// data, `tests/db/nav.mts` can assert every route resolves, that no destination
// was dropped in the rewrite, and that the three groups stay balanced. The old
// row lost items to breakpoints silently; this one cannot lose one at all.

export type NavLink = {
  label: string;
  href: string;
  /** One line, under the label. Left off where the label is self-evident. */
  note?: string;
  /** An `Icon` name. */
  icon: string;
  /**
   * Only shown to a signed-in gamer.
   *
   * The MENU is identical for everybody; a few LEAVES inside it are not, because
   * "My quests" pointing at an empty page is worse than not offering it. The
   * group and its order never change.
   */
  auth?: boolean;
};

export type NavMenu = {
  id: "play" | "earn" | "advertise";
  label: string;
  /** The one line at the top of the open panel. */
  lede: string;
  /** An `Icon` name for the trigger on a phone. */
  icon: string;
  /** The panel's accent, matching the three guide pages. */
  accent: string;
  links: NavLink[];
};

export const NAV_MENUS: NavMenu[] = [
  {
    id: "play",
    label: "Play",
    lede: "Link the games you already play, enter the week's challenge, win something real.",
    icon: "gamepad",
    accent: "#22d3ee",
    links: [
      { label: "All planets", href: "/planets", note: "Every game, its leaderboards and its live challenges", icon: "planet" },
      { label: "Leaderboards", href: "/leaderboards", note: "Where you stand, per game and per metric", icon: "chart" },
      { label: "Quests", href: "/quests", note: "The guided path, and your Cluster Points", icon: "rocket" },
      { label: "Marketplace", href: "/marketplace", note: "What your points are worth", icon: "trophy" },
      { label: "My profile", href: "/profile", note: "Your card, your trophies, your streak", icon: "user", auth: true },
      { label: "How it works", href: "/rules/gamer", note: "The whole path, drawn, with every rule under it", icon: "spark" },
    ],
  },
  {
    id: "earn",
    label: "Earn",
    lede: "Free bot, no selling, no admin. Your members play; every Monday the pool pays.",
    icon: "satellite",
    accent: "#34d399",
    links: [
      { label: "Add the bot", href: "/discord-bot", note: "One click, free forever, and it cannot read your messages", icon: "plus" },
      { label: "This week's pool", href: "/pool", note: "What is being divided right now, and who is competing for it", icon: "cpCoin" },
      { label: "Server portal", href: "/login/server", note: "Your earnings, your members, your withdrawals", icon: "lock" },
      { label: "How it works", href: "/rules/owner", note: "Step by step, and every rule that binds you", icon: "spark" },
    ],
  },
  {
    id: "advertise",
    label: "Advertise",
    lede: "Sponsor the weekly competition inside the servers that play your game.",
    icon: "target",
    accent: "#a78bfa",
    links: [
      { label: "What it costs", href: "/pricing", note: "The published rate card, with reach stated before you spend", icon: "diamond" },
      { label: "For brands", href: "/brands", note: "The offer, the delivery evidence, the trophy", icon: "crown" },
      { label: "Brand portal", href: "/login/brand", note: "Your campaigns and your report", icon: "lock" },
      { label: "How it works", href: "/rules/brand", note: "What we will and will not promise you", icon: "spark" },
    ],
  },
];

/** Every destination the nav offers, for the guard that nothing was dropped. */
export const NAV_HREFS = NAV_MENUS.flatMap((m) => m.links.map((l) => l.href));
