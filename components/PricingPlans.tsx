"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import Icon from "@/components/Icon";
import GameLogo from "@/components/GameLogo";
import {
  quote, money, projectedImpressions, lines, perGame,
  type PricingConfig,
} from "@/lib/pricing";

export type PlanGame = { slug: string; name: string; logoUrl: string | null; gamers: number };

// The pricing configurator. ONE package. B118.
//
// ===== WHY THERE ARE NO LONGER THREE CARDS =====
//
// This was a three-tier rate card: Reach (placements only), Challenge
// (placements plus sponsored challenges per game), Ultimate (the whole
// network), each with its own monthly base, plus a paid Sunday-broadcast
// add-on on top.
//
// C11 merged all of it into one package priced per challenge, with placements
// included, and set `reachBase`, `challengeBase`, `ultimateBase` and
// `streamAddon` to 0. The MONEY paths followed — the invoice builder, the vault
// split, the brand builder all run on the single package. This component did
// not. It kept rendering three cards, two of which now priced themselves off
// bases of zero, so "Reach" was a plan that cost nothing and delivered nothing
// nameable, and "Ultimate" was the same price as ticking every game in the card
// beside it while implying it was a step up.
//
// A rate card that shows a brand a plan we do not sell is worse than a stale
// number: they can pick it. So the two shells are gone and what is left is the
// thing that was always the product — pick your games, watch the price and the
// prize money move together.
//
// ===== THE ONE CONTROL =====
//
// Games, not a count. A slider answers "how many games", a question no brand
// has. A brand knows which title their audience plays; picking Valorant is a
// decision they can make, dragging to "3" is not. Same arithmetic, a control
// that matches the thought.

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
  const max = Math.max(1, Math.min(cfg.games, games.length || cfg.games));
  const [chosen, setChosen] = useState<string[]>(() => (games[0] ? [games[0].slug] : []));
  const [yearly, setYearly] = useState(false);

  const n = Math.min(chosen.length, max);
  const all = n >= max;
  const toggle = (slug: string) =>
    setChosen((c) => (c.includes(slug) ? c.filter((s) => s !== slug) : c.length >= max ? c : [...c, slug]));
  const setPicked = (want: number) => setChosen(games.slice(0, Math.max(0, Math.min(max, want))).map((g) => g.slug));

  const q = useMemo(() => quote(cfg, { games: n, yearly }), [cfg, n, yearly]);
  const rate = yearly ? q.yearlyMonthly : q.monthly;
  const impressions = projectedImpressions(cfg, reach, n);
  const selectedGamers = games.slice(0, n).reduce((s, g) => s + g.gamers, 0);
  const cta = copy["pricing.cta.primary"] || "Talk to us";
  const features = lines(copy["pricing.package.features"]);

  return (
    <div>
      <div className="mb-8 flex items-center justify-center">
        <BillingToggle yearly={yearly} setYearly={setYearly} discount={cfg.yearlyDiscountPct} />
      </div>

      <div className="mx-auto grid max-w-4xl gap-5 lg:grid-cols-[1.15fr_1fr] lg:items-start">
        {/* ===== The picker ===== */}
        <div className="glass relative overflow-hidden rounded-3xl p-6 ring-1 ring-violet-400/50">
          <div className="absolute inset-x-0 top-0 h-1 bg-violet-500" />
          <h3 className="text-2xl font-bold">{copy["pricing.package.name"] || "Sponsored challenges"}</h3>
          <p className="mt-1 text-sm text-muted">
            {copy["pricing.package.tagline"] || "Sponsor the gameplay, not the content."}
          </p>

          <div className="mt-5">
            <div className="mb-2 flex items-baseline justify-between text-xs">
              <span className="text-muted">Pick the games you want to own</span>
              <span className="font-bold text-violet-300">{n} of {max} selected</span>
            </div>

            {/* One row per game: logo, name, its real audience, a tick. */}
            <div className="grid gap-1.5 sm:grid-cols-2">
              {games.slice(0, max).map((g) => {
                const on = chosen.includes(g.slug);
                const full = !on && n >= max;
                return (
                  <button
                    key={g.slug} type="button" onClick={() => toggle(g.slug)} disabled={full}
                    aria-pressed={on}
                    className={`flex items-center gap-2.5 rounded-xl border px-2.5 py-2 text-left transition-all ${
                      on ? "border-violet-400/60 bg-violet-500/15" : "border-white/10 bg-black/20 hover:border-violet-400/30"
                    } ${full ? "cursor-not-allowed opacity-40" : ""}`}
                  >
                    <span className={on ? "" : "opacity-60 grayscale"}>
                      <GameLogo logoUrl={g.logoUrl} name={g.name} size={26} rounded="rounded-lg" />
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-xs font-semibold">{g.name}</span>
                      {g.gamers > 0 && <span className="block text-[10px] text-muted">{g.gamers.toLocaleString()} gamers</span>}
                    </span>
                    <span className={`grid h-4 w-4 shrink-0 place-items-center rounded-[5px] border ${
                      on ? "border-violet-400 bg-violet-400" : "border-white/25"
                    }`}>
                      {on && <Icon name="check" size={11} className="text-[#12002e]" />}
                    </span>
                  </button>
                );
              })}
            </div>
            {max > 1 && (
              <button
                type="button" onClick={() => setPicked(all ? 1 : max)}
                className="mt-2 text-[11px] text-violet-300 hover:text-ink"
              >
                {all ? "Clear back to one game" : `Select all ${max} games →`}
              </button>
            )}
          </div>

          <ul className="mt-5 space-y-2">
            {features.map((f) => (
              <li key={f} className="flex items-start gap-2 text-sm">
                <Icon name="check" size={14} className="mt-1 shrink-0 text-cyan-300" />
                <span className="leading-snug text-muted">{f}</span>
              </li>
            ))}
          </ul>
        </div>

        {/* ===== The price, and the working ===== */}
        <div className="glass rounded-3xl p-6">
          <div className="flex items-baseline gap-1.5">
            <span className="brand-text text-4xl font-bold">{money(rate, cfg.currency)}</span>
            <span className="text-sm text-muted">/month</span>
          </div>
          <div className="mt-1 h-4 text-[11px] text-muted">
            {yearly ? `${money(q.yearlyTotal, cfg.currency)} billed annually` : "billed monthly"}
          </div>

          {/* The arithmetic, in full. There is one term, which is the point of
              the package — nothing is added that a brand has to ask about. */}
          <div className="mt-4 rounded-xl border border-white/10 bg-black/25 p-3 text-xs leading-relaxed text-muted">
            <span className="font-semibold text-ink">{money(perGame(cfg), cfg.currency)}</span> × {n} {n === 1 ? "game" : "games"}
            <div className="mt-1.5">
              {cfg.challengesPerGame} sponsored challenges a month per game, at{" "}
              {money(cfg.challengePrice, cfg.currency)} each. Placements across the site and every Discord
              server running the bot are included — there is no separate media fee, no setup fee and no
              minimum term.
            </div>
          </div>

          <div className="mt-4 grid grid-cols-3 gap-2 text-center">
            <Stat n={q.challengesPerMonth} label="challenges / month" accent="text-cyan-300" />
            <Stat n={money(q.prizeFunded, cfg.currency)} label="prize money to players" accent="text-amber-300" />
            <Stat n={selectedGamers > 0 ? selectedGamers.toLocaleString() : "—"} label="verified gamers" accent="text-violet-200" />
          </div>

          <Link href={contactHref} className="brand-btn pressable mt-5 block rounded-full px-6 py-3 text-center font-semibold text-white">
            {cta} · {money(rate, cfg.currency)}/mo
          </Link>

          {/* Past four weeks on one game there is no self-serve path, and saying
              so here is cheaper than a brand discovering it at checkout. */}
          <p className="mt-3 text-center text-[11px] leading-relaxed text-muted">
            More weeks, more games in one buy, or anything off this rate card is a custom deal — we build
            it and you confirm it in your own portal.
          </p>
        </div>
      </div>

      {/* ===== The projection + inventory strip ===== */}
      {!compact && (
        <div className="mt-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <InvCard icon="grid" value={placements.total.toLocaleString()} label="ad placements" note={`${placements.web} on the site · ${placements.discord} in Discord`} />
          <InvCard icon="users" value={reach > 0 ? reach.toLocaleString() : "Growing"} label="gamers reachable" note="Combined membership of every server running the bot" />
          <InvCard
            icon="eye"
            value={impressions > 0 ? impressions.toLocaleString() : "—"}
            label="projected impressions / month"
            note={`Projection: reachable audience × ${cfg.impressionsPerMember} views, weighted by games sponsored. Not a measured number.`}
          />
          <InvCard icon="trophy" value={q.challengesPerMonth.toLocaleString()} label="challenges with your name on them" note={`${q.challengesPerYear.toLocaleString()} a year at this plan`} />
        </div>
      )}
    </div>
  );
}

// ===== pieces =====

function BillingToggle({ yearly, setYearly, discount }: { yearly: boolean; setYearly: (v: boolean) => void; discount: number }) {
  return (
    <div className="glass inline-flex items-center gap-1 rounded-full p-1 text-sm">
      <button
        type="button" onClick={() => setYearly(false)}
        className={`rounded-full px-4 py-1.5 transition-colors ${!yearly ? "bg-violet-500/30 font-semibold text-ink" : "text-muted hover:text-ink"}`}
      >Monthly</button>
      <button
        type="button" onClick={() => setYearly(true)}
        className={`inline-flex items-center gap-2 rounded-full px-4 py-1.5 transition-colors ${yearly ? "bg-violet-500/30 font-semibold text-ink" : "text-muted hover:text-ink"}`}
      >
        Annual
        <span className="rounded-full border border-emerald-400/40 bg-emerald-500/20 px-1.5 py-0.5 text-[10px] text-emerald-300">−{Math.round(discount)}%</span>
      </button>
    </div>
  );
}

function Stat({ n, label, accent }: { n: string | number; label: string; accent: string }) {
  return (
    <div className="rounded-xl border border-white/10 bg-black/25 px-2 py-3">
      <div className={`text-lg font-bold ${accent} leading-none`}>{n}</div>
      <div className="mt-1.5 text-[10px] uppercase leading-tight tracking-wider text-muted">{label}</div>
    </div>
  );
}

function InvCard({ icon, value, label, note }: { icon: string; value: string; label: string; note: string }) {
  return (
    <div className="glass rounded-2xl p-4">
      <Icon name={icon} size={16} className="text-violet-300" />
      <div className="brand-text mt-1.5 text-2xl font-bold leading-none">{value}</div>
      <div className="mt-1.5 text-[11px] uppercase tracking-wider text-muted">{label}</div>
      <p className="mt-2 text-[11px] leading-snug text-muted/70">{note}</p>
    </div>
  );
}
