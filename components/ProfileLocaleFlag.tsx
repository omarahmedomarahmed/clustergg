"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { saveProfileFlag } from "@/app/actions/prefs";
import { flagEmoji, type Country } from "@/lib/flags";
import { LOCALES } from "@/lib/i18n/locale";
import Icon from "@/components/Icon";

// Profile customisation: the gamer's country flag (shown next to their name
// everywhere) + their site language. Both changeable any time.
export default function ProfileLocaleFlag({ countries, country, locale }: { countries: Country[]; country: string; locale: string }) {
  const [c, setC] = useState((country || "").toUpperCase());
  const [l, setL] = useState(locale === "ar" ? "ar" : "en");
  const [pending, start] = useTransition();
  const [saved, setSaved] = useState(false);
  const router = useRouter();
  const save = () => start(async () => { await saveProfileFlag(c, l); setSaved(true); router.refresh(); });

  return (
    <section className="glass p-5 md:p-6">
      <h2 className="font-bold flex items-center gap-2 mb-1"><Icon name="globe" size={18} className="text-cyan-300" /> Flag &amp; language</h2>
      <p className="text-sm text-muted mb-4">Choose the country flag shown next to your name across every leaderboard, quest and challenge — and set your site language. Change either any time.</p>
      <div className="grid sm:grid-cols-2 gap-4">
        <label className="block">
          <span className="text-sm text-muted flex items-center gap-2">Country flag {c && <span className="text-xl leading-none">{flagEmoji(c)}</span>}</span>
          <select value={c} onChange={(e) => { setC(e.target.value); setSaved(false); }} className="input-cosmic mt-1 w-full">
            <option value="">No flag</option>
            {countries.map((x) => <option key={x.code} value={x.code}>{flagEmoji(x.code)} {x.name}</option>)}
          </select>
        </label>
        <label className="block">
          <span className="text-sm text-muted">Site language</span>
          <select value={l} onChange={(e) => { setL(e.target.value); setSaved(false); }} className="input-cosmic mt-1 w-full">
            {LOCALES.map((x) => <option key={x.code} value={x.code}>{x.flag} {x.native}</option>)}
          </select>
        </label>
      </div>
      <div className="mt-4 flex items-center gap-3">
        <button onClick={save} disabled={pending} className="glow-btn pressable rounded-full px-6 py-2 text-sm font-semibold text-white disabled:opacity-50">{pending ? "Saving…" : "Save"}</button>
        {saved && !pending && <span className="text-xs text-emerald-300">Saved ✓</span>}
      </div>
    </section>
  );
}
