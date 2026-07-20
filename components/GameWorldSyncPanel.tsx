"use client";

import { useState, useTransition } from "react";
import { adminSyncGameWorld, type ActionState } from "@/app/actions/admin";
import Icon from "@/components/Icon";

type Row = { game: string; syncedAt: string | null; art: boolean; count: number };

// Admin panel: cache each game's world catalogue to Blob so planet pages stop
// re-calling the external game APIs. "+ art" also re-hosts images to our Blob.
export default function GameWorldSyncPanel({ rows }: { rows: Row[] }) {
  if (rows.length === 0) return null;
  return (
    <div className="glass p-5">
      <h2 className="font-bold flex items-center gap-2 mb-1"><Icon name="swords" size={16} className="text-violet-300" /> Game-world snapshots</h2>
      <p className="text-xs text-muted mb-4">
        Cache each game&apos;s champions / agents / weapons / legends / maps + lore to Blob so planet pages stop
        re-calling Data Dragon, valorant-api, OpenDota and fortnite-api. <b>Sync + art</b> also re-hosts the images to our
        own storage. Re-sync only when a new champion or skin drops.
      </p>
      <div className="space-y-2">
        {rows.map((r) => <GwRow key={r.game} row={r} />)}
      </div>
    </div>
  );
}

function GwRow({ row }: { row: Row }) {
  const [pending, start] = useTransition();
  const [msg, setMsg] = useState<ActionState>(undefined);
  const run = (art: boolean) => start(async () => setMsg(await adminSyncGameWorld(row.game, art)));
  return (
    <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-white/10 bg-black/20 px-4 py-3">
      <div className="min-w-0">
        <div className="font-semibold text-sm">{row.game}</div>
        <div className="text-[11px] text-muted">
          {row.syncedAt
            ? <>Synced {new Date(row.syncedAt).toLocaleString()} · {row.count} entries · {row.art ? <span className="text-emerald-300">art on Blob</span> : "data only"}</>
            : "Not cached yet — served live from the game API"}
          {msg?.ok && <span className="text-emerald-300"> · ✓ {msg.message}</span>}
          {msg?.error && <span className="text-rose-300"> · {msg.error}</span>}
        </div>
      </div>
      <div className="flex items-center gap-2 shrink-0">
        <button disabled={pending} onClick={() => run(false)} className="ghost-btn pressable rounded-full px-3.5 py-1.5 text-xs disabled:opacity-50">
          {pending ? "…" : "Sync data"}
        </button>
        <button disabled={pending} onClick={() => run(true)} className="glow-btn pressable rounded-full px-3.5 py-1.5 text-xs font-semibold text-white inline-flex items-center gap-1 disabled:opacity-50">
          <Icon name="satellite" size={12} className={pending ? "animate-spin" : ""} /> {pending ? "Syncing…" : "Sync + art"}
        </button>
      </div>
    </div>
  );
}
