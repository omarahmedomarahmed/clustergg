// Wallet — earnings, withdrawals, history.
//
// A4 — a payout's total is its lines, and the two lines are the flat share and
// the scored share. They are shown separately on purpose: the flat share is
// what turning up is worth, and an owner who cannot see it concludes that a
// small server earns nothing and stops bothering.
//
// Law 1 — there is no balance column. Everything here is a sum over payout
// rows, computed on read.

import { getDb } from "../../../../../lib/db/index.ts";
import { ownerWallet, ownerOverview } from "../../../../../lib/portal/owner.ts";
import { formatMoney } from "../../../../../lib/money/amounts.ts";
import { demoNow } from "../../../../../lib/site/clock.ts";
import { Panel, Figure, Empty, Money } from "../../../components.tsx";
import { notFound } from "next/navigation";

export const dynamic = "force-dynamic";

const STATUS: Record<string, string> = {
  draft: "Being checked",
  released: "Ready to withdraw",
  paid: "Paid",
  cancelled: "Cancelled",
};

export default async function OwnerWallet({
  params,
  searchParams,
}: {
  params: Promise<{ guildId: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { guildId } = await params;
  const db = await getDb();
  const [payouts, overview] = await Promise.all([
    ownerWallet(db, guildId),
    ownerOverview(db, guildId, demoNow(await searchParams)),
  ]);
  if (!overview) notFound();

  return (
    <div className="flex flex-col gap-6">
      <h1 className="text-2xl font-semibold tracking-tight">Wallet</h1>

      <section className="grid gap-3 sm:grid-cols-2">
        <Figure
          label="Available"
          value={formatMoney(overview.availableCents)}
          note="Released and not yet withdrawn"
          testId="wallet-available"
        />
        <Figure
          label="Earned, ever"
          value={formatMoney(overview.lifetimeEarnedCents)}
        />
      </section>

      <Panel
        title="Every week"
        note="A payout is drafted on Friday and released by a person. Nothing pays itself"
      >
        {payouts.length === 0 ? (
          <Empty>No payouts yet. The first one is drafted the Friday after your first entrant.</Empty>
        ) : (
          payouts.map((p) => (
            <div key={p.id} className="border-b border-line py-3 last:border-0">
              <div className="flex items-center justify-between">
                <span>Week of {p.weekStart.toISOString().slice(0, 10)}</span>
                <span className="flex items-center gap-3 text-sm">
                  <span className="text-mute">{STATUS[p.status] ?? p.status}</span>
                  <Money cents={p.totalCents} />
                </span>
              </div>
              <ul className="mt-1 flex flex-col gap-0.5 text-xs text-mute">
                {p.lines.map((l) => (
                  <li key={l.id} className="flex justify-between">
                    <span>{l.description}</span>
                    <span className="tabular-nums">{formatMoney(l.amountCents)}</span>
                  </li>
                ))}
              </ul>
            </div>
          ))
        )}
      </Panel>

      <p className="text-xs text-mute">
        We never hold your bank details. Your Settings page stores a preference word
        and whatever reference your payment provider gave us — nothing account-shaped,
        which is why a leak of our database is not a leak of your money.
      </p>
    </div>
  );
}
