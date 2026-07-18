"use client";

import Icon from "@/components/Icon";

// The glorified planet⇄quest toggle that lives INSIDE the hero (rendered by
// PlanetHero / QuestMapHero). Two thumbnail cards; the active one is lit.
export default function HeroModeToggle({
  mode, setMode, planetThumb, questThumb,
}: {
  mode: "planet" | "quest";
  setMode: (m: "planet" | "quest") => void;
  planetThumb: string | null;
  questThumb: string | null;
}) {
  return (
    <div className="flex justify-center">
      <div className="inline-flex gap-1.5 rounded-2xl border border-white/10 bg-black/40 p-1.5 backdrop-blur-md">
        <button onClick={() => setMode("planet")}
          className={`group flex items-center gap-2 rounded-xl pr-3.5 pl-1.5 py-1.5 transition-all ${mode === "planet" ? "bg-gradient-to-r from-violet-500/30 to-cyan-500/30 ring-1 ring-cyan-400/50" : "opacity-60 hover:opacity-100"}`}>
          <span className="h-8 w-8 shrink-0 overflow-hidden rounded-lg ring-1 ring-white/10 bg-black/40">
            {planetThumb
              ? /* eslint-disable-next-line @next/next/no-img-element */ <img src={planetThumb} alt="" className="h-full w-full object-cover" />
              : <span className="flex h-full w-full items-center justify-center"><Icon name="planet" size={15} className="text-cyan-300" /></span>}
          </span>
          <span className="text-xs font-bold">Game planets</span>
        </button>
        <button onClick={() => setMode("quest")}
          className={`group flex items-center gap-2 rounded-xl pr-3.5 pl-1.5 py-1.5 transition-all ${mode === "quest" ? "bg-gradient-to-r from-amber-500/30 to-fuchsia-500/30 ring-1 ring-amber-400/50" : "opacity-60 hover:opacity-100"}`}>
          <span className="h-8 w-8 shrink-0 overflow-hidden rounded-lg ring-1 ring-white/10 bg-black/40">
            {questThumb
              ? /* eslint-disable-next-line @next/next/no-img-element */ <img src={questThumb} alt="" className="h-full w-full object-cover" />
              : <span className="flex h-full w-full items-center justify-center"><Icon name="pin" size={15} className="text-amber-300" /></span>}
          </span>
          <span className="text-xs font-bold">Quest maps</span>
        </button>
      </div>
    </div>
  );
}
