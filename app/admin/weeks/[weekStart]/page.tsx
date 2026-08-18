// One week in full — every server that took part, eligible or not.
//
// 05 §6 rule 1 — an **ineligible** server appears with its reason spelled out,
// field by field. This page exists to answer *"why did I earn nothing?"*
// without anybody recomputing anything.
//
// Both sides of every ratio are shown, because a stored ratio nobody can
// reconstruct is a number an owner has to take on faith.

import { notFound } from "next/navigation";
import { getDb } from "../../../../lib/db/index.ts";
import { weekRecordsFor, reconcileCredits } from "../../../../lib/pool/record.ts";
import { formatMoney } from "../../../../lib/money/amounts.ts";
import { Panel } from "../../../ui.tsx";

export const dynamic = "force-dynamic";

export default async function OneWeekPage({
  params,
}: {
  params: Promise<{ weekStart: string }>;
}) {
  const { weekStart } = await params;
  const when = new Date(`${weekStart}T00:00:00.000Z`);
  if (Number.isNaN(when.getTime())) notFound();

  const db = await getDb();
  const records = await weekRecordsFor(db, when);
  if (records.length === 0) notFound();
  const reconciliation = await reconcileCredits(db, when);
  const mismatches = reconciliation.filter((r) => !r.ok);

  return (
    <div className="flex flex-col gap-6" data-testid="one-week">
      <h1 className="text-2xl font-semibold tracking-tight">
        Week of {weekStart}
      </h1>

      {mismatches.length > 0 ? (
        <Panel>
          {/* W4, checked. A mismatch is shown as the defect it is — recomputing
              it would hide exactly the thing the invariant is for. */}
          <p className="text-sm text-red-400" data-testid="credit-mismatch">
            {mismatches.length} server{mismatches.length === 1 ? "" : "s"} whose
            per-challenge credits do not add up to the recorded total. Raise
            this — do not recompute it.
          </p>
        </Panel>
      ) : null}

      <Panel>
        <ul className="flex flex-col gap-4">
          {records.map((r) => (
            <li key={r.id} className="text-sm">
              <div className="flex items-baseline justify-between gap-4">
                <a
                  className="underline"
                  href={`/admin/weeks/${weekStart}/${r.guildId}`}
                >
                  {/* W5 — the name as it was, not as it is now. */}
                  {r.guildName}
                </a>
                <span className="text-mute">
                  {r.eligible
                    ? `#${r.rank} of ${r.serversInPool} · ${formatMoney(r.totalCents)}`
                    : "not in the pool · nothing"}
                </span>
              </div>

              {r.eligible ? (
                <p className="mt-1 text-xs text-mute">
                  {r.entrants.toFixed(1)} entrants · conversion{" "}
                  {r.conversionNumerator}/{r.conversionDenominator} ={" "}
                  {(r.conversion * 100).toFixed(1)}% · activation{" "}
                  {r.activationNumerator.toFixed(1)}/{r.activationDenominator.toFixed(1)} ={" "}
                  {(r.activation * 100).toFixed(0)}% · flat{" "}
                  {formatMoney(r.flatShareCents)} + scored{" "}
                  {formatMoney(r.scoredShareCents)}
                </p>
              ) : (
                <p className="mt-1 text-xs text-mute" data-testid="ineligible-reason">
                  {r.ineligibleReason} — {r.linkedAtGun} linked at the gun,
                  profile {r.profileCompleteAtGun ? "complete" : "incomplete"}.
                  It carried {r.entrants.toFixed(1)} entrants.
                </p>
              )}

              {r.supersedesId ? (
                <p className="mt-1 text-xs text-mute">
                  Corrected: {r.supersededReason}
                </p>
              ) : null}
            </li>
          ))}
        </ul>
      </Panel>
    </div>
  );
}
