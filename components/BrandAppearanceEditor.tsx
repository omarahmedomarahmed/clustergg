"use client";

import { useState, useTransition } from "react";
import Icon from "@/components/Icon";
import { downscale } from "@/lib/downscale";
import { portalSaveAppearance } from "@/app/actions/brand-portal";

type Init = { logoUrl: string; coverUrl: string; portalBgUrl: string };

// Lets a brand restyle its own portal (logo, cover, background art) from inside
// the key-gated portal. Uploads go through the key-validated /api/brands/upload.
export default function BrandAppearanceEditor({ brandId, keyStr, initial }: { brandId: string; keyStr: string; initial: Init }) {
  const [open, setOpen] = useState(false);
  const [vals, setVals] = useState<Init>(initial);
  const [busy, setBusy] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const [pending, start] = useTransition();

  const upload = async (field: keyof Init, file: File, maxDim: number) => {
    setBusy(field); setMsg(null);
    try {
      const dataUrl = await downscale(file, maxDim, 0.85);
      const res = await fetch("/api/brands/upload", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ brandId, key: keyStr, dataUrl }) });
      const json = await res.json();
      if (json?.url) setVals((v) => ({ ...v, [field]: json.url as string }));
      else setMsg(json?.error ?? "Upload failed");
    } catch { setMsg("Upload failed"); }
    setBusy(null);
  };

  const save = () => start(async () => {
    const fd = new FormData();
    fd.set("logoUrl", vals.logoUrl); fd.set("coverUrl", vals.coverUrl); fd.set("portalBgUrl", vals.portalBgUrl);
    try { await portalSaveAppearance(brandId, keyStr, fd); setMsg("Saved ✓ — reload to see it applied."); }
    catch { setMsg("Couldn't save — check your access key."); }
  });

  const Field = ({ field, label, aspect, maxDim, rounded }: { field: keyof Init; label: string; aspect: string; maxDim: number; rounded?: string }) => (
    <div>
      <div className="text-xs text-muted mb-1.5">{label}</div>
      <div className={`relative overflow-hidden border border-white/12 bg-black/40 ${rounded ?? "rounded-xl"}`} style={{ aspectRatio: aspect }}>
        {vals[field]
          // eslint-disable-next-line @next/next/no-img-element
          ? <img src={vals[field]} alt="" className="h-full w-full object-cover" />
          : <span className="absolute inset-0 grid place-items-center text-[11px] text-muted">None</span>}
      </div>
      <label className={`mt-2 flex items-center justify-center gap-2 rounded-lg border border-dashed border-white/20 py-1.5 text-xs font-semibold cursor-pointer hover:border-cyan-400/40 ${busy === field ? "opacity-60 pointer-events-none" : ""}`}>
        <Icon name="arrowUp" size={12} /> {busy === field ? "Uploading…" : vals[field] ? "Replace" : "Upload"}
        <input type="file" accept="image/*" className="hidden" onChange={(e) => { const f = e.target.files?.[0]; if (f) upload(field, f, maxDim); }} />
      </label>
    </div>
  );

  return (
    <div className="glass p-5">
      <button onClick={() => setOpen((v) => !v)} className="w-full flex items-center gap-2 font-bold">
        <Icon name="spark" size={16} className="text-cyan-300" /> Portal appearance
        <Icon name="chevronDown" size={14} className={`ml-auto text-muted transition-transform ${open ? "rotate-180" : ""}`} />
      </button>
      {open && (
        <div className="mt-4 border-t border-white/10 pt-4 space-y-4">
          <div className="grid sm:grid-cols-3 gap-3">
            <Field field="logoUrl" label="Brand logo" aspect="1/1" maxDim={400} />
            <Field field="coverUrl" label="Portal cover" aspect="16/9" maxDim={1400} />
            <Field field="portalBgUrl" label="Background art" aspect="16/9" maxDim={1920} />
          </div>
          <div className="flex items-center gap-3">
            <button onClick={save} disabled={pending} className="glow-btn rounded-full px-5 py-2 text-sm font-semibold text-white disabled:opacity-50">{pending ? "Saving…" : "Save appearance"}</button>
            {msg && <span className="text-xs text-emerald-300">{msg}</span>}
          </div>
        </div>
      )}
    </div>
  );
}
