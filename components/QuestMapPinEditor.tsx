"use client";

import { useActionState, useRef, useState } from "react";
import { saveTierPins, type TierPinState } from "@/app/actions/quests-admin";
import Icon from "@/components/Icon";

export type EditableTierPin = { id: string; name: string; thresholdQp: number; color: string; iconUrl: string | null; x: number; y: number };

// Drag the milestone (tier) markers directly across the quest map art — the same
// interaction as the planet-globe pin editor. Positions save in one shot.
export default function QuestMapPinEditor({
  questId, mapArtUrl, accent, tiers: initial,
}: { questId: string; mapArtUrl: string; accent: string; tiers: EditableTierPin[] }) {
  const [tiers, setTiers] = useState<EditableTierPin[]>(initial);
  const [sel, setSel] = useState<string>(initial[0]?.id ?? "");
  const frame = useRef<HTMLDivElement>(null);
  const dragging = useRef<string | null>(null);
  const [state, formAction, pending] = useActionState<TierPinState, FormData>(
    saveTierPins.bind(null, questId), undefined,
  );

  const update = (id: string, patch: Partial<EditableTierPin>) =>
    setTiers((prev) => prev.map((t) => (t.id === id ? { ...t, ...patch } : t)));

  const posFromEvent = (e: { clientX: number; clientY: number }) => {
    const el = frame.current;
    if (!el) return null;
    const r = el.getBoundingClientRect();
    return {
      x: Math.max(0, Math.min(100, ((e.clientX - r.left) / r.width) * 100)),
      y: Math.max(0, Math.min(100, ((e.clientY - r.top) / r.height) * 100)),
    };
  };

  const onPointerMove = (e: React.PointerEvent) => {
    if (!dragging.current) return;
    const pos = posFromEvent(e);
    if (pos) update(dragging.current, { x: Math.round(pos.x), y: Math.round(pos.y) });
  };

  const pinsJson = JSON.stringify(Object.fromEntries(tiers.map((t) => [t.id, { x: t.x, y: t.y }])));

  return (
    <form action={formAction} className="space-y-3">
      <p className="text-xs text-muted">Drag each milestone marker onto the map exactly where it should sit, then save. This matches how it appears on the quest hero.</p>
      <div
        ref={frame}
        onPointerMove={onPointerMove}
        onPointerUp={() => (dragging.current = null)}
        onPointerLeave={() => (dragging.current = null)}
        className="relative w-full rounded-2xl overflow-hidden select-none touch-none border border-violet-400/15"
        style={{ aspectRatio: "16 / 9", background: "#0a0a1c" }}
      >
        {mapArtUrl
          // eslint-disable-next-line @next/next/no-img-element
          ? <img src={mapArtUrl} alt="quest map" className="absolute inset-0 h-full w-full object-cover" draggable={false} />
          : <div className="absolute inset-0 grid place-items-center text-xs text-muted">Upload quest map art above to place milestones.</div>}
        {tiers.map((t) => {
          const active = t.id === sel;
          return (
            <button
              key={t.id} type="button"
              onPointerDown={(e) => { e.preventDefault(); dragging.current = t.id; setSel(t.id); }}
              onClick={() => setSel(t.id)}
              title={`${t.name} — drag to place`}
              className="absolute -translate-x-1/2 -translate-y-1/2 cursor-grab active:cursor-grabbing flex flex-col items-center"
              style={{ left: `${t.x}%`, top: `${t.y}%` }}
            >
              {t.iconUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={t.iconUrl} alt="" draggable={false} className="rounded-full object-cover ring-2 ring-white/70" style={{ width: active ? 34 : 26, height: active ? 34 : 26, boxShadow: `0 0 12px 2px ${t.color}` }} />
              ) : (
                <span className="block rounded-full ring-2 ring-white/70" style={{ width: active ? 22 : 16, height: active ? 22 : 16, background: t.color, boxShadow: `0 0 12px 2px ${t.color}` }} />
              )}
              <span className="mt-0.5 whitespace-nowrap rounded bg-black/75 px-1.5 py-0.5 text-[9px] font-bold text-white">{t.name} · {t.thresholdQp} CP</span>
            </button>
          );
        })}
      </div>

      {/* Precise nudge for the selected milestone */}
      <div className="flex flex-wrap items-center gap-2">
        {tiers.map((t) => (
          <button key={t.id} type="button" onClick={() => setSel(t.id)}
            className={`rounded-full border px-3 py-1 text-xs transition ${t.id === sel ? "border-violet-400/50 bg-violet-500/10 text-violet-200" : "border-white/12 text-muted hover:border-white/25"}`}>
            {t.name}
          </button>
        ))}
        {sel && (() => {
          const t = tiers.find((x) => x.id === sel);
          if (!t) return null;
          return (
            <span className="flex items-center gap-2 text-[11px] text-muted ml-1">
              <label className="flex items-center gap-1">x<input type="number" min={0} max={100} value={t.x} onChange={(e) => update(t.id, { x: Number(e.target.value) })} className="input-cosmic !py-0.5 w-16" /></label>
              <label className="flex items-center gap-1">y<input type="number" min={0} max={100} value={t.y} onChange={(e) => update(t.id, { y: Number(e.target.value) })} className="input-cosmic !py-0.5 w-16" /></label>
            </span>
          );
        })()}
      </div>

      <input type="hidden" name="pins" value={pinsJson} />
      <div className="flex items-center gap-3">
        <button disabled={pending || tiers.length === 0} className="glow-btn pressable rounded-full px-5 py-2 text-sm font-semibold text-white inline-flex items-center gap-1.5 disabled:opacity-50">
          <Icon name="pin" size={14} /> {pending ? "Saving…" : "Save milestone positions"}
        </button>
        {state?.ok && <span className="text-xs text-emerald-300">✓ {state.message}</span>}
        {state?.error && <span className="text-xs text-rose-300">{state.error}</span>}
      </div>
    </form>
  );
}
