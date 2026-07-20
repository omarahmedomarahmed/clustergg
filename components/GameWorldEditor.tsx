"use client";

import { useEffect, useMemo, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import Icon from "@/components/Icon";
import EntityImg from "@/components/EntityImg";
import ImageUpload from "@/components/ImageUpload";
import { saveEntityOverride, deleteEntityOverride } from "@/app/actions/game-world";
import type { EntityLite } from "@/lib/game-entities";

const KIND_LABEL: Record<string, string> = { champion: "Champions", hero: "Heroes", agent: "Agents", weapon: "Weapons", outfit: "Outfits", legend: "Legends", map: "Maps" };

type Detail = {
  id: string; kind: string; name: string; image: string; splash: string | null;
  role: string | null; lore: string | null; skins: { name: string; image: string }[];
  meta: { label: string; value: string }[]; abilities: { name: string; icon: string | null; desc: string }[];
};

// Admin editor for a game's world: browse every champion/legend/weapon/etc.,
// edit its name/role/art/lore/skins, hide it, reorder it, or add a custom one
// (e.g. a PUBG hero). Edits are stored as overrides and merged on read.
export default function GameWorldEditor({
  game, games, entities, overridden, hiddenKeys, kinds,
}: {
  game: string; games: string[]; entities: EntityLite[];
  overridden: string[]; hiddenKeys: string[]; kinds: string[];
}) {
  const [q, setQ] = useState("");
  const [kind, setKind] = useState("all");
  const [open, setOpen] = useState<EntityLite | "new" | null>(null);
  const ovSet = useMemo(() => new Set(overridden), [overridden]);
  const hidSet = useMemo(() => new Set(hiddenKeys), [hiddenKeys]);
  const kindList = useMemo(() => [...new Set(entities.map((e) => e.kind))], [entities]);
  const shown = entities.filter((e) => (kind === "all" || e.kind === kind) && (!q || e.name.toLowerCase().includes(q.toLowerCase())));

  return (
    <div>
      <div className="flex flex-wrap items-center gap-2 mb-4">
        {games.map((g) => (
          <Link key={g} href={`/admin/game-worlds?game=${encodeURIComponent(g)}`}
            className={`rounded-full px-3 py-1.5 text-xs font-semibold border transition ${g === game ? "border-cyan-400/60 bg-cyan-500/10 text-cyan-200" : "border-white/12 text-muted hover:text-ink"}`}>{g}</Link>
        ))}
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3 mb-3">
        <div className="flex flex-wrap gap-1.5">
          {kindList.length > 1 && <Chip on={kind === "all"} onClick={() => setKind("all")}>All</Chip>}
          {kindList.map((k) => <Chip key={k} on={kind === k} onClick={() => setKind(k)}>{KIND_LABEL[k] ?? k}</Chip>)}
        </div>
        <div className="flex items-center gap-2">
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder={`Search ${entities.length}…`} className="input-cosmic !py-1.5 !w-44 text-sm" />
          <button onClick={() => setOpen("new")} className="glow-btn pressable rounded-full px-4 py-1.5 text-xs font-semibold text-white inline-flex items-center gap-1"><Icon name="plus" size={12} /> Add</button>
        </div>
      </div>

      <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-6 gap-2.5">
        {shown.map((e) => {
          const key = `${e.kind}:${e.id}`;
          return (
            <button key={key} onClick={() => setOpen(e)} style={{ containerType: "size" }}
              className="group relative rounded-xl overflow-hidden border border-white/10 hover:border-cyan-400/50 transition text-left aspect-square">
              <EntityImg src={e.image} name={e.name} kind={e.kind} className={`h-full w-full ${e.kind === "weapon" ? "object-contain p-2 bg-black/30" : "object-cover"}`} />
              <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-[#04051a] to-transparent p-1.5">
                <div className="text-[11px] font-bold truncate">{e.name}</div>
              </div>
              <div className="absolute top-1 right-1 flex gap-1">
                {ovSet.has(key) && <span className="rounded-full bg-cyan-500/80 text-[8px] font-bold px-1.5 py-0.5">EDITED</span>}
                {hidSet.has(key) && <span className="rounded-full bg-rose-500/80 text-[8px] font-bold px-1.5 py-0.5">HIDDEN</span>}
              </div>
            </button>
          );
        })}
      </div>
      <div className="text-[11px] text-muted mt-2">Showing {shown.length} of {entities.length}. Click one to edit its art, name, lore and skins — or hide it.</div>

      {open && <EntityEditor game={game} kinds={kinds} lite={open === "new" ? null : open} onClose={() => setOpen(null)} />}
    </div>
  );
}

function EntityEditor({ game, kinds, lite, onClose }: { game: string; kinds: string[]; lite: EntityLite | null; onClose: () => void }) {
  const router = useRouter();
  const isNew = !lite;
  const [d, setD] = useState<Detail | null>(isNew ? null : null);
  const [loading, setLoading] = useState(!isNew);
  const [pending, start] = useTransition();

  const [kind, setKind] = useState(lite?.kind ?? kinds[0] ?? "champion");
  const [name, setName] = useState(lite?.name ?? "");
  const [role, setRole] = useState(lite?.role ?? "");
  const [image, setImage] = useState(lite?.image ?? "");
  const [splash, setSplash] = useState("");
  const [lore, setLore] = useState("");
  const [skins, setSkins] = useState<{ name: string; image: string }[]>([]);
  const [hidden, setHidden] = useState(false);
  const [sortOrder, setSortOrder] = useState(0);

  useEffect(() => {
    if (isNew || !lite) return;
    let alive = true;
    fetch(`/api/planet/entity?game=${encodeURIComponent(game)}&kind=${lite.kind}&id=${encodeURIComponent(lite.id)}`)
      .then((r) => (r.ok ? r.json() : null)).then((j: Detail | null) => {
        if (!alive || !j) { setLoading(false); return; }
        setD(j); setName(j.name); setRole(j.role ?? ""); setImage(j.image); setSplash(j.splash ?? ""); setLore(j.lore ?? ""); setSkins(j.skins ?? []); setLoading(false);
      }).catch(() => alive && setLoading(false));
    return () => { alive = false; };
  }, [game, lite, isNew]);

  const entityId = lite?.id ?? "custom-" + Math.random().toString(36).slice(2, 8);

  const save = () => start(async () => {
    await saveEntityOverride(game, kind, entityId, {
      name, role, image, splash, lore, hidden, sortOrder, custom: isNew || undefined,
      skins: skins.filter((s) => s.image),
    });
    router.refresh(); onClose();
  });
  const reset = () => start(async () => { if (lite) await deleteEntityOverride(game, lite.kind, lite.id); router.refresh(); onClose(); });

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/75 backdrop-blur-sm" onClick={onClose}>
      <div className="relative w-full max-w-2xl max-h-[88vh] overflow-y-auto rounded-2xl border border-white/15 bg-[#04051a] p-5" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-4">
          <h3 className="font-bold text-lg">{isNew ? "Add a custom entity" : `Edit ${lite?.name}`}</h3>
          <button onClick={onClose} className="text-muted hover:text-ink"><Icon name="x" size={18} /></button>
        </div>
        {loading ? <div className="text-sm text-muted animate-pulse py-8 text-center">Loading…</div> : (
          <div className="space-y-4">
            {isNew && (
              <label className="block text-sm text-muted">Type
                <select value={kind} onChange={(e) => setKind(e.target.value)} className="input-cosmic mt-1 w-full">
                  {kinds.map((k) => <option key={k} value={k}>{KIND_LABEL[k] ?? k}</option>)}
                </select>
              </label>
            )}
            <div className="grid sm:grid-cols-2 gap-3">
              <label className="block text-sm text-muted">Name<input value={name} onChange={(e) => setName(e.target.value)} className="input-cosmic mt-1 w-full" /></label>
              <label className="block text-sm text-muted">Role / class<input value={role} onChange={(e) => setRole(e.target.value)} className="input-cosmic mt-1 w-full" placeholder="e.g. Skirmisher" /></label>
            </div>
            <div className="grid sm:grid-cols-2 gap-3">
              <div><div className="text-sm text-muted mb-1">Icon / tile image</div><ImageUpload value={image} onChange={setImage} aspect="1/1" scope="gameworld" previewWidth={110} /></div>
              <div><div className="text-sm text-muted mb-1">Splash / cover image</div><ImageUpload value={splash} onChange={setSplash} aspect="16/9" scope="gameworld" previewWidth={160} /></div>
            </div>
            <label className="block text-sm text-muted">Lore / description<textarea value={lore} onChange={(e) => setLore(e.target.value)} rows={4} className="input-cosmic mt-1 w-full" /></label>

            <div>
              <div className="flex items-center justify-between mb-1">
                <div className="text-sm text-muted">Skins ({skins.length})</div>
                <button onClick={() => setSkins((s) => [...s, { name: "New skin", image: "" }])} className="text-xs text-cyan-300 hover:underline inline-flex items-center gap-1"><Icon name="plus" size={11} /> Add skin</button>
              </div>
              <div className="space-y-2">
                {skins.map((s, i) => (
                  <div key={i} className="flex items-center gap-2 rounded-lg border border-white/10 p-2">
                    <div className="w-24 shrink-0"><ImageUpload value={s.image} onChange={(v) => setSkins((arr) => arr.map((x, j) => j === i ? { ...x, image: v } : x))} aspect="16/9" scope="gameworld" previewWidth={90} zoomable={false} /></div>
                    <input value={s.name} onChange={(e) => setSkins((arr) => arr.map((x, j) => j === i ? { ...x, name: e.target.value } : x))} className="input-cosmic !py-1.5 flex-1 text-sm" placeholder="Skin name" />
                    <button onClick={() => setSkins((arr) => arr.filter((_, j) => j !== i))} className="text-rose-300 hover:text-rose-200"><Icon name="x" size={14} /></button>
                  </div>
                ))}
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-4 pt-1">
              <label className="text-sm text-muted flex items-center gap-2"><input type="checkbox" checked={hidden} onChange={(e) => setHidden(e.target.checked)} /> Hide from the game world</label>
              <label className="text-sm text-muted flex items-center gap-2">Sort priority <input type="number" min={0} value={sortOrder} onChange={(e) => setSortOrder(Number(e.target.value))} className="input-cosmic !py-1 !w-20 text-sm" /></label>
            </div>

            <div className="flex items-center gap-3 pt-2 border-t border-white/10">
              <button onClick={save} disabled={pending || !name.trim()} className="glow-btn pressable rounded-full px-6 py-2 text-sm font-semibold text-white disabled:opacity-50">{pending ? "Saving…" : "Save"}</button>
              {!isNew && <button onClick={reset} disabled={pending} className="ghost-btn pressable rounded-full px-4 py-2 text-sm disabled:opacity-50">Reset to default</button>}
              <span className="text-[11px] text-muted ml-auto">Blank fields fall back to the game&apos;s default data.</span>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function Chip({ on, onClick, children }: { on: boolean; onClick: () => void; children: React.ReactNode }) {
  return <button onClick={onClick} className={`rounded-full px-3 py-1 text-xs font-semibold border transition ${on ? "border-cyan-400/50 bg-cyan-500/10 text-cyan-200" : "border-white/12 text-muted hover:text-ink"}`}>{children}</button>;
}
