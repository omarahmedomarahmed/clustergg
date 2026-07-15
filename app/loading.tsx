// Global navigation fallback — shown automatically while a new (dynamic) route
// segment loads, so clicking a link gives instant "something's happening"
// feedback instead of a stale page.
export default function Loading() {
  return (
    <div className="fixed inset-0 z-[60] flex flex-col items-center justify-center bg-[#04051a]/70 backdrop-blur-sm">
      <div className="relative h-20 w-20">
        {/* Core planet */}
        <div className="absolute inset-3 rounded-full" style={{ background: "radial-gradient(circle at 35% 30%, #a78bfa, #6d28d9 65%, #2e1065)", boxShadow: "0 0 30px -4px #8b5cf6" }} />
        {/* Orbiting moon */}
        <div className="absolute inset-0 animate-spin" style={{ animationDuration: "1s" }}>
          <span className="absolute left-1/2 top-0 h-2.5 w-2.5 -translate-x-1/2 rounded-full bg-cyan-300" style={{ boxShadow: "0 0 10px 2px #22d3ee" }} />
        </div>
        <div className="absolute inset-0 rounded-full border border-violet-400/25" />
      </div>
      <div className="mt-4 text-sm font-semibold tracking-wide grad-text animate-pulse">Traversing the cluster…</div>
    </div>
  );
}
