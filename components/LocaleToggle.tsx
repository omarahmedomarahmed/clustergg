"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { setLocale } from "@/app/actions/prefs";
import { LOCALES, localeMeta, type Locale } from "@/lib/i18n/locale";

// Compact language picker: a small flag button that opens a dropdown to choose
// the site language (🇺🇸 English / 🇪🇬 العربية).
export default function LocaleToggle({ current }: { current: Locale; compact?: boolean }) {
  const [pending, start] = useTransition();
  const [open, setOpen] = useState(false);
  const router = useRouter();
  const wrap = useRef<HTMLDivElement | null>(null);
  const cur = localeMeta(current);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => { if (wrap.current && !wrap.current.contains(e.target as Node)) setOpen(false); };
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") setOpen(false); };
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => { document.removeEventListener("mousedown", onDown); document.removeEventListener("keydown", onKey); };
  }, [open]);

  // The target locale we're switching to (drives the overlay label/flag).
  const [target, setTarget] = useState<Locale | null>(null);
  const pick = (loc: Locale) => {
    setOpen(false);
    if (loc === current) return;
    setTarget(loc);
    start(async () => { await setLocale(loc); router.refresh(); });
  };

  const tgt = target ? localeMeta(target) : null;

  return (
    <div className="relative" ref={wrap}>
      <button type="button" aria-label="Language" disabled={pending} onClick={() => setOpen((v) => !v)}
        className="flex h-8 w-8 items-center justify-center rounded-full border border-violet-400/25 text-base leading-none hover:border-cyan-400/50 transition-colors disabled:opacity-60">
        {pending
          ? <span className="h-4 w-4 rounded-full border-2 border-cyan-300/40 border-t-cyan-300 animate-spin" aria-hidden />
          : <span aria-hidden>{cur.flag}</span>}
      </button>
      {open && !pending && (
        <div className="absolute right-0 mt-2 w-40 rounded-xl border border-violet-500/25 bg-[#0a0b2e]/95 backdrop-blur-xl shadow-2xl overflow-hidden z-50">
          {LOCALES.map((l) => (
            <button key={l.code} onClick={() => pick(l.code)}
              className={`w-full flex items-center gap-2.5 px-3 py-2 text-sm text-left hover:bg-violet-500/15 ${l.code === current ? "text-cyan-300" : "text-ink"}`}>
              <span className="text-base leading-none" aria-hidden>{l.flag}</span>
              <span className="flex-1">{l.native}</span>
              {l.code === current && <span className="text-cyan-300">✓</span>}
            </button>
          ))}
        </div>
      )}

      {/* Full-screen loading overlay while the locale switches + the page refreshes */}
      {pending && tgt && (
        <div className="fixed inset-0 z-[100] flex flex-col items-center justify-center gap-4 bg-[#04051a]/80 backdrop-blur-sm" role="status" aria-live="polite">
          <div className="relative flex h-16 w-16 items-center justify-center">
            <span className="absolute inset-0 rounded-full border-2 border-cyan-400/25 border-t-cyan-300 animate-spin" />
            <span className="text-3xl leading-none" aria-hidden>{tgt.flag}</span>
          </div>
          <div className="text-center">
            <div className="text-sm font-semibold text-ink">{tgt.code === "ar" ? "جارٍ تبديل اللغة…" : "Switching language…"}</div>
            <div className="text-xs text-muted mt-0.5">{tgt.native}</div>
          </div>
        </div>
      )}
    </div>
  );
}
