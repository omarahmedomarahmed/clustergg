"use client";

import { useState } from "react";
import Icon from "@/components/Icon";
import PlanetHero, { type PlanetData } from "@/components/PlanetHero";
import QuestMapHero from "@/components/QuestMapHero";
import type { QuestView, QuestGamer } from "@/lib/quests";

export type QuestHeroData = {
  quest: QuestView;
  tierHolders: Record<string, QuestGamer[]>;
  tabs: { key: string; name: string; color: string; logoUrl: string | null; icon: string; mapArtUrl: string | null }[];
};

// The homepage hero. Defaults to the interactive planet globe; a glorified
// toggle card (with a live thumbnail of each) swaps the hero to the quest map
// in place — never leaving the homepage. Quest data is optional so the planet
// hero still stands alone before any quests exist.
export default function HomeHero({
  planets, initialSlug, heading, quest,
}: {
  planets: PlanetData[];
  initialSlug: string;
  heading?: string;
  quest: QuestHeroData | null;
}) {
  const [mode, setMode] = useState<"planet" | "quest">("planet");

  const planetThumb = planets[0]?.imageUrl;
  const questThumb = quest?.quest.mapArtUrl || quest?.quest.cardBgUrl || null;

  return (
    <div>
      {/* Glorified hero toggle — thumbnail cards */}
      {quest && (
        <div className="mx-auto max-w-6xl px-4 pt-5">
          <div className="flex flex-wrap items-center justify-center gap-3">
            <span className="text-[11px] uppercase tracking-widest text-muted hidden sm:inline">Explore the Cluster as</span>
            <div className="inline-flex gap-2 rounded-2xl border border-violet-400/15 bg-black/30 p-1.5">
              {/* Planet globe */}
              <button onClick={() => setMode("planet")}
                className={`group flex items-center gap-2.5 rounded-xl pr-4 pl-1.5 py-1.5 transition-all ${mode === "planet" ? "bg-gradient-to-r from-violet-500/25 to-cyan-500/25 ring-1 ring-cyan-400/40" : "opacity-70 hover:opacity-100"}`}>
                <span className="h-10 w-10 shrink-0 overflow-hidden rounded-lg ring-1 ring-white/10 bg-black/40">
                  {planetThumb
                    ? /* eslint-disable-next-line @next/next/no-img-element */ <img src={planetThumb} alt="" className="h-full w-full object-cover" />
                    : <span className="flex h-full w-full items-center justify-center"><Icon name="planet" size={18} className="text-cyan-300" /></span>}
                </span>
                <span className="text-left leading-tight">
                  <span className="block text-sm font-bold">Game planets</span>
                  <span className="block text-[10px] uppercase tracking-widest text-muted">Interactive globe</span>
                </span>
              </button>
              {/* Quest map */}
              <button onClick={() => setMode("quest")}
                className={`group flex items-center gap-2.5 rounded-xl pr-4 pl-1.5 py-1.5 transition-all ${mode === "quest" ? "bg-gradient-to-r from-amber-500/25 to-fuchsia-500/25 ring-1 ring-amber-400/40" : "opacity-70 hover:opacity-100"}`}>
                <span className="h-10 w-10 shrink-0 overflow-hidden rounded-lg ring-1 ring-white/10 bg-black/40">
                  {questThumb
                    ? /* eslint-disable-next-line @next/next/no-img-element */ <img src={questThumb} alt="" className="h-full w-full object-cover" />
                    : <span className="flex h-full w-full items-center justify-center"><Icon name="pin" size={18} className="text-amber-300" /></span>}
                </span>
                <span className="text-left leading-tight">
                  <span className="block text-sm font-bold">Quest maps</span>
                  <span className="block text-[10px] uppercase tracking-widest text-muted">Chart your climb</span>
                </span>
              </button>
            </div>
          </div>
        </div>
      )}

      {mode === "planet" || !quest ? (
        <PlanetHero planets={planets} initialSlug={initialSlug} swap heading={heading} />
      ) : (
        <QuestMapHero quest={quest.quest} tierHolders={quest.tierHolders} tabs={quest.tabs} />
      )}
    </div>
  );
}
