// Challenges — every one, grouped by week of a series.
//
// B8 — on a draft the brand may change the start **week** only. Not the game,
// not the prize, not the trophies, and not to a date. The control below is a
// week picker for that reason, and `changeStartWeek` refuses everything else.

import { getDb } from "../../../../../lib/db/index.ts";
import { schema } from "../../../../../lib/db/index.ts";
import { brandReport } from "../../../../../lib/portal/brand.ts";
import { eq, desc } from "drizzle-orm";
import { Panel, Row, Empty } from "../../../components.tsx";
import { weekStartPlus, earliestSellableWeek } from "../../../../../lib/challenges/week.ts";
import { changeStartWeekAction } from "../actions.ts";

export const dynamic = "force-dynamic";

export default async function BrandChallenges({
  params,
  searchParams,
}: {
  params: Promise<{ brandId: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { brandId } = await params;
  const query = await searchParams;
  const db = await getDb();

  const challenges = await db
    .select()
    .from(schema.challenges)
    .where(eq(schema.challenges.sponsorBrandId, brandId))
    .orderBy(desc(schema.challenges.startAt));
  const report = await brandReport(db, brandId);

  // The weeks a draft may be moved to. `changeStartWeek` decides which are
  // acceptable and refuses the rest; this offers the twelve after the earliest
  // sellable one so the picker cannot suggest a week that has already started.
  const first = earliestSellableWeek(new Date());
  const weeks = Array.from({ length: 12 }, (_, i) => weekStartPlus(first, i));
  const entrantsBy = new Map(report.map((r) => [r.challengeId, r.entrants]));

  // Grouped by week, because that is how a series is sold and read.
  const byWeek = new Map<string, typeof challenges>();
  for (const c of challenges) {
    const key = c.startAt.toISOString().slice(0, 10);
    byWeek.set(key, [...(byWeek.get(key) ?? []), c]);
  }

  return (
    <div className="flex flex-col gap-6">
      <h1 className="text-2xl font-semibold tracking-tight">Challenges</h1>

      {query.bought ? (
        <p data-testid="bought" className="text-sm text-green-400">
          Paid. Each challenge is announced individually once it is set up — a series is
          billed together and announced one at a time.
        </p>
      ) : null}

      {byWeek.size === 0 ? (
        <Panel title="Nothing yet">
          <Empty>Your challenges appear here the moment the bill is paid.</Empty>
        </Panel>
      ) : (
        [...byWeek.entries()].map(([week, group]) => (
          <Panel
            key={week}
            help={
              <p>
                A series is billed together and <strong>announced one week at a
                time</strong>, each after its own payment clears. Every week reads
                separately here and in your report, because merging them would be a
                number we modelled rather than counted.
              </p>
            }
            title={`Week of ${week}`}
            note={group[0].seriesId ? "Part of a series, billed together" : undefined}
          >
            {group.map((c) => (
              <Row key={c.id}>
                <div>
                  <p>{c.title}</p>
                  <p className="text-xs text-mute">{c.game}</p>
                </div>
                <span className="flex items-center gap-4 text-sm">
                  <span className="tabular-nums text-mute">
                    {(entrantsBy.get(c.id) ?? 0).toLocaleString("en-US")} entrants
                  </span>
                  <span className="rounded-full border border-line px-2 py-0.5 text-xs">
                    {c.state}
                  </span>
                </span>
              </Row>
            ))}
            {group
              .filter((c) => c.state === "draft" || c.state === "pending_payment")
              .map((c) => (
                <Row key={`${c.id}-move`}>
                  {/*
                    B8 — the week only. Not the game, not the prize, not the
                    trophies, and not to a date: a week picker rather than a
                    calendar, because there is no date picker anywhere on this
                    platform, for anyone.
                  */}
                  <form
                    action={changeStartWeekAction}
                    className="flex w-full items-end gap-3"
                    data-testid="move-week"
                  >
                    <input type="hidden" name="brandId" value={brandId} />
                    <input type="hidden" name="challengeId" value={c.id} />
                    <label className="flex flex-col gap-1 text-xs">
                      <span className="text-mute">Move “{c.title}” to</span>
                      <select
                        name="weekStart"
                        className="rounded-md border border-line bg-ink px-2 py-1 text-sm"
                      >
                        {weeks.map((w) => (
                          <option key={w.toISOString()} value={w.toISOString()}>
                            Week of {w.toISOString().slice(0, 10)}
                          </option>
                        ))}
                      </select>
                    </label>
                    <button
                      type="submit"
                      className="rounded-md border border-line px-3 py-1.5 text-sm hover:bg-white/5"
                    >
                      Move
                    </button>
                  </form>
                </Row>
            ))}
          </Panel>
        ))
      )}
    </div>
  );
}
