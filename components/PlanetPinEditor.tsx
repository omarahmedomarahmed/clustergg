"use client";

import { useActionState, useRef, useState } from "react";
import { savePlanetPins, type ActionState } from "@/app/actions/admin";
import Icon from "@/components/Icon";

export type EditablePin = { key: string; label: string; short: string; color: string; x: number; y: number; count: number };

// Visual editor to place/rename/recolor the six macro-region markers over a
// game's planet artwork. Drag a pin on the globe or nudge fields on the right;
// live gamer counts per region are shown read-only so staff see the mapping.
export default function PlanetPinEditor({
  gameId, imageUrl, bgUrl, pins: initial,
}: { gameId: string; imageUrl: string; bgUrl: string | null; pins: EditablePin[] }) {
  const [pins, setPins] = useState<EditablePin[]>(initial);
  const [sel, setSel] = useState<string>(initial[0]?.key ?? "");
  const frame = useRef<HTMLDivElement>(null);
  const dragging = useRef<string | null>(null);
  const [state, formAction, pending] = useActionState<ActionState, FormData>(
    savePlanetPins.bind(null, gameId), undefined,
  );

  const update = (key: string, patch: Partial<EditablePin>) =>
    setPins((prev) => prev.map((p) => (p.key === key ? { ...p, ...patch } : p)));

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

  const pinsJson = JSON.stringify(
    Object.fromEntries(pins.map((p) => [p.key, { x: p.x, y: p.y, color: p.color, label: p.label }])),
  );

  return (
    <form action={formAction} className="grid lg:grid-cols-[minmax(280px,1fr)_320px] gap-6 items-start">
      {/* Globe with draggable pins */}
      <div
        ref={frame}
        onPointerMove={onPointerMove}
        onPointerUp={() => (dragging.current = null)}
        onPointerLeave={() => (dragging.current = null)}
        className="relative mx-auto aspect-square w-full max-w-[440px] rounded-full overflow-hidden select-none touch-none"
        style={bgUrl ? { backgroundImage: `url(${bgUrl})`, backgroundSize: "cover" } : undefined}
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={imageUrl} alt="planet" className="absolute inset-0 h-full w-full rounded-full object-cover" draggable={false} />
        {pins.map((p) => {
          const active = p.key === sel;
          return (
            <button
              key={p.key} type="button"
              onPointerDown={(e) => { e.preventDefault(); dragging.current = p.key; setSel(p.key); }}
              onClick={() => setSel(p.key)}
              title={`${p.label} — drag to place`}
              className="absolute -translate-x-1/2 -translate-y-1/2 cursor-grab active:cursor-grabbing"
              style={{ left: `${p.x}%`, top: `${p.y}%` }}
            >
              <span className="block rounded-full ring-2 ring-white/70"
                style={{ width: active ? 20 : 14, height: active ? 20 : 14, background: p.color, boxShadow: `0 0 12px 2px ${p.color}` }} />
              <span className="absolute left-1/2 top-full mt-0.5 -translate-x-1/2 whitespace-nowrap rounded bg-black/75 px-1.5 py-0.5 text-[9px] font-bold text-white">
                {p.short} · {p.count}
              </span>
            </button>
          );
        })}
      </div>

      {/* Per-region controls */}
      <div className="space-y-2">
        <div className="text-xs text-muted mb-1">Click a region below or a pin on the globe, then drag the pin to place it. Counts are live and read-only.</div>
        {pins.map((p) => {
          const active = p.key === sel;
          return (
            <div key={p.key}
              onClick={() => setSel(p.key)}
              className={`rounded-xl border p-2.5 cursor-pointer transition-colors ${active ? "border-violet-400/50 bg-violet-500/10" : "border-violet-400/15 hover:border-violet-400/30"}`}>
              <div className="flex items-center gap-2">
                <input type="color" value={p.color} onChange={(e) => update(p.key, { color: e.target.value })}
                  className="h-7 w-8 rounded bg-transparent border border-white/10 cursor-pointer" aria-label={`${p.label} color`} />
                <input value={p.label} onChange={(e) => update(p.key, { label: e.target.value })}
                  className="input-cosmic !py-1 flex-1 text-sm" aria-label={`${p.label} name`} />
                <span className="text-xs font-bold text-cyan-300 shrink-0">{p.count}</span>
              </div>
              {active && (
                <div className="flex items-center gap-3 mt-2 text-[11px] text-muted">
                  <label className="flex items-center gap-1">x
                    <input type="number" min={0} max={100} value={p.x} onChange={(e) => update(p.key, { x: Number(e.target.value) })} className="input-cosmic !py-0.5 w-16" />
                  </label>
                  <label className="flex items-center gap-1">y
                    <input type="number" min={0} max={100} value={p.y} onChange={(e) => update(p.key, { y: Number(e.target.value) })} className="input-cosmic !py-0.5 w-16" />
                  </label>
                </div>
              )}
            </div>
          );
        })}

        <input type="hidden" name="pins" value={pinsJson} />
        <div className="flex items-center gap-3 pt-1">
          <button disabled={pending} className="glow-btn pressable rounded-full px-5 py-2 text-sm font-semibold text-white inline-flex items-center gap-1.5">
            <Icon name="planet" size={14} /> {pending ? "Saving…" : "Save pins"}
          </button>
          {state?.ok && <span className="text-xs text-emerald-300">✓ {state.message}</span>}
          {state?.error && <span className="text-xs text-rose-300">{state.error}</span>}
        </div>
      </div>
    </form>
  );
}
