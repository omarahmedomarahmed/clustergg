"use client";

import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import Icon from "@/components/Icon";
import Avatar from "@/components/Avatar";
import BrandGlyph from "@/components/BrandGlyph";
import UserMenu from "@/components/UserMenu";
import MobileMenu from "@/components/MobileMenu";
import { NAV_MENUS } from "@/lib/nav-menus";
import { missionDestination } from "@/lib/mission-actions";
// ===== TWO THINGS ABOUT THIS ONE IMPORT =====
//
// It is `voteFromBand`, not `voteForProfile`. Both cast a vote; only this one
// returns BOTH counts, which is what lets the card update in place. A band on
// every page that needed a full reload to show the vote you just cast would
// feel broken. `app/actions/votes.ts` also reaches `lib/i18n/server.ts`, and
// `next/headers` in a client bundle fails the build outright.
//
// And it is imported at the top rather than with a dynamic `import()` inside
// the handler. A server action becomes an RPC reference when a client
// component imports it normally; awaiting `import()` makes webpack pull the
// whole module — server dependencies and all — into the client chunk.
import { voteFromBand } from "@/app/actions/profile-week";
import type { UnlockState } from "@/lib/unlock";
import type { NavBadge } from "@/lib/site-chrome";

// ============================================================================
// THE WHOLE NAV. One component, one sticky header, one background layer.
//
// It was ten files: the bar, three of its own sub-parts, and two bands that
// only ever appeared underneath it. They shared a background image, a height
// variable, a sticky context and fourteen admin switches, and every one of
// those was a convention rather than a mechanism — which is why the art landed
// a pixel differently in three places, why the height variable was measured by
// whichever band happened to mount, and why a panel opened on one page was
// still covering the next one.
//
// Splitting a thing that is one thing is what produced all of that. So this is
// one component: every panel's state is declared in one place, closed in one
// place, and painted on one background.
//
// The server half is `components/Nav.tsx` — it reads, this paints. That line
// is forced by the framework (`await getDb()` cannot live in a `"use client"`
// file) and is the only split. See docs/NAV.md.
// ============================================================================

export type NavNotif = { id: string; type: string; title: string; body: string | null; href: string | null; read: boolean; at: string };
export type NavConvo = { id: string; name: string; avatarUrl: string | null; snippet: string; at: string; unread: boolean };
export type NavGame = { id: string; name: string; href: string; logoUrl: string | null };
export type NavQuestLite = { id: string; key: string; name: string; logoUrl: string | null; done: number; total: number; cp: number };

/** One of today's mission tasks, with everything needed to act on it. */
export type MissionTaskView = {
  action: string;
  label: string;
  count: number;
  done: number;
  complete: boolean;
  cp: number;
};

export type MissionView = {
  streak: number;
  earned: number;
  ceiling: number;
  complete: boolean;
  tasks: MissionTaskView[];
  milestones: { days: number; hasTrophy: boolean }[];
  reached: number[];
  next: { days: number; away: number } | null;
  /** Lifetime Cluster Points, and what is actually spendable. B-report #5. */
  totalCp: number;
  wallet: { balance: number; currency: string } | null;
};

export type BandEntry = {
  rank: number; userId: string; slug: string; displayName: string;
  avatarUrl: string | null; bannerUrl: string | null; bgImage: string | null;
  accent: string; accent2: string; title: string | null;
  weekVotes: number; lifetimeVotes: number; adjustment: number;
  disqualified: boolean; votedByMe: boolean;
};

export type BandData = {
  prizes: ({ id: string; name: string; imageUrl: string; tier: string; value: number } | null)[];
  week: { key: string; startsAt: string; votingEndsAt: string; endsAt: string; phase: "voting" | "announcement"; timezone: string };
  entries: BandEntry[];
  votingOpen: boolean;
  closedReason: "announcement" | "frozen" | null;
  stream: { url: string | null; live: boolean };
  result: {
    podium: { userId: string; slug: string; displayName: string; votes: number }[];
    announcedAt: string | null;
    trophy: { id: string; name: string; imageUrl: string; tier: string; value: number } | null;
  } | null;
  takenAt: string;
  signedIn: boolean;
  me: { id: string; slug: string } | null;
};

export type NavChromeProps = {
  user: { displayName: string; avatarUrl: string | null; slug: string; canAdmin: boolean } | null;
  /** Resolved server-side from the fourteen per-audience switches. */
  show: Record<string, boolean>;
  navBgUrl: string | null;
  badges: NavBadge[];
  games: NavGame[];
  quests: NavQuestLite[];
  totalCp: number;
  unlock: UnlockState | null;
  notifications: NavNotif[];
  conversations: NavConvo[];
  unread: number;
  drawerLinks: { href: string; label: string; icon: string; logoUrl?: string | null }[];
  drawerWordmark: string | null;
  drawerMark: string | null;
  week: BandData | null;
  mission: MissionView | null;
  // ===== SERVER-RENDERED SLOTS =====
  //
  // `BrandHeader`, `AddBotButton`, `MobileHud` and `UnlockChecklist` read the
  // CMS, and `lib/cms.ts` reaches `next/headers`. A client component that
  // imports any of them pulls `next/headers` into the browser bundle and the
  // build fails outright — which is exactly what happened on the first pass.
  //
  // So the server half renders them and passes the finished elements down.
  // React allows that in both directions; what it does not allow is a client
  // module importing a server one.
  brandHeader: ReactNode;
  addBot: ReactNode;
  mobileHud: ReactNode;
  unlockRow: ReactNode;
  labels: { home: string; login: string; signIn: string; findGamers: string; messages: string; allPlanets: string };
};

const WEEK_KEY = "cluster.week.collapsed";
const MISSION_KEY = "cluster-mission-band";

export default function NavChrome(props: NavChromeProps) {
  const { user, show, navBgUrl, badges, games, quests, totalCp, week, mission, labels } = props;
  const pathname = usePathname();

  // ===== EVERY PANEL, DECLARED ONCE =====
  //
  // The old bar had a dropdown state in one file, a band state in another and a
  // second band state in a third, none of which could see the others. Opening
  // the Play menu left the mission panel down behind it, and neither knew the
  // page had changed.
  const [menu, setMenu] = useState<string | null>(null);
  const [alerts, setAlerts] = useState<"bell" | "dm" | null>(null);
  const [weekOpen, setWeekOpen] = useState(false);
  const [missionOpen, setMissionOpen] = useState(false);
  const [mounted, setMounted] = useState(false);

  const closeAll = useCallback(() => {
    setMenu(null); setAlerts(null); setWeekOpen(false); setMissionOpen(false);
  }, []);

  // ===== A PANEL DOES NOT SURVIVE A NAVIGATION. Reported defect #1. =====
  //
  // Both bands remembered their open state in localStorage and neither watched
  // the route, so a panel opened on one page stayed down over the loading state
  // and over the next page until it was collapsed by hand. On `/quests` that
  // was worse than untidy: the open panel sat exactly on top of that page's
  // first element — a raw `<a href="/rules/gamer">` — so the next tap landed on
  // a link nobody meant to press.
  //
  // The remembered choice still governs the FIRST paint of a session, because
  // somebody who collapsed the week band said something and re-opening it on
  // every visit would be arguing with them. What it no longer does is survive a
  // click.
  useEffect(() => { closeAll(); }, [pathname, closeAll]);

  // The remembered choice, read after mount so the server and the first client
  // paint cannot disagree.
  useEffect(() => {
    setMounted(true);
    try {
      if (window.localStorage.getItem(WEEK_KEY) === "0") setWeekOpen(true);
      if (window.localStorage.getItem(MISSION_KEY) === "open") setMissionOpen(true);
    } catch { /* private mode */ }
    // Deliberately once, on mount. Re-running it on navigation is what would
    // undo the rule directly above.
  }, []);

  const toggleWeek = () => setWeekOpen((v) => {
    try { window.localStorage.setItem(WEEK_KEY, v ? "1" : "0"); } catch { /* private mode */ }
    if (!v) setMissionOpen(false);
    return !v;
  });
  const toggleMission = () => setMissionOpen((v) => {
    try { window.localStorage.setItem(MISSION_KEY, v ? "closed" : "open"); } catch { /* private mode */ }
    if (!v) setWeekOpen(false);
    return !v;
  });

  // ===== ONE ELEMENT PAINTS THE ART =====
  //
  // Guarded by `tests/ui/week-band.mjs` since B10, and the reason is visible
  // rather than theoretical: the art used to be painted by the header, by the
  // collapsed strip and by the expanded panel, each with its own veil and its
  // own alignment, and there was a seam where the bar met the strip.
  //
  // The layer is sized from the header's real height, measured — a hard-coded
  // offset is wrong on the first viewport it was not written for.
  const headerRef = useRef<HTMLElement | null>(null);
  useEffect(() => {
    const el = headerRef.current;
    if (!el) return;
    const apply = () => {
      const h = Math.round(el.getBoundingClientRect().height);
      document.documentElement.style.setProperty("--nav-h", `${h}px`);
      document.documentElement.style.setProperty("--nav-group-h", `${h}px`);
    };
    apply();
    const ro = new ResizeObserver(apply);
    ro.observe(el);
    window.addEventListener("resize", apply);
    return () => { ro.disconnect(); window.removeEventListener("resize", apply); };
  }, [weekOpen, missionOpen, pathname]);

  // Escape closes whatever is open, and a click outside closes the dropdowns.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") closeAll(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [closeAll]);

  // ===== NEVER OVER MISSION CONTROL =====
  //
  // Staff are signed in, so the board opened by default and covered the admin
  // area with a fixed panel that swallowed every click underneath it — the card
  // studio was unusable. Admin is a workspace, not somewhere anyone votes.
  const inAdmin = pathname?.startsWith("/admin") ?? false;
  const showWeek = !!week && show.weekBand && !inAdmin;
  const showMission = !!mission && !inAdmin;

  return (
    <header
      ref={headerRef}
      className="sticky top-0 z-40 border-b border-violet-500/15 bg-[#04051a]/80 backdrop-blur-xl"
      onMouseLeave={() => setMenu(null)}
    >
      {navBgUrl && (
        <div
          aria-hidden
          data-nav-backdrop
          className="pointer-events-none absolute inset-0 z-0 bg-cover bg-center"
          style={{ backgroundImage: `linear-gradient(rgba(4,5,26,0.82), rgba(4,5,26,0.82)), url(${navBgUrl})` }}
        />
      )}

      {/* ===== The bar ===== */}
      <div className="relative z-10 mx-auto flex h-16 max-w-6xl items-center gap-2 px-3 sm:gap-4 sm:px-4 min-w-0">
        <Link href={user ? "/feed" : "/"} className="shrink-0" aria-label="Cluster home" onClick={closeAll}>
          {props.brandHeader}
        </Link>

        <MenuBar
          open={menu}
          setOpen={setMenu}
          signedIn={!!user}
          games={show.gameLogos ? games : []}
          onNavigate={closeAll}
        />

        {/* The two PLACES, kept in the row rather than folded into a menu.
            `tests/ui/marketplace-ui.mjs` pins this with an assertion named
            "It is reachable without knowing it exists" — two interactions deep
            is not discoverable, and the marketplace was promoted out of the
            utility icons precisely so it would read as a place. */}
        <nav className="hidden shrink-0 items-center gap-2 md:flex">
          {badges.map((b) => (
            <Link
              key={b.id} href={b.href} title={b.label} onClick={closeAll}
              className={`flex h-9 w-9 shrink-0 items-center justify-center overflow-hidden rounded-xl border border-violet-400/25 text-muted transition-colors ${b.hover}`}
            >
              {b.art
                ? /* eslint-disable-next-line @next/next/no-img-element */ <img src={b.art} alt={b.label} className="h-full w-full object-cover" />
                : <Icon name={b.glyph} size={17} />}
            </Link>
          ))}
        </nav>

        {user && show.questCard && quests.length > 0 ? (
          <div className="hidden min-w-0 flex-1 justify-center px-1 lg:flex">
            <QuestCard quests={quests} totalCp={totalCp} onNavigate={closeAll} />
          </div>
        ) : (
          <div className="flex-1" />
        )}
        <div className="flex-1 md:hidden" />

        <div className="flex shrink-0 items-center gap-2 sm:gap-3">
          {show.search && (
            <Link href="/search" title={labels.findGamers} onClick={closeAll}
              className="hidden text-muted hover:text-ink sm:inline-flex">
              <Icon name="search" size={18} />
            </Link>
          )}
          {user ? (
            <>
              {show.alerts && (
                <Alerts
                  notifications={props.notifications}
                  conversations={props.conversations}
                  unread={props.unread}
                  open={alerts}
                  setOpen={setAlerts}
                  onNavigate={closeAll}
                />
              )}
              {show.profileMenu && (
                <UserMenu displayName={user.displayName} avatarUrl={user.avatarUrl} slug={user.slug} canAdmin={user.canAdmin} />
              )}
              {/* WRAPPED, not classed. `AddBotButton` sets `inline-flex`
                  itself, and which utility wins depends on stylesheet order
                  rather than on the class attribute. It lost, and the install
                  button showed on phones and pushed the row off-screen. */}
              {show.addBot && <span className="hidden lg:inline-flex">{props.addBot}</span>}
            </>
          ) : (
            <>
              {show.loginLink && (
                <Link href="/login" onClick={closeAll} className="hidden text-sm text-muted hover:text-ink sm:inline">
                  {labels.login}
                </Link>
              )}
              {show.addBot && <span className="hidden md:inline-flex">{props.addBot}</span>}
              {show.discordSignIn && (
                <a href="/api/auth/discord?next=/onboarding" title="Sign in with Discord"
                  className="pressable inline-flex items-center gap-2 rounded-full px-4 py-1.5 text-sm font-semibold text-white"
                  style={{ background: "#404eed", boxShadow: "0 6px 18px -8px #404eed" }}>
                  <BrandGlyph provider="discord" size={16} /> <span className="hidden sm:inline">{labels.signIn}</span> Discord
                </a>
              )}
            </>
          )}
          <MobileMenu
            links={props.drawerLinks}
            loggedIn={!!user}
            profileSlug={user?.slug ?? null}
            wordmarkUrl={props.drawerWordmark}
            markUrl={props.drawerMark}
          />
        </div>
      </div>

      <div className="relative z-10">
        {props.unlockRow}
        {user && show.mobileHud && props.mobileHud}

        {showWeek && (
          <WeekBand data={week!} open={weekOpen} onToggle={toggleWeek} mounted={mounted} onNavigate={closeAll} />
        )}
        {showMission && (
          <MissionBand data={mission!} open={missionOpen} onToggle={toggleMission} mounted={mounted} onNavigate={closeAll} />
        )}
      </div>
    </header>
  );
}

// ============================================================================
// The three menus. Play / Earn / Advertise, identical for every visitor.
//
// What used to be in this row — six game logos, two badges and two text links
// stranded behind `hidden lg:inline` — is inside them now, which is what gives
// the row back its space. The two commercial doors are no longer the first
// things to vanish on a laptop.
// ============================================================================

function MenuBar({ open, setOpen, signedIn, games, onNavigate }: {
  open: string | null;
  setOpen: (v: string | null) => void;
  signedIn: boolean;
  games: NavGame[];
  onNavigate: () => void;
}) {
  return (
    <nav className="flex shrink-0 items-center gap-0.5">
      {/* GROUPS ARE NEVER FILTERED, leaves are. A menu that disappears for a
          guest takes a whole third of the site with it; a member-only leaf just
          isn't offered. `tests/db/nav.mts` pins both halves. */}
      {NAV_MENUS.map((menu) => {
        const m = menu;
        const links = menu.links.filter((l) => !l.auth || signedIn);
        const isOpen = open === m.id;
        return (
          <div key={m.id} className="relative">
            <button
              type="button"
              aria-expanded={isOpen}
              onClick={() => setOpen(isOpen ? null : m.id)}
              onMouseEnter={() => setOpen(m.id)}
              className={`flex items-center gap-1.5 rounded-full px-2.5 py-1.5 text-sm font-semibold transition-colors sm:px-3 ${
                isOpen ? "bg-white/10 text-ink" : "text-muted hover:text-ink"
              }`}
            >
              <Icon name={m.icon} size={15} className="sm:hidden" />
              <span className="hidden sm:inline">{m.label}</span>
              <Icon name="chevronDown" size={12} className={isOpen ? "rotate-180 transition-transform" : "transition-transform"} />
            </button>

            {isOpen && (
              <div
                className="absolute left-0 top-full z-50 mt-1 w-[min(92vw,26rem)] overflow-hidden rounded-2xl border border-white/12 bg-[#04051a]/97 shadow-2xl backdrop-blur-xl"
                style={{ borderTopColor: m.accent }}
              >
                <p className="border-b border-white/8 px-4 py-3 text-xs leading-relaxed text-muted">{m.lede}</p>
                <ul className="p-1.5">
                  {links.map((l) => (
                    <li key={l.href}>
                      <Link
                        href={l.href}
                        onClick={onNavigate}
                        className="flex items-start gap-3 rounded-xl px-3 py-2.5 transition-colors hover:bg-white/8"
                      >
                        <span className="mt-0.5 grid h-7 w-7 shrink-0 place-items-center rounded-lg border border-white/12"
                          style={{ color: m.accent }}>
                          <Icon name={l.icon} size={14} />
                        </span>
                        <span className="min-w-0">
                          <span className="block text-sm font-semibold">{l.label}</span>
                          {/* The note is what makes a menu a map rather than a
                              list of words. `tests/db/nav.mts` requires 70% of
                              leaves to carry one. */}
                          {l.note && <span className="block text-[11px] leading-snug text-muted">{l.note}</span>}
                        </span>
                      </Link>
                    </li>
                  ))}
                </ul>

                {/* The game logos live inside Play, where somebody looking for
                    a game will look. They were a row of six in the bar. */}
                {m.id === "play" && games.length > 0 && (
                  <div className="flex flex-wrap gap-1.5 border-t border-white/8 p-3">
                    {games.map((g) => (
                      <Link key={g.id} href={g.href} title={g.name} onClick={onNavigate}
                        className="flex h-9 w-9 items-center justify-center overflow-hidden rounded-lg border border-white/12 hover:border-cyan-400/60">
                        {g.logoUrl
                          ? /* eslint-disable-next-line @next/next/no-img-element */ <img src={g.logoUrl} alt={g.name} className="h-full w-full object-cover" />
                          : <Icon name="gamepad" size={15} className="text-muted" />}
                      </Link>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>
        );
      })}
    </nav>
  );
}

// ============================================================================
// The quest card that fills the middle of the bar (lg+, members only).
// A quest tracker means nothing to somebody with no quests, and the space is
// better spent on the two doors a guest is here for.
// ============================================================================

function QuestCard({ quests, totalCp, onNavigate }: {
  quests: NavQuestLite[]; totalCp: number; onNavigate: () => void;
}) {
  const [i, setI] = useState(0);
  const q = quests[Math.min(i, quests.length - 1)];
  if (!q) return null;
  const pct = q.total > 0 ? Math.min(100, Math.round((q.done / q.total) * 100)) : 0;

  return (
    <div className="flex w-full max-w-md items-center gap-2.5 rounded-2xl border border-white/10 bg-white/[0.04] px-3 py-1.5">
      {q.logoUrl
        ? /* eslint-disable-next-line @next/next/no-img-element */ <img src={q.logoUrl} alt="" className="h-7 w-7 shrink-0 rounded-lg object-cover" />
        : <Icon name="rocket" size={16} className="shrink-0 text-violet-300" />}
      <Link href={`/quests/${q.key}`} onClick={onNavigate} className="min-w-0 flex-1">
        <span className="block truncate text-xs font-semibold">{q.name}</span>
        <span className="mt-1 block h-1 overflow-hidden rounded-full bg-white/10">
          <span className="block h-full rounded-full bg-violet-400" style={{ width: `${pct}%` }} />
        </span>
      </Link>
      <span className="shrink-0 text-[11px] tabular-nums text-muted">{q.done}/{q.total}</span>
      {quests.length > 1 && (
        <button
          type="button"
          onClick={() => setI((v) => (v + 1) % quests.length)}
          title="Next quest"
          className="shrink-0 text-muted hover:text-ink"
        >
          <Icon name="chevronRight" size={14} />
        </button>
      )}
      <Link href="/quests" onClick={onNavigate} title="Your Cluster Points"
        className="shrink-0 border-l border-white/10 pl-2.5 text-[11px] font-bold tabular-nums text-cyan-200">
        {totalCp.toLocaleString()} CP
      </Link>
    </div>
  );
}

// ============================================================================
// The bell and the DM icon.
// ============================================================================

function Alerts({ notifications, conversations, unread, open, setOpen, onNavigate }: {
  notifications: NavNotif[]; conversations: NavConvo[]; unread: number;
  open: "bell" | "dm" | null; setOpen: (v: "bell" | "dm" | null) => void; onNavigate: () => void;
}) {
  const unreadDm = conversations.filter((c) => c.unread).length;

  const Panel = ({ children, empty }: { children: React.ReactNode; empty: string }) => (
    <div className="absolute right-0 top-full z-50 mt-2 w-[min(92vw,22rem)] overflow-hidden rounded-2xl border border-white/12 bg-[#04051a]/97 shadow-2xl backdrop-blur-xl">
      <div className="max-h-[60vh] overflow-y-auto p-1.5">
        {children ?? <p className="px-3 py-6 text-center text-xs text-muted">{empty}</p>}
      </div>
    </div>
  );

  return (
    <>
      <div className="relative">
        <button type="button" title="Notifications" aria-expanded={open === "bell"}
          onClick={() => setOpen(open === "bell" ? null : "bell")}
          className="relative text-muted hover:text-ink">
          <Icon name="bell" size={18} />
          {unread > 0 && (
            <span className="absolute -right-1.5 -top-1.5 grid h-4 min-w-4 place-items-center rounded-full bg-rose-500 px-1 text-[9px] font-black text-white">
              {unread > 9 ? "9+" : unread}
            </span>
          )}
        </button>
        {open === "bell" && (
          <Panel empty="Nothing yet — it fills as you play.">
            {notifications.length > 0 ? (
              <>
                {notifications.map((n) => (
                  <Link key={n.id} href={n.href ?? "/feed"} onClick={onNavigate}
                    className={`flex gap-2.5 rounded-xl px-3 py-2 hover:bg-white/8 ${n.read ? "opacity-60" : ""}`}>
                    <Icon name="spark" size={13} className="mt-0.5 shrink-0 text-cyan-300" />
                    <span className="min-w-0">
                      <span className="block truncate text-xs font-semibold">{n.title}</span>
                      {n.body && <span className="block truncate text-[11px] text-muted">{n.body}</span>}
                    </span>
                  </Link>
                ))}
                <Link href="/notifications" onClick={onNavigate}
                  className="mt-1 block rounded-xl px-3 py-2 text-center text-xs font-semibold text-cyan-300 hover:bg-white/8">
                  See all
                </Link>
              </>
            ) : null}
          </Panel>
        )}
      </div>

      <div className="relative">
        <button type="button" title="Messages" aria-expanded={open === "dm"}
          onClick={() => setOpen(open === "dm" ? null : "dm")}
          className="relative text-muted hover:text-ink">
          <Icon name="message" size={18} />
          {unreadDm > 0 && <span className="absolute -right-1 -top-1 h-2 w-2 rounded-full bg-rose-500" />}
        </button>
        {open === "dm" && (
          <Panel empty="No conversations yet.">
            {conversations.length > 0 ? (
              <>
                {conversations.map((c) => (
                  <Link key={c.id} href={`/messages/${c.id}`} onClick={onNavigate}
                    className="flex items-center gap-2.5 rounded-xl px-3 py-2 hover:bg-white/8">
                    <Avatar name={c.name} src={c.avatarUrl} size={26} />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-xs font-semibold">{c.name}</span>
                      <span className="block truncate text-[11px] text-muted">{c.snippet}</span>
                    </span>
                    {c.unread && <span className="h-2 w-2 shrink-0 rounded-full bg-rose-500" />}
                  </Link>
                ))}
                <Link href="/messages" onClick={onNavigate}
                  className="mt-1 block rounded-xl px-3 py-2 text-center text-xs font-semibold text-cyan-300 hover:bg-white/8">
                  All messages
                </Link>
              </>
            ) : null}
          </Panel>
        )}
      </div>
    </>
  );
}

// ============================================================================
// PROFILE OF THE WEEK
//
// Collapsed: a strip inside the sticky header, on every page.
// Expanded: a panel that DROPS from the nav and overlays the page wherever you
// are in it. It does not push content down and does not insert itself at the
// top of the document — expanding it from halfway through a page used to move
// the thing you were reading.
// ============================================================================

const MEDAL = ["#fbbf24", "#cbd5e1", "#d08a4a"];
const PLACE_LABEL = ["Profile of the Week", "Second", "Third"];

function WeekBand({ data, open, onToggle, mounted, onNavigate }: {
  data: BandData; open: boolean; onToggle: () => void; mounted: boolean; onNavigate: () => void;
}) {
  const podium = data.entries.slice(0, 3);
  const rest = data.entries.length - podium.length;
  const leader = data.entries[0] ?? null;

  return (
    <>
      {/* The trigger. `tests/ui/week-band.mjs` finds it as
          `header button:has-text("Profile of the Week")`. */}
      <button
        type="button"
        onClick={onToggle}
        aria-expanded={open}
        className="w-full border-t border-white/5 px-4 py-1.5 text-left"
      >
        <span className="mx-auto flex max-w-6xl flex-wrap items-center gap-x-4 gap-y-1 text-xs">
          <span className="inline-flex items-center gap-1.5 font-semibold">
            <Icon name="crown" size={13} className="text-amber-300" />
            Profile of the Week
          </span>
          {leader ? (
            <span className="inline-flex min-w-0 items-center gap-1.5 text-muted">
              <Avatar name={leader.displayName} src={leader.avatarUrl} size={16} />
              <span className="truncate">{leader.displayName} leads</span>
              <span className="tabular-nums">· {leader.weekVotes} votes</span>
            </span>
          ) : (
            <span className="text-muted">Nobody has been voted for yet — the board is open.</span>
          )}
          <WeekCountdown data={data} className="ml-auto shrink-0 text-muted" />
          {mounted && (
            <span className="shrink-0 text-muted">
              <Icon name={open ? "chevronUp" : "chevronDown"} size={13} />
            </span>
          )}
        </span>
      </button>

      {open && (
        <div
          data-week-panel
          // ===== IT LEAVES THE PAGE VISIBLE. Reported defect #2. =====
          //
          // This was `max-h-[calc(100dvh-var(--nav-h))]` — the entire viewport
          // below the nav — and the UI test allowed anything under 92%, which
          // is still the whole of a phone screen. Reported as "covering most of
          // the gamer screen", and that is what it was built to do.
          //
          // 68vh keeps the page it is covering legible underneath, which is the
          // difference between a panel and a takeover.
          className="absolute inset-x-0 top-full z-[61] max-h-[68vh] overflow-y-auto overscroll-contain border-b border-white/10 bg-[#04051a]/95 shadow-2xl backdrop-blur-xl"
          onClick={(e) => { if (e.target === e.currentTarget) onToggle(); }}
        >
          <div className="mx-auto max-w-6xl px-4 py-4">
            <div className="mb-3 flex flex-wrap items-baseline justify-between gap-2">
              <h2 className="text-sm font-bold">
                {data.result ? "This week's result" : "Vote for the profile of the week"}
              </h2>
              <WeekCountdown data={data} className="text-xs text-muted" />
            </div>

            {data.stream.url && <WeekStream url={data.stream.url} live={data.stream.live} />}

            {podium.length === 0 ? (
              <p className="py-6 text-center text-sm text-muted">
                No profiles in the running yet. Build yours and you are on the board.
              </p>
            ) : (
              <div className="grid gap-2 sm:grid-cols-3">
                {podium.map((e, i) => (
                  <PodiumCard
                    key={e.slug} entry={e} place={i} prize={data.prizes[i] ?? null}
                    votingOpen={data.votingOpen} signedIn={data.signedIn} onNavigate={onNavigate}
                  />
                ))}
              </div>
            )}

            {rest > 0 && (
              // Everybody else is behind a link rather than dumped into the
              // band. A band that lists twenty-five people is a page.
              <Link
                data-see-all
                href="/vote"
                onClick={onNavigate}
                className="mt-3 flex items-center justify-center gap-1.5 rounded-xl border border-white/12 px-4 py-2 text-xs font-semibold text-cyan-300 hover:bg-white/5"
              >
                {rest} more in the running <Icon name="arrowRight" size={12} />
              </Link>
            )}
          </div>
        </div>
      )}
    </>
  );
}

function PodiumCard({ entry: e, place, prize, votingOpen, signedIn, onNavigate }: {
  entry: BandEntry;
  place: number;
  prize: { id: string; name: string; imageUrl: string; tier: string; value: number } | null;
  votingOpen: boolean; signedIn: boolean; onNavigate: () => void;
}) {
  return (
    <div
      // `data-prize` is the id or "", and the UI test counts cards by it. A
      // configured place must render the trophy ITSELF, not a generic icon.
      data-prize={prize?.id ?? ""}
      className="relative overflow-hidden rounded-2xl border border-white/12 p-3"
      style={{ borderColor: `${MEDAL[place]}55` }}
    >
      <div className="flex items-center gap-2.5">
        <span className="grid h-6 w-6 shrink-0 place-items-center rounded-full text-[10px] font-black"
          style={{ background: `${MEDAL[place]}22`, color: MEDAL[place] }}>
          {place + 1}
        </span>
        {/* Every profile link opens in a new tab and carries noopener — the
            band is chrome, and losing the page you were on to look at somebody
            else's profile is not what tapping a name in a strip should do. */}
        <a href={`/u/${e.slug}`} target="_blank" rel="noopener noreferrer"
          onClick={onNavigate} className="flex min-w-0 items-center gap-2 hover:underline">
          <Avatar name={e.displayName} src={e.avatarUrl} size={26} />
          <span className="min-w-0">
            <span className="block truncate text-sm font-semibold">{e.displayName}</span>
            <span className="block text-[10px] uppercase tracking-widest" style={{ color: MEDAL[place] }}>
              {PLACE_LABEL[place]}
            </span>
          </span>
        </a>
        <span className="ml-auto shrink-0 text-xs font-bold tabular-nums">{e.weekVotes}</span>
      </div>

      {prize && (
        <div className="mt-2 flex items-center gap-2 rounded-xl border border-white/10 bg-black/25 px-2 py-1.5">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={prize.imageUrl} alt={prize.name} className="h-7 w-7 shrink-0 object-contain" />
          <span className="min-w-0">
            <span className="block truncate text-[11px] font-semibold">{prize.name}</span>
            {/* NEVER "already won". Voting is open; this is a standing, not a
                result, and the UI test fails on the words. */}
            <span className="block text-[10px] text-muted">if the week ended now</span>
          </span>
        </div>
      )}

      {votingOpen && (
        <VoteButton slug={e.slug} voted={e.votedByMe} votes={e.weekVotes} signedIn={signedIn} />
      )}
    </div>
  );
}

function VoteButton({ slug, voted, votes, signedIn }: {
  slug: string; voted: boolean; votes: number; signedIn: boolean;
}) {
  const [state, setState] = useState({ voted, votes });
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const cast = async () => {
    if (busy) return;
    if (!signedIn) { setErr("Continue with Discord to vote."); return; }
    setBusy(true); setErr(null);
    // Optimistic, and reverted on failure — a vote button that waits on a round
    // trip feels broken on a phone.
    const next = { voted: !state.voted, votes: state.votes + (state.voted ? -1 : 1) };
    setState(next);
    try {
      const fd = new FormData();
      fd.set("slug", slug);
      const res = await voteFromBand(undefined, fd);
      if (res?.error) { setState({ voted, votes }); setErr(res.error); }
      else if (typeof res?.weekVotes === "number") {
        setState({ voted: !!res.voted, votes: res.weekVotes });
      }
    } catch {
      setState({ voted, votes });
      setErr("That didn't go through. Try again.");
    } finally { setBusy(false); }
  };

  return (
    <>
      <button
        type="button" onClick={cast} disabled={busy}
        className={`mt-2 w-full rounded-full px-3 py-1.5 text-[11px] font-bold transition-colors ${
          state.voted
            ? "border border-emerald-400/50 bg-emerald-500/10 text-emerald-200"
            : "border border-white/15 hover:border-cyan-400/60 hover:text-cyan-200"
        }`}
      >
        {state.voted ? "Voted" : "Vote"} · {state.votes}
      </button>
      {err && <p className="mt-1 text-[10px] text-amber-300">{err}</p>}
    </>
  );
}

function WeekCountdown({ data, className = "" }: { data: BandData; className?: string }) {
  const [now, setNow] = useState<number | null>(null);
  useEffect(() => {
    setNow(Date.now());
    const t = setInterval(() => setNow(Date.now()), 30_000);
    return () => clearInterval(t);
  }, []);
  // Rendered only after mount: the server has a different clock to the browser,
  // and a countdown is the one thing guaranteed to differ between them.
  if (now === null) return null;
  const end = new Date(data.votingOpen ? data.week.votingEndsAt : data.week.endsAt).getTime();
  const ms = end - now;
  if (ms <= 0) return <span className={className}>counting the votes</span>;
  const h = Math.floor(ms / 3_600_000);
  const label = h >= 24 ? `${Math.floor(h / 24)}d left` : h >= 1 ? `${h}h left` : `${Math.max(1, Math.round(ms / 60_000))}m left`;
  return <span className={className}>{data.votingOpen ? `voting · ${label}` : label}</span>;
}

function WeekStream({ url, live }: { url: string; live: boolean }) {
  const embed = useMemo(() => {
    try {
      const u = new URL(url);
      const host = u.hostname.replace(/^www\./, "");
      if (host === "youtube.com" && u.searchParams.get("v")) return `https://www.youtube.com/embed/${u.searchParams.get("v")}`;
      if (host === "youtu.be") return `https://www.youtube.com/embed/${encodeURIComponent(u.pathname.slice(1))}`;
      if (host.endsWith("twitch.tv")) {
        const ch = u.pathname.replace(/^\//, "").split("/")[0];
        if (ch) return `https://player.twitch.tv/?channel=${ch}&parent=clustergg.com&parent=www.clustergg.com&muted=true`;
      }
    } catch { /* not a URL we can embed */ }
    return null;
  }, [url]);

  if (!embed) {
    return (
      <a href={url} target="_blank" rel="noopener noreferrer"
        className="mb-3 flex items-center gap-2 rounded-xl border border-white/12 px-3 py-2 text-xs font-semibold text-cyan-300 hover:bg-white/5">
        <Icon name="wave" size={13} /> {live ? "Live now" : "Watch the broadcast"}
      </a>
    );
  }
  return (
    <div className="mb-3 overflow-hidden rounded-xl border border-white/12">
      <iframe src={embed} className="aspect-video w-full" allowFullScreen title="The Sunday Broadcast" />
    </div>
  );
}

// ============================================================================
// TODAY'S MISSION
//
// `lib/missions.ts` shipped a complete system — templates, per-day tasks, a
// streak that loops, milestones that award trophies — with 89 green assertions
// and not one importer. This band is the only surface the feature has.
// ============================================================================

function MissionBand({ data, open, onToggle, mounted, onNavigate }: {
  data: MissionView; open: boolean; onToggle: () => void; mounted: boolean; onNavigate: () => void;
}) {
  const pct = data.ceiling > 0 ? Math.min(100, Math.round((data.earned / data.ceiling) * 100)) : 0;
  const doneCount = data.tasks.filter((t) => t.complete).length;

  return (
    <>
      <button type="button" onClick={onToggle} aria-expanded={open}
        className="w-full border-t border-white/5 px-4 py-1.5 text-left">
        <span className="mx-auto flex max-w-6xl flex-wrap items-center gap-x-4 gap-y-1 text-xs">
          <span className="inline-flex items-center gap-1.5 font-semibold">
            <Icon name="flame" size={13} className={data.streak > 0 ? "text-amber-300" : "text-muted"} />
            {data.streak > 0 ? `${data.streak} day streak` : "Start a streak today"}
          </span>
          <span className="inline-flex min-w-0 flex-1 items-center gap-2">
            <span className="h-1.5 w-full max-w-[180px] overflow-hidden rounded-full bg-white/10">
              <span className="block h-full rounded-full transition-[width]"
                style={{ width: `${pct}%`, background: data.complete ? "#34d399" : "#8b5cf6" }} />
            </span>
            <span className="shrink-0 text-muted">
              {data.complete ? "Today is done" : `${data.earned.toLocaleString()} / ${data.ceiling.toLocaleString()} CP`}
            </span>
          </span>
          {mounted && (
            <span className="shrink-0 text-muted"><Icon name={open ? "chevronUp" : "chevronDown"} size={13} /></span>
          )}
        </span>
      </button>

      {open && (
        <div
          data-mission-panel
          // ===== THE ART SHOWS THROUGH. Reported defect #4. =====
          //
          // The old panel painted `rgba(4,5,26,0.90)` over the nav art, which is
          // why it was reported as "black background, not using the nav art".
          // It is the header's own background layer underneath, so a light scrim
          // is all that is needed to keep text legible over it — and the panel
          // then reads as part of the same piece of chrome as the strip above.
          className="absolute inset-x-0 top-full z-[61] max-h-[68vh] overflow-y-auto overscroll-contain border-b border-white/10 bg-[#04051a]/70 shadow-2xl backdrop-blur-xl"
          onClick={(e) => { if (e.target === e.currentTarget) onToggle(); }}
        >
          <div className="mx-auto max-w-6xl px-4 py-4">
            {/* ===== WHAT A GAMER ACTUALLY WANTED HERE. Defect #5. =====
                Lifetime points, what is spendable, and how much of today is
                done — the three numbers somebody opens this to find. */}
            <div className="mb-4 grid grid-cols-3 gap-2">
              <Stat label="Cluster Points" value={data.totalCp.toLocaleString()} href="/quests" onNavigate={onNavigate} />
              <Stat
                label={data.wallet ? "Wallet" : "Wallet"}
                value={data.wallet
                  ? `${data.wallet.currency === "USD" ? "$" : ""}${data.wallet.balance.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
                  : "—"}
                href="/wallet" onNavigate={onNavigate}
              />
              <Stat label="Done today" value={`${doneCount}/${data.tasks.length}`} href="/quests" onNavigate={onNavigate} />
            </div>

            <div className="grid gap-5 sm:grid-cols-2">
              <div>
                <h3 className="mb-2 text-xs font-bold uppercase tracking-widest text-muted">Today&apos;s mission</h3>
                {data.tasks.length === 0 ? (
                  <p className="text-sm text-muted">Nothing set for today — every point still counts.</p>
                ) : (
                  <ul className="space-y-1">
                    {data.tasks.map((t, i) => {
                      // ===== A TASK IS A DOOR. Defects #3. =====
                      //
                      // These were plain `<li>`s: no icon, no link, and nothing
                      // saying which part of the product a task belonged to. The
                      // action key that answers all three was already on the
                      // task and was being thrown away one layer up.
                      const d = missionDestination(t.action);
                      return (
                        <li key={`${t.action}-${i}`}>
                          <Link
                            href={d.href}
                            onClick={onNavigate}
                            className="flex items-center gap-2.5 rounded-xl px-2 py-1.5 transition-colors hover:bg-white/8"
                          >
                            <span className={`grid h-7 w-7 shrink-0 place-items-center rounded-lg border ${
                              t.complete ? "border-emerald-400/50 bg-emerald-500/15 text-emerald-300" : "border-white/12 text-muted"
                            }`}>
                              <Icon name={t.complete ? "check" : d.icon} size={13} />
                            </span>
                            <span className="min-w-0 flex-1">
                              <span className={`block truncate text-sm ${t.complete ? "text-muted line-through" : ""}`}>{t.label}</span>
                              <span className="block text-[10px] uppercase tracking-widest text-muted">{d.where}</span>
                            </span>
                            <span className="shrink-0 text-right text-[11px] tabular-nums text-muted">
                              {t.done}/{t.count}<br />+{t.cp} CP
                            </span>
                          </Link>
                        </li>
                      );
                    })}
                  </ul>
                )}
              </div>

              <div>
                <h3 className="mb-2 text-xs font-bold uppercase tracking-widest text-muted">Streak milestones</h3>
                <div className="flex flex-wrap gap-2">
                  {data.milestones.map((m) => {
                    const reached = data.reached.includes(m.days) || data.streak >= m.days;
                    return (
                      <span key={m.days}
                        className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs ${
                          reached ? "border-emerald-400/50 bg-emerald-500/10 text-emerald-200" : "border-white/15 text-muted"
                        }`}>
                        {m.hasTrophy && <Icon name="trophy" size={11} />}
                        {m.days} days
                      </span>
                    );
                  })}
                </div>
                <p className="mt-3 text-sm text-muted">
                  {data.next
                    ? <>Next milestone in <b className="text-ink">{data.next.away}</b> {data.next.away === 1 ? "day" : "days"}.</>
                    : "Every milestone reached this run."}
                </p>
                {/* A milestone with no trophy behind it says so rather than
                    silently promising one. */}
                {data.milestones.length > 0 && data.milestones.every((m) => !m.hasTrophy) && (
                  <p className="mt-1 text-xs text-muted">Trophies for these are being chosen.</p>
                )}
                <Link href="/quests" onClick={onNavigate}
                  className="mt-3 inline-flex items-center gap-1.5 text-xs font-semibold text-cyan-300 hover:underline">
                  My quests <Icon name="arrowRight" size={12} />
                </Link>
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

function Stat({ label, value, href, onNavigate }: {
  label: string; value: string; href: string; onNavigate: () => void;
}) {
  return (
    <Link href={href} onClick={onNavigate}
      className="rounded-xl border border-white/12 bg-black/25 px-3 py-2 transition-colors hover:border-cyan-400/40">
      <span className="block text-base font-bold tabular-nums">{value}</span>
      <span className="block text-[10px] uppercase tracking-widest text-muted">{label}</span>
    </Link>
  );
}
