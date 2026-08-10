"use client";

import { useActionState, useState } from "react";
import Icon from "@/components/Icon";
import { sendEnquiry, type EnquiryState } from "@/app/actions/brand-enquiry";
import { quote, money, type PricingConfig } from "@/lib/pricing";

// The one form on the site a brand fills in.
//
// It carries their plan with them: they arrive from the pricing slider with
// ?games=3&addon=1 and the form opens already showing what that costs. A sales
// enquiry that already contains the configuration is a conversation that starts
// at "when do you want to launch" instead of "what were you looking at".

export default function EnquiryForm({
  cfg, initialGames = 0, initialAddon = false, initialYearly = false,
}: {
  cfg: PricingConfig;
  initialGames?: number;
  initialAddon?: boolean;
  initialYearly?: boolean;
}) {
  const [state, action, pending] = useActionState<EnquiryState, FormData>(sendEnquiry, {});
  const [games, setGames] = useState(Math.max(0, Math.min(cfg.games, initialGames)));
  const [addon, setAddon] = useState(initialAddon);
  const [yearly, setYearly] = useState(initialYearly);

  const q = quote(cfg, { games, addon, yearly });
  const rate = yearly ? q.yearlyMonthly : q.monthly;
  // What they are asking about, in their own words. There is one package, so
  // the line names the SIZE of the buy rather than a tier — a brand told they
  // are on "Reach" has to ask what that means before they can send the form.
  const planName = games <= 0
    ? "Placements only"
    : games >= cfg.games ? `All ${cfg.games} games` : `${games} ${games === 1 ? "game" : "games"}`;

  if (state?.ok) {
    return (
      <div className="glass rounded-3xl p-10 text-center">
        <div className="h-14 w-14 rounded-2xl bg-emerald-500/15 border border-emerald-400/30 grid place-items-center mx-auto">
          <Icon name="check" size={26} className="text-emerald-300" />
        </div>
        <h3 className="text-2xl font-bold mt-5">Message sent.</h3>
        <p className="text-muted mt-2 max-w-sm mx-auto leading-relaxed">{state.ok}</p>
      </div>
    );
  }

  return (
    <form action={action} className="glass rounded-3xl p-6 md:p-8">
      {/* The live quote, so they can see what they're asking about. */}
      <div className="rounded-2xl bg-black/30 border border-white/10 p-5">
        <div className="flex items-baseline justify-between gap-3 flex-wrap">
          <div>
            <div className="text-[10px] uppercase tracking-[0.2em] text-muted">Your plan</div>
            <div className="text-lg font-bold mt-1">
              {planName}
              {games > 0 && games < cfg.games && (
                <span className="text-muted font-normal"> · {q.challengesPerMonth} challenges a month</span>
              )}
            </div>
          </div>
          <div className="text-right">
            <div className="text-3xl font-bold brand-text leading-none">{money(rate, cfg.currency)}</div>
            <div className="text-[11px] text-muted mt-1">per month{yearly ? ", billed annually" : ""}</div>
          </div>
        </div>

        <div className="mt-4">
          <div className="flex items-center justify-between text-xs mb-2">
            <span className="text-muted">Games sponsored</span>
            <span className="font-bold text-cyan-300">{games}</span>
          </div>
          <input
            type="range" min={0} max={cfg.games} step={1} value={games}
            onChange={(e) => setGames(Number(e.target.value))}
            aria-label="Games sponsored" className="w-full accent-violet-500"
          />
        </div>

        <div className="mt-4 flex flex-wrap gap-2">
          {/* The broadcast comes with the package. The chip stays only if it
              is ever priced back up — offering a paid extra at $0 reads as a
              fee somebody forgot to fill in. */}
          {cfg.streamAddon > 0 && (
            <Chip on={addon} onClick={() => setAddon(!addon)}>
              + Sunday Broadcast {money(cfg.streamAddon, cfg.currency)}
            </Chip>
          )}
          <Chip on={yearly} onClick={() => setYearly(!yearly)}>
            Annual −{Math.round(cfg.yearlyDiscountPct)}%
          </Chip>
        </div>

        {games > 0 && (
          <p className="text-[11px] text-muted mt-3 leading-relaxed">
            {q.challengesPerMonth} sponsored challenges a month under your brand,
            with {money(q.prizeFunded, cfg.currency)} of prize money funded and paid by us.
          </p>
        )}
      </div>

      {/* Carried into the enquiry so sales sees exactly this. */}
      <input type="hidden" name="tier" value={q.tier} />
      <input type="hidden" name="games" value={games} />
      <input type="hidden" name="addon" value={addon ? "true" : "false"} />
      <input type="hidden" name="billing" value={yearly ? "yearly" : "monthly"} />
      <input type="hidden" name="quotedMonthly" value={Math.round(rate)} />

      <div className="grid sm:grid-cols-2 gap-4 mt-6">
        <Field name="company" label="Company" required />
        <Field name="contactName" label="Your name" />
        <Field name="email" label="Work email" type="email" required />
        <Field name="phone" label="Phone (optional)" />
        <div className="sm:col-span-2">
          <Field name="website" label="Website (optional)" />
        </div>
        <div className="sm:col-span-2">
          <label className="text-xs text-muted block mb-1.5">What are you trying to reach?</label>
          <textarea
            name="message" rows={4} className="input-cosmic"
            placeholder="The audience, the region, the games, the timing — whatever you already know. If we can't deliver it we'll tell you in the first reply."
          />
        </div>
      </div>

      {/* Honeypot. Hidden from people, irresistible to bots. */}
      <div aria-hidden className="absolute left-[-9999px] w-px h-px overflow-hidden">
        <label>Leave this empty<input name="website_url" tabIndex={-1} autoComplete="off" /></label>
      </div>

      {state?.error && (
        <div className="mt-4 rounded-xl border border-rose-400/40 bg-rose-500/10 px-4 py-3 text-sm text-rose-200">
          {state.error}
        </div>
      )}

      <button disabled={pending} className="brand-btn pressable mt-6 w-full rounded-full px-8 py-3.5 font-semibold text-white disabled:opacity-60">
        {pending ? "Sending…" : "Send enquiry"}
      </button>
      <p className="text-[11px] text-muted mt-3 text-center">
        We reply within one business day. No autoresponder, no sequence.
      </p>
    </form>
  );
}

function Field({ name, label, type = "text", required = false }: { name: string; label: string; type?: string; required?: boolean }) {
  return (
    <div>
      <label className="text-xs text-muted block mb-1.5">
        {label}{required && <span className="text-rose-300"> *</span>}
      </label>
      <input name={name} type={type} required={required} className="input-cosmic" />
    </div>
  );
}

function Chip({ on, onClick, children }: { on: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button" onClick={onClick}
      className={`rounded-full px-3.5 py-1.5 text-xs border transition-colors ${
        on ? "bg-amber-500/15 border-amber-400/50 text-amber-200" : "bg-white/5 border-white/10 text-muted hover:text-ink"
      }`}
    >{children}</button>
  );
}
