"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import Link from "next/link";
import Icon from "@/components/Icon";
import Avatar from "@/components/Avatar";
import GameLogo from "@/components/GameLogo";
import TopBannerAd from "@/components/TopBannerAd";
import LolCard from "@/components/LolCard";
import { slimImg } from "@/lib/img";
import type { PlanetData } from "@/components/PlanetHero";
import type { RegionStat } from "@/lib/regions";
import type { PlanetExplore, ExploreBoard, ChampBoard, ExploreEntry } from "@/lib/planet-explore";

const COL = { accent: "#22d3ee", accent2: "#a78bfa", text: "#e8eaf6", muted: "#9aa0c3", panel: "#0b0d26" };

type GamerSel = { slug: string; name: string; avatar: string | null; accountId: string | null; provider: string | null; sub?: string; challengeId?: string; challengeTitle?: string };
type Sel =
  | { kind: "board"; metricKey: string }
  | { kind: "champ"; championId: number }
  | { kind: "challenge"; id: string }
  | { kind: "region"; region: RegionStat }
  | { kind: "gamer"; g: GamerSel }
  | null;

// The interactive planet explorer: a floating globe with a leaderboards rail on
// the left, challenges + region players on the right, and a middle stage where
// ANYTHING clicked (a board, a champion, a challenge, a region, a gamer) opens
// in place — with an in-place refresh. Games toggle sits on top so the sides of
// the globe stay free. Works on a planet page (fixed planet) and the landing
// hero (switch planets, lazy-loading each). Modules with no data are hidden, so
// the same layout fits every game.
export default function PlanetExplorer({
  planets, initialSlug, initial, swap = false, heading, toggle,
}: {
  planets: PlanetData[];
  initialSlug: string;
  initial: PlanetExplore | null;
  swap?: boolean;
  heading?: string;
  toggle?: React.ReactNode;
}) {
  const start = Math.max(0, planets.findIndex((x) => x.slug === initialSlug));
  const [idx, setIdx] = useState(start);
  const p = planets[idx] ?? planets[0];
  const [data, setData] = useState<PlanetExplore | null>(initial);
  const [loading, setLoading] = useState(false);
  const [sel, setSel] = useState<Sel>(null);
  const [filter, setFilter] = useState<string>("all"); // "all" | metricKey | "champions"
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
    setIdx(i); setSel(null); setFilter("all");
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
  // Region players come from the globe's real server-code regions (p.regions) —
  // the same data that positions the pins — so counts + players always match.
  const regions = (p?.regions ?? []).filter((r) => r.count > 0);
  const hasLeft = boards.length > 0 || champBoards.length > 0;
  const hasRight = challenges.length > 0 || regions.length > 0;

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

        {/* 3-zone layout: leaderboards | globe+stage | challenges/players */}
        <div className="grid gap-4 lg:grid-cols-[300px_1fr_300px] items-start">
          {/* ---- LEFT: leaderboards ---- */}
          <aside className={`order-2 lg:order-1 ${hasLeft ? "" : "hidden lg:block"}`}>
            {hasLeft ? (
              <div className="glass p-3 lg:sticky lg:top-20 max-h-[calc(100vh-6rem)] overflow-y-auto overscroll-contain">
                <div className="text-xs font-bold uppercase tracking-widest text-cyan-200 mb-2 flex items-center gap-1.5"><Icon name="chart" size={13} /> Leaderboards</div>
                {/* metric filter */}
                <div className="flex flex-wrap gap-1 mb-3">
                  <FilterChip on={filter === "all"} onClick={() => setFilter("all")}>All</FilterChip>
                  {boards.map((b) => <FilterChip key={b.metricKey} on={filter === b.metricKey} onClick={() => setFilter(b.metricKey)}>{shortTitle(b.title)}</FilterChip>)}
                  {champBoards.length > 0 && <FilterChip on={filter === "champions"} onClick={() => setFilter("champions")}>Champions</FilterChip>}
                </div>
                {filter === "champions" ? (
                  <ChampList boards={champBoards} onOpen={(id) => setSel({ kind: "champ", championId: id })} />
                ) : (
                  (filter === "all" ? boards : boards.filter((b) => b.metricKey === filter)).map((b) => (
                    <BoardMini key={b.metricKey} board={b} onTitle={() => setSel({ kind: "board", metricKey: b.metricKey })} onGamer={openGamer} />
                  ))
                )}
                {filter === "all" && champBoards.length > 0 && (
                  <button onClick={() => setFilter("champions")} className="mt-1 w-full text-left text-[11px] text-cyan-300 hover:underline">Browse {champBoards.length} champion board{champBoards.length === 1 ? "" : "s"} →</button>
                )}
              </div>
            ) : <div />}
          </aside>

          {/* ---- CENTER: globe + stage ---- */}
          <div className="order-1 lg:order-2 relative">
            <div
              ref={frame}
              className="relative mx-auto aspect-square w-full max-w-[520px] select-none"
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
                  <div className="w-[min(100%,460px)] max-h-full overflow-y-auto rounded-2xl border border-white/15 backdrop-blur-xl shadow-2xl"
                    style={{ background: (p.bgUrl || p.coverUrl) ? `linear-gradient(rgba(4,5,26,0.9), rgba(4,5,26,0.95)), url(${p.bgUrl || p.coverUrl}) center/cover` : "rgba(4,5,26,0.94)" }}
                    onClick={(e) => e.stopPropagation()}>
                    <div className="flex items-center justify-between px-3 py-2 border-b border-white/10">
                      <span className="text-[11px] uppercase tracking-widest text-cyan-200">Details</span>
                      <div className="flex items-center gap-1">
                        <button onClick={refresh} title="Refresh" className="text-muted hover:text-cyan-300 p-1"><Icon name="satellite" size={13} className={loading ? "animate-spin" : ""} /></button>
                        <button onClick={() => setSel(null)} title="Close" className="text-muted hover:text-ink p-1"><Icon name="x" size={15} /></button>
                      </div>
                    </div>
                    <div className="p-3">
                      <Stage sel={sel} data={data} onGamer={openGamer} onBack={() => setSel(null)} />
                    </div>
                  </div>
                </div>
              )}
            </div>

            {swap && (
              <div className="text-center mt-4">
                <Link href={`/planets/${p.slug}`} className="inline-flex items-center gap-2 glow-btn pressable rounded-full px-6 py-2.5 text-sm font-semibold text-white">
                  Enter the {p.name} planet <Icon name="arrowRight" size={15} />
                </Link>
              </div>
            )}
          </div>

          {/* ---- RIGHT: challenges + region players ---- */}
          <aside className={`order-3 ${hasRight ? "" : "hidden lg:block"}`}>
            {hasRight ? (
              <div className="glass p-3 lg:sticky lg:top-20 max-h-[calc(100vh-6rem)] overflow-y-auto overscroll-contain space-y-4">
                {challenges.length > 0 && (
                  <div>
                    <div className="text-xs font-bold uppercase tracking-widest text-amber-200 mb-2 flex items-center gap-1.5"><Icon name="zap" size={13} /> Challenges</div>
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
                  </div>
                )}
                {regions.length > 0 && (
                  <div>
                    <div className="text-xs font-bold uppercase tracking-widest text-cyan-200 mb-2 flex items-center gap-1.5"><Icon name="users" size={13} /> Players by region</div>
                    <div className="space-y-1">
                      {regions.map((r) => (
                        <button key={r.key} onClick={() => setSel({ kind: "region", region: r })} className="w-full flex items-center gap-2 rounded-lg px-2 py-1.5 hover:bg-white/5 text-left">
                          <span className="h-2.5 w-2.5 rounded-full shrink-0" style={{ background: r.color }} />
                          <span className="text-sm flex-1 truncate">{r.label}</span>
                          <span className="text-xs font-bold text-cyan-200">{r.count}</span>
                        </button>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            ) : <div />}
          </aside>
        </div>
      </div>
    </section>
  );
}

// ===== middle stage renderer =====
function Stage({ sel, data, onGamer, onBack }: { sel: Sel; data: PlanetExplore | null; onGamer: (g: GamerSel) => void; onBack: () => void }) {
  if (!sel || !data) return null;

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
    return (
      <div>
        {c.coverUrl && <div className="h-24 -m-3 mb-2 bg-cover bg-center rounded-t-2xl" style={{ backgroundImage: `linear-gradient(to top, rgba(4,5,26,0.9), rgba(4,5,26,0.2)), url(${slimImg(c.coverUrl, 400000)})` }} />}
        <div className="text-sm font-bold mb-1 flex items-center gap-1.5"><Icon name="zap" size={14} className="text-amber-300" /> {c.title}</div>
        <div className="text-[11px] text-muted mb-2">{c.status === "active" ? "Live now" : "Ended"} · top standings</div>
        {c.top.length === 0 ? <div className="text-xs text-muted">No competitors yet.</div> : (
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
        <Link href={`/planets/${data.slug}/challenges/${c.id}`} className="mt-2 inline-flex items-center gap-1 text-[11px] text-cyan-300 hover:underline">Full challenge <Icon name="arrowRight" size={11} /></Link>
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
            <button key={g.slug} onClick={() => onGamer({ slug: g.slug, name: g.name, avatar: g.avatar ?? null, accountId: null, provider: null, sub: g.ign })} className="w-full flex items-center gap-2 rounded-lg px-2 py-1.5 hover:bg-white/5 text-left">
              <Avatar name={g.name} src={g.avatar ?? null} size={26} />
              <span className="flex-1 min-w-0"><span className="block truncate text-sm">{g.name}</span>{g.ign && <span className="block truncate text-[10px] text-muted">{g.ign}</span>}</span>
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

// The point-history log that shows exactly how a gamer earned their challenge
// points (from challengeEvents). Opened when a gamer is clicked on a challenge
// board — also reusable from the planet leaderboard + /leaderboards pages.
export function ChallengeLog({ challengeId, slug, title }: { challengeId: string; slug: string; title?: string }) {
  const [rows, setRows] = useState<{ eventType: string; points: number; at: string }[] | null>(null);
  const [total, setTotal] = useState<number | null>(null);
  const [err, setErr] = useState(false);
  useEffect(() => {
    let alive = true;
    fetch(`/api/challenge/points?challenge=${encodeURIComponent(challengeId)}&slug=${encodeURIComponent(slug)}`, { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : null))
      .then((j) => { if (!alive) return; if (j) { setRows(j.events ?? []); setTotal(j.total ?? 0); } else setErr(true); })
      .catch(() => alive && setErr(true));
    return () => { alive = false; };
  }, [challengeId, slug]);

  if (err) return <div className="text-xs text-muted">Couldn&apos;t load the points log.</div>;
  if (!rows) return <div className="text-xs text-muted animate-pulse">Loading points log…</div>;
  return (
    <div>
      <div className="flex items-center justify-between mb-2">
        <div className="text-[11px] uppercase tracking-widest text-muted">{title ? `${title} — ` : ""}points log</div>
        {total != null && <div className="text-sm font-bold text-cyan-200">{total.toLocaleString()} pts</div>}
      </div>
      {rows.length === 0 ? <div className="text-xs text-muted">No scoring events yet.</div> : (
        <div className="space-y-1 max-h-56 overflow-y-auto">
          {rows.map((e, i) => (
            <div key={i} className="flex items-center gap-2 rounded-lg bg-white/[0.04] px-2.5 py-1.5 text-xs">
              <span className="flex-1 min-w-0 truncate">{e.eventType.replace(/_/g, " ")}</span>
              <span className="text-[10px] text-muted shrink-0">{new Date(e.at).toLocaleDateString()}</span>
              <span className={`font-bold shrink-0 ${e.points >= 0 ? "text-emerald-300" : "text-rose-300"}`}>{e.points >= 0 ? "+" : ""}{e.points}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function FilterChip({ on, onClick, children }: { on: boolean; onClick: () => void; children: React.ReactNode }) {
  return <button onClick={onClick} className={`rounded-full px-2.5 py-1 text-[11px] font-semibold border transition ${on ? "border-cyan-400/50 bg-cyan-500/10 text-cyan-200" : "border-white/12 text-muted hover:text-ink"}`}>{children}</button>;
}
function Empty({ onBack }: { onBack: () => void }) {
  return <div className="text-xs text-muted">Not available. <button onClick={onBack} className="text-cyan-300 underline">Close</button></div>;
}
function shortTitle(t: string) { return t.split("·")[1]?.trim() ?? t; }
