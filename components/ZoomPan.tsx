"use client";

import { useEffect, useRef, useState } from "react";
import Icon from "@/components/Icon";

// Floating pan + zoom with no dependencies. The "world" layer starts slightly
// zoomed in and is NOT clipped — zooming grows the art in place and lets it
// overflow onto the page background instead of cropping it inside a card. Wheel
// zooms toward the cursor and locks page scroll while the pointer is over the
// art. Children keep their percentage positions so pins/paths move together.
export default function ZoomPan({
  children, className = "", min = 1, max = 6, initial = 1.5,
}: { children: React.ReactNode; className?: string; min?: number; max?: number; initial?: number }) {
  const box = useRef<HTMLDivElement | null>(null);
  const [t, setT] = useState({ scale: initial, x: 0, y: 0 });
  const drag = useRef<{ x: number; y: number; ox: number; oy: number } | null>(null);
  const clamp = (s: number) => Math.max(min, Math.min(max, s));

  // Zoom keeping the point (cx, cy) — relative to the box center — stationary.
  const zoomAt = (factor: number, cx: number, cy: number) => {
    setT((prev) => {
      const s2 = clamp(prev.scale * factor);
      if (s2 === prev.scale) return prev;
      const k = s2 / prev.scale;
      return { scale: s2, x: cx - (cx - prev.x) * k, y: cy - (cy - prev.y) * k };
    });
  };
  const zoomButton = (factor: number) => zoomAt(factor, 0, 0);

  // Wheel zoom via a native non-passive listener so we can block page scroll.
  useEffect(() => {
    const el = box.current;
    if (!el) return;
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      const r = el.getBoundingClientRect();
      const cx = e.clientX - (r.left + r.width / 2);
      const cy = e.clientY - (r.top + r.height / 2);
      zoomAt(e.deltaY < 0 ? 1.14 : 0.88, cx, cy);
    };
    el.addEventListener("wheel", onWheel, { passive: false });
    return () => el.removeEventListener("wheel", onWheel);
  }, [min, max]);

  const btn = "flex h-8 w-8 items-center justify-center rounded-lg border border-white/15 bg-black/55 backdrop-blur text-white text-lg leading-none hover:border-cyan-400/50 transition-colors";

  return (
    <div
      ref={box}
      className={`relative ${className}`}
      style={{ cursor: drag.current ? "grabbing" : "grab", touchAction: "none" }}
      onPointerDown={(e) => { drag.current = { x: e.clientX, y: e.clientY, ox: t.x, oy: t.y }; (e.target as HTMLElement).setPointerCapture?.(e.pointerId); }}
      onPointerMove={(e) => { if (drag.current) setT((p) => ({ ...p, x: drag.current!.ox + (e.clientX - drag.current!.x), y: drag.current!.oy + (e.clientY - drag.current!.y) })); }}
      onPointerUp={() => { drag.current = null; }}
      onPointerCancel={() => { drag.current = null; }}
    >
      {/* World layer — overflow visible so the art grows past the frame */}
      <div className="absolute inset-0 will-change-transform" style={{ transform: `translate(${t.x}px, ${t.y}px) scale(${t.scale})`, transformOrigin: "center center" }}>
        {children}
      </div>

      {/* Zoom controls — top-left, floating over the art */}
      <div className="absolute top-3 left-3 z-30 flex flex-col gap-1">
        <button type="button" aria-label="Zoom in" onClick={() => zoomButton(1.3)} className={btn}>＋</button>
        <button type="button" aria-label="Zoom out" onClick={() => zoomButton(1 / 1.3)} className={btn}>−</button>
        <button type="button" aria-label="Reset view" onClick={() => setT({ scale: initial, x: 0, y: 0 })} className={btn}>
          <Icon name="target" size={14} />
        </button>
      </div>
    </div>
  );
}
