"use client";

import { useMemo, useState } from "react";
import { reviewCreative, assignCreative, removeAssignment } from "@/app/actions/admin";
import Icon from "@/components/Icon";

export type CreativeRow = {
  id: string;
  name: string;
  type: string;
  status: string;
  fileUrl: string;
  width: number | null;
  height: number | null;
  durationSeconds: number | null;
  brandId: string;
  brandName: string;
};
export type CampaignRow = { id: string; name: string; brandId: string; status: string };
export type PlacementRow = { id: string; key: string; width: number; height: number };
export type AssignmentRow = { id: string; creativeId: string; placementId: string; campaignId: string; placementKey: string; campaignName: string; campaignStatus: string };

export default function CreativesManager({
  creatives, brands, campaigns, placements, assignments,
}: {
  creatives: CreativeRow[];
  brands: { id: string; name: string }[];
  campaigns: CampaignRow[];
  placements: PlacementRow[];
  assignments: AssignmentRow[];
}) {
  const [brandFilter, setBrandFilter] = useState<string>("all");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [openId, setOpenId] = useState<string | null>(null);

  const byCreative = useMemo(() => {
    const m = new Map<string, AssignmentRow[]>();
    for (const a of assignments) { const arr = m.get(a.creativeId) ?? []; arr.push(a); m.set(a.creativeId, arr); }
    return m;
  }, [assignments]);

  const counts = useMemo(() => {
    const m = new Map<string, number>();
    for (const c of creatives) m.set(c.brandId, (m.get(c.brandId) ?? 0) + 1);
    return m;
  }, [creatives]);

  const filtered = creatives.filter((c) =>
    (brandFilter === "all" || c.brandId === brandFilter) &&
    (statusFilter === "all" || c.status === statusFilter));

  const statusColor = (s: string) => s === "approved" ? "text-emerald-300" : s === "rejected" ? "text-rose-300" : "text-amber-300";

  return (
    <div>
      {/* Brand filter chips */}
      <div className="flex flex-wrap gap-1.5 mb-3">
        <FilterChip active={brandFilter === "all"} onClick={() => setBrandFilter("all")}>All brands <span className="text-muted">({creatives.length})</span></FilterChip>
        {brands.map((b) => counts.get(b.id) ? (
          <FilterChip key={b.id} active={brandFilter === b.id} onClick={() => setBrandFilter(b.id)}>{b.name} <span className="text-muted">({counts.get(b.id)})</span></FilterChip>
        ) : null)}
      </div>
      {/* Status filter chips */}
      <div className="flex flex-wrap gap-1.5 mb-4">
        {["all", "approved", "pending_review", "rejected"].map((s) => (
          <FilterChip key={s} active={statusFilter === s} onClick={() => setStatusFilter(s)} small>{s.replace("_", " ")}</FilterChip>
        ))}
      </div>

      {filtered.length === 0 && <div className="glass p-8 text-center text-muted">No creatives match.</div>}

      <div className="grid sm:grid-cols-2 gap-2.5">
        {filtered.map((c) => {
          const open = openId === c.id;
          const linked = byCreative.get(c.id) ?? [];
          const brandCampaigns = campaigns.filter((cp) => cp.brandId === c.brandId);
          return (
            <div key={c.id} className="glass overflow-hidden">
              {/* Collapsed header — click to expand */}
              <button onClick={() => setOpenId(open ? null : c.id)} className="w-full flex items-center gap-3 p-3 text-left hover:bg-white/5">
                <div className="h-11 w-16 shrink-0 rounded-md overflow-hidden border border-white/10 bg-black/40">
                  {c.type === "image"
                    // eslint-disable-next-line @next/next/no-img-element
                    ? <img src={c.fileUrl} alt="" className="h-full w-full object-cover" />
                    : <video src={c.fileUrl} className="h-full w-full object-cover" muted />}
                </div>
                <div className="min-w-0 flex-1">
                  <div className="font-semibold text-sm truncate">{c.name}</div>
                  <div className="text-[11px] text-muted truncate">{c.brandName} · {c.type} · {c.width ?? "?"}×{c.height ?? "?"}{linked.length ? ` · ${linked.length} placement${linked.length > 1 ? "s" : ""}` : ""}</div>
                </div>
                <span className={`text-[11px] shrink-0 ${statusColor(c.status)}`}>● {c.status.replace("_", " ")}</span>
                <Icon name="chevronDown" size={14} className={`text-muted shrink-0 transition-transform ${open ? "rotate-180" : ""}`} />
              </button>

              {open && (
                <div className="border-t border-white/10 p-3 space-y-3">
                  <div className="rounded-lg overflow-hidden border border-violet-400/15 bg-black/30" style={{ aspectRatio: `${c.width ?? 4} / ${c.height ?? 1}`, maxHeight: 160 }}>
                    {c.type === "image"
                      // eslint-disable-next-line @next/next/no-img-element
                      ? <img src={c.fileUrl} alt={c.name} className="w-full h-full object-contain" />
                      : <video src={c.fileUrl} className="w-full h-full object-contain" muted autoPlay loop />}
                  </div>

                  {c.status === "pending_review" && (
                    <div className="flex gap-2">
                      <form action={reviewCreative.bind(null, c.id, true)}>
                        <button className="text-xs glow-btn rounded-full px-4 py-1.5 font-semibold text-white">Approve</button>
                      </form>
                      <form action={reviewCreative.bind(null, c.id, false)}>
                        <button className="text-xs rounded-full px-4 py-1.5 border border-rose-400/40 text-rose-300">Reject</button>
                      </form>
                    </div>
                  )}

                  {/* Linked placements */}
                  <div>
                    <div className="text-[10px] uppercase tracking-widest text-muted mb-1.5">Linked placements</div>
                    {linked.length === 0 && <div className="text-xs text-muted">Not linked to any placement yet.</div>}
                    <div className="space-y-1">
                      {linked.map((a) => (
                        <div key={a.id} className="flex items-center gap-2 text-xs rounded-lg border border-white/10 px-2.5 py-1.5">
                          <span className={a.campaignStatus === "active" ? "text-emerald-300" : "text-amber-300"}>●</span>
                          <span className="font-mono text-cyan-300">{a.placementKey}</span>
                          <span className="text-muted truncate">· {a.campaignName}</span>
                          <form action={removeAssignment.bind(null, a.id)} className="ml-auto">
                            <button className="text-rose-300 hover:underline">Unlink</button>
                          </form>
                        </div>
                      ))}
                    </div>
                  </div>

                  {/* Link this creative to a placement */}
                  {c.status === "approved" ? (
                    brandCampaigns.length === 0
                      ? <div className="text-xs text-amber-200/90">Create a campaign for {c.brandName} first to link this creative.</div>
                      : (
                        <form action={assignCreative} className="grid grid-cols-2 gap-2">
                          <input type="hidden" name="creativeId" value={c.id} />
                          <select name="campaignId" required className="input-cosmic text-xs">
                            {brandCampaigns.map((cp) => <option key={cp.id} value={cp.id}>{cp.name}</option>)}
                          </select>
                          <select name="placementId" required className="input-cosmic text-xs">
                            {placements.map((p) => <option key={p.id} value={p.id}>{p.key} ({p.width}×{p.height})</option>)}
                          </select>
                          <button className="glow-btn rounded-full px-4 py-1.5 text-xs font-semibold text-white col-span-2">Link to placement</button>
                        </form>
                      )
                  ) : (
                    <div className="text-xs text-muted">Approve this creative before linking it to a placement.</div>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

function FilterChip({ active, onClick, children, small }: { active: boolean; onClick: () => void; children: React.ReactNode; small?: boolean }) {
  return (
    <button onClick={onClick} className={`rounded-full border px-3 py-1 ${small ? "text-[10px] uppercase tracking-wide" : "text-xs"} transition ${active ? "border-cyan-400/50 bg-cyan-500/10 text-cyan-200" : "border-white/12 text-muted hover:border-white/25"}`}>
      {children}
    </button>
  );
}
