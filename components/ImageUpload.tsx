"use client";

import { useRef, useState } from "react";
import Icon from "@/components/Icon";
import { downscale } from "@/lib/downscale";
import { uploadImage } from "@/lib/upload-client";
import { bakeFrame } from "@/lib/reframe";

/**
 * Real image upload used everywhere in place of a raw URL text box.
 *
 * The picked file is downscaled in the browser, then the admin can zoom + drag
 * to frame it. The zoom is BAKED into the stored image (canvas) so it actually
 * enlarges the crop everywhere the image renders — not just a preview. The
 * result is uploaded to Blob and written to a hidden <input name={name}>.
 */
export default function ImageUpload({
  name,
  defaultValue = "",
  value: controlledValue,
  onChange,
  label,
  aspect = "16/9",
  rounded = "rounded-xl",
  maxDim = 1280,
  quality = 0.85,
  hint,
  scope = "misc",
  zoomable = true,
  previewWidth = 120,
}: {
  name?: string;
  defaultValue?: string | null;
  value?: string;
  onChange?: (v: string) => void;
  label?: string;
  aspect?: string;
  rounded?: string;
  maxDim?: number;
  quality?: number;
  hint?: string;
  scope?: string;
  /** Show the zoom + reframe controls (default true). */
  zoomable?: boolean;
  /** Width (px) of the framing preview box. Widen for wide lockups (wordmark). */
  previewWidth?: number;
}) {
  const controlled = onChange !== undefined;
  const [internal, setInternal] = useState(defaultValue ?? "");
  const value = controlled ? (controlledValue ?? "") : internal;
  const setValue = (v: string) => { if (controlled) onChange!(v); else setInternal(v); };
  const [busy, setBusy] = useState(false);
  const [urlMode, setUrlMode] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  // Framing state. `orig` is the un-baked source we re-bake from on every commit.
  // Seed it from whatever image we already have (controlled value or defaultValue)
  // so zooming an *existing* image re-bakes from it instead of blanking out.
  const orig = useRef<string>(defaultValue || controlledValue || "");
  const [zoom, setZoom] = useState(1);
  const [pos, setPos] = useState({ x: 50, y: 50 });
  const drag = useRef<{ px: number; py: number; x: number; y: number } | null>(null);

  // aspect "16/9" -> ratio 16/9; output dims from maxDim.
  const [aw, ah] = aspect.split("/").map((n) => Number(n.trim()) || 1);
  const ratio = aw / ah;
  const outW = ratio >= 1 ? maxDim : Math.round(maxDim * ratio);
  const outH = ratio >= 1 ? Math.round(maxDim / ratio) : maxDim;

  async function onPick(file: File) {
    setError(null);
    if (!file.type.startsWith("image/")) { setError("Please choose an image file."); return; }
    setBusy(true);
    try {
      const dataUrl = await downscale(file, maxDim, quality);
      orig.current = dataUrl;
      setZoom(1); setPos({ x: 50, y: 50 });
      setValue(await uploadImage(dataUrl, scope));
    } catch {
      setError("Couldn't read that image. Try another file.");
    } finally {
      setBusy(false);
    }
  }

  // Re-bake the frame from the original and upload — the stored image is now the
  // zoomed crop. Called when the admin finishes a zoom/drag gesture. For an
  // existing image (no captured original) we bake from the current value and pin
  // it as the baseline so repeated gestures don't compound.
  async function commitFrame(nextZoom: number, nextPos: { x: number; y: number }) {
    if (!orig.current && value) orig.current = value;
    const source = orig.current;
    if (!source || (nextZoom === 1 && nextPos.x === 50 && nextPos.y === 50 && !value)) return;
    setBusy(true);
    try {
      const baked = await bakeFrame(source, { zoom: nextZoom, x: nextPos.x, y: nextPos.y, outW, outH });
      setValue(await uploadImage(baked, scope));
    } catch { /* keep current */ } finally { setBusy(false); }
  }

  function onPointerDown(e: React.PointerEvent) {
    if (!value || !zoomable) return;
    (e.target as HTMLElement).setPointerCapture?.(e.pointerId);
    drag.current = { px: e.clientX, py: e.clientY, x: pos.x, y: pos.y };
  }
  function onPointerMove(e: React.PointerEvent) {
    if (!drag.current) return;
    const box = (e.currentTarget as HTMLElement).getBoundingClientRect();
    const dx = ((e.clientX - drag.current.px) / box.width) * 100;
    const dy = ((e.clientY - drag.current.py) / box.height) * 100;
    setPos({ x: clamp(drag.current.x - dx), y: clamp(drag.current.y - dy) });
  }
  function onPointerUp() { if (drag.current) { drag.current = null; commitFrame(zoom, pos); } }

  return (
    <div>
      {label && <div className="text-xs uppercase tracking-widest text-muted mb-1.5">{label}</div>}
      {name && <input type="hidden" name={name} value={value} />}

      <div className="flex items-start gap-3">
        <div
          className={`relative shrink-0 overflow-hidden border border-violet-400/25 bg-black/40 ${rounded} select-none touch-none`}
          style={{ width: previewWidth, aspectRatio: aspect, cursor: value && zoomable ? (drag.current ? "grabbing" : "grab") : "default" }}
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
          onPointerLeave={onPointerUp}
        >
          {value ? (
            // Live preview reflects zoom/pan (baked on commit). Frames from the
            // original (or the current value if that's all we have) so it never blanks.
            <div className="absolute inset-0 bg-cover bg-center" style={{ backgroundImage: `url("${(zoom !== 1 || pos.x !== 50 || pos.y !== 50) ? (orig.current || value) : value}")`, backgroundPosition: `${pos.x}% ${pos.y}%`, transform: `scale(${zoom})`, transformOrigin: "center" }} />
          ) : (
            <div className="flex h-full w-full items-center justify-center text-muted"><Icon name="monitor" size={20} /></div>
          )}
          {busy && <div className="absolute inset-0 flex items-center justify-center bg-black/60 text-xs text-cyan-300">Optimizing…</div>}
        </div>

        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap gap-2">
            <button type="button" onClick={() => fileRef.current?.click()}
              className="glow-btn pressable rounded-full px-3.5 py-1.5 text-xs font-semibold text-white inline-flex items-center gap-1.5">
              <Icon name="arrowUp" size={12} /> {value ? "Replace" : "Upload image"}
            </button>
            {value && (
              <button type="button" onClick={() => { setValue(""); orig.current = ""; setZoom(1); setPos({ x: 50, y: 50 }); if (fileRef.current) fileRef.current.value = ""; }}
                className="ghost-btn pressable rounded-full px-3.5 py-1.5 text-xs inline-flex items-center gap-1.5">
                <Icon name="x" size={12} /> Remove
              </button>
            )}
            <button type="button" onClick={() => setUrlMode((m) => !m)}
              className="text-xs text-muted hover:text-ink underline underline-offset-2 px-1">
              {urlMode ? "hide link" : "or paste a link"}
            </button>
          </div>

          {/* Zoom control — baked into the image on release */}
          {value && zoomable && (
            <div className="mt-2 flex items-center gap-2">
              <Icon name="search" size={12} className="text-muted" />
              <input type="range" min={1} max={4} step={0.02} value={zoom}
                onChange={(e) => setZoom(Number(e.target.value))}
                onPointerUp={() => commitFrame(zoom, pos)}
                onKeyUp={() => commitFrame(zoom, pos)}
                className="flex-1 accent-cyan-500" />
              <span className="text-[10px] text-muted w-8 text-right">{zoom.toFixed(1)}×</span>
              {(zoom !== 1 || pos.x !== 50 || pos.y !== 50) && (
                <button type="button" onClick={() => { setZoom(1); setPos({ x: 50, y: 50 }); commitFrame(1, { x: 50, y: 50 }); }}
                  className="text-[10px] text-muted hover:text-ink underline">reset</button>
              )}
            </div>
          )}
          {value && zoomable && <div className="mt-1 text-[10px] text-muted">Drag the image to reposition · slide to zoom — the crop is saved.</div>}

          <input ref={fileRef} type="file" accept="image/*" className="hidden"
            onChange={(e) => { const f = e.target.files?.[0]; if (f) onPick(f); }} />

          {urlMode && (
            <input type="url" placeholder="https://…/image.png"
              defaultValue={value.startsWith("data:") ? "" : value}
              onChange={(e) => { orig.current = e.target.value; setValue(e.target.value); }}
              className="mt-2 w-full rounded-lg border border-violet-400/25 bg-black/30 px-3 py-2 text-sm outline-none focus:border-cyan-400/50" />
          )}

          {hint && <div className="mt-1.5 text-[11px] text-muted leading-snug">{hint}</div>}
          {error && <div className="mt-1.5 text-[11px] text-rose-300">{error}</div>}
        </div>
      </div>
    </div>
  );
}

function clamp(n: number) { return Math.max(0, Math.min(100, n)); }
