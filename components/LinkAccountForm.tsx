"use client";

import { useActionState, useState } from "react";
import { linkGameAccount } from "@/app/actions/connections";
import Icon from "@/components/Icon";
import MlbbLinkForm from "@/components/MlbbLinkForm";

export type ProviderInfo = {
  id: string;
  name: string;
  game: string;
  glyph: string;
  live: boolean;
  identifierLabel: string;
  identifierHint?: string;
  needsRegion?: boolean;
  envVars: string[];
  legalFlag?: string;
  linkFlow?: "vc";
};

const RIOT_REGIONS = ["euw", "na", "eune", "kr", "br", "jp", "lan", "las", "oce", "tr", "ru", "me"];

export default function LinkAccountForm({ providers }: { providers: ProviderInfo[] }) {
  const [selected, setSelected] = useState<ProviderInfo | null>(null);
  const [state, action, pending] = useActionState(linkGameAccount, undefined);

  return (
    <div>
      <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3">
        {providers.map((p) => (
          <button
            key={p.id}
            type="button"
            onClick={() => setSelected(p)}
            className={`glass glass-hover p-3 text-left ${selected?.id === p.id ? "!border-cyan-400/70" : ""} ${!p.live ? "opacity-55" : ""}`}
          >
            <div className="flex items-center gap-2">
              <span className="flex h-8 w-8 items-center justify-center rounded-lg border border-violet-400/25 bg-violet-600/15 shrink-0"><Icon name="gamepad" size={15} className="text-violet-200" /></span>
              <div className="min-w-0">
                <div className="text-sm font-semibold truncate">{p.name}</div>
                <div className={`text-[10px] uppercase tracking-wider ${p.live ? "text-emerald-300" : "text-amber-300/80"}`}>
                  {p.live ? "Live" : "Needs key"}
                </div>
              </div>
            </div>
          </button>
        ))}
      </div>

      {selected && (
        // NOTE: this is a <div>, not a <form>. The VC (Mobile Legends) path
        // renders its own nested forms, and a form-in-form is invalid HTML that
        // throws "A React form was unexpectedly submitted". Only the generic
        // identifier path below gets its own <form>.
        <div className="glass mt-5 p-5 space-y-3">
          <div className="font-semibold flex items-center gap-2">
            <Icon name="link" size={16} className="text-cyan-300" /> Link {selected.name}
          </div>
          {selected.legalFlag && (
            <p className="text-xs text-rose-300/90 border border-rose-400/30 rounded-lg p-2.5 bg-rose-500/5">
              {selected.legalFlag}
            </p>
          )}
          {selected.linkFlow === "vc" ? (
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
              <code className="text-cyan-300">{selected.envVars.join(" + ")}</code>. The
              adapter is already wired — no code changes needed.
            </p>
          )}
        </div>
      )}
    </div>
  );
}
