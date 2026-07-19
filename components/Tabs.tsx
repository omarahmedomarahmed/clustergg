"use client";

import { useState } from "react";
import Icon from "@/components/Icon";

// Lightweight client tab bar. Server components render each panel and pass it in
// as `node`, so the panels stay server-rendered while only the switch is client.
export default function Tabs({ tabs, initial = 0 }: { tabs: { key: string; label: string; icon?: string; node: React.ReactNode }[]; initial?: number }) {
  const [i, setI] = useState(initial);
  const active = tabs[Math.min(i, tabs.length - 1)];
  return (
    <div>
      <div className="flex flex-wrap gap-1.5 mb-5 border-b border-white/10 pb-2">
        {tabs.map((t, idx) => (
          <button key={t.key} onClick={() => setI(idx)}
            className={`inline-flex items-center gap-1.5 rounded-full px-4 py-1.5 text-sm font-semibold transition ${idx === i ? "bg-cyan-500/15 text-cyan-200 ring-1 ring-cyan-400/40" : "text-muted hover:text-ink"}`}>
            {t.icon && <Icon name={t.icon} size={14} />} {t.label}
          </button>
        ))}
      </div>
      <div>{active?.node}</div>
    </div>
  );
}
