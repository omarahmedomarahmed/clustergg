"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import Icon from "@/components/Icon";
import Avatar from "@/components/Avatar";
import GameLogo from "@/components/GameLogo";
import CpIcon from "@/components/CpIcon";
import { useTr } from "@/components/LocaleProvider";
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

export default function FeedControlPanel({
  me, accounts, statValues, games, prefs, theme,
}: {
  me: PanelMe; accounts: PanelAccount[]; statValues: Record<string, number>;
  activeChallenges: PanelChallenge[]; games: PanelGame[]; prefs: PanelPrefs;
  theme?: { accent?: string; accent2?: string; coverUrl?: string | null };
}) {
  const tr = useTr();
  const accent = theme?.accent || "#22d3ee";
  const accent2 = theme?.accent2 || "#8b5cf6";
  const coverUrl = theme?.coverUrl ?? me.bannerUrl;
  const [editing, setEditing] = useState(false);
  const [stats, setStats] = useState<string[]>(prefs.stats.length ? prefs.stats : DEFAULT_STATS);
  const [openAcct, setOpenAcct] = useState<string | null>(null);
  const [connectOpen, setConnectOpen] = useState(false);
  const [pending, startTransition] = useTransition();

  const toggle = (arr: string[], set: (v: string[]) => void, key: string) =>
    set(arr.includes(key) ? arr.filter((k) => k !== key) : [...arr, key]);

  const save = () => {
    startTransition(async () => {
      await saveFeedPrefs(JSON.stringify({ stats }));
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
          <Icon name={editing ? "x" : "edit"} size={13} /> {editing ? tr("Done") : tr("Customize panel")}
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
            <button onClick={() => setConnectOpen((v) => !v)} className="glow-btn pressable rounded-full px-4 py-2 text-xs font-semibold text-white inline-flex items-center gap-1.5"><Icon name="link" size={13} /> {tr("Connect")}</button>
            <Link href={`/u/${me.slug}`} className="ghost-btn pressable rounded-full px-4 py-2 text-xs inline-flex items-center gap-1.5"><Icon name="eye" size={13} /> {tr("Profile")}</Link>
          </div>
        </div>

        {/* Stat tiles */}
        <div className="mt-4">
          {editing && (
            <div className="mb-2 flex flex-wrap gap-1.5">
              {STAT_CATALOG.map((s) => (
                <button key={s.key} onClick={() => toggle(stats, setStats, s.key)}
                  className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[11px] font-semibold transition-colors ${stats.includes(s.key) ? "border-cyan-400/60 bg-cyan-500/15 text-cyan-200" : "border-white/12 text-muted hover:border-white/30"}`}>
                  {stats.includes(s.key) ? <Icon name="check" size={11} /> : <Icon name="plus" size={11} />} {tr(s.label)}
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
                  <div className="text-[10px] uppercase tracking-widest text-muted truncate">{tr(s.label)}</div>
                </Link>
              );
            })}
          </div>
        </div>

        {/* Connected accounts — expand in place (no navigation) */}
        <div className="mt-5">
          <div className="text-[11px] uppercase tracking-widest text-muted mb-2">{tr("Connected accounts")}</div>
          <div className="flex flex-wrap gap-2.5">
            {accounts.map((a) => {
              const open = openAcct === a.id;
              return (
                <div key={a.id} className={`relative overflow-hidden rounded-xl border transition-colors ${open ? "w-full border-cyan-400/40" : "w-44 border-white/10 hover:border-cyan-400/40"}`}>
                  {a.coverUrl ? (
                    /* eslint-disable-next-line @next/next/no-img-element */
                    <img src={a.coverUrl} alt="" className="absolute inset-0 h-full w-full object-cover opacity-40" />
                  ) : (
                    <span aria-hidden className="absolute inset-0" style={{ background: `linear-gradient(120deg, ${accent2}33, ${accent}22)` }} />
                  )}
                  <span aria-hidden className="absolute inset-0 bg-gradient-to-t from-[#0a0a1c] via-[#0a0a1c]/75 to-[#0a0a1c]/30" />
                  <button onClick={() => setOpenAcct(open ? null : a.id)} className="relative w-full flex items-center gap-2 p-2.5 text-left">
                    <GameLogo logoUrl={a.logoUrl} name={a.gameName ?? a.providerName} size={30} rounded="rounded-lg" className="ring-1 ring-white/20" />
                    <div className="min-w-0 flex-1">
                      <div className="text-xs font-bold truncate">{a.inGameName}</div>
                      <div className="text-[10px] text-muted truncate">{a.gameName ?? a.providerName}{a.region ? ` · ${a.region}` : ""}</div>
                    </div>
                    <Icon name={open ? "chevronDown" : "chevronRight"} size={13} className="text-muted shrink-0" />
                  </button>
                  {open && (
                    <div className="relative border-t border-white/10 p-3 text-xs text-muted space-y-1">
                      <div>{tr("Game")}: <b className="text-ink">{a.gameName ?? a.providerName}</b></div>
                      <div>{tr("In-game name")}: <b className="text-ink">{a.inGameName}</b></div>
                      {a.region && <div>{tr("Region")}: <b className="text-ink">{a.region}</b></div>}
                      <div className="pt-1.5 flex gap-2">
                        <Link href="/profile" className="inline-flex items-center gap-1 text-cyan-300 hover:underline"><Icon name="settings" size={11} /> {tr("Manage")}</Link>
                        {a.gameName && <Link href="/planets" className="inline-flex items-center gap-1 text-cyan-300 hover:underline"><Icon name="planet" size={11} /> {tr("Planet")}</Link>}
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
            {/* Inline connect — opens the picker in place, no navigation to a new page first */}
            <button onClick={() => setConnectOpen((v) => !v)}
              className="w-28 flex flex-col items-center justify-center gap-1 rounded-xl border border-dashed border-white/15 text-muted hover:border-cyan-400/40 hover:text-cyan-300 transition-colors py-3">
              <Icon name={connectOpen ? "chevronDown" : "plus"} size={16} /> <span className="text-[10px]">{tr("Connect game")}</span>
            </button>
          </div>

          {connectOpen && (
            <div className="mt-2.5 rounded-xl border border-cyan-400/25 bg-black/25 p-3">
              <div className="text-[11px] text-muted mb-2">{tr("Pick a game to connect — you'll link your account on the next step.")}</div>
              <div className="flex flex-wrap gap-2">
                {games.map((g) => (
                  <Link key={g.name} href={g.slug ? `/planets/${g.slug}` : "/profile"} title={`Connect ${g.name}`}
                    className="group relative flex items-center gap-1.5 rounded-lg border border-white/10 px-2.5 py-1.5 hover:border-cyan-400/40">
                    <GameLogo logoUrl={g.logoUrl} name={g.name} size={20} rounded="rounded-md" className="ring-1 ring-white/15" />
                    <span className="text-[11px] font-semibold">{g.name}</span>
                  </Link>
                ))}
                <Link href="/profile" className="inline-flex items-center gap-1.5 rounded-lg border border-cyan-400/30 bg-cyan-500/10 px-2.5 py-1.5 text-[11px] font-semibold text-cyan-200">
                  <Icon name="arrowRight" size={12} /> {tr("All providers")}
                </Link>
              </div>
            </div>
          )}
        </div>

        {editing && (
          <div className="mt-4 flex justify-end">
            <button onClick={save} disabled={pending}
              className="glow-btn pressable rounded-full px-6 py-2 text-sm font-semibold text-white inline-flex items-center gap-2 disabled:opacity-60">
              <Icon name="check" size={14} /> {pending ? tr("Saving…") : tr("Save panel")}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
