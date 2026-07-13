"use client";

import { useRef, useState } from "react";
import Link from "next/link";
import Icon from "@/components/Icon";
import type { RegionStat } from "@/lib/regions";

export type PlanetData = {
  slug: string;
  name: string;
  accent: string;
  accent2: string;
  imageUrl: string;
  totalGamers: number;
  regions: RegionStat[];
};

// The interactive game planet: a floating sphere you can tilt (mouse parallax),
// zoom (hover), and explore by clicking a region hotspot to see how many gamers
// are there and who's on top. A toggle swaps the whole planet — same sphere,
// different game skin, colors and data.
export default function PlanetHero({ planets, initialSlug }: { planets: PlanetData[]; initialSlug: string }) {
  const startIdx = Math.max(0, planets.findIndex((p) => p.slug === initialSlug));
  const [idx, setIdx] = useState(startIdx);
  const [region, setRegion] = useState<RegionStat | null>(null);
  const [tilt, setTilt] = useState({ x: 0, y: 0 });
  const [zoom, setZoom] = useState(false);
  const frame = useRef<HTMLDivElement>(null);

  const p = planets[idx];

  function onMove(e: React.MouseEvent) {
    const el = frame.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    const dx = (e.clientX - (r.left + r.width / 2)) / (r.width / 2);
    const dy = (e.clientY - (r.top + r.height / 2)) / (r.height / 2);
    setTilt({ x: Math.max(-1, Math.min(1, dx)), y: Math.max(-1, Math.min(1, dy)) });
  }

  function selectPlanet(i: number) { setIdx(i); setRegion(null); }

  return (
    <section className="relative overflow-hidden">
      {/* Space backdrop */}
      <div className="absolute inset-0 -z-10" style={{ background: `radial-gradient(1200px 600px at 50% -10%, ${p.accent}22, transparent 60%), radial-gradient(900px 500px at 80% 120%, ${p.accent2}18, transparent 60%), #04051a` }} />
      <div className="absolute inset-0 -z-10 opacity-40 bg-cover bg-center" style={{ backgroundImage: "url(/assets/ambient.png)" }} />

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
          {/* glow ring */}
          <div className="absolute inset-[6%] rounded-full blur-2xl" style={{ background: `radial-gradient(circle, ${p.accent}55, transparent 70%)` }} />
          <div
            className="relative h-full w-full float-y transition-transform duration-300"
            style={{
              transform: `rotateY(${tilt.x * 8}deg) rotateX(${-tilt.y * 8}deg) scale(${zoom ? 1.04 : 1})`,
              transformStyle: "preserve-3d",
            }}
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={p.imageUrl} alt={`${p.name} planet`} className="h-full w-full rounded-full object-cover drop-shadow-2xl"
              style={{ boxShadow: `0 0 80px -10px ${p.accent}88` }} />
            {/* atmospheric rim */}
            <div className="absolute inset-0 rounded-full pointer-events-none" style={{ boxShadow: `inset 0 0 60px 10px ${p.accent2}55, inset 0 0 20px 2px #000a` }} />

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
          <p className="text-muted mt-2 max-w-md">Spin it, zoom in, and click a region to see how many gamers orbit there and who&apos;s on top.</p>

          {/* Game toggle */}
          <div className="mt-5 flex flex-wrap gap-2">
            {planets.map((pl, i) => (
              <button key={pl.slug} onClick={() => selectPlanet(i)}
                className={`inline-flex items-center gap-2 rounded-full px-4 py-2 text-sm font-semibold border transition-colors ${i === idx ? "text-white" : "text-muted border-violet-400/25 hover:text-ink hover:border-violet-400/50"}`}
                style={i === idx ? { borderColor: `${pl.accent}aa`, background: `${pl.accent}22`, color: "#fff" } : undefined}>
                <span className="h-2 w-2 rounded-full" style={{ background: pl.accent }} /> {pl.name}
              </button>
            ))}
          </div>

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

          <Link href={`/planets/${p.slug}`} className="mt-5 inline-flex items-center gap-2 glow-btn pressable rounded-full px-6 py-2.5 text-sm font-semibold text-white">
            Enter the {p.name} planet <Icon name="arrowRight" size={15} />
          </Link>
        </div>
      </div>
    </section>
  );
}
