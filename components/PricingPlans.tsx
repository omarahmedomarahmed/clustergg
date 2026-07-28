"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import Icon from "@/components/Icon";
import GameLogo from "@/components/GameLogo";
import {
  quote, money, projectedImpressions, lines, perGame,
  type PricingConfig, type TierKey,
} from "@/lib/pricing";

export type PlanGame = { slug: string; name: string; logoUrl: string | null; gamers: number };

// The pricing configurator.
//
// The middle card is not a price tag, it's the product: a brand drags one slider
// and watches the price, the number of challenges they own and the prize money
// they put into the community move together. That is the whole argument — you
// are not buying impressions, you are buying competitions with your name on
// them — and it is far more convincing shown than written.
//
// Reaching the last notch promotes them to Ultimate, and the third card visibly
// unlocks. The rule teaches itself.

export default function PricingPlans({
  cfg, copy, games, reach, placements, contactHref = "/brands", compact = false,
}: {
  cfg: PricingConfig;
  copy: Record<string, string>;
  games: PlanGame[];
  reach: number;
  placements: { total: number; web: number; discord: number };
  contactHref?: string;
  compact?: boolean;
}) {
  // Which games, not how many.
  //
  // A slider answers "how many games" — a question no brand has. A brand knows
  // which title their audience plays, and picking Valorant is a decision they
  // can make; dragging to "3" is one they can't. Same maths, same price, but the
  // control now matches the thought.
  const max = Math.max(1, Math.min(cfg.games, games.length || cfg.games));
  const [chosen, setChosen] = useState<string[]>(() => (games[0] ? [games[0].slug] : []));
  const [yearly, setYearly] = useState(false);
  const [addon, setAddon] = useState(false);

  const n = Math.min(chosen.length, max);
  const toggle = (slug: string) =>
    setChosen((c) => (c.includes(slug) ? c.filter((s) => s !== slug) : c.length >= max ? c : [...c, slug]));
  const setPicked = (want: number) => setChosen(games.slice(0, Math.max(0, Math.min(max, want))).map((g) => g.slug));

  const qReach = useMemo(() => quote(cfg, { games: 0, yearly, addon }), [cfg, yearly, addon]);
  const qPick = useMemo(() => quote(cfg, { games: n, yearly, addon }), [cfg, n, yearly, addon]);
  const qUltimate = useMemo(() => quote(cfg, { games: max, yearly, addon }), [cfg, max, yearly, addon]);
  const isUltimate = n >= max;

  const rate = (q: ReturnType<typeof quote>) => (yearly ? q.yearlyMonthly : q.monthly);
  const impressions = projectedImpressions(cfg, reach, n);
  const selected = games.slice(0, n);
  const selectedGamers = selected.reduce((s, g) => s + g.gamers, 0);

  const cta = copy["pricing.cta.primary"] || "Talk to us";

  return (
    <div>
      {/* ===== Billing toggle ===== */}
      <div className="flex items-center justify-center gap-3 mb-8">
        <BillingToggle yearly={yearly} setYearly={setYearly} discount={cfg.yearlyDiscountPct} />
      </div>

      <div className="grid lg:grid-cols-3 gap-5 items-start">
        {/* ===== 1. REACH ===== */}
        <TierCard
          tier="reach"
          active={n <= 0}
          name={copy["pricing.tier.reach.name"] || "Reach"}
          tagline={copy["pricing.tier.reach.tagline"] || ""}
          price={rate(qReach)}
          currency={cfg.currency}
          yearly={yearly}
          yearlyTotal={qReach.yearlyTotal}
          features={lines(copy["pricing.tier.reach.features"])}
          cta={cta}
          contactHref={contactHref}
          icon="send"
          badge={`${placements.total} placements`}
          addon={addon} setAddon={setAddon} cfg={cfg} copy={copy}
        />

        {/* ===== 2. CHALLENGE — the configurator ===== */}
        <div className={`glass rounded-3xl p-6 relative overflow-hidden ring-1 ${isUltimate ? "ring-amber-400/40" : "ring-violet-400/50"} lg:-mt-3 lg:mb-3`}>
          <div className="absolute inset-x-0 top-0 h-1 bg-violet-500" />
          <div className="flex items-start justify-between gap-3">
            <div>
              <div className="inline-flex items-center gap-2 text-[10px] uppercase tracking-[0.2em] text-violet-200 bg-violet-500/15 border border-violet-400/30 rounded-full px-2.5 py-1">
                <Icon name="trophy" size={11} /> Most bought
              </div>
              <h3 className="text-2xl font-bold mt-3">{copy["pricing.tier.challenge.name"] || "Challenge"}</h3>
              <p className="text-sm text-muted mt-1">{copy["pricing.tier.challenge.tagline"]}</p>
            </div>
            <Icon name="target" size={26} className="text-cyan-300 shrink-0 mt-1" />
          </div>

          <Price value={rate(qPick)} currency={cfg.currency} yearly={yearly} yearlyTotal={qPick.yearlyTotal} />

          {/* The slider */}
          <div className="mt-5">
            <div className="flex items-baseline justify-between text-xs mb-2">
              <span className="text-muted">Pick the games you want to own</span>
              <span className="font-bold text-violet-300">{n} of {max} selected</span>
            </div>

            {/* One row per game: logo, name, its real audience, a tick. */}
            <div className="grid sm:grid-cols-2 gap-1.5">
              {games.slice(0, max).map((g) => {
                const on = chosen.includes(g.slug);
                const full = !on && n >= max;
                return (
                  <button
                    key={g.slug} type="button" onClick={() => toggle(g.slug)} disabled={full}
                    aria-pressed={on}
                    className={`flex items-center gap-2.5 rounded-xl border px-2.5 py-2 text-left transition-all ${
                      on ? "border-violet-400/60 bg-violet-500/15" : "border-white/10 bg-black/20 hover:border-violet-400/30"
                    } ${full ? "opacity-40 cursor-not-allowed" : ""}`}
                  >
                    <span className={on ? "" : "opacity-60 grayscale"}>
                      <GameLogo logoUrl={g.logoUrl} name={g.name} size={26} rounded="rounded-lg" />
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block text-xs font-semibold truncate">{g.name}</span>
                      {g.gamers > 0 && <span className="block text-[10px] text-muted">{g.gamers.toLocaleString()} gamers</span>}
                    </span>
                    <span className={`h-4 w-4 rounded-[5px] border grid place-items-center shrink-0 ${
                      on ? "bg-violet-400 border-violet-400" : "border-white/25"
                    }`}>
                      {on && <Icon name="check" size={11} className="text-[#12002e]" />}
                    </span>
                  </button>
                );
              })}
            </div>
            {max > 1 && (
              <button
                type="button" onClick={() => setPicked(isUltimate ? 1 : max)}
                className="mt-2 text-[11px] text-violet-300 hover:text-ink"
              >
                {isUltimate ? "Clear back to one game" : `Select all ${max} games →`}
              </button>
            )}
          </div>

          {/* What that buys — the numbers that move as you pick */}
          <div className="mt-5 grid grid-cols-3 gap-2 text-center">
            <Stat n={qPick.challengesPerMonth} label="challenges / month" accent="text-cyan-300" />
            <Stat n={money(qPick.prizeFunded, cfg.currency)} label="prize money to players" accent="text-amber-300" />
            <Stat n={selectedGamers > 0 ? selectedGamers.toLocaleString() : "—"} label="verified gamers" accent="text-violet-200" />
          </div>

          <div className="mt-4 rounded-xl bg-black/25 border border-white/10 p-3 text-xs text-muted leading-relaxed">
            <span className="text-ink font-semibold">{money(isUltimate ? cfg.ultimateBase : cfg.challengeBase, cfg.currency)}</span> base
            {" + "}<span className="text-ink font-semibold">{money(perGame(cfg), cfg.currency)}</span> × {n} {n === 1 ? "game" : "games"}
            {addon && <> {" + "}<span className="text-ink font-semibold">{money(cfg.streamAddon, cfg.currency)}</span> broadcast</>}
            {isUltimate && (
              <div className="mt-1.5 text-amber-300 inline-flex items-center gap-1.5">
                <Icon name="crown" size={12} /> All {max} games — your base drops to {money(cfg.ultimateBase, cfg.currency)}.
              </div>
            )}
          </div>

          <ul className="mt-4 space-y-2">
            {lines(copy["pricing.tier.challenge.features"]).map((f) => <Feature key={f} text={f} />)}
          </ul>

          <AddonToggle on={addon} setOn={setAddon} cfg={cfg} copy={copy} />

          <Link href={contactHref} className="brand-btn pressable mt-5 block rounded-full px-6 py-3 text-center font-semibold text-white">
            {cta} · {money(rate(qPick), cfg.currency)}/mo
          </Link>
        </div>

        {/* ===== 3. ULTIMATE ===== */}
        <TierCard
          tier="ultimate"
          active={isUltimate}
          name={copy["pricing.tier.ultimate.name"] || "Ultimate"}
          tagline={copy["pricing.tier.ultimate.tagline"] || ""}
          price={rate(qUltimate)}
          currency={cfg.currency}
          yearly={yearly}
          yearlyTotal={qUltimate.yearlyTotal}
          features={lines(copy["pricing.tier.ultimate.features"])}
          cta={cta}
          contactHref={contactHref}
          icon="crown"
          badge={isUltimate ? "Unlocked" : `Select all ${max} games`}
          onBadgeClick={() => setPicked(max)}
          extra={
            <div className="mt-3 text-xs text-amber-200/90 inline-flex items-start gap-1.5">
              <Icon name="play" size={12} className="mt-0.5 shrink-0" />
              <span>{cfg.slotCount} × {cfg.slotSeconds}-second video slots in the network rotation.</span>
            </div>
          }
          addon={addon} setAddon={setAddon} cfg={cfg} copy={copy}
        />
      </div>

      {/* ===== The projection + inventory strip ===== */}
      {!compact && (
        <div className="mt-6 grid sm:grid-cols-2 lg:grid-cols-4 gap-3">
          <InvCard icon="grid" value={placements.total.toLocaleString()} label="ad placements" note={`${placements.web} on the site · ${placements.discord} in Discord`} />
          <InvCard icon="users" value={reach > 0 ? reach.toLocaleString() : "Growing"} label="gamers reachable" note="Combined membership of every server running the bot" />
          <InvCard
            icon="eye"
            value={impressions > 0 ? impressions.toLocaleString() : "—"}
            label="projected impressions / month"
            note={`Projection: reachable audience × ${cfg.impressionsPerMember} views, weighted by games sponsored. Not a measured number.`}
          />
          <InvCard icon="trophy" value={qPick.challengesPerMonth.toLocaleString()} label="challenges with your name on them" note={`${qPick.challengesPerYear.toLocaleString()} a year at this plan`} />
        </div>
      )}
    </div>
  );
}

// ===== pieces =====

function BillingToggle({ yearly, setYearly, discount }: { yearly: boolean; setYearly: (v: boolean) => void; discount: number }) {
  return (
    <div className="glass rounded-full p-1 inline-flex items-center gap-1 text-sm">
      <button
        type="button" onClick={() => setYearly(false)}
        className={`rounded-full px-4 py-1.5 transition-colors ${!yearly ? "bg-violet-500/30 text-ink font-semibold" : "text-muted hover:text-ink"}`}
      >Monthly</button>
      <button
        type="button" onClick={() => setYearly(true)}
        className={`rounded-full px-4 py-1.5 transition-colors inline-flex items-center gap-2 ${yearly ? "bg-violet-500/30 text-ink font-semibold" : "text-muted hover:text-ink"}`}
      >
        Annual
        <span className="text-[10px] rounded-full bg-emerald-500/20 border border-emerald-400/40 text-emerald-300 px-1.5 py-0.5">−{Math.round(discount)}%</span>
      </button>
    </div>
  );
}

function Price({ value, currency, yearly, yearlyTotal }: { value: number; currency: string; yearly: boolean; yearlyTotal: number }) {
  return (
    <div className="mt-4">
      <div className="flex items-baseline gap-1.5">
        <span className="text-4xl font-bold brand-text">{money(value, currency)}</span>
        <span className="text-sm text-muted">/month</span>
      </div>
      <div className="text-[11px] text-muted mt-1 h-4">
        {yearly ? `${money(yearlyTotal, currency)} billed annually` : "billed monthly"}
      </div>
    </div>
  );
}

function TierCard({
  tier, active, name, tagline, price, currency, yearly, yearlyTotal, features, cta, contactHref, icon, badge, onBadgeClick, extra,
  addon, setAddon, cfg, copy,
}: {
  tier: TierKey; active: boolean; name: string; tagline: string; price: number; currency: string;
  yearly: boolean; yearlyTotal: number; features: string[]; cta: string; contactHref: string;
  icon: string; badge?: string; onBadgeClick?: () => void; extra?: React.ReactNode;
  addon: boolean; setAddon: (v: boolean) => void; cfg: PricingConfig; copy: Record<string, string>;
}) {
  const gold = tier === "ultimate";
  return (
    <div className={`glass rounded-3xl p-6 h-full flex flex-col transition-all ${active ? (gold ? "ring-1 ring-amber-400/50" : "ring-1 ring-cyan-400/40") : "opacity-95"}`}>
      <div className="flex items-start justify-between gap-3">
        <div>
          {badge && (
            <button
              type="button" onClick={onBadgeClick} disabled={!onBadgeClick}
              className={`inline-flex items-center gap-1.5 text-[10px] uppercase tracking-[0.2em] rounded-full px-2.5 py-1 border ${
                gold && active
                  ? "text-amber-200 bg-amber-500/15 border-amber-400/40"
                  : "text-muted bg-white/5 border-white/10"
              } ${onBadgeClick ? "hover:text-ink cursor-pointer" : "cursor-default"}`}
            >
              {gold && active && <Icon name="check" size={11} />} {badge}
            </button>
          )}
          <h3 className="text-2xl font-bold mt-3">{name}</h3>
          <p className="text-sm text-muted mt-1">{tagline}</p>
        </div>
        <Icon name={icon} size={26} className={`${gold ? "text-amber-300" : "text-violet-300"} shrink-0 mt-1`} />
      </div>

      <Price value={price} currency={currency} yearly={yearly} yearlyTotal={yearlyTotal} />

      <ul className="mt-5 space-y-2 flex-1">
        {features.map((f) => <Feature key={f} text={f} gold={gold} />)}
      </ul>
      {extra}

      {/* The add-on sells on every plan, so it is offered on every plan. It used
          to live only inside the middle card, which meant a brand who wanted
          placements plus the Sunday broadcast never saw that they could. */}
      <AddonToggle on={addon} setOn={setAddon} cfg={cfg} copy={copy} />

      <Link
        href={contactHref}
        className={`pressable mt-4 block rounded-full px-6 py-3 text-center font-semibold ${
          gold ? "bg-amber-500 text-[#1a1200]" : "ghost-btn"
        }`}
      >{cta}</Link>
    </div>
  );
}

function Feature({ text, gold = false }: { text: string; gold?: boolean }) {
  return (
    <li className="flex items-start gap-2 text-sm">
      <Icon name="check" size={14} className={`mt-1 shrink-0 ${gold ? "text-amber-300" : "text-cyan-300"}`} />
      <span className="text-muted leading-snug">{text}</span>
    </li>
  );
}

function Stat({ n, label, accent }: { n: string | number; label: string; accent: string }) {
  return (
    <div className="rounded-xl bg-black/25 border border-white/10 px-2 py-3">
      <div className={`text-lg font-bold ${accent} leading-none`}>{n}</div>
      <div className="text-[10px] uppercase tracking-wider text-muted mt-1.5 leading-tight">{label}</div>
    </div>
  );
}

function AddonToggle({ on, setOn, cfg, copy }: { on: boolean; setOn: (v: boolean) => void; cfg: PricingConfig; copy: Record<string, string> }) {
  return (
    <button
      type="button" onClick={() => setOn(!on)}
      className={`mt-4 w-full text-left rounded-2xl border p-3 transition-colors ${
        on ? "border-amber-400/50 bg-amber-500/10" : "border-white/10 bg-black/20 hover:border-violet-400/40"
      }`}
    >
      <div className="flex items-center gap-3">
        <span className={`h-5 w-5 rounded-md border grid place-items-center shrink-0 ${on ? "bg-amber-400 border-amber-400" : "border-white/25"}`}>
          {on && <Icon name="check" size={13} className="text-[#1a1200]" />}
        </span>
        <div className="min-w-0">
          <div className="text-sm font-semibold truncate">
            + {copy["pricing.addon.name"] || "Sunday Broadcast"} · {money(cfg.streamAddon, cfg.currency)}/mo
          </div>
          <div className="text-[11px] text-muted truncate">{copy["pricing.addon.tagline"]}</div>
        </div>
      </div>
    </button>
  );
}

function InvCard({ icon, value, label, note }: { icon: string; value: string; label: string; note: string }) {
  return (
    <div className="glass rounded-2xl p-4">
      <Icon name={icon} size={16} className="text-violet-300" />
      <div className="text-2xl font-bold brand-text mt-1.5 leading-none">{value}</div>
      <div className="text-[11px] uppercase tracking-wider text-muted mt-1.5">{label}</div>
      <p className="text-[11px] text-muted/70 mt-2 leading-snug">{note}</p>
    </div>
  );
}
