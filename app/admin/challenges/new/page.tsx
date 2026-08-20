// `/admin/challenges/new` — the builder. 05 §2.
//
// ===== THE FORM ASKS FOR THE PRIZE. IT DOES NOT ASK FOR THE BILL =====
//
// *"Admin enters the **prize**; the system computes the **bill** as
// `prize ÷ 0.5`. Never the reverse, or the split drifts."* So there is no bill
// field on this page — not a disabled one, not a pre-filled one. A field that
// can be typed into is a field somebody types into.
//
// The preview is computed by `planSeries`, the same function that builds the
// series, so the number shown before the button and the number on the invoice
// are the same number by construction rather than by agreement.
//
// ===== AND NO DATE PICKER, FOR ANYONE, INCLUDING US =====
//
// C5/L6. The form asks *which week* or *which day*, as a count forward, and
// the boundary is computed. That is the rule the whole weekly cycle rests on:
// one gun, one close, one pool.

import Link from "next/link";
import { getDb, schema } from "../../../../lib/db/index.ts";
import { liveProviders } from "../../../../lib/providers/registry.ts";
import { planSeries } from "../../../../lib/challenges/series.ts";
import { weekStartPlus, dayStartFor } from "../../../../lib/challenges/week.ts";
import { formatMoney, CHALLENGE_PRICE_CENTS, splitOf } from "../../../../lib/money/amounts.ts";
import { Panel, Refusal } from "../../components.tsx";
import { Button } from "../../../ui.tsx";
import { createSeriesAction } from "../../actions.ts";

export const dynamic = "force-dynamic";

const FIELD = "rounded-lg border border-line bg-transparent px-3 py-2 text-sm";

export default async function NewChallenge({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const query = await searchParams;
  const db = await getDb();
  const brands = await db.select().from(schema.brands);
  const providers = liveProviders();

  // The preview, from the same function the action calls. Driven by the query
  // string so it updates on submit without a client bundle — this console has
  // no JavaScript of its own, and a preview that needed some would be a
  // preview that is missing on the page that failed to hydrate.
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

  const single = splitOf(CHALLENGE_PRICE_CENTS);

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Build a challenge</h1>
        <p className="mt-1 text-sm text-mute">
          Weekly, daily, or a repeating series.{" "}
          <Link href="/admin/challenges" className="underline">
            Back to the queue
          </Link>
        </p>
      </div>

      {typeof query.error === "string" ? (
        <Refusal testId="builder-error">{query.error}</Refusal>
      ) : null}

      <Panel
        title="1 · The prize, and how often"
        note="You enter the prize. The bill is computed from it — never the other way round, or the split drifts"
        help={
          <p>
            The prize is what the trophies must add up to, and the prize vault has to
            hold every cent of it before a trophy is awarded. So the prize is the
            authoritative number and the bill is derived from it, rounded <strong>up</strong>
            {" "}— the buyer covers the spare cent rather than the vault being short.
          </p>
        }
      >
        {/* A GET form, so the preview below is the same page with the numbers
            filled in. Nothing is created until the second form is submitted. */}
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
              data-testid="prize-dollars"
            />
          </label>
          <label className="flex flex-col gap-1 text-sm">
            <span className="text-mute">Cadence</span>
            <select name="cadence" defaultValue={cadence} className={FIELD} data-testid="cadence">
              <option value="weekly">Weekly</option>
              <option value="daily">Daily — admin only</option>
            </select>
          </label>
          <label className="flex flex-col gap-1 text-sm">
            <span className="text-mute">How many</span>
            <input
              name="instances"
              type="number"
              min="1"
              defaultValue={instances}
              className={FIELD}
              data-testid="instances"
            />
          </label>
          <label className="flex flex-col gap-1 text-sm">
            <span className="text-mute">Starting how far ahead</span>
            <input
              name="weeksAhead"
              type="number"
              min="1"
              defaultValue={ahead}
              className={FIELD}
              data-testid="weeks-ahead"
            />
            <span className="text-xs text-mute">
              Weeks, or days. There is no date picker — a start is always a boundary.
            </span>
          </label>
          <Button type="submit" data-testid="price-it">
            Price it
          </Button>
        </form>

        <p className="mt-4 text-xs text-mute">
          For reference, a self-serve weekly challenge is{" "}
          {formatMoney(CHALLENGE_PRICE_CENTS)} and buys a {formatMoney(single.prize)} prize
          pool.
        </p>
      </Panel>

      {plan ? (
        <Panel
          title="2 · What that costs"
          note="Computed from the prize by the same function that will build it"
        >
          <dl className="flex flex-col gap-2 text-sm" data-testid="series-plan">
            <div className="flex justify-between">
              <dt className="text-mute">Instances</dt>
              <dd data-testid="plan-instances">{plan.instances}</dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-mute">Prize each</dt>
              <dd>{formatMoney(plan.prizePerInstanceCents)}</dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-mute">Prize, all of them</dt>
              <dd data-testid="plan-prize">{formatMoney(plan.seriesPrizeCents)}</dd>
            </div>
            <div className="flex justify-between border-t border-line pt-2">
              <dt className="text-mute">Bill</dt>
              <dd className="font-medium" data-testid="plan-bill">
                {formatMoney(plan.billCents)}
              </dd>
            </div>
          </dl>

          <ul className="mt-4 flex flex-col gap-1 text-xs text-mute" data-testid="plan-dates">
            {plan.starts.slice(0, 8).map((s, i) => (
              <li key={s.startAt.toISOString()}>
                {i + 1}. {s.startAt.toISOString().slice(0, 10)} → {s.endAt.toISOString().slice(0, 10)}
              </li>
            ))}
            {plan.starts.length > 8 ? <li>…and {plan.starts.length - 8} more</li> : null}
          </ul>

          <form action={createSeriesAction} className="mt-6 flex flex-col gap-4">
            <input type="hidden" name="cadence" value={cadence} />
            <input type="hidden" name="instances" value={instances} />
            <input type="hidden" name="prizeDollars" value={prizeDollars} />
            <input type="hidden" name="weeksAhead" value={ahead} />

            <label className="flex flex-col gap-1 text-sm">
              <span className="text-mute">Title</span>
              <input name="title" required className={FIELD} data-testid="series-title" />
            </label>

            <div className="flex flex-wrap gap-4">
              <label className="flex flex-col gap-1 text-sm">
                <span className="text-mute">Game</span>
                <select name="provider" className={FIELD} data-testid="series-provider">
                  {providers.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name}
                    </option>
                  ))}
                </select>
                <span className="text-xs text-mute">
                  Only games with a live provider. A game we cannot score is a game we
                  cannot sell.
                </span>
              </label>

              <label className="flex flex-col gap-1 text-sm">
                <span className="text-mute">Bill it to</span>
                <select name="sponsorBrandId" className={FIELD} data-testid="series-brand">
                  <option value="">The Cluster house brand</option>
                  {brands.map((b) => (
                    <option key={b.id} value={b.id}>
                      {b.name}
                    </option>
                  ))}
                </select>
                <span className="text-xs text-mute">
                  L9 — every challenge has a bill. There are no unbilled challenges.
                </span>
              </label>

              <label className="flex flex-col gap-1 text-sm">
                <span className="text-mute">Places</span>
                <input
                  name="places"
                  type="number"
                  min="1"
                  defaultValue={1}
                  className={FIELD}
                  data-testid="series-places"
                />
              </label>
            </div>

            {/* The game name is NOT submitted. It is derived from the provider
                id on the server, because a hidden input cannot follow the
                select above it — this field used to be pinned to
                `providers[0].game` and stamped every challenge "Chess". */}

            <div>
              <Button type="submit" data-testid="create-series">
                Create as a draft
              </Button>
            </div>
            <p className="text-xs text-mute">
              Creates the instances and one invoice for all of them. Nothing is
              announced — nothing ever announces itself.
            </p>
          </form>
        </Panel>
      ) : null}
    </div>
  );
}
