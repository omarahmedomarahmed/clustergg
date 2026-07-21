"use client";

import { useState, useTransition } from "react";
import Icon from "@/components/Icon";
import { saveMobileChrome } from "@/app/actions/mobile-nav";
import { defaultBottomTabs, type MobileTab, type DrawerLink } from "@/lib/mobile-nav";

const ICON_HINTS = ["home", "trophy", "chart", "planet", "user", "gamepad", "zap", "message", "users", "spark", "link", "search", "bell", "settings"];

// Admin editor for the mobile bottom tab bar + the extra side-drawer links.
export default function MobileChromeEditor({ initialBottom, initialDrawer }: { initialBottom: MobileTab[]; initialDrawer: DrawerLink[] }) {
  const [bottom, setBottom] = useState<MobileTab[]>(initialBottom.length ? initialBottom : defaultBottomTabs(true));
  const [drawer, setDrawer] = useState<DrawerLink[]>(initialDrawer);
  const [pending, start] = useTransition();
  const [saved, setSaved] = useState(false);

  const upTab = (i: number, patch: Partial<MobileTab>) => setBottom((a) => a.map((t, j) => (j === i ? { ...t, ...patch } : t)));
  const setCenter = (i: number) => setBottom((a) => a.map((t, j) => ({ ...t, center: j === i })));
  const moveTab = (i: number, dir: -1 | 1) => setBottom((a) => { const b = [...a]; const j = i + dir; if (j < 0 || j >= b.length) return a; [b[i], b[j]] = [b[j], b[i]]; return b; });
  const addTab = () => setBottom((a) => [...a, { key: `t${a.length}`, label: "New", icon: "spark", href: "/", enabled: true }]);
  const rmTab = (i: number) => setBottom((a) => a.filter((_, j) => j !== i));

  const upLink = (i: number, patch: Partial<DrawerLink>) => setDrawer((a) => a.map((l, j) => (j === i ? { ...l, ...patch } : l)));
  const addLink = () => setDrawer((a) => [...a, { label: "New link", icon: "link", href: "/" }]);
  const rmLink = (i: number) => setDrawer((a) => a.filter((_, j) => j !== i));

  const save = () => start(async () => { await saveMobileChrome(bottom, drawer); setSaved(true); setTimeout(() => setSaved(false), 2500); });

  return (
    <div className="space-y-6">
      {/* Bottom tab bar */}
      <section className="glass p-5">
        <div className="flex items-center justify-between mb-1">
          <h2 className="font-bold flex items-center gap-2"><Icon name="planet" size={18} className="text-cyan-300" /> Bottom tab bar</h2>
          <button onClick={addTab} className="ghost-btn rounded-full px-3 py-1 text-xs">+ Add tab</button>
        </div>
        <p className="text-sm text-muted mb-3">The native bottom nav on mobile. Mark one tab as the raised centre. Leave the label blank to keep the built-in translated name (home / quests / ranks / you / planets).</p>
        <div className="space-y-2">
          {bottom.map((t, i) => (
            <div key={i} className="rounded-xl border border-white/10 bg-black/20 p-2.5">
              <div className="flex items-center gap-2 mb-2">
                <span className="flex h-8 w-8 items-center justify-center rounded-lg border border-white/10 bg-black/30 shrink-0"><Icon name={t.icon} size={16} className="text-cyan-300" /></span>
                <input value={t.label} onChange={(e) => upTab(i, { label: e.target.value })} placeholder="Label (blank = default)" className="input-cosmic !py-1.5 text-sm flex-1 min-w-0" />
                <button onClick={() => moveTab(i, -1)} disabled={i === 0} className="text-muted disabled:opacity-30 p-1"><Icon name="arrowUp" size={14} /></button>
                <button onClick={() => moveTab(i, 1)} disabled={i === bottom.length - 1} className="text-muted disabled:opacity-30 p-1"><Icon name="arrowDown" size={14} /></button>
                <button onClick={() => rmTab(i)} className="text-rose-300 p-1"><Icon name="x" size={15} /></button>
              </div>
              <div className="grid grid-cols-2 gap-2">
                <input value={t.icon} onChange={(e) => upTab(i, { icon: e.target.value })} placeholder="icon" className="input-cosmic !py-1.5 text-sm" />
                <input value={t.href} onChange={(e) => upTab(i, { href: e.target.value })} placeholder="/link" className="input-cosmic !py-1.5 text-sm" />
              </div>
              <div className="flex items-center gap-4 mt-2 text-xs">
                <label className="inline-flex items-center gap-1.5 cursor-pointer"><input type="radio" name="center" checked={!!t.center} onChange={() => setCenter(i)} className="accent-cyan-400" /> Raised centre</label>
                <label className="inline-flex items-center gap-1.5 cursor-pointer"><input type="checkbox" checked={t.enabled !== false} onChange={(e) => upTab(i, { enabled: e.target.checked })} className="accent-violet-500" /> Shown</label>
              </div>
            </div>
          ))}
        </div>
        <p className="text-[11px] text-muted mt-2">Common icons: {ICON_HINTS.join(", ")}</p>
      </section>

      {/* Side drawer extra links */}
      <section className="glass p-5">
        <div className="flex items-center justify-between mb-1">
          <h2 className="font-bold flex items-center gap-2"><Icon name="menu" size={18} className="text-cyan-300" /> Side drawer — extra links</h2>
          <button onClick={addLink} className="ghost-btn rounded-full px-3 py-1 text-xs">+ Add link</button>
        </div>
        <p className="text-sm text-muted mb-3">Appended to the burger menu after the game planets (which come from your nav games automatically).</p>
        <div className="space-y-2">
          {drawer.length === 0 && <div className="text-sm text-muted">No extra links yet.</div>}
          {drawer.map((l, i) => (
            <div key={i} className="flex items-center gap-2 rounded-xl border border-white/10 bg-black/20 p-2.5">
              <span className="flex h-8 w-8 items-center justify-center rounded-lg border border-white/10 bg-black/30 shrink-0"><Icon name={l.icon} size={16} className="text-cyan-300" /></span>
              <input value={l.label} onChange={(e) => upLink(i, { label: e.target.value })} placeholder="Label" className="input-cosmic !py-1.5 text-sm flex-1 min-w-0" />
              <input value={l.icon} onChange={(e) => upLink(i, { icon: e.target.value })} placeholder="icon" className="input-cosmic !py-1.5 text-sm w-24" />
              <input value={l.href} onChange={(e) => upLink(i, { href: e.target.value })} placeholder="/link" className="input-cosmic !py-1.5 text-sm w-28" />
              <button onClick={() => rmLink(i)} className="text-rose-300 p-1"><Icon name="x" size={15} /></button>
            </div>
          ))}
        </div>
      </section>

      <div className="flex items-center gap-3">
        <button onClick={save} disabled={pending} className="glow-btn pressable rounded-full px-8 py-2.5 font-semibold text-white disabled:opacity-60">
          {pending ? "Saving…" : saved ? "Saved ✓" : "Save mobile chrome"}
        </button>
        <button onClick={() => { setBottom(defaultBottomTabs(true)); setDrawer([]); }} className="ghost-btn rounded-full px-5 py-2.5 text-sm">Reset to defaults</button>
      </div>
    </div>
  );
}
