"use client";

import { useState, useTransition } from "react";
import Icon from "@/components/Icon";
import { downscale } from "@/lib/downscale";
import { portalUploadCreative } from "@/app/actions/brand-portal";

export type PortalSlot = {
  placementId: string; key: string; pageScope: string; width: number; height: number;
  creativeType: string | null; fileUrl: string | null; clickUrl: string | null;
};

// One placement's creative slot on the brand portal: shows the required size, a
// zoomable preview of the current creative, and controls to upload an image or
// paste a looping video URL. Everything is key-validated server-side.
export default function BrandCreativeUploader({ brandId, keyStr, slot }: { brandId: string; keyStr: string; slot: PortalSlot }) {
  const [mode, setMode] = useState<"image" | "video">(slot.creativeType === "video" ? "video" : "image");
  const [videoUrl, setVideoUrl] = useState(slot.creativeType === "video" ? slot.fileUrl ?? "" : "");
  const [clickUrl, setClickUrl] = useState(slot.clickUrl ?? "");
  const [zoom, setZoom] = useState(1);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const submit = (fileUrl: string, type: "image" | "video") => {
    startTransition(async () => {
      const fd = new FormData();
      fd.set("placementId", slot.placementId);
      fd.set("fileUrl", fileUrl);
      fd.set("type", type);
      fd.set("clickUrl", clickUrl);
      const r = await portalUploadCreative(brandId, keyStr, fd);
      setMsg(r?.error ?? "Saved ✓");
    });
  };

  const onFile = async (file: File) => {
    setBusy(true); setMsg(null);
    try {
      const dataUrl = await downscale(file, Math.min(1600, slot.width * 2), 0.85);
      const res = await fetch("/api/brands/upload", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ brandId, key: keyStr, dataUrl }) });
      const json = await res.json();
      if (json?.url) submit(json.url, "image"); else setMsg(json?.error ?? "Upload failed");
    } catch { setMsg("Upload failed"); }
    setBusy(false);
  };

  const filled = !!slot.fileUrl;

  return (
    <div className={`rounded-2xl border p-4 ${filled ? "border-emerald-400/25 bg-emerald-500/[0.04]" : "border-amber-400/25 bg-amber-500/[0.04]"}`}>
      <div className="flex items-center justify-between gap-2 mb-2">
        <div className="min-w-0">
          <div className="font-bold text-sm truncate">{slot.key}</div>
          <div className="text-[11px] text-muted truncate">{slot.pageScope}</div>
        </div>
        <span className="shrink-0 text-[11px] font-mono rounded-full border border-white/12 px-2 py-0.5 text-muted">{slot.width}×{slot.height}</span>
      </div>

      {/* Preview with zoom */}
      <div className="relative overflow-hidden rounded-lg border border-white/10 bg-black/40 mb-2" style={{ aspectRatio: `${slot.width} / ${slot.height}` }}>
        {slot.fileUrl ? (
          slot.creativeType === "video" ? (
            <video src={slot.fileUrl} className="h-full w-full object-cover" style={{ transform: `scale(${zoom})` }} autoPlay muted loop playsInline />
          ) : (
            /* eslint-disable-next-line @next/next/no-img-element */
            <img src={slot.fileUrl} alt="" className="h-full w-full object-cover" style={{ transform: `scale(${zoom})` }} />
          )
        ) : (
          <div className="absolute inset-0 flex items-center justify-center text-[11px] text-muted">No creative yet</div>
        )}
      </div>
      {slot.fileUrl && (
        <div className="flex items-center gap-2 mb-2">
          <Icon name="search" size={12} className="text-muted" />
          <input type="range" min={1} max={3} step={0.05} value={zoom} onChange={(e) => setZoom(Number(e.target.value))} className="flex-1 accent-cyan-400" />
          <span className="text-[10px] text-muted w-8 text-right">{zoom.toFixed(1)}×</span>
        </div>
      )}

      {/* Controls */}
      <div className="flex gap-1.5 mb-2">
        {(["image", "video"] as const).map((m) => (
          <button key={m} type="button" onClick={() => setMode(m)} className={`text-[11px] font-semibold rounded-full px-2.5 py-1 border ${mode === m ? "border-cyan-400/60 bg-cyan-500/15 text-cyan-200" : "border-white/12 text-muted"}`}>{m === "image" ? "Image" : "Looping video"}</button>
        ))}
      </div>

      {mode === "image" ? (
        <label className={`flex items-center justify-center gap-2 rounded-lg border border-dashed border-white/20 py-2 text-xs font-semibold cursor-pointer hover:border-cyan-400/40 ${busy || pending ? "opacity-60 pointer-events-none" : ""}`}>
          <Icon name="plus" size={13} /> {busy ? "Uploading…" : filled ? "Replace image" : "Upload image"}
          <input type="file" accept="image/*" className="hidden" onChange={(e) => { const f = e.target.files?.[0]; if (f) onFile(f); }} />
        </label>
      ) : (
        <div className="flex gap-1.5">
          <input value={videoUrl} onChange={(e) => setVideoUrl(e.target.value)} placeholder="https://…/creative.mp4 (autoplays, loops)" className="flex-1 rounded-lg border border-white/15 bg-black/30 px-2.5 py-1.5 text-xs outline-none focus:border-cyan-400/50" />
          <button type="button" onClick={() => videoUrl.trim() && submit(videoUrl.trim(), "video")} disabled={pending} className="rounded-lg bg-cyan-500/20 border border-cyan-400/40 px-3 text-xs font-semibold text-cyan-200">Save</button>
        </div>
      )}

      <input value={clickUrl} onChange={(e) => setClickUrl(e.target.value)} placeholder="Click-through URL (optional)" className="mt-2 w-full rounded-lg border border-white/12 bg-black/25 px-2.5 py-1.5 text-[11px] outline-none focus:border-cyan-400/50" />
      {msg && <div className="mt-1.5 text-[11px] text-cyan-300">{msg}</div>}
    </div>
  );
}
