// `/admin/challenges/series/[id]` — a series and its instances. 05 §2.
//
// ===== THE PAGE 03 §7 STEPS 8 AND 9 HAPPEN ON =====
//
// *"Admin defines 3 trophy templates ($5/$3/$2, Brand X). System instantiates
// 21."* And then: *"**Guard:** 21 trophies × values = $70 = prize allocation
// ✓."*
//
// The guard is shown **while the templates are being typed**, from
// `checkTemplates` — the same arithmetic `instantiateTemplatesAction` will
// apply before it writes anything. A builder that told you it balanced and a
// guard that then refused it is the shape 01-CYCLE's one-function rule exists
// to prevent, and it would fail at the worst possible moment: Sunday night,
// setting up the week.
//
// L10 — each instance is announced **individually**, after its own payment
// clears. There is no announce-the-series button here, and that is deliberate:
// C1 says announcement is always a click, and one click announcing seven
// challenges is one decision covering seven weeks.

import Link from "next/link";
import { notFound } from "next/navigation";
import { getDb, schema } from "../../../../../lib/db/index.ts";
import { eq } from "drizzle-orm";
import { seriesInstances, checkTemplates } from "../../../../../lib/challenges/series.ts";
import { STATE_LABEL, type ChallengeState } from "../../../../../lib/challenges/lifecycle.ts";
import { isInvoicePaid } from "../../../../../lib/money/invoices.ts";
import { formatMoney } from "../../../../../lib/money/amounts.ts";
import { Panel, Row, Empty, Refusal, Money } from "../../../components.tsx";
import { Button } from "../../../../ui.tsx";
import { instantiateTemplatesAction } from "../../../actions.ts";

export const dynamic = "force-dynamic";

const FIELD = "rounded-lg border border-line bg-transparent px-3 py-2 text-sm";

export default async function Series({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { id } = await params;
  const query = await searchParams;
  const db = await getDb();

  const instances = await seriesInstances(db, id);
  if (instances.length === 0) notFound();

  const first = instances[0];
  const invoiceId = first.invoiceId;
  const paid = invoiceId ? await isInvoicePaid(db, invoiceId) : false;

  const trophies = await db
    .select()
    .from(schema.trophies)
    .where(eq(schema.trophies.challengeId, first.id));
  const podium = trophies.filter((t) => t.type === "podium");
  const check = checkTemplates(podium, first.prizePoolCents);

  const allTrophies = await db.select().from(schema.trophies);
  const acrossSeries = allTrophies.filter((t) =>
    instances.some((c) => c.id === t.challengeId),
  );

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">{first.title}</h1>
        <p className="mt-1 text-sm text-mute">
          {instances.length} {first.cadence === "daily" ? "day" : "week"}
          {instances.length === 1 ? "" : "s"} · {first.game} ·{" "}
          <Link href="/admin/challenges" className="underline">
            the queue
          </Link>
        </p>
      </div>

      {typeof query.error === "string" ? (
        <Refusal testId="series-error">{query.error}</Refusal>
      ) : null}

      <Panel
        title="The bill"
        note="A series is billed together. Never a partial start"
        help={
          <p>
            One invoice covers every instance. If the brand pays late the{" "}
            <strong>whole series shifts</strong> rather than starting halfway through —
            half a series is a competition nobody agreed to buy.
          </p>
        }
      >
        <Row>
          <span>Prize, all of them</span>
          <Money cents={first.prizePoolCents * instances.length} />
        </Row>
        <Row>
          <span>Invoice</span>
          <span className="text-sm" data-testid="series-paid">
            {invoiceId ? (paid ? "Paid" : "Awaiting payment") : "No invoice"}
          </span>
        </Row>
      </Panel>

      <Panel
        title="Trophy templates"
        note="Define once per place. The system instantiates one per instance"
        help={
          <p>
            Without this a seven-day series needs twenty-one hand-made trophies, and
            hand-making twenty-one of anything is how one ends up with the wrong value
            and the prize-pool guard fails on a Sunday night. The check below is the
            same arithmetic the assignment guard applies — shown while you type, so it
            cannot tell you one thing and refuse another.
          </p>
        }
      >
        {acrossSeries.length > 0 ? (
          <div className="mb-4" data-testid="instantiated">
            <p className="text-sm">
              {acrossSeries.length} trophies across {instances.length} instances.
            </p>
            <p
              className="mt-1 text-xs"
              data-testid="template-check"
              data-ok={check.ok ? "1" : "0"}
            >
              {check.ok
                ? `Each instance: ${formatMoney(check.totalCents)} of trophies against a ` +
                  `${formatMoney(check.prizeCents)} prize pool. ✓`
                : check.reason}
            </p>
          </div>
        ) : null}

        <form action={instantiateTemplatesAction} className="flex flex-col gap-4">
          <input type="hidden" name="seriesId" value={id} />
          {[1, 2, 3].map((place) => (
            <div key={place} className="flex flex-wrap items-end gap-3">
              <input type="hidden" name="place" value={place} />
              <label className="flex flex-col gap-1 text-sm">
                <span className="text-mute">Place {place} — name</span>
                <input
                  name="templateName"
                  defaultValue={`${first.title} — ${place === 1 ? "winner" : `${place}${place === 2 ? "nd" : "rd"}`}`}
                  className={FIELD}
                  data-testid={`template-name-${place}`}
                />
              </label>
              <label className="flex flex-col gap-1 text-sm">
                <span className="text-mute">Value ($)</span>
                <input
                  name="templateValue"
                  type="number"
                  step="0.01"
                  min="0"
                  defaultValue="0"
                  className={FIELD}
                  data-testid={`template-value-${place}`}
                />
              </label>
            </div>
          ))}
          <p className="text-xs text-mute">
            They must add up to {formatMoney(first.prizePoolCents)} — one instance&apos;s
            prize pool — exactly. Over is refused; under is refused too, because money a
            brand paid would sit against a challenge with nobody to give it to.
          </p>
          <div>
            <Button type="submit" data-testid="instantiate">
              Instantiate across all {instances.length}
            </Button>
          </div>
        </form>
      </Panel>

      <Panel
        title="The instances"
        note="Each is announced individually, after its own payment clears"
      >
        {instances.length === 0 ? (
          <Empty>Nothing here.</Empty>
        ) : (
          instances.map((c, i) => (
            <Row key={c.id} href={`/admin/challenges/${c.id}`}>
              <div>
                <p>
                  {i + 1}. {c.title}
                </p>
                <p className="text-xs text-mute">
                  {c.startAt.toISOString().slice(0, 10)} → {c.endAt.toISOString().slice(0, 10)}
                </p>
              </div>
              <span className="text-sm text-mute">
                {STATE_LABEL[c.state as ChallengeState] ?? c.state}
              </span>
            </Row>
          ))
        )}
      </Panel>
    </div>
  );
}
