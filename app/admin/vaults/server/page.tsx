// Vault 3, and the allocation control that refuses more than half.

import { eq } from "drizzle-orm";
import { getDb, schema } from "../../../../lib/db/index.ts";
import { balanceOf } from "../../../../lib/money/ledger.ts";
import { maxAllocationCents, poolForWeek } from "../../../../lib/money/pool.ts";
import { poolDivisionFor } from "../../../../lib/pool/score.ts";
import { weekFor } from "../../../../lib/challenges/week.ts";
import { demoNow } from "../../../../lib/site/clock.ts";
import { formatMoney } from "../../../../lib/money/amounts.ts";
import { Panel, Money, Row, Empty } from "../../components.tsx";
import { allocatePoolAction } from "../../actions.ts";

export const dynamic = "force-dynamic";

export default async function ServerVault({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;
  const now = demoNow(params);
  const error = typeof params.error === "string" ? params.error : null;
  const db = await getDb();

  const week = weekFor(now);
  const vaultCents = await balanceOf(db, "server");
  const ceiling = maxAllocationCents(vaultCents);
  const allocated = await poolForWeek(db, week.start);
  const division = await poolDivisionFor(db, week.start, now);

  const contributing = division.contributingChallengeIds.length
    ? await db.select().from(schema.challenges).where(eq(schema.challenges.startAt, week.start))
    : [];

  return (
    <div className="flex flex-col gap-6">
      <h1 className="text-2xl font-semibold tracking-tight">Server vault</h1>

      {error ? (
        <p
          data-testid="allocation-error"
          className="rounded-xl border border-red-900 bg-red-950/40 px-5 py-4 text-sm text-red-200"
        >
          {error}
        </p>
      ) : null}

      <Panel title="This week">
        <Row><span className="text-sm text-mute">Vault balance</span><Money cents={vaultCents} /></Row>
        <Row><span className="text-sm text-mute">Ceiling — half the vault</span><Money cents={ceiling} /></Row>
        <Row><span className="text-sm text-mute">Allocated to the week of {week.start.toISOString().slice(0, 10)}</span><Money cents={allocated} /></Row>
        <p className="mt-4 text-xs leading-relaxed text-mute">
          Nothing auto-allocates. The held half funds refunds, disputes and quiet
          weeks — and it is what a clawback draws on when a brand pulls out after
          a pool has been paid. An allocation can be raised, never lowered:
          owners were already shown the number.
        </p>
      </Panel>

      <Panel title="Allocate">
        <form action={allocatePoolAction} className="flex flex-wrap items-end gap-3">
          <input type="hidden" name="weekStart" value={week.start.toISOString()} />
          <label className="text-sm">
            Amount ($)
            <input
              type="number"
              step="0.01"
              min={0}
              name="amountDollars"
              defaultValue={(ceiling / 100).toFixed(2)}
              className="mt-1 block w-40 rounded-lg border border-line bg-ink px-3 py-2 text-right"
            />
          </label>
          <button
            type="submit"
            data-testid="allocate"
            className="rounded-lg bg-accent px-4 py-2 text-sm font-medium text-white"
          >
            Allocate
          </button>
          <span className="text-xs text-mute">
            More than {formatMoney(ceiling)} is refused, with the reason.
          </span>
        </form>
      </Panel>

      <Panel title="Which challenges fed this week's pool">
        {contributing.length === 0 ? (
          <Empty>Nothing has fed this week&rsquo;s pool yet.</Empty>
        ) : (
          <div className="flex flex-col">
            {contributing.map((c) => (
              <Row key={c.id} href={`/admin/challenges/${c.id}`}>
                <span className="text-sm">{c.title}</span>
                <span className="text-xs text-mute">{c.game} · {c.visibility}</span>
              </Row>
            ))}
          </div>
        )}
      </Panel>

      <Panel title="What the pool would pay if the week ended now">
        {division.shares.length === 0 ? (
          <Empty>No server has carried an entrant yet.</Empty>
        ) : (
          <div className="flex flex-col">
            {division.shares.map((s) => (
              <Row key={s.guildId}>
                <span className="text-sm">{s.name}</span>
                <span className="flex items-center gap-6 text-sm">
                  <span className="text-xs text-mute">
                    {s.entrants.toFixed(1)} entrants · {(s.activation * 100).toFixed(0)}% activation
                  </span>
                  <Money cents={s.totalCents} />
                </span>
              </Row>
            ))}
          </div>
        )}
      </Panel>
    </div>
  );
}
