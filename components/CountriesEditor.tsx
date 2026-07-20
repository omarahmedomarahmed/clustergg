"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Icon from "@/components/Icon";
import { saveCountries } from "@/app/actions/language";
import { flagEmoji, type Country } from "@/lib/flags";

// Admin control over the country roster gamers pick their flag from.
export default function CountriesEditor({ initial }: { initial: Country[] }) {
  const [rows, setRows] = useState<Country[]>(initial);
  const [pending, start] = useTransition();
  const [saved, setSaved] = useState(false);
  const router = useRouter();

  const set = (i: number, p: Partial<Country>) => { setRows((r) => r.map((x, j) => j === i ? { ...x, ...p } : x)); setSaved(false); };
  const add = () => { setRows((r) => [...r, { code: "", name: "" }]); setSaved(false); };
  const remove = (i: number) => { setRows((r) => r.filter((_, j) => j !== i)); setSaved(false); };
  const save = () => start(async () => {
    const clean = rows.filter((r) => /^[A-Za-z]{2}$/.test(r.code) && r.name.trim());
    await saveCountries(JSON.stringify(clean));
    setSaved(true); router.refresh();
  });

  return (
    <section className="glass p-5 md:p-6">
      <h2 className="font-bold flex items-center gap-2 mb-1"><Icon name="globe" size={18} className="text-cyan-300" /> Country flags roster</h2>
      <p className="text-sm text-muted mb-4">The countries gamers can pick a flag from on their profile. Flags are drawn automatically from the 2-letter ISO code.</p>
      <div className="grid sm:grid-cols-2 gap-2 max-h-[46vh] overflow-y-auto pr-1">
        {rows.map((r, i) => (
          <div key={i} className="flex items-center gap-2 rounded-lg border border-white/10 bg-black/20 p-1.5">
            <span className="text-xl w-7 text-center">{flagEmoji(r.code) || "🏳️"}</span>
            <input value={r.code} onChange={(e) => set(i, { code: e.target.value.toUpperCase().slice(0, 2) })} placeholder="US" className="input-cosmic !py-1 !w-16 text-sm uppercase text-center" />
            <input value={r.name} onChange={(e) => set(i, { name: e.target.value })} placeholder="Country name" className="input-cosmic !py-1 flex-1 text-sm" />
            <button onClick={() => remove(i)} className="text-rose-300 hover:text-rose-200 shrink-0"><Icon name="x" size={14} /></button>
          </div>
        ))}
      </div>
      <div className="mt-4 flex items-center gap-3">
        <button onClick={add} className="ghost-btn pressable rounded-full px-4 py-1.5 text-xs inline-flex items-center gap-1"><Icon name="plus" size={12} /> Add country</button>
        <button onClick={save} disabled={pending} className="glow-btn pressable rounded-full px-6 py-1.5 text-sm font-semibold text-white disabled:opacity-50">{pending ? "Saving…" : "Save roster"}</button>
        {saved && !pending && <span className="text-xs text-emerald-300">Saved ✓</span>}
        <span className="text-[11px] text-muted ml-auto">{rows.length} countries</span>
      </div>
    </section>
  );
}
