"use client";

import { useState } from "react";
import Icon from "@/components/Icon";
import GameLogo from "@/components/GameLogo";
import HeroStage from "@/components/HeroStage";
import { type PlanetData } from "@/components/PlanetHero";

// The galaxy, collapsed — and part of the hero rather than a lid on top of it.
//
// The planet explorer is the best thing on the site and it used to be the first
// thing a visitor met: 700px of interactive globe before a single word about
// what Cluster is or who it's for. Wonderful for a gamer who already knows,
// fatal for a brand who doesn't, because the pitch started below the fold.
//
// So it's a band of game logos, collapsed by default, one tap from the full
// explorer. Three rules it has to keep:
//
//  - It shares the hero's background. It is NOT a card sitting above the hero —
//    no glass, no rounded panel, no section of its own. The reader should read
//    it as the top line of the hero, because that is what it is.
//  - Picking a game CHANGES THIS HERO. It used to be a link to that game's
//    planet page, which meant the only way to look at a second game was to
//    leave the page you were being pitched on.
//  - Games only. The quest map is not an alternate hero any more.
//
// The text hero is passed as `children` so both live inside one element and one
// background.

export default function HeroBanner({
  planets, heading, label, note, defaultOpen = false, children,
}: {
  planets: PlanetData[];
  heading?: string;
  label?: string;
  note?: string;
  defaultOpen?: boolean;
  children?: React.ReactNode;
}) {
  const [open, setOpen] = useState(defaultOpen);
  const [slug, setSlug] = useState(planets[0]?.slug ?? "");

  if (planets.length === 0) return <>{children}</>;

  const active = planets.find((p) => p.slug === slug) ?? planets[0];

  return (
    <section className="relative">
      <div className="mx-auto max-w-6xl px-4 pt-5">
        {/* ===== The band =====
            Bordered, not boxed: a hairline under it separates the games from the
            headline without making the games look like a different component. */}
        <div className="flex flex-wrap items-center gap-3 border-b border-white/10 pb-3 sm:flex-nowrap sm:gap-4">
          <div className="min-w-0 flex-1 sm:flex-none sm:shrink-0">
            <div className="text-sm font-bold leading-tight">{label ?? "The Cluster galaxy"}</div>
            <div className="mt-0.5 hidden text-[11px] leading-tight text-muted sm:block">{note}</div>
          </div>

          {/* On a phone the logos take their own full-width row — squeezed
              between a label and a button there was room for two of six games,
              which is a picker that doesn't pick. */}
          <div className="no-scrollbar order-last flex w-full min-w-0 items-center gap-1.5 overflow-x-auto py-0.5 sm:order-none sm:w-auto sm:flex-1 sm:gap-2">
            {planets.map((p) => {
              const on = open && p.slug === active.slug;
              return (
                <button
                  key={p.slug} type="button"
                  onClick={() => { setSlug(p.slug); setOpen(true); }}
                  title={p.name}
                  aria-label={`Show ${p.name} in the hero`}
                  aria-pressed={on}
                  className={`shrink-0 rounded-xl p-1 transition-all ${
                    on ? "bg-cyan-400/10 ring-1 ring-cyan-400/70" : "opacity-75 hover:bg-white/5 hover:opacity-100"
                  }`}
                >
                  <GameLogo logoUrl={p.logoUrl} name={p.name} size={34} rounded="rounded-lg" />
                </button>
              );
            })}
          </div>

          <button
            type="button" onClick={() => setOpen(!open)}
            className="ghost-btn pressable inline-flex shrink-0 items-center gap-1.5 rounded-full px-4 py-2 text-xs"
            aria-expanded={open}
          >
            {open ? "Collapse" : "Explore"}
            <Icon name={open ? "chevronDown" : "chevronRight"} size={13} className={open ? "rotate-180 transition-transform" : "transition-transform"} />
          </button>
        </div>
      </div>

      {/* ===== The explorer =====
          `swap` so the games above the globe change THIS hero instead of
          navigating, and `onPlanetChange` so the band's highlight follows a
          pick made down there. No `key` — remounting would throw away the
          planet data that was just fetched. */}
      {open && (
        <div className="-mx-0 mt-2">
          <HeroStage
            planets={planets}
            initialSlug={active.slug}
            heading={heading}
            swap
            onPlanetChange={setSlug}
          />
        </div>
      )}

      {children}
    </section>
  );
}
