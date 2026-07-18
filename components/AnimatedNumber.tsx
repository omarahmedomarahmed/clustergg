"use client";

import { useEffect, useRef, useState } from "react";

// Counts up from 0 to `value` on mount / when it enters the viewport. Powers the
// "money numbers" on the brand portal so the dashboard feels alive.
export default function AnimatedNumber({
  value, duration = 900, suffix = "", decimals = 0, className = "",
}: { value: number; duration?: number; suffix?: string; decimals?: number; className?: string }) {
  const [shown, setShown] = useState(0);
  const ref = useRef<HTMLSpanElement>(null);
  const started = useRef(false);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const run = () => {
      if (started.current) return;
      started.current = true;
      const start = performance.now();
      const tick = (now: number) => {
        const t = Math.min(1, (now - start) / duration);
        // easeOutCubic
        const eased = 1 - Math.pow(1 - t, 3);
        setShown(value * eased);
        if (t < 1) requestAnimationFrame(tick);
        else setShown(value);
      };
      requestAnimationFrame(tick);
    };
    const io = new IntersectionObserver((entries) => {
      for (const e of entries) if (e.isIntersecting) { run(); io.disconnect(); }
    }, { threshold: 0.2 });
    io.observe(el);
    return () => io.disconnect();
  }, [value, duration]);

  const fmt = decimals > 0 ? shown.toFixed(decimals) : Math.round(shown).toLocaleString();
  return <span ref={ref} className={className}>{fmt}{suffix}</span>;
}
