import { liveCard } from "@/lib/marketing-card";

// The bot's own card, in a Discord message, on a marketing page. B109.
//
// A server component, so the URL is resolved once on the server and the browser
// fetches a hosted PNG. No client JavaScript, no loading state, no layout shift
// — and no way for a visitor to trigger a render.
//
// The frame is a Discord message on purpose. A PNG floating on a marketing page
// is a graphic; the same PNG under an avatar, a bot tag and a channel line is
// the thing they will actually see in their server tomorrow. That is the whole
// difference between showing the product and illustrating it.

export default async function LiveBotCard({
  kind,
  caption,
  className = "",
}: {
  kind: string;
  /** The line the bot "says" above the card. Keep it to what the bot really says. */
  caption?: string;
  className?: string;
}) {
  const card = await liveCard(kind);
  // Null is normal, not an error: no Blob configured, an empty database, the
  // daily render ceiling with nothing cached. Rendering nothing is the correct
  // outcome — a broken image on a marketing page is worse than no section.
  if (!card) return null;

  return (
    <div className={`glass overflow-hidden rounded-2xl border border-violet-400/20 ${className}`}>
      <div className="flex items-start gap-3 p-4">
        <div className="mt-0.5 flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-violet-500/20 text-lg">
          🪐
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <span className="font-semibold">Cluster</span>
            <span className="rounded bg-violet-500/25 px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wide text-violet-200">
              Bot
            </span>
          </div>
          {caption && <p className="mt-1 text-sm text-muted">{caption}</p>}
          <div className="mt-3 overflow-hidden rounded-xl border border-white/10">
            {/*
              A plain <img>, not next/image. The source is a Blob URL that
              changes whenever the card's data changes, so the optimizer would
              be re-fetching and re-encoding a PNG that is already the exact
              size it is displayed at — paying twice to make it slower.

              Lazy, because these sit below the fold on every page that uses
              them, and the aspect ratio is fixed so nothing jumps when it
              arrives.
            */}
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={card.url}
              alt={card.alt}
              loading="lazy"
              decoding="async"
              className="block h-auto w-full"
            />
          </div>
        </div>
      </div>
      <p className="border-t border-white/5 bg-black/20 px-4 py-2 text-[11px] text-muted">
        This is a live render, drawn from real data a moment ago — not a screenshot.
      </p>
    </div>
  );
}
