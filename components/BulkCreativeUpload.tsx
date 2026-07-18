"use client";

import { useRef, useState } from "react";
import { saveCreativesBulk } from "@/app/actions/admin";
import { downscale } from "@/lib/downscale";
import { uploadImage } from "@/lib/upload-client";
import Icon from "@/components/Icon";

type Staged = { url: string; name: string };

// Pick many image files at once → each is downscaled + uploaded to Blob, then
// all are saved as separate creatives in a single submit.
export default function BulkCreativeUpload({ brands }: { brands: { id: string; name: string }[] }) {
  const [brandId, setBrandId] = useState(brands[0]?.id ?? "");
  const [staged, setStaged] = useState<Staged[]>([]);
  const [busy, setBusy] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  async function onFiles(files: FileList) {
    setBusy(true);
    const next: Staged[] = [];
    for (const f of Array.from(files)) {
      if (!f.type.startsWith("image/")) continue;
      try {
        const dataUrl = await downscale(f, 1600, 0.85);
        const url = await uploadImage(dataUrl, "creative");
        next.push({ url, name: f.name.replace(/\.[a-z0-9]+$/i, "").slice(0, 80) || "Creative" });
      } catch { /* skip bad file */ }
    }
    setStaged((prev) => [...prev, ...next]);
    setBusy(false);
    if (fileRef.current) fileRef.current.value = "";
  }

  return (
    <div className="glass p-6 mb-8">
      <h2 className="font-bold mb-1 flex items-center gap-2"><Icon name="grid" size={16} className="text-violet-300" /> Bulk upload creatives</h2>
      <p className="text-xs text-muted mb-4">Pick several images at once — each becomes its own creative for the chosen brand, ready to review and link to placements.</p>
      <div className="flex flex-wrap items-center gap-2 mb-3">
        <select value={brandId} onChange={(e) => setBrandId(e.target.value)} className="input-cosmic text-sm">
          {brands.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
        </select>
        <button type="button" onClick={() => fileRef.current?.click()} disabled={busy}
          className="ghost-btn pressable rounded-full px-4 py-2 text-sm inline-flex items-center gap-1.5 disabled:opacity-50">
          <Icon name="arrowUp" size={13} /> {busy ? "Uploading…" : "Choose images"}
        </button>
        <input ref={fileRef} type="file" accept="image/*" multiple className="hidden"
          onChange={(e) => { if (e.target.files?.length) onFiles(e.target.files); }} />
        {staged.length > 0 && <span className="text-xs text-muted">{staged.length} ready</span>}
      </div>

      {staged.length > 0 && (
        <>
          <div className="flex flex-wrap gap-2 mb-3">
            {staged.map((s, i) => (
              <div key={i} className="relative">
                <div className="h-16 w-24 rounded-md overflow-hidden border border-white/10 bg-black/40">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={s.url} alt="" className="h-full w-full object-cover" />
                </div>
                <button type="button" onClick={() => setStaged((p) => p.filter((_, j) => j !== i))}
                  className="absolute -top-1.5 -right-1.5 h-5 w-5 rounded-full bg-black/80 border border-white/20 text-rose-300 grid place-items-center"><Icon name="x" size={11} /></button>
              </div>
            ))}
          </div>
          <form action={saveCreativesBulk}>
            <input type="hidden" name="brandId" value={brandId} />
            <input type="hidden" name="items" value={JSON.stringify(staged.map((s) => ({ url: s.url, name: s.name, type: "image" })))} />
            <button className="glow-btn rounded-full px-6 py-2 text-sm font-semibold text-white">Save {staged.length} creative{staged.length === 1 ? "" : "s"}</button>
          </form>
        </>
      )}
    </div>
  );
}
