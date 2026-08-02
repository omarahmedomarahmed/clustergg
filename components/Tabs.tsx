"use client";

import { useState } from "react";
import Icon from "@/components/Icon";

export type TabDef = {
  key: string;
  label: string;
  icon?: string;
  /**
   * Something on this tab needs the reader. Shown as a red dot on the tab —
   * and kept on the tab even while it is open, because the dot describes the
   * state of the work, not whether the tab has been clicked.
   */
  dot?: boolean;
  node: React.ReactNode;
};

// Lightweight client tab bar. Server components render each panel and pass it in
// as `node`, so the panels stay server-rendered while only the switch is client.
//
// Only the open panel is mounted, deliberately: the panels here hold charts that
// measure their container on mount, and a chart mounted inside a hidden div
// measures zero and renders as a flat line the first time you look at it.
export default function Tabs({ tabs, initial = 0 }: { tabs: TabDef[]; initial?: number }) {
  const [i, setI] = useState(initial);
  const active = Math.min(i, tabs.length - 1);
  return (
    <div>
      <div className="flex flex-wrap gap-1.5 mb-5 border-b border-white/10 pb-2">
        {tabs.map((t, idx) => (
          <button key={t.key} onClick={() => setI(idx)} type="button"
            aria-current={idx === active ? "page" : undefined}
            className={`relative inline-flex items-center gap-1.5 rounded-full px-4 py-1.5 text-sm font-semibold transition ${idx === active ? "bg-cyan-500/15 text-cyan-200 ring-1 ring-cyan-400/40" : "text-muted hover:text-ink"}`}>
            {t.icon && <Icon name={t.icon} size={14} />} {t.label}
            {t.dot && (
              <span className="absolute -right-0.5 -top-0.5 flex h-2.5 w-2.5" aria-label="needs attention">
                <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-rose-400 opacity-70" />
                <span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-rose-500 ring-2 ring-[#04051a]" />
              </span>
            )}
          </button>
        ))}
      </div>
      <div>{tabs[active]?.node}</div>
    </div>
  );
}
