"use client";

import { useMemo, useState, useTransition } from "react";
import Link from "next/link";
import Icon from "@/components/Icon";
import Avatar from "@/components/Avatar";
import GameLogo from "@/components/GameLogo";
import CpIcon from "@/components/CpIcon";
import { saveFeedPrefs } from "@/app/actions/social";

export type PanelAccount = {
  id: string; provider: string; providerName: string; inGameName: string;
  region: string | null; gameName: string | null; logoUrl: string | null; coverUrl: string | null;
};
export type PanelChallenge = {
  id: string; title: string; game: string; coverUrl: string | null; logoUrl: string | null;
  endAt: string; planetSlug: string | null; joined: boolean; myRank: number | null;
};
export type PanelGame = { name: string; slug: string | null; logoUrl: string | null; coverUrl: string | null };
export type PanelMe = { displayName: string; slug: string; avatarUrl: string | null; bannerUrl: string | null; title: string | null };
export type PanelPrefs = { stats: string[]; challenges: string[]; leaderboards: string[] };

// Every stat tile the gamer can pin to their control panel. `cp` renders the CP
// coin icon; the rest use a lucide glyph.
const STAT_CATALOG: { key: string; label: string; icon: string; href: (slug: string) => string }[] = [
  { key: "cp", label: "Cluster Points", icon: "spark", href: () => "/quests" },
  { key: "quests", label: "Quest badges", icon: "trophy", href: () => "/quests" },
  { key: "followers", label: "Followers", icon: "users", href: (s) => `/u/${s}/followers` },
  { key: "following", label: "Following", icon: "users", href: (s) => `/u/${s}/following` },
  { key: "views", label: "Profile views", icon: "eye", href: (s) => `/u/${s}` },
  { key: "games", label: "Games linked", icon: "gamepad", href: () => "/profile" },
  { key: "challenges", label: "Challenges joined", icon: "zap", href: () => "/planets" },
  { key: "posts", label: "Posts", icon: "message", href: (s) => `/u/${s}` },
];
const DEFAULT_STATS = ["cp", "quests", "followers", "games"];

function timeLeft(iso: string): string {
  const ms = new Date(iso).getTime() - Date.now();
  if (ms <= 0) return "ended";
  const d = Math.floor(ms / 86400000), h = Math.floor((ms % 86400000) / 3600000);
  if (d > 0) return `${d}d ${h}h`;
  const m = Math.floor((ms % 3600000) / 60000);
  return h > 0 ? `${h}h ${m}m` : `${m}m`;
}

export default function FeedControlPanel({
  me, accounts, statValues, activeChallenges, games, prefs, theme,
}: {
  me: PanelMe; accounts: PanelAccount[]; statValues: Record<string, number>;
  activeChallenges: PanelChallenge[]; games: PanelGame[]; prefs: PanelPrefs;
  theme?: { accent?: string; accent2?: string; coverUrl?: string | null };
}) {
  const accent = theme?.accent || "#22d3ee";
  const accent2 = theme?.accent2 || "#8b5cf6";
  const coverUrl = theme?.coverUrl ?? me.bannerUrl;
  const [editing, setEditing] = useState(false);
  const [stats, setStats] = useState<string[]>(prefs.stats.length ? prefs.stats : DEFAULT_STATS);
  const [followedCh, setFollowedCh] = useState<string[]>(prefs.challenges ?? []);
  const [followedLb, setFollowedLb] = useState<string[]>(prefs.leaderboards ?? []);
  const [pending, startTransition] = useTransition();

  const chById = useMemo(() => new Map(activeChallenges.map((c) => [c.id, c])), [activeChallenges]);
  const gameByName = useMemo(() => new Map(games.map((g) => [g.name, g])), [games]);
  const shownChallenges = followedCh.map((id) => chById.get(id)).filter(Boolean) as PanelChallenge[];
  const shownLeaderboards = followedLb.map((n) => gameByName.get(n)).filter(Boolean) as PanelGame[];

  const toggle = (arr: string[], set: (v: string[]) => void, key: string) =>
    set(arr.includes(key) ? arr.filter((k) => k !== key) : [...arr, key]);

  const save = () => {
    startTransition(async () => {
      await saveFeedPrefs(JSON.stringify({ stats, challenges: followedCh, leaderboards: followedLb }));
      setEditing(false);
    });
  };

  return (
    <div className="glass relative overflow-hidden mb-6">
      {/* Cover banner (the gamer's own profile cover) */}
      <div className="relative h-28 md:h-32">
        {coverUrl ? (
          /* eslint-disable-next-line @next/next/no-img-element */
          <img src={coverUrl} alt="" className="absolute inset-0 h-full w-full object-cover" />
        ) : (
          <div className="absolute inset-0" style={{ background: `radial-gradient(120% 140% at 15% 0%, ${accent2}55, transparent 60%), radial-gradient(120% 140% at 100% 100%, ${accent}44, transparent 60%), #0a0a1c` }} />
        )}
        <div className="absolute inset-0 bg-gradient-to-t from-[#0a0a1c] via-[#0a0a1c]/40 to-transparent" />
        <button onClick={() => setEditing((v) => !v)}
          className="absolute top-3 right-3 inline-flex items-center gap-1.5 rounded-full border border-white/20 bg-black/50 backdrop-blur px-3 py-1.5 text-xs font-semibold text-white hover:border-cyan-400/50 transition-colors">
          <Icon name={editing ? "x" : "edit"} size={13} /> {editing ? "Done" : "Customize panel"}
        </button>
      </div>

      <div className="px-5 md:px-6 pb-5 -mt-10 relative">
        {/* Identity row */}
        <div className="flex items-end gap-4">
          <Avatar name={me.displayName} src={me.avatarUrl} size={72} className="ring-4 ring-[#0a0a1c] rounded-2xl" />
          <div className="min-w-0 flex-1 pb-1">
            <h1 className="text-xl md:text-2xl font-bold truncate">{me.displayName}</h1>
            {me.title && <p className="text-xs font-semibold truncate" style={{ color: accent }}>{me.title}</p>}
          </div>
          <div className="hidden sm:flex flex-wrap gap-2 pb-1">
            <Link href="/profile" className="glow-btn pressable rounded-full px-4 py-2 text-xs font-semibold text-white inline-flex items-center gap-1.5"><Icon name="link" size={13} /> Connect</Link>
            <Link href={`/u/${me.slug}`} className="ghost-btn pressable rounded-full px-4 py-2 text-xs inline-flex items-center gap-1.5"><Icon name="eye" size={13} /> Profile</Link>
          </div>
        </div>

        {/* Stat tiles */}
        <div className="mt-4">
          {editing && (
            <div className="mb-2 flex flex-wrap gap-1.5">
              {STAT_CATALOG.map((s) => (
                <button key={s.key} onClick={() => toggle(stats, setStats, s.key)}
                  className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[11px] font-semibold transition-colors ${stats.includes(s.key) ? "border-cyan-400/60 bg-cyan-500/15 text-cyan-200" : "border-white/12 text-muted hover:border-white/30"}`}>
                  {stats.includes(s.key) ? <Icon name="check" size={11} /> : <Icon name="plus" size={11} />} {s.label}
                </button>
              ))}
            </div>
          )}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
            {stats.map((key) => {
              const s = STAT_CATALOG.find((x) => x.key === key);
              if (!s) return null;
              return (
                <Link key={key} href={s.href(me.slug)} className="rounded-xl border border-violet-400/15 bg-black/25 p-3 text-center hover:border-violet-400/40 transition-colors">
                  <div className="mx-auto mb-1 flex items-center justify-center h-4">
                    {key === "cp" ? <CpIcon size={16} /> : <Icon name={s.icon} size={15} style={{ color: accent }} />}
                  </div>
                  <div className="text-lg font-bold">{(statValues[key] ?? 0).toLocaleString()}</div>
                  <div className="text-[10px] uppercase tracking-widest text-muted truncate">{s.label}</div>
                </Link>
              );
            })}
          </div>
        </div>

        {/* Connected accounts — cards with the game's cover art */}
        {accounts.length > 0 && (
          <div className="mt-5">
            <div className="text-[11px] uppercase tracking-widest text-muted mb-2">Connected accounts</div>
            <div className="flex gap-2.5 overflow-x-auto pb-1 -mx-1 px-1">
              {accounts.map((a) => (
                <Link key={a.id} href="/profile" className="group relative shrink-0 w-44 overflow-hidden rounded-xl border border-white/10 hover:border-cyan-400/40 transition-colors">
                  {a.coverUrl ? (
                    /* eslint-disable-next-line @next/next/no-img-element */
                    <img src={a.coverUrl} alt="" className="absolute inset-0 h-full w-full object-cover opacity-40 group-hover:opacity-55 transition-opacity" />
                  ) : (
                    <span aria-hidden className="absolute inset-0" style={{ background: "linear-gradient(120deg, #8b5cf633, #22d3ee22)" }} />
                  )}
                  <span aria-hidden className="absolute inset-0 bg-gradient-to-t from-[#0a0a1c] via-[#0a0a1c]/70 to-transparent" />
                  <div className="relative flex items-center gap-2 p-2.5">
                    <GameLogo logoUrl={a.logoUrl} name={a.gameName ?? a.providerName} size={30} rounded="rounded-lg" className="ring-1 ring-white/20" />
                    <div className="min-w-0">
                      <div className="text-xs font-bold truncate">{a.inGameName}</div>
                      <div className="text-[10px] text-muted truncate">{a.gameName ?? a.providerName}{a.region ? ` · ${a.region}` : ""}</div>
                    </div>
                  </div>
                </Link>
              ))}
              <Link href="/profile" className="shrink-0 w-28 flex flex-col items-center justify-center gap-1 rounded-xl border border-dashed border-white/15 text-muted hover:border-cyan-400/40 hover:text-cyan-300 transition-colors">
                <Icon name="plus" size={16} /> <span className="text-[10px]">Add game</span>
              </Link>
            </div>
          </div>
        )}

        {/* Followed challenges + leaderboards */}
        <div className="mt-5 grid md:grid-cols-2 gap-4">
          {/* Challenges */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <span className="text-[11px] uppercase tracking-widest text-muted inline-flex items-center gap-1.5"><Icon name="zap" size={12} className="text-amber-300" /> Followed challenges</span>
            </div>
            {editing ? (
              <div className="space-y-1.5 max-h-52 overflow-y-auto pr-1">
                {activeChallenges.length === 0 && <p className="text-[11px] text-muted">No live challenges to follow yet.</p>}
                {activeChallenges.map((c) => (
                  <button key={c.id} onClick={() => toggle(followedCh, setFollowedCh, c.id)}
                    className={`flex w-full items-center gap-2 rounded-lg border px-2 py-1.5 text-left transition-colors ${followedCh.includes(c.id) ? "border-amber-400/50 bg-amber-500/10" : "border-white/10 hover:border-white/25"}`}>
                    <Icon name={followedCh.includes(c.id) ? "check" : "plus"} size={12} className={followedCh.includes(c.id) ? "text-amber-300" : "text-muted"} />
                    <span className="min-w-0 flex-1">
                      <span className="block text-xs font-semibold truncate">{c.title}</span>
                      <span className="block text-[10px] text-muted truncate">{c.game} · ends {timeLeft(c.endAt)}</span>
                    </span>
                  </button>
                ))}
              </div>
            ) : shownChallenges.length === 0 ? (
              <p className="text-[11px] text-muted">Tap <b>Customize panel</b> to follow live challenges.</p>
            ) : (
              <div className="space-y-2">
                {shownChallenges.map((c) => (
                  <Link key={c.id} href={c.planetSlug ? `/planets/${c.planetSlug}/challenges/${c.id}` : "/planets"}
                    className="group relative flex items-center gap-2.5 overflow-hidden rounded-xl border border-white/10 p-2.5 hover:border-amber-400/40 transition-colors">
                    {c.coverUrl && /* eslint-disable-next-line @next/next/no-img-element */ <img src={c.coverUrl} alt="" className="absolute inset-0 h-full w-full object-cover opacity-30" />}
                    <span aria-hidden className="absolute inset-0 bg-gradient-to-r from-[#0a0a1c] via-[#0a0a1c]/75 to-[#0a0a1c]/40" />
                    <span className="relative flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-amber-500/15 ring-1 ring-amber-400/30"><Icon name="zap" size={14} className="text-amber-300" /></span>
                    <span className="relative min-w-0 flex-1">
                      <span className="block text-xs font-bold truncate">{c.title}</span>
                      <span className="block text-[10px] text-muted">{c.game} · ends {timeLeft(c.endAt)}{c.joined && c.myRank ? ` · you're #${c.myRank}` : ""}</span>
                    </span>
                    {c.joined && <span className="relative shrink-0 text-[9px] font-bold uppercase text-emerald-300">In</span>}
                  </Link>
                ))}
              </div>
            )}
          </div>

          {/* Leaderboards */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <span className="text-[11px] uppercase tracking-widest text-muted inline-flex items-center gap-1.5"><Icon name="chart" size={12} className="text-cyan-300" /> Followed leaderboards</span>
            </div>
            {editing ? (
              <div className="space-y-1.5 max-h-52 overflow-y-auto pr-1">
                {games.length === 0 && <p className="text-[11px] text-muted">No game leaderboards yet.</p>}
                {games.map((g) => (
                  <button key={g.name} onClick={() => toggle(followedLb, setFollowedLb, g.name)}
                    className={`flex w-full items-center gap-2 rounded-lg border px-2 py-1.5 text-left transition-colors ${followedLb.includes(g.name) ? "border-cyan-400/50 bg-cyan-500/10" : "border-white/10 hover:border-white/25"}`}>
                    <Icon name={followedLb.includes(g.name) ? "check" : "plus"} size={12} className={followedLb.includes(g.name) ? "text-cyan-300" : "text-muted"} />
                    <GameLogo logoUrl={g.logoUrl} name={g.name} size={22} rounded="rounded-md" className="ring-1 ring-white/15" />
                    <span className="text-xs font-semibold truncate flex-1">{g.name}</span>
                  </button>
                ))}
              </div>
            ) : shownLeaderboards.length === 0 ? (
              <p className="text-[11px] text-muted">Tap <b>Customize panel</b> to follow game leaderboards.</p>
            ) : (
              <div className="space-y-2">
                {shownLeaderboards.map((g) => (
                  <Link key={g.name} href={g.slug ? `/planets/${g.slug}` : `/leaderboards?game=${encodeURIComponent(g.name)}`}
                    className="group relative flex items-center gap-2.5 overflow-hidden rounded-xl border border-white/10 p-2.5 hover:border-cyan-400/40 transition-colors">
                    {g.coverUrl && /* eslint-disable-next-line @next/next/no-img-element */ <img src={g.coverUrl} alt="" className="absolute inset-0 h-full w-full object-cover opacity-30" />}
                    <span aria-hidden className="absolute inset-0 bg-gradient-to-r from-[#0a0a1c] via-[#0a0a1c]/75 to-[#0a0a1c]/40" />
                    <GameLogo logoUrl={g.logoUrl} name={g.name} size={30} rounded="rounded-lg" className="relative ring-1 ring-white/20" />
                    <span className="relative min-w-0 flex-1">
                      <span className="block text-xs font-bold truncate">{g.name}</span>
                      <span className="block text-[10px] text-muted">View leaderboard →</span>
                    </span>
                    <Icon name="chart" size={14} className="relative text-cyan-300 shrink-0" />
                  </Link>
                ))}
              </div>
            )}
          </div>
        </div>

        {editing && (
          <div className="mt-4 flex justify-end">
            <button onClick={save} disabled={pending}
              className="glow-btn pressable rounded-full px-6 py-2 text-sm font-semibold text-white inline-flex items-center gap-2 disabled:opacity-60">
              <Icon name="check" size={14} /> {pending ? "Saving…" : "Save panel"}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
