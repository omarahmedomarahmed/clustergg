// `/admin/brands/[id]/draft` — build a challenge into their portal. 05 §5.
//
// ===== B7/B8 — WHAT AN ADMIN-BUILT DRAFT IS FOR =====
//
// Admin can build a challenge a brand **cannot build themselves** — a daily,
// or a repeating series — and assign it to them. It appears in their portal as
// a draft, and *"they may change the **start day or week**, and nothing
// else."*
//
// So this is the same builder as `/admin/challenges/new`, pointed at one
// brand. It is a separate page rather than a dropdown on that one because the
// journey is different: 06 §3's last row is a salesperson on a call, and the
// page they want is the brand's, not the queue's.
//
// Nothing here is announced and nothing here is paid. The draft is an offer.

import Link from "next/link";
import { notFound } from "next/navigation";
import { eq } from "drizzle-orm";
import { getDb, schema } from "../../../../../lib/db/index.ts";
import { liveProviders } from "../../../../../lib/providers/registry.ts";
import { planSeries } from "../../../../../lib/challenges/series.ts";
import { weekStartPlus, dayStartFor } from "../../../../../lib/challenges/week.ts";
import { formatMoney } from "../../../../../lib/money/amounts.ts";
import { Panel, Refusal } from "../../../components.tsx";
import { Button } from "../../../../ui.tsx";
import { createSeriesAction } from "../../../actions.ts";

export const dynamic = "force-dynamic";

const FIELD = "rounded-lg border border-line bg-transparent px-3 py-2 text-sm";

export default async function BrandDraft({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { id } = await params;
  const query = await searchParams;
  const db = await getDb();

  const [brand] = await db.select().from(schema.brands).where(eq(schema.brands.id, id));
  if (!brand) notFound();

  const providers = liveProviders();
  const cadence = query.cadence === "daily" ? "daily" : "weekly";
  const instances = Math.max(1, Number(query.instances ?? 1));
  const prizeDollars = Number(query.prizeDollars ?? 0);
  const ahead = Math.max(1, Number(query.weeksAhead ?? 1));
  const now = new Date();

  const plan =
    prizeDollars > 0
      ? planSeries({
          cadence,
          instances,
          prizePerInstanceCents: Math.round(prizeDollars * 100),
          startAt:
            cadence === "weekly"
              ? weekStartPlus(now, ahead)
              : dayStartFor(new Date(now.getTime() + ahead * 24 * 60 * 60 * 1000)),
        })
      : null;

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">
          Build a draft for {brand.name}
        </h1>
        <p className="mt-1 text-sm text-mute">
          It appears in their portal ready to confirm and pay.{" "}
          <Link href={`/admin/brands/${id}`} className="underline">
            Back to {brand.name}
          </Link>
        </p>
      </div>

      {typeof query.error === "string" ? (
        <Refusal testId="draft-error">{query.error}</Refusal>
      ) : null}

      <Panel
        title="What to offer them"
        note="A daily or a repeating series — the things they cannot build themselves"
        help={
          <p>
            On a draft you built, the brand may change <strong>the start day or week
            and nothing else</strong>. That is the whole of B8: they are confirming an
            offer, not editing a product. Everything else — the prize, the cadence, the
            count — is what you and they agreed on the call.
          </p>
        }
      >
        <form method="get" className="flex flex-wrap items-end gap-4">
          <label className="flex flex-col gap-1 text-sm">
            <span className="text-mute">Prize per instance ($)</span>
            <input
              name="prizeDollars"
              type="number"
              step="0.01"
              min="0"
              defaultValue={prizeDollars || ""}
              className={FIELD}
              data-testid="draft-prize"
            />
          </label>
          <label className="flex flex-col gap-1 text-sm">
            <span className="text-mute">Cadence</span>
            <select name="cadence" defaultValue={cadence} className={FIELD} data-testid="draft-cadence">
              <option value="weekly">Weekly</option>
              <option value="daily">Daily</option>
            </select>
          </label>
          <label className="flex flex-col gap-1 text-sm">
            <span className="text-mute">How many</span>
            <input name="instances" type="number" min="1" defaultValue={instances} className={FIELD} data-testid="draft-instances" />
          </label>
          <label className="flex flex-col gap-1 text-sm">
            <span className="text-mute">Starting how far ahead</span>
            <input name="weeksAhead" type="number" min="1" defaultValue={ahead} className={FIELD} />
          </label>
          <Button type="submit" data-testid="draft-price-it">
            Price it
          </Button>
        </form>
      </Panel>

      {plan ? (
        <Panel title="What they will be billed" note="Computed from the prize. Never the reverse">
          <p className="text-sm" data-testid="draft-bill">
            {formatMoney(plan.seriesPrizeCents)} of prize money across {plan.instances}{" "}
            {cadence === "daily" ? "days" : "weeks"} bills at{" "}
            <strong>{formatMoney(plan.billCents)}</strong>.
          </p>

          <form action={createSeriesAction} className="mt-4 flex flex-col gap-4">
            <input type="hidden" name="cadence" value={cadence} />
            <input type="hidden" name="instances" value={instances} />
            <input type="hidden" name="prizeDollars" value={prizeDollars} />
            <input type="hidden" name="weeksAhead" value={ahead} />
            <input type="hidden" name="sponsorBrandId" value={id} />
            <input type="hidden" name="game" value={providers[0]?.game ?? ""} />

            <label className="flex flex-col gap-1 text-sm">
              <span className="text-mute">Title</span>
              <input name="title" required className={FIELD} data-testid="draft-title" />
            </label>
            <label className="flex flex-col gap-1 text-sm">
              <span className="text-mute">Game</span>
              <select name="provider" className={FIELD} data-testid="draft-provider">
                {providers.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))}
              </select>
            </label>
            <label className="flex flex-col gap-1 text-sm">
              <span className="text-mute">Places</span>
              <input name="places" type="number" min="1" defaultValue={1} className={FIELD} />
            </label>
            <div>
              <Button type="submit" data-testid="create-draft">
                Put it in their portal
              </Button>
            </div>
          </form>
        </Panel>
      ) : null}
    </div>
  );
}
