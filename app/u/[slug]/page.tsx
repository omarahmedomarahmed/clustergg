import Link from "next/link";
import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { and, count, desc, eq, gt, inArray, sql } from "drizzle-orm";
import { getDb, schema } from "@/lib/db";
import { isProof } from "@/lib/account-ownership";
import { cardMeta } from "@/lib/og";
import { getCurrentUser, isAdmin } from "@/lib/auth";
import { getProvider } from "@/lib/providers/registry";
import { providerInfoList } from "@/lib/providers/serialize";
import { resolveGame } from "@/lib/game-logos";
import { syncUserAccountsIfStale } from "@/lib/sync";
import { getContent } from "@/lib/cms";
import { gamerWeekVotes } from "@/lib/profile-week";
import { slimImg, optImg } from "@/lib/img";
import { hasVoted, recordProfileView } from "@/lib/identity";
import { resolveTheme, themeToVars, bgLayerStyle, coverStyle, avatarClip, sectionArtStyle } from "@/lib/theme";
import Avatar from "@/components/Avatar";
import Flag from "@/components/Flag";
import { getT } from "@/lib/i18n/t-server";
import GameLogo from "@/components/GameLogo";
import Icon from "@/components/Icon";
import VerifiedMarkIcon from "@/components/VerifiedMark";
import { markFor } from "@/lib/verified-mark";
import FollowButton from "@/components/FollowButton";
import AdSlot from "@/components/AdSlot";
import ProfileAccounts from "@/components/ProfileAccounts";
import CopyLinkButton from "@/components/CopyLinkButton";
import DiscordTag from "@/components/DiscordTag";
import QuestCard from "@/components/QuestCard";
import CpIcon from "@/components/CpIcon";
import VoteButton from "@/components/VoteButton";
import { getUserQuests } from "@/lib/quests";
import { getTrophyCase, getMyRedeems, stackTrophies } from "@/lib/trophies";
import TrophyCase from "@/components/TrophyCase";
import { localizeQuest } from "@/lib/i18n/entities";
import { levelFromCp } from "@/lib/level";
import { metricLabel, metricText, metricUnit } from "@/lib/metric-display";
import { startConversation } from "@/app/actions/social";
import { fmtNum, timeAgo } from "@/lib/utils";
import Cp from "@/components/Cp";

export const dynamic = "force-dynamic";

type Props = { params: Promise<{ slug: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params;
  const db = await getDb();
  const [user] = await db.select().from(schema.users).where(eq(schema.users.slug, slug)).limit(1);
  if (!user) return { title: "Gamer not found" };
  return {
    title: `${user.displayName} (@${user.slug})`,
    description: user.bio ?? `${user.displayName}'s gamer profile on Cluster.`,
    // Their own card, drawn from live data — the same PNG the bot posts when
    // they share their profile in Discord. A profile link previewing a generic
    // logo is a link nobody clicks.
    openGraph: {
      title: `${user.displayName} on Cluster`,
      description: user.bio ?? "Every game. One identity.",
      ...cardMeta("profile", { slug: user.slug }, `${user.displayName}'s Cluster profile`).openGraph,
    },
    twitter: cardMeta("profile", { slug: user.slug }, `${user.displayName}'s Cluster profile`).twitter,
  };
}

export default async function ProfilePage({ params }: Props) {
  const { slug } = await params;
  const db = await getDb();
  const [user] = await db.select().from(schema.users).where(eq(schema.users.slug, slug)).limit(1);
  if (!user || user.status === "banned") notFound();

  const viewer = await getCurrentUser();
  const { tr, te } = await getT(viewer?.locale);
  const isOwner = viewer?.id === user.id;
  const adminView = isAdmin(viewer) && !isOwner;

  if (user.profileVisibility === "private" && !isOwner && !adminView) {
    return (
      <div className="mx-auto max-w-md px-4 py-32 text-center glass mt-16">
        <Icon name="lock" size={40} className="text-violet-300 mb-4" />
        <h1 className="text-xl font-bold">This constellation is private</h1>
      </div>
    );
  }

  try { await syncUserAccountsIfStale(db, user.id); } catch { /* render regardless */ }

  // Has this visitor already voted for them? Drives the button's state, so a
  // second click removes the vote rather than silently doing nothing.
  const alreadyVoted = viewer ? await hasVoted(user.id, viewer.id) : false;
  // Both numbers on the profile: the week they're competing in right now, and
  // the lifetime total behind it.
  const weekVotes = (await gamerWeekVotes(user.id)).week;

  // Count a profile view when someone other than the owner looks — a brag
  // number the gamer can show off. Owners viewing their own page don't count.
  let viewCount = user.profileViews ?? 0;
  if (!isOwner) {
    viewCount += 1;
    try { await db.update(schema.users).set({ profileViews: viewCount }).where(eq(schema.users.id, user.id)); } catch { /* non-fatal */ }

    // CP for a profile view requires a SIGNED-IN viewer, and pays once per
    // viewer per day. B72.2, and it is the third mint the beacon fix does not
    // reach.
    //
    // This page is public and uncached-per-visitor, so the old rule — award the
    // owner every time the raw counter crossed a multiple of 25 — meant anybody
    // could reload a stranger's profile twenty-five times and hand them points.
    // No account, no cost, and it did not even have to be their own profile.
    //
    // The counter above still counts everyone, because it is a vanity number
    // and always was. The MONEY now needs a real gamer behind it: the award is
    // keyed on (viewer, day), so a second look the same day pays nothing, and
    // the catalogue's daily cap does the rest. Farming it means running several
    // real accounts, which is exactly the cost we want the platform to have.
    if (viewer?.id && viewer.id !== user.id) {
      try {
        const { awardQuestAction } = await import("@/lib/quests");
        await awardQuestAction(db, user.id, "profile_views_25", {
          refType: "view", refId: `${viewer.id}:${new Date().toISOString().slice(0, 10)}`,
        });
      } catch { /* non-fatal */ }
    }
  }

  const theme = resolveTheme(user.theme);
  const vars = themeToVars(theme) as React.CSSProperties;
  const cardCls = `p-card p-card-${theme.cardStyle}`;

  const [accounts, [followerRow], [followingRow], isFollowingRow, participations, allBoards, spaceRows] = await Promise.all([
    db.select().from(schema.linkedGameAccounts).where(eq(schema.linkedGameAccounts.userId, user.id)),
    db.select({ c: count() }).from(schema.follows).where(eq(schema.follows.followingId, user.id)),
    db.select({ c: count() }).from(schema.follows).where(eq(schema.follows.followerId, user.id)),
    viewer ? db.select().from(schema.follows).where(and(eq(schema.follows.followerId, viewer.id), eq(schema.follows.followingId, user.id))).limit(1) : Promise.resolve([]),
    db.select({ p: schema.challengeParticipants, c: schema.challenges }).from(schema.challengeParticipants)
      .innerJoin(schema.challenges, eq(schema.challengeParticipants.challengeId, schema.challenges.id))
      .where(eq(schema.challengeParticipants.userId, user.id)).orderBy(desc(schema.challengeParticipants.joinedAt)).limit(8),
    db.select().from(schema.leaderboards).where(eq(schema.leaderboards.isActive, true)),
    db.select({ s: schema.spaces }).from(schema.spaceMembers)
      .innerJoin(schema.spaces, eq(schema.spaceMembers.spaceId, schema.spaces.id))
      .where(and(eq(schema.spaceMembers.userId, user.id), eq(schema.spaces.isActive, true))).limit(12),
  ]);

  const profileQuests = (await getUserQuests(db, user.id)).map((q) => localizeQuest(q, te));
  // Player level (from total Cluster Points) — makes the profile read as a game card.
  const profileCp = profileQuests.reduce((s, q) => s + q.totalCp, 0);
  const plvl = levelFromCp(profileCp);
  const games = await db.select({ name: schema.games.name, slug: schema.games.slug, logoUrl: schema.games.logoUrl, coverUrl: schema.games.coverUrl }).from(schema.games);
  const gameCover = new Map(games.map((g) => [g.name, g.coverUrl]));
  const accountAvatar = (a: typeof accounts[number]): string | null => {
    const pd = a.providerData as Record<string, unknown> | null;
    const av = pd && (pd.avatar ?? pd.avatarUrl ?? pd.image);
    return typeof av === "string" && av.startsWith("http") ? av : null;
  };

  const accountIds = accounts.map((a) => a.id);
  const stats = accountIds.length ? await db.select().from(schema.statCurrent).where(inArray(schema.statCurrent.linkedAccountId, accountIds)) : [];
  const statsByAccount = new Map<string, typeof stats>();
  for (const s of stats) { if (!statsByAccount.has(s.linkedAccountId)) statsByAccount.set(s.linkedAccountId, []); statsByAccount.get(s.linkedAccountId)!.push(s); }

  const boardIndex = new Map(allBoards.map((b) => [`${b.game}::${b.metricKey}`, b]));
  const standingsByAccount = new Map<string, { title: string; rank: number; total: number; metricKey: string; game: string }[]>();
  let bestStanding: { title: string; rank: number; total: number } | null = null;
  for (const s of stats) {
    const board = boardIndex.get(`${s.game}::${s.metricKey}`);
    if (!board) continue;
    const [better] = await db.select({ c: count() }).from(schema.statCurrent).where(and(eq(schema.statCurrent.game, s.game), eq(schema.statCurrent.metricKey, s.metricKey), gt(schema.statCurrent.metricValue, s.metricValue)));
    const [total] = await db.select({ c: count() }).from(schema.statCurrent).where(and(eq(schema.statCurrent.game, s.game), eq(schema.statCurrent.metricKey, s.metricKey)));
    const rank = Number(better?.c ?? 0) + 1, tot = Math.max(1, Number(total?.c ?? 1));
    const entry = { title: board.title, rank, total: tot, metricKey: s.metricKey, game: s.game };
    if (!standingsByAccount.has(s.linkedAccountId)) standingsByAccount.set(s.linkedAccountId, []);
    standingsByAccount.get(s.linkedAccountId)!.push(entry);
    if (!bestStanding || rank / tot < bestStanding.rank / bestStanding.total) bestStanding = entry;
  }

  // The REAL trophy shelf: awarded trophies (redeemed ones move to history and
  // leave the public profile). Owners also get the redeem flow.
  const trophyShelfAll = await getTrophyCase(db, user.id);
  const trophyShelf = trophyShelfAll.filter((a) => a.status !== "redeemed");
  const myRedeems = isOwner ? await getMyRedeems(db, user.id) : [];
  const activeChallenges = participations.filter(({ c }) => c.status === "active");
  // Resolve each challenge's planet slug so its card links to the challenge page.
  const challengeSpaceIds = [...new Set(participations.map(({ c }) => c.spaceId))];
  const chSpaces = challengeSpaceIds.length
    ? await db.select({ id: schema.spaces.id, slug: schema.spaces.slug }).from(schema.spaces).where(inArray(schema.spaces.id, challengeSpaceIds))
    : [];
  const slugBySpaceId = new Map(chSpaces.map((s) => [s.id, s.slug]));

  const S = theme.sections;
  // Card titles refer to the gamer by name (e.g. "Nova's quests") rather than "My …".
  const poss = `${user.displayName}${user.displayName.endsWith("s") ? "'" : "'s"}`;

  // Serializable account cards for the interactive <ProfileAccounts>.
  const accountsData = accounts.map((a) => {
    const p = getProvider(a.provider);
    const caps = p?.capabilities ?? [];
    const aStats = statsByAccount.get(a.id) ?? [];
    const st = standingsByAccount.get(a.id) ?? [];
    return {
      id: a.id,
      provider: a.provider,
      tag: a.inGameName,
      providerName: p?.name ?? a.provider,
      gameName: p?.game ?? "",
      // Proven, not merely readable — a tick that means "the API answered"
      // is the exact claim this platform can't afford to make.
      verified: a.verified && isProof(a.verifiedMethod),
      logoUrl: slimImg(resolveGame(games, p?.game ?? "")?.logoUrl ?? null, 300000),
      coverUrl: slimImg(resolveGame(games, p?.game ?? "")?.coverUrl ?? null, 400000),
      avatar: accountAvatar(a),
      // Through the shared helper rather than a local `rankLabel ?? fmtNum` —
      // this surface was already correct, but four hand-written copies of the
      // rule is how the fifth surface (the feed dashboard) ended up without it.
      stats: aStats.slice(0, 6).map((s) => ({
        label: metricLabel(a.provider, s.metricKey),
        value: metricText({ metricValue: s.metricValue, rankLabel: s.rankLabel, unit: metricUnit(a.provider, s.metricKey) }),
      })),
      // Taken from the full stat set, not from `stats` above — that one is
      // capped at six tiles and the level is often the seventh.
      summonerLevel: aStats.find((s) => s.metricKey === "summoner_level")?.metricValue ?? null,
      standings: (S.standings ? st.slice(0, 3) : []).map((x) => ({ rank: x.rank, total: x.total, label: x.title.split("·")[1]?.trim() ?? x.metricKey, game: x.game, metricKey: x.metricKey })),
    };
  });
  const accountGameLogos: Record<string, string | null> = {};
  for (const info of providerInfoList()) accountGameLogos[info.id] = slimImg(resolveGame(games, info.game)?.logoUrl ?? null, 300000);

  const sectionNode = (key: string): React.ReactNode => {
    switch (key) {
      case "accounts":
        if (!S.accounts) return null;
        return (
          <div key={key}>
            <ProfileAccounts
              accounts={accountsData}
              colors={{ accent: theme.accent, accent2: theme.accent2, text: theme.text, muted: theme.muted, panel: theme.panel, radius: theme.radius }}
              isOwner={isOwner}
              providers={providerInfoList()}
              gameLogos={accountGameLogos}
            />
          </div>
        );
      case "trophies":
        if (!S.trophies || (trophyShelf.length === 0 && !isOwner)) return null;
        if (!S.trophies || (trophyShelf.length === 0 && trophyShelfAll.length === 0 && myRedeems.length === 0)) return null;
        return (
          <section key={key}>
            <div className="flex items-center justify-between gap-3 flex-wrap mb-3">
              <h2 className="text-lg font-bold flex items-center gap-2" style={{ color: theme.text }}><Icon name="trophy" size={19} style={{ color: theme.accent }} /> {poss} {tr("trophy case")}</h2>
              <div className="flex flex-wrap items-center gap-2">
                {/* The shelf is also a shop. A visitor looking at somebody's
                    trophy case is the most likely person on the site to want
                    one, and the owner is the most likely to want another. */}
                <a href="/marketplace"
                  className="inline-flex items-center gap-1.5 rounded-full border border-amber-400/40 bg-amber-500/10 px-3 py-1.5 text-xs font-semibold text-amber-200 hover:bg-amber-500/20">
                  <Icon name="trophy" size={13} /> {tr("Trophy marketplace")}
                </a>
                {isOwner && (
                  <TrophyCase variant="button" awards={trophyShelfAll} redeems={myRedeems}
                    savedMethod={user.payoutMethod ?? null} changesUsed={user.payoutChanges ?? 0} />
                )}
              </div>
            </div>
            {/* B62.1. STACKED. Three copies of one trophy used to be three
                identical tiles in a row, which reads as a rendering bug rather
                than an achievement — and the count is the impressive part.
                The bot card has stacked since B62; this surface had not, so the
                same gamer's shelf looked different depending where you saw it.
                One rule now, in `stackTrophies`.

                Still no price, which was already true here and is the other
                half of B62: a profile is a brag and a shelf is a shop. A cash
                figure turns a trophy case into a receipt. The value lives in
                the redeem flow, where it is deciding something. */}
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
              {stackTrophies(trophyShelf).map((a) => (
                <div key={a.id} className={`${cardCls} text-center relative`}>
                  {a.count > 1 && (
                    <span
                      className="absolute top-2 right-2 rounded-full px-2 py-0.5 text-[11px] font-black"
                      style={{ background: theme.accent2, color: "#0b1020" }}
                    >
                      ×{a.count}
                    </span>
                  )}
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={a.imageUrl} alt={a.name} className="mx-auto h-32 object-contain float-y" />
                  <div className="mt-2 text-xs font-bold" style={{ color: theme.accent2 }}>{a.placement === 1 ? tr("CHAMPION") : `#${a.placement} ${tr("PLACE")}`}</div>
                  <div className="mt-0.5 flex items-center justify-center gap-1.5">
                    {a.gameLogoUrl && <GameLogo logoUrl={slimImg(a.gameLogoUrl, 300000)} name={a.game ?? ""} size={16} rounded="rounded" />}
                    <span className="text-sm font-semibold line-clamp-1" style={{ color: theme.text }}>{a.challengeTitle ?? a.name}</span>
                  </div>
                </div>
              ))}
            </div>
          </section>
        );
      // "badges" section retired — Quests / Cluster Points replaced it.
      case "challenges":
        if (!S.challenges || activeChallenges.length === 0) return null;
        return (
          <section key={key}>
            <h2 className="text-lg font-bold mb-3 flex items-center gap-2" style={{ color: theme.text }}><Icon name="zap" size={19} style={{ color: theme.accent }} /> {poss} {tr("challenges")}</h2>
            <div className="grid sm:grid-cols-2 gap-3">
              {activeChallenges.map(({ p, c }) => {
                const cover = slimImg(c.coverUrl) ?? slimImg(gameCover.get(c.game) ?? null);
                const chSlug = slugBySpaceId.get(c.spaceId);
                const href = chSlug ? `/planets/${chSlug}/challenges/${c.id}` : `/planets`;
                return (
                  <Link key={p.id} href={href} className={`${cardCls} relative overflow-hidden !p-0 block hover:brightness-110 transition-[filter]`}>
                    <div className="h-24 relative overflow-hidden">
                      {cover ? (
                        <div className="absolute inset-0 bg-cover bg-center" style={{ backgroundImage: `url(${optImg(cover, 1200)})` }} />
                      ) : (
                        <div className="absolute inset-0" style={{ background: `linear-gradient(120deg, ${theme.accent}44, ${theme.accent2}33)` }} />
                      )}
                      <div className="absolute inset-0" style={{ background: "linear-gradient(to top, rgba(4,5,26,0.92), rgba(4,5,26,0.25))" }} />
                      <div className="absolute top-2 left-2.5 inline-flex items-center gap-1.5 rounded-full bg-emerald-500/20 border border-emerald-400/50 px-2 py-0.5 text-[9px] uppercase tracking-widest text-emerald-200">
                        <span className="h-1.5 w-1.5 rounded-full bg-emerald-400 animate-pulse" /> {tr("Live")}
                      </div>
                      <div className="absolute bottom-2 left-3 right-3">
                        <div className="font-bold text-sm truncate drop-shadow" style={{ color: "#fff" }}>{c.title}</div>
                        <div className="flex items-center justify-between text-[11px]">
                          <span className="text-white/70">{c.game} · {tr("ends")} {timeAgo(c.endAt).replace(" ago", "")}</span>
                          <span className="font-bold" style={{ color: theme.accent2 }}>{p.currentPoints} {tr("pts")}</span>
                        </div>
                      </div>
                    </div>
                  </Link>
                );
              })}
            </div>
          </section>
        );
      // B111. "Recent posts" was here. The section key stays in the layout
        // type so a saved profile layout that still lists it does not break —
        // it simply renders nothing, which is what it should have done for
        // anybody with no posts anyway.
      case "activity":
        return null;
      case "spaces":
        if (!S.spaces || spaceRows.length === 0) return null;
        return (
          <section key={key}>
            <h2 className="text-lg font-bold mb-3 flex items-center gap-2" style={{ color: theme.text }}><Icon name="planet" size={19} style={{ color: theme.accent }} /> {poss} {tr("planets")}</h2>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
              {spaceRows.map(({ s }) => {
                const cover = slimImg(s.game ? gameCover.get(s.game) ?? null : null);
                return (
                  <Link key={s.id} href={`/planets/${s.slug}`} className="relative block h-20 overflow-hidden rounded-xl group" style={{ border: `1px solid color-mix(in srgb, ${theme.accent} 25%, transparent)` }}>
                    {cover ? (
                      <div className="absolute inset-0 bg-cover bg-center transition-transform duration-500 group-hover:scale-110" style={{ backgroundImage: `url(${optImg(cover, 1200)})` }} />
                    ) : (
                      <div className="absolute inset-0" style={{ background: `linear-gradient(120deg, ${theme.accent}55, ${theme.accent2}33)` }} />
                    )}
                    <div className="absolute inset-0" style={{ background: "linear-gradient(to top, rgba(4,5,26,0.9), rgba(4,5,26,0.15))" }} />
                    <div className="absolute bottom-2 left-3 right-3 font-bold text-sm truncate text-white drop-shadow">{s.name}</div>
                  </Link>
                );
              })}
            </div>
          </section>
        );
      case "quests":
        if (!S.quests || profileQuests.length === 0) return null;
        return (
          <section key={key}>
            <div className="flex flex-wrap items-center gap-2 mb-3">
              <Icon name="trophy" size={16} style={{ color: theme.accent }} />
              <h2 className="text-lg font-bold" style={{ color: theme.text }}>{poss} {tr("quests progress")}</h2>
              {/* Gamer's TOTAL Cluster Points across all quests */}
              <span className="inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-sm font-bold" style={{ background: `color-mix(in srgb, ${theme.accent2} 18%, transparent)`, color: theme.accent2 }}>
                <CpIcon size={18} /> {profileQuests.reduce((s, q) => s + q.totalCp, 0).toLocaleString()} {tr("total CP")}
              </span>
              <Link href="/quests" className="text-xs p-muted hover:underline ml-auto">{tr("Leaderboard →")}</Link>
            </div>
            {/* Completed-quest badges (icon ×N) */}
            {profileQuests.some((q) => q.completions > 0) && (
              <div className="flex flex-wrap gap-2 mb-4">
                {profileQuests.filter((q) => q.completions > 0).map((q) => (
                  <span key={q.id} className="inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-bold" style={{ borderColor: `${q.color}66`, background: `${q.color}1a`, color: q.color }} title={`${q.name} completed ${q.completions}×`}>
                    {q.logoUrl ? /* eslint-disable-next-line @next/next/no-img-element */ <img src={q.logoUrl} alt="" className="h-5 w-5 object-contain" /> : <Icon name="trophy" size={13} />} {q.name} ×{q.completions}
                  </span>
                ))}
              </div>
            )}
            <div className="grid sm:grid-cols-2 gap-4">
              {profileQuests.map((q) => <QuestCard key={q.id} quest={q} />)}
            </div>
          </section>
        );
      default: return null;
    }
  };

  return (
    <div
      className={`profile-root ${theme.bgImage ? "has-bg-image" : ""}`}
      style={{ ...vars, background: theme.bgImage ? "transparent" : theme.bg, minHeight: "100vh" }}
    >
      {/* Fixed background layer — smooth scroll (no background-attachment:fixed repaint) */}
      {theme.bgImage && <div aria-hidden className="fixed inset-0 -z-10" style={bgLayerStyle(theme)} />}

      {adminView && (
        <div className="bg-amber-500/15 border-b border-amber-400/40 text-amber-200 text-sm text-center py-2 px-4">
          <Icon name="shield" size={14} className="inline mr-1.5" /> {tr("Admin view —")} <Link href={`/admin/users/${user.id}`} className="underline">{tr("manage this user in Mission Control")}</Link>
        </div>
      )}

      {/* Cover — with the top ad banner overlaid ON the cover art (so no other
          background peeks out behind the ad) */}
      <div className="relative">
        <div className="bg-cover bg-center" style={{ ...coverStyle(theme, user.bannerUrl), height: theme.coverHeight }} />
        <div className="absolute inset-0" style={{ background: `linear-gradient(to bottom, transparent, ${theme.bg})` }} />
        <div className="absolute top-0 inset-x-0 z-10 mx-auto max-w-5xl px-4 pt-3"><AdSlot placement="top_banner" /></div>
      </div>

      <div className="mx-auto max-w-5xl px-4 relative" style={{ marginTop: -Math.round(theme.avatarSize * 0.42) }}>
        <div className="flex flex-col items-center text-center sm:flex-row sm:flex-wrap sm:items-end sm:text-left gap-4 sm:gap-5">
          <div className="relative shrink-0">
            <div className="overflow-hidden border-2" style={{ borderColor: theme.accent, width: `min(${theme.avatarSize}px, 38vw)`, height: `min(${theme.avatarSize}px, 38vw)`, borderRadius: avatarClip(theme.avatarShape) ? 0 : (theme.avatarShape === "circle" ? "9999px" : theme.avatarShape === "rounded" ? "22%" : "10%"), clipPath: avatarClip(theme.avatarShape), WebkitClipPath: avatarClip(theme.avatarShape) }}>
              <Avatar name={user.displayName} src={user.avatarUrl} size={theme.avatarSize} className="!rounded-none !h-full !w-full" />
            </div>
            {/* Player-level badge — game-card identity */}
            <span className="absolute -bottom-1.5 -right-1.5 flex h-8 min-w-8 items-center justify-center rounded-full border-4 px-1.5 text-sm font-black text-white shadow-lg"
              style={{ background: `linear-gradient(135deg, ${theme.accent}, ${theme.accent2})`, borderColor: theme.bg }}
              title={`Level ${plvl.level}`}>
              {plvl.level}
            </span>
          </div>
          <div className="min-w-0 w-full sm:flex-1 sm:w-auto pb-1">
            <h1 className="text-2xl sm:text-3xl md:text-4xl font-bold flex items-center justify-center sm:justify-start gap-2 flex-wrap break-words" style={{ color: theme.text }}>
              {user.displayName}
              {user.country && <Flag code={user.country} className="text-2xl sm:text-3xl" title={user.country} />}
              {/* B96. The confirmed mark — gold at 18+, blue under it, and
                  nothing at all when the gamer has switched it off. It never
                  writes an age out; see lib/verified-mark.ts. */}
              <VerifiedMarkIcon mark={markFor(user)} size={22} />
            </h1>
            {user.title && <div className="text-base sm:text-lg font-semibold p-grad">{user.title}</div>}
            {user.discordUsername && <div className="mt-1.5 flex justify-center sm:justify-start"><DiscordTag username={user.discordUsername} size="md" /></div>}
            <div className="flex items-center justify-center sm:justify-start gap-2 text-xs sm:text-sm p-muted mt-1.5">
              <span className="truncate">clustergg.com/u/{user.slug}</span><CopyLinkButton path={`/u/${user.slug}`} />
            </div>
            {/* XP bar — level progress toward the next level */}
            <div className="mt-2.5 max-w-xs mx-auto sm:mx-0">
              <div className="flex items-center justify-between text-[10px] font-bold mb-1">
                <span style={{ color: theme.accent2 }}>{tr("Level")} {plvl.level}</span>
                <span className="p-muted">{plvl.into.toLocaleString()} / <Cp amount={plvl.span} /></span>
              </div>
              <div className="h-2 rounded-full overflow-hidden" style={{ background: "rgba(255,255,255,0.10)" }}>
                <div className="h-full rounded-full transition-[width] duration-500" style={{ width: `${Math.max(5, plvl.pct)}%`, background: `linear-gradient(90deg, ${theme.accent}, ${theme.accent2})` }} />
              </div>
            </div>
          </div>
          <div className="flex gap-3 pb-1 w-full sm:w-auto justify-center">
            {isOwner ? (
              <Link href="/profile" className={`p-btn p-btn-${theme.buttonStyle}`}><Icon name="edit" size={14} /> {tr("Customize")}</Link>
            ) : viewer ? (
              <>
                <FollowButton targetUserId={user.id} isFollowing={isFollowingRow.length > 0} path={`/u/${user.slug}`} />
                {/* Right next to Follow, and weighted the same — a vote is the
                    cheapest thing a visitor can give, and the only one that
                    feeds the Best Profile board. */}
                <VoteButton
                  variant="button"
                  buttonStyle={theme.buttonStyle === "neon" ? "glass" : "outline"}
                  slug={user.slug}
                  votes={user.voteCount ?? 0} weekVotes={weekVotes}
                  voted={alreadyVoted}
                  canVote={viewer.id !== user.id}
                  mine={viewer.id === user.id}
                  accent={theme.accent}
                />
                <form action={startConversation.bind(null, user.id)}><button className={`p-btn p-btn-${theme.buttonStyle === "neon" ? "glass" : "outline"}`}><Icon name="message" size={14} /> {tr("Message")}</button></form>
              </>
            ) : (
              <>
                <Link href="/signup" className={`p-btn p-btn-${theme.buttonStyle}`}>{tr("Join to follow")}</Link>
                <VoteButton
                  variant="button" buttonStyle="outline"
                  slug={user.slug} votes={user.voteCount ?? 0} weekVotes={weekVotes} voted={false}
                  canVote={false} mine={false} accent={theme.accent}
                />
              </>
            )}
          </div>
        </div>

        {user.bio && <p className="mt-4 max-w-2xl" style={{ color: theme.muted }}>{user.bio}</p>}
        <div className="flex flex-wrap gap-6 mt-4 text-sm">
          <Link href={`/u/${user.slug}/followers`} style={{ color: theme.text }}><b>{Number(followerRow?.c ?? 0)}</b> <span className="p-muted">{tr("followers")}</span></Link>
          <Link href={`/u/${user.slug}/following`} style={{ color: theme.text }}><b>{Number(followingRow?.c ?? 0)}</b> <span className="p-muted">{tr("following")}</span></Link>
          <span style={{ color: theme.text }} title="Profile views"><Icon name="eye" size={14} className="inline mr-1" style={{ color: theme.accent2 }} /><b>{viewCount.toLocaleString()}</b> <span className="p-muted">{tr("views")}</span></span>
          {/* Votes sit right beside views — the two brag numbers together. */}
          <span style={{ color: theme.text }}>
            <VoteButton
              slug={user.slug}
              votes={user.voteCount ?? 0} weekVotes={weekVotes}
              voted={alreadyVoted}
              canVote={!!viewer && viewer.id !== user.id}
              mine={viewer?.id === user.id}
              accent={theme.accent}
            />
          </span>
          {bestStanding && S.standings && <span style={{ color: theme.accent }}><Icon name="chart" size={14} className="inline mr-1" /> {tr("Top")} {Math.max(1, Math.round((bestStanding.rank / bestStanding.total) * 100))}% · {bestStanding.title}</span>}
        </div>

        <div className="mt-8 space-y-10 pb-16">
          {theme.order.map((key) => {
            const node = sectionNode(key);
            if (!node) return null;
            const art = theme.sectionArt?.[key];
            // A gamer can set a background image per section; it renders as an
            // art-backed panel (with a readability overlay) behind the content.
            return art
              ? <div key={key} className="rounded-2xl p-4 sm:p-6" style={{ ...sectionArtStyle(theme, key), border: `1px solid color-mix(in srgb, ${theme.accent} 22%, transparent)` }}>{node}</div>
              : node;
          })}
        </div>
      </div>

      {/* Platform ad — kept subtle at the very bottom, outside themed content */}
      <div className="mx-auto max-w-5xl px-4 pb-10"><AdSlot placement="profile_footer_banner" /></div>
    </div>
  );
}
