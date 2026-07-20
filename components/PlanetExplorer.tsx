"use client";

import { useEffect, useMemo, useRef, useState, useCallback } from "react";
import Link from "next/link";
import Icon from "@/components/Icon";
import Avatar from "@/components/Avatar";
import GameLogo from "@/components/GameLogo";
import TopBannerAd from "@/components/TopBannerAd";
import LolCard from "@/components/LolCard";
import EntityImg from "@/components/EntityImg";
import CoverImage from "@/components/CoverImage";
import Countdown from "@/components/Countdown";
import { ChallengeLog } from "@/components/ChallengeLog";
import { slimImg } from "@/lib/img";
import type { PlanetData } from "@/components/PlanetHero";
import type { RegionStat } from "@/lib/regions";
import type { PlanetExplore, ExploreBoard, ChampBoard, ExploreEntry } from "@/lib/planet-explore";
import { normalizeHeroLayout, type HeroModule } from "@/lib/hero-layout";
import type { EntityLite, EntityDetail } from "@/lib/game-entities";

const COL = { accent: "#22d3ee", accent2: "#a78bfa", text: "#e8eaf6", muted: "#9aa0c3", panel: "#0b0d26" };

type GamerSel = { slug: string; name: string; avatar: string | null; accountId: string | null; provider: string | null; sub?: string; challengeId?: string; challengeTitle?: string };
type Sel =
  | { kind: "board"; metricKey: string }
  | { kind: "champ"; championId: number }
  | { kind: "challenge"; id: string }
  | { kind: "region"; region: RegionStat }
  | { kind: "gamer"; g: GamerSel }
  | { kind: "entity"; entityKind: string; id: string; name: string; image: string }
  | { kind: "directory"; entityKind: string }
  | null;

// The interactive planet explorer: a floating globe with a leaderboards rail on
// the left, challenges + region players on the right, and a middle stage where
// ANYTHING clicked (a board, a champion, a challenge, a region, a gamer) opens
// in place — with an in-place refresh. Games toggle sits on top so the sides of
// the globe stay free. Works on a planet page (fixed planet) and the landing
// hero (switch planets, lazy-loading each). Modules with no data are hidden, so
// the same layout fits every game.
export default function PlanetExplorer({
  planets, initialSlug, initial, swap = false, heading, toggle, compact = false,
}: {
  planets: PlanetData[];
  initialSlug: string;
  initial: PlanetExplore | null;
  swap?: boolean;
  heading?: string;
  toggle?: React.ReactNode;
  compact?: boolean;   // feed teaser: single-column so a narrow container looks right
}) {
  const start = Math.max(0, planets.findIndex((x) => x.slug === initialSlug));
  const [idx, setIdx] = useState(start);
  const p = planets[idx] ?? planets[0];
  const [data, setData] = useState<PlanetExplore | null>(initial);
  const [loading, setLoading] = useState(false);
  const [sel, setSel] = useState<Sel>(null);
  const [tilt, setTilt] = useState({ x: 0, y: 0 });
  const [zoom, setZoom] = useState(false);
  const frame = useRef<HTMLDivElement>(null);

  const load = useCallback(async (slug: string) => {
    setLoading(true);
    try {
      const r = await fetch(`/api/planet/explore?slug=${encodeURIComponent(slug)}`, { cache: "no-store" });
      if (r.ok) setData(await r.json());
    } catch { /* keep old */ }
    setLoading(false);
  }, []);

  // Home/feed heroes render without server data — lazy-load the first planet.
  useEffect(() => { if (!initial && p?.slug) load(p.slug); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, []);

  // In swap mode (landing), switching planets lazy-loads that planet's data.
  const pickPlanet = (i: number) => {
    setIdx(i); setSel(null);
    const slug = planets[i]?.slug;
    if (swap && slug && slug !== data?.slug) load(slug);
  };
  const refresh = () => data && load(data.slug);

  function onMove(e: React.MouseEvent) {
    const el = frame.current; if (!el) return;
    const r = el.getBoundingClientRect();
    const dx = (e.clientX - (r.left + r.width / 2)) / (r.width / 2);
    const dy = (e.clientY - (r.top + r.height / 2)) / (r.height / 2);
    setTilt({ x: Math.max(-1, Math.min(1, dx)), y: Math.max(-1, Math.min(1, dy)) });
  }

  const openGamer = (g: GamerSel) => setSel({ kind: "gamer", g });
  const boards = data?.boards ?? [];
  const champBoards = data?.championBoards ?? [];
  const challenges = data?.challenges ?? [];
  const game = data?.game ?? null;
  // Region players come from the globe's real server-code regions (p.regions) —
  // the same data that positions the pins — so counts + players always match.
  const regions = (p?.regions ?? []).filter((r) => r.count > 0);
  // Memoize so module ids stay STABLE across the frequent re-renders the globe's
  // mousemove causes — otherwise the sidebar modules remount every frame and the
  // entity rail flickers as it re-fetches.
  const layout = useMemo(() => normalizeHeroLayout(data?.heroLayout), [data?.heroLayout]);
  const middleBg = data?.bgUrl || p?.bgUrl || p?.coverUrl || null;

  // Render one admin-configured sidebar module. Modules with no data return null
  // so the same layout gracefully fits every game.
  const renderModule = (m: HeroModule): React.ReactNode => {
    switch (m.kind) {
      case "leaderboards": {
        const list = m.limit ? boards.slice(0, m.limit) : boards;
        if (list.length === 0) return null;
        return <RailGroup key={m.id} icon="chart" title="Leaderboards">{list.map((b) => <BoardMini key={b.metricKey} board={b} onTitle={() => setSel({ kind: "board", metricKey: b.metricKey })} onGamer={openGamer} />)}</RailGroup>;
      }
      case "board": {
        const b = boards.find((x) => x.metricKey === m.metricKey);
        if (!b) return null;
        return <RailGroup key={m.id} icon="chart" title={shortTitle(b.title)}><BoardMini board={b} onTitle={() => setSel({ kind: "board", metricKey: b.metricKey })} onGamer={openGamer} /></RailGroup>;
      }
      case "champions": {
        const list = m.limit ? champBoards.slice(0, m.limit) : champBoards;
        if (list.length === 0) return null;
        return <RailGroup key={m.id} icon="swords" title="Champion mastery"><ChampList boards={list} onOpen={(id) => setSel({ kind: "champ", championId: id })} /></RailGroup>;
      }
      case "entities":
        if (!game) return null;
        return <EntityRail key={m.id} game={game} entityKind={m.entityKind ?? "all"} limit={m.limit ?? 10}
          onOpen={(e) => setSel({ kind: "entity", entityKind: e.kind, id: e.id, name: e.name, image: e.image })}
          onExpand={(k) => setSel({ kind: "directory", entityKind: k })} />;
      case "challenges":
        if (challenges.length === 0) return null;
        return (
          <RailGroup key={m.id} icon="zap" title="Challenges" accent="text-amber-200">
            <div className="space-y-2">
              {challenges.map((c) => (
                <button key={c.id} onClick={() => setSel({ kind: "challenge", id: c.id })} className="w-full text-left rounded-xl overflow-hidden relative border border-white/10 hover:border-cyan-400/40 transition">
                  <div className="h-14 relative">
                    {c.coverUrl ? <div className="absolute inset-0 bg-cover bg-center" style={{ backgroundImage: `url(${slimImg(c.coverUrl, 300000)})` }} /> : <div className="absolute inset-0" style={{ background: `linear-gradient(120deg, ${p.accent}55, ${p.accent2}33)` }} />}
                    <div className="absolute inset-0" style={{ background: "linear-gradient(to top, rgba(4,5,26,0.92), rgba(4,5,26,0.2))" }} />
                    <div className="absolute bottom-1.5 left-2.5 right-2.5">
                      <div className="text-[9px] uppercase tracking-widest text-emerald-300 flex items-center gap-1">{c.status === "active" && <span className="h-1.5 w-1.5 rounded-full bg-emerald-400 animate-pulse" />} {c.status === "active" ? "Live" : "Ended"}</div>
                      <div className="text-sm font-bold truncate">{c.title}</div>
                    </div>
                  </div>
                </button>
              ))}
            </div>
          </RailGroup>
        );
      case "regions":
        if (regions.length === 0) return null;
        return (
          <RailGroup key={m.id} icon="users" title="Players by region">
            <div className="space-y-1">
              {regions.map((r) => (
                <button key={r.key} onClick={() => setSel({ kind: "region", region: r })} className="w-full flex items-center gap-2 rounded-lg px-2 py-1.5 hover:bg-white/5 text-left">
                  <span className="h-2.5 w-2.5 rounded-full shrink-0" style={{ background: r.color }} />
                  <span className="text-sm flex-1 truncate">{r.label}</span>
                  <span className="text-xs font-bold text-cyan-200">{r.count}</span>
                </button>
              ))}
            </div>
          </RailGroup>
        );
    }
  };
  const leftNodes = layout.left.map(renderModule).filter(Boolean);
  const rightNodes = layout.right.map(renderModule).filter(Boolean);

  return (
    <section className="relative overflow-hidden">
      {/* Background art */}
      <div className="absolute inset-0 -z-10" style={{ background: "#04051a" }} />
      {p.bgUrl ? (
        <div className="absolute inset-0 -z-10 bg-cover bg-center" style={{ backgroundImage: `linear-gradient(rgba(4,5,26,0.4), rgba(4,5,26,0.72)), url(${p.bgUrl})` }} />
      ) : (
        <div className="absolute inset-0 -z-10" style={{ background: `radial-gradient(1200px 620px at 50% 12%, ${p.accent}1f, transparent 60%), radial-gradient(900px 500px at 85% 110%, ${p.accent2}14, transparent 60%)` }} />
      )}

      <TopBannerAd className="pt-3" />
      {toggle && <div className="pt-4">{toggle}</div>}

      {/* ===== Games toggle on TOP (frees the sides of the globe) ===== */}
      {planets.length > 1 && (
        <div className="mx-auto max-w-6xl px-4 pt-4">
          <div className="flex gap-2 overflow-x-auto pb-1 justify-center [scrollbar-width:none]">
            {planets.map((pl, i) => {
              const active = i === idx;
              const cls = `shrink-0 inline-flex items-center gap-2 rounded-full px-3.5 py-1.5 text-sm font-semibold border transition ${active ? "text-white" : "text-muted border-violet-400/25 hover:text-ink"}`;
              const style = active ? { borderColor: `${pl.accent}aa`, background: `${pl.accent}22`, color: "#fff" } : undefined;
              const inner = <><GameLogo logoUrl={slimImg(pl.logoUrl, 300000)} name={pl.name} size={20} rounded="rounded-md" /> {pl.name}</>;
              return swap
                ? <button key={pl.slug} onClick={() => pickPlanet(i)} className={cls} style={style}>{inner}</button>
                : <Link key={pl.slug} href={`/planets/${pl.slug}`} className={cls} style={style}>{inner}</Link>;
            })}
          </div>
        </div>
      )}

      <div className="mx-auto max-w-7xl px-4 pt-4 pb-10">
        <div className="text-center mb-3">
          <div className="text-[11px] uppercase tracking-widest text-cyan-300 inline-flex items-center gap-1.5"><Icon name="planet" size={13} /> {heading ?? "Explore the planet"}</div>
          <h1 className="text-3xl md:text-5xl font-bold">{p.name}</h1>
        </div>

        {/* On the feed teaser (compact) the sidebars stack under a centered globe
            so a narrow column never squeezes the globe into a dot. On the planet
            page it's the full 3-zone management layout. */}
        {(() => {
        const globeBlock = (
          <div className="relative">
            <div
              ref={frame}
              className={`relative mx-auto aspect-square w-full select-none ${compact ? "max-w-[360px]" : "max-w-[520px]"}`}
              onMouseMove={onMove}
              onMouseLeave={() => { setTilt({ x: 0, y: 0 }); setZoom(false); }}
              onMouseEnter={() => setZoom(true)}
              style={{ perspective: "1200px" }}
            >
              <div className="absolute inset-0 rounded-full blur-3xl opacity-60" style={{ background: `radial-gradient(circle, transparent 52%, ${p.accent}33 62%, transparent 78%)` }} />
              <div className="relative h-full w-full float-y transition-transform duration-300"
                style={{ transform: `rotateY(${tilt.x * 7}deg) rotateX(${-tilt.y * 7}deg) scale(${zoom ? 1.03 : 1})`, transformStyle: "preserve-3d" }}>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={p.imageUrl} alt={`${p.name} planet`} className="h-full w-full rounded-full object-cover" />
                <div className="absolute inset-0 rounded-full pointer-events-none" style={{ boxShadow: "inset 0 0 70px 8px rgba(0,0,0,0.55)" }} />
                {/* region hotspots → open region in the middle */}
                {p.regions.map((r) => (
                  <button key={r.key} onClick={() => setSel({ kind: "region", region: r })} title={`${r.label} · ${r.count}`}
                    className="absolute -translate-x-1/2 -translate-y-1/2 group z-10" style={{ left: `${r.x}%`, top: `${r.y}%` }}>
                    <span className="block rounded-full transition-transform group-hover:scale-125" style={{ width: 13, height: 13, background: r.color, boxShadow: `0 0 12px 2px ${r.color}` }} />
                    {r.count > 0 && <span className="absolute inset-0 rounded-full animate-ping" style={{ background: `${r.color}66` }} />}
                  </button>
                ))}
              </div>

              {/* ===== Middle stage — anything clicked opens here ===== */}
              {sel && (
                <div className="absolute inset-0 z-30 flex items-center justify-center" onClick={() => setSel(null)}>
                  <div className="w-[min(100%,480px)] max-h-full overflow-y-auto rounded-2xl border border-white/15 backdrop-blur-xl shadow-2xl"
                    style={{ background: middleBg ? `linear-gradient(rgba(4,5,26,0.9), rgba(4,5,26,0.95)), url(${middleBg}) center/cover` : "rgba(4,5,26,0.94)" }}
                    onClick={(e) => e.stopPropagation()}>
                    <div className="flex items-center justify-between px-3 py-2 border-b border-white/10">
                      <span className="text-[11px] uppercase tracking-widest text-cyan-200">Details</span>
                      <div className="flex items-center gap-1">
                        <button onClick={refresh} title="Refresh" className="text-muted hover:text-cyan-300 p-1"><Icon name="satellite" size={13} className={loading ? "animate-spin" : ""} /></button>
                        <button onClick={() => setSel(null)} title="Close" className="text-muted hover:text-ink p-1"><Icon name="x" size={15} /></button>
                      </div>
                    </div>
                    <div className="p-3">
                      <Stage sel={sel} data={data} game={game} onGamer={openGamer} onOpenEntity={(e) => setSel({ kind: "entity", entityKind: e.kind, id: e.id, name: e.name, image: e.image })} onBack={() => setSel(null)} />
                    </div>
                  </div>
                </div>
              )}
            </div>

            {swap && (
              <div className="text-center mt-4">
                <Link href={`/planets/${p.slug}`} className="inline-flex items-center gap-2 glow-btn pressable rounded-full px-6 py-2.5 text-sm font-semibold text-white whitespace-nowrap">
                  Enter the {p.name} planet <Icon name="arrowRight" size={15} />
                </Link>
              </div>
            )}
          </div>
        );
        const panel = (nodes: React.ReactNode[]) => (
          <div className="rounded-2xl border border-white/10 bg-[#070826]/35 backdrop-blur-md p-3 space-y-4">{nodes}</div>
        );

        if (compact) {
          return (
            <div>
              <div className="mx-auto max-w-[440px]">{globeBlock}</div>
              {(leftNodes.length > 0 || rightNodes.length > 0) && (
                <div className="grid sm:grid-cols-2 gap-4 mt-6">
                  {leftNodes.length > 0 && panel(leftNodes)}
                  {rightNodes.length > 0 && panel(rightNodes)}
                </div>
              )}
            </div>
          );
        }
        return (
          <div className="grid gap-4 lg:grid-cols-[300px_1fr_300px] items-start">
            <aside className={`order-2 lg:order-1 ${leftNodes.length ? "" : "hidden lg:block"}`}>
              {leftNodes.length > 0 && panel(leftNodes)}
            </aside>
            <div className="order-1 lg:order-2">{globeBlock}</div>
            <aside className={`order-3 ${rightNodes.length ? "" : "hidden lg:block"}`}>
              {rightNodes.length > 0 && panel(rightNodes)}
            </aside>
          </div>
        );
        })()}
      </div>
    </section>
  );
}

// ===== middle stage renderer =====
function Stage({ sel, data, game, onGamer, onOpenEntity, onBack }: {
  sel: Sel; data: PlanetExplore | null; game: string | null;
  onGamer: (g: GamerSel) => void; onOpenEntity: (e: EntityLite) => void; onBack: () => void;
}) {
  if (!sel || !data) return null;

  if (sel.kind === "entity") return <EntityLoreCard game={game} kind={sel.entityKind} id={sel.id} name={sel.name} image={sel.image} />;
  if (sel.kind === "directory") return <MiddleDirectory game={game} entityKind={sel.entityKind} onOpen={onOpenEntity} />;

  if (sel.kind === "gamer") {
    const g = sel.g;
    return (
      <div>
        <div className="flex items-center gap-3 mb-3">
          <Avatar name={g.name} src={g.avatar} size={44} />
          <div className="min-w-0">
            <div className="font-bold truncate">{g.name}</div>
            {g.sub && <div className="text-xs text-muted truncate">{g.sub}</div>}
          </div>
          <Link href={`/u/${g.slug}`} className="ml-auto text-[11px] text-cyan-300 hover:underline shrink-0 inline-flex items-center gap-1">Profile <Icon name="arrowRight" size={11} /></Link>
        </div>
        {g.challengeId
          ? <ChallengeLog challengeId={g.challengeId} slug={g.slug} title={g.challengeTitle} />
          : g.provider === "riot-lol" && g.accountId
            ? <LolCard accountId={g.accountId} colors={COL} statNumbers={[]} />
            : <div className="text-xs text-muted">Open the full profile for this gamer&apos;s complete stats.</div>}
      </div>
    );
  }

  if (sel.kind === "board") {
    const b = data.boards.find((x) => x.metricKey === sel.metricKey);
    if (!b) return <Empty onBack={onBack} />;
    return (
      <div>
        <div className="text-sm font-bold mb-2 flex items-center gap-1.5"><Icon name="chart" size={14} className="text-cyan-300" /> {b.title}</div>
        <EntryList entries={b.entries} unit={b.unit} onGamer={onGamer} />
      </div>
    );
  }

  if (sel.kind === "champ") {
    const c = data.championBoards.find((x) => x.championId === sel.championId);
    if (!c) return <Empty onBack={onBack} />;
    return (
      <div className="relative -m-3">
        <div className="absolute inset-0 bg-cover bg-center rounded-2xl" style={{ backgroundImage: `linear-gradient(rgba(4,5,26,0.78), rgba(4,5,26,0.94)), url(${c.splashUrl})` }} />
        <div className="relative p-3">
          <div className="flex items-center gap-2.5 mb-3">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={c.iconUrl} alt="" className="h-12 w-12 rounded-lg border border-white/20" />
            <div><div className="font-bold">{c.name}</div><div className="text-[11px] text-muted">Mastery leaderboard · {c.entries.length} gamer{c.entries.length === 1 ? "" : "s"}</div></div>
          </div>
          <div className="space-y-1">
            {c.entries.map((e) => (
              <button key={e.slug} onClick={() => onGamer({ slug: e.slug, name: e.name, avatar: e.avatar, accountId: e.accountId, provider: "riot-lol", sub: `Mastery ${e.level} · ${e.points.toLocaleString()} pts` })}
                className="w-full flex items-center gap-2 rounded-lg px-2 py-1.5 hover:bg-white/5 text-left">
                <span className="w-5 text-center text-xs font-bold text-muted">{e.rank}</span>
                <Avatar name={e.name} src={e.avatar} size={26} />
                <span className="flex-1 truncate text-sm">{e.name}</span>
                <span className="text-xs font-bold text-cyan-200">{e.points.toLocaleString()}</span>
              </button>
            ))}
          </div>
        </div>
      </div>
    );
  }

  if (sel.kind === "challenge") {
    const c = data.challenges.find((x) => x.id === sel.id);
    if (!c) return <Empty onBack={onBack} />;
    const active = c.status === "active";
    return (
      <div className="-m-3">
        <CoverImage src={c.coverUrl} name={c.title} kind="challenge" heightClass="h-40" rounded="rounded-t-2xl" padded={false}>
          <div className="absolute inset-0" style={{ background: "linear-gradient(to top, rgba(4,5,26,0.96), rgba(4,5,26,0.15) 62%, transparent)" }} />
          <div className="absolute bottom-2 left-3 right-3">
            <div className="text-[10px] uppercase tracking-widest flex items-center gap-1.5" style={{ color: active ? "#6ee7b7" : "#9aa0c3" }}>
              {active && <span className="h-1.5 w-1.5 rounded-full bg-emerald-400 animate-pulse" />} {active ? "Live now" : "Ended"}
            </div>
            <div className="text-lg font-bold drop-shadow leading-tight">{c.title}</div>
          </div>
        </CoverImage>
        <div className="p-3 space-y-3">
          <div className="grid grid-cols-2 gap-2">
            <div className="rounded-lg border border-white/10 bg-black/25 p-2">
              <div className="text-[9px] uppercase tracking-widest text-muted flex items-center gap-1"><Icon name="clock" size={10} /> {active ? "Ends in" : "Status"}</div>
              <div className="text-sm font-bold text-amber-200">{active ? <Countdown endsAt={c.endAt} /> : "Ended"}</div>
            </div>
            <div className="rounded-lg border border-white/10 bg-black/25 p-2">
              <div className="text-[9px] uppercase tracking-widest text-muted flex items-center gap-1"><Icon name="clock" size={10} /> Window</div>
              <div className="text-[11px] leading-tight">{fmtDateTime(c.startAt)}<br /><span className="text-muted">→ {fmtDateTime(c.endAt)}</span></div>
            </div>
          </div>
          <div>
            <div className="text-[10px] uppercase tracking-widest text-cyan-200 mb-1 flex items-center gap-1"><Icon name="target" size={11} /> How to win</div>
            {c.description && <p className="text-[12px] text-white/85 leading-relaxed mb-1.5 whitespace-pre-line">{c.description}</p>}
            <div className="text-[11px] text-white/70">{winCondition(c.format, c.conditions)}</div>
          </div>
          {c.prize && <div className="rounded-lg border border-amber-400/25 bg-amber-500/[0.06] p-2 text-[11px]"><span className="text-amber-200 font-semibold inline-flex items-center gap-1"><Icon name="trophy" size={11} /> Prize:</span> {c.prize}</div>}
          <div>
            <div className="text-[10px] uppercase tracking-widest text-cyan-200 mb-1">Top standings</div>
            {c.top.length === 0 ? <div className="text-xs text-muted">No competitors yet — be the first to join.</div> : (
              <div className="space-y-1">
                {c.top.map((e, i) => (
                  <button key={e.slug} onClick={() => onGamer({ slug: e.slug, name: e.name, avatar: e.avatar, accountId: null, provider: null, sub: `${e.points} pts`, challengeId: c.id, challengeTitle: c.title })} className="w-full flex items-center gap-2 rounded-lg px-2 py-1.5 hover:bg-white/5 text-left">
                    <span className="w-5 text-center text-xs font-bold text-muted">{i + 1}</span>
                    <Avatar name={e.name} src={e.avatar} size={26} />
                    <span className="flex-1 truncate text-sm">{e.name}</span>
                    <span className="text-xs font-bold text-cyan-200">{e.points} pts</span>
                  </button>
                ))}
              </div>
            )}
          </div>
          <Link href={`/planets/${data.slug}/challenges/${c.id}`} className="inline-flex items-center gap-1 text-[11px] text-cyan-300 hover:underline">Full challenge page <Icon name="arrowRight" size={11} /></Link>
        </div>
      </div>
    );
  }

  // region — from the globe's real server-code data (sel.region)
  const r = sel.region;
  return (
    <div>
      <div className="text-sm font-bold mb-1 flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-full" style={{ background: r.color }} /> {r.label}</div>
      <div className="text-[11px] text-muted mb-2">{r.count} gamer{r.count === 1 ? "" : "s"} in this region</div>
      {r.gamers.length === 0 ? <div className="text-xs text-muted">No profiles to show here yet.</div> : (
        <div className="space-y-1">
          {r.gamers.map((g) => (
            <button key={g.slug} onClick={() => onGamer({ slug: g.slug, name: g.name, avatar: g.avatar ?? null, accountId: g.accountId ?? null, provider: g.provider ?? null, sub: g.ign })} className="w-full flex items-center gap-2 rounded-lg px-2 py-1.5 hover:bg-white/5 text-left">
              <Avatar name={g.name} src={g.avatar ?? null} size={26} />
              <span className="flex-1 min-w-0"><span className="block truncate text-sm">{g.name}</span>{g.ign && <span className="block truncate text-[10px] text-cyan-200/80">{g.ign}</span>}</span>
              <Icon name="chevronRight" size={13} className="text-muted shrink-0" />
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

function EntryList({ entries, unit, onGamer }: { entries: ExploreEntry[]; unit: string | null; onGamer: (g: GamerSel) => void }) {
  if (entries.length === 0) return <div className="text-xs text-muted">No ranked gamers yet.</div>;
  return (
    <div className="space-y-1">
      {entries.map((e) => (
        <button key={`${e.slug}-${e.rank}`} onClick={() => onGamer({ slug: e.slug, name: e.name, avatar: e.avatar, accountId: e.accountId, provider: e.provider, sub: e.rankLabel ?? undefined })}
          className="w-full flex items-center gap-2 rounded-lg px-2 py-1.5 hover:bg-white/5 text-left">
          <span className="w-5 text-center text-xs font-bold text-muted">{e.rank}</span>
          <Avatar name={e.name} src={e.avatar} size={26} />
          <span className="flex-1 truncate text-sm">{e.name}</span>
          <span className="text-xs font-bold text-cyan-200">{e.rankLabel ?? e.value.toLocaleString()}{unit && !e.rankLabel ? ` ${unit}` : ""}</span>
        </button>
      ))}
    </div>
  );
}

function BoardMini({ board, onTitle, onGamer }: { board: ExploreBoard; onTitle: () => void; onGamer: (g: GamerSel) => void }) {
  return (
    <div className="mb-2 rounded-xl border border-white/8 p-2">
      <button onClick={onTitle} className="w-full flex items-center justify-between text-left mb-1">
        <span className="text-xs font-bold truncate">{shortTitle(board.title)}</span>
        <Icon name="arrowRight" size={12} className="text-muted shrink-0" />
      </button>
      {board.entries.slice(0, 3).map((e) => (
        <button key={`${e.slug}-${e.rank}`} onClick={() => onGamer({ slug: e.slug, name: e.name, avatar: e.avatar, accountId: e.accountId, provider: e.provider, sub: e.rankLabel ?? undefined })}
          className="w-full flex items-center gap-2 rounded-md px-1 py-1 hover:bg-white/5 text-left">
          <span className="w-4 text-center text-[10px] font-bold text-muted">{e.rank}</span>
          <Avatar name={e.name} src={e.avatar} size={22} />
          <span className="flex-1 truncate text-[12px]">{e.name}</span>
          <span className="text-[11px] font-bold text-cyan-200">{e.rankLabel ?? e.value.toLocaleString()}</span>
        </button>
      ))}
    </div>
  );
}

function ChampList({ boards, onOpen }: { boards: ChampBoard[]; onOpen: (id: number) => void }) {
  return (
    <div className="grid grid-cols-2 gap-2">
      {boards.map((c) => (
        <button key={c.championId} onClick={() => onOpen(c.championId)} className="relative rounded-xl overflow-hidden border border-white/10 hover:border-cyan-400/50 transition text-left">
          <div className="h-16 bg-cover bg-center" style={{ backgroundImage: `url(${c.splashUrl})` }} />
          <div className="absolute inset-0" style={{ background: "linear-gradient(to top, rgba(4,5,26,0.92), transparent)" }} />
          <div className="absolute bottom-1 left-2 right-2 flex items-center gap-1.5">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={c.iconUrl} alt="" className="h-6 w-6 rounded" />
            <div className="min-w-0"><div className="text-[11px] font-bold truncate">{c.name}</div><div className="text-[9px] text-muted">{c.entries.length} gamer{c.entries.length === 1 ? "" : "s"}</div></div>
          </div>
        </button>
      ))}
    </div>
  );
}

function MiniChip({ on, onClick, children }: { on: boolean; onClick: () => void; children: React.ReactNode }) {
  return <button onClick={onClick} className={`rounded-full px-2 py-0.5 text-[10px] font-semibold border transition ${on ? "border-cyan-400/50 bg-cyan-500/10 text-cyan-200" : "border-white/12 text-muted hover:text-ink"}`}>{children}</button>;
}

function RailGroup({ icon, title, accent, children }: { icon: string; title: string; accent?: string; children: React.ReactNode }) {
  return (
    <div>
      <div className={`text-xs font-bold uppercase tracking-widest mb-2 flex items-center gap-1.5 ${accent ?? "text-cyan-200"}`}><Icon name={icon} size={13} /> {title}</div>
      {children}
    </div>
  );
}

const entityLabel = (k: string) => k === "weapon" ? "Weapons" : k === "agent" ? "Agents" : k === "hero" ? "Heroes" : k === "champion" ? "Champions" : k === "outfit" ? "Outfits" : k === "legend" ? "Legends" : k === "map" ? "Maps" : "Game world";
const entityImgCls = (k: string) => k === "weapon" ? "object-contain p-1 bg-black/30" : "object-cover";

// The game-world rail: entities (champions/agents/weapons/heroes) as big art
// tiles — limited (default 10), searchable, filterable by role/lane, scrollable.
// Click a tile → lore card in the middle; "See all" → full directory in middle.
function EntityRail({ game, entityKind, limit, onOpen, onExpand }: { game: string; entityKind: string; limit: number; onOpen: (e: EntityLite) => void; onExpand: (k: string) => void }) {
  const [list, setList] = useState<EntityLite[] | null>(null);
  const [q, setQ] = useState("");
  const [role, setRole] = useState("all");
  useEffect(() => {
    let alive = true;
    fetch(`/api/planet/entities?game=${encodeURIComponent(game)}`, { cache: "force-cache" })
      .then((r) => r.json()).then((j) => { if (alive) setList((j.entities ?? []).filter((e: EntityLite) => entityKind === "all" || e.kind === entityKind)); })
      .catch(() => alive && setList([]));
    return () => { alive = false; };
  }, [game, entityKind]);
  if (list && list.length === 0) return null;
  const roles = [...new Set((list ?? []).map((e) => e.role).filter(Boolean) as string[])].slice(0, 8);
  const filtered = (list ?? []).filter((e) => (role === "all" || e.role === role) && (!q || e.name.toLowerCase().includes(q.toLowerCase())));
  const shown = filtered.slice(0, limit);
  return (
    <RailGroup icon="swords" title={entityLabel(entityKind)} accent="text-violet-200">
      {!list ? <div className="text-xs text-muted animate-pulse">Loading…</div> : (
        <>
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder={`Search ${list.length}…`} className="w-full rounded-lg border border-white/12 bg-black/30 px-2.5 py-1.5 text-xs outline-none focus:border-cyan-400/50 mb-2" />
          {roles.length > 1 && (
            <div className="flex flex-wrap gap-1 mb-2">
              <MiniChip on={role === "all"} onClick={() => setRole("all")}>All</MiniChip>
              {roles.map((r) => <MiniChip key={r} on={role === r} onClick={() => setRole(r)}>{r}</MiniChip>)}
            </div>
          )}
          <div className="grid grid-cols-3 gap-1.5 max-h-[210px] overflow-y-auto pr-0.5 overscroll-contain">
            {shown.map((e) => (
              <button key={`${e.kind}-${e.id}`} onClick={() => onOpen(e)} title={e.name} style={{ containerType: "size" }} className="relative rounded-lg overflow-hidden border border-white/10 hover:border-cyan-400/50 transition aspect-square">
                <EntityImg src={e.image} name={e.name} kind={e.kind} className={`h-full w-full ${entityImgCls(e.kind)}`} />
                <span className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-[#04051a] to-transparent text-[9px] font-bold px-1 pb-0.5 pt-2 truncate">{e.name}</span>
              </button>
            ))}
          </div>
          <button onClick={() => onExpand(entityKind)} className="mt-1.5 w-full text-left text-[11px] text-cyan-300 hover:underline">See all {filtered.length} →</button>
        </>
      )}
    </RailGroup>
  );
}

// The lore card shown in the middle when an entity is clicked: a big splash/
// portrait COVER that stays pinned at the top while you scroll, with the same
// art faintly filling the card background. Clicking a skin swaps the cover +
// background in place (no image popup).
function EntityLoreCard({ game, kind, id, name, image }: { game: string | null; kind: string; id: string; name: string; image: string }) {
  const [d, setD] = useState<EntityDetail | null>(null);
  const [cover, setCover] = useState<string | null>(null);
  useEffect(() => {
    if (!game) return; let alive = true; setCover(null);
    fetch(`/api/planet/entity?game=${encodeURIComponent(game)}&kind=${kind}&id=${encodeURIComponent(id)}`, { cache: "force-cache" })
      .then((r) => (r.ok ? r.json() : null)).then((j) => { if (alive) setD(j); }).catch(() => {});
    return () => { alive = false; };
  }, [game, kind, id]);
  const splash = cover || d?.splash || image;
  const contain = kind === "weapon";
  return (
    <div className="relative -m-3 rounded-2xl overflow-hidden">
      {/* Faint splash filling the whole card background */}
      <div className="absolute inset-0 bg-cover bg-center" style={{ backgroundImage: `linear-gradient(rgba(4,5,26,0.82), rgba(4,5,26,0.94)), url(${splash})` }} />
      {/* Persistent COVER pinned to the top while the body scrolls — shows the
          FULL art (contain) over a blurred fill so nothing is ever cropped. */}
      <div className="sticky top-0 z-10">
        <div className="relative h-40 sm:h-52 bg-[#04051a]" style={{ containerType: "size" }}>
          {splash && <div className="absolute inset-0 bg-cover bg-center scale-125 blur-2xl opacity-45" style={{ backgroundImage: `url(${splash})` }} />}
          <EntityImg src={splash} name={name} kind={kind} className={`absolute inset-0 h-full w-full object-contain ${contain ? "p-3" : "p-1"}`} />
          <div className="absolute inset-0" style={{ background: "linear-gradient(to top, #04051a, rgba(4,5,26,0.15) 55%, transparent)" }} />
          <div className="absolute bottom-2 left-3 right-3">
            <div className="text-xl font-bold drop-shadow">{name}</div>
            {d?.role && <div className="text-[11px] text-cyan-200">{d.role}</div>}
          </div>
        </div>
      </div>
      <div className="relative p-3">
        {!d ? <div className="text-xs text-muted animate-pulse">Loading lore…</div> : (
          <>
            {/* Skin selector — tap a skin to repaint the cover + background */}
            {d.skins.length > 0 && (
              <div className="mb-3">
                <div className="text-[10px] uppercase tracking-widest text-white/60 mb-1.5">{d.skins.length} skin{d.skins.length === 1 ? "" : "s"} · tap to set the cover</div>
                <div className="flex gap-2 overflow-x-auto pb-1 -mx-1 px-1">
                  <button onClick={() => setCover(null)} className={`shrink-0 rounded-lg border px-2.5 py-1 text-[11px] font-semibold ${!cover ? "border-cyan-400 text-cyan-200" : "border-white/12 text-muted hover:text-ink"}`}>Default</button>
                  {d.skins.map((s, i) => (
                    <button key={i} onClick={() => setCover(s.image)} title={s.name} className={`shrink-0 w-24 text-left rounded-lg overflow-hidden border transition ${cover === s.image ? "border-cyan-400" : "border-white/10 hover:border-cyan-400/50"}`}>
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src={s.image} alt={s.name} loading="lazy" className={`h-12 w-24 ${contain ? "object-contain bg-black/40 p-1" : "object-cover"}`} onError={(ev) => { ((ev.currentTarget.closest("button")) as HTMLElement).style.display = "none"; }} />
                      <div className="text-[9px] text-white/70 truncate px-1 py-0.5">{s.name}</div>
                    </button>
                  ))}
                </div>
              </div>
            )}
            {d.meta.filter((m) => m.value).length > 0 && <div className="flex flex-wrap gap-1.5 mb-2">{d.meta.filter((m) => m.value).map((m) => <span key={m.label} className="rounded-full border border-white/12 bg-black/30 px-2 py-0.5 text-[10px]"><span className="text-muted">{m.label}:</span> <b>{m.value}</b></span>)}</div>}
            {d.lore && <p className="text-[13px] text-white/85 leading-relaxed mb-2 whitespace-pre-line">{d.lore}</p>}
            {d.abilities.length > 0 && <div className="space-y-1.5">{d.abilities.map((ab, i) => (<div key={i} className="flex gap-2">{ab.icon && /* eslint-disable-next-line @next/next/no-img-element */ <img src={ab.icon} alt="" className="h-7 w-7 rounded shrink-0 bg-black/40" onError={(ev) => { (ev.currentTarget as HTMLImageElement).style.display = "none"; }} />}<div className="min-w-0"><div className="text-xs font-semibold">{ab.name}</div>{ab.desc && <div className="text-[11px] text-white/60 line-clamp-2">{ab.desc}</div>}</div></div>))}</div>}
            {!d.lore && d.abilities.length === 0 && d.skins.length === 0 && <p className="text-xs text-white/60">No lore available yet.</p>}
          </>
        )}
      </div>
    </div>
  );
}

// The full game-world directory expanded into the middle stage.
function MiddleDirectory({ game, entityKind, onOpen }: { game: string | null; entityKind: string; onOpen: (e: EntityLite) => void }) {
  const [list, setList] = useState<EntityLite[] | null>(null);
  const [q, setQ] = useState("");
  useEffect(() => {
    if (!game) { setList([]); return; } let alive = true;
    fetch(`/api/planet/entities?game=${encodeURIComponent(game)}`, { cache: "force-cache" })
      .then((r) => r.json()).then((j) => { if (alive) setList((j.entities ?? []).filter((e: EntityLite) => entityKind === "all" || e.kind === entityKind)); })
      .catch(() => alive && setList([]));
    return () => { alive = false; };
  }, [game, entityKind]);
  if (!list) return <div className="text-xs text-muted animate-pulse">Loading…</div>;
  const shown = list.filter((e) => !q || e.name.toLowerCase().includes(q.toLowerCase()));
  return (
    <div>
      <div className="text-sm font-bold mb-2">{entityLabel(entityKind)} · {list.length}</div>
      <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search…" className="w-full rounded-lg border border-white/12 bg-black/30 px-2.5 py-1.5 text-xs outline-none focus:border-cyan-400/50 mb-2" />
      <div className="grid grid-cols-4 gap-1.5 max-h-[320px] overflow-y-auto overscroll-contain">
        {shown.map((e) => (
          <button key={`${e.kind}-${e.id}`} onClick={() => onOpen(e)} title={e.name} style={{ containerType: "size" }} className="relative rounded-lg overflow-hidden border border-white/10 hover:border-cyan-400/50 aspect-square">
            <EntityImg src={e.image} name={e.name} kind={e.kind} className={`h-full w-full ${entityImgCls(e.kind)}`} />
            <span className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-[#04051a] to-transparent text-[9px] font-bold px-1 pb-0.5 pt-2 truncate">{e.name}</span>
          </button>
        ))}
      </div>
    </div>
  );
}
function Empty({ onBack }: { onBack: () => void }) {
  return <div className="text-xs text-muted">Not available. <button onClick={onBack} className="text-cyan-300 underline">Close</button></div>;
}
function shortTitle(t: string) { return t.split("·")[1]?.trim() ?? t; }

function fmtDateTime(iso: string): string {
  try { return new Date(iso).toLocaleString(undefined, { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" }); } catch { return ""; }
}
const OP_LABEL: Record<string, string> = { ">=": "reach", ">": "exceed", "<=": "stay under", "<": "drop below", "==": "hit", "=": "hit" };
function winCondition(format: string, conditions: { metric: string; op: string; value: number }[]): string {
  const base = format === "top1" ? "Finish #1 on the challenge leaderboard." : format === "threshold_race" ? "Be first to reach the target." : "Finish in the top 3 of the challenge leaderboard.";
  if (!conditions || conditions.length === 0) return base;
  const parts = conditions.map((c) => `${OP_LABEL[c.op] ?? c.op} ${Number(c.value).toLocaleString()} ${c.metric.replace(/_/g, " ")}`);
  return `${base} Scoring: ${parts.join(", ")}.`;
}
