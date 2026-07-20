"use client";

import { useState, useTransition } from "react";
import Icon from "@/components/Icon";
import { saveUiString } from "@/app/actions/language";

export type UiItem = { key: string; en: string; ar: string };
export type UiGroup = { page: string; items: UiItem[] };

// Admin editor for every interface string, grouped by page. Each string is
// editable in BOTH English and Arabic; saving writes per-locale overrides that
// win over the built-ins site-wide.
export default function UiStringsEditor({ groups }: { groups: UiGroup[] }) {
  const [vals, setVals] = useState<Record<string, { en: string; ar: string }>>(() => {
    const m: Record<string, { en: string; ar: string }> = {};
    for (const g of groups) for (const it of g.items) m[it.key] = { en: it.en, ar: it.ar };
    return m;
  });
  const [q, setQ] = useState("");
  const [open, setOpen] = useState<string | null>(groups[0]?.page ?? null);
  const [pendingKey, setPendingKey] = useState<string | null>(null);
  const [, start] = useTransition();

  const set = (key: string, part: "en" | "ar", v: string) => setVals((s) => ({ ...s, [key]: { ...s[key], [part]: v } }));
  const save = (key: string) => {
    setPendingKey(key);
    start(async () => { const v = vals[key]; await saveUiString(key, "en", v.en); await saveUiString(key, "ar", v.ar); setPendingKey(null); });
  };

  return (
    <section className="glass p-5 md:p-6">
      <div className="flex flex-wrap items-center justify-between gap-3 mb-3">
        <div>
          <h2 className="font-bold flex items-center gap-2"><Icon name="spark" size={18} className="text-cyan-300" /> Every page&apos;s text (English &amp; Arabic)</h2>
          <p className="text-sm text-muted mt-0.5">Edit any interface word in both languages. Changes apply site-wide; blank falls back to the built-in.</p>
        </div>
        <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search…" className="input-cosmic !py-1.5 !w-56 text-sm" />
      </div>
      <div className="space-y-2">
        {groups.map((g) => {
          const items = g.items.filter((it) => !q || it.en.toLowerCase().includes(q.toLowerCase()) || it.key.toLowerCase().includes(q.toLowerCase()) || (vals[it.key]?.ar ?? "").includes(q));
          if (items.length === 0) return null;
          const isOpen = open === g.page || !!q;
          return (
            <div key={g.page} className="rounded-xl border border-white/10 bg-black/20">
              <button onClick={() => setOpen(isOpen && !q ? null : g.page)} className="w-full flex items-center justify-between px-4 py-2.5 text-left">
                <span className="font-bold text-sm">{g.page} <span className="text-muted font-normal">· {items.length}</span></span>
                <Icon name="chevronDown" size={16} className={`text-muted transition-transform ${isOpen ? "rotate-180" : ""}`} />
              </button>
              {isOpen && (
                <div className="px-3 pb-3 space-y-2">
                  {items.map((it) => (
                    <div key={it.key} className="rounded-lg border border-white/10 bg-black/20 p-2.5">
                      <div className="text-[10px] font-mono text-muted mb-1.5 truncate">{it.key}</div>
                      <div className="grid sm:grid-cols-2 gap-2">
                        <label className="block"><span className="text-[10px] uppercase tracking-widest text-muted">English</span>
                          <input value={vals[it.key]?.en ?? ""} onChange={(e) => set(it.key, "en", e.target.value)} className="input-cosmic !py-1.5 w-full text-sm mt-0.5" /></label>
                        <label className="block"><span className="text-[10px] uppercase tracking-widest text-muted">العربية</span>
                          <input dir="rtl" value={vals[it.key]?.ar ?? ""} onChange={(e) => set(it.key, "ar", e.target.value)} placeholder="الترجمة…" className="input-cosmic !py-1.5 w-full text-sm mt-0.5" /></label>
                      </div>
                      <div className="mt-1.5 text-right">
                        <button onClick={() => save(it.key)} disabled={pendingKey === it.key} className="ghost-btn pressable rounded-full px-4 py-1 text-xs disabled:opacity-50">{pendingKey === it.key ? "…" : "Save"}</button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </section>
  );
}
