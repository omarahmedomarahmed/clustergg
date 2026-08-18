// Every closed week — and whether it still reconciles.
//
// 05 §6 rule 3 — **nothing here is recalculated.** W3 says `Σ shares` equals
// that week's allocation, and this page *checks* it and says so. A history
// page that silently displayed a total not equal to the pool would be the most
// convincing wrong number on the platform.

import { getDb } from "../../../lib/db/index.ts";
import { weekSummaries } from "../../../lib/pool/record.ts";
import { formatMoney } from "../../../lib/money/amounts.ts";
import { Panel, Help } from "../../ui.tsx";

export const dynamic = "force-dynamic";

export default async function WeeksPage() {
  const weeks = await weekSummaries(await getDb());

  return (
    <div className="flex flex-col gap-6" data-testid="weeks">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">
          Weekly history
          <Help title="Why this is recorded and not derived">
            A balance is derived because its inputs are permanent. A week&rsquo;s
            standing is recorded because its inputs are not — a member leaves, a
            profile lapses, the next gun overwrites the gate. By the following
            Tuesday a closed week cannot be re-derived at all.
          </Help>
        </h1>
        <p className="mt-1 text-sm text-mute">
          Written once at the close. Nothing on these pages is recalculated — a
          figure that disagrees with the payout is a defect to raise.
        </p>
      </div>

      {weeks.length === 0 ? (
        <Panel>
          <p className="text-sm text-mute">No week has closed yet.</p>
        </Panel>
      ) : (
        <Panel>
          <ul className="flex flex-col gap-3">
            {weeks.map((w) => (
              <li key={w.weekStart.toISOString()} className="text-sm">
                <div className="flex items-baseline justify-between gap-4">
                  <a
                    className="underline"
                    href={`/admin/weeks/${w.weekStart.toISOString().slice(0, 10)}`}
                  >
                    Week of {w.weekStart.toISOString().slice(0, 10)}
                  </a>
                  <span className="text-mute">
                    {formatMoney(w.poolCents)} pool · {w.serversPaid} paid
                    {w.serversDropped > 0 ? ` · ${w.serversDropped} not in the pool` : ""}
                  </span>
                </div>
                {/* W3, checked and said out loud. */}
                <p
                  className="mt-0.5 text-xs"
                  data-testid={w.reconciles ? "reconciles" : "does-not-reconcile"}
                >
                  {w.reconciles ? (
                    <span className="text-mute">
                      Shares add up to the allocation ✓
                    </span>
                  ) : (
                    <span className="text-red-400">
                      Shares total {formatMoney(w.sharesTotalCents)} against an
                      allocation of {formatMoney(w.allocatedCents)}. This is a
                      defect — do not recompute it, raise it.
                    </span>
                  )}
                </p>
              </li>
            ))}
          </ul>
        </Panel>
      )}
    </div>
  );
}
