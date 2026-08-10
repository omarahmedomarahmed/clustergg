"use client";

import { useState } from "react";
import Icon from "@/components/Icon";
import type { MoneyShare } from "@/lib/journeys";

// Where a brand's dollar goes, drawn. B119.
//
// ===== WHY THE BAR IS THE WHOLE ARGUMENT =====
//
// The single most important fact about this business is that half of what a
// brand pays leaves as prize money. Written as a sentence it is a claim. Drawn
// as a bar where the players' half is visibly half, it is a picture somebody
// can check in a second — and the same picture answers all three audiences:
// the gamer sees what funds their trophy, the owner sees where the weekly pool
// comes from, the brand sees what their money buys.
//
// ===== THE SHARES ARE READ, NOT DRAWN FROM MEMORY =====
//
// `MONEY_FLOW` takes them from `DEFAULT_SPLIT`, which an operator can change in
// `/admin/vaults`. A guide with 50/15/15/20 painted into its widths would be
// wrong the day somebody moved the switch — and wrong in the most expensive
// possible way, since this is the number the whole pitch rests on.
//
// They arrive as a PROP rather than an import, and that is a build constraint
// rather than a style choice: this is a client component, `MONEY_FLOW` lives
// beside the journeys, and the journeys read the withdrawal floor out of
// `lib/server-wallet.ts`, which reaches `next/headers`. Importing the data
// here pulls a server module into the browser bundle and the build refuses —
// correctly. The server page reads the split and hands it down.

export default function MoneyFlow({ shares, highlight }: {
  shares: MoneyShare[];
  highlight?: "prize" | "server" | "cp" | "cluster";
}) {
  const [open, setOpen] = useState<string | null>(highlight ?? null);
  const total = shares.reduce((n, v) => n + v.pct, 0) || 100;

  return (
    <div className="glass rounded-3xl p-6">
      <h3 className="text-lg font-bold">Where a brand&apos;s money goes</h3>
      <p className="mt-1 text-sm text-muted">
        Every dollar that arrives splits four ways the moment the invoice is marked paid — never when it
        is issued. Tap a share.
      </p>

      {/* The bar. One flex row, widths from the real percentages. */}
      <div className="mt-5 flex h-12 overflow-hidden rounded-2xl border border-white/12">
        {shares.map((v) => {
          const on = open === v.key;
          return (
            <button
              key={v.key}
              type="button"
              onClick={() => setOpen(on ? null : v.key)}
              aria-pressed={on}
              title={`${v.label} — ${v.pct}%`}
              className="relative grid place-items-center transition-all"
              style={{
                width: `${(v.pct / total) * 100}%`,
                background: on ? v.tone : `${v.tone}44`,
                borderRight: "1px solid rgba(255,255,255,0.10)",
              }}
            >
              <span className={`text-xs font-black ${on ? "text-[#12002e]" : "text-ink"}`}>{v.pct}%</span>
            </button>
          );
        })}
      </div>

      {/* The legend doubles as the detail panel: the selected share expands
          rather than opening a second box somewhere else on the page. */}
      <div className="mt-4 space-y-1.5">
        {shares.map((v) => {
          const on = open === v.key;
          return (
            <button
              key={v.key}
              type="button"
              onClick={() => setOpen(on ? null : v.key)}
              className={`block w-full rounded-2xl border p-3 text-left transition-colors ${
                on ? "border-white/25 bg-white/[0.06]" : "border-white/10 hover:border-white/20"
              }`}
            >
              <span className="flex items-center gap-2.5">
                <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ background: v.tone }} />
                <span className="text-sm font-semibold">{v.label}</span>
                <span className="text-xs text-muted">→ {v.to}</span>
                <span className="ml-auto text-sm font-bold tabular-nums" style={{ color: v.tone }}>{v.pct}%</span>
              </span>
              {on && <span className="mt-2 block text-sm leading-relaxed text-muted">{v.note}</span>}
            </button>
          );
        })}
      </div>

      <p className="mt-4 flex items-start gap-2 text-xs leading-relaxed text-muted">
        <Icon name="lock" size={12} className="mt-0.5 shrink-0 text-cyan-300" />
        <span>
          No vault has a balance column. Each one is the sum of a ledger where every row names who moved
          the money and why, so a total can always be rebuilt from the rows that made it.
        </span>
      </p>
    </div>
  );
}
