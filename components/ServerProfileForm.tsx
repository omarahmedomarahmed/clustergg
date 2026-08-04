"use client";

import { useActionState, useState } from "react";
import Icon from "@/components/Icon";
import { portalSaveCommunity, type PortalActionState } from "@/app/actions/server-portal";

export type ProfileFieldDef = { key: string; label: string; why: string };

/**
 * The server's profile — and the thing that switches its revenue share on.
 *
 * This form is not onboarding decoration. Until every field is answered the
 * server earns **0%** of sponsored challenges no matter how many members it has
 * linked (B47), so the form has to say that plainly, in advance, and it has to
 * name exactly which fields are still blank.
 *
 * "Profile incomplete" with no list is a dead end. An owner who reaches 500
 * linked members and finds out only then that they are earning nothing was
 * misled the whole way up.
 */
export default function ServerProfileForm({
  guildId, portalKey, games, regions, vibes, fields,
  profile, contactEmail, missing,
}: {
  guildId: string;
  portalKey: string;
  games: { value: string; label: string }[];
  regions: { key: string; label: string }[];
  vibes: { key: string; label: string }[];
  fields: ProfileFieldDef[];
  profile: { games: string[]; regions: string[]; vibes: string[]; about: string };
  contactEmail: string | null;
  missing: string[];
}) {
  const [state, formAction, pending] = useActionState<PortalActionState, FormData>(
    portalSaveCommunity.bind(null, guildId, portalKey), null);
  const [about, setAbout] = useState(profile.about);
  const complete = missing.length === 0;
  const missingSet = new Set(missing);
  const need = (k: string) => missingSet.has(k);

  const chip = (on: boolean) =>
    `cursor-pointer rounded-full border px-3 py-1.5 text-xs transition-colors ${
      on ? "border-cyan-400/60 bg-cyan-500/10 text-cyan-200" : "border-violet-400/20 text-muted hover:text-ink"}`;

  return (
    <form action={formAction} className="glass p-6 space-y-6" id="server-profile">
      <div>
        <h2 className="font-bold text-lg flex items-center gap-2">
          <Icon name="users" size={18} className="text-cyan-300" /> Your server profile
          {complete
            ? <span className="rounded-full bg-emerald-500/15 px-2.5 py-0.5 text-[11px] font-semibold text-emerald-300">complete</span>
            : <span className="rounded-full bg-amber-500/15 px-2.5 py-0.5 text-[11px] font-semibold text-amber-300">{missing.length} missing</span>}
        </h2>
        <p className="text-sm text-muted mt-1 max-w-2xl">
          This is what a brand reads when they are choosing where to spend. A server we cannot describe is a
          server we cannot sell — which is why <b className="text-ink">your share of sponsored challenges only pays
          once every field below is answered</b>, however many members you have linked.
        </p>
      </div>

      {/* What is still missing, named. */}
      {!complete && (
        <div className="rounded-2xl border border-amber-400/30 bg-amber-500/5 p-4">
          <div className="text-sm font-semibold text-amber-200 mb-2">Still needed before your share pays out</div>
          <ul className="space-y-1.5">
            {fields.filter((f) => need(f.key)).map((f) => (
              <li key={f.key} className="text-xs text-muted flex gap-2">
                <Icon name="alert" size={13} className="text-amber-300 shrink-0 mt-0.5" />
                <span><b className="text-ink">{f.label}</b> — {f.why}</span>
              </li>
            ))}
          </ul>
        </div>
      )}

      <label className="block">
        <span className="text-sm font-semibold flex items-center gap-2">
          Contact email {need("contactEmail") && <span className="text-[10px] uppercase tracking-widest text-amber-300">required</span>}
        </span>
        <p className="text-xs text-muted mt-0.5 mb-2">
          Where your payout notices and challenge approvals go. We never guess this from Discord —
          a made-up address on a billing path is worse than none.
        </p>
        <input name="contactEmail" type="email" defaultValue={contactEmail ?? ""} placeholder="you@yourdomain.com"
          className="w-full rounded-lg border border-violet-400/20 bg-black/30 px-3 py-2 text-sm" />
      </label>

      <div>
        <div className="text-sm font-semibold flex items-center gap-2">
          Games your members play {need("games") && <span className="text-[10px] uppercase tracking-widest text-amber-300">required</span>}
        </div>
        <p className="text-xs text-muted mt-0.5 mb-2">A brand buys a game. Without this you are in none of their searches.</p>
        <div className="flex flex-wrap gap-2">
          {games.map((g) => (
            <label key={g.value} className={chip(profile.games.includes(g.value))}>
              <input type="checkbox" name="games" value={g.value} defaultChecked={profile.games.includes(g.value)} className="sr-only" />
              {g.label}
            </label>
          ))}
        </div>
      </div>

      <div>
        <div className="text-sm font-semibold flex items-center gap-2">
          Where your members are {need("regions") && <span className="text-[10px] uppercase tracking-widest text-amber-300">required</span>}
        </div>
        <p className="text-xs text-muted mt-0.5 mb-2">Regions, not countries — nobody knows the country split of five thousand members, and everybody can name a region.</p>
        <div className="flex flex-wrap gap-2">
          {regions.map((r) => (
            <label key={r.key} className={chip(profile.regions.includes(r.key))}>
              <input type="checkbox" name="regions" value={r.key} defaultChecked={profile.regions.includes(r.key)} className="sr-only" />
              {r.label}
            </label>
          ))}
        </div>
      </div>

      <div>
        <div className="text-sm font-semibold flex items-center gap-2">
          What kind of community this is {need("vibes") && <span className="text-[10px] uppercase tracking-widest text-amber-300">required</span>}
        </div>
        <p className="text-xs text-muted mt-0.5 mb-2">Competitive and casual servers get sold to different brands.</p>
        <div className="flex flex-wrap gap-2">
          {vibes.map((v) => (
            <label key={v.key} className={chip(profile.vibes.includes(v.key))}>
              <input type="checkbox" name="vibes" value={v.key} defaultChecked={profile.vibes.includes(v.key)} className="sr-only" />
              {v.label}
            </label>
          ))}
        </div>
      </div>

      <label className="block">
        <span className="text-sm font-semibold flex items-center gap-2">
          Your audience, in your own words {need("about") && <span className="text-[10px] uppercase tracking-widest text-amber-300">required</span>}
        </span>
        <p className="text-xs text-muted mt-0.5 mb-2">
          The one thing we cannot derive from data, and the part a brand actually reads. Who are they, what do they play, what are they like?
        </p>
        <textarea name="about" rows={4} maxLength={400} value={about} onChange={(e) => setAbout(e.target.value)}
          placeholder="Mostly 18–25, MENA and Europe, heavy on ranked PUBG and Valorant. Very active on weekends, tournament nights every Friday."
          className="w-full rounded-lg border border-violet-400/20 bg-black/30 px-3 py-2 text-sm" />
        <span className="text-[11px] text-muted">{about.length}/400</span>
      </label>

      <div className="flex items-center gap-3">
        <button disabled={pending} className="glow-btn rounded-full px-5 py-2 text-sm font-semibold text-white">
          {pending ? "Saving…" : "Save profile"}
        </button>
        {state?.ok && <span className="text-xs text-emerald-300">{state.ok}</span>}
        {state?.error && <span className="text-xs text-rose-300">{state.error}</span>}
      </div>
    </form>
  );
}
