"use client";

import { useEffect, useRef, useState, createContext, useContext, useCallback } from "react";
import Icon from "@/components/Icon";

// One modal, used by everything in a document that has more behind it — a
// person, a GTM stage, a gallery image, a metric definition.
//
// Behaviour is deliberately uniform, because a reader who learns that clicking
// something opens a panel and that clicking anywhere closes it will keep
// clicking. Different close affordances per component is how people stop
// exploring.

type Detail = {
  title: string;
  subtitle?: string;
  imageUrl?: string | null;
  /** Rendered as paragraphs on blank lines. */
  body?: string | null;
  bullets?: string[];
  logos?: { name: string; logoUrl?: string | null; url?: string | null }[];
  links?: { label: string; href: string; primary?: boolean }[];
  accent?: string;
};

const Ctx = createContext<(d: Detail) => void>(() => {});

export function useDetail() { return useContext(Ctx); }

export function DetailProvider({ accent, children }: { accent: string; children: React.ReactNode }) {
  const [detail, setDetail] = useState<Detail | null>(null);
  const panel = useRef<HTMLDivElement>(null);
  const open = useCallback((d: Detail) => setDetail(d), []);

  useEffect(() => {
    if (!detail) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") setDetail(null); };
    document.addEventListener("keydown", onKey);
    // A modal that leaves the page scrolling behind it feels broken on a phone.
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = prev;
    };
  }, [detail]);

  const a = detail?.accent || accent;

  return (
    <Ctx.Provider value={open}>
      {children}
      {detail && (
        // Click anywhere closes it — including the backdrop, which is where
        // most people aim.
        <div
          className="fixed inset-0 z-[100] flex items-end sm:items-center justify-center p-0 sm:p-6 print:hidden"
          onClick={() => setDetail(null)}
          role="dialog"
          aria-modal="true"
          aria-label={detail.title}
        >
          <div aria-hidden className="absolute inset-0 bg-black/75 backdrop-blur-sm animate-[fadeIn_.12s_ease]" />
          <div
            ref={panel}
            onClick={(e) => e.stopPropagation()}
            className="relative w-full sm:max-w-lg max-h-[88vh] overflow-y-auto rounded-t-3xl sm:rounded-3xl border border-white/12 bg-[#0a0a1c] shadow-2xl"
            style={{ borderTopColor: a }}
          >
            <button
              type="button"
              onClick={() => setDetail(null)}
              aria-label="Close"
              className="absolute right-3 top-3 z-10 grid h-8 w-8 place-items-center rounded-full bg-black/50 text-muted hover:text-ink"
            >
              <Icon name="x" size={16} />
            </button>

            {detail.imageUrl && (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={detail.imageUrl} alt="" className="w-full max-h-64 object-cover" />
            )}

            <div className="p-6 sm:p-7">
              <h3 className="text-xl font-black leading-tight pr-8">{detail.title}</h3>
              {detail.subtitle && (
                <p className="text-sm mt-1" style={{ color: a }}>{detail.subtitle}</p>
              )}

              {detail.body && (
                <div className="mt-4 space-y-3">
                  {detail.body.split(/\n{2,}/).map((p, i) => (
                    <p key={i} className="text-sm leading-relaxed text-ink/90">{p}</p>
                  ))}
                </div>
              )}

              {detail.bullets && detail.bullets.length > 0 && (
                <ul className="mt-4 space-y-2">
                  {detail.bullets.map((b, i) => (
                    <li key={i} className="flex gap-2.5 text-sm leading-relaxed text-ink/90">
                      <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full" style={{ background: a }} />
                      <span>{b}</span>
                    </li>
                  ))}
                </ul>
              )}

              {detail.logos && detail.logos.length > 0 && (
                <div className="mt-5">
                  <div className="text-[10px] uppercase tracking-widest text-muted mb-2">Previously</div>
                  <div className="flex flex-wrap gap-2">
                    {detail.logos.map((l, i) => (
                      <span key={i} className="inline-flex items-center gap-2 rounded-lg border border-white/12 bg-black/30 px-2.5 py-1.5">
                        {l.logoUrl
                          // eslint-disable-next-line @next/next/no-img-element
                          ? <img src={l.logoUrl} alt="" className="h-5 w-5 object-contain rounded" />
                          : <span className="grid h-5 w-5 place-items-center rounded bg-white/10 text-[9px] font-black">{l.name.slice(0, 1)}</span>}
                        <span className="text-xs">{l.name}</span>
                      </span>
                    ))}
                  </div>
                </div>
              )}

              {detail.links && detail.links.length > 0 && (
                <div className="flex flex-wrap gap-2 mt-6">
                  {detail.links.map((l, i) => (
                    <a
                      key={i}
                      href={l.href}
                      target={l.href.startsWith("http") ? "_blank" : undefined}
                      rel={l.href.startsWith("http") ? "noreferrer" : undefined}
                      className={`pressable rounded-full px-5 py-2 text-sm font-semibold ${l.primary ? "text-white" : "ghost-btn"}`}
                      style={l.primary ? { background: a } : undefined}
                    >
                      {l.label}
                    </a>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </Ctx.Provider>
  );
}
