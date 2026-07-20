"use client";

import { useActionState, useState } from "react";
import { saveHeroLayout } from "@/app/actions/admin";
import { normalizeHeroLayout, newModule, HERO_MODULE_META, entityKindsForGame, type HeroLayout, type HeroModule, type HeroModuleKind } from "@/lib/hero-layout";
import Icon from "@/components/Icon";

type ActionState = { ok?: boolean; error?: string; message?: string } | undefined;

// Dashboard editor for a planet's hero sidebars: add/remove/reorder modules on
// the LEFT and RIGHT of the globe, set how many items each shows, pick the
// metric for a single-leaderboard module, and choose which game-world entities
// (champions / agents / weapons / heroes) a rail shows. Saved per game.
export default function HeroLayoutEditor({
  gameId, game, initial, boards,
}: {
  gameId: string;
  game: string;
  initial: unknown;
  boards: { metricKey: string; title: string }[];
}) {
  const [layout, setLayout] = useState<HeroLayout>(() => normalizeHeroLayout(initial));
  const [state, formAction, pending] = useActionState<ActionState, FormData>(saveHeroLayout.bind(null, gameId), undefined);
  const entityKinds = entityKindsForGame(game);
  const hasChampions = game === "League of Legends";

  // Which module kinds are addable for this game (hide game-specific ones the
  // game can't provide).
  const addable = HERO_MODULE_META.filter((m) => {
    if (m.kind === "champions") return hasChampions;
    if (m.kind === "entities") return entityKinds.length > 0;
    if (m.kind === "board") return boards.length > 0;
    return true;
  });

  const setSide = (side: "left" | "right", mods: HeroModule[]) => setLayout((l) => ({ ...l, [side]: mods }));
  const add = (side: "left" | "right", kind: HeroModuleKind) => setSide(side, [...layout[side], newModule(kind)]);
  const remove = (side: "left" | "right", id: string) => setSide(side, layout[side].filter((m) => m.id !== id));
  const move = (side: "left" | "right", id: string, dir: -1 | 1) => {
    const arr = [...layout[side]]; const i = arr.findIndex((m) => m.id === id); const j = i + dir;
    if (i < 0 || j < 0 || j >= arr.length) return; [arr[i], arr[j]] = [arr[j], arr[i]]; setSide(side, arr);
  };
  const patch = (side: "left" | "right", id: string, p: Partial<HeroModule>) =>
    setSide(side, layout[side].map((m) => (m.id === id ? { ...m, ...p } as HeroModule : m)));

  const Side = ({ side }: { side: "left" | "right" }) => (
    <div className="rounded-xl border border-white/10 p-3">
      <div className="flex items-center justify-between mb-2">
        <div className="text-xs font-bold uppercase tracking-widest text-cyan-200">{side} of the globe</div>
        <div className="flex items-center gap-1">
          <select onChange={(e) => { if (e.target.value) { add(side, e.target.value as HeroModuleKind); e.target.value = ""; } }} defaultValue="" className="rounded-lg border border-white/12 bg-black/40 px-2 py-1 text-[11px]">
            <option value="">+ Add module…</option>
            {addable.map((m) => <option key={m.kind} value={m.kind}>{m.label}</option>)}
          </select>
        </div>
      </div>
      <div className="space-y-2">
        {layout[side].length === 0 && <div className="text-[11px] text-muted py-3 text-center">Empty — add a module above.</div>}
        {layout[side].map((m, i) => {
          const meta = HERO_MODULE_META.find((x) => x.kind === m.kind);
          return (
            <div key={m.id} className="rounded-lg border border-white/10 bg-white/[0.03] p-2">
              <div className="flex items-center gap-2">
                <Icon name={meta?.icon ?? "grid"} size={13} className="text-cyan-300 shrink-0" />
                <span className="text-xs font-semibold flex-1 truncate">{meta?.label ?? m.kind}</span>
                <button type="button" onClick={() => move(side, m.id, -1)} disabled={i === 0} className="text-muted hover:text-ink disabled:opacity-30"><Icon name="arrowUp" size={12} /></button>
                <button type="button" onClick={() => move(side, m.id, 1)} disabled={i === layout[side].length - 1} className="text-muted hover:text-ink disabled:opacity-30"><Icon name="arrowDown" size={12} /></button>
                <button type="button" onClick={() => remove(side, m.id)} className="text-rose-300 hover:text-rose-200"><Icon name="x" size={13} /></button>
              </div>
              {/* per-module config */}
              <div className="mt-1.5 flex flex-wrap items-center gap-2 pl-5">
                {m.kind === "board" && (
                  <select value={m.metricKey} onChange={(e) => patch(side, m.id, { metricKey: e.target.value })} className="rounded border border-white/12 bg-black/40 px-1.5 py-0.5 text-[11px]">
                    <option value="">Pick metric…</option>
                    {boards.map((b) => <option key={b.metricKey} value={b.metricKey}>{b.title.split("·")[1]?.trim() ?? b.title}</option>)}
                  </select>
                )}
                {m.kind === "entities" && (
                  <select value={m.entityKind ?? "all"} onChange={(e) => patch(side, m.id, { entityKind: e.target.value } as Partial<HeroModule>)} className="rounded border border-white/12 bg-black/40 px-1.5 py-0.5 text-[11px]">
                    <option value="all">All</option>
                    {entityKinds.map((k) => <option key={k} value={k}>{k}</option>)}
                  </select>
                )}
                {meta?.hasLimit && (
                  <label className="text-[10px] text-muted flex items-center gap-1">show
                    <input type="number" min={1} max={40} value={(m as { limit?: number }).limit ?? 10} onChange={(e) => patch(side, m.id, { limit: Math.max(1, Math.min(40, Number(e.target.value))) } as Partial<HeroModule>)} className="w-14 rounded border border-white/12 bg-black/40 px-1 py-0.5 text-[11px]" />
                  </label>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );

  return (
    <form action={formAction} className="space-y-3">
      <p className="text-xs text-muted">Choose what shows on each side of the globe, in what order, and how many. Modules with no data auto-hide on the live planet. Entity rails (champions/agents/weapons) show as art tiles that open a lore card in the middle.</p>
      <div className="grid md:grid-cols-2 gap-3">
        <Side side="left" />
        <Side side="right" />
      </div>
      <input type="hidden" name="layout" value={JSON.stringify(layout)} />
      <div className="flex items-center gap-3">
        <button disabled={pending} className="glow-btn pressable rounded-full px-5 py-2 text-sm font-semibold text-white inline-flex items-center gap-1.5 disabled:opacity-50">
          <Icon name="grid" size={14} /> {pending ? "Saving…" : "Save hero layout"}
        </button>
        {state?.ok && <span className="text-xs text-emerald-300">✓ {state.message}</span>}
        {state?.error && <span className="text-xs text-rose-300">{state.error}</span>}
      </div>
    </form>
  );
}
