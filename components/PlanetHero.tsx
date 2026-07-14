"use client";

import { useRef, useState } from "react";
import Link from "next/link";
import Icon from "@/components/Icon";
import GameLogo from "@/components/GameLogo";
import type { RegionStat } from "@/lib/regions";

export type PlanetData = {
  slug: string;
  name: string;
  accent: string;
  accent2: string;
  imageUrl: string;
  logoUrl: string | null;
  coverUrl: string | null;
  totalGamers: number;
  regions: RegionStat[];
};

// The interactive game planet: a floating sphere you can tilt (mouse parallax),
// zoom (hover), and explore by clicking a region hotspot. The game logos on the
// map switch planets — each links to that game's planet page.
export default function PlanetHero({ planets, initialSlug }: { planets: PlanetData[]; initialSlug: string }) {
  const p = planets.find((x) => x.slug === initialSlug) ?? planets[0];
  const [region, setRegion] = useState<RegionStat | null>(null);
  const [tilt, setTilt] = useState({ x: 0, y: 0 });
  const [zoom, setZoom] = useState(false);
  const frame = useRef<HTMLDivElement>(null);

  function onMove(e: React.MouseEvent) {
    const el = frame.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    const dx = (e.clientX - (r.left + r.width / 2)) / (r.width / 2);
    const dy = (e.clientY - (r.top + r.height / 2)) / (r.height / 2);
    setTilt({ x: Math.max(-1, Math.min(1, dx)), y: Math.max(-1, Math.min(1, dy)) });
  }

  return (
    <section className="relative overflow-hidden">
      {/* Space backdrop + the game cover as faint texture behind the sphere */}
      <div className="absolute inset-0 -z-10" style={{ background: `radial-gradient(1200px 620px at 42% 20%, ${p.accent}1f, transparent 60%), radial-gradient(900px 500px at 85% 110%, ${p.accent2}14, transparent 60%), #04051a` }} />
      {p.coverUrl && (
        <div className="absolute inset-0 -z-10 bg-cover bg-center opacity-[0.12]" style={{ backgroundImage: `url(${p.coverUrl})` }} />
      )}
      <div className="absolute inset-0 -z-10 opacity-30 bg-cover bg-center" style={{ backgroundImage: "url(/assets/ambient.png)" }} />

      <div className="mx-auto max-w-6xl px-4 py-10 md:py-14 grid gap-8 lg:grid-cols-[1.1fr_1fr] items-center">
        {/* ===== Planet ===== */}
        <div
          ref={frame}
          className="relative mx-auto aspect-square w-full max-w-[520px] select-none"
          onMouseMove={onMove}
          onMouseLeave={() => { setTilt({ x: 0, y: 0 }); setZoom(false); }}
          onMouseEnter={() => setZoom(true)}
          style={{ perspective: "1200px" }}
        >
          {/* Soft glow that fades toward the planet (no hard ring) */}
          <div className="absolute inset-0 rounded-full blur-3xl opacity-60" style={{ background: `radial-gradient(circle, transparent 52%, ${p.accent}33 62%, transparent 78%)` }} />

          {/* Game logos on the map — switch planets (navigate) */}
          {planets.length > 1 && (
            <div className="absolute top-1 left-1 z-20 flex flex-col gap-2">
              {planets.map((pl) => {
                const active = pl.slug === p.slug;
                return (
                  <Link key={pl.slug} href={`/planets/${pl.slug}`} title={pl.name}
                    className={`rounded-xl transition-all ${active ? "scale-110" : "opacity-55 hover:opacity-100 hover:scale-105"}`}>
                    <GameLogo logoUrl={pl.logoUrl} name={pl.name} size={active ? 44 : 34} rounded="rounded-xl"
                      className={active ? "ring-2 shadow-lg" : "ring-1 ring-violet-400/25"} />
                  </Link>
                );
              })}
            </div>
          )}

          <div
            className="relative h-full w-full float-y transition-transform duration-300"
            style={{ transform: `rotateY(${tilt.x * 8}deg) rotateX(${-tilt.y * 8}deg) scale(${zoom ? 1.04 : 1})`, transformStyle: "preserve-3d" }}
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={p.imageUrl} alt={`${p.name} planet`} className="h-full w-full rounded-full object-cover" />
            {/* subtle inner shading for depth, no bright rim */}
            <div className="absolute inset-0 rounded-full pointer-events-none" style={{ boxShadow: "inset 0 0 70px 8px rgba(0,0,0,0.55)" }} />

            {/* Region hotspots */}
            {p.regions.map((r) => {
              const active = region?.key === r.key;
              return (
                <button
                  key={r.key}
                  onClick={() => setRegion(active ? null : r)}
                  title={`${r.label} · ${r.count} gamer${r.count === 1 ? "" : "s"}`}
                  className="absolute -translate-x-1/2 -translate-y-1/2 group"
                  style={{ left: `${r.x}%`, top: `${r.y}%` }}
                >
                  <span className="block rounded-full transition-transform group-hover:scale-125"
                    style={{ width: active ? 18 : 12, height: active ? 18 : 12, background: r.color, boxShadow: `0 0 12px 2px ${r.color}` }} />
                  <span className="absolute left-1/2 top-full mt-1 -translate-x-1/2 whitespace-nowrap rounded-full bg-black/70 px-2 py-0.5 text-[10px] font-semibold text-white opacity-0 group-hover:opacity-100 transition-opacity">
                    {r.short} · {r.count}
                  </span>
                  {r.count > 0 && <span className="absolute inset-0 rounded-full animate-ping" style={{ background: `${r.color}66` }} />}
                </button>
              );
            })}
          </div>
        </div>

        {/* ===== Info / controls ===== */}
        <div>
          <div className="text-[11px] uppercase tracking-widest text-cyan-300 mb-2 inline-flex items-center gap-1.5">
            <Icon name="planet" size={13} /> Interactive planet
          </div>
          <h1 className="text-3xl md:text-5xl font-bold">{p.name}</h1>
          <p className="text-muted mt-2 max-w-md">Spin it, zoom in, and click a region to see how many gamers orbit there and who&apos;s on top. Switch planets with the logos on the globe.</p>

          {/* Region panel or overview */}
          <div className="mt-5 glass p-4 min-h-[132px]">
            {region ? (
              <div>
                <div className="flex items-center justify-between">
                  <div className="font-bold flex items-center gap-2" style={{ color: region.color }}>
                    <span className="h-2.5 w-2.5 rounded-full" style={{ background: region.color }} /> {region.label}
                  </div>
                  <button onClick={() => setRegion(null)} className="text-muted hover:text-ink"><Icon name="x" size={14} /></button>
                </div>
                <div className="text-xs text-muted mt-0.5">{region.count} {p.name} gamer{region.count === 1 ? "" : "s"} in this region</div>
                {region.gamers.length > 0 ? (
                  <div className="mt-3 space-y-1.5">
                    {region.gamers.map((g, i) => (
                      <Link key={g.slug} href={`/u/${g.slug}`} className="flex items-center gap-2.5 text-sm hover:text-cyan-300">
                        <span className="rank-chip !h-6 !min-w-6 text-xs" style={{ background: `${region.color}22`, color: region.color }}>{i + 1}</span>
                        <span className="truncate">{g.name}</span>
                      </Link>
                    ))}
                  </div>
                ) : (
                  <div className="mt-3 text-sm text-cyan-300 inline-flex items-center gap-1.5">
                    <Icon name="rocket" size={13} /> No one here yet — <Link href="/profile" className="underline">be the first from {region.short}</Link>
                  </div>
                )}
              </div>
            ) : (
              <div>
                <div className="flex items-center gap-2 text-sm font-semibold"><Icon name="users" size={15} className="text-cyan-300" /> {p.totalGamers} gamer{p.totalGamers === 1 ? "" : "s"} across {p.name}</div>
                <div className="mt-3 grid grid-cols-3 gap-2">
                  {p.regions.map((r) => (
                    <button key={r.key} onClick={() => setRegion(r)}
                      className="rounded-lg border border-violet-400/15 bg-black/20 px-2 py-1.5 text-left hover:border-violet-400/40 transition-colors">
                      <div className="text-[10px] uppercase tracking-widest" style={{ color: r.color }}>{r.short}</div>
                      <div className="text-sm font-bold">{r.count}</div>
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* Switch planets */}
          {planets.length > 1 && (
            <div className="mt-4 flex flex-wrap gap-2">
              {planets.map((pl) => (
                <Link key={pl.slug} href={`/planets/${pl.slug}`}
                  className={`inline-flex items-center gap-2 rounded-full px-3.5 py-1.5 text-sm font-semibold border transition-colors ${pl.slug === p.slug ? "text-white" : "text-muted border-violet-400/25 hover:text-ink"}`}
                  style={pl.slug === p.slug ? { borderColor: `${pl.accent}aa`, background: `${pl.accent}22`, color: "#fff" } : undefined}>
                  <GameLogo logoUrl={pl.logoUrl} name={pl.name} size={20} rounded="rounded-md" /> {pl.name}
                </Link>
              ))}
            </div>
          )}
        </div>
      </div>
    </section>
  );
}
