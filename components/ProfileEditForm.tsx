"use client";

import { useActionState, useState } from "react";
import { updateProfile } from "@/app/actions/connections";
import { flagEmoji, type Country } from "@/lib/flags";
import { LOCALES } from "@/lib/i18n/locale";

export default function ProfileEditForm({
  defaults, countries, locale,
}: {
  defaults: { displayName: string; slug: string; bio: string; country: string };
  countries: Country[];
  locale: string;
}) {
  const [state, action, pending] = useActionState(updateProfile, undefined);
  const [country, setCountry] = useState(defaults.country?.toUpperCase() ?? "");
  return (
    <form action={action} className="glass p-6 space-y-4">
      <div>
        <label className="text-sm text-muted">Display name</label>
        <input name="displayName" defaultValue={defaults.displayName} required className="input-cosmic mt-1" />
      </div>
      <div>
        <label className="text-sm text-muted">Profile URL — clustergg.com/u/…</label>
        <input name="slug" defaultValue={defaults.slug} className="input-cosmic mt-1" />
      </div>
      <div>
        <label className="text-sm text-muted">Bio</label>
        <textarea name="bio" defaultValue={defaults.bio} rows={3} maxLength={400} className="input-cosmic mt-1" placeholder="Tell the galaxy who you are…" />
      </div>
      <div>
        <label className="text-sm text-muted flex items-center gap-2">Country flag {country && <span className="text-lg leading-none">{flagEmoji(country)}</span>}</label>
        <p className="text-[11px] text-muted/80 mb-1">Shown next to your name on every leaderboard, quest and challenge.</p>
        <select name="country" value={country} onChange={(e) => setCountry(e.target.value)} className="input-cosmic mt-1">
          <option value="">No flag</option>
          {countries.map((c) => <option key={c.code} value={c.code}>{flagEmoji(c.code)} {c.name}</option>)}
        </select>
      </div>
      <div>
        <label className="text-sm text-muted">Language</label>
        <p className="text-[11px] text-muted/80 mb-1">Switch the whole site between English and Arabic — change it any time.</p>
        <select name="locale" defaultValue={locale === "ar" ? "ar" : "en"} className="input-cosmic mt-1">
          {LOCALES.map((l) => <option key={l.code} value={l.code}>{l.flag} {l.native}</option>)}
        </select>
      </div>
      {state?.error && <p className="text-sm text-rose-300">{state.error}</p>}
      {state?.ok && <p className="text-sm text-emerald-300">Profile updated</p>}
      <button disabled={pending} className="glow-btn rounded-full px-8 py-2.5 font-semibold text-white">
        {pending ? "Saving…" : "Save changes"}
      </button>
    </form>
  );
}
