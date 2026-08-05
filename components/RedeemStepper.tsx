"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter, useSearchParams, usePathname } from "next/navigation";
import Link from "next/link";
import Icon from "@/components/Icon";
import { requestRedeem } from "@/app/actions/trophies";
import type { TrophyAward, RedeemView } from "@/lib/trophies";

// The cash-out stepper (B6).
//
// The state lives in the URL, not in this component. That is the whole design:
// a popup could not be refreshed, linked, or sent to support, and a phone
// rotating remounted the tree and lost the selection. `?step=` and `?t=` mean
// the back button works because it is just navigation, and a reload lands you
// exactly where you were because there is nowhere else to land.
//
// The payment position, restated at the step where it matters rather than in a
// footer: we ask HOW you want to be paid — one word — and never where. The
// destination is chosen by you, on the provider's own page, after staff release
// the money. There is no field on any step of this flow that could hold an
// account number, and `tests/ui/redeem-flow.mjs` asserts that by inspecting
// every input name and placeholder on every step.

const STEPS = ["trophies", "method", "confirm", "done"] as const;
type Step = (typeof STEPS)[number];

const METHODS: { key: string; label: string; icon: string; note: string }[] = [
  { key: "bank", label: "Bank transfer", icon: "diamond", note: "Straight to your bank, wherever you are." },
  { key: "paypal", label: "PayPal", icon: "zap", note: "Fast, works almost everywhere." },
  { key: "wallet", label: "Mobile wallet", icon: "messages", note: "Vodafone Cash, InstaPay and the like." },
  { key: "giftcard", label: "Gift / prepaid card", icon: "trophy", note: "No bank account needed." },
  { key: "other", label: "Something else", icon: "spark", note: "Tell us and we'll sort it." },
];

const CURRENCIES = ["USD", "EUR", "GBP", "EGP", "BRL", "INR", "JPY"];
const money = (n: number) => `$${(Math.round(n * 100) / 100).toLocaleString("en-US", { minimumFractionDigits: 2 })}`;

export default function RedeemStepper({
  step: stepParam, picked, held, heldTotal, redeems, savedMethod, changesUsed, knownCountry, knowsAge,
}: {
  step: string;
  picked: string[];
  held: TrophyAward[];
  heldTotal: number;
  redeems: RedeemView[];
  savedMethod: { currency: string; method: string } | null;
  changesUsed: number;
  knownCountry: string | null;
  knowsAge: boolean;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();

  // The step comes from `useSearchParams`, NOT from the server prop.
  //
  // Found in a browser, not reasoned about: with the step read off the page's
  // `searchParams`, the browser BACK button changed the URL and left the same
  // step rendered. Next serves `/redeem` from the client router cache on a soft
  // navigation, so the server component does not re-run and its prop is stale.
  // `useSearchParams` is reactive to the URL itself, so back and forward work
  // for the same reason a link does. The prop survives only as the SSR seed for
  // the very first paint.
  const stepFromUrl = params.get("step") ?? stepParam;
  // An unknown or missing `?step=` is step one rather than an error page —
  // somebody landing on /redeem from a link has not done anything wrong.
  const step: Step = (STEPS as readonly string[]).includes(stepFromUrl) ? (stepFromUrl as Step) : "trophies";

  // The selection is whatever the URL says, filtered against what is actually
  // still held. A link from yesterday naming a trophy already cashed out drops
  // that trophy rather than 500ing or, worse, submitting it.
  const byId = useMemo(() => new Map(held.map((a) => [a.id, a])), [held]);

  // …but held LOCALLY as well, seeded from the URL.
  //
  // Reading it straight off `useSearchParams` was correct and felt broken: this
  // page is `force-dynamic`, so every `router.replace` is a server round trip
  // and a checkbox took about a second to tick. Measured in a browser, not
  // guessed. The URL is still the source of truth for a refresh, a link and the
  // back button — it is just no longer in the path between a tap and the tick.
  const urlIds = params.has("t") ? (params.get("t") ?? "").split(",").filter(Boolean) : picked;
  const urlSel = urlIds.filter((id) => byId.has(id));
  const [localSel, setLocalSel] = useState<string[] | null>(null);
  // A real navigation (back/forward, or a pasted link) has to win over a stale
  // local list, so the key resets it whenever the URL's own selection changes.
  const urlKey = urlSel.join(",");
  const [seenKey, setSeenKey] = useState(urlKey);
  if (urlKey !== seenKey) { setSeenKey(urlKey); setLocalSel(null); }
  const selected = localSel ?? urlSel;
  const selTotal = Math.round(selected.reduce((s, id) => s + (byId.get(id)?.value ?? 0), 0) * 100) / 100;

  const [method, setMethod] = useState(
    METHODS.some((m) => m.key === savedMethod?.method) ? savedMethod!.method : "bank");
  const [currency, setCurrency] = useState(savedMethod?.currency || "USD");
  const [country, setCountry] = useState(knownCountry ?? "");
  const [birthDate, setBirthDate] = useState("");
  const [needs, setNeeds] = useState<("age" | "country")[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  const locked = changesUsed >= 3;

  const go = (next: Step, ids = selected) => {
    const q = new URLSearchParams(params.toString());
    q.set("step", next);
    if (ids.length) q.set("t", ids.join(",")); else q.delete("t");
    router.push(`${pathname}?${q}`);
  };

  const toggle = (id: string) => {
    const next = selected.includes(id) ? selected.filter((x) => x !== id) : [...selected, id];
    setLocalSel(next);            // instant
    setSeenKey(next.join(","));   // …and do not let our own URL update undo it
    const q = new URLSearchParams(params.toString());
    q.set("step", "trophies");
    if (next.length) q.set("t", next.join(",")); else q.delete("t");
    // `replace`, so ticking six boxes does not leave six entries in the back
    // history between here and the wallet.
    router.replace(`${pathname}?${q}`);
  };

  const submit = () => {
    setError(null);
    start(async () => {
      const res = await requestRedeem({
        awardIds: selected, currency, method,
        ...(country ? { country } : {}),
        ...(birthDate ? { birthDate } : {}),
      });
      if (res.error) {
        setError(res.error);
        setNeeds(res.needs ?? []);
        // Back to the step that can fix it. Being told "we cannot pay your
        // country" on a confirm screen with no country field is a dead end.
        if (res.needs?.length) go("method");
        return;
      }
      go("done", []);
      router.refresh();
    });
  };

  const stepIndex = STEPS.indexOf(step);

  return (
    <div className="space-y-4" data-redeem-step={step}>
      {/* Where you are. Clickable backwards only — you cannot skip to confirm
          without having chosen anything, which would be a confirm screen with
          nothing on it. */}
      <ol className="flex items-center gap-1 text-[11px] font-semibold">
        {STEPS.map((s, i) => {
          const label = ["Choose trophies", "How you're paid", "Confirm", "Submitted"][i];
          const done = i < stepIndex;
          const here = i === stepIndex;
          return (
            <li key={s} className="flex flex-1 items-center gap-1">
              <button type="button" disabled={!done}
                onClick={() => done && go(s)}
                className={`flex-1 truncate rounded-full px-2.5 py-1.5 text-center transition ${
                  here ? "bg-cyan-500/25 text-cyan-100"
                  : done ? "bg-white/5 text-muted hover:text-ink"
                  : "bg-white/[0.03] text-muted/50"}`}>
                <span className="mr-1 opacity-60">{i + 1}</span>{label}
              </button>
            </li>
          );
        })}
      </ol>

      {error && (
        <div className="rounded-xl border border-rose-400/30 bg-rose-500/10 px-4 py-2.5 text-sm text-rose-200">{error}</div>
      )}

      {/* ---- 1. Choose trophies ---- */}
      {step === "trophies" && (
        <section className="glass space-y-3 p-4">
          <div className="flex items-baseline justify-between gap-3">
            <h2 className="text-sm font-bold">Which trophies?</h2>
            <span className="text-xs text-muted">{money(heldTotal)} available</span>
          </div>

          {held.length === 0 ? (
            <div className="rounded-xl border border-white/10 p-6 text-center text-sm text-muted">
              Nothing to cash out yet. Win a challenge, or{" "}
              <Link href="/marketplace" className="text-cyan-300 hover:underline">buy a trophy with your points</Link>.
            </div>
          ) : (
            <>
              <div className="grid gap-2 sm:grid-cols-2">
                {held.map((a) => {
                  const on = selected.includes(a.id);
                  return (
                    <button key={a.id} type="button" onClick={() => toggle(a.id)} data-award={a.id}
                      aria-pressed={on}
                      className={`flex items-center gap-3 rounded-xl border p-2.5 text-left transition ${
                        on ? "border-emerald-400/50 bg-emerald-500/10" : "border-white/10 hover:border-white/25"}`}>
                      <div className="h-11 w-11 shrink-0 rounded-lg bg-black/40 p-1">
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img src={a.imageUrl} alt="" className="h-full w-full object-contain" />
                      </div>
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-sm font-semibold">{a.name}</span>
                        <span className="block truncate text-[11px] text-muted">{a.challengeTitle ?? "Bought on the marketplace"}</span>
                      </span>
                      <span className="shrink-0 text-sm font-black text-amber-200">{money(a.value)}</span>
                      <Icon name={on ? "check" : "chevronRight"} size={14}
                        className={on ? "text-emerald-300" : "text-muted"} />
                    </button>
                  );
                })}
              </div>
              <div className="flex items-center justify-between gap-3 border-t border-white/8 pt-3">
                <div className="text-sm">
                  <span className="text-muted">Selected </span>
                  <b className="text-emerald-200" data-sel-total>{money(selTotal)}</b>
                  <span className="text-muted"> · {selected.length} {selected.length === 1 ? "trophy" : "trophies"}</span>
                </div>
                <button type="button" disabled={selected.length === 0} onClick={() => go("method")}
                  data-next
                  className="rounded-full bg-cyan-500/25 px-5 py-2 text-xs font-black text-cyan-100 disabled:cursor-not-allowed disabled:opacity-40">
                  Next
                </button>
              </div>
            </>
          )}
        </section>
      )}

      {/* ---- 2. How you want to be paid ---- */}
      {step === "method" && (
        <section className="glass space-y-3 p-4">
          <h2 className="text-sm font-bold">How would you like to be paid?</h2>
          <p className="text-xs text-muted">
            One word, and that is all we ever store. You choose the actual destination yourself,
            on the payout provider&apos;s own page, after this is approved.
          </p>

          {locked && (
            <div className="rounded-xl border border-amber-400/30 bg-amber-500/10 px-3 py-2 text-xs text-amber-200">
              Your preference is locked after three changes. Message support to update it — this request
              will use {savedMethod?.method}.
            </div>
          )}

          <div className="grid gap-2 sm:grid-cols-2">
            {METHODS.map((m) => (
              <button key={m.key} type="button" disabled={locked} onClick={() => setMethod(m.key)}
                data-method={m.key} aria-pressed={method === m.key}
                className={`flex items-start gap-2.5 rounded-xl border p-3 text-left transition ${
                  method === m.key ? "border-cyan-400/50 bg-cyan-500/10" : "border-white/10 hover:border-white/25"} disabled:opacity-50`}>
                <Icon name={m.icon} size={15} className="mt-0.5 shrink-0 text-cyan-300" />
                <span>
                  <span className="block text-sm font-semibold">{m.label}</span>
                  <span className="block text-[11px] text-muted">{m.note}</span>
                </span>
              </button>
            ))}
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <label className="block">
              <span className="mb-1 block text-[11px] font-semibold text-muted">Currency</span>
              <select value={currency} onChange={(e) => setCurrency(e.target.value)} name="currency"
                className="input-cosmic w-full text-sm">
                {CURRENCIES.map((c) => <option key={c} value={c}>{c}</option>)}
              </select>
            </label>

            {/* Asked for HERE and nowhere else (B37) — being paid has an age and
                a country gate; playing does not. Only shown when the server has
                said it needs them. */}
            {(needs.includes("country") || !knownCountry) && (
              <label className="block">
                <span className="mb-1 block text-[11px] font-semibold text-muted">Country</span>
                <input name="country" value={country} maxLength={2} placeholder="US"
                  onChange={(e) => setCountry(e.target.value.toUpperCase())}
                  className="input-cosmic w-full text-sm uppercase" />
              </label>
            )}
            {(needs.includes("age") || !knowsAge) && (
              <label className="block">
                <span className="mb-1 block text-[11px] font-semibold text-muted">Date of birth</span>
                <input name="birthDate" type="date" value={birthDate}
                  onChange={(e) => setBirthDate(e.target.value)}
                  className="input-cosmic w-full text-sm" />
                <span className="mt-1 block text-[10px] text-muted">Asked once, only because paying you out has an age limit.</span>
              </label>
            )}
          </div>

          <div className="flex items-center justify-between gap-3 border-t border-white/8 pt-3">
            <button type="button" onClick={() => go("trophies")} data-back
              className="rounded-full bg-white/5 px-4 py-2 text-xs font-semibold text-muted hover:text-ink">Back</button>
            <button type="button" onClick={() => go("confirm")} data-next
              className="rounded-full bg-cyan-500/25 px-5 py-2 text-xs font-black text-cyan-100">Next</button>
          </div>
        </section>
      )}

      {/* ---- 3. Confirm ---- */}
      {step === "confirm" && (
        <section className="glass space-y-3 p-4">
          <h2 className="text-sm font-bold">Everything in one place before you send it</h2>

          <div className="divide-y divide-white/5 rounded-xl border border-white/10">
            {selected.map((id) => {
              const a = byId.get(id)!;
              return (
                <div key={id} className="flex items-center gap-3 px-3 py-2">
                  <div className="h-8 w-8 shrink-0 rounded bg-black/40 p-0.5">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={a.imageUrl} alt="" className="h-full w-full object-contain" />
                  </div>
                  <span className="min-w-0 flex-1 truncate text-sm">{a.name}</span>
                  <span className="text-sm font-bold text-amber-200">{money(a.value)}</span>
                </div>
              );
            })}
            <div className="flex items-center justify-between px-3 py-2.5">
              <span className="text-sm font-semibold">Total</span>
              <span className="text-lg font-black text-emerald-200" data-total>{money(selTotal)} {currency}</span>
            </div>
          </div>

          <div className="rounded-xl border border-white/10 px-3 py-2.5 text-sm">
            <span className="text-muted">Paid by </span>
            <b data-method-summary>{METHODS.find((m) => m.key === method)?.label ?? method}</b>
            <span className="text-muted"> · in {currency}</span>
          </div>

          <p className="text-[11px] leading-relaxed text-muted">
            <Icon name="check" size={11} className="mr-1 inline text-emerald-300" />
            Spending or cashing out points never lowers your level.
            <br />
            <Icon name="check" size={11} className="mr-1 inline text-emerald-300" />
            We never see your bank details — you pick where the money goes on the provider&apos;s page.
          </p>

          <div className="flex items-center justify-between gap-3 border-t border-white/8 pt-3">
            <button type="button" onClick={() => go("method")} data-back
              className="rounded-full bg-white/5 px-4 py-2 text-xs font-semibold text-muted hover:text-ink">Back</button>
            <button type="button" onClick={submit} disabled={pending || selected.length === 0} data-submit
              className="rounded-full bg-emerald-500/25 px-5 py-2.5 text-xs font-black text-emerald-100 disabled:opacity-40">
              {pending ? "Sending…" : `Cash out ${money(selTotal)}`}
            </button>
          </div>
        </section>
      )}

      {/* ---- 4. Submitted, and where to collect ---- */}
      {step === "done" && (
        <section className="glass space-y-3 p-4">
          <div className="rounded-xl border border-emerald-400/30 bg-emerald-500/10 px-4 py-3 text-sm text-emerald-200">
            <Icon name="check" size={14} className="mr-1.5 inline" />
            Sent. Staff review every payout by hand — you will get an email the moment it moves.
          </div>

          <h2 className="text-sm font-bold">Your requests</h2>
          {redeems.length === 0 ? (
            <p className="text-xs text-muted">Nothing here yet.</p>
          ) : (
            <div className="divide-y divide-white/5 rounded-xl border border-white/10">
              {redeems.map((r) => (
                <div key={r.id} className="flex flex-wrap items-center gap-2 px-3 py-2.5" data-redeem={r.id}>
                  <span className="text-sm font-bold text-amber-200">{money(r.amount)} {r.currency}</span>
                  <span className="rounded-full border border-white/12 px-2 py-0.5 text-[10px] uppercase tracking-wider text-muted">
                    {r.status}
                  </span>
                  <span className="flex-1" />
                  {r.collectUrl && r.status === "sent" && (
                    <a href={r.collectUrl} target="_blank" rel="noreferrer"
                      className="rounded-full bg-emerald-500/25 px-3 py-1 text-[11px] font-bold text-emerald-100">
                      Collect it
                    </a>
                  )}
                </div>
              ))}
            </div>
          )}

          <div className="flex gap-2 border-t border-white/8 pt-3">
            <Link href="/wallet" className="rounded-full bg-white/5 px-4 py-2 text-xs font-semibold text-muted hover:text-ink">
              Back to wallet
            </Link>
            <Link href="/redeem" className="rounded-full bg-cyan-500/25 px-4 py-2 text-xs font-black text-cyan-100">
              Cash out more
            </Link>
          </div>
        </section>
      )}
    </div>
  );
}
