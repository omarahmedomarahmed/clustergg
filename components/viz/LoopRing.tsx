import { WEEK_LOOP, type LoopNode } from "@/lib/positioning";

// The Profile of the Week loop, as a loop.
//
// Drawn as a ring because that is what it is: the last step feeds the first,
// every week, forever. A row of boxes with an arrow between them says "process",
// which is the opposite of the claim — and it is exactly the layout that was
// asked to be dropped everywhere.
//
// The nodes sit on a circle in SVG for geometry, with the copy beside it, so it
// reads at any width instead of collapsing into unreadable text-in-circles on a
// phone.

const R = 118;
const CX = 150;
const CY = 150;

export default function LoopRing({
  title, subtitle, accent = "#a78bfa", nodes: given,
}: {
  title?: string;
  subtitle?: string;
  accent?: string;
  /** Admin-edited copy when a page has it; the house loop otherwise. */
  nodes?: LoopNode[];
}) {
  const source = given?.length ? given : WEEK_LOOP;
  const n = source.length;
  const nodes = source.map((node, i) => {
    // Start at the top and go clockwise.
    const a = (i / n) * Math.PI * 2 - Math.PI / 2;
    return { ...node, i, x: CX + Math.cos(a) * R, y: CY + Math.sin(a) * R };
  });

  return (
    <div className="grid items-center gap-8 lg:grid-cols-[320px_minmax(0,1fr)]">
      <div className="mx-auto w-full max-w-[320px]">
        <svg viewBox="0 0 300 300" className="h-auto w-full" role="img" aria-label="The weekly profile competition loop">
          <defs>
            <marker id="loopArrow" viewBox="0 0 10 10" refX="6" refY="5" markerWidth="5" markerHeight="5" orient="auto-start-reverse">
              <path d="M0,0 L10,5 L0,10 z" fill={accent} />
            </marker>
          </defs>
          {/* The ring itself, with a gap and an arrowhead so the direction is
              unmistakable without labelling it. */}
          <circle cx={CX} cy={CY} r={R} fill="none" stroke={accent} strokeOpacity="0.35" strokeWidth="2"
            strokeDasharray="600 40" markerEnd="url(#loopArrow)" transform={`rotate(-90 ${CX} ${CY})`} />
          <text x={CX} y={CY - 6} textAnchor="middle" fontSize="13" fontWeight="700" fill="#f2f3ff">EVERY</text>
          <text x={CX} y={CY + 13} textAnchor="middle" fontSize="13" fontWeight="700" fill="#f2f3ff">WEEK</text>
          {nodes.map((node) => (
            <g key={node.key}>
              <circle cx={node.x} cy={node.y} r="19" fill="#04051a" stroke={accent} strokeWidth="2" />
              <text x={node.x} y={node.y + 5} textAnchor="middle" fontSize="15" fontWeight="700" fill={accent}>
                {node.i + 1}
              </text>
            </g>
          ))}
        </svg>
      </div>

      <div>
        {title && <h3 className="text-2xl font-bold md:text-3xl">{title}</h3>}
        {subtitle && <p className="mt-2 leading-relaxed text-muted">{subtitle}</p>}
        <ol className="mt-5 space-y-3">
          {nodes.map((node) => (
            <li key={node.key} className="flex gap-3">
              <span
                className="mt-0.5 grid h-7 w-7 shrink-0 place-items-center rounded-full border text-sm font-bold"
                style={{ borderColor: accent, color: accent }}
              >
                {node.i + 1}
              </span>
              <span className="min-w-0">
                <span className="font-semibold">{node.title}</span>
                <span className="block text-sm leading-snug text-muted">{node.body}</span>
              </span>
            </li>
          ))}
        </ol>
      </div>
    </div>
  );
}
