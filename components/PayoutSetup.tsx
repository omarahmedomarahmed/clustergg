"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Icon from "@/components/Icon";
import { saveServerPayoutPreference, startPayoutOnboarding } from "@/app/actions/payouts";

// Where a server owner tells us how to pay them — and, crucially, where they
// don't tell us anything else.
//
// The form is a preference: a word, a country, a currency. The actual details
// are entered on the payout provider's own page, which opens in the frame
// below when a provider is connected. That frame is a different origin: what
// they type there is posted to the provider and never touches Cluster, so
// there is no version of a breach here that exposes a bank account.
//
// With no provider connected the frame doesn't appear and the panel says so
// plainly. That's honest, and it's a workflow rather than a dead end: staff
// arrange the transfer over the message thread the portal already has.

const METHODS = [
  { key: "bank", label: "Bank transfer", icon: "diamond", note: "Local or international, to your account." },
  { key: "paypal", label: "PayPal", icon: "zap", note: "Fast, nearly everywhere, small fee." },
  { key: "wallet", label: "Mobile wallet", icon: "messages", note: "Where your country has one." },
  { key: "giftcard", label: "Prepaid / gift card", icon: "trophy", note: "No bank account needed." },
  { key: "other", label: "Something else", icon: "spark", note: "Tell us on the thread." },
];

const CURRENCIES = ["USD", "EUR", "GBP", "EGP", "SAR", "AED", "TRY", "INR", "BRL"];

export default function PayoutSetup({
  guildId, method, country, currency, status, providerName, providerConnected,
}: {
  guildId: string;
  method: string | null;
  country: string | null;
  currency: string;
  status: string;
  providerName: string;
  providerConnected: boolean;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [pick, setPick] = useState(method ?? "bank");
  const [msg, setMsg] = useState<{ tone: "ok" | "err"; text: string } | null>(null);
  const [frame, setFrame] = useState<string | null>(null);

  const save = (fd: FormData) => start(async () => {
    setMsg(null);
    const res = await saveServerPayoutPreference(guildId, fd);
    if (res.error) setMsg({ tone: "err", text: res.error });
    else { setMsg({ tone: "ok", text: res.message ?? "Saved." }); router.refresh(); }
  });

  const onboard = () => start(async () => {
    setMsg(null);
    const res = await startPayoutOnboarding(guildId);
    if (res.error) { setMsg({ tone: "err", text: res.error }); return; }
    if (res.url) setFrame(res.url);
    else setMsg({ tone: "ok", text: "Nothing to fill in yet — we'll arrange the transfer with you on the message thread." });
    router.refresh();
  });

  return (
    <div className="glass p-6 space-y-4">
      <div>
        <h2 className="flex items-center gap-2 font-bold">
          <Icon name="link" size={16} className="text-cyan-300" /> Set up your payouts
        </h2>
        <p className="mt-1 text-sm text-muted">
          Two steps, and neither of them asks Cluster for your bank details. Tell us what you&apos;d prefer,
          then — if you want the fastest route — enter your details directly with{" "}
          <b className="text-ink">{providerName}</b>, our payout partner, on their own secure page.
        </p>
      </div>

      {msg && (
        <div className={`rounded-xl border px-3 py-2 text-sm ${
          msg.tone === "ok" ? "border-emerald-400/30 bg-emerald-500/10 text-emerald-200" : "border-rose-400/30 bg-rose-500/10 text-rose-200"}`}>
          {msg.text}
        </div>
      )}

      <form action={save} className="space-y-3">
        <input type="hidden" name="method" value={pick} />
        <div>
          <div className="mb-1.5 text-xs text-muted">1 · How would you like to be paid?</div>
          <div className="grid gap-2 sm:grid-cols-3">
            {METHODS.map((m) => (
              <button key={m.key} type="button" onClick={() => setPick(m.key)}
                className={`rounded-xl border px-3 py-2.5 text-left transition ${
                  pick === m.key ? "border-cyan-400/60 bg-cyan-500/10" : "border-white/12 hover:border-white/25"}`}>
                <div className={`flex items-center gap-2 text-sm font-semibold ${pick === m.key ? "text-cyan-200" : ""}`}>
                  <Icon name={m.icon} size={14} /> {m.label}
                </div>
                <div className="mt-0.5 text-[10px] text-muted">{m.note}</div>
              </button>
            ))}
          </div>
        </div>
        <div className="flex flex-wrap items-end gap-2">
          <label className="text-[10px] uppercase tracking-widest text-muted">
            Country
            <input name="country" defaultValue={country ?? ""} maxLength={2} placeholder="EG"
              className="input-cosmic !py-1 mt-0.5 block w-24 text-xs uppercase" />
          </label>
          <label className="text-[10px] uppercase tracking-widest text-muted">
            Currency
            <select name="currency" defaultValue={currency} className="input-cosmic !py-1 mt-0.5 block w-28 text-xs">
              {CURRENCIES.map((c) => <option key={c} value={c}>{c}</option>)}
            </select>
          </label>
          <button disabled={pending} className="rounded-full bg-cyan-500/25 px-5 py-1.5 text-sm font-bold text-cyan-100 disabled:opacity-50">
            {pending ? "Saving…" : "Save preference"}
          </button>
        </div>
        <p className="text-[11px] text-muted">
          That&apos;s everything we keep. Your country decides which options the provider offers you; nothing
          else on this form can move money.
        </p>
      </form>

      <div className="border-t border-white/10 pt-4">
        <div className="mb-1.5 text-xs text-muted">2 · Where the money actually goes</div>
        {providerConnected ? (
          <>
            <button onClick={onboard} disabled={pending}
              className="pressable inline-flex items-center gap-2 rounded-full px-5 py-2 text-sm font-bold text-white disabled:opacity-50"
              style={{ background: "linear-gradient(90deg,#8b5cf6,#22d3ee)" }}>
              <Icon name="link" size={14} /> {status === "ready" ? `Update your details with ${providerName}` : `Enter your details with ${providerName}`}
            </button>
            {frame && (
              <div className="mt-3 overflow-hidden rounded-2xl border border-white/15">
                <iframe src={frame} title={`${providerName} payout setup`} className="h-[560px] w-full bg-white" />
              </div>
            )}
            <p className="mt-2 text-[11px] text-muted">
              This opens {providerName}&apos;s own form. Everything you type in it goes to them, not to us —
              Cluster receives only a reference that means &quot;the details {providerName} already holds&quot;.
            </p>
          </>
        ) : (
          <p className="text-sm text-muted">
            We haven&apos;t switched on the automated payout partner yet, so we&apos;ll arrange your first
            transfer with you directly on the <b className="text-ink">Messages</b> tab. Nothing about your
            account is stored here either way.
          </p>
        )}
      </div>
    </div>
  );
}
