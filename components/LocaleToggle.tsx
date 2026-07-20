"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { setLocale } from "@/app/actions/prefs";
import { LOCALES, localeMeta, type Locale } from "@/lib/i18n/locale";

// Always-visible language flag in the nav: shows the current language's flag,
// clicking switches to the other (🇺🇸 English ⇄ 🇪🇬 العربية) and re-renders.
export default function LocaleToggle({ current, compact = false }: { current: Locale; compact?: boolean }) {
  const [pending, start] = useTransition();
  const router = useRouter();
  const next: Locale = current === "ar" ? "en" : "ar";
  const cur = localeMeta(current);
  const nxt = LOCALES.find((l) => l.code === next)!;
  return (
    <button type="button" disabled={pending} title={`Switch to ${nxt.native}`}
      onClick={() => start(async () => { await setLocale(next); router.refresh(); })}
      className={`inline-flex items-center gap-1.5 rounded-full border border-violet-400/25 px-2.5 py-1 hover:border-cyan-400/50 transition-colors disabled:opacity-50 ${compact ? "" : "shrink-0"}`}>
      <span className="text-base leading-none" aria-hidden>{cur.flag}</span>
      <span className="text-[11px] font-bold uppercase tracking-wide text-muted">{current}</span>
    </button>
  );
}
