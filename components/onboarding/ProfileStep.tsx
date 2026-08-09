"use client";

import { useActionState, useState } from "react";
import Icon from "@/components/Icon";
import VerifiedMarkIcon from "@/components/VerifiedMark";
import { flagEmoji, type Country } from "@/lib/flags";
import { markFor } from "@/lib/verified-mark";
import { saveProfileAnswers, type OnboardState } from "@/app/actions/onboarding";
import UnderThirteen from "@/components/onboarding/UnderThirteen";

// The three answers that make an account real. B93 → B95/B96/B97.
//
// ===== SELECT, THEN READ WHAT IT MEANS, THEN CONFIRM =====
//
// Two of these are hard to change and one of them is a legal position, so
// between choosing and confirming the page says what the choice does. Not a
// tooltip and not fine print under a submit button: the consequence appears
// where their eye already is, at the moment they have decided but before it is
// saved.
//
// Somebody who picks "13 to 17" should read "you can play and earn, you cannot
// cash out until you are 18" BEFORE it is true of them, not after.
//
// ===== TWO AGE OPTIONS, AND UNDER-13 IS NOT ONE OF THEM =====
//
// A third button that visibly ends the fun teaches a twelve-year-old to press
// one of the other two. So there are two buttons and, underneath, a line of
// text. Pressing it selects nothing — it opens the explanation. See
// lib/under13.ts, where the reasoning is written down properly.
//
// ===== WHY THE THEME IS HERE AND THE AVATAR IS NOT =====
//
// The mandatory part of "make it yours" is the part that shows up where other
// people see them: the flag, the tick and the colours on their card. An avatar
// and a bio are better done later, from a profile page, by somebody who has
// decided to stay. Three questions with a live preview beside them is a minute;
// a profile builder at signup is a wall.

const THEMES: { key: string; name: string; bg: string; panel: string; accent: string; accent2: string }[] = [
  { key: "cosmic", name: "Cosmic", bg: "#04051a", panel: "#0b0d26", accent: "#8b5cf6", accent2: "#22d3ee" },
  { key: "midnight", name: "Midnight", bg: "#07080f", panel: "#10131f", accent: "#3b82f6", accent2: "#6366f1" },
  { key: "cyber", name: "Cyber", bg: "#0a0014", panel: "#160a24", accent: "#22d3ee", accent2: "#ff00ff" },
  { key: "aurora", name: "Aurora", bg: "#03120d", panel: "#0a1f18", accent: "#10b981", accent2: "#22d3ee" },
  { key: "crimson", name: "Crimson", bg: "#140406", panel: "#240a10", accent: "#f43f5e", accent2: "#fb923c" },
  { key: "gold", name: "Champion", bg: "#0d0a02", panel: "#1a1405", accent: "#fbbf24", accent2: "#f59e0b" },
  { key: "sakura", name: "Sakura", bg: "#160610", panel: "#260a1c", accent: "#f472b6", accent2: "#c084fc" },
  { key: "light", name: "Daylight", bg: "#f4f5fb", panel: "#ffffff", accent: "#7c3aed", accent2: "#0891b2" },
];

export default function ProfileStep({ countries, band, country, theme, done, name, avatarUrl }: {
  countries: Country[];
  band: string | null;
  country: string | null;
  /** The template key already on the account, if any. */
  theme: string | null;
  done: boolean;
  name: string;
  avatarUrl: string | null;
}) {
  const [state, act, busy] = useActionState<OnboardState | undefined, FormData>(saveProfileAnswers, undefined);
  const [pickedBand, setBand] = useState<string>(band ?? "");
  const [isUs, setIsUs] = useState<"us" | "other" | "">(
    country === "US" ? "us" : country ? "other" : "",
  );
  const [pickedCountry, setCountry] = useState(country && country !== "US" ? country : "");
  const [pickedTheme, setTheme] = useState(theme ?? "cosmic");
  const [showMark, setShowMark] = useState(true);

  const finalCountry = (isUs === "us" ? "US" : pickedCountry).toUpperCase();
  const ready = !!pickedBand && /^[A-Z]{2}$/.test(finalCountry) && !!pickedTheme;
  const skin = THEMES.find((t) => t.key === pickedTheme) ?? THEMES[0];

  if (done) {
    return (
      <p className="flex items-center gap-2 text-sm text-emerald-300">
        <Icon name="check" size={15} />
        {band === "adult" ? "18 or over" : "13 to 17"} · {flagEmoji(country ?? "")} {country}
      </p>
    );
  }

  return (
    <div className="grid gap-6 lg:grid-cols-[1fr_15rem]">
      <form action={act} className="space-y-6">
        <input type="hidden" name="country" value={finalCountry} />
        <input type="hidden" name="ageBand" value={pickedBand} />
        <input type="hidden" name="theme" value={pickedTheme} />
        <input type="hidden" name="showAgeMark" value={showMark ? "1" : "0"} />

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
              title="13 to 17"
              sub="Play and earn, cash out later"
            />
          </div>

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
                  make. Nothing you win is lost; it waits, and it is all still there on your
                  eighteenth birthday.
                </>
              )}
            </Meaning>
          )}

          {/* NOT A THIRD OPTION. A link, and it does not select anything. */}
          <UnderThirteen />

          <p className="mt-2 text-[11px] text-muted">
            You answer this once. If you get it wrong, gamer support in our HQ server can fix it —
            it is not something you can change yourself.
          </p>
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

        {/* ===== Theme ===== */}
        <div>
          <div className="text-[10px] uppercase tracking-widest text-muted">Pick your colours</div>
          <p className="mt-1 text-xs text-muted">
            This is what your profile and your Discord card look like. Change it whenever you like —
            unlike the other two, nothing depends on it.
          </p>
          <div className="mt-2 grid grid-cols-4 gap-2 sm:grid-cols-4">
            {THEMES.map((t) => (
              <button
                key={t.key}
                type="button"
                onClick={() => setTheme(t.key)}
                aria-pressed={pickedTheme === t.key}
                title={t.name}
                className={`overflow-hidden rounded-xl border p-2 text-left transition ${
                  pickedTheme === t.key
                    ? "border-cyan-300/70 ring-1 ring-cyan-300/40"
                    : "border-white/12 hover:border-white/25"
                }`}
                style={{ background: t.bg }}
              >
                <span className="flex gap-1">
                  <span className="h-3 w-3 rounded-full" style={{ background: t.accent }} />
                  <span className="h-3 w-3 rounded-full" style={{ background: t.accent2 }} />
                </span>
                <span className="mt-1.5 block truncate text-[10px] font-semibold" style={{ color: "#fff" }}>
                  {t.name}
                </span>
              </button>
            ))}
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <button
            disabled={busy || !ready}
            className="money-btn pressable rounded-full px-6 py-2.5 text-sm font-semibold text-white disabled:opacity-40"
          >
            {busy ? "Saving…" : "Confirm and finish"}
          </button>
          <span className="text-[11px] text-muted">
            Your country and your colours you can change later. Your age you cannot.
          </span>
        </div>

        {state?.error && (
          <p className="flex items-start gap-1.5 text-xs text-rose-300">
            <Icon name="alert" size={13} className="mt-0.5 shrink-0" /> <span>{state.error}</span>
          </p>
        )}
      </form>

      {/* ===== The live card =====
          Every choice on the left changes something visible here. It is the same
          card the bot draws in a server, so what they set up IS what people see —
          not an approximation with a "preview" label on it. */}
      <div className="lg:sticky lg:top-24 lg:self-start">
        <div className="text-[10px] uppercase tracking-widest text-muted">Your card</div>
        <div
          className="mt-2 overflow-hidden rounded-2xl border border-white/10"
          style={{ background: skin.bg }}
        >
          <div className="h-14" style={{ background: `linear-gradient(120deg, ${skin.accent}, ${skin.accent2})` }} />
          <div className="-mt-7 px-4 pb-4">
            <div
              className="grid h-14 w-14 place-items-center rounded-full border-2 text-lg font-black"
              style={{ background: skin.panel, borderColor: skin.bg, color: skin.accent }}
            >
              {avatarUrl
                // eslint-disable-next-line @next/next/no-img-element
                ? <img src={avatarUrl} alt="" className="h-full w-full rounded-full object-cover" />
                : name.slice(0, 1).toUpperCase()}
            </div>
            <div className="mt-2 flex items-center gap-1.5">
              <span className="truncate text-sm font-bold" style={{ color: "#fff" }}>{name}</span>
              <VerifiedMarkIcon
                mark={showMark ? markFor({ ageBand: pickedBand, unlockedAt: new Date(), showAgeMark: true }) : null}
                size={13}
              />
            </div>
            <div className="mt-1 flex flex-wrap items-center gap-1.5 text-[11px]">
              {finalCountry && (
                <span
                  className="rounded-full px-2 py-0.5"
                  style={{ background: `${skin.accent}22`, color: "#fff" }}
                >
                  {flagEmoji(finalCountry)} {finalCountry}
                </span>
              )}
              <span
                className="rounded-full px-2 py-0.5"
                style={{ background: `${skin.accent2}22`, color: "#fff" }}
              >
                0 CP
              </span>
            </div>
          </div>
        </div>

        {/* The tick is theirs to hide, and the switch is next to the thing it
            hides rather than buried in settings where nobody would find it. */}
        {pickedBand && (
          <label className="mt-3 flex cursor-pointer items-start gap-2 text-[11px] leading-relaxed text-muted">
            <input
              type="checkbox"
              checked={showMark}
              onChange={(e) => setShowMark(e.target.checked)}
              className="mt-0.5"
            />
            <span>
              Show the confirmed tick on my profile and cards.
              {" "}{pickedBand === "adult"
                ? "Yours is gold."
                : "Yours is blue. It never says your age — only that your account is confirmed."}
            </span>
          </label>
        )}
      </div>
    </div>
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
