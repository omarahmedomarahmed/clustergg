"use client";

import { useMemo, useState } from "react";
import Icon from "@/components/Icon";
import BrandCreativeUploader, { type PortalSlot } from "@/components/BrandCreativeUploader";
import { pageForPlacement } from "@/lib/placement-pages";

// The Creatives tab for a campaign on the brand portal. Every placement is shown
// as one compact list row (small preview + "see it live" link). Clicking a row
// opens the full uploader/editor in a popup so brands can view & edit inline
// without leaving the list.
export default function BrandCreativesTab({ brandId, keyStr, slots }: { brandId: string; keyStr: string; slots: PortalSlot[] }) {
  const [filter, setFilter] = useState<"all" | "filled" | "empty">("all");
  const [open, setOpen] = useState<string | null>(null);

  const shown = useMemo(
    () => slots.filter((s) => filter === "all" || (filter === "filled" ? s.fileUrl : !s.fileUrl)),
    [slots, filter],
  );
  const filled = slots.filter((s) => s.fileUrl).length;
  const editing = slots.find((s) => s.placementId === open) ?? null;

  const chip = (f: typeof filter, label: string) => (
    <button onClick={() => setFilter(f)} className={`rounded-full border px-3 py-1 text-xs transition ${filter === f ? "border-cyan-400/50 bg-cyan-500/10 text-cyan-200" : "border-white/12 text-muted hover:border-white/25"}`}>{label}</button>
  );

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h2 className="font-bold text-lg flex items-center gap-2"><Icon name="grid" size={18} className="text-violet-300" /> All creatives</h2>
          <p className="text-xs text-muted mt-0.5">{filled} of {slots.length} placements have a creative. Click any row to view or edit it.</p>
        </div>
        <div className="flex flex-wrap gap-1.5">
          {chip("all", `All (${slots.length})`)}
          {chip("filled", `Uploaded (${filled})`)}
          {chip("empty", `Missing (${slots.length - filled})`)}
        </div>
      </div>

      <div className="glass divide-y divide-white/5">
        {shown.length === 0 && <div className="p-6 text-center text-sm text-muted">Nothing in this filter.</div>}
        {shown.map((s) => {
          const live = pageForPlacement(s.key);
          return (
            <div key={s.placementId} className="flex items-center gap-3 p-3 hover:bg-white/[0.03] transition">
              {/* Small preview */}
              <button onClick={() => setOpen(s.placementId)} className="shrink-0 relative h-12 w-16 overflow-hidden rounded-lg border border-white/10 bg-black/40">
                {s.fileUrl ? (
                  s.creativeType === "video" ? (
                    <video src={s.fileUrl} className="h-full w-full object-cover" muted playsInline />
                  ) : (
                    /* eslint-disable-next-line @next/next/no-img-element */
                    <img src={s.fileUrl} alt="" className="h-full w-full object-cover" />
                  )
                ) : (
                  <span className="absolute inset-0 flex items-center justify-center text-[9px] text-muted">empty</span>
                )}
              </button>

              {/* Name + scope */}
              <button onClick={() => setOpen(s.placementId)} className="min-w-0 flex-1 text-left">
                <div className="font-semibold text-sm truncate">{s.key}</div>
                <div className="text-[11px] text-muted truncate">{s.pageScope} · {s.width}×{s.height}</div>
              </button>

              {/* Status + actions */}
              <span className={`shrink-0 text-[11px] font-semibold ${s.fileUrl ? "text-emerald-300" : "text-amber-300"}`}>
                {s.fileUrl ? "● ready" : "○ missing"}
              </span>
              <a href={live} target="_blank" title="See it live" className="shrink-0 text-muted hover:text-cyan-300 p-1.5"><Icon name="link" size={14} /></a>
              <button onClick={() => setOpen(s.placementId)} title="View / edit" className="shrink-0 text-muted hover:text-cyan-300 p-1.5"><Icon name="edit" size={14} /></button>
            </div>
          );
        })}
      </div>

      {/* Edit popup */}
      {editing && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm" onClick={() => setOpen(null)}>
          <div className="w-full max-w-md" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-2">
              <div className="text-sm font-bold text-cyan-100 flex items-center gap-2"><Icon name="edit" size={15} /> {editing.key}</div>
              <div className="flex items-center gap-2">
                <a href={pageForPlacement(editing.key)} target="_blank" className="text-[11px] text-cyan-300 inline-flex items-center gap-1"><Icon name="link" size={12} /> live</a>
                <button onClick={() => setOpen(null)} className="text-muted hover:text-ink"><Icon name="x" size={18} /></button>
              </div>
            </div>
            <BrandCreativeUploader brandId={brandId} keyStr={keyStr} slot={editing} />
          </div>
        </div>
      )}
    </div>
  );
}
