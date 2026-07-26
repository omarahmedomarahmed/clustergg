"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Icon from "@/components/Icon";

// The reading shell around a document.
//
// Three jobs, all of which have to work on a phone:
//
//  1. **Jump anywhere.** A deck is read out of order — an investor goes
//     straight to traction, a partner to activations. So every section is one
//     tap away and the nav says which one you're in.
//  2. **Track what was read.** Not just that the page was opened: which
//     sections, and for how long. That's the difference between "someone
//     opened the deck" and "they spent four minutes on the business model".
//  3. **Stay out of the way.** The nav collapses to a single chip on mobile,
//     because a permanent list of fifteen links eats a phone screen.

export type NavItem = { anchor: string; label: string };

export function DocShell({ docId, sections, accent, children }: {
  docId: string;
  sections: NavItem[];
  accent: string;
  children: React.ReactNode;
}) {
  const [active, setActive] = useState(sections[0]?.anchor ?? "");
  const [open, setOpen] = useState(false);
  const [progress, setProgress] = useState(0);

  // Dwell time per section, flushed on the way out. Sending an event per scroll
  // would be a request storm and would still under-report, because the
  // interesting number is how long someone STAYED.
  const dwell = useRef<Record<string, number>>({});
  const current = useRef<{ anchor: string; since: number }>({ anchor: "", since: Date.now() });

  const settle = useCallback((next: string) => {
    const now = Date.now();
    const prev = current.current;
    if (prev.anchor) {
      const secs = Math.round((now - prev.since) / 1000);
      // Under two seconds is scrolling past, not reading.
      if (secs >= 2) dwell.current[prev.anchor] = (dwell.current[prev.anchor] ?? 0) + secs;
    }
    current.current = { anchor: next, since: now };
  }, []);

  useEffect(() => {
    const els = sections
      .map((s) => document.getElementById(s.anchor))
      .filter((e): e is HTMLElement => !!e);
    if (!els.length) return;

    const io = new IntersectionObserver(
      (entries) => {
        // The section occupying the most of the viewport wins, which is what a
        // reader would say they're looking at.
        const best = entries
          .filter((e) => e.isIntersecting)
          .sort((a, b) => b.intersectionRatio - a.intersectionRatio)[0];
        if (best?.target.id) {
          setActive(best.target.id);
          settle(best.target.id);
        }
      },
      { rootMargin: "-20% 0px -50% 0px", threshold: [0.1, 0.35, 0.6] },
    );
    els.forEach((e) => io.observe(e));

    const onScroll = () => {
      const h = document.documentElement.scrollHeight - window.innerHeight;
      setProgress(h > 0 ? Math.min(100, Math.max(0, (window.scrollY / h) * 100)) : 0);
    };
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => { io.disconnect(); window.removeEventListener("scroll", onScroll); };
  }, [sections, settle]);

  // Flush on leave. `sendBeacon` is the only thing that reliably survives a tab
  // close, which is exactly when the most complete reading data exists.
  useEffect(() => {
    const flush = () => {
      settle("");
      const entries = Object.entries(dwell.current).filter(([, s]) => s >= 2);
      if (!entries.length) return;
      dwell.current = {};
      const body = JSON.stringify({
        docId,
        sections: entries.map(([anchor, seconds]) => ({ anchor, seconds })),
      });
      try {
        if (navigator.sendBeacon) {
          navigator.sendBeacon("/api/dataroom/track", new Blob([body], { type: "application/json" }));
        } else {
          void fetch("/api/dataroom/track", { method: "POST", body, keepalive: true });
        }
      } catch { /* a lost analytics event is not worth an error */ }
    };
    const onHide = () => { if (document.visibilityState === "hidden") flush(); };
    document.addEventListener("visibilitychange", onHide);
    window.addEventListener("pagehide", flush);
    return () => {
      flush();
      document.removeEventListener("visibilitychange", onHide);
      window.removeEventListener("pagehide", flush);
    };
  }, [docId, settle]);

  const go = (anchor: string) => {
    document.getElementById(anchor)?.scrollIntoView({ behavior: "smooth", block: "start" });
    setOpen(false);
  };

  const activeLabel = sections.find((s) => s.anchor === active)?.label ?? sections[0]?.label ?? "";

  return (
    <div className="relative">
      {/* How far through the document you are. The cheapest possible answer to
          "how long is this?", which is the first thing a reader wants. */}
      <div className="fixed inset-x-0 top-0 z-50 h-0.5 bg-transparent print:hidden">
        <div className="h-full transition-[width] duration-150" style={{ width: `${progress}%`, background: accent }} />
      </div>

      {/* Desktop: a rail down the side. */}
      <nav className="hidden lg:block fixed left-6 top-1/2 -translate-y-1/2 z-40 print:hidden">
        <ul className="space-y-1 max-h-[70vh] overflow-y-auto pr-2 [scrollbar-width:none]">
          {sections.map((s) => {
            const on = s.anchor === active;
            return (
              <li key={s.anchor}>
                <button
                  type="button"
                  onClick={() => go(s.anchor)}
                  className={`group flex items-center gap-2.5 text-left text-xs transition ${on ? "font-bold" : "text-muted hover:text-ink"}`}
                >
                  <span
                    className="block h-px transition-all"
                    style={{ width: on ? 26 : 12, background: on ? accent : "rgba(255,255,255,0.25)" }}
                  />
                  <span style={on ? { color: accent } : undefined}>{s.label}</span>
                </button>
              </li>
            );
          })}
        </ul>
      </nav>

      {/* Mobile: one chip that opens the list. A permanent list of fifteen
          links would eat the screen the document is supposed to fill. */}
      <div className="lg:hidden sticky top-2 z-40 px-4 print:hidden">
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          className="w-full flex items-center justify-between gap-3 rounded-full border border-white/15 bg-[#0a0a1c]/90 backdrop-blur-xl px-4 py-2.5 text-sm"
        >
          <span className="flex items-center gap-2 min-w-0">
            <span className="h-1.5 w-1.5 rounded-full shrink-0" style={{ background: accent }} />
            <span className="font-semibold truncate">{activeLabel}</span>
          </span>
          <Icon name={open ? "chevronDown" : "chevronRight"} size={15} className="shrink-0 text-muted" />
        </button>
        {open && (
          <div className="mt-2 rounded-2xl border border-white/12 bg-[#0a0a1c]/95 backdrop-blur-xl p-2 shadow-2xl max-h-[60vh] overflow-y-auto">
            {sections.map((s) => (
              <button
                key={s.anchor}
                type="button"
                onClick={() => go(s.anchor)}
                className={`block w-full text-left rounded-lg px-3 py-2 text-sm ${
                  s.anchor === active ? "bg-white/10 font-semibold" : "text-muted hover:bg-white/5"
                }`}
              >
                {s.label}
              </button>
            ))}
          </div>
        )}
      </div>

      {children}
    </div>
  );
}
