// `/admin/brands/[id]` — one brand: challenges, invoices, trophies, contact.
// 05 §5.
//
// B10's reporting rules reach this page as much as the brand's own portal: a
// figure here that disagreed with what they see in their portal is worse than
// no figure, because we would be arguing from a different set of numbers than
// the person on the phone.
//
// So every count is read the same way their own report reads it — per
// challenge, deliberately double counted, never summed into a "unique
// audience" figure we cannot stand behind.

import Link from "next/link";
import { notFound } from "next/navigation";
import { eq, desc } from "drizzle-orm";
import { getDb, schema } from "../../../../lib/db/index.ts";
import { invoiceView } from "../../../../lib/money/invoices.ts";
import { holderCountOf } from "../../../../lib/trophies/trophies.ts";
import { STATE_LABEL, type ChallengeState } from "../../../../lib/challenges/lifecycle.ts";
import { demoNow } from "../../../../lib/site/clock.ts";
import { formatMoney } from "../../../../lib/money/amounts.ts";
import { Panel, Row, Empty, Money } from "../../components.tsx";

export const dynamic = "force-dynamic";

export default async function Brand({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { id } = await params;
  const now = demoNow(await searchParams);
  const db = await getDb();

  const [brand] = await db.select().from(schema.brands).where(eq(schema.brands.id, id));
  if (!brand) notFound();

  const challenges = await db
    .select()
    .from(schema.challenges)
    .where(eq(schema.challenges.sponsorBrandId, id))
    .orderBy(desc(schema.challenges.startAt));

  const invoiceRows = await db
    .select()
    .from(schema.invoices)
    .where(eq(schema.invoices.payerId, id))
    .orderBy(desc(schema.invoices.createdAt));
  const invoices = (await Promise.all(invoiceRows.map((i) => invoiceView(db, i.id, now)))).filter(
    (v) => v !== null,
  );

  const trophies = await db
    .select()
    .from(schema.trophies)
    .where(eq(schema.trophies.brandId, id));
  const holders = new Map(
    await Promise.all(trophies.map(async (t) => [t.id, await holderCountOf(db, t.id)] as const)),
  );

  const users = await db
    .select()
    .from(schema.brandUsers)
    .where(eq(schema.brandUsers.brandId, id));

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">{brand.name}</h1>
        <p className="mt-1 text-sm text-mute">
          <Link href="/admin/brands" className="underline">
            Every brand
          </Link>{" "}
          ·{" "}
          <Link href={`/admin/brands/${id}/draft`} className="underline">
            Build them a draft
          </Link>
        </p>
      </div>

      <Panel title="Contact" note="What they gave us at setup">
        <Row>
          <span>Contact name</span>
          <span className="text-sm text-mute">{brand.contactName ?? "—"}</span>
        </Row>
        <Row>
          <span>Phone</span>
          <span className="text-sm text-mute">{brand.contactPhone ?? "—"}</span>
        </Row>
        <Row>
          <span>Logins</span>
          <span className="text-sm text-mute" data-testid="brand-logins">
            {users.length === 0
              ? "None — the invite has not been redeemed"
              : users.map((u) => u.email).join(", ")}
          </span>
        </Row>
      </Panel>

      <Panel
        title="Challenges"
        note="Each week of a series reads separately, never merged"
        help={
          <p>
            The same gamer entering week one and week two is <strong>two
            entrants</strong>, and the same ten members across two challenges is two
            times ten reach. That is deliberate and it is what makes every number here
            counted rather than modelled.
          </p>
        }
      >
        {challenges.length === 0 ? (
          <Empty>Nothing bought yet.</Empty>
        ) : (
          challenges.map((c) => (
            <Row key={c.id} href={`/admin/challenges/${c.id}`}>
              <div>
                <p>{c.title}</p>
                <p className="text-xs text-mute">
                  {c.game} · {c.startAt.toISOString().slice(0, 10)}
                </p>
              </div>
              <span className="text-sm text-mute">
                {STATE_LABEL[c.state as ChallengeState] ?? c.state}
              </span>
            </Row>
          ))
        )}
      </Panel>

      <Panel title="Invoices" note="A total is its lines. Overdue is derived">
        {invoices.length === 0 ? (
          <Empty>No bills.</Empty>
        ) : (
          invoices.map((v) => (
            <Row key={v.id}>
              <span className="font-mono text-xs">{v.id.slice(0, 8)}</span>
              <span className="flex items-center gap-3 text-sm">
                <span className="text-mute">
                  {v.paid ? "paid" : v.overdue ? "overdue" : "outstanding"}
                </span>
                <Money cents={v.totalCents} />
              </span>
            </Row>
          ))
        )}
      </Panel>

      <Panel
        title="Trophies"
        note="Theirs, and how many gamers hold each — the thing they actually bought"
      >
        {trophies.length === 0 ? (
          <Empty>None yet.</Empty>
        ) : (
          trophies.map((t) => (
            <Row key={t.id} href={`/trophies/${t.id}`}>
              <span>{t.name}</span>
              <span className="text-sm text-mute">
                {t.valueCents > 0 ? formatMoney(t.valueCents) : "collectable"} ·{" "}
                {holders.get(t.id) ?? 0} holding
              </span>
            </Row>
          ))
        )}
      </Panel>
    </div>
  );
}
