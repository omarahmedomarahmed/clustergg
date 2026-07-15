"use client";

import { useEffect, useRef, useState } from "react";
import { usePathname } from "next/navigation";

// A thin top loading bar that starts the moment an internal link is clicked
// (instant feedback) and finishes when the new route commits. Pairs with the
// full-screen app/loading.tsx overlay for slower navigations.
export default function RouteProgress() {
  const pathname = usePathname();
  const [width, setWidth] = useState(0);
  const [visible, setVisible] = useState(false);
  const ramp = useRef<ReturnType<typeof setInterval> | null>(null);
  const safety = useRef<ReturnType<typeof setTimeout> | null>(null);

  const stopRamp = () => { if (ramp.current) { clearInterval(ramp.current); ramp.current = null; } };

  const start = () => {
    stopRamp();
    setVisible(true);
    setWidth(8);
    ramp.current = setInterval(() => {
      setWidth((w) => (w >= 90 ? 90 : w + Math.max(0.5, (92 - w) * 0.08)));
    }, 120);
    if (safety.current) clearTimeout(safety.current);
    safety.current = setTimeout(() => finish(), 10000);
  };

  const finish = () => {
    stopRamp();
    setWidth(100);
    setTimeout(() => { setVisible(false); setWidth(0); }, 280);
  };

  // Start on any left-click of an internal link.
  useEffect(() => {
    function onClick(e: MouseEvent) {
      if (e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
      const a = (e.target as HTMLElement)?.closest?.("a");
      if (!a) return;
      const href = a.getAttribute("href");
      const target = a.getAttribute("target");
      if (!href || target === "_blank" || href.startsWith("#") || href.startsWith("http") || href.startsWith("mailto:")) return;
      if (href === pathname) return; // same page — nothing loads
      start();
    }
    document.addEventListener("click", onClick, true);
    return () => document.removeEventListener("click", onClick, true);
  }, [pathname]);

  // Finish whenever the committed route changes.
  useEffect(() => { finish(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [pathname]);

  useEffect(() => () => { stopRamp(); if (safety.current) clearTimeout(safety.current); }, []);

  if (!visible) return null;
  return (
    <div className="fixed inset-x-0 top-0 z-[70] h-0.5 print:hidden" aria-hidden="true">
      <div className="h-full transition-[width] duration-150 ease-out"
        style={{ width: `${width}%`, background: "linear-gradient(90deg, #8b5cf6, #22d3ee)", boxShadow: "0 0 10px 1px #22d3ee" }} />
    </div>
  );
}
