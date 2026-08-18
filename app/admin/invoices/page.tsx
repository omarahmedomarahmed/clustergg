// `/admin/invoices` — every bill. 05 §5.
//
// I1 — **a total is its lines, recomputed.** Never a stored number, so this
// page reads `invoiceView`, which sums them.
// I2 — **overdue is derived** from the due date. Never a flag, because a flag
// is a thing that has to be set by something, and the something is a job that
// eventually does not run.
// I3 — marking paid is the **only** trigger for vault routing, and it is not
// on this page: the payment webhook does it. A "mark paid" button here would
// be a way to fill the vaults with money nobody sent.

import Link from "next/link";
import { desc } from "drizzle-orm";
import { getDb, schema } from "../../../lib/db/index.ts";
import { invoiceView } from "../../../lib/money/invoices.ts";
import { demoNow } from "../../../lib/site/clock.ts";
import { Panel, Money, Empty, Light } from "../components.tsx";

export const dynamic = "force-dynamic";

export default async function Invoices({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const now = demoNow(await searchParams);
  const db = await getDb();
  const rows = await db
    .select()
    .from(schema.invoices)
    .orderBy(desc(schema.invoices.createdAt))
    .limit(200);

  const views = (
    await Promise.all(rows.map((r) => invoiceView(db, r.id, now)))
  ).filter((v) => v !== null);

  const outstanding = views.filter((v) => !v.paid);
  const overdue = views.filter((v) => v.overdue);

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Invoices</h1>
        <p className="mt-1 text-sm text-mute">
          {outstanding.length} outstanding · {overdue.length} overdue
        </p>
      </div>

      <Panel
        title="Every bill"
        note="A total is its lines. Overdue is derived from the due date, never stored as a flag"
        help={
          <p>
            There is no <strong>mark paid</strong> button here on purpose. Marking an
            invoice paid is the only thing that routes money into the vaults, and the
            payment webhook is the only thing that does it — a button on this page
            would be a way to fill the vaults with money nobody sent.
          </p>
        }
      >
        {views.length === 0 ? (
          <Empty>No bills yet.</Empty>
        ) : (
          <ol className="flex flex-col" data-testid="invoices">
            {views.map((v) => (
              <li key={v.id} className="border-b border-line py-3 text-sm last:border-0">
                <div className="flex items-baseline justify-between gap-4">
                  <span className="flex items-center gap-2">
                    <Light ok={v.paid} level={v.overdue ? "red" : "amber"} />
                    <span className="font-mono text-xs">{v.id.slice(0, 8)}</span>
                    <span className="text-mute">{v.lines[0]?.description ?? "—"}</span>
                  </span>
                  <span>
                    <Money cents={v.totalCents} />
                  </span>
                </div>
                <p className="mt-0.5 text-xs text-mute" data-testid="invoice-state">
                  {v.paid
                    ? `Paid ${v.paidAt?.toISOString().slice(0, 10)}`
                    : v.overdue
                      ? `Overdue since ${v.dueAt?.toISOString().slice(0, 10)}`
                      : v.dueAt
                        ? `Due ${v.dueAt.toISOString().slice(0, 10)}`
                        : "Issued"}
                </p>
              </li>
            ))}
          </ol>
        )}
      </Panel>

      <p className="text-xs text-mute">
        Chasing one? The buyer is on{" "}
        <Link href="/admin/brands" className="underline">
          brands
        </Link>{" "}
        or{" "}
        <Link href="/admin/servers" className="underline">
          servers
        </Link>
        . The payment deadline is Saturday evening — anything unpaid waits a week.
      </p>
    </div>
  );
}
