"use client";

import { useRef, useState } from "react";
import Icon from "@/components/Icon";

// Lightweight pan + zoom (wheel/pinch-less drag) with no dependencies. Wrap a
// full-size "world" layer; children keep their percentage positions so pins and
// paths zoom/pan together. Fixed overlays (labels, panels) go OUTSIDE this.
export default function ZoomPan({ children, className = "", min = 1, max = 4 }: { children: React.ReactNode; className?: string; min?: number; max?: number }) {
  const [t, setT] = useState({ scale: 1, x: 0, y: 0 });
  const drag = useRef<{ x: number; y: number; ox: number; oy: number } | null>(null);
  const clamp = (s: number) => Math.max(min, Math.min(max, s));

  const apply = (scale: number, x: number, y: number) => {
    const s = clamp(scale);
    setT(s <= min ? { scale: min, x: 0, y: 0 } : { scale: s, x, y });
  };

  return (
    <div
      className={`relative overflow-hidden ${className}`}
      style={{ cursor: t.scale > min ? (drag.current ? "grabbing" : "grab") : "default", touchAction: "none" }}
      onWheel={(e) => { e.preventDefault(); apply(t.scale * (e.deltaY < 0 ? 1.12 : 0.89), t.x, t.y); }}
      onPointerDown={(e) => { if (t.scale > min) drag.current = { x: e.clientX, y: e.clientY, ox: t.x, oy: t.y }; }}
      onPointerMove={(e) => { if (drag.current) apply(t.scale, drag.current.ox + (e.clientX - drag.current.x), drag.current.oy + (e.clientY - drag.current.y)); }}
      onPointerUp={() => { drag.current = null; }}
      onPointerLeave={() => { drag.current = null; }}
    >
      <div style={{ transform: `translate(${t.x}px, ${t.y}px) scale(${t.scale})`, transformOrigin: "center center", width: "100%", height: "100%" }}>
        {children}
      </div>

      {/* Zoom controls */}
      <div className="absolute bottom-3 right-3 z-30 flex flex-col gap-1">
        <button type="button" aria-label="Zoom in" onClick={() => apply(t.scale + 0.5, t.x, t.y)}
          className="flex h-8 w-8 items-center justify-center rounded-lg border border-white/15 bg-black/55 backdrop-blur text-white hover:border-cyan-400/50">
          <Icon name="spark" size={13} />＋
        </button>
        <button type="button" aria-label="Zoom out" onClick={() => apply(t.scale - 0.5, t.x, t.y)}
          className="flex h-8 w-8 items-center justify-center rounded-lg border border-white/15 bg-black/55 backdrop-blur text-white hover:border-cyan-400/50">
          −
        </button>
        {t.scale > min && (
          <button type="button" aria-label="Reset" onClick={() => setT({ scale: min, x: 0, y: 0 })}
            className="flex h-8 w-8 items-center justify-center rounded-lg border border-white/15 bg-black/55 backdrop-blur text-white hover:border-cyan-400/50">
            <Icon name="target" size={14} />
          </button>
        )}
      </div>
    </div>
  );
}
