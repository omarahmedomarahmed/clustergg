"use client";

// The countdown to Friday, and the in-place pool refresh.
//
// The homepage must refresh the pool "in place without a page reload"
// (docs/00-TRUTH.md §10). This is the only client component on the public
// site: everything else is server-rendered, because everything else is a fact
// rather than a ticking clock.

import { useEffect, useState } from "react";

export function Countdown({ toISO }: { toISO: string }) {
  const target = new Date(toISO).getTime();
  const [now, setNow] = useState<number | null>(null);

  useEffect(() => {
    setNow(Date.now());
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);

  // Rendered empty on the server and on the first client paint, so the markup
  // matches and React does not complain about a mismatch it cannot avoid.
  if (now === null) return <span className="tabular-nums text-mute">—</span>;

  const left = Math.max(0, target - now);
  const d = Math.floor(left / 86_400_000);
  const h = Math.floor((left % 86_400_000) / 3_600_000);
  const m = Math.floor((left % 3_600_000) / 60_000);
  const s = Math.floor((left % 60_000) / 1000);

  return (
    <span className="tabular-nums">
      {d}d {String(h).padStart(2, "0")}:{String(m).padStart(2, "0")}:
      {String(s).padStart(2, "0")}
    </span>
  );
}

export function PoolRefresher({ intervalMs = 15_000 }: { intervalMs?: number }) {
  const [, setTick] = useState(0);
  useEffect(() => {
    const t = setInterval(() => {
      // A soft refresh of the server components on this route: the numbers
      // move, the page does not reload, and nobody loses their scroll.
      setTick((n) => n + 1);
      void fetch(window.location.pathname, { headers: { "x-refresh": "1" } });
    }, intervalMs);
    return () => clearInterval(t);
  }, [intervalMs]);
  return null;
}
