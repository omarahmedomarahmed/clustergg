"use client";

import { useState, useTransition } from "react";
import Icon from "@/components/Icon";
import { portalConfirmCampaign } from "@/app/actions/brand-portal";

// "We built this for you." B91.10.
//
// A sales conversation ends with somebody typing the deal into the admin
// console — the games, the weeks, the price that was negotiated. Before this,
// what the brand saw next was an invoice for a thing they had never seen a
// screen for. Now they open their portal and the campaign is sitting there,
// with what it costs and what it does, and one button.
//
// The button does NOT take money. It moves the campaign out of draft and tells
// sales to raise the invoice — and nothing announces until that invoice clears.
// That order matters and is stated on the card, because a brand that thinks
// pressing confirm has put them live will ask us why nothing is running.

export type DraftCampaignView = {
  id: string;
  game: string;
  slots: number;
  total: number;
  pricePerChallenge: number;
  startAt: string;
  status: string;
  /** Every game in the package, when it is a mixed one. */
  games: string[];
};

const usd = (n: number) =>
  n.toLocaleString("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 });

export default function BrandDraftCampaigns({ brandId, keyStr, campaigns }: {
  brandId: string;
  keyStr: string;
  campaigns: DraftCampaignView[];
}) {
  if (!campaigns.length) return null;
  return (
    <section className="space-y-4">
      <div>
        <h2 className="flex items-center gap-2 text-lg font-bold">
          <Icon name="spark" size={18} className="text-cyan-300" /> Waiting for you
        </h2>
        <p className="mt-1 text-xs text-muted">
          We built these from what we agreed. Nothing is booked and nothing is billed until you say so.
        </p>
      </div>
      {campaigns.map((c) => <DraftCard key={c.id} brandId={brandId} keyStr={keyStr} c={c} />)}
    </section>
  );
}

function DraftCard({ brandId, keyStr, c }: { brandId: string; keyStr: string; c: DraftCampaignView }) {
  const [pending, start] = useTransition();
  const [msg, setMsg] = useState<{ tone: "ok" | "err"; text: string } | null>(null);
  const [confirmed, setConfirmed] = useState(false);

  const games = [...new Set(c.games.filter(Boolean))];
  const when = new Date(c.startAt).toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" });

  const confirm = () => start(async () => {
    setMsg(null);
    try {
      const r = await portalConfirmCampaign(brandId, keyStr, c.id);
      if (r?.error) { setMsg({ tone: "err", text: r.error }); return; }
      setConfirmed(true);
      setMsg({ tone: "ok", text: r?.message ?? "Confirmed." });
    } catch {
      setMsg({ tone: "err", text: "Something went wrong our end — nothing was confirmed." });
    }
  });

  return (
    <div className="rounded-2xl border border-cyan-400/30 bg-cyan-500/[0.06] p-5">
      <div className="flex flex-wrap items-baseline justify-between gap-3">
        <h3 className="text-lg font-bold">
          {c.slots} weekly challenge{c.slots === 1 ? "" : "s"} on {games.length > 1 ? games.join(", ") : c.game}
        </h3>
        <div className="text-right">
          <div className="text-xl font-black tabular-nums">{usd(c.total)}</div>
          <div className="text-[11px] text-muted">{usd(c.pricePerChallenge)} a week</div>
        </div>
      </div>
      <p className="mt-1.5 text-sm text-muted">
        Starting {when}. Half of what you pay is prize money your audience wins — we never keep it.
      </p>

      {confirmed ? (
        <p className="mt-4 flex items-start gap-1.5 text-sm text-emerald-300">
          <Icon name="check" size={15} className="mt-0.5 shrink-0" />
          <span>{msg?.text}</span>
        </p>
      ) : (
        <>
          <div className="mt-4 flex flex-wrap items-center gap-3">
            <button
              onClick={confirm} disabled={pending}
              className="money-btn pressable rounded-full px-6 py-2 text-sm font-semibold text-white disabled:opacity-50"
            >
              {pending ? "Confirming…" : "Yes — that's what we agreed"}
            </button>
            {/* Said before the click, not after. A brand that thinks confirming
                put them live will ask us why nothing is running. */}
            <span className="text-[11px] leading-relaxed text-muted">
              This confirms the booking. We send the invoice, and nothing goes out to a single server
              until it clears.
            </span>
          </div>
          {msg?.tone === "err" && (
            <p className="mt-3 flex items-start gap-1.5 text-xs text-rose-300">
              <Icon name="alert" size={13} className="mt-0.5 shrink-0" /> <span>{msg.text}</span>
            </p>
          )}
        </>
      )}
    </div>
  );
}
