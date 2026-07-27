"use client";

import { useState } from "react";
import Icon from "@/components/Icon";
import GameLogo from "@/components/GameLogo";
import HeroStage from "@/components/HeroStage";
import { type PlanetData } from "@/components/PlanetHero";
import type { QuestHeroData } from "@/lib/quest-hero";

// The galaxy, collapsed.
//
// The planet explorer is the best thing on the site and it used to be the first
// thing a visitor met — 700px of interactive globe before a single word about
// what Cluster is or who it's for. That's wonderful for a gamer who already
// knows and fatal for a brand who doesn't, because the pitch started below the
// fold and most people never got there.
//
// So it becomes a banner: the games in a row, one tap from the full explorer.
// Nothing is removed and nothing is buried — a gamer still reaches the globe in
// one click, and everyone else reads the argument first.
//
// `defaultOpen` is how a signed-in gamer gets the old behaviour back: they're
// here to play, not to be pitched to.

export default function HeroBanner({
  planets, quest, heading, label, note, defaultOpen = false,
}: {
  planets: PlanetData[];
  quest: QuestHeroData | null;
  heading?: string;
  label?: string;
  note?: string;
  defaultOpen?: boolean;
}) {
  const [open, setOpen] = useState(defaultOpen);
  const [slug, setSlug] = useState(planets[0]?.slug ?? "");

  if (planets.length === 0) return null;

  const openWith = (s: string) => { setSlug(s); setOpen(true); };

  return (
    <section className="mx-auto max-w-6xl px-4 pt-5">
      {/* ===== The banner ===== */}
      <div className="glass rounded-3xl px-4 py-3.5 sm:px-6 sm:py-4">
        <div className="flex items-center gap-4 flex-wrap sm:flex-nowrap">
          <div className="min-w-0 shrink-0">
            <div className="text-sm font-bold leading-tight">{label ?? "The Cluster galaxy"}</div>
            <div className="text-[11px] text-muted leading-tight mt-0.5 hidden sm:block">{note}</div>
          </div>

          {/* Logos: the whole point of the collapsed state. Clicking one opens
              the explorer already showing that planet. */}
          <div className="flex items-center gap-1.5 sm:gap-2 flex-1 min-w-0 overflow-x-auto no-scrollbar py-0.5">
            {planets.map((p) => {
              const active = open && p.slug === slug;
              return (
                <button
                  key={p.slug} type="button" onClick={() => (active ? setOpen(false) : openWith(p.slug))}
                  title={p.name}
                  aria-label={`${active ? "Collapse" : "Open"} ${p.name}`}
                  className={`shrink-0 rounded-xl p-1 transition-all ${
                    active
                      ? "ring-1 ring-cyan-400/70 bg-cyan-400/10"
                      : "opacity-75 hover:opacity-100 hover:bg-white/5"
                  }`}
                >
                  <GameLogo logoUrl={p.logoUrl} name={p.name} size={34} rounded="rounded-lg" />
                </button>
              );
            })}
          </div>

          <button
            type="button" onClick={() => setOpen(!open)}
            className="ghost-btn pressable rounded-full px-4 py-2 text-xs shrink-0 inline-flex items-center gap-1.5"
            aria-expanded={open}
          >
            {open ? "Collapse" : "Explore"}
            <Icon name={open ? "chevronDown" : "chevronRight"} size={13} className={open ? "rotate-180 transition-transform" : "transition-transform"} />
          </button>
        </div>
      </div>

      {/* ===== The explorer =====
          Keyed on the slug so opening a different game mounts the stage already
          on that planet — HeroStage reads `initialSlug` once, on mount. */}
      {open && (
        <div className="mt-2 -mx-4 sm:mx-0">
          <HeroStage key={slug} planets={planets} initialSlug={slug} heading={heading} quest={quest} swap={false} />
        </div>
      )}
    </section>
  );
}
