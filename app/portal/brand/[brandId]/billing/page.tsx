// Billing — invoices, paid and outstanding.
//
// L9/C3 — every challenge past draft has an invoice, including the house's
// own. So this list is complete by construction rather than by anybody
// remembering to add a row.
//
// A9 — the invoice shows the split, because a brand paying $350 is entitled to
// see where it goes. Nothing here is a stored total: an invoice's amount is the
// sum of its lines.

import { getDb } from "../../../../../lib/db/index.ts";
import { brandBilling } from "../../../../../lib/portal/brand.ts";
import {
  CHALLENGE_PRICE_CENTS,
  formatMoney,
  splitOf,
} from "../../../../../lib/money/amounts.ts";
import { Panel, Row, Empty } from "../../../components.tsx";

export const dynamic = "force-dynamic";

export default async function BrandBilling({
  params,
}: {
  params: Promise<{ brandId: string }>;
}) {
  const { brandId } = await params;
  const db = await getDb();
  // `invoiceView` returns null for an invoice that vanished between the list
  // and the read. Filtered rather than rendered as a blank row: house rule 11
  // — a decoration may never take a card down, and neither may a race.
  const invoices = (await brandBilling(db, brandId)).filter((i) => i !== null);

  const outstanding = invoices.filter((i) => i.status !== "paid");
  const paid = invoices.filter((i) => i.status === "paid");

  const section = (title: string, list: typeof invoices, note: string) => (
    <Panel title={title} note={note}>
      {list.length === 0 ? (
        <Empty>Nothing here.</Empty>
      ) : (
        list.map((i) => (
          <div key={i.id} className="border-b border-line py-3 last:border-0">
            <div className="flex items-center justify-between">
              <span className="font-mono text-xs text-mute">{i.id}</span>
              <span className="tabular-nums">{formatMoney(i.totalCents)}</span>
            </div>
            <ul className="mt-1 flex flex-col gap-0.5 text-xs text-mute">
              {i.lines.map((l, n) => (
                <li key={n} className="flex justify-between gap-4">
                  <span>{l.description}</span>
                  <span className="tabular-nums">{formatMoney(l.amountCents)}</span>
                </li>
              ))}
            </ul>
          </div>
        ))
      )}
    </Panel>
  );

  return (
    <div className="flex flex-col gap-6">
      <h1 className="text-2xl font-semibold tracking-tight">Billing</h1>

      {section(
        "Outstanding",
        outstanding,
        "A challenge is not announced until its bill is paid — there is no path around that",
      )}
      {section("Paid", paid, "Billed per challenge; a series on one bill")}

      {/* House rule 2 — the price and the split are IMPORTED. A figure retyped
          into a page is a figure that stays at the old value after a ruling,
          and this is the page a brand would quote back at us. */}
      <Panel
        title={`Where a ${formatMoney(CHALLENGE_PRICE_CENTS)} challenge fee goes`}
        note="The same split on every one"
      >
        {(
          [
            ["Prize pool — trophies for the gamers who win", splitOf(CHALLENGE_PRICE_CENTS).prize],
            [
              "Server pool — divided among the servers that carried it",
              splitOf(CHALLENGE_PRICE_CENTS).server,
            ],
            ["Cluster", splitOf(CHALLENGE_PRICE_CENTS).cluster],
          ] as const
        ).map(([label, cents]) => (
          <Row key={label}>
            <span className="text-sm">{label}</span>
            <span className="tabular-nums">{formatMoney(cents)}</span>
          </Row>
        ))}
      </Panel>
    </div>
  );
}
