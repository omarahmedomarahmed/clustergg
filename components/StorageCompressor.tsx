"use client";

import { useMemo, useRef, useState } from "react";
import Icon from "@/components/Icon";
import { recompressImage, deleteImages } from "@/app/actions/storage";

export type CompRow = { url: string; label: string; table: string; field: string; size: number | null; cat: string };
type Kind = "image" | "video" | "glb" | "svg" | "other";
type St = { state: "idle" | "work" | "done" | "err"; newSize?: number; msg?: string };

const kindOf = (url: string): Kind => {
  const u = url.split("?")[0].toLowerCase();
  if (u.endsWith(".mp4") || url.startsWith("data:video")) return "video";
  if (u.endsWith(".glb") || u.endsWith(".gltf")) return "glb";
  if (u.endsWith(".svg") || url.startsWith("data:image/svg")) return "svg";
  if (url.startsWith("data:image/") || /\.(png|jpe?g|webp|gif|avif)(\?|$)/i.test(url)) return "image";
  return "other";
};
const kb = (n?: number | null) => n == null ? "—" : n >= 1024 * 1024 ? `${(n / 1024 / 1024).toFixed(2)} MB` : `${Math.round(n / 1024)} KB`;

// Browser-side image compression: fetch → downscale on canvas → WebP data URL.
async function compressToDataUrl(url: string, maxDim: number, quality: number): Promise<string> {
  const resp = await fetch(url, { mode: "cors" });
  if (!resp.ok) throw new Error(`fetch ${resp.status}`);
  const blob = await resp.blob();
  const bmp = await createImageBitmap(blob);
  let { width, height } = bmp;
  if (width > maxDim || height > maxDim) {
    const s = Math.min(maxDim / width, maxDim / height);
    width = Math.round(width * s); height = Math.round(height * s);
  }
  const c = document.createElement("canvas");
  c.width = Math.max(1, width); c.height = Math.max(1, height);
  const ctx = c.getContext("2d");
  if (!ctx) throw new Error("no canvas");
  ctx.drawImage(bmp, 0, 0, width, height);
  bmp.close?.();
  return c.toDataURL("image/webp", quality);
}

// Admin bulk image optimiser: compress + replace big Blob/CDN images in place to
// cut Vercel Blob data transfer. Also supports bulk download (per file) and bulk
// delete as fallbacks.
export default function StorageCompressor({ rows }: { rows: CompRow[] }) {
  const [quality, setQuality] = useState(0.72);
  const [maxDim, setMaxDim] = useState(1280);
  const [q, setQ] = useState("");
  const [cat, setCat] = useState<"all" | "vercel-blob" | "higgsfield" | "inline-dataurl">("all");
  const [hugeOnly, setHugeOnly] = useState(true);
  const [status, setStatus] = useState<Record<string, St>>({});
  const [sel, setSel] = useState<Record<string, boolean>>({});
  const [running, setRunning] = useState(false);
  const [saved, setSaved] = useState(0);
  const cancel = useRef(false);

  // Unique-by-URL (a URL used in several places is compressed once; the replace
  // updates every reference).
  const unique = useMemo(() => {
    const m = new Map<string, CompRow>();
    for (const r of rows) if (!m.has(r.url)) m.set(r.url, r);
    return [...m.values()];
  }, [rows]);

  const shown = useMemo(() => unique.filter((r) => {
    if (cat !== "all" && r.cat !== cat) return false;
    if (hugeOnly && (r.size ?? 0) < 500 * 1024) return false;
    if (q && !(`${r.label} ${r.table} ${r.field}`.toLowerCase().includes(q.toLowerCase()))) return false;
    return true;
  }), [unique, cat, hugeOnly, q]);

  const setSt = (url: string, s: St) => setStatus((m) => ({ ...m, [url]: s }));

  const compressOne = async (r: CompRow) => {
    if (kindOf(r.url) !== "image") { setSt(r.url, { state: "err", msg: "not a compressible image" }); return; }
    setSt(r.url, { state: "work" });
    try {
      const dataUrl = await compressToDataUrl(r.url, maxDim, quality);
      const res = await recompressImage({ oldUrl: r.url, dataUrl, name: `${r.table}-${r.label}-${r.field}` });
      if (res.error) { setSt(r.url, { state: "err", msg: res.error }); return; }
      const newSize = res.bytes ?? 0;
      setSt(r.url, { state: "done", newSize, msg: `→ ${kb(newSize)} · ${res.replaced ?? 0} refs` });
      setSaved((s) => s + Math.max(0, (r.size ?? 0) - newSize));
    } catch (e) {
      setSt(r.url, { state: "err", msg: String(e).slice(0, 60) });
    }
  };

  const compressAll = async () => {
    setRunning(true); cancel.current = false;
    for (const r of shown) {
      if (cancel.current) break;
      if (kindOf(r.url) !== "image") continue;
      if (status[r.url]?.state === "done") continue;
      await compressOne(r);
    }
    setRunning(false);
  };

  const downloadOne = async (r: CompRow) => {
    try {
      const resp = await fetch(r.url, { mode: "cors" });
      const blob = await resp.blob();
      const ext = (r.url.split("?")[0].split(".").pop() || "img").slice(0, 4);
      const a = document.createElement("a");
      a.href = URL.createObjectURL(blob);
      a.download = `${r.table}-${r.label}-${r.field}.${ext}`.replace(/[^a-z0-9.-]/gi, "-");
      document.body.appendChild(a); a.click(); a.remove();
      setTimeout(() => URL.revokeObjectURL(a.href), 4000);
    } catch { /* ignore */ }
  };
  const downloadAll = async () => {
    for (const r of shown) { if (cancel.current) break; await downloadOne(r); await new Promise((res) => setTimeout(res, 400)); }
  };

  const delSelected = async () => {
    const urls = Object.keys(sel).filter((u) => sel[u]);
    if (urls.length === 0) return;
    if (!confirm(`Delete ${urls.length} image(s) everywhere and remove the Blob objects? This cannot be undone.`)) return;
    setRunning(true);
    const res = await deleteImages(urls);
    setRunning(false);
    setSel({});
    alert(`Removed ${res.removed} Blob object(s). Reload to refresh the list.`);
  };

  const compressibleShown = shown.filter((r) => kindOf(r.url) === "image").length;

  return (
    <div className="glass p-5 space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <h2 className="font-bold flex items-center gap-2"><Icon name="zap" size={16} className="text-cyan-300" /> Bulk image optimiser</h2>
        <span className="text-xs text-emerald-300 font-semibold">Saved so far: {kb(saved)}</span>
      </div>
      <p className="text-sm text-muted">
        Compress big images in place — the new smaller image replaces every reference and the old Blob object is deleted,
        so it stops counting toward data transfer. Videos / 3D meshes can only be downloaded or deleted (not re-compressed here).
      </p>

      {/* Controls */}
      <div className="flex flex-wrap items-end gap-3">
        <label className="text-[11px] text-muted">Max size (px): <b className="text-ink">{maxDim}</b>
          <input type="range" min={480} max={2048} step={64} value={maxDim} onChange={(e) => setMaxDim(Number(e.target.value))} className="block w-40 accent-cyan-400" />
        </label>
        <label className="text-[11px] text-muted">Quality: <b className="text-ink">{quality.toFixed(2)}</b>
          <input type="range" min={0.4} max={0.95} step={0.01} value={quality} onChange={(e) => setQuality(Number(e.target.value))} className="block w-40 accent-cyan-400" />
        </label>
        <select value={cat} onChange={(e) => setCat(e.target.value as typeof cat)} className="input-cosmic !py-1.5 text-sm">
          <option value="all">All sources</option>
          <option value="vercel-blob">Vercel Blob</option>
          <option value="higgsfield">Higgsfield / CDN</option>
          <option value="inline-dataurl">Inline data-URL</option>
        </select>
        <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Filter by game / quest / type" className="input-cosmic !py-1.5 text-sm flex-1 min-w-[160px]" />
        <label className="inline-flex items-center gap-1.5 text-xs cursor-pointer"><input type="checkbox" checked={hugeOnly} onChange={(e) => setHugeOnly(e.target.checked)} className="accent-violet-500" /> Only &gt; 0.5 MB</label>
      </div>

      {/* Actions */}
      <div className="flex flex-wrap items-center gap-2">
        <button onClick={compressAll} disabled={running || compressibleShown === 0} className="glow-btn pressable rounded-full px-5 py-2 text-sm font-semibold text-white disabled:opacity-50">
          {running ? "Working…" : `Compress ${compressibleShown} shown`}
        </button>
        {running && <button onClick={() => { cancel.current = true; }} className="ghost-btn rounded-full px-4 py-2 text-xs">Stop</button>}
        <button onClick={downloadAll} className="ghost-btn rounded-full px-4 py-2 text-xs">Download all shown</button>
        <button onClick={delSelected} className="rounded-full border border-rose-400/40 text-rose-300 px-4 py-2 text-xs hover:bg-rose-500/10">Delete selected</button>
        <span className="text-xs text-muted ml-auto">{shown.length} shown · {compressibleShown} compressible</span>
      </div>

      {/* List */}
      <div className="max-h-[520px] overflow-y-auto rounded-xl border border-white/10 divide-y divide-white/5">
        {shown.map((r) => {
          const st = status[r.url];
          const k = kindOf(r.url);
          return (
            <div key={r.url} className="flex items-center gap-3 p-2.5 text-sm">
              <input type="checkbox" checked={!!sel[r.url]} onChange={(e) => setSel((m) => ({ ...m, [r.url]: e.target.checked }))} className="accent-rose-500 shrink-0" />
              {/* eslint-disable-next-line @next/next/no-img-element */}
              {k === "image" ? <img src={r.url} alt="" className="h-10 w-10 rounded object-cover shrink-0 bg-black/30" loading="lazy" /> : <span className="h-10 w-10 rounded bg-black/30 flex items-center justify-center shrink-0"><Icon name={k === "video" ? "play" : "planet"} size={16} className="text-muted" /></span>}
              <div className="min-w-0 flex-1">
                <div className="truncate font-medium">{r.label} <span className="text-muted font-normal">· {r.table}/{r.field}</span></div>
                <div className="text-[11px] text-muted">{kb(r.size)} · {r.cat}{k !== "image" ? ` · ${k}` : ""}</div>
              </div>
              {st?.state === "done" ? <span className="text-[11px] text-emerald-300 shrink-0">✓ {st.msg}</span>
                : st?.state === "err" ? <span className="text-[11px] text-rose-300 shrink-0 max-w-[140px] truncate" title={st.msg}>✗ {st.msg}</span>
                : st?.state === "work" ? <span className="text-[11px] text-cyan-300 shrink-0">…</span> : null}
              <div className="flex items-center gap-1.5 shrink-0">
                {k === "image" && st?.state !== "done" && <button onClick={() => compressOne(r)} disabled={running} className="ghost-btn rounded-full px-2.5 py-1 text-[11px]">Compress</button>}
                <button onClick={() => downloadOne(r)} className="ghost-btn rounded-full px-2.5 py-1 text-[11px]">Download</button>
              </div>
            </div>
          );
        })}
        {shown.length === 0 && <div className="p-6 text-center text-sm text-muted">No images match the filter.</div>}
      </div>
    </div>
  );
}
