"use client";

import { useState, useTransition } from "react";
import Icon from "@/components/Icon";
import ImageUpload from "@/components/ImageUpload";
import { saveQuestGameUi, saveQuestMissions } from "@/app/actions/quests-admin";
import { DEFAULT_MISSIONS, type MissionConfig, type PanelCfg, type QuestGameUi } from "@/lib/quest-game";

const PANELS: { key: keyof QuestGameUi; label: string; hint: string }[] = [
  { key: "rules", label: "Rules screen", hint: "How-you-earn-CP panel" },
  { key: "log", label: "My log screen", hint: "CP history panel" },
  { key: "guide", label: "Guide screen", hint: "How-to-play panel" },
  { key: "missions", label: "Missions screen", hint: "Starter missions panel" },
  { key: "milestone", label: "Milestone card", hint: "The card shown at each map stop" },
];

// Admin editor for the playable quest game's screens: per-panel title text,
// background art with dark-overlay strength, button color — plus the starter
// missions roster (labels, links, thresholds). Titles and mission labels are
// English; translate them to Arabic in Admin → Language & flags (they render
// through tr(), so any override you add there applies in-game).
export default function QuestGameScreensEditor({
  questId, initialUi, initialMissions,
}: { questId: string; initialUi: QuestGameUi | null; initialMissions: MissionConfig[] | null }) {
  const [ui, setUi] = useState<Record<string, PanelCfg>>({ ...(initialUi ?? {}) } as Record<string, PanelCfg>);
  const [missions, setMissions] = useState<MissionConfig[]>(initialMissions?.length ? initialMissions : DEFAULT_MISSIONS);
  const [pending, start] = useTransition();
  const [saved, setSaved] = useState(false);

  const upPanel = (k: string, patch: Partial<PanelCfg>) => setUi((u) => ({ ...u, [k]: { ...u[k], ...patch } }));
  const upMission = (i: number, patch: Partial<MissionConfig>) => setMissions((a) => a.map((m, j) => (j === i ? { ...m, ...patch } : m)));

  const save = () => start(async () => {
    await Promise.all([saveQuestGameUi(questId, ui), saveQuestMissions(questId, missions)]);
    setSaved(true); setTimeout(() => setSaved(false), 2500);
  });

  return (
    <div className="space-y-5">
      <p className="text-xs text-muted">
        Full control of the in-game screens. Leave a field empty to keep the built-in look (quest colors +
        the global Card-backgrounds art). Titles &amp; mission labels are translatable: add an Arabic override
        for the exact English text in <b>Language &amp; flags</b>.
      </p>

      {/* Per-panel overrides */}
      <div className="grid md:grid-cols-2 gap-3">
        {PANELS.map((p) => {
          const c = ui[p.key as string] ?? {};
          return (
            <div key={p.key as string} className="rounded-xl border border-white/10 bg-black/20 p-3 space-y-2">
              <div className="flex items-center justify-between">
                <div className="text-sm font-bold">{p.label}</div>
                <div className="text-[10px] text-muted">{p.hint}</div>
              </div>
              <input value={c.title ?? ""} onChange={(e) => upPanel(p.key as string, { title: e.target.value })}
                placeholder="Title (blank = default)" className="input-cosmic !py-1.5 text-sm w-full" />
              <ImageUpload value={c.bg ?? ""} onChange={(v) => upPanel(p.key as string, { bg: v })}
                label="Background art" aspect="16/9" scope="quest" previewWidth={100} />
              <label className="block text-[11px] text-muted">
                Dark overlay: <b className="text-ink">{c.dim ?? 62}%</b>
                <input type="range" min={0} max={100} value={c.dim ?? 62}
                  onChange={(e) => upPanel(p.key as string, { dim: Number(e.target.value) })} className="w-full accent-violet-500" />
              </label>
              <div className="flex items-center gap-2">
                <span className="text-[11px] text-muted shrink-0">Button color</span>
                <input value={c.btn ?? ""} onChange={(e) => upPanel(p.key as string, { btn: e.target.value })}
                  placeholder="#8b5cf6 or CSS gradient (blank = quest colors)" className="input-cosmic !py-1 text-xs flex-1" />
                <span className="h-6 w-6 rounded-md border border-white/15 shrink-0" style={{ background: c.btn || "transparent" }} />
              </div>
            </div>
          );
        })}
      </div>

      {/* Starter missions roster */}
      <div className="rounded-xl border border-white/10 bg-black/20 p-3 space-y-2">
        <div className="flex items-center justify-between">
          <div className="text-sm font-bold flex items-center gap-2"><Icon name="rocket" size={14} className="text-cyan-300" /> Starter missions</div>
          <button type="button" onClick={() => setMissions((a) => [...a, { kind: "ads", label: "New mission", href: "/feed", icon: "spark", threshold: 5, enabled: true }])}
            className="ghost-btn rounded-full px-3 py-1 text-xs">+ Add mission</button>
        </div>
        <p className="text-[11px] text-muted">
          The guided red-dot missions in this quest&apos;s game. <b>Kind</b> decides how completion is detected;
          <b> ads</b> uses the threshold (e.g. see 5 ads).
        </p>
        {missions.map((m, i) => (
          <div key={i} className="rounded-lg border border-white/10 bg-black/25 p-2 space-y-1.5">
            <div className="flex flex-wrap items-center gap-2">
              <select value={m.kind} onChange={(e) => upMission(i, { kind: e.target.value as MissionConfig["kind"] })}
                className="input-cosmic !py-1 text-xs w-28">
                <option value="connect">connect</option>
                <option value="planet">planet</option>
                <option value="challenge">challenge</option>
                <option value="ads">ads</option>
              </select>
              <input value={m.label} onChange={(e) => upMission(i, { label: e.target.value })} placeholder="Label"
                className="input-cosmic !py-1 text-xs flex-1 min-w-[140px]" />
              {m.kind === "ads" && (
                <input type="number" min={1} value={m.threshold ?? 5} onChange={(e) => upMission(i, { threshold: Number(e.target.value) })}
                  className="input-cosmic !py-1 text-xs w-16" title="How many ads" />
              )}
              <input value={m.href} onChange={(e) => upMission(i, { href: e.target.value })} placeholder="/link"
                className="input-cosmic !py-1 text-xs w-28" />
              <input value={m.icon} onChange={(e) => upMission(i, { icon: e.target.value })} placeholder="icon"
                className="input-cosmic !py-1 text-xs w-20" />
              <label className="inline-flex items-center gap-1 text-[11px] cursor-pointer">
                <input type="checkbox" checked={m.enabled !== false} onChange={(e) => upMission(i, { enabled: e.target.checked })} className="accent-violet-500" /> on
              </label>
              <button type="button" onClick={() => setMissions((a) => a.filter((_, j) => j !== i))} className="text-rose-300 p-1"><Icon name="x" size={13} /></button>
            </div>
          </div>
        ))}
      </div>

      <div className="flex items-center gap-3">
        <button onClick={save} disabled={pending} className="glow-btn pressable rounded-full px-7 py-2 text-sm font-semibold text-white disabled:opacity-60">
          {pending ? "Saving…" : saved ? "Saved ✓" : "Save game screens"}
        </button>
        <button onClick={() => { setUi({}); setMissions(DEFAULT_MISSIONS); }} className="ghost-btn rounded-full px-4 py-2 text-xs">Reset to defaults</button>
      </div>
    </div>
  );
}
