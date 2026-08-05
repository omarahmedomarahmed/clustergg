"use client";

import { useActionState, useState } from "react";
import Icon from "@/components/Icon";
import { saveCampaigns, type OfferActionState } from "@/app/actions/offers";

// The two shapes are declared HERE rather than imported from `lib/campaigns`
// and `lib/offers`, and it is not a style preference.
//
// `lib/offers` imports `lib/cms`, which imports `lib/i18n/server`, which imports
// `next/headers`. Next traces the module graph across the client boundary even
// for a type-only import, so `import type { OfferState }` in this file fails the
// BUILD — with a message about i18n that names nothing in this feature. The
// typecheck stays green throughout. Second time this shape has cost a build in
// this session (see B51); the rule is that a client component does not reach
// into a server module for anything, including a type.
type CampaignConfig = {
  brand: { enabled: boolean; pct: number; cap: number };
  server: { enabled: boolean; value: number; cap: number };
};
type OfferState = { claimed: number; waiting: number };

// The switch and the rate (B44).
//
// The percentage is the control that matters, so it is the one with a live
// preview under it: an admin setting 40% should see what 40% does to a bill
// before saving, not after the next invoice goes out. The figure it previews is
// computed the same way `campaignDiscountLine` computes the real one — off the
// challenge lines only, with placements still charged.

const money = (n: number) => `$${n.toLocaleString("en-US", { minimumFractionDigits: 2 })}`;

export default function CampaignConsole({
  campaign, servers, brands, challengePrice, challengesPerBrand,
}: {
  campaign: CampaignConfig;
  servers: OfferState;
  brands: OfferState;
  challengePrice: number;
  challengesPerBrand: number;
}) {
  const [state, action, pending] = useActionState<OfferActionState, FormData>(saveCampaigns, undefined);
  const [brandOn, setBrandOn] = useState(campaign.brand.enabled);
  const [pct, setPct] = useState(campaign.brand.pct);
  const [serverOn, setServerOn] = useState(campaign.server.enabled);

  const gross = challengePrice * challengesPerBrand;
  const covered = Math.round(((gross * pct) / 100) * 100) / 100;

  return (
    <form action={action} className="space-y-4">
      {state?.ok && (
        <div className="rounded-xl border border-emerald-400/30 bg-emerald-500/10 px-4 py-2.5 text-sm text-emerald-200">
          <Icon name="check" size={14} className="mr-1.5 inline" />{state.ok}
        </div>
      )}
      {state?.error && (
        <div className="rounded-xl border border-rose-400/30 bg-rose-500/10 px-4 py-2.5 text-sm text-rose-200">{state.error}</div>
      )}

      <div className="grid gap-4 lg:grid-cols-2">
        {/* ---- Brands ---- */}
        <section className={`glass p-5 ${brandOn ? "ring-1 ring-emerald-400/30" : ""}`} data-campaign="brand">
          <label className="flex cursor-pointer items-start gap-3">
            <input type="checkbox" name="brandEnabled" checked={brandOn} data-toggle="brand"
              onChange={(e) => setBrandOn(e.target.checked)} className="mt-1 h-4 w-4 accent-emerald-400" />
            <span>
              <span className="block font-bold">Founding brand offer</span>
              <span className="block text-xs text-muted">
                Covers a percentage of a brand&apos;s sponsored-challenge lines. Placements are still billed.
              </span>
            </span>
            <span className={`ml-auto shrink-0 rounded-full px-2 py-0.5 text-[10px] font-black uppercase tracking-wider ${
              brandOn ? "bg-emerald-500/20 text-emerald-200" : "bg-white/5 text-muted"}`} data-state="brand">
              {brandOn ? "Running" : "Off"}
            </span>
          </label>

          <div className="mt-4">
            <div className="flex items-baseline justify-between">
              <span className="text-[11px] font-semibold text-muted">Covered by Cluster</span>
              <span className="text-2xl font-black text-cyan-200" data-pct>{pct}%</span>
            </div>
            <input type="range" name="brandPct" min={0} max={100} step={5} value={pct}
              onChange={(e) => setPct(Number(e.target.value))}
              className="mt-1 w-full accent-cyan-400" />
            {/* What that does to a real bill, before saving rather than after
                the next invoice goes out. */}
            <div className="mt-2 rounded-xl border border-white/10 bg-black/30 px-3 py-2 text-xs" data-preview>
              <div className="flex justify-between"><span className="text-muted">{challengesPerBrand} × sponsored challenges</span><span>{money(gross)}</span></div>
              <div className="flex justify-between text-emerald-300">
                <span>Founding brand offer</span><span>−{money(covered)}</span>
              </div>
              <div className="mt-1 flex justify-between border-t border-white/10 pt-1 font-bold">
                <span>Brand pays for challenges</span><span>{money(Math.round((gross - covered) * 100) / 100)}</span>
              </div>
              <div className="mt-1 text-[10px] text-muted">Placements are charged on top, at list price.</div>
            </div>
          </div>

          <div className="mt-3 grid grid-cols-2 gap-3">
            <label className="text-[11px] text-muted">
              <span className="mb-1 block font-semibold text-white">Cap</span>
              <input name="brandCap" type="number" min={0} defaultValue={campaign.brand.cap}
                className="input-cosmic w-full text-sm" />
            </label>
            <div className="text-[11px] text-muted">
              <span className="mb-1 block font-semibold text-white">Given so far</span>
              <span className="block pt-2 text-sm font-bold text-ink">{brands.claimed} · {brands.waiting} owed</span>
            </div>
          </div>
        </section>

        {/* ---- Servers ---- */}
        <section className={`glass p-5 ${serverOn ? "ring-1 ring-emerald-400/30" : ""}`} data-campaign="server">
          <label className="flex cursor-pointer items-start gap-3">
            <input type="checkbox" name="serverEnabled" checked={serverOn} data-toggle="server"
              onChange={(e) => setServerOn(e.target.checked)} className="mt-1 h-4 w-4 accent-emerald-400" />
            <span>
              <span className="block font-bold">Server welcome challenge</span>
              <span className="block text-xs text-muted">
                A funded competition for every community that installs the bot — the only offer that reaches
                members rather than owners.
              </span>
            </span>
            <span className={`ml-auto shrink-0 rounded-full px-2 py-0.5 text-[10px] font-black uppercase tracking-wider ${
              serverOn ? "bg-emerald-500/20 text-emerald-200" : "bg-white/5 text-muted"}`} data-state="server">
              {serverOn ? "Running" : "Off"}
            </span>
          </label>

          <div className="mt-4 grid grid-cols-2 gap-3">
            <label className="text-[11px] text-muted">
              <span className="mb-1 block font-semibold text-white">Cost per server</span>
              <input name="serverValue" type="number" min={0} step="0.01" defaultValue={campaign.server.value}
                className="input-cosmic w-full text-sm" />
            </label>
            <label className="text-[11px] text-muted">
              <span className="mb-1 block font-semibold text-white">Cap</span>
              <input name="serverCap" type="number" min={0} defaultValue={campaign.server.cap}
                className="input-cosmic w-full text-sm" />
            </label>
          </div>

          <div className="mt-3 rounded-xl border border-white/10 bg-black/30 px-3 py-2 text-xs">
            <div className="flex justify-between"><span className="text-muted">Given so far</span><span className="font-bold">{servers.claimed}</span></div>
            <div className="flex justify-between"><span className="text-muted">Already installed and owed one</span><span className="font-bold">{servers.waiting}</span></div>
            <div className="mt-1 flex justify-between border-t border-white/10 pt-1">
              <span className="text-muted">If we serve every one of them</span>
              <span className="font-bold text-amber-200">{money(servers.waiting * campaign.server.value)}</span>
            </div>
          </div>
        </section>
      </div>

      {/* Retroactive by design, and worth restating next to the switch: an offer
          only new signups can take teaches everyone already with you that
          waiting would have been better. */}
      <p className="text-[11px] text-muted">
        <Icon name="check" size={11} className="mr-1 inline text-emerald-300" />
        Both campaigns are retroactive — every brand and server already here is owed theirs, and the sweeps
        on their own pages grant it. Turning a campaign off stops new grants; it never takes back one already given.
      </p>

      <button disabled={pending} data-save
        className="rounded-full bg-cyan-500/25 px-5 py-2.5 text-xs font-black text-cyan-100 disabled:opacity-50">
        {pending ? "Saving…" : "Save campaigns"}
      </button>
    </form>
  );
}
