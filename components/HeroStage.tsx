"use client";

import PlanetExplorer from "@/components/PlanetExplorer";
import { type PlanetData } from "@/components/PlanetHero";
import type { PlanetExplore } from "@/lib/planet-explore";

// The interactive hero used on the homepage AND every planet page: the game's
// planet globe, with leaderboards left, challenges and players right, and
// anything clicked opening in the middle.
//
// It used to carry a toggle that swapped the whole hero for the primary quest's
// treasure map. That's gone. A hero has one job — say what this place is — and
// a control that replaces it with a different subject makes the first thing a
// visitor sees depend on a button they haven't pressed yet. Quests still have
// their own pages and their own map; they are no longer an alternate hero.
//
// `swap` controls whether the game buttons NAVIGATE to that planet's page
// (planet pages, where you're already on one) or change this hero in place
// (home and feed, where leaving is the wrong response to picking a game).
// `explore` is server-rendered data for the initial planet; when null the
// explorer lazy-loads it from the API.
export default function HeroStage({
  planets, initialSlug, heading, swap = true, explore = null, compact = false, onPlanetChange,
}: {
  planets: PlanetData[];
  initialSlug: string;
  heading?: string;
  swap?: boolean;
  explore?: PlanetExplore | null;
  compact?: boolean;
  onPlanetChange?: (slug: string) => void;
}) {
  return (
    <PlanetExplorer
      planets={planets}
      initialSlug={initialSlug}
      initial={explore}
      swap={swap}
      heading={heading}
      compact={compact}
      onPlanetChange={onPlanetChange}
    />
  );
}
