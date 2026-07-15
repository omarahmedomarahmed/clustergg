"use client";

import { useState } from "react";
import Link from "next/link";
import Icon from "@/components/Icon";
import GameLogo from "@/components/GameLogo";
import BrandGlyph from "@/components/BrandGlyph";
import LinkAccountForm, { type ProviderInfo } from "@/components/LinkAccountForm";

export type AccountCard = {
  id: string;
  tag: string;
  providerName: string;
  gameName: string;
  verified: boolean;
  logoUrl: string | null;
  coverUrl: string | null;
  avatar: string | null;
  stats: { label: string; value: string }[];
  standings: { rank: number; total: number; label: string; game: string; metricKey: string }[];
};

export type ThemeColors = {
  accent: string; accent2: string; text: string; muted: string; panel: string; radius: number;
};

// Connected-game accounts on a gamer's profile: a big row of game logos, then
// collapsed cards (logo + tag) that expand to full stats over the game's cover
// art. On your own profile, "Connect a game" opens the picker inline.
export default function ProfileAccounts({
  accounts, colors, isOwner, providers, gameLogos,
}: {
  accounts: AccountCard[];
  colors: ThemeColors;
  isOwner: boolean;
  providers: ProviderInfo[];
  gameLogos: Record<string, string | null>;
}) {
  const [open, setOpen] = useState<string | null>(accounts.length === 1 ? accounts[0].id : null);
  const [connect, setConnect] = useState(false);
  const c = colors;
  const mix = (pct: number) => `color-mix(in srgb, ${c.accent} ${pct}%, transparent)`;

  return (
    <section>
      <div className="flex items-center justify-between mb-3 gap-3">
        <h2 className="text-lg font-bold flex items-center gap-2" style={{ color: c.text }}>
          <Icon name="gamepad" size={19} style={{ color: c.accent }} /> Connected games
        </h2>
        {isOwner && (
          <button onClick={() => setConnect((v) => !v)} className="text-xs rounded-full px-3 py-1.5 inline-flex items-center gap-1.5"
            style={{ border: `1px solid ${mix(40)}`, color: c.accent }}>
            <Icon name={connect ? "x" : "link"} size={12} /> {connect ? "Close" : "Connect a game"}
          </button>
        )}
      </div>

      {/* Inline connect (own profile) */}
      {isOwner && connect && (
        <div className="mb-5 rounded-2xl p-4" style={{ background: mix(8), border: `1px solid ${mix(25)}` }}>
          {/* Discord = your universal identity — always first. */}
          <div className="text-sm font-semibold mb-2" style={{ color: c.text }}>Your identity</div>
          <a href="/api/auth/discord?intent=link&next=/profile"
            className="inline-flex items-center gap-2 rounded-full px-4 py-2 text-sm font-semibold text-white mb-4"
            style={{ background: "#5865f2", boxShadow: "0 6px 18px -8px #5865f2" }}>
            <BrandGlyph provider="discord" size={16} /> Connect Discord
          </a>
          <div className="text-sm font-semibold mb-3" style={{ color: c.text }}>Pick a game to connect</div>
          <LinkAccountForm providers={providers} gameLogos={gameLogos} />
        </div>
      )}

      {accounts.length === 0 ? (
        <div className="rounded-2xl p-6 text-center text-sm" style={{ background: mix(6), color: c.muted }}>
          {isOwner ? "No games connected yet — connect your first above." : "No games connected yet."}
        </div>
      ) : (
        <>
          {/* Big logo row */}
          <div className="flex flex-wrap gap-3 mb-4">
            {accounts.map((a) => {
              const active = open === a.id;
              return (
                <button key={a.id} onClick={() => setOpen(active ? null : a.id)} title={`${a.tag} · ${a.providerName}`}
                  className="group relative rounded-2xl transition-transform hover:scale-105"
                  style={{ outline: active ? `2px solid ${c.accent}` : "none", outlineOffset: 2 }}>
                  <GameLogo logoUrl={a.logoUrl} name={a.gameName || a.providerName} size={60} rounded="rounded-2xl" />
                  <span className="absolute -bottom-1 left-1/2 -translate-x-1/2 whitespace-nowrap rounded-full px-2 py-0.5 text-[10px] font-semibold opacity-0 group-hover:opacity-100 transition-opacity"
                    style={{ background: "#000c", color: "#fff" }}>{a.tag}{a.stats[0] ? ` · ${a.stats[0].value}` : ""}</span>
                </button>
              );
            })}
          </div>

          {/* Cards */}
          <div className="space-y-3">
            {accounts.map((a) => {
              const active = open === a.id;
              return (
                <div key={a.id} className="rounded-2xl overflow-hidden relative" style={{ border: `1px solid ${mix(20)}` }}>
                  {active && a.coverUrl && (
                    <div className="absolute inset-0 bg-cover bg-center" style={{ backgroundImage: `linear-gradient(rgba(3,4,15,0.82), rgba(3,4,15,0.9)), url(${a.coverUrl})` }} />
                  )}
                  {!active && <div className="absolute inset-0" style={{ background: mix(6) }} />}
                  <button onClick={() => setOpen(active ? null : a.id)} className="relative w-full flex items-center gap-3 p-3.5 text-left">
                    {a.avatar ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={a.avatar} alt="" className="h-11 w-11 rounded-xl object-cover border" style={{ borderColor: mix(40) }} />
                    ) : (
                      <GameLogo logoUrl={a.logoUrl} name={a.gameName || a.providerName} size={44} rounded="rounded-xl" />
                    )}
                    <div className="min-w-0 flex-1">
                      <div className="font-bold truncate flex items-center gap-1.5" style={{ color: c.text }}>
                        {a.tag} {a.verified && <span className="text-[11px]" style={{ color: c.accent2 }}>✓</span>}
                      </div>
                      <div className="text-xs" style={{ color: c.muted }}>{a.providerName}</div>
                    </div>
                    <Icon name={active ? "chevronDown" : "chevronRight"} size={16} style={{ color: c.muted }} />
                  </button>

                  {active && (
                    <div className="relative px-3.5 pb-3.5">
                      {a.stats.length > 0 ? (
                        <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                          {a.stats.map((s, i) => (
                            <div key={i} className="rounded-lg px-2.5 py-1.5" style={{ background: "rgba(255,255,255,0.06)" }}>
                              <div className="text-[10px] uppercase tracking-wider truncate" style={{ color: c.muted }}>{s.label}</div>
                              <div className="font-bold" style={{ color: c.accent2 }}>{s.value}</div>
                            </div>
                          ))}
                        </div>
                      ) : (
                        <div className="text-xs" style={{ color: c.muted }}>Stats sync shortly after connecting.</div>
                      )}
                      {a.standings.length > 0 && (
                        <div className="mt-3 flex flex-wrap gap-1.5">
                          {a.standings.map((x) => (
                            <Link key={x.metricKey} href={`/leaderboards/${encodeURIComponent(x.game)}?stat=${x.metricKey}`}
                              className="text-[11px] rounded-full px-2.5 py-1" style={{ border: `1px solid ${mix(35)}`, color: c.accent }}>
                              #{x.rank} of {x.total} · {x.label}
                            </Link>
                          ))}
                        </div>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </>
      )}
    </section>
  );
}
