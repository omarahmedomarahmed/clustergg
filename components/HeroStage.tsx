"use client";

import { useState } from "react";
import PlanetHero, { type PlanetData } from "@/components/PlanetHero";
import QuestMapHero from "@/components/QuestMapHero";
import HeroModeToggle from "@/components/HeroModeToggle";
import type { QuestHeroData } from "@/lib/quest-hero";

// The interactive hero used on the homepage AND every planet page. Defaults to
// the planet globe; a toggle rendered INSIDE the hero swaps to the primary
// quest's treasure map in place. `swap` controls whether planet logos navigate
// (planet pages) or switch in place (home).
export default function HeroStage({
  planets, initialSlug, heading, quest, swap = true,
}: {
  planets: PlanetData[];
  initialSlug: string;
  heading?: string;
  quest: QuestHeroData | null;
  swap?: boolean;
}) {
  const [mode, setMode] = useState<"planet" | "quest">("planet");

  const planetThumb = planets[0]?.imageUrl ?? null;
  const questThumb = quest?.quest.mapArtUrl || quest?.quest.cardBgUrl || null;
  const toggle = quest
    ? <HeroModeToggle mode={mode} setMode={setMode} planetThumb={planetThumb} questThumb={questThumb} />
    : null;

  return mode === "planet" || !quest
    ? <PlanetHero planets={planets} initialSlug={initialSlug} swap={swap} heading={heading} toggle={toggle} />
    : <QuestMapHero quest={quest.quest} tierHolders={quest.tierHolders} tabs={quest.tabs} toggle={toggle} variants={quest.variants} totalCp={quest.totalCp} />;
}
