// `/admin/vaults/ledger` — every movement, searchable. 05 §3.
//
// ===== APPEND-ONLY, AND THIS PAGE IS WHY IT HAS TO BE =====
//
// M1 — *"never updated, never deleted. A correction is a new row."* A ledger
// that could be edited is a ledger this page cannot be trusted to show, and
// the whole money model rests on `balance = sum(ledger)`.
//
// So there is no edit control anywhere on this page, and there never will be:
// the correction mechanism is a new row, which is a different action on a
// different page. A page that browses an append-only table and offers a pencil
// icon is a page that has misunderstood the table.

import { desc } from "drizzle-orm";
import { getDb, schema } from "../../../../lib/db/index.ts";
import { allBalances, VAULTS, LEDGER_KINDS } from "../../../../lib/money/ledger.ts";
import { formatMoney } from "../../../../lib/money/amounts.ts";
import { Panel, Money, Empty } from "../../components.tsx";

export const dynamic = "force-dynamic";

export default async function Ledger({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const query = await searchParams;
  const vault = typeof query.vault === "string" ? query.vault : "";
  const kind = typeof query.kind === "string" ? query.kind : "";

  const db = await getDb();
  const balances = await allBalances(db);
  const all = await db
    .select()
    .from(schema.vaultLedger)
    .orderBy(desc(schema.vaultLedger.createdAt))
    .limit(500);

  const rows = all.filter(
    (r) => (!vault || r.vault === vault) && (!kind || r.kind === kind),
  );

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">The ledger</h1>
        <p className="mt-1 text-sm text-mute">
          Every movement of every dollar. Append-only — a correction is a new row,
          never an edit.
        </p>
      </div>

      <section className="grid gap-3 sm:grid-cols-4">
        {VAULTS.map((v) => (
          <div key={v} className="rounded-xl border border-line bg-panel px-5 py-4">
            <p className="text-xs uppercase tracking-wide text-mute">{v}</p>
            <p className="mt-1 text-xl font-semibold tabular-nums" data-testid={`balance-${v}`}>
              {formatMoney(balances[v])}
            </p>
          </div>
        ))}
      </section>

      <Panel
        title="Movements"
        note="Newest first. Each row names who moved it and why"
        help={
          <p>
            A balance is <strong>never a column</strong>. Every figure above is{" "}
            <code>sum(ledger)</code> over the rows below, which is why a balance that
            goes wrong can always be reconstructed — and why one that was stored could
            not be.
          </p>
        }
        action={
          <form method="get" className="flex gap-2 text-sm">
            <select name="vault" defaultValue={vault} className="rounded-lg border border-line bg-panel px-2 py-1" data-testid="filter-vault">
              <option value="">Every vault</option>
              {VAULTS.map((v) => (
                <option key={v} value={v}>{v}</option>
              ))}
            </select>
            <select name="kind" defaultValue={kind} className="rounded-lg border border-line bg-panel px-2 py-1" data-testid="filter-kind">
              <option value="">Every kind</option>
              {LEDGER_KINDS.map((k) => (
                <option key={k} value={k}>{k}</option>
              ))}
            </select>
            <button type="submit" className="rounded-lg border border-line px-3 py-1">Filter</button>
          </form>
        }
      >
        {rows.length === 0 ? (
          <Empty>Nothing matches.</Empty>
        ) : (
          <ol className="flex flex-col" data-testid="ledger-rows">
            {rows.map((r) => (
              <li key={r.id} className="border-b border-line py-3 text-sm last:border-0">
                <div className="flex items-baseline justify-between gap-4">
                  <span>
                    <span className="text-mute">{r.vault}</span> · {r.kind}
                  </span>
                  <span className={r.amount < 0 ? "text-amber-300" : ""}>
                    <Money cents={r.amount} />
                  </span>
                </div>
                <p className="mt-0.5 text-xs text-mute">
                  {r.createdAt.toISOString().slice(0, 16).replace("T", " ")} UTC ·{" "}
                  {r.actorId ?? "system"} · {r.reason ?? "—"}
                </p>
              </li>
            ))}
          </ol>
        )}
      </Panel>
    </div>
  );
}
