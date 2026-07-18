"use client";

import { useMemo, useRef, useState } from "react";
import Icon from "@/components/Icon";

export type DayPoint = { day: string; impressions: number; clicks: number };

// Self-contained interactive analytics chart (no external libs — CSP-safe).
// Area / bar chart types, a date-range filter, a metric toggle, hover tooltips
// with a guide line, and CSV download. Used on the brand portal + campaign pages.
export default function AdChart({
  data, accent = "#22d3ee", accent2 = "#a78bfa", filename = "cluster-analytics",
}: {
  data: DayPoint[];
  accent?: string;
  accent2?: string;
  filename?: string;
}) {
  const [range, setRange] = useState<number>(30); // days; 0 = all
  const [type, setType] = useState<"area" | "bars">("area");
  const [metric, setMetric] = useState<"both" | "impressions" | "clicks">("both");
  const [hover, setHover] = useState<number | null>(null);
  const svgRef = useRef<SVGSVGElement>(null);

  const rows = useMemo(() => {
    const sorted = [...data].sort((a, b) => a.day.localeCompare(b.day));
    return range > 0 ? sorted.slice(-range) : sorted;
  }, [data, range]);

  const W = 760, H = 240, padL = 8, padR = 8, padT = 12, padB = 22;
  const iw = W - padL - padR, ih = H - padT - padB;
  const maxImp = Math.max(1, ...rows.map((r) => r.impressions));
  const maxClk = Math.max(1, ...rows.map((r) => r.clicks));
  const n = rows.length;
  const x = (i: number) => padL + (n <= 1 ? iw / 2 : (i / (n - 1)) * iw);
  const yI = (v: number) => padT + ih - (v / maxImp) * ih;
  const yC = (v: number) => padT + ih - (v / maxClk) * ih;

  const totals = useMemo(() => {
    const imp = rows.reduce((s, r) => s + r.impressions, 0);
    const clk = rows.reduce((s, r) => s + r.clicks, 0);
    return { imp, clk, ctr: imp ? (clk / imp) * 100 : 0 };
  }, [rows]);

  const linePath = (key: "impressions" | "clicks", yf: (v: number) => number) =>
    rows.map((r, i) => `${i === 0 ? "M" : "L"}${x(i).toFixed(1)},${yf(r[key]).toFixed(1)}`).join(" ");
  const areaPath = (key: "impressions" | "clicks", yf: (v: number) => number) =>
    n === 0 ? "" : `${linePath(key, yf)} L${x(n - 1).toFixed(1)},${padT + ih} L${x(0).toFixed(1)},${padT + ih} Z`;

  const onMove = (e: React.PointerEvent) => {
    const el = svgRef.current; if (!el || n === 0) return;
    const r = el.getBoundingClientRect();
    const px = ((e.clientX - r.left) / r.width) * W;
    const i = Math.max(0, Math.min(n - 1, Math.round(((px - padL) / iw) * (n - 1))));
    setHover(i);
  };

  const downloadCsv = () => {
    const header = "date,impressions,clicks,ctr%\n";
    const body = rows.map((r) => `${r.day},${r.impressions},${r.clicks},${r.impressions ? ((r.clicks / r.impressions) * 100).toFixed(2) : "0.00"}`).join("\n");
    const blob = new Blob([header + body], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url; a.download = `${filename}-${range || "all"}d.csv`; a.click();
    setTimeout(() => URL.revokeObjectURL(url), 2000);
  };

  const showImp = metric !== "clicks";
  const showClk = metric !== "impressions";
  const barW = n > 0 ? Math.max(1.5, (iw / n) * 0.34) : 4;
  const num = (v: number) => v.toLocaleString();

  return (
    <div className="glass p-4">
      {/* Controls */}
      <div className="flex flex-wrap items-center gap-2 mb-3">
        <Seg options={[["7", "7d"], ["30", "30d"], ["90", "90d"], ["0", "All"]]} value={String(range)} onChange={(v) => setRange(Number(v))} />
        <Seg options={[["area", "Area"], ["bars", "Bars"]]} value={type} onChange={(v) => setType(v as "area" | "bars")} />
        <Seg options={[["both", "Both"], ["impressions", "Impr."], ["clicks", "Clicks"]]} value={metric} onChange={(v) => setMetric(v as typeof metric)} />
        <button onClick={downloadCsv} className="ml-auto ghost-btn pressable rounded-full px-3 py-1.5 text-xs inline-flex items-center gap-1.5"><Icon name="arrowDown" size={12} /> CSV</button>
      </div>

      {/* Legend + range totals */}
      <div className="flex flex-wrap items-center gap-x-4 gap-y-1 mb-2 text-xs">
        {showImp && <span className="inline-flex items-center gap-1.5"><span className="h-2 w-2 rounded-full" style={{ background: accent }} /> Impressions <b className="text-cyan-200">{num(totals.imp)}</b></span>}
        {showClk && <span className="inline-flex items-center gap-1.5"><span className="h-2 w-2 rounded-full" style={{ background: accent2 }} /> Clicks <b className="text-violet-200">{num(totals.clk)}</b></span>}
        <span className="text-muted">CTR <b className="text-ink">{totals.ctr.toFixed(2)}%</b></span>
      </div>

      {/* Chart */}
      <div className="relative">
        {n === 0 ? (
          <div className="h-[240px] grid place-items-center text-sm text-muted">No data in this range yet.</div>
        ) : (
          <svg ref={svgRef} viewBox={`0 0 ${W} ${H}`} className="w-full h-[240px] touch-none"
            onPointerMove={onMove} onPointerLeave={() => setHover(null)}>
            {/* gridlines */}
            {[0.25, 0.5, 0.75].map((g) => (
              <line key={g} x1={padL} x2={W - padR} y1={padT + ih * g} y2={padT + ih * g} stroke="rgba(255,255,255,0.06)" strokeWidth={1} />
            ))}
            {type === "area" ? (
              <>
                {showImp && <><path d={areaPath("impressions", yI)} fill={`${accent}22`} /><path d={linePath("impressions", yI)} fill="none" stroke={accent} strokeWidth={2} strokeLinejoin="round" /></>}
                {showClk && <><path d={areaPath("clicks", yC)} fill={`${accent2}22`} /><path d={linePath("clicks", yC)} fill="none" stroke={accent2} strokeWidth={2} strokeLinejoin="round" /></>}
              </>
            ) : (
              rows.map((r, i) => (
                <g key={i}>
                  {showImp && <rect x={x(i) - (showClk ? barW + 1 : barW / 2)} y={yI(r.impressions)} width={barW} height={padT + ih - yI(r.impressions)} rx={1} fill={accent} opacity={0.85} />}
                  {showClk && <rect x={x(i) + (showImp ? 1 : -barW / 2)} y={yC(r.clicks)} width={barW} height={padT + ih - yC(r.clicks)} rx={1} fill={accent2} opacity={0.85} />}
                </g>
              ))
            )}
            {/* hover guide + points */}
            {hover !== null && rows[hover] && (
              <>
                <line x1={x(hover)} x2={x(hover)} y1={padT} y2={padT + ih} stroke="rgba(255,255,255,0.25)" strokeWidth={1} strokeDasharray="3 3" />
                {showImp && <circle cx={x(hover)} cy={yI(rows[hover].impressions)} r={3.5} fill={accent} stroke="#04051a" strokeWidth={1.5} />}
                {showClk && <circle cx={x(hover)} cy={yC(rows[hover].clicks)} r={3.5} fill={accent2} stroke="#04051a" strokeWidth={1.5} />}
              </>
            )}
            {/* x labels (first / mid / last) */}
            {[0, Math.floor((n - 1) / 2), n - 1].filter((v, idx, a) => a.indexOf(v) === idx).map((i) => (
              <text key={i} x={x(i)} y={H - 6} fontSize={9} fill="rgba(255,255,255,0.4)" textAnchor={i === 0 ? "start" : i === n - 1 ? "end" : "middle"}>{rows[i].day.slice(5)}</text>
            ))}
          </svg>
        )}

        {/* tooltip */}
        {hover !== null && rows[hover] && (
          <div className="pointer-events-none absolute top-1 rounded-lg border border-white/15 bg-[#04051a]/95 px-2.5 py-1.5 text-[11px] shadow-xl"
            style={{ left: `calc(${(x(hover) / W) * 100}% )`, transform: `translateX(${x(hover) / W > 0.7 ? "-105%" : "8px"})` }}>
            <div className="font-semibold mb-0.5">{rows[hover].day}</div>
            {showImp && <div style={{ color: accent }}>{num(rows[hover].impressions)} impressions</div>}
            {showClk && <div style={{ color: accent2 }}>{num(rows[hover].clicks)} clicks</div>}
          </div>
        )}
      </div>
    </div>
  );
}

function Seg({ options, value, onChange }: { options: [string, string][]; value: string; onChange: (v: string) => void }) {
  return (
    <div className="inline-flex rounded-full border border-white/12 p-0.5 text-xs">
      {options.map(([v, label]) => (
        <button key={v} onClick={() => onChange(v)} className={`rounded-full px-2.5 py-1 transition ${value === v ? "bg-cyan-500/20 text-cyan-200" : "text-muted hover:text-ink"}`}>{label}</button>
      ))}
    </div>
  );
}
