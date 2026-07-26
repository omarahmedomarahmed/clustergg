"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import BrandGlyph from "@/components/BrandGlyph";

// "Add ClusterBot to your server", on every page.
//
// It's an orb rather than a nav item because the nav already carries an add
// button and a sign-in button in Discord's colour, and a third one up there
// would be the fourth thing competing for the same glance. Down here it's
// always reachable and never in the way.
//
// It sits ABOVE the quest orb: the quest orb belongs to a signed-in gamer and
// this one is for whoever owns the server they're in, so they're different
// audiences and stacking them keeps both discoverable.
export default function DiscordOrb({ installUrl, servers, reach, color = "#5865f2", size = 72, icon }: {
  installUrl: string;
  /** Real network numbers — the pitch is stronger with them and dishonest
   *  without, so they're only shown when there's something to show. */
  servers?: number;
  reach?: number;
  color?: string;
  size?: number;
  icon?: string;
}) {
  const [open, setOpen] = useState(false);
  const wrap = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => { if (wrap.current && !wrap.current.contains(e.target as Node)) setOpen(false); };
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") setOpen(false); };
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => { document.removeEventListener("mousedown", onDown); document.removeEventListener("keydown", onKey); };
  }, [open]);

  return (
    <div ref={wrap} className="print:hidden">
      {open && (
        <div className="mb-3 w-[320px] max-w-[calc(100vw-2rem)] rounded-2xl border border-[#5865f2]/40 bg-[#0a0a1c]/95 backdrop-blur-xl p-4 shadow-2xl animate-[fadeIn_.15s_ease]">
          <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-widest text-[#a5b0ff]">
            <BrandGlyph provider="discord" size={15} /> ClusterBot
          </div>
          <p className="text-sm font-semibold mt-2 leading-snug">
            Turn your Discord into a competition.
          </p>
          <p className="text-xs text-muted mt-1.5 leading-relaxed">
            Your members get ranked profiles and live stats from the games they already play, plus challenges
            with real trophies — without leaving your server.
          </p>

          {(servers ?? 0) > 0 && (
            <div className="flex gap-4 mt-3 text-[11px]">
              <span><b className="text-cyan-300">{(servers ?? 0).toLocaleString()}</b> <span className="text-muted">servers</span></span>
              {(reach ?? 0) > 0 && (
                <span><b className="text-cyan-300">{(reach ?? 0).toLocaleString()}</b> <span className="text-muted">gamers reached</span></span>
              )}
            </div>
          )}

          <a
            href={installUrl}
            target="_blank"
            rel="noreferrer"
            className="pressable mt-4 flex w-full items-center justify-center gap-2 rounded-full px-4 py-2.5 text-sm font-bold text-white"
            style={{ background: "#5865f2" }}
          >
            <BrandGlyph provider="discord" size={17} /> Add to your server
          </a>
          <Link
            href="/discord-bot"
            onClick={() => setOpen(false)}
            className="mt-2 block text-center text-xs text-cyan-300 hover:underline"
          >
            See how it works first →
          </Link>
        </div>
      )}

      <button
        onClick={() => setOpen((v) => !v)}
        aria-label="Add ClusterBot to your Discord server"
        aria-expanded={open}
        title="Add ClusterBot to your Discord server"
        className="relative flex items-center justify-center rounded-full text-white transition-transform hover:scale-105 active:scale-95 overflow-hidden"
        style={{
          height: size,
          width: size,
          background: `radial-gradient(circle at 35% 30%, ${color}, ${color}bb 60%, ${color}66)`,
          boxShadow: `0 0 24px -4px ${color}, inset 0 2px 6px rgba(255,255,255,0.25)`,
        }}
      >
        <span className="absolute inset-0 rounded-full animate-ping opacity-20" style={{ background: color }} />
        {icon
          ? /* eslint-disable-next-line @next/next/no-img-element */
            <img src={icon} alt="" className="relative object-contain" style={{ height: size * 0.55, width: size * 0.55 }} />
          : <span className="relative"><BrandGlyph provider="discord" size={Math.round(size * 0.5)} /></span>}
        {/* A + on the glyph, the same distinction the nav button makes: this
            ADDS the bot, it doesn't sign you in. */}
        <span
          className="absolute grid place-items-center rounded-full bg-white text-[#5865f2] font-black leading-none"
          style={{ height: size * 0.3, width: size * 0.3, right: size * 0.1, bottom: size * 0.1, fontSize: size * 0.2 }}
        >
          +
        </span>
      </button>
    </div>
  );
}
