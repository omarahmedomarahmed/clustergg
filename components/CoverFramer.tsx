"use client";

import { useRef, useState } from "react";
import Icon from "@/components/Icon";
import { downscale } from "@/lib/downscale";
import { uploadImage } from "@/lib/upload-client";

type Adjust = { zoom: number; x: number; y: number };

/**
 * Upload + frame a game cover: drag inside the frame to pan, use the slider to
 * zoom. Writes the image to a hidden input (`name`) and the framing to
 * coverZoom / coverX / coverY hidden inputs — so the existing saveGame action
 * reads them unchanged. Live preview matches how the cover renders on the site.
 */
export default function CoverFramer({
  name,
  defaultUrl = "",
  defaultAdjust,
  aspect = "16 / 9",
  maxDim = 1600,
  label = "Cover image",
  hint,
}: {
  name: string;
  defaultUrl?: string | null;
  defaultAdjust?: Adjust;
  aspect?: string;
  maxDim?: number;
  label?: string;
  hint?: string;
}) {
  const [url, setUrl] = useState(defaultUrl ?? "");
  const [adj, setAdj] = useState<Adjust>(defaultAdjust ?? { zoom: 1, x: 50, y: 50 });
  const [busy, setBusy] = useState(false);
  const [urlMode, setUrlMode] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const drag = useRef<{ px: number; py: number; x: number; y: number } | null>(null);

  async function onPick(file: File) {
    if (!file.type.startsWith("image/")) return;
    setBusy(true);
    try { setUrl(await uploadImage(await downscale(file, maxDim, 0.78), "game")); }
    finally { setBusy(false); }
  }

  function onPointerDown(e: React.PointerEvent) {
    if (!url) return;
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
    drag.current = { px: e.clientX, py: e.clientY, x: adj.x, y: adj.y };
  }
  function onPointerMove(e: React.PointerEvent) {
    if (!drag.current) return;
    const box = (e.currentTarget as HTMLElement).getBoundingClientRect();
    // Dragging right should reveal the left of the image → position decreases.
    const dx = ((e.clientX - drag.current.px) / box.width) * 100;
    const dy = ((e.clientY - drag.current.py) / box.height) * 100;
    setAdj((a) => ({ ...a, x: clamp(drag.current!.x - dx), y: clamp(drag.current!.y - dy) }));
  }
  function onPointerUp() { drag.current = null; }

  return (
    <div>
      <div className="text-xs uppercase tracking-widest text-muted mb-1.5">{label}</div>
      <input type="hidden" name={name} value={url} />
      <input type="hidden" name="coverZoom" value={adj.zoom} />
      <input type="hidden" name="coverX" value={adj.x} />
      <input type="hidden" name="coverY" value={adj.y} />

      <div
        className="relative w-full overflow-hidden rounded-xl border border-violet-400/25 bg-black/40 select-none touch-none"
        style={{ aspectRatio: aspect, cursor: url ? "grab" : "default" }}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerLeave={onPointerUp}
      >
        {url ? (
          <div
            className="absolute inset-0 bg-cover"
            style={{ backgroundImage: `url("${url}")`, backgroundPosition: `${adj.x}% ${adj.y}%`, transform: `scale(${adj.zoom})` }}
          />
        ) : (
          <div className="absolute inset-0 flex items-center justify-center text-muted text-sm">
            <span className="inline-flex items-center gap-2"><Icon name="monitor" size={18} /> No cover yet</span>
          </div>
        )}
        {url && (
          <div className="absolute bottom-2 left-2 text-[10px] uppercase tracking-widest text-white/70 bg-black/50 rounded px-2 py-0.5 pointer-events-none">
            Drag to reposition
          </div>
        )}
        {busy && <div className="absolute inset-0 flex items-center justify-center bg-black/60 text-xs text-cyan-300">Optimizing…</div>}
      </div>

      <div className="mt-3 flex flex-wrap items-center gap-3">
        <button type="button" onClick={() => fileRef.current?.click()}
          className="glow-btn pressable rounded-full px-3.5 py-1.5 text-xs font-semibold text-white inline-flex items-center gap-1.5">
          <Icon name="arrowUp" size={12} /> {url ? "Replace" : "Upload cover"}
        </button>
        {url && (
          <button type="button" onClick={() => { setUrl(""); if (fileRef.current) fileRef.current.value = ""; }}
            className="ghost-btn pressable rounded-full px-3.5 py-1.5 text-xs inline-flex items-center gap-1.5">
            <Icon name="x" size={12} /> Remove
          </button>
        )}
        <label className="text-xs text-muted inline-flex items-center gap-2 flex-1 min-w-[160px]">
          <Icon name="search" size={12} /> Zoom
          <input type="range" min={1} max={3} step={0.02} value={adj.zoom}
            onChange={(e) => setAdj((a) => ({ ...a, zoom: Number(e.target.value) }))}
            className="accent-cyan-500 flex-1" />
        </label>
        <button type="button" onClick={() => setAdj({ zoom: 1, x: 50, y: 50 })}
          className="text-xs text-muted hover:text-ink underline underline-offset-2">reset</button>
        <button type="button" onClick={() => setUrlMode((m) => !m)}
          className="text-xs text-muted hover:text-ink underline underline-offset-2">{urlMode ? "hide link" : "or paste a link"}</button>
      </div>

      <input ref={fileRef} type="file" accept="image/*" className="hidden"
        onChange={(e) => { const f = e.target.files?.[0]; if (f) onPick(f); }} />
      {urlMode && (
        <input type="url" placeholder="https://…/cover.jpg"
          defaultValue={url.startsWith("data:") ? "" : url}
          onChange={(e) => setUrl(e.target.value)}
          className="mt-2 w-full rounded-lg border border-violet-400/25 bg-black/30 px-3 py-2 text-sm outline-none focus:border-cyan-400/50" />
      )}
      {hint && <div className="mt-1.5 text-[11px] text-muted leading-snug">{hint}</div>}
    </div>
  );
}

function clamp(n: number) { return Math.max(0, Math.min(100, n)); }
