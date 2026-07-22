"use client";

import { useState, useTransition } from "react";
import dynamic from "next/dynamic";
import { saveQuestMapGlbCfg } from "@/app/actions/quests-admin";
import { DEFAULT_MAP_GLB_CFG, type MapGlbCfg } from "@/lib/quest-game";

const GlbTerrain = dynamic(() => import("@/components/GlbTerrain"), { ssr: false });

// Live 3D terrain texture-mapping editor. The viewer updates in real time as the
// admin drags the sliders, so the flat map art can be lined up onto the 3D rock
// to perfection, then saved. Uses "planar" (top-down drape) by default so
// features land in the right place; unlit so it's never dark.
export default function QuestMap3dEditor({
  questId, glbUrl, artUrl, accent, initial,
}: { questId: string; glbUrl: string; artUrl: string | null; accent: string; initial: MapGlbCfg | null }) {
  const [cfg, setCfg] = useState<Required<MapGlbCfg>>({ ...DEFAULT_MAP_GLB_CFG, ...(initial ?? {}) });
  const [pending, start] = useTransition();
  const [saved, setSaved] = useState(false);
  const up = (patch: Partial<MapGlbCfg>) => setCfg((c) => ({ ...c, ...patch }));

  const save = () => start(async () => { await saveQuestMapGlbCfg(questId, cfg); setSaved(true); setTimeout(() => setSaved(false), 2500); });

  // Plain render function (NOT a nested component) so dragging a slider doesn't
  // remount the input and lose the drag.
  const slider = (label: string, k: keyof MapGlbCfg, min: number, max: number, step: number) => (
    <label key={k as string} className="block text-[11px] text-muted">
      {label}: <b className="text-ink">{Number(cfg[k]).toFixed(2)}</b>
      <input type="range" min={min} max={max} step={step} value={Number(cfg[k])}
        onChange={(e) => up({ [k]: Number(e.target.value) } as Partial<MapGlbCfg>)} className="w-full accent-cyan-400" />
    </label>
  );

  return (
    <div className="grid md:grid-cols-[1fr_260px] gap-4">
      {/* Live preview */}
      <div className="relative rounded-2xl overflow-hidden border border-violet-400/20 bg-[#04051a] min-h-[280px]" style={{ aspectRatio: "4 / 3" }}>
        <GlbTerrain url={glbUrl} textureUrl={artUrl} accent={accent} cfg={cfg} />
        <span className="absolute bottom-2 left-2 text-[10px] text-muted bg-black/50 rounded px-2 py-0.5">Drag to orbit · live preview</span>
      </div>

      {/* Controls */}
      <div className="space-y-2.5">
        <label className="block text-[11px] text-muted">Projection
          <select value={cfg.projection} onChange={(e) => up({ projection: e.target.value as "planar" | "uv" })} className="input-cosmic mt-1 w-full !py-1.5 text-sm">
            <option value="planar">Planar (drape art top-down)</option>
            <option value="uv">Use mesh&apos;s baked UVs</option>
          </select>
        </label>
        {slider("Offset X", "offsetX", -1, 1, 0.01)}
        {slider("Offset Y", "offsetY", -1, 1, 0.01)}
        {slider("Scale X", "scaleX", 0.2, 4, 0.01)}
        {slider("Scale Y", "scaleY", 0.2, 4, 0.01)}
        {slider("Texture rotation°", "rotation", -180, 180, 1)}
        {slider("Brightness", "brightness", 0.4, 2.5, 0.05)}
        <div className="flex flex-wrap gap-3 text-[11px]">
          <label className="inline-flex items-center gap-1.5 cursor-pointer"><input type="checkbox" checked={cfg.flipX} onChange={(e) => up({ flipX: e.target.checked })} className="accent-cyan-400" /> Flip X</label>
          <label className="inline-flex items-center gap-1.5 cursor-pointer"><input type="checkbox" checked={cfg.flipY} onChange={(e) => up({ flipY: e.target.checked })} className="accent-cyan-400" /> Flip Y</label>
          <label className="inline-flex items-center gap-1.5 cursor-pointer"><input type="checkbox" checked={cfg.autoRotate} onChange={(e) => up({ autoRotate: e.target.checked })} className="accent-violet-500" /> Auto-spin</label>
        </div>
        {!cfg.autoRotate && slider("Model yaw°", "yaw", -180, 180, 1)}
        <div className="flex items-center gap-2 pt-1">
          <button onClick={save} disabled={pending} className="glow-btn pressable rounded-full px-5 py-2 text-sm font-semibold text-white disabled:opacity-60">
            {pending ? "Saving…" : saved ? "Saved ✓" : "Save 3D mapping"}
          </button>
          <button onClick={() => setCfg({ ...DEFAULT_MAP_GLB_CFG })} className="ghost-btn rounded-full px-4 py-2 text-xs">Reset</button>
        </div>
      </div>
    </div>
  );
}
