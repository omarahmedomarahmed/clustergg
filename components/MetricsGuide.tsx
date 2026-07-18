"use client";

import { useState } from "react";
import Icon from "@/components/Icon";

export type GuideMetric = { key: string; label: string; unit?: string; higherIsBetter?: boolean };

// Explains exactly what a game's API exposes — shown in the challenge and
// leaderboard builders so admins know what each metric pulls before scoring on
// it. Collapsible to stay out of the way.
export default function MetricsGuide({
  providerName, game, live, authType, docsUrl, capabilities, defaultOpen = false,
}: {
  providerName: string; game: string; live?: boolean; authType?: string; docsUrl?: string;
  capabilities: GuideMetric[]; defaultOpen?: boolean;
}) {
  const [open, setOpen] = useState(defaultOpen);
  const auth = authType === "public" ? "Public API — no key needed"
    : authType === "apikey" ? "Needs an API key (env var)"
    : authType === "oauth" || authType === "openid" ? "Player connects via OAuth"
    : authType === "vc" ? "In-game verification code" : "Connected account";

  return (
    <div className="rounded-xl border border-cyan-400/20 bg-cyan-500/[0.04]">
      <button type="button" onClick={() => setOpen((v) => !v)} className="flex w-full items-center gap-2 px-3 py-2 text-left">
        <Icon name="satellite" size={14} className="text-cyan-300 shrink-0" />
        <span className="text-xs font-semibold flex-1">What we pull from {providerName} <span className="text-muted">({game})</span></span>
        {live !== undefined && <span className={`text-[10px] font-bold ${live ? "text-emerald-300" : "text-amber-300"}`}>{live ? "LIVE" : "needs key"}</span>}
        <Icon name={open ? "chevronDown" : "chevronRight"} size={14} className="text-muted" />
      </button>
      {open && (
        <div className="px-3 pb-3 pt-1 space-y-2">
          <div className="text-[11px] text-muted">{auth}. Every metric below is synced automatically from the {providerName} API — no manual entry.</div>
          <div className="grid sm:grid-cols-2 gap-1.5">
            {capabilities.length === 0 && <div className="text-[11px] text-muted">Identity-only — no trackable stats.</div>}
            {capabilities.map((c) => (
              <div key={c.key} className="flex items-center gap-2 rounded-lg border border-white/10 px-2 py-1.5">
                <Icon name={c.higherIsBetter ? "arrowUp" : "chart"} size={12} className={c.higherIsBetter ? "text-emerald-300" : "text-muted"} />
                <span className="text-[11px] font-semibold flex-1 truncate">{c.label}</span>
                <code className="text-[10px] text-muted">{c.key}{c.unit ? ` (${c.unit})` : ""}</code>
              </div>
            ))}
          </div>
          {docsUrl && <a href={docsUrl} target="_blank" rel="noopener" className="inline-flex items-center gap-1 text-[11px] text-cyan-300 hover:underline"><Icon name="link" size={11} /> API docs</a>}
        </div>
      )}
    </div>
  );
}
