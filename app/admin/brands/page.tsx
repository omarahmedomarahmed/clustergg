import { desc, eq, sql } from "drizzle-orm";
import { getDb, schema } from "../../../lib/db/index.ts";
import { formatMoney } from "../../../lib/money/amounts.ts";
import { Panel, Empty } from "../components.tsx";

export const dynamic = "force-dynamic";

export default async function AdminBrands() {
  const db = await getDb();
  const brands = await db.select().from(schema.brands).orderBy(desc(schema.brands.createdAt));

  const spend = await db
    .select({
      payerId: schema.invoices.payerId,
      total: sql<number>`coalesce(sum(${schema.invoiceLines.amountCents}), 0)::int`,
    })
    .from(schema.invoices)
    .innerJoin(schema.invoiceLines, eq(schema.invoiceLines.invoiceId, schema.invoices.id))
    .where(sql`${schema.invoices.paidAt} is not null`)
    .groupBy(schema.invoices.payerId);
  const spendBy = new Map(spend.map((s) => [s.payerId, s.total]));

  const challenges = await db
    .select({
      brandId: schema.challenges.sponsorBrandId,
      n: sql<number>`count(*)::int`,
    })
    .from(schema.challenges)
    .groupBy(schema.challenges.sponsorBrandId);
  const countBy = new Map(challenges.map((c) => [c.brandId, c.n]));

  return (
    <div className="flex flex-col gap-6">
      <h1 className="text-2xl font-semibold tracking-tight">Brands</h1>
      <Panel title={`${brands.length}`}>
        {brands.length === 0 ? (
          <Empty>No brands yet.</Empty>
        ) : (
          <div className="flex flex-col">
            {brands.map((b) => (
              <div
                key={b.id}
                className="flex items-center justify-between border-b border-line py-3 last:border-0"
              >
                <div>
                  <p className="text-sm">{b.name}</p>
                  <p className="mt-1 text-xs text-mute">{b.contactEmail ?? "no contact yet"}</p>
                </div>
                <span className="flex items-center gap-6 text-sm">
                  <span className="text-xs text-mute">
                    {countBy.get(b.id) ?? 0} challenge{(countBy.get(b.id) ?? 0) === 1 ? "" : "s"}
                  </span>
                  <span className="tabular-nums">{formatMoney(spendBy.get(b.id) ?? 0)} paid</span>
                </span>
              </div>
            ))}
          </div>
        )}
      </Panel>
    </div>
  );
}
