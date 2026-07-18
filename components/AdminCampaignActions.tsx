"use client";

import { useState, useTransition } from "react";
import Icon from "@/components/Icon";
import { launchCampaign, setCampaignStatus } from "@/app/actions/admin";

// Launch / pause / resume a campaign from the master ads dashboard. Launch is
// gated server-side on every placement having a creative; the error surfaces
// inline here.
export default function AdminCampaignActions({ campaignId, status, ready }: { campaignId: string; status: string; ready: boolean }) {
  const [pending, start] = useTransition();
  const [err, setErr] = useState<string | null>(null);

  const doLaunch = () => start(async () => { const r = await launchCampaign(campaignId); setErr(r?.error ?? null); });
  const doStatus = (s: "active" | "paused") => start(() => setCampaignStatus(campaignId, s).then(() => setErr(null)));

  return (
    <div className="flex items-center gap-2">
      {status === "active" ? (
        <button onClick={() => doStatus("paused")} disabled={pending} className="text-xs rounded-full px-3 py-1 border border-amber-400/40 text-amber-300 hover:bg-amber-500/10">Pause</button>
      ) : status === "paused" ? (
        <button onClick={() => doStatus("active")} disabled={pending} className="text-xs rounded-full px-3 py-1 border border-emerald-400/40 text-emerald-300 hover:bg-emerald-500/10">Resume</button>
      ) : (
        <button onClick={doLaunch} disabled={pending || !ready}
          title={ready ? "Launch across every placement" : "Upload a creative for every placement first"}
          className={`text-xs rounded-full px-3 py-1 border inline-flex items-center gap-1.5 ${ready ? "border-cyan-400/50 text-cyan-200 hover:bg-cyan-500/10" : "border-white/12 text-muted cursor-not-allowed"}`}>
          <Icon name="rocket" size={12} /> Launch
        </button>
      )}
      {err && <span className="text-[11px] text-rose-300">{err}</span>}
    </div>
  );
}
