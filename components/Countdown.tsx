"use client";

import { useEffect, useState } from "react";

function fmt(ms: number): string {
  if (ms <= 0) return "Ended";
  const s = Math.floor(ms / 1000);
  const d = Math.floor(s / 86400);
  const h = Math.floor((s % 86400) / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  if (d > 0) return `${d}d ${h}h ${m}m`;
  if (h > 0) return `${h}h ${m}m ${sec}s`;
  return `${m}m ${sec}s`;
}

// A live-ticking countdown to a challenge's end time. Renders "Ended" once past.
export default function Countdown({ endsAt, prefix = "", className = "" }: { endsAt: string; prefix?: string; className?: string }) {
  const [now, setNow] = useState<number | null>(null);
  useEffect(() => {
    setNow(Date.now());
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);
  // Avoid hydration mismatch: render nothing until mounted on the client.
  if (now === null) return <span className={className} suppressHydrationWarning>{prefix}…</span>;
  return <span className={className} suppressHydrationWarning>{prefix}{fmt(new Date(endsAt).getTime() - now)}</span>;
}
