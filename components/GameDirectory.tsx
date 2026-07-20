"use client";

import { useEffect, useMemo, useState } from "react";
import Icon from "@/components/Icon";
import type { EntityLite, EntityDetail } from "@/lib/game-entities";

const KIND_LABEL: Record<string, string> = { champion: "Champions", hero: "Heroes", agent: "Agents", weapon: "Weapons", outfit: "Outfits" };

// The game-world directory on a planet page: every champion / agent+weapon /
// hero of the game as a searchable art grid; click one for its splash, lore and
// abilities. Self-loads and hides entirely if the game has no catalogue.
export default function GameDirectory({ game }: { game: string }) {
  const [list, setList] = useState<EntityLite[] | null>(null);
  const [q, setQ] = useState("");
  const [kind, setKind] = useState<string>("all");
  const [open, setOpen] = useState<EntityLite | null>(null);

  useEffect(() => {
    let alive = true;
    fetch(`/api/planet/entities?game=${encodeURIComponent(game)}`, { cache: "force-cache" })
      .then((r) => r.json()).then((j) => { if (alive) setList(j.entities ?? []); })
      .catch(() => alive && setList([]));
    return () => { alive = false; };
  }, [game]);

  const kinds = useMemo(() => [...new Set((list ?? []).map((e) => e.kind))], [list]);
  const shown = useMemo(() => (list ?? []).filter((e) => (kind === "all" || e.kind === kind) && (!q || e.name.toLowerCase().includes(q.toLowerCase()))), [list, kind, q]);

  if (list && list.length === 0) return null; // no catalogue for this game
  if (!list) return <div className="glass p-6 text-sm text-muted animate-pulse">Loading the {game} world…</div>;

  return (
    <section>
      <div className="flex flex-wrap items-center justify-between gap-3 mb-3">
        <h2 className="text-xl font-bold flex items-center gap-2"><Icon name="swords" size={20} className="text-violet-300" /> The {game} world</h2>
        <input value={q} onChange={(e) => setQ(e.target.value)} placeholder={`Search ${list.length}…`} className="input-cosmic !py-1.5 !w-44 text-sm" />
      </div>
      {kinds.length > 1 && (
        <div className="flex flex-wrap gap-1.5 mb-4">
          <Chip on={kind === "all"} onClick={() => setKind("all")}>All</Chip>
          {kinds.map((k) => <Chip key={k} on={kind === k} onClick={() => setKind(k)}>{KIND_LABEL[k] ?? k}</Chip>)}
        </div>
      )}
      {/* Cap the section to ~5 rows (6 per row) and scroll — don't dump 160+. */}
      <div className="max-h-[58vh] overflow-y-auto overscroll-contain pr-1 rounded-xl">
        <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-6 gap-2.5">
          {shown.map((e) => (
            <button key={`${e.kind}-${e.id}`} onClick={() => setOpen(e)} className="group relative rounded-xl overflow-hidden border border-white/10 hover:border-cyan-400/50 transition text-left aspect-square">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={e.image} alt={e.name} loading="lazy" className={`h-full w-full transition-transform group-hover:scale-105 ${e.kind === "weapon" ? "object-contain p-2 bg-black/30" : "object-cover"}`} />
              <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-[#04051a] to-transparent p-1.5">
                <div className="text-[11px] font-bold truncate">{e.name}</div>
                {e.role && <div className="text-[9px] text-muted truncate">{e.role}</div>}
              </div>
            </button>
          ))}
          {shown.length === 0 && <div className="col-span-full text-center text-sm text-muted py-6">Nothing matches “{q}”.</div>}
        </div>
      </div>
      <div className="text-[11px] text-muted mt-1.5">Showing {shown.length} of {list.length} — scroll for more.</div>

      {open && <EntityModal game={game} lite={open} onClose={() => setOpen(null)} />}
    </section>
  );
}

function EntityModal({ game, lite, onClose }: { game: string; lite: EntityLite; onClose: () => void }) {
  const [d, setD] = useState<EntityDetail | null>(null);
  const [cover, setCover] = useState<string | null>(null);
  const [lightbox, setLightbox] = useState<string | null>(null);
  useEffect(() => {
    let alive = true;
    fetch(`/api/planet/entity?game=${encodeURIComponent(game)}&kind=${lite.kind}&id=${encodeURIComponent(lite.id)}`, { cache: "force-cache" })
      .then((r) => (r.ok ? r.json() : null)).then((j) => { if (alive) setD(j); }).catch(() => {});
    return () => { alive = false; };
  }, [game, lite]);
  const headerImg = cover || d?.splash || lite.image;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/75 backdrop-blur-sm" onClick={onClose}>
      <div className="relative w-full max-w-2xl max-h-[88vh] overflow-hidden rounded-2xl border border-white/15 bg-[#04051a]" onClick={(e) => e.stopPropagation()}>
        <div className="relative h-44 sm:h-56 cursor-zoom-in" onClick={() => setLightbox(headerImg)}>
          {headerImg && /* eslint-disable-next-line @next/next/no-img-element */
            <img src={headerImg} alt="" className={`absolute inset-0 h-full w-full ${lite.kind === "weapon" ? "object-contain p-6" : "object-cover"}`} />}
          <div className="absolute inset-0" style={{ background: "linear-gradient(to top, #04051a, rgba(4,5,26,0.2) 60%, transparent)" }} />
          <button onClick={(e) => { e.stopPropagation(); onClose(); }} className="absolute top-2 right-2 rounded-full bg-black/50 p-1.5 text-white hover:bg-black/70"><Icon name="x" size={16} /></button>
          <div className="absolute bottom-3 left-4 right-4">
            <div className="text-2xl font-bold drop-shadow">{lite.name}</div>
            {(d?.role || lite.role) && <div className="text-xs text-cyan-200">{d?.role || lite.role}</div>}
          </div>
        </div>
        <div className="p-4 overflow-y-auto max-h-[calc(88vh-14rem)]">
          {!d ? <div className="text-sm text-muted animate-pulse">Loading lore…</div> : (
            <>
              {/* Skins at the TOP — click to set the cover + open the full image */}
              {d.skins.length > 0 && (
                <div className="mb-4">
                  <div className="text-xs font-bold uppercase tracking-widest text-cyan-200 mb-2">{d.skins.length} skin{d.skins.length === 1 ? "" : "s"} · tap to preview</div>
                  <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                    {d.skins.map((s, i) => (
                      <button key={i} onClick={() => { setCover(s.image); setLightbox(s.image); }} title={s.name} className={`rounded-lg overflow-hidden border text-left transition ${cover === s.image ? "border-cyan-400" : "border-white/10 hover:border-cyan-400/50"}`}>
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img src={s.image} alt={s.name} loading="lazy" className={`h-20 w-full ${lite.kind === "weapon" ? "object-contain bg-black/40 p-1.5" : "object-cover"}`} onError={(ev) => { ((ev.currentTarget.closest("button")) as HTMLElement).style.display = "none"; }} />
                        <div className="text-[10px] text-muted truncate px-1.5 py-1">{s.name}</div>
                      </button>
                    ))}
                  </div>
                </div>
              )}
              {d.meta.filter((m) => m.value).length > 0 && (
                <div className="flex flex-wrap gap-2 mb-3">
                  {d.meta.filter((m) => m.value).map((m) => (
                    <span key={m.label} className="rounded-full border border-white/12 px-2.5 py-1 text-[11px]"><span className="text-muted">{m.label}:</span> <b>{m.value}</b></span>
                  ))}
                </div>
              )}
              {d.lore && <p className="text-sm text-muted leading-relaxed mb-4 whitespace-pre-line">{d.lore}</p>}
              {d.abilities.length > 0 && (
                <div>
                  <div className="text-xs font-bold uppercase tracking-widest text-cyan-200 mb-2">Abilities</div>
                  <div className="space-y-2">
                    {d.abilities.map((ab, i) => (
                      <div key={i} className="flex gap-2.5">
                        {ab.icon && /* eslint-disable-next-line @next/next/no-img-element */ <img src={ab.icon} alt="" className="h-9 w-9 rounded-md shrink-0 bg-black/40" onError={(e) => { (e.currentTarget as HTMLImageElement).style.display = "none"; }} />}
                        <div className="min-w-0"><div className="text-sm font-semibold">{ab.name}</div>{ab.desc && <div className="text-[12px] text-muted line-clamp-3">{ab.desc}</div>}</div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
              {!d.lore && d.abilities.length === 0 && d.skins.length === 0 && <p className="text-sm text-muted">No lore available for this one yet.</p>}
            </>
          )}
        </div>
      </div>
      {lightbox && (
        <div className="fixed inset-0 z-[70] flex items-center justify-center p-4 bg-black/85" onClick={(e) => { e.stopPropagation(); setLightbox(null); }}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={lightbox} alt="" className="max-h-[90vh] max-w-[92vw] rounded-lg shadow-2xl" onClick={(e) => e.stopPropagation()} />
          <button onClick={(e) => { e.stopPropagation(); setLightbox(null); }} className="absolute top-4 right-4 rounded-full bg-black/60 p-2 text-white hover:bg-black/80"><Icon name="x" size={18} /></button>
        </div>
      )}
    </div>
  );
}

function Chip({ on, onClick, children }: { on: boolean; onClick: () => void; children: React.ReactNode }) {
  return <button onClick={onClick} className={`rounded-full px-3 py-1 text-xs font-semibold border transition ${on ? "border-cyan-400/50 bg-cyan-500/10 text-cyan-200" : "border-white/12 text-muted hover:text-ink"}`}>{children}</button>;
}
