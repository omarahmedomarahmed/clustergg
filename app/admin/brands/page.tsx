import { desc, eq, sql } from "drizzle-orm";
import { getDb, schema } from "../../../lib/db/index.ts";
import { formatMoney } from "../../../lib/money/amounts.ts";
import { Panel, Empty, Row } from "../components.tsx";
import { createBrandAction } from "../actions.ts";

export const dynamic = "force-dynamic";

const FIELD =
  "rounded-md border border-line bg-ink px-3 py-1.5 text-sm outline-none focus:border-white/30";

export default async function AdminBrands({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const query = await searchParams;
  const str = (k: string) => (typeof query[k] === "string" ? (query[k] as string) : null);
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

      {str("error") ? (
        <p className="rounded-lg border border-line bg-ink px-4 py-3 text-sm" data-testid="brand-error">
          {str("error")}
        </p>
      ) : null}

      {/*
        Shown once and never again. The key is hashed at rest, so this is the
        only moment it exists in readable form — and it is here rather than only
        in the email because a send can fail, and an operator who can read it
        off the screen is not blocked by that.
      */}
      {str("invited") && str("key") ? (
        <Panel
          title={`${str("invited")} has been invited`}
          note="Emailed to their contact address. Shown here once, because a send can fail"
        >
          <Row>
            <p className="text-sm">
              One-time key:{" "}
              <strong className="font-mono" data-testid="brand-invite-key">
                {str("key")}
              </strong>
            </p>
          </Row>
        </Panel>
      ) : null}

      <Panel
        title="Sign a brand up"
        note="Creates the company and emails its contact a key that works exactly once"
      >
        <Row>
          <form action={createBrandAction} className="flex flex-wrap items-end gap-3">
            <label className="flex flex-col gap-1 text-sm">
              <span className="text-mute">Brand name</span>
              <input name="name" required className={FIELD} data-testid="brand-name" />
            </label>
            <label className="flex flex-col gap-1 text-sm">
              <span className="text-mute">Contact email</span>
              <input
                name="contactEmail"
                type="email"
                required
                className={FIELD}
                data-testid="brand-email"
              />
            </label>
            <button
              type="submit"
              className="rounded-md border border-line px-3 py-1.5 text-sm hover:bg-white/5"
              data-testid="brand-create"
            >
              Invite
            </button>
          </form>
        </Row>
      </Panel>
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
