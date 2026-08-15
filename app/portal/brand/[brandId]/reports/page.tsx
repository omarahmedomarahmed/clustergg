// Reports — entrants and reach per challenge, filtered by game and by week.
//
// ===== THREE RULES, ALL VISIBLE ON THIS ONE PAGE =====
//
//   1. **No total row.** §8 — the same ten members on two challenges is 2 × 10
//      reach, and the same gamer in week 1 and week 2 is two entrants. Adding
//      either down the column produces a "unique audience" that is neither
//      unique nor measured. `brandReport` returns rows and no total; this page
//      does not supply one.
//   2. **The 25 floor.** C6 — a count of three is three people somebody can
//      name. Under the floor the cell reads *"fewer than 25"*, never `0`,
//      because zero is a different and wrong claim.
//   3. **Reach is counted, not modelled.** It is the member count of every
//      server the challenge was actually announced to, recorded at the moment
//      of announcement. The builder's *estimate* has a different name for
//      exactly this reason.

import { getDb } from "../../../../../lib/db/index.ts";
import { brandReport, suppressSmallGroup } from "../../../../../lib/portal/brand.ts";
import { MIN_AUDIENCE_GROUP } from "../../../../../lib/money/amounts.ts";
import { Panel, Empty } from "../../../components.tsx";
import { Button } from "../../../../ui.tsx";

export const dynamic = "force-dynamic";

export default async function BrandReports({
  params,
  searchParams,
}: {
  params: Promise<{ brandId: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { brandId } = await params;
  const query = await searchParams;
  const db = await getDb();

  const game = typeof query.game === "string" && query.game ? query.game : undefined;
  const week = typeof query.week === "string" && query.week ? new Date(query.week) : undefined;

  const all = await brandReport(db, brandId);
  const rows = await brandReport(db, brandId, { game, weekStart: week });

  const games = [...new Set(all.map((r) => r.game))];
  const weeks = [...new Set(all.map((r) => r.weekStart.toISOString()))];

  return (
    <div className="flex flex-col gap-6">
      <h1 className="text-2xl font-semibold tracking-tight">Reports</h1>

      <Panel title="Filter" note="By game, by week. Never rolled into one number">
        <form method="get" className="flex flex-wrap items-end gap-3">
          <label className="flex flex-col gap-1 text-sm">
            <span className="text-mute">Game</span>
            <select
              name="game"
              defaultValue={game ?? ""}
              className="rounded-lg border border-line bg-panel px-3 py-2"
              data-testid="filter-game"
            >
              <option value="">Every game</option>
              {games.map((g) => (
                <option key={g} value={g}>
                  {g}
                </option>
              ))}
            </select>
          </label>
          <label className="flex flex-col gap-1 text-sm">
            <span className="text-mute">Week</span>
            <select
              name="week"
              defaultValue={week?.toISOString() ?? ""}
              className="rounded-lg border border-line bg-panel px-3 py-2"
              data-testid="filter-week"
            >
              <option value="">Every week</option>
              {weeks.map((w) => (
                <option key={w} value={w}>
                  {w.slice(0, 10)}
                </option>
              ))}
            </select>
          </label>
          <Button type="submit" data-testid="apply-filter">
            Apply
          </Button>
        </form>
      </Panel>

      <Panel
        title="Per challenge"
        note="One row per challenge, and deliberately no total — the sum of these would not be a number of people"
      >
        {rows.length === 0 ? (
          <Empty>Nothing matches that filter.</Empty>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm" data-testid="report-table">
              <thead>
                <tr className="border-b border-line text-left text-xs uppercase tracking-wide text-mute">
                  <th className="py-2">Challenge</th>
                  <th className="py-2">Week</th>
                  <th className="py-2 text-right">Entrants</th>
                  <th className="py-2 text-right">Reach</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => {
                  const entrants = suppressSmallGroup(r.entrants);
                  const reach = suppressSmallGroup(r.reach);
                  return (
                    <tr key={r.challengeId} className="border-b border-line last:border-0">
                      <td className="py-3">
                        {r.title}
                        <span className="block text-xs text-mute">{r.game}</span>
                      </td>
                      <td className="py-3 text-mute">
                        {r.weekStart.toISOString().slice(0, 10)}
                      </td>
                      <td
                        className="py-3 text-right tabular-nums"
                        data-suppressed={entrants.show ? "false" : "true"}
                      >
                        {entrants.text}
                      </td>
                      <td
                        className="py-3 text-right tabular-nums"
                        data-suppressed={reach.show ? "false" : "true"}
                      >
                        {reach.text}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </Panel>

      <p className="text-xs text-mute" data-testid="floor-note">
        Anything under {MIN_AUDIENCE_GROUP} reads as &ldquo;fewer than {MIN_AUDIENCE_GROUP}
        &rdquo;. A count of three is three people somebody could name, and we will not
        hand that over — including to you about your own challenge.
      </p>
    </div>
  );
}
