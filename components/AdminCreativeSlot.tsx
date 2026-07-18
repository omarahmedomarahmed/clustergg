"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import Icon from "@/components/Icon";
import { downscale } from "@/lib/downscale";
import { uploadImage } from "@/lib/upload-client";
import { adminUploadCreativeToPlacement } from "@/app/actions/admin";

export type AdminSlot = {
  placementId: string; key: string; pageScope: string; width: number; height: number;
  creativeType: string | null; fileUrl: string | null; clickUrl: string | null;
};

// One placement's creative on the campaign page: a collapsed thumbnail that
// expands to upload/replace the creative (image or looping-video URL) with a
// zoom preview. A popup shows the creative full size; a link opens the live
// placement. Mirrors the brand portal uploader but admin-side.
export default function AdminCreativeSlot({ campaignId, slot, liveUrl }: { campaignId: string; slot: AdminSlot; liveUrl?: string }) {
  const [open, setOpen] = useState(false);
  const [preview, setPreview] = useState(false);
  const [mode, setMode] = useState<"image" | "video">(slot.creativeType === "video" ? "video" : "image");
  const [videoUrl, setVideoUrl] = useState(slot.creativeType === "video" ? slot.fileUrl ?? "" : "");
  const [clickUrl, setClickUrl] = useState(slot.clickUrl ?? "");
  const [zoom, setZoom] = useState(1);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const filled = !!slot.fileUrl;

  const submit = (fileUrl: string, type: "image" | "video") => {
    start(async () => {
      const fd = new FormData();
      fd.set("placementId", slot.placementId); fd.set("fileUrl", fileUrl); fd.set("type", type); fd.set("clickUrl", clickUrl);
      const r = await adminUploadCreativeToPlacement(campaignId, fd);
      setMsg(r?.error ?? "Saved ✓");
    });
  };
  const onFile = async (file: File) => {
    setBusy(true); setMsg(null);
    try { submit(await uploadImage(await downscale(file, Math.min(1600, slot.width * 2), 0.85), "creative"), "image"); }
    catch { setMsg("Upload failed"); }
    setBusy(false);
  };

  return (
    <div className={`rounded-xl border ${filled ? "border-emerald-400/25 bg-emerald-500/[0.04]" : "border-amber-400/25 bg-amber-500/[0.04]"}`}>
      {/* Collapsed header — small icon + actions (no nested interactive els) */}
      <div className="flex w-full items-center gap-2.5 p-2.5">
        <button onClick={() => filled ? setPreview(true) : setOpen(true)} title={filled ? "View full size" : "Add creative"}
          className="relative h-9 w-14 shrink-0 overflow-hidden rounded bg-black/40 ring-1 ring-white/10 group">
          {slot.fileUrl ? (
            slot.creativeType === "video"
              ? <video src={slot.fileUrl} className="h-full w-full object-cover" muted />
              : /* eslint-disable-next-line @next/next/no-img-element */ <img src={slot.fileUrl} alt="" className="h-full w-full object-cover" />
          ) : <span className="flex h-full w-full items-center justify-center text-muted"><Icon name="monitor" size={12} /></span>}
          {filled && <span className="absolute inset-0 hidden group-hover:flex items-center justify-center bg-black/50 text-white"><Icon name="eye" size={13} /></span>}
        </button>
        <button onClick={() => setOpen((v) => !v)} className="min-w-0 flex-1 text-left">
          <span className="block text-xs font-bold truncate">{slot.key}</span>
          <span className="block text-[10px] text-muted truncate">{slot.width}×{slot.height} · {slot.pageScope}</span>
        </button>
        {filled && <button onClick={() => setPreview(true)} title="Open full size" className="text-muted hover:text-cyan-300"><Icon name="eye" size={14} /></button>}
        {liveUrl && <Link href={liveUrl} target="_blank" title="Open the live placement" className="text-muted hover:text-cyan-300"><Icon name="link" size={13} /></Link>}
        <span className={`text-[10px] font-bold ${filled ? "text-emerald-300" : "text-amber-300"}`}>{filled ? "✓" : "todo"}</span>
        <button onClick={() => setOpen((v) => !v)} className="text-muted"><Icon name={open ? "chevronDown" : "chevronRight"} size={13} /></button>
      </div>

      {/* Full-size popup */}
      {preview && slot.fileUrl && (
        <div className="fixed inset-0 z-[80] flex items-center justify-center bg-black/80 p-4" onClick={() => setPreview(false)}>
          <div onClick={(e) => e.stopPropagation()} className="max-w-3xl w-full">
            <div className="flex items-center justify-between mb-2">
              <div className="text-sm font-bold text-white">{slot.key} <span className="text-muted font-normal">· {slot.width}×{slot.height}</span></div>
              <div className="flex items-center gap-3">
                {liveUrl && <Link href={liveUrl} target="_blank" className="text-xs text-cyan-300 inline-flex items-center gap-1"><Icon name="link" size={12} /> live placement</Link>}
                <button onClick={() => setPreview(false)} className="text-white/80 hover:text-white"><Icon name="x" size={18} /></button>
              </div>
            </div>
            <div className="rounded-xl overflow-hidden border border-white/15 bg-black/50" style={{ aspectRatio: `${slot.width} / ${slot.height}` }}>
              {slot.creativeType === "video"
                ? <video src={slot.fileUrl} className="h-full w-full object-contain" autoPlay muted loop controls />
                : /* eslint-disable-next-line @next/next/no-img-element */ <img src={slot.fileUrl} alt="" className="h-full w-full object-contain" />}
            </div>
          </div>
        </div>
      )}

      {open && (
        <div className="border-t border-white/10 p-3 space-y-2">
          {slot.fileUrl && (
            <div className="relative overflow-hidden rounded-lg border border-white/10 bg-black/40" style={{ aspectRatio: `${slot.width} / ${slot.height}` }}>
              {slot.creativeType === "video"
                ? <video src={slot.fileUrl} className="h-full w-full object-cover" style={{ transform: `scale(${zoom})` }} autoPlay muted loop />
                : /* eslint-disable-next-line @next/next/no-img-element */ <img src={slot.fileUrl} alt="" className="h-full w-full object-cover" style={{ transform: `scale(${zoom})` }} />}
            </div>
          )}
          {slot.fileUrl && (
            <div className="flex items-center gap-2"><Icon name="search" size={12} className="text-muted" />
              <input type="range" min={1} max={3} step={0.05} value={zoom} onChange={(e) => setZoom(Number(e.target.value))} className="flex-1 accent-cyan-400" />
              <span className="text-[10px] text-muted w-8 text-right">{zoom.toFixed(1)}×</span>
            </div>
          )}
          <div className="flex gap-1.5">
            {(["image", "video"] as const).map((m) => (
              <button key={m} type="button" onClick={() => setMode(m)} className={`text-[11px] font-semibold rounded-full px-2.5 py-1 border ${mode === m ? "border-cyan-400/60 bg-cyan-500/15 text-cyan-200" : "border-white/12 text-muted"}`}>{m === "image" ? "Image" : "Video"}</button>
            ))}
          </div>
          {mode === "image" ? (
            <label className={`flex items-center justify-center gap-2 rounded-lg border border-dashed border-white/20 py-2 text-xs font-semibold cursor-pointer hover:border-cyan-400/40 ${busy || pending ? "opacity-60 pointer-events-none" : ""}`}>
              <Icon name="plus" size={13} /> {busy ? "Uploading…" : filled ? "Replace image" : "Upload image"}
              <input type="file" accept="image/*" className="hidden" onChange={(e) => { const f = e.target.files?.[0]; if (f) onFile(f); }} />
            </label>
          ) : (
            <div className="flex gap-1.5">
              <input value={videoUrl} onChange={(e) => setVideoUrl(e.target.value)} placeholder="https://…/creative.mp4" className="flex-1 rounded-lg border border-white/15 bg-black/30 px-2.5 py-1.5 text-xs outline-none focus:border-cyan-400/50" />
              <button type="button" onClick={() => videoUrl.trim() && submit(videoUrl.trim(), "video")} disabled={pending} className="rounded-lg bg-cyan-500/20 border border-cyan-400/40 px-3 text-xs font-semibold text-cyan-200">Save</button>
            </div>
          )}
          <input value={clickUrl} onChange={(e) => setClickUrl(e.target.value)} placeholder="Click-through URL (optional)" className="w-full rounded-lg border border-white/12 bg-black/25 px-2.5 py-1.5 text-[11px] outline-none focus:border-cyan-400/50" />
          {msg && <div className="text-[11px] text-cyan-300">{msg}</div>}
        </div>
      )}
    </div>
  );
}
