"use client";

import { useActionState, useState } from "react";
import { broadcastAd, broadcast, type BotActionState } from "@/app/actions/discord";

export type Creative = {
  campaignCreativeId: string;
  fileUrl: string;
  brandName: string;
  campaignName: string;
  placement: string | null;
};

export type ServerOption = { guildId: string; name: string; unlocked: boolean; adOptIn: boolean };

// Sending an ad by hand.
//
// The cron picks by rotation and waits out the interval. This is the other
// case — a brand asked for this creative, in these servers, now — so the
// creative is picked by looking at it, and both guards can be overridden
// deliberately rather than by accident.
export function AdBroadcast({ creatives, servers }: { creatives: Creative[]; servers: ServerOption[] }) {
  const [state, act, busy] = useActionState<BotActionState, FormData>(broadcastAd, undefined);
  const [picked, setPicked] = useState<string>("");
  const [all, setAll] = useState(true);

  const eligible = servers.filter((s) => s.unlocked && s.adOptIn);

  return (
    <form action={act} className="space-y-5">
      <div>
        <div className="text-[11px] uppercase tracking-widest text-muted mb-2">Pick a creative</div>
        {creatives.length === 0 ? (
          <p className="text-sm text-muted">
            No creatives yet. Add one under Ads → Creatives and attach it to a campaign placement.
          </p>
        ) : (
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {creatives.map((c) => {
              const on = picked === c.campaignCreativeId;
              return (
                <button
                  key={c.campaignCreativeId}
                  type="button"
                  onClick={() => setPicked(on ? "" : c.campaignCreativeId)}
                  className={`text-left rounded-2xl border overflow-hidden transition ${
                    on ? "border-cyan-400/70 ring-1 ring-cyan-400/40" : "border-white/10 hover:border-white/25"
                  }`}
                >
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={c.fileUrl} alt="" className="w-full h-28 object-cover bg-black/40" />
                  <div className="p-3">
                    <div className="font-semibold text-sm truncate">{c.brandName}</div>
                    <div className="text-[11px] text-muted truncate">
                      {c.campaignName}{c.placement ? ` · ${c.placement}` : ""}
                    </div>
                  </div>
                </button>
              );
            })}
          </div>
        )}
        <input type="hidden" name="campaignCreativeId" value={picked} />
        <p className="text-[11px] text-muted mt-2">
          Nothing selected sends whatever the rotation would have picked for the Discord placement.
        </p>
      </div>

      <div>
        <div className="text-[11px] uppercase tracking-widest text-muted mb-2">Where it goes</div>
        <label className="flex items-center gap-2 text-sm mb-2">
          <input type="checkbox" checked={all} onChange={(e) => setAll(e.target.checked)} className="accent-violet-500" />
          Every eligible server ({eligible.length})
        </label>
        {!all && (
          <div className="max-h-48 overflow-y-auto rounded-lg border border-white/10 p-2 space-y-1">
            {eligible.length === 0 && (
              <div className="text-xs text-muted">
                No server is eligible yet — a server receives ads once it has unlocked revenue share and opted in.
              </div>
            )}
            {eligible.map((s) => (
              <label key={s.guildId} className="flex items-center gap-2 text-xs">
                <input type="checkbox" name="guildIds" value={s.guildId} className="accent-violet-500" />
                {s.name || s.guildId}
              </label>
            ))}
          </div>
        )}
      </div>

      <label className="flex items-start gap-2 text-xs text-muted">
        <input type="checkbox" name="force" className="accent-amber-500 mt-0.5" />
        <span>
          Send anyway, even to servers that had an ad in the last few hours.
          The interval exists so the bot doesn&apos;t read as spam — override it on purpose, not by habit.
        </span>
      </label>

      <button
        disabled={busy}
        className="glow-btn pressable rounded-full px-6 py-2.5 font-bold disabled:opacity-60"
      >
        {busy ? "Sending…" : "Send ad to Discord"}
      </button>

      {state?.ok && <p className="text-sm text-emerald-300">{state.ok}</p>}
      {state?.error && <p className="text-sm text-amber-300">{state.error}</p>}
    </form>
  );
}

// A plain message to servers — announcements, notices, anything that isn't an ad.
export function TextBroadcast({ servers }: { servers: ServerOption[] }) {
  const [state, act, busy] = useActionState<BotActionState, FormData>(broadcast, undefined);
  return (
    <form action={act} className="space-y-3">
      <textarea
        name="message" rows={4} maxLength={1900} required
        placeholder="Write the message. Markdown and emoji work."
        className="input-cosmic w-full"
      />
      <input
        name="guildIds"
        placeholder={`Server IDs, comma separated — blank sends to all ${servers.length}`}
        className="input-cosmic w-full text-sm"
      />
      <button disabled={busy} className="ghost-btn pressable rounded-full px-6 py-2.5 font-semibold disabled:opacity-60">
        {busy ? "Sending…" : "Send message"}
      </button>
      {state?.ok && <p className="text-sm text-emerald-300">{state.ok}</p>}
      {state?.error && <p className="text-sm text-amber-300">{state.error}</p>}
    </form>
  );
}
