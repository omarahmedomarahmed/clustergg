"use client";

import { useState } from "react";
import PlanetExplorer from "@/components/PlanetExplorer";
import { type PlanetData } from "@/components/PlanetHero";
import QuestMapHero from "@/components/QuestMapHero";
import HeroModeToggle from "@/components/HeroModeToggle";
import type { QuestHeroData } from "@/lib/quest-hero";
import type { PlanetExplore } from "@/lib/planet-explore";

// The interactive hero used on the homepage AND every planet page. Defaults to
// the planet globe explorer (leaderboards left, challenges + players right,
// click-anything-opens-in-the-middle); a toggle rendered INSIDE the hero swaps
// to the primary quest's treasure map in place. `swap` controls whether planet
// logos navigate (planet pages) or switch in place (home). `explore` is the
// server-rendered explorer data for the initial planet (planet page); when null
// the explorer lazy-loads it from the API (home/feed).
export default function HeroStage({
  planets, initialSlug, heading, quest, swap = true, explore = null,
}: {
  planets: PlanetData[];
  initialSlug: string;
  heading?: string;
  quest: QuestHeroData | null;
  swap?: boolean;
  explore?: PlanetExplore | null;
}) {
  const [mode, setMode] = useState<"planet" | "quest">("planet");

  const planetThumb = planets[0]?.imageUrl ?? null;
  const questThumb = quest?.quest.mapArtUrl || quest?.quest.cardBgUrl || null;
  const toggle = quest
    ? <HeroModeToggle mode={mode} setMode={setMode} planetThumb={planetThumb} questThumb={questThumb} />
    : null;

  return mode === "planet" || !quest
    ? <PlanetExplorer planets={planets} initialSlug={initialSlug} initial={explore} swap={swap} heading={heading} toggle={toggle} />
    : <QuestMapHero quest={quest.quest} tierHolders={quest.tierHolders} tabs={quest.tabs} toggle={toggle} variants={quest.variants} totalCp={quest.totalCp} />;
}
