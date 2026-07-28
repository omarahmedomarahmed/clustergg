import Icon from "@/components/Icon";
import { AD_RATIO } from "@/lib/cards/layout";

// Where a brand actually appears, drawn rather than listed.
//
// "Ad placements across the network" is a phrase; it does not tell a marketing
// director what their creative will look like or where a person's eye will be
// when they see it. So this shows the two surfaces at their real geometry: the
// Discord card with the sponsor box in the corner the renderer puts it in, and
// the website with its banner, rail and inline slots.
//
// The card mock uses the same percentages as `DEFAULT_LAYOUT`, so if the box
// moves in the renderer, this picture is wrong in exactly the way that gets
// noticed and fixed.

export default function PlacementMap({
  discordPlacements, webPlacements, brandName = "Your brand", creativeUrl,
}: {
  discordPlacements: number;
  webPlacements: number;
  brandName?: string;
  /** A real creative when there is one; otherwise the slot is drawn empty. */
  creativeUrl?: string | null;
}) {
  return (
    <div className="grid gap-4 lg:grid-cols-2">
      {/* ===== Inside Discord ===== */}
      <div className="rounded-3xl border border-sky-400/25 bg-sky-500/[0.05] p-5 sm:p-6">
        <div className="flex items-center gap-2 text-[11px] uppercase tracking-[0.2em] text-sky-300">
          <Icon name="discord" size={13} /> Inside Discord
        </div>
        <h3 className="mt-2 text-xl font-bold">On every card the bot draws</h3>
        <p className="mt-1.5 text-sm leading-relaxed text-muted">
          A gamer opens their profile, a leaderboard, a challenge or a game hub — each one is a rendered
          image, and your creative is part of it. {discordPlacements > 0 && `${discordPlacements} Discord placements.`}
        </p>

        <div className="relative mt-5 overflow-hidden rounded-xl border border-white/12 bg-[#04051a]" style={{ aspectRatio: "1200 / 630" }}>
          <div className="absolute inset-x-0 top-0 h-[1.3%] bg-sky-500" />
          {/* The card's own content, abstracted — this is about the slot. */}
          <div className="absolute left-[4.7%] top-[11%] w-[58%] space-y-2">
            <div className="h-3.5 w-3/4 rounded bg-white/25" />
            <div className="h-2 w-1/2 rounded bg-white/12" />
            <div className="mt-3 h-6 rounded-lg bg-white/[0.07]" />
            <div className="h-6 rounded-lg bg-white/[0.07]" />
            <div className="h-6 rounded-lg bg-white/[0.07]" />
          </div>
          {/* The sponsor box, at DEFAULT_LAYOUT's geometry. */}
          <div className="absolute overflow-hidden rounded-md ring-2 ring-violet-400/70" style={{ left: "73.1%", top: "5.1%", width: "24.7%" }}>
            <div className="relative bg-violet-500/25" style={{ aspectRatio: `1 / ${AD_RATIO}` }}>
              {creativeUrl ? (
                /* eslint-disable-next-line @next/next/no-img-element */
                <img src={creativeUrl} alt="" className="absolute inset-0 h-full w-full object-cover" />
              ) : (
                <div className="absolute inset-0 grid place-items-center text-[8px] font-bold text-violet-100">YOUR CREATIVE</div>
              )}
            </div>
            <div className="flex items-center justify-between bg-[#04051a]/90 px-1 py-[1px] text-[6px] tracking-widest text-muted">
              <span>SPONSORED</span><span className="max-w-[60%] truncate font-bold text-ink">{brandName.toUpperCase()}</span>
            </div>
          </div>
          <div className="absolute bottom-[6%] right-[3%] aspect-square h-[16%] rounded-xl bg-white/10" />
        </div>
        <div className="mt-3 flex flex-wrap gap-1.5 text-[11px]">
          {["Profile", "Leaderboard", "Challenge", "Game hub", "Quest", "Profile of the Week"].map((k) => (
            <span key={k} className="rounded-full border border-white/12 px-2.5 py-1 text-muted">{k}</span>
          ))}
        </div>
      </div>

      {/* ===== On the website ===== */}
      <div className="rounded-3xl border border-violet-400/25 bg-violet-500/[0.06] p-5 sm:p-6">
        <div className="flex items-center gap-2 text-[11px] uppercase tracking-[0.2em] text-violet-300">
          <Icon name="globe" size={13} /> On clustergg.com
        </div>
        <h3 className="mt-2 text-xl font-bold">Banner, rail and inline</h3>
        <p className="mt-1.5 text-sm leading-relaxed text-muted">
          The pages gamers land on from a shared profile or a challenge result.
          {webPlacements > 0 && ` ${webPlacements} web placements.`}
        </p>

        <div className="relative mt-5 overflow-hidden rounded-xl border border-white/12 bg-[#04051a] p-2.5" style={{ aspectRatio: "1200 / 630" }}>
          <div className="flex h-full flex-col gap-2">
            <div className="h-[7%] rounded bg-white/[0.07]" />
            <Slot label="Top banner" className="h-[13%]" />
            <div className="flex min-h-0 flex-1 gap-2">
              <div className="flex min-w-0 flex-1 flex-col gap-2">
                <div className="h-[38%] rounded-lg bg-white/[0.05]" />
                <Slot label="Inline" className="h-[16%]" />
                <div className="min-h-0 flex-1 rounded-lg bg-white/[0.05]" />
              </div>
              <Slot label="Rail" className="w-[24%]" vertical />
            </div>
          </div>
        </div>
        <div className="mt-3 flex flex-wrap gap-1.5 text-[11px]">
          {["Home", "Profiles", "Leaderboards", "Challenges", "Feed", "Loading screen"].map((k) => (
            <span key={k} className="rounded-full border border-white/12 px-2.5 py-1 text-muted">{k}</span>
          ))}
        </div>
      </div>
    </div>
  );
}

function Slot({ label, className = "", vertical = false }: { label: string; className?: string; vertical?: boolean }) {
  return (
    <div className={`grid place-items-center rounded-lg border border-violet-400/50 bg-violet-500/15 ${className}`}>
      <span className={`text-[9px] font-bold tracking-widest text-violet-100 ${vertical ? "[writing-mode:vertical-rl]" : ""}`}>
        {label.toUpperCase()}
      </span>
    </div>
  );
}
