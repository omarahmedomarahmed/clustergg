"use client";

import { useActionState, useState } from "react";
import Icon from "@/components/Icon";
import { flagEmoji, type Country } from "@/lib/flags";
import { saveProfileAnswers, type OnboardState } from "@/app/actions/onboarding";

// The two answers that decide whether money can reach somebody. B93.
//
// ===== SELECT, THEN READ WHAT IT MEANS, THEN CONFIRM =====
//
// Two choices each, and between choosing and confirming the page tells them
// what the choice does to their account. Not a tooltip and not fine print under
// a submit button: the consequence appears where their eye already is, at the
// moment they have decided but before it is saved.
//
// That order matters because both answers are hard to change later and one of
// them is a legal position. Somebody who picks "under 18" should read "you can
// play and earn, you cannot cash out until you are 18" BEFORE it is true of
// them, not after.
//
// ===== TWO OPTIONS, NOT FIVE =====
//
// Age is over 18 / under 18. Country is "I'm in the US" / "I'm somewhere else",
// and only the second one opens a list. A dropdown of two hundred countries as
// the first thing a new gamer sees is a dropdown most of them close.

export default function ProfileStep({ countries, band, country, done }: {
  countries: Country[];
  band: string | null;
  country: string | null;
  done: boolean;
}) {
  const [state, act, busy] = useActionState<OnboardState | undefined, FormData>(saveProfileAnswers, undefined);
  const [pickedBand, setBand] = useState<string>(band ?? "");
  const [isUs, setIsUs] = useState<"us" | "other" | "">(
    country === "US" ? "us" : country ? "other" : "",
  );
  const [pickedCountry, setCountry] = useState(country && country !== "US" ? country : "");

  const finalCountry = isUs === "us" ? "US" : pickedCountry;
  const ready = !!pickedBand && /^[A-Z]{2}$/.test(finalCountry.toUpperCase());

  if (done) {
    return (
      <p className="flex items-center gap-2 text-sm text-emerald-300">
        <Icon name="check" size={15} />
        {band === "adult" ? "18 or over" : "Under 18"} · {flagEmoji(country ?? "")} {country}
      </p>
    );
  }

  return (
    <form action={act} className="space-y-6">
      <input type="hidden" name="country" value={finalCountry.toUpperCase()} />

      {/* ===== Age ===== */}
      <div>
        <div className="text-[10px] uppercase tracking-widest text-muted">How old are you?</div>
        <div className="mt-2 grid gap-2 sm:grid-cols-2">
          <Choice
            selected={pickedBand === "adult"}
            onSelect={() => setBand("adult")}
            title="18 or over"
            sub="Everything is open"
          />
          <Choice
            selected={pickedBand === "teen"}
            onSelect={() => setBand("teen")}
            title="Under 18"
            sub="Play and earn, cash out later"
          />
        </div>
        <input type="hidden" name="ageBand" value={pickedBand} />

        {/* What the choice DOES, before it is saved. */}
        {pickedBand && (
          <Meaning tone={pickedBand === "adult" ? "good" : "warn"}>
            {pickedBand === "adult" ? (
              <>
                You can play, earn points, win trophies and <b>turn those trophies into money</b>.
                Nothing on Cluster is closed to you.
              </>
            ) : (
              <>
                You can play, earn points and win trophies, and they stay on your profile forever.
                What you <b>cannot</b> do is turn a trophy into cash until you turn 18 — being paid
                is a contract, and a contract with someone under 18 is not one we are allowed to
                make. Nothing you win is lost; it waits.
              </>
            )}
          </Meaning>
        )}
      </div>

      {/* ===== Country ===== */}
      <div>
        <div className="text-[10px] uppercase tracking-widest text-muted">Where are you?</div>
        <div className="mt-2 grid gap-2 sm:grid-cols-2">
          <Choice
            selected={isUs === "us"}
            onSelect={() => { setIsUs("us"); setCountry(""); }}
            title="I'm in the United States"
            sub="🇺🇸"
          />
          <Choice
            selected={isUs === "other"}
            onSelect={() => setIsUs("other")}
            title="I'm somewhere else"
            sub="Pick your country next"
          />
        </div>

        {isUs === "other" && (
          <label className="mt-3 block max-w-sm text-[10px] uppercase tracking-widest text-muted">
            Your country
            <select
              value={pickedCountry}
              onChange={(e) => setCountry(e.target.value)}
              className="input-cosmic mt-1 w-full"
            >
              <option value="">Pick your country…</option>
              {countries.filter((c) => c.code !== "US").map((c) => (
                <option key={c.code} value={c.code}>{flagEmoji(c.code)} {c.name}</option>
              ))}
            </select>
          </label>
        )}

        {isUs && (
          <Meaning tone="info">
            {isUs === "us" ? (
              <>
                Your prize money is paid in the US. Above <b>$2,000</b> in a year we have to report
                it — said here rather than in a surprise form the day you try to collect.
              </>
            ) : (
              <>
                Your prizes are paid through our international entity, so <b>you cash out the same
                way everybody else does</b>. We ask because the route the money takes depends on it,
                and because it is the flag beside your name on every leaderboard.
              </>
            )}
          </Meaning>
        )}
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <button
          disabled={busy || !ready}
          className="money-btn pressable rounded-full px-6 py-2.5 text-sm font-semibold text-white disabled:opacity-40"
        >
          {busy ? "Saving…" : "Confirm both"}
        </button>
        <span className="text-[11px] text-muted">
          You can change your country later. Your age can be changed twice, then it locks.
        </span>
      </div>

      {state?.error && (
        <p className="flex items-start gap-1.5 text-xs text-rose-300">
          <Icon name="alert" size={13} className="mt-0.5 shrink-0" /> <span>{state.error}</span>
        </p>
      )}
    </form>
  );
}

function Choice({ selected, onSelect, title, sub }: {
  selected: boolean; onSelect: () => void; title: string; sub: string;
}) {
  return (
    <button
      type="button"
      onClick={onSelect}
      aria-pressed={selected}
      className={`rounded-2xl border p-4 text-left transition ${
        selected
          ? "border-cyan-300/70 bg-cyan-400/10 ring-1 ring-cyan-300/40"
          : "border-white/12 bg-black/25 hover:border-white/25"
      }`}
    >
      <div className="flex items-center gap-2">
        <span className={`grid h-4 w-4 shrink-0 place-items-center rounded-full border ${
          selected ? "border-cyan-300 bg-cyan-300" : "border-white/25"
        }`}>
          {selected && <Icon name="check" size={9} className="text-[#04051a]" />}
        </span>
        <span className="font-bold">{title}</span>
      </div>
      <div className="mt-1 pl-6 text-xs text-muted">{sub}</div>
    </button>
  );
}

function Meaning({ tone, children }: { tone: "good" | "warn" | "info"; children: React.ReactNode }) {
  const c = tone === "good"
    ? "border-emerald-400/30 bg-emerald-500/[0.07] text-emerald-100"
    : tone === "warn"
      ? "border-amber-400/30 bg-amber-500/[0.07] text-amber-100"
      : "border-cyan-400/25 bg-cyan-500/[0.06] text-cyan-100";
  return (
    <p className={`mt-3 rounded-xl border px-4 py-3 text-xs leading-relaxed ${c}`}>
      <b className="mr-1.5 uppercase tracking-widest opacity-80">What this means</b>
      {children}
    </p>
  );
}
