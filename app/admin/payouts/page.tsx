// Owner payouts. Draft → released → paid, and a human does the releasing.

import { desc, eq, sql } from "drizzle-orm";
import { getDb, schema } from "../../../lib/db/index.ts";
import { Panel, Money, Empty } from "../components.tsx";
import { releasePayoutAction, markPayoutPaidAction } from "../actions.ts";

export const dynamic = "force-dynamic";

export default async function Payouts({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { error } = await searchParams;
  const db = await getDb();

  const payouts = await db
    .select({ payout: schema.serverPayouts, guild: schema.guilds })
    .from(schema.serverPayouts)
    .leftJoin(schema.guilds, eq(schema.serverPayouts.guildId, schema.guilds.guildId))
    .orderBy(desc(schema.serverPayouts.weekStart));

  const totals = await db
    .select({
      payoutId: schema.payoutLines.payoutId,
      total: sql<number>`coalesce(sum(${schema.payoutLines.amountCents}), 0)::int`,
    })
    .from(schema.payoutLines)
    .groupBy(schema.payoutLines.payoutId);
  const totalById = new Map(totals.map((t) => [t.payoutId, t.total]));

  return (
    <div className="flex flex-col gap-6">
      <h1 className="text-2xl font-semibold tracking-tight">Owner payouts</h1>

      {typeof error === "string" ? (
        <p
          data-testid="payout-error"
          className="rounded-xl border border-red-900 bg-red-950/40 px-5 py-4 text-sm text-red-200"
        >
          {error}
        </p>
      ) : null}

      <Panel title={`${payouts.filter((p) => p.payout.status === "draft").length} in draft`}>
        {payouts.length === 0 ? (
          <Empty>No payouts yet. The weekly close drafts them.</Empty>
        ) : (
          <div className="flex flex-col">
            {payouts.map(({ payout, guild }) => (
              <div
                key={payout.id}
                className="flex flex-wrap items-center justify-between gap-3 border-b border-line py-3 last:border-0"
              >
                <div>
                  <p className="text-sm">{guild?.name ?? payout.guildId}</p>
                  <p className="mt-1 text-xs text-mute">
                    week of {payout.weekStart.toISOString().slice(0, 10)} · {payout.status}
                  </p>
                </div>
                <div className="flex items-center gap-4">
                  <Money cents={totalById.get(payout.id) ?? 0} />
                  {payout.status === "draft" ? (
                    <form action={releasePayoutAction}>
                      <input type="hidden" name="payoutId" value={payout.id} />
                      <button
                        type="submit"
                        data-testid="release"
                        className="rounded-lg bg-accent px-3 py-1.5 text-sm font-medium text-white"
                      >
                        Release
                      </button>
                    </form>
                  ) : payout.status === "released" ? (
                    <form action={markPayoutPaidAction}>
                      <input type="hidden" name="payoutId" value={payout.id} />
                      <button
                        type="submit"
                        className="rounded-lg border border-line px-3 py-1.5 text-sm hover:border-accent"
                      >
                        Mark paid
                      </button>
                    </form>
                  ) : (
                    <span className="text-xs text-mute">paid</span>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
        <p className="mt-4 text-xs text-mute">
          The weekly close computes; a human releases. A job that moved money on
          its own is one nobody could stop on a Sunday.
        </p>
      </Panel>
    </div>
  );
}
