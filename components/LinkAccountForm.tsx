"use client";

import { useActionState, useState } from "react";
import { linkGameAccount } from "@/app/actions/connections";
import Icon from "@/components/Icon";
import GameLogo from "@/components/GameLogo";
import BrandGlyph from "@/components/BrandGlyph";
import MlbbLinkForm from "@/components/MlbbLinkForm";

export type ProviderInfo = {
  id: string;
  name: string;
  game: string;
  glyph: string;
  live: boolean;
  oauth?: boolean;
  identifierLabel: string;
  identifierHint?: string;
  needsRegion?: boolean;
  envVars: string[];
  legalFlag?: string;
  linkFlow?: "vc";
};

const RIOT_REGIONS = ["euw", "na", "eune", "kr", "br", "jp", "lan", "las", "oce", "tr", "ru", "me"];

export default function LinkAccountForm({
  providers, gameLogos = {}, gameCovers = {}, linked = [], next = "/profile",
}: {
  providers: ProviderInfo[];
  gameLogos?: Record<string, string | null>;
  gameCovers?: Record<string, string | null>;
  /** Providers the gamer already connected (shown as an "already linked" strip). */
  linked?: { provider: string; name: string }[];
  /** Where to return after an OAuth link flow. */
  next?: string;
}) {
  const [selected, setSelected] = useState<ProviderInfo | null>(null);
  const [state, action, pending] = useActionState(linkGameAccount, undefined);
  const linkedByProvider = new Set(linked.map((l) => l.provider));

  return (
    <div>
      {/* Existing connected accounts — always visible while connecting */}
      {linked.length > 0 && (
        <div className="mb-4 rounded-xl border border-emerald-400/20 bg-emerald-500/5 p-3">
          <div className="text-[10px] uppercase tracking-widest text-emerald-300/90 mb-2 inline-flex items-center gap-1.5">
            <Icon name="check" size={12} /> Already connected
          </div>
          <div className="flex flex-wrap gap-2">
            {linked.map((l, i) => (
              <span key={`${l.provider}-${i}`} className="inline-flex items-center gap-1.5 rounded-full bg-black/30 border border-white/10 px-2.5 py-1 text-xs">
                <GameLogo logoUrl={gameLogos[l.provider] ?? null} name={l.name} size={16} rounded="rounded" /> {l.name}
              </span>
            ))}
          </div>
        </div>
      )}

      <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3">
        {providers.map((p) => {
          const cover = gameCovers[p.id];
          const isLinked = linkedByProvider.has(p.id);
          const actionable = p.oauth || p.live;
          return (
            <button
              key={p.id}
              type="button"
              onClick={() => setSelected(p)}
              className={`relative overflow-hidden rounded-xl border p-3 text-left transition-colors ${selected?.id === p.id ? "border-cyan-400/70" : "border-violet-400/20 hover:border-violet-400/50"}`}
            >
              {cover && (
                <span aria-hidden className="absolute inset-0 bg-cover bg-center opacity-30" style={{ backgroundImage: `url(${cover})` }} />
              )}
              <span aria-hidden className="absolute inset-0" style={{ background: cover ? "linear-gradient(180deg, rgba(10,10,28,0.55), rgba(10,10,28,0.8))" : "rgba(255,255,255,0.02)" }} />
              <span className="relative flex items-center gap-2.5">
                <GameLogo logoUrl={gameLogos[p.id] ?? null} name={p.game || p.name} size={34} rounded="rounded-lg" />
                <span className="min-w-0">
                  <span className="block text-sm font-semibold truncate">{p.name}</span>
                  <span className={`block text-[10px] uppercase tracking-wider ${isLinked ? "text-emerald-300" : p.oauth ? "text-cyan-300" : p.live ? "text-emerald-300" : "text-amber-300/80"}`}>
                    {isLinked ? "✓ Linked" : p.oauth ? "OAuth" : p.live ? "Live" : "Needs key"}
                  </span>
                </span>
              </span>
              {!actionable && <span className="absolute inset-0 bg-black/20" />}
            </button>
          );
        })}
      </div>

      {selected && (
        <div className="glass mt-5 p-5 space-y-3">
          <div className="font-semibold flex items-center gap-2">
            <Icon name="link" size={16} className="text-cyan-300" /> Link {selected.name}
          </div>
          {selected.legalFlag && (
            <p className="text-xs text-rose-300/90 border border-rose-400/30 rounded-lg p-2.5 bg-rose-500/5">
              {selected.legalFlag}
            </p>
          )}
          {selected.oauth ? (
            <>
              <p className="text-sm text-muted">Connect your {selected.name} account securely — you&apos;ll be redirected to {selected.name} and back.</p>
              <a href={`/api/auth/${selected.id}?intent=link&next=${encodeURIComponent(next)}`}
                className="glow-btn pressable inline-flex items-center gap-2 rounded-full px-6 py-2 text-sm font-semibold text-white">
                <BrandGlyph provider={selected.id} size={16} /> Connect {selected.name}
              </a>
            </>
          ) : selected.linkFlow === "vc" ? (
            <MlbbLinkForm live={selected.live} />
          ) : selected.live ? (
            <form action={action} className="space-y-3">
              <input type="hidden" name="provider" value={selected.id} />
              <label className="block text-sm text-muted">{selected.identifierLabel}</label>
              <input
                name="identifier"
                required
                placeholder={selected.identifierHint ?? selected.identifierLabel}
                className="input-cosmic"
              />
              {selected.needsRegion && (
                <select name="region" className="input-cosmic" defaultValue="euw">
                  {RIOT_REGIONS.map((r) => <option key={r} value={r}>{r.toUpperCase()}</option>)}
                </select>
              )}
              {state?.error && <p className="text-sm text-rose-300">{state.error}</p>}
              {state?.ok && <p className="text-sm text-emerald-300">Linked! First sync completed.</p>}
              <button disabled={pending} className="glow-btn rounded-full px-6 py-2 text-sm font-semibold text-white">
                {pending ? "Verifying with API…" : "Verify & link"}
              </button>
            </form>
          ) : (
            <p className="text-sm text-muted">
              This provider activates when the platform admin sets{" "}
              <code className="text-cyan-300">{selected.envVars.join(" + ") || "its API keys"}</code>. The
              adapter is already wired — no code changes needed.
            </p>
          )}
        </div>
      )}
    </div>
  );
}
