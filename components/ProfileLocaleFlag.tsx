"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { saveProfileFlag } from "@/app/actions/prefs";
import { flagEmoji, type Country } from "@/lib/flags";
import Icon from "@/components/Icon";

// Where a gamer tells us which country they are in. B89.2.
//
// ===== IT USED TO BE "FLAG & LANGUAGE", AND BOTH HALVES WERE WRONG =====
//
// The LANGUAGE selector is gone. It switched the whole site between English and
// Arabic off a translation registry that is not finished, so the honest state of
// it was: pick Arabic, get a half-translated product. A control that half works
// is worse than one that is not there yet — it is the setting a gamer blames
// when the page they land on is in the wrong language.
//
// The FLAG was optional and described as decoration: "shown next to your name
// on every leaderboard". That is true and it is not why we need it. Where
// somebody is decides whether a trophy can be redeemed for money at all, where
// US reporting starts, and who we are not allowed to pay. All three have to be
// known BEFORE they win something. So it is a required step now — see
// `stepsFor` in lib/unlock — and this panel says which of the two things it is
// for first.

export default function ProfileLocaleFlag({ countries, country }: {
  countries: Country[];
  country: string;
  /** Accepted and ignored — the language selector was removed in B89.2. */
  locale?: string;
}) {
  const [c, setC] = useState((country || "").toUpperCase());
  const [pending, start] = useTransition();
  const [saved, setSaved] = useState(false);
  const router = useRouter();
  const save = () => start(async () => {
    await saveProfileFlag(c);
    setSaved(true);
    router.refresh();
  });

  const missing = !/^[A-Z]{2}$/.test(c);

  return (
    <section className={`glass p-5 md:p-6 ${missing ? "border border-amber-400/30" : ""}`}>
      <h2 className="mb-1 flex items-center gap-2 font-bold">
        <Icon name="globe" size={18} className={missing ? "text-amber-300" : "text-cyan-300"} />
        Your country
        {missing && (
          <span className="rounded-full border border-amber-400/40 bg-amber-500/10 px-2 py-0.5 text-[10px] font-bold uppercase tracking-widest text-amber-200">
            required
          </span>
        )}
      </h2>
      {/* The reason first. A required field with no stated reason reads as data
          collection; this one is the difference between winning a trophy you
          can cash and winning one you cannot. */}
      <p className="mb-4 text-sm text-muted">
        It decides which prizes you can redeem for money — some countries can and some cannot, and
        that has to be settled before you win something rather than after. It is also the flag shown
        next to your name on every leaderboard, quest and challenge.
      </p>
      <label className="block max-w-sm">
        <span className="flex items-center gap-2 text-sm text-muted">
          Country {c && <span className="text-xl leading-none">{flagEmoji(c)}</span>}
        </span>
        <select
          value={c}
          onChange={(e) => { setC(e.target.value); setSaved(false); }}
          className="input-cosmic mt-1 w-full"
        >
          <option value="">Pick your country…</option>
          {countries.map((x) => <option key={x.code} value={x.code}>{flagEmoji(x.code)} {x.name}</option>)}
        </select>
      </label>
      <div className="mt-4 flex items-center gap-3">
        <button
          onClick={save}
          disabled={pending || missing}
          className="glow-btn pressable rounded-full px-6 py-2 text-sm font-semibold text-white disabled:opacity-50"
        >
          {pending ? "Saving…" : "Save"}
        </button>
        {saved && !pending && <span className="text-xs text-emerald-300">Saved</span>}
        {missing && <span className="text-xs text-amber-200">Pick one — your points stay held until you do.</span>}
      </div>
    </section>
  );
}
