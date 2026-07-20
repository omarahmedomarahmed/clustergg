"use client";

import { useEffect, useState } from "react";
import Icon from "@/components/Icon";

// The point-history log that shows exactly how a gamer earned their challenge
// points (every scoring event). Reused on the planet hero, the planet challenge
// standings, and the challenge detail page.
export function ChallengeLog({ challengeId, slug, title }: { challengeId: string; slug: string; title?: string }) {
  const [rows, setRows] = useState<{ eventType: string; points: number; at: string }[] | null>(null);
  const [total, setTotal] = useState<number | null>(null);
  const [err, setErr] = useState(false);
  useEffect(() => {
    let alive = true;
    fetch(`/api/challenge/points?challenge=${encodeURIComponent(challengeId)}&slug=${encodeURIComponent(slug)}`, { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : null))
      .then((j) => { if (!alive) return; if (j) { setRows(j.events ?? []); setTotal(j.total ?? 0); } else setErr(true); })
      .catch(() => alive && setErr(true));
    return () => { alive = false; };
  }, [challengeId, slug]);

  if (err) return <div className="text-xs text-muted">Couldn&apos;t load the points log.</div>;
  if (!rows) return <div className="text-xs text-muted animate-pulse">Loading points log…</div>;
  return (
    <div>
      <div className="flex items-center justify-between mb-2">
        <div className="text-[11px] uppercase tracking-widest text-muted">{title ? `${title} — ` : ""}points log</div>
        {total != null && <div className="text-sm font-bold text-cyan-200">{total.toLocaleString()} pts</div>}
      </div>
      {rows.length === 0 ? <div className="text-xs text-muted">No scoring events yet.</div> : (
        <div className="space-y-1 max-h-56 overflow-y-auto">
          {rows.map((e, i) => (
            <div key={i} className="flex items-center gap-2 rounded-lg bg-white/[0.04] px-2.5 py-1.5 text-xs">
              <span className="flex-1 min-w-0 truncate">{e.eventType.replace(/_/g, " ")}</span>
              <span className="text-[10px] text-muted shrink-0">{new Date(e.at).toLocaleDateString()}</span>
              <span className={`font-bold shrink-0 ${e.points >= 0 ? "text-emerald-300" : "text-rose-300"}`}>{e.points >= 0 ? "+" : ""}{e.points}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// A clickable element (a gamer row/name) that opens their challenge points log
// in a popup — drop it anywhere a challenge standing is shown.
export default function ChallengePointsButton({ challengeId, slug, name, title, className, children }: {
  challengeId: string; slug: string; name: string; title?: string; className?: string; children: React.ReactNode;
}) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button type="button" onClick={(e) => { e.preventDefault(); e.stopPropagation(); setOpen(true); }} className={className}>{children}</button>
      {open && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm" onClick={() => setOpen(false)}>
          <div className="w-full max-w-sm rounded-2xl border border-white/15 bg-[#04051a] p-4" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-3">
              <div className="font-bold truncate">{name}</div>
              <button onClick={() => setOpen(false)} className="text-muted hover:text-ink"><Icon name="x" size={16} /></button>
            </div>
            <ChallengeLog challengeId={challengeId} slug={slug} title={title} />
          </div>
        </div>
      )}
    </>
  );
}
