"use client";

import { useActionState, useState } from "react";
import { saveBrandLogo, type ActionState } from "@/app/actions/admin";
import ImageUpload from "@/components/ImageUpload";

// Admin editor for the platform logo (nav + footer): upload an image, then zoom
// and drag to frame it inside the round logo mark. Live preview mirrors exactly
// how it renders in the nav.
export default function LogoEditor({
  defaultUrl, defaultZoom, defaultX, defaultY,
}: { defaultUrl: string; defaultZoom: number; defaultX: number; defaultY: number }) {
  const [url, setUrl] = useState(defaultUrl);
  const [zoom, setZoom] = useState(defaultZoom);
  const [x, setX] = useState(defaultX);
  const [y, setY] = useState(defaultY);
  const [state, formAction, pending] = useActionState<ActionState, FormData>(saveBrandLogo, undefined);

  const preview = (size: number) => (
    <span className="relative inline-block overflow-hidden rounded-full ring-1 ring-violet-400/30" style={{ width: size, height: size }}>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={url || "/assets/logo.png"} alt="" className="h-full w-full object-cover"
        style={{ objectPosition: `${x}% ${y}%`, transform: `scale(${zoom})` }} />
    </span>
  );

  return (
    <form action={formAction} className="grid md:grid-cols-[1fr_auto] gap-6 items-start">
      <div className="space-y-4">
        <ImageUpload value={url} onChange={setUrl} label="Logo image" aspect="1/1" rounded="rounded-full" maxDim={512} scope="content" hint="Square works best — then frame it with the controls." />
        <label className="block text-xs text-muted">Zoom <span className="text-cyan-300">{zoom.toFixed(2)}×</span>
          <input type="range" min={0.5} max={3} step={0.05} value={zoom} onChange={(e) => setZoom(Number(e.target.value))} className="w-full accent-violet-500" />
        </label>
        <label className="block text-xs text-muted">Horizontal <span className="text-cyan-300">{x}%</span>
          <input type="range" min={0} max={100} value={x} onChange={(e) => setX(Number(e.target.value))} className="w-full accent-violet-500" />
        </label>
        <label className="block text-xs text-muted">Vertical <span className="text-cyan-300">{y}%</span>
          <input type="range" min={0} max={100} value={y} onChange={(e) => setY(Number(e.target.value))} className="w-full accent-violet-500" />
        </label>

        <input type="hidden" name="logoUrl" value={url} />
        <input type="hidden" name="zoom" value={zoom} />
        <input type="hidden" name="x" value={x} />
        <input type="hidden" name="y" value={y} />
        <div className="flex items-center gap-3">
          <button disabled={pending} className="glow-btn rounded-full px-6 py-2 text-sm font-semibold text-white">
            {pending ? "Saving…" : "Save logo"}
          </button>
          {state?.ok && <span className="text-xs text-emerald-300">✓ {state.message}</span>}
          {state?.error && <span className="text-xs text-rose-300">{state.error}</span>}
        </div>
      </div>

      {/* Live previews at the sizes used across the site */}
      <div className="flex flex-col items-center gap-4 rounded-2xl border border-violet-400/15 p-5 bg-black/20">
        <div className="text-[10px] uppercase tracking-widest text-muted">Preview</div>
        <div className="flex items-center gap-2">{preview(38)} <span className="text-lg font-bold grad-text">CLUSTER</span></div>
        {preview(64)}
        <div className="text-[10px] text-muted">nav · footer · big</div>
      </div>
    </form>
  );
}
