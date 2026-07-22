"use client";

import { useActionState, useRef, useState } from "react";
import { saveQuestPath, type TierPinState } from "@/app/actions/quests-admin";
import { smoothPathD, type Pt } from "@/lib/quest-path";
import Icon from "@/components/Icon";

type Milestone = { id: string; name: string; color: string; x: number; y: number };

// Draw the curved trail the astronaut travels between milestones. Click the map
// to add a waypoint (appended at the end, or inserted into the nearest segment
// in "insert" mode), drag any point to reshape the curve, click a point in
// "delete" mode to remove it. The live preview is the exact curve the hero
// renders, so the astronaut rides precisely on this line.
export default function QuestPathEditor({
  questId, mapArtUrl, accent, milestones, initial, initialMobile = [],
}: { questId: string; mapArtUrl: string; accent: string; milestones: Milestone[]; initial: Pt[]; initialMobile?: Pt[] }) {
  const seed = initial.length >= 2 ? initial : milestones.map((m) => ({ x: m.x, y: m.y }));
  // The mobile map (4:5 phone crop) gets its OWN trail — the same percentages
  // land differently on a 4:5 canvas, so admins trace each aspect separately.
  const seedMobile = initialMobile.length >= 2 ? initialMobile : seed;
  const [variant, setVariant] = useState<"desktop" | "mobile">("desktop");
  const [ptsByVariant, setPtsByVariant] = useState<Record<"desktop" | "mobile", Pt[]>>({ desktop: seed, mobile: seedMobile });
  const pts = ptsByVariant[variant];
  const setPts = (up: Pt[] | ((prev: Pt[]) => Pt[])) =>
    setPtsByVariant((m) => ({ ...m, [variant]: typeof up === "function" ? up(m[variant]) : up }));
  const [mode, setMode] = useState<"move" | "add" | "insert" | "delete">("move");
  const frame = useRef<HTMLDivElement>(null);
  const dragging = useRef<number | null>(null);
  const [state, formAction, pending] = useActionState<TierPinState, FormData>(saveQuestPath.bind(null, questId), undefined);

  const posFromEvent = (e: { clientX: number; clientY: number }): Pt | null => {
    const el = frame.current; if (!el) return null;
    const r = el.getBoundingClientRect();
    return { x: Math.max(0, Math.min(100, ((e.clientX - r.left) / r.width) * 100)), y: Math.max(0, Math.min(100, ((e.clientY - r.top) / r.height) * 100)) };
  };
  const round = (p: Pt) => ({ x: Math.round(p.x * 10) / 10, y: Math.round(p.y * 10) / 10 });

  const nearestSegment = (p: Pt) => {
    let best = pts.length, bestD = Infinity;
    for (let i = 0; i < pts.length - 1; i++) {
      const a = pts[i], b = pts[i + 1];
      const mx = (a.x + b.x) / 2, my = (a.y + b.y) / 2;
      const d = (mx - p.x) ** 2 + (my - p.y) ** 2;
      if (d < bestD) { bestD = d; best = i + 1; }
    }
    return best;
  };

  const onCanvasClick = (e: React.MouseEvent) => {
    if (mode !== "add" && mode !== "insert") return;
    const p = posFromEvent(e); if (!p) return;
    setPts((prev) => {
      if (mode === "insert" && prev.length >= 2) { const idx = nearestSegment(p); const next = [...prev]; next.splice(idx, 0, round(p)); return next; }
      return [...prev, round(p)];
    });
  };
  const onPointDown = (i: number, e: React.PointerEvent) => {
    e.stopPropagation(); e.preventDefault();
    if (mode === "delete") { setPts((prev) => prev.filter((_, idx) => idx !== i)); return; }
    dragging.current = i;
  };
  const onMove = (e: React.PointerEvent) => {
    if (dragging.current === null) return;
    const p = posFromEvent(e); if (!p) return;
    setPts((prev) => prev.map((x, idx) => (idx === dragging.current ? round(p) : x)));
  };

  const d = smoothPathD(pts);
  const modeBtn = (m: typeof mode, label: string, icon: string) => (
    <button type="button" onClick={() => setMode(m)} className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs transition ${mode === m ? "border-cyan-400/60 bg-cyan-500/10 text-cyan-200" : "border-white/12 text-muted hover:text-ink"}`}>
      <Icon name={icon} size={12} /> {label}
    </button>
  );

  return (
    <form action={formAction} className="space-y-3">
      <p className="text-xs text-muted">Trace the trail drawn on your map art. Click to drop points, drag to bend the curve. The astronaut rides exactly on this line between milestones. The <b>Mobile</b> tab edits a separate trail for the 4:5 phone map — trace it there too so the line matches the art on phones.</p>
      {/* Desktop / Mobile trail switch — each aspect keeps its own curve */}
      <div className="flex gap-1.5">
        {(["desktop", "mobile"] as const).map((v) => (
          <button key={v} type="button" onClick={() => setVariant(v)}
            className={`inline-flex items-center gap-1.5 rounded-full border px-3.5 py-1.5 text-xs font-semibold transition ${variant === v ? "border-amber-400/60 bg-amber-500/10 text-amber-200" : "border-white/12 text-muted hover:text-ink"}`}>
            <Icon name={v === "desktop" ? "monitor" : "user"} size={12} /> {v === "desktop" ? "Desktop trail (16:9)" : "Mobile trail (4:5)"}
          </button>
        ))}
        {variant === "mobile" && (
          <button type="button" onClick={() => setPts(ptsByVariant.desktop.map((p) => ({ ...p })))}
            className="rounded-full border border-white/12 px-3 py-1 text-xs text-muted hover:text-ink">Copy from desktop</button>
        )}
      </div>
      <div className="flex flex-wrap gap-1.5">
        {modeBtn("move", "Move", "target")}
        {modeBtn("add", "Add point", "plus")}
        {modeBtn("insert", "Insert", "plus")}
        {modeBtn("delete", "Delete", "x")}
        <button type="button" onClick={() => setPts(milestones.map((m) => ({ x: m.x, y: m.y })))} className="rounded-full border border-white/12 px-3 py-1 text-xs text-muted hover:text-ink">Seed from milestones</button>
        <button type="button" onClick={() => setPts([])} className="rounded-full border border-rose-400/30 px-3 py-1 text-xs text-rose-300">Clear</button>
      </div>

      <div ref={frame} onPointerMove={onMove} onPointerUp={() => (dragging.current = null)} onPointerLeave={() => (dragging.current = null)}
        onClick={onCanvasClick}
        className={`relative rounded-2xl overflow-hidden select-none touch-none border border-violet-400/15 ${mode === "add" || mode === "insert" ? "cursor-crosshair" : "cursor-default"} ${variant === "mobile" ? "mx-auto max-w-sm w-full" : "w-full"}`}
        style={{ aspectRatio: variant === "mobile" ? "4 / 5" : "16 / 9", background: "#0a0a1c" }}>
        {mapArtUrl
          // eslint-disable-next-line @next/next/no-img-element
          ? <img src={mapArtUrl} alt="quest map" className="absolute inset-0 h-full w-full object-cover" draggable={false} />
          : <div className="absolute inset-0 grid place-items-center text-xs text-muted">Upload quest map art first.</div>}

        {/* Milestone pins for reference */}
        {milestones.map((m) => (
          <span key={m.id} className="absolute -translate-x-1/2 -translate-y-1/2 rounded-full ring-2 ring-white/70 pointer-events-none" style={{ left: `${m.x}%`, top: `${m.y}%`, width: 16, height: 16, background: m.color, boxShadow: `0 0 10px 2px ${m.color}` }} title={m.name} />
        ))}

        {/* Live curve */}
        {d && (
          <svg className="absolute inset-0 h-full w-full pointer-events-none" viewBox="0 0 100 100" preserveAspectRatio="none">
            <path d={d} fill="none" stroke={accent} strokeOpacity="0.9" strokeWidth="0.9" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        )}

        {/* Editable waypoints */}
        {pts.map((p, i) => (
          <button key={i} type="button" onPointerDown={(e) => onPointDown(i, e)} title={`Point ${i + 1}`}
            className={`absolute -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-white ${mode === "delete" ? "cursor-pointer" : "cursor-grab active:cursor-grabbing"}`}
            style={{ left: `${p.x}%`, top: `${p.y}%`, width: 14, height: 14, background: i === 0 ? "#34d399" : i === pts.length - 1 ? "#f43f5e" : accent }} />
        ))}
      </div>

      <input type="hidden" name="points" value={JSON.stringify(pts)} />
      <input type="hidden" name="variant" value={variant} />
      <div className="flex items-center gap-3">
        <button disabled={pending} className="glow-btn pressable rounded-full px-5 py-2 text-sm font-semibold text-white inline-flex items-center gap-1.5 disabled:opacity-50">
          <Icon name="rocket" size={14} /> {pending ? "Saving…" : variant === "mobile" ? "Save mobile trail" : "Save desktop trail"}
        </button>
        <span className="text-xs text-muted">{pts.length} point{pts.length === 1 ? "" : "s"}</span>
        {state?.ok && <span className="text-xs text-emerald-300">✓ {state.message}</span>}
        {state?.error && <span className="text-xs text-rose-300">{state.error}</span>}
      </div>
    </form>
  );
}
