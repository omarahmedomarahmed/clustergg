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
import { serverWithdrawVerdict } from "../../../../../lib/portal/session.ts";
import { formatMoney } from "../../../../../lib/money/amounts.ts";
import { demoNow } from "../../../../../lib/site/clock.ts";
import { Panel, Figure, Empty, Money } from "../../../components.tsx";
import { Button } from "../../../../ui.tsx";
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
  const [payouts, overview, verdict] = await Promise.all([
    ownerWallet(db, guildId),
    ownerOverview(db, guildId, demoNow(await searchParams)),
    serverWithdrawVerdict(guildId),
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
          help={
            <p>
              Only the Discord <strong>guild owner</strong> can withdraw. Administrators
              and mapped roles see everything here and cannot move it — one person
              touches the money, and that is the whole of the rule.
            </p>
          }
          testId="wallet-available"
        />
        <Figure
          label="Earned, ever"
          value={formatMoney(overview.lifetimeEarnedCents)}
        />
      </section>

      {/* ===== 09 BAND 2 SHOT 4a — DISABLED WITH A REASON, NOT HIDDEN =====

          A missing button is a support ticket. A disabled one carrying the
          rule's own words is an answer. The verdict comes from `mayWithdraw`,
          which is four gates and not one: an administrator, a 13–17 owner, an
          owner with no country set and an owner inside T4's seven-day transfer
          freeze each get the sentence that applies to them.

          The page composes none of that wording. It had a paragraph of help
          text saying "only the guild owner can withdraw" and consulted
          nothing — the sentence was true and the button was absent for
          everybody, including the owner. */}
      {/* No self-serve withdrawal *action* is ratified. 02 §2's flow is
          drafted at the close → released by a person → marked paid, and 04 §2
          lists this page as "earnings, withdrawals, history" with no button
          that moves money. So none is invented here: the button carries the
          verdict and the state, and the money still moves the way 02 says. */}
      <Panel title="Withdraw" note="One person touches the money">
        <Button
          type="button"
          disabled
          data-testid="withdraw"
          data-allowed={verdict.allowed ? "1" : "0"}
        >
          Withdraw {verdict.allowed ? formatMoney(overview.availableCents) : ""}
        </Button>
        <p className="mt-2 text-sm text-mute" data-testid="withdraw-reason">
          {verdict.allowed
            ? "Your payout is drafted at Friday's close and released by a person — " +
              "nothing on this platform pays itself. It lands by your payout preference " +
              "in Settings."
            : verdict.reason}
        </p>
      </Panel>

      <Panel
        title="Every week"
        note="A payout is drafted on Friday and released by a person. Nothing pays itself"
        help={
          <p>
            The close <strong>computes</strong>; a human <strong>releases</strong>. A
            job that moved money on its own is one nobody could stop on a Sunday, so
            no job on this platform does.
          </p>
        }
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
