import { earnCurve } from "@/lib/positioning";
import { money, type PricingConfig } from "@/lib/pricing";

// What a server's community earns as more of it connects.
//
// Server owners are not paid a commission — the prize money goes to the gamers
// who win it. So the honest number to show an owner is how much of the monthly
// prize pool their own members are positioned to win, which rises with how many
// of them are connected. Stated as an expectation with the arithmetic on the
// page, because a curve with no formula under it is a promise.
//
// Drawn as an SVG area chart with no charting library: it is eight numbers, and
// a dependency for eight numbers is a dependency that will one day break a
// build for eight numbers.

const W = 640;
const H = 220;
// Generous side padding: the end points carry a money label centred on them,
// and at 14px the first and last were sliced in half by the viewBox.
const PAD = { l: 40, r: 40, t: 22, b: 30 };

export default function EarnCurve({
  cfg, networkGamers, title, subtitle,
}: {
  cfg: PricingConfig;
  /** Live connected gamers across the whole network. */
  networkGamers: number;
  title?: string;
  subtitle?: string;
}) {
  const { points: pts, field, pool } = earnCurve(cfg, networkGamers);
  const max = Math.max(...pts.map((p) => p.monthly), 1);
  const innerW = W - PAD.l - PAD.r;
  const innerH = H - PAD.t - PAD.b;

  const xy = pts.map((p, i) => ({
    ...p,
    x: PAD.l + (i / (pts.length - 1)) * innerW,
    y: PAD.t + innerH - (p.monthly / max) * innerH,
  }));

  const line = xy.map((p, i) => `${i === 0 ? "M" : "L"}${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(" ");
  const area = `${line} L${(PAD.l + innerW).toFixed(1)},${(PAD.t + innerH).toFixed(1)} L${PAD.l},${(PAD.t + innerH).toFixed(1)} Z`;

  return (
    <div className="glass rounded-3xl p-5 sm:p-7">
      {(title || subtitle) && (
        <div className="mb-5">
          {title && <h3 className="text-xl font-bold">{title}</h3>}
          {subtitle && <p className="mt-1.5 text-sm leading-relaxed text-muted">{subtitle}</p>}
        </div>
      )}

      <div className="overflow-x-auto">
        <svg viewBox={`0 0 ${W} ${H}`} className="h-auto w-full min-w-[320px]" role="img"
          aria-label="Expected monthly prize money reaching a server's members, by how many are connected">
          <defs>
            <linearGradient id="earnFill" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#38bdf8" stopOpacity="0.42" />
              <stop offset="100%" stopColor="#38bdf8" stopOpacity="0.02" />
            </linearGradient>
          </defs>

          {/* Baseline only. Gridlines on a six-point chart are furniture. */}
          <line x1={PAD.l} y1={PAD.t + innerH} x2={PAD.l + innerW} y2={PAD.t + innerH} stroke="rgba(255,255,255,0.14)" />

          <path d={area} fill="url(#earnFill)" />
          <path d={line} fill="none" stroke="#38bdf8" strokeWidth="2.5" strokeLinejoin="round" strokeLinecap="round" />

          {xy.map((p) => (
            <g key={p.gamers}>
              <circle cx={p.x} cy={p.y} r="4" fill="#04051a" stroke="#38bdf8" strokeWidth="2.5" />
              <text x={p.x} y={p.y - 11} textAnchor="middle" fontSize="12" fontWeight="700" fill="#f2f3ff">
                {money(p.monthly, cfg.currency)}
              </text>
              <text x={p.x} y={H - 9} textAnchor="middle" fontSize="11" fill="#9aa0c3">
                {p.gamers.toLocaleString()}
              </text>
            </g>
          ))}
        </svg>
      </div>

      <p className="mt-3 text-[11px] leading-relaxed text-muted">
        Horizontal axis: gamers in your server with a linked account. The platform pays{" "}
        <b className="text-ink">{money(pool, cfg.currency)}</b> in prize money a month across{" "}
        {cfg.games * cfg.challengesPerGame} challenges, and your members win it in proportion to how much
        of the connected field they are — shown here against a field of{" "}
        <b className="text-ink">{field.toLocaleString()}</b> gamers
        {networkGamers >= field ? " (the network today)" : " (the network is smaller than that today, so an early server's share is larger)"}.
        An expectation from that arithmetic, not a guarantee.
      </p>
    </div>
  );
}
