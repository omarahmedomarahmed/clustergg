"use client";

import { useMemo, useState, useTransition } from "react";
import Icon from "@/components/Icon";
import { saveArabicContent } from "@/app/actions/language";

export type ArabicItem = { key: string; label: string; en: string; ar: string; multiline?: boolean };

// Admin editor: translate every site-copy content key into Arabic. The English
// value is shown as reference; the Arabic value overlays it site-wide when the
// language is set to Arabic (blank falls back to English).
export default function ArabicContentEditor({ items }: { items: ArabicItem[] }) {
  const [vals, setVals] = useState<Record<string, string>>(() => Object.fromEntries(items.map((i) => [i.key, i.ar])));
  const [q, setQ] = useState("");
  const [onlyMissing, setOnlyMissing] = useState(false);
  const [pendingKey, setPendingKey] = useState<string | null>(null);
  const [, start] = useTransition();

  const done = useMemo(() => items.filter((i) => (vals[i.key] ?? "").trim()).length, [items, vals]);
  const shown = items.filter((i) =>
    (!q || i.label.toLowerCase().includes(q.toLowerCase()) || i.en.toLowerCase().includes(q.toLowerCase())) &&
    (!onlyMissing || !(vals[i.key] ?? "").trim()));

  const save = (key: string) => { setPendingKey(key); start(async () => { await saveArabicContent(key, vals[key] ?? ""); setPendingKey(null); }); };

  return (
    <section className="glass p-5 md:p-6">
      <div className="flex flex-wrap items-center justify-between gap-3 mb-3">
        <div>
          <h2 className="font-bold flex items-center gap-2"><Icon name="spark" size={18} className="text-cyan-300" /> Arabic site content</h2>
          <p className="text-sm text-muted mt-0.5">Translate the site copy. Each Arabic value replaces the English one when a gamer switches to Arabic.</p>
        </div>
        <div className="text-xs text-muted"><b className="text-cyan-200">{done}</b> / {items.length} translated</div>
      </div>
      <div className="flex flex-wrap items-center gap-2 mb-3">
        <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search…" className="input-cosmic !py-1.5 !w-56 text-sm" />
        <label className="text-xs text-muted flex items-center gap-1.5"><input type="checkbox" checked={onlyMissing} onChange={(e) => setOnlyMissing(e.target.checked)} /> Untranslated only</label>
      </div>
      <div className="space-y-3 max-h-[62vh] overflow-y-auto pr-1">
        {shown.map((it) => (
          <div key={it.key} className="rounded-xl border border-white/10 bg-black/20 p-3">
            <div className="flex items-center justify-between gap-2 mb-1">
              <span className="text-xs font-bold text-cyan-200">{it.label}</span>
              <span className="text-[10px] font-mono text-muted">{it.key}</span>
            </div>
            <div className="text-[12px] text-muted mb-2 whitespace-pre-line border-l-2 border-white/10 pl-2">{it.en || <span className="italic">—</span>}</div>
            <div className="flex items-start gap-2">
              {it.multiline
                ? <textarea dir="rtl" value={vals[it.key] ?? ""} onChange={(e) => setVals((v) => ({ ...v, [it.key]: e.target.value }))} rows={2} className="input-cosmic !py-1.5 flex-1 text-sm" placeholder="الترجمة العربية…" />
                : <input dir="rtl" value={vals[it.key] ?? ""} onChange={(e) => setVals((v) => ({ ...v, [it.key]: e.target.value }))} className="input-cosmic !py-1.5 flex-1 text-sm" placeholder="الترجمة العربية…" />}
              <button onClick={() => save(it.key)} disabled={pendingKey === it.key} className="ghost-btn pressable rounded-full px-3 py-1.5 text-xs shrink-0 disabled:opacity-50">{pendingKey === it.key ? "…" : "Save"}</button>
            </div>
          </div>
        ))}
        {shown.length === 0 && <div className="text-sm text-muted text-center py-6">Nothing matches.</div>}
      </div>
    </section>
  );
}
